"""독립 심사 결과 집계 — 심사자 점수(scores_<tag><n>.json)와 정답 키(key_<tag>.json)를 맞춰 조건별로 모은다.

    python3 eval/judge_score.py --scores judge/ --keys keys/ --tags a,b --out results/live-v2/judge.md
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
from collections import defaultdict
from itertools import combinations
from pathlib import Path

CRIT = ["req", "flow", "fit", "fact", "use"]
LABEL = {"gold": "정답(샘플 히스토리)", "agent_llm": "**에이전트 · LLM**", "app_noref": "앱 AI 방식(레퍼런스 없음)", "app_rawref": "LLM + 레퍼런스 원문",
         "copy_best": "레퍼런스 복제"}


def spearman(a: list[float], b: list[float]) -> float | None:
    n = len(a)
    if n < 3:
        return None
    def rk(x):
        o = sorted(range(n), key=lambda i: x[i])
        r = [0.0] * n
        for pos, i in enumerate(o):
            r[i] = pos
        return r
    ra, rb = rk(a), rk(b)
    ma, mb = statistics.mean(ra), statistics.mean(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return num / den if den else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scores", required=True)
    ap.add_argument("--keys", required=True)
    ap.add_argument("--tags", default="a,b")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    # rows: (tag, task, kind, cond) → scores
    S: dict = {}
    for tag in a.tags.split(","):
        key = json.loads((Path(a.keys) / f"key_{tag}.json").read_text(encoding="utf-8"))
        merged: dict = {}
        for f in sorted(Path(a.scores).glob(f"scores_{tag}*.json")):
            merged.update(json.loads(f.read_text(encoding="utf-8")))
        for tid, letters in key.items():
            short, kind = tid.split(":")
            got = merged.get(short) or merged.get(tid)
            if not got:
                print("빠짐:", tag, tid)
                continue
            for L, cond in letters.items():
                if L in got:
                    S[(tag, tid, kind, cond)] = got[L]
    tags = a.tags.split(",")
    md = ["# 독립 심사 결과", "", f"심사자 {len(tags)}벌(후보 순서를 달리 섞은 같은 과제 묶음) × 3묶음 · 1~5점 · 순위 1 = 최고", ""]
    out_json: dict = {}
    rnd = random.Random(11)
    for kind in ["cold", "open"]:
        conds = sorted({k[3] for k in S if k[2] == kind}, key=lambda c: list(LABEL).index(c) if c in LABEL else 99)
        tasks = sorted({k[1] for k in S if k[2] == kind})
        md += [f"## {kind} · 과제 {len(tasks)}개", "", "| 조건 | " + " | ".join(CRIT) + " | 평균 순위 | 1위 비율 |", "|---|" + "---|" * (len(CRIT) + 2)]
        for c in conds:
            vals = [S[k] for k in S if k[2] == kind and k[3] == c]
            row = [f"{statistics.mean(v[m] for v in vals):.2f}" for m in CRIT]
            rank = statistics.mean(v["rank"] for v in vals)
            first = sum(1 for v in vals if v["rank"] == 1) / len(vals)
            md.append(f"| {LABEL.get(c, c)} | " + " | ".join(row) + f" | {rank:.2f} | {first:.0%} |")
            out_json.setdefault(kind, {})[c] = {**{m: statistics.mean(v[m] for v in vals) for m in CRIT}, "rank": rank, "first": first, "n": len(vals)}
        md.append("")
        # 에이전트 vs 다른 조건 — 과제별(심사자 평균) 차이 bootstrap · 승률
        md += ["에이전트 − 비교 조건 (과제 단위 bootstrap 95% · `use` 점수와 순위) · 승/무/패는 심사자 × 과제 순위 비교", "",
               "| 비교 | use 차이 | 순위 차이(− 가 좋음) | 승 / 패 |", "|---|---|---|---|"]
        for c in conds:
            if c == "agent_llm":
                continue
            du, dr, w, l = [], [], 0, 0
            for t in tasks:
                xa = [S[(g, t, kind, "agent_llm")] for g in tags if (g, t, kind, "agent_llm") in S]
                xb = [S[(g, t, kind, c)] for g in tags if (g, t, kind, c) in S]
                if not xa or not xb:
                    continue
                du.append(statistics.mean(v["use"] for v in xa) - statistics.mean(v["use"] for v in xb))
                dr.append(statistics.mean(v["rank"] for v in xa) - statistics.mean(v["rank"] for v in xb))
                for g in tags:
                    if (g, t, kind, "agent_llm") in S and (g, t, kind, c) in S:
                        if S[(g, t, kind, "agent_llm")]["rank"] < S[(g, t, kind, c)]["rank"]:
                            w += 1
                        else:
                            l += 1
            def ci(d):
                ms = sorted(statistics.mean(d[rnd.randrange(len(d))] for _ in d) for _ in range(3000))
                return statistics.mean(d), ms[75], ms[2924]
            u, r = ci(du), ci(dr)
            md.append(f"| − {LABEL.get(c, c)} | {u[0]:+.2f} [{u[1]:+.2f}, {u[2]:+.2f}] | {r[0]:+.2f} [{r[1]:+.2f}, {r[2]:+.2f}] | {w} / {l} |")
            out_json.setdefault(kind + "_vs", {})[c] = {"use": u, "rank": r, "win": w, "loss": l}
        md.append("")
        # 심사자 간 일치 — 같은 과제의 순위 상관
        if len(tags) >= 2:
            rs = []
            for t in tasks:
                for g1, g2 in combinations(tags, 2):
                    cs = [c for c in conds if (g1, t, kind, c) in S and (g2, t, kind, c) in S]
                    r = spearman([S[(g1, t, kind, c)]["rank"] for c in cs], [S[(g2, t, kind, c)]["rank"] for c in cs])
                    if r is not None:
                        rs.append(r)
            if rs:
                md += [f"심사자 간 순위 일치(과제별 Spearman 평균): {statistics.mean(rs):.2f} (과제 {len(rs)}개)", ""]
                out_json.setdefault(kind + "_agree", statistics.mean(rs))
    # 심사자 메모 — 에이전트 후보에 남긴 것
    md += ["## 심사자 메모(에이전트 후보)", ""]
    for k in sorted(S):
        if k[3] == "agent_llm" and S[k].get("note"):
            md.append(f"- {k[1].split(':')[0]} ({k[0]}) 순위 {S[k]['rank']}: {S[k]['note']}")
    md += ["", "## 심사자 메모(정답 · 샘플 히스토리)", ""]
    for k in sorted(S):
        if k[3] == "gold" and S[k].get("note"):
            md.append(f"- {k[1].split(':')[0]} ({k[0]}) 순위 {S[k]['rank']}: {S[k]['note']}")
    Path(a.out).write_text("\n".join(md), encoding="utf-8")
    Path(a.out).with_suffix(".json").write_text(json.dumps(out_json, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(md[:80]))


if __name__ == "__main__":
    main()
