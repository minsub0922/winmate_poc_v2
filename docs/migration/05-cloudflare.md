# 05 — Cloudflare 외부 접속

확인일: 2026-10-20 KST.

## 실행 결과

외부 주소: https://merit-origins-cargo-technician.trycloudflare.com

Cloudflare Quick Tunnel이 기존 `127.0.0.1:8788`의 FastAPI + 웹 빌드본을 연결한다. HTTPS 외부 요청의 로그인, 동일 origin 검사, Secure 세션 쿠키가 실제로 동작한다. Gemini 키와 자격 증명 파일은 기존 서버에 남는다. 계정 비밀번호·쿠키·API 키는 이 보고서와 검증 증거에 저장하지 않았다. 공개 주소의 Chrome에서 기존 관리자 계정으로 로그인하고 홈 화면을 확인했으며 콘솔 오류는 0건이었다.

현재 서버와 cloudflared를 실행 상태로 유지했다. 컴퓨터가 꺼지거나 절전·네트워크 단절·프로세스 종료가 발생하면 사용할 수 없다. 터널을 다시 만들면 주소가 바뀐다. Cloudflare 계정 인증·고정 도메인·상시 실행 서버는 구성하지 않았으므로, 이번 결과는 상시 호스팅 서버로의 이전이 아니라 현재 로컬 앱의 외부 접속이다.

## 변경

- `app/scripts/cloudflare.sh`: 실행 중인 로컬 앱의 인증 설정을 검사하고 터널을 시작한다.
- `make tunnel`: 위 스크립트 실행. 앱은 별도 터미널에서 `./start.sh`로 실행한다.
- `app/README.md`: 실행·검증·수명과 브라우저 저장소 이동 방법을 추가했다.
- 원본 `src/`, `dist/`, `poc/`, `proddb/`와 앱 기능/UI 코드는 수정하지 않았다.

## 실제 검증

| 검증 | 결과 |
|---|---|
| 기존 스모크 검사: health, 인증 필요, 로그인, 쿠키, CSRF 거절, 카탈로그·상세, 앱, 실제 Gemini, 로그아웃·세션 폐기 | 20/20 통과 |
| 추가 외부 HTTP 검사: health, 비인증 거절, HTTPS 로그인·Secure 쿠키, 로그인 상태, 제품 1,068개, bootstrap 계정, 앱 HTML, 실제 Gemini JSON, 실제 Gemini SSE | 9/9 통과 |
| 실제 Gemini 모델 | gemini-3.1-flash-lite |
| 실제 SSE | text/event-stream, text/result 이벤트 수신, mode=real 및 요청 JSON 확인 |
| 사용자 Chrome 공개 주소 로그인·홈 로딩 | 통과, 콘솔 오류 0 |
| 터널 스크립트 구문·Git diff 검사 | 통과 |

검증에 사용한 AI 입력은 연결 확인용 합성 프롬프트다. 모델 응답을 대체하지 않았다. 긴 작업 진행은 기존 폴링 구현을 사용한다. 이번 배포를 위해 UI나 AI 전송 방식을 바꾸지 않았다.

증거: [외부 스모크](evidence/stage5/smoke.log), [추가 HTTP 검사](evidence/stage5/http-checks.json), [Chrome 화면](evidence/stage5/cloudflare-chrome.jpg).

## 실행·중지·고정 주소

```sh
./start.sh
# 별도 터미널
make tunnel
```

터널을 실행한 터미널에서 Ctrl+C로 외부 접속을 종료할 수 있다. 앱 프로세스는 따로 종료하지 않는 한 로컬에서 계속 실행된다. `WINMATE_API_PORT`를 바꾸면 앱과 터널에 같은 값을 설정한다.

고정 주소와 상시 배포를 하려면 사용할 Cloudflare 계정·도메인과 계속 실행할 서버를 정해야 한다. 현재 컴퓨터에는 Cloudflare 인증서·터널 토큰·계정 API 토큰이 없어 이름이 있는 터널이나 사용자 도메인은 만들지 않았다. 이 보고서는 이를 완료한 것으로 취급하지 않는다.

localhost와 외부 HTTPS 주소는 서로 다른 브라우저 저장소를 쓴다. 기존 제안서·My 템플릿을 이동하려면 기존 주소의 `/migration.html`에서 내보내고 외부 주소의 같은 경로에서 가져온다.
