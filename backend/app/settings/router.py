"""Settings REST API router (RAG lab configuration)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..knowledge.rag_config import get_rag_settings, update_rag_settings, RagConfig

router = APIRouter(prefix="/api/settings", tags=["Settings"])


class RagSettingsPayload(BaseModel):
    chunk_strategy: str = "recursive"
    chunk_size: int = 512
    chunk_overlap: int = 128
    separator: str = "\n\n"
    retrieval_mode: str = "vector"
    top_k: int = 5
    score_threshold: float = 0.5
    rerank_enabled: bool = False
    rerank_top_n: int = 5
    embedding_model_id: int | None = None


@router.get("/rag")
async def get_rag(db: Session = Depends(get_db)):
    cfg = get_rag_settings(db)
    return {"ok": True, "settings": cfg.__dict__}


@router.put("/rag")
async def put_rag(payload: RagSettingsPayload, db: Session = Depends(get_db)):
    cfg = RagConfig(**payload.dict())
    updated = update_rag_settings(db, cfg)
    return {"ok": True, "settings": updated.__dict__}
