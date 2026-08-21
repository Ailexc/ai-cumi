"""
Database initialization module.
Uses SQLite for local persistence.
"""
import os
import secrets
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .models import Base

# Ensure data directory exists
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR / 'aicumi.db'}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ---- Master key persistence ----
# The model API-key encryptor needs a stable key across restarts, otherwise
# stored encrypted keys become undecryptable. Persist an auto-generated key to
# the (host-mounted) data directory when MODEL_MASTER_KEY is not provided.
MASTER_KEY_FILE = DATA_DIR / ".master_key"


def get_or_create_master_key() -> str:
    """Return the persisted master key, creating it on first run."""
    if MASTER_KEY_FILE.exists():
        return MASTER_KEY_FILE.read_text().strip()
    key = secrets.token_urlsafe(32)
    MASTER_KEY_FILE.write_text(key)
    try:
        os.chmod(MASTER_KEY_FILE, 0o600)
    except OSError:
        pass
    return key


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
    print(f"✅ Database initialized at {DATA_DIR / 'aicumi.db'}")


def get_db():
    """Get database session (for FastAPI Depends)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
