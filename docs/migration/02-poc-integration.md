# 2단계 — PoC 기반 기능 연결

## 구현 범위

`app/api/poc`가 원본 `poc/test`를 실제 경로에서 읽기 전용 import한다. 원본 testbench 서버를 실행하거나 원본 sync 스크립트를 돌리지 않는다. RFP, Layout LangGraph, Storyboard, proposal_score의 서로 다른 백엔드 계약을 어댑터로 유지하고 모델 호출은 서버 `GeminiProvider` 한 곳으로 모았다. 프런트는 키를 받지 않는다.

| 기능 | 연결 | 기본 동작 / 제한 |
|---|---|---|
| RFP → 입력 폼 | rfp_pipeline profile/extract/gapfill/consolidate | 원문은 브라우저 parser로 추출. 다중 사업은 선택 후 반영. HWP/OCR/Tavily 미지원 |
| 새 Storyboard + 레이아웃 | winmate_layout LangGraph | 요구 분석·경로 선택·질문 interrupt·답변 재개·채우기·검토. 작업 로그 폴링/SSE |
| 기존 Storyboard 이어 쓰기 | sbagent design/to_app_parts | 이미 작성한 파트 유지. 원본 PoC는 결과 일괄 반환 |
| 레이아웃 RAG | rank_slide + LayoutIndex | BM25 + TF-IDF + metadata. 외부 임베딩·키 불필요. 후보 최대 50개 |
| 업로드 제안서 검토 | proposal_score evaluate | 선별 기준 1/2/3점 라우팅. 기존 종합 점수와 구분. PDF/DOCX 위치 근사 및 점검 한계를 표시 |
| 파트 작성·슬라이드 채우기·재정렬 | 기존 업무 prompt → /api/llm | Gemini JSON/SSE. 실패 시 기존 규칙 |
| 대화형 시뮬레이션 | 기존 엔진 → /api/llm | 엔진 흐름 보존. Node sim_eval 배치는 별도이며 연결하지 않음 |

환경 변수 `WINMATE_MODE=dummy|real`과 기능별 `WINMATE_{RFP,LAYOUT,STORYBOARD,SEARCH,REVIEW,PART,FILL,SIMULATION,LLM}_MODE`를 지원한다. 기본은 dummy다. 설정은 프로세스 환경 > `app/.env` > `poc/.env` 순서이며 provider만 비밀키에 접근한다. 결과의 `llm.effective`와 성공/실패 호출 수는 실제 성공을 바탕으로 기록한다. 키의 존재만으로 모델 사용 성공이라고 표시하지 않는다. 키가 없거나 호출이 실패하면 화면에서 대체 처리임을 알린다.

## 정본 데이터

`app/scripts/export_agent_data.mjs`가 이관된 앱의 데이터에서 `app/data/runtime/kb`를 만든다. 원본 PoC의 오래된 KB 파일은 건드리지 않는다. **전체 835 / 활성 594 / 숨김 업종 표지 17 / HTML 852 / 제품 1,068 / 시나리오 22**를 검증한다. 숨김 표지는 렌더용으로만 보관해 추천 후보에는 넣지 않는 원본 의미를 유지했다.

Layout Analyzer의 자동 제품명 탐지는 큐레이션 40개와 사용자가 선택한 제품으로 제한한다. 1,068개 전체를 무조건 검색하면 일반적인 DB 제품명 때문에 오탐이 생길 수 있어 선택한 DB 제품을 추가 주입한다. 전체 제품 ID 조회 및 Storyboard KB는 1,068개다. My 템플릿은 개인 브라우저 IDB에 있어 서버 RAG 후보로 올리지 않았다.

## 검증

- 오프라인 어댑터 테스트: **30 passed**. 네트워크를 차단하고 credential 파일을 읽지 않는다. 정본 개수, RFP 대체, LangGraph interrupt→재개/중복 방지, RAG, 검토 변환, Storyboard, 비밀값 제거, 원본 PoC 불변 검증. [로그](evidence/stage2/poc-offline-tests.log)
- 실제 provider: JSON schema / 텍스트 / SSE 모두 성공. 서버 키만 사용한 작은 합성 입력. [결과](evidence/stage2/provider-live-smoke.json)
- 실제 전체 흐름: RFP·Layout(질문 답변 포함)·Storyboard·검토 모두 done, `llm.effective=llm`, 모델 `gemini-3.1-flash-lite`. [결과](evidence/stage2/poc-live-smoke.json)

### 화면 연결 최종 확인

- 2·3단계 최종 조합에서 API·PoC·기능 플래그·인증을 합쳐 **69 passed / 34 subtests passed**. 장수 목표 초과를 원본 결과 그대로 보존하고 알리는 추가 검사 3건도 통과했다. [전체 API 검사](evidence/stage2/api-tests.log) · [장수 목표 검사](evidence/stage2/soft-budget-tests.log)
- UI 업무 8건을 **1500 light / 390 dark 양쪽**에서 통과했다. 질문 radio 선택이 그래프의 실제 전략으로 전달됨, 화면 이동/새로고침 후 같은 작업 재개, 적용 도중 새로고침 복구·중복 적용 방지, 기존 파트 뒤 SBA 이어 쓰기, 실제 RAG, 26KB RFP 전체를 읽어 네 사업 중 선택, PPTX 검토·결과 복구. 두 브라우저 모두 console error 0. [데스크톱](evidence/stage2/poc-e2e.json) · [모바일](evidence/stage2/poc-e2e-mobile.json)
- 기존 전체 업무 E2E **10단계 재통과 / console error 0**. [결과](evidence/stage2/dummy-e2e.json)
- 기본 더미 화면을 폭 1500/900/390 × light/dark로 **42회 재비교**, 29회 pixels까지 동일, 최대 변경 비율 **0.0006173%**, 회귀 실패 0·앱 콘솔 오류 0. reference 쪽 `ERR_INVALID_URL` 두 건은 별도로 남겼다. [결과](evidence/stage2/visual-regression.json)
- 원본 PoC **5,971개 파일 해시 불변**. [근거](evidence/stage2/poc-unchanged.json)
- 렌더/PPTX/복원/parser 본문은 1단계 커밋 이후 변경하지 않았다. 원본 서버·sync 스크립트를 실행하지 않았다.

검토 real 모드에서는 기존 점수를 즉시 계산하는 규칙 baseline으로 남기고, 실제 모델 채점을 서버 PoC 작업으로 모았다. 두 척도를 섞지 않고 별도 카드와 리포트 구획에 표시한다. 기본 dummy에서는 기존 검토 동작을 유지한다. RFP의 rich 파일 파싱도 서버 RFP 사용 시에만 켠다.

작업 결과가 도착할 때 제안서 요구사항·파트 목록이 달라졌으면 자동 삽입을 보류하고 붙이기/버리기를 선택하게 한다. 완료 결과를 적용하는 도중 새로고침해도 서버 결과를 다시 가져오며, 이미 적용한 job id는 다시 반영하지 않는다.

## 원본에서 확인한 제한 — 수정하지 않음

- `spec_mismatches`의 크기 정규식은 `43형` 표기를 못 잡는다. 해당 자동 검토를 완전한 사양 검증이라고 해석할 수 없다.
- 원본 `_extract_json`은 JSON 뒤 설명이 붙는 응답에 약하다. provider는 응답 정규화를 담당하지만 원본 모듈은 수정하지 않았다.
- 원본 RFP cache 키에 온도/schema가 없다. 이 앱은 자체 provider를 쓰며 cache 기본값은 off다.
- 원본 testbench 질문 재개 경쟁 조건은 그 서버를 import하지 않고 앱 작업 관리자 잠금으로 막았다.
- 앱 렌더링 좌표를 직접 측정하지 않는 업로드 검토에서 overflow·빈 이미지·단계 관계 일부는 확인할 수 없다. 결과에 불확실한 기준을 명시한다.
- 진행 작업은 서버 메모리에 있다. 화면/탭 이동·새로고침 후 연결 가능하나 서버 재시작 후의 체크포인트 복원은 지원하지 않는다.
- deepagents copilot·Tavily 출처 확장·Node sim_eval 배치는 연결하지 않았다. 필요하면 provider/데이터 계약을 별도로 옮겨야 한다.

자세한 API 계약과 한계는 `app/api/poc/NOTES.md`에 있다. 디자인·슬라이드 HTML·overrides/PPTX 알고리즘을 바꾸는 작업은 포함하지 않았다.

추가 확인: `max_slides`는 엄격한 상한이 아니다. 원본 `trim_to_budget`는 필수 요구 연결 파트를 유지한다. 실제 요구 9건의 실행에서 목표 3장에 결과 8장이 나왔으며, 앱 어댑터는 이를 경고·로그로 알리고 원본 결과를 임의로 자르지 않는다.
