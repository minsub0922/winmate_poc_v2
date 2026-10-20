# 새 레이아웃 — 공간 지도(모자이크 + 범례) · Map · 솔루션 장. 기본 문구는 각 덱 원본 그대로(띄어쓰기만 바로잡음).
# 이미지 주소 '@key' 는 build 단계에서 묶음 주소(img/fill/x.json#k) 또는 앱 기존 주소로 바뀜.
import sys; sys.path.insert(0, '/home/claude/v3')
from std import *

FOOT = {'ST': 'AI 스토어 · 매장 AI 솔루션 제안 · 사진: samsung.com', 'OF': 'AI 오피스 · 오피스 AI 솔루션 제안 · 사진: samsung.com', 'AP': 'AI 아파트 · 주거 AI 솔루션 제안 · 사진: samsung.com'}
LAYS = {}
def reg(fn):
    LAYS[fn.__name__] = fn; return fn

# ---------------------------------------------------------------- 공간 지도: 사진 모자이크 + 공간 · 제품 범례
def space_overview(fid, deck, eb, title, sub, spaces, page, cols=None):
    """spaces = [(공간 이름, [제품...], '@사진key', 'object-position')]"""
    s = L(fid); s.head(eb, title, sub)
    n = len(spaces); X0, Y0, W, H, G = 64, 156, 700, 492, 12
    if n == 4: rows = [2, 2]
    elif n == 5: rows = [2, 3]
    elif n == 6: rows = [3, 3]
    else: rows = [n]
    k = 0; rh = (H - G * (len(rows) - 1)) / len(rows)
    for ri, c in enumerate(rows):
        cw = (W - G * (c - 1)) / c
        for ci in range(c):
            name, prods, img, pos = spaces[k]
            x, y = X0 + ci * (cw + G), Y0 + ri * (rh + G)
            s.photo(x, y, cw, rh, img, f'{name} 공간 사진', r=14, pos=pos, badge=False)
            s.pill(x + 10, y + rh - 42, k + 1, name)
            k += 1
    # 범례 패널
    s.box(788, 156, 428, 492, bg=SURF, r=16)
    s.raw(f'<div style="position: absolute; left: 812px; top: 176px">' + s.tb(f'font-size: 11.5px; font-weight: 800; letter-spacing: 0.06em; color: {MUTE}; white-space: nowrap', '공간 · 제품') + '</div>')
    # 두 칸으로 나누어 담기(높이 균형)
    hgt = [34 + 10 + 23 * len(p) + 18 for _, p, _, _ in spaces]
    tot = sum(hgt); split = 0; acc = 0
    for i, h in enumerate(hgt):
        if acc + h / 2 > tot / 2 and i > 0: split = i; break
        acc += h
    else: split = (n + 1) // 2
    if cols == 1: split = n
    columns = [list(range(split)), list(range(split, n))]
    nst = ('width: 24px; height: 24px; flex-shrink: 0; font-family: Manrope, sans-serif; border-radius: 9999px; background: #1428a0; color: #ffffff; font-size: 12px; '
           'font-weight: 800; display: flex; align-items: center; justify-content: center')
    for ci, idxs in enumerate(columns):
        y = 208; x = 812 + ci * 200
        for i in idxs:
            name, prods, _, _ = spaces[i]
            inner = (f'<div style="display: flex; align-items: center; gap: 8px">' + s.tb(nst, str(i + 1)) +
                     s.tb(f'font-size: 15.5px; font-weight: 800; color: {INK}; white-space: nowrap', name, 'span') + '</div>'
                     '<div style="margin-top: 10px; padding-left: 4px; display: flex; flex-direction: column; gap: 5px">')
            for p in prods:
                inner += ('<div style="display: flex; gap: 8px; align-items: baseline"><i style="width: 5px; height: 5px; border-radius: 50%; background: #1428a0; flex-shrink: 0; transform: translateY(-2px)"></i>'
                          + s.tb(f'font-size: 12.5px; line-height: 1.45; color: {INK2}', p, 'span') + '</div>')
            inner += '</div>'
            s.raw(f'<div style="position: absolute; left: {x}px; top: {y}px; width: 188px">' + inner + '</div>')
            y += 34 + 10 + 23 * len(prods) + 18 + (6 if len(prods) > 2 else 0)
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- Map: 공간 묶음 × 제품 컷 카드
def space_map(fid, deck, eb, title, sub, rows, page):
    """rows = [[(번호, 공간, [(제품 이름(<br> 가능), '@컷key')...]), ...], ...] — 두 줄"""
    s = L(fid); s.head(eb, title, sub)
    Y0, H = 156, 492; GAP = 16; rh = (H - GAP * (len(rows) - 1)) / len(rows)
    pad, cg = 14, 10
    def _cw(groups):
        ncard = sum(len(g[2]) for g in groups); ng = len(groups)
        return (1152 - (ng - 1) * GAP - ng * 2 * pad - sum(len(g[2]) - 1 for g in groups) * cg) / ncard
    CW = min(min(_cw(g) for g in rows), 200)
    nst = ('width: 24px; height: 24px; flex-shrink: 0; font-family: Manrope, sans-serif; border-radius: 9999px; background: #1428a0; color: #ffffff; font-size: 12px; '
           'font-weight: 800; display: flex; align-items: center; justify-content: center')
    for ri, groups in enumerate(rows):
        y = Y0 + ri * (rh + GAP)
        ncard = sum(len(g[2]) for g in groups); ng = len(groups)
        cw = CW
        used = ng * 2 * pad + sum(len(g[2]) - 1 for g in groups) * cg + ncard * cw + (ng - 1) * GAP
        x = 64 + (1152 - used) / 2
        for num, name, prods in groups:
            gw = 2 * pad + len(prods) * cw + (len(prods) - 1) * cg
            s.box(x, y, gw, rh, bg=SURF, r=16)
            s.raw(f'<div style="position: absolute; left: {f(x + pad)}px; top: {f(y + 14)}px; display: flex; align-items: center; gap: 8px">' + s.tb(nst, str(num)) +
                  s.tb(f'font-size: 15px; font-weight: 800; color: {INK}; white-space: nowrap', name, 'span') + '</div>')
            cx = x + pad
            for pname, key in prods:
                ch = rh - 56 - 12
                s.box(cx, y + 52, cw, ch, bg='#ffffff', r=12)
                ih = ch - 58
                s.photo(cx + 10, y + 62, cw - 20, ih, key, f'{plain(pname)} 제품 컷', kind='cut', r=0, fit='contain', badge=False)
                s.text(cx + 6, y + 62 + ih + 6, pname, 12.5, w=cw - 12, weight=700, color=INK, lh=1.35, align='center')
                cx += cw + cg
            x += gw + GAP
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- 솔루션 소개(풀블리드 사진 + 캡션 패널 · 기능 2)
def sol_intro2(fid, deck, eb, lead, name, feats, img, hint, page, pos='50% 50%', tag=None):
    """feats = [(icon, 라벨, 설명 html)] — L_AIS_24 와 같은 모양, 기능 2개"""
    s = L(fid, bg=INK)
    s.photo(0, 0, 1280, 720, img, hint, kind='ui', r=0, pos=pos, badge=False)
    s.box(0, 0, 1280, 720, bg='rgba(10,14,24,0.18)')
    s.box(640, 64, 576, 584, bg='rgba(12,16,26,0.74)', r=16)
    s.text(676, 96, eb, 13, weight=700, color=LB, nowrap=True, extra='letter-spacing: 0.06em', name='eb')
    s.text(676, 124, lead, 21, w=504, weight=700, color='#ffffff', lh=1.45, name='lead')
    s.text(674, 214, name, 56, weight=800, color='#ffffff', lh=1.15, nowrap=True, extra="font-family: Manrope, 'Noto Sans KR', sans-serif; letter-spacing: -0.02em", name='name')
    y = 318
    if tag is not None:
        s.text(678, 284, tag, 13, weight=600, color='rgba(255,255,255,0.7)', nowrap=True, extra="font-family: Manrope, 'Noto Sans KR', sans-serif; letter-spacing: 0.04em", name='tag')
        y = 330
    for k, (ic, lab, desc) in enumerate(feats):
        s.box(676, y, 504, 1, bg='rgba(255,255,255,0.18)')
        s.icon(676, y + 18, ic, size=44, r=12, bg='rgba(255,255,255,0.12)', color='#ffffff', isz=22)
        s.raw(f'<div style="position: absolute; left: 736px; top: {y + 18}px">' + s.tb('height: 30px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.55); color: #ffffff; font-size: 13.5px; font-weight: 700; display: inline-flex; align-items: center; box-sizing: border-box; white-space: nowrap', lab, name=f'lab{k}') + '</div>')
        s.raw(f'<div style="position: absolute; left: 736px; top: {y + 58}px; width: 444px">' + s.tb('font-size: 15px; line-height: 1.5; color: #d5d9e0', desc, name=f'desc{k}') + '</div>')
        y += 128
    s.box(0, 662, 1280, 58, bg='rgba(10,14,24,0.62)')
    s.foot(FOOT[deck], page, dark=True)
    return s

# ---------------------------------------------------------------- 화면 2장 + 캡션 (STP 에너지 · 멀티사이트)
def ui_two(fid, deck, eb, title, sub, shots, page, note=None):
    """shots = [('@key', 너비 비율, 캡션 html, hint)] 2장"""
    s = L(fid); s.head(eb, title, sub)
    s.box(64, 156, 1152, 492, bg=TINT, r=16)
    tot = sum(r for _, r, _, _ in shots); gw = 1152 - 64 - 24 * (len(shots) - 1)
    x = 96
    for k, (key, r, cap, hint) in enumerate(shots):
        w = gw * r / tot
        s.photo(x, 188, w, 340, key, hint, kind='ui', r=12, badge=False, bg='#ffffff', fit='contain', name=f'shot{k}')
        s.raw(f'<div style="position: absolute; left: {f(x)}px; top: 548px; width: {f(w)}px; height: 68px; border-radius: 12px; background: {BLUE}; display: flex; align-items: center; justify-content: center">'
              + s.tb('font-size: 16px; font-weight: 700; line-height: 1.4; color: #ffffff; text-align: center', cap, name=f'cap{k}') + '</div>')
        x += w + 24
    if note is not None:
        s.text(64, 652, note, 10, w=1152, color=MUTE, lh=1.4, nowrap=True, name='note')
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- 큰 화면 + 기능 카드 3 (VXT Canvas)
def ui_feat3(fid, deck, eb, title, sub, img, hint, brand, feats, page):
    """feats = [(icon, 제목, 설명 html)] 3개"""
    s = L(fid); s.head(eb, title, sub)
    s.photo(64, 156, 640, 492, img, hint, kind='ui', r=16, badge=False, bg=SURF)
    s.text(736, 160, brand, 30, weight=800, color=BLUE, nowrap=True, extra="font-family: Manrope, 'Noto Sans KR', sans-serif; letter-spacing: -0.01em")
    y = 224
    for i, (ic, t, d) in enumerate(feats):
        s.card(736, y, 480, 132)
        s.icon(758, y + 22, ic, size=56, r=14)
        s.num(1180, y + 14, i + 1)
        s.text(832, y + 24, t, 18, w=330, weight=800, color=INK, nowrap=True)
        s.text(832, y + 56, d, 14, w=360, color=INK2, lh=1.55)
        y += 144
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- 가운데 관리 화면 + 지점 화면 6 (VXT 원격 제어)
def hub_six(fid, deck, eb, title, sub, center, chint, branches, page, hub_label):
    """branches = [('@key', 지점 이름)] 6개"""
    s = L(fid); s.head(eb, title, sub)
    s.box(64, 156, 1152, 492, bg=SURF, r=16)
    s.photo(400, 176, 480, 252, center, chint, kind='ui', r=12, badge=False, bg='#ffffff')
    s.raw(f'<div style="position: absolute; left: 400px; top: 436px; width: 480px; display: flex; justify-content: center">' +
          s.tb(f'height: 30px; padding: 0 16px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 13.5px; font-weight: 700; display: inline-flex; align-items: center; white-space: nowrap', hub_label) + '</div>')
    # 연결선: 가운데에서 아래 버스로
    s.vline(640, 466, 22, color=BLUE, t=2)
    bw, gap = 168, 16; x0 = 64 + (1152 - (6 * bw + 5 * gap)) / 2
    s.hline(x0 + bw / 2, 488, 5 * (bw + gap), color=BLUE, t=2)
    for i, (key, name) in enumerate(branches):
        x = x0 + i * (bw + gap)
        s.vline(x + bw / 2, 488, 14, color=BLUE, t=2)
        s.photo(x, 502, bw, 100, key, f'{name} 매장 화면', r=10, badge=False)
        s.text(x, 610, name, 14, w=bw, weight=800, color=INK, align='center', nowrap=True)
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- 사진 카드 6 (세대 내 가전 관리 자동화)
def cards_six(fid, deck, eb, title, sub, cards, page, note=None):
    """cards = [(모드 이름, 한 줄 요약, 설명, '@key')] 6개"""
    s = L(fid); s.head(eb, title, sub)
    cw, ch, gx, gy = 368, 238, 24, 16
    for i, (mode, head, desc, key) in enumerate(cards):
        x, y = 64 + (i % 3) * (cw + gx), 156 + (i // 3) * (ch + gy)
        s.card(x, y, cw, ch)
        s.photo(x + 1, y + 1, 140, ch - 2, key, f'{mode} 장면 사진', r=15, badge=False)
        s.raw(f'<div style="position: absolute; left: {x + 156}px; top: {y + 18}px">' + s.tb(f'height: 26px; padding: 0 12px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 12.5px; font-weight: 700; display: inline-flex; align-items: center; white-space: nowrap', mode) + '</div>')
        s.text(x + 156, y + 56, head, 15.5, w=cw - 172, weight=800, color=INK, lh=1.4)
        s.text(x + 156, y + 124, desc, 12.5, w=cw - 172, color=GRAY, lh=1.55)
    if note is not None: s.text(64, 652, note, 10, w=1152, color=MUTE, lh=1.4, nowrap=True)
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- 오피스 P26 효율적인 빌딩 통합 관리 (플랫폼 3 · 컨트롤러 · 설비군 4)
def biot_stack(fid, deck, eb, title, sub, plats, ctrls, groups, page, bus_label):
    """plats = [(이름, 부제, '@화면')] 3 · ctrls = [컨트롤러 이름] 4 · groups = [(설비군 이름, 항목 문장, '@사진')] 4"""
    s = L(fid); s.head(eb, title, sub)
    pw, gx = 368, 24
    for i, (nm, sb, key) in enumerate(plats):
        x = 64 + i * (pw + gx)
        s.card(x, 156, pw, 168)
        s.photo(x + 12, 168, 144, 144, key, f'{plain(nm)} 화면', kind='ui', r=10, badge=False, bg=SURF)
        s.text(x + 172, 196, nm, 17, w=pw - 184, weight=800, color=INK, lh=1.35)
        s.text(x + 172, 252, sb, 12.5, w=pw - 184, color=GRAY, lh=1.5)
    # 버스
    s.box(64, 338, 1152, 34, bg=BLUE, r=10)
    s.text(64, 344, bus_label, 14, w=1152, weight=700, color='#ffffff', align='center', nowrap=True)
    gw = (1152 - 3 * 16) / 4
    for i, c in enumerate(ctrls):
        x = 64 + i * (gw + 16)
        s.vline(x + gw / 2, 372, 18, color=BLUE, t=2)
        s.raw(f'<div style="position: absolute; left: {f(x)}px; top: 386px; width: {f(gw)}px; display: flex; justify-content: center">' +
              s.tb(f'height: 26px; padding: 0 14px; border-radius: 999px; border: 1.5px solid {BLUE}; background: #ffffff; color: {BLUE}; font-size: 12.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap; font-family: Manrope, \'Noto Sans KR\', sans-serif', c) + '</div>')
    for i, (nm, items, key) in enumerate(groups):
        x = 64 + i * (gw + 16)
        s.vline(x + gw / 2, 412, 12, color=BLUE, t=2)
        s.card(x, 424, gw, 224)
        s.photo(x + 1, 425, gw - 2, 118, key, f'{plain(nm)} 사진', r=15, badge=False)
        s.text(x + 16, 554, nm, 15.5, w=gw - 32, weight=800, color=INK, nowrap=True)
        s.text(x + 16, 582, items, 12.5, w=gw - 32, color=GRAY, lh=1.5)
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- 오피스 P27 오픈 프로토콜 (메시지 · 가운데 관제 화면 · 외부 시스템 · 하단 기기)
def open_protocol(fid, deck, eb, title, sub, message, center, center_label, ext, ext_protos, devices, page):
    """devices = [(기기 이름, 프로토콜 라벨, '@사진')] 3"""
    s = L(fid); s.head(eb, title, sub)
    s.box(64, 156, 344, 492, bg=BLUE, r=16)
    s.icon(96, 188, 'plug', size=56, r=14, bg='rgba(255,255,255,0.14)', color='#ffffff')
    s.text(96, 268, message, 30, w=290, weight=800, color='#ffffff', lh=1.35, extra='letter-spacing: -0.02em')
    s.box(432, 156, 784, 492, bg=SURF, r=16)
    # 가운데 관제 화면
    s.photo(464, 186, 420, 236, center, '통합 관제 화면', kind='ui', r=12, badge=False, bg='#ffffff')
    s.raw(f'<div style="position: absolute; left: 464px; top: 432px; width: 420px; display: flex; justify-content: center">' +
          s.tb(f'height: 30px; padding: 0 16px; border-radius: 999px; background: {INK}; color: #ffffff; font-size: 14px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap; font-family: Manrope, \'Noto Sans KR\', sans-serif', center_label) + '</div>')
    # 오른쪽 외부 시스템
    s.box(900, 290, 300, 2, bg=BLUE)
    s.raw(f'<div style="position: absolute; left: 1186px; top: 284px; width: 0; height: 0; border-top: 7px solid transparent; border-bottom: 7px solid transparent; border-left: 12px solid {BLUE}"></div>')
    s.text(904, 186, ext_protos, 13, w=200, weight=700, color=INK2, lh=1.6, extra="font-family: Manrope, 'Noto Sans KR', sans-serif")
    s.card(1104, 306, 96, 96)
    s.icon(1128, 318, 'grid', size=48, r=12)
    s.text(1104, 370, ext, 12.5, w=96, weight=800, color=INK, align='center', nowrap=True)
    # 아래 기기 3
    dw = (784 - 32 - 2 * 16) / 3
    s.hline(448 + dw / 2, 480, 2 * (dw + 16), color=BLUE, t=2)
    s.vline(674, 466, 14, color=BLUE, t=2)
    for i, (nm, proto, key) in enumerate(devices):
        x = 448 + i * (dw + 16)
        s.vline(x + dw / 2, 480, 20, color=BLUE, t=2)
        s.card(x, 500, dw, 132)
        s.photo(x + 1, 501, 120, 130, key, f'{nm} 사진', r=15, badge=False)
        s.text(x + 136, 524, nm, 15, w=dw - 148, weight=800, color=INK, lh=1.35)
        s.text(x + 136, 590, proto, 12.5, w=dw - 148, weight=700, color=BLUE, nowrap=True, extra="font-family: Manrope, 'Noto Sans KR', sans-serif")
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- 오피스 P28 AI 알고리즘 7단계 + 결론 띠(사진)
def algo_seven(fid, deck, eb, title, sub, steps, conclusion, band_img, page):
    """steps = [(icon, 제목, 설명 html)] 7"""
    s = L(fid); s.head(eb, title, sub)
    n = len(steps); cw = (1152 - (n - 1) * 10) / n
    for i, (ic, t, d) in enumerate(steps):
        x = 64 + i * (cw + 10)
        s.card(x, 156, cw, 330)
        s.icon(x + (cw - 64) / 2, 176, ic, size=64, r=32, bg=BLUE, color='#ffffff', isz=30)
        s.num(x + cw - 34, 166, i + 1, d=22, bg=TINT, color=BLUE, size=11)
        s.text(x + 10, 256, t, 15, w=cw - 20, weight=800, color=BLUE, lh=1.35, align='center')
        s.text(x + 12, 318, d, 12.5, w=cw - 24, color=INK2, lh=1.55, align='center')
    s.photo(64, 502, 1152, 146, band_img, '건물 · 설비 사진 (결론 띠 배경)', r=16, badge=False)
    s.box(64, 502, 1152, 146, bg='rgba(12,16,26,0.62)', r=16)
    s.text(64, 548, conclusion, 26, w=1152, weight=800, color='#ffffff', align='center', nowrap=True, lh=1.4, extra='letter-spacing: -0.01em')
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- 아파트 P25 스마트싱스 홈 (가운데 휴대폰 + 양옆 화면 · 기능 라벨)
def st_home(fid, deck, eb, title, sub, center, left, right, page, center_label):
    """left/right = ('@화면', [기능...]) — center = '@휴대폰 화면'"""
    s = L(fid); s.head(eb, title, sub)
    s.box(64, 156, 1152, 492, bg=TINT, r=16)
    def side(x, key, feats, hint):
        s.card(x, 176, 360, 452)
        s.photo(x + 16, 192, 328, 252, key, hint, kind='ui', r=10, badge=False, bg=SURF)
        y = 462
        for t in feats:
            s.icon(x + 20, y, 'home' if '단지' in t or '공용' in t else 'grid', size=32, r=9, isz=17)
            s.text(x + 64, y + 4, t, 15.5, w=280, weight=800, color=INK, nowrap=True)
            y += 52
    side(84, left[0], left[1], 'SmartThings 아파트 서비스 화면')
    side(836, right[0], right[1], 'SmartThings 우리집 화면')
    s.photo(474, 176, 332, 400, center, 'SmartThings 앱 화면 (휴대폰)', kind='ui', r=22, badge=False, fit='contain', bg='transparent')
    s.raw(f'<div style="position: absolute; left: 474px; top: 590px; width: 332px; display: flex; justify-content: center">' +
          s.tb(f'height: 32px; padding: 0 16px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; white-space: nowrap', center_label) + '</div>')
    s.foot(FOOT[deck], page)
    return s

# ---------------------------------------------------------------- 아파트 P26 단지 홈네트워크 연동 (세대 홈 IoT ↔ 휴대폰 ↔ 단지 홈네트워크)
def complex_link(fid, deck, eb, title, sub, left, right, center, center_label, page):
    """left/right = (칩 이름, 클라우드 이름, '@사진', [(구분, 항목)] 2)"""
    s = L(fid); s.head(eb, title, sub)
    def side(x, spec, hint):
        chip, cloud, key, cats = spec
        s.card(x, 156, 440, 492)
        s.photo(x + 1, 157, 438, 196, key, hint, r=15, badge=False)
        s.raw(f'<div style="position: absolute; left: {x + 16}px; top: 172px">' + s.tb(f'height: 30px; padding: 0 14px; border-radius: 999px; background: {CAP}; color: #ffffff; font-size: 14px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap', chip) + '</div>')
        s.icon(x + 24, 372, 'cloud', size=48, r=12)
        s.text(x + 86, 382, cloud, 19, w=330, weight=800, color=INK, nowrap=True, extra="font-family: Manrope, 'Noto Sans KR', sans-serif")
        y = 440
        for nm, items in cats:
            s.box(x + 24, y, 392, 92, bg=SURF, r=12)
            s.text(x + 40, y + 14, nm, 14.5, w=360, weight=800, color=BLUE, nowrap=True)
            s.text(x + 40, y + 42, items, 13, w=360, color=INK2, lh=1.5)
            y += 102
    side(64, left, '세대 홈 IoT 장면 사진')
    side(776, right, '단지 홈네트워크 장면 사진')
    # 가운데 휴대폰 + 양방향 화살표
    s.photo(540, 196, 200, 330, center, 'SmartThings 앱 화면 (휴대폰)', kind='ui', r=18, badge=False, fit='contain')
    for x0, x1 in ((508, 540), (740, 772)):
        s.box(x0, 360, x1 - x0, 2, bg=BLUE)
    s.raw(f'<div style="position: absolute; left: 504px; top: 354px; width: 0; height: 0; border-top: 7px solid transparent; border-bottom: 7px solid transparent; border-right: 10px solid {BLUE}"></div>')
    s.raw(f'<div style="position: absolute; left: 766px; top: 354px; width: 0; height: 0; border-top: 7px solid transparent; border-bottom: 7px solid transparent; border-left: 10px solid {BLUE}"></div>')
    s.raw(f'<div style="position: absolute; left: 520px; top: 542px; width: 240px; display: flex; justify-content: center">' +
          s.tb(f'height: 32px; padding: 0 16px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; white-space: nowrap', center_label) + '</div>')
    s.foot(FOOT[deck], page)
    return s
