# src/photo_sources.md — 사진 출처 대장 (ph_images.json + new_layouts.json 에서 생성)
import json, re, os
HERE = os.path.dirname(os.path.abspath(__file__))
PHI = json.load(open(os.path.join(HERE, 'ph_images.json')))
H = json.load(open(os.path.join(HERE, 'new_layouts.json')))
OUT = os.environ.get('OUT', 'src/photo_sources.md')
used = {}
for f, h in H.items():
    for pid in set(re.findall(r'data-slot="Photo" data-pid="(ph\.[^"]+)"', h)):
        used.setdefault(pid, []).append(f)
n_gen = sum(1 for v in PHI.values() if v['src'] == 'gen')
def kind(v):
    if v['src'] == 'gen': return '보정 · 생성 (원본은 오른쪽 출처)'
    if v['src'] == 'life': return 'samsung.com 비즈니스 페이지 (공식 연출)'
    return '삼성 공식 도입사례' if 'case-study' in v['page'] else 'samsung.com 업종 페이지 · 도입사례 사진'
rows = []
for pid in sorted(PHI):
    v = PHI[pid]
    u = ', '.join(sorted(used.get(pid, []))) or '라이브러리만'
    orig = v['orig'].split('?')[0]
    rows.append(f"| `{v['file']}` | {v['desc']} | {kind(v)} | {u} | {v['page']} | {orig} |")
md = f"""# 사진 중심 레이아웃 사진 출처

`img/ph/` 의 사진 {len(PHI)}장 — 레이아웃 L_PH_* {len(H)}장과 이미지 라이브러리(`data/images.json` 의 `ph.*`)에서 씁니다.
모두 samsung.com 에서 가져왔습니다(도입사례 페이지 · 업종별 비즈니스 페이지). {n_gen}장은 그 사진을 흑백 · 야간으로 바꿔 만든 장면이고, 쓰는 장표의 각주에 ‘흑백 처리’ · ‘보정’이라고 적었습니다.
자르기 · 크기 조정(최대 1600px) 외에 내용은 바꾸지 않았어요. 사진 속 고객사 · 브랜드는 실제 도입 현장입니다. 예시 고객(A 커피 등) 장표의 사진은 같은 업종의 참고 사진이고, 장표 아래 각주에 출처를 적었습니다. 사례 장표(L_PH_CD_C · L_PH_CL_C)의 수치 · 인용은 카탈로그 도입사례 원문 그대로입니다.
제품 컷(`cut.*`)은 기존 `img/bs/p-*.png`(삼성 공식 제품 컷)를 이미지 라이브러리에 등록만 했습니다.

| 파일 | 내용 | 구분 | 쓰는 레이아웃 | 출처 페이지 | 원본 이미지 |
|---|---|---|---|---|---|
""" + '\n'.join(rows) + '\n'
# 4차 — 도입사례 사진 묶음 (img/fill/r4-*.json, build/photo/r4_photos.py)
R4 = json.load(open(os.path.join(HERE, 'r4_images.json')))
used4 = {}
for f, h in H.items():
    for pid in set(re.findall(r'data-slot="Photo" data-pid="r4\.([^"]+)"', h)):
        used4.setdefault(pid, []).append(f)
usedf = {}
for f, h in H.items():
    for pid in set(re.findall(r'data-slot="Photo" data-pid="fill\.([^"]+)"', h)):
        usedf.setdefault(pid, []).append(f)
def crop_txt(c):
    if not c: return '그대로'
    if c == 'auto': return '카드 여백 · 캡션 떼기'
    if isinstance(c, list) and c and c[0] == 'auto': return '카드 여백 떼고 일부 자르기'
    return '일부 자르기'
rows4 = []
for n in sorted(R4):
    v = R4[n]
    pg = v.get('page') or ''
    pg = pg if pg.startswith('http') else ('https://www.samsung.com/sec/business/insights/case-study/' + pg + '/' if pg else '')
    u = ', '.join(sorted(used4.get(n, []))) or '쓰지 않음'
    rows4.append(f"| `r4.{n}` | `{v['addr']}` | {v['desc']} | {crop_txt(v.get('crop'))} | {u} | {pg} | {v['orig']} |")
md += f'''
## 4차 — 업종별 묶음 · 공통 레이아웃 사진 (img/fill/r4-*.json)

삼성 공식 도입사례(samsung.com/sec/business/insights/case-study) 사진 {len(R4)}장을 업종 둘씩 묶음 8개로 올렸습니다(아티팩트 한 버전의 파일 수 제한 때문 — 화면은 그 묶음이 든 장을 처음 그릴 때 한 번만 받습니다).
카드형 사진의 제목 띠 · 캡션 · 흰 여백만 떼고(‘카드 여백 · 캡션 떼기’), 최대 880px로 줄였습니다. 내용은 바꾸지 않았어요. 레이아웃에서는 `data-pid="r4.<이름>"`, 만드는 스크립트는 `build/photo/r4_photos.py` · 목록은 `build/photo/r4_spec.py`.
이 밖에 4차 레이아웃이 쓰는 `fill.*` 사진 {len(usedf)}장은 원본 빈 칸 채우기 때 올린 묶음(img/fill/*.json)이고 출처는 `src/fill_sources.md` 에 있습니다.

| 이름 | 묶음 주소 | 내용 | 처리 | 쓰는 레이아웃 | 도입사례 페이지 | 원본 이미지 |
|---|---|---|---|---|---|---|
''' + '\n'.join(rows4) + '\n'
open(OUT, 'w').write(md)
print(len(rows), 'rows ·', sum(1 for p in PHI if p not in used), 'library-only')
