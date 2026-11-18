"""레이아웃 메타데이터 (app/api/layout_meta.py) — the AI-fill cells and pictures of a layout, grouped by item: each group's key cell
names its item, and the group's cells and pictures speak of that item. No geometry in the output, but the grouping is made
sure with the sheet's own structure (document order · HTML nesting · boxes) and its own sample.
  app/.venv/bin/python -m pytest app/tests/test_layout_meta.py -q
"""
import json
import os
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
LIBRARY = ROOT / 'app' / 'data' / 'runtime' / 'composer' / 'library.json'
pytestmark = pytest.mark.skipif(not LIBRARY.exists(), reason='composer library not built')
CODE = re.compile(r'(?<![A-Za-z0-9])(?:QM|QH|QB|OH|KM|HG|LH|WM)\d{2,3}[A-Z0-9]{0,3}(?![A-Za-z0-9])')
BRAND = re.compile(r'MagicINFO|SmartThings|Samsung VXT|\bVXT\b|Knox|b\.IoT|LYNK|엑스커버\d|액티브\d|플립\d|폴드\d')


@pytest.fixture(scope='module')
def M():
    os.environ.setdefault('WM_COMPOSER_DATA', str(LIBRARY.parent))
    from app.api.poc.adapters import compose
    compose._auto(grounded=True)
    from app.api import layout_meta
    return layout_meta


def group_of(meta, cell=None, picture=None):
    for g in meta['groups']:
        if (cell is not None and any(c['i'] == cell for c in g['cells'])) or (picture is not None and any(p['slot'] == picture for p in g['pictures'])):
            return g
    return None


def test_a_product_card_keeps_its_picture_name_and_message_together(M):
    """보조 제품 n: its name cell is the key, its use line and its picture (the layout's own photo of that product) are with it"""
    m = M.view('L_VP_G')
    for name, line, pic in ((16, 17, '1'), (18, 19, '2')):
        g = group_of(m, cell=name)
        assert g['key'] == name and {c['i'] for c in g['cells']} >= {name, line}
        assert [p['slot'] for p in g['pictures']] == [pic] and g['pictures'][0]['shows'] == 'item'
    # the third value the element plan left out is still one block (its own number); the hero picture goes with its caption
    assert {c['i'] for c in group_of(m, cell=11)['cells']} == {11, 12, 13}
    assert [c['i'] for c in group_of(m, picture='0')['cells']] == [15]


def test_steps_in_one_row_are_told_apart_by_the_sheet_itself(M):
    """two steps the element plan saw as one row: each step's space anchors it; its device card and its saving line sit in its band"""
    m = M.view('L_KCP_S_LG')
    one, two = group_of(m, cell=15), group_of(m, cell=24)
    assert one is not two and (one['key'], two['key']) == (14, 23) and one.get('key_by') == 'fixed'
    assert 19 in {c['i'] for c in one['cells']} and '1' in {p['slot'] for p in one['pictures']}
    assert 28 in {c['i'] for c in two['cells']} and {'2', '3'} <= {p['slot'] for p in two['pictures']}


def test_a_count_is_not_an_ordinal_and_a_fixed_name_anchors_its_block(M):
    """'1장 세부 항목 2~3개' is chapter 1's (not 'item 2'); each chapter's fixed name is its key, its thumbnail is with it"""
    m = M.view('L_C10')
    chapters = [g for g in m['groups'] if re.fullmatch(r'\d장', g['label'])]
    assert len(chapters) == 6 and all(g.get('key_by') == 'fixed' for g in chapters)
    assert [len(g['pictures']) for g in chapters] == [1] * 6 and group_of(m, cell=7)['label'] == '1장'


def test_a_copied_name_stays_in_its_column(M):
    """'칸 20 이름 그대로' repeats a name (same), it is not about cell 20: the stage column keeps it"""
    m = M.view('L_PH_MI_RS_C')
    g = group_of(m, cell=31)
    assert g['key'] == 28 and next(c for c in g['cells'] if c['i'] == 31)['same'] == [20]


def test_the_sheets_own_picture_is_no_cards(M):
    """a picture a quarter of the sheet or more (a bird's-eye view · a full bleed) is not the first row's"""
    for f in ('L_VS_BIRD_S6', 'L_VS_DIV_R2'):
        m = M.view(f)
        assert '0' in [p['slot'] for p in m['pictures']] and not group_of(m, picture='0')


def test_no_product_code_or_solution_name_in_any_metadata(M):
    from app.api.poc.adapters import compose
    fs = sorted((compose._auto(grounded=True).load().get('layouts') or {}))
    bad = []
    for f in fs:
        m = M.view(f)
        assert not m.get('error'), (f, m.get('error'))
        text = json.dumps({k: m[k] for k in ('name', 'say', 'groups', 'frame', 'pictures') if k in m}, ensure_ascii=False)
        bad += [(f, x) for x in CODE.findall(text) + BRAND.findall(text)]
    assert not bad, bad[:10]


def test_a_hint_keeps_its_scene_and_specs_but_not_the_model(M):
    assert M.clean('작업 장갑을 낀 손에 쥔 엑스커버7 프로') == '작업 장갑을 낀 손에 쥔 제품'
    assert M.clean('IP65 방수 · QM55C 3대 · MagicINFO 화면') == 'IP65 방수 · 제품 3대 · 항목 화면'


def test_a_check_call_gets_only_its_cells(M):
    m = M.view('L_VP_G')
    b = M.prompt_block(m, ['16', '17'], ['1'])
    assert [g['label'] for g in b['groups']] == ['2열 · 보조 제품 1'] and {c['i'] for c in b['groups'][0]['cells']} == {16, 17}
    assert 'frame' not in b and [p['slot'] for p in b['groups'][0]['pictures']] == ['1']
