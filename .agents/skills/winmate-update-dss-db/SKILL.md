---
name: winmate-update-dss-db
description: Winmate DSS(제품·솔루션·서비스·구독) DB를 samsung.com/business·e-카탈로그의 기존 소스 전부로 다시 받아 현재 DB와의 차이를 갱신하고, DSS별 확인 시점 표식·판매 종료 재검토와 바뀐 항목의 연관 자료(레이아웃·3D 오브젝트·구독 장 등) 갱신까지 할 때 사용한다.
---

# Winmate DSS DB 업데이트

DSS는 Device(제품) · Solution(솔루션) · Service(서비스) · Subscription(구독 — B2B 삼성 AI 구독)이다. 이 skill 한 번 실행이 하나의 확인 회차(run)이며, 다음을 한 세트로 끝낸다.

1. samsung.com/sec/business와 e-카탈로그(samsung.aiibook.net/b2b)에서 **기존에 쓴 소스 전부**(+ 같은 채널에 새로 생긴 것)를 다시 받아 **현재 DB와의 차이**를 찾는다 — 새 항목 · 바뀐 항목 · 사라진 항목.
2. 이번 원문에서 확인된 DSS마다 실행 시점(`RUN_AT`)을 표식한다. 바뀐 게 없어도 찍는다.
3. 차이가 난 항목만 DB를 갱신하고, 그 항목의 **연관 자료를 전부** 갱신한다 — 제품 행 · 상세 · 사진, 솔루션 레지스트리, PPT 레이아웃 템플릿, 3D 오브젝트(공간 조감도), 이미지 연결, 에이전트 KB. 바뀌지 않은 항목은 표식만 한다.
4. 표식이 이전 시점에 머문 항목은 판매 종료(deprecated) 후보다. 다시 검토해 확정되면 **지우지 않고 판매 종료로 표시**한다 — 새로 고르는 곳에서만 빠지고, 레이아웃 템플릿 · 3D 오브젝트의 예시는 같은 제품군의 다른 제품으로 바꾼다.
5. **기존 제안서 · 샘플 시나리오 · 히스토리는 바꾸지 않는다.** 대신 판매 종료 제품이 든 제안서를 PPT로 내보낼 때만 앱이 한 번 더 확인한다.

저장소는 `minsub0922/winmate_poc_v2`, 경로는 저장소 루트 기준이다. 시작 전에 `.agents/references/winmate-contracts.md`, `.agents/skills/winmate-refresh-samsung-db/`(SKILL.md, `references/refresh-workflow.md`의 '기존 크롤러가 보장하지 않는 것' · 삭제 후보 필수 열 · 빌드 순서), `proddb/README.md`, `proddb/build/dss/README.md`(도구 · 실행 순서), 지난 run의 `proddb/reviews/dss-*/REPORT.md`(남은 unresolved)를 읽는다. 저장소 안의 `.agents/skills/winmate-update-dss-db/SKILL.md`가 이 문서보다 새로우면 그것을 따른다. 실행할 때는 코드·데이터의 실제 상태가 이 문서의 경로·건수보다 우선한다.

## 대상 레지스트리

| 레지스트리 | 위치 | DSS 종류 |
|---|---|---|
| 제품 DB 행 | `app/data/products_db.json` products(사이트 `sg_<goodsId>`, 카탈로그 전용 `ec_<Dir>_<순번>`), `proddb/winmate_products.sqlite` | 분류로 판정 |
| 큐레이션 제품 | `app/data/catalog.json` products + `products_db.json` curated | 분류로 판정 |
| 앱 솔루션 | `app/data/catalog.json` solutions (레이아웃 `sols`·시나리오가 참조) | `cat` '서비스' → service, 나머지 solution |
| 버티컬 솔루션 | `app/data/vertical_space_solution.json` solution_catalog (`s_*`·`svc_*`) | `type` service → service, 나머지 solution |
| 제품군 분류 | `app/data/vertical_space_product.json` product_taxonomy | 분류(지우지 않고 URL·verified 갱신) |
| 구독 | `app/data/subscriptions.json`(정본 입력 `proddb/subs/*.json` → `proddb/build/subs/build.py`), SQLite `subscription*` 표 | subscription — program · care · care-option · package · promotion · payment |

- 제품 행의 종류(`proddb/build/dss/subs_ledger.py` `kind_of`): `sc`/`cat`에 서비스·케어·세척(식기세척기 · 세척기는 제외)·보증 → service, '솔루션 · 서비스'처럼 둘 다 적힌 분류는 이름에 케어·세척·보증·유지보수가 없으면 solution, 솔루션 → solution, 나머지 device. 구독은 제품 행이 아니라 구독 레지스트리 항목이다(8-S).
- 같은 솔루션이 여러 곳에 있다(예: MagicINFO = 앱 `magicinfo` · 버티컬 `s_magic` · 제품 행 BW-MIP70PA). 원장에서 `aliases`로 묶고(`app/scripts/vertical_standard/sols.py` SOL 대응), 어느 하나라도 확인되면 그 솔루션은 확인된 것으로 본다. SKU 행이 바뀌어도 솔루션 개념은 남는다.
- 유관사례는 DSS가 아니다. 표식 대상이 아니며, 사례 페이지는 제품 `ind`·`spaces`·`kw` 색인과 솔루션 근거에만 쓴다. 사례 목록 자체의 추가·삭제는 winmate-refresh-samsung-db 범위다.

## 바꾸는 것 · 바꾸지 않는 것

| 바꾼다 (바뀐 · 새 · 판매 종료 항목에 한해) | 바꾸지 않는다 |
|---|---|
| `proddb/`(raw · ecat · sqlite · imglib · 원장) | 사용자 저장 문서(브라우저의 제안서 · 찜 · My 템플릿 · 백업) |
| `app/data/` products_db · product-details · catalog(products · solutions) · images · media · vertical_space_* | 샘플 시나리오: `app/web/src/domain/templates/`의 scenarios · scenario_fills · scenario_story · vertical_scenarios · standard_vertical_scenarios · account_scenarios |
| PPT 레이아웃 템플릿: `catalog.json` layouts(`prods`·`sols`·글) · `layouts.b64` · templates의 `*_layouts.js` · `spatial-layouts.js` | 히스토리 · 목차 템플릿: `sample-history.js` · `prior_proposal_revisions.json` · 목차 템플릿 덱 |
| 3D 오브젝트: `app/data/spatial/product-objects.json`(`build_spatial_products.py`) · `product-evidence.json` · `library.json` · 썸네일 | 시나리오 생성기 입력: `app/scripts/vertical_standard/{prod,sols}.py` · `rebuild_*.py` · `app/data/*_briefs.json` |
| 에이전트 KB(`export_agent_data.mjs`) · runtime projection(`prepare_data.py`) | `reference/live`(= `app/data/static`, 동결본) · 도입사례 원문(catalog.json cases) |
| 구독: `proddb/subs/*.json` · `proddb/raw/subs` · `app/data/subscriptions.json` · `app/web/public/assets/subs` · 구독 장 `subs_layouts.js`(L_SUB_*) · `toc_content.json`(v.sub · subs) · 구독 샘플 `subscription_scenarios.json`(이 skill의 생성물이라 다시 만든다) | 히스토리에 저장된 구독 샘플 사본 · 구독이 아닌 샘플 시나리오 |

바꾸지 않는 쪽에 판매 종료 제품이 들어 있으면 고치지 말고 보고에 위치만 적는다 — 내보낼 때 앱이 확인한다(7단계).

## 0. run 열기

- `RUN_AT` = 시작 시각(KST, ISO 8601 `+09:00`), `RUN_ID` = `dss-YYYYMMDD-HHMM`. 판정은 날짜가 아니라 이 시각으로 비교한다(같은 날 두 번 돌려도 구분). 보고에는 날짜로 쓴다.
- 범위는 묻지 않는다 — 이 문서 전체가 기본 범위다. 사용자가 일부(예: 제품만)를 지정하면 그 레지스트리만 표식하고, 다루지 않은 레지스트리·소스는 6단계 후보 판정에서 뺀다.
- 폴더: `output/dss/<RUN_ID>/`(git 제외 — 원문 스냅샷·staging DB·렌더), `proddb/reviews/<RUN_ID>/`(커밋 — run.json · 인벤토리 · 변경표 · 재검토 · 대체표 · 추출 판정 · 사양 원장 · manifest · REPORT.md).
- `before-manifest.json`: 바꿀 수 있는 활성 파일의 해시와 기준 커밋. 실패하면 그 커밋에서 같은 세트를 되돌린다.
- 네트워크: 두 사이트가 열리는지 먼저 본다(사이트 수집은 Playwright Chromium이 samsung.com 페이지 안에서 같은 출처 API를 부른다). 막혀 있으면 멈추고 알린다. 캐시나 지난 원문으로 표식을 찍지 않는다.

## 1. 원장 — 표식의 정본

`proddb/dss/ledger.json`(커밋)이 표식의 정본이다(첫 run: dss-20261112-1445). `proddb/build/dss/ledger.py`가 staging에서 만들고, `proddb/build/dss_db.py`가 SQLite `dss_item`·`dss_check`·`dss_run` 표로 싣는다(`build_db.py`가 빌드 끝에 부르고, `prepare_data.py`가 runtime DB로 복사한다).

```json
{
  "version": 1,
  "runs": [{"run_id": "dss-20261112-1445", "run_at": "2026-11-12T14:45:05+09:00", "finished_at": "…",
            "sources": {"complete": 0, "partial": 0, "failed": 0, "gone": 0},
            "counts": {"checked": 0, "new": 0, "changed": 0, "unresolved": 0, "deprecated": 0, "deleted": 0, "by_kind": {}}}],
  "items": {
    "product:qm55c": {
      "kind": "device", "registry": "catalog.products", "id": "qm55c", "name": "스마트 사이니지 QM55C",
      "keys": {"gid": "G000182628", "models": ["LH55QMCEBGCXKR"], "ecat": [{"dir": "364", "page": 64}], "urls": ["…"]},
      "family": {"fam": "디스플레이", "sc": "스마트 LCD 사이니지", "cat": "스마트 LCD 사이니지"},
      "first_seen": "…", "checked_at": "<RUN_AT>", "checked_run": "<RUN_ID>", "changed_at": "…", "hash": "sha256:…",
      "status": "active",
      "evidence": [{"source": "site", "url": "…", "goods": "G000182628", "run": "<RUN_ID>"}],
      "aliases": [], "replaced_by": null, "deleted_at": null, "note": ""
    }
  }
}
```

- 항목 키: `product:<id>`(제품 행·큐레이션), `solution:<id>`(앱 솔루션), `vss:<id>`(버티컬 솔루션), `subscription:<id>`(구독 레지스트리 항목, kind subscription). `status`: active · new · changed · unresolved · deprecated, 구독은 + inferred(추론 결제안 — 표식 대상 아님) · expired(혜택 기간 끝남).
- `runs[].scope`: 전체 run은 없음, 구독만 본 run은 `["subscriptions"]`(`proddb/build/subs/ledger_run.py` — 제품 · 솔루션 표식은 그대로, 종류 판정 규칙이 바뀐 행만 `reclassified`로 남긴다). SQLite `dss_run.scope_json`.
- 표식은 이번 run의 complete 소스에서 확인될 때만 찍는다. 앱 레코드에도 같은 시각을 `checkedAt`으로 쓴다(products_db 행 · curated, catalog solutions, vertical_space_solution solution_catalog), 상세 사양 출처는 다시 확인한 것만 `specSources[].checkedAt`.
- 지난 run과 사실 해시가 같으면 changed가 아니다(같은 run을 다시 돌릴 때는 비교하지 않는다).
- 원장은 staging에서 갱신하고 반영 때 함께 커밋한다. 중간에 멈추면 활성 원장은 이전 표식 그대로다. 판매 종료 항목도 원장에 남는다. 다음 run에서 다시 나타나면 판매 종료 표시를 풀고 보고한다.

## 2. 소스 인벤토리 — 기존 소스 전부 + 새로 생긴 것

기존 목록은 출발점일 뿐이다. 사이트 메뉴와 카탈로그 목록을 직접 다시 읽어 합집합을 `proddb/reviews/<RUN_ID>/source-inventory.json`에 만든다(`proddb/build/dss/inventory.py`). 행마다 `{id, channel, kind, url|dir, prev, cur, status: complete|partial|failed|moved|gone|new|same|changed, note}`.

samsung.com/sec/business
- 제품 목록: `proddb/raw/site_lists.txt` + `collect_site.mjs`의 `EXTRA` → goodsList 전체, 옵션 SKU, 필터 소속, 품절 상태, 스펙 API, PDP(USP·특장점·면책·이미지).
- 솔루션 · 분류 페이지: `build/media/data/sol_urls.json`, `vertical_space_solution.json` solution_catalog[].sources, `vertical_space_product.json` meta.sources · product_taxonomy url.
- 업종·도입사례 페이지: `proddb/raw/v1_wkb_pages_v2.json`의 목록(색인용). 다시 받지 않으면 `ind`·`spaces`·`kw` 색인은 그 시점에 머물고, 보고에 적는다.
- 메뉴·푸터에서 새 분류·새 솔루션 페이지를 찾아 추가한다.
- 구독: `proddb/subs/sources.json`(구독 메인 `/sec/business/b2b-ai-subs/` · 혜택 이벤트 `/sec/business/event/b2b-ai-subs-festival/` · 뉴스룸 공식 기사) + 홈 GNB의 '구독' 링크(`proddb/build/subs/collect.py`가 찾음 — 처음 보는 링크는 `new`, sources.json에 넣고 사실을 다시 읽는다). 패키지 모델코드는 samsung.com 검색 API로 확인한다.

e-카탈로그 samsung.aiibook.net/b2b
- 목록 페이지(`https://samsung.aiibook.net/b2b/`)의 탭: tab1 비즈니스 종합 · tab4 B2B 품목 · tab5 제품 가이드 · tab6 업종별 제안 + 목록 밖 Dir 93을 쓴다(tab2 조달 · tab3 B2C는 범위 밖, Dir 263 SAC 설치 가이드북은 제품 카탈로그가 아니라 제외). tab1 · tab2 · tab3 · tab5는 `<h2 class="title">` 아래 `ul.booklist`, tab4는 제목 없이 목록, tab6은 `li` 안의 `h2.item-title` — 탭마다 다르게 읽는다.
- 정기 호(예: '비즈니스 종합 26년 11-12월호')는 최신 호만 현재 근거다. 지난 호는 Dir로 직접 열려도 근거로 쓰지 않는다. 목록에서 빠진 비정기 권은 Dir 직접 접근으로 확인하고, 열리면 '목록 밖 유지'(예전 Dir 93처럼), "Dir does not exist"면 `gone`.
- 권 이름은 목록 이름만 믿지 말고 뷰어 `<title>`과 첫 쪽 내용으로 확인한다(목록 이름과 실제 권이 달랐던 예: Dir 297·203, 뷰어 제목이 '삼성전자'뿐인 예: Dir 218).

공식 보조 출처(솔루션에 이미 쓴 것만): vxt.samsung.com, samsungknox.com, 해외 samsung.com business, news.samsung.com. 외부 기사는 표식 근거가 아니다.

## 3. staging 수집과 완전성 게이트

- 사이트: `CHROME=<chrome> OUT_DIR=output/dss/<RUN_ID>/raw SITE_LISTS=proddb/raw/site_lists.txt PREV_RAW=proddb/raw/wkb_products.json node proddb/build/collect_site.mjs` — 목록 전 페이지를 받고(`allPages`), 목록 페이지 HTML에서 분류 번호가 사라져도 지난 수집의 번호로 목록 API를 확인한다(`noFrom: previous`). 받은 수 ≠ 목록 총수면 `errors.json`에 `list-count`.
- 카탈로그: `ECAT_OUT=output/dss/<RUN_ID>/ecat ECAT_LIST=<이번 run의 권 목록> python3 proddb/build/fetch_ecat_text.py` — 쪽마다 받고 빠진 쪽은 `missing`에 남긴다. 지난 수집에도 없던 쪽은 이미지 전용 쪽이고, 새로 빠진 쪽만 다시 받는다.
- 솔루션 · 분류 페이지: `proddb/build/dss/fetch_solutions.py` — 상태 · 최종 URL · 제목 · og 이미지 · 본문 해시(비 ASCII URL은 퍼센트 인코딩).
- 구독: `python3 proddb/build/subs/collect.py output/dss/<RUN_ID>/subs/raw` — 본문 텍스트 · 해시, 콘텐츠 이미지 sha256, 모델 검색(1분 안팎). 소스마다 complete · partial · failed · moved · new.
- 소스별 완전성: 기대 수와 받은 수가 같고 오류가 없으면 `complete`. **partial/failed 소스에만 근거가 있던 DSS는 이번 run에서 판정하지 않는다(`unresolved`) — 표식도 찍지 않고 판매 종료 후보에도 넣지 않는다.**
- 소요 참고: 사이트 약 15분, 카탈로그 쪽 텍스트 약 20~30분 + 바뀐 권 추출.
- 수집 · 비교 · 반영 도구와 실행 순서는 `proddb/build/dss/README.md`. run 설정은 `proddb/reviews/<RUN_ID>/run.json`(run_id · run_at · alias · superseded · new_pack · URL 이동).

## 4. 차이 찾기와 표식

동일성 — 같은 것은 같은 id를 유지한다.
- 사이트 행: goodsId → 모델 집합. goodsId가 바뀌어도 모델 집합이 같으면 같은 항목(`moved`)으로 보고 기존 id에서 gid · URL만 갱신한다.
- 카탈로그 전용 `ec_<Dir>_<순번>`: Dir·순번은 동일성 근거가 아니다. 모델코드 집합과 이름으로 새 권·새 호의 같은 제품을 찾아 기존 id를 유지하고 근거(dir·page)만 바꾼다(`remap_issue.py` — 쪽 대응 + 모델코드 위치). 새 제품만 겹치지 않는 새 id를 받는다. 정기 호가 바뀔 때(예: 비즈니스 종합 Dir 360 → 364) 영향이 가장 크다. 토큰 비교만 믿지 말고 바뀐 쪽은 단어 차이로 직접 본다(예: `SM-X946N` 같은 갤럭시 코드는 일반 모델코드 정규식에 안 걸린다).
- 사이트 ↔ 카탈로그 대응은 `build_db.py` 규칙(정확 → 국가·색상 접미 생략 → 포함 → 와일드카드 → 이름)을 따르고, 공용 부품 코드 한두 개로 다른 제품을 합치지 않는다.
- 솔루션: 기존 URL·제품코드·이름. 버전 이름만 바뀐 것은 같은 솔루션으로 갱신한다.

표식과 변경
- complete 소스에서 하나라도 확인되면 `checked_at = RUN_AT`, evidence 추가. 품절은 판매 중이다. 페이지에 판매 종료·단종이 명시돼 있으면 표식하지 않고 6단계 후보로 보낸다.
- 사실 필드(이름·모델·옵션·분류·URL·사양·USP·특장점·카탈로그 사양·이미지 원본 URL·솔루션 기능 목록)를 정규화해 비교하고, 다르면 `changed_at = RUN_AT`, `status: changed`, 필드 단위 diff를 `proddb/reviews/<RUN_ID>/changes.json`에 남긴다. 표시 순서 · 수집 시각만 다른 것은 변경이 아니다.
- 처음 보는 항목은 `status: new`.
- 구독: `build.py`가 `facts.json`의 사실마다 원문 문장(`text`)을 이번 본문에서 찾고 이미지는 해시로 대조한다. 못 찾으면 레지스트리 `issues` + 그 항목 `needs-review`(원장 `unresolved`) — 새 원문을 읽고 `facts.json`을 고친 뒤 다시 만든다. 사실 해시가 바뀌면 원장 `changed`, 레지스트리에서 빠진 항목은 지우지 않고 `deprecated`.

## 5. 차이 반영 (staging → 활성)

1. 원문: 이번 run의 raw · ecat text · extract를 `proddb/raw` · `proddb/ecat`에 반영하고 `build_db.py`(사진 · 이미지 라이브러리 · 원장 `dss_db.py`까지 싣는다)로 원본 DB를 다시 만든다(출력은 staging DB, 검증 뒤 교체 — `build_db.py`는 출력 DB를 먼저 지우므로 활성 DB를 출력으로 주지 않는다). 검토 사양 표 `product_spec_review`는 최종 상세와 같게 다시 싣는다. 카탈로그 추출은 바뀐 권 · 새 권 · 새 호만 `proddb/ecat/BRIEF.md` 규칙으로 하고, 모델코드는 쪽 텍스트와 전수 대조하고, 기호가 빠진 값은 쪽 이미지로 확인한다. 사람이 쪽 텍스트 · 이미지로 확인한 판정(id 유지 · 근거 이동 · 값 수정 · 새 항목 · 뺄 항목)은 `extract-decisions.json`에 남기고 `apply_extract_decisions.py`로 적용한다.
   - 다른 권에 이미 뽑은 같은 제품(예: 297의 콜드체인 · 쇼케이스)은 새 권에서 항목을 또 만들지 않는다 — 원장 evidence에 쪽만 더한다. 새 항목이 사이트 카드와 이름만으로 엉뚱하게 대응하지 않는지(모델코드가 없을 때의 이름 대응) 확인한다.
   - 권이 사라져 근거만 다른 권으로 옮긴 항목은 추출 id(`ec<Dir>_…`)의 Dir로 묶음을 판정하므로(`export_app.py` `src_dir`) 예전 묶음과 앱 행 id가 그대로 유지된다. 앱 행이 없던 항목(사이트 카드 대응 · 다른 항목과 묶임)은 뺀다.
2. 앱 제품 행 · 상세 — 3-way 반영(`apply_run.py`): 지난 원문으로 다시 만든 export(base)가 활성 앱 데이터와 같은지 먼저 확인하고, base → 이번 원문 export(new)에서 **바뀐 필드만** 활성 행 · 상세 overlay에 적용한다 — export 뒤에 붙은 사진 pack · 검토 사양 · 수동 수정은 그대로 남는다. 새 항목은 행 · 상세(검토 사양 형식: specProductId · specSources · specReviewStatus)를 추가하고 상세 pack 번호(`d`)를 정한다. 같은 제품이 다른 id로 다시 생기면(alias) 기존 id 행에 합친다.
3. 검토 사양(`product-details` specs · spec*): 공식 사양 API(official-api) 출처는 지난 원문과 이번 원문의 사양 행을 비교해 같으면 `checkedAt`만, 다르면 출처가 하나일 때 새 행으로 바꾸고, 출처가 여럿이면 바꾸지 않고 `specs-need-review`로 남긴다. e-카탈로그 출처(catalog · official-page-extract)는 새 권 · 새 쪽에서 원문을 다시 찾아 주소를 옮긴다. 다시 확인한 출처에만 `checkedAt`을 새로 찍는다(해외 · 제조사 페이지처럼 이번 run에 받지 않은 출처는 그대로). 사양 원장은 `proddb/reviews/<RUN_ID>/product-review.json`, `products_db.json` `specReview`가 그 위치 · 건수를 가리킨다.
   - 변경표에서 e-카탈로그 근거(권 · 쪽)만 옮겨진 것은 '근거 이동'으로, 제품 사실(이름 · 모델 · 옵션 · 사양 · 특장점)이 바뀐 것만 `changed`로 센다.
4. 솔루션 · 서비스 · 분류(`apply_solutions.py`): `catalog.json` solutions, `vertical_space_solution.json`, `vertical_space_product.json` product_taxonomy(죽은 분류 URL은 이번 수집이 쓴 목록 주소 + 공식 필터로 고치고 `verified`, 손으로 맞춘 줄 형식이라 그 줄만 고친다), `media.json`.
5. 사진: 새 · 바뀐 항목의 사진만 가공한다. 새 사진 pack은 `app/data/static`(동결본)에 쓰지 않는다. 새 사이트 행의 카드 사진은 app 소유 static `app/web/public/assets/products/<id>-{t,0,1,2}.webp`(`/assets/products/…`, 행의 `th` · `gal`이 그대로 주소)로 올린다(`fetch_new_photos.py`). 카탈로그 전용 새 행은 사진 없이 올리고 보고한다.
6. 사실은 원문에서만 가져온다. 원문에 없는 수치·기능은 쓰지 않는다.

## 6. 판매 종료 후보 재검토

- 후보 = staging 원장에서 `checked_at < RUN_AT`(또는 null)이고 판매 종료가 아닌 항목. 그 항목의 기존 근거 소스가 이번 run에서 모두 complete일 때만 — 하나라도 partial/failed면 `unresolved`.
- 이상 신호 게이트: 후보가 한 소스에 몰리거나 DSS 종류별 전체의 5%를 넘으면 수집·대응 오류(새 호 대응 실패, 분류 이동, 파서 변경)부터 의심하고, 원인을 찾기 전에는 판매 종료로 표시하지 않는다.
- 재검토는 수집과 다른 패스로 한다. 항목마다 실제로 열어 `deprecation-review.json`에 근거를 남긴다(`review_candidates.py`): ① 기존 PDP·솔루션 URL 직접 열기(200 · 리디렉트 · 404 · 판매 종료 표기 · 제목만 'Samsung Business 대한민국'인 빈 페이지) ② samsung.com 검색 API로 모델코드 검색(요청 형식 `proddb/reviews/specs-20261020/search-template.json`, /sec/business/ 결과와 일반 소비자몰 결과를 구분) ③ 이번 run의 e-카탈로그 전 권 쪽 텍스트에서 모델코드·이름 검색(새 권·새 호·목록 밖 권 포함) ④ 같은 goodsId의 모델 변경 · 분류 이동 · 이름 변경 ⑤ 같은 시리즈 후속 모델.
- 판정: `moved`(같은 항목 — 갱신 · 표식) / `still_listed`(대조 누락 — 표식) / `sold_out`(판매 중 — 표식) / `deprecated`(판매 종료 확정) / `unresolved`(근거 부족 — 그대로 두고 다음 run에 다시 본다). 근거가 애매하면 판매 종료로 표시하지 않는다.
- 솔루션·서비스는 웬만하면 판매 종료로 보지 않는다. 메뉴에서 빠져도 공식 페이지·카탈로그·공식 보조 출처에 남아 있으면 유지하고 URL·이름만 갱신한다. 공식 종료 근거가 있을 때만 보고하고 사용자 확인을 받는다.

## 7. 판매 종료 처리 — 지우지 않고 표시

- 표시: 제품 행(`products_db.json` 행 · curated, `catalog.json` products)에 `deprecated: { at: RUN_AT, run: RUN_ID, replacedBy, reason }`. 원장 `status: deprecated`. 사이트에서만 빠지고 일반 소비자몰에 남은 경우도 B2B 채널 기준으로 판매 종료이며, reason에 그 사실을 적는다.
- 판매 종료가 아닌 사라짐은 따로 표시한다: 사이트 목록에서만 빠지고 e-카탈로그에 남은 사이트 행은 `siteListed: false`(+ `url` 비움 · `cdir`/`cpage`로 카탈로그 근거, 판매 중), 같은 제품의 사이트 행이 새로 생겨 대신하는 카탈로그 행은 `supersededBy: [사이트 행 id]`(id 유지 · 새로 고르는 목록에서만 뺌). 둘 다 내보내기 확인 대상이 아니다.
- 앱 동작(구현됨): 새로 고르는 목록은 `ACTIVE_PRODUCTS`만 쓴다 — 탐색기 · @태그 · 추천 · 교체(`services/catalog.js`, `ctxexplorer.jsx`, `services/search.js`). 3D 오브젝트는 `catalogVisible: false`로 공간 조감도 제품 선택에서 빠진다(`build_spatial_products.py`). 데이터는 남아 기존 제안서 · 샘플 시나리오 · 히스토리 · 공간 장면은 그대로 그려진다. `prepare_data.py`는 판매 종료 · `siteListed: false` 행의 goodsId가 새 원본 DB에 없어도 통과시킨다. `ACTIVE_PRODUCTS`는 `supersededBy` 행도 뺀다.
- 내보내기 확인(구현됨): `app/web/src/domain/products/deprecation.js` `deprecatedInDeck` — 연결 제품 · 장의 글(바꾼 칸은 바꾼 값) · 사진에서 판매 종료 제품을 찾아, 제안서 PPTX 내보내기(`viewer.jsx` ExportModal)는 목록과 대체 제품을 보여 주고 '확인했어요'를 체크해야 내보낸다. 샘플 시나리오 · 목차 템플릿 받기도 같은 확인을 띄운다.
- 대체 제품(판매 종료 제품마다 하나, `replacements.json`에 이유와 함께): ① 같은 시리즈 후속 모델(예: 뷰피니티 S70D → S70H) ② 같은 세부 분류 `sc` ③ 같은 `cat` ④ 같은 제품군 `fam`에서 역할이 같은 것. 이번 run에 표식된 항목 · 사진 있음 · 사양이 장표 역할(크기·밝기·실내외·용량·공간)에 가까운 것 · 큐레이션 · 사이트 행 · 장표의 솔루션과 연동되는 것(solutions `with`) 우선. 큐레이션 id는 다른 모델에 재사용하지 않는다(대체가 필요하면 새 큐레이션 항목).

## 8. 연관 자료 갱신

바뀐 · 새 · 판매 종료 항목마다 참조를 찾는다 — 앱 id · goodsId · 모든 모델코드 · 짧은 모델명(QM55C 등) · 제품명 · 사진 pid(images.json `model`) · 제품 사진 pack 주소. `reference/` · `docs/` · `output/` · `poc/test` 결과 기록은 제외하고, `layouts.b64`는 풀어서 본다. 도입사례(catalog.json cases) 원문은 DSS가 아니라 고치지 않는다.

- PPT 레이아웃 템플릿: 바뀐 항목은 새 이름 · 모델 · 수치로, 판매 종료 항목은 대체 제품의 이름 · 모델 · 사양 글자 · 제품 사진 · `prods` 메타로 바꾼다. 문장이 옛 제품 고유의 기능 · 수치를 말하면 대체 제품 원문으로 다시 쓴다. `f` · `data-tb` · `data-img` · 칸 번호는 그대로 둔다(저장 문서 overrides 호환). 이 작업으로 레이아웃을 새로 만들거나 retired로 돌리지 않는다.
- 3D 오브젝트: 제품 데이터를 반영한 뒤 `prepare_data.py --force` → `app/.venv/bin/python -B app/scripts/build_spatial_products.py` → `node app/scripts/build_spatial_library.mjs` → `node app/scripts/build_spatial_object_previews.mjs`(없는 썸네일만 렌더)로 바뀐 · 새 항목의 형상(치수 · 색 · 이미지 근거)과 썸네일을 다시 만든다. 새 항목의 치수 표기(예: 'L × W × H', 원문 오탈자 '외형지수')가 축 순서대로 읽혔는지 보고, 형상을 고친 뒤 처음 렌더한 썸네일 중 쓰이지 않는 것은 지운다. 라이브러리 새 버전(`app/data/spatial/versions/<hash>.json`)은 저장된 공간 장면 호환용이라 지난 버전과 함께 커밋한다. 손으로 고친 치수 근거(`product-evidence.json`)가 바뀐 원문과 맞지 않으면 고친다.
- 솔루션 연결: `catalog.json` solutions `with`에서 판매 종료 제품을 대체 제품으로, `vertical_space_solution.json` devices · sources를 새 원문으로.
- 이미지: 판매 종료 제품의 컷을 쓰던 레이아웃 칸은 대체 제품 컷으로. images.json · imglib의 판매 종료 제품 연결은 남긴다(기존 문서용).
- 바꾸지 않는 쪽(위 표)에서 찾은 참조는 고치지 않고 `REPORT.md`에 위치만 적는다.
- 바꾼 장은 1280×720으로 렌더해 넘침·잘림·빈 사진·엉뚱한 제품 사진이 없는지 보고, `layout-fixes.json`(장·칸·전/후)을 남긴다.

## 8-S. 구독(subscription) — 레지스트리 · 결제 추론안 · 혜택 기간 · 구독 장

- 정본 입력(사람이 원문을 읽고 고치는 곳): `proddb/subs/sources.json`(소스) · `facts.json`(원문 사실 — 화면 문구 `show`, 대조 문장 `text`, 이미지 해시) · `mapping.json`(구독 품목 분류 → 제품 DB 분류 · 대표 행, 패키지 → 업종) · `inferred.json`(결제 추론안) · `assets.json`(사진 가공). `app/data/subscriptions.json`은 생성물이라 손으로 고치지 않는다.
- 결제 · 납부: 원문에 있는 것만 official(지금은 월 구독료 — 월 분할 납부). 원문에 결제 방법이 없으면 B2B 수준의 추론안(선납 + 월 · 연 단위 · 다년, 본사 일괄 계약 · 사업장별 청구, 단계 도입 · 추가 구독 등)을 `inferred.json`에 두고 basis inferred · status inferred · 확인할 것(`confirm`) 필수. 장에는 '협의안' 칩과 확인할 것으로만 쓰고 금액 · 할인율 · 비율은 쓰지 않는다(`[00]`). 원문에 새 결제 방법이 생기면 official로 옮기고 겹치는 추론안은 뺀다.
- 혜택(promotion): validFrom ~ validTo. RUN_AT 날짜가 validTo를 지나면 `expired` → 혜택 장 L_SUB_PROMO는 retired(새 선택에서 빠지고 저장 문서는 그대로), 목차 조립기는 혜택 장을 넣지 않는다. 새 혜택은 facts.json promotions에 더한다.
- key message: 항목마다 하나 이상, 원문 문장에서만(추론안의 메시지는 inferred로 표시).
- 패키지 품목: 공식 모델코드 → B2B 제품 DB 행(exact > series > 같은 분류 대표 행 category). B2B DB에 없는 B2C 모델은 category로 잇고 보고한다. 업종 44: 공식 패키지(direct) · 비슷한 패키지(similar) · 업종 공간 기준 구성(derived, 분류 3개 이상) · 모자라면 오피스 패키지(fallback).
- 순서: `collect.py` → `proddb/build/subs/assets.py`(바뀐 사진만) → `python3 proddb/build/subs/build.py <raw> <RUN_ID> <RUN_AT> --raw-out proddb/raw/subs` → 원장(전체 run은 `ledger.py`가 함께, 구독만 볼 때 `proddb/build/subs/ledger_run.py proddb/reviews/<RUN_ID>`) → `subs_db.py`(`build_db.py`가 자동) · `dss_db.py` → `python3 build/subs/gen_module.py`(L_SUB_* 21장, 글자 역할을 구운 `build/toc/typed.py`) → `python3 build/toc/build_content.py`(목차 내용 v.sub · subs) → `node build/subs/compose.mjs check --render <목록>` + `python3 build/subs/render_check.py <목록> <out>`(넘침 · 잘림 0) → `node build/subs/compose.mjs samples`(구독 샘플 9) → `node app/scripts/layout_variants.mjs` → `node app/scripts/layout_slot_modes.mjs`(칸 구분 — 구독 장은 칸 이름으로: 레지스트리 원문 · 패키지 · 조건 · 납부는 고정, 제목 · 현장 고민 · 예산 금액은 AI) → `node app/scripts/export_agent_data.mjs`.
- 파트 · 목차: 파트 타입 `subscription`(구독 도입), 목차 템플릿 '구독 제안서'(subs) · '구독 전환 제안서'(subsl), 목차 이름 B2B 삼성 AI 구독 · {업종} 구독 패키지 · 구독 케어 · B2B 블루패스 · 구독 조건 · 결제 · B2B 삼성 AI 구독 요약. 같은 목차 이름이면 같은 장.
- 요구사항에 따라 더하는 목차(add-on) '구독 솔루션 제안'(구독 가치 · 업종 패키지 · 납부안 3 + 혜택): 규칙은 `proddb/subs/mapping.json` `addon`(요구 신호 strong · weak · negative, 목차 틀, 자리 — 비용 · 구매 뒤, 없으면 실행 · 사례 · Why 앞) → 레지스트리 `addon` → 목차 내용 `subs.addon`. 같은 규칙을 앱(`app/web/src/domain/proposals/addons.js` · `toc_templates.js` `ensureTocScenario(tid, vid, {addons})` · Storyboard 다음 목차 후보)과 서버(`app/api/poc/subscription_addon.py` — AI 목차 추천 · Storyboard 이어 구성)가 쓴다. 신호 · 자리를 바꾸면 `test_subscription_addon.py`(앱 · 서버 같은 판정)로 확인한다.
- 구독 솔루션이 포함된 구성: 목차 템플릿 '표준 제안서 + 구독 솔루션'(stdsub) · '투자 효과형 + 구독 솔루션'(roisub), 샘플 '표준 + 구독 솔루션' 4(`bs_sub_std_<업종>` — 공식 패키지마다 하나). 서버 목차 추천은 이 샘플들의 '구독 솔루션 제안' 목차를 모듈로 쓴다(같은 업종 → 같은 패키지 → 오피스 패키지 순) — 공식 패키지가 늘거나 바뀌면 `build/subs/compose.mjs` PICK 도 맞춘다.

## 9. 반영과 검증

- 순서: proddb → `app/data` → 레이아웃 · 3D 오브젝트 → `prepare_data.py --force` → `node app/scripts/export_agent_data.mjs`(`promote.py`가 proddb · app/data · 원본 DB 반영을 맡는다).
- 건수 계약: 제품 수가 바뀌면 `prepare_data.py` · `export_agent_data.mjs`(expect-products) · `app/api/poc/knowledge.py` EXPECTED · `app/api/main.py` limit · `app/tests/strict_contracts.py` · `test_stage1_api.py` · `test_product_projection_refresh.py` · `functional-contracts.mjs` C01 · `smoke.py` 등 고정 건수를 변경표 건수로 함께 고친다. `--allow-count-drift`로 넘기지 않는다.
- 검사: `npm --prefix app/web run build`, `make test`, `app/.venv/bin/python -B app/scripts/preflight.py --deep`, `node app/tests/functional-contracts.mjs catalog pptx repository`, 구독 `node app/tests/subscriptions.mjs` · `node app/tests/toc-templates.mjs` · `PROPOSAL_ONLY=bs_sub_ node app/tests/vertical-proposals.mjs`(샘플 계약 · 렌더 clipped 0 — 구독 샘플 수가 바뀌면 allScenarios · `report_vertical_proposals.mjs` decks도), 바꾼 장 렌더, 원장 검사(unresolved를 뺀 판매 중 항목은 모두 `checked_at == RUN_AT` · 앱 레코드 checkedAt과 원장이 같음 · 판매 종료 항목이 새로 고르는 목록에 없음 · 모든 `replacedBy`가 판매 중).
- 변경 전부터 실패하던 검사는 따로 적는다. 검증을 통과하면 커밋하고 main에 푸시한다(이 skill 실행 요청이 그 승인이다). 푸시 전에 origin/main을 받아 rebase하고, 그 사이 들어온 변경(예: 레이아웃 수)으로 계약이 바뀌었으면 다시 맞춘 뒤 검사한다. 검증이 실패로 남으면 `dss/<RUN_ID>` 브랜치로만 올리고 보고한다.
- 브라우저 계약(`functional-contracts.mjs`)은 API 서버가 필요하고, 서버는 실제 LLM 연결 확인을 통과해야 기동한다. 키가 없는 환경에서는 실행하지 못한 것으로 적거나, 모델 호출이 없는 계약만 LLM 확인을 건너뛴 로컬 검증 서버로 돌리고 그 사실을 보고한다(검증 서버 코드는 커밋하지 않는다).

## 10. 보고

`proddb/reviews/<RUN_ID>/REPORT.md`와 대화 요약: RUN_ID·RUN_AT, 소스별 완전성(새 권 · 빠진 권 · 새 호 · 구독 소스), device·solution·service·subscription별 표식 · new · changed · moved · unresolved · deprecated 건수(구독은 + inferred · expired), 종류 재분류, 판매 종료 표(근거 · 대체 제품), 고친 레이아웃 · 3D 오브젝트, 바꾸지 않은 쪽(시나리오 · 히스토리)에 남은 판매 종료 제품 위치, 남은 unresolved와 다음 run에서 볼 것, 실행한 검사. 다음 run은 이 원장의 `checked_at`을 기준으로 시작한다.

## 하지 말 것

- 캐시·지난 원문으로 표식 찍기, 수집 실패·빈 응답을 판매 종료로 읽기
- 판매 종료 제품 행을 지우기(기존 제안서 · 시나리오가 참조한다)
- 기존 제안서 · 샘플 시나리오 · 히스토리 · 시나리오 생성기 입력을 고치기
- `ec_*` id를 Dir·순번으로 다시 매기기, 큐레이션 id를 다른 모델에 재사용하기
- 원문에 없는 수치·기능을 레이아웃 · key message에 쓰기, `app/data/static`(동결본) 아래에 쓰기, 생성 파일을 손으로 고치기
- 근거와 사용자 확인 없이 솔루션·서비스를 판매 종료로 표시하기
- 구독 결제 추론안을 원문처럼 쓰기, 원문에 없는 구독료 · 할인율 · 기간을 장 · key message에 쓰기, 기간이 지난 혜택을 새 선택에 남기기