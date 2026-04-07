import asyncio
import json
import logging
import traceback
from typing import Optional

from app.providers.base import LLMProvider

logger = logging.getLogger(__name__)

_MODEL_NAME = "gemini-2.0-flash"


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, max_retries: int = 3):
        self.api_key = api_key or ""
        self.max_retries = max_retries
        self.model_name = _MODEL_NAME

    def _get_model(self, system_instruction: str | None = None):
        """
        Import the SDK, validate the API key, call genai.configure, and return
        a GenerativeModel instance. configure() is called on every request so
        the correct key is always active (important when multiple users with
        different keys share the same process).
        """
        try:
            import google.generativeai as genai
        except ImportError:
            raise RuntimeError(
                "google-generativeai package not installed. "
                "Run: pip install google-generativeai"
            )

        if not self.api_key:
            raise RuntimeError(
                "Gemini API key is missing. Set it in Settings → AI Provider."
            )

        # Always configure before building the model — this sets the global
        # API key used by the SDK for the current request.
        genai.configure(api_key=self.api_key)
        logger.info("Gemini: configured with key present=%s", bool(self.api_key))

        kwargs = {}
        if system_instruction:
            kwargs["system_instruction"] = system_instruction

        return genai.GenerativeModel(self.model_name, **kwargs)

    # ── JSON generation ───────────────────────────────────────────────────────

    async def generate_json(self, prompt: str, system: str) -> Optional[dict]:
        try:
            model = self._get_model(system_instruction=system)
        except RuntimeError as exc:
            logger.error("Gemini setup error: %s", exc)
            return None

        for attempt in range(1, self.max_retries + 1):
            try:
                response = await asyncio.to_thread(
                    model.generate_content,
                    prompt,
                    generation_config={
                        "response_mime_type": "application/json",
                        "temperature": 0.7,
                        "max_output_tokens": 2048,
                    },
                )
                return json.loads(response.text)
            except (json.JSONDecodeError, ValueError) as exc:
                logger.warning(
                    "Gemini JSON parse failure on attempt %d/%d: %s",
                    attempt,
                    self.max_retries,
                    exc,
                )
                if attempt == self.max_retries:
                    logger.error("All %d Gemini retries exhausted", self.max_retries)
                    return None
            except Exception as exc:
                logger.error("Gemini generate_json error: %s", exc, exc_info=True)
                print(traceback.format_exc(), flush=True)
                return None

        return None

    # ── Chat generation ───────────────────────────────────────────────────────

    async def generate_chat(self, messages: list[dict], system: str) -> Optional[str]:
        try:
            model = self._get_model(system_instruction=system)
        except RuntimeError as exc:
            logger.error("Gemini setup error: %s", exc)
            return None

        # Map "assistant" → "model" — Gemini uses "model" for the AI role.
        contents = [
            {
                "role": "user" if m["role"] == "user" else "model",
                "parts": [m["content"]],
            }
            for m in messages
            if m.get("role") in ("user", "assistant")
        ]

        # Gemini requires alternating user/model turns and must end on "user".
        if not contents or contents[-1]["role"] != "user":
            logger.error(
                "Gemini: messages must not be empty and must end with a user turn"
            )
            return None

        try:
            response = await asyncio.to_thread(
                model.generate_content,
                contents,
                generation_config={"temperature": 0.7, "max_output_tokens": 1024},
            )
            return response.text
        except Exception as exc:
            logger.error("Gemini generate_chat error: %s", exc, exc_info=True)
            print(traceback.format_exc(), flush=True)
            return None
