# Winmate v2 로컬 앱

고정 라이브 아티팩트의 UI·슬라이드 엔진을 옮긴 React/FastAPI 앱이다. **AI 기능은 공통 LLM 모듈을 통해 실제 모델을 사용하며, 기본 제공자는 사내 LLM(`internal`)이며, `WINMATE_LLM_PROVIDER=gemini`로 Gemini를 선택할 수 있다.** 더미 모드, 규칙으로 만든 AI 응답·점수, 자동 예시 히스토리 주입을 제거했다. 모델이 실패하면 오류와 재시도를 표시하고 사용자 입력은 유지한다.

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
# 포트 설정
WINMATE_API_PORT=8788 ./start.sh
```

로그인 후 사이드바 프로필을 누르면 오른쪽 팝업에 계정 정보와 로그아웃 버튼만 표시된다. 바깥 클릭·Esc·프로필 재클릭으로 닫는다. `/account.html`은 직접 접근용 기존 경로로 유지한다. 기본 바인딩은 127.0.0.1, 세션은 HttpOnly/SameSite=Strict 쿠키·12시간이다. API 키는 서버만 읽으며 프런트·Git에 포함하지 않는다. 앱 변경은 `app/`에서 수행한다. `poc/`, `proddb/`와 `reference/`는 공용 AI 모듈·수집 원본·참고 자료로 보존한다. 루트 `src/`에는 자료 추출·평가 도구가 사용하는 모듈과 출처 자료만 남아 있으며 구버전 루트 `dist/`는 제거했다.

필수 입력은 제공된 `poc/test/`, `proddb/winmate_products.sqlite`, `reference/live/`, `app/data/`다. 시작 명령이 패키지 설치, 웹 빌드, 읽기 전용 SQLite snapshot, 정본 Agent KB, 데이터 점검, 계정 준비를 수행한다. 없거나 손상된 입력은 경로와 함께 오류로 안내한다. health가 준비되기 전에 **선택한 실제 LLM의 연결 확인**도 수행하며 실패하면 기동하지 않는다.

## 사용 가이드

사이드바 프로필 바로 위의 원형 테두리 물음표 아이콘 **사용 가이드**에서 기능별 항목을 선택한다. 홈·제안서 제작/Storyboard·PPT 레이아웃·Best Scenario·공간 조감도·검토·시뮬레이션·히스토리/공유·My 템플릿·찜의 10개 가이드, 총 86단계를 제공한다. Storyboard 23단계는 `bs01` 전국 매장 디지털 메뉴보드 전환 예제의 실제 요구·연결 자료·장표를 사용한다. 각 단계에는 조작 순서와 필요한 AI 설명·확인 사항이 있다.

목록 팝업과 중앙 가이드는 한 번에 하나만 열린다. 중앙 가이드의 실제 화면 구성 예시는 `inert`와 포인터 차단으로 읽기 전용이며, 페이지 이동은 이전/다음·단계 목록·좌우 키로 할 수 있다. 장표 가이드 열람은 제안서 생성·개인 자료 저장·AI 실행을 하지 않는다. 설명은 `web/src/domain/guides/catalog.js`, 화면 예시는 `web/src/components/guides/GuidePreview.jsx`에서 관리한다.

검증: 앱 실행 후 `node app/tests/guides.mjs`. 전체 86단계·키보드·모바일·팝업 중복 방지·미리보기 조작 차단과 무변경 계약을 검사한다.

### 가이드 에이전트

가이드 팝업 안의 우측 하단 챗봇을 열면 먼저 인사하고 현재 가이드의 추천 질문 5개를 그 아래 고정 영역에 보여 준다. 답변 중에도 질문 위치를 유지하며 대화만 별도로 스크롤한다. 전체 가이드 10개·86단계와 앱 사용 규칙을 매 요청의 맥락으로 사용하는 선택한 실제 LLM을 사용하는 에이전트다. 모델이 생성한 답변을 SSE로 바로 표시하고 핵심만 1~3문장으로 짧게 답한다. 답변 완료 후 관련 가이드·단계로 자동 이동하며, 챗봇을 열어 둔 상태에서도 가이드의 이전/다음·단계 선택을 조작할 수 있다. 가이드 팝업을 닫으면 챗봇도 함께 닫히고 대화가 삭제된다. 질문 전송은 기존 AI 작업과 같이 로그인이 필요하다.

대화와 미전송 입력은 팝업 메모리에만 둔다. 챗봇을 닫으면 즉시 버리고 진행 중인 요청을 취소하며, 늦은 응답이 재열린 챗봇이나 가이드 이동에 반영되지 않는다. 서버 대화 저장·응답 캐시를 사용하지 않고, 챗봇 내용은 브라우저 활동 기록과 AI 오류 본문 기록에서 제외한다. 운영상의 요청·토큰 사용량 통계에는 대화 본문을 넣지 않는다.

`node app/scripts/export_guide_context.mjs`가 가이드 원본과 추천 질문에서 서버 정본 `app/data/guide_context.json`을 생성한다. 웹 빌드가 자동 실행한다. `POST /api/guide/chat`은 서버 정본 전체·현재 단계·이번 팝업의 대화만 모델에 전달하고, 응답의 이동 대상이 실제 가이드 단계인지 검사한다. 오류 시 대신 만든 답변을 제공하지 않는다. 모델이 직접 실행할 수 있는 동작은 없으며 클라이언트는 검증된 가이드 단계로만 이동한다.

검증: `app/.venv/bin/python -B -m pytest app/tests/test_guide_agent.py -q`, `node app/tests/guide-agent-live.mjs`. 후자는 임시 인증 서버와 실제 Gemini를 사용해 자동 이동·대화 연속성·동시 조작·닫기/취소/초기화·모바일·기존 로그인 정책·기록 제외를 검사하며 실제 API 사용량이 발생한다.

## 건물 조감도

사이드바 Best Scenario 바로 아래 **건물 조감도**(3D · BETA)는 라이브 아티팩트 Version 136의 탭을 그대로 옮긴 화면이다. 시작은 건물 템플릿 54개 중 하나를 고르는 것뿐이다(층 수는 고르는 기준이 아님). 템플릿의 모양(층마다 바닥 크기 · 외벽) 그대로 층마다 공간이 빈 채로 스튜디오가 열리고, 층을 누르면 그 층 크기에 맞는 공간 조감도만 골라 채우거나 비운다. 층 추가는 맨 위층과 같은 크기 · 외벽으로 쌓아(다른 업종 공간이나 빈 층이어도) 건물 모양을 유지한다. 층마다 외벽 간판은 넣은 공간을 따르고(빈 층은 간판 없음), 간판이나 층 카드의 이름을 누르면 층 이름(간판 글자)을 바꾼다. 지붕의 건물 이름 간판을 누르면 건물 이름 입력칸으로 간다. 외관 보기에서 외벽을 누르면 외벽 고르기 팝업, 층 이름 · 층 띠를 누르면 층 내부와 층 카드(공간 · 공간 목록)가 열린다. 건물은 브라우저 IndexedDB `winmate-building`에만 저장하며 서버 API · 로그인을 쓰지 않는다. 이미지 저장(PNG)과 HTML 추출(단독 3D 보기 파일)을 제공한다.

모듈 소스는 `web/src/building/`(구조 · 아티팩트와 같게 묶는 방식은 그 폴더의 README), 화면 연결은 `web/src/pages/BuildingPage.jsx`와 `vite.config.js`의 `winmate-building` 플러그인이다. 검증: 앱 실행 후 `node app/tests/building-birdseye-ui.mjs`.

## 비로그인 둘러보기와 로그인

비로그인 방문자도 홈, PPT 레이아웃, Best Scenario, 공간 템플릿, 검토·시뮬레이션 화면을 둘러볼 수 있다. 홈에서는 프로필 오른쪽에 로그인 폼을 고정 표시한다. 제안서 시작·시나리오 활용·찜·검토 업로드·시뮬레이션 시작·AI 검색·공간 생성 등 작업을 실행하면 같은 폼 하나를 중앙 모달로 전환한다. 닫으면 홈에서 고정 폼으로 돌아오며 입력은 유지한다. 로그인 성공 후 현재 화면을 다시 불러온다.

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

설정은 실행 환경 > app/.env > poc/.env 순으로 각 키를 읽는다. 모델·키·API 주소는 선택한 제공자의 `INTERNAL_LLM_*` 또는 `GEMINI_*` 전용 설정이 공통 `WINMATE_LLM_*` 호환 설정보다 우선한다. 제공자를 바꾸면 해당 제공자의 프로필을 선택한다. 실제 키 값은 커밋하지 않는다. 변경 후 API 서버를 재시작한다.

| 변수 | 기본값·의미 |
|---|---|
| WINMATE_LLM_PROVIDER | internal(기본) 또는 gemini. 기존 openai 및 등록한 어댑터도 지원 |
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
docker compose -f app/compose.llm.yml up -d
# app/.env에서 아래 값을 설정한 뒤 API 재시작
# WINMATE_LLM_QUEUE_BACKEND=redis
# WINMATE_LLM_REDIS_URL=redis://127.0.0.1:6379/0
```

Redis 운영에는 영속 볼륨·AOF·noeviction을 사용한다(제공 compose에 반영). 한도 기록을 삭제/flush하거나 별도 DB·namespace로 교체하면 전역 제한도 새로 시작하므로, 전환 시 기존 호출이 모두 60초 구간에서 벗어난 뒤 사용한다. `/api/poc/capabilities`의 `provider.usage.queue`에서 대기·실행·최근 60초 호출 수를 확인한다.

WINMATE_MODE/기능별 *_MODE는 항상 real이다. API의 offline:true, llm:false는 422로 거절한다. 제품/솔루션/사례 조회·문서 파싱·슬라이드 렌더·PPTX 변환·점수 집계·검색 후보 추출은 기존 알고리즘을 유지한다. AI 판단·작성·채점·대화·의미 재정렬만 공통 모델 모듈을 사용한다.

## 검증

```sh
uv pip install --python app/.venv/bin/python -r app/tests/requirements.txt
make test          # API·인증·실패 정책·provider·전역 큐·모델 교체·재시도·저장 계약, 모델 성공 응답을 흉내내지 않음
WINMATE_LLM_PROVIDER=gemini make test-live  # 격리된 API/Vite에서 기능 14개 × 10건 = 실제 Gemini 140건 (비전·사용자 선택 기준 포함)
```

Redis 통합 검증은 `redis-server`가 PATH에 있거나 `WINMATE_TEST_REDIS_SERVER`에 실행 파일 경로를 지정하면 임시 Redis를 자동 실행한다. 미설치 시 해당 통합 사례만 skip한다.

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

홈 상단의 자산 건수는 `/api/catalog/metrics`가 한국시간 날짜별로 한 번 집계하고 `app/data/runtime/catalog_metrics.sqlite`에 보관한다. 레이아웃은 정본 KB의 활성 목록(퇴역·숨김 제외), 업종 커스터마이즈는 그중 업종이 지정된 레이아웃, 제품은 앱 SQLite의 상품 목록, 솔루션·도입사례는 앱 카탈로그가 기준이다. 한국시간 자정 이후 첫 조회 때 새로 집계하며, 홈을 계속 열어 두면 자정에 자동 조회하고 절전·오프라인 이후 돌아왔을 때도 확인한다. 같은 날 새로고침·동시 접속·서버 재시작은 기존 집계를 재사용한다. 갱신 실패 시 마지막 숫자를 유지하고 한 시간 뒤 다시 시도한다. 삼성 사이트 원본 수집은 기존 DB 갱신 절차를 따른다. 검증은 `app/.venv/bin/python -B -m pytest app/tests/test_catalog_metrics.py -q` 및 `node app/tests/catalog-metrics.mjs`로 실행한다.

## 저장·한계

기존 히스토리도 공유 원본 동기화 후 최대 2건씩 요구사항 요약을 채운다. 최신 요약은 재사용하고 누락·오류 기록은 다시 생성하며, 빈 제안서와 수정 권한이 없는 기록은 제외한다. 요구사항·장표·작성 시각을 변경하지 않고 요약만 저장한다. 재접속 시 미완료 항목을 이어 처리하고 완료한 항목은 재생성하지 않는다. `node app/tests/requirement-summary-history.mjs`로 기존 기록 보완·오류 복구·동시성·새로고침 재사용을 검증한다.

고객 요구사항을 입력한 뒤 1.2초 동안 변경이 없거나 저장하면 서버 `requirements` 작업이 실제 LLM으로 제안 전략 요약을 만든다. Storyboard의 고객 요구사항 아래에 핵심 요약을 표시하며 배경·목표·필수 요구·제약·이해관계자·의사결정 기준·위험·확인 질문·제안 전략을 구분한다. 사실과 AI 해석·질문을 별도로 표시하고 모든 항목의 원문 ID·인용 문구·위치를 서버에서 검증한다. 제작자 의견을 고객의 확정 요구로 처리하지 않으며 원문에 없는 수치를 요약에 넣지 않는다.

요약과 입력 버전은 제안서의 `requirementSummary`에 보관한다. 입력이 바뀌면 이전 요약은 즉시 작업 맥락에서 제외하며 늦게 도착한 이전 결과도 적용하지 않는다. 작업은 서버에서 계속 실행하고 새로고침 후 이어받는다. 전략·파트 구성·레이아웃 채우기·검토는 현재 요약을 기다린 뒤 작업별 분류와 관련 원문 발췌를 전달하며, 매칭·시뮬레이션도 유효한 요약을 활용한다. 원문을 우선하며 요약 실패 시 규칙 요약을 대신 만들지 않고 재시도를 표시한다.

새로 읽은 첨부의 전체 추출문은 `winmate-requirements/sources` IndexedDB에 보관하고 기존 localStorage 첨부의 2만 자 계약은 유지한다. 인용을 누르면 원문에서 강조한 위치로 이동한다. 전체 추출문을 찾을 수 없는 이전 첨부는 발췌임을 표시하고 미지원·미확인 첨부도 요약 범위에 고지한다. 백업·복원에는 이 원문 저장소도 포함된다. 요약 입력은 합계 40만 자 이하이며 넘으면 원문을 조용히 잘라 보내지 않고 나누어 입력하도록 안내한다. 검증: `npm --prefix app/web run test:requirement-summary`, `app/.venv/bin/python -B -m pytest app/tests/test_requirement_summary.py -q`.

Storyboard 추천은 제안서 전체에서 이미 쓴 레이아웃을 제외한다. Layout Agent 자동 구성은 장표별 적합 후보를 덱 전체에서 중복 없이 배정하고, 적용 직전에도 현재 Storyboard와 대조한다. 후보 부족·동시 편집 충돌·같은 표 양식의 페이지 분할로 중복이 생기는 경우 내용을 버리거나 중복 장표를 넣지 않고 재시도를 안내한다. 전체 목록·My·찜에서 직접 고르는 경우 같은 레이아웃을 다시 사용할 수 있다. 검증은 `npm --prefix app/web run test:layout-uniqueness` 및 `app/.venv/bin/python -B -m pytest app/tests/test_layout_uniqueness.py -q`로 실행한다.

관리자 `[검토 예시]` 세 제안서는 레이아웃 개정 1에서 부록을 서로 다른 요구사항·실행·투자·근거 구성으로 바꾸고 실제 AI로 재검토했다. 대학 캠퍼스 예시는 19장 모두 다른 레이아웃이다. 수정하지 않은 이전 v5 예시·평가만 새 연결 쌍으로 교체하며, 사용자가 수정한 원본·평가와 당시 근거 문서는 보존한다.
이전 v3/v4/v5 히스토리에도 변경되지 않은 부록만 같은 방식으로 보정한다. 공유 서버에 저장된 `user:admin` 소유 예시도 기동 시 보정하고 리비전만 올리며, 공유 토큰·권한·사용자가 수정한 내용은 유지한다.

`admin`에는 제안서 검토 예시 3개(오토파츠 공장, 대학교병원, 베이커리 메뉴보드)도 한 번 추가한다. 원본 앱의 가상 제안서와 검토 의견을 가져왔으며 목록·상세·내보내기에 예시임을 표시한다. 상세 리포트와 장별 근거를 볼 수 있고, 기존 검토 기록을 덮어쓰거나 삭제한 예시를 재생성하지 않는다. `node app/tests/sample-reviews.mjs`로 초기화 계약을 확인한다.

기존 localStorage/IndexedDB 키와 데이터 형식을 유지한다. `/migration.html`에서 JSON/Blob을 백업·복원하며, 같은 ID는 갱신하고 다른 기존 기록은 유지한다. Claude origin의 개인 자료는 자동으로 복사하지 않는다.

Storyboard에서 이전 히스토리의 요구사항·제품 선택을 재사용하고, 읽기전용/편집가능 링크로 같은 원본을 함께 수정할 수 있다. 열람만 한 공유본은 히스토리에 넣지 않으며, 편집 저장 후 연결한다. **이 스토리보드 활용하기**는 별도 복사본을 만든다. 공유본은 서버 SQLite에 저장되므로 백업 시 `app/data/runtime/storyboards/`도 포함한다. 동기화·권한·참여자 식별·검증 방법은 [Storyboard 재사용·공유](../docs/storyboard-sharing.md)를 참조한다.

사용자 요청에 따라 `admin`에는 첫 접속 시 `[샘플]` 제안서 3개(카페 메뉴보드, 호텔 AI 스테이, 대학 강의실·도서관)를 넣는다. 기존 Best Scenario의 편집 가능한 복사본으로, AI 호출의 대체 응답이 아니다. 기존 기록과 샘플 수정 내용을 덮어쓰지 않고, 삭제한 샘플을 다시 만들지 않는다. 다른 계정에는 자동으로 넣지 않는다. 각 기기는 같은 초기 샘플을 받으며, Storyboard를 열어 공유본이 연결된 제안서는 서버의 같은 원본과 동기화한다. 히스토리 목록 자체는 각 브라우저에 보관한다.

외부 로그인·초기 로딩·샘플을 1500/900/390px와 장애 상황까지 검사하려면 `WINMATE_TEST_URL=https://배포주소 WINMATE_TEST_PASSWORD='현재 비밀번호' node app/tests/admin-history.mjs`를 실행한다. 검사는 격리된 브라우저를 쓰며 기존 사용자의 브라우저 자료를 수정하지 않는다. 결과는 `docs/migration/06-admin-history.md`에 기록했다.

긴 작업은 화면 이동과 새로고침 후 계속 확인할 수 있다. 실패/취소한 작업의 원문 재시도는 서버 메모리에서 한 시간 보관한다. 성공하면 원문 closure를 해제한다. 서버가 재시작되거나 자료가 만료된 긴 첨부는 재업로드가 필요하며 2만 자 excerpt로 조용히 다시 실행하지 않는다.

PoC의 max_slides는 필수 파트를 유지하는 장수 목표다. 초과하면 경고한다. 업로드 문서 검토는 텍스트/구조와, PDF가 제공된 경우 선택한 실제 화면 최대 4장을 비전으로 확인한다. 정확히 측정하지 못한 시각 항목과 확인 범위는 결과에 표시한다. RFP는 PDF/PPTX/DOCX/TXT/MD를 읽으며 PDF 원문 읽기는 래스터 렌더를 생략한다. HWP·스캔 OCR·DeepAgents copilot·Tavily 확장·복수 관리 계정은 제공하지 않는다. 기본 앱 구동에 LibreOffice는 필요하지 않다.

최신 변경과 기능별 테스트 결과는 `docs/migration/04-gemini-only.md`를 참조한다. 00~03 보고서는 더미 제거 전의 이전 단계 기록이다.
