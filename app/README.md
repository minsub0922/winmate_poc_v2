# Winmate v2 로컬 앱

고정 라이브 아티팩트의 UI·슬라이드 엔진을 옮긴 React/FastAPI 앱이다. **AI 기능은 공통 LLM 모듈을 통해 실제 모델을 사용한다. LLM API 프로필(OpenRouter · Gemini · 사내 LLM · OpenAI 호환)을 `.env`에 함께 적어 두고 `WINMATE_LLM_PROVIDER`로 고르며, 기본은 OpenRouter의 `qwen/qwen3.6-35b-a3b`다.** 더미 모드, 규칙으로 만든 AI 응답·점수, 자동 예시 히스토리 주입을 제거했다. 모델이 실패하면 오류와 재시도를 표시하고 사용자 입력은 유지한다.

## 설치·실행

프로젝트 루트에서 실행한다. Node 22, Python 3.12 또는 uv, 첫 설치용 인터넷 연결이 필요하다.

```sh
./start.sh
# 또는 make up
```

웹·API는 `http://127.0.0.1:8788`에서 같은 origin으로 제공한다. 첫 실행은 admin 계정과 무작위 비밀번호를 만들고 터미널에 한 번 표시한다. 서버에는 PBKDF2 해시만 저장한다. 비대화식 첫 실행에는 WINMATE_SETUP_PASSWORD를 제공할 수 있으며, 이미 있는 계정은 변경하지 않는다.

```sh
# 비밀번호 선택/변경 (터미널 숨김 입력, 기존 세션 만료)
app/.venv/bin/python -B app/scripts/manage_auth.py --set
# 포트 설정: 기본값은 루트 .env.example 「포트 · 바인딩」. 루트 .env에 넣거나(영구) 셸에서 한 번만 지정
WINMATE_API_PORT=8794 ./start.sh
```

로그인 후 사이드바 프로필을 누르면 오른쪽 팝업에 계정 정보와 로그아웃 버튼만 표시된다. 바깥 클릭·Esc·프로필 재클릭으로 닫는다. `/account.html`은 직접 접근용 기존 경로로 유지한다. 기본 바인딩은 127.0.0.1, 세션은 HttpOnly/SameSite=Strict 쿠키·12시간이다. API 키는 서버만 읽으며 프런트·Git에 포함하지 않는다. 앱 변경은 `app/`에서 수행한다. `poc/`, `proddb/`와 `reference/`는 공용 AI 모듈·수집 원본·참고 자료로 보존한다. 루트 `src/`에는 자료 추출·평가 도구가 사용하는 모듈과 출처 자료만 남아 있으며 구버전 루트 `dist/`는 제거했다.

필수 입력은 제공된 `poc/test/`, `proddb/winmate_products.sqlite`, `reference/live/`, `app/data/`다. 시작 명령이 패키지 설치, 웹 빌드, 읽기 전용 SQLite snapshot, 정본 Agent KB, 데이터 점검, 계정 준비를 수행한다. 없거나 손상된 입력은 경로와 함께 오류로 안내한다. health가 준비되기 전에 **선택한 실제 LLM의 연결 확인**도 수행한다. LLM 키·주소가 없거나 연결 확인이 실패해도 서버는 시작하며, 사전 검사는 경고로 알리고 `/api/health`의 `gemini`(연결 상태)에 `verified:false`와 이유를 표시한다. 이때 AI 기능만 오류로 안내되고 나머지 화면은 그대로 쓸 수 있다. 현재 이 컴퓨터는 루트 `.env`의 `WINMATE_LLM_PROVIDER=openrouter`로 OpenRouter(Qwen3.6-35B-A3B)를 쓴다.

## 사용 가이드

사이드바 프로필 바로 위의 원형 테두리 물음표 아이콘 **사용 가이드**에서 기능별 항목을 선택한다. 홈·제안서 제작/Storyboard·PPT 레이아웃·샘플 버티컬 시나리오·공간 조감도·검토·시뮬레이션·히스토리/공유·My 템플릿·찜의 10개 가이드, 총 86단계를 제공한다. Storyboard 23단계는 `bs01` 전국 매장 디지털 메뉴보드 전환 예제의 실제 요구·연결 자료·장표를 사용한다. 각 단계에는 조작 순서와 필요한 AI 설명·확인 사항이 있다.

목록 팝업과 중앙 가이드는 한 번에 하나만 열린다. 중앙 가이드의 실제 화면 구성 예시는 `inert`와 포인터 차단으로 읽기 전용이며, 페이지 이동은 이전/다음·단계 목록·좌우 키로 할 수 있다. 장표 가이드 열람은 제안서 생성·개인 자료 저장·AI 실행을 하지 않는다. 설명은 `web/src/domain/guides/catalog.js`, 화면 예시는 `web/src/components/guides/GuidePreview.jsx`에서 관리한다.

검증: 앱 실행 후 `node app/tests/guides.mjs`. 전체 86단계·키보드·모바일·팝업 중복 방지·미리보기 조작 차단과 무변경 계약을 검사한다.

### 가이드 에이전트

가이드 팝업 안의 우측 하단 챗봇을 열면 먼저 인사하고 현재 가이드의 추천 질문 5개를 그 아래 고정 영역에 보여 준다. 답변 중에도 질문 위치를 유지하며 대화만 별도로 스크롤한다. 전체 가이드 10개·86단계와 앱 사용 규칙을 매 요청의 맥락으로 사용하는 선택한 실제 LLM을 사용하는 에이전트다. 모델이 생성한 답변을 SSE로 바로 표시하고 핵심만 1~3문장으로 짧게 답한다. 답변 완료 후 관련 가이드·단계로 자동 이동하며, 챗봇을 열어 둔 상태에서도 가이드의 이전/다음·단계 선택을 조작할 수 있다. 가이드 팝업을 닫으면 챗봇도 함께 닫히고 대화가 삭제된다. 질문 전송은 기존 AI 작업과 같이 로그인이 필요하다.

대화와 미전송 입력은 팝업 메모리에만 둔다. 챗봇을 닫으면 즉시 버리고 진행 중인 요청을 취소하며, 늦은 응답이 재열린 챗봇이나 가이드 이동에 반영되지 않는다. 서버 대화 저장·응답 캐시를 사용하지 않고, 챗봇 내용은 브라우저 활동 기록과 AI 오류 본문 기록에서 제외한다. 운영상의 요청·토큰 사용량 통계에는 대화 본문을 넣지 않는다.

`node app/scripts/export_guide_context.mjs`가 가이드 원본과 추천 질문에서 서버 정본 `app/data/guide_context.json`을 생성한다. 웹 빌드가 자동 실행한다. `POST /api/guide/chat`은 서버 정본 전체·현재 단계·이번 팝업의 대화만 모델에 전달하고, 응답의 이동 대상이 실제 가이드 단계인지 검사한다. 오류 시 대신 만든 답변을 제공하지 않는다. 모델이 직접 실행할 수 있는 동작은 없으며 클라이언트는 검증된 가이드 단계로만 이동한다.

검증: `app/.venv/bin/python -B -m pytest app/tests/test_guide_agent.py -q`, `node app/tests/guide-agent-live.mjs`. 후자는 임시 인증 서버와 실제 Gemini를 사용해 자동 이동·대화 연속성·동시 조작·닫기/취소/초기화·모바일·기존 로그인 정책·기록 제외를 검사하며 실제 API 사용량이 발생한다.

## 조감도 (공간 · 건물 통합, 2026-11-15)

사이드바 **조감도**(2D · 3D · BETA) 하나에 공간 조감도와 건물 조감도가 모여 있다. 설계는 `docs/superpowers/specs/2026-11-15-birdseye-unified-studio-design.md`.

- **목록** `web/src/components/birdseye-home.jsx` — 「조감도 스튜디오 시작」 버튼 하나와 「조감도 히스토리」 한 구역(공간 · 건물을 최근 수정순으로 섞고 카드에 종류 표시, 한 쪽 8개 · `web/src/domain/birdseye/history.js`). 공간 조감도는 서버에서 그 쪽에 필요한 8개 묶음만 읽는다(건물이 있으면 건물 수만큼만 앞쪽을 더 읽음). 첫 읽기가 끝나기 전에는 카드를 그리지 않고, 스튜디오에 다녀와도 보던 쪽으로 돌아오며, 「다시 불러오기」는 실패한 그 쪽을 다시 청한다. 머리말의 「제품 · 가구 오브젝트」는 보기 전용 카탈로그다. 예전의 「업종별 템플릿 활용하기」 버튼과 Layout 히스토리는 없다(업종 템플릿은 시작 팝업의 드롭다운에서 고른다). 공간 조감도 카드는 3D 미리보기가 기본이다.
- **시작 팝업** `web/src/components/birdseye-start.jsx` · `web/src/services/birdseye-start.js` · `web/src/domain/birdseye/start.js` — 질문 단계 없이 창 하나. 탭(공간 기본 · 건물) + 필수 입력(업종 → 공간 한 개 이상, 최대 12개). 공간 입력창에 들어가면 바로 위에 자동완성 목록이 뜨고(추천 순서) 치는 대로 좁혀진다 — 한글은 누르는 자모 순서로 비교해 조합 중인 글자('회의'를 치는 도중의 '횡')와 초성('ㅎㅇㅅ')으로도 찾는다. 목록에서 고르거나 입력 후 Enter(조합 중의 Enter도 한 번), 「추천 공간」 창(그 업종의 공간 템플릿 = 공간 하나짜리 표준 템플릿)에서 골라 버블로 넣는다. 「제안서 불러오기」는 제안서 히스토리에서 골라 그 업종 · 공간 구성을 채운다. 시작하면 고른 공간이 놓인 스튜디오가 열린다(건물은 공간 하나가 한 층). 제품 오브젝트는 제안서에서 시작했을 때만 넣는다 — 제안서에서 고른 제품을 그 공간 템플릿에 이미 있으면 그 공간(과 수량)에, 다음으로 공간 구성이 둔 공간, 제품군 · 용도가 맞는 공간 순으로. 그 밖에는 공간에 제품이 하나도 없다. 「업종 템플릿에서 시작」은 업종을 고르면 켜진다 — 버튼 위로 열리는 드롭다운에 그 업종의 조감도 템플릿(표준 크기 전체 맵, 업종마다 1~8개)을 큰 3D 그림과 함께 보여 주고, 고르면 「이 템플릿으로 시작하시겠습니까?」를 확인한 뒤 바로 스튜디오(3D)로 간다. 건물 탭의 「건물 템플릿에서 시작」은 건물 모듈의 고르기 창이다. 예전의 템플릿 갤러리(범위 · 크기 · 버티컬 필터, 기본 썸네일 기억)는 시작 팝업에서 빠졌다. 제안서의 조감도로 등록하는 것은 Storyboard의 공간 구성에서 한다.
- **공간 스튜디오** `web/src/pages/SpatialStudioPage.jsx` — 왼쪽 입력 카드 없이 시뮬레이터 + 명령 입력창. @로 공간 · 제품 · 오브젝트를 태그해 명령하면(`@거실 에 @사람 2명 복사해`, `@소파 오른쪽으로 옮겨`, `@세탁기 3개 추가해`) `POST /api/spatial/command`(`api/spatial_command.py`)가 조작 목록으로 바꾸고 `web/src/domain/spatial/command-apply.js`가 장면에 적용한다. 조작: add · copy · move(방향 · 다른 공간 · 좌표) · rotate · remove · style · room_add · room_remove · room_update. 방향은 화면 기준(가장 가까운 지도 축), 기본 거리 1m, 막히면 직전까지. 선택 말풍선의 회전 · 복제 버튼과 단축키(R · Ctrl/⌘+D · Delete · 화살표)로 직접 조작한다. Storyboard 위 팝업(`components/spatial-studio-popup.jsx`)에서도 같다.
- **명령 해석** — LLM(`stage='spatial:command'`). Decision 키가 있으면 「요청 하나 + 대상이 @로 태그된 명령」은 Decision 모델(작업 `spatial.command`, 약 0.2초)이 유형 질문으로 처리하고, 나머지 · 확신도가 낮은 것은 LLM이 처리한다. `WINMATE_DECISION_TASKS`로 끌 수 있다. Decision 모듈(`api/llm/decision.py`)이 없는 구성에서는 모든 명령을 LLM이 해석한다.
- **PPT 레이아웃** — 스튜디오의 「레이아웃 추출」은 없다. Storyboard의 조감도 장에서 「조감도 레이아웃 선택」 → 조감도 히스토리의 조감도를 고르면 편집 창(`components/spatial-layout-create.jsx`)이 열리고 저장하면 그 장에 적용된다.
- **건물** — 명령 입력창은 없다. 층 고르기 창의 「내 조감도」에서 내가 만든 공간 조감도를, 템플릿 공간은 크기와 상관없이 층으로 넣는다(층 크기는 넣은 공간을 따름). 접점은 `web/src/services/building-bridge.js`, 장면 → 층 기록 변환은 `web/src/domain/building/floor-bake.js`.

- **공간 성격**(2026-11-16 · 공간 구성 5) — 같은 용도의 공간도 이름 · 업종에 따라 가구 배치 · 소품 · 사람이 다르다(카페 주문대 · 호텔 프런트 · 병원 원무 · 민원실 · 대표실 · 임원실 · 실장실 등 성격 138종, 새 가구 · 소품 73종). 시작 팝업에 직접 입력한 이름에도 적용된다. 규칙은 `web/src/domain/spatial/space-characters.js`, 설명은 `docs/spatial-studio.md`의 「공간 성격」, 검사는 `node app/tests/spatial-space-characters.mjs`.

검증(격리 API `app/tests/fixtures/spatial/server.py`를 8961에 띄운 뒤): `npm --prefix app/web run test:spatial:command` · `test:spatial:ui` · `test:birdseye` · `test:building` · `test:spatial:storyboard`, `pytest app/tests/test_spatial_command.py`. 실제 모델 점검은 `node app/tests/spatial-command-live.mjs` · `spatial-command-live-ui.mjs`(파일 머리말 참고). 빌드된 묶음 점검: `WINMATE_AUTH=off` 격리 서버에 `WINMATE_WEB_DIST=<빌드 폴더>`를 주고 `BIRDSEYE_TEST_BASE=http://127.0.0.1:<포트>`로 `spatial-command-ui` · `spatial-manipulate-ui` · `spatial-command-live-ui`를 돌린다.

예전 화면을 거치던 UI 테스트는 새 진입 경로로 옮겼다: 목록(`spatial-history-loading-ui` · `spatial-pagination-ui` · `spatial-history-preview-ui` · `spatial-fidelity-ui`, 모두 `SPATIAL_TEST_API_PORT`), 템플릿 갤러리(`spatial-library-ui`), 오브젝트 서랍(`spatial-object-drawer-ui`, `SPATIAL_DRAWER_API_PORT`), 편집기 · 말풍선(`spatial-editor-ui` · `spatial-mention-bubbles-ui`), 건물(`building-standard-ui`는 서버 없이, `building-birdseye-ui` · `account-data-e2e`는 `WINMATE_TEST_URL` + `WINMATE_TEST_PASSWORD`). `building-birdseye-ui`는 예시 건물을 고치므로 깨끗한 계정(새 `WINMATE_AUTH_DIR`)에서 돌린다. 스튜디오 「레이아웃 추출」을 거치던 `spatial-layout-ui` · `spatial-layout-my-ui`는 지웠고, 편집 · 닫기 확인 · 이어 고치기는 `storyboard-birdseye-layout-ui`가 본다(카메라 슬라이더 · SVG 내려받기 · PPTX 내보내기 UI 검사는 지금 없음). `spatial-ui` · `spatial-furniture-ui` · `spatial-naturalness-ui`는 이 변경 전부터 지난 화면(「공간맵 라이브러리」 · 「가구 배치」 · 브라우저 초안 키)을 기대해 통과하지 않는다.

## 건물 조감도

사이드바 「조감도」의 건물 스튜디오(3D · BETA)는 라이브 아티팩트 Version 136의 탭을 그대로 옮긴 화면이다. 시작은 건물 템플릿 54개 중 하나를 고르는 것뿐이다(층 수는 고르는 기준이 아님). 템플릿의 모양(층마다 바닥 크기 · 외벽) 그대로 층마다 공간이 빈 채로 스튜디오가 열리고, 층을 누르면 공간 조감도(템플릿 공간 · 내 조감도)를 크기와 상관없이 골라 채우거나 비운다 — 층 크기는 넣은 공간을 따른다. 층 추가는 맨 위층의 외벽을 잇고(다른 업종 공간이어도), 빈 층은 맨 위층 크기로 쌓는다. 층마다 외벽 간판은 넣은 공간을 따르고(빈 층은 간판 없음), 간판이나 층 카드의 이름을 누르면 층 이름(간판 글자)을 바꾼다. 지붕의 건물 이름 간판을 누르면 건물 이름 입력칸으로 간다. 외관 보기에서 외벽을 누르면 외벽 고르기 팝업, 층 이름 · 층 띠를 누르면 층 내부와 층 카드(공간 · 공간 목록)가 열린다. 로그인하면 건물은 계정 서버(컬렉션 `buildings`)에 저장되고 브라우저 IndexedDB `winmate-building`은 그 캐시다(`web/src/services/building-sync.js`, 모듈 쪽은 선택적 훅만). 비로그인이나 HTML 추출 파일에서는 예전처럼 브라우저에만 저장한다. 이미지 저장(PNG)과 HTML 추출(단독 3D 보기 파일)을 제공한다.

모듈 소스는 `web/src/building/`(구조 · 아티팩트와 같게 묶는 방식은 그 폴더의 README), 화면 연결은 `web/src/pages/BuildingPage.jsx`와 `vite.config.js`의 `winmate-building` 플러그인이다. 검증: `node app/tests/building-floor-bake.mjs` · `node app/tests/building-compose-ui.mjs` · `node app/tests/building-standard-ui.mjs`(서버 없이), 깨끗한 계정의 앱에서 `node app/tests/building-birdseye-ui.mjs`.

## 비로그인 둘러보기와 로그인

비로그인 방문자도 홈, PPT 레이아웃, 샘플 버티컬 시나리오, 공간 템플릿, 검토·시뮬레이션 화면을 둘러볼 수 있다. 홈에서는 프로필 오른쪽에 로그인 폼을 고정 표시한다. 제안서 시작·시나리오 활용·찜·검토 업로드·시뮬레이션 시작·AI 검색·공간 생성 등 작업을 실행하면 같은 폼 하나를 중앙 모달로 전환한다. 닫으면 홈에서 고정 폼으로 돌아오며 입력은 유지한다. 로그인 성공 후 현재 화면을 다시 불러온다.

서버는 공개 자료 GET/HEAD만 허용하며 개인 히스토리·작업 조회와 POST/PUT/PATCH/DELETE는 인증을 요구한다. 공유 링크도 비로그인 열람은 가능하지만 편집·권한 변경에는 로그인이 필요하다. 기존 계정·세션·CSRF·로그인 시도 제한은 유지한다.

검증: `node app/tests/auth-gate.mjs`, `node app/tests/guest-login-ui.mjs`, `app/.venv/bin/python -B -m pytest app/tests/test_auth.py -q`.

## Cloudflare 외부 접속

`./start.sh`로 앱을 실행한 상태에서 별도 터미널에서 `make tunnel`을 실행하면 Cloudflare Quick Tunnel의 HTTPS 주소가 출력된다. `cloudflared`가 설치되어 있어야 하며, `WINMATE_API_PORT`는 앱과 동일하게 설정한다. 스크립트는 로그인 계정이 설정되어 있고 인증이 켜진 앱만 연결한다. 비밀번호와 Gemini 키는 터널 설정이나 URL에 넣지 않는다.

이 방식은 이 컴퓨터에서 실행하는 앱을 외부로 연결한다. 관리 계정은 단일 계정이며, Storyboard 공유 링크로 접속하는 참여자는 별도 로그인 없이 열람할 수 있고, 편집 작업에는 로그인이 필요하다. 컴퓨터·앱·터널이 계속 실행되어야 하며, 터널을 새로 실행하면 주소가 달라진다. Cloudflare 계정·고정 도메인·항상 켜진 서버에 대한 상시 배포는 아직 구성하지 않았다. 브라우저 저장소는 주소별로 분리되므로 localhost의 기존 제안서는 `/migration.html`에서 백업하고 외부 주소의 같은 페이지에서 복원한다.

배포 주소 검증: `app/.venv/bin/python -B app/scripts/smoke.py --base https://출력된주소.trycloudflare.com --prompt`. 로그인·쿠키·카탈로그·실제 Gemini 호출과 로그아웃을 검사한다. 자세한 배포 결과는 `docs/migration/05-cloudflare.md`에 기록한다.

## LLM 모듈과 전역 호출 큐

`app/api/llm/`이 모델 호출·재시도·스트리밍·캐시·전역 큐를 관리한다. `poc/provider.py`는 기존 import와 singleton/test hook을 보존한다. 기존 `generate_json`, `generate_text`, `stream_text`, `structured`, `search_web`, `model_for` 호출 인자와 `GenerationResult`·`ProviderError` 형식은 유지한다. 스트림은 기존처럼 누적 문자열을 반환한다. `contracts.ModelProvider`가 애플리케이션 계약이며, `adapters.ModelAdapter`와 `ModelRequest`가 모델별 전송 경계다. 기본 `internal`은 `InternalAdapter`를 사용하고, `gemini`는 Gemini를 사용한다. `InternalAdapter`는 기존 Chat Completions 호환 전송을 기반으로 하며, `BOOTSTRAP.md`에 입력한 API 자료를 읽고 실제 규격에 맞춘다. 기존 `openai` 어댑터와 시작 전 `register_adapter(name, factory)` 등록도 유지한다. 어댑터는 HTTP 요청 생성·응답 변환만 담당하며 실제 전송은 공통 큐가 처리한다.

모든 기능·기본/quick/vision 모델·시작 시 연결 확인·재시도를 합쳐 **임의의 연속 60초에 실제 전송 시도 최대 42회**다. 43번째 요청은 FIFO로 대기한다. 429/5xx/잘못된 JSON/스키마 보정 재시도도 각각 한도를 차감하며, 전송 후 실패한 호출의 한도는 돌려주지 않는다. 응답 캐시 적중은 전송하지 않으므로 한도를 사용하지 않는다. `chat_model()`도 큐를 통과하는 LangChain facade를 반환한다.

기본 SQLite 큐는 별도 서비스 없이 같은 호스트의 여러 API 프로세스·Provider 인스턴스에서 `app/data/runtime/llm-queue.sqlite`를 공유한다. 프로세스를 다시 시작하거나 모델을 바꿔도 이전 60초의 호출 기록이 유지된다. 이 DB는 영속 로컬 디스크에 두며 네트워크 파일시스템에서 공유하지 않는다. 여러 호스트/컨테이너가 독립 디스크를 사용한다면 **반드시 Redis 큐로 설정하고 같은 Redis DB와 namespace를 공유**한다. 키·모델별로 큐를 분리하면 전체 한도가 분리되므로 동일 한도의 호출은 같은 큐를 사용한다. 이 모듈 밖에서 API를 직접 호출하는 별도 프로그램은 이 한도에 포함되지 않는다.

큐에는 불투명한 요청 ID·순서·시각·lease만 저장하고 프롬프트·고객 문서·인증 키는 저장하지 않는다. 취소/대기 만료는 대기 메시지를 제거하고, 응답·스트림 종료는 실행 lease를 반환한다. 중단된 프로세스의 메시지와 lease는 만료로 회수한다. 큐 연결 장애 시 한도를 우회하지 않고 기존 오류 형식으로 실패한다. 큐가 요청 실행을 허가하며, 실제 실행과 응답은 원래 요청 프로세스가 담당한다. 프로세스 종료 시 미완료 생성 작업을 자동 재전송하지 않는다.

설정은 실행 환경 > 루트 `.env`(저장소에 하나뿐인 설정 파일, 견본은 루트 `.env.example`) 순으로 각 키를 읽는다. 모델·키·API 주소는 선택한 제공자의 `OPENROUTER_*` · `INTERNAL_LLM_*` · `GEMINI_*` 전용 설정이 공통 `WINMATE_LLM_*` 호환 설정보다 우선한다(`OPENROUTER_*`는 공통 설정으로 넘어가지 않아, 다른 게이트웨이용 키가 OpenRouter로 나가지 않는다). 프로필 여러 개를 함께 적어 두면 제공자를 바꿀 때 해당 프로필만 고르면 되고, 코드에서는 `provider_settings(name)` · `get_provider_for(name)`로 기본 외의 프로필을 함께 쓸 수 있다(예: 평가 스크립트의 Qwen · gemma 동시 비교). `/api/poc/capabilities`의 `settings.providers`에 프로필별 모델과 키 설정 여부(값은 아님)가 보인다. 실제 키 값은 커밋하지 않는다. 변경 후 API 서버를 재시작한다.

| 변수 | 기본값·의미 |
|---|---|
| WINMATE_LLM_PROVIDER | openrouter(기본) · gemini · internal · openai(공통 WINMATE_LLM_* 키) · 등록한 어댑터 |
| OPENROUTER_API_KEY / OPENROUTER_MODEL / OPENROUTER_BASE_URL | OpenRouter 서버 전용 키 · qwen/qwen3.6-35b-a3b(텍스트 · 이미지 입력) · https://openrouter.ai/api/v1 |
| OPENROUTER_QUICK_MODEL / OPENROUTER_VISION_MODEL | 생략하면 OPENROUTER_MODEL |
| OPENROUTER_REASONING | off(기본) · on · low · medium · high. 켜면 생각 토큰이 작업별 출력 한도를 먼저 써서 실패가 늘어난다(`docs/decision-model/FINAL-REPORT.md`) |
| INTERNAL_LLM_API_KEY / INTERNAL_LLM_MODEL / INTERNAL_LLM_BASE_URL | 사내 LLM의 서버 전용 키·모델 ID·API 주소 |
| INTERNAL_LLM_QUICK_MODEL / INTERNAL_LLM_VISION_MODEL | 생략하면 INTERNAL_LLM_MODEL |
| WINMATE_LLM_API_KEY | 공통 호환 키. 각 제공자의 전용 키가 우선 |
| WINMATE_LLM_MODEL | Gemini는 기존 GEMINI_MODEL 또는 gemini-3.1-flash-lite |
| WINMATE_LLM_QUICK_MODEL | 기본 모델과 동일. Gemini는 GEMINI_QUICK_MODEL도 지원 |
| WINMATE_LLM_VISION_MODEL | Gemini는 GEMINI_VISION_MODEL 또는 gemini-3.8-flash, 사내 모델은 기본 모델과 동일 |
| WINMATE_LLM_BASE_URL | 공통 호환 API 주소. 사내는 INTERNAL_LLM_BASE_URL, Gemini는 GEMINI_BASE_URL이 우선 |
| WINMATE_LLM_TIMEOUT | 60초, 큐 대기를 제외한 응답·재시도 시간. 기존 WINMATE_GEMINI_TIMEOUT도 지원 |
| WINMATE_LLM_RPM | 42. 1~42로 강제 제한, 0으로 해제 불가. 기존 WINMATE_GEMINI_RPM도 지원 |
| WINMATE_LLM_CONCURRENCY | 4, 공유 큐의 동시 전송 상한. 기존 WINMATE_GEMINI_CONCURRENCY도 지원 |
| WINMATE_LLM_QUEUE_BACKEND | sqlite 또는 redis |
| WINMATE_LLM_QUEUE_DB | app/data/runtime/llm-queue.sqlite. 같은 서버의 모든 프로세스가 동일한 절대 경로 사용 |
| WINMATE_LLM_REDIS_URL | Redis 큐 선택 시 필수. 응답·로그에 포함하지 않음 |
| WINMATE_LLM_QUEUE_NAMESPACE | winmate-llm. 같은 한도의 모든 서버가 동일 값 사용 |
| WINMATE_LLM_QUEUE_TIMEOUT | 600초, 각 전송의 큐 대기 한도. 만료 시 기존 형식의 timeout 오류 |
| WINMATE_LLM_SCHEMA_MODE | json_object. 사내 API가 네이티브 JSON Schema를 지원하면 json_schema |
| WINMATE_LLM_CACHE | off. 켜면 실제 모델 응답만 서버 runtime에 저장 |
| WINMATE_KB_CACHE | off. 켜면 정본 레이아웃 색인 캐시 |
| TYPESAFE_API_KEY | Decision 모델 키. 있으면 판단형 작업 5개를 Decision 모델로(아래 Decision 모델 분기) |
| TYPESAFE_BASE_URL / TYPESAFE_MODEL | https://api.typesafe.ai/v1 / jev-1.14.0(버전 고정). 로컬 Clef 서버는 http://127.0.0.1:8790/v1 / clef-flash |
| WINMATE_DECISION / WINMATE_DECISION_TASKS / WINMATE_DECISION_TIMEOUT | auto(키 있으면 사용) · off / 비우면 전부 / 30초 |

사내 모델로 교체할 때 호출자는 수정하지 않고 설정만 바꾼다:

```dotenv
WINMATE_LLM_PROVIDER=openai
WINMATE_LLM_BASE_URL=https://internal.example/v1
WINMATE_LLM_API_KEY=서버에서만-설정
WINMATE_LLM_MODEL=internal-model
```

사내 모델은 텍스트·JSON·이미지·SSE를 같은 입출력 형식으로 연결한다. 이미지 입력에는 비전 지원 모델이 필요하다. 기본 json_object 모드는 스키마를 프롬프트에 포함하고, 앱의 기존 검증도 그대로 수행한다. 실제 Google 검색 grounding은 Gemini 어댑터의 기능이며, 사내 어댑터가 이를 구현하지 않으면 `unsupported_capability` 오류를 반환한다. LangChain facade의 일반/비동기/스트리밍/구조화 출력도 같은 큐를 사용하며, 도구 호출은 현재 명시적 미지원 오류를 반환한다. 모델 기능 부족이나 실패를 만들어 낸 결과로 대체하지 않는다.

Redis를 로컬에 실행하는 예:

```sh
make llm-redis   # app/compose.llm.yml, 포트 · 바인딩은 루트 .env.example의 LLM_REDIS_PORT · LLM_REDIS_BIND
# 루트 .env에서 아래 값을 설정한 뒤 API 재시작
# WINMATE_LLM_QUEUE_BACKEND=redis
# WINMATE_LLM_REDIS_URL=redis://127.0.0.1:6379/0   (포트는 LLM_REDIS_PORT와 같게)
```

Redis 운영에는 영속 볼륨·AOF·noeviction을 사용한다(제공 compose에 반영). 한도 기록을 삭제/flush하거나 별도 DB·namespace로 교체하면 전역 제한도 새로 시작하므로, 전환 시 기존 호출이 모두 60초 구간에서 벗어난 뒤 사용한다. `/api/poc/capabilities`의 `provider.usage.queue`에서 대기·실행·최근 60초 호출 수를 확인한다.

WINMATE_MODE/기능별 *_MODE는 항상 real이다. API의 offline:true, llm:false는 422로 거절한다. 제품/솔루션/사례 조회·문서 파싱·슬라이드 렌더·PPTX 변환·점수 집계·검색 후보 추출은 기존 알고리즘을 유지한다. AI 판단·작성·채점·대화·의미 재정렬만 공통 모델 모듈을 사용한다.

## Decision 모델 분기 (TypeSafe Jev)

판단형 작업(후보 고르기 · 순위 · 관련도 · 우선순위)은 루트 `.env`에 `TYPESAFE_API_KEY`가 있으면 LLM 대신 Decision 모델(TypeSafe System One, `TYPESAFE_MODEL=jev-1.14.0`)로 처리하고, 키가 없거나 `WINMATE_DECISION=off`이면 같은 작업을 LLM으로 처리한다. 작업마다 입력과 결과 형식은 두 경로가 같고, 결과는 같은 검증 함수를 통과해야 한다. Decision 모델은 질문(choice · score · noul)에 확률로 답하며 글을 쓰지 않으므로, 결과의 사유 문구는 관련도 · 확신도로 채운다.

| 작업 | 위치 | Decision 질문 |
|---|---|---|
| search.rerank | `app/api/poc/adapters/search.py` 레이아웃 검색 재정렬 | 후보마다 score(관련도 0~3) + 검색 점수 사전 |
| catalog.rank | `app/api/poc/adapters/catalog_rank.py` (`POST /api/catalog/rank`) 카탈로그 AI 검색 상위 N | 후보마다 score + 검색 순서 사전, 64k 넘으면 요청 분할 |
| review.route | `poc/test/proposal_score/router.py` 평가 기준 라우팅 L1 · L2 | 묶음 관련도 · 기준 우선순위 score(0~3) |
| layout.pick | `poc/test/layout_agent/winmate_layout/layout_design.py` 슬라이드별 레이아웃 선택 | 슬라이드마다 choice(후보 f) |
| layout.best_pick | `poc/test/layout_agent/winmate_layout/scenarios.py` Best Scenario 선택 | 후보마다 score(적합도 0~3) + 규칙 점수 사전 |

`WINMATE_DECISION_TASKS`로 일부 작업만 Decision 모델로 돌릴 수 있다. 호출은 LLM 호출과 같은 작업 기록 · 텔레메트리에 남고, 실패하면 LLM과 같은 오류 형식으로 실패한다(규칙 대체 없음). 최종 비교(Qwen3.6 · gemma-4 · Jev · Clef)는 `docs/decision-model/FINAL-REPORT.md`, 재현은 `app/.venv/bin/python -B app/tests/decision_eval.py --help`.

같은 System One API를 내는 로컬 Clef 서버(`clef-flash/`, clef-flash 4-bit MLX)도 쓸 수 있다. `TYPESAFE_BASE_URL=http://127.0.0.1:8790/v1`, `TYPESAFE_MODEL=clef-flash`, 키는 비어 있지 않은 아무 값(예: `local`), `WINMATE_DECISION_TIMEOUT=120`. 모델 이름이 `clef`로 시작하면 클라이언트가 Clef 한도(요청당 16,384 토큰 → 추정 15k로 분할, 순차 전송, `truncate:false`로 잘림 대신 413)를 쓴다. http는 루프백 주소에서만 허용한다. Jev · LLM과의 비교는 `docs/decision-model/FINAL-REPORT.md`.

## 시장조사 근거 (업종 트렌드 · 시장 장)

시장 · 트렌드 장의 값(시장 규모 · 추이 · 구성비 · 업계 지표)은 고객 자료에도 제품 DB에도 없는 바깥 사실이다. 모델이 아는 척 쓰게 두지 않고 `app/api/poc/market_research.py`가 실제 웹 검색으로 찾아 **원문과 대조해 통과한 것만** 싣는다.

1. 키워드 추출 — 고객사 · 업종 · 요구사항 · 연결 품목에서 세부 업종과 조사 주제 4~6개를 정하고, 주제마다 검색 키워드(대상어 + 지표어) · 검색 문구(기사 · 보도자료 제목에 실제로 나오는 2~3 낱말, 공식 조사 이름 포함) · 검색 문장을 뽑는다. 바깥으로 나가는 말에서는 고객사의 고유 이름 · 연락처 · 금액을 코드가 지운다. 업종 일반 통계를 찾는 받침 주제가 언제나 하나 더해진다.
2. 동적 검색 — 고객사는 예측할 수 없으므로 자료를 미리 만들어 두지 않고 매번 그 요구사항으로 찾는다. 별도 검색 API 키는 없다. 주제마다 세 가지 수단을 함께 쓴다(`WINMATE_RESEARCH_ENGINES`).
   - 출처 자체 검색(`market_sources.py`): 정책브리핑(전 부처 보도자료) · 매일경제 · 이데일리 · 헤럴드경제 · 한겨레 · 지디넷코리아의 사이트 검색을 서버가 직접 부른다. robots.txt 가 허용한 주소만(리다이렉트로 옮겨 간 주소도 확인) 받고, 같은 사이트에는 0.45초 간격으로 한 번에 하나씩만 요청한다. 구글 · 네이버 · 다음 · 빙의 결과 페이지는 수집이 금지돼 있어 쓰지 않는다. 봇 확인 화면이 나오면 그 출처는 건너뛴다(우회하지 않는다). 검색어를 바꿔도 같은 목록을 주는 출처(검색이 바뀐 화면)는 그 회차에서 쓰지 않고 출처 상태에 남긴다.
   - 모델 연결의 웹 검색(`provider.search_web`: 사내 LLM 어댑터의 검색 · Gemini의 Google 검색): 연결이 지원할 때만 더한다(OpenRouter · OpenAI 호환은 미지원 — 그때는 출처 자체 검색만으로 조사한다).
   - 근거 DB의 문서: 이전 조사에서 받아 둔 본문에서 키워드로 다시 찾는다.
3. 추리기 — 결과 목록(제목 · 요약 · 발행일 · 출처)에서 근거로 쓰지 않는 사이트(블로그 · 커뮤니티 · 위키 · SNS) · 5년 넘은 글 · 같은 글을 코드가 빼고 검색 문구가 제목에 든 글 · 수치 낌새가 있는 글 · 정부 출처 · 최근 글을 앞에 둔 뒤, 주제마다 12건까지 모델에게 보여 업계 전체의 통계 · 조사 · 정책 · 흐름이 실렸을 글만 고르게 한다(한 회사의 실적 · 신제품 · 행사 기사, 다른 업종 글은 뺀다). 고른 글(주제마다 4건까지)만 본문을 받는다.
4. 정제 — 페이지에서 본문 요소(`itemprop="articleBody"` 등)만 꺼내고, 없으면 글이 거의 링크뿐인 줄(메뉴 · 관련기사 · 순위 목록)을 걷어 낸다 — 속보 줄 · 기계 요약 상자 같은 다른 글이 이 문서의 사실로 인용되지 않는다. 그 본문에서 주제와 가까운 대목을 문장 단위로 뽑는다. 검색 모델이 쓴 답 · 요약은 근거로 쓰지 않는다.
5. 추출 → 검증(코드) — 모델이 뽑은 항목마다: 인용이 원문에 글자 그대로 있는가(조금 고쳐 쓴 인용은 원문의 실제 문장으로 바꿔 다시 검사) · 값이 더 긴 숫자의 일부나 잘린 숫자가 아닌가 · 단위가 값 바로 뒤에 붙어 있는가(`32.4조 원`을 `32.4원`으로, `3.2%p`를 `3.2%`로 읽지 않음) · 연도가 인용 안에 있는가 · 인용이 문장 중간이나 지시어(`이 비중은…`)로 시작해 무엇의 값인지 알 수 없지 않은가 · 지표 이름이 인용에 나온 낱말로만 지어졌는가(인용에 없는 범위 · 대상을 붙이지 않음) · 이름의 대상이 `점포` · `매장` · `업체`처럼 종류 없는 말뿐이지 않은가(`지방 점포 방문객 수`는 어떤 점포인지 앞 문장에만 있다 — `상권 점포` · `외식업체`처럼 종류가 함께 있어야 한다) · 추이는 한 문서 3개 연도 이상 · 구성비는 합이 100% 안팎 · 흐름 문장이 인용에 없는 원인 · 전망 · 평가를 더하지 않았는가(문장의 낱말이 인용에 뿌리를 두어야 한다). 하나라도 어긋나면 버린다. 이름 · 인용 범위 때문에 버려진 항목은 사유와 함께 모델에게 한 번 돌려보내 고쳐 받는다 — 규칙은 그대로이고(고쳐 온 것도 같은 검사를 다시 통과해야 한다) 값 · 단위를 바꿔 오면 받지 않는다.
6. 이름 · 범위 확인(모델, 두 번) — 남은 항목의 이름 · 문장이 인용의 대상 · 범위 · 시점과 맞는지 판정하고, 두 번 모두 맞다고 한 것만 남긴다. 같은 판정에서 **범위**도 본다: 여러 사업자에 걸친 값(통계 · 실태조사 · 정책)이라고 두 번 모두 답한 것만 업계 지표로 쓴다 — 한 회사 · 한 브랜드의 수치나 범위를 알 수 없는 것은 장에도, 다른 시장 장의 근거 풀에도 싣지 않는다.
7. 장 구성 — 검증된 근거의 **형태**가 장 종류를 정한다: 연도별 추이가 있으면 추이 막대, 구성비면 도넛, 지표 셋이면 핵심 지표, 흐름만 있으면 키워드. 그중 무엇을 쓸지는 요구사항과의 관련성으로 고르고(템플릿의 종류와 다르면 바꾼다), 값 칸은 코드가 검증된 표기 그대로 넣는다. 모델이 쓴 제목 · 요약은 근거에 있는 숫자만 쓸 수 있고 인용과 맞는지 한 번 더 판정해, 떨어지면 숫자 없는 중립 문구로 바꾼다. 계산값(%p 차이 · 연평균 성장률)은 계산식을 근거에 적는다. 지표 이름은 이름 확인을 통과한 그대로 싣는다(칸에 들어가는 이름만 고른다 — 모델이 줄여 쓴 이름은 낱말이 빠지며 뜻이 달라질 수 있어 쓰지 않는다). 값 · 단위 · 시점이 같은 지표(같은 통계를 여러 매체가 옮긴 것)는 한 장에 두 번 싣지 않는다. 시점: 5년보다 오래된 값은 싣지 않고, 인용에 연도가 없는 값(`작년` · `올해` · 연도 없는 문장)은 기사의 발행일로 본다 — 수치 · 구성비는 발행 1년, 흐름 문장은 2년이 지났으면 지금의 사실로 싣지 않는다(발행일도 모르는 연도 없는 수치 · 구성비는 싣지 않는다). 확인된 문구가 모자라 칸에 `[확인 필요]`가 남게 되는 장은 내보내지 않는다(칸에 그대로 들어가는 확인된 흐름으로 다시 짓고, 안 되면 채우지 않은 장으로 알린다).
8. 근거 — 칸마다 출처 제목 · 주소 · 인용 원문 · 확인한 날(`checked`)을 요소별 근거(`x.ev`)로, 고른 이유 · 검색어 · 조사 시각 · 쓴 검색 수단 · 다시 쓴 저장 근거 수를 `x.research`로 남긴다. 장 상세의 「시장조사 근거」와 요소의 「사용된 근거」, PPTX 발표자 노트에서 볼 수 있다.
9. 쌓기 · 다시 쓰기(`market_store.py` — SQLite `app/data/runtime/research/evidence.db`) — 검색 결과 목록 · 정제한 본문 · 검증을 통과한 근거(인용 · 출처 · 확인한 날 · 범위 판정 · 검증 규칙 판) · 「이 문서는 이 주제로 이미 읽었다」는 표시를 쌓는다. 다음 조사(다른 고객이어도)는 먼저 DB에서 **같은 업종 코드**의 조사가 쌓은 근거 가운데 주제 키워드에 맞는 것을 찾아 쓰고(업종이 다르면 키워드가 맞아도 쓰지 않는다 — 지표 이름만으로는 누구의 값인지 다 드러나지 않는다), `WINMATE_RESEARCH_REUSE_DAYS`(기본 30일) 안에 확인한 근거가 충분한 주제는 검색을 건너뛴다. 모자란 주제만 새로 검색하고, 이미 읽은 문서는 다시 모델에 넘기지 않으며, 새 근거는 다시 쌓는다. 검증 규칙이 바뀌면(`PACK_VERSION`) 이전 규칙으로 확인한 근거는 쓰지 않는다. DB에는 공개 검색어 · 공개 문서 · 확인한 사실만 들어간다(고객사 이름 · 요구사항 원문은 저장하지 않는다). `GET /api/research/status`가 쌓인 건수와 출처별 상태(성공 · 0건 · 실패 · 연속 실패)를 돌려준다.

근거를 찾지 못하면(검색 수단 없음 · 검색 실패 · 맞는 글 없음 · 출처 페이지를 열지 못함 · 검증 통과 근거 부족) 값을 지어내지 않는다. 자동 구성 결과에는 그 칸이 자리표시([00])로 오지만 화면이 바로 정리한다 — 수치 장은 이 업종의 키워드 장으로 바뀐다(아래 「자리표시는 남기지 않는다」). 조사가 실패해도 자동 구성의 다른 목차는 영향을 받지 않는다(트렌드 장이 든 목차만 조사 결과를 기다린다).

- 레이아웃 자동 구성: `compose` 작업이 조사 hook을 composer에 넘긴다(`adapters/compose.py` → `poc/test/scenario_composer/composer/market.py`). 화면은 이 업종의 트렌드 장 견본(종류별)을 `market.sheets`로 함께 보낸다.
- 장 하나 다시 채우기: `POST /api/research/trend-sheets` (직접 넣은 트렌드 장 · 요구사항이 바뀐 뒤) · 그 밖의 시장 장은 `POST /api/research/market`의 검증된 근거를 근거 풀에 넣어 쓰고, 웹 근거로 쓴 칸이 있으면 자동 완료하지 않고 확인을 요청한다(값이 근거에 있는지만 코드로 확인되기 때문).
- 차트: 추이 막대 · 구성비 도넛은 값 칸의 숫자대로 다시 그린다(`web/src/domain/slides/charts.js`) — 숫자와 그림이 어긋나지 않는다.
- 설정: `WINMATE_RESEARCH` · `WINMATE_RESEARCH_TTL` · `WINMATE_RESEARCH_QUERIES` · `WINMATE_RESEARCH_ENGINES` · `WINMATE_RESEARCH_STORE` · `WINMATE_RESEARCH_DB` · `WINMATE_RESEARCH_REUSE_DAYS` · `WINMATE_RESEARCH_KEEP_DAYS` · `WINMATE_RESEARCH_SEARCH_TTL`(루트 `.env.example`). 같은 요청의 조사 결과는 `app/data/runtime/research`에 24시간 보관한다. 출처 PDF는 서버에 `pdftotext`(poppler-utils)가 있을 때만 읽는다.
- 바깥 접속: 출처 자체 검색과 페이지 받기는 서버가 공개 사이트에 직접 접속해야 한다. 운영망에서 막혀 있으면 검색은 실패로 끝나고(값을 지어내지 않는다) 근거 DB에 쌓인 것만 쓸 수 있다 — DB 파일은 개발망에서 쌓아 옮길 수 있다(`WINMATE_RESEARCH_DB`).
- 출처 더하기: `market_sources.ENGINES`에 한 줄(검색 주소 · 기사 주소 꼴). 더하기 전에 robots.txt 가 검색 · 기사 주소를 허용하는지, 결과가 서버에서 바로 오는지(스크립트로 그리지 않는지), 검색어를 바꾸면 결과가 바뀌는지 확인한다. 결과 화면은 한 가지 방식으로 읽는다(그 출처의 기사 주소 꼴인 링크 가운데 제목 · 요약에 검색어가 든 것).
- 실제 실행(2026-11-16 · 기본 연결 Qwen — 모델 검색 없음 · 출처 자체 검색 6곳 · 업종 4개(외식 · 호텔 · 병원 · 유통) × 트렌드 장 4종 = 16장): 빈 DB에서 새로 조사하면 4/16장, 같은 DB에 다른 고객 · 다른 요구사항으로 다시 조사하면 7/16장이 채워졌다(저장 근거 2~13건 재사용). 조사 1회 33~127초. 채워진 값을 원문과 직접 대조해 나온 결함(종류 없는 대상 이름 · 연도 없는 오래된 기사의 수치 · 모델이 줄여 쓴 이름 · 업종이 다른 저장 근거의 재사용 · 인용에 없는 원인을 더한 흐름 문장)은 모두 규칙과 시험(`test_market_research.py`의 `Audited`)으로 막았다 — 그 뒤의 채움 수는 이 수치보다 낮을 수 있다(규칙이 더 엄격해졌다).
- 한계: 사이트 자체 검색은 낱말 일치라 일반 검색엔진만큼 관련 문서를 찾지 못한다 — 업종 · 요구사항에 따라 채워지는 장 수가 달라지고, 같은 입력도 회차마다 다른 근거가 잡힐 수 있다(쌓인 근거가 늘수록 줄어든다). 채워지지 않은 장은 화면이 근거가 필요 없는 장으로 바꾼다. 지표 이름은 추출한 그대로라 짧고 딱딱할 수 있다(뜻이 헷갈리면 요소의 근거에서 인용 원문을 본다). 고객사 분석(현황 지표)과 경쟁사 비교 장은 이 조사의 대상이 아니다(고객 자료 · 영업 정보로 채운다). 출처 페이지에서 주제와 가까운 대목 몇 개만 읽으므로 표 전체가 필요한 긴 시계열은 잡히지 않을 수 있다 — 그때는 추이 대신 지표 · 키워드 장이 선택된다. 자바스크립트로 그리는 페이지는 본문을 읽지 못해 쓰지 않는다.

검증: `app/.venv/bin/python -B -m pytest app/tests/test_market_research.py app/tests/test_compose_auto.py -q`(오프라인 · 검증 규칙과 가짜 검색 · 모델로 돌린 전체 흐름).

## 자리표시는 남기지 않는다 (2026-11-16)

레이아웃 견본의 자리표시(`[00]` · `[0]주` · `[확인 필요]` · `[모델명]` …)는 "여기에 실제 값이 들어간다"는 표시다. 제안서의 장에는 어떤 경우에도 남기지 않는다. 규칙은 `web/src/domain/slides/placeholders.js`, 실행은 장별 채우기(`web/src/services/layout-context.js`)가 한다.

1. 근거가 있는 값으로 채운다(자동 구성 · 장별 채우기 — 요구사항 · 제품 사양 · 사례 · 검증된 시장 근거에 있는 수치만).
2. 문장 칸은 수치 자리만 뺀다 — `월 전기료 [00]% 절감` → `월 전기료 절감`, `화면 장애 [0]건 이하` → `화면 장애`.
3. 숫자만 들어가는 칸을 채울 수 없으면 **그 장의 레이아웃을 바꾼다**: 고객사 현황 지표 → 고객 과제, KPI 전후 비교 → 가치 3, 업종 트렌드 수치 → 이 업종의 키워드 장, 수량표 → 제품 사양(표에 없는 레이아웃은 같은 묶음 · 같은 용도의 자리표시 없는 레이아웃). 덱에 이미 있는 레이아웃으로는 바꾸지 않고, 머리말 · 바닥글 · 쪽 번호는 옮긴다. 새 레이아웃은 이 고객에 맞게 다시 채운다.
4. 바꿀 레이아웃이 없으면 그 칸(과 딸린 단위 · 이름표 칸)을 비우고 「확인 필요」로 알린다.

언제 도는가: 새로 넣은 장 · 맥락이 바뀐 장 · 다시 채우는 장은 채우기 끝에. **열어 본 제안서**에서 시스템이 이미 채웠다고 한 장(레이아웃 자동 구성 · 장별 채우기를 마친 장)은 열 때와 내용이 바뀔 때 — 이때는 장을 통째로 다시 쓰지 않고 자리표시만 정리한다(맞게 들어간 수치와 사람이 고친 글은 그대로, 문장 칸뿐이면 모델도 부르지 않는다). 업종 트렌드 장만 시장조사를 다시 해 실제 수치로 채워 본다. 모델을 쓸 수 없을 때도 2 · 4는 코드로 처리한다. 열지 않은 제안서 · 내용이 고정인 장(Why Samsung · 도입사례) · 샘플 덱 미리보기는 건드리지 않고, 보관만 해 둔 예전 장(아직 이 고객에 맞게 채운 적 없는 장)은 「확인 필요」로 두었다가 다시 채울 때 정리한다(보기만 해서는 예전 제안서를 고치지 않는다).

검증: `node app/tests/layout-placeholders.mjs`(판별 · 문장 정리 · 대체 레이아웃), `node app/tests/layout-placeholder-ui.mjs`(실제 채우기 흐름 · 모델 답은 고정값).

## 내용 고정 — 관리자 「전체 파트」의 고정은 실제 제안서에서도 (2026-11-17)

관리자 「레이아웃 구성 관리 › 전체 파트」에서 완전 고정 · 업종별 고정인 파트와 자물쇠(내용 고정) 장은 실제 제안서에서도 **AI가 쓰지 않는다**. 사람은 편집기에서 고칠 수 있고, 고친 내용도 그대로 둔다.

- 목록 하나: `web/src/domain/templates/fixed_content.json` — 파트 제안 개요(그 업종 덱의 개요 장 그대로 — 고객이 고른 제품만이 아니라 업종의 Device · Solution · Service) · Why Samsung · 서비스, 장 마무리 · 구독 비교 · 케어 1 · 케어 2 · 구독 조건 · 결제(숫자 00). 앱(`fixed_content.js`)과 레이아웃 자동 구성(`poc/test/scenario_composer/composer/auto.py` `FIXED_TOCS` · `fixed_sheet`)이 함께 읽는다.
- 지키는 곳: 레이아웃 자동 구성(모델 호출 없음 · 제품 바꿔 끼우기 없음 · 템플릿 글 · 사진 그대로, 목차 장만 이 덱을 따른다) · 장마다 채우기(`context-policy.js` `isFixedContentLayout` — 맥락이 바뀌어도 · 다시 시도해도 그대로) · 직접 넣은 장의 방향 추론(건너뜀) · 시트 상세의 '이 요소만 AI로 채우기'(없음). 고정 파트에 사람이 넣은 장도 AI가 쓰지 않는다.
- 순서 고정 파트(가치 제안 · 구독 상품 제안)는 자동 구성이 장을 빼더라도 순서를 바꾸지 않는다.
- 관리자 목록에 자물쇠가 늘면 `fixed_content.json` 에도 더한다 — `node --test app/tests/fixed-content.mjs` 가 알려 준다. 자동 구성 쪽: `app/.venv/bin/python -B -m pytest app/tests/test_compose_auto.py -q`(FixedContentTest).

## 레이아웃 구성 추천은 매칭을 확인한 뒤에만 (2026-11-16)

Storyboard의 '레이아웃 구성' 버블(`web/src/components/layout-compose.jsx`)은 구성을 스스로 추천하지 않는다.

- 버블 아래 **구성 추천받기** 버튼은 제안 전략 요약이 끝날 때까지 꺼져 있고, 요약이 끝나면 켜지기만 한다.
- 버튼을 누르면 **「제품 · 솔루션 매칭을 마쳤나요?」** 팝업이 지금 연결된 제품 · 솔루션 · 유관사례 · 공간 구성 수를 보여 준다. `구성 추천받기`로 확인해야 모델을 부르고(고정 1칸 + 추론 3칸), `매칭 더 하기`는 매칭 팝업을 연다.
- 받은 추천은 제안서에 남는다. 그 뒤 요구사항 · 매칭이 바뀌어도 다시 부르지 않는다 — 이전 추천과 안내만 보이고, `다시 추천`을 누르면 같은 확인을 거친다(조건이 그대로일 때의 `다시 추천`은 바로).
- `전체 구성 보기`는 요약 · 추천과 상관없이 늘 열 수 있다.

추천 목록의 모양: 구성마다 테두리 · 꼬리표(기본 · 추천 1…) 없이 가는 선으로 나누고, 목차 흐름은 구성 상세 팝업 위쪽과 같은 버블에 **이름을 버블 아래**에 둔다. `전체 구성 보기`의 카드도 이름이 버블 아래다(여기서는 어느 것이 기본 · 추천인지 표시가 남는다).

결과 상자(2026-11-16 사용자 지시):
- '추천 구성' 머리글은 없다(업종 이름 · `다시 생성`만).
- 버블(고객 요구사항 · 매칭 · 레이아웃 구성 · 목차)은 제자리에 두고 **결과 상자만 오른쪽으로 넓어진다** — 보이는 구성 중 가장 긴 구성(지금은 상세 제안)이 한 줄에 다 들어가는 폭(버블 수 × 칸 80px). 구성을 고른 뒤 `다른 구성으로 바꾸기`로 펼치면 오른쪽 목차 열 위에 겹쳐 뜬다.
- 버블은 40px, 칸 폭은 모든 구성에서 같아 버블 간격이 같다(`전체 구성 보기`는 카드 폭 ÷ 가장 긴 구성의 버블 수).
- **제품 스펙 버블은 그리지 않는다** — 늘 맨 끝 고정이라 구성에는 들어 있고, 시작하면 Storyboard 맨 끝에 놓인다. 구성 상세 팝업의 흐름 · 장 목록에는 그대로 보인다.
- 버블 색은 **파트마다 다르고 흐름 앞에서 뒤로 차례로 흐른다**(회색 · 보라 → 파랑 → 청록 → 초록 → 금색 → 주황 → 빨강 → 삼성 남색). 색은 `web/src/domain/templates/part_colors.js` 한 곳에서 — 구성 상세 · 목차 템플릿 화면 · 관리자 추천 구성 목록 · 구성 만들기 · 「전체 파트」도 같은 색이다. 관리자가 직접 만든 파트는 고른 색, 목록에 없는 옛 목차는 유형 색. 규칙(겹치지 않음 · 흰 아이콘 명암비 3 이상 · 구성 안 이웃한 버블 CIEDE2000 15 이상 · 흐름 순서): `node --test app/tests/part-colors.mjs`. Storyboard 목차 열의 버블은 아직 유형 색이다.
- 버블에 마우스를 대면 버블이 커지고 **그 목차의 레이아웃 구성**(이 제안 업종의 덱, 없으면 대표 업종 — 공간 · 여정 · 솔루션 · 사례마다 늘어나는 장은 한 칸으로 접고 「공간마다 × n」)이 버블 아래에 뜬다 — 관리자 추천 구성 목록의 hover 와 같다(접는 규칙 `web/src/domain/templates/represent_flow.js` 를 함께 쓴다).

구성 고르기 · 시작(2026-11-16 사용자 지시):
- 구성 카드(기본 제안 · 상세 제안)는 **고르는 버튼**(라디오 카드 — 카드 · 버블 어디를 눌러도 고른다, 고른 카드는 강조 테두리 · 채운 동그라미). 카드를 눌러 상세를 여는 동작과 `>` 표시는 없다.
- 상세(대표 시나리오 샘플)는 카드 오른쪽 위 **`샘플 보기`**로만 연다. 상세 팝업에는 시작 버튼이 없다(보기만). `전체 구성 보기` 카드도 `샘플 보기`만 있다.
- 결과 상자 아래(바깥) **`제안서 작성하기`** — 고른 구성이 없으면 꺼져 있고 마우스를 대면 '기본 제안 · 상세 제안 중 하나를 선택하세요'. 누르면 「‘구성 이름’ 구성으로 진행할까요?」(그 구성의 파트 흐름, 지금 목차가 바뀌면 그 경고) → 목차가 놓이고 자동 구성이 시작되며 **레이아웃 구성 버블은 Storyboard에서 빠진다**(목차를 다 지우면 다시 나온다 — `layoutPlaced`).
- 버블이 빠진 뒤: 진행 · 멈추기는 작업 알림 카드(레이아웃 자동 구성, 도는 동안만), 실패한 목차는 그 목차 열의 `다시 구성`, 진행 중 작업을 이어서 따라가는 것은 `LayoutFollow`. 이전의 진행 카드 · `다른 구성으로 바꾸기`는 없다.

검증: `node app/tests/layout-compose-ui.mjs`.

## 매칭 카드의 공간 묶음 — 끌어 놓기 (2026-11-17)

- 공간 구성을 한 제안서는 제품 · 솔루션 · 서비스 버블 아래 카드에 제품이 공간별 묶음(+ 미배치)으로 보인다. 제품을 **끌어다 놓아** 다른 공간 · 미배치로 옮기고, 제품 위에 놓으면 그 앞으로(같은 공간 안 순서 바꾸기). 묶음 빈 곳에 놓으면 끝. 공간에서 끌어내는 동안에는 미배치 묶음이 비어 있어도 나타난다.
- 놓는 즉시 `p.spacePlan` 에 저장(`services/space-plan.js` `movePlanProduct` → `domain/proposals/space-plan.js` `placeProduct`). 여러 공간에 둔 제품은 끈 쪽만 옮기고, 한 공간에 두 번 넣지 않는다. 만들어 둔 조감도는 「공간 구성이 바뀌었어요 · 다시 만들기」로 보인다(기존 규칙).
- 공간 구성 팝업이 열려 있거나 조감도를 만드는 동안 · 보기 전용 · 공간 구성이 없을 때는 끌 수 없다.
- 검사: `node app/tests/space-plan.mjs`(규칙) · `CHROME=… node app/tests/match-space-drag-ui.mjs`(화면).

## 검증

```sh
uv pip install --python app/.venv/bin/python -r app/tests/requirements.txt
make test          # API·인증·실패 정책·provider·전역 큐·모델 교체·재시도·저장 계약, 모델 성공 응답을 흉내내지 않음
WINMATE_LLM_PROVIDER=gemini make test-live  # 격리된 API/Vite에서 기능 14개 × 10건 = 실제 Gemini 140건 (비전·사용자 선택 기준 포함)
```

Redis 통합 검증은 `WINMATE_TEST_REDIS_SERVER` → PATH의 `redis-server` → `bash app/scripts/cache_redis.sh install`이 npm(`redis-memory-server`)으로 빌드한 `app/data/runtime/redis-bin/<버전>/redis-server` 순으로 찾아 임시 Redis를 자동 실행한다(brew 불필요). 셋 다 없을 때만 해당 통합 사례를 skip한다.

실제 테스트는 합성 고객 요구사항만 전송하며 API 사용량이 발생한다. 실행 후 소유한 테스트 서버만 종료한다. 결과·오류·응답 시간·실제 모델 처리 통계는 app/tests/output/strict/에 저장한다.

별도의 실행 중 API에 대해 브라우저·입력 파일 검사를 실행할 수도 있다.

```sh
WINMATE_TEST_URL=http://127.0.0.1:8788 WINMATE_TEST_PASSWORD='로컬 계정 비밀번호' make test-browser
app/.venv/bin/python -B app/scripts/smoke.py --prompt
app/.venv/bin/python -B app/scripts/preflight.py --deep --require-auth
app/.venv/bin/python -B app/scripts/check_secrets.py
```

기본 브라우저는 Playwright 고정 Chromium이며 설치가 필요하면 app/web에서 `npx playwright install chromium`. 테스트는 격리된 브라우저 저장소를 사용한다. 캐시된 사용자 비밀번호를 읽지 않는다. 실제 UI 연결 검사는 `WINMATE_LIVE_WEB=<Vite 주소> node app/tests/live_journey.mjs`. 테스트가 종료된 앱의 사용자 데이터는 건드리지 않는다.

텍스트 검토 외에 PDF 실제 픽셀/사용자 선택 기준 검토도 10건 실제 모델로 검사한다. PDF 화면은 선택한 최대 4장을 비전으로 채점하고, 화면에 확인한 장 번호를 표시한다.

10개 레이아웃의 PPTX 렌더→편집 가능한 내보내기→My 복원, 잘못된 입력 10건, 브라우저 저장소·백업 13건, UI 조작 12건, 첨부 원문 읽기 12건도 검증한다. 과거 더미 동작 전용 테스트는 실제 API/실패 정책 테스트로 대체했다. 1~3단계의 예전 스크린샷·기존 테스트 비교는 당시 커밋과 보고서에 남아 있다. 원본 build/ 테스트를 수정하지 않았다.

## 구조·데이터 갱신

- web/src/pages·components: 화면과 UI, hooks/services: 데이터·업무 처리, repositories: 저장 경계, api/platform: 전송/브라우저 기능.
- web/src/domain/slides: 1280×720 HTML·overrides·PPTX 내보내기·복원. 유효 슬라이드의 변환 알고리즘은 유지했다.
- web/src/styles/tokens.css: 공통 테마·색·간격·글꼴·반경. 로그인/계정 페이지도 같은 토큰 원천을 사용한다.
- api/poc: 원본 PoC의 읽기 전용 import, strict 어댑터, provider, 작업/질문 재개, 검색.
- data/runtime: 원본을 쓰지 않는 SQLite projection·정본 KB·인증·선택적 캐시. Git 제외.

원본 DB 갱신은 proddb/README.md와 build_db.py 안내를 따른다. 앱 snapshot을 다시 만들려면 `app/.venv/bin/python -B app/scripts/prepare_data.py --force`, KB는 `node app/scripts/export_agent_data.mjs`. 라이브 버전 갱신은 reference/정적 데이터/템플릿 계약을 함께 검토하고 테스트해야 한다. 원본을 쓰는 PoC sync_source.py는 실행하지 않는다.

고객별 샘플 버티컬 시나리오 40종(`bs_v_*`, 업종 20개 × 고객 2곳)은 업종별 표준 제안서의 내용 — Overview · 고객 니즈와 핵심 제안 · 공간별 제품 · 솔루션 · 도입사례 · Why Samsung, 표준 제안서와 같은 L_VS_* 장 — 에 고객의 현황 · 수량 · 일정 · 결정 요청을 더한 제안서다(표준 형식 그대로가 아니라 한 고객에게 내는 제안). 내용은 업종마다 `app/data/vertical_proposals/<업종>.json` 한 파일에 있고(표준 제안서에서 온 업종 공통 내용 + 고객 두 곳의 내용), `app/.venv/bin/python -B app/scripts/rebuild_vertical_best.py`가 기존 레이아웃에 채워 `web/src/domain/templates/vertical_scenarios.json`을 만든다. 칸은 앱이 실제로 그리는 것과 같은 목록(`app/scripts/layout_registry.mjs`)으로 맞추고, 같은 문구 · 사진 · 양식의 반복과 "예시 · 가상" 같은 표현은 생성 단계에서 점검한다(`--check <업종>`은 쓰지 않고 점검만, `--only <업종> --out <파일>`은 따로 만들어 보기). 표준 제안서 44종(`bs_std_*`)은 `app/scripts/vertical_standard/`가 만든다.

홈 상단의 자산 건수는 `/api/catalog/metrics`가 한국시간 날짜별로 한 번 집계하고 `app/data/runtime/catalog_metrics.sqlite`에 보관한다. 레이아웃은 정본 KB의 활성 목록(퇴역·숨김 제외), 업종 커스터마이즈는 그중 업종이 지정된 레이아웃, 제품은 앱 SQLite의 상품 목록, 솔루션·도입사례는 앱 카탈로그가 기준이다. 한국시간 자정 이후 첫 조회 때 새로 집계하며, 홈을 계속 열어 두면 자정에 자동 조회하고 절전·오프라인 이후 돌아왔을 때도 확인한다. 같은 날 새로고침·동시 접속·서버 재시작은 기존 집계를 재사용한다. 갱신 실패 시 마지막 숫자를 유지하고 한 시간 뒤 다시 시도한다. 삼성 사이트 원본 수집은 기존 DB 갱신 절차를 따른다. 검증은 `app/.venv/bin/python -B -m pytest app/tests/test_catalog_metrics.py -q` 및 `node app/tests/catalog-metrics.mjs`로 실행한다.

## 계정 데이터 · 3D 조감도 서버 렌더 · 이미지 캐시 Redis

중요 데이터와 무거운 작업은 서버에 있다. 자세한 설계·검증은 [15-backend-split](../docs/migration/15-backend-split.md).

- **계정 데이터** `app/api/account_data.py`(`app/data/runtime/account_data.sqlite`, `WINMATE_ACCOUNT_DATA_DB`): 제안서·검토·검토 원본·시뮬레이션·고객 프로필·찜·첨부 원문·건물과 업로드 이미지(계정 파일). 브라우저 localStorage/IndexedDB는 화면을 바로 그리기 위한 캐시이며(`web/src/repositories/account-sync.js`), 앱 모듈이 읽기 전에 계정 기록으로 채운다. 기록별 revision으로 충돌을 막고, 예전 브라우저 기록은 자동으로 1회 이전하되 서버의 최신 수정·삭제를 덮지 않는다.
- **3D 조감도 미리보기** `app/api/spatial_previews.py` + `app/scripts/spatial_render_worker.mjs`: 템플릿·히스토리 카드의 3D를 서버의 headless Chromium이 편집기와 같은 렌더러로 그려 WebP로 제공한다(콘텐츠 주소 URL, 브라우저 영구 캐시). 시작 후 템플릿 미리보기를 백그라운드로 미리 그린다. 렌더러를 못 쓰면 브라우저가 예전처럼 직접 그린다. 상태 `GET /api/spatial/previews/status`.
- **이미지 캐시 Redis** `app/api/image_cache.py`: 캐시 전용 Redis(최대 **3gb**, `allkeys-lru`, 비영속) → 파일 순서. 설정은 루트 `.env`의 `WINMATE_CACHE_*`(견본 `.env.example`), 실행은 `bash app/scripts/cache_redis.sh up`(또는 `make cache-redis`, `./start.sh`가 함께 실행). LLM 큐 Redis와 같은 인스턴스는 거부하며, Redis가 없거나 장애면 메모리 캐시(256MB)로 동작하고 나중에 뜬 Redis에 1분 안에 연결한다.

검증: `pytest app/tests/test_image_cache.py app/tests/test_spatial_previews.py app/tests/test_account_data.py`, `node --test app/tests/account-sync.mjs`, 실행 중인 앱에 `WINMATE_TEST_URL=… WINMATE_TEST_PASSWORD=… node app/tests/account-data-e2e.mjs`.

## 저장·한계

기존 히스토리도 공유 원본 동기화 후 최대 2건씩 요구사항 요약을 채운다. 최신 요약은 재사용하고 누락·오류 기록은 다시 생성하며, 빈 제안서와 수정 권한이 없는 기록은 제외한다. 요구사항·장표·작성 시각을 변경하지 않고 요약만 저장한다. 재접속 시 미완료 항목을 이어 처리하고 완료한 항목은 재생성하지 않는다. `node app/tests/requirement-summary-history.mjs`로 기존 기록 보완·오류 복구·동시성·새로고침 재사용을 검증한다.

고객 요구사항을 입력한 뒤 1.2초 동안 변경이 없거나 저장하면 서버 `requirements` 작업이 실제 LLM으로 제안 전략 요약을 만든다. Storyboard의 고객 요구사항 아래에 핵심 요약을 표시하며 배경·목표·필수 요구·제약·이해관계자·의사결정 기준·위험·확인 질문·제안 전략을 구분한다. 사실과 AI 해석·질문을 별도로 표시하고 모든 항목의 원문 ID·인용 문구·위치를 서버에서 검증한다. 제작자 의견을 고객의 확정 요구로 처리하지 않으며 원문에 없는 수치를 요약에 넣지 않는다.

요약과 입력 버전은 제안서의 `requirementSummary`에 보관한다. 입력이 바뀌면 이전 요약은 즉시 작업 맥락에서 제외하며 늦게 도착한 이전 결과도 적용하지 않는다. 작업은 서버에서 계속 실행하고 새로고침 후 이어받는다. 전략·목차 구성·레이아웃 채우기·검토는 현재 요약을 기다린 뒤 작업별 분류와 관련 원문 발췌를 전달하며, 매칭·시뮬레이션도 유효한 요약을 활용한다. 원문을 우선하며 요약 실패 시 규칙 요약을 대신 만들지 않고 재시도를 표시한다.

새로 읽은 첨부의 전체 추출문은 `winmate-requirements/sources` IndexedDB에 보관하고 기존 localStorage 첨부의 2만 자 계약은 유지한다. 인용을 누르면 원문에서 강조한 위치로 이동한다. 전체 추출문을 찾을 수 없는 이전 첨부는 발췌임을 표시하고 미지원·미확인 첨부도 요약 범위에 고지한다. 백업·복원에는 이 원문 저장소도 포함된다. 요약 입력은 합계 40만 자 이하이며 넘으면 원문을 조용히 잘라 보내지 않고 나누어 입력하도록 안내한다. 검증: `npm --prefix app/web run test:requirement-summary`, `app/.venv/bin/python -B -m pytest app/tests/test_requirement_summary.py -q`.

Storyboard 추천은 제안서 전체에서 이미 쓴 레이아웃을 제외한다. Layout Agent 자동 구성은 장표별 적합 후보를 덱 전체에서 중복 없이 배정하고, 적용 직전에도 현재 Storyboard와 대조한다. 후보 부족·동시 편집 충돌·같은 표 양식의 페이지 분할로 중복이 생기는 경우 내용을 버리거나 중복 장표를 넣지 않고 재시도를 안내한다. 전체 목록·My·찜에서 직접 고르는 경우 같은 레이아웃을 다시 사용할 수 있다. 검증은 `npm --prefix app/web run test:layout-uniqueness` 및 `app/.venv/bin/python -B -m pytest app/tests/test_layout_uniqueness.py -q`로 실행한다.

관리자 `[검토 예시]` 세 제안서는 레이아웃 개정 1에서 부록을 서로 다른 요구사항·실행·투자·근거 구성으로 바꾸고 실제 AI로 재검토했다. 대학 캠퍼스 예시는 19장 모두 다른 레이아웃이다. 수정하지 않은 이전 v5 예시·평가만 새 연결 쌍으로 교체하며, 사용자가 수정한 원본·평가와 당시 근거 문서는 보존한다.
이전 v3/v4/v5 히스토리에도 변경되지 않은 부록만 같은 방식으로 보정한다. 공유 서버에 저장된 `user:admin` 소유 예시도 기동 시 보정하고 리비전만 올리며, 공유 토큰·권한·사용자가 수정한 내용은 유지한다.

`admin`에는 제안서 검토 예시 3개(오토파츠 공장, 대학교병원, 베이커리 메뉴보드)도 한 번 추가한다. 원본 앱의 가상 제안서와 검토 의견을 가져왔으며 목록·상세·내보내기에 예시임을 표시한다. 상세 리포트와 장별 근거를 볼 수 있고, 기존 검토 기록을 덮어쓰거나 삭제한 예시를 재생성하지 않는다. `node app/tests/sample-reviews.mjs`로 초기화 계약을 확인한다.

기존 localStorage/IndexedDB 키와 데이터 형식을 유지한다(이제 계정 기록의 캐시). `/migration.html`에서 JSON/Blob을 백업·복원하며, 같은 ID는 갱신하고 다른 기존 기록은 유지한다. Claude origin의 개인 자료는 자동으로 복사하지 않는다.

Storyboard에서 이전 히스토리의 요구사항·제품 선택을 재사용하고, 읽기전용/편집가능 링크로 같은 원본을 함께 수정할 수 있다. 열람만 한 공유본은 히스토리에 넣지 않으며, 편집 저장 후 연결한다. **이 스토리보드 활용하기**는 별도 복사본을 만든다. 공유본은 서버 SQLite에 저장되므로 백업 시 `app/data/runtime/storyboards/`도 포함한다. 동기화·권한·참여자 식별·검증 방법은 [Storyboard 재사용·공유](../docs/storyboard-sharing.md)를 참조한다.

사용자 요청에 따라 `admin`에는 첫 접속 시 `[샘플]` 제안서 3개(카페 메뉴보드, 호텔 AI 스테이, 대학 강의실·도서관)를 넣는다. 기존 샘플 버티컬 시나리오의 편집 가능한 복사본으로, AI 호출의 대체 응답이 아니다. 기존 기록과 샘플 수정 내용을 덮어쓰지 않고, 삭제한 샘플을 다시 만들지 않는다. 다른 계정에는 자동으로 넣지 않는다. 각 기기는 같은 초기 샘플을 받으며, Storyboard를 열어 공유본이 연결된 제안서는 서버의 같은 원본과 동기화한다. 히스토리 목록 자체는 각 브라우저에 보관한다.

외부 로그인·초기 로딩·샘플을 1500/900/390px와 장애 상황까지 검사하려면 `WINMATE_TEST_URL=https://배포주소 WINMATE_TEST_PASSWORD='현재 비밀번호' node app/tests/admin-history.mjs`를 실행한다. 검사는 격리된 브라우저를 쓰며 기존 사용자의 브라우저 자료를 수정하지 않는다. 결과는 `docs/migration/06-admin-history.md`에 기록했다.

긴 작업은 화면 이동과 새로고침 후 계속 확인할 수 있다. 실패/취소한 작업의 원문 재시도는 서버 메모리에서 한 시간 보관한다. 성공하면 원문 closure를 해제한다. 서버가 재시작되거나 자료가 만료된 긴 첨부는 재업로드가 필요하며 2만 자 excerpt로 조용히 다시 실행하지 않는다.

PoC의 max_slides는 필수 목차를 유지하는 장수 목표다. 초과하면 경고한다. 업로드 문서 검토는 텍스트/구조와, PDF가 제공된 경우 선택한 실제 화면 최대 4장을 비전으로 확인한다. 정확히 측정하지 못한 시각 항목과 확인 범위는 결과에 표시한다. RFP는 PDF/PPTX/DOCX/TXT/MD를 읽으며 PDF 원문 읽기는 래스터 렌더를 생략한다. HWP·스캔 OCR·DeepAgents copilot·Tavily 확장·복수 관리 계정은 제공하지 않는다. 기본 앱 구동에 LibreOffice는 필요하지 않다.

최신 변경과 기능별 테스트 결과는 `docs/migration/04-gemini-only.md`를 참조한다. 00~03 보고서는 더미 제거 전의 이전 단계 기록이다.
