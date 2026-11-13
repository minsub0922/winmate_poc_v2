"""장표 렌더 확인 — 레이아웃 HTML 을 1280×720 으로 그려 PNG 와 넘침 · 잘림 · 빈 사진 목록을 남긴다(앱 없이, 같은 글꼴 · 사진 묶음).
  python3 build/subs/render_check.py <layouts.js | overrides.json> <out dir> [f ...] [--sheet]
입력:
  · *_layouts.js (export const XXX_HTML = {...}) — 레이아웃 기본 글 그대로 그림
  · overrides.json — [{"f": 레이아웃, "html": 원본 HTML(생략 시 모듈에서), "o": {"t": {칸: 글}, "img": {칸: {"src": 주소}}}, "name": 파일 이름}] — 조립한 덱의 장(목차 템플릿 · 시나리오)
사진 주소: /assets/… 는 app/web/public, img/…json#k(사진 묶음)은 app/data/static 에서 풀어 넣는다.
결과: <out>/<f>.png, <out>/report.json — 칸마다 넘침(text-overflow · 줄 넘침) · 캔버스 밖 · 깨진/빈 사진. --sheet 면 썸네일 모음(contact.jpg)도.
"""
import base64, functools, http.server, json, os, re, socketserver, sys, threading

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PUB = os.path.join(ROOT, 'app/web/public'); STATIC = os.path.join(ROOT, 'app/data/static')


def load_module(path):
    s = open(path, encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'export const (\w+_HTML) = ', s):
        start = m.end(); depth = 0; i = start; ins = False; esc = False
        while i < len(s):
            c = s[i]
            if ins:
                if esc: esc = False
                elif c == '\\': esc = True
                elif c == '"': ins = False
            elif c == '"': ins = True
            elif c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0: break
            i += 1
        out.update(json.loads(s[start:i + 1]))
    return out


class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = path.split('?')[0]
        if p.startswith('/img/'): return os.path.join(STATIC, p[1:])
        return os.path.join(PUB, p.lstrip('/'))
    def log_message(self, *a): pass


CHECK = r"""
() => {
  const root = document.querySelector('#slide > div'); const R = root.getBoundingClientRect(); const out = [];
  for (const el of root.querySelectorAll('[data-tb]')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const t = el.textContent.trim();
    if (!t) continue;
    const clipX = el.scrollWidth > el.clientWidth + 1 && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap');
    const clipY = el.scrollHeight > el.clientHeight + 2 && (cs.overflow === 'hidden' || cs.webkitLineClamp !== 'none');
    const outside = r.right > R.right + 0.5 || r.bottom > R.bottom + 0.5 || r.left < R.left - 0.5 || r.top < R.top - 0.5;
    if (clipX || clipY || outside) out.push({ tb: el.dataset.tb, text: t.slice(0, 60), clipX, clipY, outside, w: Math.round(r.width), h: Math.round(r.height) });
  }
  const imgs = [];
  for (const im of root.querySelectorAll('img')) { const ok = im.complete && im.naturalWidth > 1; if (!ok) imgs.push({ img: im.closest('[data-img]')?.dataset.img, src: (im.getAttribute('data-fill') || im.getAttribute('src') || '').slice(0, 80) }); }
  return { text: out, images: imgs };
}
"""
HYDRATE = r"""
async () => {
  const cache = {};
  for (const im of document.querySelectorAll('img[data-fill]')) {
    const [file, k] = im.getAttribute('data-fill').split('#');
    if (!cache[file]) cache[file] = fetch('/' + file).then((r) => r.json());
    const pack = await cache[file]; im.src = (pack.images || pack)[+k];
  }
  await Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
  await document.fonts.ready;
}
"""


def apply_overrides(html, o):
    """앱 applyOverrides 의 렌더용 축약판 — data-tb 칸 글 · data-img 칸 사진만 바꾼다."""
    from html.parser import HTMLParser  # noqa: F401 (표준 파서만 — 칸 위치는 정규식으로)
    t = (o or {}).get('t') or {}; im = (o or {}).get('img') or {}
    def sub_tb(m):
        k = m.group(2); v = t.get(k, t.get(int(k)) if k.isdigit() else None)
        if v is None: return m.group(0)
        if isinstance(v, dict): v = v.get('html') or v.get('text') or ''
        v = str(v)
        if '<br>' not in v: v = v.replace('&', '&amp;').replace('<', '&lt;').replace('\n', '<br>')
        return m.group(1) + v + m.group(3)
    html = re.sub(r'(<(?:div|span)[^>]*data-tb="(\d+)"[^>]*>)(?:(?!</?(?:div|span)\b).)*?(</(?:div|span)>)', sub_tb, html, flags=re.S)
    def sub_img(m):
        k = m.group(1); v = im.get(k, im.get(int(k)) if k.isdigit() else None)
        if not v: return m.group(0)
        src = v.get('src') if isinstance(v, dict) else v
        block = m.group(0)
        block = re.sub(r'<img [^>]*>', lambda q: re.sub(r'\s(?:src|data-fill)="[^"]*"', '', q.group(0)).replace('<img ', '<img ' + (f'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-fill="{src}" ' if re.search(r'\.json#\d+$', src or '') else f'src="{src}" ')), block, count=1)
        if isinstance(v, dict) and v.get('fit'): block = re.sub(r'object-fit: \w+', 'object-fit: ' + v['fit'], block, count=1)
        return block
    html = re.sub(r'<div[^>]*data-img="(\d+)"[^>]*>.*?</div>', sub_img, html, flags=re.S)
    return html


def main():
    src, out = sys.argv[1], sys.argv[2]
    only = [a for a in sys.argv[3:] if not a.startswith('--')]
    os.makedirs(out, exist_ok=True)
    if src.endswith('.js'):
        H_ = load_module(src); jobs = [{'f': f, 'html': H_[f], 'name': f} for f in H_ if not only or f in only]
    else:
        jobs = json.load(open(src)); mods = {}
        for j in jobs:
            if 'html' not in j:
                mod = j.get('module')
                if mod not in mods: mods[mod] = load_module(os.path.join(ROOT, mod))
                j['html'] = mods[mod][j['f']]
            j['html'] = apply_overrides(j['html'], j.get('o'))
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    from playwright.sync_api import sync_playwright
    report = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        pg = b.new_page(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
        pg.goto(f'http://127.0.0.1:{port}/fonts/fonts.css')
        for j in jobs:
            doc = (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="http://127.0.0.1:{port}/fonts/fonts.css">'
                   f'<base href="http://127.0.0.1:{port}/"><style>html,body{{margin:0;background:#fff}}</style></head><body><div id="slide">{j["html"]}</div></body></html>')
            pg.set_content(doc, wait_until='load')
            pg.evaluate(HYDRATE)
            pg.wait_for_timeout(60)
            r = pg.evaluate(CHECK)
            pg.locator('#slide > div').screenshot(path=os.path.join(out, j['name'] + '.png'))
            report[j['name']] = r
        b.close()
    srv.shutdown()
    json.dump(report, open(os.path.join(out, 'report.json'), 'w'), ensure_ascii=False, indent=1)
    bad = {k: v for k, v in report.items() if v['text'] or v['images']}
    print(json.dumps({'sheets': len(report), 'with_issues': len(bad)}, ensure_ascii=False))
    for k, v in bad.items():
        print(' ', k, '· 글', len(v['text']), [x['text'][:24] for x in v['text']][:4], '· 사진', v['images'][:3])
    if '--sheet' in sys.argv:
        from PIL import Image
        names = list(report)
        cols = 3; W = 640; Hh = 360
        sheet = Image.new('RGB', (cols * (W + 10) + 10, ((len(names) + cols - 1) // cols) * (Hh + 10) + 10), (210, 214, 222))
        for i, n in enumerate(names):
            im = Image.open(os.path.join(out, n + '.png')).convert('RGB').resize((W, Hh))
            sheet.paste(im, (10 + (i % cols) * (W + 10), 10 + (i // cols) * (Hh + 10)))
        sheet.save(os.path.join(out, 'contact.jpg'), quality=82)


if __name__ == '__main__':
    main()
