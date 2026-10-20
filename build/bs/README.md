# build/bs — Best Scenario 사진 중심 전환 (9차, 2026-10-17)

Best Scenario 21개 덱의 모든 장을 점검해, 글 · 표 위주 장을 사진 중심 레이아웃으로 바꾸고 그 칸에 맞게 다시 채운 작업의 도구 · 기록.

## 흐름
1. `node build/bs/mkharness.mjs` — 검사용 페이지 `dist/_h.html`(앱 코드 그대로 applyOverrides · fillOf · bgOfSlide). 게시에는 넣지 않음.
2. `node build/bs/audit.mjs <out.json> <shots dir>` — 전 장 점검(사진 비율 · 빈 사진 칸 · 글 넘침) + 스크린샷 → `python3 build/bs/sheet.py` 확인용 묶음.
3. `python3 build/bs/plan.py` — 장마다 바꿀 레이아웃(plan.json). 기본은 라이브러리 RETIRED 대체 사진 버전, 그 밖은 MANUAL · TWIN_SWAP, 그대로 두는 장은 KEEP(이유).
4. `node build/bs/newlayouts.mjs` → `pf_new.mjs` → `python3 build/bs/integrate_layouts.py` — 대체할 사진 레이아웃이 없던 장의 새 레이아웃(원래 글 칸 번호 유지 + 사진 칸) · src/photo_layouts.js · std_layouts.js · data.js RETIRED.
5. `node build/bs/dumpdata.mjs` · `node build/bs/slots.mjs --json build/bs/slots.json @list` · `python3 build/bs/catalog.py` · `python3 build/bs/brief.py` — 채우기 브리프(build/bs/briefs/)와 사진 라이브러리(build/bs/lib/).
6. 채우기: GUIDE.md 대로 시나리오마다 `build/bs/out/<id>.json` (+ notes.md). 새 samsung.com 사진: `caseimgs.py`(후보) · `addphoto.py`(가져오기 → build/bs/newimg).
7. `node build/bs/check.mjs <id> --shots` — 글 넘침 · 겹침 · 빈 칸 · 자리표시 · 다른 고객 이름 · 같은 사진 · 해상도 검사 + 확인용 묶음.
8. `python3 build/bs/merge.py` — out/*.json → src/scenarios.js(장 레이아웃) · src/scenario_fills.js(FILLS) · img/fill/r9-<id>.json(시나리오별 새 사진 묶음) · src/fill_sources.md(출처).
