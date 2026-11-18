"""레이아웃 메타데이터 — what the AI fills on a layout and how those cells and pictures belong together.

User 2026-11-18: "최종 점검 관련 프롬프트는 고정해. 다만 동적으로 layout metadata 를 입력해서(ai 채움 대상만) ai 가 1차적으로 채운 정보와
비교할 수 있게 해. 이때 layout 별 metadata 는 레이아웃 구조적인 건 필요 없지만 연관성은 확실하도록 잘 설계해야 해. 예를 들어 특정
제품 관련된 사진 · 이름 · 메시지는 함께 묶여야 되는데 레이아웃 구조를 신경 안 쓰면 이 매칭이 고장 날 수 있어. layout 별 metadata 도
상단에 버튼 만들고 팝업으로 볼 수 있게 해."

A layout's metadata carries no geometry — only the AI-fill targets and their relations:
- ``groups``: one item each (a card · a row · a column — layout_elements units). ``key`` is the cell that names the group's item
  (a 'product' mode cell, else a name cell by its 칸 설계 role); every ``cells`` entry and every ``pictures`` entry of the group
  speaks of that item — a picture ``shows`` the item itself (a product cut) or a ``scene`` of it;
- ``frame``: cells about the whole sheet (title · lead) and pictures of no group;
- each cell: its job (``role``, 칸 설계) and the form the layout gives it (``form`` · ``len`` of the layout's own content).
The relations are made sure with the layout's structure and then kept without it:
1. the element plan groups cells and pictures by where they sit (layout_elements);
2. a cell whose role names another cell ('칸 7 제품의 쓰임') belongs with that cell;
3. the composer binds the n-th product picture to the n-th product name cell — a picture the geometry put elsewhere follows its
   name cell (``flags``: 'paired');
4. the layout's own sample must agree: the item its key cell names is the item its product picture shows (``flags``: 'sample').
No product code and no solution name is kept (the hints are cleaned): the metadata goes into prompts.
"""
from __future__ import annotations

import re
from functools import lru_cache
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from . import layout_cells
from . import layout_flows as flows

VERSION = 4
ROLE_REF = re.compile(r'칸\s?(\d+)')
CODE = re.compile(r'(?<![A-Za-z0-9])[A-Z]{1,4}-?\d{2,4}[A-Z0-9]{0,4}(?:-[A-Z0-9]{1,3})?(?![A-Za-z0-9])')
BRANDS = re.compile(r'MagicINFO|Magic INFO|Samsung VXT|VXT|SmartThings Pro|SmartThings|ST Pro|Knox(?: Suite| Capture| Manage| Configure)?|b\.IoT|LYNK(?: Cloud)?|DMS(?: 2\.5)?',
                    re.I)


ORDINAL = re.compile(r'(가치|질문|보조 제품|제품|솔루션|행|열|단계|카드|공간|사례|요소|니즈|항목|키워드|지표|흐름|기둥)\s?(\d+)'
                     r'(?!\d|\s?(?:번째|칸|개|대|명|곳|종|가지|줄|자|~|-|–|\.\d))')   # ('세부 항목 2~3개' is a count, not item 2)
ORDINAL_PRE = re.compile(r'(?<![\d.~–-])(\d+)\s?(장|단계)(?=[\s·(,:—]|$)')   # ('1장 이름' · '2단계 기간')
NAME_KIND = (('space', re.compile(r'공간 (이름|명)|공간 원문|공간 \d+번째|선택 공간')), ('case', re.compile(r'사례 (이름|고객)|고객사 이름')),
             ('product', re.compile(r'제품|솔루션|모델|항목 이름|이름 그대로')))


KO_MODEL = re.compile(r'(?:갤럭시\s+)?(?:[A-Z]\s)?[가-힣]{2,}\d{1,2}(?![\d.])(?:\s?(?:프로|플러스|울트라|라이트|자급제|엣지))*')   # ('엑스커버7 프로')


def clean(text: str) -> str:
    """a hint · role without a product code (a spec — IP65 · USB — stays), a model named in Korean, or a solution name"""
    from .poc.item_mask import STOP_PREFIX
    t = CODE.sub(lambda m: m.group(0) if re.match(r'[A-Z]+', m.group(0)).group(0) in STOP_PREFIX else '제품', str(text or ''))
    t = BRANDS.sub('항목', KO_MODEL.sub('제품', t))
    t = re.sub(r'(제품|항목)(\s*[+·/]\s*(제품|항목))+', r'\1', t)
    t = re.sub(r'\b(제품|항목)(\s+\1)+\b', r'\1', t)
    return re.sub(r'\s+', ' ', t).strip()


def _name_kind(role: str, mode: str) -> str:
    """what a name cell names — the word before '이름' in its role ('공간 이름' · '선택 제품 이름 그대로' · '가치 2 이름' · '사양 항목 1 이름')"""
    head = re.split(r'\s[—(]', role or '')[0]
    m = re.search(r'([가-힣A-Za-z]+)\s*\d*\s*(?:·\s*[가-힣A-Za-z]+\s*)?이름', head) or re.search(r'([가-힣A-Za-z]+)\s*\d*\s*$', head)
    word = m.group(1) if m else ''
    if re.search(r'공간', word):
        return 'space'
    if re.search(r'사례|고객사', word):
        return 'case'
    if re.search(r'제품|솔루션|모델|시리즈|기기|서비스', word) or (not role and mode == 'product'):
        return 'product'
    return 'item'


CONTRAST = re.compile(r'^[^—,(]{0,10}?(와|과)?\s?(다르|다른|겹치|말고|제외|중복|빼고)')
COPY = re.compile(r'^\s?(의\s?)?(이름|값|문구|표기|명칭)?\s?(그대로|\+)')   # ('칸 20 이름 그대로' · '칸 20 이름 + \' 감정\'': the same words, not that item)


def _copies(role: str, me: str, cells) -> List[str]:
    """the cells this cell repeats word for word ('칸 20 이름 그대로 (고객)')"""
    out = []
    for m in ROLE_REF.finditer(role or ''):
        r = m.group(1)
        if r != me and r in cells and COPY.match((role or '')[m.end():m.end() + 12]):
            out.append(r)
    return list(dict.fromkeys(out))


def _refs(role: str, me: str, cells) -> List[str]:
    """the cells a role says this cell is about ('칸 7 제품의 쓰임' · '칸 8 공간 × 칸 2 제품') — not the ones it must differ from
    ('칸 3 가치와 다르게' · '칸 4 · 10과 다른 것')"""
    out = []
    for m in ROLE_REF.finditer(role or ''):
        r = m.group(1)
        tail = (role or '')[m.end():m.end() + 16]
        if r == me or r not in cells or CONTRAST.search(tail) or COPY.match(tail[:12]) \
                or re.match(r'^\s?[·,]\s?\d+[^가-힣]{0,3}(와|과)?\s?(다르|다른|겹치|말고|제외)', tail):
            continue
        out.append(r)
    return list(dict.fromkeys(out))


def _ordinal(role: str) -> Optional[Tuple[str, str]]:
    a, b = ORDINAL.search(role or ''), ORDINAL_PRE.search(role or '')
    if a and (not b or a.start() <= b.start()):
        return a.group(1), a.group(2)
    return (b.group(2), b.group(1)) if b else None


def _tag(word: str, n: str) -> str:
    return f'{n}{word}' if word in ('장', '단계') else f'{word} {n}'


def _form(sample: str, role: str = '') -> Tuple[str, int]:
    from .poc.layout_final import role_form
    s = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', str(sample or ''))).strip()
    return role_form(role, s), len(s)


@lru_cache(maxsize=1024)
def _build(f: str, stamp: Any) -> dict:
    from .layout_elements import plan_for
    from .poc.layout_final import name_cell
    meta, slots, whole_fixed = _source(f)
    design = layout_cells.design(f)
    roles = {str(k): (v.get('role') or '') for k, v in (design.get('cells') or {}).items()}
    keep = {str(k) for k, v in (design.get('cells') or {}).items() if v.get('keep')}
    text = {s['id']: s for s in slots if s['kind'] == 't' and str(s['id']).isdigit()}
    imgs = {s['id']: s for s in slots if s['kind'] == 'img'}
    ai_cells = [k for k, s in text.items() if s['mode'] not in flows.FIXED_MODES and k not in keep] if not whole_fixed else []
    ai_pics = [k for k, s in imgs.items() if s['mode'] not in flows.FIXED_MODES] if not whole_fixed else []
    hints = list(meta.get('ih') or [])
    flags: List[str] = []
    try:
        plan = plan_for(f) or {}
    except Exception:  # noqa: BLE001
        plan = {}
    refs_of = {c: _refs(roles.get(c, ''), c, text) for c in text}
    same_of = {c: _copies(roles.get(c, ''), c, text) for c in text}
    groups: List[dict] = []
    owner: Dict[Tuple[str, str], int] = {}   # ('t' | 'img', id) → group index
    for u in plan.get('units') or []:
        all_ = [str(c) for c in u.get('slots') or []]
        pics = [str(p) for p in u.get('imgs') or [] if str(p) in ai_pics]
        base = {'id': u.get('id') or f"g{len(groups) + 1}", 'label': u.get('label') or f"묶음 {len(groups) + 1}", 'about': u.get('entity') or 'topic'}
        # a matrix (cells that each name a row and a column: 'BOM' quantities) is one group without an item
        if sum(1 for c in all_ if len(refs_of.get(c) or []) >= 2) >= 3:
            parts = [{**base, 'about': 'matrix', 'all': all_, 'pictures': pics}]
        else:
            # one unit, two blocks: the cells' roles number them ('가치 1 …' · '가치 2 …' · '보조 제품 1 …') — one group a number
            tags = {c: _ordinal(roles.get(c, '')) for c in all_}
            words = Counter(t[0] for t in tags.values() if t)
            word = next((w for w, n in words.most_common() if len({t[1] for t in tags.values() if t and t[0] == w}) >= 2), None)
            if word:
                nums = list(dict.fromkeys(t[1] for c in all_ for t in [tags[c]] if t and t[0] == word))
                parts = [{**base, 'id': f"{base['id']}-{n}", 'label': f"{base['label']} · {_tag(word, n)}", 'all': [], 'pictures': []} for n in nums]
                for c in all_:
                    t = tags[c]
                    k = nums.index(t[1]) if t and t[0] == word else None
                    if k is None:   # (no number: with the cell it names, else the first block)
                        r = next((r for r in refs_of.get(c) or [] if tags.get(r) and tags[r][0] == word), None)
                        k = nums.index(tags[r][1]) if r else 0
                    parts[k]['all'].append(c)
                parts[0]['pictures'] = pics
            else:
                parts = [{**base, 'all': all_, 'pictures': pics}]
        for g in parts:
            g['cells'] = [c for c in g['all'] if c in ai_cells]
            groups.append(g)
            for c in g['all']:
                owner[('t', c)] = len(groups) - 1
            for p in g['pictures']:
                owner[('img', p)] = len(groups) - 1
    # 2. a cell whose role names another cell belongs with that cell
    for c in list(ai_cells):
        refs = [r for r in refs_of.get(c) or [] if ('t', r) in owner]
        if len(refs) != 1:   # (none, or a row and a column: the cell stays where it is)
            continue
        to = owner[('t', refs[0])]
        at = owner.get(('t', c))
        if at is not None and at != to:
            groups[at]['cells'] = [x for x in groups[at]['cells'] if x != c]
            groups[at]['all'] = [x for x in groups[at]['all'] if x != c]
        if c not in groups[to]['cells']:
            groups[to]['cells'].append(c)
            groups[to]['all'].append(c)
            owner[('t', c)] = to
            if at != to:
                flags.append(f"칸 {c} → {groups[to]['label']} (칸 {refs[0]}을 말함)")
    # 3. the n-th product picture is bound to the n-th product name cell
    pm = sorted((k for k, s in text.items() if s['mode'] == 'product'), key=int)
    pi = sorted((k for k, s in imgs.items() if s['mode'] == 'product'), key=int)
    if pm and len(pm) == len(pi):
        for p, c in zip(pi, pm):
            gc, gp = owner.get(('t', c)), owner.get(('img', p))
            if gc is not None and gp != gc and p in ai_pics:
                if gp is not None:
                    groups[gp]['pictures'] = [x for x in groups[gp]['pictures'] if x != p]
                groups[gc]['pictures'].append(p)
                owner[('img', p)] = gc
                flags.append(f"사진 {p} → {groups[gc]['label']} (제품 이름 칸 {c}과 짝)")
    # 4. what the element plan left out — by the layout's own words and document order (the HTML keeps a card's picture and
    #    cells together; the coordinates the library keeps are its containers' and cannot tell the cards apart)
    seq = [('img' if s['kind'] == 'img' else 't', str(s['id'])) for s in slots if s['kind'] == 'img' or str(s['id']).isdigit()]
    #  a. cells no unit holds that number the same block ('가치 3 이름' · '가치 3 설명' · '가치 3 근거') are that block
    tagged: Dict[Tuple[str, str], List[str]] = {}
    for c in text:   # (a fixed cell of the block — its name kept by 칸 설계 — anchors it; only the AI cells are listed)
        t = _ordinal(roles.get(c, '')) if ('t', c) not in owner else None
        if t:
            tagged.setdefault(t, []).append(c)
    for (word, n), cs in tagged.items():
        if sum(1 for c in cs if c in ai_cells) < 2:
            continue
        groups.append({'id': f"o-{word}-{n}", 'label': _tag(word, n), 'about': 'topic', 'all': list(cs), 'cells': [c for c in cs if c in ai_cells],
                       'pictures': []})
        for c in cs:
            owner[('t', c)] = len(groups) - 1
        flags.append(f"칸 {' · '.join(cs)} → {_tag(word, n)} (같은 번호)")
    # a name cell: its role says it names an item (a role is the layout's own word — a 'product' mode cell may be a product's
    # feature line); with no role, the 'product' mode
    is_name = lambda c: name_cell(roles[c]) if roles.get(c) else text.get(c, {}).get('mode') == 'product'  # noqa: E731

    def root(c, seen=()):
        r = (refs_of.get(c) or [None])[0] if len(refs_of.get(c) or []) == 1 else None
        return c if r is None or r in seen else root(r, seen + (c,))
    #  f. cells no unit holds that speak of one name no unit holds ('손님 유형 3 이름' ← '칸 11 유형의 비중' · '칸 11 유형이 원하는 것')
    #     are that name's group
    around: Dict[str, List[str]] = {}
    for c in ai_cells:
        if ('t', c) in owner or not refs_of.get(c):
            continue
        r = root(c)
        if r != c and ('t', r) not in owner and (is_name(r) or r not in ai_cells):
            around.setdefault(r, []).append(c)
    for r, cs in around.items():
        if not is_name(r) and len(cs) < 2:
            continue   # (a fixed cell one line mentions is not yet an item: two of its lines make it one)
        cs = sorted(set(cs) | {r}, key=int)
        groups.append({'id': f"r-{r}", 'label': f"칸 {r}", 'about': 'topic', 'all': cs, 'cells': [c for c in cs if c in ai_cells], 'pictures': []})
        for c in cs:
            owner[('t', c)] = len(groups) - 1
        flags.append(f"칸 {' · '.join(cs)} → 칸 {r} (그 이름을 말함)")
    #  e. one group, several items (two steps in one row: '칸 14 공간에서 …' · '칸 23 공간에서 …'): each anchor — an item's name,
    #     or the cell the others call '칸 N 공간 · 제품' — with what sits in its largest HTML container that holds no other
    #     anchor (the layout's own nesting: a step · a card)
    dom = _dom(f)
    for gi in range(len(groups)) if dom else ():
        g = groups[gi]
        if g['about'] == 'matrix':
            continue
        called = lambda r: any(re.search(rf'칸\s?{r}\s?(공간|제품|솔루션|사례|고객|항목)', roles.get(c, '')) for c in g['all'])  # noqa: E731
        # (a name that is itself about another anchor — '칸 17 단계 삼성 제품' — belongs to it, it is not a second item)
        anchors = sorted({r for c in g['all'] if refs_of.get(c) for r in [root(c)] if r != c and (is_name(r) or called(r))}
                         | {c for c in g['all'] if is_name(c) and root(c) == c and _name_kind(roles.get(c, ''), text.get(c, {}).get('mode')) != 'item'},
                         key=int)
        # (only anchors of one kind — the same role, or called by the same roles: two steps' spaces — not a stage and its product)
        def sig(a):
            own = re.sub(r'\d+', '#', roles.get(a, ''))
            return own or tuple(sorted({re.sub(r'\d+', '#', roles.get(c, '')) for c in g['all'] if a in (refs_of.get(c) or [])}))
        kinds = Counter(sig(a) for a in anchors)
        top, n_top = kinds.most_common(1)[0] if kinds else (None, 0)
        anchors = [a for a in anchors if sig(a) == top] if n_top >= 2 else []
        if len(anchors) < 2:
            continue
        box = {a: dom.alone(('t', a), [('t', b) for b in anchors if b != a]) for a in anchors}
        if not all(box.values()):
            continue
        members = [('t', c) for c in g['all']] + [('img', p) for p in g['pictures']]
        blocks = {a: [x for x in members if dom.inside(x, box[a])] for a in anchors}
        # (the rest of the row — a step's device card beside its head, a picture before it — goes, one container at a time,
        #  with the nearest anchor's block in the HTML)
        #  by where they sit (the sheet's own boxes: anchors stacked → the row band a member shares; side by side → the column),
        #  else by the HTML between them
        common = dom.common([('t', a) for a in anchors])
        band = {a: _union([b for b in (dom.geo(x) for x in blocks[a]) if b]) for a in anchors}
        axis = None
        if all(band.values()):
            cy = [b[1] + b[3] / 2 for b in band.values()]
            cx = [b[0] + b[2] / 2 for b in band.values()]
            axis = 1 if max(cy) - min(cy) > max(cx) - min(cx) else 0
        for x in members:
            if any(x in v for v in blocks.values()) or not common or not dom.inside(x, common) or x not in dom.at:
                continue
            g_x = dom.geo(x)
            if axis is not None and g_x:
                ov = sorted(((_overlap(g_x, band[a], axis), a) for a in anchors), reverse=True)
                if ov[0][0] >= 0.5 and (len(ov) < 2 or ov[1][0] < ov[0][0]):
                    blocks[ov[0][1]].append(x)
                    continue
            u = dom.alone(x, [('t', a) for a in anchors]) or dom.at[x]
            a = min(anchors, key=lambda a: (dom.gap(u, box[a]), box[a]['open'] > u['open']))
            blocks[a].append(x)
        covered = sum(len(v) for v in blocks.values())
        if any(len(v) < 2 for v in blocks.values()) or covered < 0.6 * len(members):
            continue
        for a in anchors:
            xs = blocks[a]
            cs = sorted((c for k, c in xs if k == 't'), key=int)
            groups.append({'id': f"{g['id']}-a{a}", 'label': f"{g['label']} · 칸 {a}", 'about': g.get('about0', g['about']), 'all': cs,
                           'cells': [c for c in cs if c in ai_cells], 'pictures': [p for k, p in xs if k == 'img']})
            for x in xs:
                owner[x] = len(groups) - 1
        moved = {x for v in blocks.values() for x in v}
        g['all'] = [c for c in g['all'] if ('t', c) not in moved]
        g['cells'] = [c for c in g['cells'] if ('t', c) not in moved]
        g['pictures'] = [p for p in g['pictures'] if ('img', p) not in moved]
        flags.append(f"{g['label']} → 칸 {' · '.join(anchors)}마다 나눔 (HTML 묶음)")
    # the key: the cell the group's cells come back to ('특징 1 — 칸 4 제품 기능' · '칸 5 특징의 쓰임' → 4), else its one name cell;
    # names of one kind and no common anchor ('실내 제품 시리즈' · '실외 제품 시리즈' · '키오스크 시리즈') are a list, not one item
    def keyed(g):
        g['own'] = set(g['all'])   # (a key outside the group — the product a sheet's feature rows describe — is named, not listed)
        g['about'] = g.setdefault('about0', g['about'])
        if g['about'] in ('matrix', 'picture'):
            g['key'] = None
            return
        roots = Counter(root(c) for c in g['all'] if refs_of.get(c))
        need = 2 if sum(roots.values()) >= 2 else 1   # (a group of one referring cell: what it refers to is its anchor)
        common = next((r for r, n in roots.most_common() if n >= need), None)
        names = sorted((c for c in g['all'] if is_name(c)), key=int)
        kind_of = {c: _name_kind(roles.get(c, ''), text.get(c, {}).get('mode')) for c in names}
        items = [c for c in names if kind_of[c] != 'item']   # (names of a product · solution · space · case before other names)
        kinds = Counter(kind_of[c] for c in items)
        # (a cell the others call '칸 10 공간' · '칸 4 제품' is that item's name, whatever its own mode)
        named_as = common and any(re.search(rf'칸\s?{common}\s?(공간|제품|솔루션|사례|고객|항목)', roles.get(c, '')) for c in g['all'])
        if common and (roots[common] >= 2 or is_name(common) or named_as or common not in g['all']):
            g['key'] = common   # the cell the others describe ('특징 1 — 칸 4 제품 기능' · '칸 17 단계에서 …' × 4 → 4 · 17)
        elif len(items) >= 2 and len(kinds) == 1 and not common:
            g['key'], g['about'] = None, 'list'   # names of one kind and no anchor: several items, not one
        else:   # (one plain name — a step's · a value's — is the group's; two of them label things inside it: '지표 이름' × 2)
            g['key'] = items[0] if items else names[0] if len(names) == 1 else common
    for g in groups:
        keyed(g)
    #  b. a picture no unit holds goes with the group whose cells sit next to it — the side (a card's picture before or after its
    #     cells) chosen for the whole sheet: one picture a group, then the layout's own sample agreeing (the picture shows what
    #     the key cell names), then before-first; a row of pictures followed by as many groups pairs in order
    idx = _sample_index()
    pos = {x: n for n, x in enumerate(seq)}
    runs: List[List[Tuple[int, str]]] = []
    for n, (kind, x) in enumerate(seq):
        if kind == 'img' and x in ai_pics:
            if runs and runs[-1][-1][0] == n - 1:
                runs[-1].append((n, x))
            else:
                runs.append([(n, x)])
    loose_p = lambda p: ('img', p) not in owner  # noqa: E731

    def side(n, step):
        out, k = [], n + step
        while 0 <= k < len(seq) and seq[k][0] != 'img':
            if ('t', seq[k][1]) in owner and owner[('t', seq[k][1])] not in out:
                out.append(owner[('t', seq[k][1])])
            k += step
        return out
    singles = [run[0] for run in runs if len(run) == 1 and loose_p(run[0][1])]
    choice = {}
    for name, step in (('after', 1), ('before', -1)):
        m = {p: (side(n, step) or [None])[0] for n, p in singles}
        got = [g for g in m.values() if g is not None]
        agree = sum(1 for p, g in m.items() if g is not None and _agrees(idx, imgs[p].get('value'), text.get(groups[g].get('key') or '', {}).get('value')))
        choice[name] = (len(set(got)) == len(got), agree, len(got), step == 1, m)
    best = max(choice.values(), key=lambda v: v[:4]) if singles else None
    # (a quarter of the sheet or more is the sheet's picture — a hero · a bird's-eye view · a full bleed — not a card's; a lone
    #  picture next to the first row is one too unless its own sample shows what that row names: on the library, 70 lone
    #  pairings were mostly such pictures, the 106 in sets were card pictures under 15% of the sheet)
    area = _areas(f)
    sure = lambda p, g: _agrees(idx, imgs[p].get('value'), text.get(groups[g].get('key') or '', {}).get('value'))  # noqa: E731
    pairs = {p: g for p, g in (best[4].items() if best and best[2] else []) if g is not None and loose_p(p) and area.get(p, 0) < BIG}
    if len(pairs) == 1 and not sure(*next(iter(pairs.items()))):
        pairs = {}
    after_side = bool(best and best[3])
    many = Counter(pairs.values())
    for p, g in pairs.items():
        if many[g] >= 2:
            continue
        groups[g]['pictures'].append(p)
        owner[('img', p)] = g
        flags.append(f"사진 {p} → {groups[g]['label']} (문서 순서{' · 견본 일치' if sure(p, g) else ''})")
    # (several pictures beside one group's cells: the group is several cards the element plan did not tell apart — a photo
    #  essay's captions · a table of contents' chapters — each picture with the cells on its side of the next one)
    for g, n in many.items():
        if n < 2:
            continue
        ps = sorted((p for p, x in pairs.items() if x == g), key=lambda p: pos[('img', p)])
        G = groups[g]
        span = {}
        for p in ps:
            k = pos[('img', p)] + (1 if after_side else -1)
            while 0 <= k < len(seq) and seq[k][0] != 'img':
                if seq[k][1] in G['all']:
                    span.setdefault(p, []).append(seq[k][1])
                k += 1 if after_side else -1
        if sum(1 for p in ps if span.get(p)) < 2:
            continue
        for p in ps:
            cs = sorted(span.get(p) or [], key=int)
            if not cs:
                continue
            groups.append({'id': f"{G['id']}-p{p}", 'label': f"{G['label']} · 사진 {p}", 'about': G['about'], 'all': cs,
                           'cells': [c for c in cs if c in ai_cells], 'pictures': [p]})
            keyed(groups[-1])
            owner[('img', p)] = len(groups) - 1
            for c in cs:
                owner[('t', c)] = len(groups) - 1
        moved = {c for p in ps for c in span.get(p) or []}
        G['all'] = [c for c in G['all'] if c not in moved]
        G['cells'] = [c for c in G['cells'] if c not in moved]
        keyed(G)
        flags.append(f"{G['label']} → 사진 {' · '.join(ps)}마다 나눔 (문서 순서)")
    for run in runs:
        if len(run) < 2 or not all(loose_p(p) and area.get(p, 0) < BIG for _, p in run):
            continue
        after = side(run[-1][0], 1)
        if len(after) == len(run) and not any(groups[g]['pictures'] for g in after):
            for (_, p), g in zip(run, after):
                groups[g]['pictures'].append(p)
                owner[('img', p)] = g
            flags.append(f"사진 {' · '.join(p for _, p in run)} → {' · '.join(groups[g]['label'] for g in after)} (사진 줄 순서)")
    #  c. a picture still alone, right before cells that caption it ('대표 제품 사진 캡션') or name its product ('현장 대표 기기
    #     이름'), is a group of its own
    product_name = lambda c: is_name(c) and _name_kind(roles.get(c, ''), text.get(c, {}).get('mode')) == 'product'  # noqa: E731
    for p in sorted((p for p in ai_pics if loose_p(p) and ('img', p) in pos), key=lambda p: pos[('img', p)]):
        n, caps = pos[('img', p)] + 1, []
        while n < len(seq) and seq[n][0] == 't' and ('t', seq[n][1]) not in owner:
            c = seq[n][1]
            if c in ai_cells and (re.search(r'사진|캡션|이미지', roles.get(c, '')) or product_name(c)):
                caps.append(c)
            n += 1
        if caps:
            named = [c for c in caps if product_name(c)]
            groups.append({'id': f"pic-{p}", 'label': f"사진 {p}", 'about': 'product' if named else 'picture', 'all': caps, 'cells': caps,
                           'pictures': [p]})
            keyed(groups[-1])
            owner[('img', p)] = len(groups) - 1
            for c in caps:
                owner[('t', c)] = len(groups) - 1
    #  d. a cell still loose between two elements of one group in the document (a chapter's number between its picture and its
    #     name) is that group's
    def neighbour(n, step):
        k = n + step
        while 0 <= k < len(seq) and seq[k] not in owner:
            k += step
        return owner.get(seq[k]) if 0 <= k < len(seq) else None
    joins = []
    for c in ai_cells:
        if ('t', c) in owner or ('t', c) not in pos:
            continue
        a, b = neighbour(pos[('t', c)], -1), neighbour(pos[('t', c)], 1)
        if a is not None and a == b and groups[a]['about'] != 'matrix':
            joins.append((c, a))
    for c, k in joins:
        g = groups[k]
        g['all'].append(c)
        g['cells'].append(c)
        owner[('t', c)] = k
        keyed(g)
        flags.append(f"칸 {c} → {g['label']} (그 묶음 사이)")
    # 5. the layout's own sample agrees (when the composer's picture index is at hand); a picture whose own sample shows what its
    #    group's key names shows the item
    flags += _sample_flags(groups, text, imgs)
    shows_item = {p for g in groups if g.get('key') for p in g['pictures']
                  if imgs[p]['mode'] == 'product' or _agrees(idx, imgs[p].get('value'), text.get(g['key'], {}).get('value'))}
    out_groups = []
    for g in groups:
        if not g['cells'] and not g['pictures']:
            continue
        cells = []
        for c in sorted(set(g['cells']) | ({g['key']} if g['key'] in ai_cells and g['key'] in g['own'] else set()), key=int):
            form, n = _form(text[c].get('value'), roles.get(c, ''))
            mode = text[c].get('mode')
            cells.append({'i': int(c), 'role': clean(roles.get(c) or ''), 'form': form, 'len': n,
                          **({'key': True} if c == g['key'] else {}),
                          **({'names': _name_kind(roles.get(c, ''), mode)} if is_name(c) else {}),
                          **({'of': [int(r) for r in refs_of[c]]} if refs_of.get(c) else {}),
                          **({'same': [int(r) for r in same_of[c]]} if same_of.get(c) else {})})
        pics = [_pic(p, imgs, hints, p in shows_item) for p in sorted(set(g['pictures']), key=int)]
        out_groups.append({'id': g['id'], 'label': g['label'], 'about': g['about'], 'key': int(g['key']) if g['key'] else None,
                           **({'key_by': 'fixed' if g['key'] in keep or text.get(g['key'], {}).get('mode') in ('fixed', 'section') else 'code'}
                              if g['key'] and g['key'] not in ai_cells else {}),
                           **({'key_in': next((o['label'] for o in groups if g['key'] in o['own'] and o is not g), '장 전체')} if g['key'] and g['key'] not in g['own'] else {}),
                           'cells': cells, 'pictures': pics})
    in_group = {c for g in groups for c in g['cells']}
    frame = []
    for c in sorted((c for c in ai_cells if c not in in_group), key=int):
        form, n = _form(text[c].get('value'), roles.get(c, ''))
        frame.append({'i': int(c), 'role': clean(roles.get(c) or ''), 'form': form, 'len': n, **({'of': [int(r) for r in refs_of[c]]} if refs_of.get(c) else {}),
                      **({'same': [int(r) for r in same_of[c]]} if same_of.get(c) else {})})
    loose = [_pic(p, imgs, hints) for p in sorted((p for p in ai_pics if ('img', p) not in owner), key=int)]
    return {'f': f, 'v': VERSION, 'name': clean(meta.get('name') or ''), 'say': clean(design.get('say') or ''), 'fixed': whole_fixed,
            'groups': out_groups, 'frame': frame, 'pictures': loose, 'flags': flags,
            'counts': {'cells': len(ai_cells), 'pictures': len(ai_pics), 'groups': len(out_groups)}}


def _source(f: str) -> Tuple[dict, List[dict], bool]:
    """(meta, slots, whole fixed): the layout library (admin 레이아웃 관리) — a composition-only layout (DSS overview · 고객사의
    이해) from the composer's library"""
    try:
        _, meta, slots, _ = flows._sheet(f)
        try:
            fixed = bool(flows.flow_for(f)['whole_fixed'])
        except Exception:  # noqa: BLE001
            fixed = False
        return meta, slots, fixed
    except KeyError:
        pass
    try:
        from .poc.adapters import compose
        entry = ((compose._auto(grounded=True).load().get('layouts') or {}).get(f))
    except Exception:  # noqa: BLE001 — no composer here: a layout the registry does not know has no metadata
        entry = None
    if not entry:
        raise KeyError(f)
    modes = entry.get('modes') or {}
    mt, mi = modes.get('t') or {}, modes.get('img') or {}
    slots = [{'id': str(t['i']), 'kind': 't', 'mode': mt.get(str(t['i']), 'ai'), 'value': t.get('text') or '', 'o': t.get('o')} for t in entry.get('texts') or [] if not t.get('img')]
    slots += [{'id': str(im['i']), 'kind': 'img', 'mode': mi.get(str(im['i']), 'ai'), 'value': im.get('sample') or '', 'o': im.get('o')} for im in entry.get('images') or []]
    slots.sort(key=lambda s: (s['o'] is None, s['o'] or 0))   # (the document order, as the HTML has them)
    fixed = bool(entry.get('static')) or flows.default_fixed(f)
    return entry, slots, fixed


def _pic(p: str, imgs: dict, hints: list, item: bool = False) -> dict:
    item = item or imgs[p]['mode'] == 'product'
    hint = clean(hints[int(p)]) if int(p) < len(hints) else ''
    return {'slot': p, 'shows': 'item' if item else 'scene', **({'hint': hint} if hint and not item else {})}


BIG = 0.25   # a picture this share of the sheet or more is the sheet's own


BOX = re.compile(r'(left|top|width|height):\s*(-?[\d.]+)px')


def _union(bs: List[Tuple[float, float, float, float]]) -> Optional[Tuple[float, float, float, float]]:
    if not bs:
        return None
    x0, y0 = min(b[0] for b in bs), min(b[1] for b in bs)
    x1, y1 = max(b[0] + b[2] for b in bs), max(b[1] + b[3] for b in bs)
    return x0, y0, x1 - x0, y1 - y0


def _overlap(a, b, axis: int) -> float:
    """how much of the shorter of ``a`` · ``b`` the other covers along ``axis`` (0 = x, 1 = y)"""
    lo, hi = max(a[axis], b[axis]), min(a[axis] + a[axis + 2], b[axis] + b[axis + 2])
    return max(0.0, hi - lo) / max(1.0, min(a[axis + 2], b[axis + 2]))


class _Dom:
    """the layout HTML's nesting: which container holds which slot, and where it sits"""

    def __init__(self, html: str):
        from . import layout_library as live
        self.nodes = live.nodes(html)
        self.at: Dict[Tuple[str, str], dict] = {}
        for n in self.nodes:
            a = n['attrs']
            if a.get('data-img', '').isdigit():
                self.at.setdefault(('img', a['data-img']), n)
            elif a.get('data-tb', '').isdigit():
                self.at.setdefault(('t', a['data-tb']), n)
        self._geo: Dict[Any, Any] = {}

    def geo(self, x) -> Optional[Tuple[float, float, float, float]]:
        """the box (left · top · width · height) of the nearest absolutely placed element holding ``x``"""
        if x not in self._geo:
            n, out = self.at.get(x), None
            if n:
                for b in sorted((b for b in self.nodes if b is n or self._holds(b, n)), key=lambda b: b['close'] - b['open']):
                    st = b['attrs'].get('style') or ''
                    if 'absolute' in st:
                        g = {k: float(v) for k, v in BOX.findall(st)}
                        if {'left', 'top', 'width', 'height'} <= set(g):
                            out = (g['left'], g['top'], g['width'], g['height'])
                            break
            self._geo[x] = out
        return self._geo[x]

    def _holds(self, box: dict, n: dict) -> bool:
        return box is not n and box['open'] <= n['start'] and n['close'] <= box['close']

    def inside(self, x, box) -> bool:
        n = self.at.get(x)
        return bool(n) and (n is box or self._holds(box, n))

    def common(self, xs) -> Optional[dict]:
        """the smallest container holding every one of ``xs``"""
        ns = [self.at[x] for x in xs if x in self.at]
        if len(ns) < 2:
            return None
        boxes = [b for b in self.nodes if all(self._holds(b, n) for n in ns)]
        return min(boxes, key=lambda b: b['close'] - b['open']) if boxes else None

    @staticmethod
    def gap(a: dict, b: dict) -> int:
        if a['close'] <= b['start']:
            return b['start'] - a['close']
        if b['close'] <= a['start']:
            return a['start'] - b['close']
        return 0

    def alone(self, x, others) -> Optional[dict]:
        """the largest container of ``x`` that holds none of ``others``"""
        n = self.at.get(x)
        if not n:
            return None
        rest = [self.at[o] for o in others if o in self.at]
        best = None
        for box in sorted((b for b in self.nodes if self._holds(b, n)), key=lambda b: b['close'] - b['open']):
            if any(self._holds(box, o) or box is o for o in rest):
                break
            best = box
        return best


def _dom(f: str) -> Optional[_Dom]:
    try:
        from . import layout_library as live
        catalog, layouts, html = live.base()
        rep = flows.representative(f, layouts) if f in layouts else f
        items = live.effective_items(live.load(), layouts)
        key = rep if rep in html else f
        return _Dom(live.apply_html(html[key], items.get(rep, {}) or items.get(f, {}))) if key in html else None
    except Exception:  # noqa: BLE001 — no HTML here: the element plan's groups stand
        return None


def _areas(f: str) -> Dict[str, float]:
    """each picture's share of the 1280 × 720 sheet (the composer library's boxes)"""
    try:
        from .poc.adapters import compose
        entry = (compose._auto(grounded=True).load().get('layouts') or {}).get(f) or {}
    except Exception:  # noqa: BLE001
        return {}
    return {str(im['i']): (im.get('w') or 0) * (im.get('h') or 0) / (1280 * 720) for im in entry.get('images') or []}


def _sample_index():
    """(picture index, products, solutions) of the composer, or None"""
    try:
        from composer import pictures   # (the composer path is set up once the app's composer adapter was imported)
        from composer.library import load
        return pictures, pictures.load()['images'], load().get('products_all') or {}, load().get('solutions') or {}
    except Exception:  # noqa: BLE001
        return None


def _named(P: dict, said: str) -> set:
    """products a sample text names — by model · name, else by a model's series ('OH55C' → the OH55 line)"""
    said = str(said or '')
    out = {q for q, p in P.items() for n in (p.get('model'), p.get('name')) if n and len(n) >= 4 and n in said}
    if not out:
        for m in CODE.findall(said):
            out |= {q for q, p in P.items() if str(p.get('model') or '')[:4] == m[:4] and len(m) >= 4}
    return out


def _agrees(idx, src: Any, said: Any) -> bool:
    """the layout's own picture shows (a product of the family of) what its key cell's own text names"""
    if not idx or not src or not said:
        return False
    from .poc.item_mask import _family
    pictures, IM, P, _ = idx
    shown = set((IM.get(pictures.norm_src(str(src))) or {}).get('products') or [])
    named = _named(P, str(said))
    if not shown or not named:
        return False
    return bool(shown & named) or bool({_family(P[q]) for q in shown if q in P} & {_family(P[q]) for q in named if q in P})


def _sample_flags(groups: List[dict], text: dict, imgs: dict) -> List[str]:
    idx = _sample_index()
    if not idx:
        return []
    pictures, IM, P, S = idx
    out = []
    for g in groups:
        k = g.get('key')
        if not k:
            continue
        said = str(text.get(k, {}).get('value') or '')
        if any(x.get('name') and x['name'] in said for x in S.values()):
            continue   # (a solution's card pictures the device it runs on)
        named = {q for q, p in P.items() for n in (p.get('model'), p.get('name')) if n and len(n) >= 4 and n in said}
        if not named:
            continue
        for p in g['pictures']:
            if imgs[p]['mode'] != 'product':
                continue
            shown = set((IM.get(pictures.norm_src(imgs[p].get('value') or '')) or {}).get('products') or [])
            if shown and not (shown & named):
                out.append(f"{g['label']}: 견본에서 이름 칸 {k}과 사진 {p}의 제품이 다름")
    return out


def build(f: str) -> dict:
    return _build(f, (flows._lib_stamp(), layout_cells.stamp() if hasattr(layout_cells, 'stamp') else 0))


def view(f: str) -> dict:
    """the admin popup (레이아웃 관리 → 상세 → 메타데이터)"""
    try:
        return build(f)
    except KeyError:   # (a composition-only sheet the layout library does not hold)
        return {'f': f, 'v': VERSION, 'none': True, 'groups': [], 'frame': [], 'pictures': [], 'flags': [], 'counts': {'cells': 0, 'pictures': 0, 'groups': 0}}
    except Exception as exc:  # noqa: BLE001
        return {'f': f, 'v': VERSION, 'error': f'{type(exc).__name__}: {str(exc)[:160]}', 'groups': [], 'frame': [], 'pictures': [], 'flags': []}


def prompt_block(meta: dict, cells: Optional[List[str]] = None, pictures: Optional[List[str]] = None) -> dict:
    """the part of a layout's metadata one check call needs: the groups and frame cells among ``cells`` · ``pictures``"""
    want_c = set(int(c) for c in cells) if cells is not None else None
    want_p = set(pictures) if pictures is not None else None
    groups = []
    for g in meta.get('groups') or []:
        cs = [c for c in g['cells'] if want_c is None or c['i'] in want_c]
        ps = [p for p in g['pictures'] if want_p is None or p['slot'] in want_p]
        if cs or ps:
            groups.append({k: v for k, v in {**g, 'cells': cs, 'pictures': ps}.items() if v not in (None, [], '')})
    frame = [c for c in meta.get('frame') or [] if want_c is None or c['i'] in want_c]
    pics = [p for p in meta.get('pictures') or [] if want_p is None or p['slot'] in want_p]
    return {k: v for k, v in {'say': meta.get('say'), 'groups': groups, 'frame': frame, 'pictures': pics}.items() if v}
