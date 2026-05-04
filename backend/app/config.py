import os
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DATA_DIR = _BACKEND_DIR / "data"
_ENV_FILE = _BACKEND_DIR / ".env"
_DEFAULT_DB_URL = "sqlite+aiosqlite:///" + str(_DATA_DIR / "ai_teacher.db")

# Load .env from the backend directory.
# override=False so explicit env vars (e.g. in prod) still win.
load_dotenv(_ENV_FILE, override=False)


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL") or _DEFAULT_DB_URL
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-prod")
    MAX_LLM_RETRIES: int = int(os.getenv("MAX_LLM_RETRIES", "3"))
    CANVAS_API_URL: str = os.getenv("CANVAS_API_URL", "https://mtu.instructure.com/api/v1")
    CANVAS_API_TOKEN: str = os.getenv("CANVAS_API_TOKEN", "")
    ENABLE_USER_CONTEXT: bool = os.getenv("ENABLE_USER_CONTEXT", "false").lower() == "true"


settings = Settings()

if (
    settings.SECRET_KEY == "dev-secret-key-change-in-prod"
    and settings.DATABASE_URL.startswith("postgresql")
):
    raise RuntimeError(
        "SECRET_KEY must be explicitly set in production. "
        "The default value is publicly known and makes all JWTs forgeable."
    )
