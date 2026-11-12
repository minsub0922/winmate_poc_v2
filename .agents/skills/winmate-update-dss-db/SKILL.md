---
name: winmate-update-dss-db
description: Winmate DSS(제품·솔루션·서비스) DB를 samsung.com/business·e-카탈로그의 기존 소스 전부로 다시 받아 바뀐 것을 갱신하고, DSS별 확인 시점 표식·이전 표식 항목 재검토·삭제와 관련 PPT 레이아웃 대체까지 할 때 사용한다.
---

# Winmate DSS DB 업데이트

DSS는 Device(제품) · Solution(솔루션) · Service(서비스)다. 이 skill 한 번 실행이 하나의 확인 회차(run)이며, 다음 네 가지를 한 세트로 끝낸다.

1. samsung.com/sec/business와 e-카탈로그(samsung.aiibook.net/b2b)에서 **기존에 쓴 소스 전부**(+ 같은 채널에 새로 생긴 것)를 다시 받아, 하나라도 달라진 것은 모두 갱신한다. key message·색인·사진 연결 같은 파생 메타데이터까지 새 원문으로 다시 만든다 — 사실상 DB 메타데이터 전체 재구축이다.
2. 이번 원문에서 확인된 DSS마다 실행 시점(`RUN_AT`)을 표식한다. 바뀐 게 없어도 찍는다.
3. 표식이 이전 시점에 머문 항목은 판매 종료(deprecated) 후보다. 다시 검토해 확정된 것만 삭제한다.
4. 삭제한 항목을 쓰던 PPT 레이아웃·샘플 시나리오를 같은 제품군의 다른 제품으로 고친다.

저장소는 `minsub0922/winmate_poc_v2`, 경로는 저장소 루트 기준이다. 시작 전에 `.agents/references/winmate-contracts.md`, `.agents/skills/winmate-refresh-samsung-db/`(SKILL.md, `references/refresh-workflow.md`의 '기존 크롤러가 보장하지 않는 것' · 삭제 후보 필수 열 · 빌드 순서), `proddb/README.md`를 읽는다. 이 skill은 그 갱신 절차 위에 표식 → 재검토 → 삭제 → 레이아웃 대체를 더한 것이다. 실행할 때는 코드·데이터의 실제 상태가 이 문서의 경로·건수보다 우선한다.

## 대상 레지스트리

| 레지스트리 | 위치 | 2026-11 기준 | DSS 종류 |
|---|---|---|---|
| 제품 DB 행 | `app/data/products_db.json` products(사이트 `sg_<goodsId>`, 카탈로그 전용 `ec_<Dir>_<순번>`), `proddb/winmate_products.sqlite` | 602 + 426 | 분류로 판정 |
| 큐레이션 제품 | `app/data/catalog.json` products + `products_db.json` curated | 40 | 분류로 판정 |
| 앱 솔루션 | `app/data/catalog.json` solutions (레이아웃 `sols`·시나리오가 참조) | 17 | `cat` '서비스' → service, 나머지 solution |
| 버티컬 솔루션 | `app/data/vertical_space_solution.json` solution_catalog (`s_*`·`svc_*`) | 23 | `type` service → service, 나머지 solution |
| 제품군 분류 | `app/data/vertical_space_product.json` product_taxonomy | 9그룹 | 분류(삭제하지 않고 URL·verified 갱신) |

- 제품 행의 종류: `sc`/`cat`에 서비스·케어·세척·보증 → service, 솔루션 → solution, 나머지 device.
- 같은 솔루션이 여러 곳에 있다(예: MagicINFO = 앱 `magicinfo` · 버티컬 `s_magic` · 제품 행 BW-MIP70PA). 원장에서 `aliases`로 묶고, 어느 하나라도 확인되면 그 솔루션은 확인된 것으로 본다. SKU 행이 바뀌어도 솔루션 개념은 남는다.
- 유관사례는 DSS가 아니다. 표식·삭제 대상이 아니며, 사례 페이지는 제품 `ind`·`spaces`·`kw` 색인과 솔루션 근거를 다시 만들 때만 읽는다. 사례 목록 자체의 추가·삭제는 winmate-refresh-samsung-db 범위다.

## 0. run 열기

- `RUN_AT` = 시작 시각(KST, ISO 8601 `+09:00`), `RUN_ID` = `dss-YYYYMMDD-HHMM`. 판정은 날짜가 아니라 이 시각으로 비교한다(같은 날 두 번 돌려도 구분). 보고에는 날짜로 쓴다.
- 범위는 묻지 않는다 — 이 문서 전체가 기본 범위다. 사용자가 일부(예: 제품만)를 지정하면 그 레지스트리만 표식하고, 이번에 다루지 않은 레지스트리·소스는 6단계 후보 판정에서 뺀다.
- 브랜치 `dss/<RUN_ID>`에서 작업한다. 커밋은 검증 통과 후, main 반영은 사용자 확인 후.
- 폴더: `output/dss/<RUN_ID>/`(git 제외 — 원문 스냅샷·staging DB·렌더), `proddb/reviews/<RUN_ID>/`(커밋 — 인벤토리·변경표·재검토·대체표·manifest·REPORT.md, 큰 원문은 `specs-20261020/.gitignore`처럼 제외).
- `before-manifest.json`: 바꿀 수 있는 활성 파일의 해시와 사본 — `proddb/winmate_products.sqlite`, `proddb/raw/`, `proddb/ecat/`(catalogs·corrections·photos·extract), `proddb/imglib/index.json`, `proddb/dss/ledger.json`, `app/data/`의 catalog·products_db·images·media·vertical_space_product·vertical_space_solution·product-details·spatial, `app/web/src/domain/templates/`, `app/scripts/vertical_standard/{prod,sols}.py`. 실패하면 이 세트로 되돌린다.
- 네트워크: 두 사이트가 열리는지 먼저 본다(사이트 수집은 Playwright Chromium이 samsung.com 페이지 안에서 같은 출처 API를 부른다). 막혀 있으면 멈추고 알린다. 캐시나 지난 원문으로 표식을 찍지 않는다.

## 1. 원장 — 표식의 정본

`proddb/dss/ledger.json`(커밋)이 표식의 정본이다. 없으면 첫 run에서 만든다. `proddb/build/dss_db.py`(없으면 만든다)가 원장을 SQLite `dss_item`·`dss_check` 표로 싣는다 — `build_db.py`가 DB를 새로 만들기 때문에 `photos_db.py`·`imglib_db.py`처럼 빌드 뒤에 다시 싣고, `prepare_data.py`가 runtime DB로 복사한다.

```json
{
  "version": 1,
  "runs": [{"run_id": "dss-20261112-1030", "run_at": "2026-11-12T10:30:00+09:00", "finished_at": "…",
            "sources": {"complete": 0, "partial": 0, "failed": 0},
            "counts": {"checked": 0, "new": 0, "changed": 0, "unresolved": 0, "deprecated": 0, "deleted": 0}}],
  "items": {
    "product:qm55c": {
      "kind": "device", "registry": "catalog.products", "id": "qm55c", "name": "스마트 사이니지 QM55C",
      "keys": {"gid": "G000182628", "models": ["LH55QMCEBGCXKR"], "ecat": [{"dir": "364", "page": 64}], "urls": ["…"]},
      "family": {"fam": "디스플레이", "sc": "스마트 LCD 사이니지", "cat": "스마트 LCD 사이니지", "tax": "lcd_std"},
      "first_seen": "…", "checked_at": "<RUN_AT>", "checked_run": "<RUN_ID>", "changed_at": "…", "hash": "sha256:…",
      "status": "active",
      "evidence": [{"source": "<inventory id>", "url": "…", "run": "<RUN_ID>", "sha256": "…"}],
      "aliases": [], "replaced_by": null, "deleted_at": null, "note": ""
    }
  }
}
```

- 키: `product:<id>`(제품 행·큐레이션), `solution:<id>`(앱 솔루션), `vss:<id>`(버티컬 솔루션).
- `status`: active · new · changed · unresolved · deprecated · deleted.
- 표식(`checked_at`·`checked_run`)은 이번 run의 complete 소스에서 확인될 때만 찍는다. 앱 레코드에도 같은 시각을 `checkedAt`으로 쓴다: `products_db.json` 행·curated, `catalog.json` solutions, `vertical_space_solution.json` solution_catalog, product-details `specSources[].checkedAt`. 추가 필드가 문제없는지는 9단계 테스트로 확인한다.
- 첫 run: 현재 레지스트리 전체를 `checked_at: null`로 먼저 등록한다. 이번에 확인되지 않은 것은 그대로 후보가 된다.
- 원장은 staging 사본에서 갱신하고 9단계에서 다른 파일과 함께 반영한다. 중간에 멈추면 활성 원장은 이전 표식 그대로다.
- 삭제한 항목도 원장에서 지우지 않는다(`status: deleted`, `deleted_at`, `replaced_by`, 근거). 다음 run에서 다시 나타나면 같은 id로 되살리고 보고한다.

## 2. 소스 인벤토리 — 기존 소스 전부 + 새로 생긴 것

기존 목록은 출발점일 뿐이다. 사이트 메뉴와 카탈로그 목록을 직접 다시 읽어 합집합을 `proddb/reviews/<RUN_ID>/source-inventory.json`에 만든다. 행마다 `{id, channel, kind, url|dir, prev:{count, sha256, fetched_at}, cur:{expected, received, sha256, fetched_at}, status: complete|partial|failed|moved|gone|new, error, note}`.

samsung.com/sec/business
- 제품 목록: `proddb/raw/site_lists.txt`(51) + `proddb/build/collect_site.mjs`의 `EXTRA`(솔루션 분류 등 8) → goodsList 전체, 옵션 SKU, 필터 소속, 품절 상태
- 상품별 스펙 API(getGoodsSpecList)·PDP(USP·특장점·면책·이미지·alt): `collect_site.mjs`, `app/scripts/review_product_specs.mjs`
- 솔루션 페이지: `build/media/data/sol_urls.json`, `vertical_space_solution.json`의 solution_catalog[].sources, `vertical_space_product.json`의 meta.sources·product_taxonomy url
- 업종·도입사례 페이지: `proddb/raw/v1_wkb_pages_v2.json`의 목록, `catalog.json` cases[].url (색인·근거용)
- 메뉴·푸터에서 새 분류·새 솔루션 페이지를 찾아 추가

e-카탈로그 samsung.aiibook.net/b2b
- 기존 사용 권: `proddb/ecat/catalogs.json`의 tab1·tab4·tab5·tab6 + Dir 93(`fetch_ecat_text.py`의 선택 규칙)
- 목록 페이지(`https://samsung.aiibook.net/b2b/`)를 다시 읽어 같은 탭의 새 권·빠진 권·정기 호 교체를 반영한다. 권 이름은 목록 이름만 믿지 말고 뷰어 `<title>`과 첫 쪽 내용으로 확인한다(목록 이름과 실제 권이 달랐던 예: Dir 297·203, 뷰어 제목이 '삼성전자'뿐인 예: Dir 218).
- 정기 호(예: '비즈니스 종합 26년 11-12월호')는 최신 호만 현재 근거다. 지난 호는 Dir로 직접 열려도 근거로 쓰지 않는다.
- 목록에서 빠진 비정기 권은 Dir 직접 접근으로 확인한다. 열리면 '목록 밖 유지'로 근거 인정 + 보고(예전 Dir 93처럼), "Dir does not exist"면 `gone`.

공식 보조 출처(솔루션에 이미 쓴 것만): vxt.samsung.com, samsungknox.com, 해외 samsung.com business 페이지, news.samsung.com. 외부 기사는 기능 설명 참고였을 뿐 표식 근거가 아니다.

## 3. staging 수집과 완전성 게이트

- 출력은 전부 `output/dss/<RUN_ID>/`로 간다. 활성 경로에 바로 쓰는 수집기는 첫 run에서 출력 경로를 인자로 받게 고치고 그대로 저장소에 둔다: `collect_site.mjs`(OUT이 `proddb/raw` 고정), `fetch_ecat_text.py`(기존 `text/<Dir>.json`이 있으면 건너뜀·탭 고정), `app/scripts/review_product_specs.mjs`·`collect_*.mjs`(`specs-20261020` 경로 고정).
- refresh-workflow.md의 한계를 메운다: goodsList `page=1, rows=400` → 총수까지 페이지네이션, 실패한 요청을 빈 JSON으로 남기지 않기, 권마다 `1..cataPages` 쪽별 상태 기록, 개정된 권은 쪽 이미지·PDF 캐시부터 다시 받기.
- 소스별 완전성: 기대 수(목록 총수·옵션 수·cataPages)와 받은 수가 같고 오류가 없으면 `complete`. 재시도 후에도 아니면 `partial`/`failed`. **partial/failed 소스에만 근거가 있던 DSS는 이번 run에서 판정하지 않는다(`unresolved`) — 표식도 찍지 않고 삭제 후보에도 넣지 않는다.**
- e-카탈로그 제품 추출(`proddb/ecat/BRIEF.md`): 쪽 텍스트 해시가 이전과 같은 권은 기존 `extract`를 쓴다(원문이 같으면 사실도 같다, 표식은 이번 run으로 찍는다). 새 권·바뀐 권·새 호는 다시 추출하고, 모델코드를 쪽 텍스트와 전수 대조하고, 기호가 빠진 값은 쪽 이미지로 확인해 `corrections.json`에 넣는다. 권이 많으면 하위 에이전트로 나누고, 추출하지 않은 검토자가 표본을 다시 본다.
- 소요 참고: 사이트 수집 약 15분, 카탈로그 쪽 텍스트 약 20분 + 바뀐 권 추출.

## 4. 대조와 표식

동일성 — 같은 것은 같은 id를 유지한다.
- 사이트 행: goodsId → 모델 집합. URL·분류 이동이나 대표 모델 변경은 같은 id에서 갱신한다.
- 카탈로그 전용 `ec_<Dir>_<순번>`: Dir·순번은 동일성 근거가 아니다. 모델코드 집합과 이름으로 새 권·새 호의 같은 제품을 찾아 기존 id를 유지하고 근거(dir·page)만 바꾼다. 새 제품만 겹치지 않는 새 id를 받는다. 정기 호가 바뀔 때 영향이 가장 크다 — 2026-11에는 비즈니스 종합이 Dir 360(9-10월호) → 364(11-12월호)로 바뀌어 `ec_360_*` 85개가 이 대응으로 이어져야 한다.
- 사이트 ↔ 카탈로그 대응은 `build_db.py` 규칙(정확 → 국가·색상 접미 생략 → 포함 → 와일드카드 → 이름)을 따르고, 공용 부품 코드 한두 개로 다른 제품을 합치지 않는다.
- 솔루션: 기존 URL·제품코드(BW-MIP70PA 등)·이름. 버전 이름만 바뀐 것은 같은 솔루션으로 갱신한다.

표식과 변경
- complete 소스에서 하나라도 확인되면 `checked_at = RUN_AT`, evidence 추가. 품절은 판매 중이다(목록·PDP에 있으면 표식). 페이지에 판매 종료·단종이 명시돼 있으면 표식하지 않고 6단계 후보로 보낸다.
- 사실 필드(이름·모델·옵션·분류·URL·사양·USP·특장점 제목/본문/면책·카탈로그 사양·이미지 원본 URL·솔루션 기능 목록)를 정규화한 hash가 다르면 `changed_at = RUN_AT`, `status: changed`, 필드 단위 diff를 `proddb/reviews/<RUN_ID>/changes.json`에 남긴다.
- 처음 보는 항목은 `status: new` → 5단계에서 앱에 올린다.

## 5. 메타데이터 전체 재구축 (staging)

바뀐 항목만 고치지 않는다. 확인된 모든 항목의 파생 정보를 새 원문으로 다시 만든다. 사실은 원문에서만 가져오고, 원문에 없는 수치·기능은 쓰지 않는다.

1. DB: `ECAT=<staging>/ecat python3 proddb/build/build_db.py <staging>/raw <staging>/winmate_products.sqlite`, 이어서 같은 staging DB로 `photos_db.py`·`imglib_db.py`·`dss_db.py`. `build_db.py`는 출력 DB를 먼저 지우므로 활성 DB를 출력으로 주지 않는다.
2. 앱 제품 행: `PAGES=<새 업종·사례 수집(v1_wkb_pages_v2.json과 같은 items 형식)> python3 proddb/build/export_app.py <staging DB> <staging app-export>`. 기본 `PAGES`는 2026-10-04 파일이라 그대로 두면 `ind`·`spaces`·`kw`가 옛 시점에 머문다. 결과 행(name·model·cat·sc·fam·spec·opt·models·url·spaces·ind·kw·사진 주소)을 활성 `products_db.json`과 비교해 반영한다.
3. 상세 overlay `app/data/product-details/dNN.json`: usp·feats·desc·specs·ecat·cprod·`specSources`. 기존 제품은 사양 검토 파이프라인(`review_product_specs.mjs` → `enrich_product_specs.py`, 검토 후 `--apply`)을 RUN 폴더로 다시 돌리고, 새 제품 상세는 export 결과에서 같은 형식으로 만든다.
4. 큐레이션 40: 한 줄 사양 `spec`·`spaces`·`ind`·`kw`·옵션을 그 모델의 새 원문과 대조해 고친다.
5. 솔루션·서비스: `catalog.json` solutions(name·cat·desc·kw·ind·`with`), `vertical_space_solution.json`(summary·editions·devices·기능 그룹/세부 기능·`status: planned`·sources·used_in), `vertical_space_product.json` product_taxonomy(분류 URL·verified·새 분류 — 공간 매핑은 근거가 있을 때만), `media.json` 이미지.
6. Key message — 사람이 쓴 문구를 새 원문과 다시 대조하고, 근거가 사라졌거나 대상 제품이 바뀌면 원문 기준으로 다시 쓴다. 기존 문체(짧은 제목 + 합니다체 한 문장)를 지킨다.
   - `app/scripts/vertical_standard/prod.py` `P`: 제품군 → 대표 제품 id·표시 이름·사진·특징 2개(제목, 문장)
   - `app/scripts/vertical_standard/sols.py` `SOL`·`DESC`: 솔루션 헤드라인·한 줄 요약·앱 솔루션 id 대응
   - `app/scripts/rebuild_vertical_proposals.py` `PRODUCT_LABELS`, `app/data/{vertical_proposal_briefs,account_case_briefs}.json`의 제품 언급
   - 앱이 실행 중 만드는 key message(`productKeyMsgs` — 사양·공간·연계 솔루션)는 위 데이터를 따라온다.
7. 사진·이미지: 새·바뀐 상품 카드·특장점 이미지, 바뀐 권의 카탈로그 crop(`cut_ecat_photos.py`, `ecat/PHOTO_BRIEF.md`), 이미지 라이브러리(`proddb/imglib/index.json` → `imglib_db.py` → pack). 원본 해시가 바뀐 것만 다시 가공하고 제품 대응을 확인한다. 새 사진·상세 pack은 `app/data/static`(= `reference/live` 동결본 링크)에 쓰지 않는다 — winmate-contracts.md의 app 소유 static snapshot 절차를 따르고, 그게 준비되지 않았으면 새 사진을 반영했다고 보고하지 않는다.

## 6. 이전 표식 항목 재검토

- 후보 = staging 원장에서 `checked_at < RUN_AT`(또는 null)이고 deleted가 아닌 항목. 단, 그 항목의 기존 근거 소스가 이번 run에서 모두 complete일 때만. 하나라도 partial/failed면 `unresolved`.
- 이상 신호 게이트: 후보가 한 소스에 몰리거나 DSS 종류별 전체의 5%를 넘으면 수집·대응 오류(새 호 대응 실패, 분류 이동, 파서 변경)부터 의심한다. 원인을 찾기 전에는 삭제하지 않고 멈춰서 보고한다.
- 재검토는 수집과 다른 패스로 한다(가능하면 수집하지 않은 하위 에이전트). 항목마다 실제로 열어 보고 `deprecation-review.json`에 근거를 남긴다.
  1. 기존 PDP·솔루션 URL 직접 열기 — 200 / 리디렉트(어디로) / 404 / 판매 종료 표기
  2. samsung.com 검색 API로 모델코드·제품명 검색(요청 형식은 `proddb/reviews/specs-20261020/search-template.json`)
  3. 이번 run의 e-카탈로그 전 권 쪽 텍스트에서 모델코드·이름 검색(새 권·새 호·목록 밖 권 포함)
  4. 같은 goodsId의 모델 변경, 다른 분류로 이동, 이름 변경
  5. 같은 시리즈 후속 모델 유무 → 7단계 대체 후보
- 판정: `moved`(같은 항목 — id 유지·갱신·표식) / `still_listed`(대조 누락 — 표식) / `sold_out`(판매 중 — 표식) / `deprecated`(판매 종료 확정) / `unresolved`(근거 부족 — 보존하고 다음 run에 다시 본다).
- 솔루션·서비스는 웬만하면 지우지 않는다. 메뉴에서 빠져도 공식 페이지·카탈로그·공식 보조 출처에 남아 있으면 유지하고 URL·이름만 갱신한다. 공식 종료 근거가 있을 때만 deprecated로 보고하고, 삭제 전에 근거와 영향표를 보여 사용자 확인을 받는다.
- 제품은 재검토에서 deprecated가 확정되면 7·8단계로 간다(이 skill을 실행한 것이 그 승인이다). 근거가 애매하면 지우지 않고 unresolved로 둔다. 사람 없이 돌고 있을 때는 더 그렇다.

## 7. 삭제와 대체 제품

대체 제품 선정 — 삭제 제품마다 하나, `replacements.json`에 이유와 함께 남긴다.
1. 같은 시리즈 후속 모델 — 같은 goodsId의 새 모델, 모델·이름 계열(예: QMC → 다음 세대 QM 시리즈)
2. 같은 세부 분류 `sc`(+ 같은 product_taxonomy 분류 id)
3. 같은 `cat`
4. 같은 제품군 `fam`에서 장표 역할이 같은 것
- 조건: 이번 run에 표식된 항목, 제품 사진 있음(없으면 같은 순위의 다음 후보). 같은 순위에서는 장표가 말하는 역할(크기·밝기·실내외·용량·공간)에 사양이 가장 가까운 것, 큐레이션·사이트 행, 장표의 솔루션과 연동되는 것(solutions `with`)을 먼저. 앱의 대안 순서(같은 세부 분류 > 같은 분류 > 같은 제품군)와 같다.
- 큐레이션 id는 다른 모델에 재사용하지 않는다. 큐레이션 제품이 삭제되면 대체 모델로 새 큐레이션 항목(새 id·spec·spaces·ind·kw·img, images.json 제품 컷)을 만들고 참조를 옮긴다.

삭제 (staging)
- `products_db.json` 행·curated, `catalog.json` products, product-details 항목, solutions `with`, images.json 제품 컷(다른 곳에서 안 쓰면), 이미지 라이브러리 연결(`lib_image_product`), `product_photo`, 조감도 `app/data/spatial/{product-objects,product-evidence,library}.json`의 productId(형상 치수가 다르면 대체 제품에 맞춤), `prod.py` 대표 제품.
- 원장은 `status: deleted`·`deleted_at`·`replaced_by`·근거로 남긴다.
- `deletion-impact.md`: 항목·근거·대체 제품·참조 위치 수·처리(refresh-workflow.md의 삭제 후보 필수 열 포함).
- 사용자 저장 문서(브라우저의 제안서·찜·My 템플릿·백업)는 삭제 id를 계속 가질 수 있다. 사용자가 쓴 글은 바꾸지 않는다. 연결 id(`ctx.products` 등)를 `replaced_by`로 옮겨야 하면 레이아웃 이관과 같은 방식(`app/web/src/domain/templates/migrate_removed_layouts.js`·`removed_layout_migrations.json`, 불러올 때 `app/web/src/repositories/proposals.js`)으로 load-time 이관을 더한다. 최소한 없는 id가 화면·PPTX를 깨뜨리지 않는지 확인한다.

## 8. PPT 레이아웃·시나리오 개선

삭제된 항목, 그리고 이름·모델·수치가 바뀐 항목이 대상이다.

1. 참조 찾기 — 항목마다 앱 id·goodsId·모든 모델코드·짧은 모델명(QM55C 등)·제품명·사진 pid(images.json `model`)·제품 사진 pack 주소로 저장소를 검색한다. `reference/`·`docs/`·`output/`과 `poc/test`의 결과 기록은 제외하고, `layouts.b64`는 풀어서 본다. 알려진 위치:
   - 레이아웃: `app/data/catalog.json` layouts(`prods`·`sols`·`txt`·`hl`·`sub`·`sample`) + `app/data/layouts.b64`(gzip+base64 HTML), `app/web/src/domain/templates/{photo_layouts,std_layouts,vertical_std_layouts,account_layouts,spatial-layouts}.js`
   - 샘플 버티컬 시나리오: `scenarios.js`·`scenario_fills.js`·`scenario_story.js`(bs01~bs20), `vertical_scenarios.json`(bs_v_*), `standard_vertical_scenarios.json`(bs_std_* 44, 생성물), `account_scenarios.json` — story `ctx.products/solutions`, fills의 글·사진
   - 생성기 입력: `app/scripts/vertical_standard/{prod,sols}.py`, `rebuild_vertical_proposals.py`, `rebuild_account_scenarios.py`, `proposal_content.py`, `app/data/*_briefs.json`
   - 사진: `app/data/images.json`, `templates/{proposal_photo_assets,account_photo_assets}.json`, `img/prod/*.json#k` 주소
   - 조감도: `app/data/spatial/*`
   - `poc/test`의 평가 데이터는 지난 기록이라 고치지 않고 보고만 한다.
2. 고치기
   - 생성 파일은 손으로 고치지 않는다. 입력(`prod.py` 등)을 고친 뒤 생성기를 다시 돌린다: `python3 app/scripts/vertical_standard/build.py`(표준 제안서 44, 결정적), 3D 제품이 바뀌면 조감도(그 폴더 README 순서), 필요하면 `rebuild_vertical_proposals.py`·`rebuild_account_scenarios.py`.
   - 손으로 만든 장은 모델명·사양 글자·제품 사진·`prods` 메타를 대체 제품으로 함께 바꾼다. 문장이 옛 제품 고유의 기능·수치를 말하면 대체 제품 원문으로 다시 쓰고, 원문에 없는 주장은 뺀다. 바뀐 항목은 새 이름·모델·수치로 고친다.
   - `f`·`data-tb`·`data-img`·칸 번호는 그대로 둔다(저장 문서 overrides 호환). 이 작업으로 레이아웃을 새로 만들거나 retired로 돌리지 않는다.
   - 솔루션이 정말 삭제되면 같은 분류의 솔루션(예: 사이니지 CMS끼리)으로 같은 원칙을 따른다.
3. 확인: 바꾼 장을 1280×720으로 렌더해 넘침·잘림·빈 사진·엉뚱한 제품 사진이 없는지 본다. `layout-fixes.json`(장·칸·전/후)을 남긴다.

## 9. 반영과 검증

- 반영 순서: proddb(raw·ecat·sqlite·imglib·원장) → `app/data` JSON·overlay·pack → 레이아웃·시나리오 → `app/.venv/bin/python -B app/scripts/prepare_data.py --force` → `node app/scripts/export_agent_data.mjs`.
- 건수 계약: 제품 수가 바뀌면 `prepare_data.py`(1,068 assert)·`export_agent_data.mjs`(expect-products·curated)·`app/api/poc/knowledge.py` EXPECTED·`app/tests/strict_contracts.py` 등 고정 건수를 변경표 건수로 함께 고친다. `--allow-count-drift`로 넘기지 않는다.
- 검사: `npm --prefix app/web run build`, `app/.venv/bin/python -B app/scripts/preflight.py --deep`, `make test`, `node app/tests/functional-contracts.mjs catalog pptx repository`, `node app/tests/layout-usage.mjs`, 바꾼 장 렌더.
- 원장 검사: unresolved를 뺀 active 항목은 모두 `checked_at == RUN_AT` · 삭제 항목이 앱 레지스트리·레이아웃·시나리오에 남아 있지 않음 · 모든 `replaced_by`가 active · 앱 레코드의 `checkedAt`이 원장과 같음.
- 실패하면 before-manifest 세트로 되돌린다. 변경 전부터 실패하던 검사는 따로 적는다.

## 10. 보고

`proddb/reviews/<RUN_ID>/REPORT.md`와 대화 요약에 다음을 남긴다.
- RUN_ID·RUN_AT, 소스별 완전성(complete/partial/failed, 새 권·빠진 권·새 호)
- device·solution·service별 표식 수와 new·changed·moved·unresolved·deprecated·deleted 건수
- 삭제 표(근거·대체 제품·고친 장 수), 다시 쓴 key message, 고친 레이아웃·시나리오
- 남은 unresolved와 다음 run에서 볼 것, 실행한 검사와 결과

원장과 변경 파일을 커밋하고, main 반영은 사용자 확인 후에 한다. 다음 run은 이 원장의 `checked_at`을 기준으로 시작한다.

## 하지 말 것

- 캐시·지난 원문으로 표식 찍기, 수집 실패·빈 응답을 판매 종료로 읽기
- `ec_*` id를 Dir·순번으로 다시 매기기, 큐레이션 id를 다른 모델에 재사용하기
- 원문에 없는 수치·기능을 key message나 장표에 쓰기
- `app/data/static`(동결본) 아래에 쓰기, 생성 파일을 손으로 고치기
- 근거와 사용자 확인 없이 솔루션·서비스 지우기
