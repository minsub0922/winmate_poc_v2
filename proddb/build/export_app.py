"""제품 DB(winmate_products.sqlite) → Winmate v2 앱 데이터.
  data/products_db.json   탐색기 · @검색 · 추천 · 태그 카드가 쓰는 제품 목록(가벼운 필드) + 기존 큐레이션 40개에 붙일 사이트 대응
  img/prod/d<NN>.json     제품 상세(옵션 모델 · 스펙 · 특장점 · 카탈로그 등장) — hover 상세가 처음 열 때 받음
  (썸네일 · 갤러리 묶음 img/prod/t<NN>.json · g<NN>.json 은 pack_images.py)
값은 DB(사이트 · 카탈로그 원문)에서만 온다. spaces · ind · kw 는 원문(이미지 설명 · 업종 페이지 링크 · 사례 링크 · 필터 라벨)에서 뽑은 색인이다."""
import json, sqlite3, re, os, sys, collections, math, copy
HERE = os.path.dirname(os.path.abspath(__file__))
DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'winmate_products.sqlite')
APP = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..')  # winmatev2 앱 폴더
PAGES = os.environ.get('PAGES', os.path.join(HERE, '..', 'raw', 'v1_wkb_pages_v2.json'))  # v1 winmate-kb 수집(2026-10-04) 업종 · 사례 페이지
d = sqlite3.connect(DB); d.row_factory = sqlite3.Row
q = lambda s, *a: d.execute(s, a).fetchall()
CAT = json.load(open(os.path.join(APP, 'data/catalog.json')))
CUR = CAT['products']; CASES = CAT['cases']
FAM_ORDER = ['디스플레이', '공조 · 에어컨', '모바일 · PC', '프린팅', '주방 · 리빙 가전', '조명', '오디오', '기타']

# ── 큐레이션 40개 ↔ 사이트 카드 (모델코드가 같은 것만; 같은 카드에 여럿이면 모두 그 카드의 옵션 · 상세를 함께 씀) ──
CUR_GOODS = {'qm55c': 'G000182628', 'qm65c': 'G000182628', 'qm43c': 'G000182628', 'qm85c': 'G000182628', 'qb55c': 'G000182632',
             'oh55a': 'G000183218', 'vm55b': 'G000181579', 'window': 'G000181132', 'flip': 'G000181564', 'tabs11': 'G000183933',
             'xcover7': 'G000183750', 'dvmchiller': 'G500137224', 'ehs': 'G000184153'}
# 사이트 대응이 없는 큐레이션 항목의 탐색기 분류(사이트 목록 이름에 맞춤, 없으면 큐레이션 분류 그대로)
CUR_SC = {'LCD 사이니지': '스마트 LCD 사이니지', '옥외 사이니지': '스마트 LCD 사이니지', '비디오월': '스마트 LCD 사이니지', '전자칠판': '스마트 LCD 사이니지',
          'LED 사이니지': '스마트 LED 사이니지', '호텔 TV': '호텔TV', '모니터': '모니터', '공조 · 환기': '환기 솔루션', '갤럭시 탭': '갤럭시 탭',
          '갤럭시 스마트폰': '스마트폰', '갤럭시 워치 · 태그': '갤럭시 워치', 'PC · 노트북': '노트북', '하만 프로 오디오': '하만 프로 오디오'}
CUR_SC_ID = {'purifier': '공기청정기', 'airdresser': '에어드레서', 'bi_induction': '전기레인지', 'bi_dish': '식기세척기', 'bi_fridge': '냉장고'}
CUR_FAM = {'디스플레이': ['LCD 사이니지', '옥외 사이니지', 'LED 사이니지', '비디오월', '키오스크', '컬러 이페이퍼', '전자칠판', '시네마 LED', '호텔 TV', '모니터'],
           '공조 · 에어컨': ['시스템에어컨', '공조', '공조 · 환기', '히트펌프'], '모바일 · PC': ['갤럭시 스마트폰', '갤럭시 탭', '갤럭시 워치 · 태그', 'PC · 노트북'],
           '주방 · 리빙 가전': ['빌트인 주방가전', '리빙가전', '상업용 세탁 · 건조'], '오디오': ['하만 프로 오디오']}
cur_fam = {c: f for f, cs in CUR_FAM.items() for c in cs}

# ── 공간 어휘 → 업종 (이미지 설명 · 특장점 글에서 찾음) ──
SPACES = [  # (표시 이름, 찾는 말들, 업종)
  ('객실', ['객실', '호텔 방'], ['HT']), ('로비', ['로비'], ['HT', 'OF', 'FN']), ('라운지', ['라운지'], ['HT', 'OF']),
  ('회의실', ['회의실', '미팅룸', '회의 공간'], ['OF', 'ED']), ('사무실', ['사무실', '오피스', '업무 공간', '사무 공간'], ['OF']),
  ('강의실', ['강의실', '교실', '강당'], ['ED']), ('학교', ['학교', '캠퍼스', '학원'], ['ED']), ('도서관', ['도서관'], ['ED', 'PB']),
  ('매장', ['매장', '스토어', '쇼핑몰', '리테일'], ['RT', 'FB']), ('쇼룸', ['쇼룸', '전시장', '전시 공간'], ['RT', 'TP']), ('쇼윈도', ['쇼윈도', '윈도우 디스플레이'], ['RT']),
  ('카페', ['카페', '커피'], ['FB']), ('레스토랑', ['레스토랑', '식당', '음식점'], ['FB']), ('메뉴보드', ['메뉴보드', '메뉴 보드'], ['FB']),
  ('카운터', ['카운터', '계산대'], ['FB', 'RT']), ('드라이브스루', ['드라이브스루', '드라이브 스루'], ['FB']),
  ('병원', ['병원', '병실', '진료', '의원', '클리닉', '요양'], ['MD']), ('은행 창구', ['은행', '창구', '금융'], ['FN']),
  ('관제실', ['관제', '상황실', '통제실', '컨트롤룸'], ['PB', 'MF']), ('공장', ['공장', '생산 라인', '제조 현장'], ['MF']), ('물류 창고', ['물류', '창고'], ['MF']),
  ('현장', ['건설 현장', '작업 현장', '산업 현장', '야외 작업'], ['MF', 'PB']), ('공항 · 역', ['공항', '역사', '터미널', '지하철'], ['PB', 'AD']),
  ('옥외', ['옥외', '실외', '야외', '외벽', '건물 외관'], ['AD', 'PB']), ('경기장', ['경기장', '스타디움', '야구장'], ['VN']), ('공연장', ['공연장'], ['VN']),
  ('영화관', ['영화관', '상영관'], ['VN']), ('주방', ['주방', '키친', '다이닝'], ['RS', 'ID']), ('거실', ['거실', '리빙룸'], ['RS']),
  ('침실', ['침실', '안방'], ['RS']), ('드레스룸', ['드레스룸', '옷장'], ['RS']), ('세탁실', ['세탁실', '다용도실', '베란다'], ['RS']),
  ('아파트', ['아파트', '세대', '공동주택'], ['RS']), ('주택', ['주택', '단독주택'], ['RS']), ('기숙사', ['기숙사'], ['ED']),
  ('편의점', ['편의점', '무인 매장', '무인매장'], ['SV']), ('세탁소', ['코인 세탁', '빨래방', '세탁소'], ['SV']), ('엘리베이터', ['엘리베이터'], ['OF', 'RS']),
  ('기계실', ['기계실'], ['OF']), ('데이터센터', ['데이터센터', '서버실'], ['OF']), ('콜드체인', ['냉장 쇼케이스', '냉동 쇼케이스', '냉동 창고', '저온 창고', '콜드체인'], ['FB', 'RT', 'MF']),
]
# 사이트 목록별 기본 업종 · 공간(원문에서 아무것도 못 찾았을 때만)
CAT_DEF = {
  'smart-signage': (['RT', 'FB', 'OF', 'PB'], ['매장', '로비']), 'led-signage': (['RT', 'AD', 'VN', 'OF'], ['로비', '옥외']), 'hotel-tvs': (['HT', 'MD'], ['객실']),
  'tvs': (['OF', 'HT', 'RS'], ['회의실', '라운지']), 'monitors': (['OF', 'ED', 'FN'], ['사무실']), 'display-solution': (['RT', 'FB', 'OF'], ['매장']),
  'tv-vd-solution': (['HT', 'OF'], ['객실']), 'dvms': (['OF', 'HT', 'MD', 'ED'], ['사무실']), 'cooling-single': (['OF', 'FB', 'RT', 'ED'], ['사무실', '매장']),
  'cooling-for-residential': (['RS'], ['아파트']), 'heat-pump-boilers': (['RS'], ['주택']), 'ventilations': (['OF', 'ED', 'RS'], ['사무실']),
  'central-air-conditionings': (['OF', 'HT', 'MF'], ['기계실']), 'Cold_Chain_System': (['FB', 'RT', 'MF'], ['콜드체인']), 'air-conditioners': (['RS', 'FB', 'SV'], ['매장']),
  'sac-solution': (['OF', 'HT', 'RS'], ['사무실']), 'ac-clean': (['OF', 'FB'], ['사무실']), 'air-conditioners-care-service': (['OF', 'FB'], ['사무실']),
  'smartphones': (['OF', 'FN', 'MF'], ['사무실']), 'tablets': (['ED', 'FN', 'RT', 'MF'], ['강의실']), 'watches': (['MF', 'MD'], ['현장']), 'buds': (['OF'], ['사무실']),
  'rings': (['MD'], []), 'mobile-accessories': (['OF'], []), 'xr': (['ED', 'MF', 'TP'], ['강의실']), 'notebook': (['OF', 'ED', 'FN'], ['사무실']),
  'desktop': (['OF', 'ED', 'FN'], ['사무실']), 'chromebooks': (['ED'], ['강의실']), 'mobile-solution': (['OF', 'FN', 'MF', 'ED'], ['사무실']),
  'digital-multifunction-printers': (['OF', 'ED', 'PB'], ['사무실']), 'general-multifunction-printers': (['OF', 'ED', 'SV'], ['사무실']),
  'multifunction-printers-supplies': (['OF'], ['사무실']), 'printing-solution': (['OF', 'PB'], ['사무실']), 'printing-solutions': (['OF', 'PB'], ['사무실']),
  'refrigerator': (['RS', 'FB', 'ID'], ['주방']), 'kimchi-refrigerators': (['RS', 'ID'], ['주방']), 'dish-washer': (['RS', 'ID', 'FB'], ['주방']),
  'electric-range': (['RS', 'ID'], ['주방']), 'micro-wave-ovens': (['RS', 'OF'], ['주방']), 'qooker': (['RS', 'ID'], ['주방']), 'water-purifier': (['RS', 'OF', 'ID'], ['주방']),
  'hood': (['RS', 'ID'], ['주방']), 'accessories': (['RS', 'ID'], ['주방']), 'washing-machines': (['RS', 'SV', 'HT'], ['세탁실']), 'dryers': (['RS', 'SV', 'HT'], ['세탁실']),
  'airdresser': (['RS', 'HT'], ['드레스룸']), 'shoedresser': (['RS'], []), 'air-cleaners': (['OF', 'ED', 'MD', 'RS'], ['사무실']), 'vacuum-cleaners': (['RS', 'OF'], ['거실']),
  'led-lights': (['RS', 'OF'], ['거실', '사무실']), 'harman': (['VN', 'RT', 'HT'], ['공연장']), 'soho': (['SV', 'FB', 'OF'], ['매장']),
}
IND_SLUG = {'government': ['PB'], 'military': ['PB'], 'manufacture': ['MF'], 'finance': ['FN'], 'education': ['ED'], 'academy': ['ED'], 'construction': ['RS'],
            'officetel': ['RS'], 'office': ['OF'], 'small-medium-office': ['OF'], 'transportation': ['RT'], 'restaurant-business': ['FB'], 'transport': ['MF', 'PB'],
            'hospital': ['MD'], 'clinic': ['MD'], 'hospitality': ['HT'], 'telecommunication': ['OE']}

fams = {r['id']: dict(r) for r in q('SELECT f.*, c.code AS cat_code, c.name_ko AS cat_name, c.family_group FROM product_family f JOIN category c ON c.id=f.category_id')}
models = collections.defaultdict(list)
for r in q('SELECT * FROM product_model ORDER BY family_id, rowid'): models[r['family_id']].append(dict(r))
model_fam = {m['model_code']: f for f, ms in models.items() for m in ms}
specs = collections.defaultdict(list)
for r in q('SELECT family_id, goods_id, model_code, group_name, attr_name, value_raw FROM spec_value ORDER BY family_id, goods_id, seq'): specs[r['family_id']].append(dict(r))
feats = collections.defaultdict(list)
for r in q('SELECT * FROM feature_block ORDER BY family_id, seq'): feats[r['family_id']].append(dict(r))
imgs = collections.defaultdict(list)
for r in q('SELECT * FROM image_asset ORDER BY family_id, role, seq'): imgs[r['family_id']].append(dict(r))
tags = collections.defaultdict(list)
for r in q('SELECT * FROM product_tag'): tags[r['family_id']].append(dict(r))
cats_of = collections.defaultdict(list)
for r in q('SELECT fc.family_id, c.code, c.name_ko FROM family_category fc JOIN category c ON c.id=fc.category_id'): cats_of[r['family_id']].append((r['code'], r['name_ko']))
ecat = collections.defaultdict(list)
for r in q("SELECT m.family_id, m.dir, m.page, m.surface, m.model_code, m.method, m.snippet, c.title FROM catalog_mention m JOIN catalog_doc c ON c.dir=m.dir WHERE m.family_id IS NOT NULL ORDER BY m.dir, m.page"):
    ecat[r['family_id']].append(dict(r))
cprod = [dict(r) for r in q('SELECT * FROM catalog_product')]
cdocs = {r['dir']: dict(r) for r in q('SELECT * FROM catalog_doc')}
cpf = collections.defaultdict(list)
for r in q('SELECT * FROM catalog_product_family ORDER BY n_models DESC'): cpf[r['catalog_product_id']].append(r['family_id'])

# ── 업종 페이지 · 사례 페이지 링크(v1 수집 원본, 2026-10-04) → 제품 카드 ──
ind_score = collections.defaultdict(collections.Counter)
ind_why = collections.defaultdict(set)
case_links = collections.defaultdict(list)  # 카드 → 그 카드를 '관련 제품'으로 링크한 도입사례 id
case_by_url = {(c.get('url') or '').rstrip('/').split('?')[0]: c for c in CASES if c.get('url')}
def fam_from_href(h):
    m = re.search(r'/sec/business/[^?#]+?/([A-Z0-9][A-Z0-9-/]{5,})/?(?:[?#]|$)', h or '')
    if m:
        code = m.group(1).rstrip('/')
        if code in model_fam: return [model_fam[code]]
    return []
def fams_from_list(h):
    m = re.search(r'/sec/business/([a-zA-Z_-]+)/all-[a-zA-Z_-]+/?(?:\?([a-zA-Z0-9_-]+))?', h or '')
    if not m: return []
    slug, flt = m.group(1), m.group(2)
    out = [f for f, cs in cats_of.items() if any(c[0].split('/')[0] == slug for c in cs)]
    if flt:
        sub = [f for f in out if any(t['site_filter'] == flt for t in tags[f])]
        out = sub or out
    return out
if os.path.exists(PAGES):
    pages = json.load(open(PAGES))['items']
    for u, pg in pages.items():
        if pg.get('kind') == 'industry_kr':
            slug = u.strip('/').split('/')[-1]
            inds = IND_SLUG.get(slug, [])
            for b in pg.get('blocks') or []:
                if b.get('t') != 'a': continue
                for f in fam_from_href(b.get('href')):
                    for i in inds: ind_score[f][i] += 3; ind_why[f].add('업종 페이지')
                lf = fams_from_list(b.get('href'))
                for f in lf:
                    for i in inds: ind_score[f][i] += 0.7 if len(lf) <= 40 else 0.3; ind_why[f].add('업종 페이지')
        elif pg.get('kind') == 'case_kr':
            c = case_by_url.get(pg['url'].rstrip('/').split('?')[0])
            if not c: continue
            for b in pg.get('blocks') or []:
                if b.get('t') == 'a':
                    for f in fam_from_href(b.get('href')):
                        if c['id'] not in case_links[f]: case_links[f].append(c['id'])
                        if c.get('ind'): ind_score[f][c['ind']] += 2; ind_why[f].add('도입사례')

# ── 필드 만들기 ──
def inch(v):
    m = re.match(r'^\s*([\d.]+)\s*cm\s*$', v or '')
    return f'{round(float(m.group(1)) / 2.54)}형' if m else None
def code_inch(code):
    m = re.match(r'^(?:LH|LS|LC|LF|LU|KU|KQ|KS|KM|HG|QN|UN|LT|WA)(\d{2,3})[A-Z]', code or '')
    if m and len(m.group(1)) == 2 and 20 <= int(m.group(1)) <= 115: return m.group(1) + '형'
    return None
def mid(v):  # "2.00 / 6.00 / 8.00 kW" → "6.00 kW"
    m = re.match(r'^\s*([\d.,]+)\s*/\s*([\d.,]+)\s*/\s*([\d.,]+)\s*(.*)$', v or '')
    return (m.group(2) + (' ' + m.group(4) if m.group(4) else '')).strip() if m else v
RULES = [
  (r'(대각선 사이즈|화면사이즈 \(Class\)|^화면사이즈|^크기 \(Main Display\)$|^디스플레이/크기$|^화면 ?크기)', lambda v: inch(v) or v),
  (r'(Pixel Pitch|픽셀 피치)', lambda v: '피치 ' + v),
  (r'(^해상도$|해상도 \(Main Display\)$|^Resolution)', lambda v: v),
  (r'(밝기 \(Typical\)|^밝기$|Brightness)', lambda v: v),
  (r'제품 사용 시간', lambda v: v),
  (r'(정격 냉방 \[kW\]|냉방 성능 \(최소/정격/최대\) \[kW\]|정격 냉방 능력|^냉방 능력|^냉방능력)', lambda v: '냉방 ' + mid(v)),
  (r'(정격 난방 \[kW\]|난방 성능 \(최소/정격/최대\) \[kW\]|정격 난방 능력|^난방 능력|^난방능력)', lambda v: '난방 ' + mid(v)),
  (r'(^CPU 종류$|^CPU$|칩셋/CPU$)', lambda v: v),
  (r'(메모리 \(GB\)$|^메모리$)', lambda v: 'RAM ' + v),
  (r'(스토리지\(저장 용량\) \(GB\)$|^저장장치 용량|^SSD)', lambda v: v),
  (r'(^전체 용량|^세탁 용량|^건조 용량|^용량$|^총 용량)', lambda v: v),
  (r'(속도 \(흑백\)|^출력속도|인쇄 속도)', lambda v: v),
  (r'(^광효율|^총광속)', lambda v: v), (r'^색온도', lambda v: v),
  (r'(에너지소비효율등급|에너지 소비효율 ?등급|냉방 에너지 소비효율등급)', lambda v: v),
  (r'(방수|IP 등급|Ingress Protection)', lambda v: v),
]
BOILER = re.compile(r'(상품 기본정보|안전인증|인증정보|EMC|RF모듈|기본정보$|제조|A/S|품질보증|KC 인증)')
def spec_rows0(fid):
    rows = [r for r in specs.get(fid, []) if r['value_raw'] and not BOILER.search(r['group_name'] or '')]
    if not rows: return []
    g0 = fams[fid]['goods_id']
    return [r for r in rows if r['goods_id'] == g0] or [r for r in rows if r['goods_id'] == rows[0]['goods_id']]
def spec_summary(fid):
    rows0 = spec_rows0(fid)
    if not rows0: return []
    out = []
    for k, (rx, fmt) in enumerate(RULES):
        for r in rows0:
            if re.search(rx, r['attr_name']) and len(r['value_raw']) <= 40:
                v = (code_inch(r['model_code']) or code_inch(fams[fid]['default_model_code']) or fmt(r['value_raw'].strip())) if k == 0 else fmt(r['value_raw'].strip())
                if v and v not in out: out.append(v)
                break
        if len(out) >= 4: break
    return out
def opt_summary(ms):
    vals = [m['option_value'] for m in ms if m['option_value']]
    if len(vals) < 2: return ''
    name = ms[0]['option_name'] or ''
    if name == '사이즈':
        ins = [code_inch(m['model_code']) for m in ms if m['option_value']]
        if all(ins):
            u = sorted(set(int(i[:-1]) for i in ins))
            return '·'.join(map(str, u)) + '형'
        return ' · '.join(dict.fromkeys(vals)) if len(set(vals)) <= 4 else f'사이즈 {len(set(vals))}종'
    if name in ('용량', '픽셀 피치', '메모리', '출력속도', '출력 매수'):
        u = list(dict.fromkeys(vals))
        return (u[0] + ' ~ ' + u[-1]) if len(u) > 3 else ' · '.join(u)
    if name == '색상': return f'색상 {len(set(vals))}종'
    return f'{name} {len(vals)}종'
def find_spaces(fid, fam):
    text_alt = ' '.join((i['alt'] or '') for i in imgs.get(fid, []) if i['role'] == 'feature')
    text_ft = ' '.join(' '.join(filter(None, [b['headline'], b['body']])) for b in feats.get(fid, []))
    text = text_alt + ' ' + text_ft + ' ' + (fam.get('pdp_description') or '')
    sc = collections.Counter()
    for name, words, _ in SPACES:
        a = sum(text_alt.count(w) for w in words)
        n = sum(text.count(w) for w in words) - a
        if 2 * a + n >= 2: sc[name] = 2 * a + n
    return [s for s, _ in sc.most_common(4)]
SP_IND = {n: i for n, _, i in SPACES}
def industries(fid, fam, spaces):
    sc = collections.Counter(ind_score.get(fid, {}))
    for s in spaces[:4]:
        for i in SP_IND.get(s, []): sc[i] += 0.8
    slug = fam['cat_code'].split('/')[0]
    for k, i in enumerate(CAT_DEF.get(slug, ([], []))[0]): sc[i] += 1.2 - 0.1 * k
    return [i for i, v in sc.most_common(5) if v >= 1.0]
KW_STOP = {'GB', 'TB', 'SSD', 'NVME', 'NVM', 'PC', 'TV', 'AI', 'UHD', 'FHD', 'QHD', 'LED', 'LTE', 'WI', 'FI', 'CORE', 'ULTRA', 'PRO', 'MAX', 'PLUS', 'NEW', 'SET', 'KIT', 'USB', 'HDMI', 'KG', 'KW', 'MM', 'CM', 'MAH', 'HZ', 'COPILOT'}
STOP = set('및 · 의 를 을 이 가 에 로 와 과 형 용 기 + - / ( )'.split())
def keywords(fid, fam):
    kw = []
    for t in tags.get(fid, []):
        if t['site_label'] and t['site_label'] not in ('기타', '지원', '미지원') and len(t['site_label']) <= 16: kw.append(t['site_label'])
    m = re.findall(r'(?<![A-Za-z0-9])([A-Z][A-Za-z]*[0-9]*[A-Z]*[0-9]*)(?![A-Za-z0-9])', fam['name_ko'] or '')
    kw += [x for x in m if len(x) >= 3 and x.upper() not in KW_STOP]
    m2 = re.match(r'^(.*?)(?:\s*\(|\s+Core|\s+\d|$)', fam['name_ko'] or '')
    if m2 and 2 <= len(m2.group(1).strip()) <= 20: kw.append(m2.group(1).strip())
    kw.append(fam['cat_name'])
    return list(dict.fromkeys(k.strip() for k in kw if k and k.strip() not in STOP))[:10]

PROD = []          # 새 사이트 · 카탈로그 제품
CURX = {}          # 큐레이션 id → 붙일 사이트 정보
DETAIL = {}        # id → 상세
gid_cur = collections.defaultdict(list)
for k, g in CUR_GOODS.items(): gid_cur[g].append(k)
def detail_of(fid, fam):
    ms = models.get(fid, [])
    srows = [[r['group_name'], r['attr_name'], r['value_raw']] for r in spec_rows0(fid)][:60]
    fl = []
    for b in feats.get(fid, []):
        h = (b['headline'] or '').strip()
        if not h or len(h) < 4 or h in [x['h'] for x in fl]: continue
        body = (b['body'] or '').strip()
        fl.append({'h': h[:90], 'b': body[:240], 'disc': (b['disclaimer'] or '')[:200]})
        if len(fl) >= 8: break
    ec = []
    seen = set()
    for r in ecat.get(fid, []):
        key = (r['dir'], r['page'])
        if key in seen: continue
        seen.add(key)
        ec.append({'dir': r['dir'], 't': r['title'], 'p': r['page'], 'm': r['surface'], 's': re.sub(r'\s+', ' ', r['snippet'])[:150]})
        if len(ec) >= 8: break
    return {'gid': fam['goods_id'], 'url': fam['detail_url'], 'usp': json.loads(fam['usp_json'] or '[]'),
            'models': [[m['model_code'], m['option_name'] or '', m['option_value'] or ''] for m in ms],
            'specs': srows, 'feats': fl, 'ecat': ec, 'ecatN': len({(r['dir'], r['page']) for r in ecat.get(fid, [])}),
            'cats': [c[1] for c in cats_of.get(fid, [])], 'desc': (fam['pdp_description'] or '')[:300]}

for fid, fam in fams.items():
    g = fam['goods_id']
    ms = models.get(fid, [])
    spaces = find_spaces(fid, fam)
    slug = fam['cat_code'].split('/')[0]
    if not spaces: spaces = CAT_DEF.get(slug, ([], []))[1]
    ind = industries(fid, fam, spaces)
    spec = spec_summary(fid)
    o = opt_summary(ms)
    det = detail_of(fid, fam)
    ov = ''
    if len(ms) == 1 and ms[0]['option_value']:
        ov = (code_inch(ms[0]['model_code']) if ms[0]['option_name'] == '사이즈' else None) or ms[0]['option_value']
    base = {'fam': fam['family_group'], 'sc': fam['cat_name'], 'gid': g, 'url': fam['detail_url'], 'nm': len(ms), 'opt': o or ov, 'cs': case_links.get(fid, [])[:12],
            'models': [m['model_code'] for m in ms][:24], 'ec': det['ecatN'], 'src': 'site'}
    if g in gid_cur:
        for cid in gid_cur[g]:
            CURX[cid] = dict(base); DETAIL[cid] = copy.deepcopy(det)
        continue
    pid = 'sg_' + g.lower()
    if not spec:
        u = json.loads(fam['usp_json'] or '[]')
        if u: spec = [u[0]]
    PROD.append({'id': pid, 'name': (fam['name_ko'] or '').strip(), 'model': fam['default_model_code'] or '', 'cat': fam['cat_name'],
                 'spec': ' · '.join(spec), 'spaces': spaces[:5], 'ind': ind, 'kw': keywords(fid, fam), 'img': '', **base})
    DETAIL[pid] = det

# 카탈로그 전용 제품(사이트 카드에 대응 못 한 것)
site_sc = {f['cat_name'] for f in fams.values()}
SEG1 = {'하만 프로 오디오': '하만 프로 오디오', 'HARMAN Luxury': '하만 럭셔리', '하만오디오': '하만 오디오', 'AV': '사운드바 · AV', 'PC': 'SSD · 메모리', '주방 · 리빙': '솔루션 · 서비스', '빌딩통합솔루션': '빌딩통합솔루션', '상업용 히트펌프': '상업용 히트펌프',
        '에너지': '태양광', '설치솔루션': '설치솔루션', '오디오': '홈 오디오', '전자칠판': '스마트 LCD 사이니지', '스마트 LCD 사이니지': '스마트 LCD 사이니지', 'LED 조명': 'LED 조명'}
def sc_of(cat):
    cat = (cat or '').strip()
    if cat in site_sc: return cat
    seg = [x.strip() for x in cat.split('>')]
    if seg[0].startswith('데이코'): return '데이코'
    if seg[0] == '시스템에어컨' and len(seg) > 1:
        s2 = {'판넬 및 옵션': '액세서리', '리뉴얼 설치': '실외기', '실내기': '액세서리'}.get(seg[1], seg[1])
        return '시스템에어컨 · ' + s2
    return SEG1.get(seg[0], seg[0] or '기타')
def cat_label(cat):
    seg = [x.strip() for x in (cat or '').split('>') if x.strip()]
    return ' › '.join(seg[-2:]) if len(seg) > 1 else (seg[0] if seg else '')
nmodel = lambda m: re.sub(r'[^A-Z0-9]', '', m.upper())
nname2 = lambda t: re.sub(r'[^0-9a-z가-힣+]', '', re.sub(r'\(.*?\)|삼성|samsung|데이코|dacor', '', (t or '').lower()))
PARTNERS = ['센도리', '부성', '아르네코리아', '아르네 코리아', '세원센추리', '이너지테크놀러지스', '알트엠', '한화큐셀', '한솔테크닉스', '현대에너지솔루션', 'Growatt']
groups = []  # 같은 제품이 여러 권에 나오면 한 행으로 — 다른 권끼리만, 모델코드 집합이 거의 같고(자카드 0.5 이상) 이름도 서로 들어 있을 때
skipped = collections.Counter()
for cp in cprod:
    if cp['family_id']:
        # 사이트 카드에 대응 → 대응한 카드마다(모델코드가 맞은 카드 전부) 상세에 카탈로그 원문 사양을 덧붙임
        for fid in cpf.get(cp['id'], [cp['family_id']]):
            g = fams[fid]['goods_id']
            for tgt in [cid for cid, gg in CUR_GOODS.items() if gg == g] or ['sg_' + g.lower()]:
                if tgt in DETAIL:
                    DETAIL[tgt].setdefault('cprod', []).append({'name': cp['name'], 'dir': cp['dir'], 't': cdocs.get(cp['dir'], {}).get('title'), 'pages': json.loads(cp['pages_json']), 'specs': json.loads(cp['specs_json'])[:8],
                                                                'extra': json.loads(cp['unmatched_models_json'] or '[]')[:30]})
        continue
    mcs = [m for m in json.loads(cp['models_json']) if '*' not in m]
    note = cp['note'] or ''
    if not mcs and json.loads(cp['models_json']): skipped['와일드카드 모델만'] += 1; continue
    if not mcs and note.startswith('2024 리플릿'): skipped['2024 리플릿 · 모델코드 없음'] += 1; continue
    keys = {nmodel(m) for m in mcs if len(nmodel(m)) >= 4}
    nk = nname2(cp['name'])
    def same(g):
        a = g['items'][0]
        if any(c['dir'] == cp['dir'] for c in g['items']): return False
        if a['family_group'] != cp['family_group']: return False
        names = bool(nk and g['nk'] and (nk in g['nk'] or g['nk'] in nk))
        if keys and g['keys']:
            jac = len(keys & g['keys']) / len(keys | g['keys'])
            return jac >= 0.5 and names
        return not keys and not g['keys'] and nk == g['nk']
    grp = next((g for g in groups if same(g)), None)
    if grp: grp['items'].append(cp)
    else: groups.append({'keys': keys, 'nk': nk, 'items': [cp]})
for g in groups:
    its = sorted(g['items'], key=lambda c: ((c['note'] or '').startswith('2024'), -len(json.loads(c['specs_json']))))
    cp = its[0]
    name = max((c['name'] for c in its), key=len) if len(its) > 1 else cp['name']
    brand = next((b for b in PARTNERS if b in ' '.join(filter(None, [cp['series'], cp['note'], cp['name']]))), None)
    if brand and brand.replace(' ', '') not in name.replace(' ', ''): name = f'{name} ({brand.replace("아르네 코리아", "아르네코리아")})'
    mcs = list(dict.fromkeys(m for c in its for m in json.loads(c['models_json']) if '*' not in m))
    srcs = [{'dir': c['dir'], 't': cdocs.get(c['dir'], {}).get('title'), 'pages': json.loads(c['pages_json'])} for c in its]
    sp = json.loads(cp['specs_json'])
    sc = sc_of(cp['category'])
    pid = 'ec_' + cp['id'][2:]
    series = cp['series'] if cp['series'] and cp['series'] not in PARTNERS and not any(b in cp['series'] for b in PARTNERS) else ''
    spec = ' · '.join(f'{a} {v}' for a, v in sp[:4] if v and len(a) <= 14 and len(v) <= 28)[:96]
    PROD.append({'id': pid, 'name': name, 'model': mcs[0] if mcs else '', 'cat': cat_label(cp['category']) or sc,
                 'spec': spec, 'spaces': [], 'ind': [], 'kw': list(dict.fromkeys(x for x in [series, cat_label(cp['category']), brand] if x)), 'img': '', 'fam': cp['family_group'] or '기타', 'sc': sc,
                 'gid': '', 'url': '', 'nm': len(mcs), 'opt': (f'모델 {len(mcs)}종' if len(mcs) > 1 else ''), 'models': mcs[:24], 'ec': sum(len(x['pages']) for x in srcs), 'src': 'catalog',
                 'cdir': cp['dir'], 'cpage': (srcs[0]['pages'] or [None])[0], **({'brand': brand} if brand else {})})
    DETAIL[pid] = {'models': [[m, '', ''] for m in mcs], 'specs': [['카탈로그', a, v] for a, v in sp], 'feats': [{'h': f, 'b': ''} for f in json.loads(cp['features_json'])[:6]],
                   'ecat': [{'dir': x['dir'], 't': x['t'], 'p': p, 'm': (mcs or [''])[0], 's': ''} for x in srcs for p in x['pages'][:4]][:8], 'ecatN': sum(len(x['pages']) for x in srcs),
                   'cats': [cp['category']], 'desc': '', 'note': '; '.join(dict.fromkeys(c['note'] for c in its if c['note']))[:300], 'catalog': True, **({'brand': brand} if brand else {})}
print('catalog rows', len(groups), 'skipped', dict(skipped))

# 정렬: 제품군 → 사이트 목록 순서 → 카드 순서
SLUG_ORDER = ['smart-signage', 'led-signage', 'hotel-tvs', 'tvs', 'monitors', 'display-solution', 'tv-vd-solution',
  'dvms', 'cooling-single', 'cooling-for-residential', 'air-conditioners', 'central-air-conditionings', 'heat-pump-boilers', 'ventilations', 'Cold_Chain_System', 'sac-solution', 'ac-clean', 'air-conditioners-care-service',
  'smartphones', 'tablets', 'watches', 'buds', 'rings', 'xr', 'mobile-accessories', 'notebook', 'desktop', 'chromebooks', 'mobile-solution',
  'digital-multifunction-printers', 'general-multifunction-printers', 'multifunction-printers-supplies', 'printing-solution', 'printing-solutions',
  'refrigerator', 'kimchi-refrigerators', 'dish-washer', 'electric-range', 'qooker', 'micro-wave-ovens', 'hood', 'water-purifier', 'accessories', 'washing-machines', 'dryers', 'airdresser', 'shoedresser', 'air-cleaners', 'vacuum-cleaners',
  'led-lights', 'harman', 'soho']
slug_name = {r['code'].split('/')[0]: r['name_ko'] for r in q('SELECT code, name_ko FROM category')}
site_order = [slug_name[s] for s in SLUG_ORDER if s in slug_name] + [n for s, n in slug_name.items() if s not in SLUG_ORDER]
cat_order = list(site_order)
def rank(p):
    fi = FAM_ORDER.index(p['fam']) if p['fam'] in FAM_ORDER else 99
    ci = cat_order.index(p['sc']) if p['sc'] in cat_order else 98
    return (fi, ci, 0 if p['src'] == 'site' else 1)
# 카탈로그 전용 · 큐레이션 전용 분류는 같은 제품군의 사이트 분류 뒤에(많은 순)
extra = collections.Counter((p['fam'], p['sc']) for p in PROD if p['sc'] not in site_order)
for c in CUR:
    x = CURX.get(c['id'], {})
    sc = x.get('sc') or CUR_SC_ID.get(c['id']) or CUR_SC.get(c['cat'], c['cat'])
    if sc not in site_order: extra[(x.get('fam') or cur_fam.get(c['cat'], '기타'), sc)] += 1
for f in FAM_ORDER:
    last = max([i for i, n in enumerate(cat_order) if any(p['fam'] == f and p['sc'] == n for p in PROD)] or [len(cat_order) - 1])
    add = [n for (ff, n), _ in extra.most_common() if ff == f and n not in cat_order]
    cat_order[last + 1:last + 1] = add
PROD.sort(key=rank)
for c in CUR:
    x = CURX.setdefault(c['id'], {})
    if 'sc' not in x:
        x['sc'] = CUR_SC_ID.get(c['id']) or CUR_SC.get(c['cat'], c['cat'])
        x['fam'] = cur_fam.get(c['cat'], '기타')
        x['src'] = 'curated'
# Reviewed source-backed specs survive subsequent exports. Keep generated
# descriptions/images/relations fresh; the review owns specification fields only.
if q("SELECT name FROM sqlite_master WHERE type='table' AND name='product_spec_review'"):
    allowed = {c['id'] for c in CUR} | {p['id'] for p in PROD}
    for row in q('SELECT id, detail_json FROM product_spec_review'):
        if row['id'] not in allowed: continue
        reviewed = json.loads(row['detail_json'])
        DETAIL.setdefault(row['id'], {}).update({key: value for key, value in reviewed.items() if key == 'specs' or key.startswith('spec')})

# 상세 묶음: 앱 정렬 순서로 40개씩
ids = [c['id'] for c in CUR if c['id'] in DETAIL] + [p['id'] for p in PROD]
packs = {}
os.makedirs(os.path.join(APP, 'img/prod'), exist_ok=True)
PER = len(ids)  # 상세 묶음 1개(아티팩트 파일 수 한도 511 — 2026-10-19 이미지 라이브러리 자리, merge_prod_packs.py)
for f in os.listdir(os.path.join(APP, 'img/prod')):
    if re.match(r'^d\d+\.json$', f): os.remove(os.path.join(APP, 'img/prod', f))
for i in range(0, len(ids), PER):
    n = i // PER
    path = f'img/prod/d{n:02d}.json'
    chunk = {k: DETAIL[k] for k in ids[i:i + PER]}
    json.dump({'items': chunk}, open(os.path.join(APP, path), 'w'), ensure_ascii=False, separators=(',', ':'))
    for k in chunk: packs[k] = n
for p in PROD: p['d'] = packs.get(p['id'])
for k, x in CURX.items():
    if k in packs: x['d'] = packs[k]
# Keep the app-owned overlay addresses synchronized when export packing changes.
# APP must be a writable staging directory, never reference/live or its symlink.
review_dir = os.path.join(APP, 'data/product-details')
os.makedirs(review_dir, exist_ok=True)
for filename in os.listdir(review_dir):
    if re.match(r'^d\d+\.json$', filename): os.remove(os.path.join(review_dir, filename))
for n in sorted(set(packs.values())):
    reviewed = {pid: DETAIL[pid] for pid, pack in packs.items() if pack == n and DETAIL[pid].get('specProductId') == pid}
    if reviewed:
        json.dump({'items': reviewed}, open(os.path.join(review_dir, f'd{n:02d}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
meta = {r['key']: r['value'] for r in q('SELECT * FROM meta')}
out = {'generated': meta.get('site_finished_at') or meta.get('site_fetched_at'), 'source': meta.get('source'),
       'counts': {'families': len(fams), 'models': sum(len(v) for v in models.values()), 'site_rows': sum(1 for p in PROD if p['src'] == 'site'),
                  'catalog_rows': sum(1 for p in PROD if p['src'] == 'catalog'), 'curated_linked': sum(1 for k, x in CURX.items() if x.get('gid')),
                  'catalog_docs': len(cdocs)},
       'famOrder': FAM_ORDER, 'catOrder': cat_order + sorted({p['sc'] for p in PROD if p['sc'] not in cat_order}),
       'curated': CURX, 'products': PROD}
json.dump(out, open(os.path.join(APP, 'data/products_db.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(json.dumps(out['counts'], ensure_ascii=False), 'detail packs', len(set(packs.values())), 'products_db.json', os.path.getsize(os.path.join(APP, 'data/products_db.json')) // 1024, 'KB')
