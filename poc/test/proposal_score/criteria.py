"""평가 기준 — 앱 criteria.js 의 54개 기준 + 1 · 2 · 3점 기준(rubrics.json) + 적용 조건(gate).

criteria.json 은 tools/sync_criteria.py 가 만든다(앱 기준이 바뀌면 다시 실행 — 테스트가 어긋남을 잡는다).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from . import config

_STR = r"'((?:[^'\\]|\\.)*)'"


def parse_app_criteria(path: Path = config.APP_CRITERIA_JS) -> Tuple[List[dict], List[dict]]:
    """앱 src/review/criteria.js 에서 CATS · CRITERIA 의 id · 이름 · 가중치 · 설명을 읽는다(정규식, node 불필요)."""
    js = path.read_text(encoding='utf-8')
    cats_src = js[js.index('export const CATS'):js.index('export const CAT ')]
    cats = []
    for m in re.finditer(r"\{\s*id:\s*" + _STR + r",\s*name:\s*" + _STR + r",\s*short:\s*" + _STR + r",\s*w:\s*(\d+)[^}]*?desc:\s*" + _STR, cats_src):
        cats.append({'id': m.group(1), 'name': m.group(2), 'short': m.group(3), 'w': int(m.group(4)), 'desc': m.group(5)})
    crit_src = js[js.index('export const CRITERIA'):js.index('export const CR ')]
    starts = [m.start() for m in re.finditer(r"\{\s*id:\s*'[A-Z]{2}\d+'", crit_src)]
    crits = []
    for i, s in enumerate(starts):
        block = crit_src[s:starts[i + 1] if i + 1 < len(starts) else len(crit_src)]
        head = re.match(r"\{\s*id:\s*" + _STR + r",\s*cat:\s*" + _STR + r",\s*name:\s*" + _STR + r",\s*w:\s*(\d+)", block)
        desc = re.search(r"desc:\s*" + _STR, block)
        check = re.search(r"check:\s*" + _STR, block)
        when = re.search(r"when:\s*(.*?),\s*(?:visual:|\n\s*desc:)", block, re.S)
        crits.append({'id': head.group(1), 'cat': head.group(2), 'name': head.group(3), 'w': int(head.group(4)),
                      'desc': desc.group(1) if desc else '', 'check': check.group(1) if check else '',
                      'visual': bool(re.search(r'visual:\s*true', block)), 'app_when': (when.group(1).strip() if when else '')[:300]})
    return cats, crits


@dataclass
class Criterion:
    id: str
    cat: str
    name: str
    w: int
    desc: str
    check: str
    r1: str
    r2: str
    r3: str
    gate: str
    scope: List[str]
    concepts: List[str]
    visual: bool = False
    app_when: str = ''

    def rubric_text(self) -> str:
        return f"1점: {self.r1}\n2점: {self.r2}\n3점: {self.r3}"

    def one_line(self) -> str:
        return f"{self.id} {self.name} — {self.desc}"


@dataclass
class CriteriaSet:
    cats: List[dict]
    items: List[Criterion]
    scale: Dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.by_id: Dict[str, Criterion] = {c.id: c for c in self.items}
        self.cat_by_id: Dict[str, dict] = {c['id']: c for c in self.cats}

    def __getitem__(self, k: str) -> Criterion:
        return self.by_id[k]

    def ids(self) -> List[str]:
        return [c.id for c in self.items]


def build_criteria_json(app_js: Path = config.APP_CRITERIA_JS, rubrics: Path = config.RUBRICS_PATH) -> dict:
    cats, crits = parse_app_criteria(app_js)
    rb = json.loads(rubrics.read_text(encoding='utf-8'))
    missing = [c['id'] for c in crits if c['id'] not in rb['criteria']]
    extra = [k for k in rb['criteria'] if k not in {c['id'] for c in crits}]
    if missing or extra:
        raise ValueError(f'rubrics.json 과 criteria.js 가 어긋나요 — 빠짐 {missing} · 남음 {extra}')
    out = []
    for c in crits:
        r = rb['criteria'][c['id']]
        out.append({**c, 'r1': r['r1'], 'r2': r['r2'], 'r3': r['r3'], 'gate': r['gate'], 'scope': r['scope'], 'concepts': r['concepts']})
    return {'version': 1, 'source': 'src/review/criteria.js + criteria/rubrics.json', 'scale': rb['scale'], 'cats': cats, 'criteria': out}


def load_criteria(path: Path = config.CRITERIA_PATH) -> CriteriaSet:
    d = json.loads(path.read_text(encoding='utf-8'))
    items = [Criterion(**{k: c[k] for k in ('id', 'cat', 'name', 'w', 'desc', 'check', 'r1', 'r2', 'r3', 'gate', 'scope', 'concepts', 'visual', 'app_when')}) for c in d['criteria']]
    return CriteriaSet(d['cats'], items, d.get('scale', {}))


# ---------------------------------------------------------------- 적용 조건(gate)
# 앱 criteria.js 의 when() 을 옮긴 것. 입력 종류(kind)가 'winmate'(앱에서 그린 장)이면 글자 크기 · 위치를 직접 쟀으므로
# geometry · font_sizes 가 열리고, 파일 속성 · 노트 · 장표 화면이 필요한 기준(SB3 · SB4 · DS10)은 닫힌다.
def gate(name: str, x: dict) -> Tuple[bool, str]:
    kind = x.get('kind', 'winmate')
    n = x.get('units', 0)
    figs = x.get('figures', 0)
    prods = len(x.get('products', [])) + len(x.get('unknown_models', []))
    if name == 'always':
        return True, '모든 제안서'
    if name == 'slides':
        return (True, '장표형 문서') if x.get('slides', True) else (False, '장표형 문서가 아니에요')
    if name == 'slides_units5':
        return (True, '5장 이상 장표') if x.get('slides', True) and n >= 5 else (False, '짧은 문서')
    if name == 'units5':
        return (True, f'{n}장 흐름') if n >= 5 else (False, '분량이 짧아 흐름 평가 제외')
    if name == 'units8':
        return (True, '본 제안 분량') if n >= 8 else (False, '짧은 소개 자료')
    if name == 'geometry':
        return (True, '장마다 글자 상자 위치 · 크기를 쟀어요') if kind in ('winmate', 'pptx') or x.get('visual') else (False, '도형 위치 정보가 없어요')
    if name == 'font_sizes':
        return (True, '글자 크기 정보 있음') if kind in ('winmate', 'pptx', 'pdf') else (False, '글자 크기 정보가 없어요')
    if name == 'fonts':
        return (True, f"폰트 {x.get('font_count', 0)}종") if x.get('font_count') else (False, '폰트 정보가 없어요')
    if name == 'visual':
        return (True, '장표 화면을 함께 봐요') if x.get('visual') else (False, '장표 화면(이미지)이 없어요 — 색 · 톤은 판단 불가')
    if name == 'products':
        return (True, f'제품 {prods}종 언급') if prods else (False, '제품 · 모델명 언급이 없어요')
    if name == 'products_or_solutions':
        return (True, '솔루션: ' + ', '.join(x.get('solutions', [])[:3]) if x.get('solutions') else '제품만 있음') if prods or x.get('solutions') else (False, '제품 · 솔루션 언급이 없어요')
    if name == 'figures3':
        return (True, f'수치 {figs}개') if figs >= 3 else (False, f'수치가 {figs}개뿐이에요')
    if name == 'charts_or_figures8':
        return (True, f"차트 {x.get('charts', 0)} · 표 {x.get('tables', 0)} · 수치 {figs}") if x.get('charts') or x.get('tables') or figs >= 8 else (False, '차트 · 표가 거의 없어요')
    if name == 'linked_req':
        return (True, f"비교할 고객 요구사항 {len(x.get('req_list', []))}개") if x.get('req_list') else ((True, '본문에 요구사항 · RFP 언급') if x.get('rfp_like') else (False, '비교할 고객 요구사항이 없어요'))
    if name == 'industry':
        return (True, '업종: ' + x.get('ind_name', '')) if x.get('ind') else (False, '업종을 특정하지 못했어요')
    if name == 'market_or_figures':
        return (True, f"시장 관련 {x['market_units']}장" if x.get('market_units') else f'수치 {figs}개') if x.get('market_units') or figs >= 4 else (False, '시장 분석 내용이 없어요')
    if name == 'years_or_figures':
        return (True, f"연도 언급 {x.get('years', 0)}개") if x.get('years') else ((True, '수치는 있으나 기준 연도가 없어요') if figs >= 4 else (False, '인용 데이터가 없어요'))
    if name == 'market_units':
        return (True, '시장 · 분석 장 있음') if x.get('market_units') else (False, '분석 장이 없어요')
    if name == 'competition':
        return (True, '경쟁 비교: ' + (', '.join(x.get('competitors', [])[:3]) or f"{x.get('comp_units', 0)}장")) if x.get('competitors') or x.get('comp_units') else (False, '경쟁 비교 내용이 없어요')
    if name == 'cost_or_units8':
        return (True, '비용 관련 장 있음' if x.get('cost_units') else '본 제안 분량') if x.get('cost_units') or n >= 8 else (False, '짧은 소개 자료')
    if name == 'brand':
        return (True, '브랜드 표기 ' + ', '.join(x.get('brand_terms', [])[:3])) if x.get('brand_terms') else (False, '삼성 브랜드 · 솔루션 표기가 없어요')
    if name == 'abbr3':
        return (True, '약어 ' + ', '.join(x.get('abbrs', [])[:4])) if len(x.get('abbrs', [])) >= 3 else (False, '약어가 적어요')
    if name == 'disclosure':
        return (True, '사양 · 효과 수치 · 이미지 있음') if prods or figs >= 3 or x.get('pics') else (False, '고지할 내용이 없어요')
    if name == 'file_notes':
        return (True, '원본 파일') if kind in ('pptx', 'docx') else (False, '앱에서 만든 장 · PDF 는 노트 · 숨김 장 · 댓글 정보가 없어요')
    if name == 'file_meta':
        return (True, '파일 속성 있음') if x.get('meta_avail') else (False, '파일 속성이 없어요')
    if name == 'rfp_format':
        return (True, 'RFP 형식 요구 있음') if x.get('rfp_format') else (False, 'RFP 형식 요구가 연결되지 않았어요')
    raise KeyError(f'모르는 gate: {name}')


def applicable(cs: CriteriaSet, profile: dict) -> Dict[str, Tuple[bool, str]]:
    return {c.id: gate(c.gate, profile) for c in cs.items}
