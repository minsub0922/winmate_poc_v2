# Winmate v2 · PPT 레이아웃 템플릿

Samsung B2B 제안서 에이전트(Winmate v2)의 **PPT 레이아웃 템플릿 라이브러리** 화면을 독립 실행되는 코드로 옮긴 저장소입니다.
제안서에 쓰는 1280×720 PPT 레이아웃 446장을 파트 유형별 · 원본 장표별로 둘러보고, 자유 문장 검색과 필터로 좁히고,
크게 보고, 한 장 또는 목록 전체를 편집 가능한 PPTX로 받을 수 있습니다.

원본 Winmate 앱의 같은 화면과 결과가 같도록 옮겼습니다(필터 22가지 조합의 개수 · 섹션 · 카드 순서, 레이아웃 미리보기 픽셀, PPTX 텍스트 · 도형 수를 나란히 비교해 확인).

## 바로 실행

```bash
git clone https://github.com/minsub0922/winmate_poc_v2.git
cd winmate_poc_v2
npm install
npm run dev        # http://localhost:5173
```

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 (수정하면 바로 반영) |
| `npm run build` | `dist/`에 배포용 정적 파일 생성 (상대 경로라 어느 경로에 올려도 동작) |
| `npm run preview` | 빌드 결과를 로컬에서 확인 |
| `npm run check` | 데이터 점검 — 레이아웃 HTML · 메타데이터 · 이미지가 서로 맞는지 (브라우저 불필요) |
| `npm run import-layouts -- <원본 앱 폴더>` | 원본 Winmate 앱에서 레이아웃 데이터를 다시 가져오기 (아래 참고) |

필요한 것: Node.js 18 이상 (`.nvmrc`는 20). 의존성은 React 18 · pptxgenjs · Vite 5뿐입니다.

### 사내망에서

- **npm 레지스트리**: 사내 미러를 쓰면 `npm config set registry <사내 레지스트리 주소>` 후 `npm install`. `package-lock.json`의 주소는 npm이 설정된 레지스트리로 바꿔서 받습니다.
- **글꼴**: 레이아웃은 Noto Sans KR · Manrope로 디자인됐고 `index.html`에서 Google Fonts로 불러옵니다. 외부망이 막혀 있으면 Apple SD Gothic Neo · Malgun Gothic으로 그려져 글자 폭이 조금 달라질 수 있습니다. 글꼴 파일을 사내에 두려면 `index.html`의 `<link>`를 사내 경로의 `@font-face`로 바꾸면 됩니다(글꼴 이름은 `'Noto Sans KR'`, `'Manrope'` 그대로).
- 빌드 결과(`dist/`)는 정적 파일이라 사내 웹 서버 아무 경로에나 올리면 됩니다. `file://`로 직접 열면 브라우저가 모듈 스크립트를 막으니 `npm run preview` 또는 웹 서버로 여세요.

## 디렉터리 구조

```
├─ index.html                     앱 진입 HTML (글꼴 · 아이콘)
├─ vite.config.js
├─ public/img/                    레이아웃 HTML · 썸네일이 쓰는 이미지 (빌드 때 dist/img로 복사)
├─ scripts/
│  ├─ import-layouts.mjs          원본 Winmate 앱 → src/data, public/img
│  └─ check-data.mjs              데이터 일관성 점검 (npm run check)
└─ src/
   ├─ main.jsx                    전역 스타일 + 앱 마운트
   ├─ app/App.jsx                 앱 껍데기: 레이아웃 HTML 로딩 화면 → 페이지 · 알림
   ├─ pages/
   │  └─ LayoutLibrary/           ★ PPT 레이아웃 템플릿 페이지
   │     ├─ LayoutLibraryPage.jsx   상태(필터 · 크게 보기 · 더 보기 · 내보내기)와 화면 조립
   │     ├─ LayoutLibraryPage.css   이 페이지 전용 스타일 (.tl-*)
   │     ├─ constants.js            구분 탭(PART_GROUPS) · 필터 옵션 · 기본 상태 · 최대 내보내기 장 수
   │     ├─ filtering.js            필터 통과 · 옵션별 개수 · 섹션 나누기 · 범위 이름 (순수 함수)
   │     ├─ useLayoutSearch.js      검색어 → 결과 목록 (점수 컷 · 코드/이름 정확 일치 우선)
   │     └─ components/
   │        ├─ LibraryHeader.jsx        제목
   │        ├─ LibraryToolbar.jsx       검색 · 구분 기준 · 구분 탭 · 파트 유형 칩 · 필터 4개 (상단 고정)
   │        ├─ ResultSummary.jsx        결과 요약 줄 · 빈 결과 안내
   │        ├─ LayoutSection.jsx        섹션 머리말 + 카드 격자 + 더 보기/접기
   │        ├─ LayoutCard.jsx           레이아웃 카드 (지연 렌더 미리보기 · 태그)
   │        ├─ TemplateDetailModal.jsx  크게 보기 (← → 이동 · 메타데이터 · 한 장 PPTX)
   │        └─ ExportListModal.jsx      지금 목록 PPTX로 받기 (파일 이름 · 진행률)
   ├─ components/                 여러 화면이 함께 쓰는 UI 요소
   │  ├─ common/                    Icon · Modal · Toast
   │  ├─ slide/                     Slide · FitSlide (레이아웃 HTML을 축소해 그리기) · overrides.js (값 덮어쓰기) · useWidth
   │  ├─ layout/                    LayoutMeta (메타데이터 표) · ProductChip
   │  └─ thumb/                     Thumb (제품 · 솔루션 사진 또는 SVG 일러스트)
   ├─ features/pptx/              레이아웃 DOM → 편집 가능한 PPTX (pptxgenjs) · 파일 저장
   ├─ lib/                        화면과 무관한 도메인 로직
   │  ├─ catalog.js                 카탈로그 (LAYOUTS · 업종 · 제품 · 솔루션 · 원본 장표 DECKS)
   │  ├─ layoutHtml.js              레이아웃 HTML 로딩 · 조회
   │  ├─ parts.js                   파트 유형 PARTS · 필요한 정보 REQ_LABEL · 검색어 → 파트 유형
   │  ├─ search.js                  BM25 검색 (영문 단어 + 한글 2글자 + 동의어)
   │  └─ uiPrefs.js                 화면 설정 저장 (localStorage)
   ├─ data/
   │  ├─ layouts/<id>.html          레이아웃 446장 — 한 장에 파일 하나
   │  ├─ layouts.js                 위 HTML 전체를 { id: html }로 묶음 (import.meta.glob)
   │  ├─ catalog.json               레이아웃 메타데이터 · 업종 · 제품 · 솔루션
   │  └─ images.json                썸네일 이미지 항목
   └─ styles/                     전역 스타일: tokens(색 · 다크 모드) · base · components · slide · thumb
```

## 데이터 형식

### 레이아웃 HTML (`src/data/layouts/<id>.html`)

- 루트는 `<div style="width: 1280px; height: 720px; position: relative; …">` 하나, 모든 스타일은 인라인입니다.
- 채워 넣을 텍스트 칸은 `data-tb="<번호>"`, 이미지 칸은 `data-img="<번호>"`(필요하면 `data-kind`, `data-hint`)로 표시돼 있습니다.
- 이미지는 `img/…` 상대 경로(`public/img`)를 씁니다.
- 화면은 이 HTML을 그대로 넣고 `transform: scale()`로 줄여 그립니다(`components/slide/Slide.jsx`). PPTX 내보내기는 같은 DOM을 측정해서 상자 · 선은 도형으로, 글자는 텍스트 상자로, 이미지 · SVG는 그림으로 옮깁니다(`features/pptx/exportPptx.js`).

### 메타데이터 (`src/data/catalog.json` → `layouts[]`)

| 필드 | 뜻 |
| --- | --- |
| `f` | 레이아웃 id (= HTML 파일 이름) |
| `c` | 원본 장표 (구분 2): `MI` · `VP` · `SS` · `SP` · `EX` · `CM` |
| `p`, `p2` | 파트 유형 (구분 1, `lib/parts.js` `PARTS` 키) · 보조 유형 |
| `name`, `when`, `g` | 이름 · 언제 쓰나 · 묶음(`"묶음 이름 — 설명"`) |
| `ind` | 업종 맞춤이면 업종 코드, 없으면 범용 |
| `sol`, `sols` | 전용 솔루션 · 들어간 솔루션 |
| `req` | 채우는 데 필요한 정보 (`REQ_LABEL` 키) |
| `nT`, `nI` | 텍스트 칸 · 이미지 칸 수 |
| `hl`, `sample`, `prods`, `txt` | 예시 제목 · 예시 고객 · 예시 제품 · 레이아웃 전체 텍스트(검색용) |

## 화면 동작 → 코드

| 동작 | 위치 |
| --- | --- |
| 파트 유형별 6묶음 / 원본 장표별 보기 | `constants.js` `PART_GROUPS`, `lib/catalog.js` `DECKS`, `filtering.js` `buildSections` |
| 자유 문장 검색 (관련도순) | `lib/search.js` `searchLayouts` → `useLayoutSearch.js` (1위 점수의 30% 이상 + 코드/이름 정확 일치 우선) |
| 필터 옵션 옆 개수 | `filtering.js` `facetCounts` — 각 필터는 자기 자신을 뺀 나머지 조건으로 센다 |
| 섹션마다 처음 두 줄만 · 더 보기 | `LayoutLibraryPage.jsx` `cap`, `LayoutSection.jsx` |
| 카드 미리보기 지연 렌더 | `Slide.jsx` `lazy` (IntersectionObserver) |
| 크게 보기 · ← → 이동 | `TemplateDetailModal.jsx` |
| PPTX 받기 (한 장 · 목록 최대 120장) | `features/pptx` · `ExportListModal.jsx` · `constants.js` `MAX_EXPORT` |
| 필터 상태 기억 | `lib/uiPrefs.js` (`localStorage` 키 `winmate.v2.ui`의 `lib`) |
| 다크 모드 | `styles/tokens.css` (OS 설정 또는 `<html data-theme="dark">`) |

## 레이아웃 데이터 갱신

레이아웃의 원본은 Winmate v2 앱(`data/layouts.b64` · `data/catalog.json` · `data/images.json` · `img/`)입니다. 원본이 바뀌면:

```bash
npm run import-layouts -- /path/to/winmate-v2   # src/data · public/img 다시 쓰기
npm run check                                   # 레이아웃 · 메타데이터 · 이미지 점검
```

원본 앱 파일과의 대응: `src/ui/library.jsx` → `pages/LayoutLibrary/*`, `src/ui/tplkit.jsx` → `TemplateDetailModal.jsx` · `lib/catalog.js` `DECKS` · `features/pptx/saveBlob.js`,
`src/ui/common.jsx` → `components/common/*` · `components/layout/LayoutMeta.jsx`, `src/slide.jsx` → `components/slide/*`, `src/pptx.js` → `features/pptx/exportPptx.js`,
`src/search.js` → `lib/search.js`, `src/thumbs.jsx` → `components/thumb/Thumb.jsx`(제품 · 솔루션 부분).

## 코드 에이전트용 안내

- 페이지 진입점은 `src/pages/LayoutLibrary/LayoutLibraryPage.jsx`, 레이아웃 디자인 자체는 `src/data/layouts/*.html`입니다. 디자인을 읽거나 고칠 때는 HTML 파일을, 분류 · 검색에 쓰는 정보는 `catalog.json`을 보면 됩니다.
- 레이아웃 HTML을 고친 뒤에는 `npm run check`로 `nT`(텍스트 칸 수) · `nI`(이미지 칸 수) · 이미지 경로가 메타데이터와 맞는지 확인하세요.
- 필터 · 섹션 로직은 `filtering.js`에 순수 함수로 모여 있어 화면 없이 테스트할 수 있습니다.
- `components/slide/overrides.js`의 `applyOverrides`는 이후 제안서 화면(값 채우기)을 옮길 때 그대로 씁니다.
