#!/usr/bin/env bash
set -euo pipefail
winmate_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$winmate_root"
command -v cloudflared >/dev/null 2>&1 || { echo 'cloudflared가 필요합니다.' >&2; exit 1; }
export WINMATE_API_PORT="${WINMATE_API_PORT:-8788}"
app/.venv/bin/python -B - <<'PY'
import json, os, urllib.request
port = os.environ['WINMATE_API_PORT']
if not port.isascii() or not port.isdigit() or not 1 <= int(port) <= 65535:
    raise SystemExit('WINMATE_API_PORT는 1~65535 정수여야 합니다.')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
try:
    with opener.open(f'http://127.0.0.1:{port}/api/auth/status', timeout=5) as response:
        status = json.load(response)
    if not status.get('enabled') or not status.get('configured'):
        raise SystemExit('외부 연결에는 설정된 로그인 계정이 필요합니다.')
except OSError as exc:
    raise SystemExit(f'앱에 연결할 수 없습니다. 먼저 ./start.sh를 실행하세요. ({type(exc).__name__})')
PY
exec cloudflared tunnel --url "http://127.0.0.1:$WINMATE_API_PORT" --no-autoupdate --protocol http2
