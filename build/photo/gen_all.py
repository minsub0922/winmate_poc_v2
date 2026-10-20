import json, importlib, importlib.util, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
mods = [m for m in ['gen_l1', 'gen_l2', 'gen_l3', 'gen_l4', 'gen_l5', 'gen_l6', 'gen_l7', 'gen_l8', 'gen_l9', 'gen_l10', 'gen_l11', 'gen_l12', 'gen_l13', 'gen_l14', 'gen_l15', 'gen_l16', 'gen_l17', 'gen_l18', 'gen_l19', 'gen_l20', 'gen_l21', 'gen_l22', 'gen_l23', 'gen_l24', 'gen_l25', 'gen_l26', 'gen_l27', 'gen_l28', 'gen_l29', 'gen_l30'] if importlib.util.find_spec(m)]
L = []
for m in mods: L += importlib.import_module(m).L
H = {l['f']: l['html'] for l in L}
OUT = os.environ.get('R4OUT', 'build/photo')  # 다른 폴더에 쓰려면 R4OUT=<폴더> (동시에 여러 번 돌릴 때)
os.makedirs(OUT, exist_ok=True)
json.dump(H, open(os.path.join(OUT, 'new_layouts.json'), 'w'), ensure_ascii=False)
json.dump([{k: v for k, v in l.items() if k not in ('html', '_b')} | {'texts': l['_b'].texts, 'slots': l['_b'].slots, 'hdr': l['_b'].hdr, 'foot': l['_b'].foot} for l in L], open(os.path.join(OUT, 'new_meta.json'), 'w'), ensure_ascii=False, indent=1)
print(len(L), ' '.join(l['f'] for l in L))
import gen_ind
for w in gen_ind.LOWRES: print('LOWRES', *w)
# the same photo twice on one slide
for l in L:
    import re as _re
    ps = _re.findall(r'data-slot="Photo" data-pid="([^"]+)"', l['html'])
    d = sorted({p for p in ps if ps.count(p) > 1 and not p.startswith('ph.gen-rival-')})  # 경쟁사 실루엣은 같은 장에 여러 번 써도 됨
    if d: print('DUP', l['f'], ' '.join(d))
