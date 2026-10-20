# 6차 — 고객 요구 이해(requirements) · 사용자 이해(user) 사진 레이아웃 10장
from gen_r5 import *
L = []

EB_RQ = '00 · 요구사항 대응'
EB_US = '01 · 사용자 이해'
G_RQ, G_US = '요구 · 사진', '이해 · 사진'

# 충족 수준 알약 (원본 대응표와 같은 색: 충족 파랑 · 부분 연파랑 · 대안 흰 바탕 테두리)
_ST = {'충족': (BLUE, '#ffffff', None), '부분': ('#b8c3ef', INK, None), '대안': ('#ffffff', INK, INK),
       '강': (BLUE, '#ffffff', None), '보통': ('#e2e5ea', BODY, None), '보완': ('#ffffff', INK, INK)}


def st(b, k, size=11.5, h=22):
    bg, c, bd = _ST[k]
    return b.tb(k, f'align-self: center; flex-shrink: 0; box-sizing: border-box; height: {h}px; padding: 0 9px; border-radius: 999px; background: {bg}; color: {c}; '
                   f'{"border: 1px solid " + bd + "; " if bd else ""}font-size: {size}px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')


def at(pid, x, y, w, h, px, py, pos=(50, 50)):
    """사진 속 위치(원본 가로 · 세로 %)를 cover 로 잘린 칸 위 좌표로"""
    nw, nh = native(pid)
    k = max(w / nw, h / nh); iw, ih = nw * k, nh * k
    return round(x + (w - iw) * pos[0] / 100 + iw * px / 100), round(y + (h - ih) * pos[1] / 100 + ih * py / 100)


def ui(b, pid, x, y, w, h, hint, radius=10, pad=6):
    """솔루션 화면 썸네일 — 잘리지 않게 contain"""
    return b.img(pid, ab(x, y, w, h), fit='contain', kind='ui', hint=hint, radius=radius, pad=pad, bg=SOFT)


def row(inner, x, y, w, h, gap=8, extra=''):
    return f'<div style="{ab(x, y, w, h, f"display: flex; align-items: center; gap: {gap}px; {extra}")}">{inner}</div>'


# ================================================================ 1 요구사항 대응 · 분야별 사진 (L_RM_B 사진판)
@layout(L, f='L_PH_RQ_A', code='PH-RQ-A', p='requirements', p2=None, name='요구사항 대응 · 분야별 사진 5',
        when='RFP 요구가 많아 표 한 장으로는 안 읽힐 때, 분야별로 묶어 충족 현황과 대표 요구만 사진과 함께 보일 때',
        pv=['L_RM_B'], sample=CUST['PB'], grp=G_RQ)
def _(b):
    s = header(b, EB_RQ, '요구사항 28개, 빠짐없이 대응합니다', '다섯 분야로 묶어 본 대응 현황 · 분야마다 대표 요구 2개 · 전체 대응표는 부록 p.[00]', w=1152)
    cols = [('ph.pb-control', '50% 50%', '기능', '상황실 화면 · 안내 기능을 바꿀 공간',
             [('SFR-001 · 필수', '상황실 화면 통합 표출', '비디오월 + 통합 관제 SW', '충족'), ('SFR-004 · 필수', '긴급 재난 문자 즉시 표출', '관제에서 전 사이니지 긴급 모드', '충족')]),
            ('r4.pb-highway-ctl', '50% 50%', '성능', '24시간 운영되는 관제 환경',
             [('PER-001 · 필수', '화면 전환 [0]초 이내', '로컬 캐시 재생', '충족'), ('PER-002 · 필수', '24시간 365일 운영', '상업용 24/7 모델', '충족')]),
            ('fill.vxt_control', '50% 50%', '보안', '관리자 접근 · 보안 설정 화면',
             [('SER-001 · 필수', '관리자 접근 기록', '접근 로그 · 감사 보고', '부분'), ('SER-002 · 필수', '내부망 분리 운영', '내부 서버형 구성', '충족')]),
            ('ph.ad-street-night', '50% 55%', '인프라', '옥외 설치 환경 (설치 예정지 사진으로 교체)',
             [('INF-001 · 선택', '옥외 IP 등급', '옥외 모델 IP[00]', '충족'), ('INF-002 · 필수', '설치 위치 전원 · 통신', '실사 후 배선 설계', '충족')]),
            ('fill.engineers', '50% 40%', '유지보수', '장애 출동 · 정기 점검 엔지니어',
             [('MNT-001 · 필수', '장애 [0]시간 내 복구', '원격 조치 + 현장 출동', '부분'), ('MNT-002 · 필수', '정기 점검 [월 1]회', '점검 캘린더 · 결과 보고', '충족')])]
    W, G = 216, 18
    for i, (pid, pos, cat, hint, reps) in enumerate(cols):
        x = 64 + i * (W + G)
        s += photo(b, pid, x, 152, W, 248, pos=pos, hint=hint + ' (고객 현장 사진으로 교체)', radius=12)
        s += tag_on(b, f'{cat} · [00]개', x + 10, 162)
        stats = ''.join('<span style="display: flex; flex-direction: column; gap: 0; min-width: 0">'
                        + b.tb(k, f'font-size: 10.5px; font-weight: 700; color: {LT}; white-space: nowrap')
                        + b.tb(v, f'{NUM}; font-size: 16px; font-weight: 800; line-height: 22px; color: {c}; white-space: nowrap') + '</span>'
                        for k, v, c in [('충족', '[0]', '#ffffff'), ('부분', '[0]', LB), ('대안', '[0]', LT)])
        s += glass(f'<span style="display: flex; justify-content: space-between; gap: 6px">{stats}</span>', x + 8, 400 - 8 - 54, W - 16, 54, pad='6px 14px')
        inner = ''
        for j, (rid, req, ans, lv) in enumerate(reps):
            if j: inner += f'<span style="height: 1px; background: {LINE}; margin: 4px 0"></span>'
            inner += ('<span style="display: flex; align-items: center; justify-content: space-between; gap: 6px">'
                      + b.tb(rid, f'{NUM}; font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap') + st(b, lv, size=10.5, h=18) + '</span>'
                      + b.tb(req, 'font-size: 14px; font-weight: 800; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                      + b.tb('→ ' + ans, f'font-size: 12px; line-height: 18px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'))
        s += card(inner, x, 412, W, 160, pad='12px 14px', gap=2)
    # 28개 중 충족 막대
    s += box(64, 588, 1152, 60, CHIP, 12)
    s += b.tb('28개 중', ab(84, 606, 64, 24, f'font-size: 14px; font-weight: 800; line-height: 24px; white-space: nowrap'), 'div')
    BX, BW = 150, 520
    for x0, w, c, extra in [(0, 400, BLUE, ''), (404, 76, '#b8c3ef', ''), (484, 36, '#ffffff', f'border: 1.5px solid {INK}; box-sizing: border-box')]:
        s += rect(BX + x0, 610, w, 16, c, 4, extra)
    s += row(st(b, '충족') + b.tb('[00]', f'{NUM}; font-size: 15px; font-weight: 800; color: {BLUE}')
             + st(b, '부분') + b.tb('[0]', f'{NUM}; font-size: 15px; font-weight: 800; color: {INK}')
             + st(b, '대안') + b.tb('[0]', f'{NUM}; font-size: 15px; font-weight: 800; color: {INK}'), 690, 606, 300, 24, gap=7)
    s += f'<div style="{ab(990, 606, 210, 24, "display: flex; align-items: center; justify-content: flex-end")}">' + evid(b, '전체 28개 대응표 · 부록 p.[00]') + '</div>'
    s += footer(b, 'S 지자체 · 통합 안내 · 관제 고도화 사업 제안 · RFP 요구사항 28개 기준 · 막대 길이는 예시 · 사진: samsung.com 공공 · 교통 도입사례 · 비즈니스 페이지', 7)
    return s


# ================================================================ 2 평가 항목 · 배점 · 사진 (L_RM_C 사진판)
@layout(L, f='L_PH_RQ_B', code='PH-RQ-B', p='requirements', p2=None, name='평가 항목 · 배점 비례 사진 타일',
        when='RFP 평가표가 있을 때, 배점이 큰 항목부터 사진 타일로 키워 우리 근거가 있는 쪽을 짚어 줄 때',
        pv=['L_RM_C'], sample=CUST['ED'], grp=G_RQ)
def _(b):
    s = header(b, '00 · 평가 기준 대응', '평가 항목마다, 근거가 있는 쪽을 짚었습니다', '기술 80점 · 가격 20점(별도 가격 제안서) · 배점이 큰 항목일수록 크게', w=1152)
    items = [('사업 이해도', 10), ('시스템 구성', 20), ('성능 · 품질', 15), ('운영 · 유지보수', 15), ('일정 · 관리', 10), ('수행 실적', 10), ('가격', 20)]
    # 배점 100 막대
    s += b.tb('기술 80점', ab(64, 150, 300, 18, f'font-size: 12px; font-weight: 800; line-height: 18px; color: {BLUE}; white-space: nowrap'), 'div')
    s += b.tb('가격 20점', ab(64 + 1152 * 0.8 + 4, 150, 200, 18, f'font-size: 12px; font-weight: 800; line-height: 18px; color: {MUTED}; white-space: nowrap'), 'div')
    cum = 0
    for nm, pt in items:
        x0 = 64 + round(1152 * cum / 100); x1 = 64 + round(1152 * (cum + pt) / 100) - 4; cum += pt
        if nm == '가격':
            bg, c, extra = '#f5f6f8', MUTED, f'border: 1.5px dashed #b8bec8; '
        else:
            bg, c, extra = {20: (BLUE, '#ffffff', ''), 15: ('#5b6fd0', '#ffffff', ''), 10: ('#c3ccf2', INK, '')}[pt]
        s += (f'<div style="{ab(x0, 172, x1 - x0, 30, f"box-sizing: border-box; border-radius: 6px; background: {bg}; {extra}display: flex; align-items: center; justify-content: center; gap: 5px; padding: 0 6px")}">'
              + b.tb(nm, f'font-size: 11.5px; font-weight: 800; color: {c}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(str(pt), f'{NUM}; font-size: 12px; font-weight: 800; color: {c}; white-space: nowrap') + '</div>')
    # 큰 배점 4개 · 사진 타일 (폭 = 배점 비례)
    tiles = [('r4.ed-main-hall', '50% 50%', '사업 이해도', 10, '요구 · 현황을 정확히 이해했는가', '요구 대응표 28개 · 현장 조사', '강', '캠퍼스 현장 조사 사진'),
             ('ph.ed-lecture-led', '50% 50%', '시스템 구성', 20, '구성이 요구를 충족하는가', '강의실 · 도서관 · 기숙사 구성', '강', '강의실 구성 장면'),
             ('ph.ed-library-wall', '35% 50%', '성능 · 품질', 15, '운영 안정성 · 품질 근거', '24/7 모델 · 인증 현황', '보통', '24시간 켜 두는 도서관 화면'),
             ('r4.ed-ac-check', '50% 30%', '운영 · 유지보수', 15, '장애 대응 · 점검 체계', 'SLA · 점검 캘린더', '강', '정기 점검 장면')]
    x = 64
    for pid, pos, nm, pt, look, ev, chk, hint in tiles:
        w = round(1104 * pt / 60)
        s += photo(b, pid, x, 216, w, 216, pos=pos, hint=hint + ' (고객 캠퍼스 사진으로 교체)', radius=12)
        s += tag_on(b, f'{nm} · {pt}점', x + 10, 226)
        s += label_on(b, '평가위원이 보는 것', look, x + 8, 432 - 8 - (82 if w < 200 else 62), w - 16, lines=2)
        s += card(b.tb(ev, f'font-size: 14px; font-weight: 800; line-height: 20px; {clamp(2)}')
                  + '<span style="margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 6px">'
                  + evid(b, '우리의 근거 · p.[00]') + st(b, chk) + '</span>', x, 440, w, 92, pad='10px 12px', gap=4)
        x += w + 16
    # 작은 배점 3개
    small = [('일정 · 관리', '10', '방학 내 구축 가능성', '방학 집중 시공 일정 · p.[00]', '보통', 280, SOFT, None),
             ('수행 실적', '10', '유사 레퍼런스', '교육 기관 사례 [0]건 · 보완 계획 p.[00]', '보완', 280, SOFT, None),
             ('가격', '20', '가격 점수', '별도 가격 제안서로 제출 — 기술 평가와 따로 봅니다', None, 560, '#ffffff', '#b8bec8')]
    x = 64
    for nm, pt, look, ev, chk, w, bg, bd in small:
        c = MUTED if nm == '가격' else BLUE
        s += (f'<div style="{ab(x, 548, w, 100, f"box-sizing: border-box; border-radius: 12px; background: {bg}; " + (f"border: 1.5px dashed {bd}; " if bd else "") + "padding: 10px 16px; display: flex; flex-direction: column; gap: 3px")}">'
              + '<span style="display: flex; align-items: center; gap: 10px">' + bignum(b, pt, '점', size=26, color=c, unit_size=13)
              + b.tb(nm, f'flex-grow: 1; font-size: 15px; font-weight: 800; line-height: 22px; color: {INK if nm != "가격" else MUTED}; white-space: nowrap')
              + (st(b, chk) if chk else '') + '</span>'
              + b.tb('평가위원 · ' + look, f'font-size: 12px; line-height: 18px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(ev, f'font-size: 13px; font-weight: 700; line-height: 19px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        x += w + 16
    s += footer(b, 'E 대학교 · 스마트 캠퍼스 구축 제안 · 평가 배점은 RFP p.[00] 기준 · 타일 폭은 배점 비례 · 사진: samsung.com 교육 도입사례 · 비즈니스 페이지', 8)
    return s


# ================================================================ 3 키맨별 요구 · 인물 사진 4
@layout(L, f='L_PH_RQ_C', code='PH-RQ-C', p='requirements', p2='user', name='키맨별 요구 · 인물 사진 4',
        when='결정에 관여하는 사람이 여럿일 때, 각자의 관심사 · 걱정과 우리의 답을 영향력과 함께 한 줄로 맞춰 볼 때',
        pv=[], sample=CUST['FN'], grp=G_RQ)
def _(b):
    s = header(b, EB_RQ, 'T 은행의 네 사람, 같은 사업을 다르게 봅니다', '키맨별 관심사 · 걱정과 우리의 답 · 인터뷰 [0]회 · 제안 설명회 질의 기반 · 사진은 역할 참고 이미지', w=1152)
    people = [('fill.meet_video', '30% 50%', '최종 결정', '행장', 5, '디지털 영업점이라는 상징', '투자 효과를 증명할 수 있나', '[00]개 점 시범 도입 → 분기마다 효과 지표 보고', '효과 지표 p.[00]'),
              ('ph.fn-counter', '25% 50%', '현장 운영', '영업점장', 4, '창구 대기 · 상담 시간 단축', '직원이 새 기기를 익히는 동안의 혼란', '전자서식 태블릿 · 지점별 교육', '교육 계획 p.[00]'),
              ('ph.of-desk-control', '50% 72%', '기술 검토', 'IT 부서장', 4, '내부망 · 단말 보안 기준 충족', '[000]대 단말 관리와 장애 대응 부담', 'Knox Manage 일괄 관리 · 분실 시 원격 잠금', '보안 구성 p.[00]'),
              ('fill.bank_esign', '50% 50%', '계약 · 조건', '구매 담당', 3, '5년 총비용과 납기 확정', '계약 뒤 단가 · 유지보수 조건 변경', '5년 총비용 고정 · 납기 [00]주 보장', '가격 조건 p.[00]')]
    # 왼쪽 행 이름
    s += b.tb('키맨', ab(64, 156, 76, 22, f'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap'), 'div')
    s += b.tb('점 = 결정 영향력', ab(64, 182, 80, 36, f'font-size: 11px; line-height: 18px; color: {MUTED}; {clamp(2)}'), 'div')
    RY = [(400, 66, '관심사', INK), (474, 66, '걱정', INK), (548, 100, '우리 답', BLUE)]
    for y, h, t, c in RY:
        s += b.tb(t, ab(64, y, 76, h, f'display: flex; align-items: center; font-size: 14px; font-weight: 800; color: {c}; white-space: nowrap'), 'div')
    W = 254
    for i, (pid, pos, role, nm, inf, want, worry, ans, ev) in enumerate(people):
        x = 152 + i * (W + 16)
        s += photo(b, pid, x, 152, W, 236, pos=pos, hint=f'{nm} 역할 참고 이미지 (실제 인물 사진은 쓰지 않음)', radius=12)
        s += glass(b.tb(role, f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap')
                   + '<span style="display: flex; align-items: center; justify-content: space-between; gap: 8px">'
                   + b.tb(nm, 'font-size: 17px; font-weight: 800; line-height: 24px; color: #ffffff; white-space: nowrap')
                   + '<span style="display: flex; gap: 0">' + b.tb('●' * inf, f'font-size: 12px; letter-spacing: 2px; color: {LB}; white-space: nowrap')
                   + (b.tb('●' * (5 - inf), 'font-size: 12px; letter-spacing: 2px; color: rgba(255,255,255,0.28); white-space: nowrap') if inf < 5 else '') + '</span></span>',
                   x + 8, 388 - 8 - 58, W - 16, 58, pad='7px 12px', gap=0)
        s += card(b.tb(want, f'font-size: 14px; font-weight: 700; line-height: 20px; {clamp(2)}'), x, 400, W, 66, pad='12px 14px', extra='justify-content: center')
        s += card(b.tb(worry, f'font-size: 14px; line-height: 20px; color: {BODY}; {clamp(2)}'), x, 474, W, 66, bg='#ffffff', border=LINE, pad='11px 14px', extra='justify-content: center')
        s += card(b.tb(ans, f'font-size: 14px; font-weight: 800; line-height: 20px; color: {BLUE}; {clamp(2)}') + '<span style="margin-top: auto"></span>' + evid(b, ev),
                  x, 548, W, 100, bg=CHIP, pad='12px 14px', gap=6)
    s += footer(b, DEAL['FN'] + ' · 키맨 인터뷰 기준 · 영향력 점은 예시 · 사진: samsung.com 금융 도입사례 · 비즈니스 페이지(역할 참고)', 6)
    return s


# ================================================================ 4 RFP 핵심 요구 5 · 큰 사진 위 번호 핀
@layout(L, f='L_PH_RQ_D', code='PH-RQ-D', p='requirements', p2=None, name='RFP 핵심 요구 5 · 공간 사진 핀',
        when='RFP의 핵심 요구가 한 공간에 모여 있을 때, 큰 현장 사진 위 번호로 위치를 짚고 원문과 대응을 나란히 볼 때',
        pv=[], sample=CUST['HT'], grp=G_RQ)
def _(b):
    s = header(b, EB_RQ, 'B 호텔 RFP의 핵심 요구 다섯, 로비 한 장면에 다 있습니다', 'RFP 원문 요약 인용 · 사진 속 번호 = 요구가 걸린 위치 · 대응은 제안서 해당 쪽', w=1152)
    PID, X, Y, W, H = 'ph.ht-lobby-art', 64, 152, 672, 496
    s += photo(b, PID, X, Y, W, H, pos='75% 50%', hint='고객 호텔 로비 사진으로 교체 (프런트 · 벽면 · 천장 · 동선이 함께 보이게)', radius=14)
    s += tag_on(b, 'B 호텔 로비 · 프런트 층', X + 14, Y + 14)
    reqs = [((85, 50), '“로비 대표 벽면을 브랜드 화면으로 바꿀 것”', 'RFP p.[00] · 필수', '벽면 LED [000]형 · 아트 모드 콘텐츠'),
            ((82, 84), '“체크인 대기 시간을 줄이는 안내를 둘 것”', 'RFP p.[00] · 필수', '프런트 옆 대기 순번 · 객실 준비 화면'),
            ((34, 36), '“2층 연회장 · 부대시설 길 안내”', 'RFP p.[00] · 필수', '층별 세로형 안내 사이니지 [0]대'),
            ((74, 12), '“로비 · 객실 냉난방 소음을 줄일 것”', 'RFP p.[00] · 필수', '무풍 카세트 · 객실별 개별 제어'),
            ((55, 63), '“레스토랑 혼잡도를 미리 알릴 것”', 'RFP p.[00] · 선택', '혼잡도 표출 · 객실 TV에도 같은 정보')]
    for i, ((px, py), q, ref, ans) in enumerate(reqs):
        cx, cy = at(PID, X, Y, W, H, px, py, pos=(75, 50))
        s += pin(b, str(i + 1), cx, cy, size=32)
        y = 152 + i * 101
        s += (f'<div style="{ab(760, y, 456, 92, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 10px 14px; display: flex; align-items: flex-start; gap: 12px")}">'
              + numtag(b, str(i + 1), size=26)
              + '<span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">'
              + b.tb(q, 'font-size: 14.5px; font-weight: 800; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(ref, f'font-size: 11px; line-height: 16px; color: {MUTED}; white-space: nowrap')
              + b.tb('→ ' + ans, f'font-size: 13.5px; font-weight: 800; line-height: 20px; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span></div>')
    s += footer(b, DEAL['HT'] + ' · RFP 원문은 요약 인용 · 핀 위치는 예시 · 사진: samsung.com 호텔 도입사례 · 비즈니스 페이지', 6)
    return s


# ================================================================ 5 말한 요구 vs 숨은 요구 · 빙산
@layout(L, f='L_PH_RQ_E', code='PH-RQ-E', p='requirements', p2='insight', name='말한 요구 vs 숨은 요구 · 빙산',
        when='고객이 말한 요구 아래에 현장에서 찾은 진짜 요구가 있을 때, 빙산 그림과 현장 사진 근거로 보여 줄 때',
        pv=[], sample=CUST['FB'], grp=G_RQ)
def _(b):
    s = header(b, EB_RQ, '‘메뉴보드 교체’ 아래에, 말하지 않은 요구 셋이 있습니다', 'A 커피 본사 요청(RFP · 미팅)과 매장 관찰 · 점장 인터뷰를 겹쳐 본 결과', w=1152)
    X, W, WL = 64, 432, 372   # 왼쪽 빙산 판 · 수면선 y
    s += b.img('ph.fb-counter-menu', ab(X, 152, W, WL - 152), pos='50% 40%', kind='space', hint='고객 매장 카운터 메뉴보드 사진으로 교체', radius='14px 14px 0 0')
    s += tag_on(b, '물 위 · 말한 요구', X + 14, 166)
    s += glass(b.tb('“[00]개 매장 메뉴보드를 디지털로 바꿔 주세요”', 'font-size: 15px; font-weight: 800; line-height: 22px; color: #ffffff; ' + clamp(2)),
               X + 14, 202, 250, None, pad='9px 13px')
    s += f'<div style="{ab(X, WL, W, 648 - WL, "border-radius: 0 0 14px 14px; background: linear-gradient(180deg, #1c3399 0%, #0b1650 100%)")}"></div>'
    # 빙산: 물 위 꼭대기 · 물 아래 몸통 (div + clip-path)
    s += f'<div style="{ab(270, WL - 86, 150, 86, "background: #eef2ff; clip-path: polygon(44% 0, 60% 26%, 74% 18%, 100% 100%, 0 100%, 20% 38%)")}"></div>'
    s += f'<div style="{ab(270, WL - 86, 150, 86, "background: #b9c6f0; clip-path: polygon(44% 0, 60% 26%, 74% 18%, 100% 100%, 52% 100%, 50% 40%)")}"></div>'
    s += f'<div style="{ab(120, WL, 360, 262, "background: rgba(157,180,255,0.30); clip-path: polygon(46% 0, 76% 0, 94% 30%, 100% 62%, 82% 100%, 22% 100%, 0 70%, 10% 28%)")}"></div>'
    s += rect(X, WL - 1, W, 2, LB)
    s += b.tb('수면선', ab(X + W - 70, WL + 8, 56, 16, f'font-size: 11px; font-weight: 800; color: {LB}; text-align: right; white-space: nowrap'), 'div')
    s += b.tb('물 아래 · 숨은 요구', ab(X + 16, WL + 8, 160, 16, f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap'), 'div')
    for i, t in enumerate(['주문이 빨라야 한다', '화면 정보가 늘 맞아야 한다', '점장 손이 덜 가야 한다']):
        y = WL + 66 + i * 58
        s += row(numtag(b, str(i + 1), size=24, bg='#ffffff').replace('color: #ffffff', f'color: {BLUE}')
                 + b.tb(t, 'font-size: 15px; font-weight: 800; line-height: 22px; color: #ffffff; white-space: nowrap'), 180, y, 280, 28, gap=10)
    s += b.tb('보이는 요구 1 · 보이지 않는 요구 3', ab(X + 16, 616, 300, 18, f'font-size: 11.5px; line-height: 18px; color: {LT}; white-space: nowrap'), 'div')
    hid = [('ph.fb-dt-order', '70% 50%', '메뉴를 고르는 시간이 줄을 만듭니다', '주문 1건 평균 [00]초 · 매장 [0]곳 관찰', '추천 · 세트를 먼저 보이는 화면 순서', '드라이브스루 · 카운터 주문 장면'),
           ('r4.fb-bakery-menu', '50% 40%', '품절 · 가격 변경이 화면에 늦게 붙습니다', 'POS 품절 후 화면 반영까지 [00]분', 'POS 연동 자동 품절 · 가격 표시', '카운터 위 메뉴 화면'),
           ('r4.fb-kitchen-tab', '55% 35%', '점장은 기기 관리에 손이 가지 않길 바랍니다', '점장 [0]명 인터뷰 · 화면 관리 하루 [00]분', '본사 원격 관리 · 장애 자동 알림', '점장 · 직원 업무 장면')]
    for i, (pid, pos, t, ev, ans, hint) in enumerate(hid):
        y = 152 + i * 170
        s += photo(b, pid, 520, y, 300, 156, pos=pos, hint=hint + ' (매장 관찰 사진으로 교체)', radius=12)
        s += tag_on(b, f'현장 근거 {i + 1}', 530, y + 10)
        s += card('<span style="display: flex; align-items: center; gap: 8px">' + numtag(b, str(i + 1), size=22) + b.tb('숨은 요구', f'font-size: 11.5px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>'
                  + b.tb(t, f'font-size: 16px; font-weight: 800; line-height: 23px; {clamp(2)}')
                  + b.tb(ev, f'font-size: 12.5px; line-height: 18px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                  + '<span style="margin-top: auto; box-sizing: border-box; border-radius: 8px; background: #ffffff; border: 1px solid #d5dcf5; padding: 5px 10px; display: flex; align-items: center; gap: 8px">'
                  + b.tb('우리 대응', f'flex-shrink: 0; font-size: 11px; font-weight: 800; color: {MUTED}; white-space: nowrap')
                  + b.tb(ans, f'font-size: 13.5px; font-weight: 800; line-height: 20px; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>',
                  832, y, 384, 156, pad='12px 16px', gap=4)
    s += footer(b, DEAL['FB'] + ' · 관찰 · 인터뷰 수치는 자리표시 · 사진: samsung.com 외식 · 카페 도입사례 · 비즈니스 페이지', 7)
    return s


# ================================================================ 6 요구 → 제품 · 솔루션 매핑
@layout(L, f='L_PH_RQ_F', code='PH-RQ-F', p='requirements', p2='products', name='요구 → 제품 · 솔루션 화면 매핑',
        when='요구마다 어떤 제품과 어떤 솔루션 화면으로 답하는지 한 줄씩 짝지어, 충족 수준까지 보여 줄 때',
        pv=[], sample=CUST['OF'], grp=G_RQ)
def _(b):
    s = header(b, EB_RQ, '다섯 가지 요구, 각각 맞는 제품과 화면으로 답합니다', 'C 빌딩 RFP 핵심 요구 → 삼성 제품 · 솔루션 매핑 · 충족 수준은 자체 점검', w=1152)
    for x, w, t in [(64, 420, '고객 요구 · 현장'), (516, 180, '제품'), (704, 180, '솔루션 화면'), (896, 320, '대응 · 충족 수준')]:
        s += b.tb(t, ab(x, 150, w, 18, f'font-size: 12px; font-weight: 800; line-height: 18px; color: {MUTED}; white-space: nowrap'), 'div')
    rows = [('ph.of-lobby-info', '60% 50%', '로비 방문객 안내를 무인으로', 'cut.km24c', 'fill.vxt_cms', '키오스크 방문 등록 · 층별 안내 화면을 VXT로 운영', '충족'),
            ('ph.of-door-tab', '45% 50%', '회의실 노쇼 · 중복 예약 줄이기', 'cut.tabs11', 'fill.stp_auto', '문 앞 태블릿 예약 · 체크인, 노쇼면 자동 반납', '충족'),
            ('ph.of-office-ac', '50% 30%', '층 · 존별 냉난방 개별 제어', 'cut.wf4way', 'fill.biot_floor', '무풍 4Way 카세트 · b.IoT 도면에서 존별 제어', '충족'),
            ('r4.of-flip-team', '50% 40%', '노트북 없이 회의 화면 공유', 'cut.wa75d', 'fill.dex_ext', '전자칠판 · DeX 무선 연결, 기존 회의 SW 연동은 확인 중', '부분'),
            ('ph.of-control-room', '50% 50%', '빌딩 설비를 한 화면에서 관제', 'cut.vm55b', 'fill.biot_dash', '관제실 비디오월 · b.IoT 통합 대시보드', '충족')]
    for i, (sc, pos, req, cp, up, ans, lv) in enumerate(rows):
        y = 172 + i * 97
        s += photo(b, sc, 64, y, 170, 88, pos=pos, hint='요구가 생기는 고객 현장 사진으로 교체', radius=10)
        s += (f'<div style="{ab(246, y, 236, 88, "display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
              + '<span style="display: flex; align-items: center; gap: 6px">' + numtag(b, str(i + 1), size=20) + b.tb('RFP p.[00]', f'font-size: 11px; color: {MUTED}; white-space: nowrap') + '</span>'
              + b.tb(req, f'font-size: 15px; font-weight: 800; line-height: 22px; {clamp(2)}') + '</div>')
        s += ARR(484, y + 34, 30, 20)
        s += cut(b, cp, 516, y, 180, 88, hint='대응 제품 컷', radius=10, pad=8)
        s += ui(b, up, 704, y, 180, 88, hint='대응 솔루션 화면 (실제 구성 화면으로 교체)')
        s += (f'<div style="{ab(896, y, 320, 88, f"box-sizing: border-box; border-radius: 10px; background: {CHIP if lv == '충족' else SOFT}; padding: 10px 14px; display: flex; align-items: center; gap: 12px")}">'
              + b.tb(ans, f'flex-grow: 1; min-width: 0; font-size: 13px; font-weight: 700; line-height: 19px; color: {INK}; {clamp(3)}') + st(b, lv) + '</div>')
    s += footer(b, DEAL['OF'] + ' · 충족 수준은 자체 점검 · 사진: samsung.com 오피스 도입사례 · 비즈니스 페이지 · 제품 컷 · 솔루션 화면', 7)
    return s


# ================================================================ 7 필수 · 선택 · 가점 · 세 줄 카드 띠
@layout(L, f='L_PH_RQ_G', code='PH-RQ-G', p='requirements', p2=None, name='필수 · 선택 · 가점 · 사진 카드 띠',
        when='RFP 요구가 필수 · 선택 · 가점으로 나뉠 때, 줄마다 대표 요구를 사진 카드로 놓고 대응 상태를 붙일 때',
        pv=[], sample=CUST['PB'], grp=G_RQ)
def _(b):
    s = header(b, EB_RQ, '필수는 모두 채우고, 가점 항목까지 챙겼습니다', 'S 지자체 RFP 요구 구분별 대표 항목 · 전체 [00]개는 요구사항 대응표 p.[00]', w=1152)
    bands = [('필수', '[00]개', '하나라도 못 채우면 탈락', BLUE, '#ffffff', LB,
              [('ph.pb-control', '50% 45%', '상황실 화면 통합 표출', '비디오월 + 통합 관제 SW', '충족'),
               ('r4.pb-highway-ctl', '50% 50%', '24시간 365일 운영', '상업용 24/7 모델', '충족'),
               ('fill.vxt_control', '50% 50%', '내부망 분리 · 접근 기록', '내부 서버형 · 감사 보고', '부분'),
               ('ph.svc-technician', '50% 35%', '장애 [0]시간 내 복구', '원격 조치 + 현장 출동', '충족')]),
             ('선택', '[00]개', '제안하면 기술 평가에 반영', CHIP, BLUE, MUTED,
              [('ph.pb-airport-hall', '50% 50%', '다국어 [4]개 언어 안내', '콘텐츠 템플릿 다국어', '충족'),
               ('fill.station_map', '50% 50%', '정류장 도착 정보 연동', 'BIS 연동 사이니지', '충족'),
               ('r4.pb-library-in', '50% 50%', '공공 도서관 안내 연계', '시설 일정 자동 표출', '부분'),
               ('ph.ad-subway', '50% 40%', '역사 · 지하 공간 설치', '슬림 벽부형 · 방진 모델', '충족')]),
             ('가점', '+[0]점', '채우면 점수를 더 받는 항목', '#ffffff', INK, MUTED,
              [('fill.ctrl_room', '50% 50%', '재난 문자 즉시 표출', '관제에서 전 화면 긴급 모드', '충족'),
               ('ph.pb-ranger-watch', '55% 40%', '현장 요원 알림 연동', '갤럭시 워치 알림 · 대안 제시', '대안'),
               ('r4.pb-park-watch', '45% 50%', '탐방로 위치 안내', '워치 위치 공유 · 안내 화면', '충족'),
               ('r4.pb-library', '50% 50%', '에너지 [00]% 절감', '밝기 자동 조절 · 야간 절전', '부분')])]
    for k, (nm, cnt, desc, bg, c, c2, cards) in enumerate(bands):
        y = 152 + k * 170
        s += box(64, y, 1152, 156, SOFT, 14)
        bd = f'border: 1.5px solid {LINE}; ' if bg == '#ffffff' else ''
        s += (f'<div style="{ab(64, y, 120, 156, f"box-sizing: border-box; border-radius: 14px; background: {bg}; {bd}padding: 16px 14px; display: flex; flex-direction: column; gap: 2px")}">'
              + b.tb(nm, f'font-size: 22px; font-weight: 800; line-height: 30px; color: {c}; white-space: nowrap')
              + b.tb(cnt, f'{NUM}; font-size: 18px; font-weight: 800; line-height: 26px; color: {c}; white-space: nowrap')
              + '<span style="margin-top: auto"></span>'
              + b.tb(desc, f'font-size: 11.5px; line-height: 17px; color: {c2}; {clamp(3)}') + '</div>')
        for j, (pid, pos, t, ans, lv) in enumerate(cards):
            x = 196 + j * 255
            s += photo(b, pid, x, y + 12, 243, 84, pos=pos, hint=f'{t} — 관련 현장 사진으로 교체', radius=10)
            s += f'<div style="{ab(x + 8, y + 20)}">' + st(b, lv, size=11, h=20) + '</div>'
            s += b.tb(t, ab(x, y + 102, 243, 20, 'font-size: 14px; font-weight: 800; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
            s += b.tb('→ ' + ans, ab(x, y + 124, 243, 18, f'font-size: 12px; line-height: 18px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
    s += footer(b, DEAL['PB'] + ' · 요구 구분 · 배점은 RFP p.[00] 기준 · 사진: samsung.com 공공 · 교통 도입사례 · 비즈니스 페이지', 7)
    return s


# ================================================================ 8 현장 실사에서 확인한 것 · 실사 사진 4 + 메모 핀
@layout(L, f='L_PH_RQ_H', code='PH-RQ-H', p='requirements', p2=None, name='현장 실사 확인 · 사진 4 + 메모 핀',
        when='현장 실사로 천장 · 벽 · 전원 · 동선을 확인했을 때, 사진 위 메모 핀과 확인 결과 · 설계 반영을 함께 보일 때',
        pv=[], sample=CUST['RT'], grp=G_RQ)
def _(b):
    s = header(b, EB_RQ, '실사에서 확인한 네 가지가, 설계를 바꿨습니다', 'D 리테일 플래그십 [0]층 현장 실사 · [0000.00.00] · [0]명 참여 · 사진 속 번호 = 메모 위치', w=1152)
    cells = [('ph.rt-mall-ac', '천장', [(52, 30), (84, 20)], ['천장고 [0.0]m · 덕트 노출 천장', '조명 레일과 걸이 위치가 겹침'], '천장 걸이 대신 기둥 · 벽면에 설치', '천장 · 덕트 실사 사진'),
             ('r4.rt-fashion-led', '벽', [(50, 42), (64, 80)], ['벽체 하중 [000]kg/m² · 보강 필요', '앞 카운터와 [00]cm 간섭'], '벽 보강 후 폭 [0.0]m LED 설치', '설치 벽면 실사 사진'),
             ('r4.rt-elevator-sign', '전원 · 통신', [(30, 46), (6, 72)], ['화면 뒤 전원 없음 · 콘센트 [0]구뿐', '통신 배관까지 [00]m'], '전용 전원 · 통신 배선 추가, 공사 [0]일', '전원 · 분전반 실사 사진'),
             ('ph.rt-atrium-kiosk', '동선', [(50, 72), (50, 48)], ['키오스크 앞 대기 시 통로 [0.0]m', '에스컬레이터 앞 피크 [000]명/시'], '키오스크 [0]m 안쪽 · 세로형 안내를 입구 정면에', '고객 동선 실사 사진')]
    for i, (pid, nm, pins, notes, out, hint) in enumerate(cells):
        x = 64 + (i % 2) * 584; y = 152 + (i // 2) * 256
        s += photo(b, pid, x, y, 300, 240, pos='50% 50%', hint=hint + ' (실제 실사 사진으로 교체)', radius=12)
        s += tag_on(b, f'실사 {i + 1} · {nm}', x + 10, y + 10)
        for j, (px, py) in enumerate(pins):
            cx, cy = at(pid, x, y, 300, 240, px, py)
            s += pin(b, str(j + 1), cx, cy, size=26)
        notes_h = ''.join('<span style="display: flex; align-items: flex-start; gap: 8px">' + numtag(b, str(j + 1), size=20)
                          + b.tb(n, f'font-size: 13px; line-height: 19px; color: {INK}; {clamp(2)}') + '</span>' for j, n in enumerate(notes))
        s += card(b.tb(nm, 'font-size: 17px; font-weight: 800; line-height: 24px; white-space: nowrap')
                  + b.tb('확인 결과', f'font-size: 11px; font-weight: 800; color: {MUTED}; white-space: nowrap; margin-top: 2px') + notes_h
                  + f'<span style="height: 1px; background: {LINE}; margin: auto 0 4px"></span>'
                  + b.tb('설계 반영', f'font-size: 11px; font-weight: 800; color: {BLUE}; white-space: nowrap')
                  + b.tb(out, f'font-size: 14px; font-weight: 800; line-height: 20px; color: {BLUE}; {clamp(2)}'),
                  x + 312, y, 256, 240, pad='12px 16px', gap=5)
    s += footer(b, DEAL['RT'] + ' · 실사 수치는 자리표시 · 핀 위치는 예시 · 사진: samsung.com 리테일 도입사례 · 비즈니스 페이지', 7)
    return s


# ================================================================ 9 숫자로 본 관람객 · 큰 관중석 사진 + 숫자 6
@layout(L, f='L_PH_US_K', code='PH-US-K', p='user', p2=None, name='숫자로 본 관람객 · 관중석 사진 + 숫자 6',
        when='사용자(관람객 · 방문객) 규모와 행동을 숫자 여섯 개로 한눈에 보이고, 큰 현장 사진으로 분위기를 잡을 때',
        pv=[], sample=CUST['VN'], grp=G_US)
def _(b):
    s = header(b, EB_US, 'V 경기장 관람객, 숫자로 보면 머무는 시간이 깁니다', '관람객 데이터 · 출처: [구단 · 조사 기관, 연도] · 연령대 막대는 예시 · 사진은 같은 업종 도입사례', w=1152)
    s += photo(b, 'ph.vn-stadium-wide', 64, 152, 624, 496, pos='50% 50%', hint='고객 경기장 관중석 사진으로 교체', radius=14)
    s += tag_on(b, '[2025] 시즌 · 홈 경기', 78, 166)
    s += glass(b.tb('연 관람객', f'font-size: 13px; font-weight: 800; color: {LB}; white-space: nowrap')
               + bignum(b, '[000]', '만 명', size=48, color='#ffffff', unit_size=20)
               + b.tb('홈 경기 [00]회 · 경기당 평균 [0.0]만 명', f'font-size: 13px; line-height: 20px; color: {LT}; white-space: nowrap'),
               80, 494, 330, None, pad='14px 18px', gap=8)

    def tile(x, y, w, h, lab, val, unit, note):
        return card(b.tb(lab, f'font-size: 12.5px; font-weight: 800; color: {MUTED}; white-space: nowrap')
                    + bignum(b, val, unit, size=34, unit_size=16)
                    + '<span style="margin-top: auto"></span>'
                    + b.tb(note, f'font-size: 12.5px; line-height: 18px; color: {BODY}; {clamp(2)}'), x, y, w, h, pad='14px 16px', gap=4)
    s += tile(712, 152, 244, 130, '평균 체류', '[0.0]', '시간', '경기 전후 [00]분 · 이 시간을 채울 화면')
    s += tile(972, 152, 244, 130, '재방문', '[00]', '%', '시즌권 · 멤버십 · 다시 오는 사람 위주')
    # 연령대 막대
    ages = [('10대', 0.35), ('20대', 0.85), ('30대', 1.0), ('40대', 0.7), ('50대+', 0.4)]
    bars = ''
    for nm, v in ages:
        bars += ('<span style="display: flex; align-items: center; gap: 10px">'
                 + b.tb(nm, f'width: 44px; flex-shrink: 0; font-size: 12.5px; font-weight: 700; color: {BODY}; white-space: nowrap')
                 + f'<span style="width: 330px; flex-shrink: 0; height: 14px; border-radius: 4px; background: #e6e9ef; position: relative; overflow: hidden"><span style="position: absolute; left: 0; top: 0; bottom: 0; width: {round(330 * v)}px; border-radius: 4px; background: {BLUE if v == 1.0 else "#9fb0e6"}"></span></span>'
                 + b.tb('[00]%', f'{NUM}; font-size: 12.5px; font-weight: 800; color: {BLUE if v == 1.0 else BODY}; white-space: nowrap') + '</span>')
    s += card('<span style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px">'
              + b.tb('연령대', f'font-size: 12.5px; font-weight: 800; color: {MUTED}; white-space: nowrap')
              + b.tb('가장 많은 연령대 · [00]대', f'font-size: 12.5px; font-weight: 700; color: {BLUE}; white-space: nowrap') + '</span>'
              + bars, 712, 296, 504, 206, pad='14px 18px', gap=11)
    s += tile(712, 516, 244, 132, '모바일 예매', '[00]', '%', '앱 예매 → 입장 · 좌석 안내까지 잇기')
    s += tile(972, 516, 244, 132, '동반 인원', '[0.0]', '명', '가족 · 친구 단위 · 함께 보는 화면')
    s += footer(b, DEAL['VN'] + ' · 수치는 자리표시 · 연령대 막대 길이는 예시 · 사진: samsung.com 경기장 · 공연장 · 영화관 도입사례 · 비즈니스 페이지', 8)
    return s


# ================================================================ 10 누가 정하고 누가 쓰나 · 결정 4 + 사용자 3
@layout(L, f='L_PH_US_L', code='PH-US-L', p='user', p2='requirements', name='정하는 사람 · 쓰는 사람 · 사진 7',
        when='사업을 결정하는 부서와 실제로 쓰는 사용자가 다를 때, 두 줄 사진과 연결선으로 누구 말이 누구에게 가는지 보일 때',
        pv=[], sample=CUST['ED'], grp=G_US)
def _(b):
    s = header(b, EB_US, '정하는 사람과 쓰는 사람이 다릅니다 — 둘 다 설득해야 합니다', 'E 대학교 스마트 캠퍼스 사업 · 결정 라인 4곳과 사용자 3그룹 · 사진은 역할 참고 이미지', w=1152)
    # 왼쪽 줄 이름
    for y, h, t1, t2, c in [(152, 200, '정하는', '사람', BLUE), (432, 216, '쓰는', '사람', INK)]:
        s += (f'<div style="{ab(64, y, 76, h, "display: flex; flex-direction: column; justify-content: center; gap: 0")}">'
              + b.tb(t1, f'font-size: 16px; font-weight: 800; line-height: 24px; color: {c}; white-space: nowrap')
              + b.tb(t2, f'font-size: 16px; font-weight: 800; line-height: 24px; color: {c}; white-space: nowrap') + '</div>')
    s += b.tb('← 상신 순서', ab(64, 330, 80, 16, f'font-size: 11px; color: {MUTED}; white-space: nowrap'), 'div')
    deciders = [('r4.ed-main-hall', '50% 45%', '총장실', '최종 승인 · 대학 발전 계획과 맞는가'),
                ('fill.fin_chart', '50% 40%', '기획처', '예산 · 사업 계획 · 평가 기준 확정'),
                ('ph.ed-charging', '60% 40%', '정보화본부', '기술 검토 · 보안 · 운영 인력'),
                ('r4.ed-ac-check', '50% 25%', '시설팀', '설치 공사 · 전기 · 방학 일정')]
    TW = 245
    tc = []
    for i, (pid, pos, nm, d) in enumerate(deciders):
        x = 152 + i * (TW + 28); tc.append(x + TW // 2)
        s += box(x, 152, TW, 200, SOFT, 12)
        s += b.img(pid, ab(x, 152, TW, 140), pos=pos, kind='space', hint=f'{nm} 역할 참고 이미지', radius='12px 12px 0 0')
        s += b.tb(nm, ab(x + 14, 298, TW - 28, 22, 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap'), 'div')
        s += b.tb(d, ab(x + 14, 322, TW - 28, 18, f'font-size: 12.5px; line-height: 18px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
        if i: s += ARR(x - 28, 204, 28, 20, size=16, ch='←')
    s += tag_on(b, '최종 결정', 152 + 10, 162)
    users = [('ph.ed-print-users', '75% 40%', '학생 · [0]만 명', '강의실 · 도서관 화면을 매일 봄 — 빈자리 · 공지를 폰과 함께', 1, '만족도 조사 · 학생회 건의'),
             ('r4.ed-teacher-board', '60% 40%', '교수 · [0,000]명', '수업 시작 1분 안에 화면이 켜져야 — 전자칠판 · 무선 공유', 2, '수업 장비 요구'),
             ('fill.acad_office', '50% 50%', '직원 · [000]명', '고장 신고 · 점검 일을 줄이고 싶음 — 원격 관리 · 알림', 3, '고장 · 점검 요청')]
    UW = 338
    for j, (pid, pos, nm, need, tgt, lab) in enumerate(users):
        x = 152 + j * (UW + 25); cx = x + UW // 2; tx = tc[tgt]
        s += box(x, 432, UW, 216, SOFT, 12)
        s += b.img(pid, ab(x, 432, UW, 158), pos=pos, kind='people', hint=f'{nm.split(" · ")[0]} 장면 (역할 참고 이미지)', radius='12px 12px 0 0')
        s += b.tb(nm, ab(x + 14, 598, UW - 28, 22, 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap'), 'div')
        s += b.tb(need, ab(x + 14, 622, UW - 28, 18, f'font-size: 12.5px; line-height: 18px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
        # 연결선: 사용자 → 결정 부서 (위로)
        ly = 372
        s += rect(cx - 1, ly, 2, 432 - ly, BLUE)
        s += rect(min(cx, tx) - 1, ly - 1, abs(tx - cx) + 2, 2, BLUE)
        s += rect(tx - 1, 360, 2, ly - 360, BLUE)
        s += b.tb('▲', ab(tx - 8, 351, 16, 12, f'font-size: 10px; line-height: 12px; color: {BLUE}; text-align: center'), 'div')
        s += b.tb(lab, ab(cx - 80, 392, 160, 24, f'box-sizing: border-box; height: 24px; border-radius: 999px; background: #ffffff; border: 1.5px solid {BLUE}; color: {BLUE}; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
    s += footer(b, DEAL['ED'] + ' · 인원 수는 자리표시 · 연결선은 의견 전달 경로(예시) · 사진: samsung.com 교육 도입사례 · 비즈니스 페이지(역할 참고)', 8)
    return s
