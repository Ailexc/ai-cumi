"""RAG configuration management (DB-backed)."""
from dataclasses import dataclass, asdict
from typing import Optional
from sqlalchemy.orm import Session

from ..models import RagSettings


@dataclass
class RagConfig:
    chunk_strategy: str = "recursive"
    chunk_size: int = 512
    chunk_overlap: int = 128
    separator: str = "\n\n"
    retrieval_mode: str = "vector"
    top_k: int = 5
    score_threshold: float = 0.5
    rerank_enabled: bool = False
    rerank_top_n: int = 5
    embedding_model_id: Optional[int] = None


def get_rag_settings(db: Session) -> RagConfig:
    row = db.get(RagSettings, 1)
    if not row:
        row = RagSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return RagConfig(
        chunk_strategy=row.chunk_strategy,
        chunk_size=row.chunk_size,
        chunk_overlap=row.chunk_overlap,
        separator=row.separator,
        retrieval_mode=row.retrieval_mode,
        top_k=row.top_k,
        score_threshold=row.score_threshold,
        rerank_enabled=row.rerank_enabled,
        rerank_top_n=row.rerank_top_n,
        embedding_model_id=row.embedding_model_id,
    )


def update_rag_settings(db: Session, config: RagConfig) -> RagConfig:
    row = db.get(RagSettings, 1)
    if not row:
        row = RagSettings(id=1)
        db.add(row)
    for key, value in asdict(config).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return get_rag_settings(db)
