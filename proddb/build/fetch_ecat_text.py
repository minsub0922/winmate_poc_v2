import json, re, html, time, subprocess, os, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ecat'))  # proddb/ecat
cats = [c for c in json.load(open('catalogs.json')) if c[0] in ('tab1','tab4','tab5','tab6') or c[2] == '93']
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
    if os.path.exists(fn): continue
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
    json.dump({'dir': d, 'tab': tab, 'group': grp, 'title': title, 'docTitle': tt.group(1).strip() if tt else '', 'pages': n, 'text': pages}, open(fn, 'w'), ensure_ascii=False)
    print(d, title, n, len(pages), flush=True)
