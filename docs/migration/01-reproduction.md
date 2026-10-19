# 1단계 — 고정 라이브 재현 완료

기준은 0단계에 확보한 `reference/live/`(511개 게시 파일)다. 초기 소스 사본을 사용했고 조사 중 추가된 imglib·25개 시나리오 등 후기 변경을 섞지 않았다. 사용자 ‘시작해’ 이후 기본안을 먼저 알리고 진행했다.

**결과:** Vite + React와 FastAPI/SQLite로 로컬에서 실행된다. 핵심 업무 E2E, 브라우저 저장소 이관, 유효한 문서 3종, 슬라이드 복원·왕복 내보내기 검증을 완료했다. 화면 190개 비교에서 144개는 픽셀이 완전히 같고 최대 차이는 약 **0.00652%**다. 유효 시나리오의 새 앱 console error는 **0**이다.

구현 커밋: `2d81943` — `[1단계] 라이브 UI를 모듈 구조와 로컬 API·저장소 어댑터로 이전`. 이후 검증·적응기 수정은 같은 단계의 후속 커밋으로 보관한다.

## 한 일

| 경계 | 구현 |
|---|---|
| `app/web/src/pages`, `components` | 7개 라우트·원래 팝업·캔버스·탐색기·편집기. 디자인 재설계 없음 |
| `services`, `api` | 초기 데이터·검색·사진 묶음·링크·파일/이미지 처리·AI 업무 API. HTTP 전송 경계 통합 |
| `repositories` | 기존 10개 localStorage 키와 IndexedDB 3개(version 1). UI의 직접 저장소 접근 제거 |
| `platform` | 브라우저 다운로드·클립보드, sample JSON/텍스트·SSE·Abort 어댑터. 주 앱은 `window.claude`를 호출하지 않음 |
| `domain/slides` | 1280×720 렌더·applyOverrides·근거·편집 가능한 PPTX·PPTX 복원·geom/chart/presets 분리 |
| `styles/tokens.css` | 원래 테마 변수와 정확한 값의 component primitive 478개를 중앙화. 슬라이드 HTML·좌표는 토큰화로 변형하지 않음 |
| `app/api` | FastAPI와 읽기 전용 원본 DB의 별도 SQLite snapshot, 제품 UI projection·상세 pack 조회 |
| `app/data` | 고정 JSON/layouts, 불변 reference 자산 링크, 원본을 쓰지 않는 runtime 디렉터리 |

번들에만 있던 사이드바 너비 288px·간격/히스토리 패널과 검토 점수 기준 팝업·아이콘·CSS를 정상 소스에 흡수했다. **빌드 과정에서 bundle patch script를 실행하지 않는다.**

슬라이드 렌더·근거·PPTX export/import·geom/chart/presets·PDF parser 8개 핵심 모듈은 import/전송 경계를 제외한 본문이 원본과 같다. 자동 전송 경계 이전 중 PDF CMap callback 이름이 바뀌는 문제를 발견해 원래 `fetch` 메서드로 복구하고 본문 비교로 확인했다. 원본의 `isEvalSupported:false`도 유지했다.

### 데이터와 SQLite

- UI 레이아웃 594개, 전체 메타 835개(retired 241개 유지), 업종 16개, Best Scenario 22개, 제품 1,068개, 솔루션 17개, 사례 218개.
- 원본 SQLite는 읽기 전용으로 backup한다. UI의 큐레이션 문구·정렬·원래 pack 주소는 원시 product_family 컬럼만으로 재생성되지 않으므로, 고정 UI 계약을 **명시적인 materialized projection**(`wm_ui_product`, `wm_ui_detail`)으로 SQLite snapshot에 저장한다. API는 이 테이블을 조회한다.
- source goods 참조를 DB에서 검증한다. 제품 40개 큐레이션 + 1,028개 DB 행, 개수·순서·필드 값과 상세 pack 4개가 기준 데이터와 일치하는지 테스트했다.
- 사진·배경·채움·PDF 라이브러리는 게시 파일 bytes 그대로 제공한다. HTTP Range 206과 전체 pack 200을 모두 지원한다.
- 같은 Google Fonts 가족·weight의 파일 **130개 / 3,580,928 bytes**와 라이선스를 로컬 제공한다. 기준본을 바꾸지 않고 테스트에서 같은 font bytes를 사용해 비교했다.

### 아티팩트와 남은/허용한 차이

| 차이 | 이유·처리 |
|---|---|
| Claude host sample/downloads → 로컬 API/브라우저 | 실행 환경 이전에 필요한 어댑터. 더미 AI는 실제 모델 호출 성공을 주장하지 않으며 기존 규칙으로 대체 |
| media 인덱스·솔루션 메타 257개 값 | 0단계에서 확인한 정상 소스 값을 사용. 기준의 t 228개/g0 15개 잘못된 범위는 raw reference에 그대로 남아 있음. 앱은 정상 범위로 읽음 |
| DB 교체 가로 카드 없음 | 확보한 라이브에도 없음. 실제 존재하는 ‘제품 바꾸기’ 탐색기 모달을 재현 |
| 후기 imglib·bs23–25 없음 | 고정 라이브에 없으며 원본에서 진행 중이던 다른 변경. 이번 단계에 묵시적으로 포함하지 않음 |
| 데이터 bootstrap은 API에서 읽음 | 로컬 서버에 의존. 서버가 없을 때는 명확한 준비 실패 화면 제공 |
| 개인 사용자 데이터 자동 복사 안 함 | origin이 달라 불가능. 동일 저장 형식과 별도의 명시적 백업/가져오기 경로 제공 |
| 소수 래스터 픽셀 차이 | 동일 조건 전체 화면에서 최대 0.00652%. 구조·문구·핵심 로직을 바꾸는 방식으로 숫자를 맞추지 않았음 |

처음에는 local dummy 오류를 account-disabled 문구로 연결해 채우기 결과 안내문이 달랐다. 최종 어댑터는 원래 외부 host 부재의 `unavailable` 동작을 유지하도록 수정했고, 채우기·점수 팝업 12개 조건을 재검증해 통과했다.

## 검증

### 화면 비교

폭 **1500/900/390px × light/dark**, 높이 900px(모바일 844px), DPR 1, 고정 날짜·같은 font·같은 초기 저장소를 사용했다. 개인 브라우저 데이터는 쓰지 않았다. 설치 Chrome의 일부 context 종료 지연 후 Playwright **Chromium 141.0.7390.37 / build 1194**로 고정해 다시 실행했다.

- 홈/사이드바, 새/기존 요구사항, 매칭, 제품·솔루션·사례 탐색기, Storyboard, 파트 편집, 레이아웃 picker/detail/제품 교체, 라이브러리·필터·My, Best 목록/상세/장별 보기, 검토 목록/보고서/기준/장별 보기, 시뮬레이션·예시 대화.
- PPTX 가져오기 검토, My 편집기, 원래 템플릿 편집기, 내보내기 설정, 고객 프로필·선택, 더미 채우기 결과까지 추가.
- **190 비교 / 144 완전 동일 / 최대 changed fraction 0.0000651852 / capture error 0 / 새 앱 console issue 0**.
- 전체 수치: [visual-report.json](evidence/stage1/visual-report.json). 전체 PNG·diff는 로컬 `app/tests/output/visual/`에 남아 있고 테스트 명령으로 재생성할 수 있다.

주요 비교 이미지(왼쪽 기준, 오른쪽 앱):

- [홈 1500 light](evidence/stage1/screens/home-1500-light-comparison.png)
- [요구사항 390 light](evidence/stage1/screens/requirements-form-390-light-comparison.png)
- [My 편집기 900 dark](evidence/stage1/screens/my-editor-900-dark-comparison.png)

### 실제 업무 E2E

아래 전 과정을 한 브라우저에서 연결해 통과했다.

1. 새 제안서 → 실제 키보드 @ 선택, 링크 paste 경로, 제작자 의견 태그·세그먼트 저장.
2. 요구 저장 → 매칭 → 더미 Storyboard → 실제 레이아웃 검색/추가.
3. 규칙 채우기 변경안 확인·반영 → DB 제품 QM55C를 QM65C로 교체하고 overrides 확인.
4. 편집 가능한 PPTX 다운로드. ZIP 내부 1개 슬라이드, 실제 이미지 3개 이상, text box 10개 이상, 교체된 QM65C 문자열 확인.
5. 같은 파일 검토 업로드 → 실제 파싱·규칙 채점 완료 → 점수 기준 팝업.
6. 같은 PPTX를 My로 복원 → 장표 본문·이름 편집 → 저장 → 새로고침 후 내용과 Blob 이미지 유지.
7. 문서·템플릿·이미지를 JSON으로 백업 → 별도 context의 **다른 origin(localhost)**에서 가져오기 → 같은 템플릿·본문 복원.

결과: [e2e-report.json](evidence/stage1/e2e-report.json), console errors 0. 실제 개인 Claude 저장소를 추출한 것은 아니다.

### 문서·슬라이드·API

| 검증 | 결과·근거 |
|---|---|
| FastAPI/SQLite 계약 | **7 passed**. bootstrap 제품 객체·1,068개 순서/값·상세 pack·Range/full 응답·dummy 계약·원본 불변·폰트/PDF·404. [api-tests.log](evidence/stage1/api-tests.log) |
| 유효 PDF / DOCX / PPTX 검토 | **12 / 1 / 12 units**, 파싱·채점 완료, console error 0. [document-tests.json](evidence/stage1/document-tests.json) |
| 렌더·PPTX·parser 본문 보존 | **8개 본문 동일**. [preserved-rendering-logic.json](evidence/stage1/preserved-rendering-logic.json) |
| 기존 `build/my/fidelity.mjs` | 17개 입력 slide 중 보이는 16개는 LibreOffice 기준 비교 가능, 숨긴 장 1개는 reference 없음. 기준/앱의 모든 지표가 동일 |
| 기존 `build/my/roundtrip.mjs` | 16개 비교 PNG가 **bytes까지 동일**. 원본 변환 알고리즘의 오차를 없앴다는 주장은 아님 |
| 고정 reference 검증 | 511개 파일·ZIP·스크립트 지문 재검증 통과 |

기존 `build/fixtures/scan.pdf`는 `Invalid PDF structure`로 거절되는 3KB 입력이었다. 이를 정상 PDF 검증으로 오인하지 않고, 제공된 PPTX를 LibreOffice로 변환한 유효한 PDF로 별도 검증했다. fixture는 수정하지 않았다.

슬라이드 수치: [fidelity-comparison.json](evidence/stage1/fidelity-comparison.json). 원본 복원 오차(MAE)는 그대로이며, 새 앱이 PowerPoint의 모든 기능을 완벽히 재현한다는 뜻은 아니다.

### 기존 browser 스크립트

기존 35개 스크립트는 복사본에서 assertions를 유지하고 **동일한 고정 기준본과 새 앱 양쪽에서** 실행했다. Chrome 경로·키보드 modifier·출력 경로·서버/API/mock 전송만 적응했다. 자체 media 서버의 Range/full 응답·전송량 instrumentation은 보존했다. 테스트용 후기 `seeds_parts.json`은 주 앱 데이터에 섞지 않고 주입 fixture로만 제공했다.

- 새 앱에서만 실패: **0개**.
- 양쪽 완료, 기준에서도 실패하는 경우, 기준만 실패하는 경우는 [legacy-summary.json](evidence/stage1/legacy-summary.json)과 [legacy-report.json](evidence/stage1/legacy-report.json)에 각각 기록.
- 원본/앱 로그 **70개**: [legacy/](evidence/stage1/legacy/).
- `test-media`의 기준 실패 `range mode keeps downloads small`은 잘못된 인덱스의 전체 pack 대체 읽기와 관련 있다. 정상 metadata를 사용한 앱은 해당 검증을 통과했다.
- 후기 `test-imglib`, `test-std-v25`는 이번 기준에 없는 기능/시나리오를 전제로 한다.
- 그 밖에 2~3장 히스토리 가정, 예전 사이드바 순서, 파트 이름/순서, 오래된 선택자·좌표·사진 대체 expectations 등이 기준에서도 실패했다. **35개 모두 통과했다고 보고하지 않는다.**

## 실행·이관

프로젝트 루트에서 `./app/start.sh`. 기본 `127.0.0.1:8788`, 포트는 `WINMATE_API_PORT`. 준비 데이터가 없으면 해당 경로와 함께 종료한다. 설치·구조·테스트 명령은 [app README](../../app/README.md)에 있다. 최종 로그인·배포 편의는 3단계에서 마무리한다.

`/migration.html`에서 현재 origin의 JSON 백업/가져오기를 할 수 있다. 원래 Claude iframe에서는 별도 exporter와 그 host의 downloads 어댑터를 사용한다. 주 앱은 이 legacy 어댑터에 의존하지 않는다. 같은 ID는 갱신하고 다른 항목은 삭제하지 않는다.

사용 중인 Chrome 연결 도구는 종료되어 개인 브라우저 탭 열기를 완료하지 못했다. 앱 자체는 loopback에서 정상 응답하며 독립된 실제 Chromium에서 위 동작을 검증했다.

## 다음 단계

2단계는 원본 PoC를 수정 없이 import하는 별도 backend adapter로 진행한다. 원본 data/source snapshot과 라이브 데이터 차이를 app-side KB로 정규화하고, 요청/실제 모델 사용/규칙 대체 모드를 구분한다. 실제 키는 서버에서만 읽고 결과에 포함하지 않는다. 장시간 작업과 질문 응답은 서버 job으로 관리한다.

공식 Claude CLI를 정상 구독 인증 경로로 사용해 인터페이스를 교차 검토했다. 기준 검증과 분리된 새 `app/api/poc/` 어댑터 초안을 준비했으며, 원본 PoC 파일·키 파일은 수정하지 않았다. 원본 버그로 의심되는 부분은 수정 대신 다음 단계 보고서에 한계를 기록한다.
