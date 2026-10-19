#!/usr/bin/env bash
set -euo pipefail
winmate_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$winmate_root"
export WINMATE_API_PORT="${WINMATE_API_PORT:-8788}"
export PYTHONDONTWRITEBYTECODE=1
if ! [[ "$WINMATE_API_PORT" =~ ^[0-9]+$ ]] || (( ${#WINMATE_API_PORT} > 5 || 10#$WINMATE_API_PORT < 1 || 10#$WINMATE_API_PORT > 65535 )); then
  echo 'WINMATE_API_PORT는 1~65535 정수여야 합니다.' >&2; exit 1
fi
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
npm --prefix app/web run build
app/.venv/bin/python -B app/scripts/prepare_data.py
node app/scripts/export_agent_data.mjs
app/.venv/bin/python -B app/scripts/preflight.py
if [[ -n "${WINMATE_SETUP_PASSWORD:-}" ]]; then
  app/.venv/bin/python -B app/scripts/manage_auth.py --ensure --password-env WINMATE_SETUP_PASSWORD
  unset WINMATE_SETUP_PASSWORD
else
  app/.venv/bin/python -B app/scripts/manage_auth.py --ensure
fi
app/.venv/bin/python -B app/scripts/preflight.py --require-auth
printf '\nWinmate: http://127.0.0.1:%s\n\n' "$WINMATE_API_PORT"
exec app/.venv/bin/python -B -m uvicorn app.api.main:app --host 127.0.0.1 --port "$WINMATE_API_PORT" --no-access-log
