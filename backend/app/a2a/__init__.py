"""A2A (Agent2Agent) protocol exposure（L4 互操作协议层）.

业界依据：A2A 由 Google 于 2025-04 发布、2025-06 捐赠 Linux Foundation，
是跨系统智能体发现与委托的事实标准。核心概念：
- Agent Card（/.well-known/agent-card.json）：智能体能力自我描述名片
- Task 生命周期：submitted → working → completed/failed，产出 Artifact

本实现为最小服务面（原生 FastAPI，无重依赖）：
- GET /.well-known/agent-card.json          平台级名片（团队成员列表）
- GET /api/a2a/{agent_id}/.well-known/agent-card.json   单成员名片
- POST /api/a2a/{agent_id}/tasks/send       提交任务（同步执行到完成）
- GET  /api/a2a/tasks/{task_id}             查询任务状态与产物

执行后端复用 AgentManager.send_message——协议层与执行层解耦。
"""

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import state


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(s: str) -> str:
    """ASCII-safe slug for Agent Card id/name fields."""
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s or "").strip("-").lower()
    return s or "member"


def build_platform_card() -> Dict[str, Any]:
    """平台级 Agent Card：把整个团队作为一个多智能体提供方暴露。"""
    am = state.agent_manager
    skills = []
    for aid, info in am.agents.items():
        if not info.get("is_active", True):
            continue
        tools = [t for t in (info.get("tools") or []) if t]
        skills.append({
            "id": aid,
            "name": f"{info.get('name', aid)}（{info.get('role', 'assistant')}）",
            "description": (
                f"{info.get('name', aid)} — {info.get('role', 'assistant')}。"
                f"擅长工具：{'、'.join(tools) if tools else '通用对话'}"
            ),
            "tags": [info.get("role", "assistant")] + tools[:3],
        })
    return {
        "name": "AiCumi AI Team",
        "description": "AiCumi 多智能体协作平台的员工团队：可灵(前台秘书)、小研(调研专员)、小码(技术专家)等，支持任务委托与协作。",
        "url": "/api/a2a",
        "version": "1.0.0",
        "protocolVersion": "0.2.9",
        "capabilities": {"streaming": False, "pushNotifications": False},
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": skills,
    }


def build_member_card(agent_id: str) -> Dict[str, Any]:
    """单成员 Agent Card。"""
    am = state.agent_manager
    info = am.agents.get(agent_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    tools = [t for t in (info.get("tools") or []) if t]
    name = info.get("name", agent_id)
    role = info.get("role", "assistant")
    return {
        "name": name,
        "id": _slug(agent_id),
        "description": f"{name} — {role}（AiCumi 团队成员）",
        "url": f"/api/a2a/{agent_id}",
        "version": "1.0.0",
        "protocolVersion": "0.2.9",
        "capabilities": {"streaming": False, "pushNotifications": False},
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": [{
            "id": f"{_slug(agent_id)}-primary",
            "name": role,
            "description": (
                f"{name}负责{role}相关工作。"
                f"擅长工具：{'、'.join(tools) if tools else '通用对话'}"
            ),
            "tags": [role] + tools[:3],
        }],
    }


# ---- Task 存储（内存态；学习项目不持久化） ----
_tasks: Dict[str, Dict[str, Any]] = {}


class A2ATaskSendRequest(BaseModel):
    """A2A tasks/send 最小请求体（message.parts 取文本）。"""

    message: Dict[str, Any]


def _extract_text(message: Dict[str, Any]) -> str:
    parts = message.get("parts") or []
    texts = []
    for p in parts:
        if isinstance(p, dict) and p.get("kind") in ("text", None):
            t = p.get("text")
            if isinstance(t, str):
                texts.append(t)
        elif isinstance(p, str):
            texts.append(p)
    return "\n".join(texts).strip()


router = APIRouter(prefix="/api/a2a", tags=["A2A"])


@router.get("/platform-card")
async def platform_card_alias():
    """平台名片的 API 内路径（根路径 .well-known 在 main.py 挂载）。"""
    return build_platform_card()


@router.get("/{agent_id}/.well-known/agent-card.json")
async def member_agent_card(agent_id: str):
    return build_member_card(agent_id)


@router.post("/{agent_id}/tasks/send")
async def a2a_tasks_send(agent_id: str, req: A2ATaskSendRequest):
    """提交任务并同步执行至完成（A2A Task 生命周期最小实现）。"""
    am = state.agent_manager
    if agent_id not in am.agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    text = _extract_text(req.message)
    if not text:
        raise HTTPException(status_code=400, detail="message.parts must contain text")

    task_id = uuid.uuid4().hex
    task: Dict[str, Any] = {
        "id": task_id,
        "agentId": agent_id,
        "status": {"state": "submitted", "timestamp": _now_iso()},
        "history": [req.message],
        "artifacts": [],
    }
    _tasks[task_id] = task

    # submitted → working
    task["status"] = {"state": "working", "timestamp": _now_iso()}
    try:
        reply = await am.send_message(agent_id, text, use_memory=False)
        task["status"] = {"state": "completed", "timestamp": _now_iso()}
        task["artifacts"].append({
            "artifactId": uuid.uuid4().hex,
            "name": "response.txt",
            "parts": [{"kind": "text", "text": reply}],
        })
    except Exception as e:
        task["status"] = {"state": "failed", "timestamp": _now_iso(), "reason": str(e)[:200]}

    task["history"].append({
        "role": "agent",
        "parts": [{"kind": "text", "text": (task["artifacts"][0]["parts"][0]["text"] if task["artifacts"] else "")}],
    })
    return {"ok": True, "task": task}


@router.get("/tasks/{task_id}")
async def a2a_task_get(task_id: str):
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True, "task": task}
