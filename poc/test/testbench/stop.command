#!/bin/bash
# 테스트 벤치 끄기
cd "$(dirname "$0")" || exit 1
PORT="${TESTBENCH_PORT:-8787}"
if [ -f server.pid ] && kill "$(cat server.pid)" 2>/dev/null; then echo "껐습니다"; rm -f server.pid; exit 0; fi
PID=$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)
[ -n "$PID" ] && kill $PID && echo "껐습니다(포트 $PORT)" || echo "실행 중인 서버가 없습니다"
