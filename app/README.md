# Winmate v2 로컬 앱

고정 라이브 아티팩트의 UI·슬라이드 엔진을 옮긴 React/FastAPI 앱이다. **AI 기능은 모두 실제 Gemini만 사용한다.** 더미 모드, 규칙으로 만든 AI 응답·점수, 자동 예시 히스토리 주입을 제거했다. 모델이 실패하면 오류와 재시도를 표시하고 사용자 입력은 유지한다.

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

로그아웃은 `/account.html`. 기본 바인딩은 127.0.0.1, 세션은 HttpOnly/SameSite=Strict 쿠키·12시간이다. API 키는 서버만 읽으며 프런트·Git에 포함하지 않는다. 원본 `src/`, `dist/`, `poc/`, `proddb/`는 수정하지 않는다.

필수 입력은 제공된 `poc/test/`, `proddb/winmate_products.sqlite`, `reference/live/`, `app/data/`다. 시작 명령이 패키지 설치, 웹 빌드, 읽기 전용 SQLite snapshot, 정본 Agent KB, 데이터 점검, 계정 준비를 수행한다. 없거나 손상된 입력은 경로와 함께 오류로 안내한다. health가 준비되기 전에 **실제 Gemini 연결 확인**도 수행하며 실패하면 기동하지 않는다.

## Cloudflare 외부 접속

`./start.sh`로 앱을 실행한 상태에서 별도 터미널에서 `make tunnel`을 실행하면 Cloudflare Quick Tunnel의 HTTPS 주소가 출력된다. `cloudflared`가 설치되어 있어야 하며, `WINMATE_API_PORT`는 앱과 동일하게 설정한다. 스크립트는 로그인 계정이 설정되어 있고 인증이 켜진 앱만 연결한다. 비밀번호와 Gemini 키는 터널 설정이나 URL에 넣지 않는다.

이 방식은 이 컴퓨터에서 실행하는 단일 사용자 앱을 외부로 연결한다. 컴퓨터·앱·터널이 계속 실행되어야 하며, 터널을 새로 실행하면 주소가 달라진다. Cloudflare 계정·고정 도메인·항상 켜진 서버에 대한 상시 배포는 아직 구성하지 않았다. 브라우저 저장소는 주소별로 분리되므로 localhost의 기존 제안서는 `/migration.html`에서 백업하고 외부 주소의 같은 페이지에서 복원한다.

배포 주소 검증: `app/.venv/bin/python -B app/scripts/smoke.py --base https://출력된주소.trycloudflare.com --prompt`. 로그인·쿠키·카탈로그·실제 Gemini 호출과 로그아웃을 검사한다. 자세한 배포 결과는 `docs/migration/05-cloudflare.md`에 기록한다.

## Gemini 설정

설정 우선순위는 실행 환경 > app/.env > poc/.env. app/.env.example을 참고한다. 실제 키 값은 커밋하지 않는다.

| 변수 | 기본값·의미 |
|---|---|
| GEMINI_API_KEY | 필수. app/.env에서 없으면 기존 poc/.env 사용 |
| GEMINI_MODEL | gemini-3.1-flash-lite |
| GEMINI_QUICK_MODEL | GEMINI_MODEL과 동일 |
| GEMINI_VISION_MODEL | gemini-3.8-flash, 이미지 입력 전용 |
| GEMINI_BASE_URL | Google 공식 v1beta endpoint, 필요 시 HTTPS 게이트웨이 |
| WINMATE_GEMINI_TIMEOUT | 60초, 재시도·대기를 포함한 한 모델 호출 시간 한도 |
| WINMATE_GEMINI_RPM | 120, 계정 quota에 맞게 조정 |
| WINMATE_GEMINI_CONCURRENCY | 4, 서버 전체 요청 동시성 상한 |
| WINMATE_LLM_CACHE | off. 켜면 실제 모델 응답만 서버 runtime에 저장 |
| WINMATE_KB_CACHE | off. 켜면 정본 레이아웃 색인 캐시 |

WINMATE_MODE/기능별 *_MODE는 더 이상 모드를 바꾸지 못한다. 과거 값은 경고와 함께 무시하며 항상 real이다. API의 offline:true, llm:false 요청은 422로 거절한다. 키 누락이나 모델 오류를 정상 결과로 대체하지 않는다. 구조화 응답의 형식 보정도 Gemini에 다시 요청하며 재시도에는 한도가 있다.

제품/솔루션/사례 DB 조회, 실제 문서 파싱, 슬라이드 좌표/렌더, PPTX 변환, 점수 집계, 검색 후보 추출 등은 실제 데이터에 대한 알고리즘이다. 이 계산들은 유지한다. AI 판단·작성·채점·대화·총평·의미 재정렬은 Gemini다. 검색은 BM25+TF-IDF 후보를 Gemini가 재정렬하며 동일 질의는 실제 응답 캐시와 병합으로 처리한다.

## 검증

```sh
uv pip install --python app/.venv/bin/python -r app/tests/requirements.txt
make test          # API·인증·실패 정책·provider·재시도·저장 계약, 모델 성공 응답을 흉내내지 않음
make test-live     # 격리된 API/Vite에서 기능 14개 × 10건 = 실제 Gemini 140건 (비전·사용자 선택 기준 포함)
```

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

## 저장·한계

기존 localStorage/IndexedDB 키와 데이터 형식을 유지한다. `/migration.html`에서 JSON/Blob을 백업·복원하며, 같은 ID는 갱신하고 다른 기존 기록은 유지한다. Claude origin의 개인 자료는 자동으로 복사하지 않는다. 과거 사용자 기록은 보존하되 새 예시 기록은 주입하지 않는다.

긴 작업은 화면 이동과 새로고침 후 계속 확인할 수 있다. 실패/취소한 작업의 원문 재시도는 서버 메모리에서 한 시간 보관한다. 성공하면 원문 closure를 해제한다. 서버가 재시작되거나 자료가 만료된 긴 첨부는 재업로드가 필요하며 2만 자 excerpt로 조용히 다시 실행하지 않는다.

PoC의 max_slides는 필수 파트를 유지하는 장수 목표다. 초과하면 경고한다. 업로드 문서 검토는 텍스트/구조와, PDF가 제공된 경우 선택한 실제 화면 최대 4장을 비전으로 확인한다. 정확히 측정하지 못한 시각 항목과 확인 범위는 결과에 표시한다. RFP는 PDF/PPTX/DOCX/TXT/MD를 읽으며 PDF 원문 읽기는 래스터 렌더를 생략한다. HWP·스캔 OCR·DeepAgents copilot·Tavily 확장·다중 사용자 인터넷 배포는 제공하지 않는다. 기본 앱 구동에 LibreOffice는 필요하지 않다.

최신 변경과 기능별 테스트 결과는 `docs/migration/04-gemini-only.md`를 참조한다. 00~03 보고서는 더미 제거 전의 이전 단계 기록이다.
