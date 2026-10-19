from __future__ import annotations
import json
from pathlib import Path
import sqlite3


class ProductRepository:
    def __init__(self, database: Path):
        self.database = database

    def connect(self):
        return sqlite3.connect(f'file:{self.database}?mode=ro', uri=True)

    def list(self, query: str = '', offset: int = 0, limit: int | None = None):
        sql = 'SELECT payload FROM wm_ui_product'
        args = []
        if query:
            sql += " WHERE name LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\' OR payload LIKE ? ESCAPE '\\'"
            literal = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            args = ['%' + literal + '%'] * 3
        sql += ' ORDER BY position'
        if limit is not None:
            sql += ' LIMIT ? OFFSET ?'; args += [limit,offset]
        elif offset:
            sql += ' LIMIT -1 OFFSET ?'; args.append(offset)
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute(sql,args)]

    def count(self, query: str = '') -> int:
        sql = 'SELECT count(*) FROM wm_ui_product'
        args = []
        if query:
            sql += " WHERE name LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\' OR payload LIKE ? ESCAPE '\\'"
            literal = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            args = ['%' + literal + '%'] * 3
        with self.connect() as db:
            return db.execute(sql, args).fetchone()[0]

    def bootstrap(self):
        with self.connect() as db:
            meta = json.loads(db.execute("SELECT payload FROM wm_ui_meta WHERE key='products'").fetchone()[0])
            meta.pop('source_database',None)
            meta['products'] = [json.loads(row[0]) for row in db.execute('SELECT payload FROM wm_ui_product WHERE position >= 40 ORDER BY position')]
            return meta

    def detail_pack(self, pack: int):
        with self.connect() as db:
            return {'items': {row[0]:json.loads(row[1]) for row in db.execute('SELECT id,payload FROM wm_ui_detail WHERE pack=? ORDER BY position',(pack,))}}

    def get(self, identifier: str):
        with self.connect() as db:
            row = db.execute('SELECT payload FROM wm_ui_product WHERE id=?',(identifier,)).fetchone()
            return json.loads(row[0]) if row else None
