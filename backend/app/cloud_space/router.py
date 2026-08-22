"""Cloud Space REST API router."""
import os
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse, FileResponse

from . import file_service, preview_service

router = APIRouter(prefix="/api/files", tags=["Cloud Space"])


def _safe_path(path: str) -> str:
    # Strip leading slashes and prevent traversal
    path = path.lstrip("/")
    if ".." in path:
        raise HTTPException(status_code=400, detail="Invalid path")
    return path


@router.get("")
async def list_files(path: str = ""):
    """List directory contents."""
    try:
        return {"items": file_service.list_directory(_safe_path(path))}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tree")
async def file_tree(path: str = ""):
    """Get recursive file tree."""
    try:
        return {"tree": file_service.build_tree(_safe_path(path))}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/folder")
async def create_folder(payload: dict):
    """Create a folder."""
    try:
        rel = _safe_path(payload.get("path", ""))
        return file_service.create_folder(rel)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    path: str = Form(""),
):
    """Upload a file to a relative path inside cloud-space."""
    try:
        rel = _safe_path(os.path.join(path, file.filename or "unnamed"))
        info = file_service.save_upload(file.file, rel)
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        file.file.close()


@router.post("/upload-batch")
async def upload_batch(
    files: List[UploadFile] = File(...),
    path: str = Form(""),
):
    """Upload multiple files."""
    results = []
    errors = []
    for file in files:
        try:
            rel = _safe_path(os.path.join(path, file.filename or "unnamed"))
            info = file_service.save_upload(file.file, rel)
            results.append(info)
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})
        finally:
            file.file.close()
    return {"uploaded": results, "errors": errors}


@router.get("/{path:path}/content")
async def get_content(path: str):
    """Get raw file content."""
    try:
        rel = _safe_path(path)
        data = file_service.read_content(rel)
        return StreamingResponse(iter([data]), media_type="application/octet-stream")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{path:path}/preview")
async def get_preview(path: str):
    """Get preview data (text / pdf images / image)."""
    try:
        rel = _safe_path(path)
        return preview_service.preview_file(rel)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{path:path}/download")
async def download_file(path: str):
    """Download a file."""
    try:
        rel = _safe_path(path)
        target = file_service.get_path(rel)
        return FileResponse(target, filename=target.name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{path:path}")
async def delete_file(path: str):
    """Delete a file or folder and sync knowledge index."""
    from ..database import get_db
    from ..knowledge.indexer import KnowledgeIndexer
    from ..knowledge.rag_config import get_rag_settings
    from .. import state

    try:
        rel = _safe_path(path)
        # Sync cleanup knowledge index before physical deletion
        db_session = next(get_db())
        try:
            if state.model_encryptor:
                cfg = get_rag_settings(db_session)
                indexer = KnowledgeIndexer(db_session, state.model_encryptor, cfg, "data/memory")
                indexer.delete_by_path(rel)
        finally:
            db_session.close()
        return file_service.delete_path(rel)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
