"""정기 호 교체(예: 비즈니스 종합 Dir 360 → 364) — 기존 추출 항목의 id 를 유지하고 근거(dir · pages)만 새 호로 옮긴다.
쪽 대응: 옛 쪽마다 새 호에서 단어 집합이 가장 비슷한 쪽(Jaccard ≥ 0.5). 모델코드가 실제로 있는 쪽을 더한다.
사용: python3 remap_issue.py <old text.json> <new text.json> <extract.json> <old dir> <new dir> <out extract.json> <report.json>"""
import json, re, sys
old_t, new_t, ex_f, OLD, NEW, out_f, rep_f = sys.argv[1:8]
old = {int(k): v for k, v in json.load(open(old_t))['text'].items()}
new = {int(k): v for k, v in json.load(open(new_t))['text'].items()}
W = lambda t: set(re.findall(r'[0-9A-Za-z가-힣+.-]{2,}', t))
ow, nw = {p: W(t) for p, t in old.items()}, {p: W(t) for p, t in new.items()}
pmap = {}
for p, w in ow.items():
    best = max(nw.items(), key=lambda kv: len(w & kv[1]) / max(1, len(w | kv[1])))
    j = len(w & best[1]) / max(1, len(w | best[1]))
    if j >= 0.5: pmap[p] = best[0]
nm = lambda s: re.sub(r'[^A-Z0-9]', '', (s or '').upper())
N = lambda s: re.sub(r'[\s,]', '', s or '')
def pages_of(m):
    rx = re.compile(r'(?<![A-Za-z0-9])' + re.escape(m) + r'(?![A-Za-z0-9])')
    hit = {p for p, t in new.items() if rx.search(t)}
    if not hit and len(nm(m)) >= 5: hit = {p for p, t in new.items() if nm(m) in nm(t)}
    return hit
items = json.load(open(ex_f)); report = []
for it in items:
    if str(it['dir']) != OLD: continue
    mp = sorted({pmap[p] for p in it.get('pages') or [] if p in pmap})
    found, lost, mpages = [], [], set()
    for m in it.get('models') or []:
        h = pages_of(m)
        (found if h else lost).append(m); mpages |= h
    pages = sorted(set(mp) | mpages)
    name_ok = any(N(it['name']) in N(new[p]) for p in pages) if pages else False
    report.append({'id': it['id'], 'name': it['name'], 'oldPages': it.get('pages'), 'newPages': pages, 'mapped': mp, 'models': len(it.get('models') or []), 'lost': lost, 'nameOnPage': name_ok})
    it['dir'] = NEW; it['pages'] = pages
json.dump(items, open(out_f, 'w'), ensure_ascii=False, indent=1)
json.dump({'pageMap': {str(k): v for k, v in sorted(pmap.items())}, 'unmappedOld': sorted(set(old) - set(pmap)), 'items': report}, open(rep_f, 'w'), ensure_ascii=False, indent=1)
print('items', len(report), 'no pages', [r['id'] for r in report if not r['newPages']], 'with lost models', [(r['id'], r['lost']) for r in report if r['lost']])
