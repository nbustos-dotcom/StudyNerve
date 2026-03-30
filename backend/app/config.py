import os
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_DB_URL = "sqlite+aiosqlite:///" + str(_DATA_DIR / "ai_teacher.db")


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", _DEFAULT_DB_URL)
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
    MAX_LLM_RETRIES: int = int(os.getenv("MAX_LLM_RETRIES", "3"))


settings = Settings()
