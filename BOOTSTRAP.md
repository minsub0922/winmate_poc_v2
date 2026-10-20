# Winmate Bootstrap

Ubuntu에서 현재 Winmate 웹앱을 설치·실행하는 절차다. 소스·제품 DB·이미지·폰트·템플릿은 `main`에 포함되어 있다. `admin/` 관리 앱은 제외하고 사용자 앱의 기본 로그인은 유지한다.

## 작업 프롬프트

아래 프롬프트에서 **LLM API 호출 자료의 절대경로 한 곳만** 채워 작업 에이전트에 전달한다. 경로는 문서 또는 관련 코드·설정이 들어 있는 폴더를 가리킬 수 있다.

```text
이 저장소의 BOOTSTRAP.md를 읽고 현재 Winmate 웹앱을 Ubuntu에서 재현하라.

LLM API 호출 자료의 절대경로:


작업 요구사항:
1. 위 절대경로의 문서·예제 코드·설정을 읽고 실제 LLM 호출 방법을 확인한다.
2. 자료에 맞춰 app/api/llm/adapters.py의 InternalAdapter와 필요한 서버 설정을 구현한다.
   모델 ID, 인증 키 두 개의 용도와 전달 방식, 요청·응답·스트림 형식은 자료를 따른다.
   현재의 공통 호출 큐·재시도·취소·사용량 집계와 앱의 입출력 계약을 유지한다.
3. WINMATE_LLM_PROVIDER=internal이면 사내 LLM을, gemini이면 Gemini를 사용하게 한다.
   기본값은 internal이며, 선택한 연결이 실패해도 다른 제공자로 자동 전환하지 않는다.
   텍스트·JSON·이미지·SSE와 앱이 사용하는 검색 호출도 자료에 맞게 연결한다.
4. 아래 절차로 의존성·데이터·공간 라이브러리·Agent KB·웹을 준비하고 사용자 앱을 실행한다.
   admin/ 관리 앱은 연결하거나 실행하지 않는다.
5. 실제 LLM 호출과 제안서·검색·검토·시뮬레이션·공간·PPTX·저장 기능을 검증한다.
6. 적용한 파일, 실행 명령, 검증 결과와 남은 항목을 보고한다. 인증 키는 출력하지 않는다.

API 자료의 경로가 비어 있으면 호출 규격을 추정해서 구현하지 않는다.
자료에 의존하지 않는 설치·데이터·빌드 준비는 진행한다.
```

이 경로는 작업자가 API 자료를 읽기 위한 입력이다. 경로만 적으면 앱이 자동으로 API 문서를 해석하거나 연결 코드를 만드는 기능은 아니다.

## 1. 소스와 실행 환경

```bash
git clone --single-branch --branch main \
  https://github.com/minsub0922/winmate_poc_v2.git winmate
cd winmate
git rev-parse HEAD
```

| 항목 | 기준 |
|---|---|
| Node.js / npm | 22.22.3 / 10.9.8 |
| Python | 3.12.13 |
| 실행 도구 | Bash, make, uv 또는 Python venv/pip |
| 브라우저 검증 | 프로젝트에 고정된 Playwright Chromium |
| 기본 주소 | `http://127.0.0.1:8788` |

버전 기록은 `docs/reproduction/environment-20261021/`에 있다. Ubuntu에서 의존성을 새로 설치하고 Mac의 `.venv`·`node_modules`를 복사하지 않는다.

## 2. 의존성 설치

다음은 uv를 사용하는 첫 설치 명령이다. uv가 없다면 Python 3.12의 `venv`·`pip`로 같은 requirements와 버전 제약을 적용한다.

```bash
uv venv --python 3.12.13 app/.venv
uv pip install --python app/.venv/bin/python \
  -r app/tests/requirements.txt \
  -c docs/reproduction/environment-20261021/python-source.freeze.txt
uv pip check --python app/.venv/bin/python
npm --prefix app/web ci --include=dev --no-audit --no-fund
```

루트 `package.json`은 자료 제작 도구용이다. 웹앱 설치·빌드는 `app/web/package.json`과 그 lock 파일을 사용한다. `app/tests/requirements.txt`에는 서버 실행 의존성도 포함된다.

브라우저 자동 검증까지 실행할 경우 Chromium과 Ubuntu 실행 라이브러리를 설치한다.

```bash
node app/web/node_modules/playwright/cli.js install --with-deps chromium
```

## 3. LLM 선택과 API 연결

```bash
cp -n app/.env.example app/.env
```

`app/.env`의 선택 값은 다음 두 가지다.

```dotenv
WINMATE_LLM_PROVIDER=internal
```

- `internal`: 기본값. 위 절대경로의 자료를 읽고 사내 API 연결과 `INTERNAL_LLM_*` 설정을 완성한다.
- `gemini`: Gemini 사용. `GEMINI_API_KEY`와 필요한 `GEMINI_*` 모델 설정을 사용한다.

두 제공자의 설정은 같은 파일에 둘 수 있다. 선택된 제공자의 전용 설정이 공통 `WINMATE_LLM_*` 호환 설정보다 우선한다. 동일 변수의 입력 우선순위는 실행 환경 → `app/.env` → `poc/.env`다. 실제 키는 서버 설정에만 둔다.

Gemini로 실행할 때는 환경변수 한 개로 선택을 바꿀 수 있다.

```bash
WINMATE_LLM_PROVIDER=gemini ./start.sh
```

현재 `InternalAdapter`는 기존 Chat Completions 호환 전송을 기반으로 한다. 실제 API 자료를 확인한 뒤 요청·응답·인증·이미지·스트림·검색 처리를 해당 규격에 맞춘다. 앱 화면이나 업무별 코드에 모델 호출을 나누어 넣지 않는다. 설정을 바꾼 뒤 서버를 재시작한다.

## 4. 실행

API 연결과 설정을 적용한 뒤 프로젝트 루트에서 실행한다.

```bash
./start.sh
```

시작 스크립트는 패키지 확인 → 제품 DB 준비 → 공간 라이브러리 → 정본 KB → 웹 빌드 → 사전 검사 → 기본 로그인 준비 → API 실행 순서로 처리한다. 실제 LLM 연결 확인까지 성공해야 기동한다. 첫 실행의 사용자 앱 로그인 계정과 비밀번호는 터미널에 한 번 표시한다.

브라우저에서 `http://127.0.0.1:8788`을 연다. 사용자 앱의 기본 계정 이름은 `admin`이며 별도의 `admin/` 관리 앱과는 관계없다.

기본 실행은 `admin/`이 없는 이 저장소의 사용자 앱을 기준으로 한다. 설치와 빌드를 반복하지 않고 사용자 앱만 직접 실행하려면 다음을 사용한다.

```bash
app/.venv/bin/python -B -m uvicorn app.api.main:app \
  --host 127.0.0.1 --port 8788 --workers 1 --no-access-log
```

종료는 Ctrl+C, 재시작은 같은 명령이다. 포트 변경은 `WINMATE_API_PORT=8790 ./start.sh`처럼 지정한다. 웹과 API는 같은 주소에서 제공한다.

### 데이터와 웹을 수동으로 준비할 때

```bash
app/.venv/bin/python -B app/scripts/prepare_data.py
app/.venv/bin/python -B app/scripts/build_spatial_products.py
node app/scripts/build_spatial_library.mjs
node app/scripts/export_agent_data.mjs
npm --prefix app/web run build
app/.venv/bin/python -B app/scripts/manage_auth.py --ensure
app/.venv/bin/python -B app/scripts/preflight.py --deep --require-auth
```

공간 준비로 만들어지는 public 자산이 포함되도록 공간 라이브러리를 웹 빌드보다 먼저 생성한다. 원본 `proddb/winmate_products.sqlite`를 직접 수정하지 않고 앱 전용 snapshot을 만든다.

## 5. 검증

```bash
make test
app/.venv/bin/python -B app/scripts/preflight.py --deep --require-auth
curl -fsS http://127.0.0.1:8788/api/health
```

브라우저 자동 검증은 실행 중인 앱에 연결한다. 비밀번호는 Bash의 숨김 입력으로 전달한다.

```bash
export WINMATE_TEST_URL=http://127.0.0.1:8788
read -r -s -p '사용자 앱 테스트 비밀번호: ' WINMATE_TEST_PASSWORD
printf '\n'
export WINMATE_TEST_PASSWORD
make test-browser
unset WINMATE_TEST_PASSWORD
```

다음 동작을 실제 선택한 LLM으로 확인한다.

- 요구사항·첨부 분석, Storyboard 생성·수정, 레이아웃 검색·채움.
- 검토의 텍스트·비전 입력, 시뮬레이션 대화·검색, 가이드 답변과 SSE.
- 공간 템플릿·제품·가구·2D/3D·생성·수정·저장·재열기.
- 이미지·폰트 표시, 편집 가능한 PPTX 내보내기, My 템플릿 복원.
- 취소·오류·재시도 시 입력 보존과 실제 제공자·모델 선택.

현재 기준 제품 1,068개, 활성 레이아웃 615개, Best Scenario 82개다. `make test`는 계약 검증이며 실제 API 연결과 기능별 호출 검증도 완료해야 한다.

## 6. 필요한 파일과 저장 위치

| 경로 | 역할 |
|---|---|
| `app/api/`, `app/web/`, `app/scripts/`, `app/tests/` | 서버·화면·빌드·검증 |
| `app/data/` | 제품 상세·장표·배경·공간·가이드 입력 |
| `poc/test/` | 앱이 실제 import하는 공용 AI 모듈과 평가 기준 |
| `proddb/winmate_products.sqlite` | 제품 원본 DB |
| `reference/live/`, `img/lib/`, `app/web/public/` | 정적 이미지·문서 라이브러리·폰트·미리보기 |
| `app/data/runtime/` | 생성된 DB·KB·기본 로그인·서버 저장 데이터 |
| `app/web/dist/` | 생성된 웹 배포본 |

`app/data/static`은 `../../reference/live`를 가리키는 심볼릭 링크다. 저장한 공간의 버전 복원을 위해 `app/data/spatial/versions/`와 public 자산도 유지한다. 생성된 runtime·배포본, 개인 인증 정보와 키는 Git에 포함하지 않는다.

## 7. 기존 작업 내용 이전

새 설치에 Mac의 제안서·히스토리·찜·검토·시뮬레이션까지 옮기려면 원래 사용하던 브라우저의 `/migration.html`에서 JSON을 내보내고 새 앱의 같은 페이지에서 가져온다. 이미지와 첨부 문서도 포함된다.

서버에 저장한 공유본·My 템플릿·공간 기록과 기존 로그인을 유지하려면 앱을 종료한 상태에서 `app/data/runtime/`의 해당 DB·파일을 별도로 백업·복원한다. SQLite의 동반 WAL/SHM 파일과 실제 저장 경로도 함께 확인한다. 제품 snapshot·KB·호출 큐·응답 캐시는 새 환경에서 재생성한다.

## 8. 문제 해결

| 증상 | 확인할 항목 |
|---|---|
| LLM 설정이 없어 시작 실패 | 기본값 `internal`의 API 자료·설정을 적용했는지 확인. Gemini 사용 시 `WINMATE_LLM_PROVIDER=gemini` 명시 |
| 다른 모델로 호출됨 | 실행 환경의 provider와 해당 제공자의 전용 모델·키 설정 확인 |
| 이미지·장표·PDF가 없음 | 전체 clone, `app/data/static` 링크, `img/lib`, public 자산과 웹 빌드 확인 |
| 비전·SSE·검색 오류 | 제공한 API 자료와 `InternalAdapter`의 해당 호출 구현 대조 |
| 작업 내역이 없음 | 원래 브라우저의 백업과 서버 저장 데이터를 각각 이전했는지 확인 |
| 실행 파일·패키지 오류 | Node/Python 버전과 Ubuntu에서 설치한 의존성 확인 |
