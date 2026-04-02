import asyncio
import json
import logging
import traceback
from typing import Optional

from app.providers.base import LLMProvider

logger = logging.getLogger(__name__)


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, max_retries: int = 3):
        self.api_key = api_key or ""
        self.max_retries = max_retries
        self.model_name = "gemini-2.0-flash"

    def _configure(self):
        """Import, validate key, and configure the SDK. Returns the genai module."""
        try:
            import google.generativeai as genai
        except ImportError:
            raise RuntimeError("google-generativeai package not installed")

        logger.info("Using provider: gemini | API key present: %s", bool(self.api_key))

        if not self.api_key:
            raise RuntimeError(
                "Gemini API key is missing. Set it in Settings → AI Provider."
            )

        genai.configure(api_key=self.api_key)
        return genai

    async def generate_json(self, prompt: str, system: str) -> Optional[dict]:
        try:
            genai = self._configure()
        except RuntimeError as exc:
            logger.error("Gemini setup error: %s", exc)
            return None

        model = genai.GenerativeModel(self.model_name, system_instruction=system)

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

    async def generate_chat(self, messages: list[dict], system: str) -> Optional[str]:
        try:
            genai = self._configure()
        except RuntimeError as exc:
            logger.error("Gemini setup error: %s", exc)
            return None

        model = genai.GenerativeModel(self.model_name, system_instruction=system)

        # Build a contents list for generate_content — maps "assistant" → "model"
        # so Gemini's role validation doesn't reject it.
        contents = [
            {
                "role": "user" if m["role"] == "user" else "model",
                "parts": [m["content"]],
            }
            for m in messages
        ]

        # Gemini requires the conversation to start with a "user" turn and
        # alternate user/model. If the last entry is "model" (shouldn't happen
        # during normal chat, but guard anyway), drop it.
        if contents and contents[-1]["role"] != "user":
            logger.warning("Gemini: last message is not from user — dropping it")
            contents = contents[:-1]

        if not contents:
            logger.error("Gemini: no user messages to send")
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
