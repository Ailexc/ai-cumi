"""
Unified Model Management Service for AiCumi.

Supports multiple model types: LLM, Embedding, Vision, Search, Code.
All credentials are encrypted and stored centrally.
"""

import base64
import hashlib
from typing import Optional, List, Dict, Any
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..models import ModelConfig, ModelType, ModelStatus


class ModelKeyEncryptor:
    """Simple symmetric encryption for API keys using Fernet.

    The master key may be any non-empty string; it is deterministically derived
    into a valid Fernet key (32 raw bytes, url-safe base64 encoded) so it stays
    stable across restarts.
    """

    def __init__(self, master_key: Optional[str] = None):
        if master_key:
            raw = master_key.encode("utf-8")[:32].ljust(32, b"\x00")
            self.key = base64.urlsafe_b64encode(raw)
        else:
            self.key = Fernet.generate_key()
        self.fernet = Fernet(self.key)
    
    def encrypt(self, plaintext: str) -> str:
        return self.fernet.encrypt(plaintext.encode()).decode()
    
    def decrypt(self, ciphertext: str) -> str:
        return self.fernet.decrypt(ciphertext.encode()).decode()
    
    def hash_api_key_for_display(self, api_key: str) -> str:
        """Create a hash for safe display without revealing the key."""
        return f"sk-****{hashlib.sha256(api_key.encode()).hexdigest()[:8]}"


class ModelManagementService:
    """Unified model management service.

    Manages all model types: LLM, Embedding, Vision, Search, Code.
    Each type can have one default model.
    """
    
    def __init__(self, db_session: Session, encryptor: Optional[ModelKeyEncryptor] = None):
        self.db = db_session
        self.encryptor = encryptor or ModelKeyEncryptor()
    
    def add_model_config(
        self,
        model_type: str,
        provider: str,
        model_name: str,
        api_key: str,
        base_url: Optional[str] = None,
        description: Optional[str] = None,
        is_default: bool = False,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> ModelConfig:
        """Add new model configuration with encrypted API key."""
        # Set default model for this type if requested
        if is_default:
            self.db.query(ModelConfig).filter(
                and_(ModelConfig.model_type == model_type, ModelConfig.default_model == True)
            ).update({"default_model": False})
        
        config = ModelConfig(
            model_type=model_type,
            provider=provider,
            model_name=model_name,
            api_key_encrypted=self.encryptor.encrypt(api_key),
            base_url=base_url,
            default_model=is_default,
            status=ModelStatus.ACTIVE,
            description=description,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config
    
    def update_model_config(
        self,
        config_id: int,
        **kwargs,
    ) -> Optional[ModelConfig]:
        """Update existing model configuration."""
        config = self.db.get(ModelConfig, config_id)
        if not config:
            return None
        
        # If setting as default, unset other defaults of the same type
        if kwargs.get("default_model"):
            self.db.query(ModelConfig).filter(
                and_(
                    ModelConfig.model_type == config.model_type,
                    ModelConfig.id != config_id,
                    ModelConfig.default_model == True,
                )
            ).update({"default_model": False})
        
        for key, value in kwargs.items():
            if hasattr(config, key):
                setattr(config, key, value)
        
        self.db.commit()
        self.db.refresh(config)
        return config
    
    def get_all_configs(self, model_type: Optional[str] = None, status: Optional[str] = None) -> List[ModelConfig]:
        """Get all model configurations."""
        query = self.db.query(ModelConfig)
        if model_type:
            query = query.filter(ModelConfig.model_type == model_type)
        if status:
            query = query.filter(ModelConfig.status == status)
        return query.order_by(ModelConfig.model_type, ModelConfig.default_model.desc()).all()
    
    def get_config(self, config_id: int) -> Optional[Dict[str, Any]]:
        """Get single model config with sensitive info stripped."""
        config = self.db.get(ModelConfig, config_id)
        if not config:
            return None
        
        return self._config_to_dict(config)
    
    def get_default_config(self, model_type: str) -> Optional[ModelConfig]:
        """Get the default model config for a given type (internal use)."""
        return self.db.query(ModelConfig).filter(
            and_(
                ModelConfig.model_type == model_type,
                ModelConfig.default_model == True,
                ModelConfig.status == ModelStatus.ACTIVE,
            )
        ).first()
    
    def get_default_llm(self) -> Optional[ModelConfig]:
        """Get the default LLM model."""
        return self.get_default_config("llm")
    
    def get_default_embedding(self) -> Optional[ModelConfig]:
        """Get the default Embedding model."""
        return self.get_default_config("embedding")
    
    def get_default_vision(self) -> Optional[ModelConfig]:
        """Get the default Vision model."""
        return self.get_default_config("vision")
    
    def get_default_search(self) -> Optional[ModelConfig]:
        """Get the default Search API config."""
        return self.get_default_config("search")
    
    def delete_config(self, config_id: int) -> bool:
        """Delete a model configuration."""
        config = self.db.get(ModelConfig, config_id)
        if not config:
            return False
        
        self.db.delete(config)
        self.db.commit()
        return True
    
    def get_decrypted_key(self, config_id: int) -> Optional[str]:
        """Get decrypted API key for internal use (never exposed via API)."""
        config = self.db.get(ModelConfig, config_id)
        if not config:
            return None
        return self.encryptor.decrypt(config.api_key_encrypted)
    
    def get_decrypted_key_for_type(self, model_type: str) -> Optional[str]:
        """Get decrypted API key for the default model of a given type."""
        config = self.get_default_config(model_type)
        if not config:
            return None
        return self.encryptor.decrypt(config.api_key_encrypted)
    
    def get_all_by_type(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get all configs grouped by type."""
        configs = self.get_all_configs()
        result = {}
        for config in configs:
            if config.model_type not in result:
                result[config.model_type] = []
            result[config.model_type].append(self._config_to_dict(config))
        return result
    
    def _config_to_dict(self, config: ModelConfig) -> Dict[str, Any]:
        """Convert config to dictionary for API response."""
        api_key = self.encryptor.decrypt(config.api_key_encrypted)
        return {
            "id": config.id,
            "model_type": config.model_type,
            "provider": config.provider,
            "model_name": config.model_name,
            "api_key_hash": self.encryptor.hash_api_key_for_display(api_key),
            "base_url": config.base_url,
            "is_default": config.default_model,
            "status": config.status.value if config.status else None,
            "description": config.description,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "created_at": config.created_at.isoformat() if config.created_at else None,
            "updated_at": config.updated_at.isoformat() if config.updated_at else None,
        }
