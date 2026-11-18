# -*- coding: utf-8 -*-
"""업종별 고정 Overview 시트 (01 Overview — Device · Solution · Service) → admin/web/src/overview-sheets.json

Overview 는 업종마다 쓰는 제품 · 솔루션이 크게 다르다. 그래서 업종 묶음(외식 · 의료 · 교육 · 오피스 … toc_content.json 의 g)마다
레이아웃(같은 계열, 칸 수가 다름)과 내용이 정해진 **고정 시트** 한 장을 만든다. 세부 업종(상급종합 · 중소 병원 · 의원 · 요양)은 같은 묶음의 시트를 쓴다.
만든 시트는 내용을 채우거나 고치지 않고 그대로 쓰는 장이다 — 꼬리말(고객사 · 덱 이름 · 쪽)만 덱마다 바뀐다.

  내용     디바이스 = 그 업종 세부 업종의 과반이 공간에 놓는 제품 계열(prod.families), 공간 수가 많은 순, 3–8개 · 계열마다 가장 많이 놓이는 제품의 컷
           솔루션   = 과반이 쓰는 솔루션(서비스 svc_* 제외), 공간 수가 많은 순, 2–8개
           서비스   = 업종 맞춤 컨설팅 · 공조 케어(과반이 에어컨 케어 서비스를 쓰면) 또는 설치 · 시공 · 보증 연장(과반이 삼성케어플러스를 쓰면) 또는 B2B A/S
           과반에 드는 것이 모자라면(세부 업종끼리 많이 다른 묶음) 순위대로 채운다.
  레이아웃  L_VS_DSS 와 같은 계열 — 왼쪽 DEVICE · 가운데 삼성 AI 비즈니스 도식 · 오른쪽 SOLUTION · 아래 SERVICE.
           가운데 도식: 삼성 AI 비즈니스(가운데 원)를 Device · Solution · Service 가 궤도에서 둘러싸고 저마다 자기 영역(왼쪽 · 오른쪽 · 아래)으로 이어진다.
           솔루션 이름 앞에는 그 솔루션을 가장 잘 보여 주는 아이콘을 둔다(SOL_ICON) — 구분 점은 쓰지 않는다.
           항목이 5개까지면 한 줄씩(칸 높이가 늘어난다), 6–8개면 두 줄 격자(패널이 넓어지고 가운데 도식이 줄어든다).

지금은 관리자 「레이아웃 구성 관리」의 '전체 파트 확인하기' 팝업만 이 파일을 읽는다(admin/web/src/overview-industry.jsx — 화면 번들에 함께 실린다).
실제 덱의 Overview 장은 아직 L_VS_DSS 를 세부 업종마다 채운다(실제 덱 반영 전).
제품 컷은 파일 안에 작게(긴 변 240px) 담는다 — 장의 img 는 '@imgN@' 표식, images 가 표식 → 그림, sources 가 표식 → 원래 주소.

  python app/scripts/vertical_standard/overview_industry.py          # admin/web/src/overview-sheets.json 을 다시 쓴다
  python app/scripts/vertical_standard/overview_industry.py --check  # 다시 만든 값과 파일이 같은지만 본다(다르면 종료 코드 1 · 그림 바이트는 견주지 않는다)
Pillow 가 필요하다(관리자 실행 환경 admin/runtime/python 에 있다) — PYTHONPATH=admin/runtime/python app/.venv/bin/python -B …
"""
import base64, collections, io, json, math, os, sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prod
from layouts import B, header, footer, esc, BLUE, INK, SURF, TINT, LB, MAN
from paths import ROOT
from sols import SOL

TARGET = ROOT + '/admin/web/src/overview-sheets.json'
SUB = '최적의 Device · Solution · Service로 고객이 언제 어디서나 AI를 누리도록, 차별적 비즈니스 가치와 지속 성장을 지원합니다.'
# 제목의 '{어디}에 필요한 AI' — 업종 묶음을 한 낱말로
PLACE = {'FB': '외식 매장', 'RT': '리테일 매장', 'SV': '생활 서비스 매장', 'HT': '호텔', 'TP': '관광 · 전시 공간', 'VN': '경기장 · 공연장', 'SF': '스포츠 시설',
         'AD': '옥외 광고', 'OF': '오피스', 'RS': '주거 단지', 'ID': '인테리어 현장', 'ED': '학교', 'PB': '공공 시설', 'MI': '군 시설', 'MD': '병원',
         'MF': '제조 · 물류 현장', 'FN': '금융 공간', 'OE': '통신 매장', 'RG': '종교 시설', 'MB': '방송 스튜디오'}
DEVICES, SOLUTIONS = (3, 8), (2, 8)  # (적어도, 많아도)
ONE_COLUMN = 5                       # 여기까지는 한 줄씩, 넘으면 두 줄 격자
TOP, AREA, GAP = 202, 354, 6         # 패널 안 항목 영역(위 · 높이) · 칸 사이


def load():
    read = lambda p: json.load(open(ROOT + p, encoding='utf-8'))
    return read('/app/data/vertical_space_product.json'), read('/app/data/vertical_space_solution.json'), read('/app/web/src/domain/templates/toc_content.json')


def pick(rows, nverts, lo, hi):
    """rows [(key, spaces, verts, order)] → 과반(verts*2 > nverts)인 것을 공간 수 순으로 hi 개까지, 모자라면 순위대로 lo 개까지"""
    rows = sorted(rows, key=lambda r: (-r[1], -r[2], r[3]))
    out = [r for r in rows if r[2] * 2 > nverts][:hi]
    for r in rows:
        if len(out) >= lo: break
        if r not in out: out.append(r)
    return sorted(out, key=lambda r: (-r[1], -r[2], r[3]))


def content(gid, vids, VP, VS):
    """업종 묶음 하나의 디바이스 · 솔루션 · 서비스"""
    catgroup = {c['id']: g['id'] for g in VP['product_taxonomy'] for c in g.get('categories', [])}
    vp = [v for v in VP['verticals'] if v['id'] in vids]
    vs = [v for v in VS['verticals'] if v['id'] in vids]
    assert len(vp) == len(vids) == len(vs), gid
    n = len(vids)
    rows = []
    for i, (key, name, test) in enumerate(prod.families(catgroup)):
        spaces = sum(1 for v in vp for sp in v['spaces'] if any(test(c) for c in sp['products']))
        cats = collections.Counter(c for v in vp for sp in v['spaces'] for c in sp['products'] if test(c) and c in prod.P)
        if not spaces or not cats: continue
        verts = sum(1 for v in vp if any(test(c) for sp in v['spaces'] for c in sp['products']))
        rows.append(((key, name, max(cats, key=lambda c: (cats[c], prod.PRI.get(c, 0)))), spaces, verts, i))
    devices = []
    for (key, name, cat), spaces, verts, _ in pick(rows, n, *DEVICES):
        devices.append({'key': key, 'name': name, 'category': cat, 'product': prod.P[cat][1], 'image': prod.image_of(cat),
                        'fit': 'cover' if cat in prod.PHOTO else 'contain', 'spaces': spaces, 'verticals': verts})
    use = collections.defaultdict(lambda: [0, set()])  # 솔루션 → [공간 수, 세부 업종]
    for v in vs:
        for sp in v['spaces']:
            for sid in {s['solution'] for s in sp.get('solutions', [])}:
                use[sid][0] += 1; use[sid][1].add(v['id'])
    order = list(SOL)
    rows = [(sid, c, len(w), order.index(sid)) for sid, (c, w) in use.items() if not sid.startswith('svc_')]
    solutions = [{'key': sid, 'name': SOL[sid][0], 'icon': SOL_ICON[sid], 'spaces': spaces, 'verticals': verts} for sid, spaces, verts, _ in pick(rows, n, *SOLUTIONS)]
    most = lambda sid: sid in use and len(use[sid][1]) * 2 > n
    services = ['업종 맞춤 컨설팅', '공조 케어 · 전문 세척' if most('svc_sac') else '전문 설치 · 시공', '업무 기기 보증 연장' if most('svc_mobile') else 'B2B 전문 A/S']
    return devices, solutions, services


# ------------------------------------------------------------------ 아이콘 (24px 선 그림)
# 솔루션마다 그 솔루션이 하는 일을 가장 잘 보여 주는 그림 — 이름 앞에 놓는다(구분 점 대신)
ICON = {
    'hub': 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z M12 2.6a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z M4.6 16.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z M19.4 16.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z M12 6v3.2 M9.7 13.6L6 16.8 M14.3 13.6l3.7 3.2',
    'alert': 'M12 3l10 18H2z M12 10v5 M12 18v.5',
    'building': 'M5 21V4h10v17 M15 9h4v12 M8 8h4 M8 12h4 M8 16h4 M3 21h18',
    'air': 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h7',
    'sliders': 'M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1 M15 4v4 M9 10v4 M17 16v4',
    'wifi': 'M2.5 9a14 14 0 0 1 19 0 M5.8 12.6a9 9 0 0 1 12.4 0 M9 16.1a4.4 4.4 0 0 1 6 0 M12 19.5v.01',
    'home': 'M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-6h4v6',
    'cloud': 'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 7 18z',
    'play': 'M3 4h18v12H3z M8 20h8 M12 16v4 M10.5 7.6l4 2.4-4 2.4z',
    'tv': 'M3 5h18v12H3z M8 21h8 M12 17v4',
    'shield': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5',
    'heart': 'M12 20s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 6.9a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z',
    'cap': 'M2 9.5L12 5l10 4.5-10 4.5z M6 11.5V16c0 1.4 2.7 2.8 6 2.8s6-1.4 6-2.8v-4.5 M22 9.5V15',
    'laptop': 'M5 5h14v10H5z M2.5 19h19',
    'dex': 'M2.5 5h13v9h-13z M6 18h6 M9 14v4 M17.5 9h4v11h-4z',
    'print': 'M7 9V3h10v6 M6 18H4v-7h16v7h-2 M7 14h10v7H7z',
    'lock': 'M6 11h12v10H6z M9 11V7a3 3 0 0 1 6 0v4 M12 15v2',
    'card': 'M3 6h18v12H3z M3 10.5h18 M6.5 15h4',
    'cross': 'M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z',
    'scan': 'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M7 12h10',
    'calendar': 'M4 5h16v16H4z M4 10h16 M9 3v4 M15 3v4',
    'layers': 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
    'monitor': 'M3 4h18v12H3z M8 20h8 M12 16v4',
    'wrench': 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
}
SPARK = 'M12 2.5l2 6a2.4 2.4 0 0 0 1.5 1.5l6 2-6 2a2.4 2.4 0 0 0-1.5 1.5l-2 6-2-6A2.4 2.4 0 0 0 8.5 14l-6-2 6-2A2.4 2.4 0 0 0 10 8.5z'  # AI 표식(채운 별)
# 솔루션 → 아이콘: 기기 연결(hub) · 위험 알림 · 빌딩 관제 · 공조 · 제어 패널 · Wi-Fi · 집 · 클라우드 · 콘텐츠 재생 · TV · 보안 · 건강 · 수업 · 노트북 · 폰→화면 · 출력 · 출력 보안 · 결제 · 병원 · 스캔 · 예약
SOL_ICON = {'s_stp': 'hub', 's_safety': 'alert', 's_biot': 'building', 's_dms': 'air', 's_touch': 'sliders', 's_wifi': 'wifi', 's_sthome': 'home', 's_vxt': 'cloud', 's_magic': 'play',
            's_lynk': 'tv', 's_knox': 'shield', 's_health': 'heart', 's_class': 'cap', 's_bookee': 'laptop', 's_dex': 'dex', 's_counthru': 'print', 's_secuthru': 'lock', 's_pos': 'card',
            's_hospital': 'cross', 's_field': 'scan', 's_meeting': 'calendar'}


def svg(name, color, size, width=2):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0">'
            f'<path d="{ICON[name]}"></path></svg>')


# ------------------------------------------------------------------ 레이아웃
def cells(n, x, w):
    """항목 n 개의 칸 [(x, y, w, h)] — 5개까지 한 줄씩, 6–8개는 두 줄 격자(홀수면 마지막 칸이 두 칸 너비). 칸은 패널 높이를 나눠 채운다(적을수록 높다)."""
    cols = 1 if n <= ONE_COLUMN else 2
    rows = math.ceil(n / cols)
    h = (AREA - GAP * (rows - 1)) // rows
    top = TOP + (AREA - (h * rows + GAP * (rows - 1))) // 2
    cw = (w - 24 - 8 * (cols - 1)) // cols
    out = []
    for k in range(n):
        r, c = divmod(k, cols)
        wide = cols == 2 and k == n - 1 and n % 2
        out.append((x + 12 + (cw + 8) * c, top + (h + GAP) * r, w - 24 if wide else cw, h))
    return cols, out


IMAGES = collections.OrderedDict()  # 원래 주소 → 표식('@imgN@') — 같은 컷은 한 번만 담는다


def token(src):
    return IMAGES.setdefault(src, f'@img{len(IMAGES)}@')


def picture(src):
    """제품 컷 → 작은 webp data URI (묶음 주소 …json#k 또는 파일 주소)"""
    if '.json#' in src: im = prod._img(src)
    else: im = Image.open(next(p for p in (prod.STATIC + src, ROOT + '/' + src) if os.path.exists(p)))
    im = im.convert('RGBA'); im.thumbnail((240, 240), Image.LANCZOS)
    out = io.BytesIO(); im.save(out, 'WEBP', quality=84, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(out.getvalue()).decode()


def cut(b, x, y, w, h, src, name, fit):
    """정해진 제품 컷 — 그림은 표식으로 두고 파일의 images 에 한 번만 담는다"""
    i = b.ni; b.ni += 1
    b.raw(f'<div style="position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px; box-sizing: border-box; padding: 6px; overflow: hidden; border-radius: 8px; background: #ffffff;" '
          f'data-slot="Photo" data-img="{i}" data-kind="cut" data-hint="{esc(name)}"><img src="{token(src)}" alt="{esc(name)}" style="display: block; width: 100%; height: 100%; object-fit: {fit}; object-position: 50% 50%;"></div>')


def hub(b, cx, cy, left, right, bottom, small=False):
    """가운데 도식 — 삼성 AI 비즈니스(가운데 원)를 Device · Solution · Service 가 궤도에서 둘러싸고, 저마다 자기 영역으로 이어진다:
    Device → 왼쪽 DEVICE 패널(left), Solution → 오른쪽 SOLUTION 패널(right), Service → 아래 SERVICE 띠(bottom). small: 두 패널이 다 넓어 사이가 좁을 때."""
    ro, rn, rc = (108, 31, 62) if small else (132, 38, 80)   # 궤도 · 마디 · 가운데 원의 반지름
    rh = ro + rn + (6 if small else 12)                       # 바탕 원
    disc = lambda r, style: b.box(cx - r, cy - r, 2 * r, 2 * r, f'border-radius: 50%; {style}')
    line = '#c5cde6'
    # 바탕 — 가운데가 밝은 옅은 파랑
    disc(rh, 'background: radial-gradient(circle, #ffffff 0%, #f3f5fd 52%, #e6ebfb 100%);')
    # 이음선 — 마디에서 자기 영역까지(마디가 안쪽 끝을 덮는다), 영역 쪽 끝에 점
    b.box(left, cy - 1, cx - ro - left, 2, f'background: {line};')
    b.box(cx + ro, cy - 1, right - (cx + ro), 2, f'background: {line};')
    b.box(cx - 1, cy + ro, 2, bottom - (cy + ro), f'background: {line};')
    for x, y in [(left, cy), (right, cy)]:
        b.box(x - 4, y - 4, 8, 8, f'border-radius: 50%; background: {BLUE};')
    b.box(cx - 4, bottom - 4, 8, 8, f'border-radius: 50%; background: {LB};')
    # 궤도 — 점선 원 하나와 가운데 원을 감싸는 옅은 띠
    b.raw(f'<svg width="{2 * rh}" height="{2 * rh}" viewBox="{-rh} {-rh} {2 * rh} {2 * rh}" style="position: absolute; left: {cx - rh}px; top: {cy - rh}px; pointer-events: none;">'
          f'<circle r="{ro}" fill="none" stroke="#9fb0ea" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 8"></circle></svg>')
    disc(rc + (8 if small else 11), 'background: rgba(20,40,160,.10);')
    # 가운데 원 — 삼성 AI 비즈니스
    disc(rc, 'background: linear-gradient(150deg, #2f51e0 0%, #1428a0 54%, #0b1a74 100%);')
    b.text('fineprint' if small else 'utility', cx - rc, cy - (21 if small else 27), 2 * rc, 'SAMSUNG',
           f'font-family: {MAN}; font-weight: 800; letter-spacing: .22em; text-indent: .22em; color: {LB}; text-align: center; white-space: nowrap;', h=14 if small else 16, label=True)
    b.text('dense' if small else 'heading', cx - rc, cy - (5 if small else 7), 2 * rc, 'AI 비즈니스', 'font-weight: 800; color: #ffffff; text-align: center; white-space: nowrap;', h=22 if small else 26, label=True)
    # 궤도 위 AI 표식(12시) — 작은 흰 원에 별
    ra = 13 if small else 15
    b.box(cx - ra, cy - ro - ra, 2 * ra, 2 * ra, 'border-radius: 50%; background: #ffffff; display: flex; align-items: center; justify-content: center;',
          f'<svg width="{ra + 3}" height="{ra + 3}" viewBox="0 0 24 24" fill="{BLUE}" style="flex-shrink: 0"><path d="{SPARK}"></path></svg>')
    # 마디 — 흰 원(옅은 테두리 띠) 안에 아이콘 + 이름
    for label, name, (dx, dy) in [('Device', 'monitor', (-ro, 0)), ('Solution', 'layers', (ro, 0)), ('Service', 'wrench', (0, ro))]:
        nx, ny = cx + dx, cy + dy
        b.box(nx - rn - 5, ny - rn - 5, 2 * rn + 10, 2 * rn + 10, 'border-radius: 50%; background: rgba(20,40,160,.10);')
        size = 20 if small else 24
        b.box(nx - rn, ny - rn, 2 * rn, 2 * rn, f'border-radius: 50%; background: #ffffff; display: flex; justify-content: center; padding-top: {9 if small else 12}px;', svg(name, BLUE, size))
        b.text('fineprint' if small else 'utility', nx - rn, ny + (4 if small else 6), 2 * rn, label, f'font-family: {MAN}; font-weight: 800; color: {INK}; text-align: center; white-space: nowrap;', h=14 if small else 16, label=True)


def sheet(gid, place, devices, solutions, services):
    b = B('L_VS_DSS_' + gid)
    header(b, '01 · OVERVIEW', f'{place}에 필요한 AI, Device · Solution · Service로 한 번에', SUB)
    wd = 340 if len(devices) <= ONE_COLUMN else 420
    ws = 340 if len(solutions) <= ONE_COLUMN else 420
    lx, rx = 64, 1216 - ws
    head = f'font-family: {MAN}; font-weight: 800; letter-spacing: .08em; color: {BLUE}; white-space: nowrap;'
    name = f'font-weight: 700; color: {INK}; display: flex; align-items: center;'
    # DEVICE — 컷 + 계열 이름
    b.box(lx, 156, wd, 420, f'border-radius: 16px; background: {SURF};')
    b.text('label', lx + 20, 174, 200, 'DEVICE', head, h=19, label=True)
    dcols, boxes = cells(len(devices), lx, wd)
    for d, (x, y, w, h) in zip(devices, boxes):
        b.box(x, y, w, h, 'border-radius: 10px; background: #ffffff;')
        iw = min(110, max(76, round((h - 8) * 1.15))) if dcols == 1 else 56
        ih = min(h - 8, 106) if dcols == 1 else min(h - 12, 68)
        cut(b, x + 8 if dcols == 1 else x + 6, y + (h - ih) // 2, iw, ih, d['image'], d['product'], d['fit'])
        tx = x + (8 + iw + 16 if dcols == 1 else 6 + iw + 8)
        b.text('body' if dcols == 1 else 'dense', tx, y + 4, x + w - 8 - tx, d['name'], name + (' white-space: nowrap;' if dcols == 1 else ''), h=h - 8, fixed=True, label=True)
    # SOLUTION — 그 솔루션의 아이콘 + 이름 (구분 점은 쓰지 않는다)
    b.box(rx, 156, ws, 420, f'border-radius: 16px; background: {SURF};')
    b.text('label', rx + 20, 174, 200, 'SOLUTION', head, h=19, label=True)
    scols, boxes = cells(len(solutions), rx, ws)
    for s, (x, y, w, h) in zip(solutions, boxes):
        b.box(x, y, w, h, 'border-radius: 10px; background: #ffffff;')
        chip, left = (32, 8) if scols == 2 else (48 if h >= 100 else 40, 12)
        b.box(x + left, y + (h - chip) // 2, chip, chip, f'border-radius: {10 if chip >= 40 else 8}px; background: {TINT}; display: flex; align-items: center; justify-content: center;',
              svg(s['icon'], BLUE, {32: 18, 40: 22, 48: 26}[chip]))
        tx = x + left + chip + (8 if scols == 2 else 14)
        b.text('body' if scols == 1 else 'dense', tx, y + 4, x + w - 8 - tx, s['name'], name + (' white-space: nowrap;' if scols == 1 else ''), h=h - 8, fixed=True, label=True)
    # 가운데 도식 — 두 패널 사이 한가운데, 사이가 좁으면 줄인다. SERVICE 띠를 먼저 깔고(도식의 Service 선이 띠에 닿는다) 도식을 그린다
    b.box(64, 592, 1152, 56, f'border-radius: 14px; background: {BLUE};')
    gap = rx - (lx + wd)
    hub(b, lx + wd + gap // 2, 366, lx + wd, rx, 592, small=gap < 380)
    # SERVICE
    b.text('label', 84, 610, 80, 'SERVICE', f'font-family: {MAN}; font-weight: 800; letter-spacing: .08em; color: {LB}; white-space: nowrap;', h=19, label=True)
    for i, s in enumerate(services):
        x = 172 + 348 * i
        b.box(x, 602, 336, 36, 'border-radius: 18px; background: rgba(255,255,255,.14);')
        b.text('dense', x, 609, 336, s, 'font-weight: 700; color: #ffffff; text-align: center; white-space: nowrap;', h=22, label=True)
    footer(b)
    return b.html(), {'devices': len(devices), 'solutions': len(solutions), 'services': len(services), 'deviceColumns': dcols, 'solutionColumns': scols}


def build(pictures=True):
    IMAGES.clear()
    lacking = [sid for sid in SOL if not sid.startswith('svc_') and ICON.get(SOL_ICON.get(sid)) is None]
    assert not lacking, f'아이콘이 없는 솔루션: {lacking} — SOL_ICON 에 더한다'
    VP, VS, TOC = load()
    groups = collections.OrderedDict()
    for vid in TOC['order']: groups.setdefault(TOC['v'][vid]['g'], []).append(vid)
    assert {v['id'] for v in VP['verticals']} == set(TOC['order']) == {v['id'] for v in VS['verticals']}, '세부 업종 목록이 다르다'
    assert all(v['group'] == TOC['v'][v['id']]['g'] for v in VP['verticals']), '업종 묶음이 다르다'
    sheets = []
    for gid, vids in groups.items():
        devices, solutions, services = content(gid, vids, VP, VS)
        html, shape = sheet(gid, PLACE[gid], devices, solutions, services)
        sheets.append({'id': gid, 'name': TOC['g'][gid]['nm'], 'place': PLACE[gid], 'verticals': vids, 'layout': 'L_VS_DSS_' + gid, 'code': 'VS-DSS-' + gid,
                       'shape': shape, 'devices': devices, 'solutions': solutions, 'services': services, 'html': html})
    return {'v': 1, 'part': 'overview', 'base': 'L_VS_DSS',
            'note': '업종별 고정 Overview 시트 — app/scripts/vertical_standard/overview_industry.py 가 만든다. 손으로 고치지 않는다.', 'sheets': sheets,
            'sources': {t: src for src, t in IMAGES.items()}, 'images': {t: picture(src) if pictures else '' for src, t in IMAGES.items()}}


def dump(data):
    return json.dumps(data, ensure_ascii=False, indent=1) + '\n'


if __name__ == '__main__':
    if '--check' in sys.argv:
        bare = lambda d: {**d, 'images': sorted(d.get('images', {}))}  # 그림 바이트는 Pillow 판에 따라 달라질 수 있어 표식만 견준다
        same = os.path.exists(TARGET) and bare(json.load(open(TARGET, encoding='utf-8'))) == bare(build(pictures=False))
        print('admin/web/src/overview-sheets.json', '최신' if same else '다름 — overview_industry.py 를 다시 실행하세요')
        sys.exit(0 if same else 1)
    text = dump(build())
    open(TARGET, 'w', encoding='utf-8').write(text)
    for s in json.loads(text)['sheets']:
        sh = s['shape']
        print(f"{s['id']} {s['name']:<10} 디바이스 {sh['devices']}({sh['deviceColumns']}줄) · 솔루션 {sh['solutions']}({sh['solutionColumns']}줄) | " + ' · '.join(d['name'] for d in s['devices']) + ' | ' + ' · '.join(x['name'] for x in s['solutions']))
