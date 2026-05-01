"""Meshy.ai 3D model generation adapter — text-to-3D with polling."""

import asyncio
import logging
from typing import Any

import httpx

from app.services.providers.base import WorkflowProvider

logger = logging.getLogger(__name__)

_BASE = "https://api.meshy.ai/openapi/v2/text-to-3d"
_POLL_INTERVAL = 5       # seconds between status checks
_POLL_TIMEOUT = 300      # give up after 5 minutes
_TIMEOUT = httpx.Timeout(30.0)


class MeshyProvider(WorkflowProvider):
    """meshy_3d — Meshy.ai text-to-3D generation with async polling."""

    async def execute(self, prompt: str, api_key: str) -> dict[str, Any]:
        if not api_key:
            raise RuntimeError(
                "Meshy API key is missing. Add MESHY_API_KEY to the environment."
            )

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        # Step 1 — submit the generation task
        create_payload = {
            "mode": "preview",
            "prompt": prompt,
            "art_style": "realistic",
            "negative_prompt": "low quality, blurry, distorted",
        }

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(_BASE, json=create_payload, headers=headers)
            if not resp.is_success:
                logger.error("Meshy create %s: %s", resp.status_code, resp.text)
                raise RuntimeError(
                    f"Meshy API error {resp.status_code}: {resp.text[:200]}"
                )
            task_id = resp.json()["result"]
            logger.info("Meshy task created: %s", task_id)

        # Step 2 — poll until SUCCEEDED or FAILED
        elapsed = 0
        poll_url = f"{_BASE}/{task_id}"
        while elapsed < _POLL_TIMEOUT:
            await asyncio.sleep(_POLL_INTERVAL)
            elapsed += _POLL_INTERVAL

            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.get(poll_url, headers=headers)
                if not resp.is_success:
                    logger.warning(
                        "Meshy poll %s: HTTP %s", task_id, resp.status_code
                    )
                    continue
                task = resp.json()

            status = task.get("status", "")
            logger.info("Meshy task %s status=%s elapsed=%ds", task_id, status, elapsed)

            if status == "SUCCEEDED":
                model_urls = task.get("model_urls", {})
                glb_url = model_urls.get("glb") or model_urls.get("obj") or ""
                thumbnail = task.get("thumbnail_url", "")
                return {
                    "type": "3d",
                    "content": glb_url,
                    "metadata": {
                        "task_id": task_id,
                        "model_urls": model_urls,
                        "thumbnail_url": thumbnail,
                    },
                }

            if status in ("FAILED", "EXPIRED"):
                raise RuntimeError(
                    f"Meshy task {task_id} ended with status={status}."
                )

        raise RuntimeError(
            f"Meshy task {task_id} did not complete within {_POLL_TIMEOUT}s."
        )
