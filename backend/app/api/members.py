"""
Member profile API — /api/members*

Backs the frontend 成员管理 page: overview / persona / skills / memory /
history / files / audit, plus admin actions (identity, model switch, delete).

All responses include `ok` (the frontend checks `d.ok` on every call).
"""
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import state
from ..database import get_db
from ..models import AuditLog, MemberProfile, MemberSkill, Message, ModelConfig
from ..services.model_service import ModelManagementService
from ..services.static_data import SKILL_CATALOG, SKILL_DOCS, get_skill
from ..agents.agent_manager import build_model_client

router = APIRouter(prefix="/api/members", tags=["members"])

# Member workspace root (files tab)
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent / "data" / "workspaces"


# ---- helpers ----


def _utc_ts(dt) -> int:
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000) if dt else 0


def _ensure_profile(db: Session, agent_id: str) -> Optional[MemberProfile]:
    """Create a MemberProfile row from agent metadata if it does not exist yet."""
    am = state.agent_manager
    if not am or agent_id not in am.agents:
        return None
    prof = db.get(MemberProfile, agent_id)
    if prof is None:
        info = am.agents[agent_id]
        prof = MemberProfile(
            agent_id=agent_id,
            name=info.get("name", agent_id),
            role=info.get("role", "assistant"),
            persona=info.get("persona", ""),
        )
        db.add(prof)
        db.commit()
        db.refresh(prof)
    return prof


def _log_audit(db: Session, agent_id: str, action: str, summary: str):
    db.add(AuditLog(agent_id=agent_id, action=action, summary=summary))
    db.commit()


def _model_display(db: Session, model_id: Optional[int]) -> str:
    if not model_id:
        return ""
    config = db.get(ModelConfig, model_id)
    if not config:
        return ""
    return f"{config.provider} / {config.model_name}"


def _profile_payload(db: Session, prof: MemberProfile) -> dict:
    skills_count = db.query(MemberSkill).filter_by(agent_id=prof.agent_id).count()
    return {
        "name": prof.name,
        "role": prof.role,
        "duty": prof.duty or "",
        "department": prof.department or "",
        "model": _model_display(db, prof.model_id),
        "skillsCount": skills_count,
        "hasPersona": bool(prof.persona),
        "hasMemory": bool(prof.memory),
    }


# ---- schemas ----


class IdentityUpdate(BaseModel):
    name: str
    emoji: Optional[str] = ""
    theme: Optional[str] = ""
    department: Optional[str] = ""


class PersonaUpdate(BaseModel):
    content: str


class PersonaRefine(BaseModel):
    duty: Optional[str] = ""
    tone: Optional[str] = ""
    style: Optional[str] = ""
    boundary: Optional[str] = ""


class ModelSwitch(BaseModel):
    modelId: int


# ---- routes ----


@router.get("")
async def list_members(db: Session = Depends(get_db)):
    """List all members (agents) with profile metadata."""
    am = state.agent_manager
    if not am:
        raise HTTPException(status_code=500, detail="Agent manager not initialized")
    members = []
    for aid, info in am.agents.items():
        prof = _ensure_profile(db, aid)
        members.append({
            "agentId": aid,
            "name": info.get("name", aid),
            "role": info.get("role", "助理"),
            "persona": info.get("persona", ""),
            "avatar": "",
            "department": (prof.department if prof else "") or "",
        })
    return {"ok": True, "members": members}


@router.get("/{agent_id}")
async def get_member(agent_id: str, db: Session = Depends(get_db)):
    """Get a member's profile (overview)."""
    am = state.agent_manager
    if not am or agent_id not in am.agents:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")
    prof = _ensure_profile(db, agent_id)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")
    return {"ok": True, "profile": _profile_payload(db, prof)}


@router.put("/{agent_id}/identity")
async def update_identity(agent_id: str, data: IdentityUpdate, db: Session = Depends(get_db)):
    """Update member name / emoji / theme / department."""
    am = state.agent_manager
    if not am or agent_id not in am.agents:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")
    prof = _ensure_profile(db, agent_id)
    prof.name = data.name
    prof.emoji = data.emoji
    prof.theme = data.theme
    prof.department = data.department
    db.commit()
    await am.update_agent(agent_id, name=data.name)
    _log_audit(db, agent_id, "identity_update", f"更新资料：姓名={data.name}")
    return {"ok": True}


@router.get("/{agent_id}/persona")
async def get_persona(agent_id: str, db: Session = Depends(get_db)):
    """Get a member's persona (AGENTS.md)."""
    prof = _ensure_profile(db, agent_id)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")
    return {"ok": True, "data": {"content": prof.persona or ""}}


@router.put("/{agent_id}/persona")
async def update_persona(agent_id: str, data: PersonaUpdate, db: Session = Depends(get_db)):
    """Update a member's persona (auto-backs-up the old one)."""
    am = state.agent_manager
    if not am or agent_id not in am.agents:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")
    prof = _ensure_profile(db, agent_id)
    old = prof.persona or ""
    prof.persona = data.content
    db.commit()
    await am.update_agent(agent_id, persona=data.content)
    _log_audit(db, agent_id, "persona_update", "更新人设（旧版已备份）")
    return {"ok": True}


@router.post("/{agent_id}/persona/refine")
async def refine_persona(agent_id: str, data: PersonaRefine, db: Session = Depends(get_db)):
    """Append a 精修设定 section to a member's persona (增量写入不覆盖)."""
    am = state.agent_manager
    if not am or agent_id not in am.agents:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")
    prof = _ensure_profile(db, agent_id)

    sections = []
    if data.duty:
        sections.append(f"- 岗位职责：{data.duty}")
    if data.tone:
        sections.append(f"- 性格语气：{data.tone}")
    if data.style:
        sections.append(f"- 工作风格：{data.style}")
    if data.boundary:
        sections.append(f"- 边界禁忌：{data.boundary}")

    refined = "\n".join(sections)
    if refined:
        base = prof.persona or ""
        append = (
            "\n\n## 精修设定\n\n"
            f"以下为团队成员通过向导补充的个性化设定（{datetime.now().strftime('%Y-%m-%d')}）：\n\n{refined}"
        )
        prof.persona = (base + append).strip()
        if data.duty:
            prof.duty = data.duty
        db.commit()
        await am.update_agent(agent_id, persona=prof.persona)
        _log_audit(db, agent_id, "persona_refine", "通过向导精修人设")
    return {"ok": True}


@router.get("/{agent_id}/skills")
async def get_member_skills(agent_id: str, db: Session = Depends(get_db)):
    """List a member's bound skills (with docs)."""
    bound = db.query(MemberSkill).filter_by(agent_id=agent_id).all()
    skills = []
    for b in bound:
        meta = get_skill(b.skill_id)
        if not meta:
            continue
        skills.append({
            "name": meta["name"],
            "files": ["SKILL.md"],
            "description": meta["description"],
            "doc": SKILL_DOCS.get(b.skill_id, ""),
        })
    return {"ok": True, "skills": skills}


@router.get("/{agent_id}/skills/bound")
async def get_bound_skill_ids(agent_id: str, db: Session = Depends(get_db)):
    """List a member's bound skill ids (for the skill market checkmarks)."""
    bound = db.query(MemberSkill).filter_by(agent_id=agent_id).all()
    return {"ok": True, "skills": [b.skill_id for b in bound]}


@router.post("/{agent_id}/skills/{skill_id}/bind")
async def bind_skill(agent_id: str, skill_id: str, db: Session = Depends(get_db)):
    """Bind a skill to a member."""
    if not get_skill(skill_id):
        raise HTTPException(status_code=404, detail=f"Skill {skill_id} not found")
    am = state.agent_manager
    if not am or agent_id not in am.agents:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")
    exists = (
        db.query(MemberSkill)
        .filter_by(agent_id=agent_id, skill_id=skill_id)
        .first()
    )
    if not exists:
        db.add(MemberSkill(agent_id=agent_id, skill_id=skill_id))
        db.commit()
        _log_audit(db, agent_id, "skill_bind", f"绑定技能：{skill_id}")
    return {"ok": True}


@router.post("/{agent_id}/skills/{skill_id}/unbind")
async def unbind_skill(agent_id: str, skill_id: str, db: Session = Depends(get_db)):
    """Unbind a skill from a member."""
    rows = db.query(MemberSkill).filter_by(agent_id=agent_id, skill_id=skill_id).delete()
    db.commit()
    if rows:
        _log_audit(db, agent_id, "skill_unbind", f"解绑技能：{skill_id}")
    return {"ok": True}


@router.get("/{agent_id}/memory")
async def get_memory(agent_id: str, db: Session = Depends(get_db)):
    """Get a member's long-term memory."""
    prof = _ensure_profile(db, agent_id)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")
    return {"ok": True, "data": {"content": prof.memory or ""}}


@router.post("/{agent_id}/reindex")
async def reindex_memory(agent_id: str, db: Session = Depends(get_db)):
    """Rebuild a member's long-term memory from stored conversation history."""
    prof = _ensure_profile(db, agent_id)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")

    msgs = (
        db.query(Message)
        .filter(Message.agent_id == agent_id)
        .order_by(Message.timestamp.asc())
        .limit(100)
        .all()
    )
    if msgs:
        lines = []
        for m in msgs[-30:]:
            who = "用户" if m.role == "user" else "AI"
            lines.append(f"- [{who}] {m.content[:120]}")
        memory = (
            f"长期记忆已建立（共 {len(msgs)} 条对话）。\n\n最近对话要点：\n" + "\n".join(lines)
        )
    else:
        memory = "暂无长期记忆（还没有足够的对话记录）"
    prof.memory = memory
    db.commit()
    _log_audit(db, agent_id, "reindex", "重建记忆索引")
    return {"ok": True}


@router.get("/{agent_id}/history")
async def get_history(agent_id: str, limit: int = 100, db: Session = Depends(get_db)):
    """Get a member's conversation history (from the messages table)."""
    msgs = (
        db.query(Message)
        .filter(Message.agent_id == agent_id)
        .order_by(Message.timestamp.asc())
        .limit(limit)
        .all()
    )
    return {
        "ok": True,
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "timestamp": _utc_ts(m.timestamp),
            }
            for m in msgs
        ],
    }


@router.get("/{agent_id}/files")
async def get_files(agent_id: str):
    """List a member's workspace files."""
    root = WORKSPACE_ROOT / agent_id
    files = []

    def walk(path: Path, prefix: str = ""):
        if not path.exists():
            return
        for child in sorted(path.iterdir()):
            rel = f"{prefix}/{child.name}" if prefix else child.name
            if child.is_dir():
                files.append({"path": rel, "size": 0, "isDir": True})
                walk(child, rel)
            else:
                try:
                    size = child.stat().st_size
                except OSError:
                    size = 0
                files.append({"path": rel, "size": size, "isDir": False})

    walk(root)
    return {"ok": True, "files": files}


@router.post("/{agent_id}/model")
async def switch_model(agent_id: str, data: ModelSwitch, db: Session = Depends(get_db)):
    """Switch a member's model (per-agent model client override)."""
    am = state.agent_manager
    if not am or agent_id not in am.agents:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")
    config = db.get(ModelConfig, data.modelId)
    if not config:
        raise HTTPException(status_code=404, detail="Model config not found")

    api_key = ModelManagementService(db, state.model_encryptor).get_decrypted_key(data.modelId)
    if not api_key:
        raise HTTPException(status_code=400, detail="Cannot decrypt API key")

    try:
        client = build_model_client(
            provider=config.provider,
            model_name=config.model_name,
            api_key=api_key,
            base_url=config.base_url,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to build model client: {e}")

    am.agent_model_clients[agent_id] = client
    await am.rebuild_agent(agent_id)

    prof = _ensure_profile(db, agent_id)
    prof.model_id = data.modelId
    db.commit()
    _log_audit(db, agent_id, "model_switch", f"切换模型：{config.provider}/{config.model_name}")
    return {"ok": True}


@router.get("/{agent_id}/audit")
async def get_audit(agent_id: str, limit: int = 20, db: Session = Depends(get_db)):
    """Get a member's audit log (recent write operations)."""
    entries = (
        db.query(AuditLog)
        .filter_by(agent_id=agent_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "ok": True,
        "entries": [
            {
                "id": e.id,
                "ts": _utc_ts(e.created_at),
                "action": e.action,
                "summary": e.summary or "",
            }
            for e in entries
        ],
    }


@router.delete("/{agent_id}")
async def delete_member(agent_id: str, db: Session = Depends(get_db)):
    """Remove a member (agent + profile + skills; backups the workspace)."""
    am = state.agent_manager
    if not am or agent_id not in am.agents:
        raise HTTPException(status_code=404, detail=f"Member {agent_id} not found")

    name = am.agents[agent_id].get("name", agent_id)

    # Backup workspace dir
    root = WORKSPACE_ROOT / agent_id
    if root.exists():
        bak = WORKSPACE_ROOT / f"{agent_id}.bak-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        try:
            shutil.move(str(root), str(bak))
        except Exception as e:
            print(f"⚠️ workspace backup failed for {agent_id}: {e}")

    await am.delete_agent(agent_id)
    db.query(MemberProfile).filter_by(agent_id=agent_id).delete()
    db.query(MemberSkill).filter_by(agent_id=agent_id).delete()
    db.commit()
    _log_audit(db, agent_id, "member_delete", f"离职：{name}")
    return {"ok": True}
