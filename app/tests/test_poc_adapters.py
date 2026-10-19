"""Offline integration tests for app/api/poc (no network, no model calls, no credential files).

Run from the repository root (after `node app/scripts/export_agent_data.mjs`):
    python -B -m pytest app/tests/test_poc_adapters.py -q
    python -B -m unittest app.tests.test_poc_adapters -v      (same tests)

Guarantees checked here: canonical KB counts/refs, RFP rules + failing/fake provider modes, layout interrupt →
locked resume (duplicate answer → 409) → done, RAG search, review doc.units mapping, storyboard continuation,
accurate requested/effective modes, secret redaction, header-only credential, and that poc/ is unchanged.
"""
from __future__ import annotations

import copy
import io
import json
import os
import socket
import sys
import threading
import time
import unittest
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True
os.environ['WINMATE_ENV_FILES'] = 'none'          # never read app/.env or poc/.env in tests
for _k in [k for k in os.environ if k.startswith('WINMATE_') and k != 'WINMATE_ENV_FILES'] + ['GEMINI_API_KEY']:
    os.environ.pop(_k, None)

POC = ROOT / 'poc'


def poc_tree() -> dict:
    out = {}
    for p in POC.rglob('*'):
        if p.is_file():
            st = p.stat()
            out[str(p.relative_to(POC))] = (st.st_size, st.st_mtime_ns)
    return out


POC_BEFORE = poc_tree()

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.poc import imports, knowledge  # noqa: E402
from app.api.poc import provider as prov  # noqa: E402
from app.api.poc import settings as cfg  # noqa: E402
from app.api.poc.backends import ModeTracker, layout_llm_summary, make_layout_llm  # noqa: E402
from app.api.poc.jobs import Conflict, JobManager, Waiting  # noqa: E402
from app.api.poc.provider import GeminiProvider, GenerationResult, ProviderError  # noqa: E402
from app.api.poc.routes import router  # noqa: E402

FAKE_KEY = 'AIzaSyFAKEKEYFORTESTS0123456789abcdef'
APP = FastAPI()
APP.include_router(router)
CLIENT = TestClient(APP)
_ORIG = {}


def _no_network(*args, **kwargs):
    raise AssertionError('network access attempted in an offline test')


def setUpModule() -> None:
    _ORIG['connect'] = socket.socket.connect
    _ORIG['create_connection'] = socket.create_connection
    socket.socket.connect = _no_network          # type: ignore[assignment]
    socket.create_connection = _no_network       # type: ignore[assignment]


def tearDownModule() -> None:
    socket.socket.connect = _ORIG['connect']     # type: ignore[assignment]
    socket.create_connection = _ORIG['create_connection']  # type: ignore[assignment]
    prov.set_provider_override(clear=True)


def use_env(**env: str) -> cfg.Settings:
    for k in [k for k in os.environ if k.startswith('WINMATE_') and k != 'WINMATE_ENV_FILES'] + ['GEMINI_API_KEY']:
        os.environ.pop(k, None)
    os.environ['WINMATE_ENV_FILES'] = 'none'
    os.environ.update(env)
    prov.set_provider_override(clear=True)
    return cfg.reload_settings()


def wait_job(job_id: str, statuses=('done', 'error', 'cancelled'), timeout: float = 900) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        snap = CLIENT.get(f'/api/jobs/{job_id}').json()
        if snap['status'] in statuses:
            return snap
        time.sleep(0.2)
    raise AssertionError(f'job {job_id} did not reach {statuses}')


def require_kb() -> knowledge.Bundle:
    if not (knowledge.KB_DIR / 'manifest.json').is_file():
        raise AssertionError('정본 KB 가 없습니다 — 먼저 `node app/scripts/export_agent_data.mjs` 를 실행하세요.')
    return knowledge.bundle()


def rfp_text() -> str:
    return json.loads((ROOT / 'poc/test/tc/rfp_tc.json').read_text(encoding='utf-8'))['tcs'][0]['input']


def layout_case(name: str) -> dict:
    return json.loads((ROOT / f'poc/test/layout_agent/eval/cases/{name}.json').read_text(encoding='utf-8'))['input']


class FailingProvider:
    name, model, available = 'fake', 'fake-model', True

    def __init__(self) -> None:
        self.stages: list = []

    def generate_json(self, *, stage, **kw):
        self.stages.append(stage)
        raise ProviderError('upstream_unavailable', 'HTTP 503: service unavailable')

    def generate_text(self, *, stage, **kw):
        self.stages.append(stage)
        raise ProviderError('upstream_unavailable', 'HTTP 503: service unavailable')

    def model_for(self, tier):
        return self.model

    def chat_model(self, temperature=0.2):
        return None


class FakeRfpProvider(FailingProvider):
    def __init__(self, text: str) -> None:
        super().__init__()
        line = next(ln.strip() for ln in text.split('\n') if len(ln.strip()) > 20)
        self.quote = line[:40]
        self.seen: list = []

    def generate_json(self, *, stage, schema=None, max_output_tokens=None, temperature=None, **kw):
        self.seen.append((stage, schema, max_output_tokens, temperature))
        s = stage.split(':', 1)[1]
        data = {
            'profile': {'doc_type': 'RFP', 'projects': [{'pid': 'P1', 'name': '테스트 사업', 'customer': '테스트 고객', 'start_line': 1, 'contacts': []}], 'glossary': []},
            'extract': {'items': [{'pid': 'P1', 'cat': '규격', 'text': self.quote, 'quote': self.quote, 'modality': '필수', 'section': ''}],
                        'updates': [], 'open_refs': [], 'resolved_refs': [], 'carry': '다음 조각'},
            'gapfill': {'items': [], 'updates': [], 'open_refs': [], 'resolved_refs': [], 'carry': ''},
            'consolidate': {'project': '테스트 사업', 'customer': '테스트 고객', 'target': '', 'keymen': [{'name': '담당', 'weight': 100, 'req_ids': ['R001']}],
                            'merges': [], 'free': '요약', 'evaluation': '', 'pitfalls': [], 'to_confirm': []},
        }[s]
        return GenerationResult(copy.deepcopy(data), json.dumps(data, ensure_ascii=False), self.model, 10, 5, 1)


class FakeLayoutProvider(FailingProvider):
    def generate_json(self, *, stage, schema=None, **kw):
        self.stages.append(stage)
        return GenerationResult({'primary': 'L_A', 'alternates': [], 'reason': '테스트'}, '{}', self.model, 3, 2, 1)


# ---------------------------------------------------------------- settings · dummy contracts · secrets
class T01Settings(unittest.TestCase):
    def test_default_is_dummy_everywhere(self):
        s = use_env()
        self.assertEqual(s.mode, 'dummy')
        self.assertEqual(set(s.functions.values()), {'dummy'})
        self.assertFalse(s.has_key)

    def test_per_function_override_and_invalid_value(self):
        s = use_env(WINMATE_MODE='real', WINMATE_LAYOUT_MODE='dummy', WINMATE_RFP_MODE='bogus')
        self.assertEqual(s.function_mode('search'), 'real')
        self.assertEqual(s.function_mode('layout'), 'dummy')
        self.assertEqual(s.function_mode('rfp'), 'dummy')
        self.assertTrue(any('WINMATE_RFP_MODE' in w for w in s.warnings))

    def test_env_file_precedence(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d) / 'a.env', Path(d) / 'b.env'
            a.write_text('GEMINI_MODEL=model-a\nWINMATE_MODE=real\n', encoding='utf-8')
            b.write_text('GEMINI_MODEL=model-b\nGEMINI_API_KEY=' + FAKE_KEY + '\nWINMATE_LLM_MODE=dummy\n', encoding='utf-8')
            s = cfg.load_settings(environ={'WINMATE_LLM_MODE': 'real'}, env_files=[str(a), str(b)])
        self.assertEqual(s.model, 'model-a')
        self.assertEqual(s.mode, 'real')
        self.assertEqual(s.function_mode('llm'), 'real')
        self.assertTrue(s.has_key)
        self.assertEqual(s.key_source, str(b))
        self.assertNotIn(FAKE_KEY, repr(s))
        self.assertNotIn(FAKE_KEY, json.dumps(s.public()))

    def test_capabilities_never_contain_key(self):
        use_env(GEMINI_API_KEY=FAKE_KEY, WINMATE_MODE='real')
        r = CLIENT.get('/api/poc/capabilities')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn(FAKE_KEY, r.text)
        body = r.json()
        self.assertTrue(body['provider']['available'])
        self.assertTrue(body['settings']['api_key_configured'])


class T02DummyContracts(unittest.TestCase):
    def test_dummy_responses(self):
        use_env()
        r = CLIENT.post('/api/llm', json={'kind': 'json', 'prompt': '안녕'})
        self.assertEqual(r.json()['mode'], 'dummy')
        self.assertEqual(r.json()['error'], 'unavailable')
        r = CLIENT.post('/api/jobs', json={'kind': 'rfp', 'text': 'x' * 80})
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()['mode'], r.json()['error'], r.json()['job']), ('dummy', 'unavailable', None))
        r = CLIENT.post('/api/layouts/search', json={'q': '경쟁사'})
        self.assertEqual(r.json()['mode'], 'dummy')

    def test_llm_real_without_key_is_unavailable_not_success(self):
        use_env(WINMATE_LLM_MODE='real')
        body = CLIENT.post('/api/llm', json={'kind': 'text', 'prompt': '안녕'}).json()
        self.assertEqual((body['mode'], body['error'], body['reason']), ('real', 'unavailable', 'no_api_key'))
        self.assertNotIn('text', body)

    def test_bad_requests(self):
        use_env()
        self.assertEqual(CLIENT.post('/api/jobs', json={'kind': 'nope'}).status_code, 422)
        self.assertEqual(CLIENT.get('/api/jobs/doesnotexist').status_code, 404)


# ---------------------------------------------------------------- provider transport (fake urlopen — no sockets)
class _Resp:
    def __init__(self, payload=None, lines=None):
        self._data = json.dumps(payload).encode() if payload is not None else b''
        self._lines = lines or []

    def read(self):
        return self._data

    def __iter__(self):
        return iter(self._lines)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _ok(text, finish='STOP', thought=None):
    parts = ([{'text': thought, 'thought': True}] if thought else []) + [{'text': text}]
    return {'candidates': [{'content': {'parts': parts}, 'finishReason': finish}], 'usageMetadata': {'promptTokenCount': 7, 'candidatesTokenCount': 3}}


class T03Provider(unittest.TestCase):
    def make(self, responses, seen):
        def fake(req, timeout=None):
            seen.append(req)
            r = responses.pop(0)
            if isinstance(r, Exception):
                raise r
            return r
        s = cfg.load_settings(environ={'GEMINI_API_KEY': FAKE_KEY, 'WINMATE_GEMINI_RPM': '0'}, env_files=())
        return GeminiProvider(s, urlopen=fake)

    def test_header_auth_schema_drop_and_thought_filter(self):
        seen = []
        err = urllib.error.HTTPError('u', 400, 'bad', {}, io.BytesIO(json.dumps({'error': {'message': 'Invalid responseSchema field'}}).encode()))
        p = self.make([err, _Resp(_ok('{"a": 1}', thought='생각'))], seen)
        res = p.generate_json(stage='t', user='u', schema={'type': 'OBJECT', 'properties': {'a': {'type': 'INTEGER'}}})
        self.assertEqual(res.data, {'a': 1})
        self.assertTrue(res.schema_dropped)
        for req in seen:
            self.assertNotIn(FAKE_KEY, req.full_url)
            self.assertEqual(req.get_header('X-goog-api-key'), FAKE_KEY)
        second = json.loads(seen[1].data)
        self.assertNotIn('responseSchema', second['generationConfig'])
        self.assertNotIn(FAKE_KEY, repr(p))

    def test_errors_are_redacted(self):
        seen = []
        err = urllib.error.HTTPError('u', 403, 'forbidden', {}, io.BytesIO(('API key ' + FAKE_KEY + ' is invalid; key=' + FAKE_KEY).encode()))
        p = self.make([err], seen)
        with self.assertRaises(ProviderError) as ctx:
            p.generate_json(stage='t', user='u')
        self.assertEqual(ctx.exception.code, 'auth_failed')
        self.assertNotIn(FAKE_KEY, str(ctx.exception))
        self.assertNotIn(FAKE_KEY, ctx.exception.message)

    def test_max_tokens_escalates_temperature(self):
        seen = []
        p = self.make([_Resp(_ok('{"a":', finish='MAX_TOKENS')), _Resp(_ok('{"a": 2}'))], seen)
        self.assertEqual(p.generate_json(stage='t', user='u', temperature=0.1).data, {'a': 2})
        self.assertEqual(json.loads(seen[1].data)['generationConfig']['temperature'], 0.6)

    def test_stream_is_cumulative(self):
        lines = [b'data: ' + json.dumps(_ok('{"pa')).encode() + b'\n', b'\n', b'data: ' + json.dumps(_ok('rts": []}')).encode() + b'\n']
        seen = []
        p = self.make([_Resp(lines=lines)], seen)
        out = list(p.stream_text(stage='s', user='u', json_mode=True))
        self.assertEqual(out, ['{"pa', '{"parts": []}'])
        self.assertIn('alt=sse', seen[0].full_url)
        self.assertNotIn(FAKE_KEY, seen[0].full_url)

    def test_no_key_never_calls_network(self):
        prov.set_provider_override(clear=True)
        s = cfg.load_settings(environ={}, env_files=())
        provider, reason = prov.get_provider(s)
        self.assertIsNone(provider)
        self.assertEqual(reason, 'no_api_key')


# ---------------------------------------------------------------- canonical knowledge
class T04Knowledge(unittest.TestCase):
    def test_bundle_counts_and_references(self):
        b = require_kb()
        rep = b.report
        self.assertEqual(rep['errors'], [])
        self.assertTrue(rep['counts_ok'], rep['counts'])
        self.assertEqual(rep['counts']['layouts_total'], 835)
        self.assertEqual(rep['counts']['layouts_active'], 594)
        self.assertEqual(rep['counts']['products'], 1068)
        self.assertEqual(rep['counts']['curated_products'], 40)
        self.assertEqual(rep['counts']['scenarios'], 22)
        self.assertTrue(any(f.startswith('L_IND_') for f in b.hidden_layouts))
        self.assertTrue(all(f in b.html for f in b.hidden_layouts))

    def test_layout_kb_subclass(self):
        require_kb()
        kb, index = knowledge.layout_assets()
        L = imports.layout()
        self.assertIsInstance(kb, L.kb.KB)
        self.assertEqual(len(kb.layouts), 835)
        self.assertEqual(len(kb.cards), 835)
        self.assertEqual(sum(1 for c in kb.cards.values() if not c.get('retired')), 594)
        self.assertEqual(len(kb.P), 1068)
        self.assertEqual(len(kb.products), 40)
        self.assertEqual(len(kb.best_scenarios), 22)
        self.assertFalse(any(f.startswith('L_IND_') for f in kb.L))
        self.assertTrue(any(f.startswith('L_IND_') for f in kb.html))
        self.assertTrue(kb.standard_scenarios and kb.std_rules.get('value_map'))
        db_id = next(p['id'] for p in kb.all_products if p['id'] not in kb.curated_ids)
        view = kb.with_products([db_id, 'not-a-product'])
        self.assertEqual(len(view.products), 41)
        self.assertEqual(len(kb.products), 40)
        self.assertIs(view.cards, kb.cards)
        self.assertEqual(index.dense_mode, 'tfidf')
        self.assertTrue(str(L.kb.SRC).startswith(str(ROOT / 'poc')))   # PoC globals untouched
        self.assertEqual(L.config.GEMINI_API_KEY, '')

    def test_story_kb(self):
        require_kb()
        k = knowledge.story_kb()
        self.assertEqual(len(k.scenarios), 22)
        self.assertEqual(len(k.P), 1068)
        self.assertNotIn('cover', [p['type'] for s in k.scenarios for p in s['parts']])

    def test_score_assets_explicit_paths(self):
        require_kb()
        cs, tax, base = knowledge.score_assets()
        ids = set(cs.ids())
        self.assertEqual(ids, {i for f in tax['fine'] for i in f['criteria']})
        self.assertEqual(len(base['products']), 40)


# ---------------------------------------------------------------- RFP
class T05Rfp(unittest.TestCase):
    def test_offline_runs_real_rules(self):
        use_env()                                   # dummy mode; offline=true still runs PoC rules
        r = CLIENT.post('/api/jobs', json={'kind': 'rfp', 'text': rfp_text(), 'offline': True, 'title': 'TC1'})
        self.assertEqual(r.status_code, 202, r.text)
        snap = wait_job(r.json()['id'])
        self.assertEqual(snap['status'], 'done', snap.get('error'))
        res = snap['result']
        self.assertTrue(res['forms'])
        self.assertEqual(res['llm']['requested'], 'offline')
        self.assertEqual(res['llm']['effective'], 'rules')
        self.assertFalse(res['llm']['llm_used'])
        self.assertEqual(res['llm']['calls_ok'], 0)
        self.assertIn('layout_input', res['forms'][0])
        self.assertTrue(res['forms'][0]['layout_input']['id'].startswith('rfp_'))
        seqs = [e['seq'] for e in snap['events']]
        self.assertEqual(seqs, sorted(set(seqs)))

    def test_failing_provider_falls_back_per_stage(self):
        use_env(WINMATE_RFP_MODE='real')
        fake = FailingProvider()
        prov.set_provider_override(fake)
        r = CLIENT.post('/api/jobs', json={'kind': 'rfp', 'text': rfp_text()})
        snap = wait_job(r.json()['id'])
        self.assertEqual(snap['status'], 'done', snap.get('error'))
        llm = snap['result']['llm']
        self.assertEqual((llm['requested'], llm['effective'], llm['llm_used'], llm['calls_ok']), ('real', 'rules', False, 0))
        steps = [f['step'] for f in llm['fallbacks']]
        self.assertTrue(any(s.startswith('rfp:profile') for s in steps))
        self.assertTrue(any(s.startswith('rfp:extract') for s in steps))
        self.assertTrue(any(s.startswith('rfp:consolidate') for s in steps))
        self.assertTrue(llm['consolidate_fallback'])
        self.assertTrue(snap['result']['forms'])

    def test_fake_provider_reports_llm_with_poc_schema_caps(self):
        use_env(WINMATE_RFP_MODE='real')
        text = rfp_text()
        fake = FakeRfpProvider(text)
        prov.set_provider_override(fake)
        snap = wait_job(CLIENT.post('/api/jobs', json={'kind': 'rfp', 'text': text}).json()['id'])
        self.assertEqual(snap['status'], 'done', snap.get('error'))
        llm = snap['result']['llm']
        self.assertEqual(llm['effective'], 'llm')
        self.assertEqual(llm['fallbacks'], [])
        rp = imports.rfp()
        caps = {}
        for stage, schema, cap, temp in fake.seen:
            name = stage.split(':', 1)[1]
            self.assertIs(schema, rp.SCHEMAS[name])
            self.assertEqual(temp, 0.1)
            caps[name] = cap
        self.assertEqual(caps['profile'], 2048)
        self.assertEqual(caps['consolidate'], 8192)
        self.assertEqual(caps['extract'], 12288)

    def test_no_key_real_mode_advertises_fallback(self):
        use_env(WINMATE_RFP_MODE='real')
        snap = wait_job(CLIENT.post('/api/jobs', json={'kind': 'rfp', 'text': rfp_text()}).json()['id'])
        llm = snap['result']['llm']
        self.assertEqual((llm['requested'], llm['effective'], llm['reason']), ('real', 'rules', 'no_api_key'))


# ---------------------------------------------------------------- Layout Agent
class T06Layout(unittest.TestCase):
    def test_interrupt_answer_conflict_resume(self):
        require_kb()
        use_env()
        r = CLIENT.post('/api/jobs', json={'kind': 'layout', 'input': layout_case('C07_L3'), 'max_slides': 1, 'offline': True, 'interactive': True})
        self.assertEqual(r.status_code, 202, r.text)
        jid = r.json()['id']
        snap = wait_job(jid, ('waiting', 'done', 'error', 'cancelled'))
        self.assertEqual(snap['status'], 'waiting', snap.get('error'))
        payload = snap['waiting']
        self.assertEqual(payload['type'], 'strategy_interview')
        self.assertTrue(payload['questions'])
        self.assertTrue(snap['partial']['partial'])
        bad = CLIENT.post(f'/api/jobs/{jid}/answer', json={'answers': {'no_such_question': 'x'}})
        self.assertEqual(bad.status_code, 422)
        self.assertEqual(CLIENT.get(f'/api/jobs/{jid}').json()['status'], 'waiting')
        ok = CLIENT.post(f'/api/jobs/{jid}/answer', json={'answers': {}, 'use_defaults': True})
        self.assertEqual(ok.status_code, 200, ok.text)
        dup = CLIENT.post(f'/api/jobs/{jid}/answer', json={'answers': {}, 'use_defaults': True})
        self.assertEqual(dup.status_code, 409)
        snap = wait_job(jid)
        self.assertEqual(snap['status'], 'done', snap.get('error'))
        res = snap['result']
        kb, _ = knowledge.layout_assets()
        self.assertTrue(res['slides'])
        self.assertGreater(len(res['slides']), 1)
        self.assertTrue(any('장수 목표' in w for w in res['warnings']))
        self.assertTrue(all(s['f'] in kb.L and not kb.L[s['f']].get('retired') for s in res['slides']))
        self.assertTrue(res['app_proposal']['parts'])
        self.assertIn('review', res)
        self.assertEqual(res['llm']['effective'], 'rules')
        self.assertFalse(res['llm']['llm_used'])
        for key in ('graph', 'cfg', 'kb', 'state'):
            self.assertNotIn(key, res)

    def test_cancel_waiting_job(self):
        require_kb()
        use_env()
        jid = CLIENT.post('/api/jobs', json={'kind': 'layout', 'input': layout_case('C07_L3'), 'offline': True}).json()['id']
        self.assertEqual(wait_job(jid, ('waiting', 'done', 'error'))['status'], 'waiting')
        self.assertEqual(CLIENT.post(f'/api/jobs/{jid}/cancel').json()['status'], 'cancelled')
        self.assertEqual(CLIENT.post(f'/api/jobs/{jid}/answer', json={'answers': {}}).status_code, 409)

    def test_llm_shim_keeps_poc_structured_contract(self):
        L = imports.layout()
        fake = FakeLayoutProvider()
        tracker = ModeTracker('real', fake, '')
        llm = make_layout_llm(fake, tracker)
        self.assertTrue(llm.online)
        out = llm.structured(L.schemas.LLMLayoutPick, 'sys', 'user', tag='pick')
        self.assertEqual(out.primary, 'L_A')
        failing = FailingProvider()
        llm2 = make_layout_llm(failing, ModeTracker('real', failing, ''))
        self.assertIsNone(llm2.structured(L.schemas.LLMLayoutPick, 'sys', 'user', tag='pick'))
        self.assertFalse(llm2.trace[-1]['ok'])
        llm.trace.append({'tag': 'x', 'ok': False, 'err': 'e'})
        self.assertEqual(layout_llm_summary(llm, tracker)['effective'], 'mixed')
        self.assertEqual(layout_llm_summary(llm2, ModeTracker('real', failing, ''))['effective'], 'rules')
        offline = make_layout_llm(None, ModeTracker('offline', None, 'offline_requested'))
        self.assertFalse(offline.online)
        self.assertIsNone(offline.structured(L.schemas.LLMLayoutPick, 's', 'u', tag='t'))


# ---------------------------------------------------------------- RAG search
class T07Search(unittest.TestCase):
    def test_deterministic_search(self):
        require_kb()
        use_env(WINMATE_SEARCH_MODE='real')         # real without key: search needs no model
        body = {'q': '경쟁사 비교 우위', 'part': 'competition', 'k': 8, 'industry': None}
        a = CLIENT.post('/api/layouts/search', json=body)
        self.assertEqual(a.status_code, 200, a.text)
        b = CLIENT.post('/api/layouts/search', json=body).json()
        a = a.json()
        self.assertEqual(a['mode'], 'real')
        self.assertTrue(0 < len(a['items']) <= 8)
        self.assertEqual([x['f'] for x in a['items']], [x['f'] for x in b['items']])
        kb, _ = knowledge.layout_assets()
        for it in a['items']:
            self.assertTrue({'f', 'code', 'name', 'score', 'why', 'part'} <= set(it))
            self.assertFalse(kb.cards[it['f']].get('retired'))
        self.assertEqual(CLIENT.post('/api/layouts/search', json={'q': 'x', 'part': 'nope', 'offline': True}).status_code, 422)


# ---------------------------------------------------------------- review
def pptx_doc() -> dict:
    def unit(n, title, boxes):
        return {'n': n, 'title': title, 'text': '\n'.join(b['text'] for b in boxes if b.get('text')), 'boxes': boxes, 'hidden': False}
    t = lambda text, x, y, w=0.6, h=0.1, sz=24: {'kind': 'text', 'text': text, 'x': x, 'y': y, 'w': w, 'h': h, 'max': sz, 'min': sz, 'name': 'T'}  # noqa: E731
    return {'kind': 'pptx', 'slides': True, 'slideWpt': 960, 'units': [
        unit(1, '표지 · 테스트 고객 제안', [t('표지 · 테스트 고객 제안', 0.05, 0.1, sz=40), {'kind': 'pic', 'x': 0.5, 'y': 0, 'w': 0.5, 'h': 1, 'name': 'Picture 1', 'text': ''}]),
        unit(2, '고객 과제', [t('고객 과제', 0.05, 0.05, sz=32), t('대기 시간이 길어 고객 불만이 큽니다', 0.05, 0.3, sz=16), t('겹치는 설명 문장', 0.05, 0.31, sz=14)]),
        unit(3, '도입 사례', [t('도입 사례', 0.05, 0.05, sz=32), t('A 호텔 도입 후 대기 30% 감소', 0.05, 0.4, sz=16), t('3', 0.9, 0.95, 0.05, 0.03, sz=10)]),
        unit(4, '다음 단계', [t('다음 단계', 0.05, 0.05, sz=32), t('파일럿 일정 협의', 0.05, 0.4, sz=16)]),
        {'n': 5, 'title': '숨김', 'text': '숨김', 'boxes': [], 'hidden': True},
    ]}


class T08Review(unittest.TestCase):
    def test_doc_units_mapping(self):
        from app.api.poc.adapters.review import scenario_from_doc
        sc, conv = scenario_from_doc(pptx_doc(), {'customer': '테스트 고객', 'signals': ['대기 시간을 줄이고 싶어요']})
        self.assertEqual(conv['sheets'], 4)
        self.assertEqual(conv['skipped_hidden'], 1)
        self.assertEqual(conv['geometry'], 'measured')
        s1, s2, s3 = sc['sheets'][0], sc['sheets'][1], sc['sheets'][2]
        self.assertAlmostEqual(s1['texts'][0]['x'], 64.0)
        self.assertAlmostEqual(s1['texts'][0]['max_px'], round(40 * 1280 / 960, 1))
        self.assertTrue(s1['photo_first'])
        self.assertEqual(s1['part'], 'cover')
        self.assertEqual(s3['part'], 'case')
        self.assertEqual(s2['overlaps'], [[1, 2]])
        self.assertIn('DS1', conv['unreliable_criteria'])
        pdf = {'kind': 'pdf', 'slideWpt': 960, 'units': [{'n': i, 'title': f'쪽 {i}', 'text': f'쪽 {i}\n본문 내용입니다 {i}', 'lineSizes': [[28, 4], [14, 9]],
                                                          'footer': str(i), 'nPic': 1, 'boxes': []} for i in range(1, 4)]}
        sc2, conv2 = scenario_from_doc(pdf, {})
        self.assertEqual(conv2['geometry'], 'approximate')
        self.assertIn('SB2', conv2['unreliable_criteria'])
        self.assertTrue(any(t['y'] >= 660 for t in sc2['sheets'][0]['texts']))

    def test_offline_review_jobs(self):
        require_kb()
        use_env()
        snap = wait_job(CLIENT.post('/api/jobs', json={'kind': 'review', 'doc': pptx_doc(), 'context': {'customer': '테스트 고객'}, 'offline': True}).json()['id'])
        self.assertEqual(snap['status'], 'done', snap.get('error'))
        res = snap['result']
        self.assertIn('aggregate', res['evaluation'])
        self.assertEqual(res['llm']['effective'], 'rules')
        self.assertTrue(all(s['mode'] == 'rules' for s in res['evaluation']['scores']))
        scen = json.loads((ROOT / 'poc/test/proposal_score/data/best_scenarios.json').read_text(encoding='utf-8'))['scenarios'][0]
        snap = wait_job(CLIENT.post('/api/jobs', json={'kind': 'review', 'proposal': scen, 'offline': True}).json()['id'])
        self.assertEqual(snap['status'], 'done', snap.get('error'))
        self.assertEqual(snap['result']['conversion']['source'], 'sheets')


# ---------------------------------------------------------------- storyboard
class T09Storyboard(unittest.TestCase):
    def seed(self, sid='p_case_f6', keep=4) -> dict:
        seeds = {p['id']: p for p in json.loads((ROOT / 'poc/test/storyboard_agent/data/seeds.json').read_text(encoding='utf-8'))}
        p = copy.deepcopy(seeds[sid])
        story = [x for x in p['parts'] if not x.get('deck')]
        p['parts'] = story[:keep]
        return p

    def test_continuation_and_redesign(self):
        b = require_kb()
        use_env()
        pr = self.seed()
        db_id = next(p['id'] for p in b.catalog['products'] if p['id'] not in set(b.catalog['curated_product_ids']))
        pr.setdefault('ctx', {}).setdefault('products', []).append(db_id)
        snap = wait_job(CLIENT.post('/api/jobs', json={'kind': 'storyboard', 'proposal': pr, 'offline': True}).json()['id'])
        self.assertEqual(snap['status'], 'done', snap.get('error'))
        res = snap['result']
        self.assertEqual(res['kept_parts'], 4)
        self.assertEqual(sum(1 for p in res['storyboard']['parts'] if p['origin'] == 'kept'), 4)
        self.assertEqual(len(res['app_parts']), sum(1 for p in res['storyboard']['parts'] if p['origin'] == 'new'))
        self.assertFalse(any(db_id in w for w in res['warnings']))
        self.assertEqual(res['llm']['effective'], 'rules')
        snap = wait_job(CLIENT.post('/api/jobs', json={'kind': 'storyboard', 'proposal': self.seed(), 'mode': 'redesign', 'offline': True}).json()['id'])
        self.assertEqual(snap['result']['kept_parts'], 0)

    def test_failing_provider_uses_rules(self):
        require_kb()
        use_env(WINMATE_STORYBOARD_MODE='real')
        prov.set_provider_override(FailingProvider())
        snap = wait_job(CLIENT.post('/api/jobs', json={'kind': 'storyboard', 'proposal': self.seed()}).json()['id'])
        llm = snap['result']['llm']
        self.assertEqual((llm['requested'], llm['effective'], llm['llm_used']), ('real', 'rules', False))
        self.assertTrue(llm['fallbacks'])


# ---------------------------------------------------------------- job manager
class T10Jobs(unittest.TestCase):
    def test_retention_seq_and_locked_resume(self):
        m = JobManager(workers=2, max_jobs=3)
        gate = threading.Event()
        waiting = m.submit('layout', 'w', {}, lambda j: Waiting({'questions': []}))
        done = [m.submit('rfp', f'j{i}', {}, lambda j: {'ok': True}) for i in range(5)]
        end = time.time() + 10
        while time.time() < end and not (all(j.status == 'done' for j in done) and waiting.status == 'waiting'):
            time.sleep(0.02)
        m.submit('rfp', 'trigger', {}, lambda j: gate.wait(5) or {'ok': True})
        self.assertIn(waiting.id, m._jobs)
        self.assertLessEqual(len(m._jobs), 4)
        m.resume(waiting.id, lambda j: (gate.wait(5), {'ok': 1})[1])
        with self.assertRaises(Conflict):
            m.resume(waiting.id, lambda j: {'ok': 2})
        gate.set()
        end = time.time() + 10
        while time.time() < end and waiting.status != 'done':
            time.sleep(0.02)
        self.assertEqual(waiting.result, {'ok': 1})
        seqs = [e['seq'] for e in waiting.events_since(0)[0]]
        self.assertEqual(seqs, sorted(set(seqs)))


# ---------------------------------------------------------------- must run last
class T99PocUnchanged(unittest.TestCase):
    def test_poc_tree_unchanged(self):
        after = poc_tree()
        added = sorted(set(after) - set(POC_BEFORE))
        removed = sorted(set(POC_BEFORE) - set(after))
        changed = sorted(k for k in set(after) & set(POC_BEFORE) if after[k] != POC_BEFORE[k])
        self.assertEqual((added, removed, changed), ([], [], []))


if __name__ == '__main__':
    unittest.main()
