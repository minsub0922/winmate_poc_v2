import json, sys
name = sys.argv[1]; pages = [int(x) for x in sys.argv[2].split(',')]
minlen = int(sys.argv[3]) if len(sys.argv) > 3 else 0
P = {p['no']: p for p in json.load(open(f'/home/claude/v3/{name}.json'))}
for n in pages:
    p = P[n]; blocks = {}
    for r in p['rows']: blocks.setdefault(r['id'].rsplit('-', 1)[0], []).append(r['t'])
    for b, ts in blocks.items():
        t = ' '.join(ts)
        if len(t) >= minlen: print(f'P{n:02d} {b.split("-")[1]}: {t}')
