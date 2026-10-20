# 사진 중심 레이아웃 생성기

`src/photo_layouts.js`(L_PH_* 332장 — 1차 35장 + 2차 45장 + 3차 고객사 이해 24장 + 4차 업종별 묶음 96장 · 공통 10장 + 5차 경쟁사 분석 23장 · 시사점 · 제안 방향 13장 + 6차 실행 계획 · 비용 22장 + 7차 과제 · 효과 · 개요 · 요구 · 사용자 40장 + 8차 솔루션 유저 시나리오 24장)와 `src/retired.js`(4차 대체 목록)를 만드는 스크립트. 저장소 루트에서 실행합니다.

```bash
python3 build/photo/r4_photos.py      # 4차 도입사례 사진 → img/fill/r4-*.json · r4_images.json · r4img/ (원본 폴더 인자: raw · case_images.json)
python3 build/photo/gen_all.py        # gen_l1~15.py → build/photo/new_layouts.json · new_meta.json
node build/photo/pf.mjs               # 모든 레이아웃의 사진 비율 → build/photo/pf.json (CHROME=크롬 경로 가능)
python3 build/photo/make_module.py    # → src/photo_layouts.js, data/catalog.json 에 pf 추가, data/images.json 에 ph.* 등록
python3 build/photo/gen_sources.py    # → src/photo_sources.md (사진 출처 대장 · 쓰는 레이아웃)
node build/build.mjs
```

- `gen_base.py` 공용 도우미(머리글 · 꼬리말 · 이미지 칸 · 반투명 판).
  - 1차: `gen_l1.py` 분석 · 과제, `gen_l2.py` 가치 · 효과 · 근거 · 사례, `gen_l3.py` 솔루션 · 제품 · 스펙 · 구성, `gen_l4.py` 시나리오 · 요약 · 실행 · 마무리.
  - 3차(고객사 이해): `gen_l8.py` 업종별 ‘고객 비즈니스 · 운영 과제’ 16장(L_PH_MI_xx_B, `ind` 지정, 디자인 stages / hero / band), `gen_l9.py` 범용 8장(L_PH_CB_*).
  - 2차: `gen_l5.py` 업종별 ‘대표 공간 · 네 장면’ 16장(L_PH_SS_xx_B, `ind` 지정 · 업종마다 데이터 한 덩어리, 디자인 두 가지 cols / hero), `gen_l6.py` 시장 · 가치 · 효과 · 제품, `gen_l7.py` 구성 · 시나리오 · 솔루션 · 실행 · 부록.
- 레이아웃마다 `pv`(같은 맥락의 텍스트 레이아웃)를 적습니다. 없는 f는 make_module.py가 빼고 알려 줘요. 업종 레이아웃은 `ind`도 적어요.
- `ph_images.json` 사진 168장 등록부(파일 · 내용 · 구분 · 출처 페이지 · 원본 주소). 사진 파일은 `img/ph/`, 출처 대장은 `src/photo_sources.md`.
- 사진 고르기 기록: `photos.py`(1차) · `photos2.py`(2차, 흑백 · 야간 보정 GEN 포함)에 원본 id · 자르기 영역 · 설명이 있고, `build_photos.py` · `proc.py`가 그대로 잘라 `img/ph/`에 씁니다. 원본 내려받기(raw/ · case_images.json · web_images.json)는 저장소에 넣지 않았어요 — 원본 주소는 ph_images.json에 있습니다.
- 검사: 글자 넘침은 `build/test-photo.mjs`와 함께, 슬라이드 단위로는 레이아웃 HTML을 1280×720에 띄워 data-tb가 칸 밖으로 나가는지 봅니다.

## 4차 — 업종별 묶음 · 공통 (gen_l10 ~ gen_l15)
- `gen_ind.py` 업종 공용: 업종 이름 · 예시 고객 · 각주 출처 꼬리, `photo()`(제품 컷은 contain), `kpi` · `pin` · `glass` · `clamp`, 원본 제목 · 부제(`r4_orig_hdr.json`) · 각주 · 쪽 번호 · 예시 고객 · 오른쪽 위 태그(`r4_orig_foot.json`)를 원본에서 그대로 가져옴. 사진이 칸보다 작거나(LOWRES) 비율이 너무 달라 크게 잘리면(CROP), 한 장에 같은 사진이 두 번이면(DUP) gen_all이 알려 줘요.
- 생성기: `gen_l10.py` 시장 · 트렌드(MI_xx_A, 데이터는 파일 안), `gen_l11.py` 고객 여정(MI_xx_C), `gen_l12.py` 공간 맵(SS_xx_A), `gen_l13.py` 하루 시나리오(SS_xx_C), `gen_l14.py` 공간 깊이 보기(SS_xx_D · E — kind: route · users · problem · mode · phased), `gen_l15.py` 공통 10장.
- 데이터: `r4data/mi_c.py` · `ss_a.py` · `ss_c.py` · `ss_de.py`(스키마 주석 + 견본) + 업종 둘씩 `r4data/p_<업종>_<업종>.py`(MI_C · SS_A · SS_C · SS_DE dict). 데이터 파일 하나에 문제가 있으면 PART ERROR로 알리고 나머지는 계속 만들어요. 원본 내용 덤프 · 확인 도구는 작업 폴더(work/r4: fam_dump.json · shot.mjs · check.mjs · pidsheet.py)에 있었고 저장소에는 넣지 않았어요.
- 사진: `r4_spec.py`(이름 → 도입사례 사진 id · 자르기 · 설명, 쓰지 않는 사진은 뺌) → `r4_photos.py`가 카드형 사진의 제목 띠 · 캡션 · 흰 여백을 떼고(‘auto’) 880px로 줄여 업종 둘씩 묶음 `img/fill/r4-*.json`으로 씀. 레이아웃에서는 `data-pid="r4.<이름>"` + `data-fill`(화면이 묶음을 받아 채움, src/fillpack.js).
- 대체 목록: `r4_retired.json`(텍스트 f → 대체 f). make_module.py가 모든 f가 있는지 확인하고 `src/retired.js`로 씀.

## 5차 — 경쟁사 분석 · 시사점 / 제안 방향 (gen_l16 ~ gen_l20)
- 공용 도우미 `gen_r5.py`(rival 실루엣 · cut · tag_on · label_on · mark · bignum · evid · card). 경쟁사는 익명, 경쟁사 제품 자리는 `rival()` 회색 실루엣.
- 실루엣 그림: `img/ph/gen-rival-{signage,kiosk,outdoor,tablet,cassette,led,phone}.png` — `python3 build/photo/r5_rivals.py` 가 ph_images.json 에 등록(build_photos.py 를 다시 돌리면 이것도 다시 돌릴 것).
- gen_l16 견본(L_PH_CP_A) · gen_l17 제품 비교 · 시장 · gen_l18 시장 · 브랜드 · 사례 · gen_l19 대응 전략 · 시사점 · gen_l20 시사점 · 제안 방향.
- 대체(뺀 장) 없음 — 기존 텍스트 장과 pv 로만 연결.

## 6차 — 실행 계획 · 비용 (gen_l21 ~ gen_l23)
- 텍스트 장 16장의 사진 버전(원본 eyebrow · 예시 고객 · 각주 · 쪽 번호 그대로, 표는 줄이고 사진 칸 추가) + 새 장 6. 대체 없음.

## 7차 — 고객 과제 · 기대 효과 · 제안 개요 · 고객 요구 이해 · 사용자 (gen_l24 ~ gen_l27)
- 파트마다 8장, 기존 사진 장과 구조가 겹치지 않게. 흑백 ‘지금’ 장면 일부는 사진 칸에 CSS grayscale 필터. 대체 없음.

## 8차 — 솔루션 유저 시나리오 (gen_l28 ~ gen_l30)
- 사람 사진: `python3 build/photo/r8_people.py` — samsung.com 도입사례에서 사람이 나오는 사진 27장을 잘라 img/fill/r8-people.json 묶음 하나로, ph_images.json 에 ph.p-* (addr) 로 등록(build_photos.py 를 다시 돌리면 r5_rivals.py · r8_people.py 도 다시 돌릴 것). 확인용 사본 build/photo/r8img/.
