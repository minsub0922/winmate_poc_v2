# DSS DB 업데이트 — dss-20261113-0940 (구독)

- RUN_AT: 2026-11-13T09:40:17+09:00 (KST) · 범위: **구독(subscription)** — samsung.com/sec/business 에 새로 생긴 'B2B 삼성 AI 구독'을 DSS 의 네 번째 종류로 싣는 run.
  제품 · 솔루션 · 서비스 소스는 이번 run 에서 다시 받지 않았다(그 표식은 dss-20261112-1445 그대로).
- 실행: `.agents/skills/winmate-update-dss-db`(8-S) · 도구: `proddb/build/subs/` · 원장: `proddb/dss/ledger.json`(run `scope: ["subscriptions"]`, `proddb/build/subs/ledger_run.py`)
- 정본 입력: `proddb/subs/`(sources · facts · mapping · inferred · assets) · 원문 스냅샷: `proddb/raw/subs/` · 레지스트리: `app/data/subscriptions.json`

## 소스 완전성 — 9 complete

| 소스 | 결과 |
|---|---|
| site:b2b-ai-subs | complete — `/sec/business/b2b-ai-subs/` 본문 · 콘텐츠 이미지 16 |
| site:b2b-ai-subs-festival | complete — `/sec/business/event/b2b-ai-subs-festival/`(런칭 기념 혜택) 이미지 14 |
| news:20260928 | complete — 뉴스룸 '삼성 AI 구독 새단장… 신혼·시니어·기업까지 맞춤 케어'(B2B 출시 2026-09-28) |
| news:20261027 | complete — 뉴스룸 '삼성 AI 구독① 구매 이후까지 책임진다'(배송 · 설치 · 케어) |
| model ×5 | complete — 패키지 모델코드 검색 API(AP90H03163UGD · AR60F11D11WT · RS70F84N2Y · RWP70F15ANB · WH90F2522GBHY) |

- 홈 GNB 의 구독 링크 2개(구독 · 페스티벌) 모두 알려진 소스 — 새 링크 없음.
- 사실마다 원문 문장(`facts.json` `text`)을 이번 본문에서 찾고, 이미지는 sha256 으로 대조했다 — 대조 실패 0(`issues: []`).

## 구독 항목 16 — 공식 12 · 추론 4

| 종류 | 항목 | basis | 원장 |
|---|---|---|---|
| program | B2B 삼성 AI 구독(구독에 블루패스를 더하다 · 기업 운영 환경에 맞춘 전문 케어, 문의 1588-3366) | official | new |
| care | B2B 블루패스(시간맞춤 집중케어 · 48시간 긴급 출동 · 엔지니어 담당제 · 하나 더 서비스) | official | new |
| care-option | 무상수리 서비스 · 방문케어 | official | new |
| care-option | 방문케어 라이트 · 셀프케어 | official(소비자 구독 원문) | new — B2B 적용은 원문에 없음, 구독 장에는 쓰지 않음 |
| package | 공공 · 숙박 · 의료 · 오피스 패키지(품목 4씩) | official | new |
| promotion | 런칭 기념 특별 혜택(최대 20% · 추천 모델 5% · 동일 장소 10대 이상 5%) — 2026-09-28 ~ 2026-11-30 | official | new |
| payment | 월 구독료(월 분할 납부) | official | new |
| payment | 선납 + 월 납부 · 연 단위 납부 · 다년 계약 · 본사 일괄 계약 · 사업장별 청구 · 단계 도입 · 추가 구독 | **inferred** | inferred(표식 대상 아님) |

- 결제: 원문에 있는 결제 방법은 월 분할 납부 하나다. 나머지 넷은 B2B 구매 관행(회계연도 예산 · 본사 계약 · 파일럿 확산)으로 추론한 **협의안**이며, 항목마다 계약 전 확인할 것(`confirm`)을 둔다. 장에는 '협의안' 칩과 확인할 것으로만 쓰고 금액 · 할인율 · 비율은 쓰지 않는다.
- key message 31(항목마다 1개 이상, 원문 문장 · 추론안은 inferred).

## 패키지 품목 → B2B 제품 DB(324행 대상, 분류 15 · 제외 분류 2: 휴대폰 · 시스템에어컨)

- exact 4(공기청정기 AP90H03163UGD ×3 · 정수기 RWP70F15ANB) · series 3(벽걸이 에어컨 AR60F11D11WT → 같은 시리즈 B2B 행) · category 9.
- 패키지 냉장고 RS70F84N2Y · 세탁/건조기 WH90F2522GBHY 는 소비자몰 모델이라 B2B 제품 DB 에 없다 → 같은 분류 대표 행(sg_g000183345 · sg_g000182285)으로 이었다. TV · 호텔TV · 에어드레서 · 모니터 · 전자칠판은 원문에 모델코드가 없어 분류 대표 행.

## 업종 44 구독 구성

direct 11(패키지가 업종을 직접 말함) · similar 9(비슷한 업종) · derived 15(업종 공간의 대표 분류 3개 이상으로 '추천 구독 구성') · fallback 9(오피스 패키지 + 사무 · 라운지 공간).

## 종류 재분류 18 — 같은 run 에서 고침

- `kind_of`(`proddb/build/dss/subs_ledger.py`, 전체 run 의 `ledger.py` 도 같은 함수): 예전 규칙이 분류 이름의 '세척'만 보고 **식기세척기 17행을 service** 로 읽었다 → device. '솔루션 · 서비스' 분류의 **SmartThings Professional Solutions(ec_360_080)** 는 이름에 케어 · 세척 · 보증이 없어 solution.
- 제품 상태 · 확인 시점은 그대로다(종류만). 목록은 `changes.json` `reclassified`.

## 연관 자료

- 구독 장 21(`subs_layouts.js` L_SUB_*, 장표 구분 SU · 파트 `subscription`) — 개요 · 고민 · 가치 · 비교 · 품목 · 케어 4단계 · 블루패스 · 패키지(4 · 업종 4/3) · 조건 · 관리 옵션 · 납부 5/3 · 예산 흐름 · 혜택 · 절차 · FAQ · 업종별 가치 · 한 장 요약 · 계약 전 확인. 사진 18(`app/web/public/assets/subs/`, 원문 이미지 가공 · 원본 PNG 제품 컷).
- 파트 타입 '구독 도입'(Storyboard · 파트 편집 · 리뷰 단계 · 이름 규칙), 목차 6(구독 솔루션 제안 포함) · 목차 템플릿 4(구독 제안서 · 구독 전환 제안서 · 표준 제안서 + 구독 솔루션 · 투자 효과형 + 구독 솔루션) × 업종 44, 샘플 시나리오 9(요구 유형 '구독 도입': 구독 제안서 4 · 구독 전환 1 · 표준 + 구독 솔루션 4).
- 글자 역할: 샘플 시나리오 계약(모든 글 칸 `data-type-role`)에 맞춰 L_SUB_* 와 **목차 사진 카드 L_TOC_INDEX4–8** 에 역할을 구웠다(`build/toc/typed.py` — 눈썹 14 · 제목 32 · 번호 24 · 이름 20 · 바닥 12). 목차 장은 모든 목차 템플릿이 쓰므로 484 조합을 다시 렌더해 확인했다.
- 목차 조립기(`toc_templates.js`): 표준 목차가 목차 장에 쓰는 사진을 새 목차의 사진 후보에서 미리 빼 — 같은 사진이 목차 장에 두 번 나오던 조합 88 → 68(구독 샘플은 0). 남은 68은 표준 목차끼리 겹치는 기존 사례다.
- 레지스트리 `addon` — 원문 사실이 아니라 제안 구성 규칙: 고객 요구에 구독 · 렌탈 · 월 납부(또는 초기 비용 · 관리 부담 둘 이상)가 있으면 어느 목차 구성에든 '구독 솔루션 제안'(구독 가치 · 업종 패키지 · 납부안 3 + 혜택)만 더한다(`proddb/subs/mapping.json`). 목차 템플릿 '표준 제안서 + 구독 솔루션' · '투자 효과형 + 구독 솔루션', 샘플 '표준 + 구독 솔루션' 4(공식 패키지마다), 서버 AI 목차 추천 · Storyboard 이어 구성이 같은 규칙을 쓴다.
- SQLite `subscription` · `subscription_item` · `subscription_message` · `subscription_category` · `subscription_vertical`(`build_db.py` 가 빌드 끝에 싣는다), `dss_run.scope_json`. 에이전트 KB `subscriptions`.
- 바꾸지 않은 것: 기존 샘플 시나리오 107 · 히스토리 · 사용자 저장 문서.

## 다음 run 에서 볼 것

- 혜택은 2026-11-30 까지다. 그 뒤 run 에서 `expired` → 혜택 장 L_SUB_PROMO retired, 목차 조립기가 혜택 장을 빼고 구독 샘플을 다시 만든다.
- 방문케어 라이트 · 셀프케어의 B2B 적용, B2B 결제 방법(선납 · 연 단위 · 본사 일괄 등)이 원문에 생기면 official 로 옮긴다.
- 앱의 @태그 · 제품 탐색기에는 구독이 아직 없다(refInfo `subscription:<id>` · 파트 · 장 · 목차로만 쓴다).

## 실행한 검사

- 렌더(`build/subs/render_check.py`, 앱 글꼴 · 사진 묶음): 구독 장 21 기본 글 — 넘침 · 잘림 0, 구독 목차 조립 264장(업종 44 대표) — 0, 목차 사진 카드 484 조합 — 0.
- `PROPOSAL_ONLY=bs_sub_ node app/tests/vertical-proposals.mjs` — 계약 bad 0(authored 87 · subscription 5 · allScenarios 112), 구독 샘플 5덱 185쪽 clipped · overflow · outside · occluded · overlaps · distortedShapes · broken · placeholders 0.
- `node app/tests/vertical-proposals.mjs`(전체) — 렌더 대상 92덱(표준 44 · 버티컬 40 · 어카운트 3 · 구독 5) 2,283쪽 모두 0, 계약 bad 0.
- `node app/tests/subscriptions.mjs` 11/11 · `node app/tests/toc-templates.mjs` 8/8 · `node app/tests/scenario-groups-ui.mjs`(요구 유형 카드 8 · 샘플 112 · 호텔 필터 구독 1) · Python `pytest app/tests` 354 · `npm --prefix app/web run build` · `node app/scripts/export_agent_data.mjs`(layouts 960 · active 717 · scenarios 112).
- 사진 점검(`inspect_proposal_images.mjs`): 구독 샘플 빈 · 깨진 사진 0. bs_sub_of_hq 의 같은 쪽 같은 사진 2건(24 · 35쪽)은 표준 제안서 bs_std_of_hq 장을 그대로 옮긴 것으로, 표준 덱에 이미 있던 것이다.
- `functional-contracts.mjs` C01 의 고정 건수(시나리오 82 · 활성 596)는 이번 변경 전부터 맞지 않던 계약이라 고치지 않았다.
