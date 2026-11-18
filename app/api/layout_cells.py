"""칸 설계 — per layout, what each writable cell is for (app/data/layout_cells.json).

The writer does not see a layout's sample wording (it belonged to another customer); before this, most cells reached it as their
geometric role only ('text', 'heading'), so it guessed what each cell was for and cells shifted (a place name in a '과제 01' label,
a title in a description cell, '제안/협의' in a criteria cell). The design names each cell's job, per layout:

  say      what the sheet says — the default sheet directive
  split    write it element by element (overrides the geometric guess, layout_elements)
  element  the default element directive when split
  cells    {i: {role, keep, num}}
           role  what the cell holds for this customer and its form ('과제 제목 — 이 공간의 불편을 고객 체감으로 한 줄')
           keep  a structural label kept exactly as authored ('과제 01', 'STEP 1', '도입 전')
           num   a figure-only cell: a stated number or nothing

Content candidates (variantOf) share their representative's design.
"""
from __future__ import annotations

from functools import lru_cache
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def path() -> Path:
    return Path(os.environ.get('WINMATE_LAYOUT_CELLS', ROOT / 'app/data/layout_cells.json'))


@lru_cache(maxsize=2)
def _read(name: str, stamp: int) -> dict:
    data = json.loads(Path(name).read_text(encoding='utf-8'))
    return data if isinstance(data, dict) else {}


def designs() -> dict:
    p = path()
    try:
        return _read(str(p), p.stat().st_mtime_ns)
    except (FileNotFoundError, ValueError):
        return {}


@lru_cache(maxsize=1)
def _variants(stamp: int) -> dict:
    from . import layout_library as live
    try:
        _, layouts, _ = live.base()
    except Exception:  # noqa: BLE001 — no KB: designs by their own id only
        return {}
    return {f: m['variantOf'] for f, m in layouts.items() if m.get('variantOf')}


def _rep(f: str) -> str:
    try:
        stamp = (ROOT / 'app/data/runtime/kb/catalog.json').stat().st_mtime_ns
    except FileNotFoundError:
        stamp = 0
    return _variants(stamp).get(f) or f


def base_design(f: str) -> dict:
    """the shipped design (app/data/layout_cells.json) of this layout or its representative"""
    d = designs()
    return d.get(f) or d.get(_rep(f)) or {}


def design(f: str) -> dict:
    """the shipped design with the admin's cell edits (레이아웃 관리 → 흐름 → 칸 설계, stored with the flows)"""
    base = base_design(f)
    try:
        from . import layout_flows
        over = ((layout_flows.load().get('cells') or {}).get(_rep(f)) or {}).get('cells') or {}
    except (ValueError, OSError):
        over = {}
    if not over:
        return base
    return {**base, 'cells': {**(base.get('cells') or {}), **over}}


def cell(f: str, i) -> dict:
    return (design(f).get('cells') or {}).get(str(i)) or {}
