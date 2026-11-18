"""Test isolation for server infrastructure settings read from the root .env.

Tests that build the full app must not pre-render 683 templates in the background or fill the developer's cache Redis.
Explicit environment values still win, so a test (or a person) can opt in.

Real-Redis integration tests use ``WINMATE_TEST_REDIS_SERVER``, a ``redis-server`` on PATH, or the binary that
``bash app/scripts/cache_redis.sh install`` built with npm (app/data/runtime/redis-bin/<version>/redis-server).
"""
import os
from pathlib import Path
import shutil

os.environ.setdefault('WINMATE_SPATIAL_PREWARM', 'off')
os.environ.setdefault('WINMATE_CACHE_BACKEND', 'memory')

if not os.environ.get('WINMATE_TEST_REDIS_SERVER') and not shutil.which('redis-server'):
    built = sorted(Path(__file__).resolve().parents[1].joinpath('data/runtime/redis-bin').glob('*/redis-server'))
    if built:
        os.environ['WINMATE_TEST_REDIS_SERVER'] = str(built[-1])
