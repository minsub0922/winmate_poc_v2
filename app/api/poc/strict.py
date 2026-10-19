"""Strict real-only policy shared by every PoC-backed endpoint.

* Every AI task needs the server Gemini provider. No credential → :class:`Unavailable` (HTTP 503,
  ``code='no_api_key'``) before any work starts; nothing is fabricated.
* Legacy request switches (``offline: true``, ``llm: false``, ``mode`` other than ``'real'``) are rejected
  with HTTP 422 (``code='unsupported_option'``) instead of silently running rules.
* A provider failure (after the provider's own bounded retries) becomes :class:`ModelFailure` with a
  typed, actionable, secret-safe message. Adapters raise it *instead of* the PoC ``BackendError`` so the
  original PoC code cannot swallow it and substitute a rule result.
"""
from __future__ import annotations

from typing import Any, Optional

from .jobs import BadRequest, ModelFailure, Unavailable
from .provider import ProviderError, get_provider
from .settings import FUNCTIONS, Settings

# code → (HTTP status for sync endpoints, retryable, actionable Korean message)
FAILURES = {
    'no_api_key': (503, False, '서버에 GEMINI_API_KEY 가 설정되어 있지 않아 AI 기능을 실행할 수 없습니다. 관리자에게 키 설정을 요청하세요.'),
    'provider_disabled': (503, False, '서버 Gemini 연결이 꺼져 있어 AI 기능을 실행할 수 없습니다. 서버 설정을 확인하세요.'),
    'auth_failed': (503, False, 'Gemini 가 서버 키를 거부했습니다(401/403). 키 · 권한 · 결제 상태를 확인하세요.'),
    'model_not_found': (503, False, '설정된 GEMINI_MODEL 을 찾지 못했습니다. 서버의 모델 이름을 확인하세요.'),
    'rate_limited': (429, True, 'Gemini 요청 한도에 걸려 재시도 후에도 실패했습니다. 잠시 뒤 다시 시도하세요.'),
    'upstream_unavailable': (503, True, 'Gemini 서버가 일시적으로 응답하지 않습니다. 잠시 뒤 다시 시도하세요.'),
    'network': (504, True, 'Gemini 에 연결하지 못했습니다(네트워크 · 시간 초과). 잠시 뒤 다시 시도하세요.'),
    'blocked': (422, False, 'Gemini 가 안전 정책으로 이 입력에 답하지 않았습니다. 입력 내용을 확인하세요.'),
    'bad_request': (422, False, 'Gemini 가 요청 형식을 거부했습니다. 입력 크기 · 이미지 형식을 확인하세요.'),
    'max_tokens': (502, True, '모델 출력이 한도를 넘었습니다. 입력을 줄이거나 다시 시도하세요.'),
    'invalid_json': (502, True, '모델 응답을 JSON 으로 읽지 못했습니다. 다시 시도하세요.'),
    'schema_rejected': (502, True, '모델이 요구한 출력 형식을 따르지 않았습니다. 다시 시도하세요.'),
    'empty': (502, True, '모델이 빈 응답을 돌려줬습니다. 다시 시도하세요.'),
    'invalid_output': (502, True, '모델 응답이 요구한 형식 · 후보 목록에 맞지 않았습니다. 다시 시도하세요.'),
    'incomplete_output': (502, True, '모델 응답에 필요한 항목이 빠져 있었습니다. 다시 시도하세요.'),
    'no_model_call': (502, True, 'AI 단계가 실제로 실행되지 않았습니다. 다시 시도하세요.'),
    'http_error': (502, True, 'Gemini 요청이 실패했습니다. 잠시 뒤 다시 시도하세요.'),
    'upstream_error': (502, True, 'Gemini 요청이 실패했습니다. 잠시 뒤 다시 시도하세요.'),
}
STRICT_POLICY = {
    'strict_real_only': True, 'rule_fallback': False, 'dummy_mode': False,
    'legacy_request_options': 'offline · llm:false · mode≠real → 422 unsupported_option',
    'missing_key': '503 no_api_key (initialize() fails at startup)',
    'model_failure': 'job status=error · {code, message, step, retryable}; sync endpoints → HTTP 4xx/5xx',
}


def reject_legacy_options(body: Any) -> None:
    """``offline``/``llm:false``/``mode≠real`` used to switch to rules — no longer supported (422)."""
    if not isinstance(body, dict):
        return
    if 'offline' in body and body['offline'] not in (False, None):
        raise BadRequest('offline 요청은 더 이상 지원하지 않습니다. 서버는 항상 실제 Gemini 로만 실행합니다.', 'unsupported_option')
    if 'llm' in body and body['llm'] not in (True, None):
        raise BadRequest('llm:false 요청은 더 이상 지원하지 않습니다. 규칙만 실행하는 경로는 없습니다.', 'unsupported_option')
    if body.get('mode') not in (None, 'real') and body.get('kind') != 'storyboard':
        # storyboard uses ``mode`` for continue/redesign; every other caller may only send 'real'
        raise BadRequest("mode 는 'real' 만 지원합니다(dummy · offline 없음).", 'unsupported_option')


def require_provider(settings: Settings, feature: str) -> Any:
    """The server Gemini provider, or :class:`Unavailable` (503) — never a rules-only plan."""
    if feature not in FUNCTIONS:
        raise BadRequest(f'알 수 없는 AI 기능입니다: {str(feature)[:40]}')
    provider, reason = get_provider(settings)
    if provider is None:
        code = reason if reason in FAILURES else 'no_api_key'
        raise Unavailable(FAILURES[code][2], code)
    return provider


def failure(code: str, step: str, detail: str = '', provider_code: str = '', llm: Optional[dict] = None) -> ModelFailure:
    status, retryable, message = FAILURES.get(code, FAILURES['upstream_error'])
    return ModelFailure(code if code in FAILURES else 'upstream_error', message, step=step, retryable=retryable, status=status,
                        detail=detail, provider_code=provider_code or code, llm=llm)


def from_provider(step: str, exc: ProviderError) -> ModelFailure:
    return failure(exc.code, step, exc.message, exc.code)


def invalid_output(step: str, detail: str, code: str = 'invalid_output') -> ModelFailure:
    return failure(code, step, detail)
