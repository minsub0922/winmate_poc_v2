from __future__ import annotations
import json
import hashlib
import tempfile
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
        import app.api.main as main_module
        from app.api.poc import settings as cfg,provider as prov,service
        cls.previous_settings=cfg._SETTINGS;cls.previous_override=dict(prov._OVERRIDE)
        cfg._SETTINGS=cfg.load_settings({},[]);prov.set_provider_override(clear=True)
        initializer=main_module.initialize_poc
        main_module.initialize_poc=lambda:service.initialize(require_provider=False)
        cls.context=TestClient(app)
        try:cls.client=cls.context.__enter__()
        finally:main_module.initialize_poc=initializer

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None,None,None)
        app.state.auth.reconfigure(cls.auth_previous)
        from app.api.poc import settings as cfg,provider as prov
        cfg._SETTINGS=cls.previous_settings;prov._OVERRIDE.clear();prov._OVERRIDE.update(cls.previous_override)

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

    def test_daily_catalog_metrics_endpoint(self):
        response = self.client.get('/api/catalog/metrics')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        value = response.json()
        self.assertEqual(value['counts']['products'], app.state.products.count())
        self.assertEqual(value['timezone'], 'Asia/Seoul')
        self.assertEqual(self.client.get('/api/catalog/metrics').json(), value)

    def test_bootstrap_profile_uses_authenticated_account_ten_cases(self):
        previous=app.state.auth.config
        try:
            with tempfile.TemporaryDirectory() as directory:
                app.state.auth.reconfigure(replace(previous,enabled=True,auth_dir=Path(directory),iterations=1000))
                for n in range(10):
                    username=f'profile-user-{n}'
                    with self.subTest(username=username):
                        app.state.auth.set_credentials(username,'synthetic-test-password-1234')
                        token,_=app.state.auth.issue_token()
                        response=self.client.get('/api/bootstrap',headers={'Cookie':f'winmate_session={token}'})
                        self.assertEqual(response.status_code,200)
                        self.assertEqual(response.json()['user']['username'],username)
                        self.assertNotIn('hash',response.json()['user'])
                        self.assertNotIn('sample_history',response.json()['user'])
        finally:app.state.auth.reconfigure(previous)

    def test_admin_samples_stay_private_while_guest_bootstrap_allows_browsing(self):
        previous=app.state.auth.config
        try:
            with tempfile.TemporaryDirectory() as directory:
                app.state.auth.reconfigure(replace(previous,enabled=True,auth_dir=Path(directory),iterations=1000))
                app.state.auth.set_credentials('admin','synthetic-test-password-1234')
                token,_=app.state.auth.issue_token()
                response=self.client.get('/api/bootstrap',headers={'Cookie':f'winmate_session={token}'})
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.headers['cache-control'],'no-store')
                self.assertEqual(response.json()['user']['sample_history'],{'version':1,'scenarios':['bs01','bs21','bs03']})
                guest=self.client.get('/api/bootstrap')
                self.assertEqual(guest.status_code,200)
                self.assertEqual(guest.headers['cache-control'],'no-store')
                self.assertTrue(guest.json()['user']['guest'])
                self.assertIsNone(guest.json()['user']['username'])
                self.assertFalse(guest.json()['user']['template_sync'])
                self.assertNotIn('sample_history',guest.json()['user'])
                for path in ('/api/jobs','/api/history/legacy-id'):
                    self.assertEqual(self.client.get(path).status_code,401,path)
                self.assertEqual(self.client.post('/api/jobs',json={'kind':'rfp'}).status_code,401)
                self.assertEqual(self.client.post('/api/storyboards',json={}).status_code,401)
        finally:app.state.auth.reconfigure(previous)

    def test_database_detail_packs_preserve_reference_and_apply_reviewed_specs(self):
        for path in sorted((ROOT/'reference/live/img/prod').glob('d[0-9][0-9].json')):
            with self.subTest(pack=path.stem):
                original=path.read_bytes()
                expected=json.loads(original)['items']
                reviewed=ROOT/'app/data/product-details'/path.name
                if reviewed.is_file():
                    expected.update(json.loads(reviewed.read_text())['items'])
                response=self.client.get('/api/product-packs/'+str(int(path.stem[1:])))
                self.assertEqual(response.status_code,200)
                actual=response.json()['items']
                self.assertEqual(set(actual),set(expected))
                for identifier,detail in expected.items():
                    with self.subTest(product=identifier):
                        self.assertEqual(actual[identifier],detail)
                self.assertEqual(path.read_bytes(),original)

    def test_ranges_and_full_pack_are_both_supported(self):
        path=ROOT/'reference/live/img/media/t.json'
        response=self.client.get('/img/media/t.json',headers={'Range':'bytes=12-111'})
        self.assertEqual(response.status_code,206)
        self.assertEqual(response.content,path.read_bytes()[12:112])
        self.assertEqual(response.headers['content-range'],f'bytes 12-111/{path.stat().st_size}')
        full=self.client.get('/img/media/t.json')
        self.assertEqual(full.status_code,200)
        self.assertEqual(full.content,path.read_bytes())

    def test_missing_provider_never_claims_model_execution(self):
        response=self.client.post('/api/llm',json={'feature':'llm','kind':'json','prompt':'Return a small object.'})
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json()['code'],'no_api_key')
        self.assertNotIn('data',response.json())

    def test_reference_stays_unmodified_and_not_a_production_route(self):
        self.assertEqual(self.client.get('/reference/').status_code,404)
        self.assertEqual(hashlib.sha256((ROOT/'reference/live/index.html').read_bytes()).hexdigest(),'0ab69b8c61b4fd0999c79210c2c084796212717f3dc49c695e8e58712ba2e05b')

    def test_local_fonts_and_pdf_runtime(self):
        for path in ['/fonts/fonts.css','/lib/pdf.min.js','/lib/pdf.worker.min.js','/lib/pdf-cmaps-ko.js']:
            self.assertEqual(self.client.get(path).status_code,200,path)

    def test_missing_data_is_a_clear_not_found(self):
        self.assertEqual(self.client.get('/api/products/not-a-product').status_code,404)
        self.assertEqual(self.client.get('/api/product-packs/9999').status_code,404)

    def test_background_photos_cover_all_industries_and_are_served_separately(self):
        manifest=json.loads((ROOT/'app/web/src/domain/templates/backgrounds.json').read_text())
        catalog=json.loads((ROOT/'app/data/catalog.json').read_text())
        self.assertEqual({x['code'] for x in manifest['industries']},{x['code'] for x in catalog['industries']})
        for industry in manifest['industries']:
            with self.subTest(industry=industry['code']):
                photos=[x for x in manifest['images'] if x['industry']==industry['code']]
                self.assertGreaterEqual(len(photos),3)
                for photo in photos:
                    for key in ['src','thumb']:
                        response=self.client.get(photo[key])
                        self.assertEqual(response.status_code,200)
                        self.assertIn('image/webp',response.headers['content-type'])
        self.assertEqual(self.client.get('/img/backgrounds/not-found.webp').status_code,404)


if __name__=='__main__':unittest.main()
