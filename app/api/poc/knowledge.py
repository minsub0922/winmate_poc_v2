"""Canonical app-side knowledge for the PoC agents.

Source of truth is the snapshot written by ``app/scripts/export_agent_data.mjs`` into
``app/data/runtime/kb`` (current app catalog/templates/scenarios; 835 layouts, 594 active, hidden
industry covers, 1,068 products, 22 Best Scenarios, plus read-only copies of the PoC standard
scenarios and score criteria/rubrics/taxonomy).

* ``CanonicalLayoutKB`` subclasses ``winmate_layout.kb.KB`` with an explicit ``__init__`` and overrides
  the ``html`` / ``cards`` / ``standard_scenarios`` / ``std_rules`` cached properties. The PoC module
  globals ``SRC`` / ``DATA`` are never touched. Cards come from ``metadata.build_cards(kb)`` (pure).
* ``P`` holds all 1,068 products so explicitly selected DB product ids resolve. ``products`` (what the
  PoC Analyzer turns into its model/name regex and what ``recommend_products`` ranks) is the curated
  40 plus the products selected for the request — DB rows carry generic names such as "비즈니스TV"
  that would otherwise produce false product links.
* ``CanonicalStoryKB`` subclasses ``sbagent.kb.KB`` the same way with all 22 current scenarios and all
  1,068 products.
"""
from __future__ import annotations

import copy
import gzip
import hashlib
import json
import threading
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from . import imports
from .imports import POC_TEST, RUNTIME_DIR

KB_DIR = RUNTIME_DIR / 'kb'
EXPECTED = {'layouts_total': 835, 'layouts_active': 594, 'products': 1068, 'curated_products': 40, 'scenarios': 22}
LAYOUT_KEYS = ('f', 'c', 'code', 'name', 'when', 'g', 'p', 'p2', 'ind', 'sol', 'pc', 'req', 'prods', 'sols', 'phs', 'ph', 'hl', 'txt', 'eb', 'foot', 'sample')
PRODUCT_KEYS = ('id', 'name', 'model', 'cat', 'spec', 'spaces', 'ind', 'kw')
POC_SCORE = {'criteria': POC_TEST / 'proposal_score' / 'criteria' / 'criteria.json',
             'rubrics': POC_TEST / 'proposal_score' / 'criteria' / 'rubrics.json',
             'taxonomy': POC_TEST / 'proposal_score' / 'taxonomy' / 'taxonomy.json'}
POC_STANDARD = POC_TEST / 'layout_agent' / 'data' / 'standard_scenarios.json'
NOTES = [
    'Layout Agent: P 는 제품 1,068개 전체(선택한 DB 제품 id 해석용), Analyzer 추천 · 모델명 탐지는 큐레이션 40개 + 요청에서 선택한 제품만 씁니다(DB 일반 제품명 오탐 방지).',
    'Storyboard Agent: 22개 시나리오 · 제품 1,068개 전체를 씁니다.',
    'RAG 검색: BM25 + TF-IDF(char n-gram) 결정론 검색 — Gemini 임베딩을 쓰지 않습니다.',
    '숨김 업종 표지(L_IND_*)는 HTML · 레지스트리(hidden_layouts)에만 있고 추천 후보(kb.L / cards)에는 넣지 않습니다(PoC 의미 유지).',
]


class KnowledgeError(RuntimeError):
    def __init__(self, message: str, code: str = 'kb_invalid') -> None:
        super().__init__(message)
        self.code = code


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def _json(path: Path) -> Any:
    try:
        if path.suffix == '.gz':
            with gzip.open(path, 'rt', encoding='utf-8') as fh:
                return json.load(fh)
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        raise KnowledgeError(f'정본 KB 파일이 없습니다: {path.name} — node app/scripts/export_agent_data.mjs 를 다시 실행하세요.', 'kb_missing') from None
    except (OSError, ValueError) as exc:
        raise KnowledgeError(f'정본 KB 파일을 읽지 못했습니다: {path.name} ({type(exc).__name__})') from exc


def _layout_refs(node: Any, out: set) -> set:
    if isinstance(node, str):
        if node.startswith('L_') and ' ' not in node and len(node) < 64:
            out.add(node)
    elif isinstance(node, dict):
        for v in node.values():
            _layout_refs(v, out)
    elif isinstance(node, list):
        for v in node:
            _layout_refs(v, out)
    return out


@dataclass
class Bundle:
    dir: Path
    manifest: dict
    catalog: dict
    html: Dict[str, str]
    parts: dict
    scenarios: dict
    images: dict
    retired: Dict[str, str]
    hidden_layouts: Dict[str, dict]
    standard_scenarios: Optional[dict]
    score_paths: Dict[str, Path]
    report: dict = field(default_factory=dict)


def load_bundle(kb_dir: Optional[Path] = None) -> Bundle:
    kb_dir = Path(kb_dir or KB_DIR)
    if not (kb_dir / 'manifest.json').is_file():
        raise KnowledgeError('정본 KB 가 없습니다. 먼저 `node app/scripts/export_agent_data.mjs` 를 실행하세요.', 'kb_missing')
    manifest = _json(kb_dir / 'manifest.json')
    catalog = _json(kb_dir / 'catalog.json')
    html = _json(kb_dir / 'layout_html.json.gz')
    parts = _json(kb_dir / 'parts.json')
    scenarios = _json(kb_dir / 'best_scenarios.json')
    images = _json(kb_dir / 'images.json')
    retired = _json(kb_dir / 'retired.json')
    hidden = _json(kb_dir / 'hidden_layouts.json')
    std_path = kb_dir / 'standard_scenarios.json'
    standard = _json(std_path) if std_path.is_file() else (_json(POC_STANDARD) if POC_STANDARD.is_file() else None)
    score_paths = {}
    for name, poc_path in POC_SCORE.items():
        local = kb_dir / 'score' / f'{name}.json'
        score_paths[name] = local if local.is_file() else poc_path
    bundle = Bundle(kb_dir, manifest, catalog, html, parts, scenarios, images, retired, hidden, standard, score_paths)
    bundle.report = verify_bundle(bundle)
    if bundle.report['errors']:
        raise KnowledgeError('정본 KB 검증 실패: ' + ' / '.join(bundle.report['errors'][:6]))
    return bundle


def verify_bundle(b: Bundle) -> dict:
    errors: List[str] = []
    warnings: List[str] = []
    cat = b.catalog
    for key in ('layouts', 'industries', 'products', 'solutions', 'cases', 'indKw', 'curated_product_ids'):
        if key not in cat:
            errors.append(f'catalog.json 에 {key} 가 없음')
    if errors:
        return {'errors': errors, 'warnings': warnings, 'counts': {}, 'expected': EXPECTED, 'counts_ok': False}
    layouts = cat['layouts']
    fs = [l.get('f') for l in layouts]
    L = set(fs)
    if len(L) != len(fs):
        errors.append('레이아웃 f 중복')
    missing_keys = sorted({k for l in layouts for k in LAYOUT_KEYS if k not in l})
    if missing_keys:
        errors.append('레이아웃 메타 필수 필드 없음: ' + ', '.join(missing_keys[:10]))
    no_html = [f for f in fs if f not in b.html]
    if no_html:
        errors.append(f'HTML 없는 레이아웃 {len(no_html)}개: ' + ', '.join(no_html[:6]))
    hidden_no_html = [f for f in b.hidden_layouts if f not in b.html]
    if hidden_no_html:
        errors.append('HTML 없는 숨김 레이아웃: ' + ', '.join(hidden_no_html[:6]))
    retired_bad = [f'{a}→{t}' for a, t in b.retired.items() if a in L and t not in L]
    if retired_bad:
        errors.append('retired 대상이 레지스트리에 없음: ' + ', '.join(retired_bad[:6]))
    unused = [a for a in b.retired if a not in L]
    if unused:
        warnings.append('레지스트리에 없는 retired 원본(앱도 무시): ' + ', '.join(unused[:6]))
    marked = {l['f'] for l in layouts if l.get('retired')}
    if marked != {f for f in b.retired if f in L}:
        warnings.append('catalog.retired 표시와 retired.json 이 다름')
    products = cat['products']
    pids = [p.get('id') for p in products]
    if len(set(pids)) != len(pids):
        errors.append('제품 id 중복')
    pmissing = sorted({k for p in products for k in PRODUCT_KEYS if k not in p})
    if pmissing:
        errors.append('제품 필수 필드 없음: ' + ', '.join(pmissing))
    curated = [i for i in cat['curated_product_ids'] if i in set(pids)]
    if len(curated) != len(cat['curated_product_ids']):
        errors.append('큐레이션 제품 id 일부가 제품 목록에 없음')
    for key in ('PARTS', 'NEXT', 'RELATED', 'REQ_LABEL'):
        if key not in b.parts:
            errors.append(f'parts.json 에 {key} 없음')
    for key in ('REQ_TYPES', 'STRATEGIES', 'ENDINGS', 'STAGES', 'SCENARIOS'):
        if key not in b.scenarios:
            errors.append(f'best_scenarios.json 에 {key} 없음')
    registry = L | set(b.hidden_layouts)
    sc_missing = sorted({x['f'] for s in b.scenarios.get('SCENARIOS', []) for st in s.get('flow', []) for x in st.get('slides', []) if x.get('f') not in registry})
    if sc_missing:
        errors.append('시나리오가 가리키는 레이아웃이 없음: ' + ', '.join(sc_missing[:6]))
    if b.standard_scenarios is None:
        warnings.append('standard_scenarios.json 없음 — 표준(①) 경로를 쓸 수 없습니다')
    else:
        std_missing = sorted(_layout_refs(b.standard_scenarios, set()) - L)
        if std_missing:
            errors.append('standard_scenarios 가 가리키는 레이아웃이 없음: ' + ', '.join(std_missing[:6]))
    for name, path in b.score_paths.items():
        if not path.is_file():
            errors.append(f'score {name} 파일 없음')
    if not errors:
        try:
            crit = json.loads(b.score_paths['criteria'].read_text(encoding='utf-8'))
            tax = json.loads(b.score_paths['taxonomy'].read_text(encoding='utf-8'))
            ids = {c['id'] for c in crit['criteria']}
            in_fine = {i for f in tax['fine'] for i in f['criteria']}
            if ids - in_fine:
                errors.append('taxonomy 에 없는 평가 기준: ' + ', '.join(sorted(ids - in_fine)[:8]))
            if in_fine - ids:
                errors.append('criteria 에 없는 taxonomy 기준: ' + ', '.join(sorted(in_fine - ids)[:8]))
        except (OSError, ValueError, KeyError, TypeError) as exc:
            errors.append(f'score 기준 파일 형식 오류: {type(exc).__name__}')
    counts = {'layouts_total': len(layouts), 'layouts_active': sum(1 for l in layouts if not l.get('retired')),
              'hidden_layouts': len(b.hidden_layouts), 'html': len(b.html), 'products': len(products), 'curated_products': len(curated),
              'scenarios': len(b.scenarios.get('SCENARIOS', [])), 'industries': len(cat['industries']), 'solutions': len(cat['solutions']),
              'cases': len(cat['cases'])}
    counts_ok = all(counts.get(k) == v for k, v in EXPECTED.items())
    if not counts_ok:
        warnings.append('개수가 기대값과 다름: ' + ', '.join(f'{k} {counts.get(k)}≠{v}' for k, v in EXPECTED.items() if counts.get(k) != v))
    stale = []
    for rel, rec in (b.manifest.get('inputs') or {}).items():
        path = imports.ROOT / rel
        try:
            if not path.is_file() or path.stat().st_size != rec.get('size') or (rec.get('sha256') and _sha256(path) != rec['sha256']):
                stale.append(rel)
        except OSError:
            stale.append(rel)
    if stale:
        warnings.append('KB 스냅샷 이후 바뀐 원천 파일: ' + ', '.join(stale[:6]) + ' — export_agent_data.mjs 를 다시 실행하세요')
    return {'errors': errors, 'warnings': warnings, 'counts': counts, 'expected': EXPECTED, 'counts_ok': counts_ok, 'stale_inputs': stale,
            'generated_at': b.manifest.get('generated_at'), 'score_source': {k: ('runtime' if str(v).startswith(str(b.dir)) else 'poc') for k, v in b.score_paths.items()}}


# ---------------------------------------------------------------- KB subclasses (built lazily — PoC imports are heavy)
_CLASSES: Dict[str, type] = {}


def _layout_kb_class() -> type:
    if 'layout' in _CLASSES:
        return _CLASSES['layout']
    L = imports.layout()
    base = L.kb.KB
    build_cards = L.metadata.build_cards

    class CanonicalLayoutKB(base):  # type: ignore[misc, valid-type]
        def __init__(self, bundle: Bundle, cards_cache: Optional[Path] = None) -> None:  # noqa: D401 — explicit init, no super()
            self._bundle = bundle
            self._cards_cache = cards_cache
            cat = bundle.catalog
            parts = bundle.parts
            self.PARTS, self.NEXT, self.RELATED = parts['PARTS'], parts['NEXT'], parts['RELATED']
            sc = bundle.scenarios
            self.REQ_TYPES, self.STRATEGIES, self.ENDINGS, self.STAGES = sc['REQ_TYPES'], sc['STRATEGIES'], sc['ENDINGS'], sc['STAGES']
            self.best_scenarios = sc['SCENARIOS']
            self.images = bundle.images
            self.layouts = cat['layouts']
            self.L = {l['f']: l for l in self.layouts}
            self.hidden_layouts = dict(bundle.hidden_layouts)
            self.industries = cat['industries']
            self.IND = {i['code']: i for i in self.industries}
            self.all_products = cat['products']
            self.P = {p['id']: p for p in self.all_products}
            curated = set(cat['curated_product_ids'])
            self.curated_ids = curated
            self.curated_products = [p for p in self.all_products if p['id'] in curated]
            self.selected_products: List[dict] = []
            self.products = list(self.curated_products)
            self.solutions = cat['solutions']
            self.S = {s['id']: s for s in self.solutions}
            self.cases = cat['cases']
            self.C = {str(x['id']): x for x in self.cases}
            self.IND_KW = cat['indKw']
            self.BS = {s['id']: s for s in self.best_scenarios}
            self.catalog = {'layouts': self.layouts, 'industries': self.industries, 'products': self.products,
                            'solutions': self.solutions, 'cases': self.cases, 'indKw': self.IND_KW}

        @cached_property
        def html(self) -> Dict[str, str]:
            return self._bundle.html

        @cached_property
        def cards(self) -> Dict[str, dict]:
            path = self._cards_cache
            if path is not None and path.is_file():
                try:
                    out = {}
                    for line in path.read_text(encoding='utf-8').splitlines():
                        if line.strip():
                            d = json.loads(line)
                            out[d['f']] = d
                    if set(out) == set(self.L):
                        return out
                except (OSError, ValueError, KeyError):
                    pass
            cards = build_cards(self)
            out = {c['f']: c for c in cards}
            if path is not None:
                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    tmp = path.with_suffix('.tmp')
                    tmp.write_text(''.join(json.dumps(c, ensure_ascii=False) + '\n' for c in cards), encoding='utf-8')
                    tmp.replace(path)
                except OSError:
                    pass
            return out

        @cached_property
        def standard_scenarios(self) -> Dict[str, dict]:
            d = self._bundle.standard_scenarios
            return {s['id']: s for s in d['scenarios']} if d else {}

        @cached_property
        def std_rules(self) -> dict:
            d = self._bundle.standard_scenarios
            return d.get('rules', {}) if d else {}

        def warm(self) -> 'CanonicalLayoutKB':
            for name in ('html', 'cards', 'standard_scenarios', 'std_rules', 'std_pref', 'photo_pool', 'label_freq', 'cut_by_model'):
                getattr(self, name)
            return self

        def with_products(self, ids: Iterable[str]) -> 'CanonicalLayoutKB':
            """Per-request view: curated 40 + explicitly selected products (shares all other data)."""
            self.warm()
            view = copy.copy(self)
            seen = set(self.curated_ids)
            sel = []
            for i in ids or []:
                if i in self.P and i not in seen:
                    sel.append(self.P[i])
                    seen.add(i)
            view.selected_products = sel
            view.products = self.curated_products + sel
            view.catalog = dict(self.catalog, products=view.products)
            return view

        def lookup_layout(self, f: str) -> Optional[dict]:
            return self.L.get(f) or self.hidden_layouts.get(f)

    _CLASSES['layout'] = CanonicalLayoutKB
    return CanonicalLayoutKB


def _story_kb_class() -> type:
    if 'story' in _CLASSES:
        return _CLASSES['story']
    S = imports.story()
    mod = S.kb
    base = mod.KB

    class CanonicalStoryKB(base):  # type: ignore[misc, valid-type]
        def __init__(self, bundle: Bundle) -> None:  # explicit init — sbagent.kb.KB reads its own data/ snapshot
            import re
            parts = bundle.parts
            self.PARTS, self.NEXT, self.RELATED, self.REQ_LABEL = parts['PARTS'], parts['NEXT'], parts['RELATED'], parts['REQ_LABEL']
            sc = bundle.scenarios
            self.REQ_TYPES, self.STRATEGIES, self.ENDINGS, self.STAGES = sc['REQ_TYPES'], sc['STRATEGIES'], sc['ENDINGS'], sc['STAGES']
            cat = bundle.catalog
            self.products = cat['products']
            self.solutions = cat['solutions']
            self.industries = {i['code']: i for i in cat['industries']}
            self.ind_kw = cat.get('indKw', {})
            layouts = {l['f']: l for l in cat['layouts']}
            for f, meta in bundle.hidden_layouts.items():
                layouts.setdefault(f, meta)
            self.layouts = layouts
            self.cases = {str(c['id']): c for c in cat['cases']}
            self.P = {p['id']: p for p in self.products}
            self.S = {s['id']: s for s in self.solutions}
            self.scenarios = [self._scenario(s) for s in sc['SCENARIOS']]
            self.SC = {s['id']: s for s in self.scenarios}
            self.product_names = {p['id']: sorted({p['model'], *re.findall(r'[A-Z]{1,4}\d{2}[A-Z0-9-]*', p['name'])}, key=lambda x: (-len(x), x))
                                  for p in self.products}
            self.solution_names = {s['id']: [s['name']] for s in self.solutions}
            lex = set(w for w in mod.SPACE_WORDS if len(w) >= 2)
            for ws in mod.EXTRA_IND_KW.values():
                lex.update(w for w in ws if len(w) >= 2)
            for ws in self.ind_kw.values():
                lex.update(w for w in ws if len(w) >= 3)
            lex -= mod.GENERIC
            self.domain_lexicon = sorted(lex, key=lambda x: (-len(x), x))

    _CLASSES['story'] = CanonicalStoryKB
    return CanonicalStoryKB


# ---------------------------------------------------------------- process-wide singletons
_LOCK = threading.RLock()
_STATE: Dict[str, Any] = {}


def _cards_cache_path(bundle: Bundle, enabled: bool) -> Optional[Path]:
    if not enabled:
        return None
    outs = bundle.manifest.get('outputs') or {}
    code = b''
    for name in ('metadata.py', 'slots.py'):
        p = imports.LAYOUT_DIR / 'winmate_layout' / name
        if p.is_file():
            code += p.read_bytes()
    key = hashlib.sha256((json.dumps(outs, sort_keys=True) + hashlib.sha256(code).hexdigest()).encode()).hexdigest()[:16]
    return bundle.dir / f'layout_cards.{key}.jsonl'


def bundle(reload: bool = False) -> Bundle:
    with _LOCK:
        if reload or 'bundle' not in _STATE:
            _STATE.clear()
            _STATE['bundle'] = load_bundle()
        return _STATE['bundle']


def layout_assets(kb_cache: bool = False) -> Tuple[Any, Any]:
    """(base CanonicalLayoutKB, LayoutIndex) — built once (cards ≈ seconds)."""
    with _LOCK:
        if 'layout' not in _STATE:
            b = bundle()
            cls = _layout_kb_class()
            kb = cls(b, _cards_cache_path(b, kb_cache)).warm()
            index = imports.layout().retrieval.LayoutIndex(kb, dense='tfidf')
            _STATE['layout'] = (kb, index)
        return _STATE['layout']


def story_kb() -> Any:
    with _LOCK:
        if 'story' not in _STATE:
            _STATE['story'] = _story_kb_class()(bundle())
        return _STATE['story']


def score_assets() -> Tuple[Any, Any, dict]:
    """(CriteriaSet, taxonomy, base catalog) with explicit paths (PoC default args are import-time bound)."""
    with _LOCK:
        if 'score' not in _STATE:
            b = bundle()
            ps = imports.score()
            cs = ps.criteria.load_criteria(b.score_paths['criteria'])
            tax = ps.taxonomy.load_taxonomy(b.score_paths['taxonomy'])
            cat = b.catalog
            curated = set(cat['curated_product_ids'])
            base = {'products': [p for p in cat['products'] if p['id'] in curated], 'solutions': cat['solutions'],
                    'cases': cat['cases'], 'industries': cat['industries']}
            _STATE['score'] = (cs, tax, base)
        return _STATE['score']


def score_catalog_for(text: str) -> dict:
    """Curated 40 + DB products whose model code appears in the document (no generic-name matches)."""
    _, _, base = score_assets()
    b = bundle()
    curated = {p['id'] for p in base['products']}
    extra = [p for p in b.catalog['products'] if p['id'] not in curated and p.get('model') and len(p['model']) >= 5 and p['model'] in text]
    return dict(base, products=base['products'] + extra)


def status() -> dict:
    try:
        b = bundle()
    except KnowledgeError as exc:
        return {'available': False, 'code': exc.code, 'message': str(exc), 'dir': str(KB_DIR.relative_to(imports.ROOT)), 'notes': NOTES}
    return {'available': True, 'dir': str(b.dir.relative_to(imports.ROOT)), **b.report, 'layout_ready': 'layout' in _STATE, 'notes': NOTES}
