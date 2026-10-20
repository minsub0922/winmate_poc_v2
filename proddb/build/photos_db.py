"""ecat/photos.json → product_photo 표(카탈로그 전용 제품 ec_* · 큐레이션 cur_* 의 실제 사진 기록).
build_db.py 가 부르고, 따로 실행하면 지금 DB 의 product_photo 표만 다시 만든다:
  python3 build/photos_db.py [winmate_products.sqlite]"""
import json, os, sys, sqlite3
HERE = os.path.dirname(os.path.abspath(__file__))
SQL = """CREATE TABLE IF NOT EXISTS product_photo (
  owner TEXT, catalog_product_id TEXT, n INTEGER, dir TEXT, page INTEGER, box_json TEXT, kind TEXT, note TEXT, source TEXT, source_url TEXT, file TEXT)"""


def write_photos(db, phf=os.path.join(HERE, '..', 'ecat', 'photos.json')):
    db.execute(SQL)
    db.execute('DELETE FROM product_photo')
    if not os.path.exists(phf):
        return 0
    PH = json.load(open(phf, encoding='utf-8'))
    ins = lambda *v: db.execute('INSERT INTO product_photo VALUES (?,?,?,?,?,?,?,?,?,?,?)', v)
    for owner, it in PH['items'].items():
        cpid = ('ec' + owner[3:]) if owner.startswith('ec_') else None  # 앱 id ec_297_045 → 카탈로그 제품 id ec297_045
        if 'none' in it:
            ins(owner, cpid, 0, None, None, None, 'none', it['none'], None, None, None)
        for k, g in enumerate(it.get('gids', [])):  # 카탈로그에 사진이 없어 같은 종류의 사이트 카드 사진을 대신 씀(note = 무엇의 사진인지)
            ins(owner, cpid, k + 1, None, None, None, 'site_card', it.get('note') or '', 'site_card', g, None)
        for q in it.get('pics', []):
            ins(owner, cpid, q['n'], q.get('dir'), q.get('p'), json.dumps(q.get('box_px')), q['kind'], q.get('note') or '',
                'pdf' if q.get('pdf') else ('external_pdf' if q.get('source_url') else 'page'),
                q.get('source_url') or (q['pdf']['url'] if q.get('pdf') else None), 'ecat/photos/' + q['file'])
    db.execute("INSERT OR REPLACE INTO meta VALUES ('count.product_photo', ?)", (str(db.execute('SELECT COUNT(*) FROM product_photo').fetchone()[0]),))
    db.commit()
    return db.execute('SELECT COUNT(*) FROM product_photo').fetchone()[0]


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'winmate_products.sqlite')
    d = sqlite3.connect(path)
    print('product_photo', write_photos(d))
    d.close()
