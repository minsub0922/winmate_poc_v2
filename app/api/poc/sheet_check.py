"""장 단위 · 칸 묶음 검수 — the part check (auto_part_verify) fanned out (prompt_budget.py).

Before (2026-11-18, 7 real compositions): one call read the whole part — every requirement and fact of the part brief, every
sheet's every cell, the editable map and ~20 rule lines: p90 7.5k chars. Now one call reads one chunk of one sheet (at most
``CHECK_CELLS`` cells, a card's cells together) with the requirements that sheet answers and the facts of its own items, and
answers coverage · issues · fixes for those cells only. The chunks run at once and are fanned in to the part check's answer
shape (``{'coverage': [{'id','s','quote'}], 'issues': [{'s','slots','reason','kind','requirement'}], 'fixes': [{'s','i','v'}]}``)
— a requirement counts as answered when any sheet answered it (``coverage_errors`` judges the part as before).
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .. import layout_cells
from . import item_mask
from . import prompt_budget as pb
from . import sheet_writer as sw

INT = {'type': 'INTEGER'}
STR = {'type': 'STRING'}
KINDS = ['claim', 'missing', 'binding', 'placeholder']
RULES = ('보는 법:\n'
         '- coverage: 위 요구마다 그 요구에 실제로 답한 칸 하나 — i 와 그 칸 문구를 글자 그대로 quote. 요구를 되풀이만 했거나 방법 · 조건이 없으면 넣지 않음.\n'
         '- issues: 실제 오류만. claim = 자료에 없는 사실 · 기능 · 수치, 다른 항목의 것 · binding = 카드 이름과 내용이 다른 항목 · '
         'placeholder = 자리표시 · 안내문 · missing = 이 장이 맡은 요구에 답이 없음. 맞는 것은 넣지 않음.\n'
         '- fixes: issues 를 고치는 문구(i · v), max 이내. 새 수치 · 제품 · 성과 금지.\n'
         '- 정상: 충돌 수치를 양쪽 다 밝힘 · 미확정을 조건으로 씀 · 목표를 절차 · 측정으로 제안함.')


def schema(rids: Sequence[str]) -> dict:
    cov = {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'id': {'type': 'STRING', **({'enum': list(rids)} if rids else {})}, 'i': INT, 'quote': STR},
                                      'required': ['id', 'i', 'quote']}}
    if not rids:
        cov['maxItems'] = 0
    return {'type': 'OBJECT', 'properties': {
        'coverage': cov,
        'issues': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'slots': {'type': 'ARRAY', 'items': INT}, 'kind': {'type': 'STRING', 'enum': KINDS},
                                                                               'reason': STR, 'requirement': STR}, 'required': ['slots', 'kind', 'reason']}},
        'fixes': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'i': INT, 'v': STR}, 'required': ['i', 'v']}}},
        'required': ['coverage', 'issues', 'fixes']}


def _words(t: str) -> set:
    return set(re.findall(r'[가-힣A-Za-z0-9]{2,}', t or ''))


def assign(auto: Any, slides: List[dict], sheets: Sequence[int], requirements: Sequence[dict]) -> Dict[int, List[str]]:
    """requirement ids per sheet: the ones the sheet was given (focus); one nobody was given goes to the sheet whose text says
    the most of it"""
    out: Dict[int, List[str]] = {s: [r for r in (slides[s].get('focus') or {}).get('points') or []] for s in sheets}
    given = {r for ids in out.values() for r in ids}
    for r in requirements:
        if r['id'] in given or not sheets:
            continue
        w = _words(r.get('text') or '')
        best = max(sheets, key=lambda s: len(w & _words(' '.join(sw._plain(auto, v) for v in (slides[s].get('t') or {}).values()))))
        out[best].append(r['id'])
    return out


def _cells(auto: Any, sl: dict, ids: Sequence[int], editable: Dict[int, dict]) -> List[dict]:
    try:
        from ..layout_elements import plan_for
        units = plan_for(sl['f']).get('units') or []
    except Exception:  # noqa: BLE001
        units = []
    card = {int(c): u.get('label') for u in units for c in u.get('slots') or []}
    try:
        roles = {k: (v.get('role') or '') for k, v in (layout_cells.design(sl['f']).get('cells') or {}).items()}
    except Exception:  # noqa: BLE001
        roles = {}
    out = []
    for i in ids:
        v = sw._plain(auto, (sl.get('t') or {}).get(str(i), ''))
        if not v:
            continue
        c = {'i': i, 'v': pb.cut(v, 130)}
        if roles.get(str(i)):
            c['일'] = pb.cut(roles[str(i)], 45)
        if i in card and card[i]:
            c['카드'] = card[i]
        if i in editable:
            c['max'] = editable[i].get('max')
        out.append(c)
    return out


def chunk_prompt(auto: Any, ctx: dict, part: dict, pp: dict, sl: Optional[dict], cells: List[dict], reqs: List[dict], cache: Optional[dict] = None) -> str:
    """one chunk of one sheet (``sl`` None: the part's requirements with no sheet to read — what the part left unanswered)"""
    try:
        lib = auto.load() if auto is not None else {}
    except Exception:  # noqa: BLE001
        lib = {}
    name = (((lib.get('layouts') or {}).get(sl['f']) or {}).get('name') or sl['f']) if sl else '(장 없음)'
    try:
        binding = (getattr(auto, '_bind_core', None) or auto._bind_line)(ctx, sl) or '' if (auto is not None and sl) else ''
    except Exception:  # noqa: BLE001
        binding = ''

    def build(level: int) -> str:
        facts = sw._facts(pp, sw._items_of(sl, cells), (2, 2, 1, 1)[level], (180, 140, 110, 80)[level]) if sl else []
        lines = [f"제안서 한 장의 문구 검수입니다. 고객: {pb.cut(ctx.get('customer'), 30)} · 파트: {pb.cut(part.get('name'), 24)}",
                 f"이 장: {pb.cut(name, 40)}"]
        if binding and level < 3:
            lines.append('묶인 대상: ' + sw.compact_line(binding, (90, 70, 60)[level], (420, 320, 220)[level]))
        if reqs:
            lines.append('이 장이 답할 요구:\n' + '\n'.join(f"- {r['id']}: {pb.cut(r.get('text') or '', (110, 90, 70, 60)[level])}" for r in reqs))
        if facts:
            lines.append('자료:\n' + '\n'.join('- ' + f for f in facts))
        lines.append('칸(지금 값): ' + pb.dump(cells))
        lines.append(RULES)
        lines.append('JSON만: {"coverage":[{"id":"R1","i":칸,"quote":"칸 문구"}],"issues":[{"slots":[칸],"kind":"claim","reason":"짧게","requirement":"R1"}],"fixes":[{"i":칸,"v":"문구"}]}')
        return '\n'.join(lines)
    return pb.fit(build)


def _valid(d: Any):
    return True if isinstance(d, dict) and all(isinstance(d.get(k), list) for k in ('coverage', 'issues', 'fixes')) else 'coverage/issues/fixes 배열 필요'


def check(auto: Any, ctx: dict, part: dict, pp: dict, slides: List[dict], editable_ids: Dict[int, Dict[int, dict]], requirements: Sequence[dict],
          llm: Any, sheets: Optional[Sequence[int]] = None, stage: str = 'auto_part_verify') -> Tuple[dict, Dict[int, dict]]:
    """the part check, sheet by sheet in chunks, at once → (the part check's answer, the answer per sheet). ``sheets``: only these
    (a second round after fixes re-reads the sheets that changed). Raises when every chunk failed (the part check did too)."""
    todo = [s for s, x in enumerate(slides) if not x.get('fixed') and (s in editable_ids or x.get('product_cards'))]
    if sheets is not None:
        todo = [s for s in todo if s in set(sheets)]
    owned = assign(auto, slides, todo, requirements)
    by_id = {r['id']: r for r in requirements}
    jobs = []
    for s in todo:
        sl = slides[s]
        keys = [int(k) for k in (sl.get('t') or {}) if str(k).isdigit()]
        ids = sorted(set(editable_ids.get(s, {})) | ({k for k in keys} if sl.get('product_cards') else set()))
        groups = sw.chunks_for(auto, sl, [{'i': i} for i in ids], pb.CHECK_CELLS)
        reqs = [by_id[r] for r in owned.get(s, []) if r in by_id]
        for n, g in enumerate(groups):
            cells = _cells(auto, sl, [x['i'] for x in g], editable_ids.get(s, {}))
            if cells:
                # the sheet's requirements go with each chunk (an answer may sit in any of them)
                jobs.append((s, cells, reqs[:4]))

    if not jobs and requirements:
        jobs.append((None, [], list(requirements)[:6]))

    def one(job):
        s, cells, reqs = job
        prompt = chunk_prompt(auto, ctx, part, pp, slides[s] if s is not None else None, cells, reqs)
        with item_mask.sheet(auto, ctx, slides[s] if s is not None else None):
            return llm.json(stage=stage, prompt=prompt, schema=schema([r['id'] for r in reqs]), temperature=0, validate=_valid, max_tokens=1800)
    results = pb.fan_out(one, jobs)
    if jobs and all(e is not None for _, _, e in results):
        raise pb.first_error(results)
    per: Dict[Any, dict] = {s: {'coverage': [], 'issues': [], 'fixes': []} for s in todo}
    for (s, cells, reqs), d, err in results:
        bucket = per.setdefault(s, {'coverage': [], 'issues': [], 'fixes': []})
        if err is not None or not isinstance(d, dict):
            bucket['issues'].append({'s': s, 'slots': [c['i'] for c in cells], 'reason': '검수 응답 없음', 'kind': 'claim', 'requirement': ''})
            continue
        mine = {c['i'] for c in cells}
        rids = {r['id'] for r in reqs}
        for x in d.get('coverage') or []:   # (the cell named, or none — the quote is checked against the sheets by the part check)
            if isinstance(x, dict) and x.get('id') in rids and (x.get('i') is None or x.get('i') in mine) and s is not None:
                bucket['coverage'].append({'id': x['id'], 's': s, 'quote': str(x.get('quote') or '')})
        for x in d.get('issues') or []:
            if not isinstance(x, dict):
                continue
            slots = [i for i in (x.get('slots') or []) if isinstance(i, int) and i in mine]
            bucket['issues'].append({'s': s, 'slots': slots, 'reason': str(x.get('reason') or '내용 검토 필요'), 'kind': x.get('kind') if x.get('kind') in KINDS else 'claim',
                                     'requirement': str(x.get('requirement') or '')})
        for x in d.get('fixes') or []:
            if isinstance(x, dict) and x.get('i') in mine and isinstance(x.get('v'), str) and s is not None:
                bucket['fixes'].append({'s': s, 'i': x['i'], 'v': x['v']})
    return merge(per), per   # (key None: what the part left unanswered with no sheet to read)


def merge(per: Dict[Any, dict]) -> dict:
    order = sorted((s for s in per if s is not None)) + ([None] if None in per else [])
    return {k: [x for s in order for x in per[s][k]] for k in ('coverage', 'issues', 'fixes')}
