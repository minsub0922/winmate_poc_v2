# Storyboard 버튼 제거와 샘플 공유 복구

검증·반영일: 2026-10-20 KST.

## 변경 결과

- Storyboard 상단과 공유 팝업에서 `이 스토리보드 활용하기` 기능과 관련 안내를 제거했다. 소유자·읽기전용 방문자·편집가능 방문자 모두 동일하다.
- 로그인한 소유자의 샘플 히스토리는 앱 준비 후 백그라운드에서 실제 공유 API에 등록한다. 기존 로컬 ID는 유지하고, 서버가 발급한 공유 ID를 기존 `_share` 메타데이터에 저장한다. 동시 요청은 2개로 제한하며 초기 화면을 기다리게 하지 않는다.
- 서버의 소유자+원본 ID 중복 방지 계약을 사용하므로 재접속·다른 브라우저에서도 같은 공유 링크를 유지한다. 서버에 저장한 편집을 새 샘플로 덮어쓰지 않는다.
- 서버에서 사라진 **자신의** 공유 문서는 로컬 변경과 저장 대기 중인 내용을 보존해 재등록한다. 서로 다른 서버·로컬 초안은 기존 충돌 UI로 보존한다. 일시적인 서버 오류는 재시도하며, 타인의 읽기전용 링크는 소유권을 얻거나 재등록할 수 없다.
- 이미 준비된 공유 세션은 서버 재조회 응답을 기다리지 않고 즉시 사용한다. 등록 실패와 연결 끊김에는 온라인 복귀 또는 5초 후 재시도를 적용했다.
- 샘플의 로컬 메타데이터를 동기화 중에도 유지하고, 초기 공유 상태 때문에 소유자의 편집 창이 잠기는 현상을 보완했다.

실제 공유 SQLite/API를 사용한다. 이번 작업은 Gemini나 PoC 코드를 변경하지 않았다. 새 링크의 기본 권한은 기존과 같은 읽기전용이며 권한 변경은 소유자가 수행한다.

## 검증

| 범위 | 결과 | 근거 |
| --- | --- | --- |
| 실제 HTTP·인증·SQLite를 사용한 격리 브라우저 시나리오 | 23/23 성공 | [source-report.json](evidence/stage11/source-report.json) |
| 공유 API 권한·동시 변경 등 기존 회귀 테스트 | 15/15 성공 | [api-tests.txt](evidence/stage11/api-tests.txt) |
| Cloudflare 배포본: 샘플 6개·다른 admin 브라우저·비로그인·390px 모바일 | 10/10 성공 | [production-report.json](evidence/stage11/production-report.json) |

총 48건 성공. 두 브라우저 시나리오의 `pageerror` 수집 결과는 모두 0이다. 기존 사용자 Chrome 프로필에서는 이전 검토 예시를 포함한 샘플 9개의 공유 활성화와 활용하기 버튼 부재도 별도로 확인했다. 서버의 실제 공유 링크를 열어 소유자·원본 ID와 연결 상태를 검증했으며 테스트 보고서와 이미지에 공유 토큰을 기록하지 않았다.

[상단 UI 확인 이미지](evidence/stage11/sharing-toolbar.png)

검증 중 발견한 공유 토큰 갱신 누락과 불필요한 서버 응답 대기는 수정 후 전체 23건을 다시 실행해 통과했다. 마지막으로 같은 빌드를 배포하고 공개 주소에서 10건을 재검증했다. 정적 자산을 먼저 배치하고 index.html을 마지막에 교체했으며 기존 자산과 API·터널은 유지했다.

## 파일과 버전 관리

주요 변경은 `App.jsx`, `ProposalPage.jsx`, `repositories/proposals.js`, `services/sharing.js`, `components/storyboard-sharing.jsx`이다. 새 테스트는 `app/tests/sample-sharing.mjs`, `app/tests/live-sample-sharing.mjs`, `app/tests/fixtures/sample_sharing_server.py`이며 기존 `storyboard-sharing.mjs`의 복제 버튼 기대도 제거했다.

동일 작업 공간에 다른 작업자의 공유 기능 기반과 UI 변경이 커밋되지 않은 상태로 있어, main과 그 인덱스를 건드리지 않고 `codex/sample-sharing-fix-20261020` 브랜치에 기반 스냅샷과 이번 수정 커밋을 분리했다. 이번 수정 커밋은 검증에 사용한 고정 프런트엔드 파일과 해당 테스트·문서만 포함한다. 현재 작업 파일의 다른 변경은 보존했다. 배포본은 검증한 고정 빌드이며, 이후 작성된 다른 작업자의 변경까지 검증했다고 주장하지 않는다.

격리 테스트는 `app/tests/output/sample-sharing/snapshot/app/web`의 고정 소스와 `app/tests/output/sample-sharing/web-dist`를 사용한다. 새 체크아웃에서 재현할 때는 해당 경로에 검증할 web 소스·node_modules를 준비하고 Vite로 web-dist를 빌드한 다음 `node app/tests/sample-sharing.mjs`를 실행한다. API 회귀는 `app/.venv/bin/python -B -m pytest app/tests/test_storyboards.py -q`로 실행한다. 배포 테스트는 `WINMATE_SAMPLE_SHARING_WEB`과 `WINMATE_TEST_PASSWORD`를 실행 환경에 주입해 `node app/tests/live-sample-sharing.mjs`로 실행한다. 비밀번호·키·공유 토큰·런타임 DB는 커밋하지 않는다.

이번 요청의 남은 차이 또는 미완료 항목은 없다. 기존에 열어 둔 브라우저에는 새로고침으로 반영된다.
