#!/usr/bin/env bash
# 이미지 캐시 Redis를 루트 .env 설정 그대로 띄운다/멈춘다/확인한다.
#   bash app/scripts/cache_redis.sh install | up | down | status
# 설정 해석은 서버와 같은 코드(app/api/image_cache.py)를 쓴다 — maxmemory는 3gb를 넘지 않고, 정책은 축출 정책만 허용.
# Docker가 있으면 app/compose.cache.yml, 없으면 같은 옵션으로 redis-server를 직접 실행한다(pid · 로그는 app/data/runtime).
# redis-server 순서: WINMATE_REDIS_SERVER → PATH → npm으로 빌드한 것(install: redis-memory-server가 .env의
# WINMATE_CACHE_REDIS_VERSION 소스를 받아 app/data/runtime/redis-bin/<버전>/redis-server로 컴파일, brew 불필요).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
python=app/.venv/bin/python
[[ -x "$python" ]] || python=python3
action="${1:-status}"

eval "$("$python" -B - <<'PY'
import shlex, sys
sys.path.insert(0, '.')
from urllib.parse import urlsplit
from app.api.image_cache import load_cache_config
c = load_cache_config()
url = urlsplit(c.redis_url) if c.redis_url else None
port = (url.port or 6379) if url else 6380
host = url.hostname if url else '127.0.0.1'
for key, value in {'CACHE_BACKEND': c.backend, 'CACHE_URL_SET': '1' if c.redis_url else '', 'CACHE_HOST': host, 'CACHE_PORT': port,
                   'CACHE_MAXMEMORY': c.maxmemory, 'CACHE_POLICY': c.policy, 'CACHE_VERSION': c.redis_version,
                   'CACHE_WARNINGS': ' / '.join(c.warnings)}.items():
    print(f'{key}={shlex.quote(str(value))}')
PY
)"
[[ -n "$CACHE_WARNINGS" ]] && echo "경고: ${CACHE_WARNINGS}" >&2
if [[ "$action" != status && "$action" != install && -z "$CACHE_URL_SET" ]]; then
  echo '루트 .env에 WINMATE_CACHE_REDIS_URL이 없습니다(.env.example의 "이미지 캐시" 구역 참조).' >&2; exit 1
fi
case "$CACHE_HOST" in 127.0.0.1|localhost|::1) ;; *)
  [[ "$action" == status ]] || { echo "원격 Redis(${CACHE_HOST})는 이 스크립트로 띄우지 않습니다. 그 Redis에 maxmemory · 정책을 설정하세요(서버가 시작할 때 확인)." >&2; exit 1; } ;;
esac
runtime=app/data/runtime; mkdir -p "$runtime"
pidfile="$runtime/cache-redis.pid"
export WINMATE_CACHE_REDIS_PORT="$CACHE_PORT" WINMATE_CACHE_REDIS_MAXMEMORY_BYTES="$CACHE_MAXMEMORY" WINMATE_CACHE_REDIS_POLICY="$CACHE_POLICY" \
  WINMATE_CACHE_REDIS_VERSION="$CACHE_VERSION"
compose() { docker compose -p winmate-cache -f app/compose.cache.yml "$@"; }
has_docker() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }
npm_bin="$root/$runtime/redis-bin/$CACHE_VERSION/redis-server"
redis_bin="${WINMATE_REDIS_SERVER:-$(command -v redis-server || true)}"
[[ -z "$redis_bin" && -x "$npm_bin" ]] && redis_bin="$npm_bin"

# npm 패키지 redis-memory-server로 .env 버전의 Redis를 소스에서 빌드한다(한 번, 1분 안팎). C 컴파일러 · make가 필요하다.
# macOS에서 Xcode 라이선스 미동의로 make가 막혀 있으면 Command Line Tools로 우회한다.
install_redis() {
  if [[ -x "$npm_bin" ]]; then echo "이미 빌드됨: $npm_bin"; return 0; fi
  if ! make -v >/dev/null 2>&1 && [[ -x /Library/Developer/CommandLineTools/usr/bin/make ]]; then
    export DEVELOPER_DIR=/Library/Developer/CommandLineTools
  fi
  if [[ ! -d node_modules/redis-memory-server ]]; then
    npm install --no-audit --no-fund || npm install --no-audit --no-fund --cache "$root/$runtime/npm-cache"
  fi
  echo "Redis ${CACHE_VERSION} 빌드 중(npm redis-memory-server)…" >&2
  REDISMS_DISABLE_POSTINSTALL=1 node -e '
    const RedisBinary = require("redis-memory-server/lib/util/RedisBinary").default;
    RedisBinary.getPath({ version: process.argv[1], downloadDir: process.argv[2] })
      .then(p => console.log("빌드 완료: " + p)).catch(e => { console.error("Redis 빌드 실패: " + e.message); process.exit(1); });
  ' "$CACHE_VERSION" "$root/$runtime/redis-bin"
  [[ -x "$npm_bin" ]]
}

case "$action" in
  install) install_redis ;;
  up)
    if ! has_docker && [[ -z "$redis_bin" ]]; then install_redis && redis_bin="$npm_bin" || true; fi
    if has_docker; then
      compose up -d --wait
    elif [[ -n "$redis_bin" ]]; then
      if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then echo "이미 실행 중 (pid $(cat "$pidfile"))"; else
        "$redis_bin" --port "$CACHE_PORT" --bind 127.0.0.1 --maxmemory "$CACHE_MAXMEMORY" --maxmemory-policy "$CACHE_POLICY" \
          --maxmemory-samples 10 --save '' --appendonly no --daemonize yes --pidfile "$root/$pidfile" --logfile "$root/$runtime/cache-redis.log" --dir "$root/$runtime"
      fi
    else
      echo 'Docker 또는 redis-server가 필요합니다(npm 빌드도 실패). 없으면 서버는 프로세스 내 메모리 캐시(WINMATE_CACHE_MEMORY_MAX_BYTES)로 동작합니다.' >&2; exit 1
    fi
    printf '이미지 캐시 Redis: 127.0.0.1:%s · maxmemory %s bytes · %s\n' "$CACHE_PORT" "$CACHE_MAXMEMORY" "$CACHE_POLICY" ;;
  down)
    if has_docker && compose ps -q 2>/dev/null | grep -q .; then compose down; fi
    if [[ -f "$pidfile" ]]; then kill "$(cat "$pidfile")" 2>/dev/null || true; rm -f "$pidfile"; fi ;;
  status)
    printf 'backend=%s endpoint=%s:%s maxmemory=%s policy=%s version=%s redis-server=%s\n' "$CACHE_BACKEND" "$CACHE_HOST" "$CACHE_PORT" \
      "$CACHE_MAXMEMORY" "$CACHE_POLICY" "$CACHE_VERSION" "${redis_bin:-(없음 — install로 빌드)}"
    . app/scripts/ports.sh && winmate_env WINMATE_API_PORT
    port="$WINMATE_API_PORT"
    curl -fsS "http://127.0.0.1:$port/api/spatial/previews/status" 2>/dev/null || echo "(앱이 127.0.0.1:${port}에서 실행 중이 아니어서 서버 측 상태는 생략)" ;;
  *) echo "사용법: $0 install|up|down|status" >&2; exit 2 ;;
esac
