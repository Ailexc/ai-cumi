"""
Model connection testing service.

Dispatches a connection test to the right tester based on ``model_type``.
Testers self-register via :func:`register_tester`; adding a new model type
means adding one decorated function here — the API layer stays dumb.

Contract for every tester::

    async def tester(api_key: str, config: dict, start: float) -> dict:
        return {"status": "ok"|"error", "reply": str, "latency_ms": int, ...}

``config`` is the sanitized config dict from ``ModelManagementService.get_config``
(keys: provider / model_name / base_url / model_type ...). ``start`` is the
``time.time()`` captured before dispatch so latency covers the whole path.
"""
import time
from typing import Callable, Dict, Optional

_TESTERS: Dict[str, Callable] = {}


def register_tester(*model_types: str) -> Callable:
    """Decorator: enroll a tester for one or more model types."""

    def decorator(fn: Callable) -> Callable:
        for t in model_types:
            _TESTERS[t] = fn
        return fn

    return decorator


async def run_model_test(model_type: str, api_key: str, config: dict, start: Optional[float] = None) -> dict:
    """Dispatch a connection test by model type."""
    start = start if start is not None else time.time()
    tester = _TESTERS.get(model_type)
    if not tester:
        return {
            "status": "error",
            "error": f"不支持的模型类型: {model_type}（已支持: {sorted(_TESTERS)}）",
            "latency_ms": round((time.time() - start) * 1000),
        }
    try:
        return await tester(api_key=api_key, config=config, start=start)
    except Exception as e:
        return {"status": "error", "error": str(e), "latency_ms": round((time.time() - start) * 1000)}


# ---------------------------------------------------------------------------
# Chat-completion testers (llm / vision / code all speak OpenAI-compatible chat)
# ---------------------------------------------------------------------------

@register_tester("llm", "vision", "code")
async def _test_chat_model(api_key: str, config: dict, start: float) -> dict:
    from openai import AsyncOpenAI

    provider = config.get("provider", "")
    base_url = config.get("base_url")
    client_kwargs = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url
    elif provider == "anthropic":
        client_kwargs["base_url"] = "https://api.anthropic.com/v1"

    client = AsyncOpenAI(**client_kwargs)
    resp = await client.chat.completions.create(
        model=config["model_name"],
        messages=[{"role": "user", "content": "Say 'hello' in one word."}],
        max_tokens=10,
    )
    reply = resp.choices[0].message.content.strip()
    return {
        "status": "ok",
        "reply": reply,
        "latency_ms": round((time.time() - start) * 1000),
    }


# ---------------------------------------------------------------------------
# Embedding tester (DashScope native vs OpenAI-compatible sub-routing)
# ---------------------------------------------------------------------------

@register_tester("embedding")
async def _test_embedding_model(api_key: str, config: dict, start: float) -> dict:
    """Route by endpoint shape: DashScope native protocol vs OpenAI-compatible.

    Note: unlike knowledge/indexer's model-name heuristic, testing keys off the
    URL only — a compatible-mode endpoint must be tested with the OpenAI SDK.
    """
    base_url = (config.get("base_url") or "").lower()
    if "compatible-mode" in base_url:
        return await _test_openai_embedding(api_key, config["model_name"], config.get("base_url"), start)
    is_dashscope_native = (
        config.get("provider") == "dashscope"
        or "dashscope" in base_url
        or not base_url
    )
    if is_dashscope_native:
        return await _test_dashscope_embedding(api_key, config["model_name"], config.get("base_url"), start)
    return await _test_openai_embedding(api_key, config["model_name"], config.get("base_url"), start)


async def _test_dashscope_embedding(api_key: str, model_name: str, base_url: Optional[str], start: float) -> dict:
    import httpx

    base = (base_url or "https://dashscope.aliyuncs.com").rstrip("/")
    # Avoid double /api/v1 if base_url already includes it
    if base.endswith("/api/v1"):
        url = base + "/services/embeddings/text-embedding/text-embedding"
    else:
        url = base + "/api/v1/services/embeddings/text-embedding/text-embedding"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model_name, "input": {"texts": ["测试文本，用于验证连接是否正常"]}},
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
    dim = len(data["output"]["embeddings"][0]["embedding"])
    return {
        "status": "ok",
        "reply": f"连接成功，向量维度: {dim}",
        "latency_ms": round((time.time() - start) * 1000),
    }


async def _test_openai_embedding(api_key: str, model_name: str, base_url: Optional[str], start: float) -> dict:
    from openai import AsyncOpenAI

    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    client = AsyncOpenAI(**kwargs)
    resp = await client.embeddings.create(model=model_name, input=["hello"])
    dim = len(resp.data[0].embedding)
    return {
        "status": "ok",
        "reply": f"连接成功，向量维度: {dim}",
        "latency_ms": round((time.time() - start) * 1000),
    }


# ---------------------------------------------------------------------------
# Search tester — performs a REAL minimal query through the vendor adapter
# ---------------------------------------------------------------------------

@register_tester("search")
async def _test_search_model(api_key: str, config: dict, start: float) -> dict:
    """Execute an actual tiny search so 'test' means 'the tool will work'."""
    import asyncio

    from ..search import SearchError, create_provider

    endpoint = config.get("base_url") or ""
    provider = create_provider(endpoint=endpoint, api_key=api_key)
    results = await asyncio.to_thread(provider.search, "hello world", 3)
    latency = round((time.time() - start) * 1000)
    if not results:
        return {
            "status": "error",
            "error": f"连接成功但查询无结果（endpoint={endpoint}, provider={provider.name}）",
            "latency_ms": latency,
        }
    first = results[0]
    return {
        "status": "ok",
        "reply": (
            f"搜索服务正常（{provider.name}），命中 {len(results)} 条；"
            f"首条: {first.title[:50]}"
        ),
        "latency_ms": latency,
    }
