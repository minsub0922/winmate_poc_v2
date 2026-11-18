"""Sheet design code: export → (code agent edits) → upload check → compare → adopt / reset.

Every write uses a temporary live-registry file (WINMATE_LAYOUT_LIBRARY). No model is called.
"""
import json
import re

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from admin.layout_library import layout_library_router
from admin.composition_layouts import inventory
from admin.store import Store
from app.api import layout_library as live

F = 'L_TOC_PILOT'


@pytest.fixture
def http(tmp_path, monkeypatch):
    monkeypatch.setenv('WINMATE_LAYOUT_LIBRARY', str(tmp_path / 'live/layouts.json'))
    store = Store(tmp_path / 'admin')
    app = FastAPI()
    app.include_router(layout_library_router(lambda: store, lambda: 'tester'))
    return TestClient(app), store


def exported(client):
    response = client.get(f'/api/layout-library/{F}/design')
    assert response.status_code == 200, response.text
    assert response.headers['content-disposition'] == f'attachment; filename="{F}.design.html"'
    return response.text


def redesign(text):
    """What a code agent would do: restyle, keep every slot."""
    return text.replace('background: #f5f6f8', 'background: #eef3ff').replace('font-size: 30px', 'font-size: 34px')


def test_export_is_the_sheet_with_rules(http):
    client, _ = http
    text = exported(client)
    base = inventory(live.ROOT)[2][F]
    assert f'data-winmate-sheet="{F}"' in text and base in text
    assert 'data-tb' in text and '글 17개' in text and 'Code agent:' in text
    html, report = live.design_check(text, base)
    assert html == base and report['same'] and report['slots'] == {'t': 17, 'img': 0}


def test_check_compares_and_adopt_reaches_app_and_composer(http):
    from app.api.poc import knowledge
    client, store = http
    text = redesign(exported(client))
    check = client.post(f'/api/layout-library/{F}/design/check', json={'html': text})
    assert check.status_code == 200, check.text
    value = check.json()
    assert not value['report']['same'] and value['report']['warnings'] == []
    assert '#eef3ff' in value['upload'] and '#eef3ff' not in value['current']
    assert "script-src 'none'" in value['upload']
    assert client.put(f'/api/layout-library/{F}/design', json={'html': text, 'rev': 0}).status_code == 422  # not confirmed
    adopted = client.put(f'/api/layout-library/{F}/design', json={'html': text, 'rev': 0, 'confirmed': True, 'name': 'pilot.design.html'})
    assert adopted.status_code == 200, adopted.text
    detail = adopted.json()
    assert detail['design']['version'] == value['report']['version'] and detail['design']['updated_by'] == 'tester'
    assert 'design' not in detail['edits'] and '#eef3ff' in detail['html']
    assert store.one("SELECT actor FROM events WHERE action='layout-library.design'")['actor'] == 'tester'
    # the app document (/api/layout-library) and the composer's KB bundle use the adopted design
    assert '#eef3ff' in live.public()['items'][F]['design']['html']
    assert '#eef3ff' in knowledge.bundle().html[F]
    # a later text / policy save keeps the design
    saved = client.put('/api/layout-library/' + F, json={'rev': 1, 'confirmed': True, 'meta': {}, 't': {'1': '디자인 위에 고친 제목'}, 'img': {}, 'modes': {}, 'fill': 'inherit'})
    assert saved.status_code == 200, saved.text
    assert '#eef3ff' in saved.json()['html'] and '디자인 위에 고친 제목' in saved.json()['html']
    # export now gives the adopted design; reset goes back to the base design but keeps the text edit
    assert '#eef3ff' in exported(client)
    reset = client.request('DELETE', f'/api/layout-library/{F}/design', json={'rev': 2, 'confirmed': True})
    assert reset.status_code == 200, reset.text
    assert reset.json()['design'] is None and '#eef3ff' not in reset.json()['html'] and '디자인 위에 고친 제목' in reset.json()['html']


def test_policy_marks_follow_the_base_sheet(http):
    client, _ = http
    text = exported(client)
    stripped = re.sub(r'\sdata-fix="[^"]*"', '', text)
    html, _ = live.design_check(stripped, inventory(live.ROOT)[2][F])
    assert [s['mode'] for s in live.slots(html)] == [s['mode'] for s in live.slots(inventory(live.ROOT)[2][F])]


@pytest.mark.parametrize('edit, message', [
    (lambda t: t.replace('data-tb="3"', 'data-tb="40"', 1), '없어진 칸: 글 3'),
    (lambda t: t.replace('data-tb="3"', 'data-tb="2"', 1), '새로 생긴(또는 복제된) 칸: 글 2'),
    (lambda t: t.replace('data-tb="1">', 'data-tb="1" onclick="steal()">', 1), 'onclick='),
    (lambda t: t.replace('</div>\n</body>', '<script>alert(1)</script></div>\n</body>'), '<script>'),
    (lambda t: t.replace('data-tb="1">', 'data-tb="1"><style>*{color:red}</style>', 1), '<style>'),
    (lambda t: t.replace('width: 1280px; height: 720px', 'width: 1000px; height: 720px', 1), 'width:1280px'),
    (lambda t: t.replace('</div>\n</body>', '<div>두 번째 시트</div></div>\n</body>'), '최상위 요소는 하나'),
    (lambda t: t.replace('data-tb="1">', 'data-tb="1"><a href="javascript:steal()">x</a>', 1), 'javascript'),
])
def test_bad_uploads_are_rejected_with_the_reason(http, edit, message):
    client, _ = http
    response = client.post(f'/api/layout-library/{F}/design/check', json={'html': edit(exported(client))})
    assert response.status_code == 422 and message in response.json()['detail'], response.text
    assert client.put(f'/api/layout-library/{F}/design', json={'html': edit(exported(client)), 'rev': 0, 'confirmed': True}).status_code == 422
    assert live.load()['items'] == {}


def test_stale_export_and_conflicts(http):
    client, _ = http
    first = redesign(exported(client))
    assert client.put(f'/api/layout-library/{F}/design', json={'html': first, 'rev': 0, 'confirmed': True}).status_code == 200
    # a file exported before that adoption is still checkable, with a warning
    old = live.design_export(F, 'x', inventory(live.ROOT)[2][F])
    report = client.post(f'/api/layout-library/{F}/design/check', json={'html': old.replace('font-size: 30px', 'font-size: 31px')}).json()['report']
    assert any('디자인이 바뀌었습니다' in w for w in report['warnings'])
    assert client.put(f'/api/layout-library/{F}/design', json={'html': old, 'rev': 0, 'confirmed': True}).status_code == 409
    assert client.request('DELETE', '/api/layout-library/L_C01/design', json={'rev': 1, 'confirmed': True}).status_code == 409
