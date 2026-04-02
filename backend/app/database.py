import re
import sys

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import _DATA_DIR, settings


def _resolve_db_url(url: str) -> str:
    """Normalise the DATABASE_URL to use the asyncpg driver for Postgres."""
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


_db_url = _resolve_db_url(settings.DATABASE_URL)

# Log the scheme/format so we can see what driver is being used without exposing credentials
_safe_url = re.sub(r":([^/@]+)@", ":***@", _db_url)
print(f"[database] URL format: {_safe_url}", flush=True)

# Only create the local data directory when using SQLite
if _db_url.startswith("sqlite"):
    _DATA_DIR.mkdir(parents=True, exist_ok=True)

try:
    engine = create_async_engine(_db_url, echo=False)
except Exception as _exc:
    print(f"[database] ERROR creating engine: {_exc}", flush=True)
    sys.exit(1)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
