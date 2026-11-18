"""One-sheet experiments using the real composer, entirely in request memory."""
import copy
from datetime import date
import json

from .. import layout_flows as flows, layout_library as live, telemetry
from . import layout_snapshot, compose_grounding as grounding
from .adapters.compose import _auto
from .provider import get_provider, ProviderError
from .settings import get_settings


PICTURE_INPUTS = ('vertical', 'requirement_text', 'product_ids', 'solution_ids', 'case_ids', 'space_list', 'used_pictures')
# Pages of existing proposals. Each supplies both the original sheet and its customer's context.
PICTURE_SAMPLES = ('bs01:0', 'bs02:0', 'bs_v_ai_office_1:7', 'bs_v_ai_apartment_1:7', 'bs_v_ai_office_1:12')


def picture_samples(f=None, layout_name=None):
    lib = _auto(grounded=True).load()
    scenarios = {s['id']: s for s in lib['scenarios']}
    keys = list(PICTURE_SAMPLES)
    if f and (f in lib['layouts'] or layout_name) and not any(lib['exemplars'].get(k, {}).get('f') == f for k in keys):
        keys.insert(0, next((k for k, ex in lib['exemplars'].items() if ex['f'] == f), 'layout:' + f))
    items = []
    for key in keys:
        ex = lib['exemplars'].get(key)
        if not ex:
            if key.startswith('layout:'):
                items.append({'id': key, 'f': f, 'label': layout_name or lib['layouts'][f]['name']})
            continue
        scenario = scenarios[ex['sid']]
        items.append({'id': key, 'f': ex['f'], 'label': scenario['customer'] + ' · ' + ex['role']})
    return items


def picture_example(f, key, layout_name=None):
    lib = _auto(grounded=True).load()
    if key == 'layout:' + f:
        ex, sc = {}, {}
    else:
        ex = lib['exemplars'].get(key) if isinstance(key, str) else None
        if not ex or ex['f'] != f:
            raise ValueError('선택한 레이아웃의 예시 시트를 확인해 주세요.')
        sc = next(s for s in lib['scenarios'] if s['id'] == ex['sid'])
    context = {'customer_name': sc.get('customer', ''), 'project_title': sc.get('title') or layout_name or lib['layouts'][f]['name'],
               'industry': sc.get('ind') or 'OF', 'vertical': sc.get('vertical') or '', 'requirement_text': sc.get('situation', ''),
               'product_ids': list(sc.get('products') or []), 'solution_ids': list(sc.get('solutions') or []),
               'case_ids': list(sc.get('cases') or []), 'space_list': [], 'used_pictures': []}
    if f == 'L_VS_SPACE' and ex:
        name = ex['role'].split(' — ')[0]
        shown = {p for im in ex['img'].values() for p in lib['images'].get(im.get('src'), {}).get('products', [])}
        context['product_ids'].sort(key=lambda p: p not in shown)
        context['space_list'] = [{'id': 'space-1', 'name': name, 'products': [p for p in context['product_ids'] if p in shown]}]
    return ex, context


def context(f, meta, raw_html, draft=None, flow=None):
    composition_fixed = meta.get('compositionOnly') and meta.get('fx') == 'fixed'
    item = live.clean(draft or {}, raw_html, live.read(live.ROOT / 'app/data/runtime/kb/parts.json')['PARTS'])
    html = live.apply_html(raw_html, item)
    meta = live.apply_meta(meta, item, html)
    fill = item.get('fill', 'inherit')
    if composition_fixed and fill == 'inherit':
        fill = 'fixed'
        item['fill'] = 'fixed'
    slots = live.slots(html)
    base = flows.base_flow(f, meta, slots, fill)
    raw = flow or ({'inputs': base['inputs'], 'nodes': base['nodes']} if meta.get('compositionOnly') else flows.flow_for(f)['flow'])
    # A draft may lock the entire sheet while the open manager still displays its
    # element flow. Validate that snapshot against the sheet's real element plan;
    # execution then preserves all locked cells without calling the model.
    if not base.get('elements') and any(n.get('module') == 'element' for n in raw.get('nodes', [])):
        from ..layout_elements import plan_for
        base['elements'] = plan_for(f)
    effective = flows.normalize(raw, base['kind'], flows.source_map(), base)
    view = {'flow': effective, 'base': {'inputs': base['inputs'], 'nodes': base['nodes']}, 'kind': base['kind'],
            'kind_label': flows.KIND_LABELS.get(base['kind'], base['kind']), 'edited': True,
            'whole_fixed': base['whole_fixed'], 'modules': flows.MODULES, 'sources': flows.sources(), 'tools': flows.tools(),
            'elements': base.get('elements'),
            'logic': flows.logic_for(base['kind'], effective, base['modes']),
            'io': flows.io_for(base['kind'], effective, slots, base.get('elements'), base['whole_fixed'])}
    return {'f': f, 'meta': meta, 'html': html, 'item': item, 'slots': slots, 'view': view}


def industries():
    return [{'code': i['code'], 'name': i['name']} for i in live.base()[0]['industries']]


def samples(snapshot, industry):
    """Five editable scenarios, grounded in the selected industry's actual catalog."""
    auto = _auto(grounded=True)
    lib = auto.load()
    ind = next((i for i in lib['industries'] if i['code'] == industry), None)
    if not ind:
        raise ValueError('업종을 선택해 주세요.')
    verticals = [v for v in lib['verticals'].values() if v['ind'] == industry]
    objectives = ['신규 도입', '기존 환경 개선', '다점포 확장', '운영 효율 개선', '예산·설치 제약 검토']
    requests = ['새 공간의 고객 동선과 운영 방식에 맞는 적용안을 설명해 주세요.',
                '기존 설비를 활용하면서 고객 불편을 줄이는 개선안을 설명해 주세요.',
                '지점별 환경 차이를 고려한 공통 운영과 적용 조건을 설명해 주세요.',
                '현장 담당자의 반복 작업을 줄이고 관리 책임을 구분해 주세요.',
                '예산은 미확정이며 영업 중단을 최소화해야 합니다. 설치 전 확인 조건을 설명해 주세요.']
    catalog = flows.source_map()
    result = []
    for n, objective in enumerate(objectives):
        v = verticals[n % len(verticals)] if verticals else {'name': ind['name'], 'spaces': []}
        spaces = v.get('spaces', [])[:3]
        cats = {c for s in spaces for c in s.get('cats', [])}
        candidates = [(k, p) for k, p in lib['products'].items() if p.get('cat') in cats]
        if not candidates:   # spaces whose categories match no curated product: the industry's own catalog products
            candidates = [(k, p) for k, p in lib['products'].items() if industry in (p.get('ind') or [])] \
                or [(k, p) for k, p in lib['products_all'].items() if industry in (p.get('ind') or []) and p.get('model')]
        products = [k for k, _ in candidates[n:n + 3] or candidates[:3]]
        cases = [k for k, c in lib['cases'].items() if industry in (c.get('ind') or [])][:2]
        solutions = [k for k, s in lib['solutions'].items() if industry in (s.get('ind') or [])][:2]
        title = f"{v['name']} · {objective}"
        text = f"{v['name']}의 {', '.join(s['name'] for s in spaces) or '주요 공간'}을 검토합니다. {requests[n]}"
        points = [{'id': 'R1', 'text': text, 'kind': 'requirement'}]
        values = {'customer_name': f'샘플 고객 {n + 1}', 'project_title': title, 'industry': industry,
                  'vertical': v.get('id', ''), 'requirement_summary': {'summary': text, 'points': points}, 'requirement_text': text,
                  'requirement_points': points, 'part_directive': {'message': f"{snapshot['meta']['name']} 구성 안에서 {objective}의 핵심을 설명", 'scope': text},
                  'deck_thesis': title, 'product_ids': products, 'solution_ids': solutions, 'case_ids': cases,
                  'space_list': [{'id': s['id'], 'name': s['name'], 'products': products} for s in spaces],
                  'space_uses': [{'space': s['name'], 'use': objective} for s in spaces],
                  'section_index': [{'no': 1, 'name': snapshot['meta']['name']}], 'neighbor_parts': [],
                  'proposal_date': date.today().isoformat(), 'used_pictures': [], 'template_exemplar': {},
                  'challenges': [requests[n]], 'decision_criteria': ind.get('top', [])[:3],
                  'budget': '미확정 · 협의 필요', 'market_evidence': [], 'birdseye': ''}
        inputs = {k: values[k] for k in ('customer_name', 'project_title', 'industry')}
        for field in snapshot['view']['flow']['inputs']:
            key = field['source']
            typ = catalog[key]['type']
            default = [] if typ.endswith('[]') else {} if typ == 'object' else ''
            inputs[field['param']] = copy.deepcopy(values.get(key, default))
        result.append({'id': str(n + 1), 'label': objective, 'input': inputs})
    return result


def inputs_of(snapshot, inputs):
    if not isinstance(inputs, dict) or len(json.dumps(inputs, ensure_ascii=False)) > 40000:
        raise ValueError('샘플 입력은 40,000자 이하의 JSON 객체여야 합니다.')
    fields = snapshot['view']['flow']['inputs']
    common = {'customer_name', 'project_title', 'industry'}
    if set(inputs) - common - {i['param'] for i in fields}:
        raise ValueError('현재 흐름에 없는 입력 항목이 있습니다.')
    values = {k: inputs.get(k, '') for k in common}
    if any(not isinstance(v, str) for v in values.values()):
        raise ValueError('고객사·제안 제목·업종은 문자열이어야 합니다.')
    cat = flows.source_map()
    for field in fields:
        value = inputs.get(field['param'])
        typ = cat[field['source']]['type']
        if value is None:
            if field['required']:
                raise ValueError(f"{cat[field['source']]['label']} 입력이 필요합니다.")
            continue
        valid = isinstance(value, list) if typ.endswith('[]') else isinstance(value, dict) if typ == 'object' else isinstance(value, str)
        if not valid:
            raise ValueError(f"{cat[field['source']]['label']} 입력 형식은 {typ}입니다.")
        if typ in ('id[]', 'string[]') and any(not isinstance(x, str) for x in value):
            raise ValueError(f"{cat[field['source']]['label']}에는 문자열 목록을 입력해 주세요.")
        if typ == 'object[]' and any(not isinstance(x, dict) for x in value):
            raise ValueError(f"{cat[field['source']]['label']}에는 객체 목록을 입력해 주세요.")
        values[field['source']] = value
    if values.get('industry') not in {i['code'] for i in industries()}:
        raise ValueError('업종 코드가 올바르지 않습니다.')
    return values


def _text(value):
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


class _Provider:
    def __init__(self, cancel):
        self.provider, reason = get_provider(get_settings())
        if self.provider is None:
            raise ProviderError(reason, 'AI 연결 설정을 확인해 주세요.')
        self.model, self.cancel = self.provider.model, cancel

    def generate_json(self, **kwargs):
        self.cancel()
        return self.provider.generate_json(**{**kwargs, 'cancel': self.cancel, 'cache_allowed': False})


def run(snapshot, inputs, cancel=lambda: None, branch='auto', provider=None, decisions=None, *, pictures=None):
    """branch: 'auto' — the decision-capable nodes (layout.cells · layout.verify · layout.pictures) take the decision model when the
    settings say so, as in a real composition · 'llm' — every node asks the LLM.
    provider · decisions: stand-ins instead of the app provider and the settings' decision clients ({task: client}) —
    layout_trace records what each step sends without calling a model."""
    if pictures is None:
        values = inputs_of(snapshot, inputs)
    else:
        fields = [{'param': k, 'source': k, 'required': False} for k in PICTURE_INPUTS]
        values = inputs_of({'view': {'flow': {'inputs': fields}}}, inputs)
    auto = _auto(grounded=True)
    from composer import library, llm as model
    baseline = auto.load()
    f, view = snapshot['f'], snapshot['view']
    entry = library.build_layouts({'layouts': [snapshot['meta']]}, {f: snapshot['html']})[f]
    entry['modes'] = {'t': {}, 'img': {}, 'lock': 'fixed' if view['whole_fixed'] else 'ai'}
    for slot in snapshot['slots']:
        entry['modes'][slot['kind']][slot['id']] = slot['mode']
    # Only this request sees draft geometry, text and locks, including supplemental sheets.
    lib = {**baseline, 'layouts': {**baseline['layouts'], f: entry}}
    scoped = {'library': lib, 'items': {f: snapshot['item']}, 'flows': {f: view}}
    with telemetry.scope(ephemeral=True), layout_snapshot.use(scoped):
        cancel()
        text = _text(values.get('requirement_text') or values.get('requirement_summary') or values.get('part_directive') or values['project_title'])
        ids = {k: values.get(source, []) for k, source in [('products', 'product_ids'), ('solutions', 'solution_ids'), ('cases', 'case_ids')]}
        for key, table in [('products', 'products_all'), ('solutions', 'solutions'), ('cases', 'cases')]:
            if any(x not in lib[table] for x in ids[key]):
                raise ValueError('입력의 DSS ID가 현재 카탈로그에 없습니다.')
        exemplar = {'f': f, 'role': snapshot['meta']['name'], 't': {str(x['i']): x['text'] for x in entry['texts']},
                    'img': {str(x['i']): {'src': x['sample'], 'keep': True} for x in entry['images'] if x.get('sample')}}
        if pictures is not None:
            sample = pictures['exemplar']
            exemplar.update(role=sample.get('role') or exemplar['role'], t={**exemplar['t'], **sample.get('t', {})},
                            img={**exemplar['img'], **sample.get('img', {})})
        part = {'id': 'experiment', 'name': snapshot['meta']['name'], 'type': snapshot['meta'].get('p') or 'free',
                'goal': _text(values.get('part_directive') or ''), 'exemplar': [exemplar]}
        pr = {'customer': values['customer_name'], 'title': values['project_title'], 'ind': values['industry'], 'free_text': text, **ids}
        body = {'parts': [part], 'template': {'vertical': values.get('vertical', '')}}
        ctx = auto.build_context(pr, body)
        if pictures is not None:
            ctx['image_weights'] = pictures['weights']
        ctx['layout_inputs'] = values
        ctx['summary'] = _text(values.get('requirement_summary') or '')
        ctx['spaces'] = [dict(x, products=x.get('products', ids['products'])) for x in values.get('space_list', []) if x.get('id') and x.get('name')]
        if any(not isinstance(x['products'], list) or any(p not in lib['products_all'] for p in x['products']) for x in ctx['spaces']):
            raise ValueError('공간에 연결한 제품 ID를 확인해 주세요.')
        ctx['space_by_id'] = {x['id']: x for x in ctx['spaces']}
        ctx['birdseye'] = values.get('birdseye') or None
        ctx['date'] = values.get('proposal_date') or ctx['date']
        part = ctx['parts'][0]
        raw_points = values.get('requirement_points') or [{'text': text}]
        points = [{'id': f'R{n + 1}', 'text': _text(x.get('text') or x), 'kind': 'requirement', 'products': ids['products'], 'solutions': ids['solutions']} for n, x in enumerate(raw_points)]
        directive = values.get('part_directive') or {}
        message = directive.get('message', _text(directive)) if isinstance(directive, dict) else directive
        pp = {'id': part['id'], 'message': message, 'point_ids': [x['id'] for x in points], 'points': [x['id'] for x in points],
              'raises': [], 'refs': [], 'avoid': [], **ids, 'spaces': list(ctx['space_by_id']),
              'brief': {'requirements': points, 'facts': grounding.evidence_catalog(auto, ctx), 'scope': text,
                        'market_evidence': values.get('market_evidence', [])}}
        plan = {'thesis': _text(values.get('deck_thesis') or values['project_title']), 'points': points, 'parts': [pp], 'fixes': []}
        outline = [{'no': n + 1, 'id': str(x.get('id') or part['id']), 'name': str(x.get('name') or part['name']), 'message': message, 'pages': [1, 1]}
                   for n, x in enumerate(values.get('section_index') or [{'name': part['name']}])]
        ctx.update(plan_by={part['id']: pp}, plan_points=points, grounded_plan=plan, outline=outline)
        bind = {'kind': view['kind'], **ids, 'spaces': list(ctx['space_by_id'])}
        for key in ('products', 'solutions', 'cases', 'spaces'):
            if bind[key]:
                bind[{'products': 'product', 'solutions': 'solution', 'cases': 'case', 'spaces': 'space'}[key]] = bind[key][0]
        sl = auto._mk(part['exemplar'][0], fixed=view['whole_fixed'], bind=bind, bind_same=False)
        sl['kind'] = view['kind']
        sl['part_brief'] = pp['brief']
        sl['part_message'] = message
        locks = {s['id']: s['value'] for s in snapshot['slots'] if s['kind'] == 't' and (view['whole_fixed'] or s['mode'] in flows.FIXED_MODES)}
        sl['lock'] = dict(locks)
        if not view['whole_fixed'] and pictures is None:
            binder = {'cover': auto._cover_lock, 'toc': auto._toc_lock, 'bird': auto._bird_lock,
                      'map': auto._map_lock, 'tech': auto._tech_lock}.get(view['kind'])
            bound = binder(ctx, sl) if binder else auto._bom_lock(ctx, sl, ids['products']) if view['kind'] == 'bom' else {}
            known = {s['id'] for s in snapshot['slots'] if s['kind'] == 't'}
            sl['lock'].update({k: v for k, v in bound.items() if k in known and isinstance(v, str) and k not in locks})
            grounding.bind_spec(auto, ctx, sl)
        needs_model = any(flows.MODULES[n['module']]['kind'] == 'llm' for n in view['flow']['nodes']) and not view['whole_fixed']
        if pictures is not None:
            needs_model = pictures['verify'] and flows.has(view['flow'], 'pictures') and not view['whole_fixed']
        engine = model.AppProviderLLM(provider or _Provider(cancel), cancel=cancel) if needs_model else None
        decided = []
        if engine is not None and decisions is not None:
            from . import layout_decide
            if branch != 'llm' and decisions:
                engine.decisions, engine.decision_on = dict(decisions), layout_decide.on
        elif engine is not None and branch != 'llm':
            from . import layout_decide
            sink = lambda rec: decided.append({k: rec[k] for k in ('stage', 'ms', 'questions', 'model')})  # noqa: E731
            layout_decide.attach(engine, get_settings(), wrap=lambda client, task: layout_decide.Bound(client, sink=lambda rec, task=task: sink({**rec, 'stage': f"{task} · {rec['stage']}"})))
        if pictures is not None:
            part['message'] = text
            sl.update(t=exemplar['t'], img=dict(exemplar['img']), _picture_trace=[])
            if flows.has(view['flow'], 'pictures') and not view['whole_fixed']:
                used = auto.PictureRegistry(values.get('used_pictures') or [])
                auto.fill_part_images(ctx, part, [sl], engine, used, verify=pictures['verify'], pick='rank')
            cancel()
            rows = []
            traced = {x['key']: x for x in sl['_picture_trace']}
            for slot in snapshot['slots']:
                if slot['kind'] != 'img':
                    continue
                key = slot['id']
                trace = traced.get(key, {})
                meta = sl.get('img_meta', {}).get(key, {})
                if view['whole_fixed'] or slot['mode'] in flows.FIXED_MODES or not flows.has(view['flow'], 'pictures'):
                    sl['img'][key] = exemplar['img'].get(key, {})
                    meta, trace = {'why': 'locked'}, {}
                value = sl['img'].get(key) or {}
                rows.append({'slot': key, 'kind': trace.get('kind') or slot.get('mode'), 'near': trace.get('near', ''),
                             'before': exemplar['img'].get(key, {}).get('src'), 'src': value.get('src'),
                             'hidden': bool(value.get('hidden')), 'why': meta.get('why', 'template_original'),
                             'verified': meta.get('verified'), 'candidates': trace.get('cands', [])})
            return {'ov': {'img': sl['img']}, 'matches': rows}
        auto.fill_part_text(ctx, plan, part, pp, [sl], engine)
        cancel()
        if flows.has(view['flow'], 'pictures') and not view['whole_fixed']:
            auto.fill_part_images(ctx, part, [sl], engine, auto.PictureRegistry(), verify=True, pick='rank')
        # the same last step as a real composition: nothing unselected named or pictured (enforce_linked), then the part check
        # it runs for sheets whose flow keeps 'verify' (the flow hooks drop the others from _part_checks)
        pending = ctx.get('_part_checks', {}).get(part['id'])
        if pending and not (flows.has(view['flow'], 'verify') and pending[2]):
            ctx['_part_checks'].pop(part['id'], None)
        auto.enforce_linked(ctx, part, [sl])
        cancel()
        sl.setdefault('t', {}).update(locks)
        # Image locks and template identity also survive any model/tool output.
        for slot in snapshot['slots']:
            if slot['kind'] == 'img' and (view['whole_fixed'] or slot['mode'] in flows.FIXED_MODES):
                sl.setdefault('img', {})[slot['id']] = {'src': slot['value'], 'keep': True}
        result = auto._layout_out(sl)
        result['ov']['t'].update(locks)
        return {'f': f, 'ov': result['ov'], 'issues': (sl.get('quality') or {}).get('issues', []) + sl.get('flow_notes', []),
                'decision': decided, 'decided': sl.get('decided') or {}, 'final': result.get('final')}
