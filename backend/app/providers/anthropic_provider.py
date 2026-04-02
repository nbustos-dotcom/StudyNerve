import json
import logging
from typing import Optional

import httpx

from app.providers.base import LLMProvider

logger = logging.getLogger(__name__)

_ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
_MODEL = "claude-sonnet-4-20250514"
_ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, max_retries: int = 3):
        self.api_key = api_key
        self.max_retries = max_retries
        self.model = _MODEL

    def _headers(self) -> dict:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "Content-Type": "application/json",
        }

    async def generate_json(self, prompt: str, system: str) -> Optional[dict]:
        payload = {
            "model": self.model,
            "max_tokens": 2048,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 1,  # Anthropic requires temp=1 with extended thinking; use default
        }

        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                    response = await client.post(
                        _ANTHROPIC_API_URL, json=payload, headers=self._headers()
                    )
                    response.raise_for_status()
                    content = response.json()["content"][0]["text"]
                    # Extract JSON from the response (model may wrap in markdown)
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
                return None

        return None

    async def generate_chat(self, messages: list[dict], system: str) -> Optional[str]:
        payload = {
            "model": self.model,
            "max_tokens": 1024,
            "system": system,
            "messages": messages,
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                response = await client.post(
                    _ANTHROPIC_API_URL, json=payload, headers=self._headers()
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
            return None
