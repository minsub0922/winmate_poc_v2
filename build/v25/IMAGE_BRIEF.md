# 이미지 수집 브리프 — Winmate 표준 제안서 3종 (AI 스토어 · AI 오피스 · AI 아파트)

삼성 B2B 제안서 앱(Winmate)에 표준 제안서 덱 3개를 더한다. 덱의 각 사진 칸에 들어갈 이미지를 모은다.
**원칙: 이미지는 samsung.com/sec/business (비즈니스 업종 · 솔루션 · 제품 · 도입사례 페이지)에서 최대한 가져온다.** 그다음은 samsung.com/sec 제품 상세 페이지, 그다음은 다른 나라 samsung.com. 직접 그리거나 AI로 만든 이미지는 쓰지 않는다. 지어낸 장면도 안 된다.

## 맡은 덱과 칸 목록
- 칸 목록: `/home/claude/v3/slots_<deck>.json` (deck = store | office | apt)
  - 항목: `key`(파일 이름) · `w`,`h`(앱에서 그려지는 칸 크기, px — 이 **비율**로 자른다) · `kind`(space 장면 사진 · cut 투명 제품 컷 · ui 솔루션 화면) · `want`(원하는 장면) · `where`(찾아볼 곳 힌트) · `use`(쓰는 장)
- 덱 원본 내용이 궁금하면 `/home/claude/v3/<deck>.txt` (페이지별 문구 · 원본 사진 설명 요약) 를 본다.

## 1단계 — 앱에 이미 있는 사진 먼저 (재사용)
이미 samsung.com 에서 가져와 앱에 들어 있는 사진이 많다. 칸과 잘 맞으면 **재사용**한다(새로 받지 않음).
- 목록 · 설명: `/home/claude/w/src/photo_sources.md` (img/ph/*.jpg 201장), `/home/claude/w/src/fill_sources.md` (묶음 `img/fill/<묶음>.json#k`), `/home/claude/w/data/images.json` (pids → file · desc)
- 파일 위치: `/home/claude/w/img/...` (묶음 JSON 은 `{"images":[dataURL,...]}` — #k 번째)
- 재사용 기록: `reuse(deck, key, ref, alt)` — ref 는 `img/ph/x.jpg` · `img/fill/x.json#k` · `img/bs/p-x.png` · `img/x.png` 처럼 앱 안 주소 그대로.
- 재사용할 때도 반드시 실제 그림을 열어 보고(Read) 칸 설명과 맞는지 확인한다. 같은 덱 안에서 한 사진을 두 칸에 쓰지 않는다(칸 설명에 ‘같은 사진’이라 적힌 경우 제외).

## 2단계 — samsung.com 에서 새로 받기
- 도구: `/home/claude/v3/imgkit.py` — `sys.path.insert(0,'/home/claude/v3'); from imgkit import *`
  - `page_images(url)` 페이지의 images.samsung.com 이미지 주소 목록 · `get(url, out)` 받기 · `crop_to(im, w, h, anchor, box)` 비율 자르기
  - `save_photo(deck, key, im, alt, page, src, note)` 장면 · 화면 저장(JPEG, 가로 최대 1600) · `save_cut(...)` 제품 컷(투명 PNG, 여백 자르기) · `white_to_alpha(im)` 흰 배경 → 투명(투명 PNG 가 없을 때만)
  - `missing(deck, key, why)` 못 찾음 · `contact(deck)` 확인용 밀착 인화지 PNG 경로 반환
- 셸에서 curl 로 samsung.com 에 접속된다(`page_images` 가 curl 사용). 이미지 주소 끝의 `?$ORIGIN_JPG$` 같은 꼬리는 원본 크기를 받는 데 도움이 된다. 페이지가 JS 로 그려져 이미지가 HTML 에 없으면 페이지 소스의 JSON(예: `data-desktop-src`, `"image":` 등)도 뒤져 본다.
- 받은 원본은 `/home/claude/v3/raw/<deck>/` 에 둔다(작업용).
- 자르기: 칸의 w:h 비율로. 중요한 대상(제품 · 사람 얼굴 · 공간의 핵심)이 잘리지 않게 anchor/box 를 고른다. 해상도가 칸보다 너무 작으면(칸 가로의 0.8배 미만) 다른 사진을 찾는다.
- 사진 속에 설명 라벨 · 큰 홍보 문구 · 가격이 박힌 이미지는 피한다(UI 화면 속 글자는 괜찮음). 워터마크 금지.
- 제품 컷(cut): samsung.com 제품 상세 페이지의 대표 이미지(보통 `kdp/goods/.../*.png` 투명 PNG). 정면 또는 사선. 흰 배경 JPG 뿐이면 `white_to_alpha` 로 배경을 투명하게.
- 화면(ui): 솔루션 페이지의 대시보드 · 앱 화면 이미지. 모니터/폰 목업에 들어간 화면도 좋다.
- 도입사례 칸(`*_case*`): 해당 도입사례 페이지의 사진을 쓴다 — 대표(main)는 외관/대표 장면, 보조 a·b·c 는 그 페이지에서 칸 설명(효익 포인트)에 맞는 장면.
- alt: 사진에 실제로 보이는 것을 한국어로 짧게(40자 안팎), 실제 현장이면 장소 이름을 괄호로. 예: `천장 4Way 카세트가 있는 카페 홀 (말리커피)`.
- note: 처리 내용(예: `가운데 비율 자르기`, `흰 배경 투명 처리`).

## 3단계 — 확인
- 저장한 이미지는 모두 직접 열어 본다(Read). 끝나면 `contact(deck)` 밀착 인화지를 Read 로 한 번 더 훑어 칸 설명과 다른 것 · 잘린 것 · 흐린 것을 다시 고친다.
- 모든 칸이 manifest(`/home/claude/v3/img/<deck>/manifest.json`)에 new · reuse · missing 중 하나로 있어야 한다.

## 하지 말 것
- `/home/claude/w` (앱 소스)는 읽기만. 고치지 않는다.
- 다른 덱 폴더(`/home/claude/v3/img/<다른 deck>`)는 건드리지 않는다.
- samsung.com 이 아닌 사이트의 이미지(스톡 사진 · 뉴스 사진 등)는 쓰지 않는다. news.samsung.com 은 마지막 수단으로만, note 에 밝힌다.

## 끝나면 보고
칸 수 · new/reuse/missing 개수, missing 칸과 이유, 원하는 장면과 조금 다른 것으로 대신한 칸(무엇으로 대신했는지) 목록을 짧게.
