# e-카탈로그 쪽에서 솔루션 이미지 잘라 내기 — 작업 브리프

Winmate(삼성 B2B 제안서 도구)의 '솔루션' 카드 17개 중 실제 이미지가 적은 솔루션을, 삼성 공식 e-카탈로그(samsung.aiibook.net)의 관련 쪽에 실린 사진 · 화면 · 구성도로 보강합니다.
배치 파일 `/home/claude/media/ecat/batch_N.json`: 항목마다 `key`(쪽 키 예 354_003) · `catalog`(카탈로그 이름) · `page` · `sols`(이 쪽과 관련된 솔루션 id · 이름 · 설명) · `text`(그 쪽의 글).

## 도구 (PHOTO_WORK 환경 변수를 꼭 붙일 것)

```bash
cd /home/claude/media/ecat
export PHOTO_WORK=/home/claude/media/ecat
python3 ptool.py grid KEY                        # → view/KEY.grid.jpg (쪽 전체 + 5% 격자) — Read로 봄
python3 ptool.py zoom KEY x0 y0 x1 y1            # → view/KEY.zoom.jpg (영역 확대 + 1% 격자)
python3 ptool.py crop KEY KEY x0 y0 x1 y1 --n 1 --kind scene --nosnap --note "설명"
#   → crops/KEY.jpg (n=1) · crops/KEY__2.jpg (n=2) …  + view/KEY.check.jpg(잘린 결과 확인용) — 좌표는 쪽의 % (0~100)
```
- 첫 번째 인자(PID)와 두 번째 인자(쪽 키)는 둘 다 KEY로 같게 씁니다. 한 쪽에서 여러 장이면 `--n 1, 2, 3 …`.
- 사진 · 화면처럼 사각 틀을 꽉 채운 것은 `--nosnap`(상자 그대로). 흰 바탕 위 제품 컷은 snap(기본)이 물체에 맞춰 조여 줍니다.
- 자른 뒤 반드시 `view/KEY.check.jpg`(n>1이면 `KEY__n.check.jpg`)를 Read로 보고, 글 띠 · 다른 사진 · 테두리가 섞였으면 좌표를 고쳐 같은 --n으로 다시 자릅니다.

## 무엇을 자르나

그 쪽에서 **솔루션을 보여 주는 의미 있는 그림만**: 솔루션이 쓰이는 현장 사진(scene) · 사람이 쓰는 장면(people) · 앱/대시보드 화면(screen) · 구성도/연동도(diagram) · 솔루션과 함께 쓰는 핵심 기기 컷(product, 예: 중앙 제어기 · 워치 · 콘덴싱 유닛) · 표지의 대표 키 비주얼(kv).
- 빼는 것: 글 상자 · 표 · 스펙 표 · 아이콘 · 픽토그램 · 로고 · QR 코드 · 인증 마크 · 아주 작은 그림(긴 변이 쪽 폭의 12% 미만) · 같은 그림의 반복.
- 사진 위에 붙은 큰 제목 · 설명 글은 잘라 냄(사진 영역만). 사진 속 화면 글자 · 간판은 괜찮음.
- 한 쪽에 의미 있는 그림이 없으면 자르지 않고 결과 파일에 이유만.

## 결과 파일 (쪽마다 하나) `/home/claude/media/ecat/out/<KEY>.json`

```json
{"key": "354_003", "crops": [
  {"n": 1, "sol": ["safety"], "kind": "people", "d": "손목 워치의 온열 위험도 경고 화면", "rep": 2},
  {"n": 2, "sol": ["safety"], "kind": "screen", "d": "심박수 이탈 알림 대시보드", "rep": 1}
], "skip": "아이콘 3개는 픽토그램이라 뺌"}
```
- `sol`: 배치의 sols 중 이 그림이 보여 주는 솔루션 id(여럿 가능). 어느 쪽도 아니면 그 그림은 자르지 않음.
- `kind`: scene · people · screen · diagram · product · kv 중 하나(crop의 --kind와 같게).
- `d`: 보이는 것을 한국어 30자 이내(지어내지 않음, 고객사 · 사람 이름 없이).
- `rep`: 이 솔루션 카드 썸네일로 0~3(3 = 솔루션이 무엇인지 한눈에 보이는 깨끗한 현장 · 화면).
- 결과 파일의 n과 crops/ 파일이 정확히 맞아야 합니다(다시 자른 뒤 버린 n이 남지 않게, 안 쓰는 n은 파일을 지우기).

배치를 다 끝내면 쪽 수 · 자른 장 수 · 솔루션별 장 수만 짧게 보고합니다.
