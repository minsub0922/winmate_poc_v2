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


def composer_fields(im, industries):
    vision = im.get('vf') or {}
    codes = list(dict.fromkeys([*(im.get('ind_primary') or []), *(im.get('inds') or {}), *(im.get('place') or [])]))
    return {k: list(dict.fromkeys(strings(v))) for k, v in [
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
