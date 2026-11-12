"""DSS DB 업데이트 — staging 결과를 활성 경로에 반영한다(검증 전 단계; 실패하면 git 으로 되돌린다).
순서: proddb(raw · ecat · 원장) → app/data JSON · 상세 overlay → 원본 SQLite 재빌드(+ 사진 · 이미지 라이브러리 · 원장 · 검토 사양 표).
app/data/static(= reference/live 동결본)에는 쓰지 않는다.
사용: python3 proddb/build/dss/promote.py <run dir> <review dir>"""
import glob, json, os, re, shutil, sqlite3, subprocess, sys

RUN_DIR, REVIEW = sys.argv[1], sys.argv[2]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CFG = json.load(open(os.path.join(REVIEW, 'run.json')))
STAGE = os.path.join(RUN_DIR, 'stage')
P = lambda *a: os.path.join(ROOT, *a)
J = lambda p: json.load(open(p))
assert not os.path.realpath(P('app/data/product-details')).startswith(os.path.realpath(P('reference')))

def write_like(path, data, newline, **kw):
    s = json.dumps(data, ensure_ascii=False, **kw)
    open(path, 'w').write(s + ('\n' if newline else ''))

# ── proddb: 원문 ──
raw = os.path.join(RUN_DIR, 'raw')
for f in ('wkb_products.json', 'wkb_specs.json', 'wkb_features.json', 'wkb_filter_meta.json', 'site_lists.txt', 'collect.log'):
    shutil.copy2(os.path.join(raw, f), P('proddb/raw', f))
shutil.copy2(os.path.join(raw, 'errors.json'), P('proddb/raw/collect_errors.json'))
txt = os.path.join(RUN_DIR, 'ecat/text')
cur = {os.path.basename(f) for f in glob.glob(os.path.join(txt, '*.json'))}
for f in glob.glob(P('proddb/ecat/text/*.json')):
    if os.path.basename(f) not in cur: os.remove(f)  # 빠진 권(203) · 지난 정기 호(360)
for f in cur: shutil.copy2(os.path.join(txt, f), P('proddb/ecat/text', f))
shutil.copy2(os.path.join(RUN_DIR, 'ecat/catalogs.json'), P('proddb/ecat/catalogs.json'))
for f in glob.glob(os.path.join(RUN_DIR, 'ecat-build/extract/*.json')):
    shutil.copy2(f, P('proddb/ecat/extract', os.path.basename(f)))
os.makedirs(P('proddb/dss'), exist_ok=True)
shutil.copy2(os.path.join(STAGE, 'proddb/dss/ledger.json'), P('proddb/dss/ledger.json'))

# ── app/data ──
shutil.copy2(os.path.join(STAGE, 'app/data/products_db.json'), P('app/data/products_db.json'))
with open(P('app/data/products_db.json'), 'a') as fh: fh.write('\n')
for f in glob.glob(os.path.join(STAGE, 'app/data/product-details/d*.json')):
    shutil.copy2(f, P('app/data/product-details', os.path.basename(f)))
    with open(P('app/data/product-details', os.path.basename(f)), 'a') as fh: fh.write('\n')
cat = J(P('app/data/catalog.json'))
staged = {s['id']: s for s in J(os.path.join(STAGE, 'app/data/catalog.solutions.json'))}
cat['solutions'] = [staged[s['id']] for s in cat['solutions']]
write_like(P('app/data/catalog.json'), cat, False, separators=(',', ':'))
shutil.copy2(os.path.join(STAGE, 'app/data/vertical_space_solution.json'), P('app/data/vertical_space_solution.json'))
shutil.copy2(os.path.join(STAGE, 'build/media/data/sol_urls.json'), P('build/media/data/sol_urls.json'))
# 분류 파일은 손으로 맞춘 줄 형식 — 해당 분류 줄과 meta 만 고친다
vp = P('app/data/vertical_space_product.json'); s = open(vp).read()
for cid, url in CFG['taxonomy_url_moves'].items():
    pat = re.compile(r'(\{"id": "' + re.escape(cid) + r'", "name": "[^"]*", "url": ")[^"]*(", "verified": )(true|false)')
    s, n = pat.subn(lambda m: m.group(1) + url + m.group(2) + 'true', s)
    assert n == 1, cid
if '"checkedAt"' not in s.split('"product_taxonomy"')[0]:
    s = s.replace('    "version": "2026-11-11",', f'    "version": "2026-11-11",\n    "checkedAt": "{CFG["run_at"]}",\n    "checkedRun": "{CFG["run_id"]}",', 1)
json.loads(s); open(vp, 'w').write(s)

# ── 원본 SQLite 재빌드 ──
db_path = P('proddb/winmate_products.sqlite')
old = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
pending = db_path + '.dss.sqlite'
subprocess.run([sys.executable, P('proddb/build/build_db.py'), P('proddb/raw'), pending], check=True, cwd=ROOT)
d = sqlite3.connect(pending)
sys.path.insert(0, P('proddb/build'))
from dss_db import write_dss
write_dss(d, P('proddb/dss/ledger.json'))
# 검토 사양 표: 최종 상세(overlay)와 같게 — export_app.py 재실행 때 검토 사양을 보존하고, 테스트 · KB 가 같은 값을 읽는다
d.execute('CREATE TABLE IF NOT EXISTS product_spec_review (id TEXT PRIMARY KEY, model TEXT NOT NULL, reviewed_at TEXT NOT NULL, detail_json TEXT NOT NULL)')
rows = []
for f in sorted(glob.glob(P('app/data/product-details/d[0-9][0-9].json'))):
    for pid, dt in J(f)['items'].items():
        if dt.get('specProductId') == pid:
            rows.append((pid, dt.get('specModel') or '', dt.get('specReviewedAt') or '', json.dumps(dt, ensure_ascii=False)))
prev = {r[0] for r in old.execute('SELECT id FROM product_spec_review')}
d.executemany('INSERT OR REPLACE INTO product_spec_review VALUES (?,?,?,?)', rows)
d.commit()
assert d.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
print('product_spec_review', len(rows), 'new', len({r[0] for r in rows} - prev))
d.execute('VACUUM'); d.close(); old.close()
os.replace(pending, db_path)
print('promoted', CFG['run_id'])
