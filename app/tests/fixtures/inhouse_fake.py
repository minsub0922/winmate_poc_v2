"""시험용 가짜 사내 서버 — 사내 연결 통로(app/api/llm/inhouse_bridge.py)를 네트워크 밖으로 나가지 않고 시험한다.

**가짜 규격이다.** 경로 · 헤더 · 본문 모양은 이 시험만을 위해 지어낸 것이고 실제 Gauss · CLEF 규격과 상관없다. 구조를 보이는 예는
``app/tests/fixtures/inhouse/gauss.py`` · ``clef.py`` (이 서버에 맞춘 GaussLLM · ClefDecision).

* ``POST /fake-llm/chat``  가짜 LLM — 헤더 ``x-fake-token`` · ``x-fake-client`` 확인, 본문 ``{model, prompt{system, turns[{who, text, pictures}]},
  options{temperature, max_tokens, format, schema?}, stream}``, 응답 ``{result{message, end}, tokens{in, out}, model}``, 스트림은
  ``event:`` 줄 + ``data: {"piece": …}`` · 마지막 ``data: {"end": …, "tokens": …}``. 200 인데 ``{error{kind, text}}`` 를 줄 수도 있다.
* ``GET /fake-llm/health``  · ``GET /fake-search?q=&n=`` (헤더 ``x-fake-search``)
* ``POST /v1/systemone`` · ``GET /health``  System One(Decision)
* ``POST /v1/chat/completions``  OpenAI 호환 — 대체(fallback) 연결 시험용
"""
from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

TOKEN = 'gauss-token-secret-123456'
CLIENT = 'gauss-client-secret-654321'
SEARCH_KEY = 'search-secret-000000'
FIXTURES = Path(__file__).resolve().parent / 'inhouse'


def install(folder: Path, *, gauss: bool = True, clef: bool = True, patch: dict | None = None) -> Path:
    """fixture 클래스를 사내 폴더 하나로 복사(필요하면 고쳐서) — WINMATE_INHOUSE_DIR 로 가리킨다."""
    folder.mkdir(parents=True, exist_ok=True)
    for name, on in (('gauss.py', gauss), ('clef.py', clef)):
        if on:
            text = (FIXTURES / name).read_text(encoding='utf-8')
            for old, new in (patch or {}).get(name, ()):
                assert old in text, old
                text = text.replace(old, new)
            (folder / name).write_text(text, encoding='utf-8')
    return folder


def clef_config(*targets) -> dict:
    """targets: (id, server, enabled, max_tokens, parallel)"""
    return {'providers': [{'id': t[0], 'enabled': t[2], 'endpoint': 'ep-' + t[0], 'model': t[1].name, 'label': 'CLEF ' + t[0],
                           'max_tokens': t[3], 'parallel': t[4]} for t in targets],
            'endpoints': [{'id': 'ep-' + t[0], 'base_url': t[1].base, 'local_port': t[1].port} for t in targets]}


class FakeInhouse:
    def __init__(self, name: str = 'clef-test') -> None:
        self.name = name
        self.requests: list = []           # (method, path, headers, body)
        self.llm_errors: list = []         # 200 응답 본문의 오류를 차례로 하나씩: {'kind': 'busy', 'text': …}
        self.systemone_fail = 0            # System One 이 돌려줄 HTTP 오류(0 = 정상)
        self.bad_answers = False
        self.delay = 0.0
        self.active = self.peak = 0
        self._lock = threading.Lock()
        outer = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def log_message(self, *args):
                pass

            def reply(self, status, value):
                raw = json.dumps(value, ensure_ascii=False).encode()
                self.send_response(status)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def record(self, body=None):
                outer.requests.append((self.command, self.path, {k.lower(): v for k, v in self.headers.items()}, body))

            def do_GET(self):
                self.record()
                url = urlsplit(self.path)
                if url.path == '/fake-llm/health':
                    return self.reply(200, {'ok': True, 'models': ['gauss-test', 'gauss-vision']})
                if url.path == '/fake-search':
                    if self.headers.get('x-fake-search') != SEARCH_KEY:
                        return self.reply(401, {'error': {'kind': 'denied', 'text': 'search key'}})
                    q = parse_qs(url.query).get('q', [''])[0]
                    n = int(parse_qs(url.query).get('n', ['8'])[0])
                    items = [{'name': f'자료 {i + 1} — {q[:20]}', 'link': f'https://example.org/doc/{i + 1}', 'summary': f'{q[:20]} 관련 수치 {i + 1}'}
                             for i in range(min(n, 3))]
                    return self.reply(200, {'items': items})
                if url.path == '/health':
                    return self.reply(200, {'status': 'ok', 'model': outer.name})
                self.reply(404, {'error': {'kind': 'missing', 'text': 'not found'}})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
                self.record(body)
                path = urlsplit(self.path).path
                if path == '/fake-llm/chat':
                    return self.chat(body)
                if path == '/v1/systemone':
                    return self.systemone(body)
                if path == '/v1/chat/completions':
                    text = 'fallback:' + body['model']
                    if body.get('stream'):
                        events = [{'choices': [{'delta': {'content': text}, 'finish_reason': None}]},
                                  {'choices': [{'delta': {}, 'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 4, 'completion_tokens': 2}}]
                        raw = (''.join(f'data: {json.dumps(e)}\n\n' for e in events) + 'data: [DONE]\n\n').encode()
                        self.send_response(200)
                        self.send_header('content-type', 'text/event-stream')
                        self.send_header('content-length', str(len(raw)))
                        self.end_headers()
                        return self.wfile.write(raw)
                    return self.reply(200, {'choices': [{'message': {'content': text}, 'finish_reason': 'stop'}],
                                            'usage': {'prompt_tokens': 4, 'completion_tokens': 2, 'total_tokens': 6}})
                self.reply(404, {'error': {'kind': 'missing', 'text': 'not found'}})

            def chat(self, body):
                token, client = self.headers.get('x-fake-token'), self.headers.get('x-fake-client')
                if token != TOKEN or client != CLIENT:  # the error body repeats what it got — the app must hide it
                    return self.reply(401, {'error': {'kind': 'denied', 'text': f'unknown token {token} / {client}'}})
                if outer.llm_errors:
                    return self.reply(200, {'error': outer.llm_errors.pop(0)})
                turns = body['prompt']['turns']
                pictures = sum(len(t.get('pictures') or []) for t in turns)
                last = turns[-1]['text'] if turns else ''
                text = '{"ok": true}' if body['options'].get('format') == 'json' else f"echo:{body['model']}:{pictures}:{last[:12]}"
                if not body.get('stream'):
                    return self.reply(200, {'result': {'message': text, 'end': 'done'}, 'tokens': {'in': 12, 'out': 5}, 'model': body['model']})
                pieces = ['하나', ' 둘', ' 셋']
                lines = []
                for piece in pieces:
                    lines += ['event: delta', 'data: ' + json.dumps({'piece': piece}, ensure_ascii=False), '']
                lines += [': keep-alive', 'data: ' + json.dumps({'end': 'done', 'tokens': {'in': 3, 'out': 3}}), '']
                raw = ('\n'.join(lines) + '\n').encode()
                self.send_response(200)
                self.send_header('content-type', 'text/event-stream')
                self.send_header('content-length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def systemone(self, body):
                with outer._lock:
                    outer.active += 1
                    outer.peak = max(outer.peak, outer.active)
                try:
                    time.sleep(outer.delay)
                    if outer.systemone_fail:
                        return self.reply(outer.systemone_fail, {'detail': 'busy'})
                    answers = {}
                    for qid, q in body['questions'].items():
                        if outer.bad_answers:
                            answers[qid] = {'type': 'noul'}
                        elif q['type'] == 'noul':
                            answers[qid] = {'type': 'noul', 'noul': 0.8, 'confidence': 0.8}
                        elif q['type'] == 'choice':
                            first = next(iter(q['criteria']))
                            answers[qid] = {'type': 'choice', 'choice': first, 'confidence': 0.7,
                                            'probabilities': {k: (0.7 if k == first else 0.3 / max(1, len(q['criteria']) - 1)) for k in q['criteria']}}
                        else:
                            answers[qid] = {'type': 'score', 'score': 2.0, 'confidence': 0.6, 'probabilities': {'2': 1.0}}
                    return self.reply(200, {'model': body['model'], 'answers': answers, 'usage': {'input_tokens': 40, 'output_tokens': 0}})
                finally:
                    with outer._lock:
                        outer.active -= 1

        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.port = self.httpd.server_address[1]
        self.base = f'http://127.0.0.1:{self.port}'
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()

    def posts(self, path: str) -> list:
        return [r for r in self.requests if r[0] == 'POST' and urlsplit(r[1]).path == path]
