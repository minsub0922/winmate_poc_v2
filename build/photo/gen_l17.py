# 5차 — 경쟁사 분석 사진 레이아웃 8장 (L_PH_CP_B ~ L_PH_CP_I)
# 경쟁사는 익명(경쟁사 A · B · C) · 경쟁사 제품 자리는 rival() 실루엣 · 수치는 자리표시 · 사진은 samsung.com 도입사례 · 비즈니스 페이지
from gen_r5 import *
L = []

GREY = '#c3c8d1'


def T(b, text, x, y, w, h, st):
    """absolute text box"""
    return b.tb(text, ab(x, y, w, h, st), 'div')


def gl(inner, top, left=None, right=None, w=None, h=None, pad='10px 13px', gap=6):
    """dark glass on a photo, anchored left or right"""
    pos = f'position: absolute; top: {top}px; ' + (f'left: {left}px; ' if left is not None else f'right: {right}px; ')
    sz = (f'width: {w}px; ' if w else '') + (f'height: {h}px; ' if h else '')
    return (f'<div style="{pos}{sz}box-sizing: border-box; border-radius: 12px; background: {GLASS}; padding: {pad}; '
            f'display: flex; flex-direction: column; gap: {gap}px">{inner}</div>')


def stat_chip(b, text, hi=False):
    """supplier status chip on glass"""
    bg, c = (BLUE, '#ffffff') if hi else ('rgba(255,255,255,0.16)', LT)
    return b.tb(text, f'height: 22px; padding: 0 9px; border-radius: 999px; background: {bg}; color: {c}; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')


def kglass(b, top, val, unit, sub):
    """KPI glass content: small label + big number + one line"""
    return (b.tb(top, f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap')
            + bignum(b, val, unit, size=28, color='#ffffff', unit_size=14)
            + b.tb(sub, f'font-size: 11.5px; color: {LT}; white-space: nowrap'))


# ---------------------------------------------------------------- B · line-up coverage — space photos × suppliers
@layout(L, f='L_PH_CP_B', code='PH-CP-B', p='competition', p2='products', name='라인업 커버리지 · 공간 사진 × 공급사',
        when='고객 공간 다섯 곳에 들어갈 제품을 사진으로 보여 주고, 한 공급사로 모두 채울 수 있는지 공급사별로 견줄 때',
        pv=[], sample=CUST['HT'], grp='경쟁 · 제품 비교')
def _(b):
    s = header(b, EB_CP, '객실부터 연회장까지, 다섯 자리를 한 공급사로 채울 수 있습니다',
               'B 호텔 다섯 공간 × 공급사 라인업 · 공개 제품 목록 기준 · 출처: [제조사 카탈로그, 연도]', w=1152)
    CX0, CW, G = 206, 168, 12          # five space columns 206–1094
    RX, RW = 1106, 110                 # right column
    PY, PH = 152, 256                  # photo row
    spaces = [('객실', 'ph.ht-room-tv2', '0% 50%', '객실 사진 (고객 호텔로 교체)', 'cut.hg55bu', '호텔 TV', 'HG55BU'),
              ('로비', 'ph.ht-lobby-art', '82% 50%', '로비 사진 (고객 호텔로 교체)', 'cut.ifr', 'LED 사이니지', 'IFR'),
              ('연회장', 'ph.ht-ballroom', '62% 50%', '연회장 사진 (고객 호텔로 교체)', 'cut.vm55b', '비디오월', 'VM55B'),
              ('레스토랑', 'ph.ht-buffet-signage', '8% 50%', '레스토랑 입구 사진 (고객 호텔로 교체)', 'cut.qm43c', '사이니지', 'QM43C'),
              ('객실 공조', 'fill.ht_room_ac', '12% 50%', '객실 천장 공조 사진 (고객 호텔로 교체)', 'cut.wf1way', '무풍 에어컨', 'WindFree 1Way')]
    for i, (sp, pid, pos, hint, cpid, pn, pm) in enumerate(spaces):
        x = CX0 + i * (CW + G)
        s += photo(b, pid, x, PY, CW, PH, pos=pos, hint=hint, radius=12)
        s += tag_on(b, sp, x + 8, PY + 8)
        s += (f'<div style="{ab(x + 8, PY + PH - 60, CW - 16, 52, "box-sizing: border-box; border-radius: 10px; background: #ffffff; padding: 6px 8px 6px 6px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.18)")}">'
              + b.img(cpid, 'width: 48px; height: 40px; flex-shrink: 0', fit='contain', kind='cut', hint='이 자리에 들어갈 삼성 제품 컷', radius=6, pad=3, bg=SOFT)
              + '<span style="display: flex; flex-direction: column; min-width: 0">'
              + b.tb(pn, 'font-size: 13px; font-weight: 800; color: #121417; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(pm, f'{NUM}; font-size: 11px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span></div>')
    # left key card
    s += card(b.tb('호텔 다섯 자리', 'font-size: 15px; font-weight: 800; line-height: 22px')
              + b.tb('위 · 자리마다 들어갈 삼성 제품', f'font-size: 12px; line-height: 18px; color: {BODY}; {clamp(3)}')
              + b.tb('아래 · 공급사가 자사 제품으로 채울 수 있는지', f'font-size: 12px; line-height: 18px; color: {BODY}; {clamp(3)}')
              + '<span style="margin-top: auto"></span>'
              + b.tb('● 자사 제품', f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap')
              + b.tb('◐ 일부 · 협력사', f'font-size: 12px; font-weight: 700; color: {MUTED}; white-space: nowrap')
              + b.tb('○ 없음', f'font-size: 12px; font-weight: 700; color: {MUTED}; white-space: nowrap'),
              64, PY, 130, PH, pad='14px 14px', gap=6)
    # right header card
    s += card(b.tb('한 공급사로 채우는 자리', f'font-size: 14px; font-weight: 800; line-height: 20px; color: #ffffff; {clamp(3)}')
              + b.tb('● 만 셉니다 · 계약 · A/S 창구가 하나', f'font-size: 12px; line-height: 18px; color: {LT}; {clamp(4)}')
              + '<span style="margin-top: auto"></span>'
              + b.tb('↓', 'font-size: 22px; font-weight: 800; color: #ffffff'),
              RX, PY, RW, PH, bg=BLUE, pad='14px 14px', gap=8)
    # supplier rows
    rows = [('삼성전자', '호텔 TV · 사이니지 · 공조', '●●●●●', '5/5'),
            ('경쟁사 A', '디스플레이 중심', '●◐●●○', '3/5'),
            ('경쟁사 B', '공조 전문', '◐○○○●', '1/5'),
            ('경쟁사 C', '사이니지 전문', '○●●◐○', '2/5')]
    for r, (nm, sub, ms, cnt) in enumerate(rows):
        y = 420 + r * 58; hi = r == 0
        s += box(64, y, 1152, 54, CHIP if hi else SOFT, 10, f'border: 1.5px solid {BLUE}' if hi else '')
        s += f'<div style="{ab(78, y, 120, 54, "display: flex; flex-direction: column; justify-content: center; gap: 1px")}">' + sup(b, nm, sub, hi=hi, size=14) + '</div>'
        for i, m in enumerate(ms):
            s += mark(b, m, CX0 + i * (CW + G), y, CW, 54, hi=hi, size=22)
        s += T(b, cnt, RX, y, RW, 54, f'{NUM}; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: {BLUE if hi else MUTED}; white-space: nowrap')
    s += footer(b, DEAL['HT'] + ' · 표시는 예시 · 공개 제품 목록 기준 · 경쟁사 익명 · 사진: samsung.com 호텔 도입사례 · 비즈니스 페이지 · 제품 컷', 9)
    return s


# ---------------------------------------------------------------- C · 5-year TCO — product + stacked bars
@layout(L, f='L_PH_CP_C', code='PH-CP-C', p='competition', p2='cost', name='5년 총비용 · 제품 컷 + 누적 막대',
        when='도입가가 경쟁사보다 높을 때, 설치 · 전기료 · 유지보수까지 더한 5년 총비용을 공급사별 누적 막대로 견줄 때',
        pv=['L_CO_B'], sample=CUST['OF'], grp='경쟁 · 제품 비교')
def _(b):
    s = header(b, EB_CP, '도입가는 조금 높아도, 5년 총비용은 가장 낮습니다',
               'C 빌딩 사무 공간 천장형 에어컨 [00]대 기준 · 5년 총소유비용 · 출처: [견적서 · 에너지 효율 등급, 연도]', w=1152)
    BY = 600
    blue = ['#1428a0', '#3a4fc0', '#6f80d6', '#a4b0e8', '#d0d7f4']
    grey = ['#5d6472', '#7c8494', '#a1a8b5', '#c3c8d1', '#e0e3e8']
    items = ['도입가', '설치', '전기료 5년', '유지보수', '부품 교체']
    cols = [('삼성', '무풍 4Way 카세트', [68, 24, 68, 22, 12], True),
            ('경쟁사 A', '동급 4방향 카세트', [56, 24, 110, 34, 20], False),
            ('경쟁사 B', '동급 4방향 카세트', [52, 26, 118, 38, 26], False)]
    # conditions + legend
    s += card(b.tb('같은 조건', f'font-size: 12px; font-weight: 800; color: {BLUE}')
              + b.tb('천장형 [00]대 · 하루 [10]시간 · 5년', f'font-size: 12.5px; font-weight: 700; line-height: 19px; {clamp(3)}')
              + b.tb('전기료 [000]원/kWh', f'font-size: 12px; line-height: 18px; color: {MUTED}; {clamp(2)}'),
              64, 152, 132, 130, pad='12px 12px', gap=4)
    s += T(b, '5년 총비용 구성', 64, 318, 132, 18, 'font-size: 13px; font-weight: 800; white-space: nowrap')
    for k, it in enumerate(reversed(items)):
        y = 346 + k * 28; j = 4 - k
        s += rect(64, y + 3, 12, 14, blue[j], 2) + rect(78, y + 3, 12, 14, grey[j], 2)
        s += T(b, it, 98, y, 98, 20, f'font-size: 12.5px; color: {BODY}; white-space: nowrap; line-height: 20px')
    s += T(b, '왼쪽 칸 삼성 · 오른쪽 칸 경쟁사', 64, 492, 132, 36, f'font-size: 11px; line-height: 16px; color: {MUTED}; {clamp(2)}')
    s += T(b, '막대 높이는 예시', 64, 582, 132, 16, f'font-size: 11px; color: {FAINT}; white-space: nowrap')
    s += rect(212, BY, 528, 1, '#b8bec8')
    for i, (nm, model, segs, hi) in enumerate(cols):
        x = 212 + i * 182; W = 164
        if hi:
            s += cut(b, 'cut.wf4way', x, 152, W, 130, hint='삼성 제안 제품 컷', pad=16)
        elif i == 1:   # one silhouette slot shared by 경쟁사 A · B (같은 형태 — 공개 자료가 생기면 두 칸으로 나눔)
            s += rival(b, 'cassette', x, 152, W * 2 + 18, 130, hint='경쟁사 A · B 동급 4방향 카세트 사진 (공개 자료로 교체 · 두 칸으로 나눔)', pad=20)
        s += pill(b, nm, bg=BLUE if hi else FAINT, extra=f'position: absolute; left: {x + 8}px; top: 160px')
        bx, bw, y = x + 46, 72, BY
        for j, h in enumerate(segs):
            y -= h
            s += rect(bx, y, bw, h - 1, (blue if hi else grey)[j], 3 if j == 4 else 0)
        s += T(b, '[0,000]만 원', x, y - 28, W, 22, f'{NUM}; display: flex; justify-content: center; align-items: center; font-size: 15px; font-weight: 800; color: {BLUE if hi else INK}; white-space: nowrap')
        if hi:
            s += f'<div style="{ab(x, y - 58, W, 24, "display: flex; justify-content: center")}">' + pill(b, '5년 최저 · −[00]%') + '</div>'
        s += (f'<div style="{ab(x, BY + 8, W, 40, "display: flex; flex-direction: column; align-items: center; gap: 1px")}">'
              + b.tb(model, f'font-size: 13px; font-weight: 800; color: {BLUE if hi else INK}; white-space: nowrap')
              + b.tb('도입가 [000]만 원', f'{NUM}; font-size: 11px; color: {MUTED}; white-space: nowrap') + '</div>')
    # photo + conclusion
    s += photo(b, 'ph.of-office-ac', 768, 152, 448, 326, pos='50% 35%', hint='고객 사무 공간 공조 설치 사진으로 교체', radius=12)
    s += label_on(b, '설치 기준', '사무 공간 천장형 [00]대 · 하루 [10]시간 가동', 780, 410, 424, lines=1)
    s += card(b.tb('결론', f'font-size: 12px; font-weight: 800; color: {BLUE}')
              + b.tb('도입가는 [0]% 높지만 5년 총비용은 [00]% 낮습니다', f'font-size: 18px; font-weight: 800; line-height: 26px; {clamp(2)}')
              + b.tb('차이의 대부분은 전기료 — 무풍 · 인버터 운전으로 [00]% 절감', f'font-size: 12.5px; line-height: 18px; color: {BODY}; {clamp(2)}')
              + '<span style="margin-top: auto"></span>' + evid(b, '근거 · 5년 총비용 계산표 p.[00]'),
              768, 490, 448, 158, bg=CHIP, gap=5)
    s += footer(b, DEAL['OF'] + ' · 5년 · 같은 대수 기준 · 막대 높이는 예시 · 경쟁사 익명 · 경쟁사 제품은 실루엣 자리 · 사진: samsung.com 오피스 도입사례 · 제품 컷', 10)
    return s


# ---------------------------------------------------------------- D · four differentiators — demo scene photos
@layout(L, f='L_PH_CP_D', code='PH-CP-D', p='competition', p2='why', name='차별 기능 넷 · 시연 장면 사진',
        when='경쟁사가 따로 사야 하거나 없는 기능 네 가지를, 데모 데이에 직접 보여 줄 매장 장면 사진으로 약속할 때',
        pv=[], sample=CUST['RT'], grp='경쟁 · 제품 비교')
def _(b):
    s = header(b, EB_WHY, '경쟁사는 따로 사거나 없는 기능, 삼성은 기본으로 들어 있습니다',
               'D 리테일 플래그십 매장 기준 · 제공 여부는 공개 사양 기준 · 출처: [제조사 사양서, 연도]', w=1152)
    s += card(pill(b, '데모 데이')
              + b.tb('직접 보여드릴 네 장면', 'font-size: 18px; font-weight: 800; line-height: 26px; margin-top: 4px')
              + b.tb('말로 비교하는 대신 D 리테일 매장 화면으로 시연합니다', f'font-size: 13px; line-height: 20px; color: {BODY}; {clamp(3)}')
              + f'<span style="height: 1px; background: {LINE}; margin: 8px 0 4px"></span>'
              + b.tb('공급사 상태', f'font-size: 12px; font-weight: 800; color: {MUTED}')
              + ''.join(b.tb(k, f'font-size: 13px; font-weight: 800; color: {c}; white-space: nowrap; margin-top: 4px')
                        + b.tb(d, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                        for k, d, c in (('● 기본 제공', '추가 비용 없이 바로 시연', BLUE), ('◐ 별도 구매', '라이선스 · 부가 장비가 따로', BODY), ('○ 미지원', '다른 제품으로 대체해야', BODY)))
              + '<span style="margin-top: auto"></span>'
              + b.tb('네 장면 모두 삼성은', f'font-size: 12.5px; font-weight: 700; color: {BODY}')
              + bignum(b, '4/4', '기본 제공', size=34, unit_size=15)
              + '<span style="height: 6px"></span>' + evid(b, '시연 · [월 일] · [장소]'),
              64, 152, 220, 496, pad='18px 16px', gap=6)
    scenes = [('fill.vxt_control', '50% 50%', '콘텐츠 일괄 배포 · 예약 송출', ['●', '◐', '◐'], 'bottom', '본사 콘텐츠 편집 · 일괄 배포 화면 (실제 시연 화면으로 교체)'),
              ('r4.rt-store-facade', '50% 30%', '고휘도 윈도 사이니지 · 한낮에도 선명', ['●', '◐', '○'], 'bottom', '매장 외관 고휘도 화면 (고객 매장으로 교체)'),
              ('ph.rt-atrium-kiosk', '50% 100%', '터치 키오스크 · 상품 검색 · 길 안내', ['●', '●', '◐'], 'top', '매장 터치 키오스크 (고객 매장으로 교체)'),
              ('ph.rt-fashion-phone', '30% 50%', '모바일 연동 · 손님 휴대폰으로 화면 전환', ['●', '○', '○'], 'bottom-r', '모바일 연동 시연 장면 (고객 매장으로 교체)')]
    word = {'●': '기본 제공', '◐': '별도 구매', '○': '미지원'}
    W, H = 452, 242
    for i, (pid, pos, nm, st, where, hint) in enumerate(scenes):
        x = 300 + (i % 2) * (W + 12); y = 152 + (i // 2) * (H + 12)
        s += photo(b, pid, x, y, W, H, pos=pos, hint=hint, radius=12)
        inner = (b.tb(f'장면 {i + 1} · {nm}', 'font-size: 15px; font-weight: 800; color: #ffffff; white-space: nowrap; line-height: 20px')
                 + '<span style="display: flex; gap: 6px">'
                 + stat_chip(b, f'삼성 {st[0]} {word[st[0]]}', hi=True)
                 + stat_chip(b, f'경쟁사 A {st[1]} {word[st[1]]}') + stat_chip(b, f'B {st[2]} {word[st[2]]}') + '</span>')
        if where == 'bottom':
            s += gl(inner, y + H - 10 - 68, left=x + 10, h=68)
        elif where == 'bottom-r':
            s += gl(inner, y + H - 10 - 68, right=1280 - (x + W) + 10, h=68)
        else:
            s += gl(inner, y + 10, left=x + 10, h=68)
    s += footer(b, DEAL['RT'] + ' · 제공 여부는 공개 사양 기준 · 경쟁사 익명 · 사진: samsung.com 리테일 도입사례 · 비즈니스 페이지', 12)
    return s


# ---------------------------------------------------------------- E · spec check — win / tie / lose verdicts
@layout(L, f='L_PH_CP_E', code='PH-CP-E', p='competition', p2='spec', name='사양 대조 · 제품 컷 + 우위 판정',
        when='같은 급 제품 세 가지의 사양 일곱 줄을 맞대어 우위 · 동등 · 열위를 칩으로 판정하고 열위 대응까지 보일 때',
        pv=[], sample=CUST['ED'], grp='경쟁 · 제품 비교')
def _(b):
    s = header(b, EB_CP, '전자칠판 사양 일곱 가지 중 다섯 가지에서 앞섭니다',
               'E 대학교 강의실 75형 기준 · 공개 사양 비교 · 출처: [제조사 사양서, 연도]', w=1152)
    CX = [226, 426, 626]; CW = 192
    s += box(CX[0], 152, CW, 496, CHIP, 12, f'border: 1.5px solid {BLUE}')
    heads = [('삼성 전자칠판 75형', '[000]만 원대', True), ('경쟁사 A · [모델명]', '[000]만 원대', False), ('경쟁사 B · [모델명]', '[000]만 원대', False)]
    for i, (nm, pr, hi) in enumerate(heads):
        x = CX[i]
        if hi:
            s += cut(b, 'cut.wa75d', x + 8, 160, CW - 16, 132, hint='삼성 제안 제품 컷', pad=14, bg='#ffffff')
        else:
            s += rival(b, 'signage' if i == 1 else 'outdoor', x + 8, 160, CW - 16, 132, hint=f'{nm[:5]} 동급 전자칠판 사진 (공개 자료로 교체)')
        s += T(b, nm, x, 298, CW, 20, f'font-size: 14px; font-weight: 800; color: {BLUE if hi else INK}; text-align: center; white-space: nowrap')
        s += T(b, pr, x, 318, CW, 18, f'{NUM}; font-size: 12px; color: {MUTED}; text-align: center; white-space: nowrap')
    s += T(b, '사양', 64, 312, 150, 20, f'font-size: 12px; font-weight: 800; color: {MUTED}')
    rows = [('화면 · 해상도', '같은 75형 기준', '75형 · 4K', '75형 · 4K', '75형 · FHD', 'tie'),
            ('터치 반응', '낮을수록 좋음', '[00] ms', '[00] ms', '[00] ms', 'win'),
            ('동시 터치', '여러 학생이 함께 판서', '[20]점', '[10]점', '[10]점', 'win'),
            ('화면 공유', '학생 기기 → 칠판', '무선 [4]대', '무선 [1]대', '유선만', 'win'),
            ('원격 관리', '교내 일괄 업데이트', '교내 일괄', '별도 구매', '미지원', 'win'),
            ('보증 기간', '패널 · 본체', '[3]년', '[2]년', '[2]년', 'win'),
            ('구매가', '낮을수록 좋음', '[000]만 원', '[000]만 원', '[000]만 원', 'lose')]
    chipst = {'win': ('우위', BLUE, '#ffffff'), 'tie': ('동등', '#dfe2e7', BODY), 'lose': ('열위', WARN, '#ffffff')}
    for r, (nm, d, va, vb, vc, res) in enumerate(rows):
        y = 344 + r * 43
        s += rect(64, y, 754, 1, LINE)
        s += (f'<div style="{ab(64, y, 150, 43, "display: flex; flex-direction: column; justify-content: center; gap: 0")}">'
              + b.tb(nm, 'font-size: 13px; font-weight: 800; line-height: 18px; white-space: nowrap')
              + b.tb(d, f'font-size: 11px; line-height: 15px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        t, bg, c = chipst[res]
        s += (f'<div style="{ab(CX[0] + 12, y, CW - 24, 43, "display: flex; align-items: center; justify-content: space-between; gap: 6px")}">'
              + b.tb(va, f'{NUM}; font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0')
              + b.tb(t, f'flex-shrink: 0; height: 22px; padding: 0 9px; border-radius: 999px; background: {bg}; color: {c}; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap') + '</div>')
        for k, v in ((1, vb), (2, vc)):
            ahead = res == 'lose' and k == 1
            s += T(b, v, CX[k], y, CW, 43, f'{NUM}; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: {800 if ahead else 700}; color: {INK if ahead else MUTED}; white-space: nowrap')
    # photo + summary
    s += photo(b, 'fill.class_flip', 840, 152, 376, 286, pos='50% 40%', hint='강의실 전자칠판 수업 사진 (고객 캠퍼스로 교체)', radius=12)
    s += label_on(b, '설치 장면', '강의실 [00]곳 · 판서와 화면 공유 수업', 852, 370, 352, lines=1)
    cnt = lambda lab, n, col: ('<span style="display: flex; flex-direction: column; gap: 0">'
                               + b.tb(lab, f'font-size: 12px; font-weight: 800; color: {col}; white-space: nowrap')
                               + b.tb(n, f'{NUM}; font-size: 30px; font-weight: 800; line-height: 36px; color: {col}; white-space: nowrap') + '</span>')
    s += card('<span style="display: flex; gap: 28px">' + cnt('우위', '[5]', BLUE) + cnt('동등', '[1]', MUTED) + cnt('열위', '[1]', WARN) + '</span>'
              + f'<span style="height: 1px; background: {LINE}; margin: 6px 0 4px"></span>'
              + b.tb('열위는 이렇게 대응', f'font-size: 12px; font-weight: 800; color: {WARN}')
              + b.tb('구매가 — 교육기관 묶음 단가와 [5]년 보증으로 5년 총비용을 맞춥니다', f'font-size: 13px; font-weight: 700; line-height: 20px; {clamp(2)}')
              + '<span style="margin-top: auto"></span>' + evid(b, '근거 · 사양 비교표 p.[00]'),
              840, 450, 376, 198, gap=4)
    s += footer(b, DEAL['ED'] + ' · 공개 사양 기준 · 경쟁사 익명 · 경쟁사 제품은 실루엣 자리 · 사진: samsung.com 교육 비즈니스 페이지 · 제품 컷', 11)
    return s


# ---------------------------------------------------------------- F · market position — big number on hero photo
@layout(L, f='L_PH_CP_F', code='PH-CP-F', p='competition', p2='market', name='시장 지위 · 큰 숫자 + 현장 히어로',
        when='글로벌 점유율 1위 같은 시장 지위를 현장 대형 화면 사진 위 큰 숫자로, 상위 공급사 점유율과 함께 보일 때',
        pv=[], sample=CUST['VN'], grp='경쟁 · 시장 경쟁력')
def _(b):
    s = header(b, EB_CP, '경기장 대형 화면, 가장 많이 선택받아 온 공급사입니다',
               '글로벌 디지털 사이니지 시장 점유율 · 출하 금액 기준 · 출처: [조사 기관, 연도]', w=1152)
    s += photo(b, 'ph.vn-stadium-board', 64, 152, 684, 496, pos='50% 30%', hint='경기장 대형 전광판 히어로 사진 (고객 경기장으로 교체)', radius=16)
    s += tag_on(b, '[ ] 경기장 · 외야 대형 전광판', 80, 168)
    s += glass(b.tb('글로벌 디지털 사이니지 시장', f'font-size: 12px; font-weight: 800; color: {LB}; white-space: nowrap')
               + bignum(b, '[00]', '년 연속 점유율 1위', size=52, color='#ffffff', unit_size=22)
               + b.tb('출처: [조사 기관, 연도] · 출하 금액 기준', f'font-size: 11.5px; color: {LT}; white-space: nowrap'),
               84, 500, 460, None, pad='14px 18px', gap=8)
    # right — top 5 bars
    s += T(b, '상위 5 공급사 점유율', 772, 152, 444, 22, 'font-size: 16px; font-weight: 800; white-space: nowrap')
    s += T(b, '[연도] · 글로벌 디지털 사이니지', 772, 176, 444, 18, f'font-size: 12px; color: {MUTED}; white-space: nowrap')
    bars = [('삼성전자', 1.0), ('공급사 A', 0.62), ('공급사 B', 0.48), ('공급사 C', 0.36), ('공급사 D', 0.28)]
    for i, (nm, r) in enumerate(bars):
        y = 212 + i * 46; hi = i == 0; w = round(270 * r)
        s += T(b, nm, 772, y, 86, 28, f'display: flex; align-items: center; font-size: 13px; font-weight: 800; color: {BLUE if hi else BODY}; white-space: nowrap')
        s += rect(864, y + 5, w, 18, BLUE if hi else GREY, 4)
        s += T(b, '[00]%', 864 + w + 8, y, 60, 28, f'{NUM}; display: flex; align-items: center; font-size: 13px; font-weight: 800; color: {BLUE if hi else MUTED}; white-space: nowrap')
    s += T(b, '막대 길이는 예시', 772, 442, 200, 16, f'font-size: 11px; color: {FAINT}; white-space: nowrap')
    stats = [('설치 국가', '[000]', '개국', '삼성 사이니지가 켜진 나라'), ('누적 공급', '[00]', '만 대', '경기장 · 공연장 포함 누적'), ('서비스 거점', '[000]', '곳', '국내외 기술 지원 거점')]
    for i, (lab, v, u, d) in enumerate(stats):
        s += card(b.tb(lab, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap')
                  + b.tb(d, f'font-size: 12px; line-height: 18px; color: {BODY}; {clamp(2)}')
                  + '<span style="margin-top: auto"></span>' + bignum(b, v, u, size=30, unit_size=14)
                  + b.tb('[연도] 기준', f'font-size: 11px; color: {MUTED}; white-space: nowrap'),
                  772 + i * 152, 476, 140, 172, pad='16px 14px', gap=4)
    s += footer(b, DEAL['VN'] + ' · 순위 · 점유율은 출처 확인 후 기입 · 막대 길이는 예시 · 경쟁사 익명 · 사진: samsung.com 경기장 도입사례 · 비즈니스 페이지', 8)
    return s


# ---------------------------------------------------------------- G · positioning map — Samsung as a photo bubble
@layout(L, f='L_PH_CP_G', code='PH-CP-G', p='competition', p2='market', name='포지셔닝 맵 · 삼성은 사진 버블',
        when='공급사들이 가격형과 통합 운영형으로 갈리는 구도를 맵으로 보이고, 고객 요구 영역에 선 삼성을 매장 사진으로 찍을 때',
        pv=['L_CP_B'], sample=CUST['FB'], grp='경쟁 · 시장 경쟁력')
def _(b):
    s = header(b, EB_CP, "시장은 '가격형'과 '통합 운영형'으로 나뉩니다",
               '공급사 포지셔닝 · 원 크기는 점유율 · 공개 자료 기반 · 출처: [조사 기관, 연도]', w=1152)
    s += box(64, 152, 600, 496, SOFT, 16)
    s += T(b, '원격 운영 솔루션 성숙도 ↑', 84, 164, 260, 18, f'font-size: 12px; font-weight: 800; color: {BODY}; white-space: nowrap')
    s += rect(100, 190, 1, 398, '#c3c8d1') + rect(100, 588, 540, 1, '#c3c8d1')
    s += T(b, '좁음', 100, 596, 60, 18, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap')
    s += T(b, '하드웨어 라인업 폭 →', 250, 596, 240, 18, f'font-size: 12px; font-weight: 800; color: {BODY}; text-align: center; white-space: nowrap')
    s += T(b, '넓음', 580, 596, 60, 18, f'font-size: 11.5px; color: {MUTED}; text-align: right; white-space: nowrap')
    s += T(b, '위치 · 원 크기는 예시 · 데이터 연결 시 자동 반영', 100, 620, 400, 16, f'font-size: 11px; color: {FAINT}; white-space: nowrap')
    # groups
    s += f'<div style="{ab(118, 420, 270, 150, "box-sizing: border-box; border-radius: 50%; border: 1.5px dashed #b8bec8; background: rgba(138,145,160,0.08)")}"></div>'
    s += f'<div style="{ab(296, 200, 344, 210, "box-sizing: border-box; border-radius: 50%; border: 1.5px dashed #9fb0e6; background: rgba(20,40,160,0.04)")}"></div>'
    s += T(b, '가격형 그룹', 150, 396, 120, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap')
    s += T(b, '통합 운영형 그룹', 318, 370, 140, 18, f'font-size: 12px; font-weight: 800; color: #5b6fd0; white-space: nowrap')
    s += f'<div style="{ab(420, 196, 220, 186, f"box-sizing: border-box; border-radius: 12px; border: 1.5px dashed {BLUE}; background: rgba(20,40,160,0.06)")}"></div>'
    s += pill(b, 'A 커피 요구 영역', extra='position: absolute; left: 428px; top: 204px')
    # rivals — grey circles sized by share
    dots = [('공급사 A', 180, 476, 44), ('공급사 B', 300, 504, 32), ('공급사 C', 214, 540, 26), ('공급사 D', 350, 296, 34), ('공급사 E', 470, 400, 26)]
    for nm, cx, cy, d in dots:
        s += f'<div style="{ab(cx - d // 2, cy - d // 2, d, d, "border-radius: 50%; background: #a1a8b5; border: 2px solid #ffffff; box-sizing: border-box")}"></div>'
        s += T(b, nm, cx + d // 2 + 6, cy - 9, 70, 18, f'font-size: 12px; font-weight: 700; color: {BODY}; white-space: nowrap')
    # Samsung — photo bubble
    s += photo(b, 'ph.fb-counter-menu', 482, 226, 140, 140, pos='50% 30%', hint='삼성 메뉴보드 도입 매장 사진 (원형)', radius=70)
    s += f'<div style="{ab(478, 222, 148, 148, f"box-sizing: border-box; border-radius: 50%; border: 4px solid {BLUE}")}"></div>'
    s += f'<div style="{ab(452, 356, 200, 22, "display: flex; justify-content: center")}">' + pill(b, '삼성전자', extra='border: 2px solid #ffffff') + '</div>'
    # right — photo, how to read, three readings
    s += photo(b, 'ph.fb-cafe-counter', 680, 152, 536, 212, pos='50% 30%', hint='고객 매장 사진 (A 커피 매장으로 교체)', radius=12)
    s += label_on(b, 'A 커피가 원하는 자리', '[320]개 매장 메뉴를 본사에서 한 번에', 692, 296, 340, lines=1)
    s += (f'<div style="{ab(680, 376, 536, 58, f"box-sizing: border-box; border-radius: 10px; border: 1px solid {LINE}; padding: 10px 14px; display: flex; gap: 14px; align-items: center")}">'
          + b.tb('읽는 법', f'flex-shrink: 0; font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + '<span style="display: flex; flex-direction: column; min-width: 0">'
          + b.tb('가로 → 크기 · 옥외 · 키오스크까지 제품군 폭', f'font-size: 12px; line-height: 18px; color: {BODY}; white-space: nowrap')
          + b.tb('세로 ↑ 원격 배포 · 모니터링 · 연동 수준', f'font-size: 12px; line-height: 18px; color: {BODY}; white-space: nowrap') + '</span></div>')
    reads = [('시장은 두 그룹으로 나뉩니다', '가격형은 단품 공급, 통합 운영형은 CMS · 원격 관리까지 함께 제공'),
             ('A 커피 요구는 오른쪽 위 영역', '[320]개 매장 일괄 운영에는 라인업 폭과 원격 운영이 모두 필요'),
             ('비교 기준은 총 운영 비용', '도입가만이 아니라 [0]년 운영 비용까지 함께 비교해야 합니다')]
    for i, (t, d) in enumerate(reads):
        y = 446 + i * 68
        if i: s += rect(680, y - 6, 536, 1, LINE)
        s += (f'<div style="{ab(680, y, 536, 62, "display: flex; gap: 12px; align-items: flex-start")}">' + numtag(b, str(i + 1), 24)
              + '<span style="display: flex; flex-direction: column; gap: 2px; min-width: 0">'
              + b.tb(t, 'font-size: 14px; font-weight: 800; line-height: 22px; white-space: nowrap')
              + b.tb(d, f'font-size: 12.5px; line-height: 18px; color: {BODY}; {clamp(2)}') + '</span></div>')
    s += footer(b, DEAL['FB'] + ' · 위치 · 원 크기는 예시 · 경쟁사 익명 · 사진: samsung.com 카페 도입사례 · 비즈니스 페이지', 8)
    return s


# ---------------------------------------------------------------- H · share trend + three drivers in photos
@layout(L, f='L_PH_CP_H', code='PH-CP-H', p='competition', p2='market', name='점유율 추이 · 끌어올린 세 가지 사진',
        when='3년 점유율 추이를 누적 막대로 줄여 보이고, 점유율을 움직인 신제품 · CMS · 일괄 구축을 사진 카드로 설명할 때',
        pv=['L_CP_C'], sample=CUST['FB'], grp='경쟁 · 시장 경쟁력')
def _(b):
    s = header(b, EB_CP, '삼성 점유율이 3년 동안 [0.0]p 올랐습니다 — 움직인 건 세 가지입니다',
               '외식 · 카페 디지털 메뉴보드 시장 점유율 · 출처: [조사 기관, 연도]', w=1152)
    segc = [(BLUE, '#ffffff'), ('#7c8494', '#ffffff'), ('#b3b9c4', INK), ('#e0e3e8', BODY)]
    names = ['삼성전자', '경쟁사 A', '경쟁사 B', '기타']
    s += (f'<div style="{ab(64, 152, 496, 18, "display: flex; gap: 16px; align-items: center")}">'
          + ''.join(f'<span style="display: flex; gap: 6px; align-items: center"><i style="width: 10px; height: 10px; border-radius: 2px; background: {segc[k][0]}"></i>'
                    + b.tb(n, f'font-size: 12px; font-weight: 700; color: {BODY}; white-space: nowrap') + '</span>' for k, n in enumerate(names)) + '</div>')
    years = [('2023', [0.30, 0.28, 0.17, 0.25]), ('2024', [0.34, 0.26, 0.16, 0.24]), ('2025', [0.39, 0.24, 0.15, 0.22])]
    for i, (yr, sh) in enumerate(years):
        y = 186 + i * 68
        s += T(b, yr, 64, y, 44, 48, f'{NUM}; display: flex; align-items: center; font-size: 14px; font-weight: 800; color: {INK if i == 2 else MUTED}')
        x = 112
        for k, r in enumerate(sh):
            w = round(448 * r) if k < 3 else 560 - x
            s += T(b, '[00]%', x, y, w - 2, 48, f'{NUM}; display: flex; align-items: center; justify-content: center; background: {segc[k][0]}; color: {segc[k][1]}; font-size: 12.5px; font-weight: 800; white-space: nowrap; border-radius: {"6px 0 0 6px" if k == 0 else "0 6px 6px 0" if k == 3 else "0"}')
            x += w
    s += card(b.tb('2025 삼성전자 점유율', f'font-size: 12px; font-weight: 800; color: {BLUE}')
              + '<span style="display: flex; align-items: baseline; gap: 12px">' + bignum(b, '[00]', '%', size=44)
              + b.tb('2023 대비 ▲ [0.0]p', f'font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>'
              + f'<span style="height: 1px; background: #cfd6f2; margin: 8px 0 6px"></span>'
              + ''.join('<span style="display: flex; justify-content: space-between; gap: 8px">'
                        + b.tb(n, f'font-size: 12.5px; font-weight: 700; color: {BODY}; white-space: nowrap')
                        + b.tb(v, f'{NUM}; font-size: 12.5px; font-weight: 700; color: {MUTED}; white-space: nowrap') + '</span>'
                        for n, v in (('경쟁사 A', '[00]% · ▼ [0.0]p'), ('경쟁사 B', '[00]% · ▼ [0.0]p'), ('기타', '[00]% · ▼ [0.0]p'), ('상위 3사 합계', '[00]% · ▲ [0.0]p'))),
              64, 404, 496, 244, bg=CHIP, pad='16px 18px', gap=6)
    # right — three drivers
    s += T(b, '점유율을 움직인 세 가지', 584, 150, 400, 22, 'font-size: 16px; font-weight: 800; white-space: nowrap')
    s += T(b, '2023 → 2025', 1016, 152, 200, 20, f'{NUM}; font-size: 12px; font-weight: 700; color: {MUTED}; text-align: right; white-space: nowrap')
    drivers = [('cut.km24c', None, '신제품', '키오스크 · 메뉴보드', '[연도] 출시 · 매장 크기별 [0]종으로 라인업 확대', '신규 매장 채택 [00]%'),
               ('fill.vxt_people', '50% 45%', '클라우드 CMS', '클라우드 CMS', '지역별 매장 화면을 본사 한 곳에서 등록 · 관리', '관리 화면 [0,000]면'),
               ('ph.fb-pickup', '55% 30%', '일괄 구축', '프랜차이즈 일괄 구축', '커피 프랜차이즈 [ ]점 등 [000]개 매장을 한 번에 설치', '일괄 구축 [00]개 브랜드')]
    for i, (pid, pos, tag, t, d, k) in enumerate(drivers):
        x = 584 + i * 216
        s += box(x, 184, 200, 464, SOFT, 12)
        if pos is None:
            s += cut(b, pid, x, 184, 200, 300, hint='신제품 컷', pad=22)
            s += tag_on(b, tag, x + 10, 194, dark=False)
        else:
            s += photo(b, pid, x, 184, 200, 300, pos=pos, hint='점유율을 움직인 요인 사진', radius=12)
            s += tag_on(b, tag, x + 10, 194)
        s += (f'<div style="{ab(x, 484, 200, 164, "box-sizing: border-box; padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px")}">'
              + '<span style="display: flex; gap: 8px; align-items: center">' + numtag(b, str(i + 1), 22)
              + b.tb(t, 'font-size: 14px; font-weight: 800; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0') + '</span>'
              + b.tb(d, f'font-size: 12.5px; line-height: 19px; color: {BODY}; {clamp(3)}')
              + '<span style="margin-top: auto"></span>' + evid(b, k, color=BLUE, border='#cfd6f2') + '</div>')
    s += footer(b, DEAL['FB'] + ' · 비율은 예시 · 데이터 연결 시 자동 반영 · 경쟁사 익명 · 사진: samsung.com 카페 도입사례 · 비즈니스 페이지 · 제품 컷', 9)
    return s


# ---------------------------------------------------------------- I · service capability — regional bars + field photos
@layout(L, f='L_PH_CP_I', code='PH-CP-I', p='competition', p2='why', name='서비스 역량 · 권역 막대 + 현장 사진',
        when='전국 권역별 서비스 거점 수와 출동 시간을 경쟁사와 막대로 견주고, 점검 · 물류 · 관제 현장 사진으로 뒷받침할 때',
        pv=[], sample=CUST['PB'], grp='경쟁 · 시장 경쟁력')
def _(b):
    s = header(b, EB_WHY, '여섯 권역 어디서든 [0]시간 안에 엔지니어가 도착합니다',
               'S 지자체 공공 시설 기준 · 권역별 서비스 거점 수와 평균 출동 시간 · 출처: [서비스 거점 현황, 연도]', w=1152)
    s += (f'<div style="{ab(64, 152, 440, 20, "display: flex; gap: 16px; align-items: center")}">'
          + b.tb('권역별 서비스 거점', 'font-size: 13px; font-weight: 800; white-space: nowrap')
          + f'<span style="display: flex; gap: 6px; align-items: center"><i style="width: 10px; height: 10px; border-radius: 2px; background: {BLUE}"></i>'
          + b.tb('삼성전자', f'font-size: 12px; font-weight: 700; color: {BODY}; white-space: nowrap') + '</span>'
          + f'<span style="display: flex; gap: 6px; align-items: center"><i style="width: 10px; height: 10px; border-radius: 2px; background: {GREY}"></i>'
          + b.tb('경쟁사 A', f'font-size: 12px; font-weight: 700; color: {BODY}; white-space: nowrap') + '</span></div>')
    s += T(b, '평균 출동', 528, 152, 112, 20, f'font-size: 13px; font-weight: 800; text-align: right; white-space: nowrap')
    regs = [('수도권', 1.0, 0.62), ('강원', 0.30, 0.12), ('충청', 0.46, 0.26), ('호남', 0.44, 0.22), ('영남', 0.72, 0.42), ('제주', 0.16, 0.06)]
    for i, (nm, a, c) in enumerate(regs):
        y = 182 + i * 68
        s += rect(64, y, 576, 1, LINE)
        s += T(b, nm, 64, y, 84, 68, 'display: flex; align-items: center; font-size: 14px; font-weight: 800; white-space: nowrap')
        for k, (r, col, tc) in enumerate(((a, BLUE, BLUE), (c, GREY, MUTED))):
            w = max(8, round(300 * r)); yy = y + 16 + k * 22
            s += rect(152, yy, w, 14, col, 3)
            s += T(b, '[00]곳', 152 + w + 6, yy - 3, 60, 20, f'{NUM}; font-size: 12px; font-weight: 800; color: {tc}; white-space: nowrap; line-height: 20px')
            s += T(b, '[0]시간', 540, yy - 3, 100, 20, f'{NUM}; font-size: 13px; font-weight: 800; color: {tc}; text-align: right; white-space: nowrap; line-height: 20px')
    s += (f'<div style="{ab(64, 600, 576, 48, f"box-sizing: border-box; border-radius: 10px; background: {CHIP}; display: flex; align-items: center; justify-content: center; gap: 14px")}">'
          + b.tb('전국 거점', f'font-size: 12.5px; font-weight: 700; color: {BODY}; white-space: nowrap')
          + b.tb('삼성 [000]곳', f'font-size: 15px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + b.tb('경쟁사 A [00]곳', f'font-size: 14px; font-weight: 800; color: {MUTED}; white-space: nowrap')
          + b.tb('평균 출동 [0]시간 vs [0]시간', f'font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</div>')
    # right — field photos with KPI
    s += photo(b, 'ph.svc-technician', 664, 152, 552, 256, pos='50% 30%', hint='엔지니어 현장 점검 사진 (공공 시설 점검 장면으로 교체)', radius=12)
    s += tag_on(b, '현장 점검', 676, 164)
    s += gl(kglass(b, '전담 엔지니어', '[000]', '명', '정기 점검 연 [0]회'), 408 - 12 - 92, right=1280 - 1216 + 12, pad='10px 14px', gap=2)
    s += photo(b, 'fill.wh_workers', 664, 420, 270, 228, pos='50% 30%', hint='부품 물류 센터 사진', radius=12)
    s += tag_on(b, '부품 물류', 676, 432)
    s += gl(kglass(b, '부품 당일 출고', '[00]', '%', '권역 창고 [0]곳'), 648 - 12 - 92, left=676, pad='10px 14px', gap=2)
    s += photo(b, 'ph.pb-control', 946, 420, 270, 228, pos='50% 40%', hint='원격 관제 센터 사진 (서비스 관제실로 교체)', radius=12)
    s += tag_on(b, '원격 관제', 958, 432)
    s += gl(kglass(b, '원격 진단으로 해결', '[00]', '%', '24시간 · 365일'), 648 - 12 - 92, left=958, pad='10px 14px', gap=2)
    s += footer(b, DEAL['PB'] + ' · 거점 수 · 출동 시간은 출처 확인 후 기입 · 막대 길이는 예시 · 경쟁사 익명 · 사진: samsung.com 공공 · 서비스 도입사례 · 비즈니스 페이지', 13)
    return s
