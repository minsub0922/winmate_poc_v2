# Winmate 사내 계정·활동·제안서 이전

기존 자료의 위치 한 곳을 주면 작업자가 실제 저장소를 식별하고 현재 checkout으로 복사하는 절차다. 계정 로그인과 관리자 활동 통계에는 `operations.sqlite`, 사용자가 다시 열 제안서·검토·첨부에는 `account_data.sqlite`가 필요하다. 같은 계정 이름, 문서 ID, 첨부와 공유본의 참조 관계까지 유지해야 이전이 끝난다. 대상은 `admin.server:app` 결합 서버다. [대상 설치 및 Gauss·CLEF 등록](BOOTSTRAP_261118.md)

## 그대로 사용할 작업 프롬프트

```text
기존 정보 위치 = <여기에 기존 checkout, 런타임/백업 폴더, DB 또는 브라우저 백업의 절대경로 하나>

이 프로젝트의 DATA_MIGRATION_261118.md를 읽고, 위 위치의 사내 사용자 정보와
활동·제안서 기록을 현재 Winmate 프로젝트로 실제 복사하고 검증하라.
현재 checkout을 대상으로 삼고, 위 위치는 읽기 전용 원본으로 취급하라.
원본 트리와 제공된 설정에서 실제 경로를 확인해 출발지→목적지 표를 먼저 만든다.
전체 계정, 역할·활성 여부, 활동 로그·버전, 제안서·첨부·공유 권한·개인 자료를
발견된 범위에서 옮겨라. Git 작업물과 대상의 사내 모델 등록·비밀값을 보존하라.
백업·staging·대조 후 빈 목적지에는 직접 적용하라. 대상에 자료가 있으면
동일 항목은 건너뛰고 새로운 항목을 병합하라. 소유자·내용 충돌이나 운영 중단·
운영 파일 교체가 필요하면 관련 항목과 선택지만 보고하고 나머지 준비를 계속하라.
원본 서비스 정지·수정·삭제, 외부 전송, 비밀번호 재설정은 이 복사 요청의 범위 밖이다.
최종 보고는 파일별 건수·검증 결과·누락·롤백 위치로 작성하라. 비밀값, 쿠키,
제안서 원문, 첨부 내용, 사용자 명단, 공유 토큰을 출력하거나 커밋하지 마라.
```

## 1. 어느 자료가 어디에 있는지 확인한다

루트는 각각 **기존 배포의 루트**와 **대상 checkout 루트**다. 서비스 실행 스크립트·systemd의 `WorkingDirectory`, Docker 볼륨 마운트, 백업 manifest와 아래 경로 변수의 **경로값만** 확인한다. 데이터 경로 변수는 이 버전에서 주로 `os.environ`으로 읽는다. 대상에서 경로를 바꾸면 실제 서버/서비스 프로세스에 export한다. 기본 경로를 사용하면 추가 설정이 필요 없다.

| 복사 단위 | 기본 경로 또는 실제 경로 | 보존할 관계 |
|---|---|---|
| 계정·감사/활동 기록 | `admin/runtime/operations.sqlite`. `WINMATE_ADMIN_DATA`가 있으면 그 아래 | `users`의 username·role·active·credential_source·인증 해시·generation, `spans`의 trace/사용량/오류, `history`·`history_versions`의 payload·개정·보관 상태. 관리자 결합 서버에서는 아래 My/고객의 소리 테이블도 이 DB에 있을 수 있다. |
| 기본 로그인 | `app/data/runtime/auth/credentials.json`, `session.secret`. `WINMATE_AUTH_DIR` 우선 | `credential_source='legacy'` 계정의 PBKDF2 로그인은 원래 JSON과 한 쌍이다. `managed` 계정 해시는 `users`에 있다. 같은 세션 서명을 유지할 배포는 `session.secret`도 복사한다. 새 키로 시작하면 기존 로그인은 다시 해야 한다. |
| 계정별 실제 작업 | `app/data/runtime/account_data.sqlite` 또는 `WINMATE_ACCOUNT_DATA_DB` | `account_records`의 `(owner,collection,id)`, revision·시각·deleted와 `account_settings`의 `store_id` 값을 보존한다. 컬렉션은 `proposals`, `reviews`, `simulations`, `personas`, `favorites`, `preferences`, `buildings`, `review-docs`, `attachment-sources`다. `account_blobs`의 이미지 바이트·hash·소유자도 같은 DB에 있다. |
| 공유 Storyboard | `app/data/runtime/storyboards/{storyboards.sqlite,collaboration.secret}` 또는 `WINMATE_STORYBOARD_DIR` 아래 | `storyboards`의 token·owner·source·permission·revision·content, `storyboard_editors`, 게스트 식별 서명 키를 한 세트로 옮긴다. `user:아이디`·`guest:…` 형식을 보존한다. 도메인이 바뀌면 새 도메인에서 같은 `/s/<token>` 경로를 시험한다. |
| My 템플릿·이미지·고객의 소리 | `WINMATE_TEMPLATE_DB` 우선. 결합 서버는 보통 `operations.sqlite`, 사용자 앱 단독 배포는 `app/data/runtime/my_templates.sqlite` | `my_template_settings`, `my_templates`, `my_template_images`, `customer_voice`. `wmimg:…` 참조·소유자·삭제·revision과 문의 문맥을 보존한다. 한 물리 DB에 여러 역할이 있으면 한 번만 스냅샷한다. |
| 공간 조감도·템플릿 편집 | `app/data/runtime/spatial.sqlite` 또는 `WINMATE_SPATIAL_DB` | `scenes`, `template_edits`, `building_template_edits`. 저장 장면의 `assetRevision`에 대응하는 `app/data/spatial/versions/<revision>.json`과 참조 자산이 대상 Git에 있는지 본다. 구판 전용 자산은 같은 ID의 내용까지 대조한다. 개인 건물 장면은 `account_records`의 `collection='buildings'`에 있다. |
| 서버 작업 이력 | `account_data.sqlite`가 있는 **디렉터리**의 `jobs.sqlite` 또는 `WINMATE_JOB_DB` | `jobs` 결과·소유자·상태, `llm_steps`. 기동 시 보관 기간(작업 7일, 단계 48시간)이 지난 행은 정리되고 미완료 작업은 중단 상태로 처리된다. 오래된 이력은 기동 전 스냅샷에 보관한다. |
| 관리자 작업·자료가 범위에 있을 때 | `admin/runtime/admin.sqlite`의 `events` 등과 `uploads/`·스냅샷·릴리스의 **실제 참조 파일** | `admin.sqlite`에는 소스 인덱스·관리 설정도 있다. 사용자·활동 이전에는 앞의 `operations.sqlite`를 사용한다. 관리자 작업 감사 이력이 필요하면 관련 행과 참조를 선별한다. `settings`의 `provider_active`·`provider_endpoints`, 기존 스케줄·외부 연결·인증 캐시는 대상에 가져오지 않는다. |

제품 snapshot·Agent KB·LLM 큐·응답/이미지 캐시·서버 미리보기·`node_modules`·`.venv`·배포용 `dist`는 대상 커밋에서 재생성한다. `proddb/winmate_products.sqlite`는 제품 원본이다. `ops/data/snapshots/winmate.sqlite`, Metabase 집계, 운영 DB의 백업 사본은 경로·테이블을 대조해 **원본/파생본 중복**을 표시한다. 분석 snapshot에는 계정 인증 해시와 앱 본문 전체가 없을 수 있다. 독립 Langfuse에만 남은 trace, Metabase 자체 대시보드는 해당 스택의 별도 백업으로 기록한다. 모델 키·어댑터·`.env`는 별도 설치 절차에서 관리한다.

자료가 파일 하나면 그 파일부터 확인한다. 디렉터리면 아래처럼 **제공된 위치 안에서만** 후보를 찾고, 백업 파일명이 달라도 SQLite 헤더와 테이블로 식별한다. `rg`가 없는 호스트는 `find`로 같은 이름을 찾는다.

```bash
export WM_SOURCE='/기존/정보/절대경로'
if [ -d "$WM_SOURCE" ]; then
  rg --files --hidden --no-ignore "$WM_SOURCE" -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.venv/**' \
    -g '*.sqlite*' -g '*.db*' -g 'credentials.json' -g 'session.secret' -g 'collaboration.secret' -g '*backup*.json'
else
  file -- "$WM_SOURCE"
fi
```

날짜가 다른 백업 여러 개를 찾으면 같은 배포·백업 시점의 세트를 고른다. 기본 후보가 없으면 제공된 폴더의 JSON·JSONL·CSV·SQL 덤프와 별도 볼륨의 파일명을 조사한다. 원본에 `account_data.sqlite`가 없으면 아래의 **구버전·브라우저 자료** 절차로 간다. `legacy` 사용자는 있는데 `credentials.json`이 없으면 원래 로그인 복구를 미확인으로 남기고 해당 ID의 초기 관리자 생성을 보류한다. 한 파일에서 발견할 수 없는 계정이나 첨부를 0건으로 단정하지 않는다.

## 2. 복원 전 스냅샷

1. 원본과 대상의 실경로가 다르고 작업 디렉터리가 두 트리 밖인지 확인한다. 새 checkout에서 기동·로그인 전이라면 대상에 사용자 저장소가 없어야 한다. 이미 기동했다면 기본 admin·샘플·빈 DB도 조사 대상에 넣는다.
2. **여러 DB와 서명 파일의 기준 시점을 맞춘다.** 제공된 정합 백업, 쓰기가 멈춘 원본 또는 동일 시점의 읽기 전용 볼륨 스냅샷을 사용한다. 실행 중 DB 하나의 SQLite backup은 WAL의 커밋까지 포함하지만 여러 파일 사이의 같은 시점을 보장하지 않는다. 운영 중인 원본만 있으면 읽기 전용 조사와 시험 복원까지 진행하고, 최종 반영에는 운영자가 정한 쓰기 동결/스냅샷 시점을 사용한다.
3. 기존 대상은 앱·관리자·쓰기 작업을 확인해 중지한 뒤 대상의 DB, 동반 파일과 서명 파일도 별도 `before/`에 보관한다. 이번에 새로 생길 파일은 '기존 없음'으로 기록한다. 모든 자료와 manifest는 사내 보호 디렉터리에 `umask 077`로 둔다.

아래 함수는 **한 DB를 새 staging 파일로** 복사한다. 소스 인자가 WAL 상태의 DB라면 `-wal`·`-shm` 또는 rollback journal이 있는 원래 세트를 유지한 상태로 SQLite가 읽도록 한다. 운영 DB 본체만 `cp`하거나, WAL을 삭제하거나, `immutable=1`로 WAL을 건너뛰면 최근 기록이 사라질 수 있다. 물리 파일로 전달받은 세트는 먼저 개인 staging에 함께 풀고 그 사본에서 읽는다.

```bash
umask 077
export WM_BACKUP_PARENT='/사내/보호된/백업'    # 두 checkout 밖의 기존 디렉터리
WM_STAGE=$(mktemp -d "$WM_BACKUP_PARENT/winmate-261118.XXXXXXXX")
mkdir "$WM_STAGE/image" "$WM_STAGE/before"

wm_snapshot() {
  python3.12 - "$1" "$2" <<'PY'
import os, sqlite3, sys
from contextlib import closing
from pathlib import Path
src = Path(sys.argv[1]).resolve(strict=True)
dst = Path(sys.argv[2])
dst.parent.mkdir(parents=True, exist_ok=True)
# 기존 staging 결과도 덮어쓰지 않는다.
fd = os.open(dst, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
try:
    with closing(sqlite3.connect(src.as_uri() + '?mode=ro', uri=True)) as source:
        with closing(sqlite3.connect(dst)) as copy:
            source.backup(copy)
            copy.execute('PRAGMA journal_mode=DELETE')  # staging 사본을 한 파일로 닫는다
            if copy.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                raise ValueError('integrity_check 실패')
            if copy.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('외래 키 불일치')
    print(dst.name, 'OK')
except BaseException:
    dst.unlink(missing_ok=True)
    raise
PY
}
```

기본 경로가 확인된 **기존 결합 서버**에서 두 핵심 DB를 staging하는 예다. 실제 경로표를 기준으로 다른 DB에도 같은 함수를 적용한다. `image/` 아래에는 최종 대상의 상대경로로 DB 사본과 필요한 일반 파일만 둔다. 외부 마운트 목적지는 별도로 기록한다. `credentials.json`, `session.secret`, `collaboration.secret`은 별도 디렉터리 `0700`, 파일 `0600`으로 복사한다.

```bash
wm_snapshot "$WM_SOURCE/admin/runtime/operations.sqlite" "$WM_STAGE/image/admin/runtime/operations.sqlite"
wm_snapshot "$WM_SOURCE/app/data/runtime/account_data.sqlite" "$WM_STAGE/image/app/data/runtime/account_data.sqlite"
# 예: 공유 저장소를 발견했으면 DB와 서명 키를 함께 준비
# wm_snapshot "$WM_SOURCE/app/data/runtime/storyboards/storyboards.sqlite" "$WM_STAGE/image/app/data/runtime/storyboards/storyboards.sqlite"
# install -m 600 "$WM_SOURCE/app/data/runtime/storyboards/collaboration.secret" "$WM_STAGE/image/app/data/runtime/storyboards/"
```

## 3. 대상에 적용한다

**빈 목적지.** 검증된 `image/`의 파일을 대상의 동일 상대경로에 배치한다. 아래 명령은 서버가 멈춘 기본 경로용이다. 자료가 하나라도 겹치거나 이전 WAL이 남아 있으면 **첫 파일을 쓰기 전에** 종료한다. 다른 마운트를 쓰는 배포는 위 표에서 확인한 실경로에 동일한 원칙을 적용한다.

```bash
python3.12 - "$WM_STAGE/image" "$PWD" <<'PY'
import os, shutil, sys
from pathlib import Path
image, root = (Path(p).resolve(strict=True) for p in sys.argv[1:])
files = sorted(p for p in image.rglob('*') if p.is_file())
if not files:
    sys.exit('복원할 staging 파일이 없습니다.')
plan = [(src, root / src.relative_to(image)) for src in files]
for src, dst in plan:
    if src.is_symlink() or not dst.resolve().is_relative_to(root):
        sys.exit('경로표의 심볼릭 링크/외부 마운트를 확인하세요.')
    if any(os.path.lexists(str(dst) + ext) for ext in ('', '-wal', '-shm', '-journal')):
        sys.exit(f'기존 목적지 발견: {dst.relative_to(root)}. 병합 절차를 사용하세요.')
for src, dst in plan:
    dst.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with src.open('rb') as inp, dst.open('xb') as out:
        shutil.copyfileobj(inp, out)
    os.chmod(dst, 0o600)
PY
```

공간 자산처럼 여러 사용자가 읽어야 하는 파일은 대상 서비스 계정의 읽기 권한도 확인한다. 파일 복사가 중간에 끊기면 앱을 시작하기 전에 '기존 없음' 목록과 staging 해시를 대조해 **이번에 만든 파일만** 격리하고 재실행한다. 설치 전후의 사본 체크섬은 `sha256sum`으로 대조한다. 앱을 시작한 뒤에는 SQLite 파일 해시가 달라지므로 아래 논리 검증을 사용한다.

**이미 자료가 있는 목적지.** 운영 파일 전체를 교체하지 않는다. `before/`에서 만든 **대상 복제본**에 다음 순서로 병합하고, 검증을 통과하면 쓰기 중단 구간에 실제 상태가 `before/`와 같은지 다시 확인한 뒤 적용한다.

1. `sqlite_schema`·`PRAGMA table_info`·고유 인덱스로 양쪽 테이블/열/키를 대조한다. 대상 스키마에 명시적으로 열을 매핑하고, 구버전 변환은 사본에서 현재 앱의 초기화와 검증을 먼저 수행한다. 동일 사용자명이라도 계정 주체·권한·자격 출처가 다르면 충돌로 남긴다.
2. 각 DB는 트랜잭션으로 처리한다. `users.username`, `spans.id`, `history(username,kind,record_id)`, `history_versions(username,kind,record_id,revision)`, `account_records(owner,collection,id)`, `account_blobs(owner,id)` 등 **논리 키**로 비교한다. 동일 키·동일 내용은 건너뛰고 새 키만 삽입한다. 새 history version의 로컬 정수 PK가 충돌하면 논리 키와 참조를 보존해 배정한다. 원본 건수 = 기존과 동일 + 신규 반영 + 미해결로 맞춘다.
3. 같은 ID의 다른 payload·해시·삭제 표식·개정·권한은 대상 쪽에 덮어쓰지 않는다. 일괄 `INSERT OR REPLACE`/`IGNORE`나 최근 시각 하나만으로 충돌을 지우지 않는다. 제안서와 검토의 연결, 첨부·이미지 ID, `wmimg:`, 공유 token과 `(owner,source)` 양쪽의 유일성까지 대조한다. 신규 DB 전체 복제 시 원본 `store_id`를 유지하고, 이미 사용하던 대상에 병합할 때는 대상 `store_id`를 유지한다.
4. 대상에 이미 쓰는 서명 키가 있으면 그대로 보존한다. 서로 다른 `collaboration.secret`에 연결된 양쪽 게스트 신원을 하나의 키로 합칠 수 없으므로 해당 공유본은 따로 표시한다. 단독 서버 → 결합 서버의 My/고객의 소리는 대상 `operations.sqlite`의 해당 테이블로 옮긴다. 개인 My 템플릿의 활성 항목만 가져올 때 쓸 도구는 `app/scripts/template_account_db.py export|import`다. 삭제·revision·문의까지 보존할 전체 이전은 테이블 단위로 대조한다. [My 템플릿 저장 계약](docs/my-template-account-storage.md)
5. 같은 스냅샷으로 다시 dry-run해 신규 0건, 새 충돌 0건을 확인한다. 여러 DB의 컷오버는 서비스를 멈춘 상태에서 한 세트로 수행한다. 실패 시 일부 DB로 서비스를 재개하지 않는다.

### 구버전·브라우저 자료

- **`operations.sqlite`만 있는 구버전**은 계정과 `history/history_versions`를 먼저 보존한다. `history.kind`의 `proposal/review/simulation`은 각각 `proposals/reviews/simulations` 후보이며 `username`이 owner다. 현재 `account_records`, 삭제 표식, `archived`, JSON의 ID와 본문 완전성을 대조한다. `history`는 관리자 기록이므로 이 DB만 옮기고 앱 제안서 복원이 끝났다고 판단하면 안 된다. 본문·첨부 바이트를 찾지 못한 기록은 출처와 건수로 남긴다.
- **브라우저에만 남은 자료**는 사용자가 쓰던 프로필과 정확한 원래 origin(스킴·호스트·포트)에서 계정별로 추출한다. `/migration.html`에서 내보낸 JSON은 `format=winmate-browser-v1`, `version=1`이며 `local`과 `databases`를 포함한다. 이 문서가 포함된 대상에서는 **자료 소유자 계정**에 로그인한 별도 브라우저 프로필에서 `/migration.html`로 가져온 뒤 `/`를 다시 열어 계정 동기화를 마친다. 새 브라우저에서 같은 사용자로 다시 열어 서버 저장까지 확인한다. 가져오기는 같은 ID의 브라우저 항목을 바꿀 수 있으므로 대상의 기존 브라우저 자료도 먼저 내보낸다.
- 이전 버전의 이전 페이지는 기본 브라우저 저장소만 읽기도 한다. 일반 회원의 `winmate.account.<인코딩된 username>:` 접두사가 있는 localStorage·IndexedDB를 확인한다. 원본을 보존한 프로필 사본에서 실제 소유자의 namespace와 `app/web/src/repositories/browser.js`의 키·DB 목록을 대조한다. 별도 `winmate-building` DB나 서버에만 있는 장면, 계정 자격증명·활동 로그는 브라우저 백업 범위 밖이다. 백업 JSON에 소유자가 없고 원래 프로필이나 자료에서 확인이 안 되면 계정 배정을 보류한다.
- **다른 앱의 JSON/CSV/SQLite**라면 필드 샘플을 사내에서만 열어 계정 식별자·원문 ID·시각 단위·소유/공유·첨부 참조 매핑을 만든다. 식별 근거가 있는 레코드만 변환하고 중복 방지용 원본 키를 manifest에 기록한다. 원본이 호환되는 인증 정보를 제공하지 않으면 데이터 복원과 로그인 복구를 구분해 보고한다.

## 4. 복원 검증과 롤백

기동 **전** 각 DB 사본에서 `PRAGMA integrity_check;`가 `ok`, `PRAGMA foreign_key_check;`가 빈 결과인지 확인한다. 같은 커밋·기준 시점의 원본과 대상에서 아래 집계를 비교한다. 계정별 상세값은 보호된 manifest에만 남긴다.

```sql
-- operations.sqlite
SELECT role, active, credential_source, count(*) FROM users GROUP BY 1,2,3;
SELECT kind, status, count(*), sum(total_tokens) FROM spans GROUP BY 1,2;
SELECT kind, archived, count(*) FROM history GROUP BY 1,2;
SELECT count(*) FROM history_versions;
-- account_data.sqlite
SELECT owner, collection, deleted, count(*), sum(size) FROM account_records GROUP BY 1,2,3;
SELECT owner, count(*), sum(length(data)) FROM account_blobs GROUP BY 1;
-- storyboards.sqlite
SELECT permission, count(*) FROM storyboards GROUP BY 1;
SELECT count(*) FROM storyboard_editors;
```

건수가 같아도 payload가 다를 수 있다. 소유자·키·revision·삭제 상태와 본문/첨부 바이트의 SHA-256, 이미지 테이블 hash를 대조한다. `scenes`, `jobs`, My, `customer_voice`도 발견된 테이블마다 같은 검사를 한다. 공유 편집자에 대응하는 token이 있는지, 첨부 ID·리뷰 원문·공간 버전이 실제로 열리는지 확인한다.

기동 후에는 기존 관리자와 일반 계정으로 각각 로그인해 역할·활성 상태, 다른 계정 자료의 격리, 제안서 목록과 장표·첨부·검토/시뮬레이션·조감도·My 템플릿을 확인한다. 대표 제안서를 PPTX로 내보내고, 기존 공유 링크의 보기/편집 권한을 대조한다. 관리자 사용자 상세의 **전체 기간**에서 제안서 수·활동·로그인/오류·토큰 이력을 확인한다. 로그인 시험 자체가 새 `spans`를 만들므로 컷오버 시각 이전을 기준으로 비교한다. 실제 계정 로그인 자료가 없으면 SQL 검증 결과와 화면 미검증을 구분한다.

**롤백**은 대상 쓰기를 중지하고, 실패한 현재 세트(WAL·SHM 포함)를 별도 보관한 뒤 `before/`의 DB·서명 파일·마운트 경로·권한을 한 세트로 복원하는 순서다. '기존 없음' 파일은 대상에서 격리한다. 이전 WAL을 복원한 DB에 붙이지 않는다. 원래 서비스 명령으로 재기동해 로그인·기준 건수·대표 제안서를 다시 확인한 뒤 트래픽을 연다.

최종 보고에는 **원본 시점과 대상 SHA / 자료별 발견·동일·복사·충돌·누락 건수 / 인증·화면·참조 검증 / 사내 백업·롤백 위치**를 남긴다. 보고서와 데이터 사본은 Git 밖의 보호된 위치에 보관한다.
