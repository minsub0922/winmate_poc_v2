"""제안서 한 건 평가: 프로필 · 적용 조건 → 자동 점검 → 라우팅(기준 고르기) → 채점(1~3) → 집계."""
from __future__ import annotations

import copy
import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from . import config
from .checks import auto_checks, profile
from .criteria import CriteriaSet, applicable, load_criteria
from .llm import Backend
from .proposal import Proposal, load_catalog
from .router import route
from .scorer import Score, score_selected
from .taxonomy import load_taxonomy


def band(s: Optional[float]) -> str:
    if s is None:
        return '제외'
    return '우수' if s >= 85 else '양호' if s >= 70 else '보완' if s >= 50 else '미흡'


def verdict(s: Optional[float]) -> str:
    if s is None:
        return '평가 불가'
    return '제출 가능' if s >= 85 else '소폭 보완 후 제출' if s >= 70 else '보완 필요' if s >= 50 else '재작성 권장'


def aggregate(cs: CriteriaSet, tax: dict, scores: List[Score], gates: Dict[str, tuple], selected: List[str]) -> dict:
    """1~3점 → 0 · 50 · 100 으로 바꿔 앱 분류(가중치 w)별 · 전체(분류 가중치)로 묶는다. 고른 기준만으로 낸 점수다."""
    sc = {s.id: s.score for s in scores if s.score in (1, 2, 3)}
    pts = {i: (v - 1) * 50 for i, v in sc.items()}
    cats = {}
    for cat in cs.cats:
        ids = [i for i in pts if cs[i].cat == cat['id']]
        if ids:
            cats[cat['id']] = round(sum(cs[i].w * pts[i] for i in ids) / sum(cs[i].w for i in ids), 1)
    total = round(sum(cs.cat_by_id[c]['w'] * v for c, v in cats.items()) / sum(cs.cat_by_id[c]['w'] for c in cats), 1) if cats else None
    rub = round(sum(cs[i].w * v for i, v in sc.items()) / sum(cs[i].w for i in sc), 3) if sc else None
    comm = {}
    for level in ('fine', 'coarse'):
        for c in tax[level]:
            ids = [i for i in c['criteria'] if i in sc]
            if ids:
                comm[c['id']] = round(sum(sc[i] for i in ids) / len(ids), 2)
    app_ok = [i for i, (a, _) in gates.items() if a]
    w_app = sum(cs[i].w for i in app_ok)
    return {
        'total': total, 'band': band(total), 'verdict': verdict(total), 'rubric_mean': rub, 'categories': cats, 'communities': comm,
        'n_all': len(cs.items), 'n_applicable': len(app_ok), 'n_selected': len(selected), 'n_scored': len(sc),
        'weight_coverage': round(sum(cs[i].w for i in selected) / w_app, 3) if w_app else None,
        'dist': {str(k): sum(1 for v in sc.values() if v == k) for k in (1, 2, 3)},
        'low': sorted([i for i, v in sc.items() if v == 1], key=lambda i: -cs[i].w),
    }


@dataclass
class Context:
    backend: Optional[Backend]
    cs: CriteriaSet = field(default_factory=load_criteria)
    tax: dict = field(default_factory=load_taxonomy)
    catalog: dict = field(default_factory=load_catalog)
    others: List[str] = field(default_factory=list)
    budget: int = 12
    min_k: int = 10
    temperature: Optional[float] = None


def evaluate(p: Proposal, ctx: Context, force: Optional[List[str]] = None) -> dict:
    """force 를 주면 라우팅을 건너뛰고 그 기준만 채점(교란 실험의 '채점기 단독' 확인용)."""
    t0 = time.time()
    x = profile(p, ctx.catalog)
    gates = applicable(ctx.cs, x)
    F = auto_checks(p, ctx.catalog, ctx.others)
    if force:
        from .router import Route
        r = Route([i for i in ctx.cs.ids() if i in force], gates, mode='forced')
    else:
        r = route(p, ctx.cs, ctx.tax, gates, F, ctx.backend, ctx.budget, ctx.min_k, ctx.temperature)
    scores = score_selected(p, ctx.cs, ctx.tax, r.selected, F, ctx.backend, ctx.temperature)
    agg = aggregate(ctx.cs, ctx.tax, scores, gates, r.selected)
    g = [s.grounded for s in scores if s.grounded is not None]
    # 이 평가가 부른 LLM 호출 수: 라우팅 2(L1 · L2) + 채점한 세부 커뮤니티 수 (병렬 실행에서도 정확하게)
    n_calls = ({'llm': 2, 'rules-fallback': 1}.get(r.mode, 0)) + len({s.community for s in scores if s.mode in ('llm', 'rules-fallback') and s.error != 'missing'} | {s.community for s in scores if s.mode == 'llm'})
    tag = p.id + p.variant
    mine = [c for c in (ctx.backend.calls if ctx.backend else []) if c.tag == tag or c.tag.startswith(tag + ':')]
    tok = {'prompt': sum(c.prompt_tokens for c in mine), 'output': sum(c.output_tokens for c in mine)}
    return {
        'id': p.id, 'variant': p.variant, 'title': p.title, 'customer': p.customer, 'n_sheets': p.n,
        'req': p.meta.get('req_label'), 'strategy': p.meta.get('strategy_label'), 'ind': p.meta.get('ind_name'),
        'route': r.to_dict(), 'scores': [s.to_dict() for s in scores], 'aggregate': agg,
        'rule_pass': r.rule_pass, 'risk': r.risk,
        'grounded_mean': round(sum(g) / len(g), 3) if g else None, 'fallbacks': sum(1 for s in scores if s.mode != 'llm' and s.mode != 'rules'),
        'auto_checks': F, 'profile': {k: v for k, v in x.items() if k not in ('req_list',)},
        'calls': n_calls, 'tokens': tok, 'seconds': round(time.time() - t0, 1),
    }


# ---------------------------------------------------------------- 교란(perturbation) — 점수가 떨어져야 하는 제안서
def _clone(p: Proposal, name: str) -> Proposal:
    q = copy.deepcopy(p)
    q.variant = '~' + name
    q.app_rules, q.app_profile = None, (copy.deepcopy(p.app_profile) if p.app_profile else None)
    return q


def _short(p: Proposal) -> str:
    s = re.sub(r'\s*(프랜차이즈|주식회사|\(주\)|㈜)\s*$', '', p.customer or '').strip()
    return s if len(s) > 2 else (p.customer or s)


def baseline(p: Proposal) -> Proposal:
    """교란 비교용 원본 — 교란본과 같은 조건이 되게 앱 규칙 메모(app_rules)만 뺀 사본."""
    return _clone(p, 'base')


def wrong_customer(p: Proposal, other: str) -> Proposal:
    """본문 장 셋 중 하나꼴로 고객사명을 다른 고객사명으로 — 이전 제안서를 복사해 고친 듯한 상태."""
    q = _clone(p, 'wrong_customer')
    short = _short(p)
    for s in q.sheets[2::3]:
        for t in s.texts:
            if t.get('text') and short in t['text']:
                t['text'] = t['text'].replace(short, other)
    return q


def placeholders(p: Proposal) -> Proposal:
    """핵심 수치 · 부제 칸에 템플릿 자리표시를 남긴 상태 — 채우다 만 제안서."""
    q = _clone(p, 'placeholders')
    hit = 0
    for s in q.sheets[1:]:
        if hit >= 4:
            break
        nums = [t for t in s.body_texts if re.search(r'\d', t['text']) and len(t['text']) <= 24 and t.get('max_px', 0) >= 18]
        if nums:
            for t in nums[:2]:
                t['text'] = re.sub(r'\d[\d,.]*', '[00]', t['text'])
            hit += 1
    for s in q.sheets[2:4]:
        sub = [t for t in s.body_texts if 30 <= t.get('y', 0) <= 140 and t.get('max_px', 0) < 20 and len(t['text']) > 12]
        if sub:
            sub[0]['text'] = '부제를 입력하세요 — 이 장의 핵심 내용을 한 줄로 요약합니다'
    return q


def no_proof(p: Proposal) -> Proposal:
    """도입 사례 · Why Samsung 장을 뺀 상태 — 증명 없이 주장만 남은 제안서."""
    q = _clone(p, 'no_proof')
    keep = [s for s in q.sheets if s.part not in ('case', 'why')]
    for k, s in enumerate(keep):
        s.n = k + 1
    q.sheets = keep
    return q


def number_conflict(p: Proposal) -> Proposal:
    """여러 장에 나오는 같은 수치(매장 · 세대 · 사업장 수 등, 없으면 '하루 14시간' 같은 수치)를 뒤쪽 장에서 80% 값으로 —
    한두 장만 고치지 않은 제안서. 첫 등장은 그대로 두고, 등장한 장의 절반(최대 2장)만 바꾼다."""
    from .checks import SCALE, CTX_NUM
    q = _clone(p, 'number_conflict')

    def occ(rx, grp):
        out = {}
        for s in q.sheets:
            for t in s.texts:
                for m in rx.finditer(t.get('text') or ''):
                    v = m.group(grp).replace(',', '')
                    if v.isdigit() and int(v) >= 10 and re.sub(r'\s', '', m.group(grp + 1)) not in ('명', '실'):
                        tok = m.group(0)[m.start(grp) - m.start():]
                        out.setdefault(tok, set()).add(s.n)
        return {k: v for k, v in out.items() if len(v) >= 2}

    cand = occ(SCALE, 1) or occ(CTX_NUM, 2)
    if not cand:
        return q
    target = max(cand, key=lambda k: (len(cand[k]), k))
    num = re.match(r'\d[\d,]*', target).group(0)
    v = int(num.replace(',', ''))
    new = target.replace(num, f'{int(round(v * 0.8)):,}' if v >= 1000 else str(int(round(v * 0.8))), 1)
    pages = sorted(cand[target])
    change = pages[1:][-min(2, len(pages) // 2):]
    for s in q.sheets:
        if s.n in change:
            for t in s.texts:
                if t.get('text') and target in t['text']:
                    t['text'] = t['text'].replace(target, new)
    q.meta = {**q.meta, '_conflict': f"{target} → {new} ({', '.join(map(str, change))}장 · 그대로 {', '.join(str(n) for n in pages if n not in change)}장)"}
    return q


def strip_images(p: Proposal) -> Proposal:
    """본문 장의 사진을 모두 비운 상태 — 빈 이미지 칸이 남은 글 위주 제안서."""
    q = _clone(p, 'strip_images')
    for s in q.sheets[1:]:
        for i in s.images:
            i['filled'] = False
        s.free_pictures, s.bg = 0, False
    return q


PERTURB = {
    'wrong_customer': {'fn': 'wrong_customer', 'targets': ['CU1', 'WR1'], 'what': '본문 1/3 장의 고객사명을 다른 고객사명으로'},
    'placeholders': {'fn': 'placeholders', 'targets': ['WR1'], 'what': '핵심 수치 · 부제 칸에 [00] · "부제를 입력하세요"'},
    'no_proof': {'fn': 'no_proof', 'targets': ['VS5', 'VS4'], 'what': '도입 사례 · Why Samsung 장 제거'},
    'number_conflict': {'fn': 'number_conflict', 'targets': ['MK4'], 'what': '여러 장에 나오는 같은 규모 수치를 뒤쪽 한두 장에서만 80% 값으로'},
    'strip_images': {'fn': 'strip_images', 'targets': ['DS6'], 'what': '본문 장 사진을 모두 비움(빈 이미지 칸)'},
}


def perturbed(p: Proposal, kind: str, other: str = '') -> Proposal:
    fn = {'wrong_customer': lambda: wrong_customer(p, other), 'placeholders': lambda: placeholders(p), 'no_proof': lambda: no_proof(p),
          'number_conflict': lambda: number_conflict(p), 'strip_images': lambda: strip_images(p)}[kind]
    return fn()
