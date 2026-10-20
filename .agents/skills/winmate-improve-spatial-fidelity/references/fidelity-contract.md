# 구현·검증 계약

경로는 Winmate 저장소 루트 기준이다. 현재 파일을 읽고 적용하며 고정된 자산 수를 전제로 하지 않는다.

## 정본과 생성물

| 목적 | 경로 |
| --- | --- |
| 첫 화면·스튜디오 | `app/web/src/pages/SpatialStudioPage.jsx`, `styles/spatial.css` |
| 제품·모델·스펙 | `app/data/catalog.json`, `products_db.json`, `runtime/winmate_products.sqlite`의 `wm_ui_detail` |
| 분류·치수·동일 모델 근거 | `app/scripts/build_spatial_products.py` |
| 별도 확인한 제조사 근거 | `app/data/spatial/product-evidence.json` |
| 원본 이미지 추출·방향·색상 | `app/scripts/spatial_appearance.mjs` |
| 제품·가구 레시피 | `app/web/src/domain/spatial/geometry.js`, `product-recipes.js`, `furniture-recipes.js`, `furniture-catalog.js` |
| 회전·스케일·외곽 | `part-geometry.js`, SVG 투영 `part-plan.js` |
| 3D·2D·배치 | `render-three.js`, `plan-svg.js`, `scene.js` |
| 전체 라이브러리·해시·동결 버전 | `app/scripts/build_spatial_library.mjs` → `app/data/spatial/{library,scenes,examples}.json`, `versions/` |
| 오브젝트 이미지 | `build_spatial_object_previews.mjs` → `app/web/public/assets/spatial-objects/` |
| 제조사 원본 참고 이미지 | `app/web/public/assets/spatial-references/` (자체 생성 CC0 형상과 저작권 범위가 다름) |
| 관리자 예시 이미지 | `app/scripts/build_spatial_previews.mjs` |

`dimensionSource`, `dimensionEvidence`, `dimensionScope`, `specModel`, `specSources`로 치수의 근거를 추적한다. `imageEvidence`, `referenceImage`, `appearance.orientation/surface/facade`로 모델 사진과 적용 면을 추적한다. 원본 이미지가 없거나 관측 방향이 불명확하면 다른 모델 이미지로 빈칸을 채우지 않는다.

재생성은 의존 순서대로 완료를 기다린다.

```sh
app/.venv/bin/python -B app/scripts/build_spatial_products.py
node app/scripts/build_spatial_library.mjs
node app/scripts/build_spatial_object_previews.mjs
node app/scripts/build_spatial_previews.mjs
```

라이브러리 생성이 끝나기 전에 미리보기를 실행하면 이전 해시의 이미지를 만든다. `reference/live`의 보존 자료나 심볼릭 링크에 쓰지 않는다. 임시 서버가 자산을 시작 시 읽었다면 새 생성물 검토 시 서버를 새로 열거나 시험에서 현재 JSON을 명시적으로 제공한다.

## 검증

```sh
node app/tests/spatial-fidelity.mjs
node app/tests/spatial-scenes.mjs
node app/tests/spatial-naturalness.mjs
node app/tests/spatial-edit.mjs
node app/tests/spatial-layout.mjs
node app/tests/spatial-furniture.mjs
PYTHONDONTWRITEBYTECODE=1 app/.venv/bin/python -B -m pytest app/tests/test_spatial.py app/tests/test_spatial_edit.py -q
npm --prefix app/web run build
```

첫 로딩·모바일·텍스처 내보내기는 `app/tests/spatial-fidelity-ui.mjs`를 사용한다. 시험 API 기본 포트는 8803이며 `SPATIAL_TEST_API_PORT`로 바꿀 수 있다. 프런트는 5203이다. `app/tests/fixtures/spatial/server.py`를 다음 환경변수와 서로 다른 임시 경로로 실행한다.

```text
WINMATE_API_PORT=8803
WINMATE_AUTH_DIR=<temporary>/auth
WINMATE_SPATIAL_DB=<temporary>/spatial.sqlite
WINMATE_STORYBOARD_DIR=<temporary>/storyboards
```

시험 로그인은 fixture 파일을 읽어 확인한다. 실사용 히스토리를 비우는 기존 UI 시험을 운영 서버에 실행하지 않는다. 새 포트를 고를 때 프런트의 Origin/proxy 설정도 맞춘다.

`app/scripts/review_spatial_fidelity.mjs`는 `output/spatial-fidelity/`에 이미지·형상 비교 HTML, 전체 연락표와 `audit.json`을 만든다. 변경 전 비교가 필요하면 작업 시작 때 원본 `product-objects.json`을 `objects-before.json`으로 그 출력 디렉터리에 보관한다. 결과 이미지를 실제로 열어 보고, 스크립트의 통과만으로 시각 검토를 대체하지 않는다.

`spatial-fidelity.mjs`는 전체 메시 외곽·축·설치 바닥과 회전 팬을 검사한다. 헤더 검사는 첫 표시부터 로딩 완료까지 프레임별 위치·크기 범위를 기록한다. 검토 산출물은 해당 생성물의 `sourceHash`와 맞아야 한다.

## 화면 제품과 스크롤 목록의 추가 계약

- `app/scripts/spatial_display_geometry.py`: 본체·패널·베젤·스탠드·곡률의 물리 크기를 분리한다.
- `app/scripts/spatial_display_photo.mjs`: 원본 제품의 화면 실루엣과 네 꼭짓점으로 정면 보정한다. 수동 검토한 설치 사진 영역도 근거를 남긴다.
- `app/web/src/components/spatial-object-drawer.jsx`: 40개 단위 스크롤 페이지, 필터 초기화, 선택 유지.
- `app/web/src/domain/spatial/asset-upgrade.js`: 과거 장면을 새 치수로 검증하며 바꾸고, 동일 크기 오브젝트의 위치를 보존한다.
- `app/tests/spatial-signage-pagination-ui.mjs`: 별도 API 8804 / 웹 5204에서 스크롤, 과거 버전 업데이트·undo/redo·저장과 모든 화면 제품의 사진 비교를 검사한다.
- `app/scripts/review_display_reconstruction.mjs`: `output/spatial-signage-review/review.html`, `before-after.png`, `display-audit.json`을 만든다. 현재 라이브러리 생성과 썸네일 갱신이 끝난 뒤 실행한다.
- `app/tests/test_product_projection_refresh.py`: 임시 DB에서 검토 모델 변경이 자동 반영되고 원본 DB가 보존되는지 검사한다.

제품의 실제 모델을 교정하는 경우 `app/data/product-details/dNN.json`과 `products_db.json`의 해당 항목을 함께 확인한다. `app/.venv/bin/python -B app/scripts/prepare_data.py` → `node app/scripts/export_agent_data.mjs` 후 `test_product_specs.py`로 UI·검토 원장·Agent KB의 일치를 확인한다. 투영 DB는 입력 파일의 SHA-256 지문을 기록하며 변경이 없으면 재사용한다.

동시 개발 중 포트는 `SPATIAL_PREVIEW_PORT`(오브젝트), `SPATIAL_EXAMPLE_PREVIEW_PORT`(예시), `SPATIAL_TEST_WEB_PORT`(사진·페이지 UI 검사)로 분리할 수 있다. `SPATIAL_REVIEW_REPORT`로 검증 보고서 이름을 분리한다. UI 검사 보고서는 `productFingerprint`도 기록하므로 사람·소품 변경으로 전체 라이브러리 해시만 달라진 경우 제품 검증 대상이 같은지 구분한다.
