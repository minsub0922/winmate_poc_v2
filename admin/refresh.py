from __future__ import annotations
import gzip
import json
import os
from pathlib import Path
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
from urllib.parse import urlsplit, urlencode

from .config import ROOT
from .engine import Cancelled, EngineError, analyze, catalog_listing, decide, extract, fetch, html_text
from .inventory import read
from .store import digest, dump, now, semantic_digest


def run_command(args, directory, cancel, progress):
    log = directory / 'collector.log'
    with log.open('wb') as stream:
        process = subprocess.Popen(args, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT,
                                   env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, start_new_session=True)
        started = time.monotonic()
        try:
            while process.poll() is None:
                if cancel() or time.monotonic() - started > 7200:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                    if cancel():
                        raise Cancelled()
                    raise EngineError('수집 시간이 2시간을 넘었습니다. 작업 내역을 확인해 주세요.')
                progress('제품 · 옵션 · 사양 · 특장점 수집 중', min(65, 15 + int((time.monotonic() - started) / 30)))
                time.sleep(0.5)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait()
    if process.returncode:
        errors = read(directory / 'raw/errors.json', [])
        raise EngineError(f'원본 수집이 완전하지 않아 반영하지 않았습니다. 오류 {len(errors)}건. 작업 상세에서 로그를 확인해 주세요.')


def samsung_refresh(store, directory, progress, cancel):
    raw = directory / 'raw'
    raw.mkdir()
    shutil.copy2(ROOT / 'proddb/raw/site_lists.txt', raw / 'site_lists.txt')
    run_command(['node', str(ROOT / 'admin/collect.mjs'), str(raw)], directory, cancel, progress)
    data = read(raw / 'wkb_products.json')
    specs = read(raw / 'wkb_specs.json')
    features = read(raw / 'wkb_features.json')
    if not data.get('products') or not data.get('finishedAt'):
        raise EngineError('완성된 제품 원본이 없습니다.')
    before = read(ROOT / 'proddb/raw/wkb_products.json').get('products', {})
    old_ids, current_ids = set(before), set(data['products'])
    changes = {'added': sorted(current_ids - old_ids), 'missing_candidates': sorted(old_ids - current_ids),
               'changed': sorted(g for g in current_ids & old_ids if digest(data['products'][g]) != digest(before[g])),
               'categories': len(data['cats']), 'cards': len(current_ids), 'variants': len(data.get('variants', {})),
               'specs': len(specs), 'features': len(features), 'coverage': '공식 탐색 + 기존 분류 합집합, 목록 전체 페이지, 옵션별 사양, PDP 특장점'}
    progress('AI가 신규·변경·삭제 후보 검토', 73)
    decision = decide([{'id': 'diff', 'text': dump(changes)}, {'id': 'collected', 'text': dump({'finished_at': data['finishedAt'], 'errors': [], 'coverage': changes['coverage']})}], cancel)
    existing = store.rows("SELECT id,external_id,payload FROM assets WHERE kind='product' AND source_id='samsung'")
    by_gid = {}
    for r in existing:
        p = json.loads(r['payload'])
        gid = p.get('gid') or p.get('official', {}).get('goodsId')
        if gid:
            by_gid.setdefault(gid, []).append((r, p))
    assets = []
    for gid, p in data['products'].items():
        matches = by_gid.get(gid) or [({'id': 'product:sg_' + gid.lower(), 'external_id': 'sg_' + gid.lower()}, {})]
        for prior, overlay in matches:
            url = p.get('goodsDetailUrl', '')
            if not url.startswith('https://'):
                url = 'https://www.samsung.com/sec/business/' + url.lstrip('/')
            payload = {**overlay, 'official': p, 'specs': specs.get(gid, []), 'features': features.get(gid, {}),
                       'source_checked_at': data['finishedAt'], 'scope': 'admin-managed', 'gid': gid}
            assets.append({'id': prior['id'], 'external_id': prior['external_id'], 'source_id': 'samsung', 'kind': 'product',
                'title': p['goodsNm'], 'url': url, 'path': str((raw / 'wkb_products.json').relative_to(store.home)),
                'payload': payload, 'content': dump(payload), 'imported_at': data['finishedAt']})
    # Preserve every old product, image address and historical reference. Missing products become review candidates.
    missing_assets = [r['id'] for r in existing if (json.loads(r['payload']).get('gid') or json.loads(r['payload']).get('official', {}).get('goodsId')) in changes['missing_candidates']]
    (directory / 'source-inventory.json').write_text(dump({'checked_at': now(), 'categories': data['cats'], 'errors': [], 'complete': True}))
    return assets, changes, decision, missing_assets


def catalog_refresh(store, source, directory, progress, cancel):
    response = fetch(source['url'], cancel=cancel)
    raw = response['body'].decode('utf-8', 'replace')
    (directory / 'listing.html').write_bytes(response['body'])
    current = catalog_listing(raw, response['url'])
    if not current:
        raise EngineError('카탈로그 목록을 파싱하지 못했습니다.')
    # Keep historical documents as separate targets, even when they left the listing.
    documents = {r['id']: r for r in current}
    known_keys = set()
    for row in store.rows("SELECT id,external_id,title,url FROM assets WHERE kind='catalog'"):
        u = row['url'] or ''
        m = re.search(r'[?&]Dir=(\d+)', u)
        if not m:
            continue
        publisher = 'b2c' if '/b2c/' in urlsplit(u).path else 'b2b'
        key = f'{publisher}:{m[1]}'
        known_keys.add(key)
        documents.setdefault(key, {'id': key, 'dir': m[1], 'publisher': publisher, 'title': row['title'], 'url': u, 'historical': True})
        documents[key]['legacy_asset_id'] = row['id']
    assets, inventory, errors = [], [], []
    for i, doc in enumerate(documents.values()):
        if cancel():
            raise Cancelled()
        progress(f"카탈로그 {i + 1}/{len(documents)} · {doc['title']}", 10 + int(i / max(1, len(documents)) * 70))
        base = f"https://samsung.aiibook.net/{doc['publisher']}/access/ecatalogt.php?"
        def get_page(page):
            return fetch(base + urlencode({'Dir': doc['dir'], 'acmode': 'disable', 'eclang': 'ko', 'um': 't', 'start': page}), cancel=cancel)
        try:
            first = get_page(1)
            text = first['body'].decode('utf-8', 'replace')
            count = re.search(r'(?:var\s+)?cataPages\s*=\s*[\x22\x27]?(\d+)', text)
            if not count or not 1 <= int(count[1]) <= 1200:
                raise EngineError('유효한 전체 쪽 수를 찾지 못했습니다.')
            n = int(count[1])
            pages = {}
            raw_dir = directory / doc['id'].replace(':', '-')
            raw_dir.mkdir()
            def harvest(page_no, content):
                (raw_dir / f'{page_no}.html').write_text(content)
                for match in re.finditer(r'(\d+)페이지 내용\s*:\s*(.*?)(?=\d+페이지 내용\s*:|</|$)', content, re.S):
                    p = int(match[1])
                    if 1 <= p <= n:
                        pages[p] = html_text(unescape_text(match[2]))
            harvest(1, text)
            for page_no in range(1, n + 1):
                if cancel():
                    raise Cancelled()
                if page_no not in pages:
                    harvest(page_no, get_page(page_no)['body'].decode('utf-8', 'replace'))
            missing = sorted(set(range(1, n + 1)) - set(pages))
            if missing:
                raise EngineError(f'전체 {n}쪽 중 {len(missing)}쪽이 누락되었습니다.')
            # Empty pages are retained and explicitly excluded from text extraction, never invented by the LLM.
            blocks = [{'id': f'p{p}', 'location': f'{p}쪽', 'text': t} for p, t in sorted(pages.items()) if t.strip()]
            entities = []
            batches, batch, size = [], [], 0
            for b in blocks:
                if len(b['text']) > 55000:
                    raise EngineError('한 쪽의 원문이 너무 깁니다. 별도 확인이 필요합니다.')
                if batch and (size + len(b['text']) > 55000 or len(batch) >= 12):
                    batches.append(batch); batch, size = [], 0
                batch.append(b); size += len(b['text'])
            if batch:
                batches.append(batch)
            for group in batches:
                analysis = analyze(group, cancel)
                entities.extend(analysis['entities'])
            title_match = re.search(r'<title>(.*?)</title>', text, re.S | re.I)
            actual_title = html_text(title_match[1]) if title_match else doc['title']
            payload = {**doc, 'doc_title': actual_title, 'pages': n, 'text': pages, 'entities': entities,
                       'empty_text_pages': [p for p, t in pages.items() if not t.strip()], 'fetched_at': first['fetched_at'],
                       'coverage': '모든 쪽 텍스트 수집. 이미지 전용 쪽의 사양·사진 crop은 미검토.'}
            (raw_dir / 'document.json').write_text(dump(payload))
            assets.append({'id': doc.get('legacy_asset_id', 'catalog:' + doc['id']), 'external_id': doc['id'], 'source_id': 'catalogs',
                           'kind': 'catalog', 'title': actual_title, 'url': doc['url'], 'payload': payload,
                           'content': '\n'.join(pages.values()), 'path': str((raw_dir / 'document.json').relative_to(store.home)), 'imported_at': now()})
            # These are explicitly supplemental entities; legacy ec IDs never get reassigned by sequential position.
            for e in entities:
                key = digest({'doc': doc['id'], 'kind': e['kind'], 'name': e['name'], 'model': e.get('model')})[:24]
                assets.append({'id': 'extracted:' + key, 'external_id': key, 'source_id': 'catalogs', 'kind': e['kind'],
                               'title': e['name'], 'url': doc['url'], 'payload': {**e, 'catalog': doc['id'], 'scope': 'supplemental'},
                               'content': dump(e), 'imported_at': now()})
            inventory.append({'id': doc['id'], 'url': doc['url'], 'pages': n, 'received': len(pages), 'hash': digest(payload),
                              'at': now(), 'status': 'text_complete', 'empty_text_pages': payload['empty_text_pages']})
        except Cancelled:
            raise
        except Exception as exc:
            errors.append({'id': doc['id'], 'error': str(exc)[:400]})
    summary = {'documents': len(documents), 'completed': len(inventory), 'errors': errors,
               'new_ids': sorted(set(documents) - known_keys),
               'coverage': '현재 B2B/B2C 목록과 기존 권의 합집합. publisher와 Dir를 함께 식별. 이미지 crop·영상 및 이미지 전용 쪽은 미검토.'}
    (directory / 'source-inventory.json').write_text(dump({'targets': inventory, **summary}))
    if errors:
        raise EngineError(f'카탈로그 {len(documents)}권 중 {len(errors)}권 확인 실패. 기존 데이터를 보존했습니다.')
    decision = decide([{'id': 'summary', 'text': dump(summary)}], cancel)
    unique = {}
    for asset in assets:
        if asset['id'] in unique and asset['id'].startswith('extracted:'):
            prior = unique[asset['id']]['payload']
            prior['evidence'] = list({dump(e): e for e in prior.get('evidence', []) + asset['payload'].get('evidence', [])}.values())
            unique[asset['id']]['content'] = dump(prior)
        else:
            unique[asset['id']] = asset
    return list(unique.values()), summary, decision, []


def unescape_text(text):
    from html import unescape
    return unescape(text)


def custom_refresh(store, source, directory, progress, cancel):
    urls = [source['url']]
    if source['id'] == 'media':
        urls = sorted({r['url'] for r in store.rows("SELECT url FROM assets WHERE source_id='media' AND url LIKE 'https://%'")})
    if not urls:
        raise EngineError('갱신할 원본 URL이 없습니다.')
    assets, errors = [], []
    for i, url in enumerate(urls):
        if cancel():
            raise Cancelled()
        progress(f'원문 분석 {i + 1}/{len(urls)}', 10 + int(i / len(urls) * 75))
        try:
            response = fetch(url, cancel=cancel)
            name = Path(urlsplit(response['url']).path).name or 'page.html'
            blocks, mime = extract(response['body'], name, response['type'])
            result = analyze(blocks, cancel, (response['body'], mime) if mime else None)
            key = digest(url)[:24]
            raw_file = directory / (key + '.source')
            raw_file.write_bytes(response['body'])
            assets.append({'id': 'document:' + key, 'external_id': key, 'source_id': source['id'], 'kind': 'document',
                           'title': result['title'], 'url': response['url'], 'path': str(raw_file.relative_to(store.home)),
                           'payload': {**result, 'blocks': blocks, 'scope': 'supplemental'}, 'content': '\n'.join(b['text'] for b in blocks), 'imported_at': now()})
        except Cancelled:
            raise
        except Exception as exc:
            errors.append({'url': url, 'error': str(exc)[:250]})
    summary = {'targets': len(urls), 'collected': len(assets), 'errors': errors,
               'coverage': '등록된 원문 URL 각각의 본문. 연결 PDF·영상·하위 페이지 신규 탐색은 별도.'}
    (directory / 'source-inventory.json').write_text(dump(summary))
    if errors:
        raise EngineError(f'{len(urls)}개 원본 중 {len(errors)}개를 확인하지 못해 반영을 보류했습니다.')
    decision = decide([{'id': 'summary', 'text': dump(summary)}], cancel)
    return assets, summary, decision, []


def save_release(store, sid, assets, summary, decision, missing, directory):
    if not assets or len({a['id'] for a in assets}) != len(assets):
        raise EngineError('비어 있거나 중복 ID가 있는 변경은 반영할 수 없습니다.')
    with store.db(immediate=True) as db:
        before = [dict(r) for r in db.execute('SELECT * FROM assets WHERE source_id=?', (sid,))]
        source_before = dict(db.execute('SELECT * FROM sources WHERE id=?', (sid,)).fetchone())
        prior = {r['id']: r for r in before}
        changes, prepared = [], []
        for value in assets:
            a = dict(value)
            old = prior.get(a['id'], {})
            payload = dict(a.get('payload', {}))
            old_payload = json.loads(old.get('payload', '{}'))
            for key in ('admin_notes', 'admin_tags'):
                if key in old_payload:
                    payload[key] = old_payload[key]
            a['payload'] = payload
            a['status'] = old.get('status', 'indexed')
            h = digest({'payload': payload, 'content': a.get('content', '')})
            content_changed = not old or semantic_digest(payload, a.get('content', '')) != semantic_digest(old_payload, old.get('content', ''))
            a['_content_changed'] = content_changed
            if content_changed:
                changes.append({'id': a['id'], 'title': a['title'], 'action': 'added' if not old else 'changed', 'old_hash': old.get('hash'), 'new_hash': h})
            prepared.append(a)
        manifest = {'id': directory.name, 'source_id': sid, 'at': now(), 'scope': 'admin-managed',
                    'changes': changes, 'review_candidates': missing, 'summary': summary, 'decision': decision,
                    'sync': {'admin_database': True, 'production_database': False, 'production_agent_kb': False},
                    'note': '관리자 격리 DB에 반영. 기존 Winmate 앱 데이터·Agent KB·이미지 pack은 배포 전 통합 검증 대상입니다.'}
        # The write lock spans the snapshot, conflict checks and commit, so concurrent edits are preserved.
        with gzip.open(directory / 'before.json.gz', 'wt', encoding='utf-8') as f:
            json.dump({'assets': before, 'source': source_before}, f, ensure_ascii=False)
        (directory / 'change-plan.json').write_text(dump(manifest))
        (directory / 'assets.json').write_text(dump(prepared))
        for a in prepared:
            old = prior.get(a['id'], {})
            content = a.get('content', '')
            h = digest({'payload': a['payload'], 'content': content})
            at = now()
            db.execute('''INSERT INTO assets(id,source_id,kind,title,external_id,url,path,content,payload,hash,imported_at,first_seen,updated_at,checked_at,status)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                       title=excluded.title,url=excluded.url,path=excluded.path,content=excluded.content,payload=excluded.payload,
                       hash=excluded.hash,imported_at=excluded.imported_at,updated_at=excluded.updated_at,checked_at=excluded.checked_at''',
                       (a['id'], sid, a['kind'], a['title'], a.get('external_id'), a.get('url'), a.get('path'), content, dump(a['payload']), h,
                        a.get('imported_at'), old.get('first_seen', at), at if a['_content_changed'] else old.get('updated_at', at), at, a['status']))
            rowid = db.execute('SELECT rowid FROM assets WHERE id=?', (a['id'],)).fetchone()[0]
            db.execute('DELETE FROM asset_fts WHERE rowid=?', (rowid,))
            db.execute('INSERT INTO asset_fts(rowid,id,title,content) VALUES (?,?,?,?)', (rowid, a['id'], a['title'], content[:50000]))
        for aid in missing:
            db.execute("UPDATE assets SET status='needs_review' WHERE id=? AND status!='archived'", (aid,))
        previous = db.execute("SELECT id FROM releases WHERE source_id=? AND status='active'", (sid,)).fetchone()
        db.execute("UPDATE releases SET status='superseded' WHERE source_id=? AND status='active'", (sid,))
        db.execute('INSERT INTO releases(id,at,source_id,status,path,manifest,previous_id) VALUES (?,?,?,?,?,?,?)', (directory.name, now(), sid, 'active', str(directory.relative_to(store.home)), dump(manifest), previous[0] if previous else None))
        db.execute("UPDATE sources SET refreshed_at=?,status='review',decision=?,error=NULL WHERE id=?", (now(), dump(decision), sid))
    return manifest


def rollback(store, release_id):
    release = store.one("SELECT * FROM releases WHERE id=? AND status='active'", (release_id,))
    if not release:
        raise EngineError('소스의 현재 활성 릴리스만 복구할 수 있습니다.')
    directory = (store.home / release['path']).resolve()
    if not directory.is_relative_to(store.home.resolve()):
        raise EngineError('복구 경로가 올바르지 않습니다.')
    with gzip.open(directory / 'before.json.gz', 'rt', encoding='utf-8') as f:
        before = json.load(f)
    after = read(directory / 'assets.json', [])
    old_by_id = {a['id']: a for a in before['assets']}
    after_by_id = {a['id']: a for a in after}
    with store.db(immediate=True) as db:
        if not db.execute("SELECT id FROM releases WHERE id=? AND status='active'", (release_id,)).fetchone():
            raise EngineError('복구 대기 중 활성 버전이 변경되었습니다.')
        current = [dict(r) for r in db.execute('SELECT * FROM assets WHERE source_id=?', (release['source_id'],))]
        if {a['id'] for a in current} != set(old_by_id) | set(after_by_id):
            raise EngineError('릴리스 이후 소스의 에셋 구성이 변경되어 복구를 보류했습니다.')
        for a in current:
            expected = after_by_id.get(a['id'])
            h = digest({'payload': expected.get('payload', {}), 'content': expected.get('content', '')}) if expected else old_by_id.get(a['id'], {}).get('hash')
            expected_status = expected.get('status', 'indexed') if expected else old_by_id.get(a['id'], {}).get('status')
            allowed = {expected_status}
            if a['id'] in json.loads(release['manifest']).get('review_candidates', []):
                allowed.add('needs_review')
            if not h or a['hash'] != h or a['status'] not in allowed:
                raise EngineError('릴리스 후 변경한 자료가 있습니다. 변경 내역을 확인한 뒤 소스별로 복구해 주세요.')
        for a in current:
            rowid = db.execute('SELECT rowid FROM assets WHERE id=?', (a['id'],)).fetchone()[0]
            db.execute('DELETE FROM asset_fts WHERE rowid=?', (rowid,))
        db.execute('DELETE FROM assets WHERE source_id=?', (release['source_id'],))
        for a in before['assets']:
            keys = list(a)
            db.execute('INSERT INTO assets(' + ','.join(keys) + ') VALUES (' + ','.join('?' for _ in keys) + ')', list(a.values()))
            rowid = db.execute('SELECT rowid FROM assets WHERE id=?', (a['id'],)).fetchone()[0]
            db.execute('INSERT INTO asset_fts(rowid,id,title,content) VALUES (?,?,?,?)', (rowid, a['id'], a['title'], a['content'][:50000]))
        db.execute("UPDATE releases SET status='rolled_back' WHERE id=?", (release_id,))
        if release['previous_id']:
            db.execute("UPDATE releases SET status='active' WHERE id=?", (release['previous_id'],))
        source = before['source']
        db.execute('UPDATE sources SET refreshed_at=?,status=?,decision=?,error=? WHERE id=?', (source['refreshed_at'], source['status'], source['decision'], source['error'], source['id']))
    return {'restored_assets': len(before['assets']), 'source_id': release['source_id']}
