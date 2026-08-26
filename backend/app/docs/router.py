"""Docs Center REST API router.

Serves the static HTML learning documents stored under ``content/``.

Each HTML document declares its metadata in ``<meta>`` tags:

    <meta name="doc:title"       content="项目总览">
    <meta name="doc:category"    content="入门">
    <meta name="doc:order"       content="1">
    <meta name="doc:description" content="一句话简介">
    <meta name="doc:icon"        content="rocket">   <!-- lucide icon name -->

The list endpoint scans ``content/`` and parses these tags; the detail
endpoint returns the raw HTML so the frontend can render it in a shadow DOM.
"""
import re
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/docs", tags=["Docs"])

CONTENT_DIR = Path(__file__).parent / "content"

# meta tag -> attribute name
_META_FIELDS = {
    "doc:title": "title",
    "doc:category": "category",
    "doc:order": "order",
    "doc:description": "description",
    "doc:icon": "icon",
}

_META_RE = {tag: re.compile(rf'<meta\s+name="{tag}"\s+content="([^"]*)"', re.I)
            for tag in _META_FIELDS}


def _parse_meta(html: str) -> dict:
    """Extract doc:* meta tags from an HTML document."""
    meta = {}
    for tag, attr in _META_FIELDS.items():
        m = _META_RE[tag].search(html)
        meta[attr] = m.group(1).strip() if m else ""
    try:
        meta["order"] = int(meta.get("order") or 0)
    except ValueError:
        meta["order"] = 0
    return meta


def _safe_doc_id(doc_id: str) -> str:
    """Sanitize a doc id: allow word chars + dashes, forbid traversal."""
    if not re.fullmatch(r"[\w-]+", doc_id or ""):
        raise HTTPException(status_code=400, detail="Invalid doc id")
    return doc_id


def _list_docs() -> List[dict]:
    docs = []
    if not CONTENT_DIR.is_dir():
        return docs
    for f in sorted(CONTENT_DIR.glob("*.html")):
        try:
            html = f.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        meta = _parse_meta(html)
        meta["id"] = f.stem
        meta["file"] = f.name
        docs.append(meta)
    docs.sort(key=lambda d: (d.get("category") or "", d.get("order") or 0))
    return docs


@router.get("")
async def list_docs(category: Optional[str] = None):
    """List all learning documents (grouped later by the frontend)."""
    docs = _list_docs()
    if category:
        docs = [d for d in docs if d.get("category") == category]
    return {"ok": True, "docs": docs, "count": len(docs)}


@router.get("/categories")
async def list_categories():
    """List distinct categories with their documents (ordered)."""
    docs = _list_docs()
    cats: dict = {}
    for d in docs:
        cat = d.get("category") or "其他"
        cats.setdefault(cat, []).append(d)
    return {"ok": True, "categories": [
        {"name": name, "docs": items} for name, items in cats.items()
    ]}


@router.get("/{doc_id}")
async def get_doc(doc_id: str):
    """Get a single document (raw HTML for shadow-DOM rendering)."""
    safe = _safe_doc_id(doc_id)
    path = CONTENT_DIR / f"{safe}.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    try:
        html = path.read_text(encoding="utf-8")
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Read failed: {e}")
    meta = _parse_meta(html)
    meta["id"] = safe
    return {"ok": True, "doc": {**meta, "html": html}}
