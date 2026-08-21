"""
Message persistence helpers.

Writes chat messages to SQLite (messages table) so history survives restarts and
can be replayed via `chat.history` / member history / memory reindex.
"""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from ..models import Message


def save_message(
    db: Session,
    room_id: str,
    role: str,
    content: str,
    agent_id: Optional[str] = None,
) -> Message:
    """Persist one chat message."""
    msg = Message(room_id=room_id, role=role, content=content, agent_id=agent_id)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def load_history(
    db: Session,
    room_id: str,
    limit: int = 200,
) -> List[Message]:
    """Load messages for a room in chronological order."""
    return (
        db.query(Message)
        .filter(Message.room_id == room_id)
        .order_by(Message.timestamp.asc())
        .limit(limit)
        .all()
    )


def to_frontend_message(m: Message) -> dict:
    """Convert a Message row to the frontend chat.history shape."""
    ts = m.timestamp
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return {
        "role": m.role,
        "content": m.content,
        "timestamp": int(ts.timestamp() * 1000),
        "agentId": m.agent_id,
    }
