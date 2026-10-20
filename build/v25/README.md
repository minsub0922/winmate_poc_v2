# build/v25 — 표준 제안서 2025 버티컬 (bs23 AI 스토어 38장 · bs24 AI 오피스 38장 · bs25 AI 아파트 37장)

첨부 재현 명세 3개(‘[버티컬] 2025 AI 스토어 / AI 오피스 / AI 아파트 제안서’ — AI 스테이와 같은 디자인)를 Winmate 표준 제안서로 옮긴 도구 모음이에요.
작업 세션 경로(`/home/claude/v3`, 앱 소스 `/home/claude/w25`)가 파일 맨 위에 적혀 있으니, 다시 돌릴 때는 그 경로만 바꿔 주세요.

| 파일 | 하는 일 |
|---|---|
| `parse.py` · `dump.py` · `full.py` | 명세(markdown) → 장별 글 · 위치 · 사진 설명 JSON, 사람이 읽는 덤프, 장별 긴 글 전체 |
| `std.py` · `newlays.py` | 레이아웃 빌더(AIS v2 토큰: 머리말 · 제목 · 꼬리말 · 사진 칸 · 카드 · 아이콘)와 새 레이아웃 생성기 |
| `decks_new.py` · `build_new.py` | 새 레이아웃 17개(L_AST_* · L_AOF_* · L_AAP_* · L_STD_*) 정의 + 메타 → out/new_html_*.json · new_meta_*.json (`--final` 이면 사진 칸이 묶음 주소) |
| `slots.py` · `IMAGE_BRIEF.md` · `imgkit.py` | 덱별 사진 칸 목록(크기 · 원하는 장면 · 찾을 곳)과 이미지 수집 브리프 · 도구(samsung.com 받기 · 비율 자르기 · 투명 컷 · manifest) |
| `keys.py` | ‘@칸’ → 앱 주소(새 사진은 img/fill/v25.json#k, 재사용은 원래 주소) |
| `fills_st.py` · `fills_of.py` · `fills_ap.py` | 덱마다 장별 문구 · 사진(원본 명세 문구, 띄어쓰기만 바로잡음) |
| `resolve.py` · `preview.py` | 채움 → 앱 FILLS 형식(이름 칸 → 칸 번호), 미리보기 HTML |
| `scen_v25.py` | Best Scenario bs23–25 정의(scenarios.js) + STORY(scenario_story.js 키맨 · 파트) |
| `integrate.py` · `integrate_data.py` | 앱 소스에 넣기 — 묶음 img/fill/v25.json · std_layouts.js · data.js CANVAS.ST_V25 · tplkit DECKS · scenario_fills.js · scenarios.js · scenario_story.js · README · fill_sources.md (다시 돌려도 같은 결과) |
| `bundle_patch.py` | 이미 게시된 index.html 에 같은 데이터만 끼워 넣기(다른 세션이 게시본을 계속 고칠 때 덮어쓰지 않으려고) |
| `utf8pack.py` | 번들 JS 의 \uXXXX 이스케이프를 UTF-8 글자로(크기 −3MB, 뜻은 같음 — acorn AST 비교로 확인) |

검사: `node build/test-std-v25.mjs` — 표준 제안서 그룹 줄 · 38/38/37장 팝업 · 묶음 사진 · PPTX · 활용하기 · 쪽 번호.

## 게시할 때 (2026-10-19)
- 소스 빌드(`node build/build.mjs`) 뒤 다른 번들 패치까지 모두 적용한 다음, 마지막에 `python3 build/v25/utf8pack.py dist/index.html dist/index.html` — 이 덱들을 넣은 뒤 index.html 은 ASCII 이스케이프로 16MB 를 넘어요. utf8pack 은 문자열 · 정규식 안의 \uXXXX 를 같은 글자로 바꿀 뿐이라 동작은 같아요(`node build/v25/astequiv.mjs a.html b.html`, acorn 필요).
- 다른 세션이 게시본을 계속 고칠 때는 소스를 다시 빌드하지 말고, 지금 게시본에 데이터만 얹어요: `python3 build/v25/bundle_patch.py <게시본 index.html(skeleton 뗀 것)> <out.html>` → `utf8pack.py` → 게시(`img/fill/v25.json` 함께).
- 게시 파일 수 한도(511) 때문에 세 덱 사진은 `img/fill/v25.json` 묶음 하나(127장 · 8.9MB, 스토어 → 오피스 → 아파트 순).
