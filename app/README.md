# Winmate v2 로컬 앱

고정한 라이브 아티팩트의 UI·데이터·슬라이드 로직을 옮기는 작업이다. 원본 `src/`, `dist/`, `poc/`, `proddb/`는 수정하지 않는다. 라이브 재현 위에 PoC 백엔드와 로컬 로그인을 연결했다. 기본 모드는 dummy이며 기능별로 real을 켤 수 있다.

## 실행

프로젝트 루트에서:

```sh
./start.sh
```

`make up`도 같은 명령이다. Node 22와 Python 3.12 또는 uv가 필요하다. 첫 실행에는 패키지 설치를 위한 인터넷 연결이 필요하다. 앱 UI 폰트 130개와 기존 게시 이미지·PDF 라이브러리는 로컬에서 제공한다. 서버는 `127.0.0.1:8788`에만 바인딩한다. 포트는 `WINMATE_API_PORT`로 설정한다. 같은 브라우저라도 포트가 바뀌면 저장소가 달라진다.

필수 입력은 프로젝트의 `reference/live/`, `proddb/winmate_products.sqlite`, `poc/test/`, `app/data/`의 고정 JSON·레이아웃이다. 없으면 준비 단계에서 해당 파일 경로와 함께 종료한다. 기존 원본 DB는 읽기 전용으로 열어 `app/data/runtime/`에 별도 SQLite snapshot을 만들고, 고정 UI projection을 실제 SQLite 테이블로 저장한다. API는 그 테이블을 조회한다. 이 projection에는 큐레이션 문구·정렬·과거 이미지 pack 참조 등 원시 테이블에 없는 UI 계약이 명시적으로 포함되어 있다.

첫 실행은 로컬 계정 `admin`과 무작위 비밀번호를 만들고 터미널에 한 번 표시한다. 서버에는 PBKDF2-SHA256 salt/hash만 저장한다. 비밀번호를 직접 정하거나 바꾸려면 다음을 실행한다. 기존 세션은 만료된다.

```sh
app/.venv/bin/python -B app/scripts/manage_auth.py --set
```

세션은 HttpOnly/SameSite=Strict 쿠키로 12시간 유지한다. `/login.html`에서 로그인하고, 계정·서명 키는 Git에서 제외한 `app/data/runtime/auth/`에 0600으로 저장한다. 비대화식 초기화에는 `WINMATE_SETUP_PASSWORD` 환경 변수를 사용할 수 있다. 설정된 계정이 있으면 시작할 때 덮어쓰지 않는다. 로그인 해제는 `/account.html`에서 한다.

개발할 때는 API를 띄운 상태에서 `npm --prefix app/web run dev`를 실행한다. Vite는 `127.0.0.1:5173`이며 `/api`, `/img`, `/lib`를 로컬 API로 연결한다. 일반 실행은 Vite 개발 서버를 띄우지 않고 빌드본과 API를 같은 포트에서 제공한다.

## 구조

| 위치 | 책임 |
|---|---|
| `web/src/pages/` | 홈·제안서·라이브러리·시나리오·검토·시뮬레이션 |
| `web/src/components/` | 버블·탐색기·모달·태그·편집 패널 |
| `web/src/services/` | 카탈로그·검색·링크·사진 묶음·AI 업무 로직 |
| `web/src/repositories/` | 기존 localStorage/IndexedDB 계약 및 백업 |
| `web/src/platform/` | HTTP 기반 sample, 브라우저 다운로드·클립보드. `artifact-backup`만 별도 구 origin 내보내기용 |
| `web/src/api/` | 전송·초기화·JSON/SSE 응답 경계 |
| `web/src/domain/slides/` | 1280×720 렌더·overrides·근거·PPTX 내보내기·복원 |
| `web/src/domain/templates/` | 고정 레이아웃·시나리오 데이터 |
| `web/src/styles/tokens.css` | 테마·색·간격·글꼴·반경 등 공통 값 |
| `api/` | FastAPI·SQLite 제품 projection·로그인 |
| `api/poc/` | 원본 PoC import·provider·작업 관리자·RAG |
| `data/` | 고정 데이터, 원본을 건드리지 않는 runtime snapshot |

원본 슬라이드 HTML과 좌표·PPTX 변환 본문은 바꾸지 않았다. media 메타데이터는 0단계에서 확인한 정상 인덱스로 교정했다. 가로 카드 DB 교체 패치와 후기 이미지 라이브러리는 고정 라이브에 없어 포함하지 않았다. 자세한 차이는 `docs/migration/` 보고서에 기록한다.

## 기존 브라우저 데이터

`/migration.html`은 주 UI와 분리한 JSON 백업·가져오기 도구다. 10개 localStorage 키와 IndexedDB 3개의 문서·Blob 이미지를 포함하며 인증 정보는 제외한다. 로컬 앱과 Claude iframe은 origin이 달라 같은 키만 사용해서는 기존 데이터가 자동으로 보이지 않는다.

기존 Claude 프레임에서는 `/migration-export.js` 스크립트의 내용을 해당 프레임에서 실행한 다음 `WinmateBackup.download()`를 호출해 백업한다. 이 스크립트는 구 환경의 downloads 어댑터 또는 브라우저 다운로드로 JSON을 저장하며 외부 서버로 보내지 않는다. 로컬의 migration 페이지에서 JSON을 가져오고 앱을 새로 연다. 같은 ID는 갱신하며 다른 기존 항목은 삭제하지 않는다. 가져오기 전에 현재 로컬 데이터도 백업하는 것을 권한다.

## 검증 명령

서버를 실행한 후:

```sh
npm --prefix app/web run test:e2e
npm --prefix app/web run test:visual
npm --prefix app/web run test:legacy
```

Playwright에 고정된 Chromium build 1194를 사용하며 `CHROME`으로 다른 실행 파일을 지정할 수 있다. 테스트는 별도 브라우저 context와 `app/tests/output/`를 사용한다. 개인 브라우저 상태를 사용하지 않는다. 원본 기존 테스트는 별도 작업 디렉터리에 복사하고 OS 경로·서버·HTTP/mock 전송만 적응하며 assertions는 유지한다. 고정 기준본과 새 앱의 결과를 함께 기록한다.

스크린샷은 폭 1500/900/390, light/dark에서 같은 날짜·폰트·초기 저장소를 사용한다. UI 토큰화로 생긴 차이와 기준 자체의 media 문제를 구분한다. 주요 검증 보고서는 단계가 끝날 때 `docs/migration/01-*.md`에 남긴다.


## real / dummy 전환

`app/.env.example`을 참고해 `app/.env`를 만들고 서버를 다시 시작한다. 우선순위는 실행 환경 > `app/.env` > 기존 `poc/.env`다. 키는 서버만 읽으며 프런트 응답·번들·커밋에는 포함하지 않는다.

```sh
WINMATE_MODE=real ./start.sh
# 또는 검색만 실제 PoC로
WINMATE_SEARCH_MODE=real ./start.sh
```

전체 기본값 `WINMATE_MODE=dummy`. 개별 `WINMATE_RFP_MODE`, `WINMATE_LAYOUT_MODE`, `WINMATE_STORYBOARD_MODE`, `WINMATE_SEARCH_MODE`, `WINMATE_REVIEW_MODE`, `WINMATE_PART_MODE`, `WINMATE_FILL_MODE`, `WINMATE_SIMULATION_MODE`, `WINMATE_LLM_MODE`가 전체 값을 덮어쓴다. 값은 real/dummy다. Gemini 기본 모델은 `gemini-3.1-flash-lite`; `GEMINI_MODEL`/`GEMINI_QUICK_MODEL`/`GEMINI_BASE_URL`로 provider 설정을 바꿀 수 있다. `WINMATE_LLM_CACHE`와 `WINMATE_KB_CACHE`는 기본 off다.

키가 없거나 호출이 실패하면 기존 규칙으로 대체하고 화면에 표시한다. 일부 단계만 실패하면 실제 성공/대체 내역을 구분한다. 검색은 BM25+TF-IDF라 키가 필요 없다. 진행 중인 작업은 서버가 소유하며 탭/화면 이동 후 다시 볼 수 있다. 서버 재시작 시에는 메모리 작업이 사라지며 기존 편집 결과는 브라우저 저장소에 남는다.

검토의 ‘핵심 점검 점수’는 PoC가 선별한 기준을 평가한 값이다. 기존 54개 기준의 종합 점수와 동일한 척도라고 해석하면 안 된다. 업로드 문서의 좌표·이미지·넘침 측정이 불완전한 항목은 결과에 표시한다. My 템플릿은 로컬 IDB에 남으며 서버 RAG 후보에는 포함되지 않는다. 상세 한계는 `api/poc/NOTES.md`와 `../docs/migration/02-poc-integration.md` 참조.

## 운영 점검과 테스트

```sh
# 패키지 준비 후 테스트 의존성 설치
uv pip install --python app/.venv/bin/python -r app/tests/requirements.txt
make test
app/.venv/bin/python -B app/scripts/preflight.py --deep
app/.venv/bin/python -B app/scripts/smoke.py --prompt
app/.venv/bin/python -B app/scripts/check_secrets.py
```

헬스 체크는 `/api/health`다. 로그인 만료 시 저장소의 반영을 기다린 뒤 로그인 화면으로 돌아오며, 기존 작업은 서버에서 계속된다. 인증·credential 값은 반환하지 않는다. API와 정적 앱은 한 프로세스/같은 포트에서 제공한다. 서버는 기본 127.0.0.1에만 바인딩하며 포트는 `WINMATE_API_PORT`로 지정한다. 서버용 비밀 설정과 포트용 셸 환경을 구분한다. Docker는 필수 실행 경로에 넣지 않았다.

자동화 브라우저 테스트는 격리된 테스트 서버에서 `WINMATE_AUTH=off WINMATE_ENV_FILES=none ./start.sh`로 실행한다. 이 값은 테스트용이며 일반 실행 기본값에는 적용되지 않는다. 브라우저 설치는 `cd app/web && npx playwright install chromium`. PoC UI 테스트는 `WINMATE_TEST_URL=http://127.0.0.1:포트 node app/tests/poc-e2e.mjs`; `?poc=offline` 테스트 옵션은 실제 PoC 규칙을 실행하고 외부 모델을 호출하지 않는다. 실제 provider smoke는 비용이 발생하므로 `poc-live-smoke.py`를 명시적으로 실행할 때만 수행한다.

## 데이터 갱신

1. 원본 DB 자체를 갱신해야 할 때는 원본 `proddb/README.md`와 `build_db.py` 안내를 따른다. 이 이관 앱은 원본 DB를 수정하지 않는다.
2. `app/scripts/prepare_data.py`는 원본 SQLite의 읽기 전용 백업과 고정 UI projection을 `app/data/runtime`에 다시 준비한다. 원본 DB가 변해도 고정 UI 문구·순서를 자동 변경하지 않는다.
3. 라이브 데이터를 새 버전으로 갱신하려면 별도 reference snapshot·manifest와 UI 계약 차이를 먼저 검토한다. `app/data/*.json`, `layouts.b64`, 정적 파일 기준과 템플릿 모듈을 함께 갱신해야 한다.
4. `node app/scripts/export_agent_data.mjs`로 정본 PoC KB를 다시 만들고 `preflight.py --deep`, API·E2E·화면 비교를 실행한다. 시작 명령도 KB 준비를 수행한다. PoC의 `sync_source.py`는 원본을 쓰므로 실행하지 않는다.

브라우저 저장소/서버 credential/LLM cache는 데이터 정본과 별개다. 초기화·갱신 스크립트가 개인 브라우저 데이터를 지우지 않는다.

기존 테스트를 다시 돌릴 때는 제공된 원본 `build/`와 fixture도 필요하다. PPTX fidelity/roundtrip 수치 재생성은 LibreOffice와 Poppler가 설치된 환경에서 `node app/tests/fidelity-runner.mjs`를 실행한다. 기본 웹/API 기동에는 이 도구들이 필요하지 않다.
