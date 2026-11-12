# L_TOC_* — 목차 템플릿 sheets. One function per sheet design; variants only where a count changes the drawing.
# 표준 제안서와 이름이 같은 목차(Overview · AI 업종 · 공간별 제안 · 솔루션 · 도입사례 · Why Samsung)와 간지는 표준 제안서 장(L_VS_*)을 쓰므로 여기 없음.
import sys, math
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from base import *

FOOT = '외식 프랜차이즈 · AI 퀵서비스 공간 가치 제안서'
P = {  # sample pictures for the library preview (외식 프랜차이즈)
  'store': 'img/media/g0.json#690', 'counter': 'img/media/g0.json#635', 'hall': 'img/media/g0.json#703', 'kitchen': 'img/media/g0.json#593',
  'office': 'img/media/g1.json#143', 'edu': 'img/media/g0.json#431',
}
CUT = {'sig': 'img/bs/p-qm55c.png', 'kiosk': 'img/bs/p-km24c.png', 'ac': 'img/prod/g01.json#135', 'tab': 'img/prod/g07.json#168', 'fridge': 'img/prod/g06.json#42', 'out': 'img/bs/p-oh55a-s.png'}
ICO = lambda fid, on=True: f'/assets/toc/icons/{fid}.{"on" if on else "off"}.png'
META = []; HTML = {}; SLOTS = {}

def reg(s, name, when, p, p2=None, req=None, g=None, extra=None):
    m = {'f': s.fid, 'c': 'TC', 'code': s.fid[2:].replace('_', '-'), 'name': name, 'when': when, 'g': g or ('목차 템플릿 · ' + name.split(' · ')[0]),
         'p': p, 'p2': p2, 'ind': None, 'sol': None, 'sample': '외식 프랜차이즈', 'eb': s.texts[0] if s.texts else '', 'hl': s.texts[1] if len(s.texts) > 1 else '',
         'sub': '', 'foot': FOOT, 'nT': s.ntb, 'nI': s.nimg, 'ik': sorted(set(s.kinds)), 'ih': s.hints[:12], 'ph': sum(t.count('[') for t in s.texts),
         'phs': sorted(set(x for t in s.texts for x in re.findall(r'\[[^\]]{1,8}\]', t)))[:6], 'pc': s.kinds.count('cut'), 'req': req or [], 'prods': [], 'sols': [],
         'txt': ' '.join(t for t in s.texts if t)[:1600], 'pf': round(min(1.0, s.area / (1280 * 720)), 2), 'toc': True}
    if extra: m.update(extra)
    META.append(m); HTML[s.fid] = s.html(); SLOTS[s.fid] = {'t': s.names, 'img': s.imgnames}
    return s

def pill(s, x, y, n, label, name, dark=True):
    nst = (f'width: 26px; height: 26px; flex-shrink: 0; font-family: {NUMF}; border-radius: 9999px; background: {BLUE}; color: #ffffff; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center')
    s.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px"><div style="display: flex; align-items: center; gap: 9px; height: 36px; padding: 0 14px 0 5px; border-radius: 999px; background: {CAP if dark else "#ffffff"}">'
          + s.tb(nst, str(n), name=name + 'n') + s.tb(f'font-size: 15px; font-weight: 800; color: {"#ffffff" if dark else INK}; white-space: nowrap', label, 'span', name=name) + '</div></div>')

def numunit(s, x, y, w, val, unit, size=64, usize=22, color=BLUE, ucolor=GRAY, vname=None, uname=None):
    """big number + unit on one baseline (two text slots inside one flex row)"""
    s.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px; width: {f(w)}px; display: flex; align-items: baseline; gap: 8px; white-space: nowrap; overflow: hidden">'
          + s.tb(f'font-family: {NUMF}; font-size: {size}px; font-weight: 800; line-height: 1.0; letter-spacing: -0.03em; color: {color}', val, 'span', name=vname)
          + s.tb(f'font-size: {usize}px; font-weight: 800; line-height: 1.0; color: {ucolor}', unit, 'span', name=uname) + '</div>')

def round_arrow(s, x, y, d=36):
    s.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px; width: {d}px; height: {d}px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 12px rgba(18,20,23,0.16); display: flex; align-items: center; justify-content: center">' + svg_icon('arrow', 18, BLUE, 2.4) + '</div>')

# ------------------------------------------------------------------ 목차 (contents)
def index(n):
    s = T(f'L_TOC_INDEX{n}'); s.head2('CONTENTS', '목차')
    names = ['Overview', '퀵서비스 핵심 기술', '공간별 가치 제안', '도입사례', 'Why Samsung', '실행 계획', '구성 · 수량', '기대 효과'][:n]
    pics = [P['store'], P['counter'], P['hall'], P['kitchen'], P['office'], P['edu'], P['store'], P['hall']]
    rows = [n] if n <= 4 else [math.ceil(n / 2), n - math.ceil(n / 2)]
    k = 0; Y0 = 132; H = 516; G = 20
    rh = (H - G * (len(rows) - 1)) / len(rows)
    for ri, c in enumerate(rows):
        cw = (1152 - G * (c - 1)) / c; y = Y0 + ri * (rh + G)
        ph = rh - 92
        for ci in range(c):
            x = 64 + ci * (cw + G)
            s.pic(x, y, cw, ph, pics[k], f'{k+1}번째 목차 대표 사진', r=14, name=f'img{k}')
            s.t(x, y + ph + 16, 60, f'{k+1:02d}', 28, 800, BLUE, 1.0, name=f'no{k}', extra=f'font-family: {NUMF}')
            s.t(x + 58, y + ph + 18, cw - 58, names[k], 21, 800, INK, 1.25, name=f'nm{k}', clamp=2)
            k += 1
    s.foot2(FOOT, 2)
    return reg(s, f'목차 · {n}개 목차 사진 카드', f'제안서 첫머리에 목차 {n}개를 사진과 함께 보여 줄 때', 'cover', req=['images'])

# ------------------------------------------------------------------ 핵심 기술 (솔루션 only)
TECH_SAMPLE = [('VXT CMS', '전국 매장 화면을 클라우드로 한 번에', [('s_vxt.create.menu', '메뉴 제작', '템플릿으로 메뉴판을 바로 만듭니다'), ('s_vxt.ops.deploy', '원격 배포', '본사에서 전 매장에 동시에 내보냅니다'), ('s_vxt.rm.alert', '장애 경보', '꺼진 화면을 먼저 찾아 알려 줍니다')]),
               ('SmartThings Pro', '공조 · 가전 · 화면을 한 앱으로', [('s_stp.aisave.comfort', 'AI 절약', '쾌적함은 지키고 낭비 운전은 줄입니다'), ('s_stp.auto.rule', '운영 자동화', '시간 · 센서 조건으로 기기가 움직입니다'), ('s_stp.mgmt.multisite', '통합 관리', '여러 매장을 한 계정에서 봅니다')]),
               ('MagicINFO', '데이터와 연결된 사이니지', [('s_magic.data.realtime', '실시간 데이터', '가격 · 재고가 화면에 바로 반영됩니다'), ('s_magic.insight.pop', '재생 분석', '언제 무엇이 송출됐는지 증빙합니다'), ('s_magic.security.iso', '보안 인증', '국제 보안 인증을 받은 서버입니다')]),
               ('Knox', '매장 태블릿을 업무용으로', [('s_knox.deploy.configure', '일괄 설정', '받는 날부터 매장 화면으로 켜집니다'), ('s_knox.manage.kiosk', '전용 모드', '주문 앱 외 사용을 막습니다'), ('s_knox.ops.remote', '원격 지원', '현장 방문 없이 문제를 고칩니다')])]
def tech(n):
    s = T(f'L_TOC_TECH{n}'); s.head2('02 · 퀵서비스 핵심 기술', 'AI 퀵서비스를 움직이는 핵심 기술 네 가지' if n > 1 else 'AI 퀵서비스를 움직이는 핵심 기술, SmartThings Pro')
    data = TECH_SAMPLE[:n] if n > 1 else [TECH_SAMPLE[1]]
    if n == 1:
        nm, intro, kws = data[0]
        s.box(64, 128, 420, 520, bg=BLUE, r=18)
        s.ico(96, 160, 'layers', size=72, r=20, bg='rgba(255,255,255,0.14)', color='#ffffff')
        s.t(96, 268, 356, nm, 34, 800, '#ffffff', 1.25, name='nm0', clamp=2)
        s.t(96, 368, 356, intro, 21, 600, 'rgba(255,255,255,0.9)', 1.5, name='in0', clamp=3)
        for k, (fid, kw, line) in enumerate(kws):
            y = 128 + k * 176
            s.box(508, y, 708, 160, bg=SURF, r=18)
            s.pic(536, y + 36, 88, 88, ICO(fid), '키워드 아이콘', kind='icon', r=22, name=f'ki0_{k}')
            s.t(652, y + 38, 540, kw, 28, 800, INK, 1.25, name=f'kw0_{k}', nowrap=True)
            s.t(652, y + 86, 540, line, 19, 500, INK2, 1.45, name=f'kl0_{k}', clamp=2)
    else:
        G = 20; W = (1152 - G * (n - 1)) / n
        for i, (nm, intro, kws) in enumerate(data):
            x = 64 + i * (W + G)
            s.box(x, 128, W, 136, bg=BLUE, r=18)
            s.box(x, 246, W, 18, bg=BLUE)
            s.t(x + 26, 150, W - 52, nm, 24 if n <= 2 else (22 if n == 3 else 20), 800, '#ffffff', 1.25, name=f'nm{i}', nowrap=True)
            s.t(x + 26, 190, W - 52, intro, 16, 500, 'rgba(255,255,255,0.88)', 1.45, name=f'in{i}', clamp=2)
            s.box(x, 264, W, 384, bg='#ffffff', r=0, border=f'1px solid {LINE}', extra='border-top: none; border-radius: 0 0 18px 18px')
            big = n == 2
            for k, (fid, kw, line) in enumerate(kws):
                y = 284 + k * 120
                d = 64 if big else 56
                s.pic(x + 22, y + 4, d, d, ICO(fid), '키워드 아이콘', kind='icon', r=16, name=f'ki{i}_{k}')
                s.t(x + 22 + d + 16, y + 4, W - d - 60, kw, 22 if big else 19, 800, INK, 1.3, name=f'kw{i}_{k}', nowrap=True)
                s.t(x + 22 + d + 16, y + (38 if big else 34), W - d - 60, line, 17 if big else 15.5, 500, GRAY, 1.45, name=f'kl{i}_{k}', clamp=2)
    s.foot2(FOOT, 5)
    return reg(s, f'핵심 기술 · 솔루션 {n}개 × 키워드 3', '업종의 핵심 솔루션과 솔루션마다 키워드 세 가지를 한 장으로 소개할 때', 'solution', 'value', ['solutions'])

# ------------------------------------------------------------------ 공간별 가치 제안 (여정 + 솔루션 기능 on/off)
JSOL = [('VXT CMS', '메뉴보드 템플릿 · 스케줄 관리 · 원격 배포', ['s_vxt.create.menu', 's_vxt.ops.schedule', 's_vxt.ops.deploy', 's_vxt.rm.control', 's_vxt.rm.alert', 's_vxt.apps.pos', 's_vxt.rm.multi', 's_vxt.create.template'], [1, 1, 1, 0, 0, 1, 0, 0]),
        ('SmartThings Pro', 'AI 쾌적 제어 · 조건별 자동화', ['s_stp.auto.rule', 's_stp.aisave.comfort', 's_stp.auto.air', 's_stp.aisave.waste', 's_stp.display.remote', 's_stp.energy.report', 's_stp.mgmt.multisite', 's_stp.vertical.store'], [1, 1, 1, 0, 0, 0, 0, 0])]
def journey(m, ns):
    s = T(f'L_TOC_JOURNEY{m}{"" if ns == 2 else "S"}'); s.head2('03 · 공간별 가치 제안', '들어서는 순간부터 앉기까지, 손님의 첫 10분')
    sp = [('매장 입구·쇼윈도', '오픈과 동시에 외부 사이니지가 켜지고, 시간대 프로모션이 지나가는 손님을 매장으로 부릅니다.', P['store']),
          ('주문 카운터', '메뉴보드는 시간대별로 바뀌고 품절 메뉴는 화면에서 자동으로 내려갑니다.', P['counter']),
          ('객석', '피크 시간에는 AI 쾌적 제어로 냉방을 맞추고, 미세먼지가 오르면 공기청정기가 먼저 켜집니다.', P['hall'])][:m]
    if m == 1:
        s.pic(64, 128, 700, 324, sp[0][2], '공간 사진', r=16, name='ph0')
        s.box(784, 128, 432, 324, bg=TINT, r=16)
        s.num2(812, 156, 1, 40, 18)
        s.t(866, 158, 330, sp[0][0], 26, 800, INK, 1.3, name='st0', nowrap=True)
        s.t(812, 228, 380, sp[0][1], 21, 600, INK2, 1.6, name='sc0', clamp=6)
    else:
        W = (1152 - 28 * (m - 1)) / m
        for i, (nm, sc, ph) in enumerate(sp):
            x = 64 + i * (W + 28)
            s.pic(x, 128, W, 214, ph, '공간 사진', r=16, name=f'ph{i}')
            pill(s, x + 12, 128 + 214 - 50, i + 1, nm, f'st{i}')
            s.t(x, 356, W, sc, 17, 600, INK2, 1.55, name=f'sc{i}', clamp=4)
            if i < m - 1: round_arrow(s, x + W - 4, 217)
    BW = (1152 - 16) / 2 if ns == 2 else 1152; per = 8 if ns == 2 else 10
    for j in range(ns):
        bx = 64 + j * (BW + 16); by = 470
        nm, act, fids, on = JSOL[j]
        s.box(bx, by, BW, 178, bg=SURF, r=18)
        if ns == 2:
            s.t(bx + 24, by + 18, BW - 48, nm, 21, 800, INK, 1.3, name=f'sn{j}', nowrap=True)
            s.t(bx + 24, by + 50, BW - 48, act, 15, 700, BLUE, 1.4, name=f'sa{j}', nowrap=True)
            ix, iy, step, d = bx + 24, by + 96, 62, 52
        else:
            s.t(bx + 28, by + 44, 340, nm, 24, 800, INK, 1.3, name=f'sn{j}', nowrap=True)
            s.t(bx + 28, by + 84, 340, act, 16, 700, BLUE, 1.45, name=f'sa{j}', clamp=2)
            ix, iy, step, d = bx + 400, by + 57, 74, 64
        for k in range(per):
            fid = fids[k] if k < len(fids) else None
            src = ICO(fid, bool(on[k])) if fid else BLANK
            s.pic(ix + k * step, iy, d, d, src, '솔루션 기능 아이콘 (이 장에서 쓰는 기능만 색)', kind='icon', r=14, name=f'fi{j}_{k}')
    s.foot2(FOOT, 9)
    return reg(s, f'공간별 가치 제안 · 여정 {m}공간 + 솔루션 {ns} 기능 on/off', '공간 1~3곳을 이용자 여정으로 엮고, 이 장에서 쓰는 솔루션 기능만 켜서 보여 줄 때', 'scenario', 'solution', ['spaces', 'solutions', 'images'])

# ------------------------------------------------------------------ 당사의 이해 · 고객사 분석
def ua_profile():
    s = T('L_TOC_UAPROF'); s.head2('01 · 당사의 이해 · 고객사 분석', '외식 프랜차이즈, 지금 이런 규모로 움직입니다')
    s.pic(64, 128, 512, 520, P['store'], '고객 사업장 대표 사진', r=18, name='ph')
    tiles = [('전국 매장', '[00]', '개'), ('일 평균 주문', '[00]', '건'), ('피크 대기 시간', '[00]', '분'), ('매장당 화면 수', '[00]', '대')]
    for i, (lb, vl, un) in enumerate(tiles):
        x = 600 + (i % 2) * 316; y = 128 + (i // 2) * 268
        s.box(x, y, 300, 252, bg=SURF, r=18)
        s.t(x + 28, y + 28, 244, lb, 19, 800, INK, 1.3, name=f'lb{i}', nowrap=True)
        s.pic(x + 28, y + 168, 56, 56, '/assets/toc/icons/ui-' + ['store', 'chart2', 'clock', 'monitor'][i] + '.png', '지표 아이콘', kind='icon', r=16, name=f'ic{i}')
        numunit(s, x + 28, y + 82, 244, vl, un, 64, 22, vname=f'vl{i}', uname=f'un{i}')
    s.foot2(FOOT, 3)
    return reg(s, '고객사 분석 · 현황 지표 4', '고객사의 규모 · 운영 지표를 숫자 네 개로 보여 줄 때 (값은 고객 자료로 채움)', 'customer', None, ['customer', 'kpis', 'images'])

def ua_pain():
    s = T('L_TOC_UAPAIN'); s.head2('01 · 당사의 이해 · 고객사 분석', '외식 프랜차이즈가 풀어야 할 세 가지 과제')
    W = 368
    data = [('피크 시간 주문 대기', '점심 피크에 카운터 줄이 길어져 이탈하는 손님이 생깁니다.', P['counter']),
            ('매장마다 다른 메뉴판', '메뉴 · 가격을 바꿀 때마다 인쇄 · 배송 · 교체가 반복됩니다.', P['store']),
            ('객석 쾌적도와 전기료', '붐비는 시간에는 덥고, 한산할 때는 냉방이 낭비됩니다.', P['hall'])]
    for i, (tt, ln, ph) in enumerate(data):
        x = 64 + i * (W + 24)
        s.pic(x, 128, W, 250, ph, '과제가 드러나는 공간 사진', r=16, name=f'ph{i}')
        s.t(x, 398, 80, f'{i+1:02d}', 30, 800, BLUE, 1.0, extra=f'font-family: {NUMF}')
        s.t(x, 444, W, tt, 25, 800, INK, 1.3, name=f'pt{i}', clamp=2)
        s.t(x, 520, W, ln, 17.5, 500, INK2, 1.55, name=f'pl{i}', clamp=3)
    s.foot2(FOOT, 4)
    return reg(s, '고객 과제 · 사진 3 + 과제 3', '고객이 지금 겪는 과제 세 가지를 장면과 함께 보여 줄 때', 'challenge', 'customer', ['challenges', 'images'])

# ------------------------------------------------------------------ 업종 트렌드 (데이터 타입별)
def tr_line():
    s = T('L_TOC_TRLINE'); s.head2('01 · 당사의 이해 · 업종 트렌드', '셀프 주문 매장은 해마다 늘고 있습니다')
    s.box(64, 128, 768, 520, bg='#ffffff', r=18, border=f'1px solid {LINE}')
    s.t(92, 152, 700, '국내 외식 매장 키오스크 도입 수 · 만 대', 19, 800, INK, 1.3, name='ct', nowrap=True)
    hs = [0.36, 0.45, 0.55, 0.66, 0.79, 0.94]; base = 586; mh = 330
    for k, hh in enumerate(hs):
        x = 116 + k * 118; h = mh * hh
        s.box(x, base - h, 66, h, bg=BLUE if k == len(hs) - 1 else '#c9d2f3', r=8, extra='border-radius: 8px 8px 0 0')
        s.t(x - 20, base - h - 34, 106, '[00]', 19, 800, BLUE if k == len(hs) - 1 else INK2, 1.2, name=f'v{k}', align='center', extra=f'font-family: {NUMF}')
        s.t(x - 20, base + 12, 106, ['2021', '2022', '2023', '2024', '2025', '2026E'][k], 15, 700, GRAY, 1.2, name=f'y{k}', align='center', extra=f'font-family: {NUMF}')
    s.hline(92, base, 712, color=DASH)
    s.box(856, 128, 360, 520, bg=TINT, r=18)
    s.t(882, 160, 310, '연평균 성장률', 18, 800, BLUE, 1.3, name='sl', nowrap=True)
    s.t(882, 206, 310, '[00]%', 76, 800, BLUE, 1.0, name='sv', extra=f'font-family: {NUMF}; letter-spacing: -0.03em')
    s.t(882, 330, 310, '주문 단말은 이제 매장의 기본 설비입니다', 24, 800, INK, 1.4, name='sd', clamp=4)
    s.foot2(FOOT, 4)
    return reg(s, '업종 트렌드 · 연도별 추이 막대', '업종 지표의 연도별 추이를 막대로 보여 줄 때 (값은 최신 자료로 채움)', 'market', None, ['industry', 'kpis', 'sources'])

def tr_share():
    s = T('L_TOC_TRSHARE'); s.head2('01 · 당사의 이해 · 업종 트렌드', '주문은 이미 절반 가까이 화면에서 시작됩니다')
    s.box(64, 128, 560, 520, bg='#ffffff', r=18, border=f'1px solid {LINE}')
    segs = [(0.40, BLUE), (0.26, '#5b72e0'), (0.20, '#9aaaf0'), (0.14, '#d3dbfb')]
    cx, cy, R, w = 344, 388, 170, 62
    circ = 2 * math.pi * (R - w / 2); off = 0; arcs = ''
    for frac, col in segs:
        L = circ * frac
        arcs += f'<circle cx="{cx-64}" cy="{cy-128}" r="{R-w/2}" fill="none" stroke="{col}" stroke-width="{w}" stroke-dasharray="{L:.1f} {circ-L:.1f}" stroke-dashoffset="{-off:.1f}" transform="rotate(-90 {cx-64} {cy-128})"></circle>'
        off += L
    s.raw(f'<svg style="position: absolute; left: 64px; top: 128px" width="560" height="520" viewBox="0 0 560 520">{arcs}</svg>')
    s.t(cx - 110, cy - 30, 220, '주문 채널', 20, 800, INK, 1.2, name='cl', align='center')
    s.t(cx - 110, cy + 2, 220, '2026', 26, 800, BLUE, 1.2, name='cy', align='center', extra=f'font-family: {NUMF}')
    labs = ['키오스크 · 테이블 오더', '카운터 대면', '배달 앱', '드라이브스루']
    for k, (frac, col) in enumerate(segs):
        y = 160 + k * 122
        s.box(648, y, 568, 108, bg=SURF, r=16)
        s.box(672, y + 40, 28, 28, bg=col, r=8)
        s.t(718, y + 38, 300, labs[k], 21, 800, INK, 1.4, name=f'lb{k}', nowrap=True)
        s.t(1020, y + 30, 172, '[00]%', 36, 800, BLUE, 1.2, name=f'vl{k}', align='right', extra=f'font-family: {NUMF}')
    s.foot2(FOOT, 4)
    return reg(s, '업종 트렌드 · 구성비 도넛', '시장 · 채널의 구성비를 도넛 하나로 보여 줄 때 (값은 최신 자료로 채움)', 'market', None, ['industry', 'kpis', 'sources'])

def tr_stat():
    s = T('L_TOC_TRSTAT'); s.head2('01 · 당사의 이해 · 업종 트렌드', '숫자로 보는 외식 프랜차이즈의 지금')
    W = 368
    data = [('매장 인건비 비중', '[00]', '%', P['counter']), ('피크 시간 평균 대기', '[00]', '분', P['store']), ('매장 운영비 중 전력비', '[00]', '%', P['hall'])]
    for i, (lb, vl, un, ph) in enumerate(data):
        x = 64 + i * (W + 24)
        s.box(x, 128, W, 520, bg=SURF, r=18)
        s.pic(x, 128, W, 248, ph, '지표와 연결되는 공간 사진', r=18, name=f'ph{i}')
        s.t(x + 28, 404, W - 56, lb, 22, 800, INK, 1.35, name=f'lb{i}', clamp=2)
        numunit(s, x + 28, 500, W - 56, vl, un, 92, 30, vname=f'vl{i}', uname=f'un{i}')
    s.foot2(FOOT, 5)
    return reg(s, '업종 트렌드 · 핵심 지표 3', '업종의 핵심 숫자 세 개를 크게 보여 줄 때 (값은 최신 자료로 채움)', 'market', None, ['industry', 'kpis', 'sources', 'images'])

def tr_key():
    s = T('L_TOC_TRKEY'); s.head2('01 · 당사의 이해 · 업종 트렌드', '외식 매장을 바꾸는 세 가지 흐름')
    W = 368
    data = [('무인 · 셀프 주문', '주문과 결제는 손님이, 직원은 조리와 서비스에 집중합니다.', P['counter']),
            ('본사 원격 운영', '메뉴 · 가격 · 프로모션을 본사가 한 번에 바꿉니다.', P['store']),
            ('에너지 관리', '전기료가 오르며 매장 냉난방도 데이터로 관리합니다.', P['hall'])]
    for i, (kw, ln, ph) in enumerate(data):
        x = 64 + i * (W + 24)
        s.pic(x, 128, W, 290, ph, '흐름을 보여 주는 장면 사진', r=16, name=f'ph{i}')
        s.num2(x + 16, 128 + 16, i + 1, 36, 16)
        s.t(x, 442, W, kw, 27, 800, INK, 1.3, name=f'kw{i}', nowrap=True)
        s.t(x, 492, W, ln, 18, 500, INK2, 1.55, name=f'kl{i}', clamp=3)
    s.foot2(FOOT, 6)
    return reg(s, '업종 트렌드 · 키워드 3', '업종을 바꾸는 흐름 세 가지를 키워드와 장면으로 보여 줄 때', 'market', 'insight', ['industry', 'images'])

# ------------------------------------------------------------------ 경쟁사 비교
def cp_matrix():
    s = T('L_TOC_CPMATRIX'); s.head2('01 · 당사의 이해 · 경쟁사 비교', '같은 기준으로 비교하면, 차이는 운영에서 납니다')
    cols = [(64, 420), (500, 300), (816, 192), (1024, 192)]
    s.label2(88, 136, '비교 기준')
    s.chip(500, 128, '삼성', name='h1', bg=BLUE, color='#ffffff', size=16, h=36, pad=18)
    s.chip(816, 128, 'A사', name='h2', bg='#e9ecf1', color=INK2, size=16, h=36, pad=18)
    s.chip(1024, 128, 'B사', name='h3', bg='#e9ecf1', color=INK2, size=16, h=36, pad=18)
    crit = [('원격 통합 관리', '전 매장 화면 · 공조를 한 화면에서'), ('콘텐츠 운영', '템플릿 · 스케줄 · 원격 배포'), ('공조 · 에너지', 'AI 쾌적 제어 · 에너지 리포트'), ('보안 · 인증', 'Knox · ISO 27001 인증'), ('설치 · A/S', '전국 서비스망 · 전문 시공')]
    for r_, (cr, sv) in enumerate(crit):
        y = 184 + r_ * 92
        s.box(64, y, 1152, 82, bg=SURF if r_ % 2 == 0 else '#ffffff', r=14)
        s.t(88, y + 26, 396, cr, 20, 800, INK, 1.3, name=f'cr{r_}', nowrap=True)
        s.raw(f'<div style="position: absolute; left: 500px; top: {y+27}px; width: 26px; height: 26px; border-radius: 50%; background: {BLUE}"></div>')
        s.t(538, y + 18, 270, sv, 16, 700, BLUE, 1.4, name=f's{r_}', clamp=2)
        s.t(816, y + 26, 192, '[평가]', 17, 700, MUTE, 1.3, name=f'a{r_}', nowrap=True)
        s.t(1024, y + 26, 192, '[평가]', 17, 700, MUTE, 1.3, name=f'b{r_}', nowrap=True)
    s.foot2(FOOT, 7)
    return reg(s, '경쟁사 비교 · 기준 5 × 공급사 3', '공급사를 같은 기준 다섯 개로 나란히 비교할 때 (경쟁사 값은 조사로 채움)', 'competition', 'why', ['competitors'], extra={'retired': 'L_TOC_CPSCORE'})

def cp_map():
    s = T('L_TOC_CPMAP'); s.head2('01 · 당사의 이해 · 경쟁사 비교', '통합 관리와 확장성, 두 축에서 삼성의 위치')
    s.box(64, 128, 700, 520, bg='#ffffff', r=18, border=f'1px solid {LINE}')
    s.box(414, 148, 330, 230, bg=TINT, r=12)
    s.raw(f'<div style="position: absolute; left: 412px; top: 148px; width: 2px; height: 460px; background: {DASH}"></div>')
    s.raw(f'<div style="position: absolute; left: 96px; top: 378px; width: 648px; height: 2px; background: {DASH}"></div>')
    s.t(96, 614, 640, '통합 관리 범위 →', 16, 800, GRAY, 1.2, name='ax', align='right')
    s.t(96, 150, 300, '↑ 확장 · 연동성', 16, 800, GRAY, 1.2, name='ay')
    for (x, y, d, col, lab, nm) in [(620, 220, 44, BLUE, '삼성', 'p0'), (250, 300, 34, '#aab1bd', 'A사', 'p1'), (520, 470, 34, '#aab1bd', 'B사', 'p2')]:
        s.raw(f'<div style="position: absolute; left: {x}px; top: {y}px; width: {d}px; height: {d}px; border-radius: 50%; background: {col}; box-shadow: 0 4px 12px rgba(18,20,23,0.18)"></div>')
        s.t(x + d + 10, y + d / 2 - 13, 120, lab, 19, 800, BLUE if nm == 'p0' else INK2, 1.3, name=nm, nowrap=True)
    s.box(788, 128, 428, 520, bg=SURF, r=18)
    s.label2(814, 152, '삼성의 위치', BLUE)
    for k, st in enumerate(['매장 화면 · 공조 · 단말을 한 플랫폼으로', '파트너 기기 · POS까지 연동', '전국 서비스망으로 확산이 쉬움']):
        y = 196 + k * 140
        s.ico(814, y, 'check', size=48, r=14, bg='#ffffff')
        s.t(878, y + 4, 316, st, 20, 800, INK, 1.45, name=f'st{k}', clamp=3)
    s.foot2(FOOT, 7)
    return reg(s, '경쟁사 비교 · 포지셔닝 맵', '두 축으로 공급사 포지셔닝을 보여 줄 때 (경쟁사 위치는 조사로 채움)', 'competition', 'why', ['competitors'], extra={'retired': 'L_TOC_CPPOS'})

# ------------------------------------------------------------------ 경쟁사 비교 (새 장 3) — 점수표 · 차별점 3 · 포지셔닝
# 경쟁사는 익명(경쟁사 A · B · 현재 방식). 평가는 5점 점(●○) — 예시 값, 제안 때 조사로 바꿈. 삼성 칸은 근거 한 줄(제품 · 솔루션 공식 정보).
CPI = lambda k: f'/assets/toc/icons/cp-{k}.png'
DOTS = lambda n: '●' * n + '○' * (5 - n)
CP_ROWS = [('원격 통합 관리', 'layers', '화면 · 공조 한 계정', (5, 3, 2), '기기별 앱 따로', '매장 단위 관리'),
           ('메뉴 · 콘텐츠 운영', 'content', '템플릿 · 원격 편성', (5, 4, 3), '템플릿 적음', 'USB 수동 교체'),
           ('주문 · 결제 연동', 'pay', '키오스크 · POS 연동', (4, 3, 4), '연동 별도 개발', '자사 POS만'),
           ('에너지 · 쾌적', 'energy', 'AI 절약 · 리포트', (5, 2, 2), '공조 미지원', '공조 미지원'),
           ('설치 · A/S', 'service', '전국망 · 영업 외 설치', (5, 3, 3), '대리점 중심', '지역 한정')]
CP_SCORE = lambda col: str(round(sum(r[3][col] for r in CP_ROWS) / (5 * len(CP_ROWS)) * 100))
GRAYDOT = '#a3aab6'

def cp_score():
    s = T('L_TOC_CPSCORE'); s.head2('01 · 당사의 이해 · 경쟁사 비교', '같은 기준으로 비교하면, 차이는 운영에서 납니다')
    s.box(536, 128, 232, 524, bg=TINT, r=16)                      # 삼성 열 — 머리부터 종합 점수까지 한 띠
    s.box(536, 128, 232, 96, bg=BLUE, r=16)
    s.pic(550, 142, 68, 68, CUT['sig'], '삼성 제안 대표 제품 컷', kind='cut', r=14, name='pc', bg='#ffffff', pad=6)
    s.t(632, 138, 124, '삼성', 24, 800, '#ffffff', 1.3, name='hs', nowrap=True)
    s.t(632, 172, 126, '스마트 사이니지 QMC', 13, 600, 'rgba(255,255,255,0.88)', 1.3, name='hsp', clamp=2)
    for k, (x, nm, tp, ic) in enumerate([(784, '경쟁사 A', '글로벌 디스플레이', 'cube'), (1008, '경쟁사 B', '국내 POS · 사이니지', 'store')]):
        s.box(x, 128, 208, 96, bg=SURF, r=16)
        s.ico(x + 16, 152, ic, size=48, r=14, bg='#ffffff', color=GRAY)
        s.t(x + 76, 144, 120, nm, 20, 800, INK2, 1.3, name=('ha', 'hb')[k], nowrap=True)
        s.t(x + 76, 178, 120, tp, 13.5, 600, MUTE, 1.35, name=('hat', 'hbt')[k], nowrap=True)
    s.t(64, 192, 300, '비교 기준', 14, 800, MUTE, 1.2, name='hc', nowrap=True, extra='letter-spacing: 0.06em')
    for r, (cr, ic, sv, (a, b, c), na, nb) in enumerate(CP_ROWS):
        y = 236 + r * 72
        if r:
            s.hline(64, y - 4, 456); s.hline(784, y - 4, 432)
        s.box(64, y + 11, 44, 44, bg=TINT, r=12)
        s.pic(73, y + 20, 26, 26, CPI(ic), '기준 아이콘', kind='icon', r=0, name=f'ci{r}')
        s.t(124, y + 20, 392, cr, 19, 800, INK, 1.3, name=f'cr{r}', nowrap=True)
        s.t(556, y + 8, 196, DOTS(a), 15, 700, BLUE, 1.3, name=f's{r}d', nowrap=True, extra='letter-spacing: 0.12em')
        s.t(556, y + 35, 200, sv, 14.5, 700, BLUE, 1.35, name=f's{r}', nowrap=True)
        for x, n, note, nm in ((804, b, na, 'a'), (1028, c, nb, 'b')):
            s.t(x, y + 8, 180, DOTS(n), 15, 700, GRAYDOT, 1.3, name=f'{nm}{r}d', nowrap=True, extra='letter-spacing: 0.12em')
            s.t(x, y + 35, 180, note, 14.5, 600, GRAY, 1.35, name=f'{nm}{r}', nowrap=True)
    s.hline(64, 596, 456); s.hline(784, 596, 432)
    s.t(64, 616, 300, '종합 점수', 19, 800, INK, 1.3, name='tl', nowrap=True)
    numunit(s, 556, 606, 196, CP_SCORE(0), '점', size=36, usize=16, vname='st', uname='stu')
    numunit(s, 804, 606, 180, CP_SCORE(1), '점', size=36, usize=16, color=GRAY, ucolor=MUTE, vname='at', uname='atu')
    numunit(s, 1028, 606, 180, CP_SCORE(2), '점', size=36, usize=16, color=GRAY, ucolor=MUTE, vname='bt', uname='btu')
    s.foot2(FOOT, 7)
    return reg(s, '경쟁사 비교 · 기준별 점수표 (기준 5 × 공급사 3)', '고객이 보는 기준 다섯 가지로 삼성과 경쟁사 둘을 점수로 나란히 비교할 때', 'competition', 'why', ['competitors', 'products'])

CP_WIN = [('5', '개 솔루션 · 한 공급사', '메뉴판 · 공조 · 주문 단말을 한 공급사에서', P['counter'], 'space', (5, 3, 2)),
          ('6', '개 공간 · 한 번에 제안', '주방부터 홀까지 매장 전체를 한 번에', P['store'], 'space', (5, 3, 2)),
          ('500', 'nit', '스마트 사이니지 QMC 밝기', CUT['sig'], 'cut', (5, 4, 3))]

def cp_win():
    s = T('L_TOC_CPWIN'); s.head2('01 · 당사의 이해 · 경쟁사 비교', '외식 프랜차이즈가 삼성을 고르는 세 가지 이유')
    W = 352
    for i, (v, u, tt, ph, kind, (a, b, c)) in enumerate(CP_WIN):
        x = 64 + i * 400
        s.pic(x, 128, W, 196, ph, '이 차별점이 보이는 장면 사진' if kind == 'space' else '근거 제품 컷', kind=kind, r=16, name=f'ph{i}',
              bg=SURF if kind == 'cut' else None, pad=14 if kind == 'cut' else 0)
        numunit(s, x, 346, W, v, u, size=52, usize=19, vname=f'v{i}', uname=f'u{i}')
        s.t(x, 414, W, tt, 21, 800, INK, 1.4, name=f'tt{i}', clamp=2)
        s.box(x, 494, W, 158, bg=SURF, r=14)
        for k, (nm, n, col, dc) in enumerate((('삼성', a, BLUE, BLUE), ('경쟁사 A', b, INK2, GRAYDOT), ('경쟁사 B', c, INK2, GRAYDOT))):
            y = 516 + k * 44
            s.t(x + 22, y, 150, nm, 16, 800, col, 1.3, name=f'n{i}_{k}', nowrap=True)
            s.t(x + 172, y - 1, W - 194, DOTS(n), 17, 700, dc, 1.3, name=f'd{i}_{k}', nowrap=True, align='right', extra='letter-spacing: 0.14em')
    s.foot2(FOOT, 7)
    return reg(s, '경쟁사 비교 · 차별점 3 (사진 + 숫자 + 비교 점)', '경쟁사와 다른 점 세 가지를 사진 · 숫자와 점수 점으로 보여 줄 때', 'competition', 'why', ['competitors', 'images'])

def cp_pos():
    s = T('L_TOC_CPPOS'); s.head2('01 · 당사의 이해 · 경쟁사 비교', '통합 관리와 확장성, 두 축에서 삼성의 위치')
    s.box(64, 128, 712, 524, bg='#ffffff', r=18, border=f'1px solid {LINE}')
    s.box(420, 152, 332, 232, bg=TINT, r=12)                        # 앞서는 자리 (오른쪽 위)
    s.raw(f'<div style="position: absolute; left: 420px; top: 152px; width: 0; height: 464px; border-left: 2px dashed {DASH}"></div>')
    s.raw(f'<div style="position: absolute; left: 88px; top: 384px; width: 664px; height: 0; border-top: 2px dashed {DASH}"></div>')
    s.t(100, 160, 300, '↑ 다점포 확장성', 15, 800, GRAY, 1.2, name='ay', nowrap=True)
    s.t(436, 622, 316, '통합 관리 범위 →', 15, 800, GRAY, 1.2, name='ax', nowrap=True, align='right')
    # 현재 방식 → 삼성 (점선 화살표)
    s.raw(f'<svg style="position: absolute; left: 0; top: 0; overflow: visible" width="1" height="1"><defs><marker id="cpar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{BLUE}"></path></marker></defs>'
          f'<path d="M232 500 C 320 430, 470 330, 566 266" fill="none" stroke="{BLUE}" stroke-width="2.4" stroke-dasharray="7 7" marker-end="url(#cpar)"></path></svg>')
    s.raw(f'<div style="position: absolute; left: 580px; top: 180px; width: 120px; height: 120px; border-radius: 50%; background: #ffffff; box-shadow: 0 0 0 5px {BLUE}, 0 10px 26px rgba(20,40,160,0.22)"></div>')
    s.pic(598, 198, 84, 84, CUT['sig'], '삼성 제안 대표 제품 컷', kind='cut', r=0, name='pc', bg='#ffffff')
    s.chip(598, 318, '삼성', name='pn0', bg=BLUE, color='#ffffff', size=16, h=34, pad=18)
    for (x, y, nm, slot, lt, dashed) in ((176, 232, '경쟁사 A', 'pn1', 'A', False), (548, 452, '경쟁사 B', 'pn2', 'B', False), (176, 480, '현재 방식', 'pn3', '', True)):
        bd = f'border: 2px dashed {GRAY}; background: #ffffff' if dashed else 'background: #c3c9d3'
        s.raw(f'<div style="position: absolute; left: {x}px; top: {y}px; width: 60px; height: 60px; box-sizing: border-box; border-radius: 50%; {bd}"></div>')
        if lt: s.t(x, y + 14, 60, lt, 22, 800, '#ffffff', 1.3, name=slot + 'l', align='center', extra=f'font-family: {NUMF}')
        s.chip(x - 6, y + 70, nm, name=slot, bg='#eef0f3', color=INK2, size=14, h=30, pad=12)
    s.box(800, 128, 416, 524, bg=SURF, r=18)
    s.t(828, 152, 360, '삼성이 앞서는 이유', 15, 800, BLUE, 1.2, name='rh', nowrap=True, extra='letter-spacing: 0.04em')
    for k, (st, ph) in enumerate((('메뉴판 · 공조 · 주문 단말을 한 플랫폼으로', P['counter']), ('POS · 배달 앱 등 파트너 연동', P['store']), ('전국 서비스망으로 새 매장도 빠르게', P['hall']))):
        y = 192 + k * 152
        s.pic(828, y, 140, 112, ph, '이유가 보이는 장면 사진', r=12, name=f'ph{k}')
        s.num2(838, y + 10, k + 1, d=28, size=13)
        s.t(988, y + 16, 204, st, 19, 800, INK, 1.45, name=f'st{k}', clamp=3)
    s.foot2(FOOT, 7)
    return reg(s, '경쟁사 비교 · 포지셔닝 맵 (두 축 + 이유 3)', '두 축 위에 삼성 · 경쟁사 · 현재 방식의 자리를 그리고, 앞서는 이유 셋을 사진으로 보여 줄 때', 'competition', 'why', ['competitors', 'images'])

# ------------------------------------------------------------------ 파생 목차: 요구사항 · 사양 · 비용 · 일정 · 수량 · 요약 · 효과 · 파일럿
def rfp():
    s = T('L_TOC_RFP'); s.head2('01 · 요구사항 대응', '평가 항목 다섯 가지, 빠짐없이 답합니다')
    s.label2(112, 128, '요구사항'); s.label2(592, 128, '삼성 대응'); s.label2(1000, 128, '근거')
    rows = [('전 매장 메뉴 동시 변경', 'VXT CMS로 본사에서 원격 배포 · 시간대 편성', 'VXT CMS'), ('피크 시간 주문 분산', '키오스크 · 테이블 오더로 주문 창구를 늘림', '키오스크'), ('매장 냉난방 비용 절감', 'AI 쾌적 제어와 비효율 운전 감지', 'SmartThings Pro'), ('단말 보안 · 용도 제한', '주문 태블릿을 전용 모드로 고정', 'Knox'), ('설치 · 유지보수', '야간 설치 · 정기 점검 · 긴급 출동', '케어 서비스')]
    for r_, (rq, rs, ev) in enumerate(rows):
        y = 156 + r_ * 98
        s.box(64, y, 1152, 88, bg=SURF if r_ % 2 == 0 else '#ffffff', r=14)
        s.num2(80, y + 29, r_ + 1, 30, 14)
        s.t(124, y + 18, 440, rq, 20, 800, INK, 1.35, name=f'rq{r_}', clamp=2)
        s.arrow(560, y + 33, 22)
        s.t(592, y + 18, 392, rs, 17, 600, INK2, 1.45, name=f'rs{r_}', clamp=2)
        s.chip(1000, y + 27, ev, name=f'ev{r_}', size=15, h=34, maxw=200)
    s.foot2(FOOT, 3)
    return reg(s, '요구사항 대응 · 평가 항목 5', 'RFP · 평가 항목에 하나씩 대응과 근거를 붙일 때', 'requirements', 'spec', ['customer', 'products', 'solutions'])

def spec():
    s = T('L_TOC_SPEC'); s.head2('03 · 제품 사양', '핵심 제품 세 가지, 사양으로 비교합니다')
    W = 368
    data = [('스마트 사이니지', '스마트 LCD 사이니지', CUT['sig'], [('크기', '43 · 55 · 65형'), ('운영', '24시간 · 16/7'), ('공간', '카운터 · 매장 입구')]),
            ('키오스크', '키오스크', CUT['kiosk'], [('화면', '24형 세로 터치'), ('결제', '카드 · 간편결제'), ('공간', '주문 카운터')]),
            ('360 카세트', '중소건물용 시스템에어컨', CUT['ac'], [('바람', '원형 360° 무풍'), ('제어', 'SmartThings Pro'), ('공간', '객석')])]
    for i, (nm, md, cut, sp) in enumerate(data):
        x = 64 + i * (W + 24)
        s.box(x, 128, W, 520, bg='#ffffff', r=18, border=f'1px solid {LINE}')
        s.pic(x + 24, 148, W - 48, 196, cut, '제품 컷', kind='cut', r=12, name=f'img{i}')
        s.t(x + 24, 362, W - 48, nm, 23, 800, INK, 1.3, name=f'nm{i}', nowrap=True)
        s.t(x + 24, 398, W - 48, md, 16, 700, GRAY, 1.3, name=f'md{i}', nowrap=True)
        for j, (lb, vl) in enumerate(sp):
            y = 446 + j * 64
            s.hline(x + 24, y - 10, W - 48)
            s.t(x + 24, y, 90, lb, 15, 800, MUTE, 1.3, name=f'sl{i}_{j}', nowrap=True)
            s.t(x + 112, y - 2, W - 136, vl, 18, 700, INK, 1.35, name=f'sv{i}_{j}', nowrap=True)
    s.foot2(FOOT, 5)
    return reg(s, '제품 사양 · 제품 3 비교', '핵심 제품 세 가지를 사양 줄로 나란히 비교할 때', 'spec', 'products', ['products', 'images'])

def tco():
    s = T('L_TOC_TCO'); s.head2('04 · 비용 · 구매', '구매 방식 세 가지, 예산에 맞게 고릅니다')
    W = 368
    data = [('일시 구매', 'coin', ['초기 비용 한 번에', '자산으로 보유', '장기 사용에 유리'], '대형 · 본사 직영'),
            ('리스 · 렌탈', 'calendar', ['월 비용으로 분산', '유지보수 포함 가능', '교체 주기 관리'], '초기 비용 부담이 클 때'),
            ('구독 · 서비스', 'cloud', ['솔루션 · 케어 묶음', '사용한 만큼 확장', '운영 부담 최소'], '다점포 · 빠른 확산')]
    for i, (tt, ic, bl, best) in enumerate(data):
        x = 64 + i * (W + 24)
        s.box(x, 128, W, 412, bg=SURF, r=18)
        s.ico(x + 26, 152, ic, size=60, r=18, bg='#ffffff')
        s.t(x + 26, 232, W - 52, tt, 26, 800, INK, 1.3, name=f'ot{i}', nowrap=True)
        for j, b in enumerate(bl):
            y = 290 + j * 52
            s.raw(f'<div style="position: absolute; left: {x+26}px; top: {y+3}px">' + svg_icon('check', 22, BLUE, 2.4) + '</div>')
            s.t(x + 58, y, W - 84, b, 18, 600, INK2, 1.4, name=f'ob{i}_{j}', nowrap=True)
        s.chip(x + 26, 470, best, name=f'oc{i}', bg='#ffffff', size=15, h=36, maxw=W - 52)
    s.box(64, 560, 1152, 88, bg=BLUE, r=18)
    s.t(92, 590, 240, '5년 총소유비용', 18, 800, '#ffffff', 1.3, name='tl', nowrap=True)
    for i, lb in enumerate(['일시 구매 [00]', '리스 · 렌탈 [00]', '구독 · 서비스 [00]']):
        s.t(340 + i * 290, 588, 270, lb, 20, 800, '#ffffff', 1.3, name=f'tv{i}', nowrap=True)
    s.foot2(FOOT, 6)
    return reg(s, '비용 · 구매 방식 3 + 5년 총소유비용', '구매 방식을 비교하고 5년 비용을 한 줄로 보여 줄 때 (금액은 견적으로 채움)', 'cost', None, ['costs'])

def roadmap():
    s = T('L_TOC_ROADMAP'); s.head2('05 · 실행 계획', '실사부터 확산까지, 네 단계로 진행합니다')
    W = (1152 - 3 * 20) / 4
    s.box(64, 252, 1152, 4, bg='#c9d2f3', r=2)
    data = [('실사 · 설계', '[0]주', ['공간별 실측 · 전원 확인', '설치 위치 · 수량 확정', '연동 범위 확정']), ('설치 · 구축', '[0]주', ['영업 외 시간 설치', '솔루션 계정 · 연동 설정', '콘텐츠 · 자동화 등록']),
            ('안정화', '[0]주', ['운영자 교육', '지표 측정 시작', '장애 대응 점검']), ('확산', '[0]주', ['나머지 매장 순차 적용', '정기 점검 · 리포트', '운영 기준 표준화'])]
    for i, (nm, pr, lines) in enumerate(data):
        x = 64 + i * (W + 20)
        s.chip(x, 140, pr, name=f'pp{i}', bg=TINT, size=16, h=36, pad=16)
        s.raw(f'<div style="position: absolute; left: {x}px; top: 238px; width: 32px; height: 32px; border-radius: 50%; background: {BLUE}; border: 4px solid #ffffff; box-sizing: border-box; box-shadow: 0 0 0 2px {BLUE}"></div>')
        s.box(x, 296, W, 352, bg=SURF, r=18)
        s.t(x + 24, 318, 60, f'{i+1:02d}', 26, 800, BLUE, 1.0, extra=f'font-family: {NUMF}')
        s.ico(x + W - 72, 312, ['map', 'wrench', 'pulse', 'rocket'][i], size=48, r=14, bg='#ffffff')
        s.t(x + 24, 368, W - 48, nm, 25, 800, INK, 1.3, name=f'pn{i}', nowrap=True)
        for j, ln in enumerate(lines):
            y = 430 + j * 66
            s.raw(f'<div style="position: absolute; left: {x+24}px; top: {y+4}px">' + svg_icon('check', 20, BLUE, 2.4) + '</div>')
            s.t(x + 52, y, W - 76, ln, 17, 600, INK2, 1.45, name=f'pl{i}_{j}', clamp=2)
    s.foot2(FOOT, 8)
    return reg(s, '실행 계획 · 4단계 로드맵', '실사 · 설치 · 안정화 · 확산 네 단계를 일정과 함께 보여 줄 때', 'execution', None, ['timeline'])

def bom(n):
    s = T(f'L_TOC_BOM{n}'); s.head2('04 · 구성 · 수량', '공간마다 무엇을 몇 대 놓는지 한 표로 봅니다')
    cols = [('스마트 사이니지', CUT['sig']), ('키오스크', CUT['kiosk']), ('360 카세트', CUT['ac']), ('갤럭시 탭', CUT['tab']), ('업소용 냉장고', CUT['fridge'])]
    X0 = 364; CW = (1216 - X0) / 5
    for j, (nm, cut) in enumerate(cols):
        x = X0 + j * CW
        s.pic(x + 18, 128, CW - 36, 82, cut, '제품 컷', kind='cut', r=8, name=f'ci{j}')
        s.t(x + 6, 218, CW - 12, nm, 15.5, 800, INK, 1.3, name=f'cn{j}', align='center', nowrap=True)
    rows = ['매장 입구·쇼윈도', '주문 카운터', '객석', '주방(BOH)', '점주 사무', '교육장', '드라이브스루', '배달 픽업대'][:n]
    rh = min(78, (648 - 258) / n)
    for i, nm in enumerate(rows):
        y = 258 + i * rh
        s.box(64, y, 1152, rh - 6, bg=SURF if i % 2 == 0 else '#ffffff', r=12)
        s.num2(80, y + (rh - 6 - 28) / 2, i + 1, 28, 13)
        s.t(120, y + (rh - 6 - 26) / 2, 236, nm, 17.5, 800, INK, 1.45, name=f'rn{i}', nowrap=True)
        for j in range(5):
            s.t(X0 + j * CW, y + (rh - 6 - 28) / 2, CW, '[0]', 20, 800, BLUE, 1.4, name=f'q{i}_{j}', align='center', extra=f'font-family: {NUMF}')
    s.foot2(FOOT, 9)
    return reg(s, f'구성 · 수량표 · 공간 {n} × 제품 5', '공간별로 놓이는 제품과 수량을 한 표로 정리할 때 (수량은 실사로 채움)', 'bom', 'products', ['spaces', 'products', 'quantities'])

def summary():
    s = T('L_TOC_SUMMARY'); s.head2('01 · 제안 요약', '과제 · 제안 · 효과 · 결정 요청을 한 장으로')
    W = (1152 - 3 * 20) / 4
    heads = [('과제', 'alert'), ('제안', 'gem' if 'gem' in ICONS else 'spark'), ('기대 효과', 'trend'), ('결정 요청', 'flag')]
    body = [['피크 시간 주문 대기', '매장마다 다른 메뉴판', '객석 쾌적도 · 전기료'], ['기다림 없는 주문', '본사 원격 운영', 'AI 쾌적 환경'], ['주문 대기 [00]% ↓', '메뉴 반영 [0]일 → 당일', '매장 전력 [00]% ↓'], ['시범 매장 [0]곳 착수']]
    for i, (hd, ic) in enumerate(heads):
        x = 64 + i * (W + 20)
        last = i == 3
        s.box(x, 128, W, 520, bg=BLUE if last else SURF, r=18)
        s.ico(x + 24, 150, ic, size=56, r=16, bg='rgba(255,255,255,0.16)' if last else '#ffffff', color='#ffffff' if last else BLUE)
        s.t(x + 24, 226, W - 48, hd, 24, 800, '#ffffff' if last else INK, 1.3, name=f'h{i}', nowrap=True)
        for j, ln in enumerate(body[i]):
            y = 290 + j * 104
            if last:
                s.t(x + 24, y, W - 48, ln, 26, 800, '#ffffff', 1.45, name=f'b{i}_{j}', clamp=4)
            else:
                s.box(x + 24, y, W - 48, 88, bg='#ffffff', r=14)
                s.t(x + 42, y + 18, W - 84, ln, 18, 700, INK, 1.45, name=f'b{i}_{j}', clamp=2)
    s.foot2(FOOT, 2)
    return reg(s, '제안 요약 · 과제 → 제안 → 효과 → 요청', '결정권자에게 제안 전체를 네 칸으로 요약할 때', 'overview', 'closing', ['challenges', 'values', 'kpis'])

def kpi():
    s = T('L_TOC_KPI'); s.head2('02 · 기대 효과', '도입 후 달라지는 숫자 네 가지')
    data = [('피크 시간 주문 대기', '분'), ('메뉴 · 가격 반영', '일'), ('매장 전력 사용', 'kWh'), ('메뉴판 교체 작업', '시간')]
    for i, (lb, un) in enumerate(data):
        x = 64 + (i % 2) * 586; y = 128 + (i // 2) * 268
        s.box(x, y, 566, 252, bg=SURF, r=18)
        s.t(x + 30, y + 26, 400, lb, 21, 800, INK, 1.3, name=f'lb{i}', nowrap=True)
        s.chip(x + 404, y + 22, '[00]% 개선', name=f'cg{i}', bg=BLUE, color='#ffffff', size=15, h=34, maxw=140)
        s.t(x + 30, y + 92, 200, '[00]', 52, 800, MUTE, 1.0, name=f'bf{i}', extra=f'font-family: {NUMF}')
        s.t(x + 30, y + 164, 200, '지금', 16, 700, MUTE, 1.2)
        s.raw(f'<div style="position: absolute; left: {x+238}px; top: {y+108}px">' + svg_icon('arrow', 40, BLUE, 2.2) + '</div>')
        s.t(x + 300, y + 84, 240, '[00]', 64, 800, BLUE, 1.0, name=f'af{i}', extra=f'font-family: {NUMF}')
        s.t(x + 300, y + 164, 240, '도입 후 · ' + un, 16, 800, BLUE, 1.2, name=f'un{i}', nowrap=True)
    s.foot2(FOOT, 6)
    return reg(s, '기대 효과 · KPI 4 전후 비교', '도입 전후로 달라지는 지표 네 개를 크게 보여 줄 때 (값은 고객 자료 · 파일럿으로 채움)', 'effect', None, ['kpis'])

def pilot():
    s = T('L_TOC_PILOT'); s.head2('04 · 파일럿 · 확산', '작게 검증하고, 같은 기준으로 넓힙니다')
    W = (1152 - 2 * 24) / 3
    data = [('파일럿', '[0]곳', ['주문 대기 [00]% ↓', '화면 장애 [0]건 이하'], 0), ('1차 확산', '[00]곳', ['설치 속도 주 [0]곳', '운영자 교육 [00]%'], 1), ('전체 확산', '[000]곳', ['권역별 A/S [0]시간 대응', '월간 운영 리포트'], 2)]
    for i, (nm, sc, crit, lv) in enumerate(data):
        x = 64 + i * (W + 24); top = 300 - lv * 76
        s.box(x, top, W, 648 - top, bg=BLUE if i == 2 else (TINT if i == 1 else SURF), r=18)
        col = '#ffffff' if i == 2 else INK
        s.t(x + 28, top + 24, W - 56, f'STEP {i+1}', 15, 800, '#ffffff' if i == 2 else BLUE, 1.2, extra=f'font-family: {NUMF}; letter-spacing: 0.06em')
        s.t(x + 28, top + 54, W - 56, nm, 27, 800, col, 1.3, name=f'pn{i}', nowrap=True)
        s.t(x + 28, top + 100, W - 56, sc, 44, 800, '#ffffff' if i == 2 else BLUE, 1.1, name=f'ps{i}', extra=f'font-family: {NUMF}')
        for j, c in enumerate(crit):
            y = top + 178 + j * 54
            s.raw(f'<div style="position: absolute; left: {x+28}px; top: {y+3}px">' + svg_icon('check', 20, '#ffffff' if i == 2 else BLUE, 2.4) + '</div>')
            s.t(x + 58, y, W - 86, c, 18, 700, col, 1.4, name=f'pc{i}_{j}', nowrap=True)
    s.foot2(FOOT, 7)
    return reg(s, '파일럿 · 확산 3단계 계단', '파일럿에서 전체 확산까지 범위와 성공 기준을 계단으로 보여 줄 때', 'execution', 'effect', ['timeline', 'kpis'])

# ------------------------------------------------------------------ 제품 제안서: Value Props 3 · 제품 가치 상세 · Spec
VPS = [('제품 · 스마트 사이니지 QMC', CUT['sig'], 'cut', '24시간 선명한 4K', '500nit 4K UHD 화면을 24시간 안정적으로 운영합니다.'),
       ('솔루션 · VXT CMS', 'img/media/g0.json#35', 'space', '클라우드 콘텐츠 운영', '매장 화면 콘텐츠를 클라우드로 운영합니다'),
       ('솔루션 · MagicINFO', 'img/media/g0.json#4', 'space', '데이터 연동 콘텐츠', '데이터와 연동한 화면을 안전하게 운영합니다')]
def value_props():
    s = T('L_TOC_VP3'); s.head2('01 · Value Props', '스마트 사이니지 QMC가 외식 프랜차이즈에 주는 세 가지 가치')
    W = 368
    for i, (src, pic, kind, tt, ln) in enumerate(VPS):
        x = 64 + i * (W + 24)
        s.box(x, 128, W, 520, bg='#ffffff', r=18, border=f'1px solid {LINE}')
        s.pic(x + 1, 129, W - 2, 230, pic, '가치를 만드는 제품 컷 · 솔루션 화면', kind='space', r=17, name=f'img{i}', bg=SURF)
        s.chip(x + 24, 380, src, name=f'src{i}', size=13, h=30, pad=12, maxw=W - 48)
        s.t(x + 24, 432, 80, f'{i+1:02d}', 34, 800, BLUE, 1.0, name=f'no{i}', extra=f'font-family: {NUMF}')
        s.t(x + 24, 478, W - 48, tt, 25, 800, INK, 1.3, name=f'tt{i}', clamp=2)
        s.t(x + 24, 554, W - 48, ln, 17, 600, INK2, 1.5, name=f'ln{i}', clamp=3)
    s.foot2(FOOT, 3)
    return reg(s, 'Value Props · 가치 3 (제품 · 솔루션)', '제품 하나와 함께 쓰는 솔루션이 주는 가치 세 가지를 카드로 보여 줄 때', 'value', 'products', ['products', 'solutions', 'images'])

def product_value():
    s = T('L_TOC_PFEAT'); s.head2('02 · Value Prop 상세 · 02', '천장과 하나 되는 디자인')
    s.pic(64, 128, 700, 520, CUT['sig'], '제품 사진 (정면 · 측면)', kind='cut', r=18, name='img', bg=SURF, pad=28)
    s.box(796, 128, 420, 520, bg=TINT, r=18)
    s.t(828, 160, 120, '02', 56, 800, BLUE, 1.0, name='no', extra=f'font-family: {NUMF}')
    s.t(828, 236, 360, 'Value Prop', 15, 800, BLUE, 1.2, name='kick', nowrap=True, extra='letter-spacing: 0.06em')
    s.t(828, 290, 360, 'Ceiling-Fit 디자인과 은은한 엣지 라이팅으로 공간의 분위기를 해치지 않습니다.', 24, 700, INK, 1.5, name='ln', clamp=6)
    s.chip(828, 584, '제품 · Infinite Line 무풍 시스템에어컨', name='src', bg='#ffffff', size=14, h=36, pad=14, maxw=356)
    s.foot2(FOOT, 6)
    return reg(s, 'Value Prop 상세 · 제품 사진 + 가치 한 줄', '제품이 주는 가치 하나를 큰 제품 사진과 한 문장으로 보여 줄 때', 'products', 'value', ['products', 'images'])

def product_spec():
    s = T('L_TOC_PSPEC'); s.head2('04 · Spec', '스마트 사이니지 QMC, 핵심 사양')
    s.pic(64, 128, 440, 420, CUT['sig'], '제품 컷', kind='cut', r=18, name='img', bg=SURF, pad=24)
    s.t(64, 568, 440, '스마트 사이니지 QMC', 26, 800, INK, 1.3, name='nm', nowrap=True)
    s.t(64, 610, 440, 'LH55QMCEBGCXKR', 16, 700, GRAY, 1.3, name='md', nowrap=True, extra=f'font-family: {NUMF}')
    keys = [('3,840 x 2,160', '해상도'), ('500 nit', '밝기'), ('24/7', '제품 사용 시간')]
    for i, (vl, lb) in enumerate(keys):
        x = 536 + i * 232
        s.box(x, 128, 216, 124, bg=SURF, r=16)
        s.t(x + 22, 148, 188, vl, 26, 800, BLUE, 1.4, name=f'kv{i}', nowrap=True, extra=f'font-family: {NUMF}')
        s.t(x + 22, 204, 180, lb, 15, 700, GRAY, 1.3, name=f'kl{i}', nowrap=True)
    rows = [('대각선 사이즈', '138.7 cm'), ('해상도', '3,840 x 2,160'), ('밝기', '500 nit'), ('명암비', '4,000:1'), ('제품 사용 시간', '24/7'),
            ('베젤 두께', '11.5 mm'), ('운영체제', 'Tizen 7.0'), ('플래시메모리', '16 GB')]
    for j, (lb, vl) in enumerate(rows):
        y = 282 + j * 46
        s.hline(536, y - 8, 680)
        s.t(536, y + 2, 220, lb, 15, 800, MUTE, 1.3, name=f'sl{j}', nowrap=True)
        s.t(772, y, 444, vl, 18, 700, INK, 1.35, name=f'sv{j}', nowrap=True)
    s.hline(536, 282 + 8 * 46 - 8, 680)
    s.foot2(FOOT, 9)
    return reg(s, 'Spec · 제품 하나 (숫자 3 + 사양 8)', '제품 하나의 핵심 숫자와 사양을 한 장으로 보여 줄 때', 'spec', 'products', ['products', 'images'])

def build():
    for n in range(4, 9): index(n)
    for n in (1, 2, 3, 4): tech(n)
    for m in (1, 2, 3):
        for ns in (1, 2): journey(m, ns)
    ua_profile(); ua_pain(); tr_line(); tr_share(); tr_stat(); tr_key(); cp_matrix(); cp_map()
    rfp(); spec(); tco(); roadmap()
    for n in range(3, 9): bom(n)
    summary(); kpi(); pilot()
    value_props(); product_value(); product_spec()
    cp_score(); cp_win(); cp_pos()
    return META, HTML, SLOTS

if __name__ == '__main__':
    M, H, S = build()
    print(len(M), 'layouts')
