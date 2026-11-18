# 조감도 시트 3D 조작 · 중앙형 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조감도 시트를 팝업에서 3D로 조작하고, 같은 내용을 「좌 조감도 + 우 설명」 ↔ 「중앙 조감도 + 꺽쇠 화살표 + 버블」로 전환한다.

**Architecture:** `applyOverrides`가 `ov.spatialMode==='center'`일 때 같은 DOM을 중앙형으로 재배치한다(칸 번호 유지 → 편집 · PPT · 썸네일 공용). 3D는 `Slide` 밖, 팝업 무대 위 덧씌움 컴포넌트가 렌더러를 직접 올린다. 표준 제안서 조감도는 생성 스크립트가 핀 좌표 표와 장면 파일을 낸다.

**Tech Stack:** React · three.js(`domain/spatial/render-three.js`) · Vite · Playwright · node 테스트(`app/tests/*.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-16-birdseye-sheet-interaction-design.md`

## Global Constraints
- 대상 레이아웃: `L_SPATIAL_3D` · `L_SPATIAL_2D` · `L_VS_BIRD_S3~S6` · `L_VS_BIRD_B7~B10`. 그 밖의 시트는 동작이 바뀌지 않는다.
- 글 칸 번호(`data-tb`)는 바꾸지 않는다.
- 원본 조감도 히스토리는 쓰지 않는다. 시트 사본은 `ov.spatial`.
- 읽기 전용 팝업은 아무것도 저장하지 않는다.
- 이 작업 트리는 다른 세션과 공유한다. 커밋은 사용자가 요청할 때만 하고, 다른 세션이 고치고 있는 파일은 최소한으로 건드린다.
- 화면 문구는 한국어.

## Review Focus
- 좌표가 없는 조감도 시트(히스토리 그림만 있고 `ov.spatial`도 표준 핀도 없음): 전환 버튼이 깨진 중앙형을 그리지 않고, 3D가 준비되면 그때 전환된다 → Task 2 테스트(`points` 없음 → `null`).
- 공간이 화면 밖/뒤로 돌아간 회전: 핀 · 화살표가 엉뚱한 곳에 남지 않는다 → Task 2 테스트(`visible:false` 좌표는 선 없이 버블만).
- 공간 10개(건물 조감도): 버블이 서로 겹치거나 무대를 넘지 않는다 → Task 2 테스트.
- 중앙형에서 글을 고친 뒤 다시 좌우형으로: 고친 글이 그대로다(칸 번호 유지) → Task 3 UI 테스트.
- 중앙형 PPT 내보내기: 버블 · 선이 도형으로 나가고 실패하지 않는다 → Task 3 UI 테스트.

---

### Task 1: 표준 제안서 조감도의 핀 좌표 · 장면 파일
**Files:** Modify `app/scripts/vertical_standard/bird_render.mjs`, `bld_render.mjs`, `README.md`; Create `app/web/src/domain/templates/vertical_std_bird.json`, `app/web/public/assets/vertical-std/<vid>.scene.json`(36).

**Produces:** `vertical_std_bird.json` = `{ [vid]: { w:1632, h:992, live:boolean, points:[{n,x,y}] } }`(이미지 픽셀, `n` = 범례 번호). 장면 파일 = `embedSpatial(scene, library, {view:'3d'})` 결과(`{version:1, scene, library, view, roomIds}`).

- [ ] `bird_render.mjs`: 장면마다 `embedSpatial` 결과를 `<vid>.scene.json`으로, 핀을 표에 쓴다. `bld_render.mjs`: 핀만 표에 합친다(`live:false`). 표는 기존 내용을 읽어 해당 vid만 갱신한다.
- [ ] `OUT=<scratch>`로 두 스크립트를 돌려 새 webp가 기존 `public/assets/vertical-std/*.webp`와 같은지 비교한다. 같으면 webp는 바꾸지 않고 표 · 장면 파일만 반영한다. 다르면 사용자에게 알리고 webp도 함께 갱신한다.
- [ ] 확인: 표에 44개 vid, `live:true` 36개, 각 `points.length` = 그 덱 조감도 레이아웃의 공간 수.

### Task 2: 조감도 시트 모델 · 중앙형 기하 (순수)
**Files:** Create `app/web/src/domain/spatial/birdseye-sheet.js`; Test `app/tests/birdseye-sheet.mjs`.

**Produces:**
- `birdseyeSheetKind(f) → 'spatial'|'vstd'|null`
- `birdseyeRows(f, ov) → [{number, nameTb, descTb, roomId?}]` — vstd: `number=i+1`, 칸 `4+2i`/`5+2i`, 행 수 = id 끝 숫자. spatial: `spatialSlideRows(ov.spatial)` 순서, 칸 `3+2i`/`4+2i`.
- `birdseyeFrame(f, ov) → {width,height,points:{[number]:{x,y,visible}}}|null` — `ov.spatial.anchors`(3D) / `planAnchors`(2D) / 표준 핀 표(`ov.img[0].src`가 `/assets/vertical-std/<vid>.webp`). 없으면 `null`.
- `SIDE_BOX = {spatial:{x:64,y:160,w:820,h:490}, vstd:{x:64,y:152,w:816,h:496}}`, `CENTER_STAGE = {x:64,y:146,w:1152,h:520}`
- `centerGeometry(frame, rows) → {image:{x,y,w,h}, bubbles:[{number,x,y,w,h,side:'left'|'right'}], links:[{number, path:[{x,y}×4], target:{x,y}}]}` — 이미지는 무대 안 contain(최대 너비 872), 버블 너비 184, 좌표 x 순으로 좌우 균등 분배, 각 쪽은 y 순. 꺽쇠: 버블 안쪽 변 중앙 → 수평 → 수직 → 대상. `visible:false`는 링크 없음.
- `mapFramePoint(frame, box, p) → {x,y}`(contain 맞춤)
- `standardSceneUrl(ov) → string|null`(표에서 `live:true`일 때)

- [ ] 테스트: 종류 판별 · 행 칸 번호(S4 → 4..11, B10 → 4..23) · 좌표 없음 → `null` · 6/10개 공간에서 버블이 무대 안이고 서로 겹치지 않음 · 왼쪽 좌표는 왼쪽 버블 · 경로 4점이 축에 평행 · `visible:false` 링크 없음.
- [ ] 구현 → `node app/tests/birdseye-sheet.mjs` 통과.

### Task 3: 시트에 적용 (중앙형 DOM · 핀) + PPT
**Files:** Modify `app/web/src/domain/spatial/birdseye-sheet.js`(`applyBirdseyeSheet(root, f, ov)` 추가), `app/web/src/domain/slides/Slide.jsx`(`applyOverrides`에서 `applySpatialBinding` 다음 호출 — `f`는 `root`의 `data-birdseye-f`로 전달하거나 인자 추가), `app/web/src/domain/slides/export-pptx.js`(필요 시); Test `app/tests/birdseye-sheet-ui.mjs`.

- [ ] `applyBirdseyeSheet`: 좌우형 — vstd에 `ov.spatial`이 있으면(핀 없는 스냅샷) 번호 핀을 그린다. 중앙형 — 조감도 칸을 `image`로 옮기고, 우측 패널(배경 · 머리 · 안내 글 · 카드 선)을 숨기고, 이름 · 설명 칸과 번호를 버블 안으로 옮기고, 버블 카드 · 꺽쇠 선(축 평행 얇은 div) · 화살촉(svg) · 대상 점을 `data-birdseye-overlay`로 그린다. spatial의 기존 직선 연결선 · 핀은 지우고 다시 그린다. 루트에 `data-birdseye-mode`를 남긴다.
- [ ] UI 테스트(샘플 표준 제안서 팝업 · 격리 서버): 좌우형 기본 → 중앙형에서 `[data-birdseye-mode="center"]`, 버블 수 = 공간 수, 조감도 칸 중심이 시트 중앙 ±40px, PPTX 내보내기 성공.

### Task 4: 3D 덧씌움 · 전환 버튼
**Files:** Create `app/web/src/components/birdseye-live.jsx`, `app/web/src/services/birdseye-sheet.js`(장면 불러오기), 스타일은 `app/web/src/styles/spatial.css` 끝에 추가; Modify `app/web/src/components/tplkit.jsx`, `app/web/src/components/detail.jsx`.

**Produces:**
- `loadBirdseyeScene({ov}) → Promise<{scene, library, camera?}|null>` — `ov.spatial`(3D) → `ov.img[0].birdseye` 히스토리 + `loadSpatialLibrary` → `standardSceneUrl(ov)`.
- `<BirdseyeLive f ov width editable onCommit({scene, library, snapshot}) />` — 시트(1280 기준) 위 절대 배치. 현재 모드의 이미지 상자에 캔버스, 그 위에 살아 있는 핀/꺽쇠(Task 2 기하 + 실시간 좌표). 준비되면 무대에 `birdseye-live-on` 클래스를 붙여 정적 그림 · 핀 · 선을 가린다. `editable=false`면 `setEditable(false)`(회전만).
- `useBirdseyeToggle` 없이: 버튼은 각 팝업에서 직접 — 문구 「중앙 조감도로 보기」/「좌우 배치로 보기」.

- [ ] 읽기 전용(`tplkit.jsx`): 모드는 지역 상태, `Slide`에 `{...ov, spatialMode}`를 넘긴다. 장 이동 시 초기화.
- [ ] 편집(`detail.jsx`): 버튼 → `mut(y => y.ov.spatialMode = …)`. `onCommit` → `y.ov.spatial = embedSpatial(scene, library, {view:'3d', snapshot})`, vstd는 `y.ov.img[0] = {...,src: snapshot.image}`. 저장은 조작이 멎고 600ms 뒤.
- [ ] 좌표가 없던 시트는 3D 준비 후 첫 스냅샷으로 좌표를 얻는다(편집: 저장, 읽기: 지역 상태).
- [ ] UI 테스트(Task 3 파일에 추가): 표준 시트에서 캔버스 드래그 후 핀 좌표가 바뀜 · 읽기 전용에서 오브젝트 드래그는 장면을 바꾸지 않음 · 편집 팝업에서 드래그 후 `ov.spatial.camera` 저장.

### Task 5: 마무리
- [ ] `app/web/package.json`에 `test:birdseye:sheet` 추가, `app/README.md` · `app/scripts/vertical_standard/README.md`에 한 단락.
- [ ] `npm --prefix app/web run build`, 관련 기존 테스트(`spatial-storyboard-layout.mjs`, `vertical-proposals.mjs` `PROPOSAL_ONLY=bs_std_`) 통과 확인.
