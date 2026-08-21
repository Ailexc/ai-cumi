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
            },
            "xiaoyan": {
                "name": "小研",
                "role": "调研专员",
                "persona": "你是小研，一个专业的调研专员。你善于收集和分析信息，提供深入的研究报告。你说话严谨专业，注重数据和事实。",
                "template": "advisor",
            },
            "xiaoma": {
                "name": "小码",
                "role": "技术专家",
                "persona": "你是小码，一个技术专家。你善于解决技术问题，提供代码示例和技术建议。你说话直接明了，注重效率。",
                "template": "direct",
            },
        }

    def set_model_client(self, model_client: Any, stream: bool = True):
        """Attach a real model client. Agents created afterwards run in real mode."""
        self.model_client = model_client
        self.model_client_stream = stream

    async def initialize_default_agents(self):
        """Initialize default agents."""
        for agent_id, agent_config in self.default_agents.items():
            await self.create_agent(
                agent_id=agent_id,
                name=agent_config["name"],
                persona=agent_config["persona"],
                role=agent_config["role"],
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

        agent_instance = None
        use_real = (
            HAS_REAL_AGENT
            and self.model_client is not None
            and (not self.mock_mode or force_real)
        )

        if use_real:
            try:
                agent_instance = AssistantAgent(
                    name=agent_id,
                    model_client=self.model_client,
                    model_client_stream=self.model_client_stream,
                    system_message=persona,
                    description=f"{name} - {role}",
                )
                mode = "real"
                print(f"✅ Created REAL AG2 agent: {name} ({agent_id})")
            except Exception as e:
                print(f"⚠️ Failed to create real agent, falling back to mock: {e}")
                mode = "mock"
        else:
            mode = "mock"
            print(f"🤖 Creating MOCK agent: {name} ({agent_id})")

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
            "mode": mode,
        }
        self.agent_instances[agent_id] = agent_instance
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

    def get_all_agents(self) -> List[Dict[str, Any]]:
        """Get all agent information."""
        return [dict(a) for a in self.agents.values()]

    # ---- Messaging ----

    async def send_message(
        self,
        agent_id: str,
        message: str,
        conversation_history: Optional[List[Dict]] = None,
    ) -> str:
        """Send a message to an agent and return the full response."""
        if agent_id not in self.agents:
            raise ValueError(f"Agent {agent_id} not found")

        agent_info = self.agents[agent_id]

        if agent_info.get("mode") == "real" and self.agent_instances.get(agent_id):
            return await self._real_respond(agent_id, message)
        return await self._mock_respond(agent_id, message)

    async def stream_message(self, agent_id: str, message: str) -> AsyncGenerator[str, None]:
        """Stream an agent's response as token chunks (for WebSocket)."""
        if agent_id not in self.agents:
            raise ValueError(f"Agent {agent_id} not found")

        agent_info = self.agents[agent_id]
        if agent_info.get("mode") == "real" and self.agent_instances.get(agent_id):
            async for chunk in self._real_stream(agent_id, message):
                yield chunk
        else:
            # Mock: yield the whole canned reply as a single chunk
            response = await self._mock_respond(agent_id, message)
            yield response

    async def _real_stream(self, agent_id: str, message: str) -> AsyncGenerator[str, None]:
        """Stream real model output for an agent, chunk by chunk."""
        agent = self.agent_instances.get(agent_id)
        if agent is None:
            yield f"[Agent {agent_id} 未初始化]"
            return

        cancellation_token = CancellationToken()
        try:
            async for event in agent.on_messages_stream(
                [TextMessage(content=message, source="user")],
                cancellation_token,
            ):
                if isinstance(event, ModelClientStreamingChunkEvent):
                    content = event.content
                    if content:
                        yield content
        except Exception as e:
            print(f"⚠️ real stream error for {agent_id}: {e}")
            yield f"\n\n[Agent 调用出错: {type(e).__name__}: {e}]"

    async def _real_respond(self, agent_id: str, message: str) -> str:
        """Send message to a real AG2 agent and return the full reply."""
        parts = []
        async for chunk in self._real_stream(agent_id, message):
            parts.append(chunk)
        return "".join(parts) if parts else ""

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


class GroupChatManager:
    """Manages group chats between agents."""

    def __init__(self, agent_manager: AgentManager):
        self.agent_manager = agent_manager
        self.group_chats: Dict[str, Dict[str, Any]] = {}

    async def create_group_chat(
        self,
        room_id: str,
        agent_ids: List[str],
        owner_agent_id: Optional[str] = None,
    ):
        """
        Create a new group chat.

        Args:
            room_id: Unique identifier for the room
            agent_ids: List of agent IDs to include in the group
            owner_agent_id: ID of the owner/default responder agent
        """
        # Validate agent IDs
        valid_agents = [aid for aid in agent_ids if aid in self.agent_manager.agents]

        if not valid_agents:
            raise ValueError("At least one valid agent is required")

        # Store group chat info
        self.group_chats[room_id] = {
            "agents": valid_agents,
            "owner": owner_agent_id or valid_agents[0],
            "created_at": datetime.now().isoformat(),
        }

        print(f"✅ Created group chat: {room_id} with agents: {valid_agents}")

    async def send_message(
        self,
        room_id: str,
        message: str,
        mentions: Optional[List[str]] = None,
    ) -> Dict[str, str]:
        """
        Send a message to a group chat.

        Args:
            room_id: ID of the group room
            message: Message to send
            mentions: List of agent IDs to mention

        Returns:
            Dictionary mapping agent IDs to their responses
        """
        if room_id not in self.group_chats:
            raise ValueError(f"Group chat {room_id} not found")

        group_info = self.group_chats[room_id]

        # Determine target agents
        if mentions:
            target_agents = [aid for aid in mentions if aid in self.agent_manager.agents]
        else:
            target_agents = list(self.group_chats[room_id]["agents"])

        # Get responses from each agent concurrently
        tasks = [
            self.agent_manager.send_message(agent_id, message)
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
