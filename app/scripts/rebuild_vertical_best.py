#!/usr/bin/env python3
"""Customer proposals (샘플 버티컬 시나리오 bs_v_*) built on each vertical's standard proposal.

A deck takes the standard proposal's content — Overview, 고객 니즈와 핵심 제안, 공간별 제품, 솔루션, 도입사례,
Why Samsung, on the same L_VS_* sheets the standard decks use — and wraps it in the customer's own situation,
quantities, schedule and decision request. It is a proposal to one customer, not the 6-chapter standard format.

Content lives in app/data/vertical_proposals/<key>.json (one file per vertical, two customers each).
This script only maps that content onto existing layouts and chooses photographs.

  python app/scripts/rebuild_vertical_best.py                         # build all → vertical_scenarios.json
  python app/scripts/rebuild_vertical_best.py --check <key>           # validate one vertical, nothing written
  python app/scripts/rebuild_vertical_best.py --only a,b --out f.json # build some into a private file
"""
import copy, json, re, subprocess, sys, unicodedata
from html.parser import HTMLParser
from pathlib import Path
from proposal_content import ROOT, P, S, C, cut
from proposal_visuals import Pictures, media
from vertical_briefs import BRIEFS

DATA = ROOT / 'app/data/vertical_proposals'
TARGET = ROOT / 'app/web/src/domain/templates/vertical_scenarios.json'
REVISION = 'standard-proposal-v2'
TEAM = '삼성전자 한국총괄 B2B 영업팀'
DATE = '2026. 11'
ENDINGS = {'pilot', 'design', 'scope', 'contract', 'shortlist', 'workshop', 'codev', 'budget'}
REQS = {'new', 'renew', 'compete', 'ops', 'scale', 'brief'}
STRATEGIES = {'value', 'pain', 'space', 'roi', 'rfp', 'compete', 'land'}
PART_TYPE = {'open': 'overview', 'context': 'challenge', 'value': 'value', 'space': 'products',
             'build': 'solution', 'proof': 'case', 'plan': 'execution', 'close': 'closing'}
# The standard deck (standard_vertical_scenarios.json · bs_std_<id>) each vertical's fixed pages are taken from.
STANDARD_OF = {
    'ai_apartment': 'rs_apt', 'ai_office': 'of_hq', 'ai_store': 'fb_cafe', 'entertainment': 'vn_cinema',
    'knowledge_industry_center': 'of_sme', 'senior_town': 'rs_senior', 'smart_academy': 'ed_academy',
    'smart_barracks': 'mi_military', 'smart_factory': 'mf_factory', 'smart_finance': 'fn_bank', 'smart_home': 'rs_apt',
    'smart_hospital': 'md_hospital', 'smart_hotel': 'ht_large', 'smart_network': 'oe_telco', 'smart_office': 'of_hq',
    'smart_public': 'pb_agency', 'smart_retail': 'rt_flag', 'smart_school': 'ed_k12',
    'smart_transportation': 'pb_transport', 'smart_university': 'ed_univ',
}
# A space's product cut on the Map page, guessed from its product lines when the content names no pid.
PRODUCT_WORDS = [
    (r'1Way|무풍 1', 'wf1way'), (r'4Way|무풍 4', 'wf4way'), (r'360', 'ac360'), (r'DVM S|실외기', 'dvms2'), (r'칠러', 'dvmchiller'),
    (r'환기|ERV', 'erv'), (r'EHS|히트펌프', 'ehs'), (r'공기청정', 'purifier'), (r'에어드레서', 'airdresser'),
    (r'세탁|건조|콤보', 'laundry'), (r'냉장고|키친핏', 'bi_fridge'), (r'인덕션', 'bi_induction'), (r'식기세척', 'bi_dish'),
    (r'호텔 ?TV', 'hoteltv'), (r'The Wall|더 월', 'thewall'), (r'Onyx|오닉스|시네마 LED', 'onyx'), (r'실외 LED|옥외 LED', 'led_outdoor'),
    (r'LED', 'led_indoor'), (r'비디오월', 'vm55b'), (r'옥외|아웃도어', 'oh55a'), (r'윈도|쇼윈도', 'window'), (r'이페이퍼|E-?Paper', 'epaper'),
    (r'키오스크', 'kiosk'), (r'Flip|플립|전자칠판', 'flip'), (r'모니터', 'smartmonitor'), (r'사이니지|메뉴보드|TV', 'qm55c'),
    (r'액티브', 'tabactive5'), (r'엑스커버|XCover', 'xcover7'), (r'워치', 'watch'), (r'태그', 'smarttag'), (r'북|노트북', 'book'),
    (r'탭|태블릿', 'tabs11'), (r'갤럭시|스마트폰', 'galaxyA'), (r'하만|JBL|오디오|스피커', 'harman'), (r'에어컨|냉난방|공조', 'wf4way'),
]


class Slots(HTMLParser):
    """Text slots (data-tb → default text) and image slots (data-img → hint) of one sheet."""

    def __init__(self):
        super().__init__()
        self.stack, self.text, self.images = [], {}, {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.stack.append(a.get('data-tb', self.stack[-1] if self.stack else None))
        if 'data-img' in a:
            self.images[a['data-img']] = a.get('data-hint', '')
        if tag in ('img', 'br', 'hr', 'input', 'meta', 'link'):
            self.stack.pop()

    def handle_endtag(self, tag):
        if self.stack:
            self.stack.pop()

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in ('img', 'br', 'hr', 'input', 'meta', 'link'):
            self.handle_endtag(tag)

    def handle_data(self, text):
        if self.stack and self.stack[-1] is not None:
            self.text[self.stack[-1]] = self.text.get(self.stack[-1], '') + text


def registry():
    """Slots as the app draws them (footers · footnotes · small captions are dropped when a sheet is drawn)."""
    raw = json.loads(subprocess.run(['node', 'app/scripts/layout_registry.mjs'], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    out = {}
    for f, x in raw.items():
        drawn, source = Slots(), Slots()
        drawn.feed(x['drawn'])
        source.feed(x['source'])
        out[f] = {'text': drawn.text, 'source': set(source.text), 'images': drawn.images, 'unused': x['retired'] or x['variantOf'], 'part': x['part']}
    return out


LAYOUTS = registry()
STANDARD = json.loads((ROOT / 'app/web/src/domain/templates/standard_vertical_scenarios.json').read_text())
COVER_PHOTOS = json.loads((ROOT / 'app/data/proposal_cover_photos.json').read_text())
plain = lambda v: re.sub(r'<[^>]+>', '', v['html'] if isinstance(v, dict) else str(v))
# How much text a slot has been shown to hold: the longest fill among the verified standard decks.
ROOM = {}
for _deck in STANDARD['fills'].values():
    for _s in _deck:
        for _k, _v in _s['t'].items():
            ROOM[(_s['f'], _k)] = max(ROOM.get((_s['f'], _k), 0), len(plain(_v)))


def em(text):
    """Approximate rendered width in Hangul character widths."""
    return sum(1 if '가' <= ch <= '힣' else .3 if ch in ' ·,.' else .58 for ch in plain(text))


def rich(text):
    """'**강조**' and line breaks become the inline markup the slide renderer accepts."""
    text = unicodedata.normalize('NFC', str(text))
    if '**' not in text and '<br' not in text:
        return text
    return {'html': re.sub(r'\*\*(.+?)\*\*', r'<b style="color: #9db4ff">\1</b>', text)}


def product_picture(pid):
    p = P[pid]
    for i, src in enumerate(p.get('gal') or []):
        alts = p.get('galAlt') or ['']
        alt = alts[min(i, len(alts) - 1)]
        kinds = p.get('galKind') or []
        if (i < len(kinds) and kinds[i] == 'cut') or (re.search(r'정면|전면|사선|후면', alt) and not re.search(r'사용 장면|공간|설치|화면에', alt)):
            return {'src': src, 'name': p['name'] + ' · ' + alt, 'fit': 'contain', 'keep': True, 'products': [pid], 'kind': 'product'}
    r = cut(pid)
    if r:
        return {**media(r, 'contain'), 'products': [pid], 'kind': 'product'}
    if p.get('th'):
        return {'src': p['th'], 'name': p['name'] + ' 공식 제품 이미지', 'fit': 'contain', 'keep': True, 'products': [pid], 'kind': 'product'}
    raise ValueError('No product image ' + pid)


class Deck:
    def __init__(self, v, index):
        self.v, self.c, self.index = v, v['customers'][index], index
        self.customer = self.c['customer']
        self.brand = self.customer.split()[0]
        self.label = self.customer + ' · ' + v['name'] + ' 제안'
        self.pic = Pictures({'key': v['key'], 'ind': v['ind'], 'cases': [str(x) for x in self.c['cases']]}, index + 1)
        self.slides, self.groups, self.seen, self.chapters, self.warnings = [], [], set(), [], []
        self.case_id = str(v['cases'][self.c['case']]['id'])
        self.reserved = {im['src'] for im in self.pic.case_images(self.case_id)}
        std = 'bs_std_' + (v.get('std') or STANDARD_OF[v['key']])
        self.std = {s['f']: s for s in STANDARD['fills'][std]}

    # ---------- pictures: a scene photograph appears once per deck; product and solution images may recur ----------
    def keep(self, im):
        self.seen.add(im['src'])
        return im

    def scene(self, query, wide=False):
        return self.keep(self.pic.scene(query, wide=wide, avoid=self.seen | self.reserved))

    def image(self, ref, fallback, avoid=()):
        """'product:<id>' → product cut · 'solution:<id>' → solution screen · anything else → a scene query."""
        kind, _, ident = str(ref or '').partition(':')
        if kind == 'product' and ident in P:
            return product_picture(ident)
        if kind == 'solution' and ident in S:
            screens = self.pic.screens(ident)
            if screens:
                im = min(screens, key=lambda x: (x['src'] in avoid, self.pic.screen_used[x['src']], -x['w']))
                self.pic.screen_used[im['src']] += 1
                return media(im, 'contain')
        return self.scene(ref if kind not in ('product', 'solution') and ref else fallback)

    def case_photos(self, n):
        pool = [im for im in self.pic.case_images(self.case_id) if im['src'] not in self.seen]
        pool.sort(key=lambda im: (im['kind'] in ('u', 'd'), -im['w']))
        return [self.keep(media(im, 'contain' if im['kind'] in ('u', 'd') else 'cover')) for im in pool[:n]]

    # ---------- structure ----------
    def chapter(self, name):
        if name not in self.chapters:
            self.chapters.append(name)
        return f'{self.chapters.index(name) + 1:02} · {name}'

    def add(self, f, stage, part, role, t, imgs, note=''):
        schema = LAYOUTS[f]
        where = f'{self.sid} p{len(self.slides) + 1} {f}'
        if schema['unused']:
            raise ValueError(f'{where}: 라이브러리에서 뺀 레이아웃입니다 → {schema["unused"]}')
        t = {str(k): (rich(x) if isinstance(x, str) else x) for k, x in t.items()}
        unknown = set(t) - schema['source']
        if unknown:
            raise ValueError(f'{where}: 없는 칸 {sorted(unknown, key=int)}')
        t = {k: x for k, x in t.items() if k in schema['text']}  # a value for a slot the renderer drops is not kept
        missing = set(schema['text']) - set(t)
        if missing:
            raise ValueError(f'{where}: 빈 칸 {sorted(missing, key=int)} ({role})')
        blank = [k for k, x in t.items() if not plain(x).strip()]
        if blank:
            raise ValueError(f'{where}: 내용 없는 칸 {blank} ({role})')
        img = imgs if isinstance(imgs, dict) else dict(zip(schema['images'], imgs))
        img = {str(k): x for k, x in img.items()}
        if set(img) != set(schema['images']):
            raise ValueError(f'{where}: 이미지 칸 {sorted(img)} ≠ {sorted(schema["images"])}')
        for k, x in t.items():
            room = max(len(schema['text'][k].strip()), ROOM.get((f, k), 0))
            if room >= 6 and len(plain(x)) > room * 1.15 + 3:
                self.warnings.append(f'p{len(self.slides) + 1} {f}[{k}] {len(plain(x))}자 > 약 {int(room * 1.15 + 3)}자: {plain(x)[:40]}')
        slide = {'f': f, 't': t, 'img': img}
        if note:
            slide['notes'] = note
        self.slides.append(slide)
        if not self.groups or self.groups[-1]['name'] != part:
            self.groups.append({'key': stage, 'name': part, 'goal': role, 'slides': []})
        self.groups[-1]['slides'].append({'f': f, 'role': role})

    def fixed(self, f):
        """A page that is the same in every proposal of the vertical starts from the standard deck's own fill."""
        base = self.std[f]
        return {int(k): copy.deepcopy(x) for k, x in base['t'].items() if k in LAYOUTS[f]['text']}, copy.deepcopy(base['img'])

    # ---------- pages ----------
    def cover(self):
        c, v = self.c, self.v
        title = c.get('coverTitle') or (v['name'] + '\n' + ('구축 제안서' if self.index == 0 else '운영 개선 제안서'))
        cover = COVER_PHOTOS.get(self.sid)
        hero = self.keep(copy.deepcopy(cover)) if cover else self.scene(c['coverScene'], wide=True)
        if self.index == 0:
            t = {1: 'SAMSUNG', 2: 'BUSINESS PROPOSAL', 3: title, 4: c['tagline'], 5: DATE, 6: self.customer}  # a long name and the date do not share a line
            self.add('L_C02', 'open', '제안 개요', '표지 · ' + c['project'], t, [hero])
        else:
            t = {1: 'SAMSUNG', 2: 'BUSINESS PROPOSAL', 3: title, 4: c['tagline'], 5: self.customer, 6: DATE, 7: 'CONFIDENTIAL'}
            self.add('L_C01', 'open', '제안 개요', '표지 · ' + c['project'], t, [hero])

    def overview(self):
        t, img = self.fixed('L_VS_DSS')
        t.update({0: self.chapter('Overview').upper(), 1: self.c['overviewTitle']})
        self.add('L_VS_DSS', 'open', '제안 개요', '삼성 AI 비즈니스 — Device · Solution · Service', t, img)

    def challenges(self):
        x = self.c['challenges']
        t = {0: self.chapter('고객 현황과 과제'), 1: x['title'], 2: x['sub']}
        for k, it in enumerate(x['items']):
            i = 3 + k * 6
            t.update({i: f'과제 {k + 1:02}', i + 1: it['space'], i + 2: it['title'], i + 3: it['detail'], i + 4: it['metric'], i + 5: it['metricLabel']})
        self.add('L_PH_CH_A', 'context', '고객 현황과 과제', '세 가지 과제 — ' + ' · '.join(it['space'] for it in x['items']), t,
                 [self.scene(it['scene']) for it in x['items']])

    def now_then(self):
        x = self.c['nowThen']
        t = {0: self.chapter('고객 현황과 과제'), 1: x['title'], 2: x['sub'], 3: '지금', 4: '바라는 모습', 5: x['nowTitle'], 9: x['thenTitle']}
        for k in range(3):
            t[6 + k], t[10 + k] = x['now'][k], x['then'][k]
        self.add('L_PH_CH_B', 'context', '고객 현황과 과제', '지금 → 바라는 모습', t, [self.scene(q) for q in x['scenes']])

    def needs(self):
        v, c = self.v, self.c
        t = {0: self.chapter(v['chapter']), 1: c['needsTitle'], 2: c['needsSub'], 3: '고객 니즈', 4: v['chapter'], 5: '핵심 제안'}
        img = {}
        for k, n in enumerate(v['needs']):
            i = 6 + k * 7
            t.update({i: f'Q{k + 1}', i + 1: n['quote'], i + 2: n['tech'], i + 3: n['techNote'], i + 4: n['value'], i + 5: n['points'][0], i + 6: n['points'][1]})
            img[k] = self.image(n['img'], n['scene'], avoid={x['src'] for x in img.values()})
            for point in n['points']:
                if em(point) > 9:
                    self.warnings.append(f'needs.points "{point}" — 한 줄(약 9자 폭)을 넘습니다')
        self.add('L_VS_NEEDS', 'value', v['chapter'] + ' 핵심 제안', '고객 니즈 → ' + ' · '.join(n['value'] for n in v['needs']), t, img)

    def feature(self, which, order):
        v, c = self.v, self.c
        x = v['features'][which]
        f = ('L_VS_CORE_1', 'L_VS_CORE_2')[order]
        t = {0: self.chapter(v['chapter']) + ' · ' + x['title'], 1: (c.get('featureTitles') or {}).get(str(which)) or x['title'], 2: x['lead']}
        img = {}
        for r, row in enumerate(x['rows']):
            i = 3 + r * 7
            t.update({i: f'{r + 1:02}', i + 1: row['title'], i + 2: row['device'], i + 3: row['desc'], i + 4: row['steps'][0], i + 5: row['steps'][1], i + 6: row['steps'][2]})
            img[r] = self.image(row.get('img'), row['scenes'][1], avoid={y['src'] for y in img.values()})
            if em(row['desc']) > 44:
                self.warnings.append(f'features[{which}].rows[{r}].desc — 세 줄(약 44자 폭)을 넘어 카드 아래로 내려갑니다: {row["desc"][:30]}')
        self.add(f, 'value', v['chapter'] + ' 핵심 제안', x['title'] + ' — ' + ' · '.join(row['title'] for row in x['rows']), t, img)

    def space_image(self, sp, taken):
        """What stands for a space on the Map page: its product cut, or the solution screen when the space holds a service only."""
        pages = [x['pid'] for x in self.v['products'] if x['space'] == sp['name']]
        words = [pid for line in sp['lines'] for rx, pid in PRODUCT_WORDS if re.search(rx, line)]
        named = [pid for pid in [*pages, *words] if pid in P]
        pid = sp['pid'] if sp.get('pid') in P else next((x for x in named if x not in taken), named[0] if named else None)
        if not pid:
            sid = next((s['id'] for s in S.values() if any(s['name'] in line for line in sp['lines'])), None)
            if sid and self.pic.screens(sid):
                return self.image('solution:' + sid, sp['scene'])
            pid = next((x for x in self.c['products'] if x in P and x not in taken), self.c['products'][0])
        taken.append(pid)
        return product_picture(pid)

    def spaces(self):
        x = self.c['spaces']
        n = len(x['items'])
        f = f'L_VS_MAP_{n}'
        if f not in LAYOUTS:
            raise ValueError(f'{self.sid}: spaces.items는 3~10곳이어야 합니다 ({n})')
        t = {0: self.chapter('공간별 제안'), 1: x['title'], 2: x['sub']}
        img, taken = {}, []
        step = 3 if n <= 4 else 2  # the 3- and 4-space maps add one sentence per space
        for k, sp in enumerate(x['items']):
            t[3 + k * step], t[4 + k * step] = sp['name'], ' · '.join(sp['lines'])
            if step == 3:
                page = next((p for p in self.v['products'] if p['space'] == sp['name']), None)
                if not (sp.get('note') or page):
                    raise ValueError(f'{self.sid}: 공간이 4곳 이하면 spaces.items[{k}]에 "note"(그 공간에서 하는 일 한 문장)가 필요합니다')
                t[5 + k * step] = sp.get('note') or page['key']
            img[k] = self.space_image(sp, taken)
        self.add(f, 'space', '공간별 제안', '공간 × 제품 — ' + ' · '.join(sp['name'] for sp in x['items']), t, img)

    def product(self, pick, order):
        x = self.v['products'][pick['i']]
        space = pick.get('space') or x['space']
        t = {0: self.chapter('공간별 제안') + f' · {order + 1:02}', 1: space, 2: pick.get('key') or x['key'], 3: '대표 제품 · ' + pick['qty'], 4: x['product'],
             5: x['points'][0]['t'], 6: x['points'][0]['d'], 7: x['points'][1]['t'], 8: x['points'][1]['d']}
        self.add('L_VS_SPACE', 'space', '공간별 제안', space + ' — ' + x['product'], t, {0: product_picture(x['pid']), 1: self.scene(x['scene'])})

    def solution_intro(self):
        s = self.v['solution']
        t = {0: self.chapter(self.v['solutionChapter']), 1: s['name'], 2: ' '.join(s['headline']) + ' 솔루션'}
        for k, val in enumerate(s['values']):
            t.update({3 + k * 3: f'{k + 1:02}', 4 + k * 3: val['t'], 5 + k * 3: val['d'].replace('**', '')})
        self.add('L_PH_VP_C', 'build', self.v['solutionChapter'], s['name'] + ' — ' + ' · '.join(x['t'] for x in s['values']), t,
                 [self.scene(s['scene'], wide=True)])

    def solution_day(self):
        s = self.v['solution']
        x = s['day']
        t = {0: self.chapter(self.v['solutionChapter']) + ' · ' + s['name'], 1: self.c.get('dayTitle') or x['title'], 2: x['lead'],
             24: x['sumLabel'], 25: x['sum'], 26: x['badge']}
        slots = [(3, 4, 5, (6,), 7), (8, 9, 10, (11, 12), 13), (14, 15, 16, (17,), 18), (19, 20, 21, (22,), 23)]
        for k, (no, when, title, tags, desc) in enumerate(slots):
            sc = x['scenes'][k]
            if len(sc['tags']) != len(tags):
                raise ValueError(f'{self.v["key"]}: solution.day.scenes[{k}].tags는 {len(tags)}개여야 합니다')
            t.update({no: str(k + 1), when: sc['when'], title: sc['title'], desc: sc['desc']})
            for slot, tag in zip(tags, sc['tags']):
                t[slot] = tag
        self.add('L_PH_SOL_S', 'build', self.v['solutionChapter'], s['name'] + ' 이용 장면 — ' + ' · '.join(sc['title'] for sc in x['scenes']), t,
                 [self.scene(sc['scene']) for sc in x['scenes']])

    def solution_cards(self):
        s = self.v['solution']
        x = s['cards']
        place = self.c['spaces']['items'][-1]['name']
        t = {0: '적용 공간', 1: x.get('place') or place, 2: self.chapter(self.v['solutionChapter']) + ' · ' + s['name'], 3: self.c.get('cardsTitle') or x['title'], 4: x['lead']}
        for k, it in enumerate(x['items'][:3]):
            i = 5 + k * 4
            t.update({i: f'기능 {k + 1:02}', i + 1: it['t'], i + 2: it['d'], i + 3: it.get('tag') or ('연결', '확인', '운영')[k]})
        scene = x.get('scene') or s['scene']
        self.add('L_PH_SF_B', 'build', self.v['solutionChapter'], s['name'] + ' — ' + ' · '.join(it['t'] for it in x['items'][:3]), t,
                 [self.scene(scene), self.image('solution:' + s['sid'], scene), self.scene(x.get('place') or place), self.scene(scene + ' 직원')])

    def case(self):
        x = self.v['cases'][self.c['case']]
        record = C[self.case_id]
        url = '원문 · samsung.com 도입사례 · ' + record['date'][:7].replace('-', '. ')
        count = len([src for src in self.reserved if src not in self.seen])
        role = '도입사례 — ' + x['name']
        if count >= 4:
            t = {0: self.chapter('도입사례'), 1: x['name'], 2: x['sub'], 3: '도입 포인트', 10: url}
            for k, p in enumerate(x['points']):
                t.update({4 + k * 2: p['t'], 5 + k * 2: p['d']})
            self.add('L_VS_CASE', 'proof', '도입사례', role, t, dict(enumerate(self.case_photos(4))), note=record['url'])
        elif count >= 3:
            t = {0: '도입 현장', 1: x['name'][:14], 2: '적용 공간', 3: (record.get('space') or ['도입 공간'])[0][:14], 4: '제품 · 솔루션', 5: x['points'][0]['t'][:20],
                 6: self.chapter('도입사례'), 7: x['name'], 8: '도입 개요', 9: x['sub']}
            for k, p in enumerate(x['points']):
                t.update({10 + k * 3: f'{k + 1:02}', 11 + k * 3: p['t'], 12 + k * 3: p['d']})
            self.add('L_PH_CB_A', 'proof', '도입사례', role, t, self.case_photos(3), note=record['url'])
        else:
            t = {0: '공식 도입 현장', 1: x['name'], 2: self.chapter('도입사례'), 3: x['name'], 4: x['sub']}
            for k, p in enumerate(x['points']):
                t.update({5 + k * 4: f'{k + 1:02}', 6 + k * 4: p['t'], 7 + k * 4: p['d'], 8 + k * 4: ('도입 배경', '적용 구성', '운영 효과')[k]})
            self.add('L_PH_OV_H', 'proof', '도입사례', role, t, self.case_photos(1) if count else [self.scene(x['name'])], note=record['url'])

    def why(self):
        f, role = (('L_VS_WHY_1', 'Samsung Business — People · Product · Process · Brand'), ('L_VS_WHY_3', '통합 오퍼링 — Device · Solution · Service'))[self.index]
        t, img = self.fixed(f)
        t[0] = self.chapter('Why Samsung').upper()
        self.add(f, 'proof', 'Why Samsung', role, t, img)

    def closing(self):
        t = {0: self.brand, 1: 'SAMSUNG', 2: self.label, 3: TEAM}
        self.add('L_VS_END', 'close', '마무리', '마무리', t, [self.scene(self.c.get('closingScene') or self.c['coverScene'], wide=True)])

    # ---------- deck ----------
    @property
    def sid(self):
        return f'bs_v_{self.v["key"]}_{self.index + 1}'

    def build(self):
        c = self.c
        self.cover()
        self.overview()
        if self.index == 0:
            self.challenges()
        else:
            self.now_then()
        self.needs()
        for order, which in enumerate(c['featurePages'][:2]):
            self.feature(which, order)
        self.spaces()
        for order, pick in enumerate(c['productPages'][:3]):
            self.product(pick, order)
        self.solution_intro()
        if self.index == 0:
            self.solution_day()
        else:
            self.solution_cards()
        self.case()
        # 추진 일정(L_PH_IP_A) · 단계별 도입(L_PH_PL_A) · 결정 요청과 다음 일정(L_PH_C13) 장은 넣지 않는다 —
        # 그 레이아웃은 라이브러리에서 삭제했다(app/web/src/domain/templates/removed_layouts.js). 내용 파일의 plan · rollout · nextSteps는 쓰지 않는다.
        self.why()
        self.closing()
        return self.scenario(), self.slides, self.story()

    def scenario(self):
        c, v, m = self.c, self.v, self.c['meta']
        for key, allowed in (('req', REQS), ('strategy', STRATEGIES), ('ending', ENDINGS)):
            if m[key] not in allowed:
                raise ValueError(f'{self.sid}: meta.{key}={m[key]!r}')
        for kind, table, ids in (('product', P, c['products']), ('solution', S, c['solutions']), ('case', C, [str(x) for x in c['cases']])):
            for ident in ids:
                if ident not in table:
                    raise ValueError(f'{self.sid}: unknown {kind} {ident}')
        return {
            'id': self.sid, 'req': m['req'], 'ind': v['ind'], 'strategy': m['strategy'], 'ending': m['ending'], 'minutes': 30,
            'title': c['project'] if self.brand[:3] in c['project'] else self.customer + ' — ' + c['project'], 'short': m['short'],
            'situation': m['situation'], 'signals': m['signals'], 'audience': m['audience'], 'criteria': m['criteria'], 'thesis': m['thesis'],
            'logic': m['logic'], 'diff': m['diff'], 'tone': m['tone'], 'messages': m['messages'], 'flow': self.groups,
            'ask': m['ask'], 'next': m['next'], 'prep': m['prep'],
            'products': c['products'], 'solutions': c['solutions'], 'cases': [str(x) for x in c['cases']],
            'kpis': m['kpis'], 'objections': m['objections'], 'fit': m['fit'], 'avoid': m['avoid'],
            'sourceSpec': v['key'], 'authoringRevision': REVISION, 'sourceMode': 'standard-proposal', 'coverRevision': 'single-photo-cover-v1',
        }

    def story(self):
        m = self.c['meta']
        keymen = m.get('keymen')
        if not keymen:
            who = [m['audience']['lead'], *m['audience']['others']][:3]
            weights = [40, 35, 25] if len(who) == 3 else [60, 40] if len(who) == 2 else [100]
            keymen = [[name, weights[k], [m['criteria'][k % len(m['criteria'])]]] for k, name in enumerate(who)]
        if sum(k[1] for k in keymen) != 100:
            raise ValueError(f'{self.sid}: keymen weights must total 100')
        parts = {}
        for g in self.groups:
            kind = 'why' if g['name'] == 'Why Samsung' else PART_TYPE[g['key']]
            parts[g['name']] = {'type': kind, 'items': [x['role'] for x in g['slides']]}
        return {'keymen': keymen, 'note': m['situation'], 'parts': parts}


def findings(deck, slides, scenario):
    """What makes a deck read like a stamped sample: repeated copy, repeated photographs, sample wording."""
    fixed = ('L_VS_DSS', 'L_VS_WHY_1', 'L_VS_WHY_3')
    names = {deck.label, deck.customer, TEAM, '다음 단계로 넘어가는 기준', deck.v['solution']['name'], *(n['tech'] for n in deck.v['needs']),
             *(row['device'] for x in deck.v['features'] for row in x['rows']), *(x['product'] for x in deck.v['products'])}
    texts = [plain(x) for s in slides if s['f'] not in fixed for x in s['t'].values() if len(plain(x)) > 14 and plain(x) not in names]
    layouts = [s['f'] for s in slides if s['f'] != 'L_VS_SPACE']  # the standard repeats the space sheet once per space
    photos = [im['src'] for s in slides for im in s['img'].values() if im.get('fit') != 'contain' and im.get('kind') != 'product']
    out = [f'같은 문구 반복 — {x[:50]}' for x in sorted({x for x in texts if texts.count(x) > 1})]
    out += [f'같은 양식 반복 — {f}' for f in sorted({f for f in layouts if layouts.count(f) > 1})]
    out += [f'같은 사진 반복 — {src}' for src in sorted({src for src in photos if photos.count(src) > 1})]
    hits = sorted(set(re.findall(r'가상|제안 예시|예시|샘플|\[00|\[N\]|\[확인 필요\]|OOO|TBD', json.dumps([slides, scenario], ensure_ascii=False))))
    if hits:
        out.append(f'금지 표현 {hits}')
    return out


def main():
    arg = lambda name: sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
    only, subset, private = arg('--check'), arg('--only'), arg('--out')
    if subset and not private:
        raise SystemExit('--only needs --out <file>; the shared scenario file is written only by a full build')
    order = [b['key'] for b in BRIEFS]
    files = sorted((p for p in DATA.glob('*.json') if not p.name.startswith('_')), key=lambda p: order.index(p.stem) if p.stem in order else 99)
    previous = json.loads(TARGET.read_text())
    out = {'scenarios': [], 'fills': {}, 'story': {}, 'customers': {}, 'sources': previous['sources']}
    problems = []
    for path in files:
        if only and path.stem != only or subset and path.stem not in subset.split(','):
            continue
        v = json.loads(path.read_text())
        if v['key'] != path.stem or len(v['customers']) != 2:
            raise ValueError(path.name + ': key / customers')
        for index in range(2):
            deck = Deck(v, index)
            scenario, slides, story = deck.build()
            out['scenarios'].append(scenario); out['fills'][deck.sid] = slides; out['story'][deck.sid] = story; out['customers'][deck.sid] = deck.customer
            problems += [f'{deck.sid}: {w}' for w in deck.warnings + findings(deck, slides, scenario)]
            print(deck.sid, len(slides), 'slides', flush=True)
    for line in problems:
        print('CHECK', line)
    if only:
        print('checked', only, '·', len(problems), 'findings · nothing written')
        return 1 if problems else 0
    if private:
        Path(private).write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
        print('wrote', private, '·', len(out['scenarios']), 'decks ·', len(problems), 'findings')
        return 0
    built = {s['id'] for s in out['scenarios']}
    carried = [s for s in previous['scenarios'] if s['id'] not in built]
    if carried:
        # A vertical without a content file keeps its previous deck until it is authored.
        print('CARRIED OVER (no content file yet):', ' '.join(sorted({s['sourceSpec'] for s in carried})))
        merged = {s['id']: s for s in out['scenarios'] + carried}
        ids = [f'bs_v_{key}_{n}' for key in order for n in (1, 2)]
        out['scenarios'] = [merged[i] for i in ids]
        for name in ('fills', 'story', 'customers'):
            out[name] = {i: (out[name].get(i) if i in built else previous[name][i]) for i in ids}
    if len(out['scenarios']) != 40:
        raise ValueError(f'{len(out["scenarios"])} decks; expected 40')
    temporary = TARGET.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(TARGET)
    print(json.dumps({'decks': len(out['scenarios']), 'slides': sum(map(len, out['fills'].values())), 'findings': len(problems), 'revision': REVISION}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
