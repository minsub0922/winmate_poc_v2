"""Scenario Composer job (``kind: compose``) — Best-Scenario-grounded Storyboard over the app provider.

    step 'parts'    proposal (storyboardPayload) → recommended parts [{type, name, items, src}] (src = 샘플 버티컬 시나리오 module)
    step 'layouts'  proposal + chosen parts [{id, type, name, items, src?}] → the same parts with layouts filled (ov.t · ov.img)
    step 'auto'     레이아웃 자동 구성 — proposal + template + parts (each with the template slides ``exemplar``) + space_plan →
                    an orchestrator plans the whole deck (event ``plan``), then every part is composed in parallel and
                    streamed back (events ``part`` started / done / error). See ``composer/auto.py``.

Settings for ``auto`` (process environment > root ``.env``): ``WINMATE_COMPOSE_WORKERS`` parts composed at once (1–8, default 4) ·
``WINMATE_COMPOSE_VERIFY`` picture verification pass (on | off, default on).

The composer (``poc/test/scenario_composer``) is imported read-only; its library is built from the canonical KB into
``app/data/runtime/composer`` (never under poc/). Every judgement is a Gemini call through the app provider (queue ·
retries · usage); a failed call fails the job — no rule result is substituted.
"""
from __future__ import annotations

import contextvars
import copy
import importlib.util
import os
import sys
import threading
from typing import Any, List, Optional

from ... import runtime_env
from .. import knowledge
from .. import market_research
from .. import subscription_addon
from ..imports import POC_TEST, RUNTIME_DIR
from ..jobs import BadRequest, Job, JobCancelled, Unavailable
from ..provider import ProviderError
from ..settings import Settings
from ..strict import failure, from_provider
from .common import Prepared, jsonable, requirement_context, resolve_mode

STEPS = ('parts', 'layouts', 'auto')
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
        from ..layout_library import install
        install(library)
        try:
            library.ensure()
        except Exception as exc:  # noqa: BLE001
            raise Unavailable(f'샘플 버티컬 시나리오 라이브러리를 만들지 못했습니다: {type(exc).__name__}: {str(exc)[:200]}', 'kb_missing') from None
        return context, library, llm, pipeline


def _auto(*, grounded=False):
    """the template-driven composer module (no library build — request validation only needs the code)."""
    with _LOCK:
        os.environ.setdefault('WM_COMPOSER_DATA', str(RUNTIME_DIR / 'composer'))
        os.environ.setdefault('WM_COMPOSER_KB', str(RUNTIME_DIR / 'kb'))
        sys.dont_write_bytecode = True
        if str(COMPOSER_DIR) not in sys.path:
            sys.path.append(str(COMPOSER_DIR))
        from composer import auto  # noqa: WPS433 — read-only PoC import
        from composer import library
        from ..layout_library import install
        if grounded:
            # The app pipeline owns its hooks. Keep the imported historical
            # engine and its reference tests unchanged, including concurrent
            # legacy composition requests.
            name = 'composer.app_grounded_auto'
            if name not in sys.modules:
                spec = importlib.util.spec_from_file_location(name, auto.__file__)
                module = importlib.util.module_from_spec(spec)
                sys.modules[name] = module
                spec.loader.exec_module(module)
            auto = sys.modules[name]
        install(library, auto)
        if grounded:
            from ..compose_grounding import install as install_grounding
            from ..layout_flows import install as install_flows
            install_grounding(auto)
            install_flows(auto)  # admin 레이아웃 관리 → 입력 · 흐름 (장별 지시 · 입력 · 모듈)
            from ..part_orchestrator import install as install_orchestrator
            install_orchestrator(auto)  # 파트 orchestrator — 장마다 파트 지시 → 장의 흐름 → 파트 검토 · 다시 쓰기
            from ..item_mask import install as install_mask
            install_mask(auto)  # 프롬프트에 제품 코드 · (그 솔루션 장이 아니면) 솔루션 이름 없음 — 표식으로 묻고 이름으로 돌려받음
        return auto


def auto_settings() -> dict:
    """WINMATE_COMPOSE_WORKERS (1–8, default 4) · WINMATE_COMPOSE_VERIFY (on|off, default on) — environment > root .env."""
    env = runtime_env.env_values()
    try:
        workers = max(1, min(8, int(str(env.get('WINMATE_COMPOSE_WORKERS') or '4').strip())))
    except ValueError:
        workers = 4
    verify = str(env.get('WINMATE_COMPOSE_VERIFY') or 'on').strip().lower() not in ('off', '0', 'false', 'no')
    return {'workers': workers, 'verify': verify}


def _auto_body(body: dict) -> dict:
    """validated, size-capped request of step ``auto`` (the composer validates the same way when it runs)."""
    auto = _auto()
    try:
        parts = auto.clean_parts(body.get('parts'))
        auto.clean_space_plan(body.get('space_plan'))
    except ValueError as exc:
        raise BadRequest(str(exc)) from None
    tpl = body.get('template')
    if tpl is not None and not isinstance(tpl, dict):
        raise BadRequest('template 형식이 올바르지 않습니다.')
    requirement_context(body)  # shape and size of the saved requirement summary (422 when malformed)
    if sum(len(p['exemplar']) for p in parts) > 160:
        raise BadRequest('exemplar 장이 너무 많습니다(전체 160장 이하).')
    for p in body['parts']:
        pool = p.get('layout_candidates', [])
        if not isinstance(pool, list) or len(pool) > 160 or any(not isinstance(f, str) or not f or len(f) > 80 for f in pool):
            raise BadRequest('layout_candidates는 해당 파트의 레이아웃 ID 목록(160개 이하)이어야 합니다.')
    if len({p['id'] for p in parts if p['deck']}) > 1:
        raise BadRequest('표지 파트(deck)는 하나여야 합니다.')
    market = body.get('market')
    if market is not None and (not isinstance(market, dict) or not isinstance(market.get('sheets'), list) or len(market['sheets']) > 12):
        raise BadRequest('market.sheets 는 업종 트렌드 장 견본 목록(12개 이하)이어야 합니다.')
    pics = body.get('used_pictures')
    if pics is not None and (not isinstance(pics, list) or len(pics) > 800 or not all(isinstance(x, str) and len(x) <= 600 for x in pics)):
        raise BadRequest('used_pictures 는 사진 주소 목록(800개 이하)이어야 합니다.')
    from ... import layout_flows
    try:  # values by source key (admin 레이아웃 관리 → 입력 소스), e.g. refined KPIs · schedule — see GET /api/layout-flows
        layout_inputs = layout_flows.clean_layout_inputs(body.get('layout_inputs'))
    except ValueError as exc:
        raise BadRequest(str(exc)) from None
    return {'template': {k: str(v)[:300] for k, v in (tpl or {}).items() if isinstance(v, (str, int))}, 'parts': body.get('parts'),
            'space_plan': body.get('space_plan'), 'requirement_context': body.get('requirement_context'), 'used_layouts': body.get('used_layouts') or [],
            'used_pictures': pics or [], 'market': market, 'layout_inputs': layout_inputs}


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
        raise BadRequest('step 은 parts · layouts · auto 중 하나여야 합니다.')
    pr = body.get('proposal')
    if not isinstance(pr, dict):
        raise BadRequest('proposal(앱 제안서 객체)이 필요합니다.')
    parts = _parts(body.get('parts')) if step == 'layouts' else None
    used = body.get('used_layouts') or []
    if not isinstance(used, list) or any(not isinstance(f, str) for f in used) or len(used) > 400:
        raise BadRequest('used_layouts 는 레이아웃 ID 목록이어야 합니다.')
    auto_body = _auto_body(body) if step == 'auto' else None
    try:
        knowledge.bundle()
    except knowledge.KnowledgeError as exc:
        raise Unavailable(str(exc), exc.code) from None
    title = str(pr.get('title') or pr.get('customer') or '제안서')[:80]
    if step == 'auto':
        params = {'step': step, 'parts': len(auto_body['parts']), 'template': (auto_body['template'] or {}).get('id') or '', 'requested_mode': plan.requested}
        frozen = copy.deepcopy(auto_body)
        return Prepared('compose', f'레이아웃 자동 구성 · {title}', params, lambda job: run_auto(job, copy.deepcopy(pr), frozen, plan, settings=settings), plan)
    params = {'step': step, 'parts': len(parts or []), 'requested_mode': plan.requested}
    label = '샘플 버티컬 시나리오 목차 추천' if step == 'parts' else '샘플 버티컬 시나리오 장표 완성'
    return Prepared('compose', f'{label} · {title}', params,
                    lambda job: run(job, copy.deepcopy(pr), step, parts, list(dict.fromkeys(used)), body.get('analysis'), str(body.get('thesis') or '')[:200], plan),
                    plan)


class _InJobScope:
    """The provider as seen from the composer's own worker threads (parts · market research), which start without the
    job's context: every call re-enters it, so model usage stays with the requesting account and this job."""

    def __init__(self, provider: Any) -> None:
        self._provider, self._context = provider, contextvars.copy_context()

    def __getattr__(self, name: str) -> Any:
        value = getattr(self._provider, name)
        if not callable(value):
            return value
        return lambda *args, **kwargs: self._context.copy().run(value, *args, **kwargs)


def run_auto(job: Job, pr: dict, body: dict, plan: Any, *, engine=None, settings: Optional[Settings] = None) -> dict:
    """레이아웃 자동 구성: plan (event ``plan``) → parts in parallel (events ``part``) → {step, thesis, plan, app_parts, failed, llm}."""
    _composer()  # library present (built from the KB when missing)
    auto = engine or _auto(grounded=True)
    from composer import llm as llm_mod  # noqa: WPS433
    calls = {'n': 0}
    lock = threading.Lock()

    def on_call(stage: str) -> None:
        with lock:
            calls['n'] += 1
        job.log(f'AI 판단 — {stage}')

    provider = _InJobScope(plan.provider)
    llm = llm_mod.AppProviderLLM(provider, cancel=job.check_cancel, on_call=on_call)
    # the decision-capable nodes of the layout flows (layout.cells · layout.verify · layout.pictures — app/api/poc/layout_decide.py):
    # with the decision branch on, the decision model answers them (bound to this job: cancel · usage records); otherwise none is set
    if settings is not None:
        from .. import layout_decide
        from ..backends import ModeTracker, job_decision
        tracker = ModeTracker('real', plan.provider)
        found = layout_decide.attach(llm, settings, wrap=lambda client, task: job_decision(client, tracker, job, 'compose:'))
        if found:
            job.log('판단형 단계 — Decision 모델: ' + ' · '.join(found))
    cfg = auto_settings()
    job.log(f"시작 — 원문·DSS 추출 → 파트별 계획 → 기본 흐름/레이아웃 선별 → 장별 채움·검수(파트 동시 {cfg['workers']}개)")
    # 업종 트렌드 장: 실제 웹 검색으로 검증한 시장 근거로 종류를 고르고 값을 채운다(market_research.py). 검색을 쓸 수 없으면 템플릿의 자리표시 그대로 둔다.
    searchable, why = market_research.available(plan.provider)
    if not searchable:
        job.log('시장 자료 검색 사용 안 함 — ' + market_research.REASON_TEXT.get(why, why) + ' 업종 트렌드 장의 값은 자리표시로 남습니다.', 'warn')

    def research(spec: dict, want: list) -> dict:
        return market_research.trend_sheets(spec, want, provider, cancel=job.check_cancel, log=job.log)
    try:
        out = auto.run_auto(pr, body, llm, emit=job.emit, log=job.log, check_cancel=job.check_cancel, workers=cfg['workers'], verify=cfg['verify'],
                            market=research if searchable else None)
    except JobCancelled:
        raise
    except ProviderError as exc:
        raise from_provider('compose:auto', exc) from None
    except Exception as exc:  # noqa: BLE001
        if getattr(exc, 'code', '') == 'invalid_output':  # the plan broke its contract twice — a model failure, not a server bug
            raise failure('invalid_output', 'compose:auto:plan', str(exc)[:300]) from None
        raise
    if not calls['n']:
        raise failure('no_model_call', 'compose:auto', '레이아웃 자동 구성이 AI 결과가 아닙니다.')
    # Why Samsung is the template's own pages and needs no model: a job in which every part the model writes failed is still a failure
    done = {p['id'] for p in out['app_parts']}
    written = [p['id'] for p in body['parts'] if isinstance(p, dict) and p.get('id') not in set(out.get('fixed_parts') or [])]
    if not out['app_parts'] or (written and not any(i in done for i in written)):
        raise failure('incomplete_output', 'compose:auto', '모든 파트 구성이 실패했습니다.')
    n = sum(len(p['layouts']) for p in out['app_parts'])
    job.log(f"완료 — 파트 {len(out['app_parts'])}개 · 장표 {n}장" + (f" · 실패 {len(out['failed'])}개" if out['failed'] else ''))
    pl = out['plan']
    analysis = {'industry': pr.get('ind'), 'vertical': (body.get('template') or {}).get('vertical') or None, 'spaces': [x['name'] for x in pl.get('spaces') or []],
                'needs': [x['text'] for x in pl.get('points') or []], 'storyline': pl.get('storyline')}
    return jsonable({'step': 'auto', 'analysis': analysis, 'thesis': out['thesis'], 'plan': pl, 'app_parts': out['app_parts'], 'failed': out['failed'],
                     'repeatable': out['repeatable'], 'ms': out['ms'], 'plan_ms': out.get('plan_ms'), 'validation': out.get('validation'),
                     'llm': {'calls_ok': calls['n'], 'effective': 'llm', 'model': llm.model, 'usage': llm.usage}})


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
