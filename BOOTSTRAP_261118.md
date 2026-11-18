# Winmate 사내망 설치와 Gauss·CLEF 등록

대상은 GitHub에서 소스를 받아 사내 Ubuntu 서버 한 대에 사용자 앱과 `/admin/`을 함께 띄우는 운영자다. Gauss는 생성·대화, CLEF는 후보 선택·점수 판단을 맡는다. 기준 소스는 2026-11-18의 `origin/main`, 사내 모델 연결 계약이 들어간 `22bd498b`다. **설치에는 이 문서가 포함된 커밋을 사용한다.** 아래 명령은 저장소 루트에서 Bash로 실행한다.

**첫 설치 순서**는 clone → 오프라인 의존성 설치 → 사내 모델 등록 → 검증 → 기동이다. 기존 서버에서 이전할 때는 **새 앱에 처음 로그인하기 전** 데이터 복원을 끼워 넣는다. [계정·활동 데이터 이전](DATA_MIGRATION_261118.md)

## 사내 작업자에게 넘길 프롬프트

아래 두 경로에는 사내 폴더 또는 파일의 절대경로를 넣는다. 모델 자료는 기존 사내 checkout, 연동 코드, API 명세, 승인된 설정 묶음 중 하나면 된다.

```text
현재 checkout의 BOOTSTRAP_261118.md에 따라 사용자 앱과 관리자 콘솔을 재현하라.
Gauss·CLEF 자료 위치 = <사내 절대경로>
의존성 묶음 위치 = <사내 절대경로 또는 사내 호스트에 이미 설치되어 있는 위치>

원본을 읽어서 실제 모델 ID·주소·인증 방식·대상 목록을 확인하고 사내 어댑터와
.env.inhouse를 등록하라. .env.example의 공통값을 쓰고, 개별 비밀값만 루트 .env에서
읽게 하라. 비밀값은 사람에게 보이는 출력이나 Git에 남기지 마라.
공개 API 호출 없이 모델 두 개의 등록·실제 응답·앱 내 선택까지 각각 확인하라.
자료에 빠진 항목은 이름만 보고하고, 확인된 범위의 설치·검증은 계속하라.
기존 계정 자료도 제공되면 DATA_MIGRATION_261118.md에 따라 첫 로그인 전에 복원하라.
완료 보고에는 Git SHA, 실행 주소, 사용한 모델 ID, 점검별 통과·미검증 사유를 적어라.
```

## 1. Clone과 준비물

```bash
git clone --single-branch --branch main https://github.com/minsub0922/winmate_poc_v2.git winmate
cd winmate
git rev-parse HEAD
test -f BOOTSTRAP_261118.md && test -f admin/.enabled
test -f proddb/winmate_products.sqlite && test -d app/data/static/img
```

Git에는 제품 SQLite, 앱·관리자 소스, 이미지·폰트, 레이아웃, 어댑터 계약이 있다. **빈 호스트에 clone만으로 설치할 수 없는 부분**은 아래와 같다. 의존성과 모델 등록본을 사내에 한 번 준비하면 이후 서버에서 같은 묶음을 재사용할 수 있다.

| 준비물 | 기준과 확인 방법 |
|---|---|
| 실행 환경 | Ubuntu의 Bash, Git, make, curl, Python 3.12와 venv/pip, Node.js·npm. 저장소의 재현 기록은 Python 3.12.13, Node 22.22.3, npm 10.9.8이다. `python3.12 -V`, `node -v`, `npm -v`로 기록한다. |
| Python wheelhouse | 대상 OS·CPU·Python ABI용 wheel과 전이 의존성. 앱·테스트는 `app/tests/requirements.txt`가 `app/api/requirements.txt`를 포함한다. 관리자의 PDF·이미지 처리는 `admin/requirements.txt`도 필요하다. |
| npm 캐시 | `app/web/package-lock.json`과 같은 버전의 dev·optional 패키지 및 대상 CPU용 esbuild, Rollup, sharp/libvips. 앱·관리자 빌드는 `app/web/node_modules`를 공유한다. |
| Chromium | 서버 3D 렌더링용 Playwright Chromium과 OS 라이브러리, 또는 사내 배포 Chrome/Chromium. 실행 파일을 직접 지정하려면 `WINMATE_SPATIAL_RENDER_CHROME`을 등록한다. |
| 모델 | 사내에서 접근할 수 있는 Gauss·CLEF 서버 또는 승인된 터널, 실제 어댑터/명세, 필요한 인증 정보와 사내 CA. Git의 `clef-flash/` 설치 파일이나 모델 가중치를 전제로 하지 않는다. |

**의존성 묶음을 만드는 쪽**에서는 대상과 같은 Ubuntu·아키텍처에서 같은 커밋을 체크아웃한다. 패키지 공급이 허용된 사내 미러 또는 기존 검증 캐시를 사용한다. 다음 두 명령의 `/사내/배포`는 운영자가 쓰기 가능한 묶음 경로다. npm 캐시를 미러에서 채웠으면 설치 쪽에도 동일한 registry 설정을 제공한다. `npm ci`는 준비용 checkout에서 실행한다.

```bash
export WM_PYPI_SIMPLE='<사내 PyPI simple URL>'
export WM_NPM_REGISTRY='<토큰을 포함하지 않은 사내 npm registry URL>'
python3.12 -m pip download --index-url "$WM_PYPI_SIMPLE" --only-binary=:all: \
  -r app/tests/requirements.txt -r admin/requirements.txt \
  -c docs/reproduction/environment-20261021/python-source.freeze.txt -d /사내/배포/wheels
npm --prefix app/web ci --registry "$WM_NPM_REGISTRY" --include=dev --include=optional --ignore-scripts \
  --cache /사내/배포/npm-cache --no-audit --no-fund
printf '%s\n' "$WM_NPM_REGISTRY" > /사내/배포/npm-registry.txt
```

Playwright를 쓰는 곳은 같은 버전의 브라우저 디렉터리도 묶는다. wheel이 없는 플랫폼은 준비 호스트에서 해당 버전의 wheel을 먼저 빌드한다. 묶음에 Git SHA, OS·CPU·버전, lock 파일과 배포 파일의 SHA-256을 기록하고 대상에서 대조한다.

**사내망 설치**에서는 다음 명령을 같은 셸에서 실행한다. cache 디렉터리는 npm이 쓸 수 있어야 한다. `--ignore-scripts`는 선택 패키지의 설치 스크립트가 공개 바이너리 서버를 조회하는 일을 막는다. 이어지는 명령으로 필요한 네이티브 모듈을 직접 로드한다.

```bash
export WM_BUNDLE='/사내/배포'
export PIP_NO_INDEX=1 PIP_FIND_LINKS="$WM_BUNDLE/wheels" PIP_DISABLE_PIP_VERSION_CHECK=1
export UV_OFFLINE=1 UV_NO_INDEX=1 UV_FIND_LINKS="$WM_BUNDLE/wheels" UV_PYTHON_DOWNLOADS=never
export npm_config_offline=true npm_config_cache="$WM_BUNDLE/npm-cache"
export npm_config_registry="$(cat "$WM_BUNDLE/npm-registry.txt")"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false
# 브라우저 디렉터리를 반입한 경우
# export PLAYWRIGHT_BROWSERS_PATH="$WM_BUNDLE/ms-playwright"

python3.12 -m venv app/.venv
app/.venv/bin/python -m pip install --no-index --find-links "$WM_BUNDLE/wheels" \
  -c docs/reproduction/environment-20261021/python-source.freeze.txt \
  -r app/tests/requirements.txt -r admin/requirements.txt
app/.venv/bin/python -m pip check
npm --prefix app/web ci --offline --include=dev --include=optional --ignore-scripts --no-audit --no-fund
(cd app/web && node -e "require('esbuild').transformSync('let x=1'); require('rollup'); require('sharp')")
```

`./start.sh`와 `make restart`도 Python 패키지를 확인한다. 서비스로 등록하거나 다른 셸에서 재빌드할 때 위 오프라인 환경변수를 그 프로세스에 전달한다. 설치된 빌드를 그대로 다시 띄우는 명령은 4절에 있다. `ENOTCACHED`나 일치하는 wheel이 없다는 오류가 나면 패키지명·버전·대상 플랫폼을 확인해 사내 묶음을 보완한다.

## 2. 사내 모델 등록은 배포당 한 번

| 저장 위치 | 넣을 내용 | 공유 범위 |
|---|---|---|
| 루트 `.env.example` | 공통 포트, `WINMATE_LLM_PROVIDER=internal`, `WINMATE_LLM_FALLBACK=none`, `WINMATE_DECISION=auto`, `WINMATE_DECISION_ORDER=inhouse`, 큐·캐시·검색 기본값, 모델별 변수 이름 | Git |
| 루트 `.env.inhouse` | 자료에서 확인한 실제 주소·모델 ID·포트 차이, 사내 어댑터가 읽는 비밀이 아닌 설정. 이 파일을 설치하면 앱이 아래 공통 기본값을 상속한다. | 어댑터와 함께 사내에서만 배포, Git 제외 |
| `app/api/llm/inhouse/` | `gauss.py`, `clef.py`, 필요한 상대 import 모듈. 어댑터가 별도 대상 목록을 읽는 경우 그 설정 파일도 등록본에 포함한다. | 사내 배포, README 외 Git 제외 |
| 루트 `.env` | Gauss 토큰·클라이언트 키, 필요한 CLEF·검색 인증값, 새 설치의 초기 관리자 비밀번호 등 호스트별 비밀값 | 호스트 전용, `0600` |

앱 모델 설정은 **관리자 Provider 저장값 → 프로세스 환경 → `.env` → `.env.inhouse` → `.env.example`** 순서로 적용된다. 포트는 프로세스 환경부터 같은 순서다. 새 checkout에서는 관리자 저장값이 비어 있다. 과거 `app/.env`·`poc/.env`나 다른 서버의 `admin.sqlite`를 통째로 복사하면 이 구성을 재현하기 어렵다. 데이터 경로를 바꿀 때 쓰는 `WINMATE_AUTH_DIR`, `WINMATE_ADMIN_DATA` 등 프로세스 전용 변수는 마이그레이션 문서의 경로표를 따른다.

1. **사내 자료에서 등록값을 추출한다.** Gauss의 실제 base URL·경로, 기본·빠른·비전 모델 ID, 인증 헤더·사용자 식별자, 요청/응답·SSE 형태와 검색 지원 여부를 확인한다. CLEF는 활성 대상별 URL·모델 ID·최대 토큰·동시 요청 수, TLS/터널과 인증 방식을 확인한다. 자료에 없는 주소·모델명은 공란으로 두고 해당 입력을 미확인으로 기록한다.
2. **어댑터를 설치한다.** `GaussLLM(InhouseLLM)`은 `build/parse`, 지원 기능에 따라 `parse_stream`, `build_search/parse_search`를 구현한다. `CAPABILITIES`에는 실제 지원 기능만 선언한다. `ClefDecision(InhouseDecision)`은 `targets()`에서 활성 `DecisionTarget`을 내고 `answer()`에서 `choice/score/noul` 답을 돌려준다. 예전 checkout이 `InternalAdapter`·`admin/clef_remote.py`를 수정했다면 그 규격만 두 클래스에 옮긴다. 키는 `self.ctx.get(...)`에서 읽고, 필요한 키 이름은 `REQUIRED_ENV`에 선언한다. [연동 계약](app/api/llm/inhouse_contract.py) · [클래스 작성 예와 점검 기준](app/api/llm/inhouse/README.md)
3. **비밀이 아닌 값으로 `.env.inhouse`를 만든다.** 아래는 입력 양식이다. 꺾쇠 항목을 실측값으로 교체한 등록본을 사내 배포 위치에 보관한다. `CLEF_BASE_URL`·`CLEF_MODEL`은 새 `ClefDecision`이 읽도록 정한 이름이다. 기존 클래스가 `admin/runtime/clef_remote.json` 등 다른 구성을 읽으면 그 클래스의 실제 스키마와 위치를 사용한다. `CLEF_PORT=8790`은 별도 로컬 서버용 기본 포트다.

   ```dotenv
   INTERNAL_LLM_BASE_URL=<Gauss 연결 자료의 실제 base URL>
   INTERNAL_LLM_MODEL=<실제 기본 배포 모델 ID>
   CLEF_BASE_URL=<사내 CLEF 서버 또는 터널 주소>
   CLEF_MODEL=<실제 CLEF 배포 모델 ID>
   ```

   빠른·비전 ID가 다르면 `INTERNAL_LLM_QUICK_MODEL`·`INTERNAL_LLM_VISION_MODEL`을 추가한다. 같은 ID를 쓰면 기본 모델을 상속한다. 사내 서비스 식별자로 공유 가능한 경우에만 `INTERNAL_LLM_USER_EMAIL`을 넣고, 개인 식별자는 해당 호스트의 비공개 설정에 둔다. 사내 HTTP 도메인 추가가 필요한 Gauss 어댑터는 `INHOUSE_HTTP_HOSTS`를 사용할 수 있다. TLS와 터널의 CA·키 경로는 사내 자료를 따른다.

4. **개별 비밀값을 입력한다.** 빈 checkout에서 아래 명령으로 호스트 전용 파일을 연다. 이미 등록된 파일은 유지된다. `.env.example` 전체를 복사할 필요가 없다.

   ```bash
   (umask 077 && touch .env)
   chmod 600 .env
   vi .env
   ```

   `INTERNAL_LLM_API_KEY`, `INTERNAL_LLM_CLIENT_KEY` 중 클래스에서 요구하는 값, 인증형 CLEF의 `CLEF_API_KEY`, 사내 검색에 필요한 `INTERNAL_SEARCH_API_KEY`·`INTERNAL_SEARCH_CLIENT_KEY`만 채운다. 새 로그인 저장소에는 `WINMATE_ADMIN_PASSWORD`(8자 이상)를 설정한다. 비워 두면 `manage_auth.py --ensure`가 첫 비밀번호를 터미널이나 기동 로그에 한 번 출력한다. 기존 로그인은 원래 자격증명을 복원한다. SSH 개인키는 기존 보안 파일을 사용하고 어댑터에 경로만 전달한다.

   ```bash
   git check-ignore .env .env.inhouse app/api/llm/inhouse/gauss.py app/api/llm/inhouse/clef.py
   ```

**두 번째 서버부터**는 사내에서 검증한 등록본을 새 checkout에 배치하고 4번의 호스트 비밀값만 입력한다. 다음은 등록본이 `$WM_BUNDLE/model-profile`에 있고 기본 두 모듈을 쓰는 예다. 상대 import 모듈이나 CLEF 대상 목록을 쓰는 배포는 같은 묶음의 manifest에 적힌 경로로 함께 복사한다.

```bash
(
  set -eu
  profile="$WM_BUNDLE/model-profile"
  for f in .env.inhouse app/api/llm/inhouse/{gauss,clef}.py; do
    test -s "$profile/$f" && test ! -e "$f" || { echo "등록본과 기존 파일을 확인하세요: $f" >&2; exit 1; }
  done
  for f in .env.inhouse app/api/llm/inhouse/{gauss,clef}.py; do
    install -m 640 "$profile/$f" "$f"
  done
)
```

## 3. 기동 전에 두 모델을 확인한다

```bash
test -f .env.inhouse && test -f .env
app/.venv/bin/python -B - <<'PY'
from app.api.poc.settings import load_settings
s = load_settings()
assert s.provider == 'internal' and not s.llm_fallbacks, 'Gauss 선택·fallback 확인'
assert s.inhouse_llm == 'ready' and s.model, 'Gauss 파일·계약·필수 설정 확인'
assert s.decision_mode == 'auto' and s.decision_order == ('inhouse',), 'Decision 순서 확인'
assert s.inhouse_decision == 'ready' and s.has_decision_key, 'CLEF 활성 대상·설정 확인'
print('Gauss', s.model, '/ CLEF', s.decision_model)
PY
app/.venv/bin/python -B -m app.api.llm.inhouse_bridge check
app/.venv/bin/python -B -m app.api.llm.inhouse_bridge check --live
```

`check`는 연결 클래스가 없으면 `SKIP`만 표시하고 종료 코드 0을 줄 수 있다. 위의 `ready` 검사와 각 활성 대상의 실제 응답까지 확인한다. Gauss는 텍스트·JSON과 서비스에 필요한 이미지·스트림·사내 검색, CLEF는 `answer(대상 ID)`의 세 질문을 확인한다. 미지원 기능은 그대로 기록한다. 문제가 생기면 `REQUIRED_ENV`의 **키 이름**, 터널·CA, 올바른 모델 ID, 권한, 대상의 활성 여부 순으로 본다. 시험용 `app/tests/fixtures/inhouse/`는 실제 사내 연결 자료로 사용할 수 없다.

## 4. 앱과 관리자 콘솔 기동

신규 설치에서 아래 첫 명령은 로컬 제품 snapshot, 공간 라이브러리, Agent KB, 그림 표, 사용자 웹, 관리자 웹, 초기 로그인을 준비하고 포그라운드로 실행한다. 운영 데이터를 가져올 경우 먼저 다음 문서의 백업·복원 절차를 완료한다. [데이터 이전 안내](DATA_MIGRATION_261118.md)

```bash
./start.sh
```

다른 터미널에서 준비 상태를 확인한다. 기본 주소는 사용자 `http://127.0.0.1:8788/`, 관리자 `http://127.0.0.1:8788/admin/`다. 같은 사내망의 다른 PC에서 접속할 배포는 사내 리버스 프록시를 쓰거나 `.env.inhouse`에 서버의 사내 바인딩 주소와 포트를 지정한다.

```bash
. app/scripts/ports.sh
winmate_env WINMATE_API_PORT WINMATE_BIND_HOST
# 특정 LAN IP에만 바인딩한 경우 그 IP를 사용한다.
wm_local_host="$WINMATE_BIND_HOST"
if [ "$wm_local_host" = '0.0.0.0' ]; then wm_local_host=127.0.0.1; fi
curl -fsS "http://$wm_local_host:$WINMATE_API_PORT/api/health" |
  app/.venv/bin/python -c "import json,sys; h=json.load(sys.stdin); print(h['products'], h['llm']); assert h['ok'] and h['products'] and h['llm']['verified']"
app/.venv/bin/python -B app/scripts/preflight.py --deep --require-auth
```

이미 빌드·복원이 끝난 호스트의 재기동은 아래 명령만으로 가능하다. 등록 파일이나 웹 코드를 바꾸면 `./start.sh`로 다시 빌드한다. 기본 바인딩에서는 `make restart`/`make stop`도 사용할 수 있다.

```bash
. app/scripts/ports.sh
winmate_env WINMATE_API_PORT WINMATE_BIND_HOST
app/.venv/bin/python -B -m uvicorn admin.server:app \
  --host "$WINMATE_BIND_HOST" --port "$WINMATE_API_PORT" --workers 1 --no-access-log
```

**인수 확인**

- 관리자 로그인 후 `/admin/`의 Provider 탭에서 대표 LLM은 `사내 LLM`, 대표 Decision은 `CLEF (사내)`인지 본다. 두 카드의 모델 ID를 3절과 대조하고 각각 한 번 실험한다. 인증된 `/api/poc/capabilities`의 `settings.provider`, `fallbacks`, `inhouse`, `decision`도 같은 선택을 보여야 한다. `/api/health`가 200이어도 모델 인증은 실패할 수 있다.
- 시험 계정에서 입력 → Gauss를 쓰는 제안서 작성 → CLEF 대상 기능(예: 레이아웃 선택) → 저장 → 다른 브라우저에서 같은 계정으로 재열기 → PPTX 내보내기를 확인한다. 공간 조감도 미리보기는 `/api/spatial/previews/status`와 실제 렌더 결과로 확인한다. 관리자 사용자 활동에서 해당 계정의 기록과 모델 호출을 확인한다.
- 사내 프로필은 메모리 이미지 캐시·SQLite 호출 큐를 사용한다. 사용자 웹 빌드는 외부 링크 미리보기 API 등 다른 출처의 자동 요청을 브라우저 정책으로 차단하고, 관리자 서버는 공개 원천 예약 수집을 시작하지 않는다. 공개 Web 시장조사는 꺼져 있다. 기존 근거 DB를 사용하는 경우에만 `WINMATE_RESEARCH=on`·`WINMATE_RESEARCH_ENGINES=db`로 바꾼다.
- 서버와 브라우저의 허용 목적지는 Winmate와 등록한 사내 서비스로 한정한다. 외부 키·Provider, 공개 원천 수동 갱신, Cloudflare 터널, Gemini 전용 독립 PoC와 외부 추적 전송은 이 배포에서 사용하지 않는다. 연결 점검은 로컬 캐시와 사내 모델로 수행하고, 외부 원문 링크나 외부에만 남은 자료는 사내 사본이 있어야 열 수 있다.
