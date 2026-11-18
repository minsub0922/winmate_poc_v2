"""시험용 GaussLLM — 가짜 사내 서버(app/tests/fixtures/inhouse_fake.py)의 **가짜 규격**에 맞춘 예.

실제 Gauss 규격이 아니다. 계약(app/api/llm/inhouse_contract.py)을 어떻게 채우는지 — 요청 만들기 · 응답 읽기 · 스트림 한 줄 읽기 ·
검색 · 오류 본문 · 점검 — 의 구조만 참고한다. 사내망의 실제 구현은 app/api/llm/inhouse/gauss.py (git 제외).
"""
from __future__ import annotations

import json
from urllib.parse import quote

from app.api.llm.inhouse_contract import HttpCall, InhouseError, InhouseLLM, LLMDelta, LLMReply, ProbeResult, SearchHit

_END = {'done': 'stop', 'cut': 'length', 'blocked': 'safety'}
_ERRORS = {'busy': 'rate_limited', 'down': 'upstream_unavailable', 'denied': 'auth_failed', 'model': 'model_not_found'}


class GaussLLM(InhouseLLM):
    REQUIRED_ENV = ('INTERNAL_LLM_API_KEY', 'INTERNAL_LLM_CLIENT_KEY', 'INTERNAL_LLM_BASE_URL', 'INTERNAL_LLM_MODEL')
    CAPABILITIES = frozenset({'text', 'json', 'image', 'stream', 'search'})

    def _base(self) -> str:
        return self.ctx.get('INTERNAL_LLM_BASE_URL').rstrip('/')

    def _headers(self) -> dict:
        return {'x-fake-token': self.ctx.get('INTERNAL_LLM_API_KEY'), 'x-fake-client': self.ctx.get('INTERNAL_LLM_CLIENT_KEY'),
                'x-fake-user': self.ctx.get('INTERNAL_LLM_USER_EMAIL')}

    def build(self, call):
        turns = [{'who': 'bot' if m.role == 'assistant' else 'user', 'text': m.text,
                  'pictures': [{'type': p.mime, 'b64': p.data} for p in m.images]} for m in call.messages]
        options = {'temperature': call.temperature, 'max_tokens': call.max_output_tokens, 'format': 'json' if call.json_mode else 'text'}
        if call.schema:
            options['schema'] = call.schema
        body = {'model': call.model, 'prompt': {'system': call.system, 'turns': turns}, 'options': options, 'stream': call.stream}
        return HttpCall(self._base() + '/fake-llm/chat', self._headers(), json=body)

    def parse(self, status, body):
        if isinstance(body, dict) and body.get('error'):
            error = body['error']
            raise InhouseError(_ERRORS.get(error.get('kind'), 'upstream_error'), '가짜 서버: ' + str(error.get('text', '')))
        if not isinstance(body, dict) or 'result' not in body:
            raise InhouseError('invalid_output', '가짜 서버 응답에 result 가 없습니다.')
        tokens = body.get('tokens') or {}
        return LLMReply(text=body['result']['message'], finish=_END.get(body['result'].get('end'), 'stop'),
                        input_tokens=tokens.get('in', 0), output_tokens=tokens.get('out', 0), model=body.get('model', ''))

    def parse_stream(self, line):
        if not line.startswith('data:'):
            return None  # event 이름 · 주석(:) 줄
        data = json.loads(line[5:].strip())
        if data.get('error'):
            raise InhouseError('upstream_error', str(data['error']))
        if 'end' in data:
            tokens = data.get('tokens') or {}
            return LLMDelta(finish=_END.get(data['end'], 'stop'), input_tokens=tokens.get('in'), output_tokens=tokens.get('out'))
        return LLMDelta(text=data.get('piece', ''))

    def build_search(self, query, limit):
        return HttpCall(f'{self._base()}/fake-search?q={quote(query)}&n={limit}', {'x-fake-search': self.ctx.get('INTERNAL_SEARCH_API_KEY')},
                        method='GET')

    def parse_search(self, status, body):
        return [SearchHit(title=i['name'], url=i['link'], snippet=i.get('summary', '')) for i in (body or {}).get('items', [])]

    def error(self, status, body):
        try:
            data = json.loads(body)
        except ValueError:
            return None
        if isinstance(data, dict) and isinstance(data.get('error'), dict):
            kind = data['error'].get('kind')
            return InhouseError(_ERRORS.get(kind, 'upstream_error'), '가짜 서버 오류: ' + str(data['error'].get('text', '')), status)
        return None

    def probe(self):
        return HttpCall(self._base() + '/fake-llm/health', self._headers(), method='GET')

    def check_probe(self, status, body):
        models = tuple((body or {}).get('models') or ())
        model = self.ctx.get('INTERNAL_LLM_MODEL')
        if models and model not in models:
            return ProbeResult(False, f'서버에 모델 {model} 이 없습니다.', models)
        return ProbeResult(bool((body or {}).get('ok')), '가짜 서버가 응답했습니다.', models)
