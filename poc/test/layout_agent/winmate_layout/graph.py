"""LangGraph — 요구사항 분석 → (맥락 3분기) → storyboard → layout 설계(파트별 fan-out) → 값 입력(슬라이드별 fan-out) → 검토.

                         ┌─ match_standard ───────────────────────────┐
 ingest → analyze → route┼─ match_best ───────────────────────────────┼→ plan → [design_part × N] → assemble → [fill_slide × M] → review ─┬→ finalize
                         └─ decompose → strategy_interview(interrupt) ─┘                                                                   └→ revise → [design_part] …
 strategy_interview 는 사용자 답을 기다린다(interrupt). 배치 · 평가에서는 options.auto_answer=True 로 기본값을 쓴다.
"""
from __future__ import annotations

import operator
import time
from typing import Annotated, Any, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send, interrupt

from .analysis import Analyzer
from .decompose import decompose
from .fill import Filler
from .kb import KB, get_kb
from .layout_design import assemble, available_info, llm_pick_batch, rank_slide
from .tables import paginate
from .llm import LLM
from .retrieval import LayoutIndex
from .review import review_deck, revision_parts
from .scenarios import adapt_best, ensure_value_part, match_best, match_standard, resolve_context, resolve_standard
from .schemas import LEVEL_ROUTE, ProposalInput
from .storyboard import enrich_items, finalize_ids, link_and_prune, link_requirements, prioritize, trim_to_budget
from .strategy import build_complex_storyboard, interview_statements, parse_answers


RESET = {"__reset__": True}


def add_or_reset(a: list | None, b) -> list:
    """같은 thread 로 새 입력을 다시 돌릴 때 이전 결과(ranked · fills)를 비운다."""
    if isinstance(b, dict) and b.get("__reset__"):
        return []
    return (a or []) + (b or [])


class State(TypedDict, total=False):
    input: dict
    options: dict
    full_text: str
    analysis: dict
    ctx: dict
    route: str
    scenario_match: dict
    decomposition: dict
    choice: dict
    parts: list[dict]
    links: dict
    ranked: Annotated[list[dict], add_or_reset]
    slides: list[dict]
    fills: Annotated[list[dict], add_or_reset]
    review: dict
    revision: int
    log: Annotated[list[dict], operator.add]


def _log(node: str, t0: float, **kw) -> list[dict]:
    return [{"node": node, "ms": int((time.time() - t0) * 1000), **kw}]


def run_config(thread_id: str, llm: LLM | None = None) -> dict:
    """invoke 설정 — Gemini 를 쓸 때는 병렬 호출 수를 제한한다(429 방지)."""
    return {"configurable": {"thread_id": thread_id}, "max_concurrency": 4 if (llm and llm.online) else 16}


def build_graph(kb: KB | None = None, llm: LLM | None = None, index: LayoutIndex | None = None, checkpointer: Any = None):
    kb = kb or get_kb()
    llm = llm or LLM()
    index = index or LayoutIndex(kb)
    analyzer = Analyzer(kb, llm)
    filler = Filler(kb, llm)

    # ---------------- nodes ----------------
    def ingest(state: State) -> dict:
        t0 = time.time()
        inp = ProposalInput.model_validate(state["input"])
        return {"input": inp.model_dump(), "full_text": analyzer.full_text(inp), "revision": 0, "ranked": RESET, "fills": RESET,
                "decomposition": None, "choice": None, "log": _log("ingest", t0)}

    def analyze(state: State) -> dict:
        t0 = time.time()
        inp = ProposalInput.model_validate(state["input"])
        a = analyzer.run(inp)
        forced = (state.get("options") or {}).get("force_level")
        if forced:
            a["context_level"], a["level_reason"] = forced, f"강제 지정({forced})"
        ctx = resolve_context(kb, inp, a, state["full_text"])
        return {"analysis": a, "ctx": ctx, "route": LEVEL_ROUTE[a["context_level"]],
                "log": _log("analyze", t0, level=a["context_level"], industry=a["industry"], n_req=len(a["requirements"]), llm=a["llm"])}

    def route(state: State) -> str:
        return {"standard": "match_standard", "best": "match_best", "decompose": "decompose"}[state["route"]]

    def n_match_standard(state: State) -> dict:
        t0 = time.time()
        m = match_standard(kb, state["analysis"])
        parts = resolve_standard(kb, m["chosen"], state["ctx"])
        return {"scenario_match": m, "parts": parts, "log": _log("match_standard", t0, chosen=m["chosen"])}

    def n_match_best(state: State) -> dict:
        t0 = time.time()
        m = match_best(kb, state["analysis"], state["ctx"], state["full_text"], llm)
        parts = ensure_value_part(kb, adapt_best(kb, m["chosen"], state["ctx"]), state["analysis"], state["ctx"])
        return {"scenario_match": m, "parts": parts, "log": _log("match_best", t0, chosen=m["chosen"], llm=m["llm"])}

    def n_decompose(state: State) -> dict:
        t0 = time.time()
        d = decompose(kb, state["analysis"], state["full_text"], llm, state["ctx"])
        return {"decomposition": d, "log": _log("decompose", t0, groups=len(d["groups"]), conflicts=len(d["conflicts"]), questions=len(d["questions"]))}

    def strategy_interview(state: State) -> dict:
        t0 = time.time()
        d = state["decomposition"]
        opts = state.get("options") or {}
        if opts.get("auto_answer") or opts.get("answers") is not None:
            answers = opts.get("answers") or {}
        else:
            answers = interrupt({
                "type": "strategy_interview", "message": "요구사항을 기준별로 정리했습니다. 아래 질문에 답하면 전략과 PPT 구성을 세웁니다.",
                "groups": [{k: g[k] for k in ("dimension", "n", "must", "summary")} for g in d["groups"]],
                "eval": d["eval"], "conflicts": d["conflicts"], "gaps": d["gaps"], "strategy_options": d["strategy_options"], "questions": d["questions"],
            })
        choice = parse_answers(answers or {}, d, state["analysis"])
        a, ctx, full_text = apply_interview(kb, analyzer, state["analysis"], state["ctx"], state["full_text"], choice, d)
        parts = build_complex_storyboard(kb, a, d, choice, ctx)
        m = {"kind": "strategy", "chosen": choice["strategy"], "candidates": d["strategy_options"]}
        out = {"choice": choice, "parts": parts, "scenario_match": m,
               "log": _log("strategy_interview", t0, strategy=choice["strategy"], answered=bool(answers), added=len(a["requirements"]) - len(state["analysis"]["requirements"]))}
        if a is not state["analysis"]:
            out.update(analysis=a, ctx=ctx, full_text=full_text)
        return out

    def plan(state: State) -> dict:
        t0 = time.time()
        a, ctx = state["analysis"], state["ctx"]
        parts = [dict(p) for p in state["parts"]]
        for p in parts:
            p.setdefault("req_ids", [])
        choice = state.get("choice") or {}
        parts, links = link_and_prune(kb, parts, a["requirements"])
        prioritize(kb, parts, a["requirements"], choice.get("keyman"))
        inp = state["input"]
        budget = inp.get("max_slides") or (round(inp["minutes"] / 1.3) if inp.get("minutes") else None) or choice.get("budget")
        parts = trim_to_budget(parts, budget)
        links = link_requirements(kb, parts, a["requirements"])
        prioritize(kb, parts, a["requirements"], choice.get("keyman"))
        used_llm = enrich_items(kb, parts, a["requirements"], ctx, llm, state["full_text"])
        finalize_ids(parts)
        return {"parts": parts, "links": links, "log": _log("plan", t0, parts=len(parts), budget=budget, uncovered=len(links["uncovered"]), llm=used_llm)}

    def fanout_design(state: State):
        done = {(r["part_id"], r["slide"]) for r in state.get("ranked") or []}
        sends = []
        for p in state["parts"]:
            for j in range(p["slides"]):
                if (p["id"], j) not in done:
                    sends.append(Send("design_part", {"part": p, "j": j, "analysis": state["analysis"], "ctx": state["ctx"], "level": state["analysis"]["context_level"],
                                                      "strategy": (state.get("choice") or {}).get("strategy") or _strategy_of(kb, state)}))
        return sends or ["assemble"]

    def design_part(payload: dict) -> dict:
        t0 = time.time()
        p, a, ctx = payload["part"], payload["analysis"], payload["ctx"]
        avail = available_info(a, ctx)
        r = rank_slide(kb, index, p, payload["j"], ctx, a, avail, payload["level"], payload["strategy"])
        return {"ranked": [r], "log": _log("design_part", t0, part=p["id"], slide=payload["j"], top=r["candidates"][0]["f"] if r["candidates"] else None)}

    def n_assemble(state: State) -> dict:
        t0 = time.time()
        latest = {}
        for r in state.get("ranked") or []:
            latest[(r["part_id"], r["slide"])] = r
        ids = {p["id"] for p in state["parts"]}
        cur = llm_pick_batch(kb, llm, state["parts"], [r for k, r in latest.items() if k[0] in ids], state["analysis"], state["ctx"])
        picked = [r for r in cur if r.get("llm") and not latest.get((r["part_id"], r["slide"]), {}).get("llm")]
        slides = assemble(kb, state["parts"], cur)
        slides = paginate(kb, slides, state["analysis"])
        return {"slides": slides, "ranked": picked, "log": _log("assemble", t0, slides=len(slides), llm_picked=len(picked))}

    def fanout_fill(state: State):
        done = {skey(f) for f in state.get("fills") or []}
        parts = {p["id"]: p for p in state["parts"]}
        sends = [Send("fill_slide", {"slide": s, "part": parts[s["part_id"]], "analysis": state["analysis"], "ctx": state["ctx"], "full_text": state["full_text"],
                                     "decomposition": state.get("decomposition")})
                 for s in state["slides"] if skey(s) not in done]
        return sends or ["review"]

    def fill_slide(payload: dict) -> dict:
        t0 = time.time()
        s = payload["slide"]
        out = filler.fill_slide(s, payload["part"], payload["analysis"], payload["ctx"], payload["full_text"], s["no"], payload.get("decomposition"))
        return {"fills": [out], "log": _log("fill_slide", t0, f=s["f"], changed=out["checks"]["changed"])}

    def n_review(state: State) -> dict:
        t0 = time.time()
        cur = {skey(s) for s in state["slides"]}
        fills = _latest_fills(state, cur)
        rv = review_deck(kb, state["parts"], state["slides"], fills, state["analysis"], state["ctx"], state["links"])
        return {"review": rv, "log": _log("review", t0, coverage=rv["req_coverage"], must_uncovered=len(rv["must_uncovered"]))}

    def after_review(state: State) -> str:
        rv = state["review"]
        return "revise" if rv["must_uncovered"] and state.get("revision", 0) < 1 else "finalize"

    def revise(state: State) -> dict:
        t0 = time.time()
        add = revision_parts(kb, state["analysis"], state["review"]["must_uncovered"])
        parts = [dict(p) for p in state["parts"]]
        close = next((i for i, p in enumerate(parts) if p["type"] == "closing"), len(parts))
        parts[close:close] = add
        for p in parts:
            p.setdefault("req_ids", [])
        old_ids = {id(p) for p in parts}  # noqa: F841
        links = link_requirements(kb, parts, state["analysis"]["requirements"])
        prioritize(kb, parts, state["analysis"]["requirements"], (state.get("choice") or {}).get("keyman"))
        # 기존 파트 id 를 유지해야 ranked/fills 를 재사용할 수 있으므로, 새 파트에만 새 id
        n = len(state["parts"])
        for k, p in enumerate(add):
            p["id"] = f"S{n + k + 1:02d}R"
            p["slides"] = max(1, len(p.get("seed_layouts") or []))
        return {"parts": parts, "links": links, "revision": state.get("revision", 0) + 1, "log": _log("revise", t0, added=len(add))}

    def finalize(state: State) -> dict:
        return {"log": _log("finalize", time.time())}

    g = StateGraph(State)
    g.add_node("ingest", ingest)
    g.add_node("analyze", analyze)
    g.add_node("match_standard", n_match_standard)
    g.add_node("match_best", n_match_best)
    g.add_node("decompose", n_decompose)
    g.add_node("strategy_interview", strategy_interview)
    g.add_node("plan", plan)
    g.add_node("design_part", design_part)
    g.add_node("assemble", n_assemble)
    g.add_node("fill_slide", fill_slide)
    g.add_node("review", n_review)
    g.add_node("revise", revise)
    g.add_node("finalize", finalize)
    g.add_edge(START, "ingest")
    g.add_edge("ingest", "analyze")
    g.add_conditional_edges("analyze", route, ["match_standard", "match_best", "decompose"])
    g.add_edge("match_standard", "plan")
    g.add_edge("match_best", "plan")
    g.add_edge("decompose", "strategy_interview")
    g.add_edge("strategy_interview", "plan")
    g.add_conditional_edges("plan", fanout_design, ["design_part", "assemble"])
    g.add_edge("design_part", "assemble")
    g.add_conditional_edges("assemble", fanout_fill, ["fill_slide", "review"])
    g.add_edge("fill_slide", "review")
    g.add_conditional_edges("review", after_review, ["revise", "finalize"])
    g.add_conditional_edges("revise", fanout_design, ["design_part", "assemble"])
    g.add_edge("finalize", END)
    return g.compile(checkpointer=checkpointer or InMemorySaver())


def apply_interview(kb: KB, analyzer: Analyzer, analysis: dict, ctx: dict, full_text: str, choice: dict, decomp: dict) -> tuple[dict, dict, str]:
    """인터뷰 답을 분석 결과에 되먹인다 — 새 사실은 요구(I01…) · 수치 근거 · 원문에 더하고, 확정 제품은 ctx 에 반영."""
    stmts = interview_statements(choice, decomp)
    if not stmts:
        return analysis, ctx, full_text
    a = dict(analysis)
    reqs = [dict(r) for r in analysis["requirements"]]
    texts = []
    for k, (text, src) in enumerate(stmts):
        r = analyzer.make_requirement(k, {"text": text, "source": src, "keyman": None, "weight": 0.0, "tag": None, "customer": True})
        r["id"], r["interview"] = f"I{k + 1:02d}", True
        reqs.append(r)
        texts.append(text)
    a["requirements"] = analyzer.finalize_requirements(reqs)
    a["dimensions"] = {}
    for r in a["requirements"]:
        a["dimensions"][r["dimension"]] = a["dimensions"].get(r["dimension"], 0) + 1
    add_text = "\n".join(texts)
    a["facts"] = list(analysis["facts"]) + analyzer.extract_facts(None, add_text)
    ctx = dict(ctx)
    picked = (choice.get("gaps") or {}).get("products")
    if picked:
        pids = [p for p in analyzer.link_models(picked) if p in kb.P]
        if pids:
            ctx["products"] = pids
    return a, ctx, full_text + "\n" + add_text


def _strategy_of(kb: KB, state: State) -> str | None:
    m = state.get("scenario_match") or {}
    if m.get("kind") == "best":
        return kb.BS[m["chosen"]]["strategy"]
    return state["analysis"].get("strategy")


def skey(x: dict) -> tuple:
    """슬라이드 · 채우기 결과의 식별자 — 같은 장표가 대응표 이어지는 쪽(pg)으로 반복될 수 있다."""
    return (x["part_id"], x["f"], x.get("pg", 0))


def _latest_fills(state: State, cur: set) -> list[dict]:
    latest = {}
    for f in state.get("fills") or []:
        latest[skey(f)] = f
    return [v for k, v in latest.items() if k in cur]


def current_fills(state: dict) -> list[dict]:
    cur = {skey(s) for s in state.get("slides") or []}
    fills = _latest_fills(state, cur)
    order = {skey(s): s["no"] for s in state["slides"]}
    for f in fills:
        f["no"] = order[skey(f)]
    return sorted(fills, key=lambda f: f["no"])
