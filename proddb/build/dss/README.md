# DSS DB 업데이트 도구 (`.agents/skills/winmate-update-dss-db`)

한 번의 실행(run)을 `output/dss/<RUN_ID>/`(git 제외 staging)에서 만들고, 검토 기록은 `proddb/reviews/<RUN_ID>/`(커밋)에 남긴다.
`R=output/dss/<RUN_ID>`, `V=proddb/reviews/<RUN_ID>` 기준. 앞 단계는 수집, 뒤 단계는 반영이다.

| 순서 | 명령 | 하는 일 |
|---|---|---|
| 1 | `CHROME=… OUT_DIR=$R/raw SITE_LISTS=proddb/raw/site_lists.txt PREV_RAW=proddb/raw/wkb_products.json node proddb/build/collect_site.mjs` | samsung.com/sec/business 목록 · 옵션 · 스펙 API · PDP 전체(총수까지 페이지네이션) |
| 2 | `ECAT_OUT=$R/ecat ECAT_LIST=$R/ecat/catalogs.json python3 proddb/build/fetch_ecat_text.py` | e-카탈로그 권별 쪽 텍스트(`missing` · `fetchedAt`) — 권 목록은 목록 페이지를 탭별로 다시 읽어 만든다 |
| 3 | `python3 proddb/build/dss/fetch_solutions.py . $R/sol/pages.json` | 솔루션 · 분류 · 근거 URL 전부의 상태 · 최종 URL · 제목 · 본문 해시 |
| 4 | `python3 proddb/build/dss/diff_site.py proddb/raw $R/raw app/data $R/review/site-diff.json` · `REPLACE=<새 Dir>:<지난 Dir> python3 proddb/build/dss/diff_ecat.py proddb/ecat $R/ecat $R/review/ecat-diff.json` | 사이트 상품 카드 · 카탈로그 권/항목 차이 |
| 5 | `python3 proddb/build/dss/review_candidates.py . $R $R/review/candidates.json $R/review/deprecation-review-raw.json` | 판매 종료 후보 재검토(PDP 직접 열기 · 검색 API · 전 권 텍스트) → 사람이 판정해 `$V/deprecation-review.json` |
| 6 | `python3 proddb/build/dss/fetch_new_photos.py $R/raw/wkb_products.json app/web/public/assets/products '<{gid: [이미지 번호]}>'` | 새 사이트 행의 카드 사진(app 소유 static `/assets/products/`, 동결본 pack 아님) → `$V/new-photos.json` |
| 7 | `python3 proddb/build/dss/remap_issue.py …` · `python3 proddb/build/dss/apply_extract_decisions.py $V/extract-decisions.json $R/ecat-build/extract app/data/products_db.json` | 정기 호 교체(id 유지 · 근거 쪽 이동)와 사람이 쪽 텍스트 · 이미지로 확인한 추출 판정 적용, 새 권 추출(`proddb/ecat/BRIEF.md`) |
| 8 | `build_db.py`(지난 원문 → `$R/base`, 이번 원문 → `$R/new`, `ECAT=$R/ecat-build`) → 두 DB 에 활성 DB 의 `product_spec_review` 복사 → `GROUPS_OUT=… export_app.py <db> $R/{base,new}-app` | 지난 원문으로 다시 만든 export 가 활성 앱 데이터와 같은지 먼저 확인한다(재현 기준) |
| 9 | `python3 proddb/build/dss/apply_run.py $R $V` | 3-way 반영(base→new 에서 바뀐 필드만 활성에 적용) · 판매 종료/사이트 목록 이탈/대체 표시 · 새 행 · 검토 사양 재대조 · 확인 시점 표식. 지난 run 이 표시만 하고 남긴 행(판매 종료 · 사이트 목록 이탈 · 대체)은 활성에만 있어도 재현 기준을 통과하고 그대로 둔다 — 그 밖의 행 차이나 표시한 행이 원문에 다시 나타나면 멈춘다(`run.json` 의 `alias` · `superseded` 는 지난 전체 run 것을 이어 적는다). 앱 상세에 싣는 범위(특장점 8개 · 본문 240자 · 면책 200자) 밖에서만 바뀐 원문은 `site-diff.json` 에서 읽어 `source-changed` 로 남기고, 원장은 changed 로 센다 |
| 10 | `python3 proddb/build/dss/apply_solutions.py $R $V` · `python3 proddb/build/dss/inventory.py $R $V` · `python3 proddb/build/dss/ledger.py $R $V` | 솔루션 · 서비스 표식과 분류 URL, 소스 인벤토리, 원장 |
| 11 | `python3 proddb/build/dss/promote.py $R $V` | proddb(raw · ecat · 원장) · app/data 반영, 원본 SQLite 재빌드(+ 사진 · 이미지 라이브러리 · 원장 · 검토 사양 표). staging 에 구독 레지스트리(`$R/stage/app/data/subscriptions.json`)가 있으면 그것과 구독 원문(`$R/subs/raw` → `proddb/raw/subs`)도 SQLite 재빌드 전에 반영한다 |
| 12 | `prepare_data.py --force` → `build_spatial_products.py` → `build_spatial_library.mjs` → `build_spatial_object_previews.mjs` → `export_agent_data.mjs` → 빌드 · 테스트 | runtime projection · 3D 오브젝트 · 썸네일(없는 것만) · 에이전트 KB |

### 구독(subscription) — `proddb/build/subs/` (전체 run 의 3 · 10 단계에 함께, 구독만 볼 때는 이 표만)

| 순서 | 명령 | 하는 일 |
|---|---|---|
| S1 | `python3 proddb/build/subs/collect.py $R/subs/raw` | `proddb/subs/sources.json`(구독 메인 · 혜택 이벤트 · 뉴스룸 기사) 본문 텍스트 · 해시 · 콘텐츠 이미지 sha256, 홈 GNB 의 새 구독 링크 발견, 패키지 모델 검색 API → `inventory.json` |
| S2 | `python3 proddb/build/subs/assets.py $R/subs/raw` | `proddb/subs/assets.json` 대로 패키지 · 케어 · 가치 사진 가공(자르기 · 덧칠 · 원본 PNG 컷) → `app/web/public/assets/subs/*.webp` |
| S3 | `python3 proddb/build/subs/build.py $R/subs/raw <RUN_ID> <RUN_AT> --raw-out proddb/raw/subs` | `facts.json`(원문 사실 — 대조 문장 `text` · 화면 문구 `show`) · `mapping.json` · `inferred.json`(결제 추론안) → `app/data/subscriptions.json`. 원문 문장 · 이미지 해시 대조 실패 → `issues` + `needs-review`, 혜택 기간 지남 → `expired`. 전체 run 에서 반영 전에 만들 때는 9단계 뒤에 `--raw-out` 대신 `--out $R/stage/app/data/subscriptions.json --products-db $R/stage/app/data/products_db.json` — 활성 레지스트리는 그대로 두고 staging 에 쓰며, `ledger.py` 가 그 파일을 읽고 `promote.py` 가 반영한다 |
| S4 | 전체 run: `ledger.py`(같은 규칙 `subs_ledger.py`) · 구독만: `python3 proddb/build/subs/ledger_run.py $V` | 원장 `subscription:<id>` + run 기록(`scope: ["subscriptions"]`, 종류 판정 규칙이 바뀐 행 `reclassified`) |
| S5 | `python3 proddb/build/subs_db.py` · `python3 proddb/build/dss_db.py` (`build_db.py` 가 빌드 끝에 둘 다 부름) | SQLite `subscription` · `subscription_item` · `subscription_message` · `subscription_category` · `subscription_vertical`, `dss_item` · `dss_run.scope_json` |
| S6 | `python3 build/subs/gen_module.py` → `python3 build/toc/build_content.py` → `node build/subs/compose.mjs check --render <목록>` → `python3 build/subs/render_check.py <목록> <out>` → `node build/subs/compose.mjs samples` → `node app/scripts/export_agent_data.mjs` | 구독 장 L_SUB_* 21(글자 역할을 구운 `build/toc/typed.py`) · 목차 내용(v.sub · subs) · 구독 목차 조립 88덱 렌더 확인 · 구독 샘플 시나리오 5 · 에이전트 KB |
| S7 | `node app/tests/subscriptions.mjs` · `node app/tests/toc-templates.mjs` · `PROPOSAL_ONLY=bs_sub_ node app/tests/vertical-proposals.mjs` | 레지스트리 · 원장 · SQLite · 장 · 파트 · 목차 · 샘플 계약, 샘플 렌더(clipped 0) |

결제 방법은 원문에 있는 것만 official(월 구독료). 원문에 없는 B2B 결제안은 `proddb/subs/inferred.json` 에 basis inferred 로 두고 장에는 '협의안' 칩 + 확인할 것으로만 쓴다(금액 · 할인율은 `[00]`).

### 일일 점검 · 삭제 · 연쇄 반영 (관리자 「소스 점검 · 업데이트」가 부른다)

| 명령 | 하는 일 |
|---|---|
| `python3 proddb/build/dss/watch.py --out output/dss/watch/<시각> [--channels ecat,solutions,subs,site]` | 현재 DB 가 원천 소스와 같은지 점검한다(DB 는 바꾸지 않는다). `ecat` 은 파일로 — 권 목록 · 쪽 수 · 뷰어 제목 · 모든 쪽 이미지 파일의 Last-Modified 를 그 권을 받은 시각(`text/<Dir>.json` `fetchedAt`)과 비교, `site` 는 실제 수집기로 staging 에 받아 `diff_site.py` 로 비교(약 10분), `solutions` 는 상태 · 최종 주소 · 제목 · 본문(메뉴 · 푸터 제외, `pagetext.py`) 해시, `subs` 는 본문 · 이미지 해시와 패키지 모델 검색. 결과 `<out>/watch.json`(채널마다 same · changed · partial · failed). 끝난 코드 0 = 점검 완료, 2 = 실패한 채널 있음 |
| `proddb/dss/watch-config.json` · `proddb/dss/watch-state.json` | 점검 설정(범위 밖 권 — Dir 263, 목록 밖 유지 권 — Dir 93) · 솔루션 페이지 본문 해시 기준(전체 run 뒤 첫 점검에서 다시 잡는다. 받을 때마다 본문이 달라지는 페이지는 `volatile` 로 표시해 해시 판정에서 뺀다) |
| `python3 proddb/build/dss/deletions.py list` | 삭제 후보(원장 `deprecated`, 아직 안 지운 것)마다 근거 · 대체 제품 · 연관 자료(`refs`) · 자동으로 못 지우는 이유(`blocked`) · 함께 지워야 하는 후보(`depends_on` — 이 항목을 대체 제품으로 삼은 다른 후보) |
| `python3 proddb/build/dss/deletions.py apply --ids <원장 키,…> --by <확인한 사람> [--report <파일>] [--dry-run] [--accept-manual]` | 확인받은 후보를 지운다: 레지스트리에서 제거(원장 `deleted` · `products_db.json` `removed` 기록 · `counts.total` 갱신) → 연관 자료의 id 참조를 대체 제품으로, 그 제품만의 사진은 새로 고르는 색인에서 뺌 → `cascade.py` → `refcheck.py`. 실패하면 건드린 파일을 모두 되돌린다. 기록 `proddb/reviews/deletions-<시각>/`. 끝난 코드 0 완료 · 3 막힘(먼저 고칠 글이 있음, 아무것도 바꾸지 않음) · 1 실패(되돌림). `--accept-manual` 은 사람이나 에이전트가 글을 이미 고친 뒤에만 쓴다(검증은 그대로). 원본 SQLite(`proddb/winmate_products.sqlite`)와 3D 오브젝트 라이브러리를 그 자리에서 다시 만든다 |
| `python3 proddb/build/dss/cascade.py [--only projection,spatial,scenarios,kb] [--no-render] [--prune-thumbnails]` | DB 가 바뀐 뒤(업데이트 · 삭제) 제품 · 솔루션 DB 에서 만들어지는 것을 다시 만든다 — runtime projection(+ 홈의 하루 단위 자산 건수 보관분 비움) · 3D 오브젝트와 썸네일(없는 것만 렌더) · 샘플 시나리오 · 에이전트 KB. 지운 제품의 오브젝트 썸네일은 저장된 공간 장면(지난 라이브러리 버전)이 쓰므로 기본으로 남긴다 |
| `python3 proddb/build/dss/refcheck.py [--json]` | 연관 자료가 DB 와 맞는지 — 없는 제품 · 솔루션 id 참조, 삭제된 제품의 이름 · 모델이 남은 샘플 시나리오 · 레이아웃 글, 제품 없는 3D 오브젝트, 건수 계약. 하나라도 있으면 코드 1 |

삭제는 사람이 대상을 확인한 것만 한다. 업데이트 run 은 판매 종료 표시까지만 하고, 관리자 화면의 삭제 후보에서 고른 것이 `deletions.py apply` 로 실행된다.

`$V/run.json` 이 run 의 설정이다: `run_id` · `run_at`, 같은 제품이 다른 id 로 다시 생긴 행(`alias`), 같은 제품의 사이트 행으로 대체된 행(`superseded`),
새 행의 상세 pack 번호(`new_pack`), 분류 URL 이동(`taxonomy_url_moves`), 솔루션 URL 이동(`sol_url_moves`).
