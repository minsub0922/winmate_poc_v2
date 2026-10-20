import json, sys, re
name = sys.argv[1]; pages = sys.argv[2] if len(sys.argv) > 2 else None
P = json.load(open(f'/home/claude/v3/{name}.json'))
sel = None
if pages:
    sel = set()
    for part in pages.split(','):
        if '-' in part: a, b = part.split('-'); sel |= set(range(int(a), int(b) + 1))
        else: sel.add(int(part))
for p in P:
    if sel and p['no'] not in sel: continue
    print(f"## P{p['no']:02d} {p['title']} | {p['type']}\n   {p['desc']}")
    blocks = {}
    for r in p['rows']:
        bid = r['id'].rsplit('-', 1)[0]
        blocks.setdefault(bid, []).append(r)
    items = []
    for bid, rows in blocks.items():
        b = p['blocks'].get(bid, {})
        st = re.sub(r'F0\d ', '', b.get('style', ''))
        st = ';'.join(sorted(set(x.strip() for x in st.split(';'))))[:40]
        x, y = rows[0]['bbox'][0], rows[0]['bbox'][1]
        items.append((round(y), x, bid.split('-')[1], ' / '.join(r['t'] for r in rows), st, b.get('role', '')[:14]))
    for y, x, bid, t, st, role in sorted(items):
        print(f"   {bid:4s} ({x:6.1f},{y:5.0f}) [{st}] {t}")
    for im in p['imgs']:
        v = im['vis']
        print(f"   {im['id'].split('-')[1]} vis({v[0]:.0f},{v[1]:.0f},{v[2]:.0f}x{v[3]:.0f}) {im['px'].split(';')[1].strip()} {im['role']}")
