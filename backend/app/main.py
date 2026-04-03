import os
import traceback
from contextlib import asynccontextmanager

print("Starting Nerve API...", flush=True)

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
