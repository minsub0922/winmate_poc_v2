"""레이아웃 자동 구성 (``compose`` step ``auto``) — an orchestrator plans the whole deck, then every part is composed in parallel.

    out = run_auto(proposal, body, llm, emit=job.emit, log=job.log, check_cancel=job.check_cancel, workers=4)

1. **Orchestrate** (one model call, schema-constrained, validated and then *enforced* in code — ``orchestrate`` /
   ``enforce_plan``): requirements (+ the saved summary), the linked 제품 · 솔루션 · 사례 with their catalog facts, the 공간
   구성 and the ordered template parts → thesis · storyline · requirement points, and per part the one message it must land,
   the points it owns, and the products · solutions · cases · spaces it shows. Code guarantees: ids exist · every linked
   product / solution / case sits in a part that can show it · a requirement point has exactly one owner · space parts
   follow the space plan · template order is kept. ``avoid`` (what the other parts own) is derived from the plan.
2. **Layouts** per part (``compose_part`` — code, driven by the plan): start from the template slides of the part and
   adapt them to what the part was assigned — one 공간 slide per planned space, one 솔루션 slide per assigned solution
   (others dropped, missing ones added from the same layout family), one 사례 slide per assigned case, 조감도 · Map ·
   간지 · 목차 variants for the new counts. A shared thread-safe registry keeps one-per-deck layouts unique.
3. **Texts** per part, in parallel (``fill_part_text``): the part's plan is the brief — message, owned points, referenced
   points (mention only), assigned entities with catalog facts, the neighbours' messages and the avoid list. Every slot
   has a policy from the app's own slot classification (slot_modes.json): 고정 → kept, 목차 번호 → numbered by code,
   제품 · 솔루션 · 사례 → kept when the slide still shows the same item, otherwise rewritten from that item's facts, the
   rest → written by the model. Guards (length · other customers' names · unsupported numbers · editorial notes) → one
   repair round → masking.
4. **Pictures** per part (``pictures.fill_part_images``): typed and bound slots, hard filters, model pick + verification.
5. Streaming: ``plan`` once, then ``part`` started / done / error per part; a failed part is retried once and never sinks
   the others.

Two rules hold whatever the template carried and whatever the model wrote:

* **Selected items only** (``unlinked_vocab`` · ``enforce_linked``): a product · solution is part of the offer only when the
  customer selected it (제품 · 솔루션 매칭) — not because the requirement text or a linked case mentions it. After the texts and
  pictures of a part, code clears every cell that names an unselected product · brand · solution (exact catalog names
  included), every product name cell that holds no selected item and every product picture that is not a selected product's
  cut. The Device · Solution · Service diagram lists the selected items and leaves the other cells empty; a 핵심 제안 장 whose
  need no selected item answers is left out. An empty cell beats an offer the customer never chose.
* **Fixed content** (``fixed_part`` · ``sl['fixed']``): Why Samsung (the whole part) and every 도입사례 sheet are used exactly
  as authored — no model call writes them and no picture is re-chosen; only the page number · footer · chapter number follow
  this deck. Which case is shown is chosen (linked cases, else cases that fit); a case without an authored sheet gets one
  built by code from its catalog record (``case_sheet``), the way the authored sheets were made.
"""
from __future__ import annotations

import math
import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any, Callable, Dict, List, Optional, Sequence, Set

from . import context as ctxm
from . import market as mkt
from . import placeholders as phm
from .fill import FIXED, GUIDE, ORDINAL, PLACEHOLDER, check_value, mask_value, plain
from .library import load
from . import pictures as _pictures
from .pictures import (ICON_SRC, PictureRegistry, Registry, by_shape, case_photos, counts_once, deck_repeats, fill_part_images, is_cut_of, match_entity,
                       near_slots, norm_src, pic, product_cut, reserve_space_photos, rule_reject, candidates, solution_media)
from .pictures import _img_value as img_value
from .textsim import overlap, tokens

HAN = re.compile(r'[\u4e00-\u9fff]+')
DIV = re.compile(r'^L_VS_DIV_R(\d)$')
CONF = re.compile(r'^CONFIDENTIAL\s*·\s*\d+$')
EYEBROW = re.compile(r'^(\d{2}) · (.+)$')
SIBLING = re.compile(r'^(L_VS_BIRD_[SB]|L_VS_MAP_|L_TOC_INDEX|L_TOC_BOM|L_TOC_TECH|L_VS_DIV_R)(\d+)$')
# layouts a deck may hold several times (one per space · case · chapter) — everything else is one per deck
REPEATABLE = re.compile(r'^(L_VS_SPACE(?:_P\d)?|L_VS_CASE|L_VS_DIV_R\d|L_TOC_JOURNEY\w*|L_TOC_PFEAT|L_SUB_PAY3|L_TOC_SCN_S\d|L_TOC_SCN_MAP\d+)$')
# 공간별 제품 장 — 제품이 하나인 공간은 L_VS_SPACE, 둘 이상이면 그 공간의 제품 k개를 모두 놓는 L_VS_SPACE_P<k>(k = 2 ~ 8, 사용자 지시 2026-11-17:
# 공간별 제품 장 수 = 공간 수, 장 안의 제품 수 = 조감도에서 그 공간에 놓인 제품 수). 칸: 0 장 표식 · 1 공간 이름 · 2 key message,
# 제품 j 마다 [이름 · 특징(제목 · 설명) × nf] — 제품 하나의 칸 수 per = (마지막 칸 - 2) / k, 사진 0 … k-1 제품 컷 · k 공간 사진
SPACE_P = re.compile(r'^L_VS_SPACE_P(\d)$')
SPACE_P_MAX = 8
# 고객/공간 시나리오 (사용자 지시 2026-11-17 · 2차 · 3차) — 공간별 시나리오(L_TOC_SCN_S<m>: 공간 3곳씩 한 장, 한 곳만 남지 않게 — 4 → 2 + 2 · 7 → 3 + 2 + 2.
# 공간 사진마다 그 공간 제품 컷 3개까지 겹쳐 보기(컷마다 제품 이름을 겹쳐 씀) · 공간마다 그 공간의 시나리오(공간 사이 → 화살표) · 아래는 고른 솔루션 · 서비스를
# 구분 없이 6줄, 모든 장에 같게 두고 이 장의 공간에서 쓰는 기능만 켬(선 아이콘 + 밑줄 on/off · 그 밑에 기능 이름 — 5칸), 쓰는 공간 표시 없음)
# + 활용 맵(L_TOC_SCN_MAP<n>: 솔루션 · 서비스 8줄 × 공간 n = 2–10곳, 넘으면 나눠 여러 장).
# 앱 app/web/src/domain/templates/scenario_plan.js 와 같은 규칙. 공간마다 쓰는 솔루션 · 서비스는 앱이 공간 구성에 실어 보낸다(space_plan.spaces[].uses) —
# 없으면 솔루션의 함께 쓰는 제품(with)이 놓인 공간, 그것도 없으면 제품이 놓인 모든 공간. 켜는 기능은 업종 공간 자료(vertical_space_solution.json — _feature_registry).
SCN_S = re.compile(r'^L_TOC_SCN_S(\d)$')
SCN_MAP = re.compile(r'^L_TOC_SCN_MAP(\d+)$')
SCN_PER, SCN_CUTS, SCN_ROWS, SCN_MAP_MIN, SCN_MAP_MAX = 3, 3, 8, 2, 10
SCN_USE_ROWS, SCN_USE_ICONS = 6, 5
STATIC = re.compile(r'^(L_VS_WHY_\d|L_VS_END|L_SUB_\w+)$')
MAX_PARTS, MAX_SLIDES, MAX_SPACES = 30, 40, 10


# product types / solutions a slide can name → the words in a linked item (or in the customer's own requirement) that make it legitimate
TYPE_WORDS = [
    ('키오스크', ['키오스크'], ['키오스크', 'kiosk']), ('이페이퍼', ['이페이퍼', '전자 가격표', 'E Paper', 'E-Paper', 'e-paper'], ['이페이퍼', 'e-paper', 'E Paper', 'EM32']),
    ('전자칠판', ['전자칠판'], ['전자칠판', 'Flip', '플립']), ('비디오월', ['비디오월'], ['비디오월']),
    ('호텔 TV', ['호텔 TV', '객실 TV'], ['호텔 TV', '객실 TV', 'HG']), ('태블릿', ['갤럭시 탭', '태블릿', '탭 POS'], ['탭', 'Tab', '태블릿']),
    ('노트북', ['갤럭시 북', '노트북'], ['갤럭시 북', 'Book', '노트북']), ('스마트폰', ['스마트폰', '러기드폰'], ['스마트폰', 'XCover', '갤럭시 A', '갤럭시 S']),
    ('워치', ['갤럭시 워치', '워치'], ['워치', 'Watch']), ('냉장고', ['냉장고'], ['냉장고']), ('세탁기', ['세탁기', '건조기'], ['세탁', '건조']),
    ('공기청정기', ['공기청정기'], ['공기청정']), ('에어드레서', ['에어드레서'], ['에어드레서']), ('식기세척기', ['식기세척기'], ['식기세척']),
    ('인덕션', ['인덕션'], ['인덕션']), ('정수기', ['정수기'], ['정수기']),
    ('시스템에어컨', ['에어컨', '카세트', '무풍'], ['에어컨', '카세트', '무풍', 'DVM', '공조', '히트펌프', '냉난방', '냉방']),
    ('공조 케어 서비스', ['공조 케어', '에어컨 케어', '에어컨 세척', '전문 세척'], ['에어컨', '카세트', '무풍', 'DVM', '공조', '히트펌프', '냉난방']),
    ('환기', ['환기 시스템', '청정환기'], ['환기', 'ERV']), ('LED 사이니지', ['LED 사이니지', 'The Wall', '더 월'], ['LED', 'The Wall', '더 월']),
    ('옥외 사이니지', ['옥외 사이니지', '옥외형 사이니지'], ['옥외', '실외', '창문형']),
    ('사이니지', ['사이니지', '메뉴보드'], ['사이니지', 'LED', '비디오월', '메뉴보드', 'TV', '디스플레이']),
    ('콜드체인', ['콜드체인', '콘덴싱'], ['콜드체인', '콘덴싱', '쇼케이스', '냉동', '저온']), ('복합기', ['복합기', '프린터'], ['복합기', '프린터', '출력']),
    ('오디오', ['하만', '스피커'], ['하만', 'JBL', '스피커', '사운드', '오디오', '음향']), ('모니터', ['모니터'], ['모니터']),
    # topics, not products: a template row about energy / air conditioning has no place in a deck whose requirements and linked items never mention it
    ('에너지 · 냉난방', ['냉난방', '에너지', '전력', '전기료', '절전', '설정 온도', '공조', 'kWh', '쾌적'],
     ['냉난방', '에너지', '전력', '전기료', '절전', '공조', '쾌적', '에어컨', '카세트', '무풍', 'DVM', '히트펌프', '환기', 'SmartThings', '스마트싱스', 'b.IoT', 'DMS']),
]
SOL_WORDS = [('VXT', ['VXT'], {'vxt'}), ('MagicINFO', ['MagicINFO', '매직인포'], {'magicinfo'}), ('SmartThings', ['SmartThings', '스마트싱스'], {'stpro', 'smartthings'}),
             ('Knox', ['Knox', '녹스'], {'knoxsuite', 'knoxcapture'}), ('LYNK Cloud', ['LYNK'], {'lynk'}), ('b.IoT', ['b.IoT'], {'biot'}), ('DeX', ['DeX'], {'dex'}),
             ('DMS', ['DMS'], {'sac'}), ('CounThru', ['CounThru'], set()), ('SecuThru', ['SecuThru'], set()), ('갤럭시 클래스룸', ['클래스룸'], set())]


# product lines a slide can name by brand — legitimate only when a selected product carries the same word
BRAND_WORDS = [
    ('Galaxy AI · 갤럭시', ['Galaxy AI', '갤럭시 AI', '갤럭시', 'Galaxy']), ('Bespoke 가전', ['Bespoke', 'BESPOKE', '비스포크']),
    ('TV', ['AI TV', 'Neo QLED', 'QLED', 'OLED', 'The Frame', '더 프레임', '스마트 TV', 'TV']), ('무빙스타일', ['무빙스타일']),
    ('뷰피니티 · 오디세이', ['뷰피니티', 'ViewFinity', '오디세이', 'Odyssey']), ('Infinite 가전', ['Infinite', '인피니트']), ('데이코', ['데이코', 'Dacor']),
    ('김치플러스 · 큐커', ['김치플러스', '큐커']), ('시스템에어컨 DVM', ['DVM', '1Way', '4Way']), ('무풍 에어컨', ['무풍', 'WindFree']),
]
# product family → the category codes the vertical × space registry lists for a space (vertical_space_product.json)
FAM_CATS = {'디스플레이': ('lcd_', 'led_', 'vwall', 'btv', 'g_kiosk', 'iwb', 'epaper', 'htv', 'tv', 'spatial', 'g_cinema', 'mon'),
            '공조 · 에어컨': ('sac_', 'ac', 'air', 'erv', 'vent'), '주방 · 리빙 가전': ('ref_', 'wash', 'airdresser', 'dish', 'oven', 'cook', 'vac', 'laundry', 'mw'),
            '모바일 · PC': ('tab', 'phone', 'g_rugged', 'watch', 'book', 'nb', 'pc'), '오디오': ('harman', 'audio'), '프린팅': ('print', 'mfp')}
TOPIC_LABELS = ('에너지 · 냉난방',)  # a topic, not a product: also legitimate when the customer's own requirement speaks of it


class Vocab(list):
    """[(label, words)] plus ``rx`` — the exact names · model codes of the catalog items this customer did not select."""
    rx = None


def _own_text(ctx: dict) -> str:
    """the words of what this customer selected (linked products · solutions) — the only thing that makes a product word legitimate."""
    lib = load()
    corpus: List[str] = []
    for pid in ctx['products']:
        p = lib['products_all'][pid]
        corpus += [str(p.get(k) or '') for k in ('name', 'model', 'cat', 'sc', 'spec')] + list(map(str, p.get('kw') or []))
    for sid in ctx['solutions']:
        x = lib['solutions'][sid]
        corpus += [str(x.get('name') or ''), str(x.get('desc') or ''), str(x.get('cat') or '')] + list(map(str, x.get('kw') or []))
    return ' '.join(corpus)


def unlinked_vocab(ctx: dict, said: bool = False, topics: bool = True) -> 'Vocab':
    """(label, words) of the product types · brands · solutions this customer did not select, and the exact names of the catalog
    items it did not select (``rx``).

    A product is part of this offer only when the customer selected it (제품 · 솔루션 매칭): what the requirement text merely mentions
    is not — a deck that shows an unselected product is wrong. ``said=True`` (parts that restate the customer's problem in its own
    words) also accepts what the requirement itself names. ``topics=False`` leaves out topic words (energy · comfort), which are
    not products. A linked case does not make its own products part of this offer: case text is not counted, and case slides —
    the case's own facts — are not checked against this list."""
    lib = load()
    own = _own_text(ctx)
    heard = ' '.join([ctx.get('req_text') or '', ctx.get('summary') or '', ctx.get('customer') or '', ctx.get('title') or ''])
    text = own + ' ' + heard if said else own
    out = Vocab()
    for label, words, legit in TYPE_WORDS:
        topic = label in TOPIC_LABELS
        if topic and not topics:
            continue
        if any(w in (own + ' ' + heard if topic else text) for w in legit + words):
            continue
        out.append((label, words))
    for label, words, ids in SOL_WORDS:
        if not (ids & set(ctx['solutions'])) and not any(w in text for w in words):
            out.append((label, words))
    for label, words in BRAND_WORDS:
        if not any(w in text for w in words):
            out.append((label, words))
    # exact names: every catalog product · solution that was not selected (a name the selected items share is not counted)
    names: Set[str] = set()
    picked = set(ctx['products'])
    for pid, p in (lib.get('products_all') or {}).items():
        if pid in picked:
            continue
        name, model = _s(p.get('name'), 80), _s(p.get('model'), 40)
        if len(name) >= 6 and (' ' in name or re.search(r'[A-Za-z]\d|\d[A-Za-z]', name)):
            names.add(name)
        if len(model) >= 5 and re.search(r'\d', model) and re.search(r'[A-Za-z]', model):
            names.add(model)
    for sid, x in lib['solutions'].items():
        if sid not in ctx['solutions'] and len(_s(x.get('name'), 60)) >= 4:
            names.add(_s(x.get('name'), 60))
    names = {n for n in names if n not in text}
    if names:
        out.rx = re.compile('|'.join(re.escape(n) for n in sorted(names, key=len, reverse=True)))
    return out


def unlinked_in(v: str, vocab: Sequence[tuple]) -> List[str]:
    v = v.replace('모니터링', ' ').replace('CCTV', ' ').replace('IPTV', ' ')  # monitoring is not a monitor · CCTV is not a TV
    out = [label for label, words in vocab if any(w in v for w in words)]
    rx = getattr(vocab, 'rx', None)
    m = rx.search(v) if rx is not None else None
    if m:
        out.append(m.group(0))
    return out


def strip_unlinked(v: str, vocab: Sequence[tuple]) -> str:
    """``v`` without what names an unselected product: a list ('A · B · C') keeps its other items, a sentence that names one is dropped."""
    lines = []
    for line in str(v).split('\n'):
        if not unlinked_in(line, vocab):
            lines.append(line)
            continue
        m = re.match(r'^(\s*[·•※\-–]\s*)', line)
        head = m.group(1) if m else ''
        body = line[len(head):]
        for sep in (' · ', ', ', ' / ', ' + '):
            segs = body.split(sep)
            keep = [x for x in segs if x.strip() and not unlinked_in(x, vocab)]
            # only a list of names ('A · B · C') — a sentence that happens to hold the separator would be left as a fragment
            listed = len(segs) >= 2 and all(len(x.split()) <= 3 and len(x) <= 24 for x in segs) and not re.search(r'[.다요에로]$', body.strip())
            if listed and keep and len(keep) < len(segs) and not unlinked_in(sep.join(keep), vocab):
                lines.append(head + sep.join(keep))
                break
    return '\n'.join(lines).strip()


# content-fixed parts and sheets — one list shared with the app: app/web/src/domain/templates/fixed_content.json (the admin 「전체 파트」
# 완전 고정 · 업종별 고정 parts and its locked sheets). User instruction 2026-11-17: what is fixed there is fixed in real proposals too —
# "고정 = AI가 채우지 않는다", people may still edit. Parts by toc key: 제안 개요 (overview — the industry deck's own 개요 page, even though it
# shows the industry's usual products rather than only the selected ones), Why Samsung, 서비스 (the two Samsung Care+ pages, toc 'svc' · type
# 'solution', so a service part never takes the customer's solutions). Sheets: 마무리 and the locked 구독 상품 제안 pages (비교 · 케어 1 · 케어 2 ·
# 구독 조건 · 결제 — figures stay 00 for the author to type).
def _fixed_rules() -> Dict[str, Any]:
    import json
    from .library import ROOT
    try:
        return json.loads((ROOT / 'app/web/src/domain/templates/fixed_content.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):  # the app tree is not there (a bare composer checkout): the parts the composer always had
        return {'parts': {'why': '', 'svc': ''}, 'sheets': {r'^L_VS_WHY_\d$': '', r'^L_VS_END$': ''}}


_FIXED = _fixed_rules()
FIXED_TOCS = tuple(_FIXED['parts'])
FIXED_SHEET = re.compile('|'.join('(?:%s)' % r for r in _FIXED['sheets']))


def fixed_part(p: dict) -> bool:
    """제안 개요 · Why Samsung · 서비스 — content-fixed parts. The part is used exactly as the template has it (only the page numbers ·
    footer · chapter number follow this deck): no model call writes it, no picture is re-chosen and it owns no product · solution · case."""
    return (p.get('type') or '') == 'why' or (p.get('toc') or '') in FIXED_TOCS


def fixed_sheet(f: str) -> bool:
    """a content-fixed sheet wherever it stands (마무리 · the locked 구독 pages · 개요 DSS page · Why · 서비스): used as the template has it."""
    return bool(f) and bool(FIXED_SHEET.search(f))


_ADVERB_RO = re.compile(r'(?:^|\s)(바로|그대로|별로|새로|따로|홀로|서로|스스로|때로|대로|실로|날로|절로|함부로|제대로)$')  # words that end in '로' without being noun + particle


def trim_to(v: str, mx: int) -> str:
    """cut an over-long value at a phrase boundary (never mid-word, no dangling connective)."""
    if len(v) <= mx:
        return v
    cut = v[:mx]
    done = False
    for sep in ('. ', ', ', ' · ', ' — '):
        i = cut.rfind(sep)
        if i >= mx * 0.6:
            cut, done = cut[:i], True
            break
    if not done:
        # where a noun phrase ends before a particle or a joining word ('방학 중 집중 시공|으로 학기 운영 …', 'MagicINFO 콘텐츠| 및 자동화 …'):
        # what stays is a whole phrase — a cut at the last space would leave '… 시공으로 학기' · '… 콘텐츠 및'
        ends = [m.start() for m in re.finditer(r'(?<=[가-힣A-Za-z0-9]{2})(?:으로|로|을|를|에서|에)(?=\s)|\s(?:및|와|과|그리고)(?=\s)', v[:mx + 1])
                if not _ADVERB_RO.search(v[:m.end()])]
        ends = [p_ for p_ in ends if p_ >= mx * 0.45]
        if ends:
            cut, done = v[:ends[-1]], True
    if not done:
        i = cut.rfind(' ')
        if i >= mx * 0.3:
            cut = cut[:i]
    cut = cut.rstrip(' ,·—')
    cut = re.sub(r'\s+(및|와|과|그리고|또는)$', '', cut)  # a joining word left standing alone at the end
    m = re.search(r'(\S*?)(과|와|및|하고|하며|하여|으로|에서|의|을|를)$', cut)
    if m and len(m.group(1)) >= 2:  # a dangling connective goes — only endings that attach to nouns ('바꾸는' · '바로' stay whole words)
        cut = cut[:m.start(2)]
    return cut.rstrip(' ,·—')


def _em(ch: str) -> float:
    """rough advance width of a character in em (Noto Sans KR / Manrope at slide sizes)."""
    if ch == ' ':
        return 0.28
    if ch in '.,·:;!|\'"“”‘’()[]':
        return 0.34
    if ch.isascii():
        return 0.62 if (ch.isupper() or ch.isdigit()) else 0.54
    return 0.96


def box_lines(text: str, w: float, font: float) -> int:
    """lines ``text`` takes in a box ``w`` px wide at ``font`` px (words are kept whole — Korean wraps at spaces here)."""
    per = max(2.0, w / max(1.0, font))
    n = 0
    for line in str(text or '').split('\n'):
        cur, used = 0.0, 1
        for word in re.split(r'( )', line):
            wd = sum(_em(c) for c in word)
            if cur + wd > per and cur > 0 and word != ' ':
                used += 1
                cur = 0.0
            while wd > per:  # a word longer than a line breaks anywhere
                used += 1
                wd -= per
            cur += wd
        n += used
    return n


def box_fits(geo: Optional[dict], v: str, ref: str = '') -> bool:
    """``v`` fits the text box of the layout (its width · height · font) — or takes no more lines than the template's own text did."""
    if not geo or not geo.get('w') or not geo.get('font'):
        return False
    room = max(1, int((float(geo.get('h') or 0) + 2) // (float(geo['font']) * 1.3)))
    if ref:
        room = max(room, box_lines(ref, float(geo['w']), float(geo['font'])))
    return box_lines(v, float(geo['w']) * 0.97, float(geo['font'])) <= room


def trim_to_box(v: str, mx: int, geo: Optional[dict], ref: str = '') -> str:
    """the longest phrase-boundary cut of ``v`` that fits its box (never shorter than the ``mx`` budget cut)."""
    best = trim_to(v, mx)
    if not geo:
        return best
    n = len(v) - 1
    while n > len(best):
        cut = trim_to(v, n)
        if len(cut) > len(best) and box_fits(geo, cut, ref):
            return cut
        n = min(n - 1, len(cut) - 1) if len(cut) < n else n - 1
    return best


def balance_quotes(v: str) -> str:
    """a cut value must not keep one half of a quotation mark pair."""
    for a, b in (('“', '”'), ('‘', '’')):
        if v.count(a) != v.count(b):
            v = v.replace(a, '').replace(b, '')
    if v.count('"') % 2:
        v = v.replace('"', '') if not re.search(r'\d"', v) else v
    return v.strip()


class PartError(RuntimeError):
    pass


# ================================================================================================ input
def _s(x: Any, n: int = 400) -> str:
    return re.sub(r'\s+', ' ', str(x if x is not None else '')).strip()[:n]


def slide_kind(f: str) -> str:
    lib = load()
    L = lib['layouts'].get(f)
    if not L:
        return 'unknown'
    if DIV.match(f):
        return 'divider'
    if f == 'L_VS_TOC' or f.startswith('L_TOC_INDEX'):
        return 'toc'
    if L.get('cover'):
        return 'cover'
    if f.startswith('L_VS_BIRD_'):
        return 'bird'
    if f.startswith('L_VS_MAP_'):
        return 'map'
    if f == 'L_VS_SPACE' or SPACE_P.match(f):
        return 'space'
    if SCN_S.match(f):
        return 'scn'
    if SCN_MAP.match(f):
        return 'scnmap'
    if f.startswith('L_VS_SOL_') or f in (lib.get('sol_layouts') or {}):
        return 'solution'
    if f == 'L_VS_CASE':
        return 'case'
    if f == 'L_VS_DSS':
        return 'dss'
    if STATIC.match(f) or (L.get('modes') or {}).get('lock') == 'fixed':
        return 'static'
    if f.startswith('L_TOC_BOM'):
        return 'bom'
    if f.startswith('L_TOC_TECH'):
        return 'tech'
    if f.startswith('L_TOC_SPEC') or f == 'L_TOC_PSPEC':
        return 'spec'
    if f.startswith('L_TOC_JOURNEY'):
        return 'journey'
    return 'generic'


def clean_parts(raw: Any) -> List[dict]:
    """the request's parts → validated, size-capped parts (raises ValueError with a Korean message)."""
    if not isinstance(raw, list) or not raw or len(raw) > MAX_PARTS:
        raise ValueError(f'parts 는 1~{MAX_PARTS}개 목차 목록이어야 합니다.')
    out, seen = [], set()
    for p in raw:
        if not isinstance(p, dict):
            raise ValueError('parts 항목 형식이 올바르지 않습니다.')
        pid = _s(p.get('id'), 80)
        if not pid or pid in seen:
            raise ValueError('parts 의 id 는 비어 있지 않고 서로 달라야 합니다.')
        seen.add(pid)
        ex = p.get('exemplar') or []
        if not isinstance(ex, list) or len(ex) > MAX_SLIDES:
            raise ValueError(f'exemplar 는 장 {MAX_SLIDES}개 이하의 목록이어야 합니다.')
        slides = []
        for x in ex:
            if not isinstance(x, dict) or not isinstance(x.get('f'), str) or not x['f']:
                raise ValueError('exemplar 항목에는 레이아웃 id(f)가 필요합니다.')
            ov = x.get('ov') if isinstance(x.get('ov'), dict) else {}
            t = x.get('t') if isinstance(x.get('t'), dict) else ov.get('t') if isinstance(ov.get('t'), dict) else {}
            img = x.get('img') if isinstance(x.get('img'), dict) else ov.get('img') if isinstance(ov.get('img'), dict) else {}
            if len(t) > 160 or len(img) > 60:
                raise ValueError('exemplar 장의 칸 수가 너무 많습니다.')
            tt = {}
            for k, v in t.items():
                if isinstance(v, dict):
                    tt[str(k)] = {'html': str(v.get('html') or '')[:2000]}
                elif v is not None:
                    tt[str(k)] = str(v)[:1200]
            ii = {}
            for k, v in img.items():
                if isinstance(v, str) and v:
                    ii[str(k)] = {'src': v[:600], 'keep': True}
                elif isinstance(v, dict) and (v.get('src') or v.get('hidden')):
                    ii[str(k)] = {kk: vv for kk, vv in v.items() if isinstance(vv, (str, int, float, bool, list)) and len(str(vv)) <= 600}
            extra = {k: v for k, v in ov.items() if k not in ('t', 'img')}
            if x.get('bg') is not None:
                extra['bg'] = x['bg']
            slides.append({'f': x['f'][:80], 'role': _s(x.get('role'), 160), 't': tt, 'img': ii, 'extra': extra})
        items = [_s(i, 120) for i in (p.get('items') or []) if _s(i)][:8] if isinstance(p.get('items'), list) else []
        out.append({'id': pid, 'type': _s(p.get('type'), 40) or 'free', 'name': _s(p.get('name'), 60), 'toc': _s(p.get('toc'), 40) or None,
                    'goal': _s(p.get('goal'), 240), 'items': items, 'src': _s(p.get('src'), 80) or None, 'deck': bool(p.get('deck')), 'exemplar': slides})
    return out


def clean_space_plan(raw: Any) -> Optional[dict]:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError('space_plan 형식이 올바르지 않습니다.')
    spaces = raw.get('spaces') or []
    if not isinstance(spaces, list) or len(spaces) > 24:
        raise ValueError('space_plan.spaces 는 공간 목록이어야 합니다.')
    out = []
    for i, sp in enumerate(spaces):
        if not isinstance(sp, dict) or not _s(sp.get('name')):
            continue
        prods = [str(x)[:80] for x in (sp.get('products') or []) if isinstance(x, (str, int))][:20] if isinstance(sp.get('products'), list) else []
        # uses: 그 공간에서 쓰는 솔루션 · 서비스(앱이 정함 — 고객/공간 시나리오 장): [{ id, name, kind: '솔루션' | '서비스' }]
        uses = [{'id': _s(u.get('id'), 80), 'name': _s(u.get('name'), 40), 'kind': '서비스' if u.get('kind') == '서비스' else '솔루션'}
                for u in (sp.get('uses') or [])[:16] if isinstance(u, dict) and _s(u.get('id'), 80) and _s(u.get('name'), 40)] if isinstance(sp.get('uses'), list) else None
        out.append({'id': _s(sp.get('id'), 80) or f'sp{i + 1}', 'name': _s(sp.get('name'), 40), 'kind': _s(sp.get('kind'), 30), 'note': _s(sp.get('note'), 200),
                    'products': prods, **({'uses': uses} if uses is not None else {})})
    v = raw.get('vertical') if isinstance(raw.get('vertical'), dict) else {}
    b = raw.get('birdseye') if isinstance(raw.get('birdseye'), dict) else {}
    image = b.get('image') if isinstance(b.get('image'), str) and 0 < len(b['image']) <= 2000 and b.get('status', 'done') == 'done' else None
    return {'vertical': {'id': _s(v.get('id'), 60), 'name': _s(v.get('name'), 80)}, 'spaces': out[:MAX_SPACES], 'birdseye': image}


def summary_points(rc: Any) -> List[str]:
    """requirement points from the saved AI summary (requirements · goals — facts first)."""
    sec = (rc or {}).get('sections') if isinstance(rc, dict) else None
    if not isinstance(sec, dict):
        return []
    out: List[str] = []
    for key in ('requirements', 'goals', 'constraints', 'decision_criteria'):
        rows = sec.get(key) or []
        rows = sorted((r for r in rows if isinstance(r, dict) and _s(r.get('text')) and r.get('kind') != 'question'), key=lambda r: r.get('kind') != 'fact')
        # a decision criterion ('총지배인은 … 여부를 평가 기준으로 삼는다') usually restates a goal from the evaluator's side: it becomes a
        # point of its own only when no requirement · goal · constraint already says it
        limit = 0.45 if key == 'decision_criteria' else 0.55
        for r in rows:
            t = _s(r['text'], 90)
            if t and all(overlap(t, o) < limit and not near_same(t, o) for o in out):
                out.append(t)
            if len(out) >= 8:
                return out
    return out


def summary_text(rc: Any, limit: int = 1800) -> str:
    sec = (rc or {}).get('sections') if isinstance(rc, dict) else None
    if not isinstance(sec, dict):
        return ''
    rows = []
    ov = sec.get('overview')
    if isinstance(ov, dict) and _s(ov.get('text')):
        rows.append('개요: ' + _s(ov['text'], 400))
    label = {'background': '배경', 'goals': '목표', 'requirements': '요구', 'constraints': '제약', 'stakeholders': '이해관계자', 'decision_criteria': '결정 기준',
             'risks': '위험', 'strategy': '제안 전략(해석)'}
    for key, lb in label.items():
        items = [_s(r.get('text'), 160) for r in (sec.get(key) or []) if isinstance(r, dict) and _s(r.get('text'))][:5]
        if items:
            rows.append(f'{lb}: ' + ' / '.join(items))
    return '\n'.join(rows)[:limit]


DEFAULT_TITLES = ('새 제안서', '제안서', 'New proposal')


def deck_footer(customer: str, title: str, deck_label: str) -> str:
    """'<고객사> · <덱 이름>' — the customer once: a title that already carries the customer is used as it is, and the app's default
    title ('새 제안서') is never printed (the template's deck name stands in)."""
    customer, title, deck_label = (customer or '').strip(), (title or '').strip(), (deck_label or '').strip()
    if not title or title in DEFAULT_TITLES or title == customer:
        title = deck_label
    if customer and title and (title.startswith(customer) or customer in title):
        return title
    return ' · '.join(x for x in (customer, title) if x)


def _short(name: str) -> str:
    return re.sub(r'\s*\([^)]*\)\s*$', '', str(name or '')).strip()


def _nfc_cases(lib: dict) -> None:
    """case names stored as decomposed Hangul (two records are) count three code points a syllable: cut to a row's length they
    end in half a syllable ('성균관대학교 글로벌ᄉ'). Composed once, in place."""
    if lib.get('_nfc_cases'):
        return
    import unicodedata
    for c in (lib.get('cases') or {}).values():
        for k in ('cust', 'title', 'sub'):
            if isinstance(c.get(k), str) and not unicodedata.is_normalized('NFC', c[k]):
                c[k] = unicodedata.normalize('NFC', c[k])
    lib['_nfc_cases'] = True


def build_context(pr: dict, body: dict) -> dict:
    """everything the stages share — facts, ids, the names of the template's sample customer that must not survive."""
    lib = load()
    _nfc_cases(lib)
    PA, S, C = lib.get('products_all') or {}, lib['solutions'], lib['cases']
    inp = ctxm.from_app_proposal(pr)
    raw_ctx = pr.get('ctx') if isinstance(pr.get('ctx'), dict) else pr
    products = list(dict.fromkeys(str(x) for x in (raw_ctx.get('products') or []) if str(x) in PA))[:40]
    solutions = list(dict.fromkeys(str(x) for x in (raw_ctx.get('solutions') or []) if str(x) in S))[:20]
    cases = list(dict.fromkeys(str(x) for x in (raw_ctx.get('cases') or []) if str(x) in C))[:12]
    tpl = body.get('template') if isinstance(body.get('template'), dict) else {}
    sp = clean_space_plan(body.get('space_plan'))
    vid = _s(tpl.get('vertical'), 60) or ((sp or {}).get('vertical') or {}).get('id') or ''
    V = (lib.get('verticals') or {}).get(vid) or {}
    ind = inp.get('ind') or V.get('ind') or None
    customer = inp.get('customer') or ''
    title = inp.get('title') or ''
    parts = clean_parts(body.get('parts'))
    # the template's sample customer and footer — they must not reach this customer's deck
    foot = Counter()
    for p in parts:
        for x in p['exemplar']:
            for k, v in x['t'].items():
                pv = plain(v)
                if ' · ' in pv and 6 <= len(pv) <= 60 and not CONF.match(pv) and not EYEBROW.match(pv) and k.isdigit() and int(k) >= 2:
                    foot[pv] += 1
    n_slides = sum(len(p['exemplar']) for p in parts)
    footer_old = next((v for v, c in foot.most_common(3) if c >= max(2, n_slides // 3)), '')
    tpl_cust = V.get('cust') or (footer_old.split(' · ')[0] if footer_old else '')
    deck_label = footer_old.split(' · ', 1)[1] if ' · ' in footer_old else _s(tpl.get('name'), 40)
    footer_new = deck_footer(customer, title, deck_label) or footer_old
    spaces = []
    if sp:
        for x in sp['spaces']:
            spaces.append({**x, 'products': [p for p in x['products'] if p in products]})
    options = [{'id': x['id'], 'name': x['name']} for x in V.get('spaces') or []]
    if not options:  # no vertical — the template's own space slides name the spaces
        seen = []
        for p in parts:
            for x in p['exemplar']:
                if x['f'] == 'L_VS_SPACE' and plain(x['t'].get('1')) and plain(x['t'].get('1')) not in seen:
                    seen.append(plain(x['t'].get('1')))
        options = [{'id': f'tsp{i + 1}', 'name': n} for i, n in enumerate(seen)]
    board = [b for b in (pr.get('parts') or []) if isinstance(b, dict)]
    req_ids = {p['id'] for p in parts}
    fixed = []
    for b in board:
        if str(b.get('id') or '') in req_ids:
            continue
        heads = []
        for x in (b.get('layouts') or [])[:MAX_SLIDES]:
            t = ((x.get('ov') or {}).get('t') or {}) if isinstance(x, dict) else {}
            vals = [plain(v) for _, v in sorted(t.items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 99)]
            heads += [v for v in vals if 8 <= len(v) <= 80 and not CONF.match(v) and v != footer_new][:2]
        fixed.append({'id': str(b.get('id') or ''), 'name': _s(b.get('name'), 60), 'type': _s(b.get('type'), 40), 'deck': bool(b.get('deck')),
                      'n': len(b.get('layouts') or []), 'f': [x.get('f') for x in (b.get('layouts') or []) if isinstance(x, dict) and x.get('f')],
                      'heads': heads[:10], 'text': ' '.join(plain(v) for x in (b.get('layouts') or []) if isinstance(x, dict) for v in ((x.get('ov') or {}).get('t') or {}).values())[:20000]})
    order_ids = [str(b.get('id') or '') for b in board] if req_ids <= {str(b.get('id') or '') for b in board} else [p['id'] for p in parts]
    short = {pid: _short(PA[pid].get('name')) for pid in products}
    short.update({sid: _short(S[sid].get('name')) for sid in solutions})
    ctx = {
        'inp': inp, 'customer': customer, 'title': title, 'ind': ind, 'vertical': vid or None, 'vertical_name': _s(tpl.get('vertical_name'), 80) or V.get('name') or '',
        'who': ' '.join([customer, title]), 'products': products, 'solutions': solutions, 'cases': cases, 'short': short,
        'template': {'id': _s(tpl.get('id'), 40), 'name': _s(tpl.get('name'), 60), 'desc': _s(tpl.get('desc'), 300)},
        'parts': parts, 'fixed': fixed, 'order_ids': order_ids, 'spaces_given': bool(sp and spaces), 'spaces': spaces, 'space_options': options,
        'space_by_id': {x['id']: x for x in spaces}, 'birdseye': (sp or {}).get('birdseye'),
        'req_text': ctxm.requirement_text(inp, 3500), 'summary': summary_text(body.get('requirement_context')),
        'points_given': summary_points(body.get('requirement_context')),
        'tpl_cust': tpl_cust if tpl_cust and tpl_cust != customer else '', 'footer_old': footer_old, 'footer_new': footer_new, 'deck_label': deck_label,
        'date': date.today().strftime('%Y. %m'), 'used_layouts': [str(f) for f in (body.get('used_layouts') or []) if isinstance(f, str)][:400],
        'used_pictures': [str(x)[:600] for x in (body.get('used_pictures') or []) if isinstance(x, str) and x and not x.startswith('data:')][:800],
    }
    ctx['market_alts'] = mkt.clean_market(body.get('market'))  # 업종 트렌드 장 견본(종류별) — 근거의 형태에 맞는 종류로 바꿀 때 쓴다
    ctx['allowed'] = allowed_numbers(ctx)
    ctx['facts'] = number_facts(ctx)                                   # the figures the customer stated (number cells are answered from here)
    ctx['unlinked'] = unlinked_vocab(ctx)
    ctx['unlinked_hard'] = unlinked_vocab(ctx, topics=False)            # the final guard: products · brands · solutions only
    ctx['unlinked_said'] = unlinked_vocab(ctx, said=True)               # parts that restate the customer's problem
    ctx['unlinked_said_hard'] = unlinked_vocab(ctx, said=True, topics=False)
    ctx['banned'] = [b for b in ctxm.forbidden_names({**inp, 'cases': cases}) if b != ctx['tpl_cust']]
    for p in parts:
        kinds = [slide_kind(x['f']) for x in p['exemplar']]
        p['kinds'] = kinds
        p['cap'] = {
            'spaces': any(k in ('space', 'bird', 'map', 'journey', 'bom', 'scn', 'scnmap') for k in kinds) or p['toc'] in ('space', 'value', 'bom'),
            'products': any(k in ('space', 'bird', 'map', 'bom', 'spec', 'dss', 'scn') for k in kinds) or p['type'] in ('products', 'spec', 'bom'),
            'solutions': any(k in ('solution', 'tech', 'journey', 'scn', 'scnmap') for k in kinds) or p['type'] == 'solution',
            'cases': any(k == 'case' for k in kinds) or p['type'] == 'case',
            'points': (not p['deck']) and _writable(p) >= 6,
        }
        # 당사의 이해(고객 · 과제 · 시장) states the requirements as problems, 제안 요약 recaps them — neither *answers* one, so neither owns one
        p['mode'] = ('problem' if (p['toc'] == 'ua' or p['type'] in ('customer', 'challenge', 'market')) else
                     'summary' if (p['toc'] == 'summary' or any(x['f'] == 'L_TOC_SUMMARY' for x in p['exemplar'])) else 'answer')
        p['cap']['raises'] = p['mode'] != 'answer' and p['cap']['points']
        if p['mode'] != 'answer':
            p['cap']['points'] = False
        if fixed_part(p):  # Why Samsung is the template's own pages: the plan gives it nothing to write
            p['cap'] = {k: False for k in p['cap']}
    return ctx


def _writable(p: dict) -> int:
    """model-written text slots of a part outside chapter pages, fixed pages and item pages — room to answer a requirement."""
    L = load()['layouts']
    n = 0
    for x in p['exemplar']:
        if slide_kind(x['f']) not in ('generic', 'journey', 'tech', 'spec', 'bom'):
            continue
        modes = (L[x['f']].get('modes') or {}).get('t') or {}
        n += sum(1 for t in L[x['f']]['texts'] if not t.get('img') and (modes.get(str(t['i'])) or 'ai') == 'ai' and len(plain(x['t'].get(str(t['i']))) or t['text']) >= 8)
    return n


def product_fact(pid: str, full: bool = False) -> str:
    p = (load().get('products_all') or {}).get(pid) or {}
    s = f"{p.get('name') or pid} ({p.get('model') or ''}) · {p.get('cat') or ''} · {p.get('spec') or ''}"
    if full:
        extra = [x for x in (p.get('specs') or [])[:8]]
        kw = [str(k) for k in (p.get('kw') or [])[:5]]
        if kw:
            s += ' · 특징어: ' + ', '.join(kw)
        if extra:
            s += ' · 사양: ' + '; '.join(extra)
        if p.get('spaces'):
            s += ' · 쓰이는 곳: ' + ', '.join(map(str, p['spaces'][:4]))
    return s


def solution_fact(sid: str) -> str:
    s = load()['solutions'].get(sid) or {}
    return f"{s.get('name') or sid} — {s.get('cat') or ''} · {s.get('desc') or ''}"


def solution_knowledge(sid: str, n: int = 10) -> str:
    """what a selected solution does, as the content DB states it: its line, its summary and the features of its catalog (a few
    of every feature group). The writer and the claim check both read this — without it the model only knows the solution's name
    and gives it whatever the template's solution did."""
    lib = load()
    out = solution_fact(sid)
    reg = _feature_registry()
    groups: List[List[str]] = []
    for key, q in (lib.get('sol_keys') or {}).items():
        c = reg['cat'].get(key) if q == sid else None
        if not c:
            continue
        if c.get('summary') and str(c['summary']) not in out:
            out += f" · {c['summary']}"
        for g in c.get('groups') or []:
            groups.append([f"{f.get('name')}({f.get('desc')})" if f.get('desc') else str(f.get('name')) for f in g.get('features') or [] if f.get('name')])
    feats: List[str] = []
    for blk in ((lib.get('sol_tech') or {}).get(sid) or {}).values():
        for kw in blk.get('kw') or []:
            if len(kw) >= 3 and f'{kw[1]}({kw[2]})' not in feats:
                feats.append(f'{kw[1]}({kw[2]})')
    k = 0
    while len(feats) < n and any(len(g) > k for g in groups):  # one feature of each group in turn
        feats += [g[k] for g in groups if len(g) > k and g[k] not in feats]
        k += 1
    if feats:
        out += ' · 기능: ' + '; '.join(feats[:n])
    return out


def item_knowledge(it: tuple) -> str:
    return product_fact(it[1], full=True) if it[0] == 'product' else solution_knowledge(it[1])


def case_fact(cid: str, full: bool = False) -> str:
    c = load()['cases'].get(str(cid)) or {}
    s = f"{c.get('cust') or cid} — {c.get('sub') or c.get('title') or ''}"
    if c.get('type'):
        s += f" · {c['type']}"
    if full:
        for key, lb in (('needs', '고객 과제'), ('offer', '도입'), ('proof', '성과')):
            if c.get(key):
                s += f" · {lb}: " + '; '.join(map(str, c[key][:3]))
    elif c.get('proof'):
        s += ' · 성과: ' + '; '.join(map(str, c['proof'][:2]))
    return s


def allowed_numbers(ctx: dict) -> Set[str]:
    """numbers the customer gave or the catalog states for the linked items — anything else on a written slot is invented."""
    lib = load()
    corpus = [ctxm.requirement_text(ctx['inp'], 100000), ctx.get('summary') or '', ctx.get('date') or '']
    for pid in ctx['products']:
        p = lib['products_all'][pid]
        corpus += [str(p.get(k) or '') for k in ('name', 'model', 'spec', 'opt', 'cat')] + list(map(str, p.get('kw') or [])) + list(p.get('specs') or [])
    for cid in ctx['cases']:
        c = lib['cases'][cid]
        corpus += [str(c.get(k) or '') for k in ('cust', 'title', 'sub', 'scale', 'type')] + list(map(str, c.get('proof') or [])) + list(map(str, c.get('offer') or []))
    for sid in ctx['solutions']:
        s = lib['solutions'][sid]
        corpus += [str(s.get('name') or ''), str(s.get('desc') or '')]
    out: Set[str] = set()
    for t in corpus:
        for m in ctxm.NUM.findall(str(t)):
            out.add(m.replace(',', '').rstrip('.'))
    return out


_FACT_UNITS = ('개월', '개소', '개', '곳', '실', '명', '주', '년', '일', '시간', '분', '%', '만 원', '만원', '억 원', '억원', '원', '대', '층', '평', '㎡', '회', '건',
               '세대', '병상', '석', '호점', '동', 'kWh', 'kW')
_FACT = re.compile(r'(?<![A-Za-z\d.,\-])(\d[\d,]*(?:\.\d+)?)\s?(' + '|'.join(re.escape(u) for u in _FACT_UNITS) + r')'
                   r'(?=$|[^가-힣A-Za-z]|의|을|를|이|가|은|는|에|로|과|와|간|씩|만|도|까지|부터|으로|마다|당|짜리|규모|내외|정도)')
_FACT_STOP = {'이상', '이하', '미만', '내외', '정도', '규모', '기준', '대상', '전체', '경우', '통해', '위해', '합니다', '있습니다', '됩니다'}
_PLACE_UNITS = {'개', '곳', '개소'}
PH_CELL = re.compile(r'\[0+\]\s?[^\s\d\[\]]{0,4}')   # a cell that is a number and nothing else: '[00]' · '[0]곳' · '[00]%'


def _fact_tokens(text: str) -> Set[str]:
    """content words of a label / a phrase around a number (particles off) — what a figure row and a stated number share."""
    out: Set[str] = set()
    for w in re.findall(r'[가-힣A-Za-z]{2,}', text or ''):
        w = re.sub(r'(에서|으로|까지|부터|마다|의|을|를|이|가|은|는|에|로|과|와|도|만)$', '', w) if len(w) > 2 else w
        if len(w) >= 2 and w not in _FACT_STOP:
            out.add(w)
    return out


def number_facts(ctx: dict) -> List[dict]:
    """the figures this customer stated, each with its unit and the words around it — [{n, raw, unit, text, tokens}].

    A figure row of a slide ('운영 매장 [00] 개') is answered from here, in the customer's own number ('140개 매장'), instead of
    staying a placeholder next to a requirement that states it. Catalog figures (sizes · brightness) are already in each
    product's fact line; this list is only what the customer said."""
    seen: Dict[tuple, dict] = {}
    for src in (ctxm.requirement_text(ctx['inp'], 100000), ctx.get('summary') or ''):
        for line in re.split(r'[\n。]|(?<=[.!?])\s', src or ''):
            for m in _FACT.finditer(line):
                n, unit = m.group(1).replace(',', '').rstrip('.'), m.group(2).replace(' ', '')
                if unit == '년' and re.fullmatch(r'(19|20)\d\d', n):
                    continue  # a calendar year, not a quantity
                if unit == '일' and re.search(r'\d\s?월\s?$', line[:m.start()]):
                    continue  # a date ('3월 2일')
                if unit == '%' and line[:m.start()].endswith('(') and line[m.end():m.end() + 1] == ')':
                    continue  # a weight in brackets after a name ('총지배인(40%)') — how much a person counts, not a figure of the business
                before, after = line[:m.start()].split(), line[m.end():].split()
                text = ' '.join(before[-4:] + [m.group(0).strip()] + after[:4]) if (before and not line[m.start() - 1].isspace()) is False else None
                if text is None:  # the number is glued to the word before it ('영업12년'): keep that word whole
                    text = ' '.join(before[-5:-1] + [before[-1] + m.group(0).strip()] + after[:4])
                if after and not line[m.end():m.end() + 1].isspace() and line[m.end():m.end() + 1]:
                    text = text.replace(m.group(0).strip() + ' ' + after[0], m.group(0).strip() + after[0], 1)  # '14곳과' stays one word
                text = re.sub(r'^.*않음\)\s*:?\s*', '', text).strip(' ·,:;()[]“”"\'')  # ('… 화면에 그대로 쓰지 않음):' is the form's note label)
                key = (n, unit)
                if key in seen:
                    seen[key]['tokens'] |= _fact_tokens(text)
                    continue
                seen[key] = {'n': n, 'raw': m.group(1), 'unit': unit, 'text': text, 'tokens': _fact_tokens(text)}
    return list(seen.values())[:18]


_PROFILE_UNITS = {'개', '곳', '개소', '실', '명', '대', '층', '평', '㎡', '세대', '병상', '석', '년', '호점', '동'}
_NOT_PROFILE = re.compile(r'솔루션|제품|공간마다|시범|파일럿|실측|착수|승인|워크숍')
_UNIT_ICON = [({'개', '곳', '개소', '호점', '동'}, 'ui-store'), ({'실', '세대', '병상', '석', '층', '평', '㎡'}, 'ui-home'), ({'명'}, 'ui-users'), ({'년'}, 'ui-calendar'), ({'대'}, 'ui-device')]


def profile_facts(ctx: dict) -> List[dict]:
    """the customer-stated figures that say how large the customer is (rooms · stores · people · years) — not the scope of this
    proposal ('시범 3곳') nor counts of what is offered ('6개 솔루션')."""
    return [f for f in ctx.get('facts') or [] if f['unit'] in _PROFILE_UNITS and not _NOT_PROFILE.search(f['text'])][:4]


def known_number(ctx: dict, label: str, unit: str) -> Optional[str]:
    """the customer-stated figure that answers a figure row — only when exactly one fits: the same kind of unit and a shared
    word between the row's label and the words the customer wrote around the number ('운영 매장' · '개' ← '140개 매장 · 무인 운영')."""
    unit = (unit or '').replace(' ', '').strip()
    lab = _fact_tokens(label)
    if not unit or not lab:
        return None
    hits = []
    for f in ctx.get('facts') or []:
        if not (f['unit'] == unit or (unit in _PLACE_UNITS and f['unit'] in _PLACE_UNITS)):
            continue
        ov = len(lab & f['tokens'])
        if ov:
            hits.append((ov, f))
    hits.sort(key=lambda z: -z[0])
    if hits and (len(hits) == 1 or hits[0][0] > hits[1][0]):
        return hits[0][1]['raw']
    return None


def number_cell(ctx: dict, ref: str, v: str) -> str:
    """a cell that holds a number and nothing else (``PH_CELL`` reference) holds a number or nothing: a sentence the model put
    there, a guess in brackets ('[20]' — its way of saying 'about this many') and the template's own placeholder all become
    empty (no placeholder is left on a proposal); a bare number gets the unit its reference carried ('[000]곳' ← '140')."""
    v = (v or '').strip()
    if not v or re.fullmatch(r'\[[\d,. ]*\].*', v) or not re.search(r'\d', v):
        return ''
    unit = re.fullmatch(r'\[0+\]\s?(\D{1,4})', ref)
    if unit and re.fullmatch(r'[\d,.]+', v):
        return v + unit.group(1)
    return v


_ZERO_UNIT = re.compile(r'(?<![\d.,\[])0(?=\s?(회|곳|개|명|주|일|건|대|%|시간|분|원|개월|배)(?![가-힣]))')


def keep_placeholders(ref: str, v: str) -> str:
    """a placeholder the template left for a figure nobody stated ('현장 방문 [0]회 ↓') stays a placeholder — written back as a bare
    zero ('현장 점검 0회 ↓') it reads as a promise of zero visits."""
    if not re.search(r'\[0+\]', ref or '') or re.search(r'\[0+\]', v or ''):
        return v
    return _ZERO_UNIT.sub('[0]', v or '')


# ================================================================================================ 1. orchestrator
def _alias(prefix: str, ids: Sequence[str]) -> Dict[str, str]:
    return {f'{prefix}{i + 1}': x for i, x in enumerate(ids)}


def orchestrate(ctx: dict, llm) -> dict:
    lib = load()
    parts = ctx['parts']
    PA, PP, SS, CC = _alias('P', [p['id'] for p in parts]), _alias('d', ctx['products']), _alias('s', ctx['solutions']), _alias('c', ctx['cases'])
    need_place = not ctx['spaces_given'] and any(p['cap']['spaces'] for p in parts) and bool(ctx['space_options']) and bool(ctx['products'])
    space_src = ctx['spaces'] if ctx['spaces_given'] else ctx['space_options']
    XX = _alias('x', [x['id'] for x in space_src])
    given = ctx['points_given']
    RR = [f'R{i + 1}' for i in range(len(given) if given else 8)]
    cap_label = lambda c: ' · '.join(lb for k, lb in (('products', '제품'), ('solutions', '솔루션'), ('cases', '사례'), ('spaces', '공간'), ('points', '요구 답변'),
                                                      ('raises', '요구를 과제로 짚기만 함(주인이 될 수 없음)')) if c.get(k)) or '고정 내용(요구·제품을 맡지 않음)'
    part_rows = []
    for a, pid in PA.items():
        p = next(x for x in parts if x['id'] == pid)
        roles = [x['role'] for x in p['exemplar'] if x['role']][:6]
        part_rows.append(f"{a} [{p['type']}] {p['name'] or '(표지 · 목차)'} — 목표: {p['goal'] or '-'} — 템플릿 장: {' / '.join(r[:28] for r in roles) or '-'} — 담을 수 있는 것: {cap_label(p['cap'])}")
    fixed_rows = [f"- {f['name'] or '(표지)'}: {' / '.join(f['heads'][:5]) or '(내용 없음)'}" for f in ctx['fixed'] if not f['deck'] and f['n']]
    arr = lambda en: {'type': 'ARRAY', 'items': {'type': 'STRING', 'enum': list(en)}} if en else {'type': 'ARRAY', 'items': {'type': 'STRING'}}
    part_schema = {'type': 'OBJECT', 'properties': {
        'id': {'type': 'STRING', 'enum': list(PA)}, 'message': {'type': 'STRING'}, 'points': arr(RR), 'refs': arr(RR), 'products': arr(PP),
        'solutions': arr(SS), 'cases': arr(CC), 'spaces': arr(XX), 'n_slides': {'type': 'INTEGER'}},
        'required': ['id', 'message', 'points', 'refs', 'products', 'solutions', 'cases', 'spaces', 'n_slides']}
    props: Dict[str, Any] = {'thesis': {'type': 'STRING'}, 'storyline': {'type': 'STRING'}}
    req = ['thesis', 'storyline']
    pt_props = {'id': {'type': 'STRING', 'enum': RR}, 'products': arr(PP), 'solutions': arr(SS)}
    if not given:
        pt_props['text'] = {'type': 'STRING'}
    props['points'] = {'type': 'ARRAY', 'minItems': min(3, len(RR)), 'maxItems': 8, 'items': {'type': 'OBJECT', 'properties': pt_props, 'required': list(pt_props)}}
    req.append('points')
    props['parts'] = {'type': 'ARRAY', 'items': part_schema}
    req.append('parts')
    if need_place:
        props['placement'] = {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'space': {'type': 'STRING', 'enum': list(XX) + ['x0']}, 'name': {'type': 'STRING'},
                                                                                          'products': arr(PP)}, 'required': ['space', 'products']}}
        req.append('placement')
    schema = {'type': 'OBJECT', 'properties': props, 'required': req}
    prod_rows = '\n'.join(f'  {a}: {product_fact(x)}' for a, x in PP.items()) or '  (없음)'
    sol_rows = '\n'.join(f'  {a}: {solution_fact(x)}' for a, x in SS.items()) or '  (없음)'
    case_rows = '\n'.join(f'  {a}: {case_fact(x)}' for a, x in CC.items()) or '  (없음)'
    if ctx['spaces_given']:
        inv = {v: k for k, v in PP.items()}
        space_rows = '\n'.join(f"  {a}: {x['name']} — 제품 {', '.join(inv[p] for p in x['products']) or '(없음)'}" for a, x in zip(XX, space_src))
        space_head = '공간 구성 (사람이 정한 것 — 그대로 따릅니다)'
    else:
        space_rows = '\n'.join(f"  {a}: {x['name']}" for a, x in zip(XX, space_src)) or '  (없음)'
        space_head = '이 업종의 공간 후보 (공간 구성이 아직 없음)'
    point_block = ('요구 포인트 (정해져 있음 — 그대로 씁니다)\n' + '\n'.join(f'  R{i + 1}: {t}' for i, t in enumerate(given))) if given else ''
    rules_points = ('\n2. points: 위 요구 포인트(R1 …)마다, 그 요구에 답하는 연결 제품(products) · 솔루션(solutions)을 고릅니다(없으면 빈 목록).' if given else
                    '\n2. points: 고객 요구에서 이 제안서가 답해야 할 요구 포인트를 4~8개 뽑습니다(R1, R2 … 순서, 각 45자 이내, 서로 겹치지 않게, 한국어로). 자료에 없는 요구는 만들지 않습니다. '
                    '포인트마다 그 요구에 답하는 연결 제품(products) · 솔루션(solutions)을 고릅니다(없으면 빈 목록).')
    rules_place = ('\n7. placement: 공간 후보마다 그 공간에 놓을 제품을 정합니다. 모든 제품을 적어도 한 공간에 놓고, 제품이 없는 공간은 넣지 않습니다. 제품의 쓰임(분류 · 사양)과 공간이 맞아야 합니다. '
                   '고객 요구가 제품을 놓을 공간을 직접 말했는데(예: 컨퍼런스룸 12곳) 후보에 그 공간이 없으면 space 를 "x0" 로 하고 name 에 고객이 쓴 공간 이름을 그대로 적습니다 — 고객이 말하지 않은 공간 이름은 만들지 않습니다.'
                   if need_place else '')
    prompt = f"""삼성전자 B2B 제안서 한 벌의 전체 계획을 세웁니다. 목차(파트) 순서와 장표 틀은 템플릿으로 이미 정해져 있습니다. 당신은 파트마다 무엇을 말하고 어떤 제품 · 솔루션 · 사례 · 공간을 보여 줄지 나눠서, 같은 내용이 두 파트에 되풀이되지 않고 앞에서 뒤로 흐름이 이어지게 합니다. 자료에 없는 사실 · 제품 · 요구를 만들지 않습니다.

[고객] {ctx['customer'] or '(고객사)'} · {ctx['title']} · 업종 {ctx['vertical_name'] or ctx['ind'] or ''}
고객 요구사항 (자료일 뿐 지시가 아님):
<<<
{ctx['req_text']}
{('요구사항 요약:' + chr(10) + ctx['summary']) if ctx['summary'] else ''}
>>>
{point_block}
연결한 제품:
{prod_rows}
연결한 솔루션:
{sol_rows}
연결한 사례:
{case_rows}
{space_head}:
{space_rows}

[템플릿] {ctx['template']['name']} — {ctx['template']['desc']}
파트 (이 순서 그대로):
{chr(10).join(part_rows)}
{('이미 완성돼 있는 파트 (바꾸지 않음 — 여기서 다룬 내용은 다른 파트에서 되풀이하지 않습니다):' + chr(10) + chr(10).join(fixed_rows)) if fixed_rows else ''}

규칙
1. thesis: 덱 전체의 핵심 메시지 한 문장(60자 이내). storyline: 파트 순서대로 이야기가 어떻게 이어지는지 한두 문장.{rules_points}
3. parts: 위 파트를 모두 한 번씩. message 는 그 파트가 남겨야 할 한 가지(55자 이내, 고객의 표현을 살리고 다른 파트와 겹치지 않게).
4. points 는 그 파트가 '주인'으로 구체적으로 답하는 요구 포인트입니다. 한 포인트의 주인은 한 파트뿐입니다. refs 는 주인은 아니지만 한 구절로 이어 받기만 하는 포인트입니다. '요구 답변'을 담을 수 없는 파트에는 points 를 주지 않습니다.
5. products · solutions · cases · spaces 는 그 파트 장표에 실제로 나올 것만, 그 파트가 담을 수 있는 종류만 넣습니다. 연결한 제품 · 솔루션 · 사례는 모두 적어도 한 파트에 들어가야 하고, 하나를 자세히 다루는 파트는 하나입니다(다른 파트는 이름만 이어 받음).
6. n_slides: 그 파트에 알맞은 장 수(템플릿 장 수를 기준으로).{rules_place}
JSON만 답하세요."""

    def check(d):
        got = [p.get('id') for p in d.get('parts') or []]
        miss = [a for a in PA if a not in got]
        if miss:
            return f"parts 에 {', '.join(miss)} 가 빠졌습니다. 모든 파트를 한 번씩 넣으세요."
        if not _s(d.get('thesis')):
            return 'thesis 가 비었습니다.'
        for p in d['parts']:
            if p.get('id') in PA and not _s(p.get('message')):
                return f"{p['id']} 의 message 가 비었습니다."
            if len(_s(p.get('message'))) > 110:
                return f"{p['id']} 의 message 가 깁니다(55자 이내)."
        if not given and len([x for x in d.get('points') or [] if isinstance(x, dict) and _s(x.get('text'))]) < 3:
            return 'points 를 3개 이상 뽑으세요.'
        blob = ' '.join([_s(d.get('thesis')), _s(d.get('storyline'))] + [_s(p.get('message')) for p in d['parts'] if isinstance(p, dict)]
                        + [_s(x.get('text')) for x in d.get('points') or [] if isinstance(x, dict)])
        if HAN.search(blob):
            return f"한자 · 중국어 표현({' '.join(HAN.findall(blob)[:4])})이 섞였습니다. 모두 한국어(한글)로 씁니다."
        return True
    def usable(d) -> bool:  # structurally complete — what is left (length · stray characters) the code repairs itself
        return (isinstance(d, dict) and all(a in [p.get('id') for p in d.get('parts') or [] if isinstance(p, dict)] for a in PA)
                and (bool(given) or len([x for x in d.get('points') or [] if isinstance(x, dict) and _s(x.get('text'))]) >= 2))
    d = None
    for attempt in range(2):
        try:
            d = llm.json(stage='auto_plan', prompt=prompt, schema=schema, validate=check, temperature=0.2 + 0.2 * attempt, max_tokens=6000,
                         seed=attempt or None)
            break
        except Exception as exc:  # noqa: BLE001
            if getattr(exc, 'code', '') != 'invalid_output':
                raise
            last = getattr(exc, 'last', None)
            if usable(last):
                d = last
                break
            if attempt:
                raise
    return enforce_plan(ctx, d, {'P': PA, 'd': PP, 's': SS, 'c': CC, 'x': XX}, given)


def enforce_plan(ctx: dict, d: dict, al: Dict[str, Dict[str, str]], given: Sequence[str]) -> dict:
    """the model's plan → the plan the composer runs: ids resolved and checked, coverage and single ownership guaranteed."""
    lib = load()
    parts = ctx['parts']
    fixes: List[str] = []
    banned = ctx['banned']
    scrub = lambda t, n: re.sub(r'\s+', ' ', HAN.sub('', mask_names(str(t or ''), banned, ctx['customer']))).strip()[:n]
    items_of: Dict[str, dict] = {}
    for x in d.get('points') or []:
        if isinstance(x, dict) and isinstance(x.get('id'), str):
            items_of.setdefault(x['id'], {'products': [al['d'][a] for a in (x.get('products') or []) if a in al['d']],
                                          'solutions': [al['s'][a] for a in (x.get('solutions') or []) if a in al['s']]})
    # ---- requirement points
    if given:
        points = [{'id': f'R{i + 1}', 'text': t} for i, t in enumerate(given)]
    else:
        points, seen = [], set()
        for x in d.get('points') or []:
            t = scrub(x.get('text') if isinstance(x, dict) else '', 90)
            if t and all(overlap(t, o['text']) < 0.75 for o in points) and len(points) < 8:
                rid = x.get('id') if isinstance(x.get('id'), str) and re.fullmatch(r'R\d', x['id']) and x['id'] not in seen else f'R{len(points) + 1}'
                while rid in seen:
                    rid = f'R{len(seen) + 1}'
                seen.add(rid)
                points.append({'id': rid, 'text': t})
    rids = {x['id'] for x in points}
    by = {p.get('id'): p for p in d.get('parts') or [] if isinstance(p, dict)}
    plan_parts: List[dict] = []
    for a, pid in al['P'].items():
        p = next(x for x in parts if x['id'] == pid)
        m = by.get(a) or {}
        res = lambda key, table: list(dict.fromkeys(table[x] for x in (m.get(key) or []) if isinstance(x, str) and x in table))
        plan_parts.append({'id': pid, 'name': p['name'], 'deck': p['deck'], 'message': scrub(m.get('message'), 110) or p['goal'][:80],
                           'point_ids': [r for r in dict.fromkeys(x for x in (m.get('points') or []) if x in rids)],
                           'refs': [r for r in dict.fromkeys(x for x in (m.get('refs') or []) if x in rids)],
                           'products': res('products', al['d']), 'solutions': res('solutions', al['s']), 'cases': res('cases', al['c']),
                           'spaces': res('spaces', al['x']), 'n_slides': max(1, min(MAX_SLIDES, int(m.get('n_slides') or len(p['exemplar']) or 1)))})
    cap = {p['id']: p['cap'] for p in parts}
    # ---- spaces: the person's space plan, or the model's placement over the vertical's spaces
    if ctx['spaces_given']:
        spaces = [dict(x) for x in ctx['spaces']]
    else:
        opt = {x['id']: x for x in ctx['space_options']}
        placed: Dict[str, List[str]] = {}
        said = re.sub(r'\s+', '', ctx.get('req_text') or '')
        for row in d.get('placement') or []:
            sid = al['x'].get(row.get('space')) if isinstance(row, dict) else None
            if isinstance(row, dict) and row.get('space') == 'x0':
                # a space in the customer's own words — accepted only when the requirement text really says it
                name = re.sub(r'\s*\d+\s*(곳|개|실|층|대)$', '', _s(row.get('name'), 24)).strip()  # '컨퍼런스룸 12곳' → the space, not the count
                if len(name) >= 2 and re.sub(r'\s+', '', name) in said and not any(o['name'] == name for o in opt.values()):
                    sid = 'cust_' + str(sum(1 for k in opt if k.startswith('cust_')) + 1)
                    opt[sid] = {'id': sid, 'name': name}
                    fixes.append(f'공간 “{name}” — 고객 요구에 나온 공간(업종 후보에 없음)')
            if sid in opt:
                for a in row.get('products') or []:
                    if a in al['d'] and al['d'][a] not in placed.setdefault(sid, []):
                        placed[sid].append(al['d'][a])
        if any(c['spaces'] for c in cap.values()) and opt and ctx['products']:
            cats_of = {x_['id']: x_.get('cats') or [] for x_ in ((lib.get('verticals') or {}).get(ctx.get('vertical') or '') or {}).get('spaces') or []}

            def belongs(pid: str, x: dict) -> float:
                """how well a product belongs in a space of this vertical: the space lists its kind of product (space × product
                registry), and the product's own usual places name the space ('로비' for a 4Way cassette · a signage)."""
                pr_ = lib['products_all'][pid]
                pre = FAM_CATS.get(pr_.get('fam') or '', ())
                cold = bool(re.search(r'콜드|냉장|냉동|쇼케이스', f"{pr_.get('name')} {pr_.get('cat')} {pr_.get('sc')}"))
                # ('sac_cold' is the cold chain of a showcase — not where a room air conditioner stands)
                fam = 2.0 if pre and any(str(c).startswith(pre) and (cold or str(c) != 'sac_cold') for c in cats_of.get(x['id'], [])) else 0.0
                usual = [str(u) for u in pr_.get('spaces') or []]
                toks = [w for w in re.split(r'[\s·/,()]+', x['name']) if len(w) >= 2]
                named = 3.0 if any(w in u or u in w for w in toks for u in usual if len(u) >= 2) else 0.0
                return fam + named + 3.0 * overlap(' '.join(usual + [str(pr_.get('cat') or '')]), x['name'])
            for sid_, pids_ in list(placed.items()):  # a product the model stood where its kind does not belong (a signage in the 백오피스)
                for pid in list(pids_):
                    if sid_.startswith('cust_') or belongs(pid, opt[sid_]) > 0:
                        continue  # (a space in the customer's own words holds what the customer's requirement put there)
                    best = max(opt.values(), key=lambda x: (belongs(pid, x) - 0.3 * len(placed.get(x['id'], [])), -len(placed.get(x['id'], []))))
                    if best['id'] != sid_ and belongs(pid, best) >= 2.0:
                        pids_.remove(pid)
                        if pid not in placed.setdefault(best['id'], []):
                            placed[best['id']].append(pid)
                        fixes.append(f"제품 {pid}: 공간 {opt[sid_]['name']} → {best['name']} (그 제품이 쓰이는 공간으로 옮김)")
            done = {p for v in placed.values() for p in v}
            for pid in ctx['products']:  # a product the model left out → the space its kind belongs to, else the one its usual places name
                if pid in done:
                    continue
                # (not simply the emptiest space — a laptop does not stand for the 조식당)
                best = max(opt.values(), key=lambda x: (belongs(pid, x) - 0.3 * len(placed.get(x['id'], [])), -len(placed.get(x['id'], []))))
                placed.setdefault(best['id'], []).append(pid)
                fixes.append(f"제품 {pid} → 공간 {best['name']} (계획에 빠져 코드가 배치)")
        spaces = [{'id': sid, 'name': opt[sid]['name'], 'products': placed[sid]} for sid in opt if placed.get(sid)][:MAX_SPACES]
    ctx['spaces'] = spaces
    ctx['space_by_id'] = {x['id']: x for x in spaces}
    placed_products = list(dict.fromkeys(p for x in spaces for p in x['products']))
    fixed_text = ' '.join(f['text'] for f in ctx['fixed'])
    covered = lambda name: bool(name) and len(name) >= 3 and name in fixed_text
    # ---- space-oriented parts follow the space plan
    for pp in plan_parts:
        c = cap[pp['id']]
        if c['spaces'] and spaces:
            want_s = [x['id'] for x in spaces]
            if pp['spaces'] != want_s:
                fixes.append(f"{pp['name']}: 공간을 공간 구성 순서로 맞춤")
            pp['spaces'] = want_s
            extra = [p for p in pp['products'] if p not in placed_products]
            pp['products'] = placed_products + extra
        elif not c['spaces']:
            pp['spaces'] = []
    # ---- every linked item sits in a part that can show it
    def ensure(kind: str, ids: Sequence[str], name_of: Callable[[str], str]) -> None:
        able = [pp for pp in plan_parts if cap[pp['id']][kind]]
        for x in ids:
            if any(x in pp[kind] for pp in able) or covered(name_of(x)):
                continue
            holder = next((pp for pp in plan_parts if x in pp[kind]), None)
            target = able[0] if able else holder or next((pp for pp in plan_parts if not pp['deck'] and cap[pp['id']]['points']), None)
            if target is None:
                continue
            if x not in target[kind]:
                target[kind].append(x)
                fixes.append(f"{kind} {x} → {target['name']} (어느 파트에도 없어 코드가 배정)")
    ensure('products', ctx['products'], lambda x: lib['products_all'][x].get('name') or '')
    ensure('solutions', ctx['solutions'], lambda x: lib['solutions'][x].get('name') or '')
    ensure('cases', ctx['cases'], lambda x: lib['cases'][x].get('cust') or '')
    for pp in plan_parts:  # a part that cannot show an item only mentions it — keep those lists short
        c = cap[pp['id']]
        for kind in ('products', 'solutions', 'cases'):
            if not c[kind]:
                pp[kind] = pp[kind][:3]
    # one detailed owner per solution / case: the first part (template order) that can show it
    for kind in ('solutions', 'cases'):
        owner: Dict[str, str] = {}
        for pp in plan_parts:
            if cap[pp['id']][kind]:
                for x in pp[kind]:
                    owner.setdefault(x, pp['id'])
        for pp in plan_parts:
            pp[f'{kind}_own'] = [x for x in pp[kind] if owner.get(x) == pp['id']]
    # ---- one owner per requirement point
    own: Dict[str, str] = {}
    for pp in plan_parts:
        keep = []
        for r in pp['point_ids']:
            if not cap[pp['id']]['points']:
                fixes.append(f"{pp['name']}: 요구 {r} 를 맡을 수 없는 파트 — 참조로 내림")
                continue
            if r in own:
                if r not in pp['refs']:
                    pp['refs'].append(r)
                fixes.append(f"요구 {r}: 주인은 한 파트 — {pp['name']} 은 참조만")
                continue
            own[r] = pp['id']
            keep.append(r)
        pp['point_ids'] = keep
    able = [pp for pp in plan_parts if cap[pp['id']]['points']]
    ptext = {x['id']: x['text'] for x in points}
    for r in ptext:
        if r in own or not able:
            continue
        src = {p['id']: p for p in parts}
        best = max(able, key=lambda pp: (overlap(ptext[r], ' '.join([pp['name'], pp['message'], src[pp['id']]['goal']] + src[pp['id']]['items'])), -len(pp['point_ids'])))
        best['point_ids'].append(r)
        own[r] = best['id']
        fixes.append(f"요구 {r} → {best['name']} (주인이 없어 코드가 배정)")
    for pp in plan_parts:
        pp['refs'] = [r for r in pp['refs'] if r not in pp['point_ids'] and r in ptext][:4]
        pp['points'] = [ptext[r] for r in pp['point_ids']]
        pp['mode'] = next(p['mode'] for p in parts if p['id'] == pp['id'])
        if cap[pp['id']].get('raises'):  # states every requirement as a problem / recap — the answers stay with their owners
            pp['raises'] = list(ptext)
            pp['refs'] = []
        else:
            pp['raises'] = []
    # ---- avoid: what the other parts own
    for pp in plan_parts:
        av = []
        for o in plan_parts:
            if o['id'] == pp['id'] or o['deck']:
                continue
            if o['message']:
                av.append(f"{o['name']}: {o['message']}")
        for f in ctx['fixed']:
            if not f['deck'] and f['heads']:
                av.append(f"{f['name']}(완성됨): {' / '.join(f['heads'][:3])}")
        pp['avoid'] = av[:10]
    for x in points:
        x['owner'] = own.get(x['id'])
        it = items_of.get(x['id']) or {}
        x['products'] = list(dict.fromkeys(it.get('products') or []))[:3]
        x['solutions'] = list(dict.fromkeys(it.get('solutions') or []))[:3]
        if not x['products'] and not x['solutions']:  # the model named none: the linked items whose facts share the most words with the point
            sc = [(overlap(x['text'], product_fact(q, full=True)), 'products', q) for q in ctx['products']] + [(overlap(x['text'], solution_fact(q)), 'solutions', q) for q in ctx['solutions']]
            sc = sorted((t for t in sc if t[0] > 0.05), reverse=True)[:2]
            for _, kind, q in sc:
                x[kind].append(q)
    return {'thesis': scrub(d.get('thesis'), 120), 'storyline': scrub(d.get('storyline'), 300), 'points': points, 'parts': plan_parts,
            'spaces': [{'id': x['id'], 'name': x['name'], 'products': x['products']} for x in spaces], 'fixes': fixes[:40]}


def mask_names(v: str, banned: Sequence[str], customer: str) -> str:
    for b in banned:
        if b in v:
            v = v.replace(b, customer or '고객사')
    return v


def public_plan(plan: dict) -> dict:
    keys = ('id', 'name', 'message', 'points', 'point_ids', 'refs', 'raises', 'mode', 'products', 'solutions', 'cases', 'spaces', 'avoid', 'n_slides')
    return {'thesis': plan['thesis'], 'storyline': plan['storyline'], 'points': plan['points'], 'spaces': plan['spaces'],
            'parts': [{k: p.get(k) for k in keys} for p in plan['parts']], 'fixes': plan['fixes']}


# ================================================================================================ 2. layouts
def _sibling(f: str, n: int) -> Optional[str]:
    m = SIBLING.match(f)
    if not m:
        return None
    L = load()['layouts']
    pre = m.group(1)
    cands = [f'{pre}{n}']
    if pre.startswith('L_VS_BIRD_'):
        cands = [f'L_VS_BIRD_S{n}', f'L_VS_BIRD_B{n}'] if n <= 6 else [f'L_VS_BIRD_B{n}', f'L_VS_BIRD_S{n}']
    return next((x for x in cands if x in L and not L[x].get('retired')), None)


def _max_i(f: str) -> int:
    L = load()['layouts'].get(f) or {}
    return max([t['i'] for t in L.get('texts') or []] + [-1])


FOOTER_TEXT = '업종 · AI 제안'  # the deck-name line at the foot of the L_VS_* sheets (a text slot of the layout since the footer became editable)


def _is_footer(t: dict) -> bool:
    return t.get('role') == 'utility' and (t.get('y') or 0) >= 640


def _last_i(f: str) -> int:
    """the last content slot of a layout — the deck-name line at the foot is not one of its rows."""
    L = load()['layouts'].get(f) or {}
    return max([t['i'] for t in L.get('texts') or [] if not _is_footer(t)] + [-1])


def _space_p(f: str) -> Optional[tuple]:
    """(k, per) of a one-space · k-product sheet (L_VS_SPACE_P<k>): product j's cells are 3 + per·j (its name) … 3 + per·j + per - 1."""
    m = SPACE_P.match(f or '')
    if not m or f not in load()['layouts']:
        return None
    k = int(m.group(1))
    return k, max(1, (_last_i(f) - 2) // k)


def _cell_product(sl: dict, i: int) -> Optional[str]:
    """the product a text cell of a 공간별 제품 장 speaks of — on a several-product sheet, the product of that cell's card."""
    b = sl.get('bind') or {}
    pl = _space_p(sl.get('f') or '')
    if pl and i >= 3:
        j = (i - 3) // pl[1]
        prods = b.get('products') or []
        return prods[j] if j < min(pl[0], len(prods)) else None
    return b.get('product')


def _space_p_cells(ctx: dict, sl: dict, ref_t: Dict[str, Any]) -> None:
    """a one-space · k-product sheet: every card's feature cells learn which product they belong to (``notes``) and get the template
    sheet's own feature lines cut to the card's box as their reference (``edit_ref`` — the length budget the writer keeps to)."""
    lib = load()
    pl = _space_p(sl['f'])
    if not pl:
        return
    k, per = pl
    geo = {t['i']: t for t in lib['layouts'][sl['f']]['texts'] if not t.get('img')}
    titles = [plain(ref_t.get(i)) for i in ('5', '7') if plain(ref_t.get(i))] or ['제품 특징']
    lines = [plain(ref_t.get(i)) for i in ('6', '8') if plain(ref_t.get(i))] or ['이 제품이 이 공간에서 하는 일']
    notes, er = sl.setdefault('notes', {}), sl.setdefault('edit_ref', {})
    sp = (ctx['space_by_id'].get(sl['bind'].get('space')) or {}).get('name') or ''
    notes['2'] = f'이 공간({sp})에서 이 장의 제품 {k}개가 함께 하는 일 — 제품 이름을 나열하지 말고 하는 일로 씁니다'
    for j, q in enumerate((sl['bind'].get('products') or [])[:k]):
        name = _short((lib['products_all'].get(q) or {}).get('name') or q)
        for r in range((per - 1) // 2):
            ti, di = 3 + per * j + 1 + 2 * r, 3 + per * j + 2 + 2 * r
            er[str(ti)] = trim_to_box(titles[r % len(titles)], 4, geo.get(ti))
            er[str(di)] = trim_to_box(lines[r % len(lines)], 8, geo.get(di))
            notes[str(ti)] = f'제품 {j + 1} “{name}” 카드의 특징 {r + 1} 제목 — 이 제품의 사실(사양 · 기능)로, 같은 카드의 다른 특징과 다른 내용'
            notes[str(di)] = f'제품 {j + 1} “{name}” 카드의 특징 {r + 1} 설명 — 칸 {ti} 제목을 이 공간({sp})에서의 효과로 풀어 씀(이 제품의 사실만)'


# ------------------------------------------------------------------------------------------------ 고객/공간 시나리오 (L_TOC_SCN_*)
def scn_uses(ctx: dict) -> Dict[str, List[dict]]:
    """공간 id → 그 공간에서 쓰는 솔루션 · 서비스 [{id, name, kind}] — 앱이 공간 구성에 실어 보낸 것(space_plan.spaces[].uses).
    보내지 않았으면(모델 배치) 연결한 솔루션마다: 그 솔루션과 함께 쓰는 제품(with)이 놓인 공간, 그런 공간이 없으면 제품이 놓인 모든 공간."""
    lib = load()
    spaces = ctx.get('spaces') or []
    if any('uses' in sp for sp in spaces):
        return {sp['id']: [dict(u) for u in sp.get('uses') or []] for sp in spaces}
    out: Dict[str, List[dict]] = {sp['id']: [] for sp in spaces}
    placed = [sp for sp in spaces if sp.get('products')] or spaces
    for sid in ctx.get('solutions') or []:
        so = (lib.get('solutions') or {}).get(sid) or {}
        with_ = set(so.get('with') or [])
        hit = [sp for sp in spaces if with_ & set(sp.get('products') or [])] or placed
        for sp in hit:
            out[sp['id']].append({'id': sid, 'name': ctx['short'].get(sid) or so.get('name') or sid, 'kind': '서비스' if so.get('cat') == '서비스' else '솔루션'})
    return out


def _scn_named(sl: dict, f_old: str) -> None:
    """시나리오 장을 다른 칸 수의 시트로 바꾼 뒤 — 견본 글을 칸 이름으로 옮긴다(제목 · 장면 글 · 공간 이름 … 칸 번호가 시트마다 다르다)"""
    TS = load().get('toc_slots') or {}
    o, n = (TS.get(f_old) or {}).get('t') or {}, (TS.get(sl['f']) or {}).get('t') or {}
    src = sl.get('ex_t_old') or {}
    for name, i in o.items():
        if name in n and str(i) in src:
            sl['ex_t'][str(n[name])] = src[str(i)]


def _scn_order(r: dict) -> tuple:
    return (-len(r['spaces']), 0 if r['kind'] == '솔루션' else 1)


def scn_rows(space_ids: Sequence[str], uses_by: Dict[str, List[dict]]) -> List[dict]:
    """솔루션 · 서비스마다 쓰는 공간(번호 = space_ids 차례, 0부터) — 여러 공간이 함께 쓰는 것부터, 같으면 솔루션 → 서비스 → 먼저 나온 것(앱 scenarioUses 와 같음)."""
    rows: Dict[str, dict] = {}
    for i, sid in enumerate(space_ids):
        for u in uses_by.get(sid) or []:
            r = rows.setdefault(u['id'], {'id': u['id'], 'name': u['name'], 'kind': u.get('kind') or '솔루션', 'spaces': []})
            if i not in r['spaces']:
                r['spaces'].append(i)
    return sorted(rows.values(), key=_scn_order)


def _scn_cap(rows: List[dict], n: int) -> List[dict]:
    """n줄까지 — 넘치면 마지막 줄이 '그 밖에 N개'(쓰는 공간은 남은 줄을 모두 합친 것)"""
    if len(rows) <= n:
        return rows
    rest = rows[n - 1:]
    return rows[:n - 1] + [{'id': None, 'name': f'그 밖에 {len(rest)}개', 'kind': '', 'spaces': sorted({i for r in rest for i in r['spaces']}), 'more': [r['name'] for r in rest]}]


def scn_map_groups(n: int) -> List[List[int]]:
    """공간 수 → 활용 맵 묶음(공간 차례) — 1곳 이하 없음 · 10곳까지 한 장 · 넘으면 고르게 나눔(11 → 6 + 5)"""
    if n < SCN_MAP_MIN:
        return []
    k = -(-n // SCN_MAP_MAX)
    out, at = [], 0
    for g in range(k):
        size = n // k + (1 if g < n % k else 0)
        out.append(list(range(at, at + size)))
        at += size
    return out


def scn_set_groups(n: int) -> List[List[int]]:
    """공간 수 → 공간별 시나리오 묶음(공간 차례) — 3곳씩, 한 곳만 남지 않게(4 → 2 + 2). 1곳 이하 없음(앱 scenarioSetGroups 와 같음)"""
    if n < 2:
        return []
    sizes, left = [], n
    while left > 0:
        if left == 4:
            sizes += [2, 2]
            break
        if left <= SCN_PER:
            sizes.append(left)
            break
        sizes.append(SCN_PER)
        left -= SCN_PER
    out, at = [], 0
    for k in sizes:
        out.append(list(range(at, at + k)))
        at += k
    return out


def _scn_keys(sid: str) -> List[str]:
    """선택한 솔루션 · 서비스 → 업종 공간 자료(_feature_registry)의 솔루션 key — 케어 · 유지관리 서비스는 삼성케어플러스 SAC · 비즈니스"""
    lib = load()
    keys = [k for k, v in (lib.get('sol_keys') or {}).items() if v == sid]
    so = (lib.get('solutions') or {}).get(sid) or {}
    if not keys and so.get('cat') == '서비스' and re.search(r'케어|유지|A/S|보증', so.get('name') or ''):
        keys = ['svc_sac', 'svc_mobile']
    return [k for k in keys if k in _feature_registry()['cat']]


def scn_features(ctx: dict, sid: str, space: dict) -> List[str]:
    """그 공간에서 그 솔루션 · 서비스가 쓰는 기능(아이콘 있는 것) — 업종 공간 자료에서 공간 id(없으면 이름)로 찾는다"""
    reg = _feature_registry()
    V = reg['v'].get(ctx.get('vertical') or '') or {}
    keys = _scn_keys(sid)
    out: List[str] = []
    for vs in V.get('spaces') or []:
        if vs.get('id') != space.get('id') and not (space.get('name') and (space['name'] in vs.get('name', '') or vs.get('name', '') in space['name'])):
            continue
        for so in vs.get('solutions') or []:
            if so.get('solution') in keys:
                out += [f for f in so.get('features') or [] if f in reg['icons']]
    return list(dict.fromkeys(out))


def scn_all_features(ctx: dict, sid: str) -> List[str]:
    """그 솔루션 · 서비스의 기능 차례 — 이 업종에서 쓰는 기능부터, 나머지는 카탈로그 차례(꺼진 아이콘으로 칸을 채운다)"""
    reg = _feature_registry()
    V = reg['v'].get(ctx.get('vertical') or '') or {}
    keys = _scn_keys(sid)
    used = [f for vs in V.get('spaces') or [] for so in vs.get('solutions') or [] if so.get('solution') in keys for f in so.get('features') or [] if f in reg['icons']]
    cat = [f['id'] for k in keys for g in (reg['cat'].get(k) or {}).get('groups') or [] for f in g.get('features') or [] if f['id'] in reg['icons']]
    return list(dict.fromkeys(used + cat))


def scn_lead_features(sid: str) -> List[str]:
    """업종 자료에 그 공간의 기능이 없을 때 켜는 대표 기능 — 기능 묶음마다 첫 기능(3개까지)"""
    reg = _feature_registry()
    return [g['features'][0]['id'] for k in _scn_keys(sid) for g in (reg['cat'].get(k) or {}).get('groups') or []
            if g.get('features') and g['features'][0]['id'] in reg['icons']][:3]


def scn_set_rows(ctx: dict, rows: List[dict], spaces: List[dict], group: List[int], n: int = SCN_USE_ROWS, per: int = SCN_USE_ICONS) -> List[dict]:
    """한 장의 고정 줄(솔루션 · 서비스 구분 없이) — 모든 장이 같은 줄, 기능 아이콘(이 장의 공간에서 쓰는 기능만 켬). used = 이 장의 공간 중 쓰는 곳이 있음(글쓰기 안내용 — 장에는 적지 않는다)"""
    out = []
    for r in _scn_cap(rows, n):
        here = [i for i in group if i in r['spaces']]
        on: List[str] = []
        if r['id']:
            for i in here:
                f_ = scn_features(ctx, r['id'], spaces[i]) or scn_lead_features(r['id'])
                on += [f for f in f_ if f not in on]
        order = list(dict.fromkeys((scn_all_features(ctx, r['id']) if r['id'] else []) + on))
        pick = (on[:per] + [f for f in order if f not in on])[:per]
        pick.sort(key=order.index)
        out.append({'id': r['id'], 'name': r['name'], 'used': bool(here), 'icons': [(f, f in on) for f in pick]})
    return out


def _scn_lock(ctx: dict, s: dict) -> Dict[str, Any]:
    """공간별 시나리오 한 장: 공간 이름 · 번호 · 컷 위 제품 이름 · 솔루션 · 서비스 줄(이름 · 기능 이름). 빈 칸은 비운다. 제목 · 공간마다 시나리오는 글쓰기가 쓴다."""
    lib = load()
    T = ((lib.get('toc_slots') or {}).get(s['f']) or {}).get('t') or {}
    b = s['bind']
    out: Dict[str, Any] = {}

    def put(name: str, v: Any) -> None:
        if name in T:
            out[str(T[name])] = v
    for j, sid in enumerate(b.get('spaces') or []):
        sp = ctx['space_by_id'][sid]
        put(f'sp{j}', sp['name'])
        put(f'sp{j}n', str((b.get('nos') or [])[j] if j < len(b.get('nos') or []) else j + 1))
        cuts = list(dict.fromkeys(sp.get('products') or []))[:SCN_CUTS]  # 컷 칸과 같은 제품(img_bind) — 컷 위에 이름
        for q in range(SCN_CUTS):
            put(f'pn{j}_{q}', _short((lib['products_all'].get(cuts[q]) or {}).get('name') or cuts[q]) if q < len(cuts) else '')
    for j in range(len(b.get('spaces') or []), SCN_PER):
        for q in range(SCN_CUTS):
            put(f'pn{j}_{q}', '')
    labels = _feature_registry().get('labels') or {}
    rows = b.get('rows') or []
    for r in range(SCN_USE_ROWS):
        x = rows[r] if r < len(rows) else None
        put(f'un{r}', x['name'] if x else '')
        for q in range(SCN_USE_ICONS):
            ic = x['icons'][q] if x and q < len(x['icons']) else None
            put(f'ul{r}_{q}', labels.get(ic[0], '') if ic else '')
    return out


def _scnmap_lock(ctx: dict, s: dict) -> Dict[str, Any]:
    """활용 맵: 공간 칸(번호 · 이름 · 제품 수) · 줄(종류 · 이름 · 공간마다 ● · 쓰는 공간 수) · 제목 — 모두 공간 구성에서 정해진다."""
    lib = load()
    T = ((lib.get('toc_slots') or {}).get(s['f']) or {}).get('t') or {}
    b = s['bind']
    out: Dict[str, Any] = {}

    def put(name: str, v: Any) -> None:
        if name in T:
            out[str(T[name])] = v
    order = [x['id'] for x in ctx.get('spaces') or []]
    cols = b.get('spaces') or []
    for j, sid in enumerate(cols):
        sp = ctx['space_by_id'][sid]
        put(f'cn{j}', str(order.index(sid) + 1 if sid in order else j + 1))
        put(f'cs{j}', sp['name'])
        put(f'cp{j}', f"제품 {len(sp.get('products') or [])}")
    rows = b.get('rows') or []
    for r in range(SCN_ROWS):
        x = rows[r] if r < len(rows) else None
        put(f'rk{r}', x['kind'] if x else '')
        put(f'rn{r}', x['name'] if x else '')
        put(f'rt{r}', f"{x['count']}곳" if x else '')
        for j in range(len(cols)):
            put(f'rc{r}_{j}', '●' if x and x['cells'][j] else '')
    shared = sum(1 for x in rows if x['id'] and len(x['spaces']) > 1)
    put('title', f'솔루션 · 서비스 {shared}가지는 여러 공간에서 함께 씁니다' if shared else '공간마다 쓰는 솔루션 · 서비스')
    return out


def _chrome(ex_t: Dict[str, Any], f_old: str) -> Dict[int, Any]:
    """the footer block the app appends after the layout's own slots (로고 · 덱 이름 · CONFIDENTIAL) → {offset: value}."""
    base = _max_i(f_old) + 1
    return {int(k) - base: v for k, v in ex_t.items() if k.isdigit() and int(k) >= base}


def _lib_exemplar(f: str, ind: Optional[str], match: Optional[Callable[[dict], bool]] = None) -> Optional[dict]:
    """a filled slide of layout ``f`` from the standard decks (same industry first) — the reference for an added slide."""
    lib = load()
    inds = {c['id']: c.get('ind') for c in lib['scenarios']}
    best = None
    for key, e in lib['exemplars'].items():
        if e['f'] != f or not e.get('t'):
            continue
        if match and not match(e):
            continue
        sid = e['sid']
        rank = (0 if sid.startswith('bs_std_') else 1, 0 if inds.get(sid) == ind else 1)
        if best is None or rank < best[0]:
            best = (rank, e)
    return best[1] if best else None


def _mk(x: dict, **kw) -> dict:
    return {'f': x['f'], 'from': x['f'], 'role': x.get('role') or '', 'kind': slide_kind(x['f']), 'ex_t': dict(x.get('t') or {}), 'ex_img': dict(x.get('img') or {}),
            'extra': dict(x.get('extra') or {}), 'bind': {}, 'bind_same': True, 'adapt': [], 'src_x': x, **kw}


def _with_chrome(lx: dict, f: str, base_ref: dict, role: str) -> dict:
    """a standard-deck slide of layout ``f`` as the reference, wearing this deck's footer block."""
    base = _max_i(f) + 1
    t = {k: v for k, v in (lx.get('t') or {}).items() if not (k.isdigit() and int(k) >= base)}
    for off, v in _chrome(base_ref['t'], base_ref['f']).items():
        t[str(base + off)] = v
    return {'f': f, 'role': role, 't': t, 'img': dict(lx.get('img') or {}), 'extra': {}}


def _resize(sl: dict, f_new: str, why: str) -> None:
    """switch to a sibling layout with another count: header slots keep their values, the footer block moves to the new end."""
    if f_new == sl['f']:
        return
    chrome = _chrome(sl['ex_t'], sl['f'])
    old_max, new_max = _max_i(sl['f']), _max_i(f_new)
    keep = {k: v for k, v in sl['ex_t'].items() if k.isdigit() and int(k) <= min(3, old_max)}
    for off, v in chrome.items():
        keep[str(new_max + 1 + off)] = v
    sl['ex_t_old'] = sl['ex_t']
    sl['ex_t'] = keep
    sl['f'] = f_new
    sl['resized'] = True
    sl['adapt'].append(why)


STRUCTURAL = re.compile(r'^(도입 (전|후)|지금|현재|이전|이후|Before|After)\b|\[00\]|^[\d\s·./%-]+$')  # unit · before/after labels: part of the layout
ICON = re.compile(r'/assets/toc/icons/((?:s|svc)_[a-z0-9]+)\.')
BLANK_ICON = '/assets/toc/icons/blank.png'


def icon_solution(src: Any) -> Optional[str]:
    """the solution key a feature icon belongs to ('/assets/toc/icons/s_vxt.rm.lock.on.png' → 's_vxt'), None for other pictures."""
    m = ICON.search(norm_src(src) if src else '')
    return m.group(1) if m else None


def journey_blocks(ctx: dict, x: dict) -> List[dict]:
    """the solution blocks of a 여정 장 (name + feature icons): which catalog solution each is, and whether this customer linked it."""
    lib = load()
    TS = (lib.get('toc_slots') or {}).get(x['f']) or {}
    keys = lib.get('sol_keys') or {}
    out = []
    for k in (0, 1):
        i = (TS.get('t') or {}).get(f'sn{k}')
        if i is None:
            continue
        name = plain(x['t'].get(str(i)))
        ids: Set[str] = set()
        for j in range(10):
            ii = (TS.get('img') or {}).get(f'fi{k}_{j}')
            key = icon_solution(x['img'].get(str(ii))) if ii is not None else None
            if key:
                if keys.get(key):
                    ids.add(keys[key])
                else:
                    ids.add('~' + key)  # a solution the catalog does not carry — never linked
        for lb, words, sids in SOL_WORDS:
            if any(w in name for w in words):
                ids |= sids or {'~' + lb}
        if name or ids:
            out.append({'k': k, 'name': name, 'ids': ids, 'linked': bool(ids & set(ctx['solutions']))})
    return out


_REG: Dict[str, Any] = {}


def _feature_registry() -> dict:
    """버티컬 × 공간 × 솔루션 기능 registry (app/data/vertical_space_solution.json): {'cat': {solution key: catalog}, 'v': {vertical id: record},
    'icons': feature ids that have an icon}. Empty when the file is not there."""
    if 'reg' not in _REG:
        import json
        from .library import ROOT
        out: Dict[str, Any] = {'cat': {}, 'v': {}, 'icons': set()}
        try:
            d = json.load(open(ROOT / 'app' / 'data' / 'vertical_space_solution.json', encoding='utf-8'))
            out['cat'] = {c['id']: c for c in d.get('solution_catalog') or [] if isinstance(c, dict) and c.get('id')}
            out['v'] = {v['id']: v for v in d.get('verticals') or [] if isinstance(v, dict) and v.get('id')}
            icons = ROOT / 'app' / 'web' / 'public' / 'assets' / 'toc' / 'icons'
            out['icons'] = {f.name[:-len('.on.png')] for f in icons.glob('*.on.png')} if icons.exists() else set()
            # 기능 이름(짧게) — 공간별 시나리오의 기능 칸 밑줄 아래 글(앱과 같은 표: app/web/src/domain/templates/feature_labels.json)
            out['labels'] = json.load(open(ROOT / 'app' / 'web' / 'src' / 'domain' / 'templates' / 'feature_labels.json', encoding='utf-8'))
        except (OSError, ValueError):
            pass
        _REG['reg'] = out
    return _REG['reg']


def journey_rebind(ctx: dict, x: dict, blocks: List[dict], pp: dict) -> Optional[dict]:
    """a 여정 장 whose solution block(s) stand on solutions this customer did not select → the same page on the solutions the
    customer did select: name · feature groups · feature icons from the registry (the features that solution runs in this page's
    spaces of this vertical are lit; none listed there → in this vertical · this industry group · the solution's lead features).
    The scenes are then written for these solutions by the text stage. None when no selected solution has a feature set."""
    lib = load()
    TS = (lib.get('toc_slots') or {}).get(x['f']) or {}
    T, I = TS.get('t') or {}, TS.get('img') or {}
    reg = _feature_registry()
    if not reg['cat'] or not T:
        return None
    keys_of: Dict[str, List[str]] = {}
    for key, sid in (lib.get('sol_keys') or {}).items():
        keys_of.setdefault(sid, []).append(key)
    taken = {q for b in blocks if b['linked'] for q in b['ids']}
    stages = [plain(x['t'].get(str(T[f'st{j}']))) for j in range(4) if f'st{j}' in T]
    V = reg['v'].get(ctx.get('vertical') or '') or {}

    def feats(key: str, scope: str) -> List[str]:
        vs = [V] if scope in ('stage', 'vertical') else [v for v in reg['v'].values() if V.get('group') and v.get('group') == V.get('group')]
        got: List[str] = []
        for v in vs:
            for sp in v.get('spaces') or []:
                if scope == 'stage' and not any(n and (n in sp.get('name', '') or sp.get('name', '') in n) for n in stages):
                    continue
                for so in sp.get('solutions') or []:
                    if so.get('solution') == key:
                        got += [f for f in so.get('features') or [] if f in reg['icons']]
        return list(dict.fromkeys(got))
    cands: List[tuple] = []
    for sid in dict.fromkeys(list(pp.get('solutions') or []) + list(ctx['solutions'])):
        if sid in taken or sid not in ctx['solutions']:
            continue
        best = None
        for key in keys_of.get(sid, []):
            cat = reg['cat'].get(key)
            if not cat:
                continue
            on: List[str] = []
            rank = 3
            for r, scope in enumerate(('stage', 'vertical', 'group')):
                on = feats(key, scope)
                if on:
                    rank = r
                    break
            if not on:
                on = [g['features'][0]['id'] for g in cat.get('groups') or [] if g.get('features') and g['features'][0]['id'] in reg['icons']][:4]
            if on and (best is None or (rank, -len(on)) < best[:2]):
                best = (rank, -len(on), key, on)
        if best:
            cands.append((best[0], len(cands), sid, best[2], best[3]))
    cands.sort()
    free = [b['k'] for b in blocks if not b['linked']]
    if not cands or not free:
        return None
    t, img = dict(x['t']), dict(x['img'])
    done = []
    for k, (_, _, sid, key, on) in zip(free, cands):
        cat = reg['cat'][key]
        order = [f['id'] for g in cat.get('groups') or [] for f in g.get('features') or [] if f['id'] in reg['icons']]
        fname = {f['id']: f.get('name') or '' for g in cat.get('groups') or [] for f in g.get('features') or []}
        gname = {f['id']: g.get('name') or '' for g in cat.get('groups') or [] for f in g.get('features') or []}
        on = [f for f in on if f in order][:5]
        if not on or f'sn{k}' not in T:
            continue
        groups = list(dict.fromkeys(gname[o] for o in on))
        n_slots = sum(1 for nm in I if nm.startswith(f'fi{k}_'))
        show = sorted((on + [f for f in order if f not in on and gname[f] in groups])[:n_slots], key=order.index)
        t[str(T[f'sn{k}'])] = ctx['short'].get(sid) or sid
        if f'sa{k}' in T:
            t[str(T[f'sa{k}'])] = trim_to(' · '.join(groups), 34)
        for j in range(n_slots):
            ii = I.get(f'fi{k}_{j}')
            if ii is None:
                continue
            fid = show[j] if j < len(show) else None
            img[str(ii)] = {'src': f"/assets/toc/icons/{fid}.{'on' if fid in on else 'off'}.png" if fid else BLANK_ICON, 'fit': 'contain', 'keep': True}
        done.append({'solution': sid, 'features': [fname[o] for o in on]})
    if not done:
        return None
    return {**x, 't': t, 'img': img, 'rebound': done}


def journey_stages(x: dict, n: int) -> Optional[dict]:
    """a 여정 장 → its sibling with ``n`` spaces (L_TOC_JOURNEY<n>[S]): the first n stages and the solution block(s), slots re-mapped by name."""
    lib = load()
    m = re.fullmatch(r'(L_TOC_JOURNEY)(\d)(S?)', x['f'])
    if not m or n < 1 or int(m.group(2)) == n:
        return None
    f2 = f'{m.group(1)}{n}{m.group(3)}'
    TS, TS2 = (lib.get('toc_slots') or {}).get(x['f']), (lib.get('toc_slots') or {}).get(f2)
    if not TS or not TS2 or f2 not in lib['layouts']:
        return None
    t = {str(i2): x['t'][str(TS['t'][name])] for name, i2 in TS2['t'].items() if name in TS['t'] and str(TS['t'][name]) in x['t']}
    img = {str(i2): x['img'][str(TS['img'][name])] for name, i2 in TS2['img'].items() if name in TS['img'] and str(TS['img'][name]) in x['img']}
    return {'f': f2, 't': t, 'img': img}


def journey_single(x: dict, keep: int) -> Optional[dict]:
    """a two-solution 여정 장 → its one-solution variant holding only block ``keep`` (slots re-mapped by name)."""
    lib = load()
    f2 = x['f'] + 'S'
    TS, TS2 = (lib.get('toc_slots') or {}).get(x['f']), (lib.get('toc_slots') or {}).get(f2)
    if not TS or not TS2 or f2 not in lib['layouts']:
        return None
    src_name = lambda n: n.replace('sn0', f'sn{keep}').replace('sa0', f'sa{keep}') if n in ('sn0', 'sa0') else n
    t = {}
    for name, i2 in TS2['t'].items():
        i = TS['t'].get(src_name(name))
        if i is not None and str(i) in x['t']:
            t[str(i2)] = x['t'][str(i)]
    img = {}
    for name, i2 in TS2['img'].items():
        m = re.fullmatch(r'fi0_(\d+)', name)
        i = TS['img'].get(f'fi{keep}_{m.group(1)}') if m else TS['img'].get(name)
        if i is not None and str(i) in x['img']:
            img[str(i2)] = x['img'][str(i)]
        elif m:
            img[str(i2)] = {'src': BLANK_ICON, 'fit': 'contain', 'keep': True}
    return {'f': f2, 'role': x.get('role') or '', 't': t, 'img': img, 'extra': dict(x.get('extra') or {})}


def case_of(text: str) -> Optional[str]:
    """the catalog case a 도입사례 slide is about (by its customer name)."""
    text = (text or '').strip()
    if not text:
        return None
    C = load()['cases']
    hit = next((cid for cid, c in C.items() if str(c.get('cust') or '').strip() == text), None)
    return hit or next((cid for cid, c in C.items() if len(str(c.get('cust') or '')) >= 3 and (str(c['cust']) in text or text in str(c['cust']))), None)


def product_names(pid: str) -> List[str]:
    """the names a text may use for a product: full name · model · the name without its model code (not its broad category)."""
    p = (load().get('products_all') or {}).get(pid) or {}
    name = str(p.get('name') or '')
    words = name.split()
    bare = ' '.join(w for w in words if not re.search(r'\d', w))
    out = [name, str(p.get('model') or ''), bare if len(bare) >= 5 else '']
    return [x for x in dict.fromkeys(out) if len(x) >= 3]


def case_fits(ctx: dict, cid: Optional[str], slide_text: str = '') -> str:
    """why a case the person did not link may still stand in this deck: 'industry' (same industry group) · 'product' (shows a linked
    product) — '' when neither (a café franchise case in a hospital deck)."""
    c = load()['cases'].get(str(cid)) if cid else None
    blob = ' '.join([slide_text] + ([str(c.get(k) or '') for k in ('title', 'sub')] + list(map(str, c.get('offer') or [])) if c else []))
    if c and ctx.get('ind') and c.get('ind') == ctx['ind']:
        return 'industry'
    if any(nm in blob for pid in ctx['products'] for nm in product_names(pid)):
        return 'product'
    return ''


def fallback_cases(ctx: dict, n: int = 2) -> List[tuple]:
    """no case linked and none of the template's fits: authored 도입사례 slides of cases from this industry / showing a linked product."""
    lib = load()
    seen: Dict[str, dict] = {}
    for e in lib['exemplars'].values():
        if e['f'] == 'L_VS_CASE' and e.get('t'):
            cid = case_of(plain(e['t'].get('1')))
            if cid and cid not in seen:
                seen[cid] = e
    V = (lib.get('verticals') or {}).get(ctx.get('vertical') or '') or {}
    ranked = []
    for cid, e in seen.items():
        why = case_fits(ctx, cid, ' '.join(plain(v) for v in e['t'].values()))
        if not why:
            continue
        c = lib['cases'][cid]
        text = ' '.join(str(c.get(k) or '') for k in ('type', 'title', 'cust'))
        score = (2.0 if why == 'product' else 0.0) + (1.0 if c.get('ind') == ctx.get('ind') else 0.0) + (0.5 if any(w in text for w in V.get('kw') or []) else 0.0)
        ranked.append((score, cid, e))
    ranked.sort(key=lambda t: (-t[0], t[1]))
    return [(cid, e) for _, cid, e in ranked[:n]]


def case_sheet(cid: str, base_ref: dict) -> Optional[dict]:
    """the 도입사례 sheet of a catalog case that has no authored sheet — written by code from the case record, the same way the
    authored sheets were made (vertical_standard/build.py): customer · type — offer · three 도입 포인트 · source. No model call."""
    c = load()['cases'].get(str(cid))
    if not c or not _s(c.get('cust')):
        return None
    offer, needs_, proof = [_s(x, 200) for x in c.get('offer') or []], [_s(x, 200) for x in c.get('needs') or []], [_s(x, 200) for x in c.get('proof') or []]
    sub = _s(c.get('sub'), 200) or _s(c.get('title'), 200)
    t = {'0': plain(base_ref['t'].get('0')) or '05 · 도입사례', '1': _s(c['cust'], 60), '2': trim_to(f"{_s(c.get('type'), 80) or '도입사례'} — {sub}", 90), '3': '도입 포인트'}
    for k in range(3):
        head = offer[k] if k < len(offer) else (needs_[k] if k < len(needs_) else sub)
        d = needs_[k] if k < len(needs_) else ''
        if k < len(proof):
            d = (d + ' — ' + proof[k]) if d else proof[k]
        if not d:
            d = _s(c.get('quote'), 200) or _s(c.get('title'), 200)
        t[str(4 + 2 * k)], t[str(5 + 2 * k)] = trim_to(head, 44), trim_to(d, 110)
    t['10'] = '원문 · samsung.com 도입사례'
    base = _max_i('L_VS_CASE') + 1
    for off, v in _chrome(base_ref['t'], base_ref['f']).items():
        t[str(base + off)] = v
    photos = case_photos(str(cid))
    # the wide 대표 frame takes the case photo closest to its shape, the three square-ish point frames the next best-shaped ones
    # (_match_case_photos then gives each point the photo its words name) — a 3:2 photo in a square frame loses a third of itself
    boxes = {im['i']: im for im in (load()['layouts'].get('L_VS_CASE') or {}).get('images') or []}
    if photos and boxes.get(0):
        first = by_shape(photos, boxes[0])[0]
        photos = [first] + by_shape([x for x in photos if x != first], boxes.get(1) or {})
    img = {}
    for k in range(4):  # 대표 사진 + 적용 사진 3 — a case with fewer photos leaves the other frames empty
        img[str(k)] = ({'src': photos[k], 'fit': 'cover', 'name': ((load()['images'].get(photos[k]) or {}).get('desc') or _s(c['cust'], 60)), 'keep': True}
                       if k < len(photos) else {'hidden': True, 'name': '사례 사진 없음'})
    return {'f': 'L_VS_CASE', 'role': '도입사례 · ' + _s(c['cust'], 60), 't': t, 'img': img, 'extra': {}}


def sample_slide(ctx: dict, f: str, role: str, values: Dict[str, str]) -> dict:
    """a slide of layout ``f`` that no template slide stands behind: named slots set by code, the footer block of this deck."""
    TS = ((load().get('toc_slots') or {}).get(f) or {}).get('t') or {}
    t = {}
    for name, v in {'logo': '고객사 로고', 'foot': ctx['footer_new'], 'conf': 'CONFIDENTIAL · 0', **values}.items():
        if name in TS:
            t[str(TS[name])] = v
    return {'f': f, 'role': role, 't': t, 'img': {}, 'extra': {}}


def _alt_sheet(ctx: dict, part: dict, pp: dict, x: dict, reg: Registry, reserved: Sequence[str], out: List[dict]) -> Optional[dict]:
    """the sheet that stands in for a figure sheet whose figures nobody stated (``placeholders.ALTERNATIVE_LAYOUTS``): 전후 비교 KPI →
    가치 세 가지 (each value under a selected item), 고객사 현황 지표 → 고객 과제. None when the deck already holds that layout or
    there is nothing to stand under it."""
    lib = load()
    L = lib['layouts']
    TS = lib.get('toc_slots') or {}
    eb = plain(x['t'].get('0'))
    for f_alt in phm.ALTERNATIVE_LAYOUTS.get(x['f'], []):
        if f_alt not in L or L[f_alt].get('retired') or f_alt in reserved or f_alt in reg or any(o['f'] == f_alt for o in out) or f_alt not in TS:
            continue
        T, I = TS[f_alt].get('t') or {}, TS[f_alt].get('img') or {}
        if f_alt == 'L_TOC_VP3':
            # the part's own items first, then the customer's other selected items (a part that only mentions items holds one or two)
            prods = list(dict.fromkeys(list(pp.get('products') or []) + list(ctx['products'])))
            sols = list(dict.fromkeys(list(pp.get('solutions') or []) + list(ctx['solutions'])))
            items = [('product', q) for q in prods[:2]] + [('solution', q) for q in sols[:1]]
            items += [it for it in [('solution', q) for q in sols[1:]] + [('product', q) for q in prods[2:]] if it not in items]
            if len(items) < 3:
                continue  # three values stand under three selected items
            items = items[:3]
            name = lambda it: ctx['short'].get(it[1]) or it[1]
            vals = {'eb': eb, **{f'no{k}': f'{k + 1:02d}' for k in range(3)}, **{f'src{k}': ('제품 · ' if it[0] == 'product' else '솔루션 · ') + name(it) for k, it in enumerate(items)}}
            sl = _mk(sample_slide(ctx, f_alt, '기대 효과 — 가치 세 가지', vals))
            sl.update({'from': None, 'bind': {'kind': 'generic', 'products': [q for k, q in items if k == 'product'], 'solutions': [q for k, q in items if k == 'solution']},
                       'bind_same': False, 'src_x': x, 'alt_of': x['f'],
                       'lock': {str(T[n]): v for n, v in vals.items() if n in T and n != 'eb'},
                       'img_bind': {str(I[f'img{k}']): {it[0]: it[1]} for k, it in enumerate(items) if f'img{k}' in I},
                       'notes': {**{str(T[f'tt{k}']): f"‘{name(it)}’ 이(가) 이 고객의 요구에 주는 효과 한 가지의 이름(2~5단어, 수치 없이)" for k, it in enumerate(items) if f'tt{k}' in T},
                                 **{str(T[f'ln{k}']): f"그 효과를 ‘{name(it)}’ 의 자료에 있는 기능으로 한 문장(수치 없이 — 숫자를 지어내지 않습니다)" for k, it in enumerate(items) if f'ln{k}' in T},
                                 **({str(T['title']): '이 제안으로 고객에게 달라지는 것 세 가지를 한 줄로(수치 없이)'} if 'title' in T else {})},
                       'row': {'label': '기대 효과 세 가지', 'lock': True}, 'adapt': ['전후 수치가 없어 가치 세 가지 장으로 구성']})
            part.setdefault('notes', []).append('전후 비교 수치 장 대신 가치 세 가지 장 — 도입 전후 수치는 고객 자료에 없음')
            return sl
        if f_alt == 'L_TOC_UAPAIN':
            sl = _mk(sample_slide(ctx, f_alt, '고객 과제 — 사진 3 + 과제 3', {'eb': eb}))
            sl.update({'from': None, 'bind_same': False, 'src_x': x, 'alt_of': x['f'], 'row': {'label': '고객 과제', 'lock': True},
                       'notes': {**{str(T[f'pt{k}']): '이 고객이 요구사항에서 말한 과제 하나의 이름(2~5단어)' for k in range(3) if f'pt{k}' in T},
                                 **{str(T[f'pl{k}']): '그 과제가 지금 현장에서 어떻게 나타나는지 한 문장(요구사항에 있는 사실만, 수치 없이)' for k in range(3) if f'pl{k}' in T}},
                       'adapt': ['현황 수치가 없어 고객 과제 장으로 구성']})
            part.setdefault('notes', []).append('고객사 현황 지표 장 대신 고객 과제 장 — 요구사항에 현황 수치가 없음')
            return sl
    return None


def _profile_rows(ctx: dict, sl: dict) -> None:
    """고객사 현황 지표 (L_TOC_UAPROF): each figure row is one figure the customer stated (number and unit set here, the label written
    for it); a row without a stated figure is left out — never a placeholder, never the template's '하루 이용객 [00] 명'."""
    TS = (load().get('toc_slots') or {}).get(sl['f']) or {}
    T, I = TS.get('t') or {}, TS.get('img') or {}
    facts = profile_facts(ctx)
    lock, notes, icons, hide = dict(sl.get('lock') or {}), dict(sl.get('notes') or {}), dict(sl.get('icons') or {}), list(sl.get('hide_img') or [])
    k = 0
    while f'vl{k}' in T:
        f = facts[k] if k < len(facts) else None
        if f:
            lock[str(T[f'vl{k}'])] = f['raw']
            if f'un{k}' in T:
                lock[str(T[f'un{k}'])] = f['unit']
            if f'lb{k}' in T:
                notes[str(T[f'lb{k}'])] = (f"이 줄의 숫자는 ‘{f['raw']}{f['unit']}’ 로 정해져 있습니다(고객이 쓴 말: “{f['text']}”) — 그 숫자가 가리키는 항목 이름만 짧게 씁니다"
                                         '(예: 객실 수 · 운영 매장 · 영업 연수)')
            if f'ic{k}' in I:
                icons[str(I[f'ic{k}'])] = '/assets/toc/icons/' + next((ic for units, ic in _UNIT_ICON if f['unit'] in units), 'ui-chart2') + '.png'
        else:
            for n in (f'lb{k}', f'vl{k}', f'un{k}'):
                if n in T:
                    lock[str(T[n])] = ''
            if f'ic{k}' in I:
                hide.append(str(I[f'ic{k}']))
        k += 1
    sl.update(lock=lock, notes=notes, icons=icons, hide_img=hide, profile=[f['raw'] + f['unit'] for f in facts])


def compose_part(ctx: dict, part: dict, pp: dict, reg: Registry, reserved: Sequence[str] = ()) -> List[dict]:
    """the template slides of the part, adapted to what the plan assigned to it (pure code)."""
    lib = load()
    L = lib['layouts']
    SOL = lib.get('sol_layouts') or {}
    spaces = [ctx['space_by_id'][s] for s in pp.get('spaces') or [] if s in ctx['space_by_id']]
    sols = pp.get('solutions_own') or pp.get('solutions') or []
    cases = pp.get('cases_own') or pp.get('cases') or []
    ex = part['exemplar']
    out: List[dict] = []
    did = {'space': False, 'solution': False, 'case': False}
    dropped: List[dict] = []
    rep_used: Set[str] = set()
    seen_p: Dict[str, str] = {}  # product → the first space whose sheet showed it
    ex_spaces = [x for x in ex if x['f'] == 'L_VS_SPACE']
    ex_sols = [x for x in ex if slide_kind(x['f']) == 'solution']
    ex_cases = [x for x in ex if x['f'] == 'L_VS_CASE']
    ex_cores = sorted((x for x in ex if x['f'].startswith('L_VS_CORE_')), key=lambda x: x['f'])
    core_cols = None
    if ex_cores and ctx.get('plan_points') and (ctx['products'] or ctx['solutions']):
        core_cols, problem_ = need_columns(ctx['plan_points'], pp)
        if problem_:
            core_cols = None  # a part that only states the customer's problem names no item anyway
    for x in ex:
        f = x['f']
        kind = slide_kind(f)
        if kind == 'unknown':
            out.append({**_mk(x), 'kind': 'unknown', 'keep': True, 'adapt': ['unknown layout — template slide kept as is']})
            continue
        if kind == 'space':
            if did['space']:
                continue
            did['space'] = True
            if not spaces:
                out += [_mk(e, bind={'kind': 'space'}) for e in ex_spaces]
                continue
            # 공간마다 한 장(사용자 지시 2026-11-17) — 장 수 = 제품이 놓인 공간 수, 장 안의 제품 = 조감도에서 그 공간에 놓인 제품 전부.
            # 같은 제품이 여러 공간에 놓여도 공간마다 그 공간의 장이 있다(제품 컷은 같은 그림을 다시 써도 된다 — 사진 중복 규칙의 예외).
            for n, sp in enumerate(spaces):
                if not sp['products']:
                    # a space without a linked product has no product to show (it stays in the 조감도 legend · Map)
                    part.setdefault('notes', []).append(f"공간별 제품 장 — 제품을 놓지 않은 공간({sp['name']})은 조감도 · Map 에만 둠")
                    continue
                prods = list(dict.fromkeys(sp['products']))
                if len(prods) > SPACE_P_MAX:
                    part.setdefault('notes', []).append(f"공간별 제품 장 — {sp['name']}: 제품 {len(prods)}개 중 앞의 {SPACE_P_MAX}개만 한 장에 놓음")
                    prods = prods[:SPACE_P_MAX]
                rep = prods[0]
                rep_used.add(rep)
                ref = max(ex_spaces, key=lambda e: overlap(plain(e['t'].get('1')), sp['name']))
                score = overlap(plain(ref['t'].get('1')), sp['name'])
                note = []
                if score < 0.5:
                    lx = _lib_exemplar('L_VS_SPACE', ctx['ind'], lambda e: overlap(plain(e['t'].get('1')), sp['name']) >= 0.8)
                    if lx:
                        ref = _with_chrome(lx, 'L_VS_SPACE', ref, lx.get('role') or '')
                        note.append('space slide from the standard deck of this space')
                        score = 1.0
                pname = (lib['products_all'].get(rep) or {}).get('name') or ''
                ex_prod = plain(ref['t'].get('4'))
                # the template slide shows the same product only when it names it (or carries that product's own cut) — a library
                # tag that merely lists the product next to another one's picture is not the same product
                same_p = bool(ex_prod) and (ex_prod in pname or pname in ex_prod or is_cut_of(ref['img'].get('0'), rep))
                sl = _mk(ref, bind={'kind': 'space', 'space': sp['id'], 'product': rep, 'products': prods})
                sl['role'] = f"{sp['name']} — {_short(pname)}"
                sl['bind_same'] = score >= 0.5 and same_p
                sl['same_space'] = score >= 0.5
                sl['same_product'] = same_p
                sl['counter'] = len([o for o in out if o['kind'] == 'space']) + 1
                sl['adapt'] = note + ([] if sl['bind_same'] else [f"space “{sp['name']}” · product {rep}"])
                sl['row'] = {'label': '공간별 대표 제품', 'lock': True}
                if len(prods) > 1 and f'L_VS_SPACE_P{len(prods)}' in L:
                    # the space's products all on its one sheet: the template slide's space photo stays the reference for the photo frame
                    # (the last picture slot), every cut frame shows its own product (bound by the plan), every line is written anew
                    k_ = len(prods)
                    photo = (ref.get('img') or {}).get('1')
                    _resize(sl, f'L_VS_SPACE_P{k_}', f'{k_} products in “{sp["name"]}”')
                    sl['ex_img'] = {str(k_): photo} if photo else {}
                    sl['img_bind'] = {str(j): {'product': q} for j, q in enumerate(prods)}
                    sl['role'] = f"{sp['name']} — " + ' · '.join(_short((lib['products_all'].get(q) or {}).get('name') or q) for q in prods)
                    sl['bind_same'] = sl['same_product'] = False
                    sl['adapt'] = note + [f"space “{sp['name']}” · {k_} products"]
                    _space_p_cells(ctx, sl, ref.get('t') or {})
                # a product an earlier space's sheet already showed: its lines here say what it does in this space, not the same sentences
                pl_, nts = _space_p(sl['f']), sl.setdefault('notes', {})
                for j, q in enumerate(prods[:pl_[0]] if pl_ else prods[:1]):
                    if q not in seen_p:
                        continue
                    cells = range(3 + pl_[1] * j + 1, 3 + pl_[1] * (j + 1)) if pl_ else (5, 6, 7, 8)
                    for i in cells:
                        nts[str(i)] = ' · '.join(filter(None, [nts.get(str(i)), f"이 제품은 앞 공간({seen_p[q]}) 장에도 있습니다 — 이 공간({sp['name']})에서의 쓰임으로, 앞 장과 다른 특징 · 다른 문장으로 씁니다"]))
                for q in prods:
                    seen_p.setdefault(q, sp['name'])
                out.append(sl)
            continue
        if kind in ('scn', 'scnmap'):
            # 고객/공간 시나리오(사용자 지시 2026-11-17) — 공간마다 한 장 · 활용 맵: 장 수 · 시트는 공간 구성으로 정한다(앱 scenario_plan.js 와 같은 규칙)
            if did.get(kind):
                continue
            did[kind] = True
            if not spaces:
                out.append(_mk(x, bind={'kind': kind}))
                continue
            ids = [sp_['id'] for sp_ in spaces]
            uses_by = scn_uses(ctx)
            rows = scn_rows(ids, uses_by)
            TS_ = lambda f_: (lib.get('toc_slots') or {}).get(f_) or {}
            if kind == 'scnmap':
                for g in scn_map_groups(len(spaces)):
                    mine = _scn_cap([r for r in rows if any(i in g for i in r['spaces'])], SCN_ROWS)
                    f_new = f'L_TOC_SCN_MAP{len(g)}'
                    sl = _mk(x, bind={'kind': 'scnmap', 'spaces': [ids[i] for i in g],
                                      'rows': [{**r, 'cells': [i in r['spaces'] for i in g], 'count': sum(1 for i in r['spaces'] if i in g)} for r in mine]})
                    if f_new in L and f_new != sl['f']:
                        _resize(sl, f_new, f'{len(g)} spaces')
                        _scn_named(sl, x['f'])
                    sl['ex_img'] = {}
                    sl['bind_same'] = False
                    sl['role'] = f'활용 맵 · 공간 {len(g)}곳 × 솔루션 · 서비스 {len(mine)}'
                    sl['row'] = {'label': '솔루션 · 서비스 활용 맵', 'lock': True}
                    out.append(sl)
                if not scn_map_groups(len(spaces)):
                    part.setdefault('notes', []).append('활용 맵 — 공간이 한 곳이라 두지 않음')
                continue
            # 공간별 시나리오 — 공간 3곳씩 한 장(한 곳만 남지 않게), 솔루션 · 서비스 줄은 구분 없이 모든 장이 같다(이 장의 공간에서 쓰는 기능만 켬)
            groups = scn_set_groups(len(spaces))
            if not groups:
                part.setdefault('notes', []).append('공간별 시나리오 — 공간이 한 곳이라 두지 않음(조감도에만)')
            for k_, g in enumerate(groups):
                f_new = f'L_TOC_SCN_S{len(g)}'
                sl = _mk(x, bind={'kind': 'scn', 'space': ids[g[0]], 'spaces': [ids[i] for i in g], 'nos': [i + 1 for i in g],
                                  'rows': scn_set_rows(ctx, rows, spaces, g)})
                if f_new in L and f_new != sl['f']:
                    _resize(sl, f_new, f'{len(g)} spaces')
                    _scn_named(sl, x['f'])
                I2 = TS_(sl['f']).get('img') or {}
                T2 = TS_(sl['f']).get('t') or {}
                # 공간 사진은 공간마다(그림 단계가 그 공간 사진을 고른다) · 제품 컷은 그 공간 제품(3개까지) · 기능 아이콘은 이 장에서 정한 것(선 아이콘 + 밑줄)
                sl['ex_img'] = {}
                sl['img_bind'] = {str(I2[f'pc{j}_{q}']): {'product': p_} for j, i in enumerate(g)
                                  for q, p_ in enumerate(list(dict.fromkeys(spaces[i].get('products') or []))[:SCN_CUTS]) if f'pc{j}_{q}' in I2}
                icons: Dict[str, str] = {}
                rows_ = sl['bind']['rows']
                for r in range(SCN_USE_ROWS):
                    for q in range(SCN_USE_ICONS):
                        ii = I2.get(f'ui{r}_{q}')
                        if ii is None:
                            continue
                        ic = rows_[r]['icons'][q] if r < len(rows_) and q < len(rows_[r]['icons']) else None
                        icons[str(ii)] = f"/assets/toc/icons/{ic[0]}.line-{'on' if ic[1] else 'off'}.png" if ic else BLANK_ICON
                for j in range(SCN_PER):  # 제품이 없는 칸 · 공간이 없는 칸의 컷은 비운다
                    for q in range(SCN_CUTS):
                        ii = I2.get(f'pc{j}_{q}')
                        if ii is not None and str(ii) not in sl['img_bind']:
                            icons[str(ii)] = BLANK_ICON  # 그림 단계가 아이콘 칸으로 보게(빈 그림) — 이름 줄을 보고 다른 제품 컷을 넣지 않는다
                            sl['ex_img'][str(ii)] = {'src': BLANK_ICON, 'fit': 'contain'}
                sl['icons'] = icons
                sl['bind_same'] = False
                sl['counter'] = k_ + 1
                names_ = [spaces[i]['name'] for i in g]
                sl['role'] = f"공간별 시나리오 {k_ + 1:02d} · " + ' · '.join(names_)
                sl['row'] = {'label': '공간별 시나리오', 'lock': True}
                nts = sl.setdefault('notes', {})
                if 'title' in T2:
                    nts[str(T2['title'])] = f"이 장의 공간 {len(g)}곳({' → '.join(names_)})을 잇는 흐름을 한 줄로"
                # 공간마다 시나리오(3차 지시: "어느 공간에서 뭘 하는지, 이 흐름을 자연스러운 → 로 연결") — 공간 사이 화살표는 장에 그려져 있다
                for j, i in enumerate(g):
                    if f'sc{j}' not in T2:
                        continue
                    prods_ = ', '.join(_short((lib['products_all'].get(q) or {}).get('name') or q) for q in spaces[i].get('products') or []) or '없음'
                    here_ = ', '.join(u['name'] for u in uses_by.get(ids[i]) or []) or '없음'
                    prev_ = f"앞 공간 “{names_[j - 1]}”에서 이어지고, " if j else ''
                    next_ = f"다음 공간 “{names_[j + 1]}”으로 넘어가게 — " if j + 1 < len(g) else ''
                    nts[str(T2[f'sc{j}'])] = (f"공간 {i + 1} “{names_[j]}”의 시나리오 — 이 공간에서 고객 · 직원이 무엇을 하는지 1–2문장으로. {prev_}{next_}"
                                              f"놓인 제품({prods_})과 이 공간에서 쓰는 솔루션 · 서비스({here_})가 하는 일로 씁니다(자료에 있는 사실만, 3줄 안)")
                out.append(sl)
            continue
        if kind == 'solution':
            # a solution slide stands only for a solution this customer linked (and this part was given) — the template's own
            # related solutions are not carried over
            sid = SOL.get(f)
            if sid in sols and not any(o['bind'].get('solution') == sid and o['kind'] == 'solution' for o in out):
                sl = _mk(x, bind={'kind': 'solution', 'solution': sid})
                sl['row'] = {'label': ctx['short'].get(sid) or sid, 'lock': True}
                out.append(sl)
            else:
                dropped.append(x)
                part.setdefault('notes', []).append(f"솔루션 장 제외 — 연결하지 않은 솔루션({L[f]['name'].split(' · ')[0]})")
            last = x is ex_sols[-1]
            if last:  # assigned solutions the template had no slide for → the layout of that solution, filled from a standard deck
                have = {o['bind'].get('solution') for o in out if o['kind'] == 'solution'}
                for sid2 in sols:
                    if sid2 in have:
                        continue
                    lay = next((lf for lf, s2 in SOL.items() if s2 == sid2 and lf not in reg and not L[lf].get('retired')), None)
                    lx = _lib_exemplar(lay, ctx['ind']) if lay else None
                    if not lay or not lx:
                        continue
                    if lay in reserved:
                        continue
                    sl = _mk(_with_chrome(lx, lay, ex_sols[0], f"{ctx['short'].get(sid2) or sid2} — 기능 · 적용 공간 · 대표 장면"), bind={'kind': 'solution', 'solution': sid2})
                    sl['from'] = None
                    sl['bind_same'] = True  # the layout's own solution content (facts) — only the customer-facing slots are rewritten
                    sl['foreign'] = True     # authored for another vertical's deck: scene pictures are re-checked
                    sl['adapt'] = [f'added for solution {sid2}']
                    sl['row'] = {'label': ctx['short'].get(sid2) or sid2, 'lock': True}
                    reg.add(lay)
                    have.add(sid2)
                    out.append(sl)
            continue
        if kind == 'case':
            if did['case']:
                continue
            did['case'] = True
            if not cases:
                # no case linked: a template case stays only when it is from this customer's industry or shows a linked product
                kept = []
                for e in ex_cases:
                    cid = case_of(plain(e['t'].get('1')))
                    if cid is None or case_fits(ctx, cid, ' '.join(plain(v) for v in e['t'].values())):
                        kept.append((cid, e))
                    else:
                        part.setdefault('notes', []).append(f"사례 장 제외 — 연결하지 않았고 이 고객 업종 · 제품과 무관한 사례({plain(e['t'].get('1'))})")
                if not kept:
                    kept = [(cid, _with_chrome(e, 'L_VS_CASE', ex_cases[0], '도입사례 · ' + plain(e['t'].get('1')))) for cid, e in fallback_cases(ctx)]
                    if kept:
                        part.setdefault('notes', []).append('연결한 사례가 없어 같은 업종 · 같은 제품의 공식 사례로 채움')
                for cid, e in kept:
                    out.append(_mk(e, bind={'kind': 'case', **({'case': cid} if cid else {})}, row={'label': plain(e['t'].get('1')), 'lock': True}))
                if not kept:
                    dropped += ex_cases
                continue
            for cid in cases:
                cust = str((lib['cases'].get(cid) or {}).get('cust') or '')
                hit = next((e for e in ex_cases if cust and (plain(e['t'].get('1')) == cust or cust in plain(e['t'].get('1')) or plain(e['t'].get('1')) in cust and len(plain(e['t'].get('1'))) >= 3)), None)
                if hit:
                    sl = _mk(hit, bind={'kind': 'case', 'case': cid})
                else:
                    lx = _lib_exemplar('L_VS_CASE', ctx['ind'], lambda e: plain(e['t'].get('1')) == cust or (cust and cust in plain(e['t'].get('1'))))
                    base_ref = ex_cases[0]
                    built = None if lx else case_sheet(cid, base_ref)
                    if lx:
                        sl = _mk(_with_chrome(lx, 'L_VS_CASE', base_ref, '도입사례 · ' + cust), bind={'kind': 'case', 'case': cid})
                        sl['adapt'] = [f'case {cid} from the standard deck slide of this case']
                    elif built:
                        sl = _mk(built, bind={'kind': 'case', 'case': cid})
                        sl['from'] = None
                        sl['adapt'] = [f'case {cid} sheet built from the catalog record (no authored sheet)']
                    else:
                        continue
                sl['row'] = {'label': cust, 'lock': True}
                out.append(sl)
            continue
        if f == 'L_TOC_KPI' or (f == 'L_TOC_UAPROF' and len(profile_facts(ctx)) < 2):
            # before/after figures nobody measured yet · a customer profile the requirement gives no figures for: the sheet that says
            # the same without numbers (placeholders are never left on a proposal — composer/placeholders.py)
            alt = _alt_sheet(ctx, part, pp, x, reg, reserved, out)
            if alt is not None:
                out.append(alt)
                continue
            if f == 'L_TOC_UAPROF' and any(e is not x and not DIV.match(e['f']) and slide_kind(e['f']) != 'toc' for e in ex):
                # (the part's other sheets carry it; a part that is this sheet alone keeps it with the figure rows left out)
                part.setdefault('notes', []).append('고객사 현황 지표 장 제외 — 요구사항에 현황 수치가 없음')
                continue
        sl = _mk(x)
        if f == 'L_TOC_UAPROF':
            _profile_rows(ctx, sl)
        if kind == 'bird':
            n = len(spaces)
            if n:
                # the legend has exactly one row per planned space (S1 · S2 exist since 2026-11-17 — no empty numbered rows)
                tgt = next((t_ for m_ in range(max(1, min(10, n)), 11) if (t_ := _sibling(f, m_))), None)
                if tgt and tgt != f:
                    _resize(sl, tgt, f'{n} spaces')
                sl['bind'] = {'kind': 'bird', 'spaces': [s['id'] for s in spaces]}
                sl['bind_same'] = False
                sl['row'] = {'label': ('건물 조감도' if '_B' in sl['f'][-4:] else '공간 조감도') + f' · {n}개 공간', 'lock': True}
        elif kind == 'map':
            rows = [s for s in spaces if s['products']]
            n = len(rows)
            if n == 1:
                # one space: its sheet already shows the space with its products — a one-card Map says nothing more (사용자 규칙 2026-11-16)
                part.setdefault('notes', []).append('Map 장 제외 — 제품을 놓은 공간이 한 곳')
                continue
            if n:
                tgt = next((t_ for m_ in range(max(2, min(10, n)), 11) if (t_ := _sibling(f, m_))), None)  # one card per space (L_VS_MAP_2 since 2026-11-17)
                if tgt and tgt != f:
                    _resize(sl, tgt, f'{n} spaces')
                sl['bind'] = {'kind': 'map', 'spaces': [s['id'] for s in rows], 'products': [s['products'][0] for s in rows]}
                sl['bind_same'] = False
        elif kind == 'bom':
            n = len(spaces)
            if n:
                tgt = _sibling(f, max(3, min(8, n)))
                if tgt and tgt != f:
                    _resize(sl, tgt, f'{n} spaces')
                sl['bind'] = {'kind': 'bom', 'spaces': [s['id'] for s in spaces], 'products': (pp.get('products') or [])[:5]}
                sl['bind_same'] = False
        elif kind == 'tech':
            tsol = list(pp.get('solutions') or ctx['solutions'])[:4]
            tprod = list(pp.get('products') or ctx['products'])[:4]
            if len(tsol) == 1 and ctx['solutions'] and len(ctx['solutions']) > 1:
                tsol = list(ctx['solutions'])[:4]
            if len(tsol) >= 2 or (len(tsol) == 1 and not tprod):
                tgt = _sibling(f, max(2, min(4, len(tsol))))
                if tgt and tgt != f:
                    _resize(sl, tgt, f'{len(tsol)} solutions')
                sl['bind'] = {'kind': 'tech', 'solutions': tsol}
                sl['bind_same'] = False
            elif len(tsol) == 1:  # one solution: its column, and the linked products as the other column(s)
                items = [('s', tsol[0])] + [('p', q) for q in tprod[:3]]
                tgt = _sibling(f, max(2, min(4, len(items))))
                if tgt and tgt != f:
                    _resize(sl, tgt, f'{len(items)} columns')
                sl['bind'] = {'kind': 'tech', 'solutions': tsol, 'products': [q for k, q in items if k == 'p'], 'columns': items}
                sl['bind_same'] = False
            elif len(tprod) >= 2:  # no solution linked: the page shows the linked products instead of the template's solutions
                tgt = _sibling(f, max(2, min(4, len(tprod))))
                if tgt and tgt != f:
                    _resize(sl, tgt, f'{len(tprod)} products')
                sl['bind'] = {'kind': 'tech', 'solutions': [], 'products': tprod, 'columns': [('p', q) for q in tprod]}
                sl['bind_same'] = False
                sl['adapt'].append('no solution linked — product-centred')
            else:
                dropped.append(x)
                part.setdefault('notes', []).append('핵심 기술 장 제외 — 연결한 솔루션이 없음')
                continue
        elif kind in ('spec', 'dss'):
            if fixed_part(part) or fixed_sheet(f):
                # a content-fixed page (제안 개요's DSS page is the industry deck's own — user instruction 2026-11-17): nothing is bound,
                # the template's devices · solutions · services stay as authored
                sl['bind'] = {'kind': kind}
            elif pp.get('products') or ctx['products']:
                # a spec sheet compares the linked products: the part's own first, then the other linked ones (a column per product)
                prods = list(dict.fromkeys(list(pp.get('products') or []) + list(ctx['products']))) if kind == 'spec' else (pp.get('products') or ctx['products'])
                sl['bind'] = {'kind': kind, 'products': prods[:5], 'solutions': (pp.get('solutions') or ctx['solutions'])[:5]}
                sl['bind_same'] = False
        elif kind == 'journey':
            # a 여정 장 is built on one or two solutions (name + feature icons): it stays only with a solution this customer linked;
            # a two-solution page with one linked solution becomes its one-solution variant
            blocks = journey_blocks(ctx, x)
            linked_b = [b for b in blocks if b['linked']]
            rebound = None
            if blocks and len(linked_b) < len(blocks) and ctx['solutions']:
                # the page stands on the template vertical's usual solutions: the solutions this customer selected take the blocks
                x2 = journey_rebind(ctx, x, blocks, pp)
                if x2:
                    x, rebound = x2, x2['rebound']
                    sl = _mk(x)
                    blocks = journey_blocks(ctx, x)
                    linked_b = [b for b in blocks if b['linked']]
                    sl['adapt'].append('solution block → ' + ', '.join(ctx['short'].get(r['solution']) or r['solution'] for r in rebound))
            if blocks and not linked_b:
                dropped.append(x)
                part.setdefault('notes', []).append(f"여정 장 제외 — 연결하지 않은 솔루션({', '.join(b['name'] for b in blocks if b['name'])}) 기준의 장")
                continue
            if blocks and len(linked_b) < len(blocks):
                x1 = journey_single(x, linked_b[0]['k'])
                if x1:
                    keep_adapt = sl['adapt'] if rebound else []
                    sl = _mk(x1)
                    sl['src_x'] = x
                    sl['adapt'] = keep_adapt + [f"one-solution variant — {linked_b[0]['name']} only"]
                    f = sl['f']
            if rebound:
                sl['journey_sols'] = rebound
                sl['bind_same'] = False
                TSj = ((lib.get('toc_slots') or {}).get(sl['f']) or {}).get('t') or {}
                sl['keep_t'] = {str(TSj[nm]): plain(sl['ex_t'][str(TSj[nm])]) for nm in ('sa0', 'sa1') if nm in TSj and str(TSj[nm]) in sl['ex_t']}
            if spaces:
                m = max(1, sum(1 for im in L[f]['images'] if im.get('kind') == 'space'))
                j = sum(1 for o in out if o['kind'] == 'journey')
                win = [spaces[(j * m + q) % len(spaces)] for q in range(min(m, len(spaces)))]
                sl['bind'] = {'kind': 'journey', 'space': win[0]['id'], 'spaces': [s['id'] for s in win], 'products': pp.get('products') or [],
                              'solutions': pp.get('solutions') or []}
                sl['bind_same'] = False
        elif kind in ('static', 'divider', 'toc', 'cover'):
            sl['bind'] = {'kind': kind}
        else:
            if f.startswith('L_VS_CORE_') and core_cols is not None:
                # 핵심 제안 1 · 2 · 3 each unfold one column of the 니즈 장: a column whose requirement no selected product · solution
                # answers has nothing to stand on — the page is left out (it would only repeat the template's unselected products)
                k = ex_cores.index(x)
                pts_ = {p_['id']: p_ for p_ in ctx.get('plan_points') or []}
                items = [q for r in (core_cols[k] if k < len(core_cols) else []) for q in (pts_[r].get('products') or []) + (pts_[r].get('solutions') or [])]
                if k < len(core_cols) and not items:
                    dropped.append(x)
                    part.setdefault('notes', []).append(f"핵심 제안 장 제외 — 이 니즈에 답하는 선택 제품 · 솔루션이 없음({(x.get('role') or '').split(' — ')[0][:24]})")
                    continue
                sl['col'] = k
            sl['bind'] = {'kind': 'generic', 'products': pp.get('products') or []}
            sl['bind_same'] = False
        out.append(sl)
    # sheets were dropped (unlinked solutions · unrelated cases) and the part has nothing left to show: it stays product-centred —
    # one product sheet per planned space, else one per linked product. (A case part with no fitting case stays empty.)
    content = [sl for sl in out if sl['kind'] not in ('divider', 'toc', 'bird')]
    if dropped and not content and not ex_cases:
        prods = list(pp.get('products') or ctx['products'])
        added = 0
        for sp in [s_ for s_ in spaces if s_['products']][:4]:
            lx = _lib_exemplar('L_VS_SPACE', ctx['ind'], lambda e: overlap(plain(e['t'].get('1')), sp['name']) >= 0.8) or _lib_exemplar('L_VS_SPACE', ctx['ind'])
            if not lx:
                break
            rep_p = next((q for q in sp['products'] if q not in rep_used), sp['products'][0])
            rep_used.add(rep_p)
            sl = _mk(_with_chrome(lx, 'L_VS_SPACE', dropped[0], ''), bind={'kind': 'space', 'space': sp['id'], 'product': rep_p, 'products': sp['products']})
            pname = (lib['products_all'].get(rep_p) or {}).get('name') or ''
            sl.update({'from': None, 'role': f"{sp['name']} — {_short(pname)}", 'bind_same': False, 'same_space': overlap(plain(lx['t'].get('1')), sp['name']) >= 0.5,
                       'same_product': False, 'counter': added + 1, 'adapt': ['product sheet in place of the dropped solution sheets'],
                       'row': {'label': '공간별 대표 제품', 'lock': True}})
            out.append(sl)
            added += 1
        if not added and 'L_TOC_PFEAT' in L:
            for n, q in enumerate(prods[:3]):
                pname = _short((lib['products_all'].get(q) or {}).get('name') or '')
                sl = _mk(sample_slide(ctx, 'L_TOC_PFEAT', f'{pname} — 제품 사진 + 가치 한 줄', {'eb': f'00 · {part["name"]} · {n + 1:02d}', 'no': f'{n + 1:02d}', 'kick': '대표 제품',
                                                                                                'src': '제품 · ' + pname}))
                sl.update({'from': None, 'kind': 'product', 'bind': {'kind': 'product', 'product': q, 'products': [q]}, 'bind_same': False, 'counter': n + 1,
                           'lock': {str(k): v for k, v in sl['ex_t'].items() if k in ('2', '3', '5')}, 'adapt': ['product sheet in place of the dropped solution sheets'],
                           'row': {'label': pname, 'lock': True}})
                out.append(sl)
                added += 1
        if added:
            part.setdefault('notes', []).append(f'연결한 솔루션이 없어 제품 장 {added}개로 구성')
        elif not ctx['products']:  # nothing linked at all: the template's sheets stay as they are
            out += [_mk(x) for x in dropped]
    if dropped and ex_cases and not any(sl['kind'] == 'case' for sl in out):
        part.setdefault('notes', []).append('연결한 사례가 없고 이 고객 업종 · 제품에 맞는 사례도 없어 사례 파트를 비움')
        return []
    # the journeys walk the planned spaces once, in order: a page takes the next spaces, a page with fewer spaces left becomes its
    # smaller sibling, and a page that would only repeat spaces an earlier journey already showed is left out
    pos = 0
    for sl in [o for o in out if o['kind'] == 'journey']:
        if not spaces:
            break
        m = max(1, sum(1 for im in L[sl['f']]['images'] if im.get('kind') == 'space'))
        rest = spaces[pos:]
        if not rest and pos:
            out.remove(sl)
            part.setdefault('notes', []).append('여정 장 제외 — 계획한 공간을 앞의 여정 장이 모두 다룸')
            continue
        if len(rest) < m:
            x2 = journey_stages({'f': sl['f'], 't': sl['ex_t'], 'img': sl['ex_img']}, len(rest))
            if x2:
                keep_names = {v: k for k, v in (sl.get('keep_t') or {}).items()}
                sl['f'], sl['ex_t'], sl['ex_img'] = x2['f'], x2['t'], x2['img']
                sl['adapt'].append(f'{len(rest)} spaces')
                if sl.get('keep_t'):
                    TSj = ((lib.get('toc_slots') or {}).get(sl['f']) or {}).get('t') or {}
                    sl['keep_t'] = {str(TSj[nm]): plain(sl['ex_t'][str(TSj[nm])]) for nm in ('sa0', 'sa1') if nm in TSj and str(TSj[nm]) in sl['ex_t']}
                m = len(rest)
        win = rest[:m]
        pos += len(win)
        sl['bind'].update({'kind': 'journey', 'space': win[0]['id'], 'spaces': [x['id'] for x in win], 'products': sl['bind'].get('products') or pp.get('products') or [],
                           'solutions': sl['bind'].get('solutions') or pp.get('solutions') or []})
        sl['bind_same'] = False
    # one-per-deck layouts: a layout another part already took is dropped here (the part keeps its other slides)
    final = []
    for sl in out:
        f = sl['f']
        if sl['kind'] in ('divider',) or REPEATABLE.match(f) or sl.get('keep') or sl.get('foreign'):
            final.append(sl)
            continue
        if reg.claim(f):
            final.append(sl)
        else:
            part.setdefault('notes', []).append(f'{f}: 덱에 이미 있는 레이아웃이라 이 파트에서는 뺌')
    if not final and out:
        final = out[:1]
    # fixed content: every page of Why Samsung, the company pages wherever they stand, and every 도입사례 sheet (which case is shown
    # is chosen — what the sheet says and shows is the case's own authored sheet)
    whole = fixed_part(part)
    for sl in final:
        # (a 목차 page standing in a fixed part — older decks keep it in 개요 — still lists this deck's parts: not frozen)
        if (whole and sl['kind'] not in ('toc', 'cover')) or sl['kind'] in ('static', 'case') or fixed_sheet(sl['f']):
            sl['fixed'] = True
            sl['bind_same'] = True
    return final


# ================================================================================================ numbering · locks
def _rows_from_divider(div: dict, n_after: int) -> List[Optional[str]]:
    """the template divider's rows (label · page range) → a row label per following slide."""
    t = div['ex_t']
    m = DIV.match(div['from'] or div['f'])
    rows = []
    for r in range(int(m.group(1)) if m else 0):
        lb, pg = plain(t.get(str(6 + 3 * r))), plain(t.get(str(7 + 3 * r)))
        mm = re.fullmatch(r'(\d+)(?:[–-](\d+))?', pg)
        if lb and mm:
            rows.append((lb, int(mm.group(1)), int(mm.group(2) or mm.group(1))))
    if not rows:
        return [None] * n_after
    first = rows[0][1]
    out = []
    for j in range(n_after):
        pg = first + j
        out.append(next((lb for lb, a, b in rows if a <= pg <= b), None))
    return out


def number_deck(ctx: dict, plan: dict, slides_by: Dict[str, List[dict]]) -> None:
    """page numbers, chapter numbers, 간지 rows and 목차 lines — the slots code owns (``lock``)."""
    lib = load()
    L = lib['layouts']
    fixed = {f['id']: f for f in ctx['fixed']}
    req = {p['id']: p for p in ctx['parts']}
    order = [i for i in ctx['order_ids'] if i in req or i in fixed]
    for i in req:
        if i not in order:
            order.append(i)
    deck_ids = [i for i in order if (req.get(i) or fixed.get(i) or {}).get('deck')]
    body_ids = [i for i in order if i not in deck_ids]
    names = {i: (req[i]['name'] if i in req else fixed[i]['name']) for i in body_ids}
    total = len(body_ids)
    page = 1
    pages: Dict[str, tuple] = {}
    for i in deck_ids + body_ids:
        n = len(slides_by[i]) if i in slides_by else (fixed.get(i) or {}).get('n', 0)
        pages[i] = (page, page + max(0, n - 1))
        page += n
    msg = {p['id']: p['message'] for p in plan['parts']}
    ctx['outline'] = [{'no': k + 1, 'id': i, 'name': names[i], 'message': msg.get(i) or '', 'pages': pages[i]} for k, i in enumerate(body_ids)]
    for pid, slides in slides_by.items():
        part = req[pid]
        no = body_ids.index(pid) + 1 if pid in body_ids else 0
        start = pages[pid][0]
        # row labels for the slides after the divider
        div = next((s for s in slides if s['kind'] == 'divider'), None)
        if div is not None:
            after = [s for s in slides if s is not div and s['kind'] != 'toc']
            src_rows = _rows_from_divider(div, len([x for x in part['exemplar'] if not DIV.match(x['f']) and slide_kind(x['f']) != 'toc']))
            ex_order = [x for x in part['exemplar'] if not DIV.match(x['f']) and slide_kind(x['f']) != 'toc']
            for s in after:
                if s.get('row'):
                    continue
                j = next((n for n, x in enumerate(ex_order) if x is s.get('src_x')), None)
                lb = None
                if j is not None and j < len(src_rows):
                    lb = src_rows[j]
                s['row'] = {'label': lb or s['role'].split(' — ')[0][:24] or s['f'], 'lock': s['kind'] == 'static', 'ref': lb, 'join': lb is None and j is not None}
            rows: List[dict] = []
            for s in after:
                pg = start + slides.index(s)
                if rows and (rows[-1]['label'] == s['row']['label'] or s['row'].get('join')):
                    rows[-1]['to'] = pg
                else:
                    rows.append({'label': s['row']['label'], 'lock': s['row'].get('lock', False), 'from': pg, 'to': pg})
            if len(rows) > 6:  # the divider holds six rows: neighbours are paired
                merged = []
                per = math.ceil(len(rows) / 6)
                for a in range(0, len(rows), per):
                    grp = rows[a:a + per]
                    merged.append({'label': ' · '.join(dict.fromkeys(g['label'] for g in grp))[:40], 'lock': all(g['lock'] for g in grp), 'from': grp[0]['from'], 'to': grp[-1]['to']})
                rows = merged
            rows = rows or [{'label': part['name'], 'lock': True, 'from': start + 1, 'to': start + 1}]
            tgt = _sibling(div['f'], len(rows)) or div['f']
            n_rows = int(DIV.match(tgt).group(1))
            rows = rows[:n_rows]
            lock = {'0': plain(div['ex_t'].get('0')) or '고객사 로고', '1': f'{no:02d} / {total:02d}', '2': part['name'], '4': plain(div['ex_t'].get('4')) or '이 장에서 다루는 것'}
            edit = {'3': plain(div['ex_t'].get('3'))}
            for r, row in enumerate(rows):
                lock[str(5 + 3 * r)] = f'{r + 1:02d}'
                lock[str(7 + 3 * r)] = str(row['from']) if row['from'] == row['to'] else f"{row['from']}–{row['to']}"
                if row['lock']:
                    lock[str(6 + 3 * r)] = row['label']
                else:
                    edit[str(6 + 3 * r)] = row['label']
            lock[str(5 + 3 * n_rows)] = f"CONFIDENTIAL · {start + slides.index(div)}"
            if tgt != div['f']:
                div['adapt'].append(f'{n_rows} rows')
            div['f'] = tgt
            div['lock'], div['edit_ref'], div['ex_t'] = lock, edit, {}
        for s in slides:
            pg = start + slides.index(s)
            if s['kind'] == 'divider' or s.get('keep'):
                continue
            lock: Dict[str, str] = dict(s.get('lock') or {})
            f = s['f']
            modes = (L[f].get('modes') or {}).get('t') or {}
            idx = {str(t['i']) for t in L[f]['texts']}
            for k, v in s['ex_t'].items():
                pv = plain(v)
                if k not in idx:  # the footer block
                    lock[k] = f'CONFIDENTIAL · {pg}' if CONF.match(pv) else scrub_names(ctx, pv)
            # the chapter eyebrow: 'NN · part name[ · counter | sub-title]'
            e = plain(s['ex_t'].get('0'))
            m = EYEBROW.match(e)
            if m and no and modes.get('0') in ('section', None) and '0' in idx:
                tail = _eyebrow_tail(m.group(2), part['name'])
                head = part['name'].upper() if re.fullmatch(r'[A-Z0-9 &·]+', m.group(2).split(' · ')[0]) else part['name']
                if tail and re.fullmatch(r'\d{2}', tail[-1]):
                    tail[-1] = f"{s.get('counter') or sum(1 for o in slides[:slides.index(s) + 1] if o['kind'] == s['kind']):02d}"
                    lock['0'] = ' · '.join([f'{no:02d}', head] + tail)
                elif tail and f.startswith('L_VS_CORE_'):
                    s.setdefault('prefix', {})['0'] = f'{no:02d} · {head} · '
                else:
                    lock['0'] = ' · '.join([f'{no:02d}', head] + tail)
            for tt in L[f]['texts']:  # the deck-name line at the foot: this deck's — the same on every sheet, never left to the writer
                if _is_footer(tt) and s['kind'] != 'cover' and ctx.get('footer_new'):
                    lock[str(tt['i'])] = ctx['footer_new']
            if s['kind'] == 'toc':
                lock.update(_toc_lock(ctx, s))
            elif s['kind'] == 'cover':
                lock.update(_cover_lock(ctx, s))
            elif s['kind'] == 'space' and s['bind'].get('space'):
                sp = ctx['space_by_id'][s['bind']['space']]
                lock['1'] = sp['name']
                pl = _space_p(f)
                if pl:  # one card per product of the space, in the space plan's order — the name cell of card j
                    for j, q in enumerate((s['bind'].get('products') or [])[:pl[0]]):
                        lock[str(3 + pl[1] * j)] = _short(lib['products_all'][q].get('name') or '')
                else:
                    lock['4'] = _short(lib['products_all'][s['bind']['product']].get('name') or '')
            elif s['kind'] == 'journey' and s['bind'].get('spaces'):
                # the name under each space photo = the planned space of that photo (text and picture then agree by construction)
                photos = [im for im in L[f]['images'] if im.get('kind') == 'space']
                names_ = ((lib.get('toc_slots') or {}).get(f) or {}).get('t') or {}
                for n, im in enumerate(photos[:len(s['bind']['spaces'])]):
                    if f'st{n}' in names_:
                        slot_i = names_[f'st{n}']
                    else:
                        cap = next((x for x in near_slots(f, im, 4) if 2 < len(plain(s['ex_t'].get(str(x['i'])))) <= 24
                                    and not re.fullmatch(r'[\d\s/·.]+', plain(s['ex_t'].get(str(x['i']))))), None)
                        slot_i = cap['i'] if cap is not None else None
                    if slot_i is not None and str(slot_i) not in lock:
                        lock[str(slot_i)] = ctx['space_by_id'][s['bind']['spaces'][n]]['name']
            elif s['kind'] == 'case' and s['bind'].get('case') and not s['bind_same']:
                lock['1'] = str(lib['cases'][s['bind']['case']].get('cust') or '')
                lock['10'] = '원문 · samsung.com 도입사례'
            elif s['kind'] == 'scn' and s['bind'].get('spaces'):
                lock.update(_scn_lock(ctx, s))
                if isinstance(lock.get('0'), str):  # 눈썹 '04 · 파트 · 공간별 시나리오 02' — 이 장의 차례
                    lock['0'] = re.sub(r'공간별 시나리오 \d{2}$', f"공간별 시나리오 {s.get('counter') or 1:02d}", lock['0'])
            elif s['kind'] == 'scnmap' and s['bind'].get('spaces'):
                lock.update(_scnmap_lock(ctx, s))
            elif s['kind'] == 'bird' and s['bind'].get('spaces'):
                lock.update(_bird_lock(ctx, s))
            elif s['kind'] == 'map' and s['bind'].get('spaces'):
                lock.update(_map_lock(ctx, s))
            elif s['kind'] in ('bom', 'spec') and s['bind'].get('products'):
                cuts = [im for im in L[f]['images'] if im.get('kind') in ('cut', 'detail', 'kiosk', 'signage')]
                sec = sorted((int(k) for k, m in modes.items() if m == 'section' and k != '0'))
                prm = sorted((int(k) for k, m in modes.items() if m == 'product'))
                cells = sec if len(sec) == len(cuts) else prm if len(prm) == len(cuts) else []
                if s['kind'] == 'bom' and s['bind'].get('spaces'):
                    # the table's columns are the products that stand in its rows' spaces (in space order), then the part's others
                    placed = list(dict.fromkeys(p_ for x in s['bind']['spaces'] for p_ in (ctx['space_by_id'].get(x) or {}).get('products') or []))
                    s['bind']['products'] = placed + [p_ for p_ in s['bind']['products'] if p_ not in placed]
                prods = s['bind']['products'][:len(cuts)]
                s['bind']['products'] = prods
                for j, k in enumerate(cells):
                    lock[str(k)] = (ctx['short'].get(prods[j]) or prods[j]) if j < len(prods) else ''
                if s['kind'] == 'bom':
                    lock.update(_bom_lock(ctx, s, prods))
            elif s['kind'] == 'tech' and (s['bind'].get('solutions') or s['bind'].get('columns')):
                lock.update(_tech_lock(ctx, s))
            elif s['kind'] == 'dss' and s['bind'].get('products'):
                # Device · Solution · Service: the selected items in order — a cell with no selected item is empty, never the template's
                prods_, sols_ = s['bind']['products'][:5], (s['bind'].get('solutions') or [])[:5]
                for n in range(5):
                    if str(4 + n) in idx:
                        lock[str(4 + n)] = (ctx['short'].get(prods_[n]) or prods_[n]) if n < len(prods_) else ''
                    if str(10 + n) in idx:
                        lock[str(10 + n)] = (ctx['short'].get(sols_[n]) or sols_[n]) if n < len(sols_) else ''
            s['lock'] = lock


def _eyebrow_tail(rest: str, name: str) -> List[str]:
    """the sub-title segments of a chapter eyebrow ('공간별 제안 · 01' → ['01']). A part name that itself holds ' · ' ('비용 · 구매')
    is the name, not a name and a sub-title — '05 · 비용 · 구매' has no tail."""
    segs = rest.split(' · ')
    own = name.split(' · ')
    if len(own) > 1 and [x.strip().lower() for x in segs[:len(own)]] == [x.strip().lower() for x in own]:
        return segs[len(own):]
    return segs[1:]


def swap_cust(ctx: dict, v: str) -> str:
    """the template's sample customer name → this customer's, only where it stands for the customer.

    The sample names are category nouns ('비즈니스 호텔', '카페·베이커리'): 'AI 비즈니스 호텔' (the deck's own offer name), '프리미엄 비즈니스 호텔(체인)'
    (a case's description) and '비즈니스 호텔 사례' are about the category and stay; '비즈니스 호텔의 5개 공간' is about the customer."""
    a, b = ctx.get('tpl_cust') or '', ctx.get('customer') or ''
    if not a or not b or a not in v or b in v:
        return v
    pat = re.compile(r'(?<!AI )(?<!AI)' + re.escape(a) + r'(?=$|\n|\s*[,.:·—–]|의|은|는|이|가|에|와|과|도|를|을|만)')
    return pat.sub(b, v)


def scrub_names(ctx: dict, v: str) -> str:
    """the template's sample customer / deck name → this customer's."""
    if ctx['footer_old'] and ctx['footer_old'] in v:
        v = v.replace(ctx['footer_old'], ctx['footer_new'])
    return swap_cust(ctx, v)


def _toc_lock(ctx: dict, s: dict) -> Dict[str, str]:
    out: Dict[str, str] = {}
    ol = ctx['outline']
    if s['f'] == 'L_VS_TOC':
        out['2'] = f"{ctx['footer_new']} · {len(ol)}개 장"
        for i, o in enumerate(ol[:6]):
            a, b = o['pages']
            out[str(3 + 5 * i)] = f"{o['no']:02d}"
            out[str(4 + 5 * i)] = o['name']
            out[str(5 + 5 * i)] = f'p.{a}' if a == b else f'p.{a}–{b}'
            kw = _toc_keywords(ctx, o['id'])
            if kw:
                out[str(7 + 5 * i)] = kw
    else:
        for i, o in enumerate(ol[:8]):
            out[str(2 + 2 * i)] = f"{o['no']:02d}"
            out[str(3 + 2 * i)] = o['name']
    return out


def _toc_keywords(ctx: dict, pid: str) -> str:
    """the 목차 card's keyword line for a part whose content is a list the plan fixed (사례 · 솔루션 · 공간)."""
    lib = load()
    pp = (ctx.get('plan_by') or {}).get(pid)
    part = next((p for p in ctx['parts'] if p['id'] == pid), None)
    if not pp or not part:
        return ''
    def join(names: List[str], unit: str) -> str:
        names = [n for n in names if n]
        return ' · '.join(names[:3]) + (f' 외 {len(names) - 3}{unit}' if len(names) > 3 else '')
    held = (ctx.get('slides_by') or {}).get(pid) or []
    shown_cases = [plain(sl['ex_t'].get('1')) if not sl['bind'].get('case') else str(lib['cases'][sl['bind']['case']].get('cust') or '') for sl in held if sl['kind'] == 'case']
    if part['cap']['cases'] and shown_cases:
        return join(shown_cases, '곳')[:44]
    if part['cap']['cases'] and pp.get('cases'):
        return join([str(lib['cases'][c].get('cust') or '') for c in pp['cases']], '곳')[:44]
    if part['cap']['solutions'] and part['type'] == 'solution' and pp.get('solutions'):
        return join([ctx['short'].get(x) or x for x in pp['solutions']], '종')[:44]
    if part['cap']['spaces'] and pp.get('spaces'):
        return join([ctx['space_by_id'][x]['name'] for x in pp['spaces'] if x in ctx['space_by_id']], '곳')[:44]
    return ''


def _tech_lock(ctx: dict, s: dict) -> Dict[str, Any]:
    """핵심 기술 장 (L_TOC_TECH<n>): column i = name · one line · three keywords with their icons. A linked solution brings its own block
    from the content DB (the icons are *its* feature icons); a solution without a block or a product column is written by the model and
    gets neutral icons — never another solution's icon."""
    lib = load()
    TS = (lib.get('toc_slots') or {}).get(s['f']) or {}
    T, I = TS.get('t') or {}, TS.get('img') or {}
    cols = s['bind'].get('columns') or [('s', q) for q in s['bind'].get('solutions') or []]
    V = lib.get('verticals') or {}
    me = V.get(ctx.get('vertical') or '') or {}
    lock: Dict[str, Any] = {}
    icons: Dict[str, str] = {}
    free: List[int] = []
    for i, (kind, q) in enumerate(cols):
        if f'nm{i}' not in T:
            break
        blocks = ((lib.get('sol_tech') or {}).get(q) or {}) if kind == 's' else {}
        order = ([ctx.get('vertical')] if ctx.get('vertical') in blocks else []) + [v for v in blocks if (V.get(v) or {}).get('group') == me.get('group')] + list(blocks)
        clean = lambda blk: not unlinked_in(' '.join([blk['intro']] + [str(x) for kw in blk['kw'] for x in kw[1:]]), ctx.get('unlinked') or ())
        b = next((blocks[v] for v in order if clean(blocks[v])), None) or (blocks[order[0]] if order else None)
        lock[str(T[f'nm{i}'])] = ctx['short'].get(q) or q
        if b:
            lock[str(T[f'in{i}'])] = b['intro']
            for k, (fid, kw, ln) in enumerate(b['kw'][:3]):
                lock[str(T[f'kw{i}_{k}'])] = kw
                lock[str(T[f'kl{i}_{k}'])] = ln
                icons[str(I[f'ki{i}_{k}'])] = f'/assets/toc/icons/{fid}.on.png'
        else:
            free.append(i)
            for k in range(3):
                if f'ki{i}_{k}' in I:
                    icons[str(I[f'ki{i}_{k}'])] = BLANK_ICON
    s['icons'] = icons
    s['tech_free'] = [(i, cols[i]) for i in free]
    return lock


def _cover_lock(ctx: dict, s: dict) -> Dict[str, str]:
    out: Dict[str, str] = {}
    L = load()['layouts'][s['f']]
    for t in L['texts']:
        k = str(t['i'])
        v = plain(s['ex_t'].get(k))
        if not v:
            continue
        if re.fullmatch(r'20\d\d\.\s?\d{1,2}(\.\s?\d{1,2})?', v):
            out[k] = ctx['date']
        elif ctx['tpl_cust'] and ctx['tpl_cust'] in v and t.get('role') in ('cover', 'title', 'display', ''):
            out[k] = scrub_names(ctx, v)
        elif v.startswith('삼성전자') or FIXED.match(v) or v == 'BUSINESS PROPOSAL':
            out[k] = v
    return out


def _name_line(names: Sequence[str], g: Optional[dict], most: int = 3) -> str:
    """item names on one legend line: as many as the line holds, then '외 N' — never a name cut off by the edge of its cell."""
    names = [n for n in names if n]
    for k in range(min(most, len(names)), 0, -1):
        line = ' · '.join(names[:k]) + (f' 외 {len(names) - k}' if len(names) > k else '')
        if k == 1 or not g or not g.get('w') or box_lines(line, g['w'], g.get('font') or 14) <= max(1, int(((g.get('h') or 19) + 2) // ((g.get('font') or 14) * 1.3))):
            return line
    return ''


def _bird_lock(ctx: dict, s: dict) -> Dict[str, str]:
    lib = load()
    out: Dict[str, str] = {}
    spaces = [ctx['space_by_id'][x] for x in s['bind']['spaces']]
    out['1'] = f"{ctx['customer'] or ctx['vertical_name']}의 {len(spaces)}개 공간"
    if plain(s['ex_t'].get('2')):
        out['2'] = re.sub(r'\d+개 공간', f'{len(spaces)}개 공간', scrub_names(ctx, plain(s['ex_t'].get('2'))))
    n_slots = (_last_i(s['f']) + 1 - 4) // 2
    geo = {t['i']: t for t in lib['layouts'][s['f']]['texts']}
    for i in range(n_slots):
        sp = spaces[i] if i < len(spaces) else None
        out[str(4 + 2 * i)] = sp['name'] if sp else ''
        out[str(5 + 2 * i)] = _name_line([_short(lib['products_all'][p].get('name') or '') for p in sp['products']], geo.get(5 + 2 * i)) if sp else ''
    note = _last_i(s['f'])
    if (note + 1 - 4) % 2 == 1:  # an odd slot after the pairs is the layout's own note line — it stays
        out[str(note)] = None
    return out


def _bom_lock(ctx: dict, s: dict, prods: Sequence[str]) -> Dict[str, str]:
    """구성 · 수량 표 (L_TOC_BOM<n>): a row per planned space, a column per product. The row names are the planned spaces; a cell
    whose product stands in that space is '●', one whose product does not is '–', a column without a product and a row without a
    space are empty. Quantities are not in a requirement and are not invented or left as '[0]' placeholders — the table shows
    what goes where (its title says so: ``_no_placeholders``)."""
    T = ((load().get('toc_slots') or {}).get(s['f']) or {}).get('t') or {}
    spaces = [ctx['space_by_id'][x] for x in s['bind'].get('spaces') or [] if x in ctx['space_by_id']]
    out: Dict[str, str] = {}
    r = 0
    while f'rn{r}' in T:
        sp = spaces[r] if r < len(spaces) else None
        out[str(T[f'rn{r}'])] = sp['name'] if sp else ''
        c = 0
        while f'q{r}_{c}' in T:
            if sp is None or c >= len(prods):
                out[str(T[f'q{r}_{c}'])] = ''
            else:
                out[str(T[f'q{r}_{c}'])] = '●' if prods[c] in (sp.get('products') or []) else '–'
            c += 1
        r += 1
    return out


def _map_lock(ctx: dict, s: dict) -> Dict[str, str]:
    lib = load()
    out: Dict[str, str] = {}
    spaces = [ctx['space_by_id'][x] for x in s['bind']['spaces']]
    m = SIBLING.match(s['f'])
    n = int(m.group(2)) if m else len(spaces)
    per = max(2, (_last_i(s['f']) + 1 - 3) // max(1, n))
    if plain(s['ex_t'].get('2')):
        out['2'] = re.sub(r'\d+개 공간', f'{len(spaces)}개 공간', scrub_names(ctx, plain(s['ex_t'].get('2'))))
    for i in range(n):
        sp = spaces[i] if i < len(spaces) else None
        out[str(3 + per * i)] = sp['name'] if sp else ''
        out[str(4 + per * i)] = ' · '.join(_short(lib['products_all'][p].get('name') or '') for p in sp['products'][:5]) if sp else ''
    return out


# ================================================================================================ 3. texts
def slot_plan(ctx: dict, s: dict) -> List[dict]:
    """every text slot of the slide: locked (code / kept) or editable (model) with its reference text and length budget."""
    lib = load()
    L = lib['layouts'][s['f']]
    modes = (L.get('modes') or {}).get('t') or {}
    lock = s.get('lock') or {}
    edit_ref = s.get('edit_ref') or {}
    if s.get('fixed'):
        return [{'i': t['i'], 'lock': None} for t in L['texts'] if not t.get('img')]
    cols = _spec_columns(ctx, s)
    tslots = ((lib.get('toc_slots') or {}).get(s['f']) or {}).get('t') or {}
    tnames = {int(i): n for n, i in tslots.items()}
    out = []
    for t in L['texts']:
        if t.get('img'):
            continue
        k = str(t['i'])
        if k in lock:
            out.append({'i': t['i'], 'lock': lock[k]})
            continue
        if k in (s.get('keep_t') or {}):  # a value the layout stage set from the registry (a rebound 여정 장's feature-group line)
            out.append({'i': t['i'], 'lock': s['keep_t'][k]})
            continue
        if t['i'] in cols and cols[t['i']] is None:
            out.append({'i': t['i'], 'lock': ''})
            continue
        if s.get('resized') and k not in s['ex_t'] and k not in edit_ref and (modes.get(k) or 'ai') in ('fixed', 'pick'):
            out.append({'i': t['i'], 'lock': None})
            continue
        has_ex = k in s['ex_t'] or k in edit_ref
        if not has_ex and not s.get('resized') and s.get('from'):
            out.append({'i': t['i'], 'lock': None})  # the template kept the layout's own wording here
            continue
        ref = edit_ref.get(k) if k in edit_ref else plain(s['ex_t'].get(k)) if k in s['ex_t'] else t['text']
        ref = (ref or '').strip()
        if not ref:
            if has_ex:
                out.append({'i': t['i'], 'lock': ''})
            continue
        if phm.has_placeholder(ref) and not phm.number_only(ref):
            # a sentence with a figure nobody stated ('매점 대기 시간 [00]% 개선'): the writer sees it without the figure and writes a
            # sentence — shown the placeholder, it took the cell for a number cell and left it empty
            ref = phm.strip_placeholders(ref) or ref
        mode = modes.get(k) or 'ai'
        unit = re.fullmatch(r'un(\d)', tnames.get(t['i']) or '')
        unit = bool(unit and f'lb{unit.group(1)}' in tslots)  # a figure row's unit ('개' · '분'): rewritten with its row's label
        figure = re.fullmatch(r'v(\d)', tnames.get(t['i']) or '')
        figure = figure if figure and f'u{figure.group(1)}' in tslots and not s.get('bind_same') and re.fullmatch(r'[\d,.]+|\[0+\]', ref) else None
        fixed = (bool(FIXED.match(ref)) or bool(ORDINAL.match(ref)) or bool(re.fullmatch(r'(STEP|Step|PHASE|Phase)\s*\d+', ref)) or bool(re.fullmatch(r'[●○]{3,}', ref))
                 or (has_ex and not unit and (len(ref) <= 2 or ref in ('목차', '—'))))
        col_ = cols.get(t['i'])
        other_label = bool(col_ and col_[1] and (col_[2] == 'value' or ref not in SPEC_LABELS))  # '바람' · '객실' in a column that is now another product
        ucell = re.fullmatch(r'u(\d)', tnames.get(t['i']) or '')
        ucell = bool(ucell and f'v{ucell.group(1)}' in tslots and not s.get('bind_same'))       # the unit · meaning of a headline figure
        fixed = fixed and not figure and not other_label and not ucell
        if s['kind'] == 'divider':
            mode = 'ai'
        if s['kind'] == 'case' and not s['bind_same'] and mode in ('fixed', 'case') and ref != (t['text'] or '').strip():
            mode = 'ai'  # another case's wording — rewritten from this case's record
        if fixed or mode in ('fixed', 'pick') or s['kind'] == 'static':
            out.append({'i': t['i'], 'lock': scrub_names(ctx, ref) if has_ex else None})
            continue
        if mode == 'section' and not (k == '0' and (s.get('prefix') or {}).get('0')) and (s['bind_same'] or s['kind'] in ('toc', 'cover') or k == '0'):
            out.append({'i': t['i'], 'lock': scrub_names(ctx, ref) if has_ex else None})
            continue
        if mode in ('product', 'solution', 'case') and s['bind_same'] and s['kind'] in ('space', 'solution', 'case'):
            out.append({'i': t['i'], 'lock': scrub_names(ctx, ref) if has_ex else None})  # the same item as the template slide — its facts stay
            continue
        if s['kind'] == 'solution' and s['bind_same'] and has_ex and (t.get('role') or '') == 'title' and not s.get('foreign'):
            out.append({'i': t['i'], 'lock': scrub_names(ctx, ref)})  # the solution's own headline (only 적용 공간 · 대표 장면 follow this customer)
            continue
        if mode == 'solution' and s['kind'] == 'journey':
            out.append({'i': t['i'], 'lock': scrub_names(ctx, ref) if has_ex else None})  # the solution block goes with its feature icons
            continue
        if mode == 'product' and s['kind'] == 'space' and s.get('same_product'):
            out.append({'i': t['i'], 'lock': scrub_names(ctx, ref)})
            continue
        if has_ex:
            wide = (t.get('role') or '') in ('body', 'dense', 'text', '')
            mx = max(10, math.ceil(len(ref) * (1.5 if wide else 1.3)), len(ref) + 6)
        else:
            mx = max(math.ceil(len(ref) * 1.3), {'title': 44, 'heading': 30, 'subheading': 30, 'label': 22}.get(t.get('role') or '', 70))
        head = re.match(r'^((?:도입 (?:전|후)|지금|현재) · )', ref)
        out.append({'i': t['i'], 'r': t.get('role') or 'text', 'ref': ref, 'max': mx, 'mode': mode, 'sample': not has_ex,
                    'prefix': (s.get('prefix') or {}).get(k) or (head.group(1) if head else None)})
        col = cols.get(t['i'])
        if col:
            out[-1].update(of=col[0], of_was=col[1], cell=col[2])
        m = re.fullmatch(r'un(\d)', tnames.get(t['i']) or '')
        if m and f'lb{m.group(1)}' in tslots:  # a figure row's unit caption: '<단위>' or '도입 후 · <단위>'
            out[-1].update(unit_of=int(tslots[f'lb{m.group(1)}']),
                           note=f"단위 칸 — 같은 줄 항목(칸 {tslots['lb' + m.group(1)]})의 단위만 씁니다(분 · 일 · 시간 · 원 · 건 · % 등). 숫자는 넣지 않고, 항목을 바꿨으면 단위도 그 항목에 맞춥니다.")
        m = re.fullmatch(r'vl(\d)', tnames.get(t['i']) or '')
        if m and f'un{m.group(1)}' in tslots:
            out[-1].update(value_of=int(tslots[f'un{m.group(1)}']),
                           note=(f"숫자 칸 — 이 줄 항목(칸 {tslots.get('lb' + m.group(1), '')})에 맞는 수치가 '이 고객이 준 수치' · 제품 사양에 있으면 그 숫자를, 없으면 빈 문자열을 씁니다. "
                                 f"단위는 칸 {tslots['un' + m.group(1)]} 에 따로 씁니다."))
            if f'lb{m.group(1)}' in tslots:
                out[-1]['label_of'] = int(tslots[f'lb{m.group(1)}'])
        if PH_CELL.fullmatch(ref) or phm.number_only(ref):  # a number and nothing else ('[0]곳' · '약 [00]만 원'): a stated figure or nothing
            out[-1]['num_cell'] = True
            if out[-1].get('label_of') is None:
                above = _label_above(L, t)
                if above is not None:
                    out[-1]['label_of'] = above
            out[-1].setdefault('note', "숫자 칸 — 이 칸의 항목에 맞는 수치가 '이 고객이 준 수치' · 제품 사양에 있으면 그 숫자를(단위는 견본대로), 없으면 빈 문자열을 씁니다. 문장을 쓰지 않습니다.")
        if ucell:
            out[-1]['note'] = f"칸 {tslots['v' + tnames[t['i']][1:]]} 숫자 바로 뒤에 붙는 단위 · 뜻(예: '개 솔루션 · 한 공급사', 'nit', '년 TCO')"
        if re.fullmatch(r'lb\d', tnames.get(t['i']) or ''):
            out[-1]['label_row'] = True
        if figure:
            out[-1].update(figure=True, figure_u=int(tslots['u' + figure.group(1)]), note=f"숫자 칸 — 이 고객 · 제품 자료에 있는 숫자만 씁니다(근거 없으면 빈 문자열). 칸 {tslots['u' + figure.group(1)]} 이 그 숫자의 단위 · 뜻입니다.")
        if col and col[2] == 'value':
            lab = next((n for n, j in tslots.items() if j == t['i']), '').replace('sv', 'sl')
            if lab in tslots:
                out[-1]['note'] = f"칸 {tslots[lab]} 항목 이름에 맞는 값(이 열 제품의 자료에서)"
    for x in out:
        if 'lock' not in x and str(x['i']) in (s.get('notes') or {}):
            x['note'] = s['notes'][str(x['i'])]
    _cell_heads(L, s, out)
    return out


def _cell_heads(L: dict, s: dict, out: List[dict]) -> None:
    """each editable cell learns the fixed heading it sits under (``col_head`` — '과제' · '제안' · '기대 효과') and the fixed label
    on its row (``row_head`` — '크기' · '공간'). The model is shown the cells one by one; without this it cannot tell that a
    cell stands in the '제안' column and fills it with whatever its reference text looked like."""
    geo = {t['i']: t for t in L['texts'] if not t.get('img')}
    heads: List[tuple] = []
    for x in out:
        g = geo.get(x['i'])
        if 'lock' not in x or not g or g.get('x') is None or g.get('y') is None or x['i'] == 0 or g['y'] >= 650:
            continue
        v = x['lock'] if x['lock'] is not None else (plain(s['ex_t'].get(str(x['i']))) or g.get('text') or '')
        v = str(v or '').strip()
        if not (2 <= len(v) <= 14) or CONF.match(v) or re.fullmatch(r'[\d\s./·\-–:]+|(STEP|Step|PHASE|Phase|Q)\s?\d+|[●○]+', v):
            continue
        heads.append((g, v))
    if not heads:
        return
    for x in out:
        g = geo.get(x['i'])
        if 'lock' in x or not g or g.get('x') is None or g.get('y') is None:
            continue
        # a row label stands right before its value ('크기' → '138.7 cm'); headings side by side on one line ('고객 니즈' · '핵심 제안')
        # are each a column's own heading, not each other's label
        row = [(h, v) for h, v in heads if abs(h['y'] - g['y']) <= 8 and 0 < g['x'] - h['x'] <= 140]
        if row:
            x['row_head'] = max(row, key=lambda z: z[0]['x'])[1]
        above = [(h, v) for h, v in heads if h['y'] < g['y'] - 8 and abs(h['x'] - g['x']) <= 60]
        if above:
            x['col_head'] = max(above, key=lambda z: z[0]['y'])[1]


def _label_above(L: dict, t: dict) -> Optional[int]:
    """the text cell a number cell sits under — the nearest short text right above it in the same column ('시범 매장' over '[0]곳')."""
    if t.get('x') is None or t.get('y') is None:
        return None
    best = None
    for o in L['texts']:
        if o is t or o.get('img') or o.get('x') is None or o.get('y') is None or o['i'] in (0, 1):
            continue
        if not (0 < t['y'] - o['y'] <= 90) or abs(o['x'] - t['x']) > 24:
            continue
        if best is None or o['y'] > best['y']:
            best = o
    return best['i'] if best is not None else None


def _spec_columns(ctx: dict, s: dict) -> Dict[int, tuple]:
    """{slot: (this column's product name, the template column's product name, 'label' | 'value')} of a multi-column spec sheet."""
    if s['kind'] != 'spec' or not (s.get('bind') or {}).get('products'):
        return {}
    names = ((load().get('toc_slots') or {}).get(s['f']) or {}).get('t') or {}
    prods = s['bind']['products']
    out: Dict[int, tuple] = {}
    for name, i in names.items():
        m = re.fullmatch(r'(md|sl|sv)(\d)(?:_\d)?', name)
        if not m or f'nm{m.group(2)}' not in names:
            continue
        s['n_cols'] = max(s.get('n_cols') or 0, int(m.group(2)) + 1)
        if int(m.group(2)) >= len(prods):
            out[int(i)] = None  # a column without a product: its cells are cleared with its name and picture
            continue
        pid = prods[int(m.group(2))]
        now, was = ctx['short'].get(pid) or pid, plain(s['ex_t'].get(str(names[f'nm{m.group(2)}'])))
        out[int(i)] = (now, '' if was and (was in now or now in was) else was, 'label' if m.group(1) == 'sl' else 'value')  # '' = the same product
    return out


def _bind_line(ctx: dict, s: dict) -> str:
    lib = load()
    b = s.get('bind') or {}
    kind = s['kind']
    sp = lambda sid: (ctx['space_by_id'].get(sid) or {}).get('name') or ''
    pl = _space_p(s.get('f') or '') if kind == 'space' else None
    if pl and b.get('space'):
        cards = ' / '.join(f"카드 {j + 1}(칸 {3 + pl[1] * j}~{3 + pl[1] * (j + 1) - 1}): {product_fact(q, full=True)}" for j, q in enumerate((b.get('products') or [])[:pl[0]]))
        return (f"공간 “{sp(b['space'])}” 에 놓는 제품 {min(pl[0], len(b.get('products') or []))}개 — 카드마다 제품 하나(순서대로): {cards} · 카드의 칸에는 그 카드 제품의 사실만 씁니다"
                ' · ref 는 다른 제품/공간의 문구입니다 — 이 공간 · 이 제품들의 사실로 다시 씁니다.')
    if kind == 'space' and b.get('space'):
        others = [ctx['short'].get(p) or p for p in (b.get('products') or []) if p != b['product']]
        return (f"공간 “{sp(b['space'])}” 에 놓는 대표 제품 {product_fact(b['product'], full=True)}" + (f" · 같은 공간의 다른 제품: {', '.join(others)}" if others else '')
                + (' · ref 는 다른 제품/공간의 문구입니다 — 이 공간 · 이 제품의 사실로 다시 씁니다.' if not s.get('bind_same') else ''))
    if kind == 'scn' and b.get('spaces'):
        uses_ = ', '.join(r['name'] for r in b.get('rows') or [] if r.get('id') and r.get('used'))
        return ('고객/공간 시나리오 — 공간(순서대로, 장에서 → 로 이어짐): ' + ' / '.join(f"{sp(x)}[{', '.join(ctx['short'].get(p) or p for p in ctx['space_by_id'][x]['products'][:4])}]" for x in b['spaces'])
                + f" · 이 공간들에서 쓰는 솔루션 · 서비스: {uses_ or '없음'} — 공간 이름 · 제품 이름 · 솔루션 · 서비스 줄 · 기능 이름은 정해져 있습니다."
                ' 제목과 공간마다 시나리오만 이 공간들 · 이 제품 · 이 솔루션 · 서비스의 사실로 새로 씁니다(견본의 다른 공간 문구는 쓰지 않습니다).')
    if kind == 'scnmap' and b.get('spaces'):
        return '활용 맵 — 공간 · 솔루션 · 서비스 · 표시는 모두 정해져 있습니다.'
    if kind == 'solution' and b.get('solution'):
        return f"솔루션 {solution_fact(b['solution'])} — 기능 설명(고정)은 그대로이고, 적용 공간 · 대표 장면만 이 고객의 공간({', '.join(x['name'] for x in ctx['spaces'][:6]) or '-'})으로 씁니다."
    if kind == 'case' and b.get('case'):
        return f"사례 {case_fact(b['case'], full=True)} — 이 사례의 사실만 씁니다."
    if kind in ('bird', 'map', 'bom', 'journey') and b.get('spaces'):
        return ('공간(순서대로): ' + ' / '.join(f"{sp(x)}[{', '.join(ctx['short'].get(p) or p for p in ctx['space_by_id'][x]['products'][:4])}]" for x in b['spaces'])
                + (' — 공간 이름은 이 순서 그대로, 공간별 장면 문구는 그 공간에 놓인 이 제품으로 새로 씁니다(견본에 나온 다른 제품은 쓰지 않습니다). 솔루션 이름 칸은 정해져 있습니다.' if kind == 'journey' else '')
                + ((' 이 장의 솔루션과 켜진 기능: ' + ' / '.join(f"{ctx['short'].get(r['solution']) or r['solution']}({', '.join(r['features'][:5])})" for r in s['journey_sols'])
                    + ' — 견본의 장면은 다른 솔루션의 것입니다. 제목과 공간별 장면 문구를 이 솔루션의 이 기능이 그 공간에서 하는 일로 새로 씁니다(자료에 없는 기능은 쓰지 않습니다).')
                   if kind == 'journey' and s.get('journey_sols') else ''))
    if kind == 'tech' and (b.get('solutions') or b.get('columns')):
        free = s.get('tech_free') or []
        if not free:
            return '핵심 기술 장 — 솔루션 이름 · 키워드는 정해져 있습니다. 제목만 이 고객 · 이 솔루션들에 맞춰 씁니다.'
        return ('핵심 기술 장 — 이름이 정해진 열 가운데 아래 열은 내용을 새로 씁니다(한 줄 소개 + 키워드 3개와 각 키워드의 한 줄). 그 열의 솔루션 · 제품 자료에 적힌 일만 씁니다 — '
                '다른 열의 솔루션이 하는 일(예: 공조 제어 · 에너지 절감)을 이 열의 것으로 쓰지 않고, 자료가 짧으면 자료에 있는 말을 키워드로 나눠 씁니다: '
                + ' / '.join(f"{i + 1}번째 열 = " + (solution_knowledge(q) if k == 's' else product_fact(q, full=True)) for i, (k, q) in free))
    if kind == 'product' and b.get('product'):
        return '제품 ' + product_fact(b['product'], full=True) + ' — 이 제품이 이 고객에게 주는 가치 한 가지를 제목과 한 줄로 씁니다(자료에 있는 사실만).'
    if kind == 'spec' and b.get('products'):
        return ('제품(순서대로, 열마다 하나씩 — 칸의 “제품” 이 그 칸이 속한 열입니다. 견본의 열은 다른 제품의 것이니 항목 이름 · 값을 그 열 제품의 자료로 씁니다): '
                + ' / '.join(f'{n + 1}열 = ' + product_fact(x, full=True) for n, x in enumerate(b['products'][:3])))
    if kind == 'toc':
        pb = ctx.get('plan_by') or {}
        return ('목차 장 — 파트 이름 · 번호 · 쪽은 정해져 있습니다. 파트마다 한 줄 설명과 키워드 줄을 그 파트가 실제로 다루는 것에 맞춰 씁니다(견본의 키워드를 옮기지 않습니다): '
                + ' / '.join(f"{o['no']:02d} {o['name']}: {o['message']}" + (f" (다루는 요구: {' · '.join((pb.get(o['id']) or {}).get('points') or [])})" if (pb.get(o['id']) or {}).get('points') else '')
                             + (f" (솔루션: {', '.join(ctx['short'].get(x) or x for x in (pb.get(o['id']) or {}).get('solutions') or [])})" if (pb.get(o['id']) or {}).get('solutions') else '')
                             for o in ctx.get('outline') or []))
    if kind == 'divider':
        return '간지 — 장 설명 한 줄과, 이 파트 뒤 장들의 제목과 맞는 항목 이름을 씁니다.'
    if kind == 'cover':
        return '표지 — 덱 핵심 메시지를 한 줄로.'
    L = lib['layouts'].get(s['f']) or {}
    cuts = [im for im in L.get('images') or [] if im.get('kind') in ('cut', 'detail', 'kiosk', 'signage')]
    if cuts:
        return (f"이 장에는 제품 · 솔루션 그림 칸이 {len(cuts)}개 있고, 각 칸 바로 옆 문구에 적힌 제품(또는 솔루션)의 그림이 들어갑니다 — "
                '그 문구에는 이 파트의 제품 · 솔루션 이름을 자료에 적힌 그대로 씁니다.')
    return ''


def need_columns(points: Sequence[dict], pp: dict) -> tuple:
    """니즈 장의 세 열(Q1 · Q2 · Q3) ↔ 핵심 제안 1 · 2 · 3: the requirement points of each column, in order — (columns, problem).

    The same split serves the layout stage (a 핵심 제안 장 no selected item answers is left out) and the text stage (``assign_focus``)."""
    pts = {x['id']: x for x in points}
    own = [r for r in (pp.get('point_ids') or pp.get('raises') or []) if r in pts]
    problem = not pp.get('point_ids') and bool(pp.get('raises'))
    if not own:
        own = [r for r in list(pp.get('refs') or []) + list(pts) if r in pts][:3]
    cols, extra = own[:3], own[3:]
    if len(cols) < 3 and not problem:
        # fewer owned points than columns: the other requirement points of this customer fill them (their full answer stays with
        # their owner) — never the template's own needs
        more = [r for r in list(pp.get('refs') or []) + list(pts) if r in pts and r not in cols]
        cols += list(dict.fromkeys(more))[:3 - len(cols)]
    per: List[List[str]] = [[r] for r in cols]
    for n, r in enumerate(extra):  # more than three points: the extra ones ride with a column
        per[-1 - (n % len(per))].append(r)
    return per, problem


def column_items(ctx: dict, per: Sequence[Sequence[str]], pts: Dict[str, dict]) -> Dict[int, tuple]:
    """니즈 장의 세 열마다 대표 항목 하나(가운데 '기술' 칸 · 그림)와 그 열의 나머지 항목 — {열: (대표, [나머지])}.

    Each column shows a different selected item when the requirement points allow it: the column with the fewest candidates picks
    first, a column whose candidates are all taken keeps its own first one (the same solution may truly answer two needs)."""
    cand: List[List[str]] = []
    for grp in list(per)[:3]:
        cand.append(list(dict.fromkeys([q for r in grp for q in pts[r].get('solutions') or []] + [q for r in grp for q in pts[r].get('products') or []])))
    out: Dict[int, tuple] = {}
    taken: Set[str] = set()
    for k in sorted(range(len(cand)), key=lambda k: (len(cand[k]) or 99, k)):
        it = next((q for q in cand[k] if q not in taken), None) or (cand[k][0] if cand[k] else None)
        if it:
            taken.add(it)
        out[k] = (it, [q for q in cand[k] if q != it])
    return out


def assign_focus(ctx: dict, plan: dict, pp: dict, slides: List[dict], part: Optional[dict] = None) -> None:
    """the part's owned requirement points → the content slides that answer them (code): 니즈 3열 ↔ 핵심 제안 1·2·3, else in order."""
    pts = {x['id']: x for x in plan['points']}
    own = [r for r in (pp.get('point_ids') or pp.get('raises') or []) if r in pts]
    summary = bool(part and part.get('mode') == 'summary')
    problem = not pp.get('point_ids') and bool(pp.get('raises')) and not summary
    if summary and not own:
        own = list(pts)[:4]
    if not own and any(sl['f'] == 'L_VS_NEEDS' or sl['f'].startswith('L_VS_CORE_') for sl in slides):
        own = [r for r in list(pp.get('refs') or []) + list(pts) if r in pts][:3]
    for sl in slides:
        if sl['f'] == 'L_TOC_RFP' and not sl.get('keep') and not sl.get('fixed'):
            _rfp_rows(ctx, plan, sl)
    content = [sl for sl in slides if sl['kind'] == 'generic' and not sl.get('keep') and not sl.get('fixed') and sum(1 for x in slot_plan(ctx, sl) if 'lock' not in x and len(x['ref']) >= 8) >= 5]
    if not own or not content:
        return
    needs = next((sl for sl in content if sl['f'] == 'L_VS_NEEDS'), None)
    cores = sorted((sl for sl in content if sl['f'].startswith('L_VS_CORE_')), key=lambda sl: sl['f'])
    def focus(rids: List[str], note: str) -> dict:
        prods = list(dict.fromkeys(q for r in rids for q in pts[r].get('products') or []))
        sols = list(dict.fromkeys(q for r in rids for q in pts[r].get('solutions') or []))
        if problem:
            return {'points': rids, 'products': [], 'solutions': [], 'problem': True,
                    'note': (note + ' · ' if note else '') + '요구를 고객의 현황 · 과제로만 서술합니다(해법 · 제품 · 솔루션 이름은 뒤 파트의 몫이라 쓰지 않습니다)'}
        if summary:  # 제안 요약: the whole deck on one page — each column says what its heading says
            names = [ctx['short'].get(q) or q for q in list(ctx['products'])[:5] + list(ctx['solutions'])[:5]]
            return {'points': rids, 'products': list(ctx['products'])[:5], 'solutions': list(ctx['solutions'])[:5], 'summary': True,
                    'note': ((note + ' · ' if note else '') + "덱 전체를 한 장으로 줄이는 요약 장입니다 — ‘과제’ 열에는 고객의 과제(요구에서), ‘제안’ 열에는 그 과제에 이 덱이 제안하는 것"
                             + (f"(이 고객이 고른 것: {', '.join(names)} — 이름과 하는 일을 짧게)" if names else '')
                             + ", ‘기대 효과’ 열에는 그 제안으로 달라지는 것(맞는 수치가 없으면 [00] 자리표시), ‘결정 요청’ 에는 고객에게 요청하는 다음 결정 한 가지를 씁니다. "
                               "과제 · 제안 · 효과는 같은 줄끼리 짝이 맞게 씁니다(요약이므로 다른 파트의 내용을 한 구절로 줄여 쓰는 것은 괜찮습니다)")}
        return {'points': rids, 'products': prods, 'solutions': sols, 'note': note}
    if needs is not None or cores:
        per, _ = need_columns(plan['points'], pp)
        lead = column_items(ctx, per, pts) if not problem else {}
        if needs is not None:
            mid = plain(needs['ex_t'].get('4'))
            if mid:  # the heading of the middle column is the name of the offer itself ('AI 비즈니스 호텔') — a fixed line between '고객 니즈'
                needs.setdefault('lock', {})['4'] = scrub_names(ctx, mid)  # and '핵심 제안', not the first proposal's name
            needs['focus'] = focus([r for grp in per for r in grp], f"세 열(Q1 · Q2 · Q3)을 이 순서의 요구 {len(per)}개로 씁니다" + (' — 남는 열은 이 파트의 메시지에서 이어지는 니즈로 씁니다' if len(per) < 3 else '')
                                   + ' · 니즈 문장은 고객이 직접 말하듯 한 문장으로 씁니다(“…했으면 해요” · “…하고 싶어요” 꼴) — 요구 문장이나 평가 기준 문장(“…를 평가한다”)을 그대로 옮기지 않습니다')
            if not problem:  # the technology of each column = the linked item that answers its point (its picture then shows that item)
                for k in range(min(3, len(per))):
                    it, more = lead.get(k) or (None, [])
                    # the technology cell names the selected item that answers the column — none selected: empty, never the template's product;
                    # the line under it lists the column's other selected items (not the template's)
                    needs.setdefault('lock', {})[str(8 + 7 * k)] = (ctx['short'].get(it) or it) if it else ''
                    # the line under it stays empty until the text is written: it then lists the other selected items the column's own
                    # proposal names (``_realign_needs``) — not every item the plan loosely tied to the requirement
                    needs['lock'][str(9 + 7 * k)] = ''
                    if it:  # the column's picture is that item's (not whichever name happens to be longest next to it)
                        needs.setdefault('img_bind', {})[str(k)] = {'product': it} if it in ctx['products'] else {'solution': it}
                names = [f"{k + 1}열 = {ctx['short'].get(lead[k][0]) or lead[k][0]}" for k in sorted(lead) if lead[k][0]]
                if names:
                    needs['focus']['note'] += (f" · 가운데 열(기술)은 정해져 있습니다({', '.join(names)}) — 열마다 니즈 문장과 핵심 제안을 그 항목이 실제로 하는 일로 쓰고, "
                                               '같은 열의 두 제안 칸은 서로 다른 내용으로 씁니다')
        row_used: Set[str] = {v[0] for v in lead.values() if v and v[0]}
        for n, sl in enumerate(cores):
            k = sl['col'] if sl.get('col') is not None else n  # the column this 핵심 제안 장 stood for in the template (others may be left out)
            if k < len(per):
                it, more = lead.get(k) or (None, [])
                rows_ = _core_rows(ctx, sl, it, more, row_used) if it and not problem else []
                sl['focus'] = focus(per[k], f'니즈 장의 {k + 1}번째 제안을 풀어 쓰는 장' + (f" — 중심 항목은 {ctx['short'].get(it) or it}" if it else '')
                                    + ' · 제목은 니즈 장의 제목과 다른 말로, 이 제안 하나를 말합니다'
                                    + ' · 견본의 세부 제안 두 개(이름 · 대표 항목 · 세 단계 장면)는 다른 제품을 전제로 한 것입니다 — 이 장의 항목이 자료(사양 · 특징)에 적힌 대로 실제 할 수 있는 일로 '
                                      '세부 제안을 새로 정하고, 자료에 없는 기능(주문 받기 · 결제 · 감지 등)을 그 항목이 한다고 쓰지 않습니다'
                                    + ((' · 두 행(01 · 02)은 서로 다른 세부 제안입니다 — 행마다 이름표에 정해진 항목('
                                        + ', '.join(f"{r + 1:02d} = {ctx['short'].get(q) or q}" for r, q in enumerate(rows_))
                                        + ')이 하는 일을 쓰고, 두 행에 같은 문장 · 같은 장면을 되풀이하지 않습니다(견본의 장면을 그대로 두지 않습니다)') if rows_ else ''))
        rest = [sl for sl in content if sl is not needs and sl not in cores]
    else:
        rest = content
    if rest and not (needs is not None or cores):
        size = math.ceil(len(own) / len(rest))
        for k, sl in enumerate(rest):
            grp = own[k * size:(k + 1) * size]
            rows = sum(1 for x in slot_plan(ctx, sl) if x.get('label_row'))
            note = ''
            if grp and rows > len(grp):
                if not problem:
                    more = [r for r in list(pp.get('refs') or []) + list(pts) if r in pts and r not in grp]
                    grp = grp + list(dict.fromkeys(more))[:rows - len(grp)]
                note = f'이 장의 {rows}줄은 서로 다른 항목입니다 — 같은 항목을 두 줄에 쓰지 않고, 요구 하나에서 잴 것이 여럿이면 나눠 씁니다'
            if grp:
                sl['focus'] = focus(grp, note)
            elif own:
                sl['focus'] = focus(own, '앞 장과 겹치지 않는 면을 다룹니다')


def _bare(v: str) -> str:
    return re.sub(r'[\s“”"\'‘’.,·!?()\[\]—–\-~:;/]+', '', str(v or ''))


def near_same(a: str, b: str) -> bool:
    """two cells say (almost) the same thing: one inside the other, the same opening or closing half, or mostly the same letters
    — 'Q2 “교체 중에도 객실 판매가 멈추지 않고 …”' next to 'Q3 “교체 중에도 객실 판매가 멈추지 않고, 층별로 …”'."""
    a, b = _bare(a), _bare(b)
    if len(a) < 6 or len(b) < 6:
        return False
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if len(short) >= 8 and short in long_:
        return True
    pre = next((n for n, (x, y) in enumerate(zip(a, b)) if x != y), len(short))
    suf = next((n for n, (x, y) in enumerate(zip(a[::-1], b[::-1])) if x != y), len(short))
    if pre >= max(6, len(short) * 2 // 5) or suf >= max(8, len(short) // 2):
        return True
    A, B = {a[i:i + 2] for i in range(len(a) - 1)}, {b[i:i + 2] for i in range(len(b) - 1)}
    return len(A & B) / max(1, len(A | B)) >= 0.6


def _rfp_rows(ctx: dict, plan: dict, sl: dict) -> None:
    """요구사항 대응 장 (L_TOC_RFP): a row per requirement point of this customer, in the plan's order — 요구사항 · 삼성 대응 · 근거.

    The template's rows are another customer's requirements ('출력 보안'): left as references, the writer kept some and put a
    product name where a requirement belongs. Each row is told which point it answers; rows beyond the points are left out."""
    T = ((load().get('toc_slots') or {}).get(sl['f']) or {}).get('t') or {}
    pts = list(plan.get('points') or [])
    notes, lock = dict(sl.get('notes') or {}), sl.setdefault('lock', {})
    names = ', '.join(ctx['short'].get(q) or q for q in list(ctx['products'])[:5] + list(ctx['solutions'])[:5])
    k = 0
    while f'rq{k}' in T:
        if k < len(pts):
            its = [ctx['short'].get(q) or q for q in (pts[k].get('products') or []) + (pts[k].get('solutions') or [])]
            notes[str(T[f'rq{k}'])] = f"이 줄의 요구사항: “{pts[k]['text']}” — 그 요구를 항목 이름으로 줄여 씁니다(고객의 요구이지 제품 이름이 아닙니다)"
            if f'rs{k}' in T:
                notes[str(T[f'rs{k}'])] = ('이 줄의 요구에 대한 삼성의 대응 — ' + (f"{', '.join(its)} 이(가) " if its else '이 고객이 고른 제품 · 솔루션이 ')
                                         + '자료대로 실제 하는 일을 짧게 씁니다(자료에 없는 기능을 쓰지 않습니다)')
            if f'ev{k}' in T:
                notes[str(T[f'ev{k}'])] = f"근거 — 위 대응에 쓴 선택 항목의 이름({names} 가운데)"
        else:
            for n in (f'rq{k}', f'rs{k}', f'ev{k}'):
                if n in T:
                    lock[str(T[n])] = ''
        k += 1
    sl['notes'] = notes
    sl['rfp_points'] = [p['text'] for p in pts[:k]]


def _core_rows(ctx: dict, sl: dict, lead: str, more: Sequence[str], used: Set[str]) -> List[str]:
    """핵심 제안 장 (L_VS_CORE_n): the item of each of its two rows, set before the text is written — row 01 the column's own item,
    row 02 another selected item of the same requirement (else one no other row shows yet, else the same item). The item chip and
    the picture of each row are then that item's by construction: left to the writer, the two rows came back as the same row
    twice, or a chip over a line about another product."""
    L = load()['layouts'].get(sl['f']) or {}
    tm, im = (L.get('modes') or {}).get('t') or {}, (L.get('modes') or {}).get('img') or {}
    chips = sorted(int(k) for k, m in tm.items() if m == 'product')
    pics = sorted(int(k) for k, m in im.items() if m == 'product')
    if len(chips) < 2:
        return []
    pool = [q for q in more if q != lead] + [q for q in list(ctx['products']) + list(ctx['solutions']) if q != lead and q not in used and q not in more]
    second = next((q for q in pool if q not in used), None) or (pool[0] if pool else lead)
    rows = [lead, second][:len(chips)]
    used.update(rows)
    for n, q in enumerate(rows):
        sl.setdefault('lock', {})[str(chips[n])] = ctx['short'].get(q) or q
        if len(pics) == len(chips):
            sl.setdefault('img_bind', {})[str(pics[n])] = {'product': q} if q in ctx['products'] else {'solution': q}
    sl['core_rows'] = rows
    return rows


def _chip(x: dict, v: str) -> bool:
    """a short free-text cell (a chip · a card label) — not a figure, a unit or a before/after label, which may rightly repeat."""
    return (x.get('value_of') is None and x.get('unit_of') is None and not x.get('figure') and not x.get('prefix')
            and not STRUCTURAL.search(v) and not re.match(r'^[\d\[]', v))


def fill_part_text(ctx: dict, plan: dict, part: dict, pp: dict, slides: List[dict], llm) -> None:
    lib = load()
    banned, allowed = ctx['banned'], ctx['allowed']
    assign_focus(ctx, plan, pp, slides, part)
    want: Dict[int, Dict[int, dict]] = {}
    blocks = []
    n_edit = 0
    for s, sl in enumerate(slides):
        if sl.get('keep') or sl.get('fixed'):
            continue
        slots = slot_plan(ctx, sl)
        sl['_slots'] = slots
        ed = [x for x in slots if 'lock' not in x]
        if not ed:
            continue
        want[s] = {x['i']: x for x in ed}
        n_edit += len(ed)
        L = lib['layouts'][sl['f']]
        locked = [f"{x['i']}={_j(x['lock'][:40])}" for x in slots if x.get('lock') and len(x['lock']) > 1 and not CONF.match(x['lock'])][:8]
        lines = '\n'.join('  ' + _j_slot(x) for x in ed)
        bl = _bind_line(ctx, sl)
        fc = sl.get('focus')
        if fc:
            pmap = {x['id']: x for x in plan['points']}
            rows = []
            for r in fc['points']:
                its = [] if fc.get('problem') else [ctx['short'].get(q) or q for q in (pmap[r].get('products') or []) + (pmap[r].get('solutions') or [])]
                rows.append(f"“{pmap[r]['text']}”" + (f" → {', '.join(its)}" if its else ''))
            if fc.get('problem'):
                bl = (f"이 장이 짚을 고객 요구(순서대로): {' / '.join(rows)}. {fc['note']}. ref 는 업종 일반 견본입니다 — 이 고객의 요구에서 나온 과제 · 현황으로 새로 씁니다. " + bl)
            else:
                bl = (f"이 장이 답할 요구(순서대로): {' / '.join(rows)}. {fc['note']}. ref 는 업종 일반 견본(다른 니즈)입니다 — 니즈 문장 · 제안 이름 · 기능 · 장면을 모두 "
                      f"이 요구와 이 제품 · 솔루션의 내용으로 새로 씁니다. " + bl)
        if sl.get('ex_t_old'):
            old = [plain(v) for _, v in sorted(sl['ex_t_old'].items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 999)]
            bl += ' · 템플릿 원래 장의 내용(칸 수가 달라져 참고만): ' + ' | '.join(v for v in old if 4 <= len(v) <= 60)[:500]
        blocks.append((s, len(ed), f"[s={s}] {L['name'][:50]} · 역할: {sl['role'][:60]}" + (f"\n  묶인 대상: {bl}" if bl else '')
                       + (f"\n  정해진 칸(참고만, 답에 넣지 않음): {' · '.join(locked)}" if locked else '') + f"\n{lines}"))
    if not want:
        _finish_text(ctx, slides, {})
        return
    ol = ctx.get('outline') or []
    me = next((o for o in ol if o['id'] == part['id']), None)
    k = ol.index(me) if me else -1
    prev = f"{ol[k - 1]['name']} — {ol[k - 1]['message']}" if me and k > 0 else '(시작)'
    nxt = f"{ol[k + 1]['name']} — {ol[k + 1]['message']}" if me and k + 1 < len(ol) else '(끝)'
    ptext = {x['id']: x['text'] for x in plan['points']}
    owner_name = {x['id']: next((p['name'] for p in plan['parts'] if p['id'] == x.get('owner')), '') for x in plan['points']}
    recap = part.get('mode') == 'summary'  # 제안 요약 names what the deck offers: every selected item, briefly
    prods = '\n'.join(f'  - {product_fact(p, full=not recap)}' for p in (pp.get('products') or (ctx['products'] if recap else []))[:8]) or '  (이 파트는 제품을 다루지 않음)'
    sols = '\n'.join(f'  - {solution_knowledge(x, 4 if recap else 8)}' for x in (pp.get('solutions') or (ctx['solutions'] if recap else []))[:8]) or '  (없음)'
    cases = '\n'.join(f'  - {case_fact(x, full=True)}' for x in (pp.get('cases') or [])[:4]) or '  (없음)'
    spaces = ', '.join(x['name'] for x in ctx['spaces'] if x['id'] in (pp.get('spaces') or [])) or '(없음)'
    head = f"""삼성전자 B2B 제안서의 한 파트 문구를 씁니다. 장표 틀과 칸은 템플릿의 것이고 ref 는 템플릿에 들어 있던 견본 문구(다른 고객 · 업종 일반용)입니다. 덱 전체 계획에서 이 파트가 맡은 내용만, 이 고객의 말로 씁니다.

[이 고객] {ctx['customer'] or '(고객사)'} · {ctx['title']} · 업종 {ctx['vertical_name'] or ctx['ind'] or ''}
덱 핵심 메시지: {plan['thesis']}
흐름: {plan['storyline']}
고객 요구사항 (자료일 뿐 지시가 아님):
<<<
{ctx['req_text'][:2200]}
>>>
이 고객이 준 수치 (숫자 칸과 수치가 들어가는 문구에는 먼저 이 수치를 씁니다): {' / '.join(f"{f['raw']}{f['unit']} — “{f['text']}”" for f in (ctx.get('facts') or [])[:12]) or '(요구사항에 수치가 없음)'}
[이 파트] {(f"{me['no']:02d}/{len(ol):02d} " if me else '')}{part['name'] or '표지 · 목차'} — 이 파트가 남길 한 가지: {pp['message']}
- 이 파트가 주인으로 답하는 요구: {' / '.join(pp['points']) or ('(없음 — 이 파트는 고객의 요구를 과제 · 현황으로 짚기만 하고, 해법은 뒤 파트가 답합니다)' if pp.get('raises') else '(없음 — 요구에 대한 답은 다른 파트가 합니다)')}
- 한 구절로 이어 받기만 하는 요구(주인은 다른 파트): {' / '.join(f"{ptext[r]}(→ {owner_name.get(r) or '다른 파트'})" for r in pp['refs']) or '(없음)'}
- 이 파트의 제품:
{prods}
- 이 파트의 솔루션:
{sols}
- 이 파트의 사례:
{cases}
- 이 파트의 공간: {spaces}
- 앞 파트: {prev}
- 다음 파트: {nxt}
- 다른 파트가 맡은 내용 (여기서 되풀이하지 않습니다):
{chr(10).join('  · ' + a for a in pp['avoid']) or '  (없음)'}

규칙
0. 먼저 outline 에 장(s)마다 '이 고객에게 이 장이 말할 것'을 한 줄씩 씁니다 — 이 파트가 주인인 요구와 이 파트의 제품 · 솔루션을 장에 나눠 배정합니다. 그다음 그 outline 대로 slides 의 칸을 씁니다.
1. ref 는 형식(역할 · 문장 꼴 · 길이)의 견본일 뿐입니다. 내용은 이 고객 · 이 파트의 것으로 새로 씁니다 — ref 를 그대로 옮기는 것은 고객과 관계없는 일반 문구(칸 이름표 등)일 때만 허용됩니다. 각 칸은 ref 와 비슷한 길이로 쓰고 max 를 넘기지 않습니다(넘치면 잘립니다 — 긴 설명 대신 짧고 완결된 문구). 한 칸에 한 가지만.
2. 이 파트가 주인인 요구에는 구체적으로 답하고, 다른 파트가 맡은 내용(위 목록)은 문장으로 되풀이하지 않습니다. 같은 문장을 두 칸에 쓰지 않습니다.
3. 제품 · 솔루션 · 사례는 위에 적힌 것만, 이름 · 모델 · 사양은 자료 그대로 씁니다. '묶인 대상'이 있는 장은 그 대상만 다룹니다. ref 에 나온 다른 제품 · 다른 고객 이름은 옮기지 않습니다.
4. 수치는 위 자료(이 고객이 준 수치 · 제품 사양 · 사례 성과)에 있는 것만 씁니다. 견본의 [00] · [0]곳 같은 자리표시는 제안서에 남기지 않습니다 — 문장 칸은 맞는 수치가 자료에 있으면 그 수치로, 없으면 수치 없이 같은 뜻으로 씁니다(‘월 전기료 [00]% 절감’ → ‘월 전기료 절감’). 숫자만 들어가는 칸(ref 가 [00] · [0]곳 꼴)은 그 줄의 항목에 맞는 수치가 자료에 있으면 그 수치를 쓰고, 없으면 빈 문자열("")로 둡니다 — 숫자를 지어내지 않고, 0 이나 [20] 으로도 쓰지 않습니다. 숫자 칸에 문장을 쓰지 않습니다.
5. 고객 이름은 “{ctx['customer'] or '고객사'}” 입니다. 견본의 고객 이름{('(“' + ctx['tpl_cust'] + '”)') if ctx['tpl_cust'] else ''}이나 다른 회사 이름을 쓰지 않습니다.
6. prefix 가 있는 칸은 그 글자로 시작합니다. 칸 안의 줄바꿈은 \\n.
7. guide 가 true 인 칸의 ref 는 문구가 아니라 '그 칸에 무엇을 쓰는지'의 설명입니다. 설명을 옮기지 말고 그 칸에 들어갈 실제 문구를 씁니다(작성 안내 '…사진으로 교체' · '자리표시' · '한두 문장으로' 도 마찬가지).
8. 이 고객이 연결하지 않은 제품 종류 · 솔루션({', '.join(lb for lb, _ in ctx['unlinked'][:14]) or '없음'})은 쓰지 않습니다. ref 에 그런 것이 나오면 이 파트의 제품 · 솔루션으로 바꿔 씁니다.
9. 간지(장 표지)의 항목 이름은 이 파트 뒤 장들의 제목과 같은 말로 씁니다.
10. '열' 이 적힌 칸은 장표에서 그 제목(예: 과제 · 제안 · 기대 효과) 아래에 놓인 칸입니다 — 그 제목이 뜻하는 내용만 씁니다(‘제안’ 아래에는 제안하는 것, ‘과제’ 아래에는 고객의 과제). '항목' 이 적힌 칸은 같은 줄의 그 이름표에 맞는 값을 씁니다(‘공간’ 이면 쓰이는 공간, ‘크기’ 면 크기).
11. 제목 칸과 바로 아래 설명 칸은 한 쌍입니다 — 제목은 그 설명이 말하는 기능 · 내용의 이름으로 씁니다(설명과 다른 사양을 제목에 쓰지 않습니다). 같은 장 · 같은 파트의 다른 칸과 거의 같은 문장 · 같은 제목을 되풀이하지 않습니다."""
    schema = {'type': 'OBJECT', 'properties': {
        'outline': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'s': {'type': 'INTEGER'}, 'says': {'type': 'STRING'}}, 'required': ['s', 'says']}},
        'slides': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
            's': {'type': 'INTEGER'}, 't': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'i': {'type': 'INTEGER'}, 'v': {'type': 'STRING'}},
                                                                       'required': ['i', 'v']}}}, 'required': ['s', 't']}}}, 'required': ['outline', 'slides']}
    owns = bool(pp['points'])
    vocab = ctx['unlinked_said'] if part.get('mode') == 'problem' else ctx['unlinked']
    # one call per ~45 editable slots (a long part is written in consecutive chunks; a call that times out is split once)
    chunks, cur, size = [], [], 0
    for s, n, text in blocks:
        if cur and size + n > 45:
            chunks.append(cur)
            cur, size = [], 0
        cur.append((s, text))
        size += n
    if cur:
        chunks.append(cur)
    got: Dict[int, Dict[int, str]] = {}
    tail = 'JSON만 답하세요: {"outline":[{"s":0,"says":"…"}],"slides":[{"s":0,"t":[{"i":1,"v":"…"}]}]}'

    def aligned(s: int, row: Dict[int, str], asked: Any) -> bool:
        """the answer's cell numbers are the slide's own. An answer may carry cells that were not asked (the model likes to write
        the fixed cells back) — that is harmless when those cells hold what the slide holds there; when they do not, the model
        counted the cells again (0, 1, 2 … over numbers that skip the fixed cells) and every value sits in the wrong cell."""
        extra = [i for i in row if i not in asked]
        if not extra:
            return True
        known: Dict[int, str] = {}
        base = {t['i']: str(t.get('text') or '') for t in (lib['layouts'].get(slides[s]['f']) or {}).get('texts') or []}
        for x in slides[s].get('_slots') or []:
            if 'lock' in x:
                known[x['i']] = str(x['lock']) if x['lock'] is not None else plain(slides[s]['ex_t'].get(str(x['i']))) or base.get(x['i'], '')
            else:
                first = got.get(s, {}).get(x['i'])
                known[x['i']] = str(first) if first is not None else x.get('ref') or ''
        if any(i not in known for i in extra):
            return False  # a cell number the slide does not have
        # the mark of a recount: an unasked cell holds what the slide holds in *another* cell ('Q2' one cell early). A fixed cell
        # the model merely wrote over in its own words ('※ …' in a cell code keeps empty) says nothing about the numbering
        elsewhere = sum(1 for i in extra if _bare(row[i]) and _bare(row[i]) != _bare(known[i])
                        and any(_bare(row[i]) == _bare(v) for j, v in known.items() if j != i and len(_bare(v)) >= 2))
        return elsewhere < (1 if len(extra) <= 3 else 2)

    def ask(chunk: List[tuple], depth: int = 0, temperature: float = 0.3) -> None:
        ids = [s for s, _ in chunk]
        prompt = (head + f"\n\n장표 (s=장 번호, i=칸 번호, r=칸 역할, ref=견본 문구):\n{chr(10).join(t for _, t in chunk)}\n" + tail
                  + ' — 위 장의 모든 칸 i 를 빠짐없이 넣습니다.')

        def complete(d) -> Any:  # structure only — the content rules are checked per slot and repaired slot by slot below
            g = _got(d)
            errs = []
            for s in ids:
                need = list(want[s])
                miss = [i for i in need if i not in g.get(s, {})]
                if len(miss) > max(1, len(need) // 10):
                    errs.append(f's={s}: 빠진 칸 {miss[:12]}')
                if not aligned(s, g.get(s, {}), want[s]):  # the cells were counted again (the asked numbers skip the fixed cells)
                    extra = [i for i in g.get(s, {}) if i not in want[s]]
                    errs.append(f's={s}: 칸 번호가 어긋났습니다(묻지 않은 칸 {extra[:8]}) — 칸 번호 i 는 장표에 적힌 그대로 씁니다(중간 번호가 비어 있어도 다시 매기지 않고, 정해진 칸은 넣지 않습니다)')
            return '\n'.join(errs[:20]) if errs else True
        try:
            d = llm.json(stage='auto_text', prompt=prompt, schema=schema, validate=complete, temperature=temperature, max_tokens=8000)
        except Exception as exc:  # noqa: BLE001
            code = getattr(exc, 'code', '')
            if code in ('timeout', 'max_tokens', 'invalid_json', 'empty') and len(chunk) > 1 and depth < 2:
                half = len(chunk) // 2
                ask(chunk[:half], depth + 1)
                ask(chunk[half:], depth + 1)
                return
            if code != 'invalid_output':
                raise  # a failed model call fails this part — no rule-made text instead
            d = getattr(exc, 'last', None) or {'slides': []}
            part.setdefault('warnings', []).append('문구 일부 칸이 빠져 템플릿 문구로 남음')
        off: List[int] = []
        for s, row in _got(d).items():
            if s in ids:
                if not aligned(s, row, want[s]):
                    off.append(s)  # the answer's cells were counted again: a value may sit one cell off ('고객 니즈' in the cell of the offer's name)
                    continue
                got.setdefault(s, {}).update({i: v for i, v in row.items() if i in want[s] and not _foreign_lock(slides, ids, s, i, v)})
        for s in off:
            if len(chunk) > 1 and depth < 3:
                ask([c for c in chunk if c[0] == s], 3)  # asked again on its own — one slide's numbers are easier to keep than six slides'
            elif '칸 번호가 어긋난 답은 쓰지 않음' not in (part.get('warnings') or []):
                part.setdefault('warnings', []).append('칸 번호가 어긋난 답은 쓰지 않음')  # the slide keeps the template text and goes to the repair pass
    for chunk in chunks:
        ask(chunk)

    def echo_slots(s: int) -> List[int]:
        xs = [x for x in want[s].values() if len(x['ref']) >= 10 and not x.get('sample') and not STRUCTURAL.search(x['ref'])]
        same = [x['i'] for x in xs if (got.get(s, {}).get(x['i']) or x['ref']).strip() == x['ref']]
        return same if len(xs) >= 4 and len(same) / len(xs) > 0.34 else []

    _names = sorted({n for n in [ctx['customer'], (ctx['customer'] or '').split(' ')[0]] + list(ctx['short'].values()) if n and len(n) >= 2}, key=len, reverse=True)

    def unnamed(v: str) -> str:  # two lines that only share the customer's or an item's name are not the same line
        for n in _names:
            v = v.replace(n, '#')
        return v

    def problems() -> Dict[int, Dict[int, str]]:
        out: Dict[int, Dict[int, str]] = {}
        heads_seen: List[tuple] = []
        for s, slots in want.items():
            for i, x in slots.items():
                v = got.get(s, {}).get(i)
                if v is None:
                    continue
                e = _check(ctx, str(v), x, allowed, banned)
                if not e:
                    bad = unlinked_in(str(v), vocab) if slides[s]['kind'] != 'case' else []
                    if bad:
                        e = f"연결하지 않은 제품 · 솔루션 “{bad[0]}” — 이 파트의 제품 · 솔루션으로 바꿔 씁니다"
                if e:
                    out.setdefault(s, {})[i] = e
            same = [i for i, x in slots.items() if len(x['ref']) >= 6 and not x.get('sample') and x.get('mode') == 'ai' and i != 0
                    and str(got.get(s, {}).get(i) or '').strip() == x['ref']]
            content_n = sum(1 for i, x in slots.items() if len(x['ref']) >= 6 and not x.get('sample') and x.get('mode') == 'ai' and i != 0)
            same = [i for i in same if not STRUCTURAL.search(slots[i]['ref'])]
            if slides[s].get('focus') and echo_slots(s):
                for i in echo_slots(s):  # most of the slide is still the template: a firm request
                    out.setdefault(s, {}).setdefault(i, "견본 문구(ref)를 그대로 옮김 — '이 장이 답할 요구'의 내용으로 새로 씁니다")
            elif slides[s].get('focus'):
                # a slide that answers a requirement point is about that point from top to bottom: a card / row / label still as the template
                # wrote it (for another need) is sent back once — the template's label over this customer's text is the usual leftover
                for i in same:
                    out.setdefault(s, {}).setdefault(i, "이 칸만 견본 그대로 남았습니다 — 견본의 주제(다른 니즈 · 다른 제품)면 '이 장이 답할 요구'의 내용으로 바꿔 쓰고, "
                                                        "이 고객에게도 그대로 맞는 말이면 그대로 둡니다")
            elif slides[s]['kind'] in ('generic', 'journey') and content_n >= 4 and same and len(same) / content_n <= 0.5:
                # the slide was rewritten but some cards / rows still carry the template's topic: back once, to be rewritten to what this
                # part plans (or kept, when it really applies to this customer)
                for i in same:
                    out.setdefault(s, {}).setdefault(i, "이 칸만 견본 그대로 남았습니다 — 이 고객의 요구 · 이 파트의 계획과 관계없는 내용이면 계획한 내용으로 바꿔 씁니다")
            seen_v: Dict[str, int] = {}
            for i, x in sorted(slots.items()):  # the same sentence in two slots of one slide (a repeated card)
                v = re.sub(r'\s+', ' ', str(got.get(s, {}).get(i) or '')).strip()
                if (len(v) >= 12 or (x.get('label_row') and len(v) >= 2)) and x.get('mode') == 'ai':
                    if v in seen_v and slides[s]['kind'] != 'divider':
                        out.setdefault(s, {}).setdefault(i, f'같은 문장을 칸 {seen_v[v]} 과 이 칸에 두 번 썼습니다 — 이 칸은 다른 내용으로 씁니다'
                                                         if not x.get('label_row') else f'칸 {seen_v[v]} 과 같은 항목입니다 — 이 줄은 이 파트 계획의 다른 항목으로 씁니다')
                    seen_v.setdefault(v, i)
            for i, x in sorted(slots.items()):  # a sentence cell left empty (the writer took it for a figure it had no number for)
                v = got.get(s, {}).get(i)
                if (v is not None and not str(v).strip() and len(x['ref']) >= 8 and x.get('mode') == 'ai' and not x.get('num_cell') and not x.get('figure')
                        and x.get('unit_of') is None and x.get('value_of') is None and slides[s]['kind'] == 'generic' and not x.get('sample')):
                    out.setdefault(s, {}).setdefault(i, '빈 칸으로 두었습니다 — 이 칸은 문장 칸입니다. 수치가 없으면 수치 없이 같은 뜻의 문구로 씁니다')
            if slides[s]['kind'] == 'divider' and 3 in slots and _bare(str(got.get(s, {}).get(3) or '')) == _bare(part.get('name') or '') and part.get('name'):
                out.setdefault(s, {}).setdefault(3, '간지의 설명 줄이 파트 이름과 같습니다 — 이 파트가 무엇을 보여 주는지 한 줄로 씁니다')
            if slides[s].get('rfp_points'):  # 요구사항 대응 장: the requirement cell holds a requirement, not the name of a selected item
                T_ = ((lib.get('toc_slots') or {}).get(slides[s]['f']) or {}).get('t') or {}
                for k_ in range(len(slides[s]['rfp_points'])):
                    i_ = T_.get(f'rq{k_}')
                    if i_ in slots and selected_item(ctx, str(got.get(s, {}).get(i_) or '')):
                        out.setdefault(s, {}).setdefault(i_, '요구사항 칸에 제품 · 솔루션 이름을 썼습니다 — 안내에 적힌 이 줄의 요구를 항목 이름으로 줄여 씁니다')
            near: List[tuple] = []
            for i, x in sorted(slots.items()):  # almost the same sentence twice on one slide (two needs · two cards saying one thing)
                v = re.sub(r'\s+', ' ', str(got.get(s, {}).get(i) or '')).strip()
                if len(v) < 14 or x.get('mode') != 'ai' or x.get('prefix') or slides[s]['kind'] in ('divider', 'toc'):
                    continue
                hit = next(((j, w) for j, w in near if w != v and near_same(unnamed(v), unnamed(w))), None)
                if hit is not None:
                    out.setdefault(s, {}).setdefault(i, f'칸 {hit[0]}(“{hit[1][:44]}”)과 거의 같은 말입니다 — 이 칸은 그 칸과 다른 내용(다른 요구 · 다른 면 · 다른 장면)으로 씁니다')
                near.append((i, v))
            for i, x in sorted(slots.items()):  # a title · a card heading that (almost) repeats one of an earlier slide of this part
                if not (i == 1 or x.get('r') in ('title', 'heading')) or x.get('mode') != 'ai' or slides[s]['kind'] in ('divider', 'toc', 'cover'):
                    continue
                v = re.sub(r'\s+', ' ', str(got.get(s, {}).get(i) or '')).strip()
                if len(v) < 8 or STRUCTURAL.search(v):
                    continue
                hit = next((w for s2, w in heads_seen if s2 != s and near_same(unnamed(v), unnamed(w))), None)
                if hit is not None:
                    out.setdefault(s, {}).setdefault(i, f'앞 장의 “{hit[:30]}” 과(와) 거의 같은 말입니다 — 이 장만의 내용을 다른 말로 씁니다')
                heads_seen.append((s, v))
            for i, x in sorted(slots.items()):  # a heading that is a bare spec figure over a description about something else
                d = slots.get(i + 1)
                if x.get('r') != 'heading' or not d or d.get('r') not in ('dense', 'body', 'text'):
                    continue
                hv, dv = str(got.get(s, {}).get(i) or '').strip(), str(got.get(s, {}).get(i + 1) or '').strip()
                if hv and len(dv) >= 16 and re.search(r'\d', hv) and not (_fact_tokens(hv) & _fact_tokens(dv)) and not (set(re.findall(r'\d+', hv)) & set(re.findall(r'\d+', dv))):
                    out.setdefault(s, {}).setdefault(i, f'이 제목은 바로 아래 설명(칸 {i + 1})과 다른 내용입니다 — 그 설명이 말하는 기능의 이름을 2~5단어로 씁니다')
            seen_chip: Dict[tuple, int] = {}
            for i, x in sorted(slots.items()):  # the same short phrase in two sibling cells (two chips of one proposal, two cards of a row)
                v = re.sub(r'\s+', ' ', str(got.get(s, {}).get(i) or '')).strip()
                if 4 <= len(v) < 12 and x.get('mode') == 'ai' and not x.get('label_row') and slides[s]['kind'] == 'generic' and _chip(x, v):
                    key_ = (x.get('r'), v)
                    # (a label the template itself repeats — '경쟁사 A' on each of three cards — is the layout's structure, not a slip)
                    if key_ in seen_chip and slots[seen_chip[key_]].get('ref') != x.get('ref'):
                        out.setdefault(s, {}).setdefault(i, f'칸 {seen_chip[key_]} 과 같은 말입니다 — 이 칸은 다른 내용(다른 기능 · 다른 효과)으로 씁니다')
                    seen_chip.setdefault(key_, i)
            if slides[s]['kind'] == 'space' and slides[s]['bind'].get('product') and not slides[s].get('same_product'):
                for i, x in slots.items():  # the template's lines describe another product
                    if x.get('mode') == 'product' and len(x['ref']) >= 8 and str(got.get(s, {}).get(i) or '').strip() == x['ref']:
                        out.setdefault(s, {}).setdefault(i, '견본은 다른 제품의 특징입니다 — 묶인 제품의 사양 · 특징으로 새로 씁니다')
            if slides[s]['kind'] == 'spec':  # a column per product: a cell speaks of its own column's product only
                others = {x['of'] for x in slots.values() if x.get('of')}
                for i, x in slots.items():
                    if not x.get('of'):
                        continue
                    v = str(got.get(s, {}).get(i) or '').strip()
                    other = next((o for o in others if o != x['of'] and o in v and o not in x['of']), None)
                    if other:
                        out.setdefault(s, {}).setdefault(i, f"이 칸은 “{x['of']}” 열입니다 — “{other}” 가 아니라 이 열 제품의 사실만 씁니다")
                    elif v == x['ref'] and x.get('of_was') and x['of_was'] != x['of']:
                        out.setdefault(s, {}).setdefault(i, f"견본은 다른 제품(“{x['of_was']}”)의 {'항목 이름' if x['cell'] == 'label' else '값'}입니다 — 이 열의 제품 “{x['of']}” 에 맞는 "
                                                            + ('항목 이름으로 씁니다(이 제품에도 맞는 항목이면 그대로)' if x['cell'] == 'label' else '사실(자료의 사양 · 특징)로 씁니다'))
        # an item the plan gave to this part must be named somewhere in it (a template without a slide for the item still mentions it)
        shown = ' '.join([str(v) for sl in slides for v in (sl.get('lock') or {}).values() if v] + [str(v) for row in got.values() for v in row.values()]
                         + [plain(v) for sl in slides for k, v in sl['ex_t'].items() if 'lock' in next((x for x in sl.get('_slots') or [] if str(x['i']) == k), {'lock': 1})])
        cap_ = part.get('cap') or {}  # only for item kinds this part is the home of (a part that merely mentions an item need not name it)
        names = [ctx['short'].get(q) or q for q in (list(pp.get('products') or []) if cap_.get('products') or cap_.get('points') else [])
                 + (list(pp.get('solutions_own') or []) if cap_.get('solutions') or cap_.get('points') else [])]
        missing = [n for n in dict.fromkeys(names) if n and n not in shown][:3]
        if missing:
            room = sorted(((x['max'], s, i) for s, slots in want.items() if slides[s]['kind'] in ('generic', 'journey', 'spec', 'bom', 'dss')
                           for i, x in slots.items() if x['max'] >= 45 and i not in (0, 1) and i not in out.get(s, {})), reverse=True)
            for name, (mx, s, i) in zip(missing, room):
                if mx >= len(name) + 12:
                    out.setdefault(s, {})[i] = f"이 파트가 맡은 “{name}” 이(가) 파트 어디에도 없습니다 — 이 칸에서 그 이름을 자료 그대로 넣어 다시 씁니다"
        return out
    # one repair pass, only for the slots that broke a rule
    bad = problems()
    if bad:
        head_of = {s: t.split('\n  {"i"')[0] for s, _, t in blocks}
        rows = []
        for s, slots in bad.items():
            rows.append(head_of[s])
            for i, e in slots.items():
                x = want[s][i]
                first = got.get(s, {}).get(i)  # (a slide whose answer was not used has no first answer: the template text stands there)
                rows.append('  ' + _j_slot(x)[:-1] + f', "먼저 쓴 답": {_j(str(first if first is not None else x["ref"])[:120])}, "문제": {_j(e)}}}')
        prompt = (head + '\n\n먼저 쓴 답 가운데 아래 칸이 규칙에 어긋났습니다. 이 칸들만, 적힌 문제를 고쳐 다시 씁니다(글자 수가 넘친 칸은 뜻을 줄여 max 이내의 완결된 문구로, '
                  '견본을 옮긴 칸은 이 고객 내용으로 새로).\n\n고칠 칸:\n' + '\n'.join(rows) + '\n' + tail + ' — 위에 적힌 칸만 넣습니다.')
        def only_asked(d) -> Any:
            g = _got(d)
            if not g:
                return '고칠 칸의 답을 slides 에 넣으세요.'
            off = [s_ for s_, row_ in g.items() if s_ not in bad or not aligned(s_, row_, bad[s_])]
            if off:  # a whole slide written again with its cells counted anew: the values would land in the wrong cells
                extra = [(s_, i_) for s_ in off for i_ in g[s_] if s_ not in bad or i_ not in bad[s_]]
                return ('고칠 칸으로 적힌 칸만 답합니다 — 묻지 않은 칸(' + ', '.join(f's={s_} i={i_}' for s_, i_ in extra[:8])
                        + ')은 넣지 않고, 칸 번호 i 는 적힌 그대로 씁니다.')
            return True
        try:
            d = llm.json(stage='auto_text_repair', prompt=prompt, schema=schema, temperature=0.4, max_tokens=6000, validate=only_asked)
            for s, row in _got(d).items():
                if s not in bad or not aligned(s, row, bad[s]):
                    continue
                for i, v in row.items():
                    if s in bad and i in bad[s]:
                        x = want[s][i]
                        old = str(got.get(s, {}).get(i) if got.get(s, {}).get(i) is not None else x['ref'])
                        # keep the new value unless it is worse (still the reference, or now breaking a rule the old one did not)
                        if str(v).strip() == x['ref'] and old.strip() != x['ref']:
                            continue
                        if bad[s][i].startswith('이 파트가 맡은') and len(str(v).strip()) < max(16, len(old.strip()) // 2):
                            continue  # asked to name the item inside the sentence — the bare name is not a sentence
                        got.setdefault(s, {})[i] = v
        except Exception as exc:  # noqa: BLE001
            if getattr(exc, 'code', '') != 'invalid_output':
                raise
        left = problems()
        hard = [(s_, i_) for s_, slots_ in left.items() for i_ in slots_
                if slides[s_]['kind'] != 'case' and got.get(s_, {}).get(i_) is not None and unlinked_in(str(got[s_][i_]), vocab)][:12]
        if hard:  # a slot that still names a product type / topic this customer did not link: asked once more, on its own
            rows = '\n'.join(f'{{"n":{n},"max":{want[s_][i_]["max"]},"text":{_j(str(got[s_][i_]).strip())},"쓰면 안 되는 것":{_j(", ".join(unlinked_in(str(got[s_][i_]), vocab)))}}}'
                             for n, (s_, i_) in enumerate(hard))
            sch = {'type': 'OBJECT', 'properties': {'items': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'n': {'type': 'INTEGER'}, 'text': {'type': 'STRING'}},
                                                                                    'required': ['n', 'text']}}}, 'required': ['items']}
            names = ', '.join(ctx['short'].get(q) or q for q in list(pp.get('products') or ctx['products'])[:4] + list(pp.get('solutions') or ctx['solutions'])[:4])
            prompt = (f"제안서 장표의 짧은 문구입니다. 각 문구에는 이 고객이 연결하지 않은 제품 · 주제('쓰면 안 되는 것')가 들어 있습니다. 그 내용을 빼고, 이 고객의 제품 · 솔루션({names})과 "
                      f"요구({' / '.join(x['text'] for x in plan['points'])[:300]})에 맞는 같은 길이의 문구로 바꿔 씁니다. max 글자 이내, 새 수치는 쓰지 않습니다.\n"
                      + rows + '\nJSON만: {"items":[{"n":0,"text":"…"}]}')
            try:
                d2 = llm.json(stage='auto_text_repair', prompt=prompt, schema=sch, temperature=0.4, max_tokens=2000,
                              validate=lambda d: True if isinstance(d.get('items'), list) and d['items'] else 'items 를 채우세요.')
                for it in d2.get('items') or []:
                    if isinstance(it, dict) and isinstance(it.get('n'), int) and 0 <= it['n'] < len(hard) and isinstance(it.get('text'), str):
                        s_, i_ = hard[it['n']]
                        new = it['text'].strip()
                        if new and not unlinked_in(new, vocab) and not _check(ctx, new, {**want[s_][i_], 'max': want[s_][i_]['max'] + 6}, allowed, banned):
                            got[s_][i_] = new
            except Exception as exc:  # noqa: BLE001
                if getattr(exc, 'code', '') != 'invalid_output':
                    raise
            for s_, i_ in hard:  # a short label that still names it is emptied (an empty chip beats a claim about something not offered)
                if unlinked_in(str(got[s_][i_]), vocab) and want[s_][i_].get('unit_of') is not None and want[s_][i_].get('prefix'):
                    got[s_][i_] = want[s_][i_]['prefix'].rstrip(' ·')
                elif unlinked_in(str(got[s_][i_]), vocab) and want[s_][i_]['max'] <= 24:
                    got[s_][i_] = ''
                    slides[s_].setdefault('emptied', []).append(i_)
            left = problems()
        if left:
            part.setdefault('warnings', []).append(f"문구 검증: 고친 뒤에도 남은 칸 {sum(len(v) for v in left.values())}개(가려 쓰거나 표시)")
    def echo_ratio(s: int) -> float:
        xs = [x for x in want[s].values() if len(x['ref']) >= 10 and not x.get('sample') and not STRUCTURAL.search(x['ref'])]
        return sum(1 for x in xs if (got.get(s, {}).get(x['i']) or x['ref']).strip() == x['ref']) / max(1, len(xs)) if len(xs) >= 4 else 0.0
    # a slide that answers this customer's requirement but still reads as the template after the repair (the model sometimes hands a
    # whole part back as it got it): asked once more on its own, told so — the template's needs and scenes are another customer's
    for s in [s for s in want if slides[s].get('focus') and echo_ratio(s) >= 0.5]:
        was, r0 = dict(got.get(s, {})), echo_ratio(s)
        text = next(t for s_, _, t in blocks if s_ == s) + ("\n  ※ 앞선 답은 이 장의 견본 문구(ref)를 거의 그대로 옮겼습니다. 견본은 다른 고객의 니즈 · 장면입니다 — 위 '묶인 대상'에 적힌 "
                                                           "이 고객의 요구와 이 파트의 제품 · 솔루션으로 이 장의 모든 칸을 새로 씁니다(같은 꼴 · 같은 길이로).")
        try:
            ask([(s, text)], 3, 0.6)
        except Exception as exc:  # noqa: BLE001 — a second chance: a failed call leaves the slide as it was
            if type(exc).__name__ == 'JobCancelled':
                raise
            got[s] = was
            continue
        if echo_ratio(s) >= r0:
            got[s] = was
        else:
            slides[s]['rewritten'] = True
    for s in want:
        if slides[s].get('focus'):
            xs = [x for x in want[s].values() if len(x['ref']) >= 10 and not x.get('sample') and not STRUCTURAL.search(x['ref'])]
            slides[s]['echo'] = round(sum(1 for x in xs if (got.get(s, {}).get(x['i']) or x['ref']).strip() == x['ref']) / max(1, len(xs)), 2)
    # a space slide whose product changed and whose feature lines are still the template's (another product's) after the repair:
    # the bound product's own catalog facts go in — never another product's features under this product's name
    for s, slots in want.items():
        sl = slides[s]
        if sl['kind'] != 'space' or not sl['bind'].get('product') or sl.get('same_product'):
            continue
        stale = [x for i, x in sorted(slots.items()) if x.get('mode') == 'product' and len(x['ref']) >= 8 and str(got.get(s, {}).get(i) or x['ref']).strip() == x['ref']]
        if not stale:
            continue
        facts_ = {}
        for x in stale:
            if (q_ := _cell_product(sl, x['i'])) not in facts_:  # a several-product sheet: each card's own product
                pf = lib['products_all'].get(q_) or {}
                hd = [str(k) for k in (pf.get('kw') or []) if 2 <= len(str(k)) <= 24] + [str(pf.get('cat') or '')]
                ln_ = [str(pf.get('spec') or '')] + [str(r) for r in (pf.get('specs') or [])] + [str(pf.get('opt') or '')]
                facts_[q_] = ([h for h in hd if h], [v for v in ln_ if v])
            heads, lines = facts_[q_]
            src = heads if x['max'] <= 34 else lines
            val = next((v for v in src if len(v) <= x['max'] + 6), '')
            if val:
                src.remove(val)
            got.setdefault(s, {})[x['i']] = val
            sl.setdefault('fact_filled', []).append(x['i'])
    for s, slots in want.items():  # a chip that still repeats its sibling after the repair: the later one is emptied
        if slides[s]['kind'] != 'generic':
            continue
        seen_c: Dict[tuple, str] = {}
        for i, x in sorted(slots.items()):
            v = re.sub(r'\s+', ' ', str(got.get(s, {}).get(i) or '')).strip()
            if 4 <= len(v) < 12 and x.get('mode') == 'ai' and not x.get('label_row') and _chip(x, v):
                if (x.get('r'), v) in seen_c and seen_c[(x.get('r'), v)] != x.get('ref'):
                    got.setdefault(s, {})[i] = ''
                    slides[s].setdefault('emptied', []).append(i)
                seen_c.setdefault((x.get('r'), v), x.get('ref'))
    for s, slots in want.items():  # 요구사항 대응 장: a requirement cell still holding an item's name after the repair → the point itself
        T_ = ((lib.get('toc_slots') or {}).get(slides[s]['f']) or {}).get('t') or {}
        g_ = {tt['i']: tt for tt in (lib['layouts'].get(slides[s]['f']) or {}).get('texts') or []}
        for k_, text_ in enumerate(slides[s].get('rfp_points') or []):
            i_ = T_.get(f'rq{k_}')
            if i_ in slots and selected_item(ctx, str(got.get(s, {}).get(i_) or '')):
                bare_ = re.sub(r'\s*(을|를)?\s*(요구합니다|필요로 합니다|해야 합니다|해야 한다|합니다|한다|입니다)\.?$', '', text_).strip()
                got.setdefault(s, {})[i_] = bare_ if box_fits(g_.get(i_), bare_) else trim_to_box(bare_, slots[i_]['max'], g_.get(i_))
                slides[s].setdefault('fact_filled', []).append(i_)
    for s, slots in want.items():  # a row label that still repeats another row after the repair: the later row is emptied
        seen_lb: Set[str] = set()
        for i, x in sorted(slots.items()):
            if not x.get('label_row'):
                continue
            v = re.sub(r'\s+', ' ', str(got.get(s, {}).get(i) if got.get(s, {}).get(i) is not None else x['ref'])).strip()
            if v and v in seen_lb:
                got.setdefault(s, {})[i] = ''
                slides[s].setdefault('emptied', []).append(i)
            seen_lb.add(v)
    # a spec column whose product changed and whose values are still the template product's after the repair: cleared (an empty cell
    # beats another product's figures under this product's name)
    for s, slots in want.items():
        if slides[s]['kind'] != 'spec':
            continue
        for i, x in slots.items():
            if x.get('cell') == 'value' and x.get('of_was') and x['of_was'] != x['of'] and str(got.get(s, {}).get(i) or x['ref']).strip() == x['ref']:
                got.setdefault(s, {})[i] = ''
                slides[s].setdefault('emptied', []).append(i)
    for s in want:
        if slides[s]['kind'] == 'spec':
            _spec_rows(ctx, slides[s], want[s], got.setdefault(s, {}))
    # values that neither fit their budget nor their box: a small call that only shortens them (a cut sentence is worse than a short
    # one) — asked once more, firmly, for the ones still too long; only what is left after that is cut
    slack = lambda x: x['max'] + max(3, x['max'] // 4)
    geo_of = lambda s: {tt['i']: tt for tt in (lib['layouts'].get(slides[s]['f']) or {}).get('texts') or []}
    fits = lambda s, i, x, v: len(v) <= slack(x) or box_fits(geo_of(s).get(i), v, x.get('ref') or '')
    cust_ = ctx.get('customer') or ''
    for s, slots in want.items():  # a line that opens with the customer's name and does not fit: the name goes (the subject is
        for i, x in slots.items():  # understood) — otherwise the cut leaves the name alone ('포레스트호텔 운영본부')
            v = str(got.get(s, {}).get(i) or '').strip()
            if cust_ and v.startswith(cust_) and not fits(s, i, x, v) and slides[s]['kind'] not in ('cover', 'divider', 'toc') and i != 1:
                rest_ = re.sub(r'^' + re.escape(cust_) + r'(?:은|는|이|가|의|에서는|에서|에게|에)?\s*', '', v)
                if len(rest_) >= 6:
                    got[s][i] = rest_
    over = [(s, i, x) for s, slots in want.items() for i, x in slots.items()
            if got.get(s, {}).get(i) is not None and not fits(s, i, x, str(got[s][i]).strip())]
    sch = {'type': 'OBJECT', 'properties': {'items': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'n': {'type': 'INTEGER'}, 'text': {'type': 'STRING'}},
                                                                            'required': ['n', 'text']}}}, 'required': ['items']}
    for attempt in range(2):
        if not over:
            break
        rows = '\n'.join(f'{{"n":{n},"max":{x["max"]},"text":{_j(str(got[s][i]).strip())}}}' for n, (s, i, x) in enumerate(over))
        prompt = ('제안서 장표의 칸에 넣기에는 긴 문구입니다. 뜻(고객 · 제품 이름과 수치는 그대로)을 지키면서 각 문구를 max 글자 이내의 완결된 짧은 문구로 줄입니다. '
                  '문장을 중간에서 끊지 말고, 덜 중요한 수식어를 뺍니다. 새 사실을 더하지 않습니다.'
                  + (' 앞서 줄인 문구가 아직 칸보다 깁니다 — 이번에는 반드시 max 글자 이내로, 문장으로 끝맺기 어려우면 핵심 명사구만 남깁니다(예: “층별 순차 교체”).' if attempt else '')
                  + '\n' + rows + '\nJSON만: {"items":[{"n":0,"text":"…"}]}')
        try:
            d = llm.json(stage='auto_text_shorten', prompt=prompt, schema=sch, temperature=0.2, max_tokens=3000,
                         validate=lambda d: True if isinstance(d.get('items'), list) and d['items'] else 'items 를 채우세요.')
            for it in d.get('items') or []:
                if isinstance(it, dict) and isinstance(it.get('n'), int) and 0 <= it['n'] < len(over) and isinstance(it.get('text'), str):
                    s_, i_, x_ = over[it['n']]
                    new = it['text'].replace('\\n', '\n').strip()
                    if new and len(new) < len(str(got[s_][i_]).strip()) and not _check(ctx, new, {**x_, 'max': max(slack(x_), len(new))}, allowed, banned):
                        got[s_][i_] = new  # shorter is kept even when still over — the next round (or the cut) starts from it
        except Exception as exc:  # noqa: BLE001
            if getattr(exc, 'code', '') != 'invalid_output':
                raise
        over = [(s, i, x) for s, i, x in over if not fits(s, i, x, str(got[s][i]).strip())]
    if ctx['products'] or ctx['solutions']:
        verify_claims(ctx, part, slides, want, got, llm, vocab)
    for s_, sl_ in enumerate(slides):
        if sl_['f'] == 'L_VS_NEEDS' and sl_.get('img_bind') and s_ in got:
            _realign_needs(ctx, sl_, got[s_])
    _finish_text(ctx, slides, got)
    _align_names(ctx, slides)


def claim_subject(ctx: dict, sl: dict, x: dict, v: str) -> Optional[tuple]:
    """the selected product · solution a written line says something about — ('product' | 'solution', id) or None.

    The item the line names. A line that names none is a claim about an item only where the cell is that item's own line: a
    feature line of a 공간별 제품 장 (the slide's product), a cell of a 핵심 기술 column (the column's item). A scene step
    ('이닝 사이 매점에 줄이 깁니다') or a need names no item and claims nothing about one."""
    hit = _pictures.match_entity(v, ctx)
    if hit.get('product'):
        return ('product', hit['product'])
    if hit.get('solution'):
        return ('solution', hit['solution'])
    b = sl.get('bind') or {}
    if sl['kind'] == 'space' and b.get('product') and x.get('mode') == 'product':
        q_ = _cell_product(sl, x['i'])
        return ('product', q_) if q_ else None
    if sl['kind'] == 'tech':
        T = ((load().get('toc_slots') or {}).get(sl['f']) or {}).get('t') or {}
        name = next((n for n, j in T.items() if int(j) == x['i']), '')
        m = re.fullmatch(r'(?:in|kw|kl)(\d)(?:_\d)?', name)
        cols = b.get('columns') or [('s', q) for q in b.get('solutions') or []]
        if m and int(m.group(1)) < len(cols):
            k, q = cols[int(m.group(1))]
            return ('solution' if k == 's' else 'product', q)
    return None


def verify_claims(ctx: dict, part: dict, slides: List[dict], want: Dict[int, Dict[int, dict]], got: Dict[int, Dict[int, str]], llm, vocab: Sequence[tuple]) -> None:
    """what a written line says a selected product · solution does is checked against that item's own facts (one small call).

    The writer adapts the template's scenes to the customer's items and, pressed to use only those, hands them the template
    product's job ('LED 사이니지가 주문을 나눠 받습니다' · a billing solution that switches the air conditioning off). A line the
    check rejects is rewritten by the checker to what the item really does (or to the selected item that does that job); a line
    it rejects without a usable rewrite is emptied — an empty cell beats a capability the item does not have."""
    claims: List[tuple] = []
    for s, slots in want.items():
        sl = slides[s]
        if sl.get('fixed') or sl.get('keep') or sl['kind'] in ('case', 'static', 'divider', 'toc', 'cover', 'bird', 'map', 'bom'):
            continue
        for i, x in sorted(slots.items()):
            v = str(got.get(s, {}).get(i) or '').strip()
            if len(v) < 12 or x.get('num_cell') or x.get('unit_of') is not None or x.get('figure') or mkt.locked(sl, str(i)):
                continue
            it = claim_subject(ctx, sl, x, v)
            if not it:
                continue
            named = bool(_pictures.match_entity(v, ctx))
            if not re.search(r'(니다|해요|어요|세요|한다|된다|하고|하며|해서|하여|[가-힣]로\s|[가-힣]으로\s)', v + ' ') and not (named and re.search(r'[·:—–-]\s*\S{2,}', v)):
                continue  # a bare name or a noun phrase claims nothing — 'Flip Pro · 개인정보 가림' (item · feature) does
            claims.append((s, i, it, v))
    if not claims:
        return
    claims = claims[:36]
    items = list(dict.fromkeys(it for _, _, it, _ in claims))
    alias = {it: f'A{n + 1}' for n, it in enumerate(items)}
    others = [it for it in [('product', q) for q in ctx['products']] + [('solution', q) for q in ctx['solutions']] if it not in alias][:8]
    for it in others:
        alias[it] = f'A{len(alias) + 1}'
    facts = '\n'.join(f"{a} = {item_knowledge(it)}" for it, a in alias.items())
    rows = '\n'.join(f'{{"n":{n},"item":"{alias[it]}","max":{want[s][i]["max"]},"text":{_j(v)}}}' for n, (s, i, it, v) in enumerate(claims))
    sch = {'type': 'OBJECT', 'properties': {'items': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
        'n': {'type': 'INTEGER'}, 'ok': {'type': 'BOOLEAN'}, 'why': {'type': 'STRING'}, 'fix': {'type': 'STRING'}}, 'required': ['n', 'ok']}}}, 'required': ['items']}
    prompt = f"""삼성전자 B2B 제안서 문구의 사실 검수입니다. 각 문구는 item 에 적힌 항목(제품 · 솔루션)이 무엇을 한다고 말합니다. 아래 '항목 자료'에 비추어 그 항목이 실제로 하는 일인지 판정합니다.

판정
- ok=true: 자료에 적힌 기능 · 사양이거나, 그 종류의 제품이 당연히 하는 일입니다 — 화면(TV · 사이니지)은 어떤 내용이든 보여 주고 안내한다 · 에어컨은 냉난방하고 절전한다 · 관리 솔루션은 기기를 원격으로 보고 제어한다 · 태블릿은 기록 · 서명 · 조회에 쓰인다. 그 기능을 이 고객의 현장 장면으로 풀어 쓴 것, 여러 항목을 함께 써서 얻는 효과를 말한 것도 ok 입니다. 더 알맞은 항목이 따로 있다는 것만으로는 false 가 아닙니다. 애매하면 ok 입니다.
- ok=false: 그 종류의 제품이 할 수 없는 일을 한다고 쓴 경우만입니다(화면이 주문을 받거나 신호를 연동한다 · 에어컨이 결제한다 · 과금 솔루션이 냉난방을 끈다 · TV 관리 솔루션이 공조를 제어한다 · 공조 관제 솔루션이 노트북을 관리한다), 또는 자료에 없는 인증 · 수상 · 보증 · 법규 준수를 말한 경우.

ok=false 인 문구는 fix 에 고쳐 씁니다 — 원래 문장을 그대로 두고 틀린 부분만 바꿉니다(max 글자 이내, 같은 말투). fix 에는 A1 · A2 같은 기호를 쓰지 않고 항목의 이름을 씁니다. 그 일을 실제로 하는 항목이 아래 자료에 있으면 주어만 그 항목 이름으로 바꾸고, 없으면 틀린 구절만 빼거나 item 항목이 자료대로 하는 일로 바꿉니다. 새 수치는 쓰지 않습니다.

항목 자료
{facts}

문구
{rows}
JSON만: {{"items":[{{"n":0,"ok":true}},{{"n":1,"ok":false,"why":"…","fix":"…"}}]}} — 모든 n 을 넣습니다."""
    try:
        d = llm.json(stage='auto_text_verify', prompt=prompt, schema=sch, temperature=0.0, max_tokens=4000,
                     validate=lambda d: True if isinstance(d.get('items'), list) and d['items'] else 'items 를 채우세요.')
    except Exception as exc:  # noqa: BLE001 — the check is a second opinion: a failed call leaves the text as written
        if getattr(exc, 'code', '') in ('cancelled',) or type(exc).__name__ == 'JobCancelled':
            raise
        part.setdefault('warnings', []).append('기능 설명 검수를 하지 못함(모델 응답 없음)')
        return
    fixed = dropped = 0
    words = lambda t: {w for w in re.findall(r'[가-힣A-Za-z0-9]{2,}', t)}
    names_of = lambda it: [n for n in ([ctx['short'].get(it[1])] + (product_names(it[1]) if it[0] == 'product' else solution_aliases(it[1]))) if n]
    for r in d.get('items') or []:
        if not isinstance(r, dict) or not isinstance(r.get('n'), int) or not (0 <= r['n'] < len(claims)) or r.get('ok') is not False:
            continue
        s, i, it, v = claims[r['n']]
        x = want[s][i]
        new = str(r.get('fix') or '').replace('\\n', '\n').strip()
        slack = x['max'] + max(3, x['max'] // 4)
        usable = bool(new and new != v and len(new) <= slack and not unlinked_in(new, vocab)
                      and not re.search(r'(?<![A-Za-z0-9])A\d{1,2}(?![A-Za-z0-9])', new)  # the checker's own label for an item ('A1과 호텔 TV …') is not a name
                      and not _check(ctx, new, {**x, 'max': max(x['max'], len(new))}, ctx['allowed'], ctx['banned']))
        # a rewrite is taken when it is the same line with the wrong part changed (the subject swapped · a clause dropped), or still
        # a line about the same item — not when the checker wrote another sentence altogether (its opinion of what would read better)
        near_fix = usable and (len(words(v) & words(new)) / max(1, len(words(v) | words(new))) >= 0.5 or any(n in new for n in names_of(it)))
        same_again = usable and any(str(got.get(s, {}).get(j) or '').strip() == new for j in want[s] if j != i)
        boast = bool(re.search(r'인증|수상|보증|준수|특허|세계 최초|업계 최초|1위|유일', v)) and not re.search(r'인증|수상|보증|준수|특허|최초|1위|유일', item_knowledge(it))
        if near_fix and not same_again:
            got[s][i] = new
            slides[s].setdefault('claim_fixed', {})[str(i)] = {'was': v, 'why': _s(r.get('why'), 120)}
            fixed += 1
        elif boast or (near_fix and same_again):
            got[s][i] = ''  # a certificate · an award the item's facts do not hold (or a rewrite that would repeat its neighbour): no line beats that one
            slides[s].setdefault('claim_dropped', {})[str(i)] = {'was': v, 'why': _s(r.get('why'), 120)}
            slides[s].setdefault('emptied', []).append(i)
            dropped += 1
    if fixed or dropped:
        part.setdefault('notes', []).append(f"기능 설명 검수: 항목 자료와 맞지 않는 문구 {fixed + dropped}곳" + (f" 고침 {fixed}" if fixed else '') + (f" · 비움 {dropped}" if dropped else ''))


def _realign_needs(ctx: dict, sl: dict, row: Dict[int, str]) -> None:
    """니즈 장: the 기술 cell (and picture) of a column follows what the column's 핵심 제안 came to name.

    The layout stage gave each column a different selected item before the text was written; when the two proposal chips of a
    column name another selected item instead (the comfort need answered by the 무풍 unit, not by the item planned for it), the
    column shows that one — unless another column already does."""
    bind, lock = sl['img_bind'], sl.setdefault('lock', {})
    cur = {k: next(iter(bind[str(k)].values())) for k in range(3) if str(k) in bind}
    for k in sorted(cur):
        a, b = 11 + 7 * k, 12 + 7 * k
        if a in row and b in row and not str(row.get(a) or '').strip() and not str(row.get(b) or '').strip():
            row[a] = ctx['short'].get(cur[k]) or cur[k]  # both chips emptied by the guard: the proposal still names its own item
        named: List[str] = []
        for i in (11 + 7 * k, 12 + 7 * k, 10 + 7 * k):
            it = selected_item(ctx, str(row.get(i) or ''))
            if it and it[1] not in named:
                named.append(it[1])
        if not named:
            continue
        if cur[k] not in named:
            taken = {v for kk, v in cur.items() if kk != k}
            new = next((q for q in named if q not in taken), None)
            if new:
                cur[k] = new
                lock[str(8 + 7 * k)] = ctx['short'].get(new) or new
                bind[str(k)] = {'product': new} if new in ctx['products'] else {'solution': new}
        rest = [q for q in named if q != cur[k]]
        lock[str(9 + 7 * k)] = ('※ ' + ' · '.join(ctx['short'].get(q) or q for q in rest[:2])) if rest else ''
    for x in sl.get('_slots') or []:  # the slot plan was drawn before the text: its locked values follow
        if 'lock' in x and str(x['i']) in lock and x['i'] in [8 + 7 * k for k in cur] + [9 + 7 * k for k in cur]:
            x['lock'] = lock[str(x['i'])]


def _align_names(ctx: dict, slides: List[dict]) -> None:
    """names that appear in several places of one part are made one by code: the 니즈 장's proposal names → the 핵심 제안 장 eyebrows,
    and a 간지 row takes the eyebrow tail of the slide it points to."""
    needs = next((sl for sl in slides if sl['f'] == 'L_VS_NEEDS' and not sl.get('keep')), None)
    if needs is not None:
        for sl in slides:
            m = re.match(r'L_VS_CORE_(\d)$', sl['f'])
            if not m or sl.get('keep'):
                continue
            name = plain((needs.get('t') or {}).get(str(10 + 7 * (int(m.group(1)) - 1))))
            pre = (sl.get('prefix') or {}).get('0')
            if name and pre:
                sl['t']['0'] = pre + name
                flag = unlinked_in(pre + name, ctx.get('unlinked') or ())
                if flag:
                    sl.setdefault('unlinked', {})['0'] = flag
                else:
                    (sl.get('unlinked') or {}).pop('0', None)
        fc = needs.get('focus') or {}
        pmap = {x['id']: x for x in (ctx.get('plan_points') or [])}
        for k in range(3):  # '※ …' under the technology picture: the items of that column (the template's note names its own products)
            key = str(9 + 7 * k)
            cur = plain((needs.get('t') or {}).get(key))
            if not cur.startswith('※') or cur != plain(needs['ex_t'].get(key)) and not unlinked_in(cur, ctx.get('unlinked') or ()):
                continue
            tech = plain(needs['t'].get(str(8 + 7 * k)))
            r = fc['points'][k] if k < len(fc.get('points') or []) else None
            its = [ctx['short'].get(q) or q for q in ((pmap.get(r) or {}).get('products') or []) + ((pmap.get(r) or {}).get('solutions') or [])] if r else []
            its = [x for x in its if x and x not in tech and tech not in x][:2]
            needs['t'][key] = ('※ ' + ' · '.join(its))[:26] if its else ''
            (needs.get('unlinked') or {}).pop(key, None)
    div = next((sl for sl in slides if sl['kind'] == 'divider' and not sl.get('keep') and not sl.get('fixed')), None)
    if div is None:
        return
    after = [sl for sl in slides if sl is not div and sl['kind'] != 'toc']
    base = slides.index(div) + 1
    n_rows = int(DIV.match(div['f']).group(1))
    for r in range(n_rows):
        k = str(6 + 3 * r)
        if k in (div.get('lock') or {}):
            continue
        pg = plain(div['t'].get(str(7 + 3 * r)))
        m = re.match(r'(\d+)', pg)
        first_pg = int(plain(div['t'].get(str(5 + 3 * n_rows))).split('·')[-1]) + 1 if CONF.match(plain(div['t'].get(str(5 + 3 * n_rows)))) else None
        if not m or first_pg is None:
            continue
        j = int(m.group(1)) - first_pg
        if 0 <= j < len(after):
            e = plain((after[j].get('t') or {}).get('0'))
            mm = EYEBROW.match(e)
            segs = mm.group(2).split(' · ') if mm else []
            if len(segs) >= 2 and not re.fullmatch(r'\d{2}', segs[-1]) and not (after[j].get('lock') or {}).get('0'):
                div['t'][k] = segs[-1]
                continue
            # a row names the slide it points to — a figure or a cell value of that slide ('220nit') is not a name: the template's row label
            # goes back when it fits this deck, else the slide's own title
            cur = plain(div['t'].get(k))
            cells = {plain(v) for kk, v in (after[j].get('t') or {}).items() if kk not in ('0', '1')}
            if cur and (re.match(r'[\d\[]', cur) or cur in cells and re.search(r'\d', cur)):
                ref = plain((div.get('edit_ref') or {}).get(k))
                title = plain((after[j].get('t') or {}).get('1')).split('\n')[0]
                ok = lambda v: bool(v) and not re.match(r'[\d\[]', v) and not unlinked_in(v, ctx.get('unlinked') or ()) and v not in cells
                div['t'][k] = ref if ok(ref) else (title[:24] if ok(title) else after[j]['role'].split(' — ')[0][:24])


SPEC_LABELS = ('크기', '화면', '강점', '공간', '용도', '특징')


def _spec_rows(ctx: dict, sl: dict, slots: Dict[int, dict], got: Dict[int, str]) -> None:
    """spec rows are label / value pairs — code keeps the pairs straight.

    One-product sheet (sl{k} / sv{k}): when a value cell holds a label or a label cell a figure, the pairs slid; the catalog's own
    'label: value' lines go in instead. Product-per-column sheet: a row label still the template's for another kind of product
    ('바람' over a TV) becomes '크기' (the value is a size) or '특징'."""
    names = ((load().get('toc_slots') or {}).get(sl['f']) or {}).get('t') or {}
    cur = lambda i: str(got.get(i) if got.get(i) is not None else slots[i]['ref']).strip()
    prods_ = (sl.get('bind') or {}).get('products') or []
    for name, j in names.items():  # the '공간' row of a product column = the planned spaces that product stands in (the deck's own plan)
        m = re.fullmatch(r'sv(\d)_(\d)', name)
        li = names.get(f'sl{m.group(1)}_{m.group(2)}') if m else None
        if not m or li is None or int(j) not in slots or int(m.group(1)) >= len(prods_):
            continue
        label = cur(int(li)) if int(li) in slots else str((sl.get('lock') or {}).get(str(li)) or plain((sl.get('ex_t') or {}).get(str(li))) or '').strip()
        where = [x_['name'] for x_ in ctx.get('spaces') or [] if prods_[int(m.group(1))] in (x_.get('products') or [])]
        if label == '공간' and where:
            got[int(j)] = ' · '.join(where[:2])
    for i, x in slots.items():
        if x.get('cell') == 'label' and x.get('of_was') and x['of_was'] != x['of'] and cur(i) == x['ref'] and x['ref'] not in SPEC_LABELS:
            val = next((cur(j) for n, j in names.items() if n == next((k for k, v in names.items() if v == i), '').replace('sl', 'sv') and j in slots), '')
            got[i] = '크기' if re.search(r'\d\s?(형|인치|cm|mm)', val) else '특징'
            sl.setdefault('fact_filled', []).append(i)
    pairs = [(int(names[f'sl{k}']), int(names[f'sv{k}'])) for k in range(12) if f'sl{k}' in names and f'sv{k}' in names]
    pairs = [(a, b) for a, b in pairs if a in slots and b in slots]
    pid = ((sl.get('bind') or {}).get('products') or [None])[0]
    if len(pairs) < 3 or not pid:
        return
    rows = []
    for line in (load()['products_all'].get(pid) or {}).get('specs') or []:
        k, _, v = str(line).partition(':')
        k, v = re.sub(r'\s*\([^)]*\)\s*$', '', k).strip(), v.strip()
        if k and v:
            rows.append((k, v))
    keys = {k for k, _ in rows}
    labels = [cur(a) for a, _ in pairs]
    slid = any((cur(b) in keys or cur(b) in labels) for _, b in pairs if cur(b)) or any(re.fullmatch(r'[\d.,/x× ]+\s?\S{0,4}', cur(a)) for a, _ in pairs if cur(a))
    if not slid or len(rows) < 3:
        return
    fit = [(k, v) for k, v in rows if len(k) <= slots[pairs[0][0]]['max'] + 4 and len(v) <= slots[pairs[0][1]]['max'] + 8]
    for n, (a, b) in enumerate(pairs):
        got[a], got[b] = fit[n] if n < len(fit) else ('', '')
        sl.setdefault('fact_filled', []).extend([a, b])


def _foreign_lock(slides: List[dict], ids: Sequence[int], s: int, i: int, v: str) -> bool:
    """the value is the fixed wording another slide of the same call holds in the cell of the same number."""
    v = str(v).strip()
    return len(v) >= 4 and any(s2 != s and plain((slides[s2].get('lock') or {}).get(str(i))) == v for s2 in ids)


PLACEHOLDER_ONLY = re.compile(r'\[0+\]')
# what a figure row's label measures → (units of that kind, the unit used when the written one is of another kind)
UNIT_KINDS = [(r'(시간|기간|일수)$', re.compile(r'^(초|분|시간|일|주|개월|달|년)$'), '시간'),
              (r'(율|률|비중|비율)$', re.compile(r'^%p?$'), '%'),
              (r'(절감액|금액|비용|매출|지출|예산|단가|인쇄비|인건비|전기료|운영비)$', re.compile(r'^(천|만|억|백만|천만)?\s?원$'), '원')]


def unit_for(label: str, unit: str) -> str:
    """a figure row's unit of another kind than its label ('인쇄비 절감액' · '분') → the label's own kind of unit; anything else stays."""
    label = re.sub(r'\s*\([^)]*\)$', '', label.strip())
    for pat, same, default in UNIT_KINDS:
        if re.search(pat, label):
            return unit if same.match(unit.strip()) else default
    return unit


def _j(s: str) -> str:
    import json
    return json.dumps(s, ensure_ascii=False)


def _j_slot(x: dict) -> str:
    import json
    d = {'i': x['i'], 'r': x['r'], 'ref': x['ref'], 'max': x['max']}
    if x.get('prefix'):
        d['prefix'] = x['prefix']
    if x.get('sample'):
        d['guide'] = True
    if x.get('of'):
        d['제품'] = x['of']  # the column this cell belongs to
    if x.get('col_head'):
        d['열'] = x['col_head']   # the fixed heading the cell sits under
    if x.get('row_head'):
        d['항목'] = x['row_head']  # the fixed label on the cell's row
    if x.get('note'):
        d['안내'] = x['note']
    return json.dumps(d, ensure_ascii=False)


def _got(d: Any) -> Dict[int, Dict[int, str]]:
    out: Dict[int, Dict[int, str]] = {}
    for x in (d or {}).get('slides') or []:
        if not isinstance(x, dict) or not isinstance(x.get('s'), int):
            continue
        for y in x.get('t') or []:
            if isinstance(y, dict) and isinstance(y.get('i'), int) and y.get('v') is not None:
                out.setdefault(x['s'], {})[y['i']] = str(y['v'])
    return out


def _check(ctx: dict, v: str, slot: dict, allowed: Set[str], banned: Sequence[str]) -> str:
    e = check_value(v, slot, allowed | _ref_numbers(slot), banned)
    if e:
        return e
    if HAN.search(v):
        return f"한자 · 중국어 표현 “{HAN.search(v).group(0)}” — 한국어(한글)로 씁니다"
    if ctx['tpl_cust'] and ctx['tpl_cust'] not in (ctx['customer'] or '') and swap_cust(ctx, v) != v:
        return f"견본 고객 이름 “{ctx['tpl_cust']}” — 이 고객 이름으로 씁니다"
    if slot.get('prefix') and not v.startswith(slot['prefix'].strip()):
        return f"“{slot['prefix']}” 로 시작해야 합니다"
    return ''


def _ref_numbers(slot: dict) -> Set[str]:
    """a product / solution fact slot may keep the numbers of its own reference when the slide still shows the same item."""
    if slot.get('mode') in ('solution',) and not slot.get('sample'):
        return {m.replace(',', '').rstrip('.') for m in ctxm.NUM.findall(slot.get('ref') or '')}
    return set()


def _finish_text(ctx: dict, slides: List[dict], got: Dict[int, Dict[int, str]]) -> None:
    lib = load()
    for s, sl in enumerate(slides):
        if sl.get('keep'):
            sl['t'] = dict(sl['ex_t'])
            continue
        if sl.get('fixed'):
            # the authored page as it is. Code owns only the chrome (``lock``: page number · footer · chapter number · 간지 rows);
            # a 간지's own lede and row names (``edit_ref``) stay the template's. A case sheet is not touched at all (its text is
            # about another customer); elsewhere the sample customer's name in the template becomes this customer's.
            ft: Dict[str, Any] = {}
            for k, v in sl['ex_t'].items():
                ft[k] = v if sl['kind'] == 'case' or (isinstance(v, dict) and scrub_names(ctx, plain(v)) == plain(v)) else scrub_names(ctx, plain(v))
            for k, v in (sl.get('edit_ref') or {}).items():
                if v is not None:
                    ft[k] = v
            for k, v in (sl.get('lock') or {}).items():
                if v is not None:
                    ft[k] = v
            sl['t'] = ft
            continue
        geo = {tt['i']: tt for tt in (lib['layouts'].get(sl['f']) or {}).get('texts') or []}
        t: Dict[str, Any] = {}
        for k, v in sl['ex_t'].items():  # start from the template values (html values keep their markup when untouched)
            t[k] = v if isinstance(v, dict) and scrub_names(ctx, plain(v)) == plain(v) else scrub_names(ctx, plain(v))
        for k, v in (sl.get('lock') or {}).items():
            if v is not None:
                t[k] = v
        for x in sl.get('_slots') or slot_plan(ctx, sl):
            k = str(x['i'])
            if 'lock' in x:
                if x['lock'] is None:
                    continue  # the layout's own fixed wording — nothing to override
                if k not in t or plain(t[k]) != x['lock']:
                    t[k] = x['lock']
                continue
            v = got.get(s, {}).get(x['i'])
            if v is None:
                v = x['ref'] if not x.get('sample') else ''
                v = scrub_names(ctx, v)
                if x.get('sample') and not v:
                    sl.setdefault('unfilled', []).append(x['i'])
                    continue
                if GUIDE.search(v) or x.get('sample'):
                    sl.setdefault('unfilled', []).append(x['i'])
            v = str(v).replace('\\n', '\n').strip()
            if ('무풍' in v or 'WindFree' in v) and '직사광' in v:
                v = re.sub(r'직사광선?', '직바람', v)  # 무풍 냉방 = no direct *wind*: the model keeps writing 'no direct sunlight'
            if x.get('unit_of') is not None:  # '도입 후 · <단위>': the unit only — a figure the model put there is dropped
                head = (x.get('prefix') or '').rstrip(' ·')
                tail = v[len(head):].lstrip(' ·') if head and v.startswith(head) else v.split(' · ')[-1]
                tail = re.sub(r'^[\d\[\]\s,.]+', '', tail).strip()
                tail = unit_for(plain(t.get(str(x['unit_of']))), tail) if tail else tail
                if not plain(t.get(str(x['unit_of']))):
                    tail = ''  # the row's label was emptied
                v = (x.get('prefix') or '') + tail if tail else head
            elif x.get('figure'):  # a headline figure ('5' 개 솔루션): a number this customer's material holds, else the placeholder
                m = re.fullmatch(r'\s*([\d,.]+)\s*', v)
                u = next((y for y in (sl.get('_slots') or []) if y['i'] == x.get('figure_u') and 'ref' in y), None)
                same_claim = v.strip() == x['ref'] and not (u and str(got.get(s, {}).get(u['i']) or u['ref']).strip() != u['ref'])  # the template's number with the template's meaning
                if not m or same_claim or m.group(1).replace(',', '').rstrip('.') not in ctx['allowed']:
                    if not PLACEHOLDER_ONLY.fullmatch(v):
                        sl.setdefault('masked', []).append(x['i'])
                    v = '[00]'
            elif x.get('value_of') is not None and re.fullmatch(r'([\d,.]+|\[0+\])\s*\D{1,6}', v):
                v = re.match(r'[\d,.]+|\[0+\]', v).group(0)  # '320개' next to its unit cell '개' → '320'
            elif x.get('prefix') and not v.startswith(x['prefix'].strip()):
                tail = v.split(' · ')[-1] if ' · ' in v else v
                v = (x['prefix'] + tail)[:x['max'] + len(x['prefix'])]
            if x.get('num_cell'):
                was = v
                v = number_cell(ctx, x['ref'], v)
                if sl['f'] in mkt.TREND:
                    # 업종 트렌드 장의 수치 칸은 시장조사가 채운다(검증된 값은 잠겨 이 단계에 오지 않는다). 조사하지 못한 칸에 문구 단계가 쓴 수치
                    # (고객사의 매장 수 같은)는 업계 수치가 아니다 — 자리표시로 남기면 화면이 그 장을 이 업종의 키워드 장으로 바꾼다
                    v = x['ref']
                if v != was:
                    sl.setdefault('renumbered', []).append(x['i'])
            elif 'ref' in x:
                v = keep_placeholders(x['ref'], v)
            e = _check(ctx, v, x, ctx['allowed'], ctx['banned'])
            if e:
                if ctx['tpl_cust'] and ctx['tpl_cust'] in v:
                    v = swap_cust(ctx, v)
                if len(v) > x['max']:
                    g = geo.get(x['i'])
                    if len(v) <= x['max'] + max(3, x['max'] // 4) or box_fits(g, v, x.get('ref') or ''):
                        sl.setdefault('long', []).append(x['i'])  # a little over, or it still fits its box: a whole sentence beats a cut one
                    else:
                        v = balance_quotes(trim_to_box(v, x['max'], g, x.get('ref') or ''))
                        sl.setdefault('trimmed', []).append(x['i'])
                    x = {**x, 'max': max(x['max'], len(v))}
                if _check(ctx, v, x, ctx['allowed'], ctx['banned']):
                    v = mask_value(v, {**x, 'max': max(x['max'], len(v))}, ctx['allowed'] | _ref_numbers(x), ctx['banned'], ctx['customer'])
                    sl.setdefault('masked', []).append(x['i'])
            bad = unlinked_in(v, ctx.get('unlinked') or ()) if sl['kind'] != 'case' else []
            if bad:
                sl.setdefault('unlinked', {})[k] = bad
            t[k] = v
        _fill_known_numbers(ctx, sl, t)
        _no_placeholders(ctx, sl, t)
        sl['t'] = t
    _fix_counts(ctx, slides)


def _no_placeholders(ctx: dict, sl: dict, t: Dict[str, Any]) -> None:
    """no placeholder is left on a composed sheet (composer/placeholders.py — the rule the app applies to every filled sheet).

    Every cell the sheet shows — written, locked or the layout's own wording: a sentence loses only its figure ('월 전기료 [00]%
    절감' → '월 전기료 절감'), a cell that was nothing but the figure is emptied with the unit next to it, and a row whose figure
    went takes its label along (a label over nothing reads as a mistake). 업종 트렌드 sheets are left to the market research
    (composer/market.py): the app turns an unresearched one into the keyword sheet."""
    lib = load()
    f = sl['f']
    if f in mkt.TREND or sl['kind'] in ('case', 'static') or f not in lib['layouts']:
        return
    L = lib['layouts'][f]
    T = ((lib.get('toc_slots') or {}).get(f) or {}).get('t') or {}
    cells = sorted((x for x in L['texts'] if not x.get('img')), key=lambda x: x['i'])
    shown = lambda x: plain(t[str(x['i'])]) if str(x['i']) in t else str(x.get('text') or '')
    others = {shown(x).strip() for x in cells if not phm.has_placeholder(shown(x))}
    emptied: List[int] = []
    for at, x in enumerate(cells):
        v = shown(x)
        if not phm.has_placeholder(v) or mkt.locked(sl, str(x['i'])):
            continue
        nxt = phm.strip_placeholders(v)
        if nxt and nxt in others:
            nxt = ''  # without its figure only a name another cell already shows is left ('일시 구매 [00]' under '일시 구매')
        t[str(x['i'])] = nxt
        if nxt:
            sl.setdefault('unfigured', []).append(x['i'])
            continue
        emptied.append(x['i'])
        if at + 1 < len(cells) and phm.unit_only(shown(cells[at + 1])):
            t[str(cells[at + 1]['i'])] = ''  # the '명' · '만 원' next to an emptied figure
    cur = lambda n: plain(t[str(T[n])]).strip() if n in T and str(T[n]) in t else str(next((x.get('text') for x in cells if n in T and x['i'] == T[n]), '') or '').strip()
    for group in phm.VALUE_LABELS.get(f, []):  # a label whose values are all gone
        if group['label'] in T and all(n in T and not cur(n) for n in group['values']):
            if f == 'L_TOC_TCO' and cur(group['label']):
                # 5년 총소유비용: nobody stated the amounts — the bar says when they come instead of standing empty
                t[str(T[group['values'][0]])] = '견적 단계에서 산정'
            else:
                t[str(T[group['label']])] = ''
    k = 0
    while f'vl{k}' in T or f'v{k}' in T:  # a figure row without its figure: label · unit go with it
        if f'vl{k}' in T and not cur(f'vl{k}'):
            for n in (f'lb{k}', f'un{k}'):
                if n in T:
                    t[str(T[n])] = ''
        if f'v{k}' in T and f'u{k}' in T and not cur(f'v{k}'):
            t[str(T[f'u{k}'])] = ''
        k += 1
    steps = [n for n in T if re.fullmatch(r'pp\d', n)]
    if steps and any(not cur(n) for n in steps):  # 로드맵의 기간 칩: 기간을 모르면 단계 이름으로(빈 칩을 남기지 않는다)
        for n in steps:
            t[str(T[n])] = f'{int(n[2:]) + 1}단계'
    if sl['kind'] == 'bom' and 'title' in T:
        t[str(T['title'])] = re.sub(r'무엇을 몇 대 놓는지', '무엇을 놓는지', plain(t.get(str(T['title']))) or str(next((x.get('text') for x in cells if x['i'] == T['title']), '') or ''))
    if emptied:
        sl.setdefault('emptied', []).extend(emptied)


def _fill_known_numbers(ctx: dict, sl: dict, t: Dict[str, Any]) -> None:
    """a figure row still on its placeholder whose label the customer gave a number for ('운영 매장 [00] 개' ← '140개 매장') takes
    that number — the requirement states it, so the slide does not ask the reader to fill it in."""
    if not ctx.get('facts') or sl['f'] in mkt.TREND:
        return
    for x in sl.get('_slots') or []:
        if 'lock' in x or not x.get('num_cell') or x.get('label_of') is None:
            continue
        k = str(x['i'])
        cur_ = plain(t.get(k)).strip()
        m = re.fullmatch(r'\[0+\]\s?(\D{0,4})', cur_ or x['ref'])  # still the placeholder, or left empty for want of a figure
        if not m or (cur_ and not phm.has_placeholder(cur_)):
            continue
        unit = m.group(1).strip() or (plain(t.get(str(x['value_of']))).strip() if x.get('value_of') is not None else '')
        n = known_number(ctx, plain(t.get(str(x['label_of']))), unit.split(' · ')[-1])
        if n:
            t[k] = n + m.group(1)
            sl.setdefault('known', []).append(x['i'])


def _fix_counts(ctx: dict, slides: List[dict]) -> None:
    """'6개 공간' · '6개 솔루션' left from the template → the numbers of this deck (structural lines only)."""
    n_sp = len(ctx.get('spaces') or [])
    n_sol = len(ctx.get('solutions') or [])
    for sl in slides:
        if sl.get('keep') or sl.get('fixed') or sl['kind'] not in ('toc', 'divider', 'bird', 'map', 'bom', 'space', 'solution', 'generic', 'journey', 'tech', 'spec', 'scn', 'scnmap'):
            continue
        for k, v in list((sl.get('t') or {}).items()):
            if not isinstance(v, str) or mkt.locked(sl, k):
                continue
            w = v
            if n_sp:
                w = re.sub(r'\d+개 공간', f'{n_sp}개 공간', w)
            if n_sol:
                w = re.sub(r'\d+개 솔루션', f'{n_sol}개 솔루션', w)
            if sl['kind'] == 'tech' and k == '1' and (sl['bind'].get('columns') or sl['bind'].get('solutions')):
                w = re.sub(r'\d+가지', f"{len(sl['bind'].get('columns') or sl['bind']['solutions'])}가지", w)
            if sl['kind'] == 'spec' and k == '1' and sl['bind'].get('products') and sl.get('n_cols'):
                w = re.sub(r'\d+(가지|종)', lambda m: f"{min(len(sl['bind']['products']), sl['n_cols'])}{m.group(1)}", w)
            if w != v:
                sl['t'][k] = w
    for sl in slides:  # a sheet that changed size ('핵심 기술 · 솔루션 4개' → 3): the part's 간지 names the same count
        m_old, m_new = SIBLING.match(sl.get('from') or ''), SIBLING.match(sl.get('f') or '')
        if not (m_old and m_new) or m_old.group(1) != m_new.group(1) or sl['kind'] != 'tech' or not (sl['bind'].get('columns') or sl['bind'].get('solutions')):
            continue  # (the space counts of 조감도 · Map are set above from the deck's own number of spaces)
        old_n, new_n = m_old.group(2), str(len(sl['bind'].get('columns') or sl['bind']['solutions']))
        if old_n == new_n:
            continue
        for dv in slides:
            if dv['kind'] != 'divider' or dv.get('keep') or dv.get('fixed'):
                continue
            for k, v in list((dv.get('t') or {}).items()):
                if isinstance(v, str) and not mkt.locked(dv, k):
                    w = re.sub(rf'(?<!\d){old_n}(?=\s?(가지|단계|종|개 (기술|솔루션|공간|제품)))', new_n, v)
                    if w != v:
                        dv['t'][k] = w


def _compact_lists(sl: dict) -> None:
    """a list that lost an item closes the gap. When a guard empties the first bullet of a card (or one chip of a pair), the
    items after it move up — text with its paired cell and icon — so the slide never shows an empty first row over a filled one.
    Only lists the layout names as such (``<name><group>_<n>``) whose cells the text stage wrote; a table (BOM · spec rows) keeps
    its cells where they are."""
    lib = load()
    TS = (lib.get('toc_slots') or {}).get(sl['f']) or {}
    T, I = TS.get('t') or {}, TS.get('img') or {}
    t, img = sl.get('t') or {}, sl.get('img') or {}
    editable = {x['i'] for x in sl.get('_slots') or [] if 'lock' not in x}
    cur = lambda i: plain(t.get(str(i))).strip() if str(i) in t else ''
    if sl['f'] == 'L_VS_NEEDS':  # the two proposal chips of each column
        for k in range(3):
            a, b = 11 + 7 * k, 12 + 7 * k
            if a in editable and b in editable and not cur(a) and cur(b):
                t[str(a)], t[str(b)] = t[str(b)], ''
                sl.setdefault('compacted', []).append(a)
        return
    groups: Dict[str, Dict[int, Dict[str, int]]] = {}
    for name, i in T.items():
        m = re.fullmatch(r'([a-z]+)(\d+)_(\d+)', name)
        if m and m.group(1) not in ('q', 'sl', 'sv'):
            groups.setdefault(m.group(2), {}).setdefault(int(m.group(3)), {})[m.group(1)] = int(i)
    for g, rows in groups.items():
        order = sorted(rows)
        if len(order) < 2 or any(i not in editable for n in order for i in rows[n].values()) or len({frozenset(rows[n]) for n in order}) != 1:
            continue
        filled = [n for n in order if any(cur(i) for i in rows[n].values())]
        if not filled or filled == order[:len(filled)]:
            continue
        vals = [{p_: t.get(str(i)) for p_, i in rows[n].items()} for n in filled]
        pics = [{p_: img.get(str(I[f'{p_}{g}_{n}'])) for p_ in ('ki', 'ic') if f'{p_}{g}_{n}' in I} for n in filled]
        for pos, n in enumerate(order):
            for p_, i in rows[n].items():
                t[str(i)] = vals[pos][p_] if pos < len(vals) else ''
            for p_ in ('ki', 'ic'):
                if f'{p_}{g}_{n}' in I and pos < len(pics) and pics[pos].get(p_) is not None:
                    img[str(I[f'{p_}{g}_{n}'])] = pics[pos][p_]
        sl.setdefault('compacted', []).append(int(g))


# ================================================================================================ selected items only
def names_selected(ctx: dict, v: str) -> bool:
    """``v`` (a short name cell) names something this customer selected — a linked product · solution, or the kind of one."""
    v = _s(v, 80)
    if len(v) < 2:
        return False
    if match_entity(v, ctx) or selected_item(ctx, v):
        return True
    lib = load()
    words: List[str] = []
    for pid in ctx['products']:
        p = lib['products_all'][pid]
        words += [_s(p.get(k), 80) for k in ('name', 'model', 'cat', 'sc')] + [ctx['short'].get(pid) or '']
    for sid in ctx['solutions']:
        words += [_s(lib['solutions'][sid].get('name'), 80), ctx['short'].get(sid) or '']
    return any(w and len(w) >= 3 and (w in v or (len(v) >= 3 and v in w)) for w in words)


_NAME_TOK = re.compile(r'[가-힣]+|[A-Za-z]+|\d+')
_NAME_NOISE = {'삼성', '삼성전자', 'samsung', '인치', '형', '제품', '솔루션', '서비스', '시스템', 'ai', 'the', 'pro'}


def _name_tokens(v: str) -> Set[str]:
    out = set()
    for w in _NAME_TOK.findall(str(v or '')):
        w = re.sub(r'(용|형|급)$', '', w) if len(w) >= 3 and not w.isascii() else w
        w = w.lower()
        if w and w not in _NAME_NOISE:
            out.add(w)
    return out


def solution_aliases(sid: str) -> List[str]:
    """the other names a catalog solution goes by on the slides: its feature-registry names per vertical form ('병원 안내·업무 솔루션' ·
    '터치 중앙 제어기 2.0' are the 파트너 앱 · 시스템에어컨 제어 solutions) and the names of its own solution sheets."""
    if ('alias', sid) not in _REG:
        lib = load()
        reg = _feature_registry()
        out: List[str] = []
        for key, q in (lib.get('sol_keys') or {}).items():
            if q == sid and key in reg['cat']:
                out += [re.sub(r'\s*\([^)]*\)', '', str(reg['cat'][key].get(k) or '')).strip() for k in ('name', 'name_en')]
        for f, q in (lib.get('sol_layouts') or {}).items():
            if q == sid and f in lib['layouts']:
                nm = str(lib['layouts'][f].get('name') or '')
                out.append(re.split(r' · (?=[^·]*(?:\+|\d|사진|기능|타일|카드|배너))', nm)[0].strip())
        _REG[('alias', sid)] = [n for n in dict.fromkeys(out) if len(n) >= 3]
    return _REG[('alias', sid)]


def selected_item(ctx: dict, v: str, prefer: Sequence[str] = ()) -> Optional[tuple]:
    """the selected product · solution a short name cell means — ('product' | 'solution', id) or None.

    An exact name first (``match_entity``); else the item whose names share the cell's words ('호텔용 43인치 TV' → 호텔 TV 43"):
    every word of the cell must belong to that item, and a tie goes to an item of ``prefer`` (the slide's own items)."""
    v = _s(v, 80)
    if len(v) < 2:
        return None
    hit = match_entity(v, ctx)
    if hit.get('product'):
        return ('product', hit['product'])
    if hit.get('solution'):
        return ('solution', hit['solution'])
    want = _name_tokens(v)
    if not want:
        return None
    lib = load()
    best: List[tuple] = []
    for kind, ids in (('product', ctx['products']), ('solution', ctx['solutions'])):
        for q in ids:
            rec = lib['products_all'][q] if kind == 'product' else lib['solutions'][q]
            alias = solution_aliases(q) if kind == 'solution' else []
            names = [rec.get(k) for k in (('name', 'model', 'cat', 'sc') if kind == 'product' else ('name',))] + [ctx['short'].get(q)] + list(rec.get('kw') or [])[:4] + alias
            have = set().union(*[_name_tokens(n) for n in names if n]) if names else set()
            core = _name_tokens(' '.join(str(n) for n in [rec.get('name'), ctx['short'].get(q)] + alias if n))
            if kind == 'solution' and any(re.sub(r'[\s·]+', '', a) == re.sub(r'[\s·]+', '', v) for a in alias):
                return ('solution', q)  # the solution under the name its own sheet · the registry gives it
            share = want & have
            strong = lambda ws: any(len(w) >= 3 or (len(w) >= 2 and not w.isascii()) for w in ws)
            short_core = _name_tokens(str(ctx['short'].get(q) or ''))
            if len(share) == len(want) and strong(share & core):
                best.append((len(share & core), q in prefer, kind, q))        # every word of the cell is this item's
            elif short_core and short_core <= want and strong(short_core):
                best.append((len(short_core), q in prefer, kind, q))          # the item's own name inside a longer label ('VXT CMS')
    if not best:
        return None
    best.sort(reverse=True)
    if len(best) > 1 and best[0][:2] == best[1][:2]:
        return None  # two selected items fit equally and the slide prefers neither: not decidable
    return (best[0][2], best[0][3])


def _resolve_for_pictures(ctx: dict, text: str) -> Optional[tuple]:
    return selected_item(ctx, text)


_pictures.resolve_item = _resolve_for_pictures  # the picture stage reads a name cell the way the selected-only guard does


def _feature_pairs(ctx: dict, sl: dict) -> None:
    """공간별 제품 장 (L_VS_SPACE): a feature is a heading with its line. When the guard removed the line (it leaned on a solution the
    customer did not select), the bare heading under its number is not a feature any more — the pair becomes the product's own
    key specs from the catalog ('주요 사양' · '밝기 500 nit · 명암비 4,000:1'), or is cleared when the catalog has none."""
    if sl['kind'] != 'space' or not (sl.get('bind') or {}).get('product'):
        return
    lib = load()
    L = lib['layouts'].get(sl['f']) or {}
    geo = [x for x in L.get('texts') or [] if not x.get('img')]
    t = sl.get('t') or {}
    cur = lambda i: plain(t.get(str(i))).strip() if str(i) in t else ''
    pairs = [(a['i'], b['i'], b) for a, b in zip(geo, geo[1:]) if a.get('role') == 'heading' and b.get('role') in ('dense', 'body') and a['i'] not in (1, 2)]
    holes = [(a, b, g) for a, b, g in pairs if not cur(b) or not cur(a)]
    if not holes:
        return
    rows = []
    for line in (lib['products_all'].get(sl['bind']['product']) or {}).get('specs') or []:
        k, _, v = str(line).partition(':')
        k, v = re.sub(r'\s*\([^)]*\)\s*$', '', k).strip(), v.strip()
        if k and v and len(k) <= 10 and len(v) <= 22 and k not in ('패널 타입', '픽셀 피치', '수평 주파수', '수직 주파수', '최대 픽셀 주파수', '헤이즈'):
            rows.append(f'{k} {v}')
    shown = ' '.join(cur(x['i']) for x in geo)
    rows = [r for r in rows if r.split(' ', 1)[1] not in shown]
    for n, (a, b, g) in enumerate(holes):
        line = ''
        for k in (3, 2, 1):
            cand = ' · '.join(rows[:k])
            if cand and box_fits(g, cand):
                line, rows = cand, rows[k:]
                break
        if line and n == 0:
            t[str(a)], t[str(b)] = '주요 사양', line
            sl.setdefault('fact_filled', []).extend([a, b])
        else:
            t[str(a)], t[str(b)] = '', ''
            sl.setdefault('emptied', []).extend([a, b])


def _row_item(ctx: dict, sl: dict, i: int, t: Dict[str, Any]) -> Optional[tuple]:
    """the selected product · solution the lines right under a name cell speak of — ('product' | 'solution', id) or None."""
    L = load()['layouts'].get(sl['f']) or {}
    geo = {x['i']: x for x in L.get('texts') or [] if not x.get('img')}
    g = geo.get(i)
    if not g or g.get('x') is None or g.get('y') is None:
        return None
    lines = [plain(t.get(str(o['i']))) for o in geo.values()
             if o['i'] != i and o.get('x') is not None and abs(o['x'] - g['x']) <= 40 and 0 < o['y'] - g['y'] <= 150 and str(o['i']) in t]
    hit = _pictures.match_entity(' '.join(v for v in lines if v), ctx)
    if hit.get('product'):
        return ('product', hit['product'])
    if hit.get('solution'):
        return ('solution', hit['solution'])
    return None


def enforce_linked(ctx: dict, part: dict, slides: List[dict]) -> int:
    """the last word on a part, after its texts and pictures: nothing this customer did not select is named or pictured.

    Whatever the template carried and whatever the model wrote, a cell that names an unselected product · solution is cleared
    (a list keeps its other items), a product · solution name cell holds a selected item or nothing, and a product picture is
    the cut of a selected product or it is hidden — an empty cell beats an offer the customer never chose. Fixed pages (Why
    Samsung · company pages · 도입사례 sheets) are the template's own pages and are not checked. Returns the number of cells and
    pictures cleared (also noted on the part)."""
    lib = load()
    IM, L = lib['images'], lib['layouts']
    vocab = ctx['unlinked_said_hard'] if part.get('mode') == 'problem' else ctx['unlinked_hard']
    picked_p, picked_s = set(ctx['products']), set(ctx['solutions'])
    total = 0
    shown_cases = {str(lib['cases'][c].get('cust') or '') for c in ctx['cases'] if c in lib['cases']}
    for sls_ in (ctx.get('slides_by') or {}).values():  # every case sheet of the deck (linked or the industry's own fallback)
        for o in sls_:
            if o.get('kind') == 'case':
                shown_cases.add(plain((o.get('ex_t') or {}).get('1')))
    case_names = sorted((n for n in shown_cases if len(n) >= 3), key=len, reverse=True)
    sel_names = sorted({a for q in ctx['solutions'] for a in solution_aliases(q)}, key=len, reverse=True)
    for sl in slides:
        if sl.get('keep') or sl.get('fixed') or sl['kind'] in ('static', 'case') or sl['f'] not in L:
            continue
        modes = L[sl['f']].get('modes') or {}
        tm, im = modes.get('t') or {}, modes.get('img') or {}
        t = sl.setdefault('t', {})
        img = sl.setdefault('img', {})
        meta = sl.setdefault('img_meta', {})
        for key in sl.get('hide_img') or []:  # the icon of a row the layout stage left out (a figure row without a stated figure)
            img[key] = {'hidden': True, 'name': ''}
        last = _max_i(sl['f'])
        gone: Dict[str, List[str]] = {}
        own_sheet = sl['kind'] == 'solution' and (sl.get('bind') or {}).get('solution') in picked_s
        for k, v in list(t.items()):  # 1. a name of an unselected item anywhere in the text (the footer block is this deck's own)
            if not k.isdigit() or int(k) > last:
                continue
            pv = plain(v)
            if mkt.locked(sl, k):
                continue  # 시장 근거로 채운 칸 — 업계의 사실이지 제안 품목이 아니다
            if own_sheet and pv == plain((sl.get('ex_t') or {}).get(k)):
                continue  # the sheet of a selected solution, as authored: what that solution runs on is the solution's own fact
            chk = pv
            for nm in case_names:  # the name of a case shown in this deck ('… 병상 TV탭') is a name, not an offer of a TV
                chk = chk.replace(nm, ' ')
            for nm in sel_names:   # so is the name of a selected solution in its vertical form ('터치 중앙 제어기')
                chk = chk.replace(nm, ' ')
            bad = unlinked_in(chk, vocab) if chk.strip() else []
            if bad:
                t[k] = strip_unlinked(pv, vocab)
                gone[k] = bad[:3]
        own_items = list((sl.get('focus') or {}).get('products') or []) + list((sl.get('focus') or {}).get('solutions') or []) + list((sl.get('bind') or {}).get('products') or [])
        pm = sorted(int(k) for k, m in tm.items() if m == 'product')
        pi = sorted(int(k) for k, m in im.items() if m == 'product')
        pair = dict(zip(pi, pm)) if pm and len(pm) == len(pi) else {}
        rebound: Dict[int, tuple] = {}
        if sl['kind'] in ('generic', 'journey', 'bom', 'map'):  # 2. a name cell holds a selected item or nothing
            for k, m in tm.items():
                pv = plain(t.get(k)).strip() if k in t else ''
                if m != 'product' or len(pv) > 30 or '\n' in pv or (pv and names_selected(ctx, pv)):
                    continue
                it = selected_item(ctx, pv, own_items) if pv else None
                if it:  # the selected item in other words ('호텔용 43인치 TV'): its name as the catalog has it
                    t[k] = ctx['short'].get(it[1]) or it[1]
                    sl.setdefault('renamed', {})[k] = pv
                    continue
                # the name cell is (or is about to be) empty, but the row's own lines say which selected item the row is about
                # ('갤럭시 탭으로 환자 상태를 기록합니다' under an emptied chip): the row is that item's — name, then picture
                had = pv or plain((sl.get('ex_t') or {}).get(k)).strip()
                it = _row_item(ctx, sl, int(k), t) if had and sl['kind'] == 'generic' and int(k) in pair.values() else None
                if it:
                    t[k] = ctx['short'].get(it[1]) or it[1]
                    sl.setdefault('renamed', {})[k] = pv or '(비어 있던 칸)'
                    rebound[int(k)] = it
                    continue
                if pv:
                    t[k] = ''
                    gone[k] = [pv]
        for key_i, name_i in pair.items():  # the picture of a row that was given back to a selected item
            if name_i not in rebound:
                continue
            it = rebound[name_i]
            v0 = img.get(str(key_i))
            if isinstance(v0, dict) and v0.get('src') and not v0.get('hidden') and (is_cut_of(v0, it[1]) if it[0] == 'product' else (meta.get(str(key_i)) or {}).get('solution') == it[1]):
                continue
            shown = {norm_src(x) for k2, x in img.items() if k2 != str(key_i) and isinstance(x, dict) and x.get('src')}
            new_src = product_cut(it[1]) if it[0] == 'product' else next((x for x in solution_media(it[1], 'cut', set()) if x not in shown), None)
            if new_src:
                name = (lib['products_all'].get(it[1]) or {}).get('name') if it[0] == 'product' else ctx['short'].get(it[1])
                img[str(key_i)] = {'src': new_src, 'fit': (v0 or {}).get('fit') or 'contain', 'name': name or '', 'keep': True, **({'pid': it[1], 'products': [it[1]]} if it[0] == 'product' else {})}
                meta[str(key_i)] = {'kind': it[0], it[0]: it[1], 'why': 'product_exact' if it[0] == 'product' else 'solution_media', 'note': 'the row names this selected item'}
                sl.setdefault('repictured', {})[str(key_i)] = (v0 or {}).get('name') or ''
        plans = {str(x['i']) for x in L[sl['f']].get('images') or [] if x.get('kind') == 'plan'}
        scenes = {str(x['i']) for x in L[sl['f']].get('images') or [] if x.get('kind') in ('space', 'photo', 'case') and im.get(str(x['i'])) != 'product'}
        for key, v in list(img.items()):  # 3. a product picture is a selected product's own cut, a solution picture a selected solution's
            if not isinstance(v, dict) or v.get('hidden') or not v.get('src') or not key.isdigit():
                continue
            if sl['kind'] in ('bird', 'cover', 'divider', 'toc') or key in plans or key in scenes or (meta.get(key) or {}).get('kind') in ('plan', 'space', 'scene'):
                continue  # the building · space plan is the customer's own picture; a photo of a place is judged by the picture stage
            it = IM.get(norm_src(v)) or {}
            cut, slot = it.get('cls') == 'product', im.get(key) == 'product'
            if not it or not (cut or slot) or ICON_SRC.search(norm_src(v)):
                continue  # icons are set by the layout · picture stages (a neutral icon for an unselected solution)
            mk = meta.get(key) or {}
            ok = (any(is_cut_of(v, q) for q in picked_p) or (mk.get('kind') == 'product' and mk.get('product') in picked_p and mk.get('why') == 'product_exact')
                  or (mk.get('kind') == 'solution' and mk.get('solution') in picked_s))
            if not ok and not cut:  # a screen · diagram · scene in a product frame: fine unless it is tagged with unselected items only
                tags_p, tags_s = set(it.get('products') or []), set(it.get('solutions') or [])
                ok = not (tags_p or tags_s) or bool(tags_p & picked_p) or bool(tags_s & picked_s)
            if not ok and selected_item(ctx, _s(v.get('name'), 80)):
                ok = True  # the picture is named after a selected item (a selected solution under its vertical name: '병원 안내 · 업무 솔루션')
            cleared = int(key) in pair and str(pair[int(key)]) in t and not plain(t[str(pair[int(key)])]).strip()
            if ok and cleared:
                ok = False  # the name cell of this picture was cleared
            if not ok and not cleared:
                # the frame shows something this customer did not select, but the row itself stands: the picture of the selected
                # item its name cell holds — without a name cell, a selected product of this slide the slide does not show yet
                it = selected_item(ctx, plain(t.get(str(pair[int(key)]))), own_items) if int(key) in pair else None
                shown = {norm_src(x) for k2, x in img.items() if k2 != key and isinstance(x, dict) and x.get('src')}
                new_src = None
                if it and it[0] == 'product':
                    new_src = product_cut(it[1])
                elif it and it[0] == 'solution':
                    new_src = next((x for x in solution_media(it[1], 'cut', set()) if x not in shown), None)
                elif int(key) not in pair:
                    pool = list(dict.fromkeys([q for q in own_items if q in picked_p] + list(ctx['products'])))
                    cuts = [(q, product_cut(q)) for q in pool]
                    hit = next(((q, c) for q, c in cuts if c and c not in shown), None)
                    if hit:
                        it, new_src = ('product', hit[0]), hit[1]
                if new_src:
                    name = (lib['products_all'].get(it[1]) or {}).get('name') if it[0] == 'product' else ctx['short'].get(it[1])
                    img[key] = {'src': new_src, 'fit': v.get('fit') or 'contain', 'name': name or '', 'keep': True, **({'pid': it[1], 'products': [it[1]]} if it[0] == 'product' else {})}
                    meta[key] = {'kind': it[0], it[0]: it[1], 'why': 'product_exact' if it[0] == 'product' else 'solution_media', 'note': 'replaced a picture of an unselected item'}
                    sl.setdefault('repictured', {})[key] = v.get('name') or norm_src(v)
                    continue
            if not ok:
                img[key] = {'hidden': True, 'name': v.get('name') or ''}
                meta[key] = {'kind': 'product', 'why': 'hidden', 'note': 'not a product · solution this customer selected', 'flag': 'unselected'}
                gone['img' + key] = [v.get('name') or norm_src(v)]
        if gone:
            sl['removed'] = gone
            for k in gone:
                (sl.get('unlinked') or {}).pop(k, None)
            total += len(gone)
        _feature_pairs(ctx, sl)
        _compact_lists(sl)
    if total:
        part.setdefault('notes', []).append(f'선택하지 않은 제품 · 솔루션 표기 {total}곳을 비움')
    return total


# ================================================================================================ run
def _layout_out(sl: dict) -> dict:
    t = {k: v for k, v in (sl.get('t') or {}).items()}
    img = {k: v for k, v in (sl.get('img') or sl.get('ex_img') or {}).items()}
    filled = not sl.get('keep')
    agent = {'from': sl.get('from'), 'kind': sl.get('kind'), 'bind': {k: v for k, v in (sl.get('bind') or {}).items() if k != 'kind' and v},
             'adapt': sl.get('adapt') or [], 'masked': sl.get('masked') or [], 'unfilled': sl.get('unfilled') or [], 'unlinked': sl.get('unlinked') or {},
             **({'focus': {'points': sl['focus']['points'], 'echo': sl.get('echo')}} if sl.get('focus') else {}),
             **({'trimmed': sl['trimmed']} if sl.get('trimmed') else {}), **({'fact_filled': sl['fact_filled']} if sl.get('fact_filled') else {}),
             **({'emptied': sl['emptied']} if sl.get('emptied') else {}), **({'removed': sl['removed']} if sl.get('removed') else {}),
             **({'fixed': True} if sl.get('fixed') else {}),
             **{k: sl[k] for k in ('long', 'alt_of', 'profile', 'unfigured', 'compacted', 'renamed', 'repictured', 'claim_fixed', 'claim_dropped') if sl.get(k)},
             'img': sl.get('img_meta') or {}}
    out = {'f': sl['f'], 'status': 'done' if filled else 'partial', 'ov': {**(sl.get('extra') or {}), 't': t, 'img': img}, 'agent': agent}
    if sl.get('research'):  # 업종 트렌드 장: 칸 번호 → 근거(제목 · 주소 · 인용) · 조사 정보(검색어 · 시각 · 고른 이유)
        out['research'] = sl['research']
        if sl.get('evidence'):
            out['ev'] = sl['evidence']
        if not sl['research'].get('ok'):
            out['status'] = 'partial'  # 근거를 찾지 못해 자리표시가 남은 장 — 사람이 확인한다
    return out


def run_auto(pr: dict, body: dict, llm, *, emit: Optional[Callable[..., Any]] = None, log: Optional[Callable[[str], Any]] = None,
             check_cancel: Optional[Callable[[], None]] = None, workers: int = 4, verify: bool = True, plan: Optional[dict] = None,
             pick: str = 'rank', market: Optional[Callable[[dict, List[str]], dict]] = None) -> dict:
    """market: 업종 트렌드 장의 시장조사 hook ``(spec, want) -> {'sheets': [...], 'research': {...}}`` — 실제 웹 검색으로 검증한 근거만 돌려준다
    (``market.py``). 없으면 트렌드 장은 템플릿의 자리표시 그대로 남는다."""
    emit = emit or (lambda *a, **k: None)
    log = log or (lambda m: None)
    check_cancel = check_cancel or (lambda: None)
    t0 = time.time()
    ctx = build_context(pr, body)
    parts = ctx['parts']
    check_cancel()
    mk_job = mkt.start(ctx, market, log)  # 덱 계획과 나란히 — 트렌드 장이 든 파트만 결과를 기다린다
    plan = orchestrate(ctx, llm) if plan is None else plan
    t_plan = time.time() - t0
    for pp in plan['parts']:  # Why Samsung says what the template says — its line in the plan is the template's own goal
        tp = next((p for p in parts if p['id'] == pp['id']), None)
        if tp is not None and fixed_part(tp) and tp.get('goal'):
            pp['message'] = tp['goal']
    emit('plan', plan=public_plan(plan))
    log(f"계획 — {plan['thesis']} · 요구 {len(plan['points'])}개 · 코드 보정 {len(plan['fixes'])}건")
    pp_by = {p['id']: p for p in plan['parts']}
    ctx['plan_by'] = pp_by
    ctx['plan_points'] = plan['points']
    for p in parts:
        p['message'] = pp_by[p['id']]['message']
    req_ids = {p['id'] for p in parts}
    replaced = Counter(x.get('f') for b in (pr.get('parts') or []) if isinstance(b, dict) and str(b.get('id') or '') in req_ids
                       for x in (b.get('layouts') or []) if isinstance(x, dict))
    kept = {f for fx in ctx['fixed'] for f in fx['f']}
    seed = {f for f in ctx['used_layouts'] if f not in replaced} | kept  # layouts of the parts being rebuilt are free again
    seed = {f for f in seed if not REPEATABLE.match(f) and not DIV.match(f)}
    lay_reg = Registry(seed)
    img_reg = PictureRegistry()  # one picture once per deck — by identity (the same photo under another address counts too)
    # layouts first for every part (code, template order — the page numbers and the 목차 need the whole deck);
    # a slide added for an assigned item never takes a layout another part's template already holds
    reserved = {x['f'] for p in parts for x in p['exemplar']}
    slides_by: Dict[str, List[dict]] = {}
    for p in parts:
        check_cancel()
        slides_by[p['id']] = compose_part(ctx, p, pp_by[p['id']], lay_reg, reserved)
    ctx['slides_by'] = slides_by
    number_deck(ctx, plan, slides_by)
    # pictures of the fixed and kept pages stay — no part may pick the same photo for another slot (fixed pages first: their
    # pictures cannot change, a kept page's can when the final check below finds it repeats a fixed one)
    # pictures already on the board in the parts this request does not rebuild come first of all (the request lists them)
    for src in ctx.get('used_pictures') or []:
        if counts_once(src):
            img_reg.claim(src)
    for want in ('fixed', 'spaces', 'kept'):
        if want == 'spaces':
            # every space slot of the deck takes a photo of its own space before the kept pages · 목차 cards and any part choose
            # (most constrained space first); a kept picture a space took is replaced on its page (``repeat_keys``)
            n_res = reserve_space_photos(ctx, parts, slides_by, img_reg)
            if n_res:
                log(f'공간 사진 — 공간 장 {n_res}칸에 그 공간의 사진을 먼저 정함')
            continue
        for sls in slides_by.values():
            for sl in sls:
                if (want == 'fixed') != bool(sl.get('fixed')) or not (sl.get('fixed') or sl['kind'] in ('static', 'toc') or sl.get('keep')):
                    continue
                for key, v in (sl.get('ex_img') or {}).items():
                    if isinstance(v, dict) and v.get('hidden'):
                        continue
                    src = norm_src(v)
                    if counts_once(src) and not img_reg.claim(src):
                        # a kept page's slot gets another picture from its part (fill_part_images); a fixed page keeps every word and
                        # picture it was authored with — except a picture it repeats (an authored case sheet padded with its first photo)
                        sl.setdefault('repeat_keys', []).append(key)

    results: Dict[str, dict] = {}
    failed: List[str] = []
    lock = threading.Lock()
    deck_parts = [p for p in parts if p['deck']]
    body_parts = [p for p in parts if not p['deck']]

    def work(p: dict) -> None:
        pid = p['id']
        emit('part', id=pid, status='started')
        last: Optional[BaseException] = None
        for attempt in range(2):
            try:
                check_cancel()
                slides = [dict(s) for s in slides_by[pid]] if attempt else slides_by[pid]
                for s in slides:
                    for key in ('t', 'img', 'img_meta', 'masked', 'unfilled', 'unlinked', '_slots', 'focus', 'echo', 'long', 'trimmed', 'fact_filled', 'emptied', 'removed',
                                'renumbered', 'known', 'compacted', 'renamed', 'repictured', 'claim_fixed', 'claim_dropped', 'unfigured'):
                        s.pop(key, None)
                mkt.apply(ctx, p, slides, mk_job, log)  # 업종 트렌드 장: 검증된 시장 근거로 종류 · 값을 건다(문구 단계는 그 칸을 쓰지 않는다)
                check_cancel()
                fill_part_text(ctx, plan, p, pp_by[pid], slides, llm)
                check_cancel()
                mine = Registry()
                fill_part_images(ctx, p, slides, llm, _Scoped(img_reg, mine), verify=verify, pick=pick)
                if p['deck']:
                    body_done.wait()  # the 목차 cards show each chapter — with a photo of their own, chosen after the chapters chose theirs
                    check_cancel()
                    _toc_photos(ctx, p, slides, results, _Scoped(img_reg, mine))
                enforce_linked(ctx, p, slides)
                layouts = [_layout_out(s) for s in slides]
                notes = list(dict.fromkeys((p.get('notes') or []) + (p.get('warnings') or []) + [a for s in slides if s.get('keep') for a in s['adapt']]))
                with lock:
                    results[pid] = {'id': pid, 'deck': p['deck'], 'name': p['name'], 'type': p['type'], 'layouts': layouts, 'notes': notes, 'slides': slides}
                emit('part', id=pid, status='done', layouts=[{k: v for k, v in x.items()} for x in layouts], notes=notes)
                return
            except Exception as exc:  # noqa: BLE001
                if type(exc).__name__ == 'JobCancelled':
                    raise
                last = exc
                for src in list(locals().get('mine').snapshot()) if locals().get('mine') is not None else []:
                    img_reg.release(src)
                log(f"{p['name'] or '표지'} — 실패({type(exc).__name__}){' · 한 번 더 시도' if attempt == 0 else ''}")
        with lock:
            failed.append(pid)
        emit('part', id=pid, status='error', message=_s(f'{type(last).__name__}: {last}', 300))

    body_done = threading.Event()
    n_workers = max(1, min(8, int(workers or 1)))
    with ThreadPoolExecutor(max_workers=n_workers) as ex, ThreadPoolExecutor(max_workers=max(1, len(deck_parts))) as ex_deck:
        futs = [ex.submit(work, p) for p in body_parts]
        deck_futs = [ex_deck.submit(work, p) for p in deck_parts]  # written alongside; it only waits for the others before its 목차 cards
        errs = []
        for f in futs:
            try:
                f.result()
            except BaseException as exc:  # noqa: BLE001 — cancellation: let the other workers stop at their next check, then re-raise
                errs.append(exc)
        body_done.set()
        for f in deck_futs:
            try:
                f.result()
            except BaseException as exc:  # noqa: BLE001
                errs.append(exc)
        if errs:
            raise errs[0]
    app_parts = []
    for p in parts:
        r = results.get(p['id'])
        if r:
            app_parts.append({'id': r['id'], 'deck': r['deck'], 'name': r['name'], 'type': r['type'], 'layouts': r['layouts'], 'notes': r['notes']})
    # the deck-wide check of "one picture once": every slot above held its picture's identity, so this finds nothing unless two pages
    # that may not change (Why Samsung · 도입사례 sheets) were authored with the same photo — reported, not hidden
    uses = [((r['id'], n, key), v['src']) for r in app_parts for n, x in enumerate(r['layouts'])
            for key, v in sorted(((x.get('ov') or {}).get('img') or {}).items()) if isinstance(v, dict) and v.get('src') and not v.get('hidden')]
    repeats = [{'part': w[0], 'sheet': w[1], 'slot': w[2], 'src': src} for w, src in deck_repeats(uses)]
    if repeats:
        log(f"사진 반복 {len(repeats)}곳 — " + ' · '.join(f"{x['part']} {x['sheet'] + 1}장 칸 {x['slot']}" for x in repeats[:6]))
    return {'thesis': plan['thesis'], 'plan': public_plan(plan), 'app_parts': app_parts, 'failed': [p['id'] for p in parts if p['id'] in failed],
            'repeatable': sorted({x['f'] for p in app_parts for x in p['layouts'] if REPEATABLE.match(x['f'])}),
            'fixed_parts': [p['id'] for p in parts if fixed_part(p)],  # parts that are the template's own pages (no model call)
            'picture_repeats': repeats,
            'ms': int((time.time() - t0) * 1000), 'plan_ms': int(t_plan * 1000)}


class _Scoped:
    """the deck-wide photo registry seen from one part: remembers what this attempt claimed so a failed attempt gives it back."""

    def __init__(self, shared: Registry, mine: Registry) -> None:
        self.shared, self.mine = shared, mine

    def claim(self, key: str) -> bool:
        ok = self.shared.claim(key)
        if ok:
            self.mine.add(key)
        return ok

    def add(self, key: str) -> None:
        self.shared.add(key)
        self.mine.add(key)

    def release(self, key: str) -> None:
        self.shared.release(key)

    def __contains__(self, key: str) -> bool:
        return key in self.shared

    def snapshot(self) -> Set[str]:
        return self.shared.snapshot()


def _toc_photos(ctx: dict, part: dict, slides: List[dict], results: Dict[str, dict], used) -> None:
    """목차 cards: card i stands for chapter i. It shows a photo of that chapter's subject — not the chapter's own 간지 photo a second
    time (one picture once per deck): the ranking with the chapter's name and message, the card's template photo among the
    candidates. Chosen after the chapters chose theirs, so a chapter keeps its best photo. The 조감도 card stays."""
    ol = ctx.get('outline') or []
    L = load()['layouts']
    for sl in slides:
        if sl['kind'] != 'toc':
            continue
        img, meta = sl.setdefault('img', {}), sl.setdefault('img_meta', {})
        boxes = {str(im['i']): im for im in (L.get(sl['f']) or {}).get('images') or []}
        for key in sorted(img, key=lambda k_: int(k_) if str(k_).isdigit() else 99):
            cur = img.get(key)
            src = norm_src(cur) if isinstance(cur, dict) and not cur.get('hidden') else ''
            if (meta.get(key) or {}).get('kind') in ('plan', 'icon') or src.startswith('/assets/vertical-std/') or (src and not counts_once(src)):
                continue  # the 조감도 card · an icon · a product cut
            o = ol[int(key)] if key.isdigit() and int(key) < len(ol) else None
            box = boxes.get(key) or {}
            if o is None:
                continue  # a card no chapter stands behind keeps the photo it holds (its template photo, or the one that replaced a repeat)
            if src:
                used.release(src)  # the photo this card holds (since the start, or since its part replaced a repeat) is a candidate again
            r = results.get(o['id']) or {}
            slot = {'key': key, 'kind': 'scene', 'orig': cur, 'osrc': src, 'near': ' '.join(x for x in (o.get('name'), o.get('message')) if x)[:160],
                    'title': o.get('name') or '', 'hint': box.get('hint') or box.get('alt') or '', 'part_type': r.get('type') or '', 'fit': box.get('fit') or '',
                    'w': box.get('w'), 'h': box.get('h'), 'bind': {}, 'families': set(), 'message': o.get('message') or ''}
            snap = used.snapshot()
            cands = candidates(slot, ctx, snap, 8)
            got = next((c['src'] for c in cands if used.claim(c['src'])), None)  # (the template photo is one of the candidates)
            if got:
                if got != src:
                    img[key] = img_value(got, (cur or {}).get('fit') if isinstance(cur, dict) else box.get('fit') or 'cover')
                meta[key] = {'kind': 'scene', 'why': 'chapter_card' if got != src else 'template_original(chapter card)', 'part': o['id']}
            else:
                img[key] = {'hidden': True, 'name': ''}
                meta[key] = {'kind': 'scene', 'why': 'hidden', 'flag': 'no_fitting_picture', 'part': o['id'], 'note': 'no unused photo fits this chapter card'}


