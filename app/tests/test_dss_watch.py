"""DSS 소스 변경 점검(proddb/build/dss/watch.py) — 네트워크 없이 판정 규칙을 검증한다."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / 'proddb/build/dss'


def load(name):
    sys.path.insert(0, str(TOOLS))
    spec = importlib.util.spec_from_file_location('dss_' + name, TOOLS / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


watch, pagetext = load('watch'), load('pagetext')

LIST = '''<main>
<section id="tab1" class="tab_content is-active"><h2 class="title">2026년 11-12월호</h2><ul class="booklist">
<li><a href="./ecatalog5.php?Dir=364" data-catalog-dir="364"><img src="./catImage/364/s001.jpg" alt="비즈니스 종합"></a><p>비즈니스 종합</p></li></ul></section>
<section id="tab2" class="tab_content"><h2 class="title">2026년 11-12월호</h2><ul class="booklist"><li><a href="./ecatalog5.php?Dir=900" data-catalog-dir="900"><img alt="조달"></a><p>조달</p></li></ul></section>
<section id="tab4" class="tab_content"><ul class="booklist">
<li><a href="./ecatalog5.php?Dir=355" data-catalog-dir="355"><img alt="EHS 리플릿"></a><p>EHS  리플릿</p></li><li><a href="./ecatalog5.php?Dir=263" data-catalog-dir="263"><img alt="설치 가이드북"></a><p>설치 가이드북</p></li></ul></section>
<section id="tab6" class="tab_content"><ul class="booklist"><li><h2 class="item-title">AI 오피스</h2><a href="./ecatalog5.php?Dir=197" data-catalog-dir="197"><img alt="AI 오피스"></a><p>AI 오피스</p></li></ul></section>
</main>'''


def test_listing_reads_every_tab_shape():
    rows = watch.ecat_listing(LIST)
    assert rows == [['tab1', '2026년 11-12월호', '364', '비즈니스 종합'], ['tab2', '2026년 11-12월호', '900', '조달'], ['tab4', '', '355', 'EHS 리플릿'],
                    ['tab4', '', '263', '설치 가이드북'], ['tab6', '', '197', 'AI 오피스']]


def test_main_text_hash_ignores_menu_and_footer_changes():
    page = lambda promo, body: f'<html><header>메뉴 {promo}</header><nav>{promo}</nav><div>본문 {body}</div><footer>회사 {promo}</footer></html>'
    assert pagetext.hashes(page('행사 A', '기능 1'))[1] == pagetext.hashes(page('행사 B', '기능 1'))[1]
    assert pagetext.hashes(page('행사 A', '기능 1'))[0] != pagetext.hashes(page('행사 B', '기능 1'))[0]
    assert pagetext.hashes(page('행사 A', '기능 1'))[1] != pagetext.hashes(page('행사 A', '기능 2'))[1]
    sec = lambda promo, body: f'<a>{promo}</a><div>최근 본 제품은 30일간 보관됩니다</div><p>{body}</p><a>회사소개</a><a>{promo}</a>'
    assert pagetext.hashes(sec('A', '사양'))[1] == pagetext.hashes(sec('B', '사양'))[1] != pagetext.hashes(sec('A', '사양 변경'))[1]


@pytest.fixture
def ecat(tmp_path, monkeypatch):
    """DB 쪽: 364(정기 호) · 355 · 197 · 93(목록 밖 유지). 받은 시각은 2026-11-12."""
    (tmp_path / 'proddb/ecat/text').mkdir(parents=True)
    (tmp_path / 'proddb/dss').mkdir(parents=True)
    books = [['tab1', '2026년 11-12월호', '364', '비즈니스 종합'], ['tab4', 'B2B 품목카탈로그', '355', 'EHS  리플릿'], ['tab6', '업종별 제안', '197', 'AI 오피스'], ['tab4', 'B2B 품목카탈로그', '93', 'B2B LED조명']]
    (tmp_path / 'proddb/ecat/catalogs.json').write_text(json.dumps(books))
    for _, _, d, title in books:
        (tmp_path / f'proddb/ecat/text/{d}.json').write_text(json.dumps({'dir': d, 'pages': 2, 'docTitle': title, 'text': {'1': 'a', '2': 'b'}, 'fetchedAt': '2026-11-12T14:50:15+0900'}))
    (tmp_path / 'proddb/dss/watch-config.json').write_text(json.dumps({'ecat': {'exclude': {'263': '범위 밖'}, 'keepUnlisted': {'93': '목록 밖 유지'}}}))
    monkeypatch.setattr(watch, 'P', lambda *a: str(tmp_path.joinpath(*a)))
    monkeypatch.setattr(watch, 'CONFIG', lambda: json.loads((tmp_path / 'proddb/dss/watch-config.json').read_text()))
    live = {'list': LIST, 'viewer': {d: {'http': 200, 'exists': True, 'pages': 2, 'docTitle': t, 'error': ''} for _, _, d, t in books},
            'modified': {}}
    old = dt.datetime(2026, 11, 4, 5, 0, tzinfo=dt.timezone.utc)
    monkeypatch.setattr(watch, 'http', lambda url, **k: (200, url, {}, live['list'].encode()))
    # base: 권이 올라온 경로(기본 b2b) — 이 테스트는 b2b 권만 쓴다
    monkeypatch.setattr(watch, 'ecat_viewer', lambda d, base=None: live['viewer'].get(d, {'http': 200, 'exists': False, 'pages': 0, 'docTitle': '', 'error': ''}))
    monkeypatch.setattr(watch, 'ecat_file', lambda d, page, base=None: (page, 200, live['modified'].get((d, page), old), 'etag'))
    return live


run = lambda: watch.check_ecat('unused', lambda pct, text: None)


def test_ecat_same_when_list_pages_titles_and_files_match(ecat):
    r = run()
    assert r['status'] == 'same' and r['counts']['same'] == 4 and r['changes'] == [] and r['issue']['applied'] is True
    assert r['excluded'] == [{'dir': '263', 'title': '설치 가이드북', 'note': '범위 밖'}]  # 범위 밖 권은 새 권으로 세지 않는다
    assert '11-12월호' in r['summary'] and '적용됨' in r['summary']


def test_ecat_detects_page_file_modified_after_collection(ecat):
    ecat['modified'][('355', 2)] = dt.datetime(2026, 11, 14, 1, 0, tzinfo=dt.timezone.utc)
    r = run()
    changed = {c['dir']: c for c in r['changes']}
    assert r['status'] == 'changed' and list(changed) == ['355'] and changed['355']['modifiedPages'] == [2]
    assert changed['355']['why'] == ['받은 뒤에 바뀐 쪽 파일 1개']


def test_ecat_detects_new_issue_new_book_page_count_and_removed_book(ecat):
    ecat['list'] = LIST.replace('2026년 11-12월호</h2><ul class="booklist">\n<li><a href="./ecatalog5.php?Dir=364" data-catalog-dir="364">', '2027년 1-2월호</h2><ul class="booklist">\n<li><a href="./ecatalog5.php?Dir=370" data-catalog-dir="370">', 1)
    ecat['viewer']['370'] = {'http': 200, 'exists': True, 'pages': 120, 'docTitle': '비즈니스 종합 27년 1-2월호', 'error': ''}
    ecat['viewer']['197']['pages'] = 3
    ecat['viewer']['355'] = {'http': 200, 'exists': False, 'pages': 0, 'docTitle': '', 'error': ''}
    r = run()
    by = {c['dir']: c for c in r['changes']}
    assert r['status'] == 'changed' and r['issue']['applied'] is False
    assert by['370']['status'] == 'new' and by['370']['pages'] == 120
    assert by['364']['status'] == 'changed' and '목록에서 빠짐' in by['364']['why'][0]          # 지난 정기 호
    assert by['197']['why'] == ['쪽 수 2 → 3']
    assert by['355']['status'] == 'gone'
    assert '93' not in by                                                                   # 목록 밖 유지 권


def test_ecat_unreachable_book_is_partial_not_unchanged(ecat):
    ecat['viewer']['197'] = {'http': 0, 'exists': False, 'pages': 0, 'docTitle': '', 'error': 'timed out'}
    r = run()
    assert r['status'] == 'partial' and r['errors'][0]['dir'] == '197' and r['counts']['same'] == 3


def test_ecat_list_failure_is_failed(ecat, monkeypatch):
    monkeypatch.setattr(watch, 'http', lambda url, **k: (503, url, {}, b''))
    assert run()['status'] == 'failed'
    monkeypatch.setattr(watch, 'http', lambda url, **k: (200, url, {}, b'<html>maintenance</html>'))
    assert run()['status'] == 'failed'
