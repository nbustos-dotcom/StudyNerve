import json
import logging
from typing import Optional

import httpx

from app.providers.base import LLMProvider

logger = logging.getLogger(__name__)

_http_client: Optional[httpx.AsyncClient] = None


def _get_client(base_url: str) -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            base_url=base_url,
            timeout=httpx.Timeout(120.0),
        )
    return _http_client


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str, model: str, max_retries: int = 3):
        self.base_url = base_url
        self.model = model
        self.max_retries = max_retries

    def _client(self) -> httpx.AsyncClient:
        return _get_client(self.base_url)

    async def generate_json(self, prompt: str, system: str) -> Optional[dict]:
        client = self._client()
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system,
            "format": "json",
            "stream": False,
            "options": {
                "temperature": 0.7,
                "num_predict": 2048,
            },
        }

        for attempt in range(1, self.max_retries + 1):
            try:
                response = await client.post("/api/generate", json=payload)
                response.raise_for_status()
                raw = response.json().get("response", "")
                return json.loads(raw)
            except httpx.ConnectError:
                logger.error("Ollama unreachable at %s", self.base_url)
                return None
            except httpx.HTTPStatusError as exc:
                logger.error("Ollama HTTP error: %s", exc)
                return None
            except (json.JSONDecodeError, ValueError) as exc:
                logger.warning(
                    "JSON parse failure on attempt %d/%d: %s",
                    attempt,
                    self.max_retries,
                    exc,
                )
                if attempt == self.max_retries:
                    logger.error("All %d retries exhausted — giving up", self.max_retries)
                    return None

        return None

    async def generate_chat(self, messages: list[dict], system: str) -> Optional[str]:
        client = self._client()
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}] + messages,
            "stream": False,
            "options": {
                "temperature": 0.7,
                "num_predict": 1024,
            },
        }
        try:
            response = await client.post("/api/chat", json=payload)
            response.raise_for_status()
            return response.json()["message"]["content"]
        except httpx.ConnectError:
            logger.error("Ollama unreachable at %s", self.base_url)
            return None
        except httpx.HTTPStatusError as exc:
            logger.error("Ollama HTTP error: %s", exc)
            return None
        except (KeyError, ValueError) as exc:
            logger.error("Ollama chat response parse error: %s", exc)
            return None
