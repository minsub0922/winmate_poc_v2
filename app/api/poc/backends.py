"""Shims that plug the app provider into the unmodified PoC backends.

Each shim keeps the reviewed PoC contract:

* ``AppRfpBackend(rp.Backend)``: ``complete(stage, system, user, meta)``; ``rp.SCHEMAS[stage]``; output
  caps profile 2048 · consolidate 8192 · extract/gapfill 12288 (32768 when ``meta['single']``);
  temperature 0.1; ``rp.CallLog`` in ``self.calls``. Profile/extract/gapfill failures fall back to
  ``rp.RulesBackend`` for that stage (explicitly recorded); consolidate failures raise
  ``rp.BackendError`` so ``run_pipeline`` applies its own rule consolidation (``stats.consolidate_fallback``).
* ``AppScoreBackend(proposal_score.llm.Backend)``: ``complete(stage, system, user, schema, meta=None,
  temperature=None)``; default temperature 0.0; max 8192; ``CallLog.tag`` from ``meta['tag']``;
  failures raise ``proposal_score.llm.BackendError`` (what scorer/router catch).
* ``AppStoryBackend(sbagent.llm.Backend)``: keyword-only ``schema/temperature/seed/max_tokens``;
  failures raise ``sbagent.llm.BackendError``.
* ``AppLayoutLLM(winmate_layout.llm.LLM)``: constructed offline (no PoC credential path), then given a
  LangChain-shaped facade over the provider so the PoC ``structured()`` logic (structured output →
  JSON-text fallback → ``None`` → rules, with ``trace``) runs unchanged.
"""
from __future__ import annotations

import threading
import time
from types import SimpleNamespace
from typing import Any, Callable, Dict, List, Optional

from . import imports
from .jobs import Job, JobCancelled
from .provider import GenerationResult, ProviderError, gemini_schema_from_model


class ModeTracker:
    """Accumulates what actually ran. ``effective`` is derived from successful model calls only."""

    def __init__(self, requested: str, provider: Any = None, reason: str = '') -> None:
        self.requested = requested
        self.provider_name = getattr(provider, 'name', None) if provider is not None else None
        self.model = getattr(provider, 'model', None) if provider is not None else None
        self.reason = reason
        self._lock = threading.Lock()
        self.ok = 0
        self.failed = 0
        self.cached = 0
        self.prompt_tokens = 0
        self.output_tokens = 0
        self.fallbacks: List[dict] = []
        self.errors: Dict[str, int] = {}

    def record_ok(self, result: GenerationResult) -> None:
        with self._lock:
            self.ok += 1
            self.cached += int(result.cached)
            self.prompt_tokens += result.prompt_tokens
            self.output_tokens += result.output_tokens

    def record_fail(self, step: str, error: ProviderError | str, fallback: str = 'rules') -> None:
        code = error.code if isinstance(error, ProviderError) else 'error'
        message = error.message if isinstance(error, ProviderError) else str(error)[:300]
        with self._lock:
            self.failed += 1
            self.errors[code] = self.errors.get(code, 0) + 1
            if fallback:
                self.fallbacks.append({'step': step, 'fallback': fallback, 'code': code, 'message': message})

    def note_fallback(self, step: str, fallback: str, reason: str) -> None:
        with self._lock:
            self.fallbacks.append({'step': step, 'fallback': fallback, 'code': 'fallback', 'message': reason[:300]})

    def summary(self, **extra: Any) -> dict:
        with self._lock:
            if self.provider_name is None:
                effective = 'rules'
            elif self.ok and not self.failed and not self.fallbacks:
                effective = 'llm'
            elif self.ok:
                effective = 'mixed'
            else:
                effective = 'rules'
            out = {'requested': self.requested, 'effective': effective, 'provider': self.provider_name, 'model': self.model if self.ok else None,
                   'llm_used': self.ok > 0, 'calls_ok': self.ok, 'calls_failed': self.failed, 'cached': self.cached,
                   'tokens': {'prompt': self.prompt_tokens, 'output': self.output_tokens}, 'fallbacks': list(self.fallbacks),
                   'errors': dict(self.errors), 'reason': self.reason or None}
        out.update(extra)
        return out


def _cancel_check(job: Optional[Job]) -> Callable[[], bool]:
    return (lambda: job.cancelled()) if job is not None else (lambda: False)


# ---------------------------------------------------------------- RFP
def make_rfp_backend(provider: Any, tracker: ModeTracker, job: Optional[Job] = None, on_call: Optional[Callable[[str, dict], None]] = None) -> Any:
    rp = imports.rfp()

    class AppRfpBackend(rp.Backend):
        name = 'app'

        def __init__(self) -> None:
            super().__init__()
            self.rules = rp.RulesBackend()

        def _rules(self, stage: str, system: str, user: str, meta: dict) -> Any:
            out = self.rules.complete(stage, system, user, meta)
            self.calls.append(rp.CallLog(stage, f'rules-{len(self.calls)}', 0))
            return out

        def complete(self, stage, system, user, meta):
            if job is not None:
                job.check_cancel()
            if on_call:
                on_call(stage, meta)
            if provider is None:
                return self._rules(stage, system, user, meta)
            cap = {'profile': 2048, 'consolidate': 8192}.get(stage, 32768 if meta.get('single') else 12288)
            t0 = time.time()
            try:
                res = provider.generate_json(stage=f'rfp:{stage}', system=system, user=user, schema=rp.SCHEMAS[stage], temperature=0.1,
                                             max_output_tokens=cap, cancel=_cancel_check(job))
                if not isinstance(res.data, dict):
                    raise ProviderError('invalid_json', 'JSON 객체가 아닌 응답')
            except ProviderError as exc:
                if exc.code == 'cancelled' and job is not None:
                    raise JobCancelled() from None
                self.calls.append(rp.CallLog(stage, stage, int((time.time() - t0) * 1000), error=exc.message or exc.code))
                if stage == 'consolidate':
                    tracker.record_fail(f'rfp:{stage}', exc, fallback='rules (PoC RulesBackend._consolidate)')
                    raise rp.BackendError(f'Gemini 호출 실패 ({stage}): {exc.code}') from None
                tracker.record_fail(f'rfp:{stage}' + (f"#{meta.get('idx')}" if meta.get('idx') is not None else ''), exc, fallback='rules')
                return self._rules(stage, system, user, meta)
            tracker.record_ok(res)
            self.calls.append(rp.CallLog(stage, stage, res.ms, res.prompt_tokens, res.output_tokens, cached=res.cached))
            return res.data

    return AppRfpBackend()


# ---------------------------------------------------------------- proposal_score
def make_score_backend(provider: Any, tracker: ModeTracker, job: Optional[Job] = None) -> Any:
    ps = imports.score()
    llm = ps.llm

    class AppScoreBackend(llm.Backend):
        name = 'app'
        online = True

        def __init__(self) -> None:
            super().__init__()
            self.model = getattr(provider, 'model', 'app')

        def complete(self, stage, system, user, schema, meta=None, temperature=None):
            if job is not None:
                job.check_cancel()
            tag = (meta or {}).get('tag', '')
            temp = 0.0 if temperature is None else temperature
            t0 = time.time()
            try:
                res = provider.generate_json(stage=f'score:{stage}', system=system, user=user, schema=schema, temperature=temp,
                                             max_output_tokens=8192, cancel=_cancel_check(job))
            except ProviderError as exc:
                if exc.code == 'cancelled' and job is not None:
                    raise JobCancelled() from None
                self.log(llm.CallLog(stage, stage, int((time.time() - t0) * 1000), error=exc.message or exc.code, tag=tag))
                tracker.record_fail(f'score:{stage}:{tag}', exc, fallback='rules (PoC rule route / rule_score)')
                raise llm.BackendError(f'Gemini 호출 실패 ({stage}): {exc.code}') from None
            tracker.record_ok(res)
            self.log(llm.CallLog(stage, stage, res.ms, res.prompt_tokens, res.output_tokens, cached=res.cached, tag=tag))
            return res.data

    return AppScoreBackend()


# ---------------------------------------------------------------- storyboard
def make_story_backend(provider: Any, tracker: ModeTracker, job: Optional[Job] = None) -> Any:
    sb = imports.story().llm

    class AppStoryBackend(sb.Backend):
        name = 'app'
        online = True

        def complete(self, stage, system, user, *, schema=None, temperature=0.4, seed=0, max_tokens=8192):
            if job is not None:
                job.check_cancel()
            t0 = time.time()
            try:
                res = provider.generate_json(stage=f'storyboard:{stage}', system=system or '', user=user, schema=schema, temperature=temperature,
                                             max_output_tokens=max_tokens, seed=seed, cancel=_cancel_check(job))
                if not isinstance(res.data, dict):
                    raise ProviderError('invalid_json', 'JSON 객체가 아닌 응답')
            except ProviderError as exc:
                if exc.code == 'cancelled' and job is not None:
                    raise JobCancelled() from None
                self._log(sb.Call(stage, int((time.time() - t0) * 1000), error=exc.message or exc.code))
                tracker.record_fail(f'storyboard:{stage}', exc, fallback='rules' if stage == 'design' else 'keep previous draft')
                raise sb.BackendError(f'Gemini 호출 실패 ({stage}): {exc.code}') from None
            tracker.record_ok(res)
            self._log(sb.Call(stage, res.ms, res.prompt_tokens, res.output_tokens, cached=res.cached))
            return res.data

    return AppStoryBackend()


# ---------------------------------------------------------------- layout
class _StructuredCall:
    def __init__(self, chat: '_ProviderChat', schema: Any) -> None:
        self.chat, self.schema = chat, schema

    def invoke(self, messages: List[tuple]) -> Any:
        system, user = _split(messages)
        res = self.chat.provider.generate_json(stage=f'layout:{self.schema.__name__}', system=system, user=user,
                                               schema=gemini_schema_from_model(self.schema), temperature=self.chat.llm.temperature,
                                               max_output_tokens=self.chat.max_tokens, cancel=self.chat.cancel)
        self.chat.tracker.record_ok(res)
        return self.schema.model_validate(res.data)


class _ProviderChat:
    """Minimal LangChain-shaped facade: ``with_structured_output(schema).invoke(msgs)`` and ``invoke(msgs).content``."""

    def __init__(self, provider: Any, llm: Any, tracker: ModeTracker, job: Optional[Job], max_tokens: int) -> None:
        self.provider, self.llm, self.tracker, self.max_tokens = provider, llm, tracker, max_tokens
        self.cancel = _cancel_check(job)

    def with_structured_output(self, schema: Any) -> _StructuredCall:
        return _StructuredCall(self, schema)

    def invoke(self, messages: List[tuple]) -> Any:
        system, user = _split(messages)
        res = self.provider.generate_text(stage='layout:json-fallback', system=system, user=user, temperature=self.llm.temperature,
                                          max_output_tokens=self.max_tokens, json_mode=True, cancel=self.cancel)
        self.tracker.record_ok(res)
        return SimpleNamespace(content=res.text)


def _split(messages: List[tuple]) -> tuple[str, str]:
    system = '\n'.join(str(c) for r, c in messages if r == 'system')
    user = '\n'.join(str(c) for r, c in messages if r != 'system')
    return system, user


def make_layout_llm(provider: Any, tracker: ModeTracker, job: Optional[Job] = None, temperature: float = 0.2, max_tokens: int = 8192) -> Any:
    L = imports.layout()

    class AppLayoutLLM(L.llm.LLM):
        def __init__(self) -> None:
            super().__init__('offline', temperature=temperature)  # never builds the PoC ChatGoogleGenerativeAI
            self._provider = provider
            if provider is not None and getattr(provider, 'available', False):
                self.mode = 'gemini'
                self.model_name = provider.model
                self._chat = _ProviderChat(provider, self, tracker, job, max_tokens)
            else:
                self.disabled_reason = tracker.reason or 'provider_unavailable'

        @property
        def chat_model(self):  # tool-calling model for a future copilot — provider-owned
            return self._provider.chat_model(self.temperature) if self._provider is not None else None

    return AppLayoutLLM()


def layout_llm_summary(llm: Any, tracker: ModeTracker) -> dict:
    """Effective mode from the PoC trace (``structured`` swallows errors and returns None → rules)."""
    trace = list(getattr(llm, 'trace', []) or [])
    ok = [t for t in trace if t.get('ok')]
    failed = [t for t in trace if not t.get('ok')]
    if not getattr(llm, 'online', False):
        effective = 'rules'
    elif ok and not failed:
        effective = 'llm'
    elif ok:
        effective = 'mixed'
    else:
        effective = 'rules'
    fallbacks = [{'step': t.get('tag'), 'fallback': 'rules', 'code': 'llm_failed', 'message': str(t.get('err', ''))[:300]} for t in failed]
    base = tracker.summary()
    base.update({'effective': effective, 'llm_used': bool(ok), 'calls_ok': len(ok), 'calls_failed': len(failed), 'fallbacks': fallbacks,
                 'model': getattr(llm, 'model_name', None) if ok else None,
                 'note': 'Layout Agent 는 규칙 결과에 LLM 결과를 병합합니다. LLM 단계가 실패하면 그 단계만 규칙 결과를 씁니다.',
                 'json_fallback_calls': sum(1 for t in ok if t.get('note') == 'fallback-json')})
    return base
