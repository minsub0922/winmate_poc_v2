# 건물 조감도 (사이드바 「건물 조감도 · 3D · BETA」)

라이브 아티팩트 Winmate v2 **Version 138**의 건물 조감도 탭을 옮긴 모듈이다(건물 템플릿 먼저 → 빈 층 → 층마다 공간 채우기 · 모양 유지 층 추가 · 층 간판 = 넣은 공간, 간판을 누르면 층 이름 바꾸기). 공간 조감도(업종별 한 층 3D)를 층으로 쌓아 건물 외관 · 층 내부를 보는 화면으로, 서버 없이 브라우저에서만 동작한다.

2026-11-11부터 삼성 B2B 버티컬 분류(`app/data/vertical_space_product.json` — 업종 → 버티컬(규모) → 공간 → 제품군)를 따른다. 버티컬 44개마다 그 버티컬의 공간을 모두 담은 **버티컬 건물 템플릿**이 있고, 이름은 `버티컬 (규모)`(규모가 이름에 들어 있으면 이름만), 고르면 층이 그 버티컬 공간 조합으로 **채워진 채로** 열린다(샘플 버티컬 시나리오 건물 템플릿 54개는 예전처럼 빈 층). 규모는 층 크기(소형 = 콤팩트 · 대형 = 와이드)와 층 수(상급종합병원 7층 · 대기업 사옥 7층 · 의원 1층 등)로 드러난다.

## 파일
| 파일 | 내용 |
|---|---|
| `index.js` | 모듈 진입점 `{ mount, data, ready, thumbnail, viewer, FACADES, PRESETS }` |
| `ui.js` | 목록 · 시작 창 · 스튜디오(외관/펼쳐 보기, 층 띠, 층 카드, 외벽 고르기 팝업, 내려받기 메뉴) |
| `render.js` | three.js 무대(층 쌓기 · 외벽 클릭 판정 · 외벽만 다시 짓기 · 강조 테두리) |
| `facade.js` · `mesh.js` · `lib3.js` | 외벽 64종(21개 업종 — 새 업종 스포츠 SF · 종교 RG · 방송 MB · 군 MI 각 3종) · 지붕 · 대지 · 테라스, 재질 · 형상, three 0.186.1 |
| `data.js` · `bake.b64` | 층 300개(gzip + base64) = 샘플 버티컬 시나리오 206 + 버티컬 층 94(`lay: 'vt'`, `vt` 버티컬 id · `vl` 이름 · `sign` 간판) — `#wm-bld-data`에서 풀어 씀 |
| `presets.js` · `presets-verticals.js` | 건물 템플릿 98 = 샘플 버티컬 시나리오 54 + 버티컬 44(생성 파일, 직접 고치지 않음) |
| `presets-standard.js` · `bake-standard.js` | 표준 건물 조감도 8(업종별 표준 제안서 중 공간 7개 이상 업종 — 공간 중복 없이 층마다 채운 건물) · 그 층 26개 데이터(gzip + base64, `data.js`가 기본 데이터 뒤에 붙임). 생성 파일 — `app/scripts/vertical_standard/` |
| `store.js` | IndexedDB `winmate-building`(예시 2개 포함) |
| `viewer.js` · `dom.js` | 「HTML 추출」 3D 보기 파일 · DOM 도우미 |
| `style.css` | 화면 CSS(`bd-` 접두사, 앱 토큰 사용) |

## 데이터 굽기
`node app/scripts/build_building_bake.mjs` — 현재 공간 조감도 라이브러리(`app/data/spatial/library.json`)를 같은 조립 엔진(`createScene`)으로 배치해 `bake.b64`와 `presets-verticals.js`를 다시 만든다.
- 샘플 버티컬 시나리오 층 206개는 지금 `bake.b64`에 적힌 공간 조합(전체 · 5 · 핵심 4 · 지원 4 · 혼합 4 · 확장 4 · 일자형 3 · 확장 6 · 복합 MX)을 그대로 다시 조립한다. `--check`는 다시 조립한 층이 지금 데이터와 같은지 비교한다(라이브러리 `733e40b9` 기준 198개 일치, 다른 8개는 제조 창고의 엑스커버를 받침 테이블 대신 책상 위에 놓도록 고친 배치 개선).
- 버티컬 층은 `app/data/spatial/vertical-layouts.json`의 `building.floors`(공간 id 목록, 같은 공간 반복 가능 — 객실층 · 병동층 · 교실층)를 그 버티컬 규모 크기로 조립하고, `building.stack`이 아래층부터의 층 순서다. 모든 공간이 한 번 이상 들어간다.
- 자산 · 레시피 표는 처음 쓰인 순서대로 번호를 매긴다. 사람은 bbox 높이 · 폭 + 옷 · 피부 · 머리 색만 남긴다.

## 앱에 붙는 방식 (아티팩트와 같음)
- `vite.config.js`의 `winmate-building` 플러그인이 `virtual:wm-building`으로 이 폴더를 **아티팩트와 같은 esbuild 설정**(IIFE · `__wmBldMod` · minify · charset utf8 · es2020 · legal comments 없음)으로 묶는다.
- `pages/BuildingPage.jsx`가 탭을 처음 열 때 `<style id="wm-bld-css">` · `<script id="wm-bld-data" type="text/plain" data-enc="gzip-base64">` · `<script id="wm-bld-js">window.__wmBldBoot=function(){…;return __wmBldMod};</script>`를 넣고 `mount(root, { go, toast })` → `route(id)`. 「HTML 추출」은 `#wm-bld-js` 원문을 그대로 담는다.
- 경로 `{ name: 'building' }` = 목록, `{ name: 'building', id }` = 스튜디오. 새로 고침하면 UI 상태(`loadUi().route`)에서 되살린다. 사이드바 버튼은 샘플 버티컬 시나리오 바로 아래.
- 고르기 창 썸네일 캐시 판 `CACHE_V`(`ui.js`)는 외관 · 데이터가 바뀌면 올린다(지금 `r6`).

## 고치기
- 이 폴더의 소스를 고치면 개발 서버 · `npm run build` 모두 다시 묶는다. 아티팩트와 맞추려면 같은 소스를 프로젝트 문서 `claude/building-birdseye-src.txt`에도 반영한다.
- 검사: 앱 실행 후 `node app/tests/building-birdseye-ui.mjs` (`npm --prefix app/web run test:building`) · `node app/tests/building-standard-ui.mjs`.

## 표준 건물 조감도 (2026-11-11)
- 시작 창 맨 위 「표준 건물 조감도」 묶음(건물 템플릿 98 — 샘플 버티컬 시나리오 54 · 버티컬 44 — 과 따로). 고르면 층마다 공간 · 층 이름이 **채워진 채로** 스튜디오가 열린다(샘플 버티컬 시나리오 건물 템플릿은 예전처럼 빈 층, 버티컬 건물 템플릿은 버티컬 층으로 채움). 버티컬 건물 템플릿과 달리 공간이 겹치지 않는다(한 공간 = 한 칸).
- 층 id `std-<버티컬>-<n>f` · `lay: 'std'` · `sign`(층 간판), 공간 id `<버티컬>-<n>f-s<공간 번호>`(버티컬 공간 순번). 층 크기는 24×7 · 16×7 · 24×15 · 16×15m라 같은 크기의 다른 층과 바꿔 끼울 수 있다.
- `bake.b64`는 그대로 두고 표준 층만 `bake-standard.js`에 따로 둔다 — 기본 데이터를 다시 구워도(다른 판) 같은 자산 id는 기본 표의 것을 쓰고 없는 자산 · 레시피만 더한다.
