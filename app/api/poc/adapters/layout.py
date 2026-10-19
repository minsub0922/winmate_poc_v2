"""Layout Agent (``winmate_layout.graph``) — background run, strategy interrupt, locked resume.

``build_graph(kb, llm, index)`` and ``run_config`` always get the canonical KB view, the app LLM shim
and the TF-IDF index explicitly. Results are serialized from explicit public fields only;
``render.write_outputs`` is never called (no files are written).
"""
from __future__ import annotations

from typing import Any, Dict, List

from .. import imports, knowledge
from ..backends import ModeTracker, layout_llm_summary, make_layout_llm
from ..jobs import BadRequest, Job, Unavailable, Waiting
from ..settings import Settings
from .common import Prepared, as_bool, as_int, jsonable, resolve_mode

LEVELS = ('minimal', 'ambiguous', 'complex')
ANALYSIS_FIELDS = ('industry', 'industry_name', 'industry_source', 'industry_conf', 'req_type', 'strategy', 'context_level', 'level_label',
                   'level_reason', 'requirements', 'keymen', 'goals', 'facts', 'spaces', 'summary', 'signals', 'llm', 'dimensions',
                   'requested_items')
SCALAR = (str, int, float, bool, type(None))


def prepare(body: dict, settings: Settings) -> Prepared:
    plan = resolve_mode(settings, 'layout', body)
    if not plan.run:
        return Prepared('layout', '레이아웃', {}, None, plan)  # type: ignore[arg-type]
    L = imports.layout()
    raw = body.get('input')
    if not isinstance(raw, dict):
        raise BadRequest('input(ProposalInput 객체)이 필요합니다.')
    try:
        inp = L.schemas.ProposalInput.model_validate(raw).model_dump()
    except Exception as exc:  # pydantic.ValidationError
        errs = getattr(exc, 'errors', None)
        detail = '; '.join(f"{'.'.join(str(x) for x in e.get('loc', ()))}: {e.get('msg')}" for e in errs()[:6]) if callable(errs) else type(exc).__name__
        raise BadRequest(f'input 형식 오류 — {detail}') from None
    interactive = as_bool(body, 'interactive', True)
    max_slides = as_int(body, 'max_slides', None, 1, 60)
    if max_slides:
        inp['max_slides'] = max_slides
    force_level = body.get('force_level')
    if force_level is not None and force_level not in LEVELS:
        raise BadRequest(f'force_level 은 {", ".join(LEVELS)} 중 하나여야 합니다.')
    answers = body.get('answers')
    if answers is not None:
        answers = _clean_answers(answers, None)
    include_html = as_bool(body, 'include_html', False)
    try:
        knowledge.bundle()
    except knowledge.KnowledgeError as exc:
        raise Unavailable(str(exc), exc.code) from None
    options: Dict[str, Any] = {}
    if not interactive:
        options['auto_answer'] = True
    if answers is not None:
        options['answers'] = answers
    if force_level:
        options['force_level'] = force_level
    title = inp.get('title') or inp.get('customer') or '직접 입력'
    params = {'interactive': interactive, 'max_slides': max_slides, 'force_level': force_level, 'include_html': include_html,
              'products': len(inp.get('products') or []), 'requested_mode': plan.requested}
    return Prepared('layout', f'레이아웃 · {title}'[:120], params,
                    lambda job: start(job, inp, options, include_html, plan, settings), plan)


def start(job: Job, inp: dict, options: dict, include_html: bool, plan: Any, settings: Settings) -> Any:
    L = imports.layout()
    job.log('정본 KB · 검색 인덱스 준비')
    base_kb, index = knowledge.layout_assets(settings.kb_cache)
    job.check_cancel()
    wanted = list(inp.get('products') or [])
    warnings: List[str] = []
    unknown = [p for p in wanted if p not in base_kb.P]
    if unknown:
        warnings.append('카탈로그에 없는 제품 id(PoC 분석에서 제외됨): ' + ', '.join(unknown[:10]))
    for key, table in (('solutions', base_kb.S), ('cases', base_kb.C)):
        bad = [x for x in inp.get(key) or [] if str(x) not in table]
        if bad:
            warnings.append(f'카탈로그에 없는 {key} id(PoC 분석에서 제외됨): ' + ', '.join(map(str, bad[:10])))
    kb = base_kb.with_products(wanted)
    tracker = ModeTracker(plan.requested, plan.provider, plan.reason)
    llm = make_layout_llm(plan.provider, tracker, job)
    graph = L.graph.build_graph(kb, llm, index)
    cfg = L.graph.run_config(f'wm-{job.id}', llm)
    job.ctx.update(graph=graph, cfg=cfg, llm=llm, kb=kb, tracker=tracker, warnings=warnings, include_html=include_html)
    job.log('시작 — ' + (f'LLM {llm.model_name} + 규칙' if llm.online else f'규칙만 ({plan.reason})'))
    _stream(job, {'input': inp, 'options': options})
    return _after(job)


def resume_fn(job: Job) -> Any:
    L = imports.layout()
    answers = job.ctx.pop('resume_answers', {})
    job.log('답 반영 — ' + ', '.join(f'{k}={v}' for k, v in answers.items() if v)[:300])
    _stream(job, L.Command(resume=answers))
    return _after(job)


def validate_answers(job: Job, body: dict) -> None:
    """Runs under the job lock (JobManager.resume ``before``). Raises BadRequest on invalid answers."""
    if job.kind != 'layout' or 'graph' not in job.ctx:
        raise BadRequest('이 작업은 답을 받지 않습니다.', 'not_resumable')
    payload = job.waiting or {}
    questions = {q.get('id'): q for q in payload.get('questions') or [] if isinstance(q, dict)}
    answers = body.get('answers') or {}
    answers = _clean_answers(answers, questions)
    if body.get('use_defaults'):
        merged = {qid: str(q.get('default') or '') for qid, q in questions.items()}
        merged.update(answers)
        answers = merged
    job.ctx['resume_answers'] = answers


def _clean_answers(answers: Any, questions: Any) -> dict:
    if not isinstance(answers, dict):
        raise BadRequest('answers 는 {질문 id: 답} 객체여야 합니다.')
    if questions is not None:
        unknown = [k for k in answers if k not in questions]
        if unknown:
            raise BadRequest('알 수 없는 질문 id: ' + ', '.join(map(str, unknown[:8])))
    out = {}
    for k, v in answers.items():
        if not isinstance(v, SCALAR):
            raise BadRequest(f'{k} 의 답은 문자열 · 숫자여야 합니다.')
        s = '' if v is None else str(v)
        if len(s) > 2000:
            raise BadRequest(f'{k} 의 답이 너무 깁니다(2000자 이하).')
        out[str(k)] = s
    return out


def _stream(job: Job, payload: Any) -> None:
    graph, cfg = job.ctx['graph'], job.ctx['cfg']
    for upd in graph.stream(payload, config=cfg, stream_mode='updates'):
        job.check_cancel()
        for node, val in (upd or {}).items():
            if node == '__interrupt__':
                job.log('사용자 답을 기다립니다 — 전략 질문')
                continue
            info = ''
            if isinstance(val, dict) and val.get('log'):
                lg = val['log'][-1]
                info = ' · '.join(f'{k}={v}' for k, v in lg.items() if k != 'node' and v not in (None, ''))
            job.log(node + (f' — {info}' if info else ''))


def _after(job: Job) -> Any:
    graph, cfg = job.ctx['graph'], job.ctx['cfg']
    snap = graph.get_state(cfg)
    for task in snap.tasks or ():
        if task.interrupts:
            payload = jsonable(task.interrupts[0].value)
            return Waiting(payload=payload, partial=serialize(job, snap.values, partial=True))
    out = serialize(job, snap.values, partial=False)
    for warning in out['warnings']:
        job.log(warning, 'warn')
    job.log(f"완료 — 슬라이드 {len(out.get('slides') or [])}장 · LLM 호출 {out['llm']['calls_ok'] + out['llm']['calls_failed']}회")
    return out


def serialize(job: Job, st: dict, partial: bool) -> dict:
    L = imports.layout()
    kb, llm, tracker = job.ctx['kb'], job.ctx['llm'], job.ctx['tracker']
    a = st.get('analysis') or {}
    ctx = st.get('ctx') or {}
    out: Dict[str, Any] = {
        'partial': partial,
        'analysis': jsonable({k: a.get(k) for k in ANALYSIS_FIELDS}),
        'context': jsonable({
            **{k: ctx.get(k) for k in ('industry', 'industry_name', 'customer', 'project', 'target', 'spaces', 'missing_items')},
            'products': [{'id': p, 'model': kb.P[p]['model'], 'name': kb.P[p]['name']} for p in ctx.get('products', []) if p in kb.P],
            'solutions': [{'id': s, 'name': kb.S[s]['name']} for s in ctx.get('solutions', []) if s in kb.S],
            'cases': [{'id': c, 'cust': kb.C[c]['cust']} for c in ctx.get('cases', []) if c in kb.C],
            'recommended': {k: [x.get('id') for x in v if isinstance(x, dict)] for k, v in (ctx.get('recommended') or {}).items()},
        }) if ctx else None,
        'route': st.get('route'),
        'scenario_match': jsonable(st.get('scenario_match')),
        'decomposition': jsonable(st.get('decomposition')),
        'choice': jsonable(st.get('choice')),
        'nodes': jsonable(st.get('log') or []),
        'warnings': list(job.ctx.get('warnings') or []),
        'llm': layout_llm_summary(llm, tracker),
    }
    if partial:
        return out
    fills = L.graph.current_fills(st)
    slides_meta = {(s['part_id'], s['f'], s.get('pg', 0)): s for s in st.get('slides') or []}
    include_html = bool(job.ctx.get('include_html'))
    slides = []
    for f in fills:
        meta = slides_meta.get((f['part_id'], f['f'], f.get('pg', 0)), {})
        card = kb.cards.get(f['f']) or kb.lookup_layout(f['f']) or {}
        item = {'no': f['no'], 'f': f['f'], 'code': f.get('code'), 'part_id': f['part_id'], 'name': card.get('name', ''),
                'why': meta.get('why', []), 'alternates': [{'f': x.get('f'), 'code': x.get('code'), 'name': x.get('name')} for x in meta.get('alternates', [])],
                'checks': f.get('checks'), 'llm': f.get('llm'), 'texts': f.get('texts'), 'sources': f.get('sources')}
        if include_html:
            item['html'] = _slide_html(L, kb, f)
        slides.append(jsonable(item))
    out.update({
        'parts': jsonable(st.get('parts')), 'links': jsonable((st.get('links') or {}).get('links')),
        'uncovered': jsonable((st.get('links') or {}).get('uncovered')), 'review': jsonable(st.get('review')),
        'slides': slides, 'app_proposal': jsonable(L.render.to_app_proposal(st, fills)),
    })
    target = job.params.get('max_slides')
    if target and len(slides) > target:
        out['warnings'].append(f'장수 목표 {target}장보다 많은 {len(slides)}장입니다. 원본 PoC는 표지·마무리·필수 요구 파트를 유지하므로 장수 목표를 초과할 수 있습니다.')
    return out


def _slide_html(L: Any, kb: Any, fill: dict) -> str:
    texts = {int(k): v for k, v in (fill.get('texts') or {}).items()}
    imgs = {}
    for k, v in (fill.get('images') or {}).items():
        f = v.get('file') or ''
        imgs[int(k)] = {'src': ('/' + f) if f.startswith('img/') else '', 'label': v.get('label', ''), 'fit': v.get('fit', 'cover')}
    return L.slots.render_filled(kb.html[fill['f']], texts, page_no=fill.get('no'), img_fills=imgs)
