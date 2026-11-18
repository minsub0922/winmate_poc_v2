"""업종별 고정 Overview 시트(``admin/web/src/overview-sheets.json``)가 생성 스크립트의 결과와 같은가.

시트는 고정 내용이라 덱마다 다시 만들지 않는다. 다만 원천(업종 × 공간 × 제품 · 솔루션 DB, 제품 대표 컷, 묶음 이름)이 바뀌면
``app/scripts/vertical_standard/overview_industry.py`` 를 다시 실행해 시트를 맞춰야 한다 — 이 시험이 그때 알려 준다.
구성 · 화면 규칙은 ``admin/tests/overview-sheets.mjs`` · ``overview-industry-ui.mjs`` 가 본다.
"""
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]


def test_overview_sheets_match_the_generator():
    env = {**os.environ, 'PYTHONPATH': os.pathsep.join(p for p in [str(ROOT / 'admin/runtime/python'), os.environ.get('PYTHONPATH', '')] if p)}
    if subprocess.run([sys.executable, '-c', 'import PIL'], env=env, capture_output=True).returncode:
        pytest.skip('Pillow 가 없다(admin/prepare.sh 가 admin/runtime/python 에 설치한다)')
    run = subprocess.run([sys.executable, '-B', str(ROOT / 'app/scripts/vertical_standard/overview_industry.py'), '--check'],
                         cwd=ROOT, env=env, capture_output=True, text=True, timeout=300)
    assert run.returncode == 0, run.stdout + run.stderr
