"""Rebuild 샘플 버티컬 시나리오s from their customer input alone and score them against the original deck.

    python -m eval.run_eval --name r1 --llm gemini --mode self [--groups bs,vertical,std,account] [--only bs01,bs07] [--jobs 4]
    python -m eval.run_eval --name gold --system gold            # score the gold decks themselves (reference row)

--mode self    the scenario itself is hidden from every stage (retrieval · modules · pictures made for it)
--mode family  every scenario authored from the same source deck is hidden too (vertical _1/_2/std) — harder

Writes runs/<name>/<id>.json (deck + metrics + model usage) and runs/<name>/summary.{json,md}.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from composer import pipeline  # noqa: E402
from composer.llm import GeminiJSON  # noqa: E402
from eval import gold as G  # noqa: E402
from eval.metrics import score  # noqa: E402

RUNS = HERE / 'runs'
KEYS = ['type_lcs', 'stage_lcs', 'flow_breaks', 'parts', 'parts_gold', 'slides', 'slides_gold', 'req_ok', 'strategy_ok', 'ending_ok',
        'layout_recall', 'family_recall', 'layout_violation_rate', 'lay_ind_violation', 'lay_sol_violation', 'lay_pc_violation', 'lay_dup',
        'img_slots', 'img_set', 'img_unset', 'img_ind_mismatch', 'img_place_mismatch', 'img_prod_mismatch', 'img_cls_mismatch', 'img_brand_misuse', 'img_dup', 'img_ok_rate', 'img_ok_rate_b',
        'txt_leak', 'txt_unsupported_numbers', 'txt_placeholders']


def run_one(c, args, llm):
    inp = G.gold_input(c)
    gold = G.gold_deck(c['id'])
    t0 = time.time()
    if args.system == 'gold':
        deck, a, extra = gold['parts'], None, {}
    else:
        ex = G.exclusions(c, args.mode)
        out = pipeline.run(inp, llm, exclude=ex)
        deck, a = out['parts'], out['analysis']
        extra = {'storyline': out['storyline'], 'thesis': out['thesis']}
    m = score(deck, inp, gold, a)
    rec = {'id': c['id'], 'group': c['group'], 'metrics': m, 'analysis': a, 'sec': round(time.time() - t0, 1), **extra,
           'deck': [{k: v for k, v in p.items() if k != 'slides'} | {'slides': [{k: s.get(k) for k in ('f', 'from', 'role', 'ex', 'adapt', 't', 'img', 'img_meta', 'masked', 'img_missing')} for s in p.get('slides') or []]} for p in deck]}
    return rec


def summarize(recs, name):
    by = {}
    for r in recs:
        by.setdefault(r['group'], []).append(r)
        by.setdefault('ALL', []).append(r)
    rows = {}
    for g, rs in by.items():
        row = {'n': len(rs)}
        for k in KEYS:
            vals = [r['metrics'][k] for r in rs if isinstance(r['metrics'].get(k), (int, float))]
            if vals:
                row[k] = round(statistics.mean(vals), 3)
        rows[g] = row
    lines = [f'# {name}', '', '| metric | ' + ' | '.join(rows) + ' |', '|---|' + '---|' * len(rows)]
    for k in ['n'] + KEYS:
        lines.append(f'| {k} | ' + ' | '.join(str(rows[g].get(k, '')) for g in rows) + ' |')
    return rows, '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--name', required=True)
    ap.add_argument('--llm', default='gemini', choices=['gemini', 'offline'])
    ap.add_argument('--system', default='composer', choices=['composer', 'gold'])
    ap.add_argument('--mode', default='self', choices=['self', 'family'])
    ap.add_argument('--groups', default='bs,vertical,std,account')
    ap.add_argument('--only', default='')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--model', default=None)
    ap.add_argument('--resume', action='store_true', help='skip ids that already have a result in the run folder')
    args = ap.parse_args()
    out_dir = RUNS / args.name
    out_dir.mkdir(parents=True, exist_ok=True)
    cards = G.eval_set(tuple(args.groups.split(',')))
    if args.only:
        want = set(args.only.split(','))
        cards = [c for c in cards if c['id'] in want]
    done_recs = []
    if args.resume:
        for c in list(cards):
            p = out_dir / f"{c['id']}.json"
            if p.exists():
                done_recs.append(json.load(open(p, encoding='utf-8')))
                cards.remove(c)
    if args.llm == 'offline' or args.system == 'gold':
        from eval.fake_llm import FakeLLM
        llm = FakeLLM()
    else:
        llm = GeminiJSON(model=args.model)
        if not llm.available:
            sys.exit('GEMINI_API_KEY 가 없습니다')
    recs, errs = list(done_recs), []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.jobs) as ex:
        futs = {ex.submit(run_one, c, args, llm): c for c in cards}
        for f in as_completed(futs):
            c = futs[f]
            try:
                r = f.result()
                recs.append(r)
                (out_dir / f"{c['id']}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding='utf-8')
                m = r['metrics']
                print(f"✓ {c['id']:<34} lcs {m.get('type_lcs')} lay {m.get('layout_violation_rate')} img {m.get('img_ok_rate')} "
                      f"leak {m.get('txt_leak')} {r['sec']}s", flush=True)
            except Exception as e:  # noqa: BLE001
                errs.append({'id': c['id'], 'error': f'{type(e).__name__}: {e}'})
                print(f"✗ {c['id']}: {type(e).__name__}: {e}", flush=True)
                traceback.print_exc(limit=3)
    rows, md = summarize(recs, args.name)
    usage = getattr(llm, 'usage', {})
    (out_dir / 'summary.json').write_text(json.dumps({'rows': rows, 'errors': errs, 'usage': usage, 'model': getattr(llm, 'model', ''),
                                                       'mode': args.mode, 'sec': round(time.time() - t0, 1)}, ensure_ascii=False, indent=1), encoding='utf-8')
    (out_dir / 'summary.md').write_text(md + f"\n\nerrors: {len(errs)} · model {getattr(llm, 'model', '')} · usage {json.dumps(usage, ensure_ascii=False)[:400]}\n", encoding='utf-8')
    print(md)
    print('errors', errs[:5])
    print('usage', json.dumps(usage, ensure_ascii=False)[:600])


if __name__ == '__main__':
    main()
