"""평가할 제안서 — 전체 맥락(덱 브리프) + 시트별 구성요소.

입력: tools/export_best_scenarios.mjs 가 만든 시나리오 JSON(앱에서 실제로 그린 장).
- 시트(장)마다: 단계 · 역할 · 레이아웃 · 파트 유형 · 텍스트 칸(글자 크기 · 위치 · 넘침) · 이미지 칸(채움 여부) · 고정 문구
- 덱 맥락: 고객 · 업종 · 요구 유형 · 전략 · 결정권자 · 고객 발언(요구) · 고객 평가 기준 · 핵심 메시지 · 단계 흐름
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from . import config

FOOTER_Y = 660          # 1280×720 장에서 이 아래는 푸터(쪽번호 · CONFIDENTIAL)
WS = re.compile(r'\s+')


def norm(s: str) -> str:
    return WS.sub(' ', (s or '').replace(' ', ' ')).strip()


def nospace(s: str) -> str:
    return WS.sub('', (s or '').replace(' ', ''))


@dataclass
class Sheet:
    n: int
    f: str
    layout_name: str
    part: Optional[str]
    part_label: str
    stage_key: str
    stage_name: str
    role: str
    texts: List[dict]
    images: List[dict]
    fixed_texts: List[str]
    overlaps: List[list]
    free_pictures: int = 0
    bg: bool = False
    photo_first: bool = False
    layout_when: str = ''

    @property
    def body_texts(self) -> List[dict]:
        return [t for t in self.texts if t.get('text') and t.get('y', 0) < FOOTER_Y]

    @property
    def title(self) -> str:
        cand = [t for t in self.body_texts if t.get('y', 0) < 200 and len(t['text']) >= 4]
        if not cand:
            cand = self.body_texts
        if not cand:
            return ''
        t = sorted(cand, key=lambda t: (-t.get('max_px', t.get('px', 0)), t.get('y', 0)))[0]
        return norm(t['text'].split('\n')[0])[:140]

    @property
    def title_box(self) -> Optional[dict]:
        cand = [t for t in self.body_texts if t.get('y', 0) < 200 and len(t['text']) >= 4]
        if not cand:
            return None
        return sorted(cand, key=lambda t: (-t.get('max_px', t.get('px', 0)), t.get('y', 0)))[0]

    @property
    def text(self) -> str:
        """장의 글 전체(텍스트 칸 순서 + 고정 문구)."""
        parts = [t['text'] for t in self.texts if t.get('text')]
        return '\n'.join(parts + list(self.fixed_texts))

    @property
    def words(self) -> int:
        return len([w for w in WS.split(' '.join(t['text'] for t in self.body_texts)) if w])

    @property
    def pictures(self) -> int:
        return sum(1 for i in self.images if i.get('filled')) + self.free_pictures + (1 if self.bg else 0)

    @property
    def empty_image_slots(self) -> int:
        return sum(1 for i in self.images if not i.get('filled'))

    def compact(self, limit: int = 1800) -> str:
        """LLM 에 넘기는 장 본문 — 칸 순서대로 ' | ' 로 잇고, 사진 이름을 덧붙인다."""
        body = ' | '.join(norm(t['text']) for t in self.texts if t.get('text'))
        pics = [i.get('name') for i in self.images if i.get('filled') and i.get('name')]
        s = body + (f"  〔사진: {' · '.join(pics[:8])}〕" if pics else '') + (f"  〔빈 이미지 칸 {self.empty_image_slots}개〕" if self.empty_image_slots else '')
        return s if len(s) <= limit else s[:limit - 1] + '…'


@dataclass
class Proposal:
    id: str
    title: str
    customer: str
    meta: dict
    sheets: List[Sheet]
    app_profile: Optional[dict] = None
    app_applicable: Optional[dict] = None
    app_rules: Optional[dict] = None
    variant: str = ''               # 교란 실험 이름 (원본은 '')

    @property
    def n(self) -> int:
        return len(self.sheets)

    @property
    def req_list(self) -> List[str]:
        return [norm(x).strip('“”"') for x in (self.meta.get('signals') or []) + (self.meta.get('criteria') or [])]

    def sheet(self, n: int) -> Optional[Sheet]:
        return self.sheets[n - 1] if 1 <= n <= len(self.sheets) else None

    def all_text(self) -> str:
        return '\n\n'.join(s.text for s in self.sheets)


def _sheet(d: dict) -> Sheet:
    return Sheet(n=d['n'], f=d['f'], layout_name=d.get('layout_name', ''), part=d.get('part'), part_label=d.get('part_label', ''),
                 stage_key=d.get('stage_key', ''), stage_name=d.get('stage_name', ''), role=d.get('role', ''), texts=d.get('texts', []),
                 images=d.get('images', []), fixed_texts=d.get('fixed_texts', []), overlaps=d.get('overlaps', []), free_pictures=d.get('free_pictures', 0),
                 bg=bool(d.get('bg')), photo_first=bool(d.get('photo_first')), layout_when=d.get('layout_when', ''))


def from_scenario(d: dict, variant: str = '') -> Proposal:
    keys = ['req', 'req_label', 'ind', 'ind_name', 'strategy', 'strategy_label', 'strategy_desc', 'ending', 'ending_label', 'minutes', 'std',
            'situation', 'signals', 'audience', 'criteria', 'thesis', 'logic', 'diff', 'tone', 'messages', 'stages', 'short']
    return Proposal(id=d['id'], title=d['title'], customer=d.get('customer', ''), meta={k: d.get(k) for k in keys},
                    sheets=[_sheet(s) for s in d['sheets'] if not s.get('missing')], app_profile=d.get('app_profile'),
                    app_applicable=d.get('app_applicable'), app_rules=d.get('app_rules'), variant=variant)


def load_best(path: Path = config.BEST_PATH) -> List[Proposal]:
    d = json.loads(path.read_text(encoding='utf-8'))
    return [from_scenario(s) for s in d['scenarios']]


def load_catalog(path: Path = config.CATALOG_PATH) -> dict:
    if not path.exists():
        return {'products': [], 'solutions': [], 'cases': [], 'industries': []}
    d = json.loads(path.read_text(encoding='utf-8'))
    return {k: d.get(k, []) for k in ('products', 'solutions', 'cases', 'industries')}
