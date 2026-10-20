"""독립 심사용 묶음 — 과제마다 storyboard 후보를 이름을 가리고 섞어서 markdown 으로 만든다.

    python3 eval/judge_pack.py --run live-v2 --out judge/ [--seed 7 --tag b]   → judge/batch_1.md … · judge/key.json(정답 키 · 심사자에게 주지 않음)
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from sbagent.baselines import app_req_text, ctx_summary  # noqa: E402
from sbagent.kb import kb  # noqa: E402

CANDS = {"cold": ["gold", "agent_llm", "app_noref", "app_rawref", "copy_best"], "open": ["agent_llm", "app_noref", "app_rawref", "copy_best"]}


def render(parts: list[dict], K) -> str:
    out = []
    for i, p in enumerate(parts, 1):
        label = K.PARTS.get(p["type"], {}).get("label", p["type"])
        out.append(f"{i}. **{p.get('name') or label}** ({label})")
        for x in p.get("items") or []:
            out.append(f"   - {x}")
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--out", default="judge")
    ap.add_argument("--batches", type=int, default=3)
    ap.add_argument("--seed", type=int, default=20261018, help="후보 순서 섞기 — 심사자마다 다르게 주면 자리 편향을 줄인다")
    ap.add_argument("--tag", default="", help="파일 이름 앞붙이(batch_<tag>1.md)")
    a = ap.parse_args()
    K = kb()
    rows = [json.loads(l) for l in (ROOT / "results" / a.run / "outputs.jsonl").read_text(encoding="utf-8").splitlines()]
    tasks = {t["id"]: t for t in json.loads((HERE / "tasks.json").read_text(encoding="utf-8"))}
    pick = {}
    for r in rows:
        if r["kind"] in CANDS and r["cond"] in CANDS[r["kind"]] and r["run"] == 0:
            pick[(r["task"], r["cond"])] = r
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    key: dict = {}
    sections = []
    rnd = random.Random(a.seed)
    for tid, t in tasks.items():
        if t["kind"] not in CANDS:
            continue
        conds = [c for c in CANDS[t["kind"]] if (tid, c) in pick]
        letters = list("ABCDE")[: len(conds)]
        order = conds[:]
        rnd.shuffle(order)
        key[tid] = dict(zip(letters, order))
        pr = t["proposal"]
        txt = [f"## 과제 {tid.split(':')[0]}", "", "### 고객 입력", "", "```", ctx_summary(pr, K)[:12000], "```", ""]
        for L, c in zip(letters, order):
            txt += [f"### 후보 {L}", "", render(pick[(tid, c)]["parts"], K), ""]
        sections.append((tid, "\n".join(txt)))
    n = a.batches
    for b in range(n):
        chunk = sections[b::n]
        head = ["# Storyboard 심사 묶음 %d" % (b + 1), "",
                "각 과제는 한 고객의 입력(요구사항 · 선택한 제품/솔루션/사례)과 그 고객을 위해 만든 제안서 storyboard 후보 여러 개입니다.",
                "후보는 순서가 섞여 있고 누가 만들었는지 알 수 없습니다.", ""]
        (out / f"batch_{a.tag}{b + 1}.md").write_text("\n".join(head + [s for _, s in chunk]), encoding="utf-8")
    (out / f"key{('_' + a.tag) if a.tag else ''}.json").write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(sections), "tasks →", n, "batches")


if __name__ == "__main__":
    main()
