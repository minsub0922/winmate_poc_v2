"""Decision-model branches inside a layout's flow (admin 레이아웃 관리 → 흐름).

User 2026-11-18: every part of a layout that is a decision gets a decision-model version. The node switches inside, with the same
interface before and after, and only when the decision branch is taken (``settings.DECISION_TASKS`` + the decision key + this
layout's status in app/data/layout_decisions.json). Nothing here runs on the LLM branch: its calls and prompts stay as they were.

  layout.cells     a cell whose value is one entry of a closed list (app/data/layout_decisions.json, designed per layout from
                   the 칸 설계). Before writing — the selected product · solution · case · space · model a cell names (choice,
                   different within a group; the writer then sees them as fixed and writes the cells around them). After
                   writing — a label of the role's own vocabulary (choice) or a dots rating (score) judged from the written
                   sheet. Code fills the rest: the n-th input entry, a copy of another cell, a count of other cells.
  layout.verify    사실 · 요구 검수 — the cell that answers each requirement (choice per requirement) and each editable cell's
                   problem (choice per cell). The LLM writes fixes only for the cells the decision model flagged (the LLM
                   branch writes its own fixes for the whole sheet).
  layout.pictures  사진 검수 · 사진 고르기 — composer pictures.py (choice per frame), gated per layout through ``llm.decision_on``.
  layout.review    the part orchestrator's review after the check (part_orchestrator.review_part) — redo or not per sheet (choice);
                   the instruction of a sheet to redo is made from the reason and what the code found (repeats · empty · unanswered).

A failing decision request does not fall back to rules: the node takes its LLM branch (another real model).
"""
from __future__ import annotations

from functools import lru_cache
import json
import os
from pathlib import Path
import re
import time
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from .. import layout_cells
from ..llm import decision as dm

ROOT = Path(__file__).resolve().parents[3]
TASKS = ('layout.cells', 'layout.verify', 'layout.pictures', 'layout.review', 'layout.final')
NODE = {'layout.cells': 'write', 'layout.verify': 'verify', 'layout.pictures': 'pictures', 'layout.review': 'verify', 'layout.final': 'final'}
LISTS = ('products', 'solutions', 'items', 'cases', 'spaces', 'models', 'options')
NONE = 'none'
NONE_MIN = 0.6   # a name cell is left empty only when the model is this sure nothing selected fits


# ---------------------------------------------------------------- registry (per layout)
def path() -> Path:
    return Path(os.environ.get('WINMATE_LAYOUT_DECISIONS', ROOT / 'app/data/layout_decisions.json'))


@lru_cache(maxsize=2)
def _read(name: str, stamp: int) -> dict:
    data = json.loads(Path(name).read_text(encoding='utf-8'))
    return data if isinstance(data, dict) else {}


def registry() -> dict:
    p = path()
    try:
        return _read(str(p), p.stat().st_mtime_ns)
    except (FileNotFoundError, ValueError):
        return {}


def spec(f: str) -> dict:
    """this layout's decision design (its representative's for a content candidate)"""
    layouts = registry().get('layouts') or {}
    return layouts.get(f) or layouts.get(layout_cells._rep(f)) or {}


def on(f: str, task: str) -> bool:
    """does this layout take the decision branch of ``task``? (off where its 5-sample check did worse than the LLM)"""
    return task not in (spec(f).get('off') or {})


def cells_of(f: str) -> dict:
    return spec(f).get('cells') or {}


# ---------------------------------------------------------------- clients
class Bound:
    """a decision client as the composer sees it — ``ask(stage, state, questions) -> answers`` — recording each call"""

    def __init__(self, client: Any, prefix: str = 'compose:', sink: Optional[Callable[[dict], None]] = None) -> None:
        self.client, self.prefix, self.sink = client, prefix, sink
        self.model = getattr(client, 'model', 'decision')
        self.calls: List[dict] = []

    def ask(self, stage: str, state: Any, questions: Dict[str, dict]) -> Dict[str, dict]:
        started = time.time()
        res = self.client.ask(stage=self.prefix + stage, state=state, questions=questions)
        rec = {'stage': stage, 'ms': int((time.time() - started) * 1000), 'questions': len(questions), 'model': getattr(res, 'model', self.model),
               'input_tokens': getattr(res, 'input_tokens', 0)}
        self.calls.append(rec)
        if self.sink:
            self.sink({**rec, 'state': state, 'asked': questions, 'answers': res.answers})
        return res.answers


def attach(llm: Any, settings: Any = None, wrap: Optional[Callable[[Any, str], Any]] = None) -> Dict[str, Any]:
    """``llm.decisions`` = {task: client} for the layout tasks that take the decision branch (key set, task enabled), and
    ``llm.decision_on(f, task)`` = this layout's status. ``wrap(client, task)`` binds a client to a job (tracker · cancel)."""
    if settings is None:
        from .settings import get_settings
        settings = get_settings()
    found = {}
    for task in TASKS:
        client = dm.get_decision(settings, task)
        if client is not None:
            found[task] = wrap(client, task) if wrap else Bound(client)
    llm.decisions = {**(getattr(llm, 'decisions', None) or {}), **found}
    llm.decision_on = on
    return found


def client_for(llm: Any, task: str, fs: Sequence[str] = ()) -> Any:
    d = (getattr(llm, 'decisions', None) or {}).get(task)
    if d is None or any(not on(f, task) for f in fs):
        return None
    return d


def cancelled(exc: BaseException) -> bool:
    return type(exc).__name__ == 'JobCancelled' or getattr(exc, 'code', '') == 'cancelled'


def _plain(auto: Any, v: Any) -> str:
    return (auto.plain(v) if auto is not None else re.sub(r'<[^>]+>', '', str(v or ''))).strip()


def _cut(text: str, n: int) -> str:
    text = re.sub(r'\s+', ' ', str(text or '')).strip()
    return text if len(text) <= n else text[:n - 1] + '…'


# ---------------------------------------------------------------- the customer's lists
def lists(auto: Any, ctx: dict, spec_: Optional[dict] = None, values: Optional[dict] = None) -> Dict[str, List[Tuple[str, str]]]:
    """{list: [(value written in the cell, what it is)]} — names as the deck shows them (the same names the LLM branch is told)"""
    lib = auto.load()
    short = ctx.get('short') or {}
    P = lib.get('products_all') or {}
    S = lib.get('solutions') or {}
    C = lib.get('cases') or {}

    def pname(q: str) -> str:
        return short.get(q) or (P.get(q) or S.get(q) or {}).get('name') or q
    products = [(pname(q), _cut(' · '.join(x for x in ((P.get(q) or {}).get('cat'), (P.get(q) or {}).get('model')) if x), 60)) for q in ctx.get('products') or [] if q in P]
    solutions = [(pname(q), _cut((S.get(q) or {}).get('desc') or (S.get(q) or {}).get('cat') or '솔루션', 80)) for q in ctx.get('solutions') or [] if q in S]
    cases = [(str((C.get(c) or {}).get('cust') or c), _cut((C.get(c) or {}).get('title') or '도입 사례', 80)) for c in ctx.get('cases') or []]
    spaces = [(str(x.get('name')), _cut(' · '.join(pname(p) for p in x.get('products') or []), 80)) for x in ctx.get('spaces') or [] if x.get('name')]
    models = [(P[q]['model'], pname(q)) for q in ctx.get('products') or [] if (P.get(q) or {}).get('model')]
    out = {'products': products, 'solutions': solutions, 'items': products + solutions, 'cases': cases, 'spaces': spaces, 'models': models}
    out = {k: list(dict((a, (a, b)) for a, b in v).values()) for k, v in out.items()}   # one entry per name
    if spec_ and spec_.get('pick') == 'options':
        out['options'] = [(str(o), '') for o in spec_.get('options') or []]
    if spec_ and spec_.get('of') and spec_.get('pick') in ('products', 'solutions', 'items') and values is not None:
        # the items linked to the space named in another cell ('칸 7 공간의 선택 제품'): nothing under an empty space card; a space
        # name the template fixed (not one of the customer's) leaves the whole list to the question
        named = (values.get(str(spec_['of'])) or '').strip()
        if not named:
            out[spec_['pick']] = []
        else:
            space = next((x for x in ctx.get('spaces') or [] if str(x.get('name')) == named), None)
            if space and space.get('products'):
                linked = {pname(p) for p in space['products']}
                keep = {a for a, _ in solutions}   # solutions are not linked to spaces: they stay
                kept = [x for x in out[spec_['pick']] if x[0] in linked or (spec_['pick'] != 'products' and x[0] in keep)]
                out[spec_['pick']] = kept or out[spec_['pick']]
    return out


# ---------------------------------------------------------------- layout.cells
def pre_choice() -> bool:
    """does the decision model choose names before writing? Off unless the registry says so: blind check 2026-11-18 on the layouts with
    such cells — LLM 27 · Decision 18 (45 sheets): a name chosen before the writer wrote did not fit its card (an indoor screen on the
    outdoor card, a nameless card while products were left). Names the code resolves (n-th entry · the sheet's own entity · copies ·
    a product's model) and the judgements after writing stay with the decision branch; the other name cells stay with the writer."""
    return bool(registry().get('pre_choice', False))


def code_resolved(auto: Any, ctx: dict, sl: dict, sp: dict, specs: dict, seen: Optional[set] = None) -> bool:
    """a pre cell whose value the code sets without asking (n-th entry · the sheet's own entity · a product's model · a copy of such a cell)"""
    if sp.get('nth') or (sp.get('pick') == 'models' and sp.get('of')):
        return True
    if sp.get('same'):
        seen = seen or set()
        src = specs.get(str(sp['same']))
        return bool(src) and str(sp['same']) not in seen and code_resolved(auto, ctx, sl, src, specs, seen | {str(sp['same'])})
    return bool(bound(auto, ctx, sl, sp))


def when(sp: dict) -> str:
    if sp.get('when') in ('pre', 'post'):
        return sp['when']
    return 'post' if ('dots' in sp or 'count' in sp or sp.get('pick') == 'options') else 'pre'


def cell_plan(auto: Any, ctx: dict, slides: List[dict], asks: Dict[int, List[dict]], llm: Any, locked: Optional[Dict[int, dict]] = None) -> Optional[dict]:
    """the cells of these sheets the decision model fills — taken out of the writer's asks (decision branch only).
    {'dec': client, 'pre': {s: [(slot, spec)]}, 'post': {s: [...]}}; None when the branch is not taken or no cell qualifies."""
    dec = client_for(llm, 'layout.cells')
    if dec is None:
        return None
    from . import layout_fanout
    out: dict = {'dec': dec, 'pre': {}, 'post': {}}
    for s, xs in asks.items():
        sl = slides[s]
        specs = cells_of(sl['f'])
        if not specs or not on(sl['f'], 'layout.cells') or sl.get('fixed') or sl.get('keep'):
            continue
        split = layout_fanout.wants_split(sl['f'])
        keep = []
        chooses = pre_choice()
        for x in xs:
            sp = specs.get(str(x['i']))
            if not sp or (split and when(sp) == 'pre'):
                keep.append(x)
                continue
            if when(sp) == 'pre' and not chooses and not code_resolved(auto, ctx, sl, sp, specs):
                keep.append(x)   # a name the model would choose before writing: the writer writes it (pre_choice off)
                continue
            out[when(sp)].setdefault(s, []).append((x, sp))
        asks[s] = keep
        # a rating · label cell the template's short-sample rule kept as authored ('●●●○○' — another customer's score): judged
        # after writing like the others (the LLM branch keeps the sample)
        asked = {str(x['i']) for x in xs}
        ex = sl.get('ex_t') or {}
        for k, v in list(((locked or {}).get(s) or {}).items()):
            sp = specs.get(str(k))
            if not sp or when(sp) != 'post' or str(k) in asked or (layout_cells.cell(sl['f'], k) or {}).get('keep'):
                continue
            if not _plain(auto, ex.get(str(k))) or _plain(auto, v) != _plain(auto, ex.get(str(k))):
                continue   # a value the code bound (not the template's sample) stays
            x = next((y for y in sl.get('_slots') or [] if str(y.get('i')) == str(k)), {'i': int(k) if str(k).isdigit() else k})
            out['post'].setdefault(s, []).append((x, sp))
    return out if out['pre'] or out['post'] else None


# a sheet made once per space · product · solution · case (공간별 제품 · 제품 스펙 · 솔루션 · 사례 장): the cell naming that entity takes
# the one the sheet is bound to — no question (the writer is told the same binding, auto._bind_line)
BOUND = {'space': {'spaces': 'space', 'products': 'product', 'items': 'product'}, 'spec': {'products': 'product', 'items': 'product'},
         'solution': {'solutions': 'solution', 'items': 'solution'}, 'case': {'cases': 'case'}}
FAMILY = (('L_TOC_PSPEC', 'spec'), ('L_VS_SPACE', 'space'))


def sheet_kind(sl: dict) -> str:
    kind = (sl.get('bind') or {}).get('kind') or sl.get('kind') or ''
    if kind in ('', 'unknown', 'generic'):
        kind = next((k for pre, k in FAMILY if str(sl.get('f') or '').startswith(pre)), kind)
    return kind


def bound(auto: Any, ctx: dict, sl: dict, sp: dict) -> Optional[str]:
    """the name of the entity this sheet is made for, when this cell names it (else None)"""
    key = (BOUND.get(sheet_kind(sl)) or {}).get(sp.get('pick'))
    if not key or sp.get('group') or sp.get('nth') or sp.get('multi') or sp.get('same'):
        return None
    if sp.get('of') and key != 'product':
        return None
    v = (sl.get('bind') or {}).get(key)
    if not v:
        return None
    lib = auto.load()
    if key == 'space':
        return str(((ctx.get('space_by_id') or {}).get(v) or {}).get('name') or '') or None
    if key == 'case':
        return str(((lib.get('cases') or {}).get(str(v)) or {}).get('cust') or '') or None
    short = ctx.get('short') or {}
    return short.get(v) or ((lib.get('products_all') or {}).get(v) or (lib.get('solutions') or {}).get(v) or {}).get('name') or None


def _sheet_state(auto: Any, ctx: dict, pp: Optional[dict], sl: dict, written: bool, skip: Sequence[str] = ()) -> dict:
    lib = auto.load()
    meta = (lib.get('layouts') or {}).get(sl['f']) or {}
    design = layout_cells.design(sl['f'])
    roles = {k: v.get('role') for k, v in (design.get('cells') or {}).items() if v.get('role')}
    reqs = [r.get('text') for r in ((pp or {}).get('brief') or {}).get('requirements') or [] if r.get('text')]
    L = lists(auto, ctx)
    state = {'고객': ctx.get('customer') or '', '과제': ctx.get('title') or '', '요구': [_cut(r, 160) for r in reqs[:10]],
             '고른 제품': [f'{a} — {b}' if b else a for a, b in L['products']], '고른 솔루션': [f'{a} — {b}' if b else a for a, b in L['solutions']],
             '고른 사례': [f'{a} — {b}' if b else a for a, b in L['cases']], '공간': [f'{a} — {b}' if b else a for a, b in L['spaces']],
             '장표': {'이름': meta.get('name') or sl['f'], '말할 것': design.get('say') or '', '칸의 일': roles}}
    try:
        line = auto._bind_line(ctx, {**sl, 'kind': sheet_kind(sl)})
    except Exception:  # noqa: BLE001 — a sheet the composer's binding line does not know
        line = ''
    if line:
        state['장표']['묶인 항목'] = _cut(line, 600)
    t = sl.get('t') or {}
    if written:   # (the cells still to decide hold another customer's sample, not words the writer wrote)
        state['장표']['쓴 문구'] = {k: _cut(_plain(auto, v), 160) for k, v in t.items() if _plain(auto, v) and k not in set(skip)}
    else:
        fixed = {k: _cut(_plain(auto, v), 80) for k, v in (sl.get('lock') or {}).items() if _plain(auto, v)}
        if fixed:
            state['장표']['정해진 칸'] = fixed
    return state


def _binary(sp: dict) -> bool:
    """a one-dot mark ('●' or nothing): yes / no"""
    return 'dots' in sp and int(sp['dots']) == 1


def _question(i: str, sp: dict, opts: List[Tuple[str, str]], role: str) -> Dict[str, dict]:
    """the decision questions of one cell: {qid: question}"""
    what = sp.get('q') or role or f'칸 {i}'
    if _binary(sp):
        return {f'c{i}': dm.noul(f'칸 {i}: {what}', true=f"표시 “{sp.get('fill', '●')}”", false='표시 없음')}
    if 'dots' in sp:
        lo, hi = int(sp.get('min', 1)), int(sp['dots'])
        words = {0: '없음', 1: '매우 낮음', 2: '낮음', 3: '보통', 4: '높음', 5: '매우 높음'}
        levels = [f'{n} — {words.get(round(5 * n / hi) if hi else n, str(n))}' for n in range(lo, hi + 1)]
        return {f'c{i}': dm.score(f'칸 {i}: {what} (쓴 문구 · 요구 · 고른 항목으로 판단)', levels)}
    if sp.get('multi'):
        return {f'c{i}#{n}': dm.noul(f'칸 {i}: {what} — “{a}”을(를) 이 칸에 넣는다', true='넣는다', false='넣지 않는다')
                for n, (a, b) in enumerate(opts)}
    crit = {a: (b or a) for a, b in opts}
    if sp.get('empty', True) is not False:
        crit[NONE] = '맞는 것이 없다 — 빈칸'
    return {f'c{i}': dm.choice(f'칸 {i}: {what}', crit)}


def _values(i: str, sp: dict, opts: List[Tuple[str, str]], answers: dict) -> List[Tuple[str, float]]:
    """the ranked values one cell may take [(value, probability)]"""
    a = answers.get(f'c{i}')
    if _binary(sp):
        if not a:
            return []
        p = float(a.get('noul') or 0.0)
        return [(sp.get('fill', '●') if p >= 0.5 else sp.get('rest', ''), max(p, 1 - p))]
    if 'dots' in sp:
        if not a:
            return []
        lo, hi = int(sp.get('min', 1)), int(sp['dots'])
        n = max(lo, min(hi, lo + dm.level(a)))
        return [(sp.get('fill', '●') * n + sp.get('rest', '') * (hi - n), dm.confidence(a))]
    if sp.get('multi'):
        got = sorted(((answers.get(f'c{i}#{n}') or {}).get('noul', 0.0), n, a_) for n, (a_, b) in enumerate(opts))
        chosen = [a_ for p, n, a_ in sorted(got, key=lambda t: (-t[0], t[1])) if p >= 0.5][:int(sp.get('max') or 8)]
        order = [a_ for a_, _ in opts]
        chosen.sort(key=order.index)   # the input's order
        return [(sp['multi'].join(chosen), min([p for p, _, a_ in got if a_ in chosen] or [1.0]))]
    if not a:
        return []
    ranked = dm.ranked_choices(a)
    if ranked and ranked[0][0] == NONE and ranked[0][1] < NONE_MIN and any(p >= 0.15 for k, p in ranked[1:]):
        # a weak 'none' while a selected item fits too: the cell names it (blind check 2026-11-18 — empty name cells next to
        # unused selected products read as a gap)
        ranked = ranked[1:] + ranked[:1]
    return [('' if k == NONE else k, p) for k, p in ranked]


def _assign(rows: List[Tuple[str, dict, List[Tuple[str, float]]]]) -> Dict[str, Tuple[str, float]]:
    """cells → value; cells of one group take different values (the most certain cell chooses first)"""
    out: Dict[str, Tuple[str, float]] = {}
    taken: Dict[str, set] = {}
    for i, sp, ranked in sorted(rows, key=lambda r: -(r[2][0][1] if r[2] else 0)):
        group = sp.get('group')
        if not ranked:
            out[i] = ('', 0.0)
            continue
        if not group:
            out[i] = ranked[0]
            continue
        used = taken.setdefault(group, set())
        pick = next(((v, p) for v, p in ranked if v == '' or v not in used), ('', 0.0))
        if pick[0]:
            used.add(pick[0])
        out[i] = pick
    return out


def _fill(auto: Any, ctx: dict, pp: Optional[dict], sl: dict, items: List[Tuple[dict, dict]], dec: Any, phase: str, record: Optional[dict] = None) -> Dict[str, str]:
    """decide one sheet's cells of one phase → {i: value}; decisions recorded in sl['decided'].
    Order: the sheet's own entity (bound) · the n-th entries (code) → names (one request) → names of a space's items (a second,
    once that space is named) → models · copies (code) → labels · ratings judged with every name in place (a last request) →
    counts (code)."""
    values: Dict[str, str] = {}
    record = (record if record is not None else sl).setdefault('decided', {})
    design = layout_cells.design(sl['f'])
    roles = {k: (v.get('role') or '') for k, v in (design.get('cells') or {}).items()}
    pending = {str(x['i']): sp for x, sp in items}

    def done(i: str, v: str, by: str, p: Optional[float] = None) -> None:
        values[i] = v
        record[i] = {'value': v, 'by': by, 'phase': phase, **({'p': round(float(p), 3)} if p is not None else {})}
        pending.pop(i, None)

    def known() -> Dict[str, str]:
        return {**{k: _plain(auto, v) for k, v in (sl.get('t') or {}).items()}, **{k: _plain(auto, v) for k, v in (sl.get('lock') or {}).items()}, **values}

    def ask(cells: List[str]) -> None:
        rows, asked, opts_of = [], {}, {}
        for i in cells:
            sp = pending[i]
            opts = (lists(auto, ctx, sp, known()).get(sp.get('pick')) or []) if 'pick' in sp else []
            if 'pick' in sp and not opts:
                done(i, '', 'no_options')
                continue
            opts_of[i] = opts
            asked.update(_question(i, sp, opts, roles.get(i, '')))
            rows.append(i)
        if not asked:
            return
        state = _sheet_state(auto, ctx, pp, {**sl, 'lock': {**(sl.get('lock') or {}), **values}, 't': {**(sl.get('t') or {}), **values}},
                             written=phase == 'post', skip=list(pending))
        answers = dec.ask('auto_cells_' + phase, state, asked)
        for i, (v, p) in _assign([(i, pending[i], _values(i, pending[i], opts_of[i], answers)) for i in rows]).items():
            done(i, v, 'decision', p)

    for i, sp in list(pending.items()):
        name = bound(auto, ctx, sl, sp)
        if name:
            done(i, name, 'bound')
        elif sp.get('nth') and sp.get('pick') in LISTS:
            L = lists(auto, ctx, sp).get(sp['pick']) or []
            n = int(sp['nth'])
            done(i, L[n - 1][0] if 0 < n <= len(L) else '', 'nth')
    names = [i for i, sp in pending.items() if 'pick' in sp and sp['pick'] != 'options' and not sp.get('same') and not (sp['pick'] == 'models' and sp.get('of'))]
    ask([i for i in names if not (sp_of := pending[i].get('of')) or str(sp_of) not in pending])
    ask([i for i in names if i in pending])
    for i, sp in list(pending.items()):
        if sp.get('pick') == 'models' and sp.get('of'):
            name = values.get(str(sp['of'])) or known().get(str(sp['of'])) or ''
            done(i, next((m for m, p in lists(auto, ctx)['models'] if name and (p == name or m in name)), ''), 'of')
    for i, sp in list(pending.items()):
        if sp.get('same') and str(sp['same']) not in pending:
            done(i, values.get(str(sp['same'])) or known().get(str(sp['same'])) or '', 'same')
    ask([i for i, sp in pending.items() if 'dots' in sp or sp.get('pick') == 'options'])
    for i, sp in list(pending.items()):
        if sp.get('same'):
            done(i, values.get(str(sp['same'])) or known().get(str(sp['same'])) or '', 'same')
    for i, sp in list(pending.items()):
        if 'count' in sp:
            have = known()
            n = sum(1 for k in sp.get('of') or [] if have.get(str(k)) == sp.get('value'))
            done(i, str(sp['count']).replace('{n}', str(n)), 'count')
    for i in list(pending):   # a spec the code cannot resolve: an empty cell rather than another customer's sample
        done(i, '', 'unresolved')
    # a decided value fits its cell like the writer's words do (the 5-sample check: names and ' · ' lists past the cell's width were
    # the decision branch's most frequent remaining issue — 399 against the LLM branch's 165 over 825 sheets)
    slots = {str(x.get('i')): x for x, _ in items}
    for i, v in list(values.items()):
        sp = next((sp_ for x, sp_ in items if str(x.get('i')) == i), {})
        if 'count' in sp or 'dots' in sp:
            continue
        fit = _fit(auto, ctx, sl, slots.get(i) or {}, v, sp)
        if fit != v:
            values[i] = fit
            record[i] = {**record.get(i, {}), 'value': fit, 'fitted': v}
    return values


def _fit(auto: Any, ctx: dict, sl: dict, x: dict, value: str, sp: dict) -> str:
    """the value within the cell's width: a list keeps the entries that fit (at least the first); a product name that does not fit
    becomes its model code"""
    cap = x.get('max')
    if not cap or not value:
        return value
    from .compose_grounding import fits_slot
    fits = lambda v: fits_slot(auto, sl, x['i'], v, cap)  # noqa: E731
    if fits(value):
        return value
    if sp.get('multi') and sp['multi'] in value:
        parts, keep = value.split(sp['multi']), []
        for part in parts:
            if fits(sp['multi'].join(keep + [part])):
                keep.append(part)
            else:
                break
        return sp['multi'].join(keep) if keep else parts[0]
    model = next((m for m, p in lists(auto, ctx)['models'] if p == value), None)
    return model if model and re.search(r'\d', model) and fits(model) else value   # (not a bare series code such as 'IFR')


def decide_pre(auto: Any, ctx: dict, pp: dict, slides: List[dict], cplan: dict, locked: Dict[int, dict]) -> None:
    """before writing: the names these cells hold → locked (the writer sees them as fixed and writes around them). All sheets
    are decided before any value is set."""
    # (the sheet's fixed cells — the template's own labels such as a card's category '옥외 사이니지', bound values — are part of what the
    #  decision model reads: without them it named an indoor screen on the outdoor card, measured blind 2026-11-18)
    got = {s: _fill(auto, ctx, pp, {**slides[s], 'lock': {**(locked.get(s) or {}), **(slides[s].get('lock') or {})}}, items, cplan['dec'], 'pre', record=slides[s])
           for s, items in cplan['pre'].items()}
    for s, values in got.items():
        for k, v in values.items():
            locked[s][k] = v
            slides[s].setdefault('lock', {})[k] = v


def decide_post(auto: Any, ctx: dict, pp: dict, slides: List[dict], cplan: dict, locked: Optional[Dict[int, dict]] = None) -> None:
    """after writing: labels · ratings · counts judged from the written sheet. All sheets are decided before any value is set
    (a failing request leaves every cell to the writer). ``locked`` keeps them on sheets the part resets to its locks."""
    got = {s: _fill(auto, ctx, pp, slides[s], items, cplan['dec'], 'post') for s, items in cplan['post'].items()}
    for s, values in got.items():
        slides[s].setdefault('t', {}).update(values)
        if locked is not None and s in locked:
            locked[s].update(values)


# ---------------------------------------------------------------- layout.verify
ISSUES = {
    'ok': '문제 없음 — 이 고객의 입력 · 근거와 맞고 칸의 일대로 썼다',
    'claim': '사실 · 기능 오류 — 다른 항목의 제품명 · 모델 · 기능 · 숫자를 가져왔거나, 근거 없는 수치 · 성과 · 보장, 확인되지 않은 CMS · AI · 연동 · 구독 · 절감을 단정했다',
    'binding': '이 장에 묶인 제품 카드 · 사진의 제품과 문구가 말하는 제품이 다르다',
    'placeholder': '자리표시 · 견본 문구가 남았다([00], OO, 예시, 다른 고객 이름)',
    'mismatch': '바로 위 소제목과 다른 기능 · 내용을 말한다',
}
# (no 'repeat': the writer's own guard re-asks a cell that repeats another of its sheet, the orchestrator finds repeats across
#  sheets — asked here, the decision model flagged table labels that repeat by design: '보안 · 관리', '게임 이용자')
ISSUE_KIND = {'claim': 'claim', 'binding': 'binding', 'placeholder': 'placeholder', 'repeat': 'claim', 'mismatch': 'claim'}
ISSUE_TEXT = {'claim': '사실 · 기능 확인 필요 — 근거에 없는 내용이거나 다른 항목의 내용', 'binding': '묶인 제품과 문구의 제품이 다름',
              'placeholder': '자리표시 · 견본 문구가 남음', 'repeat': '같은 장 다른 칸과 같은 말', 'mismatch': '소제목과 본문이 다른 내용'}
OK_MIN = 0.25         # a cell is flagged when the decision model's top answer is a problem and 'ok' is below this — calibrated on
                      # 40 layouts × 2 samples (shadow on the LLM branch): the LLM checker flags almost no cell itself (its issues are
                      # unanswered requirements), so only the decision model's confident flags are worth a fix call
COVER_NONE = 0.95     # a requirement counts as answered unless the model is this sure no cell answers it — the LLM checker quotes
                      # the closest cell (often a headline); only sheets that cannot answer (목차 · 사례 · 제목) stay at ≥ 0.95
FACT_CHARS = 700      # per fact in the state (the LLM checker reads the whole brief; the decision state has a token budget)


def _brief_state(check_brief: dict) -> dict:
    facts = check_brief.get('facts') or {}
    small = {}
    for k, v in (facts.items() if isinstance(facts, dict) else enumerate(facts)):
        if isinstance(v, dict):
            small[str(k)] = {x: (_cut(v[x], FACT_CHARS) if isinstance(v[x], str) else v[x][:12] if isinstance(v[x], list) else v[x])
                             for x in ('kind', 'name', 'model', 'text', 'specs') if v.get(x)}
    out = {k: v for k, v in check_brief.items() if k not in ('facts',)}
    out['facts'] = small
    return out


def verify_answer(auto: Any, ctx: dict, part: dict, check_brief: dict, rendered: List[dict], editable_ids: Dict[int, Dict[int, dict]],
                  slides: List[dict], dec: Any, llm: Any, slot_intent: Callable[[str, dict], str]) -> dict:
    """the decision branch of the part check — the same answer the LLM checker gives: {coverage, issues, fixes}"""
    from .compose_grounding import compact
    requirements = list(check_brief.get('requirements') or [])
    cells: Dict[str, Tuple[int, str, str]] = {}
    for row in rendered:
        for k, v in (row.get('t') or {}).items():
            text = _plain(auto, v)
            if len(re.sub(r'\W', '', text)) >= 4:
                cells[f"{row['s']}:{k}"] = (row['s'], str(k), text)
    state = {'고객': ctx.get('customer') or '', '파트': part.get('name') or '', '근거 · 요구 원문': _brief_state(check_brief),
             '최종 장표': [{'장': row['s'] + 1, '레이아웃': row.get('f'), '칸': {k: _cut(_plain(auto, v), 220) for k, v in (row.get('t') or {}).items() if _plain(auto, v)},
                         **({'제품 카드': row['cards']} if row.get('cards') else {})} for row in rendered]}
    qs: Dict[str, dict] = {}
    if cells:
        opts = {key: _cut(text, 150) for key, (s, k, text) in list(cells.items())[:dm.MAX_CHOICES - 1]}
        for r in requirements:
            qs['cov:' + r['id']] = dm.choice(f"요구 {r['id']} “{_cut(r.get('text'), 200)}” 에 실제로 답한 칸 하나 — 무엇을 어떻게 할지(수행 방법 · 조건 · 승인 요청)가 "
                                             f"구체적으로 적힌 칸. 요구를 되풀이만 했으면 답이 아님. 원문에 없는 조건을 요구로 보지 않음.",
                                             {**opts, NONE: '이 요구에 구체적으로 답한 칸이 없다'})
    for s, xs in editable_ids.items():
        for i, x in xs.items():
            text = _plain(auto, slides[s]['t'].get(str(i), ''))
            if not text:
                continue
            qs[f'cell:{s}:{i}'] = dm.choice(f"장 {s + 1} 칸 {i} — 칸의 일: {_cut(slot_intent(slides[s]['f'], x), 90)}. 쓴 문구: “{_cut(text, 220)}”. "
                                            '이 문구의 문제(근거 · 요구 원문과 최종 장표로 판단; 고정 소개 · 사례는 새 선택이 아님; 충돌한 숫자를 양쪽 밝힌 것은 정상)', ISSUES)
    if not qs:
        return {'coverage': [], 'issues': [], 'fixes': []}
    answers = dec.ask('auto_part_verify', state, qs)
    coverage, issues, flagged = [], [], []
    for r in requirements:
        a = answers.get('cov:' + r['id'])
        if not a:
            continue
        probs = a.get('probabilities') or {}
        best = next((k for k, _ in dm.ranked_choices(a) if k != NONE and k in cells), None)
        if best and float(probs.get(NONE, 0.0)) < COVER_NONE:
            s, k, text = cells[best]
            coverage.append({'id': r['id'], 's': s, 'quote': text})
    covered = {c['id'] for c in coverage}
    for s, xs in editable_ids.items():
        for i in xs:
            a = answers.get(f'cell:{s}:{i}')
            if not a:
                continue
            probs = a.get('probabilities') or {}
            top = a.get('choice')
            if top and top != 'ok' and float(probs.get('ok', 0.0)) < OK_MIN:
                why = f"장 {s + 1} 칸 {i}: {ISSUE_TEXT.get(top, top)} (Decision {float(probs.get(top, 0.0)):.0%})"
                issues.append({'s': s, 'slots': [i], 'reason': why, 'kind': ISSUE_KIND.get(top, 'claim'), 'requirement': ''})
                flagged.append((s, i, why))
    missing = [r for r in requirements if r['id'] not in covered]
    for r in missing:
        issues.append({'s': 0, 'slots': [], 'reason': f"요구 {r['id']} 답이 없음 — {_cut(r.get('text'), 60)}", 'kind': 'missing', 'requirement': r['id']})
    fixes = []
    whole = {s for s in editable_ids if not slides[s].get('fanout')}
    for s, i, why in flagged:
        if s not in whole:
            fixes.append({'s': s, 'i': i, 'v': ''})   # an element cell: the part check hands it to the element's own repair with the reason
    ask = [(s, i, why) for s, i, why in flagged if s in whole]
    if ask or (missing and whole):
        rows = [{'s': s, 'i': i, 'max': editable_ids[s][i]['max'], 'v': _plain(auto, slides[s]['t'].get(str(i), '')), 'why': why,
                 'intent': _cut(slot_intent(slides[s]['f'], editable_ids[s][i]), 90)} for s, i, why in ask]
        free = {s: {i: x['max'] for i, x in editable_ids[s].items()} for s in whole} if missing else {}
        prompt = (f"최종 장표 검수에서 걸린 칸만 고칩니다. 고객 {ctx.get('customer')}. 파트 {part.get('name')}.\n"
                  f"근거/요구 원문: {compact(check_brief)}\n실제 최종 장표: {compact(rendered)}\n"
                  f"고칠 칸(현재 문구 v · 걸린 이유 why · 칸의 일 intent · 최대 글자 max): {compact(rows)}\n"
                  + (f"답이 빠진 요구 — 수정 가능한 칸 중 그 요구를 담당할 칸 하나를 골라 그 칸 문구에 답을 넣습니다: {compact([{'id': r['id'], 'text': r.get('text')} for r in missing])}\n"
                     f"수정 가능한 칸과 길이: {compact(free)}\n" if missing and whole else '')
                  + "규칙: 걸린 이유를 없애는 문구로 고칩니다. 이유가 실제로 맞지 않으면 그 칸은 응답하지 않습니다. 새 수치 · 제품 · 성과 · 보장은 근거에 있는 것만. max 이내.\n"
                  "애매한 기능은 확정하지 말고 조건부로. 충돌한 숫자는 양쪽 값을 밝히고 확인 대상으로. 고정 소개 · 사례는 고치지 않습니다. 소제목과 바로 아래 본문은 같은 기능.\n"
                  'JSON만: {"fixes":[{"s":0,"i":3,"v":"..."}]}')
        from .compose_grounding import INT, STR, arr, obj
        try:
            d = llm.json(stage='auto_part_verify_fix', prompt=prompt, schema=obj({'fixes': arr(obj({'s': INT, 'i': INT, 'v': STR}))}), temperature=0,
                         validate=lambda d: True if isinstance(d, dict) and isinstance(d.get('fixes'), list) else 'fixes 배열 필요', max_tokens=3000)
            fixes += [x for x in d.get('fixes') or [] if isinstance(x, dict) and x.get('s') in whole]
        except Exception as exc:  # noqa: BLE001
            if cancelled(exc):
                raise
    return {'coverage': coverage, 'issues': issues, 'fixes': fixes}


# ---------------------------------------------------------------- layout.review (part orchestrator, after the part check)
REVIEW = {
    'ok': '다시 쓸 필요 없음 — 파트 지시대로 썼고, 맡은 요구에 답했고, 다른 장과 겹치지 않고, 남은 검수 지적 · 빈 칸이 없다',
    'directive': '파트 지시(directive)와 다른 내용 · 각도로 썼다',
    'repeat': '다른 장과 같은 문장이나 같은 각도를 되풀이한다',
    'missing': '이 장이 맡은 요구(points)에 답하지 않았다',
    'issues': '사실 검수 지적(issues)이 아직 남아 있다',
    'empty': '써야 할 칸이 비어 있다',
}
REVIEW_WHY = {'directive': '파트 지시와 다른 내용', 'repeat': '다른 장과 같은 문장 · 각도', 'missing': '맡은 요구에 답하지 않음',
              'issues': '검수 지적이 남음', 'empty': '빈 칸'}
REDO_OK_MIN = 0.5


def review_answer(auto: Any, ctx: dict, part: dict, pp: dict, slides: List[dict], editable: Dict[int, List[dict]], findings: dict, dec: Any,
                  max_redo: int) -> List[dict]:
    """the decision branch of the part orchestrator's review — the same redo list [{s, why, instruction, cells}]: one choice per
    sheet (redo or not, and why); the instruction is made from that reason and what the code found on the sheet"""
    reqs = {r['id']: r for r in (pp.get('brief') or {}).get('requirements') or [] if r.get('kind') != 'context'}
    sheets = []
    for s, xs in sorted(editable.items()):
        sl = slides[s]
        sheets.append({'장': s + 1, '레이아웃': (auto.load()['layouts'].get(sl['f']) or {}).get('name') or sl['f'], '파트 지시': sl.get('directive') or '',
                       '맡은 요구': [_cut((reqs.get(p) or {}).get('text') or p, 120) for p in (sl.get('orch_points') or (sl.get('focus') or {}).get('points') or [])],
                       '쓴 칸': {str(x['i']): _cut(_plain(auto, (sl.get('t') or {}).get(str(x['i']), '')), 90) for x in xs},
                       '검수 지적': [_cut(str(i), 140) for i in ((sl.get('quality') or {}).get('issues') or [])][:4]})
    state = {'고객': f"{ctx.get('customer') or ''} · {ctx.get('title') or ''}", '파트': part.get('name') or '',
             '파트가 맡은 요구': [{'id': k, 'text': _cut(v.get('text'), 160)} for k, v in reqs.items()], '장': sheets,
             '코드가 찾은 것': {'다른 장과 같은 문장': findings.get('repeats') or [], '빈 칸': findings.get('empty') or [],
                           '답한 문구를 찾지 못한 요구': findings.get('unanswered') or []}}
    qs = {f'redo:{s}': dm.choice(f"장 {s + 1}: 이 장을 다시 써야 하는가 — 분명한 문제가 있을 때만 다시 씀(문제가 없으면 ok)", REVIEW) for s in sorted(editable)}
    answers = dec.ask('auto_part_review', state, qs)
    rows = []
    for s in sorted(editable):
        a = answers.get(f'redo:{s}') or {}
        top = a.get('choice') or 'ok'
        p_ok = float((a.get('probabilities') or {}).get('ok', 1.0 if top == 'ok' else 0.0))
        if top != 'ok' and p_ok < REDO_OK_MIN:
            rows.append((p_ok, s, top))
    redo = []
    for p_ok, s, top in sorted(rows)[:max_redo]:
        sl = slides[s]
        mine = {x['i'] for x in editable[s]}
        rep = [x for x in findings.get('repeats') or [] if x.get('s') == s]
        emp = [x['i'] for x in findings.get('empty') or [] if x.get('s') == s]
        pts = [p for p in (sl.get('orch_points') or (sl.get('focus') or {}).get('points') or []) if p in (findings.get('unanswered') or [])]
        if top == 'repeat' and rep:
            how = '다른 장과 같은 문장을 빼고 이 장만의 각도로 고쳐 씁니다: ' + ' / '.join(f"칸 {x['i']} “{x.get('text')}”" for x in rep[:3])
            cells = [x['i'] for x in rep]
        elif top == 'empty' and emp:
            how = '빈 칸을 이 장의 지시와 칸의 일에 맞게 채웁니다: 칸 ' + ', '.join(map(str, emp[:8]))
            cells = emp
        elif top == 'missing':
            todo = pts or [p for p in (sl.get('orch_points') or (sl.get('focus') or {}).get('points') or [])]
            how = '이 장이 맡은 요구에 무엇을 어떻게 할지(수행 방법 · 조건 · 승인 요청)로 답합니다: ' + ' / '.join(f"{p} “{_cut((reqs.get(p) or {}).get('text'), 80)}”" for p in todo[:3])
            cells = []
        elif top == 'issues':
            how = '남은 검수 지적을 고칩니다: ' + ' / '.join(_cut(str(i), 120) for i in ((sl.get('quality') or {}).get('issues') or [])[:3])
            cells = []
        else:
            how = f"파트 지시대로 다시 씁니다: {_cut(sl.get('directive') or '', 160)}"
            cells = []
        redo.append({'s': s, 'why': f"{REVIEW_WHY.get(top, top)} (Decision {1 - p_ok:.0%})", 'instruction': how[:400],
                     'cells': [i for i in dict.fromkeys(cells) if i in mine]})
    return redo


# ---------------------------------------------------------------- admin view (레이아웃 관리 → 흐름: the node's decision branch)
LIST_LABEL = {'products': '고른 제품', 'solutions': '고른 솔루션', 'items': '고른 제품 · 솔루션', 'cases': '고른 사례', 'spaces': '고객 공간',
              'models': '고른 제품의 모델 코드', 'options': '보기'}


def _cell_line(i: str, sp: dict, role: str) -> dict:
    what = sp.get('q') or role or f'칸 {i}'
    if when(sp) == 'pre' and 'pick' in sp and not pre_choice() and not (sp.get('nth') or sp.get('same') or (sp.get('pick') == 'models' and sp.get('of'))):
        return {'cell': i, 'type': 'LLM', 'q': what + ' — 쓰기 전 고르기는 꺼짐(그 장에 묶인 항목이면 코드)', 'options': LIST_LABEL.get(sp.get('pick'), ''), 'when': 'pre'}
    if 'count' in sp:
        return {'cell': i, 'type': 'code', 'q': f"칸 {', '.join(map(str, sp.get('of') or []))} 중 “{sp.get('value')}” 개수", 'options': str(sp['count']), 'when': when(sp)}
    if sp.get('same'):
        return {'cell': i, 'type': 'code', 'q': f"칸 {sp['same']} 값 그대로", 'options': '', 'when': when(sp)}
    if sp.get('nth'):
        return {'cell': i, 'type': 'code', 'q': f"{LIST_LABEL.get(sp.get('pick'), '')} {sp['nth']}번째", 'options': '', 'when': when(sp)}
    if sp.get('pick') == 'models' and sp.get('of'):
        return {'cell': i, 'type': 'code', 'q': f"칸 {sp['of']} 제품의 모델 코드", 'options': '', 'when': when(sp)}
    if 'dots' in sp:
        if int(sp['dots']) == 1:
            return {'cell': i, 'type': 'noul', 'q': what, 'options': f"{sp.get('fill', '●')} / 빈칸", 'when': when(sp)}
        return {'cell': i, 'type': 'score', 'q': what, 'options': f"{sp.get('fill', '●')} {sp.get('min', 1)}~{sp['dots']}", 'when': when(sp)}
    opts = ' / '.join(sp.get('options') or []) if sp.get('pick') == 'options' else LIST_LABEL.get(sp.get('pick'), sp.get('pick'))
    if sp.get('of'):
        opts += f" (칸 {sp['of']} 공간의 것)"
    kind = 'noul × 항목' if sp.get('multi') else 'choice'
    extra = (f" · 최대 {sp['max']}개 ‘{sp['multi']}’" if sp.get('multi') else '') + (f" · 묶음 {sp['group']}: 서로 다르게" if sp.get('group') else '')
    return {'cell': i, 'type': kind, 'q': what, 'options': opts + extra, 'when': when(sp)}


def view(f: str, modules: Sequence[str], settings: Any = None) -> Dict[str, dict]:
    """{flow module: {task, active, off, questions:[{type, q, options}], llm}} — what the decision branch of each step asks"""
    if settings is None:
        try:
            from .settings import get_settings
            settings = get_settings()
        except Exception:  # noqa: BLE001
            settings = None
    sp = spec(f)
    off = sp.get('off') or {}

    def state(task: str) -> dict:
        enabled = bool(settings is not None and settings.decision_enabled(task))
        return {'task': task, 'active': enabled and task not in off, 'enabled': enabled, **({'off': off[task]} if task in off else {})}
    out: Dict[str, dict] = {}
    cells = sp.get('cells') or {}
    writer = next((m for m in ('element', 'write') if m in modules), None)
    if writer and cells:
        roles = {k: (v.get('role') or '') for k, v in (layout_cells.design(f).get('cells') or {}).items()}
        rows = [_cell_line(i, c, roles.get(i, '')) for i, c in sorted(cells.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0)]
        out[writer] = {**state('layout.cells'), 'questions': rows,
                       'llm': '나머지 칸만 LLM이 씀 — 쓰기 전(pre) 이름은 정해진 칸으로 받고, 쓴 뒤(post) 표시 · 등급은 Decision이 판단'}
    if 'verify' in modules:
        out['verify'] = {**state('layout.verify'), 'questions': [
            {'type': 'choice', 'q': '요구마다 — 수행 방법 · 조건 · 승인 요청까지 실제로 답한 칸', 'options': '쓴 칸 + 없음'},
            {'type': 'choice', 'q': '칸마다 — 문구의 문제', 'options': ' · '.join(ISSUE_TEXT.get(k, '문제 없음') for k in ISSUES)},
            {'type': 'choice', 'q': '장마다(파트 검토) — 다시 쓸지 · 이유', 'options': ' · '.join(['문제 없음'] + list(REVIEW_WHY.values()))}],
            'llm': '걸린 칸만 LLM이 고침(auto_part_verify_fix) · 다시 쓸 장만 LLM이 다시 씀(auto_sheet_redo)',
            'review': state('layout.review')}
    if 'pictures' in modules:
        out['pictures'] = {**state('layout.pictures'), 'questions': [
            {'type': 'choice', 'q': '사진 칸마다 — 고른 사진이 칸 문구와 맞는가', 'options': '맞음 · 다른 공간 · 다른 주인공 · 다른 업종 · 다른 제품군 · 다른 회사 간판'},
            {'type': 'choice', 'q': '맞지 않을 때 — 대신 쓸 사진', 'options': '대안 ≤3 · 템플릿 원래 사진 · 없음'},
            {'type': 'choice', 'q': '(LLM 고르기 방식일 때) 칸마다 — 후보 중 하나', 'options': '후보 ≤6 · 없음'}],
            'llm': '없음 — 사진 순위(칸 비율 포함)는 코드'}
    if 'final' in modules:
        out['final'] = {**state('layout.final'), 'questions': [
            {'type': 'choice', 'q': '쓴 칸마다 — 이 칸의 일을 하고 같은 카드의 항목을 말하는가', 'options': '맞음 · 이 칸의 일이 아님 · 다른 항목'}],
            'llm': '걸린 칸만 LLM이 다시 씀(auto_final_fix) · 걸린 칸이 없으면 LLM 호출 없음 — 형식 · 중복 · 고르지 않은 이름 · 사진은 코드'}
    return out
