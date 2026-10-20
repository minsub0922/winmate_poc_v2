# Cloudflare 접속에서 기존 히스토리 공유 연결 보완

반영·검증일: 2026-10-20 KST.

## 확인한 문제

사용자가 Cloudflare 배포 페이지에서 `공유 서버에 연결하지 못했어요`를 보고했다. 실행 중인 cloudflared의 로컬 metrics에서 실제 서비스 hostname이 기존 검증 주소와 같음을 확인했다. 로컬·공개 주소의 현재 공유 API 조회·등록·빈 변경 요청은 정상 응답했다. 사용자에게 발생한 요청의 실제 HTTP 상태 코드는 아직 확보하지 못했으므로, 실제 사용자 오류가 특정 Cloudflare 상태 코드 때문이었다고 단정하지 않는다.

원래 오류 처리는 실패 응답의 JSON 파싱이 안 되거나 detail이 없으면 모두 같은 일반 문구를 표시했다. 또 브라우저에 공유 메타데이터가 없는 기존 히스토리도 문서·이미지를 다시 묶어 POST했다. 서버에 이미 같은 원본이 있어도 이 POST가 실패하면 연결할 수 없었다.

실제 인증·SQLite/API로 기존 원본을 만든 다음 브라우저의 등록 POST에 HTML 502를 주입한 결과, 기존 코드에서 사용자가 말한 문구 그대로 재현됐다. [수정 전 재현 결과](evidence/stage14/before-registration-failure.json). 이는 확인한 실패 조건이며 사용자의 실제 HTTP 응답을 캡처한 것은 아니다.

## 변경

- 기존 히스토리는 로그인한 소유자와 로컬 ID로 `/api/history/{id}`를 먼저 조회해 같은 원본에 연결한다. 있는 문서를 다시 업로드하지 않고, 실제 404로 없는 항목만 등록한다. 다른 조회 실패를 등록 요청으로 덮지 않는다.
- 기존 원본 조회가 성공하면 브라우저에 남은 만료된 blob 파일도 재포장하지 않는다. 기존 서버 원본의 ID·내용·권한을 재사용한다. 저장 대기 중인 편집은 기존 충돌·outbox 처리로 보존한다.
- 공유 응답 처리를 `share-http.js`로 분리했다. 204는 변경 없음으로 처리하고, 성공 응답도 실제 문서 JSON인지 확인한다. HTML 오류·잘못된 응답·검증 배열을 구분하며 실패 알림에 HTTP 상태 코드를 포함한다. HTML 원문이나 검증 입력값은 표시하지 않는다.
- 일시적인 gateway 응답·네트워크 오류·시간 초과는 최대 2회 재시도한다. 요청별 제한은 15초다. 등록 source와 변경 operations를 그대로 재사용해 기존 API의 멱등 계약을 유지한다. 403·413·409 등에는 전송 계층의 자동 재시도를 적용하지 않고 원인을 표시한다.
- 첫 서버 응답 전 변경을 성급하게 동기화 완료로 표시하던 상태도 보완했다. 로컬 기준 문서를 유지하고 첫 서버 응답을 받은 뒤 편집 권한을 확인해 저장한다. 지연 중 입력한 제목이 덮어써지지 않는지 실제 API로 검증했다.

## 검증

| 범위 | 결과 | 증거 |
| --- | --- | --- |
| HTTP 응답 분류·204·403·409·검증·502/503 재시도·시간 초과·등록 멱등성 등 | 14/14 | [전송 계층 테스트](evidence/stage14/transport-tests.tap) |
| 기존 ID/경로/버튼 시나리오 + gateway 실패 조건·기존 원본 조회·지연 편집 보존 | 47/47 | [브라우저 테스트](evidence/stage14/browser-tests.json) |
| 기존 샘플·충돌·복구·권한 회귀 | 23/23 | [기존 회귀](evidence/stage14/sharing-regression-tests.json) |
| Cloudflare 실제 배포본: 기존 원본 조회·0회 재등록, 링크 복사·외부 열기·모바일·재등록 실패·일시 gateway 복구 | 13/13 | [배포 테스트](evidence/stage14/production-tests.json) |

총 97건 통과. 수집된 브라우저 pageerror는 0이다. 오류 주입은 실패 조건 재현용이며, 정상 문서 응답·소유권·외부 열기는 실제 인증·SQLite/API로 검증했다. PoC나 Gemini 응답을 더미로 대신하지 않았다. 47건을 검증한 고정 소스의 Vite 빌드를 자산부터 배치하고 index.html을 마지막에 교체했다. API·DB·터널은 재시작하거나 변경하지 않았다.

최종 확인 중 다른 UI 작업의 빌드가 활성 index.html을 교체한 것을 발견했다. 해당 활성 번들에도 새 공유 구현이 포함되고, 공유 소스가 검증한 고정 소스와 같음을 확인했다. 이 활성 배포본에 대해 공개 주소 13건을 다시 실행했다. [활성 빌드 확인](evidence/stage14/active-build-check.json).

배포본에서는 기존 샘플의 최초 연결에 등록 POST가 0회인 것을 확인했다. 등록 POST를 HTML 오류로 강제 실패시키는 브라우저에서도 기존 서버 원본을 조회해 공유 링크를 복사했다. 502를 두 번 주입한 뒤에는 실제 배포 API로 자동 복구되는 것도 확인했다. [공유 팝업 화면](evidence/stage14/sharing-dialog.png)은 실제 공유 URL 입력 부분만 가렸다.

## 실행·버전 관리

- `node --test app/tests/share-http.mjs`.
- `node app/tests/history-sharing-path.mjs`: 현재 소스로 47건 실행. `WINMATE_SHARING_SOURCE`와 `WINMATE_SHARING_OUTPUT`으로 고정 소스·결과 위치를 지정할 수 있다.
- `WINMATE_SAMPLE_SHARING_DIR=app/tests/output/cloudflare-sharing node app/tests/sample-sharing.mjs`: 고정 빌드의 기존 23건 회귀.
- `WINMATE_SAMPLE_SHARING_WEB`, `WINMATE_TEST_PASSWORD`를 실행 환경에 주입해 `node app/tests/live-sample-sharing.mjs`. `WINMATE_SHARING_PROOF`를 지정하면 실제 공유 URL을 가린 확인 이미지를 저장한다.

이전 직접 경로 수정 커밋 위에 이번 변경만 `codex/cloudflare-sharing-20261020` 브랜치로 기록한다. main과 기본 인덱스 및 다른 작업자 변경은 보존했다. 실제 공유 토큰·비밀번호·키는 보고서나 이미지에 저장하지 않았다.

사용자 브라우저에서 같은 실패가 남으면 새로 표시되는 HTTP 상태 코드가 추가 진단에 필요하다. 이전의 일반 문구만으로 실제 응답 코드를 확정하지 않는다.
