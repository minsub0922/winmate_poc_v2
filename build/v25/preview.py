# 레이아웃 + 채운 값 → 미리보기 HTML (앱 applyOverrides 를 흉내: data-tb 글 · data-img keep 사진 · data-fill 묶음 풀기)
import json, re, sys, os, base64, hashlib
W = '/home/claude/w25'
def load_std():
    s = open(f'{W}/src/std_layouts.js').read()
    hi = s.index('export const STD_HTML = ') + 24
    return json.loads(s[hi:s.rindex(';')])
def load_photo():
    s = open(f'{W}/src/photo_layouts.js').read()
    i = s.index('export const PHOTO_HTML = ') + len('export const PHOTO_HTML = ')
    return json.loads(s[i:s.rindex(';')]) if s.rstrip().endswith(';') else {}
HTML = {}
HTML.update(load_std())
EXTRA = os.environ.get('EXTRA_HTML')
if EXTRA:
    for p in EXTRA.split(':'): HTML.update(json.load(open(p)))
_B = {}
def bundle(path):
    if path not in _B:
        for base in (f'{W}/img/fill/', f'{W}/img/bg/', '/home/claude/v3/out/fill/'):
            fp = base + os.path.basename(path)
            if os.path.exists(fp) and path.startswith(('img/fill/', 'img/bg/')): _B[path] = json.load(open(fp))['images']; break
    return _B[path]
def resolve(src):
    if not src: return ''
    if src.startswith('@'):
        import sys; sys.path.insert(0, '/home/claude/v3'); import keys
        src = keys.preview_src(src)
        if not src: return 'file:///home/claude/v3/missing.png'
        if src.startswith('/'): return 'file://' + src
    m = re.match(r'^(img/(?:fill|bg)/[^#]+)#(\d+)$', src)
    if m:
        key = hashlib.md5(src.encode()).hexdigest()[:12]
        d = bundle(m.group(1))[int(m.group(2))]
        ext = 'png' if d.startswith('data:image/png') else 'jpg'
        fp = f'/home/claude/v3/cache/{key}.{ext}'
        if not os.path.exists(fp): open(fp, 'wb').write(base64.b64decode(d.split(',', 1)[1]))
        return 'file://' + fp
    if src.startswith('img/'): return 'file://' + f'{W}/{src}'
    if src.startswith('/'): return 'file://' + src
    return src
def page(slides, out):
    data = []
    for s in slides:
        h = HTML[s['f']]
        h = re.sub(r'data-fill="([^"]+)"', lambda m: f'data-fill="{m.group(1)}" data-src="{resolve(m.group(1))}"', h)
        h = re.sub(r' src="(img/[^"]+)"', lambda m: f' src="file://{W}/{m.group(1)}"', h)
        img = {k: dict(v, url=resolve(v.get('src'))) for k, v in (s.get('img') or {}).items()}
        data.append({'f': s['f'], 'h': h, 't': s.get('t') or {}, 'img': img, 'label': s.get('label', s['f'])})
    css = ("@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR');font-weight:100 400}"
           "@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR Medium');font-weight:500}"
           "@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR Bold');font-weight:600 900}"
           "@font-face{font-family:'Manrope';src:local('Noto Sans CJK KR Bold');font-weight:600 900}"
           "body{margin:0;background:#666}.s{width:1280px;height:720px;margin-bottom:10px;position:relative}")
    js = r'''
const D = __DATA__;
const root = document.body;
D.forEach((s, k) => {
  const host = document.createElement('div'); host.className = 's'; host.id = 's' + k; host.dataset.f = s.f; host.innerHTML = s.h; root.appendChild(host);
  const r = host.firstElementChild;
  r.querySelectorAll('img[data-src]').forEach(i => { i.src = i.dataset.src; });
  for (const [i, v] of Object.entries(s.t)) { const e = r.querySelector('[data-tb="' + i + '"]'); if (!e || v == null) continue;
    if (typeof v === 'object' && v.html != null) e.innerHTML = v.html; else e.textContent = String(v); }
  for (const [i, v] of Object.entries(s.img)) { const e = r.querySelector('[data-img="' + i + '"]'); if (!e || !v.url) continue;
    const im = e.tagName === 'IMG' ? e : e.querySelector('img'); if (!im) continue; im.src = v.url; if (v.fit) im.style.objectFit = v.fit; if (v.pos) im.style.objectPosition = v.pos; }
});
'''
    js = js.replace('__DATA__', json.dumps(data, ensure_ascii=False))
    open(out, 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body><script>{js}</script></body></html>')
if __name__ == '__main__':
    slides = json.load(open(sys.argv[1])); page(slides, sys.argv[2])
