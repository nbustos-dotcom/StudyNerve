from abc import ABC, abstractmethod
from typing import Optional


class LLMProvider(ABC):
    @abstractmethod
    async def generate_json(self, prompt: str, system: str) -> Optional[dict]:
        """Send a prompt and return a parsed JSON dict, or None on failure."""
        ...

    @abstractmethod
    async def generate_chat(self, messages: list[dict], system: str) -> Optional[str]:
        """Send a chat message list and return the assistant's reply, or None on failure."""
        ...
