"""경로 · 환경 설정. 표준 라이브러리만 사용 (Python 3.9+)."""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Dict

HERE = Path(__file__).resolve().parent            # poc/test/proposal_score
TEST = HERE.parent                                # poc/test
POC = TEST.parent                                 # poc
APP_ROOT = POC.parent                             # winmatev2

CRITERIA_DIR = HERE / 'criteria'
RUBRICS_PATH = CRITERIA_DIR / 'rubrics.json'
CRITERIA_PATH = CRITERIA_DIR / 'criteria.json'
APP_CRITERIA_JS = APP_ROOT / 'src' / 'review' / 'criteria.js'
TAXONOMY_PATH = HERE / 'taxonomy' / 'taxonomy.json'
DATA_DIR = HERE / 'data'
BEST_PATH = DATA_DIR / 'best_scenarios.json'
CATALOG_PATH = APP_ROOT / 'data' / 'catalog.json'
RESULTS_DIR = HERE / 'results'
CACHE_DIR = RESULTS_DIR / 'cache'

DEFAULT_MODEL = 'gemini-3.1-flash-lite'


def load_env(path: Path | None = None) -> Dict[str, str]:
    """poc/.env 를 읽어 os.environ 보다 낮은 우선순위로 합친다(값은 출력하지 않음)."""
    path = path or (POC / '.env')
    env: Dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$', line)
            if m and not line.lstrip().startswith('#'):
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    for k in ('GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_BASE_URL'):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env
