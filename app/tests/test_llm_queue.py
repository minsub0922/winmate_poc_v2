"""Admission invariants with real SQLite transactions and optional real Redis."""
import concurrent.futures
import multiprocessing
import os
import shutil
import socket
import sqlite3
import subprocess
import threading
import time
import uuid

import pytest

from app.api.llm.queue import CallQueue, QueueError, RedisBroker, SQLiteBroker


def admit(broker, ticket, rpm=42, concurrency=4, lease=90):
    broker.enqueue(ticket)
    return broker.claim(ticket, rpm, concurrency, lease)


def test_exact_rolling_window_survives_new_broker_and_has_no_minute_boundary_burst(tmp_path):
    now = [100.0]
    broker = SQLiteBroker(tmp_path/'queue.sqlite', clock=lambda: now[0])
    for i in range(42):
        assert admit(broker, str(i))
        broker.release(str(i))
    # A fresh provider/process cannot reset quota, even across a wall-clock minute.
    other = SQLiteBroker(broker.path, clock=lambda: now[0])
    now[0] = 159.999
    other.enqueue('43')
    assert not other.claim('43', 1000, 4, 90)
    now[0] = 160.0
    assert other.claim('43', 1000, 4, 90)
    assert other.snapshot()['starts_last_minute'] == 1


def test_fifo_cancelled_and_abandoned_messages_and_expired_leases(tmp_path):
    now = [100.0]
    broker = SQLiteBroker(tmp_path/'queue.sqlite', clock=lambda: now[0])
    broker.enqueue('first'); broker.enqueue('second')
    assert not broker.claim('second', 42, 1, 10)
    broker.discard('first')
    assert broker.claim('second', 42, 1, 10)
    broker.enqueue('third')
    assert not broker.claim('third', 42, 1, 10)
    now[0] += 11
    assert broker.claim('third', 42, 1, 10)
    broker.release('third')
    broker.enqueue('orphan')
    now[0] += 16
    assert admit(broker, 'after-orphan')


def _process_attempts(db_path):
    queue = CallQueue(SQLiteBroker(db_path), concurrency=8, timeout=.15)
    admitted = 0
    for _ in range(12):
        try:
            ticket = queue.acquire()
        except QueueError as exc:
            assert exc.code == 'timeout'
            continue
        admitted += 1
        queue.release(ticket)
    return admitted


def test_42_limit_is_atomic_across_processes_and_restarts(tmp_path):
    path = tmp_path/'multiprocess.sqlite'
    SQLiteBroker(path).snapshot()  # Initialize schema before competing processes.
    with concurrent.futures.ProcessPoolExecutor(max_workers=6, mp_context=multiprocessing.get_context('spawn')) as pool:
        counts = list(pool.map(_process_attempts, [path]*6))
    assert sum(counts) == 42
    assert SQLiteBroker(path).snapshot() == {'backend': 'sqlite', 'queued': 0, 'active': 0,
                                           'starts_last_minute': 42, 'max_rpm': 42}


def test_cancellation_and_deadline_remove_messages_and_never_refund_started_calls(tmp_path):
    broker = SQLiteBroker(tmp_path/'queue.sqlite')
    queue = CallQueue(broker, concurrency=1, timeout=.12)
    first = queue.acquire()
    with pytest.raises(QueueError, match='timeout'): queue.acquire()
    cancel = threading.Event()
    with concurrent.futures.ThreadPoolExecutor() as pool:
        future = pool.submit(queue.acquire, cancel.is_set)
        for _ in range(100):
            if broker.snapshot()['queued']: break
            time.sleep(.001)
        cancel.set()
        with pytest.raises(QueueError, match='cancelled'): future.result(timeout=1)
    queue.release(first); queue.release(first)
    assert broker.snapshot()['queued'] == 0
    assert broker.snapshot()['active'] == 0
    assert broker.snapshot()['starts_last_minute'] == 1


def test_broker_failure_is_secret_safe_and_never_bypasses_limit():
    class BrokenBroker:
        def enqueue(self, ticket): raise OSError('redis://user:password@example.test')
        def discard(self, ticket): raise OSError('cleanup failed')
    with pytest.raises(QueueError, match='^upstream_unavailable$'):
        CallQueue(BrokenBroker()).acquire()


def test_sqlite_write_contention_keeps_request_waiting_instead_of_failing(tmp_path):
    broker = SQLiteBroker(tmp_path/'contended.sqlite')
    broker.snapshot()
    queue = CallQueue(broker, timeout=2)
    db = sqlite3.connect(broker.path)
    db.execute('BEGIN IMMEDIATE')
    with concurrent.futures.ThreadPoolExecutor() as pool:
        future = pool.submit(queue.acquire)
        try:
            time.sleep(.25)  # Longer than the per-transaction busy timeout.
            assert not future.done()
        finally:
            db.rollback(); db.close()
        ticket = future.result(timeout=2)
    queue.release(ticket)
    assert broker.snapshot()['starts_last_minute'] == 1
    assert broker.snapshot()['queued'] == 0


@pytest.fixture(scope='module')
def redis_url(tmp_path_factory):
    binary = os.environ.get('WINMATE_TEST_REDIS_SERVER') or shutil.which('redis-server')
    if not binary: pytest.skip('real Redis integration: set WINMATE_TEST_REDIS_SERVER or install redis-server')
    pytest.importorskip('redis')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    folder = tmp_path_factory.mktemp('redis')
    with (folder/'server.log').open('w') as log:
        process = subprocess.Popen([binary, '--bind', '127.0.0.1', '--port', str(port), '--save', '',
                                    '--appendonly', 'no', '--dir', str(folder)], stdout=log, stderr=log)
        url = f'redis://127.0.0.1:{port}/0'
        import redis
        client = redis.Redis.from_url(url)
        try:
            for _ in range(200):
                try:
                    if client.ping(): break
                except redis.RedisError: pass
                if process.poll() is not None: pytest.fail('Redis failed to start')
                time.sleep(.01)
            else: pytest.fail('Redis startup timed out')
            yield url
        finally:
            client.close()
            process.terminate()
            process.wait(timeout=5)


@pytest.mark.parametrize('backend', ['sqlite', 'redis'])
def test_shared_fifo_rate_and_concurrency_with_real_brokers(backend, tmp_path, request):
    namespace = 'test-' + uuid.uuid4().hex
    def broker():
        if backend == 'sqlite': return SQLiteBroker(tmp_path/'shared.sqlite')
        return RedisBroker(request.getfixturevalue('redis_url'), namespace)
    first, second = broker(), broker()
    assert admit(first, 'active', concurrency=1)
    second.enqueue('head'); first.enqueue('tail')
    assert not second.claim('head', 42, 1, 90)
    first.release('active')
    assert not first.claim('tail', 42, 1, 90)
    assert second.claim('head', 42, 1, 90)
    second.release('head')
    assert first.claim('tail', 42, 1, 90)
    first.release('tail')
    for i in range(39):
        assert admit(second, str(i))
        second.release(str(i))
    first.enqueue('over-limit')
    assert not first.claim('over-limit', 10000, 100, 90)
    first.discard('over-limit')
    assert second.snapshot()['starts_last_minute'] == 42


def test_redis_server_window_expiry_and_abandoned_lease(redis_url):
    broker = RedisBroker(redis_url, 'test-' + uuid.uuid4().hex, window=.15)
    assert admit(broker, 'one', rpm=1, concurrency=1, lease=.05)
    broker.enqueue('two')
    assert not broker.claim('two', 1, 1, 90)
    time.sleep(.16)
    assert broker.claim('two', 1, 1, 90)


def _redis_process_attempts(args):
    url, namespace = args
    queue = CallQueue(RedisBroker(url, namespace), concurrency=8, timeout=.3)
    accepted = 0
    for _ in range(12):
        try:
            ticket = queue.acquire()
        except QueueError as exc:
            assert exc.code == 'timeout'
            continue
        accepted += 1
        queue.release(ticket)
    return accepted


def test_redis_atomic_limit_across_independent_api_processes(redis_url):
    namespace = 'test-' + uuid.uuid4().hex
    with concurrent.futures.ProcessPoolExecutor(max_workers=6, mp_context=multiprocessing.get_context('spawn')) as pool:
        counts = list(pool.map(_redis_process_attempts, [(redis_url, namespace)]*6))
    assert sum(counts) == 42
    assert RedisBroker(redis_url, namespace).snapshot()['starts_last_minute'] == 42


@pytest.mark.parametrize('backend', ['sqlite', 'redis'])
def test_lost_admission_reply_releases_slot_without_refunding_quota(backend, tmp_path, request, monkeypatch):
    broker = (SQLiteBroker(tmp_path/'lost-reply.sqlite') if backend == 'sqlite' else
              RedisBroker(request.getfixturevalue('redis_url'), 'test-' + uuid.uuid4().hex))
    original = broker.claim
    def lost(*args):
        assert original(*args)
        raise TimeoutError('broker reply lost after atomic admission')
    monkeypatch.setattr(broker, 'claim', lost)
    with pytest.raises(QueueError, match='upstream_unavailable'):
        CallQueue(broker).acquire()
    assert broker.snapshot()['active'] == 0
    assert broker.snapshot()['queued'] == 0
    assert broker.snapshot()['starts_last_minute'] == 1


def test_unavailable_redis_fails_closed():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    queue = CallQueue(RedisBroker(f'redis://127.0.0.1:{port}/0'))
    with pytest.raises(QueueError, match='upstream_unavailable'): queue.acquire()
