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
| 9 | `python3 proddb/build/dss/apply_run.py $R $V` | 3-way 반영(base→new 에서 바뀐 필드만 활성에 적용) · 판매 종료/사이트 목록 이탈/대체 표시 · 새 행 · 검토 사양 재대조 · 확인 시점 표식 |
| 10 | `python3 proddb/build/dss/apply_solutions.py $R $V` · `python3 proddb/build/dss/inventory.py $R $V` · `python3 proddb/build/dss/ledger.py $R $V` | 솔루션 · 서비스 표식과 분류 URL, 소스 인벤토리, 원장 |
| 11 | `python3 proddb/build/dss/promote.py $R $V` | proddb(raw · ecat · 원장) · app/data 반영, 원본 SQLite 재빌드(+ 사진 · 이미지 라이브러리 · 원장 · 검토 사양 표) |
| 12 | `prepare_data.py --force` → `build_spatial_products.py` → `build_spatial_library.mjs` → `build_spatial_object_previews.mjs` → `export_agent_data.mjs` → 빌드 · 테스트 | runtime projection · 3D 오브젝트 · 썸네일(없는 것만) · 에이전트 KB |

`$V/run.json` 이 run 의 설정이다: `run_id` · `run_at`, 같은 제품이 다른 id 로 다시 생긴 행(`alias`), 같은 제품의 사이트 행으로 대체된 행(`superseded`),
새 행의 상세 pack 번호(`new_pack`), 분류 URL 이동(`taxonomy_url_moves`), 솔루션 URL 이동(`sol_url_moves`).
