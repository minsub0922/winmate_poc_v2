"""winmatev2 본 프로젝트의 원천 데이터를 test/data/source 로 동기화한다.

- data/catalog.json        : 레이아웃 446 · 제품 40 · 솔루션 17 · 사례 218 · 업종 16
- src/photo_layouts.js · std_layouts.js : 사진 중심 레이아웃(L_PH_*) · 표준 제안서(L_AIS_*) — 메타 + HTML 을 catalog · layout_html 에 합친다
- src/data.js · retired.js : RETIRED(사진 버전으로 대체돼 고르기에서 빠진 텍스트 장) → layout["retired"] = 대체한 f
- data/layouts.b64         : 레이아웃 HTML (gzip+base64) → layout_html.json 으로 풀어서 저장
- data/images.json         : 이미지 DB
- src/parts.js             : Storyboard 파트 24종 · NEXT · RELATED · REQ_LABEL  (node 로 import → JSON)
- src/scenarios.js         : Best Scenario 20개 · REQ_TYPES · STRATEGIES · ENDINGS · STAGES

사용: python scripts/sync_source.py [--root ../..]
node 가 없으면 parts/scenarios 는 기존 JSON 을 그대로 둔다(커밋된 JSON 사용).
"""
from __future__ import annotations

import argparse
import sys
import base64
import gzip
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "data" / "source"

NODE_DUMP = r"""
const parts = await import(process.argv[2]);
const sc = await import(process.argv[3]);
const out = {
  parts: { PARTS: parts.PARTS, NEXT: parts.NEXT, RELATED: parts.RELATED, REQ_LABEL: parts.REQ_LABEL },
  scenarios: { REQ_TYPES: sc.REQ_TYPES, REQ_ORDER: sc.REQ_ORDER, STRATEGIES: sc.STRATEGIES, ENDINGS: sc.ENDINGS, STAGES: sc.STAGES, SCENARIOS: sc.SCENARIOS },
};
process.stdout.write(JSON.stringify(out));
"""


def dump_js(root: Path) -> dict | None:
    node = shutil.which("node")
    if not node:
        print("[sync] node 없음 — parts/scenarios JSON 은 기존 파일 유지")
        return None
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        # scenarios.js / parts.js 는 ESM 이지만 확장자가 .js 라서 .mjs 로 복사해 import
        pm = td / "parts.mjs"
        sm = td / "scenarios.mjs"
        pm.write_text((root / "src" / "parts.js").read_text(encoding="utf-8"), encoding="utf-8")
        sm.write_text((root / "src" / "scenarios.js").read_text(encoding="utf-8"), encoding="utf-8")
        runner = td / "dump.mjs"
        runner.write_text(NODE_DUMP, encoding="utf-8")
        res = subprocess.run([node, str(runner), pm.as_uri(), sm.as_uri()], capture_output=True, text=True, check=True)
        return json.loads(res.stdout)


def _js_const(src: str, name: str):
    """`export const NAME = <JSON>;` 를 읽는다(사진 · 표준 레이아웃 모듈은 JSON 리터럴로 생성된다)."""
    i = src.index(f"export const {name} = ") + len(f"export const {name} = ")
    dec = json.JSONDecoder()
    val, _ = dec.raw_decode(src[i:])
    return val


def _retired(root: Path) -> dict:
    """data.js RETIRED (+ retired.js RETIRED_R4) — 사진 버전으로 대체돼 고르기 · 추천에서 빠진 텍스트 레이아웃 → 대체한 f."""
    import re
    out = {}
    for mod in ("retired.js", "data.js"):
        fp = root / "src" / mod
        if not fp.exists():
            continue
        src = fp.read_text(encoding="utf-8")
        m = re.search(r"export const RETIRED(?:_R4)? = \{(.*?)\n\};", src, re.S)
        if not m:
            continue
        for a, b in re.findall(r"[\"']?(L_[A-Za-z0-9_]+)[\"']?\s*:\s*[\"'](L_[A-Za-z0-9_]+)[\"']", m.group(1)):
            out[a] = b
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    sys.path.insert(0, str(HERE))
    from winmate_layout.config import APP_ROOT

    ap.add_argument("--root", default=str(APP_ROOT), help="winmatev2 루트 (기본: img/ · src/ 가 있는 가장 가까운 상위 폴더)")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    OUT.mkdir(parents=True, exist_ok=True)

    cat = json.loads((root / "data" / "catalog.json").read_text(encoding="utf-8"))
    b64 = (root / "data" / "layouts.b64").read_text(encoding="utf-8").strip()
    html = json.loads(gzip.decompress(base64.b64decode(b64)))
    n_base = len(cat["layouts"])
    # 앱 라이브러리 = catalog 레이아웃 + 사진 중심(photo_layouts.js) + 표준 제안서(std_layouts.js) — data.js ALL_LAYOUTS 와 같은 순서
    for mod, meta_name, html_name in (("photo_layouts.js", "PHOTO_META", "PHOTO_HTML"), ("std_layouts.js", "STD_META", "STD_HTML")):
        fp = root / "src" / mod
        if not fp.exists():
            continue
        src = fp.read_text(encoding="utf-8")
        meta = _js_const(src, meta_name)
        cat["layouts"].extend(meta)
        html.update(_js_const(src, html_name))
    retired = _retired(root)
    for l in cat["layouts"]:
        if l["f"] in retired:
            l["retired"] = retired[l["f"]]
    (OUT / "catalog.json").write_text(json.dumps(cat, ensure_ascii=False), encoding="utf-8")
    n_ret = sum(1 for l in cat["layouts"] if l.get("retired"))
    print(f"[sync] catalog: layouts={len(cat['layouts'])} (catalog {n_base} + 사진 · 표준 {len(cat['layouts']) - n_base}, 대체돼 빠진 장 {n_ret}) "
          f"products={len(cat['products'])} solutions={len(cat['solutions'])} cases={len(cat['cases'])}")
    with gzip.open(OUT / "layout_html.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(html, fh, ensure_ascii=False)
    print(f"[sync] layout html: {len(html)}")

    shutil.copyfile(root / "data" / "images.json", OUT / "images.json")

    js = dump_js(root)
    if js:
        (OUT / "parts.json").write_text(json.dumps(js["parts"], ensure_ascii=False, indent=1), encoding="utf-8")
        (OUT / "best_scenarios.json").write_text(json.dumps(js["scenarios"], ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"[sync] parts={len(js['parts']['PARTS'])} best scenarios={len(js['scenarios']['SCENARIOS'])}")


if __name__ == "__main__":
    main()
