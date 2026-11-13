"""구독(subscription) 레지스트리(app/data/subscriptions.json) → SQLite 표. DSS 의 네 번째 종류 — 제품(product_*) · 솔루션 · 서비스와 따로 둔다.
build_db.py 가 DB 를 새로 만들므로 dss_db.py 처럼 빌드 끝에서 다시 싣는다(prepare_data.py 가 runtime DB 로 복사).
  python3 proddb/build/subs_db.py [winmate_products.sqlite] [subscriptions.json]

표
  subscription           항목(program · care · care-option · package · promotion · payment) — basis official | inferred, status, 확인 시점, 기간, 원문 전체(payload)
  subscription_item      패키지 품목 — 공식 모델코드 · 이름 · B2B 제품 DB 행(product_id) · 대응 방식(exact | series | category)
  subscription_message   key message — 항목별 한 줄 메시지 · 근거 소스 · basis
  subscription_category  구독 품목 분류 — official | restricted, 제품 DB 행 수 · 행 목록 · 대표 컷
  subscription_vertical  업종(버티컬 44) → 구독 구성(공식 패키지 direct | similar | fallback, 업종 공간 기준 derived)
"""
import json, os, sqlite3, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, '..', '..', 'app', 'data', 'subscriptions.json')
SQL = """
CREATE TABLE IF NOT EXISTS subscription (id TEXT PRIMARY KEY, type TEXT, parent TEXT, name TEXT, basis TEXT, status TEXT, checked_at TEXT, checked_run TEXT,
  first_seen TEXT, valid_from TEXT, valid_to TEXT, state TEXT, url TEXT, summary TEXT, payload_json TEXT);
CREATE TABLE IF NOT EXISTS subscription_item (sub_id TEXT, ord INTEGER, label TEXT, cat TEXT, model TEXT, name TEXT, url TEXT, product_id TEXT, match TEXT, img TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS subscription_message (sub_id TEXT, ord INTEGER, text TEXT, src TEXT, basis TEXT);
CREATE TABLE IF NOT EXISTS subscription_category (id TEXT PRIMARY KEY, label TEXT, status TEXT, product_count INTEGER, products_json TEXT, rep_json TEXT, tax_json TEXT, sc_json TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS subscription_vertical (vertical_id TEXT PRIMARY KEY, name TEXT, pkg TEXT, match TEXT, cats_json TEXT, space INTEGER, space_name TEXT);
"""
TABLES = ('subscription', 'subscription_item', 'subscription_message', 'subscription_category', 'subscription_vertical')


def write_subs(db, path=REG):
    db.executescript(SQL)
    for t in TABLES: db.execute(f'DELETE FROM {t}')
    if not os.path.exists(path): return 0
    R = json.load(open(path, encoding='utf-8'))
    dump = lambda v: json.dumps(v, ensure_ascii=False) if v is not None else None
    for x in R['items']:
        summary = x.get('summary') or x.get('line') or x.get('headline') or x.get('tagline') or x.get('title')
        db.execute('INSERT INTO subscription VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (x['id'], x['type'], x.get('parent'), x['name'], x.get('basis'), x.get('status'), x.get('checkedAt'),
                   x.get('checkedRun'), x.get('firstSeen'), x.get('validFrom'), x.get('validTo'), x.get('state'), x.get('url'), summary, dump(x)))
        for k, it in enumerate(x.get('items') or [] if x['type'] == 'package' else []):
            db.execute('INSERT INTO subscription_item VALUES (?,?,?,?,?,?,?,?,?,?,?)', (x['id'], k, it['label'], it['cat'], it.get('model'), it.get('name'), it.get('url'), it.get('product'),
                       it.get('match'), it.get('img'), it.get('note')))
        for k, m in enumerate(x.get('keyMessages') or []):
            db.execute('INSERT INTO subscription_message VALUES (?,?,?,?,?)', (x['id'], k, m['text'], m.get('src'), m.get('basis')))
    for c in R.get('categories') or []:
        db.execute('INSERT INTO subscription_category VALUES (?,?,?,?,?,?,?,?,?)', (c['id'], c['label'], c['status'], c['count'], dump(c['products']), dump(c.get('rep')), dump(c['tax']), dump(c['sc']), c.get('note')))
    for vid, v in (R.get('verticals') or {}).items():
        db.execute('INSERT INTO subscription_vertical VALUES (?,?,?,?,?,?,?)', (vid, v['name'], v.get('pkg'), v['match'], dump(v['cats']), v['space'], v.get('spaceName')))
    n = db.execute('SELECT COUNT(*) FROM subscription').fetchone()[0]
    db.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
    db.execute("INSERT OR REPLACE INTO meta VALUES ('count.subscription', ?)", (str(n),))
    db.execute("INSERT OR REPLACE INTO meta VALUES ('subscription.run', ?)", (R.get('run'),))
    db.commit()
    return n


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'winmate_products.sqlite')
    d = sqlite3.connect(path)
    print('subscription', write_subs(d, *(sys.argv[2:3] or [])))
    d.close()
