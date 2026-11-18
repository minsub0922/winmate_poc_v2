"""장 단위 · 칸 묶음 작성 — the part-writing call fanned out (prompt_budget.py).

Before (2026-11-18, 7 real compositions): one ``auto_part_fill`` call wrote every sheet of a part — the deck thesis, the whole
part brief (every requirement with its planner fields, every fact with its full feature list), the Storyboard summary, and per
sheet the flow inputs (the requirement points again), the binding with full product facts and each cell with its note (the same
long note on every number cell): p90 11.9k chars, up to 36 cells in one answer.

Now one call writes one chunk of one sheet — at most ``WRITE_CELLS`` cells, a card's (layout_elements unit's) cells together —
with that sheet's own requirements, the facts of that sheet's own items, the binding cut segment by segment, notes shared by
cells said once and five rules. The chunks of all sheets run at once; their answers come back in the part call's shape
(``{'slides': [{'s', 't': [{'i', 'v'}]}]}``) so every check after it is unchanged. The missing-cell repair and the shortening
are fanned out the same way.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .. import layout_cells
from . import item_mask
from . import prompt_budget as pb

INT = {'type': 'INTEGER'}
STR = {'type': 'STRING'}
CELLS_SCHEMA = {'type': 'OBJECT', 'properties': {'t': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'i': INT, 'v': STR}, 'required': ['i', 'v']}}},
                'required': ['t']}
SHORT_SCHEMA = {'type': 'OBJECT', 'properties': {'items': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'k': INT, 'v': STR}, 'required': ['k', 'v']}}},
                'required': ['items']}
SHORTEN_ITEMS = 10


def _plain(auto: Any, v: Any) -> str:
    t = re.sub(r'<br\s*/?>', ' ', str(v or ''), flags=re.I)
    return re.sub(r'\s+', ' ', auto.plain(t) if auto is not None and hasattr(auto, 'plain') else re.sub(r'<[^>]+>', '', t)).strip()


def compact_line(line: str, seg: int = 110, total: int = 700) -> str:
    """a long binding line ('카드 1: <facts> / 카드 2: <facts> …') cut segment by segment, so every card · column · part keeps its place"""
    parts = [pb.cut(x, seg) for x in re.split(r'\s/\s', line or '') if x.strip()]
    return pb.cut(' / '.join(parts), total)


# ---------------------------------------------------------------- chunks
def chunks_for(auto: Any, sl: dict, xs: Sequence[dict], size: int = pb.WRITE_CELLS) -> List[List[dict]]:
    """the cells to write in chunks of at most ``size``: the frame (cells of no card) first, then each card's cells together"""
    try:
        from ..layout_elements import plan_for
        units = plan_for(sl['f']).get('units') or []
    except Exception:  # noqa: BLE001 — a layout the element plan does not know: cells in order
        units = []
    unit_of = {}
    for n, u in enumerate(units):
        for c in u.get('slots') or []:
            unit_of.setdefault(int(c), n)
    frame = [x for x in xs if x['i'] not in unit_of]
    groups = [frame] + [[x for x in xs if unit_of.get(x['i']) == n] for n in range(len(units))]
    return pb.pack([g for g in groups if g], size)


# ---------------------------------------------------------------- the sheet as one call needs it
def _items_of(sl: dict, chunk: Sequence[dict]) -> List[Tuple[str, str]]:
    """(kind, id) of the items this sheet is about: bound first, then the orchestrator's focus"""
    b, f = sl.get('bind') or {}, sl.get('focus') or {}
    out: List[Tuple[str, str]] = []
    for k, key, keys in (('product', 'product', 'products'), ('solution', 'solution', 'solutions'), ('case', 'case', 'cases')):
        for q in ([b[key]] if b.get(key) else []) + list(b.get(keys) or []) + list(f.get(keys) or []):
            if q and (k, q) not in out:
                out.append((k, q))
    return out


def _facts(pp: dict, items: Sequence[Tuple[str, str]], n: int, each: int) -> List[str]:
    facts = (pp.get('brief') or {}).get('facts') or {}
    out = []
    for k, q in items:
        x = facts.get(f'{k}:{q}')
        if x and len(out) < n:
            out.append(f"{x.get('name') or q}: {pb.cut(x.get('text') or '', each)}")
    return out


def _requirements(pp: dict, sl: dict, n: int, each: int) -> List[str]:
    """this sheet's requirements — the same customer sentence under two ids (the planner's '재확인' copies) said once"""
    ids = list((sl.get('focus') or {}).get('points') or [])
    reqs = {r['id']: r for r in (pp.get('brief') or {}).get('requirements') or []}
    by_text: Dict[str, List[str]] = {}
    order: List[str] = []
    for r in ids:
        x = reqs.get(r)
        if not x:
            continue
        key = re.sub(r'\W', '', x.get('text') or '')[:60]
        if key not in by_text:
            order.append(key)
        by_text.setdefault(key, []).append(r)
    out = []
    for key in order[:n]:
        rid = by_text[key]
        x = reqs[rid[0]]
        ask = x.get('deliverable') or x.get('answer') or ''
        out.append(f"{' · '.join(rid)}: {pb.cut(x.get('text') or '', each)}" + (f" → 답할 것: {pb.cut(ask, 50)}" if ask else ''))
    return out


def _flow_lines(auto: Any, ctx: dict, pp: dict, sl: dict, level: int, cache: Optional[dict] = None) -> List[str]:
    """the layout flow's own instruction for this sheet (admin 레이아웃 관리 → 흐름 'write' node), its short inputs and its tools'
    results (called once a sheet — ``cache``)"""
    try:
        from . import layout_flows as hooks
        from .. import layout_flows as flows
    except Exception:  # noqa: BLE001
        return []
    v = hooks.flow(sl['f'])
    node = next(iter(flows.module(v['flow'], 'write') or flows.module(v['flow'], 'merge')), None) if v else None
    if not node:
        return []
    out = []
    text = (node.get('prompt') or '').strip()
    # the default instruction repeats the sheet's name and what it says (already in the header): its rule sentence alone
    head = re.match(r'^‘[^’]*’ 장(?: — 이 장이 말할 것: “[^”]*”)?\.\s*', text)
    if head:
        text = text[head.end():]
    if text:
        out.append('이 장 지시: ' + pb.cut(text, (320, 240, 160, 120)[min(level, 3)]))
    skip = {'requirement_points', 'requirement_summary', 'requirement_text', 'template_exemplar', 'deck_thesis', 'used_pictures',
            'market_evidence', 'customer_name', 'project_title', 'proposal_date'}
    if sl.get('kind') not in ('toc', 'divider', 'cover'):
        skip |= {'section_index', 'neighbor_parts'}   # (the chapter list matters to navigation sheets only)
    rows = []
    for i in v['flow']['inputs']:
        if i['param'] not in (node.get('reads') or []) or i['source'] in skip:
            continue
        got = hooks.value(auto, ctx, pp, sl, i['source'])
        if got:
            rows.append(f"{i['param']}: {pb.cut(got, 120 if i['source'] == 'part_directive' else 70)}")
    if rows and level < 3:
        out.append('입력: ' + ' / '.join(rows[:6]))
    summary = hooks.part_extra(ctx, {}, pp, [sl]) if any(i['source'] == 'requirement_summary' for i in v['flow']['inputs']) else ''
    if summary and level < 3:   # (the flow declares the Storyboard summary: it goes with the sheet, cut)
        out.append(pb.cut(summary, (300, 220, 160)[level]))
    if node.get('tools'):
        key = ('tools', id(sl))
        if cache is None or key not in cache:
            got = hooks.tool_results(auto, ctx, pp, sl, node)
            if cache is not None:
                cache[key] = got
        else:
            got = cache[key]
        if got:
            out.append(pb.cut(got, (500, 400, 300, 200)[min(level, 3)]))
    return out


RULES = ('규칙:\n'
         '- 쓸 칸마다 하나씩, max 글자 이내. 짧아도 뜻이 끝나게.\n'
         '- 위 자료 · 요구에 있는 사실만. 없는 수치 · 성과 · 기능 · 제품 · 일정은 만들지 않음 — 새 제안이면 ‘제안’ · ‘협의’로.\n'
         '- 같은 장의 다른 칸 · 다른 장과 같은 문장 금지. 자리표시 · 안내문 · 로고 문구 금지.\n'
         '- 이름 칸은 고른 항목의 이름 그대로.')


def chunk_prompt(auto: Any, ctx: dict, plan: dict, part: dict, pp: dict, slides: List[dict], s: int, chunk: Sequence[dict],
                 locked: Dict[int, dict], named_rule: str = '', extra_rules: Sequence[str] = (), done: Optional[Dict[str, str]] = None,
                 cache: Optional[dict] = None) -> str:
    """the prompt of one chunk of one sheet (``done``: cells of this sheet already written — the missing-cell repair)"""
    from .compose_grounding import slot_intent
    sl = slides[s]
    lib = auto.load()
    meta = (lib.get('layouts') or {}).get(sl['f']) or {}
    extra = next((x for x in pp.get('extra_layouts') or [] if x['f'] == sl['f']), None)
    purpose = (extra or {}).get('reason') or meta.get('name') or sl['f']
    say = (layout_cells.design(sl['f']).get('say') or '').strip()
    ids = {x['i'] for x in chunk}
    cells = []
    for x in chunk:
        c = {'i': x['i'], '일': pb.cut(slot_intent(sl['f'], x), 70), 'max': x['max']}
        if x.get('note'):
            c['note'] = pb.cut(x['note'], 110)
        cells.append(c)
    cells, shared = pb.shared_notes(cells)
    try:
        bind_core = getattr(auto, '_bind_core', None) or auto._bind_line
        binding = bind_core(ctx, sl) or ''
    except Exception:  # noqa: BLE001
        binding = ''
    others = [pb.cut(((lib.get('layouts') or {}).get(o['f']) or {}).get('name') or o['f'], 22) for n, o in enumerate(slides)
              if n != s and not o.get('fixed') and not o.get('keep')]
    fixed_near = {k: pb.cut(_plain(auto, v), 30) for k, v in (locked.get(s) or {}).items()
                  if k.isdigit() and len(_plain(auto, v)) >= 2 and not _plain(auto, v).isdigit() and abs(int(k) - min(ids)) <= 6 and int(k) not in ids}
    conflicts = (pp.get('brief') or {}).get('conflicts') or []

    def build(level: int) -> str:
        reqs = _requirements(pp, sl, (3, 3, 2, 1)[level], (110, 90, 70, 60)[level])
        facts = _facts(pp, _items_of(sl, chunk), (3, 2, 2, 1)[level], (220, 170, 130, 100)[level])
        flow = _flow_lines(auto, ctx, pp, sl, level, cache)
        carried = any('part_directive:' in x for x in flow)   # (the flow's input carries the part's direction for this sheet)
        lines = [f"B2B 제안서 한 장의 칸을 씁니다. 고객: {pb.cut(ctx.get('customer'), 30)} · 과제: {pb.cut(ctx.get('title'), 50)}",
                 f"파트: {pb.cut(part.get('name'), 24)}" + ('' if carried else f" — {pb.cut(pp.get('message'), (90, 80, 60, 50)[level])}"),
                 f"이 장: {pb.cut(purpose, 40)}" + (f" — 말할 것: {pb.cut(say, 70)}" if say else '')
                 + (f" · 방향: {pb.cut(sl.get('directive'), (120, 100, 70, 50)[level])}" if sl.get('directive') and not carried else '')]
        lines += flow
        if binding and level < 4:
            lines.append('묶인 대상: ' + compact_line(binding, (110, 90, 70, 60)[level], (700, 560, 420, 300)[level]))
        if reqs:
            lines.append('답할 요구:\n' + '\n'.join('- ' + r for r in reqs))
        if facts:
            lines.append('자료:\n' + '\n'.join('- ' + f for f in facts))
        if fixed_near and level < 3:
            lines.append('정해진 옆 칸(그대로): ' + pb.dump(dict(list(fixed_near.items())[:4])))
        if done:
            near = {k: pb.cut(v, 40) for k, v in done.items() if v and k.isdigit() and abs(int(k) - min(ids)) <= 8 and int(k) not in ids}
            if near:
                lines.append('이미 쓴 옆 칸(다른 말로): ' + pb.dump(dict(list(near.items())[:6])))
        if others and level < 2:
            lines.append('같은 파트 다른 장: ' + ' · '.join(others[:5]))
        lines.append('쓸 칸: ' + pb.dump(cells))
        if shared:
            lines.append('칸 메모: ' + ' / '.join(pb.cut(x, 160) for x in shared))
        rules = [RULES]
        if conflicts:
            rules.append('- 서로 다른 수치가 있으면 둘 다 밝히고 확인 대상으로.')
        rules += [x for x in extra_rules if x]
        if named_rule:
            rules.append(named_rule.strip())
        lines.append('\n'.join(rules))
        lines.append('JSON만: {"t":[{"i":칸,"v":"문구"}]}')
        return '\n'.join(lines)
    return pb.fit(build)


def _cells_answer(d: Any, ids: set) -> Dict[int, str]:
    rows = d.get('t') if isinstance(d, dict) else None
    out: Dict[int, str] = {}
    for x in rows or []:
        if isinstance(x, dict) and isinstance(x.get('i'), int) and x['i'] in ids and isinstance(x.get('v'), str) and x['i'] not in out:
            out[x['i']] = x['v']
    return out


def _structure(d: Any):
    return True if isinstance(d, dict) and isinstance(d.get('t'), list) else 't:[{i,v}] 배열이 필요합니다.'


# ---------------------------------------------------------------- the fan-outs
def write_part(auto: Any, ctx: dict, plan: dict, part: dict, pp: dict, slides: List[dict], single: Dict[int, List[dict]],
               locked: Dict[int, dict], llm: Any, named_rule: str = '', stage: str = 'auto_part_fill') -> dict:
    """every sheet's cells, chunk by chunk, at once → the part call's answer shape. A chunk that failed leaves its cells
    unanswered (the missing-cell repair asks them again); when every chunk failed the first error is raised (as the part call did)."""
    jobs = [(s, chunk) for s, xs in single.items() for chunk in chunks_for(auto, slides[s], xs)]
    cache: dict = {}

    def one(job):
        s, chunk = job
        prompt = chunk_prompt(auto, ctx, plan, part, pp, slides, s, chunk, locked, named_rule, cache=cache)
        with item_mask.sheet(auto, ctx, slides[s]):
            d = llm.json(stage=stage, prompt=prompt, schema=CELLS_SCHEMA, validate=_structure, temperature=0.15, max_tokens=1600)
        return _cells_answer(d, {x['i'] for x in chunk})
    results = pb.fan_out(one, jobs)
    if jobs and all(e is not None for _, _, e in results):
        raise pb.first_error(results)
    rows: Dict[int, List[dict]] = {}
    for (s, _), got, err in results:
        for i, v in (got or {}).items():
            rows.setdefault(s, []).append({'i': i, 'v': v})
    return {'slides': [{'s': s, 't': t} for s, t in rows.items()]}


def repair_missing(auto: Any, ctx: dict, plan: dict, part: dict, pp: dict, slides: List[dict], missing: List[dict], locked: Dict[int, dict],
                   llm: Any, stage: str = 'auto_part_fill_missing') -> List[dict]:
    """the cells left unanswered, sheet by sheet in chunks, at once → [{'s','i','v'}] (the repair call's old answer shape)"""
    by: Dict[int, List[dict]] = {}
    for m in missing:
        by.setdefault(m['s'], []).append({k: v for k, v in m.items() if k != 's'})
    jobs = [(s, chunk) for s, xs in by.items() for chunk in chunks_for(auto, slides[s], xs)]
    cache: dict = {}

    def one(job):
        s, chunk = job
        done = {k: _plain(auto, v) for k, v in (slides[s].get('t') or {}).items()}
        prompt = chunk_prompt(auto, ctx, plan, part, pp, slides, s, chunk, locked, done=done, cache=cache,
                              extra_rules=('- 빠진 칸만 씁니다. 옆 칸과 이어지되 같은 말은 쓰지 않음.',))
        with item_mask.sheet(auto, ctx, slides[s]):
            d = llm.json(stage=stage, prompt=prompt, schema=CELLS_SCHEMA, validate=_structure, temperature=0.1, max_tokens=1600)
        return _cells_answer(d, {x['i'] for x in chunk})
    results = pb.fan_out(one, jobs)
    if jobs and all(e is not None for _, _, e in results):
        raise pb.first_error(results)
    return [{'s': s, 'i': i, 'v': v} for (s, _), got, _ in results for i, v in (got or {}).items()]


def shorten(auto: Any, long: List[dict], llm: Any, stage: str = 'auto_part_shorten') -> List[dict]:
    """cells past their width, ``SHORTEN_ITEMS`` a call, at once → [{'s','i','v'}]"""
    groups = [long[k:k + SHORTEN_ITEMS] for k in range(0, len(long), SHORTEN_ITEMS)]

    def one(group):
        rows = [{'k': n, 'max': x['max'], 'v': pb.cut(_plain(auto, x['v']), 400)} for n, x in enumerate(group)]
        prompt = ('문구를 각 max 글자 이내의 완결된 핵심 구로 줄입니다. 새 사실을 더하지 말고 모델 코드 · 수량 · 조건은 남깁니다.\n'
                  f'줄일 문구: {pb.dump(rows)}\nJSON만: {{"items":[{{"k":번호,"v":"줄인 문구"}}]}}')
        d = llm.json(stage=stage, prompt=prompt, schema=SHORT_SCHEMA, temperature=0, max_tokens=1200)
        return [{'s': group[x['k']]['s'], 'i': group[x['k']]['i'], 'v': x['v']} for x in (d.get('items') or [])
                if isinstance(x, dict) and isinstance(x.get('k'), int) and 0 <= x['k'] < len(group) and isinstance(x.get('v'), str)]
    results = pb.fan_out(one, groups)
    return [x for _, got, _ in results for x in (got or [])]
