"""Shared paths for the 업종별 표준 제안서 generator (app/scripts/vertical_standard)."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
# intermediate files (layout schema, floor plans, baked floors) — under the git-ignored output/ folder
OUT = os.path.join(ROOT, 'output', 'vertical-standard')
os.makedirs(OUT, exist_ok=True)
