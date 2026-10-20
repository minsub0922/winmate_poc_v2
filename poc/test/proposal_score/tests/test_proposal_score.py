"""proposal_score 테스트 — poc/test 에서:  python3 -m unittest -v proposal_score.tests.test_proposal_score
Gemini 라이브 테스트는 PS_LIVE=1 일 때만 (poc/.env 의 키 사용)."""
from __future__ import annotations

import json
import os
import re
import unittest

from proposal_score import config
from proposal_score.checks import auto_checks, profile
from proposal_score.criteria import applicable, build_criteria_json, gate, load_criteria, parse_app_criteria
from proposal_score.llm import Backend, make_backend
from proposal_score.pipeline import PERTURB, Context, aggregate, baseline, evaluate, perturbed
from proposal_score.proposal import load_best, load_catalog
from proposal_score.router import local_seeds, risk_signals, route
from proposal_score.scorer import Score, grounded_ratio, score_group
from proposal_score.taxonomy import build_graph, build_taxonomy, load_taxonomy, louvain, modularity

CS = load_criteria()
PS = load_best()
BY = {p.id: p for p in PS}
CAT = load_catalog()
OTHERS = [p.customer for p in PS]
GATES_KNOWN = {'always', 'slides', 'slides_units5', 'units5', 'units8', 'geometry', 'font_sizes', 'fonts', 'visual', 'products', 'products_or_solutions', 'figures3',
               'charts_or_figures8', 'linked_req', 'industry', 'market_or_figures', 'years_or_figures', 'market_units', 'competition', 'cost_or_units8', 'brand', 'abbr3',
               'disclosure', 'file_notes', 'file_meta', 'rfp_format'}
PARTS = {'overview', 'requirements', 'market', 'customer', 'user', 'competition', 'insight', 'challenge', 'value', 'effect', 'dss', 'products', 'bom', 'scenario', 'birdseye',
         'solution', 'case', 'why', 'spec', 'execution', 'cost', 'cover', 'closing', 'appendix'}
SCOPES = PARTS | {'all', 'numbers', 'geometry', 'titles', 'footers', 'images', 'digest'}


class FakeBackend(Backend):
    """LLM 대신 정해진 JSON 을 돌려주는 백엔드 — 파싱 · 선택 · 대체 경로 확인용."""
    name, online = 'fake', True

    def __init__(self, l1=None, l2=None, scores=None):
        super().__init__()
        self.l1, self.l2, self.scores = l1, l2, scores
        self.prompts = []

    def complete(self, stage, system, user, schema, meta=None, temperature=None):
        self.prompts.append((stage, user))
        if stage == 'route_l1':
            return self.l1
        if stage == 'route_l2':
            return self.l2
        if stage == 'score':
            return self.scores(user) if callable(self.scores) else self.scores
        raise AssertionError(stage)


class TestCriteria(unittest.TestCase):
    def test_parity_with_app(self):
        cats, crits = parse_app_criteria()
        self.assertEqual(len(cats), 7)
        self.assertEqual(len(crits), 54)
        self.assertEqual([c['id'] for c in crits], CS.ids(), 'criteria.json 이 앱 criteria.js 와 순서 · id 가 같아야 함 (tools/sync_criteria.py)')
        for c in crits:
            x = CS[c['id']]
            self.assertEqual((x.cat, x.name, x.w, x.desc, x.check), (c['cat'], c['name'], c['w'], c['desc'], c['check']), c['id'])
        self.assertEqual(json.loads(config.CRITERIA_PATH.read_text(encoding='utf-8'))['criteria'], build_criteria_json()['criteria'])

    def test_every_criterion_has_explicit_1_2_3(self):
        for c in CS.items:
            for k, s in (('1', c.r1), ('2', c.r2), ('3', c.r3)):
                self.assertGreaterEqual(len(s.strip()), 12, f'{c.id} {k}점 기준이 너무 짧아요')
                self.assertNotRegex(s, r'1\s?[~-]\s?3\s?점|점수를 매긴다|평가하라', f'{c.id} {k}점: 막연한 지시가 아니라 상태를 정의해야 함')
            self.assertEqual(len({c.r1, c.r2, c.r3}), 3, f'{c.id}: 세 기준이 서로 달라야 함')
            self.assertIn(c.gate, GATES_KNOWN, c.id)
            self.assertTrue(set(c.scope) <= SCOPES, f'{c.id} scope {c.scope}')
            self.assertGreaterEqual(len(c.concepts), 2, c.id)

    def test_gates(self):
        x = profile(BY['bs19'], CAT)
        self.assertFalse(gate('products', x)[0], 'bs19 는 제품 언급이 없어 제품 기준이 닫혀야 함')
        x = profile(BY['bs01'], CAT)
        ap = applicable(CS, x)
        self.assertTrue(ap['PR2'][0])
        for cid in ('SB3', 'SB4', 'DS10'):
            self.assertFalse(ap[cid][0], f'{cid}: 앱에서 그린 장은 파일 속성 · 노트 · 화면 이미지가 없음')
        self.assertTrue(ap['DS1'][0] and ap['DS4'][0], '앱에서 그린 장은 위치 · 글자 크기를 쟀으므로 열림')


class TestTaxonomy(unittest.TestCase):
    def test_structure(self):
        t = load_taxonomy()
        ids = CS.ids()
        fine_members = [i for f in t['fine'] for i in f['criteria']]
        self.assertEqual(sorted(fine_members), sorted(ids), '모든 기준이 세부 커뮤니티 하나에만')
        self.assertEqual(len(fine_members), len(set(fine_members)))
        for c in t['coarse']:
            kids = [f for f in t['fine'] if f['id'] in c['children']]
            self.assertEqual(sorted(c['criteria']), sorted(i for f in kids for i in f['criteria']), '상위 = 하위의 합')
            for f in kids:
                self.assertEqual(f['parent'], c['id'])
        self.assertTrue(10 <= len(t['fine']) <= 16 and 4 <= len(t['coarse']) <= 7)
        for lvl in ('fine', 'coarse'):
            for c in t[lvl]:
                self.assertTrue(c['name'] and c['summary'] and c['when_relevant'], f"{c['id']} 압축 요약이 비었어요")
        self.assertGreater(t['stats']['modularity_fine'], 0.3)

    def test_deterministic_partition(self):
        a = build_taxonomy(CS, None)
        b = build_taxonomy(CS, None)
        self.assertEqual([f['criteria'] for f in a['fine']], [f['criteria'] for f in b['fine']])
        self.assertEqual([f['criteria'] for f in a['fine']], [f['criteria'] for f in load_taxonomy()['fine']], 'taxonomy.json 의 분할이 지금 코드 결과와 같아야 함')

    def test_louvain_two_cliques(self):
        adj = {k: {} for k in 'abcdef'}
        for g in ('abc', 'def'):
            for x in g:
                for y in g:
                    if x != y:
                        adj[x][y] = 1.0
        adj['c']['d'] = adj['d']['c'] = 0.1
        part = louvain(adj, 1.0)
        self.assertEqual(part['a'], part['b'])
        self.assertEqual(part['d'], part['e'])
        self.assertNotEqual(part['a'], part['d'])
        self.assertGreater(modularity(adj, part), 0.4)


class TestProposalAndChecks(unittest.TestCase):
    def test_best_scenarios_loaded(self):
        self.assertEqual(len(PS), 21)
        d = json.loads(config.BEST_PATH.read_text(encoding='utf-8'))
        for s, p in zip(d['scenarios'], PS):
            self.assertEqual(p.n, sum(g['n'] for g in s['stages']), f'{p.id}: 장 수가 시나리오 흐름과 같아야 함')
            self.assertTrue(all(sh.texts for sh in p.sheets), p.id)
            self.assertIn(p.customer.split()[0], p.sheets[0].text + p.sheets[1].text, f'{p.id}: 앞 장에 고객사명(채운 값)이 있어야 함')

    def test_perturbations_are_detected_by_checks(self):
        p = BY['bs01']
        F = auto_checks(baseline(p), CAT, OTHERS)
        self.assertNotIn('다른 시나리오 고객명', ' '.join(F['CU1']))
        q = perturbed(p, 'wrong_customer', 'B 호텔')
        self.assertIn('다른 시나리오 고객명', ' '.join(auto_checks(q, CAT, OTHERS)['CU1']))
        q = perturbed(p, 'placeholders')
        self.assertGreaterEqual(int(re.search(r'자리표시 · 템플릿 문구 (\d+)곳', auto_checks(q, CAT, OTHERS)['WR1'][0]).group(1)), 3)
        q = perturbed(p, 'number_conflict')
        self.assertIn('여러 개', auto_checks(q, CAT, OTHERS)['MK4'][0])
        q = perturbed(p, 'no_proof')
        self.assertFalse(any(s.part in ('case', 'why') for s in q.sheets))
        self.assertTrue(any(r.startswith('VS5') for r in risk_signals(auto_checks(q, CAT, OTHERS))))
        q = perturbed(p, 'strip_images')
        self.assertEqual(sum(s.pictures for s in q.sheets[1:]), 0)

    def test_number_conflict_is_real_and_flagged(self):
        """교란은 첫 등장을 남기고 일부 장만 바꿔야 하고(실제 충돌), 바뀐 수치는 MK4 위험 신호로 잡혀야 한다."""
        from proposal_score.router import risk_signals
        for pid in ('bs01', 'bs04', 'bs10', 'bs19'):
            q = perturbed(baseline(BY[pid]), 'number_conflict')
            self.assertIn('그대로', q.meta.get('_conflict', ''), pid)
            self.assertTrue(any(x.startswith('MK4') for x in risk_signals(auto_checks(q, CAT, OTHERS))), pid)

    def test_spec_check_is_box_level(self):
        """앱 규칙(장 단위)은 옆 칸 수치를 모델에 잇는다 — bs01 10장 OH55A-S 는 55"(옆 KM24C 칸의 24" 아님), bs02 IAB 146" 는 모델명 속 숫자."""
        from proposal_score.checks import spec_check
        bad, ok = spec_check(BY['bs01'], CAT)
        self.assertFalse([b for b in bad if b['sheet'] == 10], bad)
        self.assertGreater(ok, 0)
        self.assertFalse([b for b in spec_check(BY['bs02'], CAT)[0] if b['kind'] == '크기'])
        pr2 = ' '.join(auto_checks(BY['bs02'], CAT, OTHERS)['PR2'])
        self.assertNotIn('카탈로그와 다른 사양', pr2)
        self.assertIn('확인되지 않은 4건', pr2)
        self.assertTrue(any(b['model'] == 'OH55A-S' and b['kind'] == '밝기' for b in spec_check(BY['bs09'], CAT)[0]))
        pr5 = ' '.join(auto_checks(BY['bs10'], CAT, OTHERS).get('PR5', []))
        self.assertNotIn('표기 혼용', pr5)


class TestRouter(unittest.TestCase):
    def setUp(self):
        self.tax = load_taxonomy()
        self.p = BY['bs10']
        self.gates = applicable(CS, profile(self.p, CAT))
        self.F = auto_checks(self.p, CAT, OTHERS)

    def test_rules_route(self):
        r = route(self.p, CS, self.tax, self.gates, self.F, None, budget=12, min_k=8)
        self.assertEqual(r.mode, 'rules')
        self.assertTrue(8 <= len(r.selected) <= 12)
        self.assertTrue(all(self.gates[i][0] for i in r.selected), '적용 조건을 통과한 기준만')
        self.assertEqual(r.selected, route(self.p, CS, self.tax, self.gates, self.F, None, budget=12, min_k=8).selected)

    def test_llm_route_respects_relevance_priority_and_budget(self):
        coarse = self.tax['coarse']
        l1 = {'communities': [{'id': c['id'], 'relevance': 3 if k < 2 else 0, 'reason': 'x'} for k, c in enumerate(coarse)] + [{'id': 'C99', 'relevance': 3, 'reason': '없는 묶음'}]}
        risky = {r.split(':')[0] for r in risk_signals(self.F)}
        keep = [c['id'] for k, c in enumerate(coarse) if k < 2 or any(i in risky for i in c['criteria'])]
        fines = [f for f in self.tax['fine'] if f.get('parent') in keep]
        l2 = {'communities': [{'id': f['id'], 'relevance': 3, 'reason': 'x'} for f in fines],
              'criteria': [{'id': i, 'priority': 3, 'reason': 'x'} for f in fines for i in f['criteria']] + [{'id': 'ZZ9', 'priority': 3, 'reason': '없는 기준'}]}
        r = route(self.p, CS, self.tax, self.gates, self.F, FakeBackend(l1, l2), budget=9, min_k=4)
        self.assertEqual(r.mode, 'llm')
        allowed = {i for f in fines for i in f['criteria'] if self.gates[i][0]}
        self.assertTrue(set(r.selected) <= allowed, '고르지 않은 상위 묶음(위험 신호도 없는)의 기준이 들어가면 안 됨')
        self.assertLessEqual(len(r.selected), 9)
        self.assertNotIn('ZZ9', r.selected)
        self.assertFalse(set(r.selected) & set(r.rule_pass), '규칙 통과 기준은 LLM 채점에서 빠짐')

    def test_hygiene_without_risk_is_rule_pass(self):
        r = route(self.p, CS, self.tax, self.gates, self.F, None, budget=12, min_k=10)
        risky = {x.split(':')[0] for x in risk_signals(self.F)}
        for i in ('WR6', 'WR3'):
            if self.gates[i][0] and i not in risky:
                self.assertIn(i, r.rule_pass)
                self.assertNotIn(i, r.selected)

    def test_risk_survives_full_budget(self):
        """예산이 '채점할 가치 있음(2)' 기준으로 꽉 차도, 위험 신호가 있는 기준(우선순위 1)은 그보다 앞서 남는다."""
        from proposal_score.router import _finalize
        ids = [i for i in CS.ids() if i != 'DS4'][:14] + ['DS4']
        pr = {i: 2 for i in ids}
        pr['DS4'] = 1
        sel = _finalize(CS, set(ids), pr, {'F': 2}, {i: 'F' for i in ids}, {'DS4'}, {i: 0.0 for i in ids}, [], 12, 10)
        self.assertEqual(len(sel), 12)
        self.assertIn('DS4', sel)
        pr.pop('DS4')  # L2 가 위험 기준에 우선순위를 안 매겨도 남는다
        self.assertIn('DS4', _finalize(CS, set(ids), pr, {'F': 2}, {i: 'F' for i in ids}, {'DS4'}, {i: 0.0 for i in ids}, [], 12, 10))

    def test_local_seeds_follow_deal_context(self):
        seeds, local = local_seeds(self.p, CS, self.tax)   # bs10: 경쟁 입찰 · 공급사 전환
        self.assertIn('경쟁비교', seeds)
        top = sorted(local, key=lambda i: -local[i])[:12]
        self.assertTrue({'MK5', 'VS4'} & set(top), f'경쟁 입찰 덱에서 경쟁 · 차별성 기준이 맥락 상위에 와야 함: {top}')

    def test_llm_failure_falls_back_to_rules(self):
        r = route(self.p, CS, self.tax, self.gates, self.F, FakeBackend({'communities': []}, None), budget=10)
        self.assertEqual(r.mode, 'rules-fallback')
        self.assertTrue(r.selected)


class TestScorer(unittest.TestCase):
    def test_parse_validate_ground(self):
        p = BY['bs01']
        F = auto_checks(p, CAT, OTHERS)
        quote = p.sheets[1].title[:12]
        fake = FakeBackend(scores={'scores': [
            {'id': 'VS1', 'score': 3, 'anchor': 'ok', 'evidence': [{'sheet': 2, 'quote': quote}], 'improve': '', 'confidence': 'high'},
            {'id': 'VS9', 'score': 7, 'anchor': '범위 밖 점수', 'evidence': [], 'improve': '', 'confidence': 'low'},
            {'id': 'DS7', 'score': 2, 'anchor': '지어낸 인용', 'evidence': [{'sheet': 2, 'quote': '이 문장은 덱에 없는 문장입니다 정말로'}], 'improve': 'x', 'confidence': 'mid'},
        ]})
        out = {s.id: s for s in score_group(p, CS, ['VS1', 'VS9', 'DS7', 'VS3'], F, fake, 'F08')}
        self.assertEqual(out['VS1'].score, 3)
        self.assertEqual(out['VS1'].grounded, 1.0)
        self.assertEqual(out['DS7'].grounded, 0.0, '덱에 없는 인용은 grounded 0')
        self.assertEqual(out['VS9'].mode, 'rules-fallback', '1~3 밖 점수는 규칙 점수로 대체')
        self.assertEqual(out['VS3'].error, 'missing', '응답에 빠진 기준도 규칙 점수로 대체')
        prompt = fake.prompts[0][1]
        for cid in ('VS1', 'VS9', 'DS7', 'VS3'):
            c = CS[cid]
            self.assertIn('1점: ' + c.r1, prompt)
            self.assertIn('3점: ' + c.r3, prompt)
        self.assertIn('<<<DATA', prompt)

    def test_aggregate_math(self):
        tax = load_taxonomy()
        scores = [Score('CU1', 3), Score('CU2', 1), Score('DS3', 2)]
        gates = {i: (True, '') for i in CS.ids()}
        a = aggregate(CS, tax, scores, gates, ['CU1', 'CU2', 'DS3'])
        self.assertEqual(a['categories']['CU'], 50.0)       # (3·100 + 3·0) / 6
        self.assertEqual(a['categories']['DS'], 50.0)
        self.assertEqual(a['total'], 50.0)
        self.assertEqual(a['dist'], {'1': 1, '2': 1, '3': 1})
        self.assertAlmostEqual(a['rubric_mean'], (3 * 3 + 3 * 1 + 2 * 2) / 8, places=3)


class TestEndToEndOffline(unittest.TestCase):
    def test_rules_pipeline_on_all(self):
        ctx = Context(backend=make_backend('rules'), others=OTHERS)
        for p in PS:
            r = evaluate(p, ctx)
            a = r['aggregate']
            self.assertTrue(8 <= a['n_selected'] <= 12, p.id)
            self.assertLess(a['n_selected'], a['n_applicable'], '모든 기준을 쓰지 않음')
            self.assertTrue(all(s['score'] in (1, 2, 3) for s in r['scores']))


@unittest.skipUnless(os.environ.get('PS_LIVE') == '1', 'PS_LIVE=1 일 때만 Gemini 라이브 테스트')
class TestLiveGemini(unittest.TestCase):
    def test_live_small(self):
        ctx = Context(backend=make_backend('gemini'), others=OTHERS, budget=6, min_k=4)
        r = evaluate(BY['bs19'], ctx)
        self.assertEqual(r['route']['mode'], 'llm')
        self.assertTrue(all(s['score'] in (1, 2, 3) for s in r['scores']))
        self.assertEqual(r['fallbacks'], 0)


if __name__ == '__main__':
    unittest.main()
