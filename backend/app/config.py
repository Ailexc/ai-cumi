"""
Configuration settings for AiCumi AG2 Backend.
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""
    
    # API Settings
    app_name: str = "AiCumi AG2 Backend"
    app_version: str = "1.0.0"
    debug: bool = True
    
    # Server Settings
    host: str = "0.0.0.0"
    port: int = 8000
    
    # AG2 Settings
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    default_model: str = "gpt-4o-mini"
    
    # Mock mode (for development without API keys)
    # TODO: Will be replaced by model management UI with encrypted key storage
    mock_mode: bool = True
    
    # Database Settings
    database_url: str = "sqlite+aiosqlite:///./data/aicumi.db"
    
    # CORS Settings
    cors_origins: list = ["*"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Create settings instance
settings = Settings()

# Load API keys from environment
if not settings.openai_api_key:
    settings.openai_api_key = os.getenv("OPENAI_API_KEY")

if not settings.anthropic_api_key:
    settings.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")