# 9차로 더는 쓰지 않는 img/bs 사진을 한 묶음으로 — python3 build/bs/legacy.py
# 아티팩트 파일 수 한도(511) 때문에 개별 파일은 게시에서 빼고, 이미 만든 제안서(예전 Best Scenario 값)가 그 경로를 쓰고 있어도
# 그대로 보이도록 img/fill/r9-legacy.json 묶음 + src/legacy_img.js (옛 경로 → 묶음 주소)로 옮긴다. 원본 파일은 build/bs/legacy_img/ 로.
import os, re, json, glob, gzip, base64, shutil, subprocess
blob = []
for root, _, fs in os.walk('src'):
    for f in fs:
        if re.search(r'\.(js|jsx|json)$', f) and f not in ('legacy_img.js',): blob.append(open(os.path.join(root, f), encoding='utf8').read())
blob.append(open('data/catalog.json', encoding='utf8').read()); blob.append(open('data/images.json', encoding='utf8').read())
blob.append(gzip.decompress(base64.b64decode(open('data/layouts.b64').read().strip())).decode('utf8'))
B = '\n'.join(blob)
old = {}
if os.path.exists('src/legacy_img.js'):
    old = json.loads(re.search(r'LEGACY_IMG = (\{.*\});', open('src/legacy_img.js', encoding='utf8').read(), re.S).group(1))
cands = [p for p in sorted(glob.glob('img/bs/bs*')) if p not in B and os.path.basename(p) not in B]
os.makedirs('build/bs/legacy_img', exist_ok=True)
items = list(old.keys()) + [p for p in cands if p not in old]
images = []; M = {}
for i, p in enumerate(items):
    src = p if os.path.exists(p) else os.path.join('build/bs/legacy_img', os.path.basename(p))
    raw = open(src, 'rb').read(); mime = 'image/png' if src.endswith('.png') else 'image/jpeg'
    images.append(f'data:{mime};base64,' + base64.b64encode(raw).decode()); M[p] = f'img/fill/r9-legacy.json#{i}'
json.dump({'images': images}, open('img/fill/r9-legacy.json', 'w'))
open('src/legacy_img.js', 'w', encoding='utf8').write(
    '// 9차(2026-10-17) Best Scenario 사진 중심 전환 뒤 더는 쓰지 않는 img/bs 사진 — 아티팩트 파일 수 한도 때문에 개별 파일 대신 묶음 하나(img/fill/r9-legacy.json)로.\n'
    '// 예전에 Best Scenario 로 시작해 저장된 제안서가 옛 경로를 갖고 있어도 그대로 보이게, 그리는 곳(slide.jsx · store.js resolveImg)이 이 표로 묶음 주소로 바꾼다. build/bs/legacy.py 가 만듦.\n'
    'export const LEGACY_IMG = ' + json.dumps(M, ensure_ascii=False, indent=0) + ';\n'
    '/** an old img/bs path that now lives in the legacy pack → its pack address (otherwise the src itself) */\n'
    'export const legacySrc = (src) => (src && LEGACY_IMG[src]) || src;\n')
for p in cands:
    if os.path.exists(p): shutil.move(p, os.path.join('build/bs/legacy_img', os.path.basename(p)))
print('legacy', len(M), 'moved', len(cands), os.path.getsize('img/fill/r9-legacy.json') // 1024, 'KB')
