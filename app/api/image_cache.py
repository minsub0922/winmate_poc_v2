"""Bounded cache for heavy images (3D 조감도 previews first).

Two-level design used by :mod:`app.api.spatial_previews`:

* L1 — this module. A dedicated **cache Redis** (``WINMATE_CACHE_REDIS_URL``) that the server configures with
  ``maxmemory`` (default and upper bound 3gb) and an evicting policy (``allkeys-lru``) at startup. It is never the LLM
  queue Redis: that one must stay ``noeviction`` and persistent (``app/compose.llm.yml``), so the same endpoint is
  refused. Without a cache Redis the server uses a small in-process LRU (``WINMATE_CACHE_MEMORY_MAX_BYTES``).
* L2 — the caller's durable files under ``app/data/runtime``. Evicted or expired entries are refilled from there.

Redis failures never fail a request: the cache reports a miss, stays down for a short back-off and the caller reads L2.
Values are raw bytes; callers choose content-addressed keys, so an entry is never stale — only evicted.
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, field
import logging
import re
import threading
import time
from typing import Any, Dict, Mapping, Optional, Tuple
from urllib.parse import urlsplit

from .runtime_env import env_values, flag, parse_int, parse_size

log = logging.getLogger('winmate.cache')

GiB = 1024 ** 3
DEFAULT_REDIS_VERSION = '7.4.2'
MAX_REDIS_MEMORY = 3 * GiB                 # requested ceiling: the image cache never grows beyond ~3 GB of RAM
EVICTING_POLICIES = ('allkeys-lru', 'allkeys-lfu', 'volatile-lru', 'volatile-lfu', 'volatile-ttl', 'allkeys-random', 'volatile-random')


@dataclass(frozen=True)
class CacheConfig:
    backend: str = 'memory'                 # redis | memory | off
    redis_url: str = field(default='', repr=False)
    namespace: str = 'winmate-cache'
    maxmemory: int = MAX_REDIS_MEMORY
    policy: str = 'allkeys-lru'
    manage: bool = True                     # apply maxmemory/policy with CONFIG SET at startup
    ttl: int = 7 * 24 * 3600
    max_item: int = 8 * 1024 * 1024
    memory_limit: int = 256 * 1024 * 1024
    timeout: float = 0.25
    llm_redis_url: str = field(default='', repr=False)
    redis_version: str = DEFAULT_REDIS_VERSION   # Docker image tag / npm build of cache_redis.sh (not used by the client)
    warnings: Tuple[str, ...] = ()

    def public(self) -> dict:
        host = urlsplit(self.redis_url) if self.redis_url else None
        return {'backend': self.backend, 'namespace': self.namespace, 'maxmemory_bytes': self.maxmemory, 'policy': self.policy,
                'ttl_s': self.ttl, 'max_item_bytes': self.max_item, 'memory_limit_bytes': self.memory_limit,
                'redis_endpoint': f'{host.hostname}:{host.port or 6379}/{(host.path or "/0").lstrip("/") or "0"}' if host else None,
                'warnings': list(self.warnings)}


def load_cache_config(environ: Optional[Mapping[str, str]] = None) -> CacheConfig:
    values = env_values(environ)
    warnings = []
    url = values.get('WINMATE_CACHE_REDIS_URL', '').strip()
    backend = values.get('WINMATE_CACHE_BACKEND', '').strip().lower() or ('redis' if url else 'memory')
    if backend not in ('redis', 'memory', 'off'):
        warnings.append(f'WINMATE_CACHE_BACKEND={backend!r}는 지원하지 않아 memory를 사용합니다.')
        backend = 'memory'
    if backend == 'redis' and not url:
        warnings.append('WINMATE_CACHE_BACKEND=redis이지만 WINMATE_CACHE_REDIS_URL이 없어 memory를 사용합니다.')
        backend = 'memory'
    requested = parse_size(values.get('WINMATE_CACHE_REDIS_MAXMEMORY', '3gb'), MAX_REDIS_MEMORY)
    maxmemory = min(max(requested, 64 * 1024 * 1024), MAX_REDIS_MEMORY)
    if requested > MAX_REDIS_MEMORY:
        warnings.append('WINMATE_CACHE_REDIS_MAXMEMORY는 3gb를 넘을 수 없어 3gb로 제한합니다.')
    policy = values.get('WINMATE_CACHE_REDIS_POLICY', 'allkeys-lru').strip().lower() or 'allkeys-lru'
    if policy not in EVICTING_POLICIES:
        warnings.append(f'WINMATE_CACHE_REDIS_POLICY={policy!r}는 축출 정책이 아니어서 allkeys-lru를 사용합니다.')
        policy = 'allkeys-lru'
    version = values.get('WINMATE_CACHE_REDIS_VERSION', '').strip() or DEFAULT_REDIS_VERSION
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        warnings.append(f'WINMATE_CACHE_REDIS_VERSION={version!r}는 x.y.z 형식이 아니어서 {DEFAULT_REDIS_VERSION}를 사용합니다.')
        version = DEFAULT_REDIS_VERSION
    return CacheConfig(
        backend=backend, redis_url=url, namespace=values.get('WINMATE_CACHE_NAMESPACE', 'winmate-cache').strip() or 'winmate-cache',
        maxmemory=maxmemory, policy=policy, manage=flag(values.get('WINMATE_CACHE_REDIS_MANAGE'), True),
        ttl=parse_int(values.get('WINMATE_CACHE_TTL', ''), 7 * 24 * 3600, 60, 365 * 24 * 3600),
        max_item=parse_size(values.get('WINMATE_CACHE_MAX_ITEM_BYTES', ''), 8 * 1024 * 1024),
        memory_limit=parse_size(values.get('WINMATE_CACHE_MEMORY_MAX_BYTES', ''), 256 * 1024 * 1024),
        llm_redis_url=values.get('WINMATE_LLM_REDIS_URL', '') if values.get('WINMATE_LLM_QUEUE_BACKEND', '').strip().lower() == 'redis' else '',
        redis_version=version, warnings=tuple(warnings))


class _Stats:
    def __init__(self):
        self.lock = threading.Lock()
        self.values: Dict[str, int] = {'hits': 0, 'misses': 0, 'sets': 0, 'skipped_large': 0, 'errors': 0}

    def add(self, key: str, amount: int = 1):
        with self.lock:
            self.values[key] = self.values.get(key, 0) + amount

    def snapshot(self) -> Dict[str, int]:
        with self.lock:
            return dict(self.values)


class NullCache:
    kind = 'off'

    def __init__(self, config: CacheConfig = CacheConfig(backend='off')):
        self.config = config
        self.stats = _Stats()

    def start(self) -> None:
        return None

    def get(self, key: str) -> Optional[bytes]:
        self.stats.add('misses')
        return None

    def set(self, key: str, value: bytes, ttl: Optional[int] = None) -> bool:
        return False

    def delete(self, key: str) -> None:
        return None

    def status(self) -> dict:
        return {'kind': self.kind, 'ready': True, **self.stats.snapshot(), 'config': self.config.public()}

    def close(self) -> None:
        return None


class MemoryCache(NullCache):
    """Process-local LRU bounded by total bytes (fallback when no cache Redis is configured)."""
    kind = 'memory'

    def __init__(self, config: CacheConfig = CacheConfig()):
        super().__init__(config)
        self.items: 'OrderedDict[str, Tuple[bytes, float]]' = OrderedDict()
        self.bytes = 0
        self.lock = threading.Lock()

    def get(self, key: str) -> Optional[bytes]:
        now = time.monotonic()
        with self.lock:
            item = self.items.get(key)
            if item and item[1] > now:
                self.items.move_to_end(key)
                self.stats.add('hits')
                return item[0]
            if item:
                self._drop(key)
        self.stats.add('misses')
        return None

    def _drop(self, key: str) -> None:
        value, _ = self.items.pop(key)
        self.bytes -= len(value)

    def set(self, key: str, value: bytes, ttl: Optional[int] = None) -> bool:
        if not value or len(value) > min(self.config.max_item, self.config.memory_limit):
            self.stats.add('skipped_large')
            return False
        with self.lock:
            if key in self.items:
                self._drop(key)
            self.items[key] = (bytes(value), time.monotonic() + (ttl or self.config.ttl))
            self.bytes += len(value)
            while self.bytes > self.config.memory_limit and self.items:
                self._drop(next(iter(self.items)))
        self.stats.add('sets')
        return True

    def delete(self, key: str) -> None:
        with self.lock:
            if key in self.items:
                self._drop(key)

    def status(self) -> dict:
        with self.lock:
            used, count = self.bytes, len(self.items)
        return {**super().status(), 'used_bytes': used, 'entries': count, 'limit_bytes': self.config.memory_limit}


def _endpoint(url: str) -> Optional[Tuple[str, int]]:
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if not parts.hostname:
        return None
    host = parts.hostname.lower()
    host = '127.0.0.1' if host in ('localhost', '::1') else host
    return host, parts.port or 6379


class RedisCache(NullCache):
    """Cache Redis with an enforced memory ceiling and evicting policy. Failures degrade to misses."""
    kind = 'redis'
    BACKOFF = 15.0

    def __init__(self, config: CacheConfig, client: Any = None):
        super().__init__(config)
        self.client = client
        self.ready = False
        self.reason = 'not started'
        self.down_until = 0.0
        self.server: Dict[str, Any] = {}

    def _connect(self):
        if self.client is None:
            import redis
            self.client = redis.Redis.from_url(self.config.redis_url, socket_timeout=self.config.timeout,
                                               socket_connect_timeout=self.config.timeout, health_check_interval=30)
        return self.client

    def start(self) -> None:
        """Verify (and, when allowed, apply) maxmemory + policy. An unbounded or non-evicting Redis is never filled."""
        mine, llm = _endpoint(self.config.redis_url), _endpoint(self.config.llm_redis_url) if self.config.llm_redis_url else None
        if mine and llm and mine == llm:
            self.ready, self.reason = False, 'LLM 큐 Redis(noeviction)와 같은 인스턴스라 이미지 캐시로 쓰지 않습니다.'
            log.warning('cache: %s', self.reason)
            return
        try:
            client = self._connect()
            client.ping()
            if self.config.manage:
                try:
                    client.config_set('maxmemory', str(self.config.maxmemory))
                    client.config_set('maxmemory-policy', self.config.policy)
                except Exception as exc:  # managed Redis may disable CONFIG; verify below
                    log.warning('cache: CONFIG SET을 쓸 수 없어 현재 설정을 확인만 합니다 (%s)', type(exc).__name__)
            current = client.config_get('maxmemory*')
            maxmemory = int(current.get('maxmemory', current.get(b'maxmemory', 0)) or 0)
            policy = current.get('maxmemory-policy', current.get(b'maxmemory-policy', b'noeviction'))
            policy = policy.decode() if isinstance(policy, bytes) else str(policy)
            self.server = {'maxmemory_bytes': maxmemory, 'policy': policy}
            if not 0 < maxmemory <= self.config.maxmemory:
                self.ready, self.reason = False, f'Redis maxmemory({maxmemory})가 0이거나 상한({self.config.maxmemory})보다 큽니다.'
            elif policy not in EVICTING_POLICIES:
                self.ready, self.reason = False, f'Redis maxmemory-policy({policy})가 축출 정책이 아닙니다.'
            else:
                self.ready, self.reason = True, ''
        except Exception as exc:
            self.ready, self.reason = False, f'캐시 Redis에 연결하지 못했습니다 ({type(exc).__name__}).'
        if not self.ready:
            log.warning('cache: %s', self.reason)

    def _key(self, key: str) -> str:
        return f'{self.config.namespace}:{key}'

    def _available(self) -> bool:
        return self.ready and time.monotonic() >= self.down_until

    def _failed(self, exc: Exception) -> None:
        self.stats.add('errors')
        self.down_until = time.monotonic() + self.BACKOFF
        log.warning('cache: Redis 오류로 %.0f초 동안 캐시를 건너뜁니다 (%s)', self.BACKOFF, type(exc).__name__)

    def get(self, key: str) -> Optional[bytes]:
        if not self._available():
            self.stats.add('misses')
            return None
        try:
            value = self.client.get(self._key(key))
        except Exception as exc:
            self._failed(exc)
            value = None
        self.stats.add('hits' if value else 'misses')
        return value

    def set(self, key: str, value: bytes, ttl: Optional[int] = None) -> bool:
        if not value or len(value) > self.config.max_item:
            self.stats.add('skipped_large')
            return False
        if not self._available():
            return False
        try:
            self.client.set(self._key(key), value, ex=ttl or self.config.ttl)
        except Exception as exc:
            self._failed(exc)
            return False
        self.stats.add('sets')
        return True

    def delete(self, key: str) -> None:
        if self._available():
            try:
                self.client.delete(self._key(key))
            except Exception as exc:
                self._failed(exc)

    def status(self) -> dict:
        out = {**super().status(), 'ready': self.ready, 'reason': self.reason or None, 'server': dict(self.server)}
        if self._available():
            try:
                memory, stats = self.client.info('memory'), self.client.info('stats')
                out['server'].update(used_memory_bytes=memory.get('used_memory'), evicted_keys=stats.get('evicted_keys'),
                                     keyspace_hits=stats.get('keyspace_hits'), keyspace_misses=stats.get('keyspace_misses'))
            except Exception as exc:
                self._failed(exc)
        return out

    def close(self) -> None:
        try:
            if self.client is not None:
                self.client.close()
        except Exception:
            pass


class FallbackCache(NullCache):
    """Redis when it is safe and reachable, otherwise the bounded memory LRU (never an unbounded store).

    A cache Redis started after the API (``bash app/scripts/cache_redis.sh up``) is picked up within ``RETRY`` seconds.
    """
    RETRY = 60.0

    def __init__(self, primary: RedisCache, fallback: MemoryCache):
        super().__init__(primary.config)
        self.primary, self.fallback = primary, fallback
        self.stopped = threading.Event()
        self.retrying: Optional[threading.Thread] = None

    @property
    def kind(self) -> str:  # type: ignore[override]
        return 'redis' if self.primary.ready else 'memory'

    def _active(self):
        return self.primary if self.primary._available() else self.fallback

    def start(self) -> None:
        self.primary.start()
        if not self.primary.ready and self.retrying is None and 'LLM' not in self.primary.reason:
            self.retrying = threading.Thread(target=self._retry, name='winmate-cache-redis-retry', daemon=True)
            self.retrying.start()

    def _retry(self) -> None:
        while not self.stopped.wait(self.RETRY) and not self.primary.ready:
            self.primary.start()
            if self.primary.ready:
                log.info('cache: 이미지 캐시 Redis에 연결했습니다.')

    def get(self, key: str) -> Optional[bytes]:
        return self._active().get(key)

    def set(self, key: str, value: bytes, ttl: Optional[int] = None) -> bool:
        return self._active().set(key, value, ttl)

    def delete(self, key: str) -> None:
        self.primary.delete(key)
        self.fallback.delete(key)

    def status(self) -> dict:
        return {'kind': self.kind, 'redis': self.primary.status(), 'memory': self.fallback.status(), 'config': self.config.public()}

    def close(self) -> None:
        self.stopped.set()
        self.primary.close()


def build_cache(config: Optional[CacheConfig] = None, client: Any = None) -> NullCache:
    config = config or load_cache_config()
    for warning in config.warnings:
        log.warning('cache: %s', warning)
    if config.backend == 'off':
        return NullCache(config)
    if config.backend == 'memory':
        return MemoryCache(config)
    return FallbackCache(RedisCache(config, client), MemoryCache(config))
