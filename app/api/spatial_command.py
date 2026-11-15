"""Spatial studio commands — ``POST /api/spatial/command``.

The studio has no input form any more: the user types a sentence under the simulator, tags spaces, products and
objects with ``@`` and the sentence is turned into an operation list the client applies to the scene
(``app/web/src/domain/spatial/command-apply.js``):

* ``add``         assetId, roomId, quantity (1–30), optional absolute ``patch``
* ``copy``        objectId, quantity, optional roomId (destination)
* ``move``        objectId and exactly one of ``direction`` (+ optional ``distance`` in metres), ``roomId``, ``patch``
* ``rotate``      objectId and ``angle`` (relative, clockwise positive) or ``rotation`` (absolute degrees)
* ``remove``      objectId
* ``style``       style
* ``room_add``    kind (space type), optional name, optional ``ref`` ("new-1") that later operations use as roomId
* ``room_remove`` roomId
* ``room_update`` roomId, name and/or purpose

Directions are answered as words (left/right/forward/back = as seen on the user's screen); the client turns them into
map coordinates with the camera it is showing. The model's answer is checked against the frozen scene before it is
returned — unknown ids, out-of-range numbers and unknown operations are a 502, never a silent substitution.

Two branches produce the same output (``docs/decision-model/REPORT.md``): the LLM (``stage='spatial:command'``), and —
for a single request whose targets are all tagged — the decision model (task ``spatial.command``).
"""
from __future__ import annotations

import json
import math
import re
from typing import Any, Dict, List, Optional

from fastapi import Body, HTTPException, Request

SPACE_TYPES = (('reception', '로비 · 접수'), ('office', '업무 공간'), ('meeting', '회의실'), ('lounge', '라운지 · 휴게'), ('dining', '식당 · 카페'),
               ('kitchen', '주방'), ('classroom', '강의실'), ('study', '학습 · 열람'), ('bedroom', '객실 · 침실'), ('medical', '의료 · 케어'),
               ('retail', '매장 · 쇼룸'), ('warehouse', '생산 · 물류'), ('utility', '설비 · 관리'), ('theatre', '공연 · 강당'), ('fitness', '운동 · 재활'),
               ('outdoor', '야외 공간'))  # same keys as SPACE_TYPES in app/web/src/domain/spatial/studio-form.js
SPACE_KINDS = tuple(kind for kind, _ in SPACE_TYPES)
OPERATIONS = ('add', 'copy', 'move', 'rotate', 'remove', 'style', 'room_add', 'room_remove', 'room_update')
DIRECTIONS = ('left', 'right', 'forward', 'back')
MENTION_KINDS = ('object', 'asset', 'room', 'space')
MAX_ROOMS = 30
MAX_ASSETS = 150
_REF = re.compile(r'new-\d{1,3}')
# Decision branch (task ``spatial.command``): one request whose targets are tagged, answered as typed questions.
TASK = 'spatial.command'
CONFIDENCE = 0.5        # action · subject · best-fitting room (live runs: "추가해" answers add at 0.70–0.92, sometimes just under 0.6)
FIELD_CONFIDENCE = 0.5  # room · count · direction · distance · angle
MULTI = 0.5             # above this the sentence asks for more than one thing → LLM
TAGGED = 0.5            # below this the target is not the tagged thing itself ("@소파 옆에 있는 의자") → LLM
REMOVE_CONFIDENCE = 0.7 # a removal needs a surer answer than the other actions
MAX_DECISION_ROOMS = 40
DISTANCES = ('0.5', '1', '2', '3', '5')
ANGLES = ('90', '-90', '180', '45', '-45', '30', '-30', '15', '-15')
ACTIONS = {
    'add': '새 오브젝트를 공간에 놓는다 — 추가 · 배치 · 설치 · 넣기 · 놓기. 대상이 카탈로그의 새 오브젝트일 때.',
    'copy': '이미 배치된 대상을 같은 것으로 더 만든다 — 복사 · 복제 · 하나 더.',
    'move_direction': '대상을 왼쪽 · 오른쪽 · 앞 · 뒤 방향으로 옮긴다.',
    'move_room': '대상을 다른 공간으로 옮긴다.',
    'rotate': '대상을 돌린다(회전 · 방향 바꾸기).',
    'remove': '대상을 없앤다(삭제 · 지우기 · 빼기 · 제거).',
    'other': '위의 어느 것도 아니다(공간 추가 · 삭제, 스타일, 좌표 지정, 질문, 그 밖).',
}
# Korean particles that hide a catalogue word inside a typed word ("세탁기를" → "세탁기").
_PARTICLES = ('으로', '에서', '에게', '한테', '까지', '부터', '이랑', '을', '를', '이', '가', '은', '는', '에', '의', '로', '도', '만', '과', '와', '랑')

SYSTEM = (
    '당신은 공간 조감도 시뮬레이터의 조작기입니다. 사용자의 문장을 현재 장면에 대한 operations 목록으로 바꿉니다. '
    '요청한 변경만 반환하고 장면을 새로 만들지 마세요. 문장에 요청이 여러 개면 말한 순서대로 여러 operation을 반환합니다.\n'
    '[@ 참조] references의 kind=object는 장면에 배치된 특정 인스턴스, kind=asset은 카탈로그에서 새로 넣을 오브젝트, '
    'kind=room은 장면의 공간, kind=space는 새로 추가할 공간 종류입니다. 같은 제품이 여러 개 있어도 지정한 인스턴스만 조작하세요.\n'
    '[추가 add] assetId · roomId · quantity(1~30, 말하지 않으면 1). 자리는 자동 배치에 맡기고, 사용자가 정확한 좌표를 말한 경우에만 patch를 넣습니다. '
    '후보(availableAssets)에 없는 제품을 임의 제품으로 바꾸지 마세요.\n'
    '[복제 copy] 배치된 인스턴스를 그대로 여러 개 만들 때: objectId · quantity · roomId(다른 공간에 놓을 때만). '
    '원본이 있는 공간과 다른 공간에도 복제할 수 있습니다 — "@[거실] 에 @[사람] 2명 복사해"는 그 사람 인스턴스를 거실에 2개 복제하라는 뜻입니다. '
    '참조가 kind=asset(카탈로그)이면 copy가 아니라 add입니다. 사람 연출은 사람과 가구 · 소품이 묶인 한 오브젝트이고 "2명"은 그 묶음 2개입니다. 묶음 안의 사람이나 가구를 떼어 조작하지 마세요.\n'
    '[이동 move] 셋 중 하나만 씁니다. (1) 방향: 사용자가 오른쪽 · 왼쪽 · 앞 · 뒤(화면 위쪽 = back, 아래쪽 = forward)라고 하면 direction에 right · left · forward · back을 넣고, '
    '거리를 말했으면 distance(미터), 말하지 않았으면 distance를 넣지 마세요. 방향을 좌표로 바꾸지 말고, 어느 좌표계 기준인지 되묻지도 마세요 — '
    '화면 기준 계산은 앱이 합니다. (2) 다른 공간으로: roomId. '
    '(3) 사용자가 좌표를 직접 말한 경우에만 patch(전체 맵 절대 좌표 x · z, 높이 elevation). 가구를 옮기면 위에 얹힌 제품과 딸린 의자가 함께 움직이므로 따로 옮기지 마세요.\n'
    '[회전 rotate] 상대 회전은 angle(도, 오른쪽 · 시계 방향이 +, 왼쪽 · 반시계 방향이 −, "돌려"만 말하면 90), 특정 각도를 보게 하라는 요청은 rotation(0~359 절대 각도).\n'
    '[삭제 remove] objectId. [스타일 style] style.\n'
    '[공간] 새 공간은 room_add: kind(spaceTypes의 kind) · name(말했을 때만) · ref("new-1", "new-2" …). 같은 문장에서 그 새 공간에 넣을 것은 roomId에 그 ref를 씁니다. '
    '공간 삭제는 room_remove: roomId. 이름 · 용도 바꾸기는 room_update: roomId · name · purpose.\n'
    '[대상 공간] 공간을 말하지 않았으면 references의 room, 그다음 focusedRoomId, 그것도 없으면 용도가 맞는 공간을 고릅니다. 고를 근거가 없으면 조작하지 마세요.\n'
    '[장면이 없을 때] scene이 null이면 아직 공간이 없습니다. room_add로 시작해야 하고, 다른 조작은 그 room_add의 ref에만 할 수 있습니다.\n'
    '[모호할 때] 대상이나 공간을 전혀 정할 수 없을 때만 operations=[]로 두고 explanation에 무엇을 알려 주면 되는지 한 문장으로 물어보세요. '
    '@로 참조한 대상이 있고 조작이 분명하면 되묻지 말고 실행하세요. 겹침 · 여유 공간은 앱이 확인하니 걱정해서 거절하지 마세요.\n'
    '[예시] 요청 "@[거실] 에 @[사람] 2명 복사해" (references: room 거실, object 사람) → {"type":"copy","objectId":"사람의 id","quantity":2,"roomId":"거실의 id"}. '
    '요청 "@[소파] 오른쪽으로 옮겨" → {"type":"move","objectId":"소파의 id","direction":"right"}. '
    '요청 "@[세탁기] 3개 추가해" (references: asset 세탁기, focusedRoomId 있음) → {"type":"add","assetId":"세탁기의 id","roomId":"focusedRoomId","quantity":3}.\n'
    '[마지막 확인] '
    '등록된 ID만 쓰고, geometryFeedback이 있으면 그 문제를 피해 다시 계획하세요. explanation은 한국어 한 문장입니다.'
)


def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _text(value: Any, limit: int) -> Optional[str]:
    return value.strip() if isinstance(value, str) and value.strip() and len(value.strip()) <= limit else None


def _stems(word: str) -> List[str]:
    out = [word]
    for particle in _PARTICLES:
        if word.endswith(particle) and len(word) - len(particle) >= 2:
            out.append(word[:-len(particle)])
    return out


def schema(styles) -> dict:
    patch = {'type': 'OBJECT', 'properties': {k: {'type': 'NUMBER'} for k in ('x', 'z', 'elevation', 'rotation')}}
    return {'type': 'OBJECT', 'properties': {'explanation': {'type': 'STRING'}, 'operations': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
        # Large identifier enums make Gemini reject the schema with HTTP 400. IDs stay in the prompt and are checked below.
        'type': {'type': 'STRING', 'enum': list(OPERATIONS)}, 'objectId': {'type': 'STRING'}, 'assetId': {'type': 'STRING'}, 'roomId': {'type': 'STRING'},
        'quantity': {'type': 'INTEGER'}, 'patch': patch, 'direction': {'type': 'STRING', 'enum': list(DIRECTIONS)}, 'distance': {'type': 'NUMBER'},
        'angle': {'type': 'NUMBER'}, 'rotation': {'type': 'NUMBER'}, 'style': {'type': 'STRING', 'enum': list(styles)},
        'kind': {'type': 'STRING', 'enum': list(SPACE_KINDS)}, 'name': {'type': 'STRING'}, 'purpose': {'type': 'STRING'}, 'ref': {'type': 'STRING'}},
        'required': ['type']}}}, 'required': ['explanation', 'operations']}


class Context:
    """The validated request: frozen scene, its asset revision, references and the focused room."""

    def __init__(self, body: dict, lib, styles):
        self.styles = tuple(styles)
        prompt = body.get('prompt')
        if not isinstance(prompt, str) or not 3 <= len(prompt.strip()) <= 6000:
            raise HTTPException(422, '명령을 3~6,000자로 입력해 주세요.')
        self.prompt = prompt
        scene = body.get('scene')
        if scene is not None:
            try:
                lib.validate(scene)
            except (ValueError, TypeError) as exc:
                raise HTTPException(422, str(exc)) from exc
        self.scene = scene
        try:
            library = lib.revision(scene.get('assetRevision')) if scene else lib.library
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        self.assets: Dict[str, dict] = {a['id']: a for a in library['assets']}
        self.objects: Dict[str, dict] = {o['id']: o for o in scene['objects']} if scene else {}
        self.rooms: Dict[str, dict] = {r['id']: r for r in scene['rooms']} if scene else {}
        industry = scene['industry'] if scene else body.get('industry')
        if not scene and industry is not None and industry not in {i['code'] for i in library['industries']}:
            raise HTTPException(422, '등록된 업종을 선택해 주세요.')
        self.industry = industry
        mentions = body.get('mentions', [])
        sources = {'object': self.objects, 'asset': self.assets, 'room': self.rooms, 'space': dict.fromkeys(SPACE_KINDS)}
        if not isinstance(mentions, list) or len(mentions) > 100 or any(
                not isinstance(m, dict) or m.get('kind') not in MENTION_KINDS or not isinstance(m.get('label'), str) or len(m['label']) > 300
                or not isinstance(m.get('id'), str) or m['id'] not in sources[m['kind']] for m in mentions):
            raise HTTPException(422, '@ 참조가 올바르지 않습니다.')
        self.mentions = [{'kind': m['kind'], 'id': m['id'], 'label': m['label']} for m in mentions]
        focus = body.get('roomId')
        if focus is not None and focus not in self.rooms:
            raise HTTPException(422, '보고 있는 공간을 찾지 못했습니다.')
        self.focus = focus
        view = body.get('view', '3d')
        if view not in ('2d', '3d'):
            raise HTTPException(422, '보기 방식이 올바르지 않습니다.')
        self.view = view
        self.feedback = str(body.get('feedback', ''))[:1000]

    def candidates(self) -> List[dict]:
        """Catalogue objects worth showing the model: tagged ones first, then by how well they match the sentence."""
        words = [stem for word in re.findall(r'[\w-]+', self.prompt.lower()) for stem in _stems(word) if len(stem) > 1]
        tagged = {m['id'] for m in self.mentions if m['kind'] == 'asset'}
        lowered = self.prompt.lower()

        def relevance(asset: dict) -> int:
            text = ' '.join([asset['name'], asset.get('model') or '', asset.get('description') or '', asset.get('category') or '',
                             *asset.get('spaces', []), *asset.get('keywords', []), *asset.get('variants', [])]).lower()
            return ((10000 if asset['id'] in tagged else 0) + (100 if asset.get('model') and asset['model'].lower() in lowered else 0)
                    + sum(5 for word in words if word in text) + (2 if self.industry in asset.get('industries', []) else 0)
                    + (1 if not asset.get('productId') else 0))

        pool = [a for a in self.assets.values() if a.get('physical') and a.get('catalogVisible') is not False]
        return sorted(pool, key=relevance, reverse=True)[:MAX_ASSETS]

    def payload(self) -> dict:
        scene = None
        if self.scene:
            scene = {'title': self.scene['title'], 'style': self.scene['style'], 'industry': self.scene['industry'],
                     'rooms': [{k: r[k] for k in ('id', 'name', 'kind', 'x', 'z', 'width', 'depth') if k in r} for r in self.scene['rooms']],
                     'objects': [{'id': o['id'], 'assetId': o['assetId'], 'name': self.assets[o['assetId']]['name'], 'roomId': o['roomId'],
                                  'x': o['x'], 'z': o['z'], 'rotation': o['rotation'], 'elevation': o.get('elevation', 0),
                                  'size': self.assets[o['assetId']]['size'],
                                  **({'onTopOf': o['supportId']} if o.get('supportId') else {}), **({'mount': o['mount']} if o.get('mount') else {}),
                                  **({'people': len(o['people'])} if o.get('people') else {})} for o in self.scene['objects']]}
        return {'request': self.prompt, 'references': self.mentions, 'focusedRoomId': self.focus, 'view': self.view, 'scene': scene,
                'industry': self.industry, 'styles': list(self.styles), 'spaceTypes': [{'kind': kind, 'name': name} for kind, name in SPACE_TYPES],
                'availableAssets': [{'id': a['id'], 'name': a['name'], 'model': a.get('model'), 'size': a['size'],
                                     **({'composition': a['composition'], 'roles': a.get('roles', [])} if a.get('assetGroup') == 'people' else {})}
                                    for a in self.candidates()],
                'geometryFeedback': self.feedback}


class NeedsRoom(Exception):
    """An ``add`` with no room: none named, none viewed and the model chose none — ask the user instead of failing."""


ASK_ROOM = '어느 공간에 놓을지 알려 주세요. 공간을 @로 태그하거나, 아래 공간 띠에서 공간을 고른 뒤 다시 요청하면 돼요.'


def normalise(out: Any, ctx: Context) -> dict:
    """Check the model's plan against the frozen scene and keep only the fields each operation uses. Raises 502."""
    def fail(message: str):
        raise HTTPException(502, message)

    if not isinstance(out, dict) or not isinstance(out.get('explanation'), str) or not isinstance(out.get('operations'), list) or len(out['operations']) > 100:
        fail('AI 명령 응답 형식이 올바르지 않습니다.')
    refs: set = set()
    rooms = len(ctx.rooms)
    started = bool(ctx.scene)  # a blank studio has to start with room_add
    tagged_assets = [m['id'] for m in ctx.mentions if m['kind'] == 'asset']
    operations = []

    def room(value: Any, new: bool = True) -> Optional[str]:
        return value if isinstance(value, str) and (value in ctx.rooms or new and value in refs) else None

    def quantity(op: dict) -> int:
        value = op.get('quantity')
        if value is None:
            return 1
        if type(value) is not int or not 1 <= value <= 30:
            fail('수량은 1~30개여야 합니다.')
        return value

    def patch(value: Any) -> dict:
        if not isinstance(value, dict) or not value or any(k not in ('x', 'z', 'elevation', 'rotation') or not _number(v) for k, v in value.items()):
            fail('좌표 · 회전 값이 올바르지 않습니다.')
        return value

    for op in out['operations']:
        if not isinstance(op, dict) or op.get('type') not in OPERATIONS:
            fail('지원하지 않는 AI 명령입니다.')
        kind = op['type']
        if not started and kind != 'room_add':
            fail('먼저 공간을 추가해야 합니다.')
        if kind in ('copy', 'move', 'rotate', 'remove') and op.get('objectId') not in ctx.objects:
            fail('조작할 오브젝트 참조가 올바르지 않습니다.')
        if kind == 'add':
            # The user's own context settles two slips of the model: no (or an unknown) room → the room being viewed;
            # an unknown asset id → the one catalogue object the user tagged. Targets of other operations are never swapped.
            target = room(op.get('roomId')) or ctx.focus
            if op.get('assetId') not in ctx.assets and len(tagged_assets) == 1:
                op = {**op, 'assetId': tagged_assets[0]}
            if op.get('assetId') not in ctx.assets or not ctx.assets[op['assetId']].get('physical'):
                fail('추가할 오브젝트가 올바르지 않습니다.')
            if not target:
                if op.get('roomId') in (None, ''):
                    raise NeedsRoom()
                fail('추가할 공간이 올바르지 않습니다.')
            item = {'type': 'add', 'assetId': op['assetId'], 'roomId': target, 'quantity': quantity(op)}
            if isinstance(op.get('patch'), dict) and op['patch']:
                item['patch'] = patch(op['patch'])
        elif kind == 'copy':
            item = {'type': 'copy', 'objectId': op['objectId'], 'quantity': quantity(op)}
            if op.get('roomId') not in (None, ''):
                target = room(op['roomId'])
                if not target:
                    fail('복제할 공간을 찾지 못했습니다.')
                item['roomId'] = target
        elif kind == 'move':
            item = {'type': 'move', 'objectId': op['objectId']}
            if op.get('direction') not in (None, ''):
                if op['direction'] not in DIRECTIONS:
                    fail('이동 방향이 올바르지 않습니다.')
                item['direction'] = op['direction']
                if op.get('distance') is not None:
                    if not _number(op['distance']) or not .05 <= op['distance'] <= 50:
                        fail('이동 거리가 올바르지 않습니다.')
                    item['distance'] = op['distance']
            elif op.get('roomId') not in (None, ''):
                target = room(op['roomId'])
                if not target:
                    fail('옮길 공간을 찾지 못했습니다.')
                item['roomId'] = target
            else:
                item['patch'] = patch(op.get('patch'))
        elif kind == 'rotate':
            item = {'type': 'rotate', 'objectId': op['objectId']}
            if op.get('angle') is not None:
                if not _number(op['angle']) or not op['angle'] or abs(op['angle']) > 360:
                    fail('회전 각도가 올바르지 않습니다.')
                item['angle'] = op['angle']
            elif _number(op.get('rotation')) and 0 <= op['rotation'] <= 360:
                item['rotation'] = op['rotation']
            else:
                fail('회전 각도가 올바르지 않습니다.')
        elif kind == 'remove':
            item = {'type': 'remove', 'objectId': op['objectId']}
        elif kind == 'style':
            if op.get('style') not in ctx.styles:
                fail('공간 스타일이 올바르지 않습니다.')
            item = {'type': 'style', 'style': op['style']}
        elif kind == 'room_add':
            if op.get('kind') not in SPACE_KINDS:
                fail('공간 종류가 올바르지 않습니다.')
            rooms += 1
            started = True
            if rooms > MAX_ROOMS:
                fail('공간은 최대 30개까지 만들 수 있습니다.')
            item = {'type': 'room_add', 'kind': op['kind']}
            if isinstance(op.get('name'), str) and op['name'].strip():
                name = _text(op['name'], 100)
                if not name:
                    fail('공간 이름은 100자 이내여야 합니다.')
                item['name'] = name
            if isinstance(op.get('ref'), str) and _REF.fullmatch(op['ref']):
                item['ref'] = op['ref']
                refs.add(op['ref'])
        elif kind == 'room_remove':
            target = room(op.get('roomId'), new=False)
            if not target:
                fail('삭제할 공간을 찾지 못했습니다.')
            item = {'type': 'room_remove', 'roomId': target}
        else:  # room_update
            target = room(op.get('roomId'))
            name, purpose = _text(op.get('name'), 100), _text(op.get('purpose'), 100)
            if not target or not (name or purpose):
                fail('바꿀 공간 이름 · 용도가 올바르지 않습니다.')
            item = {'type': 'room_update', 'roomId': target, **({'name': name} if name else {}), **({'purpose': purpose} if purpose else {})}
        operations.append(item)
    return {'explanation': out['explanation'], 'operations': operations}


def plan_with_llm(ctx: Context) -> dict:
    from .poc.settings import get_settings
    from .poc.provider import get_provider, ProviderError
    provider, _reason = get_provider(get_settings())
    if provider is None:
        raise HTTPException(503, 'LLM 연결 설정을 확인해 주세요.')
    try:
        result = provider.generate_json(stage='spatial:command', system=SYSTEM, user=json.dumps(ctx.payload(), ensure_ascii=False),
                                        schema=schema(ctx.styles), max_output_tokens=4096, max_attempts=2, cache_allowed=False)
    except ProviderError as exc:
        raise HTTPException(502, exc.message or '명령을 해석하지 못했습니다.') from exc
    try:
        plan = normalise(result.data, ctx)
    except NeedsRoom:  # nothing is applied — the whole command waits for the answer
        plan = {'explanation': ASK_ROOM, 'operations': []}
    return {'plan': plan, 'model': result.model, 'mode': 'real', 'source': 'llm'}


def plan_with_decision(ctx: Context) -> Optional[dict]:
    """The decision-model branch, or ``None`` when the request does not fit it (→ LLM branch).

    It takes only what typed questions can express: a scene, at least one tagged object/asset, no new space type, no
    geometry retry. The sentence is never split or parsed by rules — the model reads it whole and answers each field;
    more than one request, an unlisted value or a low confidence hands the whole command to the LLM.
    """
    subjects = [m for m in ctx.mentions if m['kind'] in ('object', 'asset')]
    if (not ctx.scene or ctx.feedback or not subjects or len(subjects) > 20 or len(ctx.rooms) > MAX_DECISION_ROOMS
            or any(m['kind'] == 'space' for m in ctx.mentions)):
        return None
    from .poc.settings import get_settings
    from .poc.provider import ProviderError
    try:
        from .llm import decision as dm
    except ImportError:  # the Decision model module is optional — without it every command is read by the LLM
        return None
    client = dm.get_decision(get_settings(), TASK)
    if client is None:
        return None
    rooms = list(ctx.rooms.values())
    tagged = {m['id'] for m in ctx.mentions if m['kind'] == 'room'}
    questions = {
        'multi': dm.noul('이 문장은 조작을 둘 이상 요청한다 — 서로 다른 조작이거나(옮기고 나서 삭제), 같은 조작을 둘 이상의 대상에(A와 B 둘 다 삭제). '
                         '한 대상을 여러 개 만드는 것(2개 복사 · 3개 추가)은 하나다.'),
        'tagged': dm.noul('조작 대상은 @로 참조한 것 그 자체다. 참조한 것의 옆 · 앞 · 위에 있는 다른 것이 대상이면 아니다.'),
        'action': dm.choice('문장이 요청하는 조작 하나.', ACTIONS),
        'room': dm.choice('문장이 말한 목적지 또는 대상 공간.', {
            **{f'r{i}': r['name'] + (' (@로 태그됨)' if r['id'] in tagged else '') for i, r in enumerate(rooms)},
            'none': '문장이 공간을 말하지 않는다.'}),
        'fit': dm.choice('대상을 새로 놓는다면 쓰임새가 가장 잘 맞는 공간(문장이 공간을 말하지 않았을 때 쓴다).',
                         {f'r{i}': f"{r['name']} ({r.get('kind', '')})" for i, r in enumerate(rooms)}),
        'count': dm.choice('문장이 말한 개수 · 대수 · 명수. 말하지 않았으면 1.', {str(n): f'{n}개' for n in range(1, 31)}),
        'direction': dm.choice('문장이 말한 이동 방향.', {'left': '왼쪽', 'right': '오른쪽', 'forward': '앞 · 화면 아래쪽 · 가까운 쪽',
                                                  'back': '뒤 · 화면 위쪽 · 먼 쪽', 'none': '방향을 말하지 않는다.'}),
        'distance': dm.choice('문장이 말한 이동 거리.', {**{d: f'{d}m' for d in DISTANCES}, 'none': '거리를 말하지 않는다.',
                                                 'other': '목록에 없는 다른 거리를 말했다.'}),
        'angle': dm.choice('문장이 말한 회전 각도와 방향(오른쪽 · 시계 방향은 +, 왼쪽 · 반시계 방향은 −).',
                           {**{a: f'{a}도' for a in ANGLES}, 'none': '각도를 말하지 않는다.', 'other': '목록에 없는 다른 각도를 말했다.'}),
    }
    if len(subjects) > 1:
        questions['subject'] = dm.choice('조작의 대상(옮기거나, 복제하거나, 추가하거나, 지울 것).', {
            f's{i}': f"{m['label']} ({'배치된 오브젝트' if m['kind'] == 'object' else '카탈로그의 새 오브젝트'})" for i, m in enumerate(subjects)})
    state = {'request': ctx.prompt,
             'references': [{'label': m['label'], 'kind': m['kind'],
                             **({'room': ctx.rooms[ctx.objects[m['id']]['roomId']]['name']} if m['kind'] == 'object' else {})} for m in ctx.mentions],
             'rooms': [r['name'] for r in rooms], 'focusedRoom': ctx.rooms[ctx.focus]['name'] if ctx.focus else None}
    try:
        result = client.ask(stage=TASK, state=state, questions=questions)
    except (ProviderError, ValueError):  # the decision model failed or the request could not be built → the LLM answers
        return None
    answers = result.answers

    def pick(qid: str, floor: float) -> Optional[str]:
        answer = answers.get(qid) or {}
        key, confidence = answer.get('choice'), answer.get('confidence')
        if not _number(confidence):
            confidence = (answer.get('probabilities') or {}).get(key, 0)
        return key if isinstance(key, str) and _number(confidence) and confidence >= floor else None

    multi = (answers.get('multi') or {}).get('noul')
    if not _number(multi) or multi > MULTI:
        return None
    tagged = (answers.get('tagged') or {}).get('noul')
    if not _number(tagged) or tagged < TAGGED:
        return None
    action = pick('action', CONFIDENCE)
    if action is None or action == 'other' or action == 'remove' and pick('action', REMOVE_CONFIDENCE) is None:
        return None
    key = 's0' if len(subjects) == 1 else pick('subject', CONFIDENCE)
    if key is None:
        return None
    subject = subjects[int(key[1:])]
    placed = subject['kind'] == 'object'

    def target_room() -> Any:
        """Room id the sentence names, ``''`` when it names none, ``None`` when the model is unsure."""
        answer = pick('room', FIELD_CONFIDENCE)
        return None if answer is None else '' if answer == 'none' else rooms[int(answer[1:])]['id']

    def count() -> Optional[int]:
        answer = pick('count', FIELD_CONFIDENCE)
        return int(answer) if answer else None

    op: Optional[dict] = None
    if action in ('add', 'copy') and not placed:  # a catalogue object: "copy" of something not placed is an add
        room, quantity = target_room(), count()
        if room == '':  # no room said: the room being viewed, else the room the object fits best
            fit = pick('fit', CONFIDENCE)
            room = ctx.focus or (rooms[int(fit[1:])]['id'] if fit else None)
        if room and quantity:
            op = {'type': 'add', 'assetId': subject['id'], 'roomId': room, 'quantity': quantity}
    elif action == 'copy':
        room, quantity = target_room(), count()
        if room is not None and quantity:
            op = {'type': 'copy', 'objectId': subject['id'], 'quantity': quantity}
            if room and room != ctx.objects[subject['id']]['roomId']:
                op['roomId'] = room
    elif action == 'move_direction' and placed:
        direction, distance = pick('direction', FIELD_CONFIDENCE), pick('distance', FIELD_CONFIDENCE)
        if direction in DIRECTIONS and distance is not None and distance != 'other':
            op = {'type': 'move', 'objectId': subject['id'], 'direction': direction}
            if distance != 'none':
                op['distance'] = int(float(distance)) if float(distance).is_integer() else float(distance)
    elif action == 'move_room' and placed:
        room = target_room()
        if room and room != ctx.objects[subject['id']]['roomId']:
            op = {'type': 'move', 'objectId': subject['id'], 'roomId': room}
    elif action == 'rotate' and placed:
        angle = pick('angle', FIELD_CONFIDENCE)
        if angle is not None and angle != 'other':
            op = {'type': 'rotate', 'objectId': subject['id'], 'angle': 90 if angle == 'none' else int(angle)}
    elif action == 'remove' and placed:
        op = {'type': 'remove', 'objectId': subject['id']}
    if op is None:
        return None
    return {'plan': normalise({'explanation': '요청한 조작을 해석했어요.', 'operations': [op]}, ctx),
            'model': getattr(result, 'model', None) or getattr(client, 'model', 'decision'), 'mode': 'real', 'source': 'decision'}


def register_command(router, styles) -> None:
    """Attach ``POST /command`` to the spatial router (``app/api/spatial.py``)."""
    @router.post('/command')
    def command(request: Request, body: dict = Body(...)):
        ctx = Context(body, request.app.state.spatial_library, styles)
        return plan_with_decision(ctx) or plan_with_llm(ctx)
