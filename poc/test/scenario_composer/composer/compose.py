"""Stage C — layouts for the chosen parts.

Every part carries the 샘플 버티컬 시나리오 module it came from (``src``). Its slides are the module's slides; each slide is
then *adapted*, never invented:

1. retired layout → the photo version that replaced it
2. another industry's variant → the same family's variant for this customer's industry (or the generic member)
3. a solution-only layout for a solution the customer did not pick → the same role for a picked solution, else the
   generic solution layout of that role
4. product grids → the member of the same series that holds as many products as the customer picked
5. a layout already used in the deck → the closest unused layout of the same part type (the app inserts no duplicates)

A part without ``src`` (the person added or renamed it) is matched to a library module first: candidates of the same
part type, ranked by wording, and Gemini picks one.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Dict, List, Optional, Sequence, Set

from .library import load
from .textsim import BM25, overlap, tokens

PRODUCT_SERIES = [
    ['L_PH_P1_C', 'L_PH_P2_C', 'L_PH_P3_A', 'L_PH_P4_A', 'L_PH_P5_A'],
    ['L_P1B', 'L_P2B', 'L_P3B', 'L_P4B', 'L_P5B'],
    [None, 'L_P2D', 'L_P3D', 'L_P4D', None],
]
# generic solution layouts by role (intro · diagram · scene) when the customer has no matching solution
SOL_ROLE = {'I': 'L_PH_SOL_S', 'D': 'L_PH_SA_B', 'S': 'L_PH_SO_B'}


def _L():
    return load()['layouts']


def _active(f: str) -> bool:
    l = _L().get(f)
    return bool(l) and not l.get('retired')


def _variant(f: str, ind: Optional[str], used: Set[str]) -> str:
    """same family, this industry (or generic) — unused first."""
    L, lib = _L(), load()
    l = L[f]
    fam = [x for x in lib['families'].get(l['fam'], []) if _active(x)]
    if len(fam) <= 1:
        return f
    same = [x for x in fam if L[x].get('ind') == ind]
    gen = [x for x in fam if not L[x].get('ind')]
    for pool in (same, gen):
        free = [x for x in pool if x not in used]
        if free:
            return free[0]
    return f


def _sol_swap(f: str, sols: Sequence[str], used: Set[str], ind: Optional[str]) -> Optional[str]:
    L = _L()
    l = L[f]
    m = re.match(r'([A-Z]+)-([IDS])', l.get('code') or '')
    role = m.group(2) if m else 'S'
    for s in sols:
        cands = [x for x, y in L.items() if not y.get('retired') and y.get('sol') == s and re.match(rf'[A-Z]+-{role}\b', y.get('code') or '')]
        cands.sort(key=lambda x: (0 if L[x].get('ind') == ind else 1 if not L[x].get('ind') else 2))
        for x in cands:
            if x not in used and (not L[x].get('ind') or L[x].get('ind') == ind):
                return x
    g = SOL_ROLE.get(role)
    return g if g and g not in used else None


def _product_fit(f: str, n: int, used: Set[str]) -> str:
    for series in PRODUCT_SERIES:
        if f in series:
            want = max(1, min(5, n))
            order = sorted(range(5), key=lambda j: (abs(j + 1 - want), -(j + 1)))
            for j in order:
                x = series[j]
                if x and _active(x) and (x == f or x not in used) and j + 1 <= max(want, 1):
                    return x
            return f
    return f


def _static_conflict(f: str, ind: Optional[str]) -> bool:
    """fixed (non-editable) wording of another industry — e.g. '메뉴보드' printed into a layout used for a hotel."""
    from .library import EXTRA_KW
    L = _L()
    l = L[f]
    if not l.get('ind') or l.get('ind') == ind or not l.get('static'):
        return False
    text = ' '.join(l['static'])
    words = EXTRA_KW.get(l['ind'], [])
    return any(w in text for w in words)


_SUB: Dict[str, object] = {}


def _usage_prior() -> Dict[str, Dict[str, float]]:
    """how often the frontier decks put layout f into a part of type t — P(f | t), normalised per type."""
    if 'prior' not in _SUB:
        from collections import Counter, defaultdict
        c: Dict[str, Counter] = defaultdict(Counter)
        for m in load()['modules']:
            for x in m['slides']:
                c[m['type']][x['f']] += 1
        _SUB['prior'] = {t: {f: n / max(v.values()) for f, n in v.items()} for t, v in c.items()}
    return _SUB['prior']


def _substitute(f: str, role: str, ptype: str, ind: Optional[str], used: Set[str], sols: Sequence[str]) -> Optional[str]:
    """closest unused active layout of the same part type: wording of the slide role vs layout name · when · purpose."""
    L = _L()
    l = L.get(f) or {}
    pool = [x for x, y in L.items() if not y.get('retired') and x not in used and not y.get('cover')
            and (y.get('p') == ptype or y.get('p') == l.get('p') or y.get('p2') == ptype)
            and (not y.get('ind') or y.get('ind') == ind) and (not y.get('sol') or y.get('sol') in sols)]
    if not pool:
        return None
    q = f"{role} {l.get('name', '')} {l.get('when', '')}"
    prior = _usage_prior().get(ptype, {})
    best, bs = None, -1.0
    for x in pool:
        y = L[x]
        s = overlap(q, f"{y.get('name', '')} {y.get('when', '')} {y.get('g', '')}")
        s += 0.3 if y.get('p') == ptype else (0.1 if y.get('p') == l.get('p') else 0)
        s += 0.4 * prior.get(x, 0.0)
        s += 0.15 if y.get('c') == l.get('c') else 0
        s += 0.1 if abs(len(y.get('images') or []) - len(l.get('images') or [])) <= 1 else 0
        s += 0.1 if y.get('ind') == ind and ind else 0
        if s > bs:
            best, bs = x, s
    return best


def product_slots(f: str) -> int:
    l = _L().get(f) or {}
    return sum(1 for im in l.get('images') or [] if im.get('fit') == 'contain' or im.get('kind') in ('cut', 'detail', 'kiosk', 'signage'))


def _fewer_products(f: str, role: str, ptype: str, ind, used: Set[str], sols, cap: int):
    L = _L()
    l = L[f]
    pool = [x for x, y in L.items() if not y.get('retired') and x not in used and not y.get('cover') and (y.get('p') == l.get('p'))
            and (not y.get('ind') or y.get('ind') == ind) and (not y.get('sol') or y.get('sol') in sols) and 0 < product_slots(x) <= cap]
    if not pool:
        return None
    q = f"{role} {l.get('name', '')} {l.get('when', '')}"
    return max(pool, key=lambda x: overlap(q, f"{L[x].get('name', '')} {L[x].get('when', '')} {L[x].get('g', '')}"))


SERIES_A = {'L_PH_P1_C', 'L_PH_P2_C', 'L_PH_P3_A', 'L_PH_P4_A', 'L_PH_P5_A'}


def exemplar_products(ex_key: Optional[str]) -> List[str]:
    """products the frontier deck showed as product cuts on this slide."""
    lib = load()
    ex = lib['exemplars'].get(ex_key) if ex_key else None
    if not ex:
        return []
    out = []
    for v in (ex.get('img') or {}).values():
        if not isinstance(v, dict):
            continue
        it = lib['images'].get(v.get('src') or '') or {}
        if it.get('cls') == 'product' or v.get('fit') == 'contain':
            for p in list(v.get('products') or []) + list(it.get('products') or []):
                if p in lib['products'] and p not in out:
                    out.append(p)
    return out


def adapt_slide(x: dict, part: dict, inp: dict, a: dict, used: Set[str], n_products: int, reserved: Optional[Set[str]] = None) -> dict:
    L = _L()
    ind = a.get('industry') or inp.get('ind')
    f0 = f = x['f']
    why = []
    taken = used
    used = used | (reserved or set())  # an alternative must not take a layout a later slide of the plan asks for (no cascades)
    if f not in SERIES_A and len(part.get('_src_slides') or []) > 1:
        from .fill import map_products
        exp = exemplar_products(x.get('ex'))
        if exp and not map_products(exp, inp['products']):
            return {}  # a slide about products this customer did not pick (and nothing of the same category)
    if L[f].get('retired') and L[f]['retired'] in L:
        f = L[f]['retired']
        why.append('retired→photo version')
    if L[f].get('ind') and L[f]['ind'] != ind:
        v = _variant(f, ind, used)
        if v != f:
            f = v
            why.append('industry variant')
    if L[f].get('sol') and L[f]['sol'] not in inp['solutions']:
        v = _sol_swap(f, inp['solutions'], used, ind)
        if v:
            f = v
            why.append('solution swap')
    if (L[f].get('pc') or 0) > 0:
        v = _product_fit(f, n_products, used)
        if v != f:
            f = v
            why.append(f'product count {n_products}')
    cap = max(2, 2 * n_products)
    if product_slots(f) > cap + 1:  # a product catalogue page with more product pictures than this customer has products
        v = _fewer_products(f, x.get('role') or '', part['type'], ind, used, inp['solutions'], cap)
        if v:
            f = v
            why.append(f'product capacity {cap}')
        elif len(part.get('_src_slides') or []) > 1:
            return {}
    if _static_conflict(f, ind):
        v = _variant(f, None, used)
        if v == f or _static_conflict(v, ind):
            v = _substitute(f, x.get('role') or '', part['type'], ind, used, inp['solutions'])
        if v:
            f = v
            why.append('fixed wording of another industry')
    if f in taken:
        v = _variant(f, ind, used)
        if v in used or v == f:
            v = _substitute(f, x.get('role') or '', part['type'], ind, used, inp['solutions'])
        if not v:
            return {}
        f = v
        why.append('already used → closest unused')
    taken.add(f)
    return {'f': f, 'from': f0, 'role': x.get('role') or '', 'ex': x.get('ex'), 'adapt': why}


# ------------------------------------------------------------------------------------------------ custom parts
def match_modules(inp: dict, a: dict, parts: List[dict], llm, exclude: Sequence[str] = (), prefer: Sequence[str] = ()) -> Dict[int, str]:
    """parts without a library module → one module each (same part type, closest wording; Gemini picks among 4)."""
    lib = load()
    todo = [i for i, p in enumerate(parts) if not p.get('src') and not p.get('deck')]
    if not todo:
        return {}
    ex = set(exclude)
    pool = [m for m in lib['modules'] if not m['cover'] and m['sid'] not in ex]
    bm = BM25([tokens(f"{m['name']} {m['goal']} {' '.join(m['items'])}") for m in pool])
    ind = a.get('industry')
    choices: Dict[int, List[dict]] = {}
    for i in todo:
        p = parts[i]
        q = tokens(f"{p.get('name', '')} {' '.join(p.get('items') or [])}")
        sc = bm.scores(q)
        ranked = []
        for j, m in enumerate(pool):
            s = sc[j]
            s += 3.0 if m['type'] == p.get('type') else (-2.0 if p.get('type') not in (None, 'free') else 0)
            s += 1.0 if m['ind'] == ind else 0
            s += 1.0 if m['sid'] in prefer else 0
            ranked.append((s, m))
        ranked.sort(key=lambda t: -t[0])
        choices[i] = [m for _, m in ranked[:4]]
    rows = []
    for i in todo:
        p = parts[i]
        opts = '\n'.join(f"    - {m['mid']}: {m['name']} ({m['type']}, {len(m['slides'])}장) — {', '.join(s['role'][:30] for s in m['slides'][:3])}" for m in choices[i])
        rows.append(f"파트 {i}: {p.get('name')} [{p.get('type')}] — {' / '.join(p.get('items') or [])}\n{opts}")
    allowed = sorted({m['mid'] for v in choices.values() for m in v})
    schema = {'type': 'OBJECT', 'properties': {'picks': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
        'part': {'type': 'INTEGER'}, 'mid': {'type': 'STRING', 'enum': allowed}}, 'required': ['part', 'mid']}}}, 'required': ['picks']}
    prompt = f"""제안서 Storyboard의 파트마다, 그 파트 내용을 가장 잘 담는 샘플 버티컬 시나리오 장표 묶음(모듈)을 하나씩 고르세요. 파트 이름·내용 항목과 모듈의 장 역할을 비교합니다.
고객 업종: {ind}
{chr(10).join(rows)}
JSON만: {{"picks":[{{"part":0,"mid":"..."}}]}} — 각 파트는 자기 후보 중에서만 고릅니다."""

    def check(d):
        got = {x['part']: x['mid'] for x in d.get('picks') or []}
        for i in todo:
            if got.get(i) not in [m['mid'] for m in choices[i]]:
                return f'파트 {i} 는 자기 후보 중 하나를 골라야 합니다.'
        return True
    d = llm.json(stage='match_modules', prompt=prompt, schema=schema, validate=check, temperature=0.1)
    return {x['part']: x['mid'] for x in d['picks'] if x['part'] in choices}


def compose_layouts(inp: dict, a: dict, parts: List[dict], llm=None, exclude: Sequence[str] = (), base: Optional[str] = None,
                    used: Optional[Set[str]] = None) -> List[dict]:
    lib = load()
    M = {m['mid']: m for m in lib['modules']}
    parts = [dict(p) for p in parts]
    for p in parts:  # a src from an excluded scenario is not available (evaluation)
        if p.get('src') and (p['src'] not in M or M[p['src']]['sid'] in set(exclude)):
            p['src'] = None
    if any(not p.get('src') and not p.get('deck') for p in parts):
        if llm is None:
            raise ValueError('parts without a module need the model to pick one')
        for i, mid in match_modules(inp, a, parts, llm, exclude, prefer=[base] if base else []).items():
            parts[i]['src'] = mid
            parts[i]['matched'] = True
    used = set(used or ())
    n_products = len(inp['products'])
    later = Counter(x['f'] for p in parts for x in (M[p['src']]['slides'] if p.get('src') in M else []))
    out = []
    for p in parts:
        m = M.get(p.get('src'))
        slides = []
        if m:
            p['_src_slides'] = m['slides']
            for x in m['slides']:
                later[x['f']] -= 1
                reserved = {f for f, c in later.items() if c > 0}
                y = adapt_slide({**x, 'ex': f"{m['sid']}:{x['k']}"}, p, inp, a, used, n_products, reserved)
                if not y:
                    continue
                if y['f'] in SERIES_A and any(z['f'] in SERIES_A and (_L()[z['f']].get('pc') or 0) >= n_products for z in slides):
                    used.discard(y['f'])
                    continue  # one product grid already shows every product of this customer — a second one repeats it
                slides.append(y)
        p.pop('_src_slides', None)
        out.append({**p, 'slides': slides})
    return out
