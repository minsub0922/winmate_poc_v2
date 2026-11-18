"""Import the reviewed version of one official source entity into a private staging tree."""
import hashlib
import html
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urlencode, urljoin, urlsplit

from proddb.build.dss.pagetext import hashes, main_of, text_of

from .engine import Cancelled, EngineError, fetch, html_text
from .store import dump

SITE = 'https://www.samsung.com/sec/business/'
CATALOG = 'app/data/catalog.json'
PRODUCTS = 'app/data/products_db.json'
RAW = 'proddb/raw/'
BOOKS = 'proddb/ecat/catalogs.json'


def asset(sid, kind, key, title, value, url, path, at):
    return {'id': f'{kind}:{key}', 'source_id': sid, 'kind': kind, 'external_id': str(key),
            'title': title or str(key), 'payload': value, 'content': dump(value), 'url': url,
            'path': path, 'imported_at': at}


def site_raw(w, rows):
    products = w.read(RAW + 'wkb_products.json')
    variants = products['variants']
    specs, features = (w.read(RAW + name) for name in ('wkb_specs.json', 'wkb_features.json'))
    listing = RAW + 'site_lists.txt'
    for row in rows:
        gid, item, data = row['ref'], row['item'], row['evidence']
        status = item['status']
        if status == 'new-category':
            w.watch(listing)
            path = w.tree / listing
            lines = path.read_text().splitlines()
            entry = '/sec/business/' + item['cat'].strip('/') + '/'
            if entry.strip('/') not in {v.strip('/') for v in lines}:
                w.put(listing, '\n'.join([*lines, entry]) + '\n', raw=True)
            continue
        target = data.get('gid', gid)
        if data.get('incomplete'):
            raise EngineError('선택한 제품의 원문 수집이 불완전합니다. 다시 점검해 주세요.')
        if status != 'removed' and not data.get('product'):
            raise EngineError('이 제품의 수집 원문이 없습니다. 해당 소스를 다시 점검해 주세요.')
        if status in ('removed', 'moved'):
            products['products'].pop(gid, None)
            products['cardOrder'] = [g for g in products['cardOrder'] if g != gid]
        for vid in [vid for vid, v in variants.items() if v.get('parentGoodsId') == gid]:
            variants.pop(vid)
            specs.pop(vid, None)
            features.pop(vid,None)
        for records in (specs, features):
            records.pop(gid, None)
        if status not in ('removed','moved'):
            products['products'][target] = data['product']
            if target not in products['cardOrder']:
                products['cardOrder'].append(target)
            variants.update(data['variants'])
            specs.update(data['specs'])
            features.update(data['features'])
            cat = data.get('category')
            if cat and not any(c['no'] == cat['no'] for c in products['cats']):
                products['cats'].append(cat)
    if any(r['item']['status'] != 'new-category' for r in rows):
        for filename, value in [('wkb_products.json',products), ('wkb_specs.json',specs), ('wkb_features.json',features)]:
            w.put(RAW + filename, value)


def book(w, row, cancel):
    key, item, evidence = row['ref'], row['item'], row['evidence']
    if not re.fullmatch(r'(?:[\w-]+:)?\d+', key):
        raise EngineError('카탈로그 권 번호가 올바르지 않습니다.')
    docs = w.read(BOOKS)
    old = next((d for d in docs if str(d[2]) == key), None)
    rel = f'proddb/ecat/text/{key}.json'
    doc = w.read(rel, {})
    url = item['url']
    if item['status'] == 'gone':
        docs = [d for d in docs if str(d[2]) != key]
        if doc:
            doc['sourceListed'] = False
    else:
        # The viewer returns a spread of page text, including legitimately image-only pages.
        def page(n):
            publisher = urlsplit(url).path.strip('/').split('/')[0]
            base = urljoin(url, '/' + publisher + '/access/ecatalogt.php')
            response = fetch(base + '?' + urlencode({'Dir': key.split(':')[-1], 'acmode':'disable','eclang':'ko','um':'t','start':n}), cancel=cancel)
            return response['body'].decode('utf-8','replace')
        first = page(1)
        count = re.search(r'\bcataPages\s*=\s*["\']?(\d+)', first)
        n = int(count[1]) if count else 0
        if not 1 <= n <= 1200 or evidence.get('pages') and n != evidence['pages']:
            raise EngineError('점검한 권의 쪽 수가 달라졌습니다. 다시 점검해 주세요.')
        title = re.search(r'<title[^>]*>(.*?)</title>', first, re.I | re.S)
        doc_title = html_text(title[1]) if title else item['title']
        if evidence.get('docTitle') and doc_title != evidence['docTitle']:
            raise EngineError('점검한 카탈로그의 제목이 달라졌습니다. 다시 점검해 주세요.')
        pages = {}
        for pg in range(1,n+1):
            if cancel():
                raise Cancelled()
            if str(pg) in pages:
                continue
            content = first if pg == 1 else page(pg)
            if not re.search(r'\bcataPages\s*=',content):
                raise EngineError(f'카탈로그 {pg}쪽을 읽지 못했습니다.')
            # The official viewer omits text for covers or image-only pages.
            for no, body in re.findall(r'(\d+)페이지 내용\s*:\s*(.*?)(?=\d+페이지 내용\s*:|</|$)', content, re.S):
                if 1 <= int(no) <= n:
                    pages[str(int(no))] = html_text(html.unescape(body)).strip()
        if any(old and int(pg) <= n and pg not in pages for pg,old in (doc.get('text') or {}).items()):
            raise EngineError('기존에 있던 페이지 원문을 확인하지 못했습니다. 다시 점검해 주세요.')
        if evidence.get('fileSignature'):
            from proddb.build.dss.watch import ecat_file, ecat_signature
            namespace = urlsplit(url).path.strip('/').split('/')[0]
            base = urljoin(url,'/'+namespace+'/')
            def marker(pg):
                if cancel():
                    raise Cancelled()
                return ecat_file(key.split(':')[-1],pg,base)
            with ThreadPoolExecutor(6) as pool:
                signature = ecat_signature(list(pool.map(marker,range(1,n+1))))
            if signature != evidence['fileSignature']:
                raise EngineError('카탈로그 쪽 파일이 점검 후 달라졌습니다. 다시 점검해 주세요.')
        tab = evidence.get('tab') or (old or ['link'])[0]
        group = evidence.get('group') or (old[1] if old else '')
        entry = [tab, group, key, item['title']]
        if old is None:
            docs.append(entry)
        else:
            docs[docs.index(old)] = entry
        doc = {**doc, 'dir':key, 'title':item['title'], 'docTitle':doc_title, 'url':url,
               'group':group, 'tab':tab, 'pages':n, 'text':pages,
               'missing':[i for i in range(1,n+1) if not pages.get(str(i))],
               'fetchedAt':datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S%z')}
        if not evidence.get('listed', True):
            config_path = 'proddb/dss/watch-config.json'
            config = w.read(config_path,{})
            config.setdefault('ecat',{}).setdefault('keepUnlisted',{})[key] = item['title']
            w.put(config_path,config)
    w.put(BOOKS, docs)
    if doc:
        w.put(rel, doc)
    payload = {**(doc or item),'dir':key.split(':')[-1],'viewer_url':url}
    return asset('catalogs','catalog',key,item['title'],payload,url,rel,row['seen_at'])


def case(w, row):
    catalog = w.read(CATALOG)
    item = row['item']
    case_id = int(row['ref'])
    record = next((c for c in catalog['cases'] if str(c['id']) == str(case_id)), None)
    if record is None:
        record = {'id':case_id,'cust':'','ind':'','space':[],'prod':[],'sol':[]}
        catalog['cases'].append(record)
    record.update({k:item[k] for k in ('title','url','date') if item.get(k)})
    record.update(sourceListed=item['status'] != 'gone', checkedAt=row['seen_at'])
    w.put(CATALOG, catalog)
    return asset('media','case',case_id,record['title'],record,record.get('url'),CATALOG,row['seen_at'])


def solution(w, row, cancel):
    url, item, data = row['ref'], row['item'], dict(row['evidence'])
    if item['status'] != 'broken' and not data.get('text'):
        response = fetch(url, cancel=cancel, headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36','Accept-Language':'ko-KR,ko;q=0.9'})
        content = response['body'].decode('utf-8','replace')
        sha = hashes(content)[1]
        if data.get('mainSha256') and '본문이 바뀜' in item.get('why',[]) and data['mainSha256'] != sha:
            raise EngineError('선택한 솔루션 본문이 점검 후 바뀌었습니다. 다시 점검해 주세요.')
        title = re.search(r'<title[^>]*>(.*?)</title>',content,re.I | re.S)
        title = html_text(title[1]) if title else item.get('title') or url
        if data.get('title') and title.strip() != html_text(data['title']).strip():
            raise EngineError('솔루션 제목이 점검 이후 바뀌었습니다. 다시 점검해 주세요.')
        data.update(title=title, final=response['url'], status=200, mainSha256=sha, text=text_of(main_of(content)))
    if not data.get('status'):
        raise EngineError('솔루션의 원본 상태를 확인할 수 없습니다. 다시 점검해 주세요.')
    state_path = 'proddb/dss/watch-state.json'
    state = w.read(state_path,{})
    state.setdefault('solutions',{})[url] = {'status':data['status'],'final':data.get('final') or url,
        'title':data.get('title'),'hash':data.get('mainSha256') or None}
    if item['status'] == 'new-page':
        path = urlsplit(url).path.removeprefix('/sec/business/').strip('/')
        if path not in state.setdefault('menu',[]):
            state['menu'].append(path)
    w.put(state_path,state)
    # Keep reviewed source text addressable in the public catalog for existing DSS references and new menu pages.
    catalog = w.read(CATALOG)
    record = {**data,'url':url,'checkedAt':row['seen_at'],'refs':item.get('refs') or data.get('refs') or []}
    catalog.setdefault('sourcePages',{})[url] = record
    assets = []
    final = data.get('final') or url
    ids = {r.split(':',1)[1].split('|')[0] for r in record['refs'] if r.startswith('sol_urls:')}
    for sol in catalog.get('solutions',[]):
        if sol['id'] in ids or sol.get('url') == url:
            sol.setdefault('sourceUrls',[])
            if url not in sol['sourceUrls']:
                sol['sourceUrls'].append(url)
            sol['checkedAt'] = row['seen_at']
            assets.append(asset('media','solution',sol['id'],sol['name'],sol,final,CATALOG,row['seen_at']))
    w.put(CATALOG,catalog)
    refs = record['refs']
    # Preserve all the other pages for the same taxonomy group or solution.
    for rel, section, prefix in [('app/data/vertical_space_solution.json','solution_catalog','vss'),
                                 ('app/data/vertical_space_product.json','product_taxonomy','tax')]:
        if not any(r.startswith(prefix) for r in refs):
            continue
        registry = w.read(rel)
        for group in registry[section]:
            for entry in [group, *group.get('categories',[])]:
                if any(r in refs for r in [prefix+':'+entry['id'],prefix+'-url:'+entry['id'],prefix+'-group:'+entry['id']]):
                    entry.setdefault('sourceChecks',{})[url] = {'title':data.get('title'),'final':final,'status':data['status'],'checkedAt':row['seen_at']}
        w.put(rel,registry)
    key = hashlib.sha256(url.encode()).hexdigest()[:24]
    assets.append(asset('media','document',key,data.get('title') or item.get('title'),record,url,CATALOG,row['seen_at']))
    return assets
