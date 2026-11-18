# 업종별 표준 제안서 생성기 (샘플 버티컬 시나리오 · 표준 제안서 44종)

`app/data/vertical_space_product.json`(버티컬 44 · 공간 234 · 제품군)과 `app/data/vertical_space_solution.json`(솔루션 23)을 기준으로
버티컬마다 표준 제안서 한 벌(`bs_std_<버티컬 id>`)을 만든다. 목차는 6장으로 고정이고 장 구성도 같으며, 업종마다 내용 · 공간 수 · 솔루션 수만 다르다.

| 장 | 구성 |
|---|---|
| 표지 · 목차 | L_C01 표지(사진 한 장) · L_VS_TOC(6장 사진 카드) |
| 01 Overview | 간지 · Device · Solution · Service 도식 |
| 02 AI 업종 | 간지 · 니즈 · 기술 · 제안 3열(고객 니즈 쪽 사진 없음, 제안마다 색 카드) · 핵심 제안 상세 3장(가운데 제품/솔루션 이미지만) |
| 03 공간별 제안 | 간지 · 조감도(공간 6개 이하 = 공간 조감도, 넘으면 표준 건물 조감도) · 공간마다 한 장(왼쪽 공간 사진 · 오른쪽 위에서 아래로 대표 제품 이름 → key message → 제품 특징 영역(제품 컷 + 특징 2)) · `{업종} Map` |
| 04 솔루션 | 간지 · 그 업종에 매칭된 솔루션마다 한 장 — 솔루션마다 레이아웃이 다르고(23종) 업종끼리는 같음 |
| 05 도입사례 | 간지 · 그 업종의 삼성 공식 도입사례 2건(같은 레이아웃) |
| 06 Why Samsung | 간지 · 5장(모든 업종 같은 내용) · SAMSUNG 마감 |

모든 장에서 페이지 번호 위 각주(*)는 쓰지 않는다.

카드 · 강조는 선이 아니라 면으로 만든다 — 테두리(border) · 왼쪽/위 강조선 · 제목 밑줄(언더바) · 항목 사이 구분선을 쓰지 않고, 흰 장에서는 연회색(`SURF`) 카드, 회색 카드 안에서는 흰 칸, 강조는 연한 파랑(`TINT`) · 제안별 색(`ACC`) 면으로 나눈다. 순서를 잇는 화살표 · 연결선(조감도 핀 · 흐름)은 선으로 둔다.

공간별 장(L_VS_SPACE) 칸: 글 0 장 표식 · 1 공간 이름 · 2 key message(이 공간에서 대표 제품이 하는 일 — `scene_match` 문장, 예전 머리 부제 자리) · 3 '대표 제품' · 4 제품 이름 · 5~8 특징 2개(제목 · 설명), 사진 0 제품 컷 · 1 공간 사진. 칸 번호는 바꾸지 않는다(저장된 제안서 · 목차 템플릿 제품 제안서가 번호로 읽음). 공간 사진은 목차 템플릿과 같은 표 `build/toc/space_photos.json`(공간 id → 사진)에서 고르고, 같은 덱의 표지 · 목차 · 간지 사진 후보에서는 빼며 도입사례 장에서는 사진이 모자랄 때만 뒤에서 쓴다.

## 파일

| 파일 | 내용 |
|---|---|
| `paths.py` | 저장소 루트 · 중간 산출물 폴더 `output/vertical-standard/`(git 제외) |
| `layouts.py` · `sol_layouts.py` · `why_layouts.py` · `gen_layouts.py` | 레이아웃 59종(L_VS_*) → `app/web/src/domain/templates/vertical_std_layouts.js` + 칸 스키마 `schema.json` |
| `content_a.txt` ~ `content_e.txt` | 업종별 문구(AI 업종 이름 · 니즈 3 · 기술 · 제안 · 상세 2×3). 줄 형식은 `build.py`의 `parse_content` |
| `prod.py` · `sols.py` · `polite.py` | 제품군 → 대표 제품 · 사진 · 특징 / 솔루션 문구 · 이미지 / 문장 끝 합니다체 |
| `scene_match.py` | 공간마다 대표 제품과 그 아래 한 문장을 함께 고름 — 공간 시나리오 문장이 실제로 말하는 기기(호텔 TV · E-Paper · 태블릿 · 냉난방 …)를 대표 제품으로 삼아 제품과 문장이 어긋나지 않게 하고, 맞는 문장이 없는 공간(234곳 중 15곳)만 제품 기준 문장으로 채움. 업종 · 공간에 따라 특징 설명의 대상(객실 · 병실 · 호실, 회의 · 수업)도 맞춤 |
| `build.py` | 덱 44종 → `app/web/src/domain/templates/standard_vertical_scenarios.json`(scenarios · fills · story · customers) |
| `bird_forms.py` · `bird_render.mjs` | 공간 조감도(공간 6개 이하 36종): 공간마다 방 하나 · 그 공간 제품군의 3D 제품 → `app/web/public/assets/vertical-std/<버티컬>.webp`(번호 핀) + 같은 폴더 `<버티컬>.scene.json`(시트 팝업에서 3D로 돌려 볼 장면) + 핀 좌표 표 `app/web/src/domain/templates/vertical_std_bird.json`(시트의 가운데 형태 · 화살표 — `bld_render.mjs`도 같은 표에 씀). `OUT=<폴더>`를 주면 셋 다 그 폴더에만 쓴다 |
| `bld_forms.py` | 표준 건물 조감도(공간 7개 이상 8종)의 층 배분 — 공간마다 8×6.8m 한 칸, 공간 중복 없음, 층당 2~5공간, 위층은 아래층보다 크지 않게 |
| `bake_std.mjs` · `merge_std.py` · `gen_std_presets.py` | 층 굽기(공간 조감도 엔진 · composition v4) → 건물 조감도 모듈의 `bake-standard.js`(층 데이터) · `presets-standard.js`(시작 창 「표준 건물 조감도」) |
| `bld_render.mjs` | 표준 건물 조감도 이미지(층을 띄워 펼친 보기 · 층 이름표 · 번호 핀) → `public/assets/vertical-std/<버티컬>.webp` |
| `space_sheets.py` | 공간별 대표 제품 장 4종(`L_VS_SPACE_1` · `2` · `3` · `4` — 한 장에 제품 1 · 2 · 3 · 4개) · 업종 Map 7종(`L_VS_MAP_2` … `8` — 공간 2~8곳)과 key message · 특징과 이어지는 스펙 고르기(`related_specs`) → 관리자 '전체 파트' 팝업용 예시 `admin/web/src/space-sheets.json`. **레이아웃 라이브러리 · 덱 44종에는 아직 넣지 않는다(실제 덱 반영 전)** — 아래 「공간별 대표 제품 — 제품 수에 따라 나누기」 |
| `overview_industry.py` | 업종별 고정 Overview 시트 20장(`L_VS_DSS_<업종 묶음>` — 업종 묶음마다 레이아웃 · 내용이 정해진 Device · Solution · Service 장) → 관리자 '전체 파트' 팝업용 `admin/web/src/overview-sheets.json`. **레이아웃 라이브러리 · 덱 44종에는 아직 넣지 않는다(실제 덱 반영 전)** — 아래 「업종별 고정 Overview 시트」 |

## 공간별 대표 제품 — 제품 수에 따라 나누기 (정해 둔 구성 · 실제 덱 반영 전)

2026-11-16 사용자 지시로 정한 구성이다. 지금 덱은 공간(제품)마다 `L_VS_SPACE` 한 장을 쓰고, 아래 구성은 관리자 「레이아웃 구성 관리」 '전체 파트' 팝업의 공간별 제안 카드에만 보인다.

| 제품 수 | 장 나눔 | 쓰는 시트 |
|---|---|---|
| 1 · 2 · 3 | 제품마다 한 장 | `L_VS_SPACE_1` — 지금 장 + 주요 스펙 4(key message · 특징 2와 이어지는 사양). '대표 제품' 표식은 제품 이름 위에서 오른쪽으로 옮겼다. 글 0~11 · 사진 0~1 칸 번호는 `L_VS_SPACE` 와 같고 스펙만 글 12~20 |
| 4 · 5 · 6 · 7 · 8 | 2/2 · 3/2 · 3/3 · 4/3 · 4/4 | `L_VS_SPACE_2`(공간 사진 위 제품 컷 · 특징 2 · 스펙 3, key message 없음) · `L_VS_SPACE_3` · `L_VS_SPACE_4`(공간 사진 위 제품 컷 · 특징 2까지만) |
| 9 이상 | 조감도부터 다시 — 공간을 고르게 나눈 묶음마다 [조감도 → 제품 장 → Map] (9 → 3/2 + 2/2) | 위와 같음 |

업종 Map 도 공간 수에 맞는 시트를 골라 쓴다 — 공간 2곳부터 8곳까지 7종(`L_VS_MAP_2` … `8`: 4곳 이하는 한 줄, 5곳부터 두 줄 3/2 · 3/3 · 4/3 · 4/4). 공간이 1곳이면 Map 을 두지 않고, 8곳을 넘으면 조감도 묶음마다 한 장(9 → 5곳 Map + 4곳 Map).

Map 의 공간 칸에는 제품을 하나 이상 놓는다 — 제품 수에 따라 제품 카드(제품 컷 + 이름)의 크기 · 배치가 달라지므로 이 장은 여기(`layouts.py`)가 아니라 앱 모듈 `app/web/src/domain/templates/space_map_sheet.js` 가 그때그때 조립한다(`spaceMapSheet` — 표준 장과 같은 틀 · 글자 역할 · 색). 칸의 제품 자리에서 줄 · 열을 바꿔 가며 카드 안 그림이 가장 크게 보이는 배치를 고르고(`arrangeCards`), 최소 카드 크기(96 × 78)보다 작아져야 하거나 자리가 9개를 넘으면 마지막 자리를 '외 N종'으로 쓴다(`placeProducts`). 장 이름은 칸마다 놓은 카드 수가 붙는다 — `L_VS_MAP_6_4-5-6-5x-4-5x`(x = '외 N종'). 지금 덱의 `L_VS_MAP_3` … `10`(공간마다 대표 제품 컷 하나 + 제품 목록 글)은 그대로다.

- 규칙: `app/web/src/domain/templates/space_sheet_plan.js`(`spaceSheetPlan` · `spaceMapPlan`) · Map 조립 `space_map_sheet.js` · 검사 `node --test app/tests/space-sheet-plan.mjs app/tests/space-map-sheet.mjs`
- 시트 · 예시: `PYTHONPATH=admin/runtime/python app/.venv/bin/python -B app/scripts/vertical_standard/space_sheets.py`(Pillow 필요) → `admin/web/src/space-sheets.json`. `OUT=<폴더>` 를 주면 그 폴더에만 쓰고 `sheet-<f>.html` 도 함께 남긴다. 예시는 공간이 10곳인 덱(`bs_std_md_tertiary`)의 공간을 1 · 2 · 3 · 4곳씩 나눠 써서 제품 장 네 장에 같은 사진이 두 번 나오지 않는다. Map 예시는 장이 아니라 자료(`maps`)로 낸다 — 공간 수마다 실제 업종 하나(`MAP_EXAMPLES`: 공간 · 하는 일 · 공간에 놓이는 제품군마다 대표 제품 이름과 컷), 관리자 화면이 `spaceMapSheet` 로 조립한다.
- 덱에 반영할 때 할 일: Map 은 덱마다 조립한 장을 쓰도록(레이아웃 이름 `L_VS_MAP_<n>_<칸마다 카드 수>` 를 받으면 `space_map_sheet.js` 로 만드는 길을 앱 레이아웃 목록 · Agent KB · PPT 내보내기에) 이어야 한다. `gen_layouts.build()` 가 `space_one()` · `space_multi(n)` 을 레이아웃으로 올리고, `build.py` 가 묶음 · 장 나눔대로 채운다(스펙은 `related_specs`). 9곳 이상인 업종 5곳은 묶음마다 조감도 그림을 따로 구워야 하고(한 제안서에 같은 그림을 두 번 쓰지 않는다), `L_VS_SPACE` 를 장 번호로 읽는 곳(목차 템플릿 제품 제안서 · `migrate_space_sheet.js` · 자동 구성)도 함께 고친다.

## 공간 수 · 공간마다 제품 수에 맞춘 장 (실제 제안서에 반영 · 2026-11-17)

사용자 지시(2026-11-17, 제안서 pn63a3to): "공간별 제품에 시트 갯수는 공간 갯수와 일치해야해 … 공간의 갯수와 그 공간에서의 제품 갯수가 다 맞아야해". 레이아웃 자동 구성(composer `auto.py` `compose_part`)이 고객의 공간 구성으로 공간별 제안 파트를 짤 때:

| 장 | 규칙 | 시트 |
|---|---|---|
| 조감도 | 범례 줄 수 = 공간 수 | `L_VS_BIRD_S1` · `S2`(새로) · `S3` ~ `S6` · `B7` ~ `B10`. 그림은 앱이 같은 공간 구성으로 만든 3D 조감도(`services/space-plan.js`) — 고객의 공간 구성이 있으면 업종 표준 그림(다른 방)은 두지 않는다 |
| 공간별 제품 | 제품이 놓인 공간마다 한 장(같은 제품이 여러 공간에 놓여도 공간마다), 장 안의 제품 = 그 공간의 제품 전부 | 제품 1개 `L_VS_SPACE` · 2 ~ 8개 `L_VS_SPACE_P2` ~ `P8`(새로 — 왼쪽 공간 사진 · key message · 제품마다 컷 · 이름 · 특징 2(제품 2 ~ 4) 또는 1(5 ~ 8)) |
| Map | 카드 수 = 제품이 놓인 공간 수, 1곳이면 두지 않는다 | `L_VS_MAP_2`(새로) ~ `L_VS_MAP_10` |

`gen_layouts.build()` 가 기존 59종 뒤에 10종을 붙인다(기존 장은 바이트 그대로). 칸 모드는 `slot_modes.json` 에 손으로 넣었다(생성기 `layout_slot_modes.mjs` 를 다시 돌리면 다른 세션의 입력 변화까지 함께 바뀌므로). KB 기대 수는 974 / 활성 680(`export_agent_data.mjs`). 검사: `app/tests/test_compose_space_sheets.py`.

## 업종별 고정 Overview 시트 (정해 둔 구성 · 실제 덱 반영 전)

2026-11-16 사용자 지시로 정한 구성이다. Overview 는 업종마다 쓰는 제품 · 솔루션이 크게 달라, **업종 묶음마다 레이아웃(서로 다르되 비슷하게)과 내용이 정해진 고정 시트** 한 장을 쓴다 — 내용은 덱을 만들 때 채우거나 고치지 않는다(꼬리말 · 쪽 번호만 덱마다 바뀜). 지금 덱은 세부 업종 44곳마다 `L_VS_DSS` 한 가지 레이아웃(디바이스 5 · 솔루션 5)에 내용을 채우고, 아래 시트는 관리자 「레이아웃 구성 관리」 '전체 파트' 팝업의 Overview 카드(파트 이름 오른쪽 업종 드롭다운)에만 보인다.

- **업종 묶음**: 너무 잘게 나누지 않는다 — `toc_content.json` 의 묶음 20곳(외식 · 리테일 · 호텔 · 오피스 · 교육 · 의료 …). 상급종합 · 중소 병원 · 의원 · 요양은 모두 '의료' 한 장을 쓰고, 교육과 오피스는 다른 장이다.
- **내용**: 디바이스 = 그 묶음 세부 업종의 과반이 공간에 놓는 제품 계열(`prod.families` — 덱의 Overview 와 같은 13계열), 공간 수가 많은 순 3–8개 · 계열마다 가장 많이 놓이는 제품의 컷. 솔루션 = 과반이 쓰는 솔루션(서비스 `svc_*` 제외) 2–8개. 서비스 3 = 업종 맞춤 컨설팅 · 공조 케어(과반이 에어컨 케어 서비스를 쓰면, 아니면 설치 · 시공) · 보증 연장(과반이 삼성케어플러스를 쓰면, 아니면 B2B A/S). 과반에 드는 것이 모자란 묶음(세부 업종끼리 많이 다른 금융)은 순위대로 채운다.
- **레이아웃**: `L_VS_DSS` 와 같은 계열(왼쪽 DEVICE · 가운데 삼성 AI 비즈니스 도식 · 오른쪽 SOLUTION · 아래 SERVICE). 항목이 5개까지면 한 줄씩(칸이 패널 높이를 나눠 채운다), 6–8개면 두 줄 격자 — 그 패널이 넓어지고(340 → 420) 가운데 도식이 두 패널 사이 한가운데로 옮겨 가며, 양쪽이 다 넓으면 도식을 줄인다. 그래서 옥외 광고(3 · 2) · 의료(6 · 5) · 교육(8 · 8)의 장 모양이 서로 다르다.
- **가운데 도식 · 솔루션 아이콘**(`hub()` · `SOL_ICON`): 가운데 원(삼성 AI 비즈니스)을 Device · Solution · Service 마디가 점선 궤도에서 둘러싸고, 마디마다 자기 영역으로 선이 이어진다(Device → 왼쪽 패널, Solution → 오른쪽 패널, Service → 아래 띠). 솔루션 이름 앞에는 구분 점 대신 그 솔루션을 가장 잘 보여 주는 아이콘을 둔다(SmartThings Pro = 연결된 기기, Knox = 방패, VXT CMS = 클라우드, 병원 안내 · 업무 = 십자, 회의실 예약 = 달력 …). 솔루션이 늘면 `SOL_ICON` 에 아이콘을 더해야 만들어진다.
- 다시 만들기: `PYTHONPATH=admin/runtime/python app/.venv/bin/python -B app/scripts/vertical_standard/overview_industry.py`(Pillow 필요) → `admin/web/src/overview-sheets.json`(장 HTML · 디바이스/솔루션/서비스 목록 · 제품 컷은 긴 변 240px webp 로 파일 안에). `--check` 는 파일이 생성 결과와 같은지만 본다 — 업종 × 공간 × 제품 · 솔루션 DB 나 제품 대표 컷이 바뀌면 다시 만든다(`admin/tests/test_overview_sheets.py` 가 알려 준다).
- 덱에 반영할 때 할 일: `gen_layouts.build()` 가 `sheet()` 로 만든 장 20종을 레이아웃으로 올리고, `build.py` 가 Overview 장에 세부 업종의 묶음 장을 그대로 쓴다(채우는 칸은 꼬리말뿐). 자동 구성(선택한 DSS 항목만 싣는 규칙)과 어긋나므로 Overview 를 고정으로 둘지부터 정해야 한다.

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
