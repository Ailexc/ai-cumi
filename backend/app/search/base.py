"""
Search Provider Abstraction.

Defines the normalized search result shape and the contract every vendor
adapter must fulfill. Adapters are self-contained: they receive the full
endpoint URL (exactly as configured by the user in the model management UI)
plus the decrypted API key, and translate a natural-language query into
normalized :class:`SearchResult` items.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List


class SearchError(RuntimeError):
    """Raised when a search provider is misconfigured or a request fails."""


@dataclass
class SearchResult:
    """One normalized web-search hit."""

    title: str = ""
    url: str = ""
    snippet: str = ""

    def to_dict(self) -> dict:
        return {"title": self.title, "url": self.url, "snippet": self.snippet}


class SearchProvider(ABC):
    """Contract for a vendor-specific web-search adapter.

    Subclasses declare two class attributes:

    - ``name``:    unique provider key (set automatically by the registry
                   decorator);
    - ``url_keywords``: lowercase substrings used to auto-detect this provider
                   from a configured endpoint URL.
    """

    name: str = "base"
    url_keywords: tuple = ()

    def __init__(self, api_key: str, endpoint: str):
        self.api_key = api_key
        # The configured base_url IS the full request endpoint for search
        # vendors (e.g. https://api.tavily.com/search) — keep it verbatim.
        self.endpoint = (endpoint or "").rstrip("/")

    @abstractmethod
    def search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        """Execute a web search synchronously and return normalized results.

        Implementations must raise :class:`SearchError` on any failure so
        callers can surface an honest error instead of fabricating content.
        """
