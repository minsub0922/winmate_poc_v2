# Fetch every case-study page in catalog.json and list the images inside the article body.
import json, re, sys, os, html, concurrent.futures as cf, urllib.request
CAT = json.load(open('/home/claude/wm/data/catalog.json'))
OUT = '/home/claude/media/pages'
os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode('utf-8', 'replace'), r.geturl()

def norm(u):
    u = html.unescape(u.strip())
    if u.startswith('//'): u = 'https:' + u
    elif u.startswith('/'): u = 'https://www.samsung.com' + u
    return u.split('?')[0] if '$' not in u else u

def body(h):
    i = h.find('<div class="board-detail-content')
    if i < 0: return ''
    k = h.find('<!-- e : 컨텐츠 본문', i)
    j = h.find('</section>', i)
    ends = [x for x in (k, j) if x > 0]
    return h[i:min(ends)] if ends else h[i:i + 200000]

def imgs(b):
    out = []
    # <picture data-default-src> with <source media=min-width> + <img>
    for m in re.finditer(r'<picture\b([^>]*)>(.*?)</picture>', b, re.S):
        attrs, inner = m.group(1), m.group(2)
        alt = re.search(r'data-alt="([^"]*)"', attrs)
        pc = re.search(r'<source[^>]*min-width[^>]*srcset="([^"]+)"', inner) or re.search(r'data-default-src="([^"]+)"', attrs) or re.search(r'<img[^>]*src="([^"]+)"', inner)
        mo = re.search(r'<source[^>]*max-width[^>]*srcset="([^"]+)"', inner)
        ia = re.search(r'<img[^>]*alt="([^"]*)"', inner)
        if pc: out.append({'u': norm(pc.group(1).split(',')[0].split(' ')[0]), 'alt': html.unescape((alt and alt.group(1)) or (ia and ia.group(1)) or ''), 'mo': mo and norm(mo.group(1).split(',')[0].split(' ')[0]), 'pos': m.start()})
    b2 = re.sub(r'<picture\b.*?</picture>', '', b, flags=re.S)
    for m in re.finditer(r'<img\b[^>]*>', b2):
        t = m.group(0)
        s = re.search(r'\b(?:data-src|src)="([^"]+)"', t)
        if not s or not s.group(1).strip() or s.group(1).startswith('data:'): continue
        a = re.search(r'alt="([^"]*)"', t)
        out.append({'u': norm(s.group(1)), 'alt': html.unescape(a.group(1) if a else ''), 'pos': 10**7 + m.start()})
    # background images in style attrs
    for m in re.finditer(r'url\((["\']?)([^)"\']+\.(?:jpe?g|png|webp))\1\)', b):
        out.append({'u': norm(m.group(2)), 'alt': '', 'bg': True, 'pos': 2 * 10**7 + m.start()})
    seen, res = set(), []
    for x in out:
        if x['u'] in seen: continue
        seen.add(x['u']); res.append(x)
    return res

def one(c):
    cid = str(c['id'])
    fn = f'{OUT}/case-{cid}.html'
    try:
        if not os.path.exists(fn):
            h, final = get(c['url'])
            open(fn, 'w').write(h)
        h = open(fn).read()
        b = body(h)
        og = re.search(r'<meta property="og:image" content="([^"]+)"', h)
        return cid, {'url': c['url'], 'imgs': imgs(b), 'og': og and norm(og.group(1)), 'blen': len(b)}
    except Exception as e:
        return cid, {'url': c['url'], 'err': str(e)}

res = {}
with cf.ThreadPoolExecutor(8) as ex:
    for cid, r in ex.map(one, [c for c in CAT['cases'] if c['url']]):
        res[cid] = r
json.dump(res, open('/home/claude/media/case_pages.json', 'w'), ensure_ascii=False, indent=1)
n = sum(len(r.get('imgs', [])) for r in res.values())
print('cases', len(res), 'errors', sum(1 for r in res.values() if 'err' in r), 'imgs', n, 'empty', sum(1 for r in res.values() if not r.get('imgs')))
