from gen_base import *
L = []
def layout(**meta):
    def deco(fn):
        b = B(); html = fn(b)
        L.append({**meta, 'html': html, '_b': b})
        return fn
    return deco

# ---------------------------------------------------------------- 29 scenario · space map as photo mosaic
@layout(f='L_PH_SS_A', code='PH-SS-A', p='scenario', name='공간 맵 · 포토 모자이크', when='한 매장 · 건물의 여러 공간을 도면 대신 공간 사진 모자이크로 보여줄 때',
        pv=['L_SS_FB_A', 'L_SS_RT_A', 'L_SS_FN_A', 'L_SS_MD_A', 'L_SS_RS_A', 'L_SS_VN_A', 'L_SS_SV_A', 'L_SS_ID_A', 'L_SS_TP_A', 'L_SS_AD_A', 'L_SS_PB_A', 'L_VS01', 'L_SS_HT_A', 'L_SS_OF_A', 'L_SS_ED_A', 'L_SS_MF_A', 'L_SS_OE_A'],
        sample='A 커피', grp='공간 · 제품', sols=['magicinfo', 'stpro'])
def _(b):
    s = header(b, '03 · 공간별 가치 제공 시나리오', 'A 커피 한 매장의 일곱 공간, 손님 동선마다 삼성이 일합니다', '공간 맵 — 사진은 같은 업종의 실제 현장, 번호는 손님 동선 순서')
    s += b.img('ph.fb-counter-menu', ab(64, 160, 448, 492), pos='50% 35%', kind='space', hint='대표 공간 (가장 중요한 공간) 사진', radius=16)
    s += (f'<div style="{ab(80, 520, 416, 116, f"box-sizing: border-box; border-radius: 12px; background: {GLASS}; padding: 12px 16px; display: flex; flex-direction: column; gap: 5px")}">'
          + '<span style="display: flex; align-items: center; gap: 8px">' + b.tb('3', f'{NUM}; width: 24px; height: 24px; border-radius: 50%; background: {BLUE}; color: #fff; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0')
          + b.tb('카운터 · 메인 메뉴보드', 'font-size: 17px; font-weight: 800; color: #ffffff') + b.tb('대표 공간', f'font-size: 11px; font-weight: 700; color: {LB}') + '</span>'
          + b.tb('3연 메뉴보드가 POS와 함께 움직여 품절 · 가격이 바로 반영됩니다', f'font-size: 13px; line-height: 1.5; color: {LT}')
          + b.tb('QM55C × 3 · MagicINFO', f'font-size: 11.5px; font-weight: 700; color: {LB}') + '</div>')
    tiles = [('1', '드라이브스루', 'OH55A-S', 'ph.fb-dt-order', '40% 45%'), ('2', '주문 · 결제', 'Galaxy Tab · KM24C', 'ph.fb-pos-pay', '50% 40%'),
             ('4', '픽업', 'QM55C · 대기 번호', 'ph.fb-pickup', '50% 30%'), ('5', '좌석 · 라운지', '360 카세트 · SmartThings Pro', 'ph.fb-lounge-ac', '55% 35%'),
             ('6', '테이블', 'Galaxy Tab 테이블 주문', 'ph.fb-table-order', '50% 50%'), ('7', '본사 운영', 'MagicINFO · SmartThings Pro', 'ph.rt-staff-tablet', '50% 40%')]
    for i, (n, t, m, pid, pos) in enumerate(tiles):
        x = 528 + (i % 3) * 232; y = 160 + (i // 3) * 254
        s += b.img(pid, ab(x, y, 216, 238), pos=pos, kind='space', hint=f'공간 {n} · {t} 사진', radius=14)
        s += (f'<div style="{ab(x + 8, y + 176, 200, 54, f"box-sizing: border-box; border-radius: 10px; background: {GLASS}; padding: 7px 10px; display: flex; flex-direction: column; gap: 2px")}">'
              + '<span style="display: flex; align-items: center; gap: 6px">' + b.tb(n, f'{NUM}; width: 18px; height: 18px; border-radius: 50%; background: {BLUE}; color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0')
              + b.tb(t, 'font-size: 13.5px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</span>'
              + b.tb(m, f'font-size: 11px; font-weight: 600; color: {LB}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 매장 공간 시나리오 · 사진: samsung.com 도입사례 · 공식 연출', 11)
    return root(s)

# ---------------------------------------------------------------- 30 scenario · a day in 5 time slots
@layout(f='L_PH_SS_C', code='PH-SS-C', p='scenario', name='하루 시나리오 · 시간대 사진 5', when='시간에 따라 공간을 넘나드는 하루를, 시간대마다 장면 사진으로 보여줄 때',
        pv=['L_SS_HT_C', 'L_SS_FB_C', 'L_SS_RT_C', 'L_SS_ED_C', 'L_SS_FN_C', 'L_SS_MD_C', 'L_SS_OF_C', 'L_SS_VN_C', 'L_SS_SV_C', 'L_SS_TP_C', 'L_SS_AD_C', 'L_SS_PB_C', 'L_SS_MF_C', 'L_SS_RS_C', 'L_SS_ID_C', 'L_SS_OE_C', 'L_VM_D'],
        sample='B 호텔', grp='공간 · 제품', sols=['magicinfo', 'lynk', 'stpro'])
def _(b):
    s = header(b, '03 · 공간별 가치 제공 시나리오', 'B 호텔의 하루, 체크아웃 · 연회 · 체크인이 겹쳐도 한 흐름으로', '하루 시나리오 — 시간대마다 운영팀이 먼저 움직이고, 투숙객은 기다리지 않습니다')
    s += f'<div style="{ab(64, 179, 1152, 2, f"background: {LINE}")}"></div>'
    slots = [('ph.ht-buffet-wall', '70% 50%', '07:00', '조식', '레스토랑 혼잡도 · 오늘의 메뉴를 입구와 객실 TV에 함께 띄웁니다', ['MagicINFO', 'LYNK Cloud']),
             ('ph.ht-lobby-art', '60% 50%', '11:00', '체크아웃', '로비 화면이 체크아웃 안내에서 오후 연회 안내로 자동 전환', ['예약 송출']),
             ('ph.ht-ballroom', '50% 50%', '14:00', '연회 · 행사', '대형 스크린 · 음향을 행사 프리셋 하나로 세팅합니다', ['LED · JBL', '프리셋']),
             ('ph.ht-lobby-signage', '84% 50%', '18:00', '체크인 피크', '층별 안내 · 객실 준비 현황을 로비 세로 화면에 실시간으로', ['QM55C', '객실 상태 연동']),
             ('ph.ht-room-night', '50% 50%', '22:00', '객실 휴식', 'TV 웰컴 화면과 무풍 냉방이 투숙객 취향에 맞춰 조용히', ['HG55BU', 'SmartThings Pro'])]
    s += f'<div style="{ab(64, 164, 1152, 490, "display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 20px")}">'
    for pid, pos, t, ti, d, cs in slots:
        s += ('<div style="display: flex; flex-direction: column; gap: 8px; min-width: 0">'
              + f'<span style="display: flex; align-items: center; gap: 8px"><i style="width: 12px; height: 12px; border-radius: 50%; background: #ffffff; border: 3px solid {BLUE}; box-sizing: border-box; flex-shrink: 0"></i>' + b.tb(t, f'{NUM}; font-size: 19px; font-weight: 800; color: {BLUE}; background: #ffffff; padding-right: 8px') + '</span>'
              + b.img(pid, 'position: relative; width: 100%; height: 262px', pos=pos, kind='space', hint=f'{t} {ti} 장면', radius=12)
              + b.tb(ti, 'font-size: 16.5px; font-weight: 800; margin-top: 2px') + b.tb(d, f'font-size: 13px; line-height: 1.55; color: {BODY}')
              + '<span style="display: flex; gap: 5px; flex-wrap: wrap; margin-top: auto">' + ''.join(chip(b, c, size=11, h=20) for c in cs) + '</span></div>')
    s += '</div>'
    s += footer(b, 'B 호텔 · 객실 · 공용부 디스플레이 제안 · 사진: samsung.com 호텔 도입사례', 13)
    return root(s)

# ---------------------------------------------------------------- 31 scenario · space × solution with photo rows
@layout(f='L_PH_VM_A', code='PH-VM-A', p='scenario', name='공간 × 솔루션 · 사진 행', when='공간과 솔루션을 격자로 맞추되, 공간은 사진으로 바로 알아보게 할 때',
        pv=['L_VS01', 'L_VC_34', 'L_VC_64', 'L_VC_43', 'L_VC_23', 'L_VC_24', 'L_VC_33', 'L_VC_N', 'L_VC_J'], sample='H 백화점', grp='공간 · 제품', sols=['magicinfo', 'stpro', 'hvac', 'knoxsuite'])
def _(b):
    s = header(b, '03 · 공간별 가치 제공 시나리오', 'H 백화점 다섯 공간 × 솔루션 네 가지', '공간 × 솔루션 매트릭스 — ● 핵심 적용 · ○ 선택 적용')
    spaces = [('ad-dept-led', '50% 40%', '외벽 · 광장', '건물 전체가 행사 채널'), ('rt-atrium-kiosk', '50% 60%', '아트리움 · 안내', '층별 행사 · 길 찾기'),
              ('rt-fashion-store', '55% 50%', '패션 매장', '신상품 · 브랜드 영상'), ('rt-foodhall', '50% 40%', '식품관', '대기 · 메뉴 · 신선 관리'), ('rt-mall-ac', '50% 50%', '공용부 · 통로', '구역별 쾌적 운전')]
    sols = [('MagicINFO', '콘텐츠 · 화면', ['●', '●', '●', '●', '']), ('SmartThings Pro', '공간 · 에너지', ['○', '●', '○', '●', '●']),
            ('삼성 통합공조', '냉난방 · 공기', ['', '○', '', '●', '●']), ('Knox Suite', '직원 기기', ['', '', '●', '○', ''])]
    for j, (pid, pos, sp, d) in enumerate(spaces):
        x = 300 + j * 184
        s += b.img('ph.' + pid, ab(x, 160, 172, 168), pos=pos, kind='space', hint=f'{sp} 사진', radius=12)
        s += f'<div style="{ab(x, 336, 172, 46, "display: flex; flex-direction: column; gap: 2px")}">' + b.tb(sp, 'font-size: 14.5px; font-weight: 800') + b.tb(d, f'font-size: 11.5px; color: {MUTED}') + '</div>'
    for i, (n, d, marks) in enumerate(sols):
        y = 392 + i * 64
        s += f'<div style="{ab(64, y, 1152, 64, f"box-sizing: border-box; border-top: 1px solid {LINE}")}"></div>'
        s += f'<div style="{ab(64, y + 12, 220, extra="display: flex; flex-direction: column; gap: 2px")}">' + b.tb(n, 'font-size: 15px; font-weight: 800') + b.tb(d, f'font-size: 12px; color: {MUTED}') + '</div>'
        for j, mk in enumerate(marks):
            x = 300 + j * 184
            if i % 2 == 0: s += f'<div style="{ab(x, y + 1, 172, 63, "background: #fafbfc")}"></div>'
            s += b.tb(mk, ab(x, y + 12, 172, 40, f'display: flex; align-items: center; justify-content: center; font-size: 24px; color: {BLUE if mk == "●" else FAINT}'), 'div')
    s += f'<div style="{ab(64, 648, 1152, 1, f"background: {LINE}")}"></div>'
    s += footer(b, 'H 백화점 · 매장 디지털 전환 제안 · 사진: samsung.com 리테일 도입사례', 12)
    return root(s)

# ---------------------------------------------------------------- 32 overview · executive summary with hero
@layout(f='L_PH_ES_A', code='PH-ES-A', p='overview', name='제안 요약 · 히어로 사진', when='결정권자가 맨 앞 한 장만 볼 때 — 위에는 대상 현장 사진, 아래는 과제 · 제안 · 효과 · 이유',
        pv=['L_ES_A', 'L_ES_B', 'L_OV_A'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = b.img('ph.fb-cafe-counter', ab(0, 0, 1280, 300), pos='50% 45%', kind='space', hint='제안 대상 현장 사진 (가로 띠)')
    s += f'<div style="{ab(40, 36, 760, 228, f"box-sizing: border-box; border-radius: 16px; background: {GLASS}")}"></div>'
    s += header(b, '00 · 제안 요약', '320개 매장 메뉴판을, 본사에서 한 번에 바꿉니다', '한 장으로 보는 이번 제안 — 과제 → 제안 → 효과 → 왜 삼성', x=72, w=700, y=66, dark=True, sub_y=176)
    cols = [('01', '지금의 과제', [('[00]일', '메뉴 교체 1회 소요'), ('', '인쇄 · 배송 · 현장 교체 5단계'), ('', '매장마다 메뉴판이 다른 날 바뀜')]),
            ('02', '이번 제안', [('', 'QM55C · KM24C · OH55A-S'), ('', 'MagicINFO 본사 통합 관리'), ('', '[320]개 매장 · [3]단계 확산')]),
            ('03', '기대 효과', [('[0]일 → [0]분', '메뉴 교체'), ('연 -[00]%', '인쇄 · 배송비'), ('-[00]%', '주문 대기')]),
            ('04', '왜 삼성', [('', '24시간 상업용 설계'), ('', '전국 직영 서비스망'), ('', '외식 업종 도입 레퍼런스')])]
    s += f'<div style="{ab(64, 324, 1152, 268, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px")}">'
    for i, (n, t, items) in enumerate(cols):
        hi = i == 1
        s += f'<div style="box-sizing: border-box; border-radius: 14px; background: {CHIP if hi else SOFT}; padding: 16px 18px; display: flex; flex-direction: column; gap: 9px; min-width: 0">'
        s += '<span style="display: flex; align-items: center; gap: 8px">' + b.tb(n, f'{NUM}; width: 24px; height: 24px; border-radius: 50%; background: {BLUE}; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0') + b.tb(t, 'font-size: 16px; font-weight: 800') + '</span>'
        for k, v in items:
            if k: s += '<span style="display: flex; flex-direction: column; gap: 1px">' + b.tb(k, f'{NUM}; font-size: 22px; font-weight: 800; color: {BLUE}') + b.tb(v, f'font-size: 12.5px; color: {MUTED}') + '</span>'
            else: s += f'<span style="display: flex; gap: 8px; align-items: baseline"><i style="width: 5px; height: 5px; border-radius: 50%; background: {BLUE}; flex-shrink: 0; transform: translateY(-2px)"></i>' + b.tb(v, f'font-size: 13.5px; line-height: 1.5; color: {BODY}; font-weight: 600') + '</span>'
        s += '</div>'
    s += '</div>'
    s += (f'<div style="{ab(64, 604, 1152, 50, f"box-sizing: border-box; border-radius: 12px; background: {BLUE}; padding: 0 12px 0 20px; display: flex; align-items: center; gap: 14px")}">'
          + b.tb('KEY MESSAGE', f'font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: {LB}; flex-shrink: 0')
          + b.tb('메뉴는 본사가, 매장은 손님에게 집중합니다', 'font-size: 16px; font-weight: 800; color: #ffffff')
          + b.tb('결정 요청 · 시범 매장 [10]곳 [00]월 착수', 'margin-left: auto; height: 30px; padding: 0 14px; border-radius: 999px; background: #ffffff; color: #1428a0; font-size: 12.5px; font-weight: 800; display: flex; align-items: center; white-space: nowrap') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례(말리커피)', 2)
    return root(s)

# ---------------------------------------------------------------- 33 execution · pilot → rollout with photos
@layout(f='L_PH_PL_A', code='PH-PL-A', p='execution', name='파일럿 → 확산 · 사진 3단', when='시범 → 확대 → 전체로 넓힐 때, 단계마다 어떤 현장이 바뀌는지 사진으로',
        pv=['L_PL_A', 'L_PL_B', 'L_BM_D'], sample='A 커피', grp='실행 · 비용')
def _(b):
    s = header(b, '09 · 실행 계획', '한 매장에서 검증하고, 320개 매장으로 넓힙니다', '파일럿 → 확산 — 성공 기준을 넘으면 다음 단계로')
    stages = [('ph.fb-cafe-counter', '50% 45%', 'STEP 1 · 파일럿', '직영 [1]개 매장 · [4]주', '메뉴 교체 시간 [00]% 단축', '교체 오류 [0]건 · 점장 만족 [0.0]점 이상'),
              ('ph.fb-lounge-ac', '55% 40%', 'STEP 2 · 권역 확대', '수도권 [30]개 매장 · [8]주', '본사 일괄 배포 [00]분 이내', '매장별 적용률 [00]% · 장애 대응 [0]시간'),
              ('ph.rt-staff-tablet', '50% 40%', 'STEP 3 · 전국 확산', '전 매장 [320]개 · [6]개월', '본사 운영 인력 [0]명으로 관리', '전력 · 비용 리포트 월 1회 정례화')]
    for i, (pid, pos, st, sc, k1, k2) in enumerate(stages):
        x = 64 + i * 392
        s += b.img(pid, ab(x, 160, 360, 236), pos=pos, kind='space', hint=f'{st} 대상 현장 사진', radius=14)
        s += b.tb(st, ab(x + 12, 172, extra=f'border-radius: 999px; background: {BLUE if i == 0 else GLASS}; color: #fff; font-size: 12px; font-weight: 800; padding: 5px 12px'), 'div')
        s += b.tb(sc, ab(x, 410, 360, extra='font-size: 19px; font-weight: 800'), 'div')
        s += (f'<div style="{ab(x, 448, 360, 150, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px")}">'
              + b.tb('다음 단계로 넘어가는 기준', f'font-size: 11.5px; font-weight: 800; color: {BLUE}')
              + b.tb(k1, 'font-size: 15px; font-weight: 800') + b.tb(k2, f'font-size: 13px; line-height: 1.5; color: {BODY}') + '</div>')
        if i < 2:
            s += f'<svg style="{ab(x + 364, 266, 24, 24)}" viewBox="0 0 24 24" fill="none" stroke="{BLUE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
    s += f'<div style="{ab(64, 616, 1152, 8, f"border-radius: 4px; background: {LINE}")}"></div><div style="{ab(64, 616, 384, 8, f"border-radius: 4px; background: {BLUE}")}"></div>'
    s += b.tb('[1] → [30] → [320] 매장', ab(64, 632, 1152, extra=f'{NUM}; font-size: 12.5px; font-weight: 700; color: {MUTED}'), 'div')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례 · 공식 연출', 30)
    return root(s)

# ---------------------------------------------------------------- 34 execution · build & operate steps with people photos
@layout(f='L_PH_IP_A', code='PH-IP-A', p='execution', name='구축 · 운영 단계 · 현장 사진', when='실사 · 설치 · 교육 · 운영까지 누가 무엇을 하는지 현장 사진과 일정으로 보여줄 때',
        pv=['L_SV_A', 'L_IP_C', 'L_TO_A', 'L_MT_A'], sample='C 빌딩', grp='실행 · 비용')
def _(b):
    s = header(b, '09 · 실행 계획', '실사부터 운영까지, 네 단계를 같은 팀이 책임집니다', '구축 · 운영 단계 — 일정은 계약 후 [0]주 기준, 사진은 실제 서비스 현장')
    weeks = [('1–2주', 2), ('3–6주', 4), ('7주', 1), ('8주~', 2)]
    tot = sum(w for _, w in weeks); x = 64
    for i, (t, w) in enumerate(weeks):
        ww = 1152 * w / tot
        s += f'<div style="{ab(round(x), 160, round(ww) - 4, 26, f"border-radius: 6px; background: {BLUE if i < 3 else CHIP}; display: flex; align-items: center; padding-left: 10px; box-sizing: border-box")}">' + b.tb(t, f'{NUM}; font-size: 12px; font-weight: 800; color: {"#ffffff" if i < 3 else BLUE}') + '</div>'
        x += ww
    steps = [('ph.md-cart-tablet', '60% 35%', '현장 실사 · 설계', '층별 실측 · 전원 · 네트워크를 확인하고 설치 도면을 확정합니다', '설치 도면 · 물량표', '삼성 · 시공 파트너'),
             ('ph.svc-technician', '50% 30%', '설치 · 시공', '야간 · 주말 시공으로 입주사 업무를 멈추지 않습니다', '시공 완료 보고서', '시공 파트너'),
             ('ph.of-hall-ac', '50% 50%', '교육 · 인수', '관리자 · 시설팀 대상 운영 교육 후 인수 테스트를 함께 합니다', '운영 매뉴얼 · 인수 확인서', '삼성 · 고객 시설팀'),
             ('ph.of-control-room', '50% 40%', '운영 · 유지보수', '원격 모니터링과 정기 점검 — 장애는 [0]시간 안에 대응합니다', '월간 운영 리포트', '삼성 서비스')]
    s += f'<div style="{ab(64, 202, 1152, 452, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px")}">'
    for i, (pid, pos, t, d, out, who) in enumerate(steps):
        s += ('<div style="display: flex; flex-direction: column; gap: 8px; min-width: 0">'
              + '<div style="position: relative">' + b.img(pid, 'position: relative; width: 100%; height: 258px', pos=pos, kind='people', hint=f'{t} 현장 사진', radius=14)
              + b.tb(f'0{i + 1}', f'position: absolute; left: 10px; top: 10px; {NUM}; border-radius: 8px; background: {BLUE}; color: #fff; font-size: 13px; font-weight: 800; padding: 3px 9px') + '</div>'
              + b.tb(t, 'font-size: 17.5px; font-weight: 800; margin-top: 4px') + b.tb(d, f'font-size: 13.5px; line-height: 1.55; color: {BODY}')
              + f'<div style="margin-top: auto; border-top: 1px solid {LINE}; padding-top: 8px; display: flex; flex-direction: column; gap: 4px">'
              + '<span style="display: flex; gap: 6px; align-items: baseline">' + b.tb('산출물', f'font-size: 11px; font-weight: 800; color: {BLUE}; width: 38px; flex-shrink: 0') + b.tb(out, 'font-size: 12.5px; font-weight: 600') + '</span>'
              + '<span style="display: flex; gap: 6px; align-items: baseline">' + b.tb('담당', f'font-size: 11px; font-weight: 800; color: {MUTED}; width: 38px; flex-shrink: 0') + b.tb(who, f'font-size: 12.5px; color: {BODY}') + '</span></div></div>')
    s += '</div>'
    s += footer(b, 'C 빌딩 · 스마트 오피스 운영 제안 · 사진: samsung.com 도입사례(서비스 · 교육 · 관제 현장)', 31)
    return root(s)

# ---------------------------------------------------------------- 35 closing · next steps with photo
@layout(f='L_PH_C13', code='PH-C13', p='closing', name='마무리 · 다음 단계 + 사진', when='결정 요청으로 끝낼 때 — 도입 후 모습 사진 옆에 다음 단계 세 가지와 연락처',
        pv=['L_C13', 'L_C07'], sample='A 커피', grp='표지 · 마무리')
def _(b):
    s = b.img('ph.fb-cafe-bright', ab(0, 0, 600, 720), pos='38% 50%', kind='space', hint='도입 후 모습 · 마무리 사진 (세로로 길게)')
    s += glass_label(b, 24, 612, '도입 후 모습 · 참고 연출', '메뉴가 콘텐츠가 되는 매장', w=280)
    s += header(b, '마무리 · 다음 단계', '결정해 주시면, 4주 안에 첫 매장이 바뀝니다', '오늘 결정이 필요한 것과 그다음 일정', x=648, w=568, sub_y=148)
    for i, (t, d, when, who) in enumerate([('시범 매장 [10]곳 확정', '직영 · 가맹 매장 중 피크 · 드라이브스루 유형을 고루 포함', '[00월 00일]', 'A 커피 운영팀'),
                                            ('현장 실사 · 설치 일정 확정', '매장별 실측 · 전원 · 네트워크 확인 후 설치 도면 공유', '[00월 00일]', '삼성 · 시공 파트너'),
                                            ('파일럿 결과 보고 · 확산 결정', '교체 시간 · 오류 · 만족도로 다음 단계 여부 판단', '[00월 00일]', '공동')]):
        y = 204 + i * 120
        s += f'<div style="{ab(648, y, 568, 108, f"box-sizing: border-box; border-top: 1px solid {LINE}; padding-top: 14px; display: flex; gap: 16px")}">'
        s += b.tb(f'0{i + 1}', f'{NUM}; width: 34px; height: 34px; border-radius: 50%; background: {BLUE if i == 0 else CHIP}; color: {"#fff" if i == 0 else BLUE}; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0')
        s += ('<div style="display: flex; flex-direction: column; gap: 4px; min-width: 0; flex-grow: 1">' + b.tb(t, 'font-size: 17px; font-weight: 800') + b.tb(d, f'font-size: 13px; line-height: 1.5; color: {BODY}')
              + '<span style="display: flex; gap: 12px">' + b.tb(when, f'{NUM}; font-size: 12.5px; font-weight: 800; color: {BLUE}') + b.tb(who, f'font-size: 12.5px; color: {MUTED}') + '</span></div></div>')
    s += (f'<div style="{ab(648, 574, 568, 76, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 12px 18px; display: flex; flex-direction: column; gap: 4px; justify-content: center")}">'
          + b.tb('담당', f'font-size: 11.5px; font-weight: 800; color: {BLUE}') + b.tb('[이름] · [부서] · [연락처] · [이메일]', 'font-size: 14.5px; font-weight: 700') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 공식 연출', 32, x0=648)
    return root(s)
