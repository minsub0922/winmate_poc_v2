"""Data regression checks for the reviewed Samsung specifications projection."""
import hashlib
import json
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'app/data'


class ProductSpecificationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = sqlite3.connect(f'file:{DATA / "runtime/winmate_products.sqlite"}?mode=ro', uri=True)
        cls.products = {key: json.loads(payload) for key, payload in cls.db.execute('SELECT id,payload FROM wm_ui_product')}
        cls.details = {key: (pack, json.loads(payload)) for key, pack, payload in cls.db.execute('SELECT id,pack,payload FROM wm_ui_detail')}

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_all_existing_products_have_correct_pack_and_source_identity(self):
        self.assertEqual(len(self.products), 1068)
        self.assertEqual(set(self.products), set(self.details))
        for key, product in self.products.items():
            pack, detail = self.details[key]
            self.assertEqual(product['d'], pack, key)
            if detail.get('specs'):
                self.assertEqual(detail.get('specProductId'), key)
                self.assertTrue(detail.get('specSources'), key)
                for row in detail['specs']:
                    self.assertEqual(len(row), 3)
                    self.assertTrue(str(row[1]).strip() and str(row[2]).strip(), key)
            for variant in detail.get('specVariants', []):
                self.assertTrue(variant['model'] and variant['sources'] and variant['specs'], key)

    def test_curated_display_sizes_never_inherit_the_55_inch_table(self):
        expected = {'qm43c': '107.9 cm', 'qm55c': '138.7 cm', 'qm65c': '163.9 cm', 'qm85c': '214.7 cm'}
        for key, size in expected.items():
            detail = self.details[key][1]
            self.assertIn(['디스플레이', '대각선 사이즈 (cm)', size], detail['specs'])
        self.assertEqual(self.details['tabs11'][1]['specModel'], 'SM-X930NZAAKOO')
        self.assertFalse(any('지원 밴드' in row[1] for row in self.details['tabs11'][1]['specs']))
        wall = self.details['thewall'][1]
        self.assertEqual(len(wall['specVariants']), 2)
        self.assertTrue(all('LH012IABMHS' not in v['model'] for v in wall['specVariants']))
        self.assertTrue(all(['공식 사양', '제품 (가로×높이×깊이)', '3229.1 x 1826.1 x 49.5 mm'] in v['specs'] for v in wall['specVariants']))

    def test_package_components_and_service_facts_are_not_discarded(self):
        package = self.details['sg_g000184071'][1]
        self.assertEqual(package['specScope'], 'package')
        self.assertTrue(any('LH43BEFHLBFXKR' in row[0] for row in package['specs']))
        self.assertTrue(any('HA-MTS1S43BLK' in row[0] for row in package['specs']))
        service = self.details['sg_g500138803'][1]
        self.assertIn(['기본정보', '보증기간', '3개월'], service['specs'])

    def test_ambiguous_models_and_limited_sources_stay_explicit(self):
        crown = self.details['ec_228_049'][1]
        self.assertEqual(crown['specReviewStatus'], 'model_identity_unverified')
        self.assertFalse(crown['specs'])
        self.assertEqual(self.details['thewall_aio'][1]['specReviewStatus'], 'model_identity_unverified')
        self.assertEqual(self.details['ec_297_074'][1]['specReviewStatus'], 'limited_official_data')
        self.assertIn('2018', self.details['ec_297_074'][1]['specNote'])

    def test_overlay_database_and_ledger_agree(self):
        reviewed = {key: json.loads(payload) for key, payload in self.db.execute('SELECT id,detail_json FROM product_spec_review')}
        ledger = json.loads((ROOT / 'proddb/reviews/specs-20261020/product-review.json').read_text())
        self.assertEqual(len(ledger), 1068)
        for item in ledger:
            self.assertEqual(item['after'], len(self.details[item['id']][1]['specs']), item['id'])
            self.assertEqual(reviewed[item['id']]['specs'], self.details[item['id']][1]['specs'])
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_frozen_reference_details_were_not_modified(self):
        manifest = json.loads((ROOT / 'proddb/reviews/specs-20261020/before-manifest.json').read_text())
        for entry in manifest:
            if entry['path'].startswith('app/data/static/'):
                self.assertEqual(hashlib.sha256((ROOT / entry['path']).read_bytes()).hexdigest(), entry['sha256'])

    def test_agent_product_specs_match_the_actual_ui_specs(self):
        kb = DATA / 'runtime/kb'
        catalog_bytes = (kb / 'catalog.json').read_bytes()
        products = {p['id']: p for p in json.loads(catalog_bytes)['products']}
        manifest = json.loads((kb / 'manifest.json').read_text())
        self.assertEqual(manifest['outputs']['catalog.json']['sha256'], hashlib.sha256(catalog_bytes).hexdigest())
        self.assertEqual(set(products), set(self.details))
        for key, (_, detail) in self.details.items():
            self.assertEqual(products[key]['specs'], detail['specs'], key)
            self.assertEqual(products[key]['specReviewStatus'], detail['specReviewStatus'], key)


if __name__ == '__main__':
    unittest.main()
