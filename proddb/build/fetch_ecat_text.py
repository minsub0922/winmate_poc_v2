import json, re, html, time, subprocess, os, sys
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ecat')  # proddb/ecat
# ECAT_OUT: staging ecat dir (DSS update runs never write into the active proddb/ecat/text).
# ECAT_LIST: the run's book list in catalogs.json form ([tab, group, Dir, title]) — defaults to proddb/ecat/catalogs.json.
OUT = os.environ.get('ECAT_OUT') or BASE
LIST = os.environ.get('ECAT_LIST') or os.path.join(BASE, 'catalogs.json')
os.chdir(OUT)
cats = [c for c in json.load(open(LIST)) if c[0] in ('tab1','tab4','tab5','tab6') or c[2] == '93']
os.makedirs('text', exist_ok=True)
def get(d, s):
    u = f"https://samsung.aiibook.net/b2b/access/ecatalogt.php?Dir={d}&acmode=disable&eclang=ko&um=t&start={s}"
    for k in range(3):
        r = subprocess.run(['curl','-sS','--max-time','40',u], capture_output=True)
        if r.returncode == 0 and r.stdout: return r.stdout.decode('utf-8','ignore')
        time.sleep(2)
    return ''
out = {}
for tab, grp, d, title in cats:
    fn = f'text/{d}.json'
    if os.path.exists(fn):
        prev = json.load(open(fn))
        if prev.get('pages') and not prev.get('missing'): continue  # only a complete file counts as done
    h = get(d, 1)
    m = re.search(r'var cataPages = (\d+)', h); n = int(m.group(1)) if m else 0
    tt = re.search(r'<title>([^<]*)</title>', h)
    pages = {}
    def harvest(h):
        for mm in re.finditer(r'(\d+)페이지 내용 : (.*?)(?=\d+페이지 내용 : |</|$)', h, re.S):
            pages[int(mm.group(1))] = html.unescape(re.sub(r'<[^>]+>', ' ', mm.group(2))).strip()
    harvest(h)
    s = 2
    while s <= n:
        if s not in pages:
            harvest(get(d, s)); time.sleep(0.3)
        s += 1
    missing = [p for p in range(1, n + 1) if p not in pages]  # failed or absent pages — never silently treated as complete
    json.dump({'dir': d, 'tab': tab, 'group': grp, 'title': title, 'docTitle': tt.group(1).strip() if tt else '', 'pages': n, 'text': pages,
               'missing': missing, 'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')}, open(fn, 'w'), ensure_ascii=False)
    print(d, title, n, len(pages), 'missing', len(missing), flush=True)
