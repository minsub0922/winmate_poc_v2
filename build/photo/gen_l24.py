# 6차 — 고객 과제 · 기대 효과 · 사용자 이해 사진 레이아웃 다각화 (gen_l24)
# 기존 L_PH_CH_A ~ C · L_PH_US_A · B · D 와 짜임이 겹치지 않게: 손실 막대 · 동선 핀 · 공간 격자 · 인용 행 · 시간 3단 · 사진 표 ·
# 풀블리드 숫자 · 역할 × 행 매트릭스 · 도넛 + 장면 사진 · 이해관계자 2×2
from gen_r5 import *
L = []
EB_CH = '02 · 고객 과제'
EB_US = '01 · 사용자 이해'


def ph_src(x):
    return f'사진: samsung.com {SRC[x]} 도입사례 · 비즈니스 페이지'


def fphoto(b, pid, x, y, w, h, pos='50% 50%', hint='', radius=12, filt=''):
    """photo with a CSS filter (흑백 · 어둡게) — 교체 사진에도 같은 처리가 걸림"""
    return b.img(pid, ab(x, y, w, h, f'filter: {filt}' if filt else ''), pos=pos, kind='space', hint=hint, radius=radius)


def bign(b, val, unit='', size=44, color=BLUE, unit_size=None):
    """bignum with an integer line-height (큰 숫자 위아래 글과 겹침 방지)"""
    us = unit_size or max(14, round(size * 0.42))
    return ('<span style="display: flex; align-items: baseline; gap: 4px">'
            + b.tb(val, f'{NUM}; font-size: {size}px; font-weight: 800; line-height: {round(size * 1.3)}px; color: {color}; white-space: nowrap')
            + (b.tb(unit, f'font-size: {us}px; font-weight: 800; line-height: {round(us * 1.5)}px; color: {color}; white-space: nowrap') if unit else '') + '</span>')


def dots(b, n, total=3, on=BLUE, off='#c3c8d1', size=13):
    return b.tb('●' * n + '○' * (total - n), f'font-size: {size}px; letter-spacing: 1px; color: {on}; white-space: nowrap') if off is None else (
        '<span style="display: inline-flex; gap: 1px; white-space: nowrap">' + b.tb('●' * n, f'font-size: {size}px; letter-spacing: 1px; color: {on}')
        + (b.tb('●' * (total - n), f'font-size: {size}px; letter-spacing: 1px; color: {off}') if total > n else '') + '</span>')


# ---------------------------------------------------------------- 1 hidden monthly cost — store photo + loss bars + total
@layout(L, f='L_PH_CH_D', code='PH-CH-D', p='challenge', p2='effect', name='매달 새는 돈 · 매장 사진 + 손실 막대',
        when='눈에 잘 안 보이는 운영 비용을 항목별 월 손실 막대로 쌓고, 합계와 이번 제안이 줄이는 몫을 한 장에서 보여줄 때',
        pv=[], sample=CUST['FB'], grp='과제 · 사진')
def _(b):
    s = header(b, EB_CH, 'A 커피 매장마다 매달 [000]만 원이 보이지 않게 새고 있습니다',
               '매장당 월 평균 숨은 비용 다섯 가지 · 출처: [매장 운영 데이터 · 점주 인터뷰, 연도]', w=1152)
    s += photo(b, 'ph.fb-cafe-counter', 64, 152, 440, 496, pos='28% 50%', hint='숨은 비용이 생기는 매장 사진 (고객 매장으로 교체)', radius=16)
    s += tag_on(b, '숨은 비용이 생기는 자리', 78, 166)
    s += label_on(b, '[000]개 매장 · 매장당 월 평균', '인쇄비보다 사람 시간과 놓친 주문이 더 큽니다', 78, 560, 412)
    X = 528
    s += b.tb('항목별 월 손실 · 매장당', ab(X, 152, 300, 20, f'font-size: 13px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    s += (f'<span style="{ab(916, 152, 300, 20, "display: flex; justify-content: flex-end; align-items: center; gap: 12px")}">'
          + f'<i style="width: 10px; height: 10px; border-radius: 2px; background: {BLUE}"></i>' + b.tb('이번 제안이 줄이는 몫', f'font-size: 11.5px; font-weight: 700; color: {BODY}; white-space: nowrap')
          + '<i style="width: 10px; height: 10px; border-radius: 2px; background: #c3c8d1"></i>' + b.tb('남는 몫', f'font-size: 11.5px; font-weight: 700; color: {BODY}; white-space: nowrap') + '</span>')
    rows = [('ph.fb-counter-gray', '50% 30%', '인쇄 · 배송', '메뉴판 · POP 인쇄와 매장 배송', 1.0, 0.95),
            ('ph.fb-counter-menu', '60% 25%', '재작업', '표기 오류 수정 · 다시 붙이기', 0.55, 0.9),
            ('r4.fb-kitchen-tab', '70% 30%', '직원 시간', '교체 · 확인에 쓰는 근무 시간', 0.8, 0.7),
            ('r4.fb-bakery-menu', '55% 75%', '폐기', '품절 · 마감 할인 표시가 늦어 남는 재고', 0.45, 0.5),
            ('ph.fb-dt-order', '30% 50%', '기회 손실', '피크 대기로 발길을 돌린 주문', 0.9, 0.4)]
    BX, BW = 862, 236
    for i, (pid, pos, nm, d, tot, sol) in enumerate(rows):
        y = 184 + i * 72
        s += photo(b, pid, X, y, 96, 62, pos=pos, hint=f'{nm} 장면 (작은 사진)', radius=8)
        s += (f'<div style="{ab(X + 112, y + 6, 236, 50, "display: flex; flex-direction: column; gap: 2px")}">'
              + b.tb(nm, 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap')
              + b.tb(d, f'font-size: 12px; line-height: 18px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        wt = round(BW * tot); ws = round(wt * sol)
        s += rect(BX, y + 24, BW, 14, SOFT, 3)
        s += rect(BX, y + 24, ws, 14, BLUE, 3)
        s += rect(BX + ws, y + 24, wt - ws, 14, '#c3c8d1', 3)
        s += b.tb('[00]만 원', ab(1116, y + 20, 100, 22, f'{NUM}; font-size: 15px; font-weight: 800; text-align: right; white-space: nowrap'), 'div')
        if i < 4: s += rect(X, y + 68, 688, 1, LINE)
    s += (f'<div style="{ab(X, 556, 688, 92, f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; display: flex; align-items: stretch; overflow: hidden")}">'
          + '<div style="flex: 1; padding: 14px 18px; display: flex; flex-direction: column; justify-content: center; gap: 2px">'
          + b.tb('합계 · 매장당 월', f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap') + bignum(b, '[000]', '만 원', size=34, color=INK) + '</div>'
          + f'<div style="flex: 1; padding: 14px 18px; display: flex; flex-direction: column; justify-content: center; gap: 2px; border-left: 1px solid {LINE}">'
          + b.tb('[000]개 매장 · 연', f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap') + bignum(b, '[00]', '억 원', size=34, color=INK) + '</div>'
          + f'<div style="flex: 1.15; padding: 14px 18px; display: flex; flex-direction: column; justify-content: center; gap: 2px; background: {BLUE}">'
          + b.tb('이번 제안으로 줄이는 몫', f'font-size: 12px; font-weight: 800; color: {LB}; white-space: nowrap') + bignum(b, '[00]', '%', size=34, color='#ffffff') + '</div></div>')
    s += footer(b, DEAL['FB'] + ' · 매장당 월 평균 · 단가 · 빈도 가정 부록 p.[00] · 막대 길이는 예시 · ' + ph_src('FB'), 6)
    return s


# ---------------------------------------------------------------- 2 friction points on the customer path — big photo with pins + list
@layout(L, f='L_PH_CH_E', code='PH-CH-E', p='challenge', name='동선 속 불편 지점 · 매장 사진 핀 5',
        when='손님이 매장을 지나며 멈추고 헤매는 자리를 큰 매장 사진 위 번호 핀으로 찍고, 번호마다 불편과 빈도를 붙일 때',
        pv=[], sample=CUST['RT'], grp='과제 · 사진')
def _(b):
    s = header(b, EB_CH, 'D 리테일 매장 동선, 손님은 다섯 곳에서 멈춥니다',
               '매장 관찰 · 동선 추적 [0]일 · 빈도는 하루 평균 · 출처: [매장 관찰 조사, 연도]', w=1152)
    PX, PY, PW, PH = 64, 152, 736, 496
    s += photo(b, 'ph.rt-atrium-kiosk', PX, PY, PW, PH, pos='50% 50%', hint='고객 동선이 보이는 매장 전경 (고객 매장으로 교체)', radius=16)
    s += tag_on(b, '1층 아트리움 · 고객 동선', PX + 14, PY + 14)
    items = [(0.10, 0.58, '입구 · 층 안내', '들어서자마자 층별 매장 · 행사를 알 수 없습니다', '[000]', 0.7, False),
             (0.36, 0.40, '아트리움 난간', '행사장 위치를 찾느라 한 층을 한 바퀴 돕니다', '[000]', 0.55, False),
             (0.53, 0.74, '안내 키오스크', '한 대뿐이라 줄이 생기고, 검색 결과가 느립니다', '[000]', 0.95, True),
             (0.80, 0.47, '매장 입구', '재고 · 사이즈를 직원에게 물어야만 압니다', '[000]', 0.85, True),
             (0.93, 0.66, '엘리베이터 홀', '기다리는 동안 볼 정보가 없어 그냥 지나칩니다', '[00]', 0.35, False)]
    for i, (fx, fy, *_r) in enumerate(items):
        s += pin(b, str(i + 1), PX + round(PW * fx), PY + round(PH * fy), bg=WARN if items[i][6] else BLUE, size=34)
    RX, RW = 824, 392
    s += (f'<span style="{ab(RX, 152, RW, 20, "display: flex; justify-content: space-between; align-items: center")}">'
          + b.tb('멈추는 자리 · 불편', f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap')
          + b.tb('하루 빈도', f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap') + '</span>')
    for i, (fx, fy, t, d, n, fr, hot) in enumerate(items):
        y = 180 + i * 94
        c = WARN if hot else BLUE
        s += (f'<div style="{ab(RX, y, RW, 84, f"box-sizing: border-box; border-radius: 12px; background: {WARNBG if hot else SOFT}; padding: 10px 14px; display: flex; gap: 12px")}">'
              + numtag(b, str(i + 1), 26, bg=c)
              + '<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">'
              + '<span style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px">'
              + b.tb(t, 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap')
              + b.tb(f'{n}회', f'{NUM}; font-size: 15px; font-weight: 800; color: {c}; white-space: nowrap') + '</span>'
              + b.tb(d, f'font-size: 12.5px; line-height: 18px; color: {BODY}; {clamp(1)}')
              + f'<span style="margin-top: 5px; height: 6px; border-radius: 3px; background: {LINE}; display: block; position: relative"><i style="position: absolute; left: 0; top: 0; height: 6px; width: {round(fr * 100)}%; border-radius: 3px; background: {c}"></i></span>'
              + '</div></div>')
    s += footer(b, DEAL['RT'] + ' · 주황 = 빈도 상위 2곳 · 핀 위치 · 막대 길이는 예시 · ' + ph_src('RT'), 7)
    return s


# ---------------------------------------------------------------- 3 challenge map by space — 2×3 photo grid with severity
@layout(L, f='L_PH_CH_F', code='PH-CH-F', p='challenge', name='공간별 과제 지도 · 공간 사진 6',
        when='건물 · 캠퍼스처럼 공간이 여럿일 때, 공간마다 과제 한 줄 · 심각도 · 민원 건수를 사진 격자로 펼쳐 우선순위를 보여줄 때',
        pv=[], sample=CUST['OF'], grp='과제 · 사진')
def _(b):
    s = header(b, EB_CH, 'C 빌딩 과제를 공간별로 놓으면, 회의실과 업무층이 가장 급합니다',
               '공간 여섯 곳 · 최근 6개월 시설 민원 · 현장 점검 기준 · 출처: [시설 민원 기록, 연도]', w=1152)
    cells = [('ph.of-lobby-info', '60% 50%', '로비 · 1층', '입주사 · 층 안내를 출력물로 다시 붙입니다', 2, '[00]', False),
             ('ph.of-meeting', '50% 55%', '회의실 · 3–5층', '노쇼 · 중복 예약으로 늘 방이 모자랍니다', 3, '[000]', True),
             ('ph.of-office-ac', '50% 35%', '업무층 · 6–12층', '구역마다 덥다 · 춥다 민원이 엇갈립니다', 3, '[000]', True),
             ('r4.of-lounge', '50% 55%', '라운지 · 2층', '공지 화면이 꺼져 있거나 지난 내용입니다', 1, '[00]', False),
             ('ph.of-hall-ac', '50% 40%', '강당 · 지하 1층', '행사 전후 냉방을 수동으로 켜고 끕니다', 2, '[00]', False),
             ('ph.of-rooftop-odu', '50% 55%', '옥상 · 설비', '실외기 이상을 고장 난 뒤에야 압니다', 2, '[00]', False)]
    for i, (pid, pos, sp, t, sev, n, hot) in enumerate(cells):
        x = 64 + (i % 3) * 392; y = 152 + (i // 3) * 226
        s += photo(b, pid, x, y, 368, 212, pos=pos, hint=f'{sp} 공간 사진 (고객 건물로 교체)', radius=14)
        if hot: s += f'<div style="{ab(x, y, 368, 212, f"box-sizing: border-box; border-radius: 14px; border: 3px solid {BLUE}")}"></div>'
        s += tag_on(b, sp, x + 12, y + 12)
        s += b.tb(f'민원 {n}건', ab(x + 368 - 112, y + 12, 100, 26, f'{NUM}; box-sizing: border-box; border-radius: 999px; background: {BLUE if hot else "#ffffff"}; color: {"#ffffff" if hot else BLUE}; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
        s += glass('<span style="display: flex; align-items: center; gap: 8px">'
                   + dots(b, sev, 3, on='#ffffff', off='rgba(255,255,255,0.32)', size=12)
                   + b.tb({3: '심각도 높음', 2: '심각도 중간', 1: '심각도 낮음'}[sev], f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap') + '</span>'
                   + b.tb(t, f'font-size: 14px; font-weight: 800; line-height: 20px; color: #ffffff; {clamp(1)}'),
                   x + 10, y + 212 - 68, 348, 58, pad='8px 12px', gap=2)
    s += (f'<div style="{ab(64, 608, 1152, 40, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 16px; display: flex; align-items: center; gap: 18px")}">'
          + '<span style="display: flex; align-items: center; gap: 6px">' + dots(b, 3, 3, size=12) + b.tb('높음', f'font-size: 12px; font-weight: 700; color: {BODY}') + '</span>'
          + '<span style="display: flex; align-items: center; gap: 6px">' + dots(b, 2, 3, size=12) + b.tb('중간', f'font-size: 12px; font-weight: 700; color: {BODY}') + '</span>'
          + '<span style="display: flex; align-items: center; gap: 6px">' + dots(b, 1, 3, size=12) + b.tb('낮음', f'font-size: 12px; font-weight: 700; color: {BODY}') + '</span>'
          + b.tb('건수 = 최근 6개월 시설 민원 · 합계 [000]건', f'font-size: 12px; color: {MUTED}; white-space: nowrap')
          + pill(b, '파란 테두리 = 이번 제안이 먼저 풀 곳', extra='margin-left: auto; align-self: center') + '</div>')
    s += footer(b, DEAL['OF'] + ' · 심각도 = 빈도 × 업무 영향 (현장 점검 기준) · ' + ph_src('OF'), 8)
    return s


# ---------------------------------------------------------------- 4 voices from the floor — staff photo rows + quote + the challenge it points to
@layout(L, f='L_PH_CH_G', code='PH-CH-G', p='challenge', p2='user', name='현장 목소리 · 직원 사진 + 인용 3',
        when='현장 직원 인터뷰에서 나온 대표 발언 세 개를 인물 사진과 함께 놓고, 각 발언이 가리키는 과제를 칩으로 이어 줄 때',
        pv=[], sample=CUST['MD'], grp='과제 · 사진')
def _(b):
    s = header(b, EB_CH, '현장에서 들은 세 마디가 W 요양병원의 과제를 가리킵니다',
               '직원 인터뷰 [00]명 중 대표 발언 · 익명 · 요약 · 출처: [현장 인터뷰, 연도]', w=1152)
    rows = [('ph.md-staff-tab', '50% 45%', '간호팀 · 야간 근무', '간호사 · 근무 [00]년',
             '밤마다 병실을 돌며 온도를 손으로 맞춰요. 춥다고 하시면 또 가야 하고요', ['병실별 냉난방 원격 제어', '야간 순회 업무 부담'], '[00]명 중 [00]명이 같은 말'),
            ('r4.md-doctor-monitor', '70% 40%', '진료부 · 보호자 상담', '의사 · 근무 [00]년',
             '설명 자료가 종이라, 같은 설명을 보호자마다 하루에도 몇 번씩 되풀이합니다', ['보호자 안내 · 설명 자료', '진료 대기 정보 공유'], '[00]명 중 [00]명이 같은 말'),
            ('ph.svc-technician', '50% 30%', '시설팀 · 설비 관리', '시설 담당 · 근무 [00]년',
             '고장 나고 나서야 알아요. 어느 실외기가 문제인지 옥상에 올라가 봐야 하죠', ['설비 이상 사전 감지', '에너지 사용량 파악'], '[00]명 중 [00]명이 같은 말')]
    for i, (pid, pos, role, who, q, chips, cnt) in enumerate(rows):
        y = 152 + i * 170
        s += photo(b, pid, 64, y, 452, 156, pos=pos, hint=f'{role.split(" · ")[0]} 직원 사진 (역할 참고 이미지 · 동의받은 인물 사진으로 교체)', radius=14)
        s += tag_on(b, role, 76, y + 12)
        s += box(532, y, 684, 156, SOFT, 14)
        s += b.tb('“', ab(548, y + 8, 48, 64, f'font-family: Georgia, serif; font-size: 56px; font-weight: 800; line-height: 64px; color: {BLUE}'), 'div')
        s += (f'<div style="{ab(592, y + 18, 300, 124, "display: flex; flex-direction: column; gap: 8px")}">'
              + b.tb(q, f'font-size: 18px; font-weight: 800; line-height: 28px; {clamp(3)}')
              + b.tb(who, f'margin-top: auto; font-size: 12px; color: {MUTED}; white-space: nowrap') + '</div>')
        s += ARR(904, y + 68)
        s += (f'<div style="{ab(960, y + 16, 240, 124, "display: flex; flex-direction: column; gap: 6px")}">'
              + b.tb('가리키는 과제', f'font-size: 11.5px; font-weight: 800; color: {BLUE}; white-space: nowrap')
              + ''.join(b.tb(c, f'align-self: flex-start; height: 30px; box-sizing: border-box; padding: 0 12px; border-radius: 8px; background: #ffffff; border: 1.5px solid {BLUE if k == 0 else LINE}; color: {BLUE if k == 0 else INK}; font-size: 13.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap') for k, c in enumerate(chips))
              + b.tb(cnt, f'margin-top: auto; {NUM}; font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap') + '</div>')
    s += footer(b, DEAL['MD'] + ' · 발언은 익명 · 요약 · 인물 사진은 역할 참고 이미지 · ' + ph_src('MD'), 6)
    return s


# ---------------------------------------------------------------- 5 if nothing changes — now · 1y · 3y, photos fading to grey, loss growing
@layout(L, f='L_PH_CH_H', code='PH-CH-H', p='challenge', name='그대로 두면 · 지금 → 1년 → 3년 사진',
        when='과제를 그대로 둘 때 1년 · 3년 뒤 어떻게 되는지를 점점 흑백이 되는 같은 공간 사진과 커지는 누적 손실로 보여줘 시급함을 말할 때',
        pv=[], sample=CUST['FN'], grp='과제 · 사진')
def _(b):
    s = header(b, EB_CH, '그대로 두면, 3년 뒤 T 은행 영업점의 누적 손실은 [0]배가 됩니다',
               '현재 추세 유지 가정 · 누적 손실 = 대기 이탈 + 서식 처리 인력 + 종이 비용 · 출처: [영업점 운영 데이터, 연도]', w=1152)
    cols = [('ph.fn-branch', '50% 50%', '', '지금', '번호표 대기 [00]분 · 종이 서식', '[00]', 32, 0.22, FAINT, INK,
             '창구 상담 시간의 [00]%가 서식 작성 · 확인에 쓰입니다'),
            ('r4.fn-branch-hall', '0% 50%', 'grayscale(0.7) brightness(0.92)', '1년 후', '대기 이탈 고객 [00]% 늘어남', '[00]', 40, 0.5, '#d48a6c', WARN,
             '젊은 고객부터 비대면 채널 · 다른 은행으로 옮겨 갑니다'),
            ('ph.fn-branch-gray', '50% 50%', 'brightness(0.8) contrast(0.95)', '3년 후', '찾아오는 고객 자체가 줄어든 영업점', '[000]', 50, 1.0, WARN, WARN,
             '디지털 영업점과의 격차가 굳어 리뉴얼 비용이 더 커집니다')]
    for i, (pid, pos, filt, t, st, val, sz, fr, bc, vc, d) in enumerate(cols):
        x = 64 + i * 396
        s += fphoto(b, pid, x, 152, 360, 256, pos=pos, hint=f'{t} · 같은 영업점 공간 ({"흑백 처리" if i else "현재 모습"} — 고객 영업점 사진으로 교체)', radius=14, filt=filt)
        s += b.tb(t, ab(x + 12, 164, extra=f'border-radius: 999px; background: {BLUE if i == 0 else GLASS}; color: #ffffff; font-size: 13px; font-weight: 800; padding: 5px 13px; white-space: nowrap'), 'div')
        s += label_on(b, '그때 영업점은', st, x + 12, 342, 336, lines=1)
        if i < 2: s += ARR(x + 360, 268, w=36, size=22, color=WARN if i else BLUE)
        s += b.tb('누적 손실' if i else '지금 손실 · 연', ab(x, 424, 200, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
        s += f'<div style="{ab(x, 444, 360, 56, "display: flex; align-items: flex-end")}">' + bignum(b, val, '억 원', size=sz, color=vc, unit_size=16) + '</div>'
        s += rect(x, 510, 360, 8, SOFT, 4) + rect(x, 510, round(360 * fr), 8, bc, 4)
        s += b.tb(d, ab(x, 530, 360, 40, f'font-size: 13px; line-height: 20px; color: {BODY}; {clamp(2)}'), 'div')
    s += (f'<div style="{ab(64, 592, 1152, 56, f"box-sizing: border-box; border-radius: 12px; background: {BLUE}; padding: 0 22px; display: flex; align-items: center; gap: 16px")}">'
          + b.tb('지금 시작하면', f'font-size: 12px; font-weight: 800; letter-spacing: 0.04em; color: {LB}; flex-shrink: 0; white-space: nowrap')
          + b.tb('3년 누적 손실 [000]억 원 중 [00]%를 막을 수 있습니다 — 전자서식 · 대기 안내부터', 'font-size: 18px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</div>')
    s += footer(b, DEAL['FN'] + ' · 추세 유지 가정 · 산식 부록 p.[00] · 막대 길이는 예시 · ' + ph_src('FN') + ' (1년 · 3년 후는 흑백 처리)', 7)
    return s


# ---------------------------------------------------------------- 6 challenge table — photo | symptom | cause | impact | solved?
@layout(L, f='L_PH_CH_I', code='PH-CH-I', p='challenge', name='과제 4행 표 · 행마다 현장 사진',
        when='과제 네 개를 현장 사진 · 현상 · 원인 · 영향 수치 · 이번 제안이 푸는지까지 한 표로 정리해, 제안 범위를 솔직하게 보여줄 때',
        pv=[], sample=CUST['ED'], grp='과제 · 사진')
def _(b):
    s = header(b, EB_CH, 'E 대학교 캠퍼스 과제 넷, 이번 제안은 그중 셋을 풉니다',
               '현장 점검 · 학생 설문 [0,000]명 · 출처: [학내 설문 · 시설 데이터, 연도]', w=1152)
    C = [(64, 320, '현장'), (404, 236, '현상'), (660, 236, '원인'), (916, 136, '영향'), (1072, 144, '이번 제안')]
    for x, w, t in C:
        s += b.tb(t, ab(x, 152, w, 18, f'font-size: 12px; font-weight: 800; color: {BLUE if t == "이번 제안" else MUTED}; white-space: nowrap'), 'div')
    s += rect(64, 176, 1152, 1.5, INK)
    rows = [('ph.ed-lab-night', '50% 55%', 'PC 실습실', '수업이 끝나도 PC · 냉난방이 켜져 있습니다', '실습실마다 사람이 직접 끄고, 켜진 곳을 확인할 화면이 없음',
             '[000]만 원', '연간 대기 전력 · 공조', 'yes', '원격 전원 · 공조 스케줄'),
            ('fill.class_room', '50% 45%', '강의실', '판서 · 수업 자료가 수업 뒤 사라집니다', '화이트보드 · 노후 프로젝터라 저장 · 공유가 안 됨',
             '[00]%', '자료를 다시 요청한 학생', 'yes', '전자칠판 · 화면 공유'),
            ('ph.ed-print-users', '50% 40%', '출력 공간', '시험 기간마다 출력 대기 줄이 깁니다', '복합기 [0]대에 결제 수단이 제각각',
             '[00]분', '피크 평균 대기', 'part', '무인 출력 · 학생증 결제'),
            ('ph.ed-library', '50% 50%', '도서관', '공지 · 좌석 정보가 여러 곳에 흩어져 있습니다', '게시판 · 홈페이지 · 앱을 부서마다 따로 운영',
             '[0]곳', '공지 채널 수', 'no', '학내 정보 운영 과제')]
    for i, (pid, pos, sp, sym, cause, v, vl, st, how) in enumerate(rows):
        y = 186 + i * 116
        vv, vu = v.split(']')[0] + ']', v.split(']')[1]
        COL = 'display: flex; flex-direction: column; justify-content: center'
        s += photo(b, pid, 64, y, 320, 104, pos=pos, hint=f'{sp} 현장 사진 (고객 캠퍼스로 교체)', radius=10)
        s += tag_on(b, sp, 74, y + 8, size=11.5)
        s += f'<div style="{ab(404, y, 236, 104, COL)}">' + b.tb(sym, f'font-size: 15px; font-weight: 800; line-height: 23px; {clamp(2)}') + '</div>'
        s += f'<div style="{ab(660, y, 236, 104, COL)}">' + b.tb(cause, f'font-size: 13px; line-height: 20px; color: {BODY}; {clamp(3)}') + '</div>'
        s += (f'<div style="{ab(916, y, 136, 104, COL + "; gap: 0")}">' + bign(b, vv, vu.strip(), size=26, color=INK if st == 'no' else BLUE, unit_size=14)
              + b.tb(vl, f'font-size: 11.5px; line-height: 16px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        lab, bg, fc = {'yes': ('풉니다', BLUE, '#ffffff'), 'part': ('일부 · 2단계', CHIP, BLUE), 'no': ('범위 밖', SOFT, MUTED)}[st]
        s += (f'<div style="{ab(1072, y, 144, 104, COL + "; gap: 6px")}">'
              + b.tb(lab, f'align-self: flex-start; height: 26px; padding: 0 12px; border-radius: 999px; background: {bg}; color: {fc}; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap; {"border: 1px solid " + LINE if st == "no" else ""}')
              + b.tb(how, f'font-size: 11.5px; font-weight: 700; color: {MUTED if st == "no" else BODY}; white-space: nowrap') + '</div>')
        if i < 3: s += rect(404, y + 110, 812, 1, LINE)
    s += footer(b, DEAL['ED'] + ' · ‘범위 밖’은 고객 운영 과제로 따로 제안 · ' + ph_src('ED'), 8)
    return s


# ---------------------------------------------------------------- 7 the challenge in three numbers — full-bleed dark hotel photo + glass KPI cards
@layout(L, f='L_PH_CH_J', code='PH-CH-J', p='challenge', name='숫자로 보는 과제 · 풀블리드 호텔 사진',
        when='과제를 큰 숫자 셋으로 짧고 강하게 말하고 싶을 때 — 어두운 현장 사진을 장 전체에 깔고 유리 카드 셋과 한 줄 결론',
        pv=[], sample=CUST['HT'], grp='과제 · 사진')
def _(b):
    s = photo(b, 'ph.ht-entrance', 0, 0, 1280, 720, pos='50% 55%', hint='고객 호텔 야간 외관 · 로비 사진 (어두운 사진 권장)', radius=0)
    s += f'<div style="{ab(0, 0, 1280, 720, "background: linear-gradient(180deg, rgba(8,11,20,0.86) 0%, rgba(8,11,20,0.45) 34%, rgba(8,11,20,0.40) 58%, rgba(8,11,20,0.90) 100%)")}"></div>'
    s += header(b, EB_CH, 'B 호텔의 과제, 숫자 셋이면 충분합니다', '최근 1년 투숙객 리뷰 · 운영 데이터 · 출처: [리뷰 플랫폼 · 호텔 PMS, 연도]', w=1152, dark=True)
    cards = [('로비 · 체크인', '[00]', '분', '피크 시간 평균 체크인 대기', '리뷰 불만 1위 · 출처: [PMS 로그, 연도]'),
             ('객실', '[00]', '%', '객실 민원 중 냉난방 · 소음 비율', '야간 민원의 대부분 · 출처: [민원 기록, 연도]'),
             ('프런트 문의', '[000]', '건', '하루 문의 · 그중 [00]%가 같은 질문', '조식 · 체크아웃 · 와이파이 · 출처: [프런트 기록, 연도]')]
    for i, (lab, v, u, d, src) in enumerate(cards):
        x = 64 + i * 392
        s += glass(b.tb(lab, f'font-size: 13px; font-weight: 800; color: {LB}; white-space: nowrap')
                   + bign(b, v, u, size=68, color='#ffffff', unit_size=26)
                   + b.tb(d, 'font-size: 16px; font-weight: 800; line-height: 24px; color: #ffffff; white-space: nowrap')
                   + f'<span style="height: 1px; background: rgba(255,255,255,0.22); margin: 6px 0 4px"></span>'
                   + b.tb(src, f'font-size: 12px; line-height: 18px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
                   x, 280, 368, 232, pad='18px 22px', gap=6, extra='justify-content: center')
    s += glass(f'<span style="display: flex; align-items: center; gap: 16px">'
               + b.tb('한 줄 결론', f'font-size: 12px; font-weight: 800; letter-spacing: 0.04em; color: {LB}; flex-shrink: 0; white-space: nowrap')
               + b.tb('세 숫자 모두 ‘투숙객이 필요한 정보를 제때 못 받는 순간’에서 생깁니다', 'font-size: 19px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</span>',
               64, 532, 1152, 64, pad='0 22px', extra='justify-content: center')
    s += footer(b, DEAL['HT'] + ' · 수치는 자리표시 · ' + ph_src('HT'), 6, dark=True)
    return s


# ---------------------------------------------------------------- 8 different people, different problems — role photos × rows (challenge · workaround · want)
@layout(L, f='L_PH_CH_K', code='PH-CH-K', p='challenge', p2='user', name='사람마다 다른 과제 · 역할 사진 3열',
        when='본사 · 점주 · 손님처럼 역할마다 과제가 다를 때, 역할 사진 아래 과제 둘 · 지금의 임시방편 · 원하는 것을 같은 행으로 맞대어 볼 때',
        pv=[], sample=CUST['SV'], grp='과제 · 사진')
def _(b):
    s = header(b, EB_CH, '같은 무인 매장, 본사 · 점주 · 손님의 과제는 다릅니다',
               '역할별 인터뷰 · 매장 관찰 · 출처: [현장 인터뷰, 연도] · 사진은 역할 참고 이미지', w=1152)
    cols = [('ph.oe-team-tabs', '50% 50%', '본사 운영팀', '매장 [000]곳 관리',
             ['매장 상태를 한눈에 못 봅니다', '고장 · 민원을 점주 전화로 처음 압니다'], '지역 담당자가 주 [1]회 매장을 돌며 사진으로 보고', '전 매장 기기 상태 · 매출을 한 화면에'),
            ('ph.sv-study-tab', '75% 50%', '점주', '1–3개 매장 운영',
             ['새벽 고장에도 매장에 직접 가야 합니다', '용지 · 소모품이 떨어진 걸 늦게 압니다'], 'CCTV 앱으로 수시 확인 · 단골 손님 문자에 의존', '고장 · 소모품 알림이 먼저 휴대폰으로'),
            ('r4.sv-cvs-print', '60% 40%', '손님', '하루 [000]명 방문',
             ['결제 · 출력 방법을 몰라 헤맵니다', '기기가 멈추면 물어볼 사람이 없습니다'], '벽에 붙은 안내문 · 점주 전화번호로 연락', '화면이 단계별로 안내하고 바로 도움 요청')]
    RL = [('과제 둘', 380, BLUE), ('지금 버티는 법', 470, WARN), ('원하는 것', 578, BLUE)]
    for t, y, c in RL:
        s += b.tb(t, ab(64, y + 4, 112, 20, f'font-size: 13px; font-weight: 800; color: {c}; white-space: nowrap'), 'div')
    s += rect(64, 446, 1152, 1, LINE) + rect(64, 552, 1152, 1, LINE)
    for i, (pid, pos, role, sub, ch, tmp, want) in enumerate(cols):
        x = 188 + i * 350; w = 328
        s += photo(b, pid, x, 152, w, 216, pos=pos, hint=f'{role} 장면 사진 (역할 참고 이미지)', radius=14)
        s += label_on(b, sub, role, x + 10, 152 + 216 - 62, 180, lines=1)
        s += (f'<div style="{ab(x, 380, w, 60, "display: flex; flex-direction: column; gap: 6px")}">'
              + ''.join(f'<span style="display: flex; gap: 8px; align-items: flex-start">{numtag(b, str(k + 1), 20)}' + b.tb(c, f'font-size: 14.5px; font-weight: 800; line-height: 22px; {clamp(1)}') + '</span>' for k, c in enumerate(ch))
              + '</div>')
        s += card(b.tb(tmp, f'font-size: 13px; line-height: 20px; color: {BODY}; {clamp(2)}'), x, 458, w, 84, bg=WARNBG, pad='12px 14px', gap=0, radius=10, extra='justify-content: center')
        s += card(b.tb(want, f'font-size: 14.5px; font-weight: 800; line-height: 22px; color: {BLUE}; {clamp(2)}'), x, 564, w, 84, bg=CHIP, pad='12px 14px', gap=0, radius=10, extra='justify-content: center')
    s += footer(b, DEAL['SV'] + ' · 인물 사진은 역할 참고 이미지 · ' + ph_src('SV'), 7)
    return s


# ---------------------------------------------------------------- 9 user mix + needs — donut + a scene photo per visitor type (L_US_C 사진 버전)
@layout(L, f='L_PH_US_E', code='PH-US-E', p='user', name='사용자 구성 + 니즈 · 유형별 장면 사진',
        when='방문객 구성 비율 데이터가 있을 때, 유형별 비율 도넛과 함께 유형마다 손님 장면 사진 · 방문 시간 · 니즈 · 화면이 할 일을 보여줄 때',
        pv=['L_US_C'], sample=CUST['FB'], grp='이해 · 사진')
def _(b):
    s = header(b, EB_US, '방문객의 [00]%는 출근길 테이크아웃 손님입니다',
               '손님 유형 넷 · 하루 방문 [000]명 매장 평균 · 출처: [POS · 매장 관찰 데이터, 연도]', w=1152)
    CL = [BLUE, '#6f7fd6', '#b7c0ee', '#dfe3ea']
    # donut (conic-gradient div) — example split
    D, DX, DY = 236, 86, 166
    s += f'<div style="{ab(DX, DY, D, D, f"border-radius: 50%; background: conic-gradient({CL[0]} 0 45%, {CL[1]} 45% 72%, {CL[2]} 72% 89%, {CL[3]} 89% 100%)")}"></div>'
    s += f'<div style="{ab(DX + 46, DY + 46, D - 92, D - 92, "border-radius: 50%; background: #ffffff")}"></div>'
    s += (f'<div style="{ab(DX + 46, DY + 46, D - 92, D - 92, "display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0")}">'
          + b.tb('하루 방문', f'font-size: 12px; font-weight: 700; color: {MUTED}; white-space: nowrap')
          + bign(b, '[000]', '명', size=30, color=BLUE, unit_size=15)
          + b.tb('매장 평균', f'font-size: 11px; color: {FAINT}; white-space: nowrap') + '</div>')
    types = [('ph.fb-pickup', '62% 50%', '출근길 테이크아웃', '07–09시', '줄 서지 않고 빨리 받아 가기', '주문 전 메뉴 확정 · 픽업 호출로 바로 수령'),
             ('ph.fb-pos-pay', '55% 40%', '점심 직장인', '11–13시', '짧은 점심시간 안에 세트 고르기', '점심 세트 · 할인을 첫 화면에'),
             ('r4.fb-bakery-hall', '30% 60%', '오후 체류 고객', '14–17시', '디저트 · 신메뉴를 천천히 둘러보기', '시즌 디저트를 큰 이미지로 추천'),
             ('ph.fb-tablet-menu', '35% 45%', '저녁 · 주말 가족', '18시 이후 · 주말', '아이와 함께 쉽게 고르기', '가족 세트 · 키즈 메뉴를 한 화면에')]
    s += f'<div style="{ab(64, 444, 280, 136, "display: flex; flex-direction: column; gap: 0")}">'
    for k, (_p, _q, nm, *_r) in enumerate(types):
        s += (f'<span style="display: flex; align-items: center; gap: 10px; height: 34px; border-bottom: 1px solid {LINE}">'
              + f'<i style="width: 12px; height: 12px; border-radius: 3px; background: {CL[k]}; flex-shrink: 0"></i>'
              + b.tb(nm, f'font-size: 13.5px; font-weight: {800 if k == 0 else 600}; white-space: nowrap; flex: 1')
              + b.tb('[00]%', f'{NUM}; font-size: 14px; font-weight: 800; color: {BLUE if k == 0 else INK}; white-space: nowrap') + '</span>')
    s += '</div>'
    s += b.tb('비율은 예시 · 데이터 연결 시 자동 반영', ab(64, 628, 280, 18, f'font-size: 11.5px; color: {FAINT}; white-space: nowrap'), 'div')
    for i, (pid, pos, nm, tm, need, todo) in enumerate(types):
        x = 368 + i * 216; w = 200
        s += photo(b, pid, x, 152, w, 270, pos=pos, hint=f'{nm} 손님 장면 사진 (고객 매장으로 교체)', radius=14)
        if i == 0: s += f'<div style="{ab(x, 152, w, 270, f"box-sizing: border-box; border-radius: 14px; border: 3px solid {BLUE}")}"></div>'
        s += tag_on(b, tm, x + 10, 162, size=11.5)
        s += (f'<div style="{ab(x, 436, w, 212, "display: flex; flex-direction: column; gap: 4px")}">'
              + '<span style="display: flex; align-items: center; gap: 8px">' + f'<i style="width: 12px; height: 12px; border-radius: 3px; background: {CL[i]}; flex-shrink: 0"></i>'
              + b.tb(nm, 'font-size: 15.5px; font-weight: 800; line-height: 22px; white-space: nowrap') + '</span>'
              + b.tb('[00]%', f'{NUM}; font-size: 24px; font-weight: 800; line-height: 32px; color: {BLUE if i == 0 else INK}; white-space: nowrap')
              + b.tb('핵심 니즈', f'margin-top: 4px; font-size: 11px; font-weight: 800; color: {MUTED}; white-space: nowrap')
              + b.tb(need, f'font-size: 13px; line-height: 19px; color: {BODY}; {clamp(2)}')
              + f'<span style="height: 1px; background: {LINE}; margin: 6px 0 4px"></span>'
              + b.tb('화면이 할 일', f'font-size: 11px; font-weight: 800; color: {BLUE}; white-space: nowrap')
              + b.tb(todo, f'font-size: 13.5px; font-weight: 800; line-height: 20px; color: {BLUE}; {clamp(2)}') + '</div>')
    s += footer(b, DEAL['FB'] + ' · 비율 · 시간대는 예시 · ' + ph_src('FB'), 7)
    return s


# ---------------------------------------------------------------- 10 stakeholder map — influence × interest 2×2 with round portraits
@layout(L, f='L_PH_US_F', code='PH-US-F', p='user', name='이해관계자 맵 · 영향력 × 관심도 인물 사진',
        when='공공 · 대형 사업처럼 결정에 관여하는 사람이 많을 때, 영향력 × 관심도 2×2에 인물 · 현장 원형 사진을 놓고 사분면별 대응 방식을 정할 때',
        pv=[], sample=CUST['PB'], grp='이해 · 사진')
def _(b):
    s = header(b, EB_US, 'S 지자체 사업의 이해관계자, 네 가지 방식으로 만납니다',
               '영향력 × 관심도 · 사업 착수 전 인터뷰 · 위치는 예시 · 출처: [이해관계자 인터뷰, 연도]', w=1152)
    MX, MY, QW, QH, G = 64, 152, 366, 228, 8
    quads = [  # (col, row, axis, strategy, key?, people)
        (0, 0, '영향력 높음 · 관심 낮음', '만족 유지', False,
         [('r4.of-boardroom', '50% 50%', '시의회 · 예산 부서', '분기 성과 보고 · 예산 근거 미리 공유'),
          ('ph.of-desk-control', '60% 60%', '정보보안 담당', '보안 인증 · 망 분리 자료 먼저 제출')]),
        (1, 0, '영향력 높음 · 관심 높음', '핵심 관리', True,
         [('r4.pb-traffic-ctl', '85% 55%', '교통정책과 주무관', '주 1회 정례 보고 · 설계를 함께 결정'),
          ('r4.vn-race-control', '80% 50%', '상황실 운영 업체', '운영 화면 · 교대 업무를 같이 설계')]),
        (0, 1, '영향력 낮음 · 관심 낮음', '지켜보기', False,
         [('ph.pb-ranger', '45% 40%', '유관 기관 · 구조대', '연계가 필요할 때 협의 · 월 1회 소식 공유')]),
        (1, 1, '영향력 낮음 · 관심 높음', '정보 공유', False,
         [('ph.oe-phone-user', '35% 40%', '시민 · 이용자', '시범 운영 · 설문으로 의견 받기'),
          ('ph.pb-ranger-watch', '65% 40%', '현장 근무자', '현장 교육 · 단말 사용 안내')])]
    for c, r, ax, stg, key, ppl in quads:
        x = MX + c * (QW + G); y = MY + r * (QH + G)
        s += box(x, y, QW, QH, CHIP if key else SOFT, 14, f'border: 1.5px solid {BLUE}' if key else '')
        s += (f'<span style="{ab(x + 16, y + 12, QW - 32, 22, "display: flex; align-items: baseline; gap: 10px")}">'
              + b.tb(stg, f'font-size: 16px; font-weight: 800; line-height: 22px; color: {BLUE if key else INK}; white-space: nowrap')
              + b.tb(ax, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap') + '</span>')
        n = len(ppl); cw = (QW - 16) // 2
        for k, (pid, pos, nm, act) in enumerate(ppl):
            cx = x + 8 + (cw * k if n == 2 else (QW - 16 - cw) // 2)
            s += photo(b, pid, cx + (cw - 108) // 2, y + 42, 108, 108, pos=pos, hint=f'{nm} 인물 · 현장 사진', radius=54)
            s += (f'<div style="{ab(cx + 6, y + 156, cw - 12, 64, "display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center")}">'
                  + b.tb(nm, f'font-size: 14px; font-weight: 800; line-height: 20px; white-space: nowrap')
                  + b.tb(act, f'font-size: 12px; line-height: 18px; color: {BODY}; {clamp(2)}') + '</div>')
    # axes
    s += b.tb('관심도 낮음', ab(MX, 626, 200, 18, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap'), 'div')
    s += rect(MX + 90, 635, 2 * QW + G - 220, 1.5, FAINT)
    s += b.tb('관심도 높음 →', ab(MX + 2 * QW + G - 120, 626, 120, 18, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; text-align: right; white-space: nowrap'), 'div')
    # right — who to meet first
    RX, RW = 828, 388
    s += photo(b, 'ph.pb-traffic-room', RX, 152, RW, 240, pos='50% 50%', hint='핵심 관리 대상의 현장 (고객 상황실 · 사업 현장으로 교체)', radius=14)
    s += tag_on(b, '핵심 관리 · 먼저 만날 곳', RX + 12, 164)
    s += (f'<div style="{ab(RX, 408, RW, 240, "display: flex; flex-direction: column; gap: 10px")}">'
          + b.tb('교통정책과 · 상황실 운영 업체', 'font-size: 17px; font-weight: 800; line-height: 24px; white-space: nowrap')
          + ''.join(f'<span style="display: flex; gap: 10px; align-items: center; height: 38px; box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 12px">'
                    + numtag(b, str(k + 1), 22) + b.tb(w, f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap; width: 64px; flex-shrink: 0')
                    + b.tb(t, 'font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
                    for k, (w, t) in enumerate([('착수 1주', '요구사항 인터뷰 · 결정 라인 확인'), ('격주', '설계 검토 회의 · 화면 시안 공유'),
                                                ('시범 운영', '상황실 화면을 함께 점검'), ('매 분기', '시의회 보고 자료 같이 준비')]))
          + '</div>')
    s += footer(b, DEAL['PB'] + ' · 위치 · 대응 주기는 예시 · 인물 사진은 역할 참고 이미지 · ' + ph_src('PB'), 8)
    return s
