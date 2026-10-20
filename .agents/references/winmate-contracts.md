# Winmate 공통 데이터·통합 계약

확인일: 2026-10-20 KST. 아래는 현재 저장소를 읽어 확인한 시작점이다. 실행 시 작업 트리·코드·실제 등록 데이터가 우선한다. 이 문서의 건수를 영구 상수로 삼지 않는다.

## 현재 앱과 이전 제작 자료

| 경로 | 역할과 사용 원칙 |
|---|---|
| `app/web/src/` | 현재 React 앱. `services/catalog.js`가 레이아웃·제품·솔루션·사례 레지스트리를 합친다. |
| `app/data/{catalog,products_db,images,media}.json`, `layouts.b64` | 현재 앱 입력. 루트 `data/`와 별개이므로 자동 동기화를 가정하지 않는다. |
| `app/data/product-details/dNN.json` | 검토된 앱 소유 상세 overlay. `prepare_data.py`가 동결 pack 다음에 같은 ID·pack 주소만 덮어쓰며 제품/팩 불일치는 거부한다. `proddb.product_spec_review`가 재생성 시 스펙을 보존하고 KB exporter도 동일한 사양·출처를 읽는다. |
| `app/api/`, `app/scripts/` | API·제품 projection·Agent KB 생성 및 점검. |
| `proddb/` | 삼성 원문·추출·원본 SQLite·사진/이미지 라이브러리와 재현 코드. DB 갱신 요청에는 이 범위의 필요한 변경이 포함된다. |
| `build/`, `src/`, 루트 `data/`, 루트 `dist/` | 이전 아티팩트 제작 이력·생성기·산출물. 규칙을 분석하는 근거이며 현재 앱 반영 경로는 따로 확인한다. |
| `reference/live/` | 동결 기준본. 비교용으로 보존한다. 현재 `app/data/static -> ../../reference/live`이므로 이 링크 아래에 쓰면 기준본이 바뀐다. |
| `poc/test/` | 현재 API가 읽기 전용으로 import하는 과거 에이전트·평가 규칙. `sync_source.py`나 과거 bundle patch로 원본/게시본을 수정하지 않는다. |
| `app/data/runtime/` | SQLite projection·정본 KB·인증 등 생성/운영 자료. 콘텐츠 갱신 때 인증·사용자 자료를 지우지 않는다. |

`app/README.md`의 원본 불변 방침은 이전 마이그레이션의 경계다. 사용자에게 명시적으로 요청받은 DB 갱신 등 필요한 원본 변경을 무조건 차단하는 규칙으로 해석하지 않는다. 다만 동결 기준본과 다른 작업의 변경은 보존한다. 과거 스크립트에 `/home/claude/...`, `/tmp/claude-0/...`가 있으면 실제 입력·출력 경로와 의존 파일을 읽고 app 소유 경로로 이식/매개변수화한 뒤 사용한다.

## 정본 흐름

```text
삼성 공식 소스 → proddb 원문/추출/사진 → proddb/winmate_products.sqlite
                                      ↓ 앱용 export + 이미지 pack
                     app/data JSON + 앱이 실제 제공하는 정적 파일
                         ↓ prepare_data.py --force
                app/data/runtime/winmate_products.sqlite
                         ↓ /api/bootstrap, /api/products, /api/product-packs/*
                         현재 프런트

app/data + app/web/src/domain/templates + services/catalog.js
                         ↓ export_agent_data.mjs
                   app/data/runtime/kb → app/api/poc/knowledge.py
```

이 흐름은 한 명령으로 모두 수행되지 않는다. `prepare_data.py`는 원본 DB를 복사하고 UI JSON·상세 pack을 materialize할 뿐 수집·제품 JSON 생성·파일 동기화는 하지 않는다. 기존 runtime DB가 있으면 `--force` 없이 반환한다. `export_agent_data.mjs`는 현재 앱 레지스트리를 묶는 별도 과정이다.

제품 사양만 갱신할 때는 검증된 기존 KB가 있으면 `node app/scripts/export_agent_data.mjs --products-only`를 사용할 수 있다. 제품 ID 추가·삭제와 기존 KB 해시 불일치는 거부한다. 사양 overlay 및 products_db 입력 해시만 갱신하고, 병행 작업 중인 레이아웃의 메타·HTML·검증 상태와 원천 해시는 그대로 유지한다.

## 현황과 알려진 함정

- 현재 앱: 전체 레이아웃 835, 활성 594, 제품 1,068(큐레이션 40 포함), 솔루션 17, 사례 218, Best Scenario 22. 사진 메타/HTML 334쌍, 표준 메타/HTML 55쌍이다.
- 현재 표준 시나리오는 `bs21`(AI 스테이 37장), `bs22`(공유오피스 Lite 15장)이다. 루트 `build/v25/README.md`의 bs23~25는 제작 이력이며 현재 앱에 등록됐다는 뜻이 아니다.
- `app/scripts/prepare_data.py`에 1,068행 assert, `app/scripts/export_agent_data.mjs`에 기대 건수, `app/api/poc/knowledge.py`에 EXPECTED, API `limit` 상한과 여러 테스트에 고정 건수가 있다. 내용 변경으로 건수가 바뀌면 실제 새 인벤토리로 정당화해 관련 계약을 함께 갱신한다. `--allow-count-drift`만으로 최종 검증을 통과시킨 것으로 보고하지 않는다.
- `export_agent_data.mjs --out`은 `app/data/runtime/` 하위만 허용한다. 시험 KB도 그 아래 별도 디렉터리를 쓴다. 기대 건수 옵션은 스크립트 본문을 확인한다.
- KB manifest의 입력 목록에 모든 시나리오 fills/story/bg 의존성이 포함됐다고 가정하지 않는다. 콘텐츠 파일과 묶음 주소는 별도로 검증한다.
- 정적 자산 갱신이 필요하면 동결 링크를 직접 쓰지 않는다. 기존 제공 경로를 유지하는 app 전용 static snapshot을 기본으로 한다. 기준본을 staging의 실제 디렉터리로 복사한 뒤 새 자산을 반영·검증하고, `app/data/static` 링크를 그 app 소유 snapshot으로 바꾸거나 실제 디렉터리로 교체한다. 기존 API/prepare_data가 새 경로를 읽는지 확인하고 preflight에는 기준본 검증과 활성 앱 자산 검증을 분리한다. overlay를 택한다면 우선순위·동일 주소 처리·상세 pack 중복 키 정책과 서버/prepare_data 읽기 경로를 구현하는 것이 자산 반영의 선행 조건이다. 어느 경로도 준비되지 않았으면 기존 제공 자산만 재사용할 수 있으며 새 자산을 반영했다고 보고하지 않는다. 기준본 manifest는 다시 쓰지 않는다.
- 511개 파일·16MB 같은 과거 아티팩트 제약은 과거 배포 맥락이다. 현재 대상의 제약을 확인해 pack 전략을 결정하며 과거 숫자를 새 요구사항으로 강요하지 않는다.

## 식별자와 저장 문서

- 제품 `id`, 사이트 `goodsId`·`pf_<goodsId>`, 모델 SKU, e-카탈로그 `Dir/page`·추출 ID, 앱 `ec_*`는 서로 다른 키다. 같은 숫자나 이름만으로 합치지 않는다.
- `P/S/C/IND`에 없는 참조는 오류다. 사례 ID는 문자열로 정규화한다. 큐레이션 ID는 템플릿·시나리오의 장기 참조이므로 신모델의 ID로 재사용하지 않는다.
- `ALL_LAYOUTS = catalog.layouts + PHOTO_META + STD_META`; `LAYOUTS`는 retired 제외; `L`에는 숨긴 업종 표지도 있다. `layoutHtml()`은 base gzip/base64 HTML + COVERS + PHOTO_HTML + STD_HTML을 쓴다.
- retired는 선택·추천에서 제외하는 방식이다. 기존 문서가 참조하는 HTML을 물리 삭제하는 방식이 아니다. 신규 등록은 메타와 HTML 양쪽에 필요하다.
- `f`, `data-tb`, `data-img`, `data-sp`, `data-pid`, `img/*.json#k`는 사용자 overrides·찜·My 템플릿·PPTX가 참조할 수 있다. 주소/키의 의미를 바꾸면 저장 자료와의 이관이 필요하다.
- `app/web/src/repositories/`의 제안서·찜·템플릿·시뮬레이션·페르소나·백업과 `sample-history.js`를 영향 확인에 포함한다. 사용자 브라우저 자료는 일반 `rg`로 전부 찾을 수 없다. 내보내기/백업을 이용한 이관 또는 과거 참조 보존을 설계한다.

## 검증을 선택하는 방법

변경 전부터 존재한 문제와 이번 변경의 실패를 구분하고, 실행한 검사의 결과만 보고한다. 사용자 자료와 분리된 임시 DB/브라우저 context에서 확인한다.

```sh
npm --prefix app/web run build
node app/scripts/export_agent_data.mjs
app/.venv/bin/python -B app/scripts/preflight.py --deep
node app/tests/functional-contracts.mjs catalog
node app/tests/functional-contracts.mjs pptx
node app/tests/functional-contracts.mjs repository
```

KB export는 기존 기본 기대값과 새 계약이 맞는 상태에서 실행한다. preflight는 동결 기준본과 신규 앱 자료를 구분해 점검하도록 유지한다. 브라우저 검사는 API와 격리된 Vite/인증 설정이 필요하므로 `app/tests/fixtures/strict/harness.mjs`와 해당 테스트의 실행 설명을 읽는다. 기존 테스트가 새 항목을 실제로 다루는지 확인하고 새 ID를 포함하는 의미 있는 검사를 추가/조정한다.

현재 AI 대화·판단·채움·평가는 실제 Gemini만 사용한다. 예전 `src/sim`·평가 harness의 offline/rule 모드는 현재 앱의 성공 증거가 아니다. 실모델 검증은 관련 표본으로 제한하고 오류를 성공 결과로 바꾸지 않는다. 자격 증명을 문서·로그·생성 데이터에 기록하지 않는다.
