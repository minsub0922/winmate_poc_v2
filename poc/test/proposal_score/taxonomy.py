"""평가 기준 계층화 — GraphRAG 의 커뮤니티 요약(community summaries)을 평가 기준에 적용.

1. 그래프: 기준(54) ─ 개념(concepts) 이분 그래프를 기준끼리의 가중 그래프로 투영한다.
   w(i, j) = 공유 개념 수 + 1.2 · 설명/점수 기준 글의 TF-IDF 코사인 + 0.35 · 같은 앱 분류 + 0.25 · 볼 장(scope) 겹침
2. 커뮤니티: 결정론 Louvain(가중 모듈러리티, 해상도 γ)을 두 번 — 기준 → 세부 커뮤니티(L2), 세부 커뮤니티를 한 점으로 묶은
   그래프 → 상위 커뮤니티(L1), 그 위에 루트(L0). 앱의 7개 분류와 달리 '같은 증거 · 같은 판단'끼리 묶인다
   (예: 매장 수 · 수량 · 단위 · 수치 일관성이 분류를 넘어 한 커뮤니티).
3. 압축(community compression): 세부 커뮤니티마다 이름 · 무엇을 보는지 · 어떤 제안서에서 중요해지는지를 LLM 이 요약하고,
   상위 커뮤니티는 아래 요약들만 받아 다시 압축한다(원래 기준 글은 넣지 않음). 라우터는 이 요약만 보고 위에서부터 고른다.
"""
from __future__ import annotations

import json
import math
import random
import re
import time
from collections import Counter, defaultdict
from typing import Dict, List, Optional, Tuple

from . import config
from .criteria import CriteriaSet, load_criteria
from .llm import Backend, BackendError, S, STR

W_CONCEPT, W_TEXT, W_CAT, W_SCOPE = 1.0, 1.2, 0.35, 0.25
EDGE_MIN, KNN = 0.30, 3


# ---------------------------------------------------------------- graph
def _tokens(s: str) -> List[str]:
    s = re.sub(r'[^0-9A-Za-z가-힣 ]', ' ', s)
    out = []
    for w in s.split():
        if re.match(r'^[A-Za-z0-9]+$', w):
            if len(w) >= 2:
                out.append(w.lower())
        else:
            out += [w[i:i + 2] for i in range(len(w) - 1)] if len(w) >= 2 else []
    return out


def _tfidf(docs: List[List[str]]) -> List[Dict[str, float]]:
    df = Counter(t for d in docs for t in set(d))
    n = len(docs)
    vecs = []
    for d in docs:
        tf = Counter(d)
        v = {t: (c / len(d)) * math.log((1 + n) / (1 + df[t]) + 1) for t, c in tf.items()} if d else {}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({t: x / norm for t, x in v.items()})
    return vecs


def _cos(a: Dict[str, float], b: Dict[str, float]) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(x * b.get(t, 0.0) for t, x in a.items())


def build_graph(cs: CriteriaSet) -> Tuple[List[str], Dict[str, Dict[str, float]], Dict[str, Dict[str, dict]]]:
    ids = cs.ids()
    texts = [_tokens(' '.join([c.name, c.desc, c.check, c.r1, c.r2, c.r3])) for c in cs.items]
    vec = _tfidf(texts)
    full: Dict[str, Dict[str, float]] = {i: {} for i in ids}
    parts: Dict[str, Dict[str, dict]] = {i: {} for i in ids}
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            ca, cb = cs.items[a], cs.items[b]
            shared = sorted(set(ca.concepts) & set(cb.concepts))
            sa, sb = set(ca.scope) - {'all'}, set(cb.scope) - {'all'}
            scope = len(sa & sb) / len(sa | sb) if sa and sb else 0.0
            p = {'concepts': shared, 'text': round(_cos(vec[a], vec[b]), 3), 'cat': ca.cat == cb.cat, 'scope': round(scope, 3)}
            w = W_CONCEPT * len(shared) + W_TEXT * p['text'] + W_CAT * p['cat'] + W_SCOPE * scope
            full[ids[a]][ids[b]] = full[ids[b]][ids[a]] = w
            parts[ids[a]][ids[b]] = parts[ids[b]][ids[a]] = {**p, 'w': round(w, 3)}
    # sparsify: keep edges ≥ EDGE_MIN, and each node's top-KNN edges
    adj: Dict[str, Dict[str, float]] = {i: {} for i in ids}
    for i in ids:
        top = sorted(full[i].items(), key=lambda kv: (-kv[1], kv[0]))[:KNN]
        for j, w in list(full[i].items()):
            if w >= EDGE_MIN or (j, w) in top:
                adj[i][j] = adj[j][i] = round(w, 4)
    return ids, adj, parts


# ---------------------------------------------------------------- Louvain (deterministic)
def modularity(adj: Dict[str, Dict[str, float]], part: Dict[str, str], gamma: float = 1.0) -> float:
    m2 = sum(sum(n.values()) for n in adj.values())
    if not m2:
        return 0.0
    deg = {i: sum(n.values()) for i, n in adj.items()}
    inside, tot = defaultdict(float), defaultdict(float)
    for i, nb in adj.items():
        tot[part[i]] += deg[i]
        for j, w in nb.items():
            if part[i] == part[j]:
                inside[part[i]] += w
    return sum(inside[c] / m2 - gamma * (tot[c] / m2) ** 2 for c in tot)


def _one_level(adj: Dict[str, Dict[str, float]], gamma: float, rng: random.Random) -> Dict[str, str]:
    nodes = sorted(adj)
    m2 = sum(sum(n.values()) for n in adj.values()) or 1.0
    deg = {i: sum(adj[i].values()) for i in nodes}
    com = {i: i for i in nodes}
    tot = {i: deg[i] for i in nodes}
    improved = True
    while improved:
        improved = False
        order = nodes[:]
        rng.shuffle(order)
        for i in order:
            ci = com[i]
            links = defaultdict(float)
            for j, w in adj[i].items():
                if j != i:
                    links[com[j]] += w
            tot[ci] -= deg[i]
            best, best_gain = ci, links.get(ci, 0.0) - gamma * tot[ci] * deg[i] / m2
            for c in sorted(links):
                gain = links[c] - gamma * tot[c] * deg[i] / m2
                if gain > best_gain + 1e-12:
                    best, best_gain = c, gain
            tot[best] += deg[i]
            if best != ci:
                com[i] = best
                improved = True
    return com


def louvain(adj: Dict[str, Dict[str, float]], gamma: float = 1.0, seed: int = 7) -> Dict[str, str]:
    """가중 Louvain — 국소 이동 + 압축을 더 나아지지 않을 때까지. 반환: 노드 → 커뮤니티 대표 노드."""
    rng = random.Random(seed)
    member = {i: [i] for i in adj}
    cur = adj
    while True:
        com = _one_level(cur, gamma, rng)
        if len(set(com.values())) == len(cur):
            break
        groups = defaultdict(list)
        for n, c in com.items():
            groups[c].append(n)
        new_member, nxt = {}, defaultdict(lambda: defaultdict(float))
        rep = {c: sorted(sum((member[n] for n in ns), []))[0] for c, ns in groups.items()}
        for c, ns in groups.items():
            new_member[rep[c]] = sorted(sum((member[n] for n in ns), []))
        for i, nb in cur.items():
            for j, w in nb.items():
                a, b = rep[com[i]], rep[com[j]]
                nxt[a][b] += w
        member = new_member
        cur = {a: dict(nb) for a, nb in nxt.items()}
        for a in member:
            cur.setdefault(a, {})
    out = {}
    for c, ns in member.items():
        for n in ns:
            out[n] = c
    return out


def _groups(part: Dict[str, str], order: List[str]) -> List[List[str]]:
    g = defaultdict(list)
    for n in order:
        g[part[n]].append(n)
    return sorted(g.values(), key=lambda ns: order.index(ns[0]))


def pick_partition(adj, order, lo: int, hi: int, max_size: int, seed: int = 7) -> Tuple[float, List[List[str]]]:
    """해상도 γ 를 격자에서 골라 커뮤니티 수가 [lo, hi], 가장 큰 커뮤니티가 max_size 이하가 되게(모듈러리티 최대)."""
    best = None
    for g10 in range(4, 41):
        gamma = g10 / 10
        part = louvain(adj, gamma, seed)
        groups = _groups(part, order)
        ok = lo <= len(groups) <= hi and max(len(x) for x in groups) <= max_size and min(len(x) for x in groups) >= 2
        q = modularity(adj, part, 1.0)
        key = (ok, q)
        if best is None or key > best[0]:
            best = (key, gamma, groups)
    return best[1], best[2]


# ---------------------------------------------------------------- summaries (compression)
SUM_SCHEMA = S('OBJECT', properties={
    'name': STR, 'summary': STR, 'when_relevant': STR, 'evidence': STR, 'keywords': S('ARRAY', items=STR),
}, required=['name', 'summary', 'when_relevant', 'evidence', 'keywords'])

SYS_SUM = """당신은 삼성 B2B 제안서 심사 기준을 정리하는 편집자입니다. 평가 기준 묶음(커뮤니티)을 받아, 나중에 '이 제안서에서 이 묶음을 볼지'를 고르는 라우터가 읽을 압축 요약을 씁니다.
- name: 묶음이 판단하는 것을 12자 안팎의 한국어 명사구로 (예: '숫자 · 규모 정합성')
- summary: 이 묶음이 무엇을 보는지 2문장. 구성 기준의 공통 판단을 일반화하고, 기준 이름을 나열하지 말 것
- when_relevant: 어떤 제안서 · 상황(요구 유형, 청중, 장 구성, 위험 신호)에서 이 묶음이 특히 중요해지는지 1~2문장
- evidence: 판단에 필요한 증거(어떤 장 · 어떤 자동 점검 결과) 1문장
- keywords: 라우팅에 쓸 핵심어 4~8개
주어진 내용에 없는 기준을 지어내지 말고, 평가 기준의 점수를 매기지 마세요."""


def _template_summary(c: dict, cs: CriteriaSet, children: Optional[List[dict]] = None) -> dict:
    crit = [cs[i] for i in c['criteria']]
    conc = Counter(k for x in crit for k in x.concepts).most_common(4)
    if children:
        return {'name': ' · '.join(ch['name'] for ch in children[:2]) + (' 외' if len(children) > 2 else ''),
                'summary': ' / '.join(ch['summary'] for ch in children)[:400], 'when_relevant': ' / '.join(ch['when_relevant'] for ch in children)[:300],
                'evidence': ' / '.join(ch['evidence'] for ch in children)[:300], 'keywords': [k for k, _ in conc]}
    return {'name': ' · '.join(k for k, _ in conc[:2]), 'summary': ' / '.join(f'{x.name}: {x.desc}' for x in crit)[:400],
            'when_relevant': '구성 기준: ' + ', '.join(x.name for x in crit), 'evidence': ', '.join(sorted({s for x in crit for s in x.scope})),
            'keywords': [k for k, _ in conc]}


def summarize(c: dict, cs: CriteriaSet, backend: Optional[Backend], children: Optional[List[dict]] = None) -> Tuple[dict, str]:
    if backend is None or not backend.online:
        return _template_summary(c, cs, children), 'template'
    if children:
        body = '아래는 하위 묶음들의 압축 요약입니다. 이들을 한 단계 위 묶음으로 다시 압축하세요(하위 이름을 나열하지 말고 공통 판단으로).\n\n' + '\n\n'.join(
            f"[{ch['id']}] {ch['name']}\n- 무엇: {ch['summary']}\n- 언제 중요: {ch['when_relevant']}\n- 증거: {ch['evidence']}" for ch in children)
    else:
        body = '아래 평가 기준들을 한 묶음으로 요약하세요.\n\n' + '\n\n'.join(
            f"[{x.id}] {x.name} (앱 분류 {cs.cat_by_id[x.cat]['name']}, 가중치 {x.w})\n- 설명: {x.desc}\n- 점검: {x.check}\n- 3점 기준: {x.r3}\n- 개념: {', '.join(x.concepts)}"
            for x in (cs[i] for i in c['criteria']))
    try:
        d = backend.complete('summary', SYS_SUM, body, SUM_SCHEMA, meta={'tag': c['id']})
        out = {k: d.get(k) for k in ('name', 'summary', 'when_relevant', 'evidence', 'keywords')}
        if not out['name'] or not out['summary']:
            raise BackendError('빈 요약')
        out['keywords'] = [str(k) for k in (out['keywords'] or [])][:8]
        return out, getattr(backend, 'model', backend.name)
    except BackendError:
        return _template_summary(c, cs, children), 'template'


def build_taxonomy(cs: Optional[CriteriaSet] = None, backend: Optional[Backend] = None, seed: int = 7) -> dict:
    cs = cs or load_criteria()
    ids, adj, parts = build_graph(cs)
    g_fine, fine = pick_partition(adj, ids, 10, 16, 7, seed)
    fine_part = {n: f'F{k + 1:02d}' for k, ns in enumerate(fine) for n in ns}
    # 세부 커뮤니티를 한 점으로 묶은 그래프
    cadj: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for i, nb in adj.items():
        for j, w in nb.items():
            a, b = fine_part[i], fine_part[j]
            if a != b:
                cadj[a][b] += w
    corder = [f'F{k + 1:02d}' for k in range(len(fine))]
    cadj = {a: dict(cadj.get(a, {})) for a in corder}
    g_coarse, coarse = pick_partition(cadj, corder, 4, 7, 5, seed)
    fine_list = []
    for k, ns in enumerate(fine):
        fine_list.append({'id': f'F{k + 1:02d}', 'criteria': ns})
    coarse_list = []
    for k, fs in enumerate(coarse):
        cid = f'C{k + 1}'
        for f in fs:
            next(x for x in fine_list if x['id'] == f)['parent'] = cid
        coarse_list.append({'id': cid, 'children': fs, 'criteria': [c for f in fs for c in next(x for x in fine_list if x['id'] == f)['criteria']]})
    # 압축 요약: 아래(L2)부터 위(L1) → 루트
    by = 'template'
    for f in fine_list:
        s, by_ = summarize(f, cs, backend)
        f.update(s)
        by = by_ if by_ != 'template' else by
    for c in coarse_list:
        kids = [x for x in fine_list if x['id'] in c['children']]
        s, _ = summarize(c, cs, backend, kids)
        c.update(s)
    root = {'id': 'R', 'children': [c['id'] for c in coarse_list], 'criteria': ids}
    s, _ = summarize(root, cs, backend, coarse_list)
    root.update(s)
    fp = {n: f['id'] for f in fine_list for n in f['criteria']}
    cp = {n: c['id'] for c in coarse_list for n in c['criteria']}
    edges = sorted({(min(a, b), max(a, b), w) for a, nb in adj.items() for b, w in nb.items()})
    concepts = defaultdict(list)
    for c in cs.items:
        for k in c.concepts:
            concepts[k].append(c.id)
    cat_mix = {f['id']: dict(Counter(cs[i].cat for i in f['criteria'])) for f in fine_list}
    return {
        'version': 1, 'built_at': time.strftime('%Y-%m-%d %H:%M:%S'), 'summarized_by': by, 'seed': seed,
        'params': {'weights': {'concept': W_CONCEPT, 'text': W_TEXT, 'cat': W_CAT, 'scope': W_SCOPE}, 'edge_min': EDGE_MIN, 'knn': KNN,
                   'gamma_fine': g_fine, 'gamma_coarse': g_coarse},
        'stats': {'criteria': len(ids), 'edges': len(edges), 'concepts': len(concepts), 'fine': len(fine_list), 'coarse': len(coarse_list),
                  'modularity_fine': round(modularity(adj, fp), 4), 'modularity_coarse': round(modularity(adj, cp), 4),
                  'mixed_app_categories': sum(1 for m in cat_mix.values() if len(m) > 1)},
        'root': root, 'coarse': coarse_list, 'fine': fine_list, 'fine_app_categories': cat_mix,
        'graph': {'edges': [[a, b, round(w, 3)] for a, b, w in edges], 'concepts': dict(concepts)},
    }


def load_taxonomy(path=config.TAXONOMY_PATH) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def save_taxonomy(t: dict, path=config.TAXONOMY_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(t, ensure_ascii=False, indent=1), encoding='utf-8')
