# README.md — 히스토리 예시 개편(2026-10-19) 반영. 최신 README 에 여러 번 돌려도 같은 결과.
import re, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'README.md'
s = open(p, encoding='utf8').read()
def sub(old, new, cnt=1):
    global s
    if new in s: return
    if old not in s: print('skip (not found):', old[:60]); return
    s = s.replace(old, new, cnt)
sub('히스토리 17건(시드 버전마다 기존 저장분에도 한 번만 추가 · 최근 수정 순)',
    '히스토리 17건(시드 버전마다 기존 저장분에도 한 번만 추가 · 최근 수정 순 · 시드 4: 개편한 예시는 저장분이 이전 버전 그대로일 때만 바꿈 — seedFingerprint · seeds_prev_fp.json, 사용자가 고친 예시는 그대로)')
sub('레이아웃 전부 입력 8건 · 작성 중 5건 · 파트만 1건 · 요구사항 단계 3건.',
    'Storyboard 는 기승전결(기 맥락 → 승 문제 · 원인 → 전 가치 · 장면 · 구성 · 근거 → 결 효과 · 실행 · 다음 단계) 순서, 파트마다 사진 중심 레이아웃 2~3장(2026-10-19 개편). 레이아웃 전부 입력 8건 · 작성 중 5건 · 레이아웃만 고른 1건 · 요구사항 단계 3건.')
sub('  seeds_cases.json    위 17건 데이터(요구사항 · 파트 · 레이아웃 ov · 요소별 근거 ev)',
    '  seeds_cases.json    위 17건 데이터(요구사항 · 파트 · 레이아웃 ov · 요소별 근거 ev) — build/hist/merge.py 가 build/hist/out/*.json 으로 만듦\n  seeds_parts.json    데모 시드 A 커피 · E 오피스의 Storyboard(같은 도구로 만듦) · seeds_prev_fp.json 개편 전 예시 지문(시드 4 교체 판단)')
sub("node build/test-cases.mjs      # 히스토리 17건: 사이드바 ·",
    "node build/test-cases.mjs      # 히스토리 17건: 파트마다 레이아웃 2~3장 · 시드 v3 → v4(손대지 않은 예시만 새 버전) · 사이드바 ·")
sub('출처 대장은 `src/seeds_cases.sources.md`.',
    '출처 대장은 `src/seeds_cases.sources.md`(개편에서 새로 쓴 숫자는 케이스 절의 ‘개편 추가 수치’). 2026-10-19 개편: 16개 Storyboard 를 기승전결 순서로 다시 짜고 파트마다 사진 중심 레이아웃 2~3장으로 채움(텍스트 장은 RFP 대응표처럼 표가 본질인 장만), 케이스마다 독립 감사 2회. 가명 고객 장에는 실존 기업 · 학교 · 구단 · 건물이 드러나는 사진을 쓰지 않고, 다른 기관 사진은 ‘참고’로 표기. 도구: build/hist/(GUIDE.md · PLAN.md · check.mjs · dupcheck.py · merge.py).')
m = re.search(r'\n- 9차\(Best Scenario 사진 중심 전환\)[^\n]*', s)
if m and '- 11차(히스토리 예시 개편)' not in s:
    s = s[:m.end()] + '\n- 11차(히스토리 예시 개편): 사이드바 히스토리 예시 16개 Storyboard(완성 8 · 작성 중 5 · 레이아웃만 1 · A 커피 · E 오피스)를 기승전결 순서로 다시 짜고, 파트마다 사진 중심 레이아웃 2~3장(RETIRED 텍스트 장 0)으로 채움. 새 사진은 samsung.com 도입사례 · 제품 페이지에서 자르기만 해 img/fill/h1-*.json 묶음(출처 src/fill_sources.md 11차 표). 검사: build/hist/check.mjs(넘침 · 빈 사진 칸 · 예시 글 · 다른 고객 이름 · 대장 밖 숫자 · 같은 사진 dHash) · dupcheck.py(다르게 자른 같은 사진 SIFT).' + s[m.end():]
open(p, 'w', encoding='utf8').write(s)
print('ok')
