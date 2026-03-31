from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import LearningStyleResponse
from app.services.learning_style import detect_learning_style

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/learning-style", response_model=LearningStyleResponse)
async def learning_style(db: AsyncSession = Depends(get_db)):
    """
    Analyse the student's quiz attempts and chat history to infer their
    learning style, preferred pace, and detail level.
    """
    profile = await detect_learning_style(db)
    return LearningStyleResponse(
        style=profile.style,
        pace=profile.pace,
        detail_level=profile.detail_level,
        confidence_note=profile.confidence_note,
        data_points=profile.data_points,
    )
