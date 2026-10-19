# Gemini 전용 운영·기능별 검증

완료 기준: 2026-10-20 KST. 실행 로그의 `20261019T151448Z`는 UTC로 같은 날 00:14 KST에 해당한다. 00~03 보고서는 더미 제거 전의 이전 단계 기록이며, 현재 동작은 이 보고서와 app/README.md를 따른다.

## 변경

- 운영 AI 경로에서 더미 응답·규칙 대체·재생 모드·자동 예시 히스토리를 제거했다. 기존 사용자 자료를 삭제하지 않는다. 제품 DB·실제 사례·레이아웃·Best Scenario는 정적 원본 데이터다.
- app의 fallbackStoryboard, heuristicExtract/Fill, ruleTurn/Scores/Eval/Debrief, typeOut, 예시 주입 코드와 미사용 예시 파일을 제거했다. 예전 더미 전용 테스트는 새 계약/실제 호출 검사로 대체했다.
- 원본 PoC는 수정하지 않았다. 정본 KB를 명시적으로 주입하고 strict 어댑터에서 실패를 외부로 올린다. 실제 모델 단계가 실패하면 job=error/HTTP 오류이며 성공 점수나 본문을 만들어 대체하지 않는다. 원본 PoC에 남은 연구용 규칙 경로는 앱에서 진입하지 않는다.
- `/api/llm`의 feature와 JSON schema를 검증한다. offline:true, llm:false, mode:dummy는 422. 과거 환경 모드 값은 실제 실행을 끄지 못하며 경고한다.
- 시작 시 Google 공식 `generativelanguage.googleapis.com`에 실제 JSON 생성 요청을 보내 연결을 확인한다. 이 검사는 출력 캐시를 우회한다. 성공해야 health.gemini.verified=true이며 키가 없거나 연결에 실패하면 기동하지 않는다.
- 사용자 헤더의 고정 이름·소속도 제거해 인증한 로컬 계정 이름을 표시한다.

## 발견·수정한 문제

| 문제 | 개선·재검증 |
|---|---|
| 시뮬레이션이 문자열 응답을 res.text로 읽어 버림 | string 계약에 맞춰 대사·평가·총평을 Gemini로 처리. 평가가 깨지면 실제 구조화 재질문, 실패 시 오류/재시도 |
| 실패 시 가짜 항목·본문·점수로 성공 | 데이터 대체 코드 삭제. 오류를 표시하고 입력·파싱 문서를 유지 |
| 채우기 변경 0건을 성공으로 표시·글자 수/출처 위반 | 실제 변경·칸 번호·길이·출처 검증. 잘못된 칸만 Gemini로 보정하고 나머지 정상 문구는 유지. 최종 10/10 |
| 추천 답변에 확인되지 않은 효과 수치 | 제공 자료에 없는 수치 제안을 제외. 모자란 답변을 규칙으로 채우지 않음 |
| RFP 재시도가 2만 자 excerpt를 사용 | 실패 작업의 원문 closure를 서버에서 1시간 재사용. 성공 시 해제. 만료/재시작 뒤 긴 파일은 재첨부 안내 |
| 실패 작업 카드가 잠시 후 사라짐 | 명시적으로 닫거나 재시도할 때까지 유지 |
| 실패한 대화 뒤 새 메시지를 보내면 발화가 연속 추가됨 | 마지막 실패 발화를 수정 전송하고 이전 버전은 기록에 보존 |
| 마지막 재시도에도 불필요한 대기·동시 요청 증가 | 마지막 backoff 제거, 전체 호출 deadline 60초, 동시성 4, 취소 시 lease 해제. 작업 수 100 상한 |
| UTF8/CRLF가 청크 경계에서 분리되면 SSE 처리 실패 | 누적 버퍼 정규화·typed error·불완전 종료/취소 검증 12건 |
| 제품 검색 total/offset/wildcard 오류 | 필터된 total, offset-only, LIKE literal 처리. 제품 계약 12/12 |
| URL 쿼리별 캐시 충돌·UI 의존 초기화 | query·path 대소문자를 보존하고 bootstrap 기반 local reference 조회. 저장소 13/13 |
| 백업이 기존 제안서 배열을 덮어씀 | ID 기반 추가 병합, 같은 ID만 갱신. JSON/DB 이름 검증 후 쓰기 |
| RFP PDF 읽기에 불필요한 이미지 생성 | textOnly 경로·operator/raster 작업 생략·PDF worker 해제. 같은 12쪽 문서의 추출 텍스트 일치 |

## 실제 Gemini 검증

**13개 기본 기능 130건 + 실제 픽셀·사용자 기준 선택 검토 10건 = 140/140 성공.** 응답을 흉내내는 provider나 네트워크 replay를 사용하지 않았다. 앱 출력 캐시는 끄고, 검색은 새 서버에서 서로 다른 질의/맥락으로 수행했다. 합성 고객·사업 입력만 전송했다. 실제 모델 호출 통계와 최종 결과 형식을 확인했다. 기본 130건의 1차 전체 실행은 **235.16초**였다. 비전 검토를 포함한 최종 단일 명령 실행은 **348.43초**, 140/140이었다.

| 기능 | 통과 | 중앙값 | p95 |
|---|---:|---:|---:|
| rfp | 10/10 | 7.84s | 10.03s |
| layout | 10/10 | 16.10s | 28.61s |
| storyboard | 10/10 | 4.92s | 7.96s |
| search | 10/10 | 1.72s | 2.60s |
| review | 10/10 | 11.99s | 14.69s |
| part | 10/10 | 1.78s | 2.58s |
| fill | 10/10 | 3.25s | 5.90s |
| rerank | 10/10 | 2.27s | 2.71s |
| customer | 10/10 | 4.52s | 6.02s |
| debrief | 10/10 | 2.73s | 5.68s |
| json | 10/10 | 1.76s | 7.31s |
| text | 10/10 | 1.80s | 4.24s |
| vision | 10/10 | 4.78s | 8.72s |

[집계](evidence/stage4/live-summary.json) · [백엔드 사례별 기록](evidence/stage4/live-backend.json) · [프런트 함수 사례별 기록](evidence/stage4/live-frontend.json)

p95는 각 기능 표본 10개의 상위값이며 병렬 부하·요청 대기를 포함한다. 비전은 단순한 모양 개수와 **참조 팔레트와의 비교**를 10건 검사했다. 처음 CSS 갈색을 자연어 색상 이름만으로 물었을 때 빨강과 모호했던 테스트 명세를 보완한 것이다. 일반 이미지나 OCR 전체 정확도를 보장한다는 뜻은 아니다.

## 비모델 기능·오류·UI 검증

| 기능군 | 사례·결과 |
|---|---|
| API/인증/provider/strict 정책/재시도 | pytest **123 passed / 44 subtests passed** |
| SSE 전송·취소·오류 경계 | 12/12 |
| 제품 조회·상세·이미지·검색·페이지 | 12/12 |
| 작업 대기·취소·질문 재개·로그·보관 | 14/14 |
| 공통 카탈로그 | 10/10, 전체 17개 솔루션/218개 사례/22개 시나리오 참조 검사 |
| 서로 다른 레이아웃 PPTX 내보내기·복원 | 10/10, editable text·그림·배경·굵게·순서·My 재출력 |
| 잘못된 PPTX 입력·실행 방지 | 10/10 |
| 저장소·Blob·백업·별도 origin·추가 병합 | 13/13 |
| 폼·@/링크 태그·DB 교체·편집·업로드 UI | 12/12 |
| 첨부 원문 읽기·문자 보존·과대 파일·명확한 실패 | 12/12 |
| 솔루션 탐색·선택·실제 repository 연결 | 10/10 |
| 사례 탐색·선택·실제 repository 연결 | 10/10 |
| Best Scenario 실제 상세·Storyboard | 10/10 |
| 단일 시작 명령·로그인·실제 연결·SSE·재로그인·계정 유지·경계 | 11/11 |

모델 성공을 검사하는 130건과, 모델 호출을 막아 저장·파싱·오류를 검사하는 결정론적 suite를 구분한다. 고의 장애를 주입하는 unit test의 fake provider는 성공 결과를 만들지 않는다.

실제 UI 연계도 **11단계 완료 / page error 0**. 새 제안서 → RFP Gemini 정리 → @태그 → Agent/전략 질문/채우기 → 실제 Gemini 검색 → 채우기 diff/적용 → DB 교체 → 편집 가능한 PPTX → 실제 서버 AI 검토 → My 가져오기/저장/새로고침. 일부 단계는 저장된 동일 실행 자료를 재접속해 이어 검증했다. [실행 기록](evidence/stage4/live-journey.json) · [Agent 화면](evidence/stage4/agent-result.png) · [실제 검토](evidence/stage4/actual-review.png)

PDF 예제 12쪽은 같은 텍스트를 유지하면서 렌더 포함 약 **318ms**, 원문 전용 약 **17ms**였다. 순차 로컬 측정값이며 첫 실행의 폰트/worker 준비 비용도 포함할 수 있다. 앱은 RFP에서 불필요한 렌더를 하지 않는 경로를 사용한다. [입력 파일 검사](evidence/stage4/input-readers.json)

검사 작성 중 잘못 가정한 항목도 수정했다. PoC의 장 번호 0은 빈 인용과 함께 “근거 없음”을 뜻하며, nullable 업종·undefined 참조는 원본 계약이다. 존재하지 않는 10개 pack을 가정하지 않고 실제 4개 pack에서 10개 제품을 검증했다. UI 저장소 debounce를 기다려 동일 완료 record를 검사하게 했다. 이들을 앱 오류로 보고하지 않았다.

## 운영·보존·한계

- 기본 실행은 `./start.sh` 또는 make up, 127.0.0.1:8788·로그인 유지. 실제 Chrome에서 로그인·홈 표시를 확인했다. [운영 화면](evidence/stage4/production-chrome.jpg) · [운영 smoke](evidence/stage4/production-smoke.log)
- 원본 PoC **5,971개 파일 SHA 불변**. 유효 슬라이드의 렌더·overrides·PPTX export/import 알고리즘을 바꾸지 않았다. PDF parser는 기본 출력은 유지하고 RFP 원문 전용 옵션·자원 해제만 추가했다.
- 정적 DB/레이아웃/사진은 고정 라이브 기준을 유지한다. 257개 media 메타데이터 교정, 가로 DB 카드/후기 이미지 라이브러리 미포함 등은 01 보고서의 알려진 차이다.
- 새 AI 결과는 비결정적이므로 예전 더미 문구·예시 히스토리와 같지 않다. 이전 자료는 호환해 읽지만 새 예시/가짜 대화를 주입하지 않는다.
- 서버 재시작 후 진행 작업/질문 체크포인트는 복원하지 않는다. 만료된 긴 첨부는 재업로드가 필요하다. 업로드 검토는 앞쪽 120개 보이는 장, PDF 화면 검토는 선택한 최대 4장, 원문 PDF는 1,000쪽 상한이며 초과를 숨겨 처리하지 않는다.
- HWP·스캔 OCR·DeepAgents copilot·Tavily 확장·인터넷 다중 사용자 배포는 범위 밖이다. 지원하지 않는 형식은 명시적으로 안내한다. 모델 장애·quota·검증 실패는 UI 오류/재시도로 처리한다.

## 재실행

```sh
make test
make test-live
WINMATE_TEST_URL=http://127.0.0.1:8788 WINMATE_TEST_PASSWORD=... make test-browser
app/.venv/bin/python -B app/scripts/smoke.py --prompt
```

실제 호출은 API 사용량을 발생시킨다. 원시 결과는 app/tests/output/strict에, 주요 증거는 이 보고서 옆에 있다. 실제 API 키·비밀번호·서명 키는 커밋하지 않는다.

## 실제 픽셀 검토·기준 재평가 연결

최종 화면 확인 중 기존 “PDF 화면까지 본다”는 문구와 달리 서버에는 본문/좌표만 전달되던 연결 누락을 확인해 수정했다. PDF/동일 내용 PPTX+PDF의 실제 렌더 이미지를 최대 4장 선택해 Gemini 비전 채점에 보낸다. 디자인 기준은 해당 픽셀을 보고 평가하고, 장표 번호와 사용한 모델을 결과에 기록한다. 모든 장을 본 것처럼 표시하지 않는다.

또한 재평가 체크박스가 변경분만 전달해 선택 기준이 누락되던 버그를 고쳤다. 실제로 고른 전체 기준 목록을 보내고 원본 PoC의 force 인터페이스로 그 기준을 Gemini가 채점한다. 수동 선택은 규칙 대체가 아니다. 자동 평가는 기존처럼 Gemini가 기준을 고른다.

실제 픽셀·수동 기준 API 10건과, 합성 사업에서 실제로 내보낸 PPTX/동일 PDF를 업로드한 UI 검토·체크박스 재평가 2단계를 추가했다. 성공 결과의 models_used에는 실제 사용한 Gemini 모델, conversion.visual에는 실제 확인 장·비전 호출 수가 있다.

최종 추가 검증: [실제 픽셀/수동 기준 API 10건](evidence/stage4/live-visual-review.json) · [PDF 업로드 및 체크박스 재평가 UI](evidence/stage4/live-visual-ui.json) · [실제 화면 검토](evidence/stage4/actual-pixel-review.png) · [선택 기준 재평가](evidence/stage4/manual-criteria-review.png). 모두 통과, page error 0.
