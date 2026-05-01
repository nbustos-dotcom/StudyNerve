"""Stability AI image generation adapter — Stable Image Core."""

import base64
import logging
from typing import Any

import httpx

from app.services.providers.base import WorkflowProvider

logger = logging.getLogger(__name__)

_API_URL = "https://api.stability.ai/v2beta/stable-image/generate/core"
_TIMEOUT = httpx.Timeout(120.0)


class StabilityImageProvider(WorkflowProvider):
    """stability_image — Stability AI Stable Image Core generation."""

    async def execute(self, prompt: str, api_key: str) -> dict[str, Any]:
        if not api_key:
            raise RuntimeError(
                "Stability AI API key is missing. Add STABILITY_API_KEY to the environment."
            )

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

        # Stability uses multipart/form-data
        form_data = {
            "prompt": (None, prompt),
            "output_format": (None, "png"),
        }

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                _API_URL,
                headers=headers,
                files=form_data,
            )
            if not resp.is_success:
                logger.error("Stability AI %s: %s", resp.status_code, resp.text)
                raise RuntimeError(
                    f"Stability AI API error {resp.status_code}: {resp.text[:200]}"
                )
            data = resp.json()

        finish = data.get("finish_reason", "")
        if finish not in ("SUCCESS", ""):
            raise RuntimeError(f"Stability AI returned finish_reason={finish!r}.")

        b64 = data["image"]
        data_uri = f"data:image/png;base64,{b64}"
        return {
            "type": "image",
            "content": data_uri,
            "metadata": {
                "model": "stable-image-core",
                "seed": data.get("seed"),
                "finish_reason": finish,
            },
        }
