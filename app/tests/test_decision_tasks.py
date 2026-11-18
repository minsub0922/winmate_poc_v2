"""Decision-model branches — same task input/output for the LLM and the decision model (TypeSafe Jev).

Offline: the decision model and the LLM are fakes. Checks, per task, that both branches produce the same output
shape through the same validators, that branch selection follows the settings, and that the HTTP client is strict.
"""
from __future__ import annotations

import importlib
import io
import json
import sys
import urllib.error
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.api.llm import decision as dm  # noqa: E402
from app.api.llm.provider import GenerationResult, ProviderError  # noqa: E402
from app.api.poc import imports  # noqa: E402
from app.api.poc.backends import JobDecision, ModeTracker  # noqa: E402
from app.api.poc.jobs import ModelFailure  # noqa: E402
from app.api.poc.settings import DECISION_TASKS, load_settings  # noqa: E402
from app.api.poc.adapters import catalog_rank, search  # noqa: E402


# ---------------------------------------------------------------- fakes
class FakeDecision:
    """Answers every question: choice → prefers options in ``prefer`` order, score → ``levels[qid]`` (default 1.0)."""
    name, model = 'typesafe', 'jev-test'

    def __init__(self, levels=None, prefer=None, fail=None):
        self.levels, self.prefer, self.fail = levels or {}, prefer or [], fail
        self.calls = []

    def answers(self, questions):
        out = {}
        for qid, q in questions.items():
            if q['type'] == 'choice':
                opts = list(q['criteria'])
                best = next((o for o in self.prefer if o in opts), opts[-1])
                probs = {o: (0.9 if o == best else round(0.1 / max(1, len(opts) - 1), 4)) for o in opts}
                out[qid] = {'type': 'choice', 'choice': best, 'confidence': 0.8, 'probabilities': probs}
            elif q['type'] == 'score':
                v = float(self.levels.get(qid, 1.0))
                n = len(q['criteria'])
                out[qid] = {'type': 'score', 'score': v, 'confidence': 0.5, 'probabilities': {str(i): 1.0 / n for i in range(n)}}
            else:
                out[qid] = {'type': 'noul', 'noul': 0.7}
        return out

    def ask(self, *, stage, state, questions, cancel=None):
        self.calls.append({'stage': stage, 'state': state, 'questions': questions})
        if self.fail:
            raise ProviderError(self.fail, 'fake failure')
        return dm.DecisionResult(self.answers(questions), self.model, 5, input_tokens=100, output_tokens=8)


class PocDecision:
    """What PoC modules see (``ask(stage, state, questions) -> answers``)."""

    def __init__(self, fake):
        self.fake, self.model = fake, fake.model

    def ask(self, stage, state, questions):
        return self.fake.ask(stage=stage, state=state, questions=questions).answers


class FakeProvider:
    name, model, available = 'gemini', 'gemma-test', True

    def __init__(self, data):
        self.data, self.calls = data, []

    def model_for(self, tier):
        return self.model

    def generate_json(self, **kw):
        self.calls.append(kw)
        data = self.data(kw) if callable(self.data) else self.data
        return GenerationResult(data=data, text=json.dumps(data), model=self.model, prompt_tokens=50, output_tokens=20, ms=7)


def settings_with(**env):
    return load_settings(env, [])


# ---------------------------------------------------------------- settings · branch selection
def test_branch_follows_key_switch_and_task_list():
    assert not settings_with().decision_enabled('search.rerank')
    s = settings_with(TYPESAFE_API_KEY='ts-secret-value')
    assert all(s.decision_enabled(t) for t in DECISION_TASKS)
    assert s.decision_model == 'jev-1.14.0' and s.decision_base_url == 'https://api.typesafe.ai/v1'
    assert not settings_with(TYPESAFE_API_KEY='k', WINMATE_DECISION='off').decision_enabled('search.rerank')
    sub = settings_with(TYPESAFE_API_KEY='k', WINMATE_DECISION_TASKS='layout.pick,nope')
    assert sub.decision_enabled('layout.pick') and not sub.decision_enabled('search.rerank')
    assert any('nope' in w for w in sub.warnings)
    public = json.dumps(s.public())
    assert 'ts-secret-value' not in public and '"api_key_configured": true' in public
    assert 'ts-secret-value' not in repr(s)
    dm.set_decision_override(clear=True)
    assert dm.get_decision(settings_with(), 'search.rerank') is None
    assert isinstance(dm.get_decision(s, 'search.rerank'), dm.TypeSafeDecision)


# ---------------------------------------------------------------- HTTP client
class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _client(responses, **env):
    seen = []

    def opener(req, timeout):
        seen.append(req)
        r = responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return _Resp(json.dumps(r).encode())
    s = settings_with(TYPESAFE_API_KEY='ts-key', WINMATE_DECISION_TIMEOUT='10', **env)
    return dm.TypeSafeDecision(s, opener=opener), seen


def _http(code, retry_after=None):
    headers = {'retry-after': retry_after} if retry_after else {}
    return urllib.error.HTTPError('https://api.typesafe.ai/v1/systemone', code, 'x', headers, io.BytesIO(b'{"detail":"x"}'))


QS = {'q': dm.score('relevance', ['no', 'yes']), 'c': dm.choice('pick', {'a': 'A', 'b': 'B'})}
OK = {'model': 'jev-1.14.0', 'usage': {'input_tokens': 42, 'output_tokens': 4},
      'answers': {'q': {'type': 'score', 'score': 0.7, 'confidence': 0.4, 'probabilities': {'0': 0.3, '1': 0.7}},
                  'c': {'type': 'choice', 'choice': 'b', 'confidence': 0.9, 'probabilities': {'a': 0.05, 'b': 0.95}}}}


def test_client_request_shape_usage_and_retry():
    client, seen = _client([_http(429, '0'), dict(OK)])
    res = client.ask(stage='t', state={'x': 1}, questions=QS)
    assert res.model == 'jev-1.14.0' and res.input_tokens == 42 and res.attempts == 2
    req = seen[-1]
    assert req.full_url == 'https://api.typesafe.ai/v1/systemone' and req.headers['Authorization'] == 'Bearer ts-key'
    body = json.loads(req.data)
    assert body['model'] == 'jev-1.14.0' and set(body['questions']) == {'q', 'c'}
    assert dm.ranked_choices(res.answers['c'])[0] == ('b', 0.95) and dm.level(res.answers['q']) == 1
    gen = res.as_generation()
    assert gen.model == 'jev-1.14.0' and gen.prompt_tokens == 42


def test_client_is_strict_and_never_leaks_the_key():
    client, _ = _client([_http(401)])
    with pytest.raises(ProviderError) as e:
        client.ask(stage='t', state='s', questions=QS)
    assert e.value.code == 'auth_failed' and 'ts-key' not in str(e.value)
    bad = json.loads(json.dumps(OK))
    bad['answers'].pop('c')
    client, _ = _client([bad])
    with pytest.raises(ProviderError) as e:
        client.ask(stage='t', state='s', questions=QS)
    assert e.value.code == 'invalid_output'
    wrong = json.loads(json.dumps(OK))
    wrong['answers']['c']['choice'] = 'zzz'
    client, _ = _client([wrong])
    with pytest.raises(ProviderError):
        client.ask(stage='t', state='s', questions=QS)
    with pytest.raises(ValueError):
        dm.choice('x', {})
    with pytest.raises(ValueError):
        dm.score('x', list(range(11)))


def test_job_decision_records_like_an_llm_call_and_types_failures():
    tracker = ModeTracker('real', FakeProvider({}))
    jd = JobDecision(FakeDecision(), tracker, None, 'review:')
    jd.ask('route_l1', 's', {'a': dm.score('x', ['0', '1'])})
    assert tracker.steps == {'review:route_l1': 1} and 'jev-test' in tracker.models and tracker.prompt_tokens == 100
    with pytest.raises(ModelFailure):
        JobDecision(FakeDecision(fail='rate_limited'), tracker, None, 'review:').ask('route_l2', 's', {'a': dm.score('x', ['0', '1'])})
    assert tracker.failed == 1


# ---------------------------------------------------------------- task search.rerank
def _kb():
    cards = {f: {'name': f'name {f}', 'part': 'value', 'when': 'when', 'visual': [], 'data_needs': {'labels': []}} for f in ('L_A', 'L_B', 'L_C', 'L_D')}
    return SimpleNamespace(cards=cards, PARTS={'value': {'label': '가치'}}, P={}, ind_name=lambda x: x)


POOL = [{'f': f, 'code': f, 'score': 1.0 - k * 0.1} for k, f in enumerate(['L_A', 'L_B', 'L_C', 'L_D'])]


def test_search_rerank_both_branches_share_input_and_output(monkeypatch):
    monkeypatch.setattr(search, 'DECISION_PRIOR_WEIGHT', 0.0)  # decision-only order; the blend is tested separately
    kb, tracker = _kb(), ModeTracker('real', None)
    llm = FakeProvider({'order': [{'f': 'L_C', 'why': '고객 요구에 맞음'}, {'f': 'L_A', 'why': '가치'}]})
    out_llm = search._rerank(llm, 'gemma-test', tracker, kb, '가치 제안', 'value', None, None, 'ambiguous', [], POOL)
    fake = FakeDecision(levels={'c2': 2.8, 'c0': 2.1, 'c1': 0.4, 'c3': 1.2})
    out_dec = search._rerank(llm, 'gemma-test', tracker, kb, '가치 제안', 'value', None, None, 'ambiguous', [], POOL, fake)
    for out in (out_llm, out_dec):  # same task output: [(f, why)] accepted by validate_order
        assert out and all(isinstance(f, str) and isinstance(w, str) and w for f, w in out)
        assert search.validate_order({'order': [{'f': f, 'why': w} for f, w in out]}, [c['f'] for c in POOL])[0] == out
    assert [f for f, _ in out_dec] == ['L_C', 'L_A']  # expected relevance ≥ 1.5, highest first
    q = fake.calls[0]['questions']
    assert len(q) == 4 and all(x['type'] == 'score' and len(x['criteria']) == 4 for x in q.values())
    assert fake.calls[0]['state']['search_request']['검색어'] == '가치 제안'
    low = FakeDecision(levels={})  # nothing reaches the keep threshold → still one (the best)
    assert len(search._rerank(llm, 'm', tracker, kb, 'q', 'value', None, None, 'ambiguous', [], POOL, low)) == 1
    assert tracker.steps.get('search:rerank') == 3


# ---------------------------------------------------------------- task catalog.rank
CANDS = [{'id': f'bs{i:02d}', 'fields': [['제목', f'시나리오 {i}'], ['요약', '비용 절감']]} for i in range(6)]


def test_catalog_rank_both_branches_return_exactly_count(monkeypatch):
    monkeypatch.setattr(catalog_rank, 'DECISION_PRIOR_WEIGHT', 0.0)
    ids = [c['id'] for c in CANDS]
    llm = FakeProvider(lambda kw: {'order': [{'id': i, 'reason': '고객 상황에 맞음'} for i in reversed(ids[:3])]})
    order_llm, model_llm = catalog_rank.rank('scenarios', '비용 절감', {}, CANDS, 3, provider=llm)
    fake = FakeDecision(levels={'c4': 2.9, 'c1': 2.5, 'c5': 2.5, 'c0': 0.3})
    order_dec, model_dec = catalog_rank.rank('scenarios', '비용 절감', {}, CANDS, 3, provider=llm, decision=fake)
    for order in (order_llm, order_dec):
        assert catalog_rank.validate_order({'order': order}, ids, 3)[0] == order
    assert [x['id'] for x in order_dec] == ['bs04', 'bs01', 'bs05'] and model_dec == 'jev-test' and model_llm == 'gemma-test'
    assert llm.calls[0]['schema']['properties']['order']['minItems'] == 3


def test_catalog_rank_validation_and_reask():
    with pytest.raises(Exception):
        catalog_rank.parse({'kind': 'x', 'query': 'q', 'candidates': CANDS, 'count': 3})
    with pytest.raises(Exception):
        catalog_rank.parse({'kind': 'scenarios', 'query': 'q', 'candidates': CANDS, 'count': 9})
    asks = []

    def answer(kw):
        asks.append(kw)
        return {'order': [{'id': 'invented', 'reason': 'x'}] * 3} if len(asks) == 1 else {'order': [{'id': c['id'], 'reason': 'ok'} for c in CANDS[:3]]}
    order, _ = catalog_rank.rank('layouts', 'q', {}, CANDS, 3, provider=FakeProvider(answer))
    assert len(asks) == 2 and '이전 결과 오류' in asks[1]['user'] and len(order) == 3


# ---------------------------------------------------------------- task review.route
@pytest.fixture(scope='module')
def score_ctx():
    ps = imports.score()
    router = importlib.import_module('proposal_score.router')
    checks = importlib.import_module('proposal_score.checks')
    cs = ps.criteria.load_criteria()
    tax = ps.taxonomy.load_taxonomy()
    proposals = ps.proposal.load_best()
    catalog = ps.proposal.load_catalog()
    p = next(x for x in proposals if x.id == 'bs10')
    gates = ps.criteria.applicable(cs, checks.profile(p, catalog))
    F = checks.auto_checks(p, catalog, [x.customer for x in proposals])
    return SimpleNamespace(router=router, llm=ps.llm, cs=cs, tax=tax, p=p, gates=gates, F=F)


def test_review_route_decision_branch_matches_llm_output_shape(score_ctx):
    c = score_ctx
    coarse = c.tax['coarse']

    class LlmBackend(c.llm.Backend):
        name, online = 'fake', True

        def complete(self, stage, system, user, schema, meta=None, temperature=None):
            if stage == 'route_l1':
                return {'communities': [{'id': x['id'], 'relevance': 3, 'reason': 'x'} for x in coarse]}
            return {'communities': [{'id': f['id'], 'relevance': 2, 'reason': 'x'} for f in c.tax['fine']],
                    'criteria': [{'id': i, 'priority': 2, 'reason': 'x'} for f in c.tax['fine'] for i in f['criteria']]}

    class DecBackend(LlmBackend):
        def __init__(self, fake):
            super().__init__()
            self.decision = PocDecision(fake)

        def complete(self, *a, **k):
            raise AssertionError('decision branch must not call the LLM')

    r_llm = c.router.route(c.p, c.cs, c.tax, c.gates, c.F, LlmBackend(), budget=9, min_k=4)
    levels = {f"l1_{x['id']}": 3.0 for x in coarse}
    levels.update({f"l2_{f['id']}": 2.4 for f in c.tax['fine']})
    levels.update({f'k_{i}': 2.6 - 0.05 * n for n, i in enumerate(c.cs.ids())})
    fake = FakeDecision(levels=levels)
    r_dec = c.router.route(c.p, c.cs, c.tax, c.gates, c.F, DecBackend(fake), budget=9, min_k=4)
    for r in (r_llm, r_dec):
        assert r.mode == 'llm' and 4 <= len(r.selected) <= 9
        assert set(r.to_dict()) == set(r_llm.to_dict())
        for row in r.l1 + r.l2:
            assert set(row) == {'id', 'relevance', 'reason'} and 0 <= row['relevance'] <= 3
        for row in r.crit:
            assert set(row) == {'id', 'priority', 'reason'} and 0 <= row['priority'] <= 3
    assert [x['stage'] for x in fake.calls] == ['route_l1', 'route_l2']
    pr = {x['id']: x['priority'] for x in r_dec.crit}
    clean = set(r_dec.rule_pass) | {i for i in c.router.HYGIENE if i in pr and i not in r_dec.risk}
    assert all(pr[i] <= 1 for i in clean if i in pr), '[규칙 통과] 기준은 0~1'
    assert sum(1 for v in pr.values() if v >= 2) <= 9, '우선순위 2~3 은 예산 이하'
    q = fake.calls[1]['questions']
    assert all(x['type'] == 'score' and len(x['criteria']) == 4 for x in q.values())


# ---------------------------------------------------------------- tasks layout.pick · layout.best_pick
@pytest.fixture(scope='module')
def layout_mods():
    imports.layout()
    return SimpleNamespace(D=importlib.import_module('winmate_layout.decision'), schemas=importlib.import_module('winmate_layout.schemas'))


def _rows():
    def cand(f):
        return {'f': f, 'name': f, 'when': 'w', 'visual': [], 'photo': 0, 'missing': [], 'capacity': {}, 'rule_score': 1.0}
    return [{'key': 'S01#0', 'part': 'value · 가치', 'role': 'r', 'items': [], 'reqs': [], 'candidates': [cand('L_A'), cand('L_B'), cand('L_C')]},
            {'key': 'S02#0', 'part': 'case · 사례', 'role': 'r', 'items': [], 'reqs': [], 'candidates': [cand('L_A'), cand('L_D')]}]


def test_layout_pick_decision_returns_llm_schema_with_unique_primaries(layout_mods):
    M = layout_mods
    llm = SimpleNamespace(trace=[])
    picks = M.D.pick_batch(PocDecision(FakeDecision(prefer=['L_A'])), llm, _rows(), {'customer': 'A', 'industry_name': 'FB'}, {'context_level': 'minimal'})
    assert isinstance(picks, M.schemas.LLMLayoutPicks)
    M.schemas.LLMLayoutPicks.model_validate(picks.model_dump())
    by = {p.key: p for p in picks.picks}
    assert set(by) == {'S01#0', 'S02#0'}
    assert by['S01#0'].primary != by['S02#0'].primary, 'primary 는 덱 안에서 한 번만'
    assert all(len(p.alternates) <= 2 and p.primary not in p.alternates and p.reason for p in picks.picks)
    assert llm.trace and llm.trace[0]['note'] == 'decision'
    one = M.D.pick_one(PocDecision(FakeDecision(prefer=['L_C'])), llm, _rows()[0]['candidates'], {'part': 'x'}, {}, {}, 'layout_pick:S01')
    assert isinstance(one, M.schemas.LLMLayoutPick) and one.primary == 'L_C'


def test_layout_best_pick_decision_orders_by_expected_fit(layout_mods, monkeypatch):
    M = layout_mods
    monkeypatch.setattr(M.D, 'PRIOR_WEIGHT', 0.0)
    cards = [{'id': f'bs0{i}', 'title': 't', 'req': 'new', 'strategy': 'value', 'ind': None, 'fit': 'f', 'avoid': 'a', 'rule_score': 5 - i} for i in range(5)]
    fake = FakeDecision(levels={'b3': 2.7, 'b1': 2.7, 'b0': 1.0})
    pick = M.D.best_pick(PocDecision(fake), SimpleNamespace(trace=[]), cards, '요약', 'FB', '원문')
    assert isinstance(pick, M.schemas.LLMScenarioPick)
    assert pick.order[:3] == ['bs01', 'bs03', 'bs00'] and {r.id for r in pick.reasons} == set(pick.order)
    assert all(q['type'] == 'score' for q in fake.calls[0]['questions'].values())


def test_large_requests_are_split_to_fit_the_context_and_merged():
    big = {f'q{i}': dm.score({'candidate': '가' * 3000}, ['0', '1']) for i in range(40)}
    batches = dm.plan_batches({'s': 'x'}, big)
    assert len(batches) > 1 and sum(len(b) for b in batches) == 40
    assert all(dm.estimate_tokens({'s': 'x'}) + sum(dm.estimate_tokens(q) for q in b.values()) <= dm.REQUEST_TOKEN_BUDGET for b in batches)
    calls = []

    def opener(req, timeout):
        body = json.loads(req.data)
        calls.append(len(body['questions']))
        ans = {k: {'type': 'score', 'score': 1.0, 'confidence': 0.5, 'probabilities': {'0': 0.0, '1': 1.0}} for k in body['questions']}
        return _Resp(json.dumps({'model': 'jev-1.14.0', 'answers': ans, 'usage': {'input_tokens': 10, 'output_tokens': 1}}).encode())
    client = dm.TypeSafeDecision(settings_with(TYPESAFE_API_KEY='k'), opener=opener)
    res = client.ask(stage='t', state={'s': 'x'}, questions=big)
    assert set(res.answers) == set(big) and len(calls) == len(batches) and res.input_tokens == 10 * len(batches)
    with pytest.raises(ValueError):
        dm.plan_batches({'s': '가' * 40000}, {'a': dm.noul('x')})


def test_local_clef_server_uses_its_own_limits_and_never_truncates():
    s = settings_with(TYPESAFE_API_KEY='local', TYPESAFE_BASE_URL='http://127.0.0.1:8790/v1', TYPESAFE_MODEL='clef-flash')
    assert s.decision_base_url == 'http://127.0.0.1:8790/v1' and s.public()['decision']['provider'] == 'clef-local'
    remote = settings_with(TYPESAFE_API_KEY='k', TYPESAFE_BASE_URL='http://example.com/v1')
    assert remote.decision_base_url == 'https://api.typesafe.ai/v1' and remote.warnings
    big = {f'q{i}': dm.score({'candidate': '가' * 3000}, ['0', '1']) for i in range(12)}
    bodies, active, peak = [], [0], [0]

    def opener(req, timeout):
        active[0] += 1
        peak[0] = max(peak[0], active[0])
        body = json.loads(req.data)
        bodies.append(body)
        ans = {k: {'type': 'score', 'score': 1.0, 'confidence': 0.5, 'probabilities': {'0': 0.0, '1': 1.0}} for k in body['questions']}
        active[0] -= 1
        return _Resp(json.dumps({'model': 'clef-flash', 'answers': ans, 'usage': {'input_tokens': 10, 'output_tokens': 0}}).encode())
    client = dm.TypeSafeDecision(s, opener=opener)
    assert client.limits is dm.LIMITS['clef'] and client.name == 'clef-local'
    res = client.ask(stage='t', state={'s': 'x'}, questions=big)
    assert set(res.answers) == set(big) and len(bodies) > 1 and peak[0] == 1
    assert all(b['truncate'] is False for b in bodies)
    assert all(dm.estimate_tokens({'s': 'x'}) + sum(dm.estimate_tokens(q) for q in b['questions'].values()) <= 15_000 for b in bodies)
    jev, seen = _client([dict(OK)])
    jev.ask(stage='t', state='s', questions=QS)
    assert 'truncate' not in json.loads(seen[-1].data) and jev.limits is dm.LIMITS['jev']


def test_blend_keeps_the_retrieval_prior_for_near_ties():
    assert dm.unit([1, 1, 1]) == [0.0, 0.0, 0.0] and dm.unit([2, 4, 3]) == [0.0, 1.0, 0.5]
    rel, prior = [1.8, 1.9, 2.4], [11.0, 10.7, 8.9]   # decision relevance close, retrieval prior clear
    b = dm.blend(rel, prior, 1.0)
    assert max(range(3), key=lambda i: b[i]) == 0
    assert max(range(3), key=lambda i: dm.blend(rel, prior, 0.0)[i]) == 2
    kb, tracker = _kb(), ModeTracker('real', None)
    fake = FakeDecision(levels={'c0': 1.8, 'c1': 1.9, 'c2': 2.0, 'c3': 1.6})
    out = search._rerank(None, 'm', tracker, kb, 'q', 'value', None, None, 'ambiguous', [], POOL, fake)
    assert out[0][0] == 'L_A' and len(out) == 4


def test_review_route_budget_cap_never_demotes_risk_criteria(score_ctx):
    c = score_ctx
    risky = {r.split(':')[0] for r in c.router.risk_signals(c.F)} & {i for i, (ok, _) in c.gates.items() if ok}
    assert risky, 'bs10 fixture has risk signals'

    class DecBackend(c.llm.Backend):
        name, online = 'fake', True

        def __init__(self, fake):
            super().__init__()
            self.decision = PocDecision(fake)
    levels = {f"l1_{x['id']}": 3.0 for x in c.tax['coarse']}
    levels.update({f"l2_{f['id']}": 3.0 for f in c.tax['fine']})
    levels.update({f'k_{i}': (2.0 if i in risky else 2.9) for i in c.cs.ids()})  # every criterion "high", risk ones lowest
    r = c.router.route(c.p, c.cs, c.tax, c.gates, c.F, DecBackend(FakeDecision(levels=levels)), budget=6, min_k=4)
    pr = {x['id']: x['priority'] for x in r.crit}
    assert all(pr[i] >= 2 for i in risky if i in pr) and set(risky) & set(pr) <= set(r.selected)
