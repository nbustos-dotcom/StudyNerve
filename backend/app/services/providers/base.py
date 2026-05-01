"""
Abstract base for workflow provider adapters.

The engine resolves input chaining and builds a final merged prompt before
calling execute(), so providers only receive the ready-to-send prompt.

Return shape:
    {
        "type":     "text" | "image" | "3d",
        "content":  str,     # URL for image/3d, raw text for text
        "metadata": dict     # provider-specific extras (model, tokens, seed, etc.)
    }
"""

from abc import ABC, abstractmethod
from typing import Any


class WorkflowProvider(ABC):
    @abstractmethod
    async def execute(self, prompt: str, api_key: str) -> dict[str, Any]:
        """
        Run the provider with the fully-resolved prompt.

        prompt:  merged node prompt + any chained context (already truncated)
        api_key: decrypted key for this provider (from UserSettings or env var)

        Returns {"type": ..., "content": ..., "metadata": ...}
        Raises RuntimeError on API failure.
        """
        ...
