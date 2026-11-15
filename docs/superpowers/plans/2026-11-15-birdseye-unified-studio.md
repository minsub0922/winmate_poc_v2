# 조감도 통합 · 명령형 스튜디오 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 건물 · 공간 조감도를 한 탭 · 한 히스토리 · 한 시작 팝업으로 합치고, 공간 스튜디오를 "시뮬레이터 + @ 명령 입력"으로 바꾸며, 건물은 내 조감도 · 템플릿 공간을 자유롭게 쌓게 하고, PPT 레이아웃 만들기를 Storyboard로 옮긴다.

**Architecture:** 명령은 서버 `POST /api/spatial/command`(LLM, 조건이 맞으면 Decision 모델)가 조작 목록으로 바꾸고, 클라이언트의 순수 함수가 장면 · 입력 폼 사본에 적용한 뒤 한 번에 반영한다. 통합 목록 · 시작 팝업 · Storyboard용 레이아웃 만들기는 새 컴포넌트 파일로 두고, 다른 세션과 겹치는 파일(`SpatialStudioPage.jsx` 등)은 필요한 줄만 고친다. 건물 모듈은 독립 모듈인 채로 두고 좁은 접점(내보내는 함수 + `window.__wmBldSpaceHook`)으로만 잇는다.

**Tech Stack:** React 18 + Vite(`app/web`), three.js, 독립 IIFE 건물 모듈(`app/web/src/building`), FastAPI(`app/api`), pytest, Node 테스트(`app/tests/*.mjs`), 시스템 Chrome UI 테스트.

**Spec:** `docs/superpowers/specs/2026-11-15-birdseye-unified-studio-design.md`

## Global Constraints

- 커밋 · 푸시 · stash · pull 하지 않는다(사용자가 요청할 때만). 각 Task의 "Commit" 단계는 없다.
- 8788 서버와 `app/web/dist`는 건드리지 않는다. 확인은 격리 인스턴스로: `WINMATE_AUTH=off WINMATE_API_PORT=<빈 포트> WINMATE_ACCOUNT_DATA_DB=… WINMATE_TEMPLATE_DB=… WINMATE_SPATIAL_DB=… WINMATE_STORYBOARD_DIR=… WINMATE_CACHE_BACKEND=memory WINMATE_SPATIAL_PREWARM=off`(경로는 scratchpad), Vite는 `WINMATE_WEB_PORT=<포트> WINMATE_API_PORT=<api 포트> npx vite --host 127.0.0.1`.
- UI 테스트는 시스템 Chrome(`CHROME=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). brew 금지, npm은 EACCES면 `--cache <dir>`.
- 다른 세션과 겹치는 파일(`pages/SpatialStudioPage.jsx`, `components/spatial-studio-popup.jsx`, `styles/spatial.css`, `pages/ProposalPage.jsx`, `components/match-area.jsx`, `components/storyboard.jsx`, `components/detail.jsx`)은 고치기 직전에 다시 읽고 필요한 줄만 고친다. 통째로 다시 쓰지 않는다. `popup` 속성 동작을 유지한다.
- 저장 데이터 형식은 바꾸지 않는다. 새 필드는 모두 없어도 되는 필드다. `/api/spatial/edit`는 그대로 둔다.
- 화면 문구는 한국어, 기존 말투("…해요")를 따른다.
- 조작 수량 1~30, 방향 이동 기본 거리 1m, 회전 버튼 15° · 90°, 화살표 5cm(Shift 50cm), 히스토리 한 쪽 8개, 건물 Storyboard 시작 최대 6층 — 스펙 값 그대로.

## Review Focus

스펙이 암시하지만 개별 Task의 기본 테스트가 놓치기 쉬운 것. 각 항목의 테스트는 표시한 Task에 넣는다.

1. **한 명령 안에서 앞 조작이 뒤 조작의 대상을 없앰**(삭제 후 이동 등) → 전체가 적용되지 않고 장면은 그대로, 이유를 알린다. (Task 1)
2. **자리가 모자란 추가**(3개 요청, 1개만 들어감) → 일부만 넣지 않고 전체 실패, 장면 그대로. (Task 1)
3. **예전 자산 버전으로 저장된 장면**에서 새 카탈로그 자산을 추가 → 자산 버전을 올린 뒤 적용하거나 분명한 이유로 거절한다. 조용히 깨지지 않는다. (Task 5)
4. **건물 기록에 내 공간 층 기록이 없음**(다른 기기 · 예전 판에서 온 기록) → 그 층은 빈 층으로 열리고 건물은 열린다. (Task 8)
5. **팝업 모드에서 단축키가 뒤의 Storyboard로 새거나, 한글 조합 중 Enter가 명령을 보냄** → 둘 다 일어나지 않는다. (Task 6)

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `app/web/src/domain/spatial/command-apply.js` | 조작 목록을 장면 · 폼 사본에 적용, 결과 문구 생성 | 새로 |
| `app/web/src/domain/spatial/object-ops.js` | 복제 · 회전 · 방향 이동(막히면 직전까지) · 공간 간 이동 · 방향 기준 계산 | 새로 |
| `app/web/src/domain/spatial/room-ops.js` | 공간 추가 · 삭제 · 이름/용도 변경(기존 배치 보존) | 새로 |
| `app/web/src/domain/spatial/edit.js` | 기존 `applySpatialEdit` 유지(호환). 새 모듈이 그 안의 삭제 로직을 재사용할 수 있게 `removeObjectGroup`만 내보낸다 | 수정(소) |
| `app/api/spatial_command.py` | `/api/spatial/command` — 검증, LLM 경로, Decision 경로 | 새로 |
| `app/api/spatial.py` | 라우터에 새 엔드포인트 한 줄 연결 | 수정(소) |
| `app/api/poc/settings.py` · `.env.example` | `DECISION_TASKS`에 `spatial.command` | 수정(소) |
| `app/web/src/services/spatial.js` | `commandSpatial(body, signal)` | 수정(소) |
| `app/web/src/domain/spatial/mention-options.js` | @ 목록 만들기(공간 · 제품 · 오브젝트 묶음, 정렬 · 검색) | 새로 |
| `app/web/src/components/spatial-prompt.jsx` | 새 목록 · 빈 장면 지원 · 묶음 머리말 | 수정 |
| `app/web/src/components/spatial-object-details.jsx` | 회전 · 복제 버튼 | 수정 |
| `app/web/src/components/spatial-view.jsx` | 공간 이름표 선택 → 태그, 단축키 | 수정 |
| `app/web/src/pages/SpatialStudioPage.jsx` | 왼쪽 카드 · 생성 흐름 · 레이아웃 추출 · 목록 부분 제거, 새 명령 흐름 연결 | 수정(줄 단위) |
| `app/web/src/components/birdseye-home.jsx` | 통합 목록(시작 버튼 + 통합 히스토리) | 새로 |
| `app/web/src/domain/birdseye/history.js` | 공간 · 건물 히스토리 병합 · 페이지 계산 | 새로 |
| `app/web/src/components/birdseye-start.jsx` | 시작 팝업(종류 → 출발점 → 고르기) | 새로 |
| `app/web/src/services/birdseye-start.js` | 여섯 갈래 시작 실행(Storyboard 추론 포함) | 새로 |
| `app/web/src/services/building-bridge.js` | 건물 모듈 로드 · 목록/삭제/썸네일 · 만들기 · 내 조감도 훅 | 새로 |
| `app/web/src/domain/building/floor-bake.js` | 공간 장면 → 건물 층 기록(`bakeScene` 규칙) | 새로 |
| `app/web/src/building/{index,ui,data,store}.js` | 내보내기 추가, 층 기록 등록, 고르기 창 "내 조감도", 크기 제한 제거, 목록 화면 미사용 | 수정 |
| `app/web/src/pages/BuildingPage.jsx` | 모듈 로드를 bridge로 옮김, id 없으면 통합 목록으로 | 수정 |
| `app/web/src/components/shell.jsx` · `App.jsx` | 사이드바 한 항목, 경로 처리 | 수정(소) |
| `app/web/src/components/spatial-layout-create.jsx` | Storyboard에서 조감도 → 레이아웃 편집 → 저장 | 새로 |
| `app/web/src/components/spatial-layout-picker.jsx` | "조감도 히스토리" 묶음 추가 | 수정 |
| `app/web/src/styles/birdseye.css` | 새 화면 CSS(겹치는 `spatial.css`는 최소 수정) | 새로 |

---

### Task 1: 조작 적용 엔진 (순수 함수)

**Files:** Create `domain/spatial/object-ops.js`, `domain/spatial/command-apply.js`; Modify `domain/spatial/edit.js`; Test `app/tests/spatial-commands.mjs`

**Interfaces — Produces:**
- `directionBasis(view, camera) → {right:[dx,dz], forward:[dx,dz]}` — 2D는 `right=[1,0]`, `forward=[0,1]`(앞 = +Z). 3D는 카메라 방위각으로 지면에 투영한 단위 벡터.
- `copyObject(scene, objectId, roomId|null, library) → {scene, objectId}` — 원본과 얹힌 것 · 딸린 것을 함께 복제해 대상 공간(없으면 원본 공간)의 빈 자리에 놓는다. 회전 · 설치 방식 유지.
- `rotateObject(scene, objectId, {angle}|{rotation}, library) → scene`
- `nudgeObject(scene, objectId, [dx,dz], library) → {scene, moved, requested}` — 5cm 단계로 나아가다 처음 막히는 곳 직전에서 멈춘다. 한 걸음도 못 가면 throw.
- `moveObjectToRoom(scene, objectId, roomId, library) → scene`
- `applySpatialCommand({scene, form}, plan, library, {basis, focusRoomId, documentId}) → {scene, form, lines:[string], removed:[objectId]}` — `plan.operations`를 사본에 차례로 적용. 하나라도 실패하면 throw하고 입력은 바뀌지 않는다. `lines`는 결과 문구.
- 조작 모양: `add{assetId,roomId,quantity,patch?}` · `copy{objectId,quantity,roomId?}` · `move{objectId, patch? | direction+distance? | roomId?}` · `rotate{objectId, angle? | rotation?}` · `remove{objectId}` · `style{style}` · `room_add{kind,name?}` · `room_remove{roomId}` · `room_update{roomId,name?,purpose?}`(공간 조작은 Task 2에 위임)

- [ ] **Step 1: 실패하는 테스트 작성** — `app/tests/spatial-commands.mjs`(기존 `spatial-edit.mjs`와 같은 방식: 라이브러리 JSON을 읽어 `createScene`으로 장면을 만든다)
  - `copy 2 into another room`: 대상 공간의 그 자산 수가 +2, 원본 공간 수는 그대로, 새 오브젝트 회전 = 원본 회전, `validateScene` 오류 0.
  - `copy carries items on top`: 제품이 얹힌 책상을 복제하면 얹힌 제품도 +1이고 그 `supportId`가 새 책상.
  - `direction move right 1m in 2D`: `x`가 +1.00, `z` 그대로.
  - `direction move is clipped at the wall`: 벽까지 0.4m 남은 오브젝트를 오른쪽 3m → 이동량 ≤ 0.4, `moved < requested`, 오류 0.
  - `3D basis follows camera`: 방위각 0°와 90°에서 `right` 벡터가 직교.
  - `rotate +90`: 회전이 +90(360으로 정규화), 얹힌 것도 함께 회전.
  - `add 3 when only 1 fits`: throw, 입력 장면의 `contentHash` 그대로(Review Focus 2).
  - `remove then move same object`: throw, 장면 그대로(Review Focus 1).
  - `lines`: `copy` 2개 → `"…에 … 2개를 복제했어요"` 형태 문구 1줄.
- [ ] **Step 2: 실패 확인** — `node app/tests/spatial-commands.mjs` → 모듈 없음으로 실패.
- [ ] **Step 3: 구현** — 복제는 원본 묶음(얹힌 것 · `moveWithTarget`)을 새 ID로 복사하고, 대상 공간에서 0.25m 격자로 원본 위치(다른 공간이면 공간 중심)에서 가까운 순으로 자리를 찾는다(먼저 경계 상자로 거르고, 통과한 후보만 `validateScene`). 방향 이동은 0.05m 단계.
- [ ] **Step 4: 통과 확인** — `node app/tests/spatial-commands.mjs` → 전부 통과. `node app/tests/spatial-edit.mjs`도 여전히 통과.

### Task 2: 공간 추가 · 삭제 · 이름 바꾸기

**Files:** Create `domain/spatial/room-ops.js`; Test `app/tests/spatial-room-ops.mjs`

**Interfaces — Produces:**
- `addRoom({scene, form}, {kind, name?}, library, {documentId}) → {scene, form, roomId, relaid:[roomId]}` — 폼에 공간을 더해 다시 배치한 뒤, 기존 공간의 오브젝트를 새 위치로 옮겨 붙인다(크기 같음 → 평행 이동). 옮겨 붙인 결과가 검증에 걸리는 공간만 새 배치를 쓰고 `relaid`에 담는다. 장면이 없으면(빈 스튜디오) 그 공간 하나로 장면을 만든다.
- `removeRoom({scene, form}, roomId, library, {documentId}) → {scene|null, form, relaid}` — 마지막 공간을 지우면 `scene=null`.
- `updateRoom({scene, form}, roomId, {name?, purpose?}) → {scene, form}`
- 이름을 안 주면 `SPACE_TYPES`의 표시 이름, 같은 이름이 있으면 `" 2"`, `" 3"`을 붙인다.

- [ ] **Step 1: 실패하는 테스트** — `add room keeps existing objects`(기존 공간마다 오브젝트 수 · 공간 안 상대 좌표가 같음), `add first room from blank`(공간 1개 장면, 오류 0), `remove room drops its objects only`, `remove last room → scene null`, `duplicate names get a suffix`, `31번째 공간 추가는 throw`.
- [ ] **Step 2: 실패 확인** — `node app/tests/spatial-room-ops.mjs`
- [ ] **Step 3: 구현** — `createSceneFromForm` + 공간별 옮겨 붙이기(`focusScene`의 좌표 이동과 같은 규칙, `facing.point` 포함).
- [ ] **Step 4: 통과 확인**, `command-apply.js`의 공간 조작이 이 함수들을 부르도록 잇고 `spatial-commands.mjs`에 `room_add then add into it`(같은 명령 안에서 새 공간에 추가) 테스트를 더해 통과.

### Task 3: 서버 명령 해석 — LLM 경로

**Files:** Create `app/api/spatial_command.py`; Modify `app/api/spatial.py`(라우터 연결 한 줄); Modify `app/web/src/services/spatial.js`; Test `app/tests/test_spatial_command.py`

**Interfaces — Produces:**
- `POST /api/spatial/command` 요청 `{prompt, mentions:[{kind:'object'|'asset'|'room'|'space', id, label}], scene|null, form?, roomId?, view:'2d'|'3d', feedback?}` → 응답 `{plan:{operations:[…], explanation}, source:'llm'|'decision', model}`.
- `space` 태그의 id는 `SPACE_TYPES` 키. 장면이 없으면(`scene:null`) `room_add`만 허용.
- 서버는 방향을 좌표로 바꾸지 않는다(`direction` ∈ `left|right|forward|back`, `distance` 0.05~50). 절대 좌표 `patch`는 사용자가 좌표를 말했을 때만.
- `commandSpatial(body, signal)` (클라이언트).

- [ ] **Step 1: 실패하는 pytest** — 가짜 provider로: 세 예시 문장에 해당하는 모델 답을 주면 검증을 통과해 그대로 돌아온다 / 없는 `objectId` · 범위를 벗어난 수량 · 모르는 조작은 502 / `mentions`에 장면에 없는 공간 id는 422 / `scene:null`에서 `add`는 502, `room_add`는 통과 / 프롬프트 3자 미만 422.
- [ ] **Step 2: 실패 확인** — `cd app && .venv/bin/python -m pytest tests/test_spatial_command.py -q`
- [ ] **Step 3: 구현** — `/edit`의 후보 자산 고르기 · 장면 요약 방식을 가져오되 조작 스키마와 지시문을 새 조작에 맞춘다. 지시문 요점: 요청한 것만, 태그 종류별 의미, 사람 연출은 묶음, 방향은 화면 기준 낱말로만 답하기, 대상 공간을 말하지 않으면 `focusedRoomId` → 용도가 맞는 공간, 모호하면 조작 없이 이유.
- [ ] **Step 4: 통과 확인** + 기존 `tests/test_spatial_edit.py` 통과.

### Task 4: 서버 명령 해석 — Decision 경로

**Files:** Modify `app/api/spatial_command.py`, `app/api/poc/settings.py`(`DECISION_TASKS`), `.env.example`(대상 작업 주석); Test `app/tests/test_spatial_command.py`

**Interfaces:** Consumes `get_decision(settings,'spatial.command')`, `set_decision_override`. Produces 같은 응답 모양, `source:'decision'`.

- [ ] **Step 1: 실패하는 pytest** — 가짜 Decision 클라이언트로: 태그가 다 있는 단일 요청 3종(복제 · 방향 이동 · 추가)이 LLM 호출 없이 조작으로 바뀐다 / "요청이 둘 이상" noul이 높으면 LLM 경로 호출 / 태그 없는 대상 → LLM 경로 / 확신도가 기준 미만 → LLM 경로 / Decision 오류(ProviderError) → LLM 경로로 넘기고 `source:'llm'`.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — 질문: `multi`(noul) · `action`(choice: add/copy/move/rotate/remove/other) · `subject`(choice: 태그들) · `room`(choice: 장면 공간 + none) · `count`(choice 1~30) · `direction`(choice: left/right/forward/back/none) · `distance`(choice: 0.5/1/2/3/5/none) · `angle`(choice: 15/30/45/90/180/-15/-30/-45/-90/none). 기준값은 모듈 상수(초기값 0.6), Task 10에서 실제 모델로 맞춘다.
- [ ] **Step 4: 통과 확인**

### Task 5: @ 태깅과 명령 입력창

**Files:** Create `domain/spatial/mention-options.js`; Modify `components/spatial-prompt.jsx`; (필요 시) `components/spatial-mention-editor.jsx`; Test `app/tests/spatial-mention-options.mjs`

**Interfaces — Produces:**
- `mentionOptions(scene|null, library, {roomId}) → [{kind, id, group:'공간'|'제품'|'오브젝트', label, hint, asset?, roomId?}]`
- `filterMentionOptions(options, query, {roomId, limit=40})` — 보고 있는 공간 우선, 묶음 순서 공간 → 제품 → 오브젝트.
- `SpatialPrompt` props: `scene`(null 가능) · `library` · `roomId` · `busy` · `onSubmit(text, mentions)` · `onMention` · `onHighlight` — 기존 ref `mention(objectId)`에 `mentionRoom(roomId)` 추가.

- [ ] **Step 1: 실패하는 테스트** — 묶음 구성(장면 공간 `room`, `SPACE_TYPES` 16개 `space`, 제품 자산은 `제품`, 가구 · 사람 연출 자산과 배치 오브젝트는 `오브젝트`), "사람" 검색에 사람 연출이 나옴, 빈 장면이면 `space`와 카탈로그만, 예전 자산 버전 장면에서도 목록이 만들어짐(Review Focus 3의 입력 쪽).
- [ ] **Step 2~4: 실패 확인 → 구현 → 통과.** 입력창 머리말 "@ 로 공간 · 제품 · 오브젝트를 골라 명령하세요", 안내 줄 "이동 · 복제 · 회전 · 삭제 · 추가 · 공간 추가".

### Task 6: 공간 스튜디오 화면 — 시뮬레이터만, 직접 조작

**Files:** Modify `pages/SpatialStudioPage.jsx`(줄 단위), `components/spatial-object-details.jsx`, `components/spatial-view.jsx`, `styles/birdseye.css`(새로); UI Test `app/tests/spatial-command-ui.mjs`, `app/tests/spatial-manipulate-ui.mjs`

**Interfaces:** Consumes Task 1~5. `SpatialPage`의 `popup` 속성 유지.

- [ ] **Step 1: UI 테스트 작성**(가짜 `/api/spatial/command` 응답을 주는 fixture 서버 또는 요청 가로채기)
  - `spatial-command-ui`: 스튜디오에 왼쪽 카드(`.sp-studio-form` 등)가 없다 / 입력창에서 @ → 세 묶음 머리말이 보인다 / 복제 응답 적용 후 오브젝트 수 +2, 실행 취소로 원래 수 / 방향 이동 응답 후 좌표 변화 / 빈 스튜디오에서 `room_add` 응답 후 공간 1개가 그려진다 / 한글 조합 중 Enter는 보내지 않는다(Review Focus 5).
  - `spatial-manipulate-ui`: 오브젝트 선택 → 회전 버튼 15° · 90°로 회전 값 변화 / 복제 버튼으로 +1 / `R` · `Ctrl+D` · `Delete` · 화살표 동작 / 입력창에 포커스가 있을 때 `R`은 글자로 들어가고 회전하지 않는다 / 팝업 모드에서 단축키가 팝업 밖 요소에 영향 없음(Review Focus 5).
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `SpatialStudioForm` 렌더 · `generate` · `pendingInputs` 안내 · `extractLayout` 버튼/모달 제거, `edit`를 `commandSpatial` + `applySpatialCommand`로 교체(충돌 시 1회 재질의 · 삭제 확인 유지), 예전 초안 열기 규칙(스펙 5.4), 자산 버전이 다른 장면은 명령 전에 `upgradeSpatialAssets`(Review Focus 3), 방향 기준은 `viewer.current.cameraState()`.
- [ ] **Step 4: 통과 확인** + 스크린샷을 직접 본다.

### Task 7: 통합 목록과 시작 팝업(공간 갈래)

**Files:** Create `domain/birdseye/history.js`, `components/birdseye-home.jsx`, `components/birdseye-start.jsx`, `services/birdseye-start.js`; Modify `pages/SpatialStudioPage.jsx`(목록 부분을 `BirdseyeHome`으로), `components/shell.jsx`, `App.jsx`; Test `app/tests/birdseye-history.mjs`, UI `app/tests/birdseye-home-ui.mjs`, `app/tests/birdseye-start-ui.mjs`

**Interfaces — Produces:**
- `mergeHistoryPage({spatial:{items,total}, buildings:[…]}, page, pageSize=8) → {items:[{type:'spatial'|'building', id, title, updatedAt, …}], total, page, totalPages, needSpatial}` — `needSpatial`은 이 쪽을 채우려고 더 읽어야 할 공간 항목 수(서버 한 번에 최대 48).
- `startBirdseye({type, source, industry?, templateId?, proposalId?, presetId?}, {library, go, onProgress}) → Promise<route>` — 여섯 갈래. 건물 갈래는 Task 8의 bridge를 부른다.
- `BirdseyeStartDialog({library, onClose, go})`

- [ ] **Step 1: 테스트** — 병합: 수정 시각 내림차순, 쪽 경계, 건물 0개, 공간 0개, 49번째 이후 항목이 필요한 쪽에서 `needSpatial` 계산. UI: 사이드바에 "조감도" 한 항목 / 목록에 "업종별 템플릿" · "Layout 히스토리"가 없다 / 히스토리 카드에 종류 표시 / 시작 팝업: 공간 → 빈 스튜디오는 업종을 고르기 전 "시작" 비활성 / 공간 → 업종 템플릿 → 스튜디오 열림 / 공간 → 내 Storyboard: 공간 구성 있는 제안서로 스튜디오가 열리고 그 제안서 `spacePlan.birdseye.historyId`가 그 조감도.
- [ ] **Step 2~4: 실패 확인 → 구현 → 통과.**

### Task 8: 건물 — 통합 접점, 자유 구성

**Files:** Create `domain/building/floor-bake.js`, `services/building-bridge.js`; Modify `building/index.js`, `building/ui.js`, `building/data.js`, `building/store.js`, `pages/BuildingPage.jsx`; Test `app/tests/building-floor-bake.mjs`, UI `app/tests/building-compose-ui.mjs`

**Interfaces — Produces:**
- `bakeSceneFloor(scene, library, {id, name}) → {assets:[…], recipes:{…}, tpl:{id, ind, name, short, lay:'my', w, d, style, rooms, objs, ppl, productCount}}` — `app/scripts/build_building_bake.mjs`의 `bakeScene` · `assetRef` · `person`과 같은 규칙. `objs`의 자산 번호는 이 묶음 안의 `assets` 순번.
- 건물 모듈 내보내기 추가: `registerFloors(pack)`(자산 · 레시피 · 층을 런타임 데이터에 더함, 같은 id는 교체), `listBuildings()`, `removeBuilding(id)`, `buildingThumb(id)`, `onBuildingsChange(fn)`, `createBuilding({preset?|blank?|floors?:[{tpl, name?}], title?, fv?}) → id`, `pickPreset(onDone)`.
- 건물 기록 선택 필드 `spaces: {[tplId]: pack}`. 열 때 `registerFloors`로 먼저 등록. 등록할 기록이 없는 `my:` 층은 빈 층으로 그린다(Review Focus 4).
- `window.__wmBldSpaceHook = {list({page}) → {items:[{id,title,updatedAt,image}], total}, bake(id) → pack}` — bridge가 제공.

- [ ] **Step 1: 테스트** — `floor-bake`: 템플릿 장면을 바꾼 결과가 구운 데이터의 같은 층과 `rooms` · `objs` 좌표가 일치(자산 id로 비교). UI: 건물 스튜디오에 명령 입력창이 없다 / 층 추가 고르기 창에 "내 조감도" 묶음 / 내 조감도를 고르면 층이 생기고 새로 고침 뒤에도 그려진다 / 크기가 다른 템플릿 공간도 고를 수 있다("이 건물에 맞는 크기의 공간만" 문구 없음) / `spaces`를 지운 기록도 열린다 / 뒤로 가기 → 통합 목록 / 통합 목록에 건물 카드가 보이고 삭제된다 / 시작 팝업 건물 3갈래로 스튜디오가 열린다(Storyboard 갈래는 공간 수 = 층 수).
- [ ] **Step 2~4: 실패 확인 → 구현 → 통과.** `building/README.md`의 접점 설명을 고친다.

### Task 9: Storyboard에서 조감도 → 레이아웃

**Files:** Create `components/spatial-layout-create.jsx`; Modify `components/spatial-layout-picker.jsx`, `components/detail.jsx`(필요한 줄만), `pages/SpatialStudioPage.jsx`(레이아웃 관련 상태 제거); UI Test `app/tests/storyboard-birdseye-layout-ui.mjs`

**Interfaces — Produces:** `SpatialLayoutCreate({historyId, view, onSaved(meta), onClose})` — 조감도를 읽어 레이아웃 초안(`createSpatialLayout`)을 만들고 `SpatialLayoutEditor`로 편집, `saveSpatialMyLayout`으로 저장한 뒤 `onSaved(meta)`. 고르기 창은 `onPick(meta)`로 지금 흐름(`selectSpatialStoryboardLayout`)에 넘긴다.

- [ ] **Step 1: UI 테스트** — 조감도 장 상세의 고르기 창에 "조감도 히스토리" 묶음 / 조감도를 고르면 편집 창이 열리고 저장하면 그 장의 `f`가 `L_MY_…`, `spatialLayout.historyId`가 그 조감도 / "저장한 레이아웃" 묶음에 예전 것이 보인다 / 공간 스튜디오에 "레이아웃 추출" 버튼이 없다.
- [ ] **Step 2~4: 실패 확인 → 구현 → 통과.**

### Task 10: 실제 모델 점검 · 기존 테스트 정리 · 문서

**Files:** Modify/Delete 전제가 사라진 테스트(`spatial-studio-flow-ui` · `spatial-studio-form` · `spatial-room-input-ui` · `spatial-saved-layouts-ui` · `spatial-layout-my-ui` · `spatial-template-catalog-ui` · `spatial-library-ui` · `spatial-pagination-ui` · `spatial-history-*` · `spatial-product-mentions*` · `spatial-mention-bubbles-ui` · `building-birdseye-ui` · `building-standard-ui` 등 — 하나씩 돌려 보고 정한다); Modify `app/README.md` · `building/README.md` · 앱 내 가이드 문구(조감도 관련); Create `app/tests/spatial-command-live.mjs`

- [ ] **Step 1:** 격리 인스턴스 + 실제 모델로 세 예시 문장을 LLM 경로(`WINMATE_DECISION=off`)와 Decision 경로에서 각각 실행. 응답 조작과 적용 뒤 장면 변화를 기록. Decision 기준값 · 질문 문구 조정.
- [ ] **Step 2:** 화면에서 직접: 시작 팝업 여섯 갈래, 명령 10여 개(복제 · 이동 · 회전 · 삭제 · 추가 · 공간 추가/삭제/이름, 여러 문장 한 번에, 모호한 명령), 마우스 · 키보드 조작, 건물 자유 구성, Storyboard 조감도 장, 팝업 모드. 스크린샷을 본다.
- [ ] **Step 3:** 전체 pytest, 조감도 관련 Node · UI 테스트 전부 실행. 전제가 사라진 테스트는 새 화면에 맞게 고치거나 지우고 목록을 남긴다. 무관한 기존 실패는 변경 전 상태와 구분해 적는다.
- [ ] **Step 4:** 새 독립 검토(변경 전체)를 한 번 받고 지적을 고친다.
- [ ] **Step 5:** 결과 보고 — 된 것, 확인한 방법, 지운 테스트, 남은 것.
