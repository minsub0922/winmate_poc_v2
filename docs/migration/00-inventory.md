# Winmate v2 — 0단계 조사 보고서

조사일: **2026-10-19 (KST)**. 범위: 라이브 게시본 확보, 소스와의 차이, 데이터·입출력·화면·PoC 조사. **1단계 앱 구현은 시작하지 않았다.** 사용자 확인 후 진행한다.

**기준 시점 안내:** 본문의 초기 번들 비교는 16:47경 고정한 라이브와 `reference/source-build/`의 소스 사본에 대한 결과다. **17:10 이후 최종 검사에서 다른 작업에 의한 것으로 보이는 원본 변경을 감지했다.** 이 변경은 되돌리지 않고 새 사본도 빌드했다. 끝의 [동시 변경 부록](#11-최종-검사에서-감지한-동시-변경)을 함께 읽어야 현재 폴더와의 차이가 완전하다. 17:12경 재확인한 라이브 앱 스크립트는 처음 확보한 것과 여전히 같았다.

## 1. 결론과 기준 버전

- Claude의 **Winmate v2 → Export → ZIP**에서 게시 파일 **511개 / 189,962,328 bytes**를 받았다. ZIP 원본과 압축을 푼 파일 모두 로컬에 보관했다.
- 실행 중인 라이브의 앱 스크립트 SHA-256과 내려받은 스크립트가 일치한다. 표시되는 버전 번호는 확인되지 않아 번호를 추측하지 않았다. 게시 경로의 build 식별자는 `1792395876-88c9`다.
- 라이브의 **앱 JavaScript와 앱 CSS는 현재 `dist/index.html`과 바이트 단위로 동일**하다. HTML 전체는 Claude가 내보내면서 붙인 문서·viewport·기본 스타일 래퍼 때문에 다르다.
- 원본을 복사해 빌드하면 라이브와 다르다. 압축 변수명 차이를 제외한 JS 차이 **6곳**을 전부 분류했다. CSS 차이는 사이드바 너비, 점수 기준 팝업, 히스토리 간격이다. **추가로 발견한 데이터 차이는 `data/media.json`의 257개 말단 값**이다.
- 지시문에 있는 패치 중 링크 태그·제작자 의견, 아이콘 레일, 홈 히어로·시작 카드는 **이미 소스에 반영**되어 있다. 그러나 **DB 교체 가로 카드 패치는 확보한 라이브에도 없었다.** 실제로는 기존 제품 탐색기 모달이 열린다.
- 라이브의 media 인덱스와 게시 이미지 묶음이 일부 맞지 않는다. `img/media/t.json` 범위 오류가 실제 라이브 콘솔에서도 확인됐다. 회귀 기준을 보존하되 앱에서 이를 고칠지는 [확인 사항](open-questions.md#q02-media-인덱스와-게시-이미지-묶음-불일치)에 남겼다.
- 브라우저 저장소 키·형식의 호환성과 **다른 origin의 기존 데이터 자동 접근은 별개**다. `claudeusercontent.com` 저장소를 `127.0.0.1`이 직접 읽을 수는 없다.

핵심 근거:

| 자료 | 위치 |
|---|---|
| 게시 HTML 및 모든 게시 자산 | `reference/live/index.html`, `reference/live/img/`, `reference/live/lib/` |
| 원본 ZIP, 중복 커밋 제외 | `reference/live/published.zip` |
| 511개 파일 크기·CRC·SHA-256·로컬 대응 파일 | [export-manifest.json](../../reference/live/export-manifest.json) |
| 번들 비교 요약 및 해시 | [comparison-summary.json](evidence/comparison-summary.json) |
| JS의 6개 실제 변경 위치·대응 소스 | [semantic-change-hunks.json](evidence/semantic-change-hunks.json) |
| CSS 전체 차이 | [source-vs-live-css.diff](evidence/source-vs-live-css.diff) |
| media 데이터 차이 / 라이브 데이터 복원본 | [media-data-differences.json](evidence/media-data-differences.json), [live-media.json](evidence/live-media.json) |
| 라이브 화면·팝업의 DOM과 스크린샷 | [screens/](evidence/screens/) |
| 원본 조사 시작 시점 체크섬 | [original-files-before.json](evidence/original-files-before.json) |

기준 자료 커밋: **`c20eab6` — `[0단계] 라이브 아티팩트 511개 게시 파일과 해시 보관`**. ZIP 원본은 크기 중복을 피하려고 Git에서 제외했으며, 압축을 푼 511개는 모두 커밋했다.

### 확보 방법과 한계

일반 텍스트 웹 열기로는 본문을 확보할 수 없어, 로그인된 Chrome의 실제 아티팩트에서 공식 ZIP 내보내기를 사용했다. 첫 DOM 기반 클릭은 다운로드로 이어지지 않았고, 네이티브 접근성 버튼으로 다시 실행한 뒤 다운로드 완료 파일을 확인했다. 웹 페이지를 DOM으로 재저장한 파일이나 로컬 `dist/`를 라이브인 것처럼 복사하지 않았다.

`export-manifest.json`에는 다운로드 시각, ZIP 해시, 런타임 스크립트 일치 여부가 있다. 라이브가 이후 갱신되더라도 이 디렉터리는 이번 조사의 고정 기준이다. 승인 후 기준을 새로 잡을 경우 별도 스냅샷으로 받아 비교해야 한다.

| 게시 파일 구성 | 개수 |
|---|---:|
| `index.html` | 1 |
| `lib/` — pdf.js, worker, 한국어 CMap | 3 |
| `img/` 바로 아래 | 30 |
| `img/bs/` | 223 |
| `img/ph/` | 168 |
| `img/fill/` | 42 |
| `img/prod/` | 19 |
| `img/cover/` | 17 |
| `img/bg/` | 5 |
| `img/media/` | 3 |
| **합계** | **511** |

외부 Google Fonts 등은 게시 ZIP의 511개에 포함되지 않는다. 오프라인 실행을 원하면 1단계에서 별도 자산으로 받아야 한다.

## 2. 원본 보호와 빌드 조사

작업 시작 시 Git은 **`main`, 커밋 0개, 기존 파일 전체 untracked**였다. 기존 작업을 초기화하거나 일괄 stage하지 않았다. 원본 `src/`, `dist/`, `poc/`, `proddb/`, `data/`, `img/`, `build/`를 조사용 체크섬 목록으로 기록했다. 키 파일·인증 파일·가상환경·캐시는 목록에서 제외했다.

실제 빌드 진입점은 루트 `build.mjs`가 아니라 **`build/build.mjs`**다. 다음 동작 때문에 원본 위치에서 실행하면 안 된다.

- `src/main.jsx`를 esbuild로 묶어 `dist/index.html`, `dist/preview.html`을 덮어쓴다.
- `dist/img/`를 재귀 삭제한 뒤 `img/`를 복사한다.
- `pdfjs-dist`의 라이브러리와 CMap을 `dist/lib/`에 복사한다.

따라서 `reference/source-build/`에 `src/`, `data/`, `img/`, `build/build.mjs`, `package.json`을 복사해 의존성을 설치하고 **복사본의 빌드만 실행**했다. 이 폴더는 재현용 로컬 작업 공간으로 Git에서 제외했다. 설치 버전·lock은 `evidence/node-dependencies.json`, `evidence/source-build-package-lock.json`에 보관했다.

| 비교 대상 | 크기 | 용도 |
|---|---:|---|
| 라이브 export `index.html` | 16,350,101 bytes | 정답 |
| 원본 `dist/index.html` | 16,349,555 bytes | 라이브 앱 JS·CSS와 정확히 동일 |
| 복사한 소스 빌드 `dist/index.html` | 16,327,506 bytes | 소스 누락 검출 |

레이아웃 gzip/base64 본문은 세 번들에서 동일하다. 원본 HTML 래퍼 차이, 압축 변수명 차이, 실제 로직·데이터 차이를 구분했다.

### 전체 번들 차이

JS를 esbuild로 읽기 좋게 펼치면 처음에는 472개의 diff 조각이 나온다. 상당수는 압축 식별자의 `E`/`T` 치환이다. Acorn AST에서 **짧은 어휘 식별자만 치환하고 객체 키·멤버 속성은 보존**하여 대조했다. 이후 남는 6곳은 다음과 같다. 이 정규화는 조사 도구에서만 수행했고 앱 코드는 바꾸지 않았다.

아래 JS 줄 번호는 `evidence/live.pretty.js`의 줄 번호다. 해당 중간 파일은 로컬에 남아 있고, Git에는 위치 목록과 집중 근거를 남긴다.

| ID | 라이브 위치 | 소스 대비 차이 | 1단계 흡수 대상 |
|---|---|---|---|
| J01 | JS 13047 | media 인덱스·솔루션 사진 설명/순서가 다름. **257개 값**, 솔루션 15개와 `L.0`, `L.2`에 걸침. 사례 레코드는 동일 | 새 `app/data`의 media 메타데이터, `mediapack` 서비스. 처리 방침 Q02 |
| J02 | JS 13262 | Icon 사전에 `notice: "M12 5v9.5 M12 19v.2"` 추가 | `src/ui/common.jsx`에 대응하는 아이콘 모듈 |
| J03 | JS 21054–21076 | `wmCritInfo` 컴포넌트 전체 추가 | `src/ui/review.jsx`의 점수 기준 팝업 컴포넌트 |
| J04 | JS 21078 | Report에 `wmCiO/wmCiS` 상태 추가 | 검토 보고서 페이지 |
| J05 | JS 21095 | 점수 링의 `검토 점수 기준 보기` 버튼 추가 | 검토 보고서 페이지 |
| J06 | JS 21115 | 팝업 조건부 렌더 추가 | 검토 보고서 페이지 |
| C01 | 앱 CSS 12 | `--sb-w: 252px` → **288px** | 디자인 토큰 |
| C02 | 앱 CSS 3192–3277 | `.wm-ci-*` 점수 기준 팝업 스타일 | 검토 스타일 |
| C03 | 앱 CSS 3279 이후 | `wm-sb-space`: 8px 간격, 38px 메뉴 행, 40px 히스토리 헤더, 패널·트리 선·푸터·hover 상태 | 사이드바 스타일 |
| H01 | HTML 문서 앞뒤 | Claude export의 doctype·charset·viewport·safe-area·기본 body/img 스타일, 닫는 태그 | 로컬 문서 셸에서 같은 효과 유지 |

`wmCritInfo` 원문은 [recovered-review-criteria.js](evidence/recovered-review-criteria.js)에 보관했다. 점수 규칙 54개 자체는 기존 `src/review/criteria.js`와 같다. 모달은 점수 계산 3단계, 영역별 가중치, 등급, 영역 필터, 기준별 설명 펼치기·접기, 미적용/해당 없음 표시를 제공한다. 실제 라이브에서 열기와 ‘제품 7’ 필터의 pressed 상태 변화를 확인했다.

### 지시문에 언급된 패치의 현재 상태

| 변경 | 현재 소스 | 확보한 라이브 | 판단 |
|---|---|---|---|
| 사이드바 간격·히스토리 패널 | 빠짐 | 있음 | 실제 로컬 스크립트는 `build/sb-space-patch.py`. C01/C03을 소스로 흡수 |
| 사이드바 접힌 아이콘 레일 | `src/ui/shell.jsx`, `src/styles.css:910` 이후에 있음 | 있음 | 다시 번들 패치할 필요 없음. 접힘 폭 65px, hover·키보드 focus 시 288px |
| 검토 점수 기준 팝업 | 빠짐 | 있음 | J02–J06/C02. 로컬 패치 스크립트 `build/sb/review-criteria-info-patch.py` |
| DB 항목 교체 가로 카드 | 없음 | **없음** | `wmDbFind`, `wmAlts`, `wmRail`, `wmSwapDb`, `.wm-rl*`, `.wm-db-*` 모두 0회. `dbswap-patch.py`도 폴더에서 발견 못 함. Q01 |
| 링크 태그 | 이미 있음 | 있음 | `src/linktag.js`, `src/ui/common.jsx` import·paste·read/render 세그먼트, `src/tags.css` |
| 제작자 의견 @/링크 태그 | 이미 있음 | 있음 | `requirements.jsx`의 `MentionEditor`, `noteSegs`, 문자열 `note` 동시 저장 |
| 홈 히어로·시작 카드·문구 | 이미 있음 | 있음 | `src/ui/shell.jsx`, `src/review.css:367` 이후. 라이브와 추가 diff 없음 |

**기존 제품 교체 기능이 없는 것은 아니다.** `LayoutDetail → QM55C 요소 선택 → 스마트 사이니지 QM55C — 다른 제품으로 바꾸기`로 **‘제품 바꾸기’ 모달**이 열린다. 전체 제품 1,068개, 폴더·검색·추천, 현재 제품 비활성 표시가 있다. 교체 계획은 `evidence.js`의 `planProductSwap`, 적용은 `detail.jsx`의 `doSwap`에 있다. 이번 조사는 탐색기를 여는 데까지 진행했고 기존 제안서의 제품을 실제 변경하지 않았다.

### 게시 이미지와 로컬 이미지

511개 각각을 로컬 대응 파일과 비교했다. **102개는 바이트가 같고**, HTML 1개와 이미지 408개는 달랐다. 이미지 408개(374 JPG, 34 PNG)는 sharp로 디코딩한 결과 **크기·픽셀이 모두 동일**했다. 로컬 파일에는 JPG당 5,771 bytes, PNG당 5,770 bytes가 더 있다. 이 추가 바이트의 의미까지 확인하지 않았으므로 메타데이터 종류를 추측하지 않았다. 앱의 기준 자산은 라이브에서 받은 바이트를 사용한다.

## 3. 데이터 구성과 로컬 API에서 지켜야 할 계약

실제 실행 자료를 묶어 계산한 개수는 [app-data-counts.json](evidence/app-data-counts.json)에 있다.

| 데이터 | 실제 값·위치 | 이전 시 유의사항 |
|---|---|---|
| 전체 레이아웃 메타 | 835개 | `catalog.layouts` 446 + photo/표준 메타. 레이아웃 HTML은 gzip/base64와 JS 모듈에 나뉨 |
| 템플릿 화면의 활성 레이아웃 | **594개** | retired 241개를 제외한 결과. 업종 기본 표지·My는 별도 등록. 과거 장표의 retired ID를 삭제하면 안 됨 |
| 업종 / 파트 | 16개 / 24종 + 자유 주제 | 표지 파트는 데이터에 남지만 Storyboard에서는 숨김 |
| Best Scenario | **22개** | `bs21` 호텔 표준, `bs22` 공유오피스 Lite가 앞에 있음. 각 덱의 구성·배경·채움 값은 `scenario_storyboard`, `scenario_fills`, `scenario_bg` 등으로 분리 |
| 제품 화면 목록 | **1,068개** | 큐레이션 40 + `products_db.products` 1,028. 사이트 602 + 카탈로그 426 + 큐레이션 40 |
| 제품 상세·사진 | `img/prod/` **19개** 묶음 | 상세 `dNN`, 썸네일 `tNN`, 갤러리 `gNN`. 로더가 가정한 주소와 묶음 번호 유지 |
| 솔루션 / 사례 | **17 / 218** | `catalog.json`의 정렬·문구를 유지. 사진은 media 묶음과 인덱스가 함께 있어야 함 |
| 채움 이미지 | `img/fill/*.json`, 42개 | `*.json#숫자` 주소, `hydrateFill`, `fillReady` 계약 유지 |
| 배경 / 옛 이미지 주소 | `img/bg/`, `legacy_img.js` | 예전 `img/bs/...`가 묶음 주소로 변환되기도 함. 일괄 경로 치환만으로 처리하면 안 됨 |
| PDF 읽기 | `lib/pdf.min.js`, `pdf.worker.min.js`, `pdf-cmaps-ko.js` | 게시본 3개 모두 보관. 글자 CMap도 로컬 경로로 제공 |

### SQLite

`proddb/winmate_products.sqlite`는 읽기 전용 연결로 조사했고 `PRAGMA quick_check = ok`다. 테이블·컬럼·행 수 전체는 [sqlite-schema.json](evidence/sqlite-schema.json)에 있다.

| 주요 테이블 | 행 수 |
|---|---:|
| category | 51 |
| product_family / product_model | 612 / 1,086 |
| family_category / product_tag | 619 / 1,210 |
| spec_value | 48,043 |
| feature_block / feature_item | 8,678 / 2,092 |
| image_asset | 11,835 |
| catalog_doc / catalog_page | 68 / 1,783 |
| catalog_mention | 4,290 |
| catalog_product / catalog_product_family | 803 / 532 |
| product_photo | 489 |

SQLite 테이블의 전체 행 수를 그대로 반환하면 화면의 1,068개와 일치하지 않는다. `proddb/build/export_app.py`는 큐레이션 모델 병합, 와일드카드·명칭뿐인 항목 제외, 제품군·사이트 분류 순서, 카탈로그 전용 분류 순서, 상세 묶음 번호를 계산한다. 일부 입력은 `data/catalog.json`, `raw/v1_wkb_pages_v2.json`, 사진 관련 sidecar다. **SQLite API는 이 projection을 재현하고 라이브 목록과 필드·순서 단위로 비교해야 한다.**

이 exporter는 import 시에도 DB를 열고 출력 파일을 쓴다. 0단계에서는 실행하거나 import하지 않고 읽기만 했다. 원본 `build_db.py`도 실행하지 않았다.

### media 불일치의 구체적 범위

정적 묶음 파일은 라이브와 로컬이 동일하지만 라이브 JS 안의 media 메타데이터는 로컬 `data/media.json`과 다르다.

| 메타데이터 | g0의 유효 범위 / 전체 | g1 | 썸네일 t |
|---|---:|---:|---:|
| 로컬 소스의 인덱스 | 1,251 / 1,251 | 1,052 / 1,052 | 235 / 235 |
| 라이브 번들의 인덱스 | **1,236 / 1,251** | 1,052 / 1,052 | **7 / 235** |

유효 범위 검사는 각 시작 위치·길이로 자른 문자열이 `data:image/...`이고 실제 JSON 문자열 경계와 일치하는지 본 것이다. 근거는 `source-media-range-check.json`, `live-media-range-check.json`이다. 변경된 솔루션은 `biot, care, coldchain, content, dex, hvac, knoxcapture, knoxsuite, lynk, partnerapp, sac, safety, smartthings, stpro, vxt` 15개다. 이것만으로 어느 게시 작업에서 어긋났는지까지 단정할 수는 없다.

## 4. 아티팩트 런타임·외부 호출

### 직접 `window.claude`를 호출하는 소스 3곳

| 호출 위치 | 사용 권한 / API | 소비 기능 | 로컬 어댑터 계약 |
|---|---|---|---|
| `src/ai.js:9` | `use('sample')`, `sample.json`, `sample.limits` | Storyboard, 파트 제안, AI 채우기, 재정렬, 첨부 요구 추출, 검토, 시뮬레이션 | JSON·텍스트 스트림·이미지 제한·AbortSignal·오류 코드. 현재 UI의 규칙 대체 흐름 보존 |
| `src/ui/viewer.jsx:131` | `use('downloads')`, `dl.save({filename,data:Blob})` | 제안서 PPTX, 검토 Markdown 보고서 | 브라우저 Blob 다운로드. 이미 runtime 부재 시 `<a download>` 대체 경로가 있음 |
| `src/ui/tplkit.jsx:27` | 같은 downloads API | 템플릿/Best/My의 PPTX 저장 | 위와 같은 다운로드 어댑터로 통합 |

시뮬레이션은 `getSample()`으로 얻은 **함수형 `sample(turns, options)`**도 호출한다(`src/sim/engine.js:271`). JSON 호출만 구현한 어댑터로는 충족되지 않는다. `sample.json` 옵션에는 `modelTier`, `cache`, `signal`, `onText`, `images`가 쓰인다. 사용 거절·권한 제거·비활성·호출 제한 등의 오류도 UI에서 구분한다.

런타임이 `downloads/sample/permissions/user`를 사용 가능 목록으로 표시하지만 앱 소스의 직접 사용은 위 3곳, **sample과 downloads 두 종류**다. 런타임의 `permissions`, `user` 선언을 앱이 실제 호출한 것으로 세지 않았다.

`window.__wmLink`, `__wmTag`, `__wmData`는 Claude 권한이 아닌 앱 내부 연결이다. 현재 링크 태그가 이 전역 객체들로 편집기·제품 데이터를 읽는다. 1단계에는 링크 태그 서비스와 편집기 어댑터로 옮기되 세그먼트 저장 형식은 유지해야 한다.

### 외부 네트워크·기기 API

호출 위치 목록: [io-call-sites.txt](evidence/io-call-sites.txt).

| 종류 | 위치·대상 | 현재 실제 동작 |
|---|---|---|
| 링크 메타데이터 | `linktag.js:83` → `https://api.microlink.io/?url=...` | 5초 제한. 실패하면 URL 추론. 캐시 최대 300개. URL을 외부 서비스로 전송하는 기능 |
| YouTube 링크 썸네일 | `linktag.js` → `i.ytimg.com/vi/.../mqdefault.jpg` | 링크 칩의 썸네일 이미지. 동영상 내용·자막을 읽는 기능은 아님 |
| 폰트 | `build/build.mjs`의 Google Fonts stylesheet, `fonts.gstatic.com` | Manrope 500/600/700/800, Noto Sans KR 400/500/600/700/800/900. 게시 HTML에서 실제 외부 로드 |
| 제품 상세 | `prodpack.js` → `img/prod/dNN.json` | 최초 상세 열기에 지연 로드, 모듈 캐시 |
| 이미지 묶음 | `bgpack.js`, `fillpack.js`, `mediapack.js` | JSON 전체 또는 HTTP Range. 서버가 Range를 무시해 200으로 응답하면 전체 묶음 대체 경로 |
| 사용자 이미지·내보내기 이미지 | `my/store.js`, `pptx.js`, `bgpack.js`의 `fetch(src)` | data/blob/상대 URL 또는 선택된 이미지 주소의 bytes 읽기. 외부 URL이면 CORS 영향 가능 |
| PDF 의존 스크립트 | `review/parse.js` | 로컬 `lib/`를 필요할 때 로드. worker와 CMap 포함 |
| 출처 링크 | Samsung, Samsung Knox/VXT, e-카탈로그, 공공 통계 등 | 대부분 사용자가 여는 참고 링크·사진 출처. 페이지를 자동 수집하는 백엔드는 없음 |
| 복사 | `detail.jsx:157` → `navigator.clipboard.writeText` | 실패 시 직접 복사를 안내. Claude runtime과 무관 |
| 파일 입력 | native file input / drop / `File.text`, JSZip, pdf.js | 파일 선택·읽기는 브라우저에서 실제 처리. 새 서버 업로드는 현재 구현되어 있지 않음 |

제품 PDP·e-카탈로그·사례의 외부 원본 주소는 참고 출처와 표시용 메타데이터에도 많다. 이를 전부 실행 중 `fetch`로 오인하지 않았다. **현재 웹 소스 추천은 링크 안내이며 웹 검색·수집을 실제 실행하지 않는다.**

## 5. 브라우저 저장소 계약

키 이름은 소스 전체 검색 후 라이브 번들에서도 대조했다([storage-name-presence.json](evidence/storage-name-presence.json)). 이 단계에서 사용자의 저장소 값을 별도 추출·복사하지 않았다. `sessionStorage` 호출은 발견되지 않았다.

### localStorage — 10개 키

| 키 | 형식·내용 | 갱신·마이그레이션 |
|---|---|---|
| `winmate.v2.proposals` | 제안서 배열. `id,title,customer,ind,createdAt,updatedAt,stage,reqTab,req,ctx,parts` 등 | 250ms debounce. 표지 정규화, 시드 추가 |
| `winmate.v2.ui` | UI 객체. `route`, `lib`, `bs` 등 | 라우트·템플릿/My/찜 필터·시나리오 필터. 옛 tab/by 형식도 읽음 |
| `winmate.v2.seedv` | 시드 버전 숫자의 문자열 | 현재 3. 초기 예시 3 + RFP 4 + 업종별 17 = 24개 |
| `winmate.v2.reviews` | 검토 기록 배열. 파일 메타·진행 상태·프로필·적용 기준·채점·집계·총평 | 최근 20개, 300ms. quota 시 오래된 결과를 줄임. 재로드된 running → interrupted |
| `winmate.v2.reviews.seedv` | 숫자 문자열 | 현재 1. 예시 검토 3개 |
| `winmate.v2.sims` | 시뮬레이션 배열. setup/profile/msg/trend/cur/debrief 등 | 최근 15개, 250ms. quota 시 기록 수 축소 |
| `winmate.v2.sims.seedv` | 숫자 문자열 | 현재 2 |
| `winmate.v2.simPersonas` | 직접 만든 고객 프로필 배열. `key,name,look` 등 | 최대 40개. 기본 고객과 구분 |
| `winmate.v2.favs` | `{id,f,ov\|null,filled,name,from,at}` 배열 | 빈 장표와 값 있는 장표를 별도 찜으로 구분 |
| `wm-linkmeta-v1` | URL 키 → `{title,site,img,ref,desc,...}` 캐시 객체 | 최대 300개, 오래된 삽입 항목부터 삭제 |

제안서 저장 형식의 중요한 하위 구조:

- `req.free`, `keymen[].reqs[]`, `form.noteSegs`: 세그먼트 `[{t}]`, `[{ref:"product:..."}]`, `[{t:url,link:{title,site,img,ref,...}}]`의 혼합.
- `form.note`: 문자열도 유지. `noteSegs`와 내용이 다르면 문자열을 표시하는 호환 처리 있음.
- `req.files[]`: `{id,name,size,type,text,memo}`. 지금 요구사항 첨부는 원본 bytes 자체를 저장하지 않고 읽은 본문·메모를 저장.
- `ctx`: `products[]`, `solutions[]`, `cases[]` ID 배열.
- `parts[]`: `{id,type,name,items,text,form,done,deck?,layouts[]}`. `deck:true`인 표지 파트는 앞에 두되 Storyboard 버블에는 안 보임.
- `layouts[]`: `{uid,f,status,ov,ev,...}`. `ov.t`, `ov.img`, `ov.r`, `ov.bg` 등과 요소별 근거를 유지. 이전에 쓰던 retired ID도 계속 그림.

### IndexedDB — 모두 version 1

| DB | object store | key / value |
|---|---|---|
| `winmate-v2` | `img` | out-of-line 업로드 이미지 ID → data URL 문자열. 제안서에서는 `u:<id>`로 참조 |
| `winmate-v2-review` | `docs` | 검토 ID → parsed document. units·text boxes·thumbnail·page image·문서 속성 등. `loadDoc`가 메모리와 DB, 예시 문서를 함께 조회 |
| `winmate-my` | `tpl` | `keyPath:"f"`, `{f,meta,html,imgs[]}`. HTML은 `wmimg:<id>` 토큰 사용 |
| `winmate-my` | `img` | out-of-line image ID → `Blob`. 매 실행 시 object URL로 복원하고 템플릿을 data registry에 등록 |

사진·제품 상세·배경·원본 layout HTML의 Map/Promise 캐시는 **세션 내 메모리 캐시**이며 새 영속 DB가 아니다. 검토 실행기·진행 중 AI도 대부분 모듈 메모리에 있어 페이지 전체를 새로 열면 그대로 계속 실행되지는 않는다.

**이전 계획:** Repository는 위 키·version·직렬화 형식을 그대로 유지한다. 기존 Claude origin의 데이터까지 옮길 때는 별도 export/import 절차가 필요하다. 로컬 앱의 포트 변경 역시 origin 변경이므로 데이터가 다른 곳에 있는 것처럼 보인다(Q03).

## 6. 화면·라우트·모달 목록

`main.jsx`의 라우팅은 URL 경로 라이브러리가 아닌 **`route.name` 상태와 `winmate.v2.ui.route`**다. 최상위는 다음 7개다.

| 라우트 | 화면·진입 | 소스 | 실제 라이브 확인 |
|---|---|---|---|
| `home` | 홈 히어로, 시작 카드, 검토 업로드, 최근 평가, 제안서 카드, 자산 개수 | `ui/shell.jsx` | 화면·스크린샷 |
| `proposal`, `id` | 제안서 작업대 / Storyboard. 새 제안서도 같은 화면의 요구 팝업으로 시작 | `ui/proposal.jsx`, `ui/storyboard.jsx` | 기존 A 커피 예시로 화면·팝업 확인. 새 기록 생성은 실행 안 함 |
| `library` | PPT 레이아웃 라이브러리 + My + 찜 | `ui/library.jsx`, `ui/mytpl.jsx` | 목록, 저장된 필터, My 빈 상태·업로드 버튼 |
| `scenarios` | Best Scenario 목록 | `ui/scenarios.jsx` | 22개 목록, 호텔 표준 상세 |
| `reviews` | 검토 업로드·평가 내역 목록 | `ui/review.jsx` | 예시 3개와 업로드 진입점 |
| `review`, `id` | 진행/중단/오류/완료 보고서 | `ui/review.jsx` | 예시 보고서·점수 기준 열기 및 필터 |
| `sim`, 선택적 `id` | 설정 또는 진행 중/완료 대화 | `ui/sim.jsx` | 설정, 기존 완료 예시의 대화·총평·평가 |

주요 하위 화면·팝업을 별도 회귀 대상으로 삼는다. V=이번 라이브에서 열어 확인, C=코드와 도달 경로 확인(새 파일 처리·LLM 호출·내용 변경은 미실행).

| ID | 화면·팝업 | 기능·상태 | 확인 |
|---|---|---|---|
| S01 | 사이드바·히스토리 | desktop 접힌 레일, hover/focus 확장, 모바일 메뉴·scrim | V / 모바일 행위는 C |
| S02 | 요구사항 `ReqPopup` | 첨부 상단, 자유형식/입력 폼, 키맨 가중치, 제작자 의견, 저장 | V |
| S03 | @ 메뉴·링크 태그 | 제품/솔루션/사례 탭, 키보드 선택, URL 붙여넣기·메타 캐시 | C. 기존 태그 문구와 편집기 확인 |
| S04 | 첨부 정보·덮어쓰기 확인 | 파일별 ! 정보, 메모·원문, 추출 결과 승인 | C |
| S05 | 제품·솔루션 매칭 `MatchPopup` | 업종 직접 입력/선택, 연결 타일, 추가/추천, 저장 | V |
| S06 | ContextExplorer 3종 | 제품 1,068, 솔루션 17, 사례 218. 경로·폴더·검색·선택 트레이·추천 | V. 제품은 교체 모드, 솔루션/사례는 추가 모드 |
| S07 | hover/클릭 상세 | 제품 모델·스펙·갤러리·출처, 솔루션·사례 사진 | C. 탐색기와 상세 참고 이미지의 도달 확인 |
| S08 | Storyboard | 확대·축소·reset, 파트 순서, 숨은 표지, shimmer·중단·버블 옆 팝업 | V / 새 AI·드래그 실행은 C |
| S09 | 파트 편집·새 파트 | 유형·이름 후보, 내용, AI 제안·추가 승인 | C |
| S10 | 레이아웃 추가 | 추천·검색·필터·찜, hover preview, 여러 장 선택 | C |
| S11 | PPT 전체 viewer / export | 표지 먼저인 deckOrder, 완료/all, 폰트·파일명·생성 진행·저장 | C. 실제 파일 생성은 1단계 E2E |
| S12 | `LayoutDetail` | 공통 SheetView, 인라인 글자, 요소/이미지 선택, 참고 자료·근거, 이전/다음·완료 | V |
| S13 | AI 채우기 확인 흐름 | 질문 보완 → 실행 → 변경안 diff·이미지 → 승인 적용 | C. runtime AI는 호출 안 함 |
| S14 | 기존 제품 교체 모달 | 요소 제품 버튼 → 폴더 탐색기 → 모델·문구·사진 교체 | V. 탐색기만 열고 실제 교체 안 함 |
| S15 | 이미지 팝오버·ImagePicker | 추천 이미지, 전체 라이브러리, 파일 교체, crop/fit·삭제 | C |
| S16 | 템플릿 필터·상세 | 파트·원본·업종·솔루션·제품·사진 필터, 큰 장표·원본 링크·PPTX·My로 편집 | V 목록 / 상세는 공통 SheetView를 통해 V |
| S17 | My·찜 | PPTX 업로드, 파일별 그룹, 이름·내용·파일명 검색, filled/빈 장표 별도 찜 | V 빈 상태 / 저장은 C |
| S18 | PPTX import / LayoutEditor | 변환·진행·장 선택·검토·저장, 객체·색·폰트·좌표·이미지 편집 | C. `my/pptx2html`, `geom`, `chart`, `presets` 실제 코드 |
| S19 | Best 필터·검색 | 요구 유형·전략·업종·솔루션·제품·결말, 관련도순 | V 목록 / 검색은 이전 접근 확인, 필터 내부는 C |
| S20 | Best 상세 Storyboard | 보기 전용 요구·매칭·파트, 전체 PPT, 활용 확인, 덱 다운로드 | V |
| S21 | Best 개별 장 SheetView | 채운 값·역할·다음/이전·찜·PPTX | V |
| S22 | 검토 진행·중단·오류 | 파싱→프로필→기준→그룹 채점→총평, 중단·재개 | C |
| S23 | 검토 완료 보고서 | 종합·영역·우선 수정·기준별 근거·장별 보기 | V |
| S24 | 점수 기준 `wmCritInfo` | 계산 방식·등급·54개 기준, 영역 필터·설명 펼치기 | V. 번들 전용 |
| S25 | 검토 장별 상세·재평가 | SheetView + 문제 패널, 적용 기준 조정·재평가·원본 재사용 | C |
| S26 | 시뮬레이션 요구 선택 | 예시·내 제안서·직접 입력, 제품·솔루션·사례 연결 | V 설정 / 입력 변경은 C |
| S27 | 고객 프로필·선택·편집 | 기본 6명, 맞춤 프로필, 난이도 3단계, 표정·외형 | V 설정 / 편집·저장은 C |
| S28 | 시뮬레이션 대화·평가·총평 | 스트림, 추천 답변, 숨은 우려, 만족도·품질·관련 덱, 제안서 시작 | V 기존 완료 예시 / 새 대화·LLM은 C |
| S29 | 시뮬레이션 속 ScenarioDetail | 참고할 기존 제안서의 상세는 목록 페이지의 Storyboard 상세와 다른 경로 | C. `sim.jsx:718` → `ScenarioDetail` |

`SufficiencyModal`와 `ContextCards`는 소스 정의만 있고 현재 호출처를 찾지 못했다. **현재 동작 화면으로 세지 않았다.** 반면 `ScenarioDetail`은 시뮬레이션에서 실제 참조하므로 제거 대상으로 분류하지 않았다.

스크린샷은 조사 시점 뷰포트의 관찰 증거이며 1단계의 전 화면·6조건 비교를 대신하지 않는다. 현재 브라우저에는 라이브러리의 ‘공간·제품’ 필터가 저장되어 있어 208장이 표시된다. 이를 기본 데이터 594개와 혼동하지 않아야 한다. 사이드바는 hover 시 본문 위로 확장되므로 회귀 촬영 시 포인터·focus 위치도 맞춰야 한다.

## 7. 기능별 현재 구현과 PoC 연결 가능성

‘실제’는 구현 경로를 뜻하며 이번에 유료 LLM을 전부 호출했다는 뜻은 아니다. **현재 아티팩트는 AI 전체가 더미인 앱이 아니다.** Claude sample 실호출과 실패 시 규칙 대체를 함께 갖고 있다. 로컬 runtime 부재 상태의 응답과 이미 만들어 둔 예시 데이터는 구분한다.

| 기능 | 현재 구현 | 대응 PoC / 코드 | 2단계 연결 가능 | 비고 |
|---|---|---|---|---|
| 새 제안서·폼·히스토리 | 실제 브라우저 CRUD | `store.js` | 유지 | LLM 불필요 |
| 키맨·제작자 의견 @ 태그 | 실제 DB 검색·세그먼트 저장 | `common.jsx`, `linktag.js` | 유지 | 링크 메타는 microlink 실제 호출 + 추론 대체 |
| 요구사항 첨부 | text 계열은 실제 읽기, 기타는 파일명·메모 중심 | `requirements.jsx` | 부분 | 지금 요구사항 첨부가 PDF/PPTX/DOCX를 본문 파싱한다고 간주하면 안 됨 |
| 첨부 → 폼 추출 | Claude JSON 실제 경로 + `heuristicExtract` 규칙 | `rfp_pipeline.run_pipeline`, `RunConfig`, `run_experiment.make_backend` | **가능** | testbench `adapters/rfp.py` 참고. text 입력·조각 읽기·rules/replay/Gemini |
| PDF/PPTX/DOCX RFP 원문 확보 | 요구 첨부에는 미구현, 검토에는 실제 파서 | `src/review/parse.js` | **추가 연결 필요** | RFP PoC 입력은 이미 추출된 문자열. 문서 parsing/OCR을 PoC가 해 주는 것은 아님 |
| 업종·제품·솔루션·사례 추천 | 앱 규칙·카탈로그 검색 | `search.js`, `ctxconfirm` | 가능 | PoC KB 제품은 현재 40개. 전체 1,068개 추천과 자동으로 같지 않음 |
| 레이아웃 검색 | **BM25·유의어·메타 가중치의 실제 로컬 검색** | `winmate_layout.retrieval.LayoutIndex`, `rank_slide`; testbench `layout.search` | **가능** | PoC는 BM25 + dense(TF-IDF / Gemini). 결과 순서가 달라지는 것은 2단계 변경 |
| 요구 맥락 판정·표준/Best 추천 | 앱 정적/규칙 흐름 | `winmate_layout.graph`: ingest/analyze/match_standard/match_best | **가능** | PoC 데이터 21개 시나리오와 현재 22개 간 차이 있음 |
| 요구 분해·전략 질문·재개 | 앱에 같은 LangGraph interrupt 흐름은 없음 | `build_graph`, `run_config`, `Command(resume=...)`; adapter `start/answer` | **가능** | 새 job·질문 상태의 UI 연결 필요. PoC 파일 수정 없이 인스턴스 사용 |
| 전략 코파일럿 | 본 앱 대응 경로 미연결 | `strategy_agent.StrategySession`, testbench `copilot/finalize` | 조건부 가능 | Gemini와 deepagents, 도구 호출 provider 호환 필요 |
| AI Storyboard 이어쓰기 | Claude JSON 스트림 + 업종별 기본 흐름 규칙 | Layout Agent plan / `storyboard_agent.sbagent.agent.design`, `to_app_parts` | **가능** | 후자는 기존 파트 유지·이어쓰기용으로 별도 PoC가 이미 있음 |
| 파트 내용 AI 제안·재정렬 | Claude JSON + 규칙 | `aiPart`, `aiReorder` | 부분 | PoC 전체 plan은 가능. 동일한 미세 편집 API는 별도 provider bridge 필요 |
| AI로 장표 선정·채우기 | Claude JSON + 근거·수치·제품 교체 규칙 | Layout Agent `design_part`, `fill_slide`, `tables`, `current_fills` | **가능** | `parts[].layouts[].ov.t/img` 변환. 단일 요소 재채움은 어댑터 설계 필요 |
| 슬라이드 HTML·overrides·인라인 편집 | 실제 DOM 렌더·저장 | `slide.jsx`, `evidence.js` | 그대로 유지 | 1280×720, `applyOverrides`, fixed text·사진·background 규칙 보존 |
| 제품 교체 | 실제 규칙 계획·텍스트·이미지 변경 | `planProductSwap`, `doSwap` | 유지 | 가로 카드 UI는 Q01. 현재 모달 경로는 실제 구현 |
| 이미지 추천·crop·파일 넣기 | 실제 태그/제품 기반 규칙·브라우저 처리 | `imagepick`, `fillpack`, `bgpack` | 유지 | 이미지 생성 모델 호출은 확인되지 않음 |
| PPTX 내보내기 | 실제 pptxgenjs DOM 변환 | `pptx.js` | 그대로 유지 | 비트맵 한 장 저장으로 대체하면 안 됨. 원본 font/rotation/flip/도형 등 유지 |
| My PPTX 복원·편집·저장 | 실제 OOXML 파싱·HTML/SVG 복원·IndexedDB | `my/pptx2html.js`, `geom`, `chart`, `presets`, `my/store` | 그대로 유지 | 디자인 개선과 무관한 독립 도메인으로 분리 |
| 찜 | 실제 localStorage | `my/favs.js` | 유지 | filled/빈 장 구분 |
| 검토 문서 파싱 | 실제 PPTX/PDF/DOCX/TXT | `review/parse.js` | 유지/bridge | PPTX+같은 PDF 쌍, CMap·worker, parser unit 모델 보존 |
| 검토 점수·총평 | Claude 4그룹 + 총평, 규칙 대체 | `proposal_score.pipeline.evaluate`, `Context`, `Backend.complete` | **가능, 변환 필요** | PoC는 기준 선별 후 1/2/3 → 0/50/100. 현재 0–100점과 같은 의미라고 표시하면 안 됨 |
| 업로드 문서 → PoC 평가 | 앱은 실제 parsed doc 보유 | `proposal_score.proposal.Proposal/Sheet` | **어댑터 필요** | PoC 저장 예시는 Best Scenario. 앱 doc geometry/font/image 정보를 Sheet로 변환해야 함 |
| Layout Agent 자체 검토·평가 | 본 앱과 별도 평가 | `winmate_layout.review`, `eval/` | **가능** | 제안서 54기준 점수와 별도 지표. 섞어 표시하지 않음 |
| 시뮬레이션 고객 대화·평가 | 실제 sample 함수 스트림 + 결정론 고객·점수 대체 | `src/sim/engine.js`; `sim_eval/engine/winmate_sim.mjs`, sample shim | **부분 가능** | Node 엔진 재사용 또는 API sample bridge. Python import만으로 실행되지 않음 |
| 시뮬레이션 배치 실성능 평가 | 본 앱에 배치 UI 없음 | `testbench/adapters/sim.py` → Node subprocess, JSONL | **가능** | 이 adapter는 배치 실행/파일 감시이며 대화형 턴 API는 아님 |
| 기존 샘플 제안서·평가·시뮬레이션 | 고정 예시/seed 데이터 | `seeds_*`, `review/seeds`, `sim/demo` | 유지 | 실제 고객이나 이번에 실행한 AI 결과로 표시하지 않음 |
| 서버 로그인·job 진행 | 아티팩트에는 자체 API 서버 없음 | testbench `core.py`, `server.py` | **재사용 패턴 가능** | PBKDF2·서명 쿠키·동시작업·로그·waiting. source 파일 경로 하드코딩 분리 필요 |

### PoC 통합 경계에서 이미 확인한 점

1. **데이터 시점이 다르다.** Layout PoC snapshot의 catalog 레이아웃 820개, 제품 40개, 시나리오 21개다. 앱은 전체 레이아웃 835/활성 594, 제품 1,068, 시나리오 22다. proposal_score도 21개 예시를 갖는다. README의 ‘레이아웃 446/시나리오 20’ 문구보다 실제 데이터가 더 최신이지만 라이브와 같지는 않다. PoC 원본은 그대로 두고 새 앱 쪽 데이터·KB 어댑터에서 다룰 필요가 있다.
2. **LLM 추상화가 현재 하나는 아니다.** RFP의 `Backend.complete`, Layout의 `LLM.structured/chat_model`, proposal_score의 `Backend.complete`, 시뮬레이션의 함수형 sample에 각각 중앙 provider bridge를 주입해야 한다. 기존 파일을 고치거나 모든 호출이 이미 공통이라는 가정은 하지 않는다.
3. **testbench의 core는 상대 import와 고정 경로가 있다.** `auth.json`, `.secret`, PoC 결과 폴더를 원본 위치에 쓰는 함수가 있으므로 새 API가 이를 그대로 import해서 인증을 초기화하면 원본 읽기 전용 조건을 위반할 수 있다. 로그인 알고리즘·job 구조를 새 API의 경로 설정으로 옮겨야 한다.
4. **job과 LangGraph checkpoint는 메모리다.** 같은 서버에서 탭 이동 후 조회·재개는 가능하지만 서버 재시작 내구성이 있다고 주장할 수 없다. 새 API에서 job ID와 로그 조회·interrupt 답변을 연결한다.
5. **외부 키는 서버 전용이다.** `poc/.env`의 `GEMINI_API_KEY`, `TAVILY_API_KEY` 존재만 확인했다. 키 값·인증 정보는 문서·프론트·출력에 넣지 않았다. 실제 Gemini/Tavily 호출은 0단계에서 하지 않았다.

## 8. 검증 결과와 기존 문제

### 실행한 검증

Python 환경이 작업 디렉터리에 따라 달라져 처음 RFP suite는 Python 3.9에서 `HTTPError(fp=None)` 처리 중 `KeyError:'file'` 1건이 났다. 이후 **분리된 Python 3.12.13 환경**을 만들고 같은 원본 테스트를 다시 실행하니 통과했다. PoC 코드는 수정하지 않았다. 해당 환경의 버전은 [python-dependencies.txt](evidence/python-dependencies.txt)에 고정 기록했다.

| 검증 | 결과 | 근거 |
|---|---|---|
| 공식 ZIP 확보·압축 해제·체크섬 | 511개 확보, 누락 0 | `reference/live/export-manifest.json` |
| 현재 runtime JS와 export JS | SHA-256 일치 | manifest `runtime_script_matches_export: true` |
| 라이브 vs 현재 dist 앱 JS·CSS | 각각 바이트 동일 | `comparison-summary.json` |
| 원본 복사본 esbuild 빌드 | 성공 | 원본 출력 폴더에 실행 안 함 |
| JS diff 전체 분류 | 472조각 → 압축 식별자 차이 정규화 후 6곳, 미분류 0 | `semantic-change-hunks.json` |
| CSS 비교 | 너비 1값 + 두 추가 블록 | `source-vs-live-css.diff` |
| 이미지 디코딩 비교 | 다른 해시 408개 모두 같은 픽셀 | `image-comparison.json` |
| SQLite quick_check·schema | ok / 16개 테이블 | `sqlite-schema.json` |
| RFP offline, Python 3.12 | **25 passed, 3 skipped** | `test-rfp-python312.log` (28 total) |
| Layout Agent, Python 3.12 | **57 passed** | `test-layout-baseline.log` |
| Storyboard Agent, Python 3.12 | **14 passed** | `test-storyboard-python312.log` |
| proposal_score, Python 3.12 | **19 passed, 1 skipped** | `test-score-python312.log` (20 total) |
| 라이브 조작 | 홈·My·예시 Storyboard·요구사항·매칭·제품 교체 탐색기·솔루션/사례 탐색기·Best·검토·점수 필터·시뮬레이션 예시 | `evidence/screens/` |

지원 환경에서 합계 **115 passed, 4 skipped**. skip은 외부 실호출 관련 테스트다. graph tests는 `WINMATE_LLM=offline`, `WINMATE_DENSE=tfidf`, pytest cache/bytecode 쓰기 비활성으로 원본 위치에서 실행했다.

`tools/verify-reference.py`로 511개 파일·ZIP·번들 지문·차이 목록을 다시 검증해 통과했다. PoC 원본 5,971개 파일의 해시도 초기와 일치했다. 원시 라이브 HTML에는 원문 데이터 안의 행끝 공백 등이 있어 Git whitespace 검사가 경고한다. 바이트 단위 기준을 보존하기 위해 이를 정리하지 않았다. 직접 작성한 문서·도구의 whitespace 검사는 별도로 수행한다.

### 이번 단계에서 완료했다고 주장하지 않는 것

- 1500/900/390px × light/dark 전체 스크린샷 비교, 새 앱 E2E, 새 앱 콘솔 0: **새 앱 구현 이후 1단계 검증**이다.
- 기존 `build/test*.mjs` **34개** 전체와 `build/my/fidelity.mjs`의 실행: 이번에는 테스트 경로·요건을 조사했다. 다수가 `/opt/pw-browsers/.../chrome-linux/chrome`을 고정 참조해 이 macOS에서 그대로는 실행되지 않는다. `soffice`, `pdftoppm`은 설치되어 있다. 1단계의 격리된 runner에서 경로·서버·출력 위치를 설정해야 한다. 이를 테스트 통과/제품 결함으로 오인해 기록하지 않는다.
- 실제 PPTX 내보내기·재업로드·My 복원 정확도, 문서 업로드 후 검토, 새 LLM 대화: 0단계에서는 실행하지 않았다.

### 기존 라이브 콘솔

관찰 로그 160개는 전부 warn이며, 그중 앱 frame 출처 **148개**에는 `TypeError: Failed to fetch` 147회와 **`Error: 범위가 맞지 않아요: img/media/t.json` 1회**가 있었다. 나머지는 Claude/브라우저 확장 관련 경고다. [live-app-console.json](evidence/live-app-console.json)에 앱 로그를 분리했다. fetch 실패 모두를 media 인덱스 문제라고 단정하지 않았다. 관찰 범위에서 error-level 로그는 없지만 이것이 전체 기능의 오류 없음 보증은 아니다.

## 9. 다음 단계의 구조·회귀 계획 — 아직 미구현

사용자가 제안한 `app/web` + `app/api` + `app/data` 구조를 그대로 기본안으로 삼는다. 조사 도구와 기준 파일은 `docs/migration/tools`, `reference/live`에 둔다.

| 경계 | 1단계 책임 |
|---|---|
| web/pages·components | 현재 7개 라우트와 팝업, 문구·조건·접힘/확대 상태 유지 |
| web/styles/tokens | 기존 CSS 변수 + 번들 누락 값. 장표 자체의 HTML/좌표/색을 기계적으로 토큰화해 변형하지 않음 |
| web/services·hooks | catalog/media 로딩·검색·진행 상태. 컴포넌트의 fetch/저장 직접 호출 분리 |
| web/repositories | 위 10개 localStorage 키와 IndexedDB 3개의 저장 계약, 기존 데이터 마이그레이션 |
| web/platform·api-client | sample/downloads·clipboard와 로컬 API의 어댑터. UI에서 `window.claude` 직접 사용 제거 |
| web/domain/slides | `applyOverrides`, layout registry, units/evidence, PPTX export/import/geom/chart를 보존·분리 |
| api | SQLite 제품 projection, 같은 정적 묶음, dummy provider. 다음 단계 PoC job/provider bridge를 붙일 경계 |
| app/data | 원본 데이터 읽기 또는 준비된 사본·메타데이터. Q02 결정을 명시적으로 적용 |

1단계에서는 patch 스크립트를 빌드 단계에 붙이지 않는다. 위 C/J 변경을 소스 모듈로 직접 흡수한 뒤 기준과 비교한다. UI 재디자인이나 PoC 파일 수정은 포함하지 않는다.

스크린샷 매트릭스는 **폭 1500, 900, 390px × light/dark**로, S01–S29 중 주요 화면·상태를 고정 fixture로 촬영한다. 제안 viewport 높이는 desktop/tablet 900px, mobile 844px다. font 로딩 완료, 고정 날짜·시드, 확대 100%, 동일 filter/My 상태, sidebar 밖의 포인터, 동일 mock capability를 맞춘다. 라이브 원격 페이지의 매번 달라지는 상태 대신 **`reference/live` 로컬 서빙본**과 새 앱을 비교한다.

E2E는 지시한 순서 전체를 유지한다: 새 제안서 → 요구사항/@·링크 → Storyboard → 추가·dummy 채우기 → 제품 교체 → PPTX → 검토 업로드 → My import·편집·저장. Q01에서 다른 게시본으로 기준이 바뀌면 해당 교체 UI 시나리오도 그에 맞춰 갱신한다.

## 10. 사용자 확인 후 진행할 사항

자세한 질문과 선택의 영향은 [open-questions.md](open-questions.md)에 정리했다. 가장 먼저 확인할 것은 **DB 교체 가로 카드가 있는 다른 최신 게시본인지**, **불일치하는 media 데이터를 앱에서 교정해도 되는지**, **기존 Claude 브라우저 데이터의 실제 이관을 포함할지**다.

이 보고서와 기준 자료의 커밋까지 완료한 뒤 멈춘다. **사용자의 1단계 진행 확인 전에는 `app/`을 생성하거나 구현하지 않는다.**

## 11. 최종 검사에서 감지한 동시 변경

이 작업이 쓰기를 수행한 위치는 `.gitignore`, `docs/migration/`, `reference/`뿐이다. 그럼에도 초기의 원본 파일 8,128개를 다시 대조했을 때 **14개 수정, 4개 누락**을 감지했고, 같은 조사 범위에 **새 파일 1,778개**가 추가되었다. 실제 파일·이전/이후 해시는 [concurrent-original-drift.json](evidence/concurrent-original-drift.json), 요약은 [concurrent-drift-summary.json](evidence/concurrent-drift-summary.json)에 있다. 정확한 변경 주체·이유를 임의로 단정하지 않았다. **원본이 그대로였다고 보고하지 않으며, 이 변경을 원복하지 않았다.**

새 시점의 `src/`, `data/`, `img/`를 **`reference/source-build-latest/`**에 다시 복사했다. 611개 입력 파일이 복사 시점의 원본과 일치하는지 확인한 후, 처음 설치한 것과 같은 node_modules로 빌드했다. 최신 폴더 사본 빌드도 성공했지만 라이브와 다르다.

| 사본 | 결과 |
|---|---|
| 초기 소스 빌드 | 16,327,506 bytes. 위에서 분류한 JS 6곳과 CSS 차이 |
| 말미의 소스 빌드 | **16,331,998 bytes**, SHA-256 `605f8a48aac3f712f2b2fec5aa12fae6f85d985e873da0544b4ec5facc4f4745` |
| 고정 라이브 export | 16,350,101 bytes. 실행 중 runtime JS 지문도 처음과 동일 |

새 입력의 체크섬은 `latest-source-snapshot.json`, 빌드 결과는 `latest-build-summary.json`이다. 이 사본에 초기 소스에 없던 변경은 다음과 같다. **현재 폴더를 무조건 빌드하면 라이브를 재현하지 못한다는 두 번째 근거**다.

| 변경 묶음 | 파일·내용 | 라이브 대비 처리 |
|---|---|---|
| 제품 이미지 라이브러리 로더 추가 | 새 `src/imglib.js`. `fetch('img/lib/index.json')`, BY-product 메모리 캐시, 종류·연결 제품·모델 기반 검색 | 고정 라이브에는 없음. 현재 폴더의 새 fetch 1개를 라이브 런타임 호출과 구분 |
| 이미지 선택기 확장 | `src/ui/imagepick.jsx`: `LibOpt`, `useLib`, `searchLib`, 관련 사진 36개 목록 | 라이브의 기존 picker와 다른 UI가 생김 |
| 제품 hover 갤러리 확장 | `src/ui/peek.jsx`: `useLibPhotos`, 관련 사진 최대 40개 추가 | 라이브에 없는 갤러리 증분 |
| 상세 편집 이미지 근거 확장 | `src/ui/detail.jsx`: `v.lib` 출처·URL 처리, picker에 연결 제품 IDs 전달 | Q01의 가로 카드 패치와는 다른 변경 |
| 새 선택기 CSS | `src/styles.css`: `.pk-libh` 2개 규칙 | 라이브 CSS에 없음 |
| 새 배포용 이미지 자산 | `img/lib/index.json`, `p00.json`, `p01.json` | 인덱스 **5,088개 사진**. 공식 export의 511개에는 없음 |
| 제품 pack 병합 | `data/products_db.json`, `img/prod/d00.json`, `g08.json`; `d01/d02/d03/g09`가 없어짐 | 제품 개수와 ID 순서는 같지만 pack 참조·본문이 달라짐. 라이브 사본은 옛 pack을 모두 보관 |
| 수집·DB·테스트 확장 | `proddb/build/*`, `schema.sql`, SQLite, README, `build/test-proddb.mjs`, 새 `test-imglib.mjs` | 초기 데이터와 현재 DB를 같은 버전이라고 가정하면 안 됨 |
| 원본 관련 이미지 자료 | `proddb/imglib/ecat/` 1,768개 + `proddb/imglib/index.json` | 이 작업에서 다운로드/생성한 파일이 아니며 커밋에 포함하지 않음 |

읽기 전용으로 다시 본 SQLite는 `quick_check=ok`, 기존 16개 테이블의 핵심 제품 행 수는 같고, `lib_image` 5,088개, `lib_image_product` 8,633개 및 FTS 테이블이 추가되었다. `meta`는 19→20개다. 근거는 `latest-sqlite-counts.json`이다.

초기→말미 소스 차이는 [concurrent-source-changes.diff](evidence/concurrent-source-changes.diff)에 **새 모듈 본문까지 포함**해 전부 보관했다. 제품 JSON의 필드별 차이도 [latest-product-data-differences.json](evidence/latest-product-data-differences.json)에 있다. 따라서 현재 폴더→고정 라이브 차이는 **본문의 초기 소스↔라이브 비교 + 이 소스/데이터 증분**을 함께 봐야 한다. 본문의 ‘JS 6곳, 미분류 0’은 초기 고정 사본에 대한 수치이며, 이후 압축된 전체 번들 diff가 여전히 6곳이라는 주장은 아니다.

PoC 원본에는 변경이 감지되지 않았으므로 위 115 passed 결과는 그대로 유효하다. 제품 pack 관련 JS 기존 테스트는 실행 전 조사만 했으므로 새 `test-imglib.mjs`를 포함하면 말미에는 35개가 된다.

**1단계에서는 라이브와 같은 초기 소스 사본을 출발점으로 삼는 것이 기본 제안**이다. 개발 중인 이미지 라이브러리를 묵시적으로 섞지 않는다. 이 변경도 기준에 넣으려면 Q06을 확인하고 새 게시본을 확보해야 한다.
