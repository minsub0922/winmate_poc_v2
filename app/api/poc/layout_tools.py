"""Tools that layout flows call (admin 레이아웃 관리 → 도구). One executor per tool type:

  rag         lexical retrieval (idf-weighted terms · Korean 2-grams) over a collection
              dss        product facts · solution knowledge · case facts (composer library + vertical_space_solution.json)
              scenarios  sheet texts of the sample vertical scenarios (composer library › exemplars)
  search      catalog (names · models · categories) · images (descriptions) · evidence (research DB documents)
  web_search  the market research site searches (market_sources.search — robots-respecting, recent 3 years)
  db_lookup   facts of the items this proposal linked (product_fact · solution_knowledge · case_fact)

A result is [{title, text, ref}] — small, quoted into the model call that asked for it.
"""
from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import math
import re
import threading
from typing import Any, Dict, List, Optional

_LOCK = threading.Lock()
_INDEX: Dict[tuple, Any] = {}
WORD = re.compile(r'[0-9A-Za-z][0-9A-Za-z.+-]*|[가-힣]+')


def terms(text: str) -> List[str]:
    out = []
    for w in WORD.findall(str(text or '').lower()):
        if re.match(r'[가-힣]', w):
            out += [w] if len(w) <= 2 else [w[i:i + 2] for i in range(len(w) - 1)]
        elif len(w) >= 2:
            out.append(w)
    return out


def _clip(v: Any, n: int = 360) -> str:
    return re.sub(r'\s+', ' ', str(v or '')).strip()[:n]


class Index:
    def __init__(self, docs: List[dict]):
        self.groups = [{k: Counter(terms(v)) for k, v in d['_fields'].items()} for d in docs] if docs and '_fields' in docs[0] else None
        self.docs = [{k: v for k, v in d.items() if k != '_fields'} for d in docs] if self.groups else docs
        self.tf = [Counter(terms(d['title'] + ' ' + d['text'])) for d in docs]
        df = Counter(t for c in self.tf for t in c)
        n = max(1, len(docs))
        self.idf = {t: math.log(1 + n / (1 + k)) for t, k in df.items()}

    def search(self, query: str, k: int, weights=None, excluded=()) -> List[dict]:
        q = set(terms(query))
        if not q:
            return []
        scored = []
        for i, (d, c) in enumerate(zip(self.docs, self.tf)):
            if d['ref'] in excluded:
                continue
            hits = q.intersection(c)
            if self.groups and weights:
                counts = self.groups[i]
                s = sum(self.idf[t] * min(c[t], 3) * sum(weights[key] * group[t] for key, group in counts.items()) / c[t] for t in hits)
            else:
                s = sum(self.idf[t] * min(c[t], 3) for t in hits)
            if s > 0:
                scored.append((s / math.sqrt(1 + sum(c.values()) / 40), d))
        scored.sort(key=lambda x: -x[0])
        return [{**d, 'score': round(s, 2)} for s, d in scored[:k]]


def engine():
    """the composer module (product_fact · solution_knowledge · case_fact) and its library, with live layout edits"""
    from .adapters.compose import _auto
    auto = _auto()
    return auto, auto.load()


def _index(name: str, lib: dict, build) -> Index:
    from .layout_snapshot import current
    if current() is not None:
        return Index(build())
    key = (name, id(lib))
    with _LOCK:
        if key not in _INDEX:
            for old in [k for k in _INDEX if k[0] == name]:
                del _INDEX[old]
            _INDEX[key] = Index(build())
        return _INDEX[key]


def _dss_docs(auto, lib) -> List[dict]:
    docs = [{'title': p.get('name') or pid, 'text': _clip(auto.product_fact(pid, full=True), 500), 'ref': 'product:' + pid} for pid, p in (lib.get('products_all') or {}).items()]
    docs += [{'title': s.get('name') or sid, 'text': _clip(auto.solution_knowledge(sid, 12), 700), 'ref': 'solution:' + sid} for sid, s in (lib.get('solutions') or {}).items()]
    docs += [{'title': c.get('cust') or cid, 'text': _clip(auto.case_fact(cid, full=True), 500), 'ref': 'case:' + str(cid)} for cid, c in (lib.get('cases') or {}).items()]
    return docs


def _scenario_docs(lib) -> List[dict]:
    plain = lambda v: re.sub(r'<[^>]+>', ' ', str(v.get('html', '') if isinstance(v, dict) else v))
    out = []
    for key, x in (lib.get('exemplars') or {}).items():
        text = ' / '.join(_clip(plain(v), 120) for k, v in sorted((x.get('t') or {}).items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 999) if _clip(plain(v)))
        if text:
            out.append({'title': f"{x.get('f')} · {_clip(x.get('role'), 40)}", 'text': text[:600], 'ref': 'scenario:' + key})
    return out


def _catalog_docs(lib) -> List[dict]:
    docs = [{'title': p.get('name') or pid, 'text': ' '.join(str(p.get(k) or '') for k in ('model', 'cat', 'spec')), 'ref': 'product:' + pid} for pid, p in (lib.get('products_all') or {}).items()]
    docs += [{'title': s.get('name') or sid, 'text': ' '.join(str(s.get(k) or '') for k in ('cat', 'desc')) + ' ' + ' '.join(s.get('kw') or []), 'ref': 'solution:' + sid}
             for sid, s in (lib.get('solutions') or {}).items()]
    docs += [{'title': c.get('cust') or str(cid), 'text': ' '.join(str(c.get(k) or '') for k in ('title', 'sub', 'ind')), 'ref': 'case:' + str(cid)} for cid, c in (lib.get('cases') or {}).items()]
    return docs


def _image_docs(lib) -> List[dict]:
    docs = []
    industries = {i['code']: i['name'] for i in lib.get('industries') or []}
    for src, im in (lib.get('images') or {}).items():
        title = _clip(im.get('desc') or src, 80)
        names = ' '.join(str(x) for x in [im.get('kind'), *(im.get('names') or [])] if x)
        place = [im.get('ind'), im.get('space'), *(im.get('spaces') or []), *(industries.get(i, i) for i in im.get('inds') or {})]
        subject = [im.get('cust'), im.get('case'), *(im.get('products') or []), *(im.get('solutions') or [])]
        fields = {'caption': title + ' ' + names, 'place': ' '.join(str(v) for v in place if v), 'subject': ' '.join(str(v) for v in subject if v)}
        docs.append({'title': title, 'text': ' '.join((names, fields['place'], fields['subject'])).strip(), 'ref': src, '_fields': fields})
    return docs


def _evidence(query: str, k: int) -> List[dict]:
    from . import market_research, market_store
    cfg = market_research.settings()
    store = market_store.Store(__import__('pathlib').Path(cfg['db']))
    rows = store.docs_search(list(dict.fromkeys(w for w in WORD.findall(query) if len(w) >= 2))[:8], limit=k, need=1) or []
    return [{'title': _clip(r.get('title'), 100), 'text': _clip(r.get('text'), 360), 'ref': r.get('url') or ''} for r in rows]


def _web(query: str, engines: List[str], k: int) -> List[dict]:
    from . import market_sources
    q = _clip(query, 60)
    out, errors = [], []

    def one(e):
        try:
            return market_sources.search(e, q)
        except Exception as exc:  # noqa: BLE001 — a site that fails is skipped (its error is reported)
            errors.append(f'{e}: {type(exc).__name__}')
            return []
    with ThreadPoolExecutor(max_workers=min(6, len(engines) or 1)) as ex:
        for rows in ex.map(one, engines):
            out += rows
    seen, results = set(), []
    for r in out:
        if r.get('url') in seen:
            continue
        seen.add(r.get('url'))
        results.append({'title': _clip(r.get('title'), 100), 'text': _clip(r.get('snippet'), 300) + (f" ({r['published']})" if r.get('published') else ''), 'ref': r.get('url') or ''})
    if not results and errors:
        raise RuntimeError('검색하지 못했습니다 — ' + ', '.join(errors[:4]))
    return results[:k]


def _lookup(auto, lib, ctx: Optional[dict], query: str, k: int) -> List[dict]:
    ids = []
    if ctx:
        ids = [('product', x) for x in ctx.get('products') or []] + [('solution', x) for x in ctx.get('solutions') or []] + [('case', x) for x in ctx.get('cases') or []]
    docs = []
    for kind, x in ids:
        text = auto.product_fact(x, full=True) if kind == 'product' else auto.solution_knowledge(x, 12) if kind == 'solution' else auto.case_fact(x, full=True)
        table = {'product': 'products_all', 'solution': 'solutions', 'case': 'cases'}[kind]
        name = ((lib.get(table) or {}).get(x) or {}).get('name') or ((lib.get(table) or {}).get(x) or {}).get('cust') or x
        docs.append({'title': name, 'text': _clip(text, 600), 'ref': f'{kind}:{x}'})
    if not ctx:   # no proposal (시험 실행): the catalog is the table
        return _index('dss', lib, lambda: _dss_docs(auto, lib)).search(query, k)
    if query and len(docs) > k:
        return Index(docs).search(query, k) or docs[:k]
    return docs[:k]


def run(tool: dict, query: str, ctx: Optional[dict] = None) -> dict:
    """one call → {tool, query, results, error?}"""
    typ, cfg = tool['type'], tool.get('config') or {}
    k = int(cfg.get('top_k') or cfg.get('limit') or 5)
    query = _clip(query, 200)
    try:
        if typ == 'web_search':
            results = _web(query, cfg.get('engines') or [], k)
        elif typ == 'search' and cfg.get('collection') == 'evidence':
            results = _evidence(query, k)
        else:
            auto, lib = engine()
            if typ == 'db_lookup':
                results = _lookup(auto, lib, ctx, query, k)
            elif cfg.get('collection') == 'dss':
                results = _index('dss', lib, lambda: _dss_docs(auto, lib)).search(query, k)
            elif cfg.get('collection') == 'scenarios':
                results = _index('scenarios', lib, lambda: _scenario_docs(lib)).search(query, k)
            elif cfg.get('collection') == 'catalog':
                results = _index('catalog', lib, lambda: _catalog_docs(lib)).search(query, k)
            elif cfg.get('collection') == 'images':
                from ..layout_flows import image_weights
                from ..resource_switches import image_refs
                weights = (ctx or {}).get('image_weights') or image_weights()
                excluded = ctx['off_pictures'] if ctx and 'off_pictures' in ctx else image_refs()[1]
                results = _index('images', lib, lambda: _image_docs(lib)).search(query, k, weights, excluded)
            else:
                raise ValueError(f"알 수 없는 도구 설정입니다: {typ} · {cfg.get('collection')}")
        return {'tool': tool['key'], 'query': query, 'results': results}
    except Exception as exc:  # noqa: BLE001 — a tool failure is reported to the step, never fatal to the composition
        if type(exc).__name__ == 'JobCancelled':
            raise
        return {'tool': tool['key'], 'query': query, 'results': [], 'error': _clip(f'{type(exc).__name__}: {exc}', 200)}


def render(call: dict, n: int = 900) -> str:
    """a call as the model reads it"""
    if call.get('error'):
        return f"{call['tool']}(“{call['query']}”) → 실패: {call['error']}"
    rows = [f"{i + 1}) {r['title']} — {r['text']}" + (f" [{r['ref']}]" if r.get('ref') else '') for i, r in enumerate(call['results'])]
    return (f"{call['tool']}(“{call['query']}”) → " + (' / '.join(rows) or '결과 없음'))[:n]


def fill_query(template: str, values: Dict[str, str]) -> str:
    return re.sub(r'\{(\w+)\}', lambda m: str(values.get(m.group(1)) or ''), template or '').strip()
