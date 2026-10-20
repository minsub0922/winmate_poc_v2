# 공유오피스 Lite 15장 → 앱 소스에 넣기 (다시 돌려도 같은 결과: 기존 L_SOL_* 를 지우고 새로 씀)
import json, base64, re, sys
W = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/w'
metas = json.load(open('/home/claude/gen/out/lay/meta.json'))
htmls = json.load(open('/home/claude/gen/out/lay/html.json'))
man = {m['key']: m for m in json.load(open('/home/claude/gen/out/manifest.json'))}
bund = json.load(open('/home/claude/gen/out/bundles.json'))
# 1) image packs
for g, name in (('A', 'sol-a'), ('B', 'sol-b')):
    imgs = []
    for key in bund[g]:
        f = man[key]['file']; mime = 'image/png' if f.endswith('.png') else 'image/jpeg'
        imgs.append(f'data:{mime};base64,' + base64.b64encode(open(f, 'rb').read()).decode())
    json.dump({'images': imgs}, open(f'{W}/img/fill/{name}.json', 'w'), separators=(',', ':'))
    print(name, len(imgs))
# 2) std_layouts.js
p = f'{W}/src/std_layouts.js'; s = open(p).read()
mi = s.index('export const STD_META = ') + len('export const STD_META = ')
me = s.index('\n];', mi) + 2
META = json.loads(s[mi:me])
hi = s.index('export const STD_HTML = ') + len('export const STD_HTML = ')
he = s.rindex(';')
HTML = json.loads(s[hi:he])
META = [m for m in META if not m['f'].startswith('L_SOL_')] + metas
for k in [k for k in HTML if k.startswith('L_SOL_')]: del HTML[k]
HTML.update(htmls)
head = s[:s.index('export const STD_META = ')]
if 'L_SOL_01..15' not in head:
    head += ('// 표준 제안서 · 공유오피스 Lite 15장 (L_SOL_01..15, 원본 장표 구분 ST · 원본 표기 cv=ST_SOL) — ‘공유오피스 Lite 제안서 슬라이드별 레이아웃 재현 명세’(PDF 15쪽)의 좌표 · 글자 기준선을\n'
             '// 1280×720 으로 옮긴 것(×4/3). Best Scenario bs22 가 15장을 순서대로 씀. 사진 · 제품 컷 · QR: samsung.com/sec/business 공식 이미지 → img/fill/sol-a.json · sol-b.json\n'
             '// (렌더 사진에 박힌 설명 상자는 지우고 편집 가능한 카드로, 큐브 공기청정기 자리는 Infinite AI 컷 합성, P03 평면도는 새로 그림). 출처: src/fill_sources.md ‘공유오피스 Lite’ 표 · 생성 2026-10-19\n')
s2 = head + 'export const STD_META = ' + json.dumps(META, ensure_ascii=False, indent=0) + ';\nexport const STD_HTML = ' + json.dumps(HTML, ensure_ascii=False) + ';\n'
open(p, 'w').write(s2)
print('meta', len(META), 'html', len(HTML), 'bytes', len(s2.encode()))
