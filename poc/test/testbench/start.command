#!/bin/bash
# macOS: Finder 에서 더블클릭하면 테스트 벤치를 켭니다.
cd "$(dirname "$0")" && ./start.sh
echo; read -r -t 8 -p "이 창은 닫아도 서버는 계속 실행됩니다 (8초 뒤 자동으로 닫힘) " _
