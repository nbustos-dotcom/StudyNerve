import logging
import os

from app.providers.base import LLMProvider

logger = logging.getLogger(__name__)


def get_provider(provider_name: str | None = None, api_key: str | None = None) -> LLMProvider:
    """Return the appropriate LLMProvider instance.

    provider_name: "ollama" | "gemini" | "openai" | "anthropic" | "groq"
                   Falls back to LLM_PROVIDER env var when None.
    api_key:       User-saved key from UserSettings.llm_api_key.
                   Falls back to the relevant *_API_KEY env var when None.
    """
    if not provider_name:
        provider_name = os.getenv("LLM_PROVIDER", "ollama")

    provider_name = provider_name.lower()

    if provider_name == "ollama":
        from app.providers.ollama_provider import OllamaProvider
        from app.config import settings
        logger.info(
            "LLM provider: ollama | url=%s | model=%s",
            settings.OLLAMA_BASE_URL,
            settings.OLLAMA_MODEL,
        )
        return OllamaProvider(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            max_retries=settings.MAX_LLM_RETRIES,
        )

    if provider_name == "gemini":
        from app.providers.gemini_provider import GeminiProvider
        from app.config import settings
        key = api_key or settings.GEMINI_API_KEY
        logger.info("LLM provider: gemini | key_source=%s", "user" if api_key else "env")
        print(
            f"[provider] gemini | key_source={'user' if api_key else 'env'} | key_set={bool(key)}",
            flush=True,
        )
        return GeminiProvider(api_key=key, max_retries=settings.MAX_LLM_RETRIES)

    if provider_name == "openai":
        from app.providers.openai_provider import OpenAIProvider
        from app.config import settings
        key = api_key or settings.OPENAI_API_KEY
        logger.info("LLM provider: openai | key_source=%s", "user" if api_key else "env")
        print(
            f"[provider] openai | key_source={'user' if api_key else 'env'} | key_set={bool(key)}",
            flush=True,
        )
        return OpenAIProvider(api_key=key, max_retries=settings.MAX_LLM_RETRIES)

    if provider_name == "anthropic":
        from app.providers.anthropic_provider import AnthropicProvider
        from app.config import settings
        key = api_key or settings.ANTHROPIC_API_KEY
        logger.info("LLM provider: anthropic | key_source=%s", "user" if api_key else "env")
        print(
            f"[provider] anthropic | key_source={'user' if api_key else 'env'} | key_set={bool(key)}",
            flush=True,
        )
        return AnthropicProvider(api_key=key, max_retries=settings.MAX_LLM_RETRIES)

    if provider_name == "groq":
        from app.providers.groq_provider import GroqProvider
        from app.config import settings
        key = api_key or settings.GROQ_API_KEY
        logger.info("LLM provider: groq | key_source=%s", "user" if api_key else "env")
        print(
            f"[provider] groq | key_source={'user' if api_key else 'env'} | key_set={bool(key)}",
            flush=True,
        )
        return GroqProvider(api_key=key, max_retries=settings.MAX_LLM_RETRIES)

    raise ValueError(
        f"Unknown provider '{provider_name}'. Supported: ollama, gemini, openai, anthropic, groq"
    )
