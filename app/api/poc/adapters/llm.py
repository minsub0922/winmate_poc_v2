"""Generic ``POST /api/llm`` for the frontend sample adapter (``app/web/src/platform/runtime.js``) — strict real-only.

Request  ``{feature, kind: 'json'|'text', prompt? , turns?, model_tier?, images?, stream?, schema?}``

* ``feature`` is required and must be one of ``settings.FUNCTIONS`` (rfp · layout · search · rerank · review ·
  storyboard · part · fill · simulation · llm).
* ``schema`` (optional, ``kind:'json'`` only) is a Gemini ``responseSchema`` (OpenAPI subset). It is sent to
  the model and the answer is validated server-side against it (one re-ask for non-streamed requests).
* Legacy ``offline`` / ``llm:false`` / ``mode≠'real'`` → 422 ``unsupported_option``. No provider → 503.

Response (JSON)  ``{mode:'real', feature, data | text, model, usage}``; failures are HTTP 4xx/5xx with
``{mode:'real', error, code, message, detail, step, retryable}`` (see ``routes.py``) — never a dummy 200.
Response (SSE, ``stream:true`` or ``Accept: text/event-stream``) — ``requestCompletion`` protocol: cumulative
``{type:'text', text}`` frames, then ``{type:'result', mode:'real', data | text, model}`` or
``{type:'error', code, message, retryable}``. The first chunk is fetched before the stream is opened, so a
provider that cannot start answering is reported as an HTTP error, not as a 200 stream.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterator, List, Optional

from ..jobs import BadRequest
from ..provider import ProviderError, parse_json
from ..settings import FUNCTIONS, Settings
from ..strict import failure, from_provider, invalid_output, reject_legacy_options, require_provider

SCHEMA_TYPES = ('OBJECT', 'ARRAY', 'STRING', 'INTEGER', 'NUMBER', 'BOOLEAN')
SCHEMA_KEYS = {'type', 'properties', 'items', 'required', 'enum', 'description', 'nullable', 'format', 'minItems', 'maxItems', 'propertyOrdering'}
MAX_SCHEMA_CHARS = 30_000
JSON_ASKS = 2


@dataclass
class LlmRequest:
    kind: str
    prompt: Optional[str]
    turns: Optional[List[Any]]
    tier: str
    images: Optional[List[Any]]
    feature: str = 'llm'
    schema: Optional[dict] = None


# ---------------------------------------------------------------- request schema (Gemini OpenAPI subset)
def normalize_schema(node: Any, path: str = 'schema', depth: int = 0) -> dict:
    if depth > 12:
        raise BadRequest(f'{path}: schema 가 너무 깊습니다(12단계 이하).')
    if not isinstance(node, dict):
        raise BadRequest(f'{path} 는 객체여야 합니다.')
    extra = set(node) - SCHEMA_KEYS
    if extra:
        raise BadRequest(f'{path}: 지원하지 않는 schema 키 ' + ', '.join(sorted(map(str, extra))[:5]))
    t = str(node.get('type') or '').upper()
    if t not in SCHEMA_TYPES:
        raise BadRequest(f'{path}.type 은 {", ".join(SCHEMA_TYPES)} 중 하나여야 합니다.')
    out: dict = {'type': t}
    for key in ('description', 'format'):
        if key in node:
            if not isinstance(node[key], str):
                raise BadRequest(f'{path}.{key} 는 문자열이어야 합니다.')
            out[key] = node[key][:500]
    if 'nullable' in node:
        if not isinstance(node['nullable'], bool):
            raise BadRequest(f'{path}.nullable 은 true/false 여야 합니다.')
        out['nullable'] = node['nullable']
    if 'enum' in node:
        if t != 'STRING' or not isinstance(node['enum'], list) or not node['enum'] or not all(isinstance(x, str) for x in node['enum']):
            raise BadRequest(f'{path}.enum 은 STRING 의 비어 있지 않은 문자열 목록이어야 합니다.')
        out['enum'] = list(node['enum'])
    if t == 'OBJECT':
        props = node.get('properties') or {}
        if not isinstance(props, dict):
            raise BadRequest(f'{path}.properties 는 객체여야 합니다.')
        out['properties'] = {str(k): normalize_schema(v, f'{path}.{k}', depth + 1) for k, v in props.items()}
        req = node.get('required') or []
        if not isinstance(req, list) or not all(isinstance(r, str) and r in out['properties'] for r in req):
            raise BadRequest(f'{path}.required 는 properties 에 있는 이름 목록이어야 합니다.')
        if req:
            out['required'] = list(req)
        order = node.get('propertyOrdering')
        if order is not None:
            if not isinstance(order, list) or not all(isinstance(r, str) and r in out['properties'] for r in order):
                raise BadRequest(f'{path}.propertyOrdering 은 properties 에 있는 이름 목록이어야 합니다.')
            out['propertyOrdering'] = list(order)
    elif t == 'ARRAY':
        if 'items' not in node:
            raise BadRequest(f'{path}.items 가 필요합니다.')
        out['items'] = normalize_schema(node['items'], f'{path}[]', depth + 1)
        for key in ('minItems', 'maxItems'):
            if key in node:
                if isinstance(node[key], bool) or not isinstance(node[key], int) or node[key] < 0:
                    raise BadRequest(f'{path}.{key} 는 0 이상의 정수여야 합니다.')
                out[key] = node[key]
    return out


def conforms(data: Any, schema: dict, path: str = '$') -> str:
    """'' when ``data`` matches the (normalized) schema, otherwise the first problem."""
    if data is None:
        return '' if schema.get('nullable') else f'{path}: null'
    t = schema['type']
    if t == 'OBJECT':
        if not isinstance(data, dict):
            return f'{path}: 객체가 아님'
        for key in schema.get('required', []):
            if key not in data:
                return f'{path}.{key}: 없음'
        for key, sub in schema.get('properties', {}).items():
            if key in data:
                problem = conforms(data[key], sub, f'{path}.{key}')
                if problem:
                    return problem
        return ''
    if t == 'ARRAY':
        if not isinstance(data, list):
            return f'{path}: 목록이 아님'
        if len(data) < schema.get('minItems', 0) or ('maxItems' in schema and len(data) > schema['maxItems']):
            return f'{path}: 항목 수 {len(data)}'
        for i, x in enumerate(data):
            problem = conforms(x, schema['items'], f'{path}[{i}]')
            if problem:
                return problem
        return ''
    if t == 'STRING':
        if not isinstance(data, str):
            return f'{path}: 문자열이 아님'
        if 'enum' in schema and data not in schema['enum']:
            return f'{path}: 허용 값이 아님'
        return ''
    if t == 'INTEGER':
        ok = (isinstance(data, int) and not isinstance(data, bool)) or (isinstance(data, float) and data.is_integer())
        return '' if ok else f'{path}: 정수가 아님'
    if t == 'NUMBER':
        return '' if isinstance(data, (int, float)) and not isinstance(data, bool) else f'{path}: 숫자가 아님'
    if t == 'BOOLEAN':
        return '' if isinstance(data, bool) else f'{path}: true/false 가 아님'
    return ''


# ---------------------------------------------------------------- parse
def parse(body: Any, settings: Settings) -> tuple[LlmRequest, Any]:
    """(request, provider). Validation errors → BadRequest (422); no provider → Unavailable (503)."""
    if not isinstance(body, dict):
        raise BadRequest('요청 본문은 JSON 객체여야 합니다.')
    reject_legacy_options(body)
    feature = body.get('feature')
    if not isinstance(feature, str) or feature not in FUNCTIONS:
        raise BadRequest('feature 는 ' + ' · '.join(FUNCTIONS) + ' 중 하나여야 합니다.')
    kind = body.get('kind') or 'json'
    if kind not in ('json', 'text'):
        raise BadRequest("kind 는 'json' 또는 'text' 여야 합니다.")
    prompt, turns = body.get('prompt'), body.get('turns')
    if prompt is None and turns is None:
        raise BadRequest('prompt 또는 turns 가 필요합니다.')
    if prompt is not None and (not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 200_000):
        raise BadRequest('prompt 는 200,000자 이하의 문자열이어야 합니다.')
    if isinstance(turns, str):
        prompt, turns = turns, None
    if turns is not None and (not isinstance(turns, list) or not turns or len(turns) > 100):
        raise BadRequest('turns 는 1~100개의 목록이어야 합니다.')
    images = body.get('images')
    if images is not None and (not isinstance(images, list) or len(images) > 4):
        raise BadRequest('images 는 4개 이하의 목록이어야 합니다.')
    tier = body.get('model_tier') or 'default'
    if not isinstance(tier, str) or len(tier) > 20:
        raise BadRequest('model_tier 는 문자열이어야 합니다.')
    if 'schema' in body and 'response_schema' in body and body['schema'] != body['response_schema']:
        raise BadRequest('schema 와 response_schema 가 서로 다릅니다.')
    if images:
        tier = 'vision'
    schema = body.get('schema', body.get('response_schema'))
    if schema is not None:
        if kind != 'json':
            raise BadRequest("schema 는 kind:'json' 에서만 쓸 수 있습니다.")
        try:
            size = len(json.dumps(schema, ensure_ascii=False))
        except (TypeError, ValueError):
            raise BadRequest('schema 를 JSON 으로 읽을 수 없습니다.') from None
        if size > MAX_SCHEMA_CHARS:
            raise BadRequest(f'schema 가 너무 큽니다({MAX_SCHEMA_CHARS:,}자 이하).')
        schema = normalize_schema(schema)
    provider = require_provider(settings, feature)
    return LlmRequest(kind, prompt, turns, tier, images or None, feature, schema), provider


def _usage(res: Any) -> dict:
    return {'prompt_tokens': res.prompt_tokens, 'output_tokens': res.output_tokens, 'cached': res.cached, 'attempts': res.attempts}


def complete(req: LlmRequest, provider: Any) -> dict:
    """Non-streamed completion. Raises ModelFailure (→ HTTP error) — never returns an error body with 200."""
    model = provider.model_for(req.tier)
    step = f'llm:{req.feature}:{req.kind}'
    try:
        if req.kind == 'text':
            res = provider.generate_text(stage=f'app:{req.feature}:text', user=req.prompt, turns=req.turns, temperature=0.6,
                                         max_output_tokens=8192, model=model, images=req.images, max_attempts=3)
            if not res.text.strip():
                raise failure('empty', step)
            return {'mode': 'real', 'feature': req.feature, 'text': res.text, 'model': res.model, 'usage': _usage(res)}
        problem = ''
        for _ in range(JSON_ASKS if req.schema else 1):
            res = provider.generate_json(stage=f'app:{req.feature}:json', user=req.prompt, turns=req.turns, schema=req.schema, temperature=0.4,
                                         max_output_tokens=8192, model=model, images=req.images, max_attempts=3)
            problem = conforms(res.data, req.schema) if req.schema else ''
            if not problem:
                return {'mode': 'real', 'feature': req.feature, 'data': res.data, 'model': res.model, 'usage': _usage(res),
                        'schema_validated': bool(req.schema)}
        raise invalid_output(step, 'schema 불일치 — ' + problem)
    except ProviderError as exc:
        raise from_provider(step, exc) from None


def open_stream(req: LlmRequest, provider: Any) -> Iterator[dict]:
    """Starts the upstream stream and reads the first chunk *before* returning (errors → ModelFailure → HTTP)."""
    model = provider.model_for(req.tier)
    step = f'llm:{req.feature}:{req.kind}'
    gen = provider.stream_text(stage=f'app:{req.feature}:{req.kind}', user=req.prompt, turns=req.turns, temperature=0.4 if req.kind == 'json' else 0.6,
                               max_output_tokens=8192, json_mode=req.kind == 'json', model=model, images=req.images, schema=req.schema)
    try:
        first = next(gen)
    except StopIteration:
        raise failure('empty', step) from None
    except ProviderError as exc:
        raise from_provider(step, exc) from None
    return _frames(req, model, step, gen, first)


def _frames(req: LlmRequest, model: str, step: str, gen: Iterator[str], first: str) -> Iterator[dict]:
    last = first
    try:
        yield {'type': 'text', 'text': first}
        for acc in gen:
            last = acc
            yield {'type': 'text', 'text': acc}
    except ProviderError as exc:
        err = from_provider(step, exc)
        yield {'type': 'error', 'code': err.code, 'message': err.message, 'retryable': err.retryable}
        return
    finally:
        close = getattr(gen, 'close', None)
        if close:
            close()
    if req.kind == 'json':
        try:
            data = parse_json(last)
        except ValueError:
            err = failure('invalid_json', step)
            yield {'type': 'error', 'code': err.code, 'message': err.message, 'retryable': True}
            return
        problem = conforms(data, req.schema) if req.schema else ''
        if problem:
            err = invalid_output(step, problem)
            yield {'type': 'error', 'code': err.code, 'message': err.message, 'retryable': True}
            return
        yield {'type': 'result', 'mode': 'real', 'feature': req.feature, 'data': data, 'model': model, 'schema_validated': bool(req.schema)}
    else:
        if not last.strip():
            err = failure('empty', step)
            yield {'type': 'error', 'code': err.code, 'message': err.message, 'retryable': True}
            return
        yield {'type': 'result', 'mode': 'real', 'feature': req.feature, 'text': last, 'model': model}
