"""data/layout_cards.jsonl (RAG 용 레이아웃 메타데이터) + 사람이 보는 요약 CSV 생성.

사용: python scripts/build_metadata.py
"""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from winmate_layout.kb import DATA, get_kb  # noqa: E402
from winmate_layout.metadata import build_cards  # noqa: E402


def main() -> None:
    kb = get_kb()
    cards = build_cards(kb)
    out = DATA / "layout_cards.jsonl"
    with out.open("w", encoding="utf-8") as fh:
        for c in cards:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")
    with (DATA / "layout_cards_summary.csv").open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["f", "code", "part", "part2", "ind", "sol", "pc", "capacity", "n_text", "n_image", "visual", "strategy_fit", "req_type_fit", "level_fit", "audience", "needs", "name", "when"])
        for c in cards:
            w.writerow([c["f"], c["code"], c["part"], c["part2"] or "", c["ind"] or "", c["sol"] or "", c["pc"], c["capacity"], c["n_text"], c["n_image"],
                        "|".join(c["visual"]), "|".join(c["strategy_fit"]), "|".join(c["req_type_fit"]), "|".join(c["level_fit"]), c["audience"],
                        "|".join(c["data_needs"]["required"]), c["name"], c["when"]])
    print(f"cards: {len(cards)} → {out}")
    print("level_fit", Counter(x for c in cards for x in c["level_fit"]))
    print("strategy_fit", Counter(x for c in cards for x in c["strategy_fit"]))
    print("req_type_fit", Counter(x for c in cards for x in c["req_type_fit"]))
    print("visual", Counter(x for c in cards for x in c["visual"]))
    print("no strategy", sum(1 for c in cards if not c["strategy_fit"]), "no rtype", sum(1 for c in cards if not c["req_type_fit"]))
    print("capacity", Counter(c["capacity"] for c in cards))


if __name__ == "__main__":
    main()
