"""히스토리 샘플(data/seeds.json) → 평가 과제 eval/tasks.json

- cold  : storyboard 가 있는 샘플 14건 — 요구 · 선택 · 업종만 주고 처음부터 설계. 정답 = 그 storyboard
- cont  : 같은 14건 — 앞쪽 절반(올림, 최소 2) 파트를 이전 storyboard 로 주고 나머지 설계. 정답 = 뒤쪽 파트
- open  : storyboard 가 없는 요구 단계 샘플 8건(처음부터) + 작성 중인 A 커피 · E 오피스(이어서) — 정답 없음
"""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEEDS = HERE.parent / "data" / "seeds.json"
GOLD = ["p_case_f1", "p_case_f2", "p_case_f3", "p_case_f4", "p_case_f5", "p_case_f6", "p_case_f7", "p_case_f8",
        "p_case_p1", "p_case_p2", "p_case_p3", "p_case_p4", "p_case_p5", "p_case_s1"]
OPEN_CONT = ["p_seed_acoffee", "p_seed_eoffice"]


def story(p: dict) -> list[dict]:
    return [x for x in p.get("parts") or [] if not x.get("deck") and x.get("type") != "cover"]


def strip(p: dict) -> dict:
    q = copy.deepcopy(p)
    for k in ("reqText", "meta", "createdAt", "updatedAt", "exportedAt", "stage"):
        q.pop(k, None)
    return q


def main() -> None:
    seeds = {p["id"]: p for p in json.loads(SEEDS.read_text(encoding="utf-8"))}
    tasks = []
    for sid in GOLD:
        p = seeds[sid]
        gold = [{"type": x["type"], "name": x["name"], "items": x.get("items") or []} for x in story(p)]
        base = strip(p)
        cold = copy.deepcopy(base)
        cold["parts"] = []
        tasks.append({"id": f"{sid}:cold", "seed": sid, "kind": "cold", "proposal": cold, "gold": gold, "meta": p.get("meta")})
        k = max(2, math.ceil(len(gold) / 2))
        cont = copy.deepcopy(base)
        cont["parts"] = copy.deepcopy(story(p)[:k])
        tasks.append({"id": f"{sid}:cont", "seed": sid, "kind": "cont", "proposal": cont, "gold": gold[k:], "gold_full": gold, "prefix": k, "meta": p.get("meta")})
    for sid, p in seeds.items():
        if sid in GOLD:
            continue
        if not story(p):
            t = strip(p)
            t["parts"] = []
            tasks.append({"id": f"{sid}:open", "seed": sid, "kind": "open", "proposal": t, "gold": None, "meta": p.get("meta")})
        elif sid in OPEN_CONT:
            t = strip(p)
            t["parts"] = copy.deepcopy(story(p))
            tasks.append({"id": f"{sid}:open-cont", "seed": sid, "kind": "open-cont", "proposal": t, "gold": None, "prefix": len(story(p)), "meta": p.get("meta")})
    (HERE / "tasks.json").write_text(json.dumps(tasks, ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    print(len(tasks), Counter(t["kind"] for t in tasks))


if __name__ == "__main__":
    main()
