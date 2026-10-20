# F3 · L 로지스 — 메모

- 결과: 9파트 · 18장(+ 표지 1장 deck) · 전부 done · `node build/hist/check.mjs p_case_f3 --shots` 오류 0 (확인 3: 흰 여백 2 — Knox 콘솔 화면 · 배터리 제품 컷, VP_L 파트 유형 경고 1 — 의도) · `python3 build/hist/dupcheck.py p_case_f3` ✗ 0 (? 2쌍은 눈으로 확인 — 서로 다른 사진).
- 생성 스크립트: `build/hist/work/f3_gen.py` (다시 만들 때 이것을 고쳐 실행).

## 기승전결 · 장
| 막 | 파트 | 장 |
|---|---|---|
| 표지 | deck | L_C02 |
| 기 | market 늘어나는 물량, 비싸지는 사람 | L_PH_MS_A(공식 통계 4) · L_PH_MX_A(영향도 × 시급성 — 지금 대응 두 가지로 좁힘, 3 · 4번은 ‘이번 제안’) |
| 기 | customer 센터 3곳 · 410명의 입고 현장 | L_PH_CB_A · L_PH_CB_C(입고 다섯 단계) |
| 승 | challenge 7분 검수와 25% 수기 보정 | L_PH_CH_A · L_PH_CH_C(근본 원인 — ‘제안팀 분석 · 파일럿에서 확인’ 표기) |
| 전 | value 스마트폰 하나로 스캔 · 대조 · 보정 | L_PH_VP_C(한 문장 + 근거 3) · L_PH_VP_A |
| 전 | products 손에는 엑스커버7 프로, 도크에는 탭 액티브5 프로 | L_PH_P2_C(공식 사양) · L_PH_P_P |
| 전 | solution 입고 검수 전 → 후 | L_PH_VP_L · L_PH_SO_K(작업자 한 교대 4단계) |
| 결 | effect 팔레트당 4.9분이 목표 | L_PH_EF_A · L_PH_EF_Q(지표 4 · 측정 방법) |
| 결 | execution 이천 도크 2곳, 4주 파일럿 | L_PH_IP_A(착수 11/16 기준 주차) · L_PH_PL_A(이천 → 용인 · 평택) |
| 결 | closing 11/16 파일럿 착수 | L_PH_C13 · L_C07 |

## 숫자
- ledger 추가 없음. 모두 대장 · 요구사항 · 공식 값(D1 · D2 · C2 · B 표 · Knox Capture 기능)만. ‘예비 10%’는 요구사항 원문(330대 = 300 + 예비 10%).
- 목표는 ‘목표’로: 4.9분 · −30% · 수기 보정 ‘감소(목표)’ · 교대 시 기기 대기 ‘0명(목표)’. EF_A 열 머리도 ‘목표’. 확산 순서는 ‘제안’, 날짜(10/30 · 11/6 · 11/11 · 11/16)는 ‘제안’.
- CB_C 단계 수치는 단계 뜻에 맞게(① 24곳 도크 ② 280대 PDA ③ 1장씩 ④ 검수 후 ⑤ 교대마다) — 7분 · 25% · 31건은 출처(이천 2026.8 측정 · 2026 상반기 수리 이력)와 함께 부제 · CH_A로.

## 감사 반영(2차)
- 같은 사진 두 번: 장10 mobile#8(= 장07 mobile#9) · 장14 ui#8(= 장08 bs11-8-4) 모두 다른 물류 사진으로. 앞 메모의 ‘같은 사진 두 번 없음’은 틀렸던 표현 — 지금은 dupcheck ✗ 0.
- 브랜드 · 도입 전 모순: 장05 SAMSUNG 배터리(r9-bs14#4) → 단말 수리 손(r9-bs11#8, 셔츠 글자 안 보이게 아래쪽 맞춤). 장11 도입 전 흑백(SAMSUNG 태블릿 · 제약사 이름) → 브랜드 없는 라벨 스캔 흑백. 장10 ‘Columbia’ 조끼(bs14-7-2) · 장09 ‘TOPCON’(r4-mdmf#8) · 장04 ‘Sams Mexico’(bs14-3-2) · 장갑 글자(bs14-8-2) · 트럭 엔진(f3-shift-handover) 모두 교체.
- 업종 맞춤: 장03 공간02 · 장06 · 장07 · 장08 · 장11 · 장12(인물 · 2단계) · 장14(지표 1~3) · 장15 ④ · 장16 STEP 2 · 장17 사진을 물류 입고 · 검수 장면으로. 문구 m3~m15 그대로 반영.

## 새 사진 (build/hist/newimg, 주소 img/hist/…) — 23장, 가이드 한도(8장) 초과는 감사 지시로 허용
| 이름 | 쓴 장 | 내용 | 출처 페이지 |
|---|---|---|---|
| f3-aisle-check | [2.2] CB_C img2 | 선반 통로에서 단말로 박스를 확인하는 작업자 | https://insights.samsung.com/2022/11/09/why-rugged-tablets-are-replacing-legacy-warehouse-solutions-3/ |
| f3-aisle-tablet | [9.1] C13 img0 | 창고 통로에서 태블릿으로 입고 건을 확인하는 작업자 | https://insights.samsung.com/2021/03/02/internet-of-things-iot-devices-elevate-warehouse-management/ · 잘라냄 0.29,0.0,0.71,1.0 |
| f3-ar-boxes | [7.2] EF_Q img0 | 휴대폰 화면에 박스 라벨 여러 개가 인식된 장면 | https://insights.samsung.com/2021/03/24/is-a-traditional-scanner-or-rugged-device-better-for-your-warehouse-2/ |
| f3-batch-scan-app | [6.1] VP_L img1 | 휴대폰 화면에 여러 박스 바코드가 한꺼번에 스캔된 장면 | https://insights.samsung.com/2019/01/15/mobile-scanning-devices-make-barcode-scanning-easier-and-faster/ |
| f3-forklift-aisle-gray | [3.2] CH_C img0 | 물류센터 통로와 지게차(흑백 처리) | https://insights.samsung.com/2022/10/11/how-retailers-can-deploy-a-connected-associate-program-at-scale/ · 흑백 · 잘라냄 0.34,0.0,0.66,1.0 |
| f3-forklift-tab | [8.1] IP_A img3 | 지게차에 단 태블릿으로 작업을 확인하는 작업자 | https://insights.samsung.com/2021/03/24/is-a-traditional-scanner-or-rugged-device-better-for-your-warehouse-2/ |
| f3-handheld-box | [2.2] CB_C img1 | 박스와 전용 단말을 든 작업자 | https://insights.samsung.com/2026/04/14/from-dispatch-to-doorstep-how-modern-tablets-like-galaxy-tab-a11-are-streamlining-delivery-operations/ |
| f3-inventory-dock | [7.2] EF_Q img1 | 재고 화면을 확인하는 관리자와 거치한 탭 액티브5 | https://www.samsung.com/us/business/mobile/tablets/galaxy-tab-active/explore/ · 잘라냄 0.0,0.0,1.0,0.9 |
| f3-kc-label-scan | [7.1] EF_A img0 | 장갑 낀 손의 갤럭시 러기드 폰으로 박스 라벨을 Knox Capture 스캔하는 장면 (samsung.com 러기드) | https://www.samsung.com/uk/business/mobile/rugged/ |
| f3-kc-tab-boxes | [4.2] VP_A img0 | 탭 액티브5의 Knox Capture로 박스 라벨을 스캔 | https://www.samsung.com/us/business/mobile/tablets/galaxy-tab-active/explore/ |
| f3-label-scan-gray | [6.1] VP_L img0 | 도입 전 장면 · 박스 라벨을 한 장씩 스캔(흑백 처리) | https://insights.samsung.com/2022/10/11/how-retailers-can-deploy-a-connected-associate-program-at-scale/ · 흑백 |
| f3-mounted-tab | [5.1] P2_C img2 | 거치대에 단 탭 액티브5 · 물류 야드 | https://insights.samsung.com/2026/07/10/how-mobile-devices-deliver-resilient-fleet-operations-from-yard-to-field/ |
| f3-pallet-jack | [2.1] CB_A img2 | 입고 도크 · 팔레트를 옮기는 작업자 | https://insights.samsung.com/2017/06/23/warehouse-operations-go-hands-free-with-wearable-tech/ |
| f3-ptt-worker | [2.2] CB_C img4 | 안전모를 쓰고 휴대폰으로 연락하는 창고 작업자 | https://insights.samsung.com/2021/02/17/what-is-the-best-rugged-mobile-device-for-warehouse-and-logistics/ |
| f3-shelf-label-scan | [3.1] CH_A img0 | 선반 박스 라벨을 휴대폰으로 한 장씩 스캔 | https://insights.samsung.com/2021/03/24/is-a-traditional-scanner-or-rugged-device-better-for-your-warehouse-2/ |
| f3-shift-crew | [7.2] EF_Q img2 | 창고에서 운반 카트를 미는 작업자들 | https://insights.samsung.com/2026/04/14/from-dispatch-to-doorstep-how-modern-tablets-like-galaxy-tab-a11-are-streamlining-delivery-operations/ |
| f3-spen-glove | [6.2] SO_K img2 | 장갑 낀 손으로 탭 액티브5에 S펜 입력 | https://www.samsung.com/us/business/mobile/tablets/galaxy-tab-active/explore/ |
| f3-tab-battery | [6.2] SO_K img4 | 갤럭시 탭 액티브5 프로 교체형 배터리 두 개 (듀얼 핫스왑) | https://www.samsung.com/sec/business/tablets/galaxy-tab-active5-pro-sm-x356/SM-X356NZGAKOO/ |
| f3-unload-boxes | [8.2] PL_A img1 | 입고 현장 · 박스를 내리는 작업자 | https://insights.samsung.com/2017/03/06/legacy-mobile-solutions-nearing-end-of-life-in-warehouses-distribution-centers/ |
| f3-wh-phone-scan | [5.2] P_P img0 | 창고에서 휴대폰으로 바코드를 스캔하는 작업자 | https://insights.samsung.com/2022/03/08/simplify-barcode-reader-deployment-with-knox-platform-for-enterprise/ |
| f3-wh-tablet-man | [5.2] P_P img1 | 창고에서 태블릿으로 입고 건을 확인하는 관리자 | https://insights.samsung.com/2022/03/01/supply-chain-management-2022-how-logistics-can-navigate-the-speed-bumps/ |
| f3-wms-task-phone | [4.1] VP_C img0 | 박스 앞에서 휴대폰 업무 화면으로 입고 수량을 확인 | https://insights.samsung.com/2021/11/11/how-ivanti-velocity-is-migrating-warehouses-from-green-screens-to-android-smartphones/ |
| f3-worker-rugged | [6.2] SO_K img0 | 창고에서 러기드 단말을 확인하는 작업자 | https://insights.samsung.com/2022/10/04/5-ways-to-make-your-warehouse-mobile-2/ · 잘라냄 0.08,0.0,0.5,1.0 |

- insights.samsung.com(삼성 공식 B2B 블로그 Samsung Business Insights) 사진 18장: 사진 주소가 images.samsung.com 이 아닌 CDN(s47295.pcdn.co)이라 `addphoto.py` 가 받지 않아, 같은 출력 형식(.jpg + .json, dist/img/hist 사본)의 `build/hist/work/f3_insfetch.py` 로 가져옴(json 에 page · orig · crop · gray · site 기록). f3-ar-boxes · f3-forklift-tab · f3-forklift-aisle-gray · f3-handheld-box 의 page 는 그 사진이 실린(관련 글 썸네일 포함) insights 페이지. 파일 이름에 GettyImages 가 붙은 사진은 쓰지 않음.
- 빠진(지운) 내 사진: f3-gloved-rugged · f3-hardhat-tab · f3-picking-carts · f3-scan-station · f3-scan-tablet-gray · f3-shift-handover (newimg · dist/img/hist 둘 다).
- 남은 Unsplash 3장(bs14-1-t0 MS_A · bs14-7-0 CB_A 공간02 · bs14-7-6 CH_A) · stock 1장(img/cover/MF.jpg MX_A).

## 남은 점
- 브랜드 없는 ‘전용 PDA(스캐너 건)’ 단독 사진은 samsung.com · insights 에서 찾지 못함 — ‘지금’ 장면은 상표가 안 보이는 핸드헬드 · 휴대폰 스캔 사진과 흑백 처리로 대신. 장04 ② 사진(f3-handheld-box)은 배경이 매장 진열대(흐림).
- 장04 ① r8-people#22(백광의약품 직원 · 종이 확인)는 ‘종이 지시서’에 가장 맞아 유지 — 명찰 · 박스 글자는 칸 크기에서 읽히지 않음.
- 도구 메모: addphoto.py 는 images.samsung.com 만 받아 insights 사진은 별도 스크립트로 우회(위). 그 밖에 문제 없음.
