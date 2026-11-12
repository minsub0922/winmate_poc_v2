# DSS DB 업데이트 — dss-20261112-1445

- RUN_AT: 2026-11-12T14:45:05+09:00 (KST) · 실행: `.agents/skills/winmate-update-dss-db` · 도구: `proddb/build/dss/`
- 원장: `proddb/dss/ledger.json` — 확인 1094건(제품 1055 · 앱 솔루션 16 · 버티컬 솔루션 23), 첫 원장(지난 표식 없음)

## 소스 완전성

| 채널 | 결과 |
|---|---|
| samsung.com/sec/business 목록 | 51개 분류 complete(총수 = 받은 수, 상품 카드 597). ac-clean · 에어컨 케어서비스는 분류 페이지가 번호를 더 내놓지 않아 지난 번호로 목록 API 확인. printing-solutions 는 지난 수집과 같이 failed(이 분류에만 근거가 있던 DSS 없음) |
| 스펙 API · PDP | 스펙 1,125건 complete. PDP 596/597 — G000181220 HTTP 500(지난 수집도 같음, 목록 · 스펙으로 확인) |
| e-카탈로그 69권 | 같음 65 · 개정 1(Dir 355 리플릿) · 정기 호 교체 1(비즈니스 종합 Dir 360 → 364, 99쪽 변경 + 4쪽 추가) · 새 권 2(218 삼성 콜드체인 시스템 · 365 에센셜 모니터) · 빠짐 2(203 DVM Home 일반용 — 'Dir does not exist', 360 지난 호) |
| 솔루션 · 분류 · 근거 URL 105개 | 200: 88 · 실패 17 — 분류 URL 404 14개는 이번 수집이 쓴 목록 주소로 교체, Knox Suite 보조 페이지 404 2개는 새 주소로 교체, 비 ASCII URL 2개 중 PDF 1개는 인코딩해 200 확인, 뉴스룸 기사 1개는 확인 못 함(같은 솔루션의 다른 공식 출처로 표식) |

## DSS 결과

| 종류 | 결과 |
|---|---|
| device | active 914 · changed 37 · new 16 · unresolved 12 · deprecated 17 |
| solution | active 90 · changed 1 |
| service | active 35 · changed 1 · unresolved 1 |

`changed` 는 제품 사실(이름 · 모델 · 옵션 · 사양 · 특장점)이 바뀐 것만 센다. e-카탈로그 근거(권 · 쪽)만 옮겨진 행 · 상세는 원장 note 에 "근거 이동"으로 남겼다(360 → 364 · 203 → 297/287).

### 새 항목 16

| id | 이름 | 근거 |
|---|---|---|
| sg_g000184305 | 에센셜 모니터 G3 G31H FHD 144Hz (LS24HG314) | 사이트 G000184305 |
| sg_g000184308 | 에센셜 모니터 G3 G32H FHD 144Hz (LS24HG324) | 사이트 G000184308 |
| sg_g000184309 | 에센셜 모니터 G3 G35H FHD 144Hz (LS27HG356) | 사이트 G000184309 |
| ec_218_001 | 인버터 콘덴싱 유닛 ACU (아르네코리아) | e-카탈로그 Dir 218 p.12 |
| ec_218_002 | 콘덴싱 유닛 BCAV-ZFI 정속형 스크롤 (부성) | e-카탈로그 Dir 218 p.12 |
| ec_218_003 | 콘덴싱 유닛 BCAV 정속형 반밀폐 왕복동 (부성) | e-카탈로그 Dir 218 p.13 |
| ec_218_004 | 콘덴싱 유닛 ICAR 분리형 공냉식 (부성) | e-카탈로그 Dir 218 p.14 |
| ec_218_005 | 콘덴싱 유닛 BMUR 분리형 왕복동 멀티 (부성) | e-카탈로그 Dir 218 p.14 |
| ec_218_006 | 콘덴싱 유닛 WCUR 분리형 스크류 (부성) | e-카탈로그 Dir 218 p.14 |
| ec_218_007 | 유닛 쿨러 BUK (부성) | e-카탈로그 Dir 218 p.15 |
| ec_218_008 | 저장고 패널 Brim 타입 (아르네코리아) | e-카탈로그 Dir 218 p.18 |
| ec_218_009 | 저장고 패널 Fastener 타입 (아르네코리아) | e-카탈로그 Dir 218 p.18 |
| ec_218_010 | 저장고 도어 수동 슬라이딩 도어 (Sliding Door) (아르네코리아) | e-카탈로그 Dir 218 p.19 |
| ec_218_011 | 저장고 도어 전동 슬라이딩 도어 (Auto Sliding Door) (아르네코리아) | e-카탈로그 Dir 218 p.19 |
| ec_218_012 | 저장고 도어 매립형 냉동 냉장도어 (Hinge Door) (아르네코리아) | e-카탈로그 Dir 218 p.19 |
| ec_218_013 | 패브릭 덕트 (상상기술) | e-카탈로그 Dir 218 p.19 |

- 에센셜 모니터 G3 G31H · G32H 는 지난 run 의 카탈로그 행 `ec_360_114` 비즈니스(광시야각) 모니터와 모델코드가 같다 → `ec_360_114` 는 id 를 유지하고 `supersededBy` 로 표시(새로 고르는 목록에서만 뺌, 판매 종료 아님).
- 콜드체인 Dir 218 의 삼성 인버터 콘덴싱 유닛 · 유닛쿨러 BSU · 일체형 쇼케이스 5종은 297 에 이미 있는 항목이라 새 항목을 만들지 않았다(원장 evidence 에 쪽 추가). 218 의 BSU-200E 는 297 항목에 없는 사이즈다 — 다음 run 에서 297 개정 여부와 함께 본다.
- 새 사이트 행 3개의 카드 사진은 app 소유 static `app/web/public/assets/products/` 로 올렸다. 카탈로그 전용 새 행 13개는 사진 없이 올렸다.

### 바뀐 항목 — 사양 16개

- sg_g000183984 호텔 TV HU7000F 시리즈: 사양 83 → 83행
- sg_g500124070 DVM S Compact 냉방전용: 사양 25 → 25행
- sg_g000180529 DVM S Compact: 사양 30 → 30행
- sg_g000179203 DVM Home 다배관: 사양 27 → 28행
- sg_g500147336 DVM Home (무풍)단배관: 사양 28 → 28행
- sg_g500123060 DVM S Renewal: 사양 24 → 24행
- sg_g000184107 Bespoke AI 무풍콤보 갤러리 프로 62.6㎡: 사양 60 → 61행
- sg_g000183598 벽걸이 에어컨 42.3㎡: 사양 39 → 38행
- ec_355_002 컨트롤 키트: 사양 2 → 2행
- sg_g000183655 Bespoke AI 하이브리드 4도어 키친핏 Max 602L (AI 홈): 사양 45 → 45행
- sg_g000183347 Bespoke 양문형 냉장고 846L (오토오픈도어): 사양 34 → 34행
- sg_g000184155 Bespoke AI 하이브리드 4도어 901L (에너지 1등급 최저기준 대비 -35%, UV탈취): 사양 40 → 40행
- sg_g000184135 Bespoke 정수기 일체형 (냉/온/정수): 사양 37 → 39행
- sg_g000184132 Bespoke AI 얼음정수기 (냉/온/정수): 사양 50 → 50행
- sg_g000184133 Bespoke AI 얼음정수기 (냉/온/정수): 사양 50 → 50행
- sg_g000184131 Bespoke AI 얼음정수기 (냉/온/정수): 사양 50 → 50행
- 그 밖: 큐레이션 qb55c 에 98형(LH98QBCEBGCXKR) 옵션 추가, 냉장고 · 정수기 7개 특장점 문구 변경, 원바디(ec360_055) 건조 에너지 등급 1 → 3등급, Galaxy Tab S11 스펙 가이드에서 S11 Ultra 빠짐 · S10+ 빠짐 · Tab Active 4 Pro 빠짐(사이트 카드는 판매 중), Galaxy Tab S12+ | Ultra 스펙 가이드 추가(사이트 카드에 카탈로그 근거로 연결), EHS 리플릿 '에너지효율 378%' → 'SCOP 3.78 이상' · '컨트롤 키트' → '제어기'.

## 판매 종료 — 지우지 않고 표시 17

게이트: 사이트 카드 18개(602개 중 3.0%)가 빠졌고 모니터 11개가 한 분류에 몰렸다. 목록 수집이 완전했고(총수 = 받은 수), 상품 페이지가 빈 페이지로 열리며, 같은 분류에 신모델(에센셜 모니터 G3 3종 · 뷰피니티 S70H/S80H/S80UH)이 있어 실제 라인업 교체로 판정했다. 근거: `deprecation-review.json`.

| id | 제품 | 판정 근거 | 대체 제품 |
|---|---|---|---|
| sg_g000180284 | Bespoke 슬림 150 W | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000184020 제트 핏 — 같은 세부 분류(무선 청소기) — e-카탈로그 343에 판매 중인 제트 핏 |
| sg_g000181589 | 제트 150 W | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000184020 제트 핏 — 같은 시리즈(제트) — e-카탈로그 343에 판매 중인 제트 핏 |
| sg_g000183171 | 뷰피니티 S7 S70D 4K 블랙 (LS27D706) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000184177 뷰피니티 S7 S70H 4K 블랙 (LS27H704) — 같은 시리즈 후속(뷰피니티 S7 S70D → S70H, 27형 4K) |
| sg_g000183172 | 고해상도 뷰피니티 S8(S80D)  블랙 (68.4 cm) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000184164 뷰피니티 S8 S80H 4K (LS27H804) — 같은 시리즈 후속(뷰피니티 S8 S80D → S80H, 27형 4K) |
| sg_g000183437 | 에센셜모니터 S30GD (54.6cm) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 | sg_g000183438 에센셜모니터 S30GD (60.4cm) — 같은 시리즈(에센셜모니터 S30GD) 판매 중인 60.4cm |
| sg_g000183445 | 에센셜모니터 S40GD (54.6cm) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000183440 에센셜모니터 S40GD (54.6cm) — 같은 시리즈(에센셜모니터 S40GD 54.6cm) 판매 중인 다른 상품 카드 |
| sg_g000183448 | 에센셜모니터 S40GD (60.4cm) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 | sg_g000183440 에센셜모니터 S40GD (54.6cm) — 같은 시리즈(에센셜모니터 S40GD) 판매 중인 54.6cm |
| sg_g000183523 | 고해상도 뷰피니티 S80D (92.7cm) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 | sg_g000184165 뷰피니티 S8 S80H 4K (LS32H804) — 같은 시리즈 후속(뷰피니티 S8 S80D 37형 → S80H 32형, 37형 후속 없음) |
| sg_g000183524 | 고해상도 뷰피니티 S80D (92.7cm) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000184165 뷰피니티 S8 S80H 4K (LS32H804) — 같은 시리즈 후속(뷰피니티 S8 S80D 37형 → S80H 32형, 37형 후속 없음) |
| sg_g000183525 | 뷰피니티 S8 S80UD 4K USB-C (LS27D800U) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000184172 뷰피니티 S8 S80UH 4K USB-C (LS27H802U) — 같은 시리즈 후속(뷰피니티 S8 S80UD → S80UH, 27형 4K USB-C) |
| sg_g000183526 | 뷰피니티 S8 S80UD 4K USB-C (LS32D804U) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000184161 뷰피니티 S8 S80UH 4K USB-C (LS32H802U) — 같은 시리즈 후속(뷰피니티 S8 S80UD → S80UH, 32형 4K USB-C) |
| sg_g000183550 | Bespoke AI 무풍 클래식 62.6㎡ | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 | sg_g000183560 Bespoke AI 무풍 클래식 62.6㎡ — 같은 시리즈(Bespoke AI 무풍 클래식 62.6㎡, 냉방 7.70 kW · 3등급) 판매 중인 다른 상품 카드 |
| sg_g000183675 | 고해상도 뷰피니티 S7(S70D)  블랙 (92.7cm) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000184173 뷰피니티 S7 S70H 4K 블랙 (LS32H702) — 같은 시리즈 후속(뷰피니티 S7 S70D 37형 → S70H 32형, 37형 후속 없음) |
| sg_g000183961 | IPS 100Hz 에센셜 모니터 (LS24F432) | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 — 일반 소비자몰(samsung.com/sec)에는 남아 있음 | sg_g000184305 에센셜 모니터 G3 G31H FHD 144Hz (LS24HG314) — 같은 세부 분류(에센셜 모니터 IPS FHD) 후속 라인 G3 G31H |
| sg_g000184110 | Bespoke AI 무풍콤보 갤러리 프로 62.6㎡ | samsung.com/sec/business 목록에서 빠지고 상품 페이지가 빈 페이지(제목만 'Samsung Business 대한민국')로 열림, 현재 B2B e-카탈로그 69권에도 없음 | sg_g000184107 Bespoke AI 무풍콤보 갤러리 프로 62.6㎡ — 같은 시리즈(Bespoke AI 무풍콤보 갤러리 프로 62.6㎡) 판매 중인 다른 상품 카드 |
| ec_203_003 | DVM HOME 무풍 벽걸이 | Dir 203 삭제 후 현재 B2B e-카탈로그 69권·사이트 어디에도 모델코드가 없음 | ec_203_004 DVM HOME 시스템에어컨 360 — 같은 시리즈(DVM HOME) 판매 중인 실내기 — 360 |
| ec_203_010 | 드레인 펌프 | Dir 203 삭제 후 현재 B2B e-카탈로그 69권·사이트 어디에도 모델코드가 없음 | ec_297_086 Drain Pump — 같은 세부 분류(시스템에어컨 · 액세서리)의 Drain Pump(ADP-E075SEK3D) |

- 제트 핏 3종(sg_g000184016 · 184018 · 184020)은 사이트 목록에서 빠졌지만 B2B e-카탈로그 Dir 343 에 판매 중 → `still_listed`. 행 id 를 유지하고 `siteListed: false`, 카탈로그 쪽을 근거로 표식했다.
- 앱 동작: 새로 고르는 목록(탐색기 · @태그 · 추천 · 교체 · 공간 조감도 제품 선택)에서만 빠지고, 기존 제안서 · 샘플 시나리오 · 히스토리 · 공간 장면은 그대로 그려진다. 판매 종료 제품이 든 제안서를 PPTX 로 내보낼 때(제안서 · 샘플 시나리오 받기 · 목차 템플릿 받기) 목록과 대체 제품을 보여 주고 확인을 받는다.

## 연관 자료

- PPT 레이아웃 템플릿(`catalog.json` layouts · `layouts.b64` · templates `*_layouts.js`) · 샘플 시나리오 · 시나리오 생성기 입력(`prod.py` · `sols.py` · briefs)에서 판매 종료 · 대체 행의 id · goodsId · 모델코드를 찾았으나 참조 없음 → 레이아웃 수정 없음. 도입사례 1건(id 2719, 2023 대륭강남타워 — 제트 150W VS15A6031N5)은 사례(DSS 아님) 원문이라 그대로 둠.
- 3D 오브젝트: `product-objects.json` 1,084개(새 16, 새로 고르는 목록에서 뺌 18), 라이브러리 `889d626f`(지난 버전 파일은 저장된 장면용으로 유지), 새 썸네일 10개. 콜드체인 표의 'L × W × H' · 원문 오탈자 '외형지수' 치수를 읽도록 `build_spatial_products.py` 보강(기존 항목 치수 변화 없음).
- 제품 상세 overlay: 402개 상세의 카탈로그 근거(권 · 쪽 · 카탈로그 사양)를 새 권으로, 사양 출처 `checkedAt` 갱신(공식 사양 API 1,034 · 카탈로그 400 · 카탈로그 원문 인용 363). 사양 원장 `product-review.json`(1,084개).
- 솔루션: 버티컬 솔루션 23/23 · 앱 솔루션 16/17 표식, 분류 URL 14개 교체(`vertical_space_product.json`), Knox Suite 보조 URL 이동(`build/media/data/sol_urls.json`).
- 에이전트 KB 재생성(레이아웃 939 · 활성 696 — main 의 목차 템플릿 장 포함 · 제품 1,084 · 시나리오 107), runtime projection 재생성.

## 남은 unresolved 13

- 큐레이션 12개 — 검토 사양 출처가 이번 run 수집 범위 밖(해외 · 제조사 페이지, 사이트에 없는 모델): epaper, galaxyA, hoteltv, hoteltv43, kiosk, led_indoor, led_outdoor, onyx, smartmonitor, smarttag, tabactive5, watch. 다음 run 에서 출처를 사이트 · 카탈로그 쪽으로 다시 잡을지 본다.
- 앱 솔루션 `content`(콘텐츠 제작 지원) — 기록된 공식 근거 URL 이 없음.
- 업종 · 도입사례 페이지(`proddb/raw/v1_wkb_pages_v2.json`, 2026-10-04)는 이번에 다시 받지 않아 제품 `ind` · `spaces` · `kw` 색인은 그 시점 기준이다.
- 카탈로그 사진 crop 중 360 · 203 쪽에서 자른 것(81 · 12장)은 같은 제품 사진이라 다시 자르지 않았다.
- 사양 원문 인용 27개(Dir 203 리플릿 문구 24 · 355 1 · PDP 2)는 현재 원문에서 같은 문구를 찾지 못해 이전 확인 시점 그대로다.

## 검사

- `npm --prefix app/web run build` 통과 · `pytest app/tests` 354 통과(test_llm_queue 다중 프로세스 1건은 첫 실행에서만 실패, 다시 돌려 통과) · `make test` 의 node 검사 8종 통과 · `strict_contracts.py` products 12/12 · jobs 14/14.
- `preflight.py --deep`: 원본 · runtime SQLite · 동결 기준본 · 앱 데이터 · KB · 웹 빌드 OK. LLM 키 · 로그인 계정은 이 환경에 없어 FAIL/WARN(데이터와 무관).
- `functional-contracts.mjs` — 서버가 실제 LLM 연결 확인 없이는 기동하지 않아, 모델 호출이 없는 계약만 LLM 확인을 건너뛴 로컬 검증 서버로 실행: pptx 10/10, repository 12/13(R12 다른 origin 복원 대기 시간 초과), catalog 7/10 — C01 · C06(샘플 시나리오 82 기대 · 실제 107)과 C10(L_VS_SOL_* 레이아웃의 버티컬 솔루션 id)은 이번 변경 전부터의 기대값 차이. C01 의 제품 수 1,084 는 통과.
- 브라우저 확인: 판매 종료 제품이 연결된 제안서의 PPTX 내보내기 창에 목록 · 대체 제품 · 확인 체크가 뜨고, 체크 전에는 만들기 버튼이 막힘. 탐색기용 `ACTIVE_PRODUCTS` 1,066개(판매 종료 17 · 대체 1 제외), 기존 id 는 모두 그대로 해석됨.
- 변경 전부터 실패하던 것을 함께 고침: KB 내보내기가 목차 템플릿 레이아웃(L_TOC_* 39)의 HTML 을 읽지 않아 실패 → `export_agent_data.mjs` 에 `toc_layouts.js` 추가 · 기대 건수 939/696(main 의 목차 템플릿 장 3종 포함). `services/catalog.js` 의 JSON import 에 `with {type:'json'}` 가 빠져 node 검사(review-criteria)가 실패 → 추가.

## 이번 run 에서 고친 도구

- `collect_site.mjs` 출력 경로 · 지난 분류 번호 대체 · 목록 전 페이지 · 받은 수 검사, `fetch_ecat_text.py` staging 출력 · 빠진 쪽 기록, `build_db.py` meta 중복 키 · 원장 적재, `export_app.py` 묶음을 추출 Dir 기준으로(근거만 옮긴 항목의 행 id 유지) · 협력사 '상상기술', `prepare_data.py` · 테스트의 건수 계약 1,084.
