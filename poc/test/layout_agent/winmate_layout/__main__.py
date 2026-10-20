"""CLI

  python -m winmate_layout run --case eval/cases/C04_L3.json            # 한 건 실행 → outputs/<id>/preview.html · proposal.app.json · report.md
  python -m winmate_layout run --input my.json --llm gemini --ask      # 복잡(③)이면 질문에 터미널로 답하고 이어서 진행
  python -m winmate_layout interview --case eval/cases/C04_L3.json     # 복잡(③) — deepagents 전략 코파일럿과 대화(Gemini 필요)
  python -m winmate_layout search "평가 배점 대응" --part requirements --ind FN   # 레이아웃 RAG 확인
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from langgraph.types import Command

from .graph import build_graph, current_fills, run_config
from .kb import ROOT, get_kb
from .layout_design import available_info, rank_slide
from .llm import LLM
from .render import write_outputs
from .retrieval import LayoutIndex


def _load_input(args) -> tuple[dict, str]:
    p = Path(args.case or args.input)
    d = json.loads(p.read_text(encoding="utf-8"))
    if "input" in d and "gold" in d:  # TC 파일
        return d["input"], d.get("id", p.stem)
    return d, d.get("id", p.stem)


def cmd_run(args) -> None:
    kb = get_kb()
    llm = LLM(args.llm)
    graph = build_graph(kb, llm, LayoutIndex(kb))
    inp, rid = _load_input(args)
    cfg = run_config(f"{rid}-{time.time()}", llm)
    t0 = time.time()
    graph.invoke({"input": inp, "options": {} if args.ask else {"auto_answer": True}}, config=cfg)
    snap = graph.get_state(cfg)
    if snap.tasks and snap.tasks[0].interrupts:
        q = snap.tasks[0].interrupts[0].value
        print("\n=== 요구사항이 복잡합니다 — 기준별로 정리했습니다 ===")
        for g in q["groups"]:
            print(f"  · {g['dimension']}: 요구 {g['n']}개(필수 {g['must']}) — {g['summary']}")
        if q.get("eval"):
            print(f"  · 평가 구조: {q['eval']['type']} — {', '.join(q['eval']['signals'])}")
        for c in q["conflicts"]:
            print(f"  · 충돌 [{c['kind']}] {c['note']}")
        answers = {}
        print("\n=== 전략 질문 (Enter = 기본값) ===")
        for item in q["questions"]:
            print(f"\n{item['question']}")
            for k, o in enumerate(item["options"], 1):
                print(f"   {k}) {o}")
            raw = input(f"   답 [{item['default']}]: ").strip()
            if raw.isdigit() and 1 <= int(raw) <= len(item["options"]):
                raw = item["options"][int(raw) - 1]
            if raw == "값을 입력":  # 빈 정보 질문 — 값을 받아 요구사항 · 수치 근거로 쓴다
                raw = input("   값: ").strip()
            answers[item["id"]] = raw or item["default"]
        graph.invoke(Command(resume=answers), config=cfg)
    state = graph.get_state(cfg).values
    fills = current_fills(state)
    out = Path(args.out) if args.out else ROOT / "outputs" / rid
    paths = write_outputs(kb, state, fills, out, title=rid)
    a, rv = state["analysis"], state["review"]
    print(f"\n[{rid}] {a['level_label']} · 업종 {a['industry_name']} · 시나리오 {state['scenario_match'].get('chosen')}")
    cov = f"{rv['req_coverage']:.0%}" if rv["req_total"] else "-"
    chk = f" (+제출 절차 {len(rv['checklist'])}개 별도)" if rv.get("checklist") else ""
    print(f"  요구 {rv['req_total']}개{chk} · 반영 {cov} · 슬라이드 {len(fills)}장 · LLM {llm.mode} ({len(llm.trace)}회) · {time.time() - t0:.1f}s")
    for i in rv["issues"]:
        print(f"  [{i['sev']}] {i['msg']}")
    print(f"  → {paths['preview']}\n  → {paths['proposal']}")


def cmd_interview(args) -> None:
    from .strategy_agent import StrategySession

    kb = get_kb()
    llm = LLM(args.llm)
    if not llm.online:
        sys.exit("interview 는 tool-calling LLM 이 필요합니다 — .env 의 GEMINI_API_KEY 를 확인하세요")
    idx = LayoutIndex(kb)
    graph = build_graph(kb, llm, idx)
    inp, rid = _load_input(args)
    cfg = run_config(f"{rid}-{time.time()}", llm)
    graph.invoke({"input": inp, "options": {}}, config=cfg)
    sess = StrategySession(graph, cfg, kb, idx, llm.chat_model)
    print(sess.chat("분해 결과를 요약하고 첫 질문을 해 주세요."))
    while not sess.finalized:
        msg = input("\n나> ").strip()
        if msg in ("/q", "/quit"):
            return
        print("\n코파일럿> " + sess.chat(msg))
    state = sess.resume()
    fills = current_fills(state)
    out = Path(args.out) if args.out else ROOT / "outputs" / (rid + "-interview")
    print(write_outputs(kb, state, fills, out, title=rid))


def cmd_search(args) -> None:
    kb = get_kb()
    idx = LayoutIndex(kb)
    part = {"id": "S01", "type": args.part or "value", "name": args.query, "items": [], "seed_layouts": [], "req_ids": [], "slides": 1}
    ctx = {"industry": args.ind, "industry_name": kb.ind_name(args.ind), "customer": "고객사", "project": "", "target": "", "products": args.products.split(",") if args.products else [],
           "solutions": args.solutions.split(",") if args.solutions else [], "cases": [], "spaces": []}
    analysis = {"requirements": [], "keymen": [], "goals": [], "facts": [], "req_type": None, "context_level": "ambiguous"}
    r = rank_slide(kb, idx, part, 0, ctx, analysis, available_info(analysis, ctx), "ambiguous", args.strategy)
    for c in r["candidates"][: args.k]:
        card = kb.cards[c["f"]]
        print(f"{c['score']:6.2f}  {c['f']:14s} {c['code']:10s} {card['name'][:28]:28s} | {' / '.join(c['why'][:3])}")


def main() -> None:
    ap = argparse.ArgumentParser(prog="winmate_layout")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("run", "interview"):
        p = sub.add_parser(name)
        g = p.add_mutually_exclusive_group(required=True)
        g.add_argument("--case")
        g.add_argument("--input")
        p.add_argument("--llm", default=None, help="offline | gemini | auto(기본: 키가 있으면 gemini)")
        p.add_argument("--out", default="")
        if name == "run":
            p.add_argument("--ask", action="store_true", help="복잡(③)일 때 질문에 직접 답하기(기본은 기본값으로 진행)")
    s = sub.add_parser("search")
    s.add_argument("query")
    s.add_argument("--part", default="")
    s.add_argument("--ind", default=None)
    s.add_argument("--products", default="")
    s.add_argument("--solutions", default="")
    s.add_argument("--strategy", default=None)
    s.add_argument("-k", type=int, default=10)
    args = ap.parse_args()
    {"run": cmd_run, "interview": cmd_interview, "search": cmd_search}[args.cmd](args)


if __name__ == "__main__":
    main()
