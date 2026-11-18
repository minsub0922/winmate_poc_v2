"""Individual sheet management; all writes go to the app's live registry."""
import copy
import asyncio
import base64
from html import escape
import json
import re
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, JSONResponse
from starlette.concurrency import run_in_threadpool

from app.api import layout_flows as flows
from app.api import layout_library as live
from .config import ROOT
from .resources import LayoutImages, layout_preview, resources_for, resource_bytes
from .composition_layouts import inventory
from app.api.poc import layout_experiments as experiments, layout_trace
from . import layout_images
from app.api.poc.provider import ProviderError, get_provider
from app.api.poc.settings import get_settings
from app.api.poc.adapters.compose import auto_settings


def _style(tag, value):
    match = re.search(r'\bstyle="([^"]*)"', tag)
    if match:
        return tag[:match.end(1)] + ';' + escape(value, quote=True) + tag[match.end(1):]
    return tag[:-1] + ' style="' + escape(value, quote=True) + '">'


def sample_html(html, ov, background=None, page_no=None):
    """The sample's text, image fit/crop, background and page number (Slide.applyOverrides)."""
    rich = {i: v['html'] for i, v in ov.get('t', {}).items() if isinstance(v, dict) and 'html' in v}
    t = {i: v for i, v in ov.get('t', {}).items() if isinstance(v, str)}
    html = live.apply_html(html, {'t': t, 'img': {i: v['src'] for i, v in ov.get('img', {}).items() if i.isdigit() and isinstance(v, dict) and v.get('src')}})
    replacements = [(n['open'], n['close'], rich[n['attrs']['data-tb']]) for n in live.nodes(html) if n['attrs'].get('data-tb') in rich]
    for start, end, content in sorted(replacements, reverse=True):
        html = html[:start] + content + html[end:]
    images = ov.get('img', {})
    replacements = []
    for n in live.nodes(html):
        a = n['attrs']
        value = images.get(a.get('data-img')) or images.get('t' + a.get('data-tb', '')) or images.get('s:' + a.get('data-label', ''))
        if not isinstance(value, dict):
            continue
        src = escape(value.get('src', ''), quote=True)
        attrs = f' src="{src}" alt="{escape(value.get("name", ""), quote=True)}"'
        if re.search(r'\.json#\d+$', value.get('src', '')):
            attrs += f' data-fill="{src}"'
        fit = value.get('fit') or 'cover'
        css = f'object-fit:{fit};' + ('object-position:' + value['pos'] if value.get('pos') else '')
        tag = re.sub(r'\sdata-pid="[^"]*"', '', html[n['start']:n['open']])
        def image_tag(original):
            out = re.sub(r'\s(?:src|data-fill|data-pid|alt)="[^"]*"', '', original)
            return _style(out[:-1] + attrs + '>', css)
        if n['tag'] == 'img':
            replacements.append((n['start'], n['open'], image_tag(tag)))
            continue
        if value.get('hidden'):
            inner = ''
        elif value.get('keep'):
            inner = re.sub(r'<img\b[^>]*>', lambda m: image_tag(m[0]), html[n['open']:n['close']], count=1)
            if '<img' not in inner:
                inner = image_tag('<img style="display:block;width:100%;height:100%">')
        else:
            inner = image_tag('<img style="display:block;width:100%;height:100%">')
            tag = _style(tag, 'padding:0;background:transparent;overflow:hidden')
        replacements.extend([(n['start'], n['open'], tag), (n['open'], n['close'], inner)])
    for start, end, content in sorted(replacements, reverse=True):
        html = html[:start] + content + html[end:]
    for old, new in ov.get('r', []):
        html = html.replace(escape(old), escape(new))
    if background:
        root = next((n for n in live.nodes(html) if n['tag'] == 'div'), None)
        if root:
            color = re.search(r'background(?:-color)?:\s*#([0-9a-fA-F]{6})', root['attrs'].get('style', ''))
            rgb = [int(color[1][i:i+2], 16) for i in (0, 2, 4)] if color else [255] * 3
            if sum(v*w for v, w in zip(rgb, (.2126, .7152, .0722))) / 255 >= .35:
                css = 'background-image:url(' + background + ');background-size:cover;background-position:center'
                html = html[:root['start']] + _style(html[root['start']:root['open']], css) + html[root['open']:]
    if page_no is not None:
        for n in reversed(live.nodes(html)):
            if 'data-pgno' in n['attrs']:
                html = html[:n['open']] + str(page_no) + html[n['close']:]
    return html


def layout_library_router(store, actor, root=ROOT):
    router = APIRouter(prefix='/api/layout-library')

    def data(f):
        catalog, layouts, html = inventory(root)
        if f not in layouts or f not in html:
            raise HTTPException(404, '레이아웃을 찾지 못했습니다.')
        state = live.load()
        item = live.effective_items(state, layouts).get(f, {})
        return state, layouts[f], live.apply_html(html[f], item), item

    def preview(f, html, prefix=None):
        manifest = resources_for(store(), {'id': 'layout:' + f, 'external_id': f, 'kind': 'layout', 'payload': {'f': f}}, root)
        LayoutImages(manifest).feed(html)
        for address in re.findall(r'url\([\s\'"]*([^\)\'"\s]+)', html):
            manifest.pid(address, 'layout')
        doc = layout_preview(html, manifest)
        if prefix:
            doc = re.sub(r'/admin/api/asset-resources/([0-9a-f]{24})\?asset=[^"&<]+', lambda m: prefix + '/resource/' + m[1], doc)
        return doc, manifest

    def experiment_preview(f, html):
        doc, manifest = preview(f, html)
        for resource in manifest.items.values():
            if resource['kind'] != 'image':
                continue
            if resource['availability'] == 'external':
                url = resource['address']
            else:
                try:
                    raw, mime = resource_bytes(resource)
                except (OSError, ValueError, IndexError):
                    continue
                url = 'data:' + mime + ';base64,' + base64.b64encode(raw).decode()
            doc = doc.replace(escape(manifest.public(resource)['url'], quote=True), escape(url, quote=True))
        return doc

    async def experiment_body(f, request):
        if int(request.headers.get('content-length') or 0) > 512 * 1024:
            raise HTTPException(413, '실험 입력이 너무 큽니다.')
        raw = await request.body()
        try:
            value = json.loads(raw) if len(raw) <= 512 * 1024 else None
            if not isinstance(value, dict):
                raise ValueError()
        except (ValueError, UnicodeError):
            raise HTTPException(422, '실험 입력 형식을 확인해 주세요.') from None
        _, meta, _, edits = data(f)
        try:
            snapshot = experiments.context(f, meta, inventory(root)[2][f], value.get('draft', edits), value.get('flow'))
        except (ValueError, TypeError):
            raise HTTPException(422, '레이아웃과 흐름 설정을 확인해 주세요.') from None
        return value, snapshot

    @router.post('/{f}/experiments/samples')
    async def experiment_samples(f: str, request: Request):
        value, snapshot = await experiment_body(f, request)
        try:
            samples = await run_in_threadpool(experiments.samples, snapshot, value.get('industry'))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return JSONResponse({'samples': samples, 'industries': experiments.industries(), 'view': snapshot['view']}, headers={'Cache-Control': 'no-store'})

    @router.get('/image-search')
    def image_search(f: str = ''):
        state = flows.load()
        available = get_provider(get_settings())[0] is not None
        return {'rev': state['rev'], 'weights': flows.image_weights(state), 'labels': flows.IMAGE_WEIGHTS,
                'can_verify': available, 'verify': available and auto_settings()['verify'],
                'samples': experiments.picture_samples(f, data(f)[1]['name'] if f else None)}

    @router.put('/image-search')
    async def save_image_search(request: Request):
        value = await body(request)
        if value.get('confirmed') is not True:
            raise HTTPException(422, '검색 로직 변경을 확인해 주세요.')
        try:
            state = flows.save_image_weights(value.get('weights'), value.get('rev'), actor())
        except flows.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        store().event('image-search.save', '', {'rev': state['rev'], 'weights': state['image_weights']}, actor())
        return {'rev': state['rev'], 'weights': flows.image_weights(state)}

    def picture_html(f, ex, html):
        return example_html(f, ex['sid'], ex['k']) if ex else html

    @router.get('/{f}/experiments/image-sample')
    def picture_sample(f: str, sample: str):
        _, meta, html, _ = data(f)
        try:
            ex, inputs = experiments.picture_example(f, sample, meta['name'])
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return {'input': inputs, 'html': experiment_preview(f, picture_html(f, ex, html))}

    async def execute_experiment(f: str, request: Request, images_only=False):
        value, snapshot = await experiment_body(f, request)
        cancelled = threading.Event()

        def check():
            if cancelled.is_set():
                raise ProviderError('cancelled')

        def work():
            if images_only:
                ex, _ = experiments.picture_example(f, value.get('sample'), snapshot['meta']['name'])
                weights = flows.clean_image_weights(value['weights']) if 'weights' in value else flows.image_weights()
                verify = value.get('verify')
                if 'verify' not in value:
                    verify = auto_settings()['verify'] and get_provider(get_settings())[0] is not None
                if type(verify) is not bool:
                    raise ValueError('AI 검토 설정을 확인해 주세요.')
                result = experiments.run(snapshot, value.get('input'), check, pictures={'exemplar': ex, 'weights': weights, 'verify': verify})
                check()
                html = picture_html(f, ex, snapshot['html'])
                changed = {m['slot']: result['ov']['img'][m['slot']] for m in result['matches']
                           if m['slot'] in result['ov']['img'] and (m['hidden'] or m['before'] != m['src'])}
                rows, _ = layout_images.library(root)
                for match in result['matches']:
                    for candidate in match['candidates']:
                        candidate['desc'] = (rows.get(candidate['src']) or {}).get('desc') or candidate['src']
                    match['desc'] = (rows.get(match['src']) or {}).get('desc') or ''
                return {'html': experiment_preview(f, sample_html(html, {'img': changed})), 'matches': result['matches']}
            result = experiments.run(snapshot, value.get('input'), check)
            check()
            return {'html': experiment_preview(f, sample_html(snapshot['html'], result['ov'])), 'issues': result['issues']}

        task = asyncio.create_task(run_in_threadpool(work))
        try:
            async with asyncio.timeout(240):
                while not task.done():
                    if await request.is_disconnected():
                        cancelled.set()
                        task.cancel()
                        return Response(status_code=499, headers={'Cache-Control': 'no-store'})
                    await asyncio.wait({task}, timeout=.25)
                result = await task
            return JSONResponse(result, headers={'Cache-Control': 'no-store'})
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        except ProviderError as exc:
            raise HTTPException(503, 'AI 실행을 완료하지 못했습니다. 연결 설정을 확인하거나 다시 실행해 주세요.') from None
        except TimeoutError:
            raise HTTPException(504, '실험 시간이 초과되었습니다. 다시 실행해 주세요.') from None
        except Exception:
            raise HTTPException(502, '레이아웃 실험을 완료하지 못했습니다. 입력과 흐름을 확인해 주세요.') from None
        finally:
            cancelled.set()
            if not task.done():
                task.cancel()

    @router.post('/{f}/experiments/run')
    async def experiment_run(f: str, request: Request):
        return await execute_experiment(f, request)

    @router.post('/{f}/experiments/images')
    async def experiment_images(f: str, request: Request):
        return await execute_experiment(f, request, images_only=True)

    def usage(f):
        kb = root / 'app/data/runtime/kb'
        scenarios = live.read(kb / 'best_scenarios.json')['SCENARIOS']
        variants = live.read(kb / 'layout_variants.json').get('groups', {})
        members = {m[0] for m in variants.get(f, {}).get('members', [])} | {f}
        result = []
        for sc in scenarios:
            k = 0
            for group in sc.get('flow', []):
                for sheet in group.get('slides', []):
                    if sheet.get('f') in members:
                        result.append({'id': sc['id'] + ':' + str(k), 'scenario': sc['id'], 'title': sc['title'], 'part': group.get('name', ''), 'part_key': group.get('key'),
                                       'page': k, 'f': sheet['f'], 'role': sheet.get('role', '')})
                    k += 1
        return result

    def detail(f):
        state, meta, html, item = data(f)
        rules = live.read(root / 'app/web/src/domain/templates/fixed_content.json')
        default_fixed = any(re.search(pattern, f) for pattern in rules['sheets']) or bool(meta.get('compositionOnly') and meta.get('fx') == 'fixed')
        examples = usage(f)
        contexts = sorted({e['part'] for e in examples if e.get('part_key') in rules['parts']})
        layouts = inventory(root)[1]
        representative = layouts.get(meta.get('variantOf') or f, {})
        family = [m['f'] for m in representative.get('variants', [])] or [f]
        row = live.apply_meta(meta, item, html)
        row['protected'] = f in live.protected_layouts(root, layouts)
        resource_prefix = '/admin/api/layout-presets/layouts/' + f if meta.get('compositionOnly') else None
        design = item.get('design') if live.design_html(item) else None
        base_html = live.design_html(item) or inventory(root)[2][f]  # 올린 디자인을 고르면 그 디자인의 칸 · 기본 문구가 기준
        return {'rev': state['rev'], 'layout': row, 'html': html, 'preview': preview(f, html, resource_prefix)[0],
                'slots': live.slots(html), 'edits': {k: v for k, v in item.items() if k != 'design'}, 'default_fixed': default_fixed,
                'base_layout': meta, 'base_slots': live.slots(base_html), 'examples': examples, 'fixed_contexts': contexts, 'policy_family': family,
                'design': design and {k: design.get(k) for k in ('version', 'name', 'updated_at', 'updated_by')},
                'flow': None if meta.get('compositionOnly') else flows.view(f)}

    @router.post('/{f}/draft-preview')
    async def draft_preview(f: str, request: Request):
        import base64
        value = await body(request)
        _, meta, _, previous = data(f)
        if meta.get('compositionOnly'):
            raise HTTPException(409, '구성 관리에서 정의한 레이아웃입니다.')
        raw_html = live.base(root)[2][f]
        try:
            item = live.clean(value, raw_html, live.read(root / 'app/data/runtime/kb/parts.json')['PARTS'])
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, str(exc)) from None
        if live.design_html(previous):
            item['design'] = previous['design']
        doc, manifest = preview(f, live.apply_html(raw_html, item))
        # Unsaved image references have no public resource id yet. Resolve only those
        # references into the sandbox document; no draft is persisted by this route.
        for resource in manifest.items.values():
            if resource['kind'] != 'image' or not set(resource['_addresses']) & set(item['img'].values()):
                continue
            if resource['availability'] == 'external':
                url = resource['address']
            else:
                try:
                    raw, mime = resource_bytes(resource, thumb=True)
                except (OSError, ValueError, IndexError):
                    raise HTTPException(422, '이미지를 읽지 못했습니다. 경로를 확인해 주세요.') from None
                url = 'data:' + mime + ';base64,' + base64.b64encode(raw).decode()
            doc = doc.replace(escape(manifest.public(resource)['url'], quote=True), escape(url, quote=True))
        return {'html': doc}

    @router.get('')
    def listing():
        state = live.load()
        catalog, layouts, html = inventory(root)
        protected = live.protected_layouts(root, layouts)
        edits = live.effective_items(state, layouts)
        listed = {m['f'] for m in catalog['layouts']}
        rules = live.read(root / 'app/web/src/domain/templates/fixed_content.json')
        result = []
        for f, meta in layouts.items():
            item = edits.get(f, {})
            h = live.apply_html(html.get(f, ''), item)
            row = live.apply_meta(meta, item)
            # Precomputed lock for the unchanged majority; edited sheets follow their live slots.
            if item:
                row['fx'] = live.lock_for(live.slots(h))
            if item.get('fill', 'inherit') == 'inherit' and any(re.search(pattern, f) for pattern in rules['sheets']):
                row['fx'] = 'fixed'
            row.update(hidden=f not in listed and not meta.get('compositionOnly'), edited=bool(item), updated_at=item.get('updated_at'), protected=f in protected)
            result.append(row)
        from app.api import layout_presets
        return {'rev': state['rev'], 'protection_rev': layout_presets.load()['rev'], 'items': result, 'parts': live.read(root / 'app/data/runtime/kb/parts.json')['PARTS'],
                'industries': catalog['industries'], 'modes': live.MODES}

    # ---- 입력 소스 (Storyboard 에서 레이아웃이 받을 수 있는 정보) · 레이아웃별 입력 · 흐름 — app/api/layout_flows.py
    @router.get('/sources')
    def flow_sources():
        state = flows.load()
        return {'rev': state['rev'], 'sources': flows.sources(state), 'groups': flows.GROUPS, 'supply': flows.SUPPLY, 'types': list(flows.TYPES),
                'always': list(flows.ALWAYS), 'used': _source_use(state)}

    def _source_use(state):
        used = {}
        for key, item in state['flows'].items():
            for i in item.get('inputs', []):
                used.setdefault(i.get('source'), []).append(key)
        return used

    @router.put('/sources')
    async def save_flow_sources(request: Request):
        value = await body(request)
        try:
            saved = flows.save_sources(value.get('sources'), value.get('rev'), actor())
        except flows.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        store().event('layout-flow.sources', 'sources', {'rev': saved['rev'], 'n': len(saved['sources'])}, actor())
        return flow_sources()

    # ---- 도구 (레이아웃 흐름이 부르는 재사용 도구: RAG · 웹 검색 · 검색 · DB 조회) — app/api/poc/layout_tools.py
    @router.get('/tools')
    def flow_tools():
        state = flows.load()
        return {'rev': state['rev'], 'tools': flows.tools(state), 'used': flows.tool_use(state), 'query_fields': list(flows.QUERY_FIELDS),
                'types': {k: {'label': v['label'], 'collections': v.get('collections', {})} for k, v in flows.TOOL_TYPES.items()},
                'engines': list(flows.WEB_ENGINES)}

    @router.put('/tools')
    async def save_flow_tools(request: Request):
        value = await body(request)
        try:
            saved = flows.save_tools(value.get('tools'), value.get('rev'), actor())
        except flows.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        store().event('layout-flow.tools', 'tools', {'rev': saved['rev'], 'n': len(saved['tools'])}, actor())
        return flow_tools()

    @router.post('/tools/try')
    async def try_tool(request: Request):
        """run a tool once with a query (the registry's or an unsaved draft config) — nothing is stored"""
        value = await body(request)
        from app.api.poc import layout_tools
        draft = value.get('tool') if isinstance(value.get('tool'), dict) else flows.tool_map().get(str(value.get('key') or ''))
        if not draft:
            raise HTTPException(404, '도구를 찾지 못했습니다.')
        try:
            typ = draft.get('type')
            if typ not in flows.TOOL_TYPES:
                raise ValueError('도구 종류를 확인해 주세요.')
            tool = {'key': str(draft.get('key') or 'draft'), 'type': typ, 'config': flows.clean_tool_config(typ, draft.get('config', {}))}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        query = str(value.get('query') or '').strip()
        if not query:
            raise HTTPException(422, '질의를 입력해 주세요.')
        import asyncio
        return await asyncio.to_thread(layout_tools.run, tool, query[:200])

    @router.get('/{f}/flow')
    def get_flow(f: str):
        data(f)
        return flows.view(f)

    # 메타데이터 — what the AI fills on this layout and how those cells · pictures belong together (app/api/layout_meta.py)
    @router.get('/{f}/meta')
    def get_meta(f: str):
        data(f)
        from app.api import layout_meta
        return JSONResponse(layout_meta.view(f), headers={'Cache-Control': 'no-store'})

    # 이미지 칸 — 누르면 관련 이미지(사진 라이브러리) · 검색 · 썸네일 (admin/layout_images.py). 고른 주소는 draft.img → 수정 반영.
    @router.get('/{f}/images/file')
    def image_file(f: str, src: str = ''):
        data(f)
        return layout_images.thumbnail(root, store(), src)

    @router.get('/{f}/images/{slot}')
    def image_related(f: str, slot: str, src: str = '', ratio: float = 0, q: str = '', offset: int = 0):
        _, meta, _, _ = data(f)
        layouts = inventory(root)[1]
        rep = layouts.get(meta.get('variantOf') or f, {})
        family = [m['f'] for m in rep.get('variants', [])] or [f]
        context = ' '.join(str(meta.get(k) or '') for k in ('name', 'when', 'g'))
        inds = meta.get('inds') or ([meta['ind']] if meta.get('ind') else [])
        return layout_images.related(root, store(), f, slot, src[:400], ratio if 0.1 < ratio < 10 else 0, q[:80], max(0, min(offset, 5000)),
                                     family, context, inds)

    # 모델 입력 — every model call of this sheet's saved flow on a sample input, as sent (stand-ins answer; nothing is called)
    @router.get('/{f}/flow/trace')
    async def flow_trace(f: str, industry: str = ''):
        _, meta, _, edits = data(f)
        try:
            snapshot = experiments.context(f, meta, inventory(root)[2][f], edits)
            result = await run_in_threadpool(layout_trace.trace, snapshot, industry or None)
        except (ValueError, KeyError) as exc:
            raise HTTPException(422, str(exc)) from None
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})

    @router.put('/{f}/flow')
    async def save_flow(f: str, request: Request):
        value = await body(request)
        data(f)
        try:
            saved = flows.save_flow(f, value.get('flow'), value.get('rev'), actor())
        except flows.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        result = flows.view(f)
        store().event('layout-flow.update', result['key'], {'rev': saved['rev'], 'f': f, 'edited': result['edited'],
                                                            'modules': [n['module'] for n in result['flow']['nodes']],
                                                            'inputs': [i['param'] for i in result['flow']['inputs']]}, actor())
        return result

    @router.delete('/{f}/flow')
    async def reset_flow(f: str, request: Request):
        value = await body(request)
        data(f)
        try:
            saved = flows.reset_flow(f, value.get('rev'), actor())
        except flows.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        result = flows.view(f)
        store().event('layout-flow.reset', result['key'], {'rev': saved['rev'], 'f': f}, actor())
        return result

    # ---- 칸 설계 (레이아웃별 칸 역할 · 그대로 둠 · 숫자만) — app/api/layout_cells.py · layout_flows.save_cells
    @router.put('/{f}/cells')
    async def save_cells(f: str, request: Request):
        value = await body(request)
        data(f)
        try:
            saved = flows.save_cells(f, value.get('cells'), value.get('rev'), actor())
        except flows.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        result = flows.view(f)
        store().event('layout-cells.update', result['key'], {'rev': saved['rev'], 'f': f, 'cells': result['cells']['edited']}, actor())
        return result

    @router.get('/{f}')
    def get(f: str):
        return detail(f)

    async def body(request):
        raw = await request.body()
        if len(raw) > 512 * 1024:
            raise HTTPException(413, '수정 값이 너무 큽니다.')
        try:
            value = json.loads(raw)
        except ValueError:
            raise HTTPException(422, '수정 값을 읽지 못했습니다.') from None
        if not isinstance(value, dict) or value.get('confirmed') is not True:
            raise HTTPException(422, '변경 내용을 확인한 뒤 반영해 주세요.')
        return value

    @router.put('/{f}')
    async def update(f: str, request: Request):
        value = await body(request)
        state, meta, html, previous = data(f)
        if meta.get('compositionOnly'):
            raise HTTPException(409, '구성 관리에서 정의한 레이아웃입니다.')
        if previous.get('deleted') or meta.get('removed'):
            raise HTTPException(409, '삭제한 레이아웃입니다.')
        try:
            # Values are sparse overrides against the original base, not a new HTML document.
            raw_html = live.base(root)[2][f]
            item = live.clean(value, raw_html, live.read(root / 'app/data/runtime/kb/parts.json')['PARTS'])
            if live.design_html(previous):
                item['design'] = previous['design']  # 글 · 칸 정책 저장은 올린 디자인을 그대로 둔다
            if item['img']:
                _, manifest = preview(f, live.apply_html(raw_html, item))
                for address in item['img'].values():
                    resource = next((r for r in manifest.items.values() if address in r['_addresses']), None)
                    if not resource or not resource['available']:
                        raise ValueError('이미지를 찾지 못했습니다. 이미지 주소와 미리보기를 확인해 주세요.')
            layouts = live.base(root)[1]
            representative = layouts.get(meta.get('variantOf') or f, {})
            family = [m['f'] for m in representative.get('variants', [])] or [f]
            policy_changed = live.policy(item) != live.policy(previous)
            saved = live.save(f, item, value.get('rev'), actor(), policy_family=family)
        except live.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, str(exc)) from None
        store().event('layout-library.update', f, {'rev': saved['rev'], 'fields': list(item['meta']),
                                                  'text': list(item['t']), 'images': list(item['img']), 'modes': item['modes'], 'fill': item['fill'],
                                                  'policy_family': family if policy_changed else []}, actor())
        return detail(f)

    # ---- 디자인 코드: 내려받기(Export) → code agent 가 고침 → 올리기(Upload) → 지금 디자인과 비교 → 고르기
    def design_target(f):
        state, meta, _, previous = data(f)
        if meta.get('compositionOnly'):
            raise HTTPException(409, '구성 관리에서 정의한 레이아웃입니다.')
        if previous.get('deleted') or meta.get('removed'):
            raise HTTPException(409, '삭제한 레이아웃입니다.')
        base_html = inventory(root)[2][f]
        return state, meta, previous, base_html, live.design_html(previous) or base_html

    @router.get('/{f}/design')
    def design_export(f: str, request: Request):
        _, meta, previous, _, current = design_target(f)
        name = (previous.get('meta') or {}).get('name') or meta.get('name') or f
        text = live.design_export(f, name, current, str(request.base_url))
        return Response(text, media_type='text/html; charset=utf-8', headers={
            'Content-Disposition': f'attachment; filename="{f}.design.html"', 'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; sandbox"})

    async def design_upload(f, request):
        raw = await request.body()
        if len(raw) > 600 * 1024:
            raise HTTPException(413, '올린 파일이 너무 큽니다.')
        try:
            value = json.loads(raw)
        except ValueError:
            raise HTTPException(422, '올린 내용을 읽지 못했습니다.') from None
        if not isinstance(value, dict) or not isinstance(value.get('html'), str):
            raise HTTPException(422, '디자인 파일(html)을 올려 주세요.')
        state, meta, previous, base_html, current = design_target(f)
        try:
            html, report = live.design_check(value['html'], base_html, current)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return value, state, previous, html, report

    @router.post('/{f}/design/check')
    async def design_check(f: str, request: Request):
        _, state, previous, html, report = await design_upload(f, request)
        edits = {k: v for k, v in previous.items() if k != 'design'}
        return JSONResponse({'rev': state['rev'], 'report': report,
                             'current': preview(f, live.apply_html(inventory(root)[2][f], previous))[0],
                             'upload': preview(f, live.apply_html(html, edits))[0]}, headers={'Cache-Control': 'no-store'})

    @router.put('/{f}/design')
    async def design_adopt(f: str, request: Request):
        value, _, previous, html, report = await design_upload(f, request)
        if value.get('confirmed') is not True:
            raise HTTPException(422, '비교한 뒤 적용해 주세요.')
        name = str(value.get('name') or '')[:120]
        item = {k: v for k, v in previous.items() if k not in ('design', 'updated_at', 'updated_by')}
        item['design'] = {'html': html, 'version': report['version'], 'name': name,
                          'updated_at': datetime.now(timezone.utc).isoformat(), 'updated_by': actor()}
        try:
            saved = live.save(f, item, value.get('rev'), actor())
        except live.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        store().event('layout-library.design', f, {'rev': saved['rev'], 'version': report['version'], 'previous': report['current'], 'file': name}, actor())
        return detail(f)

    @router.delete('/{f}/design')
    async def design_reset(f: str, request: Request):
        value = await body(request)
        _, _, previous, _, _ = design_target(f)
        if not live.design_html(previous):
            raise HTTPException(409, '올린 디자인이 없습니다.')
        item = {k: v for k, v in previous.items() if k not in ('design', 'updated_at', 'updated_by')}
        try:
            saved = live.save(f, item, value.get('rev'), actor())
        except live.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        store().event('layout-library.design-reset', f, {'rev': saved['rev'], 'version': previous['design'].get('version')}, actor())
        return detail(f)

    @router.delete('/{f}')
    async def delete(f: str, request: Request):
        value = await body(request)
        _, _, _, previous = data(f)
        try:
            protected = live.protected_layouts(root)
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, '구성의 레이아웃 사용처를 확인하지 못했습니다.') from None
        if f in protected:
            raise HTTPException(409, '레이아웃 구성 관리에서 사용하는 레이아웃은 삭제할 수 없습니다.')
        try:
            saved = live.save(f, {**previous, 'deleted': True}, value.get('rev'), actor())
        except live.Conflict as exc:
            raise HTTPException(409, str(exc)) from None
        store().event('layout-library.delete', f, {'rev': saved['rev']}, actor())
        return {'rev': saved['rev'], 'deleted': f}

    def example_html(f, scenario, page):
        example = next((u for u in usage(f) if u['scenario'] == scenario and u['page'] == page), None)
        if not example:
            raise HTTPException(404, '이 레이아웃의 사용 예시가 아닙니다.')
        _, _, html, _ = data(example['f'])
        try:
            examples = live.read(root / 'app/data/runtime/kb/layout_examples.json.gz')
        except FileNotFoundError:
            raise HTTPException(503, '사용 예시 데이터를 준비해 주세요: node app/scripts/export_agent_data.mjs') from None
        fills = examples.get('fills', {}).get(scenario, [])
        ov = copy.deepcopy(fills[page] if page < len(fills) and fills[page].get('f') == example['f'] else {})
        for image in ov.get('img', {}).values():
            if isinstance(image, dict) and image.get('src'):
                image['src'] = examples.get('legacy_images', {}).get(image['src'], image['src'])
        bg = examples.get('backgrounds', {}).get(scenario)
        background = bg['pack'] + '#' + str(bg.get('map', list(range(bg['n'])))[page]) if bg and page < bg['n'] else None
        return sample_html(html, ov, background, page + 1)

    @router.get('/{f}/examples/{scenario}/{page}/preview')
    def example(f: str, scenario: str, page: int):
        prefix = f'/admin/api/layout-library/{f}/examples/{scenario}/{page}'
        return {'html': preview(f, example_html(f, scenario, page), prefix)[0]}

    @router.get('/{f}/examples/{scenario}/{page}/resource/{rid}')
    def example_resource(f: str, scenario: str, page: int, rid: str):
        manifest = preview(f, example_html(f, scenario, page))[1]
        item = manifest.items.get(rid)
        if not item or item['kind'] != 'image' or not item['available']:
            raise HTTPException(404, '예시의 이미지를 찾지 못했습니다.')
        if item['availability'] == 'external':
            from fastapi.responses import RedirectResponse
            return RedirectResponse(item['address'], 303)
        raw, mime = resource_bytes(item)
        return Response(raw, media_type=mime, headers={'Content-Security-Policy': "default-src 'none'; sandbox"})

    return router
