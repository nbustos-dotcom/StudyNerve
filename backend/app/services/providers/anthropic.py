"""Anthropic Claude workflow provider adapter — Messages API."""

import logging
from typing import Any

import httpx

from app.services.providers.base import WorkflowProvider

logger = logging.getLogger(__name__)

_API_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"
_DEFAULT_MODEL = "claude-sonnet-4-20250514"
_TIMEOUT = httpx.Timeout(120.0)


class AnthropicTextProvider(WorkflowProvider):
    """claude_text — Anthropic Claude Messages API."""

    def __init__(self, model: str = _DEFAULT_MODEL):
        self.model = model

    async def execute(self, prompt: str, api_key: str) -> dict[str, Any]:
        if not api_key:
            raise RuntimeError(
                "Anthropic API key is missing. Set it in Settings → AI Provider."
            )

        headers = {
            "x-api-key": api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "content-type": "application/json",
        }
        payload = {
            "model": self.model,
            "max_tokens": 2048,
            "system": "You are a helpful AI tutor. Respond clearly and concisely.",
            "messages": [{"role": "user", "content": prompt}],
        }

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(_API_URL, json=payload, headers=headers)
            if not resp.is_success:
                logger.error("Anthropic %s: %s", resp.status_code, resp.text)
                raise RuntimeError(
                    f"Anthropic API error {resp.status_code}: {resp.text[:200]}"
                )
            data = resp.json()

        text = data["content"][0]["text"]
        usage = data.get("usage", {})
        return {
            "type": "text",
            "content": text,
            "metadata": {
                "model": data.get("model", self.model),
                "input_tokens": usage.get("input_tokens"),
                "output_tokens": usage.get("output_tokens"),
            },
        }
