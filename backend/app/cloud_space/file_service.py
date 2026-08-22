"""Local cloud-space file CRUD helpers."""
import os
import shutil
import mimetypes
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

CLOUD_SPACE_ROOT = Path(__file__).parent.parent.parent / "data" / "cloud-space"


def ensure_root() -> Path:
    CLOUD_SPACE_ROOT.mkdir(parents=True, exist_ok=True)
    return CLOUD_SPACE_ROOT


def _resolve_path(relative_path: str) -> Path:
    root = ensure_root()
    target = (root / relative_path).resolve()
    # Security: disallow escaping root
    if not str(target).startswith(str(root)):
        raise ValueError("Invalid path")
    return target


def _relative(target: Path) -> str:
    root = ensure_root()
    return str(target.relative_to(root))


def _file_info(path: Path) -> Dict[str, Any]:
    stat = path.stat()
    mime, _ = mimetypes.guess_type(str(path))
    return {
        "name": path.name,
        "path": _relative(path),
        "type": "file",
        "size": stat.st_size,
        "mime_type": mime or "application/octet-stream",
        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


def _dir_info(path: Path) -> Dict[str, Any]:
    stat = path.stat()
    return {
        "name": path.name,
        "path": _relative(path),
        "type": "directory",
        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


def list_directory(relative_path: str = "") -> List[Dict[str, Any]]:
    target = _resolve_path(relative_path) if relative_path else ensure_root()
    if not target.exists():
        return []
    items = []
    for child in sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        items.append(_file_info(child) if child.is_file() else _dir_info(child))
    return items


def build_tree(relative_path: str = "") -> Dict[str, Any]:
    target = _resolve_path(relative_path) if relative_path else ensure_root()
    if not target.exists():
        return _dir_info(ensure_root())

    def walk(path: Path) -> Dict[str, Any]:
        node = _dir_info(path) if path.is_dir() else _file_info(path)
        if path.is_dir():
            children = []
            for child in sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
                children.append(walk(child))
            node["children"] = children
        return node

    return walk(target)


def create_folder(relative_path: str) -> Dict[str, Any]:
    target = _resolve_path(relative_path)
    target.mkdir(parents=True, exist_ok=True)
    return _dir_info(target)


def save_upload(file_obj, relative_path: str) -> Dict[str, Any]:
    target = _resolve_path(relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "wb") as f:
        shutil.copyfileobj(file_obj, f)
    return _file_info(target)


def delete_path(relative_path: str) -> Dict[str, Any]:
    target = _resolve_path(relative_path)
    if target == ensure_root():
        raise ValueError("Cannot delete root")
    if target.is_file():
        target.unlink()
    elif target.is_dir():
        shutil.rmtree(target)
    else:
        raise FileNotFoundError("Path not found")
    return {"status": "deleted", "path": relative_path}


def read_content(relative_path: str) -> bytes:
    target = _resolve_path(relative_path)
    if not target.is_file():
        raise FileNotFoundError("File not found")
    return target.read_bytes()


def read_text(relative_path: str, encoding: str = "utf-8") -> str:
    target = _resolve_path(relative_path)
    if not target.is_file():
        raise FileNotFoundError("File not found")
    return target.read_text(encoding=encoding)


def get_path(relative_path: str) -> Path:
    return _resolve_path(relative_path)
