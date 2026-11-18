"""최종 점검 · ReAct (app/api/poc/layout_final.py) — the last step of every layout flow, with a fake LLM and a fake decision model:
the code observes (matching · duplicates · the layout's form), the reasoning (LLM with tools, or the decision model + an LLM writer
for flagged cells only) acts, and the code observes again; locked cells and fixes that bring in an unselected item never land.
  app/.venv/bin/python -m pytest app/tests/test_layout_final.py -q
"""
import copy
import json
import os
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
LIBRARY = ROOT / 'app' / 'data' / 'runtime' / 'composer' / 'library.json'
pytestmark = pytest.mark.skipif(not LIBRARY.exists(), reason='composer library not built')
F = 'L_VP_G'   # product cards · sentences · photos (benchmark: every injected error kind applies)
PRODUCTS, SOLUTIONS = ['qm55c', 'qm43c', 'kiosk'], ['stpro', 'smartthings', 'magicinfo']
LONG = '현장 운영 담당자가 매일 확인해야 하는 정보를 한 화면에서 빠르게 볼 수 있도록 구성해 업무 부담을 줄입니다'


class FakeDecision:
    def __init__(self, pick=None):
        self.pick, self.asked = pick or (lambda qid: 'ok'), []

    def ask(self, stage, state, questions):
        self.asked.append((stage, questions))
        self.state = state
        out = {}
        for qid, q in questions.items():
            keys = list(q['criteria'])
            k = self.pick(qid) or 'ok'
            out[qid] = {'type': 'choice', 'choice': k, 'confidence': 0.9, 'probabilities': {x: (0.9 if x == k else 0.1 / (len(keys) - 1)) for x in keys}}
        return out


class FakeLLM:
    """answers by stage from ``script[stage]`` — a list of replies (dicts or callables of the prompt), in order — or, given
    ``by``, by the prompt: ``by(stage, prompt)`` (the final check reads a sheet card by card at once: order is not fixed)"""
    def __init__(self, by=None, **script):
        self.script, self.calls, self.by = {k: list(v) for k, v in script.items()}, [], by
        import threading
        self.lock = threading.Lock()

    def json(self, stage, prompt, schema=None, validate=None, **kw):
        with self.lock:
            self.calls.append((stage, prompt))
            if self.by is not None:
                return copy.deepcopy(self.by(stage, prompt))
            reply = self.script[stage].pop(0) if self.script.get(stage) else {}
        return reply(prompt) if callable(reply) else copy.deepcopy(reply)


@pytest.fixture(scope='module')
def auto():
    os.environ.setdefault('WM_COMPOSER_DATA', str(LIBRARY.parent))
    from app.api.poc.adapters import compose
    return compose._auto(grounded=True)


def make(auto, f=F, products=PRODUCTS, solutions=SOLUTIONS):
    """the layout's own content as a finished sheet (appropriate by definition): ctx · part · sl · editable"""
    from app.api.poc import compose_grounding as g
    lib = auto.load()
    entry = lib['layouts'][f]
    texts = {str(t['i']): t.get('text') or '' for t in entry['texts'] if not t.get('img')}
    imgs = {str(x['i']): {'src': x['sample'], 'keep': True, 'fit': x.get('fit') or 'cover'} for x in entry.get('images') or [] if x.get('sample')}
    pr = {'customer': '테스트 고객', 'title': f, 'ind': 'RT', 'free_text': f, 'products': products, 'solutions': solutions, 'cases': []}
    part = {'id': 'p1', 'name': f, 'type': 'free', 'goal': '', 'exemplar': [{'f': f, 'role': f, 't': dict(texts), 'img': dict(imgs)}]}
    ctx = auto.build_context(pr, {'parts': [part], 'template': {'vertical': ''}})
    sl = auto._mk(ctx['parts'][0]['exemplar'][0], fixed=False, bind={'products': products, 'solutions': solutions}, bind_same=False)
    sl['t'], sl['img'], sl['img_meta'] = dict(texts), copy.deepcopy(imgs), {}
    from composer import pictures   # what the picture stage records: a product cut is that product's picture
    IM = pictures.load()['images']
    for k, v in imgs.items():
        if (IM.get(pictures.norm_src(v['src'])) or {}).get('cls') == 'product':
            pid = next((q for q in products if pictures.is_cut_of(v, q)), None)
            sl['img_meta'][k] = {'kind': 'product', **({'product': pid} if pid else {})}
    geo = {str(t['i']): t for t in entry['texts']}
    editable = [{'i': int(k), 'max': g.slot_budget(geo[k], {'i': int(k)})} for k in texts if k.isdigit() and int(k) > 3]
    for key in ('unlinked_hard', 'unlinked_said_hard'):   # the layout's own product words count as this customer's
        voc = ctx[key]
        kept = type(voc)([x for x in voc if not any(w in ' '.join(texts.values()) for w in x[1])])
        kept.rx = None
        ctx[key] = kept
    return {'ctx': ctx, 'part': ctx['parts'][0], 'sl': sl, 'editable': editable, 'texts': texts}


@pytest.fixture()
def sheet(auto):
    return make(auto)


def cells_of(auto, s, form=None, min_len=0):
    from app.api.poc import layout_final as lf
    sheet, _ = lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])
    return sorted((k for k, c in sheet['cells'].items() if c['editable'] and (form is None or c['form'] == form) and len(c['value']) >= min_len),
                  key=int)


def keyed_cells(auto, s, min_len=0):
    """written cells of a metadata group that has one item (not its key cell): where the decision model is asked about the item"""
    from app.api.poc import layout_final as lf
    sheet, _ = lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])
    out = []
    for u in sheet['units']:
        if u.get('key') and u['entity'] not in ('list', 'matrix') and (sheet['cells'].get(u['key']) or {}).get('value'):
            out += [k for k in u['cells'] if k != u['key'] and k in sheet['cells'] and sheet['cells'][k]['editable']
                    and len(sheet['cells'][k]['value']) >= min_len]
    return sorted(set(out), key=int)


def found(findings, kind, cell=None, img=None):
    return [f for f in findings if f['kind'] == kind and (cell is None or cell in f['cells']) and (img is None or f.get('img') == img)]


# ---------------------------------------------------------------- the layout's form (not its wording)
def test_form_is_judged_against_the_layout_content_not_its_words():
    from app.api.poc import layout_final as lf
    assert lf.form_of('') == 'empty' and lf.form_of('●●○') == 'symbol' and lf.form_of('35%') == 'number'
    assert lf.form_of('매장 운영 효율') == 'label' and lf.form_of('고객이 매장에서 상품 정보를 바로 확인합니다') == 'sentence'
    assert lf.form_issue('AI 절전', '다른 고객의 다른 말', '') is None                      # different words, same form: fine
    assert lf.form_issue('AI 절전', LONG, '')[0] == 'length'                                # a label grown into a sentence
    assert lf.form_issue('35%', '도입 효과를 확인', '')[0] == 'type'                         # a number cell without a number
    assert lf.form_issue('고객이 매장에서 상품 정보를 바로 확인하고 직원 호출 없이 결제합니다', '확인', '')[0] == 'length'
    assert lf.form_issue('매장 운영 효율', '', '')[0] == 'empty'
    assert lf.form_issue('매장 운영 효율', '', '확인된 수치 — 없으면 빈칸') is None             # the cell's job allows empty
    assert lf.form_of('OH55C') == 'code' and lf.form_issue('OH55C', 'SmartThings Pro', '') is None   # a model code is a name, not a figure
    assert lf.form_issue('35%', '—', '') is None                                            # '—': no figure, the layouts' own convention


def test_name_cells_are_told_by_their_role():
    from app.api.poc import layout_final as lf
    assert lf.name_cell('제품 이름 그대로') and lf.name_cell('솔루션 1 — 선택 솔루션 이름') and lf.name_cell('카드 제목 — 제품 이름')
    assert not lf.name_cell('1행 대응 기능 — 선택 솔루션의 기능 이름')   # a function's name, not an item's
    assert not lf.name_cell('카드 설명 — 제품이 하는 일 한 문장')


# ---------------------------------------------------------------- observe
def test_the_layouts_own_content_passes_and_injected_errors_are_found(auto, sheet):
    from app.api.poc import layout_final as lf
    s = sheet
    base = lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])[1]
    assert not [f for f in base if f['kind'] in ('duplicate', 'form', 'mismatch')], base
    sentences = cells_of(auto, s, min_len=12)
    a, b = sentences[0], sentences[1]
    labels = cells_of(auto, s, form='label')
    s['sl']['t'][b] = s['sl']['t'][a]                                  # the same sentence twice
    s['sl']['t'][labels[0]] = LONG                                     # a label cell holding a sentence
    photos = [k for k in s['sl']['img'] if k.isdigit()]
    s['sl']['img'][photos[1]] = dict(s['sl']['img'][photos[0]])        # the same picture twice
    other = next(p['name'] for q, p in sorted(auto.load()['products_all'].items()) if q not in PRODUCTS and p.get('name') and ' ' in p['name']
                 and any(ch.isdigit() for ch in p['name']))
    s['ctx']['unlinked_hard'] = auto.unlinked_vocab(s['ctx'], topics=False)
    s['sl']['t'][sentences[2]] = s['sl']['t'][sentences[2]].rstrip('.') + ' · ' + other   # an unselected product named
    got = lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])[1]
    assert found(got, 'duplicate', b) and found(got, 'form', labels[0]) and found(got, 'duplicate', img=photos[1])
    assert found(got, 'unselected', sentences[2])


def test_cards_whose_names_were_swapped_are_a_mismatch(auto):
    """two item cards trade their name cells: each card's marker · picture now speaks of the other card's item"""
    from app.api.poc import layout_final as lf
    s = make(auto, 'L_PH_VP_U', ['qm55c', 'kiosk'], ['stpro', 'smartthings', 'magicinfo'])
    sh, base = lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])
    assert not found(base, 'mismatch')
    heads = []
    for u in sh['units']:
        k = next((k for k in u['cells'] if k in sh['cells'] and lf.name_cell(sh['cells'][k]['role']) and sh['cells'][k]['value']), None)
        if u['entity'] in lf.ITEM_CARDS and k:
            heads.append((k, u['cells']))
    (ka, ua), (kb, ub) = heads[:2]
    s['sl']['t'][ka], s['sl']['t'][kb] = s['sl']['t'][kb], s['sl']['t'][ka]
    got = lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])[1]
    hits = [f for f in found(got, 'mismatch') if set(f['cells']) & {ka, kb}]
    assert hits and all(f['sub'] == 'image' for f in hits)   # (the cards' words do not name items here: the pictures tell)
    out = lf.check_sheet(auto, s['ctx'], s['part'], s['sl'], s['editable'], FakeLLM(), FakeDecision())
    assert any(x['act'] == 'image' for st in out['trace'] if st['step'] == 'act' for x in st['done'])   # re-pointed by the code
    assert not found(out['remaining'], 'mismatch')


def test_a_product_card_may_say_the_solution_it_runs_but_not_another_product(auto):
    from app.api.poc import layout_final as lf
    s = make(auto, 'L_PH_VP_U', ['qm55c', 'kiosk'], ['stpro', 'smartthings', 'magicinfo'])
    sh, _ = lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])
    u = next(u for u in sh['units'] if u['entity'] in lf.ITEM_CARDS)
    head = next(k for k in u['cells'] if k in sh['cells'] and lf.name_cell(sh['cells'][k]['role']))
    body = next(k for k in u['cells'] if k in sh['cells'] and sh['cells'][k]['editable'] and not lf.name_cell(sh['cells'][k]['role'])
                and sh['cells'][k]['form'] in ('sentence', 'phrase'))
    s['sl']['t'][head] = 'QM55C'
    s['sl']['t'][body] = 'MagicINFO로 메뉴를 한 번에 바꿉니다'
    assert not found(lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])[1], 'mismatch', body)
    s['sl']['t'][body] = 'KM24C로 셀프 주문을 받습니다'
    assert found(lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])[1], 'mismatch', body)


# ---------------------------------------------------------------- the ReAct loop
def test_decision_branch_asks_the_llm_only_for_flagged_cells(auto, sheet):
    from app.api.poc import layout_final as lf
    s = sheet
    clean = FakeLLM()
    out = lf.check_sheet(auto, s['ctx'], s['part'], copy.deepcopy(s['sl']), s['editable'], clean, FakeDecision())
    assert out['branch'] == 'decision' and clean.calls == [] and out['status'] == 'clean'   # nothing found: no LLM call at all
    label = cells_of(auto, s, form='label')[0]
    s['sl']['t'][label] = LONG
    llm = FakeLLM(auto_final_fix=[lambda p: {'items': [{'i': int(label), 'v': '운영 효율'}]}])
    dec = FakeDecision()
    out = lf.check_sheet(auto, s['ctx'], s['part'], s['sl'], s['editable'], llm, dec)
    assert [c[0] for c in llm.calls] == ['auto_final_fix'] and f'"i":{label}' in llm.calls[0][1]
    assert s['sl']['t'][label] == '운영 효율' and out['status'] == 'fixed' and not out['remaining']
    assert dec.asked and all(q.startswith('cell:') for q in dec.asked[0][1])               # cells only — pictures are the code's
    assert [x['step'] for x in out['trace']][:3] == ['observe', 'act', 'observe']


def test_decision_findings_below_the_threshold_are_not_acted_on(auto, sheet):
    from app.api.poc import layout_final as lf
    s = sheet
    k = keyed_cells(auto, s, min_len=12)[0]
    weak = FakeDecision(pick=lambda qid: 'mismatch' if qid == f'cell:{k}' else 'ok')
    weak_ask = weak.ask
    weak.ask = lambda st, state, qs: {q: {**a, 'probabilities': {**a['probabilities'], 'mismatch': 0.4, 'ok': 0.35}} if q == f'cell:{k}' else a
                                      for q, a in weak_ask(st, state, qs).items()}
    llm = FakeLLM()
    out = lf.check_sheet(auto, s['ctx'], s['part'], s['sl'], s['editable'], llm, weak)
    assert llm.calls == [] and out['status'] == 'clean'
    sure = FakeDecision(pick=lambda qid: 'mismatch' if qid == f'cell:{k}' else 'ok')
    llm = FakeLLM(auto_final_fix=[{'items': []}])                                           # the writer declines: the cell stays
    before = s['sl']['t'][k]
    out = lf.check_sheet(auto, s['ctx'], s['part'], s['sl'], s['editable'], llm, sure)
    assert [c[0] for c in llm.calls] == ['auto_final_fix'] and s['sl']['t'][k] == before
    assert out['rounds'] == 1                                                              # a declined finding is not asked again


def test_the_decision_reads_the_metadata_and_asks_the_item_only_where_a_group_has_one(auto, sheet):
    """the state is the layout's metadata + the first values (not the layout's own words); the item question goes to cells of
    a group with a key — a caption · a title is asked its job alone"""
    from app.api.poc import layout_final as lf
    s = sheet
    dec = FakeDecision()
    lf.check_sheet(auto, s['ctx'], s['part'], s['sl'], s['editable'], FakeLLM(), dec)
    stage, qs = dec.asked[0]
    sh, _ = lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])
    for k in keyed_cells(auto, s, min_len=12):                                                # a value's line names its value's cell
        key = next(u['key'] for u in sh['units'] if k in u['cells'])
        assert 'mismatch' in qs[f'cell:{k}']['criteria'] and f'칸 {key} “' in qs[f'cell:{k}']['instructions']
    assert set(qs['cell:15']['criteria']) == {'ok', 'other_job'}                              # the hero picture's caption
    state = dec.state if hasattr(dec, 'state') else None
    assert state is None or ('메타데이터' in state and '1차 값' in state)


def test_llm_branch_reads_the_sheet_calls_tools_then_acts(auto, sheet):
    from app.api.poc import layout_final as lf
    s = sheet
    a, b = cells_of(auto, s, min_len=12)[:2]
    s['sl']['t'][b] = s['sl']['t'][a]
    other = next(p['name'] for q, p in sorted(auto.load()['products_all'].items()) if q not in PRODUCTS and p.get('name') and ' ' in p['name']
                 and any(ch.isdigit() for ch in p['name']))
    s['ctx']['unlinked_hard'] = auto.unlinked_vocab(s['ctx'], topics=False)
    def by(stage, prompt):
        if f'"i":{b},' not in prompt or 'auto_final_check' != stage:
            return {'thought': '더 없음', 'done': True}
        if '도구 결과' not in prompt:
            return {'thought': '칸 형식 확인', 'calls': [{'tool': 'template', 'query': b}]}
        if '회차' in prompt:
            return {'thought': '더 없음', 'done': True}
        return {'thought': '같은 말 — 다시 씀', 'fixes': [{'i': int(b), 'v': '매장 직원이 재고를 바로 확인합니다'}, {'i': int(a), 'v': f'{other} 로 안내합니다'}], 'done': True}
    llm = FakeLLM(by=by)
    out = lf.check_sheet(auto, s['ctx'], s['part'], s['sl'], s['editable'], llm, None)
    stages = [c[0] for c in llm.calls]
    asked_b = [p for st, p in llm.calls if f'"i":{b},' in p]
    assert set(stages) == {'auto_final_check'} and any('"layout_content"' in p for p in asked_b)   # the tool's observation
    assert s['sl']['t'][b] == '매장 직원이 재고를 바로 확인합니다'
    assert other not in s['sl']['t'][a]                                                     # a fix naming an unselected product never lands
    assert out['branch'] == 'llm' and any(x['step'] == 'reason' and x.get('calls') for x in out['trace'])
    assert not found(out['remaining'], 'duplicate', b)


def test_the_llm_reads_a_clean_sheet_once_and_locked_cells_never_change(auto, sheet):
    from app.api.poc import layout_final as lf
    s = sheet
    k = cells_of(auto, s, min_len=12)[0]
    s['sl']['lock'] = {k: s['sl']['t'][k]}
    llm = FakeLLM(by=lambda stage, prompt: {'thought': '고칠 것', 'fixes': [{'i': int(k), 'v': '바꾼 문구입니다 확인'}], 'done': True})
    out = lf.check_sheet(auto, s['ctx'], s['part'], s['sl'], s['editable'], llm, None)
    sheet, _ = lf.observe(auto, s['ctx'], s['part'], s['sl'], s['editable'])
    n = len(lf.chunks(sheet))
    assert n >= 2 and [c[0] for c in llm.calls] == ['auto_final_check'] * n   # every card read once, each in its own short call
    assert s['sl']['t'][k] == s['sl']['lock'][k] and out['status'] == 'clean'


def test_a_duplicate_picture_is_hidden_by_the_code(auto, sheet):
    from app.api.poc import layout_final as lf
    s = sheet
    photos = [k for k in s['sl']['img'] if k.isdigit()]
    s['sl']['img'][photos[1]] = dict(s['sl']['img'][photos[0]])
    out = lf.check_sheet(auto, s['ctx'], s['part'], s['sl'], s['editable'], FakeLLM(), FakeDecision())
    assert s['sl']['img'][photos[1]].get('hidden') and out['status'] == 'fixed'


def test_run_part_skips_fixed_pages_and_notes_what_remains(auto, sheet):
    from app.api.poc import layout_final as lf
    from app.api.poc.compose_grounding import fingerprint
    s = sheet
    fixed = {**copy.deepcopy(s['sl']), 'fixed': True}
    label = cells_of(auto, s, form='label')[0]
    s['sl']['t'][label] = LONG
    s['sl']['quality'] = {'status': 'ready', 'issues': [], 'textKey': fingerprint(s['sl']['t'])}
    llm = FakeLLM(auto_final_fix=[{'items': []}])                                           # declined: the finding remains
    res = lf.run_part(auto, s['ctx'], s['part'], [fixed, s['sl']], llm, {1: s['editable']}, lambda f: FakeDecision())
    assert res[0] is None and res[1]['status'] == 'remaining'
    q = s['sl']['quality']
    assert q['status'] == 'review' and any(x.startswith('최종 점검 · ') for x in q['issues'])
    assert lf.public(res[1])['steps'][0] == {'step': 'observe', 'n': 1}


# ---------------------------------------------------------------- every flow ends with it
def test_every_flow_ends_with_the_final_react_step():
    from app.api import layout_flows as flows
    assert flows.MODULES['final']['fixed'] and flows.MODULES['final']['react'] and 'final' in flows.REACT
    assert max(s['order'] for s in flows.MODULES.values()) == flows.MODULES['final']['order']
    for f in ('L_VP_G', 'L_TOC_BOM5', 'L_PH_SS_HT_A'):
        v = flows.flow_for(f)
        assert v['flow']['nodes'][-1]['module'] == 'final'
        stored = {'inputs': v['flow']['inputs'], 'nodes': [n for n in v['flow']['nodes'] if n['module'] != 'final']}   # saved before the step existed
        _, base = flows.base_for(f)
        again = flows.normalize(stored, base['kind'], flows.source_map(), base, flows.tool_map())
        assert again['nodes'][-1]['module'] == 'final'


def test_the_final_step_has_a_decision_branch_and_is_installed_last(auto):
    from app.api.poc import layout_decide
    from app.api.poc import settings as cfg
    assert 'layout.final' in layout_decide.TASKS and 'layout.final' in cfg.DECISION_TASKS
    v = layout_decide.view('L_VP_G', ['collect', 'write', 'verify', 'lock', 'final'], types.SimpleNamespace(decision_enabled=lambda t: True))
    assert v['final']['task'] == 'layout.final' and v['final']['active']
    assert auto._layout_flows and 'enforce_linked' in auto.enforce_linked.__qualname__


def test_the_composers_last_step_runs_the_check_and_the_output_carries_it(auto, sheet):
    """auto.enforce_linked (orchestrator → flows hook → part check) ends with the final check; _layout_out carries its summary"""
    s = sheet
    label = cells_of(auto, s, form='label')[0]
    s['sl']['t'][label] = LONG
    llm = FakeLLM(by=lambda stage, prompt: {'thought': '라벨 칸에 문장 — 줄임', 'fixes': [{'i': int(label), 'v': '운영 효율'}], 'done': True}
                  if f'"i":{label},' in prompt and '회차' not in prompt else {'thought': '없음', 'done': True})
    s['ctx']['_final'] = {s['part']['id']: (llm, {0: s['editable']})}
    auto.enforce_linked(s['ctx'], s['part'], [s['sl']])
    assert s['sl']['final_check']['status'] in ('fixed', 'fixed_remaining') and s['sl']['t'][label] == '운영 효율'
    out = auto._layout_out(s['sl'])
    assert out['final']['status'] == s['sl']['final_check']['status'] and out['final']['steps'][0]['step'] == 'observe'
    assert any(st['step'] == 'reason' for st in out['final']['steps']) and 'trace' not in out['final']


def test_a_failing_check_leaves_the_sheet_and_does_not_fail_the_part(auto, sheet, monkeypatch):
    from app.api.poc import layout_final as lf
    s = sheet
    before = dict(s['sl']['t'])
    monkeypatch.setattr(lf, 'observe', lambda *a, **k: (_ for _ in ()).throw(KeyError('broken')))
    res = lf.run_part(auto, s['ctx'], s['part'], [s['sl']], FakeLLM(), {0: s['editable']})
    assert res[0]['status'] == 'error' and 'KeyError' in res[0]['error'] and s['sl']['t'] == before
    assert lf.public(res[0])['status'] == 'error'
