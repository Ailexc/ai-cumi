"""
AiCumi Memory System

Provides vector-based long-term memory capabilities.
"""

from .vector_memory import VectorMemory, MemoryEntry

# Global instance - initialized lazily or via init_memory()
vector_memory = None

def init_memory(model_service=None, persist_dir: str = "data/memory"):
    """Initialize the global vector memory instance."""
    global vector_memory
    vector_memory = VectorMemory(
        persist_dir=persist_dir,
        model_service=model_service,
    )
    return vector_memory

__all__ = ["VectorMemory", "MemoryEntry", "vector_memory", "init_memory"]
