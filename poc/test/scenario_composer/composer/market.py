"""업종 트렌드 장(당사의 이해 · 업종 트렌드) — 실제 시장 근거로 장 종류를 고르고 값을 채운다. ``auto.run_auto`` 가 부른다.

템플릿은 트렌드 장의 종류(연도별 추이 · 구성비 · 핵심 지표 · 키워드)를 미리 정해 두고 값은 자리표시([00])로 둔다. 이 값은 고객 자료에도 제품 DB에도
없는 바깥 사실이라, 모델에게 쓰게 하면 지어내거나(금지) 전부 가려진다. 그래서 이 장들은 덱의 일반 문구 단계가 쓰지 않는다:

1. ``start``  — 덱 계획(orchestrate)과 나란히 시장조사를 돌린다. 조사는 앱이 준 ``hook(spec, want)`` 이 한다(실제 웹 검색 → 원문 대조 검증 →
   장 구성: ``app/api/poc/market_research.py``). 이 모듈은 검색 수단을 모른다 — hook 이 없으면 아무것도 하지 않는다(장은 템플릿 그대로).
2. ``apply``  — 트렌드 장이 든 파트만, 그 파트의 문구 단계 바로 앞에서 조사 결과를 기다린다(다른 파트는 기다리지 않는다): 조사 결과가 고른 종류로
   장을 바꾸고(근거의 형태가 템플릿과 다를 때 — 추이 자료가 없으면 추이 막대 대신 핵심 지표), 칸 값을 ``lock`` 으로 건다. lock 이 걸린 칸은 문구
   단계가 다시 쓰지 않고, 선택하지 않은 제품을 지우는 마지막 검사(``enforce_linked``)도 건드리지 않는다(업계 사실이지 제안 품목이 아니다).
   장 수는 그대로라 이미 매긴 쪽 번호 · 머리말 · 바닥글은 새 장으로 옮기기만 한다.
   근거가 모자란 장은 손대지 않는다 — 템플릿의 자리표시가 그대로 남고 파트 노트에 이유를 적는다.
3. ``_layout_out`` 이 장마다 ``ev``(칸 번호 → 근거 목록: 제목 · 주소 · 인용)와 ``research``(검색어 · 조사 시각 · 고른 이유)를 함께 내보낸다.

조사가 실패해도(키 없음 · 네트워크 · 시간 초과) 파트는 실패하지 않는다. 취소만 예외로 올라간다.
"""
from __future__ import annotations

import re
import threading
from datetime import date
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Optional

from .fill import plain
from .library import load

TREND = {'L_TOC_TRLINE': 'line', 'L_TOC_TRSHARE': 'share', 'L_TOC_TRSTAT': 'stat', 'L_TOC_TRKEY': 'key'}
F_OF = {v: k for k, v in TREND.items()}
ROLE = {'line': '업종 트렌드 · 연도별 추이', 'share': '업종 트렌드 · 구성비', 'stat': '업종 트렌드 · 핵심 지표', 'key': '업종 트렌드 · 키워드'}
WAIT = 240  # 조사 결과를 기다리는 최대 시간(초) — 넘으면 템플릿 장 그대로 둔다


def _s(x: Any, n: int = 400) -> str:
    return re.sub(r'\s+', ' ', str(x if x is not None else '')).strip()[:n]


def clean_market(raw: Any) -> Dict[str, dict]:
    """요청의 ``market.sheets`` — 이 업종의 트렌드 장 견본 전부(종류별 하나) → {kind: {'f', 't', 'img'}}. 형식이 틀린 항목은 버린다."""
    out: Dict[str, dict] = {}
    sheets = raw.get('sheets') if isinstance(raw, dict) else None
    if not isinstance(sheets, list):
        return out
    L = load()['layouts']
    for x in sheets[:12]:
        if not isinstance(x, dict):
            continue
        kind, f = _s(x.get('kind'), 12), _s(x.get('f'), 80)
        if kind not in F_OF or F_OF[kind] != f or f not in L or kind in out:
            continue
        t = {str(k): (str(v)[:1200] if not isinstance(v, dict) else {'html': str(v.get('html') or '')[:2000]}) for k, v in (x.get('t') or {}).items() if v is not None} \
            if isinstance(x.get('t'), dict) and len(x['t']) <= 160 else {}
        img = {}
        for k, v in (x.get('img') or {}).items() if isinstance(x.get('img'), dict) and len(x['img']) <= 60 else []:
            if isinstance(v, str) and v:
                img[str(k)] = {'src': v[:600], 'keep': True}
            elif isinstance(v, dict) and (v.get('src') or v.get('hidden')):
                img[str(k)] = {kk: vv for kk, vv in v.items() if isinstance(vv, (str, int, float, bool, list)) and len(str(vv)) <= 600}
        out[kind] = {'f': f, 't': t, 'img': img}
    return out


def _names(f: str) -> Dict[str, int]:
    return {n: int(i) for n, i in ((((load().get('toc_slots') or {}).get(f) or {}).get('t')) or {}).items()}


def trend_slides(ctx: dict) -> List[dict]:
    """템플릿이 넣어 둔 트렌드 장(덱 순서) — [{'part', 'x'(exemplar), 'kind'}]."""
    return [{'part': p, 'x': x, 'kind': TREND[x['f']]} for p in ctx['parts'] if not p.get('deck') for x in p['exemplar'] if x['f'] in TREND]


def spec_of(ctx: dict, found: List[dict]) -> dict:
    """조사 요청 — 업종 · 요구사항 · 연결 품목(공개 정보)과, 템플릿이 원래 보여 주려던 지표(hints)."""
    lib = load()
    PA, S = lib.get('products_all') or {}, lib['solutions']
    hints = []
    for it in found:
        names = _names(it['x']['f'])
        t = it['x']['t']
        val = lambda n: plain(t.get(str(names[n]))) if n in names else ''  # noqa: E731
        labels = [val(n) for n in ('ct', 'cl', 'lb0', 'lb1', 'lb2', 'lb3', 'kw0', 'kw1', 'kw2') if val(n)]
        hints.append({'kind': it['kind'], 'title': val('title'), 'labels': labels})
    ind = ctx.get('vertical_name') or ''
    return {
        'industry': ind or (ctx.get('ind') or ''), 'industry_short': _s(re.split(r'[(（\[]', ind)[0].split(' · ')[0] if ind else '', 14), 'ind': ctx.get('ind') or '',
        'customer': ctx.get('customer') or '', 'title': ctx.get('title') or '',
        'requirement': _s(' '.join(x for x in [ctx.get('summary') or '', ctx.get('req_text') or ''] if x), 2500),
        'products': [_s(f"{PA[p].get('name') or ''} ({PA[p].get('cat') or ''})", 80) for p in ctx['products'][:8] if p in PA],
        'solutions': [_s(S[x].get('name'), 40) for x in ctx['solutions'][:6] if x in S],
        'hints': hints, 'today': date.today().isoformat(),
    }


def start(ctx: dict, hook: Optional[Callable[[dict, List[str]], dict]], log: Callable[[str], Any]) -> Optional[dict]:
    """트렌드 장이 있고 hook 이 있으면 조사를 시작한다(덱 계획과 나란히 돈다) — job | None."""
    if hook is None:
        return None
    found = trend_slides(ctx)
    if not found:
        return None
    spec, want = spec_of(ctx, found), [it['kind'] for it in found]
    log(f"시장조사 시작 — 업종 트렌드 장 {len(found)}장({' · '.join(want)})")
    pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='market')
    return {'future': pool.submit(hook, spec, want), 'found': found, 'pool': pool, 'lock': threading.Lock(), 'res': None, 'logged': False}


def has_part(job: Optional[dict], part: dict) -> bool:
    return bool(job) and any(it['part'] is part for it in job['found'])


def _result(job: dict) -> dict:
    """조사 결과(한 번만 기다린다). 실패 · 시간 초과는 빈 결과 — 취소만 예외."""
    with job['lock']:
        if job['res'] is None:
            fut: Future = job['future']
            try:
                res = fut.result(timeout=WAIT)
            except Exception as exc:  # noqa: BLE001
                if type(exc).__name__ in ('JobCancelled', 'Cancelled'):
                    raise
                res = {'ok': False, 'sheets': [],
                       'message': '시장 자료 조사가 제시간에 끝나지 않았어요.' if type(exc).__name__ == 'TimeoutError' else f'시장 자료 조사 오류({type(exc).__name__})'}
            finally:
                job['pool'].shutdown(wait=False)
            job['res'] = res if isinstance(res, dict) else {'ok': False, 'sheets': [], 'message': '시장 자료 조사 결과를 읽지 못했어요.'}
        return job['res']


def apply(ctx: dict, part: dict, slides: List[dict], job: Optional[dict], log: Callable[[str], Any]) -> None:
    """이 파트의 트렌드 장에 조사 결과를 건다(문구 단계 앞). 실패 · 근거 부족은 장을 그대로 두고 파트 노트만 남긴다."""
    if not has_part(job, part):
        return
    res = _result(job)
    sheets = res.get('sheets') if isinstance(res.get('sheets'), list) else []
    meta = res.get('research') if isinstance(res.get('research'), dict) else {}
    alts = ctx.get('market_alts') or {}
    L = load()['layouts']
    notes: List[str] = []
    done = total = 0
    for n, it in enumerate(job['found']):
        if it['part'] is not part:
            continue
        sl = next((s for s in slides if s.get('src_x') is it['x']), None)
        if sl is None:
            continue  # the part dropped this slide (duplicate layout …)
        total += 1
        sh = sheets[n] if n < len(sheets) and isinstance(sheets[n], dict) else None
        why = (sh or {}).get('why') or res.get('message') or '시장 자료를 조사하지 못했어요.'
        info = {k: meta.get(k) for k in ('queries', 'at', 'engine', 'sources', 'searched', 'rejected', 'reused') if meta.get(k) is not None}
        if not sh or not sh.get('filled') or not isinstance(sh.get('v'), dict) or sh.get('kind') not in F_OF:
            notes.append(f"{ROLE[it['kind']]} — {_s(why, 120)} " + ('이 장의 문구는 검색 근거 없이 쓰였어요 — 확인해 주세요.' if it['kind'] == 'key' else '값을 찾지 못했어요 — 자리표시는 남기지 않고 화면이 이 업종의 키워드 장으로 바꿉니다.'))
            sl['research'] = {'ok': False, 'kind': it['kind'], 'was': it['kind'], 'why': _s(why, 200), **info}
            continue
        kind = sh['kind']
        f_new = F_OF[kind]
        if f_new != sl['f']:
            alt = alts.get(kind)
            # 덱에 이미 있는 레이아웃으로는 바꾸지 않는다(한 덱에 한 번)
            clash = any(s is not sl and s['f'] == f_new for sls in (ctx.get('slides_by') or {}).values() for s in sls) or any(s is not sl and s['f'] == f_new for s in slides)
            if not alt or clash or f_new not in L:
                notes.append(f"{ROLE[it['kind']]} — 근거에 맞는 장({ROLE[kind]})으로 바꾸지 못했어요. 자리표시는 남기지 않고 화면이 키워드 장으로 바꾸거나 그 칸을 비웁니다.")
                sl['research'] = {'ok': False, 'kind': it['kind'], 'was': it['kind'], 'why': '근거에 맞는 장 종류의 견본이 없어요.', **info}
                continue
            _swap(sl, f_new, alt, kind)
        names = _names(sl['f'])
        lock = dict(sl.get('lock') or {})
        for name, value in sh['v'].items():
            if name in names and isinstance(value, str):
                lock[str(names[name])] = value
        ev: Dict[str, list] = {}
        for name, items in (sh.get('ev') or {}).items():
            if name in names and isinstance(items, list):
                ev[str(names[name])] = [x for x in items if isinstance(x, dict) and x.get('url')][:3]
        sl['lock'] = lock
        sl['market'] = {str(names[name]) for name in sh['v'] if name in names}  # 근거로 채운 칸 — 다른 단계가 고치지 않는다
        sl['evidence'] = ev
        sl['research'] = {'ok': True, 'kind': kind, 'was': it['kind'], 'why': _s(sh.get('why'), 200), 'notes': [_s(x, 200) for x in (sh.get('notes') or [])][:6], **info}
        if kind != it['kind']:
            msg = f"{ROLE[it['kind']]} 장을 {ROLE[kind]} 장으로 바꿨어요 — 검색에서 확인된 근거의 형태에 맞췄어요."
            if msg not in sl['adapt']:
                sl['adapt'].append(msg)
            notes.append(msg)
        notes += sl['research']['notes']
        done += 1
    for x in dict.fromkeys(notes):
        if x not in (part.get('notes') or []):
            part.setdefault('notes', []).append(x)
    with job['lock']:
        if not job['logged']:
            job['logged'] = True
            log(f"시장조사 반영 — {part['name'] or '파트'}: 트렌드 장 {done}/{total}장을 검증된 근거로 채움")


def _swap(sl: dict, f_new: str, alt: dict, kind: str) -> None:
    """다른 종류의 트렌드 장으로 — 그 종류의 업종 견본(사진 · 고정 문구)을 받고, 이 덱의 머리말 · 바닥글(이미 매긴 쪽 번호 포함)은 그대로 옮긴다."""
    from .auto import _chrome, _max_i  # late import: auto imports this module
    f_old = sl['f']
    old_names, new_names = _names(f_old), _names(f_new)
    old_base, new_base = _max_i(f_old) + 1, _max_i(f_new) + 1
    t = {k: v for k, v in (alt.get('t') or {}).items() if k.isdigit() and int(k) < new_base}
    if 'eb' in old_names and 'eb' in new_names and str(old_names['eb']) in sl['ex_t']:
        t[str(new_names['eb'])] = sl['ex_t'][str(old_names['eb'])]
    for off, v in _chrome(sl['ex_t'], f_old).items():
        t[str(new_base + off)] = v
    lock = {}
    for k, v in (sl.get('lock') or {}).items():  # number_deck 이 건 칸: 머리말(0)과 바닥글 블록만 새 번호로 옮긴다
        if k.isdigit() and int(k) >= old_base:
            lock[str(new_base + int(k) - old_base)] = v
        elif 'eb' in old_names and 'eb' in new_names and k == str(old_names['eb']):
            lock[str(new_names['eb'])] = v
    sl['ex_t'] = t
    sl['ex_img'] = dict(alt.get('img') or {})
    sl['f'] = f_new
    sl['role'] = ROLE[kind]
    sl['bind_same'] = True
    sl['lock'] = lock
    sl.pop('_slots', None)


def locked(sl: dict, k: str) -> bool:
    """근거로 채운 칸인가(다른 단계가 고치지 않는다)."""
    return k in (sl.get('market') or ())
