"""Resource on/off shared by admin, the app and the agents.

The admin 데이터 소스 screen turns individual resources (a product, a solution, a case, a layout,
a Best Scenario, a picture) off for the web app. Off works like a product's 판매 종료 or a deleted
layout: the resource leaves every list the app offers for new choices (탐색기 · @태그 · 추천 · 검색 ·
사진 고르기) and the agents' candidate lists, while proposals that already hold it keep drawing it.

One JSON document (``app/data/runtime/resource_switches.json``) is the whole state; it holds only
what is off. Asset ids are the admin's (``<kind>:<ref>``) so the app never needs the admin DB.
"""
from __future__ import annotations

from datetime import datetime, timezone
import fcntl
from functools import lru_cache
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[2]
# Kinds the app and the agents actually choose by id. Others (분류 · 카탈로그 권 · 원본 파일 · 공간 에셋 …)
# are inputs of builds, not something the app picks, so a switch on them would not change anything.
KINDS = ('product', 'solution', 'case', 'layout', 'scenario', 'image')
MAX_BATCH = 10000  # 한 소스의 한 종류 전체(이미지 5천여 장)를 한 번에 끌 수 있게


def path() -> Path:
    return Path(os.environ.get('WINMATE_RESOURCE_SWITCHES', ROOT / 'app/data/runtime/resource_switches.json'))


def split(asset_id: str):
    kind, _, ref = str(asset_id).partition(':')
    return kind, ref


def switchable(asset_id: str) -> bool:
    kind, ref = split(asset_id)
    return kind in KINDS and bool(ref)


@lru_cache(maxsize=8)
def _read(name, stamp, size):
    value = json.loads(Path(name).read_text(encoding='utf-8'))
    if not isinstance(value, dict) or value.get('v') != 1 or not isinstance(value.get('off'), dict):
        raise ValueError('자원 사용 설정 파일을 읽지 못했습니다.')
    return value


def load() -> dict:
    file = path()
    try:
        stat = file.stat()
    except FileNotFoundError:
        return {'v': 1, 'rev': 0, 'off': {}}
    return _read(str(file), stat.st_mtime_ns, stat.st_size)


def revision() -> int:
    return int(load().get('rev', 0))


def off_refs(kind: str) -> set:
    """refs (product id · layout f · picture id …) of one kind that are off."""
    return {split(key)[1] for key in load()['off'] if split(key)[0] == kind}


def public() -> dict:
    """What the browser needs — refs by kind (bootstrap ``resource_switches``)."""
    state = load()
    off = {kind: [] for kind in KINDS}
    for key in state['off']:
        kind, ref = split(key)
        if kind in off:
            off[kind].append(ref)
    return {'rev': state.get('rev', 0), 'off': {k: sorted(v) for k, v in off.items() if v}}


def is_off(asset_id: str) -> bool:
    return asset_id in load()['off']


def apply(items, on: bool, actor: str = 'admin', reason: str = '') -> dict:
    """Turn assets on/off. ``items`` = [{'id', 'title'?}]; unknown kinds are rejected, not ignored."""
    items = list(items)
    if not items:
        raise ValueError('바꿀 자원을 골라 주세요.')
    if len(items) > MAX_BATCH:
        raise ValueError(f'한 번에 {MAX_BATCH}개까지 바꿀 수 있습니다.')
    for item in items:
        if not switchable(item.get('id', '')):
            raise ValueError('앱에서 켜고 끌 수 없는 자원이 섞여 있습니다: ' + str(item.get('id', ''))[:120])
    target = path()
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.with_suffix('.lock').open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            state = json.loads(target.read_text(encoding='utf-8')) if target.is_file() else {'v': 1, 'rev': 0, 'off': {}}
        except ValueError as exc:
            raise ValueError('자원 사용 설정 파일을 읽지 못했습니다.') from exc
        off = dict(state.get('off') or {})
        at = datetime.now(timezone.utc).isoformat()
        changed = []
        for item in items:
            key = item['id']
            if on and key in off:
                off.pop(key); changed.append(key)
            elif not on and key not in off:
                off[key] = {'at': at, 'by': actor, 'title': str(item.get('title') or '')[:200], **({'reason': reason[:300]} if reason else {})}
                changed.append(key)
        if changed:
            state = {'v': 1, 'rev': int(state.get('rev', 0)) + 1, 'off': off}
            fd, tmp = tempfile.mkstemp(dir=target.parent, prefix='.resource_switches.', suffix='.tmp')
            with os.fdopen(fd, 'w', encoding='utf-8') as out:
                json.dump(state, out, ensure_ascii=False, separators=(',', ':'))
            os.replace(tmp, target)
        return {'rev': state.get('rev', 0), 'changed': changed, 'off_total': len(off)}


# ---------------------------------------------------------------- agents (정본 KB)
def _mark(rows, refs, key='id'):
    """copies of rows, with ``off`` set on the ones that are off (lists filter on it; id maps keep them)."""
    return [dict(r, off=True) if str(r.get(key)) in refs else r for r in rows]


def image_refs(root=ROOT):
    """Picture IDs and renderable addresses disabled in the shared image library."""
    refs = off_refs('image')
    if not refs:
        return set(), set()
    pids = {r[4:] for r in refs if r.startswith('app/')}
    addresses = {r.removeprefix('composer/') for r in refs if r.startswith('composer/')}
    if pids:
        try:
            pictures = json.loads((Path(root) / 'app/data/images.json').read_text(encoding='utf-8')).get('pids', {})
        except (OSError, ValueError):
            pictures = {}
        addresses.update(pictures[p]['file'] for p in pids if pictures.get(p, {}).get('file'))
    library = {r for r in refs if not r.startswith(('app/', 'composer/'))}
    if library:
        try:
            index = json.loads((Path(root) / 'img/lib/index.json').read_text(encoding='utf-8')).get('images', [])
        except (OSError, ValueError):
            index = []
        for im in index:
            if im.get('i') in library and im.get('a'):
                addresses.add(im['a'])
    return pids, addresses


def overlay_bundle(bundle):
    """Mark off resources in the KB bundle: layouts retire like a deleted layout, rows get ``off``."""
    state = load()
    if not state['off']:
        return bundle
    from dataclasses import replace
    products, solutions, cases = off_refs('product'), off_refs('solution'), off_refs('case')
    layouts, scenarios = off_refs('layout'), off_refs('scenario')
    catalog = dict(bundle.catalog)
    catalog['products'] = _mark(catalog.get('products', []), products)
    catalog['curated_product_ids'] = [i for i in catalog.get('curated_product_ids', []) if i not in products]
    catalog['solutions'] = _mark(catalog.get('solutions', []), solutions)
    catalog['cases'] = _mark(catalog.get('cases', []), cases)
    catalog['layouts'] = [dict(m, removed=True, retired='removed', off=True) if m.get('f') in layouts else m for m in catalog.get('layouts', [])]
    hidden = {f: dict(m, removed=True, retired='removed', off=True) if f in layouts else m for f, m in bundle.hidden_layouts.items()}
    sc = dict(bundle.scenarios)
    if isinstance(sc.get('SCENARIOS'), list):
        sc['SCENARIOS'] = _mark(sc['SCENARIOS'], scenarios)
    return replace(bundle, catalog=catalog, hidden_layouts=hidden, scenarios=sc,
                   manifest={**bundle.manifest, 'resource_switch_rev': state.get('rev', 0)})


def live(rows):
    """a list without the rows marked off (maps built from the full list keep resolving saved ids)."""
    return [r for r in rows if not (isinstance(r, dict) and r.get('off'))]
