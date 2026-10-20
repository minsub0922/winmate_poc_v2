# Winmate 제품 DB (v2) — samsung.com/business + e-카탈로그

Winmate v2 의 제품 탐색기 · @검색 · 추천 · hover 상세가 쓰는 **삼성 B2B 제품 전체 DB**.
v1 `winmate-kb`(winmate_poc 저장소)의 제품 계층과 같은 방식(사이트 API 원문 → 표)으로 오늘 다시 수집하고, v1 에 없던 e-카탈로그 제품을 더했다.

- 사이트 수집: 2026-10-18 18:43~18:57 KST (samsung.com/sec/business, KR)
- e-카탈로그: samsung.aiibook.net/b2b 68권(비즈니스 종합 · B2B 품목 · 제품 가이드 · 업종별 제안 + LED 조명) 쪽별 텍스트 1,783쪽
- DB: `winmate_products.sqlite`(25 MB) · 앱 데이터: `../data/products_db.json` + `../img/prod/*.json`
- 사진(2026-10-19): 사이트 카드 602 = samsung.com 상품 카드 이미지 · **카탈로그 전용 426 중 418** = 그 제품이 실린 e-카탈로그 쪽에서 자른 실제 사진(413) 또는 같은 종류의 실제 사진(5, 무엇의 사진인지 표시) · 큐레이션 40 중 39 — 사진 없는 것: 카탈로그 전용 8(서비스 · 설치 자재 · 옵션 키트처럼 카탈로그 어디에도 그림이 없는 항목) + 큐레이션 1(스마트태그2)

## 무엇이 들어 있나

| 표 | 건수 | 내용 |
|---|---|---|
| category | 51 | 사이트 목록(…/all-…/) — 이름 · 분류 번호 · 필터 · 제품군(디스플레이 · 공조 · 모바일/PC · 프린팅 · 주방/리빙 · 조명 · 오디오 · 기타) |
| product_family | 612 | 상품 카드(사이즈 · 용량 · 색상 옵션을 묶은 단위) — 이름 · 대표 모델 · USP · PDP 제목/설명 · 상세 URL |
| product_model | 1,086 | 모델코드(옵션 하나) — 옵션 이름 · 값 · 품절 |
| product_tag | 1,210 | 목록 필터 소속(사이트 공식 그룹 · 라벨) |
| spec_value | 48,043 | 스펙 API 원값(그룹 · 항목 · 값), 카드 · 옵션 모델별 |
| feature_block / feature_item | 8,678 / 2,092 | PDP 특장점(헤드라인 · 본문 · 면책 문구) · 캐러셀 항목 |
| image_asset | 11,835 | 상품 카드 이미지 · 특장점 이미지(PC/MO 주소 · alt 문장) |
| catalog_doc / catalog_page | 68 / 1,783 | e-카탈로그 권 · 쪽 텍스트 · 쪽 이미지 주소 |
| catalog_mention | 4,290 | 카탈로그 쪽에 나온 모델코드 → 사이트 모델 대응(정확 · 앞부분) |
| catalog_product | 803 | 카탈로그에서 원문 그대로 옮긴 제품(이름 · 모델코드 · 사양 · 기능 문구 · 쪽) |
| catalog_product_family | 532 | 카탈로그 제품 ↔ 사이트 카드(모델코드 · 이름이 맞은 것, 공용 부품 코드만 맞은 것은 대응에서 뺌) |
| product_photo | 489 | 카탈로그 전용 제품(ec_*) · 큐레이션(cur_*)의 실제 사진 — 카탈로그 쪽(dir · page) · 자른 영역(box_px) · 종류(cut 제품 컷 · scene 설치 장면 · diagram 서비스/솔루션 대표 그림 · site_card 같은 종류 사이트 카드 사진 · none 사진 없음과 이유) · 파일(ecat/photos/) |

앱에 올라가는 제품: **사이트 카드 602 + 카탈로그 전용 426 + 큐레이션 40 = 1,068행**
(사이트 카드 612 중 10개는 큐레이션 항목과 모델코드가 같아 그 항목에 합침 — QMC · QBC · OH55A · VM55B · OM55B · Flip Pro · 탭 S11 울트라 · 엑스커버7 프로 · DVM 칠러 · EHS)

## 원칙
- 사실(이름 · 모델코드 · 스펙 · 문구 · 이미지 주소)은 사이트 API · 페이지 · 카탈로그 원문에서만 온다. 지어낸 값 없음.
- 카탈로그 제품은 에이전트가 원문에서 옮기고, 모든 모델코드를 해당 쪽 텍스트와 문자열 대조했다(3,126개 중 1개만 쪽 이미지에서 읽음 — AJ020FERPBC2, note 표기).
- 독립 검증(표본 60개 · 쪽 이미지 대조): 이름 · 모델코드 추출 오류 0. 찾은 문제는 고쳐 반영함 — ① 여러 권의 같은 제품을 합칠 때 공용 부품 코드로 다른 제품까지 줄줄이 합쳐지던 것(다른 권끼리만 · 모델 집합 자카드 0.5 이상 · 이름 포함일 때만 합침, 사이트 대응도 공용 코드 한두 개만 맞으면 대응 안 함) ② 쪽 텍스트에서 `~ / ( ) > <` 가 빠진 사양 값 113개를 쪽 이미지로 확인해 `ecat/corrections.json` 으로 교정(build_db.py 가 적용) ③ 협력사 제품 이름에 브랜드 표기(센도리 · 부성 · 아르네코리아 · 세원센추리 · 이너지테크놀러지스 · 알트엠).
- 앱의 `spaces`(주요 공간) · `ind`(업종) · `kw` 는 색인이다: 이미지 alt 문장 · 특장점 글의 공간 어휘, v1 업종 페이지 · 도입사례 페이지의 제품 링크(2026-10-04 수집), 목록 필터 라벨에서 뽑는다. 큐레이션 40개처럼 사람이 붙인 값이 아니라서 추천에서는 가중치를 낮췄다(search.js).
- 사이트 카드와 카탈로그 제품의 대응: 모델코드 정확 → 카탈로그 코드가 사이트 코드의 앞부분(국가 · 색상 접미 생략) → 사이트 코드 안에 포함(SL- 접두 생략) → 와일드카드 앞부분 → (코드가 없으면) 같은 제품군 안에서 이름 포함. 대응된 카탈로그 제품은 그 카드의 상세(사양 · 쪽 링크 · 사이트에 없는 카탈로그 모델)에 붙고, 대응 못 한 것만 '카탈로그' 표시로 따로 뜬다.
- 앱에서 뺀 카탈로그 항목(DB 에는 있음): 와일드카드 모델만 있는 것 13, 2024 업종 리플릿의 모델코드 없는 이름뿐인 항목 15. 같은 제품이 여러 권에 나오면 한 행으로 합침.

## 다시 만들기
```bash
# 1) 사이트 수집(헤드리스 Chromium 이 samsung.com 페이지 안에서 같은 출처 API 호출 — v1 collect/01·02·05·06·07 이식) → raw/
CHROME=/path/to/chrome node build/collect_site.mjs            # 약 15분
# 2) e-카탈로그 쪽 텍스트 → ecat/text/<Dir>.json (두 쪽씩 받음)
python3 build/fetch_ecat_text.py                                # 약 20분
# 3) 카탈로그 → 제품 목록: ecat/BRIEF.md 대로(사람 · 에이전트) ecat/extract/*.json
# 4) DB
python3 build/build_db.py                                       # → winmate_products.sqlite (1초)
# 5) 앱 데이터 + 사진 묶음
bash build/download_images.sh                                   # 상품 카드 이미지 앞 3장 → img_raw/ (1,711장) — site_photos.json 이 있으면 필요 없음
python3 build/cut_ecat_photos.py                                # ecat/photos.json → ecat/photos/*.jpg (파일이 없을 때만, 쪽 이미지 · PDF 를 raw_pages/ 에 받음)
python3 build/photos_db.py                                      # ecat/photos.json → DB product_photo 표(build_db.py 도 부름)
python3 build/export_app.py && python3 build/pack_images.py      # → ../data/products_db.json, ../img/prod/{d,t,g}NN.json
python3 build/imglib_db.py                                      # imglib/index.json → DB lib_image · lib_image_product · lib_image_fts(build_db.py 도 부름)
python3 build/fetch_imglib.py && python3 build/pack_imglib.py    # 원본 주소 사진 → imglib_cache/(커서 폴더에 안 둠) → ../img/lib/{index,p00,p01}.json
                                                                # 사이트 사진 묶음 t00~03 · g00~07 은 site_photos.json 주소 그대로 두고(--resite 로 다시 만듦), 카탈로그 · 큐레이션 사진은 t04 · g08~ 에
cd .. && node build/build.mjs && node build/test-proddb.mjs
```

## 폴더
```
winmate_products.sqlite   제품 DB
raw/                      사이트 수집 원본(wkb_products · wkb_specs · wkb_features · wkb_filter_meta, v1 과 같은 형식) · 수집 로그 · 오류
                          v1_wkb_pages_v2.json = v1 winmate-kb 의 업종 · 사례 페이지(2026-10-04) — 업종 색인용
ecat/                     catalogs.json(권 목록) · text/(쪽 텍스트) · extract/(제품 목록) · corrections.json(기호 교정 113) · BRIEF.md(추출 규칙) · show.py
ecat/photos.json          카탈로그 전용 · 큐레이션 사진 기록(제품마다 쪽 · 영역 · 종류 · 메모, 사진 없는 항목은 이유) · ecat/photos/(자른 사진 476장) · ecat/PHOTO_BRIEF.md(자르는 규칙)
site_photos.json          사이트 카드 사진 묶음 주소(게시한 t00~03 · g00~07 고정)
imglib/                   제품 이미지 라이브러리 — index.json(이미지 5,088장의 메타데이터) · ecat/<id>.jpg(e-카탈로그 쪽에서 자른 1,768장, 긴 변 1400px)
imglib_cache/             (폴더에 없음) 원본 주소(samsung.com) 사진 사본 — fetch_imglib.py 가 index.json 의 url 로 다시 받음
build/                    collect_site.mjs · fetch_ecat_text.py · build_db.py · schema.sql · export_app.py · pack_images.py · download_images.sh · cut_ecat_photos.py · photos_db.py · photo_tool.py(사진 자르는 도구: grid · zoom · crop(물체에 맞게 조임) · none · find · sheet)
```

## 알아 둘 것
- e-카탈로그 목록 페이지의 이름과 실제 권이 다른 것: Dir 297 '삼성 콜드체인 시스템' = 실제 「시스템에어컨 종합카달로그」(532쪽, 콜드체인 포함), Dir 203 'B2B LED조명' = 실제 「DVM Home 일반용」. LED 조명 카탈로그는 목록에 없는 Dir 93 에서 받음.
- 받지 않은 권: 조달 종합(359) · B2C(6권), 목록에 없는 DVM Home 소상공인(124) · SAC 설치 가이드(263, 제품 아님).
- 사이트 PDP 1건(G000181220 무풍 1Way)은 수집 때 500 오류 — 목록 · 스펙은 있고 특장점만 없음.
- 2024 업종 리플릿(197~255)의 연결 품목은 구형 모델일 수 있음(상세에 '2024 리플릿' 표시).
- 협력사 제품(센도리 · 세원센추리 · 태양광 모듈 등)은 시스템에어컨 종합카달로그에 실린 그대로 들어 있고 상세 note 에 협력사 표기.

## 제품 사진 (2026-10-19)
- **사이트 카드 602**: samsung.com/business 상품 카드 이미지(앞 3장) — 그대로.
- **카탈로그 전용 426**: 그 제품의 e-카탈로그 쪽(같은 카탈로그의 소개 · 라인업 · 사양 쪽 포함)에서 **그 제품의 사진 영역만** 자름. 에이전트 11개가 batch 로 나눠 자르고(ecat/PHOTO_BRIEF.md 규칙 — 이름표 · 모델코드 · 표의 같은 행으로 이 제품의 사진인지 확인, 캡션 · 표 선 · 옆 제품은 빼기), 자르지 않은 독립 검토 에이전트 4개가 전부(465장) 다시 봄 → wrong 0 · dirty 5(2개 다시 자름, 3개는 원본 그림에 화살표 · 각주가 겹쳐 그대로) · unclear 1.
  - 종류(첫 사진): 제품 컷 377 · 설치 장면 8 · 대표 그림 29(서비스 · 솔루션 · 일부 도면) · 두 번째 사진이 있는 제품 다수(같은 제품의 다른 모델 · 장면)
  - 비즈니스 종합(360) · 통합공조(161) · 데이코(131)는 카탈로그 PDF(펼침면)에서 같은 영역을 큰 해상도로 다시 렌더(100개 제품)
  - 카탈로그에 그 제품 그림이 없는 것: 같은 종류의 실제 사진으로 대신하고 무엇의 사진인지 note 에 적음 — 소모품 4(사이트 소모품 카드 사진) · Neo 거실등 연결대 1(일반 연결대 사진). 그래도 없는 8개는 사진 없음(ecat/photos.json none: CSK-HP 히트펌프 · 배관 Kit · 퍼스트/라스트마일케어 · 무선 충전기 EP-OL715 · 인체감지센서 키트 · 키친핏 설치 자재 · 잉크젯 잉크)
  - 작은 사진: 가로 80px 미만 31장(카탈로그에 그보다 큰 사진 없음 — 하만 마이크 · 시스템에어컨 액세서리 표 등)
- **큐레이션 40**: 사이트 카드와 합친 13은 그 카드 사진, 나머지 — 앱 이미지 라이브러리에 있던 그 모델 컷 10(img) · 같은 모델/시리즈 사이트 카드 8(E-Paper = EM32DX-A 같은 모델 · 북5 Pro · 식기세척기 · 에어드레서 · 전열교환기 · 인덕션 · 상업용 세탁/건조 · 스마트모니터는 M70M 사진으로 대신) · 카탈로그 · 공식 PDF 에서 자른 6(더 월 올인원 IAB · Onyx(삼성 Onyx 카탈로그 PDF) · 갤럭시 A17/A37 · 워치8 클래식 · JBL Control/VTX) · 원래 있던 2. 스마트태그2는 쓸 수 있는 공식 사진을 못 찾아 일러스트.
- 앱 표시: 흰 바탕 카탈로그 컷은 흰 칸(thK 'w'), 장면 · 그림은 꽉 채움('s'), hover 상세 갤러리에 출처(「카탈로그」 N쪽 · samsung.com 카드 이름 + 대신 쓴 이유) · 종류(제품 컷 · 설치 장면 · 대표 화면).

## 제품 이미지 라이브러리 (2026-10-19)

요청: “모든 제품들에 대해서 연관된 이미지도 찾아서 매칭시켜놔야해. 모든 소스에서 정확히 매칭되는 제품에 대한 이미지를 매칭하고 각 이미지에는 메타데이타를 입력해서 차후 탐색이 가능하게해. 아이콘이나 불필요한건 가져오지마”

- **5,088장 · 앱 제품 1,068개 중 1,030개**에 연결(제품 ↔ 이미지 8,633쌍). 출처: samsung.com 상품 카드 2,071 · 상세페이지 특장점 1,196 · e-카탈로그 쪽에서 자름 1,768 · 고객 도입사례 25 · 앱 이미지 라이브러리 28. 종류: 제품 컷 2,692 · 기능 디테일 1,118 · 설치 장면 859 · 화면 332 · 구성 그림 87
- 이미지가 없는 38개는 서비스 · 솔루션(케어십 · 세척 서비스 · b.IoT · Knox · 삼성헬스 · MPS …)처럼 공식 자료가 아이콘 · 배너뿐이거나, 소모품처럼 카탈로그에 그림이 없는 것(제품 사진은 기존 img/prod 갤러리에 있음)
- 메타데이터(imglib/index.json · DB lib_image): id · kind · source · products(+ relation own/catalog/case) · title · desc(설명) · alt(원래 대체 글) · ctx(특장점 제목 · 카탈로그 「권」 N쪽 · 사례) · spaces · ind · models · cats · url(원본) · page · box(쪽 안 영역) · case(id · 고객 · 업종 · 주소) · also(같은 그림의 다른 출처) · dhash · w/h
- 검색: DB `lib_image_fts`(제품명 · 설명 · alt · 맥락 · 공간 · 모델 · 사례 고객) · 앱 이미지 넣기 팝업 ‘제품 이미지 라이브러리’ 칸 · 제품 hover 상세 갤러리

### 만든 순서
1. 후보: 사이트 수집 image_asset(상품 카드 3,543 · 상세페이지 특장점 8,122, 제품마다) + 도입사례 페이지 사진 → 같은 그림 합침(md5) → 시트(24장씩)로 사람 · 에이전트가 종류를 붙이고 drop(아이콘 · 로고 · 배너 · 표 · 치수 도면 · 비교 연출 · 다른 제품 …)
2. e-카탈로그 1,559쪽(제품이 실린 쪽)을 28묶음으로 나눠 에이전트가 쪽마다 그 쪽에 실린 제품의 사진만 잘라 냄(이름 · 모델코드 · 표의 같은 행으로 제품 확인, 쪽 폭 12% 미만 · 글자 덮인 사진 제외)
3. 조립(dHash 4비트 + 색까지 같은 그림은 하나로, 상품 카드 > 상세페이지 > 앱 > 카탈로그 > 사례 우선) → 독립 검토(표본 236장) → 걸린 유형(특장점 인포그래픽 · 사례 캡처 · 구형 모델 연결)이 많아 **상세페이지 · 도입사례 · 앱 전부와 카탈로그 · 카드의 컷 외 4,306장을 다시 봄**(2차 정제: drop 1,800여 · 제품 연결 끊기 47 · 종류 고침 43)
4. 규칙: 2021년 전 도입사례 사진은 뺌(지금 모델과 세대가 다른 경우가 많음) · 아주 작은 그림(긴 변 200px · 2.5만 화소 미만)은 그 제품의 유일한 사진일 때만 · ‘실사 없음’ 도면 뺌 · 치수 · 포트 번호 도해(alt) 뺌
5. 재검토(새 표본 205장): 큰 문제(다른 제품 · 불필요) 약 1할 남짓 — 남은 유형은 오래된 사례 · 아주 작은 카탈로그 컷 · 앱 라이브러리 일부라 위 규칙과 개별 판정(rlabels 900)으로 다시 걸러 냄

### 파일 · 다시 만들기
- 판정 원본(이 저장소 밖 작업 폴더): 카탈로그 쪽에서 자른 기록(쪽 · 영역 · 제품 · 종류 · 설명) · 시트 라벨 · 2차 정제 판정 → 결과는 imglib/index.json 하나에 모임(이 파일이 기준)
- `build/imglib_db.py` → DB 표 · `build/fetch_imglib.py`(url 사진 받기) · `build/pack_imglib.py`(앱 묶음, 상품 카드 컷은 img/prod 갤러리 주소 재사용 1,052장) · `build/merge_prod_packs.py`(제품 묶음 d00~03 → d00, g09 → g08: 아티팩트 파일 수 한도 때문에 자리를 만듦)
- 앱 미리보기는 400×300(컷 320×240) WebP 60 — 장표에 크게 넣을 원본은 url(samsung.com) · imglib/ecat 파일
