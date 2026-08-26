"""Agent-to-agent delegation tool（L3 组织编排层 · Handoff/委派）.

业界对应模式：OpenAI Agents SDK handoffs / AutoGen Swarm 的移交思想——
让平级 Agent 之间具备直接的通信与任务转交能力。本实现采用"工具化委派"：
每个成员在构建实例时获得一个绑定自身身份的 ``delegate_to_colleague``
FunctionTool，运行时可向指定同事发起子对话并取回结果，再以自己的口吻
转述给用户（reflect_on_tool_use 保证转述）。

安全设计：
- 递归深度上限（ContextVar 跨 await 链传播）：A→B→C 之后禁止继续下钻，
  防止无限互相委派打爆 token；
- 禁止自我委派；目标必须是真实存在的在职成员；
- 全链路写入 tracing（CUSTOM 事件，metadata.kind=delegate），可在追踪页观测。
"""

import contextvars
import json
from typing import Annotated, Any, Optional

# 委派递归深度：随 await 链自然传播（被委派者的工具调用继承当前上下文）
_DELEGATION_DEPTH: contextvars.ContextVar[int] = contextvars.ContextVar(
    "delegation_depth", default=0
)

MAX_DELEGATION_DEPTH = 2


def make_delegate_tool(caller_agent_id: str, agent_manager: Any) -> Optional[Any]:
    """Build a per-agent delegate FunctionTool bound to ``caller_agent_id``.

    Returns None when AG2 core tools are unavailable (mock/dev environments).
    """
    try:
        from autogen_core.tools import FunctionTool
    except ImportError:
        return None

    async def delegate_to_colleague(
        colleague_id: Annotated[str, "目标同事的 ID（见团队通讯录，如 xiaoyan、xiaoma）"],
        question: Annotated[str, "要委托给同事的具体问题或任务，需表述完整清晰"],
    ) -> str:
        """向团队中的另一位同事发起咨询或任务委托，返回对方的完整回复。

        适用场景：问题超出你的专业范围、需要其他成员的专业意见补充，
        或用户明确要求你去找某位同事。禁止委派给你自己。
        """
        if colleague_id == caller_agent_id:
            return json.dumps(
                {"error": "不能委派给自己，请直接回答或换一位同事"},
                ensure_ascii=False,
            )
        if colleague_id not in getattr(agent_manager, "agents", {}):
            return json.dumps(
                {"error": f"团队成员 {colleague_id} 不存在，请核对团队通讯录中的 ID"},
                ensure_ascii=False,
            )

        depth = _DELEGATION_DEPTH.get()
        if depth >= MAX_DELEGATION_DEPTH:
            return json.dumps(
                {"error": f"委派层级已达上限（{MAX_DELEGATION_DEPTH} 层），请基于已有信息作答"},
                ensure_ascii=False,
            )

        from ..tracing import tracing_system
        from ..tracing.tracer import TraceEventType

        trace = tracing_system.start_trace(
            caller_agent_id,
            {"kind": "delegate", "to": colleague_id, "depth": depth},
        )
        try:
            await tracing_system.add_event(
                trace.id, TraceEventType.CUSTOM, caller_agent_id,
                {"action": "delegate.send", "to": colleague_id, "question": question[:200]},
            )
            token = _DELEGATION_DEPTH.set(depth + 1)
            try:
                # use_memory=False：委派属临时子对话，不污染双方长期记忆
                reply = await agent_manager.send_message(
                    colleague_id, question, use_memory=False,
                )
            finally:
                _DELEGATION_DEPTH.reset(token)
            await tracing_system.add_event(
                trace.id, TraceEventType.CUSTOM, colleague_id,
                {"action": "delegate.result", "chars": len(reply or "")},
            )
            return reply or "（对方没有返回内容）"
        except Exception as e:
            await tracing_system.add_event(
                trace.id, TraceEventType.ERROR, caller_agent_id,
                {"action": "delegate.error", "error": str(e)[:200]},
            )
            return json.dumps(
                {"error": f"委派失败：{type(e).__name__}: {e}"},
                ensure_ascii=False,
            )
        finally:
            try:
                tracing_system.end_trace(trace.id)
            except Exception:
                pass

    return FunctionTool(
        func=delegate_to_colleague,
        name="delegate_to_colleague",
        description=(
            "向团队中的另一位同事发起咨询或任务委托，返回对方的完整回复。"
            "适用于问题超出自己专业范围、需要同事协助，或用户指定找某位同事的场景。"
        ),
    )
