"""Template-driven eval: 레이아웃 자동 구성 (``auto``) vs today's ``complete()`` path on the same cases.

    python -m eval.run_tpl --name a1 --system auto     [--only cafe_std,mart_std] [--set small|full] [--llm app|offline] [--jobs 2] [--no-verify]
    python -m eval.run_tpl --name base --system baseline
    python -m eval.run_tpl --report base,a1,a2          # comparison table from the saved decks (metrics recomputed — no model calls)

Writes runs/<name>/<case>.json (deck · plan · events · usage · metrics) and runs/<name>/summary.md.
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

from composer import auto, pipeline  # noqa: E402
from composer import context as ctxm  # noqa: E402
from composer.library import load  # noqa: E402
from eval.tpl_cases import CASES, SMALL, build_cases  # noqa: E402
from eval.tpl_metrics import KEYS, score_deck  # noqa: E402

RUNS = HERE / 'runs'


def run_auto(case, llm, verify=True, workers=4, pick='rank'):
    events = []
    t0 = time.time()

    def emit(type_, **data):
        events.append({'type': type_, 't': round(time.time() - t0, 2), **{k: v for k, v in data.items() if k not in ('layouts', 'plan')},
                       **({'n': len(data['layouts'])} if 'layouts' in data else {})})
    out = auto.run_auto(case['body']['proposal'], case['body'], llm, emit=emit, workers=workers, verify=verify, pick=pick)
    return {'parts': out['app_parts'], 'plan': out['plan'], 'failed': out['failed'], 'events': events, 'plan_ms': out['plan_ms']}


def run_baseline(case, llm, workers=4):
    """today's path: the parts (with the 샘플 버티컬 시나리오 module when the template is a library scenario) → ``pipeline.complete``."""
    lib = load()
    mids = {m['mid'] for m in lib['modules']}
    inp = ctxm.from_app_proposal(case['body']['proposal'])
    parts = []
    for i, p in enumerate(case['body']['parts']):
        src = f"{case['std_sid']}#{i}" if f"{case['std_sid']}#{i}" in mids else None
        parts.append({'id': p['id'], 'type': p['type'], 'name': p['name'], 'items': p['items'], 'src': src, 'deck': p['deck']})
    out = pipeline.complete(inp, parts, llm, exclude=case['hold'], workers=workers)
    app_parts = out['app_parts']
    for src, dst in zip(parts, app_parts):
        dst['id'] = src['id']
        dst['name'] = src['name'] if not src['deck'] else '표지'
        dst['deck'] = bool(src['deck'])
    return {'parts': app_parts, 'plan': None, 'failed': [], 'events': [], 'plan_ms': 0}


def one(case, args, base_llm):
    llm = base_llm.fork() if hasattr(base_llm, 'fork') else base_llm
    t0 = time.time()
    res = run_auto(case, llm, verify=not args.no_verify, workers=args.workers, pick=args.pick) if args.system == 'auto' else run_baseline(case, llm, workers=args.workers)
    sec = round(time.time() - t0, 1)
    m = score_deck(res['parts'], case)
    return {'id': case['id'], 'system': args.system, 'tid': case['tid'], 'vid': case['vid'], 'sec': sec, 'usage': getattr(llm, 'usage', {}), 'metrics': m, **res}


def table(names, only=None):
    cases = {c['id']: c for c in build_cases(only)}
    cols = {}
    for name in names:
        rows = []
        for cid, case in cases.items():
            p = RUNS / name / f'{cid}.json'
            if not p.exists():
                continue
            rec = json.load(open(p, encoding='utf-8'))
            m = score_deck(rec['parts'], case)
            u = rec.get('usage') or {}
            m.update({'sec': rec.get('sec'), 'calls': (u.get('calls') or 0) + (u.get('cached') or 0), 'in_tok': u.get('in_tokens'), 'out_tok': u.get('out_tokens'),
                      'repairs': u.get('repairs'), 'failed_parts': len(rec.get('failed') or [])})
            rows.append(m)
        cols[name] = rows
    keys = KEYS + ['sec', 'calls', 'in_tok', 'out_tok', 'repairs', 'failed_parts']
    lines = ['| metric (mean per deck) | ' + ' | '.join(f'{n} (n={len(cols[n])})' for n in names) + ' |', '|---|' + '---|' * len(names)]
    for k in keys:
        cells = []
        for n in names:
            vals = [r[k] for r in cols[n] if isinstance(r.get(k), (int, float))]
            cells.append(str(round(statistics.mean(vals), 3)) if vals else '')
        lines.append(f'| {k} | ' + ' | '.join(cells) + ' |')
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--name')
    ap.add_argument('--system', default='auto', choices=['auto', 'baseline'])
    ap.add_argument('--llm', default='app', choices=['app', 'offline'])
    ap.add_argument('--set', default='small', choices=['small', 'full'])
    ap.add_argument('--only', default='')
    ap.add_argument('--jobs', type=int, default=2)
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--no-verify', action='store_true')
    ap.add_argument('--pick', default='rank', choices=['rank', 'llm'], help='picture choice: ranking + verification (default) or model pick + verification')
    ap.add_argument('--resume', action='store_true')
    ap.add_argument('--report', default='')
    args = ap.parse_args()
    only = args.only.split(',') if args.only else (SMALL if args.set == 'small' else [c['id'] for c in CASES])
    if args.report:
        md = table(args.report.split(','), only)
        print(md)
        (RUNS / f"REPORT_{'_'.join(args.report.split(','))}.md").write_text(md + '\n', encoding='utf-8')
        return
    out_dir = RUNS / args.name
    out_dir.mkdir(parents=True, exist_ok=True)
    cases = build_cases(only)
    if args.resume:
        cases = [c for c in cases if not (out_dir / f"{c['id']}.json").exists()]
    if args.llm == 'offline':
        from eval.fake_llm import FakeLLM
        llm = FakeLLM()
    else:
        from eval.app_llm import AppLLM
        llm = AppLLM()
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as ex:
        futs = {ex.submit(one, c, args, llm): c for c in cases}
        for f in as_completed(futs):
            c = futs[f]
            try:
                r = f.result()
                (out_dir / f"{c['id']}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
                m, u = r['metrics'], r['usage']
                print(f"✓ {c['id']:<14} {r['sec']:>6}s calls {u.get('calls', 0)}+{u.get('cached', 0)}c tok {u.get('in_tokens', 0)}/{u.get('out_tokens', 0)} "
                      f"dup {m['dup_strings']} ph {m['placeholders']} img_fit {m['img_fit_rate']} failed {r['failed']}", flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"✗ {c['id']}: {type(e).__name__}: {e}", flush=True)
                traceback.print_exc(limit=6)
    print('model', getattr(llm, 'model', ''), 'sec', round(time.time() - t0, 1))
    md = table([args.name], only)
    (out_dir / 'summary.md').write_text(md + '\n', encoding='utf-8')
    print(md)


if __name__ == '__main__':
    main()
