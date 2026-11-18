#!/usr/bin/env bash
# Winmate 운영 모니터링 끄기. 데이터(Docker 볼륨)는 남는다.
#   bash ops/stop.sh            컨테이너 정지
#   bash ops/stop.sh --down     컨테이너 제거(데이터 볼륨은 유지)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.homebrew/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! docker info >/dev/null 2>&1 && [[ -S "$HOME/.colima/default/docker.sock" ]]; then export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"; fi
grep -q '^LANGFUSE_POSTGRES_PASSWORD=.' .env 2>/dev/null || { echo '루트 .env에 운영 설정이 없습니다 — 아직 켠 적이 없습니다.'; exit 0; }
compose() { docker compose -f ops/docker-compose.yml --env-file .env "$@"; }
if [[ "${1:-}" == "--down" ]]; then
  compose down
else
  compose stop
fi
echo 'Langfuse · Metabase를 껐습니다. Winmate는 그대로 동작합니다(전송 실패는 건너뜀). 다시 켜기: bash ops/start.sh'
