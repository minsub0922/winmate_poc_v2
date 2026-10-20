# out/*.json → 앱 데이터 — python3 build/hist/merge.py [--dry]
import re
#   src/seeds_cases.json(케이스 parts 교체) · src/seeds_parts.json(A 커피 · E 오피스 parts) · img/fill/h1-*.json(새 사진 묶음)
#   · src/fill_sources.md(11차 사진 출처 표) · build/hist/merge_report.md
# 근거(ev): 의미 단위마다 글의 숫자 · 낱말 · 제품/솔루션/사례 이름으로 이 케이스의 근거 풀(요구사항 문장 · 키맨 요구 · 제작자 메모 줄 · 첨부 ·
#   선택 제품/솔루션/사례 · 검증된 공개 자료 웹 출처)에서 고른다. 사진 단위는 사진 출처.
import json, re, os, sys, glob, base64, io
from PIL import Image
DRY = '--dry' in sys.argv
U = json.load(open('build/hist/units.json'))
CAT = json.load(open('data/catalog.json'))
P = {p['id']: p for p in CAT['products']}; S = {s['id']: s for s in CAT['solutions']}; C = {str(c['id']): c for c in CAT['cases']}
IMGS = json.load(open('data/images.json'))['pids']; PID_BY_FILE = {v['file']: k for k, v in IMGS.items()}
LIB = {e['addr']: e for e in json.load(open('build/bs/lib/catalog.json'))}
OLD = json.load(open('build/hist/seeds_cases.orig.json'))  # 개편 전 원본 — merge 를 여러 번 돌려도 같은 결과
OTHER = {p['id']: p for p in json.load(open('build/hist/seed_other.json'))}
SRCMD = open('src/seeds_cases.sources.md', encoding='utf8').read()
# --- web sources harvested from the audited old evidence (+ FACTS B product spec lines)
WEB = {}; WEB_OF = {}
for p in OLD:
    for s in p['parts']:
        for x in s['layouts']:
            for e in (x.get('ev') or {}).values():
                for src in e.get('src', []):
                    if src['k'] == 'web':
                        WEB[(src['title'], src.get('url'))] = {k: src[k] for k in ('k', 'title', 'sub', 'url') if k in src}
                        WEB_OF.setdefault(p['id'], set()).add((src['title'], src.get('url')))
PSPEC = {}  # product evidence lines from the old evidence (FACTS B wording)
for p in OLD:
    for s in p['parts']:
        for x in s['layouts']:
            for e in (x.get('ev') or {}).values():
                for src in e.get('src', []):
                    if src['k'] == 'product': PSPEC.setdefault(src['ref'], src['sub'])
def segtxt(segs):
    if isinstance(segs, str): return segs
    return ''.join(s['t'] if 't' in s else '@' + s['ref'] for s in (segs or []))
def plain(v):
    if isinstance(v, dict): v = v.get('html', '')
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', str(v))).strip()
NUM = re.compile(r'(?<![A-Za-z\d])\d[\d,]*(?:\.\d+)?')
DATE = re.compile(r'(19|20)\d\d\.\d{1,2}(\.\d{1,2})?|\b\d{1,2}/\d{1,2}\b|\b\d{1,2}\.\d{1,2}\s*~|~\s*\d{1,2}\.\d{1,2}\b')
def nums(s):
    out = set()
    s = DATE.sub(' ', s or '')
    for m in NUM.finditer(s):
        v = m.group(0).rstrip(',.').replace(',', '')
        if not v: continue
        if re.fullmatch(r'(19|20)\d\d', v): continue  # years link everything — skip
        if '.' in v or len(v.lstrip('0')) >= 2: out.add(v.lstrip('0') or '0')
    return out
STOP = set('및 등 위 수 것 이 그 저 더 때 중 후 전 각 약 총 월 연 일 곳 대 개 건 명 실 원 만 억 % 의 를 을 은 는 가 에 로 으로 하고 하는 있는 없는 합니다 입니다 · 제안'.split())
WORD = re.compile(r'[가-힣A-Za-z][가-힣A-Za-z0-9\-]{1,}')
def words(s): return {w for w in WORD.findall(s or '') if w not in STOP and len(w) >= 2}
def sentences(t): return [x.strip() for x in re.split(r'(?<=[.?!다])\s+|\n+', t or '') if len(x.strip()) > 6]
def pool_of(p):
    r = p['req']; f = r['form']; pool = []
    for s in sentences(segtxt(r.get('free'))): pool.append({'k': 'req', 'title': '고객 요구사항 · 자유형식', 'sub': re.sub(r'@(\w+):(\w+)', lambda m: (P.get(m.group(2)) or S.get(m.group(2)) or {}).get('name') or (C.get(m.group(2)) or {}).get('cust') or m.group(0), s)})
    for k in f.get('keymen', []):
        for x in k['reqs']:
            t = segtxt(x).strip()
            if t: pool.append({'k': 'req', 'title': f"{k['name']} 요구", 'sub': t})
    for ln in (f.get('note') or '').split('\n'):
        if ln.strip(): pool.append({'k': 'req', 'title': '제작자 메모', 'sub': ln.strip()})
    for fl in r.get('files', []): pool.append({'k': 'file', 'title': fl['name'], 'ftype': fl.get('type') or fl['name'].split('.')[-1], 'ref': fl['id'], 'sub': fl.get('memo') or fl.get('text', '')[:200]})
    ctx = p.get('ctx', {})
    for i in ctx.get('products', []):
        if i in P: pool.append({'k': 'product', 'title': P[i]['name'], 'ref': i, 'sub': PSPEC.get(i) or f"{P[i]['model']} · {P[i]['cat']} · {P[i]['spec']}", '_names': [P[i]['model'], P[i]['name']]})
    for i in ctx.get('solutions', []):
        if i in S: pool.append({'k': 'solution', 'title': S[i]['name'], 'ref': i, 'sub': f"{S[i]['cat']} — {S[i]['desc']}", '_names': [S[i]['name']]})
    for i in ctx.get('cases', []):
        c = C.get(str(i))
        if c:
            for pr in (c.get('proof') or [])[:3] + ([c['scale']] if c.get('scale') else []):
                pool.append({'k': 'case', 'title': c['cust'], 'ref': str(i), 'sub': pr, 'url': c.get('url'), '_names': [c['cust']]})
    own = WEB_OF.get(p['id'], set())
    for key, w in WEB.items(): pool.append(dict(w, _own=key in own))
    for s in pool: s['_n'] = nums(s['title'] + ' ' + s['sub']); s['_w'] = words(s['title'] + ' ' + s['sub'])
    return pool
# 근거는 단위당 가장 맞는 1개, 사진 단위에는 근거를 달지 않는다(사진은 '직접 고름'으로 보임) — index.html 이 16MB 안에 들도록
MAX_SRC = 1
def clip(t, n):
    t = re.sub(r'\s+', ' ', str(t or '')).strip()
    return t[:n - 1] + '…' if len(t) > n else t
IMG_EV = False
def pick(text, pool):
    tn, tw = nums(text), words(text)
    if not text or (not tn and len(tw) < 2): return []
    sc = []
    for s in pool:
        shared = len(tn & s['_n'])
        name = any(n and n in text for n in s.get('_names', []))
        ov = len(tw & s['_w']) / max(1, min(len(tw), len(s['_w'])))
        extra = len(s['_n'] - tn)
        score = 2.2 * shared + (3 if name else 0) + 1.6 * ov - min(1.2, 0.12 * extra)
        if tn and not shared and not name and ov < 0.5: continue
        if s['k'] == 'web':
            strong = [n for n in (tn & s['_n']) if '.' in n or len(n) >= 3]
            if not shared or (not s.get('_own') and len(strong) < 2): continue
        if score >= 2.6: sc.append((score, s))
    sc.sort(key=lambda x: -x[0])
    out, seen = [], set()
    top = sc[0][0] if sc else 0
    for score, s in sc:
        if out and score < 0.6 * top: break
        key = (s['k'], s.get('ref') or s.get('url') or s['title'], s['sub'][:40])
        if key in seen: continue
        seen.add(key); o = {k: v for k, v in s.items() if not k.startswith('_')} | {'by': 'user'}
        o['sub'] = clip(o.get('sub', ''), 80)  # 앱이 근거를 고를 때와 같은 길이보다 짧게 80자
        out.append(o)
        if len(out) >= MAX_SRC: break
    return out
def img_ev(v):
    src = v.get('src', '')
    e = LIB.get(src) or {}
    desc = v.get('name') or e.get('desc') or ''
    o = {'k': 'image', 'title': desc or '사진', 'sub': (e.get('group') or '사진') + ' · ' + (e.get('origin') or 'samsung.com') + ' · 앱 이미지 라이브러리', 'by': 'user'}
    if src in PID_BY_FILE: o['ref'] = PID_BY_FILE[src]
    if e.get('page', '').startswith('http'): o['url'] = e['page']
    return o
# --- new photos → packs
NEWDIR = 'build/hist/newimg'
newmeta = {}
for fn in sorted(glob.glob(NEWDIR + '/*.json')):
    m = json.load(open(fn)); base = os.path.basename(fn)[:-5]
    for ext in ('.jpg', '.png'):
        if os.path.exists(os.path.join(NEWDIR, base + ext)): newmeta['img/hist/' + base + ext] = m
outs = {}
for fn in sorted(glob.glob('build/hist/out/*.json')):
    if os.path.basename(fn).startswith('_'): continue
    o = json.load(open(fn)); outs[o['id']] = o
used_new = []
for o in outs.values():
    for x in [*o.get('deck', []), *[y for s in o['parts'] for y in s['layouts']]]:
        for v in (x.get('img') or {}).values():
            if v and v.get('src', '').startswith('img/hist/') and v['src'] not in used_new: used_new.append(v['src'])
missing = [a for a in used_new if a not in newmeta]
assert not missing, ('new photo without meta', missing)
PACKS, cur, size, packmap = [], [], 0, {}
LIMIT = 8_700_000  # 게시 파일 수 한도(511) 때문에 묶음을 크게, 수를 적게
for a in used_new:
    b = open(os.path.join(NEWDIR, os.path.basename(a)), 'rb').read()
    d = ('data:image/png;base64,' if a.endswith('.png') else 'data:image/jpeg;base64,') + base64.b64encode(b).decode()
    if cur and size + len(d) > LIMIT: PACKS.append(cur); cur, size = [], 0
    cur.append((a, d)); size += len(d)
if cur: PACKS.append(cur)
assert len(PACKS) <= 6, f'too many packs {len(PACKS)}'
for pi, pk in enumerate(PACKS):
    name = f'img/fill/h1-{"abcdef"[pi]}.json'
    for k, (a, d) in enumerate(pk): packmap[a] = f'{name}#{k}'
    if not DRY: json.dump({'images': [d for _, d in pk]}, open(name, 'w'))
def remap(v):
    if v and v.get('src') in packmap: v = dict(v, src=packmap[v['src']])
    return v
# --- build parts
report = ['# 히스토리 예시 개편 — 합치기 보고', '']
def build(o, code):
    parts = []
    deck = o.get('deck') or []
    pool = pool_of(o['_p'])
    nev = nunit = 0
    def lay(x, uidv):
        nonlocal nev, nunit
        t = x.get('t') or {}; img = {k: remap(v) for k, v in (x.get('img') or {}).items()}
        ov = {'t': t, 'img': img}
        if x.get('r'): ov['r'] = x['r']
        ev = {}
        if x['status'] != 'empty':
            for u in U.get(x['f']) or []:
                if u['isImg']:
                    v = (x.get('img') or {}).get(str(u['imgs'][0]))
                    if v and IMG_EV: ev[u['key']] = {'by': 'user', 'src': [img_ev(v)]}
                    continue
                vals = [plain(t[str(i)]) for i in u['ft'] if str(i) in t]
                if not vals: continue
                nunit += 1
                src = pick(' '.join(vals), pool)
                if src: ev[u['key']] = {'by': 'user', 'src': src}; nev += 1
        out = {'uid': uidv, 'f': x['f'], 'status': x['status'], 'ov': ov}
        if ev: out['ev'] = ev
        return out
    c = code.lower()
    if deck:
        parts.append({'id': f's_{c}_00', 'type': 'cover', 'name': '표지', 'items': ['표지'], 'form': 'list', 'text': '', 'done': True, 'deck': True,
                      'layouts': [lay(x, f'l_{c}_00_{k + 1}') for k, x in enumerate(deck)]})
    for pi, s in enumerate(o['parts']):
        part = {'id': f's_{c}_{pi + 1:02d}', 'type': s['type'], 'name': s['name'], 'items': s['items'], 'form': s.get('form', 'list'), 'text': s.get('text', ''), 'done': True,
                'layouts': [lay(x, f'l_{c}_{pi + 1:02d}_{k + 1}') for k, x in enumerate(s['layouts'])]}
        parts.append(part)
    report.append(f"- {code} {o['id']}: 파트 {len(o['parts'])} · 장 {sum(len(s['layouts']) for s in o['parts']) + len(deck)} · 근거 연결 단위 {nev}/{nunit}")
    return parts
CODE = {'p_seed_acoffee': 'A', 'p_seed_eoffice': 'E'}
newcases = []
for p in OLD:
    q = dict(p)
    if p['id'] in outs:
        o = outs[p['id']]; o['_p'] = p
        q['parts'] = build(o, p['id'].split('_')[-1].upper())
        q['stage'] = 'story'
    newcases.append(q)
sp = {}
for pid in ('p_seed_acoffee', 'p_seed_eoffice'):
    if pid in outs:
        o = outs[pid]; o['_p'] = OTHER[pid]
        sp[pid] = build(o, CODE[pid])
if not DRY:
    json.dump(newcases, open('src/seeds_cases.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(sp, open('src/seeds_parts.json', 'w'), ensure_ascii=False, indent=1)
    # photo sources table
    fsrc = open('src/fill_sources.md', encoding='utf8').read()
    head = '## 11차 · 히스토리 예시 개편 — 새로 가져온 사진 (`img/fill/h1-*.json`)'
    for h in (head, head.replace('## 11차', '## 10차')):  # 이 표만 들어내고(뒤에 다른 절이 있으면 그대로) 맨 끝에 다시
        if h in fsrc:
            i = fsrc.index(h); j = fsrc.find('\n## ', i + len(h))
            fsrc = fsrc[:i].rstrip() + '\n' + (('\n' + fsrc[j + 1:]) if j >= 0 else '')
    rows = [head, '', '히스토리 예시(seeds_cases.json · seeds_parts.json) 기승전결 개편(2026-10-19)에서 samsung.com 페이지에서 가져와 자르기 · 크기 조정만 한 사진.', '', '| 주소 | 내용 | 출처 페이지 | 원본 |', '|---|---|---|---|']
    for a in used_new:
        m = newmeta[a]; rows.append(f"| `{packmap[a]}` | {os.path.splitext(os.path.basename(a))[0]} · {m.get('desc', '')} | {m.get('page', '')} | {m.get('orig', '')} |")
    open('src/fill_sources.md', 'w', encoding='utf8').write(fsrc.rstrip() + '\n\n' + '\n'.join(rows) + '\n')
report.append(f'- 새 사진 {len(used_new)}장 → 묶음 {len(PACKS)}개 ({", ".join(f"h1-{chr(97 + i)}.json · {len(pk)}장" for i, pk in enumerate(PACKS))})')
open('build/hist/merge_report.md', 'w').write('\n'.join(report))
print('\n'.join(report))
