"""LLM 에 넘기는 압축 맥락 — 덱 브리프 · 시트 요약표 · 증거 묶음."""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Set

from .checks import FIG
from .proposal import Proposal, Sheet, norm


def fence(s: str) -> str:
    """프롬프트 인젝션 방지 — 제안서에서 온 글은 자료 블록으로 감싼다(앱 ai.js 와 같은 표시)."""
    return f'<<<DATA\n{s}\nDATA>>>'


def deck_brief(p: Proposal) -> str:
    m = p.meta
    aud = m.get('audience') or {}
    lines = [
        f"제안서: {p.title} ({p.n}장{' · 발표 ' + str(m['minutes']) + '분' if m.get('minutes') else ''})",
        f"고객: {p.customer} · 업종: {m.get('ind_name') or '미정'} · 요구 유형: {m.get('req_label')} · 전략: {m.get('strategy_label')} — {m.get('strategy_desc', '')}",
        f"이 제안이 받아 내려는 결정: {m.get('ending_label')}",
        f"최종 결정권자: {aud.get('lead', '미정')}" + (f" · 함께 보는 사람: {', '.join(aud.get('others', []))}" if aud.get('others') else ''),
        f"상황: {norm(m.get('situation', ''))[:420]}",
        f"핵심 주장(thesis): {norm(m.get('thesis', ''))[:240]}",
    ]
    return '\n'.join(lines)


def requirements_block(p: Proposal) -> str:
    m = p.meta
    sig = [norm(x) for x in (m.get('signals') or [])]
    cri = [norm(x) for x in (m.get('criteria') or [])]
    out = []
    if sig:
        out.append('고객이 한 말(요구):\n' + '\n'.join(f'  R{i + 1}. {s}' for i, s in enumerate(sig)))
    if cri:
        out.append('고객이 제안을 고르는 기준:\n' + '\n'.join(f'  K{i + 1}. {s}' for i, s in enumerate(cri)))
    return '\n'.join(out) or '(연결된 고객 요구사항 없음)'


def digest_line(s: Sheet) -> str:
    figs = len(FIG.findall(s.text))
    return f"[{s.n}] {s.stage_name} · {s.part_label or s.part or '-'} · “{s.title}” · {s.words}어절 · 사진 {s.pictures}" + (f" · 빈 이미지 칸 {s.empty_image_slots}" if s.empty_image_slots else '') + (f" · 수치 {figs}" if figs else '')


def digest(p: Proposal) -> str:
    return '\n'.join(digest_line(s) for s in p.sheets)


def geometry_line(s: Sheet) -> str:
    body = [t for t in s.body_texts if len(t['text']) > 8]
    mn = min((t.get('min_px') or t.get('px') for t in body), default=0)
    tb = s.title_box
    ov = sum(1 for t in s.texts if t.get('overflow'))
    out = sum(1 for t in s.texts if t.get('outside'))
    return (f"[{s.n}] 제목 {tb.get('max_px', tb.get('px', 0)):g}px@({tb['x']:.0f},{tb['y']:.0f})" if tb else f"[{s.n}] 제목 없음") + \
        f" · 본문 최소 {mn:g}px({mn * 0.75:.1f}pt) · {s.words}어절 · 텍스트 칸 {len(s.body_texts)} · 사진 {s.pictures} · 빈 이미지 칸 {s.empty_image_slots}" + \
        (f" · 넘침 {ov}" if ov else '') + (f" · 장표 밖 {out}" if out else '') + (f" · 겹침 {len(s.overlaps)}" if s.overlaps else '')


def select_sheets(p: Proposal, scopes: Iterable[str]) -> List[Sheet]:
    scopes = set(scopes)
    if 'all' in scopes:
        return list(p.sheets)
    picked: List[Sheet] = []
    for s in p.sheets:
        if s.part in scopes or ('numbers' in scopes and len(FIG.findall(s.text)) >= 3):
            picked.append(s)
    if ('cover' in scopes or 'closing' in scopes) and p.sheets:
        for s in (p.sheets[0], p.sheets[-1]):
            if s not in picked:
                picked.append(s)
    return sorted(picked, key=lambda s: s.n)


def evidence_block(p: Proposal, scopes: Iterable[str], budget: int = 16000) -> str:
    scopes = set(scopes)
    parts: List[str] = []
    if scopes & {'geometry'}:
        parts.append('■ 장별 배치 측정값(1280×720 장, pt = px × 0.75)\n' + '\n'.join(geometry_line(s) for s in p.sheets))
    if scopes & {'titles'}:
        parts.append('■ 장별 제목\n' + '\n'.join(f'[{s.n}] {s.title}' for s in p.sheets))
    if scopes & {'footers'}:
        parts.append('■ 장별 푸터 문구\n' + '\n'.join(f"[{s.n}] " + ' · '.join(norm(t['text']) for t in s.texts if t.get('text') and t.get('y', 0) >= 660)[:120] for s in p.sheets))
    if scopes & {'images'}:
        parts.append('■ 장별 이미지\n' + '\n'.join(f"[{s.n}] 사진 {s.pictures} · 빈 칸 {s.empty_image_slots} · " + ' · '.join(i.get('name', '') for i in s.images if i.get('filled') and i.get('name'))[:160] for s in p.sheets))
    text_scopes = scopes - {'geometry', 'titles', 'footers', 'images', 'digest'}
    if text_scopes:
        sheets = select_sheets(p, text_scopes)
        per = max(500, min(1800, budget // max(1, len(sheets))))
        body = '\n'.join(f"[{s.n}] ({s.stage_name} · {s.part_label or '-'} · 레이아웃 “{s.layout_name}”) {s.compact(per)}" for s in sheets)
        parts.append('■ 장 본문 (칸 순서대로 | 로 구분)\n' + body)
    return '\n\n'.join(parts)
