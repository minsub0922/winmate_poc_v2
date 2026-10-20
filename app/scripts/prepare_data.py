"""Prepare a read-only API snapshot and its materialized artifact UI projection.

The 1,068 display rows include editorial labels, search indexes and frozen pack addresses
that are not raw product_family columns. Preserve those fields explicitly; validate source
entities against the real database. The API reads the resulting SQLite tables, not JSON.
"""
from __future__ import annotations
import hashlib
import os
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
    inputs=[source,DATA/'catalog.json',DATA/'products_db.json',*sorted((DATA/'product-details').glob('d[0-9][0-9].json')),*sorted((DATA/'static/img/prod').glob('d[0-9][0-9].json'))]
    signature=hashlib.sha256()
    for file in inputs:
        signature.update(str(file.relative_to(ROOT)).encode())
        with file.open('rb') as handle:signature.update(hashlib.file_digest(handle,'sha256').digest())
    fingerprint=signature.hexdigest()
    if DATABASE.exists() and not force:
        try:
            with sqlite3.connect(f'file:{DATABASE}?mode=ro',uri=True) as current:
                row=current.execute("SELECT payload FROM wm_ui_meta WHERE key='projection_inputs_sha256'").fetchone()
                if row and json.loads(row[0])==fingerprint:return DATABASE
        except sqlite3.Error:
            pass
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    pending = DATABASE.with_name(f'{DATABASE.stem}.preparing.{os.getpid()}.sqlite')
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
        known_products = {p['id']: p for p in rows}
        for file in sorted((DATA / 'static/img/prod').glob('d[0-9][0-9].json')):
            pack = int(file.stem[1:])
            items = json.loads(file.read_text())['items']
            db.executemany('INSERT OR REPLACE INTO wm_ui_detail VALUES (?,?,?,?)', [(key,pack,i,dump(value)) for i,(key,value) in enumerate(items.items())])
        # App-owned reviewed details override the immutable reference snapshot.
        # Reject wrong IDs/pack addresses rather than silently serving another model.
        for file in sorted((DATA / 'product-details').glob('d[0-9][0-9].json')):
            pack = int(file.stem[1:])
            items = json.loads(file.read_text())['items']
            for key, value in items.items():
                if key not in known_products or known_products[key].get('d') != pack:
                    raise ValueError(f'검토된 상세의 제품/팩 주소가 다릅니다: {key}, {file.name}')
                if value.get('specProductId') and value['specProductId'] != key:
                    raise ValueError(f'검토된 스펙의 제품이 다릅니다: {key}')
            db.executemany('INSERT OR REPLACE INTO wm_ui_detail VALUES (?,?,?,?)', [(key,pack,i,dump(value)) for i,(key,value) in enumerate(items.items())])
        # Runtime review rows follow the final UI projection. The source DB is
        # read-only and keeps its original review history.
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='product_spec_review'").fetchone():
            records=[(key,json.loads(payload)) for key,payload in db.execute('SELECT id,payload FROM wm_ui_detail')]
            db.executemany("UPDATE product_spec_review SET model=COALESCE(NULLIF(?,''),model),reviewed_at=COALESCE(NULLIF(?,''),reviewed_at),detail_json=? WHERE id=?",[(value.get('specModel',''),value.get('specReviewedAt',''),dump(value),key) for key,value in records])
        metadata = {key:value for key,value in exported.items() if key != 'products'}
        metadata['source_database'] = 'winmate_products.sqlite'
        db.executemany('INSERT INTO wm_ui_meta VALUES (?,?)', [
            ('products',dump(metadata)),
            ('source_sha256',dump(hashlib.file_digest(source.open('rb'),'sha256').hexdigest())),
            ('projection_inputs_sha256',dump(fingerprint)),
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
