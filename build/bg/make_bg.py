"""Best Scenario 배경 테마 — 장마다 다른 배경 사진.

build/bg/plan.json 에 시나리오별로 장 순서대로 원본 사진(slides)과 여분(spare)을 적어 두면,
배경용으로 처리해 build/bg/out/<시나리오>-<장 번호>.jpg · -s<번호>.jpg 로 저장하고(확인용, 앱에는 안 들어감),
시나리오마다 한 파일로 묶은 img/bg/<시나리오>.json(장 순서 → 여분 순서의 JPEG data URL 목록)과
앱이 읽는 src/scenario_bg.json 을 만든다. 아티팩트 한 버전에 올릴 수 있는 파일 수(511)가 정해져 있어
사진 94장을 따로 올리지 않고 시나리오당 1파일로 묶는다 — 화면은 그 시나리오의 장을 그릴 때 처음 한 번만 받는다(src/bgpack.js).

- 한 시나리오 안에서 같은 사진은 두 번 쓰지 않는다(시나리오끼리도 겹치지 않음 · 실행할 때 확인).
- 장 수와 slides 개수가 같아야 한다 — 배경이 있는 시나리오는 모든 장에 배경이 있다.
- 여분(spare)은 이 구성으로 시작한 제안서에 나중에 넣는 장에 차례로 쓰인다(store.js syncBg).

처리: 1600×900 · 채도 82% · 가우시안 블러 3px · 흰색 스크림(위 84% → 가운데 72% → 아래 80%).
제목(위)과 각주(아래) 띠는 더 밝게, 가운데는 사진이 더 보이게 한다. 레이아웃은 그대로 두고 루트 배경만 바꾼다.

    python3 build/bg/make_bg.py            # 프로젝트 루트에서 실행
사진 출처: img/cover/* → claude/industry-cover-photos.md · img/ph/* → src/photo_sources.md · img/case-*, life-* → 삼성 공식
"""
import base64
import hashlib
import io
import json
import os
import re

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
W, H = 1600, 900
STOPS = [(0.0, 0.84), (0.33, 0.72), (0.75, 0.72), (1.0, 0.80)]  # (세로 위치, 흰색 비율)


def scrim_alpha():
    ys = np.linspace(0, 1, H)
    a = np.interp(ys, [s[0] for s in STOPS], [s[1] for s in STOPS])
    return np.repeat(a[:, None], W, axis=1)[..., None]


A = scrim_alpha()


def make(src, dst):
    """→ JPEG bytes (also written to dst for checking)"""
    im = Image.open(os.path.join(ROOT, src)).convert('RGB')
    k = max(W / im.width, H / im.height)  # 16:9 가운데 맞춤
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    l, t = (im.width - W) // 2, (im.height - H) // 2
    im = im.crop((l, t, l + W, t + H))
    im = ImageEnhance.Color(im).enhance(0.82).filter(ImageFilter.GaussianBlur(3))
    out = np.asarray(im).astype(np.float32) * (1 - A) + 255 * A
    buf = io.BytesIO()
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(buf, 'JPEG', quality=78, optimize=True, progressive=True)
    path = os.path.join(ROOT, dst)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(buf.getvalue())
    return buf.getvalue()


def slide_count(sid):
    """장 수 — src/scenarios.js 의 flow 에서 [f, role] 쌍을 센다"""
    js = open(os.path.join(ROOT, 'src', 'scenarios.js'), encoding='utf-8').read()
    i = js.index("id: '%s'" % sid)
    j = js.find("\n  {\n    id: 'bs", i + 10)
    block = js[i:j if j > 0 else len(js)]
    flow = block[block.index('flow: ['):block.index('ask:')]
    return len(re.findall(r"\['L_[A-Za-z0-9_]+',", flow))


if __name__ == '__main__':
    plan = json.load(open(os.path.join(ROOT, 'build', 'bg', 'plan.json'), encoding='utf-8'))
    seen = {}
    out = {}
    for sid, v in plan.items():
        n = slide_count(sid)
        assert len(v['slides']) == n, f'{sid}: 장 {n}개인데 배경 {len(v["slides"])}개'
        pack = f'img/bg/{sid}.json'
        rec = {'name': v['name'], 'pack': pack, 'n': n, 'spare': len(v['spare']), 'from': []}
        images = []
        for kind, lst in (('slides', v['slides']), ('spare', v['spare'])):
            for i, src in enumerate(lst):
                h = hashlib.md5(open(os.path.join(ROOT, src), 'rb').read()).hexdigest()
                assert h not in seen, f'같은 사진 두 번: {src} = {seen.get(h)}'
                seen[h] = src
                dst = f'build/bg/out/{sid}-{i + 1:02d}.jpg' if kind == 'slides' else f'build/bg/out/{sid}-s{i + 1}.jpg'
                images.append('data:image/jpeg;base64,' + base64.b64encode(make(src, dst)).decode())
                rec['from'].append(src)
        with open(os.path.join(ROOT, pack), 'w', encoding='utf-8') as f:
            json.dump({'v': 1, 'images': images}, f, separators=(',', ':'))
        out[sid] = rec
        print(sid, n, '장 ·', len(v['spare']), '여분 →', pack, os.path.getsize(os.path.join(ROOT, pack)) // 1024, 'KB')
    with open(os.path.join(ROOT, 'src', 'scenario_bg.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('→ src/scenario_bg.json')
