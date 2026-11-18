#!/bin/bash
# analytics-db 첫 초기화 때 한 번만 실행된다(postgres 이미지의 docker-entrypoint-initdb.d).
#   metabase  — Metabase 앱 DB (소유: metabase_app)
#   winmate   — Winmate 운영 데이터 사본 (적재: winmate_loader, 조회 전용: metabase_ro)
# 실행 권한 없이 복사되면 entrypoint가 이 파일을 source한다 — 옵션이 새지 않도록 서브셸에서 돈다.
(
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres \
  -v metabase_pw="$METABASE_DB_PASSWORD" \
  -v loader_pw="$ANALYTICS_LOADER_PASSWORD" \
  -v reader_pw="$ANALYTICS_READER_PASSWORD" <<'SQL'
CREATE ROLE metabase_app LOGIN PASSWORD :'metabase_pw';
CREATE ROLE winmate_loader LOGIN PASSWORD :'loader_pw';
CREATE ROLE metabase_ro LOGIN PASSWORD :'reader_pw';
CREATE DATABASE metabase OWNER metabase_app;
CREATE DATABASE winmate OWNER winmate_loader;
REVOKE ALL ON DATABASE metabase FROM PUBLIC;
REVOKE ALL ON DATABASE winmate FROM PUBLIC;
GRANT CONNECT ON DATABASE winmate TO metabase_ro;
SQL
psql -v ON_ERROR_STOP=1 --username postgres --dbname winmate <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA winmate AUTHORIZATION winmate_loader;
GRANT USAGE ON SCHEMA winmate TO metabase_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE winmate_loader IN SCHEMA winmate GRANT SELECT ON TABLES TO metabase_ro;
ALTER ROLE metabase_ro SET default_transaction_read_only = on;
ALTER ROLE metabase_ro SET search_path = winmate;
ALTER ROLE winmate_loader SET search_path = winmate;
SQL
)
