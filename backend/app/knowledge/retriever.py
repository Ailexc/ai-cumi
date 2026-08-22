"""Retrieval strategies: vector / keyword / hybrid."""
import re
import math
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

import chromadb
from chromadb.config import Settings

from .embedding_provider import EmbeddingProvider


@dataclass
class RetrievalResult:
    chunk_id: str
    content: str
    file_name: str
    file_path: str
    score: float
    chunk_index: int
    document_id: str


class KnowledgeRetriever:
    """Retrieve relevant chunks from ChromaDB."""

    def __init__(
        self,
        provider: EmbeddingProvider,
        persist_dir: str = "data/memory",
        retrieval_mode: str = "vector",
        top_k: int = 5,
        score_threshold: float = 0.5,
        rerank_enabled: bool = False,
        rerank_top_n: int = 5,
    ):
        self.provider = provider
        self.retrieval_mode = retrieval_mode
        self.top_k = top_k
        self.score_threshold = score_threshold
        self.rerank_enabled = rerank_enabled
        self.rerank_top_n = rerank_top_n
        self.client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            "knowledge_chunks",
            metadata={"hnsw:space": "cosine"},
        )

    async def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        where_filter: Optional[Dict[str, Any]] = None,
    ) -> List[RetrievalResult]:
        k = top_k or self.top_k
        vector_results: List[RetrievalResult] = []
        keyword_results: List[RetrievalResult] = []

        if self.retrieval_mode in ("vector", "hybrid"):
            vector_results = await self._vector_search(query, k * 2, where_filter)

        if self.retrieval_mode in ("keyword", "hybrid"):
            keyword_results = self._keyword_search(query, k * 2, where_filter)

        if self.retrieval_mode == "hybrid":
            fused = self._rrf_fusion(vector_results, keyword_results)
        elif self.retrieval_mode == "keyword":
            fused = keyword_results
        else:
            fused = vector_results

        # Apply score threshold
        fused = [r for r in fused if r.score >= self.score_threshold]

        if self.rerank_enabled:
            fused = self._simple_rerank(query, fused)[: self.rerank_top_n]

        return fused[:k]

    async def _vector_search(
        self,
        query: str,
        n: int,
        where_filter: Optional[Dict[str, Any]],
    ) -> List[RetrievalResult]:
        embedding = await self.provider.embed([query])
        if not embedding or not embedding[0]:
            return []
        results = self.collection.query(
            query_embeddings=[embedding[0]],
            n_results=n,
            where=where_filter,
        )
        out: List[RetrievalResult] = []
        ids = results.get("ids", [[]])[0]
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        for i, chunk_id in enumerate(ids):
            if not chunk_id:
                continue
            dist = distances[i] if i < len(distances) else 0.0
            # cosine distance -> similarity
            score = max(0.0, 1.0 - float(dist))
            meta = metas[i] or {}
            out.append(RetrievalResult(
                chunk_id=chunk_id,
                content=docs[i] or "",
                file_name=meta.get("file_name", ""),
                file_path=meta.get("file_path", ""),
                score=score,
                chunk_index=int(meta.get("chunk_index", 0)),
                document_id=meta.get("document_id", ""),
            ))
        return out

    def _keyword_search(
        self,
        query: str,
        n: int,
        where_filter: Optional[Dict[str, Any]],
    ) -> List[RetrievalResult]:
        # Pull a larger candidate set then rank by BM25-ish score
        try:
            results = self.collection.get(where=where_filter, limit=2000)
        except Exception:
            return []

        ids = results.get("ids", [])
        docs = results.get("documents", [])
        metas = results.get("metadatas", [])
        terms = [t.lower() for t in re.findall(r"[\w\u4e00-\u9fff]+", query) if len(t) > 1]
        if not terms:
            return []

        scored = []
        for i, doc in enumerate(docs):
            if not doc:
                continue
            text = doc.lower()
            score = sum(1.0 for term in terms if term in text)
            if score > 0:
                meta = metas[i] or {}
                scored.append((score, i))

        scored.sort(reverse=True)
        out: List[RetrievalResult] = []
        for score, i in scored[:n]:
            meta = metas[i] or {}
            # normalize rough score to 0..1
            norm_score = min(1.0, score / len(terms))
            out.append(RetrievalResult(
                chunk_id=ids[i],
                content=docs[i],
                file_name=meta.get("file_name", ""),
                file_path=meta.get("file_path", ""),
                score=norm_score,
                chunk_index=int(meta.get("chunk_index", 0)),
                document_id=meta.get("document_id", ""),
            ))
        return out

    def _rrf_fusion(self, *result_lists: List[RetrievalResult]) -> List[RetrievalResult]:
        k = 60
        scores: Dict[str, float] = {}
        metas: Dict[str, RetrievalResult] = {}
        for results in result_lists:
            for rank, r in enumerate(results):
                scores[r.chunk_id] = scores.get(r.chunk_id, 0.0) + 1.0 / (k + rank + 1)
                if r.chunk_id not in metas:
                    metas[r.chunk_id] = r
        # Normalize scores to 0..1 range so score_threshold works correctly
        max_score = max(scores.values()) if scores else 1.0
        for cid, r in metas.items():
            r.score = scores[cid] / max_score
        return sorted(metas.values(), key=lambda x: x.score, reverse=True)

    def _simple_rerank(self, query: str, results: List[RetrievalResult]) -> List[RetrievalResult]:
        terms = set(t.lower() for t in re.findall(r"[\w\u4e00-\u9fff]+", query) if len(t) > 1)
        for r in results:
            text = r.content.lower()
            hits = sum(1 for t in terms if t in text)
            # Keyword density bonus (capped to avoid overflow)
            r.score = min(1.0, r.score + 0.05 * hits)
        return sorted(results, key=lambda x: x.score, reverse=True)
