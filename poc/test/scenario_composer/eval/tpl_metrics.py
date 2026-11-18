"""Deck metrics for the template-driven composer — the same function scores ``auto`` and today's ``complete()`` path.

Content    dup_strings (the same sentence in two parts) · dup_within · req_cov (customer requirement lines answered) ·
           req_parts (in how many parts one requirement is answered — ownership) · prod/sol/case coverage ·
           entity_multi (a solution / case with its own slide in two parts)
Flow       num_err (chapter numbers) · toc_err (목차 names) · div_err (간지 titles) · page_err
Wording    placeholders · other_names (other customers) · tpl_name (the template's sample customer) · guide (editorial
           notes) · sample_shown (a layout's own sample text left visible) · other_models (products not linked — the app's
           ``inspectLayoutContext`` check) · unsupported_numbers (written slots only)
Pictures   product slots: linked product shown (app check) · the product the text names · case / solution slides: that
           item's media · scenes: other industry · other sub-vertical · other brand · other product family · repeated ·
           space slides: the named space · empty slots · 조감도
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Dict, List, Optional, Set

from composer import context as ctxm
from composer.auto import CONF, DIV, EYEBROW, REPEATABLE, allowed_numbers, slide_kind, unlinked_in, unlinked_vocab
from composer.fill import FIXED, GENERIC_NUMBERS, GUIDE, NUMTOK, ORDINAL, PLACEHOLDER, brand_ok, plain
from composer.library import load
from composer.pictures import PRODUCT_KINDS, families, near_text, norm_src, own_cuts, sibling_conflict, std_space_photo, vf_reject
from composer.textsim import tokens

KEYS = ['slides', 'dup_strings', 'dup_within', 'dup_rate', 'req_cov', 'req_parts', 'req_multi', 'prod_cov', 'sol_cov', 'case_cov', 'entity_multi',
        'num_err', 'toc_err', 'div_err', 'page_err', 'placeholders', 'other_names', 'tpl_name', 'guide', 'sample_shown', 'other_models',
        'unsupported_numbers', 'unlinked', 'unchanged_rate',
        'img_slots', 'img_empty', 'prod_slots', 'prod_linked_rate', 'prod_named', 'prod_named_rate', 'case_slots', 'case_rate', 'sol_slots', 'sol_rate',
        'scene_slots', 'scene_other_ind', 'scene_sibling', 'scene_brand', 'scene_family', 'scene_dup', 'seen_brand', 'seen_place', 'seen_low',
        'space_slots', 'space_rate', 'bird_ok',
        'img_bad', 'img_fit_rate']


def _texts(layout: dict) -> List[tuple]:
    """(slot index, visible text, overridden?, mode) of a slide."""
    L = load()['layouts'].get(layout['f'])
    t = (layout.get('ov') or {}).get('t') or {}
    out = []
    if not L:
        return [(int(k) if str(k).isdigit() else -1, plain(v), True, 'ai') for k, v in t.items()]
    modes = (L.get('modes') or {}).get('t') or {}
    idx = set()
    for x in L['texts']:
        if x.get('img'):
            continue
        k = str(x['i'])
        idx.add(k)
        v = t.get(k)
        out.append((x['i'], plain(v) if v is not None else x['text'], v is not None, modes.get(k) or 'ai'))
    for k, v in t.items():
        if str(k) not in idx:
            out.append((int(k) if str(k).isdigit() else -1, plain(v), True, 'chrome'))
    return out


def _norm(s: str) -> str:
    return re.sub(r'[\s·,.\-—–“”"\'()]+', '', s)


def _grams(s: str) -> Set[str]:
    s = _norm(s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def score_deck(parts: List[dict], case: dict) -> Dict[str, float]:
    lib = load()
    L, IM, PA, S, C = lib['layouts'], lib['images'], lib['products_all'], lib['solutions'], lib['cases']
    body = case['body']
    pr = body['proposal']
    ctxp = pr['ctx']
    products = [p for p in ctxp['products'] if p in PA]
    solutions = [s for s in ctxp['solutions'] if s in S]
    cases = [c for c in ctxp['cases'] if c in C]
    vid = body['template']['vertical']
    V = lib['verticals'].get(vid) or {}
    ind = pr.get('ind') or V.get('ind')
    customer = pr.get('customer') or ''
    who = ' '.join([customer, pr.get('title') or ''])
    inp = case['input']
    banned = ctxm.forbidden_names({**ctxm.normalize(inp), 'cases': cases})
    tpl_cust = V.get('cust') or ''
    sp = body.get('space_plan') or {}
    spaces = sp.get('spaces') or []
    ctx = {'ind': ind, 'vertical': vid, 'who': who, 'space_by_id': {x['id']: x for x in spaces}, 'spaces': spaces, 'products': products, 'solutions': solutions,
           'short': {}, 'cases': cases}
    allowed = allowed_numbers({'inp': ctxm.normalize(inp), 'summary': '', 'date': '', 'products': products, 'solutions': solutions, 'cases': cases})
    exemplar = {}
    for p in body['parts']:
        for x in p['exemplar']:
            for k, v in (x.get('t') or {}).items():
                exemplar.setdefault(x['f'], set()).add(plain(v))
    body_parts = [p for p in parts if not p.get('deck')]
    r: Dict[str, float] = {'slides': sum(len(p['layouts']) for p in parts)}
    # ---------------------------------------------------------------- texts
    footer = Counter()
    per_part: List[List[tuple]] = []   # (slide index, kind, [(i, text, set, mode)])
    for p in parts:
        rows = []
        for n, x in enumerate(p['layouts']):
            tx = _texts(x)
            rows.append((n, slide_kind(x['f']), tx, x))
            for i, v, _, mode in tx:
                if mode == 'chrome':
                    footer[v] += 1
        per_part.append(rows)
    foot = {v for v, c in footer.items() if c >= 3}

    def content(v: str, mode: str) -> bool:
        v = v.strip()
        return (len(v) >= 14 and mode not in ('chrome', 'fixed', 'section') and v not in foot and not FIXED.match(v) and not CONF.match(v) and not ORDINAL.match(v))
    # names are not content: a product named in two parts is not the same thing told twice
    names_ = {_norm(str(x)) for x in [PA[q].get('name') for q in products] + [S[q].get('name') for q in solutions] + [C[q].get('cust') for q in cases]
              + [x_['name'] for x_ in spaces] + [x_['name'] for x_ in V.get('spaces') or []] if x}
    seen: Dict[str, Set[int]] = defaultdict(set)
    within = 0
    total_strings = 0
    part_text: List[str] = []
    for pi, rows in enumerate(per_part):
        p = parts[pi]
        mine: Dict[str, Set[int]] = defaultdict(set)
        blob = []
        for n, kind, tx, x in rows:
            for i, v, st, mode in tx:
                blob.append(v)
                if p.get('deck') or kind in ('divider', 'toc', 'static', 'cover') or not content(v, mode):
                    continue
                key = _norm(v)
                if key in names_ or any(key == n_ or (len(n_) >= 8 and key.replace(n_, '') in ('', )) for n_ in names_):
                    continue
                total_strings += 1
                mine[key].add(n)
                seen[key].add(pi)
        within += sum(1 for k, ns in mine.items() if len(ns) > 1)
        part_text.append(' '.join(blob))
    dup = sum(1 for k, ps in seen.items() if len(ps) > 1)
    # near-duplicates across parts (same sentence reworded lightly)
    keys = [(k, next(iter(ps))) for k, ps in seen.items() if len(ps) == 1 and len(k) >= 16]
    grams = [(_grams_cached(k), pi) for k, pi in keys]
    for a in range(len(grams)):
        ga, pa = grams[a]
        for b in range(a + 1, len(grams)):
            gb, pb = grams[b]
            if pa != pb and ga and gb and len(ga & gb) / len(ga | gb) >= 0.75:
                dup += 1
                break
    r['dup_strings'] = dup
    r['dup_within'] = within
    r['dup_rate'] = round(dup / max(1, total_strings), 3)
    # requirement lines → in which parts they are answered
    reqs = [q for k in inp.get('keymen') or [] for q in k['reqs']]
    ptok = [set(tokens(t)) for t in part_text]
    body_idx = [i for i, p in enumerate(parts) if not p.get('deck')]
    cov, owners = 0, []
    for q in reqs:
        qt = set(tokens(q))
        if not qt:
            continue
        hit = [i for i in body_idx if len(qt & ptok[i]) / len(qt) >= 0.5]
        cov += bool(hit)
        if hit:
            owners.append(len(hit))
    r['req_cov'] = round(cov / max(1, len(reqs)), 3)
    r['req_parts'] = round(sum(owners) / max(1, len(owners)), 2)
    r['req_multi'] = sum(1 for n in owners if n >= 3)
    all_text = ' '.join(part_text)
    shown_products: Set[str] = set()
    # ---------------------------------------------------------------- flow
    num_err = toc_err = div_err = page_err = 0
    names = [p.get('name') or '' for p in body_parts]
    page = 0
    for pi, rows in enumerate(per_part):
        p = parts[pi]
        no = body_parts.index(p) + 1 if p in body_parts else 0
        for n, kind, tx, x in rows:
            page += 1
            t = {i: v for i, v, _, _ in tx}
            for i, v, _, mode in tx:
                if mode == 'chrome' and CONF.match(v) and v != f'CONFIDENTIAL · {page}':
                    page_err += 1
            if kind == 'divider' and no:
                if t.get(1) != f'{no:02d} / {len(body_parts):02d}':
                    num_err += 1
                if t.get(2) != p.get('name'):
                    div_err += 1
            elif no and t.get(0) and EYEBROW.match(t[0]) and not t[0].startswith(f'{no:02d} · '):
                num_err += 1
            if kind == 'toc':
                step, base = (5, 4) if x['f'] == 'L_VS_TOC' else (2, 3)
                for k2, nm in enumerate(names[:8]):
                    if t.get(base + step * k2) != nm:
                        toc_err += 1
    r.update({'num_err': num_err, 'toc_err': toc_err, 'div_err': div_err, 'page_err': page_err})
    # ---------------------------------------------------------------- wording
    ph = other = tplname = guide = sample = unsup = unchanged = written = unl = 0
    vocab = unlinked_vocab({'req_text': ctxm.requirement_text(ctxm.normalize(inp), 4000), 'summary': '', 'customer': customer, 'title': pr.get('title') or '',
                            'products': products, 'solutions': solutions, 'cases': cases})
    for pi, rows in enumerate(per_part):
        for n, kind, tx, x in rows:
            lay = L.get(x['f']) or {}
            lock = (lay.get('modes') or {}).get('lock')
            for i, v, st, mode in tx:
                if not v or mode == 'chrome' and (CONF.match(v) or v in foot):
                    continue
                ph += len(PLACEHOLDER.findall(v))
                if kind != 'case':  # a 도입사례 slide names its own customer and site
                    other += sum(1 for b in banned if b in v)
                if tpl_cust and tpl_cust != customer and tpl_cust in v and tpl_cust not in customer:
                    tplname += 1
                if GUIDE.search(v):
                    guide += 1
                if not st and mode not in ('fixed', 'section', 'chrome') and len(v) >= 2 and not FIXED.match(v) and not ORDINAL.match(v) and lock != 'fixed':
                    sample += 1
                if mode == 'ai' and kind not in ('static', 'divider', 'toc', 'cover') and len(v) >= 10:
                    written += 1
                    if v in exemplar.get(x['f'], ()):
                        unchanged += 1
                    if kind not in ('dss',) and unlinked_in(v, vocab):
                        unl += 1
                    body_ = PLACEHOLDER.sub(' ', v)
                    for m in NUMTOK.findall(body_):
                        k = m.replace(',', '').rstrip('.')
                        if k in allowed or k in GENERIC_NUMBERS or re.fullmatch(r'20[2-3]\d', k) or (k.isdigit() and int(k) <= 12):
                            continue
                        unsup += 1
    models = _model_index()
    linked_models = {re.sub(r'[^A-Z0-9]', '', str(PA[p].get('model') or '').upper()) for p in products}
    up = re.sub(r'[^A-Z0-9]', ' ', ' '.join(v for rows in per_part for n, kind, tx, x in rows if kind != 'case' for i, v, st, mode in tx).upper())
    words = set(up.split())
    r['other_models'] = sum(1 for m in models if m in words and m not in linked_models and not any(m in lm or lm in m for lm in linked_models if lm))
    r.update({'placeholders': ph, 'other_names': other, 'tpl_name': tplname, 'guide': guide, 'sample_shown': sample, 'unsupported_numbers': unsup, 'unlinked': unl,
              'unchanged_rate': round(unchanged / max(1, written), 3)})
    # ---------------------------------------------------------------- pictures
    n_img = empty = prod_slots = prod_linked = prod_named = prod_named_ok = case_slots = case_ok = sol_slots = sol_ok = 0
    scene_slots = bad_ind = bad_sib = bad_brand = bad_fam = space_slots = space_ok = seen_brand = seen_place = seen_low = 0
    scenes = Counter()
    bird_ok: Optional[float] = None
    SOL = lib.get('sol_layouts') or {}
    cust_of = {str(C[c].get('cust') or ''): c for c in cases}
    name_of_p = {p: [x for x in [PA[p].get('name'), PA[p].get('model'), re.sub(r'\s*\([^)]*\)\s*$', '', str(PA[p].get('name') or ''))] if x and len(str(x)) >= 3] for p in products}
    for pi, rows in enumerate(per_part):
        p = parts[pi]
        for n, kind, tx, x in rows:
            lay = L.get(x['f'])
            if not lay:
                continue
            img = (x.get('ov') or {}).get('img') or {}
            t = {str(i): v for i, v, _, _ in tx}
            slide = {'f': x['f'], 't': t}
            slide_text = ' '.join(t.values())
            sid = SOL.get(x['f']) if SOL.get(x['f']) in solutions else next((s for s in solutions if S[s].get('name') and S[s]['name'] in (t.get('1') or '')), None) if kind == 'solution' else None
            cid = next((c for cu, c in cust_of.items() if cu and cu in slide_text), None) if (x['f'] == 'L_VS_CASE' or p.get('type') == 'case') and kind not in ('divider', 'toc') else None
            for im in lay['images']:
                key = str(im['i'])
                v = img.get(key) or (img.get('t' + str(im['tb'])) if im.get('tb') is not None else None)
                n_img += 1
                dk = im.get('kind') or ''
                if isinstance(v, dict) and v.get('hidden'):
                    continue
                src = norm_src(v) if v else (im.get('sample') or '')
                if not src:
                    empty += 1
                    continue
                if dk == 'icon' or '/icons/' in src or src.endswith('blank.png'):
                    continue
                it = IM.get(src) or {}
                near = near_text(slide, im)
                if dk == 'plan':
                    if sp.get('birdseye') and (sp['birdseye'] or {}).get('image'):
                        bird_ok = 1.0 if src == sp['birdseye']['image'] else 0.0 if bird_ok is None else bird_ok
                    continue
                tags = set(it.get('products') or []) | (set(v.get('products') or []) | ({v['pid']} if v.get('pid') else set()) if isinstance(v, dict) else set())
                is_cut = {q for q in products if src in own_cuts(q)}
                if kind == 'static' or (lay.get('modes') or {}).get('img', {}).get(key) == 'fixed':
                    continue
                if cid and (dk == 'case' or x['f'] == 'L_VS_CASE'):
                    case_slots += 1
                    case_ok += str(it.get('case')) == str(cid)
                    continue
                if sid and kind == 'solution':
                    sol_slots += 1
                    used_same = any(u.get('f') == x['f'] for u in it.get('usage') or [])
                    sol_ok += (sid in (it.get('solutions') or [])) or used_same
                    continue
                if dk in PRODUCT_KINDS or (im.get('fit') == 'contain' and it.get('cls') == 'product') or (it.get('cls') == 'product' and dk not in ('space', 'photo')):
                    if it.get('cls') != 'product' and not is_cut:
                        continue  # a solution tile / screen in a product-or-solution slot
                    if kind == 'dss':
                        continue  # the portfolio diagram
                    prod_slots += 1
                    linked = bool(is_cut) or bool(tags & set(products))
                    prod_linked += linked
                    shown_products |= is_cut | (tags & set(products))
                    named = [q for q in products if any(nm in near for nm in name_of_p[q])]
                    if named:
                        prod_named += 1
                        prod_named_ok += any(src in own_cuts(q) or q in tags for q in named)
                    continue
                if it.get('cls') in ('scene', 'kv') or dk in ('space', 'photo', ''):
                    if not it:
                        continue
                    scene_slots += 1
                    if kind != 'toc':
                        scenes[src] += 1
                    place, prim = it.get('place') or [], it.get('ind_primary') or []
                    if ind and ((place and ind not in place) or (prim and ind not in prim and ind not in place)):
                        bad_ind += 1
                    elif sibling_conflict(src, vid):
                        bad_sib += 1
                    if kind != 'toc' and not brand_ok(src, who, p.get('type') or ''):
                        bad_brand += 1  # (목차 cards mirror the chapter photos — the case chapter may show the case's site)
                    # what a vision model saw in the photo (image_facts.json): another company's sign · another kind of place · unusable
                    if kind not in ('toc', 'case'):
                        seen = vf_reject(src, {'kind': 'space' if x['f'] == 'L_VS_SPACE' else 'scene', 'part_type': p.get('type') or ''}, {'ind': ind, 'vertical': vid, 'who': who})
                        seen_brand += seen == 'vision_other_brand'
                        seen_place += seen in ('vision_other_place', 'vision_other_subvertical')
                        seen_low += seen in ('vision_low_quality', 'vision_not_a_scene')
                    fam = families(near)
                    seen_f = families(it.get('desc') or '')
                    if len(fam) == 1 and seen_f and not (fam & seen_f):
                        bad_fam += 1
                    if x['f'] == 'L_VS_SPACE' and t.get('1'):
                        space_slots += 1
                        nm = t['1']
                        spid = next((s_['id'] for s_ in spaces if s_['name'] == nm), None) or next((s_['id'] for s_ in V.get('spaces') or [] if s_['name'] == nm), None)
                        std = std_space_photo({'vertical': vid, 'space_by_id': {spid: {'name': nm}} if spid else {}}, spid) if spid else None
                        st_ = set(tokens(nm))
                        space_ok += (std == src) or bool(st_ & set(tokens(' '.join([it.get('desc') or ''] + list(it.get('spaces') or [])[:6]))))
    scene_dup = sum(c - 1 for c in scenes.values() if c > 1)
    bad = bad_ind + bad_sib + bad_brand + bad_fam + scene_dup + seen_brand + seen_place + seen_low + (prod_slots - prod_linked) + (case_slots - case_ok) + (sol_slots - sol_ok) + empty
    r.update({'img_slots': n_img, 'img_empty': empty, 'prod_slots': prod_slots, 'prod_linked_rate': round(prod_linked / prod_slots, 3) if prod_slots else None,
              'prod_named': prod_named, 'prod_named_rate': round(prod_named_ok / prod_named, 3) if prod_named else None,
              'case_slots': case_slots, 'case_rate': round(case_ok / case_slots, 3) if case_slots else None,
              'sol_slots': sol_slots, 'sol_rate': round(sol_ok / sol_slots, 3) if sol_slots else None,
              'scene_slots': scene_slots, 'scene_other_ind': bad_ind, 'scene_sibling': bad_sib, 'scene_brand': bad_brand, 'scene_family': bad_fam, 'scene_dup': scene_dup, 'seen_brand': seen_brand, 'seen_place': seen_place, 'seen_low': seen_low,
              'space_slots': space_slots, 'space_rate': round(space_ok / space_slots, 3) if space_slots else None, 'bird_ok': bird_ok,
              'img_bad': bad, 'img_fit_rate': round(1 - bad / max(1, n_img), 3)})
    # ---------------------------------------------------------------- coverage
    def named(names: List[str]) -> bool:
        return any(nm and len(nm) >= 3 and nm in all_text for nm in names)
    r['prod_cov'] = round(sum(1 for q in products if q in shown_products or named(name_of_p[q])) / len(products), 3) if products else None
    r['sol_cov'] = round(sum(1 for s in solutions if named([S[s].get('name')])) / len(solutions), 3) if solutions else None
    r['case_cov'] = round(sum(1 for c in cases if named([str(C[c].get('cust') or '')])) / len(cases), 3) if cases else None
    multi = 0
    for nm in [S[s].get('name') for s in solutions] + [str(C[c].get('cust') or '') for c in cases]:
        if not nm:
            continue
        own = set()
        for pi, rows in enumerate(per_part):
            for n, kind, tx, x in rows:
                if kind in ('divider', 'toc', 'static', 'cover'):
                    continue
                t = {i: v for i, v, _, _ in tx}
                if nm in (t.get(1) or ''):
                    own.add(pi)
        multi += len(own) > 1
    r['entity_multi'] = multi
    return r


_G: Dict[str, Set[str]] = {}
_M: List[str] = []


def _grams_cached(k: str) -> Set[str]:
    if k not in _G:
        _G[k] = {k[i:i + 2] for i in range(len(k) - 1)}
    return _G[k]


def _model_index() -> List[str]:
    if not _M:
        seen = set()
        for p in load()['products_all'].values():
            m = re.sub(r'[^A-Z0-9]', '', str(p.get('model') or '').upper())
            if len(m) >= 5 and re.search(r'\d', m) and m not in seen:
                seen.add(m)
                _M.append(m)
    return _M
