from gen_base import *
L = []
def layout(**meta):
    def deco(fn):
        b = B(); html = fn(b)
        L.append({**meta, 'html': html, '_b': b})
        return fn
    return deco

# ---------------------------------------------------------------- 9 value pillars with photos
@layout(f='L_PH_VP_B', code='PH-VP-B', p='value', name='가치 기둥 3 · 포토', when='Key Message 3개를 각각 그 가치가 보이는 장면 사진과 함께 보여줄 때',
        pv=['L_VP03', 'L_VP02', 'L_VP04'], sample='A 커피', grp='과제 · 가치', pc=0)
def _(b):
    s = header(b, '02 · VALUE PROPS', 'A 커피가 얻는 세 가지 가치', 'Key Message 3 — 사진은 같은 문제를 먼저 푼 매장의 실제 모습')
    s += f'<div style="{ab(64, 160, 1152, 490, "display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px")}">'
    for i, (pid, pos, t, d, n, nl) in enumerate([
        ('ph.fb-cafe-counter', '50% 45%', '본사에서 한 번에 운영', '제작 · 승인 · 배포 · 적용 확인까지 한 화면에서 — 매장은 손님에게만 집중합니다', '[000]', '매장 동시 배포'),
        ('ph.fb-lounge-ac', '55% 35%', '쾌적하고 저전력으로', '영업시간 · 좌석 점유에 맞춰 화면 밝기와 냉난방을 자동으로 조절합니다', '[00]%', '예상 전력 절감'),
        ('ph.fb-cafe-bright', '45% 40%', '프로모션을 몇 분 만에', '시간대 · 시즌 콘텐츠를 예약해 두면 정해진 시각에 전 매장이 함께 바뀝니다', '[00]분', '교체 리드타임')]):
        s += ('<div style="display: flex; flex-direction: column; gap: 10px; min-width: 0">'
              + '<div style="position: relative">' + b.img(pid, 'position: relative; width: 100%; height: 308px', pos=pos, kind='photo', hint=f'가치 {i + 1}이 보이는 장면', radius=16)
              + b.tb(f'0{i + 1}', f'position: absolute; left: 14px; top: 14px; {NUM}; font-size: 15px; font-weight: 800; color: #fff; background: {BLUE}; border-radius: 8px; padding: 4px 10px') + '</div>'
              + b.tb(t, 'font-size: 21px; font-weight: 800; letter-spacing: -0.01em; margin-top: 6px')
              + b.tb(d, f'font-size: 14px; line-height: 1.6; color: {BODY}')
              + f'<span style="margin-top: auto; display: flex; align-items: baseline; gap: 8px; border-top: 1px solid {LINE}; padding-top: 10px">' + b.tb(n, f'{NUM}; font-size: 28px; font-weight: 800; color: {BLUE}') + b.tb(nl, f'font-size: 12.5px; color: {MUTED}') + '</span></div>')
    s += '</div>'
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례 · 공식 연출', 9)
    return root(s)

# ---------------------------------------------------------------- 10 one message, full-bleed
@layout(f='L_PH_VP_C', code='PH-VP-C', p='value', name='한 문장 + 근거 3 · 풀블리드', when='메시지 하나를 강하게 — 장면 사진 한 장 위에 한 문장과 근거 세 개',
        pv=['L_VP05'], sample='H 백화점', grp='과제 · 가치')
def _(b):
    s = b.img('ph.rt-foodhall', ab(0, 0, 1280, 720), pos='50% 45%', kind='space', hint='메시지를 상징하는 대표 장면 (가로 전체)')
    s += f'<div style="{ab(48, 48, 700, 300, f"box-sizing: border-box; border-radius: 18px; background: {GLASS}")}"></div>'
    s += b.tb('02 · VALUE PROPS', ab(84, 80, extra=f'font-size: 13px; font-weight: 700; letter-spacing: 0.06em; color: {LB}'), 'div')
    s += b.tb('고객이 머무는 천장과 벽이, 매장의 목소리가 됩니다', ab(84, 108, 630, extra='font-size: 40px; font-weight: 800; line-height: 1.28; letter-spacing: -0.025em; color: #ffffff'), 'div')
    s += b.tb('H 백화점 식품관 · 아트리움 · 매장 화면을 하나의 채널로 — 행사는 한 번 만들어 전 층에 동시에', ab(84, 268, 630, extra=f'font-size: 15px; line-height: 1.55; color: {LT}'), 'div')
    s += f'<div style="{ab(0, 496, 1280, 224, "background: rgba(10,14,24,0.80)")}"></div>'
    s += f'<div style="{ab(64, 522, 1152, 120, "display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px")}">'
    for n, t, d in [('[000]대', '한 화면에서 관리', '천장 · 기둥 · 매장 사이니지를 본사 콘솔 하나로'),
                    ('[00]분', '전 층 행사 교체', '콘텐츠 예약 · 일괄 배포 — 출력 · 부착 없이'),
                    ('[00]%', '체류 시간 변화', '유사 매장 도입 전후 비교 · [출처 확인]')]:
        s += (f'<div style="display: flex; flex-direction: column; gap: 6px; border-left: 2px solid {LB}; padding-left: 18px">'
              + b.tb(n, f'{NUM}; font-size: 34px; font-weight: 800; color: #ffffff; line-height: 1.1')
              + b.tb(t, 'font-size: 16px; font-weight: 700; color: #ffffff') + b.tb(d, 'font-size: 13px; line-height: 1.5; color: #c9cfda') + '</div>')
    s += '</div>'
    s += footer(b, 'H 백화점 · 매장 디지털 전환 제안 · 사진: samsung.com 리테일 도입사례(현대백화점 판교점)', 10, dark=True)
    return root(s, bg='#0b0d12', color='#ffffff')

# ---------------------------------------------------------------- 11 problem ↔ solution photo pairs
@layout(f='L_PH_VP_A', code='PH-VP-A', p='value', name='과제 ↔ 해결 · 사진 페어', when='과제마다 해법을 짝짓되, 해법은 실제 장면 사진으로 보여줄 때',
        pv=['L_VP01'], sample='E 대학교', grp='과제 · 가치')
def _(b):
    s = header(b, '02 · VALUE PROPS', 'E 대학교의 세 가지 과제, 이렇게 풀립니다', '과제 ↔ 해결 1:1 — 오른쪽 사진은 같은 과제를 먼저 푼 캠퍼스의 실제 모습')
    rows = [('도서관 공지 · 좌석 현황을 찾기 어렵습니다', '학생은 게시판 · 앱을 오가며 정보를 찾고, 공지는 출력물로 붙습니다', 'ph.ed-library-wall', '50% 40%', '입구 비디오월에 좌석 · 공지 · 날씨를 한 화면으로', '들어서는 순간 필요한 정보를 보고, 공지는 관리자 PC에서 바로 바뀝니다', 'VM55B 비디오월 · MagicINFO'),
            ('출력 · 복사 대기 줄이 시험 기간마다 깁니다', '복합기 위치가 흩어져 있고, 결제 · 잔액 문의가 사무실로 몰립니다', 'ph.ed-print-zone', '60% 50%', '출력 존을 모으고 무인 과금으로 대기를 줄입니다', '학생증 · 카드로 바로 결제, 관리자는 원격으로 소모품 · 장애를 확인합니다', '디지털 복합기 · 무인 과금'),
            ('대여 태블릿 충전 · 수량 확인에 손이 많이 갑니다', '수업마다 충전 상태가 달라 수업 시작이 늦어지고 분실 확인이 어렵습니다', 'ph.ed-charging', '50% 45%', '충전 보관함으로 충전 · 보관 · 수량을 한 번에', '꺼내기만 하면 충전된 기기, 비어 있는 칸으로 수량을 바로 확인합니다', 'Galaxy Tab · Knox Suite')]
    s += f'<div style="{ab(64, 160, 1152, 492, "display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px")}">'
    for i, (pt, pd, pid, pos, st, sd, ch) in enumerate(rows):
        s += ('<div style="display: flex; flex-direction: column; gap: 8px; min-width: 0">'
              + f'<div style="box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; min-height: 100px">'
              + b.tb(f'과제 0{i + 1}', f'font-size: 11.5px; font-weight: 800; color: {WARN}') + b.tb(pt, 'font-size: 15.5px; font-weight: 800; line-height: 1.4')
              + b.tb(pd, f'font-size: 12.5px; line-height: 1.5; color: {BODY}') + '</div>'
              + f'<svg style="align-self: center" width="22" height="18" viewBox="0 0 22 18" fill="none" stroke="{BLUE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2v13M4 9l7 7 7-7"/></svg>'
              + '<div style="position: relative">' + b.img(pid, 'position: relative; width: 100%; height: 232px', pos=pos, kind='insitu', hint=f'해결 {i + 1} · 도입 후 장면', radius=14)
              + b.tb('해결', f'position: absolute; left: 10px; top: 10px; border-radius: 999px; background: {BLUE}; color: #fff; font-size: 11.5px; font-weight: 800; padding: 3px 11px') + '</div>'
              + b.tb(st, 'font-size: 15.5px; font-weight: 800; line-height: 1.4; margin-top: 2px') + b.tb(sd, f'font-size: 12.5px; line-height: 1.5; color: {BODY}')
              + '<span style="margin-top: auto">' + chip(b, ch) + '</span></div>')
    s += '</div>'
    s += footer(b, 'E 대학교 · 스마트 캠퍼스 제안 · 사진: samsung.com 교육 도입사례(청주대 · 연세대 · 방송통신대)', 10)
    return root(s)

# ---------------------------------------------------------------- 12 stakeholder value with photos
@layout(f='L_PH_VP_D', code='PH-VP-D', p='value', name='이해관계자별 가치 · 사진', when='의사결정자 · 사용자가 여럿일 때, 각자의 자리를 사진으로 보여주며 가치를 나눌 때',
        pv=['L_VP_D', 'L_VP_V'], sample='C 빌딩', grp='과제 · 가치')
def _(b):
    s = header(b, '02 · VALUE PROPS', '같은 투자, C 빌딩의 네 사람이 각자 얻는 것', '이해관계자별 가치 — 사진은 각 사람이 일하는 · 머무는 자리')
    s += f'<div style="{ab(64, 160, 1152, 490, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px")}">'
    for pid, pos, who, sub, v, n, nl in [
        ('ph.of-control-room', '50% 40%', '자산관리 · 임대인', '건물 가치 · 운영비', '공조 · 조명 · 안내를 한 관제 화면에서 — 운영비와 공실 위험을 함께 낮춥니다', '[00]%', '공용부 에너지'),
        ('ph.of-lounge-tv', '30% 60%', '입주사 직원', '매일 쓰는 사람', '회의실 · 공지 · 셔틀 정보를 라운지 화면에서, 냉난방 요청은 앱으로', '[00]분', '하루 절약 시간'),
        ('ph.of-lobby-info', '65% 50%', '방문객', '처음 오는 사람', '입주사 · 층 안내를 로비에서 바로 찾고, 회의실까지 헤매지 않습니다', '[00]%', '안내 문의 감소'),
        ('ph.of-desk-control', '50% 40%', '시설 관리팀', '민원을 받는 사람', '민원 전에 이상 운전을 먼저 알림으로 — 현장 출동이 줄어듭니다', '[00]건', '월 출동 감소')]:
        s += ('<div style="display: flex; flex-direction: column; gap: 9px; min-width: 0">'
              + b.img(pid, 'position: relative; width: 100%; height: 282px', pos=pos, kind='people', hint=f'{who}의 자리 · 장면', radius=14)
              + '<span style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px">' + b.tb(sub, f'font-size: 11.5px; font-weight: 700; color: {BLUE}') + b.tb(who, 'font-size: 18px; font-weight: 800') + '</span>'
              + b.tb(v, f'font-size: 13.5px; line-height: 1.55; color: {BODY}')
              + f'<span style="margin-top: auto; display: flex; align-items: baseline; gap: 6px; border-top: 1px solid {LINE}; padding-top: 9px">' + b.tb(n, f'{NUM}; font-size: 24px; font-weight: 800; color: {BLUE}') + b.tb(nl, f'font-size: 12px; color: {MUTED}') + '</span></div>')
    s += '</div>'
    s += footer(b, 'C 빌딩 · 스마트 오피스 운영 제안 · 사진: samsung.com 오피스 도입사례', 11)
    return root(s)

# ---------------------------------------------------------------- 13 effect · KPI before → after with photo
@layout(f='L_PH_EF_A', code='PH-EF-A', p='effect', name='KPI 전 → 후 · 도입 후 사진', when='개선 수치를 보여주면서, 그 수치가 만들어지는 도입 후 장면을 함께 보일 때',
        pv=['L_EF_A'], sample='A 커피', grp='과제 · 가치')
def _(b):
    s = b.img('ph.fb-counter-menu', ab(0, 0, 500, 720), pos='42% 50%', kind='insitu', hint='도입 후 모습 (세로로 길게)')
    s += glass_label(b, 24, 612, '도입 후 모습 · 유사 사례', '카운터 메뉴보드 — 말리커피 강남점', w=320)
    s += header(b, '02 · 기대 효과', '도입 1년 후, 네 가지 지표가 이렇게 달라집니다', '예상치 · 유사 사례 기준 — 출처: [사례명]', x=556, w=660, sub_y=148)
    s += b.tb('지표', ab(556, 196, extra=f'font-size: 11.5px; font-weight: 700; color: {FAINT}'), 'div')
    s += b.tb('지금', ab(800, 196, extra=f'font-size: 11.5px; font-weight: 700; color: {FAINT}'), 'div')
    s += b.tb('도입 후', ab(966, 196, extra=f'font-size: 11.5px; font-weight: 700; color: {BLUE}'), 'div')
    for i, (k, kd, a, a_u, c, c_u, ch) in enumerate([('메뉴 교체 소요', '신메뉴 1회 · 전 매장', '[0]', '일', '[00]', '분', '▼ [00]%'),
                                                       ('가격 표기 오류', '월 · 전 매장', '[00]', '건', '[0]', '건', '▼ [00]%'),
                                                       ('주문 대기 시간', '피크 시간 평균', '[0.0]', '분', '[0.0]', '분', '▼ [00]%'),
                                                       ('매장 전력 사용', '매장당 · 월', '[000]', 'kWh', '[000]', 'kWh', '▼ [00]%')]):
        y = 222 + i * 106
        s += f'<div style="{ab(556, y, 660, 96, f"box-sizing: border-box; border-top: 1px solid {LINE}; display: flex; align-items: center")}">'
        s += '<div style="width: 236px; display: flex; flex-direction: column; gap: 3px">' + b.tb(k, 'font-size: 16px; font-weight: 800') + b.tb(kd, f'font-size: 12px; color: {MUTED}') + '</div>'
        s += '<div style="width: 140px; display: flex; align-items: baseline; gap: 3px">' + b.tb(a, f'{NUM}; font-size: 26px; font-weight: 800; color: {FAINT}') + b.tb(a_u, f'font-size: 12px; color: {FAINT}') + '</div>'
        s += f'<svg width="26" height="16" viewBox="0 0 26 16" fill="none" stroke="{BLUE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-right: 18px"><path d="M2 8h20M15 2l7 6-7 6"/></svg>'
        s += '<div style="width: 140px; display: flex; align-items: baseline; gap: 3px">' + b.tb(c, f'{NUM}; font-size: 26px; font-weight: 800; color: {BLUE}') + b.tb(c_u, f'font-size: 12px; color: {BLUE}') + '</div>'
        s += chip(b, ch, extra='margin-left: auto; align-self: center') + '</div>'
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례', 12, x0=556)
    return root(s)

# ---------------------------------------------------------------- 14 effect · numbers + voice from the site
@layout(f='L_PH_EF_C', code='PH-EF-C', p='effect', name='정량 + 정성 · 현장 사진', when='수치 효과와 함께 현장의 체감(인터뷰 · 후기)을 사진 위에 실어 보여줄 때',
        pv=['L_EF_C'], sample='N 체인', grp='과제 · 가치')
def _(b):
    s = header(b, '02 · 기대 효과', '도입 1년, 숫자로 본 변화와 현장에서 들은 변화', 'N 체인 스터디카페 지점 기준 — 정량은 지점 데이터, 정성은 점주 인터뷰로 채웁니다')
    s += b.img('ph.sv-studycafe', ab(64, 160, 700, 492), pos='50% 45%', kind='space', hint='효과가 체감되는 현장 사진', radius=18)
    s += (f'<div style="{ab(88, 470, 560, extra=f"box-sizing: border-box; border-radius: 14px; background: {GLASS}; padding: 18px 22px; display: flex; flex-direction: column; gap: 8px")}">'
          + f'<svg width="26" height="20" viewBox="0 0 26 20" fill="{LB}"><path d="M0 20V11C0 4.6 3.6 0.9 10 0l1 2.6C7.3 3.6 5.6 5.9 5.4 9H10v11H0zm15 0V11c0-6.4 3.6-10.1 10-11l1 2.6c-3.7 1-5.4 3.3-5.6 6.4H25v11H15z"/></svg>'
          + b.tb('“[점주 · 직원이 직접 한 말을 그대로 — 예: 덥다 춥다는 민원이 사라졌어요]”', 'font-size: 18px; font-weight: 700; line-height: 1.5; color: #ffffff')
          + b.tb('— [지점 · 직책 · 이름, 인용 동의 확인 후 기재]', f'font-size: 12.5px; color: {LT}') + '</div>')
    s += b.tb('정량 효과', ab(796, 160, extra=f'font-size: 12px; font-weight: 800; color: {BLUE}; letter-spacing: 0.04em'), 'div')
    for i, (n, t, d) in enumerate([('[00]%', '냉난방 전력', '좌석 점유 · 외기에 맞춘 자동 운전, 지점 평균'),
                                   ('[00]건', '월 쾌적 민원', '덥다 · 춥다 · 바람 민원, 도입 전 3개월 평균 대비'),
                                   ('[0.0]점', '이용 만족도', '이용자 설문 5점 척도 · [표본 수]')]):
        y = 188 + i * 150
        s += (f'<div style="{ab(796, y, 420, 136, f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; padding: 18px 20px; display: flex; flex-direction: column; gap: 4px")}">'
              + b.tb(n, f'{NUM}; font-size: 38px; font-weight: 800; color: {BLUE}; line-height: 1.1') + b.tb(t, 'font-size: 16px; font-weight: 800')
              + b.tb(d, f'font-size: 12.5px; line-height: 1.5; color: {MUTED}') + '</div>')
    s += footer(b, 'N 체인 · 지점 냉난방 · 운영 제안 · 사진: samsung.com 도입사례(토즈 스터디센터)', 13)
    return root(s)

# ---------------------------------------------------------------- 15 why samsung · 3 tall photos
@layout(f='L_PH_ST_A', code='PH-ST-A', p='why', name='강점 3 · 풀하이트 사진', when='삼성의 강점 세 가지를 말 대신 큰 현장 사진으로 증명할 때',
        pv=['L_WS02', 'L_WS04', 'L_ST_E', 'L_WS03'], sample='A 커피', grp='솔루션 · 근거')
def _(b):
    s = header(b, '07 · WHY SAMSUNG', '삼성이어야 하는 세 가지 이유', '말 대신 현장으로 — 사진은 모두 삼성 공식 도입사례')
    for i, (pid, pos, t, d, n, nl) in enumerate([
        ('ph.ad-building-led', '45% 50%', '24시간 · 옥외에서도 버티는 화면', '직사광선 · 비 · 혹서에도 꺼지지 않도록 설계된 상업용 디스플레이', '[00,000]시간', '연속 구동 설계'),
        ('ph.svc-technician', '50% 35%', '전국 어디서나 같은 서비스', '설치부터 점검 · 장애 대응까지 직영 서비스망이 같은 기준으로 관리합니다', '[000]개', '서비스 거점'),
        ('ph.vn-stadium-board', '50% 30%', '대형 현장에서 검증된 운영', '경기장 · 공항 · 백화점처럼 멈추면 안 되는 공간에서 먼저 쓰였습니다', '[000]곳', '대형 공간 레퍼런스')]):
        x = 64 + i * 392
        s += b.img(pid, ab(x, 160, 368, 492), pos=pos, kind='insitu', hint=f'강점 {i + 1}을 증명하는 현장 사진', radius=18)
        s += (f'<div style="{ab(x + 14, 430, 340, 208, f"box-sizing: border-box; border-radius: 14px; background: {GLASS}; padding: 16px 18px; display: flex; flex-direction: column; gap: 6px")}">'
              + b.tb(f'0{i + 1}', f'{NUM}; font-size: 13px; font-weight: 800; color: {LB}') + b.tb(t, 'font-size: 18.5px; font-weight: 800; line-height: 1.35; color: #ffffff')
              + b.tb(d, f'font-size: 13px; line-height: 1.5; color: {LT}')
              + '<span style="margin-top: auto; display: flex; align-items: baseline; gap: 6px; border-top: 1px solid rgba(255,255,255,0.22); padding-top: 8px">' + b.tb(n, f'{NUM}; font-size: 22px; font-weight: 800; color: #ffffff') + b.tb(nl, f'font-size: 12px; color: {LT}') + '</span></div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례(코엑스 SM타운 · 호텔 스카이파크 · 인천SK행복드림구장)', 27)
    return root(s)

# ---------------------------------------------------------------- 16 case · result numbers + comment (real case)
@layout(f='L_PH_CD_C', code='PH-CD-C', p='case', name='성과 수치 + 코멘트 · 사례 사진', when='공개된 사례의 수치와 고객 코멘트를 현장 사진과 함께 보여줄 때',
        pv=['L_CD_C'], sample='인천SK행복드림구장', grp='솔루션 · 근거')
def _(b):
    s = b.img('ph.vn-stadium-board', ab(0, 0, 680, 720), pos='38% 50%', kind='insitu', hint='사례 대표 사진 (세로로 길게)')
    s += b.img('ph.vn-stadium-wide', ab(28, 520, 300, 172), pos='50% 50%', kind='space', hint='사례 보조 사진 (전경)', radius=12)
    s += f'<div style="{ab(28, 520, 300, 172, "box-sizing: border-box; border: 3px solid #ffffff; border-radius: 12px")}"></div>'
    s += header(b, '06 · 유관 사례', '인천SK행복드림구장 — 세계 최대 크기 야구장 전광판', '스마트 LED 사이니지 빅보드 · 컨트롤룸 · 구단 앱 연동 | 삼성 공식 도입사례', x=728, w=488, sub_y=146)
    s += f'<div style="{ab(728, 222, 488, 230, "display: flex; flex-direction: column; gap: 0")}">'
    for n, t in [('1,138.75㎡', '빅보드 총면적 — 가로 63.398m × 세로 17.962m'), ('100,000시간', '최대 사용 가능 시간'), ('4단계', '업스케일링 · 캘리브레이션으로 화질 보정')]:
        s += (f'<div style="display: flex; align-items: baseline; gap: 14px; border-top: 1px solid {LINE}; padding: 12px 0">'
              + b.tb(n, f'{NUM}; font-size: 28px; font-weight: 800; color: {BLUE}; min-width: 196px') + b.tb(t, f'font-size: 13.5px; line-height: 1.45; color: {BODY}') + '</div>')
    s += '</div>'
    s += (f'<div style="{ab(728, 470, 488, extra=f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; padding: 18px 20px; display: flex; flex-direction: column; gap: 6px")}">'
          + b.tb('“마치 안방에서 스마트 TV를 보는 기분이에요”', 'font-size: 18px; font-weight: 700; line-height: 1.45')
          + b.tb('— 도입사례 원문 인용', f'font-size: 12.5px; color: {MUTED}') + '</div>')
    s += b.tb('원문 · samsung.com/sec/business/insights/case-study/reference-incheonsk-bigboard', ab(728, 610, 488, extra=f'font-size: 11.5px; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
    s += footer(b, '수치 · 인용: 삼성 공식 도입사례(2017) · 사진: samsung.com', 23, x0=728)
    return root(s)

# ---------------------------------------------------------------- 17 case · reference photo wall (real cases)
@layout(f='L_PH_CL_C', code='PH-CL-C', p='case', name='레퍼런스 포토 월', when='사례 수 자체가 메시지일 때 — 업종별 대표 도입 현장을 사진 벽으로',
        pv=['L_CL_C'], sample='삼성 도입사례 8곳', grp='솔루션 · 근거')
def _(b):
    s = header(b, '06 · 레퍼런스', '삼성이 먼저 바꾼 현장들', '업종별 대표 레퍼런스 — 모두 삼성 공식 도입사례, 원문은 samsung.com', w=820)
    s += (f'<div style="{ab(916, 58, 300, 64, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 10px 16px; display: flex; align-items: baseline; justify-content: flex-end; gap: 8px")}">'
          + b.tb('[00]', f'{NUM}; font-size: 30px; font-weight: 800; color: {BLUE}') + b.tb('개 업종 ·', f'font-size: 13px; color: {MUTED}')
          + b.tb('[000]', f'{NUM}; font-size: 30px; font-weight: 800; color: {BLUE}') + b.tb('건 도입', f'font-size: 13px; color: {MUTED}') + '</div>')
    refs = [('ph.fb-pickup', '50% 50%', '말리커피 강남점', '외식 · 스마트 사이니지 메뉴보드'),
            ('ph.ht-room-tv', '60% 50%', '롯데 시그니엘 서울', '호텔 · 삼성 호텔 TV 235실'),
            ('ph.rt-foodhall', '50% 40%', '현대백화점 판교점', '리테일 · 스마트 사이니지 160대'),
            ('ph.vn-stadium-board', '50% 30%', '인천SK행복드림구장', '경기장 · LED 빅보드 1,138.75㎡'),
            ('ph.ad-building-led2', '50% 45%', '코엑스 SM타운', '옥외 광고 · 곡면 LED 외벽 1,620㎡'),
            ('ph.fn-counter', '50% 35%', 'KEB하나은행', '금융 · 전 영업점 스마트 창구'),
            ('ph.ed-library-wall', '45% 40%', '청주대학교 중앙도서관', '교육 · 비디오월 · 키오스크'),
            ('ph.pb-control', '50% 50%', '대구광역시 교통정보서비스센터', '공공 · The Wall 상황판 11.52m')]
    s += f'<div style="{ab(64, 148, 1152, 506, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 18px 20px")}">'
    for pid, pos, cust, sub in refs:
        s += ('<div style="display: flex; flex-direction: column; gap: 7px; min-width: 0">'
              + b.img(pid, 'position: relative; width: 100%; height: 178px', pos=pos, kind='insitu', hint=f'{cust} 도입 현장', radius=12)
              + b.tb(cust, 'font-size: 14.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(sub, f'font-size: 12px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += '</div>'
    s += footer(b, '사례 · 사진: 삼성 공식 도입사례(samsung.com/sec/business/insights/case-study)', 24)
    return root(s)
