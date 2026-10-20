# Best Scenario 구조·채움·표준제안서 계약

## 읽을 파일과 현재 등록 상태

- 현재 앱 `app/web/src/domain/templates/{scenarios,scenario_fills,scenario_story,scenario_storyboard,scenario_bg,covers}.js`, `scenario_bg.json`.
- `app/web/src/services/catalog.js`, `domain/proposals/parts.js`, `domain/slides/Slide.jsx`, `export-pptx.js`.
- `app/web/src/pages/ScenariosPage.jsx`, `components/tplkit.jsx`, `repositories/proposals.js`, `repositories/sample-history.js`.
- `app/web/src/domain/simulation/profile.js`와 `score.js`: preset 생성과 비슷한 시나리오 추천.
- 제작 이력: `build/sb/{plan,apply,check}.mjs`, `build/bs/{README,GUIDE}.md`, `build/sol/README.md`, `build/v25/README.md` 및 원본 source/명세.

현재 앱은 22개 시나리오·STORY·fills를 갖는다. `bs21` 37장·`bs22` 15장이 표준이다. 이전 v25 생성기/README의 25개 덱 수를 현재 앱 상태로 착각하지 않는다. 과거 스크립트는 루트 src나 dist를 변경할 수 있으므로 app용 출력과 실제 import를 확인한다.

## 두 모드

| 항목 | 표준제안서 | 일반 제안 |
|---|---|---|
| 정체성 | `req:'std'`, `std:true` | 실제 요구 유형, std 미설정 또는 false |
| 내용의 기준 | 지정한 원본 덱/명세·공식 양식 | 고객 상황·결정 기준·시간·목표 행동 |
| 장 순서/수 | 원본 쪽 순서·수 보존. 요청한 파생본이면 변경 이유/대응표 보존 | 필요에 따라 배치. 모든 장에 목적과 앞뒤 연결 |
| 문구/주석 | 원문·면책·인증·지원 조건을 보존하고 고객 입력칸만 계획대로 채움 | 고객 상황에 맞게 작성하되 사실/가정/목표 분리 |
| 디자인 | 지정한 표준 덱 계열·원본 좌표/타이포 우선 | 가까운 활성 레이아웃 계열·사진 중심 관례 |
| 제품/수치 갱신 | 판본과 원문을 기록. 신모델로 치환하려면 근거와 요청 범위 확인 | 현재 DB 사실과 가상 고객 조건으로 정합성 유지 |
| 검증 | 원본→복원 장별 전체 대응표와 화면 비교 | 스토리 논리·고객 맞춤·최종 ask 달성 가능성 |

`bs21`은 일부 장이 `L_PH_AIS_08/25/35`로 이미 사진 대체되어 있다. 원본 `L_AIS_01..37`이라는 이름만 믿어 현재 flow를 되돌리지 않는다. `bs22`는 L_SOL_01..15와 Lite 계열이다. 표준이라고 모두 37장 또는 Why Samsung 고정 끝맺음으로 만들지 않는다.

## 시나리오 정의

`scenarios.js`의 실제 예에서 필요한 항목을 빠짐없이 만든다.

표준 모드에도 같은 필수 필드가 필요하다. `storyboardOf`는 `STRATEGIES[s.strategy].label`을 직접 읽으므로 없는 키는 즉시 런타임 오류가 된다. 유효한 req/strategy/ending, audience의 lead와 others 배열, criteria를 전수 검증하고 새 ID 전체에 대해 실제 storyboardOf·setupFromScenario를 실행한다.

```text
id, req, ind, strategy, ending, minutes, std?,
title, short, situation, signals,
audience:{lead,others}, criteria,
thesis, logic, diff, tone, messages,
flow:[{key,name,goal,slides:[{f,role}]}],
ask, next, prep, products, solutions, cases,
kpis, objections:[[질문,대응]], fit, avoid
```

새 ID는 현행 SC·fills·story·배경·관리자 샘플과 충돌하지 않게 만든다. 사용 중인 번호를 덮어쓰지 않는다. 새 요구 유형/전략이 필요하면 먼저 기존 taxonomy로 표현 가능한지 보고, 실제 새 축일 때 필터·순서·색·시뮬레이션 소비자도 함께 갱신한다.

flow는 실제 덱의 순서다. 표지/목차·고객 문제·가치·공간·구성·근거·계획·결정 등 요청에 맞는 역할을 부여한다. 여러 단계가 같은 STAGES key를 쓸 수 있으나 `name`은 STORY의 키이므로 충돌을 피한다.

`ask`는 승인/실사/설계 반영 등 구체적 결정이다. ending의 표현과 맞추고 minutes 안에 설득 가능한 범위로 만든다. objections의 답변은 시뮬레이션의 우려 생성에도 쓰이므로 실제 덱/공식 근거로 대응할 수 있어야 한다.

## fills의 순서와 슬롯

```js
FILL_CUSTOMER[id] = '가상 고객명';
FILLS[id] = [
  { f: '실제-레이아웃-f',
    t: { '0': '글', '1': { html: '첫 줄<br/>둘째 줄' } },
    img: { '0': { src: '유효한-이미지-주소', name: '사진 설명', keep: true, fit: 'contain' } },
    r: [['고정된 예시 고객명', '가상 고객명']] }
];
```

- `flow.flatMap(g => g.slides)`와 FILLS 배열 길이·모든 위치의 f가 같아야 한다. `fillOf(id,k,f)`는 다르면 `{t:{},img:{}}`로 조용히 빠지므로 오류를 탐지해야 한다.
- t/img의 번호는 선택된 새 레이아웃의 실제 슬롯과 대조한다. 교체 전 레이아웃의 칸 번호를 그대로 옮기지 않는다. 화면 글/이미지 출력을 기준으로 모든 칸을 점검한다.
- overrides가 없는 구조 문구·주석·적합한 기본 사진은 유지할 수 있다. 단 모든 의미 있는 칸을 검토하고 누락/예시 고객/자리표시/다른 업종의 사진을 남기지 않는다.
- 사진 wrapper를 보존하려면 `keep:true`; 제품 컷은 `contain`, 흰 배경. `r`은 슬롯 밖 고정 문구용이며 너무 일반적인 문자열 치환으로 다른 문구를 바꾸지 않는다.
- source 주소는 앱 이미지/묶음 resolver가 읽는 형식이어야 한다. 새 pack은 실제 static 경로에 있고 이미지 인덱스·Range 위치가 유효해야 한다.
- 가상 목표·ROI·견적 등은 근거/가정과 계산식을 표시하고 덱 전체 합계·단위·기간을 대조한다. '삼성전자 추정/고객사 자료'를 근거 없이 붙이지 않는다. 구형 GUIDE의 숫자 보충 방침보다 현재 사실성 요구가 우선한다.

## STORY·표지·배경

```text
STORY[id] = {
  keymen:[[역할이름,weight,[요구문장...]], ...],
  note:요구사항 메모,
  parts:{ [flow.name]:{type:PARTS의 키,items:[내용...]} }
}
```

키맨 가중치는 합계100으로 맞추고 청중과 요구를 연결한다. fallback이 있더라도 새 시나리오는 직접 작성해 파트 유형·내용이 의도대로 보이게 한다. 같은 flow.name의 STORY만 바꾸고 다른 시나리오의 키를 바꾸지 않는다.

`storyboardOf`는 flow·fills·STORY·배경을 하나의 제안서로 바꾸고 `normalizeCovers`를 호출한다. 표지는 `deck:true` 숨은 파트이며 `deckOrder()`에서 앞에 온다. 목록→상세→전체 보기→활용하기→PPTX가 이 동일 순서/내용을 사용해야 한다.

`scenarioStoryboard()`는 읽기 전용 캐시다. UI에서 이 객체를 고치지 않는다. `activateScenario`/`storyboardOf`의 새 id maker로 독립 제안서를 생성하고, 편집해도 원본 시나리오나 다른 복사본이 변하지 않아야 한다.

배경은 선택 사항이다. 사용할 경우 `scenario_bg.json`의 n이 평탄화된 장수와 같고 map 길이·인덱스가 유효하며 pool이 n+spare와 일치해야 한다. 전체 장마다 주제에 맞는 다른 배경을 배치하고 신규 장 추가 시 `syncBg`의 pool 할당도 검증한다. 표준 원본의 고유 배경을 무단으로 이 테마로 대체하지 않는다.

## 통합 영향

1. 프런트 import가 실제 app의 새 모듈을 읽는지 확인한다. `SC`, `FEATURED`, `PREVIEW_N`, `previewOf` 등 파생 목록은 실제 현재 코드를 따른다. 과거 README의 '미리보기 3장'을 고정 요구로 삼지 않는다.
2. 새로운 템플릿이 필요하면 메타·HTML·이미지·검색·내보내기 계약까지 추가한다. 단순히 시나리오를 만들기 위해 기존 템플릿을 삭제/retired 하지 않는다.
3. scenario/fills/story/bg·사진 주소를 검증한 후 현재 앱의 기대 건수·Agent KB·관련 테스트를 함께 갱신한다. PoC `standard_scenarios.json`은 별도 규칙 자료다. 새 Best Scenario 등록과 그 파일 수정을 혼동하지 않는다.
4. `PRESETS`는 SCENARIOS에서 생성되어 `s.audience.lead`, `s.criteria`, objections, ask, product/solution/case refs를 사용한다. 새 시나리오로 setup과 buildProfile이 생성되는지 확인한다.
5. 기존 관리자 sample-history는 기존 시나리오 기반 편집본이다. 원본 갱신이 기존 저장 샘플/사용자 제안서를 덮어쓰거나 삭제한 샘플을 다시 넣지 않도록 유지한다.

## 확인할 결과

- 전수: ID·taxonomy·PARTS·제품/솔루션/사례/이미지 참조, flow↔fills 순서/f, 슬롯 번호, STORY의 단계 키, 가중치, 배경 map, 고객명·모델·KPI·수량·일정의 덱 전체 일치.
- 전 장 render: 글 넘침/경계·예상 밖 겹침, 사진 로드/crop/정확한 모델/출처, 다른 고객명/자리표시, 판독성, 불필요한 중복. screenshot/contact sheet를 실제로 본다.
- 표준 전 장: 원본쪽→등록 f→fills 대응표, 주석·면책·제품/기능의 누락 없이 원본과 대조. 변경이 허용된 부분만 차이를 기록한다.
- UI: 목록·검색·요구 유형/제품 필터·상세 Storyboard·파트 요구사항·전체 보기·쪽 번호. 표시 옵션이 꺼진 기능은 새 시나리오 때문에 임의로 되살리지 않는다.
- 활용하기: 새 제안서 생성, 독립 id·데이터 복사, 표지 첫 장, 편집·저장·다시 읽기, 원본 보존.
- 내보내기: 실제 모든 장수·순서·내용·이미지의 PPTX와 My 재가져오기. 확장자가 pptx인 zip만으로 시각 검증을 대신하지 않는다.
- 시뮬레이션: preset→setup→관심사/우려/ask/refs가 현재 계약과 일치. 일반 시나리오를 표준으로 잘못 분류하지 않고 정본 KB에 새 정의가 보이는지 확인한다.

과거 `build/bs/check.mjs`는 이전 dist/harness와 작업 폴더를 전제로 한다. 그대로 통과한 결과를 현재 앱 검증으로 보고하지 않는다. 검사 알고리즘은 app harness에 맞춰 이식하고 새 ID를 실제로 포함한다.
