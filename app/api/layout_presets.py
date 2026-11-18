"""레이아웃 구성(목차 템플릿)의 운영 값 — 관리자 「레이아웃 구성 관리」에서 바꾼 값만 저장한다.

구성의 구조(목차 흐름 · 장)는 ``app/web/src/domain/templates/toc_templates.js`` 가 정본이다. 이 파일은 그 위에 덮는 값만 갖는다::

    { "v": 1, "rev": 3, "fixed": "std", "order": ["std", "stdx", …],
      "items": { "<구성 id>": { "enabled": false, "name": "…", "desc": "…", "hint": "…", "related": ["bs01", …] } },
      "updated_at": "2026-11-16T…Z", "updated_by": "admin" }

- ``fixed``: Storyboard 추천의 첫 칸(기본 구성). 없으면 코드 기본값(표준 제안서).
- ``order``: 전체 구성 보기 · 추천 후보의 순서. 목록에 없는 구성은 코드 순서대로 뒤에 붙는다.
- ``items``: 구성마다 바꾼 값만. 없는 값은 코드 기본값을 쓴다. ``enabled: false`` 면 추천 · 전체 구성에서 뺀다.
- ``rev``: 저장할 때마다 1씩 오른다 — 앱이 이전 값으로 받은 추천을 다시 받는 기준.
- ``parts``: 관리자가 직접 만든 파트(「구성 추가하기」 → 새 파트) — ``{ "cp_…": { name, color, icon, type, sheets: [{ f, label }] } }``.
  간지 다음에 고른 레이아웃을 그 순서대로 쓴다. 색 · 아이콘은 ``app/web/src/domain/templates/part_looks.js`` 의 팔레트 · 에셋 중 하나.
- ``templates``: 관리자가 직접 만든 구성 — ``{ "ct_…": { name, desc, hint, tocs: [목차 키 …], related } }``.
  구성 규칙(Spec ``pspec`` 은 골라 넣는다 — 넣으면 맨 끝에 한 번(사용자 지시 2026-11-16: 고정으로 들어가지 않게) · 파트 4개 이상 · 7개까지 — 구독 솔루션 ``subx`` 가 있으면 8개 · 같은 파트 두 번 없음).
  직접 만든 파트(``cp_…``)는 ``parts`` 에 있어야 한다. 코드 목차 키가 실제로 있는지는 앱이 확인한다(모르는 키가 든 구성은 건너뛴다).
  끄기 · 순서 · 기본 구성은 코드 구성과 같이 ``items`` · ``order`` · ``fixed`` 로 정한다.

앱은 ``/api/bootstrap`` 의 ``layout_presets`` 로 받는다(다음에 앱을 열 때 반영). 구성 id 가 실제로 있는지는 화면(관리자 · 앱)이 확인한다 —
서버는 형식만 검사하고, 앱은 모르는 id 를 건너뛴다.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import threading

ROOT = Path(__file__).resolve().parents[2]
VERSION = 1
TEMPLATE_ID = re.compile(r'[a-z][a-z0-9_]{0,31}')
SCENARIO_ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9_+\-]{0,79}')
TEXT_LIMITS = {'name': 40, 'desc': 300, 'hint': 160}  # 이전 배지(badge) 값은 받아도 버린다 — 저장하면 지워진다(2026-11-16)
MAX_TEMPLATES = 64
MAX_RELATED = 60
# 직접 만든 파트 · 구성 — 앱 custom_compositions.js 와 같은 규칙
PART_ID = re.compile(r'cp_[a-z0-9]{2,24}')
CUSTOM_ID = re.compile(r'ct_[a-z0-9]{2,24}')
LAYOUT_ID = re.compile(r'[A-Za-z0-9_\-]{1,80}')
COLOR = re.compile(r'#[0-9a-f]{6}')
ICON = re.compile(r'pi-[a-z0-9-]{1,30}')
PART_TYPE = re.compile(r'[a-z]{2,20}')
PART_LIMITS = {'name': 24, 'label': 40}
MAX_PARTS = 48
MAX_PART_SHEETS = 20
MAX_CUSTOM = 32
SPEC_KEY, SUB_KEY, MIN_TOCS = 'pspec', 'subx', 4
_lock = threading.Lock()


def path() -> Path:
    return Path(os.environ.get('WINMATE_LAYOUT_PRESETS') or ROOT / 'app/data/runtime/layout_presets.json')


def empty() -> dict:
    return {'v': VERSION, 'rev': 0, 'fixed': None, 'order': [], 'items': {}, 'parts': {}, 'templates': {}, 'updated_at': None, 'updated_by': None}


def _template_id(value, label: str) -> str:
    if not isinstance(value, str) or not TEMPLATE_ID.fullmatch(value):
        raise ValueError(f'{label}의 구성 id 가 올바르지 않습니다.')
    return value


def _text(value, limit: int, label: str) -> str:
    if value is None:
        return ''
    if not isinstance(value, str):
        raise ValueError(f'{label} 값이 올바르지 않습니다.')
    value = re.sub(r'\s+', ' ', value).strip()
    if len(value) > limit:
        raise ValueError(f'{label} 값은 {limit}자까지 쓸 수 있습니다.')
    return value


def _parts(raw) -> dict:
    """직접 만든 파트 — 이름 · 색 · 아이콘 · 유형 · 레이아웃(1~20장)."""
    raw = {} if raw is None else raw
    if not isinstance(raw, dict) or len(raw) > MAX_PARTS:
        raise ValueError('직접 만든 파트 값이 올바르지 않습니다.')
    out = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not PART_ID.fullmatch(key) or not isinstance(value, dict):
            raise ValueError('직접 만든 파트의 id 가 올바르지 않습니다.')
        name = _text(value.get('name'), PART_LIMITS['name'], '파트 이름')
        if not name:
            raise ValueError('파트 이름을 적어 주세요.')
        color, icon, kind = value.get('color'), value.get('icon'), value.get('type')
        if not isinstance(color, str) or not COLOR.fullmatch(color):
            raise ValueError(f'{name} 파트의 색이 올바르지 않습니다.')
        if not isinstance(icon, str) or not ICON.fullmatch(icon):
            raise ValueError(f'{name} 파트의 아이콘이 올바르지 않습니다.')
        if kind is not None and (not isinstance(kind, str) or not PART_TYPE.fullmatch(kind)):
            raise ValueError(f'{name} 파트의 유형이 올바르지 않습니다.')
        sheets = value.get('sheets')
        if not isinstance(sheets, list) or not sheets or len(sheets) > MAX_PART_SHEETS:
            raise ValueError(f'{name} 파트에는 레이아웃이 1~{MAX_PART_SHEETS}장 있어야 합니다.')
        rows = []
        for sheet in sheets:
            if not isinstance(sheet, dict) or not isinstance(sheet.get('f'), str) or not LAYOUT_ID.fullmatch(sheet['f']):
                raise ValueError(f'{name} 파트의 레이아웃이 올바르지 않습니다.')
            rows.append({'f': sheet['f'], 'label': _text(sheet.get('label'), PART_LIMITS['label'], '레이아웃 이름')})
        out[key] = {'name': name, 'color': color, 'icon': icon, **({'type': kind} if kind else {}), 'sheets': rows}
    names = [p['name'] for p in out.values()]
    if len(set(names)) != len(names):
        raise ValueError('직접 만든 파트의 이름이 겹칩니다.')
    return out


def _templates(raw, parts: dict) -> dict:
    """직접 만든 구성 — 글 · 목차 흐름(규칙: Spec 은 넣으면 맨 끝 · 4~7개, 구독 솔루션이 있으면 8개 · 같은 파트 두 번 없음)."""
    raw = {} if raw is None else raw
    if not isinstance(raw, dict) or len(raw) > MAX_CUSTOM:
        raise ValueError('직접 만든 구성 값이 올바르지 않습니다.')
    out = {}
    for tid, value in raw.items():
        if not isinstance(tid, str) or not CUSTOM_ID.fullmatch(tid) or not isinstance(value, dict):
            raise ValueError('직접 만든 구성의 id 가 올바르지 않습니다.')
        name = _text(value.get('name'), TEXT_LIMITS['name'], '구성 이름')
        if not name:
            raise ValueError('구성 이름을 적어 주세요.')
        tocs = value.get('tocs')
        if not isinstance(tocs, list) or any(not isinstance(k, str) or not TEMPLATE_ID.fullmatch(k) for k in tocs):
            raise ValueError(f'{name} 구성의 목차 흐름이 올바르지 않습니다.')
        if len(set(tocs)) != len(tocs):
            raise ValueError(f'{name} 구성에 같은 파트가 두 번 있습니다.')
        if SPEC_KEY in tocs and tocs[-1] != SPEC_KEY:
            raise ValueError(f'{name} 구성: Spec 은 구성의 맨 끝에 와야 합니다.')
        most = 8 if SUB_KEY in tocs else 7
        if not MIN_TOCS <= len(tocs) <= most:
            raise ValueError(f'{name} 구성: 파트는 {MIN_TOCS}~{most}개여야 합니다.')
        missing = [k for k in tocs if k.startswith('cp_') and k not in parts]
        if missing:
            raise ValueError(f'{name} 구성이 없는 파트를 씁니다: {", ".join(missing)}')
        item = {'name': name, 'tocs': list(tocs)}
        for key in ('desc', 'hint'):
            text = _text(value.get(key), TEXT_LIMITS[key], f'{name} 구성의 {key}')
            if text:
                item[key] = text
        related = value.get('related')
        if related is not None:
            if not isinstance(related, list) or len(related) > MAX_RELATED or any(not isinstance(x, str) or not SCENARIO_ID.fullmatch(x) for x in related):
                raise ValueError(f'{name} 구성의 샘플 시나리오 목록이 올바르지 않습니다.')
            item['related'] = list(dict.fromkeys(related))
        out[tid] = item
    return out


def clean(body) -> dict:
    """저장할 값만 골라 형식을 맞춘다. 형식이 틀리면 ValueError(화면에 그대로 보인다)."""
    if not isinstance(body, dict):
        raise ValueError('구성 값은 객체여야 합니다.')
    fixed = body.get('fixed')
    fixed = _template_id(fixed, '기본 구성') if fixed not in (None, '') else None
    order = [] if body.get('order') is None else body['order']
    if not isinstance(order, list) or len(order) > MAX_TEMPLATES:
        raise ValueError('구성 순서가 올바르지 않습니다.')
    order = [_template_id(x, '구성 순서') for x in order]
    if len(set(order)) != len(order):
        raise ValueError('구성 순서에 같은 구성이 두 번 있습니다.')
    raw = {} if body.get('items') is None else body['items']
    if not isinstance(raw, dict) or len(raw) > MAX_TEMPLATES:
        raise ValueError('구성별 값이 올바르지 않습니다.')
    items = {}
    for tid, value in raw.items():
        _template_id(tid, '구성별 값')
        if not isinstance(value, dict):
            raise ValueError(f'{tid} 구성의 값이 올바르지 않습니다.')
        item = {}
        if value.get('enabled') is not None:
            if not isinstance(value['enabled'], bool):
                raise ValueError(f'{tid} 구성의 사용 여부가 올바르지 않습니다.')
            if not value['enabled']:
                item['enabled'] = False  # 켜진 것은 기본값이라 남기지 않는다
        for key, limit in TEXT_LIMITS.items():
            text = value.get(key)
            if text is None:
                continue
            if not isinstance(text, str):
                raise ValueError(f'{tid} 구성의 {key} 값이 올바르지 않습니다.')
            text = re.sub(r'\s+', ' ', text).strip()
            if len(text) > limit:
                raise ValueError(f'{tid} 구성의 {key} 값은 {limit}자까지 쓸 수 있습니다.')
            if text:
                item[key] = text
        related = value.get('related')
        if related is not None:
            if not isinstance(related, list) or len(related) > MAX_RELATED or any(not isinstance(x, str) or not SCENARIO_ID.fullmatch(x) for x in related):
                raise ValueError(f'{tid} 구성의 샘플 시나리오 목록이 올바르지 않습니다.')
            item['related'] = list(dict.fromkeys(related))
        if item:
            items[tid] = item
    if fixed and items.get(fixed, {}).get('enabled') is False:
        raise ValueError('기본 구성은 끌 수 없습니다. 다른 구성을 기본으로 정한 뒤 꺼 주세요.')
    parts = _parts(body.get('parts'))
    templates = _templates(body.get('templates'), parts)
    if fixed and fixed.startswith('ct_') and fixed not in templates:
        raise ValueError('기본 구성으로 정한 구성이 없습니다.')
    return {'fixed': fixed, 'order': order, 'items': items, 'parts': parts, 'templates': templates}


def load() -> dict:
    """저장된 값(없거나 읽지 못하면 빈 값 — 앱은 코드 기본값으로 움직인다)."""
    try:
        data = json.loads(path().read_text(encoding='utf-8'))
        value = clean(data)
    except (OSError, ValueError):
        return empty()
    rev = data.get('rev')
    return {**empty(), **value, 'rev': rev if isinstance(rev, int) and rev >= 0 else 0,
            'updated_at': data.get('updated_at') if isinstance(data.get('updated_at'), str) else None,
            'updated_by': data.get('updated_by') if isinstance(data.get('updated_by'), str) else None}


def public() -> dict:
    """앱(/api/bootstrap)에 싣는 값 — 누가 바꿨는지는 뺀다."""
    data = load()
    return {key: data[key] for key in ('v', 'rev', 'fixed', 'order', 'items', 'parts', 'templates')}


def _write(value: dict, actor: str) -> dict:
    target = path()
    with _lock:
        data = {**empty(), **value, 'rev': load()['rev'] + 1,
                'updated_at': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'), 'updated_by': str(actor or 'admin')[:80]}
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.tmp')
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        os.replace(temporary, target)
    return data


def save(body, actor: str = 'admin') -> dict:
    return _write(clean(body), actor)


def reset(actor: str = 'admin') -> dict:
    """코드 기본값으로 — 값은 비우고 rev 만 올린다(앱이 이전 값으로 받은 추천을 다시 받게)."""
    return _write({'fixed': None, 'order': [], 'items': {}, 'parts': {}, 'templates': {}}, actor)
