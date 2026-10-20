"""③ 레퍼런스 — Best Scenario 검색 · 다양성 선택 · 패턴 카드(골격 · 다른 점 · 쓰지 말 표현)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .brief import Brief, brief_text
from .kb import EXTRA_IND_KW, GENERIC, KB, STAGE_LABEL, STRATEGY_LABELS
from .situation import Situation
from .text import TfIdf, norm


@dataclass
class Ref:
    sid: str
    score: float
    parts: dict
    scenario: dict
    similar: list = field(default_factory=list)
    differs: list = field(default_factory=list)
    avoid: list = field(default_factory=list)


def _jac(a, b) -> float:
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a | b else 0.0


PARTICLE_RE = re.compile(r"(?:의|은|는|이|가|을|를|과|와|에서|에게|에|로|으로|도|만|까지|부터|처럼|께|님)$")
CUST_RE = re.compile(r"(?<![A-Za-z0-9/&+.\-])([A-Z]) ([가-힣]{1,6})")


def _hit(w: str, text: str) -> bool:
    """짧은 말(2글자 이하)은 낱말 첫머리에서만 — '마트' 가 '스마트' 안에서 잡히지 않게."""
    if len(w) > 2 or not re.fullmatch(r"[가-힣]+", w):
        return w in text
    return re.search(r"(?<![가-힣])" + re.escape(w), text) is not None


def foreign_terms(text: str, own_text: str, kbx: KB, limit: int = 14, own_ind: str | None = None) -> list[str]:
    """text 에 있고 own_text(이 고객 입력 · 선택)에는 없는 업종 · 공간 · 제품 · 솔루션 · 고객 이름.
    어느 업종에서나 쓰는 말(GENERIC)과 이 고객 업종의 일상어는 뺀다."""
    own = norm(own_text)
    out: list[str] = []
    mine = set(kbx.ind_kw.get(own_ind or "", [])) | set(EXTRA_IND_KW.get(own_ind or "", []))
    cands = [w for w in kbx.domain_lexicon if w not in GENERIC and w not in mine]
    for names in kbx.product_names.values():
        cands += names
    for names in kbx.solution_names.values():
        cands += names
    for w in cands:
        mine_too = _hit(w, own_text) if len(w) <= 2 else norm(w) in own
        if _hit(w, text) and not mine_too and w not in out and not any(w in o for o in out):
            out.append(w)
    # 그 시나리오의 고객 예시 이름(A 커피 · J 금융 …) — 조사를 떼고 견준다. 'A/S 체계' 같은 말은 이름이 아니다.
    for m in CUST_RE.finditer(text):
        word = m.group(2)
        stem = PARTICLE_RE.sub("", word) or word
        name = f"{m.group(1)} {stem}"
        if norm(name) in own or norm(m.group(1) + " " + word) in own:
            continue
        if name not in out:
            out.append(name)
    return out[:limit]


def retrieve(b: Brief, sit: Situation, kbx: KB, k: int = 3, use_strategy: bool = True) -> list[Ref]:
    q = brief_text(b, kbx)
    scen = kbx.scenarios
    tf = TfIdf([kbx.scenario_text(s) for s in scen])
    sims = tf.sims(q)
    cand_strats = [s for s, _ in sit.strategies]
    rows = []
    for s, sim in zip(scen, sims):
        sc = 3.0 * sim
        why, diff = [], []
        if s["req"] == sit.reqtype:
            sc += 2.0
            why.append(f"요구 유형 같음({kbx.REQ_TYPES[s['req']]['label']})")
        else:
            diff.append(f"요구 유형 다름(이 사례: {kbx.REQ_TYPES[s['req']]['label']} · 이 고객: {kbx.REQ_TYPES.get(sit.reqtype, {}).get('label', sit.reqtype)})")
        if not use_strategy:
            pass
        elif s["strategy"] == sit.strategy:
            sc += 1.5
            why.append(f"전략 같음({STRATEGY_LABELS[s['strategy']]})")
        elif s["strategy"] in cand_strats and use_strategy:
            sc += 0.8
            why.append(f"전략 후보 중 하나({STRATEGY_LABELS[s['strategy']]})")
        if s.get("ind") and s.get("ind") == b.ind:
            sc += 1.0
            why.append("업종 같음")
        elif s.get("ind"):
            ind_name = kbx.industries.get(s["ind"], {}).get("name", s["ind"])
            mine = kbx.industries.get(b.ind or "", {}).get("name", "미정")
            diff.append(f"업종 다름(이 사례: {ind_name} · 이 고객: {mine})")
        jp = _jac(s.get("products", []), b.products)
        js = _jac(s.get("solutions", []), b.solutions)
        sc += 1.5 * jp + 1.0 * js
        shared = [kbx.P[p]["model"] for p in s.get("products", []) if p in b.products] + [kbx.S[x]["name"] for x in s.get("solutions", []) if x in b.solutions]
        if shared:
            why.append("선택 겹침: " + ", ".join(shared))
        other = [kbx.P[p]["model"] for p in s.get("products", []) if p not in b.products and p in kbx.P]
        if other:
            diff.append("이 사례의 제품 " + ", ".join(other[:4]) + " 는 선택에 없음")
        if s.get("std"):
            if sit.level == "minimal":
                sc += 1.0
                why.append("맥락이 거의 없을 때 쓰는 표준 양식")
            else:
                sc -= 1.0
        rows.append((sc, s, why, diff, sim))
    rows.sort(key=lambda r: -r[0])
    picked: list = []
    pool = rows[:]
    while pool and len(picked) < k:
        best, bi = None, -1
        for i, r in enumerate(pool):
            pen = 0.0
            for p in picked:
                if p[1]["strategy"] == r[1]["strategy"]:
                    pen = max(pen, 0.9)
                if p[1]["req"] == r[1]["req"]:
                    pen = max(pen, 0.5)
            v = r[0] - pen
            if best is None or v > best:
                best, bi = v, i
        picked.append(pool.pop(bi))
    own = brief_text(b, kbx, with_selection=True)
    out = []
    for sc, s, why, diff, sim in picked:
        out.append(Ref(s["id"], round(sc, 2), {"n": len(s["parts"])}, s, why, diff,
                       foreign_terms("\n".join(kbx.scenario_units(s) + [s.get("title", ""), s.get("situation", "")]), own, kbx, own_ind=b.ind)))
    return out


def pattern_card(i: int, r: Ref, kbx: KB) -> str:
    s = r.scenario
    flow = " → ".join(f"{STAGE_LABEL.get(p['stage'], p['stage'])}({p['type']})" for p in s["parts"])
    goals = " · ".join(f"{STAGE_LABEL.get(p['stage'], p['stage'])}: {p['goal']}" for p in s["parts"] if p.get("goal"))
    lines = [
        f"[REF{i}] {s['id']} · {kbx.REQ_TYPES[s['req']]['label']} · {STRATEGY_LABELS[s['strategy']]} · 결말: {kbx.ENDINGS.get(s['ending'], s['ending'])}",
        f"골격: {flow}",
        f"단계 목적: {goals}",
        f"논증 방식: {s.get('thesis', '')}",
        f"비슷한 점: {', '.join(r.similar) or '-'}",
        f"다른 점: {', '.join(r.differs) or '-'}",
        f"쓰지 말 것(그 사례에만 있는 표현): {', '.join(r.avoid) or '-'}",
    ]
    return "\n".join(lines)


def raw_reference(i: int, r: Ref) -> str:
    """비교용(레퍼런스를 그대로 주는 조건) — 단계 이름 · 장표 역할 원문."""
    s = r.scenario
    lines = [f"[참고 {i}] {s['title']} — {s.get('thesis', '')}"]
    for p in s["parts"]:
        lines.append(f"- {p['name']} ({p['type']}): " + " / ".join(p["items"]))
    return "\n".join(lines)
