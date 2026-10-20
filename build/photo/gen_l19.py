# 5차 — 경쟁 · 대응 전략(PH-CP-T ~ X) · 시사점 / 제안 방향(PH-IM-B ~ E) 사진 레이아웃
from gen_r5 import *
L = []
import math


def _src(k):
    return f'사진: samsung.com {SRC[k]} 도입사례 · 비즈니스 페이지'


def _row(inner, gap=8, extra=''):
    return f'<span style="display: flex; align-items: center; gap: {gap}px; {extra}">{inner}</span>'


def _seg(x1, y1, x2, y2, color, w=2, dash=False):
    """선분 (div 회전) — 레이더 축 · 테두리"""
    ln = math.hypot(x2 - x1, y2 - y1); ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
    bg = f'repeating-linear-gradient(90deg, {color} 0 6px, transparent 6px 10px)' if dash else color
    return f'<div style="{ab(round(x1, 1), round(y1 - w / 2, 1), round(ln, 1), w, f"background: {bg}; transform: rotate({ang:.2f}deg); transform-origin: 0 50%")}"></div>'


def _poly(pts, color, x0=64, y0=150, w=720, h=500):
    """채운 다각형 (CSS clip-path: polygon)"""
    p = ', '.join(f'{x - x0:.1f}px {y - y0:.1f}px' for x, y in pts)
    return f'<div style="{ab(x0, y0, w, h, f"background: {color}; clip-path: polygon({p})")}"></div>'


def _chip(b, text, kind='blue', size=11.5, h=22):
    bg, c, bd = {'blue': (CHIP, BLUE, CHIP), 'gray': (SOFT, MUTED, SOFT), 'warn': (WARNBG, WARN, WARN), 'white': ('#ffffff', BLUE, '#ffffff'),
                 'line': ('#ffffff', BODY, LINE), 'solid': (BLUE, '#ffffff', BLUE), 'ink': (INK, '#ffffff', INK)}[kind]
    return b.tb(text, f'flex-shrink: 0; height: {h}px; box-sizing: border-box; padding: 0 9px; border-radius: 999px; background: {bg}; color: {c}; border: 1px solid {bd}; font-size: {size}px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')


# ================================================================ 1. 경쟁사 주장 → 사실 · 증거 사진
@layout(L, f='L_PH_CP_T', code='PH-CP-T', p='competition', p2='why', name='경쟁사 주장 → 사실 · 증거 사진',
        when='평가 자리에서 경쟁사가 할 법한 주장 셋을 먼저 꺼내, 확인된 사실과 증거 장면 · 근거 수치로 답할 때',
        pv=['L_ST_E'], sample=CUST['FB'], grp='경쟁 · 대응 전략')
def _(b):
    s = header(b, EB_CP, '비교할 때 나올 세 가지 말, 사실과 증거로 답합니다', '경쟁사 예상 주장 → 확인된 사실 → 증거 장면 · 근거 수치 · 출처: [영업 현장 · 공개 자료, 연도]', w=1152)
    for x, t in ((64, '경쟁사 예상 주장'), (420, '확인된 사실'), (752, '증거 장면 · 근거 수치')):
        s += b.tb(t, ab(x, 152, 300, 16, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    rows = [('경쟁사 C', 'signage', '“소프트웨어만 바꾸면 더\u00a0싸다”', '5년 총비용은 오히려 높습니다', '기존 화면을 다시 쓰면 밝기 저하로 [0]년 안에 교체가 필요합니다',
             'ph.fb-cafe-bright', '50% 40%', '창가 매장 · 하루 [16]시간 켜 두는 메뉴보드', '근거 · 총소유비용 비교 p.[00]', '5년 총비용', '−[00]', '%'),
            ('경쟁사 D', 'kiosk', '“수도권 설치가 더 빠르다”', '오픈 일정은 같습니다', '시공 협력사 2팀을 더하고, 야간에 두 매장씩 동시 설치합니다',
             'r4.ed-ac-check', '50% 30%', '야간 설치 · 시공 엔지니어', '근거 · 시공 일정표 p.[00]', '매장당 설치', '[0]', '일'),
            ('경쟁사 B', 'led', '“글로벌 레퍼런스가 더\u00a0많다”', '국내 외식 사례가 더 직접적입니다', '이번 요구는 국내 외식 매장 운영 — 국내 도입 사례와 직영 서비스망으로 답합니다',
             'ph.fb-pickup', '50% 30%', '국내 외식 도입 · 커피 프랜차이즈 [ ]점', '근거 · 국내 도입 사례집 p.[00]', '국내 외식 도입', '[00]', '곳')]
    for i, (who, kind, quote, fact, fdesc, pid, pos, tag, ev, vl, val, unit) in enumerate(rows):
        y = 176 + i * 161
        # 경쟁사 예상 주장 — 회색 따옴표 카드 + 실루엣
        s += box(64, y, 316, 150, SOFT, 14)
        s += card(_row(_chip(b, who, 'ink') + b.tb('예상 주장', f'font-size: 11.5px; color: {FAINT}; white-space: nowrap'))
                  + b.tb(quote, f'font-size: 17px; font-weight: 800; line-height: 25px; {clamp(3)}'),
                  64, y, 222, 150, bg='transparent', pad='20px 0 16px 20px', gap=12)
        s += rival(b, kind, 290, y + 18, 78, 114, hint=f'{who} 제품 사진 (공개 자료로 교체)', radius=10, pad=8, bg='#ffffff')
        s += ARR(380, y + 65, 40, 20)
        # 확인된 사실
        s += card(b.tb('✓ 사실', f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap')
                  + b.tb(fact, 'font-size: 17px; font-weight: 800; line-height: 24px; white-space: nowrap')
                  + b.tb(fdesc, f'font-size: 13px; line-height: 20px; color: {BODY}; {clamp(3)}'),
                  420, y, 308, 150, bg='#ffffff', border=LINE, pad='18px 18px', gap=6, radius=14)
        s += ARR(728, y + 65, 24, 20, size=16)
        # 증거 장면 + 근거 수치
        s += photo(b, pid, 752, y, 464, 150, pos=pos, hint=f'증거 장면 · {tag}', radius=14)
        s += tag_on(b, tag, 764, y + 12)
        s += glass(b.tb(ev, f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap')
                   + _row(b.tb(vl, f'font-size: 12px; font-weight: 700; color: {LT}; white-space: nowrap') + bignum(b, val, unit, size=26, color='#ffffff'), gap=10),
                   764, y + 72, None, None, pad='9px 14px', gap=2)
    s += footer(b, DEAL['FB'] + ' · 주장은 공개 자료 · 영업 현장 기준 예상 · 경쟁사 익명 · 경쟁사 제품은 실루엣 자리 · ' + _src('FB'), 12)
    return s


# ================================================================ 2. 경쟁사 프로필 3 + 우리
@layout(L, f='L_PH_CP_U', code='PH-CP-U', p='competition', p2='why', name='경쟁사 프로필 3 · 실루엣 + 우리 설치 사진',
        when='비교 대상 경쟁사 셋의 주력 제품 · 가격대 · 솔루션 · 레퍼런스 · 동향을 한 장에 펼치고, 우리의 답을 나란히 놓을 때',
        pv=['L_CM_D'], sample=CUST['FB'], grp='경쟁 · 대응 전략')
def _(b):
    s = header(b, EB_CP, '비교 대상 세 곳과 우리, 각자의 강점과 빈자리', '주력 제품 · 가격대 · 솔루션 · 레퍼런스 · 최근 동향 · 출처: [공개 자료 · 영업 정보, 연도]', w=780)
    s += (f'<div style="{ab(856, 116, 360, 22, "display: flex; align-items: center; justify-content: flex-end; gap: 6px")}">'
          + b.tb('삼성 대비 6항목', f'font-size: 11px; color: {FAINT}; white-space: nowrap; margin-right: 2px') + _chip(b, '우위', 'blue', 11, 20)
          + b.tb('삼성이 앞섬', f'font-size: 11px; color: {MUTED}; white-space: nowrap') + _chip(b, '열위', 'warn', 11, 20)
          + b.tb('경쟁사가 앞섬', f'font-size: 11px; color: {MUTED}; white-space: nowrap') + '</div>')
    cols = [('경쟁사 A', '국내 대형 가전 · 사이니지', 'signage', [('주력 제품', '사이니지 풀 라인업'), ('가격대', '₩₩ · 중간'), ('솔루션', '자체 CMS · 서버 필요'), ('레퍼런스', '외식 [00]건'), ('최근 동향', '신제품 [00]형 출시')], (4, 2, 0), '“우리도 전 라인업이 있다”'),
            ('경쟁사 B', '글로벌 사이니지 전문', 'led', [('주력 제품', '고휘도 · 대형 LED'), ('가격대', '₩₩₩ · 높음'), ('솔루션', '외부 CMS 연동'), ('레퍼런스', '글로벌 [00]건'), ('최근 동향', '국내 파트너 교체')], (3, 3, 0), '“글로벌 레퍼런스가 더 많다”'),
            ('경쟁사 C', '클라우드 CMS 소프트웨어', 'tablet', [('주력 제품', '소프트웨어만 공급'), ('가격대', '₩ · 낮음'), ('솔루션', '자체 클라우드 CMS'), ('레퍼런스', '외식 [00]건'), ('최근 동향', '요금제 인하')], (4, 1, 1), '“소프트웨어만 바꾸면 더 싸다”')]
    W = 276
    def rows(items, hi=False):
        return ''.join(_row(b.tb(k, f'width: 52px; flex-shrink: 0; font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap')
                            + b.tb(v, f'min-width: 0; font-size: 13px; font-weight: 800; color: {BLUE if hi and k == "솔루션" else INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), gap=8)
                       for k, v in items)
    for i, (nm, sub, kind, items, (w_, t_, l_), say) in enumerate(cols):
        x = 64 + i * (W + 16)
        s += rival(b, kind, x, 152, W, 186, hint=f'{nm} 대표 제품 사진 (공개 자료로 교체)', radius=14, pad=26)
        s += tag_on(b, nm, x + 12, 164)
        s += card('<span style="display: flex; flex-direction: column; gap: 1px">' + sup(b, nm, sub, size=16) + '</span>'
                  + f'<span style="height: 2px; flex-shrink: 0; background: {INK}"></span>' + rows(items)
                  + _row(b.tb('삼성 대비', f'width: 52px; flex-shrink: 0; font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap')
                         + _chip(b, f'우위 {w_}', 'blue', 11, 20) + _chip(b, f'비슷 {t_}', 'gray', 11, 20) + _chip(b, f'열위 {l_}', 'warn' if l_ else 'line', 11, 20), gap=5)
                  + f'<span style="margin-top: auto; border-radius: 8px; background: {SOFT}; padding: 7px 10px; display: flex; flex-direction: column; gap: 1px">'
                  + b.tb('그들이 할 말', f'font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap')
                  + b.tb(say, 'font-size: 13px; font-weight: 800; white-space: nowrap') + '</span>',
                  x, 346, W, 302, bg='#ffffff', border=LINE, pad='13px 14px', gap=5, radius=14)
    # 삼성 — 실제 설치 사진 + 강조 테두리 + 우리의 답
    x = 64 + 3 * (W + 16)
    s += photo(b, 'ph.fb-cafe-counter', x, 152, W, 186, pos='35% 45%', hint='삼성 설치 사례 · 카페 카운터 메뉴보드', radius=14)
    s += tag_on(b, '삼성전자 · 설치 사례', x + 12, 164, dark=False)
    s += card('<span style="display: flex; flex-direction: column; gap: 1px">' + sup(b, '삼성전자', '화면 · CMS · 서비스 한 창구', hi=True, size=16) + '</span>'
              + f'<span style="height: 2px; flex-shrink: 0; background: {BLUE}"></span>'
              + rows([('주력 제품', 'QM 시리즈 · 키오스크'), ('가격대', '₩₩ · 중간'), ('솔루션', 'MagicINFO · VXT'), ('레퍼런스', '국내 외식 [00]곳'), ('최근 동향', '외식 매장 패키지 구성')], hi=True)
              + _row(b.tb('6항목', f'width: 52px; flex-shrink: 0; font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap')
                     + _chip(b, '우위 [0]', 'solid', 11, 20) + _chip(b, '열위 [0] → p.[00]', 'white', 11, 20), gap=5)
              + f'<span style="margin-top: auto; border-radius: 8px; background: {BLUE}; padding: 7px 10px; display: flex; flex-direction: column; gap: 1px">'
              + b.tb('우리의 답', f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap')
              + b.tb('“메뉴 · 화면 · 서비스를 한 번에”', 'font-size: 13px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</span>',
              x, 346, W, 302, bg=CHIP, border=BLUE, pad='13px 14px', gap=5, radius=14)
    s += footer(b, DEAL['FB'] + ' · 공개 자료 · 영업 정보 [0000.00] 기준 · 경쟁사 익명 · 경쟁사 제품은 실루엣 자리 · ' + _src('FB'), 11)
    return s


# ================================================================ 3. 평가 기준 가중 점수 · 기준 사진 + 누적 막대
@layout(L, f='L_PH_CP_V', code='PH-CP-V', p='competition', p2='why', name='평가 기준 가중 점수 · 기준 사진 + 누적 막대',
        when='고객이 정한 평가 기준과 가중치로 공급사별 점수를 매겨, 어느 기준에서 점수가 갈리는지 보일 때',
        pv=[], sample=CUST['MD'], grp='경쟁 · 대응 전략')
def _(b):
    s = header(b, EB_CP, 'W 요양병원이 정한 다섯 기준으로 매기면 [00]점 대 [00]점입니다', '기준 · 가중치는 RFP 평가표 그대로 · 점수 = 기준별 5점 척도 × 가중치 · 출처: [평가 위원 사전 질의, 연도]', w=1152)
    C5 = ['#1428a0', '#3f57c8', '#6f84dc', '#a1b0ea', '#cfd7f5']
    crit = [('ph.md-air-cube', '50% 60%', '감염 · 공기질', '병실 공기 정화 · 필터', '[30]'),
            ('ph.md-ward-night', '50% 40%', '야간 소음', '수면 시간 실내기 소음', '[20]'),
            ('ph.md-consent', '55% 40%', '간호 업무 단말', '투약 · 기록 태블릿', '[20]'),
            ('r4.md-nursing-odu', '50% 40%', '유지보수', '정기 점검 · 장애 대응', '[15]'),
            ('r4.md-nursing-bldg', '50% 50%', '초기 비용', '장비 · 설치비 · 병동 전체', '[15]')]
    s += b.tb('평가 기준 · 가중치', ab(64, 152, 300, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    for i, (pid, pos, nm, d, wt) in enumerate(crit):
        y = 182 + i * 94
        s += photo(b, pid, 64, y, 232, 88, pos=pos, hint=f'평가 기준 · {nm} 장면', radius=10)
        s += box(308, y, 260, 88, SOFT, 10)
        s += rect(308, y + 14, 4, 60, C5[i], 2)
        s += card(_row(b.tb(nm, 'font-size: 15px; font-weight: 800; white-space: nowrap'), gap=6)
                  + b.tb(d, f'font-size: 12px; color: {MUTED}; white-space: nowrap'), 322, y, 160, 88, bg='transparent', pad='0', gap=3, extra='justify-content: center')
        s += f'<div style="{ab(486, y, 70, 88, "display: flex; align-items: center; justify-content: flex-end")}">' + bignum(b, wt, '%', size=22, unit_size=13) + '</div>'
    # 오른쪽 — 공급사별 누적 막대
    s += b.tb('공급사별 가중 점수 · 100점 만점 · 조각 색 = 왼쪽 기준', ab(600, 152, 616, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    BX, BW = 736, 404
    sup_rows = [('S', '삼성전자', '제안안', [27, 18, 17, 13, 9], True),
                ('A', '공급사 A', '[유형]', [22, 12, 14, 12, 13], False),
                ('B', '공급사 B', '[유형]', [20, 14, 10, 11, 14], False),
                ('C', '공급사 C', '[유형]', [18, 10, 12, 9, 12], False)]
    for g in (0, 50, 100):
        gx = BX + round(BW * g / 100)
        s += rect(gx, 178, 1, 286, LINE)
        s += b.tb(str(g), ab(gx - 20, 466, 40, 14, f'{NUM}; font-size: 10.5px; color: {FAINT}; text-align: center'), 'div')
    for i, (lt, nm, sb, seg, hi) in enumerate(sup_rows):
        y = 182 + i * 70
        if hi: s += box(592, y - 4, 624, 70, CHIP, 12)
        s += card(_row(numtag(b, lt, 30, BLUE if hi else '#9aa1ae') + '<span style="display: flex; flex-direction: column; gap: 1px">' + sup(b, nm, sb, hi=hi, size=14) + '</span>', gap=10),
                  604, y, 124, 62, bg='transparent', pad='0', gap=0, extra='justify-content: center')
        xx = BX
        for k, v in enumerate(seg):
            w = round(BW * v / 100)
            s += rect(xx, y + 21, w - 2, 20, C5[k], 3)
            xx += w
        s += f'<div style="{ab(1148, y, 68, 62, "display: flex; align-items: center; justify-content: flex-end")}">' + bignum(b, '[00]', '점', size=22 if hi else 18, color=BLUE if hi else BODY, unit_size=12) + '</div>'
    # 아래 — 제안 장면 사진 + 갈리는 기준
    s += photo(b, 'ph.md-ward', 600, 490, 616, 156, pos='50% 24%', hint='제안 구성이 들어간 병실 장면', radius=12)
    s += b.tb('제안 구성 · 병실 360 카세트 · 공기청정', f'position: absolute; right: 76px; top: 502px; border-radius: 999px; background: {GLASS}; color: #ffffff; font-size: 12px; font-weight: 800; padding: 5px 11px; white-space: nowrap', 'div')
    s += glass(b.tb('삼성이 앞서는 기준', f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap')
               + b.tb('감염 · 공기질 +[0]점 · 야간 소음 +[0]점', 'font-size: 14px; font-weight: 800; line-height: 20px; color: #ffffff; white-space: nowrap')
               + b.tb('뒤지는 기준', 'font-size: 11px; font-weight: 800; color: #f6b8a0; white-space: nowrap; margin-top: 4px')
               + b.tb('초기 비용 −[0]점 → 5년 총비용 p.[00]', 'font-size: 14px; font-weight: 800; line-height: 20px; color: #ffffff; white-space: nowrap'),
               612, 536, None, None, pad='9px 14px', gap=1)
    s += footer(b, DEAL['MD'] + ' · 점수 · 막대 길이는 예시 · 경쟁사 익명 · ' + _src('MD'), 13)
    return s


# ================================================================ 4. 열위 → 보완 · 보완 장면 사진
@layout(L, f='L_PH_CP_W', code='PH-CP-W', p='why', p2='competition', name='열위 → 보완 · 보완 장면 사진',
        when='경쟁사가 앞서는 항목을 먼저 밝히고, 보완 방안을 실제 장면 사진과 보완 후 예상 수치로 제시할 때',
        pv=['L_CM_E'], sample=CUST['FB'], grp='경쟁 · 대응 전략')
def _(b):
    s = header(b, EB_WHY, '두 가지는 경쟁사가 앞섭니다 — 이렇게 메웁니다', '열위 항목 · 원인 → 지금 비교 → 보완 방안 장면 → 보완 후 예상 · 출처: [공개 자료 · 영업 정보, 연도]', w=1152)
    rows = [('1', '수도권 설치 속도', '시공 협력사 1팀 운영', '경쟁사 D 우위', '설치 기간 · 짧을수록 좋음', '경쟁사 D', '[0]일', 84, '[0]일', 150,
             'ph.svc-technician', '50% 30%', '수도권 야간 설치 · 협력 시공팀', ['시공 협력사 2팀 추가', '야간 동시 설치 2개 매장', '자재 사전 배송'],
             '매장당 설치 기간', '매장당', '[0]', '일', 112, 120),
            ('2', '소프트웨어 단독 가격', '하드웨어 포함 견적이 기본', '경쟁사 C 우위', '매장당 월 요금 · 낮을수록 좋음', '경쟁사 C', '[0,000]원', 60, '[0,000]원', 100,
             'fill.vxt_people', '50% 18%', '구독형 요금 · VXT CMS', ['5년 총비용으로 비교', '구독형 요금 옵션', '기존 화면 재사용 검토'],
             '5년 총비용 · 낮을수록 좋음', '총비용', '[00]%', '낮음', 100, 128)]
    for i, (n, ttl, cause, adv, bsub, rv, rvv, rvw, usv, usw, pid, pos, tag, checks, asub, apre, aval, aunit, abw, amk) in enumerate(rows):
        y = 152 + i * 256
        # 열위 항목
        s += card(numtag(b, n, 26) + b.tb(ttl, 'font-size: 18px; font-weight: 800; line-height: 26px; margin-top: 6px; ' + clamp(2))
                  + b.tb('원인', f'font-size: 11px; font-weight: 700; color: {MUTED}; margin-top: 4px') + b.tb(cause, f'font-size: 13px; line-height: 19px; color: {BODY}; {clamp(2)}')
                  + '<span style="margin-top: 6px"></span>' + _chip(b, adv, 'warn', 11.5, 24),
                  64, y, 164, 240, bg='transparent', pad='16px 0', gap=4)
        # 지금 비교
        bar = lambda w, c, v, vc: _row(f'<i style="display: block; width: {w}px; height: 12px; border-radius: 3px; background: {c}; flex-shrink: 0"></i>'
                                       + b.tb(v, f'{NUM}; font-size: 13px; font-weight: 800; color: {vc}; white-space: nowrap'), gap=8)
        s += card(b.tb('지금 비교', 'font-size: 12px; font-weight: 800; white-space: nowrap') + b.tb(bsub, f'font-size: 11px; color: {MUTED}; white-space: nowrap')
                  + '<span style="margin-top: auto"></span>'
                  + b.tb(rv, 'font-size: 12px; font-weight: 800; white-space: nowrap') + bar(rvw, INK, rvv, INK)
                  + b.tb('삼성 지금', f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap; margin-top: 10px') + bar(usw, '#b9bfca', usv, MUTED),
                  240, y, 224, 240, bg=SOFT, pad='18px 16px', gap=4, radius=14)
        s += ARR(464, y + 110, 24, 20, size=16)
        # 보완 방안 — 장면 사진
        s += photo(b, pid, 488, y, 460, 240, pos=pos, hint=f'보완 방안 장면 · {tag}', radius=14)
        s += tag_on(b, tag, 500, y + 12)
        s += glass(b.tb('보완 방안', f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap')
                   + ''.join(b.tb('✓ ' + c, 'font-size: 14px; font-weight: 800; line-height: 21px; color: #ffffff; white-space: nowrap') for c in checks),
                   500, y + 124, None, None, pad='9px 14px', gap=2)
        s += ARR(948, y + 110, 24, 20, size=16)
        # 보완 후 예상
        s += card(b.tb('보완 후 예상', f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap') + b.tb(asub, f'font-size: 11px; color: {MUTED}; white-space: nowrap')
                  + '<span style="margin-top: auto"></span>'
                  + _row(b.tb(apre, f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap') + bignum(b, aval, aunit, size=34, unit_size=15), gap=6)
                  + f'<span style="position: relative; height: 22px; flex-shrink: 0"><i style="position: absolute; left: 0; top: 5px; width: {abw}px; height: 12px; border-radius: 3px; background: {BLUE}"></i>'
                  + f'<i style="position: absolute; left: {amk}px; top: 0; width: 0; height: 22px; border-left: 2px dashed {INK}"></i>'
                  + b.tb(rv, ab(amk + 7, 3, 80, 16, 'font-size: 11px; font-weight: 800; white-space: nowrap')) + '</span>'
                  + _chip(b, '✓ 동등 이상', 'blue', 12, 26).replace('flex-shrink: 0;', 'flex-shrink: 0; align-self: flex-start; margin-top: 8px;'),
                  972, y, 244, 240, bg='#ffffff', border=BLUE, pad='18px 18px', gap=4, radius=14)
    s += footer(b, DEAL['FB'] + ' · 막대 길이는 예시 · 경쟁사 익명 · 보완 방안은 [확정 필요] · ' + _src('FB'), 12)
    return s


# ================================================================ 5. 레이더 종합 · 축마다 사진
@layout(L, f='L_PH_CP_X', code='PH-CP-X', p='why', p2='competition', name='레이더 종합 비교 · 축마다 사진',
        when='여섯 기준으로 삼성과 경쟁사 둘을 한눈에 겹쳐 보이고, 기준마다 그 장면 사진과 점수표를 붙일 때',
        pv=['L_CM_C'], sample=CUST['FB'], grp='경쟁 · 대응 전략')
def _(b):
    s = header(b, EB_WHY, '여섯 가지 기준으로 겹쳐 보면, 삼성의 면이 가장 넓습니다', '기준별 5점 만점 · 삼성 vs 경쟁사 A · B · 출처: [평가 방식 · 공개 자료, 연도]', w=1152)
    CX, CY, R, D, T = 410, 398, 140, 196, 84
    ax = [('화질 · 밝기', 'fill.cafe_menuwall', '50% 50%', 4.6, 4.2, 3.6),
          ('원격 관리', 'fill.phone_signage', '45% 50%', 4.5, 3.2, 3.8),
          ('솔루션 통합', 'fill.food_kiosk', '50% 50%', 4.4, 3.0, 3.4),
          ('내구성', 'ph.fb-dt-order', '30% 50%', 4.3, 4.0, 3.2),
          ('서비스망', 'ph.svc-technician', '50% 25%', 4.7, 3.6, 3.0),
          ('레퍼런스', 'ph.fb-lounge-ac', '50% 50%', 4.4, 3.8, 4.4)]
    ang = [math.radians(-90 + 60 * k) for k in range(6)]
    P = lambda k, r: (CX + r * math.cos(ang[k]), CY + r * math.sin(ang[k]))
    for lv, c in ((1.0, '#eef0f4'), (0.667, '#f8f9fb'), (0.333, '#eef0f4')):
        s += _poly([P(k, R * lv) for k in range(6)], c)
    for k in range(6):
        s += _seg(CX, CY, *P(k, R), '#d6dae1', 1)
    for nm, idx, col, w, dash in (('B', 5, '#b3b9c4', 2, False), ('A', 4, '#596170', 2, True)):
        pts = [P(k, R * ax[k][idx] / 5) for k in range(6)]
        for k in range(6): s += _seg(*pts[k], *pts[(k + 1) % 6], col, w, dash)
    ps = [P(k, R * ax[k][3] / 5) for k in range(6)]
    s += _poly(ps, 'rgba(20,40,160,0.16)')
    for k in range(6): s += _seg(*ps[k], *ps[(k + 1) % 6], BLUE, 2.5)
    for x, y in ps: s += rect(round(x - 5), round(y - 5), 10, 10, BLUE, 5, 'box-sizing: border-box; border: 2px solid #ffffff')
    # 축 끝 — 원형 사진 + 기준 이름 + 점수
    for k, (nm, pid, pos, *_) in enumerate(ax):
        tx, ty = P(k, D); tx, ty = round(tx), round(ty)
        s += rect(tx - T // 2 - 3, ty - T // 2 - 3, T + 6, T + 6, '#ffffff', (T + 6) // 2, f'box-shadow: 0 0 0 1.5px {CHIP}')
        s += photo(b, pid, tx - T // 2, ty - T // 2, T, T, pos=pos, hint=f'{nm} 장면', radius=T // 2)
        lab = (b.tb(nm, 'font-size: 14px; font-weight: 800; white-space: nowrap')
               + b.tb('삼성 [0.0]', f'{NUM}; font-size: 12.5px; font-weight: 800; color: {BLUE}; white-space: nowrap'))
        if k in (0, 3): s += card(lab, tx + T // 2 + 10, ty - 21, 130, 42, bg='transparent', pad='0', gap=0)
        elif k in (1, 2): s += card(lab, tx + T // 2 + 10, ty - 21, 124, 42, bg='transparent', pad='0', gap=0)
        else: s += card(lab, tx - T // 2 - 10 - 120, ty - 21, 120, 42, bg='transparent', pad='0', gap=0, extra='align-items: flex-end')
    # 오른쪽 — 범례 · 사진 · 점수표
    X0 = 800
    s += (f'<div style="{ab(X0, 152, 416, 18, "display: flex; align-items: center; gap: 14px")}">'
          + _row(f'<i style="display: block; width: 18px; height: 10px; border-radius: 2px; background: rgba(20,40,160,0.16); border: 2px solid {BLUE}"></i>' + b.tb('삼성', f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap'), gap=6)
          + _row(f'<i style="display: block; width: 20px; height: 2px; background: repeating-linear-gradient(90deg, #596170 0 6px, transparent 6px 10px)"></i>' + b.tb('경쟁사 A', f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), gap=6)
          + _row('<i style="display: block; width: 20px; height: 2px; background: #b3b9c4"></i>' + b.tb('경쟁사 B', f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), gap=6) + '</div>')
    s += photo(b, 'r4.fb-bakery-menu', X0, 180, 416, 160, pos='50% 12%', hint='여섯 기준이 쓰이는 매장 장면', radius=12)
    s += label_on(b, '여섯 기준 중', '삼성 우위 5 · 동등 1 — 서비스망 차이가 가장 큽니다', X0 + 12, 280, 392, lines=1)
    cx = [(X0, 136, '기준'), (X0 + 136, 92, '삼성'), (X0 + 228, 94, '경쟁사 A'), (X0 + 322, 94, '경쟁사 B')]
    s += box(X0 + 136, 352, 92, 266, CHIP, 10)
    for x, w, t in cx:
        s += b.tb(t, ab(x, 358, w, 18, f'font-size: 12px; font-weight: 800; color: {BLUE if t == "삼성" else MUTED}; white-space: nowrap; text-align: {"left" if t == "기준" else "center"}; {"padding-left: 8px; box-sizing: border-box" if t == "기준" else ""}'), 'div')
    s += rect(X0, 382, 416, 1.5, INK)
    for k, (nm, *_r) in enumerate(ax):
        y = 384 + k * 31
        if k: s += rect(X0, y, 416, 1, LINE)
        s += b.tb(nm, ab(X0, y + 7, 136, 18, 'font-size: 13px; font-weight: 800; white-space: nowrap; padding-left: 8px; box-sizing: border-box'), 'div')
        for j, (x, w, t) in enumerate(cx[1:]):
            s += b.tb('[0.0]', ab(x, y + 7, w, 18, f'{NUM}; font-size: 13px; font-weight: {800 if j == 0 else 600}; color: {BLUE if j == 0 else MUTED}; text-align: center'), 'div')
    s += rect(X0, 570, 416, 1.5, INK)
    s += b.tb('종합 (평균)', ab(X0, 582, 136, 22, 'font-size: 14px; font-weight: 800; white-space: nowrap; padding-left: 8px; box-sizing: border-box'), 'div')
    for j, (x, w, t) in enumerate(cx[1:]):
        s += b.tb('[0.0]', ab(x, 579, w, 28, f'{NUM}; font-size: {22 if j == 0 else 16}px; font-weight: 800; color: {BLUE if j == 0 else BODY}; text-align: center; line-height: 28px'), 'div')
    s += b.tb('점수 기준: [평가 방식] · 점 위치는 예시', ab(X0, 626, 416, 16, f'font-size: 11px; color: {FAINT}; white-space: nowrap'), 'div')
    s += footer(b, DEAL['FB'] + ' · 점수 · 점 위치는 예시 · 경쟁사 익명 · ' + _src('FB'), 12)
    return s


# ================================================================ 6. 시사점 3 → 제안 방향 · 히어로 사진
@layout(L, f='L_PH_IM_B', code='PH-IM-B', p='insight', name='시사점 3 → 제안 방향 · 히어로 사진',
        when='시장 · 고객 · 경쟁에서 나온 시사점 셋을 근거 사진과 함께 모아, 큰 현장 사진 위 제안 방향 한 문장으로 맺을 때',
        pv=['L_IM_A'], sample=CUST['HT'], grp='시사점 · 제안 방향')
def _(b):
    s = header(b, EB_IN, '세 가지 시사점이 가리키는 B 호텔 제안의 방향', '시사점 셋(근거: 시장 · 고객 · 경쟁) → 제안 방향 하나 · 출처: [조사 기관 · 고객 인터뷰, 연도]', w=1152)
    ims = [('ph.ht-welcome-tv', '30% 45%', '시장', '객실 TV가 호텔 서비스 창구가 되고 있습니다', '체크인 · 다이닝 안내를 TV로 받는 호텔 [00]%'),
           ('fill.ht_front', '50% 40%', '고객', '로비 안내가 프런트 줄을 줄여야 합니다', '체크인 피크 대기 [00]분 · 같은 질문이 반복됨'),
           ('ph.ht-lobby-signage', '82% 45%', '경쟁', '객실과 로비를 한 체계로 운영하는 곳은 드뭅니다', '인근 경쟁 호텔 [0]곳 중 [0]곳만 통합 운영')]
    for i, (pid, pos, ev, t, d) in enumerate(ims):
        y = 152 + i * 168
        s += box(64, y, 496, 160, SOFT, 14)
        s += photo(b, pid, 64, y, 168, 160, pos=pos, hint=f'시사점 근거 · {ev} 장면', radius=14)
        s += card(_row(b.tb(f'시사점 {i + 1}', f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap') + evid(b, f'근거: {ev}', color=BODY), gap=8)
                  + b.tb(t, f'font-size: 17px; font-weight: 800; line-height: 25px; margin-top: 2px; {clamp(2)}')
                  + b.tb(d, f'font-size: 12.5px; line-height: 19px; color: {BODY}; {clamp(2)}'),
                  232, y, 328, 160, bg='transparent', pad='18px 18px 16px 18px', gap=6)
    s += ARR(562, 390, 32, 24, size=20)
    s += photo(b, 'ph.ht-room-tv', 596, 152, 620, 496, pos='76% 50%', hint='제안 방향 히어로 · 객실 TV와 전망', radius=16)
    s += tag_on(b, '제안 방향', 612, 168, dark=False)
    s += glass(b.tb('B 호텔 · 객실 · 로비 제안', f'font-size: 12px; font-weight: 800; color: {LB}; white-space: nowrap')
               + b.tb('객실 TV와 로비 사이니지를 한 시스템으로 — 투숙객이 묻기 전에 안내하는 호텔', f'font-size: 22px; font-weight: 800; line-height: 31px; color: #ffffff; {clamp(2)}')
               + '<span style="height: 1px; background: rgba(255,255,255,0.22); margin: 6px 0"></span>'
               + _row(''.join(b.tb(k, 'flex-shrink: 0; height: 28px; padding: 0 12px; border-radius: 999px; background: rgba(255,255,255,0.14); color: #ffffff; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
                              for k in ('객실 TV · 서비스 창구', '로비 · 셀프 안내', '한 콘솔 · 통합 운영')), gap=8),
               616, 470, 580, None, pad='16px 18px', gap=4)
    s += footer(b, DEAL['HT'] + ' · 수치는 예시 · ' + _src('HT'), 10)
    return s


# ================================================================ 7. 시사점 → 방향 1:1 · 근거 사진 행
@layout(L, f='L_PH_IM_C', code='PH-IM-C', p='insight', name='시사점 → 방향 1:1 · 근거 사진 행',
        when='분석에서 나온 시사점마다 제안이 어떻게 답하는지 한 줄씩 짝지어, 근거 장면과 해당 쪽을 함께 보일 때',
        pv=['L_IM_A'], sample=CUST['OF'], grp='시사점 · 제안 방향')
def _(b):
    s = header(b, EB_IN, 'C 빌딩 분석에서 나온 네 가지, 제안은 이렇게 답합니다', '시사점 하나에 제안 방향 하나 · 자세한 내용은 표시한 쪽 · 출처: [현장 조사 · 건물 관리 데이터, 연도]', w=1152)
    for x, t in ((64, '근거 장면'), (366, '시사점'), (724, '제안 방향')):
        s += b.tb(t, ab(x, 152, 200, 16, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    rows = [('ph.of-meeting', '50% 55%', '회의실', '회의실이 모자란 게 아니라 비어 있습니다', '예약 대비 실제 사용 [00]% · 노쇼 [00]%',
             'ph.of-door-tab', '45% 60%', '회의실 예약 태블릿으로 노쇼를 자동 반납', '[00]'),
            ('ph.of-office-ac', '50% 40%', '사무 공간', '층 · 자리마다 냉난방 불만이 다릅니다', '냉난방 민원 월 [00]건 · 창가와 안쪽 [0]℃ 차',
             'fill.biot_floor', '50% 50%', '존별 공조를 도면 한 화면에서 관리', '[00]'),
            ('ph.of-client-center', '35% 50%', '로비', '방문객 안내가 데스크 한 곳에 몰립니다', '하루 방문 [000]명 · 같은 질문이 반복됨',
             'ph.of-lobby-info', '72% 40%', '로비 사이니지로 셀프 방문 안내', '[00]'),
            ('ph.of-rooftop-odu', '50% 50%', '설비', '관리비에서 전기요금 비중이 가장 큽니다', '전기요금 [00]% · 사용량 확인은 월 1회',
             'fill.biot_dash', '50% 50%', '에너지 사용량을 실시간으로 보고 줄이기', '[00]')]
    for i, (pid, pos, kw, t, d, tpid, tpos, dirn, pg) in enumerate(rows):
        y = 178 + i * 118
        s += photo(b, pid, 64, y, 290, 112, pos=pos, hint=f'근거 장면 · {kw}', radius=12)
        s += tag_on(b, f'{i + 1} · {kw}', 74, y + 10, size=11.5)
        s += card(b.tb(t, f'font-size: 15.5px; font-weight: 800; line-height: 22px; {clamp(2)}')
                  + b.tb(d, f'font-size: 12px; color: {MUTED}; white-space: nowrap'),
                  366, y, 318, 112, bg=SOFT, pad='0 18px', gap=6, radius=12, extra='justify-content: center')
        s += ARR(690, y + 46, 30, 20)
        s += box(724, y, 492, 112, CHIP, 12)
        s += photo(b, tpid, 732, y + 8, 136, 96, pos=tpos, hint=f'제안 방향 · {dirn}', radius=8)
        s += card(b.tb('제안 방향', f'font-size: 11px; font-weight: 800; color: {BLUE}; white-space: nowrap')
                  + b.tb(dirn, f'font-size: 16px; font-weight: 800; line-height: 24px; {clamp(2)}')
                  + evid(b, f'이 장에서 · p.{pg}', color=BLUE, border='#c9d1f2'),
                  880, y, 320, 112, bg='transparent', pad='0', gap=5, extra='justify-content: center')
    s += footer(b, DEAL['OF'] + ' · 수치는 예시 · ' + _src('OF'), 11)
    return s


# ================================================================ 8. SWOT → 전략 4 (TOWS) · 사분면 사진
@layout(L, f='L_PH_IM_D', code='PH-IM-D', p='insight', p2='competition', name='SWOT → 전략 4 (TOWS) · 사분면 사진',
        when='강점 · 약점 · 기회 · 위협을 겹쳐 전략 넷을 뽑고, 그중 주 방향을 장면 사진과 함께 강조할 때',
        pv=[], sample=CUST['RT'], grp='시사점 · 제안 방향')
def _(b):
    s = header(b, EB_IN, 'D 리테일의 강점과 기회를 겹치면, 플래그십 체험이 주 방향입니다', 'SWOT → TOWS 전략 넷 · SO(강점 × 기회)를 주 방향으로 · 출처: [시장 조사 · 고객 인터뷰, 연도]', w=1152)
    sw = [('S', '강점', True, ['브랜드 체험 매장 [00]곳', '자사 앱 회원 [000]만 명']),
          ('W', '약점', False, ['매장별 콘텐츠가 제각각', '피크 시간 매장 인력 부족']),
          ('O', '기회', True, ['신제품 체험 수요 증가', '리테일 미디어 광고 [00]% 성장']),
          ('T', '위협', False, ['온라인 가격 비교 · 이탈', '인건비 상승 [0]%'])]
    for i, (k, nm, pos, kws) in enumerate(sw):
        y = 152 + i * 126
        s += card(_row(numtag(b, k, 28, BLUE if pos else '#4a5160') + b.tb(nm, 'font-size: 15px; font-weight: 800; white-space: nowrap')
                       + b.tb('내부' if k in 'SW' else '외부', f'font-size: 11px; color: {FAINT}; white-space: nowrap; margin-left: auto'), gap=10)
                  + ''.join(b.tb('· ' + w, f'font-size: 13px; font-weight: 700; line-height: 20px; color: {BODY}; white-space: nowrap') for w in kws),
                  64, y, 280, 116, bg=SOFT, pad='14px 16px', gap=6, radius=12)
    q = [('SO · 강점 × 기회', 'r4.rt-flagship-led', '50% 50%', 'S 체험 매장 + O 신제품 체험 수요', '플래그십 LED 체험존으로 신제품 출시를 매장에서 먼저', True),
         ('ST · 강점 × 위협', 'ph.rt-fashion-phone', '30% 50%', 'S 앱 회원 + T 온라인 가격 비교', '매장 화면과 자사 앱을 이어 온라인 이탈을 매장 구매로', False),
         ('WO · 약점 × 기회', 'r4.rt-telco-store', '50% 40%', 'W 제각각 콘텐츠 + O 리테일 미디어', '본사 CMS로 전 매장 콘텐츠와 매장 광고를 한 번에', False),
         ('WT · 약점 × 위협', 'ph.rt-atrium-kiosk', '50% 65%', 'W 피크 인력 부족 + T 인건비 상승', '셀프 안내 키오스크로 피크 시간 인력 공백을 메웁니다', False)]
    for i, (tag, pid, pos, why, st, hi) in enumerate(q):
        x, y = 368 + (i % 2) * 432, 152 + (i // 2) * 256
        s += photo(b, pid, x, y, 416, 240, pos=pos, hint=f'전략 장면 · {tag}', radius=14)
        if hi:
            s += box(x, y, 416, 240, 'transparent', 14, f'border: 3px solid {BLUE}')
            s += b.tb(tag + ' · 주 방향', ab(x + 12, y + 12, extra=f'border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 12px; font-weight: 800; padding: 5px 11px; white-space: nowrap'), 'div')
        else:
            s += tag_on(b, tag, x + 12, y + 12)
        s += glass(b.tb(why, f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap')
                   + b.tb(st, f'font-size: 15.5px; font-weight: 800; line-height: 22px; color: #ffffff; {clamp(2)}'),
                   x + 12, y + 140, 392, None, pad='10px 14px', gap=3, extra=f'background: rgba(20,40,160,0.9)' if hi else '')
    s += footer(b, DEAL['RT'] + ' · 수치는 예시 · ' + _src('RT'), 10)
    return s


# ================================================================ 9. 제안 방향 3 기둥 · 사진 카드
@layout(L, f='L_PH_IM_E', code='PH-IM-E', p='insight', p2='value', name='제안 방향 3 기둥 · 사진 카드',
        when='전체 제안 방향 한 문장 아래 세 기둥을 사진 카드로 세우고, 기둥마다 근거 시사점과 제품 · 솔루션을 붙일 때',
        pv=[], sample=CUST['ED'], grp='시사점 · 제안 방향')
def _(b):
    s = header(b, EB_IN, 'E 대학교 제안은 세 기둥으로 서 있습니다', '제안 방향 하나 → 기둥 셋 · 기둥마다 왜(근거 시사점)와 무엇으로(제품 · 솔루션) · 출처: [현장 조사 · 학생 설문, 연도]', w=1152)
    s += (f'<div style="{ab(64, 152, 1152, 56, f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; padding: 0 22px; display: flex; align-items: center; gap: 16px")}">'
          + b.tb('제안 방향', f'font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: {LB}; flex-shrink: 0; white-space: nowrap')
          + b.tb('수업 · 안내 · 학습 기기를 한 체계로 — 어디서든 같은 경험을 주는 캠퍼스', 'font-size: 19px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</div>')
    P = [('r4.ed-teacher-board', '50% 35%', '강의실', '수업이 바뀌는 강의실', ['시장', '고객'], '스마트 강의실 전환 [00]% · 교수 [00]%가 화면 공유 수업을 원함', ['전자칠판', '갤럭시 탭', '화면 공유']),
         ('ph.ed-smart-lobby', '50% 45%', '로비 · 도서관', '안내가 살아 있는 캠퍼스', ['고객', '경쟁'], '공지 · 행사 안내가 게시판 · 문자로 흩어져 학생 [00]%가 놓침', ['스마트 사이니지', '비디오월', 'MagicINFO']),
         ('ph.ed-tab-exam', '60% 50%', '시험 · 실습', '공부와 시험을 태블릿 하나로', ['시장', '경쟁'], 'CBT 시험 · 실습 기기 부족 · 인근 대학 [0]곳이 태블릿 대여 운영', ['갤럭시 탭', 'Knox Manage', '충전 보관함'])]
    for i, (pid, pos, kw, ttl, evs, why, what) in enumerate(P):
        x = 64 + i * 392
        s += box(x, 224, 368, 424, SOFT, 14)
        s += photo(b, pid, x, 224, 368, 230, pos=pos, hint=f'기둥 {i + 1} 장면 · {kw}', radius=14)
        s += tag_on(b, f'기둥 {i + 1} · {kw}', x + 12, 236)
        s += card(b.tb(ttl, 'font-size: 18px; font-weight: 800; line-height: 26px; white-space: nowrap')
                  + f'<span style="height: 1px; background: {LINE}; flex-shrink: 0; margin: 2px 0"></span>'
                  + _row(b.tb('왜 · 근거 시사점', f'font-size: 11px; font-weight: 800; color: {MUTED}; white-space: nowrap') + ''.join(_chip(b, e, 'line', 11, 20) for e in evs), gap=6)
                  + b.tb(why, f'font-size: 13px; line-height: 19px; color: {BODY}; {clamp(2)}')
                  + _row(b.tb('무엇으로 · 제품 · 솔루션', f'font-size: 11px; font-weight: 800; color: {BLUE}; white-space: nowrap'), extra='margin-top: auto')
                  + _row(''.join(_chip(b, w, 'blue', 12, 24) for w in what), gap=6),
                  x, 454, 368, 194, bg='transparent', pad='12px 18px 16px 18px', gap=6)
    s += footer(b, DEAL['ED'] + ' · 수치는 예시 · ' + _src('ED'), 11)
    return s
