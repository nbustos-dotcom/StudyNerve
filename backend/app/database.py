import re
import sys

from sqlalchemy import event, text
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

# pgBouncer (Supabase connection pooler) runs in transaction mode, which does
# not support PostgreSQL prepared statements. Disabling the asyncpg statement
# cache is harmless on direct connections and required on pooled ones.
_engine_kwargs: dict = {}
if _db_url.startswith("postgresql+asyncpg://"):
    _engine_kwargs["connect_args"] = {"statement_cache_size": 0}

try:
    engine = create_async_engine(_db_url, echo=False, **_engine_kwargs)
except Exception as _exc:
    print(f"[database] ERROR creating engine: {_exc}", flush=True)
    sys.exit(1)

# SQLite: enable WAL mode and a 5-second busy timeout so background tasks
# and HTTP request sessions can read/write concurrently without "database is
# locked" errors. WAL is a no-op on Postgres.
if _db_url.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()

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
        if _db_url.startswith("postgresql"):
            await conn.execute(text("ALTER TABLE notes ADD COLUMN IF NOT EXISTS study_guide TEXT"))
        else:
            try:
                await conn.execute(text("ALTER TABLE notes ADD COLUMN study_guide TEXT"))
            except Exception:
                pass
