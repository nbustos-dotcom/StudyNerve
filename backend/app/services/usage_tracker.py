"""
Per-user daily token usage tracker (in-memory, resets at midnight).

Usage is estimated at ~4 characters per token when providers don't return counts.
"""

import logging
from collections import defaultdict
from datetime import date

logger = logging.getLogger(__name__)

DAILY_LIMIT = 100_000  # rough daily token budget per user

# {user_id: {date_str: {"__total__": int, feature: int}}}
_usage: dict[int, dict[str, dict[str, int]]] = defaultdict(
    lambda: defaultdict(lambda: defaultdict(int))
)


def _today() -> str:
    return date.today().isoformat()


def estimate_tokens(text: str) -> int:
    """Rough 4 chars-per-token estimate."""
    return max(1, len(text) // 4)


def record(user_id: int, tokens: int, provider: str, feature: str) -> None:
    today = _today()
    _usage[user_id][today][feature] += tokens
    _usage[user_id][today]["__total__"] += tokens
    logger.debug(
        "usage: user=%d tokens=%d provider=%s feature=%s total=%d",
        user_id, tokens, provider, feature,
        _usage[user_id][today]["__total__"],
    )


def get_usage(user_id: int) -> dict:
    today = _today()
    day_data = dict(_usage[user_id][today])
    total = day_data.pop("__total__", 0)
    remaining = max(0, DAILY_LIMIT - total)
    return {
        "tokens_used_today": total,
        "estimated_remaining": remaining,
        "daily_limit": DAILY_LIMIT,
        "breakdown_by_feature": day_data,
        "date": today,
    }
