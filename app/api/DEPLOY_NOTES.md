# 로컬 인증·기동 계약

`main.py`가 `integrate_app(app)`으로 로그인 라우트와 ASGI middleware를 등록한다. `start.sh`는 의존성·웹·DB·KB를 준비하고 preflight → 계정 준비 → preflight(require-auth) → uvicorn 순서로 실행한다. API와 웹은 같은 `127.0.0.1:WINMATE_API_PORT`에서 제공한다.

| 경로 | 계약 |
|---|---|
| GET /login.html | 독립 로그인 화면, inline script/style의 SHA256 CSP |
| GET /api/auth/status | enabled/configured/authenticated boolean만 |
| POST /api/auth/login | JSON username/password, 성공 시 HttpOnly/SameSite=Strict 쿠키(12시간) |
| POST /api/auth/logout | 쿠키 삭제·현재 프로세스에서 세션 폐기 |
| GET /account.html | 로그인한 브라우저의 로그아웃 화면 |

health·login·favicon·fonts·공통 토큰 외에는 세션이 필요하다. 미인증 페이지는 303으로 로그인에, API는 401 JSON으로 응답한다. 계정 미설정은 503이다. 외부 Origin의 쓰기 요청은 403이며 `Origin: null`도 거절한다. 로그인 실패 5회/주소/10분, 전체 30회/10분을 제한한다. 비밀번호 확인은 이벤트 루프 밖에서 실행한다.

`app/data/runtime/auth/`(또는 WINMATE_AUTH_DIR)에 credentials.json과 session.secret을 0600으로 저장한다. 폴더는 0700이다. 비밀번호는 PBKDF2-SHA256 600,000회 salt/hash만 저장하며 쿠키 서명은 HMAC-SHA256이다. 비밀번호를 바꾸면 generation이 바뀌어 기존 세션이 만료된다. 쿠키는 HTTPS에서 Secure도 붙는다.

첫 실행은 무작위 비밀번호를 터미널에 한 번 표시한다. 비대화식 초기화는 `WINMATE_SETUP_PASSWORD` 또는 manage_auth의 password-env/file/stdin 옵션을 사용한다. 시작 스크립트는 setup password를 서버 프로세스 환경에서 제거한다. 이미 있는 계정은 덮어쓰지 않는다.

- 비밀번호 설정: `app/.venv/bin/python -B app/scripts/manage_auth.py --set`
- 모든 세션 종료: `... manage_auth.py --rotate-secret`
- 상태 확인: `... manage_auth.py --status` (비밀값 없음)
- 실제 로그인 smoke: `... app/scripts/smoke.py --prompt`
- 전체 데이터 검사: `... app/scripts/preflight.py --deep --require-auth`

테스트에서만 `WINMATE_AUTH=off`를 쓴다. 다른 값/오타는 인증을 끄지 않는다. Vite 개발 서버는 로컬 개발 Origin의 API 프록시만 허용해 로그인 쿠키와 CSRF 경계를 유지한다. 일반 실행은 Vite를 열지 않는다.

한계: 세션 폐기 목록은 프로세스 메모리에 있다. 서버 재시작 후 이전에 복사한 쿠키까지 폐기하려면 서명 키를 rotate해야 한다. 백엔드는 단일 로컬 사용자·단일 worker를 전제로 하며 인터넷 공개 배포·사용자별 권한 분리는 이번 범위에 없다.
