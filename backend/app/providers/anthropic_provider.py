import json
import logging
import traceback
from typing import Optional

import httpx

from app.providers.base import LLMProvider

logger = logging.getLogger(__name__)

_ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
_MODEL = "claude-sonnet-4-20250514"
_ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, max_retries: int = 3):
        self.api_key = api_key or ""
        self.max_retries = max_retries
        self.model = _MODEL

    def _headers(self) -> dict:
        if not self.api_key:
            raise RuntimeError(
                "Anthropic API key is missing. Set it in Settings → AI Provider."
            )
        return {
            "x-api-key": self.api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

    # ── JSON generation ───────────────────────────────────────────────────────

    async def generate_json(self, prompt: str, system: str) -> Optional[dict]:
        try:
            headers = self._headers()
        except RuntimeError as exc:
            logger.error("Anthropic setup error: %s", exc)
            return None

        # system must be a top-level string — NOT inside messages.
        # Messages must contain only user/assistant roles.
        payload = {
            "model": self.model,
            "max_tokens": 2048,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        }

        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                    response = await client.post(
                        _ANTHROPIC_API_URL, json=payload, headers=headers
                    )
                    if not response.is_success:
                        logger.error(
                            "Anthropic HTTP %s — body: %s",
                            response.status_code,
                            response.text,
                        )
                        print(
                            f"[anthropic] generate_json HTTP {response.status_code}:\n{response.text}",
                            flush=True,
                        )
                    response.raise_for_status()
                    content = response.json()["content"][0]["text"]
                    # Strip markdown code fences if model wrapped the JSON
                    text = content.strip()
                    if text.startswith("```"):
                        lines = text.splitlines()
                        text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
                    return json.loads(text)
            except httpx.HTTPStatusError as exc:
                logger.error("Anthropic HTTP error: %s", exc)
                return None
            except (json.JSONDecodeError, ValueError, KeyError) as exc:
                logger.warning(
                    "Anthropic JSON parse failure on attempt %d/%d: %s",
                    attempt,
                    self.max_retries,
                    exc,
                )
                if attempt == self.max_retries:
                    logger.error("All %d Anthropic retries exhausted", self.max_retries)
                    return None
            except Exception as exc:
                logger.error("Anthropic error: %s", exc)
                print(traceback.format_exc(), flush=True)
                return None

        return None

    # ── Chat generation ───────────────────────────────────────────────────────

    async def generate_chat(self, messages: list[dict], system: str) -> Optional[str]:
        try:
            headers = self._headers()
        except RuntimeError as exc:
            logger.error("Anthropic setup error: %s", exc)
            return None

        # Filter to only user/assistant roles — Anthropic rejects anything else.
        safe_messages = [
            m for m in messages if m.get("role") in ("user", "assistant")
        ]
        if not safe_messages:
            logger.error("Anthropic: no user/assistant messages to send")
            return None

        # Anthropic requires the turn sequence to start with "user".
        if safe_messages[0]["role"] != "user":
            logger.error("Anthropic: conversation must start with a user turn")
            return None

        payload = {
            "model": self.model,
            "max_tokens": 1024,
            "system": system,
            "messages": safe_messages,
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                response = await client.post(
                    _ANTHROPIC_API_URL, json=payload, headers=headers
                )
                if not response.is_success:
                    logger.error(
                        "Anthropic HTTP %s — body: %s",
                        response.status_code,
                        response.text,
                    )
                    print(
                        f"[anthropic] generate_chat HTTP {response.status_code}:\n{response.text}",
                        flush=True,
                    )
                response.raise_for_status()
                return response.json()["content"][0]["text"]
        except httpx.HTTPStatusError as exc:
            logger.error("Anthropic HTTP error: %s", exc)
            return None
        except (KeyError, ValueError) as exc:
            logger.error("Anthropic chat response parse error: %s", exc)
            return None
        except Exception as exc:
            logger.error("Anthropic error: %s", exc)
            print(traceback.format_exc(), flush=True)
            return None
