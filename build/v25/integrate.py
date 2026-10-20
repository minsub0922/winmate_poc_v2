# 표준 제안서 AI 스토어 · 오피스 · 아파트(bs23–25) → 앱 소스에 넣기. 다시 돌려도 같은 결과(이전에 넣은 것은 지우고 새로 씀).
# python3 integrate.py [/home/claude/w]
import sys, json, base64, re, os
sys.path.insert(0, '/home/claude/v3')
import build_new, keys, resolve, scen_v25, integrate_data
W = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/w'
DECKS = [('bs23', 'st', 'store'), ('bs24', 'of', 'office'), ('bs25', 'ap', 'apt')]

def durl(f):
    mime = 'image/png' if f.endswith('.png') else 'image/jpeg'
    return f'data:{mime};base64,' + base64.b64encode(open(f, 'rb').read()).decode()

# 1) 새 레이아웃(최종 주소)
html, meta = build_new.build(final=True)
for f, h in html.items(): assert 'v-missing' not in h, f'{f}: 사진 없음'
NEW = set(html)

# 2) 사진 묶음 하나(img/fill/v25.json — 스토어 · 오피스 · 아파트 순)
mans = {m['key']: m for d in ('store', 'office', 'apt') for m in keys.manifest(d)}
imgs = [durl(mans[k]['file']) for k in keys.bundle_order()]
p = f'{W}/img/fill/v25.json'
json.dump({'images': imgs}, open(p, 'w'), separators=(',', ':'))
print('v25', len(imgs), round(os.path.getsize(p) / 1e6, 2), 'MB')

# 3) std_layouts.js
p = f'{W}/src/std_layouts.js'; s = open(p).read()
mi = s.index('export const STD_META = ') + len('export const STD_META = '); me = s.index('\n];', mi) + 2
META = json.loads(s[mi:me])
hi = s.index('export const STD_HTML = ') + len('export const STD_HTML = '); he = s.rindex(';')
HTML = json.loads(s[hi:he])
META = [m for m in META if m['f'] not in NEW and m.get('cv') != 'ST_V25'] + meta
for k in [k for k in HTML if k in NEW]: del HTML[k]
HTML.update(html)
head = s[:s.index('export const STD_META = ')]
if 'ST_V25' not in head:
    head += ('// 표준 제안서 · 2025 버티컬 AI 스토어 38장 · AI 오피스 38장 · AI 아파트 37장(원본 표기 cv=ST_V25) — 첨부 명세(같은 디자인의 AI 스테이 양식)를 L_AIS_* 재사용 + 새 레이아웃 17개로 복원:\n'
             '// L_AST_11 · L_AST_21 · L_AOF_11 · L_AOF_23 · L_AOF_26..28 · L_AAP_11 · L_AAP_22 · L_AAP_25 · L_AAP_26 · L_STD_INTRO2 · L_STD_UI2 · L_STD_UIF3 · L_STD_HUB6 · L_STD_CARD6 · L_STD_PH09N.\n'
             '// Best Scenario bs23 · bs24 · bs25 가 순서대로 씀. 사진: samsung.com/sec/business 공식 이미지 → img/fill/v25.json 묶음 하나 (출처: src/fill_sources.md ‘2025 버티컬’ 표) · 생성 2026-10-19 · 도구 build/v25/\n')
s2 = head + 'export const STD_META = ' + json.dumps(META, ensure_ascii=False, indent=0) + ';\nexport const STD_HTML = ' + json.dumps(HTML, ensure_ascii=False) + ';\n'
open(p, 'w').write(s2)
print('std_layouts meta', len(META), 'html', len(HTML), round(len(s2.encode()) / 1e6, 2), 'MB')

# 4) data.js CANVAS · tplkit DECKS
p = f'{W}/src/data.js'; s = open(p).read()
if 'ST_V25:' not in s:
    a = s.index('  ST_SOL: '); b = s.index('\n', a) + 1
    s = s[:b] + "  ST_V25: { name: '" + integrate_data.CANVAS + "', url: '' },\n" + s[b:]
    open(p, 'w').write(s)
p = f'{W}/src/ui/tplkit.jsx'; s = open(p).read()
s = re.sub(r"\{ k: 'ST', label: '표준 제안서', full: '[^']*' \}",
           "{ k: 'ST', label: '표준 제안서', full: '" + integrate_data.DECK_FULL + "' }", s)
open(p, 'w').write(s)

# 5) scenario_fills.js
p = f'{W}/src/scenario_fills.js'; lines = open(p).read().split('\n')
for n, l in enumerate(lines):
    if l.startswith('export const FILL_CUSTOMER = '):
        o = json.loads(l[len('export const FILL_CUSTOMER = '):-1])
        for sid, d, _ in DECKS: o[sid] = __import__(resolve.MOD[d]).CUST
        lines[n] = 'export const FILL_CUSTOMER = ' + json.dumps(o, ensure_ascii=False) + ';'
    if l.startswith('export const FILLS = '):
        body = l[len('export const FILLS = '):]; assert body.endswith(';')
        F = json.loads(body[:-1])
        SEP = next(sp for sp in ((', ', ': '), (',', ':')) if json.dumps(F, ensure_ascii=False, separators=sp) == body[:-1])
        for sid, d, _ in DECKS:
            sl, miss = resolve.slides(d, final=True)
            assert not miss, (sid, miss[:5])
            F[sid] = [{k: v for k, v in x.items() if k != 'label'} for x in sl]
            print(sid, len(sl), 'slides')
        lines[n] = 'export const FILLS = ' + json.dumps(F, ensure_ascii=False, separators=SEP) + ';'
src = '\n'.join(lines)
if 'bs23–25' not in src.split('export const FILL_CUSTOMER')[0]:
    src = src.replace('\nexport const FILL_CUSTOMER', '\n// bs23–25(F 다이닝 · O 타워 · Z 레지던스 · 표준 제안서 2025 버티컬 AI 스토어 · 오피스 · 아파트)도 같은 방식 — 묶음 img/fill/v25.json. 작업 도구: build/v25/\nexport const FILL_CUSTOMER', 1)
open(p, 'w').write(src)

# 6) scenarios.js — bs22 다음, '신규 구축 · RFP' 앞
p = f'{W}/src/scenarios.js'; s = open(p).read()
A, Z = '  /* --- 표준 제안서 · 2025 버티컬 (bs23–25 · build/v25) --- */\n', '  /* --- /표준 제안서 · 2025 버티컬 --- */\n'
if A in s: s = s[:s.index(A)] + s[s.index(Z) + len(Z):]
i = s.index('  /* ================= 신규 구축 · RFP')
s = s[:i] + A + scen_v25.js() + Z + s[i:]
open(p, 'w').write(s)
# 7) scenario_story.js — 키맨 · 파트 유형 · 내용
p = f'{W}/src/scenario_story.js'
if os.path.exists(p):
    s = open(p, encoding='utf8').read()
    i = s.index('export const STORY = ') + len('export const STORY = '); j = s.rindex('}') + 1
    o = json.loads(s[i:j]); assert json.dumps(o, ensure_ascii=False, indent=1) == s[i:j]
    for k, v in scen_v25.STORY.items(): o[k] = v
    open(p, 'w', encoding='utf8').write(s[:i] + json.dumps(o, ensure_ascii=False, indent=1) + s[j:])
    print('story', len(o))
print('done')

# 8) README · fill_sources.md
p = f'{W}/README.md'; lines = open(p, encoding='utf8').read().split('\n')
for n, l in enumerate(lines):
    if l.startswith('  std_layouts.js') and 'ST_V25' not in l:
        lines[n] = l + (' · 2025 버티컬 AI 스토어 38장 · AI 오피스 38장 · AI 아파트 37장(같은 ST 묶음 · 원본 표기 cv=ST_V25 → data.js CANVAS.ST_V25) — 첨부 명세 3개(AI 스테이와 같은 디자인)를 L_AIS_* 를 그대로 다시 쓰고, '
                        '장 구성이 다른 곳만 새 레이아웃 17개(L_AST_11 · L_AST_21 · L_AOF_11 · L_AOF_23 · L_AOF_26..28 · L_AAP_11 · L_AAP_22 · L_AAP_25 · L_AAP_26 · 공통 L_STD_INTRO2 · L_STD_UI2 · L_STD_UIF3 · L_STD_HUB6 · L_STD_CARD6 · L_STD_PH09N)로 복원. '
                        '사진 · 제품 컷 · 솔루션 화면은 img/fill/v25.json 묶음 하나(세 덱 공용 — 게시 파일 수 한도 511 때문), 출처: src/fill_sources.md 끝 ‘2025 버티컬’ 표')
    if l.startswith('  scenarios.js') and 'bs23' not in l:
        l = re.sub(r'Best Scenario 데이터 \d+개', 'Best Scenario 데이터 25개', l)
        lines[n] = l.replace('L_SOL_01..15를 순서대로)', 'L_SOL_01..15를 순서대로 · bs23 외식 · 카페 AI 스토어 38장 · bs24 오피스 AI 오피스 38장 · bs25 아파트 AI 아파트 37장 — 2025 버티컬 표준 양식, 장 순서 그대로)')
    if l.startswith('node build/test-std-sol.mjs') and not any(x.startswith('node build/test-std-v25.mjs') for x in lines):
        lines.insert(n + 1, 'node build/test-std-v25.mjs    # 표준 제안서 2025 버티컬(bs23 AI 스토어 · bs24 AI 오피스 · bs25 AI 아파트): 표준 제안서 그룹 줄 · 장 팝업 38/38/37장 · 사진 묶음(v25) 전부 로드 · PPTX · 활용하기 · 쪽 번호 (nopptx 로 PPTX 건너뛰기)')
        break
for n, l in enumerate(lines):
    if l.startswith('- 표준 제안서 Lite(2026-10-19)') and not any(x.startswith('- 표준 제안서 2025 버티컬') for x in lines):
        lines.insert(n + 1, '- 표준 제안서 2025 버티컬(2026-10-19): Best Scenario ‘표준 제안서’ 그룹에 bs23 AI 스토어(F 다이닝 · 38장) · bs24 AI 오피스(O 타워 · 38장) · bs25 AI 아파트(Z 레지던스 · 37장)를 더했어요. '
                        '첨부 재현 명세 3개는 AI 스테이와 같은 디자인이라 표지 · 목차 · 간지 · 공간별 제품 · 도입사례 · Why Samsung은 L_AIS_* 를 그대로 쓰고(각주 칸 수 · 사진 비율이 맞는 장으로 고름), '
                        '개수가 다른 장(공간별 제안 · Map · 솔루션 화면 · b.IoT 계층도 · 오픈 프로토콜 · AI 알고리즘 7 · SmartThings 홈 · 단지 연동 · 자동화 6)만 새 레이아웃 17개로 그렸어요. '
                        '문구는 명세 그대로(띄어쓰기만 바로잡고, 긴 법적 각주는 칸에 맞게 줄임 · 명세 오기 3곳 바로잡음), 사진은 samsung.com/sec/business(업종 · 솔루션 · 제품 상세 · 도입사례) 우선. 도구: build/v25/(README.md 안내).')
        break
open(p, 'w', encoding='utf8').write('\n'.join(lines))

p = f'{W}/src/fill_sources.md'; s = open(p, encoding='utf8').read()
H0 = '\n## 표준 제안서 · 2025 버티컬 (bs23 AI 스토어 · bs24 AI 오피스 · bs25 AI 아파트)\n'
if H0 in s: s = s[:s.index(H0)]
rows = [H0, '세 덱 공용 묶음 `img/fill/v25.json` (#k = 묶음 안 순서, 스토어 → 오피스 → 아파트). ‘재사용’은 앱에 이미 있던 사진 주소 그대로. 처리: 비율 자르기 · 흰 배경 투명 처리 등.\n',
        '| 덱 | 칸 | 주소 | 사진 | 출처 페이지 | 처리 |', '|---|---|---|---|---|---|']
for sid, d, deck in integrate_data.DECKS:
    for m in keys.manifest(deck):
        if m['status'] == 'missing': continue
        addr = keys.app_addr('@' + m['key'])
        page = m.get('page', '') if m['status'] == 'new' else '(재사용)'
        rows.append(f"| {sid} | {m['key']} | {addr} | {m.get('alt', '')} | {page} | {m.get('note', '')} |")
open(p, 'w', encoding='utf8').write(s.rstrip('\n') + '\n' + '\n'.join(rows) + '\n')
print('docs done')
