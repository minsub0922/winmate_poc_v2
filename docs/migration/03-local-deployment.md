# 3단계 — 로컬 배포

## 실행 결과

루트 `./start.sh` 또는 `make up` 하나로 Python 3.12 가상환경/패키지 → 웹 빌드 → SQLite UI projection → 정본 Agent KB → 사전 점검 → 계정 준비 → 서버가 실행된다. 기본 **127.0.0.1:8788**이며 API와 빌드 웹이 같은 origin을 사용한다. `WINMATE_API_PORT`로 포트를 지정할 수 있다. Docker는 제공하지 않았으며 로컬 단일 프로세스 실행을 검증했다.

첫 실행에는 `admin`과 무작위 비밀번호를 만들고 터미널에 한 번 표시한다. PBKDF2-SHA256 600,000회의 salt/hash만 저장한다. 저장 폴더 0700, credential/서명 파일 0600이며 Git에서 제외한다. 비밀번호를 직접 정하려면 `app/.venv/bin/python -B app/scripts/manage_auth.py --set`. 비대화식 초기화의 `WINMATE_SETUP_PASSWORD`는 계정 준비 후 서버 환경에서 제거한다. 기존 계정은 시작할 때 바꾸지 않는다.

로그인 쿠키는 HttpOnly/SameSite=Strict·12시간이며, 로그아웃은 `/account.html`에서 한다. 미인증 API·이미지·문서·reference·이관 도구는 보호된다. health/login/fonts/공통 토큰는 공개한다. 타 Origin의 쓰기 요청은 거절한다. 비밀번호 변경은 모든 이전 세션을 무효화한다.

## 실제 기동 검증

`app/tests/deployment.mjs`가 격리된 credential 폴더와 메모리 내 무작위 비밀번호로 **실제 루트 start.sh**를 실행했다. 비밀번호를 출력하거나 평문 파일에 저장하지 않았다.

1. 패키지·웹·DB·KB·계정 준비 후 stage 3 health/제품 1,068개 확인.
2. 미인증 API 401, 루트 303, 외부 Origin 로그인 403 확인.
3. 실제 로그인 화면을 입력해 앱 진입, 새 제안서 작성·저장.
4. 인증된 RFP 백그라운드 작업과 SSE의 id/result 수신.
5. 로그아웃→재로그인 후 같은 브라우저 제안서 보존.
6. 독립 smoke.py, 전체 reference/KB SHA·SQLite quick_check, credential 권한·평문 미보관 확인.
7. Vite 개발 프록시에서도 실제 로그인·CSRF 경계·서버 credential 경로 접근 차단·세션 만료 시 로그인 복귀 확인.

**7단계 모두 통과 / 브라우저 console error 0**. [결과](evidence/stage3/report.json) · [smoke](evidence/stage3/smoke.log) · [deep preflight](evidence/stage3/preflight.log) · [로그인 후 화면](evidence/stage3/authenticated-app.png)

API/PoC/플래그/인증 최종 조합은 **69 passed / 34 subtests passed**. 1단계 업무 E2E 10단계, 2단계 UI 업무 9단계(데스크톱/모바일), 더미 화면 회귀 42조건도 통과했다. 실제 Gemini 4개 PoC 업무와 JSON/text/SSE는 별도 합성 입력으로 검증했다. 각 근거는 01/02 보고서에 있다. 기준에서 원래 실패한 기존 테스트를 통과로 바꾸어 보고하지 않았다.

설정된 비밀값 두 개를 앱 소스·문서·웹 빌드에서 검사했고 **일치 0 / 추적 중인 .env·runtime 파일 0**이었다. [검사](evidence/stage3/secret-check.log)

로그인·계정 페이지의 색·간격·폰트·반경도 공통 `tokens.css`에 모았다. 앱 화면은 기존 토큰 값을 유지한다. 개발용 프록시는 Origin과 Host를 API로 맞추고 Vite의 파일 접근 범위를 `app/web`로 제한했다.

## 남은 차이·운영 경계

- 기본 `WINMATE_MODE=dummy`. 실제 기능은 환경 변수로 선택해 서버를 재시작한다. 키는 프런트에 노출하지 않는다.
- 작업·LangGraph 체크포인트는 메모리라 서버 재시작 후 재개하지 못한다. 브라우저는 잃은 작업을 표시하고 이미 저장된 제안서/My/검토 자료는 유지한다.
- 원본 PoC의 장수 목표는 필수 파트를 보존하는 소프트 목표다. 초과 결과는 경고하며 임의로 자르지 않는다.
- 서버 인증은 로컬 단일 사용자·단일 worker 기준이다. 인터넷 공개 배포·다중 사용자 권한·사용자별 서버 저장소는 구현 범위가 아니다.
- 로그아웃 폐기 목록은 프로세스 메모리에 있다. 재시작 이후 복사된 과거 쿠키까지 강제로 폐기하려면 manage_auth의 `--rotate-secret`을 사용한다.
- Docker·서버 재시작 작업 복원·개인 My 템플릿의 서버 RAG·HWP/OCR·deepagents copilot·Tavily/Node sim_eval 연결은 제공하지 않는다.
- 고정 라이브의 media 범위 오류를 교정한 예외, 라이브에 없는 가로 DB 카드/후기 이미지 라이브러리, 브라우저 origin 간 수동 백업 이관은 01 보고서의 차이를 유지한다.

설치·환경 변수·개발 프록시·모드 전환·검증·데이터 갱신은 `app/README.md`, API/PoC와 인증 계약은 `app/api/poc/NOTES.md`·`app/api/DEPLOY_NOTES.md`에 정리했다. 원본 소스/PoC를 수정하거나 원격 배포·push하지 않았다.
