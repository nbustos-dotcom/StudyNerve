"""Google Gemini workflow provider adapters — text via SDK, Imagen via REST."""

import asyncio
import base64
import logging
from typing import Any

import httpx

from app.services.providers.base import WorkflowProvider

logger = logging.getLogger(__name__)

_IMAGEN_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "imagen-3.0-generate-001:predict"
)
_TIMEOUT = httpx.Timeout(120.0)


class GeminiTextProvider(WorkflowProvider):
    """gemini_text — Google Gemini via the generativeai SDK."""

    def __init__(self, model: str = "gemini-2.0-flash"):
        self.model = model

    async def execute(self, prompt: str, api_key: str) -> dict[str, Any]:
        try:
            import google.generativeai as genai
        except ImportError:
            raise RuntimeError(
                "google-generativeai package not installed. "
                "Run: pip install google-generativeai"
            )

        if not api_key:
            raise RuntimeError(
                "Gemini API key is missing. Set it in Settings → AI Provider."
            )

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            self.model,
            system_instruction="You are a helpful AI tutor. Respond clearly and concisely.",
        )

        response = await asyncio.to_thread(
            model.generate_content,
            prompt,
            generation_config={
                "temperature": 0.7,
                "max_output_tokens": 2048,
            },
        )
        return {
            "type": "text",
            "content": response.text,
            "metadata": {"model": self.model},
        }


class GeminiImageProvider(WorkflowProvider):
    """gemini_image — Google Imagen 3 via the Generative Language REST API."""

    async def execute(self, prompt: str, api_key: str) -> dict[str, Any]:
        if not api_key:
            raise RuntimeError(
                "Gemini API key is missing. Set it in Settings → AI Provider."
            )

        payload = {
            "instances": [{"prompt": prompt}],
            "parameters": {"sampleCount": 1},
        }

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                _IMAGEN_URL,
                json=payload,
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json",
                },
            )
            if not resp.is_success:
                logger.error("Gemini Imagen %s: %s", resp.status_code, resp.text)
                raise RuntimeError(
                    f"Gemini Imagen API error {resp.status_code}: {resp.text[:200]}"
                )
            data = resp.json()

        prediction = data["predictions"][0]
        b64 = prediction["bytesBase64Encoded"]
        mime = prediction.get("mimeType", "image/png")
        data_uri = f"data:{mime};base64,{b64}"

        return {
            "type": "image",
            "content": data_uri,
            "metadata": {"model": "imagen-3.0-generate-001", "mime_type": mime},
        }
