from gen_base import *

L = []
def layout(**meta):
    def deco(fn):
        b = B(); html = fn(b)
        L.append({**meta, 'html': html, '_b': b})
        return fn
    return deco

# ---------------------------------------------------------------- 1 market · key figures
@layout(f='L_PH_MS_A', code='PH-MS-A', p='market', name='핵심 수치 4 · 현장 히어로', when='시장 수치를 말하되, 어떤 현장 이야기인지 사진으로 먼저 보여줄 때',
        pv=['L_MI01', 'L_MS_E', 'L_MI02', 'L_CB_F', 'L_CB_G'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = b.img('ph.fb-cafe-bright', ab(0, 0, 1280, 404), pos='50% 45%', kind='space', hint='고객 업종의 대표 현장 사진 (매장 · 공간 전경)')
    s += f'<div style="{ab(40, 40, 660, 238, f"box-sizing: border-box; border-radius: 16px; background: {GLASS}")}"></div>'
    s += header(b, '01 · MARKET INTELLIGENCE', 'F&B 매장은 메뉴판부터 화면으로 바뀌고 있습니다', '국내 커피 · 음료 전문점의 디지털 메뉴보드 도입 흐름 — 수치는 출처 확인 후 기재', x=72, w=600, y=70, dark=True, sub_y=212)
    s += f'<div style="{ab(64, 428, 1152, 200, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px")}">'
    for n, l, d in [('[00]%', '연평균 성장률', '국내 F&B 디지털 사이니지 도입 규모, [기간]'), ('[00]%', '프랜차이즈 도입률', '상위 [N]개 브랜드 중 디지털 메뉴보드 운영 비율'),
                    ('[0.0]일', '프로모션 교체 기간', '인쇄 메뉴판 기준 평균 교체 리드타임'), ('[00]%', '에너지 비용 비중', '매장 운영비 중 조명 · 디스플레이 전력 비중')]:
        s += (f'<div style="box-sizing: border-box; height: 196px; padding: 22px 22px 18px; border-top: 3px solid {BLUE}; background: {SOFT}; border-radius: 0 0 12px 12px; display: flex; flex-direction: column; gap: 8px">'
              + b.tb(n, f'{NUM}; font-size: 46px; font-weight: 800; letter-spacing: -0.03em; color: {BLUE}; line-height: 1.1')
              + b.tb(l, 'font-size: 17px; font-weight: 700')
              + b.tb(d, f'font-size: 13px; line-height: 1.55; color: {MUTED}') + '</div>')
    s += '</div>'
    s += b.tb('출처: [조사 기관, 연도] · 사진은 업종 참고 이미지', ab(64, 640, 1152, extra=f'font-size: 12px; color: {FAINT}'), 'div')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 공식 연출', 4)
    return root(s)

# ---------------------------------------------------------------- 2 market · trends as photo cards
@layout(f='L_PH_TR_A', code='PH-TR-A', p='market', name='트렌드 4 · 포토 카드', when='시장 흐름을 장면으로 보여주고, 트렌드마다 ‘그래서 고객은’을 붙일 때',
        pv=['L_MI06', 'L_TR_B', 'L_MI_FB_A', 'L_MI_RT_A', 'L_MI_HT_A', 'L_MI_OF_A', 'L_MI_ED_A', 'L_MI_FN_A', 'L_MI_MD_A', 'L_MI_PB_A', 'L_MI_SV_A', 'L_MI_TP_A', 'L_MI_VN_A', 'L_MI_AD_A', 'L_MI_RS_A', 'L_MI_ID_A', 'L_MI_MF_A', 'L_MI_OE_A', 'L_TR_C'],
        sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · MARKET INTELLIGENCE', 'A 커피의 시장은 네 장면에서 달라지고 있습니다', '업계를 움직이는 흐름 — 사진은 이미 바뀐 현장, 아래는 A 커피에 주는 의미')
    s += f'<div style="{ab(64, 160, 1152, 490, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px")}">'
    for pid, pos, n, t, d, so in [
        ('ph.fb-table-order', '50% 50%', '01', '주문이 테이블 위 화면으로', '줄을 서지 않고 자리에서 메뉴를 보고 주문 · 결제까지 끝냅니다', '피크 시간 카운터 대기를 테이블 · 키오스크로 나눕니다'),
        ('ph.fb-cafe-bright', '40% 50%', '02', '메뉴판이 콘텐츠가 됩니다', '시즌 · 시간대 메뉴를 영상으로 보여주고 품절은 바로 숨깁니다', '인쇄 · 교체 비용 없이 프로모션을 자주 바꿀 수 있습니다'),
        ('ph.fb-dt-order', '45% 50%', '03', '드라이브스루 · 픽업이 늘어납니다', '차 안에서 읽히는 밝은 메뉴, 픽업 대기 안내가 기본이 됩니다', '외곽 DT 매장은 옥외 메뉴보드가 첫 접점입니다'),
        ('ph.fb-lounge-ac', '50% 40%', '04', '머무는 공간이 경쟁력', '좌석 · 공기 · 조명이 오래 머무는 이유가 되고 운영비도 함께 봅니다', '좌석 쾌적도와 전력 사용을 매장마다 맞춥니다')]:
        s += ('<div style="display: flex; flex-direction: column; gap: 10px; min-width: 0">'
              + b.img(pid, 'position: relative; width: 100%; height: 286px', pos=pos, kind='photo', hint=f'트렌드 {n} 장면 사진', radius=14)
              + f'<span style="display: flex; align-items: baseline; gap: 8px; margin-top: 4px">' + b.tb(n, f'{NUM}; font-size: 14px; font-weight: 800; color: {BLUE}') + b.tb(t, 'font-size: 17.5px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.35') + '</span>'
              + b.tb(d, f'font-size: 13.5px; line-height: 1.55; color: {BODY}')
              + f'<div style="margin-top: auto; box-sizing: border-box; min-height: 72px; border-left: 3px solid {BLUE}; background: {SOFT}; border-radius: 0 8px 8px 0; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px">'
              + b.tb('그래서 A 커피는', f'font-size: 11.5px; font-weight: 700; color: {BLUE}') + b.tb(so, 'font-size: 13px; line-height: 1.5; font-weight: 600') + '</div></div>')
    s += '</div>'
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 출처: [조사 기관, 연도] · 사진: samsung.com 도입사례 · 공식 연출', 5)
    return root(s)

# ---------------------------------------------------------------- 3 customer · photos + one-line summary
@layout(f='L_PH_CB_A', code='PH-CB-A', p='customer', name='현장 3컷 + 한 줄 요약', when='고객사 사업을 한 줄로 요약하고, 그 사업이 일어나는 공간을 사진으로 보여줄 때',
        pv=['L_MI03', 'L_CB_B', 'L_MI_FB_B', 'L_MI_RT_B', 'L_MI_HT_B', 'L_MI_OF_B', 'L_MI_ED_B', 'L_MI_FN_B', 'L_MI_MD_B', 'L_MI_PB_B', 'L_MI_SV_B', 'L_MI_TP_B', 'L_MI_VN_B', 'L_MI_AD_B', 'L_MI_RS_B', 'L_MI_ID_B', 'L_MI_MF_B', 'L_MI_OE_B', 'L_CB_E'],
        sample='B 호텔', grp='분석 · 이해')
def _(b):
    s = b.img('ph.ht-lobby-art', ab(572, 0, 708, 430), pos='50% 55%', kind='space', hint='고객사의 대표 공간 (로비 · 매장 전경)')
    s += b.img('ph.ht-room-tv', ab(572, 434, 352, 286), pos='45% 50%', kind='space', hint='매출이 나는 공간 (객실 · 매장)')
    s += b.img('ph.ht-buffet-signage', ab(928, 434, 352, 286), pos='40% 50%', kind='space', hint='부대 공간 (레스토랑 · 라운지)')
    s += glass_label(b, 596, 368, '공간 01', '로비 · 프런트')
    s += glass_label(b, 590, 652, '공간 02', '객실')
    s += glass_label(b, 946, 652, '공간 03', '레스토랑 · 연회')
    s += header(b, '01 · 고객사 이해', 'B 호텔의 매출은 객실에서, 평판은 로비와 레스토랑에서 만들어집니다', None, w=472)
    s += (f'<div style="{ab(64, 236, 472, extra=f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; color: #ffffff; padding: 16px 20px; display: flex; flex-direction: column; gap: 6px")}">'
          + b.tb('한 줄 요약', f'font-size: 11.5px; font-weight: 700; color: {LB}; letter-spacing: 0.04em')
          + b.tb('투숙객이 머무는 모든 공간의 안내 · 경험을 한 팀이 운영하게 만드는 것이 이번 제안의 출발점입니다', 'font-size: 17px; font-weight: 700; line-height: 1.45') + '</div>')
    s += f'<div style="{ab(64, 392, 472, 260, "display: flex; flex-direction: column; gap: 14px")}">'
    for n, t, d in [('01', '수익 구조', '객실 [000]실 · 연회 · F&B — 매출의 [00]%가 객실에서 나옵니다'),
                    ('02', '운영 방식', '프런트 · 객실 · 연회 · F&B 팀이 각자 다른 안내 수단을 씁니다'),
                    ('03', '지금 과제', '행사 · 프로모션 안내가 층마다 달라 문의가 프런트에 몰립니다')]:
        s += (f'<div style="display: flex; gap: 14px; border-top: 1px solid {LINE}; padding-top: 12px">'
              + b.tb(n, f'{NUM}; font-size: 15px; font-weight: 800; color: {BLUE}; width: 24px; flex-shrink: 0')
              + '<div style="display: flex; flex-direction: column; gap: 3px; min-width: 0">' + b.tb(t, 'font-size: 16px; font-weight: 800') + b.tb(d, f'font-size: 13.5px; line-height: 1.5; color: {BODY}') + '</div></div>')
    s += '</div>'
    s += footer(b, 'B 호텔 · 사진: samsung.com 호텔 도입사례', 3, x1=536)
    return root(s)

# ---------------------------------------------------------------- 4 customer · operation flow photo strip
@layout(f='L_PH_CB_C', code='PH-CB-C', p='customer', name='운영 흐름 · 포토 스트립', when='고객의 하루 운영을 단계 사진으로 보여주고, 단계마다 생기는 문제를 짚을 때',
        pv=['L_CB_C'], sample='H 백화점', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · 고객사 이해', 'H 백화점 고객의 동선 다섯 단계, 문제는 단계 사이에서 생깁니다', '입장부터 쾌적한 체류까지 — 사진은 같은 업종의 실제 현장, 수치는 고객 데이터로 채웁니다')
    steps = [('ph.rt-atrium-kiosk', '50% 60%', '입장 · 안내', '층별 행사 · 브랜드 위치를 찾느라 안내데스크에 줄이 생깁니다', '[00]건/일', '안내 문의'),
             ('ph.rt-fashion-store', '55% 50%', '탐색 · 브랜드', '매장마다 화면 · 포스터가 따로 놀아 신상품 메시지가 흩어집니다', '[00]%', '행사 인지율'),
             ('ph.rt-salon-mirror', '50% 45%', '체험 · 상담', '상담 중 보여줄 화면이 없어 카탈로그 · 휴대폰으로 설명합니다', '[00]분', '평균 상담'),
             ('ph.rt-foodhall', '50% 40%', '식품관 · 휴식', '피크 시간 대기 · 혼잡 안내가 늦어 체류가 짧아집니다', '[00]분', '피크 대기'),
             ('ph.rt-mall-ac', '50% 55%', '쾌적 · 운영', '층 · 구역별 냉난방이 따로 돌아 민원과 전력이 함께 늘어납니다', '[000]MWh', '연간 공조 전력')]
    s += f'<div style="{ab(64, 168, 1152, 420, "display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 20px")}">'
    for i, (pid, pos, t, d, m, ml) in enumerate(steps):
        s += ('<div style="display: flex; flex-direction: column; gap: 9px; min-width: 0">'
              + '<span style="display: flex; align-items: center; gap: 8px">' + b.tb(f'0{i + 1}', f'{NUM}; width: 24px; height: 24px; border-radius: 50%; background: {BLUE}; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0') + b.tb(t, 'font-size: 15.5px; font-weight: 800') + '</span>'
              + b.img(pid, 'position: relative; width: 100%; height: 226px', pos=pos, kind='space', hint=f'{t} 단계 현장 사진', radius=12)
              + chip(b, '지금 문제', WARN, WARNBG, 11, 20)
              + b.tb(d, f'font-size: 13px; line-height: 1.55; color: {BODY}')
              + f'<span style="margin-top: auto; display: flex; align-items: baseline; gap: 6px; border-top: 1px solid {LINE}; padding-top: 8px">' + b.tb(m, f'{NUM}; font-size: 20px; font-weight: 800; color: {BLUE}') + b.tb(ml, f'font-size: 11.5px; color: {MUTED}') + '</span></div>')
    s += '</div>'
    s += (f'<div style="{ab(64, 600, 1152, 52, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 18px; display: flex; align-items: center; gap: 14px")}">'
          + b.tb('공통 원인', f'font-size: 12px; font-weight: 800; color: {BLUE}; flex-shrink: 0')
          + b.tb('화면 · 공조 · 안내가 공간마다 따로 운영돼, 고객이 다음 단계로 넘어가는 순간을 아무도 챙기지 못합니다', 'font-size: 14px; font-weight: 600') + '</div>')
    s += footer(b, 'H 백화점 · 매장 디지털 전환 제안 · 사진: samsung.com 리테일 도입사례', 6)
    return root(s)

# ---------------------------------------------------------------- 5 user · personas with photos
@layout(f='L_PH_US_A', code='PH-US-A', p='user', name='페르소나 3 · 인물 사진', when='사용자 유형이 뚜렷이 나뉘고, 각자의 장면을 사진으로 보여줄 때',
        pv=['L_MI05', 'L_US_C'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · 사용자 이해', '메뉴보드를 쓰는 세 사람, 원하는 것이 다릅니다', '비즈니스 사용자 분석 — 인터뷰 및 매장 관찰 기반 · 사진은 역할 참고 이미지')
    s += f'<div style="{ab(64, 160, 1152, 490, "display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px")}">'
    for pid, pos, role, sub, q, pain, want in [
        ('ph.fb-pos-pay', '55% 35%', '점장', '매장 운영 · 직원 관리', '“아침마다 메뉴판 바꾸는 시간이 아까워요”', '본사 공문을 보고 메뉴판을 직접 교체, 표기 실수가 잦음', '본사가 바꾸면 우리 매장 화면도 알아서 바뀌기'),
        ('ph.rt-staff-tablet', '50% 40%', '본사 운영자', '마케팅 · 프로모션 기획', '“320개 매장이 같은 날 같은 화면이었으면”', '매장별 적용 여부를 확인할 방법이 없음', '한 번에 배포하고 적용 현황을 보는 대시보드'),
        ('ph.fb-tablet-menu', '45% 35%', '손님', '출근길 · 점심 피크 방문', '“줄 서 있는 동안 메뉴를 다 보고 싶어요”', '작은 글씨 · 품절 표시 누락으로 주문이 늦어짐', '멀리서도 읽히고 실시간으로 맞는 메뉴')]:
        s += (f'<div style="box-sizing: border-box; border: 1px solid {LINE}; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column">'
              + b.img(pid, 'position: relative; width: 100%; height: 226px', pos=pos, kind='people', hint=f'{role}의 일하는 · 이용하는 장면')
              + '<div style="padding: 16px 18px 16px; display: flex; flex-direction: column; gap: 8px; flex-grow: 1">'
              + '<span style="display: flex; align-items: baseline; gap: 8px">' + b.tb(role, 'font-size: 19px; font-weight: 800') + b.tb(sub, f'font-size: 12.5px; color: {MUTED}') + '</span>'
              + b.tb(q, f'font-size: 15px; font-weight: 700; line-height: 1.45; color: {BLUE}')
              + f'<div style="display: flex; flex-direction: column; gap: 2px; border-top: 1px solid {LINE}; padding-top: 8px">' + b.tb('불편', f'font-size: 11px; font-weight: 700; color: {WARN}') + b.tb(pain, f'font-size: 13px; line-height: 1.5; color: {BODY}') + '</div>'
              + '<div style="display: flex; flex-direction: column; gap: 2px">' + b.tb('원하는 것', f'font-size: 11px; font-weight: 700; color: {BLUE}') + b.tb(want, 'font-size: 13px; line-height: 1.5; font-weight: 600') + '</div>'
              + '</div></div>')
    s += '</div>'
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 공식 연출', 8)
    return root(s)

# ---------------------------------------------------------------- 6 user · journey moments
@layout(f='L_PH_US_B', code='PH-US-B', p='user', name='고객 여정 · 순간 포토 5', when='고객이 겪는 순간을 사진으로 잇고, 감정 곡선 위에 불편과 기회를 표시할 때',
        pv=['L_US_B', 'L_MI_HT_C', 'L_MI_FN_C', 'L_MI_ED_C', 'L_MI_MD_C', 'L_MI_VN_C', 'L_MI_AD_C', 'L_MI_RS_C', 'L_MI_SV_C', 'L_MI_ID_C', 'L_MI_OE_C', 'L_MI_FB_C', 'L_MI_RT_C', 'L_MI_TP_C', 'L_MI_OF_C', 'L_ZP_C'],
        sample='B 호텔', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · 사용자 여정', 'B 호텔 투숙객의 하룻밤, 평가는 다섯 순간에서 갈립니다', '고객 여정 — 사진은 같은 업종의 실제 공간, 감정 곡선은 고객 설문 · VOC로 보정')
    moments = [('ph.ht-entrance', '50% 60%', '도착', '입구에서 행사 · 주차 안내를 찾기 어렵습니다', '입구 화면이 도착 안내를 먼저'),
               ('ph.ht-lobby-art', '55% 50%', '체크인', '피크 시간 대기 · 객실 준비 여부를 알 수 없습니다', '대기 · 준비 상태를 로비 화면에'),
               ('ph.ht-room-tv', '60% 50%', '객실 입실', '웰컴 메시지 없이 리모컨부터 찾습니다', 'TV 웰컴 화면 · 호텔 안내'),
               ('ph.ht-buffet-wall', '65% 50%', '식사', '조식 혼잡 정도를 내려가 봐야 압니다', '혼잡도 · 메뉴를 객실 TV에서'),
               ('ph.ht-room-night', '50% 50%', '휴식 · 취침', '바람 · 소음으로 잠을 설쳤다는 VOC가 많습니다', '직바람 없는 냉방 · 객실 제어')]
    s += f'<div style="{ab(64, 160, 1152, 236, "display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 20px")}">'
    for i, (pid, pos, t, *_r) in enumerate(moments):
        s += ('<div style="position: relative; min-width: 0">' + b.img(pid, 'position: relative; width: 100%; height: 236px', pos=pos, kind='space', hint=f'여정 {i + 1} · {t} 순간', radius=12)
              + f'<div style="position: absolute; left: 10px; bottom: 10px; box-sizing: border-box; border-radius: 8px; background: {GLASS}; padding: 5px 10px; display: flex; gap: 6px; align-items: baseline">'
              + b.tb(f'0{i + 1}', f'{NUM}; font-size: 12px; font-weight: 800; color: {LB}') + b.tb(t, 'font-size: 14px; font-weight: 800; color: #fff') + '</div></div>')
    s += '</div>'
    # emotion curve (fixed drawing)
    ys = [40, 58, 26, 46, 18]
    xs = [64 + 105 + i * 234.4 for i in range(5)]
    pts = ' '.join(f'{x - 64:.0f},{y}' for x, y in zip(xs, ys))
    s += (f'<svg style="{ab(64, 404, 1152, 76)}" viewBox="0 0 1152 76" fill="none"><line x1="0" y1="38" x2="1152" y2="38" stroke="{LINE}" stroke-dasharray="4 4"/>'
          f'<polyline points="{pts}" stroke="{BLUE}" stroke-width="2.5" fill="none"/>'
          + ''.join(f'<circle cx="{x - 64:.0f}" cy="{y}" r="6" fill="#fff" stroke="{BLUE}" stroke-width="2.5"/>' for x, y in zip(xs, ys)) + '</svg>')
    s += b.tb('감정 곡선 · 높을수록 만족', ab(1216 - 200, 392, 200, extra=f'font-size: 11px; color: {FAINT}; text-align: right'), 'div')
    s += f'<div style="{ab(64, 490, 1152, 160, "display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 20px")}">'
    for pid, pos, t, pain, opp in moments:
        s += ('<div style="display: flex; flex-direction: column; gap: 4px; min-width: 0">'
              + b.tb('불편', f'font-size: 11px; font-weight: 700; color: {WARN}') + b.tb(pain, f'font-size: 13px; line-height: 1.5; color: {BODY}')
              + f'<span style="margin-top: 6px; border-top: 1px solid {LINE}; padding-top: 6px; display: flex; flex-direction: column; gap: 2px">' + b.tb('기회', f'font-size: 11px; font-weight: 700; color: {BLUE}') + b.tb(opp, 'font-size: 13px; line-height: 1.45; font-weight: 700') + '</span></div>')
    s += '</div>'
    s += footer(b, 'B 호텔 · 객실 · 공용부 디스플레이 제안 · 사진: samsung.com 호텔 도입사례', 7)
    return root(s)

# ---------------------------------------------------------------- 7 challenge · 3 problems with photos
@layout(f='L_PH_CH_A', code='PH-CH-A', p='challenge', name='과제 3 · 현장 사진', when='고객 과제를 현장 사진과 함께 보여주고, 과제마다 비용을 붙일 때',
        pv=['L_CH_A', 'L_CH_C', 'L_CH_D'], sample='C 빌딩', grp='과제 · 가치')
def _(b):
    s = header(b, '02 · 고객 과제', 'C 빌딩의 운영 과제는 세 공간에 몰려 있습니다', '현장 인터뷰 · 시설 민원 기록 기반 — 비용은 고객 데이터로 산출')
    s += f'<div style="{ab(64, 160, 1152, 490, "display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px")}">'
    for i, (pid, pos, sp, t, d, n, nl) in enumerate([
        ('ph.of-meeting', '50% 50%', '회의실', '비어 있어도 예약은 꽉 차 있습니다', '노쇼 · 중복 예약을 확인할 방법이 없어 회의실이 늘 부족하다는 민원이 반복됩니다', '[00]시간', '월 평균 노쇼 시간'),
        ('ph.of-lobby-info', '60% 50%', '로비 · 공용부', '입주사 안내가 아직 종이와 엑셀입니다', '입주사 · 층 안내가 바뀔 때마다 출력물을 다시 붙이고, 방문객은 안내데스크에 묻습니다', '[00]건', '월 안내 문의'),
        ('ph.of-office-ac', '50% 40%', '업무층', '층마다 냉난방 민원이 다르게 들어옵니다', '구역별 운전 상태를 한눈에 볼 수 없어 민원이 들어온 뒤에야 현장에 갑니다', '[000]만 원', '연간 불필요 공조 비용')]):
        s += ('<div style="display: flex; flex-direction: column; gap: 10px; min-width: 0">'
              + '<div style="position: relative">' + b.img(pid, 'position: relative; width: 100%; height: 262px', pos=pos, kind='space', hint=f'과제가 생기는 공간 ({sp})', radius=14)
              + f'<div style="position: absolute; left: 12px; top: 12px; border-radius: 999px; background: {GLASS}; padding: 4px 12px; display: flex; gap: 6px">' + b.tb(f'과제 0{i + 1}', f'font-size: 11.5px; font-weight: 800; color: {LB}') + b.tb(sp, 'font-size: 11.5px; font-weight: 700; color: #fff') + '</div></div>'
              + b.tb(t, 'font-size: 19px; font-weight: 800; line-height: 1.35; margin-top: 4px')
              + b.tb(d, f'font-size: 14px; line-height: 1.6; color: {BODY}')
              + f'<span style="margin-top: auto; display: flex; align-items: baseline; gap: 8px; border-top: 1px solid {LINE}; padding-top: 10px">' + b.tb(n, f'{NUM}; font-size: 28px; font-weight: 800; color: {BLUE}') + b.tb(nl, f'font-size: 12.5px; color: {MUTED}') + '</span></div>')
    s += '</div>'
    s += footer(b, 'C 빌딩 · 스마트 오피스 운영 제안 · 사진: samsung.com 오피스 도입사례', 9)
    return root(s)

# ---------------------------------------------------------------- 8 challenge · now → desired (photo contrast)
@layout(f='L_PH_CH_B', code='PH-CH-B', p='challenge', name='지금 → 바라는 모습 · 사진 대비', when='지금의 모습과 바라는 모습을 사진 두 장으로 대비시킬 때',
        pv=['L_CH_B', 'L_OP_C'], sample='T 은행', grp='과제 · 가치')
def _(b):
    s = header(b, '02 · 고객 과제', 'T 은행 영업점, 기다리는 창구에서 상담하는 창구로', '지금 → 바라는 모습 — 왼쪽은 흑백 처리한 현재 장면, 오른쪽은 같은 업종의 도입 후 모습')
    s += b.img('ph.fn-branch-gray', ab(64, 162, 548, 300), pos='50% 50%', kind='space', hint='지금의 모습 (흑백 사진 권장)', radius=16)
    s += b.img('ph.fn-counter', ab(668, 162, 548, 300), pos='50% 35%', kind='people', hint='바라는 모습 · 도입 후 장면', radius=16)
    s += b.tb('지금', ab(80, 178, extra=f'border-radius: 999px; background: {GLASS}; color: #fff; font-size: 13px; font-weight: 800; padding: 5px 14px'), 'div')
    s += b.tb('바라는 모습', ab(684, 178, extra=f'border-radius: 999px; background: {BLUE}; color: #fff; font-size: 13px; font-weight: 800; padding: 5px 14px'), 'div')
    s += f'<div style="{ab(616, 288, 48, 48, f"border-radius: 50%; background: #ffffff; border: 2px solid {BLUE}; display: flex; align-items: center; justify-content: center; box-sizing: border-box")}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="{BLUE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>'
    for x, t, items, c in [(64, '번호표 · 종이 서식 · 창구 대기', ['서식 작성 · 확인에 상담 시간의 [00]%가 쓰입니다', '번호표 대기 [00]분, 대기 공간 안내는 고정 포스터', '상품 설명은 종이 리플릿과 직원 말에 의존'], MUTED),
                           (668, '태블릿 상담 · 전자서식 · 대기 없는 창구', ['전자서식으로 작성 · 서명 · 확인을 한 화면에서', '대기 현황 · 상품 안내를 대기 공간 화면에 실시간으로', '상담 내용을 고객에게 화면으로 보여주며 설명'], BLUE)]:
        s += f'<div style="{ab(x, 482, 548, 170, "display: flex; flex-direction: column; gap: 8px")}">' + b.tb(t, f'font-size: 19px; font-weight: 800; color: {INK if c == BLUE else BODY}')
        for it in items:
            s += f'<span style="display: flex; gap: 10px; align-items: baseline"><i style="width: 6px; height: 6px; border-radius: 50%; background: {c}; flex-shrink: 0; transform: translateY(-2px)"></i>' + b.tb(it, f'font-size: 14px; line-height: 1.55; color: {BODY}') + '</span>'
        s += '</div>'
    s += footer(b, 'T 은행 · 영업점 디지털 창구 제안 · 사진: samsung.com 금융 도입사례 (왼쪽은 흑백 처리)', 6)
    return root(s)
