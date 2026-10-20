# 게시된 index.html(다른 세션이 계속 고치는 번들)에 bs23–25 데이터만 끼워 넣기 — 소스 빌드 대신, 지금 게시본 위에 얹는다.
# python3 bundle_patch.py <live index.html> <out index.html>
# 넣는 곳: STD_META 배열 끝 · STD_HTML 객체 끝 · CANVAS.ST_V25 · DECKS ST 설명 · FILL_CUSTOMER · FILLS · SCENARIOS(bs22 다음) · STORY
# 모두 데이터 리터럴이라, 찾는 기준은 이미 들어 있는 bs22 / L_SOL_15 / ST_SOL 자리. 이미 들어 있으면(bs23 · L_AST_11) 먼저 지우지 않고 멈춘다.
import sys, json, re
sys.path.insert(0, '/home/claude/v3')

def esc(s):  # esbuild 와 같은 ASCII 이스케이프
    return ''.join(c if ord(c) < 128 else ('\\u%04X' % ord(c) if ord(c) > 0xFF else '\\x%02X' % ord(c)) for c in s)
def js(v):
    return esc(json.dumps(v, ensure_ascii=False, separators=(',', ':')))

def skip_str(t, i):
    q = t[i]; i += 1
    if q == '`':
        while True:
            c = t[i]
            if c == '\\': i += 2; continue
            if c == '`': return i + 1
            if c == '$' and t[i + 1] == '{': i = close_of(t, i + 1) + 1; continue
            i += 1
    while True:
        c = t[i]
        if c == '\\': i += 2; continue
        if c == q: return i + 1
        i += 1
def close_of(t, i):
    """t[i] 가 여는 괄호 — 짝이 되는 닫는 괄호 위치"""
    depth = 0
    while True:
        c = t[i]
        if c in '"\'`': i = skip_str(t, i); continue
        if c in '([{': depth += 1
        elif c in ')]}':
            depth -= 1
            if depth == 0: return i
        i += 1
def end_of_container(t, i):
    """i 가 어떤 [ ] / { } 안쪽(깊이 1)일 때 그 컨테이너를 닫는 괄호 위치"""
    depth = 0
    while True:
        c = t[i]
        if c in '"\'`': i = skip_str(t, i); continue
        if c in '([{': depth += 1
        elif c in ')]}':
            if depth == 0: return i
            depth -= 1
        i += 1
def one(t, pat):
    m = [x.start() for x in re.finditer(pat, t)]
    assert len(m) == 1, (pat, len(m))
    return m[0]

def patch(t, html, meta, cust, fills, scen_js, story, canvas_name, deck_full):
    assert 'id:"bs23"' not in t and 'L_AST_11' not in t, '이미 들어 있음'
    # 1) STD_META
    a = one(t, re.escape('{f:"L_SOL_15",c:"ST",cv:"ST_SOL"'))
    e = end_of_container(t, a); assert t[e] == ']'
    t = t[:e] + ',' + ','.join(js(m) for m in meta) + t[e:]
    # 2) STD_HTML
    a = one(t, re.escape('L_SOL_15:`'))
    e = end_of_container(t, a); assert t[e] == '}'
    t = t[:e] + ',' + ','.join(f'{json.dumps(k)}:{js(v)}' for k, v in html.items()) + t[e:]
    # 3) CANVAS
    a = one(t, r'ST_SOL:\{name:'); b = close_of(t, a + len('ST_SOL:'))
    t = t[:b + 1] + ',ST_V25:' + js({'name': canvas_name, 'url': ''}) + t[b + 1:]
    # 4) DECKS ST
    a = one(t, re.escape('{k:"ST",label:')); b = close_of(t, a)
    old = t[a:b + 1]; lab = re.search(r'label:("(?:[^"\\]|\\.)*")', old).group(1)
    t = t[:a] + '{k:"ST",label:' + lab + ',full:' + js(deck_full) + '}' + t[b + 1:]
    # 5) FILL_CUSTOMER
    a = one(t, re.escape('bs21:"H ' + esc('호텔') + '",bs22:"N ' + esc('공유오피스') + '"'))
    e = end_of_container(t, a); assert t[e] == '}'
    t = t[:e] + ',' + ','.join(f'{k}:{js(v)}' for k, v in cust.items()) + t[e:]
    # 6) FILLS
    a = one(t, re.escape('bs22:[{t:{1:{html:"N ' + esc('공유오피스') + '<br>'))
    b = close_of(t, a + len('bs22:'))
    t = t[:b + 1] + ',' + ','.join(f'{k}:{js(v)}' for k, v in fills.items()) + t[b + 1:]
    # 7) SCENARIOS — bs22 다음
    a = one(t, re.escape('{id:"bs22",req:"std"')); b = close_of(t, a)
    stname = re.search(r'flow:\[([\w$]+)\("open"', t[a:b]).group(1)
    sj = scen_js
    sj = re.sub(r'\bst\(', stname + '(', sj)
    sj = esc(sj).rstrip().rstrip(',')
    t = t[:b + 1] + ',' + sj + t[b + 1:]
    # 8) STORY
    a = one(t, re.escape('bs22:{keymen:['))
    b = close_of(t, a + len('bs22:'))
    t = t[:b + 1] + ',' + ','.join(f'{k}:{js(v)}' for k, v in story.items()) + t[b + 1:]
    return t

if __name__ == '__main__':
    import build_new, resolve, scen_v25, integrate_data
    src, dst = [a for a in sys.argv[1:] if not a.startswith('--')][:2]
    t = open(src, encoding='utf8').read()
    d = integrate_data.collect(final='--dry' not in sys.argv)
    t2 = patch(t, d['html'], d['meta'], d['cust'], d['fills'], scen_v25.js(), scen_v25.STORY, d['canvas'], d['deck_full'])
    open(dst, 'w', encoding='utf8').write(t2)
    print('in', len(t.encode()), 'out', len(t2.encode()), '+', len(t2.encode()) - len(t.encode()))
