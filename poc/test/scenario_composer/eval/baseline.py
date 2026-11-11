"""Baseline = what the app does today for an empty Storyboard: the Layout Agent job (``kind: layout``, non-interactive),
run through the app's own service, provider and canonical KB. Same inputs, same metrics as the composer.

    WINMATE_LLM_PROVIDER=gemini GEMINI_API_KEY=… python -m eval.baseline --name base1 [--only …] [--groups …]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
ROOT = Path(os.environ.get('WM_REPO_ROOT') or HERE.parents[2])
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))
os.environ.setdefault('WINMATE_LLM_PROVIDER', 'gemini')

from eval import gold as G  # noqa: E402
from eval.metrics import score  # noqa: E402
from eval.run_eval import RUNS, summarize  # noqa: E402


def proposal_input(inp: dict) -> dict:
    return {'id': inp['id'], 'title': inp['title'], 'customer': inp['customer'], 'industry': inp['ind'], 'free_text': inp['free_text'],
            'project': inp['title'], 'target': inp.get('target') or '', 'note': inp['note'],
            'keymen': [{'name': k['name'], 'weight': k['weight'], 'reqs': k['reqs']} for k in inp['keymen']], 'files': [],
            'products': inp['products'], 'solutions': inp['solutions'], 'cases': inp['cases']}


def to_deck(app_parts):
    deck = []
    for p in app_parts or []:
        slides = [{'f': x['f'], 't': (x.get('ov') or {}).get('t') or {}, 'img': (x.get('ov') or {}).get('img') or {}} for x in p.get('layouts') or []]
        deck.append({'type': p.get('type'), 'name': p.get('name'), 'items': p.get('items') or [], 'slides': slides, 'deck': p.get('type') == 'cover'})
    return deck


HOLD = {'ids': set()}


def patch_holdout():
    """leave-one-out for the app too: the Layout Agent's 샘플 버티컬 시나리오 matcher (match_best · decompose) must not see the
    held-out deck — the app's runtime KB carries all 85, the answer included. Per-request KB views are shallow copies,
    so the held-out ids are dropped on the view (one job at a time)."""
    from app.api.poc import knowledge
    cls = knowledge._layout_kb_class()
    orig = cls.with_products

    def with_products(self, ids):
        view = orig(self, ids)
        ex = set(HOLD['ids'])
        if ex:
            view.best_scenarios = [s for s in self.best_scenarios if s['id'] not in ex]
            view.BS = {k: v for k, v in self.BS.items() if k not in ex}
        return view
    cls.with_products = with_products


def run_one(c, service, holdout=False):
    inp = G.gold_input(c)
    gold = G.gold_deck(c['id'])
    HOLD['ids'] = set(G.exclusions(c, 'self')) if holdout else set()
    snap = service.submit({'kind': 'layout', 'input': proposal_input(inp), 'interactive': False})[1]
    jid = snap['id']
    t0 = time.time()
    while True:
        job = service.get_job(jid)
        if job.terminal:
            break
        if time.time() - t0 > 900:
            service.cancel(jid)
            raise TimeoutError('layout job > 900s')
        time.sleep(1.0)
    s = job.snapshot(0)
    if s.get('status') != 'done':
        raise RuntimeError(f"job {s.get('status')}: {json.dumps(s.get('error'), ensure_ascii=False)[:300]}")
    res = s.get('result') or {}
    deck = to_deck((res.get('app_proposal') or {}).get('parts'))
    a = res.get('analysis') or {}
    analysis = {'industry': a.get('industry'), 'req_type': a.get('req_type'), 'strategy': a.get('strategy'), 'ending': None}
    m = score(deck, inp, gold, analysis)
    return {'id': c['id'], 'group': c['group'], 'metrics': m, 'analysis': analysis, 'sec': round(time.time() - t0, 1),
            'llm': res.get('llm'), 'deck': deck}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--name', required=True)
    ap.add_argument('--groups', default='bs,vertical,std,account')
    ap.add_argument('--only', default='')
    ap.add_argument('--jobs', type=int, default=3)
    ap.add_argument('--holdout', action='store_true', help='hide the held-out 샘플 버티컬 시나리오 from the Layout Agent (runs one job at a time)')
    args = ap.parse_args()
    from app.api.poc import service
    service.initialize(warm=False)
    if args.holdout:
        patch_holdout()
        args.jobs = 1
    out_dir = RUNS / args.name
    out_dir.mkdir(parents=True, exist_ok=True)
    cards = G.eval_set(tuple(args.groups.split(',')))
    if args.only:
        want = set(args.only.split(','))
        cards = [c for c in cards if c['id'] in want]
    recs, errs = [], []
    for c in list(cards):  # resume: keep finished decks
        p = out_dir / f"{c['id']}.json"
        if p.exists():
            recs.append(json.load(open(p, encoding='utf-8')))
            cards.remove(c)
    with ThreadPoolExecutor(max_workers=args.jobs) as ex:
        futs = {ex.submit(run_one, c, service, args.holdout): c for c in cards}
        for f in as_completed(futs):
            c = futs[f]
            try:
                r = f.result()
                recs.append(r)
                (out_dir / f"{c['id']}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding='utf-8')
                m = r['metrics']
                print(f"✓ {c['id']:<34} lcs {m.get('type_lcs')} lay {m.get('layout_violation_rate')} img {m.get('img_ok_rate')} leak {m.get('txt_leak')} {r['sec']}s", flush=True)
            except Exception as e:  # noqa: BLE001
                errs.append({'id': c['id'], 'error': f'{type(e).__name__}: {e}'[:400]})
                print(f"✗ {c['id']}: {type(e).__name__}: {str(e)[:200]}", flush=True)
    rows, md = summarize(recs, args.name)
    (out_dir / 'summary.json').write_text(json.dumps({'rows': rows, 'errors': errs}, ensure_ascii=False, indent=1), encoding='utf-8')
    (out_dir / 'summary.md').write_text(md + f'\n\nerrors: {len(errs)}\n', encoding='utf-8')
    print(md)
    print('errors', errs[:5])


if __name__ == '__main__':
    main()
