# 당사의 이해 · 학교 · 교육 — 학생 · 학급 규모 → 학사 일정 → 교실 · 기자재 → 예산 · 조달
from kit import *
import compete

CLUSTER = dict(id='ED', name='학교 · 교육', cust='초·중·고', ai='AI 스쿨', verticals=['ed_univ', 'ed_k12', 'ed_academy'],
               goal='학생 · 학급 규모, 학사 일정과 설치할 수 있는 시기, 교실 유형과 지금 쓰는 기자재, 예산이 나오는 곳과 조달 절차를 먼저 짚는다')


def scale():
    s = sheet('L_TOC_UA_ED_SCALE', '학생 · 학급 규모', '어떤 학교이고, 몇 명이 몇 개 교실에서 배우는지')
    s.pic(64, 128, 400, 520, 'img/media/g0.json#499', '고객 학교 교실 사진', r=18, name='ph')
    chiprow(s, 488, 128, ['초등학교', '중학교', '고등학교', '대학', '학원'], 2, 'k')
    for i, (lb, un, ic) in enumerate([('학생', '명', 'users'), ('학급', '개', 'grid'), ('교원', '명', 'person'), ('교실 · 특별실', '실', 'door')]):
        tile(s, 488 + (i % 2) * 372, 196 + (i // 2) * 234, 356, 218, ic, lb, un, f't{i}')
    return done(s, CLUSTER, 3, '학생 · 학급 규모', '사진 + 학교급 칩 5 + 숫자 4', '학교급과 학생 · 학급 · 교원 · 교실 수를 짚을 때')


def term():
    s = sheet('L_TOC_UA_ED_TERM', '학사 일정', '수업이 없는 때가 곧 설치할 수 있는 때입니다')
    PW = 96
    months(s, 64, 128, PW, 40, first=3)
    for k, (a, b, lb, col) in enumerate([(0, 4.6, '1학기', C1), (4.6, 5.6, '여름방학', GOOD), (5.6, 9.9, '2학기', C1), (9.9, 12, '겨울방학 · 봄방학', GOOD)]):
        x = 64 + a * PW; w = (b - a) * PW - 4
        s.box(x, 184, w, 76, bg=col, r=14)
        s.t(x, 208, w, lb, 20, 800, WHITE, 1.3, name=f's{k}', align='center', nowrap=True)
    for k, (a, lb) in enumerate([(1.6, '중간고사'), (3.7, '기말고사'), (7.1, '중간고사'), (8.3, '입시 · 수능'), (9.45, '기말고사')]):
        s.chip(64 + a * PW, 276, lb, name=f'x{k}', bg=WHITE, color=INK2, size=14, h=36, pad=14, border=f'1px solid {LINE}')
    for i, lb in enumerate(['여름방학 공사', '겨울방학 공사']):
        x = 64 + i * 588
        s.box(x, 340, 564, 308, bg=TINT, r=18)
        s.ico(x + 28, 368, 'calendar', size=56, r=16, bg=WHITE, color=GOOD)
        s.t(x + 100, 380, 420, lb, 24, 800, INK, 1.3, name=f'c{i}', nowrap=True)
        s.t(x + 28, 452, 500, f'{Z}월 {Z}일 – {Z}월 {Z}일', 20, 800, INK2, 1.3, name=f'cd{i}', nowrap=True, extra=NUM)
        small(s, x + 28, 518, '쓸 수 있는 날', MUTE, 200)
        numu(s, x + 28, 546, 240, Z, '일', 56, 20, name=f'cv{i}')
        small(s, x + 300, 518, '교실이 비는 주', MUTE, 200)
        numu(s, x + 300, 546, 240, Z, '주', 56, 20, name=f'cw{i}')
    return done(s, CLUSTER, 4, '학사 일정', '학기 · 방학 띠 12달 + 시험 표시 5 + 방학 공사 2', '학기 · 방학 · 시험 일정을 놓고 방학 중 공사할 수 있는 기간을 찾을 때')


def rooms():
    s = sheet('L_TOC_UA_ED_ROOMS', '교실 · 기자재', '어떤 교실이 몇 실, 지금 무엇으로 수업하는지')
    data = [('일반 교실', 'book', '빔프로젝터 · TV'), ('과학실 · 특별실', 'flask', '빔프로젝터'), ('컴퓨터실 · 미래 교실', 'monitor', 'PC · 전자칠판'),
            ('강당 · 체육관', 'mic', '대형 스크린 · 음향'), ('도서관 · 자습실', 'list', '안내 게시판'), ('교무실 · 회의실', 'users', 'TV · 복합기')]
    for i, (nm, ic, dev) in enumerate(data):
        x = 64 + (i % 3) * 392; y = 128 + (i // 3) * 270
        s.box(x, y, 368, 250, bg=SURF, r=18)
        s.ico(x + 24, y + 24, ic, size=56, r=16, bg=WHITE)
        s.t(x + 96, y + 38, 250, nm, 20, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        numu(s, x + 24, y + 104, 200, Z, '실', 48, 20, name=f'v{i}')
        s.hline(x + 24, y + 172, 320)
        small(s, x + 24, y + 186, '지금 쓰는 기자재', MUTE, 200)
        s.t(x + 24, y + 210, 200, dev, 18, 700, INK2, 1.3, name=f'd{i}', nowrap=True)
        s.t(x + 224, y + 210, 120, f'쓴 지 {Z}년', 18, 800, BLUE, 1.3, name=f'a{i}', align='right', nowrap=True)
    return done(s, CLUSTER, 5, '교실 · 기자재', '교실 유형 6 × 실 수 · 기자재 · 쓴 햇수', '교실 유형마다 실 수와 지금 쓰는 기자재 · 쓴 햇수를 짚을 때')


def budget():
    s = sheet('L_TOC_UA_ED_BUDGET', '예산 · 조달', '예산이 어디서 나와, 어떤 절차로 사는지')
    for i, (nm, ic, ln) in enumerate([('예산 편성', 'coin', '교육청 사업비 · 학교 회계'), ('기종 선정', 'users', '교내 선정 위원회 심의'), ('계약 · 조달', 'doc', '나라장터 · 학교장터'), ('납품 · 검수', 'check', '방학 중 설치 · 검수')]):
        x = 64 + i * 296
        s.box(x, 128, 264, 212, bg=WHITE, r=18, border=f'1px solid {LINE}')
        s.num2(x + 20, 148, i + 1, 36, 16)
        s.ico(x + 188, 144, ic, size=56, r=16)
        s.t(x + 20, 208, 224, nm, 24, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        s.t(x + 20, 250, 224, ln, 16, 700, GRAY, 1.4, name=f'l{i}', nowrap=True)
        s.t(x + 20, 292, 224, f'{Z}월', 20, 800, BLUE, 1.3, name=f'm{i}', extra=NUM)
        if i < 3: rarrow(s, x + 280, 234)
    s.box(64, 364, 560, 284, bg=SURF, r=18)
    cap(s, 88, 384, '예산이 나오는 곳', 'bt')
    for i, (lb, fr) in enumerate([('교육청 목적 사업비', 0.7), ('학교 자체 예산', 0.35), ('지자체 · 그 밖의 지원', 0.2)]):
        y = 434 + i * 68
        s.t(88, y, 320, lb, 18, 700, INK, 1.3, name=f'b{i}', nowrap=True)
        s.t(500, y - 4, 100, Z + '%', 24, 800, BLUE, 1.2, name=f'bv{i}', align='right', extra=NUM)
        hbar(s, 88, y + 36, 512, fr, 12)
    s.box(648, 364, 568, 284, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 672, 384, '함께 묶이는 정책 사업', 'pt')
    for i, lb in enumerate(['디지털 교과서 · 수업 혁신', '학교 공간 새 단장', '선택 과목 교실 확충', '돌봄 · 방과후 교실']):
        x = 672 + (i % 2) * 262; y = 430 + (i // 2) * 100
        s.box(x, y, 250, 88, bg=TINT, r=14)
        s.ico(x + 14, y + 22, 'check', size=44, r=12, bg=WHITE)
        s.t(x + 70, y + 19, 168, lb, 18, 800, BLUE, 1.4, name=f'p{i}', clamp=2)
    return done(s, CLUSTER, 6, '예산 · 조달', '조달 절차 4 + 예산 출처 막대 3 + 정책 사업 4', '예산 출처와 편성 · 선정 · 계약 · 납품 절차, 함께 묶이는 정책 사업을 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'ed_k12',
           'title': '칠판 · 학생 기기 · 교실 냉난방까지, 학교 전체를 한 공급사에서',
           'areas': [('교실 칠판', 'p', '전자칠판 Flip Pro'), ('학생 기기', 'p', '갤럭시 탭'), ('교무실', 'p', '갤럭시 북 EE'), ('교실 냉난방', 'p', '무풍 4Way'), ('출력 · 복합기', 'p', '디지털 복합기')],
           'platform': ['갤럭시 클래스룸', 'Knox', 'b.IoT'],
           'a': [(1, '동급 화면'), (0, '별도 관리 도구'), (0, '미지원'), (0, '미지원'), (0, '별도 구매')],
           'b': [(1, '저가 칠판'), (1, '수동 관리'), (0, '미지원'), (0, '별도 업체'), (0, '미지원')]},
 'edge': {'vid': 'ed_k12', 'msgs': [('대각선 사이즈', '교실 뒷자리에서도 보이는 큰 화면'), ('사운드출력', '따로 스피커 없이 교실을 채우는 소리'), ('제품 사용 시간', '하루 수업 내내 켜 두는 칠판')]},
 'proof': {'title': '학교에서 먼저 검증했습니다', 'cases': ['국민대학교', '서울 문정초등학교 디지털 교과서', '서울교육대학교 AI 미래교실']}}

SHEETS = [scale, term, rooms, budget, *compete.sheets(CLUSTER, COMPETE)]
