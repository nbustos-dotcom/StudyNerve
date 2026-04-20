import logging
import os
import traceback
from contextlib import asynccontextmanager

print("Starting StudyNerve AI API...", flush=True)

from fastapi import Depends, FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.database import init_db
from app.llm import check_health
from app.models import User
from app.routers import canvas, chat, flashcards, notes, profile, quiz, topics, vision
from app.routers.auth import get_current_user, router as auth_router
from app.routers.settings import router as settings_router

_isolation_logger = logging.getLogger("user_isolation")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="AI Teacher", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_allow_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
_frontend_url = os.getenv("FRONTEND_URL", "")
if _frontend_url:
    _allow_origins.append(_frontend_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(topics.router, prefix="/api")
app.include_router(quiz.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(canvas.router, prefix="/api")
app.include_router(vision.router, prefix="/api")
app.include_router(flashcards.router, prefix="/api")


def assert_user_owns(obj, authenticated_user_id: int, label: str = "") -> None:
    """
    Runtime isolation check. Call this after any db.get() or query result to
    verify the returned object belongs to the authenticated user. Logs a CRITICAL
    warning (and raises 403) if a mismatch is detected — this indicates a data
    isolation bug before data reaches the response.

    Usage:
        note = await db.get(Note, note_id)
        assert_user_owns(note, current_user.id, "Note")
    """
    if obj is None:
        return
    obj_uid = getattr(obj, "user_id", None)
    if obj_uid is not None and obj_uid != authenticated_user_id:
        msg = (
            f"USER ISOLATION VIOLATION — {label or type(obj).__name__} "
            f"id={getattr(obj, 'id', '?')} has user_id={obj_uid} "
            f"but authenticated user is {authenticated_user_id}"
        )
        _isolation_logger.critical(msg)
        print(f"[SECURITY] {msg}", flush=True)
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Access denied")


@app.get("/api/health")
async def health():
    return await check_health()


@app.get("/api/test-providers")
async def test_providers(
    current_user: User = Depends(get_current_user),
    authorization: str | None = Header(default=None),
):
    """
    Smoke-test every configured LLM provider.

    - No auth required, but if a Bearer token is supplied the endpoint will
      look up that user's saved provider + API key from the database and
      test with those instead of the environment-variable defaults.
    - For the user's selected provider, their saved key is used (key_source="user").
    - For all other providers, the env-var key is used (key_source="env").
    - Full tracebacks + API response bodies are printed to the server console
      on failure so you can see exactly what the remote API returned.
    """
    import asyncio as _asyncio
    import traceback as _tb

    import httpx as _httpx

    from app.config import settings as _s

    # ── Resolve user's saved provider + key (if a token was sent) ────────────
    user_saved_provider: str | None = None
    user_saved_key: str | None = None

    if authorization and authorization.startswith("Bearer "):
        _token = authorization[7:]
        try:
            from jose import JWTError, jwt as _jwt
            _payload = _jwt.decode(_token, _s.SECRET_KEY, algorithms=["HS256"])
            _user_id = int(_payload.get("sub", 0))
            if _user_id:
                from sqlalchemy import select as _select
                from app.database import AsyncSessionLocal as _ASL
                from app.models import UserSettings as _US
                async with _ASL() as _db:
                    _row = await _db.scalar(_select(_US).where(_US.user_id == _user_id))
                    if _row:
                        user_saved_provider = _row.llm_provider
                        user_saved_key = _row.llm_api_key or None
                print(
                    f"[test-providers] user={_user_id} "
                    f"saved_provider={user_saved_provider} "
                    f"saved_key_set={bool(user_saved_key)}",
                    flush=True,
                )
        except Exception:
            print(f"[test-providers] could not decode auth token:\n{_tb.format_exc()}", flush=True)

    results = []
    _user_msg = [{"role": "user", "content": "Say hello in one sentence."}]

    def _key_for(provider: str, env_key: str) -> tuple[str, str]:
        """
        Return (key, key_source) for a given provider.
        Uses the user's saved key when they've selected this provider and
        have a key stored; otherwise falls back to the env var.
        """
        if user_saved_provider == provider and user_saved_key:
            return user_saved_key, "user_saved"
        return env_key, "env_var"

    def _err(name: str, exc: Exception, extra: dict | None = None) -> dict:
        body = None
        if isinstance(exc, _httpx.HTTPStatusError):
            body = exc.response.text
        entry: dict = {"provider": name, "success": False, "error": str(exc)}
        if body:
            entry["response_body"] = body
        if extra:
            entry.update(extra)
        print(f"[test-providers] {name} FAILED:\n{_tb.format_exc()}", flush=True)
        if body:
            print(f"[test-providers] {name} API response body:\n{body}", flush=True)
        return entry

    # ── Ollama ────────────────────────────────────────────────────────────────
    try:
        async with _httpx.AsyncClient(base_url=_s.OLLAMA_BASE_URL, timeout=15.0) as c:
            r = await c.post("/api/chat", json={
                "model": _s.OLLAMA_MODEL,
                "messages": [{"role": "system", "content": "You are helpful."}, *_user_msg],
                "stream": False,
            })
            r.raise_for_status()
            results.append({
                "provider": "ollama",
                "url": _s.OLLAMA_BASE_URL,
                "model": _s.OLLAMA_MODEL,
                "key_source": "n/a",
                "success": True,
                "response": r.json()["message"]["content"],
            })
    except Exception as exc:
        results.append(_err("ollama", exc, {
            "url": _s.OLLAMA_BASE_URL,
            "model": _s.OLLAMA_MODEL,
        }))

    # ── Groq ─────────────────────────────────────────────────────────────────
    _groq_key, _groq_src = _key_for("groq", _s.GROQ_API_KEY)
    try:
        if not _groq_key:
            raise RuntimeError(
                "GROQ_API_KEY not set (env var empty and no user-saved key)"
            )
        async with _httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {_groq_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [{"role": "system", "content": "You are helpful."}, *_user_msg],
                    "max_tokens": 80,
                },
            )
            r.raise_for_status()
            results.append({
                "provider": "groq",
                "url": "https://api.groq.com/openai/v1/chat/completions",
                "model": "llama-3.1-8b-instant",
                "key_source": _groq_src,
                "api_key_set": True,
                "success": True,
                "response": r.json()["choices"][0]["message"]["content"],
            })
    except Exception as exc:
        results.append(_err("groq", exc, {
            "url": "https://api.groq.com/openai/v1/chat/completions",
            "model": "llama-3.1-8b-instant",
            "key_source": _groq_src,
            "api_key_set": bool(_groq_key),
        }))

    # ── OpenAI ────────────────────────────────────────────────────────────────
    _openai_key, _openai_src = _key_for("openai", _s.OPENAI_API_KEY)
    try:
        if not _openai_key:
            raise RuntimeError(
                "OPENAI_API_KEY not set (env var empty and no user-saved key)"
            )
        async with _httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {_openai_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "system", "content": "You are helpful."}, *_user_msg],
                    "max_tokens": 80,
                },
            )
            r.raise_for_status()
            results.append({
                "provider": "openai",
                "url": "https://api.openai.com/v1/chat/completions",
                "model": "gpt-4o-mini",
                "key_source": _openai_src,
                "api_key_set": True,
                "success": True,
                "response": r.json()["choices"][0]["message"]["content"],
            })
    except Exception as exc:
        results.append(_err("openai", exc, {
            "url": "https://api.openai.com/v1/chat/completions",
            "model": "gpt-4o-mini",
            "key_source": _openai_src,
            "api_key_set": bool(_openai_key),
        }))

    # ── Anthropic ─────────────────────────────────────────────────────────────
    # system is a top-level string field; messages may only contain user/assistant.
    _anthropic_key, _anthropic_src = _key_for("anthropic", _s.ANTHROPIC_API_KEY)
    try:
        if not _anthropic_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY not set (env var empty and no user-saved key)"
            )
        async with _httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": _anthropic_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 80,
                    "system": "You are helpful.",
                    "messages": _user_msg,
                },
            )
            r.raise_for_status()
            results.append({
                "provider": "anthropic",
                "url": "https://api.anthropic.com/v1/messages",
                "model": "claude-sonnet-4-20250514",
                "key_source": _anthropic_src,
                "api_key_set": True,
                "success": True,
                "response": r.json()["content"][0]["text"],
            })
    except Exception as exc:
        results.append(_err("anthropic", exc, {
            "url": "https://api.anthropic.com/v1/messages",
            "model": "claude-sonnet-4-20250514",
            "key_source": _anthropic_src,
            "api_key_set": bool(_anthropic_key),
        }))

    # ── Gemini ────────────────────────────────────────────────────────────────
    _gemini_key, _gemini_src = _key_for("gemini", _s.GEMINI_API_KEY)
    try:
        if not _gemini_key:
            raise RuntimeError(
                "GEMINI_API_KEY not set (env var empty and no user-saved key)"
            )
        import google.generativeai as _genai  # type: ignore
        _genai.configure(api_key=_gemini_key)
        _gmodel = _genai.GenerativeModel("gemini-2.0-flash")
        _resp = await _asyncio.to_thread(_gmodel.generate_content, "Say hello in one sentence.")
        results.append({
            "provider": "gemini",
            "model": "gemini-2.0-flash",
            "key_source": _gemini_src,
            "api_key_set": True,
            "success": True,
            "response": _resp.text,
        })
    except Exception as exc:
        results.append(_err("gemini", exc, {
            "model": "gemini-2.0-flash",
            "key_source": _gemini_src,
            "api_key_set": bool(_gemini_key),
        }))

    return {
        "user_provider": user_saved_provider,
        "user_key_set": bool(user_saved_key),
        "results": results,
    }


@app.get("/api/test-gemini")
async def test_gemini(current_user: User = Depends(get_current_user)):
    import asyncio
    from app.config import settings

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return {"ok": False, "error": "GEMINI_API_KEY is not set in .env or environment"}

    try:
        import google.generativeai as genai
    except ImportError:
        return {"ok": False, "error": "google-generativeai package not installed"}

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = await asyncio.to_thread(model.generate_content, "Say hello")
        return {"ok": True, "response": response.text}
    except Exception as exc:
        tb = traceback.format_exc()
        print(tb, flush=True)
        return {"ok": False, "error": str(exc), "traceback": tb}
