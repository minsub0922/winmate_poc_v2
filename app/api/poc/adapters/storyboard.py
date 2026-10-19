"""Storyboard continuation (``sbagent.agent.design`` + ``to_app_parts``) over ``CanonicalStoryKB``.

``design()`` ignores ``options['mode']`` (continuation is implied by ``proposal.parts``); this adapter
implements ``redesign`` by clearing the non-deck parts before calling it.
"""
from __future__ import annotations

import copy
from typing import Any, List

from .. import imports, knowledge
from ..backends import ModeTracker, make_story_backend
from ..jobs import BadRequest, Job, Unavailable
from ..settings import Settings
from .common import Prepared, as_float, as_int, jsonable, resolve_mode

MODES = ('continue', 'redesign')
STRATEGIES = ('value', 'pain', 'space', 'roi', 'rfp', 'compete', 'land')


def prepare(body: dict, settings: Settings) -> Prepared:
    plan = resolve_mode(settings, 'storyboard', body)
    if not plan.run:
        return Prepared('storyboard', 'Storyboard', {}, None, plan)  # type: ignore[arg-type]
    pr = body.get('proposal', body.get('input'))
    if not isinstance(pr, dict):
        raise BadRequest('proposal(앱 제안서 객체)이 필요합니다.')
    for key, typ in (('req', dict), ('ctx', dict), ('parts', list)):
        if key in pr and pr[key] is not None and not isinstance(pr[key], typ):
            raise BadRequest(f'proposal.{key} 형식이 올바르지 않습니다.')
    mode = body.get('mode', 'continue')
    if mode not in MODES:
        raise BadRequest('mode 는 continue 또는 redesign 이어야 합니다.')
    strategy = body.get('strategy')
    if strategy is not None and strategy not in STRATEGIES:
        raise BadRequest(f'strategy 는 {", ".join(STRATEGIES)} 중 하나여야 합니다.')
    temperature = as_float(body, 'temperature', 0.4, 0.0, 1.0)
    seed = as_int(body, 'seed', 0, 0, 2 ** 31 - 1)
    try:
        knowledge.bundle()
    except knowledge.KnowledgeError as exc:
        raise Unavailable(str(exc), exc.code) from None
    params = {'mode': mode, 'strategy': strategy, 'temperature': temperature, 'seed': seed,
              'previous_parts': len([p for p in pr.get('parts') or [] if isinstance(p, dict) and not p.get('deck')]), 'requested_mode': plan.requested}
    title = str(pr.get('title') or pr.get('customer') or '제안서')[:80]
    return Prepared('storyboard', f'Storyboard · {title}', params,
                    lambda job: run(job, copy.deepcopy(pr), mode, strategy, temperature, seed, plan), plan)


def run(job: Job, pr: dict, mode: str, strategy: Any, temperature: float, seed: int, plan: Any) -> dict:
    S = imports.story()
    kbx = knowledge.story_kb()
    parts = [p for p in pr.get('parts') or [] if isinstance(p, dict)]
    if mode == 'redesign':
        parts = [p for p in parts if p.get('deck')]
    pr['parts'] = parts
    ctx = pr.get('ctx') or {}
    warnings: List[str] = []
    for key, table in (('products', kbx.P), ('solutions', kbx.S), ('cases', kbx.cases)):
        bad = [str(x) for x in ctx.get(key) or [] if str(x) not in table]
        if bad:
            warnings.append(f'카탈로그에 없는 {key} id(Storyboard 근거에서 제외됨): ' + ', '.join(bad[:10]))
    tracker = ModeTracker(plan.requested, plan.provider, plan.reason)
    backend = make_story_backend(plan.provider, tracker, job) if plan.provider is not None else S.llm.OfflineBackend()
    kept = len([p for p in parts if not p.get('deck') and p.get('type') != 'cover'])
    job.log(f"시작 — {mode} · 이전 파트 {kept}개 · " + ('LLM 설계 + 규칙 검증' if plan.provider is not None else f'규칙 설계 ({plan.reason})'))
    job.check_cancel()
    out = S.agent.design(pr, backend=backend, options={'strategy': strategy, 'temperature': temperature, 'seed': seed, 'mode': mode}, kbx=kbx)
    job.check_cancel()
    for step in out.get('trace', {}).get('steps', []):
        job.log(step)
    app_parts = S.agent.to_app_parts(out)
    llm = tracker.summary()
    if plan.provider is not None and not out.get('llm'):
        llm['effective'] = 'rules'
        llm['reason'] = llm.get('reason') or 'llm_design_failed'
    job.log(f"완료 — 새 파트 {len(app_parts)}개 · 남은 문제 {len(out.get('issues') or [])}개")
    return {'mode': mode, 'kept_parts': kept, 'storyboard': jsonable(out), 'app_parts': jsonable(app_parts), 'warnings': warnings, 'llm': llm}
