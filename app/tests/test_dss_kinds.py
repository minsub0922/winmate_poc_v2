"""DSS 종류 분류 (proddb/build/dss/classify.py) — 수집한 항목을 LLM 이 제품 · 솔루션 · 서비스 · 구독으로 나눈다.
모델은 부르지 않는다(가짜 판정자). 실제 데이터 파일은 바꾸지 않는다(임시 폴더).
  app/.venv/bin/python -m pytest app/tests/test_dss_kinds.py -q
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'proddb/build/dss'))
sys.path.insert(0, str(ROOT / 'proddb/build'))
import classify as C  # noqa: E402

ROWS = [
    {'id': 'sg_1', 'name': '전열교환기 천정카세트 ER-1234A', 'fam': '공조 · 에어컨', 'sc': '환기 솔루션', 'cat': '환기 솔루션'},
    {'id': 'sg_2', 'name': 'MagicINFO™', 'fam': '디스플레이', 'sc': '사이니지 솔루션', 'cat': '사이니지 솔루션'},
    {'id': 'ec_3', 'name': '모바일 보증연장 서비스', 'fam': '모바일 · PC', 'sc': '모바일 솔루션', 'cat': '모바일 솔루션'},
    {'id': 'ec_4', 'name': 'AI 구독 요금제 플랜', 'fam': '기타', 'sc': '기타', 'cat': '기타'},
]
DETAILS = {'sg_1': {'desc': '열회수 환기 장치', 'feats': [{'h': '천정형 설치'}]}, 'sg_2': {'desc': '사이니지 콘텐츠 관리 소프트웨어'},
           'ec_3': {'feats': [{'h': '기기 고장을 무상수리'}]}, 'ec_4': {'feats': [{'h': '월 이용료로 기기와 케어를 함께'}]}}
TRUTH = {'sg_1': 'device', 'sg_2': 'solution', 'ec_3': 'service', 'ec_4': 'subscription'}
SOLS = [{'id': 'magicinfo', 'name': 'MagicINFO', 'cat': '사이니지 CMS (설치형)'}, {'id': 'vxt', 'name': 'Samsung VXT', 'cat': '사이니지 CMS (클라우드)'}]


class FakeAsker:
    """batches → the truth (or ``wrong`` on the first pass), records every prompt"""
    model = 'fake-model'

    def __init__(self, wrong=None, same=None):
        self.wrong, self.same, self.batches, self.ones, self.same_asked = dict(wrong or {}), dict(same or {}), [], [], []
        self.calls, self.tokens = 0, [0, 0]

    def ask(self, batch, one=False):
        (self.ones if one else self.batches).append([dict(it) for it in batch])
        out = {}
        for it in batch:
            k = TRUTH[it['id']] if one or it['id'] not in self.wrong else self.wrong[it['id']]
            out[it['id']] = {'kind': k, 'conf': 'high', 'why': '테스트'}
        return out

    def ask_same(self, batch, sols):
        self.same_asked.append([it['id'] for it in batch])
        return {it['id']: self.same.get(it['id']) for it in batch}


def items():
    return C.items_of({'products': [dict(r) for r in ROWS]}, {}, DETAILS)


def test_items_carry_name_category_and_description_but_no_model_code():
    it = items()
    assert it['sg_1']['name'] == '전열교환기 천정카세트 모델' and '환기 솔루션' in it['sg_1']['cat'] and '열회수' in it['sg_1']['text']
    assert not any(re.search(r'[A-Z]{2}-\d{3,}', json.dumps({k: v for k, v in x.items() if k != '_row'}, ensure_ascii=False)) for x in it.values())
    assert C.uncode('IP65 방수 · USB-C 단자 · QM55C 3대') == 'IP65 방수 · USB-C 단자 · 모델 3대'


def test_the_model_decides_where_the_category_name_misleads_and_answers_are_reused():
    it = items()
    ask = FakeAsker(same={'sg_2': 'magicinfo'})
    out, review = C.classify(it, {}, {}, ask, 'kinds-t', DETAILS, sols=SOLS)
    assert {k: v['kind'] for k, v in out.items()} == TRUTH
    assert out['sg_1']['rule'] == 'solution' and out['sg_1']['kind'] == 'device'     # ('환기 솔루션' 아래 기기 — 규칙은 솔루션으로 읽었다)
    assert out['ec_3']['rule'] == 'solution' and out['ec_3']['kind'] == 'service'
    assert out['sg_2']['same'] == 'magicinfo' and 'same' not in out['sg_1']
    assert {x['id'] for b in ask.ones for x in b} == {'sg_1', 'ec_3', 'ec_4'}         # (지난 규칙과 다른 판정은 한 항목씩 다시 본다)
    assert not review
    # 같은 입력 · 같은 기준 → 모델을 부르지 않는다; 입력이 바뀐 행만
    again = FakeAsker()
    it2 = items()
    it2['sg_2']['text'] += ' · 새 기능'
    out2, _ = C.classify(it2, out, {}, again, 'kinds-t2', DETAILS, sols=SOLS)
    assert [x['id'] for b in again.batches for x in b] == ['sg_2'] and out2['sg_1'] == {**out['sg_1'], 'rule': out['sg_1']['rule']}


def test_a_second_look_that_disagrees_goes_to_review_and_people_decide_last():
    it = items()
    out, review = C.classify(it, {}, {}, FakeAsker(wrong={'sg_1': 'solution', 'ec_4': 'service'}), 'kinds-t', DETAILS, sols=SOLS)
    assert out['ec_4']['kind'] == 'subscription' and out['ec_4']['review'] and out['ec_4']['second_of'] == 'service'
    assert {x['id'] for x in review} == {'ec_4'}                                         # (sg_1: 첫 답이 규칙과 같아 다시 보지 않았다)
    manual = {'sg_1': {'kind': 'device', 'by': '관리자', 'why': '실내 설치 기기'}}
    out2, _ = C.classify(it, out, manual, FakeAsker(), 'kinds-t2', DETAILS, sols=SOLS)
    assert out2['sg_1']['kind'] == 'device' and out2['sg_1']['by'] == 'manual'


def test_without_a_model_the_rule_stands_and_is_listed_for_review():
    out, review = C.classify(items(), {}, {}, None, 'kinds-t', DETAILS, sols=SOLS)
    assert all(v['by'] == 'rule' for v in out.values()) and len(review) == 4


def test_applying_marks_rows_the_ledger_and_sqlite(tmp_path):
    out, _ = C.classify(items(), {}, {}, FakeAsker(same={'sg_2': 'magicinfo'}), 'kinds-t', DETAILS, sols=SOLS)
    db = tmp_path / 'products_db.json'
    db.write_text(json.dumps({'counts': {'total': 4}, 'curated': {}, 'products': [dict(r) for r in ROWS], 'dss': {'run': 'r0'}}, ensure_ascii=False, separators=(',', ':')))
    rep = C.apply_rows(db, out, {'model': 'fake-model', 'at': 'now', 'run': 'kinds-t'})
    raw = db.read_text()
    d = json.loads(raw)
    assert '\n' not in raw and {r['id']: r['dssKind'] for r in d['products']} == TRUTH and d['products'][1]['dssSame'] == 'magicinfo'
    assert d['dss']['run'] == 'r0' and d['dss']['kinds']['rows'] == {'device': 1, 'service': 1, 'solution': 1, 'subscription': 1}
    assert rep['rows_by_kind']['device'] == 1
    from subs_ledger import kind_of
    assert kind_of(d['products'][0]) == 'device' and kind_of({'sc': '환기 솔루션', 'cat': '환기 솔루션', 'name': 'x'}) == 'solution'
    ledger = tmp_path / 'ledger.json'
    ledger.write_text(json.dumps({'runs': [], 'items': {f'product:{r["id"]}': {'kind': kind_of({k: r[k] for k in ('sc', 'cat', 'name')}), 'registry': 'products_db.products',
                                                                              'id': r['id'], 'name': r['name'], 'status': 'active'} for r in ROWS}}, ensure_ascii=False))
    lr = C.apply_ledger(ledger, out, 'kinds-t', 'now')
    L = json.loads(ledger.read_text())
    assert lr['reclassified'] == 3 and L['runs'][-1]['scope'] == ['kinds'] and L['items']['product:sg_1']['kind'] == 'device'
    kinds = tmp_path / 'kinds.json'
    kinds.write_text(json.dumps({'items': out}, ensure_ascii=False))
    import dss_db
    con = sqlite3.connect(tmp_path / 'x.sqlite')
    con.execute('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)')
    dss_db.write_dss(con, str(ledger), str(kinds))
    assert {k: con.execute(f'SELECT COUNT(*) FROM dss_{k}').fetchone()[0] for k in ('device', 'solution', 'service', 'subscription')} == \
        {'device': 1, 'solution': 1, 'service': 1, 'subscription': 1}
    assert con.execute("SELECT why, by FROM dss_device WHERE id='sg_1'").fetchone() == ('테스트', 'llm')


@pytest.mark.skipif(not (ROOT / 'app/data/products_db.json').exists(), reason='no product DB')
def test_every_collected_row_is_an_item_and_a_batch_prompt_stays_short():
    db = json.load(open(ROOT / 'app/data/products_db.json', encoding='utf-8'))
    cat = json.load(open(ROOT / 'app/data/catalog.json', encoding='utf-8'))
    it = C.items_of(db, cat, C.load_details(ROOT / 'app/data/product-details'))
    assert len(it) == db['counts']['total']
    worst = max(len(C.SYSTEM) + sum(sorted(len(json.dumps({k: x[k] for k in ('id', 'name', 'cat', 'text')}, ensure_ascii=False)) for x in it.values())[-C.BATCH:]), 0)
    assert worst <= 4200, worst


LIBRARY = ROOT / 'app/data/runtime/composer/library.json'


@pytest.mark.skipif(not LIBRARY.exists(), reason='composer library not built')
def test_the_composer_takes_a_non_product_row_as_a_solution(monkeypatch):
    """a proposal that linked a service row (or a solution's sales unit) as a product: the composer puts it with the solutions"""
    import copy
    import os
    os.environ.setdefault('WM_COMPOSER_DATA', str(LIBRARY.parent))
    sys.path.insert(0, str(ROOT))
    from app.api.poc.adapters import compose
    auto = compose._auto(grounded=True)
    lib = copy.deepcopy(auto.load())   # (the app's composer is its own copy of composer/auto.py — patch that one)
    PA = lib['products_all']
    wash = next(k for k, p in PA.items() if p.get('name') == '전문세척')
    magic = next(k for k, p in PA.items() if str(p.get('name') or '').startswith('MagicINFO'))
    PA[wash] = {**PA[wash], 'dssKind': 'service'}
    PA[magic] = {**PA[magic], 'dssKind': 'solution', 'dssSame': 'magicinfo'}
    lib['solutions'][wash] = {'id': wash, 'name': '전문세척', 'cat': '서비스', 'kw': [], 'desc': '', 'with': [], 'ind': [], 'row': True}
    monkeypatch.setattr(auto, 'load', lambda *a, **k: lib)
    pr = {'customer': '고객', 'title': 't', 'ind': 'RT', 'free_text': 't', 'products': ['qm55c', wash, magic], 'solutions': ['vxt'], 'cases': []}
    part = {'id': 'p1', 'name': '제안', 'type': 'free', 'goal': '', 'exemplar': []}
    ctx = auto.build_context(pr, {'parts': [part], 'template': {'vertical': ''}})
    assert ctx['products'] == ['qm55c'] and ctx['solutions'] == ['vxt', wash, 'magicinfo']
