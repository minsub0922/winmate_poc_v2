# 15. 웹앱 → 백엔드 분리 (계정 데이터 · 3D 조감도 서버 렌더 · 이미지 캐시 Redis)

작업일 2026-11-13. 목표: 부하가 큰 작업과 중요한 데이터는 서버로, 브라우저는 화면을 바로 그리기 위한 메모리 · 캐시만.
사용자 체감 성능(첫 화면 · 재방문 · 카드 미리보기)을 유지한다.

## 1. 무엇이 어디로 옮겨졌나

| 항목 | 이전 (브라우저만) | 이후 (서버 원본 + 브라우저 캐시) |
|---|---|---|
| 제안서 히스토리 | localStorage `winmate.v2.proposals` | `account_data.sqlite` 컬렉션 `proposals` |
| 검토 기록 / 검토 원본 문서 | `winmate.v2.reviews` / IndexedDB `winmate-v2-review` | `reviews` / `review-docs`(원본 페이지 이미지는 계정 파일) |
| 시뮬레이션 · 고객 프로필 · 찜 | `winmate.v2.sims` · `simPersonas` · `favs` | `simulations` · `personas` · `favorites` |
| 업로드 이미지 (`u:` 참조) | IndexedDB `winmate-v2/img` (data URL) | 계정 파일 `/api/account-data/blobs/<id>` |
| 첨부 전체 추출문 | IndexedDB `winmate-requirements` | `attachment-sources` |
| 건물 조감도 | IndexedDB `winmate-building` | `buildings` (IndexedDB는 계정 기록의 캐시) |
| 3D 조감도 카드 미리보기 | 카드마다 브라우저 WebGL 렌더(1600×1025 PNG) | 서버 headless Chromium 렌더 → WebP(960×615) · Redis/파일/HTTP 캐시 |

그대로 브라우저에 두는 것(캐시 · UI 상태): 화면 상태 `winmate.v2.ui`, 히스토리 고정/숨김, 링크 미리보기 캐시, 서버 작업 추적
(`winmate.v2.jobs` — 작업 자체는 이미 서버), 공유 초안 outbox, 건물 썸네일 · 고르기 창 캐시, 스튜디오의 실시간 3D 편집.
My 템플릿 · 공유 Storyboard · 공간 조감도 히스토리는 이전부터 서버 저장이었다.

## 2. 계정 데이터 (app/api/account_data.py · web/src/repositories/account-sync.js)

- 기록마다 서버 `revision`. 쓰기는 `base_revision`을 보내고, 어긋나면 **기록별 충돌**(나머지는 적용)로 현재 서버본을 돌려준다.
- 브라우저 → 서버 1회 이전(`mode: migrate`와 같은 규칙): 서버에 있는 기록 · 삭제 기록이 항상 이긴다 → 옛 브라우저가 최신 수정을 덮거나
  다른 곳의 삭제를 되살리지 못한다. 시드 샘플(결정적 ID)도 같은 규칙으로 부활하지 않는다.
- 삭제는 tombstone. 다른 브라우저가 다음 동기화 때 지운다.
- 변경 감지는 **저장소의 메모리 상태** 기준 — localStorage 용량 부족으로 잘린 기록은 서버에서 지워지지 않고, 다음 방문 때 서버에서 복원된다.
  세션 중 실제로 사라진 기록만 삭제하며, 전송 전에 대기 목록(`winmate.v2.sync.<컬렉션>`)에 먼저 적어 새로고침해도 잃지 않는다.
- 충돌: 다른 곳의 삭제 > 동기화 이력 없는 로컬 사본, 그 외에는 `updatedAt`이 최신인 쪽(병합하지 않고 교체).
- 부팅 순서(`main.jsx`): 로그인 정보 → **계정 기록으로 로컬 캐시 채우기** → 앱 모듈 로드. 캐시가 준비된 재방문은 기다리지 않고
  즉시 그린 뒤 백그라운드로 맞추며(저장소의 `apply()`로 화면 갱신), 처음 쓰는 브라우저만 최대 5초 기다린다.
- 업로드 이미지 · 검토 원본 · 첨부 원문은 첫 화면 이후 백그라운드로 이전한다. 공유 Storyboard에 넣는 이미지는 계정 파일 URL을
  데이터 URL로 바꿔 넣는다(공유 참여자는 다른 계정).
- 건물 조감도 모듈(src/building)은 아티팩트와 같게 묶이는 독립 모듈이라, 모듈 안에는 선택적 훅(`window.__wmBldStoreHook`)만 두고
  동기화는 `services/building-sync.js`가 한다. 훅이 없는 「HTML 추출」 파일은 예전처럼 동작한다. 이 IndexedDB는 계정별이 아니므로
  계정이 바뀌면 그 계정의 건물로 다시 채운다. (아티팩트 원본 `claude/building-birdseye-src.txt`에도 store.js 변경을 반영해야 한다.)
- 비로그인 · 인증 꺼짐(`WINMATE_AUTH=off`)에서는 동기화하지 않는다(이전과 같이 브라우저 저장).

API: `GET /api/account-data/<컬렉션>`(목록 · revision) · `POST …/<컬렉션>/fetch` · `POST …/<컬렉션>`(쓰기 · 삭제 · migrate) ·
`PUT/GET /api/account-data/blobs/<id>`(불변 · `private, immutable`) · `POST …/blobs/missing` · `GET …/usage`. 모두 로그인 필요,
계정별 격리, 다른 Origin의 쓰기 거부(기존 CSRF 규칙).

## 3. 3D 조감도 서버 렌더 (app/api/spatial_previews.py · app/scripts/spatial_render_worker.mjs)

- 렌더러: Node 워커 1개 + headless Chromium 페이지 N개(`WINMATE_SPATIAL_RENDER_CONCURRENCY`). 편집기와 같은 `render-three.js`를
  esbuild로 묶어 실행하므로 형상 · 조명 · 카메라가 같다. 라이브러리 JSON · 정적 자산은 디스크에서 요청 가로채기로 제공(포트 · 세션 불필요).
  Chromium은 Playwright 고정판 → 설치된 Chrome 순(`WINMATE_SPATIAL_RENDER_CHROME`로 지정 가능). 워커가 죽으면 다음 요청에서 재시작.
- 순서: Redis(L1) → 파일 `app/data/runtime/spatial-previews/<라이브러리 rev>/<장면 digest>-w960.webp`(L2) → 렌더. 같은 키는
  동시에 한 번만 렌더(single flight). 사용자 요청이 항상 사전 렌더보다 먼저다.
- 키는 서버가 계산한 정규화 장면 JSON의 SHA-256 — 클라이언트 `contentHash`를 믿지 않아 다른 내용이 같은 캐시를 쓰지 못한다.
- URL: 템플릿 `GET /api/spatial/templates/<id>/preview.webp?rev=<라이브러리 rev>`(비로그인 열람 허용, `public, immutable`),
  히스토리 `GET /api/spatial/history/<id>/preview.webp?v=<contentHash>`(본인만, `private, immutable`). ETag/304 지원.
- 시작 후 현재 라이브러리의 템플릿 683개를 백그라운드로 미리 렌더(`WINMATE_SPATIAL_PREWARM`, 측정: 장면당 약 0.2~1.6초).
- 렌더러를 못 쓰면 503 → 브라우저가 예전처럼 직접 그린다(30초 동안 서버를 다시 묻지 않음). 상태: `GET /api/spatial/previews/status`.

## 4. 이미지 캐시 Redis (app/api/image_cache.py · app/compose.cache.yml · app/scripts/cache_redis.sh)

- **캐시 전용 인스턴스**: `maxmemory` 기본 · 상한 **3gb**(더 큰 값은 3gb로 제한), `allkeys-lru`, 디스크 저장 없음, 항목 TTL 7일,
  항목당 최대 8MB. 서버가 시작할 때 `CONFIG SET`으로 적용 · 확인하고, 상한이 없거나 축출 정책이 아니면 **쓰지 않는다**.
- LLM 큐 Redis(`noeviction` · 영속)와 같은 인스턴스를 가리키면 거부한다(큐의 한도 기록이 지워지는 것을 막음).
- Redis 장애는 요청 실패가 아니라 캐시 미스: 15초 back-off 후 메모리 LRU(`WINMATE_CACHE_MEMORY_MAX_BYTES`, 256MB)로 동작.
  서버보다 늦게 띄운 Redis는 1분 안에 자동 연결한다.
- 설정의 단일 출처는 루트 `.env`(`WINMATE_CACHE_*`, 견본 `.env.example`). `bash app/scripts/cache_redis.sh install|up|down|status`
  (또는 `make cache-redis`)는 서버와 같은 해석 코드로 값을 읽어 Docker compose 또는 `redis-server`를 같은 옵션으로 띄운다.
- Redis 설치는 brew 없이 npm으로 한다: `install`(또는 Docker도 `redis-server`도 없을 때의 `up`)이 devDependency
  `redis-memory-server`로 `.env`의 `WINMATE_CACHE_REDIS_VERSION`(7.4.2) 소스를 받아 `app/data/runtime/redis-bin/<버전>/redis-server`로
  컴파일한다(약 40초, 한 번). macOS에서 Xcode 라이선스 미동의로 `make`가 막혀 있으면 Command Line Tools(`DEVELOPER_DIR`)로 빌드한다.
  일반 `npm install`은 컴파일하지 않는다(`package.json`의 `redisMemoryServer.disablePostinstall`). Docker는 같은 버전의 `redis:<버전>-alpine`.
  `./start.sh`는 `WINMATE_CACHE_BACKEND=redis`이면 함께 띄우고, 실패해도 메모리 캐시로 시작한다.

## 5. 검증

| 검사 | 결과 |
|---|---|
| `pytest app/tests` 전체 | **479 passed, skip 0** — npm으로 빌드한 Redis 7.4.2로 실 Redis 통합(3gb 상한 · LRU 축출, LLM 큐) 포함 |
| `test_image_cache.py` | 3gb 상한 · 정책 · LLM Redis 거부 · 장애 시 메모리 대체 · 늦은 Redis 연결 · .env 재현 |
| `test_spatial_previews.py` | 캐시→파일→렌더 순서, single flight, 서버 digest 키, 실패 비캐시, 사전 렌더, HTTP 캐시 헤더 · 권한, **실제 Chrome 워커 렌더 · 크래시 후 재시작** |
| `test_account_data.py` | revision 충돌, migrate가 수정 · 삭제를 덮지 않음, tombstone, 계정 격리, 크기 제한, blob 불변 · 백업 복원, HTTP 인증 · CSRF |
| `node --test app/tests/account-sync.mjs` (실제 API) | 이전 · 두 번째 브라우저 · 동시 수정 최신 우선 · 삭제 비부활 · 용량 부족 복원 · 오프라인 삭제 대기 · 문서/파일 |
| `app/tests/account-data-e2e.mjs` (격리 서버 + 실제 Chrome) | 11/11 — 루트 `.env`를 읽는 격리 서버(LLM: OpenRouter Qwen 연결 확인, 이미지 캐시: `.env`의 Redis 6380). 미리보기가 Redis에 7일 TTL로 저장됨을 확인 |
| 기존 UI: spatial-history-preview · template-catalog · library · people-layout · density · storyboard, building-birdseye · building-standard | 통과 (3D 미리보기 단언을 "서버 WebP 또는 렌더러 장애 시 브라우저 PNG"로 갱신) |
| `make test`(pytest + node 단위 전체, review-criteria 포함) | 통과 |

종단 측정(격리 서버, 로컬): 첫 로드 0.93s · 빈 캐시 두 번째 브라우저 첫 로드 0.80s(계정 기록 선채움 포함) · 템플릿 3D 미리보기
최초 4.4s(워커 기동 포함, 사전 렌더가 켜져 있으면 미리 준비됨) → 이후 4ms. 서버 렌더 WebP 약 17~34KB(브라우저 PNG data URL은 장당 수 MB).

## 6. 남은 항목

- 2D 조감도 평면(SVG)을 장표 칸에 적용하면 서버가 `data:image/svg+xml;charset=utf-8;base64,…`를 "지원하지 않는 이미지 형식"으로 거부하던 기존 버그를
  고쳤다(`my_templates.image_bytes`가 MIME 매개변수 허용, `test_image_data_urls_with_mime_parameters_are_accepted`).
- 건물 썸네일은 계정에 올리지 않는다(없으면 모듈이 다시 그림). 서버 작업 추적 기록(`winmate.v2.jobs`)도 브라우저에 남는다.
- 동기화는 기록 단위 최신 우선이다. 두 기기에서 같은 제안서를 동시에 고치면 늦게 저장한 쪽 전체가 남는다(공유 Storyboard는 기존 패치 병합 유지).


## 7. 전 탭 부하 점검 및 개선 (2026-11-17)

Storyboard·조감도 서버 계산에 이어 홈, 라이브러리, My, 찜, 목차 템플릿, 검토, 시뮬레이션, 공유·히스토리의 공통 경로를 점검했다. 화면 문구·구성, 저장 스키마, 검색 점수·순위, 관리자 구성의 파트·장표 순서는 유지한다.

| 경로 | 발견한 부담 | 적용한 개선 |
|---|---|---|
| 공통 시작·탭 이동 | 사용하지 않는 화면과 파일 처리기까지 즉시 로드 | 탭 화면을 지연 로드. 홈용 검토 진입부·시뮬레이션 아이콘을 분리. 문서 분석·PPTX 가져오기·PPTX 생성기는 사용 시 로드 |
| 관리자 검토 예시 | 일반 계정도 현재/이전 6개 대형 예시 데이터 파일을 파싱 | 관리자만 별도 데이터 청크 로드. 계정 캐시와 예시 준비 후 제안서→검토 저장소 초기화 순서 유지 |
| 라이브러리·My·찜·시트 선택 | 검색마다 문서 필드·검색 통계를 재구성, 렌더마다 개인 목록 직렬화 | 문서 목록과 검색 통계 재사용. My/찜 목록 교체 및 관리자 라이브러리 revision에 맞춰 폐기. 시나리오 흐름 이름 변경도 반영 |
| 시뮬레이션 | 스킬 진행 변경에도 대화·근거 전체 복제 | `changeRecord`로 변경 경로만 복제. 변경 없는 갱신은 알림·저장을 생략. 기록 JSON은 기존의 제한된 캐시 재사용 |
| 검토 | 진행 갱신 때 기록 전체 직렬화, 얕은 복사로 중첩 원본 변경 가능 | 동일한 변경 경로 복제 및 직렬화 캐시. 과거 기록·문서·평가 근거의 객체와 내용을 보존 |
| 공통 작업 알림 | 닫은 오류 카드가 입력 중 새 JSX와 함께 재등록 | 동일 오류는 닫힌 상태 유지. 메시지·상태·작업 ID가 바뀐 알림은 표시 |
| 검토 예시 이전 | 자동 URL·표지 갱신을 사용자 수정으로 오인 | 비교용 복사본에 같은 표지 갱신 적용. 사용자 표지·본문·평가 수정, 과거 근거, 삭제 기록은 보존 |
| 조감도·스튜디오·장표·내보내기 | 앞선 서버 계산·스냅샷 변경과 새 로딩 구조의 결합 | 같은 라이브러리 버전·장면·카메라 계약 유지. 장표 편집 및 PPTX 내보내기 재검증 |

측정은 로컬의 변경 전 소스 사본과 임시 빌드를 사용한다. 일반 계정의 시작 JS 정적 의존성은 압축 전 약 24.43MB→16.76MB(약 31% 감소). HTML·이미지·API 응답과 사용 시 로드하는 청크를 제외한 값이며 실제 전송량·전체 화면 지연을 뜻하지 않는다. 관리자 계정은 이전 예시 정합성을 위해 전용 데이터 청크를 추가로 읽는다.

계산 단독 측정에서는 약 8.9MB/240개 대화의 상태 갱신 60회가 94.5ms→17.0ms, 500개 문서 검색 30회가 964.3ms→2.3ms였다. 변경 전후 기록 내용과 검색 점수·순위가 같음을 함께 확인했다. 측정 환경과 캐시 재사용 조건에 따라 시간은 달라진다.

검증 경로: `tab-loading-ui.mjs`(배포용 빌드), `record-update.mjs`, `catalog-search.mjs`, `catalog-search-ui.mjs`, `sample-reviews.mjs`, `linked-review-examples.mjs`, `my-page.mjs`, `simulation-ui.mjs`, `simulation-skills-ui.mjs`, `requirement-attachments-ui.mjs`, `feedback-dismiss-ui.mjs`, `new-proposal.mjs`, `birdseye-sheet-ui.mjs`, `account-sync.mjs`. 결과와 파일 해시는 `app/tests/output/tab-performance/`에 기록한다. 임시 서버·브라우저 저장소로 검증하며 운영 앱 배포는 별도다.

### 추가 서버 전환 후보

| 우선순위 | 대상 | 유지해야 할 계약 |
|---|---|---|
| 1 | PPTX·PDF·DOCX 원문 분석 및 검토용 미리보기 생성 | 텍스트뿐 아니라 장 번호·숨김·주석·표·글꼴·좌표·원본 화면과 자산 참조를 동일하게 반환. 입력 파일 해시와 파서 버전으로 작업·캐시 구분 |
| 2 | 전체 레이아웃 HTML·변형 조각의 제공 및 준비 | 레이아웃 ID·슬롯 번호·관리자 revision·기존 히스토리·PPTX가 같은 원문을 사용. 현재 큰 공통 청크의 주요 잔여 원인 |
| 3 | 대형 PPTX 내보내기 | 편집 화면의 값·폰트·이미지·표·조감도 스냅샷을 같은 렌더 조건으로 보존. 작업 생성 후 다운로드하는 방식으로 전환 가능 |
| 4 | 대규모 개인 자료의 AI 검색 후보 추출 | 계정 권한·자료 버전·후보 ID·필터·정렬 동점 규칙 유지. 현재 키워드 검색은 캐시 후 즉시 처리하고 최종 AI 순위는 이미 서버 처리 |

이 후보들은 이번 변경에서 서버로 이전하지 않았다. 특히 검토 파일을 텍스트만 추출하는 서버 API로 바꾸면 도형·페이지 이미지·평가 근거가 달라지므로 동일 문서 모델을 만드는 별도 검증이 필요하다.

## 8. 템플릿·조감도 목록 탐색 최적화 (2026-11-18)

조감도 시작 메뉴는 목록을 열 때마다 `createScene`으로 각 템플릿의 가구·제품 배치를 브라우저에서 계산했다. 이제 기존 `GET /api/spatial/templates/{id}`에서 서버가 보관한 동일 장면을 읽는다. 요청에 자산 revision을 포함하고, 서버와 클라이언트 모두 일치 여부를 확인한다. revision이 붙은 응답만 장기 캐시하며 클라이언트는 라이브러리별 최대 48개 요청을 공유한다. 이전 서버·보관 버전의 404/503은 같은 revision을 지정한 기존 compute 경로를 사용하고, 검증 오류나 다른 버전의 응답은 대체 장면으로 바꾸지 않는다.

공간 템플릿 메뉴·공통 갤러리에 같은 로더를 적용했다. 유효한 3D 이미지가 있으면 사용하지 않을 2D SVG를 만들지 않는다. 이미지가 실패한 경우의 평면도와 보관 버전 처리는 유지한다. 스튜디오를 시작할 때의 form·scene 생성과 저장 계약은 그대로다.

시트 목록은 화면 근처에 도달할 때 썸네일의 너비 측정과 장표 생성을 시작한다. IntersectionObserver를 공유하고, 생성된 미리보기는 재사용하면서 `content-visibility`와 고정 크기 containment로 화면 밖 배치·그리기를 생략한다. 편집 가능한 장표에는 이 생략을 적용하지 않는다. 읽기 전용 이미지의 비동기 디코딩, hover 미리보기 상태의 독립 구독, 사이드바의 불필요한 문서 전체 geometry 읽기 제거도 적용했다. 공통 Slide/미리보기를 쓰는 시나리오·My·찜·Storyboard 선택 창에 함께 적용되며 새 UI는 추가하지 않았다.

배포용 빌드, 1500×1000, Chromium CPU 4배 제한에서 동일한 28회 스크롤·hover·메뉴 열기를 비교했다. 실제 카탈로그·레이아웃·이미지 파일을 사용하고 API 미리보기 이미지만 고정해 서버 렌더링 대기를 브라우저 계산 시간과 분리했다. 최종 연속 측정(`baseline-repeat.json` → `final-repeat.json`):

| 측정 | 변경 전 | 변경 후 |
|---|---:|---:|
| 시트 첫 탐색의 50ms 초과 작업 차단 시간 합 | 1,770ms | 851ms |
| 시트 첫 탐색의 가장 긴 작업 | 301ms | 130ms |
| 재탐색 프레임 간격 p95 | 16.7ms | 16.8ms |
| 조감도 템플릿 메뉴 JS 처리 | 2,684ms | 11ms |
| 조감도 템플릿 메뉴의 가장 긴 작업 | 2,443ms | 50ms 초과 작업 없음 |

이는 로컬 CPU 계측이며 네트워크·서버 이미지 생성·동시 실행 부하에 따라 시간은 달라진다. 전체 측정과 소스 해시는 `app/tests/output/browsing-performance/`에 기록한다. 생성된 썸네일 DOM을 매번 제거하는 방식은 재탐색 비용이 늘어 최종 구현에 채택하지 않았다.

정합성 검증: 1,562개 템플릿의 서버 장면과 기존 생성 결과 전체 일치(`spatial-scenes.mjs`), 서버 캐시·버전 API 16개 검사(`test_spatial_previews.py`), 데스크톱·모바일의 1,308개 오브젝트 그룹 끝까지 탐색, 키보드·느린 응답·수량별 hover 선택, 편집 중 텍스트, 검색·찜 미리보기, 히스토리 헤더·페이지·2D/3D·실패 복구, 오브젝트 추가·저장·재열기·undo/redo, Storyboard 조감도 편집 및 PPTX 내보내기를 확인했다. 브라우저 검사 77개에는 `browsing-regressions.mjs`, `layout-peek-ui.mjs`, `catalog-search-ui.mjs`, `layout-repeat-counts.mjs --ui`, `birdseye-home-ui.mjs`, `spatial-history-loading-ui.mjs`, `spatial-history-preview-ui.mjs`, `spatial-object-drawer-ui.mjs`, `birdseye-sheet-ui.mjs`, `customer-voice-ui.mjs`가 포함된다. 이 회귀 검사의 DB·서버·계정은 격리했다.

2026-11-18 사용자 배포 지시에 따라 로컬 운영 서버 `http://127.0.0.1:8788`에 적용했다. 앱·관리자 빌드와 최신 KB를 미리 준비하고 탭 검사 12개·서버 검사 16개를 통과한 뒤, 실행 중인 작업이 없는 상태에서 교체·재시작했다. 기존 빌드·KB는 롤백용으로 보관하고 열려 있는 탭의 이전 lazy chunk도 유지했다. 배포 후 인증·상품·실제 모델 응답 smoke 22개와 실제 서버의 빌드·조감도 revision·데스크톱/모바일 탐색 검사 7개를 통과했다. 브라우저 예외와 HTTP 5xx는 없었고, KB 원천 차이도 없으며 조감도 `sourceHash`는 `329c424f`로 유지됐다. 배포 manifest·로그·스크린샷은 `app/data/runtime/deployments/browsing-2026-11-18T01-32-51-057Z/`에 보관한다. 위 CPU 비교 수치는 배포 전 격리 측정 결과다.
