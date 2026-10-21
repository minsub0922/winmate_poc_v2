"""Read-only, reference-driven resource browser. No caller supplied filesystem paths."""
from __future__ import annotations

import base64
from collections import Counter, OrderedDict
from functools import lru_cache
import gzip
import hashlib
from html import escape
from html.parser import HTMLParser
from io import BytesIO
import json
import mimetypes
from pathlib import Path
import re
import sqlite3
import threading
from urllib.parse import quote, unquote, unquote_to_bytes, urlsplit
import zipfile

from .config import ROOT

IMAGE = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg', '.bmp', '.tif', '.tiff'}
VIDEO = {'.mp4', '.webm', '.mov', '.m4v'}
DOCUMENT = {'.pdf', '.pptx', '.docx', '.xlsx', '.txt', '.md', '.csv'}
MODEL = {'.glb', '.gltf', '.obj', '.mtl', '.stl', '.fbx'}
PACKED = re.compile(r'^(.*\.json)#(\d+)$')
PATHLIKE = re.compile(r'\.(?:json|gz|png|jpe?g|webp|avif|gif|svg|pdf|pptx|docx|xlsx|mp4|webm|glb|gltf|obj|stl|fbx|woff2?|ttf|css|html?|txt|md|csv)(?:#\d+)?(?:\?[^\s]*)?$', re.I)
RASTER_MIMES = {'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/tiff'}
GROUPS = {'primary': '대표 이미지', 'gallery': '관련 이미지', 'detail': '특장점 · 원본 이미지',
          'catalog': '카탈로그', 'layout': '레이아웃 · 배경', 'spatial': '공간 · 3D',
          'embedded': '문서 내 리소스', 'file': '원본 · 데이터', 'source': '출처 링크'}


def signature(path):
    try:
        s = path.stat()
        return str(path), s.st_mtime_ns, s.st_size
    except OSError:
        return str(path), 0, 0


@lru_cache(maxsize=18)
def _json(path, modified, size):
    try:
        raw = Path(path).read_bytes()
        return json.loads(gzip.decompress(raw) if path.endswith('.gz') else raw)
    except (OSError, ValueError, EOFError):
        return {}


def read_json(path):
    return _json(*signature(Path(path)))


@lru_cache(maxsize=3)
def _pack(path, modified, size):
    try:
        value = json.loads(Path(path).read_bytes())
        return value.get('images', []) if isinstance(value, dict) and isinstance(value.get('images'), list) else []
    except (OSError, ValueError):
        return []


def pack(path):
    return _pack(*signature(path))


@lru_cache(maxsize=48)
def pack_info(path, modified, size):
    return tuple(isinstance(v,str) and v.startswith('data:image/') for v in _pack(path,modified,size))


def https(url):
    if not isinstance(url, str) or len(url) > 4000 or any(c.isspace() or ord(c) < 32 for c in url):
        return ''
    try:
        p = urlsplit(url)
        return url if p.scheme == 'https' and p.hostname and not p.username and not p.password else ''
    except ValueError:
        return ''


def kind_of(address):
    ext = Path(urlsplit(address).path).suffix.lower()
    return 'image' if ext in IMAGE or PACKED.match(address) or address.startswith('data:image/') else 'video' if ext in VIDEO else 'model' if ext in MODEL else 'document' if ext in DOCUMENT else 'data' if ext in {'.json', '.gz', '.csv', '.js', '.jsx', '.py'} else 'link' if https(address) else 'file'


class ResourceLibrary:
    def __init__(self, store, root=ROOT):
        self.store, self.root = store, Path(root).resolve()
        self.checked_files = set()
        # Runtime users, auth, logs, arbitrary databases and dotfiles are never resources.
        self.roots = [self.root / p for p in ['img', 'app/data/static/img', 'app/data/static/lib',
            'app/data/backgrounds', 'app/data/spatial', 'app/web/public/assets', 'app/web/public/fonts',
            'proddb/imglib', 'proddb/ecat', 'proddb/raw', 'app/web/src/domain/templates',
            'app/web/src/domain/simulation', 'app/web/src/domain/review', 'app/web/src/domain/proposals',
            'app/web/src/domain/spatial', 'app/data/product-details']]
        self.exact = {self.root / p for p in ['app/data/catalog.json', 'app/data/products_db.json',
            'app/data/images.json', 'app/data/media.json', 'app/data/runtime/kb/catalog.json',
            'app/data/runtime/kb/best_scenarios.json', 'app/data/runtime/kb/score/schema.json',
            'app/data/runtime/kb/score/criteria.json']}

    def allowed(self, path, upload=False):
        path = Path(path)
        if path.suffix.lower() in {'.sqlite', '.sqlite3', '.db', '.pem', '.key', '.log', '.pyc'}:
            return None
        resolved = path.resolve()
        roots = [(self.store.home / 'uploads').resolve()] if upload else [p.resolve() for p in self.roots]
        for parent in roots:
            if resolved.is_relative_to(parent) and not any(p.startswith('.') for p in resolved.relative_to(parent).parts): return resolved
        if not upload and resolved in {p.resolve() for p in self.exact}: return resolved
        return None

    def local(self, address):
        """Mirror app mount precedence; filesystem paths require explicit repo prefixes."""
        address = unquote(str(address)).split('#', 1)[0].split('?',1)[0]
        if '\\' in address or '..' in Path(address).parts:
            return None
        if address.startswith('/img/lib/') or address.startswith('img/lib/'):
            path = self.root / address.lstrip('/')
        elif address.startswith('/img/backgrounds/') or address.startswith('img/backgrounds/'):
            path = self.root / 'app/data/backgrounds' / address.split('img/backgrounds/', 1)[1]
        elif address.startswith('/img/') or address.startswith('img/'):
            path = self.root / 'app/data/static' / address.lstrip('/')
            checked=self.allowed(path)
            if checked: self.checked_files.add(checked)
            if not path.is_file():
                path = self.root / address.lstrip('/')
        elif address.startswith('/assets/'):
            path = self.root / 'app/web/public' / address.lstrip('/')
        elif address.startswith('/fonts/'):
            path = self.root / 'app/web/public' / address.lstrip('/')
        elif address.startswith('/lib/') or address.startswith('lib/'):
            path = self.root / 'app/data/static' / address.lstrip('/')
        else:
            path = self.root / address
        checked=self.allowed(path)
        if checked: self.checked_files.add(checked)
        return checked

    def manifest(self, asset):
        return Manifest(self, asset).build()


class Manifest:
    def __init__(self, library, asset):
        self.lib, self.root, self.asset = library, library.root, asset
        self.items = OrderedDict()
        self.locations = {}
        self.visited = set()
        self.warnings = []
        self.images = read_json(self.root / 'app/data/images.json').get('pids', {})
        self.compact = read_json(self.root / 'img/lib/index.json').get('images', [])
        self.full = read_json(self.root / 'proddb/imglib/index.json').get('images', [])

    def add(self, address, label='', group='file', *, kind=None, origin='', width=None, height=None,
            file=None, source='', page='', data=None, primary=False, **private):
        if not isinstance(address, str) or not address:
            return None
        if address.startswith('http') and not https(address):
            return None
        if address.startswith('data:') and not address.startswith('data:image/'):
            return None
        local = file if file is not None else None if https(address) or data is not None else self.lib.local(address)
        slot=int(PACKED.match(address)[2]) if PACKED.match(address) else private.get('_slot')
        location=(str(local),slot,private.get('_member'),private.get('_pdf_page'),private.get('_pdf_image'),private.get('_pdf_attachment')) if local else None
        rid = self.locations.get(location) if location else None
        rid = rid or hashlib.sha256(address.encode()).hexdigest()[:24]
        if rid in self.items:
            item = self.items[rid]
            if address not in item['_addresses']: item['_addresses'].append(address)
            for key, value in [('groups', group), ('origins', origin)]:
                if value and value not in item[key]: item[key].append(value)
            if primary: item['primary'] = True
            return item
        item = {'id': rid, 'address': address if not address.startswith('data:') else '[문서 내 이미지]',
                'label': label or Path(address.split('#')[0]).name, 'kind': kind or kind_of(address),
                'groups': [group], 'origins': [origin] if origin else [], 'primary': primary,
                'width': width, 'height': height, 'source_url': https(source), 'page_url': https(page),
                '_file': local, '_data': data, '_addresses':[address], **private}
        if data is None and address.startswith('data:'): item['_data'] = address
        item['available'] = bool(https(address) or local and local.is_file() or item['_data'] is not None or private.get('_layout') is not None)
        item['availability'] = 'external' if https(address) else 'local' if item['available'] else 'missing'
        if local and local.is_file(): item['bytes'] = local.stat().st_size
        if PACKED.match(address):
            item['_slot'] = int(PACKED.match(address)[2])
        if '_slot' in item and local and local.is_file():
            info=pack_info(*signature(local));slot=item['_slot']
            item['available']=0 <= slot < len(info) and info[slot]
            item['availability']='local' if item['available'] else 'missing'
            item.pop('bytes',None)  # A pack's byte count is not an individual image's size.
        if '_member_bytes' in item: item['bytes']=item['_member_bytes']
        if any(k in item for k in ('_pdf_page','_pdf_image','_pdf_attachment')): item.pop('bytes',None)
        self.items[rid] = item
        if location: self.locations[location]=rid
        return item

    def pid(self, pid, group='gallery', primary=False, label=''):
        if not isinstance(pid, str): return
        im = self.images.get(pid)
        if im:
            self.add(im.get('file'), label or im.get('desc', pid), group, origin='앱 이미지 · '+pid,
                     width=im.get('w'), height=im.get('h'), primary=primary)
        elif PATHLIKE.search(pid) or https(pid) or pid.startswith('data:image/'):
            self.add(pid, label, group, primary=primary)

    def image_record(self, ident, group='gallery', primary=False):
        compact = next((x for x in self.compact if x.get('i') == ident), None)
        full = next((x for x in self.full if x.get('id') == ident), None)
        if compact:
            self.add(compact.get('a'), compact.get('d') or compact.get('t'), group,
                     origin=compact.get('c') or '이미지 라이브러리', width=compact.get('w'), height=compact.get('h'),
                     source=compact.get('u'), primary=primary)
        if full:
            self.pid(full.get('app_pid'), group, primary=primary)
            if full.get('file'):
                self.add('proddb/imglib/'+full['file'], full.get('desc') or full.get('title'), 'detail',
                         origin='보관된 원본 이미지', width=full.get('w'), height=full.get('h'), primary=primary and not compact)
            if full.get('url'):
                self.add(full['url'], '원본 · '+(full.get('desc') or full.get('title') or ident), 'detail', kind='image',
                         origin=full.get('ctx') or '이미지 원본', primary=primary and not compact and not full.get('file'))
            if re.fullmatch(r'\d+_\d+', str(full.get('page') or '')):
                directory, page = full['page'].split('_'); self.catalog_page(directory, int(page), origin=full.get('ctx', ''))

    def walk(self, value, group='file', origin='연결된 데이터', key=''):
        if isinstance(value, dict):
            for k, v in value.items():
                if k not in {'admin_notes', 'admin_tags', 'analysis', 'content', 'spec', 'text','file_ref','filename','parent_asset_id'}:
                    self.walk(v, group, origin, k)
        elif isinstance(value, list):
            for v in value: self.walk(v, group, origin, key)
        elif isinstance(value, str):
            if key in {'pid', 'img'} and value in self.images: self.pid(value, group)
            elif value.startswith('data:image/') or https(value) or len(value) < 2000 and PATHLIKE.search(value) and not re.search(r'[\s<>]', value):
                self.add(value, group=group, origin=origin)

    def catalog_page(self, directory, number, origin='', namespace='b2b'):
        if not str(directory).isdigit() or not str(number).isdigit() or int(number) < 1 or namespace not in {'b2b','b2c'}: return
        url = f'https://samsung.aiibook.net/{namespace}/catImage/{directory}/{int(number):03}.jpg'
        viewer = f'https://samsung.aiibook.net/{namespace}/ecatalog5.php?Dir={directory}&start={int(number)}'
        self.add(url, f'카탈로그 {directory} · {int(number)}쪽', 'catalog', kind='image', origin=origin or '공식 카탈로그 쪽 주소', page=viewer)

    def product(self, identifier, payload=None, group='gallery'):
        key = 'product:'+identifier
        if key in self.visited: return
        self.visited.add(key)
        if payload is None:
            row = self.lib.store.one('SELECT payload FROM assets WHERE id=?', (key,))
            payload = json.loads(row['payload']) if row else {}
        p = payload
        self.pid(p.get('img'), group, primary=group == 'gallery')
        self.add(p.get('th'), '제품 대표 썸네일', 'primary' if group == 'gallery' else group, primary=group == 'gallery')
        for n, address in enumerate(p.get('gal') or []):
            alts, sources = p.get('galAlt') or [], p.get('galSrc') or []
            self.add(address, alts[n] if n < len(alts) else f'{p.get("name",identifier)} · 이미지 {n+1}', group,
                     origin=sources[n] if n < len(sources) else '제품 갤러리')
        for im in self.compact:
            if identifier in (im.get('p') or []): self.image_record(im['i'], group)
        for im in self.full:
            if identifier in (im.get('products') or []) and not any(x.get('i') == im['id'] for x in self.compact):
                self.image_record(im['id'], group)
        detail = {}
        database = self.root / 'app/data/runtime/winmate_products.sqlite'
        if database.is_file():
            try:
                with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as db:
                    row = db.execute('SELECT payload FROM wm_ui_detail WHERE id=?', (identifier,)).fetchone()
                    if row: detail = json.loads(row[0])
            except (sqlite3.Error, ValueError): pass
        if not detail and isinstance(p.get('d'), int):
            fallback=self.lib.local(f'app/data/static/img/prod/d{p["d"]:02}.json')
            detail = read_json(fallback).get('items', {}).get(identifier, {}) if fallback else {}
        self.walk(detail, 'detail', '제품 상세 데이터')
        for c in detail.get('ecat') or []:
            self.catalog_page(c.get('dir'), c.get('p'), origin=c.get('t', ''))
        if p.get('cdir') and p.get('cpage'): self.catalog_page(p['cdir'], p['cpage'])
        photo = read_json(self.root / 'proddb/ecat/photos.json').get('items', {}).get(identifier, {})
        for pic in photo.get('pics', []):
            self.add('proddb/ecat/photos/'+pic['file'], pic.get('note', ''), 'detail', origin='카탈로그 추출 원본')
            self.catalog_page(pic.get('dir'), pic.get('p'))
            self.walk(pic.get('pdf', {}), 'catalog', '원본 카탈로그 PDF')
        self.walk(p, group, '제품 데이터')

    def media(self, kind, identifier):
        media = read_json(self.root / 'app/data/media.json')
        m = media.get('sol' if kind == 'solution' else 'case', {}).get(str(identifier))
        if not m: return
        def address(code):
            i, slot = divmod(code, 10000)
            return media['P'][i]+f'#{slot}' if 0 <= i < len(media.get('P', [])) else ''
        if isinstance(m.get('th'), int): self.add(address(m['th']), '대표 썸네일', 'primary', primary=True)
        pages = m.get('pages') or [self.asset.get('url') or '']
        for im in m.get('g', []):
            code, _, desc, w, h, original, page_no, *_ = [*im, '', 0][:8]
            page = pages[page_no or 0] if isinstance(page_no, int) and 0 <= (page_no or 0) < len(pages) else ''
            if original.startswith('^') and '|' in original:
                head, tail = original[1:].split('|', 1)
                try: original = media['D'][int(head, 36)]+tail
                except (ValueError, IndexError): original = ''
            if original.startswith('~/'): original = 'https://images.samsung.com/'+original[2:]
            self.add(address(code), desc, 'gallery', width=w, height=h, source=original, page=page, origin='솔루션 · 도입사례 이미지')
            if https(original): self.add(original, '원본 · '+desc, 'detail', kind='image', page=page)
        for page in pages: self.add(page, '관련 원문', 'source')

    def layout(self, identifier):
        if 'layout:'+identifier in self.visited: return
        self.visited.add('layout:'+identifier)
        html = read_json(self.root / 'app/data/runtime/kb/layout_html.json.gz').get(identifier)
        if html:
            self.add('layout:'+identifier, identifier+' · 장표 미리보기', 'layout', kind='layout', _layout=html, primary=self.asset['kind']=='layout')
            parser = LayoutImages(self)
            parser.feed(html)
            for address in re.findall(r'url\([\s\'"]*([^\)\'"\s]+)', html): self.pid(address, 'layout')

    def document(self, file):
        if not file or not file.is_file(): return
        ref=str(file.relative_to(self.lib.store.home)) if file.is_relative_to(self.lib.store.home) else str(file.relative_to(self.root))
        try:
            if file.suffix.lower() in {'.pptx', '.docx', '.xlsx'}:
                with zipfile.ZipFile(file) as archive:
                    for entry in archive.infolist():
                        if entry.is_dir() or not any(x in entry.filename for x in ['/media/', '/embeddings/']): continue
                        self.add('zip:'+ref+'#'+entry.filename, Path(entry.filename).name, 'embedded',
                                 kind=kind_of(entry.filename), file=file, origin=entry.filename, _member=entry.filename,
                                 _member_bytes=entry.file_size)
            elif file.suffix.lower() == '.pdf':
                import pymupdf
                with pymupdf.open(file) as document:
                    seen = set()
                    for n, page in enumerate(document):
                        self.add('pdf:'+ref+f'#page:{n}', f'문서 · {n+1}쪽', 'embedded', kind='image', file=file, _pdf_page=n)
                        for image in page.get_images():
                            xref = image[0]
                            if xref in seen: continue
                            seen.add(xref)
                            self.add('pdf:'+ref+f'#image:{xref}', f'삽입 이미지 · {n+1}쪽 · {xref}', 'embedded',
                                     kind='image', file=file, _pdf_image=xref, width=image[2], height=image[3])
                    for name in document.embfile_names():
                        self.add('pdf:'+ref+'#attachment:'+name, name, 'embedded', kind=kind_of(name), file=file, _pdf_attachment=name)
        except (OSError, ValueError, RuntimeError, zipfile.BadZipFile, ImportError) as exc:
            self.warnings.append('문서 내 리소스를 확인하지 못했습니다: '+type(exc).__name__)

    def build(self):
        a, p = self.asset, self.asset.get('payload') or {}
        if isinstance(p, str): p = json.loads(p)
        kind, identifier = a['kind'], str(a.get('external_id') or a['id'].split(':',1)[-1])
        if kind == 'product': self.product(identifier, p)
        if kind == 'image':
            if identifier.startswith('app/'): self.pid(identifier[4:], 'primary', primary=True)
            else: self.image_record(identifier, 'primary', primary=True)
        if kind in {'solution', 'case'}:
            self.media(kind, identifier); self.pid(p.get('img'), 'gallery')
        if kind == 'catalog':
            namespace = 'b2c' if '/b2c/' in (p.get('viewer_url') or a.get('url') or '') else 'b2b'
            for page in range(1, int(p.get('pages') or 0)+1): self.catalog_page(p.get('dir', identifier), page, namespace=namespace)
            for row in self.full:
                if str(row.get('page') or '').startswith(str(p.get('dir',identifier))+'_'): self.image_record(row['id'])
            for entry in read_json(self.root / 'proddb/ecat/photos.json').get('items',{}).values():
                for pic in entry.get('pics',[]):
                    if str(pic.get('dir'))==str(p.get('dir',identifier)):
                        self.walk(pic.get('pdf',{}),'catalog','원본 카탈로그 PDF')
        if kind == 'layout': self.layout(p.get('f') or identifier)
        if kind == 'scenario':
            def layouts(v):
                if isinstance(v,dict):
                    if v.get('f'): self.layout(v['f'])
                    for x in v.values(): layouts(x)
                elif isinstance(v,list):
                    for x in v: layouts(x)
            layouts(p)
            bg = read_json(self.root / 'app/web/src/domain/templates/scenario_bg.json').get(identifier, {})
            file = self.lib.local(bg.get('pack','')) if bg.get('pack') else None
            if file and file.is_file():
                for n in range(len(pack(file))): self.add(bg['pack']+f'#{n}', f'시나리오 배경 {n+1}', 'layout')
        if kind == 'spatial':
            self.add(p.get('thumbnail'), '공간 에셋 미리보기', 'spatial', primary=True)
            self.walk(p.get('imageEvidence',{}), 'gallery', '공간 형상 · 제품 이미지 근거')
            product_ids = set()
            def refs(v):
                if isinstance(v, dict):
                    product_ids.update(x for x in v.get('productIds', []) if isinstance(x,str))
                    if isinstance(v.get('productId'),str): product_ids.add(v['productId'])
                    if v.get('layoutId'): self.layout(v['layoutId'])
                    for x in v.values(): refs(x)
                elif isinstance(v,list):
                    for x in v: refs(x)
            refs(p)
            for pid in sorted(product_ids): self.product(pid, group='spatial')
        self.walk({k:v for k,v in p.items() if not (kind=='image' and k=='file')}, 'gallery' if kind=='image' else 'file')
        self.add(a.get('url'), '원본 출처', 'source')
        file = None;original_address=''
        if p.get('file_ref'):
            file = self.lib.allowed(self.lib.store.home / p['file_ref'], upload=True)
            original_address='upload:'+str(p['file_ref'])
            self.add(original_address, p.get('filename',a['title']), 'primary' if kind=='image' else 'file',
                     file=file, kind=kind_of(p.get('filename','')), primary=kind=='image')
        elif a.get('path'):
            # Asset paths are repository paths, unlike public /img/ references.
            file = self.lib.allowed(self.root / a['path'])
            original_address='repo:'+a['path']
            if file is not None: self.add(original_address, Path(a['path']).name, 'file', file=file, kind=kind_of(a['path']))
        if kind in {'file','pack','document'} and file and file.suffix=='.json' and file.is_file():
            images = pack(file)
            for n in range(len(images)):
                self.add(original_address+f'#{n}', f'이미지 {n+1} · 슬롯 {n}', 'gallery', file=file, kind='image', _slot=n)
            if not images: self.walk(read_json(file), 'file', '파일 내 리소스 참조')
        if kind in {'file','document'}: self.document(file)
        if kind == 'image' and not any(x['kind']=='image' for x in self.items.values()) and p.get('url'):
            self.add(p['url'], a['title'], 'primary', kind='image', primary=True)
        if p.get('parent_asset_id'):
            parent = self.lib.store.one('SELECT * FROM assets WHERE id=?', (p['parent_asset_id'],))
            if parent:
                parent['payload']=json.loads(parent['payload'])
                pp=parent['payload']
                if pp.get('file_ref'):
                    file=self.lib.allowed(self.lib.store.home/pp['file_ref'],upload=True)
                    self.add('upload:'+pp['file_ref'], pp.get('filename',parent['title']), 'file', file=file, kind=kind_of(pp.get('filename','')))
                    self.document(file)
        raw=json.dumps(p,ensure_ascii=False,indent=2).encode()
        self.add('payload:'+a['id'], '에셋 데이터.json', 'file', kind='data', data=raw, _raw=True)
        return self

    def public(self, item):
        data = {k:v for k,v in item.items() if not k.startswith('_')}
        base = '/admin/api/asset-resources/'+item['id']+'?asset='+quote(self.asset['id'],safe='')
        external = https(item['address'])
        data['url'] = external or base
        data['download_url'] = external or base+'&download=1'
        data['thumbnail_url'] = (external or base+'&thumb=1') if item['kind']=='image' else None
        data['preview_url'] = base+'&preview=1' if item['kind'] in {'layout','data'} and not external else None
        return data

    def page(self, group='', kind='', q='', offset=0, limit=24):
        items = list(self.items.values())
        primary = next((i for i in items if i['primary'] and i['kind'] in {'image','layout'} and i['available']),None)
        if primary is None: primary=next((i for i in items if i['kind']=='image' and i['available']),None)
        groups=Counter(g for i in items for g in i['groups'])
        kinds=Counter(i['kind'] for i in items)
        selected=[i for i in items if (not group or group in i['groups']) and (not kind or kind==i['kind']) and
                  (not q or q.casefold() in ' '.join([i['label'],i['address'],*i['origins']]).casefold())]
        return {'asset_id':self.asset['id'],'items':[self.public(i) for i in selected[offset:offset+limit]],
                'total':len(selected),'all_total':len(items),'offset':offset,'limit':limit,
                'primary':self.public(primary) if primary else None,
                'groups':[{'id':g,'label':GROUPS.get(g,g),'count':n} for g,n in groups.items()],
                'kinds':dict(kinds),'missing':sum(not i['available'] for i in items),'warnings':self.warnings}


class LayoutImages(HTMLParser):
    def __init__(self, manifest): super().__init__(); self.manifest=manifest
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='img':
            address=attrs.get('data-fill') or attrs.get('data-pid') or attrs.get('src')
            if address and not address.startswith('data:image/gif;base64,R0lGODlhAQABA'):
                self.manifest.pid(address,'layout',label=attrs.get('alt',''))


def layout_preview(html, manifest):
    """Scripts, forms, navigation and subframes are blocked by a sandbox and CSP."""
    def source(address):
        address=manifest.images.get(address,{}).get('file') or address
        item=next((i for i in manifest.items.values() if address in i['_addresses']),None)
        return manifest.public(item)['url'] if item else ''
    def css(text):
        def replace(match):
            url=source(match[1])
            return 'url('+json.dumps(url)+')' if url else 'none'
        return re.sub(r'url\([\s\'"]*([^\)\'"\s]+)[\s\'"]*\)',replace,text)
    class Rewrite(HTMLParser):
        def __init__(self): super().__init__(convert_charrefs=False); self.out=[];self.blocked=None;self.in_style=False
        def handle_starttag(self,tag,attrs):
            if self.blocked: return
            if tag in {'script','iframe','object','embed','form'}: self.blocked=tag;return
            if tag in {'base','meta','link'}: return
            attrs=dict(attrs)
            if tag=='img':
                address=attrs.get('data-fill') or attrs.get('data-pid') or attrs.get('src','')
                attrs.pop('src',None)
                url=source(address)
                if url: attrs['src']=url
            if 'style' in attrs: attrs['style']=css(attrs['style'] or '')
            if tag=='style': self.in_style=True
            safe=[(k,v) for k,v in attrs.items() if not k.startswith('on') and k not in {'href','srcdoc','action','formaction','srcset','xlink:href'}]
            self.out.append('<'+tag+''.join(' '+k+'="'+escape(v or '',quote=True)+'"' for k,v in safe)+'>')
        def handle_endtag(self,tag):
            if self.blocked:
                if tag==self.blocked: self.blocked=None
                return
            if tag=='style': self.in_style=False
            if tag not in {'script','iframe','object','embed','base','meta','link','form'}: self.out.append('</'+tag+'>')
        def handle_data(self,data):
            if not self.blocked: self.out.append(css(data) if self.in_style else data)
        def handle_entityref(self,name):
            if not self.blocked: self.out.append('&'+name+';')
        def handle_charref(self,name):
            if not self.blocked: self.out.append('&#'+name+';')
    parser=Rewrite();parser.feed(html)
    csp="default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; script-src 'none'; connect-src 'none'"
    return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><style>html,body{margin:0;width:1280px;height:720px;overflow:hidden}*{box-sizing:border-box}</style></head><body>'+''.join(parser.out)+'</body></html>'


def resource_bytes(item, thumb=False, original=False):
    """Only an item reconstructed from the selected asset manifest can reach here."""
    file=item.get('_file')
    if item.get('_member'):
        if item.get('_member_bytes',0)>25*1024**2: raise ValueError('문서 내 파일이 미리보기 제한을 초과합니다.')
        with zipfile.ZipFile(file) as archive: raw=archive.read(item['_member'])
        mime=mimetypes.guess_type(item['_member'])[0] or 'application/octet-stream'
    elif any(k in item for k in ('_pdf_page','_pdf_image','_pdf_attachment')):
        import pymupdf
        with pymupdf.open(file) as doc:
            if '_pdf_page' in item:
                page=doc[item['_pdf_page']];target=340 if thumb else 1800
                raw=page.get_pixmap(matrix=pymupdf.Matrix(target/max(page.rect.width,page.rect.height),target/max(page.rect.width,page.rect.height)),alpha=False).tobytes('png');mime='image/png'
            elif '_pdf_image' in item:
                image=doc.extract_image(item['_pdf_image']);raw=image['image'];mime='image/'+image['ext']
                if not original and image['ext'] not in {'png','jpeg','jpg','webp','gif','avif'}:
                    pix=pymupdf.Pixmap(doc,item['_pdf_image'])
                    if pix.colorspace and pix.colorspace.n>3: pix=pymupdf.Pixmap(pymupdf.csRGB,pix)
                    raw=pix.tobytes('png');mime='image/png'
            else: raw=doc.embfile_get(item['_pdf_attachment']);mime=mimetypes.guess_type(item['label'])[0] or 'application/octet-stream'
    elif item.get('_raw'):
        raw=item['_data'];mime='application/json'
    elif item.get('_data') is not None or '_slot' in item:
        data=item.get('_data')
        if '_slot' in item:
            images=pack(file);slot=item['_slot']
            if slot >= len(images): raise FileNotFoundError('이미지 묶음의 해당 슬롯이 없습니다.')
            data=images[slot]
        header,separator,body=str(data).partition(',')
        fields=header[5:].split(';') if header.startswith('data:') else []
        mime=fields[0].lower() if fields else ''
        if not separator or mime not in RASTER_MIMES|{'image/svg+xml'}: raise ValueError('지원하지 않는 이미지 형식입니다.')
        raw=base64.b64decode(re.sub(r'\s+','',body),validate=True) if 'base64' in fields[1:] else unquote_to_bytes(body)
    else:
        if not file or not file.is_file(): raise FileNotFoundError('원본 파일이 없습니다.')
        raw=file.read_bytes();mime=mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
    if not original and (thumb and mime in RASTER_MIMES or mime in {'image/tiff','image/jpx','image/jbig2','image/pnm'}):
        from PIL import Image, ImageOps
        try:
            with Image.open(BytesIO(raw)) as image:
                image=ImageOps.exif_transpose(image)
                if image.mode=='P' and 'transparency' in image.info: image=image.convert('RGBA')
                if thumb: image.thumbnail((360,280))
                else: image.thumbnail((2400,2400))
                output=BytesIO();image.convert('RGBA' if 'A' in image.getbands() else 'RGB').save(output,format='WEBP',quality=85)
                raw=output.getvalue();mime='image/webp'
        except (OSError,ValueError,Image.DecompressionBombError) as exc:
            if mime not in {'image/png','image/jpeg','image/webp','image/gif','image/avif'}:
                raise ValueError('이미지를 미리보기 형식으로 변환하지 못했습니다.') from exc
    return raw,mime


_manifests=OrderedDict()
_manifest_lock=threading.RLock()


def resources_for(store, asset, root=ROOT):
    root=Path(root)
    deps=['app/data/images.json','img/lib/index.json','proddb/imglib/index.json','app/data/media.json',
          'app/data/runtime/kb/layout_html.json.gz','app/data/runtime/winmate_products.sqlite',
          'app/data/runtime/winmate_products.sqlite-wal',
          'app/data/products_db.json','proddb/ecat/photos.json','app/web/src/domain/templates/scenario_bg.json']
    key=(str(store.path),asset['id'],asset.get('hash') or hashlib.sha256(json.dumps(asset.get('payload',{}),sort_keys=True).encode()).hexdigest(),tuple(signature(root/p) for p in deps),
         signature(store.path),signature(Path(str(store.path)+'-wal')))
    with _manifest_lock:
        cached=_manifests.get(key)
    if cached:
        manifest,files=cached
        if all(signature(Path(p))==s for p,s in files.items()):
            with _manifest_lock:
                if key not in _manifests: _manifests[key]=cached
                _manifests.move_to_end(key);return manifest
    result=ResourceLibrary(store,root).manifest(asset)
    files={str(i['_file']):signature(i['_file']) for i in result.items.values() if i.get('_file')}
    files.update({str(p):signature(p) for p in result.lib.checked_files})
    with _manifest_lock:
        _manifests[key]=(result,files)
        while len(_manifests)>10: _manifests.popitem(last=False)
        return result
