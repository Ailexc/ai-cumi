"""
AI Model Management Service with encrypted key storage.
"""
import base64
import hashlib
import hmac
from typing import Optional, List, Dict, Any
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session
from ..models import ModelConfig, ModelProvider, ModelStatus


class ModelKeyEncryptor:
    """Simple symmetric encryption for API keys using Fernet."""
    
    def __init__(self, master_key: Optional[str] = None):
        if master_key:
            self.key = master_key.encode()[:32].ljust(32, b'0')
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
    """Manages AI model configurations with secure credential storage."""
    
    def __init__(self, db_session: Session, encryptor: Optional[ModelKeyEncryptor] = None):
        self.db = db_session
        self.encryptor = encryptor or ModelKeyEncryptor()
    
    def add_model_config(
        self,
        provider: str,
        model_name: str,
        api_key: str,
        base_url: Optional[str] = None,
        description: Optional[str] = None,
        is_default: bool = False,
    ) -> ModelConfig:
        """Add new model configuration with encrypted API key."""
        # Set default model if requested
        if is_default:
            self.db.query(ModelConfig).filter_by(default_model=True).update({"default_model": False})
        
        config = ModelConfig(
            provider=provider,
            model_name=model_name,
            api_key_encrypted=self.encryptor.encrypt(api_key),
            base_url=base_url,
            default_model=is_default,
            status=ModelStatus.ACTIVE,
            description=description,
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
        
        for key, value in kwargs.items():
            if hasattr(config, key):
                setattr(config, key, value)
        
        self.db.commit()
        self.db.refresh(config)
        return config
    
    def get_all_configs(self, status: Optional[str] = None) -> List[ModelConfig]:
        """Get all model configurations (with decrypted keys for internal use only)."""
        query = self.db.query(ModelConfig)
        if status:
            query = query.filter(ModelConfig.status == status)
        return query.all()
    
    def get_config(self, config_id: int) -> Optional[Dict[str, Any]]:
        """Get single model config with sensitive info stripped."""
        config = self.db.get(ModelConfig, config_id)
        if not config:
            return None
        
        return {
            "id": config.id,
            "provider": config.provider,
            "model_name": config.model_name,
            "api_key_hash": self.encryptor.hash_api_key_for_display(
                self.encryptor.decrypt(config.api_key_encrypted)
            ),
            "base_url": config.base_url,
            "is_default": config.default_model,
            "status": config.status.value if config.status else None,
            "description": config.description,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        }
    
    def delete_config(self, config_id: int) -> bool:
        """Delete a model configuration."""
        config = self.db.get(ModelConfig, config_id)
        if not config:
            return False
        
        self.db.delete(config)
        self.db.commit()
        return True
    
    def get_decrypted_key(self, config_id: int) -> Optional[str]:
        """Get decrypted API key for internal agent use (never exposed via API)."""
        config = self.db.get(ModelConfig, config_id)
        if not config:
            return None
        return self.encryptor.decrypt(config.api_key_encrypted)
