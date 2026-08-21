"""
SQLAlchemy models for AiCumi AG2 Backend.
"""
import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Enum, Float, Integer, String, Text, Index
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class ModelProvider(str, enum.Enum):
    """LLM provider types."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    MISTRAL = "mistral"
    CUSTOM = "custom"


class ModelStatus(str, enum.Enum):
    """Model status states."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"


# ---- ORM Models ----
class ModelConfig(Base):
    """LLM model configuration with encrypted key storage."""
    __tablename__ = "model_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Provider info
    provider = Column(String(50), nullable=False)  # openai, anthropic, etc.
    model_name = Column(String(100), nullable=False)  # gpt-4o, claude-3-opus, etc.
    
    # API credentials (encrypted)
    api_key_encrypted = Column(Text, nullable=False)
    
    # Configuration
    base_url = Column(String(500), nullable=True)  # For custom providers
    default_model = Column(Boolean, default=False)
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=1024)
    
    # Status
    status = Column(Enum(ModelStatus), default=ModelStatus.ACTIVE)
    
    # Metadata
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<ModelConfig(provider='{self.provider}', model_name='{self.model_name}')>"


class Message(Base):
    """Chat message history."""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    role = Column(String(20), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    room_id = Column(String(50), nullable=False)
    agent_id = Column(String(50), nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Member(Base):
    """Team member information."""
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    role = Column(String(50), nullable=False)  # admin, editor, viewer
    avatar_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Room(Base):
    """Chat room definition."""
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    room_type = Column(String(20), default="group")  # group, dm, broadcast
    owner_id = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ---- P2: Member profiles / audit / skills / channels ----


class MemberProfile(Base):
    """Per-agent profile (persona, duty, memory, model binding, identity)."""
    __tablename__ = "member_profiles"

    agent_id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    role = Column(String(50), default="assistant")
    persona = Column(Text, nullable=True)
    duty = Column(Text, nullable=True)
    department = Column(String(100), nullable=True)
    emoji = Column(String(20), nullable=True)
    theme = Column(String(50), nullable=True)
    model_id = Column(Integer, nullable=True)
    memory = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    """Write-operation audit trail for a member."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(50), index=True, nullable=False)
    action = Column(String(50), nullable=False)  # persona_update / identity_update / model_switch / ...
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class MemberSkill(Base):
    """Skill binding for a member."""
    __tablename__ = "member_skills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(50), index=True, nullable=False)
    skill_id = Column(String(100), nullable=False)
    bound_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_member_skill", "agent_id", "skill_id", unique=True),)


class Channel(Base):
    """External IM channel configuration."""
    __tablename__ = "channels"

    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ChannelAccount(Base):
    """Account/bot binding inside a channel."""
    __tablename__ = "channel_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    channel_id = Column(String(50), index=True, nullable=False)
    account_id = Column(String(100), nullable=False)
    name = Column(String(100), nullable=True)
    bot_name = Column(String(100), nullable=True)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
