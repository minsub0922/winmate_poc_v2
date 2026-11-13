"""요구사항에 따라 다른 목차 구성에 더하는 '구독 솔루션 제안' — 서버 쪽(AI 목차 추천 · Storyboard 이어 구성).

고객 요구(자유 입력 · 키맨 요구 · 메모 · 첨부 · 요구사항 요약)에 구독 · 렌탈 · 월 납부가 있거나 초기 비용 · 관리 부담이 둘 이상이면,
AI가 고른 목차 구성에 구독 목차가 없을 때 '구독 솔루션 제안' 목차 하나만 알맞은 자리에 더한다(마지막 '비용 · 구매' 바로 뒤,
없으면 첫 실행 · 사례 · Why Samsung · 마무리 · 부록 앞). 이미 구독 목차가 있으면 아무것도 하지 않는다.

규칙(요구 신호 · 목차 틀 · 자리)은 구독 레지스트리 addon(app/data/subscriptions.json ← proddb/subs/mapping.json) —
앱의 app/web/src/domain/proposals/addons.js 와 같은 규칙이다. 결정적 규칙이라 모델 호출을 대신하지 않는다(엄격 정책과 무관).
"""
from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from .imports import ROOT

REGISTRY = ROOT / 'app' / 'data' / 'subscriptions.json'
DEFAULT_PLACE = {'after': ['cost'], 'before': ['execution', 'case', 'why', 'closing', 'appendix']}
_CACHE: Dict[str, Any] = {}


def rules() -> Optional[dict]:
    """레지스트리의 addon 규칙(파일이 바뀌면 다시 읽음). 레지스트리가 없으면 None — 아무것도 더하지 않는다."""
    try:
        mtime = REGISTRY.stat().st_mtime
    except OSError:
        return None
    if _CACHE.get('mtime') != mtime:
        reg = json.loads(REGISTRY.read_text(encoding='utf-8')) or {}
        addon = reg.get('addon')
        _CACHE.update(mtime=mtime, rules=addon, verticals=reg.get('verticals') or {},
                      compiled={k: [re.compile(x, re.I) for x in (addon or {}).get(k) or []] for k in ('strong', 'weak', 'negative')})
    return _CACHE['rules']


def _segs(value: Any) -> str:
    """앱 요구 문장 조각([{t} | {ref}] · 중첩 목록 · 문자열) → 글"""
    if value is None:
        return ''
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get('t') or '')
    if isinstance(value, list):
        return ''.join(_segs(x) for x in value)
    return ''


def requirement_text(pr: dict, extra: str = '') -> str:
    """앱 제안서 payload(storyboardPayload) → 고객 요구 문장 한 덩어리(app/web/src/services/search.js reqText 와 같은 범위)"""
    r = pr.get('req') or {}
    f = r.get('form') or {}
    out: List[str] = [pr.get('title') or '', pr.get('customer') or '', _segs(r.get('free')),
                      f.get('project') or '', f.get('customer') or '', f.get('target') or '', f.get('note') or '']
    for k in f.get('keymen') or []:
        if isinstance(k, dict):
            out.append(str(k.get('name') or ''))
            out += [_segs(x) for x in k.get('reqs') or []]
    for fl in r.get('files') or []:
        if isinstance(fl, dict):
            out += [str(fl.get('name') or ''), str(fl.get('memo') or ''), str(fl.get('text') or '')[:4000]]
    if extra:
        out.append(extra)
    return '\n'.join(x for x in out if x and x.strip())


def need(text: str) -> dict:
    """{'need', 'strong', 'weak', 'negative'} — strong 하나 이상 또는 weak 둘 이상, negative 없을 때 need"""
    if rules() is None or not (text or '').strip():
        return {'need': False, 'strong': [], 'weak': [], 'negative': []}
    found: Dict[str, List[str]] = {}
    for kind, pats in _CACHE['compiled'].items():
        hits: List[str] = []
        for p in pats:
            for m in p.finditer(text):
                w = m.group(0).strip()
                if w and w not in hits:
                    hits.append(w)
        found[kind] = hits
    ok = not found['negative'] and (len(found['strong']) >= 1 or len(found['weak']) >= 2)
    return {'need': ok, **found}


def why(n: dict) -> str:
    return ' · '.join((n.get('strong') or []) + (n.get('weak') or []))[:60]


def part(n: dict, src: Optional[str] = None) -> Optional[dict]:
    """더할 목차 {type, name, items(첫 줄 = 왜 더했는지), src?}"""
    r = rules()
    p = (r or {}).get('part')
    if not p:
        return None
    line = '요구사항: ' + ' · '.join(((n.get('strong') or []) + (n.get('weak') or []))[:4])
    out = {'type': p['type'], 'name': p['name'], 'items': ([line] if n.get('need') else []) + list(p.get('items') or [])}
    out['items'] = out['items'][:5]
    if src:
        out['src'] = src
    return out


def index(parts: List[dict]) -> int:
    """더할 자리 — 마지막 비용 · 구매 바로 뒤, 없으면 첫 실행 · 사례 · Why · 마무리 · 부록 앞(표지 앞에는 넣지 않음), 없으면 끝"""
    place = (rules() or {}).get('place') or DEFAULT_PLACE
    types = [str(p.get('type') or '') for p in parts]
    after = max((i for i, t in enumerate(types) if t in place['after']), default=-1)
    if after >= 0:
        return after + 1
    first = next((i for i, p in enumerate(parts) if not p.get('deck')), len(parts))
    return next((i for i, t in enumerate(types) if i >= first and t in place['before']), len(parts))


def has_subscription(parts: List[dict]) -> bool:
    kind = ((rules() or {}).get('part') or {}).get('type') or 'subscription'
    return any(isinstance(p, dict) and p.get('type') == kind for p in parts)


def add(parts: List[dict], board: List[dict], pr: dict, extra_text: str = '', src: Optional[str] = None) -> Tuple[List[dict], Optional[dict]]:
    """AI가 고른 목차(parts)에 구독 요구가 있으면 '구독 솔루션 제안'을 더한 새 목록과 {'why', 'at'} — 아니면 (parts, None).
    board: 지금 Storyboard 에 이미 있는 목차(그 안에 구독 목차가 있으면 더하지 않음)."""
    if has_subscription(parts) or has_subscription(board):
        return parts, None
    n = need(requirement_text(pr, extra_text))
    if not n['need']:
        return parts, None
    p = part(n, src)
    if not p:
        return parts, None
    at = index(parts)
    return parts[:at] + [p] + parts[at:], {'why': why(n), 'at': at, 'src': src}


def module_src(lib: dict, industry: Optional[str]) -> Optional[str]:
    """Scenario Composer 라이브러리에서 '구독 솔루션 제안' 모듈(구독 솔루션이 포함된 샘플 덱 bs_sub_std_<업종>의 그 목차).
    같은 업종 덱 → 그 업종이 주로 쓰는 구독 패키지와 같은 패키지의 덱 → 패키지 없는 업종의 기본(오피스 패키지) 덱 순."""
    name = ((rules() or {}).get('part') or {}).get('name') or '구독 솔루션 제안'
    mods = [m for m in lib.get('modules') or [] if re.search(re.escape(name) + r'$', str(m.get('name') or ''))]
    if not mods:
        return None
    same = [m for m in mods if industry and m.get('ind') == industry]
    if same:
        return same[0]['mid']
    verts = _CACHE.get('verticals') or {}
    pkg_of = lambda vid: (verts.get(vid) or {}).get('pkg')  # noqa: E731
    vids = [str(c['id'])[len('bs_std_'):] for c in lib.get('scenarios') or [] if str(c.get('id', '')).startswith('bs_std_') and c.get('ind') == industry]
    common = Counter(p for p in map(pkg_of, vids) if p).most_common(1)
    fallback = next((v.get('pkg') for v in verts.values() if v.get('match') == 'fallback' and v.get('pkg')), None)
    mod_vid = lambda m: (re.match(r'bs_sub_std_(.+)#\d+$', str(m.get('mid') or '')) or [None, None])[1]  # noqa: E731
    for want in ([common[0][0]] if common else []) + [fallback]:
        hit = [m for m in mods if want and pkg_of(mod_vid(m)) == want]
        if hit:
            return hit[0]['mid']
    return mods[0]['mid']
