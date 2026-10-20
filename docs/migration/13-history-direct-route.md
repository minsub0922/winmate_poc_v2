# 기존 히스토리의 즉시 경로 이동

반영·검증일: 2026-10-20 KST.

이전 구현에는 두 문제가 남아 있었다. 공유 서버 등록이 완료되기 전에는 히스토리 주소가 없었고, `go()`가 일단 `/`를 push한 뒤 별도 effect로 공유 주소를 복원했다. 같은 히스토리를 다시 클릭하면 effect 의존성이 바뀌지 않아 주소가 `/`에 남았다. [수정 전 재클릭 재현](evidence/stage13/repeat-click-before.json)에서 실제 `/`와 기대하던 기존 주소의 불일치를 확인했다. 앞선 검증은 항목 사이 이동을 확인했으며 같은 항목 재클릭을 놓쳤다.

이번에는 모든 기존 히스토리에 로컬 ID에서 만든 `endPath`를 보충하고, 클릭하는 즉시 `/storyboard/{id}`를 직접 push하도록 수정했다. 서버 공유 등록의 성공 여부와 관계없이 이 주소로 이동한다. 같은 항목 재클릭, 뒤로/앞으로, 저장된 예전 route 복원, 직접 주소로 열기, 새로고침도 이 경로를 유지한다. 예: `/storyboard/admin-sample-bs01`.

이 경로는 로그인한 소유자의 히스토리 주소다. 브라우저에 기록이 없으면 로그인한 사용자의 원본 ID로 서버 문서를 찾아 복원한다. 없는 항목은 주소를 지운 채 홈으로 보내지 않고 해당 경로에서 오류와 재시도를 표시한다. 기존 외부 방문자용 `/s/{공유ID}` 링크는 같은 원본을 계속 연다. 로컬 ID가 추측 가능하다는 이유로 방문자에게 원본을 공개하지 않으며, 소유자 조회 API와 주소의 로그인·계정 범위를 검증했다.

공유 복사는 Clipboard API가 없거나 권한이 거절되면 브라우저 복사 기능을 시도한다. 둘 다 불가능하면 기존처럼 링크를 선택해 수동 복사할 수 있다. 사용자가 보고한 공유 오류의 정확한 문구와 접속 주소는 아직 받지 못했으므로, 그 특정 오류의 원인을 확정했다고 주장하지 않는다. 확인 가능한 현재 배포본과 기존 Chrome 프로필에서는 공유 팝업·링크 복사·외부 열기가 정상이다.

## 검증

| 범위 | 결과 | 증거 |
| --- | --- | --- |
| 기존 ID/공유/실패 복구 + 직접 경로 10건 + 클립보드 호환성 | 36/36 | [브라우저 결과](evidence/stage13/browser-tests.json) |
| 소유자 경로·로그인·권한·Unicode/슬래시 ID·재시작 및 기존 공유 API | 25/25 | [pytest](evidence/stage13/api-tests.txt) |
| 기존 공유·샘플·충돌·복구 회귀 | 23/23 | [회귀 결과](evidence/stage13/sharing-regression-tests.json) |
| 공개 Cloudflare 배포본: 샘플 6개의 클릭·재클릭·주소 확인, 첫 항목 새로고침, 외부 방문자·모바일·일시 오류 | 11/11 | [배포 결과](evidence/stage13/production-tests.json) |

총 95건 통과. 브라우저 테스트의 수집된 `pageerror`는 0이다. 별도로 기존 Chrome 프로필의 이전 검토 예시를 포함한 히스토리 12개를 직접 클릭·재클릭하고 경로와 공유 링크 복사를 확인했다. [기존 브라우저 검증](evidence/stage13/existing-history-paths.json).

실행 중인 작업이 없음을 확인한 뒤 API를 정상 종료·재시작해 실제 `/storyboard/{id}`와 `/api/history/{id}` 경로를 배포했다. DB·인증 파일·터널은 보존했다. 검증한 고정 프런트엔드 빌드를 자산부터 배치하고 index.html을 교체했다. 비밀값 검사 1,161개 파일·설정 비밀값 2개에서 노출 일치와 금지 추적 경로가 없었다. 보고서·이미지에는 실제 공유 토큰을 저장하지 않았다.

## 변경과 재현

- `shared-path.js`, `App.jsx`: 명시적인 ID 경로 파싱·이동·브라우저 이력 처리.
- `proposals.js`: 기존/새/복제 히스토리의 endPath 보충. 공유 문서에는 로컬 경로를 전송하지 않는다.
- `HistoryPage.jsx`, `api/storyboards.py`: 소유자 직접 경로의 서버 복원과 오류 처리.
- `platform/runtime.js`: 클립보드 대체 복사와 포커스 복원.
- `sidebar-history.jsx`: DOM에 각 항목의 경로를 표시해 경로 검증 가능.

`node app/tests/history-sharing-path.mjs`는 현재 소스를 검증하며 `WINMATE_SHARING_SOURCE`, `WINMATE_SHARING_OUTPUT`으로 고정 소스·결과 위치를 지정할 수 있다. 기존 빌드 회귀는 `WINMATE_SAMPLE_SHARING_DIR=app/tests/output/history-direct-route node app/tests/sample-sharing.mjs`. API 테스트 명령은 위 증거 파일에 있다. 배포 검증은 `WINMATE_SAMPLE_SHARING_WEB`, `WINMATE_TEST_PASSWORD`를 환경으로 주입해 `node app/tests/live-sample-sharing.mjs`로 실행한다.

이전 공유 수정 커밋 위에 이번 변경만 `codex/history-direct-route-20261020` 브랜치로 기록한다. main과 기본 인덱스, App.jsx의 다른 작업자 변경은 보존했다. 배포본은 검증한 고정 소스를 사용한다.
