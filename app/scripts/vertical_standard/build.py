# -*- coding: utf-8 -*-
"""Build the 44 vertical standard proposals (scenarios · fills · story) from
vertical_space_product.json + vertical_space_solution.json + authored content (content_*.txt)."""
import json, re, math, glob, os, collections
import prod, sols, scene_match
from polite import polite
from sols import SOL, media

from paths import ROOT, HERE, OUT
SCH = json.load(open(OUT + '/schema.json'))
SCHEMA, SOLS_L, WHY_IMG = SCH['schema'], SCH['sols'], SCH['why_img']
VP = json.load(open(ROOT + '/app/data/vertical_space_product.json'))
VS = json.load(open(ROOT + '/app/data/vertical_space_solution.json'))
# 표준 건물 조감도: vertical → {space no: floor} (bld_forms.py)
BLD_FLOOR = {}
if os.path.exists(OUT + '/bld_floors.json'):
    for _f in json.load(open(OUT + '/bld_floors.json'))['floors']:
        for _r in _f['rooms']: BLD_FLOOR.setdefault(_f['vid'], {})[_r['space']] = _f['level']
CAT = json.load(open(ROOT + '/app/data/catalog.json'))
MEDIA = json.load(open(ROOT + '/app/data/media.json'))
# 공간 장 왼쪽 사진: 공간 id → 사진 주소 — 목차 템플릿(공간별 가치 제안 여정)과 같은 표
SPACE_PH = json.load(open(ROOT + '/build/toc/space_photos.json'))
MEDIA_LABEL = {g[0]: g[2] for c in MEDIA['case'].values() for g in c.get('g', [])}
CASE = {str(c['id']): c for c in CAT['cases']}
IND_CASES = {}
for _c in CAT['cases']:
    if _c.get('ind'): IND_CASES.setdefault(_c['ind'], []).append(str(_c['id']))
SOLCAT = {s['id']: s for s in VS['solution_catalog']}
VSOL = {v['id']: v for v in VS['verticals']}
GROUPS = VP['meta']['groups']
CATGROUP = {c['id']: g['id'] for g in VP['product_taxonomy'] for c in g.get('categories', [])}
P_IDS = {p['id'] for p in CAT['products']} | {p['id'] for p in json.load(open(ROOT + '/app/data/products_db.json'))['products']}
S_IDS = {s['id'] for s in CAT['solutions']}

IND = {'SF': 'VN', 'RG': 'VN', 'MB': 'VN', 'MI': 'PB'}
PH = {'FB': 'fb', 'RT': 'rt', 'SV': 'sv', 'HT': 'ht', 'TP': 'tp', 'VN': 'vn', 'AD': 'ad', 'OF': 'of', 'RS': 'rs', 'ID': 'id', 'ED': 'ed', 'PB': 'pb',
      'MD': 'md', 'MF': 'mf', 'FN': 'fn', 'OE': 'oe', 'SF': 'vn', 'RG': 'vn', 'MB': 'vn', 'MI': 'pb'}
CASES = {
    'fb_qsr': ['1490', '50'], 'fb_cafe': ['3727', '159'], 'fb_rest': ['2560', '1645'], 'rt_mall': ['1761', '49'], 'rt_hyper': ['122', '45'],
    'rt_flag': ['2813', '2081'], 'rt_small': ['3541', '116'], 'sv_unmanned': ['145', '59'], 'sv_screen': ['3262', '3668'], 'sv_laundry': ['2151', '2172'],
    'sv_beauty': ['60', '56'], 'ht_large': ['3080', '101'], 'ht_mid': ['42', '1'], 'ht_stay': ['3625', '82'], 'tp_park': ['1817', '157'],
    'tp_museum': ['2549', '39'], 'vn_stadium': ['12', '3268'], 'vn_cinema': ['3657', '2045'], 'sf_fitness': ['2202', '2891'], 'ad_ooh': ['83', '32'],
    'of_hq': ['3716', '47'], 'of_sme': ['3226', '89'], 'of_cowork': ['3310', '155'], 'rs_apt': ['3125', '7'], 'rs_officetel': ['3349', '67'],
    'rs_senior': ['3656', '3683'], 'id_partner': ['3696', '2679'], 'ed_univ': ['3370', '34'], 'ed_k12': ['3967', '130'], 'ed_academy': ['153', '73'],
    'pb_agency': ['2349', '142'], 'pb_transport': ['156', '1958'], 'mi_military': ['2962', '152'], 'md_tertiary': ['76', '16'], 'md_hospital': ['77', '16'],
    'md_clinic': ['2105', '16'], 'md_ltc': ['2538', '3683'], 'mf_factory': ['3035', '1451'], 'mf_logistics': ['3088', '9'], 'fn_bank': ['1892', '98'],
    'fn_hq': ['2129', '88'], 'oe_telco': ['158', '1801'], 'rg_church': ['2737', '97'], 'mb_studio': ['2366', '128'],
}
WHY_ROWS = [('Samsung Business', 'L_VS_WHY_1'), ('최고의 전문가 집단', 'L_VS_WHY_2'), ('통합 오퍼링', 'L_VS_WHY_3'), ('비즈니스 고객 맞춤 전문 프로세스', 'L_VS_WHY_4'), ('브랜드 가치', 'L_VS_WHY_5')]
TECHNICIAN = ('img/ph/svc-technician.jpg', '시스템에어컨 점검 엔지니어')
# 01 Overview 기기 계열의 대표 컷 — 계열 이름에 맞는 제품 먼저(모바일 = 탭 · 폰, 시스템에어컨 = 카세트 실내기; 버즈 · 콘덴싱유닛이 대표가 되지 않게)
FAMILY_REP = {'MOB': ('tab', 'phone', 'g_rugged'), 'SAC': ('sac_sm', 'sac_l_in', 'sac_res')}
TALL = {'airdresser', 'air', 'shoe', 'ref_home', 'ref_bi', 'ref_comm', 'kimchi', 'water', 'g_kiosk'}
# Why Samsung 통합 오퍼링(Device · Solution · Service) — 호텔 덱에서 온 객실 · LYNK 화면 · 천장 사진 대신 어느 업종에나 맞는 사진 (모든 덱 같은 내용)
WHY_IMG_FIX = {'L_VS_WHY_3': {'img0': ('img/fill/sol-b.json#4', '삼성 디스플레이 · 가전이 놓인 업무 공간 라운지'),
                              'img1': ('img/media/g0.json#108', '여러 사업장을 한 화면에서 보는 관리 대시보드'),
                              'img2': ('img/media/g0.json#824', '천장형 시스템에어컨을 점검하는 서비스 엔지니어')}}
# 목차 06 Why Samsung 카드 — 사옥 사진(img/fill/ais-a.json#6)은 Why Samsung 첫 장이 쓰므로 삼성 매장 · 서비스 엔지니어 사진에서 고른다
SAMSUNG_TOC = [('img/media/g1.json#447', '삼성 강남 건물 외관'), ('img/media/g1.json#508', '삼성 디지털프라자 매장 건물 외관'),
               ('img/media/g0.json#823', '실외기를 노트북으로 점검하는 삼성 서비스 엔지니어')]
# 04 솔루션 간지 · 목차 카드: 솔루션 화면 캡처 대신 그 솔루션이 일하는 현장 사진 — 사진 설명에 있으면 좋은 기기 말
SOL_DEVICE_WORDS = {
    's_stp': ('에어컨', '실내기', '태블릿', '조명'), 's_biot': ('관제', '에어컨', '실외기', '설비'), 's_dms': ('에어컨', '실내기'), 's_touch': ('에어컨', '실내기'),
    's_wifi': ('에어컨', '실내기'), 'svc_sac': ('에어컨', '실내기', '점검'), 's_vxt': ('사이니지', '메뉴보드', '디스플레이', '화면'),
    's_magic': ('사이니지', '디스플레이', '비디오월', '화면', 'LED'), 's_lynk': ('TV', '객실'), 's_knox': ('태블릿', '갤럭시', '스마트폰'),
    's_pos': ('태블릿', '주문', '결제'), 's_field': ('태블릿', '스캔', '작업'), 's_class': ('태블릿', '교실', '수업'), 's_dex': ('모니터', '태블릿', '회의'),
    's_hospital': ('사이니지', '태블릿', '안내'), 's_counthru': ('복합기', '프린터'), 's_secuthru': ('복합기', '프린터'), 's_meeting': ('회의실', '태블릿'),
    's_health': ('워치',), 's_sthome': ('거실', 'TV', '월패드'), 's_safety': ('워치', '작업자'), 's_bookee': ('노트북', '갤럭시 북'), 'svc_mobile': ('스마트폰', '태블릿'),
}
# 솔루션 장이 쓰는 media 화면 번호 → 그 솔루션 공식 화면 묶음(목차 04 카드가 다른 화면을 고를 때)
SOL_GALLERY = {g[0]: s['g'] for s in MEDIA['sol'].values() for g in s.get('g', [])}
VXT_CODES = {35, 59, 61, 33, 66, 39}  # s_vxt 장의 그룹별 화면(gmap)


# ------------------------------------------------------------------ text width (rough, for nowrap checks)
def em(ch):
    o = ord(ch)
    if 0xAC00 <= o <= 0xD7A3 or 0x3130 <= o <= 0x318F: return 1.0
    if ch == ' ': return 0.26
    if ch in '·•': return 0.32
    if ch in '.,:;\'"|!()[]/-–—': return 0.36 if ch not in '—–' else 0.9
    if ch.isdigit(): return 0.57
    if ch.isupper(): return 0.66
    if ch.isalpha(): return 0.55
    return 0.8


def width(s, px, ls=0.0):
    return sum((em(c) + ls) * px for c in s)


def fits(s, px, w, ls=0.0):
    return all(width(line, px, ls) <= w for line in str(s).split('\n'))


def clip(s, px, w, suffix='…'):
    s = str(s)
    if fits(s, px, w): return s
    while s and not fits(s + suffix, px, w): s = s[:-1]
    return s.rstrip(' ·,') + suffix


def wrap_lines(s, px, w):
    """estimated number of lines when wrapping s (word-keep) at width w"""
    n = 0
    for para in str(s).split('\n'):
        cur, lines = 0.0, 1
        for word in para.split(' '):
            ww = width(word, px) + 0.26 * px
            if cur + ww > w and cur > 0: lines += 1; cur = ww
            else: cur += ww
        n += lines
    return n


# ------------------------------------------------------------------ authored content
def parse_content():
    V, cur = {}, None
    for fn in sorted(glob.glob(HERE + '/content_*.txt')):
        for raw in open(fn, encoding='utf-8'):
            line = raw.rstrip('\n')
            if not line or line.startswith('#'): continue
            f = line.split('|')
            if f[0].startswith('@'):
                vid = f[0][1:]
                cur = V[vid] = {'id': vid, 'short': f[1], 'ai': f[2], 'place': f[3], 'who': f[4], 'cover': f[5], 'lead': f[6], 'others': f[7].split(','), 'P': []}
            elif f[0] == 'Q':
                assert len(f) == 10, line
                cur['P'].append({'quote': f[1], 'tech': f[2], 'note': f[3], 'tkey': f[4], 'prop': f[5], 'head': f[6], 'sub': f[7], 'chips': [f[8], f[9]], 'subs': []})
            elif f[0] == 'S':
                assert len(f) == 7, line
                key, _, tag = f[2].partition('/')
                cur['P'][-1]['subs'].append({'title': f[1], 'key': key, 'tag': tag or key_tag(key), 'desc': f[3], 'steps': f[4:7]})
    for v in V.values():
        assert len(v['P']) == 3 and all(len(p['subs']) == 2 for p in v['P']), v['id']
    return V


def key_tag(key):
    if key in SOL: return SOL[key][0]
    return prod.SHORT.get(key, key)


def key_img(key, small=False):
    """image for a product category or a solution key → (src, fit, name)"""
    if key in SOL:
        if small and key in sols.THUMB: return media(sols.THUMB[key]), 'cover', SOL[key][0]
        lst = sols.IMGS.get(key, {}).get('img0', [])
        src = lst[0] if lst else None
        if isinstance(src, int): src = media(src)
        return src, 'contain', SOL[key][0]
    if key in prod.P:
        return prod.image_of(key), ('cover' if key in prod.PHOTO else 'contain'), prod.P[key][1]
    raise KeyError(key)


def img(src, name, fit='cover', pos=None):
    d = {'src': src, 'fit': fit, 'name': name, 'keep': True}
    if pos: d['pos'] = pos
    return d


def space_photo(sp):
    """공간 장 왼쪽 공간 사진 — 이름은 사진 묶음의 설명(없으면 공간 이름)"""
    src = SPACE_PH[sp['id']]
    m = re.fullmatch(r'img/media/(g0|g1|t)\.json#(\d+)', src)
    name = MEDIA_LABEL.get(('g0', 'g1', 't').index(m.group(1)) * 10000 + int(m.group(2))) if m else None
    return img(src, name or f'{sp["name"]} 공간 사진')


# ------------------------------------------------------------------ media helpers
def case_photos(cid):
    g = MEDIA['case'].get(cid, {}).get('g', [])
    out = []
    for code, kind, label, w, h, *_ in g:
        if kind in ('s', 'e', 'p'):
            out.append({'src': media(code), 'name': label, 'w': w, 'h': h, 'kind': kind})
    return out


def case_details(cid, strict=True):
    """the same site's close-ups and on-site screens — 도입사례 장 사진이 모자랄 때 반복 대신 쓴다 (strict: 로고가 주인공인 컷은 빼고)"""
    g = MEDIA['case'].get(cid, {}).get('g', [])
    out = []
    for code, kind, label, w, h, *_ in g:
        if (kind == 'c' and w >= 250 and h >= 180) or (kind == 'u' and w >= 300 and h >= 170):
            if not re.search(r'제품 컷|아이콘|워드마크', label) and not (strict and re.search(r'로고', label)):
                out.append({'src': media(code), 'name': label, 'w': w, 'h': h, 'kind': kind})
    return sorted(out, key=lambda p: (p['kind'] != 'c', -(p['w'] * p['h'])))


PH_DESC = {v['file']: v['desc'] for v in json.load(open(ROOT + '/app/data/images.json'))['pids'].values() if v.get('desc')}
# 같은 그림 묶음(주소가 달라도 같은 사진) — app/scripts/build_picture_ids.mjs
SAME_PICTURE = {a: g[0] for g in json.load(open(ROOT + '/app/data/picture_ids.json'))['groups'] for a in g}


def ident(src):
    return SAME_PICTURE.get(src, src)


# 사진마다 실제로 보이는 것(비전 판독 — 장소 종류 · 간판 · 사진인지 · 품질). composer 와 같은 기록(버전 관리됨).
FACTS = json.load(open(ROOT + '/poc/test/scenario_composer/image_facts.json'))['images']
DIMS = json.load(open(ROOT + '/app/data/picture_dims.json'))
# 표지 · 간지 · 목차 사진을 고를 때 쓰는 세부 업종의 말 — 업종 이름 · 공간 이름 말고 사진 설명에 흔히 쓰이는 말(같은 업종 묶음의
# 다른 세부 업종 사진을 가르는 데 쓴다: 영화관 덱에 야구장, 빨래방 덱에 PC방, 의원 덱에 동물병원이 들어가던 것)
VENUE_WORDS = {
    'fb_qsr': '패스트푸드 버거 드라이브스루 퀵서비스 주문 키오스크 메뉴보드', 'fb_cafe': '카페 베이커리 커피 빵 쇼케이스 메뉴보드', 'fb_rest': '레스토랑 식당 다이닝 테이블 주방',
    'rt_mall': '백화점 쇼핑몰 면세점 아트리움', 'rt_hyper': '대형마트 마트 슈퍼 SSM 신선식품 계산대 진열대', 'rt_flag': '플래그십 쇼룸 전시장 브랜드 매장 체험존',
    'rt_small': '편의점 약국 소형 매장 계산대 진열대', 'sv_unmanned': '스터디카페 PC방 무인매장 무인 열람실', 'sv_screen': '스크린골프 골프 타석 시뮬레이터 실내 스포츠',
    'sv_laundry': '빨래방 코인세탁 세탁 건조기 세탁기', 'sv_beauty': '미용실 헤어 뷰티 살롱 피부관리 네일', 'ht_large': '호텔 리조트 객실 로비 연회장',
    'ht_mid': '호텔 비즈니스호텔 객실 로비 조식', 'ht_stay': '레지던스 풀빌라 스테이 객실 거실 침실', 'tp_park': '테마파크 놀이공원 어트랙션 관광지 공연장',
    'tp_museum': '박물관 미술관 전시관 갤러리 전시실 전시', 'vn_stadium': '경기장 야구장 축구장 아레나 관중석 전광판 스타디움', 'vn_cinema': '영화관 극장 상영관 공연장 공연홀 스크린 객석',
    'sf_fitness': '피트니스 헬스 스포츠센터 체육관 운동 골프클럽', 'ad_ooh': '옥외 광고 전광판 외벽 미디어 파사드 버스정류장 사이니지', 'of_hq': '사옥 본사 오피스 사무실 회의실 로비',
    'of_sme': '오피스 사무실 회의실 업무 공간', 'of_cowork': '공유오피스 오피스 라운지 미팅룸 코워킹', 'rs_apt': '아파트 세대 거실 주방 단지 모델하우스',
    'rs_officetel': '오피스텔 원룸 스튜디오 세탁실 임대주택', 'rs_senior': '시니어 실버타운 요양 레지던스 어르신', 'id_partner': '인테리어 가구 빌트인 쇼룸 키친 주방 갤러리',
    'ed_univ': '대학 대학교 캠퍼스 강의실 도서관 강당', 'ed_k12': '학교 초등학교 중학교 고등학교 교실 급식', 'ed_academy': '학원 교육센터 강의실 자습실',
    'pb_agency': '청사 공공기관 민원실 시청 구청 공단 지자체', 'pb_transport': '지하철 철도 공항 터미널 역사 대합실 승강장 발권 교통', 'mi_military': '군부대 부대 생활관 장병 지휘통제 병영',
    'md_tertiary': '종합병원 대학병원 병원 진료 병동 수술', 'md_hospital': '병원 진료 입원 병실 재활', 'md_clinic': '의원 클리닉 진료 대기실 접수',
    'md_ltc': '요양병원 요양시설 요양 병실 어르신', 'mf_factory': '공장 생산라인 제조 생산 작업', 'mf_logistics': '물류 창고 물류센터 콜드체인 피킹 출고',
    'fn_bank': '은행 영업점 창구 객장 지점 ATM', 'fn_hq': '금융 본점 딜링룸 콜센터 트레이딩', 'oe_telco': '통신사 통신 매장 휴대폰 개통 대리점',
    'rg_church': '교회 예배당 성당 법당 종교', 'mb_studio': '방송 스튜디오 부조정실 촬영',
}
# 어느 업종 덱에도 쓰지 않는 사진 — 다른 업종이 분명한 장면
NEVER = re.compile(r'동물병원|ANIMAL|반려|전통시장|과수원|비닐하우스|온실|농장|육묘')
GENERIC = {'공간', '존', '홀', '룸', '코너', '내', '외부', '현장', '운영', '관리', '안내', '데스크', '카운터', '시설', '센터', '업무', '전용', '공용', '메인',
           '프리미엄', '대형', '소형', '중앙', '종합', '통합', '고객', '직원', '포함', '전문', '중소', '복합', '신축', '그룹', '본사', '다점포', '사업자', '파트너',
           '인프라', '기관', 'AI', '스마트', '확인', '필요', '설치', '불가', '업소', '세탁기만', '건조기', '스태프', '디바이스', '기계실', '옥상', '공조', '로비',
           '라운지', '대기', '사무', '매장', '입구'}


def venue_words(vp, v):
    """(강한 말: 이 세부 업종이 분명한 말, 공간 말: 공간 이름의 말) — v(업종 문구)가 없으면 업종 이름과 VENUE_WORDS만"""
    split = lambda s: [w for w in re.split(r'[·/()\s,]+', s or '') if len(w) >= 2 and w not in GENERIC]
    strong = set(split(vp['name'])) | set(VENUE_WORDS.get(vp['id'], '').split())
    if v: strong |= set(split(v['short'])) | set(split(v['place']))
    space = ({w for sp in vp['spaces'] for w in split(sp['name'])} | set(SPACE_EXTRA.get(vp['id'], '').split())) - strong
    return strong, space


# 사진이 적은 세부 업종의 공간 말(약한 말) — 공간 이름에 없지만 그 공간 사진 설명에 쓰이는 말
SPACE_EXTRA = {
    'mi_military': '상황실 관제 통제실 체력단련 구내식당 행정 기숙사 비디오월', 'sv_beauty': '미러 디스플레이 거울 시술 대기', 'fn_hq': '상담원 헤드셋 증권 사옥 비디오월',
    'mf_logistics': '창고 선반 바코드 스캔 택배 적재 저온 유닛쿨러', 'md_clinic': '진료 대기 접수 상담', 'md_ltc': '병실 간호 요양 재활 식당',
    'rs_senior': '어르신 식당 커뮤니티 라운지 간호', 'rg_church': '예배 강단 객석 성가대 교육관', 'sv_unmanned': '열람 좌석 무인 키오스크',
    'sf_fitness': '러닝머신 운동 헬스 락커 수영장', 'ed_academy': '강의 자습 학습 상담',
}
# 사진이 적은 세부 업종이 공간 말이 맞을 때 빌려 쓸 수 있는 다른 업종 (군부대의 행정실 · 상황실 = 오피스 · 공공 사진)
ALSO_IND = {'mi_military': ('OF',), 'sv_beauty': ('RT',), 'fn_hq': ('OF',), 'fn_bank': ('OF',), 'mf_logistics': ('RT',), 'rg_church': ('ED',), 'rs_senior': ('MD',), 'md_ltc': ('RS',)}
PH_IND = {pre: g for g, pre in PH.items() if g == g.upper() and g not in ('SF', 'RG', 'MB', 'MI')}
SOURCE_DESC = {}
for _md in ('src/fill_sources.md', 'src/photo_sources.md'):
    for _line in open(ROOT + '/' + _md, encoding='utf-8'):
        _m = re.match(r'\| `(img/[^`]+)` \| ([^|]+) \|', _line)
        if _m: SOURCE_DESC.setdefault(_m.group(1), _m.group(2).strip())


def facts_photos(skip):
    """other official photos the vision pass has looked at (img/fill · img/bs …) — named by their source table, else by what they show"""
    out = []
    for src, f in FACTS.items():
        if src in skip or not re.match(r'img/(fill|bs|ph|media)/', src) or src.startswith('img/fill/cut.json'): continue
        out.append({'src': src, 'name': SOURCE_DESC.get(src) or f.get('shows') or '', 'kind': 'fact', 'ind': None})
    return out


def ph_all():
    """every 업종 참고 사진(img/ph) with its industry from the file name prefix"""
    out = []
    for f in sorted(os.listdir(ROOT + '/app/data/static/img/ph')):
        pre = f.split('-')[0]
        out.append({'src': 'img/ph/' + f, 'name': PH_DESC.get('img/ph/' + f, f[:-4]), 'kind': 'ph', 'ind': PH_IND.get(pre)})
    return out


def photo_text(p):
    f = FACTS.get(p['src']) or {}
    return ' '.join([p.get('name') or '', f.get('shows') or '', p.get('cust') or ''])


def photo_width(p):
    d = DIMS.get(p['src'])
    return d[0] if isinstance(d, list) and d else (p.get('w') or 0)


def plain_photo(p):
    """a photograph with nothing that belongs to someone else — no prominent non-Samsung sign, not a screen or product shot, usable"""
    f = FACTS.get(p['src'])
    if not f: return False
    if f.get('kind') != 'photo' or f.get('place') == '제품·화면만' or f.get('quality') == 'low': return False
    brand = (f.get('brand') or '').strip()
    if f.get('brand_prominent') and brand and not re.search(r'samsung|삼성', brand, re.I): return False
    return not NEVER.search(photo_text(p))


def all_case_photos():
    out = []
    for c in CAT['cases']:
        for p in case_photos(str(c['id'])):
            out.append({**p, 'case': str(c['id']), 'cust': c['cust'], 'ind': c.get('ind')})
    return out


def ph_pool(group):
    pre = PH[group]
    files = sorted(os.listdir(ROOT + '/app/data/static/img/ph'))
    return [{'src': 'img/ph/' + f, 'name': PH_DESC.get('img/ph/' + f, f[:-4]), 'w': 1, 'h': 1, 'kind': 'ph'} for f in files if f.startswith(pre + '-')]


# ------------------------------------------------------------------ slide fill builder
def fill(f, vals=None, imgs=None, r=None, raw_t=None):
    sch = SCHEMA[f]
    t = {}
    for i, lab in sch['labels'].items():
        t[str(i)] = lab
    # one-line slots: when a value does not fit, drop parenthetical notes (e.g. '(Server)') from it and from its
    # siblings (same key with another number, e.g. i0t · i1t) so a set of titles reads alike; clip what still overflows
    vals = dict(vals or {})
    box = sch.get('box', {})
    one = lambda k, v: k in box and box[k][2] and isinstance(v, str) and '\n' not in v
    over = {re.sub(r'\d+', '#', k) for k, v in vals.items() if one(k, v) and not fits(v, box[k][1], box[k][0])}
    for k, v in list(vals.items()):
        if one(k, v) and re.sub(r'\d+', '#', k) in over:
            v0, v = v, re.sub(r'\s*\([^)]*\)', '', v).strip()
            vals[k] = v if fits(v, box[k][1], box[k][0]) else clip(v, box[k][1], box[k][0])
            if os.environ.get('DEBUG_FIT') and vals[k] != v0: print('FIT', f, k, repr(v0), '->', repr(vals[k]))
    for k, v in vals.items():
        if k not in sch['keys']: raise KeyError(f'{f}: no text key {k}')
        t[str(sch['keys'][k])] = v
    if raw_t: t.update({str(k): v for k, v in raw_t.items()})
    missing = [i for i in range(sch['nT']) if not str(t.get(str(i), '')).strip()]
    if missing:
        inv = {v: k for k, v in sch['keys'].items()}
        raise ValueError(f'{f}: missing text slots {[inv.get(i, i) for i in missing]}')
    im = {}
    for k, v in (imgs or {}).items():
        if k not in sch['ikeys']: raise KeyError(f'{f}: no image key {k}')
        im[str(sch['ikeys'][k])] = v
    if len(im) != sch['nI']:
        raise ValueError(f'{f}: images {sorted(im)} of {sch["nI"]}')
    out = {'f': f, 't': {k: t[k] for k in sorted(t, key=int)}, 'img': {k: im[k] for k in sorted(im, key=int)}}
    if r: out['r'] = r
    return out


# ------------------------------------------------------------------ per-vertical derivations
def space_products(sp, first=None):
    """short product names of a space in its own order (featured category first), solutions skipped"""
    names = []
    for c in ([first] if first else []) + list(sp['products']):
        if c.startswith('s_'): continue
        n2 = prod.SHORT.get(c)
        if n2 and n2 not in names: names.append(n2)
    return names


def featured(vp, vs):
    """space마다 (대표 제품, 그 제품이 실제로 나오는 시나리오 문장 또는 None) — scene_match.pick"""
    by = {sp['id']: sp for sp in vs['spaces']}
    used, out = set(), []
    for sp in vp['spaces']:
        c, scene = scene_match.pick(sp, (by.get(sp['id']) or {}).get('solutions', []), used)
        used.add(c)
        out.append((c, scene))
    return out


def vertical_solutions(vid):
    vs = VSOL[vid]
    order, spaces, feats, scen = [], collections.defaultdict(list), collections.Counter(), {}
    for sp in vs['spaces']:
        for s in sp.get('solutions', []):
            sid = s['solution']
            if sid not in order: order.append(sid)
            spaces[sid].append(sp['name'])
            feats.update(s['features'])
            prev = scen.get(sid)
            if not prev or len(s['features']) > prev[0]: scen[sid] = (len(s['features']), s['scenario'], sp['name'])
    # most-used first (by spaces), stable
    order.sort(key=lambda s: -len(spaces[s]))
    return order, spaces, feats, scen


def clean(name):
    return re.sub(r'\s+', ' ', name).strip()


def chip_name(f):
    n = f['name']
    return {'ECG(심전도)·IHRN(불규칙 심장 리듬)': 'ECG · 심장 리듬', '활동(운동) 기록': '활동 · 운동 기록'}.get(n, re.sub(r'\(.*?\)', '', n).strip())


def sol_items(sid, mode, n, used):
    cat = SOLCAT[sid]
    if mode == 'group':
        groups = list(enumerate(cat['groups']))
        if sid == 's_health': groups = [x for x in groups if not x[1]['id'].endswith('.data')]
        sc = lambda g: sum(used[f['id']] for f in g['features'])
        chosen = sorted(groups, key=lambda x: (-sc(x[1]), x[0]))[:n]
        chosen.sort(key=lambda x: x[0])
        items = []
        for _, g in chosen:
            fs = [f for f in g['features'] if used[f['id']]]
            fs.sort(key=lambda f: -used[f['id']])
            for f in g['features']:
                if len(fs) >= 3: break
                if f not in fs and f.get('status') != 'planned': fs.append(f)
            body = '\n'.join('· ' + clean(re.sub(r'\s*\((?:어드밴스|ENTERPRISE|b\.IoT ENERGY)\)', '', f['name'])) for f in fs[:3])
            items.append((clean(g['name']), body))
        return items
    feats = [(gi, fi, g, f) for gi, g in enumerate(cat['groups']) for fi, f in enumerate(g['features']) if f.get('status') != 'planned']
    if sid == 's_meeting':
        book = [x for x in feats if x[2]['id'].endswith('.book')]
        ops = sorted([x for x in feats if not x[2]['id'].endswith('.book')], key=lambda x: (-used[x[3]['id']], x[0], x[1]))
        chosen = book[:3] + ops[:1]
    else:
        chosen = sorted(feats, key=lambda x: (-used[x[3]['id']], x[0], x[1]))[:n]
        chosen.sort(key=lambda x: (x[0], x[1]))
    out = []
    for gi, fi, g, f in chosen:
        d = sols.DESC.get(f['id']) or f.get('desc') or g['name']
        d = d.strip("'")
        out.append((clean(f['name']), d))
    return out


# ------------------------------------------------------------------ deck
class Deck:
    def __init__(self, v):
        self.v = v
        self.slides = []  # [fill, stage, role]

    def add(self, stage, role, fl):
        self.slides.append((stage, role, fl))
        return len(self.slides)


def build_vertical(v):
    vid = v['id']
    vp = next(x for x in VP['verticals'] if x['id'] == vid)
    vs = VSOL[vid]
    group = vp['group']
    ind = IND.get(group, group)
    N = len(vp['spaces'])
    picks = featured(vp, vs)
    feat = [c for c, _ in picks]
    order, s_spaces, used, scen = vertical_solutions(vid)
    K = len(order)
    short, ai, place, who = v['short'], v['ai'], v['place'], v['who']
    ch4 = ai[3:] + ' 솔루션' if ai.startswith('AI ') else ai + ' 솔루션'
    foot = f'{short} · {ai} 표준 제안서'
    cases = CASES[vid]
    building = N > 6
    bird_f = f'L_VS_BIRD_{"B" if building else "S"}{N}'

    # ---------------- photos
    # 한 덱에서 같은 사진은 한 번만(주소가 달라도 같은 그림이면 같은 사진 — picture_ids.json). 제품 컷 · 솔루션 화면은 따로 센다.
    # Why Samsung · 마감 · 06 간지 사진은 고정이라 먼저 자리를 잡고, 공간 장 왼쪽 사진은 그 장에서만 쓴다.
    shown = set()
    def show(src): shown.add(ident(src))
    def unseen(src): return ident(src) not in shown
    for f_, ims_ in WHY_IMG.items():
        for src_, _ in {**ims_, **WHY_IMG_FIX.get(f_, {})}.values(): show(src_)
    show(TECHNICIAN[0])
    # 솔루션 장 화면 · 제품 자리에 들어가는 사진(사진형 제품)도 덱에 한 번 나온 그림 — 표지 · 목차 · 간지가 같은 그림을 다시 고르지 않게
    for sid in order:
        spec = dict(sols.IMGS.get(sid, {})); spec.update(sols.GROUP_IMGS.get((sid, group), {})); spec.update(sols.VERT_IMGS.get((sid, vid), {}))
        for lst in spec.values():
            for c in lst: show(media(c) if isinstance(c, int) else c)
        if sid == 's_vxt':
            for c in VXT_CODES: show(media(c))
    for key in {s['key'] for p in v['P'] for s in p['subs']} | {p['tkey'] for p in v['P']} | set(feat):
        if key in prod.P and key in prod.PHOTO: show(prod.image_of(key))
    # 공간 장 왼쪽 사진(목차 템플릿과 같은 표 space_photos.json). 그 사진이 이 덱 도입사례 고객사의 현장 사진이면 도입사례 장에 두고,
    # 공간 장에는 같은 업종 사진 중 그 공간 이름이 붙은 다른 사진을 쓴다(없으면 표 사진 그대로)
    case_ids = {ident(p['src']) for cid in cases for p in case_photos(cid) + case_details(cid)}
    alt_pool = ph_pool(group) + [p for cid in IND_CASES.get(ind, []) if cid not in cases for p in case_photos(cid) if p['w'] >= 480]
    space_img = {}
    for sp in vp['spaces']:
        src_ = SPACE_PH[sp['id']]
        if ident(src_) in case_ids or not unseen(src_):
            words = [w for w in re.split(r'[·/()\s]+', sp['name']) if len(w) >= 2 and w not in ('공간', '구역', '존', '영역')]
            words += [w[:-1] for w in words if len(w) >= 3 and w[-1] in '실장관소석']
            alt = next((p for p in alt_pool if unseen(p['src']) and ident(p['src']) not in case_ids and any(w in p['name'] for w in words)), None)
            if alt:
                space_img[sp['id']] = img(alt['src'], alt['name'])
                show(alt['src'])
                continue
        space_img[sp['id']] = space_photo(sp)
        show(src_)
    space_srcs = {SPACE_PH[sp['id']] for sp in vp['spaces']}
    # 도입사례 장: 그 고객사 현장 사진 4장 — 장면 사진이 모자라면 같은 현장의 근접 · 화면 사진으로 채우고(같은 사진 반복 없이),
    # 그래도 모자랄 때만 공간 장에 쓴 그 사례 사진을 다시 쓴다
    case_imgs = {}
    for cid in cases:
        ph = [p for p in case_photos(cid) if unseen(p['src'])]
        land = sorted([p for p in ph if p['w'] >= p['h'] * 1.2], key=lambda p: -(p['w'] * p['h']) - (4e5 if re.search(r'전경|외관|공간|매장|로비|홀|실내|내부', p['name']) else 0))
        big = land[0] if land else (ph[0] if ph else None)
        chosen = ([big] if big else []) + [p for p in ph if p is not big]
        chosen += [p for p in case_details(cid) if unseen(p['src'])]
        chosen += [p for p in case_details(cid, strict=False) if unseen(p['src'])]  # 로고 벽이 보이는 근접 컷도 반복보다는 낫다
        chosen += [p for p in case_photos(cid) if not unseen(p['src'])]
        picked, ids = [], set()
        for p in chosen:
            if ident(p['src']) in ids: continue
            ids.add(ident(p['src'])); picked.append(p)
        case_imgs[cid] = picked[:4]
        while len(case_imgs[cid]) < 4: case_imgs[cid].append(case_imgs[cid][0])
        for p in case_imgs[cid]: show(p['src'])
    used_src = {p['src'] for c in case_imgs.values() for p in c}
    # ---------------- 표지 · 간지 · 목차 사진 — 이 세부 업종을 보여 주는 사진만:
    # 사진 설명 · 비전 판독(FACTS)에 이 업종의 말이 있고, 같은 업종 묶음의 다른 세부 업종 말만 있는 사진은 빼고(영화관 덱의 야구장 · 빨래방 덱의 PC방),
    # 다른 회사 간판이 크게 보이거나 화면 · 제품 컷 · 흐린 사진은 빼고, 덱에 이미 나온 사진은 빼고. 관련 말이 많은 사진 · 큰 사진 먼저.
    strong, space_w = venue_words(vp, v)
    sib = set()
    for o in VP['verticals']:
        if o['id'] != vid and IND.get(o['group'], o['group']) == ind:
            sib |= venue_words(o, None)[0]
    sib -= strong | space_w
    def rel(p):
        t = photo_text(p)
        return 2 * sum(1 for w in strong if w in t) + sum(1 for w in space_w if w in t)
    def venue_photo(p):
        if not plain_photo(p): return False
        t = photo_text(p)
        if rel(p) == 0: return False
        own = any(w in t for w in strong)
        if not own and any(w in t for w in sib): return False   # another venue of the same industry
        if (p.get('ind') or '') != ind and not own: return False  # another industry's photo only when it names this venue
        return True
    photos, ids = [], set()
    known = ph_all() + all_case_photos()
    for p in sorted([p for p in known + facts_photos({q['src'] for q in known}) if venue_photo(p)], key=lambda p: (-rel(p), -photo_width(p))):
        if ident(p['src']) not in ids: ids.add(ident(p['src'])); photos.append(p)

    # 이 세부 업종 사진이 모자랄 때(미용실 · 군부대 …): 이 덱 도입사례 고객사의 현장 사진(간판이 보여도) → 같은(또는 빌려 쓰는) 업종에서 공간 말이 맞는 사진
    # → 업종 대표 사진 → 빌려 쓰는 업종의 간판 없는 사진
    def usable_photo(p):
        f = FACTS.get(p['src'])
        return bool(f) and f.get('kind') == 'photo' and f.get('place') != '제품·화면만' and f.get('quality') != 'low' and not NEVER.search(photo_text(p))
    tier2 = [p for cid in cases for p in case_photos(cid) if usable_photo(p)]
    also = ALSO_IND.get(vid, ())
    tier3 = sorted([p for p in known if plain_photo(p) and not any(w in photo_text(p) for w in sib)
                    and ((p.get('ind') or '') == ind or (p.get('ind') or '') in also) and rel(p) > 0], key=lambda p: (-rel(p), -photo_width(p)))
    tier4 = [{'src': f'img/cover/{ind}.jpg', 'name': f'{GROUPS.get(group, group)} 대표 사진', 'w': 1600}]
    tier5 = sorted([p for p in known if (p.get('ind') or '') in also and plain_photo(p) and not any(w in photo_text(p) for w in sib)], key=lambda p: -photo_width(p))

    def photo(min_w=360, prefer=()):
        """the best photo of this venue the deck has not shown yet (prefer = words of the chapter the slot stands for)"""
        for tier in (photos, tier2, tier3, tier4, tier5):
            best = None
            for p in tier:
                if not unseen(p['src']) or (tier is not tier4 and photo_width(p) < min_w): continue
                t = photo_text(p)
                score = (sum(1 for w in prefer if w in t), rel(p), photo_width(p) >= 1000, photo_width(p))
                if best is None or score > best[0]: best = (score, p)
            if best:
                show(best[1]['src'])
                return img(best[1]['src'], best[1]['name'])
        if min_w > 360: return photo(360, prefer)
        raise ValueError(f'{vid}: 표지 · 목차 · 간지에 쓸 이 업종 사진이 모자랍니다')

    # ---------------- pages (computed after assembly; placeholders first)
    D = Deck(v)
    PAGE = {}

    def mark(name):
        PAGE[name] = len(D.slides) + 1

    # cover
    cover_p = photo(600, sorted(strong))
    t3a = f'{short}\n{ai} 제안서'
    t3 = t3a if fits(t3a, 48, 505, -0.03) else f'{ai}\n표준 제안서'
    t4 = v['cover'] if t3 == t3a else f'{short} — {v["cover"]}'
    D.add('open', f'표지 · {ai}', {'f': 'L_C01', 't': {'1': '고객사 로고', '2': 'BUSINESS PROPOSAL', '3': t3, '4': t4, '5': '삼성전자 한국총괄 B2B 영업팀', '6': '2026. 11', '7': 'SAMSUNG'},
                                   'img': {'0': cover_p}})
    mark('toc'); D.add('context', '여섯 장(章) 목차 · 사진 카드', None)
    mark('div1'); D.add('context', '간지 · 01 Overview', None)
    mark('dss'); D.add('context', 'Device · Solution · Service 도식', None)
    mark('div2'); D.add('value', f'간지 · 02 {ai}', None)
    mark('needs'); D.add('value', '니즈 · 기술 · 제안 매트릭스', None)
    for k in range(3):
        mark(f'core{k}'); D.add('value', f'{v["P"][k]["prop"]} — {v["P"][k]["chips"][0]} · {v["P"][k]["chips"][1]}', None)
    mark('div3'); D.add('space', '간지 · 03 공간별 제안', None)
    mark('bird'); D.add('space', ('표준 건물 조감도' if building else '공간 조감도') + f' · {N}개 공간 범례', None)
    for i, sp in enumerate(vp['spaces']):
        mark(f'sp{i}'); D.add('space', f'{sp["name"]} — {prod.SHORT[feat[i]]}', None)
    mark('map'); D.add('space', f'{ai} Map — 공간 × 제품', None)
    mark('div4'); D.add('build', f'간지 · 04 {ch4}', None)
    for j, sid in enumerate(order):
        mark(f'sol{j}'); D.add('build', f'{SOL[sid][0]} — 기능 · 적용 공간 · 대표 장면', None)
    mark('div5'); D.add('proof', '간지 · 05 도입사례', None)
    for j, cid in enumerate(cases):
        mark(f'case{j}'); D.add('proof', f'도입사례 · {CASE[cid]["cust"]}', None)
    mark('div6'); D.add('proof6', '간지 · 06 Why Samsung', None)
    for j, (nm, f) in enumerate(WHY_ROWS):
        mark(f'why{j}'); D.add('proof6', 'Why Samsung · ' + nm, None)
    mark('end'); D.add('proof6', 'SAMSUNG 브랜드로 마감', None)
    total = len(D.slides)

    def pg(name): return PAGE[name]
    def rng(a, b): return str(pg(a)) if pg(a) == pg(b) else f'{pg(a)}–{pg(b)}'
    def F(n): return {'cust': '고객사 로고', 'foot': foot, 'page': f'CONFIDENTIAL · {n}'}

    fills = [None] * total
    fills[0] = D.slides[0][2]

    def put(name, fl):
        fills[PAGE[name] - 1] = fl

    # ---------------- images used in several places
    bird_src = f'/assets/vertical-std/{vid}.webp'
    # 간지 · 목차 카드: 장마다 그 장을 보여 주는 이 업종 사진 (덱에 이미 나온 사진은 빼고)
    sol_words = sorted({w for sid in order[:2] for w in SOL_DEVICE_WORDS.get(sid, ())})
    p_ov = photo(700)
    p_ai = photo(700, [w for p in v['P'] for w in re.split(r'[·\s]+', p['prop']) if len(w) >= 2])
    p_sp = photo(700, sorted(space_w))
    p_sol = photo(700, sol_words)
    # 05 간지 · 목차 05 카드: 이 덱 도입사례 고객사의 현장 사진(사례 장에 쓰지 않은 것) — 없으면 같은 업종 다른 삼성 도입사례의 현장 사진
    def case_photo(min_w):
        own = [p for cid in (cases[1], cases[0]) for p in case_photos(cid) + case_details(cid) if p['w'] >= min(min_w, 300) and p['w'] >= p['h'] * 1.1]
        for p in own:
            if unseen(p['src']):
                show(p['src'])
                return img(p['src'], f"{p['name']} · {CASE[next(c for c in cases if p in case_photos(c) + case_details(c))]['cust']}")
        same = [p for p in photos if p.get('case') and p['case'] not in cases and unseen(p['src']) and photo_width(p) >= min_w]
        if same:
            show(same[0]['src'])
            return img(same[0]['src'], f"{same[0]['name']} · {same[0]['cust']}")
        return photo(min_w)
    p_case = case_photo(600)

    def toc_samsung():
        """06 Why Samsung: 삼성 매장 · 서비스 엔지니어 사진(사옥 사진은 Why Samsung 첫 장이 쓴다)"""
        for src, name in SAMSUNG_TOC:
            if unseen(src):
                show(src)
                return img(src, name)
        return photo()

    # ---------------- TOC
    props = [p['prop'] for p in v['P']]
    sol_names = [SOL[s][0] for s in order]
    toc_tags = [
        'Device · Solution · Service',
        ' · '.join(props),
        ' · '.join(sp['name'] for sp in vp['spaces'][:4]) + (f' 외 {N - 4}곳' if N > 4 else ''),
        ' · '.join(sol_names[:3]) + (f' 외 {K - 3}종' if K > 3 else ''),
        ' · '.join(CASE[c]['cust'] for c in cases),
        '전문가 · 오퍼링 · 프로세스 · 브랜드',
    ]
    toc_t = ['Overview', ai, '공간별 제안', ch4, '도입사례', 'Why Samsung']
    toc_s = [f'삼성 AI 비즈니스가 {place}에 주는 가치', f'{who}의 니즈마다 AI 기술로 답하는 세 가지 제안', f'{N}개 공간과 공간마다의 대표 제품',
             f'{K}개 솔루션으로 운영은 가볍게', '같은 업종의 삼성 공식 도입사례', '끝까지 책임지는 비즈니스 파트너']
    toc_p = ['p.' + rng('div1', 'dss'), 'p.' + rng('div2', 'core2'), 'p.' + rng('div3', 'map'), 'p.' + rng('div4', f'sol{K - 1}'), 'p.' + rng('div5', 'case1'), 'p.' + rng('div6', 'end')]
    toc_img = [photo(), photo(360, [w for p in v['P'] for w in re.split(r'[·\s]+', p['prop']) if len(w) >= 2]), photo(360, sorted(space_w)),
               photo(360, sol_words), case_photo(360), toc_samsung()]
    vals = {'eb': 'CONTENTS', 'title': '목차', 'sub': f'{short} · {ai} 표준 제안서 · 6개 장', **F(pg('toc'))}
    ims = {}
    for k in range(6):
        vals[f'c{k}t'] = clip(toc_t[k], 20, 252)
        vals[f'c{k}p'] = toc_p[k]
        vals[f'c{k}s'] = clip(toc_s[k], 16, 368)
        vals[f'c{k}tags'] = clip(toc_tags[k], 14, 368)
        ims[f'c{k}img'] = toc_img[k]
    put('toc', fill('L_VS_TOC', vals, ims))

    # ---------------- dividers
    def divider(name, n, chap, title, sub, rows, bg):
        vals = {'cust': '고객사 로고', 'chapter': f'0{chap} / 06', 'title': title, 'sub': sub, 'page': f'CONFIDENTIAL · {pg(name)}'}
        for r, (item, p) in enumerate(rows):
            vals[f'r{r}'] = clip(item, 16, 290)
            vals[f'r{r}p'] = p
        put(name, fill(f'L_VS_DIV_R{n}', vals, {'bg': bg}))

    divider('div1', 1, 1, 'Overview', clip(f'삼성 AI 비즈니스가 {short}에 주는 가치', 18, 700), [('삼성 AI 비즈니스', str(pg('dss')))], p_ov)
    divider('div2', 4, 2, ai, clip(f'{who}의 니즈마다 삼성 AI 기술로 답하는 세 가지 제안', 18, 700),
            [(f'{ai} 핵심 제안', str(pg('needs')))] + [(v['P'][k]['prop'], str(pg(f'core{k}'))) for k in range(3)], p_ai)
    divider('div3', 3, 3, '공간별 제안', clip(f'{short}의 {N}개 공간, 공간마다 대표 제품', 18, 700),
            [(('표준 건물 조감도' if building else '공간 조감도') + f' · {N}개 공간', str(pg('bird'))), ('공간별 대표 제품', rng('sp0', f'sp{N - 1}')), (f'{ai} Map', str(pg('map')))], p_sp)
    rows4 = []
    for j in range(0, K, 2):
        pair = order[j:j + 2]
        rows4.append((' · '.join(SOL[s][0] for s in pair), rng(f'sol{j}', f'sol{j + len(pair) - 1}')))
    divider('div4', len(rows4), 4, ch4, clip(f'{K}개 솔루션으로 {place} 운영을 가볍게', 18, 700), rows4, p_sol)
    divider('div5', 2, 5, '도입사례', clip(f'{place} 업종 고객의 삼성 공식 도입사례', 18, 700), [(CASE[c]['cust'], str(pg(f'case{j}'))) for j, c in enumerate(cases)], p_case)
    divider('div6', 5, 6, 'Why Samsung', '전문가 · 오퍼링 · 프로세스 · 브랜드로 끝까지 책임집니다', [(nm, str(pg(f'why{j}'))) for j, (nm, _) in enumerate(WHY_ROWS)], img(*TECHNICIAN))

    # ---------------- 01 DSS
    fam = prod.families(CATGROUP)
    fscore = []
    for fi, (fk, fname, fn) in enumerate(fam):
        cnt = sum(1 for sp in vp['spaces'] if any(fn(c) for c in sp['products']))
        if not cnt: continue
        cats = collections.Counter(c for sp in vp['spaces'] for c in sp['products'] if fn(c) and c in prod.P)
        rep = next((c for c in FAMILY_REP.get(fk, ()) if c in cats), None) or (max(cats, key=lambda c: (cats[c], prod.PRI.get(c, 0))) if cats else None)
        if rep: fscore.append((cnt, -fi, fname, rep))
    fscore.sort(reverse=True)
    devs = fscore[:5]
    while len(devs) < 5:
        for extra in [('MOB', 'Galaxy AI 모바일', 'phone'), ('SAC', '시스템에어컨', 'sac_sm'), ('SIG', '스마트 사이니지', 'lcd_std'), ('LIV', 'Bespoke AI 리빙가전', 'air')]:
            if len(devs) >= 5: break
            if not any(d[2] == extra[1] for d in devs): devs.append((0, 0, extra[1], extra[2]))
    dsol = [SOL[s][0] for s in order][:5]
    for extra in ['SmartThings Pro', 'Knox', 'VXT CMS', '파트너 AI 솔루션', '삼성케어플러스']:
        if len(dsol) >= 5: break
        if extra not in dsol: dsol.append(extra)
    serv = ['업종 맞춤 컨설팅', '공조 케어 · 전문 세척' if 'svc_sac' in order else '전문 설치 · 시공', '업무 기기 보증 연장' if 'svc_mobile' in order else 'B2B 전문 A/S']
    vals = {'eb': '01 · OVERVIEW', 'title': clip(f'{place}에 필요한 AI, Device · Solution · Service로 한 번에', 32, 1150, ''),
            'sub': '최적의 Device · Solution · Service로 고객이 언제 어디서나 AI를 누리도록, 차별적 비즈니스 가치와 지속 성장을 지원합니다.', **F(pg('dss'))}
    ims = {}
    for r in range(5):
        vals[f'd{r}'] = clip(devs[r][2], 18, 210)
        src, fit, name = key_img(devs[r][3])
        ims[f'd{r}img'] = img(src, name, 'contain')
        vals[f's{r}'] = clip(dsol[r], 18, 280)
    for k in range(3): vals[f'v{k}'] = serv[k]
    put('dss', fill('L_VS_DSS', vals, ims))

    # ---------------- 02 needs + cores
    vals = {'eb': f'02 · {ai}', 'title': clip(f'{who}의 세 가지 니즈에 삼성 AI 기술로 답합니다', 32, 1150), 'sub': clip(f'{props[0]} · {props[1]} · {props[2]} — {ai}로 바꾸는 세 가지 제안', 18, 1150),
            'h1': clip(ai, 24, 280), **F(pg('needs'))}
    ims = {}
    for r, p in enumerate(v['P']):
        vals[f'q{r}'] = '“' + p['quote'] + '”'
        vals[f't{r}'] = p['tech']
        vals[f't{r}n'] = p['note']
        vals[f'p{r}'] = p['prop']
        for c in range(2): vals[f'p{r}c{c}'] = p['chips'][c]
        src, fit, name = key_img(p['tkey'], small=p['tkey'] in SOL)
        ims[f't{r}img'] = img(src, name, fit)
    put('needs', fill('L_VS_NEEDS', vals, ims))
    for k, p in enumerate(v['P']):
        vals = {'eb': f'02 · {ai} · {p["prop"]}', 'title': clip(p['head'], 32, 1150), 'sub': clip(p['sub'], 18, 1150), **F(pg(f'core{k}'))}
        ims = {}
        for r, s in enumerate(p['subs']):
            vals[f'r{r}t'] = s['title']
            vals[f'r{r}tag'] = s['tag']
            vals[f'r{r}d'] = s['desc']
            for j in range(3): vals[f'r{r}s{j}'] = s['steps'][j]
            src, fit, name = key_img(s['key'])
            ims[f'r{r}img'] = img(src, name, fit)
        put(f'core{k}', fill(f'L_VS_CORE_{k + 1}', vals, ims))

    # ---------------- 03 bird + spaces + map
    floor_of = BLD_FLOOR.get(vid, {})
    n_floors = len(set(floor_of.values()))
    vals = {'eb': '03 · 공간별 제안', 'title': clip(f'{short}의 {N}개 공간', 32, 1150),
            'sub': clip((f'표준 건물 조감도 · {n_floors}개 층에 나눈 {N}개 공간과 공간별 대표 제품' if building else f'공간 조감도 · 한 층에 놓은 {N}개 공간과 공간별 대표 제품'), 18, 1150), **F(pg('bird'))}
    for r, sp in enumerate(vp['spaces']):
        vals[f's{r}'] = sp['name']
        # 대표 제품 먼저, 한 줄에 들어가는 만큼 그 공간의 다른 제품을 잇는다 (건물은 층 표시를 앞에)
        names = space_products(sp, feat[r])
        head = f'{floor_of[r + 1]}F · ' if building else ''
        line = head + names[0]
        for n2 in names[1:]:
            if not fits(line + ' · ' + n2, 14, 238): break
            line += ' · ' + n2
        vals[f's{r}p'] = line if fits(line, 14, 238) else names[0]
    if 'note' in SCHEMA[bird_f]['keys']:
        vals['note'] = f'번호 순서대로 다음 장부터 공간마다 대표 제품과 쓰임을 한 장씩 소개하고, 공간 × 제품 전체는 {ai} Map(p.{pg("map")})에서 한 번에 봅니다.'
    put('bird', fill(bird_f, vals, {'img': img(bird_src, f'{short} ' + ('표준 건물 조감도' if building else '공간 조감도'), 'contain')}))
    scenes = []
    for i, sp in enumerate(vp['spaces']):
        c = feat[i]
        # 대표 제품과 한 문장은 함께 고른다 — 맞는 시나리오가 없는 공간만 제품 기준 문장(scene_match.ROLE)
        scene = polite(picks[i][1] or scene_match.role(c, sp['name'], ind))
        scenes.append(scene)
        name, feats = prod.P[c][1], scene_match.tailor(c, prod.P[c][3], ind, sp['name'])
        src = prod.image_of(c)
        # 왼쪽 공간 사진 | 오른쪽 제품 이름 → key message(이 공간에서 제품이 하는 일) → 제품 컷 + 특징 2
        vals = {'eb': f'03 · 공간별 제안 · {i + 1:02d}', 'title': clip(sp['name'], 32, 1150), 'msg': scene, 'prod': clip(name, 24, SCHEMA['L_VS_SPACE']['box']['prod'][0]), **F(pg(f'sp{i}'))}
        for r in range(2): vals[f'f{r}t'], vals[f'f{r}d'] = feats[r]
        put(f'sp{i}', fill('L_VS_SPACE', vals, {'img': img(src, name, 'cover' if c in prod.PHOTO else 'contain'), 'space': space_img[sp['id']]}))
    vals = {'eb': '03 · 공간별 제안', 'title': clip(f'{ai} Map', 32, 1150), 'sub': clip(f'{N}개 공간 × 삼성 제품 — 공간마다 놓이는 제품을 한눈에', 18, 1150), **F(pg('map'))}
    ims = {}
    box_w = SCHEMA[f'L_VS_MAP_{N}']['box']['s0p'][0]
    for k, sp in enumerate(vp['spaces']):
        # 제품 다음에 그 공간의 솔루션까지 — 두 줄(칸 너비 × 2)에 들어가는 만큼, 나머지는 '외 N종'
        names = space_products(sp, feat[k]) + [SOL[c][0] for c in sp['products'] if c in SOL]
        for cut in range(len(names), 0, -1):
            lst = ' · '.join(names[:cut]) + (f' 외 {len(names) - cut}종' if cut < len(names) else '')
            if width(lst, 14) <= box_w * 1.8: break
        vals[f's{k}'] = sp['name']
        vals[f's{k}p'] = lst
        if f's{k}d' in SCHEMA[f'L_VS_MAP_{N}']['keys']:
            dw = SCHEMA[f'L_VS_MAP_{N}']['box'][f's{k}d'][0]
            vals[f's{k}d'] = scenes[k] if width(scenes[k], 16) <= dw * 3.6 else clip(scenes[k], 16, dw * 3.6)
        c = feat[k]
        # 지도 칸은 가로로 넓고 낮아서 키 큰 제품(에어드레서 · 공기청정기 · 냉장고) 컷은 가는 막대로만 보인다 — 그 공간의 다른 제품 컷으로
        if c in TALL:
            c = next((x for x in sp['products'] if x in prod.P and x not in TALL and not x.startswith('s_')), c)
        ims[f's{k}img'] = img(prod.image_of(c), prod.P[c][1], 'cover' if c in prod.PHOTO else 'contain')
    put('map', fill(f'L_VS_MAP_{N}', vals, ims))

    # ---------------- 04 solutions
    for j, sid in enumerate(order):
        f, mode, n = SOLS_L[sid]
        items = sol_items(sid, mode, n, used)
        sp_names = s_spaces[sid]
        sp_txt = ' · '.join(sp_names[:3]) + (f' 외 {len(sp_names) - 3}곳' if len(sp_names) > 3 else '')
        vals = {'eb': f'04 · {ch4} · {j + 1:02d}', 'title': clip(SOL[sid][1].format(place=place), 32, 1150), 'sub': clip(SOL[sid][2], 18, 1150),
                'spaces': sp_txt, 'scene': polite(scen[sid][1]), **F(pg(f'sol{j}'))}
        for i2, (t, b) in enumerate(items):
            vals[f'i{i2}t'], vals[f'i{i2}b'] = t, b
        if sid == 's_health':
            data = [f for g in SOLCAT[sid]['groups'] if g['id'].endswith('.data') for f in g['features']]
            for i2, f2 in enumerate(data[:5]): vals[f'c{i2}'] = chip_name(f2)
        spec = dict(sols.IMGS[sid]); spec.update(sols.GROUP_IMGS.get((sid, group), {})); spec.update(sols.VERT_IMGS.get((sid, vid), {}))
        if sid == 's_vxt':
            gmap = {'create': 35, 'ops': 59, 'rm': 61, 'epaper': prod.image_of('epaper'), 'apps': 33, 'player': 66}
            chosen = [g for g in SOLCAT[sid]['groups'] if clean(g['name']) in [it[0] for it in items]]
            spec = {f'img{i2}': [gmap.get(g['id'].split('.')[-1], 35)] for i2, g in enumerate(chosen)}
            if group in ('FB',) and 'img1' in spec and chosen[1]['id'].endswith('.ops'): spec['img1'] = [39]
        ims = {}
        for k2, lst in spec.items():
            c = lst[0]
            src = media(c) if isinstance(c, int) else c
            nm = f'{SOL[sid][0]} 화면'
            if isinstance(c, int):
                for sk, sv in MEDIA['sol'].items():
                    for g in sv['g']:
                        if g[0] == c: nm = g[2]
            ims[k2] = img(src, nm, 'contain' if f in ('L_VS_SOL_DMS', 'L_VS_SOL_HEALTH', 'L_VS_SOL_BOOKEE', 'L_VS_SOL_WIFI', 'L_VS_SOL_COUNTHRU') else 'cover')
        put(f'sol{j}', fill(f, vals, ims))

    # ---------------- 05 cases
    for j, cid in enumerate(cases):
        c = CASE[cid]
        pts = []
        offer, needs_, proof = c.get('offer') or [], c.get('needs') or [], c.get('proof') or []
        for k in range(3):
            t = offer[k] if k < len(offer) else (needs_[k] if k < len(needs_) else c['sub'])
            d = needs_[k] if k < len(needs_) else ''
            if k < len(proof): d = (d + ' — ' + proof[k]) if d else proof[k]
            if not d: d = c.get('quote') or c['title']
            t = re.sub(r'\s+', ' ', t).strip()
            pts.append((clip(t, 20, 494 * 2 - 30), d))
        sub = clip(f'{c.get("type") or c["indRaw"]} — {c["sub"] or c["title"]}', 18, 1150)
        vals = {'eb': '05 · 도입사례', 'title': clip(c['cust'], 32, 1150), 'sub': sub, 'src': clip(f'원문 · samsung.com 도입사례 · {c["date"][:7].replace("-", ". ")}', 14, 490), **F(pg(f'case{j}'))}
        for k, (t, d) in enumerate(pts): vals[f'p{k}t'], vals[f'p{k}d'] = t, d
        ims = {f'img{k}': img(p['src'], p['name']) for k, p in enumerate(case_imgs[cid][:4])}
        put(f'case{j}', fill('L_VS_CASE', vals, ims, r=[[f'도입사례 · {c["cust"]}', c['url']]]))

    # ---------------- 06 why + end (identical content)
    for j, (nm, f) in enumerate(WHY_ROWS):
        ims = {k: img(src, name) for k, (src, name) in {**WHY_IMG[f], **WHY_IMG_FIX.get(f, {})}.items()}
        put(f'why{j}', fill(f, F(pg(f'why{j}')), ims))
    put('end', fill('L_VS_END', {'cust': '고객사 로고', 'foot': foot}, {k: img(src, name) for k, (src, name) in WHY_IMG['L_VS_END'].items()}))

    assert all(fills), [i for i, x in enumerate(fills) if not x]

    # ---------------- scenario + story
    stage_names = {'open': ('표지', '제안 전체를 먼저 보여 준다'), 'context': ('목차 · 01 Overview', f'여섯 장의 흐름과 삼성 AI 비즈니스가 {place}에 주는 가치'),
                   'value': (f'02 {ai}', f'{who}의 니즈마다 AI 기술로 답한다'), 'space': ('03 공간별 제안', f'{N}개 공간 · 공간별 대표 제품'),
                   'build': (f'04 {ch4}', f'{K}개 솔루션으로 운영을 바꾼다'), 'proof': ('05 도입사례', '같은 업종의 공식 도입사례'),
                   'proof6': ('06 Why Samsung', '끝까지 책임지는 공급사, 브랜드로 닫는다')}
    flow = []
    for (stage, role, _), fl in zip(D.slides, fills):
        key = 'proof' if stage == 'proof6' else stage
        nm, goal = stage_names[stage]
        if not flow or flow[-1]['name'] != nm:
            flow.append({'key': key, 'name': nm, 'goal': goal, 'slides': []})
        flow[-1]['slides'].append({'f': fl['f'], 'role': role})
    products = []
    for c in feat:
        pid = prod.P[c][0]
        if pid in P_IDS and pid not in products: products.append(pid)
    sol_ids = []
    for sid in order:
        s_id = SOL[sid][3]
        if s_id and s_id in S_IDS and s_id not in sol_ids: sol_ids.append(s_id)
    if any(c == 'sac_cold' for sp in vp['spaces'] for c in sp['products']) and 'coldchain' not in sol_ids: sol_ids.append('coldchain')
    if any(c in ('sac_l_out', 'sac_ctr') for sp in vp['spaces'] for c in sp['products']) and 'hvac' not in sol_ids: sol_ids.append('hvac')
    techs = [p['tech'] for p in v['P']]
    ask = f'{N}개 공간 중 우선 적용 공간 선정과 현장 실사 일정 합의'
    sid_ = 'bs_std_' + vid
    scenario = {
        'id': sid_, 'req': 'std', 'std': True, 'ind': ind, 'strategy': 'value', 'ending': 'workshop',
        'minutes': max(20, int(round(total * 1.0 / 5.0)) * 5),
        'title': f'{short} · {ai} 표준 제안서',
        'short': f'Overview → {ai} 세 가지 제안 → 공간 {N}곳 → 솔루션 {K}종 → 도입사례 → Why Samsung',
        'situation': f'{short}에 삼성 AI 제품 · 솔루션을 처음 소개하는 자리입니다. {who}의 세 가지 니즈({props[0]} · {props[1]} · {props[2]})에 답하고, {N}개 공간마다 놓이는 대표 제품과 {K}개 솔루션, 같은 업종의 도입사례까지 표준 구성으로 보여 준 뒤 실사 범위를 정합니다.',
        'signals': ['“' + p['quote'] + '”' for p in v['P']] + ['“삼성 제품과 솔루션을 한 번에 보고 싶어요”'],
        'audience': {'lead': v['lead'], 'others': v['others']},
        'criteria': [f'{who} 경험', '운영 인력 · 관리 효율', '공간별 적용 범위', '도입 사례 · 공급사 신뢰'],
        'thesis': f'“{v["cover"]}” — Device · Solution · Service로 짠 {ai}를 공간 순서대로 보여 주고, 솔루션과 도입사례로 운영까지 증명한다.',
        'logic': ['삼성 AI 비즈니스 — Device · Solution · Service', f'{who} 니즈 셋에 AI 기술로 답한다 — ' + ' · '.join(props), f'{N}개 공간 · 공간마다 대표 제품 · {ai} Map',
                  f'{K}개 솔루션 — ' + ' · '.join(sol_names[:3]) + (' 등' if K > 3 else ''), '같은 업종 공식 도입사례 두 건', '전문가 · 오퍼링 · 프로세스 · 브랜드로 끝까지 책임'],
        'diff': [' · '.join(dict.fromkeys(techs)) + f'를 한 흐름으로 묶은 {ai}', ' · '.join(sol_names[:3]) + '로 운영까지 연결', '배송 · 설치 · 유지보수까지 하나의 공급사'],
        'tone': '표준 양식의 언어로 · 공간 장면과 공식 사진 중심',
        'messages': [v['cover'], ' · '.join(props), '같은 구성을 먼저 도입한 고객이 있습니다'],
        'flow': flow,
        'ask': ask,
        'next': ['우선 적용 공간 · 운영 담당자 확인', '모델 · 설치 · 네트워크 · 연동 조건 실사', '시범 범위와 일정 합의'],
        'prep': ['현장 도면 · 공간 목록', '기존 장비 · 제어기 현황', '네트워크 · 보안 · 운영 조건'],
        'products': products[:10], 'solutions': sol_ids, 'cases': cases,
        'kpis': [f'{who} 만족도', '운영 인력 · 관리 시간', '에너지 사용량', '적용 범위 확정'],
        'objections': [['모델과 수량은 어떻게 정하나요?', '설치 공간 · 전원 · 네트워크와 운영 조건을 확인한 뒤 지원 모델과 수량을 합의합니다.'],
                       ['기존 장비 · 시스템과 연동되나요?', '현장 실사에서 기존 제어기 · 시스템을 확인하고 연동 범위와 책임을 정합니다.']],
        'fit': f'{short}에 삼성 제품 · 솔루션을 처음 제안하는 자리', 'avoid': '확정 도면과 최종 견적만 필요한 발주 단계',
        'vs': {'id': vid, 'group': group, 'groupName': GROUPS.get(group, group), 'name': vp['name'], 'size': vp.get('size_segment', ''),
               'spaces': N, 'solutions': K, 'slides': total, 'spaceNames': [sp['name'] for sp in vp['spaces']], 'building': building},
    }
    others = v['others']
    w = [40, 25, 20, 15] if len(others) >= 3 else ([45, 30, 25] if len(others) == 2 else [60, 40])
    km = [[v['lead'], w[0], [v['P'][0]['prop'] + ' — ' + v['P'][0]['chips'][0], '공간마다 무엇이 놓이는지 한 번에 보기']]]
    pool_r = [[v['P'][1]['prop'], v['P'][1]['chips'][1]], [v['P'][2]['prop'], v['P'][2]['chips'][0]], ['적용 범위 · 일정', '현장 실사 조건']]
    for i, o in enumerate(others[:len(w) - 1]):
        km.append([o, w[i + 1], pool_r[i % len(pool_r)]])
    assert sum(x[1] for x in km) == 100
    parts = {}
    for g in flow:
        if g['key'] == 'open': continue
        typ = {'context': 'overview', 'value': 'value', 'space': 'products', 'build': 'solution'}.get(g['key'], 'case' if g['name'].startswith('05') else 'why')
        parts[g['name']] = {'type': typ, 'items': [x['role'] for x in g['slides']][:6]}
    story = {'keymen': km, 'note': f'특정 RFP 없음 — {short} 표준 구성으로 공간별 적용 범위를 보여 주고 실사 범위를 정하는 첫 제안.', 'parts': parts}
    return scenario, fills, story, short


def main():
    V = parse_content()
    assert set(V) == {v['id'] for v in VP['verticals']}, set(v['id'] for v in VP['verticals']) ^ set(V)
    out = {'scenarios': [], 'fills': {}, 'story': {}, 'customers': {}, 'sources': {'generated': '2026-11-11', 'from': ['app/data/vertical_space_product.json', 'app/data/vertical_space_solution.json'],
                                                                                  'note': '44개 업종 표준 제안서 — 목차 6장 고정, 업종마다 내용 · 공간 수 · 솔루션만 다름 (app/scripts/vertical_standard/build.py)'}}
    for vp in VP['verticals']:
        s, fl, st, cust = build_vertical(V[vp['id']])
        out['scenarios'].append(s); out['fills'][s['id']] = fl; out['story'][s['id']] = st; out['customers'][s['id']] = cust
    return out


if __name__ == '__main__':
    out = main()
    path = ROOT + '/app/web/src/domain/templates/standard_vertical_scenarios.json'
    json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    n = sum(len(x) for x in out['fills'].values())
    print(len(out['scenarios']), 'scenarios', n, 'slides', os.path.getsize(path) // 1024, 'KB')
