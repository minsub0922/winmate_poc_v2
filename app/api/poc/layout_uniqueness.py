"""Per-job layout selection: an automatic deck never reuses a template."""
from functools import partial
from types import FunctionType

from .strict import invalid_output


def unique_assemble(assemble, kb, parts, ranked, excluded=()):
    blocked = set(excluded)
    by = {(row['part_id'], row['slide']): row for row in ranked}
    slots = [(part['id'], j) for part in parts for j in range(part['slides'])]
    candidates = {}
    for key in slots:
        row = by.get(key, {})
        candidates[key] = sorted((c for c in row.get('candidates', []) if c['f'] not in blocked), key=lambda c: -c['score'])
        if not candidates[key]:
            raise invalid_output('layout:unique', '기존 장표와 겹치지 않는 레이아웃 후보가 없습니다. 파트의 내용이나 범위를 조정해 다시 구성하세요.')
    owners, selected = {}, {}

    def assign(key, visited):
        for candidate in candidates[key]:
            f = candidate['f']
            if f in visited:
                continue
            visited.add(f)
            previous = owners.get(f)
            if previous is None or assign(previous, visited):
                owners[f], selected[key] = key, candidate
                return True
        return False

    # Reserve constrained slots first; augmenting paths keep viable layouts for later slots.
    for key in sorted(slots, key=lambda key: len(candidates[key])):
        if not assign(key, set()):
            raise invalid_output('layout:unique', '모든 장표를 서로 다른 레이아웃으로 구성할 후보가 부족합니다. 중복 장표는 추가하지 않았습니다.')
    unique = [{**by[key], 'candidates': [selected[key]]} for key in slots]
    slides = assemble(kb, parts, unique)
    used = blocked | {slide['f'] for slide in slides}
    for slide in slides:
        key = next(key for key in slots if key[0] == slide['part_id'] and selected[key]['f'] == slide['f'])
        slide['alternates'] = [{k: c[k] for k in ('f', 'code', 'name', 'score')} for c in candidates[key] if c['f'] not in used][:2]
    return slides


def build_graph(modules, kb, llm, index, excluded=()):
    """Bind app policy in a private graph namespace; PoC modules and other jobs remain unchanged."""
    original = modules.graph.build_graph
    namespace = dict(original.__globals__)
    rank_slide, paginate = namespace['rank_slide'], namespace['paginate']
    blocked = frozenset(excluded)

    def rank(*args, **kwargs):
        # Keep eligible alternatives beyond the old top twelve, before any values are filled.
        kwargs['top'] = len(kb.cards)
        row = rank_slide(*args, **kwargs)
        return {**row, 'candidates': [c for c in row['candidates'] if c['f'] not in blocked]}

    def pages(*args, **kwargs):
        slides = paginate(*args, **kwargs)
        fs = [slide['f'] for slide in slides]
        if len(set(fs)) != len(fs):
            raise invalid_output('layout:unique', '표의 자동 페이지 분할이 같은 레이아웃을 반복합니다. 표 범위를 나누거나 서로 다른 레이아웃을 직접 선택해 주세요.')
        return slides

    namespace.update(rank_slide=rank, assemble=partial(unique_assemble, namespace['assemble'], excluded=blocked), paginate=pages)
    builder = FunctionType(original.__code__, namespace, original.__name__, original.__defaults__, original.__closure__)
    return builder(kb, llm, index)
