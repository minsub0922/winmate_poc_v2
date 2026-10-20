"""Compatibility entry point for the shared LLM service. Existing imports stay valid."""
from __future__ import annotations
import threading
from typing import Any, Dict, Optional, Tuple
from .settings import Settings
from ..llm.provider import (
    LLMProvider, GeminiProvider, GenerationResult, ProviderError, Ledger,
    CancelCheck, DEFAULT_BASE, IMAGE_TYPES, redact, parse_json, degenerate,
    gemini_schema_from_model, image_parts, turns_to_contents,
)
from ..llm.adapters import register_adapter

# ---------------------------------------------------------------- process-wide instance
_LOCK = threading.Lock()
_PROVIDER: Optional[LLMProvider] = None
_OVERRIDE: Dict[str, Any] = {}


def get_provider(settings: Settings) -> Tuple[Optional[Any], str]:
    """(provider, reason). ``provider`` is None when no credential is configured (no network then)."""
    global _PROVIDER
    if 'provider' in _OVERRIDE:
        p = _OVERRIDE['provider']
        return (p, '') if p is not None and getattr(p, 'available', False) else (None, _OVERRIDE.get('reason') or 'provider_disabled')
    if not settings.has_key:
        return None, 'no_api_key'
    if settings.provider != 'gemini' and (not settings.base_url or not settings.model):
        return None, 'provider_disabled'
    with _LOCK:
        if _PROVIDER is None or _PROVIDER._key != settings.api_key() or _PROVIDER._settings != settings:
            _PROVIDER = GeminiProvider(settings) if settings.provider == 'gemini' else LLMProvider(settings)
        return _PROVIDER, ''


def set_provider_override(provider: Any = None, reason: str = '', clear: bool = False) -> None:
    """Test hook: force a provider (or none) for every adapter. ``clear=True`` restores normal resolution."""
    if clear:
        _OVERRIDE.clear()
    else:
        _OVERRIDE['provider'] = provider
        _OVERRIDE['reason'] = reason


def provider_usage() -> Optional[dict]:
    return {**_PROVIDER.ledger.view(), 'queue': _PROVIDER.queue.snapshot()} if _PROVIDER is not None else None
