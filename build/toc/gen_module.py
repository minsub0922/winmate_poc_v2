# Write app/web/src/domain/templates/toc_layouts.js from layouts.py (TOC_META · TOC_HTML · TOC_SLOTS).
import json, sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import layouts
M, H, S = layouts.build()
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'app/web/src/domain/templates/toc_layouts.js')
head = ('// 목차 템플릿 시트 (L_TOC_*, 장표 구분 TC) — 사이드바 ‘목차 템플릿’의 시나리오가 표준 제안서에 없는 목차에 쓰는 장. 같은 목차 이름이면 같은 장을 다시 씀.\n'
        '// 표준 제안서와 이름이 같은 목차(Overview · AI 업종 · 공간별 제안 · 솔루션 · 도입사례 · Why Samsung)와 간지는 표준 제안서 장(L_VS_*)을 그대로 씀.\n'
        '// 규칙: 제목 한 줄 · 부제 · 각주 · 작은 설명 글 없음 · 사진 · 아이콘 · 숫자로 메시지를 보이게. 개수가 바뀌는 칸만 변형(…2 · …3 · …4)을 둠.\n'
        '// 아이콘: /assets/toc/icons/<기능 id>.on|off.png (Lucide, ISC)\n'
        '// 생성: Winmate 세션(2026-11-11) · 원본 빌더 build/toc/layouts.py (python3 build/toc/gen_module.py)\n')
body = ('export const TOC_META = ' + json.dumps(M, ensure_ascii=False) + ';\n'
        'export const TOC_HTML = ' + json.dumps(H, ensure_ascii=False) + ';\n'
        '// 칸 이름 → data-tb / data-img 번호 (시나리오 조립기가 씀)\n'
        'export const TOC_SLOTS = ' + json.dumps(S, ensure_ascii=False) + ';\n')
open(OUT, 'w').write(head + body)
print(len(M), 'layouts →', OUT, round(len(body) / 1024), 'KB')
