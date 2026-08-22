"""Knowledge / RAG REST API router."""
import os
import time
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import state
from ..services.model_service import ModelManagementService
from .rag_config import get_rag_settings, RagConfig
from .indexer import KnowledgeIndexer, _get_embedding_provider, KNOWLEDGE_COLLECTION
from .retriever import KnowledgeRetriever

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge"])


def _get_encryptor():
    if not state.model_encryptor:
        raise HTTPException(status_code=500, detail="Model encryptor not initialized")
    return state.model_encryptor


def _get_persist_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "..", "..", "data", "memory")


@router.get("/stats")
async def knowledge_stats(db: Session = Depends(get_db)):
    """Knowledge base statistics."""
    encryptor = _get_encryptor()
    config = get_rag_settings(db)
    indexer = KnowledgeIndexer(db, encryptor, config, _get_persist_dir())
    return {"ok": True, "stats": indexer.get_stats()}


@router.get("/documents")
async def list_documents(db: Session = Depends(get_db)):
    """List indexed documents."""
    encryptor = _get_encryptor()
    config = get_rag_settings(db)
    indexer = KnowledgeIndexer(db, encryptor, config, _get_persist_dir())
    docs = indexer.list_documents()
    return {
        "ok": True,
        "documents": [
            {
                "id": d.id,
                "file_path": d.file_path,
                "file_name": d.file_name,
                "file_size": d.file_size,
                "mime_type": d.mime_type,
                "chunk_count": d.chunk_count,
                "status": d.status,
                "error_message": d.error_message,
                "last_indexed_at": d.last_indexed_at.isoformat() if d.last_indexed_at else None,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
    }


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, db: Session = Depends(get_db)):
    """Delete a document index."""
    encryptor = _get_encryptor()
    config = get_rag_settings(db)
    indexer = KnowledgeIndexer(db, encryptor, config, _get_persist_dir())
    indexer.delete_document(doc_id)
    return {"ok": True, "deleted": doc_id}


class IndexRequest(BaseModel):
    path: str


@router.post("/index/{path:path}")
async def index_path(
    path: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Index a file or directory (background task)."""
    from ..cloud_space.file_service import get_path, ensure_root
    encryptor = _get_encryptor()
    config = get_rag_settings(db)

    rel = path.lstrip("/")
    target = get_path(rel)

    async def _index_one(rel_path: str, file_path):
        from pathlib import Path
        indexer = KnowledgeIndexer(db, encryptor, config, _get_persist_dir())
        try:
            await indexer.index_file(rel_path, Path(file_path))
        except Exception as e:
            print(f"⚠️ Index failed for {rel_path}: {e}")

    if target.is_file():
        background_tasks.add_task(_index_one, rel, target)
        return {"ok": True, "message": f"Indexing {rel}"}
    elif target.is_dir():
        tasks = []
        for root, _, files in os.walk(target):
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext in {".md", ".txt", ".pdf", ".docx", ".html"}:
                    fp = os.path.join(root, fname)
                    r = os.path.relpath(fp, ensure_root())
                    tasks.append((r, fp))
        for r, fp in tasks:
            background_tasks.add_task(_index_one, r, fp)
        return {"ok": True, "message": f"Indexing {len(tasks)} files in {rel}"}
    raise HTTPException(status_code=404, detail="Path not found")


class ReindexRequest(BaseModel):
    pass


@router.post("/reindex-all")
async def reindex_all(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Re-index all supported documents in cloud-space."""
    from ..cloud_space.file_service import ensure_root
    encryptor = _get_encryptor()
    config = get_rag_settings(db)

    async def _run():
        from pathlib import Path
        indexer = KnowledgeIndexer(db, encryptor, config, _get_persist_dir())
        # Clear existing: drop and recreate collection
        try:
            client = indexer.client
            try:
                client.delete_collection(KNOWLEDGE_COLLECTION)
            except Exception:
                pass
            indexer.collection = client.get_or_create_collection(
                KNOWLEDGE_COLLECTION,
                metadata={"hnsw:space": "cosine"},
            )
        except Exception as e:
            print(f"⚠️ Clear collection failed: {e}")
        # Delete all knowledge_document rows
        from ..models import KnowledgeDocument
        db.query(KnowledgeDocument).delete()
        db.commit()
        # Walk cloud-space
        root = ensure_root()
        tasks = []
        for dirpath, _, files in os.walk(root):
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext in {".md", ".txt", ".pdf", ".docx", ".html"}:
                    fp = os.path.join(dirpath, fname)
                    r = os.path.relpath(fp, root)
                    tasks.append((r, fp))
        for r, fp in tasks:
            try:
                await indexer.index_file(r, Path(fp))
            except Exception as e:
                print(f"⚠️ Reindex failed for {r}: {e}")
        print(f"✅ Reindexed {len(tasks)} documents")

    background_tasks.add_task(_run)
    return {"ok": True, "message": "Reindex started in background"}


class QueryRequest(BaseModel):
    query: str
    top_k: Optional[int] = None
    retrieval_mode: Optional[str] = None
    directory_filter: Optional[List[str]] = None


@router.post("/query")
async def query_knowledge(request: QueryRequest, db: Session = Depends(get_db)):
    """Direct retrieval test endpoint."""
    start = time.time()
    encryptor = _get_encryptor()
    config = get_rag_settings(db)

    # Override config with request params
    if request.retrieval_mode:
        config.retrieval_mode = request.retrieval_mode
    if request.top_k:
        config.top_k = request.top_k

    provider = _get_embedding_provider(db, encryptor, config)
    retriever = KnowledgeRetriever(
        provider=provider,
        persist_dir=_get_persist_dir(),
        retrieval_mode=config.retrieval_mode,
        top_k=config.top_k,
        score_threshold=config.score_threshold,
        rerank_enabled=config.rerank_enabled,
        rerank_top_n=config.rerank_top_n,
    )

    where_filter = None
    if request.directory_filter:
        where_filter = {"file_path": {"$in": request.directory_filter}}

    results = await retriever.retrieve(request.query, where_filter=where_filter)
    return {
        "ok": True,
        "results": [
            {
                "chunk_id": r.chunk_id,
                "content": r.content,
                "file_name": r.file_name,
                "file_path": r.file_path,
                "score": round(r.score, 4),
                "chunk_index": r.chunk_index,
            }
            for r in results
        ],
        "total_results": len(results),
        "query_time_ms": round((time.time() - start) * 1000),
    }
