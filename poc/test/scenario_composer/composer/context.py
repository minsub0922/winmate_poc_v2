"""Customer input → the facts every stage may use, and the words no stage may leave on a slide.

Input (same fields the app's proposal has — see ``from_app_proposal``)::

    {id, title, customer, ind, free_text, keymen: [{name, weight, reqs: [str]}], note, files: [{name, text}],
     products: [id], solutions: [id], cases: [id], date?}
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Iterable, List, Set

from .library import load

NUM = re.compile(r'\d[\d,.]*')


def _s(x: Any) -> str:
    return re.sub(r'\s+', ' ', str(x or '')).strip()


def normalize(raw: dict) -> dict:
    inp = {
        'id': str(raw.get('id') or ''), 'title': _s(raw.get('title') or raw.get('project')), 'customer': _s(raw.get('customer')),
        'ind': raw.get('ind') or raw.get('industry') or None, 'free_text': str(raw.get('free_text') or raw.get('free') or '').strip(),
        'note': str(raw.get('note') or '').strip(), 'target': _s(raw.get('target')),
        'keymen': [{'name': _s(k.get('name')) or '담당자', 'weight': int(k.get('weight') or 0), 'reqs': [_s(r) for r in (k.get('reqs') or []) if _s(r)]}
                   for k in (raw.get('keymen') or []) if isinstance(k, dict)],
        'files': [{'name': _s(f.get('name')), 'text': str(f.get('text') or '')[:40000]} for f in (raw.get('files') or []) if isinstance(f, dict)],
        'products': [str(x) for x in (raw.get('products') or [])], 'solutions': [str(x) for x in (raw.get('solutions') or [])],
        'cases': [str(x) for x in (raw.get('cases') or [])], 'date': raw.get('date') or date.today().strftime('%Y. %m. %d'),
        'parts': raw.get('parts') or None,
    }
    lib = load()
    inp['products'] = [p for p in inp['products'] if p in lib['products']]
    inp['solutions'] = [s for s in inp['solutions'] if s in lib['solutions']]
    inp['cases'] = [c for c in inp['cases'] if c in lib['cases']]
    return inp


def requirement_text(inp: dict, limit: int = 6000) -> str:
    rows = []
    if inp.get('title'):
        rows.append(f'프로젝트: {inp["title"]}')
    if inp.get('customer'):
        rows.append(f'고객사: {inp["customer"]}')
    if inp.get('target'):
        rows.append(f'제안 대상: {inp["target"]}')
    if inp.get('free_text'):
        rows.append('상황: ' + inp['free_text'])
    for k in inp.get('keymen') or []:
        if k['reqs']:
            rows.append(f'키맨 {k["name"]}({k["weight"]}%): ' + ' / '.join(k['reqs']))
    if inp.get('note'):
        rows.append('제작자 메모(내부용, 화면에 그대로 쓰지 않음): ' + inp['note'])
    for f in inp.get('files') or []:
        rows.append(f'첨부 {f["name"]}: ' + f['text'][:2500])
    return '\n'.join(rows)[:limit]


def catalog_text(inp: dict) -> str:
    lib = load()
    P, S, C = lib['products'], lib['solutions'], lib['cases']
    rows = []
    for pid in inp['products']:
        p = P[pid]
        rows.append(f'- 제품 {pid}: {p["name"]} ({p.get("model") or ""}) · {p.get("cat") or ""} · {p.get("spec") or ""}')
    for sid in inp['solutions']:
        s = S[sid]
        rows.append(f'- 솔루션 {sid}: {s["name"]} — {s.get("desc") or ""}')
    for cid in inp['cases']:
        c = C[cid]
        proof = '; '.join((c.get('proof') or [])[:3])
        rows.append(f'- 사례 {cid}: {c["cust"]} — {c.get("sub") or c.get("title") or ""}' + (f' · 성과: {proof}' if proof else ''))
    return '\n'.join(rows) or '(없음)'


def allowed_numbers(inp: dict) -> Set[str]:
    """numbers the customer gave or the catalog states (specs · case proofs) — any other number on a slide is invented."""
    lib = load()
    corpus = [requirement_text(inp, 100000), inp.get('date') or '']
    for pid in inp['products']:
        p = lib['products'][pid]
        corpus += [p.get('name') or '', p.get('model') or '', p.get('spec') or '', p.get('opt') or '']
    for cid in inp['cases']:
        c = lib['cases'][cid]
        corpus += [c.get('cust') or '', c.get('title') or '', c.get('sub') or '', c.get('scale') or ''] + list(c.get('proof') or [])
    for sid in inp['solutions']:
        s = lib['solutions'][sid]
        corpus += [s.get('name') or '', s.get('desc') or '']
    out: Set[str] = set()
    for t in corpus:
        for m in NUM.findall(str(t)):
            out.add(m.replace(',', '').rstrip('.'))
    return out


def forbidden_names(inp: dict, extra: Iterable[str] = ()) -> List[str]:
    """customer names of every library scenario and of unselected catalog cases — they must not reach this deck."""
    lib = load()
    mine = {inp.get('customer') or ''}
    sel_cases = {lib['cases'][c]['cust'] for c in inp['cases']}
    names: Set[str] = set()
    for sc in lib['scenarios']:
        if sc.get('group') == 'std':  # 표준 제안서 'customers' are generic industry words ("스마트 호텔")
            continue
        cu = (sc.get('customer') or '').strip()
        if cu and cu not in mine and len(cu) >= 2:
            names.add(cu)
    for c in lib['cases'].values():
        cu = re.sub(r'\s+', ' ', str(c.get('cust') or '')).strip()
        if cu and cu not in sel_cases and len(cu) >= 3 and not cu.startswith('['):
            names.add(cu)
    names.update(x for x in extra if x)
    # a forbidden name that is part of the customer's own name / project words is fine ("A 커피" vs customer "A 커피")
    own = ' '.join([inp.get('customer') or '', inp.get('title') or ''])
    return sorted((n for n in names if n not in own), key=len, reverse=True)


def from_app_proposal(p: dict) -> dict:
    """the app's proposal object (storyboardPayload / proposalInput shape) → composer input."""
    if 'req' in p:  # storyboardPayload
        f = (p.get('req') or {}).get('form') or {}
        seg = lambda v: ''.join(x.get('t', '') if isinstance(x, dict) else str(x) for x in v) if isinstance(v, list) else str(v or '')
        return normalize({
            'id': p.get('id'), 'title': p.get('title') or f.get('project'), 'customer': p.get('customer') or f.get('customer'),
            'ind': p.get('ind'), 'free_text': seg((p.get('req') or {}).get('free')), 'note': f.get('note'), 'target': f.get('target'),
            'keymen': [{'name': k.get('name'), 'weight': k.get('weight'), 'reqs': [seg(r) for r in (k.get('reqs') or [])]} for k in f.get('keymen') or []],
            'files': (p.get('req') or {}).get('files') or [], **{k: (p.get('ctx') or {}).get(k) or [] for k in ('products', 'solutions', 'cases')},
        })
    return normalize(p)
