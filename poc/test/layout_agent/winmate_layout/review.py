"""덱 검토 — 요구 반영(추적성) · 흐름 · 업종/솔루션 일관성 · 중복 · 채우기 품질.

필수 요구가 어느 슬라이드에도 닿지 않으면 한 번 보강(revise)한다: 그 요구의 기준(dimension)에 맞는 대응 파트를 추가.
"""
from __future__ import annotations

import re
from collections import defaultdict

from .decompose import DIM_ANSWER
from .kb import KB


def review_deck(kb: KB, parts: list[dict], slides: list[dict], fills: list[dict], analysis: dict, ctx: dict, links: dict) -> dict:
    reqs = {r["id"]: r for r in analysis["requirements"]}
    part_has_slide = {s["part_id"] for s in slides}
    pid2idx = {p["id"]: i for i, p in enumerate(parts)}
    covered, uncovered, checklist = [], [], []
    for rid, r in reqs.items():
        idxs = links.get("links", {}).get(rid, [])
        ok = any(parts[i]["id"] in part_has_slide for i in idxs if i < len(parts))
        if r.get("procedural"):
            checklist.append({"id": rid, "text": r["text"], "in_deck": ok})  # 제출 절차 — 반영률 분모에서 뺀다
            continue
        (covered if ok else uncovered).append(rid)
    must_unc = [rid for rid in uncovered if reqs[rid]["priority"] == "must"]
    spec_mm = spec_mismatches(kb, analysis, ctx)
    # 흐름: 이웃 파트가 NEXT/RELATED 로 이어지는 비율
    seq = [p["type"] for p in parts if p["id"] in part_has_slide]
    pairs = list(zip(seq, seq[1:]))
    good = sum(1 for a, b in pairs if a == b or b in kb.NEXT.get(a, []) or b in kb.RELATED.get(a, []) or a in kb.RELATED.get(b, []) or a in ("cover", "overview", "requirements") or b in ("closing", "appendix", "case", "why"))
    flow = round(good / max(1, len(pairs)), 3)
    ind = ctx["industry"]
    ind_viol = [s["f"] for s in slides if kb.L[s["f"]]["ind"] and kb.L[s["f"]]["ind"] != ind]
    sol_viol = [s["f"] for s in slides if kb.L[s["f"]]["sol"] and kb.L[s["f"]]["sol"] not in ctx["solutions"]]
    dup = [f for f, n in _count([s["f"] for s in slides if not s.get("pg")]).items() if n > 1]  # 대응표 이어지는 쪽(pg)은 의도한 반복
    part_mis = [s["f"] for s in slides if kb.L[s["f"]]["p"] != s["part_type"] and kb.L[s["f"]]["p2"] != s["part_type"]]
    fq = defaultdict(int)
    for f in fills:
        c = f["checks"]
        fq["slots"] += c["n_slots"]
        fq["changed"] += c["changed"]
        fq["placeholders_left"] += c["placeholders_left"]
        fq["unsupported_reverted"] += len(c["unsupported_numbers"])
        fq["sample_leak"] += len(c["sample_leak"])
        fq["foreign_terms"] += len(c["foreign_terms"])
        fq["static_foreign_slides"] += 1 if c.get("static_foreign") else 0
    issues = []
    if ctx.get("missing_items"):
        issues.append({"sev": "high", "msg": f"요청 품목 중 카탈로그에 없는 것: {', '.join(ctx['missing_items'])} — 제품 자리는 [제품]으로 두었음. 참여 여부(파트너 · 공급 방식)부터 판단 필요"})
    items = analysis.get("requested_items") or []
    want = {p for it in items for p in it["products"]}
    if want and ctx["products"] and not (set(ctx["products"]) & want):
        names = ", ".join(kb.P[p]["model"] for p in ctx["products"])
        issues.append({"sev": "high", "msg": f"요청 품목({', '.join(it['label'] for it in items)})과 제안 제품({names})의 종류가 다름 — 제품 선택 확인 필요"})
    if must_unc:
        issues.append({"sev": "high", "msg": f"필수 요구 {len(must_unc)}개가 어느 슬라이드에도 닿지 않음: {', '.join(must_unc[:6])}"})
    if ind_viol:
        issues.append({"sev": "high", "msg": f"다른 업종 전용 장표: {ind_viol}"})
    if sol_viol:
        issues.append({"sev": "high", "msg": f"연결 안 된 솔루션 장표: {sol_viol}"})
    if dup:
        issues.append({"sev": "mid", "msg": f"같은 장표 중복: {dup}"})
    if part_mis:
        issues.append({"sev": "low", "msg": f"파트 유형과 다른 장표(연관 장표로 대체): {part_mis[:5]}"})
    if fq["sample_leak"]:
        issues.append({"sev": "mid", "msg": f"샘플 고객명 남음 {fq['sample_leak']}칸"})
    if fq["static_foreign_slides"]:
        issues.append({"sev": "low", "msg": f"편집할 수 없는(data-tb 없는) 다른 업종 샘플 문구가 남은 장표 {fq['static_foreign_slides']}장 — 원본 레이아웃 보완 필요"})
    if fq["foreign_terms"]:
        issues.append({"sev": "low", "msg": f"다른 업종 표현 {fq['foreign_terms']}칸 — 사람 확인 필요"})
    for m in spec_mm:
        issues.append({"sev": "high", "msg": m})
    if checklist:
        out_deck = [c["id"] for c in checklist if not c["in_deck"]]
        issues.append({"sev": "low", "msg": f"입찰 절차 · 제출 조건 {len(checklist)}개는 제출 체크리스트로 따로 확인" + (f"(덱에 없음: {', '.join(out_deck[:6])})" if out_deck else "(요구 대응표에 수록)")})
    n_req = len(reqs) - len(checklist)
    return {
        "req_total": n_req, "req_covered": len(covered), "req_coverage": round(len(covered) / max(1, n_req), 3),
        "must_uncovered": must_unc, "uncovered": uncovered, "checklist": checklist, "spec_mismatch": spec_mm, "flow_score": flow, "n_slides": len(slides),
        "industry_violations": ind_viol, "solution_violations": sol_viol, "duplicates": dup, "part_mismatch": part_mis,
        "fill": dict(fq), "issues": issues,
    }


SIZE_REQ_RE = re.compile(r"(\d{2,3})\s*(?:인치|형\b|\"|”|″)")
SIZE_SPEC_RE = re.compile(r"(\d{2,3})\s*(?:\"|”|″|인치)")


def spec_mismatches(kb: KB, analysis: dict, ctx: dict) -> list[str]:
    """요구 크기(27인치 등)와 제안 제품 크기가 하나도 맞지 않으면 알린다 — 규격 미달은 입찰 탈락 사유."""
    need = {int(m.group(1)) for r in analysis["requirements"] if not r.get("procedural") for m in SIZE_REQ_RE.finditer(r["text"])}
    need = {n for n in need if 10 <= n <= 300}
    if not need:
        return []
    have = {}
    for p in ctx["products"]:
        m = SIZE_SPEC_RE.search(kb.P[p]["spec"]) or SIZE_SPEC_RE.search(kb.P[p]["name"])
        if m:
            have[p] = int(m.group(1))
    if not have or set(have.values()) & need:
        return []
    got = ", ".join(f'{kb.P[p]["model"]} {s}"' for p, s in have.items())
    want = ", ".join(f"{n}인치" for n in sorted(need))
    return [f"요구 크기({want})와 제안 제품 크기({got})가 맞지 않음 — 카탈로그에 맞는 모델이 없으면 대안 사양으로 명시하거나 모델을 확인해야 함"]


def revision_parts(kb: KB, analysis: dict, uncovered: list[str]) -> list[dict]:
    reqs = {r["id"]: r for r in analysis["requirements"]}
    by = defaultdict(list)
    for rid in uncovered:
        by[reqs[rid]["dimension"]].append(rid)
    out = []
    for dim, rids in by.items():
        ans = DIM_ANSWER.get(dim, {"part": reqs[rids[0]]["parts"][0], "layouts": [], "stage": "plan"})
        out.append({"type": ans["part"], "name": f"{dim} 대응(보강)", "items": [reqs[r]["text"][:46] for r in rids[:3]], "stage": ans["stage"],
                    "goal": f"검토에서 빠진 필수 요구 {len(rids)}개", "seed_layouts": [{"f": ans["layouts"][0], "role": f"{dim} 요구 대응"}] if ans["layouts"] else [],
                    "core": True, "source": "review", "req_ids": rids})
    return out


def _count(xs):
    d = defaultdict(int)
    for x in xs:
        d[x] += 1
    return d
