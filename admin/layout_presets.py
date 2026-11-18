"""레이아웃 구성 관리 — Storyboard '레이아웃 구성'이 추천하는 구성(목차 템플릿)의 운영 값을 본다 · 바꾼다.

구성의 구조(목차 흐름 · 장 · 업종별 샘플 시나리오)는 관리자 화면이 앱과 같은 모듈(``app/web/src/domain/templates/toc_templates.js``)에서
직접 읽는다. 서버는 (1) 운영 값(끄기 · 순서 · 기본 구성 · 글 · 연결 샘플, ``app/api/layout_presets.py``)을 저장하고
(2) 목차에 속한 레이아웃의 이름 · 장표 미리보기(Agent KB 스냅샷)를 준다.

운영 값은 관리자 격리 DB 가 아니라 **실제 앱**에 반영된다 — 앱이 다음에 열릴 때 ``/api/bootstrap`` 으로 받는다.
"""
from __future__ import annotations

import json
import mimetypes
import re
from typing import Callable
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, Response

from app.api import layout_presets as presets
from app.api import layout_library as live

from .config import ROOT
from .resources import https, layout_preview, read_json, resource_bytes, resources_for

LAYOUT_ID = re.compile(r'[A-Za-z0-9_\-]{1,80}')
LAYOUT_KEYS = ('code', 'name', 'when', 'g', 'p')
# 레이아웃 탐색(직접 만드는 파트에 레이아웃 더하기) — 앱 템플릿 라이브러리의 시트 목록과 같은 값(검색 · 목차 유형 · 업종 · 솔루션 · 제품 · 이미지 칸 · 원본 장표)
LIBRARY_KEYS = ('f', 'code', 'name', 'when', 'g', 'p', 'ind', 'inds', 'sol', 'sols', 'prods', 'c', 'nI', 'pf', 'hl')
MAX_BODY = 256 * 1024


def layout_index(root=ROOT) -> dict:
    """레이아웃 f → { code, name, when, g, p } (Agent KB 스냅샷 · 파일이 바뀌면 다시 읽는다)."""
    catalog = read_json(root / 'app/data/runtime/kb/catalog.json')
    edits = live.effective_items(live.load(), {r['f']: r for r in catalog.get('layouts', [])})
    return {row['f']: {key: live.apply_meta(row, edits.get(row['f'], {})).get(key) for key in LAYOUT_KEYS}
            for row in catalog.get('layouts', []) if isinstance(row, dict) and row.get('f')}


def layout_library(root=ROOT) -> dict:
    """쓸 수 있는 레이아웃 전부(은퇴한 장 제외) + 업종 · 솔루션 이름 — 앱 템플릿 라이브러리의 시트와 같은 목록."""
    catalog = read_json(root / 'app/data/runtime/kb/catalog.json')
    edits = live.effective_items(live.load(), {r['f']: r for r in catalog.get('layouts', [])})
    catalog = {**catalog, 'layouts': [live.apply_meta(row, edits.get(row['f'], {})) for row in catalog.get('layouts', [])]}
    rows = [{key: row.get(key) for key in LIBRARY_KEYS if row.get(key) not in (None, '', [])}
            for row in catalog.get('layouts', []) if isinstance(row, dict) and row.get('f') and not row.get('retired')]
    industries = [{'code': x.get('code'), 'name': x.get('name')} for x in catalog.get('industries', []) if isinstance(x, dict) and x.get('code')]
    solutions = [{'id': x.get('id'), 'name': x.get('name'), 'cat': x.get('cat')} for x in catalog.get('solutions', []) if isinstance(x, dict) and x.get('id')]
    products = {x['id']: x.get('model') or x.get('name') or x['id'] for x in catalog.get('products', []) if isinstance(x, dict) and x.get('id')}
    used = {p for row in rows for p in row.get('prods', [])}
    return {'layouts': rows, 'industries': industries, 'solutions': solutions,
            'products': [{'id': pid, 'name': products[pid]} for pid in sorted(used) if pid in products]}


def layout_presets_router(store: Callable[[], object], actor: Callable[[], str], root=ROOT) -> APIRouter:
    """store(): 관리자 Store(변경 이력 · 미리보기 리소스), actor(): 현재 요청의 관리자 아이디."""
    router = APIRouter(prefix='/api/layout-presets')

    @router.get('')
    def current():
        return {'presets': presets.load(), 'limits': {**presets.TEXT_LIMITS, 'related': presets.MAX_RELATED}}

    @router.put('')
    async def save(request: Request):
        raw = await request.body()
        if len(raw) > MAX_BODY:
            raise HTTPException(413, '구성 값이 너무 큽니다.')
        try:
            body = json.loads(raw or b'{}')
            # 직접 만든 파트 · 구성을 모르는 화면(이 기능 전에 연 관리자 탭 · 다른 시험)이 저장해도 지워지지 않게 — 칸이 없으면 저장된 값 그대로
            if isinstance(body, dict):
                kept = presets.load()
                for key in ('parts', 'templates'):
                    if key not in body:
                        body[key] = kept[key]
            value = presets.clean(body)
        except ValueError as exc:
            raise HTTPException(422, str(exc) if not isinstance(exc, json.JSONDecodeError) else '구성 값을 읽지 못했습니다.') from None
        # 직접 만든 파트의 레이아웃은 실제로 있는 장이어야 한다(Agent KB 스냅샷 · 은퇴한 장은 안 된다)
        if value['parts']:
            live = {row['f'] for row in layout_library(root)['layouts']}
            for part in value['parts'].values():
                gone = [x['f'] for x in part['sheets'] if x['f'] not in live]
                if gone:
                    raise HTTPException(422, f"{part['name']} 파트: 레이아웃 {', '.join(gone)} 을(를) 찾지 못했습니다.")
        saved = presets.save(value, actor())
        off = sorted(tid for tid, item in saved['items'].items() if item.get('enabled') is False)
        store().event('layout-presets.update', 'layout-presets', {'rev': saved['rev'], 'fixed': saved['fixed'], 'off': off,
                                                                    'edited': sorted(saved['items']), 'order': saved['order'],
                                                                    'custom': sorted(saved['templates']), 'parts': sorted(saved['parts'])}, actor())
        return {'presets': saved}

    @router.delete('')
    def reset():
        saved = presets.reset(actor())
        store().event('layout-presets.reset', 'layout-presets', {'rev': saved['rev']}, actor())
        return {'presets': saved}

    @router.get('/layouts')
    def layouts():
        return {'items': layout_index(root)}

    @router.get('/library')
    def library():
        return layout_library(root)

    def manifest_for(layout: str):
        """레이아웃 한 장의 리소스 — 에셋 색인에 아직 없는 레이아웃(새로 더한 목차 템플릿 장)도 KB 스냅샷에서 바로 만든다."""
        if not LAYOUT_ID.fullmatch(layout):
            raise HTTPException(404, '레이아웃을 찾지 못했습니다.')
        manifest = resources_for(store(), {'id': 'layout:' + layout, 'external_id': layout, 'kind': 'layout', 'payload': {'f': layout}}, root)
        item = next((i for i in manifest.items.values() if i['kind'] == 'layout' and i.get('_layout')), None)
        if not item:
            raise HTTPException(404, '이 레이아웃의 장표 미리보기가 없습니다.')
        return manifest, item

    @router.get('/layouts/{layout}/preview')
    def preview(layout: str, thumb: bool = False):
        """스크립트 없는 장표 HTML(1280×720) — 화면이 sandbox iframe 에 넣는다. 장표 안 이미지는 아래 resource 주소로 바꾼다."""
        manifest, item = manifest_for(layout)
        html = layout_preview(item['_layout'], manifest)
        own = '/admin/api/layout-presets/layouts/' + quote(layout, safe='') + '/resource/'
        html = re.sub(r'/admin/api/asset-resources/([0-9a-f]{24})\?asset=' + re.escape(quote('layout:' + layout, safe='')),
                      lambda m: own + m[1] + ('?thumb=1' if thumb else ''), html)
        return {'html': html}

    @router.get('/layouts/{layout}/resource/{resource}')
    def resource(layout: str, resource: str, thumb: bool = False):
        manifest, _ = manifest_for(layout)
        item = manifest.items.get(resource)
        if not item or item['kind'] != 'image' or not item['available']:
            raise HTTPException(404, '이 레이아웃에 연결된 이미지가 아닙니다.')
        if https(item['address']):
            return RedirectResponse(item['address'], 303)
        headers = {'Content-Security-Policy': "default-src 'none'; sandbox"}
        special = item.get('_data') is not None or any(k in item for k in ('_slot', '_member', '_pdf_page', '_pdf_image', '_pdf_attachment'))
        try:
            if item.get('_file') and not special and not thumb and item['_file'].suffix.lower() not in {'.tif', '.tiff'}:
                return FileResponse(item['_file'], media_type=mimetypes.guess_type(item['_file'].name)[0] or 'application/octet-stream', headers=headers)
            raw, mime = resource_bytes(item, thumb=thumb)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from None
        except (OSError, ValueError, RuntimeError, IndexError) as exc:
            raise HTTPException(422, '이미지를 읽지 못했습니다: ' + str(exc)[:180]) from None
        return Response(raw, media_type=mime, headers=headers)

    return router
