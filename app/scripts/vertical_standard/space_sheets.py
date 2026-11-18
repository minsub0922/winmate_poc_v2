# -*- coding: utf-8 -*-
"""공간별 대표 제품 장 — 제품 수에 따라 나눠 쓰는 시트 4종(L_VS_SPACE_1 · 2 · 3 · 4)과 관리자 '전체 파트' 팝업용 예시.

사용자 지시(2026-11-16):
  · 제품 1개 장(L_VS_SPACE_1) — 지금 장(L_VS_SPACE)에 key message · 특징 2와 이어지는 주요 스펙을 더한다. '대표 제품' 표식은 제품 이름
    위에서 오른쪽으로 옮겨 그만큼 자리를 번다. 칸 번호는 L_VS_SPACE 와 같고(글 0~11 · 사진 0~1) 스펙 칸만 뒤(글 12~20)에 붙는다.
  · 제품 2개 장(L_VS_SPACE_2) — 공간 사진 위에 제품 컷을 겹쳐 자리를 벌고, key message 없이 특징 2 + 스펙 3.
  · 제품 3 · 4개 장(L_VS_SPACE_3 · 4) — 공간 사진 위에 제품 컷을 겹치고 특징 2까지만.
  어느 시트를 몇 장 쓰는지(3개 이하 한 장씩 · 4개 2/2 · 5개 3/2 · 6개 3/3 · 7개 4/3 · 8개 4/4 · 그 이상은 조감도부터 다시)는
  app/web/src/domain/templates/space_sheet_plan.js 가 정한다.
  · 업종 Map(L_VS_MAP_2 … 8) — 공간 수에 맞는 시트를 골라 쓴다. 공간 2곳부터 8곳까지(1곳은 Map 을 두지 않고, 8곳을 넘으면 조감도 묶음마다 한 장).
    공간마다 제품을 하나 이상 놓고 제품 수에 따라 카드 크기 · 배치가 달라지므로, 장은 앱 모듈(space_map_sheet.js)이 조립한다 — 여기서는 예시 자료만 낸다.

지금은 **관리자 '전체 파트' 목록에만** 쓴다 — 레이아웃 라이브러리(vertical_std_layouts.js)와 업종별 표준 제안서 44종은 그대로다
(실제 덱 반영 전). 덱에 반영할 때는 gen_layouts.build() 가 space_one() · space_multi(n) 을 L.add 로 올리고 build.py 가 이 칸에 채운다.

  python3 app/scripts/vertical_standard/space_sheets.py     # → admin/web/src/space-sheets.json (예시를 채운 제품 장 4종 · Map 예시 자료 7종 + 사진)
  OUT=<폴더> 를 주면 그 폴더에만 쓴다(sheet-<f>.html 도 함께 — 눈으로 확인할 때).
Pillow 가 필요하다(관리자 실행 환경 admin/runtime/python 에 있다: PYTHONPATH=admin/runtime/python).
"""
import base64, io, json, os, re, sys

from layouts import B, BLUE, INK, INK2, GRAY, SURF, TINT, MAN, G, footer, meta, esc
from paths import ROOT

SHEETS = []  # (meta, html, schema)
MAX_PER_SHEET = 4


def reg(b, m, per):
    m['nT'], m['nI'], m['txt'], m['per'] = b.nt, b.ni, '', per
    SHEETS.append((m, b.html(), {'keys': dict(b.keys), 'labels': dict(b.labels), 'ikeys': dict(b.ikeys), 'nT': b.nt, 'nI': b.ni,
                                 'samples': dict(b.samples), 'box': dict(b.box_of)}))


def head(b, eb, title):
    b.text('label', 64, 44, 1000, eb, f'font-weight: 700; letter-spacing: 0.06em; color: {BLUE}; white-space: nowrap;', h=19, key='eb')
    b.text('title', 64, 64, 1152, title, f'font-weight: 700; letter-spacing: -0.02em; color: {INK}; white-space: nowrap;', h=40, key='title')


def spec_cells(b, x, y, w, h, n, key, bg, gap=12):
    """스펙 n칸 — 칸마다 이름(작게) · 값(굵게). 선 없이 면으로만 나눈다."""
    cw = (w - gap * (n - 1)) / n
    for k in range(n):
        cx = round(x + k * (cw + gap))
        b.box(cx, y, round(cw), h, f'border-radius: 10px; background: {bg};')
        b.text('utility', cx + 12, y + (h - 44) // 2, round(cw) - 24, '스펙 이름', f'color: {GRAY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=16, key=f'{key}{k}l')
        b.text('dense', cx + 12, y + (h - 44) // 2 + 20, round(cw) - 24, '스펙 값', f'font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f'{key}{k}v')


# ------------------------------------------------------------------ 제품 1개 장
def space_one():
    """왼쪽 공간 사진 | 오른쪽 위에서 아래로 — 제품 이름(+ 오른쪽 '대표 제품') → key message → 제품 컷 + 특징 2 → 주요 스펙 4.
    글 0~11 · 사진 0~1 은 L_VS_SPACE 와 같은 칸(0 장 표식 · 1 공간 이름 · 2 key message · 3 '대표 제품' · 4 제품 이름 · 5~8 특징 2 · 9~11 꼬리말,
    사진 0 제품 컷 · 1 공간 사진) — 저장된 장을 이 장으로 바꿔도 글 · 사진이 그대로 맞는다. 스펙은 글 12('주요 스펙') · 13~20(이름 · 값 × 4)."""
    b = B('L_VS_SPACE_1')
    px, py, pw, ph = 64, 136, 544, 512
    rx, rw = 640, 576
    head(b, '03 · 공간별 제안 · 01', '공간 이름')
    b.text('heading', rx, 178, rw, '이 공간에서 대표 제품이 하는 일 — 누가 무엇을 하고 무엇이 나아지는지 한두 문장으로',
           f'font-weight: 700; color: {INK}; background: {TINT}; border-radius: 12px; padding: 14px 18px; box-sizing: border-box;', h=80, key='msg')
    # '대표 제품' — 제품 이름 위가 아니라 오른쪽(알약). 그만큼 key message · 특징 영역이 위로 올라간다
    b.text('label', rx + rw - 88, py + 3, 88, '대표 제품',
           f'font-weight: 700; letter-spacing: .02em; color: {BLUE}; background: {TINT}; border-radius: 999px; text-align: center; white-space: nowrap; line-height: 25px; box-sizing: border-box;', h=25, fixed=True, label=True)
    b.text('subheading', rx, py, rw - 100, '제품 이름', f'font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=30, key='prod')
    cy, cb = 296, 548
    b.box(rx, cy, rw, cb - cy, f'background: {SURF}; border-radius: 16px;')
    iw = 188
    b.img(rx + 20, cy + 20, iw, cb - cy - 40, 'cut', '대표 제품 컷', radius=12, bg='#ffffff', fit='contain', pad=16, key='img')
    fx = rx + 20 + iw + 24
    fw = rx + rw - 20 - fx
    for r in range(2):
        y = cy + 22 + 112 * r
        b.circle(fx, y, 28, str(r + 1), fs=14)
        b.text('heading', fx + 38, y + 1, fw - 38, '제품 특징 한 줄 제목', f'font-weight: 800; color: {INK}; white-space: nowrap;', h=26, key=f'f{r}t')
        b.text('dense', fx, y + 38, fw, '이 특징이 공간 운영과 이용자에게 주는 효과를 한두 줄로 설명', f'color: {INK2};', h=67, key=f'f{r}d')
    b.img(px, py, pw, ph, 'space', '공간 사진', radius=16, bg=SURF, key='space')
    footer(b)
    # 주요 스펙 — key message · 특징 2가 말하는 것을 뒷받침하는 사양 4 (글 12~20: 꼬리말 뒤에 붙여 앞 칸 번호를 지킨다)
    b.text('label', rx, 562, 300, '주요 스펙', f'font-weight: 700; letter-spacing: .04em; color: {BLUE}; white-space: nowrap;', h=19, label=True)
    spec_cells(b, rx, 588, rw, 60, 4, 's', SURF)
    reg(b, meta('L_VS_SPACE_1', 'VS-SPACE-1', '공간별 대표 제품 · 제품 1 — 공간 사진 + 제품 이름 · key message · 제품 컷과 특징 2 · 주요 스펙 4',
                '03 공간별 제안 — 제품이 3개 이하일 때 제품마다 한 장: 공간 사진 옆에 대표 제품 이름, 한두 문장 key message, 제품 컷과 두 가지 특징, 그 특징을 뒷받침하는 주요 스펙',
                'products', 'scenario', G.format('03 공간별 제안'), '03 · 공간별 제안', '공간 이름', '', ['spaces', 'products', 'images'],
                ik=['cut', 'space'], ih=['대표 제품 컷', '공간 사진']), 1)


# ------------------------------------------------------------------ 제품 2 · 3 · 4개 장
# 칸: 글 0 장 표식 · 1 제목, 제품마다 [공간(번호 · 이름) · 제품 이름 · 특징 2(제목 · 설명) (· 스펙 3 이름 · 값 — 2개 장만)], 꼬리말 3
#     사진은 제품마다 [제품 컷, 공간 사진] — 제품 컷은 공간 사진 오른쪽 아래에 겹친다
MULTI = {  # n: (사진 높이, 겹친 컷 (w, h), 안쪽 여백, 제품 이름 역할 · 높이, 설명 역할 · 높이)
    2: dict(photo=252, cut=(160, 124), pad=20, name=('subheading', 30), desc=('dense', 67), specs=3),
    3: dict(photo=256, cut=(132, 104), pad=20, name=('heading', 26), desc=('label', 57), specs=0),
    4: dict(photo=200, cut=(108, 86), pad=16, name=('body', 50), desc=('label', 76), specs=0),
}


def space_multi(n):
    """제품 n개를 나란히 — 제품마다 카드 하나: 위에 공간 사진(왼쪽 위 공간 번호 · 이름, 오른쪽 아래 제품 컷을 겹침), 아래에 제품 이름 · 특징 2.
    key message 는 없다. 2개 장만 스펙 3칸까지."""
    c = MULTI[n]
    f = f'L_VS_SPACE_{n}'
    b = B(f)
    head(b, f'03 · 공간별 제안 · 01–{n:02d}', '공간별 대표 제품')
    gap, top, bot = 24, 136, 648
    w = (1152 - gap * (n - 1)) // n
    pad = c['pad']
    tw = w - 2 * pad
    cw, ch = c['cut']
    for k in range(n):
        x = 64 + k * (w + gap)
        b.box(x, top, w, bot - top, f'border-radius: 16px; background: {SURF};')
        # 공간 번호 · 이름 — 사진 위 알약 (조감도 범례의 번호와 같은 번호)
        b.text('label', x + 12, top + 12, w - 24, f'{k + 1:02d} · 공간 이름',
               f'display: inline-block; width: auto; max-width: {w - 24}px; padding: 5px 12px; border-radius: 999px; background: rgba(18,20,23,.74); color: #ffffff; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-sizing: border-box; z-index: 2;', h=29, key=f'p{k}s')
        y = top + c['photo'] + 16
        role, nh = c['name']
        one = 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' if n < 4 else ''
        b.text(role, x + pad, y, tw, '제품 이름', f'font-weight: 800; color: {INK}; {one}', h=nh, key=f'p{k}n')
        y += nh + (14 if n < 4 else 12)
        drole, dh = c['desc']
        if n == 2:  # 특징 둘을 나란히
            fw = (tw - 24) // 2
            for r in range(2):
                fx = x + pad + r * (fw + 24)
                b.text('dense', fx, y, fw, '제품 특징 한 줄 제목', f'font-weight: 800; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f'p{k}f{r}t')
                b.text(drole, fx, y + 26, fw, '이 특징이 주는 효과를 한두 줄로 설명', f'color: {INK2};', h=dh, key=f'p{k}f{r}d')
            spec_cells(b, x + pad, bot - pad - 68, tw, 68, c['specs'], f'p{k}s', '#ffffff')
        else:      # 특징 둘을 위아래로
            for r in range(2):
                fy = y + r * (24 + dh + 14)
                b.text('dense', x + pad, fy, tw, '제품 특징 한 줄 제목', f'font-weight: 800; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f'p{k}f{r}t')
                b.text(drole, x + pad, fy + 24, tw, '이 특징이 주는 효과를 한두 줄로 설명', f'color: {INK2};', h=dh, key=f'p{k}f{r}d')
        # 사진 — 제품 컷(짝수 칸) · 공간 사진(홀수 칸). 컷은 공간 사진 오른쪽 아래에 겹친다(z-index)
        b.img(x + w - 12 - cw, top + c['photo'] - 12 - ch, cw, ch, 'cut', '대표 제품 컷', radius=12, bg='#ffffff', fit='contain', pad=10, extra='z-index: 2;', key=f'p{k}img')
        b.img(x, top, w, c['photo'], 'space', '공간 사진', radius=16, bg='#e9ecf0', extra='border-radius: 16px 16px 0 0;', key=f'p{k}space')
    footer(b)
    what = '특징 2 · 스펙 3' if c['specs'] else '특징 2'
    when = {2: '제품이 4개(2/2) · 5개(3/2의 둘째 장)일 때', 3: '제품이 5개(3/2의 첫 장) · 6개(3/3) · 7개(4/3의 둘째 장)일 때', 4: '제품이 7개(4/3의 첫 장) · 8개(4/4)일 때'}[n]
    reg(b, meta(f, f'VS-SPACE-{n}', f'공간별 대표 제품 · 제품 {n} — 공간 사진 위 제품 컷 + 제품 이름 · {what}',
                f'03 공간별 제안 — {when}: 공간 사진 위에 제품 컷을 겹쳐 자리를 벌고 제품마다 이름 · {what}{"" if c["specs"] else "까지만"} (key message 없음)',
                'products', 'scenario', G.format('03 공간별 제안'), '03 · 공간별 제안', '공간별 대표 제품', '', ['spaces', 'products', 'images'],
                ik=[x for _ in range(n) for x in ('cut', 'space')], ih=[x for _ in range(n) for x in ('대표 제품 컷', '공간 사진')]), n)


def build_all():
    if not SHEETS:
        space_one()
        for n in range(2, MAX_PER_SHEET + 1): space_multi(n)
    return SHEETS


# ------------------------------------------------------------------ key message · 특징과 이어지는 스펙
# 글(특징 제목 · 설명 · key message)에 이 말이 나오면 → 이 사양을 먼저 고른다. 남는 칸은 제품 사양표의 앞 순서(build/toc/product.py spec_rows)로 채운다.
RELATED = [
    (r'휘도|밝|햇빛|야외|옥외|nit', r'밝기|Brightness|휘도'),
    (r'4K|UHD|8K|해상도|선명|화질', r'해상도|Resolution'),
    (r'24시간|연속|상시|하루 종일', r'사용 시간'),
    (r'대화면|큰 화면|대형|넓은 화면', r'대각선|화면 ?크기|화면사이즈|Main Display'),
    (r'베젤|이음|하나의 화면', r'베젤'),
    (r'냉방|시원|기류|바람|무풍|냉난방', r'냉방 ?성능|냉방능력|정격 ?냉방'),
    (r'난방|온수|따뜻|냉난방', r'난방 ?성능|정격 ?난방'),
    (r'에너지|절감|절약|효율|전기요금|저전력', r'효율|등급|CSPF|소비 ?전력'),
    (r'원격|클라우드|앱|SmartThings|스마트싱스|콘텐츠|송출|배포', r'운영체제|^OS'),
    (r'배터리|오래 쓰', r'배터리|사용 시간'),
    (r'가볍|가벼|휴대성|얇은|얇고', r'무게|중량|두께'),
    (r'용량|보관|대용량', r'용량'),
    (r'조용|소음|저소음', r'소음'),
    (r'성능|프로세서|AI', r'CPU|^AP|프로세서|화질엔진'),
    (r'판넬|디자인|인테리어|설치', r'치수|제품 ?크기'),
]
SPEC_NAME = [(r'대각선 사이즈|화면사이즈', '화면 크기'), (r'^제품 사용 시간$', '사용 시간'), (r'^운영체제 버전$', '운영체제'), (r'^화면 해상도$', '해상도'),
             (r'^플래시메모리 사이즈$', '저장 공간'), (r'^제품 (무게|중량)$', '무게'), (r'^제품 치수$', '크기'),
             (r'^Pixel Pitch$', '픽셀 피치'), (r'^Pixel Configuration$', '화소 구성'), (r'^Brightness$', '밝기'), (r'^Contrast Ratio$', '명암비')]
_PR = None


def _product():
    """build/toc/product.py — 제품 상세 사양(DET) · 이름 · 값 다듬기(spec_label) · 사양표 순서(spec_rows)"""
    global _PR
    if _PR is None:
        sys.path.insert(0, os.path.join(ROOT, 'build', 'toc'))
        import product
        _PR = product
    return _PR


def spec_pair(lb, v, limit):
    """칸에 들어가게 — '6.00 kW (최대 8.00)' → '6.00 kW', '4K (3,840 x 2,160)' → '4K', '1,920 x 1,080' → '1,920 × 1,080',
    밝기 'Outdoor 3,000 / Indoor 1,000 nit'(양면) → ('밝기 (옥외 면)', '3,000 nit'). → (이름, 값)"""
    m = re.fullmatch(r'Outdoor ([\d,]+) / Indoor ([\d,]+) (nit)', v)
    if m: lb, v = lb + ' (옥외 면)', f'{m.group(1)} {m.group(3)}'
    v = re.sub(r'\s*\((?:최대|even|Typ)[^)]*\)\s*$', '', v).strip()
    if len(v) > limit and ' (' in v: v = v.split(' (')[0].strip()
    v = re.sub(r'(?<=\d)\s*x\s*(?=\d)', ' × ', v)
    for pat, to in SPEC_NAME:
        if re.search(pat, lb): lb = to
    return lb, v


def related_specs(pid, texts, n, limit=14):
    """제품 pid 의 사양 n개 — texts(특징 1 · 특징 2 · key message 순)가 말하는 것과 이어지는 사양 먼저, 나머지는 사양표 순서. → [(이름, 값)]"""
    PR = _product()
    cand = []
    for c, lb, v in PR.DET.get(pid, {}).get('specs') or []:
        v = str(v).strip(); nl, nv = PR.spec_label(lb, v, c)
        if re.search(PR.SPEC_SKIP, lb) or nv in PR.SPEC_BOOL or re.fullmatch(r'[A-Z0-9][A-Z0-9-]{7,}', nv): continue
        if re.fullmatch(r'[\d.,]+', nv): continue
        sl, sv = spec_pair(nl, nv, limit)
        if 0 < len(sv) <= limit: cand.append((nl, sl, sv))
    out = []
    have = lambda name: any(name == o[0] for o in out)
    # 글마다 이어지는 사양을 차례로 모은 뒤, 글을 돌아가며 하나씩 고른다(특징 1에서만 다 고르지 않게)
    per = []
    for t in texts:
        hits = []
        for said, pat in RELATED:
            if not t or not re.search(said, t): continue
            hits += [(sl, sv) for nl, sl, sv in cand if re.search(pat, nl) and (sl, sv) not in hits][:1]
        per.append(hits)
    for turn in range(max([len(h) for h in per] or [0])):
        for hits in per:
            if turn < len(hits) and len(out) < n and not have(hits[turn][0]): out.append(hits[turn])
    rows, _ = PR.spec_rows(pid)
    for lb, v in rows:
        if len(out) >= n: break
        sl, sv = spec_pair(lb, v, limit)
        if 0 < len(sv) <= limit and not have(sl): out.append((sl, sv))
    return out[:n]


# ------------------------------------------------------------------ 예시 — 업종 표준 제안서(상급종합병원)의 공간 10곳
# 시트 4종이 공간 1 · 2 · 3 · 4곳씩 서로 다른 공간을 쓴다(1 + 2 + 3 + 4 = 10) — 관리자 목록의 한 카드 안에서 같은 사진을 두 번 쓰지 않는다
# (사용자 규칙 2026-11-16: "비록 예시지만 동일 이미지를 재사용하지 마"). 그래서 공간이 10곳이고 사진 · 대표 제품이 모두 다른 덱을 쓴다.
EXAMPLE = 'bs_std_md_tertiary'


def example_products():
    """예시 덱의 공간별 대표 제품 장(L_VS_SPACE) → [{ no, space, msg, name, feats, cut, photo, pid }] — 글 · 사진은 그 장 그대로"""
    import prod
    std = json.load(open(ROOT + '/app/web/src/domain/templates/standard_vertical_scenarios.json', encoding='utf-8'))
    s = next(x for x in std['scenarios'] if x['id'] == EXAMPLE)
    fills = std['fills'][EXAMPLE]
    by_name = {v[1]: v[0] for v in prod.P.values()}
    out, k = [], 0
    for g in s['flow']:
        for x in g['slides']:
            o = fills[k]; k += 1
            if x['f'] != 'L_VS_SPACE': continue
            t, im = o['t'], o['img']
            out.append({'no': len(out) + 1, 'space': t['1'], 'msg': t['2'], 'name': t['4'], 'feats': [(t['5'], t['6']), (t['7'], t['8'])],
                        'cut': im['0'], 'photo': im['1'], 'pid': by_name[t['4']], 'foot': t['10']})
    return out


def fill_html(html, t, img):
    """장 HTML 에 글 · 사진을 넣는다 (data-tb · data-img 칸)"""
    for i, v in t.items():
        html, n = re.subn(r'(<(\w+)[^>]*\sdata-tb="%s"[^>]*>)(.*?)(</\2>)' % i, lambda m: m.group(1) + esc(v) + m.group(4), html, count=1, flags=re.S)
        if not n: raise KeyError(f'text slot {i}')
    for i, src in img.items():
        html, n = re.subn(r'(data-img="%s"[^>]*>\s*<img src=")[^"]*(")' % i, lambda m: m.group(1) + src + m.group(2), html, count=1)
        if not n: raise KeyError(f'image slot {i}')
    return html


def example_fill(f, schema, items, foot, page):
    """예시 글 · 사진 — items: 이 장에 놓는 제품들"""
    K, IK = schema['keys'], schema['ikeys']
    t = {i: lab for i, lab in schema['labels'].items()}
    img = {}
    put = lambda key, v: t.__setitem__(K[key], v)
    put('cust', '고객사 로고'); put('foot', foot); put('page', f'CONFIDENTIAL · {page}')
    if f == 'L_VS_SPACE_1':
        p = items[0]
        put('eb', f'03 · 공간별 제안 · {p["no"]:02d}'); put('title', p['space']); put('msg', p['msg']); put('prod', p['name'])
        for r, (ft, fd) in enumerate(p['feats']): put(f'f{r}t', ft); put(f'f{r}d', fd)
        specs = related_specs(p['pid'], [' '.join(p['feats'][0]), ' '.join(p['feats'][1]), p['msg']], 4)
        for k, (lb, v) in enumerate(specs): put(f's{k}l', lb); put(f's{k}v', v)
        img[IK['img']], img[IK['space']] = p['cut'], p['photo']
        return t, img, {p['name']: specs}
    put('eb', f'03 · 공간별 제안 · {items[0]["no"]:02d}–{items[-1]["no"]:02d}'); put('title', foot.split(' · ')[0] + '의 공간별 대표 제품')
    used = {}
    for k, p in enumerate(items):
        put(f'p{k}s', f'{p["no"]:02d} · {p["space"]}'); put(f'p{k}n', p['name'])
        for r, (ft, fd) in enumerate(p['feats']): put(f'p{k}f{r}t', ft); put(f'p{k}f{r}d', fd)
        if f'p{k}s0l' in K:
            specs = related_specs(p['pid'], [' '.join(p['feats'][0]), ' '.join(p['feats'][1])], 3)
            for j, (lb, v) in enumerate(specs): put(f'p{k}s{j}l', lb); put(f'p{k}s{j}v', v)
            used[p['name']] = specs
        img[IK[f'p{k}img']], img[IK[f'p{k}space']] = p['cut'], p['photo']
    return t, img, used


# ------------------------------------------------------------------ 업종 Map — 공간 2~8곳 · 공간마다 제품 여러 개
# Map 장은 여기서 만들지 않는다 — 공간마다 놓는 제품 수에 따라 카드 크기 · 배치가 달라지므로 앱 쪽 모듈이 그때그때 조립한다
# (app/web/src/domain/templates/space_map_sheet.js spaceMapSheet). 여기서는 관리자 목록에 보여 줄 예시 자료만 낸다:
# 공간 수마다 실제 업종 하나(그 업종 표준 제안서의 공간 · 공간에 놓이는 제품군 · 하는 일 문장). 2곳짜리 업종은 없어 4곳 업종의 앞 2곳을 쓴다.
MAP_EXAMPLES = {2: 'mf_logistics', 3: 'sv_beauty', 4: 'sv_screen', 5: 'ht_mid', 6: 'fb_qsr', 7: 'rt_hyper', 8: 'rt_mall'}


def map_example(n, vid, std, vp):
    """공간 n곳 예시 — { n, vertical, title, foot, page, spaces: [{ name, note, products: [{ name, cat, src }] }] }
    제품은 그 공간에 놓이는 제품군(vertical_space_product.json)마다 대표 제품 하나 — 표준 제안서가 고른 대표 제품을 맨 앞에."""
    import prod
    sid = 'bs_std_' + vid
    sc = next(x for x in std['scenarios'] if x['id'] == sid)
    fills = std['fills'][sid]
    v = next(x for x in vp['verticals'] if x['id'] == vid)
    cat_of = {val[1]: c for c, val in prod.P.items()}
    k, title, page, rows = 0, '', 0, []
    for g in sc['flow']:
        for x in g['slides']:
            o = fills[k]; k += 1
            if x['f'].startswith('L_VS_MAP_'): title, page = o['t']['1'], k
            if x['f'] == 'L_VS_SPACE': rows.append(o['t'])
    spaces = []
    for sp, t in list(zip(v['spaces'], rows))[:n]:
        if sp['name'] != t['1']: raise ValueError(f'{vid}: 공간 순서가 다릅니다 — {sp["name"]} / {t["1"]}')
        first = cat_of[t['4']]
        cats = [first] + [c for c in sp['products'] if c in prod.P and c != first]
        spaces.append({'name': sp['name'], 'note': t['2'], 'products': [{'name': prod.SHORT.get(c) or prod.P[c][1], 'cat': c, 'src': prod.image_of(c)} for c in cats]})
    return {'n': n, 'vertical': vid, 'title': title, 'foot': rows[0]['10'], 'page': page, 'spaces': spaces}


def data_uri(address, kind, limit):
    """앱 이미지 주소(파일 · 묶음 #번호) → 줄인 webp data URI (긴 변 limit px 까지)"""
    import prod
    from PIL import Image
    im = prod._img(address) if '#' in address else Image.open(prod.STATIC + address)
    im = im.convert('RGBA' if kind == 'cut' else 'RGB')
    if max(im.size) > limit: im.thumbnail((limit, limit), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=80 if kind == 'cut' else 74, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


DOC = ('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">'
       '<style>html,body{margin:0;width:1280px;height:720px;overflow:hidden}*{box-sizing:border-box}</style></head><body>%s</body></html>')


def main():
    sheets = build_all()
    items = example_products()
    foot = items[0]['foot']
    images, key_of = {}, {}

    def ref(im, kind, limit):
        a = im['src']
        if a not in key_of:
            key_of[a] = f'@img{len(key_of)}@'
            images[key_of[a]] = data_uri(a, kind, limit)
        return key_of[a]

    if len(items) < sum(m['per'] for m, _, _ in sheets): raise ValueError(f'{EXAMPLE}: 공간이 모자랍니다 ({len(items)})')
    photos = [p['photo']['src'] for p in items[:sum(m['per'] for m, _, _ in sheets)]]
    if len(set(photos)) != len(photos): raise ValueError(f'{EXAMPLE}: 같은 공간 사진이 두 번 나옵니다')
    out, at = [], 0
    # 사진 크기 — 장에서 차지하는 칸 너비의 1.5배쯤(제품 1개 장은 크게 보기에서도 또렷하게)
    # 제품 컷은 한 크기로 — 제품 장과 Map 이 같은 그림(같은 주소)을 한 번만 담아 함께 쓴다
    PHOTO_PX, CUT_PX = {1: 900, 2: 800, 3: 560, 4: 420}, 340
    for m, html, schema in sheets:
        n = m['per']
        mine = items[at:at + n]; at += n
        t, img, specs = example_fill(m['f'], schema, mine, foot, 11 + mine[0]['no'])
        missing = [i for i in range(schema['nT']) if not str(t.get(i, '')).strip()]
        if missing: raise ValueError(f'{m["f"]}: 빈 글 칸 {missing}')
        kinds = {i: ('cut' if i % 2 == 0 else 'space') for i in range(schema['nI'])}
        filled = fill_html(html, {str(i): v for i, v in t.items()}, {str(i): ref(v, kinds[i], CUT_PX if kinds[i] == 'cut' else PHOTO_PX[n]) for i, v in img.items()})
        out.append({'f': m['f'], 'kind': 'space', 'code': m['code'], 'name': m['name'], 'when': m['when'], 'per': n, 'nT': m['nT'], 'nI': m['nI'], 'html': DOC % filled})
        for name, rows in specs.items(): print(m['f'], name, rows)
    # 업종 Map 예시 자료 — 제품 컷은 작게(카드가 작다). 장은 앱 모듈(space_map_sheet.js)이 이 자료로 조립한다
    vp = json.load(open(ROOT + '/app/data/vertical_space_product.json', encoding='utf-8'))
    std = json.load(open(ROOT + '/app/web/src/domain/templates/standard_vertical_scenarios.json', encoding='utf-8'))
    maps = []
    for n, vid in sorted(MAP_EXAMPLES.items()):
        ex = map_example(n, vid, std, vp)
        for sp in ex['spaces']:
            for pr in sp['products']:
                pr['img'] = ref({'src': pr.pop('src')}, 'cut', 220); pr.pop('cat')
        maps.append(ex)
        print(f'L_VS_MAP_{n}', vid, [len(sp['products']) for sp in ex['spaces']])
    dest = os.environ.get('OUT')
    path = os.path.join(dest, 'space-sheets.json') if dest else ROOT + '/admin/web/src/space-sheets.json'
    doc = {'note': '공간별 대표 제품 장 4종(제품 1 · 2 · 3 · 4개 — sheets: 예시를 채운 HTML, 예시 ' + EXAMPLE + ') · 업종 Map 예시 자료(maps: 공간 2~8곳, 공간마다 제품 여러 개 — 장은 space_map_sheet.js 가 조립). 생성: app/scripts/vertical_standard/space_sheets.py',
           'example': EXAMPLE, 'sheets': out, 'maps': maps, 'images': images}
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False)
    if dest:
        for s in out:
            page = s['html']
            for k, v in images.items(): page = page.replace(k, v)
            open(os.path.join(dest, f'sheet-{s["f"]}.html'), 'w', encoding='utf-8').write(page)
    print(len(out), '장 →', path, f'({os.path.getsize(path) // 1024} KB, 사진 {len(images)}장)')


if __name__ == '__main__':
    main()
