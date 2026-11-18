"""모델 입력 — what every model step of one layout's flow actually sends (admin 레이아웃 관리 → 흐름 → 단계).

The sheet runs through the real composer (layout_experiments.run: the same prompts, schemas and decision questions as a
composition) on a sample input (layout_experiments.samples, the first of the chosen industry), twice:
  llm       every step asks the LLM
  decision  the steps with a decision branch take it where this layout has it (app/data/layout_decisions.json · `off`)
No model is called. Stand-ins record each call as it would be sent and answer so the later steps see a real-looking sheet:
the LLM stand-in writes the layout's own content into the cells the prompt asks for (other fields empty: no issues, no
calls), the decision stand-in answers 'ok' (or the first option) with certainty. So follow-up calls that only run when a
model flags something (auto_part_verify_fix · auto_final_fix · repairs) do not appear; the steps say when they run.
Nothing is stored: telemetry is ephemeral and the layout snapshot is request-local, as in an experiment.
"""
from __future__ import annotations

import json
import re
import threading
from types import SimpleNamespace
from typing import Any, Callable, Dict, List, Optional

from .. import layout_flows as flows
from . import layout_decide, layout_experiments as experiments

# composer stage → flow module (app/api/layout_flows.MODULES); decision tasks map through layout_decide.NODE
STAGE_MODULE = {
    'auto_part_plan': 'collect',   # the part orchestrator's plan: this sheet's directive (input part_directive), before the sheet runs
    'auto_part_fill': 'write', 'auto_part_fill_missing': 'write', 'auto_cells_pre': 'write', 'auto_cells_post': 'write',
    'auto_unit_fill': 'element', 'auto_unit_shorten': 'element', 'auto_unit_repair': 'merge', 'auto_frame_fill': 'merge',
    'auto_part_shorten': 'shorten', 'auto_text_shorten': 'shorten', 'auto_flow_agent': 'agent',
    'auto_image': 'pictures', 'auto_image_verify': 'pictures',
    'auto_part_verify': 'verify', 'auto_part_verify_fix': 'verify', 'auto_sheet_redo': 'verify', 'auto_part_review': 'verify',
    'auto_final_check': 'final', 'auto_final_fix': 'final',
}
OK_ANSWERS = ('ok', 'none', 'fine', 'yes', 'keep', 'right', 'same')
CELL = re.compile(r'"i"\s*:\s*(\d+)')
SLOT = re.compile(r'\{[^{}]*?"i"\s*:\s*(\d+)[^{}]*?"max"\s*:\s*(\d+)[^{}]*\}')
LIMIT = 60_000   # characters of one recorded prompt / state (a part brief can be long; the view stays light)


def module_of(stage: str, task: str = '', modules: Optional[List[str]] = None) -> str:
    stage = stage.split(':')[-1]
    if task:
        node = layout_decide.NODE.get(task, '')
        if node == 'write' and modules and 'element' in modules:
            return 'element'
        return node
    if stage.startswith('auto_cells_'):
        stage = 'auto_cells_pre'
    m = STAGE_MODULE.get(stage, '')
    if m == 'write' and modules and 'write' not in modules and 'element' in modules:
        return 'element'
    return m


def _clip(text: str) -> str:
    return text if len(text) <= LIMIT else text[:LIMIT] + f'\n… ({len(text) - LIMIT:,}자 더)'


# ---------------------------------------------------------------- stand-ins
def _answer(schema: Any, prompt: str, own: Dict[str, str], name: str = '') -> Any:
    """a schema-shaped answer: cell arrays ({i, v}) get the layout's own text for the cells the prompt names, a per-sheet entry
    ({s, …}: the part plan) names the sheet in its text fields, the rest is empty (no issues · no tool calls)"""
    # the cells the prompt asks for: {"i": n, …, "max": m} objects (else any "i": n) — the stand-in keeps within max as a model is told
    caps = {i: int(m) for i, m in SLOT.findall(prompt) if i in own}
    asked = list(caps) or [i for i in dict.fromkeys(CELL.findall(prompt)) if i in own]

    def text(i: str) -> str:
        v = own[i]
        return v[:caps[i]] if caps.get(i) and len(v) > caps[i] else v

    def sheet(props: dict) -> dict:
        return {k: (0 if k == 's' else f'견본 — {name}' if str((v or {}).get('type', '')).upper() == 'STRING' else make(v)) for k, v in props.items()}

    def make(s: Any) -> Any:
        if not isinstance(s, dict):
            return None
        t = str(s.get('type', '')).upper()
        if s.get('enum'):
            return s['enum'][0]
        if t == 'OBJECT':
            return {k: make(v) for k, v in (s.get('properties') or {}).items()}
        if t == 'ARRAY':
            item = s.get('items') or {}
            props = item.get('properties') or {}
            if {'i', 'v'} <= set(props):
                return [{**({'s': 0} if 's' in props else {}), 'i': int(i), 'v': text(i),
                         **{k: make(v) for k, v in props.items() if k not in ('s', 'i', 'v')}} for i in asked]
            if 's' in props:
                return [sheet(props)]
            return []
        if t == 'STRING':
            return ''
        if t in ('INTEGER', 'NUMBER'):
            return 0
        if t == 'BOOLEAN':
            return False
        return None
    return make(schema)


class _LLM:
    """stands in for the app provider (generate_json): records the call, answers from the layout's own content"""

    def __init__(self, own: Dict[str, str], name: str, sink: Callable[[dict], None]) -> None:
        self.own, self.name, self.sink, self.model = own, name, sink, 'trace'

    def generate_json(self, *, stage: str, system: str = '', user: str = '', schema: Any = None, temperature: Any = None,
                      max_output_tokens: Any = None, seed: Any = None, **_: Any) -> Any:
        self.sink({'kind': 'llm', 'stage': stage.split(':', 1)[-1], 'system': system or '', 'prompt': _clip(user or ''),
                   'schema': schema, 'temperature': temperature, 'max_tokens': max_output_tokens,
                   'retry': '[이전 응답의 검증 오류]' in (user or '')})
        return SimpleNamespace(data=_answer(schema, user or '', self.own, self.name), text='', model='trace', prompt_tokens=0, output_tokens=0)


def _decide(q: dict) -> dict:
    kind = q.get('type')
    if kind == 'choice':
        keys = list((q.get('criteria') or {}).keys())
        pick = next((k for k in keys if k.lower() in OK_ANSWERS), keys[0] if keys else '')
        return {'type': 'choice', 'choice': pick, 'confidence': 1.0, 'probabilities': {k: (1.0 if k == pick else 0.0) for k in keys}}
    if kind == 'score':
        top = max(0, len(q.get('criteria') or []) - 1)
        return {'type': 'score', 'score': float(top), 'confidence': 1.0, 'probabilities': {str(top): 1.0}}
    return {'type': 'noul', 'noul': 1.0, 'confidence': 1.0}


class _Decision:
    """stands in for a decision client (ask(stage, state, questions)): records the request, answers 'ok' with certainty"""

    def __init__(self, task: str, sink: Callable[[dict], None]) -> None:
        self.task, self.sink, self.model = task, sink, 'trace-decision'

    def ask(self, stage: str, state: Any, questions: Dict[str, dict]) -> Dict[str, dict]:
        try:
            text = json.dumps(state, ensure_ascii=False, indent=1)
        except (TypeError, ValueError):
            text = str(state)
        self.sink({'kind': 'decision', 'stage': stage.split(':', 1)[-1], 'task': self.task, 'state': _clip(text), 'questions': questions})
        return {qid: _decide(q) for qid, q in questions.items()}


# ---------------------------------------------------------------- run
def _sample(snapshot: dict, industry: Optional[str]) -> dict:
    codes = [i['code'] for i in experiments.industries()]
    own = next((c for c in codes if snapshot['f'].endswith('_' + c)), None)
    code = industry if industry in codes else own or (codes[0] if codes else '')
    row = experiments.samples(snapshot, code)[0]
    name = next((i['name'] for i in experiments.industries() if i['code'] == code), code)
    return {'industry': code, 'industry_name': name, 'label': row['label'], 'input': row['input']}


def _branch(snapshot: dict, sample: dict, decide: bool) -> dict:
    calls: List[dict] = []
    lock = threading.Lock()
    modules = [n['module'] for n in snapshot['view']['flow']['nodes']]

    def sink(rec: dict) -> None:
        with lock:
            rec['module'] = module_of(rec['stage'], rec.get('task', ''), modules) or 'other'
            rec['seq'] = len(calls)
            calls.append(rec)
    own = {str(s['id']): re.sub(r'<[^>]+>', '', s.get('value') or '').strip() or '—' for s in snapshot['slots'] if s['kind'] == 't'}
    decisions = {task: _Decision(task, sink) for task in layout_decide.TASKS} if decide else {}
    error = ''
    try:
        experiments.run(snapshot, sample['input'], branch='decision' if decide else 'llm', provider=_LLM(own, snapshot['meta'].get('name') or snapshot['f'], sink), decisions=decisions)
    except Exception as exc:  # noqa: BLE001 — the calls recorded up to here still show; the step that failed is named
        error = f'{type(exc).__name__}: {str(exc)[:300]}'
    return {'calls': calls, 'error': error}


# question_type — what the decision model is asked (app/api/llm/decision.py): POST {base}/systemone {model, state, questions}
QUESTION_TYPES = {
    'choice': 'criteria = {보기: 설명} (1–255개) → 답: choice(고른 보기) · confidence · probabilities(보기마다 확률)',
    'score': 'criteria = [단계 0 설명, 단계 1 설명, …] (1–10단계) → 답: score(확률 가중 단계) · confidence · probabilities',
    'noul': 'instructions = 예/아니오로 답할 문장 (criteria.true · false 선택) → 답: noul(예일 확률)',
}


def _models() -> dict:
    try:
        from .settings import get_settings
        s = get_settings()
        return {'llm': ' · '.join(x for x in (getattr(s, 'provider', ''), getattr(s, 'model', '')) if x), 'decision': getattr(s, 'decision_model', '')}
    except Exception:  # noqa: BLE001 — names only, for the view
        return {}


def trace(snapshot: dict, industry: Optional[str] = None) -> dict:
    """{sample, llm: {calls, error}, decision: {calls, error}, off: {task: reason}} — calls in the order they were sent"""
    sample = _sample(snapshot, industry)
    has_decision = any(module_of('', t, [n['module'] for n in snapshot['view']['flow']['nodes']]) in
                       {n['module'] for n in snapshot['view']['flow']['nodes']} for t in layout_decide.TASKS)
    return {'sample': sample, 'industries': experiments.industries(),
            'llm': _branch(snapshot, sample, False),
            'decision': _branch(snapshot, sample, True) if has_decision else {'calls': [], 'error': ''},
            'off': layout_decide.spec(snapshot['f']).get('off') or {}, 'whole_fixed': bool(snapshot['view'].get('whole_fixed')),
            'question_types': QUESTION_TYPES, 'decision_api': 'POST {base}/systemone — {model, state, questions}', 'models': _models()}


def for_layout(f: str, meta: dict, raw_html: str, draft: Optional[dict] = None, industry: Optional[str] = None) -> dict:
    return trace(experiments.context(f, meta, raw_html, draft), industry)
