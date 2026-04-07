import json
import logging
import traceback
from typing import Optional

import httpx

from app.providers.base import LLMProvider

logger = logging.getLogger(__name__)

_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini", max_retries: int = 3):
        self.api_key = api_key or ""
        self.model = model
        self.max_retries = max_retries

    def _headers(self) -> dict:
        if not self.api_key:
            raise RuntimeError(
                "OpenAI API key is missing. Set it in Settings → AI Provider."
            )
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    # ── JSON generation ───────────────────────────────────────────────────────

    async def generate_json(self, prompt: str, system: str) -> Optional[dict]:
        try:
            headers = self._headers()
        except RuntimeError as exc:
            logger.error("OpenAI setup error: %s", exc)
            return None

        # System prompt goes inside the messages array as role "system".
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 2048,
            "response_format": {"type": "json_object"},
        }

        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                    response = await client.post(
                        _OPENAI_API_URL, json=payload, headers=headers
                    )
                    if not response.is_success:
                        logger.error(
                            "OpenAI HTTP %s — body: %s",
                            response.status_code,
                            response.text,
                        )
                        print(
                            f"[openai] generate_json HTTP {response.status_code}:\n{response.text}",
                            flush=True,
                        )
                    response.raise_for_status()
                    content = response.json()["choices"][0]["message"]["content"]
                    return json.loads(content)
            except httpx.HTTPStatusError as exc:
                logger.error("OpenAI HTTP error: %s", exc)
                return None
            except (json.JSONDecodeError, ValueError, KeyError) as exc:
                logger.warning(
                    "OpenAI JSON parse failure on attempt %d/%d: %s",
                    attempt,
                    self.max_retries,
                    exc,
                )
                if attempt == self.max_retries:
                    logger.error("All %d OpenAI retries exhausted", self.max_retries)
                    return None
            except Exception as exc:
                logger.error("OpenAI error: %s", exc)
                print(traceback.format_exc(), flush=True)
                return None

        return None

    # ── Chat generation ───────────────────────────────────────────────────────

    async def generate_chat(self, messages: list[dict], system: str) -> Optional[str]:
        try:
            headers = self._headers()
        except RuntimeError as exc:
            logger.error("OpenAI setup error: %s", exc)
            return None

        # System prompt is the first entry in the messages array.
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}] + messages,
            "temperature": 0.7,
            "max_tokens": 1024,
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                response = await client.post(
                    _OPENAI_API_URL, json=payload, headers=headers
                )
                if not response.is_success:
                    logger.error(
                        "OpenAI HTTP %s — body: %s",
                        response.status_code,
                        response.text,
                    )
                    print(
                        f"[openai] generate_chat HTTP {response.status_code}:\n{response.text}",
                        flush=True,
                    )
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as exc:
            logger.error("OpenAI HTTP error: %s", exc)
            return None
        except (KeyError, ValueError) as exc:
            logger.error("OpenAI chat response parse error: %s", exc)
            return None
        except Exception as exc:
            logger.error("OpenAI error: %s", exc)
            print(traceback.format_exc(), flush=True)
            return None
