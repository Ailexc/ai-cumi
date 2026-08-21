"""
WebSocket Manager for AiCumi AG2 Backend.

Manages WebSocket connections and implements the AiCumi chat protocol
(matching the frontend's expected message format).
"""

import asyncio
import json
import uuid
from typing import Dict, List, Set, Optional, Any
from fastapi import WebSocket, WebSocketDisconnect


class WebSocketManager:
    """Manages WebSocket connections for real-time chat."""
    
    def __init__(self):
        # All active connections (no room-based routing needed for now)
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        """Accept a WebSocket connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"🔌 WebSocket connected ({len(self.active_connections)} total)")
    
    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        self.active_connections.discard(websocket)
        print(f"🔌 WebSocket disconnected ({len(self.active_connections)} total)")
    
    async def send_json(self, websocket: WebSocket, data: dict):
        """Send JSON message to a specific connection."""
        try:
            await websocket.send_json(data)
        except Exception as e:
            print(f"⚠️ send_json error: {e}")
            self.disconnect(websocket)
    
    async def broadcast_json(self, data: dict):
        """Broadcast JSON message to all connections."""
        disconnected = set()
        for ws in self.active_connections:
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.add(ws)
        self.active_connections -= disconnected
