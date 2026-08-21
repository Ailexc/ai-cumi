"""
Staff onboarding API — /api/staff*, /api/roles, /api/persona-templates

Backs the 添加成员 wizard: choose a role → preview generated persona →
confirm creation (agent created in AgentManager, appears in room.list).
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import state
from ..database import get_db
from ..models import AuditLog, MemberProfile
from ..services.static_data import (
    PERSONA_TEMPLATES,
    STAFF_ROLES,
    ROLE_PERSONA_SKELETON,
    ROLE_TEMPLATE,
)

router = APIRouter(tags=["staff"])


# ---- schemas ----


class StaffPreviewIn(BaseModel):
    name: str
    role: str
    duty: Optional[str] = ""


class StaffCreateIn(BaseModel):
    name: str
    agentId: str
    role: str
    duty: Optional[str] = ""


# ---- routes ----


@router.get("/api/roles")
async def list_roles():
    """Available staff roles (add-staff wizard step 1)."""
    return {"ok": True, "roles": STAFF_ROLES}


@router.get("/api/persona-templates")
async def list_persona_templates():
    """Persona templates (refine wizard quick-start)."""
    return {"ok": True, "templates": PERSONA_TEMPLATES}


def _build_persona(name: str, role: str, duty: str) -> str:
    """Build an AGENTS.md-style persona from role skeleton + duty."""
    skeleton = ROLE_PERSONA_SKELETON.get(role, ROLE_PERSONA_SKELETON["assistant"])
    lines = [skeleton.format(name=name)]
    lines.append("")
    lines.append("## 岗位职责")
    lines.append(f"- {duty}" if duty else "- 协助团队完成日常事务，随叫随到。")
    lines.append("")
    lines.append("## 工作方式")
    lines.append("- 主动沟通，任务完成后第一时间汇报结果。")
    lines.append("- 不确定时先确认再执行，避免返工。")
    lines.append("")
    lines.append("## 边界")
    lines.append("- 涉及删除、敏感操作前先征得用户确认。")
    return "\n".join(lines)


@router.post("/api/staff/preview")
async def staff_preview(data: StaffPreviewIn):
    """Generate a persona preview WITHOUT creating anything."""
    role = next((r for r in STAFF_ROLES if r["id"] == data.role), None)
    return {
        "ok": True,
        "persona": _build_persona(data.name, data.role, data.duty),
        "roleLabel": role["label"] if role else "",
        "roleTitle": role["title"] if role else "",
    }


@router.post("/api/staff")
async def create_staff(data: StaffCreateIn, db: Session = Depends(get_db)):
    """Create a new member (agent + profile)."""
    am = state.agent_manager
    if not am:
        raise HTTPException(status_code=500, detail="Agent manager not initialized")

    agent_id = data.agentId.strip()
    if not agent_id:
        raise HTTPException(status_code=400, detail="英文标识不能为空")
    if agent_id in am.agents:
        raise HTTPException(status_code=400, detail=f"Agent {agent_id} 已存在")

    persona = _build_persona(data.name, data.role, data.duty)
    role = next((r for r in STAFF_ROLES if r["id"] == data.role), None)
    role_title = role["title"] if role else "助理"

    await am.create_agent(
        agent_id=agent_id,
        name=data.name,
        persona=persona,
        role=role_title,
        force_real=False,
    )

    prof = MemberProfile(
        agent_id=agent_id,
        name=data.name,
        role=role_title,
        persona=persona,
        duty=data.duty,
    )
    db.add(prof)
    db.add(AuditLog(agent_id=agent_id, action="staff_add", summary=f"入职：{data.name}"))
    db.commit()

    print(f"✅ Staff added: {data.name} ({agent_id})")
    return {"ok": True, "agentId": agent_id}
