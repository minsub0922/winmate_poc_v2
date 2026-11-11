"""Gemini JSON client for the composer (stdlib only).

- Structured output: ``responseMimeType=application/json`` + ``responseSchema`` (OpenAPI subset Gemini accepts).
- Every call is validated by the caller; one repair round re-asks with the validation error (no rule fallback).
- Shared rate limit (default 40 calls / 60 s across threads) and a disk cache keyed by the exact request, so an
  experiment can be re-scored without paying again. ``WM_LLM_CACHE=off`` disables the cache.

Keys are read from the environment (``GEMINI_API_KEY``) or a nearby ``.env`` and never printed.
In the app the same prompts go through ``app/api/llm`` (queue · retries · usage) via :class:`AppProviderLLM`.
"""
from __future__ import annotations

import hashlib
import json
import os
import random
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path
from typing import Any, Callable, Dict, Optional

HERE = Path(__file__).resolve().parent.parent
CACHE_DIR = HERE / 'data' / 'llm_cache'


class LLMError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f'{code}: {message}')
        self.code = code


def _dotenv() -> Dict[str, str]:
    out: Dict[str, str] = {}
    for p in (HERE / '.env', HERE.parent.parent / '.env', HERE.parents[2] / 'app' / '.env'):
        if p.exists():
            for line in p.read_text(encoding='utf-8').splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    out.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return out


class _RateLimiter:
    def __init__(self, per_minute: int) -> None:
        self.n = max(1, per_minute)
        self.calls: deque = deque()
        self.lock = threading.Lock()

    def wait(self) -> None:
        while True:
            with self.lock:
                now = time.time()
                while self.calls and now - self.calls[0] > 60:
                    self.calls.popleft()
                if len(self.calls) < self.n:
                    self.calls.append(now)
                    return
                sleep = 60 - (now - self.calls[0]) + 0.05
            time.sleep(max(0.05, sleep))


class GeminiJSON:
    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None, rpm: Optional[int] = None,
                 cache: Optional[bool] = None, timeout: float = 90.0) -> None:
        env = {**_dotenv(), **os.environ}
        self.key = api_key or env.get('GEMINI_API_KEY') or env.get('WINMATE_LLM_API_KEY') or ''
        self.model = model or env.get('WM_COMPOSER_MODEL') or env.get('GEMINI_MODEL') or 'gemini-3.1-flash-lite'
        self.base = (env.get('GEMINI_BASE_URL') or 'https://generativelanguage.googleapis.com/v1beta').rstrip('/')
        self.limiter = _RateLimiter(int(rpm or env.get('WM_COMPOSER_RPM') or 40))
        self.cache = (env.get('WM_LLM_CACHE', 'on') != 'off') if cache is None else cache
        self.timeout = timeout
        self.lock = threading.Lock()
        self.usage = {'calls': 0, 'cached': 0, 'failed': 0, 'repairs': 0, 'in_tokens': 0, 'out_tokens': 0, 'ms': 0, 'by_stage': {}}

    @property
    def available(self) -> bool:
        return bool(self.key)

    # ------------------------------------------------------------------ transport
    def _post(self, body: dict) -> dict:
        url = f'{self.base}/models/{self.model}:generateContent'
        data = json.dumps(body).encode('utf-8')
        last = None
        for attempt in range(5):
            self.limiter.wait()
            req = urllib.request.Request(url, data=data, method='POST',
                                         headers={'Content-Type': 'application/json', 'x-goog-api-key': self.key})
            t0 = time.time()
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    out = json.loads(r.read().decode('utf-8'))
                with self.lock:
                    self.usage['ms'] += int((time.time() - t0) * 1000)
                return out
            except urllib.error.HTTPError as e:
                msg = e.read().decode('utf-8', 'ignore')[:300]
                last = LLMError(f'http_{e.code}', msg)
                if e.code in (429, 500, 502, 503, 504):
                    time.sleep(min(30, 2 ** attempt + random.random()))
                    continue
                raise last
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last = LLMError('network', str(e)[:200])
                time.sleep(min(20, 2 ** attempt + random.random()))
        raise last or LLMError('failed', 'no response')

    # ------------------------------------------------------------------ API
    def json(self, *, stage: str, prompt: str, schema: dict, system: str = '', temperature: float = 0.2,
             validate: Optional[Callable[[Any], Any]] = None, max_tokens: int = 8192, seed: Optional[int] = None) -> Any:
        """One structured call (+ one repair round if ``validate`` returns an error string). Raises LLMError."""
        if not self.key:
            raise LLMError('no_api_key', 'GEMINI_API_KEY is not set')
        text = prompt
        data = None
        for attempt in range(2):
            data = self._one(stage, text, schema, system, temperature, max_tokens, seed)
            problem = validate(data) if validate else True
            if problem is True or problem is None:
                return data
            with self.lock:
                self.usage['repairs'] += 1
            text = prompt + '\n\n[이전 응답의 검증 오류]\n' + str(problem)[:1500] + '\n위 오류만 고친 JSON 전체를 다시 답하세요. 새 사실을 만들지 마세요.'
        err = LLMError('invalid_output', f'{stage}: {str(problem)[:300]}')
        err.last = data
        raise err

    def _one(self, stage, prompt, schema, system, temperature, max_tokens, seed):
        gen = {'temperature': temperature, 'responseMimeType': 'application/json', 'responseSchema': schema, 'maxOutputTokens': max_tokens}
        if seed is not None:
            gen['seed'] = seed
        body = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}], 'generationConfig': gen}
        if system:
            body['systemInstruction'] = {'parts': [{'text': system}]}
        h = hashlib.sha256(json.dumps([self.model, body], ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
        cp = CACHE_DIR / self.model / h[:2] / (h + '.json')
        st = self.usage['by_stage'].setdefault(stage, {'calls': 0, 'cached': 0, 'in': 0, 'out': 0})
        if self.cache and cp.exists():
            with self.lock:
                self.usage['cached'] += 1
                st['cached'] += 1
            return json.loads(cp.read_text(encoding='utf-8'))
        try:
            out = self._post(body)
        except LLMError:
            with self.lock:
                self.usage['failed'] += 1
            raise
        meta = out.get('usageMetadata') or {}
        with self.lock:
            self.usage['calls'] += 1
            self.usage['in_tokens'] += int(meta.get('promptTokenCount') or 0)
            self.usage['out_tokens'] += int(meta.get('candidatesTokenCount') or 0)
            st['calls'] += 1
            st['in'] += int(meta.get('promptTokenCount') or 0)
            st['out'] += int(meta.get('candidatesTokenCount') or 0)
        cands = out.get('candidates') or []
        if not cands:
            raise LLMError('empty', json.dumps(out.get('promptFeedback') or {})[:200])
        parts = (cands[0].get('content') or {}).get('parts') or []
        raw = ''.join(p.get('text', '') for p in parts if not p.get('thought'))
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            raise LLMError('invalid_json', raw[:200])
        if self.cache:
            cp.parent.mkdir(parents=True, exist_ok=True)
            cp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        return data


class AppProviderLLM:
    """Same interface over the app's provider (``app/api/llm`` queue · retries · usage) — used inside the API job."""

    def __init__(self, provider: Any, cancel: Optional[Callable[[], None]] = None, on_call: Optional[Callable[[str], None]] = None) -> None:
        self.p = provider
        self.cancel = cancel
        self.on_call = on_call
        self.model = getattr(provider, 'model', '')
        self.usage = {'calls': 0, 'repairs': 0, 'by_stage': {}}

    available = True

    def json(self, *, stage, prompt, schema, system='', temperature=0.2, validate=None, max_tokens=8192, seed=None):
        text = prompt
        data = None
        for attempt in range(2):
            if self.cancel:
                self.cancel()
            r = self.p.generate_json(stage=f'compose:{stage}', system=system, user=text, schema=schema, temperature=temperature,
                                     max_output_tokens=max_tokens, seed=seed)
            self.usage['calls'] += 1
            if self.on_call:
                self.on_call(stage)
            data = r.data
            problem = validate(data) if validate else True
            if problem is True or problem is None:
                return data
            self.usage['repairs'] += 1
            text = prompt + '\n\n[이전 응답의 검증 오류]\n' + str(problem)[:1500] + '\n위 오류만 고친 JSON 전체를 다시 답하세요. 새 사실을 만들지 마세요.'
        err = LLMError('invalid_output', f'{stage}: {str(problem)[:300]}')
        err.last = data
        raise err
