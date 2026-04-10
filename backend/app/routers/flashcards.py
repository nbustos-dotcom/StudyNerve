from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException

from app.database import get_db
from app.llm import generate_flashcards as llm_generate_flashcards
from app.models import Flashcard, Note, User, utcnow
from app.routers.auth import get_current_user
from app.routers.settings import get_user_llm_kwargs
from app.schemas import (
    FlashcardGenerateRequest,
    FlashcardGroupResponse,
    FlashcardResponse,
    FlashcardReviewRequest,
)

_MAX_CONTENT_CHARS = 3000
_DIFFICULTY_ORDER = {"hard": 0, "medium": 1, "easy": 2}

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


@router.post("/generate", response_model=list[FlashcardResponse], status_code=201)
async def generate(
    body: FlashcardGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await db.get(Note, body.note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")

    content = note.content[:_MAX_CONTENT_CHARS]
    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    result = await llm_generate_flashcards(content, body.count, **llm_kwargs)
    if result is None:
        raise HTTPException(status_code=502, detail="LLM unavailable or failed to generate flashcards")

    created: list[Flashcard] = []
    for card in result.get("cards", []):
        front = card.get("front", "").strip()
        back = card.get("back", "").strip()
        if not front or not back:
            continue
        fc = Flashcard(
            user_id=current_user.id,
            note_id=body.note_id,
            front=front,
            back=back,
        )
        db.add(fc)
        created.append(fc)

    await db.flush()
    for fc in created:
        await db.refresh(fc)
    return created


@router.get("", response_model=list[FlashcardGroupResponse])
async def list_flashcards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(Flashcard, Note.title)
        .outerjoin(Note, Flashcard.note_id == Note.id)
        .where(Flashcard.user_id == current_user.id)
        .order_by(Flashcard.note_id, Flashcard.created_at.desc())
    )
    groups: dict = {}
    for fc, note_title in rows.all():
        key = fc.note_id
        if key not in groups:
            groups[key] = {
                "note_id": fc.note_id,
                "note_title": note_title or "Untitled",
                "flashcards": [],
            }
        groups[key]["flashcards"].append(fc)
    return list(groups.values())


@router.get("/study", response_model=list[FlashcardResponse])
async def study_flashcards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Flashcard)
        .where(Flashcard.user_id == current_user.id)
        .order_by(Flashcard.times_reviewed.asc(), Flashcard.created_at.asc())
    )
    cards = list(result.scalars().all())
    # Secondary sort: hardest first within the same times_reviewed bucket
    cards.sort(key=lambda f: (f.times_reviewed, _DIFFICULTY_ORDER.get(f.difficulty, 1)))
    return cards


@router.put("/{flashcard_id}/review", response_model=FlashcardResponse)
async def review_flashcard(
    flashcard_id: int,
    body: FlashcardReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.difficulty not in ("easy", "medium", "hard"):
        raise HTTPException(status_code=422, detail="difficulty must be easy, medium, or hard")
    fc = await db.get(Flashcard, flashcard_id)
    if not fc or fc.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    fc.difficulty = body.difficulty
    fc.times_reviewed += 1
    fc.last_reviewed = utcnow()
    await db.flush()
    await db.refresh(fc)
    return fc


@router.delete("/{flashcard_id}", status_code=204)
async def delete_flashcard(
    flashcard_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fc = await db.get(Flashcard, flashcard_id)
    if not fc or fc.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    await db.delete(fc)
