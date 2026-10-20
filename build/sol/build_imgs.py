import sys; sys.path.insert(0, '/home/claude/gen')
from imgtools import *
import qrcode
CS = 'https://www.samsung.com/sec/business/insights/case-study/'
IMG = 'https://images.samsung.com/'
SMO = 'https://www.samsung.com/sec/business/small-medium-office/'
GOV = 'https://www.samsung.com/sec/business/government/'
FF = CS + 'reference-fastfive/'; FFB = CS + 'reference-fastfive_bespoke/'
BIOT = 'https://www.samsung.com/sec/business/b-iot-solutions/b-iot-cloud/'

# ---------- P01 cover ----------
im = crop_aspect(load('factorialSeongsu_pc_01.jpg'), (72, 304, 1271, 959), 1280 / 656, (0.5, 0.5))
im = darken_grad(im, x_from=0.62, strength=0.62, side='left', overall=0.8)
save('p01_cover', im, 'photo', '목재 천장과 펜던트 조명 아래 소파 · 카페 좌석이 놓인 오피스 라운지 (팩토리얼 성수)', CS + 'factorial_seongsu/', IMG + 'kdp/static/business/insights/case-study/factorialSeongsu/factorialSeongsu_pc_01.jpg', '사진 부분만 자르기 · 왼쪽(제목 자리) 어둡게')
# ---------- P02 ----------
save('p02_work', crop_aspect(load('flippro_2.jpg'.replace('_2', '_10')), (20, 0, 700, 640), 1.0, (0.45, 0.5)), 'photo', '이동식 스탠드의 Flip Pro 앞에서 협업하는 사람들', 'https://www.samsung.com/sec/business/smart-signage/flip-pro-wmfx/LH55WMFWBGCXKR/', 'samsung.com Flip Pro 상세 페이지 특장점 이미지', '정사각형 자르기', maxw=420, maxh=420)
save('p02_lounge', crop_aspect(load('hand3.jpg'), (74, 131, 1264, 845), 1.0, (0.62, 0.5)), 'photo', '식물과 무풍 갤러리 에어컨이 놓인 밝은 라운지 (더한섬하우스 광주)', CS + 'reference-Thehandsomehaus/', IMG + 'kdp/editor/board/202106/fd77b7ba-2494-41a7-89b6-158fb8040385.jpg', '사진 부분 · 정사각형', maxw=420, maxh=420)
save('p02_biot', crop_aspect(load('biot_bld.png'), (0, 0, 720, 730), 1.0, (0.5, 0.6)), 'photo', 'b.IoT 사인이 붙은 유리 외벽 빌딩', 'https://www.samsung.com/sec/business/office/', IMG + 'kdp/business/office/mo/construction_office_bg_01.png', '정사각형 자르기', maxw=420, maxh=420)
# ---------- P04 ----------
im = load('gov__3_1.jpg').convert('RGB'); arr = np.asarray(im)
lm = line_mask(arr.shape, [(553, 362, 553, 447), (553, 446, 575, 446)], w=5, dots=[(553.5, 365)], r=8)
im = inpaint_fsr(im, [(558, 420, 806, 548), (1005, 124, 1238, 247)], lm, dil=2, best=False)
im = put_cut(im, trim_alpha(Image.open(CUT + '/flippro_stand.png'), 0), 712, 664, 292, shadow=55, sw=0.85)
save('p04_lobby', im.crop((0, 0, 873, 680)), 'photo', '대형 디스플레이 벽면 · 안내 데스크가 있는 로비 + 이동식 Flip Pro (Flip Pro 제품 컷 합성)', GOV, IMG + 'is/image/samsung/p5/sec/business/government/business_ci_slide3_1.jpg', '빈 설명 상자 · 지시선 지우기 · Flip Pro 스탠드 컷 합성(상세 페이지 제품 이미지)')
save('p04_sign', crop_aspect(load('sign98_3.jpg'), (0, 0, 1440, 680), 603.86 / 471.64, (0.92, 0.5)), 'photo', '로비 벽면의 단독형 사이니지와 화분', 'https://www.samsung.com/sec/business/smart-signage/package-uhd-e-lh98qecedgc-w/LH98QECEDGC-W/', 'samsung.com 단독형 UHD E 상세 페이지 특장점 이미지', '오른쪽 기준 자르기')
# ---------- P05 ----------
save('p05_private', crop_aspect(load('ff2.jpg'), (75, 48, 657, 440), 591.08 / 472.17, (0.3, 0.5)), 'photo', '이동식 Flip으로 회의하는 소규모 프라이빗 오피스 (패스트파이브)', FF, IMG + 'is/image/samsung/p5/sec/business/insights/case-study/2020/01/02-31.jpg', '왼쪽 사진만 자르기')
im = load('gov__3_2.jpg').convert('RGB'); arr = np.asarray(im)
lm = line_mask(arr.shape, [(322, 98, 322, 220), (322, 100, 354, 100), (567, 231, 567, 335), (567, 233, 599, 233), (816, 46, 816, 90), (816, 88, 840, 88), (843, 334, 843, 388), (843, 336, 937, 336)], w=5, dots=[(322, 218), (567, 333), (816, 48), (843, 386)], r=8)
im = inpaint_fsr(im, [(346, 72, 576, 203), (591, 204, 778, 336), (832, 62, 1153, 209), (929, 306, 1111, 430)], lm, dil=3, best=True)  # FSR_BEST — 벽 모서리 · 창틀 이어짐
save('p05_open', im.crop((115, 0, 965, 680)), 'photo', 'Flip · 디지털 복합기 · 노트북이 놓인 오픈형 오피스 (렌더)', GOV, IMG + 'is/image/samsung/p5/sec/business/government/business_ci_slide3_2.jpg', '빈 설명 상자 · 지시선 지우기')
save('p05_book', trim_alpha(Image.open(CUT + '/book_45.png')), 'cut', '갤럭시 북6 Pro 제품 컷 (정측면 45도)', 'https://www.samsung.com/sec/business/notebook/galaxy-book6-pro-nt941xjg-kr511/NT941XJG-KR511/', IMG + 'kdp/goods/2026/03/13/32488755-835f-4545-b29c-c5c1a7036248.png', '투명 배경 · 여백 자르기', maxw=320, maxh=240)
# ---------- P06 ----------
im = crop_aspect(load('pc1.jpg'), (75, 470, 1266, 940), 1209.64 / 465.86, (0.5, 0.4))
im = darken_grad(im, x_from=0.42, strength=0.6, side='right', overall=0.9)
save('p06_print', im, 'photo', '디지털 복합기와 결제 키오스크가 놓인 24시간 무인 프린트 매장 (프린트카페)', CS + 'reference-PRINTCAFE/', IMG + 'kdp/editor/board/202311/357c5e74-07f3-4466-a420-b2a4ec48f2be.jpg', '사진 부분 가로로 자르기 · 오른쪽(문구 자리) 어둡게')
# ---------- P07 ----------
save('p07_flip', crop_aspect(load('flippro_2.jpg'), (110, 0, 1010, 640), 607.86 / 472.59, (0.5, 0.5)), 'photo', '벽면 Flip Pro에 직접 필기하며 발표하는 회의', 'https://www.samsung.com/sec/business/smart-signage/flip-pro-wmfx/LH55WMFWBGCXKR/', 'samsung.com Flip Pro 상세 페이지 특장점 이미지', '가로 자르기')
save('p07_video', crop_aspect(load('gov__1_2.jpg'), (140, 0, 1440, 680), 601.74 / 471.12, (0.0, 0.5)), 'photo', '벽면 디스플레이로 원격 참석자와 화상 회의하는 팀 (렌더)', GOV, IMG + 'is/image/samsung/p5/sec/business/government/business_ci_slide1_2.jpg', '왼쪽 기준 자르기')
save('p07_book', trim_alpha(Image.open(CUT + '/book_front.png')), 'cut', '갤럭시 북6 Pro 제품 컷 (오픈 정면)', 'https://www.samsung.com/sec/business/notebook/galaxy-book6-pro-nt941xjg-kr511/NT941XJG-KR511/', IMG + 'kdp/goods/2026/03/13/e970d584-5eb2-479f-aa3d-5c5fdda332c6.png', '투명 배경 · 여백 자르기', maxw=380, maxh=280)
# ---------- P08 ----------
inf = trim_alpha(Image.open(CUT + '/inf_front.png'), 0)
im = load('office_ci_slide_pc_1_2_1.png').convert('RGB').crop((0, 0, 720, 680)); arr = np.asarray(im)
lines = np.zeros(arr.shape[:2], np.uint8)
for r in [(320, 150, 400, 225), (240, 435, 290, 470), (560, 545, 640, 580)]: lines |= blue_lines(arr, r)
im = inpaint_fsr(im, [(372, 155, 582, 261), (56, 248, 274, 353), (273, 399, 476, 478), (343, 500, 569, 602), (604, 432, 718, 652)], lines, dil=3, best=False)
im = put_cut(im, inf, 662, 650, 236, shadow=60)
save('p08_office', im.crop((0, 40, 720, 602)), 'photo', '천장 무풍 시스템에어컨 · 제트 · 에어모니터 · 공기청정기가 있는 사무실 (렌더)', SMO, IMG + 'kdp/_pub/office/office_ci_slide_pc_1_2_1.png', '설명 라벨 지우기 · 큐브 공기청정기 자리에 Infinite AI 공기청정기 컷 합성')
save('p08_airmon', trim_alpha(Image.open(CUT + '/airmon_front.png')), 'cut', '에어모니터 플러스 제품 컷 (정면, 온도 · 습도 · PM2.5)', 'https://www.samsung.com/sec/business/cooling-for-residential/airmonitor-acm-b1m1sc/ACM-B1M1SC/', IMG + 'kdp/goods/2022/05/12/efe52456-013a-4808-834f-e10876c58a1b.png', '투명 배경 · 여백 자르기', maxw=180, maxh=180)
save('p08_sac', trim_alpha(Image.open(CUT + '/sac_open.png')), 'cut', '무풍 4Way 시스템에어컨 제품 컷 (열림)', 'https://www.samsung.com/sec/business/cooling-single/ac-cn4pbh1/AC060CN4PBH1/', IMG + 'kdp/goods/2025/07/17/13a35b9f-0de0-4d07-be98-cc6d3c8e07c3.png', '투명 배경 · 여백 자르기', maxw=260, maxh=170)
save('p08_inf', trim_alpha(Image.open(CUT + '/inf_front.png')), 'cut', 'Infinite AI 공기청정기 제품 컷 (정면)', 'https://www.samsung.com/sec/business/air-cleaners/air-purifier-ap90h10198dd-d2c/AP90H10198EDD/', IMG + 'kdp/goods/2026/01/09/19999fd1-37c5-4ec9-ab7f-d24a1b7b6448.png', '투명 배경 · 여백 자르기', maxw=110, maxh=340)
# ---------- P09 ----------
im = load('office_ci_slide_pc_1_3.png').convert('RGB'); arr = np.asarray(im)
lines = blue_lines(arr, (1270, 460, 1340, 500))
im = inpaint_fsr(im, [(258, 234, 458, 339), (518, 176, 721, 281), (997, 130, 1198, 235), (39, 430, 276, 538), (557, 486, 790, 591), (1061, 443, 1286, 548), (418, 348, 546, 608)], lines, dil=3, best=False)
im = put_cut(im, inf, 482, 606, 262, shadow=70)
save('p09_lounge', im.crop((0, 40, 1440, 602)), 'photo', '비스포크 냉장고 · 정수기 · 세로 TV · 에어드레서 · 슈드레서가 있는 사내 라운지 (렌더)', SMO, IMG + 'kdp/_pub/office/office_ci_slide_pc_1_3.png', '설명 라벨 지우기 · 큐브 공기청정기 자리에 Infinite AI 공기청정기 컷 합성')
# ---------- P10 ----------
save('p10_main', crop_aspect(load('ffb4.jpg'), (74, 147, 1265, 940), 890.45 / 471.68, (0.5, 0.62)), 'photo', '노란 비스포크 냉장고와 파란 소파가 있는 오피스 카페 (패스트파이브 역삼3호점)', FFB, IMG + 'is/image/samsung/p5/sec/business/insights/case-study/2020/07/04-1.jpg', '제목 띠 · 캡션 떼고 자르기')
im = load('ffb2.jpg').convert('RGB'); arr = np.asarray(im)
im = inpaint(im, [(356, 271, 471, 307)], line_mask(arr.shape, [(323, 319, 364, 288)], w=4, dots=[(323, 319)], r=10), radius=7, dil=2)
save('p10_coral', crop_aspect(im, (74, 42, 1266, 838), 306.44 / 231.08, (0.5, 0.5)), 'photo', '새틴 코랄 비스포크 냉장고와 테이블이 있는 카페 공간 (패스트파이브 역삼3호점)', FFB, IMG + 'is/image/samsung/p5/sec/business/insights/case-study/2020/07/02-2.jpg', '색상 이름표 지우기 · 캡션 떼고 자르기', maxw=470, maxh=360)
im = load('ffb3.jpg').convert('RGB'); arr = np.asarray(im)
im = inpaint(im, [(905, 358, 1025, 397)], line_mask(arr.shape, [(1018, 378, 1060, 414)], w=4, dots=[(1059, 413)], r=10), radius=7, dil=2)
save('p10_mint', crop_aspect(im, (74, 144, 1264, 936), 306.44 / 227.53, (0.5, 0.5)), 'photo', '코타 민트 비스포크 냉장고 수납장과 테이블이 있는 휴게 공간 (패스트파이브 역삼3호점)', FFB, IMG + 'is/image/samsung/p5/sec/business/insights/case-study/2020/07/03-1.jpg', '색상 이름표 지우기 · 제목 띠 · 캡션 떼고 자르기', maxw=470, maxh=360)
# ---------- P11 ----------
save('p11_map', load('biot3.jpg').crop((424, 23, 1044, 643)), 'ui', 'b.IoT Cloud와 상업용 빌딩 · 관공서 · 지점 오피스 · 소규모 점포 · 프랜차이즈 · 교육시설 연결 도식', BIOT, IMG + 'kdp/cms_contents/101229/52e55d10-a92a-4fca-8b76-d380d5ff582d.jpg', '가운데 원형 도식 자르기', maxw=330, maxh=330)
save('p11_dash', load('biot17.jpg').crop((975, 52, 1319, 300)), 'ui', 'b.IoT Cloud 대시보드 화면 (기기 상태 · 에너지 막대 그래프)', BIOT, IMG + 'is/image/samsung/sec-feature-b-iot-cloud-309031453', '대시보드 화면 부분 자르기')
save('p11_remote', load('biot19.jpg').crop((1015, 225, 1339, 541)), 'people', '모니터로 현장 기기 상태를 함께 확인하는 관리자 (b.IoT 고장 관리)', BIOT, IMG + 'is/image/samsung/sec-feature-b-iot-cloud-309031472', '사진 부분 자르기')
# ---------- P12 ----------
save('p12_main', load('ff1.jpg').crop((76, 48, 1252, 814)), 'photo', 'Flip 앞에서 회의하는 입주사 (패스트파이브 삼성3호점)', FF, IMG + 'is/image/samsung/p5/sec/business/insights/case-study/2020/01/01-31.jpg', '명세 크롭(좌 5.6% · 위 5.5% · 우 6.6% · 아래 6.7%)', maxw=1180, maxh=800)
save('p12_room', load('ff4.jpg').crop((172, 50, 664, 377)), 'photo', '유리 회의실이 늘어선 업무 공간 (패스트파이브 삼성3호점)', FF, IMG + 'is/image/samsung/p5/sec/business/insights/case-study/2020/01/04-31.jpg', '명세 크롭(왼쪽 사진)')
save('p12_desk', load('ff4.jpg').crop((774, 70, 1265, 377)), 'photo', '라운지 데스크에서 노트북으로 일하는 입주사 (패스트파이브 삼성3호점)', FF, IMG + 'is/image/samsung/p5/sec/business/insights/case-study/2020/01/04-31.jpg', '명세 크롭(오른쪽 사진)')
# ---------- P13 ----------
save('p13_fridge', crop_aspect(load('ffb1.jpg'), (74, 251, 540, 759), 360.7 / 390.98, (0.5, 0.5)), 'photo', '노란 비스포크 냉장고가 들어간 카페 카운터 (패스트파이브 역삼3호점)', FFB, IMG + 'kdp/editor/board/202311/4b275399-f87e-4105-a9ca-a6617a2cea4a.jpg', '왼쪽 사진만 자르기')
save('p13_sofa', crop_aspect(load('ffb1.jpg'), (556, 251, 1267, 759), 534.1 / 390.98, (0.5, 0.5)), 'photo', '파란 소파와 비스포크 냉장고가 있는 오피스 카페 (패스트파이브 역삼3호점)', FFB, IMG + 'kdp/editor/board/202311/4b275399-f87e-4105-a9ca-a6617a2cea4a.jpg', '오른쪽 사진만 자르기')
# ---------- P14 ----------
save('p14_work', crop_aspect(load('office_ci_kv_pc1.png'), (0, 0, 1440, 600), 166.6 / 130.17, (0.5, 0.5)), 'photo', '파티션 데스크가 놓인 업무 공간 (흑백 렌더)', SMO, IMG + 'kdp/_pub/office/office_ci_kv_pc1.png', '가운데 자르기', maxw=340, maxh=270)
save('p14_meet', crop_aspect(load('sign98_2.jpg'), (0, 0, 1440, 680), 228.73 / 130.16, (0.5, 0.4)), 'photo', '대형 디스플레이가 걸린 회의실', 'https://www.samsung.com/sec/business/smart-signage/package-uhd-e-lh98qecedgc-w/LH98QECEDGC-W/', 'samsung.com 단독형 UHD E 상세 페이지 특장점 이미지', '가운데 자르기', maxw=460, maxh=270)
save('p14_lounge', crop_aspect(load('hand5.jpg'), (74, 136, 1265, 852), 246.39 / 130.51, (0.5, 0.55)), 'photo', '비스포크 에어드레서와 카페 테이블이 있는 라운지 (더한섬하우스 광주)', CS + 'reference-Thehandsomehaus/', IMG + 'kdp/editor/board/202106/71283091-c1b2-4f7b-952d-39b65e0a933c.jpg', '사진 부분 · 가로 자르기', maxw=500, maxh=270)
CUTS = [
 ('c_sign', 'sign_30.png', '스마트 사이니지 단독형 UHD E (왼쪽 30도)', 'https://www.samsung.com/sec/business/smart-signage/package-uhd-e-lh98qecedgc-w/LH98QECEDGC-W/', 'kdp/goods/2024/08/26/8042ed08-4538-4094-ac84-4d7f2be94e04.png', 220, 170),
 ('c_mx', 'mx_front.png', '디지털 복합기 MX Pro (A3 컬러 MX6) 정면', 'https://www.samsung.com/sec/business/digital-multifunction-printers/a3-color-dmfp-mx6-x6350z/SL-X6350ZX/', 'kdp/goods/2023/01/27/970b465f-f565-4cb7-89ca-48eedf233617.png', 170, 220),
 ('c_flip45', 'flippro_45.png', 'Flip Pro 전자칠판 (정측면 45도)', 'https://www.samsung.com/sec/business/smart-signage/flip-pro-wmfx/LH55WMFWBGCXKR/', 'kdp/goods/2026/03/17/4bba0d2a-ca98-4507-8b7f-477bfcdde065.png', 200, 200),
 ('c_flipfront', 'flippro_front.png', 'Flip Pro 전자칠판 (정면)', 'https://www.samsung.com/sec/business/smart-signage/flip-pro-wmfx/LH55WMFWBGCXKR/', 'kdp/goods/2026/10/15/5547a3f8-39a9-4bbe-9a93-7493d39f6312.png', 220, 160),
 ('c_sacfront', 'sac_front.png', '무풍 4Way 시스템에어컨 (정면)', 'https://www.samsung.com/sec/business/cooling-single/ac-cn4pbh1/AC060CN4PBH1/', 'kdp/goods/2025/07/17/3206bef9-245b-4413-a6ce-b617eb160bea.png', 170, 170),
 ('c_airmon45', 'airmon_45.png', '에어모니터 플러스 (오른쪽 45도)', 'https://www.samsung.com/sec/business/cooling-for-residential/airmonitor-acm-b1m1sc/ACM-B1M1SC/', 'kdp/goods/2022/05/12/68f05652-25ce-4a27-8e60-adb847948356.png', 130, 130),
 ('c_infopen', 'inf_open.png', 'Infinite AI 공기청정기 (청정부스터 열린 측면)', 'https://www.samsung.com/sec/business/air-cleaners/air-purifier-ap90h10198dd-d2c/AP90H10198EDD/', 'kdp/goods/2026/01/09/0d172898-6958-48ac-8712-c406cb636755.png', 110, 300),
 ('c_jet', 'jet_front.png', '제트 핏 무선청소기 (거치대 정면)', 'https://www.samsung.com/sec/business/vacuum-cleaners/jet-vs70h18gzg-d2c/VS70H18GZK/', 'kdp/goods/2025/12/01/dbf5cf6f-ff32-45ee-b897-7f8c8e85b2cd.png', 110, 300),
 ('c_fridge', 'fridge1_front.png', 'Bespoke 냉장고 1도어 키친핏 (코타 화이트)', 'https://www.samsung.com/sec/business/refrigerator/one-door-rr40c7895ap-d2c/RR40C7895AP/', 'kdp/goods/2023/05/15/c89312a2-2c83-4123-a467-1305423f3647.png', 110, 300),
 ('c_water', 'water_front.png', 'Bespoke AI 정수기 (사틴 그레이지)', 'https://www.samsung.com/sec/business/water-purifier/water-purifier-rwp70f15anb-d2c/RWP70F15ANW/', 'kdp/goods/2025/07/24/727c0469-ac48-44f0-9d0d-0503b5ca5c1f.png', 140, 280),
 ('c_dresser', 'dresser_front.png', 'Bespoke AI 에어드레서 (크리스탈 미러)', 'https://www.samsung.com/sec/business/airdresser/airdresser-df18cb8700cr-d2c1/DF18CB8700CR/', 'kdp/goods/2023/01/25/2e4a1610-1453-4a05-96b1-2c92505441eb.png', 100, 300),
 ('c_erv', 'erv_45.png', '시스템 청정환기 (오른쪽 45도)', 'https://www.samsung.com/sec/business/ventilations/system-clean-ventilation-an005cn1pbn1/AN005CN1PBN1/', 'kdp/goods/2023/05/12/0b45ac93-17d6-4024-84bd-1d402ea1f7fd.png', 260, 110),
]
for key, f, alt, page, src, mw, mh in CUTS:
    im = Image.open(CUT + '/' + f)
    if im.mode == 'P' or im.mode == 'LA': im = im.convert('RGBA')
    save(key, trim_alpha(im), 'cut', alt, page, IMG + src, '투명 배경 · 여백 자르기', maxw=mw, maxh=mh)
# ---------- QR (실제 samsung.com 주소) ----------
QR = [('qr_sign', 'https://www.samsung.com/sec/business/smart-signage/', '스마트 사이니지'),
      ('qr_book', 'https://www.samsung.com/sec/business/notebook/galaxy-book6-pro-nt941xjg-kr511/NT941XJG-KR511/', '갤럭시 북6 Pro'),
      ('qr_mx', 'https://www.samsung.com/sec/business/digital-multifunction-printers/a3-color-dmfp-mx6-x6350z/SL-X6350ZX/', '디지털 복합기 MX6'),
      ('qr_flip', 'https://www.samsung.com/sec/business/smart-signage/flip-pro-wmfx/LH55WMFWBGCXKR/', 'Flip Pro'),
      ('qr_airmon', 'https://www.samsung.com/sec/business/cooling-for-residential/airmonitor-acm-b1m1sc/ACM-B1M1SC/', '에어모니터 플러스'),
      ('qr_fridge', 'https://www.samsung.com/sec/business/refrigerator/one-door-rr40c7895ap-d2c/RR40C7895AP/', 'Bespoke 냉장고'),
      ('qr_biot', BIOT, 'b.IoT Cloud'),
      ('qr_ff', FF, '패스트파이브 도입사례'),
      ('qr_ffb', FFB, '패스트파이브 비스포크 도입사례')]
for key, url, name in QR:
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2, box_size=8); q.add_data(url); q.make(fit=True)
    im = q.make_image(fill_color='black', back_color='white').convert('L')
    save(key, im.resize((264, 264), Image.NEAREST) if im.size[0] < 264 else im, 'qr', f'QR 코드 — {name} 페이지 ({url})', url, url, 'qrcode(오류 정정 M)로 새로 생성')
dump()
