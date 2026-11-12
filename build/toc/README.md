# 목차 템플릿 빌더

사이드바 **목차 템플릿** 화면이 쓰는 장(L_TOC_*)과 업종별 내용을 만드는 스크립트.

표준 제안서 템플릿은 업종별 표준 제안서 44종(`bs_std_<업종>`, `app/scripts/vertical_standard/`)을 그대로 쓴다.
다른 템플릿도 표준 제안서와 이름이 같은 목차(Overview · AI 업종 · 공간별 제안 · 업종 솔루션 · 도입사례 · Why Samsung)는
그 업종 표준 제안서의 장(L_VS_*)을 그대로 옮기고, 장 번호 · 간지 쪽 · 덱 이름 · 쪽 번호만 바꾼다.
여기서 만드는 것은 표준에 없는 목차의 장과 내용뿐이다.

| 결과물 | 만드는 스크립트 | 입력 |
| --- | --- | --- |
| `app/web/src/domain/templates/toc_layouts.js` — 장 36개(TOC_META · TOC_HTML · TOC_SLOTS) | `python3 build/toc/gen_module.py` | `layouts.py`(장 디자인) · `base.py`(+ `build/v25/std.py`) |
| `app/web/src/domain/templates/toc_content.json` — 업종 44개 내용 | `python3 build/toc/build_content.py` | `app/data/vertical_space_product.json` · `vertical_space_solution.json` + 아래 문구 |
| `app/web/public/assets/toc/icons/<기능 id>.on/off.png` · `ui-*.png` | `cd build/toc/icons && npm i && node make_icons.mjs && node make_ui_icons.mjs` | `feature_icons.json`(기능 id → Lucide 아이콘, ISC) |

## 장 (L_TOC_*)
- 목차 사진 카드 4–8 · 핵심 기술(솔루션 1–4 × 키워드 3) · 공간별 가치 제안 여정(공간 1–3 × 솔루션 1–2, 이 장에서 쓰는 기능만 색)
- 당사의 이해 — 고객사 분석(현황 지표 · 과제) · 업종 트렌드(연도별 추이 · 구성비 · 핵심 지표 · 키워드) · 경쟁사 비교(기준표 · 포지셔닝). 숫자는 `[00]` — 제안 때 채움
- 제안 요약 · 기대 효과(KPI) · 비용 · 구매(TCO) · 파일럿 · 확산 · 실행 계획 · 요구사항 대응 · 제품 사양 · 구성 · 수량(공간 3–8)
- 목차를 여는 간지는 표준 제안서 간지(L_VS_DIV_R1–6) — 이 장에서 다루는 것 줄 수만큼

## 문구 (사람이 쓴 것)
- `content_common.py` — 제품 분류 표시 이름 · 컷 · 한 줄, 솔루션 이름 · 소개, 기능 그룹 키워드
- `content_groups.py` — 업종(그룹 20개)별 당사의 이해(트렌드 4종 · 고객 현황 · 경쟁 비교) · 요구사항 · KPI · 파일럿 · 실행 계획
- `content_v1..5.py` — 업종(44개)별 니즈(대표 공간 · 제품 분류) · 과제 3 · 여정
- `space_photos.json` — 공간 사진 (앱 사진 묶음 주소)

## 규칙
- 같은 목차 이름이면 어느 템플릿에서든 같은 장. 표준 제안서와 같은 이름이면 표준 제안서 장 그대로(공간별 가치 제안의 조감도도 표준 조감도 장).
- 새 장에는 부제 · 각주 · 작은 설명 글을 넣지 않는다. 제목 한 줄 + 사진 · 아이콘 · 숫자.
- 개수가 바뀌는 칸만 변형을 둔다(목차 4–8 · 솔루션 1–4 · 여정 1–3 공간 × 솔루션 1–2 · 수량표 3–8).
- 조립: `app/web/src/domain/templates/toc_templates.js` — `ensureTocScenario(템플릿, 업종)`이 시나리오를 시나리오 레지스트리(SC · FILLS · STORY)에 올린다(표준 제안서는 `bs_std_<업종>` 그대로). 검사: `node --test app/tests/toc-templates.mjs`.
