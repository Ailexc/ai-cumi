"""
Startup script for AiCumi AG2 Backend.
Uses mock mode by default - set MOCK_MODE=false to use real AG2 agents.
"""

import os
import sys
from pathlib import Path

# Add server directory to Python path
server_dir = Path(__file__).parent
sys.path.insert(0, str(server_dir))

# Check environment
mock_mode = os.getenv("MOCK_MODE", "true").lower() == "true"
mode_text = "🎭 Mock mode enabled (no API keys needed)" if mock_mode else "🔑 Real agent mode (API key required)"
print(f"Mode: {mode_text}")

from app.config import settings


def main():
    """Main entry point."""
    print(f"🚀 Starting {settings.app_name} v{settings.app_version}")
    print(f"📡 Server will be available at http://{settings.host}:{settings.port}")
    print(f"📚 API docs will be available at http://{settings.host}:{settings.port}/docs")
    
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )


if __name__ == "__main__":
    main()