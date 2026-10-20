# 3차 — 고객사 이해: 범용 사진 중심 레이아웃 6장 (수익 구조 · 목표 → 과제 · 거점 분포 · KPI 벤치마크 · 성숙도 · 프로필)
from gen_base import *
from gen_l6 import pin, glass, dot_line
L = []
def layout(**meta):
    def deco(fn):
        b = B(); html = fn(b)
        L.append({**meta, 'html': html, '_b': b})
        return fn
    return deco
EB = '01 · 고객사 이해'
MI_B = [f'L_MI_{c}_B' for c in ['FB', 'RT', 'SV', 'HT', 'TP', 'VN', 'AD', 'OF', 'RS', 'ID', 'ED', 'PB', 'MD', 'MF', 'FN', 'OE']]


def arrow(x, y, w=36, color=BLUE, left=False):
    d = 'M27 12H7m6-6l-6 6 6 6' if left else 'M5 12h20m-6-6l6 6-6 6'
    return f'<svg style="{ab(x, y, w, 24)}" viewBox="0 0 32 24" fill="none" stroke="{color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="{d}"/></svg>'


# ---------------------------------------------------------------- business model: three actors with photos
@layout(f='L_PH_CB_M', code='PH-CB-M', p='customer', name='수익 구조 · 주체 3 · 현장 사진', when='고객사가 돈을 버는 구조(본사 → 매장 → 손님)를, 주체마다 현장 사진과 핵심 지표로 보여줄 때',
        pv=MI_B, sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, EB, 'A 커피의 수익은 가맹점 매출에서 나옵니다', '본사 → 가맹점 → 손님 — 무엇이 흐르고 어디서 돈이 되는지 · 사진은 주체마다의 현장, [ ] 지표는 A 커피 데이터로 채움', w=1152)
    act = [('ph.rt-staff-tablet', '50% 40%', 'A 커피 본사', '의사결정 · 투자', '메뉴 개발 · 프로모션 · 가맹 운영 · 원부재료 공급', '가맹비 · 로열티 · 원부재료 마진', [('가맹점 수', '[000]개'), ('전 매장 메뉴 반영', '[0]일'), ('신메뉴 · 프로모션', '연 [00]회')]),
           ('ph.fb-cafe-counter', '50% 50%', '가맹점 · 직영점', '현장 운영', '주문 · 제조 · 픽업 · 매장 환경 운영', '음료 · 디저트 판매 — 매장 · 테이크아웃 · DT', [('매장 월 매출', '[0,000]만 원'), ('인건비 비중', '[00]%'), ('월 전기요금', '[000]만 원')]),
           ('ph.fb-tablet-menu', '50% 45%', '손님', '최종 사용자', '테이크아웃 · 매장 체류 · 드라이브스루', '고르는 이유 — 맛 · 속도 · 머무는 편안함', [('객단가', '[0,000]원'), ('주문 대기', '[0]분'), ('재방문율', '[00]%')])]
    for i, (pid, pos, nm, role, what, rev, kp) in enumerate(act):
        x = 64 + i * 400
        s += b.img(pid, ab(x, 152, 352, 262), pos=pos, kind='space' if i == 1 else 'people', hint=f'{nm} 현장 사진', radius=14)
        s += glass('<span style="display: flex; align-items: baseline; gap: 8px">' + b.tb(nm, 'font-size: 18px; font-weight: 800; color: #ffffff') + b.tb(role, f'font-size: 11.5px; font-weight: 700; color: {LB}') + '</span>'
                   + b.tb(what, f'font-size: 12px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), x + 10, 346, 332, 58, pad='8px 12px', gap=1)
        s += (f'<div style="{ab(x, 426, 352, 40, "display: flex; flex-direction: column; gap: 1px")}">'
              + b.tb('수익원' if i < 2 else '선택 이유', f'font-size: 11px; font-weight: 800; color: {BLUE}') + b.tb(rev, 'font-size: 13.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        s += f'<div style="{ab(x, 478, 352, 74, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr))")}">'
        for k, (kl, kv) in enumerate(kp):
            s += (f'<span style="display: flex; flex-direction: column; justify-content: center; padding: 0 10px; {"border-left: 1px solid " + LINE if k else ""}; min-width: 0">'
                  + b.tb(kl, f'font-size: 10.5px; font-weight: 700; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + b.tb(kv, f'{NUM}; font-size: 15px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>')
        s += '</div>'
        if i < 2:
            s += arrow(x + 358, 262) + arrow(x + 358, 296, color='#7c8597', left=True)
    s += (f'<div style="{ab(64, 568, 1152, 80, f"box-sizing: border-box; border-radius: 12px; border: 1px solid {LINE}; padding: 10px 18px; display: grid; grid-template-columns: 110px 1fr; row-gap: 8px; align-items: center")}">'
          + b.tb('운영 · 상품 →', f'font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb('메뉴 · 레시피 · 프로모션 · 원부재료 → 음료 · 서비스 · 매장 경험', 'font-size: 13.5px; font-weight: 700')
          + b.tb('← 돈', f'font-size: 12px; font-weight: 800; color: #7c8597') + b.tb('매출(매장 · 테이크아웃 · DT) → 가맹비 · 로열티 · 원부재료 대금', 'font-size: 13.5px; font-weight: 700') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 외식 · 리테일 도입사례 · 공식 연출', 5)
    return root(s)


# ---------------------------------------------------------------- goal → strategies → tasks with photos
@layout(f='L_PH_CB_B', code='PH-CB-B', p='customer', name='경영 목표 → 실행 과제 · 사진', when='고객사의 경영 목표를 전략 셋과 실행 과제로 풀고, 전략마다 그 과제가 생기는 현장 사진을 붙일 때',
        pv=['L_CB_B'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, EB, 'A 커피의 목표는 ‘운영 효율’, 풀어야 할 과제는 셋입니다', '경영 목표 → 전략 방향 → 실행 과제 — 파란 테두리는 이번 제안이 맡는 과제 (5개 중 3개)', w=1152)
    s += b.img('ph.fb-cafe-counter', ab(64, 152, 372, 496), pos='40% 50%', kind='space', hint='고객사 대표 매장 사진', radius=16)
    s += glass(b.tb('2026 경영 목표', f'font-size: 12px; font-weight: 800; color: {LB}') + b.tb('매장 운영 효율', 'font-size: 24px; font-weight: 800; color: #ffffff')
               + b.tb('[00]% 개선', f'{NUM}; font-size: 40px; font-weight: 800; color: #ffffff; line-height: 1.15') + b.tb('출처 · A 커피 경영 계획 · 인터뷰', f'font-size: 11.5px; color: {LT}; margin-top: 4px'),
               80, 470, 340, 162, pad='14px 18px', gap=2)
    st = [('01', '메뉴 · 가격 운영 표준화', '320개 매장 같은 메뉴 · 같은 가격', 'ph.fb-counter-menu', '50% 30%', [('전 매장 메뉴보드 디지털 전환', 'QM55C · MagicINFO', True), ('가맹점 가격 정책 가이드 개정', '본사 가맹 운영팀', False)]),
          ('02', '매장 인력 부담 축소', '주문 · 안내 업무를 화면으로', 'ph.fb-pos-pay', '50% 40%', [('키오스크 · 픽업 호출 도입', 'KM24C · QM43C', True), ('매장 직원 교육 프로그램 개편', '본사 교육팀', False)]),
          ('03', '매장 에너지 비용 절감', '영업시간 밖 전력 낭비 차단', 'ph.fb-lounge-ac', '55% 35%', [('영업시간 연동 화면 · 전력 스케줄', 'SmartThings Pro · MagicINFO', True)])]
    for i, (n, t, d, pid, pos, tasks) in enumerate(st):
        y = 152 + i * 170
        s += b.img(pid, ab(460, y, 200, 158), pos=pos, kind='space', hint=f'전략 {n} 현장 사진', radius=12)
        s += (f'<div style="{ab(676, y + 6, 220, 146, "display: flex; flex-direction: column; gap: 4px")}">'
              + b.tb(f'전략 {n}', f'{NUM}; font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb(t, 'font-size: 17px; font-weight: 800; line-height: 1.35') + b.tb(d, f'font-size: 12.5px; color: {MUTED}') + '</div>')
        s += f'<div style="{ab(908, y, 308, 158, "display: flex; flex-direction: column; gap: 8px; justify-content: center")}">'
        for tt, who, ours in tasks:
            s += (f'<div style="box-sizing: border-box; border-radius: 10px; border: {"2px solid " + BLUE if ours else "1px solid " + LINE}; padding: 8px 12px; display: flex; flex-direction: column; gap: 1px">'
                  + '<span style="display: flex; align-items: center; gap: 6px">' + b.tb(tt, 'font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                  + (b.tb('이번 제안', f'margin-left: auto; flex-shrink: 0; font-size: 10.5px; font-weight: 800; color: #fff; background: {BLUE}; border-radius: 999px; padding: 2px 7px') if ours else '') + '</span>'
                  + b.tb(who, f'font-size: 11.5px; color: {BLUE if ours else MUTED}; font-weight: 700') + '</div>')
        s += '</div>'
        if i < 2: s += f'<div style="{ab(460, y + 164, 756, 1, f"background: {LINE}")}"></div>'
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 외식 도입사례 · 공식 연출', 9)
    return root(s)


# ---------------------------------------------------------------- store network: tile map + store-type photo strips
@layout(f='L_PH_CB_E', code='PH-CB-E', p='customer', name='거점 분포 · 지도 + 매장 유형 사진', when='매장 · 지점이 어디에 얼마나 있는지와 매장 유형별 수를, 유형마다 매장 사진으로 보여줄 때',
        pv=['L_CB_E', 'L_BM_E', 'L_MS_F'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, EB, 'A 커피 320개 매장, [00]%가 수도권에 있습니다', '시도별 매장 수 · 매장 유형 · 출점 계획 — 설치 순서의 근거 · 사진은 유형별 대표 매장', w=1152)
    grid = [['인천', '서울', '경기', '강원'], ['충남', '세종', '충북', '경북'], ['전북', '대전', '대구', '울산'], ['광주', '전남', '경남', '부산'], ['제주']]
    dark = {'인천', '서울', '경기'}; mid = {'부산', '대구', '대전', '충남', '경남'}
    s += f'<div style="{ab(64, 152, 560, 496, f"box-sizing: border-box; border-radius: 16px; background: {SOFT}")}"></div>'
    s += b.tb('시도별 매장 수', ab(84, 168, extra=f'font-size: 12.5px; font-weight: 800; color: {MUTED}'), 'div')
    for r, row in enumerate(grid):
        for c, nm in enumerate(row):
            x = 84 + c * 70; y = 196 + r * 62
            bg = BLUE if nm in dark else ('#8fa0d8' if nm in mid else '#dfe4f3')
            fg = '#ffffff' if nm in dark or nm in mid else INK
            s += (f'<div style="{ab(x, y, 64, 56, f"box-sizing: border-box; border-radius: 8px; background: {bg}; padding: 6px 7px; display: flex; flex-direction: column; justify-content: space-between")}">'
                  + b.tb(nm, f'font-size: 11.5px; font-weight: 800; color: {fg}') + b.tb('[00]' if nm in dark or nm in mid else '[0]', f'{NUM}; font-size: 13px; font-weight: 800; color: {fg}') + '</div>')
    s += (f'<div style="{ab(380, 196, 228, 150, "display: flex; flex-direction: column; gap: 2px")}">'
          + b.tb('수도권 · 서울 인천 경기', f'font-size: 12px; font-weight: 700; color: {MUTED}') + b.tb('[00]%', f'{NUM}; font-size: 46px; font-weight: 800; color: {BLUE}; line-height: 1.1')
          + b.tb('[000]곳 / 320', f'{NUM}; font-size: 13px; color: {BODY}') + b.tb('그 외 광역시 [00]% · 기타 [00]%', f'font-size: 12px; color: {MUTED}; margin-top: 6px') + '</div>')
    s += (f'<div style="{ab(380, 360, 228, 100, "display: flex; flex-direction: column; gap: 5px")}">'
          + ''.join(f'<span style="display: flex; align-items: center; gap: 8px"><i style="width: 12px; height: 12px; border-radius: 3px; background: {c}"></i>' + b.tb(t, f'font-size: 11.5px; color: {BODY}') + '</span>'
                    for c, t in [(BLUE, '[00]곳 이상'), ('#8fa0d8', '[00]–[00]곳'), ('#dfe4f3', '[0]곳 이하')]) + '</div>')
    s += b.tb('출점 계획', ab(84, 528, extra=f'font-size: 12.5px; font-weight: 800; color: {MUTED}'), 'div')
    for i, (t, v) in enumerate([('2026 하반기', '+[00]'), ('2027', '+[00]'), ('2028', '+[00]')]):
        x = 84 + i * 176
        s += (f'<div style="{ab(x, 554, 160, 74, f"box-sizing: border-box; border-radius: 12px; background: #ffffff; border: 1px solid {LINE}; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px")}">'
              + b.tb(t, f'font-size: 12px; font-weight: 700; color: {MUTED}') + b.tb(v + '곳', f'{NUM}; font-size: 20px; font-weight: 800; color: {BLUE}') + '</div>')
    types = [('ph.fb-cafe-counter', '50% 50%', '가맹점', '[000]곳', 74, '표준 매장 · 카운터 메뉴보드 3연 · 1차 설치 대상'),
             ('ph.fb-cafe-bright', '50% 40%', '직영 · 플래그십', '[00]곳', 14, '본사 시범 · 콘텐츠 시험대 · 파일럿 매장'),
             ('ph.fb-dt-order', '45% 50%', '드라이브스루', '[00]곳', 12, '옥외 메뉴보드 별도 · 고휘도 · 24시간')]
    for i, (pid, pos, nm, n, pct, d) in enumerate(types):
        y = 152 + i * 168
        s += b.img(pid, ab(644, y, 572, 160), pos=pos, kind='space', hint=f'{nm} 대표 매장 사진', radius=14)
        s += glass('<span style="display: flex; align-items: baseline; gap: 10px">' + b.tb(nm, 'font-size: 17px; font-weight: 800; color: #ffffff') + b.tb(n, f'{NUM}; font-size: 19px; font-weight: 800; color: {LB}; margin-left: auto') + '</span>'
                   + f'<span style="position: relative; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.25); margin: 4px 0 2px"><i style="position: absolute; left: 0; top: 0; bottom: 0; width: {pct}%; border-radius: 3px; background: {LB}"></i></span>'
                   + b.tb(d, f'font-size: 11.5px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 658, y + 72, 300, 78, pad='8px 12px', gap=1)
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 매장 수 기준 [0000.00] · 사진: samsung.com 외식 도입사례 · 공식 연출', 6)
    return root(s)


# ---------------------------------------------------------------- KPI benchmark with photo per KPI
@layout(f='L_PH_CB_F', code='PH-CB-F', p='customer', name='KPI 벤치마크 · 지표마다 현장 사진', when='고객사 지표를 업계 평균 · 상위 25%와 견주되, 지표마다 그 지표가 생기는 현장 사진을 붙일 때',
        pv=['L_CB_F'], sample='W 요양병원', grp='분석 · 이해')
def _(b):
    s = header(b, EB, 'W 요양병원, 다섯 지표 중 셋이 업계보다 무겁습니다', '고객 값 · 업계 평균 · 상위 25%를 같은 눈금에서 — 오른쪽 끝일수록 부담이 큼 · 출처: [업계 자료, 연도]', w=1152)
    s += b.img('ph.md-ward', ab(64, 152, 400, 496), pos='50% 50%', kind='space', hint='고객사 대표 공간 사진', radius=16)
    s += glass(b.tb('업계 대비', f'font-size: 11.5px; font-weight: 800; color: {LB}')
               + '<span style="display: flex; gap: 18px; margin-top: 2px">' + ''.join('<span style="display: flex; flex-direction: column">' + b.tb(v, f'{NUM}; font-size: 30px; font-weight: 800; color: {c}') + b.tb(k, f'font-size: 11.5px; color: {LT}') + '</span>'
                                                                                 for v, k, c in [('3', '업계보다 무거움', '#ffb59a'), ('1', '비슷', '#ffffff'), ('1', '좋음', LB)]) + '</span>',
               80, 540, 368, 92, pad='10px 16px')
    rows = [('ph.mf-odu-row', '50% 50%', '병상당 연간 에너지 비용', '단위 · 만 원', 0.82, 0.55, 0.4, '업계보다 +[00]%', '→ 공조 자동 제어', 'warn'),
            ('ph.md-station', '50% 50%', '간호 인력 1인당 병상', '단위 · 병상', 0.74, 0.5, 0.36, '업계보다 +[00]%', '→ 호출 · 기록 태블릿', 'warn'),
            ('ph.md-ward-night', '50% 50%', '낙상 사고율', '단위 · 건 / 천 병상일', 0.66, 0.48, 0.3, '업계보다 +[00]%', '→ 재실 센서 알림', 'warn'),
            ('ph.md-ward-360', '50% 50%', '냉난방 민원', '단위 · 건 / 월', 0.5, 0.52, 0.34, '업계와 비슷', '→ 병실별 온도 제어', ''),
            ('ph.md-single-room', '50% 50%', '병상 가동률', '높을수록 좋음', 0.78, 0.6, 0.85, '업계보다 좋음', '→ 유지', 'good')]
    for i, (pid, pos, k, u, me, avg, top, chipt, act, tone) in enumerate(rows):
        y = 152 + i * 100
        s += b.img(pid, ab(488, y, 128, 90), pos=pos, kind='space', hint=f'{k} 관련 현장 사진', radius=10)
        s += (f'<div style="{ab(630, y + 8, 160, 74, "display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
              + b.tb(k, 'font-size: 14px; font-weight: 800; line-height: 1.35') + b.tb(u, f'font-size: 11px; color: {MUTED}') + '</div>')
        tx, tw = 800, 230
        s += f'<div style="{ab(tx, y + 44, tw, 2, f"background: {LINE}")}"></div>'
        for v, c, sz in [(avg, '#9aa3b2', 12), (top, '#c4cbe0', 12), (me, BLUE, 18)]:
            s += f'<div style="{ab(round(tx + v * tw - sz / 2), round(y + 45 - sz / 2), sz, sz, f"border-radius: 50%; background: {c}; border: 2px solid #ffffff; box-sizing: border-box")}"></div>'
        s += b.tb('[00]', ab(round(tx + me * tw - 20), y + 16, 40, extra=f'{NUM}; font-size: 12px; font-weight: 800; color: {BLUE}; text-align: center'), 'div')
        col = WARN if tone == 'warn' else (BLUE if tone == 'good' else MUTED)
        bg = WARNBG if tone == 'warn' else (CHIP if tone == 'good' else SOFT)
        s += (f'<div style="{ab(1046, y + 14, 170, 62, f"box-sizing: border-box; border-radius: 10px; background: {bg}; padding: 7px 11px; display: flex; flex-direction: column; gap: 2px")}">'
              + b.tb(chipt, f'{NUM}; font-size: 12.5px; font-weight: 800; color: {col}') + b.tb(act, f'font-size: 11.5px; font-weight: 700; color: {BODY}') + '</div>')
        if i < 4: s += f'<div style="{ab(488, y + 95, 728, 1, f"background: {LINE}")}"></div>'
    s += footer(b, 'W 요양병원 · 스마트 병동 제안 · 업계: [출처 · 연도] · 고객: 고객 제공 [0000.00] · 사진: samsung.com 의료 · 현장 도입사례', 6)
    return root(s)


# ---------------------------------------------------------------- maturity on five axes with photos
@layout(f='L_PH_CB_G', code='PH-CB-G', p='customer', name='성숙도 진단 · 축마다 현장 사진', when='고객사의 디지털 · 운영 수준을 다섯 축으로 진단하되, 축마다 그 축이 보이는 현장 사진을 앞세울 때',
        pv=['L_CB_G'], sample='T 은행', grp='분석 · 이해')
def _(b):
    s = header(b, EB, 'T 은행 영업점의 디지털 수준, 다섯 축으로 보면', '1 시작 · 2 부분 · 3 표준 · 4 통합 · 5 최적화 — 파란 칸 = 현재, 테두리 = 3년 목표 · 진단: 인터뷰 · 현장 조사', w=1152)
    ax = [('ph.fn-tab-customer', '50% 40%', '고객 접점 디지털', 2, 4, '대기 · 상품 안내를 화면으로', 'Galaxy Tab · 사이니지'),
          ('ph.fn-tab-banker', '50% 40%', '창구 업무 페이퍼리스', 1, 4, '서식 태블릿 · 전자 서명', 'Galaxy Tab · Knox Suite'),
          ('ph.md-staff-tab', '50% 40%', '기기 관리 · 보안', 2, 4, '단말 원격 관리 · 업무 영역 분리', 'Knox Suite'),
          ('ph.fn-auditorium', '50% 50%', '콘텐츠 운영', 2, 3, '지점 화면 본점 일괄 편성', 'MagicINFO'),
          ('ph.of-video-wall', '50% 50%', '데이터 활용', 1, 3, '대기 · 상담 데이터를 대시보드로', '지점별 대시보드')]
    for i, (pid, pos, nm, cur, tgt, how, prod) in enumerate(ax):
        x = 64 + i * 234
        s += b.img(pid, ab(x, 152, 218, 262), pos=pos, kind='people', hint=f'{nm} 현장 사진', radius=14)
        s += glass(b.tb(nm, 'font-size: 14.5px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), x + 8, 368, 202, 38, pad='8px 12px')
        s += b.tb(f'+{tgt - cur}', ab(x + 170, 162, 40, 26, f'{NUM}; border-radius: 999px; background: {WARN if tgt - cur >= 3 else BLUE}; color: #fff; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
        for k in range(5):
            bx = x + k * 44
            on = k < cur; tg = cur <= k < tgt
            s += f'<div style="{ab(bx, 428, 40, 18, f"box-sizing: border-box; border-radius: 4px; background: {BLUE if on else ("#ffffff" if tg else SOFT)}; border: {"2px dashed " + BLUE if tg else "1px solid " + (BLUE if on else LINE)}")}"></div>'
        s += (f'<div style="{ab(x, 454, 218, 24, "display: flex; justify-content: space-between")}">'
              + b.tb(f'현재 {cur}', f'{NUM}; font-size: 12.5px; font-weight: 800; color: {BLUE}') + b.tb(f'목표 {tgt}', f'{NUM}; font-size: 12.5px; font-weight: 800; color: {MUTED}') + '</div>')
        s += (f'<div style="{ab(x, 488, 218, 92, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px")}">'
              + b.tb('올리는 방법', f'font-size: 10.5px; font-weight: 800; color: {MUTED}') + b.tb(how, 'font-size: 13px; font-weight: 800; line-height: 1.4') + b.tb('→ ' + prod, f'font-size: 11.5px; font-weight: 700; color: {BLUE}; margin-top: auto') + '</div>')
    s += (f'<div style="{ab(64, 596, 1152, 52, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 0 18px; display: flex; align-items: center; gap: 14px")}">'
          + b.tb('가장 큰 차이 둘', f'font-size: 12px; font-weight: 800; color: {BLUE}; flex-shrink: 0') + b.tb('창구 업무 페이퍼리스 +3 · 데이터 활용 +2 — 이번 제안은 1 → 4 창구 전환부터', 'font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += footer(b, 'T 은행 · 영업점 디지털 제안 · 진단: 인터뷰 [0]회 · 현장 조사 [0]개 지점 · 사진: samsung.com 금융 · 오피스 도입사례', 7)
    return root(s)


# ---------------------------------------------------------------- customer profile: photo collage + six facts
@layout(f='L_PH_CB_P', code='PH-CB-P', p='customer', name='고객사 프로필 · 사진 콜라주 + 숫자 6', when='고객사가 어떤 곳인지 한 장으로 — 공간 사진 세 장과 규모 · 매출 · 고객 · 이슈 숫자 여섯',
        pv=['L_MI03'], sample='B 호텔', grp='분석 · 이해')
def _(b):
    s = header(b, EB, 'B 호텔은 객실 [000]실, 연 매출 [000]억 원의 도심 비즈니스 호텔입니다', '한 장으로 보는 고객사 — 공간 사진 세 장과 숫자 여섯 · [ ]는 고객 자료로 채움', w=1152)
    s += b.img('ph.ht-lobby', ab(64, 152, 560, 318), pos='50% 50%', kind='space', hint='고객사 대표 공간 사진 (로비 · 외관)', radius=16)
    s += b.img('ph.ht-room-tv', ab(64, 480, 275, 168), pos='45% 50%', kind='space', hint='고객사 공간 사진 2', radius=12)
    s += b.img('ph.ht-restaurant', ab(349, 480, 275, 168), pos='50% 50%', kind='space', hint='고객사 공간 사진 3', radius=12)
    for x, y, t in [(76, 164, '로비 · 프런트'), (76, 492, '객실'), (361, 492, '레스토랑 · 연회')]:
        s += b.tb(t, ab(x, y, extra=f'border-radius: 8px; background: {GLASS}; color: #fff; font-size: 12px; font-weight: 800; padding: 4px 10px'), 'div')
    facts = [('운영', '[0000]년 개관', '[그룹명] 계열 · 위탁 운영'), ('규모', '객실 [000]실', '스탠다드 [00]% · 스위트 [00]실'), ('매출', '연 [000]억 원', '객실 [00]% · F&B · 연회 [00]%'),
             ('사람', '직원 [000]명', '프런트 · 객실 · F&B · 시설'), ('고객', '비즈니스 [00]%', '외국인 [00]% · 연박 [0.0]박'), ('지금', '[0000]년 리뉴얼', '객실 · 로비 단계 공사 예정')]
    for i, (k, v, d) in enumerate(facts):
        x = 648 + (i % 2) * 290; y = 152 + (i // 2) * 168
        s += (f'<div style="{ab(x, y, 278, 156, f"box-sizing: border-box; border-radius: 14px; background: {CHIP if i == 5 else SOFT}; padding: 16px 18px; display: flex; flex-direction: column; gap: 4px")}">'
              + b.tb(k, f'font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb(v, f'{NUM}; font-size: 24px; font-weight: 800; line-height: 1.25')
              + b.tb(d, f'font-size: 12.5px; line-height: 1.5; color: {BODY}; margin-top: auto') + '</div>')
    s += footer(b, 'B 비즈니스 호텔 · 객실 · 로비 제안 · 사진: samsung.com 호텔 도입사례 (고객 공간 사진으로 교체)', 4)
    return root(s)


# ---------------------------------------------------------------- operation problems pinned on one big site photo
@layout(f='L_PH_CB_K', code='PH-CB-K', p='customer', p2='challenge', name='운영 문제 · 현장 사진 위 번호', when='고객사 운영에서 생기는 문제를, 현장 사진 한 장 위에 번호로 짚고 문제 · 영향 · 원인을 나란히 보여줄 때',
        pv=['L_CB_C', 'L_CH_C'], sample='B 호텔', grp='분석 · 이해')
def _(b):
    s = header(b, EB, 'B 호텔 로비에서는 하루 [000]건의 같은 질문이 프런트로 몰립니다', '운영 흐름 속 문제 — 사진 위 번호 = 문제가 생기는 자리 · 오른쪽은 영향과 지금의 대응 방식', w=1152)
    s += b.img('ph.ht-lobby-art', ab(64, 152, 640, 496), pos='55% 50%', kind='space', hint='문제가 생기는 고객 현장 사진', radius=16)
    for n, x, y in [('1', 520, 120), ('2', 300, 300), ('3', 120, 210), ('4', 470, 400)]:
        s += b.tb(n, ab(64 + x - 17, 152 + y - 17, 34, 34, f'box-sizing: border-box; border-radius: 50%; background: {WARN}; color: #fff; border: 2px solid #fff; font-size: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center; {NUM}'), 'div')
    pr = [('행사 · 프로모션 안내가 층마다 다름', '종이 안내문을 층마다 사람이 교체', '프런트 문의 [000]건/일'),
          ('체크인 피크에 대기 줄이 로비까지', '수기 등록 · 키 발급 · 안내를 한 창구에서', '체크인 대기 [00]분'),
          ('조식 · 연회장 위치를 반복해서 물음', '외국어 안내가 프런트 직원에게 몰림', '외국어 응대 [00]%'),
          ('로비 냉난방이 출입문 쪽만 덥고 추움', '층별 설정을 시설팀이 수동 조정', '로비 온도 민원 [00]건/월')]
    for i, (t, cause, kp) in enumerate(pr):
        y = 152 + i * 124
        s += b.tb(str(i + 1), ab(728, y + 4, 28, 28, f'border-radius: 50%; background: {WARN}; color: #fff; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; {NUM}'), 'div')
        s += (f'<div style="{ab(768, y, 448, 114, "display: flex; flex-direction: column; gap: 5px")}">'
              + b.tb(t, 'font-size: 16px; font-weight: 800; line-height: 1.35') + b.tb('지금 · ' + cause, f'font-size: 13px; color: {MUTED}')
              + b.tb('영향 · ' + kp, f'{NUM}; align-self: flex-start; margin-top: auto; height: 24px; padding: 0 10px; border-radius: 999px; background: {WARNBG}; color: {WARN}; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center') + '</div>')
        if i < 3: s += f'<div style="{ab(728, y + 119, 488, 1, f"background: {LINE}")}"></div>'
    s += footer(b, 'B 비즈니스 호텔 · 객실 · 로비 제안 · 현장 조사 [0000.00] · 사진: samsung.com 호텔 도입사례 (고객 현장 사진으로 교체)', 6)
    return root(s)


# ---------------------------------------------------------------- company timeline with photos
@layout(f='L_PH_CB_T', code='PH-CB-T', p='customer', name='고객사 성장 연혁 · 시기별 사진', when='고객사가 지금까지 어떻게 커 왔고 다음은 무엇인지를, 시기마다 대표 공간 사진과 숫자로 보여줄 때',
        pv=['L_MI03'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, EB, 'A 커피는 [00]년 동안 1개 매장에서 320개로 컸고, 다음은 운영 표준화입니다', '고객사 사업 현황 — 시기마다 대표 매장과 숫자, 그리고 지금 풀려는 과제 · [ ]는 고객 자료로 채움', w=1152)
    s += f'<div style="{ab(64, 178, 1152, 0, f"border-top: 2px solid {LINE}")}"></div>'
    eras = [('[0000]', '1호점 · 창업', '테이크아웃 전문 매장으로 시작', 'ph.fb-pickup', '50% 35%', [('매장', '1개'), ('메뉴', '[00]종')], False),
            ('[0000]', '가맹 사업 시작', '수도권 중심 가맹 확대', 'ph.fb-cafe-counter', '50% 50%', [('매장', '[00]개'), ('가맹 비중', '[00]%')], False),
            ('[0000]', '드라이브스루 · 대형화', '교외 DT · 좌석형 매장 추가', 'ph.fb-dt-order', '45% 50%', [('매장', '[000]개'), ('DT', '[00]개')], False),
            ('2026 · 지금', '320개 · 운영 표준화', '메뉴 · 가격 · 에너지 운영을 본사 기준으로', 'ph.fb-cafe-bright', '50% 40%', [('매장', '320개'), ('목표', '효율 [00]%↑')], True)]
    for i, (yr, t, d, pid, pos, kp, now) in enumerate(eras):
        x = 64 + i * 292
        s += f'<div style="{ab(x + 4, 170, 16, 16, f"box-sizing: border-box; border-radius: 50%; background: {BLUE if now else "#ffffff"}; border: 3px solid {BLUE}")}"></div>'
        s += b.tb(yr, ab(x + 28, 164, 240, extra=f'{NUM}; font-size: 17px; font-weight: 800; color: {BLUE if now else INK}'), 'div')
        s += b.img(pid, ab(x, 200, 276, 250), pos=pos, kind='space', hint=f'{yr} 대표 매장 사진', radius=14)
        if now: s += b.tb('지금', ab(x + 10, 210, extra=f'border-radius: 999px; background: {BLUE}; color: #fff; font-size: 12px; font-weight: 800; padding: 4px 11px'), 'div')
        s += (f'<div style="{ab(x, 462, 276, 80, "display: flex; flex-direction: column; gap: 3px")}">'
              + b.tb(t, 'font-size: 17px; font-weight: 800') + b.tb(d, f'font-size: 13px; line-height: 1.5; color: {BODY}') + '</div>')
        s += f'<div style="{ab(x, 548, 276, 62, f"box-sizing: border-box; border-radius: 12px; background: {CHIP if now else SOFT}; display: grid; grid-template-columns: 1fr 1fr")}">'
        for k, (kl, kv) in enumerate(kp):
            s += (f'<span style="display: flex; flex-direction: column; justify-content: center; padding: 0 14px; {"border-left: 1px solid " + LINE if k else ""}">'
                  + b.tb(kl, f'font-size: 11px; font-weight: 700; color: {MUTED}') + b.tb(kv, f'{NUM}; font-size: 17px; font-weight: 800; color: {BLUE}') + '</span>')
        s += '</div>'
    s += b.tb('다음 · 2027 — 전 매장 화면 · 에너지 운영을 본사 한 곳에서 (이번 제안)', ab(64, 624, 1152, extra=f'font-size: 14px; font-weight: 800; color: {BLUE}'), 'div')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 연혁: 고객 회사 소개서 · 사진: samsung.com 외식 도입사례 · 공식 연출', 4)
    return root(s)
