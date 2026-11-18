"""DSS 연관 자료 점검 — 제품 · 솔루션 DB 를 고친 뒤(업데이트 · 삭제) 끊긴 참조나 낡은 흔적이 없는지 본다. 아무것도 바꾸지 않는다.
  python3 proddb/build/dss/refcheck.py [--root R] [--json]        끝난 코드 0 = 이상 없음, 1 = 찾은 것이 있음

  레지스트리   제품 id 가 겹치지 않음 · 건수(products_db.json counts.total 등)가 실제 행과 같음 · 상세 pack · 판매 종료 표시의 대체 제품이 판매 중
  흔적         지운 제품(removed)이 행에 없음 · 원장 status deleted 와 일치 · 대체 제품이 있음
  참조         샘플 시나리오 · 생성기 입력 · 레이아웃 · 목차 · 솔루션 연동 제품 · 업종 공간 솔루션 · 구독 · 조감도 규칙/오브젝트/템플릿 · 이미지 색인이
               가리키는 제품 · 솔루션이 모두 있음(판매 종료 표시는 지우기 전까지 허용)
  남은 글      지운 제품만 쓰던 모델코드 · 그 제품 사진 주소가 장표 글(샘플 시나리오 · 레이아웃 · 생성기 입력)에 남아 있지 않음
  파생물       조감도 오브젝트가 지금 있는 제품과 같음 · runtime projection 의 제품이 같음(있을 때만)
"""
import argparse, fnmatch, json, os, re, sqlite3, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dssrefs import Repo, ROW_RX, IMGLIB, product_codes, is_code, norm  # noqa: E402

# (파일, 경로, 종류) — 큐레이션 제품 · 솔루션 id 는 흔한 낱말이라 이 자리의 값만 참조로 본다
SPECS = (
    ('app/data/catalog.json', 'layouts[].prods[]', 'product'), ('app/data/catalog.json', 'layouts[].sols[]', 'solution'),
    ('app/data/catalog.json', 'solutions[].with[]', 'product'),
    ('app/web/src/domain/templates/*scenarios.json', 'scenarios[].products[]', 'product'),
    ('app/web/src/domain/templates/*scenarios.json', 'scenarios[].solutions[]', 'solution'),
    ('app/data/vertical_proposals/*.json', 'customers[].products[]', 'product'), ('app/data/vertical_proposals/*.json', 'customers[].spaces.items[].pid', 'product'),
    ('app/data/vertical_proposals/*.json', 'products[].pid', 'product'), ('app/data/vertical_proposals/*.json', 'customers[].solutions[]', 'solution'),
    ('app/data/vertical_proposals/*.json', 'solution.sid', 'solution'),
    ('app/data/vertical_proposal_briefs.json', '*.scenarios[].products[]', 'product'), ('app/data/vertical_proposal_briefs.json', '*.scenarios[].solutions[]', 'solution'),
    ('app/data/account_case_briefs.json', '*.products[]', 'product'), ('app/data/account_case_briefs.json', '*.solutions[]', 'solution'),
    ('app/data/vertical_space_solution.json', 'verticals[].spaces[].solutions[].solution', 'vss'),
    ('app/web/src/domain/templates/toc_content.json', 'v.*.jr[].sol[].s', 'vss'), ('app/web/src/domain/templates/toc_content.json', 'v.*.pp.pid', 'product'),
    ('app/data/subscriptions.json', 'categories[].products[]', 'product'), ('app/data/subscriptions.json', 'categories[].rep.product', 'product'),
    ('app/data/subscriptions.json', 'items[].items[].product', 'product'), ('proddb/subs/mapping.json', 'categories[].rep.product', 'product'),
    ('img/lib/index.json', 'images[].p[]', 'product'), ('proddb/imglib/index.json', 'images[].products[]', 'product'),
    ('app/data/spatial/product-objects.json', 'assets[].productId', 'product'),
)
# 행 id 를 기록으로 갖고 있어도 되는 곳(지운 id 가 남아도 참조가 아니다)
HISTORY = ('app/data/products_db.json', 'app/tests/', 'build/')


def extract(data, pattern):
    """'a.*.b[].c' 꼴 경로의 값들(문자열만)"""
    segs = [s for s in re.split(r'\.|(\[\])', pattern) if s]
    out = []

    def go(x, i):
        if i == len(segs):
            if isinstance(x, str):
                out.append(x)
            return
        s = segs[i]
        if s == '[]':
            for v in x if isinstance(x, list) else []:
                go(v, i + 1)
        elif isinstance(x, dict):
            for k in (x if s == '*' else [s] if s in x else []):
                go(x[k], i + 1)
    go(data, 0)
    return out


def check(repo):
    F = []
    add = lambda code, file, message, **kw: F.append({'code': code, 'file': file, 'message': message, **kw})
    P, S, V, T = repo.products, repo.solutions, repo.vsol, repo.removed
    pdb, L = repo.pdb, repo.ledger['items']
    known = {'product': P, 'solution': S, 'vss': V}

    # ── 레지스트리 ──
    ids = [c['id'] for c in repo.cat.get('products', [])] + [r['id'] for r in pdb['products']]
    dup = sorted({i for i in ids if ids.count(i) > 1}) if len(ids) != len(set(ids)) else []
    if dup:
        add('duplicate-id', 'app/data/products_db.json', '제품 id 가 겹침: ' + ', '.join(dup[:8]), ids=dup)
    c = pdb.get('counts') or {}
    rows = pdb['products']
    actual = {'total': len(ids), 'site_rows': sum(1 for r in rows if r.get('src') == 'site'), 'catalog_rows': sum(1 for r in rows if r.get('src') == 'catalog'),
              'deprecated': sum(1 for r in rows if r.get('deprecated')), 'superseded': sum(1 for r in rows if r.get('supersededBy')), 'removed': len(pdb.get('removed', []))}
    for k, v in actual.items():
        if k in c and c[k] != v:
            add('count', 'app/data/products_db.json', f'counts.{k} {c[k]} ≠ 실제 {v} — 건수는 업데이트 · 삭제 도구만 바꾼다(행이 사라졌는지 확인)')
    if 'total' not in c:
        add('count', 'app/data/products_db.json', 'counts.total 이 없음(전체 제품 수의 기준값)')
    for k in pdb.get('curated', {}):
        if k not in repo.curated:
            add('curated', 'app/data/products_db.json', f'curated 에만 있고 catalog.json products 에 없는 큐레이션 제품: {k}', ids=[k])
    ddir = repo.p('app/data/product-details')
    for name in sorted(os.listdir(ddir)) if os.path.isdir(ddir) else []:
        m = re.fullmatch(r'd(\d+)\.json', name)
        if not m:
            continue
        for pid in json.load(open(os.path.join(ddir, name), encoding='utf-8')).get('items', {}):
            if pid not in P:
                add('detail', 'app/data/product-details/' + name, f'없는 제품의 상세: {pid}', ids=[pid])
            elif P[pid].get('d') != int(m.group(1)):
                add('detail', 'app/data/product-details/' + name, f"{pid} 의 상세 pack 이 다름(행 d={P[pid].get('d')})", ids=[pid])
    for pid, p in P.items():
        r = (p.get('deprecated') or {}).get('replacedBy')
        if r and (r not in P or P[r].get('deprecated')):
            add('replacement', 'app/data/products_db.json', f'{pid} 의 대체 제품 {r} 이(가) 없거나 판매 종료', ids=[pid, r])
        for s in p.get('supersededBy') or []:
            if s not in P:
                add('replacement', 'app/data/products_db.json', f'{pid} 를 대신한다는 제품 {s} 이(가) 없음', ids=[pid, s])

    # ── 지운 제품의 흔적 ──
    for pid, t in T.items():
        if pid in P:
            add('tombstone', 'app/data/products_db.json', f'지운 제품 기록(removed)과 제품 행에 함께 있음: {pid}', ids=[pid])
        if t.get('replacedBy') and (t['replacedBy'] not in P or P[t['replacedBy']].get('deprecated')):
            add('tombstone', 'app/data/products_db.json', f"지운 제품 {pid} 의 대체 제품 {t['replacedBy']} 이(가) 없거나 판매 종료", ids=[pid])
        if (L.get('product:' + pid) or {}).get('status') != 'deleted':
            add('ledger', 'proddb/dss/ledger.json', f'지운 제품 {pid} 의 원장 상태가 deleted 가 아님', ids=[pid])
    for key, it in L.items():
        kind, _, ident = key.partition(':')
        if kind not in known:
            continue
        here = ident in known[kind]
        if it.get('status') == 'deleted' and here:
            add('ledger', 'proddb/dss/ledger.json', f'원장은 deleted 인데 레지스트리에 남아 있음: {key}', ids=[ident])
        if it.get('status') != 'deleted' and not here:
            add('ledger', 'proddb/dss/ledger.json', f'원장에는 있는데 레지스트리에 없음: {key}', ids=[ident])
    for pid in P:
        if 'product:' + pid not in L:
            add('ledger', 'proddb/dss/ledger.json', f'원장에 없는 제품: {pid}', ids=[pid])

    # ── 참조: 제품 DB 행 id(어디에 적혀 있든) ──
    for rel in repo.files():
        if rel.startswith(HISTORY) or rel.startswith('app/data/product-details/'):
            continue
        hits = repo.row_hits(rel)
        data = None
        if rel == 'proddb/imglib/index.json':  # retired[] 는 뺀 사진의 기록이다
            hits = __import__('collections').Counter(ROW_RX.findall(json.dumps(json.loads(repo.text(rel)).get('images', []))))
        gone = sorted(i for i in hits if i in T)
        lost = sorted(i for i in hits if i not in T and i not in repo.rows)
        if gone:
            add('deleted-ref', rel, f"지운 제품을 가리킴: {', '.join(gone[:6])}" + (f' 외 {len(gone) - 6}' if len(gone) > 6 else ''), ids=gone)
        if lost:
            add('unknown-ref', rel, f"없는 제품 id: {', '.join(lost[:6])}" + (f' 외 {len(lost) - 6}' if len(lost) > 6 else ''), ids=lost)

    # ── 참조: 큐레이션 제품 · 솔루션(정해진 자리의 값) ──
    cache = {}
    for pat, path, kind in SPECS:
        for rel in [f for f in repo.files() if fnmatch.fnmatch(f, pat)]:
            if rel not in cache:
                try:
                    cache[rel] = json.loads(repo.text(rel))
                except ValueError:
                    cache[rel] = None
                    add('unreadable', rel, 'JSON 으로 읽을 수 없음')
            if cache[rel] is None:
                continue
            bad = sorted({v for v in extract(cache[rel], path) if v not in known[kind]})
            if bad:
                add('deleted-ref' if any(v in T for v in bad) else 'unknown-ref', rel, f"{path} 가 없는 {'제품' if kind == 'product' else '솔루션'}을 가리킴: {', '.join(bad[:6])}", ids=bad)
    for rel in [f for f in repo.files() if f.startswith('app/data/vertical_proposals/')]:
        for kind, ident in re.findall(r'"(product|solution):([A-Za-z0-9_]+)"', repo.text(rel)):
            if ident not in known[kind]:
                add('unknown-ref', rel, f'{kind}:{ident} 가 가리키는 항목이 없음', ids=[ident])

    # ── 남은 글 · 사진 ──
    if T:
        owned = set()
        for p in P.values():
            owned |= product_codes(p)
        for pid, t in T.items():
            codes = {x for x in product_codes(t) if x not in owned}
            photos = [a for a in t.get('photos') or [] if a]
            for rel in repo.mention_files():
                hit = sorted(codes & repo.tokens(rel))
                if hit:
                    add('stale-text', rel, f"지운 제품 {pid}({t.get('name')})의 모델코드가 장표 글에 남음: {', '.join(hit[:6])}", ids=[pid])
                text = repo.text(rel)
                if any(re.search(re.escape(a) + r'(?![0-9A-Za-z])', text) for a in photos if a in text):
                    add('stale-photo', rel, f"지운 제품 {pid}({t.get('name')})의 사진이 장표에 남음", ids=[pid])

    # ── 파생물 ──
    po = repo.p('app/data/spatial/product-objects.json')
    if os.path.isfile(po):
        have = {a.get('productId') for a in json.load(open(po, encoding='utf-8')).get('assets', [])}
        extra, miss = sorted(x for x in have - set(P) if x), sorted(set(P) - have)
        if extra or miss:
            add('stale-spatial', 'app/data/spatial/product-objects.json', f'조감도 오브젝트가 제품 DB 와 다름: 없는 제품 {len(extra)} · 오브젝트 없는 제품 {len(miss)} — cascade.py 로 다시 만들 것', ids=(extra + miss)[:40])
    rt = repo.p('app/data/runtime/winmate_products.sqlite')
    if os.path.isfile(rt):
        try:
            with sqlite3.connect(f'file:{rt}?mode=ro', uri=True) as db:
                have = {r[0] for r in db.execute('SELECT id FROM wm_ui_product')}
            if have != set(P):
                add('stale-runtime', 'app/data/runtime/winmate_products.sqlite', f'runtime projection 의 제품이 제품 DB 와 다름({len(have)} ≠ {len(P)}) — app/scripts/prepare_data.py --force', ids=sorted(have ^ set(P))[:40])
        except sqlite3.Error as e:
            add('stale-runtime', 'app/data/runtime/winmate_products.sqlite', f'runtime projection 을 읽지 못함: {e}')
    return F


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=os.path.abspath(os.path.join(HERE, '..', '..', '..')))
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    repo = Repo(a.root)
    found = check(repo)
    summary = {'ok': not found, 'products': len(repo.products), 'solutions': len(repo.solutions), 'vertical_solutions': len(repo.vsol), 'removed': len(repo.removed),
               'files': len(repo.files()), 'findings': found}
    if a.json:
        json.dump(summary, sys.stdout, ensure_ascii=False, indent=1)
        print()
    else:
        for f in found:
            print(f"[{f['code']}] {f['file']}: {f['message']}")
        print(f"제품 {summary['products']} · 솔루션 {summary['solutions']} · 버티컬 솔루션 {summary['vertical_solutions']} · 지운 제품 {summary['removed']} · 파일 {summary['files']}개 — " + ('이상 없음' if not found else f'{len(found)}건'))
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main())
