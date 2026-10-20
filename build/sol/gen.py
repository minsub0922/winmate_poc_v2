# 공유오피스 Lite 15장 → STD_META / STD_HTML 조각 + 미리보기 HTML
import sys, json, re, os
sys.path.insert(0, '/home/claude/gen/lay')
import pages
from lib import BUND, MAN

SEC = {1: '표지 · 개요', 2: '표지 · 개요', 3: '표지 · 개요', 4: '01 효율적인 업무 공간', 5: '01 효율적인 업무 공간', 6: '01 효율적인 업무 공간', 7: '01 효율적인 업무 공간',
       8: '02 쾌적한 공용 공간', 9: '02 쾌적한 공용 공간', 10: '02 쾌적한 공용 공간', 11: '03 관리 편의성 강화', 12: '04 레퍼런스', 13: '04 레퍼런스', 14: '05 제안 제품 리스트', 15: '마무리'}
G = '표준 제안서 · 공유오피스 Lite · {} — 공유오피스 Lite 제안서 표준 양식'
ORDER = ['f', 'c', 'cv', 'code', 'name', 'when', 'g', 'p', 'p2', 'ind', 'sol', 'sample', 'eb', 'hl', 'sub', 'foot', 'nT', 'nI', 'ik', 'ih', 'ph', 'phs', 'pc', 'req', 'prods', 'sols', 'txt', 'pf']
metas, htmls = [], {}
for i, fn in enumerate(pages.PAGES, 1):
    s, d = fn()
    h = s.html()
    m = dict(f=s.fid, c='ST', cv='ST_SOL', code=d['code'], name=d['name'], when=d['when'], g=G.format(SEC[i]), p=d['p'], p2=d['p2'], ind='OF', sol=d.get('sol'),
             sample=d['sample'], eb=d['eb'], hl=d['hl'], sub=d['sub'], foot=d['foot'], nT=s.tb, nI=s.ni, ik=s.kinds, ih=s.hints, ph=len(d['phs']), phs=d['phs'], pc=0,
             req=d['req'], prods=d['prods'], sols=d['sols'], txt=' '.join(t for t in s.texts if t), pf=round(min(1.0, s.photo_area / (1280 * 720)), 2))
    metas.append({k: m[k] for k in ORDER}); htmls[s.fid] = h
    assert h.count('data-tb=') == s.tb and h.count('data-img=') == s.ni
os.makedirs('/home/claude/gen/out/lay', exist_ok=True)
json.dump(metas, open('/home/claude/gen/out/lay/meta.json', 'w'), ensure_ascii=False, indent=1)
json.dump(htmls, open('/home/claude/gen/out/lay/html.json', 'w'), ensure_ascii=False)
# preview — data-fill → local file
inv = {v: MAN[k]['file'] for k, v in BUND.items()}
def loc(h): return re.sub(r'src="data:image/gif[^"]*" data-fill="([^"]+)"', lambda mm: f'src="file://{inv[mm.group(1)]}" data-fill="{mm.group(1)}"', h)
css = "@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR');font-weight:400}@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR Medium'),local('Noto Sans CJK KR');font-weight:500}@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR Bold');font-weight:700}body{margin:0;background:#666}.s{margin:0 0 10px 0;width:1280px;height:720px}"
open('/home/claude/gen/out/lay/preview.html', 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>' + ''.join(f'<div class="s" id="{f}">{loc(h)}</div>' for f, h in htmls.items()) + '</body></html>')
for m in metas: print(m['f'], m['p'], m['p2'], 'nT', m['nT'], 'nI', m['nI'], 'pf', m['pf'], len(htmls[m['f']]) // 1024, 'KB')
