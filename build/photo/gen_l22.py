# 6차 — 실행 계획 사진 레이아웃 8장 (L_PH_CU_A ~ L_PH_EX_B)
# 맞춤 개발 사양 · 공급 일정 · 보안 요건 · 개인정보 흐름 · 교육 계획 · 운영 이관 · 유지보수 캘린더 · 운영 리포트
# 원본 텍스트 장(pv)의 eyebrow · 예시 고객 · 각주 앞부분 · 쪽 번호를 그대로 쓰고, 표는 줄여 사진 자리를 만든다
from gen_r5 import *
L = []
GRP = '실행 · 사진'


def foot(note, extra, src):
    return f'{note} · {extra} · 사진: samsung.com {SRC[src]} 도입사례 · 비즈니스 페이지'


def lab(b, text, color=BLUE, size=12):
    return b.tb(text, f'font-size: {size}px; font-weight: 800; color: {color}; white-space: nowrap')


def tline(b, text, size=15, lh=22, lines=1, color=INK, weight=800):
    return b.tb(text, f'font-size: {size}px; font-weight: {weight}; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def dline(b, text, size=12.5, lh=18, lines=1, color=BODY):
    return b.tb(text, f'font-size: {size}px; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def row(inner, gap=6, extra=''):
    return f'<span style="display: flex; align-items: center; gap: {gap}px; {extra}">{inner}</span>'


def cell(b, text, x, y, w, h, size=13, weight=400, color=INK, align='left', extra=''):
    """한 줄 표 칸 (세로 가운데)"""
    jc = {'left': 'flex-start', 'center': 'center', 'right': 'flex-end'}[align]
    return f'<div style="{ab(x, y, w, h, f"display: flex; align-items: center; justify-content: {jc}")}">' + b.tb(text, f'font-size: {size}px; font-weight: {weight}; color: {color}; white-space: nowrap; {extra}') + '</div>'


def th(b, text, x, y, w, color=MUTED, align='left'):
    return b.tb(text, ab(x, y, w, 20, f'font-size: 12px; font-weight: 700; color: {color}; white-space: nowrap; text-align: {align}'), 'div')


def mchip(b, text, kind):
    """방법 · 방식 칩 — fill(파랑) · soft(연파랑) · line(검은 테) · gray(회색)"""
    st = {'fill': (BLUE, '#ffffff', BLUE), 'soft': (CHIP, BLUE, CHIP), 'line': ('#ffffff', INK, INK), 'gray': (SOFT, BODY, '#d3d7de')}[kind]
    return b.tb(text, f'align-self: center; height: 22px; padding: 0 9px; box-sizing: border-box; border-radius: 999px; background: {st[0]}; color: {st[1]}; border: 1.2px solid {st[2]}; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')


def dots(n, x, y):
    s = ''
    for k in range(3):
        s += rect(x + k * 13, y, 8, 8, BLUE if k < n else '#d3d7de', 4)
    return s


def onpin(b, n, x, y, text, side='right'):
    """사진 위 번호 핀 + 흰 알약 이름"""
    s = pin(b, n, x, y, size=28)
    tx = x + 18 if side == 'right' else x - 18 - (len(text) * 13 + 22)
    s += b.tb(text, ab(tx, y - 12, None, 24, f'box-sizing: border-box; border-radius: 999px; background: #ffffff; color: {INK}; font-size: 12px; font-weight: 800; padding: 0 10px; display: flex; align-items: center; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.18)'), 'div')
    return s


# ---------------------------------------------------------------- CU-A · edition spec over a device photo
@layout(L, f='L_PH_CU_A', code='PH-CU-A', p='execution', name='전용 에디션 사양 · 단말 사진 위 번호',
        when='기본 단말을 맞춤 에디션으로 바꿀 때, 단말 · 패키지 사진 위 번호로 무엇이 바뀌는지 짚고 항목 표로 방법 · 난이도를 함께',
        pv=['L_CU_A'], sample='U 통신사', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 맞춤 개발', '기본 단말에서, 아이 전용으로 바뀌는 열 가지', '항목별 기본 제공 · 맞춤 방법(설정 · 앱 개발 · 하드웨어) · 개발 난이도', w=1152)
    # left — device photo with pins, package, kid in use
    s += photo(b, 'r4.oe-kids-phone', 64, 150, 456, 316, pos='50% 50%', hint='맞춤 에디션 단말 정면 · 아이 전용 홈 화면 (시안 렌더로 교체)', radius=14)
    s += tag_on(b, 'U 통신사 키즈 에디션 · 시안', 78, 164)
    s += onpin(b, '1', 300, 214, '부팅 화면')
    s += onpin(b, '2', 300, 300, '홈 화면')
    s += photo(b, 'fill.kids_pkg', 64, 478, 222, 170, pos='50% 55%', hint='에디션 패키지 · 케이스 · 스트랩 (시안으로 교체)', radius=12)
    s += onpin(b, '3', 92, 504, '패키지')
    s += photo(b, 'r4.oe-kids-use', 298, 478, 222, 170, pos='45% 50%', hint='아이가 단말을 쓰는 장면 (고객 촬영 사진으로 교체)', radius=12)
    s += tag_on(b, '아이 사용 장면', 310, 612)
    # right — reduced table (7 of 10)
    X = [544, 694, 790, 1004, 1124]
    W = [146, 92, 210, 116, 92]
    for x, w, t, c in zip(X, W, ['항목', '기본 단말', '맞춤 내용', '방법', '난이도'], [MUTED, MUTED, BLUE, MUTED, MUTED]):
        s += th(b, t, x, 152, w, c)
    s += rect(544, 178, 672, 2, INK)
    rows = [('1', '부팅 화면', '삼성 로고', 'U 통신사 키즈 로고', ('설정', 'soft'), 1, '낮음'),
            ('2', '홈 화면', '기본 런처', '큰 아이콘 6개', ('런처', 'line'), 2, '중간'),
            ('', '유해 콘텐츠 차단', '없음', '앱 · 웹 차단 목록', ('앱 개발', 'line'), 2, '중간'),
            ('', '사용 시간 관리', '디지털 웰빙', '부모 앱 원격 설정', ('앱 개발', 'line'), 3, '높음'),
            ('', '위치 · 안심', '기본 위치', '등하교 알림', ('앱 개발', 'line'), 3, '높음'),
            ('', '설정 잠금', '없음', '초기화 · 설정 변경 제한', ('Knox Configure', 'fill'), 1, '낮음'),
            ('3', '패키지', '기본', '키즈 케이스 · 스트랩', ('하드웨어', 'gray'), 2, '중간')]
    RH = 54
    for i, (n, it, base, cus, (m, mk), d, dl) in enumerate(rows):
        y = 180 + i * RH
        s += (f'<div style="{ab(X[0], y, W[0], RH, "display: flex; align-items: center; gap: 8px")}">'
              + (numtag(b, n, 22) if n else '<span style="width: 22px; flex-shrink: 0"></span>')
              + b.tb(it, 'font-size: 14px; font-weight: 800; white-space: nowrap') + '</div>')
        s += cell(b, base, X[1], y, W[1], RH, 13, 400, MUTED)
        s += (f'<div style="{ab(X[2], y, W[2], RH, "display: flex; align-items: center; gap: 8px")}">'
              + b.tb('→', f'font-size: 13px; font-weight: 800; color: {BLUE}') + b.tb(cus, 'font-size: 14px; font-weight: 800; white-space: nowrap') + '</div>')
        s += f'<div style="{ab(X[3], y, W[3], RH, "display: flex; align-items: center")}">' + mchip(b, m, mk) + '</div>'
        s += dots(d, X[4], y + 23) + cell(b, dl, X[4] + 44, y, 48, RH, 12.5, 400, BODY)
        s += rect(544, y + RH - 1, 672, 1, LINE)
    s += (f'<div style="{ab(544, 568, 672, 40, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 14px; display: flex; align-items: center; gap: 10px")}">'
          + lab(b, '+ 3항목', MUTED, 12.5) + b.tb('기본 앱 · 업데이트 · 인증 — 설정 · 인증으로 대응, 전체 표는 부록 p.[00]', f'font-size: 13px; color: {BODY}; white-space: nowrap') + '</div>')
    s += (f'<div style="{ab(544, 622, 672, 22, "display: flex; align-items: center; gap: 8px")}">'
          + lab(b, '난이도', INK, 12)
          + b.tb('● 개발 · 시험 범위가 클수록 많음', f'font-size: 12px; color: {BODY}; white-space: nowrap')
          + '<span style="margin-left: auto"></span>' + b.tb('앱 개발 · 하드웨어 · 인증 항목은 공급 일정(CU-B)에 반영', f'font-size: 12px; color: {MUTED}; white-space: nowrap') + '</div>')
    s += footer(b, foot('U 통신사 · 키즈 전용폰 공동 기획 제안 · 인증 · 법적 요건은 [확인 필요]', '번호 = 표의 항목 · 사진은 시안 자리', 'OE'), 30)
    return s


# ---------------------------------------------------------------- CU-B · schedule with milestone photo cards
@layout(L, f='L_PH_CU_B', code='PH-CU-B', p='execution', name='맞춤 개발 · 공급 일정 · 단계 사진',
        when='사양 확정부터 첫 출고까지의 개발 · 인증 · 양산 일정을, 마일스톤 셋은 현장 사진 카드로 크게 보여줄 때',
        pv=['L_CU_B'], sample='U 통신사', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 맞춤 개발', '사양 확정부터 첫 출고까지 [00]주', '단계 · 책임 · 품질 게이트 · 버퍼', w=1152)
    C_S, C_J, C_U = BLUE, '#6f82d6', '#b9c4ee'
    lg = ''.join(row(rect(0, 0, 10, 10, c, 2).replace('position: absolute; left: 0px; top: 0px; ', '') + b.tb(t, f'font-size: 12px; color: {BODY}; white-space: nowrap'), 5)
                 for c, t in [(C_S, '삼성 주도'), (C_J, '공동'), (C_U, 'U 통신사 주도')])
    s += f'<div style="{ab(800, 112, 416, 20, "display: flex; align-items: center; justify-content: flex-end; gap: 14px")}">' + lg + b.tb('◆ 마일스톤 · ✓ 품질 게이트', f'font-size: 12px; color: {BODY}; white-space: nowrap') + '</div>'
    ms = [('r4.of-flip-team', '50% 40%', '마일스톤 1 · W3', '사양 동결', '공동 사양서에 서명 — 이후 바뀌는 사양은 일정을 다시 협의', '사양 확정 회의 장면 (고객 회의 사진으로 교체)'),
          ('fill.lab', '50% 50%', '마일스톤 2 · W17', '인증 완료', '내부 검증 · 망 연동 · 인증 시험 통과 — 게이트마다 결함 [0]건 이하', '검증 · 인증 시험 장면 (시험실 사진으로 교체)'),
          ('fill.phone_store', '50% 55%', '마일스톤 3 · W24', '출시', 'U 통신사 매장에 초도 물량 배포 — 버퍼 [0]주 포함', '매장 출시 장면 (고객 매장 사진으로 교체)')]
    for i, (pid, pos, top, main, d, hint) in enumerate(ms):
        x = 64 + i * 392
        s += photo(b, pid, x, 150, 368, 178, pos=pos, hint=hint, radius=12)
        s += label_on(b, top, main, x + 12, 268, 170, lines=1)
        s += b.tb(d, ab(x, 338, 368, None, f'font-size: 13px; line-height: 20px; color: {BODY}; {clamp(2)}'), 'div')
    # compact gantt
    X0, WK, Y0, RH = 268, 39.5, 410, 27
    s += th(b, '단계 · 책임', 64, 386, 180)
    for k in range(24):
        hi = k + 1 in (3, 17, 24)
        s += b.tb(f'W{k + 1}', ab(round(X0 + k * WK), 388, round(WK), 16, f'{NUM}; font-size: 10px; font-weight: {800 if hi else 600}; color: {BLUE if hi else FAINT}; text-align: center; white-space: nowrap'), 'div')
    s += rect(64, Y0 - 2, 1152, 2, INK)
    for k in range(25):
        s += rect(round(X0 + k * WK), Y0, 1, 7 * RH, '#eef0f3')
    bars = [('사양 확정', C_J, 0, 3, '사양서', False), ('설정 · 런처 개발', C_S, 2, 9, '부팅 · 홈 화면 · 설정 잠금', False),
            ('부모 앱 · 연동 개발', C_U, 3, 12, '부모 앱 · 위치 · 사용 시간', False), ('내부 검증 (EVT)', C_S, 8, 12, '기능 · 신뢰성', True),
            ('망 연동 · 인증 시험', C_J, 11, 17, '망 연동 · 인증 시험', True), ('시험 생산 · 양산', C_S, 15, 21, '시험 생산 → 양산', False),
            ('초도 출고 · 매장 배포', C_U, 20, 24, '초도 물량', False)]
    for i, (nm, c, a, e, t, g) in enumerate(bars):
        y = Y0 + i * RH
        s += b.tb(nm, ab(64, y, 196, RH, 'font-size: 13px; font-weight: 800; display: flex; align-items: center; white-space: nowrap'), 'div')
        bx, bw = round(X0 + a * WK) + 2, round((e - a) * WK) - 4
        s += b.tb(t, ab(bx, y + 4, bw, RH - 8, f'box-sizing: border-box; border-radius: 5px; background: {c}; color: {INK if c == C_U else "#ffffff"}; font-size: 11px; font-weight: 800; padding: 0 8px; display: flex; align-items: center; white-space: nowrap; overflow: hidden'), 'div')
        if g:
            s += b.tb('✓ 게이트', ab(bx + bw + 6, y + 5, 64, RH - 10, f'box-sizing: border-box; border-radius: 999px; border: 1.2px solid {INK}; background: #ffffff; font-size: 10.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
        s += rect(64, y + RH - 1, 1152, 1, LINE)
    for wkk in (3, 17, 24):
        xx = min(round(X0 + wkk * WK), 1214)
        s += rect(xx, Y0, 1, 7 * RH, '#8e9bd0')
        s += b.tb('◆', ab(min(xx - 8, 1198), Y0 + 7 * RH - 2, 16, 14, f'font-size: 12px; line-height: 14px; color: {INK}; text-align: center'), 'div')
    s += (f'<div style="{ab(64, 618, 1152, 30, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 14px; display: flex; align-items: center; gap: 12px")}">'
          + b.tb('버퍼 [0]주 포함', f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + b.tb('인증 일정이 늘면 출시일만 밀리고 앞 단계는 그대로 · 게이트 = 결함 [0]건 이하', f'font-size: 12.5px; color: {BODY}; white-space: nowrap') + '</div>')
    s += footer(b, foot('U 통신사 · 키즈 전용폰 공동 기획 제안 · 일정은 사양 동결일 기준 예시', '사진은 단계 장면 자리', 'OE'), 31)
    return s


# ---------------------------------------------------------------- SE-A · security requirements with Knox screens
@layout(L, f='L_PH_SE_A', code='PH-SE-A', p='execution', name='보안 요건 대응 · Knox 화면',
        when='금융 · 공공 보안 요건에 답할 때, 창구 단말 사진과 Knox 관리 화면을 크게 두고 핵심 요건 대응표와 충족 현황을 함께',
        pv=['L_SE_A'], sample='T 은행', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 보안 · 규제', '은행 보안 요건 열 가지, 대응 기능과 근거', '요건 · 대응 기능 · 방식(기본 · 설정 · 연동) · 근거 문서', w=900)
    s += (f'<div style="{ab(1000, 104, 216, 32, f"box-sizing: border-box; border-radius: 999px; background: {CHIP}; display: flex; align-items: center; justify-content: center; gap: 10px")}">'
          + b.tb('● 충족 8', f'font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + b.tb('○ 확인 필요 2', f'font-size: 14px; font-weight: 800; color: {INK}; white-space: nowrap') + '</div>')
    # left — photos
    s += photo(b, 'fill.bank_esign', 64, 150, 436, 262, pos='50% 45%', hint='영업점 창구 태블릿 · 전자서식 (고객 영업점 사진으로 교체)', radius=12)
    s += tag_on(b, 'T 은행 창구 태블릿', 76, 162)
    s += label_on(b, '요건 2 · 3 · 6 적용', '업무 영역 안에서만 열리는 전자서식', 76, 350, 300, lines=1)
    s += photo(b, 'fill.km_console', 64, 424, 212, 224, pos='40% 0%', hint='Knox Manage 관리 콘솔 화면 (실제 정책 화면으로 교체)', radius=12)
    s += tag_on(b, 'Knox Manage · 요건 1 · 8', 74, 606)
    s += photo(b, 'fill.knox_vault', 288, 424, 212, 224, pos='50% 40%', hint='Knox Vault 보안 칩 비주얼', radius=12)
    s += tag_on(b, 'Knox Vault · 요건 6', 298, 606)
    # right — table (7 of 10)
    X = [524, 556, 742, 950, 1030, 1108]
    W = [28, 182, 204, 76, 74, 108]
    for x, w, t, c in zip(X, W, ['#', '보안 요건 · 출처', '대응 기능', '방식', '근거', '상태'], [MUTED, MUTED, BLUE, MUTED, MUTED, MUTED]):
        s += th(b, t, x, 152, w, c)
    s += rect(524, 178, 692, 2, INK)
    rows = [('1', '분실 시 원격 잠금 · 삭제', '내부 규정', 'Knox Suite 원격 잠금 · 초기화', ('설정', 'soft'), True),
            ('2', '업무 · 개인 영역 분리', '내부 규정', 'Knox 업무 프로필', ('설정', 'soft'), True),
            ('3', '화면 캡처 · USB 차단', '내부 규정', '기기 정책 제한', ('설정', 'soft'), True),
            ('5', '내부망 접속 · VPN', '감독 기준', 'VPN 연동', ('연동', 'gray'), False),
            ('6', '저장 데이터 암호화', '감독 기준', '기기 암호화 · Knox Vault', ('기본', 'fill'), True),
            ('8', '접근 · 변경 기록', '감독 기준', '관리 콘솔 감사 로그', ('기본', 'fill'), True),
            ('9', '기기 인증서', '내부 규정', '인증서 배포', ('연동', 'gray'), False)]
    RH = 54
    for i, (n, req, src, fn, (m, mk), ok) in enumerate(rows):
        y = 180 + i * RH
        if not ok: s += rect(524, y, 692, RH - 1, SOFT)
        s += cell(b, n, X[0], y, W[0], RH, 14, 800, BLUE, extra=NUM)
        s += (f'<div style="{ab(X[1], y, W[1], RH, "display: flex; flex-direction: column; justify-content: center; gap: 1px")}">'
              + b.tb(req, 'font-size: 14px; font-weight: 800; line-height: 20px; white-space: nowrap')
              + b.tb(src, f'font-size: 11px; line-height: 15px; color: {INK if src == "감독 기준" else MUTED}; font-weight: {700 if src == "감독 기준" else 400}; white-space: nowrap') + '</div>')
        s += cell(b, fn, X[2], y, W[2], RH, 13, 400, INK)
        s += f'<div style="{ab(X[3], y, W[3], RH, "display: flex; align-items: center")}">' + mchip(b, m, mk) + '</div>'
        s += cell(b, 'p.[00]', X[4], y, W[4], RH, 12.5, 700, BODY, extra=NUM)
        if ok:
            s += cell(b, '● 충족', X[5], y, W[5], RH, 13, 800, BLUE)
        else:
            s += f'<div style="{ab(X[5], y, W[5], RH, "display: flex; align-items: center")}">' + mchip(b, '○ 확인 필요', 'line') + '</div>'
        s += rect(524, y + RH - 1, 692, 1, LINE)
    s += (f'<div style="{ab(524, 568, 692, 36, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 14px; display: flex; align-items: center; gap: 10px")}">'
          + lab(b, '+ 3항목 · 충족', BLUE, 12.5) + b.tb('허용 앱만 설치 · OS 업데이트 통제 · 반납 · 폐기 초기화 — 전체 표 부록 p.[00]', f'font-size: 12.5px; color: {BODY}; white-space: nowrap') + '</div>')
    s += (f'<div style="{ab(524, 616, 692, 24, "display: flex; align-items: center; gap: 7px")}">'
          + lab(b, '방식', INK, 12) + mchip(b, '기본', 'fill') + b.tb('단말 · 콘솔 기본 탑재', f'font-size: 12px; color: {BODY}; white-space: nowrap')
          + mchip(b, '설정', 'soft') + b.tb('Knox Suite 정책', f'font-size: 12px; color: {BODY}; white-space: nowrap')
          + mchip(b, '연동', 'gray') + b.tb('은행 시스템 연동 · 정보보호팀 협의', f'font-size: 12px; color: {BODY}; white-space: nowrap') + '</div>')
    s += footer(b, foot('T 은행 · 영업점 디지털 창구 제안 · 요건 출처: 은행 내부 보안 규정 · 감독 기준 [확인 필요]', '근거 = 기술 문서 쪽수', 'FN'), 32)
    return s


# ---------------------------------------------------------------- SE-C · personal data flow with display photo
@layout(L, f='L_PH_SE_C', code='PH-SE-C', p='execution', name='개인정보 처리 흐름 · 화면 사진',
        when='수집부터 파기까지 개인정보 흐름을 보여줄 때, 이름이 가려져 나오는 실제 대기 화면을 사진으로 크게 증명하며',
        pv=['L_SE_C'], sample='B 병원', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 보안 · 규제', '환자 이름은 화면에 이렇게만 나옵니다', '수집 → 전송 → 표시 → 저장 → 파기 · 단계마다 무엇을 · 어디서 · 누가 · 얼마나 · 어떻게 보호', w=1152)
    small = {1: ('fill.hosp_recep', '50% 40%', '수집', [('무엇을', '대기 번호 · 이름'), ('어디서 · 누가', 'HIS · 원무과'), ('보관', '—'), ('보호', '병원 내부망')], '접수 · 원무 창구 (고객 병원 사진으로 교체)'),
             2: ('r4.md-doctor-monitor', '55% 40%', '전송', [('무엇을', '번호 · 가린 이름'), ('어디서 · 누가', 'HIS → 사내 서버'), ('보관', '—'), ('보호', '암호화 전송')], '병원 정보 시스템 연동 장면 (서버 · 연동 사진으로 교체)'),
             4: ('ph.of-desk-control', '50% 70%', '저장', [('무엇을', '호출 기록'), ('어디서 · 누가', '사내 서버 · 관리자 2명'), ('보관', '당일'), ('보호', '접근 기록')], '관리자 PC · 서버 관리 장면 (고객 전산실 사진으로 교체)'),
             5: ('ph.md-ward-night', '50% 50%', '파기', [('무엇을', '이름 · 기록'), ('어디서 · 누가', '사내 서버 · 자동'), ('보관', '매일 자정'), ('보호', '복구 불가 삭제')], '자정 자동 삭제 — 야간 병원 장면 (서버실 · 관리 화면으로 교체)')}
    xs = {1: 64, 2: 252, 3: 440, 4: 856, 5: 1044}
    for n, (pid, pos, t, fields, hint) in small.items():
        x = xs[n]
        s += box(x, 150, 172, 348, SOFT, 12)
        s += photo(b, pid, x, 150, 172, 140, pos=pos, hint=hint, radius=12)
        inner = row(numtag(b, str(n), 22) + b.tb(t, 'font-size: 16px; font-weight: 800; white-space: nowrap'), 8)
        for k, v in fields:
            inner += ('<span style="display: flex; flex-direction: column; gap: 0">' + b.tb(k, f'font-size: 11px; line-height: 15px; color: {MUTED}; white-space: nowrap')
                      + b.tb(v, f'font-size: 13px; font-weight: 800; line-height: 19px; color: {BLUE if k == "보호" else INK}; white-space: nowrap') + '</span>')
        s += f'<div style="{ab(x + 12, 300, 148, 190, "display: flex; flex-direction: column; gap: 8px")}">' + inner + '</div>'
    for gx in (236, 424, 840, 1028):
        s += ARR(gx, 210, 16, 20, 15, BLUE, '›')
    # big — display step
    s += photo(b, 'fill.hosp_wait', 440, 150, 400, 348, pos='50% 30%', hint='대기실 안내 화면을 보는 환자 (고객 병원 대기실 사진으로 교체)', radius=12)
    s += f'<div style="{ab(440, 150, 400, 348, f"box-sizing: border-box; border-radius: 12px; border: 3px solid {BLUE}")}"></div>'
    s += (f'<div style="{ab(454, 164, None, 26, "display: flex; align-items: center; gap: 6px")}">'
          + numtag(b, '3', 24) + b.tb('표시 · 대기실 사이니지', f'height: 24px; padding: 0 10px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 12.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap') + '</div>')
    s += glass(b.tb('진료 대기 안내 · 화면 예시', f'font-size: 11px; font-weight: 700; color: {LB}; white-space: nowrap')
               + row(b.tb('김*수', 'font-size: 22px; font-weight: 800; line-height: 30px; color: #ffffff; white-space: nowrap')
                     + b.tb('A-023', f'{NUM}; font-size: 18px; font-weight: 800; color: {LB}; white-space: nowrap')
                     + b.tb('진료실 3', 'font-size: 15px; font-weight: 700; color: #ffffff; white-space: nowrap'), 12),
               500, 234, 280, None, pad='10px 16px', gap=2)
    flds = [('무엇을', '김*수 · 번호'), ('누가', '누구나 보임'), ('보관', '호출 후 [00]초'), ('보호', '가운데 글자 가림')]
    g = ''.join('<span style="display: flex; flex-direction: column; gap: 0; width: 170px">' + b.tb(k, f'font-size: 11px; line-height: 15px; color: {LB}; white-space: nowrap')
                + b.tb(v, f'font-size: 13.5px; font-weight: 800; line-height: 19px; color: #ffffff; white-space: nowrap') + '</span>' for k, v in flds)
    s += glass(f'<span style="display: flex; flex-wrap: wrap; row-gap: 6px; column-gap: 8px">{g}</span>', 452, 404, 376, None, pad='10px 14px')
    # bottom — not on screen + rules
    s += (f'<div style="{ab(64, 514, 560, 134, f"box-sizing: border-box; border-radius: 14px; border: 1.5px solid {INK}; padding: 14px 20px; display: flex; flex-direction: column; gap: 10px")}">'
          + row(b.tb('화면에 나오지 않는 것', 'font-size: 16px; font-weight: 800; white-space: nowrap') + '<span style="margin-left: auto"></span>'
                + b.tb('HIS에만 있고, 사이니지로는 보내지 않습니다', f'font-size: 12.5px; color: {MUTED}; white-space: nowrap'), 8)
          + '<span style="height: 1px; background: #dfe2e7"></span>'
          + '<span style="display: grid; grid-template-columns: 1fr 1fr; row-gap: 10px; column-gap: 16px">'
          + ''.join(row(b.tb('⊗', f'font-size: 16px; line-height: 20px; color: {INK}') + b.tb(t, 'font-size: 14px; font-weight: 800; white-space: nowrap'), 8)
                    for t in ['주민번호 · 생년월일', '진료과 상세 · 병명', '전화번호', '보호자 정보']) + '</span></div>')
    s += (f'<div style="{ab(640, 514, 576, 134, f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; padding: 14px 20px; display: flex; flex-direction: column; gap: 10px")}">'
          + b.tb('관련 기준', 'font-size: 16px; font-weight: 800; white-space: nowrap')
          + row(''.join(b.tb(t, f'height: 28px; padding: 0 12px; border-radius: 999px; background: #ffffff; border: 1px solid #d3d7de; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
                        for t in ['개인정보 보호법 [확인 필요]', '의료법 [확인 필요]', '병원 내부 지침']), 8)
          + b.tb('세부 조항 · 보관 기간은 병원 정보보호 담당과 확인 후 확정합니다', f'font-size: 12.5px; color: {BODY}; white-space: nowrap') + '</div>')
    s += footer(b, foot('B 병원 · 환자 안내 시스템 제안 · 관련 법령 · 병원 내부 지침 확인 필요', '화면 이름은 예시', 'MD'), 33)
    return s


# ---------------------------------------------------------------- TO-A · training plan with people photos per target
@layout(L, f='L_PH_TO_A', code='PH-TO-A', p='execution', name='교육 계획 · 대상별 사진',
        when='쓰는 사람마다 필요한 교육이 다를 때, 대상 행마다 그 사람이 일하는 장면 사진을 두고 과정 · 시기를 함께',
        pv=['L_TO_A'], sample='E 대학교', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 교육 · 이관', '쓰는 사람마다, 필요한 만큼만 가르칩니다', '대상 × 과정 · 필수 ● · 선택 ○ · 시기와 방식', w=1152)
    courses = [('기본 사용', '30분'), ('수업 활용', '2시간'), ('관리 콘솔', '4시간'), ('장애 대응', '2시간'), ('영상 매뉴얼', '상시')]
    CX0, CW = 356, 93.6
    s += th(b, '대상 · 인원', 64, 182, 200)
    for k, (c, t) in enumerate(courses):
        x = round(CX0 + k * CW)
        s += (f'<div style="{ab(x, 152, round(CW), 50, "display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px")}">'
              + b.tb(c, 'font-size: 14px; font-weight: 800; white-space: nowrap') + b.tb(t, f'{NUM}; font-size: 12px; font-weight: 700; color: {MUTED}; white-space: nowrap') + '</div>')
    s += rect(64, 206, 760, 2, INK)
    R = [('fill.class_flip', '50% 30%', '교수진', '[000]명', '강의실 디스플레이 · 전자칠판', 'FF--O'),
         ('ph.ed-charging', '50% 40%', '조교', '[00]명', '수업 준비 · 기기 점검', 'FF-FO'),
         ('r4.ed-ac-check', '50% 30%', '시설 · 운영팀', '[0]명', '냉난방 · 사이니지 운영', 'F-FFO'),
         ('ph.of-control-room', '50% 60%', 'IT 관리자', '[0]명', '관리 콘솔 · 계정 · 장애', 'FOFFO'),
         ('r4.ed-tab-class', '50% 45%', '학생 · 자율', '', '스스로 찾아보는 사용법', 'O---O')]
    hints = ['강의하는 교수 (고객 강의실 사진으로 교체)', '기기를 점검하는 조교 (고객 사진으로 교체)', '설비를 점검하는 시설팀 (고객 사진으로 교체)',
             '관리 화면 앞 IT 담당 (고객 전산실 사진으로 교체)', '태블릿을 쓰는 학생 (고객 사진으로 교체)']
    for i, (pid, pos, nm, cnt, d, mk) in enumerate(R):
        y = 214 + i * 84
        s += photo(b, pid, 64, y, 280, 76, pos=pos, hint=hints[i], radius=10)
        s += glass(row(b.tb(nm, 'font-size: 14px; font-weight: 800; line-height: 20px; color: #ffffff; white-space: nowrap')
                       + (b.tb(cnt, f'{NUM}; font-size: 13px; font-weight: 800; color: {LB}; white-space: nowrap') if cnt else ''), 6)
                   + b.tb(d, f'font-size: 11.5px; line-height: 16px; color: {LT}; white-space: nowrap'), 70, y + 6, None, None, pad='6px 10px', gap=1, extra='border-radius: 8px')
        for k, m in enumerate(mk):
            cx = round(CX0 + k * CW + CW / 2)
            if m == 'F': s += rect(cx - 9, y + 29, 18, 18, BLUE, 9)
            elif m == 'O': s += rect(cx - 9, y + 29, 18, 18, '#ffffff', 9, 'box-sizing: border-box; border: 2px solid #7d8fd8')
            else: s += rect(cx - 8, y + 37, 16, 2, '#d3d7de')
        s += rect(356, y + 80, 468, 1, LINE)
    s += (f'<div style="{ab(64, 630, 760, 18, "display: flex; align-items: center; gap: 8px")}">'
          + b.tb('● 필수 · ○ 선택 · — 해당 없음', f'font-size: 12px; color: {BODY}; white-space: nowrap') + '<span style="margin-left: auto"></span>'
          + b.tb('과정 시간은 1회 기준', f'font-size: 12px; color: {MUTED}; white-space: nowrap') + '</div>')
    # right — when · how
    s += box(848, 150, 368, 498, SOFT, 14)
    s += photo(b, 'r4.ed-teacher-board', 848, 150, 368, 200, pos='50% 35%', hint='현장 실습 교육 장면 (고객 강의실 사진으로 교체)', radius=14)
    s += tag_on(b, '개강 전 · 현장 실습', 860, 162)
    st = [('개강 전 2주', '집중 교육', '필수 과정 · 현장 실습 위주'), ('학기 중', '주 1회 오피스아워', '현장 질문 · 수업 활용 코칭'), ('방학', '심화 과정', '관리 콘솔 · 장애 대응 심화')]
    for k, (w, t, d) in enumerate(st):
        y = 366 + k * 56
        s += (f'<div style="{ab(868, y, 330, 50, "display: flex; align-items: flex-start; gap: 10px")}">' + numtag(b, str(k + 1), 24)
              + '<span style="display: flex; flex-direction: column; gap: 0">' + row(lab(b, w, BLUE, 12) + b.tb(t, 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap'), 8)
              + b.tb(d, f'font-size: 12.5px; line-height: 18px; color: {BODY}; white-space: nowrap') + '</span></div>')
    s += (f'<div style="{ab(868, 538, 330, 22, "display: flex; align-items: center; gap: 5px")}">' + lab(b, '방식', INK, 12)
          + ''.join(mchip(b, t, 'line' if t == '현장 실습' else 'gray') for t in ['현장 실습', '온라인', '영상', 'QR 매뉴얼']) + '</div>')
    s += card(row(b.tb('교육 이수 확인 → 운영 이관 조건', 'font-size: 14px; font-weight: 800; white-space: nowrap'), 6)
              + row(b.tb('이수 기록은 이관 체크리스트로', f'font-size: 12.5px; color: {BODY}; white-space: nowrap') + mchip(b, 'TO-B', 'soft'), 8),
              868, 572, 328, 64, bg='#ffffff', pad='10px 14px', gap=4, border=BLUE)
    s += footer(b, foot('E 대학교 · 스마트 캠퍼스 구축 제안 · 인원은 학교 제공 기준 예시', '사진은 대상별 장면 자리', 'ED'), 44)
    return s


# ---------------------------------------------------------------- TO-B · handover 3 stages with stage photos
@layout(L, f='L_PH_TO_B', code='PH-TO-B', p='execution', name='운영 이관 3단계 · 단계 사진',
        when='구축 후 고객 운영으로 넘길 때, 검수 · 공동 운영 · 이관 후 운영 장면을 단계 카드 머리 사진으로 보여주며 넘어가는 기준과 산출물을 함께',
        pv=['L_TO_B'], sample='S 지자체', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 교육 · 이관', '구축팀이 떠나도 멈추지 않도록, 세 단계로 넘깁니다', '구축 완료 → 안정화(공동 운영) → 이관 · 단계마다 산출물과 넘어가는 기준', w=1152)
    st = [('ph.pb-control', '50% 45%', '1 · 구축 직후', '담당 삼성 · SI', '현장 설치부터 검수 시험까지', '구축 완료 · 검수',
           ['설치 · 시운전 완료', '검수 시험 통과', '자산 대장 작성', '관리자 계정 발급'], '① → ② 넘어가는 기준', '검수 확인서 서명', SOFT, '구축을 마친 상황실 · 검수 시험 (고객 현장 사진으로 교체)'),
          ('ph.vn-control-staff', '60% 50%', '2 · 검수 후 [0]주', '담당 공동', '삼성 · 고객 담당자가 함께 대응', '안정화 · [0]주 공동 운영',
           ['장애 대응 절차 리허설', '운영 매뉴얼 검토', '백업 · 복구 시험', '운영자 교육 이수'], '② → ③ 넘어가는 기준', '장애 [0]건 이하 [0]주 연속', '#eef1fb', '공동 운영 관제 장면 (고객 상황실 사진으로 교체)'),
          ('r4.pb-traffic-ctl', '50% 40%', '3 · 이관 이후', '담당 S 지자체', '일상 운영은 S 지자체, 정비는 삼성', '이관 · 고객 운영 + 삼성 유지보수',
           ['계정 · 권한 인계', '모니터링 알림 수신자 변경', '유지보수 계약 개시', '월간 리포트 시작'], '③ 완료 기준', '이관 확인서', '#ffffff', '이관 후 고객 상황실 운영 (고객 상황실 사진으로 교체)')]
    for i, (pid, pos, tg, own, sub, ttl, checks, ct, cv, bg, hint) in enumerate(st):
        x = 64 + i * 392
        s += box(x, 150, 368, 422, bg, 14, f'border: 1.5px solid {BLUE}' if i == 2 else '')
        s += photo(b, pid, x, 150, 368, 196, pos=pos, hint=hint, radius=14)
        s += tag_on(b, tg, x + 12, 162)
        s += b.tb(own, ab(x + 356 - 8 * len(own) - 40, 162, None, None, f'border-radius: 999px; background: {BLUE if i == 1 else ("#ffffff" if i == 0 else INK)}; color: {BLUE if i == 0 else "#ffffff"}; font-size: 12px; font-weight: 800; padding: 5px 11px; white-space: nowrap'), 'div')
        s += label_on(b, sub, ttl, x + 12, 282, 344, lines=1)
        ck = ''.join(row(b.tb('✓', f'width: 18px; height: 18px; flex-shrink: 0; border-radius: 4px; box-sizing: border-box; {"background: " + BLUE + "; color: #ffffff" if i < 2 else "border: 1.5px solid " + BLUE + "; color: " + BLUE}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center')
                         + b.tb(c, 'font-size: 14px; color: #222831; white-space: nowrap'), 10) for c in checks)
        s += f'<div style="{ab(x + 20, 364, 330, 120, "display: flex; flex-direction: column; gap: 10px")}">' + ck + '</div>'
        s += card(b.tb(ct, f'font-size: 11.5px; font-weight: 800; color: {BLUE if i == 2 else BODY}; white-space: nowrap')
                  + b.tb(cv, 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap'),
                  x + 16, 496, 336, 60, bg=CHIP if i == 2 else '#ffffff', pad='8px 14px', gap=2, border=None if i == 2 else '#d6dbe6')
    for gx in (432, 824):
        s += b.tb('›', ab(gx - 2, 346, 28, 28, f'box-sizing: border-box; border-radius: 50%; background: #ffffff; border: 1.5px solid #b9c4ee; color: {BLUE}; font-size: 18px; font-weight: 800; display: flex; align-items: center; justify-content: center; line-height: 18px'), 'div')
    docs = ['운영 매뉴얼', '장애 대응 절차서', '자산 대장', '계정 인계서', '교육 이수 기록', '백업 · 복구 결과서']
    s += (f'<div style="{ab(64, 588, 1152, 60, f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; padding: 0 20px; display: flex; align-items: center; gap: 14px")}">'
          + '<span style="display: flex; flex-direction: column; gap: 0; flex-shrink: 0">' + b.tb('산출물', 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap')
          + b.tb('6종 · 이관 시 인계', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + '</span>'
          + '<span style="width: 1px; height: 32px; background: #d3d7de; flex-shrink: 0"></span>'
          + '<span style="display: flex; align-items: center; justify-content: space-between; flex: 1">'
          + ''.join(b.tb(f'{k + 1}  {d}', f'height: 30px; padding: 0 12px; border-radius: 999px; background: #ffffff; border: 1px solid #d3d7de; font-size: 13px; font-weight: 800; color: {INK}; display: inline-flex; align-items: center; white-space: nowrap') for k, d in enumerate(docs))
          + '</span></div>')
    s += footer(b, foot('S 지자체 · 통합 안내 · 관제 고도화 사업 제안', '사진은 단계 장면 자리', 'PB'), 44)
    return s


# ---------------------------------------------------------------- MT-A · maintenance calendar with equipment photos
@layout(L, f='L_PH_MT_A', code='PH-MT-A', p='execution', name='유지보수 점검 캘린더 · 설비 사진',
        when='1년 점검 · 시즌 케어 일정을 보여줄 때, 설비 행마다 그 설비 사진을 두고 점검 엔지니어 장면으로 서비스 품질을 함께',
        pv=['L_MT_A'], sample='N 호텔', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 유지보수', '성수기 전에 먼저 점검합니다 — 1년 점검 캘린더', '설비 × 월 · 정기 점검 · 필터 세척 · 시즌 전 집중 점검 · 원격 진단 상시', w=1152)
    X0, MW, Y0, RH = 280, 50, 204, 82
    peak = (1, 7, 8, 12)
    for m in peak:
        s += rect(X0 + (m - 1) * MW, 150, MW, Y0 + 5 * RH - 150, CHIP, 0)
    for m in (1, 7, 12):
        w = MW * (2 if m == 7 else 1)
        s += b.tb('성수기', ab(X0 + (m - 1) * MW + w // 2 - 24, 154, 48, 20, f'border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
    s += th(b, '설비 · 수량', 64, 178, 200)
    for m in range(1, 13):
        s += b.tb(f'{m}월', ab(X0 + (m - 1) * MW, 178, MW, 20, f'font-size: 12.5px; font-weight: 800; color: {BLUE if m in peak else BODY}; text-align: center; white-space: nowrap'), 'div')
    s += rect(64, Y0 - 3, 824, 2, INK)
    R = [('fill.ht_lounge', '55% 6%', '시스템에어컨 실내기', '[000]대 · 객실 · 공용부', {2: 'D', 4: 'D', 6: 'SD', 8: 'D', 10: 'D', 11: 'S', 12: 'D'}, 'L'),
         ('ph.of-rooftop-odu', '50% 55%', '실외기 DVM S2', '[00]대 · 옥상', {3: 'C', 6: 'S', 9: 'C', 11: 'S'}, 'L'),
         ('ph.ht-room-tv2', '20% 30%', '객실 TV · LYNK Cloud', '[000]대 · 전 객실', {4: 'C', 10: 'C'}, 'R'),
         ('ph.ht-lobby-signage', '80% 55%', '로비 · 연회 사이니지', '[00]대 · 로비 · 연회장', {3: 'C', 6: 'C', 9: 'C', 11: 'C'}, 'L'),
         ('ph.ht-laundry', '30% 62%', '세탁 · 주방 가전', '[00]대 · 세탁실 · 주방', {2: 'C', 5: 'C', 9: 'C', 11: 'C'}, 'R')]
    hints = ['공용부 천장 360 실내기 (고객 객실 · 공용부 사진으로 교체)', '옥상 실외기 (고객 옥상 사진으로 교체)', '객실 TV (고객 객실 사진으로 교체)', '로비 사이니지 (고객 로비 사진으로 교체)', '세탁실 가전 (고객 세탁실 사진으로 교체)']
    for i, (pid, pos, nm, cnt, marks, side) in enumerate(R):
        y = Y0 + i * RH
        s += photo(b, pid, 64, y + 4, 204, RH - 8, pos=pos, hint=hints[i], radius=10)
        s += glass(b.tb(nm, 'font-size: 13px; font-weight: 800; line-height: 18px; color: #ffffff; white-space: nowrap')
                   + b.tb(cnt, f'font-size: 11px; line-height: 15px; color: {LB}; white-space: nowrap'), 70 if side == 'L' else 106, y + 10, None if side == 'L' else 156, None, pad='5px 9px', gap=0, extra='border-radius: 8px')
        cy = y + RH // 2
        s += rect(X0, cy - 1, 12 * MW, 2, '#9fb0e6')
        for m, kinds in marks.items():
            cx = X0 + (m - 1) * MW + MW // 2
            offs = [-10, 10] if len(kinds) == 2 else [0]
            for k, o in zip(kinds, offs):
                if k == 'C': s += rect(cx + o - 8, cy - 8, 16, 16, BLUE, 8, 'box-sizing: border-box; border: 2px solid #ffffff')
                elif k == 'D': s += rect(cx + o - 7, cy - 7, 14, 14, '#b9c4ee', 2, 'box-sizing: border-box; border: 2px solid #ffffff; transform: rotate(45deg)')
                else: s += b.tb('★', ab(cx + o - 9, cy - 10, 18, 20, f'font-size: 15px; line-height: 20px; color: {INK}; text-align: center'), 'div')
        s += rect(64, y + RH - 1, 824, 1, LINE)
    lg = (row(rect(0, 0, 12, 12, BLUE, 6).replace('position: absolute; left: 0px; top: 0px; ', '') + b.tb('정기 점검', f'font-size: 12px; color: {BODY}; white-space: nowrap'), 5)
          + row(rect(0, 0, 11, 11, '#b9c4ee', 2, 'transform: rotate(45deg)').replace('position: absolute; left: 0px; top: 0px; ', '') + b.tb('필터 세척', f'font-size: 12px; color: {BODY}; white-space: nowrap'), 5)
          + b.tb('★ 시즌 전 집중 점검', f'font-size: 12px; color: {BODY}; white-space: nowrap')
          + row(rect(0, 0, 16, 2, '#9fb0e6').replace('position: absolute; left: 0px; top: 0px; ', '') + b.tb('원격 진단 · 상시', f'font-size: 12px; color: {BODY}; white-space: nowrap'), 5))
    s += f'<div style="{ab(64, 624, 824, 22, "display: flex; align-items: center; gap: 16px")}">' + lg + '</div>'
    # right — engineer photo + what one visit covers + report
    s += photo(b, 'ph.svc-technician', 908, 150, 308, 292, pos='62% 40%', hint='객실 실내기를 점검하는 엔지니어 (실제 서비스 현장 사진)', radius=14)
    s += label_on(b, '성수기 한 달 전', '6월 · 11월 집중 점검', 920, 380, 220, lines=1)
    chk = [('작동 확인', '전 대수 운전 · 표시'), ('필터', '세척 · 교체 시기'), ('배수', '배수 펌프 · 누수'), ('펌웨어', '최신 버전 적용')]
    g = ''.join('<span style="display: flex; flex-direction: column; gap: 0">' + row(b.tb('✓', f'width: 16px; height: 16px; border-radius: 4px; background: {BLUE}; color: #ffffff; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0')
                + b.tb(t, 'font-size: 13.5px; font-weight: 800; line-height: 20px; white-space: nowrap'), 6)
                + b.tb(d, f'font-size: 11.5px; line-height: 16px; color: {MUTED}; padding-left: 22px; white-space: nowrap') + '</span>' for t, d in chk)
    s += card(b.tb('점검 한 번에 하는 것', 'font-size: 13px; font-weight: 800; color: #222831; white-space: nowrap')
              + f'<span style="display: grid; grid-template-columns: 1fr 1fr; row-gap: 8px; column-gap: 8px">{g}</span>', 908, 452, 308, 124, pad='11px 14px', gap=8)
    s += card(row(lab(b, '리포트', BLUE, 12) + b.tb('매월 [0]일', f'font-size: 18px; font-weight: 800; line-height: 24px; color: {BLUE}; white-space: nowrap'), 8)
              + b.tb('설비별 이상 · 조치 이력', f'font-size: 12.5px; color: {BODY}; white-space: nowrap'), 908, 588, 308, 60, bg=CHIP, pad='8px 14px', gap=2)
    s += footer(b, foot('N 호텔 · 리조트 객실 · 공용부 제안 · 점검 월은 운영 일정 협의로 확정', '사진은 설비 자리', 'HT'), 42)
    return s


# ---------------------------------------------------------------- EX-B · monthly operation report with dashboard screens
@layout(L, f='L_PH_EX_B', code='PH-EX-B', p='execution', p2='effect', name='운영 리포트 · 대시보드 화면 + 월간 지표',
        when='구축 뒤 운영을 어떻게 보고하는지 보여줄 때, 관제 · 대시보드 화면을 크게 두고 월간 지표 넷 · 이번 달 조치 · 받는 사람을 함께',
        pv=['L_MT_A'], sample=CUST['OF'], grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 운영 · 리포트', '매달 한 장으로, 건물이 어떻게 돌아갔는지 보고합니다', '월간 운영 리포트 — 가동률 · 장애 · 에너지 · 콘텐츠 반영 · 이번 달 조치 · 출처: [관제 시스템 집계, 연도]', w=1152)
    # left — KPI 4
    s += (f'<div style="{ab(64, 150, 464, 24, "display: flex; align-items: center; gap: 10px")}">'
          + pill(b, 'C 빌딩 · [0000]년 [00]월 리포트', extra='align-self: center') + b.tb('매월 [0]일 발송 · 지난달과 비교', f'font-size: 12px; color: {MUTED}; white-space: nowrap') + '</div>')
    kp = [('가동률', '[99.0]', '%', '화면 · 공조 설비 전체'), ('장애', '[0]', '건', '평균 복구 [00]분'),
          ('에너지', '[00]', '% 절감', '전년 같은 달 대비'), ('콘텐츠 반영', '[000]', '건', '요청 → 반영 평균 [00]분')]
    for k, (t, v, u, d) in enumerate(kp):
        x, y = 64 + (k % 2) * 238, 184 + (k // 2) * 106
        s += card(lab(b, t, BODY, 12.5) + bignum(b, v, u, size=34) + b.tb(d, f'font-size: 12px; color: {MUTED}; white-space: nowrap'),
                  x, y, 226, 96, bg=SOFT, pad='10px 16px', gap=3)
    acts = [('12층 실내기 필터 경보', '[0]일 만에 세척 완료 · 방문 1회'), ('로비 사이니지 1대 화면 꺼짐', '원격 재시작으로 [00]분 만에 복구'),
            ('야간 공조 운전 시간 조정', '다음 달 에너지 [0]% 추가 절감 예상')]
    inner = row(b.tb('이번 달 조치', 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap') + b.tb('3', f'{NUM}; font-size: 15px; font-weight: 800; color: {BLUE}'), 6)
    for k, (t, d) in enumerate(acts):
        inner += ('<span style="display: flex; align-items: flex-start; gap: 10px">' + numtag(b, str(k + 1), 22)
                  + '<span style="display: flex; flex-direction: column; gap: 0">' + b.tb(t, 'font-size: 14px; font-weight: 800; line-height: 20px; white-space: nowrap')
                  + b.tb(d, f'font-size: 12px; line-height: 17px; color: {BODY}; white-space: nowrap') + '</span></span>')
    s += card(inner, 64, 398, 464, 186, bg='#ffffff', pad='12px 16px', gap=10, border='#d6dbe6')
    # right — screens
    s += photo(b, 'fill.biot_dash', 552, 150, 664, 290, pos='50% 0%', hint='건물 설비 통합 관제 대시보드 (고객 관제 화면 캡처로 교체)', radius=12)
    s += tag_on(b, '설비 가동 · 장애 알림 → 지표 1 · 2', 564, 162)
    s += photo(b, 'fill.stp_kv', 552, 452, 326, 132, pos='50% 50%', hint='에너지 관리 대시보드 (고객 화면 캡처로 교체)', radius=12)
    s += tag_on(b, '에너지 → 지표 3', 562, 548)
    s += photo(b, 'fill.mi_editor', 890, 452, 326, 132, pos='50% 100%', hint='사이니지 콘텐츠 편집 화면과 매장 화면 (고객 화면 캡처로 교체)', radius=12)
    s += tag_on(b, '콘텐츠 반영 → 지표 4', 900, 548)
    # bottom — recipients
    rc = [('본사 총무팀', '경영 요약 1쪽'), ('지점 [00]곳', '지점별 장애 · 조치'), ('시설 관리팀', '설비별 상세 · 다음 달 점검')]
    s += (f'<div style="{ab(64, 596, 1152, 52, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 0 18px; display: flex; align-items: center; gap: 16px")}">'
          + b.tb('리포트 받는 사람', 'font-size: 14px; font-weight: 800; white-space: nowrap')
          + '<span style="width: 1px; height: 26px; background: #d3d7de; flex-shrink: 0"></span>'
          + ''.join(row(b.tb(n, f'height: 28px; padding: 0 12px; border-radius: 999px; background: {CHIP}; color: {BLUE}; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
                        + b.tb(d, f'font-size: 12.5px; color: {BODY}; white-space: nowrap'), 8) for n, d in rc) + '</div>')
    s += footer(b, foot(DEAL['OF'], '지표 값은 자리표시 · 화면은 예시', 'OF'), 43)
    return s
