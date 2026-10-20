# 새 레이아웃 17장 → out/new_html.json · out/new_meta.json (+ 미리보기용 @key 그대로 버전)
import sys, json, re, os
sys.path.insert(0, '/home/claude/v3')
import importlib, decks_new, keys
importlib.reload(decks_new)
W = '/home/claude/w25'
ORDER = ['f', 'c', 'cv', 'code', 'name', 'when', 'g', 'p', 'p2', 'ind', 'sol', 'sample', 'eb', 'hl', 'sub', 'foot', 'nT', 'nI', 'ik', 'ih', 'ph', 'phs', 'pc', 'req', 'prods', 'sols', 'txt', 'pf']
def std_html():
    s = open(f'{W}/src/std_layouts.js').read(); hi = s.index('export const STD_HTML = ') + 24
    return json.loads(s[hi:s.rindex(';')])
def std_meta():
    s = open(f'{W}/src/std_layouts.js').read(); mi = s.index('export const STD_META = ') + 24; me = s.index('\n];', mi) + 2
    return {m['f']: m for m in json.loads(s[mi:me])}
def ph09n():
    """L_AIS_09 + 각주 칸(t26) — 사진 6장 시나리오에 각주가 필요한 장용"""
    H = std_html()['L_AIS_09']; M0 = dict(std_meta()['L_AIS_09'])
    note = ('<div style="position: absolute; left: 64px; top: 622px; width: 1152px; font-size: 8.8px; line-height: 1.5; color: #8a91a0" data-tb="26">'
            '* 각주 — 기능 지원 조건 · 서비스 이용 조건 등</div>')
    i = H.index('<div style="position: absolute; left: 64px; top: 668px')
    h = H[:i] + note + H[i:]
    M0.update(f='L_STD_PH09N', code='STD-PH09N', name='2행 · 3단계 사진 시나리오 + 각주', when='두 가지 시나리오를 사진 3단계로 보여 주고 아래에 기능 조건 각주를 달 때',
              nT=M0['nT'] + 1, txt=M0['txt'] + ' * 각주 — 기능 지원 조건 · 서비스 이용 조건 등', ind=None, g='표준 제안서 · 공통 · 사진 시나리오 — 2025 업종별 제안서 표준 양식', cv='ST_V25')
    return h, M0
def build(final=False):
    html, meta = {}, []
    for s, d in decks_new.OUT:
        h = s.html()
        if final:
            def sub(m):
                a = keys.app_addr(m.group(1))
                return f'data-fill="{a}"' if a else 'data-fill="img/fill/v-missing.json#0"'
            h = re.sub(r'data-fill="(@[a-z0-9_]+)"', sub, h)
            h = re.sub(r'alt="([^"]*)" style="display: block', lambda m: m.group(0), h)
        m = dict(f=s.fid, c='ST', cv='ST_V25', sol=None, nT=s.ntb, nI=s.nimg, ik=s.kinds, ih=s.hints, ph=0, phs=[], pc=0,
                 txt=' '.join(t for t in s.texts if t), pf=round(min(1.0, s.area / (1280 * 720)), 2), **d)
        assert h.count('data-tb=') == s.ntb and h.count('data-img=') == s.nimg, s.fid
        html[s.fid] = h; meta.append({k: m.get(k) for k in ORDER})
    h, m = ph09n(); html['L_STD_PH09N'] = h; meta.append({k: m.get(k) for k in ORDER})
    os.makedirs('/home/claude/v3/out', exist_ok=True)
    tag = 'final' if final else 'pre'
    json.dump(html, open(f'/home/claude/v3/out/new_html_{tag}.json', 'w'), ensure_ascii=False)
    json.dump(meta, open(f'/home/claude/v3/out/new_meta_{tag}.json', 'w'), ensure_ascii=False, indent=1)
    return html, meta
if __name__ == '__main__':
    html, meta = build(final='--final' in sys.argv)
    for m in meta: print(m['f'], m['p'], 'nT', m['nT'], 'nI', m['nI'], 'pf', m['pf'], len(html[m['f']]) // 1024, 'KB')
