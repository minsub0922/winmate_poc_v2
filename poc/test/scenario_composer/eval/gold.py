"""샘플 버티컬 시나리오 → (customer input, gold deck) for reconstruction tests.

The input carries only what a salesperson would have typed into Winmate for that customer: project · customer ·
industry · situation (+ the customer's own quoted signals) · keymen requirements · maker note · picked products /
solutions / cases. The scenario's strategy, ending, thesis, flow and slides are the *answer* and never go in.
"""
from __future__ import annotations

from typing import List

from composer.library import load


def gold_input(c: dict) -> dict:
    title = c['title']
    if c['group'] in ('vertical', 'account') and ' — ' in title:
        title = title.split(' — ')[0].strip() + ' 제안'
    free = c['situation']
    if c['signals'] and c['group'] != 'std':
        free += '\n고객 발언: ' + ' / '.join(s.strip('“”"') for s in c['signals'])
    return {
        'id': c['id'], 'title': title, 'customer': c['customer'], 'ind': c['ind'], 'free_text': free,
        'target': (c.get('audience') or {}).get('lead') or '', 'keymen': c['keymen'], 'note': c['note'],
        'products': c['products'], 'solutions': c['solutions'], 'cases': c['cases'], 'date': '2026. 11. 11',
    }


def gold_deck(sid: str) -> dict:
    """the gold as a composer-shaped deck (parts → slides with t · img) — for scoring both sides the same way."""
    lib = load()
    card = next(c for c in lib['scenarios'] if c['id'] == sid)
    parts = []
    for m in [m for m in lib['modules'] if m['sid'] == sid]:
        slides = []
        for x in m['slides']:
            e = lib['exemplars'][f'{sid}:{x["k"]}']
            slides.append({'f': x['f'], 'from': x['f'], 'role': x['role'], 'ex': f'{sid}:{x["k"]}', 't': e['t'], 'img': e['img']})
        parts.append({'type': m['type'], 'name': m['name'], 'items': m['items'], 'src': m['mid'], 'deck': m['cover'], 'slides': slides, 'key': m['key']})
    return {'card': card, 'parts': parts}


def eval_set(groups=('bs', 'vertical', 'std', 'account')) -> List[dict]:
    lib = load()
    return [c for c in lib['scenarios'] if c['group'] in groups]


def exclusions(c: dict, mode: str) -> List[str]:
    """self: the scenario itself · family: every scenario authored from the same source deck (vertical _1/_2/std)."""
    lib = load()
    if mode == 'self':
        return [c['id']]
    return [x['id'] for x in lib['scenarios'] if x['family'] == c['family']]
