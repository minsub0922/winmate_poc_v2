# 구독 장 · 구독 목차 (B2B 삼성 AI 구독)

DSS 의 네 번째 종류 **구독(subscription)** 을 제안서에 쓰는 장과 조립. 사실은 구독 레지스트리(`app/data/subscriptions.json`)에서만 온다 —
레지스트리는 `proddb/build/subs/build.py` 가 원문(samsung.com/sec/business 구독 페이지 · 혜택 이벤트 · 뉴스룸 공식 기사)으로 만들고
DSS DB 업데이트 skill(`.agents/skills/winmate-update-dss-db` 8-S)이 run 마다 갱신한다.

| 결과물 | 만드는 것 | 입력 |
| --- | --- | --- |
| `app/web/src/domain/templates/subs_layouts.js` — 장 21(SUBS_META · SUBS_HTML · SUBS_SLOTS, 장표 구분 SU · 파트 `subscription`) | `python3 build/subs/gen_module.py` | `layouts.py`(장 디자인) · `build/toc/base.py` + `typed.py`(글자 역할) · 레지스트리 |
| `toc_content.json` 의 `v.<업종>.sub` · `subs`(업종별 구독 구성 · 납부안 순서 · 혜택 기간) | `python3 build/toc/build_content.py` | 레지스트리 `verticals` · `items` |
| 구독 목차 조립 확인(구독 제안서 · 구독 전환 제안서 × 업종 44) | `node build/subs/compose.mjs check [--render list.json]` | 앱 목차 조립기 `toc_templates.js` |
| `subscription_scenarios.json` — 샘플 시나리오 '구독 도입' 9(구독 제안서 4 · 구독 전환 1 · 표준 + 구독 솔루션 4) | `node build/subs/compose.mjs samples` | 위 조립 결과(표지 묶음은 표지 한 장, 모든 칸을 채움) |
| `slot_modes.json` 의 L_SUB_* — 칸 구분(앱 · Agent가 다시 쓰지 않는 칸) | `node app/scripts/layout_slot_modes.mjs` | 칸 이름(SUBS_SLOTS): 눈썹 = 목차 번호, 제목 · 현장 고민 · 예산 금액([00]) = AI, 나머지(가치 · 품목 · 패키지 · 케어 · 조건 · 납부 · 혜택 · 절차 · FAQ) = 고정. 구독 샘플은 다른 장의 칸 구분 근거로 세지 않음 |
| 렌더 확인(넘침 · 잘림 · 빈 사진, PNG · contact sheet) | `python3 build/subs/render_check.py <layouts.js \| list.json> <out> [f …] [--sheet]` | 앱 글꼴 · 사진 묶음 |

## 장 (L_SUB_*)
- 개요 HERO · 고민 4 PAIN · 가치 3 VALUE3 · 일시불 vs 구독 COMPARE · 구독 품목 ITEMS · 전문 케어 4단계 CARE4 · B2B 블루패스 BLUEPASS · 패키지 4 PACKS
- 업종 패키지 PKG4 · PKG3(품목 수 변형) · 구독 조건 TERMS · 관리 옵션 CAREOPT · 납부 방법 5 PAY5 · 이 고객 납부안 3 PAY3(번호 01–03)
- 예산 흐름 BUDGET · 혜택 PROMO(기간 지나면 retired) · 도입 절차 FLOW · FAQ · 업종별 가치 IND4 · 한 장 요약 ONE · 계약 전 확인 CHECK

## 목차 (toc_templates.js)
- B2B 삼성 AI 구독(PAIN · VALUE3 · COMPARE) · {업종} 구독 패키지(PKG4/3 · ITEMS) · 구독 케어 · B2B 블루패스(CARE4 · BLUEPASS · CAREOPT) · 구독 조건 · 결제(TERMS · PAY3 · PROMO · FLOW) · B2B 삼성 AI 구독 요약(ONE)
- 템플릿: 구독 제안서 `subs`(Overview · 구독 · 패키지 · 공간별 제안 · 케어 · 조건 · 도입사례 · Why Samsung) · 구독 전환 제안서 `subsl`(요약 · 패키지 · 조건 · Why Samsung)

## 요구사항에 따라 더하기 — '구독 솔루션 제안'(add-on)
- 고객 요구(자유 입력 · 키맨 요구 · 메모 · 첨부)에 구독 · 렌탈 · 리스 · 월 납부 · 분할 납부가 있거나, 초기 비용 · 관리 부담 같은 신호가 둘 이상이면(반대 신호 '구독 제외' 등이 없을 때) 어느 목차 구성에든 **구독 솔루션 제안** 목차 하나만 더한다 — 이미 구독 목차가 있으면 더하지 않는다.
- 장: 간지 + 구독 가치 3(이 고객 제목) · 업종 구독 패키지 · 이 고객 납부안 3 (+ 기간 한정 혜택). 자리: 마지막 '비용 · 구매' 뒤, 없으면 첫 실행(파일럿 · 실행 계획) · 사례 · Why Samsung 앞.
- 규칙: `proddb/subs/mapping.json` `addon` → 레지스트리 → `toc_content.json` `subs.addon`. 쓰는 곳: `toc_templates.js`(`ensureTocScenario(tid, vid, {addons: ['sub']})` · `ensureTocScenarioFor(tid, vid, 요구 문장)`), Storyboard 다음 목차 후보, 서버 AI 목차 추천 · Storyboard 이어 구성(`app/api/poc/subscription_addon.py`).
- 구독 솔루션이 포함된 템플릿: 표준 제안서 + 구독 솔루션(stdsub) · 투자 효과형 + 구독 솔루션(roisub). 샘플 `bs_sub_std_<업종>` 4(숙박 · 의료 · 오피스 · 공공 패키지)는 서버 목차 추천이 더할 때 쓰는 모듈이기도 하다.

## 규칙
- 눈썹 + 제목 한 줄, 사진 · 아이콘 · 숫자 중심, 부제 · 각주 없음, 카드 왼쪽 색 띠 없음. 글 칸은 모두 글자 역할 크기(`typed.py`).
- 원문 사실만 쓴다. 결제 추론안(basis inferred)은 '협의안' 칩과 '확인할 것'으로만, 금액 · 할인율 · 비율은 쓰지 않는다.
- 패키지 품목은 공식 모델코드 → B2B 제품 DB 행(exact · series · 같은 분류 대표 행). 업종 44 은 공식 패키지 · 비슷한 패키지 · 업종 공간 기준 구성 · 오피스 패키지 순.
- 레지스트리가 바뀌면 `gen_module.py` → `build_content.py` → `compose.mjs check --render` → `render_check.py` → `compose.mjs samples` → `app/scripts/layout_variants.mjs` → `app/scripts/layout_slot_modes.mjs` → `export_agent_data.mjs` 순서로 다시 만들고 `app/tests/subscriptions.mjs` 로 확인한다.
