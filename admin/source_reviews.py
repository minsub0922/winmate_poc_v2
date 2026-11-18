"""Versioned, item-level decisions for the three official data sources."""
from __future__ import annotations
import hashlib
import json
import uuid

from fastapi import HTTPException

from .store import dump, now

CHANNELS = {'samsung': 'site', 'catalogs': 'ecat', 'media': 'solutions'}
LABELS = {'site': '제품', 'ecat': '카탈로그', 'solutions': '솔루션', 'cases': '도입사례', 'links': '리소스 링크'}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def read_json(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else default


def observe(origin, result, staging):
    changes = result.get('changes') or []
    if not changes:
        return
    raw = staging / 'site/raw' if staging else None
    products = read_json(raw / 'wkb_products.json', {}) if origin == 'site' and raw else {}
    specs = read_json(raw / 'wkb_specs.json', {}) if products else {}
    features = read_json(raw / 'wkb_features.json', {}) if products else {}
    moves = {row['gid']: row['movedTo'] for row in read_json(raw.parent / 'site-diff.json', {}).get('removed', [])
             if row.get('movedTo')} if products else {}
    variants = {}
    for vid, v in (products.get('variants') or {}).items():
        variants.setdefault(v.get('parentGoodsId'), {})[vid] = v
    pages = read_json(staging / 'sol/pages.json', {}) if origin == 'solutions' and staging else {}
    books = {str(b['dir']): b for b in result.get('books') or []}
    for change in changes:
        gid = change.get('gid')
        key = str(gid or change.get('dir') or change.get('id') or change.get('url') or change.get('cat') or change.get('title') or '')
        if not key:
            continue
        evidence = {}
        if origin == 'site' and gid and products and change['status'] != 'removed':
            target = moves.get(gid, gid)
            opts = variants.get(target, {})
            card = products.get('products', {}).get(target)
            if card:
                evidence = {'gid':target, 'product': card, 'variants': opts, 'specs': {i: specs[i] for i in {target, *opts} if i in specs},
                            'features': {i: features[i] for i in {target, *opts} if i in features},
                            'category':next((c for c in products['cats'] if c['no'] == card.get('catNo')), None)}
        elif origin == 'ecat':
            evidence = {**books.get(key, {}), **{k: change[k] for k in ('title','pages','tab','group','docTitle','fileModified','modifiedPages') if k in change}}
            evidence.pop('fetchedAt', None)
        elif origin == 'solutions':
            page = pages.get(key) or {}
            evidence = {k: page[k] for k in ('status','final','mainSha256','title','refs','og') if k in page}
        elif origin == 'links':
            evidence = change.get('current') or {}
        details = {k: v for k, v in change.items() if k not in ('current', 'fetchedAt', 'checked_at', 'fingerprint')}
        version = change.get('fingerprint') or fingerprint([details, evidence])
        yield key, version, details, evidence


class SourceReviews:
    def __init__(self, store):
        self.store = store
        with store.db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS source_observations(
                    source TEXT NOT NULL, origin TEXT NOT NULL, stamp TEXT NOT NULL,
                    PRIMARY KEY(source,origin));
                CREATE TABLE IF NOT EXISTS source_changes(
                    id TEXT PRIMARY KEY, source TEXT NOT NULL, origin TEXT NOT NULL, ref TEXT NOT NULL,
                    version TEXT NOT NULL, current INTEGER NOT NULL, state TEXT NOT NULL,
                    first_at TEXT NOT NULL, seen_at TEXT NOT NULL, decided_at TEXT, actor TEXT, job TEXT,
                    item TEXT NOT NULL, evidence TEXT NOT NULL);
                CREATE UNIQUE INDEX IF NOT EXISTS current_source_change ON source_changes(source,origin,ref) WHERE current=1;
                CREATE INDEX IF NOT EXISTS source_change_history ON source_changes(source,current,state,seen_at);
                CREATE TABLE IF NOT EXISTS source_review_batches(id TEXT PRIMARY KEY, at TEXT NOT NULL);
            """)

    def record(self, sid, origin, result, staging=None):
        if not result or result.get('status') in ('failed', 'unchecked'):
            return
        at = result.get('checked_at') or result.get('check_at')
        if not at:
            return
        stamp = result.get('check_id') or at
        args = (sid, origin)
        sql = 'SELECT stamp FROM source_observations WHERE source=? AND origin=?'
        if (self.store.one(sql, args) or {}).get('stamp') == stamp:
            return
        rows = list(observe(origin, result, staging))
        with self.store.db(immediate=True) as db:
            prev = db.execute(sql, args).fetchone()
            if prev and prev['stamp'] == stamp:
                return
            active = {r['ref']: r for r in db.execute('SELECT id,ref,version FROM source_changes WHERE source=? AND origin=? AND current=1', args)}
            for key, version, item, evidence in rows:
                old = active.pop(key, None)
                if old and old['version'] == version:
                    db.execute('UPDATE source_changes SET seen_at=? WHERE id=?', (at, old['id']))
                    continue
                if old:
                    db.execute('UPDATE source_changes SET current=0 WHERE id=?', (old['id'],))
                db.execute('''INSERT INTO source_changes(id,source,origin,ref,version,current,state,first_at,seen_at,item,evidence)
                              VALUES (?,?,?,?,?,1,'pending',?,?,?,?)''',
                           (uuid.uuid4().hex, sid, origin, key, version, at, at, dump(item), dump(evidence)))
            if result.get('status') in ('same', 'changed'):
                db.executemany('UPDATE source_changes SET current=0 WHERE id=?', [(r['id'],) for r in active.values()])
            db.execute('INSERT OR REPLACE INTO source_observations VALUES (?,?,?)', (*args, stamp))

    def counts(self):
        result = {}
        for row in self.store.rows('SELECT source,state,count(*) n FROM source_changes WHERE current=1 GROUP BY source,state'):
            result.setdefault(row['source'], {})[row['state']] = row['n']
        return result

    def listing(self, sid, history=False, offset=0, limit=60):
        where = 'source=? AND ' + ("(state!='pending' OR current=0)" if history else "state='pending' AND current=1")
        total = self.store.one('SELECT count(*) n FROM source_changes WHERE ' + where, (sid,))['n']
        rows = self.store.rows('SELECT id,origin,ref,state,current,first_at,seen_at,decided_at,actor,item FROM source_changes WHERE ' +
                               where + ' ORDER BY COALESCE(decided_at,first_at) DESC, rowid LIMIT ? OFFSET ?', (sid, limit, offset))
        for row in rows:
            row['item'] = json.loads(row['item'])
            row['origin_label'] = LABELS[row['origin']]
        return {'items': rows, 'total': total, 'counts': self.counts().get(sid, {})}

    def selected(self, db, sid, choices):
        if not choices or any(v not in ('apply', 'ignore') for v in choices.values()):
            raise HTTPException(422, '처리할 변경 항목과 적용 또는 무시를 선택해 주세요.')
        rows = list(db.execute("SELECT * FROM source_changes WHERE source=? AND id IN (SELECT value FROM json_each(?))",
                               (sid, dump(list(choices)))))
        if len(rows) != len(choices) or any(not r['current'] or r['state'] != 'pending' for r in rows):
            raise HTTPException(409, '새 점검이나 다른 관리자의 처리로 변경 내역이 달라졌습니다. 다시 확인해 주세요.')
        return [{**dict(r), 'item': json.loads(r['item']), 'evidence': json.loads(r['evidence'])} for r in rows]

    def complete(self, db, choices, sid, actor, jid):
        self.selected(db, sid, choices)
        at = now()
        db.executemany('UPDATE source_changes SET state=?,decided_at=?,actor=?,job=? WHERE id=?',
                       [('applied' if action == 'apply' else 'ignored', at, actor, jid, item) for item, action in choices.items()])
        db.execute('INSERT INTO source_review_batches VALUES (?,?)', (jid, at))
