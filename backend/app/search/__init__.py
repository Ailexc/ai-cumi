"""
Web Search capability for AiCumi.

Vendor adapters live in ``providers/`` and self-register via the registry.
Public surface:

- SearchResult / SearchProvider / SearchError  (contract)
- register_search_provider / create_provider / get_default_provider
- resolve_provider_kind / list_registered      (diagnostics)

Importing this package imports all provider modules so their registration
side effects run.
"""
from .base import SearchError, SearchProvider, SearchResult
from .registry import (
    create_provider,
    get_default_provider,
    list_registered,
    register_search_provider,
    resolve_provider_kind,
)

# Registration side-effects
from .providers import tavily, bocha, serper  # noqa: F401,E402

__all__ = [
    "SearchError",
    "SearchProvider",
    "SearchResult",
    "register_search_provider",
    "resolve_provider_kind",
    "create_provider",
    "get_default_provider",
    "list_registered",
]
