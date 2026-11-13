"""Scenario Composer job (``kind: compose``) — Best-Scenario-grounded Storyboard over the app provider.

    step 'parts'    proposal (storyboardPayload) → recommended parts [{type, name, items, src}] (src = 샘플 버티컬 시나리오 module)
    step 'layouts'  proposal + chosen parts [{id, type, name, items, src?}] → the same parts with layouts filled (ov.t · ov.img)

The composer (``poc/test/scenario_composer``) is imported read-only; its library is built from the canonical KB into
``app/data/runtime/composer`` (never under poc/). Every judgement is a Gemini call through the app provider (queue ·
retries · usage); a failed call fails the job — no rule result is substituted.
"""
from __future__ import annotations

import copy
import os
import sys
import threading
from typing import Any, List, Optional

from .. import knowledge
from .. import subscription_addon
from ..imports import POC_TEST, RUNTIME_DIR
from ..jobs import BadRequest, Job, Unavailable
from ..settings import Settings
from ..strict import failure
from .common import Prepared, jsonable, resolve_mode

STEPS = ('parts', 'layouts')
COMPOSER_DIR = POC_TEST / 'scenario_composer'
_LOCK = threading.Lock()


def _composer():
    with _LOCK:
        os.environ.setdefault('WM_COMPOSER_DATA', str(RUNTIME_DIR / 'composer'))
        os.environ.setdefault('WM_COMPOSER_KB', str(RUNTIME_DIR / 'kb'))
        sys.dont_write_bytecode = True
        if str(COMPOSER_DIR) not in sys.path:
            sys.path.append(str(COMPOSER_DIR))
        from composer import context, library, llm, pipeline  # noqa: WPS433 — read-only PoC import
        try:
            library.ensure()
        except Exception as exc:  # noqa: BLE001
            raise Unavailable(f'샘플 버티컬 시나리오 라이브러리를 만들지 못했습니다: {type(exc).__name__}: {str(exc)[:200]}', 'kb_missing') from None
        return context, library, llm, pipeline


def _parts(raw: Any) -> List[dict]:
    if not isinstance(raw, list) or not raw or len(raw) > 30:
        raise BadRequest('parts 는 1~30개 목차 목록이어야 합니다.')
    out = []
    for p in raw:
        if not isinstance(p, dict):
            raise BadRequest('parts 항목 형식이 올바르지 않습니다.')
        items = [str(x)[:120] for x in (p.get('items') or []) if str(x).strip()][:8]
        out.append({'id': str(p.get('id') or ''), 'type': str(p.get('type') or 'free'), 'name': str(p.get('name') or '')[:60], 'items': items,
                    'src': str(p['src']) if p.get('src') else None, 'deck': bool(p.get('deck'))})
    return out


def prepare(body: dict, settings: Settings) -> Prepared:
    plan = resolve_mode(settings, 'storyboard', body)
    step = body.get('step', 'parts')
    if step not in STEPS:
        raise BadRequest('step 은 parts 또는 layouts 여야 합니다.')
    pr = body.get('proposal')
    if not isinstance(pr, dict):
        raise BadRequest('proposal(앱 제안서 객체)이 필요합니다.')
    parts = _parts(body.get('parts')) if step == 'layouts' else None
    used = body.get('used_layouts') or []
    if not isinstance(used, list) or any(not isinstance(f, str) for f in used):
        raise BadRequest('used_layouts 는 레이아웃 ID 목록이어야 합니다.')
    try:
        knowledge.bundle()
    except knowledge.KnowledgeError as exc:
        raise Unavailable(str(exc), exc.code) from None
    title = str(pr.get('title') or pr.get('customer') or '제안서')[:80]
    params = {'step': step, 'parts': len(parts or []), 'requested_mode': plan.requested}
    label = '샘플 버티컬 시나리오 목차 추천' if step == 'parts' else '샘플 버티컬 시나리오 장표 완성'
    return Prepared('compose', f'{label} · {title}', params,
                    lambda job: run(job, copy.deepcopy(pr), step, parts, list(dict.fromkeys(used)), body.get('analysis'), str(body.get('thesis') or '')[:200], plan),
                    plan)


def run(job: Job, pr: dict, step: str, parts: Optional[List[dict]], used: List[str], analysis: Any, thesis: str, plan: Any) -> dict:
    context, library, llm_mod, pipeline = _composer()
    calls = {'n': 0}

    def on_call(stage: str) -> None:
        calls['n'] += 1
        job.log(f'AI 판단 — {stage}')

    llm = llm_mod.AppProviderLLM(plan.provider, cancel=job.check_cancel, on_call=on_call)
    inp = context.from_app_proposal(pr)
    if step == 'parts':
        job.log('시작 — 고객 상황 판정 → 샘플 버티컬 시나리오 후보 → 뼈대 선택 → 목차 이름')
        rec = pipeline.recommend(inp, llm)
        if not calls['n']:
            raise failure('no_model_call', 'compose:parts', '목차 추천이 AI 결과가 아닙니다.')
        sl = rec['storyline']
        parts = [{k: p.get(k) for k in ('type', 'name', 'items', 'src', 'deck')} for p in rec['parts']]
        # 고객 요구에 구독 요구가 있는데 뼈대에 구독 목차가 없으면 '구독 솔루션 제안'만 더한다(출처 = 구독 솔루션이 포함된 샘플 덱의 그 목차)
        board = [p for p in pr.get('parts') or [] if isinstance(p, dict) and not p.get('deck')]
        src = subscription_addon.module_src(library.load(), (rec.get('analysis') or {}).get('industry'))
        parts, added = subscription_addon.add(parts, board, pr, src=src)
        if added:
            job.log(f"요구사항의 구독 요구({added['why']})로 '구독 솔루션 제안' 목차를 더함")
        job.log(f"완료 — 뼈대 {sl['base']} · 목차 {len([p for p in parts if not p.get('deck')])}개")
        return jsonable({'step': 'parts', 'analysis': rec['analysis'], 'storyline': sl, 'thesis': rec['thesis'], 'parts': parts,
                         'addons': [dict(added, id='sub')] if added else [],
                         'llm': {'calls_ok': calls['n'], 'effective': 'llm', 'model': llm.model}})
    a = analysis if isinstance(analysis, dict) and analysis.get('industry') else None
    job.log(f'시작 — 목차 {len(parts)}개의 레이아웃 구성 · 문구 · 사진')
    out = pipeline.complete(inp, parts, llm, analysis=a, thesis=thesis, used_layouts=used, workers=2)
    if not calls['n']:
        raise failure('no_model_call', 'compose:layouts', '장표 완성이 AI 결과가 아닙니다.')
    app_parts = out['app_parts']
    for src, dst in zip(parts, app_parts):
        dst['id'] = src.get('id') or ''
    n = sum(len(p['layouts']) for p in app_parts)
    job.log(f'완료 — 장표 {n}장')
    return jsonable({'step': 'layouts', 'analysis': out['analysis'], 'app_parts': app_parts,
                     'llm': {'calls_ok': calls['n'], 'effective': 'llm', 'model': llm.model}})
