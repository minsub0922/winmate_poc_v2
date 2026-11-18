"""레이아웃 관리 상세 — 시트의 이미지 칸을 누르면 관련 이미지 · 검색 · 바꾸기.

관련 이미지 = 사진 라이브러리(app/data/runtime/composer/library.json `images`, 자동 구성이 사진을 고르는 바로 그 목록)에서
이 칸 · 지금 사진과 가까운 순: 샘플 시나리오에서 이 레이아웃의 같은 칸에 쓰인 사진 · 같은 종류 · 같은 공간 · 같은 제품 · 같은 업종 ·
설명이 비슷한 사진 · 같은 묶음(폴더), 그리고 칸 비율에 맞는 사진이 앞에 온다. 라이브러리에 없는 주소(목차 아이콘 · 표지 · 구독
자산 …)는 같은 폴더의 이미지가 관련 이미지다. 검색은 라이브러리 전체(설명 · 이름 · 공간 · 제품 · 솔루션 · 고객 · 업종)에서.

고른 주소는 상세의 draft.img 로 가고 '수정 반영'으로 저장된다(app/api/layout_library.py clean · apply_html — 앱 · Storyboard 의
기본 사진). 썸네일은 이 모듈의 파일 경로로만 읽는다(라이브러리 주소이거나 관리 자원 폴더의 이미지 파일).
"""
from __future__ import annotations

from functools import lru_cache
import json
import math
from pathlib import Path
import re

from fastapi import HTTPException
from fastapi.responses import Response

from .config import ROOT
from .image_metadata import composer_fields
from app.api.layout_flows import image_weights
from app.api.resource_switches import image_refs
from .resources import IMAGE, PACKED, ResourceLibrary, resource_bytes

LIB = 'app/data/runtime/composer/library.json'
PAGE = 48
BLANK = 'data:image/gif;base64,'
KIND = {'product': '제품', 'scene': '공간', 'people': '사람', 'exterior': '외관', 'screen': '화면', 'diagram': '도식', 'kv': '키 비주얼'}
WORD = re.compile(r'[0-9a-z가-힣]{2,}')


def _words(*values) -> set:
    return set(WORD.findall(' '.join(str(v) for v in values if v).lower()))


@lru_cache(maxsize=2)
def _library(path: str, stamp: int):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    names = {i['code']: i['name'] for i in data.get('industries') or []}
    rows = {}
    for src, im in (data.get('images') or {}).items():
        inds = im.get('inds') or {}
        fields = composer_fields({**im, 'src': src}, names)
        rows[src] = {**im, 'src': src, '_fields': fields, '_search': '\n'.join(v.casefold() for values in fields.values() for v in values),
                     '_dir': src.split('#')[0].rsplit('/', 1)[0], '_title': _words(im.get('desc'), ' '.join(im.get('names') or [])),
                     '_words': _words(im.get('desc'), ' '.join(im.get('names') or []), ' '.join(im.get('spaces') or []),
                                      ' '.join(im.get('products') or []), ' '.join(im.get('solutions') or []), im.get('cust'),
                                      ' '.join(names.get(k, k) for k in inds), KIND.get(im.get('kind'), ''))}
    return rows, names


def library(root: Path = ROOT):
    p = Path(root) / LIB
    try:
        return _library(str(p), p.stat().st_mtime_ns)
    except FileNotFoundError:
        return {}, {}


def find(rows: dict, src: str):
    if not src or src.startswith('data:'):
        return None
    return rows.get(src) or rows.get(src.lstrip('/')) or rows.get('/' + src.lstrip('/'))


def public(row: dict, names: dict, why=()) -> dict:
    inds = sorted((row.get('inds') or {}).items(), key=lambda kv: -kv[1])
    return {'src': row['src'], 'desc': row.get('desc') or Path(row['src'].split('#')[0]).name, 'kind': KIND.get(row.get('kind'), row.get('kind') or ''),
            'w': row.get('w'), 'h': row.get('h'), 'industries': [names.get(k, k) for k, _ in inds[:2]],
            'spaces': (row.get('spaces') or [])[:2], 'cust': row.get('cust') or '', 'why': list(why)[:2]}


def _folder(root: Path, store, src: str, limit: int = 300) -> list:
    """image files next to a non-library address (the same icon set · cover set …)"""
    directory = src.split('#')[0].split('?')[0].rsplit('/', 1)[0]
    if not directory:
        return []
    lib = ResourceLibrary(store, root)
    path = lib.local(directory + '/x.png')
    folder = path.parent if path else None
    if not folder or not folder.is_dir():
        return []
    out = []
    for p in sorted(folder.iterdir()):
        if p.suffix.lower() in IMAGE and p.is_file() and not p.name.startswith('.'):
            words = _words(p.stem.replace('.', ' ').replace('_', ' '))
            out.append({'src': directory + '/' + p.name, 'desc': p.stem, '_dir': directory, '_words': words, '_title': words})
            if len(out) >= limit:
                break
    return out


def related(root: Path, store, f: str, slot: str, src: str, ratio: float, q: str, offset: int, family, context: str, layout_inds) -> dict:
    rows, names = library(root)
    weights = image_weights()
    _, disabled = image_refs(root)
    cur = find(rows, src)
    pool = list(rows.values())
    if src and not cur and not src.startswith('data:'):
        pool = _folder(root, store, src) + pool
    query = _words(q)
    cdir = (cur or {}).get('_dir') or (src.split('#')[0].rsplit('/', 1)[0] if src and not src.startswith('data:') else '')
    cwords = (cur or {}).get('_words') or _words(context)
    cinds = (cur or {}).get('inds') or {k: 1.0 for k in layout_inds or []}
    family = set(family or []) | {f}
    scored = []
    for row in pool:
        if row['src'] in disabled or row['src'] in (src, (cur or {}).get('src')):
            continue
        s, why = 0.0, []
        if query:   # every search word, whole or inside a word ('사이니지' finds '디지털사이니지')
            if not all(w in row['_words'] or any(w in x for x in row['_words']) for w in query):
                continue
            # 설명 · 이름에 있으면 앞으로(공간 · 제품 · 고객 칸에만 있으면 뒤)
            s += weights['caption'] * sum(8 if any(w in x for x in row['_title']) else 3 for w in query)
        if any(u.get('f') in family and str(u.get('slot', u.get('i'))) == str(slot) for u in row.get('usage') or []):
            s += 6; why.append('이 칸에 쓰임')
        if cur and row.get('kind') and row.get('kind') == cur.get('kind'):
            s += 2; why.append('같은 종류')
        if weights['place'] and cur and set(row.get('spaces') or []) & set(cur.get('spaces') or []):
            s += 2 * weights['place']; why.append('같은 공간')
        if weights['subject'] and cur and set(row.get('products') or []) & set(cur.get('products') or []):
            s += 1.5 * weights['subject']; why.append('같은 제품')
        if weights['subject'] and cur and row.get('cust') and row.get('cust') == cur.get('cust'):
            s += weights['subject']; why.append('같은 사례')
        common = sum(min(float(v), float(cinds[k])) for k, v in (row.get('inds') or {}).items() if k in cinds)
        if common and weights['place']:
            s += 2 * min(common, 1.0) * weights['place']
            if common >= 0.6:
                why.append('같은 업종')
        if cwords and weights['caption']:
            overlap = len(cwords & row['_words']) / max(1, len(cwords | row['_words']))
            s += 5 * overlap * weights['caption']
            if overlap >= 0.25 and '설명 비슷' not in why:
                why.append('설명 비슷')
        if cdir and row.get('_dir') == cdir:
            s += 3 if not cur else 1; why.append('같은 묶음')
        if cur and row.get('group') and row.get('group') == cur.get('group'):
            s += 0.5
        if ratio and row.get('w') and row.get('h'):
            d = abs(math.log((row['w'] / row['h']) / ratio))
            s += max(-2.0, 1.5 - 3 * d)
            if d <= 0.12:
                why.append('칸 비율')
        if not query and s < 1.5:
            continue
        scored.append((s, row, why))
    scored.sort(key=lambda x: -x[0])
    page = scored[offset:offset + PAGE]
    return {'slot': slot, 'current': public(cur, names) if cur else ({'src': src, 'desc': Path(src.split('#')[0]).name if src and not src.startswith('data:') else '', 'kind': '', 'w': None, 'h': None,
                                                                    'industries': [], 'spaces': [], 'cust': '', 'why': []} if src else None),
            'items': [public(r, names, why) for _, r, why in page], 'total': len(scored), 'offset': offset, 'page': PAGE}


def thumbnail(root: Path, store, src: str) -> Response:
    """a thumbnail of a library image or of an image file in the managed resource folders — nothing else"""
    if not isinstance(src, str) or not src or len(src) > 400 or src.startswith(('http:', 'https:', 'data:')) or '..' in src or '\\' in src:
        raise HTTPException(422, '이미지 주소를 확인해 주세요.')
    rows, _ = library(root)
    local = ResourceLibrary(store, root).local(src)
    packed = PACKED.match(src)
    if not local or not local.is_file() or not (find(rows, src) or (not packed and local.suffix.lower() in IMAGE)):
        raise HTTPException(404, '이미지를 찾지 못했습니다.')
    item = {'_file': local, **({'_slot': int(packed[2])} if packed else {})}
    try:
        raw, mime = resource_bytes(item, thumb=True)
    except (OSError, ValueError, IndexError):
        raise HTTPException(404, '이미지를 읽지 못했습니다.') from None
    return Response(raw, media_type=mime, headers={'Cache-Control': 'private, max-age=86400'})
