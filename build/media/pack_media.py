# 솔루션 · 유관사례 이미지 → 앱 묶음.
#   in : <work>/final.json + media_names.json (1차 선별 2,286장: 도입사례 원문 · 리포트 PDF · 영상 · 솔루션/업종 페이지)
#        <work>/verify/out/*.json  (독립 검수: wrong · text · slice · dup · bad → 뺌, trim → 그 영역만, rep · fixd)
#        <work>/ecat/out/*.json    (e-카탈로그 쪽에서 자른 솔루션 이미지)
#        <work>/xsafety/extra.json (해외 삼성 비즈니스 페이지 보강)
#   out: <repo>/img/media/t.json (카드 썸네일) · g0.json … (갤러리) — {"images": [data URL, …]}
#        <repo>/data/media.json  (항목 → 묶음 주소 · 종류 · 설명 · 크기 · 원본 · 출처 쪽, 묶음별 바이트 범위 r)
#        <repo>/src/media_sources.md (출처 대장)
# 묶음 하나는 16MB 미만. 앱은 바이트 범위(Range)로 한 장씩 받고, 서버가 Range를 무시하면 묶음 전체를 받는다(bgpack.js).
# Usage: python3 pack_media.py <repo root> [work dir=/home/claude/media]
import json, os, sys, glob, io, base64, hashlib, datetime, collections, re
import numpy as np
from PIL import Image

ROOT = sys.argv[1]
W = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/media'   # 작업 폴더: 원본 이미지(dl/ · crops/ · pdfimg/ · ecat/crops/ · xsafety/)
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = f'{HERE}/data'   # 판정 기록(저장소에 함께 둠)
sys.path.insert(0, HERE)
from photocrop import load  # noqa: E402  (RGBA → white-composited RGB)
def decisions(sub, packed):
    """판정 파일들: 작업 폴더의 <sub>/*.json, 없으면 저장소 build/media/data/<packed> (파일 이름 → 내용)"""
    fs = sorted(glob.glob(f'{W}/{sub}/*.json'))
    if fs: return [json.load(open(f)) for f in fs]
    return list(json.load(open(f'{DATA}/{packed}')).values()) if os.path.exists(f'{DATA}/{packed}') else []

GAL_SIDE, GAL_Q = int(os.environ.get('GAL_SIDE', 720)), int(os.environ.get('GAL_Q', 44))
TH_SIDE, TH_Q = 480, 52
PACK_MAX = int(os.environ.get('PACK_MAX', 16_400_000))   # JSON text bytes per gallery pack (artifact text file limit 16 MiB)
NPACK = int(os.environ.get('NPACK', 2))
HOST = 'https://images.samsung.com/'
ECAT_PAGE = 'https://samsung.aiibook.net/b2b/access/ecatalogt.php?catimage=&start={p}&callmode=&eclang=ko&Dir={d}'
ECAT_IMG = 'https://samsung.aiibook.net/b2b/catImage/{d}/{p:03d}.jpg'

CAT = json.load(open(f'{ROOT}/data/catalog.json'))
C = {str(c['id']): c for c in CAT['cases']}; S = {s['id']: s for s in CAT['solutions']}
ECATS = {x[2]: x[3] for x in json.load(open(f'{ROOT}/proddb/ecat/catalogs.json'))} if os.path.exists(f'{ROOT}/proddb/ecat/catalogs.json') else {}
final = json.load(open(f'{W}/final.json' if os.path.exists(f'{W}/final.json') else f'{DATA}/final.json'))['items']
names = json.load(open(f'{W}/media_names.json' if os.path.exists(f'{W}/media_names.json') else f'{DATA}/media_names.json'))
REP_KIND = {'scene': 3, 'people': 3, 'exterior': 2, 'kv': 3, 'screen': 2, 'product': 1, 'diagram': 0}

def dh(im):
    g = np.asarray(im.convert('L').resize((9, 8)), dtype=np.int16)
    return ''.join('1' if x else '0' for x in (g[:, 1:] > g[:, :-1]).flatten())
def ham(a, b): return sum(x != y for x, y in zip(a, b))
def short(u): return '~/' + u[len(HOST):] if u and u.startswith(HOST) else (u or '')

# ---------- 1) 1차 선별 + 독립 검수 ----------
ver = {}
for r in decisions('verify/out', 'verify_decisions.json'):
    ver.setdefault(r['key'], {'v': {}, 'rep': None, 'fixd': {}})
    e = ver[r['key']]; e['v'].update(r.get('v') or {}); e['fixd'].update(r.get('fixd') or {})
    if r.get('rep') is not None: e['rep'] = int(r['rep'])
DROP = {'wrong', 'text', 'slice', 'dup', 'bad'}
stats = collections.Counter()
items = collections.OrderedDict()   # key → [img dict]
for key, L in final.items():
    t, i = key.split(':'); b = 'sol' if t == 'solution' else 'case'
    nm = names[b][i]; pages = nm['pages']
    v = ver.get(key, {'v': {}, 'rep': None, 'fixd': {}})
    out = []
    for n, x in enumerate(L):
        g = nm['g'][n]
        d = v['v'].get(str(n)) or {}
        verdict = d.get('v')
        if verdict in DROP: stats['drop_' + verdict] += 1; continue
        box = d.get('box') if verdict == 'trim' else None
        if box: stats['trim'] += 1
        out.append({'file': x['file'], 'box': box, 'kind': x['kind'], 'desc': (v['fixd'].get(str(n)) or x['desc']).strip(), 'rep': x['rep'],
                    'n0': n, 'role': x['role'], 'orig': x['orig'], 'page': pages[g[6]] if g[6] < len(pages) else (pages[0] if pages else ''),
                    'is_rep': v['rep'] == n})
    items[key] = out

# ---------- 2) e-카탈로그 · 해외 페이지 보강 (솔루션) ----------
SOL_FIX = {'297_094': ['stpro']}
REP_FIX = {'solution:coldchain': '200_008#1', 'solution:care': '346_003#1'}   # 매장 쇼케이스 옆 콘덴싱 유닛 · 천장형 실내기를 점검하는 엔지니어
ECAT_DROP = {'297_398#2', '297_401#2', '346_005#1', '360_013#1'}   # 검토: 에어컨이 안 보이는 표지 사진 · 꺼진 제어기 단독 · 차 바퀴만 · 흐린 반투명 사진   # 검토: 이 쪽의 멀티 사이트 관제 화면은 SmartThings Pro (배치에는 sac · biot로 잡혀 있었음)
def add_extra(key, x):
    items.setdefault(key, []).append(x)
for r in decisions('ecat/out', 'ecat_out.json'):
    k = r['key']; d, p = k.split('_')
    for c in r.get('crops') or []:
        if f"{k}#{c['n']}" in ECAT_DROP: stats['ecat_drop'] += 1; continue
        fn = f'{W}/ecat/crops/{k}.jpg' if c['n'] == 1 else f"{W}/ecat/crops/{k}__{c['n']}.jpg"
        if not os.path.exists(fn): stats['ecat_missing'] += 1; continue
        for sid in SOL_FIX.get(k, c.get('sol') or []):
            if sid not in S: continue
            add_extra('solution:' + sid, {'file': fn, 'box': None, 'kind': c.get('kind') or 'scene', 'desc': (c.get('d') or '').strip(), 'rep': int(c.get('rep') or 0),
                                          'n0': 10_000, 'role': 'ecat', 'orig': ECAT_IMG.format(d=d, p=int(p)),
                                          'page': ECAT_PAGE.format(d=d, p=int(p)), 'ecat': f"{ECATS.get(d, 'e-카탈로그')} {int(p)}쪽", 'is_rep': False})
            stats['ecat'] += 1
XS = f'{W}/xsafety/extra.json' if os.path.exists(f'{W}/xsafety/extra.json') else f'{DATA}/xsafety_extra.json'
if os.path.exists(XS):
    for x in json.load(open(XS)):
        add_extra(x['key'], {'file': x['file'], 'box': None, 'kind': x['kind'], 'desc': x['desc'], 'rep': x['rep'], 'n0': 5_000, 'role': 'us',
                             'orig': x['orig'], 'page': x['page'], 'is_rep': False})
        stats['extra'] += 1

# ---------- 3) 이미지 열기 · 중복 제거 · 대표 고르기 ----------
LIB = {}  # 앱 이미지 라이브러리(images.json)의 솔루션 화면 · 사례 사진 — 같은 사진은 다시 넣지 않음
for pid, v in json.load(open(f'{ROOT}/data/images.json'))['pids'].items():
    if v['src'] in ('ui', 'case') and not v['file'].startswith('img/ph/'):
        try: LIB[pid] = dh(Image.open(f"{ROOT}/{v['file']}").convert('RGB'))
        except Exception: pass
_cache = {}
def opened(x):
    k = (x['file'], tuple(x['box']) if x['box'] else None)
    if k not in _cache:
        im = load(x['file'])
        if x['box']:
            Wd, Ht = im.size; b = x['box']
            im = im.crop((int(b[0] * Wd), int(b[1] * Ht), int(round(b[2] * Wd)), int(round(b[3] * Ht))))
        _cache[k] = im
    return _cache[k]
def score(z):
    im = opened(z); ar = im.width / max(1, im.height)
    r = z['rep'] * 10 + REP_KIND.get(z['kind'], 0) * 2 - (4 if z['role'] == 'list' else 0) - (3 if not z['desc'] else 0)
    if ar > 2.4 or ar < 0.6: r -= 12
    if min(im.size) < 180: r -= 6
    return r
for key in list(items):
    seen, out = [], []
    for x in sorted(items[key], key=lambda z: z['n0']):
        try: im = opened(x)
        except Exception: stats['open_fail'] += 1; continue
        if im.width < 60 or im.height < 60: stats['tiny'] += 1; continue
        h = dh(im)
        thr = 10 if x['role'] == 'ecat' else 5   # e-카탈로그는 같은 그림이 여러 권에 조금씩 다르게 실림
        if any(ham(h, y) <= thr for y in seen): stats['dedupe'] += 1; continue
        if any(ham(h, y) <= 5 for y in LIB.values()): stats['in_library'] += 1; continue
        seen.append(h); out.append(x)
    if not out: del items[key]; continue
    pick = next((z for z in out if z['is_rep']), None)
    if key in REP_FIX:   # 검토: 보강 이미지가 카드 대표로 더 나은 솔루션
        pg, n = REP_FIX[key].split('#')
        fn = f'{W}/ecat/crops/{pg}.jpg' if n == '1' else f'{W}/ecat/crops/{pg}__{n}.jpg'
        pick = next((z for z in out if z['file'] == fn), pick)
    if pick is None:
        first = out[0]
        best = max(out, key=score)
        # 검수에서 대표를 바꾸라 하지 않았으면 1차 대표(n0 = 0)를 두되, 그게 빠졌거나 보강 이미지가 확실히 나으면 점수로 고름
        if first['n0'] != 0: pick = best
        elif key.startswith('solution:') and score(best) >= score(first) + 8: pick = best
        else: pick = first
    out.remove(pick); out.insert(0, pick)
    items[key] = out

# ---------- 4) 인코딩: 갤러리(AVIF, 긴 변 800) · 썸네일(16:10 근처로, 480) ----------
CACHE = os.environ.get('MEDIA_CACHE', f'{W}/enc_cache'); os.makedirs(CACHE, exist_ok=True)
def avif(im, side, q):
    key = hashlib.sha1(im.tobytes() + f'{im.size}|{side}|{q}'.encode()).hexdigest()
    cf = f'{CACHE}/{key}.avif'
    if os.path.exists(cf):
        b = open(cf, 'rb').read(); return b, Image.open(io.BytesIO(b)).size
    im = im.copy(); im.thumbnail((side, side), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'AVIF', quality=q, speed=6)
    open(cf, 'wb').write(b.getvalue())
    return b.getvalue(), im.size
def thumb_img(im):
    Wd, Ht = im.size; ar = Wd / Ht
    if ar > 1.9 or ar < 0.75:
        tw, th_ = (int(Ht * 1.6), Ht) if ar > 1.9 else (Wd, int(Wd / 1.6))
        g = np.asarray(im.convert('L').resize((max(1, Wd // 4), max(1, Ht // 4))), dtype=np.float32)
        e = np.abs(np.diff(g, axis=1))[:-1, :] + np.abs(np.diff(g, axis=0))[:, :-1]
        if ar > 1.9:
            col = e.sum(axis=0); win = max(1, tw // 4); cs = np.convolve(col, np.ones(win), 'valid')
            x0 = max(0, min(Wd - tw, int(cs.argmax()) * 4)); im = im.crop((x0, 0, x0 + tw, Ht))
        else:
            row = e.sum(axis=1); win = max(1, th_ // 4); rs = np.convolve(row, np.ones(win), 'valid')
            y0 = max(0, min(Ht - th_, int(rs.argmax()) * 4)); im = im.crop((0, y0, Wd, y0 + th_))
    return im

ENC = {}   # content key → (bytes, (w, h))
def enc_key(x): return hashlib.sha1((x['file'] + str(x['box'])).encode()).hexdigest()
sol_keys = [k for k in items if k.startswith('solution:')]
def case_sort(k):
    c = C[k.split(':')[1]]
    return (c.get('ind') or 'ZZ', ''.join(chr(255 - ord(ch)) for ch in (c.get('date') or '')))
case_keys = sorted([k for k in items if k.startswith('case:')], key=case_sort)
order = sol_keys + case_keys
gal_seq = []   # unique encoded images in pack order
for k in order:
    for x in items[k]:
        ek = enc_key(x)
        if ek not in ENC: ENC[ek] = (x, None); gal_seq.append(ek)
        x['ek'] = ek
# 갤러리 묶음이 NPACK개(각 PACK_MAX 미만)에 들어가도록 — 넘치면 큰 이미지부터 품질을 낮춰 다시
budget = NPACK * PACK_MAX - NPACK * 60_000
for ek in gal_seq: ENC[ek] = avif(opened(ENC[ek][0]), GAL_SIDE, GAL_Q) + (GAL_Q,)
src_of = {x['ek']: x for k in order for x in items[k]}
def total(): return sum(4 * ((len(ENC[ek][0]) + 2) // 3) + 26 for ek in gal_seq)
while total() > budget:
    over = total() - budget
    big = sorted(gal_seq, key=lambda ek: -len(ENC[ek][0]))
    for ek in big[:max(40, len(big) // 8)]:
        q = ENC[ek][2] - 6
        if q < 30: continue
        ENC[ek] = avif(opened(src_of[ek]), GAL_SIDE, q) + (q,)
    stats['requantized_rounds'] += 1
    print('  over budget by', round(over / 1e6, 2), 'MB → lowered quality of the largest images', flush=True)
th = {}
for k in order:
    x = items[k][0]
    th[k] = avif(thumb_img(opened(x)), TH_SIDE, TH_Q)

# ---------- 5) 묶음 + 바이트 범위 ----------
def data_url(b): return 'data:image/avif;base64,' + base64.b64encode(b).decode()
def write_pack(path, blobs):
    parts, ranges, pos = [], [], 0
    head = '{"images":['; pos = len(head); parts.append(head)
    for j, b in enumerate(blobs):
        s = ('' if j == 0 else ',') + '"'; u = data_url(b)
        start = pos + len(s); parts.append(s + u + '"'); pos += len(s) + len(u) + 1
        ranges.append([start, start + len(u)])
    parts.append(']}')
    txt = ''.join(parts); open(path, 'w', encoding='ascii', newline='').write(txt)
    assert all(txt[a:b].startswith('data:image/avif;base64,') and txt[b] == '"' for a, b in ranges)
    return ranges, len(txt)
os.makedirs(f'{ROOT}/img/media', exist_ok=True)
for f in glob.glob(f'{ROOT}/img/media/*.json'): os.remove(f)
packs, cur, size = [], [], len('{"images":[]}')
for ek in gal_seq:
    add = len(data_url(ENC[ek][0])) + 3
    if cur and size + add > PACK_MAX: packs.append(cur); cur, size = [], len('{"images":[]}')
    cur.append(ek); size += add
if cur: packs.append(cur)
addr, R, psize = {}, {}, []
for pi, P in enumerate(packs):
    url = f'img/media/g{pi}.json'
    rg, n = write_pack(f'{ROOT}/{url}', [ENC[ek][0] for ek in P]); R[url] = rg; psize.append(n)
    for j, ek in enumerate(P): addr[ek] = f'{url}#{j}'
tk = order
rg, tsize = write_pack(f'{ROOT}/img/media/t.json', [th[k][0] for k in tk]); R['img/media/t.json'] = rg
taddr = {k: f'img/media/t.json#{j}' for j, k in enumerate(tk)}

# ---------- 6) data/media.json (번들에 들어가므로 짧게) ----------
# P: 묶음 주소 목록 · L: 묶음별 [첫 data URL 시작 위치, 각 data URL 길이…] (다음 시작 = 앞 시작 + 길이 + 3: '","')
# 이미지 주소 = 묶음 번호 × 10000 + 묶음 안 번호 · 종류는 한 글자 · 원본 주소는 항목의 공통 앞부분(ob) 뒤만
KC = {'scene': 's', 'people': 'p', 'exterior': 'e', 'product': 'c', 'screen': 'u', 'diagram': 'd', 'kv': 'k'}
PL = [f'img/media/g{pi}.json' for pi in range(len(packs))] + ['img/media/t.json']
code = lambda a: PL.index(a.split('#')[0]) * 10000 + int(a.split('#')[1])
Lr = {}
for pi, u in enumerate(PL):
    rg = R[u]; Lr[pi] = [rg[0][0]] + [b - a for a, b in rg]
    assert all(rg[j + 1][0] == rg[j][1] + 3 for j in range(len(rg) - 1))
# 원본 주소: 자주 나오는 앞부분은 사전 D의 번호로("^<36진수>|나머지"), e-카탈로그는 쪽 주소에서 다시 만들 수 있어 비움
def origs_all():
    for k in order:
        for x in items[k]:
            if x.get('role') != 'ecat' and x['orig']: yield short(x['orig'])
cnt = collections.Counter()
for o in origs_all():
    for j in range(len(o)):
        if o[j] == '/' and j >= 10: cnt[o[:j + 1]] += 1
D = []
left = list(origs_all())
for _ in range(160):
    best, gain = None, 0
    for pre, n in cnt.items():
        if pre in D: continue
        g = sum(1 for o in left if o.startswith(pre)) * (len(pre) - 4)
        if g > gain: best, gain = pre, g
    if not best or gain < 60: break
    D.append(best); left = [o for o in left if not o.startswith(best)]
D.sort(key=len, reverse=True)
def b36(n): return '0123456789abcdefghijklmnopqrstuvwxyz'[n] if n < 36 else b36(n // 36) + b36(n % 36)
def enc_orig(o):
    for j, pre in enumerate(D):
        if o.startswith(pre): return '^' + b36(j) + '|' + o[len(pre):]
    return o
media = {'generated': datetime.date.today().isoformat(), 'counts': {}, 'P': PL, 'L': Lr, 'D': D, 'case': {}, 'sol': {}}
ledger = []
for k in order:
    t, i = k.split(':'); b = 'sol' if t == 'solution' else 'case'
    pages, g = [], []
    for x in items[k]:
        pg = x['page'] or ''
        if pg not in pages: pages.append(pg)
        w, h = ENC[x['ek']][1]
        o = '' if x.get('role') == 'ecat' else enc_orig(short(x['orig']))
        e = [code(addr[x['ek']]), KC[x['kind']], x['desc'], w, h, o, pages.index(pg)]
        if x.get('ecat'): e.append(x['ecat'])
        g.append(e)
        ledger.append((k, x))
    it = {'th': code(taddr[k]), 'g': g}
    if not (t == 'case' and pages == [C[i].get('url')]): it['pages'] = pages   # 사례 원문 하나뿐이면 앱이 catalog의 url을 씀
    media[b][i] = it
media['counts'] = {'case': len(media['case']), 'sol': len(media['sol']), 'images': sum(len(v['g']) for bb in ('case', 'sol') for v in media[bb].values()),
                   'files': len(gal_seq), 'packs': len(packs)}
json.dump(media, open(f'{ROOT}/data/media.json', 'w'), ensure_ascii=False, separators=(',', ':'))

# ---------- 7) 출처 대장 ----------
KN = {'scene': '현장', 'people': '사용 장면', 'exterior': '외관', 'product': '제품', 'screen': '화면', 'diagram': '구성도', 'kv': '대표'}
RN = {'list': '목록 썸네일', 'og': '공유 이미지', 'body': '본문', 'crop': '본문(사진 부분만 자름)', 'video': '영상 대표 장면', 'pdf': '리포트 PDF 사진', 'pdfpage': '리포트 PDF 쪽', 'ecat': 'e-카탈로그 쪽에서 자름', 'us': '해외 삼성 비즈니스 페이지'}
L = ['# 솔루션 · 유관사례 이미지 출처 대장', '',
     f"`data/media.json` · `img/media/` — 솔루션 {media['counts']['sol']}개 · 사례 {media['counts']['case']}건, 이미지 {media['counts']['images']}장 ({media['generated']}).",
     '모두 각 항목의 연관 리소스(삼성전자 samsung.com 고객 도입사례 원문 · 원문에 걸린 리포트 PDF · 영상, 솔루션 공식 페이지 · 업종 페이지 · 해외 삼성 비즈니스 페이지,',
     'vxt.samsung.com · samsungknox.com, 삼성 e-카탈로그)에서 받은 삼성전자 공식 이미지입니다. 원문이 사진과 글을 한 이미지에 섞어 둔 곳은 사진 부분만 잘랐고, 글 · 아이콘 · 배너는 뺐습니다.',
     f'갤러리는 긴 변 {GAL_SIDE}px AVIF(묶음 g0~g{len(packs) - 1}, 큰 이미지는 묶음 크기에 맞춰 품질을 낮춤), 카드 썸네일은 {TH_SIDE}px(t.json). 각 장의 원본 주소에서 큰 이미지를 볼 수 있어요.', '']
cur = None
for k, x in ledger:
    if k != cur:
        cur = k; t, i = k.split(':')
        L += ['', f"## {('솔루션 · ' + S[i]['name']) if t == 'solution' else ('사례 · ' + C[i]['cust'])}", '']
        if t == 'case': L += [f"원문: {C[i].get('url') or '(리포트 · 영상)'}", '']
        L += ['| 설명 | 종류 | 가져온 곳 | 원본 |', '|---|---|---|---|']
    src = RN.get(x['role'], x['role']) + (' · ' + x['ecat'] if x.get('ecat') else '') + (' · ' + x['page'] if t == 'solution' and x['page'] and not x.get('ecat') else '')
    L.append(f"| {x['desc']} | {KN.get(x['kind'], x['kind'])} | {src}{' (가장자리 정리)' if x['box'] else ''} | {x['orig']} |")
open(f'{ROOT}/src/media_sources.md', 'w').write('\n'.join(L) + '\n')

print(json.dumps(media['counts']), dict(stats))
print('gallery packs MB', [round(n / 1e6, 2) for n in psize], 'thumbs MB', round(tsize / 1e6, 2), 'media.json KB', round(os.path.getsize(f'{ROOT}/data/media.json') / 1024))
