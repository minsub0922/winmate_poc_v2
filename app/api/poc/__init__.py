"""PoC-backed agent functions for the Winmate v2 app (RFP · Layout Agent · RAG search · review · storyboard · generic LLM).

Importing this package is cheap: the original PoC modules under ``poc/test`` are imported lazily (and
unmodified) on first use or by :func:`initialize`. See ``routes.py`` for the integration snippet and
``NOTES.md`` for limitations.
"""
from __future__ import annotations

from .service import PocStartupError, capabilities, initialize

__all__ = ['initialize', 'capabilities', 'PocStartupError']
