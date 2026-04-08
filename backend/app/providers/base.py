from abc import ABC, abstractmethod
from typing import Optional


class LLMTokenLimitError(Exception):
    """Raised when the provider rejects a request due to token count limits."""

    DEFAULT_MSG = (
        "Note is too long for the free tier. "
        "Try using a shorter note or switch to a different AI provider."
    )

    def __init__(self, message: str = DEFAULT_MSG):
        super().__init__(message)
        self.message = message


class LLMProvider(ABC):
    @abstractmethod
    async def generate_json(self, prompt: str, system: str) -> Optional[dict]:
        """Send a prompt and return a parsed JSON dict, or None on failure."""
        ...

    @abstractmethod
    async def generate_chat(self, messages: list[dict], system: str) -> Optional[str]:
        """Send a chat message list and return the assistant's reply, or None on failure."""
        ...
