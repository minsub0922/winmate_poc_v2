"""CLI — 제안서 하나로 storyboard 설계.

    python3 -m sbagent --seed p_case_f7                    # 히스토리 샘플 · 규칙(오프라인)
    python3 -m sbagent --seed p_case_f6 --keep 4 --backend gemini   # 앞 4파트를 이전 storyboard 로 두고 이어서
    python3 -m sbagent --proposal my.json --backend gemini --strategy pain --out sb.json
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

from .agent import design, to_app_parts
from .kb import STRATEGY_LABELS, kb
from .llm import make_backend

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    ap = argparse.ArgumentParser(prog="sbagent")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--seed", help="data/seeds.json 의 제안서 id (예: p_case_f7)")
    g.add_argument("--proposal", help="앱 제안서 JSON 파일")
    ap.add_argument("--keep", type=int, default=None, help="--seed 일 때 앞쪽 N 파트만 이전 storyboard 로 남김(0 = 처음부터)")
    ap.add_argument("--backend", default="offline", choices=["offline", "gemini", "replay"])
    ap.add_argument("--strategy", choices=list(STRATEGY_LABELS), help="사용자가 고른 전략")
    ap.add_argument("--mode", default="continue", choices=["continue", "redesign"])
    ap.add_argument("--out", help="결과 JSON 저장")
    a = ap.parse_args()
    if a.seed:
        seeds = {p["id"]: p for p in json.loads((ROOT / "data" / "seeds.json").read_text(encoding="utf-8"))}
        if a.seed not in seeds:
            sys.exit("없는 id: " + a.seed + " — 가능한 id: " + ", ".join(seeds))
        pr = copy.deepcopy(seeds[a.seed])
        story = [p for p in pr.get("parts") or [] if not p.get("deck")]
        pr["parts"] = story[: a.keep] if a.keep is not None else []
    else:
        pr = json.loads(Path(a.proposal).read_text(encoding="utf-8"))
    out = design(pr, make_backend(a.backend, ROOT / "cache"), {"strategy": a.strategy, "mode": a.mode}, kb())
    st = out["strategy"]
    print(f"\n{pr.get('title', '')}\n전략: {STRATEGY_LABELS.get(st['key'], st['key'])} (다른 후보: {', '.join(STRATEGY_LABELS.get(x, x) for x in st['alternatives'])}) · 결말: {out['ending']}")
    if out["thesis"]:
        print("한 줄: " + out["thesis"])
    print("레퍼런스: " + ", ".join(f"{r['id']}({r['score']})" for r in out["trace"]["references"]))
    for i, p in enumerate(out["parts"], 1):
        tag = "유지" if p["origin"] == "kept" else "새로"
        print(f"\n{i:>2}. [{tag}] {p['type']:<12} {p['name']}" + (f"   ← {p['ref']}" if p.get("ref") else ""))
        for x in p.get("items") or []:
            print("      · " + x)
        if p.get("answers"):
            print("      답하는 요구: " + ", ".join(p["answers"]))
    print("\n단계: " + " → ".join(out["trace"]["steps"]))
    if out["issues"]:
        print("남은 문제: " + "; ".join(i["detail"] for i in out["issues"]))
    if a.out:
        Path(a.out).write_text(json.dumps({**out, "app_parts": to_app_parts(out)}, ensure_ascii=False, indent=1), encoding="utf-8")
        print("저장: " + a.out)


if __name__ == "__main__":
    main()
