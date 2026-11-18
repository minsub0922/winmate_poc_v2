"""제품 코드 · 솔루션 이름 없는 프롬프트 — the layout flows' model calls see item handles, never product codes.

User 2026-11-18: "프롬프트에 특정 제품코드가 들어가면 안돼(제품 QM55C, QM65C, QM43C). 로직에 따라서 제품군 정도는 들어갈 수 있어도.
그리고 솔루션도 솔루션 특화 페이지인 경우만 솔루션명이 들어가게 해."

One vocabulary a composition (from the customer's selection), applied at the model boundary (``Masked`` wraps the composer's
LLM and its decision clients):
- a selected product is its family and a number — ``사이니지①`` · ``사이니지②`` · ``키오스크①`` (every form of its name, model code and
  id becomes the handle); a selected solution is its category and a letter — ``사이니지 CMSⓐ`` — except on that solution's own
  page (``sheet(sl)``: a solution sheet · journey · 핵심 기술 · a layout written about it), where its name stays;
- a catalog product or solution the customer did not select is ``다른 사이니지`` · ``다른 사이니지 CMS``; a model code of a catalog
  series that the catalog does not list (QM65C) is ``모델``;
- schema enums of item ids become handles; the answer comes back with the ids (enum fields) and the deck's names (free text) —
  a handle the model wrote where a name goes becomes that name.
"""
from __future__ import annotations

import contextlib
import re
from collections import Counter
from contextvars import ContextVar
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

NUM = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
LET = 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣ'
MARKS = NUM + LET
SCOPE: ContextVar[frozenset] = ContextVar('item_mask_scope', default=frozenset())   # solution ids whose names a call may carry
_HOLDER: ContextVar[Optional[dict]] = ContextVar('item_mask_holder', default=None)
SOLUTION_KINDS = ('solution', 'journey', 'tech')
# the short forms people (and the model) write for a solution — the catalog keeps the full name only
ALIASES = {'stpro': ['ST Pro', 'ST 프로', '스마트싱스 프로'], 'magicinfo': ['매직인포', 'Magic INFO'], 'knoxsuite': ['Knox', '녹스'],
           'lynk': ['LYNK', '링크 클라우드'], 'biot': ['비아이오티'], 'dms': ['DMS'], 'vxt': ['VXT']}
GENERIC = {'보안', '에너지', '클라우드', '템플릿', '유지보수', '케어', '청정', 'IoT', 'CMS', 'MDM', 'BMS', 'PMS', 'SLA', '서비스'}


def _family(p: dict) -> str:
    raw = str(p.get('sc') or p.get('cat') or '제품')
    raw = re.sub(r'\([^)]*\)', '', raw.split('›')[-1]).strip()
    raw = re.sub(r'^(스마트\s+|LCD\s+)+', '', raw)
    raw = re.sub(r'\bLCD\s+', '', raw).strip()
    fixed = {'호텔TV': '호텔 TV', '갤럭시 탭': '태블릿', '갤럭시 스마트폰': '스마트폰', '올인원PC/데스크탑': 'PC', '일반 프린터/복합기': '복합기'}
    return fixed.get(raw, raw) or '제품'


def _category(x: dict) -> str:
    raw = re.sub(r'\([^)]*\)', '', str(x.get('cat') or '솔루션')).split(' · ')[0].strip()
    return raw or '솔루션'


def _ascii(s: str) -> bool:
    return bool(re.fullmatch(r'[\x00-\x7f]+', s))


def _code_like(s: str) -> bool:
    # (a model code 'QM55C' · 'SM-T636' · 'DMS 2.5', or a model named in Korean with its number: '엑스커버7 프로' · '탭 액티브5')
    return bool(re.search(r'[A-Za-z]{1,4}-?\d{2,}|\d{2,}[A-Za-z]{2,}|[A-Z]{2,}\s\d+\.\d+|[가-힣]{2,}\d{1,2}(?![\d.])', s or ''))


STOP_PREFIX = {'IP', 'IK', 'ISO', 'KS', 'UL', 'CE', 'HDR', 'USB', 'DDR', 'PM', 'CO'}


class Vocab:
    """the composition's handles: ``mask`` · ``unmask`` text, schemas and answers"""

    def __init__(self, auto: Any, ctx: dict) -> None:
        lib = auto.load()
        P, S = lib.get('products_all') or {}, lib.get('solutions') or {}
        short = ctx.get('short') or {}
        self.handle: Dict[Tuple[str, str], str] = {}          # (kind, id) → handle
        self.show: Dict[str, str] = {}                        # handle → the deck's name
        self.ident: Dict[str, Tuple[str, str]] = {}           # handle → (kind, id)
        self._sol_strings: Dict[str, Set[str]] = {}           # solution id → its name forms (unmasked on its own page)
        repl: Dict[str, Tuple[str, Optional[str]]] = {}       # text → (replacement, solution id the text names | None)
        fam_n: Counter = Counter()
        picked_p = [q for q in ctx.get('products') or [] if q in P]
        picked_s = [q for q in ctx.get('solutions') or [] if q in S]
        for q in picked_p:
            p = P[q]
            fam = _family(p)
            fam_n[fam] += 1
            h = f"{fam}{NUM[min(fam_n[fam], len(NUM)) - 1]}"
            self.handle[('product', q)], self.show[h], self.ident[h] = h, short.get(q) or p.get('name') or q, ('product', q)
            for s in self._product_forms(p, q, short.get(q)):
                repl.setdefault(s, (h, None))
        for n, q in enumerate(picked_s):
            x = S[q]
            h = f"{_category(x)}{LET[min(n, len(LET) - 1)]}"
            self.handle[('solution', q)], self.show[h], self.ident[h] = h, short.get(q) or x.get('name') or q, ('solution', q)
            forms = self._solution_forms(x, q, short.get(q))
            self._sol_strings[q] = forms
            for s in forms:
                repl.setdefault(s, (h, q))
        for q, p in P.items():   # the catalog's other products: their family, never their code
            if q in picked_p:
                continue
            for s in self._product_forms(p, q, None, strict=True):
                repl.setdefault(s, (f"다른 {_family(p)}", None))
        for q, x in S.items():
            if q in picked_s:
                continue
            for s in self._solution_forms(x, q, None):
                repl.setdefault(s, (f"다른 {_category(x)}", None))
        self._repl = {}
        for k, v in repl.items():   # (ASCII forms in any case: 'MagicInfo' is 'MagicINFO')
            self._repl.setdefault(k.lower() if _ascii(k) else k, v)
        keys = sorted((k for k in repl if k), key=len, reverse=True)
        parts = [(r'(?<![A-Za-z0-9])(?i:' + re.escape(k) + r')(?![A-Za-z0-9])') if _ascii(k) else re.escape(k) for k in keys]
        self._rx = re.compile('|'.join(parts)) if parts else None
        prefixes = sorted({m.group(1) for p in P.values() for m in [re.match(r'([A-Z]{2,3})\d{2}', str(p.get('model') or ''))] if m} - STOP_PREFIX)
        self._code = re.compile(r'(?<![A-Za-z0-9])(?:' + '|'.join(prefixes) + r')\d{2,3}[A-Z0-9]{0,3}(?:-[A-Z0-9]{1,3})?(?![A-Za-z0-9])') if prefixes else None
        hs = sorted(self.show, key=len, reverse=True)
        self._back = re.compile('|'.join(re.escape(h[:-1]) + r'\s?' + re.escape(h[-1]) for h in hs)) if hs else None
        self._back_of = {re.sub(r'\s', '', h): h for h in hs}

    # ---- forms of an item's name
    @staticmethod
    def _product_forms(p: dict, q: str, short: Optional[str], strict: bool = False) -> Set[str]:
        """the forms of a product's name a prompt may carry: the name (a selected one always — its name cell is written with the
        handle; another only when it carries a code), its tails that carry the code ('사이니지 QM55C' · 'QM55C'), the model code,
        the deck's short name when it is a code, the id when it is code-like ('qm55c')"""
        name, model = str(p.get('name') or '').strip(), str(p.get('model') or '').strip()
        out = set()
        if name and (not strict or _code_like(name)):
            out.add(name)
            words = name.split()
            out |= {' '.join(words[k:]) for k in range(1, len(words)) if _code_like(' '.join(words[k:]))}
        if model and _code_like(model):
            out.add(model)
        m = re.search(r'\b([A-Z]{2,})\s\d+\.\d+', name)
        if m:
            out.add(m.group(1))   # the line itself ('DMS' of 'DMS 2.5')
        if short and (_code_like(short) or short == name):
            out.add(short)
        if _code_like(q):
            out.add(q)
        return {s for s in out if len(s) >= 3}

    @staticmethod
    def _solution_forms(x: dict, q: str, short: Optional[str]) -> Set[str]:
        out = {str(x.get('name') or '').strip(), (short or '').strip(), q if len(q) >= 3 else ''}
        name = str(x.get('name') or '')
        if name.lower().startswith('samsung '):
            out.add(name[8:])
        if not name and re.fullmatch(r'[a-z]{2,6}', q):
            out.add(q.upper())   # (a catalog entry without a name: its id is its name — 'DMS')
        out |= set(ALIASES.get(q, []))
        kw = [str(k) for k in x.get('kw') or []]
        if kw and kw[0] not in GENERIC and len(kw[0]) >= 2 and (re.search(r'[가-힣]', kw[0]) or kw[0].upper() in name.upper()):
            out.add(kw[0])   # the transliteration ('매직인포' · '스마트싱스 프로') or the short form in the name ('VXT')
        return {s for s in out if s and len(s) >= 2 and s not in GENERIC}

    # ---- text
    def mask(self, text: str, allow: Iterable[str] = ()) -> str:
        if not isinstance(text, str) or not text:
            return text
        allow = set(allow or ())

        def sub(m):
            s = m.group(0)
            to, sol = self._repl.get(s.lower() if _ascii(s) else s, (s, None))
            return s if sol is not None and sol in allow else to
        out = self._rx.sub(sub, text) if self._rx is not None else text
        if self._code is not None:
            out = self._code.sub('모델', out)
        return out

    def unmask(self, text: str) -> str:
        if not isinstance(text, str) or not text or self._back is None:
            return text
        out = self._back.sub(lambda m: self.show.get(self._back_of.get(re.sub(r'\s', '', m.group(0)), ''), m.group(0)), text)
        return re.sub(f'[{MARKS}]', '', out) if any(c in out for c in MARKS) else out

    def has_handles(self, text: str) -> bool:
        return any(c in (text or '') for c in MARKS)

    def legend(self) -> str:
        return '표식: ①②… · ⓐⓑ… 가 붙은 이름은 고객이 고른 제품 · 솔루션입니다. 그 항목의 이름이 필요한 칸에는 표식을 그대로 씁니다.'

    # ---- structures (decision states · schemas · answers)
    def mask_obj(self, v: Any, allow: Iterable[str] = ()) -> Any:
        if isinstance(v, str):
            return self.mask(v, allow)
        if isinstance(v, list):
            return [self.mask_obj(x, allow) for x in v]
        if isinstance(v, dict):
            return {self.mask(k, allow) if isinstance(k, str) else k: self.mask_obj(x, allow) for k, x in v.items()}
        return v

    def unmask_obj(self, v: Any) -> Any:
        if isinstance(v, str):
            return self.unmask(v)
        if isinstance(v, list):
            return [self.unmask_obj(x) for x in v]
        if isinstance(v, dict):
            return {k: self.unmask_obj(x) for k, x in v.items()}
        return v

    def mask_schema(self, schema: Any, allow: Iterable[str] = ()) -> Tuple[Any, Dict[str, str]]:
        """enum values that name items become handles → (schema, handle → original value)"""
        back: Dict[str, str] = {}

        def walk(s):
            if isinstance(s, dict):
                out = {}
                for k, v in s.items():
                    if k == 'enum' and isinstance(v, list):
                        vals = []
                        for e in v:
                            m = self.mask(e, allow) if isinstance(e, str) else e
                            if m != e:
                                back[m] = e
                            vals.append(m)
                        out[k] = vals
                    else:
                        out[k] = walk(v)
                return out
            if isinstance(s, list):
                return [walk(x) for x in s]
            return s
        return walk(schema), back

    def unmask_answer(self, d: Any, back: Dict[str, str]) -> Any:
        """an enum value the model chose (a handle) → the original value; free text → the deck's names"""
        if isinstance(d, str):
            return back.get(d, self.unmask(d))
        if isinstance(d, list):
            return [self.unmask_answer(x, back) for x in d]
        if isinstance(d, dict):
            return {k: self.unmask_answer(x, back) for k, x in d.items()}
        return d


# ---------------------------------------------------------------- the scope of one sheet
def allowed(auto: Any, ctx: dict, sl: Optional[dict]) -> frozenset:
    """the selected solutions a sheet may name: its own page (a solution sheet · journey · 핵심 기술, or a layout written about it)"""
    if not sl:
        return frozenset()
    picked = set(ctx.get('solutions') or [])
    b = sl.get('bind') or {}
    own: Set[str] = set()
    if sl.get('kind') in SOLUTION_KINDS:
        own |= {b['solution']} if b.get('solution') else set()
        own |= set(b.get('solutions') or [])
        own |= {r.get('solution') for r in sl.get('journey_sols') or [] if isinstance(r, dict) and r.get('solution')}
    try:
        from .. import layout_cells
        say = (layout_cells.design(sl['f']).get('say') or '') + ' ' + str((((auto.load().get('layouts') or {}).get(sl['f']) or {}).get('name')) or '')
        S = auto.load().get('solutions') or {}
        for q in picked:
            name = str((S.get(q) or {}).get('name') or '')
            if name and name in say:
                own.add(q)
    except Exception:  # noqa: BLE001
        pass
    return frozenset(q for q in own if q in picked)


@contextlib.contextmanager
def sheet(auto: Any, ctx: dict, sl: Optional[dict]):
    """calls made inside name only this sheet's own solutions (none outside a solution page)"""
    token = SCOPE.set(allowed(auto, ctx, sl))
    try:
        yield
    finally:
        SCOPE.reset(token)


# ---------------------------------------------------------------- the model boundary
class MaskedDecision:
    def __init__(self, client: Any, holder: dict) -> None:
        object.__setattr__(self, '_client', client)
        object.__setattr__(self, '_holder', holder)

    def __getattr__(self, k):
        return getattr(self._client, k)

    def ask(self, stage: str, state: Any, questions: Dict[str, dict]) -> Dict[str, dict]:
        v: Optional[Vocab] = self._holder.get('vocab')
        if v is None:
            return self._client.ask(stage, state, questions)
        allow = SCOPE.get()
        keys: Dict[str, Dict[str, str]] = {}
        qs = {}
        for qid, q in questions.items():
            # (every field the model reads — 'instructions' as decision.choice builds it, any other — but the type and the
            #  criteria, whose keys come back as the answer and are mapped below)
            q2 = {k: (x if k in ('type', 'criteria') else v.mask_obj(x, allow)) for k, x in q.items()}
            if isinstance(q.get('criteria'), dict):
                crit, kmap = {}, {}
                for k, desc in q['criteria'].items():
                    mk = v.mask(k, allow)
                    if mk in crit:   # two names that mask alike (two '다른 사이니지'): keep them apart
                        mk = f'{mk}#{len(crit)}'
                    kmap[mk] = k
                    crit[mk] = v.mask(desc, allow) if isinstance(desc, str) else desc
                q2['criteria'] = crit
                keys[qid] = kmap
            qs[qid] = q2
        answers = self._client.ask(stage, v.mask_obj(state, allow), qs)
        out = {}
        for qid, a in (answers or {}).items():
            kmap = keys.get(qid) or {}
            if isinstance(a, dict):
                a = dict(a)
                if isinstance(a.get('choice'), str):
                    a['choice'] = kmap.get(a['choice'], a['choice'])
                if isinstance(a.get('probabilities'), dict):
                    a['probabilities'] = {kmap.get(k, k): p for k, p in a['probabilities'].items()}
            out[qid] = a
        return out


class Masked:
    """the composer's LLM with masked prompts (and decision clients with masked states) — everything else passes through"""

    def __init__(self, llm: Any, holder: dict) -> None:
        object.__setattr__(self, '_llm', llm)
        object.__setattr__(self, '_holder', holder)

    def __getattr__(self, k):
        if k == 'decisions':
            ds = getattr(self._llm, 'decisions', None)
            return {t: (c if isinstance(c, MaskedDecision) else MaskedDecision(c, self._holder)) for t, c in ds.items()} if isinstance(ds, dict) else ds
        return getattr(self._llm, k)

    def __setattr__(self, k, value):
        setattr(self._llm, k, value)

    def json(self, *, stage: str, prompt: str, schema: Any = None, validate: Any = None, **kw: Any) -> Any:
        v: Optional[Vocab] = self._holder.get('vocab')
        if v is None:
            return self._llm.json(stage=stage, prompt=prompt, schema=schema, validate=validate, **kw)
        allow = SCOPE.get()
        p = v.mask(prompt, allow)
        if v.has_handles(p):
            p = v.legend() + '\n' + p
        sch, back = v.mask_schema(schema, allow) if schema is not None else (None, {})
        check = (lambda d: validate(v.unmask_answer(d, back))) if validate is not None else None
        for key in ('system',):
            if isinstance(kw.get(key), str):
                kw[key] = v.mask(kw[key], allow)
        d = self._llm.json(stage=stage, prompt=p, schema=sch, validate=check, **kw)
        return v.unmask_answer(d, back)


def wrap(llm: Any, ctx: dict, auto: Any) -> Any:
    """the composer's LLM for this composition (an already masked one passes as is)"""
    if llm is None or isinstance(llm, Masked):
        return llm
    holder = {'vocab': ctx.get('_mask') or (Vocab(auto, ctx) if ctx.get('products') is not None else None)}
    return Masked(llm, holder)


def install(auto: Any) -> None:
    """after part_orchestrator.install: every model call of a composition (run_auto) or of a layout's lab run is masked"""
    if getattr(auto, '_item_mask', False):
        return
    auto._item_mask = True
    build, run, fill_text, fill_images, orchestrate = auto.build_context, auto.run_auto, auto.fill_part_text, auto.fill_part_images, auto.orchestrate

    def build_context(pr, body):
        ctx = build(pr, body)
        try:
            ctx['_mask'] = Vocab(auto, ctx)
        except Exception:  # noqa: BLE001 — no vocabulary: the calls pass unmasked (the composer still works)
            ctx['_mask'] = None
        h = _HOLDER.get()
        if h is not None:
            h['vocab'] = ctx['_mask']
        return ctx

    def run_auto(pr, body, llm, *a, **kw):
        if llm is None or isinstance(llm, Masked):
            return run(pr, body, llm, *a, **kw)
        holder: dict = {'vocab': None}
        token = _HOLDER.set(holder)
        try:
            return run(pr, body, Masked(llm, holder), *a, **kw)
        finally:
            _HOLDER.reset(token)

    auto.build_context, auto.run_auto = build_context, run_auto
    auto.fill_part_text = lambda ctx, plan, part, pp, slides, llm: fill_text(ctx, plan, part, pp, slides, wrap(llm, ctx, auto))
    auto.fill_part_images = lambda ctx, part, slides, llm, *a, **kw: fill_images(ctx, part, slides, wrap(llm, ctx, auto), *a, **kw)
    auto.orchestrate = lambda ctx, llm: orchestrate(ctx, wrap(llm, ctx, auto))
