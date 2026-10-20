# 감사 고칠 글 적용 — python3 build/hist/apply_fix.py <id> '<json: [[kk, "t" | "img", key, value], ...]>'
import json, sys
id, fixes = sys.argv[1], json.loads(sys.argv[2])
p = f'build/hist/out/{id}.json'; o = json.load(open(p))
slides = list(o.get('deck', [])) + [x for s in o['parts'] for x in s['layouts']]
for kk, kind, key, val in fixes:
    x = slides[kk]
    x.setdefault(kind, {})[str(key)] = val
    print(kk, x['f'], kind, key, '←', str(val)[:60])
json.dump(o, open(p, 'w'), ensure_ascii=False, indent=1)
