"""
User settings router.

Endpoints:
  GET  /api/settings            — return current user's provider + canvas settings
  POST /api/settings/provider   — save LLM provider + API key for the current user
  POST /api/settings/canvas     — save Canvas URL + token for the current user
"""

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.crypto import decrypt_secret, encrypt_secret
from app.database import get_db
from app.models import User, UserSettings
from app.routers.auth import get_current_user
from app.schemas import CanvasSettingsRequest, ProviderSettingsRequest, UserSettingsResponse

router = APIRouter(prefix="/settings", tags=["settings"])

_VALID_PROVIDERS = {"ollama", "gemini", "openai", "anthropic", "groq"}


async def _get_or_create_settings(db: AsyncSession, user_id: int) -> UserSettings:
    row = await db.scalar(select(UserSettings).where(UserSettings.user_id == user_id))
    if row is None:
        row = UserSettings(user_id=user_id)
        db.add(row)
        await db.flush()
    return row


async def get_user_llm_kwargs(db: AsyncSession, user_id: int) -> dict:
    """
    Return {'provider_name': ..., 'api_key': ...} from UserSettings.
    Falls back to {} (empty dict) so callers use the global LLM_PROVIDER env var.
    api_key is None when the user hasn't saved a key — providers then fall back
    to their own *_API_KEY env var.
    """
    row = await db.scalar(select(UserSettings).where(UserSettings.user_id == user_id))
    if row:
        import logging as _logging
        _logging.getLogger(__name__).info(
            "get_user_llm_kwargs: user=%d provider=%s key_set=%s",
            user_id,
            row.llm_provider,
            bool(row.llm_api_key),
        )
        print(
            f"[settings] user={user_id} provider={row.llm_provider} key_set={bool(row.llm_api_key)}",
            flush=True,
        )
        api_key = decrypt_secret(row.llm_api_key) if row.llm_api_key else None
        return {
            "provider_name": row.llm_provider,
            "api_key": api_key,
        }
    import logging as _logging
    _logging.getLogger(__name__).info(
        "get_user_llm_kwargs: user=%d — no UserSettings row, using global defaults", user_id
    )
    print(f"[settings] user={user_id} — no UserSettings row, using global defaults", flush=True)
    return {}


async def get_user_canvas_creds(db: AsyncSession, user_id: int) -> tuple[str, str]:
    """
    Return (canvas_base_url, canvas_token) for user, falling back to global settings.
    The canvas service normalises the URL itself (appends /api/v1 if needed).
    """
    row = await db.scalar(select(UserSettings).where(UserSettings.user_id == user_id))
    url = (row and row.canvas_url) or settings.CANVAS_API_URL or ""
    raw_token = (row and row.canvas_token) or settings.CANVAS_API_TOKEN or ""
    token = decrypt_secret(raw_token) if raw_token else ""
    return url, token


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=UserSettingsResponse)
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.scalar(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )
    canvas_url = (row and row.canvas_url) or settings.CANVAS_API_URL or None
    canvas_token = (row and row.canvas_token) or settings.CANVAS_API_TOKEN or None

    return UserSettingsResponse(
        llm_provider=(row.llm_provider if row else settings.LLM_PROVIDER),
        llm_api_key_set=bool(row and row.llm_api_key),
        canvas_url=canvas_url,
        canvas_connected=bool(canvas_token),
    )


@router.post("/provider", response_model=UserSettingsResponse)
async def save_provider(
    body: ProviderSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.provider not in _VALID_PROVIDERS:
        raise HTTPException(
            status_code=422,
            detail=f"provider must be one of: {', '.join(sorted(_VALID_PROVIDERS))}",
        )

    row = await _get_or_create_settings(db, current_user.id)
    row.llm_provider = body.provider
    if body.api_key is not None:
        stripped = body.api_key.strip()
        row.llm_api_key = encrypt_secret(stripped) if stripped else None

    await db.flush()

    canvas_url = row.canvas_url or settings.CANVAS_API_URL or None
    canvas_token = row.canvas_token or settings.CANVAS_API_TOKEN or None

    return UserSettingsResponse(
        llm_provider=row.llm_provider,
        llm_api_key_set=bool(row.llm_api_key),
        canvas_url=canvas_url,
        canvas_connected=bool(canvas_token),
    )


@router.post("/canvas", response_model=UserSettingsResponse)
async def save_canvas(
    body: CanvasSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Normalise URL: strip any /api/v* suffix so we always store the clean base URL.
    # The canvas service appends /api/v1 itself.
    url = re.sub(r"/api/v\d+/?$", "", body.canvas_url.strip()).rstrip("/")
    token = body.canvas_token.strip()

    if not url:
        raise HTTPException(status_code=422, detail="canvas_url must not be empty.")

    row = await _get_or_create_settings(db, current_user.id)
    row.canvas_url = url
    row.canvas_token = encrypt_secret(token) if token else None
    await db.flush()

    # Validate the token by hitting Canvas right now
    canvas_connected = False
    if token:
        from app.services.canvas import validate_connection
        canvas_connected, _msg = await validate_connection(url, token)
        print(f"[settings] Canvas validation: {_msg}", flush=True)

    return UserSettingsResponse(
        llm_provider=row.llm_provider,
        llm_api_key_set=bool(row.llm_api_key),
        canvas_url=url,
        canvas_connected=canvas_connected,
    )
