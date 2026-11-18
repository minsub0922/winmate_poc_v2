#!/usr/bin/env bash
set -euo pipefail
winmate_admin_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$winmate_admin_root"
bash admin/prepare.sh
. app/scripts/ports.sh
winmate_env WINMATE_API_PORT WINMATE_BIND_HOST
winmate_admin_port="$WINMATE_API_PORT"
printf '\nWinmate: http://127.0.0.1:%s/\nAdmin:   http://127.0.0.1:%s/admin/\n\n' "$winmate_admin_port" "$winmate_admin_port"
exec app/.venv/bin/python -B -m uvicorn admin.server:app --host "$WINMATE_BIND_HOST" --port "$winmate_admin_port" --no-access-log
