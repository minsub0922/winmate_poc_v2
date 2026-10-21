from __future__ import annotations
from datetime import datetime, timezone
import json
import hashlib
from pathlib import Path
import sqlite3

from .config import ROOT
from .store import digest, dump, now


def read(path, default=None):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default if default is not None else {}


def index_repository(store, root=ROOT, progress=lambda *a: None):
    data = root / 'app/data'
    kb = data / 'runtime/kb'
    catalog = read(data / 'catalog.json')
    exported = read(data / 'products_db.json')
    manifest = read(kb / 'manifest.json')
    assets = []

    def add(source, kind, identifier, title, payload, path='', url='', imported=None, content=None):
        assets.append({'id': f'{kind}:{identifier}', 'external_id': str(identifier), 'source_id': source,
                       'kind': kind, 'title': title or str(identifier), 'payload': payload,
                       'path': str(path), 'url': url, 'imported_at': imported,
                       'content': content if content is not None else dump(payload)})

    products = [dict(p, **exported.get('curated', {}).get(p['id'], {})) for p in catalog.get('products', [])] + exported.get('products', [])
    for p in products:
        source = 'catalogs' if p['id'].startswith('ec_') else 'samsung'
        add(source, 'product', p['id'], p.get('name'), p, 'app/data/products_db.json', p.get('url', ''), exported.get('generated'))
    source_db = root / 'proddb/winmate_products.sqlite'
    if source_db.exists():
        with sqlite3.connect(f'file:{source_db}?mode=ro', uri=True) as db:
            db.row_factory = sqlite3.Row
            for r in db.execute('SELECT * FROM catalog_doc'):
                p = dict(r)
                add('catalogs', 'catalog', p['dir'], p['title'], p, f"proddb/ecat/text/{p['dir']}.json", p.get('viewer_url'))
            for r in db.execute('SELECT * FROM category'):
                p = dict(r)
                add('samsung', 'category', p['id'], p.get('name_ko'), p, 'proddb/winmate_products.sqlite', p.get('url', ''))
    for kind, section in [('solution', 'solutions'), ('case', 'cases'), ('industry', 'industries')]:
        for p in catalog.get(section, []):
            ident = p.get('id', p.get('code'))
            add('media', kind, ident, p.get('name', p.get('title')), p, 'app/data/catalog.json', p.get('url', ''))
    full = read(kb / 'catalog.json', catalog)
    for p in full.get('layouts', []):
        add('templates', 'layout', p['f'], p.get('name', p.get('code')), p, 'app/data/runtime/kb/catalog.json', imported=manifest.get('generated_at'))
    scenarios = read(kb / 'best_scenarios.json', [])
    if isinstance(scenarios, dict):
        scenarios = scenarios.get('SCENARIOS', scenarios.get('scenarios', scenarios.get('items', [])))
    for p in scenarios:
        if isinstance(p, dict):
            add('templates', 'scenario', p.get('id', digest(p)[:16]), p.get('name', p.get('title')), p, 'app/data/runtime/kb/best_scenarios.json', imported=manifest.get('generated_at'))
    for ident, p in read(data / 'images.json').get('pids', {}).items():
        add('images', 'image', 'app/' + ident, p.get('desc', ident), p, p.get('file', ''), imported=None)
    img_index = read(root / 'proddb/imglib/index.json')
    for p in img_index.get('images', []):
        add('images', 'image', p['id'], p.get('title', p.get('desc')), p, 'proddb/imglib/index.json', p.get('url', ''), img_index.get('generated'))
    spatial = read(data / 'spatial/library.json')
    for section in ['assets', 'objects', 'products', 'furniture', 'templates', 'layouts', 'scenes', 'cases']:
        values = spatial.get(section, [])
        if isinstance(values, dict):
            values = [dict(v, id=k) for k, v in values.items() if isinstance(v, dict)]
        for p in values:
            if isinstance(p, dict):
                add('spatial', 'spatial', f"{section}/{p.get('id', digest(p)[:16])}", p.get('name', p.get('title')), p, 'app/data/spatial/library.json')
    skills = read(root / 'app/web/src/domain/simulation/skills.json')
    add('templates', 'configuration', 'simulation-skills', '시뮬레이션 스킬 · 평가 기준', skills, 'app/web/src/domain/simulation/skills.json')
    for section in ['score/schema.json', 'score/criteria.json']:
        if (kb / section).exists():
            add('templates', 'configuration', section, '제안서 검토 · ' + section, read(kb / section), 'app/data/runtime/kb/' + section)
    progress('제품 · 카탈로그 · 라이브러리 색인', 40)
    # Explicit asset roots only; user/auth/runtime stores are intentionally outside this inventory.
    roots = [('images', root / 'img'), ('images', data / 'static/img'),
             ('images', data / 'backgrounds'), ('spatial', data / 'spatial'),
             ('templates', root / 'app/web/src/domain/templates'),
             ('templates', root / 'app/web/src/domain/simulation'),
             ('templates', root / 'app/web/src/domain/review'),
             ('templates', root / 'app/web/src/domain/proposals'),
             ('spatial', root / 'app/web/src/domain/spatial'),
             ('templates', root / 'app/web/public/fonts'),
             ('templates', data / 'static/lib'), ('templates', root / 'app/web/public/assets'),
             ('catalogs', root / 'proddb/ecat'), ('samsung', root / 'proddb/raw')]
    seen = set()
    cached = {r['id']: json.loads(r['payload']) for r in store.rows("SELECT id,payload FROM assets WHERE kind IN ('file','pack')")}
    for source, directory in roots:
        if not directory.exists():
            continue
        for file in directory.rglob('*'):
            if not file.is_file() or file.name.startswith('.') or file.suffix.lower() in ('.pyc', '.log'):
                continue
            absolute = file.resolve()
            if absolute in seen:
                continue
            seen.add(absolute)
            rel = str(file.relative_to(root))
            stat = file.stat()
            kind = 'pack' if file.suffix == '.json' and '/img/' in rel else 'file'
            modified = datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()
            prior = cached.get(f'{kind}:{rel}', {})
            file_hash = prior.get('file_sha256') if prior.get('bytes') == stat.st_size and prior.get('modified_at') == modified else None
            if not file_hash:
                h = hashlib.sha256()
                with file.open('rb') as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        h.update(chunk)
                file_hash = h.hexdigest()
            add(source, kind, rel, file.name, {'bytes': stat.st_size, 'modified_at': modified, 'file_sha256': file_hash,
                'extension': file.suffix, 'timestamp_note': '파일 수정 시각이며 원본 수집 시각이 아닙니다.'}, rel, content=rel)
    protected = {r['id'] for r in store.rows('SELECT id FROM sources WHERE refreshed_at IS NOT NULL')}
    store.upsert_assets([a for a in assets if a['source_id'] not in protected])
    site = read(root / 'proddb/raw/wkb_products.json')
    dates = {'samsung': site.get('finishedAt', site.get('fetchedAt')), 'images': img_index.get('generated'),
             'templates': manifest.get('generated_at'), 'media': read(data / 'media.json').get('generated')}
    with store.db() as db:
        for sid, date in dates.items():
            db.execute('UPDATE sources SET imported_at=? WHERE id=? AND refreshed_at IS NULL', (date, sid))
        db.execute("UPDATE sources SET status='indexed' WHERE kind IN ('local','custom') AND status='unchecked'")
    store.set_setting('indexed_at', now())
    store.set_setting('baseline_counts', manifest.get('counts', {}))
    store.set_setting('root', str(root))
    progress('로컬 자산 등록 완료', 95)
    return {'assets': len(assets), 'products': len(products), 'indexed_at': now()}


def inspect_database(path):
    if not path.is_file():
        return {'exists': False, 'path': str(path)}
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as db:
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%_fts%' AND name NOT LIKE 'sqlite_%'")]
        return {'exists': True, 'bytes': path.stat().st_size, 'integrity': [r[0] for r in db.execute('PRAGMA quick_check')],
                'foreign_keys': [list(r) for r in db.execute('PRAGMA foreign_key_check')],
                'tables': [{'name': name, 'rows': db.execute('SELECT count(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0]} for name in tables]}


def diagnostics(store, root=ROOT):
    results = []
    for key, label, path in [('source', '원본 제품 DB', root / 'proddb/winmate_products.sqlite'),
                             ('runtime', '앱 제품 DB', root / 'app/data/runtime/winmate_products.sqlite'),
                             ('admin', '관리자 DB', store.path)]:
        d = inspect_database(path)
        results.append({'id': key, 'name': label, **d, 'ok': d.get('integrity') == ['ok'] and not d.get('foreign_keys')})
    data = root / 'app/data'
    products = read(data / 'products_db.json')
    catalog = read(data / 'catalog.json')
    rows = catalog.get('products', []) + products.get('products', [])
    ids = [p['id'] for p in rows]
    details, broken = {}, []
    for p in rows:
        overlay = products.get('curated', {}).get(p['id'], {})
        pack = overlay.get('d', p.get('d'))
        if pack is None:
            continue
        if pack not in details:
            base = read(data / f'static/img/prod/d{pack:02d}.json').get('items', {})
            base.update(read(data / f'product-details/d{pack:02d}.json').get('items', {}))
            details[pack] = base
        if p['id'] not in details[pack]:
            broken.append(p['id'])
    results.append({'id': 'references', 'name': '제품 ID · 상세 묶음 연결', 'ok': len(ids) == len(set(ids)) and not broken,
                    'products': len(ids), 'duplicate_ids': len(ids) - len(set(ids)), 'missing_details': broken})
    manifest = read(data / 'runtime/kb/manifest.json')
    mismatches = []
    for name, info in manifest.get('inputs', {}).items():
        file = (root / name).resolve()
        if not file.is_relative_to(root.resolve()) or not file.is_file() or digest(file.read_bytes()) != info.get('sha256'):
            mismatches.append(name)
    results.append({'id': 'kb', 'name': 'Agent KB 입력 정합성', 'ok': bool(manifest) and not mismatches,
                    'generated_at': manifest.get('generated_at'), 'mismatches': mismatches, 'counts': manifest.get('counts', {})})
    return {'checked_at': now(), 'ok': all(r['ok'] for r in results), 'checks': results}
