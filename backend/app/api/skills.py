"""
Skills API — /api/skills*

- GET /api/skills/catalog : skill market catalog
- GET /api/skills        : simple list (kept for backwards compat)
"""
from fastapi import APIRouter

from ..services.static_data import SKILL_CATALOG, SKILL_DOCS

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("/catalog")
async def skill_catalog():
    """Full skill catalog for the skill market."""
    return {"ok": True, "catalog": SKILL_CATALOG}


@router.get("")
async def list_skills():
    """Simple skill list (each with a doc)."""
    skills = [
        {
            "id": s["id"],
            "name": s["name"],
            "description": s["description"],
            "doc": SKILL_DOCS.get(s["id"], ""),
        }
        for s in SKILL_CATALOG
    ]
    return {"ok": True, "skills": skills}
