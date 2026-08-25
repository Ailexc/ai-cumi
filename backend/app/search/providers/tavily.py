"""Tavily web-search adapter. Endpoint: https://api.tavily.com/search"""
from typing import List

import httpx

from ..base import SearchError, SearchResult, SearchProvider
from ..registry import register_search_provider


@register_search_provider("tavily", url_keywords=("tavily.com",))
class TavilyProvider(SearchProvider):
    """Tavily Search API.

    Auth: ``Authorization: Bearer <key>`` (current API; older deployments
    accepted ``api_key`` in the body — both are sent for compatibility).
    Response: ``{"results": [{"title", "url", "content", "score"}, ...]}``
    """

    def search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        try:
            resp = httpx.post(
                self.endpoint,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "api_key": self.api_key,  # legacy field, harmless if ignored
                    "query": query,
                    "max_results": num_results,
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            raise SearchError(f"Tavily 请求失败: {e}") from e

        items = data.get("results") or []
        return [
            SearchResult(
                title=item.get("title", ""),
                url=item.get("url", ""),
                snippet=item.get("content", ""),
            )
            for item in items[:num_results]
        ]
