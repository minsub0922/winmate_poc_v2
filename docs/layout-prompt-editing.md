# 구조화된 action 승인 후 레이아웃 실행

2026-10-20. 슬라이드 아래의 프롬프트 편집기를 두 단계의 structured output으로 변경했다. 조작 요청에 대한 자유 서술 답변과 채팅형 확인 UI를 없앴다. 추천 버블 3개와 수동 속성 편집은 유지한다.

1. **작업 추출**: 첫 LLM은 현재 장의 실제 요소/좌표/사진 후보/반복 단위와 제안서 요구사항을 사용하여 `status/actions/issues` JSON만 반환한다. `message/changes` 등 자유 응답 필드는 거부한다.
2. **작업 확인**: 입력창 바로 위에 말풍선 모양의 확인 팝업을 띄운다. 대상, 이동량/좌표, 크기, 기존/새 문구, 이미지 미리보기, 반복 개수와 삭제/추가 항목을 구조화된 값에서 렌더한다. 기본 글자 스타일·이미지 맞춤도 이 단계에서 확정해 보여준다. 승인 전에는 실제 장을 변경하지 않는다.
3. **승인 후 LLM 재분석**: 승인하면 두 번째 LLM이 승인된 action과 현재 레이아웃을 다시 읽고 `operations` JSON을 생성한다. action ID·작업 종류·대상·승인값을 변경하거나 작업을 추가/누락하면 거부한다. 위치를 지정하지 않은 추가 요소의 배치 좌표/크기만 실행 단계에서 정할 수 있다.
4. **실제 조작**: 승인 범위 검증 후 별도 DOM 복사본에 실행한다. 겹침·넘침·슬라이드 이탈·비대상 요소의 위치/크기 변경을 검사하고 실제 모델 검토까지 통과한 결과만 현재 장에 한 번 반영한다. 에이전트 실행 중 취소/오류/새로운 수동 편집은 원본을 유지한다.

지원 action:

| type | 대상과 값 |
|---|---|
| move | 실제 요소 ID, dx/dy 또는 x/y |
| resize | 실제 요소 ID, w/h |
| style | 실제 글 요소 ID, fontSize/color/align |
| replace_text | 실제 글 요소 ID, 정확한 새 문구 |
| add_text | 새 문구, 선택적 배치, 승인할 글자 스타일 |
| add_image | 등록 이미지 ID, 선택적 배치, 승인할 맞춤 |
| replace_image | 실제 이미지 요소 ID, 등록 이미지 ID와 맞춤 |
| remove | 삭제할 실제 요소 ID |
| reflow | 반복 영역의 안정 ID로 연결되는 index, 목표 count, 명시한 rows/columns/gap |

실제 전송 스키마는 모델이 수용한 고정 `key/value` 목록을 사용한다. 숫자 문자열을 유한한 숫자로 변환한 뒤 허용 속성·타입·경계·중복과 승인값을 로컬에서 검증한다. 임의 HTML/CSS/스크립트/URL은 실행하지 않는다. 이미지 후보는 등록된 실제 파일에 한정하며, 문구는 안전한 text 노드로 편집한다. 문구 수정 시 원본의 대표 글자 크기/굵기/색을 보존한다. 이미지 단독 `<img>`도 기존 크기를 유지한다.

반복 수/배치 변경은 기존 Gemini 구조 분석·설계·측정·검토 파이프라인을 사용한다. 순서가 바뀔 수 있는 index를 실행 대상의 식별자로 재사용하지 않고 승인된 영역 ID·단위·현재 수를 대조한다. 승인한 행/열/간격은 실제 설계 좌표에서도 검사한다. 반복 영역 밖의 수정과 함께 실행할 수 있으며, 같은 반복 영역 안의 개별 조작은 영역 재구성과 분리한다. 미확인 반복 구조는 실제 모델로 분석한 뒤 개수를 보여준다.

적용 한 번은 undo 한 단계이며, 새 My `f`로 저장하여 원본 및 이전 제안서의 slot 계약을 유지한다. 사진 카드 `pc=0`과 실제 `repeat` 메타를 유지하고 DOM의 `data-layout-agent`에 승인 action과 실제 operation을 기록한다. 실행 후 자유형 LLM 답변 대신 적용 작업 수를 표시한다.

관련 구현: `services/layout-actions.js`, `services/layout-prompt.js`, `services/layout-reflow.js`, `components/layout-prompt.jsx`, `components/mytpl.jsx`, `styles/my.css`.

## 검증

```sh
node --test app/tests/layout-actions.mjs
node app/tests/layout-prompt.mjs --geometry-only
node app/tests/layout-prompt.mjs  # 실제 Gemini 호출
node app/tests/layout-editor.mjs
npm --prefix app/web run build
```

순수 계약 검사는 자유 답변/알 수 없는 대상/잘못된 값, 승인 범위 이탈, 미승인 스타일 추가, 중복/누락, 등록되지 않은 이미지, 재배치 영역 침범 및 승인 행/열/간격을 검증한다. 로컬 DOM 검사는 텍스트 서식, 비대상 형제 보호, 이미지 단독 요소의 크기, 배경 파생 미리보기와 원본 변경의 구분을 검증한다.

실제 모델 UI 검사는 action-only 출력, 입력창 위 확인 팝업, 승인 전/취소 후 원본 유지, 승인 후 두 번째 모델 호출, 사진 카드 6→4, 제목 이동, 글 추가/수정, 사진 추가/교체/삭제, 크기/색 수정, stale 차단, 단계별 작업 취소, undo/redo, My 저장과 모바일 팝업 접근성을 포함한다. 성공 응답은 모킹하지 않는다. `app/tests/output/layout-actions/`에 실제 응답·승인/실행 감사·HTML·화면을 저장한다.
