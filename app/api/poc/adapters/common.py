"""Shared adapter helpers: mode resolution, request validation, JSON-safe serialization."""
from __future__ import annotations

import dataclasses
import math
from dataclasses import dataclass
from typing import Any, Callable, Optional

from ..jobs import BadRequest, Job
from ..provider import get_provider
from ..settings import Settings


@dataclass
class ModePlan:
    requested: str          # real | offline | dummy
    run: bool               # False → respond with the dummy contract, run nothing
    provider: Any = None    # None → PoC rules only (no network)
    reason: str = ''        # why provider is None (offline_requested, no_api_key, llm_disabled_by_request, ...)


@dataclass
class Prepared:
    kind: str
    title: str
    params: dict            # public, secret-free echo of the request options
    fn: Callable[[Job], Any]
    plan: ModePlan


def resolve_mode(settings: Settings, function: str, body: dict, needs_llm: bool = True) -> ModePlan:
    """``offline=true`` always runs the real PoC rules with no external call (even in dummy mode / no key)."""
    if body.get('offline') is True:
        return ModePlan('offline', True, None, 'offline_requested')
    if settings.function_mode(function) != 'real':
        return ModePlan('dummy', False, None, 'function_mode_dummy')
    if not needs_llm:
        return ModePlan('real', True, None, 'no_llm_needed')
    if body.get('llm') is False:
        return ModePlan('real', True, None, 'llm_disabled_by_request')
    provider, reason = get_provider(settings)
    return ModePlan('real', True, provider, reason)


def dummy_response(kind: str, plan: ModePlan, message: str) -> dict:
    return {'mode': 'dummy', 'error': 'unavailable', 'kind': kind, 'requested_mode': plan.requested, 'reason': plan.reason,
            'message': message, 'job': None}


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
