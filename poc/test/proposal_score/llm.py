"""LLM 백엔드 — Gemini REST(generateContent + JSON 응답 스키마) · 기록 재생(replay) · 규칙(rules, LLM 없음).

rfp_pipeline.py 의 GeminiBackend 와 같은 방식: 같은 프롬프트는 results/cache/<모델>/ 에 저장된 응답을 다시 쓰고,
replay 는 저장된 응답만으로 같은 결과를 네트워크 없이 재현한다. 키 값은 출력하지 않는다.
"""
from __future__ import annotations

import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config


class BackendError(RuntimeError):
    pass


def S(t: str, **kw) -> dict:
    d = {'type': t}
    d.update(kw)
    return d


STR, INT, NUM, BOOL = S('STRING'), S('INTEGER'), S('NUMBER'), S('BOOLEAN')


@dataclass
class CallLog:
    stage: str
    key: str
    ms: int
    prompt_tokens: int = 0
    output_tokens: int = 0
    cached: bool = False
    error: str = ''
    tag: str = ''


class Backend:
    name = 'base'
    online = False

    def __init__(self) -> None:
        self.calls: List[CallLog] = []
        self._lock = threading.Lock()

    def complete(self, stage: str, system: str, user: str, schema: Optional[dict], meta: Optional[dict] = None, temperature: Optional[float] = None) -> Any:
        raise NotImplementedError

    def log(self, c: CallLog) -> None:
        with self._lock:
            self.calls.append(c)

    def usage(self) -> dict:
        with self._lock:
            calls = list(self.calls)
        live = [c for c in calls if not c.cached and not c.error]
        return {
            'calls': len(calls), 'live_calls': len(live), 'cached_calls': sum(1 for c in calls if c.cached), 'errors': sum(1 for c in calls if c.error),
            'prompt_tokens': sum(c.prompt_tokens for c in calls), 'output_tokens': sum(c.output_tokens for c in calls),
            'live_ms': sum(c.ms for c in live), 'by_stage': {s: sum(1 for c in calls if c.stage == s) for s in sorted({c.stage for c in calls})},
        }


def cache_key(model: str, stage: str, system: str, user: str, schema: Optional[dict], temperature: float) -> str:
    raw = '\x00'.join([model, stage, system, user, json.dumps(schema or {}, sort_keys=True, ensure_ascii=False), f'{temperature:.2f}'])
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:24]


def parse_json(text: str) -> Any:
    text = (text or '').strip()
    m = re.search(r'```(?:json)?\s*(.*?)```', text, re.S)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except ValueError:
        pass
    starts = [i for i in (text.find('{'), text.find('[')) if i >= 0]
    if not starts:
        raise ValueError('JSON 없음')
    s = min(starts)
    for end in range(len(text), s, -1):
        if text[end - 1] in '}]':
            try:
                return json.loads(text[s:end])
            except ValueError:
                continue
    raise ValueError('JSON 해석 실패')


def degenerate(text: str, unit: int = 40, times: int = 6) -> bool:
    """같은 조각을 끝없이 되풀이하는 출력(작은 모델 JSON 모드 폭주) 감지."""
    if len(text) < unit * times:
        return False
    tail = text[-unit * times:]
    return tail.count(tail[-unit:]) >= times - 1


class GeminiBackend(Backend):
    name = 'gemini'
    online = True
    DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta'

    def __init__(self, api_key: str, model: str = config.DEFAULT_MODEL, cache_dir: Optional[Path] = None, temperature: float = 0.0,
                 timeout: int = 120, rpm: int = 30, base_url: str = '', verbose: bool = False, max_output: int = 8192) -> None:
        super().__init__()
        if not api_key:
            raise BackendError('GEMINI_API_KEY 가 비어 있어요 (poc/.env)')
        self.key, self.model = api_key, model
        self.base = (base_url or self.DEFAULT_BASE).rstrip('/')
        self.cache_dir = cache_dir or (config.CACHE_DIR / model)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.temperature, self.timeout, self.verbose, self.max_output = temperature, timeout, verbose, max_output
        self.min_gap = 60.0 / rpm if rpm else 0.0
        self._next = 0.0
        self._rate = threading.Lock()

    def _wait_turn(self) -> None:
        with self._rate:
            now = time.time()
            t = max(now, self._next)
            self._next = t + self.min_gap
        if t > now:
            time.sleep(t - now)

    def _post(self, body: dict) -> dict:
        req = urllib.request.Request(f'{self.base}/models/{self.model}:generateContent', data=json.dumps(body).encode('utf-8'), method='POST',
                                     headers={'content-type': 'application/json', 'x-goog-api-key': self.key})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read().decode('utf-8'))

    def complete(self, stage, system, user, schema, meta=None, temperature=None):
        temp = self.temperature if temperature is None else temperature
        key = cache_key(self.model, stage, system, user, schema, temp)
        f = self.cache_dir / f'{stage}-{key}.json'
        if f.exists():
            rec = json.loads(f.read_text(encoding='utf-8'))
            self.log(CallLog(stage, key, 0, rec.get('prompt_tokens', 0), rec.get('output_tokens', 0), cached=True, tag=(meta or {}).get('tag', '')))
            return rec['data']
        gen = {'temperature': temp, 'responseMimeType': 'application/json', 'maxOutputTokens': self.max_output}
        if schema:
            gen['responseSchema'] = schema
        body = {'systemInstruction': {'parts': [{'text': system}]}, 'contents': [{'role': 'user', 'parts': [{'text': user}]}], 'generationConfig': gen}
        t0, last, parse_fail = time.time(), '', 0
        for attempt in range(6):
            self._wait_turn()
            try:
                res = self._post(body)
                cand = (res.get('candidates') or [{}])[0]
                text = ''.join(p.get('text', '') for p in (cand.get('content') or {}).get('parts', []) if not p.get('thought'))
                if cand.get('finishReason') == 'MAX_TOKENS' or degenerate(text):
                    last = '출력 한도 초과 · 반복 폭주'
                    if gen['temperature'] < 0.85:
                        gen['temperature'] = 0.6 if gen['temperature'] < 0.5 else 0.9
                        continue
                    break
                if not text:
                    last = f"빈 응답(finishReason={cand.get('finishReason')}, block={res.get('promptFeedback', {}).get('blockReason')})"
                    time.sleep(2)
                    continue
                try:
                    data = parse_json(text)
                except ValueError as e:
                    parse_fail += 1
                    last = f'JSON 해석 실패: {e}'
                    if parse_fail >= 2:
                        break
                    continue
                um = res.get('usageMetadata', {})
                rec = {'stage': stage, 'model': self.model, 'temperature': temp, 'meta': meta or {}, 'prompt_tokens': um.get('promptTokenCount', 0),
                       'output_tokens': um.get('candidatesTokenCount', 0), 'data': data}
                f.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding='utf-8')
                ms = int((time.time() - t0) * 1000)
                self.log(CallLog(stage, key, ms, rec['prompt_tokens'], rec['output_tokens'], tag=(meta or {}).get('tag', '')))
                if self.verbose:
                    print(f"    · {stage:<10} {(meta or {}).get('tag', '')} {ms}ms in {rec['prompt_tokens']} / out {rec['output_tokens']}", flush=True)
                return data
            except urllib.error.HTTPError as e:
                detail = e.read().decode('utf-8', 'replace')[:400]
                last = f'HTTP {e.code}: {detail}'
                if e.code == 400 and 'schema' in detail.lower() and 'responseSchema' in gen:
                    gen.pop('responseSchema')
                    continue
                if e.code in (429, 500, 502, 503, 504):
                    time.sleep(min(60, 3 * 2 ** attempt))
                    continue
                break
            except (urllib.error.URLError, TimeoutError, KeyError, IndexError, OSError) as e:
                last = f'{type(e).__name__}: {e}'
                time.sleep(min(20, 2 ** attempt))
        self.log(CallLog(stage, key, int((time.time() - t0) * 1000), error=last, tag=(meta or {}).get('tag', '')))
        raise BackendError(f'Gemini 호출 실패 ({stage}): {last}')


class ReplayBackend(Backend):
    """저장된 Gemini 응답만으로 재현. 기록이 없으면 BackendError."""
    name = 'replay'
    online = True

    def __init__(self, model: str = config.DEFAULT_MODEL, cache_dir: Optional[Path] = None, temperature: float = 0.0) -> None:
        super().__init__()
        self.model, self.temperature = model, temperature
        self.cache_dir = cache_dir or (config.CACHE_DIR / model)

    def complete(self, stage, system, user, schema, meta=None, temperature=None):
        temp = self.temperature if temperature is None else temperature
        key = cache_key(self.model, stage, system, user, schema, temp)
        f = self.cache_dir / f'{stage}-{key}.json'
        if not f.exists():
            self.log(CallLog(stage, key, 0, error='기록 없음'))
            raise BackendError(f'replay: 기록 없음 ({stage} {key})')
        rec = json.loads(f.read_text(encoding='utf-8'))
        self.log(CallLog(stage, key, 0, rec.get('prompt_tokens', 0), rec.get('output_tokens', 0), cached=True, tag=(meta or {}).get('tag', '')))
        return rec['data']


class RulesBackend(Backend):
    """LLM 없이 규칙만 — 라우터 · 채점기가 결정론 대체 경로를 쓴다."""
    name = 'rules'
    online = False

    def complete(self, *a, **k):
        raise BackendError('rules 백엔드는 LLM 을 부르지 않아요')


def make_backend(name: str, model: str = '', temperature: float = 0.0, rpm: int = 30, verbose: bool = False) -> Backend:
    env = config.load_env()
    model = model or env.get('GEMINI_MODEL') or config.DEFAULT_MODEL
    if name == 'gemini':
        return GeminiBackend(env.get('GEMINI_API_KEY', ''), model, temperature=temperature, rpm=rpm, base_url=env.get('GEMINI_BASE_URL', ''), verbose=verbose)
    if name == 'replay':
        return ReplayBackend(model, temperature=temperature)
    if name == 'rules':
        return RulesBackend()
    raise BackendError(f'모르는 백엔드: {name}')
