"""Layout input contracts and fill flows — managed in admin, run by the composer.

Every layout declares
  inputs  what it needs from the Storyboard: [{param, source, required}] — `source` is a key of the
          source catalog (all information a layout can receive on the Storyboard, admin-managed too)
  nodes   its fill flow, in pipeline order: [{id, module, label?, prompt?, reads?}]

The base definition is derived from the layout itself (kind · data needs `req` · slot policies) and
describes what the composer already does for that sheet. An admin edit replaces it for the layout and
its content candidates (same structure). Edits live in WINMATE_LAYOUT_FLOWS
(default app/data/runtime/layout_flows.json) and are read by every composition, without a restart.

Effects in the composer (app/api/poc/layout_flows.py):
  write    prompt → this sheet's directive in the part fill call; removed → the AI writes no text cell
  split · element · merge   (instead of write) the sheet is written element by element — app/api/layout_elements.py
           finds its elements (cards · rows · columns); split binds each to its entity, element writes each one
           in its own call (prompt = element directive, per-element overrides in `units`), merge checks them
           against each other and writes the frame (prompt = the sheet's directive) — app/api/poc/layout_fanout.py
  shorten  removed → cells over their box are not shortened by the model
  agent    extra model step after writing (prompt = what to change), only on this sheet
  pictures prompt → picture choice directive; removed → the template pictures stay
  verify   removed → the sheet leaves the part's fact/requirement check
  inputs   the declared values go with the sheet's directive; requirement_summary adds the summary to
           the part call; a required value that is missing is named so the model does not invent it
"""
from __future__ import annotations

import copy
from datetime import datetime, timezone
import fcntl
from functools import lru_cache
import json
import os
from pathlib import Path
import re
import tempfile

from . import layout_cells, layout_elements
from . import layout_library as live

ROOT = Path(__file__).resolve().parents[2]
FIXED_RULES = ROOT / 'app/web/src/domain/templates/fixed_content.json'

GROUPS = {
    'storyboard': 'Storyboard 맥락',
    'orchestrator': '파트 orchestrator',
    'dss': 'DSS 선택',
    'space': '공간 · 조감도',
    'extract': '요구사항 추출 값',
    'market': '시장 근거',
    'deck': '덱 · 자산',
}
SUPPLY = {
    'ready': '지금 전달됨',
    'external': '외부 정제 후 전달',
    'planned': '미연결',
}
TYPES = ('text', 'string', 'string[]', 'id[]', 'object', 'object[]', 'image', 'date')

# key = the default parameter name. `always` — every writing sheet needs it (the user's rule: the
# requirement summary context and the part orchestrator's directive are required).
BASE_SOURCES = [
    {'key': 'requirement_summary', 'label': '요구사항 요약', 'type': 'object', 'group': 'storyboard', 'supply': 'ready', 'always': True,
     'desc': 'Storyboard 요구사항 요약 context (섹션 · 포인트 · 해석 · 미확정 질문)'},
    {'key': 'requirement_text', 'label': '요구사항 원문', 'type': 'text', 'group': 'storyboard', 'supply': 'ready',
     'desc': '자유 입력 · 비고 · 키맨 요구 · 첨부 원문 전체(문단 단위)'},
    {'key': 'requirement_points', 'label': '요구 포인트', 'type': 'object[]', 'group': 'storyboard', 'supply': 'ready',
     'desc': '요약의 요구 포인트(R1 …) — 이 파트가 답하는 것'},
    {'key': 'customer_name', 'label': '고객사 이름', 'type': 'string', 'group': 'storyboard', 'supply': 'ready', 'desc': '제안서의 고객사'},
    {'key': 'project_title', 'label': '제안 제목', 'type': 'string', 'group': 'storyboard', 'supply': 'ready', 'desc': '제안서 제목 · 프로젝트 이름'},
    {'key': 'industry', 'label': '업종', 'type': 'string', 'group': 'storyboard', 'supply': 'ready', 'desc': '업종 코드와 이름'},
    {'key': 'vertical', 'label': '세부 업종', 'type': 'string', 'group': 'storyboard', 'supply': 'ready', 'desc': '버티컬(세부 업종) — 공간 후보 · 업종 덱'},
    {'key': 'keymen', 'label': '키맨', 'type': 'object[]', 'group': 'storyboard', 'supply': 'ready', 'desc': '키맨 이름 · 비중 · 키맨별 요구'},
    {'key': 'attachments', 'label': '첨부 자료', 'type': 'object[]', 'group': 'storyboard', 'supply': 'ready', 'desc': 'RFP 등 첨부 파일 이름과 본문'},
    {'key': 'part_directive', 'label': '파트 지시', 'type': 'object', 'group': 'orchestrator', 'supply': 'ready', 'always': True,
     'desc': '파트 orchestrator 가 이 파트에 준 지시 — 핵심 메시지 · 담당 요구 · 근거 · 범위'},
    {'key': 'deck_thesis', 'label': '덱 핵심 메시지', 'type': 'text', 'group': 'orchestrator', 'supply': 'ready', 'desc': '덱 전체 메시지와 흐름'},
    {'key': 'neighbor_parts', 'label': '앞 · 뒤 파트', 'type': 'object[]', 'group': 'orchestrator', 'supply': 'ready', 'desc': '앞 · 뒤 파트 이름과 메시지(되풀이 방지)'},
    {'key': 'section_index', 'label': '목차 번호 · 제목', 'type': 'object[]', 'group': 'orchestrator', 'supply': 'ready', 'desc': '덱의 파트 번호 · 이름 · 쪽'},
    {'key': 'product_ids', 'label': '제품', 'type': 'id[]', 'group': 'dss', 'supply': 'ready', 'desc': '연결한 제품 ID — 이름 · 모델 · 사양 · 사진'},
    {'key': 'solution_ids', 'label': '솔루션', 'type': 'id[]', 'group': 'dss', 'supply': 'ready', 'desc': '연결한 솔루션 ID — 기능 · 지식 · 아이콘'},
    {'key': 'case_ids', 'label': '도입 사례', 'type': 'id[]', 'group': 'dss', 'supply': 'ready', 'desc': '연결한 도입 사례 ID — 고객 · 성과 · 사진'},
    {'key': 'subscription_ids', 'label': '구독 상품', 'type': 'id[]', 'group': 'dss', 'supply': 'external', 'desc': '삼성 AI 구독 상품 ID'},
    {'key': 'service_ids', 'label': '서비스', 'type': 'id[]', 'group': 'dss', 'supply': 'external', 'desc': '서비스 분류(삼성케어플러스 등) ID'},
    {'key': 'space_list', 'label': '공간 목록', 'type': 'object[]', 'group': 'space', 'supply': 'ready', 'desc': '공간 이름과 공간별 제품(사람이 정한 배치)'},
    {'key': 'space_uses', 'label': '공간별 활용', 'type': 'object[]', 'group': 'space', 'supply': 'ready', 'desc': '공간마다 쓰는 솔루션 · 서비스와 기능'},
    {'key': 'birdseye', 'label': '조감도', 'type': 'image', 'group': 'space', 'supply': 'ready', 'desc': 'DSS 조감도 또는 즉시 생성한 조감도'},
    {'key': 'customer_figures', 'label': '고객 수치', 'type': 'object[]', 'group': 'extract', 'supply': 'ready', 'desc': '요구사항에 적힌 수치(값 · 단위 · 문장)'},
    {'key': 'site_scale', 'label': '지점 · 규모', 'type': 'object[]', 'group': 'extract', 'supply': 'ready', 'desc': '매장 수 · 객실 수 · 면적 등 고객 규모'},
    {'key': 'kpis', 'label': '목표 KPI', 'type': 'object[]', 'group': 'extract', 'supply': 'external', 'desc': '고객이 말한 목표 지표와 기준선'},
    {'key': 'challenges', 'label': '고객 과제', 'type': 'string[]', 'group': 'extract', 'supply': 'external', 'desc': '지금 겪는 문제 · 불편'},
    {'key': 'current_setup', 'label': '현재 운영 · 설치 현황', 'type': 'text', 'group': 'extract', 'supply': 'external', 'desc': '지금 쓰는 장비 · 시스템 · 운영 방식'},
    {'key': 'users', 'label': '사용자 유형', 'type': 'string[]', 'group': 'extract', 'supply': 'external', 'desc': '손님 · 직원 · 관리자 등'},
    {'key': 'schedule', 'label': '일정 · 기간', 'type': 'object[]', 'group': 'extract', 'supply': 'external', 'desc': '도입 · 시범 · 확산 일정'},
    {'key': 'budget', 'label': '예산 · 비용 조건', 'type': 'text', 'group': 'extract', 'supply': 'external', 'desc': '예산 범위 · 비용 조건 · 구매 방식'},
    {'key': 'quantities', 'label': '수량', 'type': 'object[]', 'group': 'extract', 'supply': 'external', 'desc': '품목 · 공간별 수량'},
    {'key': 'competitors', 'label': '경쟁사 · 현 공급사', 'type': 'string[]', 'group': 'extract', 'supply': 'external', 'desc': '비교 대상 공급사'},
    {'key': 'decision_criteria', 'label': '평가 기준', 'type': 'string[]', 'group': 'extract', 'supply': 'external', 'desc': 'RFP 평가 항목 · 배점'},
    {'key': 'contacts', 'label': '담당자 · 연락처', 'type': 'object[]', 'group': 'extract', 'supply': 'external', 'desc': '제안사 · 고객사 담당자'},
    {'key': 'market_evidence', 'label': '업종 트렌드 근거', 'type': 'object[]', 'group': 'market', 'supply': 'ready', 'desc': '검증한 시장 수치 · 출처(시장 조사)'},
    {'key': 'template_exemplar', 'label': '템플릿 견본 문구', 'type': 'object', 'group': 'deck', 'supply': 'ready', 'desc': '레이아웃에 들어 있던 견본(형식 참고용)'},
    {'key': 'used_pictures', 'label': '이미 쓴 사진', 'type': 'string[]', 'group': 'deck', 'supply': 'ready', 'desc': '같은 제안서의 다른 장 사진(중복 방지)'},
    {'key': 'proposal_date', 'label': '제안 일자', 'type': 'date', 'group': 'deck', 'supply': 'ready', 'desc': '제안 연월'},
    {'key': 'customer_logo', 'label': '고객사 로고', 'type': 'image', 'group': 'deck', 'supply': 'planned', 'desc': '고객사 로고 파일'},
]
ALWAYS = tuple(s['key'] for s in BASE_SOURCES if s.get('always'))

# Pipeline order of the composer (run_auto): market/DSS binding → text → shorten → [agent steps]
# → pictures → check → fixed output. `loop` is the model retry the stage already has.
MODULES = {
    'collect': {'label': '입력 정리', 'kind': 'code', 'order': 0, 'single': True, 'fixed': True, 'prompt': False},
    'bind': {'label': 'DSS · 근거 데이터 채우기', 'kind': 'code', 'order': 1, 'single': True, 'fixed': True, 'prompt': False},
    'write': {'label': '문구 작성', 'kind': 'llm', 'stage': 'auto_part_fill', 'order': 2, 'single': True, 'prompt': True, 'tools': True, 'loop': '빠진 칸만 다시'},
    'split': {'label': '요소 나누기', 'kind': 'code', 'order': 3, 'single': True, 'prompt': False, 'group': 'fanout'},
    'element': {'label': '요소별 작성', 'kind': 'llm', 'stage': 'auto_unit_fill', 'order': 4, 'single': True, 'prompt': True, 'tools': True, 'group': 'fanout', 'fanout': True},
    'merge': {'label': '모으기 · 제목', 'kind': 'llm', 'stage': 'auto_frame_fill', 'order': 5, 'single': True, 'prompt': True, 'group': 'fanout', 'loop': '겹침 · 섞임 칸만 다시'},
    'shorten': {'label': '칸 길이 맞춤', 'kind': 'llm', 'stage': 'auto_part_shorten', 'order': 6, 'single': True, 'prompt': False},
    'agent': {'label': '사용자 정의 단계', 'kind': 'llm', 'stage': 'auto_flow_agent', 'order': 7, 'single': False, 'prompt': True, 'tools': True, 'loop': '도구 호출 → 결과 → 수정',
              'react': True},
    'pictures': {'label': '사진 고르기', 'kind': 'llm', 'stage': 'auto_image', 'order': 8, 'single': True, 'prompt': True, 'loop': '검증 후 다시 고르기'},
    'verify': {'label': '사실 · 요구 검수', 'kind': 'llm', 'stage': 'auto_part_verify', 'order': 9, 'single': True, 'prompt': False, 'loop': '고친 뒤 1회 재검수'},
    'lock': {'label': 'AI 잠금 영역 유지', 'kind': 'code', 'order': 10, 'single': True, 'fixed': True, 'prompt': False},
    # every flow ends here (app/api/poc/layout_final.py): matching · duplicates · the layout's form, observe → reason → act → observe
    'final': {'label': '최종 점검', 'kind': 'llm', 'stage': 'auto_final_check', 'order': 11, 'single': True, 'fixed': True, 'prompt': False, 'react': True,
              'loop': '관찰 → 판단 · 도구 → 고침 → 다시 관찰 (최대 3회)'},
}
REACT = tuple(m for m, s in MODULES.items() if s.get('react'))   # steps that run observe → reason → act loops; every flow has 'final'
WRITERS = ('write', 'agent', 'element')
FANOUT = ('split', 'element', 'merge')   # written element by element — all three, never with 'write'
SPLIT_KINDS = ('generic', 'space', 'scn', 'tech', 'journey')   # market (market.py) · spec data · chrome sheets are written whole
KIND_LABELS = {'cover': '표지', 'toc': '목차', 'divider': '간지', 'bird': '조감도', 'map': '공간 맵', 'space': '공간별 제품', 'scn': '공간 시나리오',
               'scnmap': '활용 맵', 'solution': '솔루션', 'case': '도입 사례', 'dss': '개요', 'static': '고정 장', 'bom': 'BOM', 'tech': '핵심 기술',
               'spec': '제품 스펙', 'journey': '고객 여정', 'market': '시장 · 트렌드', 'generic': '일반'}
DATA_ONLY = ('spec',)   # simple product spec sheets: product data, no requirement context needed
REQ_SOURCES = {'products': 'product_ids', 'solutions': 'solution_ids', 'cases': 'case_ids', 'spaces': 'space_list', 'industry': 'industry',
               'customer': 'customer_name', 'kpis': 'kpis', 'challenges': 'challenges', 'users': 'users', 'competitors': 'competitors',
               'timeline': 'schedule', 'costs': 'budget', 'quantities': 'quantities', 'keymen': 'keymen', 'contacts': 'contacts',
               'sources': 'market_evidence', 'values': 'requirement_points', 'project': 'project_title', 'scenario': 'space_uses',
               'needs': 'requirement_points', 'images': 'used_pictures'}
KIND_INPUTS = {
    'cover': ['customer_name', 'project_title', 'proposal_date'], 'toc': ['section_index'], 'divider': ['section_index'],
    'bird': ['birdseye', 'space_list', 'product_ids'], 'map': ['space_list', 'product_ids'], 'space': ['space_list', 'product_ids'],
    'scn': ['space_list', 'space_uses'], 'scnmap': ['space_list', 'space_uses', 'solution_ids'], 'solution': ['solution_ids'],
    'case': ['case_ids'], 'dss': ['industry'], 'bom': ['product_ids'], 'tech': ['solution_ids'], 'spec': ['product_ids'],
    'journey': ['space_list', 'solution_ids'], 'market': ['industry', 'market_evidence'],
}
MODE_INPUTS = {'product': 'product_ids', 'solution': 'solution_ids', 'case': 'case_ids', 'section': 'section_index'}
FIXED_MODES = ('fixed', 'section', 'pick')
PARAM = re.compile(r'^[a-z][a-z0-9_]{1,39}$')
LIMITS = {'inputs': 30, 'nodes': 20, 'prompt': 4000, 'label': 40, 'sources': 120, 'desc': 200, 'tools': 60, 'node_tools': 6, 'units': 24}

# Tools — reusable across layouts (admin 레이아웃 관리 홈 → 도구). A tool is a type (what runs, app/api/poc/layout_tools.py)
# plus its configuration. On 'write' a tool is called before the part call with `query` (template) and its results go
# with the sheet's directive; on 'agent' the model calls the tools itself (tool calling: calls → results → answer).
QUERY_FIELDS = ('layout', 'part', 'industry', 'customer', 'directive')
TOOL_TYPES = {
    'rag': {'label': 'RAG', 'collections': {'dss': 'DSS 지식(제품 사양 · 솔루션 기능 · 사례 성과)', 'scenarios': '샘플 시나리오 장 문구'},
            'db': {'dss': 'composer/library.json › products_all · solutions · cases + vertical_space_solution.json', 'scenarios': 'composer/library.json › exemplars'}},
    'search': {'label': '검색', 'collections': {'catalog': 'DSS 카탈로그(이름 · 모델 · 분류)', 'images': '사진(설명 · 업종 · 공간)', 'evidence': '근거 DB 문서'},
               'db': {'catalog': 'composer/library.json › products_all · solutions · cases', 'images': 'composer/library.json › images',
                      'evidence': 'app/data/runtime/research/evidence.db › docs'}},
    'web_search': {'label': '웹 검색', 'db': {'': 'market_sources.search — 정책브리핑 · 경제지 자체 검색(robots 준수, 최근 3년)'}},
    'db_lookup': {'label': 'DB 조회', 'db': {'': 'composer/library.json (+ vertical_space_solution.json) — product_fact · solution_knowledge · case_fact'}},
}
WEB_ENGINES = ('korea', 'kdi', 'mk', 'edaily', 'herald', 'hani', 'zdnet')
BASE_TOOLS = [
    {'key': 'rag_dss', 'label': 'RAG · DSS 지식', 'type': 'rag', 'config': {'collection': 'dss', 'top_k': 5, 'query': '{layout} {part} {industry}'},
     'desc': '제품 사양 · 솔루션 기능 · 사례 성과에서 질의와 가까운 지식 조각'},
    {'key': 'rag_scenarios', 'label': 'RAG · 샘플 시나리오 문구', 'type': 'rag', 'config': {'collection': 'scenarios', 'top_k': 4, 'query': '{layout} {part}'},
     'desc': '샘플 버티컬 시나리오에서 비슷한 장에 실제로 쓴 문구'},
    {'key': 'web_search', 'label': '웹 검색 · 시장 자료', 'type': 'web_search', 'config': {'engines': ['korea', 'mk', 'edaily', 'herald', 'hani', 'zdnet'], 'limit': 6, 'query': '{industry} {part}'},
     'desc': '정책브리핑 · 경제지의 최근 기사 · 보도자료'},
    {'key': 'evidence_search', 'label': '근거 DB 검색', 'type': 'search', 'config': {'collection': 'evidence', 'limit': 6, 'query': '{industry} {part}'},
     'desc': '이전 시장 조사에서 모은 문서'},
    {'key': 'catalog_search', 'label': 'DSS 카탈로그 검색', 'type': 'search', 'config': {'collection': 'catalog', 'limit': 8, 'query': '{part} {directive}'},
     'desc': '제품 · 솔루션 · 사례를 이름 · 모델 · 분류로 찾기'},
    {'key': 'image_search', 'label': '사진 검색', 'type': 'search', 'config': {'collection': 'images', 'limit': 8, 'query': '{industry} {layout}'},
     'desc': '사진을 설명 · 업종 · 공간으로 찾기'},
    {'key': 'dss_lookup', 'label': 'DSS 사실 조회', 'type': 'db_lookup', 'config': {'limit': 8, 'query': '{part}'},
     'desc': '이 제안서에 연결한 제품 · 솔루션 · 사례의 사실(이름 · 모델 · 사양 · 기능 · 성과)'},
]


class Conflict(ValueError):
    pass


def path() -> Path:
    return Path(os.environ.get('WINMATE_LAYOUT_FLOWS', ROOT / 'app/data/runtime/layout_flows.json'))


def load() -> dict:
    try:
        value = live.read(path())
    except FileNotFoundError:
        return {'v': 1, 'rev': 0, 'flows': {}, 'sources': {}, 'tools': {}}
    if not isinstance(value, dict) or value.get('v') != 1 or not isinstance(value.get('flows'), dict) or not isinstance(value.get('sources'), dict):
        raise ValueError('레이아웃 입력 · 흐름 데이터를 읽지 못했습니다.')
    return {**value, 'tools': value.get('tools') if isinstance(value.get('tools'), dict) else {}}


def _write(value: dict) -> None:
    target = path()
    fd, tmp = tempfile.mkstemp(prefix='.layout-flows-', dir=target.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(value, out, ensure_ascii=False)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def _commit(rev, change, actor):
    target = path()
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.with_suffix('.lock').open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        previous = load()
        if type(rev) is not int or previous['rev'] != rev:
            raise Conflict('다른 창에서 입력 · 흐름을 바꿨습니다. 다시 불러온 뒤 수정해 주세요.')
        value = copy.deepcopy(previous)
        now = datetime.now(timezone.utc).isoformat()
        change(value, now)
        value.update(rev=rev + 1, updated_at=now, updated_by=actor)
        _write(value)
        return value


IMAGE_WEIGHTS = {'caption': '칸 문구와 사진 설명', 'place': '업종과 공간', 'subject': '연결 제품·사례'}


def image_weights(state=None):
    stored = (load() if state is None else state).get('image_weights', {})
    return {k: stored.get(k, 1) for k in IMAGE_WEIGHTS}


def clean_image_weights(value):
    import math
    if not isinstance(value, dict) or set(value) != set(IMAGE_WEIGHTS) or any(
            type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 3 for v in value.values()):
        raise ValueError('각 검색 가중치는 0부터 3 사이의 숫자로 입력해 주세요.')
    return {k: float(value[k]) for k in IMAGE_WEIGHTS}


def save_image_weights(value, rev, actor):
    weights = clean_image_weights(value)
    return _commit(rev, lambda state, now: state.update(image_weights=weights), actor)


# ---------------------------------------------------------------- sources
def sources(state=None) -> list:
    """the effective catalog: base entries with admin edits, then admin-added entries (off ones included, marked)."""
    state = state or load()
    edits = state.get('sources') or {}
    out = []
    for s in BASE_SOURCES:
        e = edits.get(s['key']) or {}
        out.append({**s, **{k: e[k] for k in ('label', 'desc', 'supply', 'type', 'off') if k in e}, 'base': True, 'always': bool(s.get('always'))})
    for key, e in edits.items():
        if key not in {s['key'] for s in BASE_SOURCES} and e.get('custom'):
            out.append({'key': key, 'label': e['label'], 'type': e.get('type', 'text'), 'group': e.get('group', 'extract'), 'supply': e.get('supply', 'external'),
                        'desc': e.get('desc', ''), 'off': bool(e.get('off')), 'base': False, 'always': False})
    for s in out:
        if s['key'] in ALWAYS:
            s['off'] = False
    return out


def source_map(state=None) -> dict:
    return {s['key']: s for s in sources(state)}


def clean_sources(body) -> dict:
    """[{key, label, type, group, supply, desc, off}] → stored edits (base entries keep only what differs)."""
    if not isinstance(body, list) or len(body) > LIMITS['sources']:
        raise ValueError('입력 소스 목록을 확인해 주세요.')
    base = {s['key']: s for s in BASE_SOURCES}
    out, seen = {}, set()
    for x in body:
        if not isinstance(x, dict):
            raise ValueError('입력 소스 형식이 올바르지 않습니다.')
        key = str(x.get('key') or '')
        if not PARAM.match(key) or key in seen:
            raise ValueError(f'소스 키를 확인해 주세요: {key or "(비어 있음)"} — 영문 소문자 · 숫자 · _ 로 2~40자, 중복 없이.')
        seen.add(key)
        label = str(x.get('label') or '').strip()
        desc = str(x.get('desc') or '').strip()
        if not label or len(label) > LIMITS['label'] or len(desc) > LIMITS['desc']:
            raise ValueError(f'{key}: 이름(40자 이내)과 설명(200자 이내)을 확인해 주세요.')
        typ, group, supply = x.get('type', 'text'), x.get('group', 'extract'), x.get('supply', 'external')
        if typ not in TYPES or group not in GROUPS or supply not in SUPPLY:
            raise ValueError(f'{key}: 형식 · 분류 · 공급 값을 확인해 주세요.')
        off = bool(x.get('off')) and key not in ALWAYS
        if key in base:
            b = base[key]
            diff = {k: v for k, v in (('label', label), ('desc', desc), ('supply', supply), ('type', typ)) if v != b.get(k)}
            if off:
                diff['off'] = True
            if diff:
                out[key] = diff
        else:
            out[key] = {'custom': True, 'label': label, 'desc': desc, 'type': typ, 'group': group, 'supply': supply, **({'off': True} if off else {})}
    missing = [k for k in base if k not in seen]
    if missing:
        raise ValueError('기본 소스는 지울 수 없습니다(끄기만 가능): ' + ', '.join(missing))
    return out


def save_sources(body, rev, actor='admin') -> dict:
    cleaned = clean_sources(body)

    def change(value, now):
        value['sources'] = cleaned
    return _commit(rev, change, actor)


# ---------------------------------------------------------------- tools
def tool_db(t: dict) -> str:
    spec = TOOL_TYPES.get(t.get('type'), {})
    return (spec.get('db') or {}).get((t.get('config') or {}).get('collection', ''), '') or (spec.get('db') or {}).get('', '')


def tools(state=None) -> list:
    """the effective tool registry: base tools with admin edits, then admin-added tools (off ones included, marked)."""
    state = state or load()
    edits = state.get('tools') or {}
    base_keys = {t['key'] for t in BASE_TOOLS}
    out = []
    for t in BASE_TOOLS:
        e = edits.get(t['key']) or {}
        out.append({**copy.deepcopy(t), **{k: copy.deepcopy(e[k]) for k in ('label', 'desc', 'config', 'off') if k in e}, 'base': True})
    for key, e in edits.items():
        if key not in base_keys and e.get('custom'):
            out.append({'key': key, 'label': e['label'], 'type': e['type'], 'config': copy.deepcopy(e.get('config') or {}), 'desc': e.get('desc', ''),
                        'off': bool(e.get('off')), 'base': False})
    for t in out:
        t['db'] = tool_db(t)
        t['off'] = bool(t.get('off'))
    return out


def tool_map(state=None) -> dict:
    return {t['key']: t for t in tools(state)}


def clean_tool_config(typ: str, config) -> dict:
    if not isinstance(config, dict):
        raise ValueError('도구 설정은 JSON 객체여야 합니다.')
    allowed = {'rag': {'collection', 'top_k', 'query'}, 'search': {'collection', 'limit', 'query'}, 'web_search': {'engines', 'limit', 'query'},
               'db_lookup': {'limit', 'query'}}[typ]
    if set(config) - allowed:
        raise ValueError(f"도구 설정에 쓸 수 없는 값이 있습니다: {', '.join(sorted(set(config) - allowed))} (쓸 수 있는 값: {', '.join(sorted(allowed))})")
    out = {}
    query = config.get('query', '')
    if not isinstance(query, str) or len(query) > 200:
        raise ValueError('query 는 200자 이내의 문장이어야 합니다.')
    unknown = set(re.findall(r'\{(\w+)\}', query)) - set(QUERY_FIELDS)
    if unknown:
        raise ValueError(f"query 에 쓸 수 있는 자리는 {', '.join('{' + f + '}' for f in QUERY_FIELDS)} 입니다.")
    out['query'] = query.strip()
    if typ in ('rag', 'search'):
        cols = TOOL_TYPES[typ]['collections']
        if config.get('collection') not in cols:
            raise ValueError(f"collection 은 {', '.join(cols)} 중 하나여야 합니다.")
        out['collection'] = config['collection']
    n_key = 'top_k' if typ == 'rag' else 'limit'
    n = config.get(n_key, 5)
    if type(n) is not int or not 1 <= n <= 12:
        raise ValueError(f'{n_key} 는 1~12 사이의 정수여야 합니다.')
    out[n_key] = n
    if typ == 'web_search':
        engines = config.get('engines', [])
        if not isinstance(engines, list) or not engines or any(e not in WEB_ENGINES for e in engines):
            raise ValueError(f"engines 는 {', '.join(WEB_ENGINES)} 중에서 하나 이상이어야 합니다.")
        out['engines'] = list(dict.fromkeys(engines))
    return out


def clean_tools(body) -> dict:
    """[{key, label, type, config, desc, off}] → stored edits (base tools keep only what differs)."""
    if not isinstance(body, list) or len(body) > LIMITS['tools']:
        raise ValueError('도구 목록을 확인해 주세요.')
    base = {t['key']: t for t in BASE_TOOLS}
    out, seen = {}, set()
    for x in body:
        if not isinstance(x, dict):
            raise ValueError('도구 형식이 올바르지 않습니다.')
        key = str(x.get('key') or '')
        if not PARAM.match(key) or key in seen:
            raise ValueError(f'도구 키를 확인해 주세요: {key or "(비어 있음)"} — 영문 소문자 · 숫자 · _ 로 2~40자, 중복 없이.')
        seen.add(key)
        label, desc = str(x.get('label') or '').strip(), str(x.get('desc') or '').strip()
        if not label or len(label) > LIMITS['label'] or len(desc) > LIMITS['desc']:
            raise ValueError(f'{key}: 이름(40자 이내)과 설명(200자 이내)을 확인해 주세요.')
        typ = base[key]['type'] if key in base else x.get('type')
        if typ not in TOOL_TYPES:
            raise ValueError(f"{key}: 도구 종류는 {', '.join(TOOL_TYPES)} 중 하나여야 합니다.")
        try:
            config = clean_tool_config(typ, x.get('config', {}))
        except ValueError as exc:
            raise ValueError(f'{key}: {exc}') from None
        off = bool(x.get('off'))
        if key in base:
            b = base[key]
            diff = {k: v for k, v in (('label', label), ('desc', desc), ('config', config)) if v != b.get(k)}
            if off:
                diff['off'] = True
            if diff:
                out[key] = diff
        else:
            out[key] = {'custom': True, 'label': label, 'desc': desc, 'type': typ, 'config': config, **({'off': True} if off else {})}
    missing = [k for k in base if k not in seen]
    if missing:
        raise ValueError('기본 도구는 지울 수 없습니다(끄기만 가능): ' + ', '.join(missing))
    return out


def save_tools(body, rev, actor='admin') -> dict:
    cleaned = clean_tools(body)

    def change(value, now):
        value['tools'] = cleaned
    return _commit(rev, change, actor)


def tool_use(state=None) -> dict:
    """tool key → layouts whose edited flow calls it"""
    state = state or load()
    used = {}
    for key, item in state['flows'].items():
        for n in item.get('nodes', []):
            for t in n.get('tools') or []:
                used.setdefault(t, []).append(key)
    return used


# ---------------------------------------------------------------- layouts → base definition
@lru_cache(maxsize=1)
def _fixed_patterns(stamp):
    rules = json.loads(FIXED_RULES.read_text())
    return tuple(re.compile(p) for p in rules.get('sheets', []))


def default_fixed(f: str) -> bool:
    try:
        stamp = FIXED_RULES.stat().st_mtime_ns
    except FileNotFoundError:
        return False
    return any(p.search(f) for p in _fixed_patterns(stamp))


def kind_of(f: str, meta: dict) -> str:
    """the composer's sheet kinds (composer/auto.py slide_kind), read from the layout id and catalog entry."""
    if re.match(r'^L_VS_DIV_R\d$', f):
        return 'divider'
    if f == 'L_VS_TOC' or f.startswith('L_TOC_INDEX'):
        return 'toc'
    if meta.get('p') == 'cover' or meta.get('cover'):
        return 'cover'
    for prefix, kind in (('L_VS_BIRD_', 'bird'), ('L_VS_MAP_', 'map')):
        if f.startswith(prefix):
            return kind
    if f == 'L_VS_SPACE' or re.match(r'^L_VS_SPACE_P\d$', f):
        return 'space'
    if re.match(r'^L_TOC_SCN_S\d$', f):
        return 'scn'
    if re.match(r'^L_TOC_SCN_MAP\d+$', f):
        return 'scnmap'
    if f.startswith('L_VS_SOL_') or meta.get('sol'):
        return 'solution'
    if f == 'L_VS_CASE':
        return 'case'
    if f.startswith('L_VS_DSS'):
        return 'dss'
    if re.match(r'^(L_VS_WHY_\d|L_VS_END|L_SUB_\w+)$', f):
        return 'static'
    for prefix, kind in (('L_TOC_BOM', 'bom'), ('L_TOC_TECH', 'tech'), ('L_TOC_JOURNEY', 'journey')):
        if f.startswith(prefix):
            return kind
    if f.startswith('L_TOC_SPEC') or f == 'L_TOC_PSPEC':
        return 'spec'
    if meta.get('p') == 'market':
        return 'market'
    return 'generic'


def _quote(g: str) -> str:
    m = re.search(r'[“"]([^”"]{4,80})[”"]', g or '')
    return m.group(1) if m else ''


def default_write_prompt(f: str, meta: dict, kind: str) -> str:
    says = (layout_cells.design(f).get('say') or '').strip() or _quote(meta.get('g') or '')
    head = f"‘{meta.get('name') or f}’ 장" + (f" — 이 장이 말할 것: “{says}”" if says else '')
    rule = {
        'cover': '고객사 이름과 제안 제목, 덱 핵심 메시지 한 줄을 씁니다.',
        'toc': '파트마다 한 줄 설명과 키워드를 그 파트가 실제로 다루는 내용으로 씁니다.',
        'divider': '장 설명 한 줄과 이 파트 뒤 장들의 제목과 같은 항목 이름을 씁니다.',
        'bird': '공간 이름은 공간 목록 그대로, 공간마다 그 공간에 놓인 제품만 씁니다.',
        'map': '공간 이름은 공간 목록 그대로, 공간마다 그 공간에 놓인 제품만 씁니다.',
        'space': '이 공간과 이 공간에 놓인 제품의 사실만 씁니다.',
        'scn': '공간마다 시나리오를 그 공간의 제품 · 솔루션 · 서비스가 하는 일로 씁니다.',
        'scnmap': '공간 · 솔루션 · 서비스 표시는 정해진 값 그대로 둡니다.',
        'solution': '이 솔루션의 기능은 그대로 두고 적용 공간 · 대표 장면을 이 고객의 공간으로 씁니다.',
        'case': '이 사례의 고객 · 성과 사실만 씁니다.',
        'tech': '열마다 그 열 솔루션 · 제품 자료에 적힌 일만 씁니다.',
        'spec': '열마다 그 열 제품의 자료에 있는 항목 · 값만 씁니다.',
        'journey': '공간별 장면을 이 솔루션의 켜진 기능이 그 공간에서 하는 일로 씁니다.',
        'bom': '품목 · 수량은 공간 목록과 제품 자료 그대로 씁니다.',
        'market': '수치는 업종 트렌드 근거에 있는 값만 쓰고, 출처 칸에 그 출처를 씁니다.',
    }.get(kind, '파트 지시의 핵심을 제목으로 세우고, 이 장이 맡은 요구에 칸마다 하나씩 답합니다.')
    return f"{head}. {rule}"


ELEMENT_PROMPTS = {
    'L_VS_NEEDS': ('이 행은 고객 요구 하나와 그 요구에 답하는 항목 하나입니다. ‘고객의 요구’ 칸은 요구 원문(text)의 지금 불편 · 바람을 고객이 직접 말하듯 '
                   '한 문장으로(“…했으면 해요” · “…하고 싶어요”) — 해법 · 제품 이름 · answer 문구는 쓰지 않습니다. ‘해결 방식’ 칸은 그 항목이 이 요구에 하는 일을 '
                   '짧은 제안 이름으로(예: ‘객실 TV 원격 일괄 관리’ — 항목 이름만 쓰지 않고, 아래 두 칸의 말을 되풀이하지 않음), 실행 · 검증 항목 두 칸은 그 제안을 '
                   '실제로 하는 서로 다른 일입니다. 항목이 없는 행은 요구에서 이어지는 운영 · 절차 제안으로 씁니다.'),
    'core': ('이 행은 니즈 장의 한 행을 푸는 세부 제안 하나입니다. 이름표의 항목이 자료에 적힌 대로 할 수 있는 일로 세부 제안 · 설명을 쓰고, '
             '세 단계는 그 일이 고객 현장에서 일어나는 순서(지금 → 바꾸는 일 → 달라지는 것)로 씁니다.'),
    'space_p': '이 카드는 제품 ‘{entity}’ 하나입니다. 이 제품의 자료(모델 · 사양 · 기능)에서 이 공간에서 쓰이는 특징만 고르고, 특징 제목과 설명은 같은 특징을 말합니다.',
    'scn': ('이 공간 ‘{entity}’ 의 장면 하나를 한 문장으로 씁니다 — 누가(직원 · 고객) 이 공간에서 제품 · 솔루션 한두 가지로 무엇을 하고 무엇이 나아지는지. '
            '놓인 제품 · 솔루션 이름을 나열하지 않습니다(이름 칸은 따로 있습니다).'),
    'product': '이 요소는 제품 ‘{entity}’ 하나만 다룹니다. 그 제품의 자료에 있는 사실로 씁니다.',
    'solution': '이 요소는 솔루션 ‘{entity}’ 하나만 다룹니다. 자료에 적힌 기능으로 씁니다.',
    'case': '이 요소는 사례 ‘{entity}’ 하나의 고객 · 성과 사실만 씁니다.',
    'space': '이 요소는 공간 ‘{entity}’ 하나입니다. 그 공간에 놓인 제품 · 쓰는 솔루션으로 씁니다.',
    'point': '이 요소는 맡은 고객 요구 하나에 답합니다.',
    'topic': '이 요소는 이 장의 메시지 가운데 다른 요소와 겹치지 않는 한 면을 맡습니다. 맡은 요구가 있으면 그 요구에 답합니다.',
}


def default_element_prompt(f: str, plan: dict) -> str:
    own = (layout_cells.design(f).get('element') or '').strip()
    if own and f != 'L_VS_NEEDS' and not f.startswith('L_VS_CORE_'):
        return own
    if f == 'L_VS_NEEDS':
        return ELEMENT_PROMPTS['L_VS_NEEDS']
    if re.match(r'^L_VS_CORE_\d$', f):
        return ELEMENT_PROMPTS['core']
    if re.match(r'^L_VS_SPACE_P\d$', f):
        return ELEMENT_PROMPTS['space_p']
    if re.match(r'^L_TOC_SCN_S\d$', f):
        return ELEMENT_PROMPTS['scn']
    kinds = [u['entity'] for u in plan['units'] if u.get('writable')]
    top = max(set(kinds), key=kinds.count) if kinds else 'topic'
    return ELEMENT_PROMPTS.get(top, ELEMENT_PROMPTS['topic'])


def default_picture_prompt(kind: str) -> str:
    return {
        'space': '그 공간이 실제로 보이고, 이 공간의 제품이 놓인 사진.',
        'bird': '공간 목록의 공간이 보이는 사진.',
        'map': '공간 목록의 공간이 보이는 사진.',
        'case': '이 사례 고객의 실제 현장 사진.',
        'solution': '이 솔루션이 쓰이는 장면 사진.',
    }.get(kind, '칸 옆 문구가 말하는 공간 · 제품이 보이는 사진.')


def _input(src: dict, required: bool) -> dict:
    return {'param': src['key'], 'source': src['key'], 'required': bool(required)}


def base_flow(f: str, meta: dict, slots: list, fill: str = 'inherit') -> dict:
    """the definition that matches what the composer does for this sheet today."""
    kind = kind_of(f, meta)
    whole_fixed = fill == 'fixed' or (fill == 'inherit' and default_fixed(f))
    modes = [s['mode'] for s in slots]
    text_ai = any(s['kind'] == 't' and s['mode'] == 'ai' for s in slots)
    images = [s for s in slots if s['kind'] == 'img']
    writing = text_ai and not whole_fixed and kind not in ('static',)
    if kind != 'static' and not whole_fixed and slots and all(m in FIXED_MODES for m in modes):
        writing = False
    srcs = {s['key']: s for s in BASE_SOURCES}
    want = {}   # key → required

    def need(key, required=False):
        if key in srcs:
            want[key] = want.get(key, False) or required
    if writing and kind not in DATA_ONLY:
        for key in ALWAYS:
            need(key, True)
    if not whole_fixed:
        for key in KIND_INPUTS.get(kind, []):
            need(key, True)
        for m in modes:
            if m in MODE_INPUTS:
                need(MODE_INPUTS[m], True)
        for r in meta.get('req') or []:
            if r in REQ_SOURCES and (r != 'images' or images):
                need(REQ_SOURCES[r])
        if writing and ({'kpis', 'quantities', 'values'} & set(meta.get('req') or [])):
            need('customer_figures')
        if writing and kind not in DATA_ONLY:
            need('requirement_points')
    order = [s['key'] for s in BASE_SOURCES]
    inputs = [_input(srcs[k], want[k]) for k in sorted(want, key=lambda k: (k not in ALWAYS, order.index(k)))]
    nodes = [{'id': 'collect', 'module': 'collect'}]
    binds = (not whole_fixed and (any(m in MODE_INPUTS or m == 'pick' for m in modes)
                                  or kind in ('bird', 'map', 'space', 'scn', 'scnmap', 'solution', 'case', 'bom', 'tech', 'spec', 'journey', 'toc', 'divider', 'market')))
    if binds:
        nodes.append({'id': 'bind', 'module': 'bind'})
    params = [i['param'] for i in inputs]
    elements = layout_elements.plan_for(f) if writing else None
    if elements is not None:   # 칸 설계 decides per layout whether its elements are written one by one
        choice = layout_cells.design(f).get('split')
        if isinstance(choice, bool):
            elements['split'] = choice and sum(1 for u in elements['units'] if u.get('writable')) >= 2
    if writing and elements and elements['split'] and kind in SPLIT_KINDS:
        reads = [p for p in params if p != 'used_pictures']
        nodes.append({'id': 'split', 'module': 'split'})
        nodes.append({'id': 'element', 'module': 'element', 'prompt': default_element_prompt(f, elements), 'reads': reads})
        nodes.append({'id': 'merge', 'module': 'merge', 'prompt': default_write_prompt(f, meta, kind), 'reads': reads})
        nodes.append({'id': 'shorten', 'module': 'shorten'})
    elif writing:
        nodes.append({'id': 'write', 'module': 'write', 'prompt': default_write_prompt(f, meta, kind), 'reads': [p for p in params if p != 'used_pictures']})
        nodes.append({'id': 'shorten', 'module': 'shorten'})
    if images and not whole_fixed and kind not in ('static', 'toc', 'dss'):
        nodes.append({'id': 'pictures', 'module': 'pictures', 'prompt': default_picture_prompt(kind),
                      'reads': [p for p in params if p in ('space_list', 'product_ids', 'solution_ids', 'case_ids', 'industry', 'used_pictures')]})
    if writing:
        nodes.append({'id': 'verify', 'module': 'verify'})
    nodes.append({'id': 'lock', 'module': 'lock'})
    nodes.append({'id': 'final', 'module': 'final'})
    return {'inputs': inputs, 'nodes': nodes, 'kind': kind, 'writing': writing, 'whole_fixed': whole_fixed, 'modes': sorted(set(modes)),
            'elements': elements}


def representative(f: str, layouts: dict) -> str:
    meta = layouts.get(f) or {}
    return meta.get('variantOf') or f


def _sheet(f: str):
    catalog, layouts, html = live.base()
    if f not in layouts or f not in html:
        raise KeyError(f)
    rep = representative(f, layouts)
    state = live.load()
    item = live.effective_items(state, layouts).get(rep, {}) or live.effective_items(state, layouts).get(f, {})
    key = rep if rep in html else f
    return key, layouts.get(key) or layouts[f], live.slots(live.apply_html(html[key], item)), item.get('fill', 'inherit')


@lru_cache(maxsize=2048)
def _base_cached(f: str, lib_rev: int, mtime: int):
    key, meta, slots, fill = _sheet(f)
    return key, base_flow(key, meta, slots, fill)


def _lib_stamp():
    try:
        mtime = live.path().stat().st_mtime_ns
    except FileNotFoundError:
        mtime = 0
    for extra in (ROOT / 'app/data/runtime/kb/catalog.json', layout_cells.path()):   # 칸 설계 changes the base prompts · split
        try:
            mtime += extra.stat().st_mtime_ns
        except FileNotFoundError:
            pass
    return live.load()['rev'], mtime


def base_for(f: str):
    """(flow key = representative layout, base definition)"""
    return copy.deepcopy(_base_cached(f, *_lib_stamp()))


# ---------------------------------------------------------------- validation
def normalize(flow: dict, kind: str, catalog: dict, base: dict, toolcat: dict = None) -> dict:
    """validated flow; mandatory parts are put back instead of failing (collect · lock · base bind · required context)."""
    if not isinstance(flow, dict) or set(flow) - {'inputs', 'nodes'}:
        raise ValueError('입력 · 흐름 형식을 확인해 주세요.')
    raw_inputs, raw_nodes = flow.get('inputs', []), flow.get('nodes', [])
    if not isinstance(raw_inputs, list) or not isinstance(raw_nodes, list) or len(raw_inputs) > LIMITS['inputs'] or len(raw_nodes) > LIMITS['nodes']:
        raise ValueError(f"입력은 {LIMITS['inputs']}개, 단계는 {LIMITS['nodes']}개 이하여야 합니다.")
    inputs, params = [], set()
    for x in raw_inputs:
        if not isinstance(x, dict) or set(x) - {'param', 'source', 'required'}:
            raise ValueError('입력 항목 형식을 확인해 주세요.')
        param, source = str(x.get('param') or ''), str(x.get('source') or '')
        if not PARAM.match(param) or param in params:
            raise ValueError(f'입력 이름을 확인해 주세요: {param or "(비어 있음)"} — 영문 소문자 · 숫자 · _, 중복 없이.')
        if source not in catalog or catalog[source].get('off'):
            raise ValueError(f'{param}: 소스 “{source}” 를 찾지 못했거나 꺼져 있습니다.')
        params.add(param)
        inputs.append({'param': param, 'source': source, 'required': bool(x.get('required'))})
    # a writing flow always receives the requirement summary and the part directive (simple spec sheets excepted)
    if kind not in DATA_ONLY and any(isinstance(x, dict) and x.get('module') in WRITERS for x in raw_nodes):
        for key in ALWAYS:
            hit = next((i for i in inputs if i['source'] == key), None)
            if hit:
                hit['required'] = True
            elif key not in params:
                inputs.insert(0, {'param': key, 'source': key, 'required': True})
                params.add(key)
    nodes, ids = [], set()
    for x in raw_nodes:
        if not isinstance(x, dict) or set(x) - {'id', 'module', 'label', 'prompt', 'reads', 'tools', 'units'}:
            raise ValueError('단계 형식을 확인해 주세요.')
        module = x.get('module')
        if module not in MODULES:
            raise ValueError(f'알 수 없는 모듈입니다: {module}')
        spec = MODULES[module]
        nid = str(x.get('id') or module)
        if not re.match(r'^[a-z][a-z0-9_-]{0,39}$', nid) or nid in ids:
            raise ValueError(f'단계 ID 를 확인해 주세요: {nid}')
        if spec['single'] and any(n['module'] == module for n in nodes):
            raise ValueError(f"‘{spec['label']}’ 단계는 한 번만 넣을 수 있습니다.")
        ids.add(nid)
        node = {'id': nid, 'module': module}
        label = str(x.get('label') or '').strip()
        if label:
            if len(label) > LIMITS['label']:
                raise ValueError('단계 이름은 40자 이내로 써 주세요.')
            node['label'] = label
        if spec['prompt']:
            prompt = str(x.get('prompt') or '').strip()
            if len(prompt) > LIMITS['prompt']:
                raise ValueError(f"프롬프트는 {LIMITS['prompt']}자 이내로 써 주세요.")
            if module == 'agent' and not prompt:
                raise ValueError('사용자 정의 단계에는 프롬프트가 필요합니다.')
            node['prompt'] = prompt
            reads = x.get('reads', [])
            if not isinstance(reads, list) or any(r not in params for r in reads):
                raise ValueError(f"‘{label or spec['label']}’ 단계가 읽는 입력이 입력 목록에 없습니다.")
            node['reads'] = list(dict.fromkeys(reads))
        if spec.get('tools') and x.get('tools'):
            names = x['tools']
            cat = toolcat if toolcat is not None else tool_map()
            if not isinstance(names, list) or len(names) > LIMITS['node_tools'] or any(t not in cat or cat[t].get('off') for t in names):
                raise ValueError(f"‘{label or spec['label']}’ 단계의 도구를 확인해 주세요(켜진 도구 {LIMITS['node_tools']}개 이하).")
            node['tools'] = list(dict.fromkeys(names))
        if module == 'element' and x.get('units'):
            node['units'] = _clean_units(x['units'], base)
        nodes.append(node)
    present = {n['module'] for n in nodes}
    if present & set(FANOUT):
        if 'write' in present:
            raise ValueError('‘문구 작성’ 과 ‘요소별 작성’ 은 함께 둘 수 없습니다 — 한 번에 쓰기 또는 요소별로 나눠 쓰기 가운데 하나.')
        if not ((base.get('elements') or {}).get('units')):
            raise ValueError('이 레이아웃에는 나눠 쓸 요소(카드 · 행 · 열)가 없습니다.')
        for module in FANOUT:   # the three run together
            if module not in present:
                spec = MODULES[module]
                nodes.append({'id': module if module not in ids else module + '-1', 'module': module,
                              **({'prompt': '', 'reads': []} if spec['prompt'] else {})})
    for module in ('collect', 'lock', 'final') + (('bind',) if any(n['module'] == 'bind' for n in base['nodes']) else ()):
        if not any(n['module'] == module for n in nodes):
            nodes.append({'id': module if module not in ids else module + '-1', 'module': module})
    nodes.sort(key=lambda n: MODULES[n['module']]['order'])   # stable: agent steps keep their order
    order = {k: n for n, k in enumerate(catalog)}
    inputs.sort(key=lambda i: (i['source'] not in ALWAYS, order.get(i['source'], 999)))
    return {'inputs': inputs, 'nodes': nodes}


def _clean_units(units, base) -> list:
    """per-element prompt overrides: [{id, prompt}] — ids of this layout's elements only."""
    known = {u['id'] for u in (base.get('elements') or {}).get('units') or []}
    if not isinstance(units, list) or len(units) > LIMITS['units']:
        raise ValueError('요소 지시 형식을 확인해 주세요.')
    out = []
    for u in units:
        if not isinstance(u, dict) or set(u) - {'id', 'prompt'} or u.get('id') not in known:
            raise ValueError('요소 지시의 요소를 찾지 못했습니다.')
        prompt = str(u.get('prompt') or '').strip()
        if len(prompt) > LIMITS['prompt']:
            raise ValueError(f"프롬프트는 {LIMITS['prompt']}자 이내로 써 주세요.")
        if prompt and not any(x['id'] == u['id'] for x in out):
            out.append({'id': u['id'], 'prompt': prompt})
    return out


# ---------------------------------------------------------------- effective flows
def flow_for(f: str, state=None) -> dict:
    """{key, flow, base, edited, kind} — `flow` is what runs."""
    state = state or load()
    key, base = base_for(f)
    kind = base['kind']
    stored = state['flows'].get(key)
    cat = source_map(state)
    off = {i['param'] for i in base['inputs'] if cat.get(i['source'], {}).get('off')}
    if off:   # a source switched off in the catalog leaves the base definition too
        base['inputs'] = [i for i in base['inputs'] if i['param'] not in off]
        base['nodes'] = [{**n, 'reads': [r for r in n['reads'] if r not in off]} if 'reads' in n else n for n in base['nodes']]
    flow = {'inputs': base['inputs'], 'nodes': base['nodes']}
    edited = False
    if stored:
        # a source switched off (or removed) since the edit leaves the flow; the rest of the edit stays
        gone = {i.get('param') for i in stored.get('inputs', []) if i.get('source') not in cat or cat[i.get('source')].get('off')}
        inputs = [i for i in stored.get('inputs', []) if i.get('param') not in gone]
        tcat = tool_map(state)
        live_tool = lambda t: t in tcat and not tcat[t].get('off')   # a tool switched off in the registry leaves the step
        nodes = [{**n, **({'reads': [r for r in n['reads'] if r not in gone]} if isinstance(n.get('reads'), list) else {}),
                  **({'tools': [t for t in n['tools'] if live_tool(t)]} if isinstance(n.get('tools'), list) else {})} for n in stored.get('nodes', [])]
        try:
            flow = normalize({'inputs': inputs, 'nodes': nodes}, kind, cat, base, tcat)
            edited = True
        except ValueError:
            flow = {'inputs': base['inputs'], 'nodes': base['nodes']}   # a source switched off since: the base definition runs
    return {'key': key, 'flow': flow, 'base': {'inputs': base['inputs'], 'nodes': base['nodes']}, 'edited': edited, 'kind': kind,
            'writing': base['writing'], 'whole_fixed': base['whole_fixed'], 'modes': base['modes'], 'elements': base.get('elements'),
            'updated_at': (stored or {}).get('updated_at'), 'updated_by': (stored or {}).get('updated_by')}


def _step(db, objects, do):
    return {'db': db, 'objects': objects, 'do': do}


LIB = 'app/data/runtime/composer/library.json'


def logic_for(kind: str, flow: dict, modes) -> dict:
    """what each step reads (DB · objects) and does in the composer, for this sheet — shown in the step popup.
    `builtin` are the lookups the step already makes inside the pipeline (tool calls of the code, not editable)."""
    src = {i['source'] for i in flow['inputs']}
    modes = set(modes or ())
    collect = [
        _step('Storyboard 요청 › proposal', 'req.form(고객 · 제목 · 비고 · 키맨) · req.free · req.files[].text · ctx.products · solutions · cases', 'context.from_app_proposal → 문단별 원문 R1…'),
        _step('Storyboard 요청 › requirement_context', 'sections · points', 'summary_text (1,800자)'),
        _step('Storyboard 요청 › space_plan · layout_inputs', 'spaces[].products · birdseye · {소스 키: 값}', 'clean_space_plan · clean_layout_inputs'),
        _step(LIB, 'products_all · solutions · cases · verticals[vid].spaces', '선택 ID 확인 · 업종 공간 후보'),
        _step('orchestrator 계획 (auto_plan)', 'plan.parts[파트].message · brief.requirements · brief.facts', 'part_directive'),
    ]
    bind, builtin_bind = [], []
    if src & {'product_ids'} or 'product' in modes or kind in ('spec', 'space', 'bird', 'map', 'bom'):
        bind.append(_step(LIB + ' › products_all[pid]', 'name · model · cat · spec · specs[] · th(제품 컷)', 'product_fact → 제품 칸 · 제품 사진'))
        builtin_bind.append('dss_lookup')
    if src & {'solution_ids'} or 'solution' in modes or kind in ('solution', 'tech', 'journey', 'scn', 'scnmap'):
        bind.append(_step(LIB + ' › solutions[sid] · sol_tech · sol_keys', 'name · cat · desc · 키워드 · 아이콘', 'solution_fact'))
        bind.append(_step('app/data/vertical_space_solution.json › solution_catalog', 'groups[].features(name · desc) · assets/toc/icons/*.on.png', 'solution_knowledge'))
        builtin_bind.append('dss_lookup')
    if src & {'case_ids'} or 'case' in modes or kind == 'case':
        bind.append(_step(LIB + ' › cases[cid]', 'cust · title · sub · ind · prod · url · 사진', 'case_fact · case_photos'))
        builtin_bind.append('dss_lookup')
    if src & {'space_list', 'space_uses', 'birdseye'} or kind in ('space', 'bird', 'map', 'scn', 'scnmap', 'bom', 'journey'):
        bind.append(_step('Storyboard space_plan + ' + LIB + ' › verticals[vid].spaces', 'spaces[].name · products', '공간 순서 · 공간별 제품 묶기'))
    if src & {'space_uses'} or kind in ('scn', 'scnmap'):
        bind.append(_step('app/data/vertical_space_solution.json › verticals[vid]', '공간별 솔루션 · 서비스 · 기능', 'scn_uses · scn_rows'))
    if 'section' in modes or 'section_index' in src:
        bind.append(_step('orchestrator outline', 'parts[].no · name · 쪽', 'number_deck → 목차 번호 · 제목'))
    if 'pick' in modes:
        bind.append(_step('app/data/runtime/kb/layout_variants.json', 'groups[f].members (업종 후보)', '고른 업종 후보 값 유지'))
    if kind == 'market' or 'market_evidence' in src:
        bind.append(_step('app/data/runtime/research/evidence.db + 웹 검색', 'evidence(kind · value · unit · 출처 url)', 'market_research.apply → 검증한 시장 수치 · 출처 칸'))
        builtin_bind += ['evidence_search', 'web_search']
    if kind in ('dss', 'static'):
        bind.append(_step('app/web/src/domain/templates/fixed_content.json', 'parts · sheets', '업종 덱 장 그대로'))
    return {
        'collect': {'steps': collect, 'builtin': []},
        'bind': {'steps': bind, 'builtin': list(dict.fromkeys(builtin_bind))},
        'write': {'steps': [_step('칸 묶음 작성 호출 (auto_part_fill) — 장마다 칸 8개 이하 · 카드 칸은 함께 · 동시에',
                                  '이 장의 요구 · 이 장 항목의 자료 · 장 목적 · 이 장 지시 · 이 장 입력 · 도구 결과 · 칸(i · max) — 프롬프트 3,200자 이하',
                                  'llm.json → 묶음별 t[i] → 장 · 파트로 모음 · 빠진 칸만 다시(장마다 묶음)')],
                  'builtin': ['dss_lookup']},
        'split': {'steps': [
            _step(LIB + ' › layouts[f].texts · images · toc_slots[f]', '칸 위치 · 크기 · 이름(nm0 · kw0_1 …)', 'layout_elements.plan_for → 요소(카드 · 행 · 열) · 장 전체 칸'),
            _step('orchestrator 계획 (auto_plan)', 'plan.points(요구 · products · solutions) · parts[파트].point_ids', '니즈 열 ↔ 요구 · 답하는 항목(need_columns · column_items) · 핵심 제안 행 ↔ 항목'),
            _step('Storyboard space_plan · ' + LIB + ' › products_all · solutions · cases', 'bind.products · spaces · 공간별 제품 · 솔루션', '요소마다 담당 항목 하나(카드 j ↔ 제품 j · 공간 k) · 항목 칩은 코드가 씀')],
                  'builtin': ['dss_lookup']},
        'element': {'steps': [_step('요소별 작성 호출 (auto_unit_fill) — 요소마다 따로 · 동시에', '그 요소의 칸(i · max) · 담당 항목의 자료만 · 맡은 요구 · 요소 지시 · 다른 요소 이름(겹치지 않게)', 'llm.json → 요소 칸 값')],
                    'builtin': ['dss_lookup']},
        'merge': {'steps': [_step('요소 결과 + 같은 파트의 다른 장', '요소 칸 값 · 담당 항목 이름', '같은 말 · 다른 요소 항목 이름 · 빈 칸 → 그 칸만 다시(auto_unit_repair)'),
                            _step('장 전체 칸 (auto_frame_fill)', '요소 결과 · 이 장 지시', 'llm.json → 제목 · 부제')], 'builtin': []},
        'shorten': {'steps': [_step('파트 작성 결과', 'max 를 넘은 칸(s · i · v)', 'llm.json → 줄인 문구(사실 · 모델 · 수량 보존)')], 'builtin': []},
        'agent': {'steps': [_step('이 장 (작성 뒤)', 'AI 칸(i · v · max) · 읽는 입력 · 도구 목록', 'llm.json → calls(도구 · 질의) → 도구 결과 → items(i · v)')], 'builtin': []},
        'pictures': {'steps': [_step(LIB + ' › images', '사진(src · desc · kind · 업종 · 공간 · 크기)', 'pictures.candidates(규칙 거르기 · 칸 비율) → auto_image 고르기 → auto_image_verify')],
                     'builtin': ['image_search']},
        'verify': {'steps': [_step('칸 묶음 검수 호출 (auto_part_verify) — 장마다 칸 12개 이하 · 동시에',
                                   '그 칸들의 실제 값 · 그 장이 답할 요구(원문) · 그 장 항목의 자료 — 프롬프트 3,200자 이하',
                                   'coverage · issues · fixes → 파트로 모음(요구는 어느 장이든 답하면 됨) → 고친 장만 1회 재검수')],
                   'builtin': ['dss_lookup']},
        'lock': {'steps': [
            _step('app/data/runtime/layout_library.json › items[f]', 'modes.t · modes.img · fill · t · img', 'AI 잠금 칸 = 잠금 값'),
            _step('app/data/runtime/kb/layout_html.json.gz › [f]', 'data-tb · data-img 원래 문구 · 사진', '_layout_out → ov.t · ov.img'),
            _step('app/web/src/domain/templates/fixed_content.json', 'parts · sheets', '장 · 파트 전체 잠금 규칙')], 'builtin': []},
        'final': {'steps': [
            _step('이 장 (모든 단계 뒤) · app/data/layout_cells.json · ' + LIB + ' › layouts[f]',
                  '칸 값 · 칸의 일 · 원래 레이아웃 내용의 형식 · 요소(카드) · 사진(img_meta)',
                  '관찰(코드) — 고르지 않은 이름 · 카드와 다른 항목 · 같은 말 · 같은 항목 이름 · 같은 사진 · 형식(숫자 · 기호 · 길이 · 빈칸 · 칸 폭)'),
            _step('판단 (auto_final_check · Decision layout.final) — 고정 지시 + 이 레이아웃의 메타데이터 + 1차 값, 카드마다 · 동시에',
                  '메타데이터(AI 채움 칸 · 사진의 묶음 · key 칸 · 칸의 일 · 형식) · 1차 값 · 관찰 · 도구 결과(item · image · template)',
                  'thought · calls → 도구 → fixes · clear · images / Decision: 칸마다 맞음 · 다른 일 · 다른 항목 → 걸린 칸만 auto_final_fix'),
            _step('고침 → 다시 관찰', 'AI 칸만(잠금 · 코드가 정한 칸 제외)', '칸 다시 쓰기 · 비우기 · 제품 사진 바꾸기 · 같은 사진 숨김 → 남은 것은 검토 항목')],
            'builtin': ['dss_lookup']},
    }


def _span(ids) -> str:
    """'1–3, 5, 7' — a list of cell ids, runs shortened"""
    nums = sorted({int(i) for i in ids if str(i).isdigit()})
    out, k = [], 0
    while k < len(nums):
        j = k
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(str(nums[k]) if j == k else f'{nums[k]}–{nums[j]}' if j > k + 1 else f'{nums[k]}, {nums[j]}')
        k = j + 1
    return ', '.join(out) or '없음'


def io_for(kind: str, flow: dict, slots: list, elements=None, whole_fixed: bool = False, catalog=None) -> dict:
    """{module: {in: {key: 'type — what'}, out: {…}}} — what each step of this sheet's flow reads from and writes to the sheet's
    state. The same on the LLM and the decision branch (a decision branch keeps the step's interface)."""
    cat = catalog or source_map()
    types = {i['param']: (cat.get(i['source']) or {}).get('type', '?') for i in flow['inputs']}
    texts = [s for s in slots if s['kind'] == 't']
    pics = [s for s in slots if s['kind'] == 'img']
    ai = [] if whole_fixed else [s['id'] for s in texts if s['mode'] == 'ai']
    data = [] if whole_fixed else [s['id'] for s in texts if s['mode'] in MODE_INPUTS]
    held = [s['id'] for s in texts if whole_fixed or s['mode'] in FIXED_MODES]
    open_img = [] if whole_fixed else [s['id'] for s in pics if s['mode'] not in FIXED_MODES]
    held_img = [s['id'] for s in pics if whole_fixed or s['mode'] in FIXED_MODES]
    units = [u for u in (elements or {}).get('units') or [] if u.get('writable')]
    frame = (elements or {}).get('frame') or []
    src = {i['source'] for i in flow['inputs']}

    def reads(n):
        return {p: types.get(p, '?') for p in (n.get('reads') or []) if p in types}

    def tools(n):
        return {'tools': f"object[] — 도구 결과 ({' · '.join(n['tools'])})"} if n.get('tools') else {}
    out = {}
    for n in flow['nodes']:
        m = n['module']
        if m == 'collect':
            io = {'in': dict(types), 'out': {'requirements': 'object[] — 요구 R1…(원문 · 키맨)', 'part_directive': 'object — 이 장 지시(파트 계획 auto_part_plan)',
                                            'layout_inputs': f'object — 선언한 입력 {len(types)}',
                                            **({'summary': 'text — 요구사항 요약'} if 'requirement_summary' in src else {})}}
        elif m == 'bind':
            keys = ('product_ids', 'solution_ids', 'case_ids', 'space_list', 'space_uses', 'section_index', 'market_evidence', 'birdseye', 'industry')
            io = {'in': {p: t for p, t in types.items() if next((i['source'] for i in flow['inputs'] if i['param'] == p), p) in keys},
                  'out': {'bind': 'object — 이 장의 제품 · 솔루션 · 사례 · 공간', 'facts': 'object — DSS 근거(사양 · 기능 · 성과)',
                          **({'lock': f'{{i: string}} — 코드가 정한 칸 {_span(data)}'} if data else {})}}
        elif m == 'write':
            io = {'in': {**reads(n), 'cells': f'object[] — AI 칸 {len(ai)}(i · max · 칸의 일)', 'lock': 'object — 정해진 칸(쓰지 않음)', **tools(n)},
                  'out': {'t': f'{{i: string}} — 칸 {_span(ai)}'}}
        elif m == 'split':
            io = {'in': {'cells': 'object[] — 칸 위치 · 크기 · 이름', 'requirements': 'object[]', 'bind': 'object'},
                  'out': {'units': f"object[] — 요소 {len(units)}({' · '.join(u['label'] for u in units[:6])}{' …' if len(units) > 6 else ''})",
                          **({'frame': f'칸 {_span(frame)} — 장 전체(제목 · 부제)'} if frame else {})}}
        elif m == 'element':
            cells = [c for u in units for c in u['writable']]
            io = {'in': {'unit': 'object — 요소 하나: 그 칸(i · max) · 담당 항목 자료 · 맡은 요구', **reads(n), **tools(n)},
                  'out': {'t': f'{{i: string}} — 요소 칸 {_span(cells)} (요소마다 따로)'}}
        elif m == 'merge':
            io = {'in': {'t': 'object — 요소 결과', **reads(n)},
                  'out': {'t': f"{{i: string}} — 장 전체 칸 {_span(frame)} · 겹친 요소 칸 다시"}}
        elif m == 'shorten':
            io = {'in': {'t': '{i: string} — max 를 넘은 칸'}, 'out': {'t': '{i: string} — 줄인 칸(사실 · 모델 · 수량 보존)'}}
        elif m == 'agent':
            io = {'in': {'t': 'object — AI 칸(i · v · max)', **reads(n), **tools(n)}, 'out': {'t': '{i: string} — 바꾼 칸'}}
        elif m == 'pictures':
            io = {'in': {**reads(n), 'img': f'object — 사진 칸 {_span(open_img)}', 't': 'object — 장 문구', 'images': 'object[] — 사진 DB 후보'},
                  'out': {'img': f'{{slot: src}} — 사진 칸 {_span(open_img)}'}}
        elif m == 'verify':
            io = {'in': {'t': 'object — 쓴 문구', 'requirements': 'object[]', 'facts': 'object'},
                  'out': {'coverage': 'object[] — 요구마다 답한 칸', 'issues': 'object[] — 칸마다 문제', 't': '{i: string} — 고친 칸'}}
        elif m == 'lock':
            io = {'in': {'t': 'object', 'img': 'object', 'locked': f'칸 {_span(held)} · 사진 {_span(held_img)}'},
                  'out': {'ov.t': 'object — 잠금 칸은 잠금 값', 'ov.img': 'object — 잠금 사진은 원래 사진'}}
        elif m == 'final':
            io = {'in': {'t': 'object', 'img': 'object', 'exemplar': 'object — 레이아웃 원래 내용(형식)', 'roles': 'object — 칸의 일(칸 설계)'},
                  'out': {'t': '{i: string} — 고친 칸', 'img': '{slot: src} — 바꾼 사진', 'issues': 'object[] — 남은 것(검토 항목)'}}
        else:
            io = {'in': {}, 'out': {}}
        out[n['id']] = io
    return out


def view(f: str) -> dict:
    state = load()
    value = flow_for(f, state)
    return {'rev': state['rev'], **value, 'kind_label': KIND_LABELS.get(value['kind'], value['kind']), 'sources': sources(state), 'cells': cells_view(f, state),
            'modules': MODULES, 'groups': GROUPS, 'supply': SUPPLY, 'types': list(TYPES), 'always': list(ALWAYS), 'data_only': value['kind'] in DATA_ONLY,
            'tools': tools(state), 'tool_types': {k: {'label': v['label'], 'collections': v.get('collections', {})} for k, v in TOOL_TYPES.items()},
            'logic': logic_for(value['kind'], value['flow'], value['modes']), 'decision': _decision_view(f, value),
            'io': io_for(value['kind'], value['flow'], _sheet(f)[2], value.get('elements'), value['whole_fixed'], source_map(state))}


def _decision_view(f: str, value: dict) -> dict:
    """the steps of this flow that have a decision-model branch (app/api/poc/layout_decide.py) — shown in the step popup"""
    try:
        from .poc import layout_decide
        return layout_decide.view(f, [n['module'] for n in value['flow']['nodes']])
    except Exception:  # noqa: BLE001 — the view stays without it
        return {}


# ---------------------------------------------------------------- 칸 설계 (per-cell roles) — app/api/layout_cells.py
def cell_list(f: str) -> list:
    """the layout's text cells the AI may write: [{i, sample, mode}] (what the 칸 설계 names)"""
    _, _, slots, _ = _sheet(f)
    return [{'i': int(s['id']) if str(s['id']).isdigit() else s['id'], 'sample': (s.get('value') or '')[:140], 'mode': s['mode']}
            for s in slots if s['kind'] == 't' and s['mode'] not in FIXED_MODES]


def cells_view(f: str, state=None) -> dict:
    key, _ = base_for(f)
    state = state or load()
    over = ((state.get('cells') or {}).get(key) or {}).get('cells') or {}
    base = layout_cells.base_design(f).get('cells') or {}
    return {'cells': {**base, **over}, 'base': base, 'edited': sorted(over), 'list': cell_list(f)}


def save_cells(f: str, cells, rev, actor='admin') -> dict:
    """an admin's roles for some cells of this layout (and its content candidates); a cell set back to its design is dropped"""
    key, _ = base_for(f)
    writable = {str(c['i']) for c in cell_list(f)}
    base = layout_cells.base_design(f).get('cells') or {}
    if not isinstance(cells, dict) or len(cells) > 200:
        raise ValueError('칸 설계 형식을 확인해 주세요.')
    clean = {}
    for k, v in cells.items():
        if str(k) not in writable or not isinstance(v, dict) or set(v) - {'role', 'keep', 'num'}:
            raise ValueError(f'칸 {k}: AI가 쓰는 칸의 역할 · 그대로 둠 · 숫자만 으로 적어 주세요.')
        role = str(v.get('role') or '').strip()
        if len(role) > 80:
            raise ValueError(f'칸 {k}: 역할은 80자 이내로 써 주세요.')
        entry = {x: y for x, y in (('role', role), ('keep', bool(v.get('keep'))), ('num', bool(v.get('num')))) if y}
        if entry != (base.get(str(k)) or {}):
            clean[str(k)] = entry

    def change(value, now):
        value.setdefault('cells', {})
        if clean:
            value['cells'][key] = {'cells': clean, 'updated_at': now, 'updated_by': actor}
        else:
            value['cells'].pop(key, None)
    return _commit(rev, change, actor)


def save_flow(f: str, flow, rev, actor='admin') -> dict:
    key, base = base_for(f)
    cleaned = normalize(flow, base['kind'], source_map(), base, tool_map())

    def change(value, now):
        if cleaned == {'inputs': base['inputs'], 'nodes': base['nodes']}:   # the base definition: no override kept
            value['flows'].pop(key, None)
        else:
            value['flows'][key] = {**cleaned, 'updated_at': now, 'updated_by': actor}
    return _commit(rev, change, actor)


def reset_flow(f: str, rev, actor='admin') -> dict:
    key, _ = base_for(f)

    def change(value, now):
        value['flows'].pop(key, None)
    return _commit(rev, change, actor)


def contracts(fs) -> dict:
    """input contract per layout for whoever sends the Storyboard's values (GET /api/layout-flows)."""
    state = load()
    cat = source_map(state)
    out = {}
    for f in fs:
        try:
            v = flow_for(f, state)
        except KeyError:
            continue
        out[f] = {'kind': v['kind'], 'inputs': [{**i, 'type': cat[i['source']]['type'], 'supply': cat[i['source']]['supply']} for i in v['flow']['inputs'] if i['source'] in cat],
                  'modules': [n['module'] for n in v['flow']['nodes']]}
    return {'rev': state['rev'], 'layouts': out, 'sources': [{k: s[k] for k in ('key', 'label', 'type', 'group', 'supply', 'desc')} for s in sources(state) if not s.get('off')]}


# ---------------------------------------------------------------- composer request values
def clean_layout_inputs(value) -> dict:
    """the request's `layout_inputs` — values that the Storyboard (or whoever refined them) sends by source key."""
    if value is None:
        return {}
    if not isinstance(value, dict) or len(value) > 60 or any(not isinstance(k, str) or not PARAM.match(k) for k in value):
        raise ValueError('layout_inputs 는 소스 키 → 값 객체(60개 이하)여야 합니다.')
    if len(json.dumps(value, ensure_ascii=False)) > 40000:
        raise ValueError('layout_inputs 가 너무 큽니다(40,000자 이하).')
    return value


def module(flow: dict, name: str):
    return [n for n in flow['nodes'] if n['module'] == name]


def has(flow: dict, name: str) -> bool:
    return any(n['module'] == name for n in flow['nodes'])
