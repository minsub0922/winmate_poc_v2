"""제품 묶음 파일 줄이기(아티팩트 파일 수 한도 511) — 이미 만든 묶음을 합치고 앱 데이터(products_db.json)의 주소만 고친다.
  상세 d00~d03 → d00 하나(d 번호는 모두 0)            · 4.5MB, hover 상세를 처음 열 때 한 번 받음
  갤러리 g09 → g08 뒤에 이어 붙임(g09#k → g08#(g08 길이 + k))
2026-10-19: 제품 이미지 라이브러리(img/lib 3개) 자리를 만들려고 4개를 비움. export_app.py(상세 묶음 1개) · pack_images.py(GPER2 = 600)가
처음부터 이 배치로 만든다. 다시 돌려도 안전(이미 합쳤으면 아무것도 안 함)."""
import json, os, sys, re
HERE = os.path.dirname(os.path.abspath(__file__))
APP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..')
P = os.path.join(APP, 'img', 'prod')
DBP = os.path.join(APP, 'data', 'products_db.json')
db = json.load(open(DBP, encoding='utf-8'))
changed = False

ds = sorted(f for f in os.listdir(P) if re.match(r'^d\d+\.json$', f))
if len(ds) > 1:
    items = {}
    for f in ds: items.update(json.load(open(os.path.join(P, f), encoding='utf-8'))['items'])
    json.dump({'items': items}, open(os.path.join(P, 'd00.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for f in ds[1:]: os.remove(os.path.join(P, f))
    for x in list(db['products']) + list(db['curated'].values()):
        if x.get('d') is not None: x['d'] = 0
    changed = True

g9 = os.path.join(P, 'g09.json')
if os.path.exists(g9):
    a = json.load(open(os.path.join(P, 'g08.json')))['images']; b = json.load(open(g9))['images']
    off = len(a)
    json.dump({'images': a + b}, open(os.path.join(P, 'g08.json'), 'w'), separators=(',', ':'))
    os.remove(g9)
    fix = lambda s: re.sub(r'img/prod/g09\.json#(\d+)', lambda m: f'img/prod/g08.json#{off + int(m.group(1))}', s) if isinstance(s, str) else s
    for x in list(db['products']) + list(db['curated'].values()):
        for k in ('th', 'img'):
            if k in x: x[k] = fix(x[k])
        if x.get('gal'): x['gal'] = [fix(v) for v in x['gal']]
    changed = True

if changed:
    json.dump(db, open(DBP, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('prod packs:', sorted(f for f in os.listdir(P) if f.endswith('.json')), '(changed)' if changed else '(already merged)')
