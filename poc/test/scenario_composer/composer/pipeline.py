"""Orchestration: customer input → (A) situation → (B) parts → (C) layouts → (D) wording → (E) pictures.

    from composer.pipeline import recommend, complete
    rec = recommend(raw_input, llm)                     # part recommendation (Storyboard bubbles)
    out = complete(raw_input, rec['parts'], llm, analysis=rec['analysis'], thesis=rec['thesis'])
    out['app_parts']                                    # → proposal.parts (layouts filled: ov.t · ov.img)

``exclude`` hides scenarios from every stage (retrieval, modules, pictures made for them) — used by the
leave-one-out evaluation so a 샘플 버티컬 시나리오 is never rebuilt from itself.
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Sequence

from . import context as ctxm
from .compose import compose_layouts
from .fill import fill_images_part, fill_texts_part
from .storyline import analyze, recommend_parts


def recommend(raw: dict, llm, exclude: Sequence[str] = ()) -> dict:
    inp = ctxm.normalize(raw)
    t0 = time.time()
    rec = recommend_parts(inp, llm, exclude)
    rec['ms'] = int((time.time() - t0) * 1000)
    return rec


def complete(raw: dict, parts: List[dict], llm, *, analysis: Optional[dict] = None, thesis: str = '', exclude: Sequence[str] = (),
             base: Optional[str] = None, workers: int = 4, used_layouts: Sequence[str] = ()) -> dict:
    inp = ctxm.normalize(raw)
    t0 = time.time()
    a = analysis or analyze(inp, llm)
    deck = compose_layouts(inp, a, parts, llm, exclude, base, used=set(used_layouts))
    allowed = ctxm.allowed_numbers(inp)
    banned = ctxm.forbidden_names(inp)
    idx = [i for i, p in enumerate(deck) if p.get('slides')]
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        list(ex.map(lambda i: fill_texts_part(inp, a, deck, i, thesis, llm, allowed, banned), idx))
    used: set = set()
    held = set(exclude)
    for i in idx:
        fill_images_part(inp, a, deck, i, llm, used, held)
    return {'analysis': a, 'thesis': thesis, 'parts': deck, 'app_parts': to_app_parts(deck), 'ms': int((time.time() - t0) * 1000)}


def run(raw: dict, llm, exclude: Sequence[str] = ()) -> dict:
    rec = recommend(raw, llm, exclude)
    out = complete(raw, rec['parts'], llm, analysis=rec['analysis'], thesis=rec['thesis'], exclude=exclude,
                   base=rec['storyline']['base'])
    out['storyline'] = rec['storyline']
    out['recommend_ms'] = rec['ms']
    return out


def to_app_parts(deck: List[dict]) -> List[dict]:
    """the app's proposal.parts shape: {type, name, items, form, done, layouts: [{f, status, ov: {t, img}}]} (+ deck part)."""
    out = []
    for p in deck:
        lay = []
        for sl in p.get('slides') or []:
            t = dict(sl.get('t') or {})
            img = dict(sl.get('img') or {})
            lay.append({'f': sl['f'], 'status': 'done' if (t or img) else 'empty', 'ov': {'t': t, 'img': img},
                        'agent': {'from': sl.get('from'), 'ex': sl.get('ex'), 'adapt': sl.get('adapt') or [], 'masked': sl.get('masked') or [],
                                  'img_missing': sl.get('img_missing') or []}})
        item = {'type': p.get('type') or 'free', 'name': p.get('name') or '', 'items': p.get('items') or [], 'form': 'list', 'text': '',
                'done': True, 'layouts': lay, 'src': p.get('src')}
        if p.get('deck'):
            item.update({'deck': True, 'name': '표지', 'type': 'cover'})
        out.append(item)
    return out
