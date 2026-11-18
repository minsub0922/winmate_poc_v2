"""Server infrastructure settings from the single repository-root ``.env``.

Precedence for every key is the same as the LLM settings (``app/api/poc/settings.py``): process environment > root
``.env``. Nothing is copied into ``os.environ``. ``WINMATE_ENV_FILES`` overrides the file list (comma separated,
relative to the repository root) and ``none`` disables file reading, exactly as in the LLM settings.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Dict, Iterable, Mapping, Optional

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / 'app' / 'data' / 'runtime'
_LINE = re.compile(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
_SIZE = re.compile(r'^\s*(\d+(?:\.\d+)?)\s*(b|k|kb|m|mb|g|gb)?\s*$', re.I)
_UNITS = {None: 1, 'b': 1, 'k': 1000, 'kb': 1024, 'm': 1000 ** 2, 'mb': 1024 ** 2, 'g': 1000 ** 3, 'gb': 1024 ** 3}


def _parse(path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except (OSError, UnicodeDecodeError):
        return out
    for line in lines:
        if line.lstrip().startswith('#'):
            continue
        match = _LINE.match(line)
        if not match:
            continue
        value = match.group(2)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        elif ' #' in value:
            value = value.split(' #', 1)[0].rstrip()
        out[match.group(1)] = value
    return out


def env_values(environ: Optional[Mapping[str, str]] = None, files: Optional[Iterable[str]] = None) -> Dict[str, str]:
    """Merged ``.env`` + environment values (environment wins)."""
    environ = os.environ if environ is None else environ
    if files is None:
        raw = environ.get('WINMATE_ENV_FILES')
        if raw is None:
            files = ('.env',)
        elif raw.strip().lower() in ('', 'none', 'off'):
            files = ()
        else:
            files = tuple(x.strip() for x in raw.split(',') if x.strip())
    merged: Dict[str, str] = {}
    for name in files:
        path = Path(name)
        merged.update(_parse(path if path.is_absolute() else ROOT / path))
    merged.update({k: v for k, v in environ.items() if isinstance(v, str)})
    return merged


def port_value(key: str, environ: Optional[Mapping[str, str]] = None) -> str:
    """Port / bind value: process environment > root ``.env`` > root ``.env.example``.

    The versioned ``.env.example`` is the only place that holds the defaults (section 「포트 · 바인딩」); the shell and
    Node counterparts are ``app/scripts/ports.sh`` and ``app/web/ports.js``.
    """
    environ = os.environ if environ is None else environ
    value = environ.get(key) or _parse(ROOT / '.env').get(key) or _parse(ROOT / '.env.example').get(key) or ''
    if not value:
        raise RuntimeError(f'{key} 값이 없습니다 — 루트 .env.example의 「포트 · 바인딩」 구역을 확인하세요.')
    if key.endswith('_PORT') and not (value.isascii() and value.isdigit() and 1 <= int(value) <= 65535):
        raise RuntimeError(f'{key}는 1~65535 정수여야 합니다.')
    return value


def parse_size(value: str, default: int) -> int:
    """Redis-style memory size: ``3gb`` = 3 GiB, ``512mb``, ``1g`` = 10^9 bytes, or plain bytes."""
    match = _SIZE.match(str(value or ''))
    if not match:
        return default
    return int(float(match.group(1)) * _UNITS[(match.group(2) or '').lower() or None])


def parse_int(value: str, default: int, low: int, high: int) -> int:
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def flag(value: Optional[str], default: bool) -> bool:
    text = str(value or '').strip().lower()
    if text in ('1', 'on', 'true', 'yes'):
        return True
    if text in ('0', 'off', 'false', 'no'):
        return False
    return default
