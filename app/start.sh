#!/usr/bin/env bash
set -euo pipefail
winmate_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$winmate_root"
# 포트 · 바인딩: 셸 변수 > .env > .env.example
. app/scripts/ports.sh
winmate_env WINMATE_API_PORT WINMATE_BIND_HOST
export PYTHONDONTWRITEBYTECODE=1
command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || { echo 'Node.js와 npm이 필요합니다.' >&2; exit 1; }
if [[ ! -x app/.venv/bin/python ]]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv --python 3.12 app/.venv
  elif command -v python3.12 >/dev/null 2>&1; then
    python3.12 -m venv app/.venv
  else
    echo 'Python 3.12 또는 uv가 필요합니다.' >&2
    exit 1
  fi
fi
if command -v uv >/dev/null 2>&1; then
  uv pip install --python app/.venv/bin/python -r app/api/requirements.txt
else
  app/.venv/bin/python -m pip install -r app/api/requirements.txt
fi
if [[ ! -d app/web/node_modules ]]; then npm --prefix app/web ci --no-audit --no-fund; fi
app/.venv/bin/python -B app/scripts/prepare_data.py
app/.venv/bin/python -B app/scripts/build_spatial_products.py
node app/scripts/build_spatial_library.mjs
node app/scripts/export_agent_data.mjs
# 같은 그림 표(주소가 달라도 같은 사진) — 자동 구성 · 장별 AI 채우기가 한 제안서에 같은 사진을 두 번 쓰지 않게. 바뀐 그림만 다시 읽는다.
node app/scripts/build_picture_ids.mjs
npm --prefix app/web run build
app/.venv/bin/python -B app/scripts/preflight.py
if [[ -n "${WINMATE_SETUP_PASSWORD:-}" ]]; then
  app/.venv/bin/python -B app/scripts/manage_auth.py --ensure --password-env WINMATE_SETUP_PASSWORD
  unset WINMATE_SETUP_PASSWORD
else
  app/.venv/bin/python -B app/scripts/manage_auth.py --ensure
fi
app/.venv/bin/python -B app/scripts/preflight.py --require-auth
# 이미지 캐시 Redis(.env의 WINMATE_CACHE_*). 띄우지 못해도 서버는 메모리 캐시로 시작하고, 나중에 띄우면 1분 안에 연결한다.
if app/.venv/bin/python -B -c "from app.api.image_cache import load_cache_config; raise SystemExit(load_cache_config().backend != 'redis')"; then
  bash app/scripts/cache_redis.sh up || echo '경고: 이미지 캐시 Redis를 띄우지 못해 메모리 캐시로 시작합니다.' >&2
fi
winmate_asgi_app='app.api.main:app'
# The versioned admin marker enables /admin on the same server and port.
if [[ -f admin/.enabled && -f admin/server.py && -f admin/prepare.sh ]]; then
  bash admin/prepare.sh
  winmate_asgi_app='admin.server:app'
fi
printf '\nWinmate: http://127.0.0.1:%s\n\n' "$WINMATE_API_PORT"
exec app/.venv/bin/python -B -m uvicorn "$winmate_asgi_app" --host "$WINMATE_BIND_HOST" --port "$WINMATE_API_PORT" --no-access-log
