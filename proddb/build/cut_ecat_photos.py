"""ecat/photos.json → ecat/photos/*.jpg 다시 만들기(사진 파일이 없을 때).

photos.json 의 각 사진은 'e-카탈로그 쪽 이미지에서 이 영역(box_px)을 자른 것'이라는 기록이다.
  · 쪽 이미지  https://samsung.aiibook.net/b2b/catImage/<dir>/<page 3자리>.jpg  → raw_pages/ 에 받아 둠
  · pdf 가 적힌 사진은 같은 영역을 카탈로그 PDF(펼침면 한 장 = 두 쪽, half = L/R/F)에서 더 큰 해상도로 렌더
  · source_url 이 있는 사진(Samsung Onyx 카탈로그 등)은 그 PDF 의 pdf_page 쪽 전체를 렌더
영역은 사람이 고른 상자(req_pct, 쪽 크기의 %)를 물체에 맞게 조인 결과(snapped)로, 고르는 도구는 Winmate 작업 메모(claude/product-photos.md) 참고.

  python3 build/cut_ecat_photos.py            # 없는 파일만
  python3 build/cut_ecat_photos.py --all      # 모두 다시
"""
import json, os, sys, urllib.request
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ECAT = os.path.join(HERE, '..', 'ecat')
OUT = os.path.join(ECAT, 'photos')
CACHE = os.path.join(HERE, '..', 'raw_pages')  # 받은 쪽 이미지 · PDF(용량이 커서 폴더에 두지 않아도 됨)
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
ALL = '--all' in sys.argv
PH = json.load(open(os.path.join(ECAT, 'photos.json')))


def fetch(url, path):
    if not os.path.exists(path):
        with urllib.request.urlopen(url, timeout=300) as r, open(path + '.part', 'wb') as f:
            while True:
                b = r.read(1 << 20)
                if not b: break
                f.write(b)
        os.replace(path + '.part', path)
    return path


def page_img(dr, p):
    return Image.open(fetch(f'https://samsung.aiibook.net/b2b/catImage/{dr}/{p:03d}.jpg', os.path.join(CACHE, f'{dr}_{p:03d}.jpg'))).convert('RGB')


def pdf_doc(url):
    import fitz
    return fitz.open(fetch(url, os.path.join(CACHE, os.path.basename(url))))


n = 0
for owner, it in PH['items'].items():
    for q in it.get('pics', []):
        dst = os.path.join(OUT, q['file'])
        if os.path.exists(dst) and not ALL: continue
        import fitz
        if q.get('source_url'):
            d = pdf_doc(q['source_url']); pg = d[q['pdf_page'] - 1]; z = 1400 / pg.rect.width
            pix = pg.get_pixmap(matrix=fitz.Matrix(z, z), alpha=False)
            Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(dst, quality=90)
        elif q.get('pdf'):
            W, H = q['page_size']; box = q['box_px']
            d = pdf_doc(q['pdf']['url']); pg = d[q['pdf']['index']]; r = pg.rect; half = q['pdf']['half']
            hx0, hw = (r.x0, r.width) if half == 'F' else ((r.x0, r.width / 2) if half == 'L' else (r.x0 + r.width / 2, r.width / 2))
            clip = fitz.Rect(hx0 + box[0] / W * hw, r.y0 + box[1] / H * r.height, hx0 + box[2] / W * hw, r.y0 + box[3] / H * r.height)
            z = min(8.0, max(900, (box[2] - box[0]) * 2) / max(1e-3, clip.width))
            pix = pg.get_pixmap(matrix=fitz.Matrix(z, z), clip=clip, alpha=False)
            Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(dst, quality=92)
        else:
            page_img(q['dir'], q['p']).crop(q['box_px']).save(dst, quality=92)
        n += 1
print('made', n, 'photos →', OUT)
