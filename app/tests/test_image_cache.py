"""Image cache: 3gb ceiling, evicting policy, LLM-queue isolation, graceful Redis failure and memory fallback."""
import os
import shutil
import socket
import subprocess
import time
import uuid

import pytest

from app.api.image_cache import (CacheConfig, FallbackCache, MAX_REDIS_MEMORY, MemoryCache, RedisCache, build_cache,
                                 load_cache_config)

ISOLATED = {'WINMATE_ENV_FILES': 'none'}


class FakeRedis:
    """Enough of redis-py for the cache contract (no network)."""

    def __init__(self, config=None, allow_config=True, fail=False):
        self.data, self.config = {}, dict(config or {'maxmemory': '0', 'maxmemory-policy': 'noeviction'})
        self.allow_config, self.fail, self.calls = allow_config, fail, []

    def _check(self):
        if self.fail:
            raise ConnectionError('redis://user:secret@example.test')

    def ping(self):
        self._check(); return True

    def config_set(self, key, value):
        self._check()
        if not self.allow_config:
            raise PermissionError('CONFIG disabled')
        self.config[key] = str(value)

    def config_get(self, pattern):
        self._check(); return dict(self.config)

    def get(self, key):
        self._check(); self.calls.append(('get', key)); return self.data.get(key)

    def set(self, key, value, ex=None):
        self._check(); self.calls.append(('set', key, ex)); self.data[key] = value

    def delete(self, key):
        self.data.pop(key, None)

    def info(self, section):
        return {'used_memory': sum(len(v) for v in self.data.values()), 'evicted_keys': 0}

    def close(self):
        pass


def test_defaults_cap_redis_at_three_gigabytes_with_lru():
    config = load_cache_config({**ISOLATED, 'WINMATE_CACHE_REDIS_URL': 'redis://127.0.0.1:6380/0', 'WINMATE_CACHE_REDIS_MAXMEMORY': '8gb'})
    assert config.backend == 'redis' and config.maxmemory == MAX_REDIS_MEMORY == 3 * 1024 ** 3
    assert config.policy == 'allkeys-lru' and any('3gb' in warning for warning in config.warnings)
    assert load_cache_config({**ISOLATED, 'WINMATE_CACHE_REDIS_URL': 'redis://x', 'WINMATE_CACHE_REDIS_MAXMEMORY': '512mb'}).maxmemory == 512 * 1024 ** 2
    assert load_cache_config({**ISOLATED, 'WINMATE_CACHE_REDIS_URL': 'redis://x', 'WINMATE_CACHE_REDIS_POLICY': 'noeviction'}).policy == 'allkeys-lru'
    assert load_cache_config(ISOLATED).backend == 'memory'
    assert load_cache_config({**ISOLATED, 'WINMATE_CACHE_BACKEND': 'redis'}).backend == 'memory'
    assert 'secret' not in repr(load_cache_config({**ISOLATED, 'WINMATE_CACHE_REDIS_URL': 'redis://:secret@h:1/0'}))


def test_env_file_is_the_reproducible_source(tmp_path):
    env = tmp_path / 'cache.env'
    env.write_text('WINMATE_CACHE_REDIS_URL=redis://127.0.0.1:6390/2\nWINMATE_CACHE_REDIS_MAXMEMORY=1gb\nWINMATE_CACHE_TTL=3600 # 1h\n')
    config = load_cache_config({'WINMATE_ENV_FILES': str(env)})
    assert (config.redis_url, config.maxmemory, config.ttl) == ('redis://127.0.0.1:6390/2', 1024 ** 3, 3600)
    assert config.public()['redis_endpoint'] == '127.0.0.1:6390/2'
    # The process environment still wins over the file.
    assert load_cache_config({'WINMATE_ENV_FILES': str(env), 'WINMATE_CACHE_TTL': '120'}).ttl == 120


def test_startup_applies_ceiling_and_policy_then_caches():
    fake = FakeRedis()
    cache = RedisCache(CacheConfig(backend='redis', redis_url='redis://127.0.0.1:6380/0', namespace='t'), fake)
    cache.start()
    assert cache.ready and fake.config == {'maxmemory': str(MAX_REDIS_MEMORY), 'maxmemory-policy': 'allkeys-lru'}
    assert cache.set('spatial:a', b'webp') and cache.get('spatial:a') == b'webp'
    assert ('set', 't:spatial:a', 7 * 24 * 3600) in fake.calls
    assert not cache.set('big', b'x' * (8 * 1024 * 1024 + 1))
    assert cache.status()['server']['used_memory_bytes'] == 4


def test_never_fills_an_unbounded_or_non_evicting_redis():
    unbounded = RedisCache(CacheConfig(backend='redis', redis_url='redis://h:1/0'), FakeRedis(allow_config=False))
    unbounded.start()
    assert not unbounded.ready and 'maxmemory' in unbounded.reason and not unbounded.set('k', b'v')
    noevict = RedisCache(CacheConfig(backend='redis', redis_url='redis://h:1/0'), FakeRedis({'maxmemory': '1000', 'maxmemory-policy': 'noeviction'}, allow_config=False))
    noevict.start()
    assert not noevict.ready and 'policy' in noevict.reason
    too_big = RedisCache(CacheConfig(backend='redis', redis_url='redis://h:1/0'), FakeRedis({'maxmemory': str(4 * 1024 ** 3), 'maxmemory-policy': 'allkeys-lru'}, allow_config=False))
    too_big.start()
    assert not too_big.ready


def test_llm_queue_redis_is_never_reconfigured():
    fake = FakeRedis()
    cache = RedisCache(CacheConfig(backend='redis', redis_url='redis://localhost:6379/3', llm_redis_url='redis://127.0.0.1:6379/0'), fake)
    cache.start()
    assert not cache.ready and 'LLM' in cache.reason and fake.config['maxmemory-policy'] == 'noeviction'
    config = load_cache_config({**ISOLATED, 'WINMATE_CACHE_REDIS_URL': 'redis://127.0.0.1:6379/3',
                                'WINMATE_LLM_QUEUE_BACKEND': 'redis', 'WINMATE_LLM_REDIS_URL': 'redis://127.0.0.1:6379/0'})
    assert config.llm_redis_url


def test_redis_outage_degrades_to_memory_without_errors():
    fake = FakeRedis()
    cache = build_cache(CacheConfig(backend='redis', redis_url='redis://h:1/0'), fake)
    assert isinstance(cache, FallbackCache)
    cache.start()
    assert cache.kind == 'redis' and cache.set('a', b'1') and fake.data
    fake.fail = True
    assert cache.get('a') is None          # failure → miss, then back-off
    assert cache.set('b', b'2') is True    # back-off routes to the bounded memory LRU
    assert cache.get('b') == b'2' and 'secret' not in str(cache.status())
    assert cache.primary.stats.snapshot()['errors'] == 1


def test_memory_cache_is_bounded_lru_with_ttl():
    cache = MemoryCache(CacheConfig(memory_limit=10, max_item=10, ttl=60))
    for key in 'abc':
        cache.set(key, b'1234')
    assert cache.get('a') is None and cache.get('b') == b'1234' and cache.status()['used_bytes'] == 8
    cache.set('d', b'1234')
    assert cache.get('c') is None and cache.get('b') == b'1234'   # b was used recently, c evicted
    cache.set('short', b'1', ttl=-1)
    assert cache.get('short') is None
    assert not cache.set('huge', b'x' * 11)


@pytest.fixture(scope='module')
def real_redis(tmp_path_factory):
    binary = os.environ.get('WINMATE_TEST_REDIS_SERVER') or shutil.which('redis-server')
    if not binary:
        pytest.skip('real Redis integration: set WINMATE_TEST_REDIS_SERVER or install redis-server')
    redis = pytest.importorskip('redis')
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
    folder = tmp_path_factory.mktemp('cache-redis')
    process = subprocess.Popen([binary, '--port', str(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no', '--dir', str(folder)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f'redis://127.0.0.1:{port}/0'
    try:
        client = redis.Redis.from_url(url)
        for _ in range(100):
            try:
                client.ping(); break
            except redis.RedisError:
                time.sleep(.05)
        yield url
    finally:
        process.terminate(); process.wait(10)


def test_real_redis_enforces_ceiling_and_evicts(real_redis):
    import redis
    config = CacheConfig(backend='redis', redis_url=real_redis, namespace='t-' + uuid.uuid4().hex, maxmemory=64 * 1024 * 1024, max_item=2 * 1024 * 1024)
    cache = RedisCache(config)
    cache.start()
    assert cache.ready, cache.reason
    raw = redis.Redis.from_url(real_redis)
    assert int(raw.config_get('maxmemory')['maxmemory']) == 64 * 1024 * 1024
    assert raw.config_get('maxmemory-policy')['maxmemory-policy'] == 'allkeys-lru'
    block = os.urandom(1024 * 1024)
    for index in range(120):     # 120 MB into a 64 MB cache
        cache.set(f'img:{index}', block)
    info = raw.info()
    assert info['used_memory'] <= 64 * 1024 * 1024 * 1.05 and info['evicted_keys'] > 0
    assert cache.get('img:119') == block


def test_cache_redis_started_later_is_picked_up(monkeypatch):
    fake = FakeRedis(); fake.fail = True
    cache = build_cache(CacheConfig(backend='redis', redis_url='redis://h:1/0'), fake)
    monkeypatch.setattr(FallbackCache, 'RETRY', .05)
    cache.start()
    assert cache.kind == 'memory' and cache.retrying is not None
    fake.fail = False
    for _ in range(100):
        if cache.kind == 'redis':
            break
        time.sleep(.02)
    assert cache.kind == 'redis' and cache.set('later', b'1') and fake.data
    cache.close()


def test_redis_version_is_reproducible_from_env():
    """cache_redis.sh builds (npm) or pulls (Docker) exactly the version the .env names; a malformed one falls back."""
    from app.api.image_cache import DEFAULT_REDIS_VERSION, load_cache_config
    assert load_cache_config({'WINMATE_ENV_FILES': 'none'}).redis_version == DEFAULT_REDIS_VERSION
    assert load_cache_config({'WINMATE_ENV_FILES': 'none', 'WINMATE_CACHE_REDIS_VERSION': '7.2.5'}).redis_version == '7.2.5'
    bad = load_cache_config({'WINMATE_ENV_FILES': 'none', 'WINMATE_CACHE_REDIS_VERSION': 'latest; rm -rf /'})
    assert bad.redis_version == DEFAULT_REDIS_VERSION and any('WINMATE_CACHE_REDIS_VERSION' in w for w in bad.warnings)
