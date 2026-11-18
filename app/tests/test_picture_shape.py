"""사진 고르기 — 칸 비율 · 사진 비율 (composer pictures). 사용자 지시 2026-11-18: 공간 · 배경 사진은 칸 모양과 사진 모양을 함께 본다 —
조금 잘리는 건 괜찮지만 아무 사진이나 칸에 욱여넣지 않는다. 제품 컷(통째로 보이는 contain 칸)은 해당 없음.

실제 composer 라이브러리(app/data/runtime/composer/library.json — 없으면 건너뛴다)와 사진 크기표(app/data/picture_dims.json ←
app/scripts/build_picture_dims.py)로, 모델 없이 순위만 본다.
  app/.venv/bin/python -m pytest app/tests/test_picture_shape.py -q
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
DIMS = ROOT / 'app' / 'data' / 'picture_dims.json'


def frame(w, h, near='', fit='cover', kind='scene'):
    return {'key': '0', 'kind': kind, 'orig': None, 'osrc': '', 'near': near, 'title': '', 'hint': '', 'part_type': '', 'fit': fit,
            'w': w, 'h': h, 'bind': {}, 'families': set()}


@unittest.skipUnless(LIBRARY.exists() and DIMS.exists(), 'composer library or picture sizes not built')
class PictureShape(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ['WM_COMPOSER_DATA'] = str(LIBRARY.parent)
        from app.api.poc.adapters import compose
        compose._auto()
        from composer import pictures
        cls.P = pictures
        cls.IM = pictures.load()['images']
        cls.ctx = {'ind': 'MD', 'products': [], 'cases': [], 'solutions': [], 'spaces': [], 'space_by_id': {}}

    def test_every_photo_has_its_size(self):
        sizes = json.loads(DIMS.read_text())
        bundled = [src for src in sizes if src.startswith('img/fill/') and src in self.IM]
        self.assertTrue(bundled, 'the curated fill photos are measured')
        self.assertTrue(all(self.IM[src].get('w') and self.IM[src].get('h') for src in bundled))
        missing = [src for src, it in self.IM.items() if it.get('cls') in ('scene', 'kv') and not (it.get('w') and it.get('h'))]
        self.assertLessEqual(len(missing), 2, missing[:5])

    def test_tall_frame_takes_photos_it_does_not_cut_to_a_strip(self):
        P = self.P
        tall = frame(400, 512, '병실 입원 환자 간호')
        cands = P.candidates(tall, self.ctx, set(), 6)
        self.assertTrue(cands)
        self.assertTrue(all(P.visible(c['src'], tall) >= P.SHAPE_MIN for c in cands), [(c['src'], P.visible(c['src'], tall)) for c in cands])

    def test_banner_shape_never_brings_in_another_business(self):
        # a hospital timeline banner (3.7:1): no hospital photo is that wide — the frame keeps hospital photos (cut down) rather than
        # take a rooftop chiller or a farm because it happens to be panoramic
        P = self.P
        banner = frame(1104, 300, '원무 · 간호 · 시설관리')
        cands = P.candidates(banner, self.ctx, set(), 6)
        self.assertTrue(cands)
        for c in cands:
            it = self.IM[c['src']]
            self.assertTrue('MD' in (it.get('ind_primary') or []) or 'MD' in (it.get('place') or []), (c['src'], it.get('desc')))

    def test_whole_picture_frames_are_not_shaped(self):
        P = self.P
        cut = frame(108, 108, fit='contain', kind='product')
        srcs = [s for s, it in self.IM.items() if it.get('cls') == 'scene' and it.get('w')][:5]
        self.assertTrue(all(P.visible(s, cut) is None and P.shape_cost(s, cut) == 0 for s in srcs))
        self.assertEqual(P.by_shape(srcs, cut), srcs)

    def test_slight_trim_costs_nothing(self):
        P = self.P
        src = next(s for s, it in self.IM.items() if it.get('cls') == 'scene' and it.get('w') and abs(it['w'] / it['h'] - 1.5) < 0.02)
        self.assertEqual(P.shape_cost(src, frame(600, 360)), 0)            # 1.67 frame: 90 % of the photo stays
        self.assertGreater(P.shape_cost(src, frame(400, 400)), 0)         # square: two thirds stay
        self.assertGreater(P.shape_cost(src, frame(300, 500)), P.shape_cost(src, frame(400, 400)))


if __name__ == '__main__':
    unittest.main()
