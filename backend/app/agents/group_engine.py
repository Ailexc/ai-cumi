"""Framework-native group conversation engine（L2 会话协调层）.

Replaces the legacy "parallel independent replies" group behaviour with a real
AG2/AutoGen GroupChat: members share one conversation thread, see each other's
messages, and a speaker-selection mechanism decides who responds next.

业界对应模式：
- Speaker Selection（SelectorGroupChat）：LLM 依据各成员的角色描述（description）
  自动选择下一个发言者——无 @ 时实现"团队自动调度发言"。
- @路由（selector_func 扩展点）：被 @ 的成员按顺序强制先发言；队列耗尽后返回
  None 自动回退到 LLM 选人（源码语义已核实）。

设计要点（均基于 autogen-agentchat 0.7.5 源码核实）：
- 参与者实例每次运行时新建：人设/花名册永远最新（与 L1 联动），且杜绝
  跨房间/跨轮次的内部上下文泄漏（AssistantAgent 会累积自身 model context）。
- ModelClientStreamingChunkEvent 会穿透 run_stream 输出且不计入终止计数，
  因此每个成员的发言仍以 token 级 chat.chunk 推送，前端协议零变更。
- 终止条件用 MaxMessageTermination 精确计数：任务消息计 1 条，每个成员回合
  的最终 TextMessage 计 1 条（chunk/工具事件不计）。
"""

import asyncio
import os
import re
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

from .agent_manager import AgentManager

try:
    from autogen_agentchat.base import TaskResult
    from autogen_agentchat.conditions import MaxMessageTermination
    from autogen_agentchat.messages import ModelClientStreamingChunkEvent, TextMessage
    from autogen_agentchat.teams import SelectorGroupChat
    TEAM_AVAILABLE = True
except ImportError:  # pragma: no cover - dev environments without AG2
    TEAM_AVAILABLE = False


class TeamEngineUnavailable(Exception):
    """Raised when the framework-native engine cannot run (mock/no client).

    Callers (GroupChatManager) catch this and fall back to the legacy
    parallel-response path so development without models keeps working.
    """


# 无 @ 时允许的最大成员发言数（不含用户消息本身）
DEFAULT_MAX_AUTO_SPEAKERS = 3
# supervisor 模式的总消息上限（任务 + 主管分析 + 指派发言 + 主管汇总）
SUPERVISOR_MAX_MESSAGES = int(os.getenv("GROUP_SUPERVISOR_MAX_MESSAGES", "8"))
# 单次群聊运行的整体超时（秒），防止个别模型卡死拖垮 WS
GROUP_RUN_TIMEOUT_S = float(os.getenv("GROUP_ENGINE_TIMEOUT", "240"))


def _extract_mentioned_ids(text: str, valid_names: set) -> List[str]:
    """Extract @<id> mentions from a message, in order, deduplicated."""
    mentioned = []
    for m in re.findall(r"@([\w-]+)", text or ""):
        if m in valid_names and m not in mentioned:
            mentioned.append(m)
    return mentioned


def _make_supervisor_selector(
    owner_id: str,
    participant_names: set,
    state: Dict[str, Any],
):
    """Supervisor 模式的选人函数（L3 组织编排层 · Supervisor）.

    状态机：
    1. 首轮 → 强制 owner 先行（分析任务、@指派成员）；
    2. 后续轮 → 解析 owner 最新一条消息中的 @<id>，按序强制被指派者发言；
    3. 被指派者全部发言完毕后 → owner 收尾汇总一次；
    4. 之后返回 None 交给 LLM 选人（通常自然收敛，且有 MaxMessageTermination 兜底）。
    """
    def selector_func(messages) -> Optional[str]:
        owner_msgs = [m for m in messages if getattr(m, "source", None) == owner_id]
        if not owner_msgs:
            return owner_id  # 首轮：主管先行
        last_content = getattr(owner_msgs[-1], "content", "") or ""
        # 只解析 owner 最近一次"指派消息"之后的待处理名单
        pending: List[str] = state.setdefault("pending", [])
        if state.get("parsed_for") != id(owner_msgs[-1]):
            state["parsed_for"] = id(owner_msgs[-1])
            fresh = _extract_mentioned_ids(last_content, participant_names)
            already = set(state.get("called", []))
            state["pending"] = [m for m in fresh if m not in already]
            pending = state["pending"]
        if pending:
            nxt = pending.pop(0)
            state.setdefault("called", []).append(nxt)
            state["assignees_spoke"] = True
            return nxt
        # 指派者都已发言 → owner 做一次收尾汇总
        if state.get("assignees_spoke") and not state.get("summarized"):
            state["summarized"] = True
            return owner_id
        return None
    return selector_func


def _resolve_selector_client(agent_manager: AgentManager, members: List[str]) -> Optional[Any]:
    """Pick the LLM used by the speaker-selection mechanism.

    Priority: any member's per-agent override client（这些是用户显式绑定、
    已验证可用的模型）→ shared default client → first participant's own
    client (private attr, pinned-version fallback).

    注意：共享默认客户端可能指向 embedding 等非对话模型（默认配置选择逻辑
    是"第一条 default_model 配置"，不保证是对话模型），因此成员覆盖客户端
    优先——选人调用与成员发言同源，可用性一致。
    """
    for aid in members:
        client = agent_manager.agent_model_clients.get(aid)
        if client is not None:
            return client
    if agent_manager.model_client is not None:
        return agent_manager.model_client
    return None


def _format_history_line(agent_manager: AgentManager, h: Dict[str, Any]) -> Optional[str]:
    content = (h.get("content") or "").strip()
    if not content:
        return None
    if h.get("role") == "user":
        who = "用户"
    else:
        aid = h.get("agentId") or ""
        info = agent_manager.agents.get(aid) or {}
        who = info.get("name") or aid or "成员"
    return f"{who}：{content}"


def _build_task_text(agent_manager: AgentManager, message: str, history: Optional[List[Dict]]) -> str:
    """Compose the group task: recent room context + the current user message."""
    lines = []
    for h in (history or [])[-8:]:
        line = _format_history_line(agent_manager, h)
        if line:
            lines.append(line)
    if not lines:
        return message
    return (
        "以下是本群近期的对话记录（供你衔接上下文）：\n"
        + "\n".join(lines)
        + "\n\n【当前用户消息】\n"
        + message
    )


class _TurnStreamFilter:
    """Per-speaker streaming filter for raw chunk tokens.

    Mirrors AgentManager._real_stream_once's reasoning handling:
    - AG2 reasoning-content markers (" thinking" ... " response")
    - inline <think>...</think> tags (MiMo etc.)
    """

    def __init__(self, strip_reasoning):
        self._strip_reasoning = strip_reasoning
        self.first_chunk = True
        self.in_reasoning = False
        self.tag_state = {"open": False, "buffer": ""}

    def feed(self, content: str) -> Optional[str]:
        if not content:
            return None
        if self.first_chunk:
            self.first_chunk = False
            if content.startswith(" thinking"):
                self.in_reasoning = True
                content = content[len(" thinking"):]
        if self.in_reasoning:
            if content.startswith(" response"):
                self.in_reasoning = False
                content = content[len(" response"):]
            else:
                return None
        if self.tag_state["open"] or "<think>" in content or "</think>" in content:
            content = self._strip_reasoning(content, self.tag_state)
            if not content:
                return None
        return content


async def stream_team_response(
    agent_manager: AgentManager,
    members: List[str],
    message: str,
    mentions: Optional[List[str]] = None,
    history: Optional[List[Dict]] = None,
    room_info: Optional[Dict[str, Any]] = None,
) -> AsyncGenerator[tuple, None]:
    """Run one framework-native group conversation turn.

    Yields ``(agent_id, chunk, message_id)`` tuples — identical shape to the
    legacy path, so the WebSocket layer and frontend stay unchanged. Each
    member turn gets its own ``message_id`` (rendered as a separate bubble);
    token-level chunks stream within a turn.

    Raises:
        TeamEngineUnavailable: before producing any output, when prerequisites
            (AG2 installed / real-mode participants / selector client) are missing.
    """
    if not TEAM_AVAILABLE:
        raise TeamEngineUnavailable("autogen_agentchat team primitives not installed")

    # Fresh instances per run: latest persona + roster (L1), no context leakage.
    participants = []
    for aid in members:
        inst = agent_manager._build_agent_instance(aid)
        if inst is not None:
            participants.append(inst)
    if not participants:
        raise TeamEngineUnavailable("no real-mode participants")

    participant_names = {p.name for p in participants}
    valid_mentions = [m for m in (mentions or []) if m in participant_names]

    selector_client = _resolve_selector_client(agent_manager, members)
    if selector_client is None:
        selector_client = getattr(participants[0], "_model_client", None)
    if selector_client is None and not valid_mentions:
        raise TeamEngineUnavailable("no selector model client available")

    mode = (room_info or {}).get("mode", "free")
    owner_id = (room_info or {}).get("owner")
    supervisor_state: Dict[str, Any] = {}

    if mode == "supervisor" and owner_id in participant_names:
        # L3 Supervisor：owner 路由（先行分析 → @指派 → 收尾汇总）
        selector_func = _make_supervisor_selector(owner_id, participant_names, supervisor_state)
        max_messages = SUPERVISOR_MAX_MESSAGES
    elif valid_mentions:
        # @路由：被 @ 成员按顺序强制先发言；max = 任务1条 + 每位被@者1条，
        # 全部响应后精确终止（不产生多余选人调用）。
        max_messages = len(valid_mentions) + 1
        forced_queue = list(valid_mentions)

        def selector_func(_messages) -> Optional[str]:
            return forced_queue.pop(0) if forced_queue else None
    else:
        # 自动调度：LLM 依据角色描述选人，最多 max_auto 个成员回合。
        max_auto = int(os.getenv("GROUP_MAX_AUTO_SPEAKERS", str(DEFAULT_MAX_AUTO_SPEAKERS)))
        max_messages = max_auto + 1
        selector_func = None

    team = SelectorGroupChat(
        participants=participants,
        model_client=selector_client,
        selector_func=selector_func,
        allow_repeated_speaker=False,
        termination_condition=MaxMessageTermination(max_messages=max_messages),
    )

    task_text = _build_task_text(agent_manager, message, history)

    filters: Dict[str, _TurnStreamFilter] = {}
    current_source: Optional[str] = None
    current_mid: Optional[str] = None
    turn_emitted = 0  # chars already streamed for the current turn

    try:
        async with asyncio.timeout(GROUP_RUN_TIMEOUT_S):
            async for event in team.run_stream(task=task_text):
                if isinstance(event, ModelClientStreamingChunkEvent):
                    src = event.source
                    if src != current_source:
                        current_source = src
                        current_mid = str(uuid.uuid4())
                        turn_emitted = 0
                        filters[src] = _TurnStreamFilter(agent_manager._strip_reasoning_chunk)
                    text = filters[src].feed(event.content)
                    if text:
                        turn_emitted += len(text)
                        yield (src, text, current_mid)
                elif isinstance(event, TextMessage):
                    # 任务回显(source=user)跳过；若该回合没有任何 chunk
                    # （非流式模型），把整条消息作为单个 chunk 下发兜底。
                    if event.source != "user" and turn_emitted == 0:
                        yield (event.source, str(event.content), str(uuid.uuid4()))
                    turn_emitted = 0
                    current_source = None
                elif isinstance(event, TaskResult):
                    print(f"🧵 group run finished: {event.stop_reason}")
                    break
    except TimeoutError:
        print(f"⚠️ group run timed out after {GROUP_RUN_TIMEOUT_S}s")


async def collect_team_response(
    agent_manager: AgentManager,
    members: List[str],
    message: str,
    mentions: Optional[List[str]] = None,
    history: Optional[List[Dict]] = None,
) -> Dict[str, str]:
    """Non-streaming variant: {agent_id: full_reply}（多回合按序拼接）。"""
    parts: Dict[str, List[str]] = {}
    async for aid, chunk, _mid in stream_team_response(agent_manager, members, message, mentions, history):
        parts.setdefault(aid, []).append(chunk)
    return {aid: "".join(chunks) for aid, chunks in parts.items()}
