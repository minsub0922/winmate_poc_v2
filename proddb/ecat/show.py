#!/usr/bin/env python3
# 카탈로그 쪽 텍스트 보기: python3 show.py <Dir> [from] [to]
import json, sys, os
d = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'text', f'{sys.argv[1]}.json')))
a = int(sys.argv[2]) if len(sys.argv) > 2 else 1
b = int(sys.argv[3]) if len(sys.argv) > 3 else d['pages']
print(f"# Dir {d['dir']} · {d['title']} · {d.get('docTitle','')} · {d['pages']}쪽")
for p in range(a, b + 1):
    t = d['text'].get(str(p))
    if t is not None: print(f"\n=== p.{p} ===\n{t}")
