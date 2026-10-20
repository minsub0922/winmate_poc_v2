"""30 TC 실행 · 평가 · 리포트.

사용:
  python eval/run_eval.py --llm offline --name v1           # 오프라인(결정론) 백엔드
  python eval/run_eval.py --llm gemini  --name live-v1      # Gemini (.env 의 GEMINI_API_KEY)
  python eval/run_eval.py --only C04_L3 --render            # 한 TC + 미리보기 HTML
L3(복잡) TC 는 먼저 interrupt 로 멈추는지 확인하고, 기본 답으로 resume 해서 끝까지 돌린다.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from langgraph.types import Command  # noqa: E402

from metrics import WEIGHTS, score_case  # noqa: E402
from winmate_layout.graph import build_graph, current_fills, run_config  # noqa: E402

LLM_REF: list = [None]
from winmate_layout.kb import get_kb  # noqa: E402
from winmate_layout.llm import LLM  # noqa: E402
from winmate_layout.render import write_outputs  # noqa: E402
from winmate_layout.retrieval import LayoutIndex  # noqa: E402


def run_tc(graph, tc: dict, hitl: bool = True) -> tuple[dict, dict | None]:
    cfg = run_config(tc["id"] + str(time.time()), LLM_REF[0])
    payload = None
    if tc["level"] == "complex" and hitl:
        graph.invoke({"input": tc["input"], "options": {}}, config=cfg)
        snap = graph.get_state(cfg)
        if snap.next and snap.tasks and snap.tasks[0].interrupts:
            payload = snap.tasks[0].interrupts[0].value
            answers = {q["id"]: q["default"] for q in payload["questions"]}
            graph.invoke(Command(resume=answers), config=cfg)
        state = graph.get_state(cfg).values
    else:
        state = graph.invoke({"input": tc["input"], "options": {"auto_answer": True}}, config=cfg)
    return state, payload


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--llm", default="offline")
    ap.add_argument("--name", default=time.strftime("run-%m%d-%H%M"))
    ap.add_argument("--only", default="")
    ap.add_argument("--render", action="store_true", help="TC 마다 preview.html · proposal.app.json 저장")
    ap.add_argument("--set", default="cases", choices=["cases", "holdout", "holdout2"], help="cases: 개선용 30 TC / holdout · holdout2: 일반화 확인용 블라인드 6 TC씩")
    args = ap.parse_args()
    kb = get_kb()
    llm = LLM(args.llm)
    LLM_REF[0] = llm
    t0 = time.time()
    graph = build_graph(kb, llm, LayoutIndex(kb))
    print(f"[eval] llm={llm.mode} model={llm.model_name if llm.online else '-'} graph build {time.time() - t0:.1f}s")
    cases = sorted((HERE / args.set).glob("*.json"))
    if args.only:
        keys = args.only.split(",")
        cases = [c for c in cases if any(k in c.stem for k in keys)]
    out_dir = HERE / "reports" / args.name
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for p in cases:
        tc = json.loads(p.read_text(encoding="utf-8"))
        t1 = time.time()
        try:
            state, payload = run_tc(graph, tc)
            fills = current_fills(state)
            r = score_case(tc, state, fills, payload, kb)
            r["sec"] = round(time.time() - t1, 2)
            if args.render:
                write_outputs(kb, state, fills, out_dir / "cases" / tc["id"], title=tc["id"] + " · " + tc["title"])
            r["slides"] = [f"{s['no']}.{s['part_type']}:{s['f']}" for s in state["slides"]]
            r["parts"] = [f"{x['id']}:{x['type']}:{x['name']}" for x in state["parts"]]
        except Exception as e:  # noqa: BLE001
            import traceback

            traceback.print_exc()
            r = {"id": tc["id"], "case": tc["case"], "level": tc["level"], "industry": tc["industry"], "score": 0.0, "metrics": {}, "detail": {"error": repr(e)}, "sec": 0}
        rows.append(r)
        print(f"  {r['id']:8s} {r['level']:9s} score={r['score']:.3f}  " + " ".join(f"{k}={v:.2f}" for k, v in r["metrics"].items() if v is not None and v < 1))
    summary = summarize(rows)
    summary.update({"name": args.name, "llm": llm.mode, "model": llm.model_name if llm.online else None, "llm_calls": len(llm.trace),
                    "llm_fail": sum(1 for t in llm.trace if not t["ok"]), "elapsed_s": round(time.time() - t0, 1)})
    (out_dir / "metrics.json").write_text(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "summary.md").write_text(to_md(summary, rows), encoding="utf-8")
    if llm.trace:
        (out_dir / "llm_trace.json").write_text(json.dumps(llm.trace, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n[eval] overall={summary['overall']:.3f}  by level={summary['by_level']}  → {out_dir}")


def summarize(rows: list[dict]) -> dict:
    by_level = defaultdict(list)
    by_case = defaultdict(list)
    met = defaultdict(list)
    for r in rows:
        by_level[r["level"]].append(r["score"])
        by_case[r["case"]].append(r["score"])
        for k, v in r["metrics"].items():
            if v is not None:
                met[k].append(v)
    avg = lambda xs: round(sum(xs) / len(xs), 4) if xs else None  # noqa: E731
    return {"overall": avg([r["score"] for r in rows]), "by_level": {k: avg(v) for k, v in by_level.items()},
            "by_case": {k: avg(v) for k, v in sorted(by_case.items())}, "metrics": {k: avg(v) for k, v in met.items()}, "n": len(rows)}


def to_md(s: dict, rows: list[dict]) -> str:
    L = [f"# Eval · {s['name']}", "", f"- LLM: {s['llm']} {s.get('model') or ''} · 호출 {s['llm_calls']} (실패 {s['llm_fail']}) · {s['elapsed_s']}s",
         f"- **overall {s['overall']:.3f}** · " + " · ".join(f"{k} {v:.3f}" for k, v in s["by_level"].items()), "", "## 지표 평균", "", "| 지표 | 평균 | 가중치 |", "|---|---|---|"]
    for k, v in sorted(s["metrics"].items(), key=lambda kv: kv[1]):
        L.append(f"| {k} | {v:.3f} | {WEIGHTS.get(k, '')} |")
    L += ["", "## TC", "", "| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |", "|---|---|---|---|---|"]
    for r in rows:
        low = ", ".join(f"{k}={v:.2f}" for k, v in r["metrics"].items() if v is not None and v < 1)
        d = r["detail"]
        note = []
        if d.get("scenario"):
            note.append(f"시나리오 {d['scenario']}")
        if d.get("strategy"):
            note.append(f"전략 {d['strategy']}")
        if d.get("missing_parts"):
            note.append(f"빠진 파트 {d['missing_parts']}")
        if d.get("layouts_any_miss"):
            note.append(f"기대 장표 없음 {d['layouts_any_miss']}")
        if d.get("facts_miss"):
            note.append(f"수치 미사용 {d['facts_miss']}")
        miss = [k['kw'] for k in d.get("key_reqs", []) if not (k['trace'] and k['reflect'])]
        if miss:
            note.append(f"요구 미반영 {miss}")
        if d.get("error"):
            note.append("ERROR " + d["error"][:80])
        L.append(f"| {r['id']} | {r['level']} | {r['score']:.3f} | {low} | {'; '.join(note)} |")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    main()
