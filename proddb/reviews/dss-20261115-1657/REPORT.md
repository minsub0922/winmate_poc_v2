# DSS DB 업데이트 — dss-20261115-1657

- RUN_AT: 2026-11-15T16:57:37+09:00 (KST) · 실행: `.agents/skills/winmate-update-dss-db` · 도구: `proddb/build/dss/` · 전체 run(사이트 · e-카탈로그 · 솔루션 · 구독)
- 원장: `proddb/dss/ledger.json` — 확인 1,106건(제품 1,055 · 앱 솔루션 16 · 버티컬 솔루션 23 · 구독 12), 지난 전체 run 은 dss-20261112-1445
- 진행: staging(`output/dss/dss-20261115-1657/`)까지 만들고(17:16 KST) 검토한 뒤 활성 경로에 반영(17:24 KST). 커밋 · 푸시는 하지 않았다.

## 소스 완전성

| 채널 | 결과 |
|---|---|
| samsung.com/sec/business 목록 | 51개 분류 complete(총수 = 받은 수, 상품 카드 597 — 더해진 카드 · 빠진 카드 없음). 메뉴에 새 분류 없음. ac-clean · 에어컨 케어서비스는 지난 번호로 목록 API 확인. printing-solutions 는 지난 수집과 같이 failed(지난 원문에서 이 분류로 받은 상품 0개) |
| 스펙 API · PDP | 스펙 1,125/1,125건 complete. PDP 596/597 — G000181220 HTTP 500(지난 수집도 같음, 목록 · 스펙으로 확인) |
| e-카탈로그 69권 | 권 목록이 지난 run 과 같음(새 권 · 빠진 권 · 새 호 없음, 비즈니스 종합 11-12월호 Dir 364 그대로). 1,812쪽 중 글 있는 쪽 1,705 · 이미지 전용 107(지난 수집과 같은 쪽). 69권 모두 쪽 글이 지난 수집과 같음. Dir 93(B2B LED조명)은 이제 목록(tab4)에 올라 있음 |
| 솔루션 · 분류 · 근거 URL 103개 | 103개 모두 200(지난 run 에서 바꾼 분류 · Knox Suite 주소 포함). 새 리디렉트 1 — `vxt.samsung.com/uk/features` → `/uk`(307). 두 run 에 모두 있는 samsung.com/sec/business 페이지 66개는 본문 해시가 같음 |
| 구독(B2B 삼성 AI 구독) 9개 | 페이지 4 · 패키지 모델 검색 5 모두 complete. 본문 · 이미지 30장 해시 · 모델 검색 결과 같음(검색 결과의 색상 옵션 나열 순서만 다름), 홈 메뉴에 새 구독 링크 없음 |

소스 인벤토리(`source-inventory.json`) 236행: complete 234 · partial 1(PDP) · failed 1(printing-solutions) · gone 0.

## DSS 결과

| 종류 | 결과 |
|---|---|
| device | active 974 · changed 10 · unresolved 12 · deprecated 17 |
| solution | active 91 · changed 1 |
| service | active 18 · unresolved 1 |
| subscription | active 12 · inferred 4 |

새 항목 없음. 제품 수는 1,084 그대로(행 1,044 + 큐레이션 40, 행 id · 순서 같음). 지난 run 의 changed · new 표시(제품 53 · 구독 12)는 이번 원문에서 달라진 것이 없어 active 로 돌아갔다. 종류 재분류 없음, 구독 expired 없음(혜택 ~2026-11-30).

### 바뀐 항목 11

| id | 이름 | 바뀐 것 | 반영 |
|---|---|---|---|
| sg_g000181497 | 흑백 레이저복합기 40 ppm (SL-M4090FR/GOV) | 사양 `기본 사양 › 인터페이스 (기본)` — `Hi-Speed USB 2.0 / Ethernet 10/100/1000 Base TX` → `Hi-Speed USB 2.0 / Ethernet 10/100 Base TX` | 앱 상세(`product-details`) 사양의 같은 행을 새 값으로(55행 그대로), 사양 출처 sha256 갱신 |
| sg_g000184128 · 184129 · 184130 | Bespoke AI 정수기 (냉/온/정수) | 특장점 5번째 블록(제목 없는 블록)의 면책 문구에서 세 문장이 빠짐 — "안전한 수질관리를 위해 권장 교체주기(12개월)의 120%(438일)에 도달하거나 1,500L 사용 시 출수 기능이 제한됩니다. (두 조건 중 하나가 먼저 도래하는 시점에 출수 제한)" · "필터 교체 가이드에 따라 주기적으로 필터를 교체해 사용하면 깨끗한 수질 관리가 가능합니다." · "하루 4.1L 사용 시, 1년까지 사용할 수 있습니다." | 원본 DB(`proddb/raw` · SQLite `feature_block`)만. 앱 행 · 상세는 그대로 |
| sg_g000184134 ~ 184139 (6개) | Bespoke 정수기 일체형 (냉/온/정수 · 냉/정수 · 정수전용) | 특장점 "미세플라스틱(Microplastics) 제거 NSF 인증받은 4단계 필터 시스템" 블록의 면책 문구에서 "하루 4.1L 사용 시, 1년까지 사용할 수 있습니다." 가 빠짐 | 원본 DB 만. 앱 행 · 상세는 그대로 |
| vss:s_vxt | VXT CMS (버티컬 솔루션) | 보조 출처 주소 `https://vxt.samsung.com/uk/features` → `https://vxt.samsung.com/features` | `vertical_space_solution.json` s_vxt 의 `sources` 1곳 · 기능별 출처 2곳(`s_vxt.rm.control` · `s_vxt.player.android`) |

- 정수기 9개: 앱 상세는 제목 있는 특장점 블록 8개의 본문 240자 · 면책 200자까지만 싣는다. 바뀐 곳이 그 범위 밖(제목 없는 블록, 면책 문구 322자 이후)이라 앱 데이터는 달라지지 않았고, 원장에는 원문 변경(`source-changed`)으로 남겼다. 빠진 문장은 수집기가 보관한 범위(블록 글 2,000자 · 면책 800자)에서 확인한 것이다 — `changes.json` `fieldDiffs`.
- VXT: `/uk/features` 와 `/uk` 아래 하위 페이지가 모두 영국 홈(`/uk`)으로 넘어간다(307). 이 주소를 출처로 적은 기능 2개(전원 · 화면 방향 · SW 업데이트 원격 제어, Android 기기 · 웹 플레이어)의 원문 문장은 `/uk` 에는 없고 같은 사이트의 기능 페이지 `/features`(200)에 그대로 있어, 리디렉트 도착지가 아니라 기능 페이지로 옮겼다. 1차 근거인 samsung.com/sec/business VXT CMS 페이지는 본문 해시 그대로. 근거 문장은 `run.json` `sol_url_moves_why`.
- 그 밖의 반영: 제품 행 1,027 · 큐레이션 28 · 앱 솔루션 16 · 버티컬 솔루션 23 · 구독 12 의 `checkedAt`, `products_db.json` 머리(`generated` · `specReview` · `dss`), 분류 파일(`vertical_space_product.json`) meta 표식. 분류 URL 변경 없음.

## 판매 종료 — 새 후보 없음 · 지난 run 의 17개는 삭제 후보

게이트: 이번 run 에서 새로 사라진 항목이 없다 — 사이트 상품 카드 597 = 597, e-카탈로그 69권 쪽 글 같음, 솔루션 URL 103개 모두 200, 구독 소스 9개 complete. 근거: `deprecation-review.json`.

지난 run(dss-20261112-1445)에서 판매 종료로 표시한 17개는 다시 봤고(수집과 다른 패스 — PDP 직접 열기 · 검색 API · 이번 사이트 원문 · e-카탈로그 전 권 글) 다시 나타난 것이 없다: 사이트 행 15개는 상품 페이지가 여전히 빈 페이지(제목만 'Samsung Business 대한민국')이고 /sec/business/ 검색 결과 · 이번 원문의 goodsId · 모델코드에 없음, 카탈로그 행 2개는 모델코드가 어느 권에도 없음('드레인 펌프'라는 이름만 221 · 297 의 다른 항목 쪽에 나옴). 표시와 원장 항목은 이번 run 에서 바꾸지 않았다(원장 17건이 반영 전과 같음).

이 17개가 삭제 후보다. 삭제는 이 run 이 하지 않는다 — 사용자가 삭제를 확인했고, 이 run 을 반영한 뒤 별도 단계로 `proddb/build/dss/deletions.py apply` 를 실행했다(2026-11-15 17:36 KST, 기록 `proddb/reviews/deletions-20261115-1736/`). 판정 근거는 지난 run 의 `REPORT.md` · `deprecation-review.json` · `replacements.json`.

| 원장 키 | 제품 | 대체 제품 |
|---|---|---|
| product:sg_g000180284 | Bespoke 슬림 150 W | sg_g000184020 제트 핏 |
| product:sg_g000181589 | 제트 150 W | sg_g000184020 제트 핏 |
| product:sg_g000183171 | 뷰피니티 S7 S70D 4K 블랙 (LS27D706) | sg_g000184177 뷰피니티 S7 S70H 4K 블랙 (LS27H704) |
| product:sg_g000183172 | 고해상도 뷰피니티 S8(S80D) 블랙 (68.4 cm) | sg_g000184164 뷰피니티 S8 S80H 4K (LS27H804) |
| product:sg_g000183437 | 에센셜모니터 S30GD (54.6cm) | sg_g000183438 에센셜모니터 S30GD (60.4cm) |
| product:sg_g000183445 | 에센셜모니터 S40GD (54.6cm) | sg_g000183440 에센셜모니터 S40GD (54.6cm) |
| product:sg_g000183448 | 에센셜모니터 S40GD (60.4cm) | sg_g000183440 에센셜모니터 S40GD (54.6cm) |
| product:sg_g000183523 | 고해상도 뷰피니티 S80D (92.7cm) | sg_g000184165 뷰피니티 S8 S80H 4K (LS32H804) |
| product:sg_g000183524 | 고해상도 뷰피니티 S80D (92.7cm) | sg_g000184165 뷰피니티 S8 S80H 4K (LS32H804) |
| product:sg_g000183525 | 뷰피니티 S8 S80UD 4K USB-C (LS27D800U) | sg_g000184172 뷰피니티 S8 S80UH 4K USB-C (LS27H802U) |
| product:sg_g000183526 | 뷰피니티 S8 S80UD 4K USB-C (LS32D804U) | sg_g000184161 뷰피니티 S8 S80UH 4K USB-C (LS32H802U) |
| product:sg_g000183550 | Bespoke AI 무풍 클래식 62.6㎡ | sg_g000183560 Bespoke AI 무풍 클래식 62.6㎡ |
| product:sg_g000183675 | 고해상도 뷰피니티 S7(S70D) 블랙 (92.7cm) | sg_g000184173 뷰피니티 S7 S70H 4K 블랙 (LS32H702) |
| product:sg_g000183961 | IPS 100Hz 에센셜 모니터 (LS24F432) | sg_g000184305 에센셜 모니터 G3 G31H FHD 144Hz (LS24HG314) |
| product:sg_g000184110 | Bespoke AI 무풍콤보 갤러리 프로 62.6㎡ | sg_g000184107 Bespoke AI 무풍콤보 갤러리 프로 62.6㎡ |
| product:ec_203_003 | DVM HOME 무풍 벽걸이 | ec_203_004 DVM HOME 시스템에어컨 360 |
| product:ec_203_010 | 드레인 펌프 | ec_297_086 Drain Pump |

- 판매 종료가 아닌 표시도 그대로다: 제트 핏 3종(sg_g000184016 · 184018 · 184020)은 사이트 목록에 여전히 없고 e-카탈로그 343 에 있어 `siteListed: false`, `ec_360_114` 는 사이트 행 에센셜 모니터 G3 G31H · G32H(이번 수집에도 있음)가 대신해 `supersededBy`.

## 연관 자료

- PPT 레이아웃 템플릿 · 샘플 시나리오 · 시나리오 생성기 입력: 바뀐 값(`10/100/1000`)과 빠진 면책 문장을 적은 곳이 없어 글 수정 없음. 바뀐 제품 중 sg_g000184129 만 구독 장(`subs_layouts.js`) · `vertical_standard/prod.py` 에서 id 로, 구독 샘플 · 목차 내용에서 모델코드(RWP70F15ANB)로 쓰이는데, 제품을 가리킬 뿐 바뀐 문구는 없다.
- 제품 상세 overlay: 사양 내용이 바뀐 것은 sg_g000181497 하나. 980개 상세의 사양 출처 `checkedAt` 갱신(공식 사양 API 1,037 · 카탈로그 413 · 카탈로그 원문 인용 363). 사양 원장 `product-review.json`(1,084개).
- `cascade.py`: runtime projection 재생성, 3D 오브젝트 1,084개(라이브러리 `d032ab9e`, 없는 썸네일 · 쓰이지 않게 된 썸네일 없음), 샘플 버티컬 시나리오는 다시 만들어도 같음, 에이전트 KB 재생성(레이아웃 960 · 활성 669 · 제품 1,084 · 시나리오 116).
- 구독: 레지스트리는 표식만 달라짐(항목 16 · issues 0). 구독 사진 18장은 원본 해시가 같아 다시 만들지 않음. 레지스트리 run 을 담는 생성물만 다시 만듦 — `subscription_scenarios.json`(`generated` · `run` 만 달라짐) · `toc_content.json`(`subs.run` 만 달라짐).
- 솔루션: 버티컬 솔루션 23/23 · 앱 솔루션 16/17 표식. `build/media/data/sol_urls.json` 변경 없음.
- `refcheck.py` 통과(제품 1,084 · 솔루션 17 · 버티컬 솔루션 23).
- 바꾸지 않는 쪽(히스토리 · 저장 문서 · 도입사례)은 이번 run 에서 새로 표시한 판매 종료 제품이 없어 다시 조사하지 않았다 — 지난 run 기록(도입사례 id 2719) 그대로. 삭제 단계가 후보별 연관 자료를 다시 낸다.

## 남은 unresolved 13

- 큐레이션 12개 — 검토 사양 출처가 이번 run 수집 범위 밖(해외 · 제조사 페이지, 사이트에 없는 모델): epaper, galaxyA, hoteltv, hoteltv43, kiosk, led_indoor, led_outdoor, onyx, smartmonitor, smarttag, tabactive5, watch. 지난 run 과 같음.
- 앱 솔루션 `content`(콘텐츠 제작 지원) — 기록된 공식 근거 URL 이 없음. 지난 run 과 같음.
- 업종 · 도입사례 페이지(`proddb/raw/v1_wkb_pages_v2.json`, 2026-10-04)는 이번에도 다시 받지 않아 제품 `ind` · `spaces` · `kw` 색인은 그 시점 기준이다.
- 사양 원문 인용 27개는 현재 원문에서 같은 문구를 찾지 못해 이전 확인 시점 그대로다(지난 run 과 같은 27개).

다음 run 에서 볼 것

- `vxt.samsung.com/uk/features` 의 리디렉트는 임시(307)이고 영국 홈이 여전히 그 주소로 링크한다 — 되돌아왔는지 확인.
- 솔루션 · 근거 페이지는 본문 글을 저장하지 않아 지난 run 과는 해시로만 비교한다. 두 run 에 모두 있는 86개 중 9개의 본문 해시가 다르다(외부 기사 2 · 소비자몰/미국/VXT 소개 페이지 6 · VXT 리디렉트 1) — 무엇이 달라졌는지는 확인하지 못했다.
- 구독 혜택(~2026-11-30)이 끝나면 `expired` 로 바뀌고 혜택 장이 새 선택에서 빠진다.
- Dir 93 이 목록에 올라와 `proddb/dss/watch-config.json` 의 '목록 밖 유지' 항목은 더 필요 없다(점검 결과에는 영향 없음).
- 원장 note 는 run 마다 다시 쓴다 — 지난 run 의 '근거 이동' · 변경 내용 note(416건)는 지난 run 의 `changes.json` 에만 남는다.

## 검사

- 반영 전: 지난 원문으로 다시 만든 export 가 활성 앱 데이터와 같음을 확인(재현 기준 — 원본 DB 표 17개 건수 같음, 공통 행 1,023개의 export 필드가 pack 번호 `d` 말고 모두 같음, 상세는 큐레이션 `window` · `oh55a` 의 기존 수동 수정만 다름). 활성에만 있는 행은 지난 run 이 표시만 하고 남긴 21개(판매 종료 17 · 사이트 목록 이탈 3 · 대체 1)뿐. staging 을 다시 돌려도 같은 결과, staging 을 만드는 동안 활성 파일 227개 해시 그대로.
- 반영: `promote.py` 를 저장소 데이터 사본에서 먼저 돌려 확인(종료 코드 0 · SQLite integrity ok · staging 과 같은 결과)한 뒤 활성 경로에 실행 — 반영된 파일이 사본 결과와 바이트 단위로 같음. SQLite `integrity_check` ok · `dss_run` 3행 · `product_spec_review` 1,084행.
- 반영 후: `pytest app/tests` 563 통과(subtest 2,822) · `subscriptions.mjs` 13 통과 · `toc-templates.mjs` 8 통과 · `refcheck.py` 통과 · `preflight.py --deep` OK(WARN 1 — 에이전트 KB 가 다시 만든 `subscription_scenarios.json` 보다 먼저 만들어짐. 뒤이은 삭제 단계의 `cascade.py` 가 KB 를 다시 내보내 해소됨).
- 반영 후 원천 소스 재점검(`watch.py`, 사이트를 새로 수집 326초): 사이트 597/597 · e-카탈로그 69/69 · 솔루션 103/103 · 구독 9/9 모두 같음.
- `app/tests/subscriptions.mjs` 를 전체 run 에 맞게 고침: `scope` 가 없는 전체 run 도 구독을 본 run 으로 보고, 구독 소스 완전성은 레지스트리의 sources 로 본다(run 전체의 failed · partial 0 조건은 구독만 본 run 에만).
- 실행하지 않은 것: `functional-contracts.mjs`, `npm --prefix app/web run build`. 구독 사진 가공(`assets.py`)은 원본이 같아 돌리지 않았다.
- `build/toc/build_content.py` 는 PIL 이 필요해 `PYTHONPATH=admin/runtime/python app/.venv/bin/python -B build/toc/build_content.py` 로 실행했다.

## 이번 run 에서 고친 도구

- `apply_run.py`: 재현 기준을 지난 run 이 표시만 하고 남긴 행(판매 종료 · 사이트 목록 이탈 · 대체)에 맞춤 — 그 행은 그대로 두고, 원문에 다시 나타나면 멈춘다. 지난 run 전용 값(`remap-360-364.json` · Dir 360/203 · 특정 추출 파일 이름)을 run 의 입력에서 읽게 하고 판정 파일은 있을 때만 읽음. 앱 상세에 싣는 범위 밖에서만 바뀐 원문을 `source-changed` 로 기록.
- `ledger.py`: staging 에서 만든 구독 레지스트리를 읽음. '지난 run 과 행 사실 해시가 같으면 changed 가 아니다' 판정에서 상세 · 원문의 사실 변경은 빼지 않음(색인만 달라진 행만 active 로). 솔루션 · 서비스는 확인하지 못한 run 에서 지난 표식을 유지하고, 근거 URL 이 달라지면 changed.
- `inventory.py`: Dir 360/203 고정 행과 고정 문구를 run 의 결과(지난 수집 오류 · 권 비교 · `run.json`)에서 만들고, 새로 못 받은 쪽은 partial, 새 리디렉트는 moved, 구독 소스와 따로 확인한 주소를 더함. 스펙 API 기대 수를 goodsId 합집합(1,125)으로.
- `apply_solutions.py`: `sol_url_moves` 를 버티컬 솔루션의 대표 주소 · 출처 · 기능별 출처에도 적용.
- `promote.py`: `taxonomy_url_moves` 가 없는 run 도 실행, 분류 파일 meta 표식 갱신, staging 구독 레지스트리와 구독 원문을 원본 SQLite 재빌드 전에 반영.
- `proddb/build/subs/build.py`: `--out` · `--products-db`(반영 전에 staging 에 만들 때 — 기본 동작은 그대로).
