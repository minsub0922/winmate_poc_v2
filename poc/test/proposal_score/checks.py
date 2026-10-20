"""결정론 점검 — (1) 적용 조건(gate)에 쓰는 프로필, (2) 기준별 자동 점검 결과(LLM 에 넘기는 증거 · rules 백엔드의 점수 근거).

앱 review/analyze.js 의 신호를 같은 정의로 옮기고(제품 · 수치 · 연도 · 경쟁사 · 브랜드 · 약어 · 규모/비율 충돌),
앱에서 그린 장이라 알 수 있는 것(글자 넘침 · 겹침 · 글자 크기 · 빈 이미지 칸 · 제목 위치)을 더했다.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Dict, List, Tuple

from .proposal import Proposal, Sheet, norm, nospace, FOOTER_Y

NOW_Y = 2026
FIG = re.compile(r'\d[\d,.]*\s*(?:%|퍼센트|조\s?원|억\s?원|만\s?원|원|조|억|천만|백만|만|배|개\s?매장|개소|개점|매장|객실|실|병상|대|면|명|곳|층|㎡|m2|평|nit|nits|니트|인치|″|"|시간|분|일|주|개월|년|kWh|kW|MW|W|\$|달러|USD|KRW|p|pt)')
YEAR = re.compile(r'(?<!\d)(20[0-3]\d|199\d)(?:\s?년|\.|\s|$|\)|,|~|-)')
SOURCE = re.compile(r'출처|Source|자료\s*[:：]|기준\s*[:：]|조사\s*[:：]|\(\s*[^)]{2,30},\s*(?:19|20)\d{2}\s*\)|기준\)|자료\(|리포트|보고서|통계|조사\b|Statista|Gartner|IDC|Omdia|Euromonitor|운영 자료', re.I)
PLACEHOLDER = re.compile(r'\[\s*0[0-9.,]*\s*\]|\[\s*0\.0\s*\]|(?<![\d,])0,000(?![\d])|(?<![\d,])00(?:\.0)?\s?%|OOO|○○|◯◯|XX(?![A-Za-z])|텍스트를\s*입력|내용을\s*입력|제목을\s*입력|\[\s*조사\s*기관|\[\s*출처|\[\s*고객사|Lorem|lorem|\{\{|\}\}|고객사명|제품명\s*$|010-1234-5678|000-0000-0000|123-4567|example\.com')
ABSOLUTE = re.compile(r'(?:국내|업계|세계|글로벌)\s?(?:최초|최고|유일|1위|No\.?\s?1)|최초|유일(?:한|무이)|100\s?%\s?(?:보장|해결|만족|절감)|무조건|완벽(?:한|하게)?|반드시\s?(?:성공|절감)|업계\s?최고|최고의')
CONFIDENTIAL = re.compile(r'원가|마진율?|내부\s?할인|할인율|사내\s?(?:전용|용)|대외비(?!\s*아님)|TODO|FIXME|\(내부\)|검토\s?중|작성\s?중|임시\s?값')
DISCLOSE = re.compile(r'연출|예시\s?화면|이미지는|실제와\s?다를|변경될\s?수|사양은|가정|전제|추정|예상치|기준으로\s?산정|시뮬레이션\s?예시|참고용')
DATE = re.compile(r'(20[2-3]\d)\s?[.년]\s?(\d{1,2})(?:\s?[.월])?')
BRAND_BAD = [('MagicINFO', re.compile(r'Magic\s?Info(?!\w)|Magicinfo|MAGICINFO|Magic\s+INFO')), ('SmartThings', re.compile(r'Smart\s+Things|Smartthings|smartthings|SMARTTHINGS|스마트\s싱스')),
             ('The Wall', re.compile(r'the\s?wall|The\s?wall|THE\s?WALL|TheWall')), ('Knox', re.compile(r'(?<![A-Za-z])KNOX(?![A-Za-z])|(?<![A-Za-z])knox')), ('삼성전자', re.compile(r'삼성\s+전자'))]
BRANDS = [('MagicINFO', re.compile(r'MagicINFO|매직인포', re.I)), ('SmartThings', re.compile(r'SmartThings|스마트싱스', re.I)), ('The Wall', re.compile(r'The Wall|더 월', re.I)),
          ('Samsung VXT', re.compile(r'VXT')), ('Knox', re.compile(r'Knox', re.I)), ('Galaxy', re.compile(r'Galaxy|갤럭시', re.I)), ('b.IoT', re.compile(r'b\.IoT', re.I)),
          ('LYNK', re.compile(r'LYNK', re.I)), ('Bespoke', re.compile(r'Bespoke|비스포크', re.I)), ('무풍', re.compile(r'무풍'))]
COMPETITORS = [('LG전자', re.compile(r'LG\s?전자|\bLG(?!U\+|\s?유플러스|\s?CNS)\b|엘지')), ('Sony', re.compile(r'\bSony\b|소니')), ('Panasonic', re.compile(r'Panasonic|파나소닉')),
               ('Philips', re.compile(r'Philips|필립스')), ('NEC', re.compile(r'\bNEC\b')), ('BOE', re.compile(r'\bBOE\b')), ('Hisense', re.compile(r'Hisense|하이센스')),
               ('TCL', re.compile(r'\bTCL\b')), ('Daikin', re.compile(r'Daikin|다이킨')), ('Carrier', re.compile(r'\bCarrier\b|캐리어(?!\s?가방)')), ('Apple', re.compile(r'\bApple\b|애플'))]
ABBR_OK = set('TV PC AI LED LCD OK IT CEO UHD FHD USB HDMI IP PDF PPT QR IoT SNS APP UI UX CS AS KT SK LG IBK KB NH DT VS NO MI VP BEST NEW MZ B2B B2C OS ID CCTV WIFI WI FI GB TB MB HD SAMSUNG CONFIDENTIAL THE WALL VXT KNOX DEX LYNK SET EA DID OVERVIEW KEY VALUE MARKET PROPS STEP WHY CASE PLAN NEXT'.split())
MODEL_ANY = re.compile(r'(?<![A-Za-z0-9])([A-Z]{2,3})-?(\d{2,3})([A-Z]{1,3})(?:-([A-Z0-9]{1,4}))?(?![A-Za-z0-9])')
MODEL_STOP = re.compile(r'^(CO|PM|NO|SO|ISO|IP|USB|HDMI|DP|UHD|FHD|QHD|LTE|MIL|STD|KS|EN|IEC|UL|RTX|GTX|ESG|KPI|ROI|Q[1-4]|H[12]|FY|CY|AI|TV|PC|ERP|POS|NFC|UWB|PTT|RFP|SKU|SLA|HP|CJ|GS|SK|KT)$')
ANON_ORG = re.compile(r'(?<![A-Za-z0-9])[A-Z] [가-힣]{0,4}(?:커피|빌딩|대학교|건설|테마파크|리테일|호텔|요양병원|병원|교통공사|공사|쇼핑몰|공단|경기장|스크린골프|골프|제조|마트|베이커리|은행|통신사|그룹|미디어|자산운용|증권|보험|백화점|카페|센터)')
SCALE = re.compile(r'(\d[\d,]*)\s*(개\s?매장|개\s?점포|개\s?지점|개소|객실|실|병상|개\s?층|개\s?학교|개\s?캠퍼스|개\s?역|세대|개\s?사업장|개\s?단지|개\s?점(?![가-힣])|명)')
# 같은 앞말 + 같은 단위인데 값이 다른 곳(“하루 14시간” · “하루 11시간”) — 규모 단위가 아닌 수치 충돌 후보
CTX_NUM = re.compile(r'([가-힣]{1,6})\s(\d[\d,]*)\s?(대|면|곳|시간|개)(?![가-힣])')
INCH = re.compile(r'(?<![\d.])(\d{2,3})\s?(?:"|″|인치)')
NIT = re.compile(r'(\d[\d,]*)\s?nits?\b', re.I)
OUTDOOR = re.compile(r'옥외|실외(?!기)|야외|외벽|드라이브\s?스루')
PCT = re.compile(r'([가-힣A-Za-z]{2,8})\s?(?:사용량|비용|시간)?\s?(\d+(?:\.\d+)?)\s?%\s?(절감|감소|향상|증가|개선|단축|성장)')
TITLE_SENT = re.compile(r'(다|요|니다|죠|까|습니다|입니다|합니다|됩니다|함|됨|냅니다|줍니다|봅니다|[.?!])\s*[”"’]?$')
TITLE_MSG = re.compile(r'[,—→·]|(?:은|는|이|가|을|를|로|으로|에서|까지|부터|보다|만에|마다)\s')
LABEL_END = re.compile(r'(현황|개요|소개|구성|사례|계획|목차|일정|비교|분석|제안|요약|방안|전략|체계|효과|조건|사양|라인업|솔루션|프로세스|로드맵|Overview|Agenda|Contents)$', re.I)
MARKET_PARTS = {'market', 'insight', 'competition'}


def _cut(s: str, n: int = 60) -> str:
    s = norm(s)
    return s if len(s) <= n else s[:n - 1] + '…'


def _sheets_with(p: Proposal, rx: re.Pattern) -> List[Tuple[int, str]]:
    out = []
    for s in p.sheets:
        for t in s.texts:
            if not t.get('text'):
                continue
            for m in rx.finditer(t['text']):
                out.append((s.n, _cut(t['text'][max(0, m.start() - 16): m.end() + 16], 56)))
    return out


def _model_rx(model: str) -> re.Pattern:
    return re.compile(r'(?<![A-Za-z0-9])' + re.escape(model).replace('\\-', '-?') + r'(?![A-Za-z0-9])')


def _cat_specs(catalog: dict) -> Dict[str, dict]:
    out = {}
    for pr in catalog.get('products', []):
        m = pr.get('model')
        if not m:
            continue
        sp = pr.get('spec', '')
        inch = INCH.search(sp)
        nits = {int(x.replace(',', '')) for x in NIT.findall(sp)} | {int(x.replace(',', '')) for x in re.findall(r'최대\s?(\d[\d,]*)', sp)}
        out[m] = {'inch': int(inch.group(1)) if inch else None, 'nits': nits, 'rx': _model_rx(m), 'name': pr.get('name', '')}
    return out


def spec_check(p: Proposal, catalog: dict) -> Tuple[List[dict], int]:
    """칸(텍스트 상자) 단위 사양 대조 — 모델이 나온 칸과 그 뒤 세 칸(다른 모델이 나오기 전까지)의 인치 · nit 값만 그 모델 사양으로 본다.
    앱 규칙 점검은 장 단위로 모델과 수치를 묶어서, 옆 제품의 수치(KM24C 의 24")나 모델명 속 숫자(IAB 146")를 잘못 잇는 일이 있다."""
    cs = _cat_specs(catalog)
    strip_rx = re.compile('|'.join(sorted((re.escape(m) for m in cs), key=len, reverse=True))) if cs else None
    bad, ok = [], 0
    for s in p.sheets:
        boxes = [t['text'] for t in s.texts if t.get('text')]
        for i, b in enumerate(boxes):
            for m, c in cs.items():
                hit = c['rx'].search(b)
                if not hit:
                    continue
                seg = b[hit.end():]
                nxt = [mm.start() for o, oc in cs.items() if o != m for mm in [oc['rx'].search(seg)] if mm]
                win = [seg[:min(nxt)] if nxt else seg]
                if not nxt:
                    for b2 in boxes[i + 1:i + 4]:
                        if any(oc['rx'].search(b2) for o, oc in cs.items() if o != m):
                            break
                        win.append(b2)
                w = strip_rx.sub(' ', ' / '.join(win)) if strip_rx else ' / '.join(win)
                inches = {int(x) for x in INCH.findall(w)}
                nits = {int(x.replace(',', '')) for x in NIT.findall(w)}
                for kind, found, ref, unit in (('크기', inches, {c['inch']} if c['inch'] else set(), '"'), ('밝기', nits, c['nits'], 'nit')):
                    if not found or not ref:
                        continue
                    if found & ref:
                        ok += 1
                    else:
                        bad.append({'sheet': s.n, 'model': m, 'kind': kind, 'found': sorted(found), 'catalog': sorted(ref), 'unit': unit,
                                    'quote': _cut(m + ' ' + w, 60)})
    return bad, ok


def _space_check(p: Proposal, model: str, n: int, cs: Dict[str, dict]) -> str:
    """앱 PR3 지적(실내형 모델을 옥외 용도로) 칸 단위 확인 — 모델 칸이나 바로 앞뒤 칸(다른 모델 없는)에 옥외 표현이 있으면 그 문구."""
    s = next((x for x in p.sheets if x.n == n), None)
    if not s:
        return ''
    rx = _model_rx(model)
    has_other = lambda b: any(c['rx'].search(b) for m, c in cs.items() if m != model)
    boxes = [t['text'] for t in s.texts if t.get('text')]
    for i, b in enumerate(boxes):
        if not rx.search(b):
            continue
        for j in (i, i - 1, i + 1):
            if 0 <= j < len(boxes) and OUTDOOR.search(boxes[j]) and (j == i or not has_other(boxes[j])):
                return _cut(boxes[j], 40)
    return ''


def _verify_app_notes(p: Proposal, cid: str, notes: List[str], catalog: dict, bad_specs: List[dict]) -> List[str]:
    """앱 규칙 메모 중 장 단위 근접 매칭으로 생기는 오탐(PR2 사양 · PR3 옥외 · PR5 제품군 이름)을 칸 단위로 다시 확인한 메모로 바꾼다."""
    out = []
    for n in notes:
        if cid == 'PR2' and '카탈로그와 다른 사양' in n:
            claims = re.findall(r'(\d+)장 (\S+) (크기|밝기) ([\d,]+)', n)
            conf = {(b['sheet'], b['model'], b['kind']) for b in bad_specs}
            un = [f'{a}장 {m} {k} {v}' for a, m, k, v in claims if (int(a), m, k) not in conf]
            if un:
                out.append(f"앱 규칙(장 단위 근접 대조)의 사양 지적 {len(claims)}건 중 칸 단위로 확인되지 않은 {len(un)}건(모델 칸 뒤 세 칸에 그 값이 없음 — 옆 제품 수치 · 모델명 속 숫자일 수 있어 장 본문으로 확인): " + ', '.join(un[:6]))
            continue
        if cid == 'PR3' and re.search(r'실내형\)을 옥외', n):
            m = re.match(r'(\d+)장 (\S+?)\(실내형\)', n)
            q = _space_check(p, m.group(2), int(m.group(1)), _cat_specs(catalog)) if m else ''
            out.append(f'칸 단위 확인 — 실내형 제품 옥외 표현: {m.group(1)}장 {m.group(2)} “{q}”' if q else
                       f"앱 규칙의 실내형 · 옥외 지적({m.group(1)}장 {m.group(2)})은 칸 단위로 확인되지 않음(옥외 표현이 다른 제품 칸 · 실외기 등)" if m else n)
            continue
        if cid == 'PR5' and '표기 혼용' in n:
            vs = [v.strip() for v in n.split(':', 1)[-1].split('/')]
            if len(vs) >= 2 and all(any(a in b or b in a for b in vs if b != a) for a in vs):
                out.append(f"앱 규칙이 짚은 이름 차이 “{' / '.join(vs)}”는 제품군 이름 + 같은 모델명 — 혼용 아님")
                continue
        out.append(n)
    return out


def profile(p: Proposal, catalog: dict) -> dict:
    """적용 조건(gate)에 쓰는 프로필. 앱에서 계산한 프로필(app_profile)이 있으면 제품 · 수치 등은 그 값을 쓴다."""
    text = p.all_text()
    ap = p.app_profile or {}
    prods, sols, unknown = [], [], []
    for pr in catalog.get('products', []):
        model = pr.get('model', '')
        if (model and re.search(r'(?<![A-Za-z0-9])' + re.escape(model).replace('\\-', '-?') + r'(?![A-Za-z0-9])', text)) or (pr.get('name') and pr['name'] in text):
            prods.append(model or pr['name'])
    for so in catalog.get('solutions', []):
        if so.get('name') and so['name'].lower() in text.lower():
            sols.append(so['name'])
    known = {nospace(m).replace('-', '').upper() for m in prods}
    for m in MODEL_ANY.finditer(text):
        code = m.group(0)
        if MODEL_STOP.match(m.group(1)) or m.group(2) in ('19', '20'):
            continue
        if code.replace('-', '').upper() not in known and code not in unknown:
            unknown.append(code)
    parts = [s.part for s in p.sheets]
    abbr = Counter(m.group(1) for m in re.finditer(r'(?<![A-Za-z])([A-Z]{2,6})(?![A-Za-z])', text) if m.group(1) not in ABBR_OK)
    req_text = '\n'.join(p.req_list)
    x = {
        'kind': 'winmate', 'slides': True, 'units': p.n, 'customer': p.customer, 'ind': p.meta.get('ind'), 'ind_name': p.meta.get('ind_name') or '',
        'products': ap.get('products', prods), 'unknown_models': ap.get('unknownModels', [c for c in unknown if not re.match(r'^[A-Z]{2,3}\d{2,3}$', c)][:12]),
        'older_models': ap.get('older', []), 'solutions': ap.get('solutions', sols),
        'figures': ap.get('figures', len(FIG.findall(text))), 'years': ap.get('years', len(YEAR.findall(text))),
        'competitors': ap.get('competitors', [k for k, rx in COMPETITORS if rx.search(text)]),
        'brand_terms': ap.get('brandTerms', [k for k, rx in BRANDS if rx.search(text)]),
        'abbrs': ap.get('abbrs', [k for k, _ in abbr.most_common(12)]),
        'font_count': 2, 'fonts': ['Noto Sans KR', 'Manrope'],
        'pics': sum(s.pictures for s in p.sheets), 'charts': 0, 'tables': 0,
        'market_units': sum(1 for x in parts if x in MARKET_PARTS), 'comp_units': sum(1 for x in parts if x == 'competition'), 'cost_units': sum(1 for x in parts if x == 'cost'),
        'req_list': p.req_list, 'rfp_like': bool(re.search(r'RFP|제안요청서|과업지시서|평가표|배점', text + req_text)),
        'rfp_format': bool(req_text.strip()) and bool(re.search(r'RFP|제안요청|목차|형식|분량|제출|평가표|배점', req_text)),
        'visual': False, 'meta_avail': False,
    }
    return x


def _title_stats(p: Proposal) -> dict:
    body = [s for s in p.sheets if s.part not in ('cover',) and s.n > 1]
    def is_msg(t: str) -> bool:
        if not t:
            return False
        if TITLE_SENT.search(t):
            return True
        return len(t) >= 14 and bool(TITLE_MSG.search(t)) and not (len(t) <= 18 and LABEL_END.search(t))
    sent = [s for s in body if is_msg(s.title)]
    tb = [s.title_box for s in body if s.title_box]
    pos = Counter((round(t['x'] / 8), round(t['y'] / 8)) for t in tb)
    sizes = Counter(round(t.get('max_px', t.get('px', 0))) for t in tb)
    mode_pos = pos.most_common(1)[0][0] if pos else None
    off = [s.n for s in body if s.title_box and mode_pos and (abs(round(s.title_box['x'] / 8) - mode_pos[0]) > 1 or abs(round(s.title_box['y'] / 8) - mode_pos[1]) > 1)]
    return {'n': len(body), 'sentence': len(sent), 'label_titles': [(s.n, _cut(s.title, 40)) for s in body if s not in sent][:12],
            'title_sizes': dict(sizes.most_common(5)), 'off_position': off}


def auto_checks(p: Proposal, catalog: dict, others: List[str] = ()) -> Dict[str, List[str]]:
    """기준 id → 자동 점검 메모 목록. 숫자 · 장 번호가 들어간 사실만 적는다(판단은 LLM)."""
    F: Dict[str, List[str]] = defaultdict(list)
    sh = p.sheets
    text = p.all_text()
    short = re.sub(r'\s*(프랜차이즈|주식회사|\(주\)|㈜)\s*$', '', p.customer or '').strip()
    if len(short) <= 2:
        short = p.customer or short
    # ---- 고객 정보
    with_name = [s.n for s in sh if short and short in s.text]
    F['CU5'].append(f'고객사명 “{short}”이 나오는 장: {len(with_name)}/{p.n}장')
    F['CU1'].append(f'고객사명 “{short}” 표기: {len(with_name)}개 장')
    anon = Counter()
    for s in sh:
        for m in ANON_ORG.finditer(s.text):
            name = m.group(0)
            if name != short and not name.startswith(short) and not short.startswith(name):
                anon[(name, s.n)] += 1
    other_names = sorted({k[0] for k in anon})
    known_other = [o for o in others if o and o not in (short, p.customer) and not (p.customer or '').startswith(o) and o in text]
    if known_other:
        where = [(s.n, o) for s in sh for o in known_other if o in s.text]
        F['CU1'].append('다른 시나리오 고객명이 들어 있음: ' + ', '.join(f'{n}장 “{o}”' for n, o in where[:8]))
        F['WR1'].append('이전 · 다른 고객명: ' + ', '.join(f'{n}장 “{o}”' for n, o in where[:8]))
    elif other_names:
        F['CU1'].append('고객사 외 익명 기관명(사례 고객인지 확인): ' + ', '.join(sorted({f'{k[1]}장 “{k[0]}”' for k in anon})[:8]))
    # scale / pct conflicts (앱 scaleConsistency · pctConsistency)
    by = defaultdict(lambda: defaultdict(list))
    for s in sh:
        for m in SCALE.finditer(s.text):
            v = m.group(1).replace(',', '')
            if v.isdigit() and int(v) >= 10:
                by[nospace(m.group(2))][v].append(s.n)
    conflicts = [(k, vs) for k, vs in by.items() if len(vs) >= 2 and k not in ('명', '실')]
    for k, vs in conflicts[:6]:
        F['MK4'].append(f'“{k}” 값이 여러 개: ' + ' · '.join(f'{v}{k}({", ".join(str(x) for x in sorted(set(ns))[:5])}장)' for v, ns in sorted(vs.items(), key=lambda kv: -len(kv[1]))[:5]) +
                        ' — 같은 대상(전체 규모)인지 문장으로 확인: 부분 · 단계 · 1인당 비율 · 현재/제안이면 충돌 아님')
    pct = defaultdict(lambda: defaultdict(list))
    for s in sh:
        for m in PCT.finditer(s.text):
            pct[m.group(1) + ' ' + m.group(3)][m.group(2)].append(s.n)
    for k, vs in [(k, vs) for k, vs in pct.items() if len(vs) >= 2][:6]:
        F['MK4'].append(f'“{k}” 비율이 여러 개: ' + ' · '.join(f'{v}%({", ".join(map(str, sorted(set(ns))))}장)' for v, ns in vs.items()))
    ctx = defaultdict(lambda: defaultdict(list))
    for s in sh:
        for t in s.texts:
            for m in CTX_NUM.finditer(t.get('text') or ''):
                v = m.group(2).replace(',', '')
                if v.isdigit() and int(v) >= 10:
                    ctx[(m.group(1), m.group(3))][v].append(s.n)
    near, loose = [], []
    for (a, u), vs in ctx.items():
        if len(vs) < 2:
            continue
        rank = sorted(vs.items(), key=lambda kv: (-len(set(kv[1])), kv[0]))
        top, tn = rank[0][0], len(set(rank[0][1]))
        odd = [(v, ns) for v, ns in rank[1:] if tn >= 2 and len(set(ns)) < tn and 0.6 <= min(int(v), int(top)) / max(int(v), int(top)) < 1]
        fmt = lambda items: ' · '.join(f'{int(v):,}{u}({", ".join(map(str, sorted(set(ns))[:4]))}장)' for v, ns in items[:4])
        (near if odd else loose).append(f'“{a} N{u}” ' + fmt([rank[0]] + (odd or rank[1:])))
    if near:
        F['MK4'].append('같은 앞말 · 단위에 비슷하지만 다른 값(여러 장 값과 한두 장 값): ' + '; '.join(near[:4]))
    if loose and len(loose) <= 6:  # 많으면 서로 다른 대상이 섞인 것 — 메모로 남기지 않음
        F['MK4'].append('같은 앞말 · 단위인데 크게 다른 값(다른 대상일 수 있음): ' + '; '.join(loose[:2]))
    if not F['MK4']:
        F['MK4'].append('규모(매장 · 객실 · 병상 수)와 절감 · 향상 비율 표기에서 서로 다른 값을 찾지 못했어요')
    # ---- 근거 · 연도 · 출처
    yrs = []
    for s in sh:
        for m in YEAR.finditer(s.text):
            y = int(m.group(1))
            ctx = s.text[max(0, m.start() - 25): m.end() + 25]
            if SOURCE.search(ctx) or re.search(r'기준|조사|통계|전망|보고서|리포트|발표|Report', ctx, re.I):
                yrs.append((s.n, y))
    old = [(n, y) for n, y in yrs if y <= NOW_Y - 3]
    F['MK2'].append(f'자료 기준 연도 표기 {len(yrs)}곳' + (f' — 3년 이상 된 연도: ' + ', '.join(f'{n}장 {y}' for n, y in old[:6]) if old else ' · 3년 이상 된 자료 연도 없음'))
    fig_sheets = [(s.n, len(FIG.findall(s.text))) for s in sh]
    nosrc = [n for (n, k), s in zip(fig_sheets, sh) if k >= 3 and not SOURCE.search(s.text)]
    F['MK3'].append(f'수치 3개 이상인 장 {sum(1 for _, k in fig_sheets if k >= 3)}개 중 출처 · 기준 표기 없는 장: ' + (', '.join(map(str, nosrc[:12])) or '없음'))
    ph = _sheets_with(p, PLACEHOLDER)
    dummy = [x for x in ph if re.search(r'010-1234-5678|000-0000|123-4567|example\.com', x[1])]
    ph = [x for x in ph if x not in dummy]
    F['WR1'].append(f'자리표시 · 템플릿 문구 {len(ph)}곳' + (': ' + ', '.join(f'{n}장 “{c}”' for n, c in ph[:8]) if ph else ''))
    if dummy:
        F['WR1'].append('예시용(가짜) 연락처 — 제출 전 실제 값으로 바꿀 자리: ' + ', '.join(f'{n}장 “{c}”' for n, c in dummy[:3]))
    src_ph = [x for x in ph if '조사' in x[1] or '출처' in x[1]]
    if src_ph:
        F['MK3'].append('출처 자리표시: ' + ', '.join(f'{n}장' for n, _ in src_ph[:6]))
    # ---- 표기
    ab = _sheets_with(p, ABSOLUTE)
    F['WR5'].append(f'절대 표현 {len(ab)}곳' + (': ' + ', '.join(f'{n}장 “{c}”' for n, c in ab[:8]) if ab else ''))
    bad = []
    for k, rx in BRAND_BAD:
        for n, c in _sheets_with(p, rx):
            bad.append(f'{n}장 “{c}”(→ {k})')
    F['WR3'].append(f'공식 표기와 다른 브랜드명 {len(bad)}곳' + (': ' + ', '.join(bad[:6]) if bad else ''))
    conf = _sheets_with(p, CONFIDENTIAL)
    F['WR6'].append(f'내부 · 민감 정보 의심 표현 {len(conf)}곳' + (': ' + ', '.join(f'{n}장 “{c}”' for n, c in conf[:6]) if conf else ''))
    disc = sorted({n for n, _ in _sheets_with(p, DISCLOSE)})
    F['WR7'].append('고지 · 전제 문구가 있는 장: ' + (', '.join(map(str, disc[:15])) or '없음'))
    inch = Counter()
    for s in sh:
        inch['인치'] += len(re.findall(r'\d\s?인치', s.text)); inch['″/"'] += len(re.findall(r'\d\s?[″"]', s.text)); inch['형'] += len(re.findall(r'\d{2,3}\s?형(?![가-힣])', s.text))
        inch['억 원'] += len(re.findall(r'억\s원', s.text)); inch['억원'] += len(re.findall(r'억원', s.text))
    mixes = []
    if sum(1 for k in ('인치', '″/"', '형') if inch[k]) >= 2:
        q = '″/"'
        mixes.append('화면 크기 단위 혼용(인치 %d · %s %d · 형 %d)' % (inch['인치'], q, inch[q], inch['형']))
    if inch['억 원'] and inch['억원']:
        mixes.append(f"‘억 원’ {inch['억 원']} · ‘억원’ {inch['억원']} 혼용")
    F['WR4'].append('단위 표기: ' + ('; '.join(mixes) if mixes else '혼용 패턴을 찾지 못했어요'))
    x_abbr = (p.app_profile or {}).get('abbrs') or []
    undefined = [a for a in x_abbr if not re.search(re.escape(a) + r'\s?\(|\(\s?' + re.escape(a) + r'|' + re.escape(a) + r'\s?[:·=]', text)]
    F['WR8'].append(f'약어 {len(x_abbr)}개 중 풀이가 보이지 않는 것: ' + (', '.join(undefined[:10]) or '없음'))
    # ---- 제품
    prods = (p.app_profile or {}).get('products') or []
    cat = {pr['model']: pr for pr in catalog.get('products', [])}
    specs = [f"{m}: {cat[m].get('name', '')} · {cat[m].get('spec', '')}" for m in prods if m in cat]
    if specs:
        F['PR2'].append('카탈로그 사양 — ' + ' / '.join(specs[:10]))
        F['PR3'].append('카탈로그 권장 공간 — ' + ' / '.join(f"{m}: {', '.join(cat[m].get('spaces', [])[:5])}" for m in prods if m in cat)[:600])
    bad_specs, ok_specs = spec_check(p, catalog)
    if bad_specs:
        F['PR2'].append(f'칸 단위 대조(모델 칸 + 뒤 세 칸) — 카탈로그와 다른 사양 {len(bad_specs)}곳: ' + ', '.join(
            f"{b['sheet']}장 {b['model']} {b['kind']} {'/'.join(f'{v:,}' for v in b['found'])}{b['unit']} (카탈로그 {'/'.join(f'{v:,}' for v in b['catalog'])}{b['unit']}) “{b['quote']}”" for b in bad_specs[:6]))
    elif ok_specs:
        F['PR2'].append(f'칸 단위 대조(모델 칸 + 뒤 세 칸) — 모델 옆 크기 · 밝기 수치 {ok_specs}곳이 카탈로그와 일치, 다른 값 없음')
    unknown = (p.app_profile or {}).get('unknownModels') or []
    older = (p.app_profile or {}).get('older') or []
    F['PR1'].append(f"카탈로그에 있는 모델 {len(specs)}종" + (f" · 카탈로그에 없는 모델 표기: {', '.join(unknown[:8])}" if unknown else ' · 카탈로그에 없는 모델 표기 없음') + (f" · 이전 세대 의심: {older}" if older else ''))
    # ---- 디자인 (앱에서 그린 장을 잰 값)
    ov = [(s.n, t['tb'], _cut(t['text'], 24)) for s in sh for t in s.texts if t.get('overflow')]
    out = [(s.n, t['tb'], _cut(t['text'], 24)) for s in sh for t in s.texts if t.get('outside')]
    ol = [(s.n, a, b) for s in sh for a, b in s.overlaps]
    F['DS1'].append(f"글자 넘침 {len(ov)}곳" + (': ' + ', '.join(f'{n}장 칸{tb} “{c}”' for n, tb, c in ov[:8]) if ov else '') +
                    f" · 장표 밖 {len(out)}곳" + (': ' + ', '.join(f'{n}장 “{c}”' for n, tb, c in out[:5]) if out else '') +
                    f" · 텍스트 겹침 {len(ol)}쌍" + (': ' + ', '.join(f'{n}장 칸{a}↔{b}' for n, a, b in ol[:5]) if ol else ''))
    ts = _title_stats(p)
    F['DS1'].append(f"제목 위치가 다른 장과 다른 장: {', '.join(map(str, ts['off_position'][:12])) or '없음'}")
    F['DS5'].append(f"제목 글자 크기 분포(px: 장 수) {ts['title_sizes']} · 폰트: 앱 레이아웃 공통(Noto Sans KR · Manrope)")
    F['DS7'].append(f"본문 장 {ts['n']}개 중 결론 · 메시지형 제목 {ts['sentence']}개 ({round(100 * ts['sentence'] / max(1, ts['n']))}%)" + (' · 라벨형일 수 있는 제목: ' + ', '.join(f'{n}장 “{t}”' for n, t in ts['label_titles'][:8]) if ts['label_titles'] else ''))
    words = [(s.n, s.words) for s in sh]
    avg = round(sum(w for _, w in words) / max(1, len(words)))
    dense = [(n, w) for n, w in words if w > 110]
    F['DS3'].append(f'장당 평균 {avg}어절 · 최대 {max((w for _, w in words), default=0)}어절 · 110어절 넘는 장: ' + (', '.join(f'{n}장({w})' for n, w in dense[:10]) or '없음'))
    body = [(s.n, t.get('min_px') or t.get('px', 0)) for s in sh for t in s.body_texts if len(t['text']) > 20]
    nb = max(1, len(body))
    lt10 = [x for x in body if x[1] < 13.3]
    lt9 = sorted({n for n, px in body if px < 12})
    ge12 = sum(1 for _, px in body if px >= 16)
    F['DS4'].insert(0, f"20자 넘는 본문 칸 {len(body)}개: 12pt(16px) 이상 {ge12}개({round(100 * ge12 / nb)}%) · 10pt(13.3px) 미만 {len(lt10)}개({round(100 * len(lt10) / nb)}%) · 9pt(12px) 미만 본문 칸이 있는 장 {len(lt9)}장" + (f" ({', '.join(map(str, lt9[:12]))})" if lt9 else ''))
    body_px = Counter(round(px) for _, px in body)
    F['DS4'].append('20자 넘는 본문 칸의 글자 크기 분포(px: 칸 수) ' + str(dict(body_px.most_common(6))))
    textonly = [s.n for s in sh if s.n > 1 and s.pictures == 0]
    empty_slots = [(s.n, s.empty_image_slots) for s in sh if s.empty_image_slots]
    F['DS6'].append(f"사진 · 이미지가 없는 본문 장 {len(textonly)}/{p.n - 1}장" + (f" ({', '.join(map(str, textonly[:12]))})" if textonly else '') +
                    f" · 빈 이미지 칸 {sum(k for _, k in empty_slots)}개" + (f" ({', '.join(f'{n}장 {k}칸' for n, k in empty_slots[:8])})" if empty_slots else '') +
                    f" · 사진 중심 레이아웃 {sum(1 for s in sh if s.photo_first)}장")
    mins = p.meta.get('minutes')
    dup = [f for f, k in Counter(s.f for s in sh).items() if k > 1]
    F['DS9'].append(f"{p.n}장 · 발표 {mins or '미정'}분" + (f" → 장당 {mins / p.n:.1f}분" if mins else '') + (f" · 같은 레이아웃을 두 번 쓴 장: {', '.join(dup)}" if dup else ' · 중복 레이아웃 없음'))
    # ---- 제출 준비
    foot = [s.n for s in sh if any(t.get('y', 0) >= FOOTER_Y and re.search(r'CONFIDENTIAL|\d+\s*$', t.get('text', '')) for t in s.texts) or any('CONFIDENTIAL' in x for x in s.fixed_texts)]
    body_n = [s.n for s in sh if s.n > 1 and s.part != 'cover']
    miss = [n for n in body_n if n not in foot]
    F['SB2'].append(f"쪽번호 · CONFIDENTIAL 푸터가 있는 본문 장 {len(body_n) - len(miss)}/{len(body_n)}장 (표지 · 간지 제외)" + (f" · 없는 장: {', '.join(map(str, miss))[:80]}" if miss else ''))
    cover = sh[0] if sh else None
    toc = [s.n for s in sh if '목차' in (s.layout_name + s.role + s.title)]
    closing = [s.n for s in sh if s.part == 'closing']
    if cover:
        dates = DATE.findall(cover.text)
        F['SB1'].append(f"표지(1장): 고객사명 {'있음' if short and short in cover.text else '없음'} · 날짜 {'있음 ' + '.'.join(dates[0]) if dates else '없음'} · 제안사 표기 {'있음' if re.search(r'삼성|Samsung', cover.text) else '없음'} · 목차 장: {', '.join(map(str, toc)) or '없음'} · 마무리 장: {', '.join(map(str, closing)) or '없음'}")
        F['SB5'].append(f"표지 날짜: {'.'.join(dates[0]) if dates else '없음'} · 덱 안의 연 · 월 표기: " + ', '.join(sorted({f'{y}.{int(m):02d}' for y, m in DATE.findall(text)})[:10]))
    # ---- 근거 장 (사례 파트가 아예 없으면 VS5 위험 신호 — 있는 경우는 앱 규칙 메모가 사례 장 · 사례 고객을 적는다)
    if not any(s.part == 'case' for s in sh):
        F['VS5'].insert(0, '도입 사례 전용 장 없음(사례 파트 0장) — 다른 장의 사례 언급 · 성과 수치로만 판단')
    # ---- 흐름 (단계 · 파트 순서)
    F['VS3'].append('단계 → 파트 순서: ' + ' → '.join(f"{g['name']}({g['n']})" for g in (p.meta.get('stages') or [])))
    # ---- 요구사항 키워드 대응 (앱 CU2 규칙과 같은 방식: 요구의 핵심 낱말이 본문에 있는지)
    if p.req_list:
        miss = []
        for r in p.req_list:
            toks = [w for w in re.findall(r'[가-힣A-Za-z0-9]{2,}', r) if w not in ('있어요', '해요', '싶어요', '우리', '너무', '많이', '계속', '했으면')]
            hit = sum(1 for w in toks if w in text)
            if toks and hit / len(toks) < 0.4:
                miss.append(_cut(r, 40))
        F['CU2'].append(f"요구 {len(p.req_list)}개 중 핵심 낱말이 본문에 거의 없는 것 {len(miss)}개" + (': ' + ' / '.join(miss[:6]) if miss else ''))
    # ---- 앱 규칙 점검(ruleSignals) 메모 — 같은 장을 앱 검토 기능이 본 결과
    for cid, r in (p.app_rules or {}).items():
        notes = [n for n in (r or {}).get('notes', []) if n]
        if cid in ('PR2', 'PR3', 'PR5'):
            notes = _verify_app_notes(p, cid, notes, catalog, bad_specs)
        if notes:
            F[cid].append('앱 규칙 점검: ' + ' · '.join(_cut(n, 120) for n in notes[:3]))
    return dict(F)


def rule_score(cid: str, notes: List[str], p: Proposal) -> Tuple[int, str]:
    """rules 백엔드용 대략 점수(1~3). LLM 이 없을 때 파이프라인 모양을 확인하는 기준선 — 정밀 채점 아님."""
    joined = ' '.join(notes)
    nums = lambda pat: [int(x) for x in re.findall(pat, joined)]
    if cid == 'WR1':
        k = (nums(r'자리표시 · 템플릿 문구 (\d+)곳') or [0])[0] + joined.count('이전 · 다른 고객명')
        return (3 if k == 0 else 2 if k <= 2 else 1), f'자리표시 {k}곳'
    if cid == 'DS1':
        k = sum(nums(r'(?:글자 넘침|장표 밖) (\d+)곳')) + sum(nums(r'텍스트 겹침 (\d+)쌍'))
        return (3 if k == 0 else 2 if k <= 2 else 1), f'넘침 · 겹침 {k}'
    if cid == 'DS3':
        dense = len(re.findall(r'\d+장\(\d+\)', joined)); avg = (nums(r'장당 평균 (\d+)어절') or [0])[0]
        return (3 if not dense and avg <= 77 else 1 if dense >= 4 or avg > 110 else 2), f'평균 {avg}어절 · 과밀 {dense}장'
    if cid == 'DS4':
        m = re.search(r'12pt\(16px\) 이상 \d+개\((\d+)%\) · 10pt\(13.3px\) 미만 \d+개\((\d+)%\) · 9pt\(12px\) 미만 본문 칸이 있는 장 (\d+)장', joined)
        if m:
            ge12, lt10, tiny = map(int, m.groups())
            return (3 if ge12 == 100 else 1 if lt10 >= 30 or tiny >= 3 else 2), f'12pt 이상 {ge12}% · 10pt 미만 {lt10}% · 9pt 미만 장 {tiny}'
    if cid == 'DS7':
        m = re.search(r'\((\d+)%\)', joined)
        if m:
            r = int(m.group(1)); return (3 if r >= 80 else 2 if r >= 50 else 1), f'문장형 {r}%'
    if cid == 'DS6':
        m = re.search(r'없는 본문 장 (\d+)/(\d+)장', joined)
        if m:
            a, b = map(int, m.groups()); r = a / max(1, b)
            return (3 if r <= 0.1 else 2 if r < 0.3 else 1), f'텍스트만 {a}/{b}'
    if cid == 'MK4':
        k = joined.count('여러 개')
        return (3 if k == 0 else 2 if k == 1 else 1), f'충돌 후보 {k}'
    if cid == 'WR5':
        k = (nums(r'절대 표현 (\d+)곳') or [0])[0]
        return (3 if k == 0 else 2 if k <= 2 else 1), f'절대 표현 {k}'
    if cid == 'SB2':
        m = re.search(r'푸터가 있는 본문 장 (\d+)/(\d+)장', joined)
        if m:
            a, b = map(int, m.groups()); return (3 if a >= b - 1 else 2 if a >= b / 2 else 1), f'푸터 {a}/{b}'
    app = re.search(r'앱 규칙 점검', joined)
    rs = (p.app_rules or {}).get(cid) or {}
    if app and rs.get('score') is not None:
        s = rs['score']; return (3 if s >= 85 else 2 if s >= 60 else 1), f'앱 규칙 점수 {s}'
    return 2, '규칙으로 판단할 신호 없음(중간값)'
