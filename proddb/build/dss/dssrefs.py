"""DSS 삭제 · 연관 자료 점검 공용(deletions.py · refcheck.py · cascade.py).

레지스트리 읽기, 제품 · 솔루션 id 참조 찾기와 바꾸기, 삭제된 제품의 글 · 사진 흔적 찾기, 형식을 그대로 둔 JSON 쓰기.
모든 경로는 Repo(root) 기준이다(--root 로 사본을 가리키면 사본만 읽고 쓴다). root 밖을 가리키는 링크는 읽기만 하고 쓰지 않는다.
"""
import base64, collections, gzip, json, os, re

ROW_ID = r'(?:sg_g\d{9}|ec_\d+_\d+)'  # 제품 DB 행 id(사이트 카드 · e-카탈로그 전용) — 다른 낱말과 겹치지 않는다
ROW_RX = re.compile(r'(?<![A-Za-z0-9_])' + ROW_ID + r'(?![A-Za-z0-9_])')
is_row_id = lambda s: isinstance(s, str) and bool(re.fullmatch(ROW_ID, s))

# 참조를 찾는 곳(사본 · 기록 · 원문 · 동결본은 제외)
SCAN_DIRS = ('app/data', 'app/web/src', 'app/scripts', 'app/api', 'app/tests', 'build', 'proddb/subs')
SCAN_FILES = ('proddb/imglib/index.json', 'proddb/ecat/photos.json', 'img/lib/index.json')
SKIP_DIRS = ('app/data/runtime', 'app/data/static', 'app/data/backgrounds', 'app/data/spatial/versions', 'app/data/spatial/source-images',
             'app/tests/output', 'build/hist')
TEXT_EXT = {'.json', '.js', '.jsx', '.mjs', '.cjs', '.py', '.txt', '.md', '.html', '.css', '.yml', '.yaml', '.csv', '.b64'}
REGISTRY = ('app/data/products_db.json',)  # + app/data/product-details/d*.json
# cascade.py 가 다시 만드는 파일 — 손으로 고치지 않는다
GENERATED = ('app/data/spatial/product-objects.json', 'app/data/spatial/library.json', 'app/data/spatial/scenes.json', 'app/data/spatial/examples.json')
IMGLIB = ('img/lib/index.json', 'proddb/imglib/index.json')
# 장표에 실제로 나가는 글이 든 곳 — 삭제된 제품의 모델코드 · 사진이 남아 있으면 안 된다
MENTION_DIRS = ('app/web/src/domain/templates', 'app/data/vertical_proposals', 'app/scripts/vertical_standard')
MENTION_FILES = ('app/data/catalog.json', 'app/data/layouts.b64', 'app/data/vertical_proposal_briefs.json', 'app/data/account_case_briefs.json',
                 'app/data/proposal_cover_briefs.json', 'app/web/src/repositories/sample-history.js')
# 큐레이션 제품 · 솔루션 id 는 흔한 낱말(watch · content …)이라, 이 필드에 든 값만 참조로 본다
PRODUCT_KEYS = {'products', 'prods', 'productIds', 'sourceProductIds', 'productId', 'product', 'pid', 'with', 'dimensionProductId'}
SOLUTION_KEYS = {'solutions', 'sols', 'sol', 'sid', 'solutionScreens'}
VSS_KEYS = {'solution', 'parent', 's'}

AREAS = (  # (경로 앞부분, 영역 이름)
    ('app/data/products_db.json', '제품 DB'), ('app/data/product-details/', '제품 DB'),
    ('app/data/spatial/', '조감도(공간) 오브젝트 · 템플릿'), ('app/web/src/domain/spatial/', '조감도(공간) 구성 규칙'),
    ('img/lib/', '이미지 라이브러리'), ('proddb/imglib/', '이미지 라이브러리'), ('proddb/ecat/photos.json', '카탈로그 사진 기록'),
    ('app/data/subscriptions.json', '구독'), ('proddb/subs/', '구독'),
    ('app/web/src/domain/templates/toc_', '목차 템플릿'),
    ('app/web/src/domain/templates/', '샘플 시나리오 · 레이아웃'), ('app/web/src/repositories/sample-', '샘플 시나리오 · 레이아웃'),
    ('app/data/vertical_proposals/', '샘플 시나리오 생성기 입력'), ('app/data/vertical_proposal_briefs.json', '샘플 시나리오 생성기 입력'),
    ('app/data/account_case_briefs.json', '샘플 시나리오 생성기 입력'), ('app/scripts/vertical_standard/', '샘플 시나리오 생성기 입력'),
    ('app/data/catalog.json', '레이아웃 · 솔루션 연결'), ('app/data/layouts.b64', '레이아웃 템플릿'),
    ('app/data/vertical_space_', '업종 공간 · 솔루션'), ('app/web/src/domain/review/', '검토 예시'),
    ('app/tests/', '테스트'), ('build/', '생성기 원본'), ('app/', '앱 코드'),
)


def area_of(rel):
    return next((name for prefix, name in AREAS if rel.startswith(prefix)), '기타')


def norm(s):
    return re.sub(r'[^A-Z0-9]', '', str(s or '').upper())


def is_code(t):
    """모델코드로 볼 만한 토큰 — 5자 이상, 글자와 숫자가 함께 있다(앱 deprecation.js 와 같은 길이 기준)."""
    return len(t) >= 5 and any(c.isdigit() for c in t) and any(c.isalpha() for c in t)


def tokens_of(text):
    text = re.sub(r'data:[a-z]+/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+', ' ', text)  # 사진 데이터 안의 우연한 글자열은 보지 않는다
    return {t for t in (norm(x) for x in re.findall(r'[A-Za-z0-9][A-Za-z0-9\-]{3,}', text)) if is_code(t)}


# ───────────────────────── 형식을 그대로 둔 JSON ─────────────────────────

STYLES = (dict(separators=(',', ':')), dict(), dict(indent=0, separators=(',', ':')), dict(indent=1), dict(indent=2), dict(indent=4), dict(indent=1, separators=(',', ':')), dict(indent=0))


def read_json(path):
    text = open(path, encoding='utf-8').read()
    return json.loads(text), text


def style_of(text, data):
    """이 파일을 그대로 다시 쓸 수 있는 json.dumps 옵션(없으면 None — 손으로 맞춘 형식이라 글자 단위로만 고친다)."""
    body = text.rstrip('\n')
    for ascii_ in (False, True):
        for st in STYLES:
            if len(body) > 4_000_000 and st is not STYLES[0]:
                continue  # 큰 생성 파일은 한 가지 형식만 본다
            if json.dumps(data, ensure_ascii=ascii_, **st) == body:
                return dict(st, ensure_ascii=ascii_, tail=text[len(body):])
    return None


def dump_like(style, data):
    st = dict(style)
    tail = st.pop('tail', '')
    return json.dumps(data, **st) + tail


def write_text(path, text):
    tmp = path + '.dss-tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(text)
    os.replace(tmp, path)


def layouts_b64_text(path):
    """app/data/layouts.b64 = base64(gzip(글)) — 풀어서 글로."""
    raw = base64.b64decode(open(path, 'rb').read())
    try:
        return gzip.decompress(raw).decode('utf-8', 'ignore')
    except OSError:
        return raw.decode('utf-8', 'ignore')


# ───────────────────────── 저장소 ─────────────────────────

class Repo:
    def __init__(self, root):
        self.root = os.path.realpath(root)
        self.p = lambda *a: os.path.join(self.root, *a)
        self.pdb, self.pdb_text = read_json(self.p('app/data/products_db.json'))
        self.cat, self.cat_text = read_json(self.p('app/data/catalog.json'))
        self.ledger, self.ledger_text = read_json(self.p('proddb/dss/ledger.json'))
        vss = self.p('app/data/vertical_space_solution.json')
        self.vss, self.vss_text = read_json(vss) if os.path.exists(vss) else ({'solution_catalog': []}, '')
        self.rows = {r['id']: r for r in self.pdb['products']}
        self.curated = {c['id']: dict(c, **self.pdb['curated'].get(c['id'], {})) for c in self.cat.get('products', [])}
        self.products = {**self.curated, **self.rows}
        self.solutions = {s['id']: s for s in self.cat.get('solutions', [])}
        self.vsol = {s['id']: s for s in self.vss.get('solution_catalog', [])}
        self.removed = {t['id']: t for t in self.pdb.get('removed', [])}
        self._files = None
        self._text = {}
        self._tokens = {}
        self._rows = {}

    def rel(self, path):
        return os.path.relpath(path, self.root).replace(os.sep, '/')

    def inside(self, path):
        """root 안의 실제 파일인가 — 사본 root 에서 원본을 가리키는 링크에는 쓰지 않는다."""
        return os.path.realpath(path).startswith(self.root + os.sep)

    def files(self):
        """참조를 찾을 글 파일(상대 경로)."""
        if self._files is None:
            out = []
            for d in SCAN_DIRS:
                top = self.p(d)
                if not os.path.isdir(top) or not self.inside(top):
                    continue
                for base, dirs, names in os.walk(top):
                    r = self.rel(base)
                    dirs[:] = sorted(x for x in dirs if x not in ('node_modules', '__pycache__', '.build') and not any((r + '/' + x) == s for s in SKIP_DIRS)
                                     and not os.path.islink(os.path.join(base, x)))
                    for n in sorted(names):
                        f = os.path.join(base, n)
                        if os.path.splitext(n)[1].lower() in TEXT_EXT and not os.path.islink(f):
                            out.append(self.rel(f))
            out += [f for f in SCAN_FILES if os.path.isfile(self.p(f)) and self.inside(self.p(f))]
            self._files = out
        return self._files

    def text(self, rel):
        if rel not in self._text:
            path = self.p(rel)
            try:
                self._text[rel] = layouts_b64_text(path) if rel.endswith('layouts.b64') else open(path, encoding='utf-8', errors='ignore').read()
            except OSError:
                self._text[rel] = ''
        return self._text[rel]

    def forget(self, rel=None):
        if rel is None:
            self._text.clear(); self._tokens.clear(); self._rows.clear()
        else:
            self._text.pop(rel, None); self._tokens.pop(rel, None); self._rows.pop(rel, None)

    def row_hits(self, rel):
        """이 파일에 나온 제품 DB 행 id → 횟수"""
        if rel not in self._rows:
            self._rows[rel] = collections.Counter(ROW_RX.findall(self.text(rel)))
        return self._rows[rel]

    def mention_files(self):
        return [f for f in self.files() if f in MENTION_FILES or any(f.startswith(d + '/') for d in MENTION_DIRS)]

    def mention_text(self, rel):
        """장표 글만 — catalog.json 은 레이아웃만 본다(도입사례 원문 · 제품 레지스트리는 장표 글이 아니다)."""
        if rel == 'app/data/catalog.json':
            return json.dumps(self.cat.get('layouts', []), ensure_ascii=False)
        return self.text(rel)

    def tokens(self, rel):
        if rel not in self._tokens:
            self._tokens[rel] = tokens_of(self.mention_text(rel))
        return self._tokens[rel]

    # ── 제품의 글 · 사진 흔적 ──
    def code_owners(self):
        """모델코드 토큰 → 그 토큰을 쓰는 제품 id 들."""
        own = collections.defaultdict(set)
        for pid, p in self.products.items():
            for t in product_codes(p):
                own[t].add(pid)
        return own

    def own_codes(self, pid, deleting=()):
        """이 제품만 쓰는 모델코드 토큰(남는 제품과 겹치는 토큰은 뺀다)."""
        own = self.code_owners()
        gone = set(deleting) | {pid}
        src = self.products.get(pid) or self.removed.get(pid) or {}
        return sorted(t for t in product_codes(src) if own.get(t, set()) <= gone)


def product_codes(p):
    """제품의 모델코드 토큰 — 모델코드 전부 + 이름 · 키워드에 적힌 짧은 모델명(LS24F432 등)."""
    out = {norm(m) for m in [p.get('model')] + list(p.get('models') or [])}
    for s in [p.get('name') or ''] + list(p.get('kw') or []):
        out |= {norm(x) for x in re.findall(r'[A-Za-z0-9][A-Za-z0-9\-]{3,}', s)}
    return {t for t in out if is_code(t)}


def product_photos(p):
    """제품 사진 주소(묶음 주소 · app 소유 static) — 장표가 이 주소를 직접 쓴다."""
    return [a for a in [p.get('th')] + list(p.get('gal') or []) if isinstance(a, str) and a]


# ───────────────────────── id 참조 찾기 · 바꾸기 ─────────────────────────

QUOTED = r'''(?<=["'`])%s(?=["'`])|(?<=product:)%s(?=["'`\s,)\]}]|$)'''


def text_refs(text, pid):
    """글 파일에서 id 가 나온 횟수 → (따옴표 · product: 접두로 쓴 것 = 바꿀 수 있음, 그 밖 = 손으로 봐야 함)."""
    e = re.escape(pid)
    total = len(re.findall(r'(?<![A-Za-z0-9_])' + e + r'(?![A-Za-z0-9_])', text))
    safe = len(re.findall(QUOTED % (e, e), text))
    return safe, total - safe


def text_replace(text, mapping):
    n = 0
    for old, new in mapping.items():
        e = re.escape(old)
        text, k = re.subn(QUOTED % (e, e), new, text)
        n += k
    return text, n


def json_rewrite(data, mapping, drop, keys=None):
    """JSON 을 걸어 다니며 id 를 대체 id 로 바꾼다. 목록에서는 대체가 이미 있으면 뺀다. id 가 키인 항목(그 제품만의 기록)은 지운다.
    mapping: {지울 id: 대체 id | None}, drop: 목록에서 그냥 빼는 id, keys: 값이 이 필드에 있을 때만 참조로 본다(None = 어디든).
    반환 (새 데이터, {'replace': n, 'drop': n, 'manual': n})."""
    n = collections.Counter()
    targets = set(mapping) | set(drop)

    def pref(s):
        for old, new in mapping.items():
            if new and ('product:' + old) in s:
                s2 = re.sub(r'(?<=product:)' + re.escape(old) + r'(?![A-Za-z0-9_])', new, s)
                if s2 != s:
                    n['replace'] += 1
                    s = s2
        return s

    def walk(x, key):
        on = keys is None or key in keys
        if isinstance(x, dict):
            for k in [k for k in x if k in targets and keys is None]:
                del x[k]
                n['drop'] += 1
            for k in list(x):
                x[k] = walk(x[k], k)
            return x
        if isinstance(x, list):
            out = []
            for v in x:
                if isinstance(v, str) and v in targets and on:
                    new = None if v in drop else mapping.get(v)
                    if new is None or new in x or new in out:
                        n['drop'] += 1
                    else:
                        out.append(new)
                        n['replace'] += 1
                else:
                    out.append(walk(v, key))
            return out
        if isinstance(x, str):
            if x in targets and on:
                new = None if x in drop else mapping.get(x)
                n['replace' if new else 'manual'] += 1
                return new if new else x
            if any(t in x for t in targets):
                y = pref(x)
                if keys is None and any(re.search(r'(?<![A-Za-z0-9_])' + re.escape(t) + r'(?![A-Za-z0-9_])', y) for t in targets):
                    n['manual'] += 1  # 주소 · 합성 id 안에 든 것 — 자동으로 바꾸지 않는다
                return y
        return x

    return walk(data, None), n


def rewrite_inplace(data, mapping, drop=(), keys=None):
    """json_rewrite 를 제자리에서(맨 위가 목록이어도) 적용하고 건수만 돌려준다."""
    new, n = json_rewrite(data, mapping, drop, keys)
    if isinstance(data, list):
        data[:] = new
    return n


def json_count(data, pid, keys=None):
    """바꾸지 않고 세기만 한다."""
    return json_rewrite(json.loads(json.dumps(data)), {pid: '\x00'}, (), keys)[1]
