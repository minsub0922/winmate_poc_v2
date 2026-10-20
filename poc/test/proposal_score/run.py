"""배치 실행 — Best Scenario 전체 · 안정성 재실행 · 교란 대조군. 결과는 results/<run_id>/ 에 쌓인다."""
from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Optional

from . import config
from .llm import Backend
import copy

from .checks import profile
from .criteria import applicable
from .pipeline import PERTURB, Context, baseline, evaluate, perturbed
from .proposal import Proposal, load_best


def _save(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding='utf-8')


def _log(msg: str) -> None:
    print(time.strftime('%H:%M:%S'), msg, flush=True)


def run_best(ctx: Context, out: Path, ids: Optional[List[str]] = None, workers: int = 3, tag: str = 'main') -> List[dict]:
    ps = [p for p in load_best() if not ids or p.id in ids]
    ctx.others = ctx.others or [p.customer for p in load_best()]
    res: Dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(evaluate, p, ctx): p for p in ps}
        for f in as_completed(futs):
            p = futs[f]
            try:
                r = f.result()
            except Exception as e:  # noqa: BLE001 — 한 건 실패가 전체를 멈추지 않게
                r = {'id': p.id, 'variant': '', 'error': f'{type(e).__name__}: {e}'}
            res[p.id] = r
            _save(out / tag / f'{p.id}.json', r)
            a = r.get('aggregate') or {}
            _log(f"[{tag}] {p.id} total={a.get('total')} rubric={a.get('rubric_mean')} sel={a.get('n_selected')}/{a.get('n_applicable')} calls={r.get('calls')} {r.get('seconds')}s {r.get('error', '')}")
    order = [p.id for p in ps]
    return [res[i] for i in order]


def run_perturb(ctx: Context, out: Path, ids: List[str], kinds: Optional[List[str]] = None, workers: int = 3) -> List[dict]:
    """교란 대조군: 원본(앱 규칙 메모 제외)과 교란본을 (a) 라우팅까지 전체로, (b) 목표 기준만 강제로 채점해 비교."""
    allp = {p.id: p for p in load_best()}
    ctx.others = ctx.others or [p.customer for p in allp.values()]
    kinds = kinds or list(PERTURB)
    jobs = []
    for pid in ids:
        p = allp[pid]
        other = next(q.customer for q in allp.values() if q.customer != p.customer and q.meta.get('ind') != p.meta.get('ind'))
        base = baseline(p)
        targets = sorted({t for k in kinds for t in PERTURB[k]['targets']})
        jobs.append((pid, 'base', 'routed', base, None))
        jobs.append((pid, 'base', 'forced', base, targets))
        for k in kinds:
            q = perturbed(p, k, other)
            jobs.append((pid, k, 'routed', q, None))
            jobs.append((pid, k, 'forced', q, PERTURB[k]['targets']))
    rows = _run_jobs(ctx, out, jobs, workers)
    # (c) same: 교란본을 원본이 고른 기준 그대로 채점 — 고른 기준이 같을 때 총점이 떨어지나(총점은 고른 기준에 따라 달라지므로)
    base_sel = {r['id']: (r.get('route') or {}).get('selected') for r in rows if r.get('_kind') == 'base' and r.get('_mode') == 'routed' and 'scores' in r}
    same = [(pid, k, 'same', q, base_sel[pid]) for pid, k, mode, q, _ in jobs if k != 'base' and mode == 'routed' and base_sel.get(pid)]
    return rows + _run_jobs(ctx, out, same, workers)


def _run_jobs(ctx: Context, out: Path, jobs: list, workers: int) -> List[dict]:
    rows = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(evaluate, q, ctx, force): (pid, k, mode) for pid, k, mode, q, force in jobs}
        for f in as_completed(futs):
            pid, k, mode = futs[f]
            try:
                r = f.result()
            except Exception as e:  # noqa: BLE001
                r = {'id': pid, 'variant': k, 'error': f'{type(e).__name__}: {e}'}
            r['_kind'], r['_mode'] = k, mode
            rows.append(r)
            _save(out / 'perturb' / f'{pid}~{k}~{mode}.json', r)
            a = r.get('aggregate') or {}
            _log(f"[perturb] {pid} {k:<16} {mode:<6} total={a.get('total')} sel={a.get('n_selected')} {r.get('error', '')}")
    return rows


def summarize_perturb(rows: List[dict]) -> List[dict]:
    """교란본마다 목표 기준: 원본 점수(forced) 대비 교란본 점수가 떨어졌나 — forced(목표만 채점) · routed(라우터가 골랐을 때)."""
    by = {(r['id'], r['_kind'], r['_mode']): r for r in rows if 'scores' in r}
    out = []
    for (pid, k, mode), r in sorted(by.items()):
        if k == 'base' or mode != 'forced':
            continue
        b = by.get((pid, 'base', 'forced'))
        rr = by.get((pid, k, 'routed'))
        sm = by.get((pid, k, 'same'))
        if not b:
            continue
        bs = {s['id']: s['score'] for s in b['scores']}
        fv = {s['id']: s['score'] for s in r['scores']}
        rv = {s['id']: s['score'] for s in rr['scores']} if rr else {}
        for t in PERTURB[k]['targets']:
            base, var, rsc = bs.get(t), fv.get(t), rv.get(t)
            out.append({'id': pid, 'kind': k, 'target': t, 'base': base, 'forced': var, 'forced_drop': base is not None and var is not None and var < base,
                        'routed_selected': t in rv, 'routed': rsc, 'routed_drop': base is not None and rsc is not None and rsc < base,
                        'rule_pass_variant': t in ((rr or {}).get('rule_pass') or []), 'risk_variant': t in ((rr or {}).get('risk') or []),
                        'total_base': (by.get((pid, 'base', 'routed')) or {}).get('aggregate', {}).get('total'), 'total_variant': (rr or {}).get('aggregate', {}).get('total'),
                        'total_same': (sm or {}).get('aggregate', {}).get('total')})
    return out


def stability(a: List[dict], b: List[dict]) -> dict:
    """같은 제안서를 다른 온도로 다시 돌렸을 때 — 고른 기준의 겹침(Jaccard)과 공통 기준 점수 일치율."""
    bm = {r['id']: r for r in b if 'scores' in r}
    rows, same, near, n = [], 0, 0, 0
    for r in a:
        if r['id'] not in bm or 'scores' not in r:
            continue
        s1 = {s['id']: s['score'] for s in r['scores']}
        s2 = {s['id']: s['score'] for s in bm[r['id']]['scores']}
        inter = set(s1) & set(s2)
        jac = len(inter) / len(set(s1) | set(s2)) if s1 or s2 else 1.0
        eq = sum(1 for i in inter if s1[i] == s2[i])
        same += eq
        near += sum(1 for i in inter if s1[i] is not None and s2[i] is not None and abs(s1[i] - s2[i]) <= 1)
        n += len(inter)
        rows.append({'id': r['id'], 'jaccard': round(jac, 3), 'common': len(inter), 'exact': eq,
                     'total_a': r['aggregate']['total'], 'total_b': bm[r['id']]['aggregate']['total']})
    return {'rows': rows, 'mean_jaccard': round(sum(x['jaccard'] for x in rows) / len(rows), 3) if rows else None,
            'exact_agreement': round(same / n, 3) if n else None, 'within1': round(near / n, 3) if n else None, 'pairs': n,
            'mean_abs_total_diff': round(sum(abs((x['total_a'] or 0) - (x['total_b'] or 0)) for x in rows) / len(rows), 1) if rows else None}


def run_full(ctx: Context, out: Path, ids: Optional[List[str]] = None, workers: int = 3) -> List[dict]:
    """대조군: 라우팅 없이 적용 가능한 기준을 모두 LLM 으로 채점 — 라우터가 고른 12개가 전체 평가와 얼마나 맞는지 본다."""
    ps = [p for p in load_best() if not ids or p.id in ids]
    ctx.others = ctx.others or [p.customer for p in load_best()]
    jobs = []
    for p in ps:
        q = copy.deepcopy(p)
        q.variant = '~full'
        gates = applicable(ctx.cs, profile(q, ctx.catalog))
        jobs.append((p.id, 'full', 'full', q, [i for i, (a, _) in gates.items() if a]))
    rows = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(evaluate, q, ctx, force): pid for pid, _, _, q, force in jobs}
        for f in as_completed(futs):
            pid = futs[f]
            try:
                r = f.result()
            except Exception as e:  # noqa: BLE001
                r = {'id': pid, 'variant': '~full', 'error': f'{type(e).__name__}: {e}'}
            rows.append(r)
            _save(out / 'full' / f'{pid}.json', r)
            a = r.get('aggregate') or {}
            _log(f"[full] {pid} total={a.get('total')} scored={a.get('n_scored')} calls={r.get('calls')} {r.get('seconds')}s {r.get('error', '')}")
    order = [p.id for p in ps]
    by = {r['id']: r for r in rows}
    return [by[i] for i in order if i in by]


def compare_full(main: List[dict], full: List[dict]) -> dict:
    """라우팅 평가 vs 전체 기준 평가 — 총점 차이, 전체 평가에서 1점인 기준을 라우터가 잡았나(문제 재현율), 같은 기준 점수 일치."""
    fm = {r['id']: r for r in full if 'scores' in r}
    rows, same, n = [], 0, 0
    never = {}
    for r in main:
        f = fm.get(r['id'])
        if not f or 'scores' not in r:
            continue
        fs = {s['id']: s['score'] for s in f['scores'] if s['score'] in (1, 2, 3)}
        ms = {s['id']: s['score'] for s in r['scores'] if s['score'] in (1, 2, 3)}
        low = {i for i, v in fs.items() if v == 1}
        caught = low & set(ms)
        rp_low = low & set(r.get('rule_pass') or [])
        inter = set(fs) & set(ms)
        same += sum(1 for i in inter if fs[i] == ms[i])
        n += len(inter)
        for i, v in fs.items():
            if i not in ms:
                never.setdefault(i, []).append(v)
        rows.append({'id': r['id'], 'total_routed': r['aggregate']['total'], 'total_full': f['aggregate']['total'], 'n_routed': len(ms), 'n_full': len(fs),
                     'calls_routed': r.get('calls'), 'calls_full': f.get('calls'), 'tokens_routed': (r.get('tokens') or {}).get('prompt'), 'tokens_full': (f.get('tokens') or {}).get('prompt'),
                     'low_full': sorted(low), 'caught': sorted(caught), 'missed_rule_pass': sorted(rp_low), 'missed': sorted(low - caught - rp_low),
                     'rubric_routed': r['aggregate'].get('rubric_mean'), 'rubric_full': f['aggregate'].get('rubric_mean')})
    k = len(rows) or 1
    lows = sum(len(x['low_full']) for x in rows)
    return {'rows': rows,
            'mean_total_routed': round(sum(x['total_routed'] or 0 for x in rows) / k, 1), 'mean_total_full': round(sum(x['total_full'] or 0 for x in rows) / k, 1),
            'mean_abs_total_diff': round(sum(abs((x['total_routed'] or 0) - (x['total_full'] or 0)) for x in rows) / k, 1),
            'low_recall': round(sum(len(x['caught']) for x in rows) / lows, 3) if lows else None,
            'low_in_rule_pass': sum(len(x['missed_rule_pass']) for x in rows), 'low_total': lows,
            'same_score_rate': round(same / n, 3) if n else None, 'pairs': n,
            'calls_ratio': round(sum(x['calls_routed'] or 0 for x in rows) / max(1, sum(x['calls_full'] or 0 for x in rows)), 3),
            'tokens_ratio': round(sum(x['tokens_routed'] or 0 for x in rows) / max(1, sum(x['tokens_full'] or 0 for x in rows)), 3),
            'unselected_mean': {i: round(sum(v) / len(v), 2) for i, v in sorted(never.items())},
            'unselected_low': {i: sum(1 for x in v if x == 1) for i, v in sorted(never.items()) if any(x == 1 for x in v)}}
