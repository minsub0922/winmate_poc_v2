# README.md 에 9차(Best Scenario 사진 중심 전환) 반영 — python3 build/bs/readme_patch.py <README 경로>
# 다른 세션이 README 를 같이 고치므로 줄 단위로 필요한 곳만 바꾼다(이미 반영돼 있으면 그대로).
import sys, re
p = sys.argv[1]
s = open(p, encoding='utf8').read()
if '9차(Best Scenario 사진 중심 전환)' not in s:
    lines = s.split('\n')
    i = next(i for i, l in enumerate(lines) if l.startswith('- 8차(솔루션 유저 시나리오)'))
    lines.insert(i + 1, '- 9차(Best Scenario 사진 중심 전환): Best Scenario 21개 덱 308장을 전부 그려 보고, 글 · 표 위주 장 207장을 사진 중심 레이아웃으로 바꿔 그 칸에 맞게 다시 채웠어요(라이브러리에서 이미 대체된 사진 버전 · 6~8차 사진 버전 · 업종 사진 버전 · 사진 표지 C01 / C02 / C08 · 사진 목차 C10). 대체할 사진 레이아웃이 없던 장은 원래 장의 글 칸 번호를 그대로 두고 사진 칸만 더한 새 레이아웃으로 — LED 피치 · 시청 거리(L_PH_SD_G, 관람 공간 사진 위 거리 자) · 예상 질문(L_PH_QA_A, 질문마다 근거 사진) · 표준 제안서 AI 맞춤 환경 · 고객 분석 · 4단계 프로세스(L_PH_AIS_08 · 25 · 35). 원래 장은 data.js RETIRED. 구성도 · 매립 치수 도면 · RFP 대응표 · 사양 · 인증 매트릭스처럼 그림 · 표가 본질인 장은 그대로 뒀어요. 사진은 samsung.com 도입사례 · 비즈니스 페이지 사진 우선(새로 가져온 사진은 시나리오별 묶음 img/fill/r9-<id>.json, 출처 src/fill_sources.md 9차 표), 한 덱 안에서 같은 사진은 한 번만. 도구 · 계획 · 검사: build/bs/(README.md 안내).')
    s = '\n'.join(lines)
s = re.sub(r'사진 중심 332\(photo_layouts\.js\) = 754', '사진 중심 334(photo_layouts.js) = 756', s)
s = s.replace('photo_layouts.js    사진 중심 레이아웃 332장', 'photo_layouts.js    사진 중심 레이아웃 334장')
open(p, 'w', encoding='utf8').write(s)
print('README ok')
