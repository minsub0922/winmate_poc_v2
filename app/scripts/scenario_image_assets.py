#!/usr/bin/env python3
"""The published picture library as one index — what dedupe_scenario_images.mjs may choose a replacement from.

  cases     { id: { cust, ind, images: [{ src, kind, desc, w, h }] } }      samsung.com 도입사례 갤러리 (media.json)
  solutions { id: { name, images: [...] } }                                  솔루션 화면 · 구성도 · 키 비주얼
  products  { id: { name, images: [{ src, alt, kind }] } }                   제품 공식 컷 (products_db gal · galAlt)
  photos    [{ src, desc, ind, owner, w, h }]                                업종 참고사진(img/ph) · 추가 공식 사진
Printed as JSON on stdout."""
import json, sys
from proposal_content import ROOT, P, S, C, MEDIA, IMAGES

def rows(kind, ident):
    item = MEDIA['case' if kind == 'case' else 'sol'].get(str(ident))
    return [dict(src=MEDIA['P'][r[0] // 10000] + '#' + str(r[0] % 10000), kind=r[1], desc=r[2], w=r[3], h=r[4]) for r in (item or {}).get('g', [])]

out = {'cases': {}, 'solutions': {}, 'products': {}, 'photos': []}
for cid, c in C.items():
    g = rows('case', cid)
    if g:
        ind = c.get('ind')
        out['cases'][cid] = {'cust': c.get('cust', ''), 'ind': ind if isinstance(ind, list) else [ind] if ind else [], 'images': g}
for sid, s in S.items():
    g = rows('sol', sid)
    if g:
        out['solutions'][sid] = {'name': s['name'], 'images': g}
# catalog products (curated ids) and the full product DB (sg_* ids) — a deck may show either one's official cuts
ALL_PRODUCTS = {p['id']: p for p in json.loads((ROOT / 'app/data/products_db.json').read_text())['products']}
ALL_PRODUCTS.update(P)
for pid, p in ALL_PRODUCTS.items():
    gal = p.get('gal') or []
    if not gal:
        continue
    alts, kinds = p.get('galAlt') or [], p.get('galKind') or []
    out['products'][pid] = {'name': p['name'], 'model': p.get('model', ''),
                            'images': [{'src': src, 'alt': alts[i] if i < len(alts) else '', 'kind': kinds[i] if i < len(kinds) else ''} for i, src in enumerate(gal)]}
for key, im in IMAGES.items():
    if key.startswith('ph.') and im.get('file') and 'gray' not in key and (ROOT / 'app/data/static' / im['file']).is_file():
        out['photos'].append({'src': im['file'], 'desc': im.get('desc', ''), 'ind': key.split('.')[1].split('-')[0].upper(), 'owner': '삼성전자 공식 참고사진',
                              'w': im.get('w', 1000), 'h': im.get('h', 600), 'kind': im.get('kind', '')})
for name in ('proposal_photo_assets.json', 'account_photo_assets.json'):
    for im in json.loads((ROOT / 'app/web/src/domain/templates' / name).read_text()):
        if im.get('src') and im.get('w', 0) >= 400 and im.get('h', 0) >= 250:
            ind = im.get('ind')
            out['photos'].append({'src': im['src'], 'desc': im.get('desc', ''), 'ind': ind if isinstance(ind, str) else '', 'owner': im.get('owner', ''), 'w': im['w'], 'h': im['h'],
                                  'kind': im.get('kind', ''), 'case': im.get('case', '')})
json.dump(out, sys.stdout, ensure_ascii=False)
