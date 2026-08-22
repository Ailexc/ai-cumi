"""
Shared runtime state for the AiCumi backend.

Singletons are created during the FastAPI lifespan (main.py) and read by the
API routers. Kept in a separate module to avoid circular imports.
"""
from typing import Any, Optional


# Agent / group / websocket managers (set in lifespan)
agent_manager: Optional[Any] = None
group_chat_manager: Optional[Any] = None
ws_manager: Optional[Any] = None

# Distributed agent runtime (P2, gRPC worker runtime)
distributed_manager: Optional[Any] = None

# Model-key encryptor (persistent master key)
model_encryptor: Optional[Any] = None
