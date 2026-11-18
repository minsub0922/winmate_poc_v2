"""Publish exactly the source versions chosen in the data-source dialog."""
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys

from .engine import Cancelled, EngineError
from .source_imports import CATALOG, PRODUCTS, asset, book, case, site_raw, solution
from .source_reviews import fingerprint, read_json
from .source_workspace import SourceWorkspace, publication_lock, recover
from .store import dump, now

DB = 'proddb/winmate_products.sqlite'
RUNTIME = 'app/data/runtime/winmate_products.sqlite'
KB = 'app/data/runtime/kb'
LEDGER = 'proddb/dss/ledger.json'


def run(w, args, cancel, env=None):
    with (w.dir / 'build.log').open('w+') as log:
        with subprocess.Popen(args, cwd=w.tree, env={**os.environ, **(env or {}), 'PYTHONDONTWRITEBYTECODE':'1'},
                              stdout=log, stderr=subprocess.STDOUT) as proc:
            while proc.poll() is None:
                if cancel():
                    proc.kill()
                    raise Cancelled()
                try:
                    proc.wait(timeout=0.25)
                except subprocess.TimeoutExpired:
                    continue
            if proc.returncode:
                log.seek(0)
                raise EngineError('선택한 자료를 검증하지 못했습니다. ' + log.read()[-700:])


def project_products(w, rows, cancel):
    work = w.dir / 'export'
    (work / 'data').mkdir(parents=True)
    shutil.copy(w.tree / CATALOG,work / 'data/catalog.json')
    run(w,[sys.executable, str(w.tree / 'proddb/build/export_app.py'), str(w.tree / DB), str(work)], cancel)
    export = read_json(work / 'data/products_db.json',{})
    details = read_json(work / 'img/prod/d00.json',{})['items']
    products = w.read(PRODUCTS)
    catalog = w.read(CATALOG)
    curated = {p['id']:p for p in catalog['products']}
    fresh = {**{p['id']:p for p in export['products']}, **export['curated']}
    original = {**{p['id']:p for p in products['products']}, **products['curated']}
    assets = []
    packs = {}
    for row in rows:
        item, data, gid = row['item'], row['evidence'], row['ref']
        if item['status'] == 'new-category':
            cat = item['cat']
            assets.append(asset('samsung','category','cat_'+cat.split('/')[0],cat,{'url':item['url'],'path':cat},item['url'],'proddb/raw/site_lists.txt',row['seen_at']))
            continue
        target = data.get('gid',gid)
        old_ids = [pid for pid,p in original.items() if p.get('gid') == gid]
        new_ids = [pid for pid,p in fresh.items() if p.get('gid') == target]
        archived = item['status'] in ('removed','moved')
        if not archived and not new_ids:
            raise EngineError('원본 DB에서 선택한 상품을 찾지 못했습니다. 다시 점검해 주세요.')
        for pid in old_ids or ([] if archived else new_ids):
            p = original.get(pid)
            if p is None:
                if any(t['id'] == pid for t in products.get('removed',[])):
                    raise EngineError('이미 삭제 처리한 제품과 ID가 겹칩니다. 제품 이력을 확인해 주세요.')
                p = dict(fresh[pid], id=pid)
                products['products'].append(p)
                original[pid] = p
            if archived:
                p['siteListed'] = False
                if item['status'] == 'moved':
                    p['replacementGoodsId'] = target
            else:
                source_id = pid if pid in new_ids else new_ids[0]
                record = fresh[source_id]
                for k in ('name','model','cat','spec','fam','sc','gid','url','nm','opt','models','src'):
                    if k in record and (pid not in curated or k not in ('name','model','spec')):
                        p[k] = record[k]
                p['siteListed'] = True
                rel = 'app/data/product-details/d%02d.json' % (p.get('d') or 0)
                pack = packs.setdefault(rel, None)
                if pack is None:
                    packs[rel] = pack = w.read(rel,{'items':{}})
                previous = pack['items'].get(pid,{})
                detail = dict(previous)
                detail.update({k:v for k,v in details[source_id].items() if k not in ('specs','specSources')})
                model = previous.get('specModel') or curated.get(pid,{}).get('model') or p.get('model') or data['product'].get('mdlCode')
                model_keys = {gid_:v.get('mdlCode') for gid_,v in data['variants'].items()}
                model_keys[target] = data['product'].get('mdlCode')
                match = next((data['specs'][vid] for vid,m in model_keys.items() if m == model and data['specs'].get(vid)),None)
                if match:
                    detail.update(specs=match,specModel=model,specProductId=pid,specScope='model',specReviewStatus='verified',
                                  specReviewedAt=row['seen_at'],specSources=[{'kind':'official-api','model':model,'url':p.get('url'),
                                  'evidence':'proddb/raw/wkb_specs.json','checkedAt':row['seen_at'],'sha256':fingerprint(match)}])
                elif not previous:
                    detail['specs'] = []
                pack['items'][pid] = detail
            p['checkedAt'] = row['seen_at']
            merged = {**curated.get(pid,{}), **p, 'id':pid}
            assets.append(asset('samsung','product',pid,merged.get('name'),merged,merged.get('url'),PRODUCTS,row['seen_at']))
    for rel, pack in packs.items():
        w.put(rel,pack)
    counts = products['counts']
    counts.update({k:export['counts'][k] for k in ('families','models','catalog_docs')})
    counts['total'] = len(curated) + len(products['products'])
    counts['site_rows'] = sum(p.get('src') == 'site' for p in products['products'])
    w.put(PRODUCTS,products)
    return assets


def update_ledger(w, assets, jid, actor, at):
    ledger = w.read(LEDGER)
    if ledger is None:
        return
    touched = []
    for a in assets:
        if a['kind'] not in ('product','solution'):
            continue
        key = a['kind'] + ':' + a['external_id']
        p = a['payload']
        item = ledger['items'].setdefault(key,{'id':a['external_id'],'kind':'device' if a['kind']=='product' else 'solution',
            'registry':'products_db.products' if a['kind']=='product' else 'catalog.solutions','first_seen':at,'status':'active'})
        item.update(name=a['title'], checked_at=a['imported_at'],changed_at=at,checked_run=jid)
        keys = item.setdefault('keys',{})
        if p.get('gid'):
            keys.update(gid=p['gid'],models=p.get('models',[]))
        if a['url']:
            keys['urls'] = list(dict.fromkeys([*keys.get('urls',[]),a['url']]))
        item.setdefault('evidence',[]).append({'run':jid,'source':a['source_id'],'url':a['url'],'checked_at':a['imported_at']})
        touched.append(key)
    if touched:
        ledger.setdefault('runs',[]).append({'run_id':jid,'run_at':at,'finished_at':at,'by':actor,'scope':['selected'],
                                            'counts':{'changed':len(touched)},'items':touched})
        w.put(LEDGER,ledger)


def build_projections(w, rows, actor, jid, progress, cancel):
    assets = []
    site = [r for r in rows if r['origin'] == 'site']
    volumes = [r for r in rows if r['origin'] == 'ecat']
    if site:
        site_raw(w,site)
    for row in rows:
        if cancel():
            raise Cancelled()
        if row['origin'] == 'cases':
            assets.append(case(w,row))
        elif row['origin'] == 'solutions':
            assets.extend(solution(w,row,cancel))
        elif row['origin'] == 'ecat':
            assets.append(book(w,row,cancel))
    progress('선택한 자료의 제품 DB와 검색 색인 생성',35)
    w.watch(DB)
    source = w.tree / DB
    if site or volumes:
        run(w,[sys.executable,str(w.tree / 'proddb/build/build_db.py'),str(w.tree / 'proddb/raw'),str(source)],cancel,
            {'ECAT':str(w.tree / 'proddb/ecat')})
        if site:
            assets.extend(project_products(w,site,cancel))
        with sqlite3.connect(source) as db:
            db.execute('CREATE TABLE IF NOT EXISTS product_spec_review(id TEXT PRIMARY KEY, model TEXT NOT NULL, reviewed_at TEXT NOT NULL, detail_json TEXT NOT NULL)')
            for pack in sorted((w.tree / 'app/data/product-details').glob('d[0-9][0-9].json')):
                db.executemany('INSERT OR REPLACE INTO product_spec_review VALUES (?,?,?,?)', [
                    (pid,d.get('specModel') or '',d.get('specReviewedAt') or '',dump(d))
                    for pid,d in read_json(pack,{})['items'].items() if d.get('specProductId') == pid])
        w.generated(DB)
    update_ledger(w,assets,jid,actor,now())
    if LEDGER in w.targets:
        if not source.exists():
            shutil.copy2(w.root / DB,source)
        run(w,[sys.executable,str(w.tree / 'proddb/build/dss_db.py'),str(source),str(w.tree / LEDGER)],cancel)
        w.generated(DB)
    if not source.exists():
        w.link(DB)
    w.watch(RUNTIME)
    run(w,[sys.executable,str(w.tree / 'app/scripts/prepare_data.py'),'--force'],cancel)
    w.generated(RUNTIME)
    progress('웹앱과 Agent 검색 데이터 검증',68)
    kb = w.tree / KB
    kb.mkdir(parents=True,exist_ok=True)
    args = ['node',str(w.tree / 'app/scripts/export_agent_data.mjs')]
    if (w.root / KB / 'manifest.json').is_file():
        selected = {key:sorted({a['external_id'] for a in assets if a['kind'] == kind})
                    for key,kind in [('products','product'),('cases','case'),('solutions','solution')]}
        selected.update(pages=[r['ref'] for r in rows if r['origin']=='solutions'],inputs=sorted(w.targets))
        spec = w.dir / 'selection.json'
        spec.write_text(dump(selected))
        args += ['--source-selection',str(spec)]
        for name in ('catalog.json','manifest.json'):
            w.watch(KB+'/'+name)
            shutil.copy2(w.root / KB / name,kb / name)
    else:
        for f in (w.root / KB).rglob('*'):
            if f.is_file():
                w.watch(str(f.relative_to(w.root)))
    run(w,args,cancel)
    for f in kb.rglob('*'):
        if f.is_file():
            w.generated(str(f.relative_to(w.tree)))
    return assets


def apply_links(db, sid, rows, actor):
    for row in rows:
        link = db.execute('SELECT result FROM source_links WHERE id=? AND source_id=?',(row['ref'],sid)).fetchone()
        result = json.loads(link['result']) if link else {}
        if result.get('status') != 'changed' or result.get('current') != row['evidence']:
            raise EngineError('리소스 링크의 기준이 변경되었습니다. 다시 점검해 주세요.')
        current = row['evidence']
        accepted = {'status':'same','title':current.get('title'),'final':current.get('final'),'checked_at':result['checked_at']}
        db.execute('UPDATE source_links SET baseline=?, result=? WHERE id=?',
                   (dump({**current,'at':now(),'by':actor}),dump(accepted),row['ref']))


def publish_selection(origins, sid, choices, actor, jid, progress, cancel):
    store, root = origins.store, origins.root
    home = store.home / 'source-reviews'
    with publication_lock(home):
        recover(root,home,store)
        with store.db() as db:
            rows = origins.reviews.selected(db,sid,choices)
        accepted = [row for row in rows if choices[row['id']] == 'apply']
        imports = [r for r in accepted if r['origin'] != 'links']
        progress('선택한 변경의 원본 확인',8)
        workspace = SourceWorkspace(root,home / jid) if imports else None
        try:
            assets = build_projections(workspace,imports,actor,jid,progress,cancel) if imports else []
            progress('선택 사항 반영',90)
            with store.db(immediate=True) as db:
                if cancel():
                    raise Cancelled()
                origins.reviews.complete(db,choices,sid,actor,jid)
                apply_links(db,sid,[r for r in accepted if r['origin'] == 'links'],actor)
                store.upsert_assets(assets,connection=db)
                if workspace:
                    workspace.publish()
                db.execute('UPDATE sources SET refreshed_at=? WHERE id=?',(now(),sid))
        finally:
            if workspace:
                recover(root,home,store)
                shutil.rmtree(workspace.dir,ignore_errors=True)
    return {'applied': len(accepted), 'ignored': len(rows)-len(accepted)}
