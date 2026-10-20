"""CLI — poc/test 에서 실행.

  python3 -m proposal_score taxonomy [--backend gemini|rules]           평가 기준 그래프 → 커뮤니티 → 압축 요약 (taxonomy/taxonomy.json)
  python3 -m proposal_score score bs01 [bs07 …] [--backend gemini]      제안서 몇 건 평가 → 화면 요약
  python3 -m proposal_score best [--backend gemini] [--stability 6] [--perturb bs01,bs07,bs11] [--full all]
                                                                        Best Scenario 전체 + (선택) 안정성 재실행 · 교란 대조군 → results/<run_id>/
  python3 -m proposal_score report <run_id>                             저장된 결과로 REPORT.md 다시 만들기
공통: --model · --budget 12 · --min-k 10 · --temperature 0 · --rpm 30 · --workers 3 · --run <run_id>
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from . import config
from .criteria import load_criteria
from .llm import make_backend
from .pipeline import Context, evaluate
from .proposal import load_best
from .report import build_report
from .run import _save, compare_full, run_best, run_full, run_perturb, stability, summarize_perturb
from .taxonomy import build_taxonomy, save_taxonomy


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog='proposal_score')
    ap.add_argument('cmd', choices=['taxonomy', 'score', 'best', 'report'])
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--backend', default='gemini', choices=['gemini', 'replay', 'rules'])
    ap.add_argument('--model', default='')
    ap.add_argument('--budget', type=int, default=12)
    ap.add_argument('--min-k', type=int, default=10)
    ap.add_argument('--temperature', type=float, default=0.0)
    ap.add_argument('--rpm', type=int, default=30)
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--run', default='')
    ap.add_argument('--stability', type=int, default=0, help='처음 N개 시나리오를 --stability-temperature 로 다시 돌려 비교')
    ap.add_argument('--stability-temperature', type=float, default=0.7)
    ap.add_argument('--perturb', default='', help='교란 대조군을 만들 시나리오 id (쉼표)')
    ap.add_argument('--full', default='', help="라우팅 없이 모든 적용 기준을 채점할 시나리오 id (쉼표) 또는 all — 라우팅 평가와 비교")
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args(argv)

    if a.cmd == 'report':
        run_dir = config.RESULTS_DIR / (a.ids[0] if a.ids else a.run)
        meta = json.loads((run_dir / 'meta.json').read_text(encoding='utf-8'))
        (run_dir / 'REPORT.md').write_text(build_report(run_dir, meta), encoding='utf-8')
        print('REPORT.md →', run_dir / 'REPORT.md')
        return 0

    backend = make_backend(a.backend, a.model, a.temperature, a.rpm, a.verbose)
    if a.cmd == 'taxonomy':
        t = build_taxonomy(load_criteria(), backend)
        save_taxonomy(t)
        print(json.dumps(t['stats'], ensure_ascii=False), '· 요약:', t['summarized_by'])
        for c in t['coarse']:
            print(f"{c['id']} {c['name']}")
            for fid in c['children']:
                f = next(x for x in t['fine'] if x['id'] == fid)
                print(f"   {fid} {f['name']}: {', '.join(f['criteria'])}")
        print('usage', backend.usage())
        return 0

    ctx = Context(backend=backend, budget=a.budget, min_k=a.min_k, temperature=a.temperature)
    ctx.others = [p.customer for p in load_best()]
    if a.cmd == 'score':
        for p in [p for p in load_best() if p.id in a.ids]:
            r = evaluate(p, ctx)
            ag = r['aggregate']
            print(f"{p.id} {p.customer} — 총점 {ag['total']} {ag['band']} · 1~3 평균 {ag['rubric_mean']} · 고른 기준 {ag['n_selected']}/{ag['n_applicable']} · 호출 {r['calls']} · {r['seconds']}s")
            for s in r['scores']:
                print(f"  {s['id']:<5} {s['score']}  [{s['community']}] {s['anchor'][:110]}")
        print('usage', backend.usage())
        return 0

    # best
    run_id = a.run or time.strftime('%Y%m%d-%H%M') + f'-{a.backend}'
    out = config.RESULTS_DIR / run_id
    t0 = time.time()
    meta = {'run_id': run_id, 'backend': a.backend, 'model': getattr(backend, 'model', a.backend), 'temperature': a.temperature, 'budget': a.budget, 'min_k': a.min_k,
            'started': time.strftime('%Y-%m-%d %H:%M:%S'), 'taxonomy_summarized_by': ctx.tax.get('summarized_by')}
    _save(out / 'meta.json', meta)
    main = run_best(ctx, out, a.ids or None, a.workers)
    if a.stability:
        ctx2 = Context(backend=backend, cs=ctx.cs, tax=ctx.tax, catalog=ctx.catalog, others=ctx.others, budget=a.budget, min_k=a.min_k, temperature=a.stability_temperature)
        ids = [r['id'] for r in main if 'scores' in r][:a.stability]
        second = run_best(ctx2, out, ids, a.workers, tag='stability')
        meta['stability'] = stability([r for r in main if r['id'] in ids], second)
        meta['stability_temperature'] = a.stability_temperature
    if a.perturb:
        rows = run_perturb(ctx, out, [x for x in a.perturb.split(',') if x], workers=a.workers)
        meta['perturb'] = summarize_perturb(rows)
    if a.full:
        ids = None if a.full == 'all' else [x for x in a.full.split(',') if x]
        full = run_full(ctx, out, ids, workers=a.workers)
        meta['full'] = compare_full(main, full)
    meta['usage'] = backend.usage()
    meta['minutes'] = round((time.time() - t0) / 60, 1)
    _save(out / 'meta.json', meta)
    (out / 'REPORT.md').write_text(build_report(out, meta), encoding='utf-8')
    (config.RESULTS_DIR / 'LATEST.md').write_text((out / 'REPORT.md').read_text(encoding='utf-8'), encoding='utf-8')
    print('done', run_id, meta['minutes'], 'min · usage', meta['usage'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
