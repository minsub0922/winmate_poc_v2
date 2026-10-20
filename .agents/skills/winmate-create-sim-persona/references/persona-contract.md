# 페르소나 데이터와 런타임 매핑

## 기존 구현의 서로 다른 층

| 파일 | 의미 |
|---|---|
| `app/web/src/domain/simulation/profile.js` | LEVELS, 기본 6명, scenario/proposal/free setup, `buildProfile`, `personaOf` |
| `app/web/src/repositories/personas.js` | 직접 만든 인물 40명까지, `clean`, add/update/delete, `winmate.v2.simPersonas` |
| `app/web/src/domain/simulation/looks.js`, `components/persona.jsx` | SVG 얼굴 30개와 옵션, 표정 렌더 |
| `app/web/src/repositories/simulations.js` | `newSim`, profile/setup의 세션 보존, 최근 15개, `winmate.v2.sims` |
| `app/web/src/pages/SimulationPage.jsx` | 설정·인물 선택/편집·난이도·ProfileCard·대화·제안서 전환 |
| `app/web/src/domain/simulation/{engine,score}.js` | 실제 Gemini 대사·평가·총평, 점수/우려/종료 정규화 |
| `poc/test/sim_eval/data/personas150.json` | 50명 × 3단계=150 조건. 앱의 선택 목록이 아니라 이전 평가용 corpus. 읽기 전용 참고. |
| `poc/test/sim_eval/lib/persona.mjs` | corpus→setup/profile 변환 예. 이전 엔진을 사용하므로 현재 앱으로 그대로 실행하지 않는다. |
| `poc/test/sim_eval/README.md` | 이전 실험 절차·결과. offline/과거 번들 결과를 현재 앱 성능으로 보고하지 않는다. |

## 앱 저장용 인물 계약

`clean`이 보존하는 필드는 다음이다. 현재 길이/상한은 코드를 재확인한다.

```text
key, custom:true, level:1|2|3, gender:M|F,
name(20), age(25..75), role(30), career(60),
traits(최대4개·각14), quote(120), style(120),
face, look:{...}, createdAt, updatedAt
```

신규 key는 저장 시 `addPersona`가 `uid('cp')`로 만든다. 기본 key `1M/1F/2M/2F/3M/3F`는 유지한다. 얼굴은 LOOKS에서 유효한 look을 복사하고 SKINS/HAIRS/SUITS/GLASSES와 `tweak`를 사용한다. 파일에 face ID만 적는 것으로 얼굴 필드가 채워지는지 확인한다.

실제로 clean은 look이 없어도 빈 객체를 만들 수 있으므로 key 존재만 확인해서는 부족하다. 기존 유효 LOOK의 전체 속성에서 시작하고, 빈 look/지원하지 않는 hairStyle 등을 검출한 뒤 Portrait를 렌더한다.

앱 인물 객체에는 회사·업종·req·refs·concerns·levels·lv를 임의로 추가해도 `clean`에서 버려진다. JSON 파일을 만들었다고 앱에 import되는 것도 아니다. 현재 앱에는 corpus 전체를 자동 등록하는 경로가 없다. 데이터 생성 요청이면 저장용 인물+setup 및 명시적 매핑을 산출하고, 앱에서 선택 가능하도록 추가하라는 요청이면 app 소유 등록/가져오기 경로를 구현한다. 사용자 브라우저 저장소에 넣는 작업과 코드에 preset을 추가하는 작업을 구분한다.

## 요구사항 setup

현재 `emptySetup`, `setupFromScenario`, `setupFromProposal`를 기준으로 만든다.

```text
source: free|scenario|proposal (persona 같은 새 source는 소비자 호환 확인),
sid: 실제 SC id 또는 null, pid: 실제 proposal id 또는 null,
customer, ind, role, req:[{t}|{ref}], interests:최대4,
refs:{products:[P id], solutions:[S id], cases:[문자열 C id]}, title,
gender:선택
```

req는 원문 문자열을 넣는 대신 기존 `seg()`/Mention segment 계약을 사용한다. 제품 태그·refs와 텍스트 모델명을 대조한다. 연결 시나리오의 요구·제품이 사용자 지정과 충돌하면 사용자의 상황을 우선한다.

현재 설정 화면은 `setupText(st)`가 8자 이상이어야 시작할 수 있다. 인물만 저장하고 요구사항을 비워 둔 상태를 연습 가능한 패키지로 보고하지 않는다.

## 3단계 설계와 프로필

| 난이도 | 기본 시작/승리/실패 | 우려 수 | 학습 차이 |
|---|---|---|---|
| 1 호의적 | 60 / 75 / 15 | 1 | 기존 신뢰가 있고 운영·일정 중심, 잘못된 사실은 여전히 지적 |
| 2 첫 고객 | 45 / 80 / 15 | 2 | 사례·근거·적용 가능성 검증, 결정에 신중 |
| 3 까다로움 | 30 / 85 / 15 | 3 | 경쟁·예산·전환 비용, TCO·조건·위험을 엄격히 검토 |

우려는 서로 다른 주제로 구성하고, 예상 답변은 증거·실측·프로세스 기준이다. 숫자/경쟁사 견적은 가상 훈련 조건이면 명시하고 삼성 공식 주장과 섞지 않는다.

`buildProfile(st, level, gender, persona)`가 반환하는 핵심:

```text
name, gender, age, career, traits, quote, style, key,
look/pkey/prole/face (custom인 경우), role, company, ind, level,
interests, concerns, ask, next, kpis
```

concern 항목:

```text
id:c1..cN, key, text, short, ref, say, kw, kwq, answer,
revealed:false, resolved:false, at:null
```

현재 `buildProfile`은 선택한 시나리오의 objections와 난이도 공통 우려를 조합한다. 임의의 persona.concerns나 persona.levels를 자동 반영하지 않는다. corpus 맞춤 우려를 사용하려면 새 세션 생성 직전/과정의 정규화된 profile로 옮기는 adapter가 필요하다. `newSim`이 다시 `buildProfile`을 호출하므로 setup에만 추가해서는 전달되지 않는다.

`engine.js`는 `profile.lv`의 `relation, perception, competition, budget, style, tone`만 공통 LEVELS 위에 덮는다. corpus의 `decision`은 이 경로의 `style`로 매핑한다. `opening`, `win` 같은 데이터셋 필드는 이 확장점만으로 사용되지 않는다. 기본 인사·승리 조건까지 개인화하려면 모든 사용 지점과 보존 경로를 별도로 수정/검증한다.

현재 `ProfileCard`는 관계·인식·경쟁·예산·말투를 공통 `LV[level]`에서 표시한다. profile.lv를 엔진에만 넣으면 화면과 대화가 달라질 수 있다. 같은 effective level 계산을 쓰도록 맞추거나 지원 범위를 분명히 표시한다. `personaOf` 재구성과 사용자 인물 저장 clean도 확장 필드를 유지하는지 검증한다.

실제 적용 요청의 구현 경로는 하나를 선택해 완성한다. 예를 들어 app 소유 preset/corpus + adapter를 쓰거나, 저장 schema에 정규화한 levels를 추가한다. 선택한 `levels[level]`에서 traits/quote/style·lv·concerns·ask를 최종 profile로 옮기고 c1..cN/초기 상태/길이 상한을 맞춘다. 사용자 지정 조건과 연결 시나리오가 충돌하면 우선순위를 명시한다. `newSim`, personaOf, 저장/복원, ProfileCard가 같은 값을 유지해야 한다. levels 없는 기존 인물은 현재 동작을 유지하고 과거 세션은 재생성하지 않는다.

## 기존 평가 corpus를 확장할 때

기존 상위 구조:

```text
name, version, source, levels, count, extraProducts, personas:[...]
persona = { id, ind, customer, case?, orgType, scale, person, req, levels }
person = { name, gender, age, role, careerBase }
req = { title, type, strategy, situation, pains, goals, constraints,
        signals, criteria, products, solutions, kpis, ... }
levels['1'|'2'|'3'] = { relation, perception, competition, budget,
        decision, tone, opening, careerTail, traits, quote, style,
        concerns:[{text,answer}], ask, win, ... }
```

`count`·version 등의 형식은 실제 파일을 읽는다. 50명과 150조건을 혼동하지 않는다. 신규 생성물은 app 소유 dataset에 두고 기존 `poc/test`를 자동 덮어쓰지 않는다.

`case`에는 실제로 확인한 공식 사실과 출처, 가상의 `customer/scale/req`에는 가정을 표시한다. 기존 corpus의 숫자도 새로운 사실의 증거가 되지 않는다. `extraProducts`를 현재 P에 추가해야 하면 정규 DB/큐레이션 통합 계약으로 처리하고 이름만 runtime에 보충하지 않는다.

## 검증과 회귀

1. 같은 인물/고객이 난이도 간 유지되고 제약·결정 권한·예산이 모순되지 않는지 확인한다. 우려는 1/2/3개이며 중복 없이 모두 미공개·미해결에서 시작해야 한다.
2. 공식 사실/가정/목표/참고 사례를 분리하고 P/S/C/IND와 scenario ID가 모두 해석되는지 확인한다. look은 얼굴/머리/옷/기분 변경에서 올바르게 렌더되어야 한다.
3. 저장→읽기→newSim→personaOf→대화 프롬프트 왕복에서 필요한 정보가 유지되는지 확인한다. 원본 persona를 지워도 기존 세션의 얼굴·내용이 바뀌지 않아야 한다.
4. 적절한 반론 대응, 일반론만 있는 답변, 우려가 남은 결정 요청을 표본으로 연습한다. 숨은 우려 전체 공개·해소, 만족도 기준, 구체적 ask 전에는 성공하면 안 된다.
5. 대화 품질은 실제 Gemini 표본으로 확인한다. 생성 persona에 점수/응답을 미리 넣어 성공시키지 않는다. 13개 SIM_CRIT, 점수 상한, 실패/재시도, 기록/백업 계약을 유지한다.

다수 생성이면 업종·역할·규모·요구 유형·성별·난이도·관련 시나리오 분포를 집계하고 이름만 바꾼 중복을 검사한다. 개수·비율은 사용자 요구에 맞추며 과거 평가의 50명/10명 비율을 고정 목표로 삼지 않는다.
