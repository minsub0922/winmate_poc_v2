"""레이아웃 자동 구성 (job kind ``compose`` · step ``auto``) — offline: a fake provider and a small slice of the composer library.

Covers the code-level guarantees of the deck plan, the event stream (plan → part started / done / error), partial failure
with one retry, cancellation, the thread-safe registries shared by the parts composed in parallel, request validation
and the sub-set (retry) request that plans around the parts already on the board.
"""
import contextlib
import copy
import json
import os
import re
import sys
import threading
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.environ.setdefault('PYTHONDONTWRITEBYTECODE', '1')
sys.dont_write_bytecode = True

from app.api.poc.adapters import compose  # noqa: E402
from app.api.poc.jobs import BadRequest, JobCancelled, ModelFailure  # noqa: E402

FIXTURE = ROOT / 'app' / 'tests' / 'fixtures' / 'compose_auto.json'
POINTS = ['신메뉴와 가격을 전 매장에 당일 반영', '가두 매장 밖에서 손님을 끄는 옥외 화면', '냉난방 전력 절감과 원격 관리', '가맹점주의 초기 비용 부담 완화']
_STATE = {}


def setUpModule():
    """the fixture library stands in for app/data/runtime/composer/library.json (nothing is built, nothing is read from the KB)."""
    data = json.loads(FIXTURE.read_text(encoding='utf-8'))
    auto = compose._auto()
    from composer import fill, library, pictures
    from eval.fake_llm import FakeLLM
    _STATE.update(data=data, auto=auto, library=library, pictures=pictures, fill=fill, FakeLLM=FakeLLM,
                  saved=dict(library._CACHE), composer=compose._composer)
    library._CACHE.clear()
    library._CACHE[str(library.OUT)] = data['library']
    for cache in (pictures._VX, pictures._PIDX, pictures._IDX, fill._IDX, fill._BRAND):
        cache.clear()
    compose._composer = lambda: None  # the library is already "loaded"


def tearDownModule():
    library, pictures, fill = _STATE['library'], _STATE['pictures'], _STATE['fill']
    library._CACHE.clear()
    library._CACHE.update(_STATE['saved'])
    for cache in (pictures._VX, pictures._PIDX, pictures._IDX, fill._IDX, fill._BRAND):
        cache.clear()
    compose._composer = _STATE['composer']


class Provider:
    """app provider stand-in: answers through the plumbing-only FakeLLM; ``fail(stage, user)`` may raise for a call."""
    model = 'fake-model'

    def __init__(self, fail=None, plan=None):
        self.fake = _STATE['FakeLLM']()
        self.fail = fail
        self.plan = plan
        self.calls = []
        self.lock = threading.Lock()

    def generate_json(self, *, stage, system='', user=None, schema=None, temperature=0.2, max_output_tokens=8192, seed=None, **kw):
        short = stage.split(':', 1)[1]
        with self.lock:
            self.calls.append(short)
        if self.fail:
            self.fail(short, user)
        data = self.plan(user, schema) if (self.plan and short == 'auto_plan') else self.fake.json(stage=short, prompt=user, schema=schema)
        return types.SimpleNamespace(data=data, prompt_tokens=10, output_tokens=5)


class Job:
    def __init__(self, cancel_after=None):
        self.events = []
        self.lock = threading.Lock()
        self.cancel_after = cancel_after

    def emit(self, type_, **data):
        with self.lock:
            self.events.append({'type': type_, **copy.deepcopy(data)})

    def log(self, message, level='info'):
        self.emit('text', message=message)

    def check_cancel(self):
        if self.cancel_after is not None and len([e for e in self.events if e['type'] == 'plan']) >= self.cancel_after:
            raise JobCancelled()


def request(parts=None, **over):
    d = _STATE['data']
    body = copy.deepcopy(d['body'])
    if parts is not None:
        body['parts'] = [p for p in body['parts'] if p['id'] in parts]
    body.update(over)
    return copy.deepcopy(d['proposal']), body


def run(provider=None, job=None, parts=None, **over):
    pr, body = request(parts, **over)
    job = job or Job()
    provider = provider or Provider()
    out = compose.run_auto(job, pr, compose._auto_body(body), types.SimpleNamespace(provider=provider), engine=_STATE['auto'])
    return out, job, provider


def deck_repeats(out):
    """the uses of one picture identity after its first across the composed deck (product cuts · icons may repeat)."""
    uses = [((p['name'], x['f'], k), v['src']) for p in out['app_parts'] for x in p['layouts'] for k, v in sorted(x['ov']['img'].items())
            if isinstance(v, dict) and v.get('src') and not v.get('hidden')]
    return _STATE['pictures'].deck_repeats(uses)


def shown(out):
    """(part, layout, slot, src, meta) of every picture on the composed deck."""
    norm = _STATE['pictures'].norm_src
    return [(p['name'], x['f'], k, norm(v), x['agent']['img'].get(k) or {}) for p in out['app_parts'] for x in p['layouts']
            for k, v in x['ov']['img'].items() if isinstance(v, dict) and v.get('src') and not v.get('hidden')]


@contextlib.contextmanager
def patched_library(mut):
    """the fixture library with ``mut(lib)`` applied while the block runs (derived indexes rebuilt before and after)."""
    library, pictures, fill = _STATE['library'], _STATE['pictures'], _STATE['fill']
    key = str(library.OUT)
    saved = library._CACHE[key]
    lib = copy.deepcopy(saved)
    mut(lib)

    def clear():
        for cache in (pictures._VX, pictures._PIDX, pictures._IDX, pictures._DESC_TOK, fill._IDX, fill._BRAND):
            cache.clear()
    library._CACHE[key] = lib
    clear()
    try:
        yield lib
    finally:
        library._CACHE[key] = saved
        clear()


def scene_photo(src, desc, shows, place, ind='FB'):
    """a photo record as the library builds it (what the caption says · what the vision pass saw)."""
    return {'src': src, 'desc': desc, 'names': [desc], 'kind': 'scene', 'inds': {ind: 1.0}, 'products': [], 'solutions': [], 'case': None, 'cust': '',
            'spaces': [], 'w': 1400, 'h': 900, 'group': 'ph', 'usage': [], 'scen': [], 'ind_primary': [ind], 'cls': 'scene', 'place': [ind], 'neutral': False,
            'vf': {'shows': shows, 'place': place, 'brand': '', 'brand_prominent': False, 'products': ['none'], 'kind': 'photo', 'quality': 'good'}}


PROFILE_OF = [('주방', 'kitchen'), ('홀', 'dining'), ('객석', 'dining'), ('룸', 'dining'), ('카운터', 'reception'), ('계산', 'reception'),
              ('진열', 'retail'), ('쇼윈도', 'retail'), ('사무', 'office'), ('무인', 'selfservice'), ('교육장', 'meeting')]


def with_profiles(lib):
    """the fixture predates space profiles (spatial library) — give its café spaces theirs."""
    for v in lib['verticals'].values():
        for sp in v['spaces']:
            sp['profile'] = next((prof for word, prof in PROFILE_OF if word in sp['name']), 'retail')


class PlanGuaranteeTest(unittest.TestCase):
    """the model's plan is completed and corrected by code before anything is composed."""

    def plan(self, model_plan):
        auto = _STATE['auto']
        pr, body = request()
        ctx = auto.build_context(pr, body)

        class LLM:
            def json(self, **kw):
                return model_plan(kw['prompt'], kw['schema'])
        return ctx, auto.orchestrate(ctx, LLM())

    @staticmethod
    def ids(prompt):
        return re.findall(r'^(P\d+) \[', prompt, re.M)

    def test_every_linked_item_lands_in_a_part_that_can_show_it(self):
        def empty(prompt, schema):  # the model assigns nothing at all
            return {'thesis': 't', 'storyline': 's', 'points': [{'id': f'R{n + 1}', 'text': t, 'products': [], 'solutions': []} for n, t in enumerate(POINTS[:3])],
                    'parts': [{'id': i, 'message': f'm {i}', 'points': [], 'refs': [], 'products': [], 'solutions': [], 'cases': [], 'spaces': [], 'n_slides': 2} for i in self.ids(prompt)]}
        ctx, plan = self.plan(empty)
        cap = {p['id']: p['cap'] for p in ctx['parts']}
        for kind in ('products', 'solutions', 'cases'):
            for x in ctx[kind]:
                holders = [p for p in plan['parts'] if x in p[kind]]
                self.assertTrue(holders, f'{kind} {x} is in no part')
                self.assertTrue(any(cap[p['id']][kind] for p in holders), f'{kind} {x} only in parts that cannot show it')
        self.assertTrue(plan['fixes'], 'the corrections are recorded')

    def test_a_requirement_point_has_exactly_one_owner_and_static_parts_own_none(self):
        def greedy(prompt, schema):  # every part claims every point
            return {'thesis': 't', 'storyline': 's', 'points': [{'id': f'R{n + 1}', 'text': t, 'products': [], 'solutions': []} for n, t in enumerate(POINTS)],
                    'parts': [{'id': i, 'message': f'm {i}', 'points': ['R1', 'R2', 'R3', 'R4'], 'refs': [], 'products': [], 'solutions': [], 'cases': [], 'spaces': [],
                               'n_slides': 2} for i in self.ids(prompt)]}
        ctx, plan = self.plan(greedy)
        owners = [r for p in plan['parts'] for r in p['point_ids']]
        self.assertEqual(sorted(owners), ['R1', 'R2', 'R3', 'R4'], 'each point owned once')
        cap = {p['id']: p['cap'] for p in ctx['parts']}
        for p in plan['parts']:
            if p['point_ids']:
                self.assertTrue(cap[p['id']]['points'], f"{p['name']} cannot answer a requirement")
            self.assertFalse(set(p['refs']) & set(p['point_ids']))
        self.assertTrue(all(x['owner'] for x in plan['points']))

    def test_unknown_ids_are_dropped_and_template_order_is_kept(self):
        def wild(prompt, schema):
            ids = self.ids(prompt)
            return {'thesis': 't', 'storyline': 's', 'points': [{'id': 'R1', 'text': POINTS[0], 'products': ['d99'], 'solutions': ['zzz']}, {'id': 'R2', 'text': POINTS[1], 'products': [], 'solutions': []},
                                                               {'id': 'R3', 'text': POINTS[2], 'products': [], 'solutions': []}],
                    'parts': [{'id': i, 'message': f'm {i}', 'points': ['R9'], 'refs': ['R8'], 'products': ['d99', 'nope'], 'solutions': ['s77'], 'cases': ['c42'], 'spaces': ['x99'],
                               'n_slides': 500} for i in reversed(ids)]}
        ctx, plan = self.plan(wild)
        self.assertEqual([p['id'] for p in plan['parts']], [p['id'] for p in ctx['parts']], 'template order')
        known = {'products': set(ctx['products']), 'solutions': set(ctx['solutions']), 'cases': set(ctx['cases']), 'spaces': {s['id'] for s in ctx['spaces']}}
        for p in plan['parts']:
            for kind, ok in known.items():
                self.assertTrue(set(p[kind]) <= ok, f'{kind} outside the inputs: {p[kind]}')
            self.assertLessEqual(p['n_slides'], 40)

    def test_space_parts_follow_the_space_plan(self):
        fake = _STATE['FakeLLM']()
        ctx, plan = self.plan(lambda prompt, schema: fake.json(stage='auto_plan', prompt=prompt, schema=schema))
        given = _STATE['data']['body']['space_plan']['spaces']
        linked = set(ctx['products'])
        want = [s['id'] for s in given]
        cap = {p['id']: p['cap'] for p in ctx['parts']}
        space_parts = [p for p in plan['parts'] if cap[p['id']]['spaces']]
        self.assertTrue(space_parts)
        for p in space_parts:
            self.assertEqual(p['spaces'], want)
            placed = [x for s in given for x in s['products'] if x in linked]
            self.assertEqual(p['products'][:len(dict.fromkeys(placed))], list(dict.fromkeys(placed)))


class EventStreamTest(unittest.TestCase):
    def test_plan_then_started_and_done_for_every_part(self):
        out, job, provider = run()
        ev = [e for e in job.events if e['type'] in ('plan', 'part')]
        self.assertEqual(ev[0]['type'], 'plan')
        self.assertEqual(sum(1 for e in ev if e['type'] == 'plan'), 1)
        plan = ev[0]['plan']
        self.assertTrue(plan['thesis'])
        ids = [p['id'] for p in _STATE['data']['body']['parts']]
        self.assertEqual([p['id'] for p in plan['parts']], ids)
        for key in ('message', 'points', 'products', 'solutions', 'cases', 'spaces', 'avoid', 'n_slides'):
            self.assertIn(key, plan['parts'][0])
        for pid in ids:
            mine = [e for e in ev if e.get('id') == pid]
            self.assertEqual([e['status'] for e in mine], ['started', 'done'], pid)
            done = mine[-1]
            self.assertTrue(done['layouts'])
            for x in done['layouts']:
                self.assertTrue({'f', 'status', 'ov'} <= set(x))
                self.assertIn(x['status'], ('done', 'partial'))
                self.assertIsInstance(x['ov']['t'], dict)
                self.assertIsInstance(x['ov']['img'], dict)
        self.assertEqual(out['step'], 'auto')
        self.assertEqual([p['id'] for p in out['app_parts']], ids)
        self.assertEqual(out['failed'], [])
        self.assertEqual(out['llm']['effective'], 'llm')
        self.assertEqual(out['llm']['model'], 'fake-model')
        self.assertEqual(out['llm']['calls_ok'], len(provider.calls))
        self.assertGreater(out['llm']['calls_ok'], 0)
        deck = [p for p in out['app_parts'] if p['deck']]
        self.assertEqual(len(deck), 1, 'the hidden cover part comes back like any other part')

    def test_numbering_and_names_are_written_by_code(self):
        out, _, _ = run()
        body = [p for p in out['app_parts'] if not p['deck']]
        page = sum(len(p['layouts']) for p in out['app_parts'] if p['deck'])
        for no, p in enumerate(body, 1):
            for x in p['layouts']:
                page += 1
                t = x['ov']['t']
                if re.fullmatch(r'L_VS_DIV_R\d', x['f']):
                    self.assertEqual(t['1'], f'{no:02d} / {len(body):02d}')
                    self.assertEqual(t['2'], p['name'])
                conf = [v for v in t.values() if isinstance(v, str) and v.startswith('CONFIDENTIAL · ')]
                for v in conf:
                    self.assertEqual(v, f'CONFIDENTIAL · {page}', (p['name'], x['f']))
        toc = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_VS_TOC')
        self.assertEqual([toc['ov']['t'][str(4 + 5 * i)] for i in range(len(body))], [p['name'] for p in body])

    def test_bound_pictures_and_audit_trail(self):
        out, _, _ = run()
        d = _STATE['data']
        linked = set(d['proposal']['ctx']['products'])
        own_cuts = _STATE['pictures'].own_cuts
        seen = 0
        for p in out['app_parts']:
            for x in p['layouts']:
                for key, m in x['agent']['img'].items():
                    self.assertIn('why', m, 'every chosen picture says why')
                    if m.get('why') == 'product_exact':
                        seen += 1
                        self.assertIn(m['product'], linked)
                        src = _STATE['pictures'].norm_src(x['ov']['img'][key])
                        self.assertIn(src, own_cuts(m['product']) + [_STATE['pictures'].product_cut(m['product'])], 'a product slot shows that exact product')
                        self.assertEqual(_STATE['data']['library']['images'][src]['products'][0], m['product'])
                if x['f'] == 'L_VS_SPACE':
                    self.assertEqual(x['agent']['img']['0']['why'], 'product_exact')
                    self.assertEqual(x['agent']['img']['0']['product'], x['agent']['bind']['product'])
                    self.assertEqual(x['agent']['img']['1']['kind'], 'space')
        self.assertGreater(seen, 3)

    def test_a_product_without_a_picture_gets_an_empty_slot_not_another_products_cut(self):
        # a space whose representative product is the kiosk (the fixture holds no picture of it). (The 개요 DSS page used to show this;
        # it is the industry deck's own page now — user instruction 2026-11-17 — so the space sheet carries the check.)
        pr, body = request()
        body['space_plan']['spaces'][0]['products'] = ['kiosk']
        out, _ = run_req(pr, body)
        sheet = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_VS_SPACE' and (x['agent']['img'].get('0') or {}).get('product') == 'kiosk')
        self.assertEqual(sheet['ov']['img']['0'].get('hidden'), True)
        self.assertEqual(sheet['agent']['img']['0']['flag'], 'no_product_image')

    def test_birdseye_image_fills_the_plan_slot(self):
        sp = copy.deepcopy(_STATE['data']['body']['space_plan'])
        sp['birdseye'] = {'status': 'done', 'image': '/api/spatial/previews/test.png'}
        out, _, _ = run(space_plan=sp)
        bird = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'].startswith('L_VS_BIRD_'))
        self.assertEqual(bird['ov']['img']['0']['src'], '/api/spatial/previews/test.png')
        self.assertEqual(bird['agent']['img']['0']['why'], 'customer_birdseye')

    def test_layouts_follow_the_plan(self):
        out, _, _ = run()
        d = _STATE['data']
        spaces = [s for s in d['body']['space_plan']['spaces'] if s['products']]
        fs = [x['f'] for p in out['app_parts'] for x in p['layouts']]
        self.assertEqual(fs.count('L_VS_SPACE'), len(spaces), 'one space slide per planned space with a product')
        self.assertIn(f"L_VS_BIRD_S{max(3, len(d['body']['space_plan']['spaces']))}", fs)
        self.assertEqual(fs.count('L_VS_CASE'), len(d['proposal']['ctx']['cases']))
        sols = {x['agent']['bind'].get('solution') for p in out['app_parts'] for x in p['layouts'] if x['agent']['kind'] == 'solution'}
        self.assertEqual(sols, set(d['proposal']['ctx']['solutions']), 'solution slides = the linked solutions (others dropped, missing ones added)')
        once = [f for f in fs if f not in out['repeatable'] and not re.fullmatch(r'L_VS_DIV_R\d', f)]
        self.assertEqual(len(once), len(set(once)), 'one-per-deck layouts are not repeated')


class FailureTest(unittest.TestCase):
    def test_one_failed_part_does_not_sink_the_others_and_is_retried_once(self):
        target = next(p for p in _STATE['data']['body']['parts'] if p['name'] == '공간별 제안')
        seen = {'n': 0}

        def fail(stage, user):
            if stage == 'auto_text' and '[이 파트] 03/06 공간별 제안' in user:
                seen['n'] += 1
                raise RuntimeError('boom')
        out, job, _ = run(Provider(fail=fail))
        self.assertEqual(seen['n'], 2, 'the failed part was tried twice')
        self.assertEqual(out['failed'], [target['id']])
        mine = [e for e in job.events if e['type'] == 'part' and e.get('id') == target['id']]
        self.assertEqual([e['status'] for e in mine], ['started', 'error'])
        self.assertIn('boom', mine[-1]['message'])
        others = [p['id'] for p in _STATE['data']['body']['parts'] if p['id'] != target['id']]
        self.assertEqual([p['id'] for p in out['app_parts']], others)
        for pid in others:
            self.assertEqual([e['status'] for e in job.events if e['type'] == 'part' and e.get('id') == pid], ['started', 'done'])

    def test_a_part_that_fails_once_recovers(self):
        seen = {'n': 0}

        def fail(stage, user):
            if stage == 'auto_text' and '[이 파트] 03/06 공간별 제안' in user and not seen['n']:
                seen['n'] += 1
                raise RuntimeError('flaky')
        out, job, _ = run(Provider(fail=fail))
        self.assertEqual(out['failed'], [])
        self.assertEqual(len(out['app_parts']), len(_STATE['data']['body']['parts']))

    def test_all_parts_failing_is_a_model_failure_not_a_rule_made_deck(self):
        def fail(stage, user):
            if stage != 'auto_plan':
                raise RuntimeError('down')
        with self.assertRaises(ModelFailure) as cm:
            run(Provider(fail=fail))
        self.assertEqual(cm.exception.code, 'incomplete_output')

    def test_plan_failure_fails_the_job(self):
        def fail(stage, user):
            raise RuntimeError('no model')
        job = Job()
        with self.assertRaises(RuntimeError):
            run(Provider(fail=fail), job)
        self.assertFalse([e for e in job.events if e['type'] in ('plan', 'part')], 'nothing is emitted without a plan')

    def test_cancel_stops_the_job(self):
        job = Job(cancel_after=1)  # cancelled right after the plan event
        with self.assertRaises(JobCancelled):
            run(job=job)
        self.assertFalse([e for e in job.events if e['type'] == 'part' and e.get('status') == 'done'])

    def test_unknown_layout_is_kept_as_is_and_reported(self):
        pr, body = request()
        part = next(p for p in body['parts'] if p['name'] == 'AI 카페')
        part['exemplar'].append({'f': 'L_NOT_IN_LIBRARY', 'role': '모르는 장', 't': {'0': '그대로'}, 'img': {'0': {'src': 'img/x.png'}}})
        job = Job()
        out = compose.run_auto(job, pr, compose._auto_body(body), types.SimpleNamespace(provider=Provider()), engine=_STATE['auto'])
        got = next(p for p in out['app_parts'] if p['id'] == part['id'])
        x = next(x for x in got['layouts'] if x['f'] == 'L_NOT_IN_LIBRARY')
        self.assertEqual(x['status'], 'partial')
        self.assertEqual(x['ov']['t'], {'0': '그대로'})
        self.assertEqual(x['ov']['img']['0']['src'], 'img/x.png')
        done = next(e for e in job.events if e['type'] == 'part' and e.get('id') == part['id'] and e['status'] == 'done')
        self.assertTrue(any('unknown layout' in n for n in done['notes']))


class RegistryTest(unittest.TestCase):
    def test_claim_is_atomic_across_threads(self):
        reg = _STATE['pictures'].Registry(['seed'])
        self.assertFalse(reg.claim('seed'))
        wins = []
        barrier = threading.Barrier(16)

        def worker():
            barrier.wait()
            for k in range(200):
                if reg.claim(f'k{k}'):
                    wins.append(k)
        threads = [threading.Thread(target=worker) for _ in range(16)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(sorted(wins), list(range(200)), 'every key was claimed exactly once')

    def test_parallel_parts_never_share_a_picture(self):
        """every picture on every sheet — 목차 cards, kept template pictures, solution media and ranked photos alike — appears once
        (product cuts and icons may repeat)."""
        out, _, _ = run()
        self.assertEqual(deck_repeats(out), [])
        self.assertTrue([1 for p in out['app_parts'] for x in p['layouts'] for m in x['agent']['img'].values() if m.get('why') in ('rank_top', 'space_reserved')])

    def test_used_layouts_seed_the_deck_registry(self):
        """a one-per-deck layout that a part *not* being rebuilt already holds is not inserted again; the layouts of the parts being
        rebuilt are free (the board is pre-seeded with them)."""
        pr, body = request()
        overview = next(p for p in body['parts'] if p['name'] == 'Overview')
        why = next(p for p in pr['parts'] if p['name'] == 'Why Samsung')
        why['layouts'].append({'f': 'L_VS_DSS', 'ov': {'t': {}}})          # somebody put the diagram into another part by hand
        body['parts'] = [overview]
        body['used_layouts'] = [x['f'] for b in pr['parts'] for x in b['layouts']]
        out = compose.run_auto(Job(), pr, compose._auto_body(body), types.SimpleNamespace(provider=Provider()), engine=_STATE['auto'])
        part = out['app_parts'][0]
        fs = [x['f'] for x in part['layouts']]
        self.assertNotIn('L_VS_DSS', fs)
        self.assertIn('L_VS_TOC', fs, 'its own template layouts are still usable although the board lists them as used')
        self.assertTrue(any('L_VS_DSS' in n for n in part['notes']))


class PictureIdentityAndSpaceTest(unittest.TestCase):
    """2026-11-16, proposal pjevige1 (K 공단 · 표준 제안서): the 민원실 and 대합실·승강장 sheets showed the same subway photo — once from a
    scenario fill pack, once from the case media pack, so the registry (by address) saw two pictures — and the 민원실 photo was a
    대합실. One picture once per deck by *identity* (app/data/picture_ids.json); a space photo shows that space, judged in the
    vertical the space belongs to; a space slot chooses before the chapter openers; a picture the verifier rejects is not kept."""

    def test_the_same_photo_under_two_addresses_is_shown_once(self):
        out, _, _ = run()
        IM = _STATE['data']['library']['images']
        ranked = list(dict.fromkeys(src for _, _, _, src, m in shown(out) if m.get('why') in ('rank_top', 'space_reserved', 'rank')
                                    and (IM.get(src) or {}).get('cls') in ('scene', 'kv')))
        self.assertGreaterEqual(len(ranked), 2, ranked)
        a, b = ranked[:2]

        def same(lib):  # the two photos the deck chose are one photo under two addresses
            lib['images'][a]['pic'] = a
            lib['images'][b]['pic'] = a
        with patched_library(same):
            again, _, _ = run()
            srcs = {src for _, _, _, src, _ in shown(again)}
            self.assertFalse(a in srcs and b in srcs, f'{a} and {b} are the same photo')
            self.assertEqual(deck_repeats(again), [])

    def test_a_space_photo_never_shows_another_kind_of_space(self):
        P = _STATE['pictures']

        def mut(lib):
            with_profiles(lib)
            lib['images']['img/test/kitchen.jpg'] = scene_photo('img/test/kitchen.jpg', '베이킹 주방에서 반죽하는 제빵사', '주방에서 빵을 만드는 사람', '카페·베이커리')
            lib['images']['img/test/hall.jpg'] = scene_photo('img/test/hall.jpg', '카페 좌석 홀의 테이블과 손님', '카페 테이블에 앉은 사람들', '카페·베이커리')
        with patched_library(mut):
            pr, body = request()
            ctx = _STATE['auto'].build_context(pr, compose._auto_body(body))
            hall = {'kind': 'space', 'bind': {'space': 'fb_cafe_s3'}, 'part_type': 'products', 'families': set()}      # 좌석 홀
            kitchen = {'kind': 'space', 'bind': {'space': 'fb_cafe_s4'}, 'part_type': 'products', 'families': set()}   # 베이킹 주방·제조실
            self.assertTrue(P.rule_reject('img/test/kitchen.jpg', hall, ctx).startswith('wrong_space'), 'a kitchen is not the seating hall')
            self.assertEqual(P.rule_reject('img/test/kitchen.jpg', kitchen, ctx), '')
            self.assertEqual(P.rule_reject('img/test/hall.jpg', hall, ctx), '')
            self.assertEqual(P.rule_reject('img/test/kitchen.jpg', {'kind': 'scene', 'bind': {}, 'part_type': 'value', 'families': set()}, ctx), '',
                             'a chapter opener may show any room of the business')
            cands = [c['src'] for c in P.scene_candidates({**hall, 'key': '1', 'orig': None, 'osrc': '', 'near': '좌석 홀', 'title': '', 'hint': '',
                                                           'fit': 'cover', 'w': 544, 'h': 512, 'message': ''}, ctx, set(), 12)]
            self.assertIn('img/test/hall.jpg', cands)
            self.assertNotIn('img/test/kitchen.jpg', cands)

    def test_a_space_from_another_vertical_is_judged_in_its_own_vertical(self):
        P = _STATE['pictures']

        def mut(lib):
            with_profiles(lib)
            lib['images']['img/test/burger.jpg'] = scene_photo('img/test/burger.jpg', '버거 매장 주문 카운터와 디지털 메뉴보드', '패스트푸드 매장 주문대와 메뉴보드',
                                                               '패스트푸드·퀵서비스')
        with patched_library(mut):
            pr, body = request()
            ctx = _STATE['auto'].build_context(pr, compose._auto_body(body))   # a café deck (fb_cafe)
            cafe = {'kind': 'space', 'bind': {'space': 'fb_cafe_s1'}, 'part_type': 'products', 'families': set()}    # 카운터·메뉴보드 of the café
            burger = {'kind': 'space', 'bind': {'space': 'fb_qsr_s2'}, 'part_type': 'products', 'families': set()}   # a 버거 vertical space in it
            self.assertEqual(P.slot_verticals(burger, ctx), ['fb_qsr'])
            self.assertEqual(P.rule_reject('img/test/burger.jpg', burger, ctx), '', 'the burger space is shown by a burger shop')
            self.assertIn(P.rule_reject('img/test/burger.jpg', cafe, ctx), ('other_subvertical', 'vision_other_subvertical'))

    def test_space_sheets_show_their_own_space_with_a_photo_held_before_the_chapters_chose(self):
        out, job, _ = run()
        P = _STATE['pictures']
        spaces = [(f, k, src, m) for _, f, k, src, m in shown(out) if m.get('kind') == 'space']
        self.assertTrue(spaces)
        self.assertTrue(any(m.get('why') == 'space_reserved' for *_, m in spaces), spaces)
        self.assertTrue(any('공간 사진 — 공간 장' in e.get('message', '') for e in job.events if e['type'] == 'text'))
        self.assertEqual(deck_repeats(out), [])

    def test_a_picture_the_verifier_rejects_is_not_kept(self):
        def script(stage, user, schema):
            if stage == 'auto_image_verify':
                slots = schema['properties']['checks']['items']['properties']['slot']['enum']
                return {'checks': [{'slot': s_, 'reason': 'wrong_space', 'better': 'none'} for s_ in slots]}
            return None
        out, _ = run_req(*request(), Scripted(script))
        rejected = [(f, k, src, m) for _, f, k, src, m in shown(out) if m.get('rejected')]
        self.assertTrue(rejected, 'the verifier rejected the picks')
        for f, k, src, m in rejected:
            self.assertNotEqual(src, m['rejected']['src'], f'{f} slot {k} kept the picture the verifier rejected')
            self.assertNotIn('nothing better', m.get('why') or '')
        self.assertEqual(deck_repeats(out), [])

    def test_board_pictures_outside_the_rebuilt_parts_are_not_shown_again(self):
        out, _, _ = run()
        IM = _STATE['data']['library']['images']
        first = [src for _, _, _, src, m in shown(out) if m.get('why') == 'rank_top' and (IM.get(src) or {}).get('cls') in ('scene', 'kv')]
        self.assertTrue(first)
        again, _, _ = run(used_pictures=first)
        self.assertFalse(set(first) & {src for *_, src, _ in shown(again)}, 'a photo already on the board was chosen again')


class SubsetRequestTest(unittest.TestCase):
    """retry of single parts: ``parts`` lists only what to rebuild, ``proposal.parts`` carries the whole board."""

    def test_only_requested_parts_are_planned_and_emitted(self):
        d = _STATE['data']
        want = [p['id'] for p in d['body']['parts'] if p['name'] in ('공간별 제안', '도입사례')]
        prompts = []

        def spy(stage, user):
            if stage == 'auto_plan':
                prompts.append(user)
        out, job, _ = run(Provider(fail=spy), parts=want)
        self.assertEqual([p['id'] for p in out['app_parts']], want)
        self.assertEqual({e['id'] for e in job.events if e['type'] == 'part'}, set(want))
        self.assertEqual([p['id'] for p in next(e for e in job.events if e['type'] == 'plan')['plan']['parts']], want)
        self.assertIn('이미 완성돼 있는 파트', prompts[0], 'the other board parts are context for the plan')
        # chapter numbers still count the whole board
        space = next(p for p in out['app_parts'] if p['name'] == '공간별 제안')
        div = next(x for x in space['layouts'] if re.fullmatch(r'L_VS_DIV_R\d', x['f']))
        self.assertEqual(div['ov']['t']['1'], '03 / 06')


class ValidationTest(unittest.TestCase):
    def prepare(self, **over):
        pr, body = request()
        body.update(over)
        return compose._auto_body({'proposal': pr, **body})

    def test_bad_requests(self):
        for bad in ({'parts': []}, {'parts': 'x'}, {'parts': [{'id': '', 'exemplar': []}]}, {'parts': [{'id': 'a'}, {'id': 'a'}]},
                    {'parts': [{'id': 'a', 'exemplar': [{'role': 'no layout'}]}]}, {'parts': [{'id': 'a', 'exemplar': [{'f': 'L_X'}] * 41}]},
                    {'space_plan': 'x'}, {'space_plan': {'spaces': 'x'}}, {'template': 'x'}, {'requirement_context': 'x'},
                    {'used_pictures': 'img/a.jpg'}, {'used_pictures': [1]}, {'used_pictures': ['img/x.jpg'] * 801}):
            with self.assertRaises(BadRequest, msg=str(bad)[:80]):
                self.prepare(**bad)

    def test_optional_inputs_may_be_null(self):
        body = self.prepare(space_plan=None, requirement_context=None)
        self.assertIsNone(body['space_plan'])

    def test_step_is_registered_and_settings_are_bounded(self):
        self.assertIn('auto', compose.STEPS)
        old = dict(os.environ)
        try:
            os.environ['WINMATE_COMPOSE_WORKERS'] = '99'
            os.environ['WINMATE_COMPOSE_VERIFY'] = 'off'
            self.assertEqual(compose.auto_settings(), {'workers': 8, 'verify': False})
            os.environ['WINMATE_COMPOSE_WORKERS'] = 'x'
            self.assertEqual(compose.auto_settings()['workers'], 4)
        finally:
            os.environ.clear()
            os.environ.update(old)

    def test_requirement_summary_points_are_used_as_given(self):
        rc = {'source_key': 'k', 'sections': {'overview': {'text': '개요', 'kind': 'fact', 'refs': []},
                                               'requirements': [{'text': '신메뉴를 전 매장에 당일 반영', 'kind': 'fact', 'refs': []}, {'text': '냉난방 전력 절감', 'kind': 'fact', 'refs': []}],
                                               'goals': [{'text': '가맹점 초기 비용 부담 완화', 'kind': 'inference', 'refs': []}]}}
        out, _, _ = run(requirement_context=rc)
        self.assertEqual([x['text'] for x in out['plan']['points']], ['신메뉴를 전 매장에 당일 반영', '냉난방 전력 절감', '가맹점 초기 비용 부담 완화'])


# ---------------------------------------------------------------------------------------------- follow-up rules (2026-11-13)
def wide_request(mut=None):
    """the standard café deck + parts of other templates (핵심 기술 · 기대 효과 · Value Prop 상세 · 유관사례 · 공간별 가치 제안)."""
    d = _STATE['data']
    pr, body = request()
    for part in d['extra_parts'].values():
        body['parts'].append(copy.deepcopy(part))
        pr['parts'].append({'id': part['id'], 'type': part['type'], 'name': part['name'], 'items': [], 'deck': False, 'layouts': []})
    if mut:
        mut(pr, body)
    return pr, body


def run_req(pr, body, provider=None, job=None):
    job = job or Job()
    out = compose.run_auto(job, pr, compose._auto_body(body), types.SimpleNamespace(provider=provider or Provider()), engine=_STATE['auto'])
    return out, job



class Scripted(Provider):
    """a provider whose answers for some stages are written by the test (``script(stage, user, schema)`` → data or None)."""

    def __init__(self, script):
        super().__init__()
        self.script = script
        self.prompts = []

    def generate_json(self, *, stage, system='', user=None, schema=None, **kw):
        short = stage.split(':', 1)[1]
        with self.lock:
            self.calls.append(short)
            self.prompts.append((short, user))
        data = self.script(short, user, schema)
        if data is None:
            data = self.fake.json(stage=short, prompt=user, schema=schema)
        return types.SimpleNamespace(data=data, prompt_tokens=10, output_tokens=5)


def icons_of(out):
    """(part, layout, slot, solution key) of every solution feature icon in the deck."""
    auto = _STATE['auto']
    return [(p['name'], x['f'], k, auto.icon_solution(v)) for p in out['app_parts'] for x in p['layouts'] for k, v in x['ov']['img'].items() if auto.icon_solution(v)]


class UnlinkedSolutionTest(unittest.TestCase):
    """1 · 4 — solution sheets, journeys and feature icons exist only for solutions the person linked."""

    def test_no_solution_linked_drops_solution_sheets_and_keeps_the_parts_product_centred(self):
        pr, body = wide_request(lambda pr, body: pr['ctx'].update(solutions=[]))
        out, _ = run_req(pr, body)
        fs = [x['f'] for p in out['app_parts'] for x in p['layouts']]
        self.assertFalse([f for f in fs if f.startswith('L_VS_SOL_')], 'no solution sheet without a linked solution')
        self.assertFalse([f for f in fs if f.startswith('L_TOC_JOURNEY')], 'no journey built on the template\'s solutions')
        self.assertFalse(icons_of(out), 'no feature icon of any solution')
        by = {p['name']: p for p in out['app_parts']}
        linked = set(_STATE['data']['proposal']['ctx']['products'])
        for name in ('카페 솔루션', 'Value Prop 상세', '공간별 가치 제안', '카페 핵심 기술'):
            content = [x for x in by[name]['layouts'] if not re.fullmatch(r'L_VS_DIV_R\d', x['f'])]
            self.assertTrue(content, f'{name} is not left empty')
            for x in content:
                self.assertIn(x['agent']['kind'], ('space', 'product', 'tech', 'bird'), (name, x['f']))
                shown = set(x['agent']['bind'].get('products') or []) | ({x['agent']['bind']['product']} if x['agent']['bind'].get('product') else set())
                self.assertTrue(shown and shown <= linked, f'{name} · {x["f"]} is about linked products')
        self.assertTrue(any('연결하지 않은 솔루션' in n for n in by['Value Prop 상세']['notes']))
        tech = next(x for x in by['카페 핵심 기술']['layouts'] if x['f'].startswith('L_TOC_TECH'))
        slots = _STATE['data']['library']['toc_slots'][tech['f']]['t']
        names = [tech['ov']['t'][str(slots[f'nm{i}'])] for i in range(len(tech['agent']['bind']['columns']))]
        PA = _STATE['data']['library']['products_all']
        self.assertEqual(names, [PA[q]['name'] for _, q in tech['agent']['bind']['columns']], 'the columns are the linked products')
        self.assertTrue(all(v['src'].endswith('blank.png') for v in tech['ov']['img'].values()), 'neutral icons beside product columns')

    def test_only_linked_solutions_keep_their_sheets_journeys_and_icons(self):
        pr, body = wide_request()  # links MagicINFO + SmartThings Pro; the templates also carry VXT · Knox · b.IoT …
        out, _ = run_req(pr, body)
        linked = set(pr['ctx']['solutions'])
        keys = _STATE['data']['library']['sol_keys']
        for part, f, k, key in icons_of(out):
            self.assertIn(keys.get(key), linked, f'{part} · {f} slot {k}: icon of {key}')
        sols = [x['agent']['bind'].get('solution') for p in out['app_parts'] for x in p['layouts'] if x['f'].startswith('L_VS_SOL_')]
        self.assertTrue(sols and set(sols) <= linked)
        # the journeys stay: a block that stood on a solution this customer did not select (VXT) now stands on one they did
        # (MagicINFO), with that solution's own name and feature icons — no page is dropped for the template's choice of solution
        value = next(p for p in out['app_parts'] if p['name'] == '공간별 가치 제안')
        ex = next(p for p in body['parts'] if p['name'] == '공간별 가치 제안')
        js = [x for x in value['layouts'] if x['f'].startswith('L_TOC_JOURNEY')]
        self.assertTrue(js and len(js) <= sum(1 for e in ex['exemplar'] if e['f'].startswith('L_TOC_JOURNEY')), [x['f'] for x in js])
        walked = [sid for x in js for sid in x['agent']['bind']['spaces']]
        self.assertEqual(len(walked), len(set(walked)), 'the journeys walk each planned space once — a page that would repeat spaces is left out')
        TS = _STATE['data']['library']['toc_slots']
        for x in js:
            names = [x['ov']['t'][str(TS[x['f']]['t'][k])] for k in ('sn0', 'sn1') if k in TS[x['f']]['t']]
            self.assertTrue(names and all(any(w in n for w in ('SmartThings', 'MagicINFO')) for n in names), names)
            self.assertEqual(len(set(names)), len(names), 'a solution takes one block of a page')
            for n, sid in enumerate(x['agent']['bind']['spaces']):   # the name under each photo is that photo's planned space
                space = next(s_ for s_ in out['plan']['spaces'] if s_['id'] == sid)
                self.assertEqual(x['ov']['t'][str(TS[x['f']]['t'][f'st{n}'])], space['name'])
        vpd = next(p for p in out['app_parts'] if p['name'] == 'Value Prop 상세')
        self.assertTrue(any('VXT' in n for n in vpd['notes']))

    def test_tech_sheet_binds_each_column_to_its_own_solution(self):
        pr, body = wide_request(lambda pr, body: pr['ctx'].update(solutions=['magicinfo', 'vxt']))
        out, _ = run_req(pr, body)
        tech = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'].startswith('L_TOC_TECH'))
        self.assertEqual(tech['f'], 'L_TOC_TECH2')
        TS = _STATE['data']['library']['toc_slots']['L_TOC_TECH2']
        self.assertEqual([tech['ov']['t'][str(TS['t'][f'nm{i}'])] for i in (0, 1)], ['MagicINFO', 'Samsung VXT'])
        auto = _STATE['auto']
        for i, key in enumerate(('s_magic', 's_vxt')):
            got = {auto.icon_solution(tech['ov']['img'][str(TS['img'][f'ki{i}_{k}'])]) for k in range(3)}
            self.assertEqual(got, {key}, f'column {i} shows only its own icons')
        text = ' '.join(str(v) for v in tech['ov']['t'].values())
        self.assertNotIn('SmartThings', text)
        self.assertNotIn('E Paper', text, 'the block chosen for a solution does not talk about products this customer did not link')


class FallbackCaseTest(unittest.TestCase):
    """2 — with no case linked, a template case stays only when it is from the customer's industry or shows a linked product."""

    def hospital_slide(self, body):
        part = next(p for p in body['parts'] if p['name'] == '도입사례')
        slide = copy.deepcopy(next(x for x in part['exemplar'] if x['f'] == 'L_VS_CASE'))
        slide['t'].update({'1': '인천 더드림병원', '2': '관절·척추 특화 병원 — 삼성 모니터', '4': '삼성 모니터(접수·진료실 대기 안내)'})
        slide['role'] = '도입사례 · 인천 더드림병원'
        return part, slide

    def test_unrelated_template_case_is_dropped_with_its_divider_and_toc_lines(self):
        def mut(pr, body):
            pr['ctx'].update(cases=[], products=['oh55a', 'ac360'])   # nothing the hospital case shows
            part, slide = self.hospital_slide(body)
            part['exemplar'].append(slide)
        pr, body = request()
        mut(pr, body)
        out, _ = run_req(pr, body)
        part = next(p for p in out['app_parts'] if p['name'] == '도입사례')
        custs = [x['ov']['t']['1'] for x in part['layouts'] if x['f'] == 'L_VS_CASE']
        self.assertTrue(custs)
        self.assertNotIn('인천 더드림병원', custs)
        self.assertTrue(any('인천 더드림병원' in n for n in part['notes']))
        every = ' '.join(str(v) for p in out['app_parts'] for x in p['layouts'] for v in x['ov']['t'].values())
        self.assertNotIn('더드림병원', every, 'neither the divider nor the 목차 lists the dropped case')
        div = next(x for x in part['layouts'] if re.fullmatch(r'L_VS_DIV_R\d', x['f']))
        self.assertEqual(int(div['f'][-1]), len(custs))

    def test_case_fit_rule(self):
        auto = _STATE['auto']
        pr, body = request()
        pr['ctx']['products'] = ['oh55a', 'ac360']
        ctx = auto.build_context(pr, body)
        self.assertEqual(auto.case_fits(ctx, '3727'), 'industry')                      # a café case in a café deck
        self.assertEqual(auto.case_fits(ctx, '16'), '')                                # a hospital case showing monitors and signage: neither
        self.assertEqual(auto.case_fits(ctx, '16', '병원 주차장 — 옥외형 사이니지 OH55A-S'), 'product')   # … unless it shows a linked product
        pr['ctx']['products'] = ['qm55c']                                              # '스마트 사이니지 QM55C' — the hospital case lists 스마트 사이니지
        self.assertEqual(auto.case_fits(auto.build_context(pr, body), '16'), 'product')

    def test_when_no_template_case_fits_authored_cases_of_the_industry_are_used_or_the_part_stays_empty(self):
        def only_hospital(pr, body):
            pr['ctx'].update(cases=[], products=['oh55a', 'ac360'])
            part, slide = self.hospital_slide(body)
            part['exemplar'] = [x for x in part['exemplar'] if x['f'] != 'L_VS_CASE'] + [slide]
        pr, body = request()
        only_hospital(pr, body)
        out, _ = run_req(pr, body)
        part = next(p for p in out['app_parts'] if p['name'] == '도입사례')
        C = _STATE['data']['library']['cases']
        got = [x['agent']['bind'].get('case') for x in part['layouts'] if x['f'] == 'L_VS_CASE']
        self.assertTrue(got and all(C[c]['ind'] == 'FB' for c in got), 'official cases of the customer\'s industry stand in')
        # an industry the library has no case slide for: the part is returned empty, with the reason
        pr, body = request()
        only_hospital(pr, body)
        pr['ind'] = 'TP'
        body['template']['vertical'] = ''
        out, job = run_req(pr, body)
        part = next(p for p in out['app_parts'] if p['name'] == '도입사례')
        self.assertEqual(part['layouts'], [])
        self.assertTrue(any('사례 파트를 비움' in n for n in part['notes']))
        done = next(e for e in job.events if e['type'] == 'part' and e.get('id') == part['id'] and e['status'] == 'done')
        self.assertEqual(done['layouts'], [])


class FooterTest(unittest.TestCase):
    """3 — the customer once, never the app's default title."""

    def test_deck_footer(self):
        f = _STATE['auto'].deck_footer
        self.assertEqual(f('B 호텔', 'B 호텔 · 경쟁 비교 제안서', '경쟁 비교 제안서'), 'B 호텔 · 경쟁 비교 제안서')
        self.assertEqual(f('B 호텔', '객실 TV 교체', '경쟁 비교 제안서'), 'B 호텔 · 객실 TV 교체')
        self.assertEqual(f('B 호텔', '새 제안서', 'AI 비즈니스 호텔 경쟁 비교 제안서'), 'B 호텔 · AI 비즈니스 호텔 경쟁 비교 제안서')
        self.assertEqual(f('B 호텔', '', '표준 제안서'), 'B 호텔 · 표준 제안서')
        self.assertEqual(f('B 호텔', 'B 호텔', '표준 제안서'), 'B 호텔 · 표준 제안서')

    def test_footers_in_the_deck(self):
        for title, bad in (('A 커피 · 표준 제안서', 'A 커피 · A 커피'), ('새 제안서', '새 제안서')):
            pr, body = request()
            pr['title'] = title
            out, _ = run_req(pr, body)
            texts = [str(v) for p in out['app_parts'] for x in p['layouts'] for v in x['ov']['t'].values()]
            self.assertFalse([t for t in texts if bad in t], f'{bad!r} must not be printed')
            self.assertTrue([t for t in texts if t.startswith('A 커피 · ')])


class RemnantTest(unittest.TestCase):
    """5 · 6 — template rows / labels about things neither the requirements nor the linked items concern."""

    def quiet_request(self):
        """a menu-board customer: no air conditioner linked, no word about energy."""
        def mut(pr, body):
            pr['ctx'].update(products=['qm55c'], solutions=['magicinfo'], cases=[])
            pr['req'] = {'free': [{'t': '전국 매장의 종이 메뉴판을 디지털 메뉴보드로 바꾸고 본사에서 메뉴와 가격을 한 번에 관리하고 싶다.'}],
                         'form': {'project': '', 'customer': 'A 커피', 'target': '', 'note': '', 'keymen': [{'name': '본부장', 'weight': 100, 'reqs': [[{'t': '인쇄비 절감 효과를 숫자로'}]]}]}, 'files': []}
            body['space_plan'] = None
            body['parts'] = [p for p in body['parts'] if p['deck'] or p['name'] in ('AI 카페', '기대 효과')]
        return wide_request(mut)

    def test_energy_is_an_unlinked_topic_unless_the_customer_or_a_linked_item_raises_it(self):
        auto = _STATE['auto']
        pr, body = self.quiet_request()
        ctx = auto.build_context(pr, body)
        for text in ('매장 전력 사용', '전체 에너지 소비량 감소', '객실별 개별 냉난방', '공실 자동 절전'):
            self.assertIn('에너지 · 냉난방', auto.unlinked_in(text, ctx['unlinked']), text)
        self.assertEqual(auto.unlinked_in('실시간 모니터링으로 메뉴 반영', ctx['unlinked']), [])
        pr2, body2 = request()   # links a ceiling air conditioner and asks for lower electricity bills
        self.assertEqual(auto.unlinked_in('매장 전력 사용', auto.build_context(pr2, body2)['unlinked']), [])

    def test_a_linked_case_does_not_make_its_products_part_of_the_offer(self):
        auto = _STATE['auto']
        d = _STATE['data']
        cases = list(d['proposal']['ctx']['cases'])
        self.assertTrue(any('에어컨' in ' '.join(map(str, d['library']['cases'][c].get('offer') or [])) for c in cases), 'a linked case shows air conditioners')

        def mut(pr, body):
            pr['ctx'].update(products=['qm55c'], solutions=['magicinfo'], cases=cases)
            pr['req'] = {'free': [{'t': '전국 매장의 종이 메뉴판을 디지털 메뉴보드로 바꾸고 싶다.'}], 'form': {'project': '', 'customer': 'A 커피', 'target': '', 'note': '', 'keymen': []}, 'files': []}
            body['space_plan'] = None
        pr, body = wide_request(mut)
        ctx = auto.build_context(pr, body)
        self.assertIn('에너지 · 냉난방', auto.unlinked_in('객실별 개별 냉난방', ctx['unlinked']))
        out, _ = run_req(pr, body)
        case_sheets = [x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_VS_CASE']
        self.assertGreaterEqual(len(case_sheets), len(cases))   # 도입사례 and 유관사례 both show the linked cases
        for x in case_sheets:   # the case's own facts are not checked against the offer
            self.assertFalse(x['agent'].get('unlinked'))
            self.assertFalse(x['agent'].get('emptied'))
            self.assertTrue(all(str(v).strip() for k, v in x['ov']['t'].items() if k in ('1', '2', '4')))

    def test_a_template_row_about_an_unlinked_topic_is_sent_back_and_rewritten(self):
        pr, body = self.quiet_request()

        def script(stage, user, schema):
            if stage == 'auto_text_repair' and '"먼저 쓴 답"' in user:      # the slot-level repair: rewrite every energy row it was given
                rows = re.findall(r'^\[s=(\d+)\]|^  (\{"i":.*\})$', user, re.M)
                out, cur = [], None
                for s_no, row in rows:
                    if s_no:
                        cur = {'s': int(s_no), 't': []}
                        out.append(cur)
                    elif cur is not None:
                        x = json.loads(row)
                        if '전력' in x['먼저 쓴 답'] or '에너지' in x['먼저 쓴 답']:
                            cur['t'].append({'i': x['i'], 'v': '메뉴판 인쇄비'})
                return {'outline': [], 'slides': out}
            return None
        provider = Scripted(script)
        out, _ = run_req(pr, body, provider)
        kpi = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_KPI')
        text = ' '.join(str(v) for v in kpi['ov']['t'].values())
        self.assertNotIn('전력', text)
        self.assertIn('메뉴판 인쇄비', text)
        repair = [u for st, u in provider.prompts if st == 'auto_text_repair' and '매장 전력 사용' in u]
        self.assertTrue(repair and '에너지 · 냉난방' in repair[0], 'the row was sent back naming the unlinked topic')
        # before / after · unit labels belong to the layout: not sent back as leftovers, and they keep their head
        self.assertFalse([u for st, u in provider.prompts if st == 'auto_text_repair' and re.search(r'"먼저 쓴 답": "도입 후 · [^"]*", "문제": "[^"]*견본', u)])
        TS = _STATE['data']['library']['toc_slots']['L_TOC_KPI']['t']
        units = [kpi['ov']['t'][str(TS[f'un{k}'])] for k in range(4)]
        self.assertEqual(units, ['도입 후 · 분', '도입 후 · 일', '도입 후', '도입 후 · 시간'])   # the energy row's kWh goes with its row; the head stays

    def test_a_short_label_that_still_names_the_topic_is_emptied_and_reported(self):
        pr, body = self.quiet_request()
        out, _ = run_req(pr, body)   # the plumbing model only echoes — nothing gets rewritten
        kpi = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_KPI')
        TS = _STATE['data']['library']['toc_slots']['L_TOC_KPI']['t']
        self.assertEqual(kpi['ov']['t'][str(TS['lb2'])], '', 'the energy KPI label does not ship')
        self.assertIn(TS['lb2'], kpi['agent']['emptied'])

    def test_needs_columns_come_from_this_customers_points_even_when_the_part_owns_one(self):
        pr, body = self.quiet_request()
        ids = lambda prompt: re.findall(r'^(P\d+) \[', prompt, re.M)

        def script(stage, user, schema):
            if stage != 'auto_plan':
                return None
            parts = [{'id': i, 'message': f'm {i}', 'points': [], 'refs': [], 'products': [], 'solutions': [], 'cases': [], 'spaces': [], 'n_slides': 2} for i in ids(user)]
            needs = next(m.group(1) for m in re.finditer(r'^(P\d+) \[\w+\] AI 카페', user, re.M))
            next(p for p in parts if p['id'] == needs)['points'] = ['R1']
            effect = next(m.group(1) for m in re.finditer(r'^(P\d+) \[\w+\] 기대 효과', user, re.M))
            next(p for p in parts if p['id'] == effect)['points'] = ['R2', 'R3']
            # every point is answered by a selected item (a 핵심 제안 장 nothing selected answers is left out — SelectedOnlyTest)
            return {'thesis': 't', 'storyline': 's', 'parts': parts,
                    'points': [{'id': f'R{n + 1}', 'text': t, 'products': ['d1'], 'solutions': []} for n, t in enumerate(POINTS[:3])]}
        out, _ = run_req(pr, body, Scripted(script))
        part = next(p for p in out['app_parts'] if p['name'] == 'AI 카페')
        needs = next(x for x in part['layouts'] if x['f'] == 'L_VS_NEEDS')
        self.assertEqual(needs['agent']['focus']['points'], ['R1', 'R2', 'R3'], 'three columns = three requirement points (owned first)')
        cores = [x for x in part['layouts'] if x['f'].startswith('L_VS_CORE_')]
        self.assertEqual([x['agent']['focus']['points'] for x in cores], [['R1'], ['R2'], ['R3']])

    def test_the_same_sentence_twice_on_a_slide_is_sent_back(self):
        pr, body = self.quiet_request()

        def script(stage, user, schema):
            if stage != 'auto_text' or 'L_VS_NEEDS' in user or '니즈 · 기술 · 제안' not in user:
                return None
            data = Provider().fake.json(stage='auto_text', prompt=user, schema=schema)
            for sl in data['slides']:
                long = [t for t in sl['t'] if len(t['v']) >= 14]
                if len(long) >= 2:
                    long[1]['v'] = long[0]['v'] = '본사가 메뉴와 가격을 한 번에 바꿉니다.'
            return data
        provider = Scripted(script)
        run_req(pr, body, provider)
        self.assertTrue([u for st, u in provider.prompts if st == 'auto_text_repair' and '두 번 썼습니다' in u])


class CustomerSpaceTest(unittest.TestCase):
    """a space the customer names that the vertical's list lacks is accepted — only in the customer's own words."""

    def plan(self, name):
        pr, body = request(space_plan=None)
        pr['req']['free'] = [{'t': '본사 교육센터 컨퍼런스룸에 사이니지를 놓고 싶다.'}]
        ids = lambda prompt: re.findall(r'^(P\d+) \[', prompt, re.M)

        def script(stage, user, schema):
            if stage != 'auto_plan':
                return None
            return {'thesis': 't', 'storyline': 's', 'points': [{'id': f'R{n + 1}', 'text': t, 'products': [], 'solutions': []} for n, t in enumerate(POINTS[:3])],
                    'parts': [{'id': i, 'message': f'm {i}', 'points': [], 'refs': [], 'products': [], 'solutions': [], 'cases': [], 'spaces': [], 'n_slides': 2} for i in ids(user)],
                    'placement': [{'space': 'x0', 'name': name, 'products': ['d1']}]}
        out, _ = run_req(pr, body, Scripted(script))
        return [s_['name'] for s_ in out['plan']['spaces']], out

    def test_named_space_from_the_requirement_is_used(self):
        names, out = self.plan('컨퍼런스룸 12곳')
        self.assertIn('컨퍼런스룸', names)
        slide = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_VS_SPACE' and x['ov']['t']['1'] == '컨퍼런스룸')
        self.assertEqual(slide['agent']['bind']['product'], _STATE['data']['proposal']['ctx']['products'][0])

    def test_a_space_the_customer_never_mentioned_is_not_invented(self):
        names, _ = self.plan('옥상 정원')
        self.assertNotIn('옥상 정원', names)


def auto_plain(v):
    return _STATE['auto'].plain(v)


def prompt_rows(user):
    """[(slide no, slot dict)] of the slot rows a text prompt lists."""
    out, cur = [], None
    for s_no, row in re.findall(r'^\[s=(\d+)\]|^  (\{"i":.*\})$', user, re.M):
        if s_no:
            cur = int(s_no)
        elif cur is not None:
            out.append((cur, json.loads(row)))
    return out


class FigureCellTest(unittest.TestCase):
    """number · unit pairs, spec columns, 간지 rows — the cells the layout gives a fixed job."""

    def figures_request(self, solutions=('magicinfo',), free=None):
        def mut(pr, body):
            pr['ctx'].update(products=['qm55c', 'ac360'], solutions=list(solutions), cases=[])
            if free:
                pr['req'] = {'free': [{'t': free}], 'form': {'project': '', 'customer': 'A 커피', 'target': '', 'note': '', 'keymen': []}, 'files': []}
            body['space_plan'] = None
            body['parts'] = [p for p in body['parts'] if p['deck'] or p['name'] in ('당사의 이해', '제품 사양', '기대 효과')]
        return wide_request(mut)

    def test_a_unit_cell_keeps_the_unit_only_and_figure_rows_hold_the_customers_own_figures(self):
        # two selected items: the 전후 비교 장 stays (three values need three items); the customer states two figures of its own size
        pr, body = self.figures_request(solutions=(), free='전국 320개 매장, 직원 1,200명 규모의 카페 프랜차이즈가 종이 메뉴판을 디지털로 바꾸려 한다.')
        prov = None

        def script(stage, user, schema):
            if stage != 'auto_text':
                return None
            data = prov.fake.json(stage=stage, prompt=user, schema=schema)
            rows = {(s_no, x['i']): x for s_no, x in prompt_rows(user)}
            for sl in data.get('slides') or []:
                for cell in sl.get('t') or []:
                    x = rows.get((sl['s'], cell['i'])) or {}
                    if str(x.get('안내') or '').startswith('숫자 칸'):
                        cell['v'] = '320개'                                    # the unit glued to the number
                    elif str(x.get('안내') or '').startswith('단위 칸'):
                        cell['v'] = (x.get('prefix') or '') + '0원'            # a figure in the unit cell
            return data
        prov = Scripted(script)
        out, _ = run_req(pr, body, prov)
        TS = _STATE['data']['library']['toc_slots']
        prof = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_UAPROF')
        kpi = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_KPI')
        self.assertTrue([u for st, u in prov.prompts if st == 'auto_text' and '"안내": "단위 칸' in u])
        P, K, PI = TS['L_TOC_UAPROF']['t'], TS['L_TOC_KPI']['t'], TS['L_TOC_UAPROF']['img']
        # 현황 지표: a row per figure the customer stated — number and unit set by code (whatever the model answers), the label written
        # for it; the rows without a stated figure are left out with their icons — never the template's '[00] 건'
        self.assertEqual([prof['ov']['t'][str(P[f'vl{k}'])] for k in range(4)], ['320', '1,200', '', ''])
        self.assertEqual([prof['ov']['t'][str(P[f'un{k}'])] for k in range(4)], ['개', '명', '', ''])
        self.assertEqual([prof['ov']['t'][str(P[f'lb{k}'])] for k in range(4)], ['전국 매장', '일 평균 주문', '', ''])
        self.assertEqual([bool(prof['ov']['img'][str(PI[f'ic{k}'])].get('hidden')) for k in range(4)], [False, False, True, True])
        ask = next(u for st, u in prov.prompts if st == 'auto_text' and '지금 이런 규모로' in u)
        self.assertIn('이 줄의 숫자는 ‘320개’ 로 정해져 있습니다', ask)
        self.assertEqual([kpi['ov']['t'][str(K[f'un{k}'])] for k in range(4)], ['도입 후 · 원'] * 4)      # a figure the model put in a unit cell is dropped
        ph = _STATE['auto'].phm
        for sheet in (prof, kpi):   # no placeholder is left: before · after figures nobody stated are empty, '[00]% 개선' is '개선'
            L = _STATE['data']['library']['layouts'][sheet['f']]
            shown = [auto_plain(sheet['ov']['t'][str(x['i'])]) if str(x['i']) in sheet['ov']['t'] else (x.get('text') or '') for x in L['texts'] if not x.get('img')]
            self.assertFalse([v for v in shown if ph.has_placeholder(v)], sheet['f'])
        self.assertEqual(kpi['ov']['t'][str(K['bf0'])], '')
        self.assertEqual(kpi['ov']['t'][str(K['cg0'])], '개선')

    def test_figure_sheets_without_figures_become_the_sheets_that_need_none(self):
        # three selected items and a requirement without a figure: 전후 비교 KPI → 가치 세 가지 (a value under each selected item),
        # 고객사 현황 지표 → 고객 과제 — the layouts the app itself falls back on (domain/slides/placeholders.js)
        pr, body = self.figures_request(free='카페 프랜차이즈가 종이 메뉴판을 디지털 메뉴보드로 바꾸고 매장 냉난방을 본사에서 관리하려 한다.')
        prov = Scripted(lambda stage, user, schema: None)
        out, _ = run_req(pr, body, prov)
        fs = [x['f'] for p in out['app_parts'] for x in p['layouts']]
        self.assertNotIn('L_TOC_KPI', fs)
        self.assertNotIn('L_TOC_UAPROF', fs)
        TS = _STATE['data']['library']['toc_slots']
        vp = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_VP3')
        V = TS['L_TOC_VP3']['t']
        short = lambda q: _STATE['auto']._short((_STATE['data']['library']['products_all'].get(q) or _STATE['data']['library']['solutions'][q])['name'])
        self.assertEqual([vp['ov']['t'][str(V[f'src{k}'])] for k in range(3)], ['제품 · ' + short('qm55c'), '제품 · ' + short('ac360'), '솔루션 · ' + short('magicinfo')])
        self.assertEqual([vp['ov']['t'][str(V[f'no{k}'])] for k in range(3)], ['01', '02', '03'])
        self.assertRegex(vp['ov']['t'][str(V['eb'])], r'^\d{2} · 기대 효과$')
        effect = next(p for p in out['app_parts'] if any(x['f'] == 'L_TOC_VP3' for x in p['layouts']))
        self.assertTrue([n for n in effect['notes'] if '가치 세 가지' in n])
        self.assertTrue(any(x['f'] == 'L_TOC_UAPAIN' for p in out['app_parts'] for x in p['layouts']))
        ask = next(u for st, u in prov.prompts if st == 'auto_text' and 'Value Props' in u)
        self.assertIn('이 고객의 요구에 주는 효과 한 가지', ask)

    def test_the_same_label_on_two_rows_is_sent_back(self):
        pr, body = self.figures_request(solutions=())   # (two selected items: the 전후 비교 장 stays)
        prov = None
        K = _STATE['data']['library']['toc_slots']['L_TOC_KPI']['t']

        def script(stage, user, schema):
            if stage != 'auto_text':
                return None
            data = prov.fake.json(stage=stage, prompt=user, schema=schema)
            kpi = next((s_no for s_no, x in prompt_rows(user) if x.get('ref') == '도입 후 달라지는 숫자 네 가지'), None)
            for sl in data.get('slides') or []:
                for cell in sl.get('t') or []:
                    if sl['s'] == kpi and cell['i'] in (K['lb0'], K['lb2']):
                        cell['v'] = '인쇄비 절감'
            return data
        prov = Scripted(script)
        run_req(pr, body, prov)
        back = [u for st, u in prov.prompts if st == 'auto_text_repair' and '같은 항목입니다' in u]
        self.assertTrue(back and re.search(r'"i": %d, .*"먼저 쓴 답": "인쇄비 절감", "문제": "칸 %d 과 같은 항목입니다' % (K['lb2'], K['lb0']), back[0]))
        ask = next(u for st, u in prov.prompts if st == 'auto_text' and '도입 후 달라지는 숫자 네 가지' in u)
        self.assertIn('4줄은 서로 다른 항목입니다', ask)
        # the model repeats it again: the later row is emptied with its unit, and reported
        pr, body = self.figures_request(solutions=())
        out, _ = run_req(pr, body, Scripted(script))
        kpi = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_KPI')
        self.assertEqual((kpi['ov']['t'][str(K['lb0'])], kpi['ov']['t'][str(K['lb2'])], kpi['ov']['t'][str(K['un2'])]), ('인쇄비 절감', '', '도입 후'))
        self.assertIn(K['lb2'], kpi['agent']['emptied'])

    def test_a_units_kind_follows_its_rows_label(self):
        auto = _STATE['auto']
        for label, unit, want in [('인쇄비 연간 절감액', '건', '원'), ('인건비 절감액', '만 원', '만 원'), ('피크 대기 시간', '분', '분'), ('메뉴판 교체 작업 시간', '원', '시간'),
                                  ('매장 인건비 비중', '분', '%'), ('전국 매장', '개', '개'), ('메뉴 · 가격 반영', '일', '일')]:
            self.assertEqual(auto.unit_for(label, unit), want, label)

    def reasons_request(self):
        """the 기대 효과 part with the 'three reasons' sheet (figure · its meaning · a line) in place of the KPI sheet."""
        def mut(pr, body):
            pr['ctx'].update(products=['qm55c'], solutions=['magicinfo'], cases=[])
            pr['req'] = {'free': [{'t': '전국 320개 매장의 종이 메뉴판을 디지털 메뉴보드로 바꾸고 싶다.'}], 'form': {'project': '', 'customer': 'A 커피', 'target': '', 'note': '', 'keymen': []}, 'files': []}
            body['space_plan'] = None
            body['parts'] = [p for p in body['parts'] if p['deck'] or p['name'] == '기대 효과']
            part = next(p for p in body['parts'] if p['name'] == '기대 효과')
            L = _STATE['data']['library']['layouts']['L_TOC_CPWIN']
            sheet = {'f': 'L_TOC_CPWIN', 'role': '삼성을 고르는 세 가지 이유', 'img': {},
                     't': {**{str(t['i']): t['text'] for t in L['texts'] if t.get('text')}, '0': '04 · 기대 효과', '30': part['exemplar'][1]['t']['27'], '31': 'CONFIDENTIAL · 11'}}
            part['exemplar'] = [part['exemplar'][0], sheet]
        return wide_request(mut)

    def figures_run(self, answers):
        """compose with the model's answers for (cell name → text) of the three-reasons sheet."""
        pr, body = self.reasons_request()
        W = _STATE['data']['library']['toc_slots']['L_TOC_CPWIN']['t']
        prov = None

        def script(stage, user, schema):
            if stage != 'auto_text':
                return None
            data = prov.fake.json(stage=stage, prompt=user, schema=schema)
            sheet = next((s_no for s_no, x in prompt_rows(user) if x.get('ref') == '개 솔루션 · 한 공급사'), None)
            for sl in data.get('slides') or []:
                for cell in sl.get('t') or []:
                    name = next((n for n, i in W.items() if i == cell['i']), None)
                    if sl['s'] == sheet and name in answers:
                        cell['v'] = answers[name]
            return data
        prov = Scripted(script)
        out, _ = run_req(pr, body, prov)
        sheet = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_CPWIN')
        return {n: sheet['ov']['t'].get(str(i)) for n, i in W.items()}, prov, sheet

    def test_a_headline_figure_is_this_customers_number_or_nothing(self):
        # echoed: the template's '5 개 솔루션', '6 개 공간', '500 nit' are the sample's claims → flagged and left out with their units
        # (no placeholder is left on a proposal)
        got, prov, sheet = self.figures_run({})
        self.assertEqual([got['v0'], got['v1'], got['v2']], ['', '', ''])
        self.assertEqual([got['u0'], got['u1'], got['u2']], ['', '', ''])
        self.assertTrue(sheet['agent']['masked'])
        ask = next(u for st, u in prov.prompts if st == 'auto_text' and '개 솔루션 · 한 공급사' in u)
        cells = {x['i']: x for _, x in prompt_rows(ask)}
        W = _STATE['data']['library']['toc_slots']['L_TOC_CPWIN']['t']
        self.assertTrue(cells[W['v0']]['안내'].startswith('숫자 칸'))        # the figure and its unit are asked for, not kept as the template's
        self.assertIn('단위', cells[W['u2']]['안내'])                        # 'nit' (two letters) is not locked
        # the customer's own number with a rewritten meaning stays; a number nobody gave does not; text in a figure cell does not
        got, _, _ = self.figures_run({'v0': '320', 'u0': '개 매장 · 한 번에 전환', 'v1': '87', 'u1': '% 절감', 'v2': '많음', 'u2': '개 기능'})
        self.assertEqual([got['v0'], got['u0'], got['v1'], got['u1'], got['v2'], got['u2']], ['320', '개 매장 · 한 번에 전환', '', '', '', ''])

    def test_a_headline_figure_is_a_number_from_this_customers_material(self):
        auto = _STATE['auto']
        self.assertTrue(auto.PLACEHOLDER_ONLY.fullmatch('[00]'))
        self.assertTrue(auto._foreign_lock([{'lock': {}}, {'lock': {'3': '운영 효율 →'}}], [0, 1], 0, 3, '운영 효율 →'))    # another slide's fixed cell, same number
        self.assertFalse(auto._foreign_lock([{'lock': {}}, {'lock': {'3': '운영 효율 →'}}], [0, 1], 1, 3, '운영 효율 →'))
        self.assertFalse(auto._foreign_lock([{'lock': {}}, {'lock': {'3': '운영 효율 →'}}], [0, 1], 0, 4, '운영 효율 →'))

    def test_spec_rows_that_slid_are_refilled_from_the_catalog(self):
        auto = _STATE['auto']
        lib = _STATE['data']['library']
        TS = lib['toc_slots']['L_TOC_PSPEC']['t']
        pid = next(p for p, v in lib['products_all'].items() if len(v.get('specs') or []) >= 4)
        specs = [(re.sub(r'\s*\([^)]*\)\s*$', '', ln.partition(':')[0]).strip(), ln.partition(':')[2].strip()) for ln in lib['products_all'][pid]['specs']]
        slots = {int(TS[f'{a}{k}']): {'i': int(TS[f'{a}{k}']), 'ref': 'x', 'max': 30} for k in range(8) for a in ('sl', 'sv')}
        sl = {'kind': 'spec', 'f': 'L_TOC_PSPEC', 'bind': {'products': [pid]}}
        good = {}
        for k in range(3):
            good[int(TS[f'sl{k}'])], good[int(TS[f'sv{k}'])] = specs[k]
        got = dict(good)
        auto._spec_rows({}, sl, slots, got)
        self.assertEqual({i: got[i] for i in good}, good, 'pairs that are straight stay as written')
        got = dict(good)
        got[int(TS['sv1'])] = specs[2][0]                # a label in a value cell: the pairs slid from here on
        auto._spec_rows({}, sl, slots, got)
        fit = [(k, v) for k, v in specs if len(k) <= 34 and len(v) <= 38]
        self.assertEqual([(got[int(TS[f'sl{k}'])], got[int(TS[f'sv{k}'])]) for k in range(min(8, len(fit)))], fit[:8])
        self.assertTrue(sl['fact_filled'])

    def test_a_row_label_left_from_another_kind_of_product_is_replaced(self):
        auto = _STATE['auto']
        TS = _STATE['data']['library']['toc_slots']['L_TOC_SPEC']['t']
        lab, val, lab2 = int(TS['sl1_0']), int(TS['sv1_0']), int(TS['sl1_1'])
        slots = {lab: {'i': lab, 'ref': '바람', 'max': 10, 'cell': 'label', 'of': '호텔 TV 55"', 'of_was': '무풍 4Way 카세트'},
                 val: {'i': val, 'ref': '무풍 · 4방향', 'max': 20, 'cell': 'value', 'of': '호텔 TV 55"', 'of_was': '무풍 4Way 카세트'},
                 lab2: {'i': lab2, 'ref': '강점', 'max': 10, 'cell': 'label', 'of': '호텔 TV 55"', 'of_was': '무풍 4Way 카세트'}}
        sl = {'kind': 'spec', 'f': 'L_TOC_SPEC', 'bind': {'products': ['a', 'b']}}
        got = {lab: '바람', val: '55형 · 4K UHD', lab2: '강점'}
        auto._spec_rows({}, sl, slots, got)
        self.assertEqual((got[lab], got[lab2]), ('크기', '강점'))
        got = {lab: '바람', val: 'Tizen 기반 호텔 전용', lab2: '강점'}
        auto._spec_rows({}, sl, slots, got)
        self.assertEqual(got[lab], '특징')
        got = {lab: '운영 체제', val: 'Tizen', lab2: '강점'}     # rewritten by the model: stays
        auto._spec_rows({}, sl, slots, got)
        self.assertEqual(got[lab], '운영 체제')

    def test_spec_cells_belong_to_their_columns_product(self):
        pr, body = self.figures_request()
        prov = Scripted(lambda stage, user, schema: None)   # echoes the template: every column still speaks of the template's product
        out, _ = run_req(pr, body, prov)
        spec = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_SPEC')
        TS = _STATE['data']['library']['toc_slots']['L_TOC_SPEC']['t']
        names = [spec['ov']['t'][str(TS[f'nm{c}'])] for c in range(2)]
        self.assertEqual(spec['agent']['bind']['products'][:2], ['qm55c', 'ac360'])
        first = next(u for st, u in prov.prompts if st == 'auto_text' and '"제품": ' in u)
        cells = [x for _, x in prompt_rows(first) if x.get('제품')]
        self.assertEqual({x['제품'] for x in cells}, set(names), 'every cell of a column names the column\'s product')
        by_i = {x['i']: x['제품'] for x in cells}
        self.assertEqual(by_i[TS['sv0_0']], names[0])
        self.assertEqual(by_i[TS['sv1_0']], names[1])
        back = [u for st, u in prov.prompts if st == 'auto_text_repair' and '견본은 다른 제품(' in u]
        self.assertTrue(back, 'a column still carrying the template product\'s values is sent back')
        self.assertIn(f'이 열의 제품 “{names[1]}”', back[0])
        # still the template product's values after the repair: cleared and reported; the same product family's column keeps its values
        self.assertEqual(spec['ov']['t'][str(TS['sv1_0'])], '')
        self.assertIn(TS['sv1_0'], spec['agent']['emptied'])
        self.assertTrue(spec['ov']['t'][str(TS['sv0_0'])])
        # the third column has no product: name, cells and picture are cleared, and the title counts two
        self.assertEqual([spec['ov']['t'][str(TS[n])] for n in ('nm2', 'md2', 'sl2_0', 'sv2_0')], ['', '', '', ''])
        self.assertIn('2가지', spec['ov']['t']['1'])
        self.assertTrue(spec['ov']['img'].get('2', {}).get('hidden') or '2' not in spec['ov']['img'])

    def test_a_spec_cell_about_another_columns_product_is_sent_back(self):
        pr, body = self.figures_request()
        prov = None
        TS = _STATE['data']['library']['toc_slots']['L_TOC_SPEC']['t']

        def script(stage, user, schema):
            if stage != 'auto_text':
                return None
            data = prov.fake.json(stage=stage, prompt=user, schema=schema)
            rows = {(s_no, x['i']): x for s_no, x in prompt_rows(user)}
            for sl in data.get('slides') or []:
                for cell in sl.get('t') or []:
                    x = rows.get((sl['s'], cell['i'])) or {}
                    if cell['i'] == TS['sv0_1'] and x.get('제품'):
                        cell['v'] = '360 카세트의 원형 기류'                    # the air conditioner, in the signage column
            return data
        prov = Scripted(script)
        run_req(pr, body, prov)
        back = [u for st, u in prov.prompts if st == 'auto_text_repair' and '360 카세트의 원형 기류' in u]
        self.assertTrue(back and re.search(r'"먼저 쓴 답": "360 카세트의 원형 기류", "문제": "이 칸은 “[^”]+” 열입니다', back[0]))

    def test_a_divider_row_is_a_name_not_a_figure(self):
        auto = _STATE['auto']
        pr, body = request()
        ctx = auto.build_context(pr, body)
        div = {'kind': 'divider', 'f': 'L_VS_DIV_R1', 'lock': {}, 'edit_ref': {'6': '핵심 사양'},
               't': {'1': '04 / 04', '2': 'Spec', '5': '01', '6': '220nit', '7': '10', '8': 'CONFIDENTIAL · 9'}}
        sheet = {'kind': 'spec', 'f': 'L_TOC_PSPEC', 'role': '제품 사양', 'lock': {}, 't': {'0': '04 · Spec', '1': '삼성 Flip Pro WM75B', '6': '220nit'}}
        auto._align_names(ctx, [div, sheet])
        self.assertEqual(div['t']['6'], '핵심 사양')
        div['t']['6'], div['edit_ref'] = '[00]% 개선', {'6': '호텔 TV 사양'}   # the template's row names a product type this customer did not link
        auto._align_names(ctx, [div, sheet])
        self.assertEqual(div['t']['6'], '삼성 Flip Pro WM75B')
        div['t']['6'] = '회의실 전자칠판'                                       # a name: left alone
        auto._align_names(ctx, [div, sheet])
        self.assertEqual(div['t']['6'], '회의실 전자칠판')


class SampleCustomerNameTest(unittest.TestCase):
    """the template's sample customer is a category noun: swapped only where it stands for the customer."""

    def test_swap(self):
        auto = _STATE['auto']
        ctx = {'tpl_cust': '비즈니스 호텔', 'customer': 'B 호텔'}
        for before, after in [('비즈니스 호텔의 5개 공간', 'B 호텔의 5개 공간'),
                              ('비즈니스 호텔, 지금 이런 규모로 움직입니다', 'B 호텔, 지금 이런 규모로 움직입니다'),
                              ('AI 비즈니스 호텔 핵심 제안', 'AI 비즈니스 호텔 핵심 제안'),                      # the deck's own offer name
                              ('프리미엄 비즈니스 호텔(체인) — 호텔 TV', '프리미엄 비즈니스 호텔(체인) — 호텔 TV'),    # a case's description
                              ('비즈니스 호텔 사례로 안정성 입증', '비즈니스 호텔 사례로 안정성 입증'),
                              ('B 호텔의 AI 비즈니스 호텔 전환', 'B 호텔의 AI 비즈니스 호텔 전환')]:
            self.assertEqual(auto.swap_cust(ctx, before), after)

    def test_no_sample_customer_name_stands_for_the_customer_in_the_deck(self):
        out, _, _ = run()
        d = _STATE['data']
        auto = _STATE['auto']
        ctx = auto.build_context(*request())
        self.assertTrue(ctx['tpl_cust'])
        for p in out['app_parts']:
            for x in p['layouts']:
                if x['agent'].get('fixed'):
                    continue  # content-fixed pages (제안 개요 · Why Samsung · cases …) are the template's own, as authored (user instruction 2026-11-17)
                for k, v in x['ov']['t'].items():
                    text = auto.plain(v)
                    self.assertEqual(auto.swap_cust(ctx, text), text, f"{x['f']} {k}: {text!r}")


def menu_board_request():
    """the standard café deck (10 products · 6 solutions in the template) for a customer who selected one signage and its CMS."""
    pr, body = request()
    pr['ctx'].update(products=['qm55c'], solutions=['magicinfo'], cases=[])
    return pr, body


class SelectedOnlyTest(unittest.TestCase):
    """only what the customer selected (제품 · 솔루션 매칭) is named or pictured — whatever the template carried or the model wrote."""

    def test_a_product_is_part_of_the_offer_only_when_it_was_selected(self):
        auto = _STATE['auto']
        pr, body = menu_board_request()
        pr['req']['free'] = [{'t': '매장마다 키오스크와 갤럭시 탭도 검토하고 있고, 냉난방 전력도 줄이고 싶다.'}]
        ctx = auto.build_context(pr, body)
        hard, PA = ctx['unlinked_hard'], _STATE['data']['library']['products_all']
        for v in ('Galaxy AI', '갤럭시 탭 S10', 'Bespoke AI 리빙가전', 'Samsung AI TV', '무풍 시스템에어컨', '키오스크로 주문합니다', PA['oh55a']['name'], PA['kiosk']['model'], 'Samsung VXT'):
            self.assertTrue(auto.unlinked_in(v, hard), f'{v!r} was not selected')
        for v in ('스마트 사이니지 QM55C', 'QM55C', 'MagicINFO', '디지털 메뉴보드를 본사에서 한 번에 바꿉니다', 'CCTV 관제실'):
            self.assertEqual(auto.unlinked_in(v, hard), [], v)
        # what the requirement merely mentions is not selected — only a part that restates the customer's problem may say it
        self.assertTrue(auto.unlinked_in('키오스크', ctx['unlinked']))
        self.assertEqual(auto.unlinked_in('키오스크', ctx['unlinked_said_hard']), [])
        # a topic (energy) is not a product: the customer's own words make it legitimate, and the final guard never clears it
        self.assertEqual(auto.unlinked_in('냉난방 전력을 줄입니다', ctx['unlinked']), [])
        self.assertEqual(auto.unlinked_in('냉난방 전력을 줄입니다', hard), [])

    def test_strip_keeps_the_other_items_of_a_list_and_drops_a_sentence(self):
        auto = _STATE['auto']
        ctx = auto.build_context(*menu_board_request())
        hard = ctx['unlinked_hard']
        self.assertEqual(auto.strip_unlinked('MagicINFO · Samsung VXT · 스마트 사이니지', hard), 'MagicINFO · 스마트 사이니지')
        self.assertEqual(auto.strip_unlinked('※ 갤럭시 스마트폰', hard), '')
        self.assertEqual(auto.strip_unlinked('객실 TV로 시설 예약 · 룸서비스 주문 · 호텔 안내를 바로 이용합니다.', hard), '', 'a sentence is not cut into a fragment')
        self.assertEqual(auto.strip_unlinked('· 원격 제어\n· 키오스크 결제\n· 재생 목록 관리', hard), '· 원격 제어\n· 재생 목록 관리')

    def test_nothing_unselected_reaches_the_deck_even_when_the_model_echoes_the_template(self):
        auto = _STATE['auto']
        pr, body = menu_board_request()
        out, _ = run_req(pr, body)  # the offline provider returns the template's wording — the worst case
        ctx = auto.build_context(*menu_board_request())
        lib = _STATE['data']['library']
        from composer.pictures import is_cut_of, norm_src
        checked = 0
        for p in out['app_parts']:
            for x in p['layouts']:
                if x['agent'].get('fixed'):
                    continue
                last = auto._max_i(x['f'])
                own_sheet = x['agent']['kind'] == 'solution' and x['agent']['bind'].get('solution') in ctx['solutions']
                for k, v in x['ov']['t'].items():
                    if not k.isdigit() or int(k) > last or own_sheet:
                        continue
                    checked += 1
                    self.assertEqual(auto.unlinked_in(auto.plain(v), ctx['unlinked_hard']), [], f"{p['name']} {x['f']} t{k}: {auto.plain(v)!r}")
                for k, v in x['ov']['img'].items():
                    it = lib['images'].get(norm_src(v)) if isinstance(v, dict) and v.get('src') else None
                    plan_pic = '/assets/vertical-std/' in norm_src(v) if it else False  # the 업종 조감도 (also the 목차 card of the 공간 chapter): a plan, not a product
                    if it and it.get('cls') == 'product' and x['agent']['kind'] != 'bird' and not plan_pic:  # the 조감도 is the customer's own plan
                        self.assertTrue(any(is_cut_of(v, q) for q in ctx['products']) or x['agent']['img'].get(k, {}).get('product') in ctx['products'],
                                        f"{p['name']} {x['f']} img{k}: {v.get('name')!r} is not a selected product")
        self.assertGreater(checked, 100)
        self.assertTrue(any('선택하지 않은 제품' in n for p in out['app_parts'] for n in p['notes']), 'what was cleared is reported on the part')

    def test_the_device_solution_service_diagram_is_the_industry_decks_own_page(self):
        """exception to selected-only, by the user's later rule (2026-11-17): 제안 개요 is content-fixed (admin 「전체 파트」 업종별 고정) — its
        DSS page shows the industry's devices · solutions · services as authored even when the customer selected one signage and its CMS.
        (Until then this page listed the selected items only.)"""
        auto = _STATE['auto']
        pr, body = menu_board_request()
        out, _ = run_req(pr, body)
        dss = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_VS_DSS')
        ex = next(x for p in body['parts'] for x in p['exemplar'] if x['f'] == 'L_VS_DSS')
        t, img = dss['ov']['t'], dss['ov']['img']
        self.assertEqual([auto.plain(t.get(str(k), '')) for k in range(4, 15)], [auto.plain(ex['t'].get(str(k), '')) for k in range(4, 15)])
        self.assertEqual({k: v.get('src') for k, v in img.items()}, {k: v.get('src') for k, v in ex['img'].items()})
        self.assertTrue(dss['agent'].get('fixed'))

    def test_a_space_sheet_never_keeps_another_products_features_under_the_selected_products_name(self):
        """the library tags a picture with every product it was used next to — that does not make the template slide the same product."""
        auto = _STATE['auto']
        pr, body = menu_board_request()
        part = next(p for p in body['parts'] if p['name'] == '공간별 제안')
        sp = next(x for x in part['exemplar'] if x['f'] == 'L_VS_SPACE')
        body['space_plan'] = {'vertical': None, 'spaces': [{'id': 'sp1', 'name': auto.plain(sp['t']['1']), 'kind': '', 'products': ['qm55c']}], 'birdseye': None}
        sp['t'].update({'4': 'The Wall 실내 LED 사이니지', '5': '압도적인 초대형 화면', '6': '모듈을 이어 원하는 크기와 비율로 만드는 초대형 LED 화면입니다.'})
        lib = _STATE['data']['library']
        from composer.pictures import norm_src
        src = norm_src(sp['img']['0'])
        saved = copy.deepcopy(lib['images'].get(src))
        lib['images'].setdefault(src, {'src': src, 'cls': 'product', 'group': 'prod'})['products'] = ['thewall', 'qm55c']
        try:
            out, _ = run_req(pr, body)
        finally:
            if saved is None:
                lib['images'].pop(src, None)
            else:
                lib['images'][src] = saved
        got = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_VS_SPACE')
        self.assertEqual(got['ov']['t']['4'], '스마트 사이니지 QM55C')
        for k in ('5', '6'):
            self.assertNotIn('초대형', auto.plain(got['ov']['t'].get(k)), 'the LED wall\'s feature is not said of the 55-inch signage')

    def test_a_core_page_no_selected_item_answers_is_left_out(self):
        pr, body = menu_board_request()
        ids = lambda prompt: re.findall(r'^(P\d+) \[', prompt, re.M)

        def script(stage, user, schema):
            if stage != 'auto_plan':
                return None
            parts = [{'id': i, 'message': f'm {i}', 'points': [], 'refs': [], 'products': [], 'solutions': [], 'cases': [], 'spaces': [], 'n_slides': 2} for i in ids(user)]
            needs = next(m.group(1) for m in re.finditer(r'^(P\d+) \[\w+\] AI 카페', user, re.M))
            next(p for p in parts if p['id'] == needs)['points'] = ['R1', 'R2', 'R3']
            # R1 is answered by the selected signage, R2 (통역 — nothing selected does that) by nothing, R3 by the selected CMS
            return {'thesis': 't', 'storyline': 's', 'parts': parts,
                    'points': [{'id': 'R1', 'text': '신메뉴와 가격을 전 매장에 당일 반영', 'products': ['d1'], 'solutions': []},
                               {'id': 'R2', 'text': '외국인 손님 통역 응대', 'products': [], 'solutions': []},
                               {'id': 'R3', 'text': '본사에서 화면을 원격으로 관리', 'products': [], 'solutions': ['s1']}]}
        out, _ = run_req(pr, body, Scripted(script))
        part = next(p for p in out['app_parts'] if p['name'] == 'AI 카페')
        cores = [x for x in part['layouts'] if x['f'].startswith('L_VS_CORE_')]
        self.assertEqual([x['f'] for x in cores], ['L_VS_CORE_1', 'L_VS_CORE_3'], 'the page of the column nothing selected answers is left out')
        self.assertEqual([x['agent']['focus']['points'] for x in cores], [['R1'], ['R3']], 'the other pages keep their own columns')
        self.assertTrue(any('핵심 제안 장 제외' in n for n in part['notes']))
        needs = next(x for x in part['layouts'] if x['f'] == 'L_VS_NEEDS')
        self.assertEqual(needs['ov']['t']['15'], '', 'the technology cell of that column is empty — not the template\'s product')
        div = next(x for x in part['layouts'] if re.fullmatch(r'L_VS_DIV_R\d', x['f']))
        pages = [int(re.match(r'\d+', div['ov']['t'][str(7 + 3 * r)]).group(0)) for r in range(int(div['f'][-1]))]
        self.assertEqual(pages, sorted(pages), 'the 간지 rows follow the pages that are left')


class FixedContentTest(unittest.TestCase):
    """Why Samsung and the 도입사례 sheets are used as authored: which case is shown is chosen, what a sheet says and shows is not."""

    @staticmethod
    def same(test, auto, got, ex, name):
        last = auto._max_i(got['f'])
        for k in sorted(set(ex['t']) | set(got['ov']['t']), key=lambda z: int(z) if z.isdigit() else 999):
            if not k.isdigit() or int(k) > last or k == '0':
                continue  # the footer block and the chapter eyebrow are this deck's own (page number · footer · chapter number)
            test.assertEqual(auto.plain(got['ov']['t'].get(k)), auto.plain(ex['t'].get(k)), f'{name} t{k}')
        test.assertEqual({k: v.get('src') for k, v in got['ov']['img'].items()}, {k: v.get('src') for k, v in ex['img'].items()}, f'{name} pictures')

    def test_why_samsung_is_the_templates_own_pages_and_no_model_call_writes_it(self):
        auto = _STATE['auto']
        provider = Scripted(lambda stage, user, schema: None)
        out, _ = run_req(*request(), provider)
        tpl = next(p for p in _STATE['data']['body']['parts'] if p['type'] == 'why')
        part = next(p for p in out['app_parts'] if p['id'] == tpl['id'])
        self.assertEqual([x['f'] for x in part['layouts']], [x['f'] for x in tpl['exemplar']])
        for got, ex in zip(part['layouts'], tpl['exemplar']):
            self.assertTrue(got['agent'].get('fixed'), got['f'])
            if re.fullmatch(r'L_VS_DIV_R\d', got['f']):  # the 간지: the template's lede and row names — only the numbers follow this deck
                rows = int(got['f'][-1])
                for k in ['2', '3', '4'] + [str(6 + 3 * r) for r in range(rows)]:
                    self.assertEqual(auto.plain(got['ov']['t'][k]), auto.plain(ex['t'][k]), f'간지 t{k}')
                self.assertEqual({k: v.get('src') for k, v in got['ov']['img'].items()}, {k: v.get('src') for k, v in ex['img'].items()})
            elif got['f'] != 'L_VS_END':    # the closing page carries the deck's own name
                self.same(self, auto, got, ex, got['f'])
        self.assertFalse([u for st, u in provider.prompts if st.startswith('auto_text') and 'Why Samsung — 이 파트가 남길' in u], 'no text call for the part')
        self.assertFalse([u for st, u in provider.prompts if st.startswith('auto_image') and 'Why Samsung' in u.split('\n')[0]], 'no picture call for the part')
        plan = out['plan']
        self.assertEqual(next(p for p in plan['parts'] if p['id'] == tpl['id'])['message'], tpl['goal'], 'its line in the plan is the template\'s own goal')
        self.assertEqual(next(p for p in plan['parts'] if p['id'] == tpl['id'])['points'], [], 'the plan gives it nothing to answer')

    def test_overview_is_the_industry_decks_own_page_and_no_model_call_writes_it(self):
        """제안 개요 is fixed content (admin 「전체 파트」 업종별 고정 — user instruction 2026-11-17): the industry deck's own 간지 and DSS page,
        its devices · solutions · services as authored even when the customer selected others; only the 목차 page follows this deck."""
        auto = _STATE['auto']
        provider = Scripted(lambda stage, user, schema: None)
        pr, body = request()
        pr['ctx']['products'] = pr['ctx']['products'][:1]  # one selected product — the template's DSS page shows more
        out, _ = run_req(pr, body, provider)
        tpl = next(p for p in body['parts'] if p.get('toc') == 'overview')
        part = next(p for p in out['app_parts'] if p['id'] == tpl['id'])
        self.assertEqual([x['f'] for x in part['layouts']], [x['f'] for x in tpl['exemplar']])
        for got, ex in zip(part['layouts'], tpl['exemplar']):
            if got['f'] == 'L_VS_TOC':
                continue  # the 목차 page lists this deck's parts
            self.assertTrue(got['agent'].get('fixed'), got['f'])
            self.same(self, auto, got, ex, got['f'])
        calls = [u for st, u in provider.prompts if st.startswith('auto_text') and tpl['name'] + ' — 이 파트가 남길' in u]
        self.assertTrue(all('[s=1]' not in u and 'L_VS_DSS' not in u for u in calls), 'a text call for the part writes the 목차 page only')

    def test_an_ordered_part_keeps_the_template_order(self):
        """순서 고정 (admin 「전체 파트」 — 가치 제안: 간지 → 니즈 → 핵심 제안 1 · 2 · 3): sheets may be left out, never reordered."""
        for pr, body in (request(), menu_board_request()):
            out, _ = run_req(pr, body)
            tpl = next(p for p in body['parts'] if p.get('toc') == 'needs')
            div = lambda f: 'DIV' if re.fullmatch(r'L_VS_DIV_R\d', f) else f  # the 간지 follows the number of sheets left (R4 → R1)
            got = [div(x['f']) for x in next(p for p in out['app_parts'] if p['id'] == tpl['id'])['layouts']]
            order = [div(x['f']) for x in tpl['exemplar']]
            self.assertEqual(got, [f for f in order if f in got], 'template order: ' + ' → '.join(got))

    def test_the_fixed_list_is_the_apps_list(self):
        """one list for the app and the composer: app/web/src/domain/templates/fixed_content.json"""
        auto = _STATE['auto']
        rules = json.loads((ROOT / 'app/web/src/domain/templates/fixed_content.json').read_text(encoding='utf-8'))
        self.assertEqual(set(auto.FIXED_TOCS), set(rules['parts']))
        for f in ('L_VS_DSS', 'L_VS_WHY_1', 'L_VS_END', 'L_TOC_SVC_SAC', 'L_SUB_COMPARE', 'L_SUB_CARE4', 'L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3'):
            self.assertTrue(auto.fixed_sheet(f), f)
        for f in ('L_SUB_PAIN', 'L_SUB_VALUE3', 'L_SUB_PKG4', 'L_VS_NEEDS', 'L_VS_SPACE', 'L_VS_DSS_FB', 'L_VS_DIV_R1'):
            self.assertFalse(auto.fixed_sheet(f), f)

    def test_a_case_sheet_is_the_authored_sheet_text_and_pictures(self):
        auto = _STATE['auto']
        pr, body = request()
        pr['ctx']['cases'] = ['3727', '159']           # both sheets stand in the template
        out, _ = run_req(pr, body)
        tpl = next(p for p in body['parts'] if p['name'] == '도입사례')
        by_cust = {auto.plain(x['t']['1']): x for x in tpl['exemplar'] if x['f'] == 'L_VS_CASE'}
        part = next(p for p in out['app_parts'] if p['name'] == '도입사례')
        sheets = [x for x in part['layouts'] if x['f'] == 'L_VS_CASE']
        self.assertEqual([x['ov']['t']['1'] for x in sheets], ['밀키프레소', '스타벅스 의왕청계DT점'])
        for got in sheets:
            self.assertTrue(got['agent'].get('fixed'))
            self.same(self, auto, got, by_cust[got['ov']['t']['1']], got['ov']['t']['1'])

    def test_a_linked_case_with_a_library_sheet_uses_that_sheet(self):
        auto = _STATE['auto']
        pr, body = request()
        pr['ctx']['cases'] = ['2979']                  # 치맥킹: not in the template, authored in the library
        out, _ = run_req(pr, body)
        part = next(p for p in out['app_parts'] if p['name'] == '도입사례')
        got = next(x for x in part['layouts'] if x['f'] == 'L_VS_CASE')
        ex = next(e for e in _STATE['data']['library']['exemplars'].values() if e['f'] == 'L_VS_CASE' and auto.plain(e['t'].get('1')) == '치맥킹')
        self.assertTrue(got['agent'].get('fixed'))
        self.same(self, auto, got, ex, '치맥킹')

    def test_a_linked_case_without_an_authored_sheet_is_built_from_its_record_by_code(self):
        auto = _STATE['auto']
        C = _STATE['data']['library']['cases']
        pr, body = request()
        pr['ctx']['cases'] = ['2961']                  # 막불감동: no authored sheet anywhere
        provider = Scripted(lambda stage, user, schema: None)
        out, _ = run_req(pr, body, provider)
        part = next(p for p in out['app_parts'] if p['name'] == '도입사례')
        got = next(x for x in part['layouts'] if x['f'] == 'L_VS_CASE')
        c, t = C['2961'], got['ov']['t']
        self.assertTrue(got['agent'].get('fixed'))
        self.assertEqual(t['1'], c['cust'])
        self.assertEqual(t['3'], '도입 포인트')
        self.assertEqual([t['4'], t['6'], t['8']], [auto.trim_to(x, 44) for x in c['offer'][:3]])
        self.assertIn(c['needs'][0], t['5'])
        self.assertTrue(t['10'].startswith('원문 · samsung.com'))
        text_calls = [u for st, u in provider.prompts if st.startswith('auto_text') and '도입사례 — 이 파트가 남길' in u]
        self.assertFalse([u for u in text_calls if c['offer'][0] in u.split('장표 (s=')[-1]], 'the sheet is not sent to the model as a page to write')
        again, _ = run_req(*[copy.deepcopy(x) for x in (pr, body)])
        got2 = next(x for p in again['app_parts'] if p['name'] == '도입사례' for x in p['layouts'] if x['f'] == 'L_VS_CASE')
        self.assertEqual(got2['ov']['t'], t, 'the same record gives the same sheet')


class SampleParityTest(unittest.TestCase):
    """what six decks composed from 샘플 버티컬 시나리오 inputs (live app, 2026-11-15) lost against the samples — as rules:
    repeated 기술 cells, sentences cut at the template's length, selected items blanked for being worded differently, 여정 장 dropped
    for the template's choice of solution, empty product frames, place photos hidden by the selected-only guard."""

    def test_each_needs_column_gets_a_different_selected_item(self):
        auto = _STATE['auto']
        pts = {'R1': {'products': ['p1', 'p2'], 'solutions': ['s1', 's2']}, 'R2': {'products': ['p1', 'p2'], 'solutions': ['s1', 's2']},
               'R3': {'products': [], 'solutions': ['s1']}}
        got = auto.column_items({}, [['R1'], ['R2'], ['R3']], pts)
        self.assertEqual(got[2][0], 's1', 'the column with one candidate keeps it')
        self.assertEqual(len({got[k][0] for k in got}), 3, got)
        same = auto.column_items({}, [['R3'], ['R3']], pts)
        self.assertEqual([same[0][0], same[1][0]], ['s1', 's1'], 'one item may answer two needs when nothing else does')

    def test_a_value_is_cut_only_when_its_box_cannot_hold_it(self):
        auto = _STATE['auto']
        title = {'w': 1152.0, 'h': 40.0, 'font': 32.0}
        step = {'w': 218.0, 'h': 78.0, 'font': 20.0}
        self.assertTrue(auto.box_fits(title, 'MagicINFO CMS로 설비 상태와 운영 데이터를 한눈에 관제합니다'))
        self.assertTrue(auto.box_fits(step, '“야간 경기 시작 전 관제실에서 설비 상태를 확인합니다”'))
        long = '객실 TV와 공조 설비의 상태를 관제실에서 한 번에 확인하고 이상이 생기면 담당자에게 바로 알려 조치 시간을 줄입니다'
        self.assertFalse(auto.box_fits(step, long))
        cut = auto.trim_to_box(long, 20, step)
        self.assertTrue(auto.box_fits(step, cut) and len(cut) > 20 and long.startswith(cut), cut)
        # at a word boundary, or where a noun phrase ends before its particle ('… 관제실|에서 한 번에') — what stays is a whole phrase
        self.assertRegex(long[len(cut):], r'^(으로|로|을|를|에서|에)?\s', f'cut at a phrase boundary: {cut!r}')
        self.assertEqual(auto.trim_to('방학 중 집중 시공으로 학기 운영 차질 방지', 16), '방학 중 집중 시공')
        self.assertEqual(auto.trim_to('MagicINFO 콘텐츠 및 자동화 프로토콜 등록', 18), 'MagicINFO 콘텐츠')      # not '… 콘텐츠 및'
        self.assertEqual(auto.trim_to('이상이 생기면 바로 알립니다 그리고 다음', 12), '이상이 생기면 바로', 'an adverb is not shortened as if it ended in a particle')
        self.assertEqual(auto.balance_quotes('“야간 경기 시작 전'), '야간 경기 시작 전')

    def test_a_value_too_long_for_its_box_is_shortened_by_the_model_twice_before_it_is_cut(self):
        long = '검증이 완료된 매장부터 화면을 단계적으로 바꾸고 문제가 생기면 이전 운영으로 되돌리는 절차를 매장마다 다시 확인합니다' + ' 그리고 다음 매장으로 넘어갑니다' * 6
        seen = {'target': None, 'shorten': 0}

        def script(stage, user, schema):
            if stage == 'auto_text' and seen['target'] is None:
                data = prov.fake.json(stage=stage, prompt=user, schema=schema)
                rows = {(s_no, x['i']): x for s_no, x in prompt_rows(user)}
                for sl in data.get('slides') or []:
                    for cell in sl.get('t') or []:
                        x = rows.get((sl['s'], cell['i'])) or {}
                        if seen['target'] is None and 14 <= int(x.get('max') or 0) <= 30 and not x.get('안내') and not x.get('prefix') and x.get('r') in ('heading', 'subheading', 'label'):
                            cell['v'] = long
                            seen['target'] = (sl['s'], cell['i'])
                return data
            if stage == 'auto_text_repair' and seen['target'] and '검증이 완료된' in user and '먼저 쓴 답' in user:  # the repair pass leaves it as long as it was
                return {'outline': [], 'slides': [{'s': seen['target'][0], 't': [{'i': seen['target'][1], 'v': long}]}]}
            if stage == 'auto_text_shorten' and '검증이 완료된' in user:
                seen['shorten'] += 1
                n = next(i for i, ln in enumerate(l for l in user.split('\n') if l.startswith('{"n"')) if '검증이 완료된' in ln)
                return {'items': [{'n': n, 'text': long[:150] if seen['shorten'] == 1 else '층별 순차 교체'}]}
            return None
        prov = Scripted(script)
        out, _ = run_req(*request(), prov)
        self.assertIsNotNone(seen['target'], 'a short cell was found to overfill')
        self.assertEqual(seen['shorten'], 2, 'still too long for the box after the first answer → asked once more')
        texts = [v for p_ in out['app_parts'] for x in p_['layouts'] for v in x['ov']['t'].values() if isinstance(v, str)]
        self.assertIn('층별 순차 교체', texts)
        self.assertFalse([v for v in texts if v.startswith('검증이 완료된')], 'no cut-off sentence is left')
        self.assertFalse([x['f'] for p_ in out['app_parts'] for x in p_['layouts'] if x['agent'].get('trimmed')], 'nothing had to be cut')

    def test_a_selected_item_is_recognised_in_other_words_and_under_its_vertical_name(self):
        auto = _STATE['auto']
        pr, body = request()
        lib = _STATE['data']['library']
        sols = [q for q in ('vxt', 'partnerapp', 'sac') if q in lib['solutions']]
        pr['ctx'].update(products=['qm55c'], solutions=sols, cases=[])
        ctx = auto.build_context(pr, compose._auto_body(body))
        want = {'스마트 사이니지': ('product', 'qm55c'), 'QM55C 사이니지': ('product', 'qm55c'), '키오스크': None, 'MagicINFO': None, '삼성헬스': None}
        if 'vxt' in sols:
            want['VXT CMS'] = ('solution', 'vxt')                 # the registry's name for Samsung VXT
        if 'partnerapp' in sols:
            want['병원 안내 솔루션'] = ('solution', 'partnerapp')    # the 파트너 앱 solution as its hospital sheet names it
        if 'sac' in sols:
            want['터치 중앙 제어기'] = ('solution', 'sac')
        self.assertGreaterEqual(len(want), 6, sols)
        for text, item in want.items():
            self.assertEqual(auto.selected_item(ctx, text), item, text)
            self.assertEqual(auto.names_selected(ctx, text), item is not None, text)

    def test_a_journey_page_stands_on_the_solutions_the_customer_selected(self):
        pr, body = wide_request(lambda pr, body: pr['ctx'].update(solutions=['knoxsuite']))  # the café journeys are VXT + SmartThings Pro pages
        out, _ = run_req(pr, body)
        value = next(p for p in out['app_parts'] if p['name'] == '공간별 가치 제안')
        js = [x for x in value['layouts'] if x['f'].startswith('L_TOC_JOURNEY')]
        self.assertTrue(js, 'the journey is kept, not replaced by product sheets: ' + ' / '.join(value['notes']))
        TS = _STATE['data']['library']['toc_slots']
        keys = _STATE['data']['library']['sol_keys']
        for x in js:
            T, I = TS[x['f']]['t'], TS[x['f']]['img']
            self.assertIn('Knox', x['ov']['t'][str(T['sn0'])])
            self.assertNotIn('sn1', T, 'one selected solution → the one-solution page')
            lit = [x['ov']['img'][str(i)]['src'] for nm, i in I.items() if nm.startswith('fi0_') and str(i) in x['ov']['img']]
            self.assertTrue(any(src.endswith('.on.png') for src in lit), lit)
            self.assertTrue(all(src.endswith('blank.png') or keys.get(_STATE['auto'].icon_solution(src)) == 'knoxsuite' for src in lit), lit)
            self.assertTrue(x['ov']['t'].get(str(T['sa0'])), 'the feature-group line of the selected solution')
        for part, f, k, key in icons_of(out):
            self.assertEqual(keys.get(key), 'knoxsuite', f'{part} · {f} slot {k}: icon of {key}')

    def test_frames_and_place_photos_are_not_left_empty_for_a_customer_with_products(self):
        out, _ = run_req(*menu_board_request())
        for p in out['app_parts']:
            for x in p['layouts']:
                a = x['agent']
                if a['kind'] in ('cover', 'divider', 'toc'):
                    self.assertFalse([k for k in (a.get('removed') or {}) if k.startswith('img')], f"{p['name']} {x['f']}: a place photo hidden by the guard")
                if a['kind'] in ('dss', 'map', 'spec', 'bom') or a.get('fixed'):
                    continue  # lists in a fixed order keep the frames beyond the selected products empty
                for k, m in (a.get('img') or {}).items():
                    self.assertFalse(m.get('flag') == 'unbound_product' and m.get('why') == 'hidden',
                                     f"{p['name']} {x['f']} img{k}: an empty product frame although a product is selected")


if __name__ == '__main__':
    unittest.main()


# ---------------------------------------------------------------------------------------------- 업종 트렌드 장 · 시장조사 근거 (2026-11-15)
EV = [{'k': 'web', 'title': '외식업 실태조사', 'url': 'https://www.mafra.go.kr/stat/1', 'host': 'mafra.go.kr', 'sub': '“키오스크 등 무인주문기 도입률은 2025년 13.0%로”', 'kind': 'stat'}]
STAT_SHEET = {'kind': 'stat', 'was': 'stat', 'filled': True, 'why': '키오스크 검토 ↔ 무인주문기 도입률', 'notes': ['‘식재료비 비중’은 출처 인용에 기준 연도가 글자로 없어요 — 근거에서 확인해 주세요.'],
              'v': {'title': '숫자로 보는 외식업의 지금', 'lb0': '키오스크 등 무인주문기 도입률 (2025)', 'vl0': '13.0', 'un0': '%', 'lb1': '일반음식점 영업이익률 (2024)', 'vl1': '8.7', 'un1': '%',
                    'lb2': '식재료비 비중', 'vl2': '40.7', 'un2': '%'},
              'ev': {'title': EV, 'vl0': EV, 'vl1': EV, 'vl2': EV}}
RESEARCH = {'ok': True, 'at': '2026-11-15T00:00:00+00:00', 'engine': 'tavily', 'queries': ['외식업 무인주문기 도입률 통계'], 'sources': 3, 'searched': 20, 'rejected': 4}


class SheetConsistencyTest(unittest.TestCase):
    """rules that hold on every sheet of a composed deck: no placeholder, the customer's own figures, a cell under its heading,
    no line said twice, no hole where a guard removed something, no capability the item's facts do not hold."""

    def summary_request(self):
        """the 기대 효과 part with the 제안 요약 sheet (과제 → 제안 → 효과 → 요청) in place of the KPI sheet."""
        def mut(pr, body):
            body['space_plan'] = None
            body['parts'] = [p for p in body['parts'] if p['deck'] or p['name'] == '기대 효과']
            part = next(p for p in body['parts'] if p['name'] == '기대 효과')
            part.update(toc='summary', name='제안 요약')
            for b in pr['parts']:
                if b['id'] == part['id']:
                    b['name'] = '제안 요약'
            L = _STATE['data']['library']['layouts']['L_TOC_SUMMARY']
            sheet = {'f': 'L_TOC_SUMMARY', 'role': '제안 요약', 'img': {},
                     't': {**{str(t['i']): t['text'] for t in L['texts'] if t.get('text')}, '0': '01 · 제안 요약', '17': part['exemplar'][1]['t']['27'], '18': 'CONFIDENTIAL · 4'}}
            part['exemplar'] = [part['exemplar'][0], sheet]
        return wide_request(mut)

    def test_the_placeholder_rules_are_the_apps(self):
        ph = _STATE['auto'].phm   # composer/placeholders.py — a port of app/web/src/domain/slides/placeholders.js
        for text, want in [('월 전기료 [00]% 절감', '월 전기료 절감'), ('화면 장애 [0]건 이하', '화면 장애'), ('근거 · 구성 p.[00]', '근거 · 구성'), ('[00]곳', ''), ('연 −[00]%', ''),
                           ('[0]일 → 당일', '당일'), ('메뉴 반영 [0]일 → 당일', '메뉴 반영 → 당일'), ('일시 구매 [00]', '일시 구매'), ('전기료 [00]% ↓', '전기료 ↓'), ('1,200명', '1,200명'),
                           ('[샘플 버티컬 시나리오 · 다점포]', '[샘플 버티컬 시나리오 · 다점포]'), ('[확인 필요]', ''), ('약 [00]만 원', '')]:
            self.assertEqual(ph.strip_placeholders(text), want, text)
        self.assertTrue(ph.number_only('[00]곳') and ph.number_only('[확인 필요]') and not ph.number_only('월 전기료 [00]% 절감'))
        self.assertTrue(ph.unit_only('만 원') and ph.unit_only('%') and not ph.unit_only('운영 매장'))
        self.assertEqual((ph.ALTERNATIVE_LAYOUTS['L_TOC_KPI'], ph.ALTERNATIVE_LAYOUTS['L_TOC_UAPROF']), (['L_TOC_VP3'], ['L_TOC_UAPAIN']))

    def test_the_customers_own_figures_are_found_with_their_words(self):
        auto = _STATE['auto']
        pr, body = request()
        pr['req'] = {'free': [{'t': '포레스트호텔은 영업 12년 차, 객실 198실을 운영한다. 2027년 3월 2일까지 같은 타입 객실 3곳 · 3주 시범 교체를 승인받으려 한다.'}],
                     'form': {'project': '', 'customer': '포레스트호텔', 'target': '', 'note': '', 'keymen': [{'name': '총지배인', 'weight': 40, 'reqs': [[{'t': '객실 판매 유지'}]]}]}, 'files': []}
        body['requirement_context'] = None
        ctx = auto.build_context(pr, body)
        self.assertEqual({f['raw'] + f['unit'] for f in ctx['facts']}, {'12년', '198실', '3곳', '3주'})      # not the year · the date · a key person's weight
        self.assertEqual([f['raw'] + f['unit'] for f in auto.profile_facts(ctx)], ['12년', '198실'])       # the customer's size — not the pilot's scope
        self.assertEqual(auto.known_number(ctx, '객실 수', '실'), '198')
        self.assertIsNone(auto.known_number(ctx, '평균 점유율', '%'))
        self.assertEqual(auto.number_cell(ctx, '[000]곳', '140'), '140곳')              # a bare number takes the unit of its cell
        for wrong in ('에너지 비용 절감 실현', '[20]', '[00]', ''):                      # a sentence · a guess in brackets · the placeholder: nothing
            self.assertEqual(auto.number_cell(ctx, '[0]곳', wrong), '', wrong)
        self.assertEqual(auto.keep_placeholders('현장 방문 [0]회 ↓', '현장 점검 0회 ↓'), '현장 점검 [0]회 ↓')   # not a promise of zero visits
        self.assertEqual(auto.keep_placeholders('현장 방문 [0]회 ↓', '현장 점검 10회 ↓'), '현장 점검 10회 ↓')
        self.assertEqual(auto._eyebrow_tail('비용 · 구매', '비용 · 구매'), [])            # a part name with ' · ' is not a name and a sub-title
        self.assertEqual(auto._eyebrow_tail('비용 · 구매 · 5년 TCO', '비용 · 구매'), ['5년 TCO'])
        self.assertEqual(auto._eyebrow_tail('공간별 제안 · 01', '공간별 제안'), ['01'])

    def test_a_summary_sheet_says_under_each_heading_what_the_heading_says(self):
        pr, body = self.summary_request()
        prov = Scripted(lambda stage, user, schema: None)
        out, _ = run_req(pr, body, prov)
        ask = next(u for st, u in prov.prompts if st == 'auto_text' and '과제 → 제안 → 효과 → 요청' in u)
        S = _STATE['data']['library']['toc_slots']['L_TOC_SUMMARY']['t']
        rows = {x['i']: x for _, x in prompt_rows(ask)}
        self.assertEqual([rows[S[n]].get('열') for n in ('b0_0', 'b1_0', 'b2_0', 'b3_0')], ['과제', '제안', '기대 효과', '결정 요청'])
        self.assertIn('요약 장입니다', ask)
        self.assertIn('이 고객이 고른 것', ask)
        self.assertNotIn('솔루션 이름은 뒤 파트의 몫', ask)     # the summary names what is offered — it is not a problem statement
        sheet = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_SUMMARY')
        ph = _STATE['auto'].phm
        self.assertFalse([v for v in sheet['ov']['t'].values() if ph.has_placeholder(auto_plain(v))])   # '주문 대기 [00]% ↓' → '주문 대기 ↓'
        self.assertEqual(auto_plain(sheet['ov']['t'][str(S['b2_0'])]), '주문 대기 ↓')
        self.assertRegex(sheet['ov']['t'][str(S['eb'])], r'^\d{2} · 제안 요약$')

    def test_two_cells_that_say_almost_the_same_are_told_apart(self):
        near = _STATE['auto'].near_same
        self.assertTrue(near('“교체 중에도 객실 판매가 멈추지 않고, 안전하게 바꾸고 싶어요.”', '“교체 중에도 객실 판매가 멈추지 않고, 층별 단계로 안전하게 바꾸고 싶어요.”'))
        self.assertTrue(near('실시간 데이터 기반 리본보드', '실시간 데이터 매출 증대'))
        self.assertTrue(near('관중석 전석 가시성과 매점 매출 증대를 실현합니다', '광고 구좌 재설계와 매점 매출 증대를 실현합니다'))
        self.assertFalse(near('객실 판매를 멈추지 않고 쾌적함을 유지합니다', '원격 관리로 중복 업무를 줄이고 운영 효율을 높입니다'))
        self.assertFalse(near('대기 순서 안내', '태블릿 접수 · 서명'))
        # a second title that repeats the first one of the part is sent back
        pr, body = wide_request(lambda pr, body: body.update(space_plan=None))
        prov = None

        def script(stage, user, schema):
            if stage != 'auto_text':
                return None
            data = prov.fake.json(stage=stage, prompt=user, schema=schema)
            rows = {(s_no, x['i']): x for s_no, x in prompt_rows(user)}
            n = 0
            for sl in data.get('slides') or []:
                for cell in sl.get('t') or []:
                    if cell['i'] == 1 and (sl['s'], 1) in rows and '고객사 분석 · 현황 지표' in user and n < 2:   # the two sheets of 당사의 이해
                        cell['v'] = '매장 화면을 본사에서 한 번에 바꿉니다' if n == 0 else '매장 화면을 본사에서 한꺼번에 바꿉니다'
                        n += 1
            return data
        prov = Scripted(script)
        run_req(pr, body, prov)
        back = [u for st, u in prov.prompts if st == 'auto_text_repair' and '거의 같은 말입니다' in u]
        self.assertTrue(back)
        self.assertIn('매장 화면을 본사에서 한꺼번에 바꿉니다', back[0])

    def test_an_answer_that_numbers_the_cells_again_is_not_used(self):
        # asked to fix one cell, the model writes the slide again and counts its cells 0, 1, 2 … — the slide's own numbers skip the
        # fixed cells, so every value lands a cell off (a row label in the title's cell, '고객 니즈' in the cell of the offer's name)
        pr, body = wide_request(lambda pr, body: body.update(space_plan=None))
        prov = None
        long_ = '매장 화면과 냉난방을 본사에서 한 번에 보고 바꾸는 운영 체계를 지금의 규모에 맞춰 단계적으로 갖춥니다'
        seen = {}

        def script(stage, user, schema):
            if stage == 'auto_text' and '고객사 분석 · 현황 지표' in user:
                data = prov.fake.json(stage=stage, prompt=user, schema=schema)
                s_no = next(int(m.group(1)) for m in re.finditer(r'^\[s=(\d+)\] 고객사 분석 · 현황 지표', user, re.M))
                seen['cells'] = sorted((x['i'], x['ref']) for n, x in prompt_rows(user) if n == s_no)
                for sl in data.get('slides') or []:
                    for cell in sl.get('t') or []:
                        if sl['s'] == s_no and cell['i'] == 1:
                            cell['v'] = long_                      # far over the title's length: sent to the repair pass
                return data
            if stage == 'auto_text_repair' and long_[:20] in user:
                s_no = int(re.search(r'^\[s=(\d+)\]', user[user.index('고칠 칸:'):], re.M).group(1))
                return {'outline': [], 'slides': [{'s': s_no, 't': [{'i': n, 'v': ref} for n, (_, ref) in enumerate(seen['cells'])]}]}   # the slide, recounted
            return None
        prov = Scripted(script)
        out, _ = run_req(pr, body, prov)
        self.assertTrue(len(seen['cells']) >= 3 and [i for i, _ in seen['cells']] != list(range(len(seen['cells']))))
        self.assertTrue([u for st, u in prov.prompts if st == 'auto_text_repair' and '묻지 않은 칸' in u])   # told once: only the asked cells, under their own numbers
        sheet = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_TOC_UAPROF')
        title = auto_plain(sheet['ov']['t']['1'])
        self.assertNotIn(title, [ref for i, ref in seen['cells'] if i != 1])   # not a neighbour's text in the title's cell
        self.assertTrue(long_.startswith(title[:10]), title)                    # the writer's own (shortened) title stands
        self.assertEqual(out['failed'], [])

    def test_a_list_that_lost_an_item_closes_the_gap_and_a_table_marks_what_stands_where(self):
        auto = _STATE['auto']
        lib = _STATE['data']['library']
        S = lib['toc_slots']['L_TOC_SUMMARY']['t']
        cells = [S['b0_0'], S['b0_1'], S['b0_2']]
        sl = {'f': 'L_TOC_SUMMARY', 'kind': 'generic', 't': {str(cells[0]): '', str(cells[1]): '두 번째 과제', str(cells[2]): '세 번째 과제', str(S['b1_0']): '첫 제안'},
              '_slots': [{'i': i, 'ref': 'x', 'max': 20} for i in S.values()]}
        auto._compact_lists(sl)
        self.assertEqual([sl['t'][str(i)] for i in cells], ['두 번째 과제', '세 번째 과제', ''])
        self.assertEqual(sl['t'][str(S['b1_0'])], '첫 제안')                    # another column's list is not touched
        # 구성 · 수량 표: '●' where the product stands, '–' where it does not, nothing in a column without a product
        lib['toc_slots']['L_TOC_BOMX'] = {'t': {'rn0': 8, 'q0_0': 9, 'q0_1': 10, 'q0_2': 11, 'rn1': 15, 'q1_0': 16, 'q1_1': 17, 'q1_2': 18, 'rn2': 22, 'q2_0': 23, 'q2_1': 24, 'q2_2': 25}, 'img': {}}
        try:
            ctx = {'space_by_id': {'a': {'id': 'a', 'name': '카운터', 'products': ['qm55c']}, 'b': {'id': 'b', 'name': '좌석 홀', 'products': ['ac360']}}}
            got = auto._bom_lock(ctx, {'f': 'L_TOC_BOMX', 'bind': {'spaces': ['a', 'b']}}, ['qm55c', 'ac360'])
        finally:
            del lib['toc_slots']['L_TOC_BOMX']
        self.assertEqual([got[str(i)] for i in (8, 9, 10, 11)], ['카운터', '●', '–', ''])
        self.assertEqual([got[str(i)] for i in (15, 16, 17, 18)], ['좌석 홀', '–', '●', ''])
        self.assertEqual([got[str(i)] for i in (22, 23, 24, 25)], ['', '', '', ''])

    def test_a_product_stands_in_the_space_its_kind_belongs_to(self):
        pr, body = request(space_plan=None)
        ids = lambda prompt: re.findall(r'^(P\d+) \[', prompt, re.M)

        def script(stage, user, schema):
            if stage != 'auto_plan':
                return None   # the model stands the air conditioner (d4) at the 카운터·메뉴보드 (x1) — a space of screens
            return {'thesis': 't', 'storyline': 's', 'points': [{'id': f'R{n + 1}', 'text': t, 'products': [], 'solutions': []} for n, t in enumerate(POINTS[:3])],
                    'parts': [{'id': i, 'message': f'm {i}', 'points': [], 'refs': [], 'products': [], 'solutions': [], 'cases': [], 'spaces': [], 'n_slides': 2} for i in ids(user)],
                    'placement': [{'space': 'x1', 'products': ['d1', 'd4']}]}
        out, _ = run_req(pr, body, Scripted(script))
        where = {q: sp['name'] for sp in out['plan']['spaces'] for q in sp['products']}
        self.assertEqual(where['qm55c'], '카운터·메뉴보드')
        self.assertEqual(where['ac360'], '좌석 홀')      # where air conditioning belongs — not the 쇼케이스 (cold chain), though both are 'sac_' kinds
        self.assertTrue([f for f in out['plan']['fixes'] if 'ac360' in f and '옮김' in f])

    def test_what_a_line_says_an_item_does_is_checked_against_the_items_facts(self):
        auto = _STATE['auto']
        self.assertIn('기능:', auto.solution_knowledge('magicinfo'))        # the writer and the checker read what the solution does
        pr, body = wide_request(lambda pr, body: body.update(space_plan=None))
        prov = None
        planted = {'swap': 'MagicINFO가 매장 냉난방을 시간표대로 끕니다', 'boast': 'MagicINFO는 국제 보안 인증을 받았습니다', 'other': 'MagicINFO로 메뉴 화면을 한 번에 바꿉니다'}

        def script(stage, user, schema):
            if stage == 'auto_text':
                data = prov.fake.json(stage=stage, prompt=user, schema=schema)
                if 'Value Props' not in user:
                    return data
                rows = {(s_no, x['i']): x for s_no, x in prompt_rows(user)}
                todo = list(planted.values())
                for sl in data.get('slides') or []:
                    for cell in sl.get('t') or []:
                        x = rows.get((sl['s'], cell['i'])) or {}
                        if todo and '한 문장' in str(x.get('안내') or ''):   # the three value lines of the 가치 세 가지 장
                            cell['v'] = todo.pop(0)
                return data
            if stage == 'auto_text_verify':
                items = []
                for line in user.splitlines():
                    if not line.startswith('{"n":'):
                        continue
                    r = json.loads(line)
                    if r['text'] == planted['swap']:      # the same line with the subject swapped to the item that does it: taken
                        items.append({'n': r['n'], 'ok': False, 'why': '콘텐츠 솔루션은 냉난방을 제어하지 않음', 'fix': 'SmartThings Pro가 매장 냉난방을 시간표대로 끕니다'})
                    elif r['text'] == planted['boast']:   # a certificate the facts do not hold: no line beats that one
                        items.append({'n': r['n'], 'ok': False, 'why': '자료에 없는 인증', 'fix': '매장 운영이 한결 편해집니다'})
                    elif r['text'] == planted['other']:   # the checker's own idea of a better sentence: not taken
                        items.append({'n': r['n'], 'ok': False, 'why': '더 알맞은 표현', 'fix': '점주가 편하게 매장을 운영합니다'})
                    else:
                        items.append({'n': r['n'], 'ok': True})
                return {'items': items}
            return None
        prov = Scripted(script)
        out, _ = run_req(pr, body, prov)
        self.assertTrue([u for st, u in prov.prompts if st == 'auto_text_verify' and planted['swap'] in u])
        text = ' '.join(auto_plain(v) for p in out['app_parts'] for x in p['layouts'] for v in x['ov']['t'].values())
        self.assertIn('SmartThings Pro가 매장 냉난방을 시간표대로 끕니다', text)
        self.assertNotIn(planted['swap'], text)
        self.assertNotIn('국제 보안 인증', text)
        self.assertIn(planted['other'], text)
        self.assertNotIn('점주가 편하게 매장을 운영합니다', text)
        notes = [n for p in out['app_parts'] for n in p['notes']]
        self.assertTrue([n for n in notes if n.startswith('기능 설명 검수')])
        # a scene step that names no item claims nothing about one
        self.assertIsNone(auto.claim_subject({'products': ['qm55c'], 'solutions': ['magicinfo'], 'short': {}}, {'kind': 'generic', 'f': 'L_VS_CORE_1', 'bind': {}}, {'i': 7, 'mode': 'ai'}, '이닝 사이 매점에 줄이 깁니다'))


class SheetStructureTest(unittest.TestCase):
    """the cells a sheet's structure decides are set by code before the text is written — rows, legends, footers."""

    def test_the_deck_name_line_at_the_foot_is_not_a_legend_row(self):
        auto = _STATE['auto']
        lib = _STATE['data']['library']
        base = lib['layouts']['L_VS_BIRD_S3']
        last = max(t['i'] for t in base['texts'])
        # the app's layouts now carry the deck-name line as a text slot after the content (role 'utility', at the foot)
        lib['layouts']['L_VS_BIRD_SX'] = {**base, 'f': 'L_VS_BIRD_SX', 'texts': base['texts'] + [{'i': last + 2, 'o': 99, 'role': 'utility', 'text': '업종 · AI 제안', 'img': False,
                                                                                               'x': 148.0, 'y': 682.0, 'w': 760.0, 'h': 16.0, 'font': 12.0}]}
        try:
            self.assertEqual(auto._last_i('L_VS_BIRD_SX'), last)
            self.assertEqual(auto._max_i('L_VS_BIRD_SX'), last + 2)
            ctx = {'customer': 'A 커피', 'vertical_name': '', 'space_by_id': {'a': {'id': 'a', 'name': '카운터', 'products': ['qm55c', 'ac360', 'oh55a', 'kiosk']},
                                                                           'b': {'id': 'b', 'name': '좌석 홀', 'products': ['ac360']}}}
            got = auto._bird_lock(ctx, {'f': 'L_VS_BIRD_SX', 'bind': {'spaces': ['a', 'b']}, 'ex_t': {}})
        finally:
            del lib['layouts']['L_VS_BIRD_SX']
        self.assertEqual((got['4'], got['6'], got['8'], got['9']), ('카운터', '좌석 홀', '', ''))
        self.assertIsNone(got[str(last)])                       # the layout's own note line stays (it is not a fourth legend row)
        self.assertNotIn(str(last + 2), got)                    # the deck-name line is not a legend cell
        line = got['5']                                         # the product line of a legend row: whole names, then '외 N' — never cut by the cell
        self.assertTrue(line.endswith('외 2') or line.endswith('외 3') or line.count(' · ') == 3, line)
        self.assertNotIn('…', line)
        g = {'w': 238.0, 'h': 19.0, 'font': 14.0}
        self.assertEqual(auto._name_line(['스마트 사이니지 QM55C'], g), '스마트 사이니지 QM55C')
        self.assertEqual(auto._name_line(['무풍 4Way 카세트', '스마트 사이니지 QM55C', '갤럭시 북5 Pro'], g), '무풍 4Way 카세트 외 2')
        self.assertTrue(auto._is_footer({'role': 'utility', 'y': 682.0}) and not auto._is_footer({'role': 'utility', 'y': 44.0}))

    def test_the_deck_name_line_of_a_sheet_is_this_decks_and_is_not_left_to_the_writer(self):
        auto = _STATE['auto']
        lib = _STATE['data']['library']
        L = lib['layouts']['L_VS_NEEDS']
        last = max(t['i'] for t in L['texts'])
        keep = list(L['texts'])
        pr, body = request()
        part = next(p for p in body['parts'] if any(x['f'] == 'L_VS_NEEDS' for x in p['exemplar']))
        x = next(x for x in part['exemplar'] if x['f'] == 'L_VS_NEEDS')
        # the layout as the app now has it: the deck-name line is a text slot after the content, the page mark comes after it
        x['t'] = {**{k: v for k, v in x['t'].items() if int(k) <= last}, str(last + 1): '카페·베이커리 · AI 카페 표준 제안서',
                  **{str(int(k) + 1): v for k, v in x['t'].items() if int(k) > last}}
        L['texts'] = keep + [{'i': last + 1, 'o': 99, 'role': 'utility', 'text': '업종 · AI 제안', 'img': False, 'x': 148.0, 'y': 682.0, 'w': 760.0, 'h': 16.0, 'font': 12.0}]
        try:
            want = auto.build_context(copy.deepcopy(pr), copy.deepcopy(body))['footer_new']
            prov = Scripted(lambda stage, user, schema: None)
            out, _ = run_req(pr, body, prov)
        finally:
            L['texts'] = keep
        sheet = next(x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_VS_NEEDS')
        self.assertTrue(want and '카페·베이커리' not in want)
        self.assertEqual(sheet['ov']['t'][str(last + 1)], want)
        ask = next(u for st, u in prov.prompts if st == 'auto_text' and '니즈 · 기술 · 제안 3열' in u)
        needs_no = next(int(m.group(1)) for m in re.finditer(r'^\[s=(\d+)\] 니즈 · 기술 · 제안 3열', ask, re.M))
        self.assertNotIn(last + 1, [x['i'] for s_no, x in prompt_rows(ask) if s_no == needs_no])   # the writer is not asked for the footer

    def test_the_two_rows_of_a_proposal_sheet_stand_for_two_selected_items(self):
        auto = _STATE['auto']
        pr, body = request()
        ctx = auto.build_context(pr, body)
        L = _STATE['data']['library']['layouts']['L_VS_CORE_1']['modes']
        chips = sorted(int(k) for k, m in L['t'].items() if m == 'product')
        pics = sorted(int(k) for k, m in L['img'].items() if m == 'product')
        used = {'magicinfo'}
        sl = {'f': 'L_VS_CORE_1'}
        rows = auto._core_rows(ctx, sl, 'magicinfo', ['qm55c'], used)
        self.assertEqual(rows, ['magicinfo', 'qm55c'])
        self.assertEqual([sl['lock'][str(i)] for i in chips], [ctx['short']['magicinfo'], ctx['short']['qm55c']])
        self.assertEqual([sl['img_bind'][str(i)] for i in pics], [{'solution': 'magicinfo'}, {'product': 'qm55c'}])
        sl2 = {'f': 'L_VS_CORE_2'}       # the next sheet takes an item no row shows yet
        self.assertEqual(auto._core_rows(ctx, sl2, 'stpro', [], used)[1] not in ('magicinfo', 'qm55c', 'stpro'), True)

    def test_a_requirement_sheet_has_a_row_per_requirement_point(self):
        auto = _STATE['auto']
        lib = _STATE['data']['library']
        pr, body = request()
        ctx = auto.build_context(pr, body)
        lib['toc_slots']['L_TOC_RFPX'] = {'t': {'rq0': 6, 'rs0': 7, 'ev0': 8, 'rq1': 10, 'rs1': 11, 'ev1': 12, 'rq2': 14, 'rs2': 15, 'ev2': 16}, 'img': {}}
        try:
            sl = {'f': 'L_TOC_RFPX'}
            auto._rfp_rows(ctx, {'points': [{'id': 'R1', 'text': '신메뉴를 전 매장에 같은 날 반영해야 한다.', 'products': ['qm55c'], 'solutions': ['magicinfo']},
                                            {'id': 'R2', 'text': '매장 냉난방 전력을 줄여야 한다.', 'products': [], 'solutions': []}]}, sl)
        finally:
            del lib['toc_slots']['L_TOC_RFPX']
        self.assertIn('“신메뉴를 전 매장에 같은 날 반영해야 한다.”', sl['notes']['6'])
        self.assertIn('제품 이름이 아닙니다', sl['notes']['6'])
        self.assertIn(ctx['short']['magicinfo'], sl['notes']['7'])
        self.assertIn('“매장 냉난방 전력을 줄여야 한다.”', sl['notes']['10'])
        self.assertEqual((sl['lock']['14'], sl['lock']['15'], sl['lock']['16']), ('', '', ''))     # no third point: no third row
        self.assertEqual(len(sl['rfp_points']), 2)

    def test_one_product_in_several_spaces_gets_a_sheet_in_every_space(self):
        # user instruction 2026-11-17 (pn63a3to: DT 매장 · 가두 매장 both with QM55C showed one sheet): 공간별 제품 장 수 = 공간 수 —
        # every space with a product has its own sheet, even when another space holds the same product (the old one-sheet rule is gone)
        pr, body = request(space_plan=None)
        pr['ctx'].update(products=['qm55c'])
        ids = lambda prompt: re.findall(r'^(P\d+) \[', prompt, re.M)

        def script(stage, user, schema):
            if stage != 'auto_plan':
                return None
            return {'thesis': 't', 'storyline': 's', 'points': [{'id': f'R{n + 1}', 'text': t, 'products': [], 'solutions': []} for n, t in enumerate(POINTS[:3])],
                    'parts': [{'id': i, 'message': f'm {i}', 'points': [], 'refs': [], 'products': [], 'solutions': [], 'cases': [], 'spaces': [], 'n_slides': 2} for i in ids(user)],
                    'placement': [{'space': 'x1', 'products': ['d1']}, {'space': 'x2', 'products': ['d1']}, {'space': 'x5', 'products': ['d1']}]}
        out, _ = run_req(pr, body, Scripted(script))
        self.assertEqual(len(out['plan']['spaces']), 3)
        sheets = [x for p in out['app_parts'] for x in p['layouts'] if x['f'] == 'L_VS_SPACE']
        self.assertEqual(len(sheets), 3)                         # one sheet per space — the same product under each space's own name
        self.assertEqual([x['ov']['t']['1'] for x in sheets], [s['name'] for s in out['plan']['spaces']])
        self.assertEqual({x['agent']['bind']['product'] for x in sheets}, {'qm55c'})

    def test_a_feature_that_lost_its_line_becomes_the_products_key_specs_and_case_names_are_composed(self):
        auto = _STATE['auto']
        lib = _STATE['data']['library']
        sl = {'f': 'L_VS_SPACE', 'kind': 'space', 'bind': {'product': 'qm55c'},
              't': {'1': '카운터', '4': '스마트 사이니지 QM55C', '5': '24시간 선명한 4K', '6': '4K UHD 화면을 24시간 안정적으로 운영합니다.', '7': '클라우드 원격 운영', '8': ''}}
        auto._feature_pairs({}, sl)
        self.assertEqual(sl['t']['7'], '주요 사양')
        self.assertRegex(sl['t']['8'], r'\d')                    # the catalog's own figures ('밝기 500 nit · 명암비 4,000:1')
        self.assertEqual(sl['t']['5'], '24시간 선명한 4K')         # the pair that kept its line is not touched
        import unicodedata
        cid = next(iter(lib['cases']))
        keep = lib['cases'][cid].get('cust')
        try:
            lib['cases'][cid]['cust'] = unicodedata.normalize('NFD', '성균관대학교 글로벌센터')
            lib.pop('_nfc_cases', None)
            auto._nfc_cases(lib)
            self.assertEqual(lib['cases'][cid]['cust'], '성균관대학교 글로벌센터')
            self.assertEqual(len(lib['cases'][cid]['cust']), 12)     # composed syllables — not 30-odd jamo
        finally:
            lib['cases'][cid]['cust'] = keep


class MarketResearch(unittest.TestCase):
    """업종 트렌드 장은 문구 단계가 쓰지 않는다 — 조사 hook 이 준 검증된 값이 그대로 실리고, 근거 · 조사 정보가 함께 나온다."""

    def run_with(self, sheets_fn, available=(True, '')):
        from unittest import mock
        seen = {}

        def fake(spec, want, provider, **kw):
            seen.update(spec=spec, want=list(want))
            return sheets_fn(spec, want)
        pr, body = wide_request()
        with mock.patch.object(compose.market_research, 'available', lambda *a, **k: available), mock.patch.object(compose.market_research, 'trend_sheets', fake):
            out, job = run_req(pr, body)
        ua = next(p for p in out['app_parts'] if p['id'] == 'x_ua')
        trend = next(x for x in ua['layouts'] if x['f'].startswith('L_TOC_TR'))
        return out, job, ua, trend, seen

    def test_verified_values_are_locked_into_the_sheet_with_evidence(self):
        out, job, ua, trend, seen = self.run_with(lambda spec, want: {'ok': True, 'sheets': [STAT_SHEET], 'research': RESEARCH})
        self.assertEqual(seen['want'], ['stat'])
        self.assertNotIn(_STATE['data']['proposal'].get('customer') or '고객사없음', ' '.join(seen['spec']['products']))
        t = trend['ov']['t']
        self.assertEqual([t[k] for k in ('1', '2', '3', '4', '5', '6', '7', '8', '9', '10')],
                         ['숫자로 보는 외식업의 지금', '키오스크 등 무인주문기 도입률 (2025)', '13.0', '%', '일반음식점 영업이익률 (2024)', '8.7', '%', '식재료비 비중', '40.7', '%'])
        self.assertTrue(t['0'].endswith('업종 트렌드'), '머리말은 이 덱의 장 번호 · 목차 이름으로')
        self.assertRegex(t['13'], r'^CONFIDENTIAL · \d+$')
        self.assertEqual(trend['status'], 'done')
        self.assertEqual(set(trend['ev']), {'1', '3', '6', '9'}, '근거는 칸 번호로 나온다')
        self.assertEqual(trend['ev']['3'][0]['url'], 'https://www.mafra.go.kr/stat/1')
        self.assertTrue(trend['research']['ok'])
        self.assertEqual(trend['research']['queries'], ['외식업 무인주문기 도입률 통계'])
        self.assertIn('‘식재료비 비중’은 출처 인용에 기준 연도가 글자로 없어요 — 근거에서 확인해 주세요.', ua['notes'])
        self.assertFalse(out['failed'])

    def test_market_cells_survive_the_selected_items_guard(self):
        # 이 고객은 키오스크를 연결하지 않았다 — 그래도 '키오스크 … 도입률'은 업계의 사실이라 지우지 않는다
        out, job, ua, trend, seen = self.run_with(lambda spec, want: {'ok': True, 'sheets': [STAT_SHEET], 'research': RESEARCH})
        self.assertEqual(trend['ov']['t']['2'], '키오스크 등 무인주문기 도입률 (2025)')
        self.assertFalse((trend['agent'].get('removed') or {}).get('2'))

    def test_no_evidence_keeps_placeholders_and_the_part_still_succeeds(self):
        blank = {'kind': 'stat', 'was': 'stat', 'filled': False, 'why': '검증을 통과한 시장 근거를 찾지 못했어요.', 'v': {}, 'ev': {}, 'notes': []}
        out, job, ua, trend, seen = self.run_with(lambda spec, want: {'ok': False, 'sheets': [blank], 'research': {'ok': False, 'reason': 'no_evidence', 'queries': ['q']}})
        self.assertEqual(trend['f'], 'L_TOC_TRSTAT')
        self.assertEqual([trend['ov']['t'][k] for k in ('3', '6', '9')], ['[00]', '[00]', '[00]'], '값을 지어내지 않는다')
        self.assertEqual(trend['status'], 'partial')
        self.assertFalse(trend['research']['ok'])
        self.assertNotIn('ev', trend)
        self.assertTrue(any('자리표시' in n for n in ua['notes']), ua['notes'])
        self.assertNotIn('x_ua', out['failed'])

    def test_a_crashing_hook_never_sinks_the_part(self):
        def boom(spec, want):
            raise RuntimeError('search exploded')
        out, job, ua, trend, seen = self.run_with(boom)
        self.assertEqual([trend['ov']['t'][k] for k in ('3', '6', '9')], ['[00]', '[00]', '[00]'])
        self.assertNotIn('x_ua', out['failed'])

    def test_without_search_the_sheet_is_composed_as_before(self):
        def never(spec, want):
            raise AssertionError('검색을 쓸 수 없으면 조사를 부르지 않는다')
        out, job, ua, trend, seen = self.run_with(never, available=(False, 'no_web_search'))
        self.assertNotIn('research', trend)
        self.assertEqual([trend['ov']['t'][k] for k in ('3', '6', '9')], ['[00]', '[00]', '[00]'])
        self.assertTrue(any('시장 자료 검색 사용 안 함' in e.get('message', '') for e in job.events if e['type'] == 'text'))

    def test_market_request_is_validated(self):
        pr, body = wide_request()
        body['market'] = {'sheets': 'x'}
        with self.assertRaises(BadRequest):
            compose._auto_body(body)
        body['market'] = {'sheets': [{'kind': 'stat', 'f': 'L_TOC_TRSTAT', 't': {'1': 'x'}, 'img': {}}, {'kind': 'line', 'f': 'L_NOPE', 't': {}}, 'junk']}
        alts = _STATE['auto'].mkt.clean_market(compose._auto_body(body)['market'])
        self.assertEqual(list(alts), ['stat'], '형식이 틀린 견본은 버린다')
