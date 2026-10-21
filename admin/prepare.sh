#!/usr/bin/env bash
set -euo pipefail
winmate_admin_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$winmate_admin_root"
if [[ ! -x app/.venv/bin/python || ! -d app/web/node_modules ]]; then
  echo '기존 Winmate 개발 의존성을 먼저 설치해 주세요 (app/README.md).' >&2
  exit 1
fi
if ! PYTHONPATH=admin/runtime/python app/.venv/bin/python -c 'import pymupdf, PIL' 2>/dev/null; then
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python app/.venv/bin/python --target admin/runtime/python -r admin/requirements.txt
  else
    app/.venv/bin/python -m pip install --target admin/runtime/python -r admin/requirements.txt
  fi
fi
node admin/build.mjs
