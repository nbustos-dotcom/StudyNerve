import os

from app.providers.base import LLMProvider


def get_provider(provider_name: str | None = None, api_key: str | None = None) -> LLMProvider:
    """Return the appropriate LLMProvider instance.

    provider_name: "ollama" | "gemini" | "openai" | "anthropic" (falls back to LLM_PROVIDER env var)
    api_key: optional override; falls back to the relevant *_API_KEY env var
    """
    if not provider_name:
        provider_name = os.getenv("LLM_PROVIDER", "ollama")

    provider_name = provider_name.lower()

    if provider_name == "ollama":
        from app.providers.ollama_provider import OllamaProvider
        from app.config import settings
        return OllamaProvider(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            max_retries=settings.MAX_LLM_RETRIES,
        )

    if provider_name == "gemini":
        from app.providers.gemini_provider import GeminiProvider
        from app.config import settings
        key = api_key or settings.GEMINI_API_KEY
        return GeminiProvider(api_key=key, max_retries=settings.MAX_LLM_RETRIES)

    if provider_name == "openai":
        from app.providers.openai_provider import OpenAIProvider
        from app.config import settings
        key = api_key or settings.OPENAI_API_KEY
        return OpenAIProvider(api_key=key, max_retries=settings.MAX_LLM_RETRIES)

    if provider_name == "anthropic":
        from app.providers.anthropic_provider import AnthropicProvider
        from app.config import settings
        key = api_key or settings.ANTHROPIC_API_KEY
        return AnthropicProvider(api_key=key, max_retries=settings.MAX_LLM_RETRIES)

    raise ValueError(
        f"Unknown provider '{provider_name}'. Supported: ollama, gemini, openai, anthropic"
    )
