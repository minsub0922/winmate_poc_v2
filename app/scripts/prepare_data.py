"""Prepare a read-only API snapshot and its materialized artifact UI projection.

The 1,068 display rows include editorial labels, search indexes and frozen pack addresses
that are not raw product_family columns. Preserve those fields explicitly; validate source
entities against the real database. The API reads the resulting SQLite tables, not JSON.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'app/data'
DATABASE = DATA / 'runtime/winmate_products.sqlite'


def prepare(force: bool = False) -> Path:
    source = ROOT / 'proddb/winmate_products.sqlite'
    for path in [source, DATA / 'catalog.json', DATA / 'products_db.json', DATA / 'layouts.b64', DATA / 'static/index.html']:
        if not path.is_file():
            raise FileNotFoundError(f'필수 데이터가 없습니다: {path.relative_to(ROOT)}')
    if DATABASE.exists() and not force:
        return DATABASE
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    pending = DATABASE.with_suffix('.preparing.sqlite')
    original = sqlite3.connect(f'file:{source}?mode=ro', uri=True)
    db = sqlite3.connect(pending)
    try:
        original.backup(db)
        assert db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
        catalog = json.loads((DATA / 'catalog.json').read_text())
        exported = json.loads((DATA / 'products_db.json').read_text())
        rows = [dict(p, **exported['curated'].get(p['id'], {}), cur=True) for p in catalog['products']] + exported['products']
        assert len(rows) == 1068 and len({p['id'] for p in rows}) == 1068
        goods = {row[0] for row in db.execute('SELECT id FROM product_family')}
        # product_family.id and goods_id differ in some collected snapshots.
        goods.update(row[0] for row in db.execute('SELECT goods_id FROM product_family'))
        absent = [p['id'] for p in rows if p.get('gid') and p['gid'] not in goods]
        if absent:
            raise ValueError('SQLite 원본에 없는 상품 참조: ' + ', '.join(absent[:8]))
        db.executescript('''
            DROP TABLE IF EXISTS wm_ui_product;
            DROP TABLE IF EXISTS wm_ui_detail;
            DROP TABLE IF EXISTS wm_ui_meta;
            CREATE TABLE wm_ui_product(position INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, model TEXT, name TEXT, payload TEXT NOT NULL);
            CREATE TABLE wm_ui_detail(id TEXT PRIMARY KEY, pack INTEGER NOT NULL, position INTEGER NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE wm_ui_meta(key TEXT PRIMARY KEY, payload TEXT NOT NULL);
        ''')
        dump = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        db.executemany('INSERT INTO wm_ui_product VALUES (?,?,?,?,?)', [(i,p['id'],p.get('model',''),p['name'],dump(p)) for i,p in enumerate(rows)])
        for file in sorted((DATA / 'static/img/prod').glob('d[0-9][0-9].json')):
            pack = int(file.stem[1:])
            items = json.loads(file.read_text())['items']
            db.executemany('INSERT OR REPLACE INTO wm_ui_detail VALUES (?,?,?,?)', [(key,pack,i,dump(value)) for i,(key,value) in enumerate(items.items())])
        metadata = {key:value for key,value in exported.items() if key != 'products'}
        metadata['source_database'] = 'winmate_products.sqlite'
        db.executemany('INSERT INTO wm_ui_meta VALUES (?,?)', [
            ('products',dump(metadata)),
            ('source_sha256',dump(hashlib.file_digest(source.open('rb'),'sha256').hexdigest())),
            ('projection_contract',dump('reference/live artifact display schema; 40 curated + 1028 database rows')),
        ])
        db.commit()
    finally:
        db.close(); original.close()
    pending.replace(DATABASE)
    return DATABASE


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    print(prepare(parser.parse_args().force).relative_to(ROOT))
