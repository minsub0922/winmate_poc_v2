#!/bin/bash
# 포트 · 바인딩 값 읽기 — 기본값은 루트 .env.example 「포트 · 바인딩」 구역에만 있다(코드에 숫자를 두지 않는다).
# 우선순위: 셸 변수 > 루트 .env > 사내 등록본 .env.inhouse > 루트 .env.example
# source 해서 쓴다(macOS 기본 bash 3.2 호환):
#   . app/scripts/ports.sh && winmate_env WINMATE_API_PORT WINMATE_BIND_HOST
# 읽은 값은 export 하므로 이 셸이 띄우는 Python · Node · docker compose가 그대로 받는다.
_winmate_env_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

winmate_env() {
  local key file value
  for key in "$@"; do
    value="${!key:-}"
    for file in "$_winmate_env_root/.env" "$_winmate_env_root/.env.inhouse" "$_winmate_env_root/.env.example"; do
      [[ -z "$value" && -f "$file" ]] || continue
      value="$(grep -E "^$key=" "$file" | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
      value="${value%\"}"; value="${value#\"}"
    done
    if [[ -z "$value" ]]; then
      echo "${key} 값이 없습니다 — 루트 .env.example의 「포트 · 바인딩」 구역을 확인하세요." >&2
      return 1
    fi
    if [[ "$key" == *_PORT ]] && { ! [[ "$value" =~ ^[0-9]+$ ]] || (( ${#value} > 5 || 10#$value < 1 || 10#$value > 65535 )); }; then
      echo "${key}는 1~65535 정수여야 합니다." >&2
      return 1
    fi
    export "$key=$value"
  done
}
