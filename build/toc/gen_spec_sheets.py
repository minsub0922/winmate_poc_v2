# 제품 스펙(Spec) 새 장 — 사양 줄 수에 맞춘 시트 3종(L_TOC_PSPEC_R12 · R24 · R36)을 admin/web/src/spec-sheets.json 으로 쓴다.
#   python3 build/toc/gen_spec_sheets.py             (WINMATE_SPEC_SHEETS_OUT=<파일> 로 다른 곳에 쓸 수 있다)
# 사용자 지시(2026-11-16): 제품마다 사양 줄 수가 다르다 → 줄 수에 맞는 시트를 골라 쓴다 · 장은 제품마다 한 장 · 위쪽 대표 스펙 3칸은 없앤다.
#   규칙(줄 수 → 시트 · 열 나눔)은 app/web/src/domain/templates/spec_sheet_plan.js 와 같은 값(TIERS) — 바꾸면 둘을 함께 바꾼다(admin/tests/part-flows.mjs 가 견준다).
# 지금은 관리자 「레이아웃 구성 관리」의 '전체 파트 확인하기' 팝업만 읽는다 — 앱의 레이아웃 목록(toc_layouts.js) · 실제 덱(L_TOC_PSPEC: 숫자 3 + 사양 8줄)에는 아직 넣지 않았다.
#   장은 목차 템플릿 장과 같은 빌더(typed.TT) · 칸 이름(img · nm · md · sl<n> · sv<n>)으로 그렸다. 실제로 쓸 때는 줄 수만큼 칸을 모두 그린 장을 build/toc/layouts.py 에 올린다.
# 예시는 실제 제품의 사양(app/data/product-details) — product.py 의 Spec 정리 규칙(포장 · 배선 · 모델 코드 · 단위 없는 숫자 · 같은 이름은 뺌)을 그대로 쓰되 8줄로 자르지 않는다.
# 결과: { note, sheets: [{ f, code, name, when, per(= 한 장의 사양 줄 수), cols, rows(예시 줄 수), product, nT, nI, slots, html }], images: { '@img0@': data URL } }
import json, os, re, sys, types

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
try:
    import PIL  # noqa: F401 — product.py 가 들이는 prod.py 가 PIL 을 부른다
except ImportError:  # 여기서는 그림 크기를 재지 않으므로 빈 모듈이면 된다
    _pil = types.ModuleType('PIL'); _img = types.ModuleType('PIL.Image'); _pil.Image = _img
    sys.modules['PIL'] = _pil; sys.modules['PIL.Image'] = _img
from base import INK, GRAY, MUTE, SURF, NUMF  # noqa: E402
from typed import TT  # noqa: E402
import product as P  # noqa: E402 — DET(제품 상세) · spec_label · SPEC_SKIP
import gen_ua_catalog as G  # noqa: E402 — photo(사진 묶음) · picture(그림 파일) → data URL

# spec_sheet_plan.js SPEC_SHEET 와 같은 값 — cap: 한 장의 사양 줄 수 · cols: 열 수 · per: 한 열의 줄 수
TIERS = [dict(cap=12, cols=1, per=12), dict(cap=24, cols=2, per=12), dict(cap=36, cols=2, per=18)]
# 시트마다 자리 — 제품 컷(왼쪽) 크기 · 표 자리 · 줄 높이 · 글자 크기(역할 크기만: 12 · 14 · 16 · 18 · 20 · 24)
GEO = {
    12: dict(iw=440, ih=420, pad=24, nsz=24, ny=568, msz=16, my=610, tx=536, tw=680, gap=0, pitch=43, lw=220, lsz=14, vsz=18, lty=12, vty=9),
    24: dict(iw=360, ih=360, pad=20, nsz=24, ny=508, msz=16, my=550, tx=456, tw=760, gap=32, pitch=43, lw=132, lsz=14, vsz=16, lty=12, vty=10),
    36: dict(iw=300, ih=300, pad=16, nsz=20, ny=448, msz=14, my=482, tx=396, tw=820, gap=32, pitch=29, lw=150, lsz=12, vsz=14, lty=6, vty=5),
}
TOP = 128
# 예시 제품 — 업종 제품 제안서의 대표 제품 가운데 사양 줄 수가 그 시트에 맞는 것
EXAMPLES = {12: 'sg_g000184098', 24: 'sg_g000180288', 36: 'sg_g000181134'}
FOOT = '외식 프랜차이즈 · 제품 제안서'
PART_NAME = '제품 스펙'  # 목록에서 쓰는 파트 이름(admin part-flows.js PART_CATALOG.names.pspec — 사용자 지시 2026-11-16: Spec → 제품 스펙). 앱의 목차 이름은 아직 'Spec'


def spec_rows(pid):
    """제품의 사양 전부 — product.spec_rows 와 같은 정리(8줄로 자르기 전까지): [(이름, 값)]"""
    out, seen = [], set()
    for c, lb, v in P.DET.get(pid, {}).get('specs') or []:
        v = str(v).strip(); nl, nv = P.spec_label(lb, v, c)
        if re.search(P.SPEC_SKIP, lb + ' ' + c if c in ('배선', '배관') else lb) or (len(nv) >= 3 and nv.lower() in nl.lower()): continue
        if re.fullmatch(r'[A-Z0-9][A-Z0-9-]{7,}', nv): continue  # 모델 코드
        if re.fullmatch(r'[\d.,]+', nv) and not re.search(r'USB|HDMI|입력|출력|개수|포트|슬롯|등급', nl): continue  # 단위 없는 숫자
        if nl in seen: continue
        seen.add(nl); out.append((nl, nv))
    return out


def products():
    """제품 id → 업종 제품 제안서의 대표 제품 정보(이름 · 모델 · 컷)"""
    tc = json.load(open(os.path.join(ROOT, 'app/web/src/domain/templates/toc_content.json')))
    return {v['pp']['pid']: v['pp'] for v in tc['v'].values() if v.get('pp')}


def columns(n, cols):
    """한 장의 사양 n줄 → 열마다 줄 수 (spec_sheet_plan.js specColumns)"""
    return [n] if cols == 1 else [(n + 1) // 2, n // 2]


def draw(tier, pp, rows, page):
    cap, cols = tier['cap'], tier['cols']; g = GEO[cap]
    if len(rows) > cap: raise SystemExit(f'R{cap}: 예시 제품의 사양이 {len(rows)}줄 — {cap}줄 이하인 제품을 고른다')
    s = TT(f'L_TOC_PSPEC_R{cap}'); s.head2('04 · ' + PART_NAME, f"{pp['nm']}, 사양")
    s.pic(64, TOP, g['iw'], g['ih'], pp['cut'], '제품 컷', kind='cut', r=18, name='img', bg=SURF, pad=g['pad'])
    s.t(64, g['ny'], g['iw'], pp['nm'], g['nsz'], 800, INK, 1.3, name='nm', nowrap=True)
    s.t(64, g['my'], g['iw'], pp.get('model') or '', g['msz'], 700, GRAY, 1.3, name='md', nowrap=True, extra=f'font-family: {NUMF}')
    colw = (g['tw'] - g['gap'] * (cols - 1)) / cols
    split = columns(len(rows), cols); j = 0
    for c, cnt in enumerate(split):
        x = g['tx'] + c * (colw + g['gap'])
        for r in range(cnt):
            lb, vl = rows[j]; y = TOP + r * g['pitch']
            s.hline(x, y, colw)
            s.t(x, y + g['lty'], g['lw'], lb, g['lsz'], 800, MUTE, 1.3, name=f'sl{j}', nowrap=True)
            s.t(x + g['lw'] + 12, y + g['vty'], colw - g['lw'] - 12, vl, g['vsz'], 700, INK, 1.35, name=f'sv{j}', nowrap=True)
            j += 1
        if cnt: s.hline(x, TOP + cnt * g['pitch'], colw)
    bottom = TOP + max(split) * g['pitch']
    if bottom > 656: raise SystemExit(f'R{cap}: 표가 바닥 줄을 넘는다({bottom}px)')
    s.foot2(FOOT, page)
    shape = '1열' if cols == 1 else ('2열' if cap == 24 else '2열 · 촘촘하게')
    return {'f': s.fid, 'code': s.fid[2:].replace('_', '-'), 'name': f'{PART_NAME} · 사양 {cap}줄까지 ({shape})',
            'when': f"제품 하나의 사양을 {cap}줄까지 한 장에 보여 줄 때 — 대표 스펙 칸 없이 제품 컷과 사양 표만", 'per': cap, 'cols': cols, 'rows': len(rows),
            'product': pp['nm'], 'nT': s.ntb, 'nI': s.nimg, 'slots': {'t': s.names, 'img': s.imgnames}, 'html': s.html()}


DOC = ('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">'
       '<style>html,body{margin:0;width:1280px;height:720px;overflow:hidden}*{box-sizing:border-box}</style></head><body>')


def build():
    pps = products(); sheets, images = [], {}

    def key(data):
        for k, v in images.items():
            if v == data: return k
        k = f'@img{len(images)}@'; images[k] = data; return k

    for i, tier in enumerate(TIERS):
        pid = EXAMPLES[tier['cap']]
        if pid not in pps: raise SystemExit(f'예시 제품 {pid} 이 업종 제품 제안서에 없다')
        m = draw(tier, pps[pid], spec_rows(pid), 9 + i)
        html = G.PACKED.sub(lambda x: f'data-fill="{x.group(1)}#{x.group(2)}"', m['html'])
        # 그림 주소 → 파일에 담은 그림(@imgN@) — 사진 묶음(src=GIF data-fill="…json#k")과 그림 파일(src="img/…")
        html = re.sub(r'src="[^"]*" data-fill="([^"]+\.json#\d+)"', lambda x: f'src="{key(G.photo(x.group(1)))}" data-fill="{x.group(1)}"', html)
        html = re.sub(r'<img src="((?!data:|@img)[^"]+)"', lambda x: f'<img src="{key(G.picture(x.group(1)))}"', html)
        m['html'] = DOC + html + '</body></html>'
        sheets.append(m)
    return {'note': '제품 스펙(Spec) — 사양 줄 수에 맞춘 시트 3종. build/toc/gen_spec_sheets.py 가 만든다(손으로 고치지 않는다). 전체 파트 목록만 읽는다 — 실제 덱 반영 전.',
            'sheets': sheets, 'images': images}


if __name__ == '__main__':
    data = build()
    out = os.environ.get('WINMATE_SPEC_SHEETS_OUT') or os.path.join(ROOT, 'admin/web/src/spec-sheets.json')
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    open(out, 'w').write(text + '\n')
    print('시트 ' + ' · '.join(f"{s['f']}({s['product']} {s['rows']}줄)" for s in data['sheets']) + f" · 그림 {len(data['images'])} → {out} ({round(len(text) / 1024)} KB)")
