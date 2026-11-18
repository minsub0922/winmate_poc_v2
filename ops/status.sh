#!/usr/bin/env bash
# Winmate 운영 모니터링 상태: 컨테이너 · 헬스 · Winmate 쪽 전송 · Metabase 적재
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.homebrew/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! docker info >/dev/null 2>&1 && [[ -S "$HOME/.colima/default/docker.sock" ]]; then export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"; fi
grep -q '^LANGFUSE_POSTGRES_PASSWORD=.' .env 2>/dev/null || { echo '루트 .env에 운영 설정이 없습니다 — bash ops/start.sh로 켜세요.'; exit 1; }
get() { grep "^$1=" .env | tail -1 | cut -d= -f2-; }
compose() { docker compose -f ops/docker-compose.yml --env-file .env "$@"; }
# bash ops/status.sh --logs [서비스…]  → 로그 따라 보기
if [[ "${1:-}" == --logs ]]; then shift; compose logs -f --tail=100 "$@"; exit; fi
compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
echo
for pair in "Langfuse:$(get LANGFUSE_PORT):/api/public/health" "Metabase:$(get METABASE_PORT):/api/health"; do
  IFS=: read -r name port path <<<"$pair"
  if body=$(curl -fsS --noproxy '*' "http://127.0.0.1:$port$path" 2>/dev/null); then echo "$name  http://localhost:$port  OK  $body"; else echo "$name  http://localhost:$port  응답 없음"; fi
done
echo
if [[ -f app/data/runtime/ops-bridge.json ]]; then
  echo 'Winmate → ops (app/data/runtime/ops-bridge.json):'
  python3 - <<'PY'
import json, time
s = json.load(open('app/data/runtime/ops-bridge.json'))
lf, an = s.get('langfuse', {}), s.get('analytics', {})
ago = lambda t: f'{int(time.time() - t)}초 전' if t else '-'
print(f"  갱신 {ago(s.get('updated_at'))}")
print(f"  Langfuse  {'켜짐' if lf.get('enabled') else '꺼짐'}  보냄 {lf.get('sent', 0)} · 버림 {lf.get('dropped', 0)} · 마지막 성공 {ago(lf.get('last_ok_at'))}" + (f" · 오류 {lf.get('last_error')}" if lf.get('last_error') else ''))
print(f"  스냅샷    {'켜짐' if an.get('enabled') else '꺼짐'}  마지막 {ago(an.get('last_snapshot_at'))} · 행 {an.get('rows', {})}" + (f" · 오류 {an.get('last_error')}" if an.get('last_error') else ''))
PY
else
  echo 'Winmate 쪽 연결 상태 파일이 아직 없습니다 — Winmate를 다시 시작하면 생깁니다 (make restart).'
fi
echo
compose logs --no-color --no-log-prefix --tail=3 winmate-sync 2>/dev/null
