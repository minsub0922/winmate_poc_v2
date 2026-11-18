"""데이터 소스 브라우저 — 소스 하나의 자원 전체를 썸네일 · 출처 · 앱 사용(on/off)과 함께 본다.

- 목록: 소스 안 자원을 종류 · 검색어 · 앱 사용 상태로 거르고, 자원마다 썸네일 하나와 대표 출처를 붙인다.
- 상세: 자원 한 개의 출처 전부(웹 페이지 · e-카탈로그 쪽 · PDF 쪽 · 저장 파일)와 앱 사용 이력.
- 앱 사용 on/off: app/api/resource_switches.py (앱 · 에이전트가 같은 파일을 읽는다).
- PDF: 허용한 원본(e-카탈로그 · samsung.com)만 Range 요청 그대로 중계해 pdf.js 가 필요한 쪽만 받는다.
"""
from __future__ import annotations

from collections import OrderedDict
import json
from pathlib import Path
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from app.api import resource_switches as switches

from .config import ROOT
from . import image_metadata, layout_images
from .resources import Manifest, ResourceLibrary, https, read_json, resource_bytes, signature

KIND_ORDER = ['product', 'image', 'solution', 'case', 'layout', 'scenario', 'catalog', 'category', 'industry', 'birdseye', 'building', 'spatial',
              'pack', 'configuration', 'document', 'reference', 'file']
SORTS = {'': 'a.rowid', 'title': 'a.title COLLATE NOCASE, a.rowid', 'recent': 'a.updated_at DESC, a.rowid'}
SPATIAL_KIND = """CASE WHEN a.kind='spatial' AND a.external_id LIKE 'buildings/%' THEN 'building'
    WHEN a.kind='spatial' AND (a.external_id LIKE 'templates/%' OR a.external_id LIKE 'cases/%') THEN 'birdseye' ELSE a.kind END"""
PDF_HOSTS = ('samsung.aiibook.net', 'www.samsung.com', 'images.samsung.com', 'image-us.samsung.com', 'samsung.com')
CATALOG_HOST = 'https://samsung.aiibook.net'
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.svg'}


def host_of(url):
    try:
        h = urlsplit(url).hostname or ''
    except ValueError:
        return ''
    return h[4:] if h.startswith('www.') else h


def catalog_ns(url):
    return 'b2c' if '/b2c/' in (url or '') else 'b2b'


def catalog_origin(directory, page=1, title='', ns='b2b', pdf=None, pages=None):
    if not str(directory or '').isdigit():
        return None
    page = int(page) if str(page or '').isdigit() and int(page) > 0 else 1
    out = {'type': 'catalog', 'label': title or f'e-카탈로그 {directory}', 'dir': str(directory), 'page': page, 'ns': ns,
           'href': f'{CATALOG_HOST}/{ns}/ecatalog5.php?Dir={directory}&start={page}',
           'image': f'{CATALOG_HOST}/{ns}/catImage/{directory}/{page:03}.jpg', 'host': 'samsung.aiibook.net'}
    if pages:
        out['pages'] = int(pages)
    if isinstance(pdf, dict) and https(pdf.get('url')):
        out['pdf'] = {'url': pdf['url'], 'index': pdf.get('index'), 'half': pdf.get('half')}
    return out


CATALOG_LINK = re.compile(r'^https://samsung\.aiibook\.net/(b2b|b2c)/(?:access/)?ecatalog\w*\.php\?', re.I)


def link_origin(url, label=''):
    """a web 출처 — an e-카탈로그 viewer address becomes that catalog's page (opens in the PDF viewer)."""
    url = https(url)
    if not url:
        return None
    match = CATALOG_LINK.match(url)
    if match:
        query = dict(re.findall(r'[?&](\w+)=([^&#]*)', url))
        directory, page = query.get('Dir', ''), query.get('start', '') or '1'
        if directory.isdigit():
            return catalog_origin(directory, int(page) if page.isdigit() else 1, label if label and label != host_of(url) else '', match.group(1).lower())
    return {'type': 'link', 'label': label or host_of(url), 'href': url, 'host': host_of(url)}


class Indexes:
    """Lookups the listing needs per row, rebuilt only when their files change."""

    def __init__(self, root):
        self.root = Path(root)
        self._lock = threading.Lock()
        self._cache = {}

    def _get(self, name, files, build):
        key = tuple(signature(self.root / f) for f in files)
        with self._lock:
            hit = self._cache.get(name)
            if hit and hit[0] == key:
                return hit[1]
        value = build(*[read_json(self.root / f) for f in files])
        with self._lock:
            self._cache[name] = (key, value)
        return value

    def images(self):
        return self._get('images', ['app/data/images.json'], lambda d: d.get('pids', {}))

    def library(self):
        return self._get('library', ['img/lib/index.json'], lambda d: {x.get('i'): x for x in d.get('images', []) if isinstance(x, dict)})

    def full(self):
        return self._get('full', ['proddb/imglib/index.json'], lambda d: {x.get('id'): x for x in d.get('images', []) if isinstance(x, dict)})

    def media(self):
        return self._get('media', ['app/data/media.json'], lambda d: d)

    def photos(self):
        return self._get('photos', ['proddb/ecat/photos.json'], lambda d: d.get('items', {}))

    def catalogs(self):
        def build(d):
            out = {}
            for row in d if isinstance(d, list) else []:
                if isinstance(row, list) and len(row) >= 4:
                    out[str(row[2])] = row[3]
            return out
        return self._get('catalogs', ['proddb/ecat/catalogs.json'], build)

    def scenario_bg(self):
        return self._get('scenario_bg', ['app/web/src/domain/templates/scenario_bg.json'], lambda d: d)


def media_address(media, code):
    if not isinstance(code, int):
        return ''
    i, slot = divmod(code, 10000)
    packs = media.get('P', [])
    return packs[i] + f'#{slot}' if 0 <= i < len(packs) else ''


def media_original(media, original):
    if not isinstance(original, str):
        return ''
    if original.startswith('^') and '|' in original:
        head, tail = original[1:].split('|', 1)
        try:
            original = media['D'][int(head, 36)] + tail
        except (ValueError, IndexError, KeyError):
            return ''
    if original.startswith('~/'):
        original = 'https://images.samsung.com/' + original[2:]
    return https(original)


class Browser:
    def __init__(self, store, root=ROOT, spatial_store=None):
        self.store, self.root = store, Path(root)
        self.spatial_store = spatial_store
        self.idx = Indexes(root)
        self._thumbs = OrderedDict()
        self._thumb_lock = threading.Lock()

    # ------------------------------------------------------------ per row
    def ref(self, a):
        return str(a.get('external_id') or a['id'].split(':', 1)[-1])

    def payload(self, a):
        p = a.get('payload')
        if isinstance(p, str):
            try:
                p = json.loads(p)
            except ValueError:
                p = {}
        return p if isinstance(p, dict) else {}

    def thumb(self, a, p):
        """{'type': 'image', 'src'} | {'type': 'layout', 'f'} | None — cheap: decided from the row and cached indexes."""
        kind, ref = a['kind'], self.ref(a)
        local = '/admin/api/asset-thumb?id=' + quote(a['id'], safe='')
        if kind == 'layout':
            return {'type': 'layout', 'f': p.get('f') or ref}
        if kind == 'catalog':
            directory = p.get('dir') or ref
            return {'type': 'image', 'src': f'{CATALOG_HOST}/{catalog_ns(p.get("viewer_url") or a.get("url"))}/catImage/{directory}/001.jpg', 'external': True} if str(directory).isdigit() else None
        address = self.thumb_address(a, p)
        if not address:
            if kind == 'scenario':
                f = next((x.get('f') for g in p.get('flow') or [] for x in (g.get('slides') or []) if isinstance(x, dict) and x.get('f')), None)
                return {'type': 'layout', 'f': f} if f else None
            if kind == 'spatial':
                # 공간 템플릿 · 사례는 그 공간을 만든 원본 장표로 보여 준다
                source = p.get('source') if isinstance(p.get('source'), dict) else {}
                f = p.get('layoutId') or source.get('layoutId')
                return {'type': 'layout', 'f': f} if isinstance(f, str) and f else None
            return None
        if https(address):
            return {'type': 'image', 'src': address, 'external': True, 'key': address}
        return {'type': 'image', 'src': local, 'key': address}

    def thumb_address(self, a, p):
        kind, ref = a['kind'], self.ref(a)
        images = self.idx.images()
        if kind == 'product':
            for v in (p.get('th'), (images.get(p.get('img')) or {}).get('file'), *(p.get('gal') or [])[:1]):
                if isinstance(v, str) and v:
                    return v
            pics = (self.idx.photos().get(ref) or {}).get('pics') or []
            return 'proddb/ecat/photos/' + pics[0]['file'] if pics and pics[0].get('file') else ''
        if kind == 'image':
            if ref.startswith('composer/'):
                return ref.removeprefix('composer/')
            if ref.startswith('app/'):
                return (images.get(ref[4:]) or {}).get('file', '')
            row = self.idx.library().get(ref)
            if row and row.get('a'):
                return row['a']
            full = self.idx.full().get(ref) or {}
            if full.get('file'):
                return 'proddb/imglib/' + full['file']
            return https(full.get('url')) or p.get('url') or ''
        if kind in ('solution', 'case'):
            media = self.idx.media()
            m = media.get('sol' if kind == 'solution' else 'case', {}).get(ref) or {}
            address = media_address(media, m.get('th'))
            if not address and m.get('g'):
                address = media_address(media, m['g'][0][0])
            return address or (images.get(p.get('img')) or {}).get('file', '')
        if kind == 'spatial':
            return p.get('thumbnail') if isinstance(p.get('thumbnail'), str) else ''
        if kind == 'scenario':
            bg = self.idx.scenario_bg().get(ref) or {}
            return bg['pack'] + '#0' if bg.get('pack') else ''
        if kind == 'pack':
            return (a.get('path') or '') + '#0'
        if kind in ('file', 'document'):
            path = a.get('path') or ''
            if Path(path).suffix.lower() in IMAGE_EXT:
                return path
            if path.endswith('.json') and '/img/' in '/' + path:
                return path + '#0'
        return ''

    def primary_origin(self, a, p):
        """the one 출처 shown on a card — what the resource came from, cheapest first."""
        kind = a['kind']
        if kind == 'catalog':
            return catalog_origin(p.get('dir') or self.ref(a), 1, p.get('title') or a['title'], catalog_ns(p.get('viewer_url') or a.get('url')), pages=p.get('pages'))
        if kind == 'product' and p.get('cdir') and not https(a.get('url')):
            return catalog_origin(p['cdir'], p.get('cpage'), self.idx.catalogs().get(str(p['cdir']), ''))
        if kind == 'image':
            ref = self.ref(a)
            full = self.idx.full().get(ref) or {}
            lib = self.idx.library().get(ref) or {}
            page = str(full.get('page') or '')
            if re.fullmatch(r'\d+_\d+', page):
                directory, number = page.split('_')
                return catalog_origin(directory, int(number), self.idx.catalogs().get(directory, ''))
            for url in (lib.get('pg'), full.get('page_url'), lib.get('u'), full.get('url')):
                if https(url):
                    return link_origin(url)
            if lib.get('c'):
                return {'type': 'note', 'label': lib['c']}
        if kind == 'category' and https(p.get('list_url')):
            return link_origin(p['list_url'])
        if kind in ('solution', 'case') and not https(a.get('url')):
            media = self.idx.media()
            pages = (media.get('sol' if kind == 'solution' else 'case', {}).get(self.ref(a)) or {}).get('pages') or []
            if pages and https(pages[0]):
                return link_origin(pages[0])
        if https(a.get('url')):
            return link_origin(a['url'])
        if a.get('path'):
            return {'type': 'file', 'label': a['path'], 'path': a['path']}
        return None

    def row(self, a, off, edits=None):
        p = self.payload(a)
        meta = off.get(a['id'])
        row = {'id': a['id'], 'kind': a['kind'], 'title': a['title'], 'ref': self.ref(a), 'status': a.get('status'),
                'updated_at': a.get('updated_at'), 'imported_at': a.get('imported_at'),
                'model': p.get('model') if isinstance(p.get('model'), str) else '',
                'thumb': self.thumb(a, p), 'origin': self.primary_origin(a, p),
                'switchable': switches.switchable(a['id']), 'off': bool(meta), 'off_at': (meta or {}).get('at'), 'off_by': (meta or {}).get('by')}
        if a['kind'] == 'spatial' and self.spatial_store:
            section, _, ref = row['ref'].partition('/')
            spatial = self.spatial_store()
            lib = spatial.library
            if section == 'buildings' and ref in spatial.buildings.presets:
                tid = 'building:' + ref
                edit = (edits or {}).get(tid, {})
                row.update(studio=tid, kind='building', title=edit.get('title') or row['title'],
                           thumb={'type': 'building', 'template': ref, 'key': tid + '@' + spatial.buildings.version + '-' + str(edit.get('revision', 0))})
                return row
            tid = ref if section == 'templates' else lib.case_templates.get(ref) if section == 'cases' else None
            if tid in lib.scenes:
                edit = (edits or {}).get(tid, {})
                row.update(studio=tid, kind='birdseye', title=edit.get('title') or row['title'],
                           variant={'compact': '소형', 'standard': '기본형', 'spacious': '대형'}.get(p.get('variant'), ''))
                src = '/api/spatial/templates/' + quote(tid, safe='') + '/preview.webp?managed=1&rev=' + lib.library['sourceHash'] + '&v=' + str(edit.get('revision', 0))
                row['thumb'] = {'type': 'image', 'src': src, 'direct': True, 'key': src, 'template': tid}
        return row

    # ------------------------------------------------------------ listing
    def studio_edits(self):
        spatial = self.spatial_store()
        return {**spatial.template_edits(), **{'building:' + k: {'title': v['scene']['title'], 'revision': v['revision']}
                                              for k, v in spatial.buildings.edits().items()}}

    def where(self, sid, q='', kind='', state='', edits=None):
        off = switches.load()['off']
        clauses, args = ['a.source_id=?'], [sid]
        if kind:
            clauses.append((SPATIAL_KIND if sid == 'spatial' else 'a.kind') + '=?'); args.append(kind)
        if q:
            literal = '%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
            clauses.append("(a.title LIKE ? ESCAPE '\\' OR a.external_id LIKE ? ESCAPE '\\' OR a.url LIKE ? ESCAPE '\\' OR a.payload LIKE ? ESCAPE '\\')")
            args += [literal] * 4
            if sid == 'images':
                rows, _ = layout_images.library(self.root)
                query = q.casefold()
                hits = {src for src, row in rows.items() if query in row['_search']}
                refs = [ref for ref, im in self.idx.library().items() if im.get('a') in hits]
                refs += ['app/' + pid for pid, im in self.idx.images().items() if im.get('file') in hits]
                refs.extend('composer/' + src for src in hits)
                # Match actual JSON values for photos, so the detail can name the matching fields.
                clauses[-1] = """(a.title LIKE ? ESCAPE '\\' OR a.external_id LIKE ? ESCAPE '\\' OR a.url LIKE ? ESCAPE '\\' OR
                    EXISTS (SELECT 1 FROM json_tree(a.payload) j WHERE j.atom LIKE ? ESCAPE '\\') OR
                    a.external_id IN (SELECT value FROM json_each(?)))"""
                args.append(json.dumps(refs))
            if edits:
                matched = {tid for tid, edit in edits.items() if q.casefold() in edit['title'].casefold()}
                refs = ['buildings/' + tid[9:] if tid.startswith('building:') else 'templates/' + tid for tid in matched]
                refs.extend('cases/' + k for k, tid in self.spatial_store().library.case_templates.items() if tid in matched)
                clauses[-1] = '(' + clauses[-1] + ' OR a.external_id IN (SELECT value FROM json_each(?)))'
                args.append(json.dumps(refs))
        if state == 'off':
            clauses.append('a.id IN (SELECT value FROM json_each(?))'); args.append(json.dumps(list(off)))
        elif state == 'on':
            clauses.append('a.id NOT IN (SELECT value FROM json_each(?))'); args.append(json.dumps(list(off)))
            clauses.append('a.kind IN (SELECT value FROM json_each(?))'); args.append(json.dumps(list(switches.KINDS)))
        return ' WHERE ' + ' AND '.join(clauses), args, off

    def browse(self, sid, q='', kind='', state='', sort='', offset=0, limit=60):
        source = self.store.source(sid)
        if not source:
            raise HTTPException(404, '소스를 찾지 못했습니다.')
        edits = self.studio_edits() if sid == 'spatial' and self.spatial_store else {}
        where, args, off = self.where(sid, q, kind, state, edits)
        order = SORTS.get(sort, SORTS[''])
        if sid == 'spatial' and not sort:
            order = "(a.external_id LIKE 'templates/%') DESC, (a.external_id LIKE 'cases/%') DESC, " + order
        total = self.store.one('SELECT count(*) n FROM assets a' + where, args)['n']
        rows = self.store.rows('SELECT a.id,a.kind,a.title,a.external_id,a.url,a.path,a.payload,a.status,a.imported_at,a.updated_at FROM assets a'
                               + where + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?', [*args, limit, offset])
        group = SPATIAL_KIND if sid == 'spatial' else 'a.kind'
        kinds = self.store.rows(f'SELECT {group} kind,count(*) n FROM assets a WHERE a.source_id=? GROUP BY {group}', (sid,))
        off_kinds = {r['kind']: r['n'] for r in self.store.rows(
            'SELECT kind,count(*) n FROM assets WHERE source_id=? AND id IN (SELECT value FROM json_each(?)) GROUP BY kind', (sid, json.dumps(list(off))))}
        kinds.sort(key=lambda r: (KIND_ORDER.index(r['kind']) if r['kind'] in KIND_ORDER else 99, -r['n']))
        switchable = sum(r['n'] for r in kinds if r['kind'] in switches.KINDS)
        return {'source': {k: source[k] for k in ('id', 'name', 'description', 'url', 'kind', 'enabled', 'imported_at', 'refreshed_at')},
                'kinds': [{'kind': r['kind'], 'count': r['n'], 'off': off_kinds.get(r['kind'], 0), 'switchable': r['kind'] in switches.KINDS} for r in kinds],
                'counts': {'all': sum(r['n'] for r in kinds), 'switchable': switchable, 'off': sum(off_kinds.values())},
                'total': total, 'offset': offset, 'limit': limit, 'items': [self.row(a, off, edits) for a in rows]}

    def matching_ids(self, sid, q='', kind='', state=''):
        where, args, _ = self.where(sid, q, kind, state)
        return self.store.rows('SELECT a.id,a.title FROM assets a' + where + ' AND a.kind IN (SELECT value FROM json_each(?)) ORDER BY a.rowid',
                               [*args, json.dumps(list(switches.KINDS))])

    # ------------------------------------------------------------ detail
    def origins(self, a, p):
        out, seen = [], set()

        def add(o):
            if not o:
                return
            if o.get('type') == 'catalog' and (not o.get('label') or o['label'] == '원문 페이지' or o['label'].startswith('e-카탈로그')):
                o['label'] = self.idx.catalogs().get(o['dir']) or f"e-카탈로그 {o['dir']}"
            key = (o.get('type'), o.get('href') or o.get('path') or o.get('label'), o.get('page'))
            if key in seen:
                return
            seen.add(key); out.append(o)
        kind, ref = a['kind'], self.ref(a)
        catalogs = self.idx.catalogs()
        add(self.primary_origin(a, p))
        if kind == 'product':
            add(link_origin(p.get('url'), 'samsung.com 제품 페이지'))
            if p.get('cdir'):
                add(catalog_origin(p['cdir'], p.get('cpage'), catalogs.get(str(p['cdir']), '')))
            for c in self.product_detail(ref).get('ecat') or []:
                if isinstance(c, dict):
                    add(catalog_origin(c.get('dir'), c.get('p'), c.get('t') or catalogs.get(str(c.get('dir')), '')))
            for pic in (self.idx.photos().get(ref) or {}).get('pics') or []:
                o = catalog_origin(pic.get('dir'), pic.get('p'), catalogs.get(str(pic.get('dir')), ''), pdf=pic.get('pdf'))
                if o:
                    o['note'] = pic.get('note') or ''
                add(o)
        if kind == 'image':
            lib, full = self.idx.library().get(ref) or {}, self.idx.full().get(ref) or {}
            add(link_origin(lib.get('pg') or full.get('page_url'), '게시 페이지'))
            add(link_origin(lib.get('u') or full.get('url'), '이미지 원본'))
            if lib.get('c') or full.get('ctx'):
                add({'type': 'note', 'label': lib.get('c') or full.get('ctx')})
        if kind in ('solution', 'case'):
            media = self.idx.media()
            m = media.get('sol' if kind == 'solution' else 'case', {}).get(ref) or {}
            for page in m.get('pages') or []:
                add(link_origin(page, '원문 페이지'))
            for g in (m.get('g') or [])[:6]:
                original = media_original(media, g[5] if len(g) > 5 else '')
                if original:
                    add(link_origin(original, '사진 원본 · ' + str(g[2] or '')[:40]))
        if kind == 'catalog':
            for pic in self.catalog_pdf_hint(p.get('dir') or ref):
                add(pic)
        if kind == 'spatial' and isinstance(p.get('source'), dict):
            src = p['source']
            if src.get('layoutId'):
                add({'type': 'layout', 'label': '원본 장표 · ' + src['layoutId'], 'f': src['layoutId'], 'note': src.get('note', '')})
        if kind in ('file', 'document') and (a.get('path') or '').lower().endswith('.pdf'):
            add({'type': 'pdf', 'label': Path(a['path']).name, 'asset': a['id'], 'page': 1})
        if p.get('file_ref') and str(p.get('filename', '')).lower().endswith('.pdf'):
            add({'type': 'pdf', 'label': p['filename'], 'asset': a['id'], 'page': 1})
        if a.get('path'):
            add({'type': 'file', 'label': a['path'], 'path': a['path']})
        return out

    def catalog_pdf_hint(self, directory):
        """a catalog's PDF, when an extracted photo already recorded it (otherwise the viewer asks /catalog-pdf)."""
        for entry in self.idx.photos().values():
            for pic in entry.get('pics') or []:
                if str(pic.get('dir')) == str(directory) and isinstance(pic.get('pdf'), dict) and https(pic['pdf'].get('url')):
                    return [{'type': 'pdf', 'label': Path(urlsplit(pic['pdf']['url']).path).name, 'href': pic['pdf']['url'], 'host': 'samsung.aiibook.net',
                             'page': 1, 'dir': str(directory)}]
        return []

    def product_detail(self, ref):
        database = self.root / 'app/data/runtime/winmate_products.sqlite'
        if not database.is_file():
            return {}
        try:
            with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as db:
                row = db.execute('SELECT payload FROM wm_ui_detail WHERE id=?', (ref,)).fetchone()
                return json.loads(row[0]) if row else {}
        except (sqlite3.Error, ValueError):
            return {}

    def detail(self, identifier, q=''):
        a = self.store.one('SELECT * FROM assets WHERE id=?', (identifier,))
        if not a:
            raise HTTPException(404, '자원을 찾지 못했습니다.')
        p = self.payload(a)
        off = switches.load()['off']
        source = self.store.source(a['source_id']) or {}
        edits = self.studio_edits() if a['kind'] == 'spatial' and self.spatial_store else {}
        row = self.row(a, off, edits)
        def text(v):
            return v if isinstance(v, str) else ', '.join(x for x in v if isinstance(x, str)) if isinstance(v, list) else str(v) if isinstance(v, (int, float)) else ''
        official = p.get('official') if isinstance(p.get('official'), dict) else {}
        fields = []
        for label, value in [('모델', text(p.get('model')) or text(official.get('mdlCode'))),
                             ('분류', text(p.get('cat') or p.get('category') or p.get('family') or p.get('group_name') or p.get('name_ko'))),
                             ('사양', text(p.get('spec'))),
                             ('설명', text(p.get('desc') or p.get('sub') or p.get('when') or p.get('short') or p.get('summary'))),
                             ('업종', text(p.get('indRaw') or p.get('ind') or p.get('industry'))),
                             ('쪽 수', text(p.get('pages'))), ('크기', f"{p['w']} × {p['h']}px" if p.get('w') and p.get('h') else '')]:
            if value:
                fields.append({'label': label, 'value': value[:600]})
        metadata = None
        if a['kind'] == 'image':
            images, _ = layout_images.library(self.root)
            metadata = image_metadata.detail(a, p, layout_images.find(images, self.thumb_address(a, p)), q)
        return {**row, 'metadata': metadata, 'source': {'id': source.get('id'), 'name': source.get('name')}, 'external_id': a.get('external_id'),
                'url': a.get('url'), 'path': a.get('path'), 'hash': a.get('hash'), 'first_seen': a.get('first_seen'),
                'origins': self.origins(a, p), 'fields': fields, 'off_meta': off.get(a['id']),
                'large': row['thumb'] and row['thumb']['type'] == 'image' and (row['thumb']['src'] if row['thumb'].get('external') else row['thumb']['src'] + '&large=1')}

    # ------------------------------------------------------------ thumbnails
    def thumb_bytes(self, identifier, large=False):
        a = self.store.one('SELECT * FROM assets WHERE id=?', (identifier,))
        if not a:
            raise HTTPException(404, '자원을 찾지 못했습니다.')
        key = (identifier, a['hash'], large)
        with self._thumb_lock:
            hit = self._thumbs.get(key)
            if hit:
                self._thumbs.move_to_end(key)
                return hit
        p = self.payload(a)
        address = self.thumb_address(a, p)
        if not address:
            raise HTTPException(404, '썸네일이 없습니다.')
        if https(address):
            return ('redirect', address)
        a['payload'] = p
        manifest = Manifest(ResourceLibrary(self.store, self.root), a)
        item = manifest.add(address, a['title'], 'primary', kind='image')
        if not item or not item.get('available'):
            raise HTTPException(404, '썸네일 원본을 찾지 못했습니다.')
        try:
            raw, mime = resource_bytes(item, thumb=not large)
        except (FileNotFoundError, OSError, ValueError, RuntimeError, IndexError) as exc:
            raise HTTPException(404, '썸네일을 만들지 못했습니다: ' + str(exc)[:120]) from None
        value = (mime, raw)
        if large:
            return value  # 크게 보기는 상세에서 한 번 — 메모리에 쌓지 않는다
        with self._thumb_lock:
            self._thumbs[key] = value
            while len(self._thumbs) > 2500:
                self._thumbs.popitem(last=False)
        return value


# ---------------------------------------------------------------- PDF
def pdf_url_ok(url):
    url = https(url)
    if not url:
        return ''
    parts = urlsplit(url)
    host = (parts.hostname or '').lower()
    if not any(host == h or host.endswith('.' + h) for h in PDF_HOSTS):
        return ''
    return url if parts.path.lower().endswith('.pdf') else ''


_PDF_CLIENT = None


def pdf_client():
    global _PDF_CLIENT
    if _PDF_CLIENT is None:
        _PDF_CLIENT = httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10), follow_redirects=False,
                                        headers={'User-Agent': 'Mozilla/5.0 (Winmate admin PDF viewer)'})
    return _PDF_CLIENT


class SwitchInput(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=switches.MAX_BATCH)
    on: bool
    reason: str = Field(default='', max_length=300)


class FilterSwitchInput(BaseModel):
    on: bool
    q: str = Field(default='', max_length=200)
    kind: str = Field(default='', max_length=40)
    state: str = Field(default='', max_length=10)


def source_browser_router(store_of, actor, root=ROOT, spatial_store=None):
    router = APIRouter(prefix='/api')
    browsers = {}

    def browser():
        store = store_of()
        b = browsers.get(id(store))
        if b is None or b.store is not store:
            b = browsers[id(store)] = Browser(store, root, spatial_store)
        return b

    def applied(rows, on, reason=''):
        store = store_of()
        result = switches.apply([{'id': r['id'], 'title': r.get('title', '')} for r in rows], on, actor(), reason)
        if result['changed']:
            store.event('resource.on' if on else 'resource.off', '', {'ids': result['changed'][:200], 'count': len(result['changed'])}, actor())
        return result

    @router.get('/sources/{sid}/browse')
    def browse(sid: str, q: str = Query('', max_length=200), kind: str = Query('', max_length=40), state: str = Query('', pattern='^(|on|off)$'),
               sort: str = Query('', pattern='^(|title|recent)$'), offset: int = Query(0, ge=0), limit: int = Query(60, ge=1, le=200)):
        return browser().browse(sid, q.strip(), kind, state, sort, offset, limit)

    @router.put('/sources/{sid}/switches')
    def switch_filtered(sid: str, body: FilterSwitchInput):
        if not store_of().source(sid):
            raise HTTPException(404, '소스를 찾지 못했습니다.')
        rows = browser().matching_ids(sid, body.q.strip(), body.kind, body.state if body.state in ('on', 'off') else '')
        if not rows:
            raise HTTPException(422, '조건에 맞는, 앱에서 켜고 끌 수 있는 자원이 없습니다.')
        if len(rows) > switches.MAX_BATCH:
            raise HTTPException(422, f'한 번에 {switches.MAX_BATCH:,}개까지 바꿀 수 있습니다. 조건을 좁혀 주세요.')
        try:
            return applied(rows, body.on)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.put('/resource-switches')
    def switch(body: SwitchInput):
        ids = list(dict.fromkeys(body.ids))
        if not ids:
            raise HTTPException(422, '바꿀 자원을 골라 주세요.')
        rows = store_of().rows('SELECT id,title FROM assets WHERE id IN (SELECT value FROM json_each(?))', (json.dumps(ids),))
        if len(rows) != len(ids):
            raise HTTPException(404, '등록되지 않은 자원이 있습니다.')
        try:
            return applied(rows, body.on, body.reason.strip())
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.get('/resource-switches')
    def switch_state():
        state = switches.load()
        return {'rev': state.get('rev', 0), 'off': len(state['off']), 'kinds': list(switches.KINDS)}

    @router.get('/source-items/{identifier:path}')
    def item(identifier: str, q: str = Query('', max_length=200)):
        return browser().detail(identifier, q.strip())

    @router.get('/spatial-templates/{identifier}')
    def spatial_template(identifier: str):
        if identifier.startswith('building:'):
            return spatial_store().buildings.get(identifier[9:])
        return spatial_store().template(identifier)

    @router.put('/spatial-templates/{identifier}')
    def save_spatial_template(identifier: str, body: dict):
        spatial = spatial_store()
        result = spatial.buildings.save(identifier[9:], body) if identifier.startswith('building:') else spatial.save_template(identifier, body)
        store_of().event('spatial-template.save', identifier, {'revision': result['revision']}, actor())
        return result

    @router.get('/asset-thumb')
    def asset_thumb(id: str = Query(..., max_length=2000), large: bool = False):
        value = browser().thumb_bytes(id, large)
        if value[0] == 'redirect':
            return RedirectResponse(value[1], 303)
        mime, raw = value
        return Response(raw, media_type=mime, headers={'Cache-Control': 'private, max-age=600', 'Content-Security-Policy': "default-src 'none'; sandbox"})

    @router.get('/catalog-pdf')
    def catalog_pdf(dir: str = Query(..., pattern=r'^\d{1,6}$'), ns: str = Query('b2b', pattern='^(b2b|b2c)$')):
        """the PDF behind an e-카탈로그 (the viewer page links it) — remembered for a week."""
        store = store_of()
        cache = store.setting('catalog_pdfs', {}) or {}
        key = f'{ns}/{dir}'
        hit = cache.get(key)
        now = datetime.now(timezone.utc)
        if hit and hit.get('at') and now - datetime.fromisoformat(hit['at']) < timedelta(days=7):
            return hit
        viewer = f'{CATALOG_HOST}/{ns}/ecatalog5.php?Dir={dir}'
        url, error = '', ''
        try:
            response = httpx.get(viewer, timeout=15, headers={'User-Agent': 'Mozilla/5.0 (Winmate admin PDF viewer)'})
            match = re.search(r'["\'](\./catImage/' + re.escape(dir) + r'/[^"\'\s<>]+?\.pdf)["\']', response.text)
            if match:
                url = f'{CATALOG_HOST}/{ns}/' + match.group(1)[2:]
        except httpx.HTTPError as exc:
            error = type(exc).__name__
        value = {'url': pdf_url_ok(url), 'viewer': viewer, 'at': now.isoformat()}
        if error:
            return {**value, 'error': '카탈로그 페이지를 열지 못했습니다.'}
        cache[key] = value
        store.set_setting('catalog_pdfs', dict(list(cache.items())[-300:]))
        return value

    @router.get('/pdf')
    async def pdf(request: Request, url: str = Query('', max_length=2000), asset: str = Query('', max_length=2000)):
        if asset:
            a = store_of().one('SELECT * FROM assets WHERE id=?', (asset,))
            if not a:
                raise HTTPException(404, '자원을 찾지 못했습니다.')
            p = json.loads(a['payload'] or '{}')
            lib = ResourceLibrary(store_of(), root)
            file = lib.allowed(store_of().home / p['file_ref'], upload=True) if p.get('file_ref') else lib.allowed(Path(root) / (a.get('path') or ''))
            if not file or not file.is_file() or file.suffix.lower() != '.pdf':
                raise HTTPException(404, 'PDF 원본을 찾지 못했습니다.')
            return FileResponse(file, media_type='application/pdf', headers={'Content-Security-Policy': "default-src 'none'; sandbox"})
        target = pdf_url_ok(url)
        if not target:
            raise HTTPException(422, '열 수 있는 PDF 주소가 아닙니다.')
        headers = {}
        if request.headers.get('range'):
            if not re.fullmatch(r'bytes=\d*-\d*', request.headers['range'].strip()):
                raise HTTPException(416, 'Range 형식이 올바르지 않습니다.')
            headers['Range'] = request.headers['range'].strip()
        client = pdf_client()
        try:
            upstream = await client.send(client.build_request('GET', target, headers=headers), stream=True)
        except httpx.HTTPError:
            raise HTTPException(502, 'PDF 원본에 연결하지 못했습니다.') from None
        if upstream.status_code not in (200, 206):
            await upstream.aclose()
            raise HTTPException(502, f'PDF 원본이 응답하지 않습니다 ({upstream.status_code}).')
        out = {'Content-Type': 'application/pdf', 'Accept-Ranges': upstream.headers.get('accept-ranges', 'none'),
               'Cache-Control': 'private, max-age=600', 'Content-Security-Policy': "default-src 'none'; sandbox"}
        for name in ('content-length', 'content-range', 'last-modified', 'etag'):
            if upstream.headers.get(name):
                out[name.title()] = upstream.headers[name]
        if upstream.headers.get('content-encoding') not in (None, '', 'identity'):
            out.pop('Content-Length', None); out['Accept-Ranges'] = 'none'
        async def body():
            # pdf.js 는 머리만 읽고 전체 요청을 끊은 뒤 Range 로 다시 묻는다 — 끊기면 원본 연결도 바로 닫는다
            try:
                async for chunk in upstream.aiter_raw():
                    yield chunk
            finally:
                await upstream.aclose()
        return StreamingResponse(body(), status_code=upstream.status_code, headers=out)

    return router
