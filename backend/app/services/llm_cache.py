"""
Simple in-memory LLM response cache.

Keyed by sha256(system + prompt). TTL per call type:
  - JSON calls (quiz, flashcards, topics): QUIZ_TTL = 24 hours
  - Chat calls: CHAT_TTL = 1 hour
"""

import hashlib
import logging
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

CHAT_TTL = 3_600      # 1 hour
QUIZ_TTL = 86_400     # 24 hours

_cache: dict[str, tuple[Any, float]] = {}


def _evict_expired() -> None:
    now = time.time()
    expired = [k for k, (_, exp) in _cache.items() if now > exp]
    for k in expired:
        del _cache[k]


def make_key(system: str, content: str) -> str:
    raw = f"{system}\x00{content}"
    return hashlib.sha256(raw.encode()).hexdigest()


def get(key: str) -> Optional[Any]:
    entry = _cache.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.time() > expires_at:
        del _cache[key]
        return None
    logger.info("llm_cache hit: key=%.16s", key)
    return value


def put(key: str, value: Any, ttl: int = CHAT_TTL) -> None:
    if len(_cache) > 2000:
        _evict_expired()
    _cache[key] = (value, time.time() + ttl)


def stats() -> dict:
    now = time.time()
    alive = sum(1 for _, (_, exp) in _cache.items() if now <= exp)
    return {"total_entries": len(_cache), "live_entries": alive}
