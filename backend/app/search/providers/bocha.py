"""Bocha (博查) web-search adapter. Endpoint: https://api.bochaai.com/v1/web-search"""
from typing import List

import httpx

from ..base import SearchError, SearchResult, SearchProvider
from ..registry import register_search_provider


@register_search_provider("bocha", url_keywords=("bocha",))
class BochaProvider(SearchProvider):
    """博查 Web Search API.

    Auth: ``Authorization: Bearer <key>``
    Request:  {"query": str, "count": int, "summary": bool}
    Response: {"code": 200, "data": {"webPages": {"value": [{"name", "url",
              "snippet", "summary"}, ...]}}}
    """

    def search(self, query: str, num_results: int = 5) -> List[SearchResult]:
        try:
            resp = httpx.post(
                self.endpoint,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={"query": query, "count": num_results, "summary": True},
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            raise SearchError(f"博查请求失败: {e}") from e

        if data.get("code") not in (None, 200):
            raise SearchError(f"博查返回错误码 {data.get('code')}: {data.get('msg', '')}")

        pages = ((data.get("data") or {}).get("webPages") or {}).get("value") or []
        return [
            SearchResult(
                title=item.get("name", ""),
                url=item.get("url", ""),
                snippet=item.get("summary") or item.get("snippet", ""),
            )
            for item in pages[:num_results]
        ]
