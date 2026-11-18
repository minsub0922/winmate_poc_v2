"""Ports and bind addresses: the root .env.example is the only place that holds the defaults."""
import os
import re
import subprocess
from pathlib import Path

import pytest

from app.api import runtime_env

ROOT = Path(__file__).resolve().parents[2]
# every port / bind variable the start scripts and tools read
KEYS = ('WINMATE_BIND_HOST', 'WINMATE_API_PORT', 'WINMATE_WEB_PORT', 'LLM_REDIS_BIND', 'LLM_REDIS_PORT', 'TESTBENCH_HOST',
        'TESTBENCH_PORT', 'CLEF_HOST', 'CLEF_PORT', 'OPS_BIND', 'LANGFUSE_PORT', 'METABASE_PORT', 'SPATIAL_EXAMPLE_PREVIEW_PORT',
        'SPATIAL_PREVIEW_PORT', 'SPATIAL_PEOPLE_REVIEW_PORT', 'SPATIAL_DENSITY_REVIEW_PORT', 'SPATIAL_PURPOSE_REVIEW_PORT',
        'SPATIAL_ALL_ROOMS_REVIEW_PORT', 'SPATIAL_CHARACTER_REVIEW_PORT')
SOURCES = ('start.sh', 'Makefile', 'app/start.sh', 'app/compose.llm.yml', 'app/web/vite.config.js', 'app/api/main.py', 'admin/start.sh',
           'ops/start.sh', 'poc/test/testbench/start.sh', 'poc/test/testbench/stop.command', 'poc/test/testbench/server.py',
           'clef-flash/config.env', 'clef-flash/common.sh', 'clef-flash/bench.py',
           *(str(p.relative_to(ROOT)) for p in sorted((ROOT / 'app/scripts').glob('*')) if p.suffix in ('.sh', '.py', '.mjs')))


def _example():
    return runtime_env._parse(ROOT / '.env.example')


def _shell(key, env=None):
    clean = {k: v for k, v in os.environ.items() if k not in KEYS}
    return subprocess.run(['/bin/bash', '-euo', 'pipefail', '-c', f'. app/scripts/ports.sh; winmate_env {key}; printf %s "${key}"'],
                          cwd=ROOT, env={**clean, **(env or {})}, capture_output=True, text=True)


def test_env_example_holds_every_port_and_bind_default():
    example = _example()
    for key in KEYS:
        assert example.get(key), key
        if key.endswith('_PORT'):
            assert 1 <= int(example[key]) <= 65535, key
    ports = [example[k] for k in KEYS if k.endswith('_PORT')]
    assert len(set(ports)) == len(ports), 'default ports must not collide'


def test_no_port_default_is_hardcoded_outside_env_example():
    """Scripts read the variables through the loaders; a `${X_PORT:-1234}` / `X_PORT || 1234` / `get('X_PORT', '1234')` fallback
    would silently diverge from .env.example."""
    fallback = re.compile(r'''(?:_PORT|_HOST|_BIND)["']?\s*(?::-|\|\||,)\s*["']?(?:\d{2,5}|127\.0\.0\.1)\b''')
    for rel in SOURCES:
        path = ROOT / rel
        if path.exists():
            assert not fallback.search(path.read_text(encoding='utf-8')), rel


def test_loaders_agree_and_follow_environment_then_env_example():
    if (ROOT / '.env').exists() and any(k in runtime_env._parse(ROOT / '.env') for k in KEYS):
        pytest.skip('local .env overrides a port')
    example = _example()
    clean = {k: v for k, v in os.environ.items() if k not in KEYS}
    for key in ('WINMATE_API_PORT', 'WINMATE_BIND_HOST', 'CLEF_PORT'):
        assert runtime_env.port_value(key, clean) == example[key]
        result = _shell(key)
        assert (result.returncode, result.stdout) == (0, example[key]), result.stderr
    assert runtime_env.port_value('WINMATE_API_PORT', {'WINMATE_API_PORT': '9001'}) == '9001'
    assert _shell('WINMATE_API_PORT', {'WINMATE_API_PORT': '9001'}).stdout == '9001'
    assert _shell('WINMATE_API_PORT', {'WINMATE_API_PORT': '70000'}).returncode != 0
    with pytest.raises(RuntimeError):
        runtime_env.port_value('WINMATE_API_PORT', {'WINMATE_API_PORT': 'abc'})
