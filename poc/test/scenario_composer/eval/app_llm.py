"""The app's own model provider for experiments (same queue · retries · adapter the server uses), with a disk cache.

    llm = AppLLM()                       # provider of the root .env (WINMATE_LLM_PROVIDER); never prints keys
    llm.json(stage=…, prompt=…, schema=…, validate=…)   # same interface as composer.llm.GeminiJSON / AppProviderLLM

The request queue DB is a private file (not the live server's) and the response cache lives under ``WM_EVAL_CACHE``
(default: the composer data dir) — re-scoring a run does not pay again. ``usage`` counts calls · cache hits · tokens.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional

from composer.library import DATA, ROOT
from composer.llm import LLMError


class AppLLM:
    available = True

    def __init__(self, cache_dir: Optional[Path] = None, rpm: int = 36, concurrency: int = 6, cache: bool = True) -> None:
        cache_dir = Path(cache_dir or os.environ.get('WM_EVAL_CACHE') or (DATA / 'llm_cache_app'))
        cache_dir.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault('WINMATE_LLM_QUEUE_DB', str(cache_dir / 'eval-queue.sqlite'))  # not the live server's queue file
        os.environ.setdefault('WINMATE_LLM_RPM', str(rpm))
        os.environ.setdefault('WINMATE_LLM_CONCURRENCY', str(concurrency))
        os.environ['WINMATE_LLM_CACHE'] = 'off'
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        from app.api.poc.provider import get_provider
        from app.api.poc.settings import load_settings
        settings = load_settings()
        provider, reason = get_provider(settings)
        if provider is None:
            raise SystemExit(f'model provider unavailable: {reason}')
        self.p = provider
        self.model = getattr(provider, 'model', '')
        self.cache_dir = cache_dir / (self.model.replace('/', '_') or 'model')
        self.cache = cache and os.environ.get('WM_EVAL_NOCACHE', '') not in ('1', 'on', 'true')
        self.lock = threading.Lock()
        self.usage = {'calls': 0, 'cached': 0, 'failed': 0, 'repairs': 0, 'in_tokens': 0, 'out_tokens': 0, 'ms': 0, 'by_stage': {}}

    def fork(self) -> 'AppLLM':
        """same provider and cache, separate counters (one per deck)."""
        o = object.__new__(AppLLM)
        o.__dict__.update(self.__dict__)
        o.lock = threading.Lock()
        o.usage = {'calls': 0, 'cached': 0, 'failed': 0, 'repairs': 0, 'in_tokens': 0, 'out_tokens': 0, 'ms': 0, 'by_stage': {}}
        return o

    def json(self, *, stage: str, prompt: str, schema: dict, system: str = '', temperature: float = 0.2, validate: Optional[Callable[[Any], Any]] = None,
             max_tokens: int = 8192, seed: Optional[int] = None, images=None, model: Optional[str] = None) -> Any:
        text = prompt
        data = None
        problem: Any = True
        for attempt in range(2):
            data = self._one(stage, text, schema, system, temperature, max_tokens, seed, images, model)
            problem = validate(data) if validate else True
            if problem is True or problem is None:
                return data
            with self.lock:
                self.usage['repairs'] += 1
            text = prompt + '\n\n[이전 응답의 검증 오류]\n' + str(problem)[:1500] + '\n위 오류만 고친 JSON 전체를 다시 답하세요. 새 사실을 만들지 마세요.'
        err = LLMError('invalid_output', f'{stage}: {str(problem)[:300]}')
        err.last = data
        raise err

    def _one(self, stage, prompt, schema, system, temperature, max_tokens, seed, images, model):
        h = hashlib.sha256(json.dumps([model or self.model, system, prompt, schema, temperature, max_tokens, seed, [hashlib.sha256(i[1] if isinstance(i, tuple) else bytes(str(i), 'utf8')).hexdigest() for i in (images or [])]],
                                      ensure_ascii=False, sort_keys=True, default=str).encode('utf-8')).hexdigest()
        cp = self.cache_dir / h[:2] / (h + '.json')
        with self.lock:
            st = self.usage['by_stage'].setdefault(stage, {'calls': 0, 'cached': 0, 'in': 0, 'out': 0, 'ms': 0})
        if self.cache and cp.exists():
            with self.lock:
                self.usage['cached'] += 1
                st['cached'] += 1
            return json.loads(cp.read_text(encoding='utf-8'))
        t0 = time.time()
        try:
            r = self.p.generate_json(stage=f'compose-eval:{stage}', system=system, user=prompt, schema=schema, temperature=temperature,
                                     max_output_tokens=max_tokens, seed=seed, images=images, model=model, cache_allowed=False)
        except Exception as exc:  # noqa: BLE001
            with self.lock:
                self.usage['failed'] += 1
            raise LLMError(getattr(exc, 'code', 'failed'), str(exc)[:300]) from None
        ms = int((time.time() - t0) * 1000)
        with self.lock:
            self.usage['calls'] += 1
            self.usage['in_tokens'] += int(r.prompt_tokens or 0)
            self.usage['out_tokens'] += int(r.output_tokens or 0)
            self.usage['ms'] += ms
            st['calls'] += 1
            st['in'] += int(r.prompt_tokens or 0)
            st['out'] += int(r.output_tokens or 0)
            st['ms'] += ms
        if self.cache:
            cp.parent.mkdir(parents=True, exist_ok=True)
            cp.write_text(json.dumps(r.data, ensure_ascii=False), encoding='utf-8')
        return r.data
