"""Generic ``POST /api/llm`` for the frontend sample adapter (``app/web/src/platform/runtime.js``).

Request  ``{kind: 'json'|'text', prompt? , turns?, model_tier?, images?, stream?}``
Response (JSON)  ``{mode: 'real', data}`` / ``{mode: 'real', text}`` /
                 ``{mode: 'dummy', error: 'unavailable', message}`` / ``{mode: 'real', error: <code>, message}``
Response (SSE, when ``stream: true`` or ``Accept: text/event-stream``) — ``requestCompletion`` protocol:
cumulative ``{type: 'text', text}`` frames, then ``{type: 'result', data}`` or ``{type: 'result', text}``,
or ``{type: 'error', code, message}``. Dummy / unavailable answers are always plain JSON.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator, List, Optional, Tuple

from ..jobs import BadRequest
from ..provider import ProviderError, get_provider, parse_json
from ..settings import Settings, FUNCTIONS

FRONT_CODES = {'rate_limited': 'rate_limited', 'invalid_json': 'invalid_json', 'cancelled': 'cancelled'}
MESSAGES = {
    'rate_limited': 'AI 요청이 많아요. 잠시 뒤 다시 시도해 주세요.', 'invalid_json': 'AI 답을 읽지 못했어요. 다시 시도해 주세요.',
    'cancelled': '취소했어요.', 'blocked': 'AI 가 이 요청에 답하지 않았어요. 기본 규칙으로 처리했어요.',
}


@dataclass
class LlmRequest:
    kind: str
    prompt: Optional[str]
    turns: Optional[List[Any]]
    tier: str
    images: Optional[List[Any]]


def parse(body: dict, settings: Settings) -> Tuple[Optional[LlmRequest], Any, Optional[dict]]:
    """(request, provider, immediate_response). Validation errors raise BadRequest."""
    if not isinstance(body, dict):
        raise BadRequest('요청 본문은 JSON 객체여야 합니다.')
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
    tier = str(body.get('model_tier') or 'default')
    feature = body.get('feature') or 'llm'
    if feature not in FUNCTIONS:
        raise BadRequest('알 수 없는 AI 기능입니다.')
    if settings.function_mode(feature) != 'real':
        return None, None, {'mode': 'dummy', 'error': 'unavailable', 'message': 'AI 더미 모드: 기존 기본 규칙으로 처리합니다.'}
    provider, reason = get_provider(settings)
    if provider is None:
        return None, None, {'mode': 'real', 'effective': 'unavailable', 'error': 'unavailable', 'reason': reason,
                            'message': 'AI 를 쓸 수 없어 기본 규칙으로 처리합니다(서버 AI 설정 확인 필요).'}
    return LlmRequest(kind, prompt, turns, tier, images or None), provider, None


def _error(exc: ProviderError) -> dict:
    code = FRONT_CODES.get(exc.code, 'upstream_error')
    return {'mode': 'real', 'error': code, 'detail_code': exc.code, 'message': MESSAGES.get(exc.code) or MESSAGES.get(code) or 'AI 요청이 실패해 기본 규칙으로 처리했어요.'}


def complete(req: LlmRequest, provider: Any) -> dict:
    model = provider.model_for(req.tier)
    try:
        if req.kind == 'json':
            res = provider.generate_json(stage='app:json', user=req.prompt, turns=req.turns, temperature=0.4, max_output_tokens=8192,
                                         model=model, images=req.images, max_attempts=3)
            body = {'mode': 'real', 'data': res.data}
        else:
            res = provider.generate_text(stage='app:text', user=req.prompt, turns=req.turns, temperature=0.6, max_output_tokens=8192,
                                         model=model, images=req.images, max_attempts=3)
            body = {'mode': 'real', 'text': res.text}
    except ProviderError as exc:
        return _error(exc)
    body.update({'model': res.model, 'usage': {'prompt_tokens': res.prompt_tokens, 'output_tokens': res.output_tokens, 'cached': res.cached}})
    return body


def stream(req: LlmRequest, provider: Any) -> Iterator[dict]:
    model = provider.model_for(req.tier)
    last = ''
    try:
        for acc in provider.stream_text(stage=f'app:{req.kind}', user=req.prompt, turns=req.turns, temperature=0.4 if req.kind == 'json' else 0.6,
                                        max_output_tokens=8192, json_mode=req.kind == 'json', model=model, images=req.images):
            last = acc
            yield {'type': 'text', 'text': acc}
    except ProviderError as exc:
        err = _error(exc)
        yield {'type': 'error', 'code': err['error'], 'message': err['message']}
        return
    if req.kind == 'json':
        try:
            data = parse_json(last)
        except ValueError:
            yield {'type': 'error', 'code': 'invalid_json', 'message': MESSAGES['invalid_json']}
            return
        yield {'type': 'result', 'mode': 'real', 'data': data, 'model': model}
    else:
        yield {'type': 'result', 'mode': 'real', 'text': last, 'model': model}
