"""Layout RAG search — ``layout_design.rank_slide`` + ``available_info`` over the canonical KB.

Deterministic: BM25 (Korean bigrams) + TF-IDF char n-grams (``LayoutIndex(kb, dense='tfidf')``),
then the PoC metadata fit score. No model call and no API key needed. Retired layouts are skipped by
``rank_slide`` exactly as in the PoC.
"""
from __future__ import annotations

from typing import Any, Dict

from .. import imports, knowledge
from ..jobs import BadRequest, Unavailable
from ..settings import Settings
from .common import as_int, dummy_response, jsonable, resolve_mode, str_list

LEVELS = ('minimal', 'ambiguous', 'complex')


def search(body: dict, settings: Settings) -> dict:
    plan = resolve_mode(settings, 'search', body, needs_llm=False)
    if not plan.run:
        return dummy_response('search', plan, '레이아웃 검색 백엔드가 더미 모드입니다. 앱 기본 검색을 쓰세요.') | {'items': []}
    q = body.get('q', '')
    if not isinstance(q, str) or len(q) > 2000:
        raise BadRequest('q 는 2000자 이하 문자열이어야 합니다.')
    part = body.get('part') or ''
    industry = body.get('industry') or body.get('ind') or None
    strategy = body.get('strategy') or None
    level = body.get('level') or 'ambiguous'
    k = as_int(body, 'k', 12, 1, 50)
    products = str_list(body.get('products'), 'products')
    solutions = str_list(body.get('solutions'), 'solutions')
    if level not in LEVELS:
        raise BadRequest(f'level 은 {", ".join(LEVELS)} 중 하나여야 합니다.')
    if not q.strip() and not part:
        raise BadRequest('q 또는 part 중 하나는 필요합니다.')
    try:
        base_kb, index = knowledge.layout_assets(settings.kb_cache)
    except knowledge.KnowledgeError as exc:
        raise Unavailable(str(exc), exc.code) from None
    if part and part not in base_kb.PARTS:
        raise BadRequest('알 수 없는 part: ' + str(part)[:40])
    if industry and industry not in base_kb.IND:
        raise BadRequest('알 수 없는 industry: ' + str(industry)[:20])
    if strategy and strategy not in base_kb.STRATEGIES:
        raise BadRequest('알 수 없는 strategy: ' + str(strategy)[:20])
    unknown = [p for p in products if p not in base_kb.P] + [s for s in solutions if s not in base_kb.S]
    kb = base_kb.with_products(products)
    L = imports.layout()
    p = {'id': 'S01', 'type': part or 'value', 'name': q, 'items': [], 'seed_layouts': [], 'req_ids': [], 'slides': 1}
    ctx = {'industry': industry, 'industry_name': kb.ind_name(industry) if industry else '', 'customer': '고객사', 'project': '', 'target': '',
           'products': [x for x in products if x in kb.P], 'solutions': [x for x in solutions if x in kb.S], 'cases': [], 'spaces': []}
    analysis = {'requirements': [], 'keymen': [], 'goals': [], 'facts': [], 'req_type': None, 'context_level': level}
    ranked = L.layout_design.rank_slide(kb, index, p, 0, ctx, analysis, L.layout_design.available_info(analysis, ctx), level, strategy, top=k)
    items = []
    for c in ranked['candidates'][:k]:
        card: Dict[str, Any] = kb.cards[c['f']]
        items.append({'f': c['f'], 'code': c['code'], 'name': card['name'], 'score': round(c['score'], 2), 'why': c['why'], 'part': card['part'],
                      'part2': card.get('part2'), 'when': card.get('when', ''), 'visual': card.get('visual'), 'ind': card.get('ind'), 'sol': card.get('sol'),
                      'capacity': card.get('capacity'), 'needs': card.get('data_needs', {}).get('labels', []), 'strategy_fit': card.get('strategy_fit'),
                      'level_fit': card.get('level_fit'), 'photo_fraction': card.get('pf')})
    return {'mode': 'real' if plan.requested == 'real' else plan.requested, 'engine': 'bm25+tfidf+metadata', 'requested_mode': plan.requested,
            'query': ranked.get('query'), 'items': jsonable(items), 'unknown_ids': unknown,
            'counts': {'candidates': len(ranked['candidates']), 'layouts_active': sum(1 for c in kb.cards.values() if not c.get('retired'))}}
