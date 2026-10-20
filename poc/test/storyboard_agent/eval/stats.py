"""조건 간 차이의 신뢰구간 — 과제 단위 짝지은 bootstrap(반복 실행은 과제 안에서 먼저 평균).

    python3 eval/stats.py --run live-v2 [--base agent_llm] [--n 4000]  → results/<run>/stats.md · stats.json
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
METRICS = {
    "cold": ["type_f1", "order_lcs", "group_cov", "fact_recall", "req_cov_w", "sel_cov", "unsup_num", "copy_rate", "foreign", "valid"],
    "cont": ["type_f1", "order_lcs", "fact_recall", "req_cov_w", "sel_cov", "unsup_num", "copy_rate", "valid"],
    "open": ["req_cov_w", "sel_cov", "unsup_num", "copy_rate", "foreign", "valid"],
}
OTHERS = ["app_noref", "app_rawref", "copy_best", "app_rules", "agent_rules", "agent_norepair", "agent_nonote"]


def per_task(rows, kind, cond, metric):
    acc = defaultdict(list)
    for r in rows:
        if r["kind"] == kind and r["cond"] == cond and r["metrics"].get(metric) is not None:
            acc[r["task"]].append(float(r["metrics"][metric]))
    return {t: statistics.mean(v) for t, v in acc.items()}


def boot(diffs, n, rnd):
    if not diffs:
        return None
    ms = []
    for _ in range(n):
        s = [diffs[rnd.randrange(len(diffs))] for _ in diffs]
        ms.append(sum(s) / len(s))
    ms.sort()
    return statistics.mean(diffs), ms[int(0.025 * n)], ms[int(0.975 * n) - 1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--base", default="agent_llm")
    ap.add_argument("--n", type=int, default=4000)
    a = ap.parse_args()
    d = ROOT / "results" / a.run
    rows = [json.loads(l) for l in (d / "outputs.jsonl").read_text(encoding="utf-8").splitlines()]
    rnd = random.Random(7)
    out: dict = {}
    md = [f"# 짝지은 bootstrap · {a.run} · 기준 `{a.base}` (과제 단위 · 95% 구간 · 반복 {a.n})", "",
          "값 = 기준 − 비교 조건. 구간이 0 을 넘지 않으면 차이가 있다고 본다(*).", ""]
    for kind, mets in METRICS.items():
        md += [f"## {kind}", "", "| 비교 | " + " | ".join(mets) + " |", "|---|" + "---|" * len(mets)]
        for other in OTHERS:
            cells = []
            for m in mets:
                x = per_task(rows, kind, a.base, m)
                y = per_task(rows, kind, other, m)
                common = sorted(set(x) & set(y))
                res = boot([x[t] - y[t] for t in common], a.n, rnd)
                out.setdefault(kind, {}).setdefault(other, {})[m] = res and {"diff": res[0], "lo": res[1], "hi": res[2], "n": len(common)}
                if res is None:
                    cells.append("")
                else:
                    sig = "*" if res[1] > 0 or res[2] < 0 else ""
                    cells.append(f"{res[0]:+.3f} [{res[1]:+.3f}, {res[2]:+.3f}]{sig}")
            if any(cells):
                md.append(f"| − {other} | " + " | ".join(cells) + " |")
        md.append("")
    (d / "stats.md").write_text("\n".join(md), encoding="utf-8")
    (d / "stats.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
