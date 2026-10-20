# 5차 — 경쟁사 제품 자리 실루엣(img/ph/gen-rival-*.png, 회색 · 브랜드 없음)을 ph_images.json 에 등록 (여러 번 돌려도 같음)
# 아티팩트 파일 수 제한 때문에 그림은 묶음 하나(img/fill/r5-rival.json, fillpack.js 가 읽음)로 올리고 이미지 라이브러리(data/images.json)에는 넣지 않는다.
# 그림 자체는 SVG 로 그려 만들었다(삼성 · 경쟁사 제품 사진이 아님). 장표에서는 ‘경쟁사 제품 사진(공개 자료)으로 교체’ 자리 표시.
import json, base64
from PIL import Image
P = 'build/photo/ph_images.json'
d = json.load(open(P))
KIND = {'signage': '사이니지', 'kiosk': '키오스크', 'outdoor': '옥외 사이니지', 'tablet': '태블릿', 'cassette': '천장형 에어컨', 'led': 'LED 캐비닛'}
pack = []
for i, (k, nm) in enumerate(KIND.items()):
    f = f'img/ph/gen-rival-{k}.png'
    w, h = Image.open(f).size
    pack.append('data:image/png;base64,' + base64.b64encode(open(f, 'rb').read()).decode())
    d[f'ph.gen-rival-{k}'] = {'file': f, 'src': 'gen', 'kind': 'cut', 'model': '', 'desc': f'경쟁사 제품 자리 · 일반 형태 실루엣({nm}) — 경쟁사 제품 사진(공개 자료)으로 교체',
                              'page': 'Winmate에서 그린 일반 형태 그림 (특정 제품 아님)', 'orig': '', 'w': w, 'h': h, 'addr': f'img/fill/r5-rival.json#{i}', 'bytes': len(open(f, 'rb').read())}
d.pop('ph.gen-rival-phone', None)
json.dump({'images': pack}, open('img/fill/r5-rival.json', 'w'))
json.dump(d, open(P, 'w'), ensure_ascii=False, indent=1)
print(len(d))
