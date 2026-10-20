"""RFP → 요구사항 파이프라인 테스트.

  python3 -m unittest -v test_rfp_pipeline            # 오프라인 테스트 전부 + (키 · 네트워크가 되면) Gemini 라이브 테스트
  RFP_LIVE=0 python3 -m unittest -v test_rfp_pipeline  # 라이브 테스트 건너뛰기

라이브 테스트는 poc/.env 의 GEMINI_API_KEY 로 chunk_carry 조건을 TC1~TC5 에 돌리고 결과를 results/ 에 저장한다.
"""
import json
import os
import re
import sys
import unittest
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import rfp_pipeline as rp  # noqa: E402
import run_experiment as rx  # noqa: E402

TCS = json.loads((HERE / 'tc' / 'rfp_tc.json').read_text(encoding='utf-8'))['tcs']
GOLD = json.loads((HERE / 'tc' / 'golden_forms.json').read_text(encoding='utf-8'))


def tc(i):
    return next(t for t in TCS if t['id'] == i)


class RecordingBackend(rp.Backend):
    """프롬프트를 기록하고 규칙 백엔드로 응답한다 — 맥락이 다음 호출로 실제로 넘어가는지 확인용."""
    name = 'recording'

    def __init__(self):
        super().__init__()
        self.inner = rp.RulesBackend()
        self.prompts = []

    def complete(self, stage, system, user, meta):
        self.prompts.append((stage, user))
        data = self.inner.complete(stage, system, user, meta)
        if stage == 'extract':
            data['carry'] = f"조각 {meta['idx'] + 1} 메모"
            if meta['idx'] == 0:
                data['open_refs'] = ['붙임 3']
        return data


# ---------------------------------------------------------------- TC 자체 검증
class TestTestCases(unittest.TestCase):
    def test_tc_shape(self):
        self.assertEqual([t['id'] for t in TCS], ['TC1', 'TC2', 'TC3', 'TC4', 'TC5'])
        self.assertEqual(len(tc('TC5')['expected']['projects']), 4)
        self.assertGreater(len(tc('TC5')['input']), 20000, '통합 문서는 긴 입력이어야 함')

    def test_every_checkpoint_is_in_source(self):
        for t in TCS:
            src = rp.norm(t['input'])
            for p in t['expected']['projects']:
                for c in p['checkpoints']:
                    self.assertTrue(any(re.search(x, src) for x in c['any']), f"{t['id']} {p['key']} {c['id']} {c['desc']} 원문에 없음")

    def test_golden_forms_score_full_recall(self):
        """사람이 정리한 히스토리(정답 폼)는 체크포인트를 모두 맞혀야 한다 — 채점기와 TC 검증."""
        forms = []
        for i, g in enumerate(GOLD):
            f = {'pid': f'P{i + 1}', 'project': g['project'], 'customer': g['customer'], 'target': g['target'], 'free': g['free'], 'note': g['note'],
                 'keymen': [{'name': k['name'], 'weight': k['weight'], 'reqs': k['reqs']} for k in g['keymen']]}
            forms.append(f)
            sc = rp.score(rp.RunResult({}, [], [], [f]), tc(f'TC{i + 1}'))
            self.assertEqual(sc['recall'], 1.0, sc['per_project'][0]['missed'])
        sc = rp.score(rp.RunResult({}, [], [], forms), tc('TC5'))
        self.assertEqual((sc['recall'], sc['projects_matched'], sc['misattributed']), (1.0, 4, 0))

    def test_shared_boilerplate_is_not_misattribution(self):
        """같은 은행 공통 문구(추첨 · 접수 메일)는 다른 사업에서 발견돼도 그 사업 원문에도 있으면 잘못된 귀속이 아니다."""
        g = GOLD
        mon_only = [{'pid': 'P3', 'project': g[2]['project'], 'customer': '신한은행', 'target': '', 'free': '', 'note': '',
                     'keymen': [{'name': 'x', 'weight': 100, 'reqs': [r for k in g[2]['keymen'] for r in k['reqs']]}]},
                    {'pid': 'P1', 'project': g[0]['project'], 'customer': '신한은행', 'target': '', 'free': '', 'note': '', 'keymen': [{'name': 'x', 'weight': 100, 'reqs': []}]}]
        sources = {t['expected']['projects'][0]['key']: rp.norm(t['input']) for t in TCS if t['kind'] == 'single'}
        plain = rp.score(rp.RunResult({}, [], [], mon_only), tc('TC5'))
        fair = rp.score(rp.RunResult({}, [], [], mon_only), tc('TC5'), sources)
        self.assertLess(fair['misattributed'], plain['misattributed'])

    def test_scorer_detects_misattribution(self):
        g = GOLD
        swapped = [{'pid': 'P1', 'project': g[0]['project'], 'customer': '신한은행', 'target': '', 'free': '', 'note': '',
                    'keymen': [{'name': 'x', 'weight': 100, 'reqs': [r for k in g[2]['keymen'] for r in k['reqs']]}]},  # 프린터 이름 아래 모니터 요구사항
                   {'pid': 'P3', 'project': g[2]['project'], 'customer': '신한은행', 'target': '', 'free': '', 'note': '',
                    'keymen': [{'name': 'x', 'weight': 100, 'reqs': [r for k in g[0]['keymen'] for r in k['reqs']]}]}]
        sc = rp.score(rp.RunResult({}, [], [], swapped), tc('TC5'))
        self.assertGreater(sc['misattributed'], 20)


# ---------------------------------------------------------------- 조각 나누기
class TestChunker(unittest.TestCase):
    def test_coverage_no_gap_no_overlap(self):
        for t in TCS:
            for mc in (800, 1500, 3000):
                lines = t['input'].split('\n')
                cover = [0] * len(lines)
                for c in rp.chunk_text(t['input'], mc):
                    for k in range(c.start_line, c.end_line):
                        cover[k] += 1
                self.assertTrue(all(x == 1 for x in cover), f"{t['id']}@{mc}")

    def test_long_doc_is_split_and_sized(self):
        ch = rp.chunk_text(tc('TC5')['input'], 3000)
        self.assertGreaterEqual(len(ch), 9)
        self.assertTrue(all(len(c.text) <= 3000 * 1.4 for c in ch), [len(c.text) for c in ch])

    def test_table_header_repeated_on_continuation(self):
        ch = rp.chunk_text(tc('TC4')['input'], 1200)
        cont = [c for c in ch if c.table_header]
        self.assertTrue(cont, '표 중간에서 시작하는 조각이 있어야 함')
        for c in cont:
            self.assertTrue(c.text.startswith('(표 계속'))
            self.assertIn('|', c.table_header.split('\n')[0])

    def test_heading_path_kept(self):
        ch = rp.chunk_text(tc('TC2')['input'], 1000)
        self.assertTrue(any('사업자 선정' in ' '.join(c.path) for c in ch))

    def test_outline_is_short_and_has_contacts(self):
        o = rp.outline(tc('TC5')['input'])
        self.assertLess(len(o), 6001)
        self.assertIn('흑백프린터', o)
        self.assertRegex(o, r'☎|@')


# ---------------------------------------------------------------- 가드
class TestGuards(unittest.TestCase):
    def test_grounded(self):
        src = rp.norm(tc('TC1')['input'])
        self.assertTrue(rp.grounded('속도 : 20 PPM 이상', src))
        self.assertTrue(rp.grounded('BMT 평가를 수행하여 배점 한도의 85% 이상인 자를', src))
        self.assertFalse(rp.grounded('컬러 출력 40 PPM 이상 필수', src))

    def test_unsupported_numbers(self):
        src = tc('TC1')['input']
        self.assertEqual(rp.unsupported_numbers('152대 · 20 PPM · 85% · 13시', src), [])
        self.assertEqual(rp.unsupported_numbers('300대 · 40ppm', src), ['300대', '40ppm'])
        kb = tc('TC4')['input']
        self.assertEqual(rp.unsupported_numbers('모니터 연 예상 500대 · USB 전면 2개 · 후면 4개', kb), [])
        self.assertEqual(rp.unsupported_numbers('모니터 연 예상 700대', kb), ['700대'])

    def test_groups_join_ledger_text_verbatim(self):
        items = [{'id': 'R001', 'cat': '제출', 'text': '사업자등록증 사본 제출.'}, {'id': 'R002', 'cat': '제출', 'text': '법인인감증명서 제출'},
                 {'id': 'R003', 'cat': '규격', 'text': '속도 20 PPM 이상'}]
        dec = {'keymen': [{'name': 'A', 'weight': 100, 'req_ids': ['R003'], 'groups': [{'tag': '제출', 'ids': ['R001', 'R002']}]}], 'free': ''}
        f = rp.assemble_form({'pid': 'P1', 'name': 'x', 'customer': 'y'}, items, dec)
        self.assertEqual(f['keymen'][0]['reqs'], ['[규격] 속도 20 PPM 이상', '[제출] 사업자등록증 사본 제출 · 법인인감증명서 제출'])
        many = [{'id': f'R{i:03d}', 'cat': '무효', 'text': f'무효 사유 {i}'} for i in range(1, 10)]
        f2 = rp.assemble_form({'pid': 'P1'}, many, {'keymen': [{'name': 'A', 'weight': 100, 'req_ids': [x['id'] for x in many]}], 'free': ''})
        self.assertEqual([len(x) for x in f2['keymen'][0]['line_ids']], [4, 4, 1], '묶음 없으면 같은 분류 4개씩')
        self.assertEqual(f['stats']['unassigned'], 0)

    def test_ids_in_prose_are_replaced(self):
        items = [{'id': 'R026', 'cat': '제출', 'text': '참가 의향서 제출 시 10가지 지정 서류를 구비해야 함'}]
        dec = {'keymen': [{'name': 'A', 'weight': 100, 'req_ids': ['R026']}], 'free': '',
               'to_confirm': ['제출 서류 10가지의 세부 목록(R026 관련)', 'R026의 기한 확인']}
        f = rp.assemble_form({'pid': 'P1'}, items, dec)
        self.assertNotRegex(f['note'], r'R\d{3}')
        self.assertIn('‘참가 의향서 제출 시', f['note'])

    def test_merge_guard_and_unassigned_kept(self):
        items = [{'id': 'R001', 'cat': '규격', 'text': '속도 20 PPM 이상'}, {'id': 'R002', 'cat': '규격', 'text': '속도 30 PPM 이상'},
                 {'id': 'R003', 'cat': '일정', 'text': '6/12 13:00 마감'}, {'id': 'R004', 'cat': '규격', 'text': '속도 20 PPM 이상 필수'}]
        dec = {'keymen': [{'name': 'A', 'weight': 100, 'req_ids': ['R001', 'R002']}],
               'merges': [{'keep': 'R001', 'drop': ['R002', 'R004']}], 'free': ''}
        f = rp.assemble_form({'pid': 'P1', 'name': 'x', 'customer': 'y'}, items, dec)
        ids = [i for k in f['keymen'] for i in k['req_ids']]
        self.assertIn('R002', ids, '숫자가 다른 항목은 병합하면 안 됨')
        self.assertNotIn('R004', ids, '같은 조건은 병합')
        self.assertEqual(f['keymen'][-1]['name'], '미배정')
        self.assertEqual(f['keymen'][-1]['req_ids'], ['R003'])


# ---------------------------------------------------------------- 파이프라인(오프라인)
class TestPipelineOffline(unittest.TestCase):
    def test_context_is_carried_between_chunks(self):
        be = RecordingBackend()
        rp.run_pipeline(tc('TC4')['input'], be, rp.RunConfig('chunk_carry', 1500))
        ex = [u for s, u in be.prompts if s == 'extract']
        self.assertGreater(len(ex), 3)
        self.assertIn('전역 맥락', ex[0])
        self.assertIn('조각 1 메모', ex[1], '직전 조각 메모가 다음 호출에 들어가야 함')
        self.assertIn('붙임 3', ex[1], '미해결 참조가 이어져야 함')
        self.assertRegex(ex[2], r'R0\d\d \[', '원장(이전 항목)이 들어가야 함')

    def test_gapfill_asks_only_uncovered_lines(self):
        be = RecordingBackend()
        rp.run_pipeline(tc('TC1')['input'], be, rp.RunConfig('chunk_carry_gap', 3000))
        gaps = [u for s, u in be.prompts if s == 'gapfill']
        ext = [u for s, u in be.prompts if s == 'extract']
        self.assertEqual(len(ext), 3)
        self.assertLessEqual(len(gaps), 3)
        lines = rp.uncovered_lines('- 속도 : 20 PPM 이상\n- 양면 인쇄 기능 필수', [{'text': '속도 20 PPM 이상', 'quote': '속도 : 20 PPM 이상'}])
        self.assertEqual(lines, ['- 양면 인쇄 기능 필수'])

    def test_nocarry_has_no_context(self):
        be = RecordingBackend()
        rp.run_pipeline(tc('TC4')['input'], be, rp.RunConfig('chunk_nocarry', 1500))
        ex = [u for s, u in be.prompts if s == 'extract']
        self.assertTrue(all('지금까지의 원장' not in u and '직전 조각 메모' not in u for u in ex))

    def test_rules_pipeline_all_tcs(self):
        be = rp.RulesBackend()
        for t in TCS:
            res = rp.run_pipeline(t['input'], be, rp.RunConfig('chunk_carry', 3000))
            self.assertEqual(len(res.forms), len(t['expected']['projects']), t['id'])
            n_items = len(res.items)
            n_out = sum(len(k['req_ids']) for f in res.forms for k in f['keymen']) + sum(f['stats']['merged'] for f in res.forms)
            self.assertEqual(n_items, n_out, f"{t['id']}: 항목 누락 없이 폼으로 옮겨져야 함")
            self.assertGreater(res.guards['grounded_rate'], 0.95)
            sc = rp.score(res, t)
            self.assertGreater(sc['recall'], 0.5, t['id'])

    def test_consolidate_failure_falls_back(self):
        class FailingConsolidate(rp.RulesBackend):
            def complete(self, stage, system, user, meta):
                if stage == 'consolidate':
                    raise rp.BackendError('출력 한도 초과(MAX_TOKENS) · 반복 폭주')
                return super().complete(stage, system, user, meta)
        res = rp.run_pipeline(tc('TC1')['input'], FailingConsolidate(), rp.RunConfig('chunk_carry', 3000))
        self.assertEqual(len(res.forms), 1)
        self.assertIn('consolidate_fallback', res.forms[0]['stats'])
        self.assertEqual(sum(len(k['req_ids']) for k in res.forms[0]['keymen']), len(res.items))

    def test_replay_without_cache_fails_clearly(self):
        be = rp.ReplayBackend('no-such-model', HERE / 'results' / 'cache' / '_empty_')
        with self.assertRaises(rp.BackendError):
            rp.run_pipeline(tc('TC1')['input'], be, rp.RunConfig())

    def test_gemini_request_cache_and_replay(self):
        """네트워크 없이 Gemini 백엔드의 요청 모양 · 캐시 기록 · replay 재현을 확인한다."""
        import tempfile
        bodies = []

        class FakeGemini(rp.GeminiBackend):
            def _post(self, body):
                bodies.append(body)
                stage = 'profile' if 'projects' in json.dumps(body['generationConfig'].get('responseSchema', {})) and 'glossary' in json.dumps(body['generationConfig'].get('responseSchema', {})) else 'x'
                data = {'projects': [{'pid': 'P1', 'name': '흑백프린터 도입 추진', 'customer': '신한은행', 'start_line': 1, 'contacts': []}]} if stage == 'profile' else {'items': [], 'carry': ''}
                return {'candidates': [{'content': {'parts': [{'text': json.dumps(data, ensure_ascii=False)}]}}], 'usageMetadata': {'promptTokenCount': 10, 'candidatesTokenCount': 5}}

        with tempfile.TemporaryDirectory() as d:
            be = FakeGemini('k', 'gemini-test', Path(d), rpm=0, verbose=False)
            out = be.complete('profile', 'sys', 'user', {})
            self.assertEqual(out['projects'][0]['customer'], '신한은행')
            b = bodies[0]
            self.assertEqual(b['generationConfig']['responseMimeType'], 'application/json')
            self.assertIn('responseSchema', b['generationConfig'])
            self.assertEqual(b['systemInstruction']['parts'][0]['text'], 'sys')
            self.assertEqual(len(list(Path(d).glob('profile-*.json'))), 1)
            again = rp.ReplayBackend('gemini-test', Path(d)).complete('profile', 'sys', 'user', {})
            self.assertEqual(again, out)

    def test_gemini_max_tokens_and_retry(self):
        import tempfile
        import urllib.error
        seq = []

        class Flaky(rp.GeminiBackend):
            def _post(self, body):
                seq.append(1)
                if len(seq) == 1:
                    raise urllib.error.HTTPError('u', 429, 'rate', {}, None)
                return {'candidates': [{'finishReason': 'MAX_TOKENS', 'content': {'parts': [{'text': '{"items": ['}]}}]}

        with tempfile.TemporaryDirectory() as d:
            be = Flaky('k', 'm', Path(d), rpm=0, verbose=False)
            rp.time.sleep, orig = (lambda s: None), rp.time.sleep
            try:
                with self.assertRaises(rp.BackendError) as cm:
                    be.complete('extract', 's', 'u', {})
            finally:
                rp.time.sleep = orig
            self.assertIn('MAX_TOKENS', str(cm.exception))
            self.assertEqual(len(seq), 4, '429 는 재시도, 출력 한도 초과는 온도를 올려 두 번까지 다시 시도한 뒤 실패')

    def test_degenerate_detector(self):
        loop = '"issuer": "' + '본 문서의 공식적인 공고 주체는 신한은행임(L5). 본 문서의 도입담당 부서는 총무부임(L77). ' * 8 + '"'
        self.assertTrue(rp.degenerate(loop))
        ok = json.dumps({'items': [{'cat': '무효', 'text': f'입찰무효 사유 {i}번: 서로 다른 조건 {i * 7}건', 'quote': f'사유 {i}'} for i in range(60)]}, ensure_ascii=False)
        self.assertFalse(rp.degenerate(ok))

    def test_env_keys_from_example(self):
        keys = rp.available_keys(rp.load_env())
        self.assertTrue({'GEMINI_API_KEY', 'GEMINI_MODEL', 'TAVILY_API_KEY'} <= set(keys))


# ---------------------------------------------------------------- Gemini 라이브
def _gemini_reachable(env):
    if os.environ.get('RFP_LIVE') == '0' or not env.get('GEMINI_API_KEY'):
        return False, 'GEMINI_API_KEY 없음 또는 RFP_LIVE=0'
    try:
        base = (env.get('GEMINI_BASE_URL') or rp.GeminiBackend.DEFAULT_BASE).rstrip('/')
        req = urllib.request.Request(base + '/models?pageSize=1', headers={'x-goog-api-key': env['GEMINI_API_KEY']})
        urllib.request.urlopen(req, timeout=10).read()
        return True, ''
    except Exception as e:  # noqa: BLE001
        return False, f'Gemini API 에 연결할 수 없음: {type(e).__name__}: {e}'


ENV = rp.load_env()
LIVE, WHY = _gemini_reachable(ENV)


@unittest.skipUnless(LIVE, WHY)
class TestGeminiLive(unittest.TestCase):
    """실제 모델로 최종 방식(chunk_carry_gap)을 돌려 품질 기준을 확인하고 결과를 results/<run_id> 에 저장한다."""

    @classmethod
    def setUpClass(cls):
        cls.rows = rx.main(['--backend', 'gemini', '--cond', 'chunk_carry_gap', '--max-chars', '3000', '--run-id', 'live-test-chunk_carry_gap', '--rpm', '90'])
        cls.by_tc = {r['tc']: r for r in cls.rows}

    def test_single_rfps_recall(self):
        for i in ('TC1', 'TC2', 'TC3', 'TC4'):
            r = self.by_tc[i]
            self.assertFalse(r['errors'], r['errors'])
            self.assertGreaterEqual(r['recall'], 0.85, f"{i} 놓침: {r['missed']}")

    def test_long_doc_keeps_projects_apart(self):
        r = self.by_tc['TC5']
        self.assertEqual(r['projects'], '4/4')
        self.assertGreaterEqual(r['recall'], 0.8, r['missed'])
        self.assertLessEqual(r['misattributed'], 3)

    def test_grounding_and_numbers(self):
        for r in self.rows:
            self.assertGreaterEqual(r['grounded'], 0.9, r['tc'])
            self.assertLessEqual(r['unsupported_nums'], 4, r['tc'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
