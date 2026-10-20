"""앱 src/review/criteria.js + criteria/rubrics.json → criteria/criteria.json

사용: python3 -m proposal_score.tools.sync_criteria   (poc/test 에서)
"""
from __future__ import annotations

import json

from .. import config
from ..criteria import build_criteria_json


def main() -> None:
    d = build_criteria_json()
    config.CRITERIA_PATH.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"criteria.json: 분류 {len(d['cats'])} · 기준 {len(d['criteria'])} → {config.CRITERIA_PATH.relative_to(config.TEST)}")


if __name__ == '__main__':
    main()
