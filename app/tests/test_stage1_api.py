from __future__ import annotations
import json
from pathlib import Path
import unittest
from dataclasses import replace
from fastapi.testclient import TestClient
from app.api.main import app

ROOT=Path(__file__).resolve().parents[2]


class LocalContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.auth_previous=app.state.auth.reconfigure(replace(app.state.auth.config,enabled=False))
        cls.context=TestClient(app)
        cls.client=cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None,None,None)
        app.state.auth.reconfigure(cls.auth_previous)

    def test_bootstrap_and_product_projection(self):
        catalog=json.loads((ROOT/'app/data/catalog.json').read_text())
        products=json.loads((ROOT/'app/data/products_db.json').read_text())
        boot=self.client.get('/api/bootstrap').json()
        self.assertEqual(boot['catalog'],catalog)
        self.assertEqual(boot['products'],products)
        expected=[dict(p,**products['curated'].get(p['id'],{}),cur=True)for p in catalog['products']]+products['products']
        response=self.client.get('/api/products').json()
        self.assertEqual(len(response['items']),1068)
        self.assertEqual(response['items'],expected)

    def test_database_detail_packs_match_published_data(self):
        for path in sorted((ROOT/'reference/live/img/prod').glob('d[0-9][0-9].json')):
            with self.subTest(pack=path.stem):
                response=self.client.get('/api/product-packs/'+str(int(path.stem[1:])))
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.json(),json.loads(path.read_text()))

    def test_ranges_and_full_pack_are_both_supported(self):
        path=ROOT/'reference/live/img/media/t.json'
        response=self.client.get('/img/media/t.json',headers={'Range':'bytes=12-111'})
        self.assertEqual(response.status_code,206)
        self.assertEqual(response.content,path.read_bytes()[12:112])
        self.assertEqual(response.headers['content-range'],f'bytes 12-111/{path.stat().st_size}')
        full=self.client.get('/img/media/t.json')
        self.assertEqual(full.status_code,200)
        self.assertEqual(full.content,path.read_bytes())

    def test_dummy_mode_cannot_claim_model_execution(self):
        result=self.client.post('/api/llm',json={'kind':'json','prompt':'Return a small object.'}).json()
        self.assertEqual(result['mode'],'dummy')
        self.assertEqual(result['error'],'unavailable')
        self.assertNotIn('data',result)

    def test_published_reference_is_unmodified(self):
        response=self.client.get('/reference/')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.content,(ROOT/'reference/live/index.html').read_bytes())

    def test_local_fonts_and_pdf_runtime(self):
        for path in ['/fonts/fonts.css','/lib/pdf.min.js','/lib/pdf.worker.min.js','/lib/pdf-cmaps-ko.js']:
            self.assertEqual(self.client.get(path).status_code,200,path)

    def test_missing_data_is_a_clear_not_found(self):
        self.assertEqual(self.client.get('/api/products/not-a-product').status_code,404)
        self.assertEqual(self.client.get('/api/product-packs/9999').status_code,404)


if __name__=='__main__':unittest.main()
