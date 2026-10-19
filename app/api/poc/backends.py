"""Strict shims that plug the app Gemini provider into the unmodified PoC backends.

Strict real-only policy: a failed model step is never replaced by a rule result. Every shim raises
:class:`~app.api.poc.jobs.ModelFailure` (built by :mod:`.strict`) instead of the PoC ``BackendError``, so the
original PoC ``except BackendError`` fallbacks (RFP rule consolidation, score ``rules-fallback``, router
``_route_rules``, storyboard ``rules_plan``) can no longer be reached. No ``RulesBackend`` /
``OfflineBackend`` is instantiated.

* ``AppRfpBackend(rp.Backend)``: ``complete(stage, system, user, meta)``; ``rp.SCHEMAS[stage]``; output caps
  profile 2048 · consolidate 8192 · extract/gapfill 12288 (32768 when ``meta['single']``); temperature 0.1;
  ``rp.CallLog`` in ``self.calls``.
* ``AppScoreBackend(proposal_score.llm.Backend)``: ``complete(stage, system, user, schema, meta=None,
  temperature=None)``; temperature 0.0; max 8192; ``CallLog.tag``. Output is validated before the PoC sees
  it (score: every requested criterion with a 1–3 score; route: parseable communities/priorities) with one
  bounded re-ask, so the PoC never reaches its ``rules-fallback`` branches.
* ``AppStoryBackend(sbagent.llm.Backend)``: keyword-only ``schema/temperature/seed/max_tokens``.
* ``AppLayoutLLM(winmate_layout.llm.LLM)``: constructed offline (no PoC credential path), then given a
  LangChain-shaped facade over the provider. ``structured()`` keeps the PoC sequence (structured output →
  one plain-JSON re-ask) but raises instead of returning ``None`` (which would select the rule result).
"""
from __future__ import annotations

import json
import re
import threading
import time
from types import SimpleNamespace
from typing import Any, Callable, Dict, List, Optional

from . import imports
from .jobs import Job, JobCancelled, ModelFailure
from .provider import GenerationResult, ProviderError, gemini_schema_from_model, parse_json
from .strict import failure, from_provider, invalid_output

# provider codes after which one plain-JSON re-ask can still produce a valid model answer (PoC structured())
_JSON_RETRY = ('schema_rejected', 'invalid_json', 'max_tokens', 'empty', 'bad_request')


class ModeTracker:
    """Counts what actually ran. ``effective`` is ``'llm'`` only when real model calls succeeded."""

    def __init__(self, requested: str = 'real', provider: Any = None, reason: str = '') -> None:
        self.requested = 'real'
        self.provider_name = getattr(provider, 'name', None) if provider is not None else None
        self.model = getattr(provider, 'model', None) if provider is not None else None
        self.reason = reason
        self._lock = threading.Lock()
        self.ok = 0
        self.failed = 0
        self.rejected = 0
        self.cached = 0
        self.prompt_tokens = 0
        self.output_tokens = 0
        self.models: set = set()
        self.steps: Dict[str, int] = {}
        self.errors: Dict[str, int] = {}
        self.issues: List[dict] = []

    def record_ok(self, result: GenerationResult, step: str = '') -> None:
        with self._lock:
            self.ok += 1
            self.cached += int(result.cached)
            self.prompt_tokens += result.prompt_tokens
            self.output_tokens += result.output_tokens
            if result.model:
                self.models.add(result.model)
            if step:
                self.steps[step] = self.steps.get(step, 0) + 1

    def record_fail(self, step: str, error: Any) -> None:
        """A model call that raised (after provider retries)."""
        code = error.code if isinstance(error, (ProviderError, ModelFailure)) else 'error'
        message = error.message if isinstance(error, (ProviderError, ModelFailure)) else str(error)[:300]
        with self._lock:
            self.failed += 1
            self.errors[code] = self.errors.get(code, 0) + 1
            self.issues.append({'step': step, 'code': code, 'message': str(message)[:300]})

    def record_rejected(self, step: str, reason: str) -> None:
        """A call that returned but whose output failed validation (re-asked or turned into an error)."""
        with self._lock:
            self.rejected += 1
            self.errors['invalid_output'] = self.errors.get('invalid_output', 0) + 1
            self.issues.append({'step': step, 'code': 'invalid_output', 'message': reason[:300]})

    def summary(self, status: str = 'done', **extra: Any) -> dict:
        with self._lock:
            if status == 'done':
                effective = 'llm' if self.ok else 'none'
            else:
                effective = status  # error | cancelled
            out = {'requested': 'real', 'effective': effective, 'strict': True, 'provider': self.provider_name,
                   'model': (sorted(self.models)[0] if len(self.models) == 1 else sorted(self.models)) if self.models else None,
                   'llm_used': self.ok > 0, 'calls_ok': self.ok, 'calls_failed': self.failed, 'calls_rejected': self.rejected,
                   'cached': self.cached, 'tokens': {'prompt': self.prompt_tokens, 'output': self.output_tokens},
                   'steps': dict(self.steps), 'fallbacks': [], 'errors': dict(self.errors), 'issues': list(self.issues[-20:]),
                   'reason': self.reason or None}
        out.update(extra)
        return out


def _cancel_check(job: Optional[Job]) -> Callable[[], bool]:
    return (lambda: job.cancelled()) if job is not None else (lambda: False)


def _require(provider: Any, step: str) -> None:
    if provider is None or not getattr(provider, 'available', False):
        raise failure('no_api_key', step)


def _provider_failed(tracker: ModeTracker, step: str, exc: ProviderError, job: Optional[Job]) -> Exception:
    if exc.code == 'cancelled':
        return JobCancelled()
    tracker.record_fail(step, exc)
    return from_provider(step, exc)


# ---------------------------------------------------------------- RFP
def make_rfp_backend(provider: Any, tracker: ModeTracker, job: Optional[Job] = None, on_call: Optional[Callable[[str, dict], None]] = None) -> Any:
    rp = imports.rfp()
    _require(provider, 'rfp')

    class AppRfpBackend(rp.Backend):
        name = 'gemini'

        def complete(self, stage, system, user, meta):
            if job is not None:
                job.check_cancel()
            if on_call:
                on_call(stage, meta)
            step = f'rfp:{stage}' + (f"#{meta.get('idx')}" if meta.get('idx') is not None else '')
            cap = {'profile': 2048, 'consolidate': 8192}.get(stage, 32768 if meta.get('single') else 12288)
            t0 = time.time()
            try:
                res = provider.generate_json(stage=f'rfp:{stage}', system=system, user=user, schema=rp.SCHEMAS[stage], temperature=0.1,
                                             max_output_tokens=cap, cancel=_cancel_check(job))
            except ProviderError as exc:
                self.calls.append(rp.CallLog(stage, stage, int((time.time() - t0) * 1000), error=exc.code))
                raise _provider_failed(tracker, step, exc, job) from None
            tracker.record_ok(res, f'rfp:{stage}')
            self.calls.append(rp.CallLog(stage, stage, res.ms, res.prompt_tokens, res.output_tokens, cached=res.cached))
            if not isinstance(res.data, dict):
                tracker.record_rejected(step, 'JSON 객체가 아닌 응답')
                raise invalid_output(step, 'JSON 객체가 아닌 응답')
            return res.data

    return AppRfpBackend()


# ---------------------------------------------------------------- proposal_score
_SCORE_IDS = re.compile(r'위\s*\d+\s*개 기준\(([^)]*)\)\s*모두에 대해 scores')


def _score_problem(data: Any, expected: List[str]) -> str:
    """Mirror of ``scorer.score_group`` parsing: every requested id needs an integer 1–3 score."""
    if not isinstance(data, dict) or not isinstance(data.get('scores'), list):
        return 'scores 목록이 없음'
    got = set()
    for x in data['scores']:
        if not isinstance(x, dict) or not x.get('id'):
            continue
        cid = str(x.get('id', '')).strip().split()[0] if str(x.get('id', '')).strip() else ''
        try:
            ok = int(x.get('score')) in (1, 2, 3)
            for e in x.get('evidence') or []:  # scorer does int(e['sheet'] or 0) without a guard
                if isinstance(e, dict):
                    int(e.get('sheet') or 0)
        except (TypeError, ValueError):
            ok = False
        if cid in expected and ok:
            got.add(cid)
    missing = [i for i in expected if i not in got]
    return ('채점이 빠진 기준: ' + ', '.join(missing[:10])) if missing else ''


def _route_problem(stage: str, data: Any) -> str:
    """Mirror of ``router._route_llm`` parsing (``int(relevance)`` / ``int(priority)``)."""
    if not isinstance(data, dict) or not isinstance(data.get('communities'), list) or not data['communities']:
        return 'communities 목록이 비어 있음'
    try:
        for x in data['communities']:
            int(x['relevance'])
            str(x['id'])
        if stage == 'route_l2':
            for x in data.get('criteria') or []:
                int(x['priority'])
                str(x['id'])
    except (KeyError, TypeError, ValueError) as exc:
        return f'형식 오류: {type(exc).__name__}'
    return ''


def make_score_backend(provider: Any, tracker: ModeTracker, job: Optional[Job] = None, max_asks: int = 2) -> Any:
    ps = imports.score()
    llm = ps.llm
    _require(provider, 'review')

    class AppScoreBackend(llm.Backend):
        name = 'gemini'
        online = True

        def __init__(self) -> None:
            super().__init__()
            self.model = getattr(provider, 'model', 'gemini')

        def complete(self, stage, system, user, schema, meta=None, temperature=None):
            tag = (meta or {}).get('tag', '')
            step = f'review:{stage}' + (f':{tag.split(":", 1)[1]}' if ':' in tag else '')
            temp = 0.0 if temperature is None else temperature
            m = _SCORE_IDS.search(user or '') if stage == 'score' else None
            expected = [x.strip() for x in m.group(1).split(',') if x.strip()] if m else []
            problem = ''
            for _ in range(max(1, max_asks)):
                if job is not None:
                    job.check_cancel()
                t0 = time.time()
                try:
                    res = provider.generate_json(stage=f'score:{stage}', system=system, user=user, schema=schema, temperature=temp,
                                                 max_output_tokens=8192, cancel=_cancel_check(job))
                except ProviderError as exc:
                    self.log(llm.CallLog(stage, stage, int((time.time() - t0) * 1000), error=exc.code, tag=tag))
                    raise _provider_failed(tracker, step, exc, job) from None
                tracker.record_ok(res, f'review:{stage}')
                self.log(llm.CallLog(stage, stage, res.ms, res.prompt_tokens, res.output_tokens, cached=res.cached, tag=tag))
                if stage == 'score' and expected:
                    problem = _score_problem(res.data, expected)
                elif stage in ('route_l1', 'route_l2'):
                    problem = _route_problem(stage, res.data)
                else:
                    problem = '' if isinstance(res.data, dict) else 'JSON 객체가 아닌 응답'
                if not problem:
                    return res.data
                tracker.record_rejected(step, problem)
            raise invalid_output(step, problem, 'incomplete_output' if stage == 'score' else 'invalid_output')

    return AppScoreBackend()


# ---------------------------------------------------------------- storyboard
def make_story_backend(provider: Any, tracker: ModeTracker, job: Optional[Job] = None) -> Any:
    sb = imports.story().llm
    _require(provider, 'storyboard')

    class AppStoryBackend(sb.Backend):
        name = 'gemini'
        online = True

        def complete(self, stage, system, user, *, schema=None, temperature=0.4, seed=0, max_tokens=8192):
            if job is not None:
                job.check_cancel()
            step = f'storyboard:{stage}'
            t0 = time.time()
            try:
                res = provider.generate_json(stage=f'storyboard:{stage}', system=system or '', user=user, schema=schema, temperature=temperature,
                                             max_output_tokens=max_tokens, seed=seed, cancel=_cancel_check(job))
            except ProviderError as exc:
                self._log(sb.Call(stage, int((time.time() - t0) * 1000), error=exc.code))
                raise _provider_failed(tracker, step, exc, job) from None
            tracker.record_ok(res, step)
            self._log(sb.Call(stage, res.ms, res.prompt_tokens, res.output_tokens, cached=res.cached))
            if not isinstance(res.data, dict):
                tracker.record_rejected(step, 'JSON 객체가 아닌 응답')
                raise invalid_output(step, 'JSON 객체가 아닌 응답')
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
        self.chat.tracker.record_ok(res, f'layout:{self.schema.__name__}')
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
        res = self.provider.generate_text(stage='layout:json-reask', system=system, user=user, temperature=self.llm.temperature,
                                          max_output_tokens=self.max_tokens, json_mode=True, cancel=self.cancel)
        self.tracker.record_ok(res, 'layout:json-reask')
        return SimpleNamespace(content=res.text)


def _split(messages: List[tuple]) -> tuple[str, str]:
    system = '\n'.join(str(c) for r, c in messages if r == 'system')
    user = '\n'.join(str(c) for r, c in messages if r != 'system')
    return system, user


def make_layout_llm(provider: Any, tracker: ModeTracker, job: Optional[Job] = None, temperature: float = 0.2, max_tokens: int = 8192) -> Any:
    L = imports.layout()
    _require(provider, 'layout')
    from pydantic import ValidationError  # PoC dependency (winmate_layout.schemas)

    class AppLayoutLLM(L.llm.LLM):
        def __init__(self) -> None:
            super().__init__('offline', temperature=temperature)  # never builds the PoC ChatGoogleGenerativeAI
            self._provider = provider
            self.mode = 'gemini'
            self.model_name = provider.model
            self._chat = _ProviderChat(provider, self, tracker, job, max_tokens)

        @property
        def chat_model(self):  # tool-calling model for a future copilot — provider-owned
            return self._provider.chat_model(self.temperature)

        def structured(self, schema, system, user, *, tag):
            """PoC sequence (structured → one plain-JSON re-ask) but strict: failure raises, never ``None``."""
            step = f'layout:{tag}'
            t0 = time.time()
            first = ''
            try:
                out = self._chat.with_structured_output(schema).invoke([('system', system), ('human', user)])
                self._log(tag, True, t0)
                return out
            except ProviderError as exc:
                if exc.code == 'cancelled':
                    raise JobCancelled() from None
                tracker.record_fail(step, exc)
                if exc.code not in _JSON_RETRY:
                    self._log(tag, False, t0, err=exc.code)
                    raise from_provider(step, exc) from None
                first = exc.code
            except (ValidationError, ValueError, TypeError) as exc:
                tracker.record_rejected(step, f'{type(exc).__name__}: {str(exc)[:160]}')
                first = 'invalid_output'
            try:
                raw = self._chat.invoke([('system', system + '\n\nJSON 객체 하나만 답하세요. 스키마:\n' + json.dumps(schema.model_json_schema(), ensure_ascii=False)),
                                         ('human', user)])
                value = schema.model_validate(parse_json(raw.content))
                self._log(tag, True, t0, note='fallback-json')
                return value
            except ProviderError as exc:
                if exc.code == 'cancelled':
                    raise JobCancelled() from None
                self._log(tag, False, t0, err=f'{first} | {exc.code}')
                raise _provider_failed(tracker, step, exc, job) from None
            except (ValidationError, ValueError, TypeError) as exc:
                detail = f'{type(exc).__name__}: {str(exc)[:160]}'
                tracker.record_rejected(step, detail)
                self._log(tag, False, t0, err=f'{first} | {detail}')
                raise invalid_output(step, detail) from None

    return AppLayoutLLM()


def layout_llm_summary(llm: Any, tracker: ModeTracker, status: str = 'done') -> dict:
    """Call counts from the provider tracker plus the PoC ``trace`` (every LLM node's tag)."""
    trace = list(getattr(llm, 'trace', []) or [])
    ok = [t for t in trace if t.get('ok')]
    base = tracker.summary(status=status)
    base.update({'nodes_ok': [t.get('tag') for t in ok][:60], 'nodes_failed': [t.get('tag') for t in trace if not t.get('ok')][:20],
                 'json_reask_ok': sum(1 for t in ok if t.get('note') == 'fallback-json'),
                 'note': 'Layout Agent 의 모든 LLM 노드는 실제 Gemini 결과만 씁니다. 실패하면 작업이 error 로 끝납니다(규칙 대체 없음).'})
    return base
