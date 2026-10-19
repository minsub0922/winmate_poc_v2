"""RFP text → customer requirement forms (``poc/test/rfp_pipeline.run_pipeline``).

Input is already-extracted text (the browser's ``domain/review/parse.js`` handles PPTX/PDF/DOCX/TXT).
The PoC chunker works best on markdown (``#`` headings, ``Ⅰ.``, ``[붙임]``, markdown tables); plain PDF
text is chunked by size only. Tavily enrichment is not offered (no extra external calls).

Strict: every stage (profile · extract · gapfill · consolidate) is a real Gemini call. A failed stage ends the
job with ``ModelFailure`` — the PoC rule consolidation (``stats.consolidate_fallback``) is unreachable because
the backend never raises ``rp.BackendError``; the result is still checked for it.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from .. import imports
from ..backends import ModeTracker, make_rfp_backend
from ..jobs import BadRequest, Job
from ..settings import Settings
from ..strict import failure, invalid_output
from .common import Prepared, as_int, jsonable, resolve_mode

CONDS = ('single', 'chunk_nocarry', 'chunk_carry', 'chunk_carry_gap')
MAX_TEXT = 400_000


def prepare(body: dict, settings: Settings) -> Prepared:
    plan = resolve_mode(settings, 'rfp', body)
    text = body.get('text')
    if text is None and isinstance(body.get('input'), dict):
        text = body['input'].get('text')
    if not isinstance(text, str):
        raise BadRequest('text(추출한 RFP 원문 문자열)가 필요합니다.')
    text = text.replace('\r\n', '\n').strip()
    if len(text) < 50:
        raise BadRequest('원문이 너무 짧습니다(50자 이상).')
    if len(text) > MAX_TEXT:
        raise BadRequest(f'원문이 너무 깁니다({MAX_TEXT:,}자 이하).')
    if body.get('enrich'):
        raise BadRequest('enrich(Tavily 출처 수집)는 이 서버에서 지원하지 않습니다.', 'unsupported')
    cond = body.get('condition', 'chunk_carry_gap')
    if cond not in CONDS:
        raise BadRequest(f'condition 은 {", ".join(CONDS)} 중 하나여야 합니다.')
    max_chars = len(text) if cond == 'single' else as_int(body, 'max_chars', 1500, 500, 12000)
    title = str(body.get('title') or '')[:120]
    params = {'condition': cond, 'max_chars': max_chars, 'chars': len(text), 'title': title, 'requested_mode': plan.requested}
    return Prepared('rfp', f'RFP 정리 · {title or f"{len(text):,}자"}', params, lambda job: run(job, text, cond, max_chars, title, plan), plan)


def run(job: Job, text: str, cond: str, max_chars: int, title: str, plan: Any) -> dict:
    rp = imports.rfp()
    tracker = ModeTracker('real', plan.provider)
    job.ctx['tracker'] = tracker

    def on_call(stage: str, meta: dict) -> None:
        idx = meta.get('idx')
        proj = meta.get('project') if stage == 'consolidate' else None
        job.log(stage + (f' · 조각 {idx + 1}' if isinstance(idx, int) else '') + (f" · 사업 {proj.get('name', '')}" if isinstance(proj, dict) else ''))

    backend = make_rfp_backend(plan.provider, tracker, job, on_call)
    job.log(f'시작 — {cond}@{max_chars} · {len(text):,}자 · Gemini {plan.provider.model} (규칙 대체 없음)')
    t0 = time.time()
    res = rp.run_pipeline(text, backend, rp.RunConfig(condition=cond, max_chars=max_chars, enrich=False))
    job.check_cancel()
    calls = backend.calls
    consolidate_fb = [{'pid': f.get('pid'), 'reason': f['stats'].get('consolidate_fallback')} for f in res.forms if (f.get('stats') or {}).get('consolidate_fallback')]
    if consolidate_fb:  # unreachable with the strict backend — guard against a PoC change
        raise invalid_output('rfp:consolidate', '규칙 통합 대체가 감지되었습니다: ' + str(consolidate_fb[0].get('reason'))[:120])
    if tracker.ok == 0 or 'rfp:profile' not in tracker.steps:
        raise failure('no_model_call', 'rfp:profile', 'Gemini 호출 기록이 없습니다.')
    if res.forms and 'rfp:consolidate' not in tracker.steps:
        raise failure('no_model_call', 'rfp:consolidate', '통합 단계 Gemini 호출 기록이 없습니다.')
    forms = []
    for f in res.forms:
        form = jsonable(f)
        form['layout_input'] = to_layout_input(f, text, title)
        forms.append(form)
    job.log(f"완료 — 항목 {len(res.items)}개 · 사업 {len(res.forms)}개 · Gemini 호출 {tracker.ok}회")
    return {
        'meta': {'condition': cond, 'max_chars': max_chars, 'chars': len(text), 'prompt_version': getattr(rp, 'PROMPT_VERSION', ''),
                 'seconds': round(time.time() - t0, 1)},
        'profile': jsonable(res.profile), 'chunks': jsonable(res.chunks), 'items': jsonable(res.items), 'forms': forms,
        'trace': jsonable(res.trace), 'guards': jsonable(res.guards),
        'calls': {'total': len(calls), 'cached': sum(1 for c in calls if c.cached), 'errors': [c.error for c in calls if c.error][:20],
                  'prompt_tokens': sum(c.prompt_tokens for c in calls), 'output_tokens': sum(c.output_tokens for c in calls)},
        'llm': tracker.summary(consolidate_fallback=consolidate_fb),
    }


def to_layout_input(form: dict, source: str = '', title: str = '') -> dict:
    """Requirement form → Layout Agent ``ProposalInput`` (same mapping as testbench, collision-free id)."""
    return {
        'id': 'rfp_' + uuid.uuid4().hex[:10], 'title': title or form.get('project', ''), 'customer': form.get('customer', ''),
        'project': form.get('project', ''), 'target': form.get('target', ''), 'free_text': form.get('free', ''), 'note': form.get('note', ''),
        'keymen': [{'name': k.get('name', ''), 'weight': k.get('weight', 0), 'reqs': list(k.get('reqs', []))} for k in form.get('keymen', [])],
        'files': [{'name': 'RFP 원문.md', 'text': source[:30000]}] if source else [],
    }
