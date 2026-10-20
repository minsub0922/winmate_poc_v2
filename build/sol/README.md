# build/sol — 표준 제안서 · 공유오피스 Lite 15장 (L_SOL_01..15 · bs22)

첨부 명세 ‘공유오피스 Lite 제안서 — 슬라이드별 레이아웃 재현 명세’(PDF 15쪽, 960.0095×540pt)를 Winmate 레이아웃으로 복원한 도구 모음이에요.
작업 세션의 경로(`/home/claude/gen/...`)가 그대로 적혀 있으니, 다시 돌릴 때는 파일 맨 위 경로만 바꿔 주세요.

| 파일 | 하는 일 |
|---|---|
| `imgtools.py` | 사진 손질 도구 — 비율 자르기(crop_aspect) · 설명 상자 / 지시선 지우기(OpenCV xphoto FSR 인페인팅) · 제품 컷 합성(put_cut, 바닥 그림자) · 저장 + manifest |
| `build_imgs.py` | samsung.com/sec/business 원본 → 55개 이미지(사진 · 제품 컷 · QR 9 · 로고) + `manifest.json`(묶음 · 출처 · 처리) |
| `plan.py` | P03 아이소메트릭 평면도 SVG(공간 라벨 위치에 맞춰 공간 배치) → PNG |
| `lib.py` | 레이아웃 빌더 — 명세 좌표(pt) × 4/3, 글자는 기준선으로 배치(top = 기준선 − (줄높이/2 + 0.436 × 글자 크기)), 카드 · QR · 띠 · 쪽 번호(data-pgno) |
| `pages.py` | 15장 정의(글 · 사진 칸 · 카드 위치 · 메타) |
| `gen.py` | 15장 → `meta.json` · `html.json` + 미리보기 HTML |
| `shot.mjs` | 미리보기 스크린샷 + 글 넘침 · 이미지 누락 검사 |
| `integrate.py` | `img/fill/sol-a.json` · `sol-b.json` 묶음 + `src/std_layouts.js`에 L_SOL_* 넣기(다시 돌려도 같은 결과) |
| `fills.py` | bs22(N 공유오피스) 채운 문구 · 이미지 → `src/scenario_fills.js` |

검사: `node build/test-std-sol.mjs` — 표준 제안서 그룹 두 번째 줄 · 15장 팝업 · 묶음 사진 · PPTX · 제안서 시작 · 쪽 번호.
