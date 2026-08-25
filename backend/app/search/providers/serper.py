"""Serper.dev Google-search adapter. Endpoint: https://google.serper.dev/search"""
from typing import List

import httpx

from ..base import SearchError, SearchResult, SearchProvider
from ..registry import register_search_provider


@register_search_provider("serper", url_keywords=("serper.dev", "google.serper"))
class SerperProvider(SearchProvider):
    """Serper.dev Google Search API.

    Auth: ``X-API-KEY: <key>``
    Request:  {"q": str, "num": int}
    Response: {"organic": [{"title", "link", "snippet"}, ...]}
    """

    def search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        try:
            resp = httpx.post(
                self.endpoint,
                headers={"X-API-KEY": self.api_key, "Content-Type": "application/json"},
                json={"q": query, "num": num_results},
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            raise SearchError(f"Serper 请求失败: {e}") from e

        organic = data.get("organic") or []
        return [
            SearchResult(
                title=item.get("title", ""),
                url=item.get("link", ""),
                snippet=item.get("snippet", ""),
            )
            for item in organic[:num_results]
        ]
