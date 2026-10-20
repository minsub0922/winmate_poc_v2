"""imglib/index.json → DB 표(제품 이미지 라이브러리).
  lib_image          이미지 한 장 = 한 행(종류 · 출처 · 설명 · 원래 alt · 맥락 · 원본 주소/카탈로그 쪽 · 크기 · 공간/업종 태그 · 모델 …)
  lib_image_product  이미지 ↔ 앱 제품(sg_* 사이트 카드 · ec_* 카탈로그 전용 · 큐레이션 id), relation = own(그 제품 페이지/카드) · catalog(카탈로그 쪽에서 확인) · case(그 제품을 쓴 도입사례)
  lib_image_fts      검색(FTS5): 제품명 · 설명 · alt · 맥락 · 공간 · 모델코드
build_db.py 가 부르고, 따로 실행하면 지금 DB 에 이 표들만 다시 만든다:  python3 build/imglib_db.py"""
import json, os, sys, sqlite3
HERE = os.path.dirname(os.path.abspath(__file__))
SQL = """
CREATE TABLE IF NOT EXISTS lib_image (id TEXT PRIMARY KEY, kind TEXT, source TEXT, title TEXT, descr TEXT, alt TEXT, context TEXT, url TEXT, catalog_page TEXT, box_json TEXT,
  file TEXT, width INTEGER, height INTEGER, spaces_json TEXT, industries_json TEXT, models_json TEXT, case_json TEXT, also_json TEXT, dhash TEXT);
CREATE TABLE IF NOT EXISTS lib_image_product (image_id TEXT, product_id TEXT, relation TEXT, PRIMARY KEY(image_id, product_id));
CREATE INDEX IF NOT EXISTS ix_lip_prod ON lib_image_product(product_id);
"""


def write_imglib(db, idx=os.path.join(HERE, '..', 'imglib', 'index.json')):
    db.executescript(SQL)
    db.execute('DELETE FROM lib_image'); db.execute('DELETE FROM lib_image_product')
    db.execute('DROP TABLE IF EXISTS lib_image_fts')
    db.execute("CREATE VIRTUAL TABLE lib_image_fts USING fts5(id UNINDEXED, text, tokenize='unicode61')")
    if not os.path.exists(idx): return 0
    L = json.load(open(idx, encoding='utf-8'))['images']
    for o in L:
        db.execute('INSERT INTO lib_image VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (
            o['id'], o['kind'], o['src'], o['title'], o.get('desc'), o.get('alt'), o.get('ctx'), o.get('url'), o.get('page'), json.dumps(o.get('box')) if o.get('box') else None,
            o.get('file'), o.get('w'), o.get('h'), json.dumps(o.get('spaces') or [], ensure_ascii=False), json.dumps(o.get('ind') or []), json.dumps(o.get('models') or []),
            json.dumps(o.get('case'), ensure_ascii=False) if o.get('case') else None, json.dumps(o.get('also'), ensure_ascii=False) if o.get('also') else None, o.get('dhash')))
        for p in o['products']:
            db.execute('INSERT OR IGNORE INTO lib_image_product VALUES (?,?,?)', (o['id'], p, o.get('rel', 'own')))
        text = ' '.join(filter(None, [o['title'], o.get('desc'), o.get('alt'), o.get('ctx'), ' '.join(o.get('spaces') or []), ' '.join(o.get('models') or []),
                                      ' '.join(o.get('cats') or []), o['kind'], (o.get('case') or {}).get('cust')]))
        db.execute('INSERT INTO lib_image_fts VALUES (?,?)', (o['id'], text))
    n = db.execute('SELECT COUNT(*) FROM lib_image').fetchone()[0]
    db.execute("INSERT OR REPLACE INTO meta VALUES ('count.lib_image', ?)", (str(n),))
    db.commit()
    return n


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'winmate_products.sqlite')
    d = sqlite3.connect(path)
    print('lib_image', write_imglib(d), 'lib_image_product', d.execute('SELECT COUNT(*) FROM lib_image_product').fetchone()[0])
    d.close()
