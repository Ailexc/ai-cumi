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
    """Model provider types."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    MISTRAL = "mistral"
    DASHSCOPE = "dashscope"
    CUSTOM = "custom"


class ModelType(str, enum.Enum):
    """Model capability types."""
    LLM = "llm"           # 对话/推理
    EMBEDDING = "embedding"  # 向量化/记忆检索
    VISION = "vision"     # 图片识别
    SEARCH = "search"     # 网络搜索
    CODE = "code"         # 代码执行


class ModelStatus(str, enum.Enum):
    """Model status states."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"


# ---- ORM Models ----
class ModelConfig(Base):
    """Unified model configuration with encrypted key storage.

    Supports multiple model types: LLM, Embedding, Vision, Search, Code.
    Each type can have one default model.
    """
    __tablename__ = "model_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Model type and provider
    model_type = Column(String(20), nullable=False, default="llm")  # llm/embedding/vision/search/code
    provider = Column(String(50), nullable=False)  # openai, anthropic, custom, etc.
    model_name = Column(String(100), nullable=False)  # gpt-4o, text-embedding-3-small, etc.
    
    # API credentials (encrypted)
    api_key_encrypted = Column(Text, nullable=False)
    
    # Configuration
    base_url = Column(String(500), nullable=True)  # For custom providers
    default_model = Column(Boolean, default=False)  # Default model for this type
    temperature = Column(Float, nullable=True)  # Only for LLM
    max_tokens = Column(Integer, nullable=True)  # Only for LLM
    
    # Status
    status = Column(Enum(ModelStatus), default=ModelStatus.ACTIVE)

    # Capability / pricing fields (P1: model config enhancement)
    embedding_dimensions = Column(Integer, nullable=True)
    max_input_tokens = Column(Integer, nullable=True)
    max_output_tokens = Column(Integer, nullable=True)
    context_window = Column(Integer, nullable=True)
    supports_vision = Column(Boolean, default=False)
    supports_function_calling = Column(Boolean, default=False)
    supports_streaming = Column(Boolean, default=True)
    price_per_1k_input_tokens = Column(Float, nullable=True)
    price_per_1k_output_tokens = Column(Float, nullable=True)
    rate_limit_rpm = Column(Integer, nullable=True)
    rate_limit_tpm = Column(Integer, nullable=True)
    rate_limit_tpd = Column(Integer, nullable=True)
    batch_size = Column(Integer, default=32)

    # Metadata
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<ModelConfig(type='{self.model_type}', provider='{self.provider}', model='{self.model_name}')>"


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
    enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class GroupRoom(Base):
    """Persisted group chat room metadata."""
    __tablename__ = "group_rooms"

    room_id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    owner_agent_id = Column(String(50), nullable=True)
    member_agent_ids = Column(Text, nullable=False)  # JSON array of agent IDs
    # L3 组织编排层：free=自由讨论(LLM 选人) / supervisor=主管调度(owner 路由)
    mode = Column(String(20), nullable=False, default="free")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ---- P2: Workflow definitions & runs ----

class WorkflowDef(Base):
    """Persisted workflow definition (DAG of nodes + edges)."""
    __tablename__ = "workflow_defs"

    id = Column(String(50), primary_key=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    definition_json = Column(Text, nullable=False)  # {"nodes": [...], "edges": [...]}
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class WorkflowRun(Base):
    """Persisted workflow execution record (history for learning/debug)."""
    __tablename__ = "workflow_runs"

    id = Column(String(50), primary_key=True)
    workflow_id = Column(String(50), index=True, nullable=False)
    workflow_name = Column(String(200), nullable=True)
    definition_json = Column(Text, nullable=True)  # definition snapshot at run time
    status = Column(String(20), nullable=False, default="pending")  # running/completed/failed/cancelled
    input_data = Column(Text, nullable=True)
    output_data = Column(Text, nullable=True)
    steps_json = Column(Text, nullable=True)  # node statuses after the run
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration_ms = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class KnowledgeDocument(Base):
    """Indexed document in cloud space."""
    __tablename__ = "knowledge_documents"

    id = Column(String(50), primary_key=True)
    file_path = Column(String(500), nullable=False, unique=True)
    file_name = Column(String(200), nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    chunk_count = Column(Integer, default=0)
    status = Column(String(20), default="pending")  # pending/indexing/indexed/failed/outdated
    error_message = Column(Text, nullable=True)
    last_indexed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RagSettings(Base):
    """RAG laboratory configuration (single-row settings table)."""
    __tablename__ = "rag_settings"

    id = Column(Integer, primary_key=True, default=1)
    chunk_strategy = Column(String(20), default="recursive")  # fixed/recursive/markdown/semantic
    chunk_size = Column(Integer, default=512)
    chunk_overlap = Column(Integer, default=128)
    separator = Column(String(50), default="\n\n")
    retrieval_mode = Column(String(20), default="vector")  # vector/keyword/hybrid
    top_k = Column(Integer, default=5)
    score_threshold = Column(Float, default=0.5)
    rerank_enabled = Column(Boolean, default=False)
    rerank_top_n = Column(Integer, default=5)
    embedding_model_id = Column(Integer, nullable=True)  # references model_configs.id
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
