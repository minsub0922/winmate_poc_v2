#!/bin/bash
# Finder에서 더블클릭하면 Terminal에서 ops/start.sh를 실행한다.
cd "$(dirname "$0")/.." && bash ops/start.sh
