"""
Vector Memory System for AiCumi

Provides long-term memory capabilities using vector embeddings for semantic search.
"""

import os
import json
import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass, field, asdict

# Try to import chromadb, fallback to in-memory if not available
try:
    import chromadb
    from chromadb.config import Settings
    HAS_CHROMADB = True
except ImportError:
    HAS_CHROMADB = False

# Try to import openai for embeddings
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False


@dataclass
class MemoryEntry:
    """A single memory entry."""
    id: str
    content: str
    agent_id: str
    memory_type: str  # "conversation", "fact", "preference", "task"
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""
    embedding: Optional[List[float]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "agent_id": self.agent_id,
            "memory_type": self.memory_type,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class VectorMemory:
    """Vector-based memory system with semantic search."""
    
    def __init__(
        self,
        persist_dir: str = "data/memory",
        embedding_model: str = "text-embedding-3-small",
        collection_name: str = "agent_memory",
        model_service=None,
    ):
        self.persist_dir = persist_dir
        self.embedding_model = embedding_model
        self.collection_name = collection_name
        self._client = None
        self._collection = None
        self._openai_client = None
        self._in_memory_store: List[MemoryEntry] = []
        self._model_service = model_service
        
        # Initialize
        self._init_chromadb()
        self._init_embedding()
    
    def _init_chromadb(self):
        """Initialize ChromaDB client."""
        if not HAS_CHROMADB:
            print("⚠️ ChromaDB not available, using in-memory store")
            return
        
        try:
            os.makedirs(self.persist_dir, exist_ok=True)
            self._client = chromadb.PersistentClient(
                path=self.persist_dir,
                settings=Settings(anonymized_telemetry=False),
            )
            self._collection = self._client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"},
            )
            print(f"✅ ChromaDB initialized: {self.persist_dir}")
        except Exception as e:
            print(f"⚠️ ChromaDB initialization failed: {e}")
            self._client = None
            self._collection = None
    
    def _init_embedding(self):
        """Initialize embedding client from model service or environment."""
        # Try model service first (unified config)
        if self._model_service:
            try:
                embedding_config = self._model_service.get_default_embedding()
                if embedding_config:
                    api_key = self._model_service.get_decrypted_key(embedding_config.id)
                    if api_key:
                        kwargs = {"api_key": api_key}
                        if embedding_config.base_url:
                            kwargs["base_url"] = embedding_config.base_url
                        self._openai_client = OpenAI(**kwargs)
                        self.embedding_model = embedding_config.model_name
                        print(f"✅ Embedding from config: {embedding_config.provider}/{self.embedding_model}")
                        return
            except Exception as e:
                print(f"⚠️ Failed to load embedding from config: {e}")
        
        # Fallback to environment variables
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL")
        
        if api_key:
            kwargs = {"api_key": api_key}
            if base_url:
                kwargs["base_url"] = base_url
            self._openai_client = OpenAI(**kwargs)
            print(f"✅ Embedding from env: {self.embedding_model}")
        else:
            print("⚠️ No embedding config found, using keyword fallback")
    
    def _get_embedding(self, text: str) -> Optional[List[float]]:
        """Get embedding for text.

        Uses the configured OpenAI-compatible embedding client when available;
        otherwise falls back to a deterministic local bag-of-words hash embedding
        so the memory system works out-of-the-box (persists to ChromaDB + gives
        keyword-style semantic similarity) without any external API key.
        """
        if self._openai_client:
            try:
                response = self._openai_client.embeddings.create(
                    model=self.embedding_model,
                    input=text,
                )
                return response.data[0].embedding
            except Exception as e:
                print(f"⚠️ Embedding failed, using local fallback: {e}")
        return self._local_embedding(text)

    @staticmethod
    def _local_embedding(text: str, dim: int = 256) -> List[float]:
        """Deterministic bag-of-words hash embedding (no external dependency)."""
        import hashlib
        import math
        import re
        vec = [0.0] * dim
        for tok in re.findall(r"[\w\u4e00-\u9fff]+", (text or "").lower()):
            h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
            idx = h % dim
            sign = 1.0 if (h >> 16) & 1 else -1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]
    
    def add(
        self,
        content: str,
        agent_id: str,
        memory_type: str = "conversation",
        metadata: Optional[Dict[str, Any]] = None,
        scope: str = "private",
    ) -> MemoryEntry:
        """Add a new memory entry.

        ``scope``: L5 共享状态层——"private" 仅属主可见；"team" 全团队可检索。
        """
        entry = MemoryEntry(
            id=str(uuid.uuid4()),
            content=content,
            agent_id=agent_id,
            memory_type=memory_type,
            metadata=metadata or {},
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
        )

        # Get embedding
        embedding = self._get_embedding(content)
        entry.embedding = embedding

        # Store in ChromaDB if available
        if self._collection and embedding:
            try:
                self._collection.add(
                    ids=[entry.id],
                    documents=[content],
                    embeddings=[embedding],
                    metadatas=[{
                        "agent_id": agent_id,
                        "memory_type": memory_type,
                        "created_at": entry.created_at,
                        "scope": scope if scope in ("private", "team") else "private",
                        **(metadata or {}),
                    }],
                )
            except Exception as e:
                print(f"⚠️ ChromaDB add failed: {e}")

        # Always store in memory as backup
        self._in_memory_store.append(entry)

        return entry

    def search(
        self,
        query: str,
        agent_id: Optional[str] = None,
        memory_type: Optional[str] = None,
        n_results: int = 5,
        include_team: bool = False,
    ) -> List[MemoryEntry]:
        """Search memories by semantic similarity.

        ``include_team``: L5 共享状态层——开启后检索范围为
        「本人私有记忆 ∪ 团队共享记忆（scope=team）」。
        """
        # Try ChromaDB first
        if self._collection:
            try:
                # Build filter
                if include_team and agent_id:
                    # 本人私有（含无 scope 字段的旧数据）+ 团队共享
                    where_filter = {"$or": [
                        {"agent_id": agent_id},
                        {"scope": "team"},
                    ]}
                else:
                    where_filter = {}
                    if agent_id:
                        where_filter["agent_id"] = agent_id
                    if memory_type:
                        where_filter["memory_type"] = memory_type
                    where_filter = where_filter or None

                # Get embedding for query
                query_embedding = self._get_embedding(query)
                if query_embedding:
                    results = self._collection.query(
                        query_embeddings=[query_embedding],
                        n_results=n_results,
                        where=where_filter,
                    )

                    # Convert to MemoryEntry objects
                    entries = []
                    for i, doc_id in enumerate(results["ids"][0]):
                        metadata = results["metadatas"][0][i] if results["metadatas"] else {}
                        entries.append(MemoryEntry(
                            id=doc_id,
                            content=results["documents"][0][i],
                            agent_id=metadata.get("agent_id", ""),
                            memory_type=metadata.get("memory_type", "conversation"),
                            metadata=metadata,
                            created_at=metadata.get("created_at", ""),
                        ))

                    # No hits in ChromaDB → also search the in-memory fallback store
                    if not entries:
                        return self._in_memory_search(query, agent_id, memory_type, n_results, include_team)
                    return entries
            except Exception as e:
                print(f"⚠️ ChromaDB search failed: {e}")

        # Fallback to in-memory search
        return self._in_memory_search(query, agent_id, memory_type, n_results, include_team)

    def _in_memory_search(
        self,
        query: str,
        agent_id: Optional[str],
        memory_type: Optional[str],
        n_results: int,
        include_team: bool = False,
    ) -> List[MemoryEntry]:
        """Simple in-memory search fallback."""
        results = []
        query_lower = query.lower()

        for entry in self._in_memory_store:
            # L5 scope filter：本人私有 ∪（可选）团队共享
            if agent_id and entry.agent_id != agent_id:
                if not (include_team and entry.metadata.get("scope") == "team"):
                    continue
            # Filter by memory_type
            if memory_type and entry.memory_type != memory_type:
                continue

            # Simple keyword matching (no embeddings)
            if query_lower in entry.content.lower():
                results.append(entry)

        return results[:n_results]
    
    def get_by_agent(self, agent_id: str, limit: int = 50) -> List[MemoryEntry]:
        """Get all memories for an agent.

        Merges ChromaDB results with the in-memory fallback store (dedup by id)
        so memories are visible even when only the local fallback embedding is
        being used.
        """
        entries: List[MemoryEntry] = []
        seen: set = set()
        if self._collection:
            try:
                results = self._collection.get(
                    where={"agent_id": agent_id},
                    limit=limit,
                )
                for i, doc_id in enumerate(results["ids"]):
                    metadata = results["metadatas"][i] if results["metadatas"] else {}
                    entries.append(MemoryEntry(
                        id=doc_id,
                        content=results["documents"][i],
                        agent_id=metadata.get("agent_id", ""),
                        memory_type=metadata.get("memory_type", "conversation"),
                        metadata=metadata,
                        created_at=metadata.get("created_at", ""),
                    ))
                    seen.add(doc_id)
            except Exception as e:
                print(f"⚠️ ChromaDB get failed: {e}")

        # Merge in-memory fallback store (no embedding / keyword mode)
        for e in self._in_memory_store:
            if e.agent_id == agent_id and e.id not in seen:
                entries.append(e)
                seen.add(e.id)
                if len(entries) >= limit:
                    break
        return entries[:limit]
    
    def delete(self, memory_id: str) -> bool:
        """Delete a memory entry."""
        if self._collection:
            try:
                self._collection.delete(ids=[memory_id])
            except Exception as e:
                print(f"⚠️ ChromaDB delete failed: {e}")
        
        # Also remove from in-memory store
        original_len = len(self._in_memory_store)
        self._in_memory_store = [e for e in self._in_memory_store if e.id != memory_id]
        return len(self._in_memory_store) < original_len
    
    def update_scope(self, memory_id: str, scope: str) -> bool:
        """Update a memory's scope（L5：private ↔ team 手动升格/降格）.

        ChromaDB metadata 不可原地修改，采用 get → delete → re-add 保嵌入不变。
        注意 include 参数不能含 embeddings（numpy 数组真值判断会报错），重嵌入
        由 add 内部完成。
        """
        if scope not in ("private", "team"):
            return False
        updated = False
        if self._collection:
            try:
                got = self._collection.get(ids=[memory_id], include=["documents", "metadatas"])
                if got and got.get("ids"):
                    meta = (got.get("metadatas") or [{}])[0] or {}
                    doc = (got.get("documents") or [""])[0]
                    meta["scope"] = scope
                    self._collection.delete(ids=[memory_id])
                    # 重新入库（add 会重新计算嵌入，语义不变）
                    self.add(doc, meta.get("agent_id", ""), meta.get("memory_type", "conversation"), meta, scope)
                    updated = True
            except Exception as e:
                print(f"⚠️ ChromaDB update_scope failed: {e}")
        # in-memory fallback store
        for e in self._in_memory_store:
            if e.id == memory_id:
                e.metadata["scope"] = scope
                updated = True
        return updated
    
    def clear(self, agent_id: Optional[str] = None) -> int:
        """Clear memories, optionally filtered by agent."""
        if agent_id:
            if self._collection:
                try:
                    self._collection.delete(where={"agent_id": agent_id})
                except Exception as e:
                    print(f"⚠️ ChromaDB clear failed: {e}")
            
            original_len = len(self._in_memory_store)
            self._in_memory_store = [e for e in self._in_memory_store if e.agent_id != agent_id]
            return original_len - len(self._in_memory_store)
        else:
            if self._collection:
                try:
                    self._client.delete_collection(self.collection_name)
                    self._collection = self._client.get_or_create_collection(
                        name=self.collection_name,
                        metadata={"hnsw:space": "cosine"},
                    )
                except Exception as e:
                    print(f"⚠️ ChromaDB clear failed: {e}")
            
            count = len(self._in_memory_store)
            self._in_memory_store.clear()
            return count
    
    def stats(self) -> Dict[str, Any]:
        """Get memory statistics."""
        chromadb_count = 0
        if self._collection:
            try:
                chromadb_count = self._collection.count()
            except:
                pass
        
        return {
            "chromadb_available": self._collection is not None,
            "embedding_available": self._openai_client is not None,
            "chromadb_count": chromadb_count,
            "in_memory_count": len(self._in_memory_store),
            "persist_dir": self.persist_dir,
            "embedding_model": self.embedding_model,
        }

# Note: Global instance is created via init_memory() in __init__.py
# Do NOT create it here to allow model_service injection
