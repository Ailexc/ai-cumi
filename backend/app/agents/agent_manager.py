"""
Agent Manager for AiCumi AG2 Backend.

Manages AG2 agents with real model binding (via Model Management) and mock fallback.

Design (P0):
- AgentManager holds an optional shared model client (built from the default ModelConfig).
- Agents are created in "real" mode when a model client is available and not forced to mock;
  otherwise they fall back to "mock" mode (deterministic canned replies).
- `stream_message()` yields token chunks for real-time streaming (used by WebSocket).
- `send_message()` returns the full reply (used by REST API).

P0 streaming API (verified on ag2 1.0.2 / autogen-agentchat 0.7.5):
    AssistantAgent(..., model_client_stream=True)
    async for event in agent.on_messages_stream([TextMessage(...)], CancellationToken()):
        if isinstance(event, ModelClientStreamingChunkEvent):  # incremental token chunk
            ...
        # final event is a Response whose .chat_message.content holds the full reply
"""

import asyncio
import json
import os
import uuid
from typing import Dict, List, Optional, Any, AsyncGenerator
from datetime import datetime

# ---- AG2 imports (with mock fallback) ----
try:
    from autogen_agentchat.agents import AssistantAgent
    from autogen_agentchat.messages import TextMessage, ModelClientStreamingChunkEvent
    from autogen_ext.models.openai import OpenAIChatCompletionClient
    from autogen_core import CancellationToken
    from autogen_core.models import ModelInfo, ModelFamily
    HAS_REAL_AGENT = True
except ImportError:
    HAS_REAL_AGENT = False

# Import tool registry
from ..tools.registry import tool_registry
from ..tools.builtin import register_builtin_tools


# Default model info for unknown/custom model names (used when the client cannot
# resolve model_info automatically, e.g. self-hosted / fake endpoints).
DEFAULT_MODEL_INFO = ModelInfo(
    vision=False,
    function_calling=True,
    json_output=True,
    structured_output=True,
    family=ModelFamily.UNKNOWN,
    token_limit=4096,
)


def build_model_client(
    provider: str,
    model_name: str,
    api_key: str,
    base_url: Optional[str] = None,
):
    """Build an AG2 model client from a stored model config.

    Supports any OpenAI-compatible endpoint (openai / deepseek / moonshot /
    zhipu / custom self-hosted...) via `base_url`. Anthropic uses its native
    client when `autogen-ext[anthropic]` is installed, otherwise falls back to
    an OpenAI-compatible endpoint.
    """
    if not HAS_REAL_AGENT:
        raise RuntimeError("AG2 packages are not installed")

    if provider == "anthropic":
        try:
            from autogen_ext.models.anthropic import AnthropicChatCompletionClient
            return AnthropicChatCompletionClient(model=model_name, api_key=api_key)
        except ImportError:
            pass  # fall through to OpenAI-compatible endpoint

    kwargs = {"model": model_name, "api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    try:
        return OpenAIChatCompletionClient(**kwargs)
    except ValueError:
        # Unknown model name → provide model_info explicitly
        return OpenAIChatCompletionClient(model=model_name, api_key=api_key, base_url=base_url, model_info=DEFAULT_MODEL_INFO) if base_url \
            else OpenAIChatCompletionClient(model=model_name, api_key=api_key, model_info=DEFAULT_MODEL_INFO)


class MockLLMClient:
    """Mock LLM client that simulates responses without API calls."""

    def __init__(self, model_name: str = "mock-model"):
        self.model_name = model_name

    async def complete(self, prompt: str, system_message: str = "") -> str:
        """Simulate an LLM response."""
        await asyncio.sleep(0.5)  # Simulate network delay
        return f"[Mock] {prompt}"


class AgentManager:
    """Manages AG2 agents and their interactions."""

    def __init__(self, mock_mode: bool = True):
        """Initialize the agent manager.

        Args:
            mock_mode: If True, agents run in mock mode (no real LLM calls).
                If False and a model client is set via set_model_client(),
                agents run against the real model.
        """
        self.mock_mode = mock_mode
        self.agents: Dict[str, Dict[str, Any]] = {}
        self.agent_instances: Dict[str, Any] = {}  # Real AG2 agents in real mode, None in mock
        self.model_client: Optional[Any] = None
        self.model_client_stream: bool = True
        self.agent_model_clients: Dict[str, Any] = {}  # per-agent model client override

        # Long-term memory integration (dynamic retrieval + auto-save).
        self.memory_enabled = os.getenv("MEMORY_ENABLED", "true").lower() not in ("false", "0", "")

        # Initialize built-in tools
        register_builtin_tools()

        # Persona templates (for display/UI reference)
        self.persona_templates = {
            "assistant": "你是一个贴心的助理，善于理解用户需求，提供周到的服务。",
            "executor": "你是一个高效的执行者，专注于完成任务，注重细节和效率。",
            "partner": "你是一个幽默的伙伴，善于用轻松的方式交流，让对话充满乐趣。",
            "advisor": "你是一个沉稳的顾问，善于分析问题，提供深思熟虑的建议。",
            "direct": "你是一个犀利直率的交流者，直接表达观点，不绕弯子。",
        }

        # Default agents
        self.default_agents = {
            "keling": {
                "name": "可灵",
                "role": "前台秘书",
                "persona": "你是可灵，一个贴心的前台秘书。你善于理解用户需求，提供周到的服务。你说话温和友善，总是面带微笑。",
                "template": "assistant",
                "tools": ["web_search", "datetime_utils"],
            },
            "xiaoyan": {
                "name": "小研",
                "role": "调研专员",
                "persona": "你是小研，一个专业的调研专员。你善于收集和分析信息，提供深入的研究报告。你说话严谨专业，注重数据和事实。",
                "template": "advisor",
                "tools": ["web_search", "json_parse", "datetime_utils"],
            },
            "xiaoma": {
                "name": "小码",
                "role": "技术专家",
                "persona": "你是小码，一个技术专家。你善于解决技术问题，提供代码示例和技术建议。你说话直接明了，注重效率。",
                "template": "direct",
                "tools": ["code_execute", "file_read", "file_write", "json_parse"],
            },
        }

    def set_model_client(self, model_client: Any, stream: bool = True):
        """Attach a real model client. Agents created afterwards run in real mode."""
        self.model_client = model_client
        self.model_client_stream = stream

    def _build_agent_instance(self, agent_id: str, name: Optional[str] = None) -> Optional[Any]:
        """Build a real AssistantAgent from the agent's stored metadata.

        Uses the per-agent model client override if set, otherwise the shared one.
        Returns None in mock mode / when no client is available.
        ``name`` overrides the agent's display name (used by the distributed
        runtime which may host an agent under a replica route type).
        """
        info = self.agents.get(agent_id)
        if not info:
            return None
        client = self.agent_model_clients.get(agent_id) or self.model_client
        # A per-agent model override forces real mode even if the manager is in
        # mock mode (user explicitly switched this member to a real model).
        has_override = agent_id in self.agent_model_clients
        use_real = (
            HAS_REAL_AGENT
            and client is not None
            and (has_override or not self.mock_mode or info.get("force_real"))
        )
        if not use_real:
            return None
        
        # Get tools for this agent
        agent_tools = []
        tool_names = info.get("tools", [])
        if tool_names and HAS_REAL_AGENT:
            agent_tools = tool_registry.get_ag2_tools(tool_names)
        
        return AssistantAgent(
            name=name or agent_id,
            model_client=client,
            model_client_stream=self.model_client_stream,
            system_message=info.get("persona") or "",
            description=f"{info.get('name', agent_id)} - {info.get('role', 'assistant')}",
            tools=agent_tools if agent_tools else [],
        )

    async def rebuild_agent(self, agent_id: str) -> Optional[Any]:
        """Rebuild an agent's real instance after metadata/model changes.

        Preserves the agent record; swaps out the underlying AssistantAgent
        (e.g. after a persona or model update).
        """
        info = self.agents.get(agent_id)
        if not info:
            return None
        try:
            instance = self._build_agent_instance(agent_id)
            self.agent_instances[agent_id] = instance
            info["mode"] = "real" if instance is not None else "mock"
            info["updated_at"] = datetime.now().isoformat()
            print(f"🔄 Rebuilt agent: {agent_id} [{info['mode']}]")
            return instance
        except Exception as e:
            print(f"⚠️ Failed to rebuild agent {agent_id}: {e}")
            self.agent_instances[agent_id] = None
            info["mode"] = "mock"
            return None

    async def update_agent(
        self,
        agent_id: str,
        name: Optional[str] = None,
        persona: Optional[str] = None,
        role: Optional[str] = None,
        rebuild: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """Update an agent's metadata (name/persona/role) and rebuild its instance."""
        info = self.agents.get(agent_id)
        if not info:
            return None
        if name is not None:
            info["name"] = name
        if persona is not None:
            info["persona"] = persona
        if role is not None:
            info["role"] = role
        info["updated_at"] = datetime.now().isoformat()
        if rebuild:
            await self.rebuild_agent(agent_id)
        return dict(info)

    async def initialize_default_agents(self):
        """Initialize default agents."""
        for agent_id, agent_config in self.default_agents.items():
            await self.create_agent(
                agent_id=agent_id,
                name=agent_config["name"],
                persona=agent_config["persona"],
                role=agent_config["role"],
                tools=agent_config.get("tools", []),
            )

    async def create_agent(
        self,
        agent_id: str,
        name: str,
        persona: str,
        role: str = "assistant",
        tools: Optional[List[str]] = None,
        model_key: Optional[str] = None,
        force_real: bool = False,
    ) -> Optional[Any]:
        """Create a new AG2 agent (real if model client available, else mock)."""
        if agent_id in self.agents:
            raise ValueError(f"Agent {agent_id} already exists")

        # Store metadata first, then build the instance via the shared path
        self.agents[agent_id] = {
            "id": agent_id,
            "name": name,
            "persona": persona,
            "role": role,
            "model_key": model_key,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "tools": tools or [],
            "is_active": True,
            "force_real": force_real,
            "mode": "mock",
        }

        agent_instance = self._build_agent_instance(agent_id)
        self.agent_instances[agent_id] = agent_instance
        mode = "real" if agent_instance is not None else "mock"
        self.agents[agent_id]["mode"] = mode
        print(f"{'✅ Created REAL AG2 agent' if mode == 'real' else '🤖 Creating MOCK agent'}: {name} ({agent_id})")
        return agent_instance

    async def delete_agent(self, agent_id: str):
        """Delete an agent."""
        if agent_id not in self.agents:
            raise ValueError(f"Agent {agent_id} not found")
        if agent_id in self.agent_instances:
            del self.agent_instances[agent_id]
        del self.agents[agent_id]
        print(f"🗑️ Deleted agent: {agent_id}")

    def get_agent_info(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get agent information."""
        agent = self.agents.get(agent_id)
        return dict(agent) if agent else None

    def is_real_mode(self, agent_id: str) -> bool:
        """Whether this agent runs in real (model-backed) mode."""
        info = self.agents.get(agent_id)
        if not info:
            return False
        client = self.agent_model_clients.get(agent_id) or self.model_client
        has_override = agent_id in self.agent_model_clients
        return bool(
            HAS_REAL_AGENT
            and client is not None
            and (has_override or not self.mock_mode or info.get("force_real"))
        )

    def get_all_agents(self) -> List[Dict[str, Any]]:
        """Get all agent information."""
        return [dict(a) for a in self.agents.values()]

    # ---- Messaging ----

    async def send_message(
        self,
        agent_id: str,
        message: str,
        conversation_history: Optional[List[Dict]] = None,
        use_memory: bool = True,
    ) -> str:
        """Send a message to an agent and return the full response.

        When ``use_memory`` is on, relevant long-term memories are retrieved and
        injected into the message context before the agent responds.
        """
        if agent_id not in self.agents:
            raise ValueError(f"Agent {agent_id} not found")

        agent_info = self.agents[agent_id]

        from ..tracing import tracing_system
        from ..tracing.tracer import TraceEventType

        enriched, memories = await self.build_memory_context(agent_id, message) if use_memory else (message, [])
        trace = tracing_system.start_trace(agent_id, {"kind": "dm", "message": message[:200]})
        try:
            if memories:
                await tracing_system.add_event(
                    trace.id, TraceEventType.MEMORY_QUERY, agent_id,
                    {"count": len(memories)},
                )
            if agent_info.get("mode") == "real" and self.agent_instances.get(agent_id):
                await tracing_system.add_event(
                    trace.id, TraceEventType.MODEL_CALL, agent_id,
                    {"mode": "real", "message": message[:100]},
                )
                return await self._real_respond(agent_id, enriched)
            return await self._mock_respond(agent_id, enriched)
        finally:
            try:
                tracing_system.end_trace(trace.id)
            except Exception:
                pass

    async def stream_message(
        self,
        agent_id: str,
        message: str,
        use_memory: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Stream an agent's response as token chunks (for WebSocket).

        Sentinels:
        - ``__THINKING__`` — model entered a reasoning phase.
        - ``__MEMORY__:<json>`` — retrieved memories injected into the context
          (emitted before the first chunk when ``use_memory`` is on).

        The WS handler translates these into ``chat.thinking`` / ``chat.memory``
        events for the frontend.
        """
        if agent_id not in self.agents:
            raise ValueError(f"Agent {agent_id} not found")

        agent_info = self.agents[agent_id]

        from ..tracing import tracing_system
        from ..tracing.tracer import TraceEventType

        enriched, memories = await self.build_memory_context(agent_id, message) if use_memory else (message, [])
        trace = tracing_system.start_trace(agent_id, {"kind": "dm_stream", "message": message[:200]})
        try:
            if memories:
                await tracing_system.add_event(
                    trace.id, TraceEventType.MEMORY_QUERY, agent_id,
                    {"count": len(memories)},
                )
                yield "__MEMORY__:" + json.dumps(memories, ensure_ascii=False)

            if agent_info.get("mode") == "real" and self.agent_instances.get(agent_id):
                await tracing_system.add_event(
                    trace.id, TraceEventType.MODEL_CALL, agent_id,
                    {"mode": "real", "message": message[:100]},
                )
                async for chunk in self._real_stream(agent_id, enriched):
                    yield chunk
            else:
                # Mock: yield the whole canned reply as a single chunk
                response = await self._mock_respond(agent_id, enriched)
                yield response
        finally:
            try:
                tracing_system.end_trace(trace.id)
            except Exception:
                pass

    # ---- Long-term memory integration ----

    async def retrieve_memories(self, agent_id: str, message: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """Retrieve relevant long-term memories for this message (vector search)."""
        try:
            from ..memory import vector_memory
            if vector_memory is None:
                return []
            results = await asyncio.to_thread(
                vector_memory.search, query=message, agent_id=agent_id, n_results=n_results,
            )
            return [
                {
                    "id": r.id,
                    "content": r.content,
                    "memory_type": r.memory_type,
                    "created_at": r.created_at,
                }
                for r in results
            ]
        except Exception as e:
            print(f"⚠️ memory retrieve error for {agent_id}: {e}")
            return []

    async def build_memory_context(self, agent_id: str, message: str, n_results: int = 5):
        """Retrieve relevant memories and build an enriched message context.

        Returns ``(enriched_message, memories)``. When memory is disabled or no
        relevant memory is found, the original message is returned unchanged.
        """
        if not self.memory_enabled:
            return message, []
        memories = await self.retrieve_memories(agent_id, message, n_results)
        if not memories:
            return message, []
        lines = [f"- （{m['memory_type']}）{m['content']}" for m in memories]
        context = (
            "以下是长期记忆中与当前话题相关的信息，供你参考：\n"
            + "\n".join(lines)
            + "\n\n【当前用户消息】\n"
            + message
        )
        return context, memories

    async def save_exchange(self, agent_id: str, user_message: str, assistant_reply: str):
        """Persist a user↔assistant exchange into the agent's long-term memory."""
        if not self.memory_enabled:
            return
        try:
            from ..memory import vector_memory
            if vector_memory is None:
                return
            if user_message and user_message.strip():
                await asyncio.to_thread(
                    vector_memory.add, user_message, agent_id, "conversation",
                    {"role": "user"},
                )
            if assistant_reply and assistant_reply.strip():
                await asyncio.to_thread(
                    vector_memory.add, assistant_reply, agent_id, "conversation",
                    {"role": "assistant"},
                )
            print(f"🧠 memory saved for {agent_id} (exchange)")
        except Exception as e:
            print(f"⚠️ memory save error for {agent_id}: {e}")

    def _strip_reasoning_chunk(self, content: str, state: dict) -> Optional[str]:
        """Strip inline <think>...</think> segments from a streamed chunk.

        Handles tags split across chunks (the state dict carries the open flag
        and any partial buffer between calls). Returns the text to emit, or None
        when the whole chunk was part of a think block.
        """
        out: List[str] = []
        i = 0
        if state["open"]:
            # Inside a think block from a previous chunk: look for the close tag.
            idx = content.find("</think>")
            if idx == -1:
                state["buffer"] += content
                return None
            tail = content[idx + len("</think>"):]
            state["open"] = False
            state["buffer"] = ""
            content = tail  # continue processing the tail in this chunk
        while True:
            o = content.find("<think>", i)
            if o == -1:
                out.append(content[i:])
                break
            out.append(content[i:o])
            c = content.find("</think>", o + len("<think>"))
            if c == -1:
                # Think block continues into the next chunk.
                state["open"] = True
                state["buffer"] = content[o + len("<think>"):]
                break
            i = c + len("</think>")
        return "".join(out) if out else None

    async def _real_stream(self, agent_id: str, message: str) -> AsyncGenerator[str, None]:
        """Stream real model output for an agent, chunk by chunk.

        Strips the model's internal thinking so users only see the final answer.
        Two formats are handled:

        1. AG2 reasoning-content path (R1-style): the openai client prefixes the
           first reasoning chunk with " thinking" and emits a " response" marker
           when reasoning ends — we drop everything before the marker.
        2. Inline tags (MiMo etc.): the thinking is embedded in the content as
           <think>...</think> — we strip those segments.

        Non-reasoning models (neither marker present) pass through untouched.
        """
        agent = self.agent_instances.get(agent_id)
        if agent is None:
            yield f"[Agent {agent_id} 未初始化]"
            return

        cancellation_token = CancellationToken()
        first_chunk = True
        in_reasoning = False          # AG2 " thinking" ... " response" mode
        tag_state = {"open": False, "buffer": ""}   # <think> ... </think> mode

        try:
            async for event in agent.on_messages_stream(
                [TextMessage(content=message, source="user")],
                cancellation_token,
            ):
                if not isinstance(event, ModelClientStreamingChunkEvent):
                    continue

                content = event.content
                if not content:
                    continue

                if first_chunk:
                    first_chunk = False
                    if content.startswith(" thinking"):
                        # AG2 reasoning-content path — drop until " response".
                        in_reasoning = True
                        yield "__THINKING__"
                        content = content[len(" thinking"):]
                    # else: normal model (or inline <think> handled below)

                if in_reasoning:
                    if content.startswith(" response"):
                        in_reasoning = False
                        content = content[len(" response"):]
                    else:
                        continue  # drop reasoning

                # Emit thinking indicator on first <think> tag
                if content and "<think>" in content and not tag_state["open"]:
                    yield "__THINKING__"

                if content and (tag_state["open"] or "<think>" in content or "</think>" in content):
                    content = self._strip_reasoning_chunk(content, tag_state)
                    if not content:
                        continue

                if content:
                    yield content
        except Exception as e:
            print(f"⚠️ real stream error for {agent_id}: {e}")
            yield f"\n\n[Agent 调用出错: {type(e).__name__}: {e}]"

    async def _real_respond(self, agent_id: str, message: str) -> str:
        """Send message to a real AG2 agent and return the full reply.

        Uses the final `Response` event from `on_messages_stream` — AG2 separates
        reasoning from the answer, so no manual thinking-stripping is needed and
        the answer is never swallowed by reasoning-format edge cases.
        (Detected via duck-typing: the final response event exposes `chat_message`.)
        """
        agent = self.agent_instances.get(agent_id)
        if agent is None:
            return f"[Agent {agent_id} 未初始化]"
        try:
            async for event in agent.on_messages_stream(
                [TextMessage(content=message, source="user")],
                CancellationToken(),
            ):
                if isinstance(event, ModelClientStreamingChunkEvent):
                    continue
                if hasattr(event, "chat_message"):
                    content = getattr(event.chat_message, "content", "") or ""
                    return str(content).strip()
        except Exception as e:
            print(f"⚠️ real respond error for {agent_id}: {e}")
            return f"[Agent 调用出错: {type(e).__name__}: {e}]"
        return ""

    async def _mock_respond(self, agent_id: str, message: str) -> str:
        """Generate mock response based on agent persona."""
        await asyncio.sleep(0.5)  # Simulate thinking time

        agent_info = self.agents[agent_id]
        name = agent_info["name"]

        responses = {
            "可灵": f"好的，收到你的消息：'{message}'。我来帮你处理一下~ 😊",
            "小研": f"关于'{message}'这个话题，让我来为你做一份简要分析...\n\n经过调研，我认为有几个关键点值得关注。\n\n第一，这是行业内的常见需求，已有成熟解决方案。\n第二，具体实施时需要考虑成本和效果平衡。\n第三，建议分阶段推进，先做MVP验证。",
            "小码": f"针对'{message}'这个问题，从技术角度看：\n\n```python\n# 伪代码示例\ndef solve_problem(issue):\n    root_cause = analyze(issue)\n    solution = design_solution(root_cause)\n    return execute_and_verify(solution)\n```\n\n核心思路就是先理解问题，再设计方案，最后验证效果。",
        }

        return responses.get(name, f"收到：'{message}'（这是{name}的模拟回复）")

    async def cleanup(self):
        """Cleanup resources."""
        self.agents.clear()
        self.agent_instances.clear()

    # ---- Tool Management ----

    def list_tools(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """List available tools."""
        tools = tool_registry.list_tools(category)
        return [t.to_dict() for t in tools]

    def get_tool(self, name: str) -> Optional[Dict[str, Any]]:
        """Get tool details by name."""
        tool = tool_registry.get(name)
        return tool.to_dict() if tool else None

    def bind_tools(self, agent_id: str, tool_names: List[str]) -> bool:
        """Bind tools to an agent."""
        if agent_id not in self.agents:
            return False
        
        # Validate tool names
        valid_tools = []
        for name in tool_names:
            if tool_registry.get(name):
                valid_tools.append(name)
        
        self.agents[agent_id]["tools"] = valid_tools
        # Rebuild agent with new tools
        asyncio.create_task(self.rebuild_agent(agent_id))
        return True

    def unbind_tools(self, agent_id: str) -> bool:
        """Unbind all tools from an agent."""
        if agent_id not in self.agents:
            return False
        
        self.agents[agent_id]["tools"] = []
        asyncio.create_task(self.rebuild_agent(agent_id))
        return True

    def get_agent_tools(self, agent_id: str) -> List[str]:
        """Get tool names bound to an agent."""
        if agent_id not in self.agents:
            return []
        return self.agents[agent_id].get("tools", [])

    def enable_tool(self, name: str) -> bool:
        """Enable a tool."""
        return tool_registry.enable(name)

    def disable_tool(self, name: str) -> bool:
        """Disable a tool."""
        return tool_registry.disable(name)


class GroupChatManager:
    """Manages group chats between agents."""

    def __init__(self, agent_manager: AgentManager, db_session_factory=None):
        self.agent_manager = agent_manager
        self.group_chats: Dict[str, Dict[str, Any]] = {}
        self._db_factory = db_session_factory

    def _persist_room(self, room_id: str):
        """Save or update a group room in the database."""
        if not self._db_factory:
            return
        import json
        from ..models import GroupRoom
        info = self.group_chats[room_id]
        db = next(self._db_factory())
        try:
            existing = db.get(GroupRoom, room_id)
            if existing:
                existing.name = info["name"]
                existing.owner_agent_id = info["owner"]
                existing.member_agent_ids = json.dumps(info["agents"])
            else:
                db.add(GroupRoom(
                    room_id=room_id,
                    name=info["name"],
                    owner_agent_id=info["owner"],
                    member_agent_ids=json.dumps(info["agents"]),
                ))
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"⚠️ Failed to persist group room {room_id}: {e}")
        finally:
            db.close()

    def _delete_room(self, room_id: str):
        """Remove a group room from the database."""
        if not self._db_factory:
            return
        from ..models import GroupRoom
        db = next(self._db_factory())
        try:
            existing = db.get(GroupRoom, room_id)
            if existing:
                db.delete(existing)
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"⚠️ Failed to delete group room {room_id}: {e}")
        finally:
            db.close()

    def load_persisted_rooms(self):
        """Load group rooms from the database on startup."""
        if not self._db_factory:
            return
        import json
        from ..models import GroupRoom
        db = next(self._db_factory())
        try:
            rows = db.query(GroupRoom).all()
            for row in rows:
                agents = json.loads(row.member_agent_ids)
                # Only restore if at least one agent still exists
                valid_agents = [a for a in agents if a in self.agent_manager.agents]
                if valid_agents:
                    self.group_chats[row.room_id] = {
                        "id": row.room_id,
                        "name": row.name,
                        "agents": valid_agents,
                        "owner": row.owner_agent_id or valid_agents[0],
                        "created_at": row.created_at.isoformat() if row.created_at else "",
                    }
                    print(f"📂 Restored group room: {row.room_id} ('{row.name}')")
        except Exception as e:
            print(f"⚠️ Failed to load group rooms: {e}")
        finally:
            db.close()

    async def create_group_chat(
        self,
        room_id: str,
        name: str,
        agent_ids: List[str],
        owner_agent_id: Optional[str] = None,
    ):
        """
        Create a new group chat.

        Args:
            room_id: Unique identifier for the room
            name: Display name of the group
            agent_ids: List of agent IDs to include in the group
            owner_agent_id: ID of the owner/default responder agent
        """
        # Validate agent IDs
        valid_agents = [aid for aid in agent_ids if aid in self.agent_manager.agents]

        if not valid_agents:
            raise ValueError("At least one valid agent is required")

        # Store group chat info
        self.group_chats[room_id] = {
            "id": room_id,
            "name": name,
            "agents": valid_agents,
            "owner": owner_agent_id or valid_agents[0],
            "created_at": datetime.now().isoformat(),
        }
        # Persist to database
        self._persist_room(room_id)

        print(f"✅ Created group chat: {room_id} ('{name}') with agents: {valid_agents}")

    async def add_member(self, room_id: str, agent_id: str):
        """Add an agent to an existing group chat."""
        if room_id not in self.group_chats:
            raise ValueError(f"Group chat {room_id} not found")
        if agent_id not in self.agent_manager.agents:
            raise ValueError(f"Agent {agent_id} not found")
        if agent_id not in self.group_chats[room_id]["agents"]:
            self.group_chats[room_id]["agents"].append(agent_id)
            self._persist_room(room_id)
            print(f"➕ Agent {agent_id} added to group {room_id}")

    async def remove_member(self, room_id: str, agent_id: str):
        """Remove an agent from an existing group chat."""
        if room_id not in self.group_chats:
            raise ValueError(f"Group chat {room_id} not found")
        agents = self.group_chats[room_id]["agents"]
        if agent_id in agents:
            agents.remove(agent_id)
            self._persist_room(room_id)
            print(f"➖ Agent {agent_id} removed from group {room_id}")

    def _resolve_targets(self, room_id: str, mentions: Optional[List[str]]) -> List[str]:
        """Resolve which agents should respond.

        - If mentions given: only mentioned agents (intersected with members).
        - Otherwise: only the group owner (值班/默认响应者).
        """
        group_info = self.group_chats[room_id]
        members = group_info["agents"]
        if mentions:
            targets = [aid for aid in mentions if aid in members]
            return targets if targets else members
        owner = group_info.get("owner")
        return [owner] if owner and owner in members else members

    def to_room(self, room_id: str) -> Dict[str, Any]:
        """Build a Room dict (frontend /api/rooms shape) for a group."""
        info = self.group_chats[room_id]
        return {
            "id": room_id,
            "name": info["name"],
            "agentId": info["owner"],
            "type": "group",
            "createdAt": 0,
            "ownerAgentId": info["owner"],
            "memberAgentIds": list(info["agents"]),
        }

    async def stream_send(
        self,
        room_id: str,
        message: str,
        mentions: Optional[List[str]] = None,
    ) -> AsyncGenerator[tuple, None]:
        """
        Stream group chat responses. Yields (agent_id, chunk, message_id) tuples.

        Each responding agent gets its own message_id so the frontend can render
        them as separate messages.
        """
        if room_id not in self.group_chats:
            raise ValueError(f"Group chat {room_id} not found")

        for agent_id in self._resolve_targets(room_id, mentions):
            message_id = str(uuid.uuid4())
            try:
                # use_memory=False: group replies shouldn't embed the __MEMORY__
                # sentinel (DM-only memory injection keeps the group protocol clean).
                async for chunk in self.agent_manager.stream_message(agent_id, message, use_memory=False):
                    yield (agent_id, chunk, message_id)
            except Exception as e:
                print(f"⚠️ group stream error for {agent_id}: {e}")
                yield (agent_id, f"[Agent {agent_id} 出错: {e}]", message_id)

    async def send_message(
        self,
        room_id: str,
        message: str,
        mentions: Optional[List[str]] = None,
    ) -> Dict[str, str]:
        """
        Send a message to a group chat and return full responses.

        Returns:
            Dictionary mapping agent IDs to their responses
        """
        if room_id not in self.group_chats:
            raise ValueError(f"Group chat {room_id} not found")

        target_agents = self._resolve_targets(room_id, mentions)

        # Get responses from each agent concurrently (memory injection off for groups)
        tasks = [
            self.agent_manager.send_message(agent_id, message, use_memory=False)
            for agent_id in target_agents
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        responses = {}
        for agent_id, result in zip(target_agents, results):
            if isinstance(result, Exception):
                responses[agent_id] = f"错误: {str(result)}"
            else:
                responses[agent_id] = result

        return responses

    async def delete_group_chat(self, room_id: str):
        """Delete a group chat."""
        if room_id not in self.group_chats:
            raise ValueError(f"Group chat {room_id} not found")
        del self.group_chats[room_id]
        print(f"🗑️ Deleted group chat: {room_id}")

    def get_all_group_chats(self) -> List[Dict[str, Any]]:
        """Get all group chats."""
        return list(self.group_chats.values())

    def get_group_info(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Get group chat information."""
        return self.group_chats.get(room_id)
