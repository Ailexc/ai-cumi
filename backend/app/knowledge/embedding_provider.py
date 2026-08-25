"""Embedding providers with fallback and DashScope support."""
from abc import ABC, abstractmethod
from typing import List, Optional
import hashlib
import math
import re

import httpx


class EmbeddingProvider(ABC):
    """Embedding provider abstract base."""

    @abstractmethod
    async def embed(self, texts: List[str]) -> List[List[float]]:
        pass

    @abstractmethod
    def dimensions(self) -> int:
        pass


class DashScopeEmbeddingProvider(EmbeddingProvider):
    """Qwen DashScope text embedding."""

    def __init__(self, api_key: str, model: str = "qwen3.7-text-embedding", base_url: str | None = None):
        self.api_key = api_key
        self.model = model
        self.base_url = (base_url or "https://dashscope.aliyuncs.com").rstrip("/")
        if self.base_url.endswith("/api/v1"):
            self.api_url = f"{self.base_url}/services/embeddings/text-embedding/text-embedding"
        else:
            self.api_url = f"{self.base_url}/api/v1/services/embeddings/text-embedding/text-embedding"

    async def embed(self, texts: List[str]) -> List[List[float]]:
        batch_size = 25
        all_embeddings: List[List[float]] = []
        async with httpx.AsyncClient() as client:
            for i in range(0, len(texts), batch_size):
                batch = texts[i : i + batch_size]
                resp = await client.post(
                    self.api_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"model": self.model, "input": {"texts": batch}},
                    timeout=60.0,
                )
                resp.raise_for_status()
                data = resp.json()
                embs = sorted(data["output"]["embeddings"], key=lambda x: x["text_index"])
                all_embeddings.extend([e["embedding"] for e in embs])
        return all_embeddings

    def dimensions(self) -> int:
        return 1024


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI-compatible embedding endpoint."""

    # Conservative batch size: DashScope compatible-mode limits
    # qwen3.7-text-embedding to 20 texts per request.
    BATCH_SIZE = 20

    def __init__(self, api_key: str, model: str = "text-embedding-3-small", base_url: str | None = None):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        try:
            from openai import AsyncOpenAI
            kwargs = {"api_key": api_key}
            if base_url:
                kwargs["base_url"] = base_url
            self.client = AsyncOpenAI(**kwargs)
        except ImportError:
            self.client = None

    async def embed(self, texts: List[str]) -> List[List[float]]:
        if not self.client:
            raise RuntimeError("openai not installed")
        all_embeddings: List[List[float]] = []
        for i in range(0, len(texts), self.BATCH_SIZE):
            batch = texts[i : i + self.BATCH_SIZE]
            resp = await self.client.embeddings.create(model=self.model, input=batch)
            # Sort by index to preserve order across batches
            ordered = sorted(resp.data, key=lambda d: d.index)
            all_embeddings.extend(d.embedding for d in ordered)
        return all_embeddings

    def dimensions(self) -> int:
        # best guess; not critical for runtime
        return 1536 if "3-small" in self.model else 3072


class LocalEmbeddingProvider(EmbeddingProvider):
    """Deterministic hash-based fallback embedding (no external API)."""

    def __init__(self, dim: int = 256):
        self.dim = dim

    async def embed(self, texts: List[str]) -> List[List[float]]:
        return [self._hash_embed(t) for t in texts]

    def _hash_embed(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        for tok in re.findall(r"[\w\u4e00-\u9fff]+", (text or "").lower()):
            h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
            idx = h % self.dim
            sign = 1.0 if (h >> 16) & 1 else -1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def dimensions(self) -> int:
        return self.dim
