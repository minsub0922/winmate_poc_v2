"""Compatibility entry point for the shared LLM service. Existing imports stay valid."""
from __future__ import annotations
import threading
from typing import Any, Dict, Optional, Tuple
from .settings import Settings, provider_settings
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


def _unusable(settings: Settings) -> str:
    """'' when the profile can serve, else the reason. The internal profile with an in-house class (app/api/llm/inhouse/
    gauss.py) is ready when the class says so (file · class · contract · its REQUIRED_ENV keys)."""
    state = getattr(settings, 'inhouse_llm', '')
    if settings.provider == 'internal' and state:
        return '' if state == 'ready' else 'no_api_key' if state == 'missing' else 'provider_disabled'
    if not settings.has_key:
        return 'no_api_key'
    if settings.provider != 'gemini' and (not settings.base_url or not settings.model):
        return 'provider_disabled'
    return ''


def get_provider(settings: Settings) -> Tuple[Optional[Any], str]:
    """(provider, reason). ``provider`` is None when no credential is configured (no network then)."""
    global _PROVIDER
    if 'provider' in _OVERRIDE:
        p = _OVERRIDE['provider']
        return (p, '') if p is not None and getattr(p, 'available', False) else (None, _OVERRIDE.get('reason') or 'provider_disabled')
    reason = _unusable(settings)
    if reason:
        return None, reason
    with _LOCK:
        if _PROVIDER is None or _PROVIDER._key != settings.api_key() or _PROVIDER._settings != settings:
            _PROVIDER = GeminiProvider(settings) if settings.provider == 'gemini' else LLMProvider(settings)
            # WINMATE_LLM_FALLBACK: the other configured APIs answer, in order, when this one fails to (llm/provider.py)
            _PROVIDER.fallbacks = [p for p in (_named(name, provider_settings(name))[0] for name, *_ in settings.llm_fallbacks) if p is not None]
        return _PROVIDER, ''


_NAMED: Dict[str, LLMProvider] = {}


def _named(name: str, settings: Settings) -> Tuple[Optional[Any], str]:
    """(provider, reason) for a named profile; the caller holds ``_LOCK``."""
    reason = _unusable(settings)
    if reason:
        return None, reason
    p = _NAMED.get(name)
    if p is None or p._key != settings.api_key() or p._settings != settings:
        p = _NAMED[name] = GeminiProvider(settings) if settings.provider == 'gemini' else LLMProvider(settings)
    return p, ''


def get_provider_for(name: str, settings: Optional[Settings] = None) -> Tuple[Optional[Any], str]:
    """(provider, reason) for a named LLM API profile — another configured API used next to the default one.

    ``settings`` defaults to :func:`provider_settings` ``(name)``. Every instance shares the same request queue limits.
    """
    settings = settings or provider_settings(name)
    with _LOCK:
        return _named(name, settings)


def set_provider_override(provider: Any = None, reason: str = '', clear: bool = False) -> None:
    """Test hook: force a provider (or none) for every adapter. ``clear=True`` restores normal resolution."""
    if clear:
        _OVERRIDE.clear()
    else:
        _OVERRIDE['provider'] = provider
        _OVERRIDE['reason'] = reason


def provider_usage() -> Optional[dict]:
    return {**_PROVIDER.ledger.view(), 'queue': _PROVIDER.queue.snapshot()} if _PROVIDER is not None else None
