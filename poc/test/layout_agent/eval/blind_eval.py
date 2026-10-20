"""블라인드 세트(eval/blind1018) 실행 · 채점 — 입력과 기대값은 이 프로젝트 코드를 보지 않은 별도 에이전트가 썼다.

  python eval/blind_eval.py --only B01,B02 --name blind1018-a      # Gemini, ③ 은 기본 답으로 진행
  python eval/blind_eval.py --summary blind1018-a blind1018-b ...  # 여러 실행을 합쳐 표로

기대값(expect): level · industry · products_expected · must_show(슬라이드 글자에 보여야 할 핵심 요구) · facts(원문 수치) · must_not(나오면 안 되는 표현) · strategy
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from e2e_rfp import deck_stats  # noqa: E402
from langgraph.types import Command  # noqa: E402
from metrics import slide_text  # noqa: E402

from winmate_layout.graph import build_graph, current_fills, run_config  # noqa: E402
from winmate_layout.kb import get_kb  # noqa: E402
from winmate_layout.llm import LLM  # noqa: E402
from winmate_layout.render import write_outputs  # noqa: E402
from winmate_layout.retrieval import LayoutIndex  # noqa: E402

SET = HERE / "blind1018"


def _n(s: str) -> str:
    return re.sub(r"\s+", "", s or "").lower()


def screen_text(kb, state: dict, fills: list[dict]) -> str:
    """최종 화면 글자 — 채운 칸 + 바꾸지 않은 샘플 칸 + data-tb 밖 고정 문구."""
    out = []
    for f in fills:
        card = kb.cards[f["f"]]
        texts = {str(t["i"]): t["s"] for t in card["slots"]["texts"]}
        texts.update(f["texts"])
        out.extend(texts.values())
        out.extend(card.get("static_text", []))
    return "\n".join(out)


def run_one(kb, graph, llm, case: dict, out_dir: Path) -> dict:
    e = case["expect"]
    cfg = run_config(f"{case['id']}-{time.time()}", llm)
    n0 = len(llm.trace)
    t0 = time.time()
    graph.invoke({"input": case["input"], "options": {}}, config=cfg)
    snap = graph.get_state(cfg)
    payload = None
    if snap.tasks and snap.tasks[0].interrupts:
        payload = snap.tasks[0].interrupts[0].value
        graph.invoke(Command(resume={q["id"]: q["default"] for q in payload["questions"]}), config=cfg)
    state = graph.get_state(cfg).values
    sec = time.time() - t0
    fills = current_fills(state)
    write_outputs(kb, state, fills, out_dir / case["id"], title=f"{case['id']} · {case['title']}")
    a, ctx = state["analysis"], state["ctx"]
    st = _n(slide_text(fills))
    scr = screen_text(kb, state, fills)
    show = [{"kw": m["kw"], "hit": any(_n(k) in st for k in m["kw"])} for m in e["must_show"]]
    facts = [{"f": x, "hit": _n(x) in st} for x in e.get("facts", [])]
    bad = [x for x in e.get("must_not", []) if _n(x) in _n(scr)]
    exp_p, got_p = set(e.get("products_expected", [])), set(ctx["products"])
    if a["context_level"] == "complex":
        strat = (state.get("choice") or {}).get("strategy")
    elif a["context_level"] == "ambiguous":
        sid = state["scenario_match"].get("chosen")
        strat = next((s["strategy"] for s in kb.best_scenarios if s["id"] == sid), None)
    else:
        strat = None
    r = {
        "id": case["id"], "title": case["title"], "exp_level": e["level"], "level": a["context_level"], "exp_industry": e["industry"], "industry": a.get("industry"),
        "exp_strategy": e.get("strategy"), "strategy": strat, "scenario": state["scenario_match"].get("chosen"),
        "exp_products": sorted(exp_p), "products": sorted(got_p), "solutions": ctx["solutions"],
        "prod_recall": round(len(exp_p & got_p) / len(exp_p), 3) if exp_p else None,
        "prod_precision": round(len(exp_p & got_p) / len(got_p), 3) if got_p else None,
        "must_show": round(sum(x["hit"] for x in show) / max(1, len(show)), 3), "must_show_miss": [x["kw"][0] for x in show if not x["hit"]],
        "facts": round(sum(x["hit"] for x in facts) / len(facts), 3) if facts else None, "facts_miss": [x["f"] for x in facts if not x["hit"]],
        "must_not_hit": bad,
        "parts": [f"{p['type']}:{p['name']}" for p in state["parts"]],
        "questions": [q["id"] for q in (payload or {}).get("questions", [])], "conflicts": [c.get("kind") for c in (payload or {}).get("conflicts", [])],
        "issues": [f"[{i['sev']}] {i['msg']}" for i in state["review"]["issues"]],
        "stats": deck_stats(kb, state, fills), "sec": round(sec, 1), "llm_calls": len(llm.trace) - n0,
        "llm_fail": sum(1 for t in llm.trace[n0:] if not t["ok"]),
    }
    (out_dir / case["id"] / "blind.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    return r


def line(r: dict) -> str:
    s = r["stats"]
    ok = lambda a, b: "✓" if a == b else f"✗({a})"  # noqa: E731
    return (f"{r['id']} level {ok(r['level'], r['exp_level'])} ind {ok(r['industry'], r['exp_industry'])} strat {ok(r['strategy'], r['exp_strategy']) if r['exp_strategy'] else '-'} "
            f"prod R={r['prod_recall']} P={r['prod_precision']} {r['products']} | show {r['must_show']} miss={r['must_show_miss']} facts {r['facts']} {r['facts_miss']} "
            f"| must_not {r['must_not_hit'] or '-'} | slides {s['n_slides']} ph {s['placeholders']} photo {s['photo_slides']} img {s['img_filled']}/{s['img_slots']} stray {s['stray_slides']} | {r['sec']}s")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--name", default=time.strftime("blind-%m%d-%H%M"))
    ap.add_argument("--summary", nargs="*")
    ap.add_argument("--llm", default="gemini", help="gemini | offline")
    args = ap.parse_args()
    if args.summary is not None:
        rows = []
        for n in args.summary:
            rows += [json.loads(p.read_text(encoding="utf-8")) for p in sorted((HERE / "reports" / n).glob("*/blind.json"))]
        for r in sorted(rows, key=lambda r: r["id"]):
            print(line(r))
        return
    kb = get_kb()
    llm = LLM(args.llm)
    graph = build_graph(kb, llm, LayoutIndex(kb))
    out_dir = HERE / "reports" / args.name
    for p in sorted(SET.glob("B*.json")):
        if args.only and p.stem not in args.only.split(","):
            continue
        r = run_one(kb, graph, llm, json.loads(p.read_text(encoding="utf-8")), out_dir)
        print(line(r), flush=True)


if __name__ == "__main__":
    main()
