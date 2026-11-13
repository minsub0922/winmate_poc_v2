#!/usr/bin/env bash
# 백그라운드로 다시 띄우기 — 이 포트에 떠 있는 Winmate를 끄고 ./start.sh(설치 · 웹 빌드 · 점검 · 서버)를
# 터미널과 분리해 실행한다. 터미널을 닫아도 서버는 계속 돈다. 로그 app/data/runtime/server.log
#   make restart                 # 또는 app/scripts/restart.sh
#   tail -f app/data/runtime/server.log
#   make stop                    # 끄기
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
port="${WINMATE_API_PORT:-8788}"
log="app/data/runtime/server.log"
mkdir -p app/data/runtime

listening() { lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true; }
stop() {
  local pids; pids="$(listening)"
  [[ -z "$pids" ]] && return 0
  echo "기존 서버(포트 $port, pid $(echo $pids | tr '\n' ' '))를 끕니다."
  kill $pids 2>/dev/null || true
  for _ in $(seq 1 50); do [[ -z "$(listening)" ]] && return 0; sleep 0.2; done
  kill -9 $(listening) 2>/dev/null || true
}

if [[ "${1:-}" == "--stop" ]]; then stop; exit 0; fi
stop

# 터미널과 분리해 실행(nohup) — start.sh는 마지막에 uvicorn으로 exec하므로 이 pid가 서버 pid가 된다
nohup ./start.sh > "$log" 2>&1 < /dev/null &
pid=$!
echo "$pid" > app/data/runtime/server.pid
echo "백그라운드로 시작했어요 (pid $pid). 준비되면 알려 드릴게요 — 로그: $log"

for _ in $(seq 1 600); do
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
    echo "Winmate: http://127.0.0.1:$port  (로그: tail -f $log, 끄기: make stop)"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "시작하지 못했어요. 로그 마지막 부분:" >&2
    tail -n 30 "$log" >&2
    exit 1
  fi
  sleep 1
done
echo "아직 준비 중이에요. 진행 상황: tail -f $log"
