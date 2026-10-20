# AI 요청 HTTP 403 검사 및 수정

2026-10-20. 개발 프록시가 브라우저 Origin의 포트를 `WINMATE_WEB_PORT` 또는 기본 5173과만 대조했다. CLI `--port` 또는 programmatic Vite 서버의 포트가 이 값과 다르면 정상 동일 출처 요청도 백엔드에는 서로 다른 포트의 Origin으로 전달되어 CSRF 403이 발생한다.

`app/web/dev-proxy.js`와 `vite.config.js`는 실제 수신 소켓의 포트, Host, Origin, HTTP/HTTPS를 비교해 정상 로컬 요청만 API Origin으로 변환한다. 외부·null·다른 포트의 Origin과 위조된 forwarded 헤더는 허용하지 않는다. 백엔드 인증/CSRF 검사를 끄거나 허용 출처를 넓히지 않았다.

AI 전송기의 403 오류는 구조화된 서버 코드/상세를 보존한다. 내용이 없는 403 및 Cloudflare HTML 응답은 서버 또는 중간 연결 거부로 구분하고 새로고침 안내를 제공한다. HTML 내용이나 민감한 응답 원문은 UI에 표시하지 않고 실패한 AI 요청을 임의 재실행하지 않는다.

검증:

- 실제 수신 포트 5199 / 설정값 5173에서 로그인과 Gemini layout 호출 HTTP 200, mode=real.
- 이전 방식으로 정규화되지 않은 Origin을 API에 전달하면 실제 CSRF 403 재현.
- localhost/127.0.0.1 별칭 통과. 외부/null/다른 포트는 403 유지.
- 요청 전송 검사 15개와 인증 검사 28개 통과.
- 현재 열린 127.0.0.1:8788 브라우저에서도 실제 레이아웃 분석·설계·검토 및 최신 프롬프트 편집 계획이 정상 응답했다. 이전 화면이 열려 있어 최신 화면으로 갱신했다. 검증 계획은 취소했고 제안서에 변경을 적용하지 않았다.
- 기존 공개 터널의 동일 출처 POST는 인증 전 401로 응답해, 해당 경로의 출처 검사는 통과함을 확인했다. 사용자가 처음 보고한 요청의 주소/응답 본문은 아직 확보하지 못했으므로 원래 오류가 이 개발 프록시 문제라고 단정하지 않는다.

```sh
node --test app/tests/dev-proxy.mjs
node app/tests/dev-proxy-live.mjs  # 실제 Gemini 호출
node app/tests/transport.mjs
app/.venv/bin/python -B -m unittest app.tests.test_auth
npm --prefix app/web run build
```

실제 API 검사 기록: `app/tests/output/ai-403/proxy-verification.json`.
