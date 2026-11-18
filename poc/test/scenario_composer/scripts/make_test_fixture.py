"""A small, self-contained slice of the composer library + one 레이아웃 자동 구성 request, for the offline unit tests.

    python scripts/make_test_fixture.py [out.json]        # default: app/tests/fixtures/compose_auto.json

The slice holds what one 표준 제안서 deck of one vertical needs (its layouts and their count variants, the linked
products / solutions / cases, the pictures those slides and the candidate search can reach) — a few hundred KB instead of
the 18 MB library, so ``app/tests/test_compose_auto.py`` runs without the KB, node or the network.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from composer.library import ROOT, load  # noqa: E402
from composer.pictures import norm_src, own_cuts, product_cut  # noqa: E402
from eval.tpl_cases import build_cases, template_decks  # noqa: E402

CASE = 'cafe_std'
EXTRA_LAYOUTS = ['L_TOC_UAPAIN', 'L_TOC_SUMMARY'] + [f'L_VS_BIRD_S{n}' for n in (3, 4, 5, 6)] + [f'L_VS_MAP_{n}' for n in (3, 4, 5, 6)] \
    + [f'L_VS_DIV_R{n}' for n in range(1, 7)] + [f'L_TOC_INDEX{n}' for n in range(4, 9)] \
    + ['L_TOC_TECH2', 'L_TOC_TECH3', 'L_TOC_TECH4', 'L_TOC_KPI', 'L_TOC_PFEAT', 'L_TOC_VP3', 'L_TOC_PSPEC', 'L_TOC_CPWIN'] + [f'L_TOC_JOURNEY{n}' for n in ('1', '1S', '2', '2S', '3', '3S')]
# parts of other templates for the same vertical — the tests append them to the standard deck (핵심 기술 · 기대 효과 · Value Prop 상세 · 유관사례 · 공간별 가치 제안 · 당사의 이해 · 제품 사양)
EXTRA_PARTS = [('roi', 'tech'), ('roi', 'effect'), ('prod', 'vpd'), ('prod', 'pcase'), ('space', 'value'), ('roi', 'ua'), ('build', 'spec')]
EXTRA_CASES = ['16']  # a hospital case — unrelated to a café deck


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'app' / 'tests' / 'fixtures' / 'compose_auto.json'
    lib = load()
    case = build_cases([CASE])[0]
    body = case['body']
    ctx = body['proposal']['ctx']
    decks = template_decks([(t, case['vid']) for t, _ in EXTRA_PARTS])
    extra_parts = {}
    for t, toc in EXTRA_PARTS:
        part = next(p for p in decks[f"{t}:{case['vid']}"]['parts'] if p['toc'] == toc)
        extra_parts[toc] = {'id': f'x_{toc}', 'type': part['type'], 'name': part['name'], 'toc': toc, 'goal': part['goal'], 'items': part['items'], 'src': None, 'deck': False,
                            'exemplar': [{'f': x['f'], 'role': x['role'], 't': x['t'], 'img': x['img']} for x in part['exemplar']]}
    fs = ({x['f'] for p in body['parts'] for x in p['exemplar']} | {x['f'] for p in extra_parts.values() for x in p['exemplar']} | set(EXTRA_LAYOUTS)
          | {f for f in lib['layouts'] if f.startswith('L_VS_SOL_')})
    layouts = {}
    for f in sorted(fs):
        l = lib['layouts'].get(f)
        if not l:
            continue
        layouts[f] = {**{k: l.get(k) for k in ('f', 'code', 'name', 'p', 'p2', 'ind', 'sol', 'retired', 'cover', 'fam', 'pc', 'modes')}, 'when': '', 'g': '', 'static': [],
                      'texts': [{k: t.get(k) for k in ('i', 'o', 'role', 'text', 'img', 'x', 'y', 'w', 'h', 'font')} for t in l['texts']],
                      'images': [{k: im.get(k) for k in ('i', 'o', 'kind', 'hint', 'w', 'h', 'fit', 'sample', 'alt', 'tb', 'x', 'y')} for im in l['images']]}
    cases = set(ctx['cases']) | set(EXTRA_CASES)
    exemplars = {}
    for key, e in lib['exemplars'].items():
        if e['f'] == 'L_VS_CASE' and any(str(lib['cases'][c].get('cust')) in str((e.get('t') or {}).get('1')) for c in ctx['cases']) and len([k for k in exemplars if exemplars[k]['f'] == 'L_VS_CASE']) < 3:
            exemplars[key] = e
        elif e['f'] in ('L_VS_SOL_MAGIC', 'L_VS_SOL_STP', 'L_VS_SOL_VXT') and e['sid'].startswith('bs_std_fb') and not any(x['f'] == e['f'] for x in exemplars.values()):
            exemplars[key] = e
        elif e['f'] == 'L_VS_SPACE' and e['sid'] == 'bs_std_fb_cafe':
            exemplars[key] = e  # product sheets the composer falls back on when a part loses its solution sheets
    no_pic = set(own_cuts('kiosk')) | {product_cut('kiosk')}  # 'kiosk' keeps no picture: the no-picture path is tested
    for p in extra_parts.values():
        for x in p['exemplar']:
            x['img'] = {k: v for k, v in (x.get('img') or {}).items() if norm_src(v) not in no_pic}
    srcs = set()
    for p in list(body['parts']) + list(extra_parts.values()):
        for x in p['exemplar']:
            srcs |= {norm_src(v) for v in (x.get('img') or {}).values()}
    for e in exemplars.values():
        srcs |= {norm_src(v) for v in (e.get('img') or {}).values() if isinstance(v, dict)}
    for pid in ctx['products']:
        srcs |= set(own_cuts(pid)) | ({product_cut(pid)} if pid != 'kiosk' else set())  # 'kiosk' keeps no picture: the no-picture path is tested
    n_scene = 0
    for src, it in lib['images'].items():
        if it.get('group') == 'media-sol' and set(it.get('solutions') or []) & set(ctx['solutions']):
            srcs.add(src)
        elif it.get('case') is not None and str(it['case']) in cases:
            srcs.add(src)
        elif it.get('cls') in ('scene', 'kv') and 'FB' in (it.get('ind_primary') or []) and it.get('group') != 'bs' and n_scene < 140:
            srcs.add(src)
            n_scene += 1
    for v in lib['verticals'].values():
        if v['id'].startswith('fb_'):
            srcs |= {s['ph'] for s in v['spaces'] if s.get('ph')}
    images = {}
    for src in sorted(s for s in srcs if s and s in lib['images']):
        it = lib['images'][src]
        images[src] = {**{k: it.get(k) for k in ('src', 'desc', 'kind', 'cls', 'group', 'products', 'solutions', 'case', 'cust', 'w', 'h', 'ind_primary', 'place', 'neutral',
                                                  'items', 'items_how', 'shows', 'item_fams')},
                       **({'vf': it['vf']} if it.get('vf') else {}),
                       'names': (it.get('names') or [])[:2], 'spaces': (it.get('spaces') or [])[:5], 'inds': it.get('inds') or {},
                       'scen': [x for x in it.get('scen') or [] if x.startswith('bs_std_fb')], 'usage': []}
        if it.get('case') is not None:
            cases.add(str(it['case']))
    cards = [{k: c.get(k) for k in ('id', 'group', 'family', 'customer', 'ind', 'title')} for c in lib['scenarios']
             if c['id'] in ('bs01', 'bs02', 'bs07') or c['id'].startswith('bs_std_fb')]
    small = {
        'version': lib['version'], 'parts': lib['parts'], 'enums': lib['enums'], 'industries': lib['industries'], 'layouts': layouts, 'families': {},
        'scenarios': cards, 'modules': [], 'exemplars': exemplars, 'images': images,
        'item_keys': {k: v for k, v in (lib.get('item_keys') or {}).items() if k in ctx['products'] or k in ('qm65c', 'kiosk')},
        'products': {k: v for k, v in lib['products'].items() if k in ctx['products']},
        'products_all': {k: v for k, v in lib['products_all'].items() if k in ctx['products'] or k in ('qm65c', 'kiosk')},
        'solutions': lib['solutions'], 'cases': {k: v for k, v in lib['cases'].items() if k in cases},
        'verticals': {k: v for k, v in lib['verticals'].items() if k.startswith('fb_')}, 'sol_layouts': lib['sol_layouts'],
        'sol_keys': lib['sol_keys'], 'toc_slots': {f: v for f, v in lib['toc_slots'].items() if f in layouts},
        'sol_tech': {sid: {v: b for v, b in blocks.items() if v.startswith('fb_') or v in ('rt_mall', 'ht_large')} for sid, blocks in lib['sol_tech'].items()},
    }
    req = {k: body[k] for k in ('template', 'parts', 'space_plan', 'requirement_context', 'used_layouts')}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({'note': 'generated by poc/test/scenario_composer/scripts/make_test_fixture.py — do not edit', 'library': small,
                               'proposal': body['proposal'], 'body': req, 'extra_parts': extra_parts}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('ok', out, round(out.stat().st_size / 1024), 'KB', 'layouts', len(layouts), 'images', len(images), 'exemplars', len(exemplars))


if __name__ == '__main__':
    main()
