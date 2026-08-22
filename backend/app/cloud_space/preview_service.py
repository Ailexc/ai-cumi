"""Preview rendering helpers for cloud-space files."""
import base64
import mimetypes
from pathlib import Path
from typing import Dict, Any, List

from .file_service import get_path


def preview_file(relative_path: str) -> Dict[str, Any]:
    target = get_path(relative_path)
    if not target.is_file():
        raise FileNotFoundError("File not found")

    mime, _ = mimetypes.guess_type(str(target))
    ext = target.suffix.lower()

    # Markdown / text / code
    if ext in {".md", ".txt", ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml", ".html", ".css", ".sql", ".sh", ".bash"}:
        return {
            "type": "text",
            "mime_type": mime or "text/plain",
            "content": target.read_text(encoding="utf-8"),
            "language": _guess_language(ext),
        }

    # PDF -> render pages as base64 PNG images
    if ext == ".pdf":
        return _preview_pdf(target)

    # Images
    if mime and mime.startswith("image/"):
        data = target.read_bytes()
        b64 = base64.b64encode(data).decode("utf-8")
        return {
            "type": "image",
            "mime_type": mime,
            "data_url": f"data:{mime};base64,{b64}",
        }

    # Fallback: binary / unsupported
    return {
        "type": "unsupported",
        "mime_type": mime or "application/octet-stream",
        "size": target.stat().st_size,
    }


def _guess_language(ext: str) -> str:
    mapping = {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".jsx": "jsx",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".html": "html",
        ".css": "css",
        ".sql": "sql",
        ".sh": "bash",
        ".bash": "bash",
        ".md": "markdown",
    }
    return mapping.get(ext, "text")


def _preview_pdf(path: Path, dpi: int = 120) -> Dict[str, Any]:
    try:
        import fitz  # pymupdf
    except ImportError:
        return {"type": "unsupported", "mime_type": "application/pdf", "reason": "pymupdf not installed"}

    images: List[str] = []
    doc = fitz.open(str(path))
    try:
        for page in doc:
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            png_bytes = pix.tobytes("png")
            b64 = base64.b64encode(png_bytes).decode("utf-8")
            images.append(f"data:image/png;base64,{b64}")
    finally:
        doc.close()

    return {
        "type": "pdf",
        "mime_type": "application/pdf",
        "page_count": len(images),
        "pages": images,
    }
