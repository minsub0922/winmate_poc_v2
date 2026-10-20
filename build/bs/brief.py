# 시나리오별 작업 브리프 — python3 build/bs/brief.py [bsNN …] → build/bs/briefs/<bsNN>.md
import json, sys, os, re
D = json.load(open('build/bs/data.json')); PLAN = json.load(open('build/bs/plan.json')); SL = json.load(open('build/bs/slots.json'))
CAT = json.load(open('data/catalog.json')); LIB = {e['addr']: e for e in json.load(open('build/bs/lib/catalog.json'))}
P = {p['id']: p for p in CAT['products']}; S = {s['id']: s for s in CAT['solutions']}; C = {str(c['id']): c for c in CAT['cases']}
LEAD = {'L_PH_SD_G', 'L_PH_QA_A', 'L_PH_AIS_08', 'L_PH_AIS_25', 'L_PH_AIS_26', 'L_PH_AIS_35'}
BG = json.load(open('src/scenario_bg.json'))
os.makedirs('build/bs/briefs', exist_ok=True)
def v2s(v):
    if isinstance(v, dict): return v.get('html', '').replace('<br/>', ' ⏎ ').replace('<br>', ' ⏎ ')
    return str(v)
def libdesc(src):
    e = LIB.get(src)
    return (e['desc'] + ' · ' + e['origin']) if e else ''
def slot_table(f, fill=None):
    sl = SL.get(f)
    out = []
    if not sl: return ['(레이아웃 정보 없음)']
    t = (fill or {}).get('t', {}); im = (fill or {}).get('img', {})
    out.append('| 칸 | 예시 글 | 채운 값 | 크기 · 글자 | 줄 · 한 줄 글자 |' if fill else '| 칸 | 예시 글 | 크기 · 글자 | 줄 · 한 줄 글자 |')
    out.append('|---|---|---|---|---|' if fill else '|---|---|---|---|')
    for x in sl['tbs']:
        flags = ('한 줄 고정 ' if x['nowrap'] else '') + (f"최대 {x['clamp']}줄" if x['clamp'] else '')
        samp = x['text'][:60].replace('|', '/')
        lines = f"{x['lines']}줄 · ~{x['cpl']}자 {flags}".strip()
        if fill:
            fv = v2s(t[str(x['i'])])[:90].replace('|', '/') if str(x['i']) in t else '—'
            out.append(f"| t{x['i']} | {samp} | {fv} | {x['w']}×{x['h']} · {x['fs']}px | {lines} |")
        else:
            out.append(f"| t{x['i']} | {samp} | {x['w']}×{x['h']} · {x['fs']}px | {lines} |")
    if sl['imgs']:
        out.append('')
        out.append('| 사진 칸 | 크기 | 설명(hint) | 지금 사진 |' ); out.append('|---|---|---|---|')
        for m in sl['imgs']:
            cur = m['src']
            if fill and m['i'] in im: cur = im[m['i']].get('src', '') + ' (' + (im[m['i']].get('name') or '') + ')'
            out.append(f"| img{m['i']} | {m['w']}×{m['h']}{' · 칸 안에 글' if m['withText'] else ''} | {m['hint'][:50]} | {cur[:70]} {('— ' + libdesc(m['src'])[:50]) if not fill else ''} |")
    if fill:
        extra = [k for k in im if not re.match(r'^\d+$', k)]
        for k in extra: out.append(f"- 고정 칸 사진 `{k}` → {im[k].get('src')} ({im[k].get('name','')})")
        if fill.get('r'): out.append(f"- 고정 글 치환 r: {fill['r']}")
    fx = [x for x in sl['fixed'] if re.search(r'\[|[A-Z] [가-힣]{2,}', x)]
    if fx: out.append('- 고정 글(편집 칸 아님) 중 예시 고객 · 자리표시: ' + ' ¦ '.join(fx[:12]) + '  → r 로 치환')
    return out
ids = sys.argv[1:] or list(PLAN.keys())
for sid in ids:
    sc = next(s for s in D['scenarios'] if s['id'] == sid); cust = D['customer'][sid]; fills = D['fills'][sid]; plan = PLAN[sid]
    L = [f'# {sid} · {cust} — {sc["title"]}', '']
    L.append(f'- 요구사항: {D["req"][sc["req"]]["label"]} · 전략: {D["strat"][sc["strategy"]]["label"]} · 결말: {D["endings"][sc["ending"]]} · 업종 코드: {sc.get("ind")}')
    L.append(f'- 상황: {sc["situation"]}')
    L.append(f'- 결정권자: {sc["audience"]["lead"]} / {", ".join(sc["audience"]["others"])}')
    L.append(f'- 핵심 주장: {sc["thesis"]}')
    L.append(f'- 메시지: {" / ".join(sc["messages"])} · 톤: {sc.get("tone","")}')
    L.append(f'- 성공 지표: {" / ".join(sc["kpis"])}')
    L.append(f'- 제품: ' + ', '.join(f"{P[x]['name']}({P[x]['model']})" if x in P else x for x in sc['products']))
    L.append(f'- 솔루션: ' + ', '.join(S[x]['name'] if x in S else x for x in sc['solutions']))
    L.append(f'- 유관 사례: ' + ', '.join((C[x]['cust'] + ' — ' + C[x]['sub'] + ' ' + C[x]['url']) if x in C else x for x in sc['cases']))
    L.append(f'- 요청(결말): {sc["ask"]}')
    if sid in BG: L.append(f'- 배경 테마: 이 덱은 장마다 다른 배경 사진(흐림 처리)이 깔림 — 레이아웃 자체 사진과 겹치지 않게만 신경 쓰면 됨')
    L.append('')
    nchg = sum(1 for x in plan if x['to'] and x['to'] not in LEAD)
    L.append(f'## 장 목록 ({len(plan)}장 · 바꿀 장 {nchg})'); L.append('')
    for x in plan:
        act = '그대로' if not x['to'] else ('리드가 처리' if x['to'] in LEAD else f"바꿈 → {x['to']}")
        L.append(f"- {x['k']:>2} {x['f']} · {SL.get(x['f'],{}).get('name','')} — {act} · 역할: {x['role']}")
    L.append('')
    for x in plan:
        k = x['k']; fl = fills[k]
        if not x['to'] or x['to'] in LEAD: continue
        L.append(f'---\n## 장 {k} · {x["f"]} → {x["to"]}'); L.append('')
        L.append(f'역할: {x["role"]} · 단계: {sc["slides"][k]["stageName"]} — {sc["slides"][k]["goal"]}')
        L.append(''); L.append(f'### 지금 (원래 레이아웃 {x["f"]} · {SL.get(x["f"],{}).get("name","")}) — 채운 값'); L.append('')
        L += slot_table(x['f'], fl)
        L.append(''); L.append(f'### 바꿀 레이아웃 {x["to"]} · {SL.get(x["to"],{}).get("name","")} — 칸'); L.append('')
        L += slot_table(x['to'])
        L.append('')
    open(f'build/bs/briefs/{sid}.md', 'w').write('\n'.join(L))
    print(sid, len('\n'.join(L)) // 1024, 'KB')
