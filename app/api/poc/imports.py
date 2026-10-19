"""Import helpers for the original PoC modules.

The PoC sources under ``poc/test`` are imported unmodified from their real paths. This module
only adjusts the importing process:

* ``sys.dont_write_bytecode`` is set so importing never writes ``__pycache__`` under ``poc/``.
* The PoC directories are *appended* to ``sys.path`` (never prepended) so they cannot shadow
  app modules.
* ``winmate_layout.config`` calls ``python-dotenv`` at import time, which would read PoC ``.env``
  files and copy their values into ``os.environ``. While that module is imported the dotenv loader
  is replaced by a no-op and any environment keys that appear anyway are removed again. Afterwards
  the module-level settings of *this process only* are pinned (no API key, offline LLM mode,
  TF-IDF retrieval, cache dir under ``app/data/runtime``) so every Gemini call goes through the
  app provider.
* ``testbench`` is never imported (its ``core``/``server`` modules write auth state and create
  directories inside ``poc/``).
"""
from __future__ import annotations

import importlib
import os
import sys
import threading
from pathlib import Path
from types import ModuleType, SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
POC_TEST = ROOT / 'poc' / 'test'
LAYOUT_DIR = POC_TEST / 'layout_agent'
STORY_DIR = POC_TEST / 'storyboard_agent'
RUNTIME_DIR = ROOT / 'app' / 'data' / 'runtime'

_LOCK = threading.RLock()
_LAYOUT: SimpleNamespace | None = None
_STORY: SimpleNamespace | None = None
_SCORE: SimpleNamespace | None = None


class PocImportError(RuntimeError):
    """An original PoC module (or one of its dependencies) could not be imported."""


def ensure_paths() -> None:
    sys.dont_write_bytecode = True
    for path in (POC_TEST, LAYOUT_DIR, STORY_DIR):
        text = str(path)
        if text not in sys.path:
            sys.path.append(text)


def _import(name: str) -> ModuleType:
    ensure_paths()
    try:
        return importlib.import_module(name)
    except Exception as exc:  # noqa: BLE001 — surfaced as a capability error
        raise PocImportError(f'{name}: {type(exc).__name__}: {exc}') from exc


def rfp() -> ModuleType:
    """``poc/test/rfp_pipeline.py`` (standard library only)."""
    with _LOCK:
        return _import('rfp_pipeline')


def _import_layout_config() -> ModuleType:
    if 'winmate_layout.config' in sys.modules:
        return sys.modules['winmate_layout.config']
    ensure_paths()
    before = set(os.environ)
    try:
        import dotenv  # type: ignore
    except Exception:  # noqa: BLE001 — config.py itself will raise a clear ImportError
        dotenv = None
    original = getattr(dotenv, 'load_dotenv', None) if dotenv else None
    if dotenv is not None:
        dotenv.load_dotenv = lambda *args, **kwargs: False  # type: ignore[assignment]
    try:
        return _import('winmate_layout.config')
    finally:
        if dotenv is not None and original is not None:
            dotenv.load_dotenv = original  # type: ignore[assignment]
        for key in set(os.environ) - before:
            os.environ.pop(key, None)


def layout() -> SimpleNamespace:
    """``poc/test/layout_agent/winmate_layout`` modules with process-local config pins."""
    global _LAYOUT
    with _LOCK:
        if _LAYOUT is not None:
            return _LAYOUT
        config = _import_layout_config()
        config.GEMINI_API_KEY = ''
        config.TAVILY_API_KEY = ''
        config.LLM_MODE = 'offline'
        config.DENSE_MODE = 'tfidf'
        config.CACHE_DIR = RUNTIME_DIR / 'cache' / 'layout'
        names = ('kb', 'llm', 'schemas', 'slots', 'metadata', 'retrieval', 'layout_design', 'graph', 'render')
        mods = {name: _import(f'winmate_layout.{name}') for name in names}
        try:
            from langgraph.types import Command  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise PocImportError(f'langgraph.types: {type(exc).__name__}: {exc}') from exc
        _LAYOUT = SimpleNamespace(config=config, Command=Command, **mods)
        return _LAYOUT


def story() -> SimpleNamespace:
    """``poc/test/storyboard_agent/sbagent`` modules."""
    global _STORY
    with _LOCK:
        if _STORY is None:
            names = ('kb', 'llm', 'agent')
            _STORY = SimpleNamespace(**{name: _import(f'sbagent.{name}') for name in names})
        return _STORY


def score() -> SimpleNamespace:
    """``poc/test/proposal_score`` modules."""
    global _SCORE
    with _LOCK:
        if _SCORE is None:
            names = ('llm', 'proposal', 'criteria', 'taxonomy', 'pipeline')
            _SCORE = SimpleNamespace(**{name: _import(f'proposal_score.{name}') for name in names})
        return _SCORE
