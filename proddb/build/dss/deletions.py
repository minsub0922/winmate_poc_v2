"""판매 종료(deprecated) DSS 삭제 — 확인받은 항목만 지우고, 연관 자료에 바로 반영한다.

업데이트 run 은 판매 종료를 '표시'까지만 한다. 삭제는 관리자가 목록을 보고 확인한 뒤 이 도구로 한다.
  python3 proddb/build/dss/deletions.py list  [--root R]
  python3 proddb/build/dss/deletions.py apply --ids product:sg_g…,product:ec_… --by <관리자> [--root R] [--report out.json] [--dry-run] [--accept-manual]

list  → JSON(stdout): 삭제 후보(원장 status deprecated · deleted_at 없음)마다 대체 제품, 참조 위치(refs: replace · drop · regenerate · manual), 막힌 이유(blocked).
apply → 진행은 '@@progress <pct> <글>'. 0 = 삭제 완료, 3 = 막힘(아무것도 바꾸지 않음 · 보고서에 이유), 1 = 실패(바꾼 파일을 시작 때의 사본으로 되돌림).
  1. 사전 점검  후보인지 · 대체 제품이 판매 중인지 · 참조 위치 · 손으로 고쳐야 할 것(장표 글의 모델코드 등)이 없는지
  2. 레지스트리  제품 행 · 큐레이션 · 상세 · 솔루션에서 지우고, 흔적(tombstone)을 남긴다 — 원장 status deleted · deleted_at · deleted_by,
                 products_db.json removed[](저장된 제안서가 지워진 제품을 대체 제품으로 잇거나 내보낼 때 확인하는 근거)
  3. 연관 자료   샘플 시나리오 · 생성기 입력 · 레이아웃 · 목차 · 솔루션 연결 · 구독 · 조감도 규칙의 id 를 대체 제품으로(목록에서는 빼고), 이미지 라이브러리 색인에서 그 제품 사진을 뺀다
  4. 다시 만들기 cascade.py — runtime projection · 조감도 오브젝트/템플릿 · 샘플 시나리오 · 에이전트 KB
  5. 검증       refcheck.py — 끊긴 참조 · 남은 흔적 · 건수. 실패하면 전부 되돌린다
  6. 기록       proddb/reviews/deletions-<YYYYMMDD-HHMM>/deletion.json(누가 · 언제 · 무엇을 · 바꾼 참조) + 원장 run 기록(scope: ["deletions"])
장표 글에 지울 제품의 모델코드가 적혀 있으면(문장을 다시 써야 함) 막는다 — 코드 에이전트 업데이트로 글을 고친 뒤 다시 실행한다.
"""
import argparse, collections, datetime as dt, json, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dssrefs import (Repo, GENERATED, IMGLIB, area_of, is_row_id, json_count, json_rewrite, rewrite_inplace, read_json, style_of, dump_like, write_text,  # noqa: E402
                     text_refs, text_replace, product_photos, PRODUCT_KEYS, SOLUTION_KEYS, VSS_KEYS)

KST = dt.timezone(dt.timedelta(hours=9))
SUBS = ('app/data/subscriptions.json', 'proddb/subs/mapping.json')
KIND_KEYS = {'product': PRODUCT_KEYS, 'solution': SOLUTION_KEYS, 'vss': VSS_KEYS}


def progress(pct, text):
    print(f'@@progress {int(pct)} {text}', flush=True)


def is_detail(rel):
    return bool(re.fullmatch(r'app/data/product-details/d\d+\.json', rel))


# ───────────────────────── 후보 · 참조 ─────────────────────────

def candidate_keys(repo):
    return [k for k, v in repo.ledger['items'].items() if v.get('status') == 'deprecated' and not v.get('deleted_at') and k.split(':')[0] in KIND_KEYS]


def record_of(repo, key):
    kind, ident = key.split(':', 1)
    return {'product': repo.products, 'solution': repo.solutions, 'vss': repo.vsol}[kind].get(ident)


def replacement_of(repo, key):
    kind, ident = key.split(':', 1)
    item, rec = repo.ledger['items'][key], record_of(repo, key) or {}
    rid = (rec.get('deprecated') or {}).get('replacedBy') or item.get('replaced_by')
    return rid if isinstance(rid, str) and rid else None


def active(repo, kind, ident, batch=()):
    rec = {'product': repo.products, 'solution': repo.solutions, 'vss': repo.vsol}[kind].get(ident)
    return bool(rec) and not rec.get('deprecated') and (kind + ':' + ident) not in batch


def file_refs(repo, rel, kind, ident, has_repl):
    """한 파일 안의 참조 → [{area, file, count, action, detail}]"""
    row = kind == 'product' and is_row_id(ident)
    if row and ident not in repo.row_hits(rel):
        return []
    text = repo.text(rel)
    if not row and ('"' + ident + '"') not in text and ("'" + ident + "'") not in text and (kind + ':' + ident) not in text:
        return []
    ref = lambda count, action, detail: {'area': area_of(rel), 'file': rel, 'count': count, 'action': action, 'detail': detail}
    total = len(re.findall(r'(?<![A-Za-z0-9_])' + re.escape(ident) + r'(?![A-Za-z0-9_])', text))
    if rel == 'app/data/products_db.json' or is_detail(rel):
        return [ref(total, 'drop', '레지스트리에서 지움(흔적은 removed 에 남김)')]
    if rel == 'app/data/catalog.json' and not row:
        n = json_count({k: v for k, v in repo.cat.items() if k not in ('products', 'cases')}, ident, KIND_KEYS[kind])
        out = [ref(1, 'drop', '레지스트리에서 지움')]
        if n['replace'] + n['drop']:
            out.append(ref(n['replace'] + n['drop'], 'replace' if has_repl else 'manual', '레이아웃 prods · sols, 솔루션 연동 제품(with)'))
        return out
    if rel in GENERATED:
        return [ref(total, 'regenerate', 'cascade.py 가 제품 DB 에서 다시 만듦')]
    if rel in IMGLIB:
        return [ref(total, 'drop', '그 제품의 사진을 새로 고르는 색인에서 뺌(묶음의 사진 데이터는 저장 문서용으로 남김)')]
    if rel == 'proddb/ecat/photos.json':
        return [ref(total, 'drop', '카탈로그에서 자른 사진 기록')]
    if rel.startswith('app/tests/'):
        return [ref(total, 'manual', '테스트가 이 id 를 직접 쓴다 — 테스트를 먼저 고쳐야 함')]
    if not row and not rel.endswith('.json'):
        n = len(re.findall(r'''["'`]%s["'`]''' % re.escape(ident), text))
        return [ref(n, 'manual', '코드 · 생성기 원본에 적힌 id(같은 낱말일 수도 있음) — 사람이나 코드 에이전트가 확인')] if n else []
    if rel.endswith('.json'):
        try:
            data = json.loads(text)
        except ValueError:
            data = None
        if data is not None:
            if rel in SUBS:
                n = subs_rewrite(json.loads(text), {ident: None})[1]
                out = []
                if n['drop']:
                    out.append(ref(n['drop'], 'drop', '구독 품목 분류의 제품 목록에서 뺌'))
                if n['manual']:
                    out.append(ref(n['manual'], 'manual', '구독 패키지 · 분류의 대표 제품 — proddb/build/subs 로 다시 맞춰야 함'))
                return out
            n = json_count(data, ident, None if row else KIND_KEYS[kind])
            out = []
            if n['replace']:
                out.append(ref(n['replace'], 'replace' if has_repl else 'manual', '대체 id 로 바꿈' if has_repl else '대체가 정해지지 않아 바꿀 수 없음'))
            if n['drop']:
                out.append(ref(n['drop'], 'drop', '목록에서 뺌 · 그 제품만의 기록 지움'))
            if n['manual']:
                out.append(ref(n['manual'], 'manual', '주소 · 합성 id 안에 든 참조'))
            return out
    safe, other = text_refs(text, ident)
    out = []
    if safe:
        out.append(ref(safe, 'replace' if has_repl else 'manual', '대체 id 로 바꿈' if has_repl else '대체가 정해지지 않아 바꿀 수 없음'))
    if other:
        out.append(ref(other, 'manual', '따옴표 밖에 적힌 id(주석 · 주소 등)'))
    return out


def subs_rewrite(data, mapping):
    """구독 레지스트리 · 매핑: 품목 분류의 제품 목록(products[])에서는 빼고, 대표 제품(rep.product · items[].product)은 손으로 다시 맞춘다."""
    n = collections.Counter()

    def walk(x, key):
        if isinstance(x, dict):
            return {k: walk(v, k) for k, v in x.items()}
        if isinstance(x, list):
            if key == 'products':
                keep = [v for v in x if not (isinstance(v, str) and v in mapping)]
                n['drop'] += len(x) - len(keep)
                return keep
            return [walk(v, key) for v in x]
        if isinstance(x, str) and x in mapping:
            n['manual'] += 1
        return x

    return walk(data, None), n


def mention_refs(repo, ident, batch_ids, repl):
    """장표 글 · 사진에 남는 흔적: 그 제품만 쓰는 모델코드(문장을 다시 써야 함 → manual), 제품 사진 주소(대체 제품 사진으로 → replace)."""
    p = repo.products.get(ident)
    if not p:
        return []
    out = []
    codes = set(repo.own_codes(ident, batch_ids))
    photos = product_photos(p)
    repl_photos = product_photos(repo.products.get(repl) or {}) if repl else []
    for rel in repo.mention_files():
        hit = sorted(codes & repo.tokens(rel)) if codes else []
        if hit:
            out.append({'area': area_of(rel), 'file': rel, 'count': len(hit), 'action': 'manual', 'detail': '장표 글에 적힌 모델코드 ' + ', '.join(hit[:6]) + ' — 대체 제품 원문으로 글을 다시 써야 함'})
        text = repo.text(rel)
        n = sum(len(re.findall(re.escape(a) + r'(?![0-9A-Za-z])', text)) for a in photos if a in text)
        if n:
            out.append({'area': area_of(rel), 'file': rel, 'count': n, 'action': 'replace' if repl_photos else 'manual',
                        'detail': '제품 사진 — 대체 제품 사진으로 바꿈' if repl_photos else '제품 사진 — 대체 제품에 사진이 없어 손으로 골라야 함'})
    return out


def analyze(repo, key, batch=()):
    kind, ident = key.split(':', 1)
    item, rec = repo.ledger['items'][key], record_of(repo, key) or {}
    dep = rec.get('deprecated') or {}
    repl = replacement_of(repo, key)
    repl_ok = bool(repl) and active(repo, kind, repl, batch)
    names = {'product': repo.products, 'solution': repo.solutions, 'vss': repo.vsol}[kind]
    refs = []
    for rel in repo.files():
        refs += file_refs(repo, rel, kind, ident, repl_ok)
    batch_ids = {k.split(':', 1)[1] for k in batch if k.startswith('product:')}
    if kind == 'product':
        refs += mention_refs(repo, ident, batch_ids, repl if repl_ok else None)
    blocked, depends = [], []
    if not rec:
        blocked.append('레지스트리에 이 항목이 없음(원장과 앱 데이터가 어긋남)')
    if repl and not repl_ok:
        blocked.append(f'대체 항목 {repl} 이(가) 판매 중이 아니거나 없음 — 대체를 다시 정해야 함')
    if not repl and any(r['action'] == 'replace' or (r['action'] == 'manual' and '대체가 정해지지' in r['detail']) for r in refs):
        blocked.append('대체 항목이 정해지지 않았는데 바꿔야 할 참조가 있음')
    manual = [r for r in refs if r['action'] == 'manual']
    if manual:
        blocked.append(f"자동으로 고칠 수 없는 참조 {sum(r['count'] for r in manual)}곳({len({r['file'] for r in manual})}개 파일) — 코드 에이전트 업데이트로 고친 뒤 다시 확인")
    if kind == 'product':
        for pid, p in repo.products.items():
            if pid != ident and ((p.get('deprecated') or {}).get('replacedBy') == ident or ident in (p.get('supersededBy') or [])):
                depends.append('product:' + pid)
        waiting = [d for d in depends if d not in batch]
        if waiting:
            blocked.append('다른 항목의 대체 제품으로 지정돼 있음: ' + ', '.join(waiting) + ' — 함께 지우거나 그 항목의 대체를 바꿔야 함')
    return {'key': key, 'id': ident, 'kind': item.get('kind'), 'registry': item.get('registry'), 'name': re.sub(r'<br\s*/?>', ' ', rec.get('name') or item.get('name') or ''),
            'model': rec.get('model') or '', 'models': list(rec.get('models') or (item.get('keys') or {}).get('models') or []),
            'reason': dep.get('reason') or item.get('note') or '', 'deprecated_at': dep.get('at'), 'run': dep.get('run'),
            'replacement': {'id': repl, 'name': re.sub(r'<br\s*/?>', ' ', (names.get(repl) or {}).get('name') or '')} if repl else None,
            'refs': refs, 'blocked': blocked, 'depends_on': depends}


def listing(repo, keys=None, batch=()):
    return {'generated_at': dt.datetime.now(KST).isoformat(timespec='seconds'), 'root': repo.root,
            'candidates': [analyze(repo, k, batch) for k in (keys if keys is not None else candidate_keys(repo))]}


# ───────────────────────── 되돌리기용 사본 ─────────────────────────

class Backup:
    def __init__(self, repo, stamp):
        self.repo, self.dir, self.seen = repo, repo.p('output', 'dss', 'deletions', stamp, 'backup'), {}

    def track(self, rel):
        if rel in self.seen:
            return
        src = self.repo.p(rel)
        if os.path.isdir(src):
            for base, _, names in os.walk(src):
                for n in names:
                    self.track(self.repo.rel(os.path.join(base, n)))
            self.seen[rel] = 'dir'
            return
        if os.path.exists(src):
            dst = os.path.join(self.dir, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            self.seen[rel] = 'file'
        else:
            self.seen[rel] = 'absent'

    def restore(self):
        for rel, state in self.seen.items():
            dst = self.repo.p(rel)
            if state == 'file':
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(os.path.join(self.dir, rel), dst)
            elif state == 'absent' and os.path.isfile(dst):
                os.remove(dst)
            elif state == 'dir' and os.path.isdir(dst):  # 그 사이 새로 생긴 파일을 지운다
                for base, _, names in os.walk(dst):
                    for n in names:
                        r = self.repo.rel(os.path.join(base, n))
                        if self.seen.get(r) is None:
                            os.remove(os.path.join(base, n))

    def discard(self):
        shutil.rmtree(os.path.dirname(self.dir), ignore_errors=True)


# cascade.py 가 다시 쓰는 것 — 실패하면 함께 되돌린다
CASCADE_OUTPUTS = ('app/data/spatial/product-objects.json', 'app/data/spatial/library.json', 'app/data/spatial/scenes.json', 'app/data/spatial/examples.json',
                   'app/data/spatial/versions', 'app/web/public/assets/spatial-current.json', 'app/web/public/assets/spatial-references',
                   'app/web/public/assets/spatial-objects', 'app/web/src/domain/templates/vertical_scenarios.json',
                   'app/data/runtime/winmate_products.sqlite', 'app/data/runtime/kb', 'proddb/winmate_products.sqlite')


# ───────────────────────── 지우기 ─────────────────────────

class Editor:
    """파일을 고친다 — 처음 손대기 전에 사본을 남기고, 원래 형식(JSON 들여쓰기 · 줄 끝)을 지킨다."""

    def __init__(self, repo, backup):
        self.repo, self.backup, self.changed = repo, backup, collections.OrderedDict()

    def json(self, rel, fn):
        path = self.repo.p(rel)
        if not os.path.isfile(path) or not self.repo.inside(path):
            return None
        data, text = read_json(path)
        style = style_of(text, data)
        if style is None:
            raise RuntimeError(f'{rel}: 손으로 맞춘 JSON 형식이라 구조를 바꿔 쓸 수 없음')
        res = fn(data)
        new = dump_like(style, data)
        if new != text:
            self.backup.track(rel)
            write_text(path, new)
            self.repo.forget(rel)
            self.changed[rel] = self.changed.get(rel, 0) + 1
        return res

    def text(self, rel, fn):
        path = self.repo.p(rel)
        if not os.path.isfile(path) or not self.repo.inside(path):
            return 0
        text = open(path, encoding='utf-8').read()
        new, n = fn(text)
        if new != text:
            self.backup.track(rel)
            write_text(path, new)
            self.repo.forget(rel)
            self.changed[rel] = self.changed.get(rel, 0) + n
        return n


def photo_map(repo, mapping):
    """지울 제품의 사진 주소 → 대체 제품의 같은 자리 사진 주소"""
    out = {}
    for old, new in mapping.items():
        a, b = product_photos(repo.products.get(old) or {}), product_photos(repo.products.get(new) or {}) if new else []
        if not b:
            continue
        for i, addr in enumerate(a):
            out[addr] = b[min(i, len(b) - 1)]
    return out


def apply(repo, keys, by, stamp, accept_manual=False, skip_cascade=False):
    """실제 삭제. 반환 report dict. 실패하면 예외(호출한 쪽이 사본으로 되돌린다)."""
    now = dt.datetime.now(KST).isoformat(timespec='seconds')
    run_id = 'deletions-' + stamp
    backup = Backup(repo, stamp)
    ed = Editor(repo, backup)
    report = {'run_id': run_id, 'at': now, 'by': by, 'root': repo.root, 'deleted': [], 'rewritten': [], 'regenerated': [], 'verification': None}
    prod = {k.split(':', 1)[1]: replacement_of(repo, k) for k in keys if k.startswith('product:')}
    rows = {i for i in prod if is_row_id(i)}
    other = [k for k in keys if not (k.startswith('product:') and k.split(':', 1)[1] in rows)]
    photos = photo_map(repo, prod)
    tombs = []
    for ident, repl in prod.items():
        p = repo.products[ident]
        dep = p.get('deprecated') or {}
        tombs.append({'id': ident, 'name': re.sub(r'<br\s*/?>', ' ', p.get('name') or ''), 'model': p.get('model') or '', 'models': list(p.get('models') or []), 'cat': p.get('cat'), 'sc': p.get('sc'),
                      'fam': p.get('fam'), 'kw': list(p.get('kw') or []), 'photos': product_photos(p), 'replacedBy': repl, 'at': now, 'by': by, 'run': dep.get('run'), 'deletion': run_id, 'reason': dep.get('reason') or ''})
    try:
        for rel in CASCADE_OUTPUTS:
            if not skip_cascade:
                backup.track(rel)
        progress(10, '레지스트리에서 지우는 중')

        # ── 1. 연관 자료의 id · 사진(레지스트리를 지우기 전에 — 사진 주소는 제품 행에서 읽는다) ──
        for rel in repo.files():
            if rel == 'app/data/products_db.json' or is_detail(rel) or rel in GENERATED or rel in IMGLIB or rel.startswith('app/tests/'):
                continue
            hit_rows = [i for i in rows if i in repo.row_hits(rel)]
            text = repo.text(rel)
            hit_other = [k for k in other if ('"' + k.split(':', 1)[1] + '"') in text] if rel.endswith('.json') else []
            hit_photo = {a: b for a, b in photos.items() if a in text} if rel in repo.mention_files() else {}
            if not (hit_rows or hit_other or hit_photo):
                continue
            n = collections.Counter()
            if rel in SUBS:
                def fn(data, n=n):
                    new, k = subs_rewrite(data, {i: None for i in hit_rows})
                    data.clear(); data.update(new); n.update(k)
                ed.json(rel, fn)
            elif rel.endswith('.json') and style_of(text, json.loads(text)) is not None:
                def fn(data, n=n):
                    if hit_rows:
                        n.update(rewrite_inplace(data, {i: prod[i] for i in hit_rows}))
                    for k_ in hit_other:
                        kind, ident = k_.split(':', 1)
                        if kind == 'vss':  # 공간별 솔루션 목록은 {solution: id, …} 항목째로 뺀다
                            n['drop'] += drop_dicts(data, 'solution', ident)
                        n.update(rewrite_inplace(data, {ident: replacement_of(repo, k_)}, (), KIND_KEYS[kind]))
                ed.json(rel, fn)
            elif hit_rows:
                n['replace'] += ed.text(rel, lambda t: text_replace(t, {i: prod[i] for i in hit_rows if prod[i]}))
            if hit_photo:
                def swap(t):
                    k = 0
                    for a, b in hit_photo.items():
                        t, c = re.subn(re.escape(a) + r'(?![0-9A-Za-z])', b.replace('\\', '\\\\'), t)
                        k += c
                    return t, k
                n['photo'] += ed.text(rel, swap)
            if sum(n.values()):
                report['rewritten'].append({'file': rel, 'area': area_of(rel), **{k: v for k, v in n.items() if v}})

        # ── 2. 이미지 라이브러리 색인 · 카탈로그 사진 기록 ──
        for rel in IMGLIB:
            def fn(data, rel=rel):
                key = 'p' if rel.startswith('img/') else 'products'
                keep, gone, cut = [], [], 0
                for o in data.get('images', []):
                    ps = o.get(key) or []
                    if not any(x in prod for x in ps):
                        keep.append(o); continue
                    left = [x for x in ps if x not in prod]
                    cut += 1
                    if left:
                        o[key] = left; keep.append(o)
                    else:
                        gone.append(o)
                data['images'] = keep
                if 'n' in data:
                    data['n'] = len(keep)
                if gone and not rel.startswith('img/'):  # 원본 색인에는 뺀 사진을 기록으로 남긴다(다시 묶을 때 넣지 않음)
                    data.setdefault('retired', []).extend(dict(o, retiredAt=now, retiredBy=run_id) for o in gone)
                return cut, len(gone)
            res = ed.json(rel, fn)
            if res and res[0]:
                report['rewritten'].append({'file': rel, 'area': area_of(rel), 'unlinked': res[0], 'retired': res[1]})

        # ── 3. 레지스트리 ──
        def edit_pdb(data):
            data['products'] = [r for r in data['products'] if r['id'] not in prod]
            for i in prod:
                data['curated'].pop(i, None)
            for t in data.get('removed', []):  # 예전에 지운 제품의 대체가 이번에 지워지면 그 다음 대체로 잇는다
                if t.get('replacedBy') in prod:
                    t['replacedBy'] = prod[t['replacedBy']]
            data['removed'] = [t for t in data.get('removed', []) if t['id'] not in prod] + tombs
            curated_left = [c for c in repo.cat.get('products', []) if c['id'] not in prod]
            c = data.setdefault('counts', {})
            c.update(site_rows=sum(1 for r in data['products'] if r.get('src') == 'site'), catalog_rows=sum(1 for r in data['products'] if r.get('src') == 'catalog'),
                     deprecated=sum(1 for r in data['products'] if r.get('deprecated')), superseded=sum(1 for r in data['products'] if r.get('supersededBy')),
                     total=len(data['products']) + len(curated_left), removed=len(data['removed']))
            sr = data.get('specReview')
            if sr and os.path.isfile(repo.p(sr.get('ledger', ''))):  # 사양 검토 원장도 남은 제품만으로(건수 계약: 제품 수 = 검토 원장 수)
                spec = [x for x in json.load(open(repo.p(sr['ledger']), encoding='utf-8')) if x.get('id') not in prod]
                out = repo.p('proddb', 'reviews', run_id, 'product-review.json')
                os.makedirs(os.path.dirname(out), exist_ok=True)
                backup.track(repo.rel(out))
                json.dump(spec, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
                data['specReview'] = dict(date=now[:10], total=len(spec), ledger=f'proddb/reviews/{run_id}/product-review.json', previous={k: v for k, v in sr.items() if k != 'previous'})
        ed.json('app/data/products_db.json', edit_pdb)
        for rel in [f for f in repo.files() if is_detail(f)]:
            ed.json(rel, lambda data: [data['items'].pop(i, None) for i in prod])
        sols = [k.split(':', 1)[1] for k in keys if k.startswith('solution:')]
        cur = [i for i in prod if i not in rows]
        if cur or sols:
            def edit_cat(data):  # 레이아웃 prods · sols, 솔루션 with 의 id 는 1단계에서 이미 대체로 바꿨다
                data['products'] = [c for c in data.get('products', []) if c['id'] not in cur]
                data['solutions'] = [s for s in data.get('solutions', []) if s['id'] not in sols]
            ed.json('app/data/catalog.json', edit_cat)
            ed.json('app/data/media.json', lambda data: [(data.get('sol') or {}).pop(s, None) for s in sols])
        vs = [k.split(':', 1)[1] for k in keys if k.startswith('vss:')]
        if vs:
            def edit_vss(data):
                data['solution_catalog'] = [s for s in data['solution_catalog'] if s['id'] not in vs]
                for v in vs:
                    ((data.get('meta') or {}).get('stats') or {}).get('solution_space_counts', {}).pop(v, None)
            ed.json('app/data/vertical_space_solution.json', edit_vss)

        # ── 4. 원장 ──
        def edit_ledger(data):
            for k in keys:
                it = data['items'][k]
                it.update(status='deleted', deleted_at=now, deleted_by=by, deleted_run=run_id)
            for it in data['items'].values():
                if it.get('status') == 'deleted' and ('product:' + str(it.get('replaced_by'))) in keys and it.get('deleted_run') != run_id:
                    it['replaced_by'] = prod.get(it['replaced_by'])
            st = collections.Counter(v['status'] for v in data['items'].values())
            data['runs'] = [r for r in data['runs'] if r['run_id'] != run_id] + [{
                'run_id': run_id, 'run_at': now, 'finished_at': now, 'scope': ['deletions'], 'by': by, 'deleted': list(keys), 'sources': {},
                'counts': {'deleted': len(keys), 'deprecated': st['deprecated'], 'deleted_total': st['deleted']}}]
        ed.json('proddb/dss/ledger.json', edit_ledger)
        report['deleted'] = [{'key': k, 'name': (record_of(repo, k) or {}).get('name'), 'replacement': replacement_of(repo, k)} for k in keys]

        # ── 5. 다시 만들기 ──
        if not skip_cascade:
            progress(30, '연관 자료 다시 만드는 중(runtime projection · 조감도 · 샘플 시나리오 · 에이전트 KB)')
            r = run_tool('cascade.py', ['--root', repo.root, '--changed', ','.join(prod)], lambda pct, text: progress(30 + pct * 0.55, text))
            report['regenerated'] = r.get('result', {}).get('steps', [])
            if r['code']:
                raise RuntimeError('연관 자료를 다시 만들지 못했습니다: ' + (r.get('tail') or '')[-600:])
        # ── 6. 검증 ──
        progress(88, '끊긴 참조 · 남은 흔적 · 건수 검증')
        import refcheck
        findings = refcheck.check(Repo(repo.root))
        report['verification'] = {'ok': not findings, 'findings': findings[:200]}
        if findings:
            raise RuntimeError(f'검증 실패 {len(findings)}건: ' + '; '.join(f['message'] for f in findings[:5]))
        # ── 7. 기록 ──
        rec = repo.p('proddb', 'reviews', run_id, 'deletion.json')
        os.makedirs(os.path.dirname(rec), exist_ok=True)
        json.dump({'run_id': run_id, 'at': now, 'by': by, 'deleted': tombs + [{'key': k} for k in other], 'rewritten': report['rewritten'], 'changed_files': list(ed.changed),
                   'regenerated': report['regenerated']}, open(rec, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        report['changed_files'] = list(ed.changed)
        report['record'] = repo.rel(rec)
        backup.discard()
        return report
    except BaseException:
        backup.restore()
        shutil.rmtree(repo.p('proddb', 'reviews', run_id), ignore_errors=True)
        backup.discard()
        raise


def drop_dicts(x, key, value):
    n = 0
    if isinstance(x, dict):
        for v in x.values():
            n += drop_dicts(v, key, value)
    elif isinstance(x, list):
        keep = [v for v in x if not (isinstance(v, dict) and v.get(key) == value)]
        n += len(x) - len(keep)
        x[:] = keep
        for v in x:
            n += drop_dicts(v, key, value)
    return n


def run_tool(name, args, on_progress=None):
    """같은 폴더의 도구를 돌리고 '@@progress' · '@@result' 줄을 읽는다."""
    proc = subprocess.Popen([sys.executable, '-B', os.path.join(HERE, name), *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    tail, result = [], {}
    for line in proc.stdout:
        line = line.rstrip('\n')
        if line.startswith('@@progress '):
            _, pct, text = line.split(' ', 2)
            if on_progress:
                on_progress(float(pct), text)
        elif line.startswith('@@result '):
            result = json.loads(line[9:])
        else:
            tail.append(line)
    return {'code': proc.wait(), 'result': result, 'tail': '\n'.join(tail[-40:])}


def main():
    ap = argparse.ArgumentParser(description='판매 종료 DSS 삭제(확인받은 항목만)')
    sub = ap.add_subparsers(dest='cmd', required=True)
    li = sub.add_parser('list')
    li.add_argument('--root', default=os.path.abspath(os.path.join(HERE, '..', '..', '..')))
    a = sub.add_parser('apply')
    a.add_argument('--root', default=os.path.abspath(os.path.join(HERE, '..', '..', '..')))
    a.add_argument('--ids', required=True, help='원장 키(product:<id> · solution:<id> · vss:<id>)를 쉼표로')
    a.add_argument('--by', required=True, help='삭제를 확인한 사람')
    a.add_argument('--report')
    a.add_argument('--dry-run', action='store_true')
    a.add_argument('--accept-manual', action='store_true', help='자동으로 못 고치는 참조를 사람이나 코드 에이전트가 이미 확인했다(검증은 그대로 한다)')
    a.add_argument('--skip-cascade', action='store_true', help='다시 만들기를 건너뛴다(테스트 · 생성기가 없는 사본용)')
    args = ap.parse_args()
    repo = Repo(args.root)
    if args.cmd == 'list':
        json.dump(listing(repo), sys.stdout, ensure_ascii=False, indent=1)
        print()
        return 0
    keys = [k.strip() for k in args.ids.split(',') if k.strip()]
    keys = [k if ':' in k else 'product:' + k for k in keys]
    keys = list(dict.fromkeys(keys))
    stamp = dt.datetime.now(KST).strftime('%Y%m%d-%H%M')
    report = {'run_id': 'deletions-' + stamp, 'by': args.by, 'root': repo.root, 'requested': keys, 'dry_run': args.dry_run}

    def finish(code, **more):
        report.update(more, exit=code)
        if args.report:
            os.makedirs(os.path.dirname(os.path.abspath(args.report)), exist_ok=True)
            json.dump(report, open(args.report, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('@@result ' + json.dumps({k: report[k] for k in report if k not in ('candidates',)}, ensure_ascii=False), flush=True)
        return code

    progress(2, '사전 점검')
    cand = set(candidate_keys(repo))
    unknown = [k for k in keys if k not in cand]
    if not keys or unknown:
        return finish(3, status='blocked', blocked=[{'key': k, 'why': ['삭제 후보(판매 종료 표시 · 아직 지우지 않음)가 아님']} for k in unknown] or [{'key': '', 'why': ['지울 항목이 없음']}])
    plan = listing(repo, keys, batch=set(keys))['candidates']
    report['candidates'] = plan
    stop = []
    for c in plan:
        why = [b for b in c['blocked'] if not (args.accept_manual and b.startswith('자동으로 고칠 수 없는 참조'))]
        if why:
            stop.append({'key': c['key'], 'name': c['name'], 'why': why, 'manual': [r for r in c['refs'] if r['action'] == 'manual']})
    if stop:
        return finish(3, status='blocked', blocked=stop)
    summary = [{'key': c['key'], 'name': c['name'], 'replacement': c['replacement'], 'refs': c['refs']} for c in plan]
    if args.dry_run:
        progress(100, '사전 점검 완료(바꾼 것 없음)')
        return finish(0, status='dry-run', plan=summary)
    try:
        out = apply(repo, keys, args.by, stamp, args.accept_manual, args.skip_cascade)
    except Exception as e:  # noqa: BLE001 — 어떤 실패든 사본으로 되돌린 뒤 이유를 남긴다
        return finish(1, status='failed', error=f'{type(e).__name__}: {e}'[:2000], restored=True)
    progress(100, f'{len(keys)}개 삭제 완료')
    return finish(0, status='deleted', **{k: out[k] for k in ('deleted', 'rewritten', 'regenerated', 'verification', 'changed_files', 'record')})


if __name__ == '__main__':
    sys.exit(main())
