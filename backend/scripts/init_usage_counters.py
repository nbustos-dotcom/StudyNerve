"""One-off: create usage_counters and usage_counters_global in prod Supabase.

Connects with asyncpg directly to the DATABASE_URL from backend/.env (the same
URL the running app uses), so we hit the exact database the backend reads from.
The Supabase Transaction Pooler on port 6543 runs pgBouncer in transaction
mode, so we pass statement_cache_size=0 to disable asyncpg's prepared-statement
cache.

All CREATE statements use IF NOT EXISTS — safe to re-run. No drops, no DML,
no other tables touched.

Usage (from repo root):
    python backend/scripts/init_usage_counters.py
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

# backend/scripts/__file__ → backend/.env
_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env", override=False)

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in backend/.env", file=sys.stderr)
    sys.exit(1)


def _normalize_for_asyncpg(url: str) -> str:
    """Strip any SQLAlchemy '+driver' suffix; normalize postgres:// → postgresql://."""
    url = re.sub(r"^(postgres(?:ql)?)\+[A-Za-z0-9_]+://", r"\1://", url)
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url


def _safe_print_url(url: str) -> str:
    return re.sub(r":([^/@]+)@", ":***@", url)


SQL_LIST_USAGE_TABLES = """
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE 'usage_counters%'
  AND table_schema = current_schema()
ORDER BY table_name;
"""

# Idempotent — safe to run repeatedly.
CREATE_STATEMENTS: list[str] = [
    # Per-user, per-day, per-bucket counters.
    # Column types and constraints match the SQLAlchemy model
    # (app/models.py :: UsageCounter) so a later metadata.create_all() is a
    # no-op rather than a diff.
    """
    CREATE TABLE IF NOT EXISTS usage_counters (
        id              SERIAL       PRIMARY KEY,
        user_id         INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day             DATE         NOT NULL,
        kind            VARCHAR(20)  NOT NULL,
        count           INTEGER      NOT NULL DEFAULT 0,
        tokens_estimate INTEGER      NOT NULL DEFAULT 0,
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT usage_counters_user_day_kind_uniq UNIQUE (user_id, day, kind)
    );
    """,
    "CREATE INDEX IF NOT EXISTS usage_counters_day_idx ON usage_counters (day);",
    "CREATE INDEX IF NOT EXISTS usage_counters_user_id_idx ON usage_counters (user_id);",
    # Global (all-users) circuit breaker.
    """
    CREATE TABLE IF NOT EXISTS usage_counters_global (
        id              SERIAL       PRIMARY KEY,
        day             DATE         NOT NULL,
        kind            VARCHAR(20)  NOT NULL,
        count           INTEGER      NOT NULL DEFAULT 0,
        tokens_estimate INTEGER      NOT NULL DEFAULT 0,
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT usage_counters_global_day_kind_uniq UNIQUE (day, kind)
    );
    """,
    "CREATE INDEX IF NOT EXISTS usage_counters_global_day_idx ON usage_counters_global (day);",
]


async def main() -> int:
    raw_url = DATABASE_URL
    url = _normalize_for_asyncpg(raw_url)
    print(f"Connecting to: {_safe_print_url(url)}")

    try:
        conn = await asyncpg.connect(url, statement_cache_size=0)
    except Exception as exc:
        print(f"ERROR: connection failed: {exc}", file=sys.stderr)
        return 2

    try:
        # BEFORE
        rows = await conn.fetch(SQL_LIST_USAGE_TABLES)
        before = [r["table_name"] for r in rows]
        print(f"\nBEFORE — tables matching 'usage_counters%': {before or '(none)'}")

        # APPLY
        print("\nApplying CREATE TABLE / CREATE INDEX (IF NOT EXISTS)...")
        for stmt in CREATE_STATEMENTS:
            await conn.execute(stmt)
            first = " ".join(stmt.split())[:74]
            print(f"  ok: {first}{'...' if len(first) >= 74 else ''}")

        # AFTER
        rows = await conn.fetch(SQL_LIST_USAGE_TABLES)
        after = [r["table_name"] for r in rows]
        print(f"\nAFTER  — tables matching 'usage_counters%': {after}")

        created = sorted(set(after) - set(before))
        if created:
            print(f"\nNew tables created this run: {created}")
        else:
            print("\nNo new tables created (already present — no-op).")

    finally:
        await conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
