# 히스토리 ID·공유 경로 기준의 Storyboard 공유

반영·검증: 2026-10-20 KST.

## 원인과 수정

이전 수정은 정상 연결 상태에서 샘플을 등록하는 경우를 검증했지만, 이미 공유 URL이 있는 히스토리도 서버 재조회 상태가 `loading` 또는 `offline`이면 공유 버튼을 비활성화했다. 기존 코드와 실제 인증·SQLite/API를 사용해 503 재조회 실패를 주입했을 때 버튼을 클릭할 수 없다는 회귀를 재현했다. [수정 전 재현 결과](evidence/stage12/regression-before.json)의 실패 1건은 이 문제를 확인하기 위한 의도된 결과다.

공유 버튼은 이제 언제든 팝업을 열 수 있다. 기존 공유 경로가 있으면 동기화 재조회 대기·일시 실패 중에도 그 링크를 복사한다. 최초 등록 전에는 팝업에서 준비 상태나 실제 오류·재시도를 표시한다. 서버가 404로 존재하지 않음을 확인한 타인 링크는 복사를 막고 오류를 표시하며 소유권을 만들지 않는다. 권한 변경은 서버 상태가 확인된 소유자만 가능하다.

각 히스토리의 로컬 `id`는 유지한다. 서버 응답의 고정 공유 `id`와 `endPath`를 `_share.id`, `_share.endPath`에 저장하고 기존 `_share.token`도 호환성을 위해 유지한다. 공유 경로는 `/s/<공유 ID>`이며, 복사하는 URL은 현재 접속한 origin과 이 경로를 결합한 값이다. 현재 주소 표시줄도 같은 경로를 사용한다. 기존 token만 저장한 히스토리는 원본 ID·공유 링크를 바꾸지 않고 메타데이터를 보충한다. ID와 경로만 가진 메타데이터도 읽을 수 있다.

샘플뿐 아니라 로그인한 소유자의 기존 히스토리 전체를 최대 2개씩 백그라운드 등록한다. 이미 저장된 서버 원본과 편집 내용은 재등록으로 덮어쓰지 않는다. 공유 세션의 ID가 바뀌면 구독도 연결을 바꾸고, 화면에서 사용하지 않는 히스토리는 반복 조회를 중단해 서버 부하를 줄였다.

## 검증과 배포

| 범위 | 성공 | 증거 |
| --- | --- | --- |
| 고정 ID·경로, 이전 형식 호환, 일반 히스토리, 외부 접속, 재접속 등 | 12/12 | [신규 테스트](evidence/stage12/identity-and-button-tests.json) |
| 지연·503·첫 등록 실패·복구·클립보드 거절·사이드바·390px·방문자 등 | 12/12 | 위와 동일 |
| 기존 샘플·권한·충돌·삭제 복구·버튼 회귀 | 23/23 | [기존 회귀](evidence/stage12/sharing-regression-tests.json) |
| 공유 API 기존 회귀 | 15/15 | [pytest](evidence/stage12/api-tests.txt) |
| Cloudflare 배포본: 실제 링크 복사·ID/경로 대응·외부·모바일·503 재조회 실패 | 11/11 | [배포 검증](evidence/stage12/production-tests.json) |

총 73건 성공. 브라우저 시나리오의 `pageerror` 수집은 모두 0이다. 별도로 기존 Chrome 프로필의 히스토리 12개를 각각 열고 공유 버튼·링크 복사 활성화와 현재 주소/공유 경로 일치를 확인했다. [기존 브라우저 결과](evidence/stage12/existing-browser-checks.json), [상단 화면](evidence/stage12/sharing-toolbar.png).

수정 전후의 고정 소스로 회귀를 확인하고, 수정본 Vite 빌드로 기존 23건을 다시 실행했다. 같은 빌드를 정적 자산부터 배치한 후 index.html을 교체했다. 실행 중인 실제 서버가 `id`, `endPath`, `sourceId`를 올바르게 반환하는 것도 확인했다. 기존 API·터널과 정적 자산은 유지했다. 키 검사: 파일 1,143개, 설정 비밀값 2개 검사, 노출 일치와 금지 추적 경로 없음. 실제 공유 토큰·링크·비밀번호는 보고서에 저장하지 않았다.

## 재현과 버전 관리

- `node app/tests/history-sharing-path.mjs`: 현재 `app/web` 소스와 격리된 실제 API·인증·DB를 사용한다. 기능별 12건씩이며 모델 성공 응답을 대신 만들지 않는다. `WINMATE_SHARING_SOURCE`로 고정 소스를 지정할 수 있다.
- `WINMATE_SAMPLE_SHARING_DIR=app/tests/output/history-sharing-path node app/tests/sample-sharing.mjs`: 해당 디렉터리의 `snapshot/app/web`과 `web-dist` 고정 빌드로 기존 23건을 실행한다.
- `app/.venv/bin/python -B -m pytest app/tests/test_storyboards.py -q`.
- 배포 검증은 `WINMATE_SAMPLE_SHARING_WEB`, `WINMATE_TEST_PASSWORD`를 환경으로 주입해 `node app/tests/live-sample-sharing.mjs`를 실행한다.

공동 작업 공간의 main과 기본 인덱스는 보존했다. 이전 공유 수정 커밋 `88ece5f` 위에 이번 변경만 `codex/history-sharing-endpath-20261020` 브랜치로 기록한다. App.jsx의 다른 작업자 변경은 작업 공간에 유지하고 이번 커밋에는 해당 파일의 공유 관련 수정만 포함한다. 현재 배포는 검증한 고정 소스를 사용한다.

이번 요청의 미완료 항목은 없다. 기존에 열어 둔 화면에는 새로고침이 필요하다.
