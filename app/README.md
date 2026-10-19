# Winmate v2 로컬 앱

고정한 라이브 아티팩트의 UI·데이터·슬라이드 로직을 옮기는 작업이다. 원본 `src/`, `dist/`, `poc/`, `proddb/`는 수정하지 않는다. 현재 검증 중인 1단계의 AI는 더미이며 기존 규칙 대체 동작을 사용한다.

## 실행

프로젝트 루트에서:

```sh
./app/start.sh
```

Node 22와 Python 3.12 또는 uv가 필요하다. 첫 실행에는 패키지 설치를 위한 인터넷 연결이 필요하다. 앱 UI 폰트 130개와 기존 게시 이미지·PDF 라이브러리는 로컬에서 제공한다. 서버는 `127.0.0.1:8788`에만 바인딩한다. 포트는 `WINMATE_API_PORT`로 설정한다. 같은 브라우저라도 포트가 바뀌면 저장소가 달라진다.

필수 입력은 프로젝트의 `reference/live/`, `proddb/winmate_products.sqlite`, `app/data/`의 고정 JSON·레이아웃이다. 없으면 준비 단계에서 해당 파일 경로와 함께 종료한다. 기존 원본 DB는 읽기 전용으로 열어 `app/data/runtime/`에 별도 SQLite snapshot을 만들고, 고정 UI projection을 실제 SQLite 테이블로 저장한다. API는 그 테이블을 조회한다. 이 projection에는 큐레이션 문구·정렬·과거 이미지 pack 참조 등 원시 테이블에 없는 UI 계약이 명시적으로 포함되어 있다.

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
| `api/` | FastAPI 및 SQLite 제품 projection |
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
