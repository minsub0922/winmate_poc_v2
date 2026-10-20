import copy
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.spatial import SpatialLibrary,SpatialStore,build_router

class SpatialPaginationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.library=SpatialLibrary()
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.store=SpatialStore(Path(self.tmp.name)/'history.sqlite',self.library)
        self.form={'version':1,'title':'페이지 테스트','industry':'OF','style':'modern','rooms':[]}
    def populate(self,owner,count):
        return [self.store.create_draft(owner,{'form':{**self.form,'title':f'초안 {i}'}})['id'] for i in range(count)]
    def test_decodes_only_requested_page_and_keeps_stable_ties(self):
        ids=self.populate('designer',25);self.populate('other',3)
        with self.store.connect() as db:db.execute('UPDATE scenes SET updated_at=100 WHERE owner=?',('designer',))
        expected=sorted(ids,reverse=True)
        with patch.object(self.store,'decode',wraps=self.store.decode) as decode:
            result=self.store.list_page('designer',2,8)
        self.assertEqual(decode.call_count,8)
        self.assertEqual([item['id'] for item in result['items']],expected[8:16])
        self.assertEqual({k:result[k] for k in ('total','page','page_size','total_pages')},{'total':25,'page':2,'page_size':8,'total_pages':4})
        all_ids=[item['id'] for page in range(1,5) for item in self.store.list_page('designer',page,8)['items']]
        self.assertEqual(all_ids,expected);self.assertEqual(len(set(all_ids)),25)
    def test_last_page_is_clamped_after_deletion(self):
        self.populate('designer',17);last=self.store.list_page('designer',3,8)
        self.assertEqual(len(last['items']),1);self.store.delete('designer',last['items'][0]['id'])
        result=self.store.list_page('designer',3,8)
        self.assertEqual((result['page'],result['total_pages'],result['total'],len(result['items'])),(2,2,16,8))
        self.assertEqual(self.store.list_page('designer',999999,8)['page'],2)
    def test_empty_owner_is_not_given_another_accounts_history(self):
        self.populate('other',2);result=self.store.list_page('nobody',4,8)
        self.assertEqual(result,{'items':[],'total':0,'page':1,'page_size':8,'total_pages':0})
    def test_migration_materializes_only_the_visible_page(self):
        import json
        form={**self.form,'templateId':'cowork-full-standard'}
        with self.store.connect() as db:
            for identifier,updated in [('legacy-new',2),('legacy-old',1)]:
                db.execute("INSERT INTO scenes(owner,id,title,scene,view,revision,created_at,updated_at,form,status) VALUES (?,?,?,'null','2d',1,0,?,?,'draft')",('designer',identifier,'템플릿 초안',updated,json.dumps(form)))
        first=self.store.list_page('designer',1,1);self.assertIsNotNone(first['items'][0]['preview'])
        with self.store.connect() as db:self.assertEqual(db.execute('SELECT scene FROM scenes WHERE id=?',('legacy-old',)).fetchone()[0],'null')
        second=self.store.list_page('designer',2,1);self.assertIsNotNone(second['items'][0]['preview'])
    def test_api_has_bounded_defaults_and_validates_page_arguments(self):
        self.populate('local-dev',17);app=FastAPI();app.state.spatial_library=self.library;app.state.spatial_store=self.store;app.state.auth=SimpleNamespace(config=SimpleNamespace(enabled=False));app.include_router(build_router());client=TestClient(app)
        result=client.get('/api/spatial/history?page=2&page_size=8');self.assertEqual(result.status_code,200);self.assertEqual(len(result.json()['items']),8);self.assertEqual(result.json()['total'],17);self.assertEqual(result.headers['cache-control'],'no-store')
        self.assertEqual(len(client.get('/api/spatial/history').json()['items']),12)
        for query in ('page=0','page=-1','page_size=0','page_size=49','page=bad'):
            with self.subTest(query=query):self.assertEqual(client.get('/api/spatial/history?'+query).status_code,422)
        for page,size in [(True,8),(1,False),(0,8),(1,49)]:
            with self.assertRaises(ValueError):self.store.list_page('local-dev',page,size)

if __name__=='__main__':unittest.main()
