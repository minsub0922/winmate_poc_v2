"""The same StaticFiles mount used by the app must serve one image without the full pack."""
import json
from pathlib import Path
import unittest
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]


class ImageRanges(unittest.TestCase):
    def test_library_manifest_and_individual_range(self):
        app = FastAPI()
        app.mount('/img/lib', StaticFiles(directory=ROOT / 'img/lib'))
        with TestClient(app) as client:
            response = client.get('/img/lib/ranges.json')
            self.assertEqual(response.status_code, 200)
            manifest = response.json()
            for name, ranges in manifest['packs'].items():
                data = (ROOT / name).read_bytes()
                start, end = ranges[0]
                image = client.get('/' + name, headers={'Range': f'bytes={start}-{end - 1}'})
                self.assertEqual(image.status_code, 206)
                self.assertEqual(image.content, data[start:end])
                self.assertEqual(image.headers['content-range'], f'bytes {start}-{end - 1}/{len(data)}')
                self.assertEqual(image.content.decode(), json.loads(data)['images'][0])
                self.assertLess(len(image.content), len(data) // 10)


if __name__ == '__main__':
    unittest.main()
