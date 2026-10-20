"""TC 평가 지표 — 각 지표는 0~1, TC 점수는 가중 평균.

맥락 판단      level(맥락 3분기) · industry · scenario(L1 표준 id / L2 Best id / L3 전략) · scenario_top3(L2)
storyboard     must_parts(필수 파트) · flow(파트 흐름) · priority(필수 요구 파트가 상위 절반인가, L3)
layout 설계    layout_part(장표 유형 = 파트 유형) · layouts_any(기대 장표 포함) · violations(타 업종 · 미연결 솔루션 장표 0)
요구 반영      key_detect(핵심 요구 추출) · key_trace(그 요구가 맞는 파트 · 슬라이드에 연결) · key_reflect(덱 글자에 반영) · must_cov(필수 요구 커버) · facts(원문 수치 사용)
값 입력        fill_clean(샘플 고객명 · 타 업종 표현이 없는 슬라이드 비율 — 파이프라인 자체 검사 결과를 그대로 쓴다)
               stray(독립 검사: 최종 화면 글자 — 채운 칸 + 남은 샘플 칸 + data-tb 밖 문구 — 에 고객이 고르지 않은 제품 모델 · 솔루션이 없는 슬라이드 비율, 사례 장표 제외)
               fill_cov(채운 칸 비율, 참고 지표)
※ key_reflect · facts 는 슬라이드 글자만 본다(storyboard 이름 · items · 푸터 · 아이브로 같은 맥락 칸은 제외) — v14 부터.
복잡(L3)       dims(기준 분해 재현) · conflicts(충돌 발견) · questions(질문 수) · eval(평가 구조 인식)
"""
from __future__ import annotations

import math
import os
import re

LEGACY = os.environ.get("WINMATE_METRICS") == "legacy"  # v13 까지의 정의(덱 글자 = storyboard + 슬라이드 전부, 독립 검사 없음) — 비교용

WEIGHTS = {
    "level": 2.0, "industry": 1.0, "scenario": 2.0, "scenario_top3": 1.0, "must_parts": 1.5, "flow": 0.5, "priority": 1.0,
    "layout_part": 1.0, "layouts_any": 1.0, "violations": 1.0, "key_detect": 1.0, "key_trace": 1.5, "key_reflect": 1.5,
    "must_cov": 1.0, "facts": 1.0, "fill_clean": 1.0, "stray": 1.0, "dims": 1.0, "conflicts": 0.5, "questions": 0.5, "eval": 0.5,
}
# 같은 일을 하는 사진 버전(앱 pv 에 없는 짝) — 키맨별 요구(RM-A) ↔ 키맨별 요구 · 인물 사진(PH-RQ-C)
EQUIV = {"L_RM_A": ["L_PH_RQ_C", "L_PH_US_A"], "L_VP_D": ["L_PH_VP_D"], "L_BM_A": ["L_PH_BM_A"]}
MODEL_RX = re.compile(r"\b[A-Z]{2}\d{2}[A-Z]{1,2}(?:-[A-Z])?\b")


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s or "").lower()


def deck_text(state: dict, fills: list[dict]) -> str:
    bits = []
    for p in state["parts"]:
        bits.append(p["name"])
        bits.extend(p["items"])
    for f in fills:
        bits.extend(f["texts"].values())
    return "\n".join(bits)


def slide_text(fills: list[dict]) -> str:
    """슬라이드에 실제로 채운 글자 — 맥락 칸(푸터 · 아이브로 · 표지 프로젝트명)은 뺀다."""
    return "\n".join(v for f in fills for k, v in f["texts"].items() if f.get("sources", {}).get(k) != "context")


def stray_terms(kb, state: dict, fill: dict) -> list[str]:
    """최종 화면 글자에서 고객이 고르지 않은 제품 모델 · 솔루션 이름 — 파이프라인 검사와 따로 구현한 독립 검사."""
    card = kb.cards[fill["f"]]
    texts = {str(t["i"]): t["s"] for t in card["slots"]["texts"] if t["role"] != "fixed"}
    texts.update(fill["texts"])
    ctx = state["ctx"]
    own = (card.get("sol") and card["sol"] in ctx["solutions"]) or (card.get("ind") and card["ind"] == ctx["industry"])
    final = " ".join(texts.values()) + ("" if own else " " + " ".join(card.get("static_text", [])))  # 고른 솔루션 · 업종 전용 장표의 고정 문구는 정상
    ok = {kb.P[p]["model"] for p in ctx["products"]}
    # 고른 제품 · 솔루션의 이름 · 사양 문구는 먼저 지운다(예: 'SmartThings Pro' 안의 'SmartThings', 사양 속 'Knox Capture')
    for p in ctx["products"]:
        for x in (kb.P[p]["spec"], kb.P[p]["name"], kb.P[p]["model"]):
            final = final.replace(x, " ")
    for sid in ctx["solutions"]:
        for x in (kb.S[sid]["name"], kb.S[sid].get("desc", "")):
            if x:
                final = final.replace(x, " ")
    found = set(MODEL_RX.findall(final)) | {p["model"] for p in kb.products if len(p["model"]) >= 5 and p["model"] in final}
    stray = [m for m in found if not any(m in o or o in m for o in ok)]
    stray += [s["name"] for s in kb.solutions if len(s["name"]) >= 6 and s["name"] in final and s["id"] not in ctx["solutions"]]
    return stray


def score_case(tc: dict, state: dict, fills: list[dict], interrupt_payload: dict | None = None, kb=None) -> dict:
    g = tc["gold"]
    a = state["analysis"]
    m: dict[str, float | None] = {}
    detail: dict = {}
    m["level"] = float(a["context_level"] == g["level"])
    m["industry"] = float(a["industry"] == g["industry"])
    sm = state.get("scenario_match") or {}
    if g["level"] == "complex":
        strat = (state.get("choice") or {}).get("strategy")
        m["scenario"] = float(strat in g.get("strategy_any", [])) if g.get("strategy_any") else None
        detail["strategy"] = strat
    else:
        m["scenario"] = float(sm.get("chosen") in g.get("scenario_any", []))
        detail["scenario"] = sm.get("chosen")
    if g.get("scenario_top3") and sm.get("kind") == "best":
        top3 = [c["id"] for c in sm["candidates"][:3]]
        m["scenario_top3"] = float(all(x in top3 for x in g["scenario_top3"]))
        detail["top3"] = top3
    else:
        m["scenario_top3"] = None
    slide_parts = {s["part_id"] for s in state["slides"]}
    types = {p["type"] for p in state["parts"] if p["id"] in slide_parts}
    mp = g.get("must_parts", [])
    m["must_parts"] = sum(1 for t in mp if t in types) / len(mp) if mp else None
    detail["missing_parts"] = [t for t in mp if t not in types]
    rv = state["review"]
    m["flow"] = rv["flow_score"]
    m["layout_part"] = 1 - len(rv["part_mismatch"]) / max(1, rv["n_slides"])
    la = g.get("layouts_any") or {}
    used = {s["f"] for s in state["slides"]}
    if kb is not None:  # 앱이 텍스트 장을 사진 버전으로 대체 — 같은 맥락의 사진 버전(pv · retired)도 기대 장표로 본다
        for f in list(used):
            used |= set(kb.cards.get(f, {}).get("pv") or [])
        used |= {f for f, c in kb.cards.items() if c.get("retired") in used}
        used |= {a for a, bs in EQUIV.items() if used & set(bs)}
    if la:
        hits = {t: any(f in used for f in fs) for t, fs in la.items()}
        m["layouts_any"] = sum(hits.values()) / len(hits)
        detail["layouts_any_miss"] = [t for t, h in hits.items() if not h]
    else:
        m["layouts_any"] = None
    m["violations"] = float(not rv["industry_violations"] and not rv["solution_violations"] and not rv["duplicates"])
    # --- 요구 반영
    reqs = a["requirements"]
    links = state["links"]["links"]
    parts = state["parts"]
    dtext = _norm(deck_text(state, fills) if LEGACY else slide_text(fills))
    kr = g.get("key_reqs") or []
    det, tr, rf = [], [], []
    for k in kr:
        kws = [_norm(x) for x in k["kw"]]
        cand = [r for r in reqs if all(w in _norm(r["text"]) for w in kws)]
        det.append(bool(cand))
        ok_trace = False
        for r in cand:
            for i in links.get(r["id"], []):
                if i < len(parts) and parts[i]["id"] in slide_parts and parts[i]["type"] in k["parts_any"]:
                    ok_trace = True
        tr.append(ok_trace)
        rf.append(all(w in dtext for w in kws))
    m["key_detect"] = sum(det) / len(det) if kr else None
    m["key_trace"] = sum(tr) / len(tr) if kr else None
    m["key_reflect"] = sum(rf) / len(rf) if kr else None
    detail["key_reqs"] = [{"kw": k["kw"], "detect": d, "trace": t, "reflect": r} for k, d, t, r in zip(kr, det, tr, rf)]
    musts = [r for r in reqs if r["priority"] == "must"]
    m["must_cov"] = 1 - len(rv["must_uncovered"]) / len(musts) if musts else None
    facts = g.get("facts") or []
    if facts:
        hit = [f for f in facts if _norm(f) in dtext]
        m["facts"] = len(hit) / len(facts)
        detail["facts_miss"] = [f for f in facts if f not in hit]
    else:
        m["facts"] = None
    # --- 우선순위: 필수 요구가 연결된 파트가 상위 절반 안에 있는가
    if g["level"] == "complex" and musts:
        n = len(parts)
        half = math.ceil(n / 2)
        ok = []
        for r in musts:
            rk = [parts[i]["priority_rank"] for i in links.get(r["id"], []) if i < n]
            ok.append(bool(rk) and min(rk) <= half)
        m["priority"] = sum(ok) / len(ok)
    else:
        m["priority"] = None
    # --- 채우기
    fq = rv["fill"]
    clean = [not f["checks"]["sample_leak"] and not f["checks"]["foreign_terms"] for f in fills]
    m["fill_clean"] = sum(clean) / len(clean) if clean else None
    if kb is not None and not LEGACY:
        ptype = {p["id"]: p["type"] for p in state["parts"]}
        st = {f["code"]: stray_terms(kb, state, f) for f in fills if ptype.get(f["part_id"]) != "case"}
        m["stray"] = sum(1 for v in st.values() if not v) / len(st) if st else None
        detail["stray"] = {k: v for k, v in st.items() if v}
    else:
        m["stray"] = None
    detail["fill"] = fq
    detail["fill_cov"] = round(fq.get("changed", 0) / max(1, fq.get("slots", 1)), 3)
    # --- L3
    d = state.get("decomposition")
    if g["level"] == "complex" and d:
        dims = {x["dimension"] for x in d["groups"]}
        da = g.get("dims_any") or []
        m["dims"] = sum(1 for x in da if x in dims) / len(da) if da else None
        ca = g.get("conflicts_any") or []
        kinds = {c["kind"] for c in d["conflicts"]}
        m["conflicts"] = sum(1 for x in ca if x in kinds) / len(ca) if ca else None
        m["questions"] = float(len(d["questions"]) >= g.get("min_questions", 3))
        m["eval"] = float(bool(d["eval"])) if g.get("eval_expected") else None
        detail["dims"] = sorted(dims)
        detail["conflicts"] = sorted(kinds)
        detail["n_questions"] = len(d["questions"])
        detail["interrupted"] = bool(interrupt_payload)
    else:
        for k in ("dims", "conflicts", "questions", "eval"):
            m[k] = None
    num = sum(WEIGHTS[k] * v for k, v in m.items() if v is not None)
    den = sum(WEIGHTS[k] for k, v in m.items() if v is not None)
    return {"id": tc["id"], "case": tc["case"], "level": g["level"], "industry": tc["industry"], "score": round(num / den, 4), "metrics": m, "detail": detail,
            "n_slides": rv["n_slides"], "n_req": len(reqs)}
