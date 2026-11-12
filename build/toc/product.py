# 제품 제안서 내용 — 업종마다 대표 제품 하나 + 그 제품과 함께 쓰는 솔루션으로 Value Props 3 · 상세 · 유관사례 · Spec을 만든다.
# 대표 제품: 업종 표준 제안서(bs_std_<업종>)가 공간마다 고른 대표 제품 중 함께 쓰는 솔루션이 많고 여러 공간에 놓이는 제품.
# Value Props 3: 제품 + 솔루션이 셋이면 하나씩, 적으면 제품에서 여럿(표준 공간 장의 특징 2 · 제품 USP), 많으면 이 업종에서 제품과
# 가장 많이 함께 쓰는 솔루션 둘로 추린다. 상세: 제품 가치 = 표준 공간 장(L_VS_SPACE) 또는 제품 가치 장, 솔루션 가치 = 표준 솔루션 장
# (L_VS_SOL_*) + 그 솔루션을 제품과 함께 쓰는 공간 여정 장. 유관사례: 제품군이 같은 삼성 공식 도입사례(L_VS_CASE). Spec: 제품 상세 사양.
import json, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
APP = ROOT + '/app'
sys.path.insert(0, APP + '/scripts/vertical_standard')
import prod as STDPROD          # 제품 분류 → (제품 id, 표시 이름, 이미지, 특징 2)
import layouts as STDL          # L_VS_* 칸 스키마
import sol_layouts as STDS      # 솔루션 → L_VS_SOL_* 레이아웃
from sols import SOL as STDSOL, media

STDL.case_sheet()
CASE_SCH = STDL.SCHEMA['L_VS_CASE']
STDS.build_all()
SOL_F = {sid: v[0] for sid, v in STDS.SOLS.items()}
F_SOL = {f: sid for sid, f in SOL_F.items()}

STD = json.load(open(APP + '/web/src/domain/templates/standard_vertical_scenarios.json'))
STD_SC = {s['id'][7:]: s for s in STD['scenarios']}
DET = {}
for _f in sorted(os.listdir(APP + '/data/product-details')):
    DET.update(json.load(open(APP + '/data/product-details/' + _f))['items'])
DB = {p['id']: p for p in json.load(open(APP + '/data/products_db.json'))['products']}
CATJ = json.load(open(APP + '/data/catalog.json'))
CASES = {str(c['id']): c for c in CATJ['cases']}
MEDIA = json.load(open(APP + '/data/media.json'))
CAT_OF = {pid: cat for cat, (pid, *_rest) in STDPROD.P.items()}

FAM_OF = {c: 'sig' for c in ('lcd_std', 'vwall', 'lcd_out', 'lcd_win', 'epaper', 'spatial', 'led_in', 'led_out')}
FAM_OF['g_cinema'] = 'cinema'
FAM_OF.update({'g_kiosk': 'kiosk', 'iwb': 'iwb', 'htv': 'htv', 'btv': 'tv', 'tv': 'tv', 'harman': 'tv', 'mon': 'pc', 'nb': 'pc', 'cb': 'pc', 'desk': 'pc',
               'tab': 'tab', 'g_rugged': 'tab', 'phone': 'phone', 'buds': 'phone', 'xr': 'phone', 'watch': 'watch', 'dmfp': 'print', 'mfp': 'print',
               'wash': 'living', 'dry': 'living', 'laundry_b2b': 'living', 'airdresser': 'living', 'air': 'living', 'vac': 'living', 'light': 'living', 'ac': 'sac'})
FAM_OF.update({c: 'sac' for c in STDPROD.P if c.startswith('sac_')})
FAM_OF.update({c: 'kitchen' for c in ('ref_comm', 'ref_home', 'ref_bi', 'kimchi', 'dish', 'range', 'mw', 'oven', 'water', 'hood')})
# 제품군 → 함께 쓰는 솔루션 (관련 깊은 순)
SOLS_FOR = {
    'sig': ['s_vxt', 's_magic', 's_stp'], 'kiosk': ['s_magic', 's_vxt', 's_knox'], 'iwb': ['s_class', 's_meeting', 's_vxt'],
    'htv': ['s_lynk', 's_vxt', 's_stp'], 'tv': ['s_vxt', 's_stp', 's_lynk'], 'pc': ['s_bookee', 's_knox', 's_dex', 's_class'],
    'sac': ['s_stp', 's_biot', 's_dms', 's_touch', 's_wifi', 'svc_sac'],
    'tab': ['s_knox', 's_pos', 's_meeting', 's_class', 's_hospital', 's_field', 's_dex', 'svc_mobile'],
    'phone': ['s_knox', 's_field', 's_dex', 'svc_mobile'], 'watch': ['s_safety', 's_health', 's_knox'], 'print': ['s_counthru', 's_secuthru'],
    'living': ['s_stp', 's_sthome'], 'kitchen': ['s_stp', 's_sthome'], 'cinema': [],
}
# 업종마다 먼저 고르는 대표 제품 분류 (그 업종 표준 제안서 공간 대표 제품 중에 있을 때) — 없으면 점수로 고름
PREF = {'fb_qsr': 'lcd_std', 'fb_cafe': 'lcd_std', 'fb_rest': 'tab', 'rt_mall': 'led_in', 'rt_hyper': 'sac_cold', 'rt_small': 'sac_cold', 'sv_laundry': 'laundry_b2b',
        'ht_large': 'htv', 'ht_mid': 'htv', 'ht_stay': 'htv', 'tp_park': 'lcd_out', 'vn_stadium': 'led_in', 'vn_cinema': 'lcd_std', 'sf_fitness': 'lcd_std',
        'ad_ooh': 'led_out', 'of_hq': 'iwb', 'rs_senior': 'watch', 'ed_univ': 'iwb', 'ed_k12': 'iwb', 'pb_transport': 'lcd_std', 'md_ltc': 'watch',
        'mf_factory': 'g_rugged', 'oe_telco': 'tab', 'rg_church': 'led_in'}
CASE_TAG = {'cinema': '사이니지', 'sig': '사이니지', 'kiosk': '사이니지', 'iwb': '사이니지', 'htv': 'TV/음향시스템', 'tv': 'TV/음향시스템', 'pc': '모바일', 'sac': '시스템에어컨',
            'tab': '모바일', 'phone': '모바일', 'watch': '모바일', 'print': '프린팅/IT', 'living': '리빙가전', 'kitchen': '주방가전'}
# 유관사례 간지 한 줄 — 사례가 이 제품을 직접 쓰지 않으면 제품군으로 말한다 (사례 고르는 기준 = 이 제품군 태그)
CASE_FAM = {'사이니지': '삼성 사이니지', 'TV/음향시스템': '삼성 TV', '모바일': '갤럭시 기기', '시스템에어컨': '삼성 공조 제품', '리빙가전': '삼성 가전',
            '주방가전': '삼성 주방가전', '프린팅/IT': '삼성 IT 기기'}
FAM_BONUS = {'htv': 3, 'sig': 2, 'sac': 2, 'iwb': 1, 'tab': 1, 'kiosk': 1}
# 솔루션이 주는 가치 한마디 (Value Prop 제목)
SOL_VP = {
    's_stp': '기기 통합 관리', 's_safety': '현장 안전 관리', 's_biot': '설비 통합 관제', 's_dms': '공조 중앙 제어', 's_touch': '공조 통합 제어',
    's_wifi': '스마트폰 공조 제어', 's_sthome': '세대 스마트홈', 's_vxt': '클라우드 콘텐츠 운영', 's_magic': '데이터 연동 콘텐츠', 's_lynk': '객실 TV 원격 운영',
    's_knox': '업무 기기 보안 관리', 's_health': '건강 데이터 케어', 's_class': '수업 기기 관리', 's_bookee': '바로 쓰는 업무 PC', 's_dex': 'PC처럼 쓰는 모바일',
    's_counthru': '출력 장비 원격 관리', 's_secuthru': '출력물 보안', 's_pos': '태블릿 주문 · 결제', 's_hospital': '안내 · 병동 업무 연결', 's_field': '현장 업무 디지털화',
    's_meeting': '회의실 예약 · 안내', 'svc_sac': '공조 유지관리', 'svc_mobile': '업무 기기 케어',
}
SOL_NAMES = ' '.join(['VXT', 'MagicINFO', 'SmartThings', '스마트싱스', 'Knox', 'LYNK', 'DMS', 'b.IoT', 'DeX', 'CounThru', 'SecuThru', 'POS'])


def _width(s, px):
    w = 0.0
    for ch in str(s):
        w += px * (1.0 if ord(ch) > 0x2E80 else (0.32 if ch == ' ' else 0.58))
    return w


def clip(s, px, w, suffix='…'):
    s = str(s)
    if _width(s, px) <= w: return s
    while s and _width(s + suffix, px) > w: s = s[:-1]
    return s.rstrip(' ·,') + suffix


def std_sheets(vid):
    """업종 표준 제안서의 장 — [(stage key, f, t)] 순서대로"""
    sc = STD_SC[vid]; fills = STD['fills']['bs_std_' + vid]; out = []; k = 0
    for g in sc['flow']:
        for sl in g['slides']:
            out.append((g['key'], sl['f'], fills[k].get('t', {}), fills[k].get('img', {}))); k += 1
    return out


def first_sentence(text):
    """제품 특징 글에서 합니다체 한 문장 (15–62자) — 없으면 ''"""
    for s in re.split(r'(?<=[.!?])\s+', (text or '').strip()):
        s = s.strip()
        if s.endswith('있죠.'): s = s[:-3] + '있습니다.'
        if s.endswith('니다.') and 15 <= len(s) <= 62 and not re.search(r'[*※]', s): return s
    return ''


W16 = lambda t: sum(16 if ord(ch) >= 0x1100 else (4.5 if ch == ' ' else 9) for ch in t)  # 16px 굵은 글자 폭 어림 (간지 줄 290px)


def short_title(u):
    """가치 제목은 간지 한 줄(290px)에 들어가게 — 길면 '…으로/로' 앞까지, 그래도 길면 버림"""
    if W16(u) <= 272: return u
    m = re.match(r'(.{4,}?)(?:으로|로)\s', u)
    return m.group(1) if m and W16(m.group(1)) <= 272 else None


def usp_vps(pid, avoid):
    """제품 USP로 만든 가치 — [(제목, 한 줄)] (표준 공간 장 특징과 겹치지 않는 것)"""
    d = DET.get(pid, {}); feats = d.get('feats') or []
    words = lambda s: set(re.findall(r'[가-힣A-Za-z0-9]{2,}', s or ''))
    out = []
    for u in d.get('usp') or []:
        u = short_title(re.sub(r'\s+', ' ', u).strip())
        if not u: continue
        if any(len(words(u) & words(a)) >= 1 for a in avoid): continue
        best = max(feats, key=lambda f: len(words(f.get('h')) & words(u)), default=None)
        line = first_sentence(best.get('b')) if best else ''
        if not line and best and best.get('h') and best['h'] != u: line = best['h']
        if line: out.append((u, line))
    return out


UNIT = r'cm|mm|m|kWh|kW|W|g|kcal/h|ms|%|kg|ℓ|L|mAh|Wh|GB|TB|nit|Hz|인치|형|V|A|dB|dB\(A\)|HP|USRt'
def spec_label(lb, v, cat=''):
    """사양 이름 · 값 다듬기 — '화면사이즈 (cm)' + '108' → ('화면사이즈', '108 cm'), '배터리 용량 (mAh, Typical)' + '390' → ('배터리 용량', '390 mAh'),
    '냉방 성능 (최소/정격/최대)' + '1.70 / 6.00 / 8.00 kW' → ('냉방 성능', '6.00 kW (최대 8.00)'), 분류 '소비 전력(정격)' · '냉방' → '냉방 소비 전력'"""
    lb = re.sub(r'\s+', ' ', lb).strip()
    v = re.sub(r'\s*[®™]\s*', ' ', v).replace(' processor ', ' ').strip()
    v = re.sub(r',(?=[^\d\s])|(?<=[A-Za-z]),(?=\d)', ', ', v)
    m = re.search(r'\s*[\(\[]([^\(\)\[\]]*)[\)\]]\s*$', lb)
    if m:  # 괄호 안 단위는 값으로 옮긴다
        toks = [x.strip() for x in m.group(1).split(',')]
        u = next((x for x in toks if re.fullmatch(UNIT + '|시간', x)), None)
        if u:
            rest = [x for x in toks if x != u]
            lb = (lb[:m.start()] + (f' ({", ".join(rest)})' if rest else '')).strip()
            if re.search(r'\d$', v) and u not in v: v = v + u if u == '시간' else f'{v} {u}'
    if re.search(r'최소\s*/\s*정격\s*/\s*최대', lb):  # 세 값은 정격 + 최대로
        parts = [x.strip() for x in v.split('/')]
        if len(parts) == 3:
            unit = re.sub(r'^[\d.,\s]+', '', parts[-1])
            bare = lambda x: re.sub(r'\s*' + re.escape(unit) + '$', '', x) if unit else x
            v = re.sub(r'\s+', ' ', f'{bare(parts[1])} {unit} (최대 {bare(parts[2])})')
    if re.search(r'\(\s*Main Display\s*\)', lb): lb = '화면 ' + re.sub(r'\s*\(\s*Main Display\s*\)', '', lb).strip()
    paren = ' '.join(re.findall(r'[\(\[]([^\)\]]*)[\)\]]', lb))
    base = re.sub(r'\s*[\(\[][^\)\]]*[\)\]]', '', lb).strip()
    if re.search(r'가로|세로|폭|높이|깊이', paren): lb = base if '크기' in base else (base + ' 크기').strip()
    elif re.search(r'최소|정격|Typ|Max|Main', paren) or (len(base) >= 2 and base not in ('냉방', '난방', '크기', '용량', '전류')): lb = base
    else: lb = re.sub(r'[\(\)\[\]]', ' ', lb)
    lb = re.sub(r'\s+', ' ', lb).strip()
    cb = re.sub(r'\s*\(.*?\)', '', cat).strip()
    if cb and lb in ('냉방', '난방', '냉장'): lb = f'{lb} {cb}'
    elif lb == '크기' and '디스플레이' in cb: lb = '화면 크기'
    elif lb in ('온도', '습도') and '동작' in cb: lb = '동작 ' + lb
    elif cb and lb in ('형식', '출력', '종류', '제어방식'): lb = f'{cb} {lb}'
    if re.fullmatch(r'\d', v) and '등급' in lb: v = v + '등급'
    return lb, v


SPEC_SKIP = (r'포장|박스|Stand-?by|Sleep|대기|Screw|리모컨|매뉴얼|케이블|사용 가능한|차단기|배선|배관|액관|가스관|배수관|전원선|통신선|접지|오일|충진량|열교환기'
             r'|운전 ?전류|전압|Voltage|Frequency|정격입력|SIM|LTE|Sub6|UMTS|GSM|프로파일|지원 포맷|이어잭|MHL|싱크|제조사|제조국|원산지|Safety|EMC|인증')
lbw = lambda t: sum(15 if ord(ch) >= 0x1100 else 8.6 for ch in t)  # 15px 굵은 글자 폭 어림
SPEC_BOOL = ('있음', '없음', '-', '예', '아니오', '지원', '미지원', 'Support', 'Yes', 'No')


def spec_rows(pid):
    """Spec 표 — 사양 8줄 + 숫자 칸 3 (값이 짧고 숫자로 시작하는 것) · 같은 이름 · 포장 · 설치 배관/배선 · 모델 코드 · 있음/없음은 뺀다"""
    specs = []
    for c, lb, v in DET.get(pid, {}).get('specs') or []:
        v = str(v).strip(); nl, nv = spec_label(lb, v, c)
        if re.search(SPEC_SKIP, lb + ' ' + c if c in ('배선', '배관') else lb) or (len(nv) >= 3 and nv.lower() in nl.lower()): continue
        if re.fullmatch(r'[A-Z0-9][A-Z0-9-]{7,}', nv): continue  # 모델 코드
        if re.fullmatch(r'[\d.,]+', nv) and not re.search(r'USB|HDMI|입력|출력|개수|포트|슬롯|등급', nl): continue  # 단위 없는 숫자
        specs.append((c, nl, nv, lb))
    PRI = [r'대각선|화면 ?크기|화면사이즈|크기 \(Main|Main Display\)?$|사이즈|Pixel Pitch|픽셀 피치', r'해상도|Resolution|Pixel Configuration', r'밝기|Brightness', r'명암비|Contrast', r'사용 시간', r'두께|베젤', r'운영체제|OS',
           r'냉방 ?성능|냉방능력|정격성능|정격 냉방', r'난방 ?성능|정격 난방', r'효율|에너지', r'용량', r'CPU|AP|프로세서|화질엔진', r'메모리|RAM', r'배터리', r'소비 ?전력|Power Consumption',
           r'무게|중량', r'크기|가로|치수', r'WiFi|Wi-Fi|USB|HDMI|연결']
    typ = lambda i: (0 if re.search(r'Typ|일반', specs[i][3]) else 1, i)
    rows, used = [], set()
    have = lambda lb: any(r[0] == lb for r in rows)
    for pat in PRI:
        cand = [i for i, (c, lb, v, o) in enumerate(specs) if i not in used and re.search(pat, lb) and len(v) <= 30 and lbw(lb) <= 216 and v not in SPEC_BOOL and not have(lb)]
        if cand:
            i = min(cand, key=typ); rows.append([specs[i][1], specs[i][2]]); used.add(i)
        if len(rows) >= 8: break
    for ok in (lambda v: v not in SPEC_BOOL, lambda v: v not in ('없음', '-', '아니오', '미지원')):
        for i, (c, lb, v, o) in enumerate(specs):
            if len(rows) >= 8: break
            if i not in used and len(v) <= 24 and lbw(lb) <= 210 and ok(v) and not have(lb): rows.append([lb, v]); used.add(i)
    keys, kused = [], set()
    KPRI = [r'냉방 ?성능|정격 ?냉방|정격성능|냉방능력', r'난방 ?성능|정격 ?난방', r'해상도', r'밝기|Brightness', r'명암비|Contrast', r'대각선|화면 ?크기|화면사이즈|Pixel Pitch',
            r'사용 시간', r'세탁 용량|용량', r'효율|등급', r'스토리지|저장', r'메모리', r'두께|베젤', r'무게|중량']
    for pat in KPRI:
        if len(keys) >= 3: break
        for i, (c, lb, v, o) in sorted(enumerate(specs), key=lambda x: typ(x[0])):
            if i in kused or not re.search(pat, lb) or re.search(r'전류|차단기|전압|전원', lb) or any(k[1] == lb for k in keys): continue
            v = re.sub(r'\s*\(최대 [^)]*\)$', '', v)
            if re.match(r'^[\d.,]', v) and len(v) <= 13 and re.search(r'[A-Za-z가-힣:/x%℃]', v):
                keys.append([v, lb]); kused.add(i); break
    for num in (True, False):  # 숫자 칸이 모자라면 짧은 사양으로 채움 (숫자 먼저)
        for lb, v in rows:
            if len(keys) >= 3: break
            if len(v) <= 13 and (not num or re.match(r'^[\d.,]', v)) and not any(k[1] == lb for k in keys): keys.append([v, lb])
    return rows, keys


def short_cust(n):
    """간지 줄(290px)에 들어가는 고객 이름 — '㈜' · 괄호 · '– 제품' 뒤를 빼고, 길면 앞 낱말부터 들어가는 만큼"""
    n = re.split(r'\s*[–—]\s*|\s+-\s+', n)[0]
    n = re.sub(r'㈜|\(주\)|주식회사\s*|\s*\([^)]*\)', '', n).strip()
    if W16(n) <= 272: return n
    out = ''
    for wd in n.split(' '):
        if W16((out + ' ' + wd).strip()) > 272: break
        out = (out + ' ' + wd).strip()
    return out or n


def case_fill(cid, eb, foot):
    c = CASES[cid]; ph = [g for g in MEDIA['case'].get(cid, {}).get('g', []) if g[1] in ('s', 'e', 'p')][:4]
    offer, needs_, proof = c.get('offer') or [], c.get('needs') or [], c.get('proof') or []
    vals = {'eb': eb, 'title': clip(c['cust'], 32, 1150), 'sub': clip(f'{c.get("type") or c.get("indRaw") or ""} — {c.get("sub") or c["title"]}', 18, 1150),
            'src': clip(f'원문 · samsung.com 도입사례 · {c["date"][:7].replace("-", ". ")}', 14, 490), 'cust': '고객사 로고', 'foot': foot}
    for k in range(3):
        t = offer[k] if k < len(offer) else (needs_[k] if k < len(needs_) else c.get('sub') or c['title'])
        d = needs_[k] if k < len(needs_) else ''
        if k < len(proof): d = (d + ' — ' + proof[k]) if d else proof[k]
        if not d: d = c.get('quote') or c['title']
        vals[f'p{k}t'] = clip(re.sub(r'\s+', ' ', t).strip(), 20, 494 * 2 - 30); vals[f'p{k}d'] = clip(d, 15, 494 * 3.2)
    t = {str(i): lab for i, lab in CASE_SCH['labels'].items()}
    for key, v in vals.items(): t[str(CASE_SCH['keys'][key])] = v
    img = {str(CASE_SCH['ikeys'][f'img{k}']): {'src': media(g[0]), 'fit': 'cover', 'keep': True, 'name': g[2]} for k, g in enumerate(ph)}
    return {'id': cid, 'cust': c['cust'], 'row': short_cust(c['cust']), 'o': {'f': 'L_VS_CASE', 't': t, 'img': img, 'r': [[f'도입사례 · {c["cust"]}', c['url']]]}}


def build_pp(vid, vp_spaces, vs_spaces, ind):
    """업종 하나의 제품 제안서 내용"""
    sc = STD_SC[vid]; sheets = std_sheets(vid)
    deck_sols = [F_SOL[f] for _, f, _, _ in sheets if f in F_SOL]
    space_sheets = [(t, im) for _, f, t, im in sheets if f == 'L_VS_SPACE']
    sol_sheet = {F_SOL[f]: (t, im) for _, f, t, im in sheets if f in F_SOL}
    pname = lambda pid: STDPROD.P[CAT_OF[pid]][1] if pid in CAT_OF else ''
    reps = sc['products']  # 표준 제안서 대표 제품(중복 없음) — 공간 장의 제품 이름으로 공간과 잇는다
    cats = [set(p for p in sp['products'] if not p.startswith('s_')) for sp in vp_spaces]
    sols_at = [collections.Counter(s['solution'] for s in sp['solutions']) for sp in vs_spaces]
    best = None
    full = lambda p: len(DET.get(p, {}).get('specs') or []) >= 8
    pref = [p for p in reps if CAT_OF.get(p) == PREF.get(vid) and full(p)]
    for pid in (pref or [p for p in dict.fromkeys(reps) if full(p)] or list(dict.fromkeys(reps))):
        cat = CAT_OF.get(pid); fam = FAM_OF.get(cat)
        if not fam: continue
        where = [i for i, cs in enumerate(cats) if cat in cs]
        use = collections.Counter()
        for i in where: use.update({s: n for s, n in sols_at[i].items()})
        rel = [s for s in SOLS_FOR.get(fam, []) if s in deck_sols]
        rel.sort(key=lambda s: (-use[s], SOLS_FOR[fam].index(s)))
        d = DET.get(pid, {})
        score = 3 * min(3, len(rel)) + min(4, len(where)) + FAM_BONUS.get(fam, 0) + 2 * (len(d.get('usp') or []) >= 3) + (len(d.get('specs') or []) >= 8)
        if not best or score > best[0]: best = (score, pid, cat, fam, rel, where, use)
    _, pid, cat, fam, rel, where, use = best
    rep_at = [i for i, (t, _) in enumerate(space_sheets) if t.get('4') == pname(pid)]
    assert rep_at, (vid, pid, pname(pid))
    t0, im0 = space_sheets[rep_at[0]]
    nm, cut = t0['4'], (im0.get('0') or {}).get('src')
    f0, f1 = (t0['5'], t0['6']), (t0['7'], t0['8'])
    # Value Props 3 — 제품 + 솔루션이 셋이면 하나씩, 적으면 제품에서 여럿, 많으면 솔루션을 둘로 추림
    pick = rel[:2]
    names = re.compile('|'.join(re.escape(x) for x in SOL_NAMES.split()))
    pv = [f for f in (f0, f1) if not names.search(f[0] + f[1])] + usp_vps(pid, [f0[0], f1[0]])
    pv = [f for f in pv if not names.search(f[0])] or [f0]
    vps = [{'k': 'p', 't': pv[0][0], 'l': pv[0][1], 'img': cut}]
    for t, l in pv[1:]:
        if len(vps) + len(pick) >= 3: break
        vps.append({'k': 'p', 't': t, 'l': l, 'img': cut})
    for s in pick:
        st, sim = sol_sheet[s]
        line = st['1'].split(' — ', 1)[1] if ' — ' in st['1'] else st['1']
        img = (sim.get('0') or {}).get('src')
        sp = [i for i in where if use and any(x['solution'] == s for x in vs_spaces[i]['solutions'])][:3]
        on = []
        for i in sp:
            for x in vs_spaces[i]['solutions']:
                if x['solution'] == s: on += [f for f in x['features'] if f not in on]
        vps.append({'k': 's', 'sid': s, 'f': SOL_F[s], 'nm': STDSOL[s][0], 't': SOL_VP[s], 'l': line, 'img': img, 'sp': sp, 'on': on,
                    'scenes': [next(x['scenario'] for x in vs_spaces[i]['solutions'] if x['solution'] == s) for i in sp]})
    # 유관사례 — 같은 제품군 공식 사례(사진 4장 이상), 이 업종 표준 사례 · 같은 업종 우선
    tag = CASE_TAG[fam]; std_cases = []
    for key, f, t, im in sheets:
        if f == 'L_VS_CASE': std_cases.append(t['1'])
    words = set(re.findall(r'[가-힣A-Za-z]{2,}', nm + ' ' + STDPROD.P[cat][1])) - {'삼성', '시스템', '프리미엄', '스마트', 'AI', 'Bespoke'}
    cands = []
    for cid, c in CASES.items():
        if tag not in (c.get('prod') or []): continue
        ph = [g for g in MEDIA['case'].get(cid, {}).get('g', []) if g[1] in ('s', 'e', 'p')]
        if len(ph) < 4: continue
        text = ' '.join([c['title'], c.get('sub') or '', ' '.join(c.get('offer') or [])])
        hits = sum(1 for w in words if w in text)
        score = 4 * hits + 6 * (c.get('ind') == ind) + 5 * (c['cust'] in std_cases) + int(c['date'][:4]) / 10000
        strict = [t for t in re.findall(r'[A-Za-z]*\d+[A-Za-z0-9]*|[A-Z]{3,}', nm) if t not in ('LED', 'OLED', 'QLED', 'UHD')]
        same = nm.replace(' ', '') in text.replace(' ', '') or any(t in text for t in strict)
        cands.append((hits > 0, score, cid, same))
    cands.sort(reverse=True)
    cases, seen, hit = [], set(), []
    for _, _, cid, h in cands:
        key = re.split(r'\s', CASES[cid]['cust'])[0]
        if key in seen: continue
        seen.add(key); cases.append(cid); hit.append(h)
        if len(cases) >= 2: break
    rows, keys = spec_rows(pid)
    gal = (DB.get(pid) or {}).get('gal') or []
    d = DET.get(pid, {})
    model = d.get('specModel') or (DB.get(pid) or {}).get('model') or ((d.get('models') or [[None]])[0][0]) or ''
    return dict(pid=pid, cat=cat, fam=fam, nm=nm, model=model, cut=cut, gal=gal[:3], rep=rep_at, where=where,
                sols=rel, vps=vps, specs=rows, keys=keys, cases=[case_fill(cid, '', '') for cid in cases], cmatch=bool(hit) and all(hit), cfam=CASE_FAM.get(tag, '같은 제품군'))
