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

    def test_admin_sample_history_policy_and_private_bootstrap(self):
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
                self.assertEqual(self.client.get('/api/bootstrap').status_code,401)
        finally:app.state.auth.reconfigure(previous)

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


if __name__=='__main__':unittest.main()
