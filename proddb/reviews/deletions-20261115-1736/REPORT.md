# 판매 종료 제품 삭제 — deletions-20261115-1736

- 실행: 2026-11-15 17:36 KST · `proddb/build/dss/deletions.py apply` · 확인한 사람 `minsub0922`(삭제 후보 17개 전체를 확인하고 삭제를 지시)
- 대상: dss-20261112-1445 가 판매 종료로 표시하고 dss-20261115-1657 이 다시 확인한 17개(모니터 11 · 에어컨 4 · 청소기 2). 목록 · 근거 · 대체 제품은 `proddb/reviews/dss-20261115-1657/REPORT.md` 의 표, 실행 기록은 이 폴더의 `deletion.json`.
- 커밋 · 푸시는 하지 않았다.

## 결과

| 항목 | 전 | 후 |
|---|---|---|
| 제품(`products_db.json` `counts.total`) | 1,084 | 1,067 (행 1,044 → 1,027, 큐레이션 40 그대로) |
| 지운 제품 흔적(`removed`) | 0 | 17 — 이름 · 모델 · 대체 제품(모두 판매 중인 행) |
| 제품 상세(`product-details`) | 1,084 | 1,067 |
| 원장 | deprecated 17 | deleted 17(`deleted_at` · `deleted_by`), run `deletions-20261115-1736`(scope deletions) |
| 삭제 후보(`deletions.py list`) | 17 | 0 |

- 지운 17개 말고 달라진 제품 행 · 상세 · 솔루션 · 분류 · 구독 사실은 없다(삭제 전 백업과 대조). 이미지 라이브러리에서는 그 제품만 쓰던 사진이 새로 고르는 색인에서 빠지고, 묶음 데이터는 저장 문서용으로 남는다.
- 연관 자료: 샘플 시나리오 · 생성기 입력 · 레이아웃 · 목차 내용 · 구독 대응에는 이 17개의 id · 모델코드 · 이름이 없어 고친 글이 없다(`blocked` 0). 샘플 버티컬 시나리오는 다시 만들어도 같다.
- 3D 오브젝트: 1,067개, 라이브러리 `8493e218` — 지운 제품의 오브젝트가 없다. 지난 라이브러리 버전(`app/data/spatial/versions/d032ab9e.json` 등)과 그 썸네일 17개는 저장된 공간 장면용으로 남겼다.
- runtime projection · 에이전트 KB 재생성(제품 1,067). 홈의 하루 단위 자산 건수 보관분(`app/data/runtime/catalog_metrics.sqlite`)이 지우기 전 값(1,084)으로 남아 있어 비웠다 — `cascade.py` 가 이제 DB 를 고칠 때마다 비운다.

## 검사

- 도구의 자체 검증(`refcheck.py`) 통과, 실패 시 되돌리기는 쓰이지 않았다.
- `pytest app/tests` 563 통과(subtest 2,805 — 지운 17개만큼 줄어듦) · `strict_contracts.py products` 12/12 · `subscriptions.mjs` 13 · `toc-templates.mjs` 8 · `removed-products.mjs` 통과 · `preflight.py --deep` OK · 원본 · runtime SQLite `integrity_check` ok.
- 테스트 2건을 삭제 정책에 맞게 고쳤다: `test_stage1_api.py` 의 상세 pack 비교는 지운 제품(`removed`)을 기대값에서 빼고, 자산 건수 비교는 위의 보관분 비우기로 맞는다.
- 실행 중인 서버(8788)에서 확인: 제품 1,067개 · `removed` 17개를 내보내고, 지운 제품 상세는 404, 대체 제품은 그대로 열린다. 서버가 메모리에 올려 둔 에이전트 KB 는 재시작해야 1,067 로 바뀐다.
- 실행하지 않은 것: `functional-contracts.mjs`, 저장된 공간 장면을 화면에서 여는 확인(지난 라이브러리 버전 파일이 남아 있는 것만 확인).

## 되돌리려면

삭제 직전 상태(업데이트 dss-20261115-1657 반영 뒤)의 사본이 `output/dss/backups/20261115-1730-before-deletion/`(git 제외)에 있다 — `app-data/`(= `app/data`, static · runtime 제외) · `proddb/`(사진 crop 제외) · `img-lib/index.json` · `templates/` · `app-data-runtime/`. `deletion.json` 의 `changed_files` 를 그 사본에서 되돌려 놓고 `python3 proddb/build/dss/cascade.py` 를 실행하면 삭제 전으로 돌아간다. 업데이트 전 상태는 `output/dss/backups/20261115-1705-before-update/`.
