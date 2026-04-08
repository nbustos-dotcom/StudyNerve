import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Attempt, Note, Question, Topic

# Exponential decay rate: attempts ~10 days old are weighted at ~37% of today's
DECAY_LAMBDA = 0.1


@dataclass
class TopicGapScore:
    topic_id: int
    topic_name: str
    note_id: int
    total_attempts: int
    accuracy: float
    recency_weight: float
    frequency_factor: float
    gap_score: float


async def calculate_gap_scores(
    db: AsyncSession,
    user_id: Optional[int] = None,
) -> list[TopicGapScore]:
    """
    For each topic with attempt history, compute:
      - accuracy         = correct / total
      - recency_weight   = exponentially-weighted error rate (recent failures count more)
      - frequency_factor = less-tested topics get a boost
      - gap_score        = (1 - accuracy) * recency_weight * frequency_factor

    Returns topics sorted by gap_score descending (weakest first).
    When user_id is provided, only considers attempts for that user's notes.
    """
    print(f"[query] calculate_gap_scores: user_id={user_id}", flush=True)
    query = (
        select(
            Attempt.is_correct,
            Attempt.created_at,
            Topic.id.label("topic_id"),
            Topic.name.label("topic_name"),
            Topic.note_id,
        )
        .select_from(Attempt)
        .join(Question, Attempt.question_id == Question.id)
        .join(Topic, Question.topic_id == Topic.id)
    )

    if user_id is not None:
        query = (
            query
            .join(Note, Topic.note_id == Note.id)
            .where(Note.user_id == user_id)
        )

    query = query.order_by(Attempt.created_at)
    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return []

    now = datetime.now(timezone.utc)

    # Group raw rows by topic
    topic_data: dict[int, dict] = defaultdict(lambda: {
        "topic_name": "",
        "note_id": 0,
        "attempts": [],
    })

    for row in rows:
        tid = row.topic_id
        topic_data[tid]["topic_name"] = row.topic_name
        topic_data[tid]["note_id"] = row.note_id

        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_days = (now - created).total_seconds() / 86400.0

        topic_data[tid]["attempts"].append({
            "is_correct": bool(row.is_correct),
            "age_days": age_days,
        })

    max_attempts = max(len(d["attempts"]) for d in topic_data.values())

    gap_scores: list[TopicGapScore] = []
    for topic_id, data in topic_data.items():
        attempts = data["attempts"]
        total = len(attempts)

        # Raw accuracy
        correct = sum(1 for a in attempts if a["is_correct"])
        accuracy = correct / total

        # Recency-weighted error rate: recent wrong answers are penalised more
        weighted_wrong = 0.0
        weighted_total = 0.0
        for a in attempts:
            w = math.exp(-DECAY_LAMBDA * a["age_days"])
            weighted_total += w
            if not a["is_correct"]:
                weighted_wrong += w
        recency_weight = weighted_wrong / weighted_total if weighted_total > 0 else 0.0

        # Frequency factor: topics with fewer attempts get a boost so they
        # surface before the model has had a chance to test them adequately.
        frequency_factor = math.log(max_attempts + 2) / math.log(total + 2)

        gap_score = (1.0 - accuracy) * recency_weight * frequency_factor

        gap_scores.append(TopicGapScore(
            topic_id=topic_id,
            topic_name=data["topic_name"],
            note_id=data["note_id"],
            total_attempts=total,
            accuracy=accuracy,
            recency_weight=recency_weight,
            frequency_factor=frequency_factor,
            gap_score=gap_score,
        ))

    gap_scores.sort(key=lambda x: x.gap_score, reverse=True)
    return gap_scores
