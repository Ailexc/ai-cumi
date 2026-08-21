"""
Channels API — /api/channels*

External IM channel management (飞书 / Telegram / WhatsApp / Slack / Discord).

P2 scope: full CRUD of channel + account configs persisted in SQLite, and the
toggle / restart control surfaces. Actual external IM gateway connections are
out of scope for this milestone (a real deployment would bind these configs to
OpenClaw channels); the API surface matches the frontend ChannelWizard exactly.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Channel, ChannelAccount

router = APIRouter(prefix="/api/channels", tags=["channels"])


# ---- Channel templates (static; what the wizard can create) ----
CHANNEL_TEMPLATES = {
    "feishu": {
        "name": "飞书",
        "description": "接入飞书，用户可在飞书内直接与 AI 员工对话",
        "fields": [
            {"key": "app_id", "label": "App ID", "type": "text", "required": True},
            {"key": "app_secret", "label": "App Secret", "type": "password", "required": True},
        ],
    },
    "telegram": {
        "name": "Telegram",
        "description": "接入 Telegram Bot",
        "fields": [
            {"key": "bot_token", "label": "Bot Token", "type": "password", "required": True},
        ],
    },
    "whatsapp": {
        "name": "WhatsApp",
        "description": "接入 WhatsApp Business API",
        "fields": [
            {"key": "phone_number_id", "label": "Phone Number ID", "type": "text", "required": True},
            {"key": "token", "label": "Access Token", "type": "password", "required": True},
        ],
    },
    "slack": {
        "name": "Slack",
        "description": "接入 Slack 工作区",
        "fields": [
            {"key": "bot_token", "label": "Bot Token", "type": "password", "required": True},
        ],
    },
    "discord": {
        "name": "Discord",
        "description": "接入 Discord 机器人",
        "fields": [
            {"key": "bot_token", "label": "Bot Token", "type": "password", "required": True},
        ],
    },
}


class AccountCreate(BaseModel):
    accountId: str
    # extra template fields come through as additional body keys
    model_config = {"extra": "allow"}


class ChannelToggle(BaseModel):
    enabled: bool


# ---- helpers ----


def _channel_payload(db: Session, ch: Channel) -> dict:
    accounts = (
        db.query(ChannelAccount)
        .filter_by(channel_id=ch.id)
        .all()
    )
    return {
        "id": ch.id,
        "name": ch.name,
        "description": ch.description or "",
        "enabled": ch.enabled,
        "accountCount": len(accounts),
        "accounts": [
            {
                "id": a.account_id,
                "name": a.name or a.account_id,
                "botName": a.bot_name,
                "enabled": a.enabled,
            }
            for a in accounts
        ],
    }


# ---- routes ----


@router.get("")
async def list_channels(db: Session = Depends(get_db)):
    """List configured channels with their accounts."""
    channels = db.query(Channel).order_by(Channel.name).all()
    return {"ok": True, "channels": [_channel_payload(db, c) for c in channels]}


@router.get("/templates")
async def channel_templates():
    """Channel templates the wizard can create."""
    return {"ok": True, "templates": CHANNEL_TEMPLATES}


@router.post("/{channel_id}/toggle")
async def toggle_channel(channel_id: str, data: ChannelToggle, db: Session = Depends(get_db)):
    """Enable / disable a channel."""
    ch = db.get(Channel, channel_id)
    if not ch:
        # allow toggling a template-defined channel that has no config yet
        if channel_id not in CHANNEL_TEMPLATES:
            raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")
        ch = Channel(id=channel_id, name=CHANNEL_TEMPLATES[channel_id]["name"],
                     description=CHANNEL_TEMPLATES[channel_id]["description"])
        db.add(ch)
    ch.enabled = data.enabled
    db.commit()
    print(f"🔄 Channel {channel_id} {'enabled' if data.enabled else 'disabled'}")
    return {"ok": True}


@router.post("/{channel_id}/accounts")
async def add_account(channel_id: str, data: AccountCreate, db: Session = Depends(get_db)):
    """Add an account/bot to a channel."""
    ch = db.get(Channel, channel_id)
    if not ch:
        if channel_id not in CHANNEL_TEMPLATES:
            raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")
        tpl = CHANNEL_TEMPLATES[channel_id]
        ch = Channel(id=channel_id, name=tpl["name"], description=tpl["description"])
        db.add(ch)
        db.flush()

    # prevent duplicate account ids
    exists = (
        db.query(ChannelAccount)
        .filter_by(channel_id=channel_id, account_id=data.accountId)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="账号已存在")

    payload = data.model_dump()
    extra = {k: v for k, v in payload.items() if k not in ("accountId",)}
    name = extra.get("name") or data.accountId

    db.add(ChannelAccount(
        channel_id=channel_id,
        account_id=data.accountId,
        name=name,
        bot_name=extra.get("botName"),
        enabled=True,
    ))
    db.commit()
    print(f"➕ Account {data.accountId} added to channel {channel_id}")
    return {"ok": True}


@router.delete("/{channel_id}/accounts/{account_id}")
async def remove_account(channel_id: str, account_id: str, db: Session = Depends(get_db)):
    """Remove an account/bot from a channel."""
    rows = (
        db.query(ChannelAccount)
        .filter_by(channel_id=channel_id, account_id=account_id)
        .delete()
    )
    db.commit()
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}


@router.post("/restart")
async def restart_gateway():
    """Restart the (external) channel gateway.

    P2: the channel gateway is not running in-process yet; this is the control
    surface the frontend calls. A production deployment would bind this to the
    gateway process manager.
    """
    print("🔄 /api/channels/restart called (gateway restart simulated)")
    return {"ok": True}
