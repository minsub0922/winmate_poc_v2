"""Exact items in a picture — which catalog items a photo shows (사용자 지시 2026-11-18).

    "공간 이미지의 경우 정확한 품목이 포함된 이미지야. 그래서 세탁기여도 다른 세탁기면 가져오면 에러야. 이를 이미지 메타데이터에도
     등록하고 이미지 탐색 로직에도 적용해서 이러한 에러가 없도록 개선해. 공간인데 제품이 없을수도 있는데 이러한 경우는 상관없는거야."

A space photo shows exact items: a photo of washer A does not stand for a space whose washer is B, although both are washers.
A photo that shows no product may stand for any space (the other rules — this space, this industry — still apply).

``annotate`` writes onto every picture of the library:

    items      the catalog items the picture is *officially* a picture of — its source says so, not the wording of a caption:
               the product image library (img/lib — the product's own page · its e-카탈로그 page · a case study of it), the app
               image DB (a model code), the product's own gallery · thumbnail; failing those, a caption that names a model code
               (QM55C) or a curated item's full name (360 카세트). A generic word (메뉴보드 · 세탁기 · 사이니지) is never an item.
    items_how  where the items came from: lib_site_pdp · lib_site_card · lib_ecat · lib_case · lib_app · app_model · gallery ·
               caption_model · caption_name · vision (scripts/identify_items.py — every main product in view matched among the catalog
               products of its kind and confirmed by two models; ``vi`` on the picture)
    shows      'item'    — a product is in view and it is one of ``items``
               'none'    — no product in view: the vision pass saw none and the caption names none
               'unknown' — a product is in view (vision pass · caption) but not which item — it cannot stand for a space
    item_fams  the product families in view (display · hvac · appliance · mobile): vision pass ∪ caption ∪ the items' own

Item identity is the catalog's: two rows are one item when they share their own model code — a curated row and its DSS row
('laundry' ↔ sg_g000180288, both WF18A9100KV · 'ac360' ↔ ec_203_004 AM052BN6PBH1). ``item_keys`` makes the table (stored in
the library as ``item_keys``); ``same_items`` compares by it. Sizes of one series are separate rows (qm55c · qm65c): a picture
that shows the series lists them all (its source does).
"""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional, Sequence, Set

# what a caption says is in view (also the picture stage's word lists — composer.pictures.FAMILY_WORDS)
FAMILY_WORDS = {
    'display': ['사이니지', '메뉴보드', '디스플레이', '비디오월', '키오스크', '전자칠판', 'LED', 'TV', '스크린', '모니터', 'The Wall', '미디어월', '전광판',
                '이페이퍼', '플립'],
    'hvac': ['에어컨', '공조', '냉난방', '실외기', '실내기', '카세트', '무풍', '환기', '공기청정', '칠러', '히트펌프', '냉방', '난방', 'DVM'],
    'appliance': ['냉장고', '세탁기', '건조기', '식기세척기', '인덕션', '오븐', '에어드레서', '정수기', '청소기', '쇼케이스'],
    'mobile': ['태블릿', '갤럭시 탭', '스마트폰', '워치', '노트북', '갤럭시 북', '단말', 'POS', '휴대폰'],
}
FAMILY_OF_FAM = {'디스플레이': 'display', '공조 · 에어컨': 'hvac', '주방 · 리빙 가전': 'appliance', '모바일 · PC': 'mobile'}
SHOWS = ('item', 'none', 'unknown')
_SPLIT = re.compile(r'[\s/,·|]+')
_TOKEN = re.compile(r'[A-Za-z0-9][A-Za-z0-9-]{3,}')


def families_in(text: str) -> Set[str]:
    t = str(text or '')
    return {fam for fam, words in FAMILY_WORDS.items() if any(w in t for w in words)}


def _key(part: str) -> str:
    return re.sub(r'[^A-Z0-9]', '', str(part or '').upper())


def model_keys(p: dict, strict: bool = False) -> Set[str]:
    """the model codes a catalog row answers to — codes only: letters and digits, five characters or more ('360 Cassette' and
    'IAB 146"' name a line, they are not codes). ``strict``: the row's own model and spec model only — not the ``models`` list,
    where an e-카탈로그 page also lists the combinations it is sold in (a shared outdoor unit would make every indoor unit one item)."""
    out = set()
    for m in [p.get('model'), p.get('specModel')] + ([] if strict else list(p.get('models') or [])):
        for part in _SPLIT.split(str(m or '')):
            k = _key(part)
            if len(k) >= 5 and re.search(r'[A-Z]', k) and re.search(r'\d', k):
                out.add(k)
    return out


def item_keys(products: Iterable[dict]) -> Dict[str, List[str]]:
    """{product id: its own model codes} for the rows that share one with another row — the same item in two catalogs (a curated
    row and its DSS row). Two rows are one item when they share such a code (pairwise, not chained: a row that lists several
    models does not make those models one another's item)."""
    rows = {p['id']: model_keys(p, strict=True) for p in products if p.get('id')}
    seen: Dict[str, int] = {}
    for keys in rows.values():
        for k in keys:
            seen[k] = seen.get(k, 0) + 1
    return {pid: sorted(keys) for pid, keys in rows.items() if any(seen[k] > 1 for k in keys)}


def same_items(a: Sequence[str], b: Sequence[str], table: Optional[Dict[str, Sequence[str]]] = None) -> List[str]:
    """the items of ``a`` that are also in ``b`` — the same row, or a row that shares its own model code (``item_keys``)."""
    table = table or {}
    out = []
    for x in a or ():
        kx = set(table.get(x) or ())
        if any(x == y or (kx and kx & set(table.get(y) or ())) for y in b or ()):
            out.append(x)
    return out


def model_index(products: Iterable[dict]) -> Dict[str, List[str]]:
    """model code → the rows that answer to it (an e-카탈로그 row by its own codes only — its ``models`` list holds combinations)."""
    out: Dict[str, List[str]] = {}
    for p in products:
        for k in model_keys(p, strict=str(p.get('id') or '').startswith('ec_')):
            out.setdefault(k, [])
            if p['id'] not in out[k]:
                out[k].append(p['id'])
    return out


def codes_in(text: str, index: Dict[str, List[str]]) -> List[str]:
    """the rows whose model code the text names ('QM55C 3면' → qm55c)."""
    out: List[str] = []
    for tok in _TOKEN.findall(str(text or '')):
        for pid in index.get(_key(tok)) or ():
            if pid not in out:
                out.append(pid)
    return out


def _flat(text: str) -> str:
    return re.sub(r'[^0-9a-z가-힣]', '', str(text or '').lower())


def names_in(text: str, names: Dict[str, str]) -> List[str]:
    """curated rows whose whole name the caption carries ('카페 좌석과 천장의 360 카세트' → ac360)."""
    t = _flat(text)
    hits = [(pid, n) for pid, n in names.items() if len(n) >= 4 and n in t]
    # '무풍 4Way 카세트' is not also '카세트' of another row: the longest name that covers a shorter one wins
    return [pid for pid, n in hits if not any(n != m and n in m for _, m in hits)]


def caption_of(it: dict) -> str:
    """what the picture's own description says — not its other names (another deck's caption, a case title appended: '… · 롯데시네마
    수지점 – 갤럭시 탭, 갤럭시 워치' names the case's products, not what is in this frame), nor its case record · space tags."""
    return str(it.get('desc') or ((it.get('names') or [''])[0]) or '')


def annotate(images: Dict[str, dict], products: Sequence[dict]) -> Dict[str, int]:
    """write items · items_how · shows · item_fams onto every picture (in place); returns counts by ``shows`` for the build log."""
    fam_of = {p['id']: FAMILY_OF_FAM.get(p.get('fam') or '') for p in products}
    index = model_index(products)
    names = {p['id']: _flat(p.get('name')) for p in products if p.get('cur')}
    counts = {k: 0 for k in SHOWS}
    for it in images.values():
        own = [x for x in dict.fromkeys(it.get('items') or []) if x in fam_of]
        how = it.get('items_how') or ''
        cap = caption_of(it)
        if not own and it.get('cls') in ('scene', 'kv'):
            own = codes_in(cap, index)
            how = 'caption_model' if own else ''
            if not own:
                own = names_in(cap, names)
                how = 'caption_name' if own else ''
            vi = it.get('vi') or {}
            if not own and vi.get('complete'):  # the vision check matched every main product in view (two models confirmed)
                own = [x for x in vi.get('items') or [] if x in fam_of]
                how = 'vision' if own else ''
        vf = it.get('vf') or {}
        seen = set(vf.get('products') or []) - {'none'}
        said = families_in(cap)
        fams = seen | said | {fam_of.get(x) for x in own} - {None}
        if own:
            shows = 'item'
        elif vf and not seen and not said:
            shows = 'none'
        else:
            shows = 'unknown'
        it['items'] = own
        it['items_how'] = how if own else ''
        it['shows'] = shows
        it['item_fams'] = sorted(f for f in fams if f)
        counts[shows] += 1
    return counts
