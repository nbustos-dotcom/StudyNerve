import os
import traceback
from contextlib import asynccontextmanager

print("Starting StudyNerve AI API...", flush=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.llm import check_health

from app.routers import canvas, chat, notes, profile, quiz, topics, vision
from app.routers.auth import router as auth_router
from app.routers.settings import router as settings_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="AI Teacher", version="0.1.0", lifespan=lifespan)

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


@app.get("/api/health")
async def health():
    return await check_health()


@app.get("/api/test-providers")
async def test_providers():
    """
    Smoke-test every configured LLM provider. No auth required.
    Uses API keys from environment variables / .env.
    Prints full tracebacks + response bodies to server console on failure.
    """
    import asyncio as _asyncio
    import traceback as _tb

    import httpx as _httpx

    from app.config import settings as _s

    results = []
    _user_msg = [{"role": "user", "content": "Say hello in one sentence."}]

    def _err(name: str, exc: Exception, extra: dict | None = None) -> dict:
        """Build a failure result, capturing HTTP response body when available."""
        body = None
        if isinstance(exc, _httpx.HTTPStatusError):
            body = exc.response.text
        entry: dict = {
            "provider": name,
            "success": False,
            "error": str(exc),
        }
        if body:
            entry["response_body"] = body
        if extra:
            entry.update(extra)
        print(f"[test-providers] {name}:\n{_tb.format_exc()}", flush=True)
        if body:
            print(f"[test-providers] {name} response body: {body}", flush=True)
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
                "success": True,
                "response": r.json()["message"]["content"],
            })
    except Exception as exc:
        results.append(_err("ollama", exc, {"url": _s.OLLAMA_BASE_URL, "model": _s.OLLAMA_MODEL}))

    # ── Groq ─────────────────────────────────────────────────────────────────
    _groq_key = _s.GROQ_API_KEY
    try:
        if not _groq_key:
            raise RuntimeError("GROQ_API_KEY not set")
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
                "api_key_set": True,
                "success": True,
                "response": r.json()["choices"][0]["message"]["content"],
            })
    except Exception as exc:
        results.append(_err("groq", exc, {
            "url": "https://api.groq.com/openai/v1/chat/completions",
            "model": "llama-3.1-8b-instant",
            "api_key_set": bool(_groq_key),
        }))

    # ── OpenAI ────────────────────────────────────────────────────────────────
    _openai_key = _s.OPENAI_API_KEY
    try:
        if not _openai_key:
            raise RuntimeError("OPENAI_API_KEY not set")
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
                "api_key_set": True,
                "success": True,
                "response": r.json()["choices"][0]["message"]["content"],
            })
    except Exception as exc:
        results.append(_err("openai", exc, {
            "url": "https://api.openai.com/v1/chat/completions",
            "model": "gpt-4o-mini",
            "api_key_set": bool(_openai_key),
        }))

    # ── Anthropic ─────────────────────────────────────────────────────────────
    # system must be a top-level string field; messages may only contain user/assistant.
    _anthropic_key = _s.ANTHROPIC_API_KEY
    try:
        if not _anthropic_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
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
                "api_key_set": True,
                "success": True,
                "response": r.json()["content"][0]["text"],
            })
    except Exception as exc:
        results.append(_err("anthropic", exc, {
            "url": "https://api.anthropic.com/v1/messages",
            "model": "claude-sonnet-4-20250514",
            "api_key_set": bool(_anthropic_key),
        }))

    # ── Gemini ────────────────────────────────────────────────────────────────
    _gemini_key = _s.GEMINI_API_KEY
    try:
        if not _gemini_key:
            raise RuntimeError("GEMINI_API_KEY not set")
        import google.generativeai as _genai  # type: ignore
        # Always call configure before creating the model so the correct key is active.
        _genai.configure(api_key=_gemini_key)
        _gmodel = _genai.GenerativeModel("gemini-2.0-flash")
        _resp = await _asyncio.to_thread(_gmodel.generate_content, "Say hello in one sentence.")
        results.append({
            "provider": "gemini",
            "model": "gemini-2.0-flash",
            "api_key_set": True,
            "success": True,
            "response": _resp.text,
        })
    except Exception as exc:
        results.append(_err("gemini", exc, {
            "model": "gemini-2.0-flash",
            "api_key_set": bool(_gemini_key),
        }))

    return {"results": results}


@app.get("/api/test-gemini")
async def test_gemini():
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
