# My 템플릿 계정 저장

로그인한 계정의 My 템플릿은 서버 SQLite의 `my_templates`와 `my_template_images`에 함께 저장한다. `owner`는 요청 본문이 아닌 검증된 로그인 세션에서 결정한다. HTML, 메타데이터, 사진 바이트를 같은 트랜잭션에 저장하며, 브라우저 IndexedDB는 캐시와 기존 자료 이관에 사용한다.

관리자 결합 서버(`admin.server:app`)에서는 `users`가 있는 기존 `admin/runtime/operations.sqlite`를 사용한다. `WINMATE_ADMIN_DATA`가 지정되어 있으면 그 디렉터리의 `operations.sqlite`다. 일반 서버는 `app/data/runtime/my_templates.sqlite`를 사용하며 `WINMATE_TEMPLATE_DB`로 영속 DB 경로를 지정할 수 있다. 서버 재시작·배포 때 이 DB를 보존한다.

기존 브라우저의 템플릿은 로그인 후 앱을 열면 같은 계정으로 한 번 이관한다. 동일 ID가 서버에 있으면 서버 수정본을 우선하고 중복 생성하지 않는다. 삭제 기록도 보존하여 오래된 브라우저에서 삭제한 항목을 다시 업로드하지 않는다. 기존 서버 버전과 다른 수정·삭제는 HTTP 409로 거절한다. 서버 저장이 실패하면 브라우저 저장만으로 성공을 표시하지 않는다.

같은 백엔드를 가리키는 localhost·IP·배포 도메인과 다른 브라우저는 같은 계정 자료를 조회한다. 별도의 독립 서버는 DB가 자동으로 연결되지 않는다. 그 서버에도 이 코드를 배포하고 해당 계정의 템플릿을 이관해야 한다. SQLite WAL 파일을 여러 머신의 네트워크 파일시스템에서 동시에 쓰는 방식은 사용하지 않는다.

별도 서버로 옮길 때에는 계정 템플릿과 사진만 내보내며 인증 정보와 다른 계정 자료는 포함하지 않는다.

```sh
app/.venv/bin/python -B app/scripts/template_account_db.py export \
  --db admin/runtime/operations.sqlite --username admin --file admin-my-templates.json

# 대상 서버에서 앱을 한 번 실행하여 DB를 준비한 뒤:
app/.venv/bin/python -B app/scripts/template_account_db.py import \
  --db admin/runtime/operations.sqlite --username admin --file admin-my-templates.json
```

대상 서버가 일반 앱이면 그 서버의 `WINMATE_TEMPLATE_DB` 또는 `app/data/runtime/my_templates.sqlite`를 지정한다. 가져오기는 동일 ID의 기존 수정본과 삭제 기록을 덮어쓰지 않는다. 이후 동일 계정으로 로그인하고 My 템플릿을 열면 된다. 두 독립 DB 사이의 실시간 동기화 기능은 아니다.

검증:

```sh
app/.venv/bin/python -B -m pytest app/tests/test_my_templates.py app/tests/test_auth.py -q
npm --prefix app/web run build
node app/tests/my-account-templates.mjs
```

브라우저 검사는 임시 인증·DB와 서로 다른 서버 주소 두 개를 사용한다. 브라우저 자료 이관, 새로운 브라우저의 사진 포함 복원, 다른 서버에서 변경한 이름의 반영, 저장 실패 보존, 삭제 후 오래된 캐시의 재이관 방지를 확인한다.
