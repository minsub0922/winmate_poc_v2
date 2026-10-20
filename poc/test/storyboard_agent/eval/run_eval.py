"""평가 실행 — 과제 × 조건 × 반복 → results/<run>/{outputs.jsonl, summary.json, summary.md}

    python3 eval/make_tasks.py
    python3 eval/run_eval.py --name offline --conds gold,app_rules,copy_best,agent_rules
    python3 eval/run_eval.py --name live --backend gemini --runs 3 --workers 6
    python3 eval/run_eval.py --name live --backend replay --runs 3      # 기록된 응답으로 같은 결과 재현
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

from metrics import compute, scenario_units  # noqa: E402
from sbagent import baselines  # noqa: E402
from sbagent.agent import design  # noqa: E402
from sbagent.brief import build_brief  # noqa: E402
from sbagent.kb import kb  # noqa: E402
from sbagent.llm import make_backend  # noqa: E402

OFFLINE = ["gold", "app_rules", "copy_best", "agent_rules"]
ONLINE = ["app_noref", "app_rawref", "agent_llm", "agent_norepair", "agent_nonote"]
LABEL = {
    "gold": "정답(샘플 히스토리 storyboard)", "app_rules": "앱 규칙(fallbackStoryboard)", "copy_best": "레퍼런스 복제(상위 1개)",
    "agent_rules": "에이전트 · 규칙만", "app_noref": "앱 AI 방식(레퍼런스 없음)", "app_rawref": "LLM + 레퍼런스 원문",
    "agent_llm": "**에이전트 · LLM**", "agent_norepair": "에이전트 · LLM · 수리 없음", "agent_nonote": "에이전트 · LLM · 제작자 의견 없음",
}
GOLD_KEYS = ["type_f1", "order_lcs", "group_cov", "len_diff", "fact_recall", "strategy_acc"]
FREE_KEYS = ["req_cov", "req_cov_w", "req_lex", "sel_cov", "stray", "unsup_num", "copy_rate", "foreign", "valid", "keep_ok", "n_parts"]


def run_one(task: dict, cond: str, run: int, backend, kbx, units) -> dict:
    pr = task["proposal"]
    t0 = time.time()
    strategy = None
    extra: dict = {}
    if cond == "gold":
        if task["kind"] != "cold":
            return {}
        parts = [{**p, "origin": "new"} for p in task["gold"]]
        strategy = (task.get("meta") or {}).get("strategy")
    elif cond == "app_rules":
        parts = baselines.app_rules(pr, kbx)["parts"]
    elif cond == "copy_best":
        r = baselines.copy_best(pr, kbx)
        parts, strategy, extra = r["parts"], r["strategy"], {"ref": r["ref"]}
    elif cond == "agent_rules":
        r = design(pr, None, {"seed": run}, kbx)
        parts, strategy, extra = r["parts"], r["strategy"]["key"], {"trace": r["trace"]["steps"], "issues": [i["code"] for i in r["issues"]]}
    elif cond in ("app_noref", "app_rawref"):
        r = baselines.llm_app(pr, kbx, backend, raw_refs=cond == "app_rawref", seed=run)
        parts, extra = r["parts"], {"llm": r.get("llm"), "error": r.get("error", "")}
    elif cond in ("agent_llm", "agent_norepair", "agent_nonote"):
        opt = {"seed": run, "repair": cond != "agent_norepair", "use_note": cond != "agent_nonote"}
        r = design(pr, backend, opt, kbx)
        parts, strategy = r["parts"], r["strategy"]["key"]
        extra = {"llm": r["llm"], "error": r["error"], "trace": r["trace"]["steps"], "issues_first": [i["code"] for i in r["issues_first"]],
                 "issues": [i["code"] for i in r["issues"]], "thesis": r["thesis"], "refs": [x["id"] for x in r["trace"]["references"]],
                 "situation": r["trace"]["situation"]}
    else:
        raise ValueError(cond)
    b = build_brief(pr, kbx, use_note=cond != "agent_nonote")
    b_metric = build_brief(pr, kbx)  # 지표는 모든 조건에서 같은 입력 기준
    m = compute(task, parts, strategy, b_metric, kbx, units)
    return {"task": task["id"], "kind": task["kind"], "seed": task["seed"], "cond": cond, "run": run, "strategy": strategy,
            "parts": [{k: p.get(k) for k in ("type", "name", "items", "origin", "answers", "ref", "adapted")} for p in parts],
            "metrics": m, "ms": int((time.time() - t0) * 1000), **extra}


def summarize(rows: list[dict], conds: list[str]) -> dict:
    out: dict = {}
    for kind in ("cold", "cont", "open", "open-cont"):
        for c in conds:
            rs = [r for r in rows if r["cond"] == c and r["kind"] == kind]
            if not rs:
                continue
            agg = {}
            for k in GOLD_KEYS + FREE_KEYS:
                vals = [r["metrics"][k] for r in rs if r["metrics"].get(k) is not None]
                if vals:
                    agg[k] = round(statistics.mean(vals), 3)
            runs = sorted({r["run"] for r in rs})
            if len(runs) > 1:
                per = [statistics.mean([r["metrics"]["type_f1"] for r in rs if r["run"] == u and r["metrics"].get("type_f1") is not None] or [0]) for u in runs]
                agg["type_f1_run_sd"] = round(statistics.pstdev(per), 3)
                per2 = [statistics.mean([r["metrics"]["req_cov"] for r in rs if r["run"] == u and r["metrics"].get("req_cov") is not None] or [0]) for u in runs]
                agg["req_cov_run_sd"] = round(statistics.pstdev(per2), 3)
            agg["n"] = len(rs)
            out.setdefault(kind, {})[c] = agg
    return out


def to_md(summary: dict, meta: dict) -> str:
    lines = [f"# Storyboard 에이전트 평가 · {meta['name']}", "", f"- 백엔드 `{meta['backend']}` · 모델 `{meta.get('model', '-')}` · LLM 조건 반복 {meta['runs']}회 · 과제 {meta['n_tasks']}개 · {meta['elapsed_s']}초",
             f"- LLM 호출 {meta.get('calls', 0)}회(캐시 {meta.get('cached', 0)}) · 실패 {meta.get('failed', 0)} · 입력 {meta.get('in_tok', 0):,} / 출력 {meta.get('out_tok', 0):,} 토큰", ""]
    names = {"cold": "처음부터(정답 14)", "cont": "이어서(정답 14 · 뒤쪽 파트와 비교)", "open": "정답 없음 · 처음부터(요구 단계 8)", "open-cont": "정답 없음 · 이어서(작성 중 2)"}
    for kind, rows in summary.items():
        lines += [f"## {names.get(kind, kind)}", ""]
        keys = [k for k in GOLD_KEYS + FREE_KEYS if any(k in v for v in rows.values())]
        lines.append("| 조건 | " + " | ".join(keys) + " | n |")
        lines.append("|---|" + "---|" * (len(keys) + 1))
        for c, v in rows.items():
            lines.append(f"| {LABEL.get(c, c)} | " + " | ".join("" if v.get(k) is None else f"{v[k]:.3f}" if isinstance(v[k], float) else str(v[k]) for k in keys) + f" | {v['n']} |")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--backend", default="offline", choices=["offline", "gemini", "replay"])
    ap.add_argument("--conds", default="")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--only", default="", help="과제 id 일부(쉼표)")
    a = ap.parse_args()
    kbx = kb()
    units = scenario_units(kbx)
    tasks = json.loads((HERE / "tasks.json").read_text(encoding="utf-8"))
    if a.only:
        keys = a.only.split(",")
        tasks = [t for t in tasks if any(k in t["id"] for k in keys)]
    conds = a.conds.split(",") if a.conds else (OFFLINE + (ONLINE if a.backend != "offline" else []))
    backend = make_backend(a.backend, ROOT / "cache") if a.backend != "offline" else None
    jobs = []
    for t in tasks:
        for c in conds:
            reps = a.runs if c in ONLINE else 1
            for u in range(reps):
                jobs.append((t, c, u))
    out_dir = ROOT / "results" / a.name
    out_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    lock = threading.Lock()
    t0 = time.time()
    done = [0]

    def work(j):
        t, c, u = j
        try:
            r = run_one(t, c, u, backend, kbx, units)
        except Exception as e:  # noqa: BLE001
            r = {"task": t["id"], "kind": t["kind"], "seed": t["seed"], "cond": c, "run": u, "error": f"{type(e).__name__}: {e}", "metrics": {}}
        with lock:
            done[0] += 1
            if r:
                rows.append(r)
            if done[0] % 20 == 0:
                print(f"  {done[0]}/{len(jobs)} · {int(time.time() - t0)}s", flush=True)

    with ThreadPoolExecutor(max_workers=a.workers if a.backend != "offline" else 1) as ex:
        list(ex.map(work, jobs))
    rows = [r for r in rows if r.get("metrics")]
    rows.sort(key=lambda r: (r["task"], r["cond"], r["run"]))
    with (out_dir / "outputs.jsonl").open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    summary = summarize(rows, conds)
    calls = backend.calls if backend else []
    meta = {"name": a.name, "backend": a.backend, "model": getattr(backend, "model", None), "runs": a.runs, "n_tasks": len(tasks),
            "elapsed_s": int(time.time() - t0), "calls": len(calls), "cached": sum(c.cached for c in calls), "failed": sum(bool(c.error) for c in calls),
            "in_tok": sum(c.prompt_tokens for c in calls), "out_tok": sum(c.output_tokens for c in calls),
            "errors": [r for r in rows if r.get("error")][:5]}
    (out_dir / "summary.json").write_text(json.dumps({"meta": meta, "summary": summary}, ensure_ascii=False, indent=1), encoding="utf-8")
    md = to_md(summary, meta)
    (out_dir / "summary.md").write_text(md, encoding="utf-8")
    print(md)


if __name__ == "__main__":
    main()
