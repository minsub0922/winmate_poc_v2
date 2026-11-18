"""Versioned, item-level decisions for the three official data sources."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import uuid

from fastapi import HTTPException

from .store import dump, now

CHANNELS = {'samsung': 'site', 'catalogs': 'ecat', 'media': 'solutions'}
LABELS = {'site': '제품', 'ecat': '카탈로그', 'solutions': '솔루션', 'cases': '도입사례', 'links': '리소스 링크'}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def read_json(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else default


def spec_differences(old, current, evidence, ids):
    changes = []
    for gid in dict.fromkeys(ids):
        def fields(rows):
            found = {}
            for section, label, value in rows:
                found.setdefault((section,label),[]).append(value)
            return found
        before, after = fields(old.get(gid,[])), fields(current.get(gid,[]))
        model = (evidence.get('variants',{}).get(gid) or evidence['product']).get('mdlCode') or gid
        for group, label in dict.fromkeys([*before,*after]):
            k = (group,label)
            if before.get(k) != after.get(k):
                changes.append({'field':' · '.join([model,group,label]),'before':' / '.join(before.get(k,[])),
                                'after':' / '.join(after.get(k,[]))})
    return changes


def product_version(data):
    p = data['product']
    images = lambda values: [(v.get('src') or '').split('?')[0] for v in values]
    return [data.get('gid'), {k:p.get(k) for k in ('goodsNm','mdlCode','goodsDetailUrl','uspDescList','goodsTpCd','dlgtDispClsfEnNm')},
            images(p.get('images') or [])[:3], data['specs'],
            {k:[v.get(f) for f in ('mdlCode','optName','optValue','optValue2','soldOut')] for k,v in data['variants'].items()},
            {k:[[f.get('h'),f.get('desc'),f.get('disc'),images(f.get('imgs') or [])] for f in v.get('feats',[])]
             for k,v in data['features'].items()}]


def observe(origin, result, staging, root=None):
    changes = result.get('changes') or []
    if not changes:
        return
    raw = staging / 'site/raw' if staging else None
    products = read_json(raw / 'wkb_products.json', {}) if origin == 'site' and raw else {}
    specs = read_json(raw / 'wkb_specs.json', {}) if products else {}
    features = read_json(raw / 'wkb_features.json', {}) if products else {}
    failed_goods = {str(e['gid']) for e in read_json(raw / 'errors.json',[]) if e.get('gid')} if products else set()
    diff = read_json(raw.parent / 'site-diff.json', {}) if products else {}
    spec_ids = {v['gid']:v['diff']['specs'] for v in diff.get('changed',[]) if 'specs' in v['diff']}
    old_specs = read_json(root / 'proddb/raw/wkb_specs.json',{}) if root and spec_ids else {}
    moves = {row['gid']: row['movedTo'] for row in diff.get('removed', [])
             if row.get('movedTo')} if products else {}
    variants = {}
    for vid, v in (products.get('variants') or {}).items():
        variants.setdefault(v.get('parentGoodsId'), {})[vid] = v
    pages = read_json(staging / 'sol/pages.json', {}) if origin == 'solutions' and staging else {}
    baseline = read_json(root / 'proddb/dss/watch-state.json',{}).get('solutions',{}) if root and pages else {}
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
                if failed_goods.intersection({target,*opts}):
                    evidence['incomplete'] = True
        elif origin == 'ecat':
            evidence = {**books.get(key, {}), **{k: change[k] for k in ('title','pages','tab','group','listed','docTitle','fileModified','modifiedPages','fileSignature') if k in change}}
            evidence.pop('fetchedAt', None)
        elif origin == 'solutions':
            page = pages.get(key) or {}
            evidence = {k: page[k] for k in ('status','final','mainSha256','title','refs','og') if k in page}
            if page.get('mainText'):
                evidence['text'] = page['mainText']
        elif origin == 'links':
            evidence = change.get('current') or {}
        details = {k: v for k, v in change.items() if k not in ('current', 'fetchedAt', 'checked_at', 'fingerprint')}
        if origin == 'site' and evidence.get('product'):
            version = fingerprint([details['status'],evidence['gid'] if details['status']=='moved' else product_version(evidence)])
            if old_specs and gid in spec_ids:
                details['comparison'] = spec_differences(old_specs,specs,evidence,spec_ids[gid])
        elif origin == 'solutions' and evidence:
            version = fingerprint([details['status'],{k:evidence.get(k) for k in ('status','final','mainSha256','title')}])
            previous = baseline.get(key,{})
            details['comparison'] = [{'field':label,'before':str(previous[before]),'after':str(evidence[after])}
                for label,before,after in [('응답 상태','status','status'),('원본 주소','final','final'),('제목','title','title'),('본문 SHA-256','hash','mainSha256')]
                if previous.get(before) and evidence.get(after) and previous[before] != evidence[after]]
        else:
            version = change.get('fingerprint') or fingerprint([details, evidence])
        yield key, version, details, evidence


class SourceReviews:
    def __init__(self, store, root=None):
        self.store, self.root = store, Path(root) if root else None
        with store.db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS source_observations(
                    source TEXT NOT NULL, origin TEXT NOT NULL, stamp TEXT NOT NULL, observed_at TEXT,
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
            if 'observed_at' not in {r['name'] for r in db.execute('PRAGMA table_info(source_observations)')}:
                db.execute('ALTER TABLE source_observations ADD COLUMN observed_at TEXT')

    def record(self, sid, origin, result, staging=None):
        if not result or result.get('status') in ('failed', 'unchecked'):
            return
        at = result.get('checked_at') or result.get('check_at')
        if not at:
            return
        stamp = str(result.get('check_id') or at)
        args = (sid, origin)
        sql = 'SELECT stamp FROM source_observations WHERE source=? AND origin=?'
        if (self.store.one(sql, args) or {}).get('stamp') == stamp:
            return
        rows = list(observe(origin, result, staging, self.root))
        with self.store.db(immediate=True) as db:
            prev = db.execute('SELECT stamp,julianday(observed_at)>julianday(?) AS newer FROM source_observations WHERE source=? AND origin=?', (at,*args)).fetchone()
            if prev and (prev['stamp'] == stamp or prev['newer']):
                return
            active = {r['ref']: r for r in db.execute('SELECT id,ref,version FROM source_changes WHERE source=? AND origin=? AND current=1', args)}
            for key, version, item, evidence in rows:
                old = active.pop(key, None)
                if old and old['version'] == version:
                    db.execute('UPDATE source_changes SET seen_at=?,version=?,item=?,evidence=? WHERE id=?', (at,version,dump(item),dump(evidence),old['id']))
                    continue
                if old:
                    db.execute('UPDATE source_changes SET current=0 WHERE id=?', (old['id'],))
                db.execute('''INSERT INTO source_changes(id,source,origin,ref,version,current,state,first_at,seen_at,item,evidence)
                              VALUES (?,?,?,?,?,1,'pending',?,?,?,?)''',
                           (uuid.uuid4().hex, sid, origin, key, version, at, at, dump(item), dump(evidence)))
            if result.get('status') in ('same', 'changed'):
                db.executemany('UPDATE source_changes SET current=0 WHERE id=?', [(r['id'],) for r in active.values()])
            db.execute('INSERT OR REPLACE INTO source_observations(source,origin,stamp,observed_at) VALUES (?,?,?,?)', (*args,stamp,at))

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
