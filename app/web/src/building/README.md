# 건물 조감도 (사이드바 「건물 조감도 · 3D · BETA」)

라이브 아티팩트 Winmate v2 **Version 138**의 건물 조감도 탭을 그대로 옮긴 모듈이다(건물 템플릿 먼저 → 빈 층 → 층마다 공간 채우기 · 모양 유지 층 추가 · 층 간판 = 넣은 공간, 간판을 누르면 층 이름 바꾸기). 공간 조감도(업종별 한 층 3D)를 층으로 쌓아 건물 외관 · 층 내부를 보는 화면으로, 서버 없이 브라우저에서만 동작한다.

## 파일
| 파일 | 내용 |
|---|---|
| `index.js` | 모듈 진입점 `{ mount, data, ready, thumbnail, viewer, FACADES, PRESETS }` |
| `ui.js` | 목록 · 시작 창 · 스튜디오(외관/펼쳐 보기, 층 띠, 층 카드, 외벽 고르기 팝업, 내려받기 메뉴) |
| `render.js` | three.js 무대(층 쌓기 · 외벽 클릭 판정 · 외벽만 다시 짓기 · 강조 테두리) |
| `facade.js` · `mesh.js` · `lib3.js` | 외벽 52종 · 지붕 · 대지 · 테라스, 재질 · 형상, three 0.186.1 |
| `data.js` · `bake.b64` | 공간 조감도 206개(gzip + base64) — `#wm-bld-data`에서 풀어 씀 |
| `store.js` · `presets.js` | IndexedDB `winmate-building`(예시 2개 포함) · 건물 템플릿 54 |
| `presets-standard.js` · `bake-standard.js` | 표준 건물 조감도 8(업종별 표준 제안서 중 공간 7개 이상 업종 — 공간 중복 없이 층마다 채운 건물) · 그 층 26개 데이터(gzip + base64, `data.js`가 기본 데이터 뒤에 붙임). 생성 파일 — `app/scripts/vertical_standard/` |
| `viewer.js` · `dom.js` | 「HTML 추출」 3D 보기 파일 · DOM 도우미 |
| `style.css` | 화면 CSS(`bd-` 접두사, 앱 토큰 사용) |

## 앱에 붙는 방식 (아티팩트와 같음)
- `vite.config.js`의 `winmate-building` 플러그인이 `virtual:wm-building`으로 이 폴더를 **아티팩트와 같은 esbuild 설정**(IIFE · `__wmBldMod` · minify · charset utf8 · es2020 · legal comments 없음)으로 묶는다. three · esbuild 버전이 같아 결과는 게시본 `#wm-bld-js`와 바이트 단위로 같다.
- `pages/BuildingPage.jsx`가 탭을 처음 열 때 `<style id="wm-bld-css">` · `<script id="wm-bld-data" type="text/plain" data-enc="gzip-base64">` · `<script id="wm-bld-js">window.__wmBldBoot=function(){…;return __wmBldMod};</script>`를 넣고 `mount(root, { go, toast })` → `route(id)`. 「HTML 추출」은 `#wm-bld-js` 원문을 그대로 담는다.
- 경로 `{ name: 'building' }` = 목록, `{ name: 'building', id }` = 스튜디오. 새로 고침하면 UI 상태(`loadUi().route`)에서 되살린다. 사이드바 버튼은 샘플 버티컬 시나리오 바로 아래.

## 고치기
- 이 폴더의 소스를 고치면 개발 서버 · `npm run build` 모두 다시 묶는다. 아티팩트와 맞추려면 같은 소스를 프로젝트 문서 `claude/building-birdseye-src.txt`에도 반영한다.
- 검사: 앱 실행 후 `node app/tests/building-birdseye-ui.mjs` (`npm --prefix app/web run test:building`).

## 표준 건물 조감도 (2026-11-11)
- 시작 창 맨 위 「표준 건물 조감도」 묶음(건물 템플릿 54와 따로). 고르면 층마다 공간 · 층 이름이 **채워진 채로** 스튜디오가 열린다(건물 템플릿은 예전처럼 빈 층).
- 층 id `std-<버티컬>-<n>f` · `lay: 'std'` · `sign`(층 간판), 공간 id `<버티컬>-<n>f-s<공간 번호>`(버티컬 공간 순번). 층 크기는 24×7 · 16×7 · 24×15 · 16×15m라 같은 크기의 다른 층과 바꿔 끼울 수 있다.
- `bake.b64`는 그대로 두고 표준 층만 `bake-standard.js`에 따로 둔다 — 기본 데이터를 다시 구워도(다른 판) 같은 자산 id는 기본 표의 것을 쓰고 없는 자산 · 레시피만 더한다.
