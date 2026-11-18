"""picture pixel sizes for the composer's photo choice: app/data/picture_dims.json = {src: [w, h]}.

The library (composer/library.py) knows the size of most photos from their source tables, but not of the curated fill bundles
(img/fill/*.json), the 표준 제안서 photos (img/bs/) and a few assets — about a quarter of the scene photos. A photo frame is
filled with ``object-fit: cover``: a photo whose shape is far from the frame's is cut down to a strip of itself, so the choice
needs every photo's real shape. Reads the image headers (JPEG · PNG · WebP · AVIF · GIF), no imaging library.

    app/.venv/bin/python -B app/scripts/build_picture_dims.py            # every picture of the library
"""
import base64
import json
import struct
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / 'app' / 'data' / 'runtime' / 'composer' / 'library.json'
OUT = ROOT / 'app' / 'data' / 'picture_dims.json'
PUBLIC = ROOT / 'app' / 'web' / 'public'


def size_of(b: bytes):
    """(w, h) from the first bytes of a JPEG · PNG · WebP · GIF, else None."""
    if b[:8] == b'\x89PNG\r\n\x1a\n' and len(b) >= 24:
        return struct.unpack('>II', b[16:24])
    if b[4:8] == b'ftyp' and b[8:12] in (b'avif', b'avis', b'mif1', b'heic'):
        i = b.find(b'ispe')  # the image spatial extents box: version/flags, width, height
        return struct.unpack('>II', b[i + 8:i + 16]) if i > 0 else None
    if b[:6] in (b'GIF87a', b'GIF89a'):
        return struct.unpack('<HH', b[6:10])
    if b[:4] == b'RIFF' and b[8:12] == b'WEBP':
        tag = b[12:16]
        if tag == b'VP8 ':
            w, h = struct.unpack('<HH', b[26:30])
            return w & 0x3FFF, h & 0x3FFF
        if tag == b'VP8L':
            bits = int.from_bytes(b[21:25], 'little')
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        if tag == b'VP8X':
            return int.from_bytes(b[24:27], 'little') + 1, int.from_bytes(b[27:30], 'little') + 1
        return None
    if b[:2] == b'\xff\xd8':
        i = 2
        while i + 9 < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            marker = b[i + 1]
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            seg = struct.unpack('>H', b[i + 2:i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack('>HH', b[i + 5:i + 9])
                return w, h
            i += 2 + seg
    return None


@lru_cache(maxsize=64)
def _bundle(path: str):
    d = json.loads(Path(path).read_text())
    return d[next(iter(d))] if isinstance(d, dict) else d


def read(src: str):
    """bytes of a library address: a file under the repo / app public dir, or entry n of a JSON bundle (``path.json#n``)."""
    path, _, n = src.partition('#')
    for base in (ROOT, PUBLIC, ROOT / 'reference' / 'live'):  # (product gallery packs live under reference/live — composer eval.render reads them there too)
        p = base / path.lstrip('/')
        if p.is_file():
            if n:
                uri = _bundle(str(p))[int(n)]
                return base64.b64decode(uri.split(',', 1)[1]) if isinstance(uri, str) and uri.startswith('data:') else None
            return p.read_bytes()
    return None


def main() -> int:
    images = json.loads(LIB.read_text())['images']
    out, missing = {}, []
    for src, it in sorted(images.items()):
        if it.get('cls') == 'product':
            continue  # cuts are shown whole ('contain'): their shape does not decide anything
        try:
            b = read(src)
            wh = size_of(b) if b else None
        except (OSError, ValueError, IndexError, KeyError, struct.error):
            wh = None
        if wh and wh[0] > 0 and wh[1] > 0:
            out[src] = [int(wh[0]), int(wh[1])]
        else:
            missing.append(src)
    OUT.write_text(json.dumps(out, separators=(',', ':'), sort_keys=True) + '\n')
    print(f'{len(out)} sizes → {OUT.relative_to(ROOT)} · {len(missing)} unreadable', missing[:8])
    return 0


if __name__ == '__main__':
    sys.exit(main())
