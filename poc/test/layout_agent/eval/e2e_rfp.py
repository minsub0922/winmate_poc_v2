"""실제 RFP 원문 → (RFP 요구사항 정리) → 레이아웃 Agent 끝까지 — 두 모듈을 이어 붙인 평가.

  python eval/e2e_rfp.py --tc TC3 --name e2e-rfp                    # Gemini · chunk_carry_gap@1500 (테스트 벤치 기본값)
  python eval/e2e_rfp.py --tc TC3 --name e2e-rfp-roi --answers '{"strategy": "roi"}'

정답은 rfp_pipeline 쪽 tc/rfp_tc.json 의 체크포인트(다른 사람이 만든 정답)를 그대로 쓴다.
  - form_recall   : 정리된 입력 폼에 체크포인트가 들어갔는가 (rfp_pipeline.score 그대로)
  - deck_content  : 내용 체크포인트(규격 · 보안 · 인증 · 범위 · 선정 · 검증 · A/S · 납품 · 구성 · 계약 · 제안서 · 설치 · 자격)가 슬라이드 글자에 보이는가
  - checklist_proc: 절차 체크포인트(일정 · 제출 · 형식 · 가격 · 청렴 · 유의)가 제출 체크리스트에 있는가
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
LA = HERE.parent
TEST_DIR = LA.parent
sys.path.insert(0, str(LA))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(TEST_DIR))

import rfp_pipeline as rp  # noqa: E402
import run_experiment as rx  # noqa: E402
from langgraph.types import Command  # noqa: E402
from metrics import slide_text, stray_terms  # noqa: E402

from winmate_layout.graph import build_graph, current_fills, run_config  # noqa: E402
from winmate_layout.kb import get_kb  # noqa: E402
from winmate_layout.llm import LLM  # noqa: E402
from winmate_layout.render import write_outputs  # noqa: E402
from winmate_layout.retrieval import LayoutIndex  # noqa: E402

PROC = {"일정", "제출", "형식", "가격", "청렴", "유의"}
PH = re.compile(r"\[[^\]\n]{1,24}\]")


def to_layout_input(form: dict, source: str, title: str) -> dict:  # testbench/adapters/rfp.py 와 같은 변환
    return {"id": "rfp_e2e", "title": title or form.get("project", ""), "customer": form.get("customer", ""), "project": form.get("project", ""),
            "target": form.get("target", ""), "free_text": form.get("free", ""), "note": form.get("note", ""),
            "keymen": [{"name": k["name"], "weight": k.get("weight", 0), "reqs": k.get("reqs", [])} for k in form.get("keymen", [])],
            "files": [{"name": "RFP 원문.md", "text": source[:30000]}] if source else []}


def deck_stats(kb, state: dict, fills: list[dict]) -> dict:
    n_text = n_ph = n_img = n_img_filled = kept = 0
    slides = []
    for f in fills:
        card = kb.cards[f["f"]]
        ph = sum(len(PH.findall(v)) for k, v in f["texts"].items() if f["sources"].get(k) != "context")
        imgs = len(card["slots"].get("images", []))
        n_text += f["checks"].get("n_slots", 0)
        n_ph += ph
        kept += f["checks"].get("sample_text_kept", 0)
        n_img += imgs
        n_img_filled += sum(1 for v in (f.get("images") or {}).values() if v.get("file"))
        slides.append({"no": f["no"], "code": f["code"], "f": f["f"], "visual": card.get("visual"), "ph": ph, "img_slots": imgs,
                       "img_filled": sum(1 for v in (f.get("images") or {}).values() if v.get("file")), "kept_sample": f["checks"].get("sample_text_kept", 0),
                       "stray": stray_terms(kb, state, f)})
    photo = sum(1 for s in slides if s["img_slots"] > 0)
    return {"n_slides": len(fills), "text_slots": n_text, "placeholders": n_ph, "slides_with_ph": sum(1 for s in slides if s["ph"]), "sample_text_kept": kept,
            "img_slots": n_img, "img_filled": n_img_filled, "photo_slides": photo, "stray_slides": sum(1 for s in slides if s["stray"]), "slides": slides}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tc", required=True)
    ap.add_argument("--name", default=time.strftime("e2e-%m%d-%H%M"))
    ap.add_argument("--cond", default="chunk_carry_gap")
    ap.add_argument("--max-chars", type=int, default=1500)
    ap.add_argument("--answers", default="", help="전략 인터뷰 답(JSON) — 비우면 기본값")
    ap.add_argument("--cache", default="", help="RFP 단계 LLM 캐시 폴더(비우면 새로 호출)")
    ap.add_argument("--products", default="", help="영업 담당자가 고른 제품 id(쉼표) — 앱에서 제품을 고르는 경우")
    ap.add_argument("--form", default="", help="저장된 RFP 정리 폼(JSON) — 주면 RFP 단계를 건너뛴다(LLM 호출 없음). 'auto' = eval/rfp_forms/<TC>.json")
    ap.add_argument("--llm", default="gemini", help="레이아웃 Agent 백엔드: gemini | offline")
    args = ap.parse_args()

    tcs = json.loads((TEST_DIR / "tc" / "rfp_tc.json").read_text(encoding="utf-8"))["tcs"]
    tc = next(t for t in tcs if t["id"] == args.tc)
    sources = {t["expected"]["projects"][0]["key"]: rp.norm(t["input"]) for t in tcs if t["kind"] == "single"}
    if args.form:
        fp = HERE / "rfp_forms" / f"{tc['id']}.json" if args.form == "auto" else Path(args.form)
        form = json.loads(fp.read_text(encoding="utf-8"))
        ftxt = rp.norm(rp.form_text(form))
        sc = {"recall": None, "per_project": [{"rows": [{"id": c["id"], "hit": any(re.search(x, ftxt) for x in c["any"])}
                                                         for c in tc["expected"]["projects"][0]["checkpoints"]]}]}
        sc["recall"] = round(sum(r["hit"] for r in sc["per_project"][0]["rows"]) / len(sc["per_project"][0]["rows"]), 3)
        res, out, t_rfp = None, {"cost": {"calls": 0}}, 0.0
    else:
        form, res = None, None
    env = rp.load_env()
    cache = Path(args.cache) if args.cache else Path("/tmp") / f"rfpcache-{time.time():.0f}"
    if form is None:
        backend = rx.make_backend("gemini", env, cache, 30)
        if hasattr(backend, "verbose"):
            backend.verbose = False
        t0 = time.time()
        out = rx.run_one(tc, args.cond, args.max_chars, backend, "", sources)
        t_rfp = time.time() - t0
        res, sc = out["res"], out["score"]
        form = res.forms[0]

    kb = get_kb()
    llm = LLM(args.llm)
    graph = build_graph(kb, llm, LayoutIndex(kb))
    inp = to_layout_input(form, tc["input"], tc["title"])
    if args.products:
        inp["products"] = args.products.split(",")
    cfg = run_config(f"e2e-{tc['id']}-{time.time()}", llm)
    t1 = time.time()
    graph.invoke({"input": inp, "options": {}}, config=cfg)
    snap = graph.get_state(cfg)
    payload, answers = None, {}
    if snap.tasks and snap.tasks[0].interrupts:
        payload = snap.tasks[0].interrupts[0].value
        answers = {q["id"]: q["default"] for q in payload["questions"]}
        answers.update(json.loads(args.answers) if args.answers else {})
        graph.invoke(Command(resume=answers), config=cfg)
    state = graph.get_state(cfg).values
    t_layout = time.time() - t1
    fills = current_fills(state)
    od = HERE / "reports" / args.name / tc["id"]
    write_outputs(kb, state, fills, od, title=f"{tc['id']} · {tc['title']}")
    (od / "rfp_form.json").write_text(json.dumps(form, ensure_ascii=False, indent=1), encoding="utf-8")

    deck = rp.norm(slide_text(fills))
    checklist = rp.norm(" ".join(c["text"] for c in state["review"].get("checklist", [])))
    rows = []
    for cp in tc["expected"]["projects"][0]["checkpoints"]:
        cat = cp.get("cat", "")
        in_deck = any(re.search(p, deck) for p in cp["any"])
        in_chk = any(re.search(p, checklist) for p in cp["any"])
        in_form = any(r["id"] == cp["id"] and r["hit"] for r in sc["per_project"][0]["rows"])
        rows.append({"id": cp["id"], "cat": cat, "desc": cp["desc"], "proc": cat in PROC, "form": in_form, "deck": in_deck, "checklist": in_chk})
    content = [r for r in rows if not r["proc"]]
    proc = [r for r in rows if r["proc"]]
    a, ch = state["analysis"], state.get("choice") or {}
    result = {
        "tc": tc["id"], "title": tc["title"], "cond": f"{args.cond}@{args.max_chars}", "preset_products": inp.get("products", []),
        "form_recall": sc["recall"], "form_items": len(res.items) if res else None, "form_lines": sum(len(k["reqs"]) for k in form["keymen"]),
        "deck_content": round(sum(r["deck"] for r in content) / max(1, len(content)), 3),
        "deck_content_given_form": round(sum(r["deck"] for r in content if r["form"]) / max(1, sum(r["form"] for r in content)), 3),
        "checklist_proc": round(sum(r["checklist"] or r["deck"] for r in proc) / max(1, len(proc)), 3),
        "missed_content": [f"{r['id']} {r['desc']}" + ("" if r["form"] else " (폼에도 없음)") for r in content if not r["deck"]],
        "missed_proc": [f"{r['id']} {r['desc']}" for r in proc if not (r["checklist"] or r["deck"])],
        "level": a["context_level"], "industry": a.get("industry"), "strategy": ch.get("strategy"), "answers": answers,
        "questions": [{"id": q["id"], "q": q["question"], "default": q["default"], "options": q["options"]} for q in (payload or {}).get("questions", [])],
        "conflicts": [c.get("kind") for c in (payload or {}).get("conflicts", [])],
        "products": state["ctx"]["products"], "solutions": state["ctx"]["solutions"],
        "parts": [f"{p['type']}:{p['name']}" for p in state["parts"]],
        "review": {"req_total": state["review"]["req_total"], "coverage": state["review"]["req_coverage"],
                   "issues": [f"[{i['sev']}] {i['msg']}" for i in state["review"]["issues"]], "checklist": len(state["review"].get("checklist", []))},
        "stats": deck_stats(kb, state, fills),
        "time": {"rfp_s": round(t_rfp, 1), "layout_s": round(t_layout, 1), "rfp_calls": out["cost"]["calls"], "layout_calls": len(llm.trace),
                 "layout_fail": sum(1 for t in llm.trace if not t["ok"])},
        "rows": rows,
    }
    (od / "e2e.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    s = result["stats"]
    print(f"[{tc['id']}] form_recall={sc['recall']:.3f} deck_content={result['deck_content']:.3f} (폼에 있던 것 중 {result['deck_content_given_form']:.3f}) "
          f"proc={result['checklist_proc']:.3f} | {a['context_level']} {a.get('industry')} strategy={ch.get('strategy')} products={state['ctx']['products']}")
    print(f"  slides={s['n_slides']} ph={s['placeholders']} (slides_with_ph {s['slides_with_ph']}) kept_sample={s['sample_text_kept']} "
          f"photo_slides={s['photo_slides']} img {s['img_filled']}/{s['img_slots']} stray={s['stray_slides']} | rfp {t_rfp:.0f}s layout {t_layout:.0f}s")
    for i in result["review"]["issues"][:6]:
        print("  ", i[:110])
    print("  missed:", "; ".join(result["missed_content"][:12]))


if __name__ == "__main__":
    main()
