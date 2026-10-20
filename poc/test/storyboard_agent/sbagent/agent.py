"""Storyboard 설계 에이전트 — ①~⑥ 을 잇는다.

    from sbagent.agent import design
    out = design(proposal, backend=make_backend('gemini'), options={'mode': 'continue'})
"""
from __future__ import annotations

import time

from .brief import build_brief
from .kb import KB, kb
from .llm import Backend, BackendError, OfflineBackend
from .planner import build_prompt, build_repair_prompt, rules_plan, schema
from .references import retrieve
from .situation import judge, reference_votes
from .validate import check, fix, resolve

VARIANT_DEFAULT = {"refs": "cards", "repair": True}


def design(pr: dict, backend: Backend | None = None, options: dict | None = None, kbx: KB | None = None) -> dict:
    kbx = kbx or kb()
    backend = backend or OfflineBackend()
    opt = {"mode": "continue", "strategy": None, "temperature": 0.4, "seed": 0, "mask_labels": True, "use_note": True, **(options or {})}
    t0 = time.time()
    b = build_brief(pr, kbx, mask_labels=opt["mask_labels"], use_note=opt["use_note"])
    sit0 = judge(b, kbx, forced_strategy=opt["strategy"])
    votes = reference_votes(retrieve(b, sit0, kbx, k=3, use_strategy=False))
    sit = judge(b, kbx, forced_strategy=opt["strategy"], ref_votes=votes)
    refs = retrieve(b, sit, kbx, k=3)
    trace = {"situation": {"reqtype": sit.reqtype, "level": sit.level, "strategies": sit.strategies, "ending": sit.ending, "budget": sit.budget,
                           "ref_votes": votes},
             "references": [{"id": r.sid, "score": r.score, "similar": r.similar, "differs": r.differs, "avoid": r.avoid} for r in refs],
             "steps": []}
    draft, used_llm, err = None, False, ""
    if backend.online:
        system, user = build_prompt(b, sit, refs, kbx, forced=opt["strategy"])
        try:
            draft = backend.complete("design", system, user, schema=schema(kbx, sit.budget[1] + 2), temperature=opt["temperature"], seed=opt["seed"])
            used_llm = True
            trace["steps"].append("설계: LLM")
        except BackendError as e:
            err = str(e)
            trace["steps"].append("설계: LLM 실패 → 규칙 설계 (" + err[:120] + ")")
    if draft is None:
        draft = rules_plan(b, sit, refs, kbx)
        trace["steps"].append("설계: 규칙")
    if used_llm and draft.get("strategy") not in [s for s, _ in sit.strategies] and not opt["strategy"]:
        trace["steps"].append(f"전략 {draft.get('strategy')} 는 후보 밖 → {sit.strategy}")
        draft["strategy"] = sit.strategy
    if opt["strategy"]:
        draft["strategy"] = opt["strategy"]
    parts, issues0 = resolve(draft, b, kbx)
    issues = issues0 + check(parts, b, sit, refs, kbx)
    first_issues = list(issues)
    if used_llm and opt.get("repair", True) and [i for i in issues if i["code"] in ("uncovered", "stray", "number", "leak", "flow", "budget", "dup")]:
        view = {**draft, "parts": [({"keep": f"P{p['_pi'] + 1}", "type": p.get("type"), "name": p.get("name")} if p.get("origin") == "kept" else
                                   {"keep": "", **{k: p.get(k) for k in ("type", "name", "goal", "items", "answers", "ref", "adapted")}}) for p in parts]}
        system, user = build_repair_prompt(b, sit, kbx, view, issues)
        try:
            fixed = backend.complete("repair", system, user, schema=schema(kbx, sit.budget[1] + 2), temperature=opt["temperature"], seed=opt["seed"])
            parts2, iss2 = resolve(fixed, b, kbx)
            iss2 += check(parts2, b, sit, refs, kbx)
            if _badness(iss2) <= _badness(issues):
                parts, issues = parts2, iss2
                draft = {**draft, **{k: fixed.get(k) or draft.get(k) for k in ("thesis", "questions")}}
                trace["steps"].append(f"수리: LLM ({len(first_issues)} → {len(iss2)}개 문제)")
            else:
                trace["steps"].append("수리: LLM 결과가 더 나빠 버림")
        except BackendError as e:
            trace["steps"].append("수리: LLM 실패 (" + str(e)[:100] + ")")
    parts, done = fix(parts, issues, b, sit, refs, kbx)
    if done:
        trace["steps"].append("규칙 수리: " + " · ".join(done[:8]))
    final_issues = check(parts, b, sit, refs, kbx)
    cov = {r.id: [i for i, p in enumerate(parts) if r.id in p.get("answers", [])] for r in b.keyman_reqs}
    return {
        "strategy": {"key": draft.get("strategy") or sit.strategy, "why": draft.get("strategy_why", ""), "confidence": sit.confidence,
                     "alternatives": [s for s, _ in sit.strategies if s != (draft.get("strategy") or sit.strategy)]},
        "thesis": draft.get("thesis", ""), "ending": draft.get("ending") or sit.ending,
        "parts": [{k: p.get(k) for k in ("type", "name", "goal", "items", "answers", "ref", "adapted", "origin")} | ({"text": p["text"]} if p.get("text") else {}) for p in parts],
        "coverage": cov, "questions": draft.get("questions") or [], "issues_first": first_issues, "issues": final_issues,
        "llm": used_llm, "error": err, "ms": int((time.time() - t0) * 1000), "trace": trace,
    }


def _badness(issues: list[dict]) -> int:
    w = {"uncovered": 3, "stray": 3, "leak": 2, "number": 2, "keep": 3, "flow": 1, "budget": 1, "dup": 1, "type": 1}
    return sum(w.get(i["code"], 1) for i in issues)


def to_app_parts(result: dict) -> list[dict]:
    """앱 store.js 파트 모양 — 새 파트만 {type, name, items, done:false, layouts:[]}."""
    return [{"type": p["type"], "name": p["name"], "items": p.get("items") or [], "done": False, "layouts": []}
            for p in result["parts"] if p.get("origin") == "new"]
