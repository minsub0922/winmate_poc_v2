"""레이아웃 Agent(poc/test/layout_agent) 어댑터 — LangGraph 실행 · 사용자 질문(interrupt) · 전략 코파일럿 · RAG 검색 · 평가 리포트."""
from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path

from core import JOBS, LAYOUT_DIR, Job

if str(LAYOUT_DIR) not in sys.path:
    sys.path.insert(0, str(LAYOUT_DIR))

_CACHE: dict = {}
_LOCK = threading.Lock()
SETS = ("cases", "holdout", "holdout2")
EVAL_DIR = LAYOUT_DIR / "eval"


def _kb():
    """KB · 검색 인덱스는 한 번만 만든다(수 초)."""
    with _LOCK:
        if "kb" not in _CACHE:
            from winmate_layout.kb import get_kb
            from winmate_layout.retrieval import LayoutIndex
            kb = get_kb()
            _CACHE["kb"], _CACHE["index"] = kb, LayoutIndex(kb)
        return _CACHE["kb"], _CACHE["index"]


def available() -> dict:
    out = {"ok": False, "path": str(LAYOUT_DIR), "error": "", "deepagents": False}
    try:
        import winmate_layout.graph  # noqa: F401
        out["ok"] = True
    except Exception as e:  # noqa: BLE001
        out["error"] = f"{type(e).__name__}: {e}"
    try:
        import deepagents  # noqa: F401
        out["deepagents"] = True
    except Exception:  # noqa: BLE001
        pass
    try:
        from winmate_layout import config
        out["gemini_key"] = bool(config.GEMINI_API_KEY)
        out["model"] = config.GEMINI_MODEL
    except Exception:  # noqa: BLE001
        pass
    return out


def catalog() -> dict:
    kb, _ = _kb()
    return {
        "industries": [{"code": i["code"], "name": i["name"]} for i in kb.industries],
        "products": [{"id": p["id"], "model": p["model"], "name": p["name"], "cat": p["cat"]} for p in kb.products],
        "solutions": [{"id": s["id"], "name": s["name"], "cat": s["cat"]} for s in kb.solutions],
        "cases": [{"id": str(c["id"]), "cust": c["cust"], "ind": c.get("indRaw", "")} for c in kb.cases][:400],
        "parts": [{"type": k, "label": v.get("label", k)} for k, v in kb.PARTS.items() if k != "free"],
        "strategies": [{"key": k, "label": v["label"]} for k, v in kb.STRATEGIES.items()],
    }


def list_cases() -> list[dict]:
    out = []
    for s in SETS:
        for p in sorted((EVAL_DIR / s).glob("*.json")):
            d = json.loads(p.read_text(encoding="utf-8"))
            out.append({"set": s, "id": d["id"], "title": d.get("title", ""), "level": d.get("level") or d.get("gold", {}).get("level"),
                        "industry": d.get("industry"), "strategy": d.get("strategy")})
    return out


def get_case(set_: str, cid: str) -> dict:
    if set_ not in SETS:
        raise ValueError("set")
    d = json.loads((EVAL_DIR / set_ / f"{Path(cid).name}.json").read_text(encoding="utf-8"))
    return {"input": d["input"], "gold": d.get("gold"), "title": d.get("title", "")}


# ---------------------------------------------------------------- 실행
def start(params: dict) -> Job:
    title = (params.get("input") or {}).get("title") or (params.get("input") or {}).get("customer") or "직접 입력"
    return JOBS.submit("layout", f"레이아웃 · {title}", {k: v for k, v in params.items() if k != "input"} | {"case": params.get("case")}, lambda job: _run(job, params))


def _build(job: Job, llm_mode: str):
    from winmate_layout.graph import build_graph, run_config
    from winmate_layout.llm import LLM
    kb, index = _kb()
    llm = LLM(llm_mode)
    if llm_mode == "gemini" and not llm.online:
        raise RuntimeError(f"Gemini 를 쓸 수 없습니다 — {llm.disabled_reason or 'poc/.env 확인'}")
    graph = build_graph(kb, llm, index)
    cfg = run_config(f"tb-{job.id}", llm)
    job.ctx.update(graph=graph, cfg=cfg, llm=llm, kb=kb, index=index)
    return graph, cfg, llm


def _stream(job: Job, payload) -> None:
    graph, cfg = job.ctx["graph"], job.ctx["cfg"]
    seen: set = set()
    for upd in graph.stream(payload, config=cfg, stream_mode="updates"):
        for node, val in (upd or {}).items():
            if node == "__interrupt__":
                job.log("사용자 답을 기다립니다 — 전략 질문")
                continue
            info = ""
            if isinstance(val, dict) and val.get("log"):
                lg = val["log"][-1]
                info = " · ".join(f"{k}={v}" for k, v in lg.items() if k not in ("node",) and v not in (None, ""))
            key = (node, info)
            if node in ("design_part", "fill_slide") and key in seen:
                continue
            seen.add(key)
            job.log(f"{node}" + (f" — {info}" if info else ""))


def _run(job: Job, params: dict):
    llm_mode = params.get("llm", "offline")
    graph, cfg, llm = _build(job, llm_mode)
    job.log(f"시작 — LLM {llm.mode}" + (f" ({llm.model_name})" if llm.online else ""))
    inp = params["input"]
    opts = {} if params.get("interactive", True) else {"auto_answer": True}
    if params.get("max_slides"):
        inp = dict(inp, max_slides=int(params["max_slides"]))
    _stream(job, {"input": inp, "options": opts})
    return _after(job)


def _after(job: Job):
    graph, cfg = job.ctx["graph"], job.ctx["cfg"]
    snap = graph.get_state(cfg)
    if snap.tasks and snap.tasks[0].interrupts:
        job.waiting = snap.tasks[0].interrupts[0].value
        job.status = "waiting"
        job.result = serialize(job, snap.values, partial=True)
        return job.result
    job.log(f"완료 — 슬라이드 {len(snap.values.get('slides') or [])}장 · LLM 호출 {len(job.ctx['llm'].trace)}회")
    return serialize(job, snap.values)


def answer(job: Job, answers: dict) -> None:
    from langgraph.types import Command
    if job.status != "waiting":
        raise ValueError("이 작업은 답을 기다리고 있지 않습니다")
    job.waiting = None
    job.log("답 반영 — " + ", ".join(f"{k}={v}" for k, v in answers.items() if v)[:300])

    def fn(j: Job):
        _stream(j, Command(resume=answers))
        return _after(j)
    job.status = "running"
    JOBS.run(job, fn)


def copilot(job: Job, message: str) -> dict:
    """복잡(③) 맥락에서 멈춘 그래프에 deepagents 전략 코파일럿을 붙여 대화한다."""
    if job.status != "waiting":
        raise ValueError("전략 질문에서 멈춘 작업에서만 쓸 수 있습니다")
    llm = job.ctx["llm"]
    if not llm.online:
        raise ValueError("코파일럿은 Gemini 로 실행한 작업에서만 쓸 수 있습니다(LLM=gemini 로 다시 실행하세요)")
    if "sess" not in job.ctx:
        from winmate_layout.strategy_agent import StrategySession
        job.ctx["sess"] = StrategySession(job.ctx["graph"], job.ctx["cfg"], job.ctx["kb"], job.ctx["index"], llm.chat_model)
    sess = job.ctx["sess"]
    t0 = time.time()
    reply = sess.chat(message)
    tools = [getattr(m, "name", "") for m in sess.messages if getattr(m, "type", "") == "tool"]
    job.log(f"코파일럿 — {int((time.time() - t0) * 1000)}ms · 도구 {', '.join(tools[-4:]) or '-'}")
    return {"reply": reply, "answers": sess.answers, "finalized": sess.finalized, "tools": tools}


def copilot_finalize(job: Job) -> None:
    sess = job.ctx.get("sess")
    if not sess:
        raise ValueError("코파일럿 대화가 없습니다")
    defaults = {q["id"]: q["default"] for q in sess.payload["questions"]}
    defaults.update(sess.answers)
    answer(job, defaults)


# ---------------------------------------------------------------- 결과 정리
def _slide_html(kb, fill: dict) -> str:
    from winmate_layout.slots import render_filled
    texts = {int(k): v for k, v in fill["texts"].items()}
    imgs = {}
    for k, v in (fill.get("images") or {}).items():
        f = v.get("file") or ""
        imgs[int(k)] = {"src": ("/" + f) if f.startswith("img/") else "", "label": v.get("label", ""), "fit": v.get("fit", "cover")}
    return render_filled(kb.html[fill["f"]], texts, page_no=fill.get("no"), img_fills=imgs)


def serialize(job: Job, st: dict, partial: bool = False) -> dict:
    from winmate_layout.graph import current_fills
    kb = job.ctx["kb"]
    a = st.get("analysis") or {}
    ctx = st.get("ctx") or {}
    out = {
        "partial": partial,
        "analysis": {k: a.get(k) for k in ("industry", "industry_name", "industry_source", "industry_conf", "req_type", "strategy", "context_level", "level_label",
                                             "level_reason", "requirements", "keymen", "goals", "facts", "spaces", "summary", "signals", "llm", "dimensions")},
        "ctx": ctx and {**{k: ctx.get(k) for k in ("industry", "industry_name", "customer", "project", "spaces")},
                        "products": [{"id": p, "model": kb.P[p]["model"], "name": kb.P[p]["name"]} for p in ctx.get("products", []) if p in kb.P],
                        "solutions": [{"id": s, "name": kb.S[s]["name"]} for s in ctx.get("solutions", []) if s in kb.S],
                        "cases": [{"id": c, "cust": kb.C[c]["cust"]} for c in ctx.get("cases", []) if c in kb.C],
                        "recommended": {k: [x.get("id") for x in v] for k, v in (ctx.get("recommended") or {}).items()}},
        "route": st.get("route"),
        "scenario_match": st.get("scenario_match"),
        "decomposition": st.get("decomposition"),
        "choice": st.get("choice"),
        "llm_calls": len(job.ctx["llm"].trace), "llm_fail": sum(1 for t in job.ctx["llm"].trace if not t["ok"]),
        "nodes": [lg for lg in st.get("log") or []],
    }
    if partial:
        return out
    fills = current_fills(st)
    slides = {(s["part_id"], s["f"], s.get("pg", 0)): s for s in st.get("slides") or []}
    out.update({
        "parts": st.get("parts"), "links": (st.get("links") or {}).get("links"), "uncovered": (st.get("links") or {}).get("uncovered"),
        "review": st.get("review"),
        "slides": [{"no": f["no"], "f": f["f"], "code": f["code"], "part_id": f["part_id"], "name": kb.cards[f["f"]]["name"],
                    "why": slides.get((f["part_id"], f["f"], f.get("pg", 0)), {}).get("why", []),
                    "alternates": [{"f": x["f"], "code": x["code"], "name": x["name"]} for x in slides.get((f["part_id"], f["f"], f.get("pg", 0)), {}).get("alternates", [])],
                    "checks": f["checks"], "llm": f.get("llm"), "texts": f["texts"], "sources": f["sources"],
                    "html": _slide_html(kb, f)} for f in fills],
    })
    job.ctx["state"], job.ctx["fills"] = st, fills
    return out


def proposal_json(job: Job) -> dict:
    from winmate_layout.render import to_app_proposal
    return to_app_proposal(job.ctx["state"], job.ctx["fills"])


def report_md(job: Job) -> str:
    from winmate_layout.render import report_md as rmd
    return rmd(job.ctx["kb"], job.ctx["state"], job.ctx["fills"])


# ---------------------------------------------------------------- RAG 검색
def search(q: str, part: str = "", ind: str | None = None, products: str = "", solutions: str = "", strategy: str | None = None, k: int = 12, level: str = "ambiguous") -> list[dict]:
    from winmate_layout.layout_design import available_info, rank_slide
    kb, index = _kb()
    p = {"id": "S01", "type": part or "value", "name": q, "items": [], "seed_layouts": [], "req_ids": [], "slides": 1}
    ctx = {"industry": ind or None, "industry_name": kb.ind_name(ind) if ind else "", "customer": "고객사", "project": "", "target": "",
           "products": [x for x in products.split(",") if x in kb.P], "solutions": [x for x in solutions.split(",") if x in kb.S], "cases": [], "spaces": []}
    analysis = {"requirements": [], "keymen": [], "goals": [], "facts": [], "req_type": None, "context_level": level}
    r = rank_slide(kb, index, p, 0, ctx, analysis, available_info(analysis, ctx), level, strategy or None)
    out = []
    for c in r["candidates"][:k]:
        card = kb.cards[c["f"]]
        out.append({"f": c["f"], "code": c["code"], "score": round(c["score"], 2), "why": c["why"], "name": card["name"], "when": card.get("when", ""),
                    "part": card["part"], "visual": card.get("visual"), "ind": card.get("ind"), "sol": card.get("sol"), "capacity": card.get("capacity"),
                    "needs": card.get("data_needs", {}).get("labels", []), "strategy_fit": card.get("strategy_fit"), "level_fit": card.get("level_fit"),
                    "static_text": card.get("static_text", [])[:4]})
    return out


def layout_html(f: str) -> str:
    kb, _ = _kb()
    if f not in kb.html:
        raise KeyError(f)
    html = kb.html[f]
    return html.replace('src="img/', 'src="/img/')


def card(f: str) -> dict:
    kb, _ = _kb()
    c = dict(kb.cards[f])
    c.pop("embed_text", None)
    return c


# ---------------------------------------------------------------- 평가 리포트
def list_reports() -> list[dict]:
    out = []
    root = EVAL_DIR / "reports"
    if not root.exists():
        return out
    for d in sorted(root.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        m = d / "metrics.json"
        if not m.exists():
            continue
        try:
            s = json.loads(m.read_text(encoding="utf-8"))["summary"]
        except (ValueError, KeyError):
            continue
        out.append({"name": d.name, "overall": s.get("overall"), "by_level": s.get("by_level"), "llm": s.get("llm"), "model": s.get("model"),
                    "n": s.get("n"), "llm_calls": s.get("llm_calls"), "has_cases": (d / "cases").exists()})
    return out


def get_report(name: str) -> dict:
    d = (EVAL_DIR / "reports" / Path(name).name)
    j = json.loads((d / "metrics.json").read_text(encoding="utf-8"))
    for r in j.get("rows", []):
        r["preview"] = (d / "cases" / r["id"] / "preview.html").exists()
    return j
