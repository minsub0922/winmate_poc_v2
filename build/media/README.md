# 솔루션 · 유관사례 이미지 (data/media.json · img/media/)

솔루션 17개 · 유관사례 218건의 카드 썸네일(더미 일러스트 대신)과 hover 상세 갤러리 · 레이아웃 상세 '참고 자료' 이미지 줄에 쓰는 실제 이미지 2,347장(2026-10-19).
각 항목의 **연관 리소스**에서 모아, 사람이 보듯 한 장씩 고르고 다시 독립 검수했습니다.

## 어디서 모았나

- **유관사례 218건** — samsung.com/sec/business 고객 도입사례 원문 198건(본문 이미지 · 목록 썸네일 · 공유 이미지 · 적용 제품 컷), 원문이 리포트 PDF인 사례(PDF 속 사진 · 쪽)와 영상인 사례(영상 대표 장면).
  원문이 사진과 글을 한 장에 섞어 둔 '본문 조각'은 사진 부분만 자동으로 잘라 냄(`photocrop.py`).
- **솔루션 17개** — samsung.com/sec/business 솔루션 페이지(MagicINFO · VXT · b.IoT · 링크 클라우드 · Knox · 콜드체인 · 중앙공조 · DMS 2.5 · 터치 중앙 제어기 · Wi-Fi KIT · 케어 서비스 · CounThru · SecuThru …),
  해외 삼성 비즈니스 페이지(LYNK Cloud · DeX · SmartThings Pro · 공공 안전), vxt.samsung.com, samsungknox.com, 스마트싱스 · 덱스 소개 페이지, 업종 페이지 13개(이미지 옆 글로 어떤 솔루션인지 판단),
  **삼성 e-카탈로그 75쪽**(스마트싱스 프로 안전관리 · 삼성케어플러스 · 통합공조 · VXT · 시스템에어컨 종합(b.IoT · DMS · 콜드체인) · 비즈니스 종합 · AI 공간 카탈로그 · 호텔 TV · 갤럭시 탭/엑스커버/북)에서 사진 · 화면 · 구성도만 잘라 냄.
- 뺀 것: 글 위주 카드 · 제목 띠 · 표 · 아이콘 · 로고 · QR · 배너 · 다른 사례 썸네일 · 거의 같은 사진 · 잘못 잘린 조각, 앱 이미지 라이브러리(data/images.json)에 이미 있는 사진.

## 고른 과정 (판정 기록은 `data/`)

1. 1차 선별(`data/review_decisions.json`, 브리프 `data/review_BRIEF_*.md`) — 항목마다 번호 붙은 검토 시트를 보고 쓴다/뺀다 · 종류 · 대표 점수 · 설명.
2. 독립 검수(`data/verify_decisions.json`, 브리프 `data/verify_BRIEF.md`, `verify_sheets.py`) — 처음 보는 검수자 8명이 결과 2,286장을 다시 봄:
   wrong 17 · text 27 · slice 33 · dup 22 · bad 1 → 뺌, trim 235 → 글 띠 · 옆 사진 조각 · 여백을 잘라 냄, 대표 사진 교체 10 · 설명 고침 33.
   (사례 144는 영상 장면의 원형 인물 부분만 수동으로 잘라 대표 사진으로 씀)
3. e-카탈로그 보강(`data/ecat_out.json` · 자른 영역 `data/ecat_crops.json`, 쪽 목록 `data/ecat_pages.json`, 브리프 `data/ecat_BRIEF.md`) — 75쪽에서 152장, 검토 후 4장 뺌(`pack_media.py` ECAT_DROP), 297_094 쪽은 SmartThings Pro로 다시 연결(SOL_FIX).
4. 해외 공공 안전 페이지 보강(`data/xsafety_extra.json`) — 안전 · 관제 8장 + DeX 2장.

## 앱에 넣는 방식

- **묶음 3개**(아티팩트 파일 수 한도 511 때문에): `img/media/t.json` 카드 썸네일 235장(480px, 3.7 MB) · `g0.json` · `g1.json` 갤러리 2,303장(긴 변 720px AVIF, 각 16 MB 남짓 — 큰 이미지는 묶음에 맞춰 품질을 단계적으로 낮춤).
- `data/media.json`(번들에 들어감, 318 KB) = `{ P: 묶음 주소, L: 묶음별 data URL 위치 · 길이, D: 원본 주소 앞부분 사전, case: {id: item}, sol: {id: item} }`.
  item = `{ th: 썸네일 코드, g: [[이미지 코드, 종류 한 글자, 설명, w, h, 원본, 출처 쪽 번호, e-카탈로그 표시?]], pages?: [출처 쪽] }` — 코드 = 묶음 번호 × 10000 + 묶음 안 번호. 사례의 pages가 없으면 catalog의 사례 url.
- **한 장씩 받기**: `src/bgpack.js` `registerRanges` — 묶음 안 바이트 범위로 Range 요청(206)을 보내 그 장만 받음. 서버가 Range를 무시하면(200) 그 응답을 묶음 전체로 쓰고 이후 그 묶음은 통째로 씀(한 번만).
- `src/mediapack.js` — mediaOf · mediaThumb · mediaPhotos(갤러리 순서: 대표 → 원문 순서 → 해외 · e-카탈로그 보강) · mediaCover(썸네일 묶음의 대표 한 장). 출처 표시: 도입사례 원문 · 솔루션 공식 페이지 · 업종 페이지 · 해외 페이지 · e-카탈로그 「권」 N쪽.
- 쓰는 곳: `thumbs.jsx`(솔루션 · 사례 카드 썸네일 — 큐레이션 화면이 있던 MagicINFO · VXT · SmartThings Pro와 사례 1490은 기존 사진 그대로) · `ui/peek.jsx`(hover 상세 갤러리에 매칭 이미지 전부, 제품 · 솔루션 상세의 '관련 도입사례' 사진은 사례 대표 한 장씩) · `ui/detail.jsx`(레이아웃 상세 '이 장 참고 자료'의 연결 사례 · 솔루션 밑 이미지 줄 8장 + 더 보기, 누르면 빈 이미지 칸에) · `pptx.js`(AVIF · WebP 이미지는 PPTX에 JPEG/PNG로 바꿔 넣음).
- 출처 대장: `src/media_sources.md`(이미지마다 설명 · 종류 · 가져온 곳 · 원본 주소).

## 다시 만들기

스크립트의 작업 폴더는 `/home/claude/media`(스크립트 위쪽 상수 · 인자). 원본 이미지(수집 808 MB)는 저장소에 두지 않으니 1~3단계로 다시 받습니다.

```bash
python3 build/media/crawl_cases.py                 # 도입사례 원문 → case_pages.json
node build/media/list_all.mjs                      # 도입사례 목록(썸네일 · 영상 · 리포트 링크)
node build/media/page_imgs.mjs sol_urls.json sol_pages.json   # 솔루션 · 업종 페이지 이미지(+ 주변 글)
python3 build/media/download.py all_urls.json      # + filedl.mjs · fileinfo.mjs · posters.mjs (PDF · 영상)
python3 build/media/assemble.py && python3 build/media/process.py   # 후보 → 사진 조각 · 중복 제거 (cands2.json)
python3 build/media/sheets.py                      # 1차 검토 시트 → data/review_decisions.json
python3 build/media/build_media.py <repo>          # 1차 선별 → final.json · media_names.json
python3 build/media/verify_sheets.py 8             # 독립 검수 시트 → data/verify_decisions.json
# e-카탈로그: data/ecat_pages.json 의 쪽 이미지(https://samsung.aiibook.net/b2b/catImage/<Dir>/<쪽>.jpg)를 받아
#   proddb/build/photo_tool.py crop 으로 data/ecat_crops.json 의 영역을 다시 자름
python3 build/media/pack_media.py <repo> [작업 폴더]   # → img/media/*.json · data/media.json · src/media_sources.md (AVIF 인코딩은 작업 폴더 enc_cache/에 캐시)
node build/build.mjs && node build/test-media.mjs  # RANGE=0 이면 Range 무시 서버로 점검
```
