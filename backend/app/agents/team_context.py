"""Team context builder: injects a live team roster into every agent's
system message（L1 静态认知层 · Team Roster 注入）.

业界依据：所有主流多智能体框架都把"同事认知"作为显式结构化上下文注入，
而非依赖模型涌现——AG2/AutoGen 的 agent description、CrewAI 的 role/goal、
LangGraph supervisor 的子代理描述皆是如此。

新鲜度设计：花名册在每次 Agent 实例构建时实时生成；实例只在成员/元数据
变更时重建（见 AgentManager.rebuild_all_agents 的调用点），因此无需额外的
缓存失效机制——"每次构建即最新"。
"""

from typing import Any, Dict, List, Optional

ROSTER_HEADER = (
    "## 团队通讯录\n"
    "你是 AiCumi 团队的成员之一。除你之外的团队成员如下：\n"
    "- 当用户的问题更适合其他成员处理时，向用户推荐对应的同事；\n"
    "- 在群聊中，可以自然地引用或衔接同事的观点；\n"
    "- 需要同事协助时，可通过其 ID 定位并委派。\n"
)


def build_team_roster(
    agents: Dict[str, Dict[str, Any]],
    exclude_agent_id: Optional[str] = None,
) -> str:
    """Build the team roster text from agent metadata.

    Args:
        agents: AgentManager.agents（原始元数据字典）。直接传 dict 而非
            manager 实例，避免与 agent_manager 形成循环导入。
        exclude_agent_id: 排除自己（不把自己介绍成第三者）。

    Returns:
        花名册文本；没有其他在职成员时返回 ""（单成员团队不加该章节）。
    """
    lines: List[str] = []
    for aid, info in agents.items():
        if aid == exclude_agent_id:
            continue
        if not info.get("is_active", True):
            continue
        name = info.get("name") or aid
        role = info.get("role") or "assistant"
        tools = [t for t in (info.get("tools") or []) if t]
        tool_part = "、".join(tools) if tools else "无"
        lines.append(f"- {name}（ID: {aid}）— {role}｜擅长工具：{tool_part}")
    if not lines:
        return ""
    return ROSTER_HEADER + "\n".join(lines) + "\n"
