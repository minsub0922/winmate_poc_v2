#!/usr/bin/env bash
set -euo pipefail
winmate_admin_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$winmate_admin_root"
bash admin/prepare.sh
winmate_admin_port="${WINMATE_API_PORT:-8788}"
if ! [[ "$winmate_admin_port" =~ ^[0-9]+$ ]] || (( ${#winmate_admin_port} > 5 || 10#$winmate_admin_port < 1 || 10#$winmate_admin_port > 65535 )); then
  echo 'WINMATE_API_PORT는 1~65535 정수여야 합니다.' >&2; exit 1
fi
printf '\nWinmate: http://127.0.0.1:%s/\nAdmin:   http://127.0.0.1:%s/admin/\n\n' "$winmate_admin_port" "$winmate_admin_port"
exec app/.venv/bin/python -B -m uvicorn admin.server:app --host "${WINMATE_BIND_HOST:-127.0.0.1}" --port "$winmate_admin_port" --no-access-log
