# seeds_cases.sources.md — 개편(2026-10-19)에서 새로 쓴 숫자(out/*.json ledger)를 케이스 절마다 덧붙인다 · A · E 절 추가
import json, re, glob, os
p = 'src/seeds_cases.sources.md'
s = open(p, encoding='utf8').read()
s = re.sub(r'\n- 개편\(2026-10-19\) 추가[^\n]*(\n  - [^\n]*)*', '', s)
outs = {json.load(open(f))['id']: json.load(open(f)) for f in glob.glob('build/hist/out/*.json') if not os.path.basename(f).startswith('_')}
CODE = {'p_seed_acoffee': 'A', 'p_seed_eoffice': 'E'}
added = {}
for pid, o in outs.items():
    code = CODE.get(pid) or pid.split('_')[-1].upper()
    led = [x for x in o.get('ledger') or [] if x.get('n')]
    if not led: continue
    lines = '\n- 개편(2026-10-19) 추가 수치 — 기승전결 개편에서 새로 쓴 값과 그 출처\n' + '\n'.join(f"  - `{x['n']}` — {x.get('src', '')}" for x in led)
    m = re.search(r'^## ' + re.escape(code) + r' · .*$', s, re.M)
    if m:
        nxt = re.search(r'^## ', s[m.end():], re.M)
        end = m.end() + (nxt.start() if nxt else len(s) - m.end())
        body = s[m.start():end].rstrip()
        s = s[:m.start()] + body + lines + '\n\n' + s[end:]
    else:
        added[code] = lines
if added:
    i = s.index('---\n\n# 검증된 공개 자료') if '---\n\n# 검증된 공개 자료' in s else len(s)
    extra = ''.join(f"## {c} · {outs[[k for k, v in CODE.items() if v == c][0]]['id']} (store.js 예시)" + v + '\n\n' for c, v in added.items())
    s = s[:i] + extra + s[i:]
s = s.replace('# 히스토리 샘플 17건 — 수치 출처 대장', '# 히스토리 샘플 17건 — 수치 출처 대장\n\n2026-10-19 개편: 모든 Storyboard 를 기승전결(맥락 → 문제 → 해법 → 결과와 결정) 순서, 파트마다 사진 중심 레이아웃 2~3장으로 다시 만들었습니다. 새로 쓴 숫자는 케이스 절의 ‘개편 추가 수치’에 있습니다.', 1) if '2026-10-19 개편' not in s else s
open(p, 'w', encoding='utf8').write(s)
print('ok', {k: len(v.get('ledger') or []) for k, v in outs.items()})
