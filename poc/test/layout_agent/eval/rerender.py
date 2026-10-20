"""저장된 state.json 으로 미리보기 · 리포트를 다시 만든다(LLM 을 다시 부르지 않는다).

  python eval/rerender.py live-gemini-cases            # eval/reports/<name>/cases/*/ 를 다시 렌더
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from winmate_layout.kb import get_kb  # noqa: E402
from winmate_layout.render import write_outputs  # noqa: E402


def main() -> None:
    kb = get_kb()
    for name in sys.argv[1:]:
        n = 0
        for d in sorted((HERE / "reports" / name / "cases").iterdir()):
            sp = d / "state.json"
            if not sp.exists():
                continue
            st = json.loads(sp.read_text(encoding="utf-8"))
            fills = st.pop("fills")
            tc = next((p for sub in ("cases", "holdout", "holdout2") for p in [HERE / sub / f"{d.name}.json"] if p.exists()), None)
            tcd = json.loads(tc.read_text(encoding="utf-8")) if tc else {}
            title = d.name + (" · " + tcd["title"] if tcd else "")
            if not st.get("input"):
                st["input"] = dict(tcd.get("input", {}), id=tcd.get("input", {}).get("id") or d.name)
            write_outputs(kb, st, fills, d, title=title)
            n += 1
        print(f"[rerender] {name}: {n}")


if __name__ == "__main__":
    main()
