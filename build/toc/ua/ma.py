# 당사의 이해 · 미디어 · 광고 — 매체 현황 → 편성 · 구좌 → 광고주 · 판매 방식 → 규제 · 화질 기준
from kit import *
import compete

CLUSTER = dict(id='MA', name='미디어 · 광고', cust='옥외·미디어 광고', ai='AI 미디어', verticals=['ad_ooh', 'mb_studio'],
               goal='운영하는 매체 · 스튜디오 현황, 화면 한 바퀴의 편성과 구좌, 광고주와 판매 방식, 허가받은 밝기 · 시간과 화질 기준을 먼저 짚는다')


def media():
    s = sheet('L_TOC_UA_MA_MEDIA', '매체 현황', '어디에, 어떤 화면을, 몇 기 운영하는지')
    bluepanel(s, 64, 128, 300, 520, 'monitor', '운영하는 매체', '기', 'm', [('모두 더한 화면 면적', '㎡'), ('하루에 보는 사람', '만 명')])
    for x, lb in ((476, '위치'), (760, '유형'), (936, '화면 크기'), (1068, '하루 유동 인구')):
        small(s, x, 134, lb, MUTE, 140)
    rows = [('도심 사거리 건물 외벽', '대형 전광판'), ('버스 정류장 · 가로 시설', '가로형 패널'), ('지하철 역사 · 통로', '실내 미디어'), ('스튜디오 · 부조정실', '배경 화면 · 모니터')]
    for r, (pos, kd) in enumerate(rows):
        y = 164 + r * 122
        s.box(388, y, 828, 110, bg=SURF, r=18)
        s.ico(408, y + 29, 'pin', size=52, r=14, bg=WHITE)
        s.t(476, y + 42, 270, pos, 20, 800, INK, 1.3, name=f'p{r}', nowrap=True)
        s.t(760, y + 44, 164, kd, 16, 800, BLUE, 1.3, name=f'k{r}', nowrap=True)
        numu(s, 936, y + 38, 120, Z, '㎡', 32, 16, name=f's{r}')
        numu(s, 1068, y + 38, 130, Z, '만 명', 32, 16, name=f'f{r}')
    return done(s, CLUSTER, 3, '매체 현황', '대표 숫자 3 + 매체 4 × 위치 · 유형 · 크기 · 유동 인구 표', '운영하는 매체 수와 매체마다 위치 · 유형 · 화면 크기 · 유동 인구를 짚을 때')


def slot():
    s = sheet('L_TOC_UA_MA_SLOT', '편성 · 구좌', '화면 한 바퀴가 어떻게 채워지는지')
    EMPTY = '#e6e9ef'
    s.box(64, 128, 520, 520, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 150, '한 바퀴 편성', 'lt')
    donut(s, 324, 404, 170, 52, [1 / 12] * 12, [C1] * 7 + [C3] * 2 + [C4] * 2 + [EMPTY], gap=5)
    s.t(224, 366, 200, '한 바퀴', 16, 700, GRAY, 1.3, name='ll', align='center')
    numu(s, 224, 392, 200, Z, '초', 48, 20, name='lv', align='center')
    s.box(608, 128, 608, 148, bg=SURF, r=18)
    for k, (lb, un) in enumerate([('구좌 하나 길이', '초'), ('구좌 수', '개'), ('하루 반복', '회')]):
        x = 636 + k * 196
        small(s, x, 152, lb, MUTE, 170)
        numu(s, x, 186, 170, Z, un, 48, 20, name=f'q{k}')
    s.box(608, 292, 608, 160, bg=WHITE, r=18, border=f'1px solid {LINE}')
    for k, (lb, col) in enumerate([('판매한 구좌', C1), ('공익 · 공공', C3), ('자사 안내', C4), ('빈 구좌', EMPTY)]):
        x = 636 + (k % 2) * 288; y = 322 + (k // 2) * 64
        s.box(x, y + 3, 18, 18, bg=col, r=6)
        s.t(x + 28, y, 130, lb, 18, 800, INK, 1.3, name=f'g{k}', nowrap=True)
        s.t(x + 150, y - 1, 110, Z + '구좌', 18, 800, BLUE, 1.3, name=f'gv{k}', align='right', extra=NUM)
    s.box(608, 468, 608, 180, bg=TINT, r=18)
    s.t(636, 492, 260, '화면을 켜 두는 시간', 18, 800, BLUE, 1.3, name='hl', nowrap=True)
    s.t(900, 486, 288, f'{Z}시 – {Z}시', 24, 800, BLUE, 1.3, name='hv', align='right', nowrap=True)
    daytrack(s, 636, 556, 552, 6, 24)
    return done(s, CLUSTER, 4, '편성 · 구좌', '한 바퀴 고리 12칸 + 숫자 3 + 구좌 구성 4 + 송출 시간 띠', '화면 한 바퀴의 길이와 구좌 구성, 하루 반복 횟수와 켜 두는 시간을 짚을 때')


def sales():
    s = sheet('L_TOC_UA_MA_SALES', '광고주 · 판매 방식', '누가 광고를 사고, 어떤 방식으로 파는지')
    s.box(64, 128, 560, 520, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 150, '광고주 업종', 'at')
    for i, (lb, fr) in enumerate([('금융 · 보험', 0.9), ('유통 · 식음료', 0.72), ('영화 · 게임 · 공연', 0.55), ('공공 · 캠페인', 0.36), ('그 밖', 0.2)]):
        y = 204 + i * 86
        s.t(92, y, 300, lb, 18, 800, INK, 1.3, name=f'a{i}', nowrap=True)
        s.t(496, y - 4, 100, Z + '%', 24, 800, BLUE, 1.2, name=f'av{i}', align='right', extra=NUM)
        hbar(s, 92, y + 38, 504, fr, 14, track=SURF)
    for i, (ic, nm, ln) in enumerate([('calendar', '구좌 판매', '기간과 구좌를 정해 계약'), ('layers', '묶음 판매', '여러 매체를 한 번에 계약'), ('bolt', '자동 거래', '보는 사람 수에 맞춰 바로 판매')]):
        y = 128 + i * 180
        s.box(648, y, 568, 160, bg=SURF, r=18)
        s.ico(676, y + 44, ic, size=72, r=20, bg=BLUE, color=WHITE)
        s.t(772, y + 42, 270, nm, 24, 800, INK, 1.3, name=f'm{i}', nowrap=True)
        s.t(772, y + 88, 280, ln, 16, 700, GRAY, 1.3, name=f'ml{i}', nowrap=True)
        small(s, 1060, y + 44, '비중', MUTE, 128, 'right')
        numu(s, 1060, y + 70, 128, Z, '%', 40, 18, name=f'mv{i}', align='right')
    return done(s, CLUSTER, 5, '광고주 · 판매 방식', '광고주 업종 막대 5 + 판매 방식 3', '광고주 업종 비중과 구좌 · 묶음 · 자동 거래 같은 판매 방식 비중을 짚을 때')


def spec():
    s = sheet('L_TOC_UA_MA_SPEC', '규제 · 화질 기준', '허가받은 밝기와 시간, 그리고 화질 기준')
    s.box(64, 128, 564, 260, bg=SURF, r=18)
    cap(s, 92, 150, '허가받은 밝기', 'bt')
    for j, (lb, ic) in enumerate([('낮', 'sun'), ('밤', 'moon')]):
        x = 92 + j * 268
        s.ico(x, 204, ic, size=56, r=16, bg=WHITE)
        s.t(x + 72, 218, 100, lb, 20, 800, INK2, 1.3, name=f'b{j}', nowrap=True)
        numu(s, x, 296, 240, Z, 'cd/㎡', 48, 18, name=f'bv{j}')
    s.box(652, 128, 564, 260, bg=SURF, r=18)
    cap(s, 680, 150, '화면을 켤 수 있는 시간', 'tt')
    s.t(680, 204, 400, f'{Z}시 – {Z}시', 40, 800, BLUE, 1.2, name='th', nowrap=True)
    daytrack(s, 680, 300, 508, 6, 24)
    data = [('doc', '옥외 광고물 허가 · 신고', f'허가 기간 {Z}년'), ('shield', '구조 · 바람 안전 점검', f'점검 주기 {Z}개월'), ('image', '해상도 · 색 재현 기준', '방송 표준 색 영역'), ('film', '카메라 촬영 대응', '찍어도 깜박임 없는 화면')]
    for i, (ic, nm, tg) in enumerate(data):
        x = 64 + i * 294
        s.box(x, 412, 270, 236, bg=WHITE, r=18, border=f'1px solid {LINE}')
        s.ico(x + 24, 436, ic, size=56, r=16)
        s.t(x + 24, 510, 222, nm, 20, 800, INK, 1.3, name=f'n{i}', clamp=2)
        s.t(x + 24, 584, 222, tg, 16, 800, BLUE, 1.3, name=f't{i}', nowrap=True)
    return done(s, CLUSTER, 6, '규제 · 화질 기준', '밝기 숫자 2 + 표시 시간 띠 + 기준 4', '옥외 광고물 허가 · 밝기 · 표시 시간과 방송 화질 기준을 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'ad_ooh',
           'title': '외벽 전광판 · 거리 매체 · 관제까지, 매체 전체를 한 공급사에서',
           'areas': [('건물 외벽 전광판', 'p', '실외용 LED'), ('거리 · 정류장', 'p', '실외 사이니지'), ('실내 대형 화면', 'p', 'The Wall'), ('실내 안내 화면', 'p', '스마트 사이니지'), ('관제 센터', 'p', '비디오월')],
           'platform': ['MagicINFO', 'VXT CMS'],
           'a': [(1, '동급 화질'), (0, '미지원'), (1, 'LED'), (0, '미지원'), (1, '원격 관제')],
           'b': [(1, '휘도 낮음'), (1, '시공 강점'), (0, '미지원'), (0, '미지원'), (0, '현장 점검')]},
 'edge': {'vid': 'ad_ooh', 'msgs': [('밝기', '한낮 햇빛 아래서도 보이는 밝기'), ('동작 온도/습도', '한겨울부터 한여름까지 견디는 화면', '-40℃~+55℃', '동작 온도'), ('명암비', '밤에도 또렷한 광고 색')]},
 'proof': {'title': '옥외 · 방송 매체에서 먼저 검증했습니다', 'cases': ['코엑스 SM타운/K-POP 광장', '강남대로 미디어폴', 'CJ ENM 버추얼 프로덕션 스테이지']}}

SHEETS = [media, slot, sales, spec, *compete.sheets(CLUSTER, COMPETE)]
