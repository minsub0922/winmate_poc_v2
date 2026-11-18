"""Real selected imports use a disposable repository. Other decisions and source files stay intact."""
import json

import pytest
from fastapi import HTTPException

from admin.config import ROOT
from admin.engine import EngineError
from admin.service import Service
from admin import source_imports
from admin.source_promotion import DB, KB, RUNTIME, publish_selection
from admin.source_reviews import SourceReviews
from admin.source_workspace import SourceWorkspace, file_hash
from admin.store import Store


def report(items, day=18, status='changed'):
    return {'checked_at':f'2026-11-{day:02d}T09:00:00+09:00','status':status,'changes':items}


def case_item(n,title):
    return {'id':str(n),'title':title,'url':f'https://www.samsung.com/sec/business/insights/case-study/test-{n}/',
            'date':'2026-11-18','status':'changed','why':['제목 변경']}


def mirror(tmp):
    workspace = SourceWorkspace(ROOT,tmp / 'input')
    for rel in [DB,RUNTIME]:
        workspace.link(rel)
    workspace.shallow(KB)
    return workspace.tree


def test_repeated_reviews_partial_runs_and_paging(tmp_path):
    reviews = SourceReviews(Store(tmp_path / 'admin'))
    items = [case_item(i,'사례 '+str(i)) for i in range(80)]
    reviews.record('media','cases',report(items))
    assert reviews.listing('media',offset=70)['total'] == 80
    assert len(reviews.listing('media',offset=70)['items']) == 10
    first, second = [r['id'] for r in reviews.listing('media')['items'][:2]]
    with reviews.store.db(immediate=True) as db:
        reviews.complete(db,{first:'ignore'},'media','담당자','a')
    reviews.record('media','cases',report(items,19))
    reviews.record('media','cases',report([items[2]],20,'partial'))
    assert reviews.counts()['media'] == {'ignored':1,'pending':79}
    items[1] = case_item(1,'다시 바뀐 사례')
    reviews.record('media','cases',report(items,21))
    reviews.record('media','cases',report([],19,'same'))
    with reviews.store.db() as db, pytest.raises(HTTPException) as err:
        reviews.selected(db,'media',{second:'apply'})
    assert err.value.status_code == 409
    assert reviews.listing('media',history=True)['total'] == 2
    assert reviews.listing('media')['total'] == 79


def test_apply_ignore_and_unselected_are_independent(tmp_path,monkeypatch):
    root = mirror(tmp_path)
    store_service = Service(tmp_path / 'state')
    origin = store_service.origins
    origin.root = root
    origin.reviews.root = root
    catalog_file = root / 'app/data/catalog.json'
    before = json.loads(catalog_file.read_text())['cases']
    items = [case_item(r['id'],r['title']+' 변경') for r in before[:3]]
    origin.reviews.record('media','cases',report(items))
    ids = {r['ref']:r['id'] for r in origin.reviews.listing('media')['items']}
    choices = {ids[items[0]['id']]:'apply',ids[items[1]['id']]:'ignore'}
    published = publish_selection(origin,'media',choices,'검토자','selection',lambda *a:None,lambda:False)
    assert published == {'applied':1,'ignored':1}
    after = json.loads(catalog_file.read_text())['cases']
    assert after[0]['title'] == items[0]['title'] and after[0]['needs'] == before[0]['needs']
    assert after[1:] == before[1:]
    assert origin.store.one('SELECT title FROM assets WHERE id=?',('case:'+items[0]['id'],))['title'] == items[0]['title']
    assert [c['title'] for c in json.loads((root / KB / 'catalog.json').read_text())['cases'][:3]] == [c['title'] for c in after[:3]]
    manifest = json.loads((root / KB / 'manifest.json').read_text())
    assert manifest['outputs']['catalog.json']['sha256'] == file_hash(root / KB / 'catalog.json')
    assert file_hash(root / KB / 'sheet_slots.json') == file_hash(ROOT / KB / 'sheet_slots.json')
    assert origin.reviews.listing('media')['total'] == 1
    assert {r['state'] for r in origin.reviews.listing('media',history=True)['items']} == {'applied','ignored'}
    assert json.loads((ROOT / 'app/data/catalog.json').read_text())['cases'][:3] == before[:3]
    # A process failure after replacing files but before committing the decisions must put all published files back.
    old_hash = file_hash(catalog_file)
    old_publish = SourceWorkspace.publish
    def interrupted(workspace):
        old_publish(workspace)
        raise EngineError('시험용 게시 중단')
    monkeypatch.setattr(SourceWorkspace,'publish',interrupted)
    with pytest.raises(EngineError,match='시험용'):
        publish_selection(origin,'media',{ids[items[2]['id']]:'apply'},'검토자','interrupted',lambda *a:None,lambda:False)
    assert file_hash(catalog_file) == old_hash
    assert origin.reviews.listing('media')['total'] == 1 and not origin.store.one('SELECT id FROM source_review_batches WHERE id=?',('interrupted',))
    store_service.close()


def test_only_selected_catalog_and_solution_are_imported(tmp_path,monkeypatch):
    w = SourceWorkspace(ROOT,tmp_path / 'selected')
    books = w.read(source_imports.BOOKS)
    old = books[0]
    doc = w.read('proddb/ecat/text/'+old[2]+'.json')
    url = 'https://samsung.aiibook.net/b2b/access/ecatalog5.php?Dir='+old[2]
    viewer = '<title>새 호</title><script>var cataPages = 2;</script><p>1페이지 내용 : 표지</p><p>2페이지 내용 : 변경된 본문</p>'
    monkeypatch.setattr(source_imports,'fetch',lambda u,**kw: {'url':u,'body':viewer.encode()})
    updated = source_imports.book(w,{'ref':old[2],'item':{'status':'changed','title':'선택한 권','url':url},
        'evidence':{'pages':2,'docTitle':'새 호','group':'다음 호'},'seen_at':'2026-11-18'},lambda:False)
    assert updated['payload']['text'] == {'1':'표지','2':'변경된 본문'}
    assert w.read(source_imports.BOOKS)[1:] == books[1:]
    assert json.loads((ROOT / 'proddb/ecat/text' / (old[2]+'.json')).read_text()) == doc
    u='https://vxt.samsung.com/'
    data={'status':200,'text':'승인한 원본 본문','title':'VXT','mainSha256':'hash','final':u}
    source_imports.solution(w,{'ref':u,'item':{'status':'changed','refs':['sol_urls:vxt|site']},'evidence':data,'seen_at':'2026-11-18'},lambda:False)
    assert w.read(source_imports.CATALOG)['sourcePages'][u]['text'] == data['text']
    assert w.read('proddb/dss/watch-state.json')['solutions'][u]['hash'] == 'hash'
