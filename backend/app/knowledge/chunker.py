"""Text chunking strategies."""
import re
from dataclasses import dataclass
from typing import List


@dataclass
class TextChunk:
    content: str
    chunk_index: int
    start_char: int
    end_char: int


class TextChunker:
    """Configurable text chunker."""

    def __init__(
        self,
        strategy: str = "recursive",
        chunk_size: int = 512,
        overlap: int = 128,
        separator: str = "\n\n",
    ):
        self.strategy = strategy
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.separator = separator

    def chunk(self, text: str) -> List[TextChunk]:
        if self.strategy == "fixed":
            return self._fixed_chunk(text)
        if self.strategy == "recursive":
            return self._recursive_chunk(text)
        if self.strategy == "markdown":
            return self._markdown_chunk(text)
        if self.strategy == "semantic":
            return self._semantic_chunk(text)
        return self._recursive_chunk(text)

    def _fixed_chunk(self, text: str) -> List[TextChunk]:
        chunks: List[TextChunk] = []
        step = max(1, self.chunk_size - self.overlap)
        idx = 0
        pos = 0
        while pos < len(text):
            end = min(pos + self.chunk_size, len(text))
            chunks.append(TextChunk(text[pos:end], idx, pos, end))
            pos += step
            idx += 1
            if end == len(text):
                break
        return chunks

    def _recursive_chunk(self, text: str) -> List[TextChunk]:
        # Use separator first, then fallback to sentence/char
        separators = [self.separator] if self.separator else []
        separators += ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? ", " ", ""]
        return self._split_recursive(text, separators, 0)

    def _split_recursive(self, text: str, separators: List[str], depth: int) -> List[TextChunk]:
        if len(text) <= self.chunk_size:
            return [TextChunk(text, 0, 0, len(text))]

        if depth >= len(separators):
            return self._fixed_chunk(text)

        sep = separators[depth]
        if sep == "":
            return self._fixed_chunk(text)

        parts = text.split(sep)
        chunks: List[TextChunk] = []
        buffer = ""
        start = 0
        idx = 0
        for part in parts:
            candidate = (buffer + sep + part) if buffer else part
            if len(candidate) <= self.chunk_size:
                buffer = candidate
            else:
                if buffer:
                    chunks.append(TextChunk(buffer, idx, start, start + len(buffer)))
                    idx += 1
                    # overlap
                    overlap_text = buffer[-self.overlap:] if self.overlap > 0 else ""
                    start += len(buffer) - len(overlap_text)
                    buffer = (overlap_text + sep + part) if overlap_text else part
                else:
                    # single part too long -> recurse
                    sub = self._split_recursive(part, separators, depth + 1)
                    for c in sub:
                        c.chunk_index = idx
                        idx += 1
                    chunks.extend(sub)
                    start += len(part)
        if buffer:
            chunks.append(TextChunk(buffer, idx, start, start + len(buffer)))
        return chunks

    def _markdown_chunk(self, text: str) -> List[TextChunk]:
        # Split by headers ## and ### primarily
        pattern = re.compile(r"^(#{1,3}\s+.+)$", re.MULTILINE)
        matches = list(pattern.finditer(text))
        if not matches:
            return self._recursive_chunk(text)

        chunks: List[TextChunk] = []
        idx = 0
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            content = text[start:end].strip()
            if content:
                chunks.append(TextChunk(content, idx, start, end))
                idx += 1
        return chunks

    def _semantic_chunk(self, text: str) -> List[TextChunk]:
        # Placeholder: semantic chunking needs embeddings, fallback to recursive
        return self._recursive_chunk(text)
