"""여러 번에 나눠 돌린 평가(예: Gemini 로 TC 몇 개씩)를 하나의 리포트로 합친다.

  python eval/merge_reports.py --out live-gemini-cases live-gemini-cases-b1 live-gemini-cases-b2 ...
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from run_eval import summarize, to_md  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("parts", nargs="+")
    args = ap.parse_args()
    rows, trace, meta = [], [], {}
    out = HERE / "reports" / args.out
    (out / "cases").mkdir(parents=True, exist_ok=True)
    for name in args.parts:
        d = HERE / "reports" / name
        m = json.loads((d / "metrics.json").read_text(encoding="utf-8"))
        rows += m["rows"]
        meta = m["summary"]
        if (d / "llm_trace.json").exists():
            trace += json.loads((d / "llm_trace.json").read_text(encoding="utf-8"))
        if (d / "cases").exists():
            for c in (d / "cases").iterdir():
                shutil.copytree(c, out / "cases" / c.name, dirs_exist_ok=True)
    rows.sort(key=lambda r: r["id"])
    s = summarize(rows)
    s.update({"name": args.out, "llm": meta.get("llm"), "model": meta.get("model"), "llm_calls": len(trace),
              "llm_fail": sum(1 for t in trace if not t["ok"]), "elapsed_s": round(sum(r.get("sec", 0) for r in rows), 1), "merged_from": args.parts})
    (out / "metrics.json").write_text(json.dumps({"summary": s, "rows": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "summary.md").write_text(to_md(s, rows), encoding="utf-8")
    if trace:
        (out / "llm_trace.json").write_text(json.dumps(trace, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[merge] {len(rows)} TC · overall={s['overall']:.3f} by level={s['by_level']} · LLM {len(trace)} calls ({s['llm_fail']} failed) → {out}")


if __name__ == "__main__":
    main()
