"""Knowledge indexer: parse / chunk / embed / store in ChromaDB."""
import os
import uuid
from pathlib import Path
from typing import List, Optional
from sqlalchemy.orm import Session

import chromadb
from chromadb.config import Settings

from ..models import KnowledgeDocument
from ..services.model_service import ModelManagementService, ModelKeyEncryptor
from .parser import DocumentParser
from .chunker import TextChunker
from .embedding_provider import (
    EmbeddingProvider,
    DashScopeEmbeddingProvider,
    OpenAIEmbeddingProvider,
    LocalEmbeddingProvider,
)
from .rag_config import RagConfig


KNOWLEDGE_COLLECTION = "knowledge_chunks"


def _get_chroma_client(persist_dir: str = "data/memory"):
    os.makedirs(persist_dir, exist_ok=True)
    return chromadb.PersistentClient(
        path=persist_dir,
        settings=Settings(anonymized_telemetry=False),
    )


def _is_dashscope_model(model: dict) -> bool:
    """Detect DashScope/qwen embedding models regardless of provider field."""
    provider = (model.get("provider") or "").lower()
    model_name = (model.get("model_name") or "").lower()
    base_url = (model.get("base_url") or "").lower()
    return (
        provider == "dashscope"
        or "dashscope" in base_url
        or "qwen" in model_name
    )


def _get_embedding_provider(
    db: Session,
    encryptor: ModelKeyEncryptor,
    config: RagConfig,
) -> EmbeddingProvider:
    # Try configured embedding model first
    if config.embedding_model_id:
        service = ModelManagementService(db, encryptor)
        model = service.get_config(config.embedding_model_id)
        if model:
            api_key = service.get_decrypted_key(model["id"])
            if api_key:
                if _is_dashscope_model(model):
                    return DashScopeEmbeddingProvider(
                        api_key=api_key,
                        model=model["model_name"],
                        base_url=model.get("base_url"),
                    )
                return OpenAIEmbeddingProvider(
                    api_key=api_key,
                    model=model["model_name"],
                    base_url=model.get("base_url"),
                )

    # Fallback: any default embedding config
    service = ModelManagementService(db, encryptor)
    default = service.get_default_embedding()
    if default:
        api_key = service.get_decrypted_key(default.id)
        if api_key:
            if _is_dashscope_model({
                "provider": default.provider,
                "model_name": default.model_name,
                "base_url": default.base_url,
            }):
                return DashScopeEmbeddingProvider(
                    api_key=api_key,
                    model=default.model_name,
                    base_url=default.base_url,
                )
            return OpenAIEmbeddingProvider(
                api_key=api_key,
                model=default.model_name,
                base_url=default.base_url,
            )

    return LocalEmbeddingProvider()


class KnowledgeIndexer:
    """Indexes documents into the knowledge collection."""

    def __init__(
        self,
        db: Session,
        encryptor: ModelKeyEncryptor,
        config: RagConfig,
        persist_dir: str = "data/memory",
    ):
        self.db = db
        self.encryptor = encryptor
        self.config = config
        self.parser = DocumentParser()
        self.chunker = TextChunker(
            strategy=config.chunk_strategy,
            chunk_size=config.chunk_size,
            overlap=config.chunk_overlap,
            separator=config.separator,
        )
        self.provider = _get_embedding_provider(db, encryptor, config)
        self.client = _get_chroma_client(persist_dir)
        self.collection = self.client.get_or_create_collection(
            KNOWLEDGE_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )

    async def index_file(self, relative_path: str, file_path: Path) -> KnowledgeDocument:
        doc_id = f"doc_{uuid.uuid4().hex[:12]}"
        doc = KnowledgeDocument(
            id=doc_id,
            file_path=relative_path,
            file_name=file_path.name,
            file_size=file_path.stat().st_size,
            mime_type=self._guess_mime(file_path),
            status="indexing",
        )
        self.db.add(doc)
        self.db.commit()

        try:
            parsed = self.parser.parse(str(file_path))
            chunks = self.chunker.chunk(parsed.content)

            if not chunks:
                doc.status = "indexed"
                doc.chunk_count = 0
                doc.last_indexed_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
                self.db.commit()
                return doc

            texts = [c.content for c in chunks]
            embeddings = await self.provider.embed(texts)

            ids = [f"chunk_{uuid.uuid4().hex}" for _ in chunks]
            metadatas = [
                {
                    "document_id": doc_id,
                    "file_path": relative_path,
                    "file_name": file_path.name,
                    "chunk_index": c.chunk_index,
                    "chunk_strategy": self.config.chunk_strategy,
                    "chunk_size": self.config.chunk_size,
                    "start_char": c.start_char,
                    "end_char": c.end_char,
                }
                for c in chunks
            ]

            # ChromaDB add in batches
            batch = 100
            for i in range(0, len(ids), batch):
                self.collection.add(
                    ids=ids[i : i + batch],
                    documents=texts[i : i + batch],
                    embeddings=embeddings[i : i + batch],
                    metadatas=metadatas[i : i + batch],
                )

            doc.status = "indexed"
            doc.chunk_count = len(chunks)
            doc.last_indexed_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
            doc.error_message = None
        except Exception as e:
            doc.status = "failed"
            doc.error_message = str(e)[:500]
            raise
        finally:
            self.db.commit()
        return doc

    def delete_document(self, doc_id: str):
        doc = self.db.get(KnowledgeDocument, doc_id)
        if not doc:
            return
        try:
            self.collection.delete(where={"document_id": doc_id})
        except Exception as e:
            print(f"⚠️ ChromaDB delete failed for {doc_id}: {e}")
        self.db.delete(doc)
        self.db.commit()

    def delete_by_path(self, relative_path: str):
        doc = self.db.query(KnowledgeDocument).filter_by(file_path=relative_path).first()
        if doc:
            self.delete_document(doc.id)

    def list_documents(self) -> List[KnowledgeDocument]:
        return self.db.query(KnowledgeDocument).order_by(KnowledgeDocument.created_at.desc()).all()

    def get_stats(self) -> dict:
        total_docs = self.db.query(KnowledgeDocument).count()
        indexed = self.db.query(KnowledgeDocument).filter(KnowledgeDocument.status == "indexed").count()
        failed = self.db.query(KnowledgeDocument).filter(KnowledgeDocument.status == "failed").count()
        total_chunks = sum(d.chunk_count or 0 for d in self.db.query(KnowledgeDocument).all())
        return {
            "total_documents": total_docs,
            "indexed_documents": indexed,
            "failed_documents": failed,
            "total_chunks": total_chunks,
        }

    def _guess_mime(self, path: Path) -> str:
        import mimetypes
        mime, _ = mimetypes.guess_type(str(path))
        return mime or "application/octet-stream"
