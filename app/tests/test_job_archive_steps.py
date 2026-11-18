"""Server work stays on the server: finished jobs and model steps can be read again by id / key.

2026-11-18 (pn63a3to, user): "웹앱에서 벗어나도 백엔드에서 하고 있고 그 정보는 백엔드에 기록되고 재탐색 되어야해" —
a browser that reloads, leaves and comes back, or returns after a server restart must find the work the server did
instead of running it again.
"""
import tempfile
import threading
import time
import unittest
from pathlib import Path

from app.api.poc.jobs import JobArchive, JobManager
from app.api.poc.steps import StepStore


def wait_terminal(manager, job_id, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        job = manager.get(job_id)
        if job.terminal:
            return job
        time.sleep(0.02)
    raise AssertionError('job did not finish')


def wait_archived(path, job_id, timeout=5.0):
    """The old process has written the job's final row (a real restart happens after that, never during it)."""
    import sqlite3
    end = time.time() + timeout
    while time.time() < end:
        db = sqlite3.connect(path)
        try:
            row = db.execute('SELECT status, data FROM jobs WHERE id=?', (job_id,)).fetchone()
        finally:
            db.close()
        if row and row[0] in ('done', 'error', 'cancelled') and '"result"' in row[1] and '"type": "result"' in row[1]:
            return
        time.sleep(0.02)
    raise AssertionError('job was not archived')


class JobArchiveTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / 'jobs.sqlite'

    def tearDown(self):
        self.dir.cleanup()

    def test_a_finished_job_is_found_by_id_after_a_restart(self):
        first = JobManager()
        first.use_archive(self.path)
        job = first.submit('compose', '레이아웃 자동 구성', {'proposal': {'big': 'x' * 1000}}, lambda j: (j.emit('part', id='s1', status='done'), {'app_parts': [{'id': 's1', 'layouts': [{'f': 'L_X'}]}]})[1])
        wait_terminal(first, job.id)
        wait_archived(self.path, job.id)
        restarted = JobManager()  # a new process: nothing in memory
        restarted.use_archive(self.path)
        again = restarted.get(job.id)
        snap = again.snapshot(0)
        self.assertEqual(snap['status'], 'done')
        self.assertEqual(snap['result'], {'app_parts': [{'id': 's1', 'layouts': [{'f': 'L_X'}]}]})
        self.assertEqual(snap['params'], {}, 'the job input is not kept')
        self.assertIn('part', [e['type'] for e in snap['events']], 'progress events come back too (the browser applies parts from them)')
        self.assertEqual(again.snapshot(snap['next_seq'])['events'], [], 'polling from the last seq has nothing new')

    def test_a_job_running_when_the_server_stopped_is_reported_interrupted(self):
        first = JobManager()
        first.use_archive(self.path)
        gate = threading.Event()
        job = first.submit('compose', 'long', {}, lambda j: gate.wait(5) and {'ok': True})
        restarted = JobManager()
        restarted.use_archive(self.path)  # startup marks unfinished rows
        snap = restarted.get(job.id).snapshot(0)
        self.assertEqual(snap['status'], 'error')
        self.assertEqual(snap['error']['code'], 'interrupted')
        self.assertEqual([e for e in snap['events'] if e['type'] == 'state'][-1]['status'], 'error')
        gate.set()
        wait_terminal(first, job.id)  # let the old process's thread finish before the folder goes

    def test_without_an_archive_an_unknown_job_is_not_found(self):
        from app.api.poc.jobs import NotFound
        with self.assertRaises(NotFound):
            JobManager().get('nope')


class StepStoreTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.store = StepStore()
        self.store.use_path(Path(self.dir.name) / 'jobs.sqlite')

    def tearDown(self):
        self.dir.cleanup()

    def test_the_same_step_is_answered_from_the_record(self):
        calls = []
        ask = lambda: calls.append(1) or {'mode': 'real', 'data': {'n': len(calls)}}
        self.assertEqual(self.store.run('admin', 'fill:p1:l1:r1:0:abc', ask)['data'], {'n': 1})
        self.assertEqual(self.store.run('admin', 'fill:p1:l1:r1:0:abc', ask)['data'], {'n': 1})
        self.assertEqual(len(calls), 1, 'asked once')
        reopened = StepStore()
        reopened.use_path(self.store.path)
        self.assertEqual(reopened.run('admin', 'fill:p1:l1:r1:0:abc', ask)['data'], {'n': 1}, 'kept on disk (server restart)')
        self.assertEqual(len(calls), 1)
        self.store.run('other', 'fill:p1:l1:r1:0:abc', ask)
        self.assertEqual(len(calls), 2, 'another account never reads this record')

    def test_a_step_still_running_is_joined_not_asked_again(self):
        started, release, calls = threading.Event(), threading.Event(), []

        def slow():
            calls.append(1)
            started.set()
            release.wait(5)
            return {'mode': 'real', 'data': 'answer'}

        out = []
        first = threading.Thread(target=lambda: out.append(self.store.run('admin', 'k:1', slow)))
        first.start()
        started.wait(5)
        second = threading.Thread(target=lambda: out.append(self.store.run('admin', 'k:1', slow)))  # the page reloaded
        second.start()
        time.sleep(0.05)
        release.set()
        first.join(5)
        second.join(5)
        self.assertEqual(len(calls), 1)
        self.assertEqual([o['data'] for o in out], ['answer', 'answer'])

    def test_a_failure_is_not_recorded(self):
        def fail():
            raise RuntimeError('upstream')
        with self.assertRaises(RuntimeError):
            self.store.run('admin', 'k:2', fail)
        self.assertEqual(self.store.run('admin', 'k:2', lambda: {'ok': 1}), {'ok': 1})

    def test_keys_are_checked(self):
        self.assertTrue(StepStore.valid('fill:pn63a3to:l0is05oz:yzjkgeywirm:3:r1:1x2y3z'))
        self.assertFalse(StepStore.valid('../x y'))
        self.assertFalse(StepStore.valid(None))
        self.assertFalse(StepStore.valid('x' * 301))


if __name__ == '__main__':
    unittest.main()


class LlmRouteStepTest(unittest.TestCase):
    """POST /api/llm with a step_key answers the same step from the record (the model is asked once)."""

    def test_route_records_and_replays_a_step(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.api.poc import routes, service
        from app.api.poc.adapters import llm as llm_adapter
        calls = []
        saved = (llm_adapter.parse, llm_adapter.complete, service.STEPS)
        llm_adapter.parse = lambda body, settings: (body, object())
        llm_adapter.complete = lambda req, provider: calls.append(req.get('prompt')) or {'mode': 'real', 'data': {'n': len(calls)}}
        service.STEPS = StepStore()
        try:
            app = FastAPI()
            app.include_router(routes.router)
            client = TestClient(app)
            body = {'feature': 'fill', 'kind': 'json', 'prompt': 'p', 'stream': False, 'step_key': 'fill:p1:l1:r1:0:abc'}
            first = client.post('/api/llm', json=body).json()
            again = client.post('/api/llm', json=body).json()
            plain = client.post('/api/llm', json={**body, 'step_key': None}).json()
            self.assertEqual(first, {'mode': 'real', 'data': {'n': 1}})
            self.assertEqual(again, first, 'the reload gets the recorded answer')
            self.assertEqual(plain['data'], {'n': 2}, 'a call without a step key is asked as before')
            self.assertEqual(len(calls), 2)
        finally:
            llm_adapter.parse, llm_adapter.complete, service.STEPS = saved
