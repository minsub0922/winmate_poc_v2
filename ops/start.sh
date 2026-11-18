#!/usr/bin/env bash
# Winmate 운영 모니터링(Langfuse · Metabase) 켜기 — 다시 실행해도 안전하다.
#   bash ops/start.sh        (또는 Finder에서 ops/start.command 더블클릭)
#
# 1) Docker(Colima) 확인 · 메모리 점검
# 2) 루트 .env.example의 「운영 모니터링」 구역 · 「포트 · 바인딩」의 ops 항목 → 루트 .env (없거나 빈 항목만 채움, 비밀값은 생성)
# 3) 포트 점검   4) 컨테이너 기동 · 헬스 확인   5) Metabase 초기 설정 결과
# Winmate 쪽 연결(Langfuse 전송 · Metabase용 스냅샷)은 Winmate를 다시 시작할 때 적용된다: make restart
#   OPS_RESTART_WINMATE=1 bash ops/start.sh  → 마지막에 Winmate까지 다시 시작
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.homebrew/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p ops/data/snapshots ops/data/logs
chmod +x ops/*.command ops/*.sh 2>/dev/null || true   # 복사 · 압축 해제로 실행 권한이 빠졌을 때(더블클릭용)
log="ops/data/logs/start-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$log") 2>&1
say() { printf '\n▸ %s\n' "$*"; }
fail() { printf '\n✗ %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 1. Docker
say 'Docker 확인'
command -v docker >/dev/null 2>&1 || fail 'docker 명령이 없습니다. Colima 사용 시: brew install docker docker-compose colima'
if ! docker info >/dev/null 2>&1; then
  if [[ -S "$HOME/.colima/default/docker.sock" ]]; then export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"; fi
fi
if ! docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1; then
    echo 'Colima가 꺼져 있어 켭니다 (설정은 바꾸지 않음).'
    colima start
  fi
fi
docker info >/dev/null 2>&1 || fail 'Docker 엔진에 연결할 수 없습니다. Colima/Docker Desktop을 켠 뒤 다시 실행하세요.'
docker compose version >/dev/null 2>&1 || fail 'docker compose 플러그인이 필요합니다 (brew install docker-compose).'
mem=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)
mem_gb=$(awk -v b="$mem" 'BEGIN{printf "%.1f", b/1073741824}')
echo "Docker 메모리: ${mem_gb} GiB"
if [[ "${OPS_SKIP_MEMORY_CHECK:-0}" != 1 ]] && awk -v b="$mem" 'BEGIN{exit !(b < 5.5*1073741824)}'; then
  fail "Docker VM 메모리가 ${mem_gb} GiB라 Langfuse(ClickHouse 포함)와 Metabase를 함께 띄우기에 부족합니다(권장 8 GiB).
  Colima: colima stop && colima start --cpu 4 --memory 8   (이미 떠 있는 다른 컨테이너도 함께 재시작됩니다)
  그대로 진행하려면: OPS_SKIP_MEMORY_CHECK=1 bash ops/start.sh"
fi

# ---------------------------------------------------------------- 2. 루트 .env
say '구성 · 비밀값 (루트 .env.example 「운영 모니터링」 → 루트 .env)'
example=.env.example
env_file=.env
# 운영 스택이 쓰는 항목만 다룬다 — 앱 · 실험 도구 설정(LLM 키 등)은 건드리지 않는다
ops_keys='^(OPS_|LANGFUSE_|METABASE_|CLICKHOUSE_|MINIO_|ANALYTICS_|SYNC_|WINMATE_LANGFUSE|WINMATE_ANALYTICS_|POSTGRES_IMAGE_TAG$|REDIS_IMAGE_TAG$|PYTHON_IMAGE$)'
[[ -f "$example" ]] || fail "$example이 없습니다."
touch "$env_file"; chmod 600 "$env_file"
get() { grep "^$1=" "$env_file" | tail -1 | cut -d= -f2- || true; }
set_value() {  # KEY VALUE — 그 키의 줄을 바꾸고(없으면 끝에 추가) 다른 줄은 그대로 둔다
  local tmp; tmp=$(mktemp "$env_file.XXXXXX")
  awk -v k="$1" -v v="$2" 'index($0, k "=") == 1 {print k "=" v; done = 1; next} {print} END {if (!done) print k "=" v}' "$env_file" > "$tmp"
  chmod 600 "$tmp"; mv -f "$tmp" "$env_file"
}
hex() { openssl rand -hex "$1"; }
secret() {  # .env.example에서 값이 빈 항목 — 이름으로 형식을 정한다
  case $1 in
    LANGFUSE_HOST) printf 'http://127.0.0.1:%s' "$(get LANGFUSE_PORT)" ;;
    LANGFUSE_PUBLIC_KEY) printf 'pk-lf-%s' "$(hex 16)" ;;
    LANGFUSE_SECRET_KEY) printf 'sk-lf-%s' "$(hex 16)" ;;
    *_ADMIN_PASSWORD) printf 'Wm-%s' "$(hex 10)" ;;
    *_PASSWORD) hex 16 ;;
    *) hex 32 ;;
  esac
}
had_secrets=$(grep -c '^LANGFUSE_POSTGRES_PASSWORD=.' "$env_file" || true)
if [[ $had_secrets == 0 ]] && docker volume inspect winmate-ops_langfuse_postgres_data >/dev/null 2>&1; then
  fail "이전에 만든 데이터 볼륨이 남아 있는데 루트 .env에 운영 비밀값이 없습니다(새로 만들면 비밀번호가 맞지 않음).
  이전 값을 .env에 되돌려 놓거나, 기존 Langfuse · Metabase 데이터를 지우려면:
  docker compose -p winmate-ops down -v   (그 다음 다시 실행)"
fi
added=''
re='^([A-Z][A-Z0-9_]*)=(.*)$'
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ $line =~ $re ]] || continue
  key=${BASH_REMATCH[1]}
  value=${BASH_REMATCH[2]}
  [[ $key =~ $ops_keys ]] || continue
  [[ -n "$(get "$key")" ]] && continue      # 이미 값이 있으면 절대 바꾸지 않음
  [[ -n "$value" ]] || value=$(secret "$key")
  set_value "$key" "$value"
  added="$added $key"
done < "$example"
if [[ -n "$added" ]]; then echo "루트 .env에 채움:$added"; else echo '루트 .env의 운영 설정을 그대로 사용합니다.'; fi
bind=$(get OPS_BIND); lf_port=$(get LANGFUSE_PORT); mb_port=$(get METABASE_PORT)
for p in "$lf_port" "$mb_port"; do [[ "$p" =~ ^[0-9]+$ ]] && (( p >= 1024 && p <= 65535 )) || fail "포트 값이 올바르지 않습니다: $p"; done
local_host='^http://(127\.0\.0\.1|localhost):[0-9]+/?$'
host=$(get LANGFUSE_HOST)
if [[ $host =~ $local_host && $host != "http://127.0.0.1:$lf_port" ]]; then
  set_value LANGFUSE_HOST "http://127.0.0.1:$lf_port"
  echo "LANGFUSE_HOST를 Langfuse 포트($lf_port)에 맞췄습니다."
fi

# ---------------------------------------------------------------- 3. 포트
say "포트 확인 (Langfuse $lf_port · Metabase $mb_port)"
compose() { docker compose -f ops/docker-compose.yml --env-file "$env_file" "$@"; }
running=$(compose ps --status running --services 2>/dev/null || true)
for pair in "langfuse-web:$lf_port" "metabase:$mb_port"; do
  svc=${pair%%:*}; port=${pair##*:}
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && ! grep -qx "$svc" <<<"$running"; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN | head -3
    fail "포트 $port을 다른 프로그램이 쓰고 있습니다. 루트 .env에서 ${svc%%-*} 포트를 바꾼 뒤 다시 실행하세요."
  fi
done
echo '사용 가능'

# ---------------------------------------------------------------- 4. 기동
say '컨테이너 기동 (처음에는 이미지 내려받기로 몇 분 걸립니다)'
up_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [[ "${OPS_NO_BUILD:-0}" != 1 ]] || ! docker image inspect winmate-ops/sync:1 >/dev/null 2>&1; then
  compose build winmate-sync
fi
# 설정 파일 · 스냅샷은 이 폴더에서 바인드 마운트한다 — Docker VM(Colima)이 이 경로를 공유하는지 먼저 확인
if ! docker run --rm --network none -v "$PWD/ops:/ops:ro" winmate-ops/sync:1 \
     sh -c 'test -r /ops/metabase/init.py && test -r /ops/clickhouse/metabase-user.xml && test -r /ops/postgres/init.sh && test -d /ops/data/snapshots'; then
  fail "Docker가 이 폴더($PWD/ops)를 볼 수 없습니다. Colima는 기본으로 홈 폴더만 공유합니다.
  ~/.colima/default/colima.yaml의 mounts에 이 경로를 추가하고 colima restart 후 다시 실행하세요."
fi
compose up -d --remove-orphans
wait_http() {  # name url seconds
  local name=$1 url=$2 limit=$3 waited=0
  printf '%s 준비 중' "$name"
  until curl -fsS -o /dev/null --noproxy '*' "$url"; do
    (( waited >= limit )) && { echo; return 1; }
    printf '.'; sleep 5; waited=$((waited + 5))
  done
  echo ' 완료'
}
wait_http Langfuse "http://127.0.0.1:$lf_port/api/public/health" 600 || { compose logs --tail=40 langfuse-web; fail 'Langfuse가 응답하지 않습니다.'; }
wait_http Metabase "http://127.0.0.1:$mb_port/api/health" 900 || { compose logs --tail=40 metabase; fail 'Metabase가 응답하지 않습니다.'; }

say 'Metabase 초기 설정'
for _ in $(seq 1 120); do
  state=$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$(compose ps -a -q metabase-init 2>/dev/null | head -1)" 2>/dev/null || echo 'none 0')
  [[ $state == exited* ]] && break
  sleep 5
done
compose logs --no-color --no-log-prefix --since "$up_at" metabase-init 2>/dev/null | tail -12
[[ $state == 'exited 0' ]] || echo '(Metabase 초기 설정이 끝나지 않았거나 실패했습니다 — 위 로그를 확인하세요: bash ops/status.sh --logs)'

# ---------------------------------------------------------------- 5. Winmate
say 'Winmate'
if [[ "${OPS_RESTART_WINMATE:-0}" == 1 ]]; then
  bash app/scripts/restart.sh
elif . app/scripts/ports.sh && winmate_env WINMATE_API_PORT && curl -fsS -o /dev/null --noproxy '*' "http://127.0.0.1:$WINMATE_API_PORT/api/health" 2>/dev/null; then
  echo 'Winmate가 실행 중입니다. 다시 시작하면 Langfuse 전송과 Metabase용 스냅샷이 켜집니다: make restart'
else
  echo 'Winmate가 꺼져 있습니다. 다음에 ./start.sh 또는 make restart로 켜면 자동으로 연결됩니다.'
fi

cat <<EOF

────────────────────────────────────────────────────────
 Langfuse  http://localhost:$lf_port   (계정 $(get OPS_ADMIN_EMAIL), 비밀번호: 루트 .env LANGFUSE_ADMIN_PASSWORD)
 Metabase  http://localhost:$mb_port   (계정 $(get OPS_ADMIN_EMAIL), 비밀번호: 루트 .env METABASE_ADMIN_PASSWORD)
 바인딩    $bind  (같은 네트워크의 다른 기기에서 열려면 루트 .env의 OPS_BIND=0.0.0.0)
 상태      bash ops/status.sh · 로그 bash ops/status.sh --logs · 끄기 bash ops/stop.sh
 기록      $log
────────────────────────────────────────────────────────
EOF
