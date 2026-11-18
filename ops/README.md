# Winmate 운영 모니터링 — Langfuse · Metabase

Winmate 옆에 띄우는 사내(self-host) 모니터링 스택이다. 데이터는 이 컴퓨터의 Docker 볼륨에만 남는다.

| 서비스 | 주소 (기본 127.0.0.1에만 바인딩) | 보는 것 |
|---|---|---|
| Langfuse 4.79 | http://localhost:8810 | 서버 AI 호출 하나하나 — 프롬프트 · 응답 · 토큰 · 비용 · 지연 · 오류, 작업(job) → 논리 호출 → 실제 요청 계층, 사용자 · 세션별 |
| Metabase 0.65 | http://localhost:8820 | 「Winmate 운영 대시보드」 — 활성 사용자, AI 호출 · 토큰, 고객의 소리, 최근 오류 · AI 작업, 사용자별 활동, 제안서 목록, Langfuse 비용(모델별 · 일별) |

계정은 둘 다 `admin@winmate.local`, 비밀번호는 루트 `.env`의 `LANGFUSE_ADMIN_PASSWORD` · `METABASE_ADMIN_PASSWORD`.
포트 · 버전 · 연결 설정의 기준값은 루트 [`.env.example`](../.env.example)의 「운영 모니터링」 구역에 있다(아래 「구성 · 재현」).

## 켜기 · 끄기

```sh
bash ops/start.sh          # 켜기 (Finder에서 ops/start.command 더블클릭도 같음)
make restart               # Winmate를 다시 시작해야 Langfuse 전송 · Metabase용 스냅샷이 켜진다 (처음 한 번)
bash ops/status.sh         # 컨테이너 · 헬스 · Winmate 쪽 전송 수 · 마지막 적재
bash ops/status.sh --logs  # 로그 따라 보기 (서비스 이름을 붙이면 그것만)
bash ops/stop.sh           # 정지(데이터 유지). 컨테이너까지 지우려면 bash ops/stop.sh --down
```

`ops/start.sh`는 다시 실행해도 안전하다: Docker(Colima) 확인 → 메모리 점검(Docker VM 5.5 GiB 미만이면 중단, 권장 8 GiB) → 루트 `.env.example`의 운영 구역으로 루트 `.env` 채우기(없거나 빈 항목만, 비밀값은 처음 한 번 생성) → 포트 점검 → `docker compose up` → 헬스 확인 → Metabase 초기 설정. `OPS_RESTART_WINMATE=1 bash ops/start.sh`면 마지막에 Winmate도 다시 시작한다. 로그는 `ops/data/logs/`.

포트 · 바인딩(기본값은 루트 `.env.example`의 「포트 · 바인딩」 구역)은 루트 `.env`의 `LANGFUSE_PORT` · `METABASE_PORT` · `OPS_BIND`(다른 기기에서 열려면 `0.0.0.0`)로 바꾼 뒤 `bash ops/start.sh`. Langfuse 로그인은 `NEXTAUTH_URL`(localhost:포트) 기준이라 `127.0.0.1` 대신 `localhost`로 연다.

## 구성 · 재현 (루트 `.env.example`)

Winmate는 앱 · 실험 도구 · 운영 스택이 루트 `.env` 하나를 쓴다. 루트 `.env.example`(Git 포함)의 「운영 모니터링」 구역이 이 스택의 기준값이고, 루트 `.env`(Git 제외)는 이 컴퓨터의 실제 값이다. `bash ops/start.sh`는 실행할 때마다 운영 항목(`OPS_*` · `LANGFUSE_*` · `METABASE_*` · `CLICKHOUSE_*` · `MINIO_*` · `ANALYTICS_*` · `SYNC_*` · `WINMATE_LANGFUSE*` · `WINMATE_ANALYTICS_*` · 이미지 태그) 중 `.env`에 없거나 값이 빈 것만 채운다 — 값이 있으면 그대로 복사, 비어 있으면(비밀값) 무작위 생성. 이미 있는 값과 다른 항목(LLM 키 등)은 건드리지 않는다.

| 묶음 | 항목 |
|---|---|
| 호스트 포트 | `OPS_BIND=127.0.0.1` · `LANGFUSE_PORT=8810` · `METABASE_PORT=8820` (호스트에 여는 포트는 이 둘뿐) |
| 계정 | `OPS_ADMIN_EMAIL` · `LANGFUSE_ADMIN_PASSWORD` · `METABASE_ADMIN_PASSWORD` |
| Langfuse 프로젝트 · 연결 | `LANGFUSE_PROJECT_ID=winmate` · `LANGFUSE_HOST`(비우면 `http://127.0.0.1:<LANGFUSE_PORT>`, 포트를 바꾸면 따라감) · `LANGFUSE_PUBLIC_KEY` · `LANGFUSE_SECRET_KEY` |
| Winmate 연결 | `WINMATE_LANGFUSE` · `WINMATE_LANGFUSE_CONTENT` · `WINMATE_LANGFUSE_ENVIRONMENT` · `WINMATE_ANALYTICS_DIR` · `WINMATE_ANALYTICS_INTERVAL` · `WINMATE_ANALYTICS_DAYS` · `SYNC_INTERVAL` (Winmate가 같은 루트 `.env`에서 읽음) |
| 이미지 버전 | `LANGFUSE_IMAGE_TAG` · `METABASE_IMAGE_TAG` · `CLICKHOUSE_IMAGE_TAG` · `POSTGRES_IMAGE_TAG` · `REDIS_IMAGE_TAG` · `MINIO_IMAGE` · `PYTHON_IMAGE` |
| 내부 비밀값 | Langfuse(NextAuth · salt · 암호화 키) · Postgres · Redis · ClickHouse · MinIO · 분석 DB 계정 · Metabase 세션/암호화 키 |

내부 서비스 포트(호스트에 열지 않음): langfuse-worker 3030 · clickhouse 8123/9000 · langfuse-postgres 5432 · langfuse-redis 6379 · minio 9000 · analytics-db 5432. Winmate 자체는 8788(`WINMATE_API_PORT`), llm-redis 6379(`app/compose.llm.yml`)로 그대로다.

다른 컴퓨터에서 같은 구성: 저장소를 받고 `bash ops/start.sh` → `make restart`. 값을 바꾸려면 루트 `.env`를 고치고 `bash ops/start.sh`(Winmate 연결 설정이면 `make restart`까지). 비밀값은 데이터 볼륨과 짝이라 바꾸지 않는다.

## 연결 구조

```
Winmate (app/api/telemetry.py) ─ fan-out ─┬─ admin/operations.py   (기존 /admin/tracing — 그대로)
                                          └─ app/api/ops_bridge.py
                                               ├─ OTLP/HTTP JSON → Langfuse :8810 /api/public/otel/v1/traces (v4 헤더)
                                               └─ 5분마다 운영 DB 스냅샷 → ops/data/snapshots/winmate.sqlite
ops/data/snapshots ─ winmate-sync(1분 주기) → analytics-db(Postgres) winmate 스키마 · 뷰 → Metabase
Langfuse ClickHouse ─ 읽기 전용 계정 metabase → Metabase 「Langfuse (ClickHouse)」
```

- **trace ID가 같다.** Langfuse trace ID = Winmate `trace_id`(32자리 hex가 아니면 sha256 앞 32자리 — `ops_bridge.langfuse_trace_id`, `sync/loader.py` 같은 규칙). Metabase의 `langfuse_url` 열과 관리자 화면의 trace가 같은 요청을 가리킨다.
- **Langfuse에 가는 것**: 실제 모델 요청(`generation` — 모델 · 토큰 · 종료 사유 · 입력 · 출력 · 생성 설정), 재시도를 묶는 논리 호출(`span`), 서버 작업(`agent`, `job:<종류>`). 사용자 ID · 세션(로그인 세션) · 기능 · 화면은 모든 관측에 붙는다. HTTP 요청 · 화면 활동은 보내지 않는다(그건 Metabase).
- **프롬프트 · 응답 내용**은 `WINMATE_LANGFUSE_CONTENT=on`(기본)일 때만 보낸다. API 키 패턴은 지우고(`provider.redact`), 이미지 · 첨부는 `[image/png · 120 KB]`로 바꾸고, 메시지당 2만 자 · 응답 5만 자에서 자른다. 끄려면 루트 `.env`에서 `off`로 바꾸고 `make restart`.
- **Metabase로 가는 스냅샷**에는 비밀번호 해시 · salt, 고객의 소리의 화면 상태(context), 이미지 · 긴 본문이 들어가지 않는다. 스팬은 최근 90일(`WINMATE_ANALYTICS_DAYS`). 원본 SQLite는 Winmate 프로세스가 같은 컴퓨터에서 읽기 트랜잭션으로 복사하고, 컨테이너는 원본을 열지 않는다(Docker VM 공유 폴더 너머 SQLite 잠금 문제를 피하려고).
- **Winmate는 막히지 않는다.** 전송은 크기가 정해진 큐 + 백그라운드 스레드이고, Langfuse가 꺼져 있으면 버린 건수만 센다(`app/data/runtime/ops-bridge.json`, 관리자 대시보드의 `logging.ops`).

## Metabase 데이터 (스키마 `winmate`, 읽기 전용 계정 `metabase_ro`)

| 뷰 | 한 행 |
|---|---|
| `v_llm_calls` | 실제 모델 요청 1건 (토큰 · 지연 · 오류 · `langfuse_url`) |
| `v_daily_ai_usage` · `v_daily_activity` | 날짜(KST) × 기능 × 모델 / 날짜별 활성 사용자 · 방문 · 작업 · 오류 |
| `v_user_activity` | 사용자 (최근 30일 방문 · 동작 · AI 작업 · 토큰 · 오류, 제안서 · VOC 수) |
| `v_jobs` | 서버 AI 작업 1건 (rfp · requirements · layout · storyboard · review) |
| `v_errors` | 오류 스팬 (HTTP · 브라우저 · 작업 · 모델) |
| `v_proposals` | 제안서 (고객사 · 업종 · 단계 · 목차 · 장표 · 제품 · 솔루션 · PPT 내보냄) |
| `v_voc` | 고객의 소리 (상태 · 경과 시간 · 연결된 제안서) |

원본 테이블: `users` · `spans` · `history`(문서 요약 JSON) · `proposals` · `customer_voice` · `sync_status`. 고객의 소리 상태 변경은 지금처럼 Winmate 관리자 화면에서 한다(Metabase는 사본을 읽기만 함).

`metabase-init`은 대시보드가 이미 있으면 건드리지 않는다. 다시 만들려면 Metabase에서 대시보드를 지우고 `bash ops/start.sh`.

## 주의

- 루트 `.env`의 운영 비밀값을 지우면 기존 볼륨의 비밀번호와 맞지 않는다(시작 스크립트가 멈춘다). 전부 새로 시작하려면 `docker compose -p winmate-ops down -v` 후 `.env`에서 운영 비밀값 줄을 지우고 다시 실행.
- 데이터 위치: Docker 볼륨 `winmate-ops_*`(Langfuse Postgres · ClickHouse · MinIO, Metabase · 분석 Postgres). 백업은 볼륨 단위로.
- 라이선스: Langfuse MIT(이미지에 EE 코드 포함, 라이선스 키 없이 OSS 기능만), Metabase OSS AGPL-3.0 — 수정 없이 별도 서비스로 쓴다. 사내 오픈소스 정책 확인 대상.
- 이미지 버전은 루트 `.env.example`에 전부 고정(Langfuse 4.79.0 · Metabase v0.65.4.3 · ClickHouse 26.3.62.3 · Postgres 17.12 · Redis 7.4.12 · MinIO digest · Python 3.12.16-slim).
