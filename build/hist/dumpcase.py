# 현재 히스토리 케이스 → 읽기 쉬운 md (요구사항 + 장마다 칸 · 예시 글 · 채운 값)
import json, sys, os
SL = json.load(open('build/hist/slots.json'))
LM = {l['f']: l for l in json.load(open('build/hist/layouts.json'))}
def segtxt(segs):
    if isinstance(segs, str): return segs
    return ''.join(s['t'] if 't' in s else '@' + s['ref'] for s in segs)
def val(v):
    if isinstance(v, dict): return v.get('html', '').replace('<br>', ' / ').replace('<br/>', ' / ')
    return v
def dump(p, out):
    L = []
    L.append(f"# {p['id']} · {p['title']}\n- customer: {p.get('customer')} · ind {p.get('ind')} · meta {json.dumps(p.get('meta', {}), ensure_ascii=False)} · stage {p.get('stage')}")
    L.append(f"- ctx: {json.dumps(p.get('ctx'), ensure_ascii=False)}")
    r = p.get('req', {})
    L.append('\n## 요구사항 · 자유형식\n' + segtxt(r.get('free', [])))
    f = r.get('form', {})
    L.append(f"\n## 폼\n- project: {f.get('project')}\n- customer: {f.get('customer')} · target: {f.get('target')}")
    for k in f.get('keymen', []): L.append(f"- 키맨 {k['name']} ({k['weight']}): " + ' | '.join(segtxt(x) for x in k['reqs']))
    L.append('- note:\n' + (f.get('note') or ''))
    for fl in r.get('files', []): L.append(f"- 파일 {fl['name']} · {fl.get('memo','')} · text: {fl.get('text','')[:400]}")
    L.append('\n## Storyboard')
    for s in p.get('parts', []):
        L.append(f"\n### [{s['type']}] {s['name']} · items: {' | '.join(s.get('items', []))}")
        for x in s.get('layouts', []):
            sl = SL.get(x['f']) or {}
            L.append(f"\n#### {x['f']} · {LM.get(x['f'],{}).get('name','')} · status {x['status']}")
            t = (x.get('ov') or {}).get('t', {})
            for tb in sl.get('tbs', []):
                k = str(tb['i'])
                v = t.get(k)
                L.append(f"- t{k} [{tb['text'][:40]}] → {val(v) if v is not None else '—'}")
            im = (x.get('ov') or {}).get('img', {})
            for k, v in im.items(): L.append(f"- img{k} → {v.get('src')} ({v.get('name','')})")
    open(out, 'w').write('\n'.join(L))
D = json.load(open('src/seeds_cases.json'))
for p in D: dump(p, f"/home/claude/hist/cur/{p['id']}.md")
print(len(D))
