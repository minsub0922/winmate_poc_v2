"""Shared adapter helpers: strict provider resolution, request validation, JSON-safe serialization."""
from __future__ import annotations

import dataclasses
import math
from dataclasses import dataclass
from typing import Any, Callable, Optional

from ..jobs import BadRequest, Job
from ..settings import Settings
from ..strict import reject_legacy_options, require_provider


@dataclass
class ModePlan:
    requested: str          # always 'real'
    run: bool               # always True (kept for the old shape; there is no dummy contract any more)
    provider: Any = None    # the server Gemini provider — never None once resolve_mode returned
    reason: str = ''


@dataclass
class Prepared:
    kind: str
    title: str
    params: dict            # public, secret-free echo of the request options
    fn: Callable[[Job], Any]
    plan: ModePlan


def resolve_mode(settings: Settings, function: str, body: dict) -> ModePlan:
    """Strict: rejects legacy ``offline``/``llm:false`` (422) and a missing provider (503). No rules-only plan."""
    reject_legacy_options(body)
    return ModePlan('real', True, require_provider(settings, function), '')


def requirement_context(body: dict) -> str:
    value = body.get('requirement_context')
    if value is None:
        return ''
    import json
    if not isinstance(value, dict) or not isinstance(value.get('source_key'), str) or not isinstance(value.get('sections'), dict):
        raise BadRequest('요구사항 요약 맥락 형식이 올바르지 않습니다.')
    text = json.dumps(value, ensure_ascii=False)
    if len(text) > 40000:
        raise BadRequest('요구사항 요약 맥락이 너무 큽니다.')
    return '\n<<<요구사항 전략 요약 DATA · 원문이 우선, inference는 해석이고 question은 미확정>>>\n' + text + '\n<<<END 요약 DATA>>>'


def as_bool(body: dict, key: str, default: bool) -> bool:
    v = body.get(key, default)
    if isinstance(v, bool):
        return v
    raise BadRequest(f'{key} 는 true/false 여야 합니다.')


def as_int(body: dict, key: str, default: Optional[int], lo: int, hi: int) -> Optional[int]:
    v = body.get(key, default)
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float, str)):
        raise BadRequest(f'{key} 는 숫자여야 합니다.')
    try:
        n = int(v)
    except ValueError:
        raise BadRequest(f'{key} 는 숫자여야 합니다.') from None
    if not lo <= n <= hi:
        raise BadRequest(f'{key} 는 {lo}~{hi} 사이여야 합니다.')
    return n


def as_float(body: dict, key: str, default: Optional[float], lo: float, hi: float) -> Optional[float]:
    v = body.get(key, default)
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise BadRequest(f'{key} 는 숫자여야 합니다.')
    if not lo <= float(v) <= hi:
        raise BadRequest(f'{key} 는 {lo}~{hi} 사이여야 합니다.')
    return float(v)


def str_list(value: Any, key: str, limit: int = 200) -> list:
    if value is None or value == '':
        return []
    if isinstance(value, str):
        value = [x for x in value.split(',')]
    if not isinstance(value, list) or not all(isinstance(x, (str, int)) for x in value):
        raise BadRequest(f'{key} 는 문자열 목록이어야 합니다.')
    out = [str(x).strip() for x in value if str(x).strip()]
    if len(out) > limit:
        raise BadRequest(f'{key} 는 {limit}개 이하여야 합니다.')
    return out


def jsonable(value: Any, depth: int = 0) -> Any:
    """Explicit JSON-safe copy (sets → sorted lists, numpy scalars → Python, unknown objects → str)."""
    if depth > 40:
        return None
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): jsonable(v, depth + 1) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v, depth + 1) for v in value]
    if isinstance(value, (set, frozenset)):
        items = [jsonable(v, depth + 1) for v in value]
        try:
            return sorted(items)
        except TypeError:
            return items
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return jsonable(dataclasses.asdict(value), depth + 1)
    item = getattr(value, 'item', None)
    if callable(item):
        try:
            return jsonable(item(), depth + 1)
        except (TypeError, ValueError):
            pass
    return str(value)[:500]
