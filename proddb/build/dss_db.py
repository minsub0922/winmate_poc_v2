"""proddb/dss/ledger.json(DSS 확인 시점 원장) → SQLite dss_item · dss_check · dss_run 표. kind: device · solution · service · subscription.
proddb/dss/kinds.json(수집한 항목의 종류 — LLM 판정, classify.py) → dss_kind 표와 종류별 보기 dss_device · dss_solution · dss_service · dss_subscription.
build_db.py 가 DB 를 새로 만들기 때문에 photos_db.py · imglib_db.py 처럼 빌드 뒤에 다시 싣는다(prepare_data.py 가 runtime DB 로 복사).
  python3 proddb/build/dss_db.py [winmate_products.sqlite] [ledger.json]"""
import json, os, sqlite3, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SQL = """
CREATE TABLE IF NOT EXISTS dss_item (key TEXT PRIMARY KEY, kind TEXT, registry TEXT, id TEXT, name TEXT, status TEXT,
  first_seen TEXT, checked_at TEXT, checked_run TEXT, changed_at TEXT, hash TEXT, replaced_by TEXT, deleted_at TEXT, note TEXT, keys_json TEXT, family_json TEXT, aliases_json TEXT);
CREATE TABLE IF NOT EXISTS dss_check (key TEXT, run_id TEXT, source TEXT, url TEXT, detail_json TEXT);
DROP TABLE IF EXISTS dss_run;
DROP TABLE IF EXISTS dss_kind;
CREATE TABLE dss_kind (id TEXT PRIMARY KEY, kind TEXT, conf TEXT, why TEXT, by TEXT, rule TEXT, review INTEGER, model TEXT, at TEXT, run TEXT);
CREATE TABLE dss_run (run_id TEXT PRIMARY KEY, run_at TEXT, finished_at TEXT, scope_json TEXT, sources_json TEXT, counts_json TEXT, detail_json TEXT);
"""
# dss_run.scope_json — 전체 run 은 null, 구독만 본 run 은 ["subscriptions"](proddb/build/subs/ledger_run.py). detail_json — 원장의 run 기록 전체(reclassified 등)


VIEWS = ''.join(f"""
DROP VIEW IF EXISTS dss_{k};
CREATE VIEW dss_{k} AS SELECT i.key, i.id, i.name, i.registry, i.status, i.checked_at, k.conf, k.why, k.by, k.rule, k.review
  FROM dss_item i LEFT JOIN dss_kind k ON k.id = i.id WHERE i.kind = '{k}' AND COALESCE(i.status, '') != 'deleted';""" for k in ('device', 'solution', 'service', 'subscription'))


def write_kinds(db, kinds_path=os.path.join(HERE, '..', 'dss', 'kinds.json')):
    """수집한 항목의 종류(LLM 판정 기록) — 행마다 kind · 확신 · 근거 · 판정한 것(llm · manual · rule) · 지난 규칙 · 다시 볼 것"""
    if not os.path.exists(kinds_path): return 0
    K = json.load(open(kinds_path, encoding='utf-8'))
    for i, x in (K.get('items') or {}).items():
        db.execute('INSERT OR REPLACE INTO dss_kind VALUES (?,?,?,?,?,?,?,?,?,?)', (i, x.get('kind'), x.get('conf'), x.get('why'), x.get('by'), x.get('rule'),
                   1 if x.get('review') else 0, x.get('model'), x.get('at'), x.get('run')))
    return len(K.get('items') or {})


def write_dss(db, ledger_path=os.path.join(HERE, '..', 'dss', 'ledger.json'), kinds_path=os.path.join(HERE, '..', 'dss', 'kinds.json')):
    db.executescript(SQL)
    for t in ('dss_item', 'dss_check', 'dss_run'): db.execute(f'DELETE FROM {t}')
    if not os.path.exists(ledger_path): return 0
    L = json.load(open(ledger_path, encoding='utf-8'))
    dump = lambda v: json.dumps(v, ensure_ascii=False) if v is not None else None
    for k, x in L['items'].items():
        rb = x.get('replaced_by')
        db.execute('INSERT INTO dss_item VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (k, x.get('kind'), x.get('registry'), x.get('id'), x.get('name'), x.get('status'),
                   x.get('first_seen'), x.get('checked_at'), x.get('checked_run'), x.get('changed_at'), x.get('hash'), dump(rb) if isinstance(rb, list) else rb,
                   x.get('deleted_at'), x.get('note'), dump(x.get('keys')), dump(x.get('family')), dump(x.get('aliases'))))
        for e in x.get('evidence') or []:
            db.execute('INSERT INTO dss_check VALUES (?,?,?,?,?)', (k, e.get('run'), e.get('source'), e.get('url'), dump(e)))
    for r in L.get('runs') or []:
        db.execute('INSERT INTO dss_run VALUES (?,?,?,?,?,?,?)', (r['run_id'], r.get('run_at'), r.get('finished_at'), dump(r.get('scope')), dump(r.get('sources')), dump(r.get('counts')), dump(r)))
    n = db.execute('SELECT COUNT(*) FROM dss_item').fetchone()[0]
    db.execute("INSERT OR REPLACE INTO meta VALUES ('count.dss_item', ?)", (str(n),))
    db.execute("INSERT OR REPLACE INTO meta VALUES ('count.dss_kind', ?)", (str(write_kinds(db, kinds_path)),))
    db.executescript(VIEWS)
    db.commit()
    return n


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'winmate_products.sqlite')
    d = sqlite3.connect(path)
    print('dss_item', write_dss(d, *(sys.argv[2:3] or [])))
    d.close()
