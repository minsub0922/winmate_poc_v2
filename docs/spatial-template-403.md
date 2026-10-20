# 업종 템플릿 이동의 출처 검사 회귀

2026-10-21 KST. 개발 프록시를 통과하는 요청에서 `Origin`이 없고 정상 로컬 `Referer`만 있는 경우를 재현했다. 프록시가 Host를 API 주소로 바꾸면서 Referer는 원래 프런트 포트에 남아, 실제 로그인 상태의 `POST /api/spatial/history`도 `403 csrf_rejected`로 거부됐다.

`app/web/dev-proxy.js`는 Origin이 생략된 경우에만 Referer를 대체 출처로 검사한다. 실제 수신 소켓의 포트, Host, HTTP/HTTPS, loopback 호스트가 모두 일치해야 API Origin으로 정규화한다. 명시된 잘못된 Origin이나 `null`, 외부 Referer, 다른 포트, cross-site/same-site 요청은 허용하지 않는다. 백엔드 인증·CSRF 정책은 변경하지 않았다.

검증은 별도 API 8840 / 프런트 5340 / 설정 포트 5173, 별도 인증·장면 DB에서 실행했다. 수정 전 같은 템플릿 요청은 403, 수정 후에는 201이었다. 후속 저장·다시 열기, localhost 별칭, 악성·잘못된 출처의 403 유지도 확인했다. 브라우저의 템플릿 확인 버튼에서 Origin을 제거한 요청이 실제 프록시에 들어오도록 재현했으며, 스튜디오로 이동·새로고침 후 6개 공간을 확인했다. 실제 사용자가 접속한 주소는 아직 제공되지 않았으므로 다른 외부 연결에서 발생한 403까지 같은 원인이라고 단정하지 않는다.

```sh
node --test app/tests/dev-proxy.mjs
node app/tests/spatial-template-csrf.mjs --ui
PYTHONDONTWRITEBYTECODE=1 app/.venv/bin/python -B -m pytest app/tests/test_auth.py app/tests/test_spatial.py app/tests/test_spatial_edit.py -q
```

증거: `app/tests/output/spatial-template-403/before.json`, `proxy-regression.json`, `studio-open.png`. 인증·공간 검사 50개와 718개 하위 검사가 통과했다. 사용자의 계정·히스토리·로그인 비밀값은 변경하지 않았다.
