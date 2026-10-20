#!/bin/bash
# Winmate PoC 테스트 벤치 — 처음 한 번 가상환경을 만들고, 서버를 백그라운드로 띄운다(창을 닫아도 계속 실행).
#   ./start.sh            → http://127.0.0.1:8787
#   TESTBENCH_PORT=9000 ./start.sh
cd "$(dirname "$0")" || exit 1
PORT="${TESTBENCH_PORT:-8787}"
export TESTBENCH_PORT="$PORT"
URL="http://127.0.0.1:$PORT"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "이미 $PORT 포트에서 실행 중입니다 → $URL"
  command -v open >/dev/null && open "$URL"
  exit 0
fi

find_uv() {
  for c in "$(command -v uv 2>/dev/null)" "$HOME/.local/bin/uv" "$HOME/.cargo/bin/uv" /opt/homebrew/bin/uv /usr/local/bin/uv; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }
  done
}
UV="$(find_uv)"

need_install=0
[ -x .venv/bin/python ] || need_install=1
if [ -f .venv/.req-stamp ] && ! cmp -s <(cat requirements.txt ../layout_agent/requirements.txt) .venv/.req-stamp; then need_install=1; fi

if [ "$need_install" = 1 ]; then
  echo "가상환경을 준비합니다(처음 한 번, 1~2분)…"
  if [ -z "$UV" ]; then
    PYV=$(python3 -c 'import sys; print(sys.version_info >= (3, 10))' 2>/dev/null)
    if [ "$PYV" != "True" ]; then
      echo "Python 3.10 이상이 없어 uv 를 설치합니다(https://astral.sh/uv)…"
      curl -LsSf https://astral.sh/uv/install.sh | sh || { echo "uv 설치 실패 — Python 3.11+ 를 설치한 뒤 다시 실행하세요"; exit 1; }
      UV="$(find_uv)"
    fi
  fi
  if [ -n "$UV" ]; then
    [ -x .venv/bin/python ] || "$UV" venv --python 3.12 .venv || exit 1
    VIRTUAL_ENV="$PWD/.venv" "$UV" pip install -r requirements.txt || exit 1
  else
    [ -x .venv/bin/python ] || python3 -m venv .venv || exit 1
    .venv/bin/python -m pip install -q -U pip && .venv/bin/python -m pip install -r requirements.txt || exit 1
  fi
  cat requirements.txt ../layout_agent/requirements.txt > .venv/.req-stamp
fi

PYTHONDONTWRITEBYTECODE=1 nohup .venv/bin/python server.py > server.log 2>&1 &
echo $! > server.pid
for _ in $(seq 1 30); do
  sleep 1
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "실행 중 → $URL   (로그: testbench/server.log · 끄기: stop.command)"
    command -v open >/dev/null && open "$URL"
    exit 0
  fi
done
echo "서버가 뜨지 않았습니다 — server.log 를 확인하세요"; tail -20 server.log; exit 1
