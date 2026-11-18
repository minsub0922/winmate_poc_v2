"""Element-wise writing of a sheet — fan-out / fan-in (admin 레이아웃 관리 → 입력 · 흐름 → 요소별 작성).

One model call for a whole part mixed its sheets' elements up: the three 핵심 제안 sheets came back with the same
two cards, a 니즈 row named two solutions, card 1 of a two-product sheet carried product 2's specs. A sheet whose
elements carry different things is therefore written element by element (app/api/layout_elements.py decides which):

  split    code — which entity each element carries: 니즈 열 k ↔ its requirement points and the item that answers
           them, 핵심 제안 행 ↔ the column's items (the chips are set by code), 공간별 제품 카드 j ↔ product j,
           공간 시나리오 ↔ space k, other cards ↔ the part's items in order or the sheet's requirement points
  element  one model call per element, in parallel: its own cells, its own entity's facts and requirement only,
           the element prompt, what the other elements carry (so they do not overlap)
  merge    code checks the elements against each other and the part's other sheets (the same sentence twice,
           another element's item named, an empty cell) and asks once more for those cells only; then one call
           writes the frame (title · lead) from the elements' answers

Sheets that are not split stay in the part call (compose_grounding.fill_part).
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
import json
import re

from ..layout_elements import ENTITY_LABELS, plan_for as element_plan
from .. import layout_flows as flows
from . import compose_grounding as grounding

INT, STR = {'type': 'INTEGER'}, {'type': 'STRING'}
WORKERS = 4
SPLIT_KINDS = flows.SPLIT_KINDS   # market (market.py) · spec data · chrome sheets stay whole


from . import item_mask
from . import prompt_budget as pb   # (short prompts, a few cells a call — a weak model answers long ones badly)


def obj(props, required=None):
    return {'type': 'OBJECT', 'properties': props, 'required': required or list(props)}


def arr(item):
    return {'type': 'ARRAY', 'items': item}


def compact(v) -> str:
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def flow_nodes(f: str):
    from .layout_flows import flow   # request snapshot (admin one-sheet experiments) first, then the registry
    v = flow(f)
    if not v:
        return None, {}
    return v, {n['module']: n for n in v['flow']['nodes']}


def wants_split(f: str) -> bool:
    """the sheet's flow writes it element by element (base: the element plan; an admin edit can switch it). The registry's kind
    decides (업종 트렌드 sheets are 'generic' to the composer but market.py's)."""
    v, nodes = flow_nodes(f)
    return bool(v) and 'element' in nodes and v.get('kind') in SPLIT_KINDS


# ---------------------------------------------------------------- entities
def _item(auto, ctx, q):
    if not q:
        return None
    lib = auto.load()
    name = ctx['short'].get(q) or (lib['products_all'].get(q) or {}).get('name') or (lib['solutions'].get(q) or {}).get('name') or q
    if q in lib['products_all']:
        return {'kind': 'product', 'id': q, 'name': name, 'facts': auto.product_fact(q, full=True)}
    if q in lib['solutions']:
        return {'kind': 'solution', 'id': q, 'name': name, 'facts': auto.solution_knowledge(q)}
    if q in (lib.get('cases') or {}):
        return {'kind': 'case', 'id': q, 'name': name, 'facts': auto.case_fact(q, full=True)}
    return None


def _space(auto, ctx, sid):
    sp = ctx['space_by_id'].get(sid) or {}
    if not sp:
        return None
    prods = [ctx['short'].get(p) or p for p in (sp.get('products') or [])][:6]
    uses = [u.get('name') for u in (sp.get('uses') or []) if isinstance(u, dict)][:6]
    if not uses and hasattr(auto, 'scn_uses'):
        uses = [u['name'] for u in auto.scn_uses(ctx).get(sid, [])][:6]
    facts = ' / '.join(filter(None, [f"놓인 제품: {', '.join(prods)}" if prods else '', f"쓰는 솔루션 · 서비스: {', '.join(uses)}" if uses else '',
                                     sp.get('note') or '']))
    more = ' · '.join(auto.product_fact(p) for p in (sp.get('products') or [])[:4])
    return {'kind': 'space', 'id': sid, 'name': sp.get('name') or sid, 'facts': facts + (f' · 제품 자료: {more}' if more else ''),
            'items': list(sp.get('products') or []) + [u.get('id') for u in (sp.get('uses') or []) if isinstance(u, dict)]}


def _points(plan, ids):
    pts = {x['id']: x for x in plan.get('points') or []}
    return [pts[r] for r in ids if r in pts]


def _req_rows(points):
    return [{k: p[k] for k in ('id', 'text', 'label', 'deliverable', 'answer', 'measure', 'speaker') if p.get(k)} for p in points]


def _req_short(points, each=100, n=3):
    """the requirements a call answers, briefly: the customer's words and what to answer (prompt_budget)"""
    out = []
    for p in points[:n]:
        row = {'id': p.get('id'), 'text': pb.cut(p.get('text'), each)}
        ask = p.get('deliverable') or p.get('answer')
        if ask:
            row['answer'] = pb.cut(ask, 60)
        if p.get('speaker'):
            row['who'] = pb.cut(p['speaker'], 24)
        out.append(row)
    return out


KIND_ORDER = {'need': 0, 'constraint': 1, 'risk': 2, 'question': 3, 'decision': 8, 'context': 9}


def _needs_lead(auto, ctx, plan, pp):
    """니즈 열 ↔ 요구: the customer's needs and constraints take the three columns before decisions · context (a decision —
    '시범 3곳 승인' — is the frame's or a later part's, not a need the customer voices)."""
    kind = {x['id']: x.get('kind') for x in plan['points']}
    pp = {**pp, **{k: sorted(pp[k], key=lambda r: KIND_ORDER.get(kind.get(r), 5)) for k in ('point_ids', 'raises', 'refs') if pp.get(k)}}
    per, problem = auto.need_columns(plan['points'], pp)
    pts = {x['id']: x for x in plan['points']}
    lead = auto.column_items(ctx, per, pts) if not problem else {}
    return per, lead


def _core_rows(auto, ctx, sl, lead, more, used):
    """핵심 제안 장의 두 행 항목: 01 = 그 열의 항목, 02 = 같은 요구에 연결된 다른 항목(아직 안 쓴 것 먼저) — 없으면 같은 항목의 두 번째
    세부 제안. 요구와 무관한 '아직 안 쓴 선택 제품'을 끌어오지 않는다(객실 제안에 대공간용 카세트가 들어가던 일)."""
    L = auto.load()['layouts'].get(sl['f']) or {}
    tm, im = (L.get('modes') or {}).get('t') or {}, (L.get('modes') or {}).get('img') or {}
    chips = sorted(int(k) for k, m in tm.items() if m == 'product')
    pics = sorted(int(k) for k, m in im.items() if m == 'product')
    if len(chips) < 2:
        return []
    related = [q for q in more if q != lead]
    second = next((q for q in related if q not in used), None) or (related[0] if related else lead)
    rows = [lead, second][:len(chips)]
    used.update(rows)
    for n, q in enumerate(rows):
        if len(pics) == len(chips):
            sl.setdefault('img_bind', {})[str(pics[n])] = {'product': q} if q in ctx['products'] else {'solution': q}
    sl['core_rows'] = rows
    return rows


def _unit_entities(auto, ctx, plan, part, pp, sl, units, cores_used):
    """[{entity?, points, lock?}] per unit — code decides what each element carries before anything is written."""
    f, b = sl['f'], sl.get('bind') or {}
    out = [{'entity': None, 'points': [], 'lock': {}} for _ in units]
    if f == 'L_VS_NEEDS':
        per, lead = _needs_lead(auto, ctx, plan, pp)
        for k in range(min(3, len(units))):
            if k < len(per):
                out[k]['points'] = _points(plan, per[k])
            it = (lead.get(k) or (None, []))[0]
            out[k]['entity'] = _item(auto, ctx, it)
            out[k]['lock'][str(8 + 7 * k)] = (ctx['short'].get(it) or it) if it else ''
            if it:
                sl.setdefault('img_bind', {})[str(k)] = {'product': it} if it in ctx['products'] else {'solution': it}
        return out
    if f.startswith('L_VS_CORE_'):
        per, lead = _needs_lead(auto, ctx, plan, pp)
        k = sl.get('col') if sl.get('col') is not None else sl.get('_core_n', 0)
        it, more = lead.get(k) or (None, [])
        rows = _core_rows(auto, ctx, sl, it, more, cores_used) if it else []
        for r in range(len(units)):
            out[r]['points'] = _points(plan, per[k]) if k < len(per) else []
            q = rows[r] if r < len(rows) else None
            out[r]['entity'] = _item(auto, ctx, q)
            out[r]['lock'][str(5 + 7 * r)] = (ctx['short'].get(q) or q) if q else ''
        out[0]['needs_row'] = k
        for o in out:
            o['needs_row'] = k
        return out
    if f.startswith('L_VS_SPACE_P') and b.get('products'):
        sp = _space(auto, ctx, b.get('space'))
        for j, q in enumerate(b['products'][:len(units)]):
            out[j]['entity'] = _item(auto, ctx, q)
            out[j]['space'] = sp
        return out
    if re.match(r'^L_TOC_SCN_S\d$', f) and b.get('spaces'):
        for k, sid in enumerate(b['spaces'][:len(units)]):
            out[k]['entity'] = _space(auto, ctx, sid)
        return out
    if f.startswith('L_TOC_TECH') and (s_free := sl.get('tech_free')):
        for n, (kind, q) in enumerate(s_free):
            if n < len(units):
                out[n]['entity'] = _item(auto, ctx, q)
        return out
    if b.get('products') and sl['kind'] in ('spec', 'bom'):
        for j, q in enumerate(b['products'][:len(units)]):
            out[j]['entity'] = _item(auto, ctx, q)
        return out
    # other sheets: elements of a kind take the part's items of that kind in order; topic elements take the sheet's points
    pool = {'product': list(dict.fromkeys(list(pp.get('products') or []) + list(b.get('products') or []))),
            'solution': list(dict.fromkeys(list(pp.get('solutions') or []) + list(b.get('solutions') or []))),
            'case': list(dict.fromkeys([str(x) for x in (pp.get('cases') or [])] + ([str(b['case'])] if b.get('case') else []))),
            'space': [x['id'] for x in ctx.get('spaces') or []]}
    focus = (sl.get('focus') or {}).get('points') or list(pp.get('point_ids') or [])
    taken = {k: 0 for k in pool}
    for n, u in enumerate(units):
        kind = u['entity']
        if kind in pool and taken[kind] < len(pool[kind]):
            q = pool[kind][taken[kind]]
            taken[kind] += 1
            out[n]['entity'] = _space(auto, ctx, q) if kind == 'space' else _item(auto, ctx, q)
        if focus:
            out[n]['points'] = _points(plan, [focus[n % len(focus)]])
    return out


# ---------------------------------------------------------------- split
def plan_split(auto, ctx, plan, part, pp, slides, editable, locked) -> dict:
    """{slide index: runtime plan} for the sheets written element by element; their cells leave the part call."""
    out, cores_used = {}, set()
    cores = sorted((n for n, sl in enumerate(slides) if sl['f'].startswith('L_VS_CORE_')), key=lambda n: slides[n]['f'])
    for rank, n in enumerate(cores):
        slides[n]['_core_n'] = rank
    if any(sl['f'] == 'L_VS_NEEDS' for sl in slides):
        _, lead = _needs_lead(auto, ctx, plan, pp)
        cores_used |= {v[0] for v in lead.values() if v and v[0]}
    for s in sorted(editable, key=lambda s: (slides[s]['f'].startswith('L_VS_CORE_'), s)):   # 니즈 before 핵심 제안 (their rows follow its columns)
        sl, xs = slides[s], editable[s]
        if not wants_split(sl['f']):
            continue
        el = element_plan(sl['f'])
        units = [u for u in el['units'] if u.get('slots')]
        if len(units) < 2:
            continue
        ents = _unit_entities(auto, ctx, plan, part, pp, sl, units, cores_used)
        cells = {x['i']: x for x in xs}
        rt = []
        lib = auto.load()
        for u, e in zip(units, ents):
            ent = e.get('entity') or {}
            if ent.get('kind') == 'product':
                model = (lib['products_all'].get(ent['id']) or {}).get('model') or ''
                for i in u['slots']:
                    if i in cells and MODEL.match(str(cells[i].get('ref') or '').strip()) and model:
                        e['lock'][str(i)] = model
            for k, v in e['lock'].items():   # code-owned cells of this element (an item chip)
                locked[s][k] = v
                sl.setdefault('lock', {})[k] = v
            mine = [cells[i] for i in u['slots'] if i in cells and str(i) not in e['lock']]
            rt.append({**u, **e, 'cells': mine})
        live = [u for u in rt if u['cells']]
        if sl['kind'] == 'generic' and not sl['f'].startswith(('L_VS_NEEDS', 'L_VS_CORE_')):
            # a product · solution card's cut shows that card's item (pictures.py reads img_bind as the text stage's decision)
            kinds = {im['i']: im.get('kind') for im in auto.load()['layouts'][sl['f']].get('images') or []}
            for u in live:
                e = u.get('entity') or {}
                for i in u.get('imgs') or []:
                    if e.get('kind') in ('product', 'solution') and kinds.get(i) in ('cut', 'detail', 'kiosk', 'signage'):
                        sl.setdefault('img_bind', {}).setdefault(str(i), {e['kind']: e['id']})
        ids = {(u['entity'] or {}).get('id') for u in live if u.get('entity')}
        n_cells = sum(len(u['cells']) for u in live)
        if len(live) < 2 or (len(ids) < 2 and not any(u['points'] for u in live) and n_cells < 12):
            continue   # one thing, few cells: the part call writes it whole
        inside = {x['i'] for u in live for x in u['cells']}
        geo = {t['i']: t for t in auto.load()['layouts'][sl['f']]['texts']}
        footer = lambda i: (geo.get(i) or {}).get('y', 0) >= 640 and (geo.get(i) or {}).get('role') in ('utility', 'label', '', None)
        frame = [x for x in xs if x['i'] not in inside and str(x['i']) not in {k for u in rt for k in u['lock']} and not footer(x['i'])]
        carried = {p['id'] for u in live for p in u.get('points') or []}
        # the requirement points this sheet was given and no element carries — 니즈: the part's points beyond its three columns
        # (decisions · context); 핵심 제안: none (it elaborates one column); others: the sheet's own focus only
        if sl['f'] == 'L_VS_NEEDS':
            sheet_pts = list(pp.get('point_ids') or pp.get('raises') or [])
        elif sl['f'].startswith('L_VS_CORE_'):
            sheet_pts = []
        else:
            sheet_pts = list((sl.get('focus') or {}).get('points') or [])
        rest = [x for x in xs if footer(x['i']) and x['i'] not in inside]   # the deck's footer line: code-owned, left as it is
        out[s] = {'units': live, 'frame': frame, 'rest': rest, 'points': [p for p in _points(plan, sheet_pts) if p['id'] not in carried]}
    for s, rt in out.items():   # chips set by code are not the model's cells any more
        owned = {k for u in rt['units'] for k in u['lock']}
        editable[s] = [x for x in editable[s] if str(x['i']) not in owned]
    return out


# ---------------------------------------------------------------- element / merge
MODEL = re.compile(r'^[A-Z]{1,4}\d{2,}[A-Z0-9-]*$')
SPEC = re.compile(r'\d[\d,.]*\s?(nit|cm|㎜|mm|kW|㎾|W|Hz|%|"|인치|형|K|UHD|ms|kg)\b|\d\s?x\s?\d', re.I)


def form_of(ref: str) -> str:
    """the shape of the sample text in a card cell — what kind of thing goes there, without its content (the sample is another
    customer's): a generic sheet's cells are only 'text' otherwise, and a card's category · model · spec · use cells blur."""
    v = re.sub(r'\s+', ' ', str(ref or '')).strip()
    if not v:
        return ''
    head = re.match(r'^([^·\d]{1,6}) · ', v)
    if MODEL.match(v):
        return '모델 코드'
    if re.fullmatch(r'[×x]\s?\d+', v):
        return '수량 (×n)'
    if head:
        return f'‘{head.group(1)} · …’ 꼴 — 앞말은 그대로'
    if SPEC.search(v) and len(v) <= 30:
        return '사양 값 (자료의 숫자 · 단위 그대로)'
    if len(v) <= 8:
        return '짧은 이름표 (2~8자)'
    if len(v) <= 22 and not re.search(r'[다요]\.?$', v):
        return '짧은 구절'
    return '한두 문장'


def _cell_rows(auto, f, xs, slot_intent):
    # form hints only where no 칸 설계 role names the cell
    return [{'i': x['i'], 'intent': slot_intent(f, x), **({'form': fm} if (fm := form_of(x.get('ref'))) and slot_intent(f, x) in ('text', '문구', 'body', 'dense', 'label', 'heading', 'subheading') else {}),
             **{k: x[k] for k in ('max', 'note', 'col_head', 'row_head') if x.get(k)}} for x in xs]


def _entity_line(u) -> str:
    e = u.get('entity')
    if not e:
        return '정해진 항목 없음 — 이 요소의 요구에서 이어지는 내용'
    return f"{ENTITY_LABELS.get(e['kind'], e['kind'])} ‘{e['name']}’"


def _sheet_directive(sl, nodes) -> str:
    node = nodes.get('merge') or nodes.get('write') or {}
    return (node.get('prompt') or '').strip()


def _element_prompt(nodes, u) -> str:
    node = nodes.get('element') or {}
    own = next((x.get('prompt') for x in node.get('units') or [] if x.get('id') == u['id'] and x.get('prompt')), '')
    text = (own or node.get('prompt') or '').strip()
    e = u.get('entity') or {}
    return text.replace('{label}', u['label']).replace('{entity}', e.get('name') or '').replace('{kind}', ENTITY_LABELS.get(e.get('kind'), ''))


def _others(units, me) -> str:
    rows = []
    for u in units:
        if u is me:
            continue
        what = (u.get('entity') or {}).get('name') or ' · '.join(p.get('label') or p.get('text', '')[:30] for p in u.get('points') or []) or '다른 면'
        rows.append(f"{u['label']} = {what}")
    return ' / '.join(rows)


def write_unit(auto, ctx, plan, part, pp, sl, nodes, units, u, llm, extra, slot_intent, tools_text):
    e = u.get('entity') or {}
    vocab = _vocab(ctx, part) if e.get('facts') else None
    bad = list(dict.fromkeys(auto.unlinked_in(e['facts'], vocab))) if vocab else []
    cells = _cell_rows(auto, sl['f'], u['cells'], slot_intent)
    cells, shared = pb.shared_notes(cells)

    def build(level):
        lines = [
            'B2B 제안서 한 장 가운데 요소 하나만 씁니다(같은 장의 다른 요소는 따로 씁니다).',
            f"고객: {pb.cut(ctx['customer'], 30)} · 과제: {pb.cut(ctx['title'], 50)}",
            f"파트: {pb.cut(part['name'], 24)} — {pb.cut(pp.get('message', ''), (90, 80, 60, 50, 40)[level])}",
            f"장: {pb.cut(auto.load()['layouts'][sl['f']].get('name') or sl['f'], 40)}"
            + (f" — {pb.cut(d, (240, 180, 120, 90, 70)[level])}" if (d := _sheet_directive(sl, nodes)) else ''),
            *([f"방향(문구로 옮기지 않음): {pb.cut(sl['directive'], (120, 100, 80, 60, 50)[level])}"] if sl.get('directive') else []),
            f"이 요소: {u['label']} — {_entity_line(u)}",
        ]
        if e.get('facts'):
            lines.append('이 요소의 자료(근거는 이것뿐): ' + pb.cut(e['facts'], (600, 480, 360, 260, 200)[level]))
            if bad:
                lines.append('고르지 않은 것 — 이름을 쓰지 않음: ' + ', '.join(bad[:6]))
        if u.get('space'):
            lines.append(f"공간 ‘{u['space']['name']}’: {pb.cut(u['space']['facts'], (240, 180, 140, 100, 80)[level])}")
        if u.get('points'):
            lines.append('이 요소가 답할 고객 요구: ' + pb.dump(_req_short(u['points'], (110, 90, 70, 60, 50)[level])))
            if not e:
                lines.append('정해진 제품 · 솔루션 없음 — 제품 · 솔루션 · 기술 이름을 새로 만들지 않고 운영 · 절차 · 확인 방식으로 답합니다.')
        if extra:
            lines.append(pb.cut(extra, (300, 240, 180, 120, 80)[level]))
        if tools_text and level < 4:
            lines.append(pb.cut(tools_text, (500, 400, 300, 200)[level]))
        if p := _element_prompt(nodes, u):
            lines.append('요소 지시: ' + pb.cut(p, (300, 240, 180, 140, 120)[level]))
        if (o := _others(units, u)) and level < 3:
            lines.append('같은 장의 다른 요소(그 내용은 쓰지 않음): ' + pb.cut(o, (200, 160, 120)[level]))
        lines.append('칸: ' + pb.dump(cells))
        if shared:
            lines.append('칸 메모: ' + ' / '.join(pb.cut(x, 160) for x in shared))
        lines.append('규칙: 칸마다 i 그대로 한 번씩, max 글자 이내 — 짧아도 완결된 말. '
                     + (f"이 요소의 항목은 ‘{e['name']}’ 하나 — 다른 제품 · 솔루션 이름을 쓰지 않음. " if e.get('kind') in ('product', 'solution', 'case') else '')
                     + '자료에 없는 수치 · 기능 · 성과 · 일정은 만들지 않고, 정해지지 않은 것은 ‘협의’로. 같은 문장을 두 칸에 쓰지 않음. JSON만: {"t":[{"i":칸,"v":문구}]}')
        return '\n'.join(lines)
    prompt = pb.fit(build)
    want = {x['i']: x for x in u['cells']}
    tries = {'n': 0}

    def check(d):
        tries['n'] += 1
        got = d.get('t') if isinstance(d, dict) else None
        if not isinstance(got, list):
            return 't:[{i,v}] 필요'
        bad = [x.get('i') for x in got if isinstance(x, dict) and x.get('i') not in want]
        if bad and tries['n'] == 1:
            return f'요청하지 않은 칸 {bad} — 칸 번호를 바꾸지 말고 {sorted(want)} 만'
        # over the box: once more, the same sentence within max (the part's shortening would cut it to a noun phrase)
        long = [f"칸 {x['i']}: {len(x['v'])}자 → {want[x['i']]['max']}자 이내" for x in got
                if isinstance(x, dict) and x.get('i') in want and isinstance(x.get('v'), str)
                and not grounding.fits_slot(auto, sl, x['i'], x['v'], want[x['i']]['max'])]
        if long and tries['n'] == 1:
            return '칸 길이 초과 — ' + ' / '.join(long) + '. 같은 뜻 · 같은 문장 형식(문장이면 문장)으로 줄여 다시.'
        return True
    try:
        out = llm.json(stage='auto_unit_fill', prompt=prompt, schema=obj({'t': arr(obj({'i': INT, 'v': STR}))}), validate=check,
                       temperature=0.2, max_tokens=1600)
    except Exception as exc:   # one element failing leaves its cells empty for the merge step — the part goes on
        if type(exc).__name__ == 'JobCancelled' or getattr(exc, 'code', '') == 'cancelled':
            raise
        return {}
    vals = {}
    for x in out.get('t') or []:
        if isinstance(x, dict) and x.get('i') in want and isinstance(x.get('v'), str) and not grounding.unusable(sl['f'], want[x['i']], x['v']):
            vals[str(x['i'])] = x['v'].strip()
    return vals


def _vocab(ctx, part):
    """what composer.enforce_linked clears at the end (names of items this customer did not select)"""
    return ctx.get('unlinked_said_hard' if (part or {}).get('mode') == 'problem' else 'unlinked_hard')


def _names(auto, ctx):
    lib = auto.load()
    out = {}
    for q in list(ctx.get('products') or []) + list(ctx.get('solutions') or []):
        for n in {ctx['short'].get(q), (lib['products_all'].get(q) or {}).get('name'), (lib['products_all'].get(q) or {}).get('model'),
                  (lib['solutions'].get(q) or {}).get('name')}:
            if n and len(n) >= 3:
                out[n] = q
    return out


NAMED_CELL = ('text', 'label', 'heading', 'subheading', 'dense', 'body', 'title', 'utility', '문구')


def _says_more(x, slot_intent, f) -> bool:
    """a cell meant to say what an item does (a proposal · a line), not a name tag — only there is 'the bare item name' wrong"""
    intent = slot_intent(f, x) if slot_intent else 'text'
    return intent not in NAMED_CELL or form_of(x.get('ref')) in ('짧은 구절', '한두 문장')


def problems(auto, ctx, rt, sl, others, part=None, slot_intent=None):
    """cells to write again: the same sentence as another cell of the sheet or an already written sheet of the part,
    another element's item named, only the item's name where a proposal belongs, empty."""
    names = _names(auto, ctx)
    vocab = _vocab(ctx, part)
    chips = {auto.plain(v) for u in rt['units'] for v in u['lock'].values() if v}
    flagged = {}
    seen = []
    for u in rt['units']:
        own = {(u.get('entity') or {}).get('id')} | set((u.get('entity') or {}).get('items') or [])
        for x in u['cells']:
            k = str(x['i'])
            v = auto.plain(sl['t'].get(k, '')).strip()
            if not v:
                flagged[k] = (u, '빈 칸')
                continue
            if u.get('entity') and u['entity']['kind'] in ('product', 'solution', 'case'):
                hit = next((n for n, q in names.items() if q not in own and n in v), None)
                if hit:
                    flagged[k] = (u, f'다른 항목 이름 ‘{hit}’ — 이 요소는 ‘{u["entity"]["name"]}’ 만 다룸')
                    continue
            bad = auto.unlinked_in(v, vocab) if vocab else []
            if bad:
                flagged[k] = (u, f'선택하지 않은 항목 ‘{bad[0]}’ — 이 고객이 고른 것으로만 (그 이름은 빼고)')
                continue
            if (v in chips or (u.get('entity') and v == u['entity']['name'])) and _says_more(x, slot_intent, sl['f']):
                flagged[k] = (u, '항목 이름만 썼음 — 그 항목이 이 고객에게 하는 일을 씀')
                continue
            if len(v) >= 6 and not re.fullmatch(r'[\d\s.,%~·\-()]+', v):
                same = next((w for w, _ in seen if auto.near_same(v, w)), None) or next((w for w in others if auto.near_same(v, w)), None)
                if same:
                    flagged[k] = (u, f'같은 장 · 파트의 다른 칸과 같은 말 (“{same[:40]}”)')
                    continue
            seen.append((v, u))
    return flagged


def repair(auto, ctx, sl, rt, flagged, llm, slot_intent, avoid=False):
    """the flagged cells again — a few a call (prompt_budget.WRITE_CELLS), each call with the facts and cells of its own
    elements only, the calls at once"""
    rows = []
    for k, (u, why) in flagged.items():
        x = next(c for c in u['cells'] if str(c['i']) == k)
        row = {'i': x['i'], 'element': u['label'], 'item': (u.get('entity') or {}).get('name') or '', 'why': pb.cut(why, 90),
               'intent': pb.cut(slot_intent(sl['f'], x), 60), 'max': x.get('max'), 'now': pb.cut(auto.plain(sl['t'].get(k, '')), 110)}
        if avoid:   # the wordings of this sheet's other cells — the new one must differ from every one of them
            row['avoid'] = [pb.cut(w, 30) for j, v in sl['t'].items() if j.isdigit() and j != k and len(w := auto.plain(v)) >= 4][:8]
        rows.append(row)
    by_label = {u['label']: u for u in rt['units']}

    def one(group):
        labels = list(dict.fromkeys(r['element'] for r in group))
        facts = {lb: pb.cut((by_label[lb].get('entity') or {}).get('facts', ''), 300) for lb in labels if lb in by_label and (by_label[lb].get('entity') or {}).get('facts')}
        own = {str(r['i']) for r in group}
        near = {str(c['i']): pb.cut(auto.plain(sl['t'].get(str(c['i']), '')), 40) for lb in labels if lb in by_label for c in by_label[lb]['cells']
                if str(c['i']) not in own and auto.plain(sl['t'].get(str(c['i']), ''))}
        prompt = ('한 장의 요소별 문구 가운데 아래 칸만 다시 씁니다. why 의 문제를 고치고, 그 요소의 항목 · 자료로만, max 이내로, 같은 장의 다른 칸과 다른 말로.\n'
                  f'다시 쓸 칸: {pb.dump(group)}\n'
                  + (f'요소 자료: {pb.dump(facts)}\n' if facts else '')
                  + (f'같은 요소의 다른 칸(그대로 둠): {pb.dump(dict(list(near.items())[:8]))}\n' if near else '')
                  + 'JSON만: {"items":[{"i":칸,"v":"문구"}]}')
        return llm.json(stage='auto_unit_repair', prompt=prompt, schema=obj({'items': arr(obj({'i': INT, 'v': STR}))}), temperature=0.2, max_tokens=1200)
    want = {r['i'] for r in rows}
    groups = [rows[k:k + pb.WRITE_CELLS] for k in range(0, len(rows), pb.WRITE_CELLS)]
    results = pb.fan_out(one, groups)
    if groups and all(err is not None for _, _, err in results):
        raise pb.first_error(results)
    out = {'items': [x for _, got, _ in results for x in ((got or {}).get('items') or [])]}
    fixed = 0
    for x in out.get('items') or []:
        if not (isinstance(x, dict) and x.get('i') in want and isinstance(x.get('v'), str) and x['v'].strip()):
            continue
        v, k = x['v'].strip(), str(x['i'])
        rest = [auto.plain(w) for j, w in sl['t'].items() if j.isdigit() and j != k and len(auto.plain(w)) >= 6]
        dup_reason = flagged[k][1].startswith('같은')
        # a repeat stays a repeat: keep the old wording; an empty cell or a bare item name is worse than a near repeat
        if (dup_reason and any(auto.near_same(v, w) for w in rest)) or any(auto._bare(v) == auto._bare(w) for w in rest):
            continue
        sl['t'][k] = v
        fixed += 1
    return fixed


def shorten(auto, sl, rt, llm) -> int:
    """element cells over their box, shortened in their own form — the part's shortening makes noun phrases of every cell, a
    scene sentence ('고객은 … 쉬고, 직원은 … 관리합니다') came back as '쾌적 휴식 환경 및 원격 설비 관리'."""
    rows = [{'i': x['i'], 'element': u['label'], 'max': x['max'], 'v': auto.plain(sl['t'].get(str(x['i']), ''))} for u in rt['units'] for x in u['cells']]
    rows = [r for r in rows if r['v'] and not grounding.fits_slot(auto, sl, r['i'], r['v'], r['max'])][:pb.CHECK_CELLS]
    if not rows:
        return 0
    want = {r['i']: r for r in rows}
    tries = {'n': 0}

    def check(d):
        tries['n'] += 1
        got = d.get('items') if isinstance(d, dict) else None
        if not isinstance(got, list):
            return 'items:[{i,v}] 필요'
        long = [f"칸 {x['i']}: {len(x['v'])}자 → {want[x['i']]['max']}자" for x in got if isinstance(x, dict) and x.get('i') in want
                and isinstance(x.get('v'), str) and not grounding.fits_slot(auto, sl, x['i'], x['v'], want[x['i']]['max'])]
        return '아직 김 — ' + ' / '.join(long) if long and tries['n'] == 1 else True
    try:
        out = llm.json(stage='auto_unit_shorten', prompt=('아래 문구를 각 max 글자 이내로 줄입니다. 원래 형식을 지킵니다 — 문장이면 ‘…합니다’ · ‘…해요’ 로 끝나는 '
                                                         '완결된 문장 그대로(이름 · 명사 나열로 바꾸지 않음), 짧은 이름이면 짧은 이름. 뜻 · 항목 이름 · 수치는 보존하고 '
                                                         '덜 중요한 수식어부터 뺍니다. JSON items:[{i,v}].\n' + compact(rows)),
                       schema=obj({'items': arr(obj({'i': INT, 'v': STR}))}), validate=check, temperature=0, max_tokens=1500)
    except Exception as exc:
        if type(exc).__name__ == 'JobCancelled' or getattr(exc, 'code', '') == 'cancelled':
            raise
        return 0
    n = 0
    for x in out.get('items') or []:
        if isinstance(x, dict) and x.get('i') in want and isinstance(x.get('v'), str) and x['v'].strip() \
                and grounding.fits_slot(auto, sl, x['i'], x['v'], want[x['i']]['max']):
            sl['t'][str(x['i'])] = x['v'].strip()
            n += 1
    return n


def write_frame(auto, ctx, plan, part, pp, sl, nodes, rt, llm, slot_intent):
    if not rt['frame']:
        return {}
    done = [{'element': u['label'], 'item': (u.get('entity') or {}).get('name') or '',
             'text': [pb.cut(v, 50) for x in u['cells'] if (v := auto.plain(sl['t'].get(str(x['i']), '')))][:3]} for u in rt['units']][:8]
    want = {x['i'] for x in rt['frame']}
    prompt = '\n'.join([
        '한 장의 요소들을 각자 썼습니다. 이제 이 장 전체에 걸리는 칸(제목 · 부제 등)만 씁니다.',
        f"고객: {pb.cut(ctx['customer'], 30)} · 과제: {pb.cut(ctx['title'], 50)}",
        f"파트: {pb.cut(part['name'], 24)} — {pb.cut(pp.get('message', ''), 90)}",
        f"장: {pb.cut(auto.load()['layouts'][sl['f']].get('name') or sl['f'], 40)}" + (f" — {pb.cut(d, 200)}" if (d := _sheet_directive(sl, nodes)) else ''),
        *([f"방향(문구로 옮기지 않음): {pb.cut(sl['directive'], 120)}"] if sl.get('directive') else []),
        '요소 결과: ' + pb.dump(done),
        *(['이 장이 답할 요구(요소가 맡지 않은 것 — 장 전체 칸에서 답함): ' + pb.dump(_req_short(rt['points'], 90))] if rt.get('points') else []),
        '칸: ' + pb.dump(_cell_rows(auto, sl['f'], rt['frame'], slot_intent)),
        '규칙: 제목은 요소 결과가 함께 말하는 것을 한 줄로 묶습니다 — 요소에 없는 항목 · 기능 · 수치를 제목에 넣지 않고, 요소 문장을 그대로 옮기지 않음. '
        '요소가 맡지 않은 요구는 제목 아래 칸(부제)에서만, 요소 내용과 이어질 때 답합니다. max 이내. JSON만: {"t":[{"i":칸,"v":문구}]}',
    ])

    cap = {x['i']: x['max'] for x in rt['frame']}
    tries = {'n': 0}

    def check(d):
        tries['n'] += 1
        got = d.get('t') if isinstance(d, dict) else None
        if not isinstance(got, list):
            return 't:[{i,v}] 필요'
        bad = [x.get('i') for x in got if isinstance(x, dict) and x.get('i') not in want]
        missing = sorted(want - {x.get('i') for x in got if isinstance(x, dict) and isinstance(x.get('v'), str) and x['v'].strip()})
        long = [f"칸 {x['i']}: {len(x['v'])}자 → {cap[x['i']]}자 이내" for x in got if isinstance(x, dict) and x.get('i') in want
                and isinstance(x.get('v'), str) and not grounding.fits_slot(auto, sl, x['i'], x['v'], cap[x['i']])]
        if tries['n'] == 1 and (bad or long or missing):
            return (f'요청하지 않은 칸 {bad}. ' if bad else '') + (f'빠진 칸 {missing} — 모든 칸을 씀. ' if missing else '') \
                + ('칸 길이 초과 — ' + ' / '.join(long) + '. 같은 뜻 · 같은 형식으로 줄여 다시.' if long else '')
        return True
    try:
        out = llm.json(stage='auto_frame_fill', prompt=prompt, schema=obj({'t': arr(obj({'i': INT, 'v': STR}))}), validate=check, temperature=0.2, max_tokens=1200)
    except Exception as exc:
        if type(exc).__name__ == 'JobCancelled' or getattr(exc, 'code', '') == 'cancelled':
            raise
        return {}
    got = {str(x['i']): x['v'].strip() for x in out.get('t') or [] if isinstance(x, dict) and x.get('i') in want and isinstance(x.get('v'), str)}
    return {**{str(i): '' for i in want}, **got}   # an unanswered frame cell is empty, not the sample's wording


def _needs_extra(auto, slides, u):
    """핵심 제안 장: the 니즈 장's row it elaborates (written first)."""
    k = u.get('needs_row')
    if k is None:
        return ''
    needs = next((sl for sl in slides if sl['f'] == 'L_VS_NEEDS' and sl.get('t')), None)
    if not needs:
        return ''
    t = needs['t']
    row = {'니즈': auto.plain(t.get(str(7 + 7 * k), '')), '기술': auto.plain(t.get(str(8 + 7 * k), '')), '핵심 제안': auto.plain(t.get(str(10 + 7 * k), '')),
           '세부 제안': [auto.plain(t.get(str(11 + 7 * k), '')), auto.plain(t.get(str(12 + 7 * k), ''))]}
    return f"이 장은 니즈 장 Q{k + 1} 행을 풀어 쓰는 장입니다: {compact(row)} — 이 요소는 그 가운데 {u['label']}번째 세부 제안을 이 행의 항목이 실제로 하는 일로 씁니다."


def run(auto, ctx, plan, part, pp, slides, split, llm, slot_intent, tools_for=None, written=None) -> None:
    """write every split sheet: elements in parallel, then the merge checks and the frame.
    written: {slide index: [cell ids]} already written in this part (the part call) — what the checks compare against."""
    written = {s: list(v) for s, v in (written or {}).items()}
    for s in sorted(split, key=lambda s: (slides[s]['f'].startswith('L_VS_CORE_'), s)):
        with item_mask.sheet(auto, ctx, slides[s]):   # (its calls name only this sheet's own solutions)
            _run_sheet(auto, ctx, plan, part, pp, slides, split, s, llm, slot_intent, tools_for, written)


def _run_sheet(auto, ctx, plan, part, pp, slides, split, s, llm, slot_intent, tools_for, written) -> None:
    sl, rt = slides[s], split[s]
    _, nodes = flow_nodes(sl['f'])
    tools_text = tools_for(sl, nodes) if tools_for else ''

    def one(u):
        return write_unit(auto, ctx, plan, part, pp, sl, nodes, rt['units'], u, llm, _needs_extra(auto, slides, u), slot_intent, tools_text)
    with ThreadPoolExecutor(max_workers=min(WORKERS, len(rt['units']))) as pool:
        futures = [pool.submit(copy_context().run, one, u) for u in rt['units']]
        results = [future.result() for future in futures]
    for u, vals in zip(rt['units'], results):
        for x in u['cells']:
            sl['t'][str(x['i'])] = vals.get(str(x['i']), '')
    others = [auto.plain(slides[n]['t'].get(str(i), '')) for n, ids in written.items() if n != s for i in ids]
    others = [v for v in others if len(v) >= 6]
    flagged = problems(auto, ctx, rt, sl, others, part, slot_intent) if 'merge' in nodes else {}
    fixed = repair(auto, ctx, sl, rt, flagged, llm, slot_intent) if flagged else 0
    if flagged:   # once more for what is still wrong, with the wordings to avoid spelled out
        again = {k: v for k, v in problems(auto, ctx, rt, sl, others, part, slot_intent).items() if k in flagged}
        if again:
            fixed += repair(auto, ctx, sl, rt, again, llm, slot_intent, avoid=True)
    shortened = shorten(auto, sl, rt, llm)
    shortened += shorten(auto, sl, rt, llm)   # once more for what is still over its box
    sl['t'].update(write_frame(auto, ctx, plan, part, pp, sl, nodes, rt, llm, slot_intent))
    for x in rt['frame']:
        sl['t'].setdefault(str(x['i']), '')
    for x in rt.get('rest') or []:
        sl['t'].setdefault(str(x['i']), (sl.get('ex_t') or {}).get(str(x['i']), ''))
    written[s] = [x['i'] for u in rt['units'] for x in u['cells']] + [x['i'] for x in rt['frame']]
    sl['_fan_rt'] = rt
    # element cells that are not item-name cells (a spec value · a line) although the layout marks them 'product': the
    # selected-only guard clears such cells unless they hold a selected item's name; written for this card's item, they stay
    sl['_fan_keep'] = {str(x['i']): sl['t'].get(str(x['i'])) for u in rt['units'] if (u.get('entity') or {}).get('kind') == 'product'
                       for x in u['cells'] if x.get('mode') == 'product' and form_of(x.get('ref')) not in ('모델 코드', '짧은 이름표 (2~8자)', '')}
    sl['fanout'] = {'units': [{'id': u['id'], 'label': u['label'], 'entity': {k: (u.get('entity') or {}).get(k) for k in ('kind', 'id', 'name')},
                               'points': [p['id'] for p in u.get('points') or []], 'cells': [x['i'] for x in u['cells']]} for u in rt['units']],
                    'frame': [x['i'] for x in rt['frame']], 'flagged': {k: why for k, (_, why) in flagged.items()}, 'fixed': fixed, 'shortened': shortened}


def refix(auto, ctx, sl, fixes, reasons, llm, slot_intent) -> dict:
    """the part check's fixes for a split sheet: a frame cell takes the fix, an element cell is written again inside its element
    (its item · facts · the checker's reason) — the checker does not know the elements and pasted a requirement into a space's scene."""
    fo = sl.get('fanout') or {}
    rt = sl.get('_fan_rt')
    if not fo or not rt:
        return {}
    unit_of = {x['i']: u for u in rt['units'] for x in u['cells']}
    done, flagged = {}, {}
    for x in fixes:
        i = x.get('i')
        if i in unit_of:
            why = reasons.get(i) or '검수 지적'
            flagged[str(i)] = (unit_of[i], f"검수: {why[:200]} (검수의 예시 문구 — 형식은 따르지 않음: {str(x.get('v'))[:80]}) — 이 요소의 항목 · 자료 안에서, 지금 칸의 형식(문장이면 문장)대로 고침")
        else:
            done[str(i)] = x.get('v')
    if flagged:
        before = {k: sl['t'].get(k) for k in flagged}
        repair(auto, ctx, sl, rt, flagged, llm, slot_intent)
        done.update({k: sl['t'].get(k) for k in flagged if sl['t'].get(k) != before[k]})
    return done


def keep_after_guard(auto, ctx, part, slides) -> None:
    """after composer.enforce_linked: restore an element's spec · line cells it cleared only for not being an item name"""
    vocab = _vocab(ctx, part)
    for sl in slides:
        for k, v in (sl.get('_fan_keep') or {}).items():
            pv = auto.plain(v or '')
            if pv and not auto.plain(sl.get('t', {}).get(k, '')) and not (vocab and auto.unlinked_in(pv, vocab)):
                sl['t'][k] = v
