#!/bin/bash
# Finder에서 더블클릭하면 Langfuse · Metabase를 끈다(데이터는 유지).
cd "$(dirname "$0")/.." && bash ops/stop.sh
