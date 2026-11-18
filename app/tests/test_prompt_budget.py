"""프롬프트 예산 (app/api/poc/prompt_budget.py) — the layout flows' model calls stay short and ask a few cells at a time.

Every in-use layout, its own content as the sheet and its catalog items selected (facts as long as the catalog has them):
- the writing chunks (sheet_writer) ask ≤ WRITE_CELLS cells, a card's cells together, and each prompt is ≤ HARD_CHARS;
- the checking chunks (sheet_check · the final check) read ≤ CHECK_CELLS cells and each prompt is ≤ HARD_CHARS.
And the helpers: packing, shared notes, the context cut to fit, the fan-out (order kept, errors returned, cancellation raised).
  app/.venv/bin/python -m pytest app/tests/test_prompt_budget.py -q
"""
import os
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
LIBRARY = ROOT / 'app' / 'data' / 'runtime' / 'composer' / 'library.json'


# ---------------------------------------------------------------- helpers
def test_pack_keeps_groups_whole_and_splits_only_a_group_too_large():
    from app.api.poc import prompt_budget as pb
    assert pb.pack([[1, 2], [3, 4, 5], [6]], 4) == [[1, 2], [3, 4, 5, 6]]
    assert pb.pack([[1, 2, 3, 4, 5, 6], [7]], 4) == [[1, 2, 3, 4], [5, 6], [7]]
    assert pb.pack([[], [1]], 3) == [[1]]


def test_a_note_several_cells_carry_is_said_once():
    from app.api.poc import prompt_budget as pb
    cells, shared = pb.shared_notes([{'i': 3, 'note': '숫자만'}, {'i': 5, 'note': '숫자만'}, {'i': 7, 'note': '이름'}])
    assert shared == ['칸 3 · 5: 숫자만'] and cells == [{'i': 3}, {'i': 5}, {'i': 7, 'note': '이름'}]


def test_fit_cuts_context_not_the_ask():
    from app.api.poc import prompt_budget as pb
    built = pb.fit(lambda level: ('자료 ' * (2000 // (level + 1))) + '\n쓸 칸: [1,2]')
    assert len(built) <= pb.HARD_CHARS and built.endswith('쓸 칸: [1,2]')


def test_fan_out_keeps_order_returns_errors_and_raises_cancellation():
    from app.api.poc import prompt_budget as pb

    def fn(x):
        if x == 2:
            raise ValueError('bad')
        return x * 10
    out = pb.fan_out(fn, [1, 2, 3])
    assert [j for j, _, _ in out] == [1, 2, 3] and [r for _, r, _ in out] == [10, None, 30] and isinstance(out[1][2], ValueError)

    class JobCancelled(Exception):
        pass

    def cancel(x):
        raise JobCancelled()
    with pytest.raises(JobCancelled):
        pb.fan_out(cancel, [1, 2])


# ---------------------------------------------------------------- every layout
@pytest.fixture(scope='module')
def env():
    if not LIBRARY.exists():
        pytest.skip('composer library not built')
    os.environ.setdefault('WM_COMPOSER_DATA', str(LIBRARY.parent))
    from app.api.poc.adapters import compose
    from admin.composition_layouts import inventory
    auto = compose._auto(grounded=True)
    catalog, metas, html = inventory(ROOT)
    listed = {m['f'] for m in catalog['layouts']}
    fs = [f for f, m in metas.items() if not (m.get('removed') or m.get('retired') or m.get('variantOf')) and (f in listed or m.get('compositionOnly'))]
    lib = auto.load()
    names = {}
    for q, p in (lib.get('products_all') or {}).items():
        for n in (p.get('name'), p.get('model')):
            if n and len(n) >= 5:
                names[n] = ('product', q)
    for q, x in (lib.get('solutions') or {}).items():
        if x.get('name') and len(x['name']) >= 4:
            names[x['name']] = ('solution', q)
    return auto, fs, names


def sheet(auto, f, names):
    """the layout's own content as a written sheet, the items it names selected, their full facts in the brief"""
    from app.api.poc import compose_grounding as g
    lib = auto.load()
    entry = (lib.get('layouts') or {}).get(f)
    if not entry:
        return None
    texts = {str(t['i']): t.get('text') or '' for t in entry['texts'] if not t.get('img')}
    whole = ' '.join(auto.plain(v) for v in texts.values())
    items = list(dict.fromkeys(it for n, it in sorted(names.items(), key=lambda kv: -len(kv[0])) if n in whole))[:6]
    products = [q for k, q in items if k == 'product'] or ['qm55c']
    solutions = [q for k, q in items if k == 'solution'] or ['magicinfo']
    facts = {f'product:{q}': {'kind': 'product', 'id': q, 'name': q, 'text': auto.product_fact(q, full=True)} for q in products}
    facts.update({f'solution:{q}': {'kind': 'solution', 'id': q, 'name': q, 'text': auto.solution_knowledge(q, 20)} for q in solutions})
    reqs = [{'id': f'R{n}', 'kind': 'need', 'text': '고객이 매장 운영에서 겪는 불편을 길게 설명한 요구 문장입니다 ' * 3, 'deliverable': '답할 것 ' * 10} for n in range(1, 7)]
    sl = {'f': f, 'kind': 'generic', 'bind': {'products': products, 'solutions': solutions}, 't': dict(texts), 'ex_t': dict(texts),
          'focus': {'points': ['R1', 'R2', 'R3', 'R4'], 'products': products, 'solutions': solutions}, 'directive': '방향 메모 ' * 20}
    geo = {str(t['i']): t for t in entry['texts']}
    asks = [{'i': int(k), 'max': g.slot_budget(geo[k], {'i': int(k)}), 'note': '이 칸은 이 고객이 고른 것의 이름 하나를 그대로 — 바꾸지 않음'}
            for k in texts if k.isdigit()]
    ctx = {'customer': '테스트 고객', 'title': '매장 운영 개선 과제', 'products': products, 'solutions': solutions, 'short': {}, 'space_by_id': {}, 'spaces': [],
           'layout_inputs': {}, 'summary': '요약 ' * 400, 'cases': []}
    pp = {'message': '파트 메시지 ' * 20, 'brief': {'requirements': reqs, 'facts': facts}, 'extra_layouts': []}
    return ctx, pp, sl, asks


def test_every_layouts_writing_and_checking_calls_stay_in_budget(env):
    from app.api.poc import prompt_budget as pb, sheet_check, sheet_writer
    auto, fs, names = env
    worst = {'write': (0, ''), 'check': (0, '')}
    n = 0
    for f in fs:
        got = sheet(auto, f, names)
        if not got or not got[3]:
            continue
        ctx, pp, sl, asks = got
        n += 1
        slides = [sl]
        chunks = sheet_writer.chunks_for(auto, sl, asks)
        assert sorted(x['i'] for c in chunks for x in c) == sorted(x['i'] for x in asks), f
        for chunk in chunks:
            assert len(chunk) <= pb.WRITE_CELLS, f
            p = sheet_writer.chunk_prompt(auto, ctx, {}, {'name': '파트'}, pp, slides, 0, chunk, {0: {}})
            assert len(p) <= pb.HARD_CHARS, (f, len(p))
            assert all(f'"i":{x["i"]},' in p for x in chunk), f   # the cells asked are never cut
            worst['write'] = max(worst['write'], (len(p), f))
        editable = {x['i']: x for x in asks}
        for group in sheet_writer.chunks_for(auto, sl, [{'i': i} for i in editable], pb.CHECK_CELLS):
            assert len(group) <= pb.CHECK_CELLS, f
            cells = sheet_check._cells(auto, sl, [x['i'] for x in group], editable)
            p = sheet_check.chunk_prompt(auto, ctx, {'name': '파트'}, pp, sl, cells, pp['brief']['requirements'][:4])
            assert len(p) <= pb.HARD_CHARS, (f, len(p))
            worst['check'] = max(worst['check'], (len(p), f))
    assert n >= 300, n
    print('worst', worst)


def test_the_final_check_reads_each_card_in_budget(env):
    from app.api.poc import layout_final as lf, prompt_budget as pb
    auto, fs, names = env
    for f in fs[::3]:
        got = sheet(auto, f, names)
        if not got or not got[3]:
            continue
        ctx, pp, sl, asks = got
        ctx = {**ctx, 'unlinked_hard': None}
        view, _ = lf.observe(auto, ctx, {}, sl, asks)
        for chunk in lf.chunks(view):
            assert len(chunk['cells']) <= pb.CHECK_CELLS, f
            p = lf._prompt(auto, ctx, view, chunk, [], [], '', True, 0)
            assert len(p) <= pb.HARD_CHARS, (f, len(p))
