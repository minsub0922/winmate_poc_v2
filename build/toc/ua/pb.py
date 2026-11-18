# 당사의 이해 · 공공 · 교통 · 국방 — 기관 · 이용 규모 → 예산 · 조달 일정 → 인증 · 보안 요건 → 서비스 공간
from kit import *
import compete

CLUSTER = dict(id='PB', name='공공 · 교통 · 국방', cust='공공기관 청사', ai='AI 스마트 청사', verticals=['pb_agency', 'pb_transport', 'mi_military'],
               goal='기관과 하루 이용 규모, 예산이 서고 계약이 끝나기까지의 일정, 입찰 전에 갖춰야 하는 인증 · 보안 요건, 시민을 만나는 공간을 먼저 짚는다')


def org():
    s = sheet('L_TOC_UA_PB_ORG', '기관 · 이용 규모', '어떤 기관이고, 하루에 몇 명이 찾는지')
    chiprow(s, 64, 128, ['중앙 부처', '지방 자치 단체', '공공기관 · 공단', '교통 운영 기관', '군 기관'], 1, 'k')
    bluepanel(s, 64, 196, 400, 452, 'users', '하루 이용객 · 민원인', '명', 'u', [('문을 여는 시간', '시간'), ('쉬지 않고 도는 구역', '곳')])
    for i, (lb, un, ic) in enumerate([('청사 · 역사', '곳', 'building'), ('근무 인원', '명', 'person'), ('민원 · 안내 창구', '개', 'doc'), ('회의실 · 상황실', '실', 'monitor')]):
        tile(s, 488 + (i % 2) * 372, 196 + (i // 2) * 234, 356, 218, ic, lb, un, f't{i}')
    return done(s, CLUSTER, 3, '기관 · 이용 규모', '기관 유형 칩 5 + 대표 숫자 3 + 숫자 4', '기관 유형과 하루 이용객 · 운영 시간 · 청사 · 창구 수를 짚을 때')


def fiscal():
    s = sheet('L_TOC_UA_PB_FISCAL', '예산 · 조달 일정', '예산이 서고 계약이 끝나기까지, 한 해의 흐름')
    for i, (nm, mo) in enumerate([('예산 요구', f'전년 {Z}월'), ('예산 확정', f'전년 {Z}월'), ('발주 계획', f'{Z}월'), ('입찰 · 견적', f'{Z}월'), ('계약', f'{Z}월'), ('납품 · 검수', f'{Z}월')]):
        x = 64 + i * 195.2
        s.box(x, 128, 176, 172, bg=SURF if i < 2 else TINT, r=16)
        s.num2(x + 20, 148, i + 1, 36, 16, bg=GRAY if i < 2 else BLUE)
        s.t(x + 20, 204, 140, nm, 20, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        s.t(x + 20, 250, 140, mo, 18, 800, GRAY if i < 2 else BLUE, 1.3, name=f'm{i}', nowrap=True)
        if i < 5: s.arrow(x + 177, 205, 18, DASH)
    for i, (nm, ic, ln) in enumerate([('종합쇼핑몰 구매', 'cart', '등록된 계약 제품을 바로 구매'), ('단가 계약', 'tag', '단가가 정해진 품목을 납품 요구'), ('입찰 · 협상 계약', 'scale', '제안서를 평가해 사업자 선정'), ('혁신 제품 · 시범 구매', 'spark', '지정 제품을 수의 계약으로')]):
        x = 64 + i * 294
        s.box(x, 324, 270, 324, bg=WHITE, r=18, border=f'1px solid {LINE}')
        s.ico(x + 24, 348, ic, size=56, r=16)
        s.t(x + 24, 422, 222, nm, 20, 800, INK, 1.3, name=f'k{i}', nowrap=True)
        s.t(x + 24, 460, 222, ln, 16, 700, GRAY, 1.4, name=f'kl{i}', clamp=2)
        s.hline(x + 24, 532, 222)
        small(s, x + 24, 548, '이 기관의 구매 비중', MUTE, 222)
        numu(s, x + 24, 576, 222, Z, '%', 40, 18, name=f'kv{i}')
    return done(s, CLUSTER, 4, '예산 · 조달 일정', '일정 6 단계 + 조달 방식 4', '예산 요구부터 납품 · 검수까지의 달과, 이 기관이 쓰는 조달 방식 비중을 짚을 때')


def cert():
    s = sheet('L_TOC_UA_PB_CERT', '인증 · 보안 요건', '입찰 전에 갖춰야 하는 인증과 보안 요건')
    for x, lb in ((146, '구분'), (300, '갖춰야 하는 것'), (800, '필요한 정도'), (968, '확인할 곳')):
        small(s, x, 134, lb, MUTE, 200)
    rows = [('보안', 'lock', '정보 보호 제품 인증 · 보안 적합성 검증', '필수', '제안 요청서 · 보안 담당'), ('품질 · 안전', 'shield', '국가 표준 · 안전 인증 · 전자파 적합', '필수', '구매 규격서'),
            ('친환경', 'leaf', '에너지 효율 등급 · 녹색 제품', '가점', '평가 기준표'), ('접근성', 'person', '장애인 · 고령자도 쓰는 무인 단말', '필수', '발주 부서'),
            ('조달 자격', 'doc', '직접 생산 · 경쟁 제품 지정 여부', '해당할 때', '조달 고시')]
    for r, (kd, ic, what, need, where) in enumerate(rows):
        y = 164 + r * 97
        s.box(64, y, 1152, 85, bg=SURF, r=16)
        s.ico(84, y + 18, ic, size=48, r=14, bg=WHITE)
        s.t(146, y + 29, 140, kd, 20, 800, INK, 1.3, name=f'k{r}', nowrap=True)
        s.t(300, y + 30, 480, what, 18, 700, INK2, 1.3, name=f'w{r}', nowrap=True)
        s.t(800, y + 29, 150, need, 20, 800, BLUE, 1.3, name=f'n{r}', nowrap=True)
        s.t(968, y + 30, 228, where, 18, 700, INK2, 1.3, name=f'c{r}', nowrap=True)
    return done(s, CLUSTER, 5, '인증 · 보안 요건', '요건 5 × 갖춰야 하는 것 · 필요한 정도 · 확인할 곳 표', '입찰 전에 갖춰야 하는 인증 · 보안 요건과 확인할 문서 · 부서를 짚을 때')


def space():
    s = sheet('L_TOC_UA_PB_SPACE', '서비스 공간', '시민을 만나는 공간과 쉬지 않는 공간')
    data = [('민원실', 'users', 9, 18), ('종합 상황실', 'monitor', 0, 24), ('회의실 · 대강당', 'mic', 9, 18), ('로비 · 안내', 'pin', 7, 20), ('승강장 · 대합실', 'bus', 5, 24), ('교육장 · 홍보관', 'book', 9, 18)]
    for i, (nm, ic, a, b) in enumerate(data):
        x = 64 + (i % 3) * 392; y = 128 + (i // 3) * 270; allday = b - a >= 24
        s.box(x, y, 368, 250, bg=TINT if allday else SURF, r=18)
        s.ico(x + 24, y + 24, ic, size=56, r=16, bg=WHITE)
        s.t(x + 96, y + 38, 250, nm, 20, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        numu(s, x + 24, y + 100, 200, Z, '곳', 48, 20, name=f'v{i}')
        daytrack(s, x + 24, y + 176, 320, a, b, 12, ticks=False)
        s.t(x + 24, y + 204, 200, '24시간' if allday else f'{Z}시 – {Z}시', 18, 800, BLUE, 1.3, name=f'h{i}', nowrap=True)
        small(s, x + 224, y + 207, '문 여는 시간', MUTE, 120, 'right')
    return done(s, CLUSTER, 6, '서비스 공간', '공간 6 × 곳 수 + 하루 운영 띠', '민원실 · 상황실 · 승강장 같은 공간의 수와 문 여는 시간(24시간 구역)을 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'pb_agency',
           'title': '민원실 · 상황실 · 청사 냉난방까지, 청사 전체를 한 공급사에서',
           'areas': [('민원실', 'p', '키오스크'), ('안내 화면', 'p', '스마트 사이니지'), ('상황실 · 회의실', 'p', '비디오월'), ('사무 공간', 'p', '모니터'), ('청사 냉난방', 'p', 'DVM S2 실외기')],
           'platform': ['b.IoT', 'MagicINFO', 'DMS 2.5'],
           'a': [(0, '미지원'), (1, '화면만 관리'), (1, '화면'), (1, '모니터'), (0, '공조 미지원')],
           'b': [(1, '무인 단말'), (0, '리포트 없음'), (0, '설비 일부'), (1, '모니터'), (0, '별도 업체')]},
 'edge': {'vid': 'pb_agency', 'msgs': [('통합 냉방 효율', '청사 전기료를 줄이는 냉방 효율'), ('저온난방 -15℃', '영하 15도에서도 내는 난방 능력'), ('정격 냉방', '실외기 한 대로 여러 사무실을 맡는 냉방 능력')]},
 'proof': {'title': '공공 · 교통 현장에서 먼저 검증했습니다', 'cases': ['서울교통공사', '대구광역시 교통정보서비스센터', '경찰청']}}

SHEETS = [org, fiscal, cert, space, *compete.sheets(CLUSTER, COMPETE)]
