"""
LLM quota enforcement — atomic reserve-then-check.

Every interactive LLM endpoint calls `enforce_user_call(...)` *before* the LLM
spend. Background jobs use `try_reserve_global_only(...)`.

Reservations are atomic per the spec: a single INSERT ... ON CONFLICT DO UPDATE
... RETURNING that increments the row and returns the post-increment count. The
caller then compares the returned count to the configured ceiling and rejects
if over. The increment is NEVER reverted on rejection — overcount on a pre-call
failure is acceptable, undercount is not.

BYOK users (those who saved their own llm_api_key in Settings) bypass every cap.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Final, Literal

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import UserSettings, utctoday

logger = logging.getLogger(__name__)

# ── Bucket constants ─────────────────────────────────────────────────────────
# Must match the CHECK constraint on usage_counters.kind.

BUCKET_TUTOR_MSGS: Final = "tutor_msgs"
BUCKET_QUIZ_GENS: Final = "quiz_gens"
BUCKET_NOTES_AI: Final = "notes_ai"
GLOBAL_BUCKET_ALL: Final = "all"

Bucket = Literal["tutor_msgs", "quiz_gens", "notes_ai"]


def _user_limit_for(bucket: Bucket) -> int:
    return {
        BUCKET_TUTOR_MSGS: settings.MAX_TUTOR_MSGS_PER_DAY,
        BUCKET_QUIZ_GENS: settings.MAX_QUIZ_GENS_PER_DAY,
        BUCKET_NOTES_AI: settings.MAX_NOTES_AI_PER_DAY,
    }[bucket]


def _bucket_label(bucket: Bucket) -> str:
    return {
        BUCKET_TUTOR_MSGS: "tutor messages",
        BUCKET_QUIZ_GENS: "quiz generations",
        BUCKET_NOTES_AI: "AI-on-notes calls",
    }[bucket]


# ── Atomic UPSERT SQL (portable across Postgres and SQLite ≥ 3.35) ───────────

_UPSERT_USER_SQL = text(
    """
    INSERT INTO usage_counters (user_id, day, kind, count, tokens_estimate, updated_at)
    VALUES (:user_id, :day, :kind, 1, :tokens, :now)
    ON CONFLICT (user_id, day, kind) DO UPDATE
    SET count = usage_counters.count + 1,
        tokens_estimate = usage_counters.tokens_estimate + EXCLUDED.tokens_estimate,
        updated_at = EXCLUDED.updated_at
    RETURNING count, tokens_estimate
    """
)

_UPSERT_GLOBAL_SQL = text(
    """
    INSERT INTO usage_counters_global (day, kind, count, tokens_estimate, updated_at)
    VALUES (:day, :kind, 1, :tokens, :now)
    ON CONFLICT (day, kind) DO UPDATE
    SET count = usage_counters_global.count + 1,
        tokens_estimate = usage_counters_global.tokens_estimate + EXCLUDED.tokens_estimate,
        updated_at = EXCLUDED.updated_at
    RETURNING count, tokens_estimate
    """
)


@dataclass
class ReserveResult:
    count: int
    tokens_estimate: int


async def _reserve_global(tokens: int) -> ReserveResult:
    """Atomic +1 on the 'all' breaker row. Commits on its own session so the
    increment survives request rollback (we never undercount on failure)."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            _UPSERT_GLOBAL_SQL,
            {
                "day": utctoday(),
                "kind": GLOBAL_BUCKET_ALL,
                "tokens": int(tokens),
                "now": datetime.now(timezone.utc),
            },
        )
        row = result.first()
        await session.commit()
        if row is None:
            # Unreachable on Postgres + SQLite ≥ 3.35 — defensive only.
            raise RuntimeError("global upsert returned no row")
        return ReserveResult(count=int(row[0]), tokens_estimate=int(row[1]))


async def _reserve_user(user_id: int, bucket: Bucket, tokens: int) -> ReserveResult:
    """Atomic +1 on the (user, day, bucket) row. Same commit-immediately
    contract as `_reserve_global`."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            _UPSERT_USER_SQL,
            {
                "user_id": int(user_id),
                "day": utctoday(),
                "kind": bucket,
                "tokens": int(tokens),
                "now": datetime.now(timezone.utc),
            },
        )
        row = result.first()
        await session.commit()
        if row is None:
            raise RuntimeError("user upsert returned no row")
        return ReserveResult(count=int(row[0]), tokens_estimate=int(row[1]))


async def is_byok(db: AsyncSession, user_id: int) -> bool:
    """True iff the user has saved their own LLM API key (BYOK)."""
    row = await db.scalar(select(UserSettings).where(UserSettings.user_id == user_id))
    return bool(row and row.llm_api_key)


# ── Public API ───────────────────────────────────────────────────────────────


async def enforce_user_call(
    db: AsyncSession,
    user_id: int,
    bucket: Bucket,
    estimated_tokens: int = 0,
) -> None:
    """
    Reserve one LLM call against (user, bucket) + (global). Atomic per spec:
    each reservation is a single INSERT ... ON CONFLICT DO UPDATE ... RETURNING.

    Order: per-user FIRST, then global. A user already over their own bucket
    must be rejected without touching the global breaker — otherwise repeated
    429s from one user inflate the global totals and can falsely trip the 503
    for everyone despite no real LLM spend. On either ceiling breach raises
    HTTPException so FastAPI returns the body to the client:
      - 429 with a per-bucket message when the user cap trips
      - 503 with the "AI temporarily at capacity" message when the breaker trips

    BYOK users skip both checks.
    """
    if await is_byok(db, user_id):
        return

    u = await _reserve_user(user_id, bucket, estimated_tokens)
    limit = _user_limit_for(bucket)
    if u.count > limit:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily limit reached for {_bucket_label(bucket)} ({limit}/day). "
                f"Resets at 00:00 UTC. Add your own AI key in Settings to remove the cap."
            ),
        )

    g = await _reserve_global(estimated_tokens)
    if (
        g.count > settings.GLOBAL_LLM_CALLS_PER_DAY
        or g.tokens_estimate > settings.GLOBAL_LLM_TOKENS_PER_DAY
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "AI temporarily at capacity. Try again after 00:00 UTC, or add "
                "your own AI key in Settings to keep going."
            ),
        )


async def try_reserve_global_only(estimated_tokens: int = 0) -> bool:
    """For background jobs (e.g. post-session insight extraction).

    Charges the global breaker only — *never* the per-user bucket — so users
    don't lose visible quota to automatic work that runs on their behalf.
    Returns False (silent, no exception) when the global breaker is tripped so
    the caller can skip the LLM call without surfacing an error to the user.
    """
    g = await _reserve_global(estimated_tokens)
    return not (
        g.count > settings.GLOBAL_LLM_CALLS_PER_DAY
        or g.tokens_estimate > settings.GLOBAL_LLM_TOKENS_PER_DAY
    )


# ── Key hygiene ──────────────────────────────────────────────────────────────


def redact(value: object) -> str:
    """Stable placeholder for any code that needs to log key state without
    leaking the body. Use as: `logger.info("key=%s", redact(api_key))`."""
    if value is None or value == "":
        return "<unset>"
    return "<set>"


# Patterns for keys we explicitly do not want appearing in logs anywhere in
# the process, even if a careless f-string sneaks one in. Used by the logging
# filter installed in app/main.py.
_KEY_PATTERNS = re.compile(
    r"\b("
    r"gsk_[A-Za-z0-9_\-]{8,}"        # Groq
    r"|sk-ant-[A-Za-z0-9_\-]{8,}"    # Anthropic
    r"|sk-[A-Za-z0-9_\-]{8,}"        # OpenAI / generic
    r"|AIza[A-Za-z0-9_\-]{8,}"       # Google
    r")"
)


class SecretRedactingFilter(logging.Filter):
    """Defense-in-depth: scrub anything that looks like a vendor API key from
    every log record before it is emitted. Catches accidental f-strings,
    exception messages, and third-party logger output.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            if isinstance(record.msg, str) and _KEY_PATTERNS.search(record.msg):
                record.msg = _KEY_PATTERNS.sub("<REDACTED-KEY>", record.msg)
            if record.args:
                if isinstance(record.args, dict):
                    record.args = {k: _scrub_value(v) for k, v in record.args.items()}
                elif isinstance(record.args, tuple):
                    record.args = tuple(_scrub_value(v) for v in record.args)
        except Exception:
            # Never let a filter raise — logging would degrade catastrophically.
            pass
        return True


def _scrub_value(value: object) -> object:
    if isinstance(value, str) and _KEY_PATTERNS.search(value):
        return _KEY_PATTERNS.sub("<REDACTED-KEY>", value)
    return value


def install_redaction_filter() -> None:
    """Attach SecretRedactingFilter to the root logger. Call once at startup."""
    root = logging.getLogger()
    if not any(isinstance(f, SecretRedactingFilter) for f in root.filters):
        root.addFilter(SecretRedactingFilter())
