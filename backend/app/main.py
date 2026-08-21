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
from typing import Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .agents.agent_manager import AgentManager, GroupChatManager
from .chat.websocket_manager import WebSocketManager
from .config import settings
from .database import init_db, get_db
from .services.model_service import ModelManagementService, ModelKeyEncryptor


# Global instances
agent_manager: Optional[AgentManager] = None
group_chat_manager: Optional[GroupChatManager] = None
ws_manager: Optional[WebSocketManager] = None
model_encryptor: Optional[ModelKeyEncryptor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global agent_manager, group_chat_manager, ws_manager, model_encryptor

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
    agent_manager = AgentManager(mock_mode=True)  # start in mock as safe default
    if settings.mock_mode is not True:
        db = next(get_db())
        try:
            service = ModelManagementService(db, model_encryptor)
            configs = service.get_all_configs()
            default = next((c for c in configs if c.default_model), None) or (
                configs[0] if configs else None
            )
            if default:
                api_key = service.get_decrypted_key(default.id)
                if api_key:
                    from .agents.agent_manager import build_model_client

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
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"⚠️ Failed to init real agent manager, falling back to mock: {e!r}")
        finally:
            db.close()
    else:
        print("ℹ️ mock_mode=True → running in MOCK mode")

    # Initialize default agents
    await agent_manager.initialize_default_agents()

    # Initialize group chat manager
    group_chat_manager = GroupChatManager(agent_manager)

    print("✅ AiCumi AG2 Backend started successfully")
    print(f"🤖 Agent count: {len(agent_manager.agents)}")
    for aid, info in agent_manager.agents.items():
        print(f"   - {info['name']} ({aid}) [{info['mode']}]")

    yield

    # Cleanup
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


# Pydantic models
class ChatMessage(BaseModel):
    """Chat message model."""
    content: str
    room_id: str
    room_type: str = "dm"  # "dm" or "group"
    mentions: Optional[List[str]] = None


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
    provider: str
    model_name: str
    api_key: str
    base_url: Optional[str] = None
    description: Optional[str] = None
    is_default: bool = False


class ModelConfigUpdate(BaseModel):
    """Model configuration update schema."""
    provider: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[str] = None


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


# Chat endpoints
@app.post("/api/chat/send")
async def send_message(message: ChatMessage):
    """Send a message to an agent or group."""
    if not agent_manager:
        raise HTTPException(status_code=500, detail="Agent manager not initialized")
    
    try:
        if message.room_type == "dm":
            # Direct message to single agent
            response = await agent_manager.send_message(
                agent_id=message.room_id,
                message=message.content,
            )
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
                message=message.content,
                mentions=message.mentions,
            )
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

                # Group room: stream each responding agent with its own messageId
                if group_chat_manager and room_id in group_chat_manager.group_chats:
                    try:
                        async for agent_id, chunk, message_id in group_chat_manager.stream_send(room_id, content, mentions):
                            await ws_manager.send_json(websocket, {
                                "type": "chat.chunk",
                                "roomId": room_id,
                                "messageId": message_id,
                                "content": chunk,
                                "agentId": agent_id,
                            })
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
                        # True streaming: relay token chunks as they arrive
                        chunks = []
                        async for chunk in agent_manager.stream_message(room_id, content):
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
                        await ws_manager.send_json(websocket, {
                            "type": "chat.done",
                            "roomId": room_id,
                            "messageId": message_id,
                            "fullContent": "".join(chunks),
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
                # For now, return empty history (DB persistence TODO)
                await ws_manager.send_json(websocket, {
                    "type": "chat.history",
                    "roomId": room_id,
                    "messages": [],
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


# Member management endpoints
@app.get("/api/members")
async def list_members():
    """List all members (agents)."""
    if not agent_manager:
        raise HTTPException(status_code=500, detail="Agent manager not initialized")
    
    members = []
    for agent_id, agent_info in agent_manager.agents.items():
        members.append({
            "id": agent_id,
            "name": agent_info.get("name", ""),
            "role": agent_info.get("role", "assistant"),
            "persona": agent_info.get("persona", ""),
        })
    return {"members": members}


# Skills management endpoints
@app.get("/api/skills")
async def list_skills():
    """List available skills."""
    # TODO: Implement skills management
    return {
        "skills": [
            {"id": "web_search", "name": "网络搜索", "description": "搜索互联网获取信息"},
            {"id": "file_read", "name": "文件读取", "description": "读取本地文件内容"},
            {"id": "file_write", "name": "文件写入", "description": "写入内容到文件"},
        ]
    }


# ---- Model Management API ----
@app.get("/api/models")
async def list_models(db: Session = Depends(get_db)):
    """List all model configurations (API keys are masked)."""
    service = ModelManagementService(db, model_encryptor)
    configs = service.get_all_configs()
    return {
        "models": [service.get_config(c.id) for c in configs]
    }


@app.post("/api/models")
async def create_model(data: ModelConfigCreate, db: Session = Depends(get_db)):
    """Add a new model configuration with encrypted API key."""
    service = ModelManagementService(db, model_encryptor)
    try:
        config = service.add_model_config(
            provider=data.provider,
            model_name=data.model_name,
            api_key=data.api_key,
            base_url=data.base_url,
            description=data.description,
            is_default=data.is_default,
        )
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
    """Test a model configuration by sending a simple prompt."""
    import time
    service = ModelManagementService(db, model_encryptor)
    config = service.get_config(model_id)
    if not config:
        raise HTTPException(status_code=404, detail="Model not found")

    api_key = service.get_decrypted_key(model_id)
    if not api_key:
        raise HTTPException(status_code=400, detail="Cannot decrypt API key")

    provider = config["provider"]
    model_name = config["model_name"]
    base_url = config.get("base_url")

    start = time.time()

    try:
        from openai import AsyncOpenAI
        client_kwargs = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url
        elif provider == "anthropic":
            client_kwargs["base_url"] = "https://api.anthropic.com/v1"

        client = AsyncOpenAI(**client_kwargs)
        resp = await client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": "Say 'hello' in one word."}],
            max_tokens=10,
        )
        reply = resp.choices[0].message.content.strip()
        latency = round((time.time() - start) * 1000)
        return {"status": "ok", "reply": reply, "latency_ms": latency}
    except Exception as e:
        latency = round((time.time() - start) * 1000)
        return {"status": "error", "error": str(e), "latency_ms": latency}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)