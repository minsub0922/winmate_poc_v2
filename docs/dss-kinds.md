# DSS 종류 — 수집한 항목을 LLM 으로 제품 · 솔루션 · 서비스 · 구독으로

- 작성일: 2026-11-18
- 요청: “samsung.com/business 에서 가져온 소스에 제품 뿐만 아니라 서비스,구독,솔루션도 혼재 되어있어. 이를 분리해야해. 수집 후 llm 으로 그걸 분리하게해. 이는 db 에도 분리되어 보이게 해서 dss 시 명확히 구분되도록해.”
- 코드:
  - `proddb/build/dss/classify.py`(판정)
  - `proddb/build/dss_db.py`(SQLite)
  - `proddb/build/dss/subs_ledger.py` `kind_of`(원장)
  - `app/web/src/services/catalog.js` · `services/dss.js`(앱)
  - composer `auto.py` · `library.py`
  - `admin/dss.py` · `admin/web/src/dss-kinds.jsx`(관리자)

## 1. 왜 LLM 인가

samsung.com/business 제품 목록 · e-카탈로그 행은 사이트 분류 이름만으로 종류를 가를 수 없다.

- **분류 이름에 '솔루션'이 붙어도 기기다.**
  - '시스템에어컨 솔루션' · '환기 솔루션' · '바닥난방/급탕 솔루션' · '빌딩통합솔루션' 아래는 실내기 · 전열교환기 · 히트펌프 · 센서 · 밸브 · 제어기다.
  - 예전 규칙(`kind_of`)은 이것들을 솔루션으로 읽었다.
- **같은 분류 안에 다른 종류가 섞여 있다.**
  - '모바일 솔루션' 아래에 보증연장 서비스가 있다.
  - 제품 카드 사이에 세척 · 케어 서비스와 소프트웨어(MagicINFO · Knox · b.IoT · LYNK)가 섞여 있다.

그래서 수집한 뒤 항목마다 이름 · 분류 · 설명을 LLM 이 읽고 판정한다.

## 2. 판정 — `classify.py`

| | |
|---|---|
| 종류 | device(제품) · solution(솔루션) · service(서비스) · subscription(구독) |
| 입력 | 행마다 이름 · 분류 경로(제품군 › 사이트 분류) · 설명(상세의 설명 · 특장점 제목 · 첫 본문, 160자). 모델 코드는 '모델'로(종류 판정에 필요 없다), 규격(IP65 · USB-C)은 그대로 |
| 호출 | 10개씩 묶어 한 번(프롬프트 약 3천 자, 고정 정의 + 항목), JSON 스키마(enum) |
| 다시 보기 | 확신이 낮거나 예전 규칙과 다른 판정은 한 항목씩 설명을 길게(360자) 다시 묻는다. 두 답이 같으면 확정, 다르면 두 번째 답 + 다시 볼 것 |
| 같은 것 | 솔루션 행은 앱 솔루션 카탈로그(catalog.json solutions)의 같은 것(그 판매 단위)을 한 번 더 묻는다 — `same` (예: MagicINFO™ → magicinfo) |
| 재사용 | 같은 입력(이름 · 분류 · 설명의 해시) · 같은 판정 기준(PROMPT_VERSION)이면 지난 판정을 그대로 — 새 · 바뀐 행만 모델을 부른다. 5묶음마다 중간 저장 |
| 사람 판정 | `proddb/dss/kind-overrides.json` `{id: {kind, by, why, same?}}` 이 늘 이긴다 |
| 모델 | 기본은 앱이 고른 LLM(설정). `--profile` 로 바꾼다. 무료 등급 키는 `--workers 2 --tpm 9000`(분당 토큰 예산 — 호출 크기만큼 기다린다). 답의 항목 수는 스키마(minItems · maxItems)로 묶음 크기에 못박는다(10개 중 3개만 답하던 모델) |

산출:

- `proddb/dss/kinds.json`: 정본. 항목마다 kind · conf · why · by(llm · manual · rule) · rule(예전 규칙) · hash · model · at · run · review · same.
- `proddb/dss/kinds-review.json`: 다시 볼 것.

## 3. DB 에서 나뉘어 보인다

- **`app/data/products_db.json`**
  - 행 `dssKind` · `dssSame`.
  - 위 `dss.kinds`(모델 · 시각 · 종류별 행 수).
- **원장 `proddb/dss/ledger.json`**
  - 제품 행 · 큐레이션의 `kind` 는 판정을 따른다(`kind_of` 가 `dssKind` 를 먼저 본다).
  - 바뀐 항목은 run 기록 `reclassified`(scope `["kinds"]`).
- **SQLite `proddb/winmate_products.sqlite`**(→ runtime)
  - 표 `dss_kind`: 판정 기록.
  - 종류별 보기 `dss_device` · `dss_solution` · `dss_service` · `dss_subscription`: 원장 항목 + 확신 · 근거 · 판정한 것 · 예전 규칙 · 다시 볼 것.
- **관리자 「데이터 소스」 samsung.com/business 카드**
  - 칩: 제품 · 솔루션 · 서비스 · 구독 건수, 다시 볼 것.
  - 누르면 그 종류의 목록(검색 · 판정한 것 · 확신 · 근거 · 예전 규칙에서 바뀐 것 · 같은 앱 솔루션). API `GET /admin/api/dss/kinds` · `/dss/kinds/{kind}`.

## 4. DSS 에서 구분된다

- **앱 — 새로 고르는 제품 목록**(`ACTIVE_PRODUCTS`: 탐색기 · @태그 · 추천 · 교체 · 매칭 추출)은 **제품만**.
- **솔루션 · 서비스 · 구독 행**은 솔루션 카탈로그 모양(`ROW_SOLUTIONS`)으로 들어간다.
  - 솔루션: 솔루션 폴더(제품군별 묶음).
  - 서비스 · 구독: 서비스 폴더.
  - @태그 · 매칭 추출에도 같은 모양으로 들어간다.
  - 상세는 그 행의 특장점 · 사양, 머리표는 솔루션 · 서비스 · 구독.
  - 앱 솔루션의 판매 단위인 행(dssSame)은 따로 보이지 않고 그 솔루션이 대표한다.
- **지난 제안서**: 제품으로 고른 행이 솔루션 · 서비스면 `dssOf` 가 그 종류로 보인다.
  - 매칭 카드 · 파트 판단 · 공간 구성 수 · 탐색기 연결 표시에 해당한다.
  - 저장된 ctx 는 바꾸지 않는다.
  - 칩을 지우면 제품 칸에서도 빠진다.
- **composer**: 제품으로 들어온 그런 행은 제품 장에 놓지 않고 솔루션으로 받는다(`dssSame` 이면 그 솔루션).
  - 라이브러리 `products_all` 에 `dssKind` · `dssSame`, VERSION 6.
  - 에이전트 KB solutions 에 행 솔루션을 함께 싣는다.
- **3D 오브젝트**: 소프트웨어 · 서비스는 이미 비물리(logical)라 공간 선택에 안 나온다.
  - 물리 형상이 있는 비제품 행(예: 프린터 형상의 출력관리 서비스)은 다음 공간 빌드에서 `catalogVisible: false`.

## 5. 파이프라인 자리

- 전체 run: 3-way 반영(`apply_run.py`, 9단계) 뒤 9-1단계 `classify.py --apply-rows`(staging 행) → `ledger.py` → `promote.py` 가 `kinds.json` 을 반영.
  - `proddb/build/dss/README.md` · `.agents/skills/winmate-update-dss-db/SKILL.md` 5단계 2-1.
- 수집 없이 종류만 다시: `python3 proddb/build/dss/classify.py --apply [--profile …] [--workers 2 --tpm 9000]` → 다음 서버 재시작(`make restart` — prepare_data · export_agent_data · 웹 빌드)이 앱에 반영한다.
- 관리자 「데이터 소스」의 변경 반영(`admin/source_promotion.py`, 다른 세션 작업 중)으로 들어온 새 행은 다음 판정 때까지 제품으로 본다(지금과 같은 동작). 그 흐름 끝에 `classify.py --apply-rows` 를 붙이면 바로 나뉜다.

## 6. 결과 (2026-11-18, run `kinds-20261118`, gemma-4-31b-it — Gemini 프로필)

| 종류 | 제품 DB 행 · 큐레이션 1,067 | 원장 전체(앱 · 버티컬 솔루션 · 구독 레지스트리 포함) |
|---|---|---|
| 제품(device) | 1,026 | 1,026 |
| 솔루션 | 26 | 61 |
| 서비스 | 15 | 20 |
| 구독 | 0 | 16(구독 레지스트리) |

- **예전 규칙과 다른 것 31**
  - 솔루션 → 제품 30:
    - '환기 솔루션' 전열교환기 6 · 가정용 환기 · 시스템 청정환기 · 상업용 전열교환기 · 유선 리모컨
    - '빌딩통합솔루션' 제어기 · 확장 모듈 · 게이트웨이 · 액추에이터 · 센서 · 밸브
    - '시스템에어컨 솔루션' 터치중앙제어기 · Wi-Fi Kit · EDGE-S 컨트롤러 · HASS 컨버터
    - '바닥난방/급탕 솔루션' 히트펌프 보일러 · EHS · 컨트롤 키트
    - '설치솔루션' 조인트 · 분기관
    - 큐레이션 EHS · ERV
  - 솔루션 → 서비스 1: '모바일 솔루션'의 모바일 보증연장 서비스.
- **솔루션 26**: MagicINFO™ · VXT · LYNK · b.IoT(8) · DMS 2.5 · SmartThings Pro · Knox(5) · 갤럭시 클래스룸 · 삼성헬스 · 출력보안 PSS · 통합출력관리 MPS.
  - 22개는 앱 솔루션의 판매 단위(dssSame: biot 8 · knoxsuite 4 · stpro 3 · vxt 2 · lynk 2 · magicinfo · sac · partnerapp).
  - 앱 솔루션 폴더에 새로 보이는 행은 4(Samsung Knox · 삼성헬스 · PSS · MPS).
- **서비스 15**: 세척 3 · 케어(케어십 · 케어플랜 · 퍼스트/미들/라스트마일 · 바이앤고 · 삼성케어플러스 · 판넬 케어 · 점검 수리 · 유지보수) · 모바일 보증연장.
  - 정기 요금 상품은 이 소스에 없다 — 구독은 구독 레지스트리(B2B 삼성 AI 구독) 그대로.
- **다시 볼 것 14**: 모두 묶음 판정에서 기기를 솔루션 · 서비스로 읽었다가 한 항목씩 다시 볼 때 바로잡힌 것.
  - 갤럭시 탭 S10 FE+ · DVM S2 · 냉장고 · 스피커 · 앰프 · 보조전원 모듈 등은 제품으로.
  - 퍼스트마일케어는 서비스로(첫 판정 구독).
  - 최종 판정은 맞다. 사람 확인용으로 남긴다.
- **앱 새로 고르는 제품 목록**: 1,063 → 1,025(판매 종료 · 대체 행 빼고).
- **호출 · 시간**
  - 묶음 판정: 약 190 호출 · 입력 약 18.7만 토큰 · 출력 약 5.7만 토큰 · 약 55분.
  - 무료 등급 분당 토큰 한도 때문에 시간이 걸렸다. 처음 묶음 크기 · 동시 수로는 대량 429 · 시간 초과가 났다 → `--tpm`.
  - 다음 run 은 바뀐 행만 묻는다.

## 7. 시험

- `app/tests/test_dss_kinds.py`(모델 없이 가짜 판정자):
  - 입력에 코드 없음
  - 분류 이름이 틀리게 이끄는 행
  - 재사용
  - 다시 보기 · 사람 판정
  - 모델 없을 때
  - 행 · 원장 · SQLite 반영
  - 전 행이 항목 · 묶음 길이
  - composer 가 비제품 행을 솔루션으로
- `app/tests/dss-kinds.mjs`: 앱 — 제품 목록 · 솔루션 · 서비스 폴더 · dssSame · dssOf · refInfo.
