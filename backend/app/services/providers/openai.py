"""OpenAI workflow provider adapters — chat completions and DALL-E image generation."""

import logging
from typing import Any

import httpx

from app.services.providers.base import WorkflowProvider

logger = logging.getLogger(__name__)

_CHAT_URL = "https://api.openai.com/v1/chat/completions"
_IMAGE_URL = "https://api.openai.com/v1/images/generations"
_TIMEOUT = httpx.Timeout(120.0)


def _auth(api_key: str) -> dict:
    if not api_key:
        raise RuntimeError("OpenAI API key is missing. Set it in Settings → AI Provider.")
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


class OpenAITextProvider(WorkflowProvider):
    """chatgpt_text — OpenAI Chat Completions."""

    def __init__(self, model: str = "gpt-4o-mini"):
        self.model = model

    async def execute(self, prompt: str, api_key: str) -> dict[str, Any]:
        headers = _auth(api_key)
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful AI tutor. Respond clearly and concisely.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 2048,
        }

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(_CHAT_URL, json=payload, headers=headers)
            if not resp.is_success:
                logger.error("OpenAI chat %s: %s", resp.status_code, resp.text)
                raise RuntimeError(f"OpenAI API error {resp.status_code}: {resp.text[:200]}")
            data = resp.json()

        choice = data["choices"][0]["message"]
        usage = data.get("usage", {})
        return {
            "type": "text",
            "content": choice["content"],
            "metadata": {
                "model": data.get("model", self.model),
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
            },
        }


class OpenAIImageProvider(WorkflowProvider):
    """chatgpt_image — DALL-E 3 image generation."""

    def __init__(self, model: str = "dall-e-3"):
        self.model = model

    async def execute(self, prompt: str, api_key: str) -> dict[str, Any]:
        headers = _auth(api_key)
        payload = {
            "model": self.model,
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "response_format": "url",
        }

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(_IMAGE_URL, json=payload, headers=headers)
            if not resp.is_success:
                logger.error("DALL-E %s: %s", resp.status_code, resp.text)
                raise RuntimeError(f"DALL-E API error {resp.status_code}: {resp.text[:200]}")
            data = resp.json()

        image = data["data"][0]
        return {
            "type": "image",
            "content": image["url"],
            "metadata": {
                "model": self.model,
                "revised_prompt": image.get("revised_prompt", prompt),
            },
        }
