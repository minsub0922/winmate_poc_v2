"""시험용 ClefDecision — 관리자 설정 파일(admin_runtime/clef_remote.json 모양)을 읽어 System One 서버로 보내는 예.

실제 CLEF 연결 코드가 아니다(터널 없음). 사내망의 실제 구현은 app/api/llm/inhouse/clef.py (git 제외) — 거기서는 이 자리에서
SSH 터널을 준비하고(local_port) 프록시를 거치지 않고 보낸다.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from app.api.llm.inhouse_contract import DecisionReply, DecisionTarget, InhouseDecision, InhouseError, ProbeResult


class ClefDecision(InhouseDecision):
    TIMEOUT = 30

    def _saved(self) -> dict:
        return json.loads((self.ctx.admin_runtime / 'clef_remote.json').read_text(encoding='utf-8'))

    def _endpoint(self, target: str) -> dict:
        saved = self._saved()
        provider = next(p for p in saved['providers'] if p['id'] == target)
        return next(e for e in saved['endpoints'] if e['id'] == provider['endpoint'])

    def targets(self):
        return [DecisionTarget(id=p['id'], model=p['model'], label=p.get('label', p['id']), enabled=bool(p['enabled']),
                               max_tokens=int(p.get('max_tokens', 15_000)), parallel=int(p.get('parallel', 1)))
                for p in self._saved()['providers']]

    def _open(self, request, timeout):
        # 프록시를 거치지 않는다(사내 터널 · 사내 주소)
        return urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=timeout)

    def answer(self, call):
        base = self._endpoint(call.target)['base_url'].rstrip('/')
        raw = json.dumps({'model': call.model, 'state': call.state, 'questions': dict(call.questions)}, ensure_ascii=False).encode()
        request = urllib.request.Request(base + '/v1/systemone', data=raw, method='POST', headers={'Content-Type': 'application/json'})
        try:
            with self._open(request, call.timeout) as response:
                data = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            exc.close()
            raise InhouseError('upstream_unavailable' if exc.code >= 500 or exc.code == 429 else 'bad_request', f'HTTP {exc.code}', exc.code) from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise InhouseError('network', type(exc).__name__) from None
        usage = data.get('usage') or {}
        return DecisionReply(answers=data.get('answers') or {}, model=data.get('model', call.model),
                             input_tokens=int(usage.get('input_tokens') or 0), output_tokens=int(usage.get('output_tokens') or 0))

    def probe(self, target):
        base = self._endpoint(target)['base_url'].rstrip('/')
        with self._open(urllib.request.Request(base + '/health', method='GET'), 8) as response:
            data = json.loads(response.read())
        return ProbeResult(data.get('status') == 'ok', '가짜 System One 서버가 응답했습니다.', (str(data.get('model')),) if data.get('model') else ())
