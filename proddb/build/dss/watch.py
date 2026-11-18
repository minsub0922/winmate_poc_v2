"""DSS 소스 변경 점검 — 현재 DB(proddb · app/data)가 원천 소스와 같은지 확인한다. DB 는 바꾸지 않는다.

관리자(admin)가 매일 09:00 에 실행한다. 바뀐 게 있으면 그 채널의 업데이트(.agents/skills/winmate-update-dss-db)를 실행한다.
  python3 proddb/build/dss/watch.py --out output/dss/watch/<stamp> [--channels ecat,site,solutions,subs] [--links links.json]

--links: 관리자가 넣은 리소스 링크(원본 주소가 바뀌었을 때). {"ecat": {"listing": 바꾼 목록 주소, "listings": [추가 목록 주소], "volumes": [{"dir", "base", "url", "label"}]}}
  권 링크는 목록에 없어도 함께 대조한다 — DB 에 없는 권이면 새 권으로 나온다.

채널마다 비교 기준은 DB 쪽 기록이다(별도 기준 파일 없음).
  ecat       e-카탈로그 — 파일로 본다: 목록의 권(Dir · 이름 · 정기 호) ↔ proddb/ecat/catalogs.json,
             권마다 쪽 수 · 뷰어 제목 ↔ proddb/ecat/text/<Dir>.json, 쪽 이미지 파일의 Last-Modified ↔ 그 권을 받은 시각(fetchedAt)
  site       samsung.com/sec/business 제품 — 실제 수집기(collect_site.mjs)로 목록 · 옵션 · 사양 · 특장점을 staging 에 받아
             proddb/raw 와 diff_site.py 로 비교(업데이트 run 이 보는 것과 같은 비교). 메뉴에 새로 생긴 분류도 찾는다
  solutions  솔루션 · 분류 · 근거 페이지 — 상태 · 최종 주소 · 제목 · 본문 해시 ↔ 지난 전체 run 의 source-inventory.json
  subs       B2B 삼성 AI 구독 — 본문 해시 · 이미지 해시 · 패키지 모델 검색 ↔ proddb/raw/subs

결과: <out>/watch.json (채널마다 status same | changed | partial | failed, 바뀐 항목, 확인 범위). 진행은 '@@progress <pct> <글>' 줄로 낸다.
수집이 실패하거나 일부만 된 채널은 '바뀜 없음'으로 읽지 않는다(partial · failed). 끝난 코드: 0 = 점검 완료, 2 = 실패한 채널 있음.
"""
import argparse, collections, concurrent.futures as cf, datetime as dt, email.utils, glob, hashlib, html, json, os, re, shutil, subprocess, sys, time
import urllib.error, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
KST = dt.timezone(dt.timedelta(hours=9))
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9'}
ECAT = 'https://samsung.aiibook.net/b2b/'
SITE = 'https://www.samsung.com/sec/business/'
ECAT_TABS = ('tab1', 'tab4', 'tab5', 'tab6')  # tab2 조달 · tab3 B2C 는 범위 밖
LABEL = {'ecat': 'e-카탈로그', 'site': 'samsung.com/business 제품', 'solutions': '솔루션 · 분류 페이지', 'subs': 'B2B 삼성 AI 구독'}
P = lambda *a: os.path.join(ROOT, *a)
J = lambda p: json.load(open(p, encoding='utf-8'))
now = lambda: dt.datetime.now(KST).isoformat(timespec='seconds')
CONFIG = lambda: J(P('proddb/dss/watch-config.json')) if os.path.exists(P('proddb/dss/watch-config.json')) else {}
STATE = P('proddb/dss/watch-state.json')  # 솔루션 페이지 본문 해시의 기준(전체 run 뒤 첫 점검에서 새로 잡는다)
LINKS = {}  # --links 로 받은 관리자 리소스 링크
sys.path.insert(0, HERE)
from pagetext import hashes, main_of, text_of  # noqa: E402


def progress(pct, text):
    print(f'@@progress {int(pct)} {text}', flush=True)


def http(url, method='GET', data=None, headers=None, timeout=40, tries=3):
    """(status, final url, headers, body). status 0 = 연결 실패(본문 자리에 오류 글)."""
    q = urllib.parse.quote(url, safe=':/?#&=%+,;@!$\'()*~')
    err = ''
    for k in range(tries):
        try:
            req = urllib.request.Request(q, data=data, method=method, headers={**UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.geturl(), r.headers, (b'' if method == 'HEAD' else r.read())
        except urllib.error.HTTPError as e:
            return e.code, url, e.headers, b''
        except Exception as e:  # noqa: BLE001 — 네트워크 오류는 다시 시도하고, 끝까지 안 되면 실패로 남긴다
            err = str(e)[:160]
            time.sleep(1.5 * (k + 1))
    return 0, url, {}, err.encode()


def plain(fragment):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', fragment))).strip()


# ───────────────────────── e-카탈로그 (파일로 본다) ─────────────────────────

def ecat_listing(page):
    """목록 페이지 → [tab, 묶음 이름, Dir, 권 이름]. tab1 · 2 · 3 · 5 는 <h2 class="title"> 아래 목록, tab4 는 제목 없음, tab6 은 li 안의 item-title."""
    rows = []
    for sec in re.finditer(r'<section id="(tab\d+)"[^>]*>(.*?)(?=<section id="tab\d+"|</main>|$)', page, re.S):
        tab, body, group = sec.group(1), sec.group(2), ''
        for m in re.finditer(r'<h2 class="title">(.*?)</h2>|<li\b[^>]*>(.*?)</li>', body, re.S):
            if m.group(1) is not None:
                group = plain(m.group(1))
                continue
            li = m.group(2)
            d = re.search(r'data-catalog-dir="(\d+)"', li) or re.search(r'[?&]Dir=(\d+)', li)
            if not d:
                continue
            name = re.search(r'<p>(.*?)</p>', li, re.S)
            alt = re.search(r'<img\b[^>]*alt="([^"]*)"', li)
            rows.append([tab, group, d.group(1), plain(name.group(1)) if name else html.unescape(alt.group(1)).strip() if alt else ''])
    return rows


def ecat_viewer(d, base=ECAT):
    """뷰어 첫 쪽 → 열림 여부 · 쪽 수 · 뷰어 제목."""
    st, _, _, body = http(f'{base}access/ecatalogt.php?Dir={d}&acmode=disable&eclang=ko&um=t&start=1')
    h = body.decode('utf-8', 'ignore') if st == 200 else ''
    n = re.search(r'var cataPages = (\d+)', h)
    t = re.search(r'<title>([^<]*)</title>', h)
    return {'http': st, 'exists': bool(n) and 'Dir does not exist' not in h, 'pages': int(n.group(1)) if n else 0, 'docTitle': t.group(1).strip() if t else '',
            'error': body.decode('utf-8', 'ignore') if st == 0 else ''}


def ecat_file(d, page, base=ECAT):
    """쪽 이미지 파일의 수정 시각 — 본문을 받지 않고 HEAD 로만 본다."""
    st, _, hd, _ = http(f'{base}catImage/{d}/{page:03d}.jpg', method='HEAD', timeout=25)
    lm = hd.get('Last-Modified') if st == 200 else None
    return page, st, (email.utils.parsedate_to_datetime(lm) if lm else None), (hd.get('ETag') if st == 200 else None)


def ecat_signature(files):
    markers = [(page,status,modified.isoformat() if modified else None,tag) for page,status,modified,tag in sorted(files)]
    return hashlib.sha256(json.dumps(markers).encode()).hexdigest()


def check_ecat(out, step):
    extra = LINKS.get('ecat') or {}
    home = extra.get('listing') or ECAT  # 관리자가 목록 주소를 바꿨으면 그 주소
    base = home if home.endswith('/') else home.rsplit('/', 1)[0] + '/'
    st, _, _, body = http(home)
    if st != 200:
        return {'status': 'failed', 'summary': f'목록 페이지를 열지 못했습니다(HTTP {st}).', 'errors': [{'url': home, 'http': st}]}
    listing = ecat_listing(body.decode('utf-8', 'ignore'))
    scope = [r for r in listing if r[0] in ECAT_TABS]
    if not scope:
        return {'status': 'failed', 'summary': '목록 페이지에서 권을 읽지 못했습니다(마크업 변경 가능).', 'errors': [{'url': home, 'parsed': 0}]}
    db = J(P('proddb/ecat/catalogs.json'))
    texts = {os.path.basename(f)[:-5]: J(f) for f in glob.glob(P('proddb/ecat/text/*.json'))}
    cfg = CONFIG().get('ecat', {})
    excluded = [{'dir': r[2], 'title': r[3], 'note': cfg['exclude'][r[2]]} for r in scope if r[2] in cfg.get('exclude', {})]
    scope = [r for r in scope if r[2] not in cfg.get('exclude', {})]
    norm = lambda t: re.sub(r'\s+', ' ', t or '').strip()
    changes, errors, same, books = [], [], 0, []
    report = {'listing': home, 'listings': [], 'volumes': []}  # 관리자가 넣은 링크별 결과
    for u in extra.get('listings', []):  # 추가 목록 페이지 — 같은 마크업이면 같은 범위(탭)로, 아니면 그 페이지의 Dir 링크 전부
        st2, _, _, b2 = http(u)
        page2 = b2.decode('utf-8', 'ignore') if st2 == 200 else ''
        rows = [r for r in ecat_listing(page2) if r[0] in ECAT_TABS] or [['link', '', d, ''] for d in dict.fromkeys(re.findall(r'[?&]Dir=(\d+)', page2))]
        report['listings'].append({'url': u, 'status': 'same' if rows else 'failed', 'http': st2, 'volumes': len(rows), **({} if rows else {'error': '목록에서 권을 읽지 못함'})})
        if not rows:
            errors.append({'url': u, 'title': '추가한 목록 링크', 'http': st2, 'error': '목록에서 권을 읽지 못함'})
        scope += [r for r in rows if r[2] not in {x[2] for x in scope}]
    live = {r[2]: r for r in scope}
    known = {r[2]: r for r in db}
    linked = {}  # 관리자가 넣은 권 링크 — 다른 경로(b2c 등)의 권은 'b2c:274' 처럼 따로 센다
    for v in extra.get('volumes', []):
        vb = v.get('base') or base
        key = v['dir'] if vb.rstrip('/') == base.rstrip('/') else vb.rstrip('/').rsplit('/', 1)[-1] + ':' + v['dir']
        linked[key] = {**v, 'base': vb}
        live.setdefault(key, ['link', v.get('label') or '', key, ''])
    base_of = lambda d: linked[d]['base'] if d in linked else base
    dir_of = lambda d: linked[d]['dir'] if d in linked else d
    dirs = sorted(set(known) | set(live), key=lambda d: (not d.isdigit(), int(d) if d.isdigit() else 0, d))
    step(8, f'e-카탈로그 목록 {len(scope)}권 · DB {len(known)}권' + (f' · 넣은 권 링크 {len(linked)}' if linked else ''))
    with cf.ThreadPoolExecutor(6) as ex:
        viewers = dict(zip(dirs, ex.map(lambda d: ecat_viewer(dir_of(d), base_of(d)), dirs)))
    step(25, 'e-카탈로그 권별 쪽 수 · 뷰어 제목 확인')
    files = {}
    jobs = [(d, p) for d in dirs if viewers[d]['exists'] for p in range(1, viewers[d]['pages'] + 1)]
    with cf.ThreadPoolExecutor(8) as ex:
        for i, (d, r) in enumerate(zip((j[0] for j in jobs), ex.map(lambda j: ecat_file(dir_of(j[0]), j[1], base_of(j[0])), jobs))):
            files.setdefault(d, []).append(r)
            if i % 300 == 0:
                step(25 + 70 * i / max(1, len(jobs)), f'e-카탈로그 쪽 파일 수정 시각 확인 {i}/{len(jobs)}')
    for d in dirs:
        v, k, l, t = viewers[d], known.get(d), live.get(d), texts.get(d)
        by_link = bool(l) and l[0] == 'link'  # 목록이 아니라 관리자가 넣은 링크로 본 권
        name = (l or k)[3] if not by_link else (k[3] if k else l[1] or (v['docTitle'] if v['exists'] else '') or f'Dir {dir_of(d)}')
        item = {'dir': d, 'title': name, 'url': linked[d]['url'] if d in linked else f'{base}access/ecatalog5.php?Dir={d}',
                'listed':bool(l), 'tab':(l or k)[0], 'group':(l or k)[1], 'docTitle':v.get('docTitle'), 'pages':v.get('pages')}
        if files.get(d):
            item['fileSignature'] = ecat_signature(files[d])
        if not k:
            if by_link and not v['exists']:
                errors.append({**item, 'http': v['http'], 'error': v['error'] or '넣은 링크의 권이 열리지 않음'})
                continue
            changes.append({**item, 'status': 'new', 'tab': l[0], 'group': l[1], 'pages': v['pages'], 'docTitle': v['docTitle'],
                            'why': ['관리자가 넣은 링크의 권 — DB 에 없음' if by_link else '목록에 새로 올라온 권']})
            continue
        if v['http'] != 200:
            errors.append({**item, 'http': v['http'], 'error': v['error']})
            continue
        if not v['exists']:
            changes.append({**item, 'status': 'gone', 'why': ["목록에서 빠지고 Dir 직접 접근도 'Dir does not exist'" if not l else '목록에는 있으나 뷰어가 열리지 않음']})
            continue
        why = []
        if not l and d not in cfg.get('keepUnlisted', {}):
            why.append('목록에서 빠짐(뷰어는 열림 — 정기 호 교체인지 확인)')
        if l and not by_link and norm(l[3]) != norm(k[3]):
            why.append(f'권 이름 {k[3]} → {l[3]}')
        if l and l[0] == 'tab1' and norm(l[1]) != norm(k[1]):
            why.append(f'정기 호 {k[1]} → {l[1]}')
        if t:
            if t.get('pages') != v['pages']:
                why.append(f"쪽 수 {t.get('pages')} → {v['pages']}")
            if norm(t.get('docTitle')) != norm(v['docTitle']):
                why.append(f"뷰어 제목 {t.get('docTitle')} → {v['docTitle']}")
            fetched = dt.datetime.strptime(t['fetchedAt'], '%Y-%m-%dT%H:%M:%S%z') if t.get('fetchedAt') else None
            got = files.get(d, [])
            bad = [p for p, s, _, _ in got if s != 200]
            if got and len(bad) > max(2, len(got) // 5):
                errors.append({**item, 'error': f'쪽 이미지 파일 {len(bad)}/{len(got)}개를 확인하지 못함'})
                continue
            newer = sorted(p for p, s, m, _ in got if m and fetched and m > fetched)
            latest = max((m for _, _, m, _ in got if m), default=None)
            item['fileModified'] = latest.astimezone(KST).isoformat(timespec='seconds') if latest else None
            item['fetchedAt'] = fetched.astimezone(KST).isoformat(timespec='seconds') if fetched else None
            if newer:
                why.append(f'받은 뒤에 바뀐 쪽 파일 {len(newer)}개')
                item['modifiedPages'] = newer[:60]
            if not fetched:
                why.append('DB 에 받은 시각 기록이 없음')
        else:
            why.append('DB 에 쪽 원문이 없음')
        books.append({'dir': d, 'title': name, 'tab': k[0], 'pages': v['pages'], 'fileModified': item.get('fileModified'), 'fetchedAt': item.get('fetchedAt'), 'status': 'changed' if why else 'same'})
        if why:
            changes.append({**item, 'status': 'changed', 'why': why})
        else:
            same += 1
    issue = next((r for r in scope if r[0] == 'tab1'), None)
    dbi = next((r for r in db if r[0] == 'tab1'), None)
    res = {'counts': {'listed': len(scope), 'excluded': len(excluded), 'db': len(known), 'same': same, 'changed': sum(c['status'] == 'changed' for c in changes),
                      'new': sum(c['status'] == 'new' for c in changes), 'gone': sum(c['status'] == 'gone' for c in changes), 'pageFiles': len(jobs)},
           'issue': {'live': f'{issue[3]} {issue[1]} (Dir {issue[2]})' if issue else None, 'db': f'{dbi[3]} {dbi[1]} (Dir {dbi[2]})' if dbi else None,
                     'applied': bool(issue and dbi and issue[2] == dbi[2] and issue[1] == dbi[1])},
           'changes': changes, 'errors': errors, 'excluded': excluded, 'books': sorted(books, key=lambda b: b['fileModified'] or '', reverse=True),
           'links': report,
           'coverage': '목록의 권(비즈니스 종합 · B2B 품목 · 제품 가이드 · 업종별 제안 + 목록 밖 Dir 93), 권마다 쪽 수 · 뷰어 제목, 모든 쪽 이미지 파일의 수정 시각. 쪽 글 전체 대조는 업데이트에서 한다.'}
    for d, v in linked.items():
        found = next((c for c in changes if c['dir'] == d), None)
        failed = next((e for e in errors if e.get('dir') == d), None)
        report['volumes'].append({'url': v['url'], 'dir': d, 'title': (found or failed or {}).get('title') or (known[d][3] if d in known else ''), 'pages': viewers[d]['pages'],
                                  'status': 'failed' if failed else found['status'] if found else 'same', 'why': found['why'] if found else [], **({'error': failed.get('error')} if failed else {})})
    res['status'] = 'partial' if errors else 'changed' if changes else 'same'
    res['summary'] = (f"{len(known)}권 중 {same}권 같음" + (f" · 바뀜 {res['counts']['changed']}" if res['counts']['changed'] else '') + (f" · 새 권 {res['counts']['new']}" if res['counts']['new'] else '')
                      + (f" · 빠진 권 {res['counts']['gone']}" if res['counts']['gone'] else '') + (f' · 확인 못 함 {len(errors)}' if errors else '')
                      + (f" · 정기 호 {res['issue']['live']} " + ('적용됨' if res['issue']['applied'] else '미적용')))
    return res


# ───────────────────────── samsung.com/sec/business 제품 ─────────────────────────

def find_chrome():
    for c in (os.environ.get('CHROME'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', shutil.which('google-chrome'), shutil.which('chromium'), shutil.which('chromium-browser')):
        if c and os.path.exists(c):
            return c
    return None  # Playwright 가 내려받은 Chromium 을 쓴다


def run(cmd, log, env=None, timeout=3600, on_line=None):
    """자식 프로세스를 돌리고 출력은 log 에 남긴다. 줄마다 on_line 으로 진행을 읽는다."""
    with open(log, 'a', encoding='utf-8') as fh:
        proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', **(env or {})})
        started = time.monotonic()
        try:
            for line in proc.stdout:
                fh.write(line)
                fh.flush()
                if on_line:
                    on_line(line.rstrip('\n'))
                if time.monotonic() - started > timeout:
                    raise TimeoutError(f'{timeout // 60}분 안에 끝나지 않음')
            return proc.wait(timeout=60)
        finally:
            if proc.poll() is None:
                proc.terminate()
                proc.wait()


def site_menu():
    """비즈니스 홈 메뉴에서 '분류/all-분류' 목록 주소를 읽는다 — 새 분류 찾기용."""
    st, _, _, body = http(SITE)
    if st != 200:
        return None
    return sorted(set(re.findall(r'/sec/business/([A-Za-z0-9_-]+/all-[A-Za-z0-9_-]+)/?', html.unescape(body.decode('utf-8', 'ignore')))))


def models_of(W, gid):
    p = W['products'].get(gid) or {}
    return sorted({m for m in [p.get('mdlCode')] + [v.get('mdlCode') for v in W.get('variants', {}).values() if v.get('parentGoodsId') == gid] if m})


def site_detail(diff, field):
    """바뀐 제품 하나의 차이를 글로 — 이름 A → B, 모델 구성 +X −Y, 품절 상태가 바뀐 모델, 사양이 바뀐 옵션 수."""
    short = lambda v: (str(v) if v not in (None, '') else '없음')[:90]
    out = []
    for k, v in diff.items():
        label = field.get(k, k)
        if k == 'models':
            add, gone = sorted(set(v[1]) - set(v[0])), sorted(set(v[0]) - set(v[1]))
            out.append(label + ': ' + ' · '.join(t for t in ('추가 ' + ', '.join(add) if add else '', '빠짐 ' + ', '.join(gone) if gone else '') if t))
        elif k == 'soldOut':
            before, after = dict(map(tuple, v[0])), dict(map(tuple, v[1]))
            # 두 수집에 모두 있는 모델만 — 생기거나 빠진 모델은 '모델 구성'에 나온다
            moved = [f"{m} {'품절' if after[m] == 'Y' else '판매 중'}" for m in sorted(set(before) & set(after), key=str) if before[m] != after[m]]
            out.append(label + ': ' + (', '.join(moved[:12]) + (f' 외 {len(moved) - 12}개' if len(moved) > 12 else '') if moved else '옵션 구성이 바뀌면서 달라짐'))
        elif k == 'specs':
            out.append(f'{label}: 옵션 {len(v)}개의 사양표가 바뀜')
        elif k == 'features':
            out.append(label + ': ' + {'missing-new': '상품 페이지에서 특장점이 사라짐', 'missing-old': '특장점이 새로 생김'}.get(v, '내용이 바뀜'))
        elif isinstance(v, list) and len(v) == 2:
            out.append(f'{label}: {short(v[0])} → {short(v[1])}')
        else:
            out.append(label + ': 바뀜')
    return out


def check_site(out, step):
    raw = os.path.join(out, 'site', 'raw')
    os.makedirs(raw, exist_ok=True)
    log = os.path.join(out, 'site', 'collect.log')
    chrome = find_chrome()
    total = {'n': 1}

    def on_line(line):
        m = re.search(r'\b(cats|list|specs|pdp|DONE)\b\s*(.*)$', line)
        if not m:
            return
        kind, rest = m.group(1), m.group(2)
        if kind == 'cats':
            step(8, f'분류 {rest.strip()}개 — 목록 · 옵션 수집')
        elif kind == 'list':
            step(15, '목록 · 필터 ' + rest.split(' ')[0])
        elif kind == 'specs':
            n = re.findall(r'\d+', rest)
            if len(n) >= 2:
                total['n'] = int(n[1])
                step(20 + 40 * int(n[0]) / max(1, int(n[1])), f'사양 {n[0]}/{n[1]}')
        elif kind == 'pdp':
            n = re.findall(r'\d+', rest)
            if n:
                step(min(92, 60 + 32 * int(n[0]) / 600), f'상품 페이지 특장점 {n[0]}')

    step(3, 'samsung.com/business 수집 시작')
    try:
        code = run(['node', P('proddb/build/collect_site.mjs')], log, on_line=on_line, timeout=3000,
                   env={'OUT_DIR': raw, 'SITE_LISTS': P('proddb/raw/site_lists.txt'), 'PREV_RAW': P('proddb/raw/wkb_products.json'), **({'CHROME': chrome} if chrome else {})})
    except Exception as e:  # noqa: BLE001
        return {'status': 'failed', 'summary': f'사이트 수집을 끝내지 못했습니다: {str(e)[:120]}', 'errors': [{'error': str(e)[:300], 'log': os.path.relpath(log, ROOT)}]}
    prod = os.path.join(raw, 'wkb_products.json')
    W = J(prod) if os.path.exists(prod) else {}
    if code or not W.get('finishedAt'):
        tail = open(log, encoding='utf-8').read()[-600:] if os.path.exists(log) else ''
        return {'status': 'failed', 'summary': '사이트 수집이 끝나지 않았습니다(브라우저 · 네트워크 확인).', 'errors': [{'exit': code, 'log': os.path.relpath(log, ROOT), 'tail': tail}]}
    step(93, '지난 원문과 비교')
    diff_file = os.path.join(out, 'site', 'site-diff.json')
    r = subprocess.run([sys.executable, os.path.join(HERE, 'diff_site.py'), P('proddb/raw'), raw, P('app/data'), diff_file], cwd=ROOT, capture_output=True, text=True)
    if r.returncode:
        return {'status': 'failed', 'summary': '사이트 비교에 실패했습니다.', 'errors': [{'error': r.stderr[-400:]}]}
    D = J(diff_file)
    # 지난 수집에도 있던 오류(예: printing-solutions 분류, G000181220 상품 페이지 HTTP 500)는 새 실패가 아니다
    sig = lambda e: (e.get('stage'), e.get('p') or e.get('gid') or e.get('c'), e.get('status'))
    prev_err = {sig(e) for e in (J(P('proddb/raw/collect_errors.json')) if os.path.exists(P('proddb/raw/collect_errors.json')) else [])}
    errs = J(os.path.join(raw, 'errors.json'))
    new_err = [e for e in errs if sig(e) not in prev_err]
    menu = site_menu()
    listed = {l.strip().replace('/sec/business/', '').strip('/') for l in open(P('proddb/raw/site_lists.txt'), encoding='utf-8') if l.strip()} | {c['p'] for c in J(P('proddb/raw/wkb_products.json'))['cats']}
    new_cats = sorted(set(menu) - listed) if menu is not None else []
    known_bad = {e.get('p') for e in errs if e.get('stage') == 'cat'}
    new_cats = [c for c in new_cats if c not in known_bad]
    changes = []
    for x in D['removed']:
        host = (W['products'].get(x.get('movedTo')) or {}).get('goodsNm')
        changes.append({'status': 'moved' if x.get('movedTo') else 'removed', 'gid': x['gid'], 'name': x['name'], 'models': x['models'], 'app': x['app'], 'cat': x.get('cat'), 'url': x.get('url'),
                        'why': [f"상품 카드가 {x['movedTo']}" + (f' ({host})' if host else '') + ' 로 옮겨짐' if x.get('movedTo') else '목록에서 빠짐 — 판매 종료 후보']})
    for x in D['added']:
        changes.append({'status': 'new', 'gid': x['gid'], 'name': x['name'], 'models': x['models'], 'cat': x.get('cat'), 'url': x.get('url'), 'why': ['새 상품 카드']})
    field = {'goodsNm': '이름', 'mdlCode': '대표 모델', 'goodsDetailUrl': '주소', 'uspDescList': 'USP', 'goodsTpCd': '상품 유형', 'dlgtDispClsfEnNm': '분류', 'models': '모델 구성',
             'options': '옵션', 'cardImages': '카드 사진', 'specs': '사양', 'features': '특장점', 'soldOut': '품절 상태'}
    for x in D['changed']:
        changes.append({'status': 'changed', 'gid': x['gid'], 'name': x['name'], 'app': x['app'], 'why': [field.get(k, k) for k in x['diff']], 'detail': site_detail(x['diff'], field),
                        'models': models_of(W, x['gid']), 'cat': W['products'][x['gid']].get('catPath'), 'url': W['products'][x['gid']].get('goodsDetailUrl')})
    for c in new_cats:
        changes.append({'status': 'new-category', 'cat': c, 'url': SITE + c + '/', 'why': ['메뉴에 새로 생긴 분류']})
    by = collections.Counter(c['status'] for c in changes)
    fields = collections.Counter(w for c in changes if c['status'] == 'changed' for w in c['why'])
    res = {'counts': {'cards': D['cards'], 'unchanged': D['unchanged'], **dict(by), 'specs': len(J(os.path.join(raw, 'wkb_specs.json'))), 'categories': len(W.get('cats', [])), 'changedFields': dict(fields)},
           'changes': changes, 'errors': new_err, 'knownErrors': len(errs) - len(new_err), 'staged': os.path.relpath(raw, ROOT), 'collectedAt': W.get('finishedAt'),
           'coverage': f"분류 {len(W.get('cats', []))}개의 목록 전체 · 옵션 상품 · 품절 상태 · 사양 API · 상품 페이지 특장점, 메뉴의 새 분류" + ('' if menu is not None else ' (메뉴는 읽지 못함)')}
    res['status'] = 'partial' if new_err or menu is None else 'changed' if changes else 'same'
    res['summary'] = (f"상품 카드 {D['cards'][1]}개 중 {D['unchanged']}개 같음" + ''.join(f' · {t} {by[k]}' for k, t in (('changed', '바뀜'), ('new', '새 카드'), ('removed', '빠짐'), ('moved', '이동'), ('new-category', '새 분류')) if by.get(k))
                      + (f' · 새 수집 오류 {len(new_err)}' if new_err else ''))
    return res


# ───────────────────────── 솔루션 · 분류 · 근거 페이지 ─────────────────────────

def last_inventory():
    """솔루션 페이지 기록이 있는 가장 최근 run 의 source-inventory.json"""
    best = None
    for f in glob.glob(P('proddb/reviews/dss-*/source-inventory.json')):
        d = J(f)
        rows = [s for s in d.get('sources', []) if str(s.get('id', '')).startswith('page:')]
        if rows and (not best or d.get('run_at', '') > best[0].get('run_at', '')):
            best = (d, rows)
    return best


OFFICIAL = ('samsung.com', 'samsungknox.com', 'aiibook.net')


def business_menu():
    """비즈니스 홈이 가리키는 /sec/business/ 아래 페이지(분류 · 솔루션 · 서비스 · 이벤트) — 새 솔루션 · 서비스 페이지 찾기용. 상품 페이지(3단 주소)는 뺀다."""
    st, _, _, body = http(SITE)
    if st != 200:
        return None
    found = re.findall(r'href="(?:https://www\.samsung\.com)?/sec/business/([A-Za-z0-9_\-]+(?:/[A-Za-z0-9_\-]+)?)/?(?:[?#][^"]*)?"', html.unescape(body.decode('utf-8', 'ignore')))
    return sorted(set(found))
same_url = lambda a, b: urllib.parse.unquote(a or '').rstrip('/') == urllib.parse.unquote(b or '').rstrip('/')


def check_solutions(out, step):
    os.makedirs(os.path.join(out, 'sol'), exist_ok=True)
    pages_file = os.path.join(out, 'sol', 'pages.json')
    step(5, '솔루션 · 분류 · 근거 페이지 받기')
    r = subprocess.run([sys.executable, os.path.join(HERE, 'fetch_solutions.py'), ROOT, pages_file], cwd=ROOT, capture_output=True, text=True, timeout=1500)
    if r.returncode or not os.path.exists(pages_file):
        return {'status': 'failed', 'summary': '솔루션 페이지를 받지 못했습니다.', 'errors': [{'error': (r.stderr or r.stdout)[-400:]}]}
    pages = J(pages_file)
    inv = last_inventory()
    if not inv:
        return {'status': 'failed', 'summary': '비교할 지난 run 기록(source-inventory.json)이 없습니다.', 'errors': [{'error': 'no inventory'}]}
    base = {s['url']: s.get('cur') or {} for s in inv[1]}
    full = db_state()['last_full_run']
    state = J(STATE) if os.path.exists(STATE) else None
    seed = not state or state.get('basis_run') != full  # 전체 run 뒤 첫 점검 — 본문 해시 기준을 새로 잡는다
    known = {} if seed else state['solutions']
    step(60, f'{len(pages)}개 주소를 지난 run 기록과 비교')
    changes, errors, notes, same, dirty = [], [], [], 0, False
    for u, x in sorted(pages.items()):
        b, k = base.get(u), known.get(u)
        ref = k or ({'status': b.get('status'), 'final': b.get('final'), 'title': b.get('title')} if b else None)
        item = {'url': u, 'refs': x['refs'], 'title': x.get('title')}
        if x['status'] == 0:
            st2, final2, _, body2 = http(u, timeout=120, tries=2)
            if st2 == 0:
                errors.append({**item, 'error': '연결 실패'})
                continue
            page2 = body2.decode('utf-8', 'ignore') if st2 == 200 else ''
            t2 = re.search(r'<title[^>]*>(.*?)</title>', page2, re.S)
            x = {**x, 'status': st2, 'final': final2, 'title': html.unescape(t2.group(1)).strip() if t2 else '', 'textSha256': hashes(page2)[0] if page2 else '', 'mainSha256': hashes(page2)[1] if page2 else '', 'mainText':text_of(main_of(page2)) if page2 else ''}
            pages[u] = x
            item['title'] = x['title']
        if k and k.get('status') not in (None,200) and x['status'] != k.get('status'):
            changes.append({**item, 'status':'changed' if x['status'] == 200 else 'broken', 'why':[f"HTTP {k['status']} → {x['status']}"]})
            continue
        if not ref or ref.get('status') != 200:
            # 지난 run 뒤에 등록된 주소(예: 교체한 분류 URL)이거나 그때도 실패해 다른 공식 출처로 확인한 주소
            if x['status'] == 200 or ref:
                same += 1
            else:
                changes.append({**item, 'status': 'broken', 'why': [f"열리지 않음(HTTP {x['status']})"]})
            continue
        why = []
        if x['status'] != 200:
            why.append(f"HTTP 200 → {x['status']}")
        else:
            if not same_url(ref.get('final') or u, x.get('final') or u):
                why.append(f"주소 이동 → {x.get('final')}")
            if ref.get('title') and ref['title'] != (x.get('title') or ''):  # 기준 기록에 제목이 없으면(이동 · 재확인으로 적힌 주소) 비교하지 않는다
                why.append(f"제목 {ref.get('title')} → {x.get('title')}")
            official = any(d in urllib.parse.urlsplit(u).netloc for d in OFFICIAL)
            if k and official and k.get('hash') and not k.get('volatile') and x.get('mainSha256') != k['hash']:
                # 받을 때마다 본문이 달라지는 페이지는 해시로 판정하지 않는다 — 한 번 더 받아 같은지 본다
                st2, _, _, body2 = http(u)
                if not (st2 == 200 and hashes(body2.decode('utf-8', 'ignore'))[1] == x['mainSha256']):
                    k['volatile'] = dirty = True
                elif k.get('seen') and k['seen'] != x['mainSha256']:
                    k['volatile'] = dirty = True  # 지난 점검에서 본 것과도 다르다 — 날마다 달라지는 페이지
                    notes.append({**item, 'note': '점검할 때마다 본문이 달라지는 페이지 — 본문 해시 판정에서 뺌'})
                else:
                    if k.get('seen') != x['mainSha256']:
                        k['seen'], dirty = x['mainSha256'], True
                    why.append('본문이 바뀜')
            elif seed and official and b.get('sha256') and x.get('textSha256') != b['sha256']:
                notes.append({**item, 'note': '지난 run 뒤 페이지 글이 달라짐(메뉴 · 푸터 포함 전체 글 기준이라 본문 변경인지는 알 수 없음)'})
        if why:
            changes.append({**item, 'status': 'broken' if x['status'] != 200 else 'changed', 'why': why})
        else:
            same += 1
    # 메뉴에 새로 생긴 페이지 — 새 솔루션 · 서비스 · 분류 후보. 이벤트 · 인사이트(사례) 주소는 자주 바뀌므로 참고로만 적는다
    menu = business_menu()
    if menu is None:
        errors.append({'url': SITE, 'error': '비즈니스 홈 메뉴를 읽지 못함'})
    elif not seed and state.get('menu') is not None:
        for path in sorted(set(menu) - set(state['menu'])):
            item = {'url': SITE + path + '/', 'title': path, 'refs': ['menu']}
            if path.split('/')[0] in ('event', 'insights'):
                notes.append({**item, 'note': '메뉴에 새로 보이는 이벤트 · 인사이트 페이지'})
            else:
                changes.append({**item, 'status': 'new-page', 'why': ['메뉴에 새로 생긴 페이지 — 새 솔루션 · 서비스 · 분류인지 확인']})
    elif not seed:
        state['menu'], dirty = menu, True
    if seed:
        state = {'version': 1, 'basis_run': full, 'seeded_at': now(), 'menu': menu or [], 'note': '솔루션 · 분류 · 근거 페이지의 본문(메뉴 · 푸터 제외) 해시 기준. 전체 run 뒤 첫 점검에서 다시 잡는다.',
                 'solutions': {u: {'status': 200, 'final': x.get('final'), 'title': x.get('title'), 'hash': x.get('mainSha256')}
                               for u, x in sorted(pages.items()) if x['status'] == 200 and not any(c['url'] == u for c in changes)}}
        # 이번에 이미 바뀐 것으로 나온 주소는 지난 run 기록을 기준으로 남겨, 업데이트 전까지 계속 '바뀜'으로 나온다
        for c in changes:
            b = base.get(c['url']) or {}
            state['solutions'][c['url']] = {'status': b.get('status'), 'final': b.get('final'), 'title': b.get('title'), 'hash': None}
        dirty = True
    with open(pages_file, 'w', encoding='utf-8') as output:
        json.dump(pages,output,ensure_ascii=False)
    if dirty:
        json.dump(state, open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    by = collections.Counter(c['status'] for c in changes)
    res = {'counts': {'urls': len(pages), 'same': same, **dict(by), 'notes': len(notes), 'menu': len(menu or [])}, 'changes': changes, 'errors': errors, 'notes': notes, 'baseline': inv[0].get('run'),
           'seeded': seed, 'coverage': '솔루션 레지스트리 · 버티컬 솔루션 근거 · 제품군 분류에 쓴 주소 전부의 상태 · 최종 주소 · 제목, 공식 페이지는 메뉴 · 푸터를 뺀 본문 해시, 비즈니스 홈 메뉴에 새로 생긴 페이지'
           + ('(이번 점검에서 기준을 새로 잡음 — 다음 점검부터 본문 변경을 판정)' if seed else '') + '. 이 주소들에 연결된 PDF · 영상은 보지 않는다.'}
    res['status'] = 'partial' if errors else 'changed' if changes else 'same'
    res['summary'] = (f"{len(pages)}개 주소 중 {same}개 같음" + ''.join(f' · {t} {by[k]}' for k, t in (('changed', '바뀜'), ('broken', '열리지 않음'), ('new-page', '메뉴의 새 페이지')) if by.get(k))
                      + (f' · 참고 {len(notes)}' if notes else '') + (f' · 확인 못 함 {len(errors)}' if errors else ''))
    return res


# ───────────────────────── B2B 삼성 AI 구독 ─────────────────────────

def check_subs(out, step):
    raw = os.path.join(out, 'subs', 'raw')
    os.makedirs(raw, exist_ok=True)
    step(5, '구독 페이지 · 혜택 · 패키지 모델 받기')
    r = subprocess.run([sys.executable, P('proddb/build/subs/collect.py'), raw], cwd=ROOT, capture_output=True, text=True, timeout=900)
    inv_file = os.path.join(raw, 'inventory.json')
    if r.returncode or not os.path.exists(inv_file):
        return {'status': 'failed', 'summary': '구독 소스를 받지 못했습니다.', 'errors': [{'error': (r.stderr or r.stdout)[-400:]}]}
    step(70, '지난 원문과 비교')
    old_dir = P('proddb/raw/subs')
    new, old = J(inv_file), J(os.path.join(old_dir, 'inventory.json'))
    prev = {s['id']: s for s in old['sources']}
    changes, errors, same = [], [], 0
    for s in new['sources']:
        o = prev.get(s['id'])
        item = {'id': s['id'], 'url': s['url']}
        if s['status'] in ('failed', 'partial'):
            errors.append({**item, 'error': f"{s['status']} (HTTP {s.get('http')}) {s.get('note', '')}".strip()})
        elif not o:
            changes.append({**item, 'status': 'new', 'why': ['새 구독 소스']})
        elif s.get('textHash') != o.get('textHash') or s.get('final') != o.get('final') or s.get('images') != o.get('images'):
            why = [t for t, k in (('본문이 바뀜', 'textHash'), ('주소 이동', 'final'), ('본문 이미지 수', 'images')) if s.get(k) != o.get(k)]
            changes.append({**item, 'status': 'changed', 'why': why})
        else:
            same += 1
    try:
        im0, im1 = J(os.path.join(old_dir, 'images.json')), J(os.path.join(raw, 'images.json'))
        sha = lambda d: {v.get('sha256') for v in d.values() if v.get('sha256')}
        if sha(im0) != sha(im1):
            changes.append({'id': 'images', 'status': 'changed', 'why': [f'본문 이미지 {len(sha(im1) - sha(im0))}개 새로 · {len(sha(im0) - sha(im1))}개 빠짐(패키지 · 혜택 사실이 이미지에 있음)']})
        m0, m1 = J(os.path.join(old_dir, 'models.json')), J(os.path.join(raw, 'models.json'))
        for code in sorted(set(m0) | set(m1)):
            a, b = m0.get(code) or {}, m1.get(code) or {}
            if (a.get('found'), a.get('name'), a.get('url')) != (b.get('found'), b.get('name'), b.get('url')):
                changes.append({'id': 'model:' + code, 'status': 'changed', 'why': [f"패키지 모델 검색 결과 {a.get('name') or '없음'} → {b.get('name') or '없음'}"]})
        for link in J(os.path.join(raw, 'discover.json')):
            if not link.get('known'):
                changes.append({'id': 'discover', 'status': 'new', 'url': link.get('url'), 'why': [f"메뉴의 새 구독 링크: {link.get('text')}"]})
    except (OSError, ValueError, KeyError, AttributeError) as e:
        errors.append({'id': 'compare', 'error': str(e)[:200]})
    res = {'counts': {'sources': len(new['sources']), 'same': same, 'changed': len(changes)}, 'changes': changes, 'errors': errors, 'staged': os.path.relpath(raw, ROOT),
           'coverage': '구독 메인 · 혜택 이벤트 · 뉴스룸 기사의 본문 해시와 본문 이미지 해시, 패키지 모델 검색, 메뉴의 새 구독 링크'}
    res['status'] = 'partial' if errors else 'changed' if changes else 'same'
    res['summary'] = f"소스 {len(new['sources'])}개 중 {same}개 같음" + (f' · 바뀜 {len(changes)}' if changes else '') + (f' · 확인 못 함 {len(errors)}' if errors else '')
    return res


# ───────────────────────── DB 쪽 상태 ─────────────────────────

def db_state():
    L = J(P('proddb/dss/ledger.json'))
    items = L['items'].values()
    full = [r for r in L['runs'] if not r.get('scope')]
    pdb = J(P('app/data/products_db.json'))
    return {'ledger_run': L['runs'][-1]['run_id'], 'last_full_run': full[-1]['run_id'] if full else None, 'last_full_run_at': full[-1]['run_at'] if full else None,
            'products': len(pdb['products']) + len(pdb['curated']), 'by_status': dict(collections.Counter(i['status'] for i in items)),
            'deprecated_pending': sum(1 for i in items if i['status'] == 'deprecated' and not i.get('deleted_at')),
            'unresolved': sum(1 for i in items if i['status'] == 'unresolved')}


CHECKS = {'ecat': check_ecat, 'site': check_site, 'solutions': check_solutions, 'subs': check_subs}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--channels', default='ecat,solutions,subs,site')
    ap.add_argument('--die-with-parent', action='store_true', help='부른 프로세스(관리자 서버)가 사라지면 수집기까지 함께 끝낸다')
    ap.add_argument('--links', help='관리자가 넣은 리소스 링크 JSON')
    a = ap.parse_args()
    if a.links:
        LINKS.update(J(a.links))
    chans = [c for c in a.channels.split(',') if c]
    bad = [c for c in chans if c not in CHECKS]
    if bad:
        sys.exit('모르는 채널: ' + ', '.join(bad))
    if a.die_with_parent:
        import signal, threading
        parent = os.getppid()

        def guard():
            while os.getppid() == parent:
                time.sleep(2)
            os.killpg(os.getpgrp(), signal.SIGTERM)  # 이 점검이 그룹 리더일 때(관리자가 새 세션으로 띄움) 자식까지 끝난다
        threading.Thread(target=guard, daemon=True).start()
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    res = {'version': 1, 'started_at': now(), 'channels': {}}
    weight = {'site': 10, 'ecat': 2, 'solutions': 1.5, 'subs': 1}  # 걸리는 시간 비율 — 진행률이 실제와 비슷하게
    total, passed = sum(weight[c] for c in chans), 0
    for c in chans:
        lo, hi = 100 * passed / total, 100 * (passed + weight[c]) / total
        passed += weight[c]
        step = lambda pct, text, lo=lo, hi=hi: progress(lo + (hi - lo) * min(100, pct) / 100, text)
        t0 = time.monotonic()
        try:
            r = CHECKS[c](out, step)
        except Exception as e:  # noqa: BLE001 — 한 채널이 죽어도 나머지는 점검하고, 죽은 채널은 실패로 남긴다
            r = {'status': 'failed', 'summary': f'점검 중 오류: {type(e).__name__}: {str(e)[:160]}', 'errors': [{'error': f'{type(e).__name__}: {e}'[:400]}]}
        res['channels'][c] = {'label': LABEL[c], 'checked_at': now(), 'seconds': round(time.monotonic() - t0), 'changes': [], 'errors': [], **r}
        json.dump({**res, 'partial_output': True}, open(os.path.join(out, 'watch.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    st = [v['status'] for v in res['channels'].values()]
    res['status'] = 'failed' if 'failed' in st else 'partial' if 'partial' in st else 'changed' if 'changed' in st else 'same'
    res['changed'] = 'changed' in st
    res['db'] = db_state()
    res['finished_at'] = now()
    json.dump(res, open(os.path.join(out, 'watch.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    progress(100, '점검 완료')
    for c, v in res['channels'].items():
        print(f"{c:10s} {v['status']:8s} {v['summary']}")
    sys.exit(2 if 'failed' in st else 0)


if __name__ == '__main__':
    main()
