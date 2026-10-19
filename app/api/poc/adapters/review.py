"""Proposal review with ``proposal_score.pipeline.evaluate``.

Two inputs:

* ``proposal`` — the PoC scenario shape (``sheets`` with measured text boxes, as produced by
  ``tools/export_entry.jsx:readSheet``); passed to ``proposal.from_scenario`` after validation.
* ``doc`` — the browser parser output (``app/web/src/domain/review/parse.js`` ``parseFiles``), converted
  here to ``Sheet`` geometry. PPTX boxes carry real positions and font sizes; PDF/DOCX/TXT units have no
  box geometry, so their positions are *approximate* (reading order) and this is reported, together with
  the criteria whose automatic checks become unreliable. Nothing is filled in silently.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from .. import imports, knowledge
from ..backends import ModeTracker, make_score_backend
from ..jobs import BadRequest, Job, Unavailable
from ..settings import Settings
from .common import Prepared, as_float, as_int, jsonable, resolve_mode, str_list

W, H = 1280.0, 720.0
FOOTER_Y = 660
MAX_UNITS = 120
# app/web/src/domain/proposals/parts.js NAME_RULES (classifyPart) — ported verbatim for part inference
NAME_RULES = [
    ('competition', r'경쟁'), ('why', r'(?i)why|삼성|강점|지원 체계'), ('market', r'(?i)시장|트렌드|\bmi\b|market'), ('customer', r'고객사|비즈니스|운영 과제|사업 현황'),
    ('user', r'사용자|이해관계자|여정|페르소나|손님'), ('insight', r'시사점|제안 방향|인사이트'), ('challenge', r'(?i)과제|문제|페인|pain|이슈'),
    ('effect', r'(?i)효과|roi|kpi|회수|절감'), ('value', r'(?i)가치|value|vp|키 ?메시지|key message'), ('dss', r'(?i)dss|공간 맵|공간별 제품 매칭|매칭'),
    ('bom', r'(?i)수량|구성표|물량|bom'), ('products', r'제품|라인업|공간별 제품'), ('scenario', r'시나리오|동선|하루|장면'),
    ('birdseye', r'조감도|시안|도면|렌더|평면'), ('solution', r'솔루션|구성도|시스템|플랫폼'), ('case', r'(?i)사례|레퍼런스|reference'),
    ('spec', r'(?i)스펙|사양|spec'), ('execution', r'실행|일정|로드맵|설치|교육|유지보수|파일럿|추진'), ('cost', r'(?i)비용|가격|tco|구매|견적'),
    ('cover', r'표지|목차|간지'), ('closing', r'마무리|다음 단계|결정 요청|연락처'), ('appendix', r'(?i)부록|출처|용어|q&a|예상 질문'),
    ('overview', r'(?i)요약|개요|summary'), ('requirements', r'(?i)요구|rfp'),
]
META_KEYS = ('req', 'req_label', 'ind', 'ind_name', 'strategy', 'strategy_label', 'strategy_desc', 'ending', 'ending_label', 'minutes', 'std',
             'situation', 'thesis', 'logic', 'diff', 'tone', 'messages', 'short')


def classify_part(name: str) -> Optional[str]:
    s = (name or '').strip()
    for key, rx in NAME_RULES:
        if re.search(rx, s):
            return key
    return None


def prepare(body: dict, settings: Settings) -> Prepared:
    plan = resolve_mode(settings, 'review', body)
    if not plan.run:
        return Prepared('review', '제안서 검토', {}, None, plan)  # type: ignore[arg-type]
    proposal, doc = body.get('proposal'), body.get('doc')
    if (proposal is None) == (doc is None):
        raise BadRequest('proposal(sheets 형태) 또는 doc(parse.js 결과) 중 하나만 보내 주세요.')
    context = body.get('context') or {}
    if not isinstance(context, dict):
        raise BadRequest('context 는 객체여야 합니다.')
    budget = as_int(body, 'budget', 12, 4, 30)
    min_k = as_int(body, 'min_k', 10, 1, 30)
    temperature = as_float(body, 'temperature', None, 0.0, 1.0)
    if proposal is not None:
        scenario, conversion = scenario_from_sheets(proposal, context)
    else:
        scenario, conversion = scenario_from_doc(doc, context)
    try:
        knowledge.bundle()
    except knowledge.KnowledgeError as exc:
        raise Unavailable(str(exc), exc.code) from None
    params = {'source': conversion['source'], 'sheets': conversion['sheets'], 'budget': budget, 'min_k': min_k, 'requested_mode': plan.requested}
    title = str(scenario.get('title') or '제안서')[:80]
    return Prepared('review', f'제안서 검토 · {title}', params, lambda job: run(job, scenario, conversion, budget, min_k, temperature, plan), plan)


def run(job: Job, scenario: dict, conversion: dict, budget: int, min_k: int, temperature: Optional[float], plan: Any) -> dict:
    ps = imports.score()
    cs, tax, _ = knowledge.score_assets()
    p = ps.proposal.from_scenario(scenario)
    catalog = knowledge.score_catalog_for(p.all_text())
    tracker = ModeTracker(plan.requested, plan.provider, plan.reason)
    backend = make_score_backend(plan.provider, tracker, job) if plan.provider is not None else None
    ctx = ps.pipeline.Context(backend=backend, cs=cs, tax=tax, catalog=catalog, others=[], budget=budget, min_k=min_k, temperature=temperature)
    job.log(f"평가 시작 — {p.n}장 · " + ('LLM 라우팅 · 채점 + 규칙 대체' if backend is not None else f'규칙 점검만 ({plan.reason})'))
    job.check_cancel()
    out = ps.pipeline.evaluate(p, ctx)
    job.check_cancel()
    score_modes = Counter(s.get('mode') for s in out.get('scores', []))
    route_mode = (out.get('route') or {}).get('mode')
    llm = tracker.summary(route_mode=route_mode, score_modes=dict(score_modes))
    if backend is not None and llm['effective'] == 'llm' and (route_mode != 'llm' or any(m != 'llm' for m in score_modes)):
        llm['effective'] = 'mixed'
    agg = out.get('aggregate') or {}
    job.log(f"완료 — 총점 {agg.get('total')} · {agg.get('verdict')} · 채점 {agg.get('n_scored')}개")
    return {'evaluation': jsonable(out), 'conversion': conversion, 'llm': llm}


# ---------------------------------------------------------------- input conversion
def _meta(context: dict, title: str) -> dict:
    meta = {k: context.get(k) for k in META_KEYS if context.get(k) is not None}
    meta['signals'] = str_list(context.get('signals'), 'context.signals', 100)
    meta['criteria'] = str_list(context.get('criteria'), 'context.criteria', 100)
    stages = context.get('stages')
    meta['stages'] = stages if isinstance(stages, list) else []
    aud = context.get('audience')
    meta['audience'] = aud if isinstance(aud, dict) else {}
    return {'id': str(context.get('id') or 'upload')[:60], 'title': str(context.get('title') or title or '제안서')[:200],
            'customer': str(context.get('customer') or '')[:120], **meta}


def scenario_from_sheets(proposal: Any, context: dict) -> Tuple[dict, dict]:
    if not isinstance(proposal, dict) or not isinstance(proposal.get('sheets'), list) or not proposal['sheets']:
        raise BadRequest('proposal.sheets(측정한 장 목록)가 필요합니다.')
    if len(proposal['sheets']) > MAX_UNITS:
        raise BadRequest(f'장 수가 너무 많습니다({MAX_UNITS}장 이하).')
    for s in proposal['sheets']:
        if isinstance(s, dict) and s.get('missing'):
            continue  # from_scenario drops these
        if not isinstance(s, dict) or not isinstance(s.get('n'), int) or not isinstance(s.get('f'), str) or not isinstance(s.get('texts', []), list):
            raise BadRequest('sheets 항목에는 n(정수) · f(문자열) · texts(목록)가 필요합니다.')
        for t in s.get('texts', []):
            if not isinstance(t, dict) or not isinstance(t.get('text', ''), str) or not all(isinstance(t.get(k), (int, float)) for k in ('x', 'y')) \
                    or not isinstance(t.get('tb'), (int, float, type(None))):
                raise BadRequest('texts 항목에는 text · x · y(숫자) · tb 가 필요합니다.')
    base = _meta({**{k: proposal.get(k) for k in ('id', 'title', 'customer', *META_KEYS, 'signals', 'criteria', 'stages', 'audience')
                      if proposal.get(k) is not None}, **context}, proposal.get('title', ''))
    scenario = {**base, 'sheets': proposal['sheets']}
    for key in ('app_profile', 'app_applicable', 'app_rules'):
        if isinstance(proposal.get(key), dict):
            scenario[key] = proposal[key]
    return scenario, {'source': 'sheets', 'sheets': len(proposal['sheets']), 'geometry': 'measured', 'font_sizes': 'known',
                      'overflow_measured': True, 'unreliable_criteria': []}


def _overlaps(boxes: List[dict]) -> List[list]:
    out = []
    for i in range(len(boxes)):
        a = boxes[i]
        for j in range(i + 1, len(boxes)):
            b = boxes[j]
            ix = max(0.0, min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x']))
            iy = max(0.0, min(a['y'] + a['h'], b['y'] + b['h']) - max(a['y'], b['y']))
            small = min(a['w'] * a['h'], b['w'] * b['h'])
            if small > 0 and ix * iy > 0.15 * small:
                out.append([a['tb'], b['tb']])
    return out


def scenario_from_doc(doc: Any, context: dict) -> Tuple[dict, dict]:
    if not isinstance(doc, dict) or not isinstance(doc.get('units'), list) or not doc['units']:
        raise BadRequest('doc.units(parse.js 결과)가 필요합니다.')
    kind = str(doc.get('kind') or '')
    units = [u for u in doc['units'] if isinstance(u, dict)]
    hidden = [u for u in units if u.get('hidden')]
    units = [u for u in units if not u.get('hidden')]
    if not units:
        raise BadRequest('보이는 장이 없습니다.')
    if len(units) > MAX_UNITS:
        raise BadRequest(f'장 수가 너무 많습니다({MAX_UNITS}장 이하).')
    slide_wpt = doc.get('slideWpt') if isinstance(doc.get('slideWpt'), (int, float)) and doc.get('slideWpt') else 960.0
    pt_px = W / float(slide_wpt)
    sheets: List[dict] = []
    approx = fonts_missing = fonts_known = 0
    for u in units:
        n = len(sheets) + 1
        title = str(u.get('title') or '')
        boxes = [b for b in u.get('boxes') or [] if isinstance(b, dict)]
        text_boxes = [b for b in boxes if b.get('text')]
        texts: List[dict] = []
        images: List[dict] = []
        overlaps: List[list] = []
        photo_first = False
        if text_boxes:
            geo = []
            for i, b in enumerate(text_boxes):
                x, y = float(b.get('x') or 0) * W, float(b.get('y') or 0) * H
                w, h = float(b.get('w') or 0) * W, float(b.get('h') or 0) * H
                mx, mn = b.get('max'), b.get('min')
                px = float(mx) * pt_px if isinstance(mx, (int, float)) and mx else 0.0
                min_px = float(mn) * pt_px if isinstance(mn, (int, float)) and mn else px
                fonts_known += bool(px)
                fonts_missing += not px
                outside = x < -12 or y < -12 or x + w > W + 12 or y + h > H + 12
                texts.append({'tb': i, 'text': str(b['text']), 'x': round(x, 1), 'y': round(y, 1), 'w': round(w, 1), 'h': round(h, 1),
                              'px': round(px, 1), 'min_px': round(min_px, 1), 'max_px': round(px, 1), 'weight': 400, 'overflow': False, 'outside': outside})
                geo.append({'tb': i, 'x': x, 'y': y, 'w': w, 'h': h})
            overlaps = _overlaps(geo)
            pics = [b for b in boxes if b.get('kind') == 'pic']
            images = [{'filled': True, 'name': str(b.get('name') or ''), 'w': round(float(b.get('w') or 0) * W), 'h': round(float(b.get('h') or 0) * H)} for b in pics]
            photo_first = sum(float(b.get('w') or 0) * float(b.get('h') or 0) for b in pics) >= 0.3
        else:
            approx += 1
            lines = [ln.strip() for ln in str(u.get('text') or '').split('\n') if ln.strip()]
            sizes = u.get('lineSizes') if isinstance(u.get('lineSizes'), list) and len(u.get('lineSizes')) == len(lines) else None
            unit_min = u.get('minFont') if isinstance(u.get('minFont'), (int, float)) else None
            step = 600.0 / max(1, len(lines))
            for i, line in enumerate(lines):
                size = sizes[i][0] if sizes and isinstance(sizes[i], list) and sizes[i] and isinstance(sizes[i][0], (int, float)) else None
                px = float(size) * (W / 960.0) if size else (float(unit_min) * (W / 960.0) if unit_min and kind == 'pdf' else (float(unit_min) * 4 / 3 if unit_min else 0.0))
                fonts_known += bool(px)
                fonts_missing += not px
                texts.append({'tb': i, 'text': line, 'x': 64.0, 'y': round(40 + i * step, 1), 'px': round(px, 1), 'min_px': round(px, 1),
                              'max_px': round(px, 1), 'weight': 400, 'overflow': False, 'outside': False, 'approx': True})
            if u.get('footer'):
                texts.append({'tb': len(texts), 'text': str(u['footer']), 'x': 64.0, 'y': 690.0, 'px': 0.0, 'min_px': 0.0, 'max_px': 0.0,
                              'weight': 400, 'overflow': False, 'outside': False, 'approx': True})
            images = [{'filled': True, 'name': ''} for _ in range(int(u.get('nPic') or 0))]
        sheets.append({'n': n, 'f': f'upload:{n}', 'layout_name': '', 'part': classify_part(title), 'part_label': '', 'stage_key': '', 'stage_name': '',
                       'role': '', 'texts': texts, 'images': images, 'fixed_texts': [], 'overlaps': overlaps, 'free_pictures': 0, 'bg': False,
                       'photo_first': photo_first, 'layout_when': ''})
    unreliable = {'DS1', 'DS6', 'VS3', 'VS5'}  # overflow not measured · empty image slots unknown · stages unknown · parts inferred from titles
    if approx:
        unreliable |= {'DS5', 'SB2'}
    if fonts_missing:
        unreliable |= {'DS4', 'DS5'}
    title = str((doc.get('meta') or {}).get('title') or '') if isinstance(doc.get('meta'), dict) else ''
    scenario = {**_meta(context, title), 'sheets': sheets}
    conversion = {
        'source': 'doc.units', 'kind': kind or None, 'sheets': len(sheets), 'skipped_hidden': len(hidden),
        'geometry': 'measured' if not approx else ('approximate' if approx == len(sheets) else 'partial'),
        'font_sizes': 'known' if not fonts_missing else ('unknown' if not fonts_known else 'partial'),
        'overflow_measured': False, 'parts': 'inferred_from_titles', 'unreliable_criteria': sorted(unreliable),
        'note': '업로드 문서는 앱 렌더링 측정값이 없어 넘침 · 빈 이미지 칸 · 단계 정보가 없습니다. 표시된 기준의 자동 점검은 참고용입니다.',
    }
    return scenario, conversion
