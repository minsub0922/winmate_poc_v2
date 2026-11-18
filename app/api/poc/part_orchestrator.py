"""파트 orchestrator — every part of a composition has one; it runs the part's sheets through their layout flows
(admin 「레이아웃 관리」 → 입력 · 흐름) and answers for the part as a whole.

    plan     before any sheet is written (stage ``auto_part_plan``): for every sheet the AI writes, the 파트 지시 — what this
             sheet shows this customer, in its layout's intent — and the requirement points · selected items it carries;
             for the 가치 제안 part the three 니즈 columns ↔ 핵심 제안 1 · 2 · 3 (one customer need and the item that answers
             it per column). The directive reaches the sheet as its flow's ``part_directive`` input (mandatory for every
             writing flow, app/api/layout_flows.py ALWAYS), the points as the sheet's focus, the columns through the
             composer's need_columns / column_items.
    sheets   each sheet then runs its own flow (collect → bind → write | split · element · merge → shorten → agent →
             pictures → verify → lock) — compose_grounding.fill_part · layout_fanout · layout_flows, unchanged.
    review   once the sheets are written, before pictures and the part check (stage ``auto_part_review``): the written text of
             every sheet against its directive and the repeats · empty cells the code found → the sheets to write again with a
             concrete instruction (at most ``MAX_REDO``, one problem on one sheet); they are rewritten inside their own cells in
             parallel (``auto_sheet_redo``, element sheets inside their elements — layout_fanout.repair), and a rewritten cell
             that now repeats another sheet or carries Chinese characters goes back. The part check (verify) then judges the
             final text once, its issues kept on the sheet they are about (compose_grounding.sheet_issues).
    trace    which flow nodes ran for each sheet and what the orchestrator decided — ``sl['trace']`` (→ layout ``trace``)
             and ``plan['orchestration'][part id]`` in the job result.

A part with no sheet the AI writes (제안 개요 · Why Samsung · 서비스 제안 · 사례 · 스펙 장 묶음) needs no model call: its
orchestrator keeps the authored sheets. The cover part follows the deck plan. A failed plan call leaves the code's own
allocation (the composition still runs); a failed review keeps the checked sheets.
"""
from __future__ import annotations

import json
import re
import threading
import time

from .. import layout_cells
from .. import layout_flows as flows
from . import compose_grounding as grounding
from . import item_mask
from . import prompt_budget as pb

INT, STR = {'type': 'INTEGER'}, {'type': 'STRING'}
MAX_REDO = 3
DIRECTIVE_MAX = 140
CHROME_KINDS = ('divider', 'toc', 'cover', 'static', 'dss')   # code-written: part message · section index · fixed values
_LOCK = threading.RLock()


def obj(props, required=None):
    return {'type': 'OBJECT', 'properties': props, 'required': list(props) if required is None else required}


def arr(item):
    return {'type': 'ARRAY', 'items': item}


def compact(v) -> str:
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def _cancelled(exc) -> bool:
    return type(exc).__name__ == 'JobCancelled' or getattr(exc, 'code', '') == 'cancelled'


def _flow(f):
    from .layout_flows import flow   # request snapshot (admin one-sheet experiments) first, then the registry
    return flow(f)


def _say(auto, f) -> str:
    """what the layout says, as its 칸 설계 / catalog puts it"""
    meta = (auto.load().get('layouts') or {}).get(f) or {}
    says = (layout_cells.design(f).get('say') or '').strip()
    if not says:
        m = re.search(r'[“"]([^”"]{4,80})[”"]', meta.get('g') or '')
        says = m.group(1) if m else ''
    return says


def _name(auto, ctx, q):
    lib = auto.load()
    return ((ctx.get('short') or {}).get(q) or ((lib.get('products_all') or {}).get(q) or {}).get('name')
            or ((lib.get('solutions') or {}).get(q) or {}).get('name') or str(((lib.get('cases') or {}).get(str(q)) or {}).get('cust') or q))


def writable(auto, ctx, sl) -> int:
    """how many text cells of this sheet the AI writes (its flow writes it, the cell is not locked by code · admin)"""
    if sl.get('fixed') or sl.get('keep') or sl['kind'] in CHROME_KINDS:
        return 0
    v = _flow(sl['f'])
    if v and v.get('kind') == 'market':
        return 0   # 업종 트렌드: verified market evidence (composer/market.py) — not this customer's story
    if v and not (flows.has(v['flow'], 'write') or flows.has(v['flow'], 'element') or flows.has(v['flow'], 'agent')):
        return 0
    try:
        return sum(1 for x in auto.slot_plan(ctx, sl) if 'lock' not in x)
    except Exception:  # noqa: BLE001 — a layout the library lost: the composer reports it on its own
        return 0


def _bound(auto, ctx, sl) -> str:
    b = sl.get('bind') or {}
    names = []
    if b.get('space'):
        names.append('공간 ' + ((ctx.get('space_by_id') or {}).get(b['space'], {}).get('name') or b['space']))
    for sid in b.get('spaces') or []:
        names.append('공간 ' + ((ctx.get('space_by_id') or {}).get(sid, {}).get('name') or sid))
    for q in (b.get('products') or ([b['product']] if b.get('product') else [])):
        names.append(_name(auto, ctx, q))
    if b.get('solution'):
        names.append(_name(auto, ctx, b['solution']))
    if b.get('case'):
        names.append('사례 ' + _name(auto, ctx, b['case']))
    return ' · '.join(dict.fromkeys(names))[:200]


def _units(f):
    from .layout_fanout import wants_split
    from ..layout_elements import plan_for
    if not wants_split(f):
        return []
    el = plan_for(f) or {}
    return [u['label'] for u in el.get('units') or [] if u.get('slots')]


def sheet_rows(auto, ctx, part, slides):
    """what the orchestrator sees of every sheet: its layout, what the layout says, what is bound to it, whether the AI writes it"""
    L = auto.load().get('layouts') or {}
    cores = sorted((n for n, sl in enumerate(slides) if sl['f'].startswith('L_VS_CORE_')), key=lambda n: slides[n]['f'])
    rows = []
    for s, sl in enumerate(slides):
        n = writable(auto, ctx, sl)
        row = {'s': s, 'layout': (L.get(sl['f']) or {}).get('name') or sl['f'], 'kind': sl['kind'], 'writes': n > 0}
        if n:
            row['cells'] = n
            if (says := _say(auto, sl['f'])):
                row['says'] = says
            if (flow_says := _flow_prompt(sl['f'])):
                row['flow'] = flow_says
            if (bound := _bound(auto, ctx, sl)):
                row['bound'] = bound
            if (units := _units(sl['f'])):
                row['elements'] = units
            if sl['f'] == 'L_VS_NEEDS':
                row['note'] = '니즈 장 — 세 열(Q1 · Q2 · Q3)이 columns 1 · 2 · 3, 열마다 니즈 · 기술 · 핵심 제안'
            elif s in cores:
                k = cores.index(s)
                row['note'] = f'핵심 제안 장 — 니즈 장 {k + 1}열(columns {k + 1})을 세부 제안 둘로 풀어 씀'
        else:
            row['why'] = ('고정 · 원문 유지' if sl.get('fixed') or sl.get('keep') or sl['kind'] in ('static', 'dss') else
                          '시장 근거로 채움(업종 트렌드)' if ((_flow(sl['f']) or {}).get('kind') == 'market') else
                          '코드가 채움(간지 · 목차 · 표지 줄)' if sl['kind'] in CHROME_KINDS else '쓸 칸 없음')
        rows.append(row)
    return rows


FACT_KINDS = ('space', 'bird', 'map', 'bom', 'spec', 'solution', 'case', 'tech')   # sheets whose flow writes an item's facts, not answers


def _flow_prompt(f) -> str:
    """the sheet's own writing instruction in its admin flow (write · merge node prompt) — the frame a directive stays inside"""
    v = _flow(f)
    if not v:
        return ''
    node = next(iter(flows.module(v['flow'], 'write') or flows.module(v['flow'], 'merge')), None)
    return re.sub(r'\s+', ' ', str((node or {}).get('prompt') or '')).strip()[:220]


def _requirement(r) -> dict:
    return {k: r[k] for k in ('id', 'kind', 'text', 'label', 'answer', 'speaker') if r.get(k)}


def _neighbors(ctx, plan, part):
    ol = ctx.get('outline') or []
    ids = [o['id'] for o in ol]
    if part['id'] not in ids:
        return []
    k = ids.index(part['id'])
    return [{'where': '앞' if j < k else '뒤', 'name': ol[j].get('name'), 'message': ol[j].get('message')} for j in (k - 1, k + 1) if 0 <= j < len(ol)]


# ---------------------------------------------------------------- plan
def column_hint(auto, plan, n=3):
    """the code's draft of the 니즈 columns: one need per keyman (in the order the customer lists them — the weightier first), then the
    customer's other needs, then constraints; never an approval request, never the same concern twice. Qwen left to itself paired
    two TV needs and an approval request and dropped the operations lead's 복구 절차 (2026-11-18 forest runs)."""
    pts = [x for x in plan.get('points') or [] if x.get('kind') in ('need', 'constraint')]
    out, speakers = [], set()
    distinct = lambda x: all(not auto.near_same(str(x.get('text') or ''), str(c.get('text') or '')) and (x.get('label') or '') != (c.get('label') or '') for c in out)
    for x in pts:
        sp = re.sub(r'\(.*?\)', '', str(x.get('speaker') or '')).strip()
        if sp and sp not in speakers and x.get('kind') == 'need' and distinct(x):
            speakers.add(sp)
            out.append(x)
    for kind in ('need', 'constraint'):
        for x in pts:
            if len(out) < n and x not in out and x.get('kind') == kind and distinct(x):
                out.append(x)
    return out[:n]


def _owned(auto, ctx, pp, n=8, each=60):
    out = []
    for r in ((pp.get('brief') or {}).get('requirements') or [])[:n]:
        row = {'id': r['id'], 'kind': r.get('kind'), 'text': pb.cut(r.get('label') or r.get('text') or '', each)}
        if r.get('speaker'):
            row['who'] = pb.cut(re.sub(r'^[■●]\s*', '', r['speaker']), 20)
        out.append(row)
    return out


def plan_sheet_prompt(auto, ctx, plan, part, pp, slides, rows, row, items):
    """one sheet's plan: what it shows this customer, which requirements · items it takes"""
    k = [r['s'] for r in rows].index(row['s'])
    near = lambda j: rows[j]['layout'] if 0 <= j < len(rows) else ''  # noqa: E731
    others = [pb.cut(r['layout'], 22) for r in rows if r['writes'] and r['s'] != row['s']][:5]
    names = [{'id': q, 'name': pb.cut(_name(auto, ctx, q), 24)} for q in items][:8]

    def build(level):
        lines = [f"제안서 「{pb.cut(part.get('name'), 24)}」 파트의 장 하나를 어떻게 쓸지 메모합니다 — 장표 문구는 쓰지 않습니다.",
                 f"고객: {pb.cut(ctx.get('customer'), 30)} · 업종 {pb.cut(ctx.get('vertical_name') or ctx.get('ind') or '', 20)}",
                 f"파트 메시지: {pb.cut(pp.get('message'), (100, 80, 60)[min(level, 2)])}",
                 f"이 장: {pb.cut(row['layout'], 40)}" + (f" — 말할 것: {pb.cut(row.get('says'), 70)}" if row.get('says') else '')
                 + (f" · 묶인 것: {pb.cut(row.get('bound'), 80)}" if row.get('bound') else '') + (f" · 요소: {' · '.join(row['elements'][:6])}" if row.get('elements') else ''),
                 *([f"이 장의 작성 지시(관리자 흐름): {pb.cut(row['flow'], (160, 120, 80)[min(level, 2)])}"] if row.get('flow') else []),
                 f"앞 장: {pb.cut(near(k - 1), 26) or '-'} · 뒤 장: {pb.cut(near(k + 1), 26) or '-'}" + (f" · 같은 파트 다른 장: {' · '.join(others)}" if others and level < 2 else ''),
                 '이 파트가 맡은 요구: ' + (pb.dump(_owned(auto, ctx, pp, (8, 6, 4)[min(level, 2)], (60, 50, 40)[min(level, 2)])) or '없음'),
                 '고를 수 있는 항목: ' + (pb.dump(names) if names else '없음'),
                 '답:',
                 '- directive: 이 장을 쓰는 사람에게 주는 메모. ‘무엇을 · 어떤 면으로’를 명사구 80자 이내로(예: ‘카운터 메뉴보드 — 메뉴 정보 전달 · 4K 선명도’). '
                 '장표 문장 · 효과 단정 · 자료에 없는 기능 · 수치는 쓰지 않음. 다른 장과 다른 각도. 고를 항목이 없으면 운영 · 절차 · 확인 방식으로.',
                 '- points: 이 장의 일로 답할 요구 id(위에서만, 0~2개). 승인 · 일정 요구는 제품 · 공간 · 솔루션 장에 두지 않음.',
                 '- items: 이 장에 나올 항목 id(위에서만).',
                 'JSON만: {"directive":"…","points":["R1"],"items":["id"]}']
        return '\n'.join(lines)
    return pb.fit(build, levels=2)


def plan_columns_prompt(auto, ctx, plan, part, pp):
    """the 니즈 장's three columns (Q1 · Q2 · Q3) = 핵심 제안 1 · 2 · 3"""
    owner_name = lambda pid: (next((o.get('name') for o in ctx.get('outline') or [] if o.get('id') == pid), None) or pid)  # noqa: E731
    cands = [{'id': x['id'], 'kind': x.get('kind'), 'text': pb.cut(x.get('label') or x.get('text') or '', 50),
              **({'who': pb.cut(re.sub(r'^[■●]\s*', '', x['speaker']), 20)} if x.get('speaker') else {})}
             for x in plan.get('points') or [] if x.get('kind') not in ('context', 'decision')][:12]
    draft = [{'Q': k + 1, 'id': x['id'], 'text': pb.cut(x.get('label') or x.get('text') or '', 40),
              'answered_by': [pb.cut(_name(auto, ctx, q), 20) for q in list(x.get('products') or []) + list(x.get('solutions') or [])][:3]}
             for k, x in enumerate(column_hint(auto, plan))]
    selected = [{'id': q, 'name': pb.cut(_name(auto, ctx, q), 24)} for q in list(ctx.get('products') or []) + list(ctx.get('solutions') or [])][:10]
    return '\n'.join([
        f"제안서 「{pb.cut(part.get('name'), 24)}」 파트의 니즈 장 세 열(Q1 · Q2 · Q3)을 정합니다. 열 k 는 핵심 제안 k 장으로 이어집니다.",
        f"고객: {pb.cut(ctx.get('customer'), 30)} · 업종 {pb.cut(ctx.get('vertical_name') or ctx.get('ind') or '', 20)}",
        '열 초안(코드가 키맨마다 한 고민씩 나눈 것): ' + pb.dump(draft),
        '고민 후보: ' + pb.dump(cands),
        '고른 제품 · 솔루션: ' + pb.dump(selected),
        '규칙: 초안이 서로 다른 고민 셋이면 그대로 쓰고, 더 맞는 고민이 있을 때만 후보에서 바꿈. 같은 고민을 두 열에 쓰지 않음. '
        '열마다 points(첫 id 가 그 열의 고민) · items(그 고민에 실제로 답하는 고른 항목 — 열마다 다른 대표, 고른 항목이 세 열 어딘가에 모두) · '
        'directive(그 열의 핵심 제안 장 메모 — 대표 항목이 자료대로 이 고민에 하는 일, 다른 열과 다른 해법을 명사구 80자 이내).',
        'JSON만: {"columns":[{"points":["R1"],"items":["id"],"directive":"…"}]}'])


def plan_message_prompt(ctx, part, pp):
    """the part's line to this customer (the 간지 shows it)"""
    labels = [pb.cut(r.get('label') or r.get('text') or '', 30) for r in ((pp.get('brief') or {}).get('requirements') or [])[:5]]
    return '\n'.join([
        f"제안서 「{pb.cut(part.get('name'), 24)}」 파트가 이 고객에게 남길 말 한 줄을 씁니다(간지에 쓰임). 32자 이내, 고객의 말로 — ‘~제시한다’ 같은 설명문이 아니라 제안의 말로.",
        f"고객: {pb.cut(ctx.get('customer'), 30)} · 파트 메시지(덱 계획): {pb.cut(pp.get('message'), 100)}",
        *(['이 파트가 맡은 요구: ' + ' · '.join(labels)] if labels else []),
        'JSON만: {"message":"…"}'])


def plan_prompt(auto, ctx, plan, part, pp, slides, rows):
    brief = pp.get('brief') or {}
    own = [_requirement(r) for r in brief.get('requirements') or []]
    own_ids = {r['id'] for r in own}
    others = [{'id': x['id'], 'label': x.get('label') or x.get('text', '')[:40], 'owner': (ctx.get('plan_by') or {}).get(x.get('owner'), {}).get('name') or x.get('owner')}
              for x in plan.get('points') or [] if x['id'] not in own_ids]
    facts = [{'ref': k, 'name': v.get('name'), 'text': str(v.get('text') or '')[:220]} for k, v in (brief.get('facts') or {}).items()]
    items = list(dict.fromkeys(list(pp.get('products') or []) + list(pp.get('solutions') or []) + [str(x) for x in pp.get('cases') or []]))
    has_needs = any(sl['f'] == 'L_VS_NEEDS' for sl in slides if writable(auto, ctx, sl))
    summary = (ctx.get('summary') or '')[:1500]
    owner_name = lambda pid: (next((o.get('name') for o in ctx.get('outline') or [] if o.get('id') == pid), None) or pid)
    candidates = [{'id': x['id'], 'kind': x.get('kind'), 'label': x.get('label') or '', 'text': str(x.get('text') or '')[:70],
                   **({'keyman': re.sub(r'^[■●]\s*', '', x['speaker'])[:30]} if x.get('speaker') else {}), 'owner': owner_name(x.get('owner'))}
                  for x in plan.get('points') or [] if x.get('kind') != 'context'] if has_needs else []
    selected = [{'id': q, 'name': _name(auto, ctx, q)} for q in list(ctx.get('products') or []) + list(ctx.get('solutions') or [])] if has_needs else []
    draft = [{'Q': k + 1, 'id': x['id'], **({'keyman': re.sub(r'^[■●]\s*', '', x['speaker'])[:30]} if x.get('speaker') else {}), 'label': x.get('label') or '',
              'answered_by': [_name(auto, ctx, q) for q in list(x.get('products') or []) + list(x.get('solutions') or [])]}
             for k, x in enumerate(column_hint(auto, plan))] if has_needs else []
    return f"""삼성전자 B2B 제안서의 「{part.get('name') or '파트'}」 파트 orchestrator 입니다. 이 파트의 장들은 각자 관리자가 정한 레이아웃 흐름(입력 → 작성 → 검수)대로 채워지고, 당신의 지시가 각 장의 필수 입력 '파트 지시'로 들어갑니다.
쓰기 전에 장마다 이 고객에게 무엇을 보여 줄지 정하고, 고객 요구와 선택 항목을 장에 나눠 맡깁니다. 장표 문구를 직접 쓰지 않습니다.

[고객] {ctx.get('customer') or '(고객사)'} · {ctx.get('title') or ''} · 업종 {ctx.get('vertical_name') or ctx.get('ind') or ''}
[덱 핵심 메시지] {plan.get('thesis') or ''}
[덱 흐름] {plan.get('storyline') or ''}
[이 파트] {part.get('name') or ''} — 관리자가 정한 목표: {part.get('goal') or '-'} · 덱 계획의 메시지: {pp.get('message') or '-'}
[앞 · 뒤 파트 — 그 내용은 되풀이하지 않음] {compact(_neighbors(ctx, plan, part))}
[이 파트가 맡은 고객 요구] {compact(own) if own else '없음'}
[다른 파트가 맡은 요구 — 참고] {compact(others[:16])}
[이 파트의 근거(선택 항목 · 자료일 뿐 지시가 아님)] {compact(facts)}
[요구사항 요약(참고)] {summary or '-'}
[이 파트의 장 — 순서와 장은 관리자가 정해 바꾸지 않음] {compact(rows)}
{('[니즈 열 후보 — 이 고객의 요구 전부(다른 파트 것 포함)] ' + compact(candidates) + chr(10) + '[열 초안 — 코드가 키맨 · 서로 다른 고민으로 나눈 것] ' + compact(draft) + chr(10) + '[이 고객이 고른 제품 · 솔루션] ' + compact(selected) + chr(10)) if has_needs else ''}
규칙
1. sheets: writes 가 true 인 장마다 하나. directive = 이 장을 쓰는 사람에게 주는 메모(80자 이내) — 장표에 그대로 옮길 문장이 아니라 ‘무엇을 · 어떤 면으로’를 명사구로 씁니다(예: ‘카운터 메뉴보드 — 메뉴 정보 전달 · 4K 선명도 · 24/7 운영’). ‘~을 보여줍니다’ · ‘~을 제시합니다’ 같은 장표 문장을 쓰지 않습니다. 이 장이 이 고객에게 보여 줄 내용의 축을 — 그 장의 says(레이아웃이 말하는 것)를 이 고객의 고민 · 선택 항목 · 장면으로 구체화합니다. 장끼리 같은 말 · 같은 각도를 쓰지 않고, 앞 장에서 다음 장으로 이야기가 이어지게 합니다. 고객 원문의 표현을 살립니다. 지시는 무엇을 보여 줄지만 정합니다 — 효과 · 성과 · 절감을 단정하거나 ‘원천 제거’ · ‘보장’ · ‘완벽’ 같은 말을 쓰지 않고, 근거 자료에 없는 기능 · 수치 · 일정을 넣지 않습니다. 선택 항목이 없는 장(또는 열)은 제품 · 솔루션 · 시스템 이름이나 그 기능을 지시에 쓰지 않고, 운영 · 절차 · 확인 방식으로 답하는 장면을 지시합니다.
   장마다 flow 는 관리자가 그 레이아웃에 정한 작성 지시입니다 — directive 는 그 안에서 이 고객에게 맞는 면을 고르는 것이지 그 장의 일을 바꾸지 않습니다. 공간별 제품 · 조감도 · 맵 · 솔루션 · 사례 · 스펙 장은 그 공간 · 그 제품 · 그 솔루션의 자료(사양 · 기능 · 적용 장면)를 쓰는 장입니다 — 고객 고민과 닿는 특징을 고르게 하되, 요구에 대한 해법 설명 · 승인 요청 · 일정 · 효과 주장을 그 장에 넣게 하지 않습니다. 공간 목록에 없는 공간, 고르지 않은 제품 · 솔루션을 지시에 쓰지 않습니다. 같은 제품이 여러 공간 장에 나오면 장마다 그 공간에 맞는 다른 특징(사양)을 고르게 하고, 맵 장은 앞 장들의 문장을 옮기지 않고 공간마다 한 줄로 잇게 합니다.
2. points: 그 장의 일로 답할 수 있는 요구 id(이 파트가 맡은 것)만. 승인 요청 · 일정(decision)은 제품 · 솔루션 · 공간 장에 두지 않습니다. 한 요구를 세 장 넘게 되풀이하지 않습니다.
3. items: 그 장에 나올 선택 항목 id({compact(items) if items else '없음'} 가운데서만).
4. columns: {'니즈 장의 세 열(Q1 · Q2 · Q3)이자 핵심 제안 1 · 2 · 3 장입니다(장 목록의 note). 열 초안은 키맨마다 한 고민씩 나눈 것입니다 — 이 고객의 서로 다른 고민 세 가지로 잘 나뉘었으면 그 id 를 그대로 쓰고, 더 맞는 고민이 있을 때만 니즈 열 후보에서 바꿉니다. 같은 고민을 다른 말로 두 열에 쓰지 않습니다. 승인 요청(decision) · 범위 · 일정은 고민이 아니라 열이 될 수 없습니다. 다른 파트가 맡은 요구도 고를 수 있습니다(그 파트가 자세히 답하고, 이 장은 가치로 잇습니다). 열마다 points(첫 id 가 그 열의 고민), items(그 고민에 실제로 답하는 선택 항목 — 첫 항목이 그 열의 대표, 열마다 다른 대표를 고르고, 고른 제품 · 솔루션이 세 열 어딘가에 모두 나오게), directive(그 열을 풀어 쓰는 핵심 제안 장의 파트 지시 메모 — 대표 항목이 자료대로 이 고민에 하는 일, 다른 열과 다른 해법 · 장면을 명사구로, 80자 이내). 핵심 제안 장은 sheets 에 넣지 않고, 니즈 장의 directive 는 세 고민을 한 장에 잇는 말로 씁니다.' if has_needs else '이 파트에는 니즈 장이 없으니 빈 목록입니다.'}
5. message: 이 파트가 이 고객에게 남길 말 한 줄(간지에 쓰임, 32자 이내, 고객의 말로, ‘~제시한다’ 같은 설명문이 아니라 제안의 말로).
JSON만."""


def plan_schema(rows, rids, items, has_needs):
    ids = [r['s'] for r in rows if r['writes']]
    enum = lambda values: {'type': 'STRING', **({'enum': list(values)} if values else {})}
    col = obj({'points': arr(enum(rids)), 'items': arr(enum(items)), 'directive': STR})
    return obj({'message': STR,
                'sheets': arr(obj({'s': {'type': 'INTEGER', **({'enum': ids} if ids else {})}, 'directive': STR, 'points': arr(enum(rids)), 'items': arr(enum(items))})),
                'columns': {**arr(col), **({'maxItems': 0} if not has_needs else {'maxItems': 3})}})


def clean_plan(auto, ctx, plan, part, pp, slides, rows, d):
    """the model's plan → the plan the part runs: ids checked, every owned requirement placed, a directive for every written sheet;
    핵심 제안 k takes column k (its need · item · directive). Returns (orch, fixes)."""
    fixes = []
    d = d if isinstance(d, dict) else {}
    writes = [r['s'] for r in rows if r['writes']]
    points = {x['id']: x for x in plan.get('points') or []}
    own = [r['id'] for r in (pp.get('brief') or {}).get('requirements') or [] if r.get('kind') != 'context' and r['id'] in points]
    items = set(pp.get('products') or []) | set(pp.get('solutions') or []) | {str(x) for x in pp.get('cases') or []}
    selected = set(ctx.get('products') or []) | set(ctx.get('solutions') or [])
    text = lambda v: grounding.HAN.sub('', re.sub(r'\s+', ' ', str(v or ''))).strip()
    by = {}
    for x in d.get('sheets') or []:
        if not isinstance(x, dict) or x.get('s') not in writes or x['s'] in by:
            continue
        pts = [r for r in dict.fromkeys(x.get('points') or []) if r in points]
        its = [q for q in dict.fromkeys(str(i) for i in x.get('items') or []) if q in items]
        if len(pts) != len(x.get('points') or []) or len(its) != len(x.get('items') or []):
            fixes.append(f"장 {x['s'] + 1}: 맡지 않은 요구 · 선택하지 않은 항목 제외")
        by[x['s']] = {'s': x['s'], 'directive': text(x.get('directive'))[:DIRECTIVE_MAX], 'points': pts, 'items': its}
    # 니즈 장의 세 열 ↔ 핵심 제안 1 · 2 · 3
    columns = []
    cores = sorted((s for s in writes if slides[s]['f'].startswith('L_VS_CORE_')), key=lambda s: slides[s]['f'])
    if any(slides[s]['f'] == 'L_VS_NEEDS' for s in writes):
        rank = {'need': 0, 'constraint': 1, 'risk': 2, 'question': 3}
        used = set()
        for c in d.get('columns') or []:
            if not isinstance(c, dict) or len(columns) >= 3:
                continue
            pts = [r for r in dict.fromkeys(c.get('points') or []) if r in points and points[r].get('kind') != 'context']
            pts.sort(key=lambda r: rank.get(points[r].get('kind'), 5))   # a need leads its column, an approval request never does
            if not pts or points[pts[0]].get('kind') == 'decision' or pts[0] in used:
                fixes.append('니즈 열 제외 — ' + ('승인 요청만 있는 열' if pts and points[pts[0]].get('kind') == 'decision' else '앞 열과 같은 니즈' if pts else '니즈 없음'))
                continue
            used.add(pts[0])
            columns.append({'points': pts, 'items': [q for q in dict.fromkeys(str(i) for i in c.get('items') or []) if q in selected],
                            'directive': text(c.get('directive'))[:DIRECTIVE_MAX]})
        for k, s in enumerate(cores):
            if k < len(columns):
                by[s] = {'s': s, 'directive': columns[k]['directive'] or (by.get(s) or {}).get('directive') or '', 'points': list(columns[k]['points']),
                         'items': [q for q in columns[k]['items'] if q in items] or (by.get(s) or {}).get('items') or []}
        if len(columns) < min(3, max(1, len(cores))):
            fixes.append(f'니즈 열 {len(columns)}개 — 나머지는 코드가 이어 채움')
    L = auto.load().get('layouts') or {}
    if cores and len(columns) < min(3, len(cores)):
        taken = {c['points'][0] for c in columns}
        for x in column_hint(auto, plan):
            if len(columns) >= min(3, len(cores)):
                break
            if x['id'] in taken:
                continue
            taken.add(x['id'])
            its = [q for q in list(x.get('solutions') or []) + list(x.get('products') or []) if q in selected]
            columns.append({'points': [x['id']], 'items': its, 'from': 'draft',
                            'directive': f"고객 고민 ‘{x.get('label') or str(x.get('text', ''))[:30]}’에 선택 항목이 자료대로 하는 일을 세부 제안 둘로"[:DIRECTIVE_MAX]})
            fixes.append(f"니즈 열 {len(columns)}: 초안의 {x['id']}")
        for k, s in enumerate(cores):
            if k < len(columns) and columns[k].get('from') == 'draft':
                by[s] = {'s': s, 'points': list(columns[k]['points']), 'items': [q for q in columns[k]['items'] if q in items], 'directive': columns[k]['directive']}
    for s in writes:
        if s not in by or not by[s]['directive']:
            says = _say(auto, slides[s]['f']) or (L.get(slides[s]['f']) or {}).get('name') or ''
            by[s] = {**(by.get(s) or {'s': s, 'points': [], 'items': []}), 'directive': f"{says} — {pp.get('message') or ''}".strip(' —')[:DIRECTIVE_MAX]}
            fixes.append(f'장 {s + 1}: 지시가 없어 레이아웃 설계 + 파트 메시지로')
    # every owned requirement on some sheet: one left out goes to the written sheet with the fewest points (니즈 · 핵심 제안 장 aside —
    # their rows are the columns)
    placed = {r for x in by.values() for r in x['points']}
    # the 니즈 장's frame (title · lead) answers the part's points its columns do not carry (layout_fanout plan_split) — a 핵심 제안
    # sheet elaborates its own column and would only be pushed off its angle
    needs = [s for s in writes if slides[s]['f'] == 'L_VS_NEEDS']
    # a requirement no sheet took is placed only where a sheet answers requirements — the 니즈 장's frame, else a generic · scenario
    # sheet. Forced onto a product · solution · map sheet it pushed the sheet off its facts (2026-11-18 blind round 1: 제품 제안
    # 1 : 5, an approval request written as '시범 매장 승인 · 워크숍 개최를 완료하였습니다' on a solution sheet).
    pool = needs or [s for s in writes if slides[s]['kind'] not in FACT_KINDS and not slides[s]['f'].startswith('L_VS_CORE_')]
    for r in own:
        if r in placed:
            continue
        if pool and points[r].get('kind') in ('need', 'constraint'):
            s = min(pool, key=lambda s: (len(by[s]['points']), s))
            by[s]['points'].append(r)
            fixes.append(f'{r}: 어느 장에도 없어 장 {s + 1}에')
        else:
            fixes.append(f'{r}: 이 파트의 장으로 답할 자리가 없음 — 장에 넣지 않음')
    for s in writes:   # a fact sheet answers no approval request
        if slides[s]['kind'] in FACT_KINDS and by[s]['points']:
            keep = [r for r in by[s]['points'] if points[r].get('kind') != 'decision']
            if len(keep) != len(by[s]['points']):
                fixes.append(f'장 {s + 1}: 승인 요청은 이 장의 일이 아님 — 제외')
            by[s]['points'] = keep
    message = text(d.get('message'))
    return {'message': message[:60], 'sheets': [by[s] for s in sorted(by)], 'columns': columns}, fixes


def plan_part(auto, ctx, plan, part, pp, slides, llm):
    """the orchestrator's plan of this part (or the code's own allocation when it has nothing to decide / the call fails)"""
    t0 = time.time()
    rows = sheet_rows(auto, ctx, part, slides)
    summary = {'part': part['id'], 'name': part.get('name') or '', 'sheets': rows, 'mode': 'model', 'calls': 0}
    if part.get('deck') or not any(r['writes'] for r in rows):
        summary['mode'] = 'authored' if not any(r['writes'] for r in rows) else 'deck'
        return None, summary
    rids = [x['id'] for x in plan.get('points') or []]
    items = list(dict.fromkeys(list(pp.get('products') or []) + list(pp.get('solutions') or []) + [str(x) for x in pp.get('cases') or []]))
    selected = list(dict.fromkeys(list(ctx.get('products') or []) + list(ctx.get('solutions') or [])))
    has_needs = any(r['writes'] and slides[r['s']]['f'] == 'L_VS_NEEDS' for r in rows)
    by_column = {r['s'] for r in rows if r['writes'] and has_needs and slides[r['s']]['f'].startswith('L_VS_CORE_')}
    # One short call a sheet, one for the 니즈 columns, one for the part's line — at once (prompt_budget). The single plan call
    # carried every sheet, the part brief and two screens of rules (p90 8.9k chars, 2026-11-18): this model answers short ones.
    jobs = [('sheet', r) for r in rows if r['writes'] and r['s'] not in by_column] + ([('columns', None)] if has_needs else []) + [('message', None)]
    ctx_items = list(dict.fromkeys(items + (selected if has_needs else [])))

    def one(job):
        what, row = job
        if what == 'sheet':
            with item_mask.sheet(auto, ctx, slides[row['s']]):
                return llm.json(stage='auto_part_plan', prompt=plan_sheet_prompt(auto, ctx, plan, part, pp, slides, rows, row, items),
                                schema=obj({'directive': STR, 'points': arr({'type': 'STRING', **({'enum': rids} if rids else {})}),
                                            'items': arr({'type': 'STRING', **({'enum': items} if items else {})})}),
                                validate=lambda d: True if isinstance(d, dict) and str(d.get('directive') or '').strip() else 'directive 가 필요합니다.',
                                temperature=0.2, max_tokens=600)
        if what == 'columns':
            need = min(3, len(by_column))
            return llm.json(stage='auto_part_plan', prompt=plan_columns_prompt(auto, ctx, plan, part, pp),
                            schema=obj({'columns': {**arr(obj({'points': arr({'type': 'STRING', **({'enum': rids} if rids else {})}),
                                                                'items': arr({'type': 'STRING', **({'enum': ctx_items} if ctx_items else {})}), 'directive': STR})),
                                                    'maxItems': 3}}),
                            validate=lambda d: True if isinstance(d, dict) and len([c for c in d.get('columns') or [] if isinstance(c, dict) and c.get('points')]) >= need
                            else f'columns 는 {need}개 — 열마다 고민 · 대표 항목 · 지시.', temperature=0.2, max_tokens=900)
        return llm.json(stage='auto_part_plan', prompt=plan_message_prompt(ctx, part, pp), schema=obj({'message': STR}), temperature=0.3, max_tokens=200)
    results = pb.fan_out(one, jobs)
    summary['calls'] = len(jobs)
    d = {'message': '', 'sheets': [], 'columns': []}
    errors = []
    for (what, row), got, err in results:
        if err is not None or not isinstance(got, dict):
            errors.append(err)
            continue
        if what == 'sheet':
            d['sheets'].append({'s': row['s'], 'directive': got.get('directive') or '', 'points': got.get('points') or [], 'items': got.get('items') or []})
        elif what == 'columns':
            d['columns'] = got.get('columns') or []
        else:
            d['message'] = got.get('message') or ''
    if errors:
        summary['errors'] = len(errors)
    if jobs and len(errors) == len(jobs):   # nothing answered: the composition goes on with the code's allocation
        summary.update(mode='fallback', error=f'{type(errors[0]).__name__}: {str(errors[0])[:160]}')
        summary['ms'] = int((time.time() - t0) * 1000)
        return None, summary
    orch, fixes = clean_plan(auto, ctx, plan, part, pp, slides, rows, d)
    summary.update(plan=orch, fixes=fixes, ms=int((time.time() - t0) * 1000))
    return orch, summary


class Columns(list):
    """the 니즈 columns the orchestrator chose — need_columns returns it, column_items reads its items"""
    lead: dict = {}


def apply_plan(auto, ctx, plan, part, pp, slides, orch):
    """directives · points onto the sheets, the columns onto the part (read by need_columns · column_items)"""
    pp['orch'] = orch
    for x in orch['sheets']:
        sl = slides[x['s']]
        sl['directive'] = x['directive']
        sl['orch_points'] = list(x['points'])
        sl['orch_items'] = list(x['items'])
    if orch.get('message'):
        for sl in slides:
            if sl['kind'] == 'divider':
                sl['part_message'] = orch['message']
    if orch.get('columns'):
        pp['orch_columns'] = orch['columns']


def focus_after(auto, ctx, plan, pp, slides, part):
    """after the composer's own focus (assign_focus): a sheet the orchestrator gave points answers those (니즈 · 핵심 제안 장 aside —
    their rows follow the columns)"""
    pts = {x['id']: x for x in plan.get('points') or []}
    for sl in slides:
        if sl.get('orch_points') is None or sl['f'].startswith(('L_VS_NEEDS', 'L_VS_CORE_')):
            continue
        rids = [r for r in sl['orch_points'] if r in pts]
        if not rids:
            continue
        old = sl.get('focus') or {}
        sl['focus'] = {**old, 'points': rids,
                       'products': list(dict.fromkeys(q for r in rids for q in pts[r].get('products') or [])) or old.get('products') or [],
                       'solutions': list(dict.fromkeys(q for r in rids for q in pts[r].get('solutions') or [])) or old.get('solutions') or [],
                       'note': '; '.join(x for x in (old.get('note'), '파트 지시: ' + (sl.get('directive') or '')) if x)}


def columns_for(need_columns, points, pp):
    """need_columns with the orchestrator's columns first; the code fills a column it left (fewer than three needs chosen)"""
    chosen = pp.get('orch_columns') or []
    per, problem = need_columns(points, pp)
    if not chosen or problem:
        return per, problem
    pts = {x['id']: x for x in points}
    out = Columns([[r for r in c['points'] if r in pts] for c in chosen if any(r in pts for r in c['points'])][:3])
    taken = {r for c in out for r in c}
    for col in per:   # the code's own columns fill what the orchestrator left
        if len(out) >= 3:
            break
        rest = [r for r in col if r not in taken]
        if rest:
            out.append(rest)
            taken.update(rest)
    out.lead = {k: c['items'] for k, c in enumerate(chosen[:len(out)]) if c.get('items')}
    return out, problem


def items_for(column_items, ctx, per, pts):
    """column_items with the orchestrator's item per column (its first item leads, the rest follow for 핵심 제안 row 02)"""
    got = column_items(ctx, per, pts)
    lead = getattr(per, 'lead', None) or {}
    for k, its in lead.items():
        its = [q for q in its if q in set(ctx.get('products') or []) | set(ctx.get('solutions') or [])]
        if its and k < len(per):
            code = got.get(k) or (None, [])
            more = list(dict.fromkeys(its[1:] + [q for q in ([code[0]] if code[0] else []) + list(code[1]) if q != its[0]]))
            got[k] = (its[0], more)
    return got


# ---------------------------------------------------------------- review
def _plain(auto, v) -> str:
    return re.sub(r'\s+', ' ', auto.plain(v) if auto is not None else str(v or '')).strip()


def _cells(auto, slides, editable):
    return [(s, x['i'], _plain(auto, (slides[s].get('t') or {}).get(str(x['i']), ''))) for s, xs in sorted(editable.items()) for x in xs]


def code_findings(auto, ctx, part, pp, slides, editable):
    """what the code sees without a model: the same sentence on two sheets of the part, written cells left empty"""
    repeats, seen = [], []
    for s, i, v in _cells(auto, slides, editable):
        if len(re.sub(r'\W', '', v)) < 10:
            continue
        hit = next(((s2, i2) for s2, i2, w in seen if s2 != s and auto.near_same(v, w)), None)
        if hit:
            repeats.append({'s': s, 'i': i, 'same_as': {'s': hit[0], 'i': hit[1]}, 'text': v[:60]})
        else:
            seen.append((s, i, v))
    # empty = what the writer failed to fill (fill_part 'unfilled'); a cell the composer leaves blank on purpose (a 활용 맵 row
    # beyond the spaces, a number nobody stated) is not a gap — filled by a redo it became an invented row (2026-11-18 데일리픽)
    empty = [{'s': s, 'i': i} for s, i, v in _cells(auto, slides, editable) if not v and i in (slides[s].get('unfilled') or [])]
    # the directive copied into the sheet ('…의 역할과 화면의 핵심 특징을 보여줍니다') — a note to the writer, never deck text (2026-11-18 orch8)
    echo = []
    for s, i, v in _cells(auto, slides, editable):
        d = re.sub(r'\s+', ' ', str(slides[s].get('directive') or '')).strip()
        if d and len(v) >= 12 and (auto.near_same(v, d) or v in d or (len(d) >= 12 and d in v)):
            echo.append({'s': s, 'i': i, 'text': v[:60]})
    return {'repeats': repeats[:12], 'empty': empty[:16], 'echo': echo[:12]}


def review_sheet_prompt(auto, ctx, part, pp, slides, editable, findings, s, xs):
    """one sheet (a dozen cells of it) against its directive, its requirements and the other sheets' angles"""
    sl = slides[s]
    L = auto.load().get('layouts') or {}
    reqs = {r['id']: r for r in (pp.get('brief') or {}).get('requirements') or []}
    mine = [{'id': r, 'text': pb.cut((reqs.get(r) or {}).get('label') or (reqs.get(r) or {}).get('text') or '', 50)}
            for r in (sl.get('orch_points') or (sl.get('focus') or {}).get('points') or []) if r in reqs][:4]
    others = [f"장 {n + 1} {pb.cut((L.get(slides[n]['f']) or {}).get('name') or slides[n]['f'], 20)}: {pb.cut(slides[n].get('directive') or '', 40)}"
              for n in sorted(editable) if n != s][:6]
    cells = {str(x['i']): pb.cut(_plain(auto, (sl.get('t') or {}).get(str(x['i']), '')), 90) for x in xs}
    ids = {x['i'] for x in xs}
    found = ([f"칸 {x['i']}: 장 {x['same_as']['s'] + 1}과 같은 문장" for x in findings.get('repeats') or [] if x['s'] == s and x['i'] in ids]
             + [f"칸 {x['i']}: 빈 칸" for x in findings.get('empty') or [] if x['s'] == s and x['i'] in ids]
             + [f"칸 {x['i']}: 지시 메모를 그대로 옮김" for x in findings.get('echo') or [] if x['s'] == s and x['i'] in ids])
    return '\n'.join([
        f"「{pb.cut(part.get('name'), 24)}」 파트 검토 — 이 장을 다시 쓸지 정합니다(사실 검수는 따로 합니다).",
        f"고객: {pb.cut(ctx.get('customer'), 30)}",
        f"이 장: 장 {s + 1} {pb.cut((L.get(sl['f']) or {}).get('name') or sl['f'], 40)} — 파트 지시: {pb.cut(sl.get('directive') or '-', 120)}",
        '이 장이 맡은 요구: ' + (pb.dump(mine) if mine else '없음'),
        '다른 장의 각도: ' + (' / '.join(others) if others else '없음'),
        '쓴 칸(칸 번호: 문구): ' + pb.dump(cells),
        '코드가 찾은 것: ' + (' · '.join(found) if found else '없음'),
        '다시 쓸 때만 redo=true: 지시와 다른 내용 · 다른 장과 같은 문장이나 같은 각도 · 맡은 요구를 빠뜨림 · 빈 칸 · 지시 메모를 그대로 옮김. 애매하면 false.',
        'instruction 은 무엇을 다르게 말할지 구체적으로(자료에 없는 사실 · 수치 · 제품 · 성과를 넣으라고 하지 않음). cells 는 고칠 칸 번호, 장 전체면 [].',
        'JSON만: {"redo":false,"why":"","instruction":"","cells":[]}'])


def review_prompt(auto, ctx, plan, part, pp, slides, editable, findings):
    sheets = []
    for s, xs in sorted(editable.items()):
        sl = slides[s]
        sheets.append({'s': s, 'layout': (auto.load()['layouts'].get(sl['f']) or {}).get('name') or sl['f'], 'directive': sl.get('directive') or '',
                       'points': sl.get('orch_points') or (sl.get('focus') or {}).get('points') or [],
                       't': {str(x['i']): _plain(auto, (sl.get('t') or {}).get(str(x['i']), ''))[:90] for x in xs}})
    reqs = [_requirement(r) for r in (pp.get('brief') or {}).get('requirements') or [] if r.get('kind') != 'context']
    return f"""「{part.get('name') or '파트'}」 파트 orchestrator 의 검토입니다. 이 파트의 장들이 당신의 파트 지시를 받아 각자의 레이아웃 흐름대로 쓰였습니다(사실 검수는 이 다음에 따로 합니다).
장마다 지시대로 쓰였는지, 장끼리 같은 내용을 되풀이하는지, 맡은 요구를 빠뜨렸는지 보고 다시 쓸 장만 고릅니다.

[고객] {ctx.get('customer') or ''} · {ctx.get('title') or ''}
[이 파트가 맡은 요구] {compact(reqs) if reqs else '없음'}
[장 — t 는 AI 가 쓴 칸(칸 번호: 최종 문구)] {compact(sheets)}
[코드가 찾은 것] 다른 장과 같은 문장: {compact(findings['repeats'])} · 빈 칸: {compact(findings['empty'])} · 지시 메모를 그대로 옮긴 칸: {compact(findings.get('echo') or [])}

규칙
- redo 는 분명한 문제가 있는 장만, 많아야 {MAX_REDO}장: 지시와 다른 내용 · 다른 장과 같은 문장이나 같은 각도 · 그 장에 맡긴 요구를 빠뜨림 · 빈 칸 · 지시 메모를 그대로 옮긴 칸.
- 같은 문제는 한 장에서만 고칩니다 — 같은 instruction 을 여러 장에 주지 않습니다. 두 장이 겹치면 뒤 장을 그 장의 지시 쪽으로 바꿉니다.
- instruction 은 그 장이 무엇을 다르게 말할지 구체적으로(지시의 각도 · 답할 요구 · 뺄 문장). 자료에 없는 사실 · 수치 · 제품 · 성과를 넣으라고 하지 않습니다.
- cells 는 고칠 칸 번호(t 의 키). 장 전체면 [].
- 문제가 없으면 redo 는 [].
JSON만."""


def review_part(auto, ctx, plan, part, pp, slides, editable, llm):
    findings = code_findings(auto, ctx, part, pp, slides, editable)
    # Decision branch (layout.review, app/api/poc/layout_decide.py): the same redo list from one choice per sheet — taken only when
    # the decision branch is on; a failing decision request leaves the review to the LLM below
    from . import layout_decide
    dec = layout_decide.client_for(llm, 'layout.review', [slides[s]['f'] for s in editable])
    if dec is not None:
        try:
            return layout_decide.review_answer(auto, ctx, part, pp, slides, editable, findings, dec, MAX_REDO), findings
        except Exception as exc:  # noqa: BLE001
            if _cancelled(exc):
                raise
    # One short call a sheet (its cells a dozen at a time), at once (prompt_budget): the single review call read every sheet of the
    # part (p90 4.5k chars, 2026-11-18). The sheets' answers come back as the review's redo list (the rules below are unchanged).
    jobs = []
    for s_ in sorted(editable):
        xs = [x for x in editable[s_] if _plain(auto, (slides[s_].get('t') or {}).get(str(x['i']), '')) or x['i'] in (slides[s_].get('unfilled') or [])]
        for k in range(0, len(xs), pb.CHECK_CELLS):
            jobs.append((s_, xs[k:k + pb.CHECK_CELLS]))
    one_schema = obj({'redo': {'type': 'BOOLEAN'}, 'why': STR, 'instruction': STR, 'cells': arr(INT)})

    def one(job):
        s_, xs = job
        with item_mask.sheet(auto, ctx, slides[s_]):
            return llm.json(stage='auto_part_review', prompt=review_sheet_prompt(auto, ctx, part, pp, slides, editable, findings, s_, xs), schema=one_schema,
                            temperature=0.1, max_tokens=500,
                            validate=lambda d: True if isinstance(d, dict) and isinstance(d.get('redo'), bool) else 'redo(true/false)가 필요합니다.')
    results = pb.fan_out(one, jobs)
    if jobs and all(e is not None for _, _, e in results):
        raise pb.first_error(results)
    merged = {}
    for (s_, xs), got, err in results:
        if err is not None or not isinstance(got, dict) or not got.get('redo'):
            continue
        mine = {x['i'] for x in xs}
        it = merged.setdefault(s_, {'s': s_, 'why': got.get('why') or '', 'instruction': got.get('instruction') or '', 'cells': []})
        it['cells'] += [i for i in got.get('cells') or [] if i in mine]
    d = {'redo': list(merged.values())}
    redo, seen = [], set()
    for x in d.get('redo') or []:
        if not isinstance(x, dict) or x.get('s') not in editable or x['s'] in seen or not str(x.get('instruction') or '').strip():
            continue
        if any(auto.near_same(str(x['instruction']), r['instruction']) for r in redo):
            continue   # one problem, one sheet — the same instruction on three sheets made them alike (2026-11-18 run)
        seen.add(x['s'])
        cells = {c['i'] for c in editable[x['s']]}
        redo.append({'s': x['s'], 'why': str(x.get('why') or '')[:200], 'instruction': str(x['instruction'])[:400],
                     'cells': [i for i in dict.fromkeys(x.get('cells') or []) if i in cells]})
    return redo[:MAX_REDO], findings


def code_review(findings, editable):
    """the review of a part without a 니즈 장: what the code found, one cell at a time — a cell that repeats another sheet, a cell the
    writer failed to fill. A model asked to judge these parts against their directives rewrote whole sheets and lost to the
    unreviewed text 0 : 9 (2026-11-18 blind round 2: wrong spaces spread, an approval pasted into a scene, a scenario turned against
    the customer's strategy); in the 가치 제안 part it won 8 : 5, so that part keeps the model review."""
    items = {}
    for x in findings.get('repeats') or []:
        if x['s'] in editable:
            it = items.setdefault(x['s'], {'s': x['s'], 'why': '다른 장과 같은 문장', 'cells': [], 'strict': True,
                                           'instruction': f"장 {x['same_as']['s'] + 1}과 같은 말 — 이 장의 지시와 이 장의 항목으로, 다른 장에 없는 내용으로 씀"})
            it['cells'].append(x['i'])
    for x in findings.get('empty') or []:
        if x['s'] in editable:
            it = items.setdefault(x['s'], {'s': x['s'], 'why': '빈 칸', 'cells': [], 'strict': True, 'instruction': '이 장의 지시대로 빈 칸을 채움'})
            it['cells'].append(x['i'])
    for x in findings.get('echo') or []:
        if x['s'] in editable:
            it = items.setdefault(x['s'], {'s': x['s'], 'why': '지시 메모를 그대로 옮김', 'cells': [], 'strict': True,
                                           'instruction': '파트 지시 메모를 장표 문장으로 옮겼음 — 이 칸의 일대로, 고객에게 하는 말(사실 · 장면)로 다시 씀'})
            it['cells'].append(x['i'])
    return list(items.values())[:MAX_REDO]


def _keep_distinct(auto, slides, editable, s, before):
    """a rewritten cell that now repeats another sheet of the part goes back to what it was"""
    others = [v for n, i, v in _cells(auto, slides, editable) if n != s and len(re.sub(r'\W', '', v)) >= 10]
    back = []
    for k, old in before.items():
        new = _plain(auto, slides[s]['t'].get(k, ''))
        if new and new != _plain(auto, old) and (grounding.HAN.search(new) or any(auto.near_same(new, w) for w in others)):
            slides[s]['t'][k] = old
            back.append(k)
    return back


def redo_sheet(auto, ctx, plan, part, pp, slides, s, item, editable, llm):
    """one sheet written again by the review's instruction, inside its own cells (element sheets: inside their elements).
    Returns the cells that changed."""
    sl = slides[s]
    # number cells keep what the writer and the number rule left (a stated figure or nothing — placeholders never stay)
    xs = {x['i']: x for x in editable.get(s) or [] if not (x.get('num_cell') or x.get('figure') or x.get('value_of') is not None or x.get('unit_of') is not None)}
    cells = [i for i in item['cells'] if i in xs]
    if not cells:
        if item.get('strict'):
            return []   # a code finding on a cell the redo may not touch (a number cell)
        cells = [i for i in xs if (sl.get('t') or {}).get(str(i)) or i in (sl.get('unfilled') or [])]
    before = {str(i): (sl.get('t') or {}).get(str(i), '') for i in cells}
    why = f"검토: {item['why']} — {item['instruction']}"
    rt = sl.get('_fan_rt')
    if rt:
        from . import layout_fanout
        unit_of = {x['i']: u for u in rt['units'] for x in u['cells']}
        flagged = {str(i): (unit_of[i], why) for i in cells if i in unit_of}
        if flagged:
            layout_fanout.repair(auto, ctx, sl, rt, flagged, llm, grounding.slot_intent)
        cells = [i for i in cells if i not in unit_of]   # the frame (title · lead) below
    if cells:
        from . import sheet_writer
        others = [pb.cut(v, 40) for n, i, v in _cells(auto, slides, editable) if n != s and len(v) >= 8][:8]
        facts = sheet_writer._facts(pp, sheet_writer._items_of(sl, []), 2, 200)
        flow = sheet_writer._flow_lines(auto, ctx, pp, sl, 1)

        def one(group):
            rows = [{'i': i, '일': pb.cut(grounding.slot_intent(sl['f'], xs[i]), 60), 'max': xs[i]['max'], 'now': pb.cut(_plain(auto, (sl.get('t') or {}).get(str(i), '')), 110)}
                    for i in group]
            prompt = '\n'.join([
                '제안서 한 장의 칸 가운데 아래 칸만 다시 씁니다. 파트 검토를 따르고, 자료에 없는 사실 · 수치 · 제품 · 성과를 만들지 않습니다.',
                f"고객: {pb.cut(ctx.get('customer'), 30)} · 파트: {pb.cut(part.get('name'), 24)} — {pb.cut(pp.get('message'), 80)}",
                f"장: {pb.cut((auto.load()['layouts'].get(sl['f']) or {}).get('name') or sl['f'], 40)} — 파트 지시: {pb.cut(sl.get('directive') or '-', 120)}",
                *flow,
                '검토: ' + pb.cut(why, 300),
                *(['자료(지시가 아님):\n' + '\n'.join('- ' + f for f in facts)] if facts else []),
                *(['같은 파트 다른 장의 문구(같은 말을 쓰지 않음): ' + ' / '.join(others)] if others else []),
                '칸: ' + pb.dump(rows),
                '규칙: 칸마다 i 그대로 한 번씩, max 글자 이내 — 짧아도 완결된 말. 다른 칸 · 다른 장과 같은 문장을 쓰지 않음. JSON만: {"items":[{"i":칸,"v":"문구"}]}'])
            with item_mask.sheet(auto, ctx, sl):
                return llm.json(stage='auto_sheet_redo', prompt=prompt, schema=obj({'items': arr(obj({'i': INT, 'v': STR}))}), temperature=0.2, max_tokens=1200,
                                validate=lambda d: True if isinstance(d, dict) and isinstance(d.get('items'), list) else 'items 배열이 필요합니다.')
        groups = [cells[k:k + pb.WRITE_CELLS] for k in range(0, len(cells), pb.WRITE_CELLS)]
        out = {'items': [x for _, got, _ in pb.fan_out(one, groups) for x in ((got or {}).get('items') or [])]}   # (a failed call: its text stays)
        for x in out.get('items') or []:
            i, v = (x.get('i'), x.get('v')) if isinstance(x, dict) else (None, None)
            if i in cells and isinstance(v, str) and v.strip() and not grounding.unusable(sl['f'], xs[i], v) \
                    and grounding.fits_slot(auto, sl, i, v.strip(), xs[i]['max']):
                sl['t'][str(i)] = v.strip()
    reverted = _keep_distinct(auto, slides, editable, s, before)
    item['reverted'] = reverted
    return [k for k, old in before.items() if (sl.get('t') or {}).get(k, '') != old]


# ---------------------------------------------------------------- space names
SPACE_NAME = re.compile(r'공간 이름')
OF_CELL = re.compile(r'칸 (\d+) 공간')
COUNT = re.compile(r'(\d+)개 (공간|매장|구역)')


def guard_space_names(auto, ctx, slides):
    """a space-name cell (칸 설계 role '… 공간 이름') holds a planned space or the customer's own words — with no space plan the
    writer filled a 5-slot 조감도 with two store types nobody named ('백화점 입점점' · '공항/터미널점', 2026-11-18 데일리픽 run).
    Such a cell is emptied with the cells that depend on it ('칸 10 공간의 대표 제품'), and the title's count follows."""
    names = {str(sp.get('name') or '') for sp in ctx.get('spaces') or []}
    text = re.sub(r'\s+', ' ', ctx.get('req_text') or '')
    words = lambda v: [w for w in re.split(r'[\s·/,()]+', v) if len(w) >= 2]
    said = lambda v: v in names or v in text or (words(v) and all(w in text for w in words(v)))
    out = {}
    for n, sl in enumerate(slides):
        if sl.get('fixed') or sl.get('keep'):
            continue
        t, lock = sl.get('t') or {}, sl.get('lock') or {}
        roles = {k: (layout_cells.cell(sl['f'], k) or {}).get('role') or '' for k in t}
        cleared = [k for k, v in t.items() if SPACE_NAME.search(roles[k]) and not OF_CELL.search(roles[k]) and str(k) not in lock
                   and (pv := _plain(auto, v)) and not said(pv)]
        if not cleared:
            continue
        for k in cleared:
            t[k] = ''
        gone = {int(k) for k in cleared if str(k).isdigit()}
        for k in list(t):
            m = OF_CELL.search(roles.get(k) or '')
            if m and int(m.group(1)) in gone and str(k) not in lock:
                t[k] = ''
        left = sum(1 for k, v in t.items() if SPACE_NAME.search(roles[k]) and not OF_CELL.search(roles[k]) and _plain(auto, v))
        for k, v in list(t.items()):
            if roles[k].startswith('제목') and isinstance(v, str) and COUNT.search(v) and left:
                t[k] = COUNT.sub(lambda m: f'{left}개 {m.group(2)}', v)
        out[n] = sorted(cleared)
    return out


# ---------------------------------------------------------------- trace
def trace_sheet(auto, ctx, sl, s, editable, review):
    """the sheet's flow as it ran: each node with what happened (the admin flow is the plan; this is the record)"""
    v = _flow(sl['f'])
    nodes = (v or {}).get('flow', {}).get('nodes') or []
    fixed = bool(sl.get('fixed') or sl.get('keep'))
    wrote = s in (editable or {})
    split = bool(sl.get('fanout'))
    q = sl.get('quality') or {}
    out = []
    for n in nodes:
        m = n['module']
        if m in ('collect', 'bind', 'lock'):
            st = 'ran'
        elif fixed:
            st = 'kept'
        elif m == 'write':
            st = 'ran' if wrote and not split else 'skipped'
        elif m in ('split', 'element', 'merge'):
            st = 'ran' if split else ('whole' if wrote else 'skipped')
        elif m == 'shorten':
            st = 'ran' if wrote else 'skipped'
        elif m == 'agent':
            st = 'ran' if wrote else 'skipped'
        elif m == 'pictures':
            st = 'ran' if sl.get('img_meta') else 'skipped'
        elif m == 'verify':
            st = q.get('status') or ('skipped' if not wrote else 'ran')
        elif m == 'final':   # 최종 점검 (layout_final): clean · fixed · remaining · fixed_remaining
            st = (sl.get('final_check') or {}).get('status') or 'skipped'
        else:
            st = 'ran'
        out.append({'id': n['id'], 'module': m, 'status': st})
    t = {'flow': (v or {}).get('key') or sl['f'], 'edited': bool((v or {}).get('edited')), 'nodes': out}
    if sl.get('directive'):
        t['directive'] = sl['directive']
    if sl.get('orch_points'):
        t['points'] = sl['orch_points']
    if split:
        t['elements'] = len((sl.get('fanout') or {}).get('units') or [])
    hit = next((r for r in review or [] if r['s'] == s), None)
    if hit:
        t['redo'] = {k: hit[k] for k in ('why', 'instruction', 'changed', 'reverted') if k in hit}
    return t


# ---------------------------------------------------------------- install
def review_on() -> bool:
    """WINMATE_PART_REVIEW (on | off, default on) — the part review after writing; read at every part (no restart)"""
    from .. import runtime_env
    return str(runtime_env.env_values().get('WINMATE_PART_REVIEW') or 'on').strip().lower() not in ('off', '0', 'false', 'no')


def enabled() -> bool:
    """WINMATE_PART_ORCHESTRATOR (on | off, default on) — process environment > root .env; read when the engine is built (restart)"""
    from .. import runtime_env
    return str(runtime_env.env_values().get('WINMATE_PART_ORCHESTRATOR') or 'on').strip().lower() not in ('off', '0', 'false', 'no')


def install(auto) -> None:
    """after compose_grounding.install and layout_flows.install (adapters/compose._auto)"""
    with _LOCK:
        if getattr(auto, '_part_orchestrator', False) or not enabled():
            return
        auto._part_orchestrator = True
        fill_text, assign, linked, out_layout = auto.fill_part_text, auto.assign_focus, auto.enforce_linked, auto._layout_out
        need_columns, column_items, public, run = auto.need_columns, auto.column_items, auto.public_plan, auto.run_auto
        lock = threading.Lock()

        def record(plan, pid, summary):
            with lock:
                plan.setdefault('orchestration', {})[pid] = summary

        def fill_part_text(ctx, plan, part, pp, slides, llm):
            orch, summary = plan_part(auto, ctx, plan, part, pp, slides, llm)
            if orch:
                apply_plan(auto, ctx, plan, part, pp, slides, orch)
            pp['_orch_summary'] = summary
            record(plan, part['id'], summary)
            fill_text(ctx, plan, part, pp, slides, llm)   # every sheet through its own layout flow
            pending = (ctx.get('_part_checks') or {}).get(part['id'])
            editable = pending[2] if pending else {}
            if not (orch and editable and review_on()):
                return
            t0 = time.time()
            try:   # the part as a whole, before pictures and the part check see it
                if any(slides[s]['f'] == 'L_VS_NEEDS' or slides[s]['f'].startswith('L_VS_CORE_') for s in editable):
                    review, findings = review_part(auto, ctx, plan, part, pp, slides, editable, llm)
                    summary.update(findings=findings, calls=summary.get('calls', 0) + 1, review_mode='model')
                else:
                    findings = code_findings(auto, ctx, part, pp, slides, editable)
                    review = code_review(findings, editable)
                    summary.update(findings=findings, review_mode='code')
            except Exception as exc:  # noqa: BLE001 — the written sheets stay
                if _cancelled(exc):
                    raise
                summary['review_error'] = f'{type(exc).__name__}: {str(exc)[:160]}'
                review = []
            if review:   # different sheets, at once (each guards its own cells against the others afterwards)
                from concurrent.futures import ThreadPoolExecutor
                from contextvars import copy_context
                with ThreadPoolExecutor(max_workers=len(review)) as pool:
                    futures = [pool.submit(copy_context().run, redo_sheet, auto, ctx, plan, part, pp, slides, item['s'], item, editable, llm) for item in review]
                    for item, future in zip(review, futures):
                        item['changed'] = future.result()
                summary['calls'] = summary.get('calls', 0) + len(review)
            summary['review'] = [{k: x[k] for k in ('s', 'why', 'instruction', 'cells', 'changed', 'reverted') if k in x} for x in review]
            summary['review_ms'] = int((time.time() - t0) * 1000)
            pp['_orch_review'] = review

        def assign_focus(ctx, plan, pp, slides, part=None):
            assign(ctx, plan, pp, slides, part)
            if pp.get('orch'):
                focus_after(auto, ctx, plan, pp, slides, part)

        def enforce_linked(ctx, part, slides):
            guarded = guard_space_names(auto, ctx, slides)   # no invented space before the part check reads the text
            ids = {r['id'] for r in ctx.get('source_rows') or []}
            for sl in slides:   # requirement ids the writers echoed ('R13' · '(R10-R15)') leave before the part check reads the text
                if sl.get('fixed') or sl.get('keep'):
                    continue
                for k, v in list((sl.get('t') or {}).items()):
                    if isinstance(v, str):
                        sl['t'][k] = grounding.strip_requirement_ids(v, ids)
            linked(ctx, part, slides)   # guards · the part check (verify) · image binding
            pending = (ctx.get('_part_checks') or {}).get(part['id'])
            pp = pending[0] if pending else (ctx.get('plan_by') or {}).get(part['id']) or {}
            editable = pending[2] if pending else {}
            summary = pp.get('_orch_summary')
            traces = [trace_sheet(auto, ctx, sl, s, editable, pp.get('_orch_review') or []) for s, sl in enumerate(slides)]
            for sl, t in zip(slides, traces):
                sl['trace'] = t
            if summary is not None:
                if guarded:
                    summary['space_guard'] = {str(k): v for k, v in guarded.items()}
                summary['trace'] = [{'f': sl['f'], **t} for sl, t in zip(slides, traces)]
                summary['status'] = [((sl.get('quality') or {}).get('status') or '') for sl in slides]

        def layout_out(sl):
            out = out_layout(sl)
            if sl.get('trace'):
                out['trace'] = sl['trace']
            return out

        def public_plan(plan):
            out = public(plan)
            if plan.get('orchestration'):
                out['orchestration'] = plan['orchestration']
            return out

        def run_auto(*args, **kwargs):
            out = run(*args, **kwargs)
            out['orchestration'] = (out.get('plan') or {}).get('orchestration') or {}
            return out

        auto.fill_part_text, auto.assign_focus, auto.enforce_linked, auto._layout_out = fill_part_text, assign_focus, enforce_linked, layout_out
        auto.need_columns = lambda points, pp: columns_for(need_columns, points, pp)
        auto.column_items = lambda ctx, per, pts: items_for(column_items, ctx, per, pts)
        auto.public_plan, auto.run_auto = public_plan, run_auto
