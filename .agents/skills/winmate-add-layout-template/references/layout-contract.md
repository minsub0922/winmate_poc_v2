# 레이아웃 제작·등록 계약

## 분석할 파일

| 목적 | 현재 앱 | 이전 제작 근거 |
|---|---|---|
| 메타와 HTML 등록 | `services/catalog.js`, `domain/templates/{photo_layouts,std_layouts,covers,retired}.js`, `app/data/catalog.json`, `layouts.b64` | `build/photo/make_module.py`, `build/meta.mjs` |
| 디자인 | 실제 인접한 활성 HTML, `domain/slides/Slide.jsx` | `build/photo/gen_base.py`, `gen_ind.py`, `gen_r5.py`, 해당 `gen_l*.py`; 표준은 `build/sol/lib.py`, `build/v25/std.py` |
| 파트·필수 입력 | `domain/proposals/parts.js`, `services/search.js`, `components/detail.jsx` | `make_module.py`의 BASEREQ |
| 사진·출처 | `services/{images,fill,packs}.js`, `app/data/images.json`, 앱 static | `build/photo/ph_images.json`, `src/{photo,fill}_sources.md` |
| 편집·PPTX | `domain/slides/Slide.jsx`, `export-pptx.js`, `import/pptx2html.js`, `components/mytpl.jsx` | `build/test-photo.mjs`, `build/test-std*.mjs` |
| AI가 읽는 구조 | `app/scripts/export_agent_data.mjs`, `app/api/poc/knowledge.py` | `poc/test/layout_agent/winmate_layout/{slots,metadata,render}.py`는 읽기 전용 참고 |

`app/web/src/` 접두사는 현재 앱 열에서 생략했다. 실제 생성기의 경로·의존성을 확인하고 필요한 부분만 app 대상으로 이식한다. 과거 `make_module.py`를 그대로 실행하면 루트 `src/photo_layouts.js` 전체가 재생성되어 후속 추가분이 없어질 수 있다.

## 디자인을 맞추는 기준

요구사항이 일반/사진 중심/특정 표준 덱 중 어디에 가까운지 판별한다. 서로 다른 계열의 토큰을 한 장에 섞지 않는다. 비교 대상의 screenshot, HTML, 메타에서 다음을 추출해 제작 메모에 기록한다.

- 장표 1280×720, safe margin, 머리말/제목/부제/본문/각주 영역, 반복 footer·쪽 번호.
- 폰트 패밀리, 한글/숫자 구분, 크기·굵기·행간, 정렬, 제목의 줄 수와 주장형 문체.
- 색·강조·배경, 카드 모서리·선·여백, 사진의 배치·crop·캡션.
- 사진과 텍스트의 밀도, 도식/표 표현 방식, 데이터의 단위·출처·가정 표시.

사진 계열 helper의 출발값은 Noto Sans KR, 숫자 Manrope, 흰 바탕, Samsung blue `#1428a0`, ink `#121417`, 좌우 64px, header y≈44, footer line y≈668이다. 이는 모든 표준 덱을 강제하는 절대 규칙이 아니다. 실제 선택한 인접 계열의 현재 HTML이 우선한다. 표준 Lite는 원본 좌표 pt×4/3 등 별도 기준이 있다.

한 장의 핵심 메시지가 눈에 들어와야 하며 사진을 넣기 위해 글을 너무 작게 줄이지 않는다. 필수 내용이 한 장의 가독성을 넘으면 요청 범위에 맞게 여러 레이아웃으로 나누고 이유를 설명한다.

## HTML·편집 슬롯

```html
<div style="width:1280px;height:720px;position:relative;overflow:hidden;background:#fff;font-family:'Noto Sans KR',sans-serif">
  <div data-tb="0" style="position:absolute;left:64px;top:66px;width:1152px;font-size:30px;line-height:1.3">고객의 과제와 제안 핵심</div>
  <div data-slot="Photo" data-img="0" data-kind="cut" data-pid="등록된-pid" data-hint="정확한 모델의 제품 정면 컷"
       style="position:absolute;left:64px;top:160px;width:480px;height:420px;overflow:hidden;background:#fff">
    <img src="실제-등록된-경로" alt="모델명과 사진 설명" style="width:100%;height:100%;display:block;object-fit:contain">
  </div>
</div>
```

위 코드는 구조 예시다. 실제 파일에는 유효한 pid·주소와 해당 계열의 전체 디자인을 사용한다.

- `data-tb`/`data-img`: 각 종류별 0부터 안정 번호, 중복 금지. `t` overrides의 `{html}`은 `<br>`/강조처럼 필요한 형식만 허용하고 입력을 안전하게 처리한다.
- `data-pgno`/CONFIDENTIAL page 표현: 선택한 기존 계열과 쪽 번호 계산 방식에 맞춘다. 수정 가능한 예시 고객명은 text 슬롯으로 둔다.
- 그림 슬롯 wrapper에 padding·배경·배지·crop이 있을 수 있다. `keep: true` 교체가 기존 `<img>`만 바꾸는지 확인한다. 이미지 자체가 아닌 장식·배지를 슬롯 번호로 중복 등록하지 않는다.
- 묶음 주소는 wrapper/이미지에서 현재 `data-fill`/hydrate 규칙을 따른다. `.json#k`를 일반 img src에 직접 넣지 않는다. 런타임이 `PImg`/hydration으로 해석하는 경로를 사용한다.
- 모델 컷은 흰 바탕·contain. 회색/다크 그라데이션 제품 배경을 다시 도입하지 않는다. 장면은 cover/pos로 목적을 보여 주되 사람·제품을 어색하게 자르지 않는다.
- `data-pid`·원본/출처·모델·종류·해상도를 이미지 등록부와 맞춘다. 그림 속 글을 편집 가능한 본문 대신 쓰지 않는다.
- HTML을 통째로 PNG로 만들면 AI 칸 채우기·근거·제품 교체·PPTX 편집이 사라지므로 그렇게 통합하지 않는다.

## 메타데이터

정본 export가 요구하는 최소 키:

```text
f c code name when g p p2 ind sol pc req prods sols phs ph hl txt eb foot sample
```

추가로 실제 구조와 맞춰 `nT`, `nI`, `ik`, `ih`, `sub`, `pv`, `pf`를 관리한다.

| 필드 | 검증 |
|---|---|
| `f`, `code` | 기존 ALL_LAYOUTS/숨김 표지/My 이름공간과 충돌하지 않는 새 키. 기존 관례 `L_PH_*`/`L_STD_*` 등에서 의미에 맞게 선택. |
| `c`, `cv` | 실제 계열/원본 묶음. 새 계열일 때 CANVAS와 `components/tplkit.jsx`의 DECKS도 확인. |
| `p`, `p2` | 실제 PARTS 키와 입력/AI 채우기 유형. `g`는 표시 그룹이며 PARTS 대신 쓰지 않는다. |
| `ind`, `sol`, `prods`, `sols` | 현행 IND/S/P의 ID. 범용이면 null/빈 배열을 사용하고 무관한 항목을 검색 노출용으로 붙이지 않는다. |
| `req` | 실제 장이 요구하는 REQ_LABEL 키. 예: products에는 제품, bom에는 수량, execution에는 일정. |
| `nT/nI`, `ik/ih` | 실제 텍스트·이미지 슬롯 수와 종류/힌트. 카운트만 맞고 번호가 중복된 경우도 오류. |
| `ph/phs` | 화면에 실제 남은 입력 자리표시의 수/대표 목록. 완성 시나리오 값과 혼동하지 않는다. |
| `pc` | 제품 칸 수. 단순히 사진 수를 복사하지 않는다. |
| `eb/hl/sub/foot/sample/txt` | 실제 예시 내용·검색 텍스트·출처와 일치. `when`에는 어떤 자료/목적으로 고르는지 설명. |
| `pv/pf` | 의미가 같은 텍스트 twin만 연결. `pf`는 실제 이미지 면적 측정값. 임의 점수로 사진 우선 판정을 조작하지 않는다. |

PHOTO_META에 추가했다면 PHOTO_HTML에도 있어야 한다. STD나 base에도 같은 `f`를 중복 등록해 합성 순서로 덮어쓰지 않는다. retired 처리가 요청되면 원본 렌더 데이터를 남기고 대체본의 활성 여부와 모든 참조를 확인한다.

등록 위치는 제작 전에 확정한다. 사진 중심 추가는 PHOTO_META/PHOTO_HTML, 지정 표준 덱 재현은 STD_META/STD_HTML이 기본이다. 사진 없는 일반 템플릿이 base 계열을 따라야 한다면 `app/data/catalog.json.layouts`와 gzip/base64의 HTML map을 함께 추가하되 기존 map·다른 catalog 섹션을 보존한다. 업종 기본 표지 COVERS는 숨김 표지용이므로 일반 라이브러리 항목의 등록 위치로 쓰지 않는다. 동시 DB/콘텐츠 작업의 최신 변경을 다시 읽어 필요한 키만 병합하고 전체 파일의 오래된 사본을 덮어쓰지 않는다.

## 검증할 실제 동작

1. 앱 bootstrap을 먼저 구성한 뒤 실제 catalog 모듈을 읽는다. 모듈을 단독 import하면 `getBootstrap()`이 준비되지 않아 실패할 수 있다. KB exporter의 primer 방식 또는 테스트 harness를 재사용한다.
2. 새 `f`가 유일하고 metadata↔HTML이 1:1인지, 참조·슬롯·이미지 주소가 유효한지 전수 검사한다.
3. 실제 `applyOverrides`로 예시 길이/긴 한국어/숫자·단위/줄바꿈/그림 교체를 실행한다. 모든 text rect·scroll 크기, 슬롯/화면 경계를 확인하고 스크린샷으로 의미 있는 겹침을 판단한다. 의도한 overlay는 오류와 구분한다.
4. 라이브러리·필터·검색·상세·Storyboard에 새 `f`를 넣고 편집·저장·재열기를 확인한다. 새 항목이 기존 테스트의 표본 밖이면 ID를 직접 포함한다.
5. PPTX zip에 text·picture shape가 실제로 있고 이미지 포맷이 호환되는지 확인한다. 실제 렌더 및 My 가져오기를 거쳐 내용·순서·쪽 번호·크롭이 맞는지 본다.
6. 프런트 build, 새 기대 건수의 KB export/preflight, 관련 catalog/pptx/repository 계약 검사를 수행한다. AI 채우기용 새 구조를 만들었다면 요청에 맞는 실제 모델 표본으로 칸 해석을 확인한다.

미리보기, 디자인 견본 ID, 새로운 메타/HTML 및 이미지 파일, 검사 결과를 작업 산출물로 남긴다. 이전 아티팩트 bundle patch/UTF8 pack은 현재 Vite 빌드 절차가 아니다.
