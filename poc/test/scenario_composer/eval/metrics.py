"""Deck-level metrics — the same function scores the gold 샘플 버티컬 시나리오, the composer and the baseline.

Storyline   type_lcs · stage_lcs (order-aware similarity to the gold part sequence), flow_breaks, part counts,
            situation accuracy (requirement type · strategy · ending vs gold)
Layout      layout/family recall vs gold, violations: another industry's variant when this industry's exists or its fixed
            wording shows · a solution layout for a solution not picked · product grid with the wrong number of columns ·
            duplicate · retired
Pictures    every picture the viewer would see (override or the layout's own sample left in place): wrong industry
            (scene photo whose source industry is not the customer's) · product cut of a product not picked · picture class
            vs slot class · duplicates · not filled (layout sample shown)
Wording     visible text (override or the layout's sample text left in place): other customers' names · numbers no source
            gives · placeholders
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Dict, List, Optional, Sequence

from composer import context as ctxm
from composer.compose import PRODUCT_SERIES
from composer.fill import FIXED, GENERIC_NUMBERS, NUMTOK, PLACEHOLDER, brand_ok, plain, who
from composer.library import EXTRA_KW, load

STAGE_ORDER = ['open', 'context', 'problem', 'value', 'space', 'build', 'proof', 'plan', 'close']
_SERIES = {f: j + 1 for s in PRODUCT_SERIES for j, f in enumerate(s) if f}


def lcs(a: Sequence, b: Sequence) -> float:
    if not a or not b:
        return 0.0
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m):
        for j in range(n):
            dp[i + 1][j + 1] = dp[i][j] + 1 if a[i] == b[j] else max(dp[i][j + 1], dp[i + 1][j])
    return 2 * dp[m][n] / (m + n)


def _module_key(src: Optional[str]) -> Optional[str]:
    if not src:
        return None
    m = next((x for x in load()['modules'] if x['mid'] == src), None)
    return m['key'] if m else None


def visible_text(slide: dict) -> List[str]:
    L = load()['layouts'][slide['f']]
    t = slide.get('t') or {}
    out = []
    for x in L['texts']:
        v = t.get(str(x['i']))
        out.append(plain(v) if v is not None else x['text'])
    return out


def shown_images(slide: dict) -> List[dict]:
    """(slot, src, overridden?) for every picture slot of the slide."""
    L = load()['layouts'][slide['f']]
    img = slide.get('img') or {}
    out = []
    for im in L['images']:
        v = img.get(str(im['i'])) or (img.get('t' + str(im['tb'])) if im.get('tb') is not None else None)
        if isinstance(v, dict) and v.get('src'):
            out.append({'slot': im, 'src': v['src'], 'set': True})
        else:
            out.append({'slot': im, 'src': im.get('sample') or '', 'set': False})
    return out


def score(deck: List[dict], inp: dict, gold: Optional[dict] = None, analysis: Optional[dict] = None) -> Dict[str, float]:
    lib = load()
    L, IM = lib['layouts'], lib['images']
    inp = ctxm.normalize(inp)
    ind = inp.get('ind') or (analysis or {}).get('industry')
    parts = [p for p in deck if not p.get('deck') and p.get('type') != 'cover']
    slides = [s for p in deck for s in (p.get('slides') or [])]
    r: Dict[str, float] = {'parts': len(parts), 'slides': len(slides)}
    # ---------------- storyline
    stages = [p.get('key') or _module_key(p.get('src')) for p in parts]
    stages = [s for s in stages if s]
    r['flow_breaks'] = sum(1 for x, y in zip(stages, stages[1:]) if STAGE_ORDER.index(y) < STAGE_ORDER.index(x) - 1)
    if gold:
        gparts = [p for p in gold['parts'] if not p.get('deck') and p.get('type') != 'cover']
        r['type_lcs'] = round(lcs([p['type'] for p in gparts], [p['type'] for p in parts]), 3)
        r['stage_lcs'] = round(lcs([p['key'] for p in gparts], stages), 3)
        r['parts_gold'] = len(gparts)
        gs = [s for p in gold['parts'] for s in p['slides']]
        r['slides_gold'] = len(gs)
        gf = {s['f'] for s in gs}
        of = {s['f'] for s in slides}
        r['layout_recall'] = round(len(gf & of) / len(gf), 3) if gf else 0.0
        gfam = {L[f]['fam'] for f in gf}
        ofam = {L[f]['fam'] for f in of if f in L}
        r['family_recall'] = round(len(gfam & ofam) / len(gfam), 3) if gfam else 0.0
        card = gold['card']
        if analysis:
            r['req_ok'] = float(analysis.get('req_type') == card['req'])
            r['strategy_ok'] = float(analysis.get('strategy') == card['strategy'])
            r['ending_ok'] = float(analysis.get('ending') == card['ending'])
    # ---------------- layouts
    cnt = Counter(s['f'] for s in slides)
    v_ind = v_sol = v_pc = v_ret = 0
    n_prod = len(inp['products'])
    for s in slides:
        l = L.get(s['f'])
        if not l:
            continue
        if l.get('retired'):
            v_ret += 1
        if l.get('ind') and ind and l['ind'] != ind:
            fam = [x for x in lib['families'].get(l['fam'], []) if L[x].get('ind') == ind]
            static = ' '.join(l.get('static') or [])
            if fam or any(w in static for w in EXTRA_KW.get(l['ind'], [])):
                v_ind += 1
        if l.get('sol') and l['sol'] not in inp['solutions']:
            v_sol += 1
        if s['f'] in _SERIES and n_prod and _SERIES[s['f']] > n_prod:
            v_pc += 1  # empty product columns
    dup = sum(c - 1 for c in cnt.values() if c > 1)
    r.update({'lay_ind_violation': v_ind, 'lay_sol_violation': v_sol, 'lay_pc_violation': v_pc, 'lay_dup': dup, 'lay_retired': v_ret})
    r['layout_violation_rate'] = round((v_ind + v_sol + v_pc + dup + v_ret) / max(1, len(slides)), 3)
    # ---------------- pictures
    n = setn = bad_ind = bad_place = bad_prod = bad_cls = unknown = bad_brand = 0
    seen = Counter()
    for p, s in ((p, s) for p in deck for s in (p.get('slides') or [])):
        for x in shown_images(s):
            n += 1
            src = x['src']
            if x['set']:
                setn += 1
            if not src:
                continue
            seen[src] += 1
            it = IM.get(src)
            if not it:
                unknown += 1
                continue
            slot = x['slot']
            want_prod = slot.get('fit') == 'contain' or slot.get('kind') in ('cut', 'detail', 'kiosk', 'signage')
            if it['cls'] in ('scene', 'kv'):
                prim = it.get('ind_primary') or []
                if ind and prim and ind not in prim:
                    bad_ind += 1
                place = it.get('place') or []
                if ind and place and ind not in place:
                    bad_place += 1
                if want_prod:
                    bad_cls += 1
                if x['set'] and not brand_ok(src, who(inp), p.get('type') or ''):
                    bad_brand += 1  # another company's sign / exterior outside a case part
            if it['cls'] == 'product':
                if inp['products'] and not set(it['products']) & set(inp['products']):
                    bad_prod += 1
    img_dup = sum(c - 1 for c in seen.values() if c > 1)
    r.update({'img_slots': n, 'img_set': setn, 'img_unset': n - setn, 'img_ind_mismatch': bad_ind, 'img_place_mismatch': bad_place,
              'img_prod_mismatch': bad_prod, 'img_cls_mismatch': bad_cls, 'img_brand_misuse': bad_brand, 'img_dup': img_dup, 'img_unknown': unknown})
    r['img_ok_rate'] = round(1 - (bad_place + bad_prod + bad_cls) / max(1, n), 3)
    r['img_ok_rate_b'] = round(1 - (bad_place + bad_prod + bad_cls + bad_brand) / max(1, n), 3)  # + brand misuse
    # ---------------- wording
    allowed = ctxm.allowed_numbers(inp)
    banned = ctxm.forbidden_names(inp)
    leak = unsup = ph = 0
    leak_words = Counter()
    for s in slides:
        for v in visible_text(s):
            if FIXED.match(v.strip()) or re.fullmatch(r'CONFIDENTIAL\s*·\s*\d+', v.strip()):
                continue
            for b in banned:
                if b in v:
                    leak += 1
                    leak_words[b] += 1
            ph += len(PLACEHOLDER.findall(v))
            body = PLACEHOLDER.sub(' ', v)
            for m in NUMTOK.findall(body):
                k = m.replace(',', '').rstrip('.')
                if k in allowed or k in GENERIC_NUMBERS or re.fullmatch(r'20[2-3]\d', k) or (k.isdigit() and int(k) <= 12):
                    continue
                unsup += 1
    r.update({'txt_leak': leak, 'txt_unsupported_numbers': unsup, 'txt_placeholders': ph})
    r['_leak_top'] = ', '.join(f'{k}×{v}' for k, v in leak_words.most_common(3))
    return r
