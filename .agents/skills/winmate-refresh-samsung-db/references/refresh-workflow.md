# 수집부터 삭제 영향 검토와 릴리스까지

## 먼저 읽을 구현

- `proddb/README.md`, `proddb/build/schema.sql`, `build_db.py`, `export_app.py`.
- `proddb/build/collect_site.mjs`, `fetch_ecat_text.py`, `proddb/raw/site_lists.txt`, `proddb/ecat/catalogs.json`.
- `proddb/ecat/BRIEF.md`, `PHOTO_BRIEF.md`, `corrections.json`, `photos.json`.
- 사진: `pack_images.py`, `cut_ecat_photos.py`, `photos_db.py`, `site_photos.json`.
- 이미지 검색: `proddb/imglib/index.json`, `imglib_db.py`, `fetch_imglib.py`, `pack_imglib.py`.
- 솔루션/사례: `build/media/README.md`, `build/media/data/sol_urls.json`, `crawl_cases.py`, `list_all.mjs`, `page_imgs.mjs`, `pack_media.py`; 앱 `catalog.json`, `media.json`과 각 소비자.
- 현재 앱 연결: `app/scripts/prepare_data.py`, `export_agent_data.mjs`, `app/api/products.py`, `app/api/poc/knowledge.py`, `app/web/src/services/{catalog,products,images,media,packs,search}.js`.

## 전체 대상 확인표

| 묶음 | 갱신 범위 | 완전성 확인 |
|---|---|---|
| 삼성 한국 B2B 탐색 | GNB·하위 목록·새 분류·필터·솔루션 목록 | 기존과 신규 URL 합집합, 분류 ID, API 총수·전체 페이지·중복 |
| 사이트 제품 | 상품 family·옵션 SKU·품절/판매 상태·USP·카드 이미지 | family별 옵션, 목록 총수, 다중 분류 소속, 카드↔상세 대응 |
| 제품 사양/PDP | 옵션별 사양, 특장점·carousel·면책, PC/MO 이미지·alt | 요청 성공과 파싱 성공 구분, 빈 사양·특장점의 원문 확인 |
| e-카탈로그 | 현재 권 목록·비공개 링크로 유지된 기존 권·제목·개정·쪽·PDF·이미지 | Dir, 실제 제목·총쪽수·추출쪽수·원본 hash, 누락쪽 |
| 카탈로그 제품 | 추출 제품·모델·사양·기능·사이트 대응·교정 | 모델별 해당 쪽 원문/쪽 이미지, 정확/부분 매칭 근거 |
| 솔루션·업종 | 공식 솔루션, 연동 제품, 업종 소개와 제품/사례 연결 | 삼성 한국/해외/Knox/VXT 등 실제 사용 중 공식 출처와 의미 |
| 고객 도입사례 | 목록, 본문, PDF 보고서, 영상 대표 장면, 날짜·고객·제품·성과 | 목록 전체 페이지, 원문 링크, 실제 적용 모델, 사실 출처 |
| 사진·이미지 색인 | 카드·상세·카탈로그 crop·사례·솔루션 이미지, 범위 주소 | 실제 파일·해상도·종류·모델·제품 연결·출처·중복·바이트 범위 |
| 편집/정제 데이터 | 큐레이션 제품, 검색 kw/space/industry, 수동 교정·drop 판정 | 신규 원문과 재대조, 의도적인 제외·대체 이유의 보존 |

처음부터 B2C·조달 등 기존 제외 대상을 영구 제외하지 않는다. 현재 요청 범위와 목록을 검토해 포함/제외 및 이유를 인벤토리에 적는다. 페이지 제목과 실제 권이 달랐던 Dir 297/203, 목록 밖 Dir 93 같은 사례를 개별 재확인한다.

## 기존 크롤러가 보장하지 않는 것

- `collect_site.mjs`는 `site_lists.txt + EXTRA`만 순회한다. 기본 `goodsList`는 `page=1, rows=400`이므로 실제 총수가 더 크면 페이지네이션을 구현하고 필터 소속 조회도 끝까지 읽는다.
- 오류를 남기고 다음 분류로 넘어갈 수 있다. 종료 코드 0, JSON 생성 또는 건수 감소만으로 완전 수집이라고 판단하지 않는다. 로그·errors·expected/received를 대조한다.
- `fetch_ecat_text.py`는 기존 `text/<Dir>.json`을 건너뛰고 `catalogs.json`의 일부 tab/Dir만 읽는다. 목록 재탐색·변경 권 재수집·폐지 권 상태 처리는 별도로 해야 한다.
- `get()`이 실패해 빈 문자열을 돌려줘도 총 0쪽/빈 text JSON이 저장될 수 있다. 부분 실패도 파일로 남아 다음 실행에서 건너뛰므로 기존 JSON 존재를 성공으로 취급하지 않는다. 인벤토리의 확정 대상 목록과 staging 출력 경로를 받도록 수집기를 이식/매개변수화한다. 유효한 총쪽수와 `1..n`의 쪽별 수집 상태를 대조한 뒤에만 성공 파일로 확정하고, 빈 텍스트가 이미지 전용 쪽인지 수집 실패인지 원문으로 구분한다.
- `export_app.py`의 `PAGES` 기본값은 과거 `v1_wkb_pages_v2.json`이다. 이것을 그대로 쓰면 업종·사례 색인만 과거 시점에 머문다. 갱신된 자료와 정규화 형식을 연결한다.
- 다운로드/crop/인코딩 캐시는 URL·제품 ID가 같아도 원본 이미지가 바뀌면 낡을 수 있다. 변경된 해시의 파일만 재수집·재가공하고 관련 판정/crop을 재검토한다.
- `cut_ecat_photos.py --all`도 crop 결과를 다시 만들 뿐, 이미 받은 `raw_pages`의 쪽 이미지/PDF는 재다운로드하지 않는다. 개정된 권은 원본 캐시부터 갱신하고 쪽/영역 좌표도 새 판본에 재대조한다.
- 솔루션/사례 이미지 수집기는 텍스트 catalog의 최신성을 자동으로 보장하지 않는다. 앱의 사례·솔루션 레코드와 이미지 메타 모두 갱신한다.

## 안정 ID와 삭제 계획

변경표는 원천 entity ID와 앱 ID를 모두 담는다. 권 안 순번을 재배열해 `ec<Dir>_<순번>`을 다시 부여하면 다른 제품이 과거 ID를 차지할 수 있다. 기존 ID↔모델 집합↔권/쪽 대응표로 동일성을 확인하고 새 ID와 이관표를 분리한다.

삭제 후보의 필수 열:

```text
entity_type, source_id, app_id, old_url, checked_url, reason,
official_evidence, checked_at, collection_complete,
other_sources, inbound_refs, proposed_action, replacement_id,
migration_or_archive, authorization, verification
```

판단 순서:

1. 실패/빈 응답/불완전 수집이면 `unresolved`로 남기고 기존 유효값을 보존한다.
2. URL/분류 이동 또는 대표 모델 변경이면 동일성을 확인해 기존 ID의 출처·내용을 갱신한다.
3. 사이트에서 빠졌으나 카탈로그나 공식 지원 자료에 있으면 출처/판매 상태를 나눠 보존한다. 품절은 폐지와 다르다.
4. 공식 폐지·제거가 확인되면 현행 목록/추천에서 제외할지, 원문 archive와 과거 참조를 남길지 결정한다. status/alias 필드를 JSON에 넣기만 해서는 UI·추천이 이를 처리하지 않는다. 실제 필터·해석·마이그레이션을 구현/검증한다.
5. DB cascade만 믿지 않는다. `family_category`, tags, specs, features/items, image assets, catalog links, product_photo, `lib_image_product/fts` 등의 관계와 JSON 참조를 직접 점검한다. `PRAGMA foreign_key_check`가 깨끗해도 FK가 선언되지 않은 의미 참조는 남을 수 있다.
6. `P/S/C/IND`, 레이아웃 메타와 HTML의 모델/`data-pid`, 시나리오·fills·story·bg, 솔루션 `.with`, 페르소나·preset·관리자 sample ID, 이미지 검색 인덱스와 저장 문서/찜/백업을 조사한다. 외부 브라우저의 알 수 없는 과거 참조도 고려한다.
7. 참조 없는 생성 캐시/오류 파일과 근거 있는 목록 제외는 승인된 갱신 범위에서 처리한다. 복구 불가능한 원문·사용자 참조 삭제는 구체적인 변경표로 필요한 결정을 받은 뒤 처리한다.

이전 모델을 신모델로 말없이 치환하지 않는다. 대체 추천과 원래 제품의 역사 정보는 분리한다.

사이트↔카탈로그 대응은 `build_db.py`의 정확 모델·접미 생략·부분/와일드카드·이름 매칭 우선순위와 제외 조건을 읽고 근거를 남긴다. 같은 모델의 국가/색상 접미와 다른 제품을 구분한다. 공용 부품 코드 한두 개만 겹친다고 서로 다른 제품군·권의 항목을 연쇄 병합하지 않는다. 기존 교차 권 중복 제거의 모델 집합/이름 조건을 보존하고 새 경계 사례를 검증한다.

## 빌드 순서와 입출력

다음은 실제 스크립트 계약을 읽기 위한 실행 예다. staging/현재 app 경로에 맞춰 인자를 설정하고 활성 입력을 덮어쓰지 않는지 확인한다.

```sh
# proddb 작업 디렉터리에서, 변경된 원문/ECAT를 준비한 뒤
ECAT=/absolute/staging/ecat python3 build/build_db.py /absolute/staging/raw /absolute/staging/products.sqlite
python3 build/export_app.py /absolute/staging/products.sqlite /absolute/staging/app-export
```

`app-export`는 exporter가 기대하는 `data/catalog.json`, `img/prod/` 등 구조를 갖춰야 한다. 이후 사진·라이브러리 단계의 DB/raw/ECAT 경로는 모든 스크립트가 동일하게 매개변수화되어 있지 않다. 별도 작업 복사본/매개변수화로 일치시킨다.

산출물→현재 앱 대응표:

| 생성/편집 입력 | 현재 앱 반영 위치 | 보존/검증 |
|---|---|---|
| 새 원본 SQLite | `proddb/winmate_products.sqlite` → prepare_data의 runtime 사본 | 반영 전 원본과 기존 runtime DB 모두 백업 |
| staging `data/catalog.json` | 현재 `app/data/catalog.json`을 기준으로 필요한 섹션만 편집 | exporter가 읽는 입력이며 exporter가 새 catalog 전체를 생성하는 것이 아님. layouts 등 무관한 섹션 보존 |
| staging `data/products_db.json` | `app/data/products_db.json` | `{curated:{기존ID:추가필드},products:[DB행]}` 구조와 큐레이션 ID 유지 |
| staging `img/prod/dNN.json` | 활성 app static `img/prod/` → `wm_ui_detail` | 제품별 d/상세 coverage, 중복 ID·고아 상세 검사 |
| staging `img/prod/{t,g}NN.json`, `img/lib/`, `img/media/` | 활성 app static의 같은 상대 경로 | 과거 주소의 의미·신규 이미지 대응·Range 인덱스 검증 |
| 변경된 `images.json`, `media.json`, 라이브러리 index | 대응하는 `app/data` 파일/활성 static index | 현재 소비자가 실제 읽는 경로에 반영, 출처/관계 유지 |

catalog의 큐레이션 제품·솔루션·사례·업종을 수정할 때는 인벤토리에 선언된 변경만 병합한다. 제품 exporter를 돌리기 위해 과거 루트 catalog 전체로 현재 catalog를 덮어쓰지 않는다. 변경 범위 밖 섹션의 diff는 없어야 한다.

1. 원문·카탈로그 추출·교정/대응표를 갱신한다. 모델을 해당 쪽 텍스트로 전수 대조하고 추출 누락·기호 손실은 실제 쪽 이미지로 확인한다.
2. 새 DB를 만든다. `build_db.py`는 지정 출력 DB를 먼저 지우고 journal/synchronous를 끄므로 활성 DB를 출력 인자로 주지 않는다. `photos_db.py`·`imglib_db.py`가 어느 DB·index를 읽는지도 확인한다.
3. 사이트 사진과 catalog crop을 갱신한 뒤 export/pack을 만든다. `pack_images.py`는 `site_photos.json`을 재사용하므로 신규·변경 사이트 사진은 재생성 경로(`--resite` 포함)를 검토한다. 이 옵션은 주소 재배열 위험이 있으므로 저장 문서 호환성 대책 없이 전체 재패킹하지 않는다.
4. `proddb/imglib/index.json`은 수동 정제 결과가 합쳐진 기준이다. 원래 판정 작업 폴더는 저장소 밖일 수 있다. 새 후보와 기존 keep/drop·관계 판정을 합치고 메타(종류·설명·모델·제품·공간·업종·원본·쪽·crop·크기·hash)를 만든 뒤 DB/FTS·이미지 pack을 재생성한다.
5. `merge_prod_packs.py`는 일부 g09→g08 주소만 제품 JSON에서 바꾼다. 이미지 라이브러리·fills·사용자 데이터 등 외부 참조를 자동 이관하지 않는다. 통합 전 pack을 최종화하거나 모든 참조를 함께 이관한다.
6. 검증된 원본 SQLite와 export를 app 소유 경로로 반영한다. 루트 산출물만 바뀌고 `app/data`·API 정적 경로가 낡은 상태로 남지 않게 한다.
7. `prepare_data.py --force`로 새 runtime projection을 만들고 Agent KB를 export한다. 건수 변화에 맞는 계약·API 상한·테스트를 함께 바꾼다. 재시작/캐시 무효화는 새 데이터가 실제 서비스에 보이는 데 필요한 범위로 수행한다.

projection에는 각 행의 원천 대응도 검사한다. gid가 있는 사이트/큐레이션 행은 family/SKU와 대조하고, gid가 없는 카탈로그 행은 catalog_product와 추출 ID 대응표로 검증한다. d가 지정된 모든 행에 실제 상세가 있으며 상세 참조의 pack도 일치해야 한다. 설명 없이 d가 사라진 변경, 현재 행에 연결되지 않은 고아 상세, pack 사이 같은 ID 중복을 오류로 다룬다. `INSERT OR REPLACE`의 조용한 덮어쓰기를 검증 대신 사용하지 않는다. 기대 건수와 `projection_contract`의 설명도 새 변경 계획에 맞게 일치시킨다.

## 전수 검사와 표본 검사

전수: source coverage, ID 중복, DB integrity/의미 FK, 제품↔원본 대응, 삭제 영향 처리, 이미지/상세/배경 주소의 pack 존재·인덱스·Range 위치, 앱/KB 건수·ID·핵심 값, unresolved 목록.

표본: 제품군·사이트/카탈로그/큐레이션·변경/신규/폐지별 실제 원문 대조, 변경 crop 전부의 시각 확인, 옵션·사양·갤러리·출처 링크, 검색/추천/멘션/제품 교체·이미지 삽입·기존 덱 렌더. 제품 컷의 흰 배경을 라이트/다크에서 확인한다.

새 이미지의 선별과 기존 제품 연결을 의미 없이 자동 승인하지 않는다. 이름만 비슷한 대체 컷을 실제 모델 사진으로 연결하지 않는다. 원래 자료에 없으면 `none`과 이유를 유지한다. 과거의 2021년/200px 규칙은 당시 품질 필터이므로 현재 자료의 실제 모델·품질을 보고 예외 근거를 기록한다.

활성 반영 전에 새 스냅샷과 검증 결과를 준비하고, 실패 시 이전 DB·JSON·pack·KB를 같은 세트로 복구할 수 있게 한다.
