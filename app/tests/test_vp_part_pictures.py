"""가치 제안(VP) 파트의 사진 — 서버 자동 구성(composer pictures.fill_part_images → part_unique). 사용자 지시 2026-11-17:
같은 제품을 다시 쓰면 하나는 제품 컷 · 다른 하나는 그 제품이 들어간 다른 사진, 솔루션 칸은 솔루션 사진, 한 장 · VP 파트 안에서 같은 사진 두 번 금지(제품 컷도).

장 · 글은 제안서 pn63a3to 의 VP 장 그대로(app/tests/fixtures/vp-pictures.json), 사진 자료는 실제 composer 라이브러리
(app/data/runtime/composer/library.json — 없으면 건너뛴다). 모델 없이(pick 'rank') 고른다.
  app/.venv/bin/python -m pytest app/tests/test_vp_part_pictures.py -q
"""
import json
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.environ.setdefault('PYTHONDONTWRITEBYTECODE', '1')
sys.dont_write_bytecode = True
LIBRARY = ROOT / 'app' / 'data' / 'runtime' / 'composer' / 'library.json'
FIXTURE = json.loads((ROOT / 'app' / 'tests' / 'fixtures' / 'vp-pictures.json').read_text(encoding='utf-8'))


@unittest.skipUnless(LIBRARY.exists(), 'composer library not built')
class VpPartPictures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ['WM_COMPOSER_DATA'] = str(LIBRARY.parent)
        from app.api.poc.adapters import compose
        compose._auto()
        from composer import auto, pictures
        cls.auto, cls.pictures = auto, pictures
        cls.IM = pictures.load()['images']

    def fill(self, toc='needs'):
        P = self.pictures
        ctx = {'products': list(FIXTURE['ctx']['products']), 'solutions': list(FIXTURE['ctx']['solutions']), 'cases': [], 'ind': 'FB',
               'spaces': [], 'who': FIXTURE['customer'], 'vertical': 'fb_cafe'}
        slides = [{'f': x['f'], 't': dict(x['ov']['t']), 'ex_img': {}, 'bind': {'kind': self.auto.slide_kind(x['f'])}}
                  for x in FIXTURE['vp']['layouts'] if not x['f'].startswith('L_VS_DIV')]
        part = {'id': 'vp', 'type': 'value', 'toc': toc, 'name': '가치 제안 (VP)'}
        P.fill_part_images(ctx, part, slides, None, P.PictureRegistry(), verify=False, pick='rank')
        out = []
        for sl in slides:
            for key, v in sorted((sl.get('img') or {}).items(), key=lambda kv: int(kv[0])):
                m = (sl.get('img_meta') or {}).get(key) or {}
                src = P.norm_src(v) if isinstance(v, dict) and v.get('src') else ''
                it = self.IM.get(src) or {}
                out.append({'f': sl['f'], 'key': key, 'src': src, 'hidden': bool(isinstance(v, dict) and v.get('hidden')), 'kind': m.get('kind'),
                            'product': m.get('product'), 'solution': m.get('solution'), 'cls': it.get('cls'), 'products': it.get('products') or [],
                            'solutions': it.get('solutions') or [], 'pic': P.pic(src) if src else ''})
        return out

    def test_vp_part_rules(self):
        got = self.fill()
        shown = [x for x in got if x['src'] and not x['hidden']]
        self.assertTrue(shown, got)
        # 한 장 안 · VP 파트 안에서 같은 사진 두 번 없음 — 제품 컷도
        pics = [x['pic'] for x in shown]
        self.assertEqual(len(pics), len(set(pics)), json.dumps(got, ensure_ascii=False, indent=1))
        # 제품 컷은 제품마다 한 번, 같은 제품의 다른 칸은 그 제품이 들어간 다른 사진
        qm = [x for x in shown if x['product'] == 'qm55c']
        self.assertGreaterEqual(len(qm), 2, json.dumps(got, ensure_ascii=False, indent=1))
        cuts = [x for x in qm if x['cls'] == 'product']
        self.assertEqual(len(cuts), 1, json.dumps(qm, ensure_ascii=False, indent=1))
        self.assertTrue(all(x['cls'] == 'scene' and 'qm55c' in x['products'] for x in qm if x not in cuts), json.dumps(qm, ensure_ascii=False, indent=1))
        # 솔루션 칸은 그 솔루션의 사진
        for x in got:
            if x['kind'] == 'solution' and not x['hidden']:
                self.assertIn(x['solution'], x['solutions'], x)

    def test_other_parts_keep_repeating_cuts(self):
        """다른 파트(공간별 제안 등)는 지금처럼 같은 제품 컷을 여러 칸에 쓸 수 있다 — VP 만의 규칙."""
        got = self.fill(toc='space')
        # the VP sheets are recognised by their layouts too — the rule follows the sheets, not only the 목차 key
        pics = [x['pic'] for x in got if x['src'] and not x['hidden']]
        self.assertEqual(len(pics), len(set(pics)))
        self.assertFalse(self.pictures.strict_part({'toc': 'space'}, [{'f': 'L_VS_SPACE'}]))
        self.assertTrue(self.pictures.strict_part({'toc': 'needs'}, [{'f': 'L_VS_DIV_R4'}]))


if __name__ == '__main__':
    unittest.main()
