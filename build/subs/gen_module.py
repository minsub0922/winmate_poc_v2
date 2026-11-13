# Write app/web/src/domain/templates/subs_layouts.js from build/subs/layouts.py (SUBS_META · SUBS_HTML · SUBS_SLOTS).
# 구독 레지스트리(app/data/subscriptions.json)가 바뀌면 다시 돌린다 — DSS DB 업데이트 skill 의 연관 자료 갱신 단계.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import layouts
M, H, S = layouts.build()
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'app/web/src/domain/templates/subs_layouts.js')
head = ('// B2B 삼성 AI 구독 시트 (L_SUB_*, 장표 구분 SU) — 목차 유형 subscription(구독 도입). 목차 템플릿 장(L_TOC_*)과 같은 디자인 체계.\n'
        '// 기본 글 · 사진 = 구독 레지스트리(app/data/subscriptions.json)의 원문 확인 사실. 추론 결제안은 \'협의안\' 칩, 금액은 [00].\n'
        '// 기간 한정 혜택 장(L_SUB_PROMO, meta.until)은 혜택이 끝나면 다음 DSS run 이 은퇴시킨다(services/catalog.js RETIRED_SUBS).\n'
        '// 생성: python3 build/subs/gen_module.py (원본 빌더 build/subs/layouts.py)\n')
body = ('export const SUBS_META = ' + json.dumps(M, ensure_ascii=False) + ';\n'
        'export const SUBS_HTML = ' + json.dumps(H, ensure_ascii=False) + ';\n'
        '// 칸 이름 → data-tb / data-img 번호 (목차 템플릿 조립기가 씀)\n'
        'export const SUBS_SLOTS = ' + json.dumps(S, ensure_ascii=False) + ';\n')
open(OUT, 'w').write(head + body)
print(len(M), 'layouts →', os.path.relpath(OUT), round(len(body) / 1024), 'KB')
