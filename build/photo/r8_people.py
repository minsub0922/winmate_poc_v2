"""8차 — 솔루션 유저 시나리오용 ‘사람이 나오는’ samsung.com 도입사례 사진 → img/fill/r8-people.json 묶음 하나.

    python3 build/photo/r8_people.py [도입사례 원본 폴더] [도입사례 목록(case_images.json)]

이름 → (도입사례 사진 id, 자르기(x0, y0, x1, y1 비율), 설명). 카드형 사진은 제목 띠 · 캡션을 잘라 사진 부분만.
build/photo/ph_images.json 에 'ph.p-<이름>' 으로 등록(addr = 묶음 주소) — 레이아웃은 그 pid 로 쓴다(gen_base.img_info).
아티팩트 파일 수 제한 때문에 묶음 하나로 올리고, 이미지 라이브러리(data/images.json)에는 넣지 않는다(make_module).
"""
import base64, io, json, os, subprocess, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work/raw5'
CASES = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/work/case_images.json'
META = {c['id']: c for c in json.load(open(CASES))}
P = {
 'oe-manager-tab':   ('c10_10', (0.0, 0.06, 1.0, 1.0), '현장 담당자가 러기드 태블릿을 들고 선 장면 (SK텔레콤 · 제조 현장)'),
 'fb-staff-tab':     ('c100_2', (0.06, 0.09, 0.63, 0.84), '직원이 손님에게 주문 태블릿 화면을 보여 주는 장면 (CJ푸드빌)'),
 'sv-mfp-user':      ('c145_1', (0.39, 0.08, 0.94, 0.9), '손님이 무인 복합기 화면을 손가락으로 조작하는 장면'),
 'pb-police-phone':  ('c152_0', (0.07, 0.03, 0.93, 0.97), '경찰관이 순찰차 옆에서 업무용 폰으로 정보를 확인하는 장면'),
 'pb-police-demo':   ('c152_3', (0.07, 0.03, 0.93, 0.97), '경찰관이 업무용 폰을 들고 무선 통신망을 시연하는 장면'),
 'rt-staff-store':   ('c158_7', (0.06, 0.0, 0.94, 0.85), '통신 매장 직원과 세로형 사이니지'),
 'oe-relax-tab':     ('c1586_2', (0.06, 0.15, 0.94, 0.88), '안마의자에 앉아 거치대 태블릿으로 영상을 고르는 사람'),
 'fb-dt-driver':     ('c159_0', (0.06, 0.03, 0.94, 0.88), '드라이브스루에서 차 안의 손님이 주문 화면을 보는 장면'),
 'fb-dt-driver2':    ('c159_1', (0.06, 0.14, 0.94, 0.85), '운전석에서 옥외 메뉴보드를 보는 손님'),
 'rt-staff-clean':   ('c162_1', (0.06, 0.18, 0.5, 0.82), '매장 직원이 무선 청소기로 바닥을 청소하는 장면'),
 'ht-kids-pool':     ('c163_3', (0.06, 0.14, 0.94, 0.85), '호텔 수영장 옆 옥외 화면 앞의 아이와 엄마'),
 'vn-cinema-view':   ('c1638_1', (0.04, 0.04, 0.95, 0.78), '대형 LED 스크린을 보는 영화관 관객'),
 'oe-kids-card':     ('c1753_4', (0.06, 0.0, 0.94, 0.9), '아이 손의 스마트폰과 카드 — 무인 기기에서 카드를 쓰는 장면'),
 'svc-ac-engineer':  ('c2731_3', (0.06, 0.25, 0.49, 0.83), '엔지니어가 천장 시스템에어컨을 점검하는 장면'),
 'svc-ac-engineer2': ('c2731_3', (0.515, 0.25, 0.93, 0.83), '안전모를 쓴 엔지니어가 천장 실내기를 점검하는 장면'),
 'oe-taxi-screen':   ('c29_2', (0.5, 0.0, 1.0, 1.0), '택시 뒷좌석 승객이 앞좌석 뒤 화면을 누르는 장면'),
 'fn-vendor-tab':    ('c45_1', (0.0, 0.0, 1.0, 1.0), '시장 상인이 결제 태블릿을 들고 웃는 장면'),
 'fn-vendor-tab2':   ('c45_6', (0.0, 0.0, 0.38, 1.0), '시장 상인이 매대에서 결제 태블릿을 쓰는 장면'),
 'fn-vendor-fish':   ('c45_6', (0.6, 0.0, 1.0, 1.0), '수산 시장 상인이 생선을 들고 웃는 장면'),
 'tp-staff-clean':   ('c46_7', (0.33, 0.05, 1.0, 1.0), '키즈카페 직원이 놀이 공간을 청소하는 장면'),
 'ed-pc-user':       ('c71_1', (0.0, 0.04, 0.6, 0.73), '실습실에서 데스크톱 PC를 쓰는 학생'),
 'ed-kid-tablet':    ('c73_2', (0.0, 0.0, 0.6, 1.0), '아이가 학습 태블릿 화면을 손가락으로 누르는 장면'),
 'mf-staff-tablet':  ('c9_5', (0.5, 0.38, 1.0, 1.0), '작업복 입은 직원 둘이 태블릿을 함께 보는 장면'),
 'rt-display-user':  ('c92_2', (0.06, 0.07, 0.58, 0.9), '쇼룸 손님이 대형 터치 화면으로 차량을 살펴보는 장면'),
 'rt-consult-store': ('c1801_3', (0.06, 0.14, 0.94, 0.85), '통신 · 가전 매장 상담석의 손님과 직원'),
 'md-reception':     ('c16_1', (0.0, 0.06, 0.49, 0.45), '병원 접수 · 수납 창구의 환자와 안내 화면'),
 'fb-dt-driver3':    ('c1490_1', (0.5, 0.22, 0.94, 0.85), '드라이브스루 운전석에서 메뉴 화면을 보는 손님'),
}
W = 880
PHI_P = os.path.join(HERE, 'ph_images.json'); PHI = json.load(open(PHI_P))
OUT = os.path.join(HERE, 'r8img'); os.makedirs(OUT, exist_ok=True)
pack = []
for i, (k, (cid, cr, desc)) in enumerate(P.items()):
    m = META[cid]; raw = os.path.join(RAW, cid + '.jpg')
    if not os.path.exists(raw): subprocess.run(['curl', '-s', '--max-time', '60', '-o', raw, m['url']], check=True)
    im = Image.open(raw).convert('RGB'); w, h = im.size
    im = im.crop((round(cr[0] * w), round(cr[1] * h), round(cr[2] * w), round(cr[3] * h)))
    if im.width > W: im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    f = os.path.join(OUT, k + '.jpg'); im.save(f, quality=78, optimize=True)
    pack.append('data:image/jpeg;base64,' + base64.b64encode(open(f, 'rb').read()).decode())
    PHI['ph.p-' + k] = {'file': f'build/photo/r8img/{k}.jpg', 'src': 'case', 'kind': 'people', 'model': '', 'desc': desc + (f" ({m['cust']})" if m.get('cust') and m['cust'] not in desc else ''),
                        'page': m['page'], 'orig': m['url'], 'w': im.width, 'h': im.height, 'bytes': os.path.getsize(f), 'addr': f'img/fill/r8-people.json#{i}'}
json.dump({'images': pack}, open(os.path.join(HERE, '..', '..', 'img', 'fill', 'r8-people.json'), 'w'))
json.dump(PHI, open(PHI_P, 'w'), ensure_ascii=False, indent=1)
print(len(P), os.path.getsize(os.path.join(HERE, '..', '..', 'img', 'fill', 'r8-people.json')) // 1024, 'KB')
