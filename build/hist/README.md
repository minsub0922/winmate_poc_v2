# build/hist — 히스토리 예시 기승전결 개편 (2026-10-19)

사이드바 히스토리 예시 16건(F1~F8 · P1~P5 · S1 · A 커피 · E 오피스)의 Storyboard 를
기(맥락) → 승(문제 · 원인) → 전(가치 · 장면 · 구성 · 근거) → 결(효과 · 실행 · 결정) 순서로 다시 짜고,
파트마다 사진 중심 레이아웃을 2~3장 넣은 작업 폴더입니다.

## 흐름
1. `PLAN.md` — 케이스별 기승전결 설계(파트 · 레이아웃 · 상태)
2. `brief.py` → `briefs/<id>.md` · `ledger/<id>.json` — 케이스마다 쓸 수 있는 숫자와 출처
3. `out/<id>.json` — 채운 결과(파트 · 장 · 글 · 사진 · 추가 수치 `ledger`). 규칙은 `GUIDE.md`
4. 점검
   - `node build/hist/check.mjs <id> [--shots]` — 파트당 2~3장 · 기승전결 순서 · 넘침/잘림/겹침 · 다른 고객 이름 · 예시 글 남김 · 대장 밖 숫자 · 같은 사진(dHash)
   - `python3 build/hist/dupcheck.py <id>` — 잘라 쓴 같은 사진(SIFT)
   - 감사 기준: `AUDIT.md`(1차) · `REAUDIT.md`(2차, 중대 문제만)
   - 한 칸만 고칠 때: `python3 build/hist/apply_fix.py <id> '[[kk, "t"|"img", key, value], ...]'`
5. 합치기 — `node build/bs/mkharness.mjs && node build/hist/units.mjs && python3 build/hist/merge.py`
   - `src/seeds_cases.json`(케이스 parts) · `src/seeds_parts.json`(A · E parts) · `img/fill/h1-*.json`(새 사진 묶음) · `src/fill_sources.md` 10차 표
   - 근거(ev)는 글 단위마다 가장 맞는 1개, 사진 단위는 근거 없이(‘직접 고름’) — index.html 16MB 한도 때문
6. 최신 트리에 덧대기(여러 번 돌려도 같은 결과): `store_patch.py`(SEEDV 4 · 손대지 않은 예시만 교체) · `tests_patch.py .` · `readme_patch.py` · `sources_update.py`

## 사진
`newimg/` — samsung.com 등에서 가져와 자르기 · 크기 조정만 한 사진과 출처(.json). 합치기 때 `img/fill/h1-*.json` 으로 묶입니다.
가명 고객의 장에는 실존 기업 · 브랜드 · 시설 이름과 로고가 보이지 않게 했습니다(사례 장 제외).
