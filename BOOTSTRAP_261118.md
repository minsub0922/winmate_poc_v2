# Winmate 사내망 재현

사내 Ubuntu 서버 한 대에서 사용자 앱과 `/admin/`을 같은 포트로 실행한다. Gauss는 생성·대화, CLEF는 후보 선택·점수 판단을 맡는다. 아래 명령은 저장소 루트에서 Bash로 실행한다.

## 사내 작업자에게 넘길 프롬프트

```text
BOOTSTRAP_261118.md에 따라 사용자 앱과 관리자 콘솔을 재현하라.
의존성 묶음 위치 = <사내 절대경로>
Gauss·CLEF 어댑터 또는 연동 자료 위치 = <사내 절대경로>

사내 자료에 있는 실제 모델 ID·주소·인증 방식으로 두 어댑터를 연결하라.
저장소 루트 .env.example을 기준으로 루트 .env 한 곳에 포트·모델 주소와 ID·인증값을 설정하라.
공개 API 호출 없이 모델 두 개의 실제 응답과 앱 내 선택을 각각 확인하라.
자료가 빠진 항목은 이름만 보고하고, 가능한 설치와 검증은 계속하라.
완료 보고에는 실행 주소, 모델 ID, 점검 결과와 미검증 사유를 적어라.
인증값은 출력이나 완료 보고에 남기지 마라.
```

## 1. 사내 의존성 설치

Bash, curl, Python 3.12와 venv/pip, Node.js·npm을 사용한다. 저장소의 재현 기록은 Python 3.12.13, Node.js 22.22.3, npm 10.9.8이다. `admin/.enabled`, `proddb/winmate_products.sqlite`, `app/data/static/img/`가 있어야 한다.

- Python wheelhouse는 대상 Ubuntu·CPU·Python ABI에 맞아야 한다. npm 캐시는 `app/web/package-lock.json`에 맞는 dev·optional 패키지와 대상 CPU용 esbuild, Rollup, sharp를 포함해야 한다. 사용자 앱과 관리자 웹은 `app/web/node_modules`를 공유한다.
- 공간 조감도 렌더링에는 Playwright Chromium과 OS 라이브러리 또는 사내 배포 Chrome/Chromium이 필요하다. 실행 파일을 직접 지정할 때는 `WINMATE_SPATIAL_RENDER_CHROME`을 사용한다.

`WM_BUNDLE`에 사내 묶음 경로를 넣는다. npm 캐시 경로는 쓰기 가능해야 하며, `npm-registry.txt`에는 캐시를 만들 때 사용한 registry 주소가 있어야 한다. 이후 기동과 재빌드에도 같은 오프라인 환경을 전달한다.

```bash
export WM_BUNDLE='/사내/배포'
export PIP_NO_INDEX=1 PIP_FIND_LINKS="$WM_BUNDLE/wheels" PIP_DISABLE_PIP_VERSION_CHECK=1
export UV_OFFLINE=1 UV_NO_INDEX=1 UV_FIND_LINKS="$WM_BUNDLE/wheels" UV_PYTHON_DOWNLOADS=never
export npm_config_offline=true npm_config_cache="$WM_BUNDLE/npm-cache"
export npm_config_registry="$(cat "$WM_BUNDLE/npm-registry.txt")"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false
# Chromium 디렉터리가 묶음에 있는 경우
# export PLAYWRIGHT_BROWSERS_PATH="$WM_BUNDLE/ms-playwright"

python3.12 -m venv app/.venv
app/.venv/bin/python -m pip install --no-index --find-links "$WM_BUNDLE/wheels" \
  -c docs/reproduction/environment-20261021/python-source.freeze.txt \
  -r app/tests/requirements.txt -r admin/requirements.txt
app/.venv/bin/python -m pip check
npm --prefix app/web ci --offline --include=dev --include=optional --ignore-scripts --no-audit --no-fund
(cd app/web && node -e "require('immer'); require('esbuild').transformSync('let x=1'); require('rollup'); require('sharp')")
```

`immer@10.1.1`은 제안서·검토·시뮬레이션 기록을 편집할 때 변경한 부분만 복사하는 웹 필수 패키지다. 웹 의존성은 저장소 루트에서 `npm --prefix app/web ci`로 설치한다. `./start.sh`는 기존 `app/web/node_modules`에 누락된 패키지가 있으면 웹 lock 파일로 다시 설치한다.

`ENOTCACHED`가 나오면 현재 커밋의 `app/web/package-lock.json`에 맞춰 사내 미러에서 배포용 npm 캐시를 채운다. 같은 캐시 경로·registry 설정으로 위 `npm ci --offline`을 다시 실행한다. Python wheel 누락은 오류에 나온 패키지와 버전을 wheelhouse에 보완한다.

## 2. Gauss·CLEF 어댑터와 루트 .env 설정

- 사내 배포본의 `gauss.py`, `clef.py`를 `app/api/llm/inhouse/`에 배치한다. 상대 import 모듈이나 CLEF 대상 목록이 있으면 배포본에 지정된 경로에 함께 배치한다. 모델 서버나 승인된 터널에 접근할 수 있어야 한다.
- 연동 자료로 구현하는 경우 `GaussLLM(InhouseLLM)`에 `build/parse`와 실제 지원하는 기능을 구현하고 `CAPABILITIES`에 선언한다. `ClefDecision(InhouseDecision)`에는 활성 `DecisionTarget`을 반환하는 `targets()`와 `choice`, `score`, `noul`을 처리하는 `answer()`를 구현한다. 두 어댑터 모두 필수 키 이름을 `REQUIRED_ENV`에 선언하고 `self.ctx.get(...)`으로 값을 읽는다. [연동 계약](app/api/llm/inhouse_contract.py) · [클래스 작성 예](app/api/llm/inhouse/README.md)

`.env.example`과 같은 디렉터리에 `.env`를 만든다. 기존 파일이 있으면 그 값을 보존하면서 양식의 사내 기본값과 모델 주소·ID·포트를 반영한다. 앞서 별도 파일에 등록한 값도 루트 `.env`로 옮긴다.

```bash
if [ ! -e .env ]; then
  (umask 077 && set -C && cat .env.example > .env)
fi
chmod 600 .env
vi .env
```

| 루트 `.env` 항목 | 설정값 |
|---|---|
| 사내 모드 | `WINMATE_INHOUSE=on`. 사용자 웹의 외부 요청을 제한하고 관리자 공개 원천 예약 수집을 끈다. 변경 후 `./start.sh`로 다시 빌드한다. |
| 모델 선택 | `WINMATE_LLM_PROVIDER=internal`, `WINMATE_LLM_FALLBACK=none`, `WINMATE_DECISION=auto`, `WINMATE_DECISION_ORDER=inhouse`. 공개 시장조사와 자동 Provider 점검은 양식의 `off`를 유지한다. |
| Gauss | `INTERNAL_LLM_BASE_URL`, `INTERNAL_LLM_MODEL`에 실제 주소와 ID. 빠른·비전 모델이 다르면 `INTERNAL_LLM_QUICK_MODEL`·`INTERNAL_LLM_VISION_MODEL`도 지정한다. |
| CLEF | 사내 어댑터가 `self.ctx.get(...)`으로 읽는 주소·모델 ID. 양식에는 `CLEF_BASE_URL`과 `CLEF_MODEL`이 있다. |
| 인증 | 어댑터에서 요구하는 `INTERNAL_LLM_API_KEY`·`INTERNAL_LLM_CLIENT_KEY`, `CLEF_API_KEY`, 검색 인증값을 채운다. 신규 계정 저장소에는 `WINMATE_ADMIN_PASSWORD`를 설정한다. |
| 포트와 바인딩 | 서버마다 다르면 `WINMATE_API_PORT`·`WINMATE_BIND_HOST` 등을 바꾼다. |

모델 설정의 우선순위는 관리자 Provider 저장값 → 프로세스 환경 → 루트 `.env`다. 포트는 프로세스 환경 → 루트 `.env` → `.env.example` 기본값 순서다. 여러 서버에는 실제 주소·모델 ID·포트까지 채운 **비밀값 없는 양식**과 어댑터를 사내에서 공유한다. 각 서버의 루트 `.env`에 호스트별 인증값을 채운다.

## 3. 모델 선택과 실제 응답 확인

```bash
test -f .env
app/.venv/bin/python -B - <<'PY'
from app.api.runtime_env import inhouse_mode
from app.api.poc.settings import load_settings

assert inhouse_mode(), '사내 모드 확인'
s = load_settings()
assert s.provider == 'internal' and not s.llm_fallbacks, 'Gauss 선택과 fallback 확인'
assert s.inhouse_llm == 'ready' and s.model, 'Gauss 어댑터와 필수 설정 확인'
assert s.decision_mode == 'auto' and s.decision_order == ('inhouse',), 'Decision 순서 확인'
assert s.inhouse_decision == 'ready' and s.has_decision_key, 'CLEF 활성 대상과 필수 설정 확인'
print('Gauss', s.model, '/ CLEF', s.decision_model)
PY
app/.venv/bin/python -B -m app.api.llm.inhouse_bridge check
app/.venv/bin/python -B -m app.api.llm.inhouse_bridge check --live
```

`check`는 어댑터가 없어도 `SKIP`으로 끝날 수 있으므로 두 모델의 `ready` 상태와 실제 응답을 함께 확인한다. Gauss의 텍스트·JSON·스트림과 서비스에서 쓰는 이미지·사내 검색, CLEF의 모든 활성 대상에서 `answer(대상 ID)`가 통과하는지 확인한다. 호출에 실패하면 필수 키 이름, 터널과 CA, 모델 ID, 권한, 대상 활성 여부를 점검한다.

## 4. 앱 기동과 인수 확인

아래 명령은 제품 데이터와 공간 라이브러리, Agent KB, 중복 이미지 판별 데이터, 사용자·관리자 웹과 로그인을 준비하고 서버를 포그라운드에서 실행한다. 기존 계정·제안서를 옮기는 배포는 첫 기동 전에 복원한다. [데이터 이전 안내](DATA_MIGRATION_261118.md)

```bash
./start.sh
```

기본 주소는 사용자 앱 `http://127.0.0.1:8788/`, 관리자 콘솔 `http://127.0.0.1:8788/admin/`이다. 다른 Bash 터미널에서 실제 바인딩과 포트를 읽어 기동 상태를 확인한다.

```bash
. app/scripts/ports.sh
winmate_env WINMATE_API_PORT WINMATE_BIND_HOST
wm_local_host="$WINMATE_BIND_HOST"
if [ "$wm_local_host" = '0.0.0.0' ]; then wm_local_host=127.0.0.1; fi
curl -fsS "http://$wm_local_host:$WINMATE_API_PORT/api/health" |
  app/.venv/bin/python -c "import json,sys; h=json.load(sys.stdin); print(h['products'], h['llm']); assert h['ok'] and h['products'] and h['llm']['verified']"
app/.venv/bin/python -B app/scripts/preflight.py --deep --require-auth
```

- 관리자 Provider 탭에서 대표 LLM이 `사내 LLM`, 대표 Decision이 `CLEF (사내)`인지 확인한다. 두 카드의 모델 ID를 3절과 대조하고 각각 실험한다. 인증된 `/api/poc/capabilities`에서도 `settings.provider`, `fallbacks`, `inhouse`, `decision`을 확인한다.
- 시험 계정으로 Gauss 제안서 작성, CLEF 레이아웃 선택, 저장, 다른 브라우저에서 같은 계정으로 재열기, PPTX 내보내기를 확인한다. 조감도는 `/api/spatial/previews/status`와 실제 렌더 결과를 확인하고, 관리자 사용자 활동에서 해당 계정의 작업과 모델 호출을 확인한다.
- 브라우저와 서버의 연결 목적지가 Winmate와 등록된 사내 서비스인지 확인한다.
