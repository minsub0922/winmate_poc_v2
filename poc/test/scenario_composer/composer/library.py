"""Case library built from the app's own registries — 샘플 버티컬 시나리오 decks, layouts and pictures.

Nothing here is invented: every storyline, part module, slide exemplar and picture description comes from
the scenarios the app already ships (frontier-made decks), the layout registry and the picture registries.
The composer only *chooses* among these (with Gemini) and adapts wording.

    python -m composer.library            # (re)build data/library.json from the app KB + scenario export

Inputs (read-only):
  data/scenarios_full.json                      ← scripts/export_library.mjs (SCENARIOS + FILLS + STORY + BG)
  app/data/runtime/kb/{catalog.json, layout_html.json.gz, parts.json}   ← app/scripts/export_agent_data.mjs
  app/data/{media.json, images.json, products_db.json}, img/lib/index.json,
  app/web/src/domain/templates/{proposal_photo_assets.json, account_photo_assets.json}
"""
from __future__ import annotations

import gzip
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Optional

from . import htmlslots

import os

HERE = Path(__file__).resolve().parent.parent          # poc/test/scenario_composer
ROOT = Path(os.environ.get('WM_REPO_ROOT') or HERE.parents[2])  # repo root
KB = Path(os.environ.get('WM_COMPOSER_KB') or (ROOT / 'app' / 'data' / 'runtime' / 'kb'))
# the app points this at app/data/runtime/composer (poc/ stays read-only there)
DATA = Path(os.environ.get('WM_COMPOSER_DATA') or (HERE / 'data'))
OUT = DATA / 'library.json'

IND_CODES = ['FB', 'RT', 'SV', 'HT', 'TP', 'VN', 'AD', 'OF', 'RS', 'ID', 'ED', 'PB', 'MD', 'MF', 'FN', 'OE']
# picture kind → coarse class used for slot compatibility
KIND_LETTER = {'s': 'scene', 'p': 'people', 'e': 'exterior', 'c': 'product', 'u': 'screen', 'd': 'diagram', 'k': 'kv'}
CLASS_OF_KIND = {'scene': 'scene', 'people': 'scene', 'exterior': 'scene', 'product': 'product', 'screen': 'screen', 'diagram': 'diagram',
                 'kv': 'kv', 'cut': 'product', 'life': 'scene', 'case': 'scene', 'ui': 'screen', 'gen': 'scene', 'install': 'scene',
                 'detail': 'product', 'figure': 'diagram'}
# file-name prefix of img/ph pictures → industry
PH_PREFIX = {'ht': 'HT', 'of': 'OF', 'ed': 'ED', 'fb': 'FB', 'md': 'MD', 'rt': 'RT', 'vn': 'VN', 'rs': 'RS', 'tp': 'TP', 'sv': 'SV',
             'mf': 'MF', 'id': 'ID', 'ad': 'AD', 'pb': 'PB', 'fn': 'FN', 'oe': 'OE'}
# fill packs whose pictures belong to known industries (pack name → industries); r9-bsNN → that scenario's industry
FILL_PACK_IND = {'r4-fbrt': ['FB', 'RT'], 'r4-adof': ['AD', 'OF'], 'r4-edpb': ['ED', 'PB'], 'r4-fnoe': ['FN', 'OE'], 'r4-mdmf': ['MD', 'MF'],
                 'r4-rsid': ['RS', 'ID'], 'r4-svht': ['SV', 'HT'], 'r4-tpvn': ['TP', 'VN'], 'hotel': ['HT'], 'office': ['OF'], 'retail': ['RT', 'FB'],
                 'public': ['PB'], 'ais-a': ['HT'], 'ais-b': ['HT'], 'h1-a': ['HT'], 'h1-b': ['HT']}
# extra industry words (picture descriptions) on top of catalog.indKw
EXTRA_KW = {
    'FB': ['메뉴보드', '드라이브스루', '바리스타', '주방', '푸드', '버거', '치킨', '디저트', '음료', '식당', '주문 카운터', '픽업'],
    'RT': ['쇼윈도', '진열', '마네킹', '패션', '의류', '화장품', '팝업', '아울렛', '마트', '슈퍼', '식품 매장', '계산대'],
    'SV': ['무인', '편의점', '스터디카페', '빨래방', '코인', 'PC방', '골프'],
    'HT': ['호텔', '리조트', '객실', '투숙', '연회장', '프런트', '레지던스', '스테이', '룸'],
    'TP': ['테마파크', '전시관', '박물관', '아쿠아리움', '사파리', '놀이공원', '체험관', '전망대'],
    'VN': ['경기장', '공연장', '영화관', '상영관', '관중석', '스타디움', '야구장', '전광판', '시네마'],
    'AD': ['옥외 광고', '광고판', '미디어 파사드', '외벽 LED', '빌보드'],
    'OF': ['오피스', '사무실', '회의실', '업무 공간', '라운지', '사옥', '빌딩 로비', '공유오피스', '코워킹'],
    'RS': ['아파트', '세대', '거실', '모델하우스', '주방 가전', '빌트인', '입주'],
    'ID': ['인테리어', '쇼룸', '가구'],
    'ED': ['교실', '강의실', '도서관', '학교', '대학', '캠퍼스', '학생', '학원', '칠판', '전자칠판', '수업'],
    'PB': ['민원', '청사', '지하철', '승강장', '역사', '공항', '터미널', '정류장', '관제', '시청', '국방', '병영', '군'],
    'MD': ['병원', '병실', '병동', '요양', '진료', '환자', '간호', '의료', '수술', '시니어'],
    'MF': ['공장', '생산', '라인', '물류', '창고', '제조', '작업자', '지게차', '현장 작업'],
    'FN': ['은행', '창구', '금융', '지점', '증권', '보험', 'ATM'],
    'OE': ['통신사', '키즈폰', '단말 에디션', '차량', '자동차'],
}
# words that show *where* a photo was taken, unambiguous enough that a viewer sees the industry (captions' source names removed)
PLACE_WORDS = {
    'FB': ['카페', '커피', '메뉴보드', '드라이브스루', '버거', '베이커리', '바리스타', '패스트푸드', '프랜차이즈 매장'],
    'HT': ['호텔', '리조트', '투숙', '연회장'],
    'ED': ['교실', '강의실', '학교', '대학', '캠퍼스', '학생', '학원'],
    'MD': ['병원', '병실', '병동', '요양', '환자', '진료'],
    'RT': ['백화점', '쇼윈도', '플래그십', '면세점', '진열대', '마네킹', '아울렛', '마트'],
    'FN': ['은행', 'ATM', '증권'],
    'MF': ['공장', '생산 라인', '생산라인', '물류센터', '물류창고', '지게차'],
    'VN': ['경기장', '공연장', '영화관', '상영관', '관중석', '야구장', '스타디움', '시네마'],
    'TP': ['테마파크', '박물관', '전시관', '아쿠아리움', '놀이공원', '사파리'],
    'PB': ['지하철', '승강장', '공항', '터미널', '민원', '청사', '정류장'],
    'RS': ['아파트', '모델하우스'],
    'SV': ['편의점', '무인 매장', '스터디카페', 'PC방', '스크린골프', '빨래방'],
    'AD': ['옥외 광고', '전광판', '광고판'],
    'OE': ['키즈폰'],
}


def place_inds(desc: str) -> List[str]:
    t = re.sub(r'\([^)]*\)', ' ', str(desc or ''))
    t = re.sub(r'\s·\s[^·]{2,40}$', ' ', t)
    return [ind for ind, words in PLACE_WORDS.items() if any(w in t for w in words)]


SPACE_WORDS = ['로비', '프런트', '객실', '레스토랑', '연회장', '피트니스', '세탁실', '백오피스', '카운터', '메뉴보드', '드라이브스루', '픽업', '좌석', '홀', '주방',
               '매장 입구', '입구', '쇼윈도', '진열', '체험존', '계산대', '회의실', '업무 공간', '사무실', '라운지', '강당', '관제실', '기계실', '옥상', '외관',
               '외벽', '강의실', '교실', '도서관', '기숙사', '교무실', '병실', '병동', '진료', '대기실', '간호', '원무', '접수', '거실', '주방', '침실', '드레스룸',
               '세대', '커뮤니티', '관리사무소', '생산', '라인', '물류', '창고', '검사', '연구실', '창구', '상담실', '무인', '대합실', '승강장', '탑승구',
               '플랫폼', '상황실', '경기장', '관중석', '상영관', '매점', '공연장', '전시', '야외', '옥외', '주차장', '엘리베이터', '복도', '천장', '벽면', '화장실']


def _load(p: Path):
    if p.suffix == '.gz':
        return json.load(gzip.open(p))
    return json.load(open(p, encoding='utf-8'))


def family_key(code: str) -> str:
    return '-'.join(x for x in (code or '').split('-') if x not in IND_CODES)


def is_cover_sheet(l: dict) -> bool:
    return l.get('p') == 'cover' and str(l.get('name') or '').startswith('표지')


GENERIC_HEADS = {'삼성전자', '삼성', '서울', '한국', '국립', '주식회사', '대한민국', '서울시', '부산', '인천', '대구', '경기', '[카드뉴스]', '글로벌'}


class IndustryTagger:
    """industries named in a picture description: case customer names (exact industry) + industry words (weaker)."""

    def __init__(self, cat: dict) -> None:
        kw = {k: list(v) for k, v in (cat.get('indKw') or {}).items()}
        for k, v in EXTRA_KW.items():
            kw.setdefault(k, []).extend(v)
        # '매장' · '브랜드' · '현장' are too generic to tag a picture
        self.kw = {k: sorted({w for w in v if w not in ('매장', '브랜드', '현장', '쇼룸', '체험', '업무', '관제', '케어', '세대')}, key=len, reverse=True)
                   for k, v in kw.items()}
        self.cust: Dict[str, str] = {}
        for c in cat.get('cases') or []:
            name = re.sub(r'\s+', ' ', str(c.get('cust') or '')).strip()
            if c.get('ind') and len(name) >= 2 and not name.startswith('['):
                self.cust[name] = c['ind']
                head = re.split(r'[\s·(]', name)[0]
                if len(head) >= 4 and head not in GENERIC_HEADS:
                    self.cust.setdefault(head, c['ind'])

    def tag(self, text: str) -> Dict[str, float]:
        t = str(text or '')
        out: Dict[str, float] = {}
        for name, ind in self.cust.items():
            if name in t:
                out[ind] = max(out.get(ind, 0), 1.0)
        for ind, words in self.kw.items():
            n = sum(1 for w in words if w in t)
            if n:
                out[ind] = max(out.get(ind, 0), min(0.9, 0.45 + 0.2 * n))
        return out


def spaces_in(text: str) -> List[str]:
    t = str(text or '')
    return [w for w in SPACE_WORDS if w in t]


# ---------------------------------------------------------------------------------------------------- layouts
def build_layouts(cat: dict, html: dict) -> Dict[str, dict]:
    out = {}
    for l in cat['layouts']:
        f = l['f']
        slots = htmlslots.parse(html.get(f, ''))
        meta = {k: l.get(k) for k in ('f', 'c', 'code', 'name', 'when', 'g', 'p', 'p2', 'ind', 'sol', 'sample', 'pc', 'req', 'prods', 'sols',
                                       'pf', 'nT', 'nI', 'ik', 'ih', 'retired', 'eb', 'hl')}
        meta['fam'] = family_key(l.get('code') or '')
        meta['cover'] = is_cover_sheet(l)
        meta['texts'] = slots['texts']
        meta['images'] = slots['images']
        meta['static'] = slots['static'][:40]
        out[f] = meta
    return out


# ---------------------------------------------------------------------------------------------------- scenarios
def group_of(sid: str) -> str:
    if re.fullmatch(r'bs\d\d', sid):
        return 'bs'
    if sid.startswith('bs_v_'):
        return 'vertical'
    if sid.startswith('bs_std_'):
        return 'std'
    if sid.startswith('bs_account_'):
        return 'account'
    return 'other'


def family_of(s: dict) -> str:
    """scenarios authored from the same source deck (a vertical's _1 · _2 · std) — excluded together in the strict eval."""
    sid = s['id']
    if sid.startswith('bs_v_'):
        return 'vx:' + re.sub(r'_\d+$', '', sid[5:])
    if sid.startswith('bs_std_'):
        return 'vx:' + sid[7:]
    return sid


def part_type_of(stage: dict, story: Optional[dict], layouts: Dict[str, dict], PARTS: dict) -> str:
    st = story and story.get('parts', {}).get(stage['name'])
    if st and st.get('type') in PARTS:
        return st['type']
    c = Counter(layouts[x['f']]['p'] for x in stage['slides'] if x['f'] in layouts)
    first = layouts.get(stage['slides'][0]['f'], {}).get('p') if stage['slides'] else None
    best = first or 'free'
    n = 0
    for k, v in c.items():
        if v > n:
            best, n = k, v
    return best if best in PARTS else 'free'


def build_scenarios(scx: dict, layouts: Dict[str, dict], PARTS: dict):
    cards, modules, exemplars = [], [], {}
    for s in scx['scenarios']:
        sid = s['id']
        story = s.get('story') or {}
        flow_summary = []
        for si, g in enumerate(s['flow']):
            slides = [{'k': x['k'], 'f': x['f'], 'role': x['role']} for x in g['slides']]
            cover = all(layouts.get(x['f'], {}).get('cover') for x in g['slides'])
            ptype = 'cover' if cover else part_type_of(g, story, layouts, PARTS)
            st = story.get('parts', {}).get(g['name']) if story else None
            items = (st or {}).get('items') or [x['role'].split(' — ')[0] for x in g['slides']]
            mid = f'{sid}#{si}'
            modules.append({'mid': mid, 'sid': sid, 'si': si, 'key': g['key'], 'name': g['name'], 'goal': g.get('goal') or '', 'type': ptype,
                            'items': items, 'slides': slides, 'cover': cover, 'ind': s.get('ind') or None, 'group': group_of(sid)})
            flow_summary.append({'mid': mid, 'key': g['key'], 'name': g['name'], 'type': ptype, 'n': len(slides), 'cover': cover})
            for x in g['slides']:
                fl = x.get('fill') or {}
                exemplars[f'{sid}:{x["k"]}'] = {'sid': sid, 'k': x['k'], 'mid': mid, 'f': x['f'], 'role': x['role'],
                                                't': fl.get('t') or {}, 'img': fl.get('img') or {}, 'r': fl.get('r')}
        keymen = [{'name': k[0], 'weight': k[1], 'reqs': k[2]} for k in (story.get('keymen') or [])]
        cards.append({
            'id': sid, 'group': group_of(sid), 'family': family_of(s), 'title': s.get('title') or '', 'short': s.get('short') or '',
            'customer': s.get('customer') or '', 'ind': s.get('ind') or None, 'req': s.get('req'), 'strategy': s.get('strategy'),
            'ending': s.get('ending'), 'situation': s.get('situation') or '', 'signals': s.get('signals') or [],
            'audience': s.get('audience') or {}, 'criteria': s.get('criteria') or [], 'thesis': s.get('thesis') or '',
            'messages': s.get('messages') or [], 'ask': s.get('ask') or '', 'next': s.get('next') or [], 'fit': s.get('fit') or '',
            'avoid': s.get('avoid') or '', 'products': s.get('products') or [], 'solutions': s.get('solutions') or [],
            'cases': [str(c) for c in (s.get('cases') or [])], 'kpis': s.get('kpis') or [], 'objections': s.get('objections') or [],
            'keymen': keymen, 'note': story.get('note') or '', 'flow': flow_summary, 'minutes': s.get('minutes'),
            'bg': (s.get('bg') or {}).get('pack') if s.get('bg') else None, 'fictional': bool(s.get('fictional')),
            'slides': sum(len(g['slides']) for g in s['flow']),
        })
    return cards, modules, exemplars


# ---------------------------------------------------------------------------------------------------- pictures
class ImageCatalog:
    def __init__(self, cat: dict, tagger: IndustryTagger, products: dict) -> None:
        self.items: Dict[str, dict] = {}
        self.tagger = tagger
        self.P = products
        # product id ← model code / name tokens
        self.model_ids: Dict[str, str] = {}
        for p in cat['products']:
            if not p.get('cur'):
                continue
            for m in [p.get('model')] + list(p.get('models') or []):
                key = re.sub(r'[^A-Z0-9]', '', str(m or '').upper())
                if len(key) >= 4:
                    self.model_ids.setdefault(key, p['id'])
        self.cur_names = {p['id']: [x for x in [p.get('name'), p.get('model')] + list(p.get('kw') or []) if x and len(str(x)) >= 2]
                          for p in cat['products'] if p.get('cur')}

    def products_in(self, text: str) -> List[str]:
        t = str(text or '')
        up = re.sub(r'[^A-Z0-9]', '', t.upper())
        out = []
        for key, pid in self.model_ids.items():
            if key in up and pid not in out:
                out.append(pid)
        for pid, names in self.cur_names.items():
            if pid in out:
                continue
            if any(len(n) >= 3 and n in t for n in names):
                out.append(pid)
        return out

    def add(self, src: str, **kw) -> dict:
        if not src:
            return {}
        if src.startswith('/img/'):
            src = src[1:]
        it = self.items.get(src)
        if it is None:
            it = self.items[src] = {'src': src, 'desc': '', 'names': [], 'kind': '', 'inds': {}, 'products': [], 'solutions': [], 'case': None,
                                    'cust': '', 'spaces': [], 'w': None, 'h': None, 'group': '', 'usage': [], 'scen': []}
        for k, v in kw.items():
            if v in (None, '', [], {}):
                continue
            if k == 'names':
                for n in v:
                    if n and n not in it['names']:
                        it['names'].append(n)
            elif k == 'inds':
                for ind, w in v.items():
                    it['inds'][ind] = max(it['inds'].get(ind, 0), w)
            elif k in ('products', 'solutions', 'spaces', 'scen'):
                for x in v:
                    if x and x not in it[k]:
                        it[k].append(x)
            elif k == 'usage':
                it['usage'].append(v)
            elif not it.get(k):
                it[k] = v
        return it

    def finish(self) -> None:
        for it in self.items.values():
            if not it['desc'] and it['names']:
                it['desc'] = it['names'][0]
            text = ' '.join([it['desc']] + it['names'])
            for ind, w in self.tagger.tag(text).items():
                it['inds'][ind] = max(it['inds'].get(ind, 0), w)
            for pid in self.products_in(text):
                if pid not in it['products']:
                    it['products'].append(pid)
            for sp in spaces_in(text):
                if sp not in it['spaces']:
                    it['spaces'].append(sp)
            it['cls'] = CLASS_OF_KIND.get(it['kind'], 'scene' if it['kind'] in ('', 'photo') else 'scene')
            it['place'] = place_inds(it['desc'] or (it['names'] or [''])[0]) if it['cls'] in ('scene', 'kv') else []
            # a neutral picture can go to any industry (product cuts · solution screens · diagrams · key visuals · generic)
            it['neutral'] = it['cls'] in ('product', 'screen', 'diagram', 'kv') or (not it['inds'] and it['group'] in ('prod', 'lib', 'root'))


def build_images(cat: dict, layouts: Dict[str, dict], exemplars: dict, cards: list, tagger: IndustryTagger) -> Dict[str, dict]:
    P = {p['id']: p for p in cat['products']}
    C = {str(c['id']): c for c in cat['cases']}
    ic = ImageCatalog(cat, tagger, P)
    # 1) case · solution media (samsung.com cases, solution pages, e-catalog)
    media = _load(ROOT / 'app' / 'data' / 'media.json')
    packs = media['P']
    addr = lambda code: packs[code // 10000] + '#' + str(code % 10000)
    for cid, item in media['case'].items():
        c = C.get(str(cid), {})
        inds = {c['ind']: 1.0} if c.get('ind') else {}
        sol = [s for s in (c.get('sol') or []) if isinstance(s, str)]
        for e in item['g']:
            code, kc, desc, w, h = e[0], e[1], e[2], e[3], e[4]
            kind = KIND_LETTER.get(kc, 'scene')
            ic.add(addr(code), desc=desc or '', names=[desc], kind=kind, inds=inds if kind not in ('product',) else {}, case=str(cid),
                   cust=c.get('cust') or '', spaces=list(c.get('space') or [])[:6], w=w, h=h, group='media-case', solutions=sol)
    for sid, item in media['sol'].items():
        for e in item['g']:
            code, kc, desc, w, h = e[0], e[1], e[2], e[3], e[4]
            ic.add(addr(code), desc=desc or '', names=[desc], kind=KIND_LETTER.get(kc, 'scene'), solutions=[sid], w=w, h=h, group='media-sol')
    # 2) app image DB (product cuts · official lifestyle · solution screens)
    imgs = _load(ROOT / 'app' / 'data' / 'images.json')
    model_pid = {str(p.get('model') or '').upper(): p['id'] for p in cat['products'] if p.get('cur')}
    for pid, v in imgs['pids'].items():
        k = v.get('src') or v.get('kind') or ''
        kind = {'cut': 'product', 'life': 'scene', 'case': 'scene', 'ui': 'screen', 'gen': 'scene'}.get(k, 'scene')
        prods = [model_pid[str(v.get('model') or '').upper()]] if str(v.get('model') or '').upper() in model_pid else []
        ic.add(v['file'], desc=v.get('desc') or '', names=[v.get('desc')], kind=kind, products=prods, w=v.get('w'), h=v.get('h'),
               group=_group_of_src(v['file']))
    # 3) product galleries (samsung.com product cards)
    pdb = _load(ROOT / 'app' / 'data' / 'products_db.json')
    for pid, v in pdb['curated'].items():
        name = (P.get(pid) or {}).get('name') or pid
        for a, alt in zip(v.get('gal') or [], v.get('galAlt') or [''] * 9):
            ic.add(a, desc=f'{name} · {alt}'.strip(' ·'), names=[f'{name} · {alt}'], kind='product', products=[pid], group='prod')
    # 4) proposal / account photo assets
    for fn in ('proposal_photo_assets.json', 'account_photo_assets.json'):
        p = ROOT / 'app' / 'web' / 'src' / 'domain' / 'templates' / fn
        if p.exists():
            for v in _load(p):
                ic.add(v['src'], desc=v.get('desc') or '', names=[v.get('desc')], kind=KIND_LETTER.get(v.get('kind') or 's', 'scene'),
                       inds={v['ind']: 1.0} if v.get('ind') else {}, cust=v.get('owner') or '', w=v.get('w'), h=v.get('h'), group='asset')
    # 5) pictures the layouts carry as samples (alt text describes them)
    for f, l in layouts.items():
        for im in l['images']:
            if not im.get('sample') or im['sample'].startswith('data:'):
                continue
            src = im['sample']
            kind = 'product' if (im.get('fit') == 'contain' or im.get('kind') in ('cut', 'detail', 'kiosk', 'signage')) else \
                   'screen' if im.get('kind') in ('ui', 'cms', 'energy', 'phone', 'content') else 'scene'
            ic.add(src, names=[im.get('alt')], kind=kind, group=_group_of_src(src), inds=_src_inds(src, cards),
                   usage={'f': f, 'i': im['i'], 'hint': im.get('hint') or '', 'from': 'layout'})
    # 6) pictures used in 샘플 버티컬 시나리오 decks (names written for that deck)
    ind_of = {c['id']: c['ind'] for c in cards}
    for key, ex in exemplars.items():
        for slot, v in (ex.get('img') or {}).items():
            if not isinstance(v, dict) or not v.get('src'):
                continue
            src = v['src']
            k = v.get('kind') or ''
            kind = KIND_LETTER.get(k, {'product': 'product'}.get(k, ''))
            if not kind:
                kind = 'product' if v.get('fit') == 'contain' else ''
            inds = _src_inds(src, cards)
            ic.add(src, names=[v.get('name')], kind=kind or None, products=v.get('products') or [], group=_group_of_src(src), inds=inds,
                   scen=[ex['sid']], usage={'sid': ex['sid'], 'k': ex['k'], 'f': ex['f'], 'slot': slot, 'ind': ind_of.get(ex['sid'])})
    # 7) product image library (cuts · details · installs · screens) — only for curated products (the ones scenarios use)
    lib = ROOT / 'img' / 'lib' / 'index.json'
    if lib.exists():
        cur = {p['id'] for p in cat['products'] if p.get('cur')}
        for v in _load(lib)['images']:
            prods = [p for p in (v.get('p') or []) if p in cur]
            if not prods:
                continue
            kind = {'cut': 'product', 'detail': 'product', 'install': 'scene', 'screen': 'screen', 'figure': 'diagram'}.get(v.get('k'), 'product')
            desc = ' · '.join(x for x in [v.get('t'), v.get('d')] if x)
            ic.add(v['a'], desc=desc, names=[desc], kind=kind, products=prods, spaces=v.get('sp') or [], w=v.get('w'), h=v.get('h'), group='lib')
    for src, it in ic.items.items():
        own = _src_inds(src, cards)
        for ind, w in own.items():
            it['inds'][ind] = max(it['inds'].get(ind, 0), w)
        # authoritative industry: the case record / file family / scenario the picture was made for (not words in its caption)
        prim = [i for i, w in own.items() if w >= 0.8]
        if it['group'] in ('media-case', 'asset') and it['inds']:
            prim = [i for i, w in it['inds'].items() if w >= 1.0] or prim
        it['ind_primary'] = prim
    ic.finish()
    for it in ic.items.values():
        if not it['ind_primary']:
            strong = [i for i, w in it['inds'].items() if w >= 0.85]
            it['ind_primary'] = strong if len(strong) == 1 else []
    return ic.items


def _group_of_src(src: str) -> str:
    if src.startswith('img/media/'):
        return 'media'
    if src.startswith('img/ph/'):
        return 'ph'
    if src.startswith('img/bs/'):
        return 'bs-prod' if src.startswith('img/bs/p-') else 'bs'
    if src.startswith('img/fill/'):
        return 'fill'
    if src.startswith('img/prod/'):
        return 'prod'
    if src.startswith('img/cover/'):
        return 'cover'
    if src.startswith('img/lib/'):
        return 'lib'
    if src.startswith('/assets/'):
        return 'asset'
    return 'root'


def _src_inds(src: str, cards: list) -> Dict[str, float]:
    m = re.match(r'img/ph/([a-z]+)-', src)
    if m and m.group(1) in PH_PREFIX:
        return {PH_PREFIX[m.group(1)]: 1.0}
    m = re.match(r'img/bs/(bs\d\d)-', src)
    if m:
        c = next((c for c in cards if c['id'] == m.group(1)), None)
        return {c['ind']: 1.0} if c and c.get('ind') else {}
    m = re.match(r'img/fill/([a-z0-9-]+)\.json#', src)
    if m:
        pk = m.group(1)
        if pk in FILL_PACK_IND:
            return {i: 0.6 for i in FILL_PACK_IND[pk]}  # pack covers two industries — the description decides
        mm = re.match(r'r9-(bs\d\d)', pk)
        if mm:
            c = next((c for c in cards if c['id'] == mm.group(1)), None)
            return {c['ind']: 0.8} if c and c.get('ind') else {}
    m = re.match(r'img/cover/([A-Z]{2})\.jpg', src)
    if m and m.group(1) in IND_CODES:
        return {m.group(1): 1.0}
    return {}


# ---------------------------------------------------------------------------------------------------- build
def export_scenarios(out: Path = None) -> Path:
    """node scripts/export_library.mjs → data/scenarios_full.json (샘플 버티컬 시나리오 decks with their filled values)."""
    import subprocess
    out = out or (DATA / 'scenarios_full.json')
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['node', str(HERE / 'scripts' / 'export_library.mjs'), str(out)], check=True, cwd=str(HERE), timeout=300,
                   stdout=subprocess.DEVNULL)
    return out


def ensure(max_age_vs_kb: bool = True) -> Path:
    """build the library when it is missing or older than the KB snapshot it was made from."""
    kb_mtime = (KB / 'manifest.json').stat().st_mtime if (KB / 'manifest.json').exists() else 0
    if OUT.exists() and (not max_age_vs_kb or OUT.stat().st_mtime >= kb_mtime):
        return OUT
    if not (DATA / 'scenarios_full.json').exists() or (DATA / 'scenarios_full.json').stat().st_mtime < kb_mtime:
        export_scenarios()
    build()
    _CACHE.clear()
    return OUT


def build(write: bool = True) -> dict:
    cat = _load(KB / 'catalog.json')
    html = _load(KB / 'layout_html.json.gz')
    parts = _load(KB / 'parts.json')
    PARTS = parts['PARTS']
    scx = _load(DATA / 'scenarios_full.json')
    layouts = build_layouts(cat, html)
    cards, modules, exemplars = build_scenarios(scx, layouts, PARTS)
    tagger = IndustryTagger(cat)
    images = build_images(cat, layouts, exemplars, cards, tagger)
    families = defaultdict(list)
    for f, l in layouts.items():
        if not l.get('retired'):
            families[l['fam']].append(f)
    lib = {
        'version': 1, 'parts': {'PARTS': PARTS, 'NEXT': parts.get('NEXT'), 'RELATED': parts.get('RELATED')},
        'enums': {k: scx[k] for k in ('REQ_TYPES', 'STRATEGIES', 'ENDINGS', 'STAGES')},
        'industries': cat['industries'], 'layouts': layouts, 'families': families, 'scenarios': cards, 'modules': modules,
        'exemplars': exemplars, 'images': images,
        'products': {p['id']: {k: p.get(k) for k in ('id', 'name', 'model', 'cat', 'spec', 'spaces', 'ind', 'kw', 'cur', 'fam', 'opt')}
                     for p in cat['products'] if p.get('cur')},
        'solutions': {s['id']: s for s in cat['solutions']},
        'cases': {str(c['id']): {k: c.get(k) for k in ('id', 'cust', 'title', 'sub', 'ind', 'prod', 'sol', 'space', 'needs', 'offer', 'proof', 'quote', 'type', 'scale', 'url')}
                  for c in cat['cases']},
    }
    if write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        tmp = OUT.with_suffix('.tmp')
        tmp.write_text(json.dumps(lib, ensure_ascii=False), encoding='utf-8')
        tmp.replace(OUT)
    return lib


_CACHE: Dict[str, dict] = {}


def load(path: Path = OUT) -> dict:
    key = str(path)
    if key not in _CACHE:
        _CACHE[key] = _load(path)
    return _CACHE[key]


if __name__ == '__main__':
    lib = build()
    im = lib['images']
    print('layouts', len(lib['layouts']), 'scenarios', len(lib['scenarios']), 'modules', len(lib['modules']), 'exemplars', len(lib['exemplars']),
          'images', len(im))
    print('image groups', Counter(v['group'] for v in im.values()).most_common())
    print('image classes', Counter(v['cls'] for v in im.values()).most_common())
    print('with industry', sum(1 for v in im.values() if v['inds']), 'neutral', sum(1 for v in im.values() if v['neutral']))
    sys.exit(0)
