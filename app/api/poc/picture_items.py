"""What each photo shows of the catalog — for the browser's own photo checks (GET /api/picture-items).

사용자 지시 2026-11-18: 공간 이미지는 정확한 품목이 든 사진이다 — 같은 세탁기여도 다른 세탁기면 에러, 제품이 없는 공간 사진은 상관없다.
The composer library registers it per picture (composer.items → images[src] items · shows · item_fams, item_keys); the server's
composition checks it in composer.pictures.item_reject, and the web app (services/picture-items.js) checks the same table when it
fills or reviews a sheet itself, so both paths judge a space photo alike.

    {"version": 7, "keys": {product id: [model codes]}, "images": {src: [shows, [items], [families]]}}
    shows: "i" the items · "n" no product in view · "u" a product in view, which one unknown
"""
from __future__ import annotations

from functools import lru_cache

SHOW_CODE = {'item': 'i', 'none': 'n', 'unknown': 'u'}


def public() -> dict:
    from .adapters import compose
    compose._composer()  # the library this code reads (built when missing or older than the code)
    from composer import library  # noqa: WPS433 — importable once the composer is set up
    try:
        stamp = library.OUT.stat().st_mtime_ns
    except OSError:
        stamp = 0
    return _compact(library, str(library.OUT), stamp)


@lru_cache(maxsize=2)
def _compact(library, path: str, stamp: int) -> dict:
    lib = library.load()
    images = {}
    for src, it in (lib.get('images') or {}).items():
        if it.get('cls') not in ('scene', 'kv') or not it.get('shows'):
            continue
        images[src] = [SHOW_CODE.get(it['shows'], 'u'), list(it.get('items') or []), list(it.get('item_fams') or [])]
    return {'version': lib.get('version'), 'keys': lib.get('item_keys') or {}, 'images': images}
