"""
Search provider registry.

Provides:
- ``register_search_provider``: decorator that enrolls a vendor adapter;
- ``resolve_provider_kind``:    URL-keyword auto-detection of the vendor;
- ``create_provider``:          factory (endpoint + api_key -> adapter instance);
- ``get_default_provider``:     resolves the default ``search`` model config
                                from the database into a ready adapter.

Adding a new vendor = drop a file under ``providers/`` with one decorated
class. No call-site changes anywhere else.
"""
from typing import Dict, Optional, Type

from .base import SearchError, SearchProvider

_REGISTRY: Dict[str, Type[SearchProvider]] = {}


def register_search_provider(name: str, url_keywords: tuple = ()):
    """Class decorator: enroll a SearchProvider under ``name``."""

    def decorator(cls: Type[SearchProvider]) -> Type[SearchProvider]:
        cls.name = name
        cls.url_keywords = url_keywords
        _REGISTRY[name] = cls
        return cls

    return decorator


def resolve_provider_kind(endpoint: str) -> Optional[str]:
    """Auto-detect the vendor from the configured endpoint URL."""
    url = (endpoint or "").lower()
    for name, cls in _REGISTRY.items():
        if any(kw in url for kw in getattr(cls, "url_keywords", ())):
            return name
    return None


def create_provider(endpoint: str, api_key: str) -> SearchProvider:
    """Factory: endpoint URL + decrypted key -> ready adapter instance."""
    kind = resolve_provider_kind(endpoint)
    if not kind:
        raise SearchError(
            f"无法识别的搜索服务端点: {endpoint}（已支持: {sorted(_REGISTRY)}）"
        )
    return _REGISTRY[kind](api_key=api_key, endpoint=endpoint)


def get_default_provider():
    """Resolve the default ``search`` model config from DB into an adapter.

    Opens its own short-lived session so it is safe to call from tool
    execution contexts. Raises :class:`SearchError` when nothing usable is
    configured — callers must surface this honestly instead of fabricating
    results.
    """
    from ..database import SessionLocal, get_or_create_master_key
    from ..services.model_service import ModelManagementService, ModelKeyEncryptor

    db = SessionLocal()
    try:
        encryptor = ModelKeyEncryptor(master_key=get_or_create_master_key())
        service = ModelManagementService(db, encryptor)
        default = service.get_default_search()
        if not default:
            raise SearchError(
                "未配置搜索服务：请在「模型管理」中添加 search 类型配置并设为默认"
                "（或在环境变量中配置 SERPER_API_KEY）"
            )
        api_key = service.get_decrypted_key(default.id)
        if not api_key:
            raise SearchError("搜索服务 API Key 解密失败，请重新保存该配置")
        return create_provider(endpoint=default.base_url or "", api_key=api_key)
    finally:
        db.close()


def list_registered() -> Dict[str, tuple]:
    """Expose registered vendors (for diagnostics / docs)."""
    return {name: tuple(cls.url_keywords) for name, cls in _REGISTRY.items()}
