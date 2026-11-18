"""Picture pipeline for the template-driven composer (``composer.auto``) — a picture must fit what is written around it.

Every picture slot of a composed slide is *typed* and *bound* before anything is chosen:

    icon · logo      part of the layout / the feature it stands for            → the template's own picture stays
    plan             조감도                                                    → the customer's birdseye image when given
    product          a product cut (data-kind cut · object-fit contain)        → the bound product's own cut (exact product)
    solution         a slot on a slide about one solution                      → that solution's media (screen · key visual)
    case             a slot on a 도입사례 slide                                → that case's own photos
    space            the photo of one space of the customer                    → a scene of that space in this (sub-)vertical
    scene            any other photo (간지 · 표지 · 배경)                       → a scene of this industry that fits the wording

Bound slots (product · solution · case · plan) are filled by code — the model is not asked. For space / scene slots the
template's own picture is kept when the slide still talks about the same thing and the picture passes the hard rules;
otherwise candidates are retrieved (hard filters first, then ranking), the model picks one per slot seeing the slide's
*final* wording (title · the text next to the slot · the part's message · the bound space / product), and a second
call verifies each pick against that wording — a rejected pick is replaced by the verifier's alternative, else by the
template's picture when it is allowed, else flagged.

Hard rules (``rule_reject``): picture class vs slot type · another industry's place · another sub-vertical of the same
industry (백화점 in a 대형마트 deck) · another company's sign outside a case part · a visible product family that is not the
one the text is about (에어컨 next to a 사이니지 paragraph).

Every chosen picture carries *why* it was chosen (``agent.img[slot]``) so a reviewer can audit it.

One picture appears once per deck (product cuts excepted). "Once" is by *picture identity* (``pic``), not by address: the same
photo sits in several packs (a case photo, its re-crop in a scenario fill pack, its greyed-out copy) — ``app/data/picture_ids.json``
groups them and the library carries the group as ``images[src]['pic']``. Every slot that ends up showing a picture claims its
identity in the deck registry (``PictureRegistry``) — kept template pictures, solution media and case photos as well as ranked
picks — and a slot whose picture another slot already holds gets another picture or none, never the same one again.

A space photo must show *that* space: the space is judged in the vertical it belongs to (a 교통 대합실 in a 청사 deck is a
교통 space), and a photo whose caption or vision facts name another kind of space (대합실 for 민원실, 관제 for 매표) is not a
photo of it (``space_conflict``). The 표준 제안서 photo of a space is a ranking hint, not an answer — it passes the same rules.
"""
from __future__ import annotations

import json
import re
import threading
from typing import Dict, List, Optional, Sequence, Set

from .fill import brand_ok, brand_tokens, clean_caption, plain, who
from . import library as _library
from .library import ROOT
from .textsim import BM25, tokens

# ------------------------------------------------------------------------------------------------ photo shape
# 사용자 지시 2026-11-18: 사진 고르기에서 칸(레이아웃) 비율과 사진 비율을 함께 본다 — 조금 잘리는 건 괜찮지만 아무 사진이나 칸에 욱여넣지
# 않는다. 공간 · 배경(장면) · 사례 · 솔루션 장면처럼 칸을 꽉 채우는(cover) 사진에만 — 제품 컷은 통째로 보이므로(contain) 해당 없음.
# 칸을 꽉 채우면 사진은 짧은 쪽에 맞춰 커지고 긴 쪽이 잘린다: 보이는 몫 = min(r, 1/r), r = 사진 비율 / 칸 비율.
PICTURE_DIMS = ROOT / 'app' / 'data' / 'picture_dims.json'  # ← app/scripts/build_picture_dims.py (sizes the library tables lack)
SHAPE_OK = 0.8     # ≥ 80 % of the photo stays in the frame: a slight trim, no cost
SHAPE_MIN = 0.55   # under this the frame shows a strip of the photo — kept only when it shows the subject clearly better (SHAPE_EDGE)
SHAPE_W = 6.0      # rank cost per missing share below SHAPE_OK (0.6 → −1.2: less than 'this very space' over 'this kind of space')
SHAPE_EDGE = 1.5   # how much better a strip's subject match must be than the best fitting photo's (the word match spans 0–3)
_SIZES: Dict[str, list] = {}
_PROBE: List[str] = []  # a photo the library tables leave without a size: while it has none, this library copy is not sized yet


def load() -> dict:
    """the composer library (through ``library.load`` at call time — the app swaps in its live-layout · lab-snapshot loader), with
    the pixel size of every photo: the library tables miss a quarter of the scene photos."""
    lib = _library.load()
    IM = lib['images']
    if not _SIZES:
        try:
            _SIZES.update(json.loads(PICTURE_DIMS.read_text(encoding='utf-8')))
        except (OSError, ValueError):
            _SIZES['-'] = []
        _PROBE.extend(src for src, wh in _SIZES.items() if wh and src in IM and not IM[src].get('w'))
    probe = IM.get(_PROBE[0]) if _PROBE else None
    if probe is not None and not probe.get('w'):
        for src, wh in _SIZES.items():
            it = IM.get(src)
            if wh and it is not None and not (it.get('w') and it.get('h')):
                it['w'], it['h'] = wh
    return lib


def visible(src: str, slot: dict, it: Optional[dict] = None) -> Optional[float]:
    """the share of the photo a 'cover' frame shows (1.0 = same shape); None for a whole-picture ('contain') frame or unknown sizes."""
    if (slot.get('fit') or 'cover') == 'contain' or not (slot.get('w') and slot.get('h')):
        return None
    it = it if it is not None else load()['images'].get(norm_src(src)) or {}
    if not (it.get('w') and it.get('h')):
        return None
    r = (it['w'] / it['h']) / (slot['w'] / slot['h'])
    return min(r, 1 / r)


def shape_cost(src: str, slot: dict, it: Optional[dict] = None) -> float:
    vis = visible(src, slot, it)
    return 0.0 if vis is None or vis >= SHAPE_OK else SHAPE_W * (SHAPE_OK - vis)


def by_shape(srcs: Sequence[str], slot: dict) -> List[str]:
    """the same pictures, the ones that fit the frame's shape first (stable: equally fitting pictures keep their order)."""
    return sorted(srcs, key=lambda x: shape_cost(x, slot))

FAMILY_WORDS = {
    'display': ['사이니지', '메뉴보드', '디스플레이', '비디오월', '키오스크', '전자칠판', 'LED', 'TV', '스크린', '모니터', 'The Wall', '미디어월', '전광판',
                '이페이퍼', '플립'],
    'hvac': ['에어컨', '공조', '냉난방', '실외기', '실내기', '카세트', '무풍', '환기', '공기청정', '칠러', '히트펌프', '냉방', '난방', 'DVM'],
    'appliance': ['냉장고', '세탁기', '건조기', '식기세척기', '인덕션', '오븐', '에어드레서', '정수기', '청소기', '쇼케이스'],
    'mobile': ['태블릿', '갤럭시 탭', '스마트폰', '워치', '노트북', '갤럭시 북', '단말', 'POS', '휴대폰'],
}
FAM_OF = {'디스플레이': 'display', '공조 · 에어컨': 'hvac', '주방 · 리빙 가전': 'appliance', '모바일 · PC': 'mobile'}
SOL_ICON = re.compile(r'/assets/toc/icons/((?:s|svc)_[a-z0-9]+)\.')
BLANK_ICON = '/assets/toc/icons/blank.png'
GENERIC_CAPTION = re.compile(r'(간지 사진|공간 사진|고객 공간 사진|^[^ ]{1,12} 사진)$')
ICON_SRC = re.compile(r'/assets/(toc/icons|subs)/|/icons?/|blank\.png')
PRODUCT_KINDS = {'cut', 'detail', 'kiosk', 'signage'}
SCREEN_KINDS = {'ui', 'cms', 'energy', 'phone', 'content'}


# what the vision pass saw (images[src]['vf']['place']) → the industries / sub-verticals such a place belongs to.
# venue: a customer-facing place that identifies a business; the others (사무실 · 로비 · 설비 …) can be a back room of any business.
PLACE = {
    '카페·베이커리': (['FB'], ['fb_cafe'], True), '패스트푸드·퀵서비스': (['FB'], ['fb_qsr'], True), '레스토랑·식당': (['FB', 'HT'], ['fb_rest', 'ht_large'], True),
    '대형마트·슈퍼': (['RT'], ['rt_hyper'], True), '백화점·쇼핑몰': (['RT'], ['rt_mall'], True),
    '브랜드 매장·쇼룸': (['RT', 'OE', 'ID'], ['rt_flag', 'rt_small', 'oe_telco', 'id_partner'], True),
    '편의점·소형 매장': (['RT', 'SV'], ['rt_small', 'sv_unmanned', 'sv_beauty', 'sv_laundry'], True), '전통시장': (['-'], ['-'], True),
    '호텔 로비·프런트': (['HT'], [], True), '호텔 객실': (['HT'], [], True), '연회장·행사장': (['HT', 'VN', 'OF'], [], True),
    '교실·강의실': (['ED'], [], True), '병원·의료': (['MD'], [], True), '공장·물류': (['MF', 'RT'], ['mf_factory', 'mf_logistics'], True), '은행·금융': (['FN'], [], True),
    '공공기관·교통': (['PB'], [], True), '경기장·공연장·영화관': (['VN'], [], True), '전시·박물관·테마파크': (['TP'], [], True),
    '사무실': (['OF', 'FN', 'PB', 'MF', 'OE', 'ID'], [], False), '회의실': (['OF', 'FN', 'PB', 'ED', 'HT'], [], False),
    '건물 로비·라운지': (['OF', 'HT', 'RS', 'FN', 'PB', 'MD'], [], False), '주거(거실·주방·침실)': (['RS', 'ID', 'HT'], [], False),
}


def vf_of(src: str) -> dict:
    return (load()['images'].get(src) or {}).get('vf') or {}


def vf_reject(src: str, slot: dict, ctx: dict, relax: bool = False) -> str:
    """rules on what the vision pass saw in the photo (place · brand sign · usable). '' when fine or when the photo was not looked at."""
    f = vf_of(src)
    if not f:
        return ''
    if (f.get('kind') != 'photo' or f.get('place') == '제품·화면만') and not relax:
        return 'vision_not_a_scene'  # an illustration · screen capture · product collage where a photo of a place belongs
    if f.get('quality') == 'low' and not relax:
        return 'vision_low_quality'
    brand = str(f.get('brand') or '').strip()
    it = load()['images'].get(src) or {}
    linked_case = it.get('case') is not None and str(it['case']) in (ctx.get('cases') or [])
    in_case_part = slot.get('part_type') in ('case', 'why')
    allowed_site = in_case_part and (linked_case or not ctx.get('cases'))
    if f.get('brand_prominent') and brand and not allowed_site and not re.search(r'samsung|삼성', brand, re.I):
        who_ = re.sub(r'\s+', '', (ctx.get('who') or '')).lower()
        if re.sub(r'\s+', '', brand).lower() not in who_:
            return 'vision_other_brand'  # another company's sign is in the frame (allowed: the linked case's site, in the case part)
    if not allowed_site and not relax:  # the vision pass recognised whose site it is ('대구경찰청 상황실') — a named third party
        shows = str(f.get('shows') or '')
        who_ = ctx.get('who') or ''
        if any(len(t) >= 3 and t in shows and t not in who_ for t in brand_tokens(src)):
            return 'vision_named_site'
    inds, vxs, venue = PLACE.get(f.get('place') or '', ([], [], False))
    if not inds:
        return ''
    ind = ctx.get('ind')
    vids = slot_verticals(slot, ctx)
    if venue or slot.get('kind') == 'scene':
        if ind and ind not in inds and not (relax and not venue):
            return 'vision_other_place'
        if vxs and vids and not any(v in vxs for v in vids) and not relax:
            V = load().get('verticals') or {}
            groups = {(V.get(v) or {}).get('group') for v in vids}
            if vxs == ['-'] or any((V.get(x) or {}).get('group') in groups for x in vxs):
                return 'vision_other_subvertical'
    return ''


class Registry:
    """thread-safe set shared by the parts composed in parallel (layouts used in the deck · scene photos used in the deck)."""

    def __init__(self, seed: Sequence[str] = ()) -> None:
        self._lock = threading.Lock()
        self._items: Set[str] = set(seed)

    def claim(self, key: str) -> bool:
        """True when ``key`` was free and is now taken by the caller."""
        with self._lock:
            if key in self._items:
                return False
            self._items.add(key)
            return True

    def add(self, key: str) -> None:
        with self._lock:
            self._items.add(key)

    def release(self, key: str) -> None:
        with self._lock:
            self._items.discard(key)

    def __contains__(self, key: str) -> bool:
        with self._lock:
            return key in self._items

    def snapshot(self) -> Set[str]:
        with self._lock:
            return set(self._items)


def norm_src(src) -> str:
    s = str((src.get('src') if isinstance(src, dict) else src) or '')
    return s[1:] if s.startswith('/img/') else s


def pic(src) -> str:
    """the picture's identity — the same photo under another address (another pack · crop · encoding) is the same picture."""
    s = norm_src(src)
    return (load()['images'].get(s) or {}).get('pic') or s


def counts_once(src) -> bool:
    """a picture that may appear only once in a deck: everything shown as a picture except product cuts, icons and the
    customer's own drawings (조감도 data: URLs are one-off by nature)."""
    s = norm_src(src)
    if not s or s.startswith('data:') or ICON_SRC.search(s):
        return False
    return (load()['images'].get(s) or {}).get('cls') != 'product'


class PictureRegistry(Registry):
    """the deck's pictures by identity: claiming one address claims every address of the same photo."""

    def claim(self, key: str) -> bool:
        return super().claim(pic(key))

    def add(self, key: str) -> None:
        super().add(pic(key))

    def release(self, key: str) -> None:
        super().release(pic(key))

    def __contains__(self, key: str) -> bool:
        return super().__contains__(pic(key))


def taken(src, snap: Set[str]) -> bool:
    """``src`` (by identity) is in a registry snapshot."""
    return pic(src) in snap


def families(text: str) -> Set[str]:
    t = str(text or '')
    return {fam for fam, words in FAMILY_WORDS.items() if any(w in t for w in words)}


def product_family(pid: Optional[str]) -> Optional[str]:
    p = load().get('products_all', {}).get(pid or '') or {}
    return FAM_OF.get(p.get('fam') or '')


_VX: Dict[str, tuple] = {}
_PIDX: Dict[str, object] = {}


def vx_tags(src: str, caption_only: bool = False) -> tuple:
    """sub-verticals a picture visibly belongs to — by the words of its own caption and what the vision pass saw in it
    ('지하철역 내 키오스크' is a station whatever the caption calls it), or also by the case it was shot for."""
    key = src + ('|c' if caption_only else '')
    if key in _VX:
        return _VX[key]
    lib = load()
    it = lib['images'].get(src) or {}
    text = ' '.join([it.get('desc') or ''] + list(it.get('names') or [])[:2] + [(it.get('vf') or {}).get('shows') or ''])
    c = lib['cases'].get(str(it.get('case'))) if it.get('case') is not None else None
    if c and not caption_only:
        text += ' ' + ' '.join(str(c.get(k) or '') for k in ('type', 'title', 'cust'))
    out = tuple(vid for vid, kws in _distinctive_kw().items() if any(w in text for w in kws))
    _VX[key] = out
    return out


def _distinctive_kw() -> Dict[str, List[str]]:
    """each sub-vertical's words that tell it apart — minus the words that name a space of a sibling of the same group ('강의실' says
    대학 for the vertical table, but a 학원 has 강의실 too)."""
    if 'dkw' not in _PIDX:
        V = load().get('verticals') or {}
        out = {}
        for vid, v in V.items():
            sib = {w for x, vv in V.items() if x != vid and vv.get('group') == v.get('group') for sp in vv.get('spaces') or []
                   for w in SPACE_SPLIT.split(sp.get('name') or '') if w}
            out[vid] = [w for w in v.get('kw') or [] if w not in sib]
        _PIDX['dkw'] = out
    return _PIDX['dkw']


def sibling_conflict(src: str, vid: Optional[str]) -> bool:
    """the picture shows another sub-vertical of the same industry group (and not this one)."""
    if not vid:
        return False
    V = load().get('verticals') or {}
    me = V.get(vid)
    if not me:
        return False
    it = load()['images'].get(src) or {}
    # the caption itself names another sub-vertical (백화점 · 면세점 in a 대형마트 deck): never, even if a standard deck used it
    cap = vx_tags(src, caption_only=True)
    if cap and vid not in cap and any(V[t].get('group') == me.get('group') for t in cap):
        return True
    if me.get('std') and me['std'] in (it.get('scen') or []):
        return False  # only the case record says so, and the vertical's own 표준 제안서 uses the picture
    tags = vx_tags(src)
    if not tags or vid in tags:
        return False
    return any(V[t].get('group') == me.get('group') for t in tags)


def other_vertical(src: str, vid: Optional[str]) -> bool:
    """the caption names a place of another kind of business altogether (a drugstore in a café deck)."""
    if not vid:
        return False
    V = load().get('verticals') or {}
    me = V.get(vid)
    if not me:
        return False
    it = load()['images'].get(src) or {}
    if me.get('std') and me['std'] in (it.get('scen') or []):
        return False
    tags = vx_tags(src)
    return bool(tags) and vid not in tags and not any(V[t].get('group') == me.get('group') for t in tags)


# ------------------------------------------------------------------------------------------------ spaces
# A space is one of the 234 spaces of the vertical registry (vertical_space_product.json) or a space the plan named itself. The words
# of all space names are the vocabulary a photo is read with: a photo whose caption names a space word of another *kind* of space
# (spatial library profile: reception · waiting · operations …) and none of this space's words shows another space.
SPACE_SPLIT = re.compile(r'[·/(),\s]+')
SPACE_STOP = {'공간', '존', '홀', '룸', '코너', '내', '외부', '현장', '운영', '관리', '안내', '데스크', '카운터', '로비', '입구', '라운지', '시설', '센터',
              '역사', '매장', '업무', '전용', '공용', '메인', '프리미엄', '대형', '소형', '중앙', '종합', '통합', '고객', '직원', '세대', '설치', '불가', '확인',
              '필요', '업소', '세탁기만', '건조기', '체험', '진열', '결제', '상담', '대기', '승강', '프로모션', '셀프', '무인', '스태프', '디바이스', '옥상'}
SPACE_SUFFIX = ('센터', '실', '장', '소', '관', '석', '룸', '존')
SPACE_PREFIX = ('종합', '통합', '중앙', '대', '소', '메인', '공용', '직원', '학생', '투숙객', '선수')
# words that tell a kind of space (spatial profile) apart, beyond the space names themselves — positive evidence only
PROFILE_WORDS = {
    'reception': ['접수', '창구', '안내 데스크', '안내데스크', '프런트', '리셉션', '민원', '번호표', '원무'],
    'waiting': ['대기', '대합실', '승강장', '대기석', '대기 의자'],
    'selfservice': ['키오스크', '무인', '셀프', '발권', '매표', '게이트'],
    'operations': ['관제', '상황실', '상황판', '통제', '비디오월'],
    'office': ['사무', '업무 공간', '책상', '오피스'],
    'meeting': ['회의', '미팅', '화상', '세미나'],
    'dining': ['식당', '카페테리아', '배식', '식사'],
    'kitchen': ['주방', '조리', '키친'],
    'theatre': ['강당', '무대', '객석', '공연'],
    'classroom': ['교실', '강의', '수업', '칠판'],
    'mechanical': ['기계실', '실외기', '옥상', '설비'],
    'retail': ['진열', '매장', '쇼케이스', '판매'],
    'bedroom': ['객실', '침대', '침실'],
    'ward': ['병실', '병동', '입원'],
    'clinic': ['진료', '진료실', '수술'],
    'fitness': ['운동', '헬스', '피트니스', '트레이닝', '체육관', 'GX', '웨이트'],
    'garment': ['라커', '락커', '탈의', '파우더', '피팅'],
    'laundry': ['세탁', '빨래', '건조기'],
    'study': ['열람', '자습', '독서실', '스터디'],
    'library': ['도서관', '서가', '열람'],
    'nursing': ['간호', '스테이션', '요양'],
    'administration': ['행정', '교무', '사무'],
    'consultation': ['상담', '상담실'],
    'warehouse': ['창고', '수장고', '보관', '물류'],
    'coldstore': ['냉장', '쇼케이스', '신선'],
    'lounge': ['휴게', '라운지', '소파'],
    'living': ['거실', '소파'],
    'homebedroom': ['침실', '드레스룸'],
    'dorm': ['생활관', '기숙사', '침상'],
    'production': ['생산', '라인', '공정', '클린룸'],
    'laboratory': ['연구실', '실험'],
    'computerlab': ['컴퓨터실', 'PC'],
    'bank': ['창구', '은행'],
    'immersive': ['전시', '체험', '몰입', '미디어아트'],
    'outdoorinfo': ['정류장', '옥외', '거리', '게이트'],
    'billboard': ['전광판', '외벽', '파사드'],
    'field': ['현장', '점검', '작업자'],
}


# the words that name a *place* (a room · a counter · a hall) — a photo that names one of another kind shows another space. Space names
# also carry devices and adjectives (메뉴보드 · 사이니지 · 실내 · 출입 · 대표…) that say nothing about which room a photo shows.
PLACE_SUFFIX = ('실', '장', '관', '소', '센터', '룸', '홀', '석', '당', '방', '국사')
PLACE_NOUNS = {'창구', '쇼윈도', '파사드', '주방', '키친', '객실', '거실', '침실', '병실', '병동', '대합실', '승강장', '게이트', '콘코스', '아트리움', '광장',
               '수장고', '생산라인', '클린룸', '딜링룸', '스튜디오', '캠퍼스', '기숙사', '생활관', '연회장', '정류장', '푸드코트'}
STEM_OK = {'관제', '민원', '매표', '발권', '진료', '수술', '입원', '회의', '대합', '강의', '조리', '배식', '열람', '상영', '공연', '예배', '분장', '라커', '락커'}


def _place_word(w: str, full: bool) -> bool:
    return w in PLACE_NOUNS or w in STEM_OK or (full and w.endswith(PLACE_SUFFIX) and w not in SPACE_STOP)


OWN_STOP = {'공간', '존', '홀', '룸', '내', '설치', '불가', '확인', '필요', '업소', '세탁기만', '건조기', '전용', '공용', '메인', '프리미엄', '대형', '소형',
            '직원', '고객', '학생', '선수', '투숙객', '관람객', '이용객', '환자', '어린이', 'VIP', '본사', '본점', '점주', '관리', '운영'}  # people · adjectives: no room


def _space_words(name: str) -> Set[str]:
    """the words a caption uses for this space: its name's words and their stems (대합실 · 대합) — evidence that a photo shows it."""
    out: Set[str] = set()
    for t in SPACE_SPLIT.split(str(name or '')):
        if len(t) < 2 or t in OWN_STOP:
            continue
        forms = {t}
        for pre in SPACE_PREFIX:
            if t.startswith(pre) and len(t) - len(pre) >= 2:
                forms.add(t[len(pre):])
        for f in list(forms):
            for suf in SPACE_SUFFIX:
                if f.endswith(suf) and len(f) - len(suf) >= 2:
                    forms.add(f[:-len(suf)])
        out |= {f for f in forms if len(f) >= 2 and f not in OWN_STOP}
    return out


def _spaces() -> dict:
    """{'by_id': {space id: {vertical, name, profile, words}}, 'vocab': {word: {profiles}}} over every vertical's spaces."""
    if 'spaces' not in _PIDX:
        by_id, vocab = {}, {}
        for vid, v in (load().get('verticals') or {}).items():
            for sp in v.get('spaces') or []:
                w = _space_words(sp.get('name'))
                by_id[sp['id']] = {'id': sp['id'], 'vertical': vid, 'name': sp.get('name') or '', 'profile': sp.get('profile') or '', 'words': w,
                                   'ph': sp.get('ph')}
                full = {t for t in SPACE_SPLIT.split(sp.get('name') or '')}
                for x in w:
                    if x not in SPACE_STOP and _place_word(x, x in full):
                        vocab.setdefault(x, set()).add(sp.get('profile') or '')
        _PIDX['spaces'] = {'by_id': by_id, 'vocab': vocab}
    return _PIDX['spaces']


def space_info(ctx: dict, sid: Optional[str]) -> dict:
    """the bound space: its own vertical (a space of another vertical keeps it — 대합실·승강장 is a 교통 space in any deck), kind and words."""
    reg = _spaces()['by_id']
    own = (ctx.get('space_by_id') or {}).get(sid or '') or {}
    hit = reg.get(sid or '')
    if not hit and own.get('name'):  # a space the plan named itself: the registry space of the same name, this vertical first
        same = [x for x in reg.values() if x['name'] == own['name']]
        hit = next((x for x in same if x['vertical'] == ctx.get('vertical')), None) or (same[0] if same else None)
    name = own.get('name') or (hit or {}).get('name') or ''
    words = _space_words(name) | ((hit or {}).get('words') or set())
    profile = (hit or {}).get('profile') or ''
    if not profile:
        profs = set().union(*[_spaces()['vocab'].get(w, set()) for w in words]) - {''} if words else set()
        profile = next(iter(profs)) if len(profs) == 1 else ''
    vid = (hit or {}).get('vertical') or ctx.get('vertical')
    full = {t for t in SPACE_SPLIT.split(name) if len(t) >= 2 and t not in OWN_STOP}
    # the rooms of the same vertical this space is not — a photo that names one of them shows that room (수술실 ≠ 진료실, both 'clinic')
    siblings = {w for x in reg.values() if x['vertical'] == vid and x['id'] != (hit or {}).get('id') and x['name'] != name
                for w in SPACE_SPLIT.split(x['name']) if len(w) >= 2 and w not in OWN_STOP and w not in SPACE_STOP and w not in words and _place_word(w, True)}
    return {'id': sid, 'name': name, 'vertical': vid, 'profile': profile, 'words': words, 'full': full, 'siblings': siblings, 'ph': (hit or {}).get('ph')}


def _photo_texts(src: str) -> tuple:
    """(what the caption says · what the vision pass saw) — and, outside case records (whose space list is the whole site's), its space tags."""
    it = load()['images'].get(src) or {}
    cap = ' '.join([it.get('desc') or ''] + list(it.get('names') or [])[:2] + ([] if it.get('group') == 'media-case' else list(it.get('spaces') or [])[:4]))
    return cap, (it.get('vf') or {}).get('shows') or ''


def _fit(text: str, sp: dict) -> tuple:
    if any(w in text for w in sp.get('full') or sp['words']):
        return 2, ''  # a word of the space's own name (승강장 · 민원실)
    # a stem of it (민원 · 진료) or a word for this kind of space (접수 · 창구) says the kind, not the room
    level = 1 if any(w in text for w in sp['words']) or (sp['profile'] and any(w in text for w in PROFILE_WORDS.get(sp['profile'], []))) else 0
    for w in sp.get('siblings') or ():
        if w in text:
            return level, w
    for w, profs in _spaces()['vocab'].items():
        if w not in text or any(w in x or x in w for x in sp['words']):
            continue
        if sp['profile'] and sp['profile'] in profs:
            continue  # another name for the same kind of space (대기실 · 대기 공간)
        if not sp['profile'] and not profs - {''}:
            continue
        return level, w
    return level, ''


def space_fit(src: str, sp: dict) -> tuple:
    """(level, other): level 2 = the photo names this space · 1 = it names this kind of space · 0 = neither; other = a room of another
    kind the photo names ('' when none). The caption speaks first: what the vision pass saw counts only where the caption is silent
    (a caption '학교 식당' is a 식당 even when the vision pass took it for a 강의실)."""
    cap, seen = _photo_texts(src)
    level, other = _fit(cap, sp)
    if level >= 1:
        return level, other
    level2, other2 = _fit(cap + ' ' + seen, sp)
    return level2, other or other2


def space_conflict(src: str, slot: dict, ctx: dict) -> str:
    """'' when the photo may stand for the slot's space, else why not: it names a room of another kind and not this space itself
    (a photo of a 대기 공간 with a 창구 in view still shows the 대기 공간; a 회의실 tablet stand is not an ATM zone for showing a kiosk)."""
    if slot.get('kind') != 'space' or not slot.get('bind', {}).get('space'):
        return ''
    level, other = space_fit(src, space_info(ctx, slot['bind']['space']))
    return f'wrong_space({other})' if other and level < 2 else ''


OUTDOOR_PROFILES = {'outdoorinfo', 'billboard', 'field'}


def shows_venue(src: str, ind: Optional[str], sp: dict) -> bool:
    """the photo shows the customer's kind of place (what the vision pass saw, else the caption's place words) — and an indoor space
    is not shown by a photo taken outdoors."""
    it = load()['images'].get(src) or {}
    vf = it.get('vf') or {}
    if vf.get('place') == '건물 외관·옥외':
        return sp.get('profile') in OUTDOOR_PROFILES
    pl = PLACE.get(vf.get('place') or '')
    if pl:
        return bool(ind) and ind in pl[0]
    return bool(ind) and ind in (it.get('place') or [])


def stand_in(src: str, sp: dict, ctx: dict) -> bool:
    """another industry's photo that may still stand for the space: a generic place this industry has too (a building lobby, an office —
    not a venue that names a business), showing this kind of space, with no sign and no named site in it."""
    it = load()['images'].get(src) or {}
    vf = it.get('vf') or {}
    pl = PLACE.get(vf.get('place') or '')
    if not pl or pl[2] or not ctx.get('ind') or ctx['ind'] not in pl[0]:
        return False
    if vf.get('brand') or it.get('cust') or it.get('case') is not None or brand_tokens(src):
        return False
    return space_fit(src, sp)[0] >= 1


def slot_verticals(slot: dict, ctx: dict) -> List[str]:
    """the sub-verticals a slot's photo may come from: a space slot — its space's own vertical; any other slot — the deck's vertical
    and the verticals of the spaces the deck presents (a 청사 deck with 교통 spaces may open a chapter on a station)."""
    if slot.get('kind') == 'space' and slot.get('bind', {}).get('space'):
        v = space_info(ctx, slot['bind']['space'])['vertical']
        return [v] if v else []
    out = [ctx.get('vertical')] if ctx.get('vertical') else []
    for sp in ctx.get('spaces') or []:
        v = space_info(ctx, sp.get('id'))['vertical']
        if v and v not in out:
            out.append(v)
    return out


def rule_reject(src: str, slot: dict, ctx: dict, relax: bool = False) -> str:
    """'' when the picture may fill the slot, else the rule it breaks."""
    if src in ctx.get('off_pictures', ()):
        return 'disabled'
    lib = load()
    it = lib['images'].get(src)
    if not it:
        return 'unknown'
    kind = slot['kind']
    cls = it.get('cls')
    if kind == 'product':
        return '' if cls == 'product' else 'class'
    if kind in ('space', 'scene'):
        if cls not in ('scene', 'kv'):
            return 'class'
        if slot.get('part_type') == 'case' and it.get('case') is not None and str(it['case']) in (ctx.get('cases') or []):
            return ''
        ind = ctx.get('ind')
        place = it.get('place') or []
        prim = it.get('ind_primary') or []
        if ind and place and ind not in place:
            return 'other_industry_place'
        sp = space_info(ctx, slot['bind']['space']) if kind == 'space' and slot.get('bind', {}).get('space') else None
        # the industry a photo is filed under is its source's (a case of another industry); a generic place showing this kind of space,
        # or the photo the vertical's own deck uses for this space, may still stand for it — the other rules below still apply
        own_photo = bool(sp and sp.get('ph') and pic(src) == pic(norm_src(sp['ph'])))
        if ind and prim and ind not in prim and ind not in place and not relax and not (sp and (own_photo or stand_in(src, sp, ctx))):
            return 'other_industry_source'
        vids = slot_verticals(slot, ctx)
        if vids and all(sibling_conflict(src, v) for v in vids):
            return 'other_subvertical'
        if not relax and vids and all(other_vertical(src, v) for v in vids):
            return 'other_vertical'
        wrong = space_conflict(src, slot, ctx)  # never relaxed: a photo of another kind of space does not stand for this one
        if wrong:
            return wrong
        if not brand_ok(src, ctx.get('who') or '', slot.get('part_type') or ''):
            return 'other_brand'
        if slot.get('part_type') in ('cover', 'closing') and not relax and (it.get('cust') or it.get('case') is not None or brand_tokens(src)):
            return 'named_site_on_cover'
        want = slot.get('families') or set()
        vp = set((it.get('vf') or {}).get('products') or []) - {'none'}
        seen = vp or families(it.get('desc') or '')
        if want and seen and not (want & seen):
            return 'other_product_family'
        return vf_reject(src, slot, ctx, relax)
    return ''


# ------------------------------------------------------------------------------------------------ bound slots
def _by_product() -> Dict[str, List[str]]:
    if 'byp' not in _PIDX:
        IM = load()['images']
        out: Dict[str, List[str]] = {}
        for src, it in IM.items():
            if it.get('cls') == 'product' and it.get('group') in ('bs-prod', 'prod', 'lib', 'root', 'asset'):
                for p in it.get('products') or []:
                    out.setdefault(p, []).append(src)
        rank = {'bs-prod': 0, 'prod': 1, 'lib': 2, 'asset': 3, 'root': 4}
        for p in out:
            out[p].sort(key=lambda s: rank.get(IM[s].get('group'), 3))
        _PIDX['byp'] = out
    return _PIDX['byp']


def own_cuts(pid: str) -> List[str]:
    """the pictures that are *certainly* this product: its curated cut file, its catalog gallery and thumbnail."""
    lib = load()
    IM = lib['images']
    p = lib.get('products_all', {}).get(pid) or {}
    out = [s for s in [f'img/bs/p-{pid}.png'] + list(p.get('gal') or []) + ([p['th']] if p.get('th') else []) if s and s in IM]
    return list(dict.fromkeys(out))


def is_cut_of(orig, pid: str) -> bool:
    """the template's picture already shows this exact product (its own cut, or the template says so)."""
    src = norm_src(orig) if orig else ''
    if not src:
        return False
    if src in own_cuts(pid):
        return True
    if isinstance(orig, dict) and (orig.get('pid') == pid or pid in (orig.get('products') or [])):
        return True
    return False


def product_cut(pid: str, original=None, excluded=()) -> Optional[str]:
    """the product's own cut: the template's picture when it already shows this product, else the catalog cut."""
    if original and norm_src(original) not in excluded and is_cut_of(original, pid):
        return norm_src(original)
    own = [s for s in own_cuts(pid) if s not in excluded]
    if own:
        return own[0]
    IM = load()['images']
    # the product image library lists its product first (later ids are only names found in the caption)
    lib_cuts = [s for s in _by_product().get(pid, []) if s not in excluded and (IM[s].get('products') or [None])[0] == pid and not re.search(r'치수|도면|가로·세로', IM[s].get('desc') or '')]
    lib_cuts.sort(key=lambda s: 0 if '정면' in (IM[s].get('desc') or '') else 1)
    return lib_cuts[0] if lib_cuts else None


def solution_media(sid: str, want: str, used: Set[str]) -> List[str]:
    """pictures of one solution — screens first for a screen slot, scenes / key visuals for a photo slot."""
    if 'bys' not in _PIDX:
        out: Dict[str, List[str]] = {}
        for src, it in load()['images'].items():
            if it.get('group') == 'media-sol':
                for s in it.get('solutions') or []:
                    out.setdefault(s, []).append(src)
        _PIDX['bys'] = out
    IM = load()['images']
    order = {'screen': ['screen', 'kv', 'diagram', 'scene', 'product'], 'scene': ['scene', 'kv', 'screen', 'diagram', 'product'],
             'cut': ['kv', 'screen', 'product', 'diagram', 'scene'], 'diagram': ['diagram', 'screen', 'kv', 'scene', 'product']}[want]
    pool = sorted(_PIDX['bys'].get(sid, []), key=lambda s: (order.index(IM[s]['cls']) if IM[s]['cls'] in order else 9, taken(s, used)))
    return pool


def case_photos(cid: str) -> List[str]:
    if 'byc' not in _PIDX:
        out: Dict[str, List[str]] = {}
        for src, it in load()['images'].items():
            if it.get('case') is not None and it.get('group') == 'media-case':
                out.setdefault(str(it['case']), []).append(src)
        _PIDX['byc'] = out
    IM = load()['images']
    pool = list(_PIDX['byc'].get(str(cid), []))
    # the representative picture first: exterior / wide scene, then scenes, then product close-ups and screens
    rank = {'exterior': 0, 'scene': 1, 'people': 2, 'kv': 2, 'product': 3, 'screen': 4, 'diagram': 5}
    pool.sort(key=lambda s: rank.get(IM[s].get('kind'), 3))
    return pool


# ------------------------------------------------------------------------------------------------ slot typing
def slide_title(slide: dict) -> str:
    L = load()['layouts'].get(slide['f']) or {}
    t = slide.get('t') or {}
    for want in ('title', 'cover', 'heading'):
        for x in L.get('texts') or []:
            if x.get('role') == want and plain(t.get(str(x['i']))):
                return plain(t.get(str(x['i'])))
    vals = [plain(v) for _, v in sorted(t.items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 99)]
    return next((v for v in vals if len(v) > 10), '')


def near_slots(f: str, im: dict, n: int = 3) -> List[dict]:
    """the text slots that sit *next to* a picture slot: by position on the slide (the caption under / beside / over the picture),
    or — for layouts without positions — the texts that follow the picture in the markup up to the next picture."""
    L = load()['layouts'].get(f) or {}
    texts = [x for x in L.get('texts') or [] if not x.get('img')]
    modes = (L.get('modes') or {}).get('t') or {}
    body = [x for x in texts if modes.get(str(x['i'])) != 'section' and x.get('role') not in ('title', 'cover')] or texts
    if im.get('x') is not None and im.get('w') and im.get('h') and any(x.get('x') is not None for x in body):
        ix, iy, iw, ih = im['x'], im['y'], im['w'], im['h']
        scored = []
        for x in body:
            if x.get('x') is None:
                continue
            tx, ty, tw = x['x'], x['y'], x.get('w') or 300.0
            th = x.get('h') or (x.get('font') or 16.0) * 1.5
            over_x = tx < ix + iw - 4 and tx + tw > ix + 4
            over_y = ty < iy + ih - 4 and ty + th > iy + 4
            if over_x and over_y:
                d = 0.0                                   # written over the picture
            elif over_x and ty >= iy + ih - 4:
                d = ty - (iy + ih)                        # caption under the picture
            elif over_y and tx >= ix + iw - 4:
                d = tx - (ix + iw) + 10                   # text beside it (right)
            elif over_x and ty + th <= iy + 4:
                d = iy - (ty + th) + 120                  # heading above it (a caption under or beside the picture comes first)
            elif over_y and tx + tw <= ix + 4:
                d = ix - (tx + tw) + 40                   # text beside it (left)
            else:
                continue
            if d <= 220:
                scored.append((d, x['o'], x))
        if scored:
            scored.sort(key=lambda t: (t[0], t[1]))
            return [x for _, _, x in scored[:n]]
    imgs = sorted(i.get('o', 0) for i in L.get('images') or [])
    nxt = next((o for o in imgs if o > im.get('o', 0)), 10 ** 6)
    prv = max([o for o in imgs if o < im.get('o', 0)] or [-1])
    after = [x for x in body if im.get('o', 0) < x.get('o', 0) < nxt][:n]
    if after:
        return after
    before = [x for x in body if prv < x.get('o', 0) < im.get('o', 0)][-n:]
    return before[::-1]


def near_text(slide: dict, im: dict, n: int = 3, span: int = 4) -> str:
    t = slide.get('t') or {}
    vals = [plain(t.get(str(x['i']))) for x in near_slots(slide['f'], im, n + 2)]
    vals = [v for v in vals if v and len(v) > 2 and not re.fullmatch(r'[\d\s/·.]+', v)]  # numbering is not a caption
    return ' / '.join(vals[:n])[:160]


resolve_item = None  # set by composer.auto: (ctx, text) → ('product' | 'solution', id) | None — a selected item named in other words


def named_item(text: str, ctx: dict) -> Dict[str, str]:
    """the selected product · solution a caption names: by its exact name, else in other words ('공기청정기' · '병원 안내 솔루션')."""
    hit = match_entity(text, ctx)
    if hit or resolve_item is None or not str(text or '').strip() or len(str(text)) > 40:
        return hit
    it = resolve_item(ctx, str(text))
    return {it[0]: it[1]} if it else {}


def match_entity(text: str, ctx: dict) -> Dict[str, str]:
    """a linked product / solution named in ``text`` (longest name first)."""
    lib = load()
    PA, S = lib.get('products_all', {}), lib['solutions']
    t = str(text or '')
    best: Dict[str, str] = {}
    hits = []
    for pid in ctx.get('products') or []:
        p = PA.get(pid) or {}
        name = str(p.get('name') or '')
        words = name.split()
        # the product as a writer shortens it: without the model code ('삼성 키오스크'), or its first two words ('무풍 1Way')
        short = [' '.join(w for w in words if not re.search(r'\d', w) or len(words) <= 1), ' '.join(words[:2]) if len(words) >= 3 else '']
        for nm in [name, p.get('model'), ctx.get('short', {}).get(pid)] + [x for x in short if len(x) >= 5]:
            if nm and len(str(nm)) >= 3 and str(nm) in t:
                hits.append((len(str(nm)), 'product', pid))
    for sid in ctx.get('solutions') or []:
        s = S.get(sid) or {}
        for nm in [s.get('name')] + list(s.get('kw') or [])[:3] + [ctx.get('short', {}).get(sid)]:
            if nm and (len(str(nm)) >= 3 or (len(str(nm)) == 2 and not str(nm).isascii())) and str(nm) in t:
                hits.append((len(str(nm)), 'solution', sid))
    if hits:
        hits.sort(reverse=True)
        best[hits[0][1]] = hits[0][2]
    return best


def type_slots(slide: dict, part: dict, ctx: dict) -> List[dict]:
    """every picture slot of the slide with its type, its bound entity and the wording around it (after the text fill)."""
    lib = load()
    L = lib['layouts'].get(slide['f'])
    if not L:
        return []
    IM = lib['images']
    ex_img = slide.get('ex_img') or {}
    bind = slide.get('bind') or {}
    kind_s = bind.get('kind') or 'generic'
    title = slide_title(slide)
    out = []
    pi = 0  # running index of product slots on the slide (for slides that list several products in order)
    for im in L.get('images') or []:
        key = str(im['i'])
        orig = ex_img.get(key)
        osrc = norm_src(orig) if orig else ''
        ometa = IM.get(osrc) or {}
        near = near_text(slide, im)
        dk = im.get('kind') or ''
        slot = {'key': key, 'orig': orig, 'osrc': osrc, 'near': near, 'title': title, 'hint': im.get('hint') or im.get('alt') or '',
                'part_type': part.get('type') or '', 'fit': im.get('fit') or '', 'w': im.get('w'), 'h': im.get('h'), 'bind': {}}
        if dk == 'icon' or (osrc and ICON_SRC.search(osrc)) or dk == 'logo':
            slot['kind'] = 'icon'
            m = SOL_ICON.search(osrc or '')
            if key in (slide.get('icons') or {}):
                slot['icon'] = slide['icons'][key]          # set by the layout stage (핵심 기술 장: the bound solution's own icons)
            elif m and kind_s != 'static' and not slide.get('fixed'):
                sid = (lib.get('sol_keys') or {}).get(m.group(1))
                if sid not in (ctx.get('solutions') or []):
                    slot['icon'] = BLANK_ICON                # a feature icon of a solution this customer did not link
        elif kind_s in ('static', 'toc') or slide.get('keep') or slide.get('fixed'):
            slot['kind'] = 'keep'
        elif dk == 'plan':
            slot['kind'] = 'plan'
        elif kind_s == 'case' or dk == 'case':
            slot['kind'] = 'case'
            slot['bind'] = {'case': bind.get('case')}
        elif kind_s in ('cover', 'divider'):
            slot['kind'] = 'scene'
        elif (slide.get('img_bind') or {}).get(key) and dk in ('space', 'photo'):
            # a photo frame the layout stage gave to a selected item (가치 세 가지: the frame over each value shows the item the value
            # stands under) — that item's cut · screen, not whichever scene ranks first
            forced = slide['img_bind'][key]
            if forced.get('product'):
                slot['kind'], slot['bind'] = 'product', {'product': forced['product'], 'by': 'plan'}
            else:
                slot['kind'], slot['bind'] = 'solution', {'solution': forced.get('solution'), 'by': 'plan'}
        elif dk in PRODUCT_KINDS or (im.get('fit') == 'contain' and dk not in ('space', 'photo')) or (ometa.get('cls') == 'product' and dk not in ('space', 'photo')):
            named = match_entity(near, ctx)
            # the layout pairs its product pictures with its product-name text slots (slot_modes): the i-th picture ↔ the i-th name
            pm = sorted(int(k) for k, m in ((L.get('modes') or {}).get('t') or {}).items() if m == 'product')
            pimgs = sorted(int(k) for k, m in ((L.get('modes') or {}).get('img') or {}).items() if m == 'product')
            if pm and len(pm) == len(pimgs) and im['i'] in pimgs:
                ptxt = plain((slide.get('t') or {}).get(str(pm[pimgs.index(im['i'])])))
                paired = named_item(ptxt, ctx)
                slot['paired'] = bool(ptxt.strip())  # the frame belongs to a name cell that says something (a selected item or not)
                if paired:
                    named = paired
            plist = bind.get('products') or []
            ordered = kind_s in ('dss', 'map', 'spec', 'bom')  # slides that list several products in a fixed order
            forced = (slide.get('img_bind') or {}).get(key)     # the text stage fixed which selected item this frame shows
            if forced and forced.get('product'):
                slot['kind'], slot['bind'] = 'product', {'product': forced['product'], 'by': 'plan'}
            elif forced and forced.get('solution'):
                slot['kind'], slot['bind'] = 'solution', {'solution': forced['solution'], 'by': 'plan'}
            elif kind_s == 'solution' and bind.get('solution') and not named.get('product'):
                slot['kind'], slot['bind'] = 'solution', {'solution': bind['solution']}
            elif kind_s in ('space', 'product') and bind.get('product') and pi == 0:
                slot['kind'], slot['bind'] = 'product', {'product': bind['product'], 'by': 'slide'}
            elif ordered and pi < len(plist):
                slot['kind'], slot['bind'] = 'product', {'product': plist[pi], 'by': 'order'}
            elif ordered:  # more frames than selected products (the Device · Solution · Service diagram too): the frame stays empty
                slot['kind'], slot['bind'] = 'product', {}
                slot['extra'] = True
            elif named.get('product'):
                slot['kind'], slot['bind'] = 'product', {'product': named['product'], 'by': 'text'}
            elif named.get('solution'):
                slot['kind'], slot['bind'] = 'solution', {'solution': named['solution'], 'by': 'text'}
            else:
                linked = [p for p in ctx.get('products') or [] if is_cut_of(orig, p)]
                whole = match_entity(title + ' ' + ' '.join(plain(v) for v in (slide.get('t') or {}).values()), ctx)
                if linked:
                    slot['kind'], slot['bind'] = 'product', {'product': linked[0], 'by': 'template'}
                elif ometa.get('cls') in ('screen', 'diagram', 'kv') or (ometa.get('solutions') and not ometa.get('products')):
                    slot['kind'] = 'keep'  # a solution tile the text did not re-point — the template's own stays
                elif whole.get('product') and len(L.get('images') or []) == 1:
                    slot['kind'], slot['bind'] = 'product', {'product': whole['product'], 'by': 'slide_text'}
                else:
                    slot['kind'], slot['bind'] = 'product', {}
            pi += 1
        elif kind_s == 'solution' and bind.get('solution'):
            slot['kind'], slot['bind'] = 'solution', {'solution': bind['solution']}
            slot['want'] = 'screen' if dk in SCREEN_KINDS else 'diagram' if dk == 'diagram' else 'scene'
        elif dk in SCREEN_KINDS or dk == 'diagram':
            named = match_entity(near + ' ' + title, ctx)
            if named.get('solution'):
                slot['kind'], slot['bind'] = 'solution', {'solution': named['solution'], 'by': 'text'}
                slot['want'] = 'screen' if dk in SCREEN_KINDS else 'diagram'
            else:
                slot['kind'] = 'keep'
        elif bind.get('space') and (dk in ('space', 'photo', '') or kind_s in ('space', 'journey', 'scn')):
            slot['kind'] = 'space'
            nth = len([s for s in out if s['kind'] == 'space'])
            # 여정 장 · 공간별 시나리오(고객/공간 시나리오 — 공간 3곳씩 한 장): n번째 공간 사진 = 그 장의 n번째 공간
            if kind_s in ('journey', 'scn') and bind.get('spaces') and nth < len(bind['spaces']):
                sp = bind['spaces'][nth]
            else:
                parts_ = [x.strip() for x in near.split(' / ')]  # nearest caption first
                sp = next((x['id'] for seg in parts_ for x in ctx.get('spaces') or [] if x['name'] and x['name'] in seg), None) or bind['space']
            slot['bind'] = {'space': sp, 'product': bind.get('product') if kind_s == 'space' else None}
        else:
            slot['kind'] = 'scene'
        fam = set()
        if slot['bind'].get('product'):
            f = product_family(slot['bind']['product'])
            fam = {f} if f else set()
        elif slot['kind'] in ('space', 'scene'):
            fam = families(near)  # only what is written right next to the slot
            if len(fam) != 1:
                fam = set()
        slot['families'] = fam
        out.append(slot)
    return out


# ------------------------------------------------------------------------------------------------ candidates
_IDX: Dict[str, object] = {}


def _scene_index():
    if 'bm' not in _IDX:
        IM = load()['images']
        keys = [k for k, it in IM.items() if it.get('cls') in ('scene', 'kv') and it.get('group') != 'bs' and not k.startswith('img/cover/')]
        _IDX['keys'] = keys
        _IDX['pos'] = {k: n for n, k in enumerate(keys)}
        _IDX['bm'] = BM25([tokens(' '.join([IM[k]['desc']] + IM[k]['names'][:2] + IM[k]['spaces'][:5] + [(IM[k].get('vf') or {}).get('shows') or '', (IM[k].get('vf') or {}).get('place') or '']))
                           for k in keys])
    return _IDX['keys'], _IDX['pos'], _IDX['bm']


def space_name(ctx: dict, sid: Optional[str]) -> str:
    sp = (ctx.get('space_by_id') or {}).get(sid or '') or {}
    return sp.get('name') or ''


def std_space_photo(ctx: dict, sid: Optional[str]) -> Optional[str]:
    """the photo a 표준 제안서 uses for this space — the space's own vertical's deck (by id in any vertical, else by name).
    A hint for the ranking only: the table was put together by hand and is wrong in places (민원실 → a sports-centre lobby)."""
    info = space_info(ctx, sid)
    return norm_src(info['ph']) if info.get('ph') else None


def scene_candidates(slot: dict, ctx: dict, used: Set[str], k: int = 6, relax: bool = False, shape: bool = True) -> List[dict]:
    """``shape``: among the photos that pass the rules, leave out the ones a 'cover' frame would cut down to a strip (``SHAPE_MIN``) —
    unless no photo of a fitting shape is left or the strip shows the subject clearly better (``SHAPE_EDGE``)."""
    lib = load()
    IM = lib['images']
    keys, pos, bm = _scene_index()
    ind = ctx.get('ind')
    vids = slot_verticals(slot, ctx)
    vid = vids[0] if vids else ctx.get('vertical')
    V = (lib.get('verticals') or {}).get(vid or '') or {}
    sp = space_info(ctx, slot['bind'].get('space')) if slot['kind'] == 'space' and slot['bind'].get('space') else None
    sname = (sp or {}).get('name') or ''
    prod = lib.get('products_all', {}).get(slot['bind'].get('product') or '') or {}
    q = tokens(' '.join([sname, sname, slot['near'], slot['title'], prod.get('cat') or '', slot.get('message') or '', slot['hint'] if not sname else '']))
    std = pic(std_space_photo(ctx, slot['bind'].get('space'))) if sp and std_space_photo(ctx, slot['bind'].get('space')) else None
    picked_fam = {f for f in (product_family(p) for p in ctx.get('products') or []) if f}
    pool = []
    for src in keys:
        if taken(src, used) and src != slot.get('osrc'):
            continue
        if rule_reject(src, slot, ctx, relax):
            continue
        it = IM[src]
        if sp:
            # the customer's own space: a photo of this industry that shows this space or this kind of space, or at least the customer's
            # kind of place — or another industry's generic place showing this kind of space (``stand_in``); never a photo of nothing
            # in particular (a bridge, a person outdoors) because it happens to be filed under the industry
            # a photo of this industry (or the vertical's own photo of this space) that names the space or its kind — the vertical's own
            # photo needs no words for it (it passed every rule above); a photo of the customer's kind of place that shows nothing of
            # this room (a café ceiling for a 베이킹 주방, a phone in an airport for a 관제센터) is not a photo of it
            own = bool(std and pic(src) == std)
            if (it.get('vf') or {}).get('place') == '건물 외관·옥외' and sp.get('profile') not in OUTDOOR_PROFILES:
                continue  # a room is not shown by a photo of the building from outside
            own_ind = own or not ind or ind in (it.get('place') or []) or ind in (it.get('ind_primary') or [])
            if own_ind and space_fit(src, sp)[0] == 0:
                continue
            if not own_ind and not stand_in(src, sp, ctx):
                continue
        if (not relax and src != slot.get('osrc') and slot.get('w') and slot['w'] >= 480 and it.get('w') and it.get('h')
                and max(slot['w'] / it['w'], (slot.get('h') or 0) / it['h']) > 3.0):
            continue  # a thumbnail blown up three times over a large slot is a blur whatever it shows (only when nothing else is left)
        shows = set((it.get('vf') or {}).get('products') or []) - {'none'}
        if (not relax and src != slot.get('osrc') and slot['kind'] == 'scene' and picked_fam and shows and not (shows & picked_fam)
                and not (it.get('case') is not None and str(it['case']) in (ctx.get('cases') or []))):
            continue  # a chapter does not open on a kind of product this customer did not select (a smartwatch for a display deck)
        pool.append(src)
    if slot['kind'] == 'scene' and ind and not relax:
        def evident(src: str) -> bool:
            it = IM[src]
            pl = PLACE.get((it.get('vf') or {}).get('place') or '')
            return ind in (it.get('ind_primary') or []) or ind in (it.get('place') or []) or bool(pl and pl[2] and ind in pl[0])
        sure = [src for src in pool if evident(src) or src == slot.get('osrc')]
        if len(sure) >= 3:
            pool = sure  # an abstract chapter (비용 · 실행 계획) still opens with a scene of the customer's business, not a stock picture
    if not pool:
        return []
    weights = ctx.get('image_weights') or {}
    caption_weight, place_weight, subject_weight = (weights.get(key, 1) for key in ('caption', 'place', 'subject'))
    raw = {src: bm.score(q, pos[src]) for src in pool}
    top = max(raw.values()) or 1.0
    out = []
    # what the deck already shows: a second photo of the same subject · the same site reads as the same picture again
    shown = [(_desc_tokens(u), (IM[u].get('cust') or '')) for u in used if u in IM and IM[u].get('cls') in ('scene', 'kv') and u != slot.get('osrc')]
    sel_fam = {f for f in (product_family(p) for p in ctx.get('products') or []) if f}
    for src in pool:
        it = IM[src]
        s = 3.0 * raw[src] / top * caption_weight
        why = ['caption'] if raw[src] > 0 and caption_weight else []
        if slot.get('w') and slot['w'] >= 480 and it.get('w') and it.get('h'):
            up = max(slot['w'] / it['w'], (slot.get('h') or 0) / it['h'])  # how far a 'cover' fit has to enlarge the photo
            if up > 1.5:
                # a full-bleed 간지 enlarges a 720px media photo ×1.8 (soft) and a 620px one ×2.1 or more (a blur): the sharper
                # photo of the same business goes first, and beyond ×2 it takes a clearly better match to win
                s -= min(5.0, (up - 1.5) * 3.5)
                why.append('low_res')
        elif slot.get('w') and slot['w'] >= 300 and it.get('w') and it.get('h') and max(it['w'], it['h']) < 360:
            s -= 1.5  # a thumbnail-sized photo (318×167) in a mid-size frame is soft on the slide · in the export (blind check 2026-11-18)
            why.append('low_res')
        mine = _desc_tokens(src)
        if mine and shown:
            cust = it.get('cust') or ''
            for toks, c_ in shown:
                inter = len(mine & toks)
                if inter and (inter / len(mine | toks) >= 0.5 or (cust and cust == c_ and inter >= 2)):
                    s -= 2.5  # the same room from another angle reads as the same picture again
                    why.append('similar_to_shown')
                    break
        if slot['kind'] == 'scene' and slot.get('part_type') not in ('case', 'why'):
            if it.get('kind') == 'people':
                s -= 1.5  # a chapter opens with the customer's kind of place — not with a portrait (often an interviewee of a case)
                why.append('portrait')
            elif it.get('case') is not None and str(it['case']) not in (ctx.get('cases') or []):
                s -= 0.8 * subject_weight  # a named case site the customer did not link
        seen_fam = set((it.get('vf') or {}).get('products') or []) - {'none'}
        if subject_weight and sel_fam and seen_fam and not (seen_fam & sel_fam) and not (it.get('case') is not None and str(it['case']) in (ctx.get('cases') or [])):
            s -= 2.5 * subject_weight  # the photo is about a kind of product this customer did not select (a phone held up in a stadium)
            why.append('other_product_kind')
        if place_weight and std and pic(src) == std:
            s += 4.0 * place_weight
            why.append('vertical_std_space')
        if place_weight and V.get('std') and V['std'] in (it.get('scen') or []):
            s += 0.4 * place_weight
            why.append('vertical_std_deck')
        if place_weight and vid and vid in vx_tags(src):
            s += 1.0 * place_weight
            why.append('subvertical')
        vf = it.get('vf') or {}
        pl = PLACE.get(vf.get('place') or '')
        if place_weight and pl and vid and vid in pl[1]:
            s += 1.5 * place_weight
            why.append('seen_place')
        elif place_weight and pl and ind and ind in pl[0] and pl[2]:
            s += 0.6 * place_weight
        if vf and not vf.get('brand'):
            s += 0.3  # no sign in the frame
        if place_weight and sp:
            level, _ = space_fit(src, sp)
            if level == 0:
                s -= 1.0 * place_weight  # only the customer's kind of place — any photo that shows this space or its kind goes first
                why.append('space_unshown')
            if level == 2:
                s += 3.0 * place_weight  # the photo is said to show this very space
                why.append('space_named')
            elif level == 1:
                s += 1.5 * place_weight  # …or this kind of space (a reception desk for 민원실)
                why.append('space_kind')
        if ind and ind in (it.get('ind_primary') or []):
            s += 0.8 * place_weight
        if ind and ind in (it.get('place') or []):
            s += 0.6 * place_weight
        fam = slot.get('families') or set()
        if subject_weight and fam and fam & ((set((it.get('vf') or {}).get('products') or []) - {'none'}) or families(it.get('desc') or '')):
            s += 1.2 * subject_weight
            why.append('product_family')
        if subject_weight and it.get('case') is not None and str(it['case']) in (ctx.get('cases') or []) and slot.get('part_type') in ('case', 'why'):
            s += 2.5 * subject_weight  # the case chapter opens with a photo of a case the customer linked
            why.append('linked_case')
        content = s
        vis = visible(src, slot, it)
        cost = shape_cost(src, slot, it)
        if cost:
            s -= cost  # the frame cuts more than a slight trim off the photo: a better-shaped photo of the same subject goes first
            why.append('shape')
        if src == slot.get('osrc'):
            s += 0.6
            why.append('template_original')
        if GENERIC_CAPTION.search(it.get('desc') or ''):
            s -= 1.5  # '… 간지 사진' · '호텔/리조트 사진': a slot label, not a description of what is shown
        if '흑백' in (it.get('desc') or '') and '흑백' not in (slot.get('hint') or '') and '지금' not in (slot.get('hint') or ''):
            s -= 3.0  # a photo greyed out to stand for 'before' (도입 전 · 지금) — not a chapter opener
            why.append('before_scene')
        out.append((s, src, why, content, vis))
    if shape and not relax:
        # a photo the frame cuts down to a strip (a landscape room in a tall frame, a square photo in a banner) stays only when it shows
        # the frame's subject clearly better than every photo of a fitting shape (SHAPE_EDGE) — measured 2026-11-18: dropping every strip
        # (or charging the shape harder) traded the engineer at the ceiling unit of a 기계실 frame for front-desk staff, and judges
        # preferred the right subject cut down to the wrong subject well framed
        fit_best = max((c for _, src, _, c, v in out if v is None or v >= SHAPE_MIN or src == slot.get('osrc')), default=None)
        if fit_best is not None:
            out = [row for row in out if row[4] is None or row[4] >= SHAPE_MIN or row[1] == slot.get('osrc') or row[3] > fit_best + SHAPE_EDGE]
    out.sort(key=lambda t: -t[0])
    seen: Set[str] = set()
    best = []
    for s, src, why, _, _ in out:  # one entry per picture — its other addresses are the same photo
        if pic(src) in seen:
            continue
        seen.add(pic(src))
        best.append({'src': src, 'score': round(s, 3), 'why': why})
        if len(best) >= k:
            break
    return best


def candidates(slot: dict, ctx: dict, used: Set[str], k: int = 6) -> List[dict]:
    """the strict candidates, else the relaxed ones — except for a space slot: a photo that does not show the space under the strict
    rules does not show it under looser ones either (the relaxed pool brought golf ranges to a 민원실). A space slot only lets go of
    the product family of its sheet (the room itself, with another device in view, before an empty frame)."""
    if slot.get('kind') == 'space':
        return scene_candidates(slot, ctx, used, k) or (scene_candidates({**slot, 'families': set()}, ctx, used, k) if slot.get('families') else [])
    return scene_candidates(slot, ctx, used, k) or scene_candidates(slot, ctx, used, k, relax=True)


PICK_LOCK = threading.Lock()


def _area(slot: dict) -> float:
    return float(slot.get('w') or 0) * float(slot.get('h') or 0)


def too_small(src: str, slot: dict, limit: float = 2.0) -> bool:
    """the photo would be enlarged more than ``limit`` times to cover a large slot (a 300px photo on a full-bleed 간지 is a blur)."""
    it = load()['images'].get(src) or {}
    if not (slot.get('w') and slot['w'] >= 480 and it.get('w') and it.get('h')):
        return False
    return max(slot['w'] / it['w'], (slot.get('h') or 0) / it['h']) > limit


_DESC_TOK: Dict[str, frozenset] = {}
_DESC_STOP = {'있는', '설치된', '모습', '장면', '사진', '화면', '공간', '내부', '전경', '삼성'}


def _desc_tokens(src: str) -> frozenset:
    """content words of a photo's description (cached) — two photos sharing most of them show the same subject."""
    if src not in _DESC_TOK:
        it = load()['images'].get(src) or {}
        _DESC_TOK[src] = frozenset(w for w in tokens(it.get('desc') or '') if len(w) >= 2 and w not in _DESC_STOP)
    return _DESC_TOK[src]


def caption(src: str) -> str:
    it = load()['images'].get(src) or {}
    cap = clean_caption(it.get('desc') or (it.get('names') or [''])[0])
    vf = it.get('vf') or {}
    if vf.get('shows'):  # what was actually seen in the photo, next to the caption it came with
        cap = f"{cap} — 실제 사진: {vf['shows']} ({vf.get('place') or ''})"
    return cap


def _cand_line(src: str) -> str:
    it = load()['images'].get(src) or {}
    tags = []
    if it.get('ind_primary'):
        tags.append('업종 ' + ','.join(it['ind_primary']))
    if it.get('spaces'):
        tags.append('공간 ' + ','.join(it['spaces'][:3]))
    fam = families(it.get('desc') or '')
    if fam:
        tags.append('보이는 제품군 ' + ','.join(sorted(fam)))
    return f"    {src} :: {caption(src)[:110]} [{' · '.join(tags)}]"


def _img_value(src: str, fit: str, name: str = '') -> dict:
    it = load()['images'].get(src) or {}
    v = {'src': src, 'name': name or it.get('desc') or (it.get('names') or [''])[0], 'fit': fit or ('contain' if it.get('cls') == 'product' else 'cover'), 'keep': True}
    if it.get('products') and it.get('cls') == 'product':
        v['products'] = it['products'][:3]
    return v


# ------------------------------------------------------------------------------------------------ part
def fill_part_images(ctx: dict, part: dict, slides: List[dict], llm, used: Registry, *, verify: bool = True, k: int = 6, pick: str = 'rank') -> None:
    """choose the pictures of one part. ``slides`` carry the final texts (``t``), the template pictures (``ex_img``) and the
    slide binding (``bind``). Writes ``img`` and ``img_meta`` (the audit trail) into each slide.

    Every picture that stays on a sheet holds its identity in ``used`` (the deck registry — a ``PictureRegistry`` in a deck run):
    a slot whose picture the deck already shows gets another picture, or none — never the same photo twice (product cuts excepted).
    Space slots choose before the other slots of the part and start from the photo the deck reserved for their space."""
    lib = load()
    IM = lib['images']
    open_slots = []  # (slide index, slot) the ranking (and the model) has to judge
    excluded = ctx.get('off_pictures', ())

    def hold(src) -> bool:
        """the slot keeps ``src``: a picture that may repeat (a product cut, an icon), or one the deck had not shown yet (now held)."""
        return norm_src(src) not in excluded and (not counts_once(src) or used.claim(norm_src(src)))

    def hide(img: dict, meta: dict, key: str, base: dict, flag: str, note: str, orig=None) -> None:
        name = (orig or {}).get('name') or '' if isinstance(orig, dict) else ''
        img[key] = {'hidden': True, 'name': name}
        meta[key] = {**base, 'why': 'hidden', 'flag': flag, 'note': note}

    for s, sl in enumerate(slides):
        img = sl.setdefault('img', {})
        meta = sl.setdefault('img_meta', {})
        for key, v in (sl.get('ex_img') or {}).items():
            img.setdefault(key, v)  # the template's pictures are the starting point of every slot
        if sl.get('keep') or not lib['layouts'].get(sl['f']):
            # a kept page's pictures were held for the deck before the parts started (composer.auto.run_auto); one that another page
            # already held (``repeat_keys``) is replaced: a photo slot looks for another photo, anything else is left empty
            typed = {x['key']: x for x in type_slots(sl, part, ctx)} if sl.get('repeat_keys') else {}
            for key in sl.get('repeat_keys') or []:
                slot = typed.get(key)
                if slot and (IM.get(slot['osrc']) or {}).get('cls') in ('scene', 'kv'):
                    slot['kind'], slot['repeat'], slot['message'] = 'scene', True, part.get('message') or ''
                    open_slots.append((s, slot))
                else:
                    hide(img, meta, key, {'kind': 'keep'}, 'repeat', 'the template picture is already shown elsewhere in the deck', img.get(key))
            continue
        if sl.get('fixed'):  # a fixed page (Why Samsung · 도입사례 sheet) shows the pictures it was authored with (held deck-wide first)
            for key in img:
                meta[key] = {'kind': 'keep', 'why': 'template_original(fixed page)'}
            for key in sl.get('repeat_keys') or []:  # …but not a picture the deck shows already: one picture once per deck holds here too
                hide(img, meta, key, {'kind': 'keep'}, 'repeat', 'the authored page repeats a picture the deck already shows', img.get(key))
            continue
        if sl.get('resized'):
            have = {str(im['i']) for im in lib['layouts'][sl['f']]['images']}
            for key in [k for k in img if k.isdigit() and k not in have]:
                img.pop(key)
        for slot in type_slots(sl, part, ctx):
            if '_picture_trace' in sl:
                sl['_picture_trace'].append(slot)
            key, kind, osrc = slot['key'], slot['kind'], slot['osrc']
            slot['message'] = part.get('message') or ''
            fit = (slot['orig'] or {}).get('fit') if isinstance(slot['orig'], dict) else ''
            fit = fit or slot['fit'] or ('contain' if kind == 'product' else 'cover')
            if kind == 'icon' and slot.get('icon'):
                if slot['icon'] != osrc:
                    img[key] = {'src': slot['icon'], 'fit': 'contain', 'keep': True}
                    meta[key] = {'kind': 'icon', 'why': 'neutral_icon(unlinked solution)' if slot['icon'] == BLANK_ICON else 'solution_icon'}
                else:
                    meta[key] = {'kind': 'icon', 'why': 'solution_icon'}
                continue
            if kind in ('icon', 'keep'):
                if slot['orig']:
                    # (a 목차 slide's pictures were held for the deck at the start, like a kept page's — ``repeat_keys`` lists the ones
                    #  another page held first)
                    if kind == 'keep' and osrc and (key in (sl.get('repeat_keys') or []) or (sl.get('kind') != 'toc' and not hold(osrc))):
                        # the template's picture is already on another sheet of this deck: a photo slot looks for another one
                        if (IM.get(osrc) or {}).get('cls') in ('scene', 'kv'):
                            slot['kind'], slot['repeat'] = 'scene', True
                            open_slots.append((s, slot))
                        else:
                            hide(img, meta, key, {'kind': 'keep'}, 'repeat', 'the template picture is already shown elsewhere in the deck', slot['orig'])
                        continue
                    meta[key] = {'kind': kind, 'why': 'template_original', **({'note': slot['note']} if slot.get('note') else {})}
                continue
            if kind == 'plan':
                bird = ctx.get('birdseye')
                if bird:
                    img[key] = {'src': bird, 'name': f"{ctx.get('customer') or ''} 공간 조감도".strip(), 'fit': 'contain', 'keep': True}
                    meta[key] = {'kind': 'plan', 'why': 'customer_birdseye'}
                elif ctx.get('spaces_given') and (sl.get('bind') or {}).get('spaces'):
                    # the customer's own space plan: the template drawing shows the industry's standard rooms, not these — the frame waits
                    # for the 조감도 the app renders from the same plan (services/space-plan.js mapBirdseyeLayouts), never the wrong rooms
                    img[key] = {'hidden': True, 'name': '공간 조감도'}
                    meta[key] = {'kind': 'plan', 'why': 'hidden', 'flag': 'birdseye', 'note': 'the customer birdseye is rendered by the app from the space plan'}
                elif osrc and not hold(osrc):
                    hide(img, meta, key, {'kind': 'plan'}, 'repeat', 'the template drawing is already shown elsewhere in the deck', slot['orig'])
                else:
                    meta[key] = {'kind': 'plan', 'why': 'template_original', 'note': 'no birdseye image given'}
                continue
            if kind == 'product':
                pid = slot['bind'].get('product')
                if not pid:
                    # the text next to the slot names no linked product: the template's cut stays only when it is not somebody else's product
                    other = (IM.get(osrc) or {}).get('cls') == 'product' and not any(is_cut_of(slot['orig'], q) for q in ctx.get('products') or [])
                    if other and osrc:
                        # somebody else's product in a frame no text re-pointed: a selected product of this part stands there instead
                        # (one the slide does not show yet first), a selected solution's picture when no product is selected — an
                        # empty frame only when this customer selected nothing that has a picture
                        shown = {norm_src(v) for k2, v in img.items() if k2 != key and isinstance(v, dict) and v.get('src')}
                        # (a frame whose own name cell names something else is not re-pointed here — the selected-only guard decides it)
                        pool = [] if slot.get('extra') or slot.get('paired') else list(dict.fromkeys(list((sl.get('bind') or {}).get('products') or []) + list(ctx.get('products') or [])))
                        cuts = [(p_, product_cut(p_, excluded=excluded)) for p_ in pool]
                        cuts = [(p_, c_) for p_, c_ in cuts if c_]
                        hit = next(((p_, c_) for p_, c_ in cuts if c_ not in shown), None) or (cuts[0] if cuts else None)
                        if hit:
                            img[key] = {**_img_value(hit[1], 'contain', (lib['products_all'].get(hit[0]) or {}).get('name') or ''), 'pid': hit[0], 'products': [hit[0]]}
                            meta[key] = {'kind': 'product', 'product': hit[0], 'bound_by': 'selected', 'why': 'product_exact',
                                         'note': 'no text names a product here — a selected product stands in the frame'}
                            continue
                        sol_pic = None if slot.get('extra') or slot.get('paired') or ctx.get('products') else next(
                            (x for sid_ in ctx.get('solutions') or [] for x in solution_media(sid_, 'cut', used.snapshot())
                             if x not in shown and not taken(x, used.snapshot()) and hold(x)), None)
                        if sol_pic:
                            sid_ = next(s_ for s_ in ctx['solutions'] if sol_pic in solution_media(s_, 'cut', set()))
                            img[key] = _img_value(sol_pic, 'contain')
                            meta[key] = {'kind': 'solution', 'solution': sid_, 'why': 'solution_media', 'note': 'no text names an item here — a selected solution stands in the frame'}
                            continue
                        hide(img, meta, key, {'kind': 'product'}, 'unbound_product',
                             'the text next to the slot names no linked product and the template cut is a product this customer did not link', slot['orig'])
                    elif osrc and not hold(osrc):  # (a scene the template put in a product frame — held like any other picture)
                        hide(img, meta, key, {'kind': 'product'}, 'repeat', 'the template picture is already shown elsewhere in the deck', slot['orig'])
                    else:
                        meta[key] = {'kind': 'product', 'why': 'template_original', 'note': 'the text next to the slot names no linked product', 'flag': 'unbound_product'}
                    continue
                src = product_cut(pid, slot['orig'], excluded)
                if src:
                    img[key] = slot['orig'] if src == osrc and slot['orig'] else {**_img_value(src, 'contain', (lib['products_all'].get(pid) or {}).get('name') or ''), 'pid': pid, 'products': [pid]}
                    meta[key] = {'kind': 'product', 'product': pid, 'bound_by': slot['bind'].get('by'), 'why': 'product_exact'}
                else:  # the product has no picture of its own: an empty slot beats another product's cut
                    img[key] = {'hidden': True, 'name': (lib['products_all'].get(pid) or {}).get('name') or ''}
                    meta[key] = {'kind': 'product', 'product': pid, 'why': 'hidden', 'note': 'the product has no picture', 'flag': 'no_product_image'}
                continue
            if kind == 'solution':
                sid = slot['bind'].get('solution')
                same = osrc and sid in ((IM.get(osrc) or {}).get('solutions') or [])
                if (same or (sl.get('bind_same') and osrc)) and hold(osrc):
                    meta[key] = {'kind': 'solution', 'solution': sid, 'why': 'template_original' if not same else 'solution_media(template)'}
                    continue
                want = slot.get('want') or ('cut' if slot['fit'] == 'contain' else 'scene')
                mine = {norm_src(v) for k2, v in img.items() if k2 != key}
                snap = used.snapshot()
                pool = [x for x in solution_media(sid, want, snap) if x not in mine and not taken(x, snap)]
                pool = [x for x in pool if IM[x]['cls'] not in ('scene',) or not rule_reject(x, {**slot, 'kind': 'scene'}, ctx, relax=True)]
                order_ = {'screen': 0, 'kv': 1, 'diagram': 2, 'scene': 3, 'product': 4} if want != 'scene' else {'scene': 0, 'kv': 1, 'screen': 2, 'diagram': 3, 'product': 4}
                # (a frame filled edge to edge: a picture its shape would cut down to a strip gives way to the next kind of picture)
                pool.sort(key=lambda x: order_.get(IM[x]['cls'], 9) + (0.0 if fit == 'contain' else min(2.0, shape_cost(x, {**slot, 'fit': fit}) / 2)))
                got = next((x for x in pool if hold(x)), None)
                if got:
                    img[key] = _img_value(got, fit)
                    meta[key] = {'kind': 'solution', 'solution': sid, 'why': 'solution_media', 'cands': len(pool)}
                elif osrc and osrc not in excluded and not counts_once(osrc):
                    meta[key] = {'kind': 'solution', 'solution': sid, 'why': 'template_original', 'note': 'no unused media of this solution', 'flag': 'no_solution_media'}
                else:
                    hide(img, meta, key, {'kind': 'solution', 'solution': sid}, 'no_solution_media', 'every picture of this solution is already shown in the deck', slot['orig'])
                continue
            if kind == 'case':
                cid = slot['bind'].get('case')
                if sl.get('bind_same') and osrc and hold(osrc):
                    meta[key] = {'kind': 'case', 'case': cid, 'why': 'case_photos(template)'}
                    continue
                if not cid:
                    if osrc and not hold(osrc):
                        hide(img, meta, key, {'kind': 'case'}, 'repeat', 'the template picture is already shown elsewhere in the deck', slot['orig'])
                    else:
                        meta[key] = {'kind': 'case', 'why': 'template_original'}
                    continue
                mine = {norm_src(v) for k2, v in img.items() if k2 != key and meta.get(k2, {}).get('why') == 'case_photos'}
                pool = by_shape([x for x in case_photos(cid) if x not in mine], {**slot, 'fit': fit})  # the case's photos that fit the frame first
                got = next((x for x in pool if hold(x)), None)
                if got:
                    img[key] = _img_value(got, fit)
                    meta[key] = {'kind': 'case', 'case': cid, 'why': 'case_photos', 'cands': len(pool)}
                else:
                    img.pop(key, None)
                    meta[key] = {'kind': 'case', 'case': cid, 'why': 'empty', 'note': 'the case has no more unused photos', 'flag': 'empty'}
                continue
            # space · scene — the template's own picture when the slide is still about the same thing and it passes the rules
            # (a space slot first takes the photo the deck reserved for its space — the choice below)
            keep_ok = osrc and not rule_reject(osrc, slot, ctx)
            reserved = (sl.get('img_reserved') or {}).get(key) if kind == 'space' else None
            if not reserved and keep_ok and sl.get('bind_same') and not sl.get('foreign') and osrc in IM and not too_small(osrc, slot) and used.claim(osrc):
                meta[key] = {'kind': kind, 'why': 'template_original(same context)', **({'space': slot['bind']['space']} if slot['bind'].get('space') else {})}
                continue
            open_slots.append((s, slot))
    for sl in slides:
        if sl['f'] == 'L_VS_CASE' and (sl.get('bind') or {}).get('case') and not sl.get('keep') and not sl.get('fixed'):
            _match_case_photos(sl, used, excluded)
    if not open_slots:
        part_unique(ctx, part, slides, used)
        return
    for s, slot in open_slots:
        snap = used.snapshot()
        slot['cands'] = candidates(slot, ctx, snap, k)
        slot['relaxed'] = bool(slot['cands']) and not scene_candidates(slot, ctx, snap, 1, shape=False)
    none: Set[str] = set()
    choice: Dict[str, str] = {}
    held: Dict[str, str] = {}  # slot → the reserved photo it was given (already held for the deck)
    for s, slot in open_slots:
        res = (slides[s].get('img_reserved') or {}).get(slot['key']) if slot['kind'] == 'space' else None
        if not res:
            continue
        if rule_reject(res, {**slot, 'families': set()}, ctx):  # the final wording points the slot elsewhere: the reservation goes back
            used.release(res)
            slides[s]['img_reserved'].pop(slot['key'], None)
            continue
        choice[f"{s}:{slot['key']}"] = held[f"{s}:{slot['key']}"] = res
    if pick == 'llm' and llm is not None:
        rest = [(s, slot) for s, slot in open_slots if f"{s}:{slot['key']}" not in choice]
        choice.update(_pick(ctx, part, slides, rest, llm, none))
        for sk, src in list(choice.items()):
            if sk not in held and not used.claim(src):
                choice.pop(sk)  # another part took it meanwhile — the ranking below finds the next one
    else:
        # the ranking chooses (strongest match first, no photo twice); the model only *checks* the choice below — measured:
        # a limited model picking among six shuffled good first candidates more often than it improved them
        # one part chooses at a time, one slot after another, each looking at everything the deck has claimed so far: parts run
        # side by side, and two of them (or two slots of one) ranking against the same snapshot took the same room twice.
        # Space slots first — a space has few photos that show it; a chapter opener can take almost any scene of the business.
        # Among them the larger frame first: when a sheet has more frames than its spaces have photos (공간 맵 · 공간 사진 7), the small
        # frames are the ones left empty, not the sheet's main photo.
        with PICK_LOCK:
            for s, slot in sorted(open_slots, key=lambda t: (t[1]['kind'] != 'space', -(_area(t[1]) if t[1]['kind'] == 'space' else 0),
                                                             -(t[1]['cands'][0]['score'] if t[1]['cands'] else 0))):
                sk = f"{s}:{slot['key']}"
                if sk in choice:
                    continue
                snap = used.snapshot()
                cands = candidates(slot, ctx, snap, k)
                if cands:
                    slot['cands'] = cands
                for c in slot['cands']:
                    if used.claim(c['src']):
                        choice[sk] = c['src']
                        break
    mode = pick
    verdicts: Dict[str, dict] = {}
    if verify and llm is not None and choice:
        verdicts = _verify(ctx, part, slides, open_slots, choice, llm)
    for s, slot in open_slots:
        sl = slides[s]
        img, meta = sl['img'], sl['img_meta']
        sk = f"{s}:{slot['key']}"
        fit = (slot['orig'] or {}).get('fit') if isinstance(slot['orig'], dict) else ''
        fit = fit or slot['fit'] or 'cover'
        pick = choice.get(sk)
        base = {'kind': slot['kind'], 'cands': len(slot['cands']), **({'space': slot['bind']['space']} if slot['bind'].get('space') else {}),
                **({'product': slot['bind']['product']} if slot['bind'].get('product') else {}), **({'relaxed': True} if slot.get('relaxed') else {}),
                **({'repeat_of_template': slot['osrc']} if slot.get('repeat') else {})}
        first_why = 'space_reserved' if sk in held else ('llm_pick' if mode == 'llm' else 'rank_top')
        order: List[tuple] = []
        v = verdicts.get(sk) or {}
        if pick and v.get('verdict') == 'mismatch':
            # the verifier says the picture does not show what the slot is about: it is not used, whatever else is left
            used.release(pick)
            pick = None
            if v.get('better') and v['better'] != 'original' and pic(v['better']) != pic(choice.get(sk)):
                order.append((v['better'], 'verify_repick'))
            rejected = choice.get(sk)
            # the template's picture (unless it is the rejected one): when the verifier itself prefers it, or when it passes the strict rules
            if (slot['osrc'] and pic(slot['osrc']) != pic(rejected) and not slot.get('repeat')
                    and not rule_reject(slot['osrc'], slot, ctx, relax=v.get('better') == 'original')):
                order.append((slot['osrc'], 'template_original(pick rejected)'))
            order += [(c['src'], 'rank(after reject)') for c in slot['cands'] if pic(c['src']) != pic(rejected)]
            base['rejected'] = {'src': rejected, 'reason': v.get('reason') or ''}
        else:
            if pick:
                order.append((pick, first_why))
            elif sk in none and slot['osrc'] and not slot.get('repeat') and not rule_reject(slot['osrc'], slot, ctx, relax=True):
                order.append((slot['osrc'], 'template_original(model: no candidate fits)'))
            order += [(c['src'], 'rank') for c in slot['cands'] if c['src'] != pick]
        done = False
        for src, why in order:
            if src == pick or used.claim(src):
                img[slot['key']] = slot['orig'] if src == slot['osrc'] and slot['orig'] else _img_value(src, fit)
                meta[slot['key']] = {**base, 'why': why, **({'verified': v.get('verdict')} if v else {})}
                done = True
                break
        if done:
            continue
        # nothing unused fits: the template's picture when the relaxed rules allow it and the deck does not show it yet, else no picture —
        # an empty frame (flagged for the reviewer) rather than a photo of something else or the same photo twice
        osrc = slot['osrc']
        if osrc and slot['kind'] != 'space' and not slot.get('repeat') and not rule_reject(osrc, slot, ctx, relax=True) and used.claim(osrc):
            meta[slot['key']] = {**base, 'why': 'template_original(no better picture)'}
        elif slot['kind'] == 'space':
            # (the template's own photo of its space was one of the strict candidates when it shows this space)
            name = space_info(ctx, slot['bind'].get('space'))['name']
            hide(img, meta, slot['key'], base, 'no_space_photo', f'no unused photo shows the space {name}', slot['orig'])
            part.setdefault('warnings', []).append(f'{name}: 이 공간을 보여 주는 사진이 사진 자료에 없어 공간 사진 칸을 비워 두었어요 — 공간 사진을 넣어 주세요.')
        else:
            hide(img, meta, slot['key'], base, 'no_fitting_picture',
                 'no unused picture fits this slot' + (f' (template picture: {rule_reject(osrc, slot, ctx, relax=True) or "already shown"})' if osrc else ''),
                 slot['orig'])
    part_unique(ctx, part, slides, used)


# ------------------------------------------------------------------------------------------------ 가치 제안(VP): one picture once per part
# 사용자 지시 2026-11-17 (제안서 pn63a3to — 가치 제안 장의 칸마다 같은 QM55C 컷): 가치 제안 파트 안에서는 같은 사진을 두 번 쓰지 않는다 —
# 제품 컷 · 솔루션 사진도 예외가 아니다(다른 파트에서는 제품 컷을 다시 쓸 수 있다). 같은 제품을 다시 보여 줄 때는 한 번은 제품 컷,
# 그다음은 그 제품이 들어간 다른 사진(설치 · 연출 장면). 솔루션 칸은 그 솔루션의 사진(type_slots 가 옆 글로 정한다)이고 한 장 · 한 파트에 한 번.
VP_SHEET = re.compile(r'^L_(VS_NEEDS|VS_CORE_\d+|TOC_VP3)$')


def strict_part(part: dict, slides: List[dict]) -> bool:
    """a part that shows every picture once — 가치 제안(VP): its 목차 key, or its value-prop sheets."""
    return (part.get('toc') or '') in ('needs', 'vp') or any(VP_SHEET.match(sl.get('f') or '') for sl in slides)


def product_scenes(pid: str) -> List[str]:
    """photos that show the product in place (not its cut) — photos tagged with the product first come first."""
    if 'scn' not in _PIDX:
        out: Dict[str, List[tuple]] = {}
        for src, it in load()['images'].items():
            if it.get('cls') == 'scene':
                for n, p in enumerate(it.get('products') or []):
                    out.setdefault(p, []).append((n, src))
        _PIDX['scn'] = {p: [s for _, s in sorted(v)] for p, v in out.items()}
    return _PIDX['scn'].get(pid, [])


def part_unique(ctx: dict, part: dict, slides: List[dict], used: Registry) -> None:
    """in a strict part (``strict_part``) a picture the part already shows — or a second cut of a product it already shows as a cut —
    is replaced by another picture of the same subject (another cut while the product has no cut in the part yet, else a photo of
    the product in place · another picture of the solution), or the frame is left empty. Runs after the part's pictures are chosen."""
    if not strict_part(part, slides):
        return
    IM = load()['images']
    seen: Set[str] = set()       # picture identities the part shows so far
    excluded = ctx.get('off_pictures', ())
    cut_shown: Set[str] = set()  # products the part already shows as a cut

    def is_cut(src: str) -> bool:
        return (IM.get(src) or {}).get('cls') == 'product'

    for sl in slides:
        img = sl.get('img') or {}
        meta = sl.setdefault('img_meta', {})
        typed = None
        for key in sorted(img, key=lambda k: (0, int(k)) if str(k).isdigit() else (1, str(k))):
            v = img[key]
            if not isinstance(v, dict) or v.get('hidden') or not v.get('src'):
                continue
            src = norm_src(v)
            m = meta.get(key) or {}
            if src.startswith('data:') or ICON_SRC.search(src) or m.get('kind') in ('icon', 'plan'):
                continue
            pid = m.get('product') if m.get('kind') == 'product' else None
            if not pid and is_cut(src):
                pid = next(iter(v.get('products') or (IM.get(src) or {}).get('products') or []), None)
            cut = is_cut(src)
            if pic(src) not in seen and not (pid and cut and pid in cut_shown):
                seen.add(pic(src))
                if pid and cut:
                    cut_shown.add(pid)
                continue
            if typed is None:
                typed = {x['key']: x for x in type_slots(sl, part, ctx)}
            slot = typed.get(key) or {'key': key, 'near': '', 'title': '', 'hint': '', 'part_type': part.get('type') or '', 'bind': {}, 'families': set()}
            snap = used.snapshot()
            alt = None
            if pid:
                if pid not in cut_shown:
                    alt = next((c for c in own_cuts(pid) + _by_product().get(pid, []) if c not in excluded and pic(c) not in seen), None)
                if not alt:
                    scene = {**slot, 'kind': 'scene', 'bind': {}, 'families': {product_family(pid)} - {None}}
                    alt = next((x for x in by_shape(product_scenes(pid), {**slot, 'fit': v.get('fit') or 'cover'}) if pic(x) not in seen and not taken(x, snap)
                                and not rule_reject(x, scene, ctx, relax=True) and used.claim(x)), None)
            elif m.get('kind') == 'solution' and m.get('solution'):
                alt = next((x for x in solution_media(m['solution'], slot.get('want') or 'cut', snap)
                            if x not in excluded and pic(x) not in seen and not taken(x, snap) and used.claim(x)), None)
            if alt:
                name = (load().get('products_all', {}).get(pid) or {}).get('name') or '' if pid else ''
                img[key] = {**_img_value(alt, 'contain' if is_cut(alt) else (v.get('fit') if m.get('kind') == 'solution' else 'cover') or 'cover', name),
                            **({'pid': pid, 'products': [pid]} if pid else {})}
                meta[key] = {**m, 'why': 'part_unique', 'note': 'the 가치 제안 part shows each picture once — another picture of the same subject'}
                seen.add(pic(alt))
                if pid and is_cut(alt):
                    cut_shown.add(pid)
            else:
                img[key] = {'hidden': True, 'name': v.get('name') or ''}
                meta[key] = {**m, 'why': 'hidden', 'flag': 'part_repeat', 'note': 'the 가치 제안 part already shows this picture and no other picture of the subject is left'}


def _match_case_photos(sl: dict, used: Registry, excluded=()) -> None:
    """L_VS_CASE: the three numbered photos sit under the three numbered 도입 포인트 — give each point the case photo that shows it
    (among the case photos the deck does not show elsewhere; the three the slot loop held are handed back first)."""
    IM = load()['images']
    cid = str(sl['bind']['case'])
    img, meta = sl.setdefault('img', {}), sl.setdefault('img_meta', {})
    t = sl.get('t') or {}
    first = norm_src(img.get('0')) if img.get('0') else ''
    mine = [norm_src(img.get(str(k + 1))) for k in range(3) if isinstance(img.get(str(k + 1)), dict) and img[str(k + 1)].get('src')]
    snap = used.snapshot() - {pic(x) for x in mine}
    pool = [x for x in case_photos(cid) if x not in excluded and x != first and not taken(x, snap)]
    if len(pool) < 3:
        return
    frames = {str(im['i']): im for im in (load()['layouts'].get(sl['f']) or {}).get('images') or []}

    def score(src: str, k: int) -> float:
        it = IM[src]
        text = ' '.join(plain(t.get(str(i))) for i in (4 + 2 * k, 5 + 2 * k))
        cap = ' '.join([it.get('desc') or '', (it.get('vf') or {}).get('shows') or ''])
        a, b = set(tokens(text)), set(tokens(cap))
        sc = len(a & b) / max(1, len(a)) if a and b else 0.0
        fam = families(text)
        vp = set((it.get('vf') or {}).get('products') or []) - {'none'}
        # (a photo its frame would cut down to a strip goes to a frame of its own shape, when the words do not tell them apart)
        return (sc + (0.3 if fam and vp and fam & vp else 0.0) - (0.2 if fam and vp and not fam & vp else 0.0)
                - 0.05 * shape_cost(src, frames.get(str(k + 1)) or {}))
    pairs = sorted(((score(src, k), src, k) for src in pool for k in range(3)), reverse=True)
    if pairs[0][0] <= 0.05:
        return  # nothing tells the photos apart — the given order stays
    got: Dict[int, str] = {}
    for sc, src, k in pairs:
        if k not in got and src not in got.values():
            got[k] = src
    for x in mine:
        used.release(x)
    for k in range(3):
        if k in got and used.claim(got[k]):
            continue
        got.pop(k, None)  # (another part took it meanwhile) the point keeps the photo it had — held again
        cur = norm_src(img.get(str(k + 1))) if isinstance(img.get(str(k + 1)), dict) else ''
        if cur:
            used.claim(cur)
    for k, src in got.items():
        key = str(k + 1)
        cur = img.get(key)
        fit = (cur or {}).get('fit') if isinstance(cur, dict) else 'cover'
        if norm_src(cur) != src:
            img[key] = _img_value(src, fit or 'cover')
        meta[key] = {'kind': 'case', 'case': cid, 'why': 'case_photo_for_point', 'point': k + 1}


# ------------------------------------------------------------------------------------------------ deck
def reserve_space_photos(ctx: dict, parts: List[dict], slides_by: Dict[str, List[dict]], used: Registry, k: int = 8) -> int:
    """before the parts are composed side by side: every space slot of the deck reserves a photo of its space, the most constrained
    space first (the one with the fewest photos that show it). Without this a chapter opener ranked a moment earlier in another
    part takes the one photo a space has, and the space sheet is left with a photo of some other room.
    Writes ``slide['img_reserved'][slot key]`` and holds the photo in ``used``; returns how many slots got one."""
    lib = load()
    rows = []
    for p in parts:
        for sl in slides_by.get(p['id']) or []:
            if sl.get('keep') or sl.get('fixed') or not lib['layouts'].get(sl['f']):
                continue
            for slot in type_slots(sl, p, ctx):
                if slot['kind'] != 'space' or not slot['bind'].get('space'):
                    continue
                sp = space_info(ctx, slot['bind']['space'])
                prod = (lib.get('products_all') or {}).get(slot['bind'].get('product') or '') or {}
                # the wording is not written yet — the space and its product are what the photo has to show
                rows.append((sl, {**slot, 'near': ' '.join(x for x in (sp['name'], prod.get('name') or '') if x), 'title': '',
                                  'message': p.get('message') or ''}))
    if not rows:
        return 0
    snap = used.snapshot()
    ranked = [(sl, slot, candidates(slot, ctx, snap, k)) for sl, slot in rows]
    ranked.sort(key=lambda r: (len(r[2]), -(r[2][0]['score'] if r[2] else 0)))
    n = 0
    for sl, slot, _ in ranked:
        for c in candidates(slot, ctx, used.snapshot(), k):
            if used.claim(c['src']):
                sl.setdefault('img_reserved', {})[slot['key']] = c['src']
                n += 1
                break
    return n


def deck_repeats(uses: List[tuple]) -> List[tuple]:
    """``uses`` = [(where, src), …] in deck order → the uses of a picture identity after its first one (product cuts, icons and
    the customer's drawings may repeat)."""
    seen: Set[str] = set()
    out = []
    for where, src in uses:
        if not counts_once(src):
            continue
        ident = pic(src)
        if ident in seen:
            out.append((where, src))
        seen.add(ident)
    return out


def _slot_row(ctx: dict, part: dict, s: int, slot: dict) -> str:
    lib = load()
    want = []
    if slot['kind'] == 'space':
        want.append(f"공간 “{space_name(ctx, slot['bind'].get('space'))}”")
    if slot['bind'].get('product'):
        p = lib['products_all'].get(slot['bind']['product']) or {}
        want.append(f"이 공간의 제품 {p.get('name') or ''}({p.get('cat') or ''})")
    if not want:
        want.append(f"칸 설명: {slot['hint']}" if slot['hint'] else '이 장의 내용을 보여 주는 장면')
    return (f"- 슬롯 {s}:{slot['key']} · 장 제목: {slot['title'][:60]} · 이 칸 옆 문구: {slot['near'][:120] or '(없음)'} · 보여야 할 것: {' · '.join(want)}")


# 프롬프트 예산 (app/api/poc/prompt_budget.py — the composer does not import the app): a weak model answers short questions well
# and long ones badly — the slots of a part are asked a few at a time, the calls at once. Before (2026-11-18, 7 real
# compositions) one picture check read every slot of the part: up to 3.8k chars.
PICK_SLOTS = 2      # slots one pick call reads (each with its candidates)
VERIFY_SLOTS = 3    # slots one check call reads (each with ≤ 3 alternatives)


def _at_once(fn, jobs: list) -> list:
    """``fn`` over the jobs at once → [(job, result, error)] in order; a cancelled job stops it (raised)"""
    from concurrent.futures import ThreadPoolExecutor
    from contextvars import copy_context
    if len(jobs) <= 1:
        out = []
        for j in jobs:
            try:
                out.append((j, fn(j), None))
            except Exception as exc:  # noqa: BLE001
                if _cancelled(exc):
                    raise
                out.append((j, None, exc))
        return out
    out = []
    with ThreadPoolExecutor(max_workers=min(6, len(jobs))) as pool:
        futures = [(j, pool.submit(copy_context().run, fn, j)) for j in jobs]
        for j, f in futures:
            try:
                out.append((j, f.result(), None))
            except Exception as exc:  # noqa: BLE001
                if _cancelled(exc):
                    raise
                out.append((j, None, exc))
    return out


def _pick(ctx: dict, part: dict, slides: List[dict], open_slots: List[tuple], llm, none: Optional[Set[str]] = None) -> Dict[str, str]:
    rows, allowed = {}, {}
    for s, slot in open_slots:
        if not slot['cands']:
            continue
        sk = f"{s}:{slot['key']}"
        allowed[sk] = [c['src'] for c in slot['cands']]
        rows[sk] = _slot_row(ctx, part, s, slot) + '\n' + '\n'.join(_cand_line(c['src']) for c in slot['cands'])
    if not rows:
        return {}
    dec = _decision(llm, slides)
    if dec is not None:
        try:
            return _pick_decision(ctx, part, open_slots, allowed, dec, none)
        except Exception as exc:  # noqa: BLE001 — the decision model did not answer: the LLM picks (another real model)
            if _cancelled(exc):
                raise
    keys = list(rows)

    def one(group):
        mine = {k: allowed[k] for k in group}
        every = sorted({c for v in mine.values() for c in v}) + ['none']
        schema = {'type': 'OBJECT', 'properties': {'picks': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
            'slot': {'type': 'STRING', 'enum': list(mine)}, 'src': {'type': 'STRING', 'enum': every}}, 'required': ['slot', 'src']}}}, 'required': ['picks']}
        prompt = (f"제안서 장표의 사진 칸마다 칸 옆 문구와 맞는 사진을 후보 중에서 고릅니다.\n"
                  f"고객: {(ctx.get('customer') or '')[:30]} · 업종 {(ctx.get('vertical_name') or ctx.get('ind') or '')[:20]} · 파트: {(part.get('name') or '')[:24]}\n"
                  "고르는 법: 1) 문구와 ‘보여야 할 것’의 공간 · 대상이 사진 설명에 보임 2) 이 고객 업종의 장소 3) 다른 제품군이 주인공인 사진은 고르지 않음 "
                  "4) 맞는 후보가 없으면 \"none\". 같은 사진을 두 칸에 쓰지 않음.\n"
                  "칸과 후보 (src :: 사진 설명):\n" + '\n'.join(rows[k] for k in group) + '\nJSON만: {"picks":[{"slot":"0:1","src":"..."}]}')

        def check(d):
            seen = set()
            for p in d.get('picks') or []:
                if p.get('slot') not in mine:
                    return f"없는 슬롯 {p.get('slot')}"
                if p.get('src') != 'none' and p.get('src') not in mine[p['slot']]:
                    return f"슬롯 {p['slot']} 은 자기 후보 중에서만 고릅니다."
                if p.get('src') != 'none' and p['src'] in seen:
                    return f"같은 사진({p['src']})을 두 칸에 썼습니다."
                seen.add(p.get('src'))
            return True
        try:
            return llm.json(stage='auto_image', prompt=prompt, schema=schema, validate=check, temperature=0.1, max_tokens=800)
        except Exception as exc:  # noqa: BLE001
            if getattr(exc, 'code', '') != 'invalid_output':
                raise
            part.setdefault('warnings', []).append('사진 선택 일부가 후보 밖이라 순위로 대체')
            return getattr(exc, 'last', None) or {'picks': []}
    results = _at_once(one, [keys[k:k + PICK_SLOTS] for k in range(0, len(keys), PICK_SLOTS)])
    if results and all(e is not None for _, _, e in results):
        raise next(e for _, _, e in results if e is not None)
    out, seen = {}, set()
    for p in [p for _, d, _ in results for p in ((d or {}).get('picks') or [])]:   # (a photo two calls chose: the first slot keeps it)
        if isinstance(p, dict) and p.get('slot') in allowed and p.get('src') in allowed[p['slot']] and p['src'] not in seen:
            out[p['slot']] = p['src']
            seen.add(p['src'])
        elif isinstance(p, dict) and p.get('slot') in allowed and p.get('src') == 'none' and none is not None:
            none.add(p['slot'])
    return out


REASONS = ['ok', 'wrong_space', 'wrong_subject', 'wrong_industry', 'wrong_product', 'other_brand']


def _verify(ctx: dict, part: dict, slides: List[dict], open_slots: List[tuple], choice: Dict[str, str], llm) -> Dict[str, dict]:
    rows, alts = {}, {}
    for s, slot in open_slots:
        sk = f"{s}:{slot['key']}"
        src = choice.get(sk)
        if not src:
            continue
        others = [c['src'] for c in slot['cands'] if c['src'] != src and c['src'] not in choice.values()]
        # (the verifier reads captions only: the alternatives it may pick are the ones the frame does not cut to a strip, when there are any)
        others = sorted(others, key=lambda x: (visible(x, slot) or 1.0) < SHAPE_MIN)[:3]
        alts[sk] = others + (['original'] if slot['osrc'] and slot['osrc'] != src and not rule_reject(slot['osrc'], slot, ctx, relax=True) else [])
        rows[sk] = (_slot_row(ctx, part, s, slot) + f"\n    고른 사진: {caption(src)[:120]}"
                    + ''.join(f"\n    대안 {a} :: {caption(a)[:110]}" for a in others)
                    + (f"\n    대안 original :: 템플릿 원래 사진 — {caption(slot['osrc'])[:60]}" if 'original' in alts[sk] else ''))
    if not rows:
        return {}
    dec = _decision(llm, slides)
    if dec is not None:
        try:
            return _verify_decision(ctx, part, open_slots, choice, alts, dec)
        except Exception as exc:  # noqa: BLE001 — the decision model did not answer: the LLM checks (another real model)
            if _cancelled(exc):
                raise
    keys = list(rows)

    def one(group):
        mine = {k: alts[k] for k in group}
        every = sorted({a for v in mine.values() for a in v}) + ['none']
        schema = {'type': 'OBJECT', 'properties': {'checks': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
            'slot': {'type': 'STRING', 'enum': list(mine)}, 'reason': {'type': 'STRING', 'enum': REASONS},
            'better': {'type': 'STRING', 'enum': every}}, 'required': ['slot', 'reason', 'better']}}}, 'required': ['checks']}
        prompt = (f"제안서 장표의 사진이 칸 옆 문구와 맞는지 봅니다(사진은 설명으로만 판단).\n"
                  f"고객: {(ctx.get('customer') or '')[:30]} · 업종 {(ctx.get('vertical_name') or ctx.get('ind') or '')[:20]} · 파트: {(part.get('name') or '')[:24]}\n"
                  "칸마다 reason 하나 — 확실히 어긋날 때만 ok 가 아닌 값, 애매하면 ok: ok(같은 업종의 일반 장면도 ok) · wrong_space(다른 공간) · "
                  "wrong_subject(주인공이 무관) · wrong_industry(다른 업종) · wrong_product(다른 제품군이 주인공) · other_brand(다른 회사 간판).\n"
                  "ok 가 아니면 better 에 더 맞는 대안 src(원래 사진이 낫다면 \"original\"), 없으면 \"none\". ok 면 \"none\".\n"
                  + '\n'.join(rows[k] for k in group) + '\nJSON만: {"checks":[{"slot":"0:1","reason":"ok","better":"none"}]}')

        def check(d):
            for c in d.get('checks') or []:
                if c.get('slot') not in mine:
                    return f"없는 슬롯 {c.get('slot')}"
                if c.get('reason') not in REASONS:
                    return 'reason 은 정해진 값 중 하나여야 합니다.'
            return True
        try:
            return llm.json(stage='auto_image_verify', prompt=prompt, schema=schema, validate=check, temperature=0.0, max_tokens=800)
        except Exception as exc:  # noqa: BLE001
            if getattr(exc, 'code', '') != 'invalid_output':
                raise
            return getattr(exc, 'last', None) or {'checks': []}
    results = _at_once(one, [keys[k:k + VERIFY_SLOTS] for k in range(0, len(keys), VERIFY_SLOTS)])
    if results and all(e is not None for _, _, e in results):
        raise next(e for _, _, e in results if e is not None)
    out = {}
    for c in [c for _, d, _ in results for c in ((d or {}).get('checks') or [])]:
        if not isinstance(c, dict) or c.get('slot') not in alts:
            continue
        sk = c['slot']
        ok = c.get('reason') == 'ok'
        better = c.get('better') if (not ok and c.get('better') in alts[sk]) else None
        out[sk] = {'verdict': 'ok' if ok else 'mismatch', 'reason': c.get('reason') or '', 'better': better}
    return out


# ------------------------------------------------------------------------------------------------ decision branch (layout.pictures)
# 사용자 지시 2026-11-18: 판단이 가능한 노드는 decision 모델 버전도 — 같은 앞뒤 interface, decision 분기를 탈 때만 바뀐다.
# The app sets ``llm.decisions['layout.pictures']`` (an object with ``ask(stage, state, questions) -> answers``, System One question
# shapes) and ``llm.decision_on(f, task)`` (the layout's status, app/data/layout_decisions.json); without them nothing changes.
# Each frame becomes choice questions; the answers are mapped onto exactly what the LLM branch returns.
DECISION_TASK = 'layout.pictures'
REASON_TEXT = {
    'ok': '맞음 — 문구가 말하는 공간 · 대상이 사진에 보인다(완전히 같지 않아도 독자가 어색하지 않다). 같은 업종의 일반적인 매장 · 현장 장면도 맞음',
    'wrong_space': '맞지 않음 — 문구는 A 공간인데 사진은 다른 공간이다(주방 문구에 객석 사진)',
    'wrong_subject': '맞지 않음 — 사진의 주인공이 문구 내용과 관계없다',
    'wrong_industry': '맞지 않음 — 다른 업종 · 세부 업종의 장소다(대형마트 제안서에 백화점)',
    'wrong_product': '맞지 않음 — 문구는 사이니지인데 사진은 에어컨처럼 다른 제품군이 주인공이다',
    'other_brand': '맞지 않음 — 다른 회사의 간판 · 로고가 주인공이다',
}
DECISION_OK_MIN = 0.5   # a pick is rejected when the model's top answer is a misfit and 'ok' is below this — calibrated on 40 layouts
                        # × 2 samples against the LLM verifier (shadow): 77 % the same verdict


def _decision(llm, slides: List[dict]):
    d = (getattr(llm, 'decisions', None) or {}).get(DECISION_TASK)
    if d is None:
        return None
    gate = getattr(llm, 'decision_on', None)
    if gate is not None and not all(gate(sl.get('f') or '', DECISION_TASK) for sl in slides):
        return None
    return d


def _cancelled(exc: BaseException) -> bool:
    return type(exc).__name__ == 'JobCancelled' or getattr(exc, 'code', '') == 'cancelled'


def _decision_state(ctx: dict, part: dict) -> dict:
    return {'고객': ctx.get('customer') or '', '업종': ctx.get('vertical_name') or ctx.get('ind') or '', '파트': part.get('name') or '',
            '파트 메시지': part.get('message') or ''}


def _confidence(a) -> float:
    c = (a or {}).get('confidence')
    return float(c) if isinstance(c, (int, float)) else 0.0


def _pick_decision(ctx: dict, part: dict, open_slots: List[tuple], allowed: Dict[str, List[str]], dec, none: Optional[Set[str]]) -> Dict[str, str]:
    """the decision branch of ``_pick``: per frame one choice among its candidates (or none); no photo twice — the most certain
    frame chooses first"""
    qs, keys = {}, {}
    for n, (s, slot) in enumerate(open_slots):
        sk = f"{s}:{slot['key']}"
        if sk not in allowed:
            continue
        crit = {f'c{m}': _cand_line(src).split(' :: ', 1)[-1][:200] for m, src in enumerate(allowed[sk])}
        crit['none'] = '맞는 후보가 없다'
        qs[f'p{n}'] = {'type': 'choice', 'criteria': crit,
                       'instructions': _slot_row(ctx, part, s, slot) + ' — 칸 옆 문구와 보여야 할 것(같은 공간 · 쓰임 · 제품군)이 실제로 보이는 이 고객 업종의 사진. '
                                       '문구의 제품군과 다른 제품이 주인공인 사진은 고르지 않음. 맞는 후보가 없으면 none.'}
        keys[n] = sk
    if not qs:
        return {}
    answers = dec.ask('auto_image', _decision_state(ctx, part), qs)
    out, seen = {}, set()
    for n in sorted(keys, key=lambda n: -_confidence(answers.get(f'p{n}'))):
        sk = keys[n]
        probs = (answers.get(f'p{n}') or {}).get('probabilities') or {}
        ranked = sorted(probs.items(), key=lambda kv: -float(kv[1]))
        for key, p in ranked:
            if key == 'none':
                if none is not None:
                    none.add(sk)
                break
            src = allowed[sk][int(key[1:])] if key[1:].isdigit() and int(key[1:]) < len(allowed[sk]) else None
            if src and src not in seen:
                out[sk] = src
                seen.add(src)
                break
    return out


def _verify_decision(ctx: dict, part: dict, open_slots: List[tuple], choice: Dict[str, str], alts: Dict[str, List[str]], dec) -> Dict[str, dict]:
    """the decision branch of ``_verify``: per frame one choice of the verdict and one of the photo to use instead"""
    qs, keys = {}, {}
    for n, (s, slot) in enumerate(open_slots):
        sk = f"{s}:{slot['key']}"
        src = choice.get(sk)
        if not src or sk not in alts:
            continue
        row = _slot_row(ctx, part, s, slot)
        qs[f'v{n}'] = {'type': 'choice', 'criteria': dict(REASON_TEXT),
                       'instructions': f"{row} · 고른 사진: {caption(src)[:120]} — 이 사진이 이 칸에 맞는가(사진은 설명 문장으로만 판단; 확실히 어긋날 때만 맞지 않음)"}
        others = [a for a in alts[sk] if a != 'original']
        crit = {f'a{m}': caption(a)[:110] for m, a in enumerate(others)}
        if 'original' in alts[sk]:
            crit['original'] = '템플릿 원래 사진 — ' + caption(slot['osrc'])[:60]
        if crit:
            crit['none'] = '맞는 대안이 없다'
            qs[f'b{n}'] = {'type': 'choice', 'criteria': crit, 'instructions': f'{row} — 고른 사진이 맞지 않을 때 대신 쓸 사진'}
        keys[n] = (sk, others)
    if not qs:
        return {}
    answers = dec.ask('auto_image_verify', _decision_state(ctx, part), qs)
    out = {}
    for n, (sk, others) in keys.items():
        a = answers.get(f'v{n}') or {}
        top = a.get('choice') or 'ok'
        p_ok = float((a.get('probabilities') or {}).get('ok', 1.0 if top == 'ok' else 0.0))
        if top == 'ok' or p_ok >= DECISION_OK_MIN:   # (top is a misfit and the model is fairly sure: rejected)
            out[sk] = {'verdict': 'ok', 'reason': 'ok', 'better': None}
            continue
        b = (answers.get(f'b{n}') or {}).get('choice')
        better = 'original' if b == 'original' else (others[int(b[1:])] if b and b[:1] == 'a' and b[1:].isdigit() and int(b[1:]) < len(others) else None)
        out[sk] = {'verdict': 'mismatch', 'reason': top, 'better': better}
    return out
