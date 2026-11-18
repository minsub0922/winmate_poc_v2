"""Image fields used by the source browser and the composer's picture index."""
from collections import defaultdict

LABELS = {'title': '이름', 'desc': '설명', 'alt': '대체 텍스트', 'ctx': '원문 맥락', 'model': '모델', 'models': '모델',
          'products': '연결 제품', 'spaces': '공간', 'ind': '업종', 'cats': '제품 분류', 'kind': '원본 분류',
          'url': '원본 URL', 'file': '파일', 'case': '도입사례', 'src': '원본 유형', 'app_pid': '앱 이미지 ID'}


def strings(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from strings(child)
    elif value is not None and value != '':
        yield str(value)


# 사진 속 정확한 제품(사용자 지시 2026-11-18 — composer/items.py): 그 사진의 출처가 말하는 제품 · 제품 없음 · 제품 미확인
ITEM_SHOWS = {'item': '정확한 제품', 'none': '제품 없음', 'unknown': '제품 미확인'}
ITEM_HOW = {'lib_site_pdp': '제품 페이지', 'lib_site_card': '제품 카드', 'lib_ecat': 'e-카탈로그', 'lib_case': '도입사례', 'lib_app': '앱 이미지',
            'app_model': '앱 이미지 DB 모델', 'gallery': '제품 갤러리', 'caption_model': '설명의 모델 코드', 'caption_name': '설명의 제품 이름',
            'vision': '비전 대조'}


def item_fields(im, products=None):
    """'제품 노출' · '포함 제품' · '포함 제품 근거' — scene photos only (a product cut is its product's by definition)."""
    if im.get('cls') not in ('scene', 'kv') or not im.get('shows'):
        return []
    names = products or {}
    return [('제품 노출', ITEM_SHOWS.get(im['shows'], im['shows'])),
            ('포함 제품', [f"{names.get(pid) or pid} ({pid})" for pid in im.get('items') or []]),
            ('포함 제품 근거', ITEM_HOW.get(im.get('items_how'), im.get('items_how')) if im.get('items') else None)]


def composer_fields(im, industries, products=None):
    vision = im.get('vf') or {}
    codes = list(dict.fromkeys([*(im.get('ind_primary') or []), *(im.get('inds') or {}), *(im.get('place') or [])]))
    return {k: list(dict.fromkeys(strings(v))) for k, v in [*item_fields(im, products),
        ('사진 설명', im.get('desc')), ('검색 이름', im.get('names')), ('사진 역할', [im.get('kind'), im.get('cls')]),
        ('공간', im.get('spaces')), ('업종', [f'{industries.get(code, code)} ({code})' for code in codes]),
        ('연결 제품', im.get('products')), ('연결 솔루션', im.get('solutions')), ('도입사례', [im.get('cust'), im.get('case')]),
        ('사진 판독', [vision.get('shows'), vision.get('place'), vision.get('products'), vision.get('brand')]),
        ('사용 레이아웃', [u['f'] for u in im.get('usage') or [] if u.get('f')]),
        ('사진 식별 주소', im.get('pic')), ('이미지 주소', im.get('src'))
    ] if v}


def detail(asset, payload, image, q):
    fields = defaultdict(list)
    for label, values in (image or {}).get('_fields', {}).items():
        fields[label].extend(values)
    for key, v in payload.items():
        fields[LABELS.get(key, key)].extend(strings(v))
    for key, label in [('title', '이름'), ('external_id', '자원 ID'), ('url', '원본 URL')]:
        fields[label].extend(strings(asset.get(key)))
    fields = {k: list(dict.fromkeys(v)) for k, v in fields.items() if v}
    query = q.casefold()
    matches = [{'label': label, 'values': [v for v in values if query in v.casefold()]}
               for label, values in fields.items() if query and any(query in v.casefold() for v in values)]
    return {'indexed': image is not None, 'fields': [{'label': k, 'values': v} for k, v in fields.items()
                                                      if k in LABELS.values() or k in (image or {}).get('_fields', {})],
            'query': q, 'matches': matches}
