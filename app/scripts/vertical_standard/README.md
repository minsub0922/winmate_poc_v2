# 업종별 표준 제안서 생성기 (샘플 버티컬 시나리오 · 표준 제안서 44종)

`app/data/vertical_space_product.json`(버티컬 44 · 공간 234 · 제품군)과 `app/data/vertical_space_solution.json`(솔루션 23)을 기준으로
버티컬마다 표준 제안서 한 벌(`bs_std_<버티컬 id>`)을 만든다. 목차는 6장으로 고정이고 장 구성도 같으며, 업종마다 내용 · 공간 수 · 솔루션 수만 다르다.

| 장 | 구성 |
|---|---|
| 표지 · 목차 | L_C01 표지(사진 한 장) · L_VS_TOC(6장 사진 카드) |
| 01 Overview | 간지 · Device · Solution · Service 도식 |
| 02 AI 업종 | 간지 · 니즈 · 기술 · 제안 3열(고객 니즈 쪽 사진 없음, 제안마다 색 테두리) · 핵심 제안 상세 3장(가운데 제품/솔루션 이미지만) |
| 03 공간별 제안 | 간지 · 조감도(공간 6개 이하 = 공간 조감도, 넘으면 표준 건물 조감도) · 공간마다 한 장(왼쪽 제품 컷 + 오른쪽 특징 2개, 제품명은 위) · `{업종} Map` |
| 04 솔루션 | 간지 · 그 업종에 매칭된 솔루션마다 한 장 — 솔루션마다 레이아웃이 다르고(23종) 업종끼리는 같음 |
| 05 도입사례 | 간지 · 그 업종의 삼성 공식 도입사례 2건(같은 레이아웃) |
| 06 Why Samsung | 간지 · 5장(모든 업종 같은 내용) · SAMSUNG 마감 |

모든 장에서 페이지 번호 위 각주(*)는 쓰지 않는다.

## 파일

| 파일 | 내용 |
|---|---|
| `paths.py` | 저장소 루트 · 중간 산출물 폴더 `output/vertical-standard/`(git 제외) |
| `layouts.py` · `sol_layouts.py` · `why_layouts.py` · `gen_layouts.py` | 레이아웃 59종(L_VS_*) → `app/web/src/domain/templates/vertical_std_layouts.js` + 칸 스키마 `schema.json` |
| `content_a.txt` ~ `content_e.txt` | 업종별 문구(AI 업종 이름 · 니즈 3 · 기술 · 제안 · 상세 2×3). 줄 형식은 `build.py`의 `parse_content` |
| `prod.py` · `sols.py` · `polite.py` | 제품군 → 대표 제품 · 사진 · 특징 / 솔루션 문구 · 이미지 / 문장 끝 합니다체 |
| `scene_match.py` | 공간마다 대표 제품과 그 아래 한 문장을 함께 고름 — 공간 시나리오 문장이 실제로 말하는 기기(호텔 TV · E-Paper · 태블릿 · 냉난방 …)를 대표 제품으로 삼아 제품과 문장이 어긋나지 않게 하고, 맞는 문장이 없는 공간(234곳 중 15곳)만 제품 기준 문장으로 채움. 업종 · 공간에 따라 특징 설명의 대상(객실 · 병실 · 호실, 회의 · 수업)도 맞춤 |
| `build.py` | 덱 44종 → `app/web/src/domain/templates/standard_vertical_scenarios.json`(scenarios · fills · story · customers) |
| `bird_forms.py` · `bird_render.mjs` | 공간 조감도(공간 6개 이하 36종): 공간마다 방 하나 · 그 공간 제품군의 3D 제품 → `app/web/public/assets/vertical-std/<버티컬>.webp`(번호 핀) |
| `bld_forms.py` | 표준 건물 조감도(공간 7개 이상 8종)의 층 배분 — 공간마다 8×6.8m 한 칸, 공간 중복 없음, 층당 2~5공간, 위층은 아래층보다 크지 않게 |
| `bake_std.mjs` · `merge_std.py` · `gen_std_presets.py` | 층 굽기(공간 조감도 엔진 · composition v4) → 건물 조감도 모듈의 `bake-standard.js`(층 데이터) · `presets-standard.js`(시작 창 「표준 건물 조감도」) |
| `bld_render.mjs` | 표준 건물 조감도 이미지(층을 띄워 펼친 보기 · 층 이름표 · 번호 핀) → `public/assets/vertical-std/<버티컬>.webp` |

## 다시 만들기 (저장소 루트에서)

```sh
python3 app/scripts/vertical_standard/gen_layouts.py      # 레이아웃 · schema.json
python3 app/scripts/vertical_standard/bld_forms.py        # 건물 층 배분 (build.py가 층 번호를 범례에 씀)
python3 app/scripts/vertical_standard/build.py            # 덱 44종
# 조감도를 바꿀 때만 (Vite + Playwright, 수 분)
python3 app/scripts/vertical_standard/bird_forms.py && node app/scripts/vertical_standard/bird_render.mjs
node app/scripts/vertical_standard/bake_std.mjs && python3 app/scripts/vertical_standard/merge_std.py
python3 app/scripts/vertical_standard/gen_std_presets.py && node app/scripts/vertical_standard/bld_render.mjs
```

- Python 3 + Pillow(`prod.py`가 제품 사진 후보를 고를 때 씀), Node는 `app/web/node_modules`(vite · playwright · sharp)를 쓴다.
- 같은 입력이면 결과가 같다(굽기 · 덱 JSON 모두 결정적). `node bake_std.mjs verify`는 기존 층 `of-full-standard`를 다시 구워 모듈 데이터와 같은지 확인한다.
- 검사: 장표 칸 · 이미지 채움과 겹침/넘침은 `node app/tests/vertical-proposals.mjs`(`PROPOSAL_ONLY=bs_std_` 로 표준만), 계약 수치(authored 87 · 전체 107)도 같은 검사에 있다.
