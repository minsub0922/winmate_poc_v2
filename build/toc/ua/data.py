# 당사의 이해 · 경쟁 우위 장의 근거 — 앱이 이미 쓰는 실제 값만 읽어 온다(지어내지 않는다).
#   제품 · 솔루션 · 핵심 스펙 · 경쟁 유형: app/web/src/domain/templates/toc_content.json (build/toc/build_content.py — 제품 DB · 제품 상세에서 만든 값)
#   공식 도입사례: standard_vertical_scenarios.json (업종 표준 제안서의 도입사례 장 — samsung.com 도입사례 원문)
#   없는 이름을 달라고 하면 바로 멈춘다 — 장에 적은 제품 · 솔루션 · 스펙 · 사례가 자료에 실제로 있는지 생성할 때마다 확인하는 셈이다.
import json, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
_T = os.path.join(ROOT, 'app/web/src/domain/templates')
_C = json.load(open(os.path.join(_T, 'toc_content.json')))
_S = json.load(open(os.path.join(_T, 'standard_vertical_scenarios.json')))


def V(vid):
    if vid not in _C['v']: raise SystemExit(f'없는 업종: {vid}')
    return _C['v'][vid]


def rivals(vid):
    """이 업종에서 맞서는 경쟁 유형 둘(익명 — 유형 이름만) → (A, B)"""
    cs = _C['g'][V(vid)['g']]['cs']
    return cs['a'], cs['b']


def product(vid, name):
    """이 업종에 놓이는 제품 → { nm, cut } (구성 · 수량표의 제품 분류 또는 핵심 제품 3종)"""
    v = V(vid)
    for nm, cut in v['bom']['cols']:
        if nm == name: return {'nm': nm, 'cut': cut}
    for s in v['spec']:
        if s['nm'] == name: return {'nm': s['nm'], 'cut': s['cut']}
    raise SystemExit(f"{vid}: 제품 '{name}' 이 없다 — 있는 것: {[c[0] for c in v['bom']['cols']] + [s['nm'] for s in v['spec']]}")


def solution(vid, name):
    """이 업종에서 쓰는 솔루션 이름인지 확인하고 그대로 돌려준다"""
    v = V(vid)
    names = [t['nm'] for t in v['tech']] + [x['nm'] for x in v['pp']['vps'] if x['k'] == 's']
    if name not in names: raise SystemExit(f"{vid}: 솔루션 '{name}' 이 없다 — 있는 것: {names}")
    return name


def hero(vid):
    """대표 제품 → { nm, model, cut, specs: {이름: 값} }"""
    p = V(vid)['pp']
    return {'nm': p['nm'], 'model': p.get('model') or '', 'cut': p['cut'], 'specs': dict(p['specs'])}


def spec(vid, label, show=None):
    """대표 제품의 스펙 값 — show 를 주면 그 값의 일부만 보인다(자료 값에 들어 있어야 한다: '4 K (3,840 x 2,160)' → '3,840 x 2,160')"""
    specs = hero(vid)['specs']
    if label not in specs: raise SystemExit(f"{vid}: 스펙 '{label}' 이 없다 — 있는 것: {list(specs)}")
    value = specs[label]
    if show is not None and show not in value: raise SystemExit(f"{vid}: 스펙 '{label}' 값 '{value}' 에 '{show}' 가 없다")
    return show if show is not None else value


_cases = None
def cases():
    """공식 도입사례 — 고객 이름 → { cust, kind(어떤 곳), items(도입한 것), point(도입 포인트), when(원문 시기), photos: [사진 주소], verticals: [업종 id] }"""
    global _cases
    if _cases is None:
        _cases = {}
        for sc in _S['scenarios']:
            vid = sc['id'].replace('bs_std_', ''); fills = _S['fills'][sc['id']]; k = 0
            for g in sc['flow']:
                for x in g['slides']:
                    if x['f'] == 'L_VS_CASE':
                        t = fills[k]['t']; img = fills[k].get('img', {})
                        kind, _, items = t['2'].partition(' — ')
                        c = _cases.setdefault(t['1'], {'cust': t['1'], 'kind': kind, 'items': items, 'point': t.get('5', ''),
                                                       'when': re.sub(r'^원문 · samsung\.com 도입사례 · ', '', t.get('10', '')),
                                                       'photos': [img[i]['src'] for i in sorted(img, key=int) if img[i].get('src')], 'verticals': []})
                        c['verticals'].append(vid)
                    k += 1
    return _cases


def case(name, verticals):
    """이 묶음 업종의 표준 제안서에 실린 사례인지 확인하고 돌려준다"""
    c = cases().get(name)
    if not c or not set(c['verticals']) & set(verticals):
        have = sorted(n for n, x in cases().items() if set(x['verticals']) & set(verticals))
        raise SystemExit(f"사례 '{name}' 이 이 묶음({verticals[0]} …)에 없다 — 있는 것: {have}")
    return c


def other_cases(verticals, exclude, limit=3):
    """같은 묶음의 다른 사례 이름 — 표준 제안서에 실린 순서"""
    out = []
    for vid in verticals:
        for n, x in cases().items():
            if vid in x['verticals'] and n not in exclude and n not in out: out.append(n)
    return out[:limit]
