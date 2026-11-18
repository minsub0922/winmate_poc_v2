"""Live evaluation of the decision-shaped tasks — 10 TCs per task, every model branch on identical input.

Branches (``--branches``):

* ``llm``        the app's LLM profile (``WINMATE_LLM_PROVIDER``, default OpenRouter ``qwen/qwen3.6-35b-a3b``, reasoning off)
* ``llm_think``  OpenRouter, same model with the thinking step on (``OPENROUTER_REASONING=on``)
* ``gemma``      the ``gemini`` profile (``GEMINI_MODEL``, e.g. gemma-4-31b-it) — paced under its 16k input-token/minute quota
* ``decision``   TypeSafe Jev (``TYPESAFE_*``); ``decision_raw`` = same answers with the ranking prior weight 0
* ``clef``       a local Clef server (``--clef http://127.0.0.1:8790/v1``); ``clef_raw`` likewise

    app/.venv/bin/python -B app/tests/decision_eval.py --branches llm,decision,decision_raw --out results/x.json
    app/.venv/bin/python -B app/tests/decision_eval.py --branches gemma --out results/gemma.json --resume --budget 420
    app/.venv/bin/python -B app/tests/decision_eval.py --combine a.json b.json c.json --out results/final.json
    app/.venv/bin/python -B app/tests/decision_eval.py --report results/final.json   # tables only

``--resume`` skips (task, TC, branch) results already in ``--out``; the file is saved after every TC. ``--budget`` stops
before the next TC once that many seconds have passed (exit 75 = not finished, run the same command again). Task inputs
are built deterministically (retrieval · rule analysis are offline), so every branch and every process sees the same input.
Answer keys come from labelled data already in the repo:

* search.rerank    layout eval L1/L3 ``gold.layouts_any`` for one part per case → hit@1 · hit@3 · MRR of the final order
* catalog.rank     layout eval L2 ``gold.scenario_any`` (Best Scenario) for the case's request text → hit@1 · hit@3 · MRR
* review.route     proposal_score perturbations (``PERTURB[kind].targets``) → target recall of the selected criteria
* layout.pick      layout eval L1 ``gold.layouts_any`` per part type → share of evaluable slides whose primary is a gold layout
* layout.best_pick layout eval L2 ``gold.scenario_any`` → chosen ∈ gold (top-1) · any of top-3 ∈ gold
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import importlib
import json
import platform
import statistics
import subprocess
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from app.api.llm import decision as dm  # noqa: E402
from app.api.poc import imports, knowledge  # noqa: E402
from app.api.poc.backends import ModeTracker, make_layout_llm, make_score_backend  # noqa: E402
from app.api.poc.provider import get_provider, get_provider_for  # noqa: E402
from app.api.poc.settings import DECISION_TASKS, get_settings, provider_settings  # noqa: E402
from app.api.poc.adapters import catalog_rank, search  # noqa: E402

CASES = ROOT / 'poc/test/layout_agent/eval/cases'
OUT = ROOT / 'docs/decision-model/results'
EQUIV = {'L_RM_A': ['L_PH_RQ_C', 'L_PH_US_A'], 'L_VP_D': ['L_PH_VP_D'], 'L_BM_A': ['L_PH_BM_A']}  # eval/metrics.py
JEV_USD_PER_MTOK = 0.042
LLM_INPUT_TPM = 16_000   # gemma-4-31b on the Gemini API (tier 2): input tokens per minute
PACED = {'gemma': LLM_INPUT_TPM}  # branches paced under an input-token-per-minute quota (pause not counted in latency)
RAW_TASKS = ('search.rerank', 'catalog.rank', 'catalog.rank:compact', 'layout.best_pick')  # ranking tasks with a retrieval prior
LLM_BRANCHES = ('llm', 'llm_think', 'gemma')
MODEL_BRANCHES = ('llm', 'llm_think', 'gemma', 'decision', 'decision_raw', 'clef', 'clef_raw')
EXIT_UNFINISHED = 75


def case(cid: str) -> dict:
    return json.loads((CASES / f'{cid}.json').read_text(encoding='utf-8'))


def gold_set(xs: List[str]) -> set:
    return set(xs) | {e for x in xs for e in EQUIV.get(x, [])}


def rank_metrics(order: List[str], gold: set) -> dict:
    pos = next((i for i, x in enumerate(order) if x in gold), None)
    return {'hit1': float(bool(order) and order[0] in gold), 'hit3': float(pos is not None and pos < 3), 'mrr': 0.0 if pos is None else 1.0 / (pos + 1),
            'gold_rank': None if pos is None else pos + 1}


CLEF_TIMEOUT = 300  # local server answers one request at a time; a split catalog pool is several ~15k-token requests


class Replay:
    """The ``_raw`` ablation replays the answers of the main branch for the same request, so the two differ only in the
    ranking blend (Clef is deterministic — one forward pass, a repeated request gives identical probabilities — so this
    equals asking again). Replayed asks report 0 ms / 0 tokens (the ablation's latency is not a measurement)."""

    def __init__(self, client: Any) -> None:
        self.client, self.model, self.replay, self._seen = client, client.model, False, {}

    def ask(self, *, stage: str, state: Any, questions: Any, cancel: Any = None) -> Any:
        key = json.dumps([state, questions], ensure_ascii=False, sort_keys=True)
        if self.replay and key in self._seen:
            hit = self._seen[key]
            return dm.DecisionResult(answers=hit.answers, model=hit.model, ms=0, attempts=0)
        res = self.client.ask(stage=stage, state=state, questions=questions, cancel=cancel)
        self._seen[key] = res
        return res


def _need(pair: tuple, what: str) -> Any:
    provider, reason = pair
    if provider is None:
        raise SystemExit(f'{what} unavailable: {reason}')
    return provider


class Env:
    def __init__(self, wanted: List[str], clef: str = '', clef_model: str = 'clef-flash') -> None:
        self.settings = get_settings()
        base = {b.removesuffix('_raw') for b in wanted}
        self.default = _need(get_provider(self.settings), 'LLM provider')  # the app's profile; idle in decision branches
        self.llms: Dict[str, Any] = {'llm': self.default}
        if 'llm_think' in base:
            think = dataclasses.replace(provider_settings('openrouter'), reasoning='on')
            self.llms['llm_think'] = _need(get_provider_for('openrouter:think', think), 'OpenRouter (reasoning on)')
        if 'gemma' in base:
            self.llms['gemma'] = _need(get_provider_for('gemini'), 'gemini profile')
        self.clients: Dict[str, Any] = {}
        if 'decision' in base:
            if not self.settings.has_decision_key:
                raise SystemExit('TYPESAFE_API_KEY 가 없어 Decision 분기를 평가할 수 없습니다.')
            self.clients['decision'] = Replay(dm.TypeSafeDecision(self.settings))
        if 'clef' in base:
            if not clef:
                raise SystemExit('clef 분기에는 --clef <endpoint> 가 필요합니다.')
            # the local Clef server has no auth: a placeholder key, never the TypeSafe key
            self.clients['clef'] = Replay(dm.TypeSafeDecision(dataclasses.replace(
                self.settings, decision_base_url=clef.rstrip('/'), decision_model=clef_model, decision_timeout=CLEF_TIMEOUT, _decision_key='local')))
        self.llm = self.default
        self.todo: List[str] = []
        self.L = imports.layout()
        self.kb, self.index = knowledge.layout_assets(self.settings.kb_cache)


def timed(fn: Callable[[], Any]) -> tuple:
    t0 = time.time()
    out = fn()
    return out, int((time.time() - t0) * 1000)


class CountingTracker(ModeTracker):
    """ModeTracker that also sums transport attempts (429 · 5xx retries show up as attempts > calls)."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.attempts = 0

    def record_ok(self, result, step=''):
        super().record_ok(result, step)
        self.attempts += int(getattr(result, 'attempts', 1) or 1)


def usage(tracker: CountingTracker) -> dict:
    return {'calls': tracker.ok, 'attempts': tracker.attempts, 'failed': tracker.failed, 'rejected': tracker.rejected,
            'prompt_tokens': tracker.prompt_tokens, 'output_tokens': tracker.output_tokens, 'models': sorted(tracker.models)}


def _prior_weight(value: float) -> None:
    """Set the retrieval-prior weight of every ranking branch (0 = decision model only, for the ablation)."""
    dm.PRIOR_WEIGHT = value
    importlib.import_module('winmate_layout.decision').PRIOR_WEIGHT = value


def run_branch(fn: Callable[[Any, ModeTracker], Any], env: Env, branch: str) -> dict:
    """LLM branches run the task with that provider; decision branches with that client (``_raw`` = prior weight 0)."""
    base = branch.removesuffix('_raw')
    raw = branch != base
    client = env.clients.get(base)
    env.llm = env.llms.get(base, env.default)
    tracker = CountingTracker('real', env.llm)
    if raw:
        _prior_weight(0.0)
    if hasattr(client, 'replay'):
        client.replay = raw
    try:
        out, ms = timed(lambda: fn(client, tracker))
        res = {'ok': True, 'ms': ms, 'usage': usage(tracker), **out}
    except Exception as exc:  # noqa: BLE001 — a failed TC is a result, not a crash
        res = {'ok': False, 'ms': 0, 'usage': usage(tracker), 'error': f'{type(exc).__name__}: {str(exc)[:300]}', 'trace': traceback.format_exc()[-1500:]}
    finally:
        if raw:
            _prior_weight(1.0)
        env.llm = env.default
    if base in PACED:  # stay under the input-token-per-minute quota so the next TC is not rate-limited
        time.sleep(min(70.0, max(2.0, res['usage']['prompt_tokens'] / PACED[base] * 60 + 2) if res['ok'] else 62.0))
    return res


def branches(run: Callable, env: Env, name: str) -> dict:
    """Run the branches still to do for this TC (main branch before its ``_raw`` replay)."""
    return {br: run_branch(run, env, br) for br in env.todo if not br.endswith('_raw') or name in RAW_TASKS}


# ---------------------------------------------------------------- search.rerank
SEARCH_TCS = [('C01_L1', 'value'), ('C02_L1', 'products'), ('C03_L1', 'value'), ('C04_L3', 'requirements'), ('C05_L1', 'products'),
              ('C06_L3', 'spec'), ('C07_L3', 'why'), ('C08_L1', 'value'), ('C09_L3', 'cost'), ('C10_L3', 'execution')]


def tcs_search(env: Env) -> List[dict]:
    L, out = env.L, []
    for cid, part in SEARCH_TCS:
        tc = case(cid)
        label = env.kb.PARTS[part]['label']
        q = f"{tc['title']} {label} 장표"
        ind, strategy, level = tc['gold'].get('industry') or tc.get('industry'), tc.get('strategy'), tc['gold'].get('level', 'ambiguous')
        p = {'id': 'S01', 'type': part, 'name': q, 'items': [], 'seed_layouts': [], 'req_ids': [], 'slides': 1}
        ctx = {'industry': ind, 'industry_name': env.kb.ind_name(ind), 'customer': '고객사', 'project': '', 'target': '', 'products': [], 'solutions': [],
               'cases': [], 'spaces': []}
        analysis = {'requirements': [], 'keymen': [], 'goals': [], 'facts': [], 'req_type': None, 'context_level': level}
        ranked = L.layout_design.rank_slide(env.kb, env.index, p, 0, ctx, analysis, L.layout_design.available_info(analysis, ctx), level, strategy,
                                            top=search.RERANK_POOL)
        pool = list(ranked['candidates'])[:search.RERANK_POOL]
        out.append({'id': f'{cid}:{part}', 'q': q, 'part': part, 'industry': ind, 'strategy': strategy, 'level': level, 'pool': pool,
                    'gold': sorted(gold_set(tc['gold']['layouts_any'][part])), 'gold_in_pool': bool(gold_set(tc['gold']['layouts_any'][part]) & {c['f'] for c in pool})})
    return out


def eval_search(env: Env, tc: dict) -> dict:
    pool, gold = tc['pool'], set(tc['gold'])

    def task(decision, tracker):
        order = search._rerank(env.llm, env.llm.model_for('quick'), tracker, env.kb, tc['q'], tc['part'], tc['industry'], tc['strategy'],
                               tc['level'], [], pool, decision)
        listed = [f for f, _ in order]
        final = listed + [c['f'] for c in pool if c['f'] not in listed]  # same assembly as the adapter
        return {'output': [{'f': f, 'why': w} for f, w in order], 'final': final[:10], 'metrics': rank_metrics(final, gold)}
    base = [c['f'] for c in pool]
    return {'baseline': {'final': base[:10], 'metrics': rank_metrics(base, gold)}, **branches(task, env, 'search.rerank')}


# ---------------------------------------------------------------- catalog.rank
L2 = [f'C{i:02d}_L2' for i in range(1, 11)]


def scenario_candidates(env: Env) -> List[dict]:
    """Best Scenario documents with the fields the browser sends (catalog-search.js scenarioDocument, 550-char cut)."""
    kb, out = env.kb, []
    names = lambda ids, table, read: [read(table[i]) for i in ids or [] if i in table]  # noqa: E731
    for s in kb.best_scenarios:
        strat = kb.STRATEGIES.get(s['strategy'], {})
        fields = [['제목', s['title']], ['요약', s['short']], ['업종', kb.ind_name(s['ind']) if s.get('ind') else '범용 · 업종 무관'],
                  ['요구사항', kb.REQ_TYPES.get(s['req'], {}).get('label', s['req'])], ['전략', f"{strat.get('label', '')} {strat.get('desc', '')}"],
                  ['결말', s.get('ask', '')], ['솔루션', ' '.join(names(s.get('solutions'), kb.S, lambda x: x.get('name', '')))],
                  ['제품', ' '.join(names(s.get('products'), kb.P, lambda x: x.get('name', '')))],
                  ['상황', s['situation']], ['고객의 말', ' '.join(s['signals'])], ['핵심 주장', s['thesis']], ['논리 전개', ' '.join(s['logic'])],
                  ['차별화', ' '.join(s.get('diff') or [])], ['핵심 메시지', ' '.join(s['messages'])], ['언제 쓰나', s['fit']],
                  ['결정권자', ' '.join([s['audience']['lead'], *s['audience']['others']])], ['평가 기준', ' '.join(s['criteria'])],
                  ['성공 지표', ' '.join(s['kpis'])], ['준비 자료', ' '.join(s.get('prep') or [])],
                  ['예상 반론', ' '.join(x for pair in s.get('objections') or [] for x in pair)], ['다음 할 일', ' '.join(s.get('next') or [])]]
        out.append({'id': s['id'], 'fields': [[k, ' '.join(str(v).split())[:550]] for k, v in fields if str(v).strip()]})
    return out


def tcs_catalog(env: Env) -> List[dict]:
    """Request = the case's customer text; pool = top 50 by TF-IDF (stand-in for the browser's keyword + BM25/TF-IDF pool)."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    cands = scenario_candidates(env)
    docs = [' '.join(v for _, v in c['fields']) for c in cands]
    out = []
    for cid in L2:
        tc = case(cid)
        q = ' '.join(tc['input']['free_text'].split())[:300]
        m = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 4), sublinear_tf=True).fit_transform(docs + [q])
        sim = (m[:-1] @ m[-1].T).toarray().ravel()
        pool = [cands[i] for i in sorted(range(len(cands)), key=lambda i: -sim[i])[:catalog_rank.MAX_CANDIDATES]]
        out.append({'id': cid, 'q': q, 'candidates': pool, 'count': 10, 'gold': tc['gold']['scenario_any'],
                    'gold_in_pool': bool(set(tc['gold']['scenario_any']) & {c['id'] for c in pool}), 'retrieval_order': [c['id'] for c in pool]})
    return out


COMPACT_FIELDS = ('제목', '요약', '업종', '요구사항', '전략', '상황', '언제 쓰나')


def tcs_catalog_compact(env: Env) -> List[dict]:
    """Same requests and gold, a pool the LLM can take within its 16k input-token/minute quota: top 20, 7 fields × 110 chars."""
    out = []
    for tc in tcs_catalog(env):
        pool = [{'id': c['id'], 'fields': [[k, v[:110]] for k, v in c['fields'] if k in COMPACT_FIELDS]} for c in tc['candidates'][:20]]
        out.append({**tc, 'task': 'catalog.rank:compact', 'candidates': pool, 'retrieval_order': [c['id'] for c in pool],
                    'gold_in_pool': bool(set(tc['gold']) & {c['id'] for c in pool})})
    return out


def eval_catalog(env: Env, tc: dict) -> dict:
    gold = set(tc['gold'])

    def task(decision, tracker):
        order, model = catalog_rank.rank('scenarios', tc['q'], {}, tc['candidates'], tc['count'], provider=env.llm, decision=decision, tracker=tracker)
        ids = [x['id'] for x in order]
        return {'output': order, 'final': ids, 'metrics': rank_metrics(ids, gold), 'model': model}
    base = tc['retrieval_order'][:tc['count']]
    return {'baseline': {'final': base, 'metrics': rank_metrics(base, gold)}, **branches(task, env, tc.get('task', 'catalog.rank'))}


# ---------------------------------------------------------------- review.route
ROUTE_TCS = [(pid, kind) for pid in ('bs10', 'bs01') for kind in ('wrong_customer', 'placeholders', 'no_proof', 'number_conflict', 'strip_images')]


def tcs_route(env: Env) -> List[dict]:
    return [{'id': f'{pid}:{kind}', 'pid': pid, 'kind': kind} for pid, kind in ROUTE_TCS]


def eval_route(env: Env, tc: dict) -> dict:
    ps = imports.score()
    router = importlib.import_module('proposal_score.router')
    checks = importlib.import_module('proposal_score.checks')
    cs, tax, _ = knowledge.score_assets()
    proposals = ps.proposal.load_best()
    catalog = ps.proposal.load_catalog()
    by = {p.id: p for p in proposals}
    other = next(p.customer for p in proposals if p.id != tc['pid'])
    p = ps.pipeline.perturbed(by[tc['pid']], tc['kind'], other)
    gates = ps.criteria.applicable(cs, checks.profile(p, catalog))
    F = checks.auto_checks(p, catalog, [x.customer for x in proposals])
    targets = ps.pipeline.PERTURB[tc['kind']]['targets']

    def summarize(r) -> dict:
        sel = list(r.selected)
        return {'selected': sel, 'mode': r.mode, 'l1': {x['id']: x['relevance'] for x in r.l1}, 'l2': {x['id']: x['relevance'] for x in r.l2},
                'priority': {x['id']: x['priority'] for x in r.crit}, 'risk': r.risk,
                'metrics': {'target_recall': sum(t in sel for t in targets) / len(targets), 'n_selected': len(sel)}}

    def task(decision, tracker):
        backend = make_score_backend(env.llm, tracker, None, decision=decision)
        r = router.route(p, cs, tax, gates, F, backend, budget=12, min_k=10, temperature=None)
        if r.mode != 'llm':
            raise RuntimeError(f'route mode {r.mode}: {r.error}')
        return summarize(r)
    base = summarize(router.route(p, cs, tax, gates, F, None, budget=12, min_k=10))
    return {'targets': targets, 'baseline': base, **branches(task, env, 'review.route')}


# ---------------------------------------------------------------- layout.pick · layout.best_pick (inputs captured from an offline graph run)
def capture(env: Env, cid: str, level: str) -> dict:
    L = env.L
    graph_mod = L.graph
    got: Dict[str, Any] = {}
    orig_pick, orig_best = graph_mod.llm_pick_batch, graph_mod.match_best

    def cap_pick(kb, llm, parts, ranked, analysis, ctx):
        got.setdefault('pick', (parts, ranked, analysis, ctx))
        return orig_pick(kb, llm, parts, ranked, analysis, ctx)

    def cap_best(kb, analysis, ctx, full_text, llm=None, k=3):
        got.setdefault('best', (analysis, ctx, full_text))
        return orig_best(kb, analysis, ctx, full_text, llm, k)
    graph_mod.llm_pick_batch, graph_mod.match_best = cap_pick, cap_best
    try:
        offline = L.llm.LLM('offline')
        g = L.graph.build_graph(env.kb, offline, env.index)
        g.invoke({'input': case(cid)['input'], 'options': {'force_level': level, 'auto_answer': True}}, config=L.graph.run_config(f'eval-{cid}-{time.time()}', offline))
    finally:
        graph_mod.llm_pick_batch, graph_mod.match_best = orig_pick, orig_best
    return got


def tcs_pick(env: Env) -> List[dict]:
    out = []
    for i in range(1, 11):
        cid = f'C{i:02d}_L1'
        parts, ranked, analysis, ctx = capture(env, cid, 'minimal')['pick']
        out.append({'id': cid, 'parts': parts, 'ranked': ranked, 'analysis': analysis, 'ctx': ctx,
                    'gold': {k: sorted(gold_set(v)) for k, v in case(cid)['gold']['layouts_any'].items()}})
    return out


def pick_metrics(cur: List[dict], parts: List[dict], gold: Dict[str, List[str]]) -> dict:
    ptype = {p['id']: p['type'] for p in parts}
    n = hits = 0
    prim = {}
    for r in cur:
        if not r['candidates']:
            continue
        key = f"{r['part_id']}#{r['slide']}"
        prim[key] = r['candidates'][0]['f']
        g = set(gold.get(ptype.get(r['part_id']), []))
        if g and g & {c['f'] for c in r['candidates'][:5]}:
            n += 1
            hits += prim[key] in g
    return {'evaluable': n, 'hits': hits, 'acc': (hits / n) if n else None}, prim


def eval_pick(env: Env, tc: dict) -> dict:
    L = env.L

    def task(decision, tracker):
        llm = make_layout_llm(env.llm, tracker, None, decisions={'layout.pick': decision} if decision is not None else None)
        cur = L.layout_design.llm_pick_batch(env.kb, llm, tc['parts'], tc['ranked'], tc['analysis'], tc['ctx'])
        m, prim = pick_metrics(cur, tc['parts'], tc['gold'])
        return {'final': prim, 'metrics': m}
    m, prim = pick_metrics(tc['ranked'], tc['parts'], tc['gold'])
    return {'baseline': {'final': prim, 'metrics': m}, **branches(task, env, 'layout.pick')}


def tcs_best(env: Env) -> List[dict]:
    out = []
    for cid in L2:
        analysis, ctx, full_text = capture(env, cid, 'ambiguous')['best']
        out.append({'id': cid, 'analysis': analysis, 'ctx': ctx, 'full_text': full_text, 'gold': case(cid)['gold']['scenario_any']})
    return out


def eval_best(env: Env, tc: dict) -> dict:
    scen = importlib.import_module('winmate_layout.scenarios')
    gold = set(tc['gold'])

    def summarize(m) -> dict:
        ids = [c['id'] for c in m['candidates']]
        return {'final': ids, 'chosen': m['chosen'], 'llm_used': m['llm'],
                'metrics': {'top1': float(m['chosen'] in gold), 'top3': float(bool(gold & set(ids[:3])))}}

    def task(decision, tracker):
        llm = make_layout_llm(env.llm, tracker, None, decisions={'layout.best_pick': decision} if decision is not None else None)
        m = scen.match_best(env.kb, tc['analysis'], tc['ctx'], tc['full_text'], llm)
        if not m['llm']:
            raise RuntimeError('model did not decide (rule order kept)')
        return summarize(m)
    return {'baseline': summarize(scen.match_best(env.kb, tc['analysis'], tc['ctx'], tc['full_text'], None)),
            **branches(task, env, 'layout.best_pick')}


TASKS = {'search.rerank': (tcs_search, eval_search), 'catalog.rank': (tcs_catalog, eval_catalog),
         'catalog.rank:compact': (tcs_catalog_compact, eval_catalog), 'review.route': (tcs_route, eval_route),
         'layout.pick': (tcs_pick, eval_pick), 'layout.best_pick': (tcs_best, eval_best)}
TASK_ORDER = [t for t in [*DECISION_TASKS[:2], 'catalog.rank:compact', *DECISION_TASKS[2:]] if t in TASKS]  # spatial.command has no eval set here
SLIM = ('pool', 'candidates', 'parts', 'ranked', 'analysis', 'ctx', 'full_text')


def _sysctl(key: str) -> str:
    try:
        return subprocess.run(['sysctl', '-n', key], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:  # noqa: BLE001
        return ''


def branch_meta(env: Env, wanted: List[str]) -> dict:
    out: Dict[str, Any] = {}
    for br in wanted:
        base = br.removesuffix('_raw')
        if base in LLM_BRANCHES:
            p = env.llms[base]
            out[br] = {'kind': 'llm', 'provider': p.name, 'model': p.model, 'quick_model': p.model_for('quick'),
                       'reasoning': getattr(p._settings, 'reasoning', '') or None}
        else:
            c = env.clients[base].client
            out[br] = {'kind': 'decision', 'model': c.model, 'endpoint_host': c.base.split('/')[2], 'limits': dataclasses.asdict(c.limits),
                       'timeout_s': c.timeout, 'prior_weight': 0.0 if br.endswith('_raw') else dm.PRIOR_WEIGHT}
    mem = _sysctl('hw.memsize')
    out['_machine'] = {'chip': _sysctl('machdep.cpu.brand_string'), 'model': _sysctl('hw.model'),
                       'memory_gb': round(int(mem) / 2 ** 30) if mem.isdigit() else None, 'os': platform.platform()}
    return out


def fingerprint(tc: dict) -> str:
    """Hash of the full TC input (pools, cards, analysis…) — equal fingerprints = every branch saw the same input."""
    def plain(o):
        if isinstance(o, (set, frozenset)):
            return sorted(o, key=str)
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        return getattr(o, '__dict__', None) or str(o)
    return hashlib.sha256(json.dumps(tc, sort_keys=True, ensure_ascii=False, default=plain).encode('utf-8')).hexdigest()[:16]


def _save(path: Path, result: dict) -> None:
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(result, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
    tmp.replace(path)


def _line(tc_id: str, row: dict, ran: List[str]) -> str:
    def one(br):
        r = row[br]
        return f"{br} {r.get('ms', 0)}ms {json.dumps(r.get('metrics'), ensure_ascii=False)}" + ('' if r.get('ok') else f" ERR {r.get('error', '')[:120]}")
    return f'  {tc_id:<24} ' + ' | '.join(one(br) for br in ran)


def run_eval(args, wanted: List[str]) -> int:
    path = Path(args.out).resolve()  # before Env(): loading the PoC modules changes the cwd
    started = time.time()
    env = Env(wanted, args.clef, args.clef_model)
    if args.resume and path.is_file():
        result = json.loads(path.read_text(encoding='utf-8'))
    else:
        result = {'meta': {'started': datetime.now().isoformat(timespec='seconds'), 'tc_per_task': 10}, 'tasks': {}}
    result['meta'].setdefault('branches', {}).update(branch_meta(env, wanted))
    path.parent.mkdir(parents=True, exist_ok=True)
    for name in [t.strip() for t in args.tasks.split(',') if t.strip()]:
        build, run = TASKS[name]
        tcs = build(env)
        rows = result['tasks'].setdefault(name, [])
        print(f'== {name}', flush=True)
        for i, tc in enumerate(tcs):
            if i == len(rows):
                rows.append({'tc': {k: v for k, v in tc.items() if k not in SLIM}, 'tc_fp': fingerprint(tc)})
            row = rows[i]
            assert row['tc']['id'] == tc['id'], (name, row['tc']['id'], tc['id'])
            if row.get('tc_fp') != fingerprint(tc):
                raise SystemExit(f'{name} {tc["id"]}: TC input changed since this file was started (fingerprint) — use a frozen tree')
            env.todo = [br for br in wanted if br not in row]
            if not [br for br in env.todo if not br.endswith('_raw') or name in RAW_TASKS]:
                continue
            if args.budget and time.time() - started > args.budget:
                _save(path, result)
                print(f'budget reached — unfinished, run again with --resume ({path})', flush=True)
                return EXIT_UNFINISHED
            out = run(env, tc)
            ran = [br for br in out if br in MODEL_BRANCHES]
            if 'baseline' in row and row['baseline'].get('final') != out['baseline'].get('final'):
                raise SystemExit(f'{name} {tc["id"]}: rule baseline changed between runs — TC input is not the same')
            row.update(out)
            _save(path, result)
            print(_line(tc['id'], row, ran), flush=True)
    result['meta']['finished'] = datetime.now().isoformat(timespec='seconds')
    _save(path, result)
    print('complete', path)
    return 0


def combine(files: List[str], out: str) -> dict:
    """Merge branch results of several runs on the same TCs (each TC's rule baseline must be identical)."""
    parts = [json.loads(Path(f).read_text(encoding='utf-8')) for f in files]
    result = {'meta': {'combined': [str(Path(f).name) for f in files], 'branches': {}, 'parts': [p['meta'] for p in parts], 'tc_per_task': 10},
              'tasks': {}}
    for p in parts:
        result['meta']['branches'].update(p['meta'].get('branches', {}))
        for name, rows in p['tasks'].items():
            dst = result['tasks'].setdefault(name, [])
            for i, row in enumerate(rows):
                if i == len(dst):
                    dst.append({'tc': row['tc'], 'tc_fp': row.get('tc_fp')})
                d = dst[i]
                assert d['tc']['id'] == row['tc']['id']
                if d.get('tc_fp') != row.get('tc_fp'):
                    raise SystemExit(f'{name} {row["tc"]["id"]}: runs saw different TC inputs (fingerprints differ)')
                if 'baseline' in d and 'baseline' in row and d['baseline'].get('final') != row['baseline'].get('final'):
                    raise SystemExit(f'{name} {row["tc"]["id"]}: runs saw different TC inputs (rule baselines differ)')
                d.update({k: v for k, v in row.items() if k != 'tc'})
    _save(Path(out).resolve(), result)
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--tasks', default=','.join(TASK_ORDER))
    ap.add_argument('--branches', default='llm,decision,decision_raw', help=f'comma list of {", ".join(MODEL_BRANCHES)}')
    ap.add_argument('--out', default='')
    ap.add_argument('--resume', action='store_true')
    ap.add_argument('--budget', type=float, default=0, help='seconds; stop before the next TC after that (exit 75)')
    ap.add_argument('--clef', default='', help='local Clef System One endpoint, e.g. http://127.0.0.1:8790/v1')
    ap.add_argument('--clef-model', default='clef-flash')
    ap.add_argument('--combine', nargs='*', default=None, help='results JSON files to merge into --out')
    ap.add_argument('--report', default='')
    args = ap.parse_args()
    if args.report:
        print(report(json.loads(Path(args.report).read_text(encoding='utf-8'))))
        return
    if args.combine:
        print(report(combine(args.combine, args.out)))
        return
    wanted = [b.strip() for b in args.branches.split(',') if b.strip()]
    bad = [b for b in wanted if b not in MODEL_BRANCHES]
    if bad:
        raise SystemExit('unknown branches: ' + ', '.join(bad))
    wanted = sorted(wanted, key=MODEL_BRANCHES.index)  # a main branch always runs before its _raw replay
    args.out = args.out or str(OUT / f'{datetime.now().strftime("%Y%m%d-%H%M%S")}.json')
    raise SystemExit(run_eval(args, wanted))


# ---------------------------------------------------------------- report tables
PRIMARY = {'search.rerank': ('mrr', 'MRR'), 'catalog.rank': ('mrr', 'MRR'), 'catalog.rank:compact': ('mrr', 'MRR'), 'review.route': ('target_recall', '목표 기준 재현율'),
           'layout.pick': ('acc', '정답 레이아웃 일치율'), 'layout.best_pick': ('top1', 'top-1 정답률')}
PCT_TASKS = ('review.route', 'layout.pick', 'layout.best_pick')
BRANCHES = ('baseline', *MODEL_BRANCHES)
LABEL = {'baseline': '규칙 기준선', 'llm': 'Qwen3.6(기본)', 'llm_think': 'Qwen3.6 생각 켬', 'gemma': 'gemma-4-31b', 'decision': 'Jev',
         'decision_raw': 'Jev만(사전 점수 제외)', 'clef': 'Clef', 'clef_raw': 'Clef만(사전 점수 제외)'}
USD_PER_MTOK = {'llm': (0.10, 0.90), 'llm_think': (0.10, 0.90), 'decision': (JEV_USD_PER_MTOK, 0.0), 'clef': (0.0, 0.0)}  # (input, output)
PAIRS = (('decision', 'llm'), ('clef', 'llm'), ('decision', 'clef'), ('llm_think', 'llm'), ('gemma', 'llm'))


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _agreement(name: str, a: dict, b: dict):
    if not (a.get('ok') and b.get('ok')):
        return None
    if name in ('search.rerank', 'catalog.rank', 'catalog.rank:compact'):
        return float(a['final'][:1] == b['final'][:1])
    if name == 'layout.best_pick':
        return float(a['chosen'] == b['chosen'])
    if name == 'layout.pick':
        keys = set(a['final']) & set(b['final'])
        return sum(a['final'][k] == b['final'][k] for k in keys) / len(keys) if keys else None
    sa, sb = set(a['selected']), set(b['selected'])
    return len(sa & sb) / len(sa | sb) if sa | sb else None


def _pair(name: str, rows: List[dict], a: str, b: str) -> dict:
    key, _ = PRIMARY[name]
    win = tie = loss = 0
    for r in rows:
        if a not in r or b not in r:
            continue
        x, y = (r[a].get('metrics') or {}).get(key), (r[b].get('metrics') or {}).get(key)
        if x is None or y is None or not r[a].get('ok') or not r[b].get('ok'):
            continue
        win += x > y
        tie += x == y
        loss += x < y
    paired = [(r[a]['metrics'][key], r[b]['metrics'][key]) for r in rows if a in r and b in r and r[a].get('ok') and r[b].get('ok')
              and (r[a].get('metrics') or {}).get(key) is not None and (r[b].get('metrics') or {}).get(key) is not None]
    return {'a_better': win, 'tie': tie, 'b_better': loss, 'n': len(paired),
            'a_paired': _mean([x for x, _ in paired]), 'b_paired': _mean([y for _, y in paired]),
            'agreement': _mean([_agreement(name, r[a], r[b]) for r in rows if a in r and b in r])}


def summary(result: dict) -> dict:
    out = {}
    for name, rows in result['tasks'].items():
        key, _ = PRIMARY[name]
        s = {}
        for br in BRANCHES:
            got = [r[br] for r in rows if br in r]
            if not got:
                continue
            ok = [g for g in got if g.get('ok', True)]
            metric_keys = sorted({k for g in ok for k, v in (g.get('metrics') or {}).items() if isinstance(v, (int, float))})
            s[br] = {'n': len(got), 'ok': len(ok), 'metrics': {k: _mean([g['metrics'].get(k) for g in ok]) for k in metric_keys},
                     'primary': _mean([g['metrics'].get(key) for g in ok])}
            if br != 'baseline':
                ms = [g['ms'] for g in ok]
                pin, pout = USD_PER_MTOK.get(br, (None, None))
                tokens_in, tokens_out = sum(g['usage']['prompt_tokens'] for g in got), sum(g['usage']['output_tokens'] for g in got)
                s[br].update(ms_mean=_mean(ms), ms_median=statistics.median(ms) if ms else None, ms_max=max(ms) if ms else None,
                             ms_min=min(ms) if ms else None, calls=sum(g['usage']['calls'] for g in got),
                             attempts=sum(g['usage'].get('attempts', 0) for g in got), prompt_tokens=tokens_in, output_tokens=tokens_out,
                             usd=None if pin is None else (tokens_in * pin + tokens_out * pout) / 1e6,
                             errors=sorted({(g.get('error') or '')[:80] for g in got if not g.get('ok', True)}))
        s['pairs'] = {f'{a}-{b}': _pair(name, rows, a, b) for a, b in PAIRS if a in s and b in s}
        out[name] = s
    return out


def _f(x, pct=False, nd=2):
    if x is None:
        return '–'
    return f'{x * 100:.0f}%' if pct else f'{x:.{nd}f}'


def labels(result: dict) -> Dict[str, str]:
    """Column names from the models recorded in the result (older results: ``meta.llm_model``)."""
    meta = result.get('meta') or {}
    out = dict(LABEL)
    for br, m in (meta.get('branches') or {}).items():
        if br.startswith('_') or not isinstance(m, dict):
            continue
        name = str(m.get('model', '')).split('/')[-1]
        if m.get('kind') == 'llm':
            out[br] = name + {'off': ' (생각 끔)', 'on': ' (생각 켬)'}.get(m.get('reasoning') or '', '')
        elif not br.endswith('_raw'):
            out[br] = name
            out[br + '_raw'] = name + '만(사전 점수 제외)'
    if meta.get('llm_model') and 'llm' not in (meta.get('branches') or {}):
        out['llm'] = meta['llm_model']
    return out


def report(result: dict) -> str:
    s = summary(result)
    LABEL = labels(result)  # noqa: N806 — shadows the defaults with the result's model names
    present = [br for br in MODEL_BRANCHES if any(br in x for x in s.values())]
    main = [br for br in present if not br.endswith('_raw')]
    raw = [br for br in present if br.endswith('_raw')]

    def cell(x, br, pct):
        if br not in x:
            return '–'
        b = x[br]
        return (_f(b['primary'], pct) if b['ok'] else '실패') + (f" ({b['ok']}/{b['n']} 성공)" if b['ok'] < b['n'] else '')
    cols = main + raw + ['baseline']
    lines = ['| 작업 | 지표 | ' + ' | '.join(LABEL[c] for c in cols) + ' |', '|---|---|' + '---|' * len(cols)]
    for name, x in s.items():
        lines.append(f"| {name} | {PRIMARY[name][1]} | " + ' | '.join(cell(x, c, name in PCT_TASKS) for c in cols) + ' |')

    pairs = [f'{a}-{b}' for a, b in PAIRS if a in present and b in present]
    lines += ['', '| 작업 | ' + ' | '.join(f'{LABEL[p.split("-")[0]]} 대 {LABEL[p.split("-")[1]]}: 우세 / 같음 / 열세 (둘 다 성공 TC) · 1위 일치' for p in pairs) + ' |',
              '|---|' + '---|' * len(pairs)]
    for name, x in s.items():
        cells = []
        for p in pairs:
            q = x['pairs'].get(p)
            cells.append('–' if not q or not q['n'] else f"{q['a_better']} / {q['tie']} / {q['b_better']} (n={q['n']}) · {_f(q['agreement'], True)}")
        lines.append(f'| {name} | ' + ' | '.join(cells) + ' |')

    def ms(b):
        return '–' if not b or not b.get('ms_mean') else f"{_f(b['ms_mean'], nd=0)} · {_f(b['ms_median'], nd=0)} · {_f(b['ms_max'], nd=0)}"
    lines += ['', '| 작업 | ' + ' | '.join(f'{LABEL[c]} 평균 · 중앙값 · 최대 (ms)' for c in main) + ' |', '|---|' + '---|' * len(main)]
    for name, x in s.items():
        lines.append(f'| {name} | ' + ' | '.join(ms(x.get(c)) for c in main) + ' |')
    lines += ['', '| 작업 | ' + ' | '.join(f'{LABEL[c]} 호출 · 입력/출력 토큰 · 비용' for c in main) + ' |', '|---|' + '---|' * len(main)]
    for name, x in s.items():
        cells = []
        for c in main:
            b = x.get(c)
            cells.append('–' if not b else f"{b['calls']} · {b['prompt_tokens']:,}/{b['output_tokens']:,} · " + ('–' if b['usd'] is None else f"${b['usd']:.4f}"))
        lines.append(f'| {name} | ' + ' | '.join(cells) + ' |')
    lines += ['', '| 작업 | 분기 | 성공 TC | 세부 지표 평균 | 실패 사유 |', '|---|---|---|---|---|']
    for name, x in s.items():
        for br in BRANCHES:
            if br in x:
                m = ', '.join(f'{k} {_f(v)}' for k, v in x[br]['metrics'].items())
                lines.append(f"| {name} | {LABEL[br]} | {x[br]['ok']}/{x[br]['n']} | {m} | {'; '.join(x[br].get('errors') or []) or ''} |")
    return '\n'.join(lines)


if __name__ == '__main__':
    main()
