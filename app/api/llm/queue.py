"""FIFO admission messages shared by providers, threads and API workers.

Only opaque ticket IDs and timestamps enter the broker; prompts stay with callers.
Admission and rolling-window accounting are one transaction. Failed attempts are
never refunded. SQLite is for one host; Redis coordinates independent hosts.
"""
from __future__ import annotations

import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Optional, Protocol

MAX_RPM = 42
WINDOW_SECONDS = 60.0
TICKET_TTL = 15.0


class QueueError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class QueueBusy(Exception):
    """Transient broker contention. Keep waiting within the caller's budget."""


class Broker(Protocol):
    def enqueue(self, ticket: str) -> None: ...
    def claim(self, ticket: str, rpm: int, concurrency: int, lease_seconds: float) -> bool: ...
    def discard(self, ticket: str) -> None: ...
    def release(self, ticket: str) -> None: ...
    def snapshot(self) -> dict: ...


class SQLiteBroker:
    """Persistent broker. All workers on a host must share this local DB path."""

    def __init__(self, path: Path, *, window: float = WINDOW_SECONDS,
                 clock: Callable[[], float] = time.time):
        self.path, self.window, self.clock = Path(path), window, clock
        self._ready = False
        self._lock = threading.Lock()

    @contextmanager
    def _connect(self):
        try:
            with self._connection() as db:
                yield db
        except sqlite3.OperationalError as exc:
            if (getattr(exc, 'sqlite_errorcode', 0) & 255) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
                raise QueueBusy() from None
            raise

    @contextmanager
    def _connection(self):
        if not self._ready:
            with self._lock:
                if not self._ready:
                    self.path.parent.mkdir(parents=True, exist_ok=True)
                    db = sqlite3.connect(self.path, timeout=.1)
                    try:
                        db.execute('PRAGMA journal_mode=WAL')
                        db.executescript('''
                            CREATE TABLE IF NOT EXISTS waiting (
                                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                                ticket TEXT UNIQUE NOT NULL, expires REAL NOT NULL);
                            CREATE TABLE IF NOT EXISTS starts (
                                ticket TEXT PRIMARY KEY, started REAL NOT NULL);
                            CREATE INDEX IF NOT EXISTS starts_time ON starts(started);
                            CREATE TABLE IF NOT EXISTS active (
                                ticket TEXT PRIMARY KEY, expires REAL NOT NULL);
                        ''')
                    finally:
                        db.close()
                    self._ready = True
        db = sqlite3.connect(self.path, timeout=.1, isolation_level=None)
        try:
            yield db
        finally:
            db.close()

    def enqueue(self, ticket):
        with self._connect() as db:
            db.execute('INSERT OR IGNORE INTO waiting(ticket, expires) VALUES (?, ?)',
                       (ticket, self.clock() + TICKET_TTL))

    def claim(self, ticket, rpm, concurrency, lease_seconds):
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            now = self.clock()
            db.execute('DELETE FROM waiting WHERE expires <= ?', (now,))
            db.execute('DELETE FROM starts WHERE started <= ?', (now - self.window,))
            db.execute('DELETE FROM active WHERE expires <= ?', (now,))
            # Heartbeats remove abandoned messages without blocking the queue forever.
            own = db.execute('SELECT expires FROM waiting WHERE ticket=?', (ticket,)).fetchone()
            if own is None:
                raise QueueError('upstream_unavailable')
            if own[0] - now < TICKET_TTL / 2:
                db.execute('UPDATE waiting SET expires=? WHERE ticket=?', (now + TICKET_TTL, ticket))
            head = db.execute('SELECT ticket FROM waiting ORDER BY seq LIMIT 1').fetchone()
            admitted = bool(head and head[0] == ticket
                            and db.execute('SELECT count(*) FROM starts').fetchone()[0] < min(MAX_RPM, rpm)
                            and db.execute('SELECT count(*) FROM active').fetchone()[0] < concurrency)
            if admitted:
                db.execute('DELETE FROM waiting WHERE ticket=?', (ticket,))
                db.execute('INSERT INTO starts VALUES (?, ?)', (ticket, now))
                db.execute('INSERT INTO active VALUES (?, ?)', (ticket, now + lease_seconds))
            db.commit()
            return admitted

    def discard(self, ticket):
        with self._connect() as db:
            db.execute('DELETE FROM waiting WHERE ticket=?', (ticket,))

    def release(self, ticket):
        with self._connect() as db:
            db.execute('DELETE FROM active WHERE ticket=?', (ticket,))

    def snapshot(self):
        with self._connect() as db:
            now = self.clock()
            return {'backend': 'sqlite', 'queued': db.execute('SELECT count(*) FROM waiting WHERE expires>?', (now,)).fetchone()[0],
                    'active': db.execute('SELECT count(*) FROM active WHERE expires>?', (now,)).fetchone()[0],
                    'starts_last_minute': db.execute('SELECT count(*) FROM starts WHERE started>?', (now-self.window,)).fetchone()[0],
                    'max_rpm': MAX_RPM}


# Every operation uses Redis server time and one atomic script, including queue
# ordering. The hash tag keeps every key in one slot on Redis Cluster.
_REDIS_SCRIPT = '''
local tm = redis.call('TIME')
local now = tonumber(tm[1]) + tonumber(tm[2]) / 1000000
local op, ticket = ARGV[1], ARGV[2]
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now)
for _, id in ipairs(expired) do redis.call('ZREM', KEYS[1], id) end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now - tonumber(ARGV[6]))
redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now)
if op == 'enqueue' then
    redis.call('ZADD', KEYS[1], redis.call('INCR', KEYS[5]), ticket)
    redis.call('ZADD', KEYS[2], now + 15, ticket)
elseif op == 'claim' then
    if not redis.call('ZSCORE', KEYS[1], ticket) then return -1 end
    redis.call('ZADD', KEYS[2], now + 15, ticket)
    local head = redis.call('ZRANGE', KEYS[1], 0, 0)
    if head[1] == ticket and redis.call('ZCARD', KEYS[3]) < tonumber(ARGV[3])
       and redis.call('ZCARD', KEYS[4]) < tonumber(ARGV[4]) then
        redis.call('ZREM', KEYS[1], ticket)
        redis.call('ZREM', KEYS[2], ticket)
        redis.call('ZADD', KEYS[3], now, ticket)
        redis.call('ZADD', KEYS[4], now + tonumber(ARGV[5]), ticket)
        return 1
    end
    return 0
elseif op == 'discard' then
    redis.call('ZREM', KEYS[1], ticket)
    redis.call('ZREM', KEYS[2], ticket)
elseif op == 'release' then
    redis.call('ZREM', KEYS[4], ticket)
end
return {redis.call('ZCARD', KEYS[1]), redis.call('ZCARD', KEYS[4]), redis.call('ZCARD', KEYS[3])}
'''


class RedisBroker:
    def __init__(self, url: str, namespace: str = 'winmate-llm', *, client=None, window=WINDOW_SECONDS):
        if client is None:
            import redis
            client = redis.Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1,
                                          retry_on_timeout=False)
        self.client, self.window = client, window
        prefix = '{' + namespace + '}'
        self.keys = [prefix + ':' + k for k in ('waiting', 'heartbeats', 'starts', 'active', 'sequence')]

    def _run(self, op, ticket='', rpm=MAX_RPM, concurrency=4, lease_seconds=90):
        return self.client.eval(_REDIS_SCRIPT, len(self.keys), *self.keys, op, ticket,
                                min(MAX_RPM, rpm), concurrency, lease_seconds, self.window)

    def enqueue(self, ticket): self._run('enqueue', ticket)
    def claim(self, ticket, rpm, concurrency, lease_seconds):
        result = self._run('claim', ticket, rpm, concurrency, lease_seconds)
        if result == -1:
            raise QueueError('upstream_unavailable')
        return result == 1
    def discard(self, ticket): self._run('discard', ticket)
    def release(self, ticket): self._run('release', ticket)
    def snapshot(self):
        queued, active, starts = self._run('view')
        return {'backend': 'redis', 'queued': queued, 'active': active,
                'starts_last_minute': starts, 'max_rpm': MAX_RPM}


class CallQueue:
    def __init__(self, broker: Broker, *, rpm=MAX_RPM, concurrency=4, timeout=600, lease_seconds=90):
        self.broker = broker
        self.rpm = max(1, min(MAX_RPM, rpm))
        self.concurrency, self.timeout, self.lease_seconds = concurrency, timeout, lease_seconds

    def acquire(self, cancel: Optional[Callable[[], bool]] = None, *, timeout=None):
        ticket = uuid.uuid4().hex
        end = time.monotonic() + (self.timeout if timeout is None else timeout)
        enqueued = False
        try:
            while True:
                if cancel and cancel():
                    raise QueueError('cancelled')
                if time.monotonic() >= end:
                    raise QueueError('timeout')
                try:
                    if not enqueued:
                        self.broker.enqueue(ticket)
                        enqueued = True
                    if self.broker.claim(ticket, self.rpm, self.concurrency, self.lease_seconds):
                        return ticket
                except QueueBusy:
                    pass
                time.sleep(min(.05, max(0, end - time.monotonic())))
        except BaseException as exc:
            for action in ('discard', 'release'):
                try:
                    getattr(self.broker, action)(ticket)
                except Exception:
                    pass
            if isinstance(exc, QueueError) or not isinstance(exc, Exception):
                raise
            # Broker details can contain passwords/URLs. Fail closed, with no details.
            raise QueueError('upstream_unavailable') from None

    def release(self, ticket):
        try:
            self.broker.release(ticket)
        except Exception:
            # A failed release must not hide a completed response. The lease expires.
            pass

    def snapshot(self):
        try:
            return {**self.broker.snapshot(), 'rpm': self.rpm, 'concurrency': self.concurrency}
        except Exception:
            return {'backend': type(self.broker).__name__, 'available': False, 'max_rpm': MAX_RPM}


def create_queue(settings) -> CallQueue:
    broker = (RedisBroker(settings.queue_redis_url, settings.queue_namespace)
              if settings.queue_backend == 'redis' else SQLiteBroker(settings.queue_db))
    return CallQueue(broker, rpm=settings.rpm, concurrency=settings.concurrency,
                     timeout=settings.queue_timeout, lease_seconds=settings.timeout + 30)
