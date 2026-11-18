"""Element plans — how one sheet is split into elements (요소) for writing.

A sheet is a frame (title · lead · conclusion) plus repeated elements: cards, rows or columns. When the
elements carry different things (two products, three requirements, a space each) one model call for the
whole sheet mixes them up — the same proposal under every card, two products in one chip, a card about
another product. Such a sheet is written element by element instead (fan-out): each element gets its own
call with only its own entity's facts and its own prompt; the frame is written afterwards from the
elements' results and the merge step checks the elements against each other (fan-in).

  frame   [slot ids]                     sheet-level cells, written after the elements
  units   [{id, label, slots, imgs, entity}]
          entity  point    a requirement row (its item, when one answers it)
                  product · solution · case · space   one DSS item / space per element
                  topic    no entity — a distinct angle of the sheet's message
  split   whether the sheet is written per element (the base decision; an admin edit can change it)

Sources, in order: a layout-specific design for the sheets the compositions use (니즈 · 핵심 제안 ·
공간별 제품 · 공간 시나리오), the named slots of the generated sheets (toc_slots: nm0 · kw0_1 …), and
for every other sheet the geometry — the same box sizes repeated at a fixed offset.
"""
from __future__ import annotations

from collections import Counter
from functools import lru_cache
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
ENTITY_LABELS = {'point': '요구', 'product': '제품', 'solution': '솔루션', 'case': '사례', 'space': '공간', 'topic': '주제'}
WRITABLE = ('ai', 'product', 'solution', 'case')
NAME = re.compile(r'^([a-z]+?)(\d+)(?:_(\d+))?([a-z]*)$')
CHROME = {'eb', 'logo', 'foot', 'conf'}
SPACE_P = re.compile(r'^L_VS_SPACE_P(\d)$')
CORE = re.compile(r'^L_VS_CORE_\d$')
SCN_S = re.compile(r'^L_TOC_SCN_S\d$')
SPLIT_CELLS = 36          # elements that are topics only (stages · KPIs) stay in one call unless the sheet is this large


def library_path() -> Path:
    return Path(os.environ.get('WM_COMPOSER_DATA') or ROOT / 'app/data/runtime/composer') / 'library.json'


@lru_cache(maxsize=2)
def _library(name: str, stamp: int) -> dict:
    raw = json.loads(Path(name).read_text(encoding='utf-8'))
    keep = {}
    for f, L in raw.get('layouts', {}).items():
        keep[f] = {'texts': [{k: t.get(k) for k in ('i', 'role', 'x', 'y', 'w', 'h', 'font', 'text', 'img')} for t in L.get('texts') or []],
                   'images': [{k: t.get(k) for k in ('i', 'kind', 'x', 'y', 'w', 'h')} for t in L.get('images') or []],
                   'modes': L.get('modes') or {}}
    return {'layouts': keep, 'toc_slots': raw.get('toc_slots') or {}}


def library() -> dict:
    p = library_path()
    try:
        return _library(str(p), p.stat().st_mtime_ns)
    except FileNotFoundError:
        return {'layouts': {}, 'toc_slots': {}}


def _mode(L, kind, i):
    return ((L.get('modes') or {}).get(kind) or {}).get(str(i)) or 'ai'


def _footer(t) -> bool:
    return (t.get('y') or 0) >= 640 and (t.get('role') or '') in ('utility', 'label', '')


def _texts(L):
    return [t for t in L['texts'] if not t.get('img')]


def _entity(L, slots, imgs, geometric=False, f='') -> str:
    """what one element carries. Geometry alone is weaker evidence: a card is a product card only when it holds a product cut
    (or a case cell); a scene photo or a product-name cell on a stage · package card does not make it a space · product."""
    modes = [_mode(L, 't', i) for i in slots]
    if geometric:
        kinds = {im['i']: im.get('kind') for im in L['images']}
        if 'case' in modes:
            return 'case'
        if any(kinds.get(i) in ('cut', 'detail', 'kiosk', 'signage') for i in imgs):
            return 'product'
        return 'topic'
    for m in ('case', 'solution', 'product'):
        if m in modes:
            return m
    kinds = {im['i']: im.get('kind') for im in L['images']}
    ks = [kinds.get(i) for i in imgs]
    if any(k in ('cut', 'detail', 'kiosk', 'signage') for k in ks):
        return 'product'
    if f.startswith(('L_TOC_JOURNEY', 'L_TOC_SCN_S')) and any(k == 'space' for k in ks):
        return 'space'   # sheets whose columns are the plan's spaces; elsewhere a scene photo is decoration
    return 'topic'


def _unit(uid, label, slots, imgs, entity):
    return {'id': uid, 'label': label, 'slots': sorted(slots), 'imgs': sorted(imgs), 'entity': entity}


# ---------------------------------------------------------------- designs for the composition sheets
def _needs(L):
    # 니즈 · 기술 · 제안 3열: Q1–Q3 rows — the customer's voice, the item that answers it (set by code), the proposal, two actions
    units = [_unit(f'q{k + 1}', f'Q{k + 1}', [7 + 7 * k, 8 + 7 * k, 10 + 7 * k, 11 + 7 * k, 12 + 7 * k], [k], 'point') for k in range(3)]
    return {'frame': [1, 2], 'units': units, 'source': 'design'}


def _core(L):
    # 핵심 제안 상세: two rows (01 · 02) — a sub-proposal, its item (set by code), what it does, three steps
    units = [_unit(f'r{r + 1}', f'{r + 1:02d}', [4 + 7 * r, 5 + 7 * r, 6 + 7 * r, 7 + 7 * r, 8 + 7 * r, 9 + 7 * r], [r], 'point') for r in range(2)]
    return {'frame': [1, 2], 'units': units, 'source': 'design'}


def _space_p(f, L):
    # 공간별 제품 · 제품 k개: card j = cells 3 + per·j … (a product each), frame = the space's name and its line
    k = int(SPACE_P.match(f).group(1))
    last = max((t['i'] for t in _texts(L) if not _footer(t)), default=2)
    per = max(1, (last - 2) // k)
    cuts = sorted(im['i'] for im in L['images'] if im.get('kind') == 'cut')
    units = [_unit(f'p{j + 1}', f'제품 {j + 1}', list(range(3 + per * j, 3 + per * (j + 1))), cuts[j:j + 1], 'product') for j in range(k)]
    return {'frame': [1, 2], 'units': units, 'source': 'design'}


def _named(f, L, names, imgs):
    """units from the generated sheets' named slots: names with the same stem set and index range are one family (nm0 · in0 · kw0_1)."""
    fams, frame = {}, []
    for name, i in names.items():
        m = NAME.match(name)
        if name in CHROME or not m:
            if name not in CHROME and name != 'eb':
                frame.append(int(i))
            continue
        stem = m.group(1) + ('_' if m.group(3) else '') + m.group(4)
        fams.setdefault(stem, {}).setdefault(int(m.group(2)), []).append(int(i))
    groups = {}
    for stem, idx in fams.items():
        groups.setdefault(tuple(sorted(idx)), []).append(stem)
    units = []
    img_fams = {}
    for name, i in (imgs or {}).items():
        m = NAME.match(name)
        if m:
            img_fams.setdefault(m.group(1), {}).setdefault(int(m.group(2)), []).append(int(i))
    for idx, stems in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        if len(idx) < 2:
            frame += [i for s in stems for k in idx for i in fams[s][k]]
            continue
        n = len(units)
        for k in idx:
            slots = [i for s in stems for i in fams[s][k]]
            pics = [i for fam in img_fams.values() if set(fam) == set(idx) for i in fam[k]]
            units.append(_unit(f'g{n}_{k + 1}', f'{k + 1}', slots, pics, _entity(L, slots, pics, f=f)))
    return {'frame': sorted(set(frame)), 'units': units, 'source': 'named'}


def _geometry(L):
    """repeated elements by geometry: the same box sizes at one fixed offset (columns · rows), or two (a grid of cards)."""
    items = [('t', t) for t in _texts(L) if not _footer(t) and t['i'] != 0] + [('img', im) for im in L['images']]
    items = [kx for kx in items if kx[1].get('x') is not None and kx[1].get('y') is not None]
    sig = lambda kx: (kx[0], kx[1].get('role') or kx[1].get('kind') or '', round((kx[1].get('w') or 0) / 6), round((kx[1].get('h') or 0) / 6))
    pos = lambda kx: (kx[1]['x'], kx[1]['y'])
    by = {}
    for kx in items:
        by.setdefault(sig(kx), []).append(kx)

    def offsets(pool):
        count = {}
        groups = {}
        for kx in pool:
            groups.setdefault(sig(kx), []).append(kx)
        for g in groups.values():
            for a in g:
                for b in g:
                    dx, dy = round((b[1]['x'] - a[1]['x']) / 4) * 4, round((b[1]['y'] - a[1]['y']) / 4) * 4
                    if (dx > 0 or (dx == 0 and dy > 0)) and abs(dx) + abs(dy) >= 24:
                        count[(dx, dy)] = count.get((dx, dy), 0) + 1
        return count

    def chains(d, pool):
        """full chains along d: each item at most once; the nearest unused same-size item at each step."""
        used, out = set(), []
        groups = {}
        for kx in pool:
            groups.setdefault(sig(kx), []).append(kx)
        for kx in sorted(pool, key=lambda kx: (kx[1]['y'], kx[1]['x'])):
            if id(kx) in used:
                continue
            g = groups[sig(kx)]
            if any(abs(o[1]['x'] + d[0] - kx[1]['x']) <= 6 and abs(o[1]['y'] + d[1] - kx[1]['y']) <= 6 and o is not kx for o in g):
                continue   # not a start
            c = [kx]
            while len(c) < 12:
                tx, ty = c[-1][1]['x'] + d[0], c[-1][1]['y'] + d[1]
                cand = [o for o in g if id(o) not in used and o not in c and abs(o[1]['x'] - tx) <= 6 and abs(o[1]['y'] - ty) <= 6]
                if not cand:
                    break
                c.append(min(cand, key=lambda o: abs(o[1]['x'] - tx) + abs(o[1]['y'] - ty)))
            if len(c) >= 2:
                used.update(id(o) for o in c)
                out.append(c)
        return out

    def best_chains(pool, exclude=None):
        best = None
        for d, n in sorted(offsets(pool).items(), key=lambda kv: -kv[1])[:12]:
            if exclude and d[0] * exclude[1] == d[1] * exclude[0]:
                continue
            cs = chains(d, pool)
            lengths = {}
            for c in cs:
                lengths[len(c)] = lengths.get(len(c), 0) + len(c)
            if not lengths:
                continue
            k = max(lengths, key=lambda k: (lengths[k], k))
            full = [c for c in cs if len(c) == k]
            score = sum(len(c) for c in full)
            if len(full) >= 2 and (best is None or score > best[0]):
                best = (score, d, k, full)
        return best

    first = best_chains(items)
    if not first:
        return None
    _, d1, n1, cs = first
    col = {}
    for c in cs:
        for k, kx in enumerate(c):
            col[id(kx)] = (c, k)
    # a grid: the first cards' cells repeat at a second offset (rows of cards)
    starts = [c[0] for c in cs]
    row = {id(s): 0 for s in starts}
    second = best_chains(starts, exclude=d1)
    if second and second[2] >= 2 and second[0] >= max(4, len(starts) // 2):
        for c in second[3]:
            for r, kx in enumerate(c):
                row[id(kx)] = r
    axis = 'col' if abs(d1[0]) >= abs(d1[1]) else 'row'
    cells = {}
    for c in cs:
        r = row[id(c[0])]
        for k, kx in enumerate(c):
            cells.setdefault((r, k), []).append(kx)
    # rows of cards are cards only when each row repeats the whole card (the same sizes) — otherwise the "rows" were two
    # parts of one card (a label over a line) and every column is one element
    rows_n = max(row.values()) + 1
    if rows_n > 1:
        comp = lambda r: sorted(sig(kx) for k in range(n1) for kx in cells.get((r, k), []))
        a, b = comp(0), comp(1)
        same = sum((Counter(a) & Counter(b)).values()) / max(1, max(len(a), len(b)))
        if same < 0.6:
            merged = {}
            for (r, k), kxs in cells.items():
                merged.setdefault((0, k), []).extend(kxs)
            cells, rows_n = merged, 1
    nrows = rows_n
    units = []
    for (r, k), kxs in sorted(cells.items()):
        slots = sorted({x['i'] for t, x in kxs if t == 't'})
        imgs = sorted({x['i'] for t, x in kxs if t == 'img'})
        label = f'{r + 1}-{k + 1}' if nrows > 1 else (f'{k + 1}열' if axis == 'col' else f'{k + 1}행')
        units.append(_unit(f'u{len(units) + 1}', label, slots, imgs, _entity(L, slots, imgs, geometric=True)))
    used = {('t', i) for u in units for i in u['slots']}
    frame = [t['i'] for t in _texts(L) if ('t', t['i']) not in used and not _footer(t) and t['i'] != 0]
    return {'frame': frame, 'units': units, 'source': 'geometry'}


def detect(f: str, lib: dict = None) -> dict:
    lib = lib or library()
    L = lib['layouts'].get(f)
    if not L:
        return {'frame': [], 'units': [], 'source': 'none', 'split': False}
    named = lib['toc_slots'].get(f) or {}
    if f == 'L_VS_NEEDS':
        plan = _needs(L)
    elif CORE.match(f):
        plan = _core(L)
    elif SPACE_P.match(f):
        plan = _space_p(f, L)
    elif named.get('t'):
        plan = _named(f, L, named['t'], named.get('img'))
    else:
        plan = _geometry(L) or {'frame': [t['i'] for t in _texts(L) if not _footer(t) and t['i'] != 0], 'units': [], 'source': 'geometry'}
    known = {t['i'] for t in _texts(L)}
    for u in plan['units']:
        u['slots'] = [i for i in u['slots'] if i in known]
        u['writable'] = [i for i in u['slots'] if _mode(L, 't', i) in WRITABLE]
    plan['frame'] = [i for i in plan['frame'] if i in known]
    plan['split'] = should_split(plan, f)
    return plan


def should_split(plan: dict, f: str = '') -> bool:
    """the user's rule: few cells, or one item → one call; several different items mixed on one sheet → one call per element."""
    live = [u for u in plan['units'] if u.get('writable')]
    if len(live) < 2:
        return False
    if SCN_S.match(f) or plan.get('source') == 'design':
        return True
    if any(u['entity'] != 'topic' for u in live):
        return True
    return sum(len(u['writable']) for u in live) >= SPLIT_CELLS


@lru_cache(maxsize=4096)
def _cached(f: str, stamp: int) -> dict:
    return detect(f)


def plan_for(f: str) -> dict:
    p = library_path()
    try:
        stamp = p.stat().st_mtime_ns
    except FileNotFoundError:
        stamp = 0
    return json.loads(json.dumps(_cached(f, stamp)))
