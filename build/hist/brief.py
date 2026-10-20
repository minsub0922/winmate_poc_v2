# 케이스 브리프 — python3 build/hist/brief.py → build/hist/briefs/<id>.md · build/hist/ledger/<id>.json(허용 숫자)
import json, re, os
os.makedirs('build/hist/briefs', exist_ok=True); os.makedirs('build/hist/ledger', exist_ok=True)
CAT = json.load(open('data/catalog.json'))
P = {p['id']: p for p in CAT['products']}; S = {s['id']: s for s in CAT['solutions']}; C = {str(c['id']): c for c in CAT['cases']}
D = json.load(open('src/seeds_cases.json')) + [p for p in json.load(open('build/hist/seed_other.json')) if p['id'] in ('p_seed_acoffee', 'p_seed_eoffice')]
SRC = open('src/seeds_cases.sources.md', encoding='utf8').read()
PLAN = open('build/hist/PLAN.md', encoding='utf8').read()
def sec(text, head_re, level='## '):
    m = re.search(r'^' + re.escape(level) + head_re + r'.*$', text, re.M)
    if not m: return ''
    nxt = re.search(r'^' + re.escape(level) + r'(?!#)', text[m.end():], re.M)
    end = m.end() + nxt.start() if nxt else len(text)
    return text[m.start():end].strip()
FACTS = '\n\n'.join(sec(SRC, x) for x in ['A\\. Public', 'B\\. Samsung product', 'C\\. Samsung corporate', 'D\\. 작성 원칙'])
def segtxt(segs):
    if isinstance(segs, str): return segs
    return ''.join(s['t'] if 't' in s else '@' + s['ref'] for s in (segs or []))
NUM = re.compile(r'(?<![A-Za-z])\d[\d,]*(?:\.\d+)?')
def nums(s):
    out = set()
    for m in NUM.finditer(s or ''):
        v = m.group(0).rstrip(',.').replace(',', '')
        if v: out.add(v.lstrip('0') or '0'); out.add(v)
    return out
CODE = {'p_seed_acoffee': 'A', 'p_seed_eoffice': 'E'}
for p in D:
    code = CODE.get(p['id']) or p['id'].split('_')[-1].upper()
    plan = sec(PLAN, re.escape(code) + ' · ')
    led = sec(SRC, re.escape(code) + ' · ')
    r = p['req']; f = r['form']
    req = ['## 고객 요구사항 (원문 그대로 — 고객이 준 사실)', '### 자유형식', segtxt(r.get('free')), '### 폼', f"- 프로젝트: {f.get('project')}", f"- 고객: {f.get('customer')} · 결정권자: {f.get('target')}"]
    for k in f.get('keymen', []): req.append(f"- 키맨 {k['name']} ({k['weight']}): " + ' | '.join(segtxt(x) for x in k['reqs']))
    req.append('- 제작자 메모(note):\n```\n' + (f.get('note') or '') + '\n```')
    for fl in r.get('files', []): req.append(f"- 첨부 `{fl['name']}` — {fl.get('memo', '')} · {fl.get('text', '')}")
    ctx = p.get('ctx', {})
    cl = ['## 선택된 제품 · 솔루션 · 사례 (앱 카탈로그)']
    for i in ctx.get('products', []):
        x = P.get(i); cl.append(f"- 제품 `{i}` {x['name']} · 모델 {x['model']} · {x['cat']} · 카탈로그 spec: {x['spec']} (※ 슬라이드 수치는 아래 B 표의 공식 값만)" if x else f'- 제품 {i}')
    for i in ctx.get('solutions', []):
        x = S.get(i); cl.append(f"- 솔루션 `{i}` {x['name']} · {x['cat']} — {x['desc']}" if x else f'- 솔루션 {i}')
    for i in ctx.get('cases', []):
        x = C.get(str(i))
        if x: cl.append(f"- 사례 `{i}` **{x['cust']}** · {x['title']} · {x.get('date', '')} · {x.get('url', '')}\n  - proof(원문 그대로만 인용): {' / '.join(x.get('proof') or [])}\n  - scale: {x.get('scale', '')} · 공간: {', '.join(x.get('space') or [])} · 제공: {', '.join(x.get('offer') or [])}" + (f"\n  - quote: “{x['quote']}”" if x.get('quote') else ''))
    cur = open(f"build/hist/cur/{p['id']}.md").read().split('## Storyboard', 1)[1] if os.path.exists(f"build/hist/cur/{p['id']}.md") else '\n'.join(f"- [{s['type']}] {s['name']} · {' | '.join(s.get('items', []))} · 장: {', '.join(x['f'] + ':' + x['status'] for x in s['layouts'])}" for s in p['parts'])
    md = [f"# 브리프 · {code} · {p['title']}", f"- id `{p['id']}` · 고객 **{p['customer']}** · 업종 {p.get('ind')} · meta {json.dumps(p.get('meta', {}), ensure_ascii=False)}",
          '', '## 이번에 만들 Storyboard (PLAN.md)', plan or '(PLAN.md 에 없음)', '', '\n'.join(req), '', '\n'.join(cl), '',
          '## 이 케이스의 수치 출처 대장 (seeds_cases.sources.md)', led or '(대장 없음 — 요구사항 숫자만)', '', '## 공통 · 검증된 공개 자료 · 삼성 사양 · 작성 원칙', FACTS, '',
          '## 지금 Storyboard (옮겨 쓸 재료 — 텍스트 레이아웃은 대부분 RETIRED, 내용은 정확함)', cur]
    open(f"build/hist/briefs/{p['id']}.md", 'w').write('\n'.join(md))
    allowed = set()
    for s in [segtxt(r.get('free')), f.get('note') or '', f.get('project') or '', f.get('target') or ''] + [segtxt(x) for k in f.get('keymen', []) for x in k['reqs']] + [fl.get('memo', '') + ' ' + fl.get('text', '') + ' ' + fl['name'] for fl in r.get('files', [])]:
        allowed |= nums(s)
    for m in re.finditer(r'`([\d.,]+)`', led): allowed |= nums(m.group(1))
    allowed |= nums(led)
    allowed |= nums(FACTS)
    for i in ctx.get('cases', []):
        x = C.get(str(i))
        if x: allowed |= nums(' '.join((x.get('proof') or []) + [x.get('scale') or '', x.get('date') or '', x.get('title') or '', x.get('quote') or '']))
    for i in ctx.get('products', []):
        x = P.get(i)
        if x: allowed |= nums(x['spec'] + ' ' + x['model'] + ' ' + x['name'])
    json.dump({'id': p['id'], 'code': code, 'customer': p['customer'], 'nums': sorted(allowed)}, open(f"build/hist/ledger/{p['id']}.json", 'w'), ensure_ascii=False)
    print(code, p['id'], len(allowed), 'nums', 'plan' if plan else 'NO PLAN')
