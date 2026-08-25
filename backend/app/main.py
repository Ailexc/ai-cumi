"""
AiCumi AG2 Backend - Main Application Entry Point

This is the main FastAPI application that serves as the backend for AiCumi.
It integrates AG2 for multi-agent orchestration and provides REST API and WebSocket endpoints.
"""

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .agents.agent_manager import AgentManager, GroupChatManager
from .api import members as members_router
from .api import skills as skills_router
from .api import staff as staff_router
from .api import channels as channels_router
from .cloud_space import router as cloud_space_router
from .knowledge import router as knowledge_router
from .settings import router as settings_router
from .docs import router as docs_router
from .chat.websocket_manager import WebSocketManager
from .config import settings
from .database import init_db, get_db
from .services.model_service import ModelManagementService, ModelKeyEncryptor
from .services.message_store import save_message, load_history, to_frontend_message
from . import state


# Global instances
agent_manager: Optional[AgentManager] = None
group_chat_manager: Optional[GroupChatManager] = None
ws_manager: Optional[WebSocketManager] = None
model_encryptor: Optional[ModelKeyEncryptor] = None
distributed_manager: Optional[Any] = None


def _make_distributed_factory(am: "AgentManager"):
    """Build agent instances for the distributed worker pool.

    Each worker hosts a DistributedProxyAgent that delegates execution to the
    shared agent manager (real model-backed assistant, or mock reply). This is
    the worker-executor pattern: the distributed gRPC topology / LB / health /
    failover is real, and agent execution reuses the proven in-process path.
    """
    from .distributed import DistributedProxyAgent, MockDistributedAgent

    async def executor(agent_id: str, message: str) -> str:
        return await am.send_message(agent_id, message)

    def factory(route_type: str, worker_id: str):
        # route_type may carry a replica suffix ("keling__r1") -> real agent id
        agent_id = route_type.split("__")[0]
        if agent_id not in am.agents:
            return None
        return DistributedProxyAgent(route_type, agent_id, executor)

    return factory


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global agent_manager, group_chat_manager, ws_manager, model_encryptor, distributed_manager

    # Initialize database
    init_db()

    # Initialize encryptor (persistent key from env or auto-generated + persisted)
    master_key = os.getenv("MODEL_MASTER_KEY")
    if not master_key:
        from .database import get_or_create_master_key
        master_key = get_or_create_master_key()
    model_encryptor = ModelKeyEncryptor(master_key=master_key)

    ws_manager = WebSocketManager()

    # Initialize agent manager:
    #   - mock_mode=True  → force mock
    #   - mock_mode=False/None → auto: real if a default model config exists
    from .agents.agent_manager import build_model_client
    from .models import MemberProfile, ModelConfig

    agent_manager = AgentManager(mock_mode=True)  # start in mock as safe default
    db = next(get_db())
    try:
        if settings.mock_mode is not True:
            service = ModelManagementService(db, model_encryptor)
            configs = service.get_all_configs()
            default = next((c for c in configs if c.default_model), None) or (
                configs[0] if configs else None
            )
            if default:
                api_key = service.get_decrypted_key(default.id)
                if api_key:
                    client = build_model_client(
                        provider=default.provider,
                        model_name=default.model_name,
                        api_key=api_key,
                        base_url=default.base_url,
                    )
                    agent_manager = AgentManager(mock_mode=False)
                    agent_manager.set_model_client(client, stream=True)
                    print(
                        f"✅ Real mode: default model "
                        f"{default.provider}/{default.model_name} "
                        f"({'base_url=' + default.base_url if default.base_url else 'official endpoint'})"
                    )
                else:
                    print("⚠️ Default model found but key cannot be decrypted → mock mode")
        else:
            print("ℹ️ mock_mode=True → running in MOCK mode")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"⚠️ Failed to init real agent manager, falling back to mock: {e!r}")

    # Initialize default agents
    await agent_manager.initialize_default_agents()

    # Re-apply per-agent model bindings persisted in member_profiles.model_id
    # (survives restarts; each bound agent gets its own model client).
    try:
        bound = db.query(MemberProfile).filter(MemberProfile.model_id.isnot(None)).all()
        for row in bound:
            if row.agent_id not in agent_manager.agents:
                continue
            config = db.get(ModelConfig, row.model_id)
            if not config:
                continue
            api_key = ModelManagementService(db, model_encryptor).get_decrypted_key(row.model_id)
            if not api_key:
                continue
            client = build_model_client(
                provider=config.provider,
                model_name=config.model_name,
                api_key=api_key,
                base_url=config.base_url,
            )
            agent_manager.agent_model_clients[row.agent_id] = client
            await agent_manager.rebuild_agent(row.agent_id)
    except Exception as e:
        print(f"⚠️ Failed to re-apply per-agent model bindings: {e}")

    # Initialize group chat manager
    group_chat_manager = GroupChatManager(agent_manager, db_session_factory=get_db)
    group_chat_manager.load_persisted_rooms()
    db.close()

    # Publish singletons to shared state for API routers
    state.agent_manager = agent_manager
    state.group_chat_manager = group_chat_manager
    state.ws_manager = ws_manager
    state.model_encryptor = model_encryptor

    # Initialize memory system with model service
    try:
        from .memory import init_memory
        memory_service = ModelManagementService(db, model_encryptor)
        init_memory(model_service=memory_service, persist_dir="data/memory")
        print("✅ Memory system initialized")
    except Exception as e:
        print(f"⚠️ Memory system init failed: {e}")

    # ---- Workflow engine: wire real handlers + SQLite persistence ----
    try:
        from .workflow import workflow_engine
        _register_workflow_handlers()
        workflow_engine.set_db(get_db)
        workflow_engine.set_ws_notifier(ws_manager.broadcast_json)
        workflow_engine.load_from_db()
        print("✅ Workflow engine wired (real handlers + SQLite persistence)")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"⚠️ Workflow engine wiring failed: {e}")

    # ---- Distributed agent runtime (P2: AG2 gRPC Worker Runtime) ----
    try:
        from .distributed import DistributedAgentManager
        distributed_manager = DistributedAgentManager()
        distributed_manager.set_agent_factory(_make_distributed_factory(agent_manager))
        started = await distributed_manager.start(list(agent_manager.agents.keys()))
        if started:
            state.distributed_manager = distributed_manager
            print(f"✅ Distributed runtime ready "
                  f"(host=localhost:{distributed_manager.host_port}, "
                  f"workers={distributed_manager.worker_count})")
        else:
            state.distributed_manager = None
            print("⚠️ Distributed runtime not started (no agents)")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"⚠️ Distributed runtime init failed (non-fatal): {e}")
        state.distributed_manager = None

    print("✅ AiCumi AG2 Backend started successfully")
    print(f"🤖 Agent count: {len(agent_manager.agents)}")
    for aid, info in agent_manager.agents.items():
        print(f"   - {info['name']} ({aid}) [{info['mode']}]")

    yield

    # Cleanup
    if distributed_manager:
        try:
            await distributed_manager.stop()
        except Exception as e:
            print(f"⚠️ Distributed runtime stop error: {e}")
    if agent_manager:
        await agent_manager.cleanup()
    print("👋 AiCumi AG2 Backend stopped")


# Create FastAPI app
app = FastAPI(
    title="AiCumi AG2 Backend",
    description="Backend API for AiCumi multi-agent collaboration platform",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(members_router.router)
app.include_router(skills_router.router)
app.include_router(staff_router.router)
app.include_router(channels_router.router)
app.include_router(cloud_space_router)
app.include_router(knowledge_router)
app.include_router(settings_router)
app.include_router(docs_router)


# Pydantic models
class KnowledgeScope(BaseModel):
    """Knowledge scope for RAG injection."""
    mode: str = "auto"  # auto | selected
    directory_ids: Optional[List[str]] = None


class ChatMessage(BaseModel):
    """Chat message model."""
    content: str
    room_id: str
    room_type: str = "dm"  # "dm" or "group"
    mentions: Optional[List[str]] = None
    knowledge_scope: Optional[KnowledgeScope] = None


class AgentCreate(BaseModel):
    """Agent creation model."""
    agent_id: str
    name: str
    persona: str
    role: str = "assistant"


class AgentResponse(BaseModel):
    """Agent response model."""
    agent_id: str
    name: str
    persona: str
    role: str
    status: str


# ---- Model Management Schemas ----
class ModelConfigCreate(BaseModel):
    """Model configuration creation schema."""
    model_type: str = "llm"  # llm/embedding/vision/search/code
    provider: str
    model_name: str
    api_key: str
    base_url: Optional[str] = None
    description: Optional[str] = None
    is_default: bool = False
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    # Capability / pricing fields
    embedding_dimensions: Optional[int] = None
    max_input_tokens: Optional[int] = None
    max_output_tokens: Optional[int] = None
    context_window: Optional[int] = None
    supports_vision: Optional[bool] = False
    supports_function_calling: Optional[bool] = False
    supports_streaming: Optional[bool] = True
    price_per_1k_input_tokens: Optional[float] = None
    price_per_1k_output_tokens: Optional[float] = None
    rate_limit_rpm: Optional[int] = None
    rate_limit_tpm: Optional[int] = None
    rate_limit_tpd: Optional[int] = None
    batch_size: Optional[int] = 32


class ModelConfigUpdate(BaseModel):
    """Model configuration update schema."""
    model_type: Optional[str] = None
    provider: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    embedding_dimensions: Optional[int] = None
    max_input_tokens: Optional[int] = None
    max_output_tokens: Optional[int] = None
    context_window: Optional[int] = None
    supports_vision: Optional[bool] = None
    supports_function_calling: Optional[bool] = None
    supports_streaming: Optional[bool] = None
    price_per_1k_input_tokens: Optional[float] = None
    price_per_1k_output_tokens: Optional[float] = None
    rate_limit_rpm: Optional[int] = None
    rate_limit_tpm: Optional[int] = None
    rate_limit_tpd: Optional[int] = None
    batch_size: Optional[int] = None


# Health check endpoint
@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "AiCumi AG2 Backend",
        "version": "1.0.0",
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "agents": len(agent_manager.agents) if agent_manager else 0,
        "active_connections": len(ws_manager.active_connections) if ws_manager else 0,
    }


# ---- Room / Agent list helpers (shared by WS + REST) ----


def build_agent_list() -> List[Dict]:
    """Build agent list payload for the frontend."""
    if not agent_manager:
        return []
    return [
        {"id": aid, "name": info.get("name", aid), "status": "running"}
        for aid, info in agent_manager.agents.items()
    ]


def build_room_list() -> List[Dict]:
    """Build the full room list (DM rooms per agent + group rooms)."""
    rooms = []
    if agent_manager:
        for aid, info in agent_manager.agents.items():
            rooms.append({
                "id": aid,
                "name": info.get("name", aid),
                "agentId": aid,
                "type": "dm",
                "createdAt": 0,
            })
    if group_chat_manager:
        for rid in group_chat_manager.group_chats:
            rooms.append(group_chat_manager.to_room(rid))
    return rooms


# Agent management endpoints
@app.post("/api/agents", response_model=AgentResponse)
async def create_agent(agent_data: AgentCreate):
    """Create a new agent."""
    if not agent_manager:
        raise HTTPException(status_code=500, detail="Agent manager not initialized")
    
    try:
        agent = await agent_manager.create_agent(
            agent_id=agent_data.agent_id,
            name=agent_data.name,
            persona=agent_data.persona,
            role=agent_data.role,
        )
        return AgentResponse(
            agent_id=agent_data.agent_id,
            name=agent_data.name,
            persona=agent_data.persona,
            role=agent_data.role,
            status="created",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/agents", response_model=List[AgentResponse])
async def list_agents():
    """List all agents."""
    if not agent_manager:
        raise HTTPException(status_code=500, detail="Agent manager not initialized")
    
    agents = []
    for agent_id, agent_info in agent_manager.agents.items():
        agents.append(AgentResponse(
            agent_id=agent_id,
            name=agent_info.get("name", ""),
            persona=agent_info.get("persona", ""),
            role=agent_info.get("role", "assistant"),
            status="active",
        ))
    return agents


@app.get("/api/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str):
    """Get agent by ID."""
    if not agent_manager:
        raise HTTPException(status_code=500, detail="Agent manager not initialized")
    
    agent_info = agent_manager.get_agent_info(agent_id)
    if not agent_info:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    
    return AgentResponse(
        agent_id=agent_id,
        name=agent_info.get("name", ""),
        persona=agent_info.get("persona", ""),
        role=agent_info.get("role", "assistant"),
        status="active",
    )


@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete an agent."""
    if not agent_manager:
        raise HTTPException(status_code=500, detail="Agent manager not initialized")
    
    try:
        await agent_manager.delete_agent(agent_id)
        return {"status": "deleted", "agent_id": agent_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


async def _build_rag_context(db: Session, query: str, scope: Optional[KnowledgeScope]) -> str:
    """Build RAG context from knowledge base for injection."""
    from .knowledge.rag_config import get_rag_settings, RagConfig
    from .knowledge.indexer import _get_embedding_provider
    from .knowledge.retriever import KnowledgeRetriever

    config = get_rag_settings(db)
    provider = _get_embedding_provider(db, model_encryptor, config)
    retriever = KnowledgeRetriever(
        provider=provider,
        persist_dir="data/memory",
        retrieval_mode=config.retrieval_mode,
        top_k=config.top_k,
        score_threshold=config.score_threshold,
        rerank_enabled=config.rerank_enabled,
        rerank_top_n=config.rerank_top_n,
    )

    where_filter = None
    if scope and scope.mode == "selected" and scope.directory_ids:
        where_filter = {"file_path": {"$in": scope.directory_ids}}

    results = await retriever.retrieve(query, where_filter=where_filter)
    if not results:
        return ""

    parts = []
    for i, r in enumerate(results):
        parts.append(f"[文档片段 {i+1}] 来源: {r.file_name} ({r.file_path})\n{r.content}")
    return "\n\n---\n\n".join(parts)


# Chat endpoints
@app.post("/api/chat/send")
async def send_message(message: ChatMessage):
    """Send a message to an agent or group."""
    if not agent_manager:
        raise HTTPException(status_code=500, detail="Agent manager not initialized")

    try:
        # Build optional RAG context
        rag_context = ""
        if message.knowledge_scope:
            db = next(get_db())
            try:
                rag_context = await _build_rag_context(db, message.content, message.knowledge_scope)
            finally:
                db.close()

        user_message = message.content
        if rag_context:
            user_message = (
                f"请基于以下知识库上下文回答问题。如果上下文中没有相关信息，请说明。\n\n"
                f"[知识库上下文]\n{rag_context}\n\n"
                f"[用户问题]\n{message.content}"
            )

        if message.room_type == "dm":
            # Load short-term history BEFORE persisting the current turn
            db = next(get_db())
            try:
                history_rows = load_history(db, message.room_id, limit=agent_manager.HISTORY_WINDOW_TURNS)
            finally:
                db.close()
            history = [{"role": m.role, "content": m.content} for m in history_rows]
            # Direct message to single agent
            response = await agent_manager.send_message(
                agent_id=message.room_id,
                message=user_message,
                conversation_history=history,
            )
            # Persist user + assistant messages
            db = next(get_db())
            try:
                save_message(db, message.room_id, "user", message.content, agent_id=message.room_id)
                save_message(db, message.room_id, "assistant", response, agent_id=message.room_id)
            finally:
                db.close()
            # Long-term memory: persist this exchange for future retrieval
            try:
                await agent_manager.save_exchange(message.room_id, message.content, response)
            except Exception as e:
                print(f"⚠️ REST save_exchange error: {e}")
            return {
                "status": "sent",
                "response": response,
                "room_id": message.room_id,
                "room_type": message.room_type,
            }
        elif message.room_type == "group":
            # Group chat
            if not group_chat_manager or message.room_id not in group_chat_manager.group_chats:
                raise HTTPException(status_code=404, detail=f"Group room {message.room_id} not found")
            response = await group_chat_manager.send_message(
                room_id=message.room_id,
                message=user_message,
                mentions=message.mentions,
            )
            # Persist user + each agent's reply
            db = next(get_db())
            try:
                save_message(db, message.room_id, "user", message.content, agent_id=None)
                for agent_id, reply in response.items():
                    save_message(db, message.room_id, "assistant", reply, agent_id=agent_id)
            finally:
                db.close()
            return {
                "status": "sent",
                "response": response,
                "room_id": message.room_id,
                "room_type": message.room_type,
            }
        else:
            raise HTTPException(status_code=400, detail=f"Invalid room type: {message.room_type}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# WebSocket endpoint (matches frontend protocol)
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint implementing AiCumi chat protocol."""
    if not ws_manager:
        await websocket.close(code=1011, detail="WebSocket manager not initialized")
        return
    
    await ws_manager.connect(websocket)

    # Send initial state on connect
    if agent_manager:
        agents = build_agent_list()
        rooms = build_room_list()
        print(f"📤 Sending agent.list: {len(agents)} agents, room.list: {len(rooms)} rooms")
        await ws_manager.send_json(websocket, {"type": "agent.list", "agents": agents})
        await ws_manager.send_json(websocket, {"type": "room.list", "rooms": rooms})

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")

            if msg_type == "ping":
                await ws_manager.send_json(websocket, {"type": "pong"})

            elif msg_type == "room.list":
                if agent_manager:
                    await ws_manager.send_json(websocket, {"type": "room.list", "rooms": build_room_list()})

            elif msg_type == "agent.list":
                if agent_manager:
                    await ws_manager.send_json(websocket, {"type": "agent.list", "agents": build_agent_list()})

            elif msg_type == "group.create":
                # Create a group chat room
                try:
                    room_id = "g-" + uuid.uuid4().hex[:8]
                    await group_chat_manager.create_group_chat(
                        room_id=room_id,
                        name=msg.get("name", "新群聊"),
                        agent_ids=msg.get("memberAgentIds", []),
                        owner_agent_id=msg.get("ownerAgentId"),
                    )
                    await ws_manager.send_json(websocket, {
                        "type": "room.created",
                        "room": group_chat_manager.to_room(room_id),
                    })
                    print(f"📤 room.created for group {room_id}")
                except Exception as e:
                    await ws_manager.send_json(websocket, {"type": "chat.error", "roomId": "", "error": f"创建群聊失败: {e}"})

            elif msg_type == "group.add-member":
                room_id = msg.get("roomId", "")
                agent_id = msg.get("agentId", "")
                try:
                    await group_chat_manager.add_member(room_id, agent_id)
                    await ws_manager.send_json(websocket, {"type": "room.list", "rooms": build_room_list()})
                except Exception as e:
                    await ws_manager.send_json(websocket, {"type": "chat.error", "roomId": room_id, "error": str(e)})

            elif msg_type == "chat.send":
                room_id = msg.get("roomId", "")
                content = msg.get("content", "")
                mentions = msg.get("mentions")
                knowledge_scope = msg.get("knowledgeScope")

                # Build optional RAG context for WS
                rag_context = ""
                if knowledge_scope:
                    db = next(get_db())
                    try:
                        from .knowledge.rag_config import get_rag_settings
                        from .knowledge.indexer import _get_embedding_provider
                        from .knowledge.retriever import KnowledgeRetriever
                        cfg = get_rag_settings(db)
                        prov = _get_embedding_provider(db, model_encryptor, cfg)
                        retriever = KnowledgeRetriever(
                            provider=prov,
                            persist_dir="data/memory",
                            retrieval_mode=cfg.retrieval_mode,
                            top_k=cfg.top_k,
                            score_threshold=cfg.score_threshold,
                            rerank_enabled=cfg.rerank_enabled,
                            rerank_top_n=cfg.rerank_top_n,
                        )
                        where_filter = None
                        if knowledge_scope.get("mode") == "selected" and knowledge_scope.get("directoryIds"):
                            where_filter = {"file_path": {"$in": knowledge_scope["directoryIds"]}}
                        results = await retriever.retrieve(content, where_filter=where_filter)
                        if results:
                            parts = [f"[文档片段 {i+1}] 来源: {r.file_name} ({r.file_path})\n{r.content}" for i, r in enumerate(results)]
                            rag_context = "\n\n---\n\n".join(parts)
                    finally:
                        db.close()

                enriched_content = content
                if rag_context:
                    enriched_content = (
                        f"请基于以下知识库上下文回答问题。如果上下文中没有相关信息，请说明。\n\n"
                        f"[知识库上下文]\n{rag_context}\n\n"
                        f"[用户问题]\n{content}"
                    )

                # Group room: stream each responding agent with its own messageId
                if group_chat_manager and room_id in group_chat_manager.group_chats:
                    try:
                        # Load short-term history BEFORE saving the current turn
                        db = next(get_db())
                        try:
                            history_rows = load_history(db, room_id, limit=agent_manager.HISTORY_WINDOW_TURNS if agent_manager else 10)
                        finally:
                            db.close()
                        history = [{"role": m.role, "content": m.content} for m in history_rows]
                        # Persist the user message
                        db = next(get_db())
                        try:
                            save_message(db, room_id, "user", content, agent_id=None)
                        finally:
                            db.close()
                        agent_replies: Dict[str, str] = {}
                        async for agent_id, chunk, message_id in group_chat_manager.stream_send(room_id, enriched_content, mentions, history=history):
                            agent_replies[agent_id] = agent_replies.get(agent_id, "") + chunk
                            await ws_manager.send_json(websocket, {
                                "type": "chat.chunk",
                                "roomId": room_id,
                                "messageId": message_id,
                                "content": chunk,
                                "agentId": agent_id,
                            })
                        # Persist each responding agent's full reply
                        db = next(get_db())
                        try:
                            for agent_id, reply in agent_replies.items():
                                save_message(db, room_id, "assistant", reply, agent_id=agent_id)
                        finally:
                            db.close()
                        # Group streaming is done; no single fullContent — client
                        # accumulates per-message chunks, so omit chat.done.
                    except Exception as e:
                        print(f"⚠️ group chat.send error: {e}")
                        await ws_manager.send_json(websocket, {
                            "type": "chat.error",
                            "roomId": room_id,
                            "error": str(e),
                        })
                elif agent_manager and room_id in agent_manager.agents:
                    try:
                        message_id = str(uuid.uuid4())
                        # Load short-term history BEFORE saving the current turn
                        db = next(get_db())
                        try:
                            history_rows = load_history(db, room_id, limit=agent_manager.HISTORY_WINDOW_TURNS)
                        finally:
                            db.close()
                        history = [{"role": m.role, "content": m.content} for m in history_rows]
                        # Persist the user message
                        db = next(get_db())
                        try:
                            save_message(db, room_id, "user", content, agent_id=room_id)
                        finally:
                            db.close()
                        # True streaming: relay token chunks as they arrive
                        chunks = []
                        thinking_sent = False
                        async for chunk in agent_manager.stream_message(room_id, enriched_content, history=history):
                            if chunk.startswith("__MEMORY__:"):
                                # Retrieved long-term memory -> chat.memory event
                                try:
                                    memories = json.loads(chunk[len("__MEMORY__:"):])
                                    await ws_manager.send_json(websocket, {
                                        "type": "chat.memory",
                                        "roomId": room_id,
                                        "messageId": message_id,
                                        "agentId": room_id,
                                        "memories": memories,
                                    })
                                except Exception:
                                    pass
                                continue
                            if chunk == "__THINKING__":
                                if not thinking_sent:
                                    thinking_sent = True
                                    await ws_manager.send_json(websocket, {
                                        "type": "chat.thinking",
                                        "roomId": room_id,
                                        "messageId": message_id,
                                        "agentId": room_id,
                                    })
                                continue
                            chunks.append(chunk)
                            await ws_manager.send_json(websocket, {
                                "type": "chat.chunk",
                                "roomId": room_id,
                                "messageId": message_id,
                                "content": chunk,
                                "agentId": room_id,
                            })

                        # Streaming done — send full content so the client can
                        # finalize (and persist / resend) the message.
                        full_content = "".join(chunks)
                        # Persist the assistant reply
                        db = next(get_db())
                        try:
                            save_message(db, room_id, "assistant", full_content, agent_id=room_id)
                        finally:
                            db.close()
                        # Long-term memory: save this exchange (fire-and-forget-safe await)
                        try:
                            await agent_manager.save_exchange(room_id, content, full_content)
                        except Exception as e:
                            print(f"⚠️ WS save_exchange error: {e}")
                        await ws_manager.send_json(websocket, {
                            "type": "chat.done",
                            "roomId": room_id,
                            "messageId": message_id,
                            "fullContent": full_content,
                            "agentId": room_id,
                        })
                    except Exception as e:
                        print(f"⚠️ chat.send error for {room_id}: {e}")
                        await ws_manager.send_json(websocket, {
                            "type": "chat.error",
                            "roomId": room_id,
                            "error": str(e),
                        })
                else:
                    await ws_manager.send_json(websocket, {
                        "type": "chat.error",
                        "roomId": room_id,
                        "error": f"Agent {room_id} not found",
                    })
            
            elif msg_type == "chat.history":
                room_id = msg.get("roomId", "")
                # Read history from the messages table
                db = next(get_db())
                try:
                    history = [to_frontend_message(m) for m in load_history(db, room_id, limit=200)]
                finally:
                    db.close()
                await ws_manager.send_json(websocket, {
                    "type": "chat.history",
                    "roomId": room_id,
                    "messages": history,
                })
            
            elif msg_type == "room.create":
                # Create a new DM room (just acknowledge)
                await ws_manager.send_json(websocket, {
                    "type": "room.created",
                    "room": {
                        "id": msg.get("agentId", "unknown"),
                        "name": msg.get("name", ""),
                        "agentId": msg.get("agentId", ""),
                        "type": "dm",
                        "createdAt": 0,
                    },
                })
            
            else:
                await ws_manager.send_json(websocket, {
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                })
    
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)


# Room management endpoints
@app.get("/api/rooms")
async def list_rooms():
    """List all rooms (DM + group)."""
    return {"rooms": build_room_list()}


@app.post("/api/rooms")
async def create_room(room_data: dict):
    """Create a new room."""
    # TODO: Implement room creation
    return {"status": "created", "room": room_data}


# ---- Model Management API ----
def _model_payload_with_name(config: dict) -> dict:
    """Add a display `name` field (frontend model switcher uses {id, name})."""
    payload = dict(config)
    payload["name"] = f"{payload.get('provider', '')} · {payload.get('model_name', '')}"
    return payload


@app.get("/api/models")
async def list_models(model_type: Optional[str] = None, db: Session = Depends(get_db)):
    """List all model configurations (API keys are masked)."""
    service = ModelManagementService(db, model_encryptor)
    configs = service.get_all_configs(model_type=model_type)
    return {
        "ok": True,
        "models": [_model_payload_with_name(service.get_config(c.id)) for c in configs]
    }


@app.get("/api/models/by-type")
async def list_models_by_type(db: Session = Depends(get_db)):
    """List all model configurations grouped by type."""
    service = ModelManagementService(db, model_encryptor)
    by_type = service.get_all_by_type()
    return {
        "ok": True,
        "models_by_type": by_type,
        "types": list(by_type.keys()),
    }


@app.post("/api/models")
async def create_model(data: ModelConfigCreate, db: Session = Depends(get_db)):
    """Add a new model configuration with encrypted API key."""
    service = ModelManagementService(db, model_encryptor)
    try:
        config = service.add_model_config(**data.dict())
        return service.get_config(config.id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/models/{model_id}")
async def get_model(model_id: int, db: Session = Depends(get_db)):
    """Get a single model configuration."""
    service = ModelManagementService(db, model_encryptor)
    result = service.get_config(model_id)
    if not result:
        raise HTTPException(status_code=404, detail="Model not found")
    return result


@app.put("/api/models/{model_id}")
async def update_model(model_id: int, data: ModelConfigUpdate, db: Session = Depends(get_db)):
    """Update a model configuration."""
    service = ModelManagementService(db, model_encryptor)
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    # If api_key is being updated, encrypt it
    if "api_key" in update_data:
        update_data["api_key_encrypted"] = model_encryptor.encrypt(update_data.pop("api_key"))
    
    result = service.update_model_config(model_id, **update_data)
    if not result:
        raise HTTPException(status_code=404, detail="Model not found")
    return service.get_config(model_id)


@app.delete("/api/models/{model_id}")
async def delete_model(model_id: int, db: Session = Depends(get_db)):
    """Delete a model configuration."""
    service = ModelManagementService(db, model_encryptor)
    if not service.delete_config(model_id):
        raise HTTPException(status_code=404, detail="Model not found")
    return {"status": "deleted", "id": model_id}


@app.post("/api/models/{model_id}/test")
async def test_model(model_id: int, db: Session = Depends(get_db)):
    """Test a model configuration (dispatched by model_type via model_tester)."""
    import time
    service = ModelManagementService(db, model_encryptor)
    config = service.get_config(model_id)
    if not config:
        raise HTTPException(status_code=404, detail="Model not found")

    api_key = service.get_decrypted_key(model_id)
    if not api_key:
        raise HTTPException(status_code=400, detail="Cannot decrypt API key")

    from .services.model_tester import run_model_test
    return await run_model_test(
        model_type=config.get("model_type", "llm"),
        api_key=api_key,
        config=config,
        start=time.time(),
    )


# ---- Tool Management API ----

class ToolBindRequest(BaseModel):
    """Tool binding request schema."""
    tool_names: List[str]


@app.get("/api/tools")
async def list_tools(category: Optional[str] = None):
    """List all available tools."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    tools = agent_manager.list_tools(category)
    return {
        "ok": True,
        "tools": tools,
        "count": len(tools),
    }


@app.get("/api/tools/{tool_name}")
async def get_tool(tool_name: str):
    """Get tool details by name."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    tool = agent_manager.get_tool(tool_name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
    
    return {"ok": True, "tool": tool}


@app.post("/api/tools/{tool_name}/enable")
async def enable_tool(tool_name: str):
    """Enable a tool."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    success = agent_manager.enable_tool(tool_name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
    
    return {"ok": True, "message": f"Tool '{tool_name}' enabled"}


@app.post("/api/tools/{tool_name}/disable")
async def disable_tool(tool_name: str):
    """Disable a tool."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    success = agent_manager.disable_tool(tool_name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
    
    return {"ok": True, "message": f"Tool '{tool_name}' disabled"}


@app.get("/api/agents/{agent_id}/tools")
async def get_agent_tools(agent_id: str):
    """Get tools bound to an agent."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    tool_names = agent_manager.get_agent_tools(agent_id)
    tools = []
    for name in tool_names:
        tool = agent_manager.get_tool(name)
        if tool:
            tools.append(tool)
    
    return {
        "ok": True,
        "agent_id": agent_id,
        "tools": tools,
        "tool_names": tool_names,
    }


@app.post("/api/agents/{agent_id}/tools")
async def bind_agent_tools(agent_id: str, request: ToolBindRequest):
    """Bind tools to an agent."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    success = agent_manager.bind_tools(agent_id, request.tool_names)
    if not success:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    
    return {
        "ok": True,
        "message": f"Tools bound to agent '{agent_id}'",
        "tool_names": request.tool_names,
    }


@app.delete("/api/agents/{agent_id}/tools")
async def unbind_agent_tools(agent_id: str):
    """Unbind all tools from an agent."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    success = agent_manager.unbind_tools(agent_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    
    return {
        "ok": True,
        "message": f"Tools unbound from agent '{agent_id}'",
    }


@app.post("/api/tools/{tool_name}/execute")
async def execute_tool(tool_name: str, params: Dict[str, Any] = {}):
    """Execute a tool directly (for testing)."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    from .tools.registry import tool_registry
    
    try:
        result = tool_registry.execute(tool_name, **params)
        return {
            "ok": True,
            "tool": tool_name,
            "result": result,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tool execution failed: {str(e)}")


# ---- Memory API ----

class MemoryAddRequest(BaseModel):
    """Memory add request schema."""
    content: str
    memory_type: str = "conversation"
    metadata: Optional[Dict[str, Any]] = None


class MemorySearchRequest(BaseModel):
    """Memory search request schema."""
    query: str
    n_results: int = 5
    memory_type: Optional[str] = None


@app.get("/api/memory/stats")
async def get_memory_stats():
    """Get memory system statistics."""
    from .memory import vector_memory
    stats = vector_memory.stats()
    return {"ok": True, "stats": stats}


@app.post("/api/memory/{agent_id}/add")
async def add_memory(agent_id: str, request: MemoryAddRequest):
    """Add a memory entry for an agent."""
    from .memory import vector_memory
    
    entry = vector_memory.add(
        content=request.content,
        agent_id=agent_id,
        memory_type=request.memory_type,
        metadata=request.metadata,
    )
    
    return {"ok": True, "memory": entry.to_dict()}


@app.post("/api/memory/{agent_id}/search")
async def search_memory(agent_id: str, request: MemorySearchRequest):
    """Search agent memories."""
    from .memory import vector_memory
    
    results = vector_memory.search(
        query=request.query,
        agent_id=agent_id,
        memory_type=request.memory_type,
        n_results=request.n_results,
    )
    
    return {
        "ok": True,
        "results": [r.to_dict() for r in results],
        "count": len(results),
    }


@app.get("/api/memory/{agent_id}/list")
async def list_memories(agent_id: str, limit: int = 50):
    """List all memories for an agent."""
    from .memory import vector_memory
    
    results = vector_memory.get_by_agent(agent_id, limit=limit)
    
    return {
        "ok": True,
        "memories": [r.to_dict() for r in results],
        "count": len(results),
    }


@app.delete("/api/memory/{memory_id}")
async def delete_memory(memory_id: str):
    """Delete a memory entry."""
    from .memory import vector_memory
    
    success = vector_memory.delete(memory_id)
    if not success:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    return {"ok": True, "message": "Memory deleted"}


@app.post("/api/memory/{agent_id}/clear")
async def clear_memories(agent_id: str):
    """Clear all memories for an agent."""
    from .memory import vector_memory
    
    count = vector_memory.clear(agent_id)
    
    return {"ok": True, "cleared": count}


# ---- Human-in-the-Loop API ----

class ApprovalResolveRequest(BaseModel):
    """Approval resolve request schema."""
    status: str  # "approved" or "rejected"
    response: Optional[str] = None


@app.get("/api/approval/pending")
async def get_pending_approvals(agent_id: Optional[str] = None):
    """Get pending approval requests."""
    from .approval import approval_manager
    
    requests = approval_manager.get_pending_requests(agent_id)
    return {
        "ok": True,
        "requests": [r.to_dict() for r in requests],
        "count": len(requests),
    }


@app.get("/api/approval/history")
async def get_approval_history(agent_id: Optional[str] = None, limit: int = 50):
    """Get approval history."""
    from .approval import approval_manager
    
    history = approval_manager.get_history(agent_id, limit)
    return {
        "ok": True,
        "history": [r.to_dict() for r in history],
        "count": len(history),
    }


@app.post("/api/approval/{request_id}/resolve")
async def resolve_approval(request_id: str, request: ApprovalResolveRequest):
    """Resolve an approval request."""
    from .approval import approval_manager, ApprovalStatus
    
    status_map = {
        "approved": ApprovalStatus.APPROVED,
        "rejected": ApprovalStatus.REJECTED,
    }
    
    status = status_map.get(request.status)
    if not status:
        raise HTTPException(status_code=400, detail="Invalid status, use 'approved' or 'rejected'")
    
    result = await approval_manager.resolve_request(
        request_id=request_id,
        status=status,
        response=request.response,
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Request not found")
    
    return {"ok": True, "request": result.to_dict()}


@app.get("/api/approval/stats")
async def get_approval_stats():
    """Get approval statistics."""
    from .approval import approval_manager
    
    stats = approval_manager.get_stats()
    return {"ok": True, "stats": stats}


# ---- Tracing API ----

@app.get("/api/tracing/stats")
async def get_tracing_stats():
    """Get tracing statistics."""
    from .tracing import tracing_system
    stats = tracing_system.get_stats()
    return {"ok": True, "stats": stats}


@app.get("/api/tracing/traces")
async def get_traces(agent_id: Optional[str] = None, limit: int = 50):
    """Get execution traces."""
    from .tracing import tracing_system
    traces = tracing_system.get_traces(agent_id, limit)
    return {
        "ok": True,
        "traces": [t.to_dict() for t in traces],
        "count": len(traces),
    }


@app.get("/api/tracing/traces/{trace_id}")
async def get_trace(trace_id: str):
    """Get a specific trace by ID."""
    from .tracing import tracing_system
    trace = tracing_system.get_trace(trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return {"ok": True, "trace": trace.to_dict()}


# ---- Distributed Agent API (P2: AG2 gRPC Worker Runtime) ----

class DistributedSendRequest(BaseModel):
    """Dispatch a message to an agent through the distributed worker runtime."""
    agent_id: str
    message: str


def _require_distributed() -> Any:
    if not state.distributed_manager or not state.distributed_manager.enabled:
        raise HTTPException(status_code=503, detail="分布式 Worker Runtime 未启用")
    return state.distributed_manager


@app.get("/api/distributed/status")
async def distributed_status():
    """Get the distributed runtime topology + worker health + LB stats."""
    dm = _require_distributed()
    return {"ok": True, "status": dm.get_status()}


@app.get("/api/distributed/agents")
async def distributed_agents():
    """List which agents are registered on which worker (distribution + replicas)."""
    dm = _require_distributed()
    status = dm.get_status()
    return {"ok": True, "agents": status["agents"], "stats": status["stats"]}


@app.post("/api/distributed/send")
async def distributed_send(request: DistributedSendRequest):
    """Dispatch a real message to an agent through the gRPC worker runtime.

    Demonstrates remote invocation + load balancing (round-robin across
    replicas) + automatic failover when a worker is down.
    """
    dm = _require_distributed()
    try:
        import time
        t0 = time.time()
        reply = await dm.send_message(request.agent_id, request.message)
        return {
            "ok": True,
            "agent_id": request.agent_id,
            "response": reply,
            "latency_ms": round((time.time() - t0) * 1000, 1),
            "stats": dm.get_status()["stats"],
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分布式调用失败: {e}")


@app.post("/api/distributed/workers/{worker_id}/down")
async def distributed_worker_down(worker_id: str):
    """Simulate a worker crash → triggers failover of its agents."""
    dm = _require_distributed()
    ok = await dm.mark_worker_down(worker_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Worker {worker_id} not found")
    return {"ok": True, "message": f"Worker {worker_id} 已下线（触发故障转移）",
            "status": dm.get_status()}


@app.post("/api/distributed/workers/{worker_id}/up")
async def distributed_worker_up(worker_id: str):
    """Restart a stopped worker and re-register its agents."""
    dm = _require_distributed()
    ok = await dm.recover_worker(worker_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Worker {worker_id} 恢复失败")
    return {"ok": True, "message": f"Worker {worker_id} 已恢复", "status": dm.get_status()}


@app.post("/api/distributed/rebuild")
async def distributed_rebuild():
    """Rebuild the worker pool and re-register all current agents."""
    dm = _require_distributed()
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    await dm.rebuild(list(agent_manager.agents.keys()))
    return {"ok": True, "message": "分布式运行时已重建", "status": dm.get_status()}


# ---- Workflow API ----

class WorkflowCreateRequest(BaseModel):
    """Workflow creation request schema (DAG: nodes + edges)."""
    name: str
    description: Optional[str] = None
    nodes: Optional[List[Dict[str, Any]]] = None
    edges: Optional[List[Dict[str, Any]]] = None


class WorkflowUpdateRequest(BaseModel):
    """Workflow update request schema."""
    name: Optional[str] = None
    description: Optional[str] = None
    nodes: Optional[List[Dict[str, Any]]] = None
    edges: Optional[List[Dict[str, Any]]] = None


class WorkflowExecuteRequest(BaseModel):
    """Workflow execution request schema."""
    initial_input: Optional[Any] = None
    background: Optional[bool] = False


class WorkflowFromTemplateRequest(BaseModel):
    """Create a workflow from a built-in template."""
    template_id: str
    name: Optional[str] = None


# ---- Built-in workflow templates ----
WORKFLOW_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "research-report",
        "name": "调研 → 分析 → 报告",
        "description": "先搜索信息，再由研究 Agent 分析，最后由报告 Agent 生成报告",
        "nodes": [
            {"id": "search", "name": "搜索信息", "node_type": "tool_call",
             "config": {"tool_name": "web_search",
                         "params": {"query": "{{ input }}", "num_results": 3}},
             "position": {"x": 0, "y": 0}},
            {"id": "analyze", "name": "分析数据", "node_type": "agent_call",
             "config": {"agent_id": "xiaoyan",
                         "prompt": "请基于以下搜索材料提炼要点并给出分析：\n{{ input.response }}"},
             "position": {"x": 320, "y": 0}},
            {"id": "report", "name": "生成报告", "node_type": "agent_call",
             "config": {"agent_id": "keling",
                         "prompt": "请根据分析结果撰写一份结构化报告：\n{{ input.response }}"},
             "position": {"x": 640, "y": 0}},
        ],
        "edges": [
            {"id": "e1", "source": "search", "target": "analyze"},
            {"id": "e2", "source": "analyze", "target": "report"},
        ],
    },
    {
        "id": "content-approval",
        "name": "内容审核发布",
        "description": "生成内容 → 敏感判断（条件分支）→ 人工审核 → 发布/拦截",
        "nodes": [
            {"id": "gen", "name": "生成内容", "node_type": "agent_call",
             "config": {"agent_id": "keling",
                         "prompt": "根据主题写一篇 150 字以内的短文：\n{{ input }}"},
             "position": {"x": 0, "y": 40}},
            {"id": "check", "name": "敏感判断", "node_type": "condition",
             "config": {"expression": "\"敏感\" in data[\"response\"] or \"违规\" in data[\"response\"]"},
             "position": {"x": 320, "y": 40}},
            {"id": "review", "name": "人工审核", "node_type": "human_review",
             "config": {"description": "内容疑似敏感，请人工审核后决定是否发布",
                         "params": {"action": "publish"}},
             "position": {"x": 640, "y": -60}},
            {"id": "pub", "name": "发布", "node_type": "transform",
             "config": {"template": "✅ 已发布（敏感判断：{{ input.result }}）"},
             "position": {"x": 960, "y": -60}},
            {"id": "drop", "name": "拦截", "node_type": "transform",
             "config": {"template": "⛔ 已拦截（敏感判断：{{ input.result }}）"},
             "position": {"x": 960, "y": 120}},
        ],
        "edges": [
            {"id": "e1", "source": "gen", "target": "check"},
            {"id": "e2", "source": "check", "target": "review",
             "condition": "data[\"result\"] == true"},
            {"id": "e3", "source": "check", "target": "drop",
             "condition": "data[\"result\"] == false"},
            {"id": "e4", "source": "review", "target": "pub"},
        ],
    },
    {
        "id": "code-review",
        "name": "代码评审",
        "description": "生成代码 → 技术评审 → 人工确认 → 输出结论",
        "nodes": [
            {"id": "gen", "name": "生成代码", "node_type": "agent_call",
             "config": {"agent_id": "xiaoma",
                         "prompt": "根据需求用 Python 写一段示例代码：\n{{ input }}"},
             "position": {"x": 0, "y": 80}},
            {"id": "review", "name": "技术评审", "node_type": "agent_call",
             "config": {"agent_id": "xiaoyan",
                         "prompt": "请评审以下代码，指出问题与改进建议：\n{{ input.response }}"},
             "position": {"x": 320, "y": 80}},
            {"id": "approve", "name": "人工确认", "node_type": "human_review",
             "config": {"description": "请确认是否认可本次代码评审结论"},
             "position": {"x": 640, "y": 80}},
            {"id": "done", "name": "完成", "node_type": "transform",
             "config": {"template": "✅ 评审通过：{{ input.response }}"},
             "position": {"x": 960, "y": 80}},
        ],
        "edges": [
            {"id": "e1", "source": "gen", "target": "review"},
            {"id": "e2", "source": "review", "target": "approve"},
            {"id": "e3", "source": "approve", "target": "done"},
        ],
    },
]


WORKFLOW_TEMPLATE_IDS = {t["id"] for t in WORKFLOW_TEMPLATES}


def _register_workflow_handlers():
    """Wire the workflow engine to the real agent manager, tool registry & HITL."""
    from .workflow import workflow_engine, StepType, evaluate_condition, render_template, _stringify
    from .tools.registry import tool_registry

    async def agent_handler(input_data, config):
        agent_id = config.get("agent_id")
        if not agent_id:
            raise ValueError("agent_call 节点缺少 config.agent_id")
        prompt = config.get("prompt", "")
        message = _stringify(input_data)
        if prompt:
            message = render_template(prompt, input_data, {}) + "\n\n" + message
        return {"response": await agent_manager.send_message(agent_id, message)}

    async def tool_handler(input_data, config):
        tool_name = config.get("tool_name")
        if not tool_name:
            raise ValueError("tool_call 节点缺少 config.tool_name")
        params = dict(config.get("params") or {})
        for k, v in list(params.items()):
            if isinstance(v, str) and "{{" in v:
                params[k] = render_template(v, input_data, {})
        try:
            result = tool_registry.execute(tool_name, **params)
        except Exception as e:
            raise ValueError(f"工具 {tool_name} 执行失败: {e}")
        return {"result": result, "tool": tool_name, "params": params}

    async def condition_handler(input_data, config):
        expr = config.get("expression", "data")
        return {"result": evaluate_condition(expr, input_data, {})}

    async def transform_handler(input_data, config):
        template = config.get("template")
        if template:
            return render_template(template, input_data, {})
        mapping = config.get("mapping") or {}
        out = {}
        for key, tpl in mapping.items():
            out[key] = render_template(str(tpl), input_data, {}) if isinstance(tpl, str) else tpl
        return out

    async def human_review_handler(input_data, config):
        from .approval import approval_manager
        request = await approval_manager.request_approval(
            agent_id=config.get("agent_id", "workflow"),
            action="workflow_step",
            description=config.get("description", "工作流执行到人工审核节点"),
            params={"input": input_data, **(config.get("params") or {})},
            timeout=int(config.get("timeout", 3600)),
            auto_approve=bool(config.get("auto_approve", False)),
        )
        wait_timeout = int(config.get("wait_timeout", 3600))
        resolved = await approval_manager.wait_for_approval(request.id, timeout=wait_timeout)
        return {
            "approval_id": request.id,
            "status": resolved.status.value,
            "response": resolved.response,
        }

    workflow_engine.register_handlers({
        StepType.AGENT_CALL: agent_handler,
        StepType.TOOL_CALL: tool_handler,
        StepType.CONDITION: condition_handler,
        StepType.TRANSFORM: transform_handler,
        StepType.HUMAN_REVIEW: human_review_handler,
    })


@app.get("/api/workflows")
async def list_workflows(limit: int = 100):
    """List all workflows."""
    from .workflow import workflow_engine
    workflows = workflow_engine.get_workflows(limit)
    return {"ok": True, "workflows": [w.to_dict() for w in workflows], "count": len(workflows)}


@app.post("/api/workflows")
async def create_workflow(request: WorkflowCreateRequest):
    """Create a new workflow (DAG nodes + edges)."""
    from .workflow import workflow_engine
    workflow = workflow_engine.create_workflow(
        name=request.name,
        description=request.description or "",
        nodes=request.nodes,
        edges=request.edges,
    )
    return {"ok": True, "workflow": workflow.to_dict()}


@app.put("/api/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, request: WorkflowUpdateRequest):
    """Update a workflow definition (edit/save from the visual editor)."""
    from .workflow import workflow_engine
    workflow = workflow_engine.update_workflow(
        workflow_id=workflow_id,
        name=request.name,
        description=request.description,
        nodes=request.nodes,
        edges=request.edges,
    )
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"ok": True, "workflow": workflow.to_dict()}


@app.delete("/api/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """Delete a workflow."""
    from .workflow import workflow_engine
    if not workflow_engine.delete_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"ok": True, "message": "Workflow deleted"}


@app.post("/api/workflows/{workflow_id}/duplicate")
async def duplicate_workflow(workflow_id: str):
    """Duplicate a workflow."""
    from .workflow import workflow_engine
    workflow = workflow_engine.duplicate_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"ok": True, "workflow": workflow.to_dict()}


@app.get("/api/workflow-templates")
async def list_workflow_templates():
    """List built-in workflow templates."""
    return {"ok": True, "templates": WORKFLOW_TEMPLATES, "count": len(WORKFLOW_TEMPLATES)}


@app.post("/api/workflows/from-template")
async def create_from_template(request: WorkflowFromTemplateRequest):
    """Create a workflow from a built-in template."""
    from .workflow import workflow_engine
    template = next((t for t in WORKFLOW_TEMPLATES if t["id"] == request.template_id), None)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    id_map = {n["id"]: str(uuid.uuid4()) for n in template["nodes"]}
    nodes = []
    for n in template["nodes"]:
        node = dict(n)
        node["id"] = id_map[node["id"]]
        nodes.append(node)
    edges = []
    for e in template["edges"]:
        edge = dict(e)
        edge["id"] = str(uuid.uuid4())
        edge["source"] = id_map.get(edge["source"], edge["source"])
        edge["target"] = id_map.get(edge["target"], edge["target"])
        edges.append(edge)
    workflow = workflow_engine.create_workflow(
        name=request.name or template["name"],
        description=template["description"],
        nodes=nodes,
        edges=edges,
    )
    return {"ok": True, "workflow": workflow.to_dict()}


@app.get("/api/workflows/stats")
async def get_workflow_stats():
    """Get workflow statistics."""
    from .workflow import workflow_engine
    stats = workflow_engine.get_stats()
    return {"ok": True, "stats": stats}


@app.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str):
    """Get a workflow by ID."""
    from .workflow import workflow_engine
    workflow = workflow_engine.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"ok": True, "workflow": workflow.to_dict()}


@app.get("/api/workflows/{workflow_id}/runs")
async def get_workflow_runs(workflow_id: str, limit: int = 50):
    """Get execution history for a workflow."""
    from .workflow import workflow_engine
    runs = workflow_engine.get_runs(workflow_id, limit)
    return {"ok": True, "runs": [r.to_dict() for r in runs], "count": len(runs)}


@app.post("/api/workflows/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, request: WorkflowExecuteRequest):
    """Execute a workflow (sync, or background for live progress polling)."""
    from .workflow import workflow_engine
    try:
        if request.background:
            asyncio.create_task(
                workflow_engine.execute_workflow(workflow_id, request.initial_input)
            )
            return {"ok": True, "background": True,
                    "message": "工作流已在后台启动，可轮询 /api/workflows/{id} 查看进度"}
        workflow = await workflow_engine.execute_workflow(
            workflow_id=workflow_id,
            initial_input=request.initial_input,
        )
        return {"ok": True, "workflow": workflow.to_dict()}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Execution failed: {str(e)}")


@app.post("/api/workflows/{workflow_id}/cancel")
async def cancel_workflow(workflow_id: str):
    """Cancel a running workflow."""
    from .workflow import workflow_engine
    success = workflow_engine.cancel_workflow(workflow_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot cancel workflow")
    return {"ok": True, "message": "Workflow cancelled"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)