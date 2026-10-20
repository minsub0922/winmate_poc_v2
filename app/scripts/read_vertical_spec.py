#!/usr/bin/env python3
"""Extract one supplied OOXML Markdown specification at a time, preserving source objects."""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def js_after(block, label, default=None):
    m = re.search(re.escape(label) + r"[^`\n]*`([^`\n]+)`", block)
    if not m:
        return default
    try:
        return json.loads(m[1])
    except json.JSONDecodeError:
        return default


def parse(path):
    raw = path.read_text()
    count = int(re.search(r"- 슬라이드: \*\*(\d+)장", raw)[1])
    dimensions = re.search(r"= `([\d.]+) × ([\d.]+) pt`", raw)
    asset_map = {m[1]: {"name": m[2], "path": m[3]} for m in re.finditer(r"^\| (A\d+) \| `([^`]+)` \| \[원본\]\(<([^>]+)>\)", raw, re.M)}
    pages = []
    matches = list(re.finditer(r"^### 시트 (\d+) — (.*)$", raw, re.M))
    for i, m in enumerate(matches):
        block = raw[m.start():matches[i + 1].start() if i + 1 < len(matches) else len(raw)]
        objects = []
        mm = list(re.finditer(r"^##### 개체 #([^\s]+) — (.*)$", block, re.M))
        for j, om in enumerate(mm):
            ob = block[om.start():mm[j + 1].start() if j + 1 < len(mm) else len(block)]
            # The last object also precedes OCR prose; never treat OCR as editable text.
            ob = ob.split("#### 이미지 포함 문구")[0].split("#### 시트 완성 대조")[0]
            actual = re.search(r"- 실제 내용[^\n]*\n\n````text\n(.*?)\n````", ob, re.S)
            asset = re.search(r"- 원본 자산: \[([^]]+)\]\(<([^>]+)>\).*?SHA-256 `([^`]+)`", ob)
            coord = re.search(r"슬라이드 최종 좌표\(%\): `([^`]+)`; 부모: `([^`]+)`; 형제 z: `([^`]+)`", ob)
            table=None
            tm=re.search(r"- 표 행 높이\(EMU\): `([^`]+)`; 열 폭\(EMU\): `([^`]+)`",ob)
            if tm:
                cells=[]
                for line in ob.splitlines():
                    if not re.match(r'^\| \d+, \d+ \|',line):continue
                    row=[x.strip() for x in re.split(r'(?<!\\)\|',line)[1:-1]]
                    if len(row)!=4:raise ValueError(f'{path.name}: malformed table cell')
                    rr,cc=map(int,row[0].split(','));parts=row[2].split(' / ')
                    cells.append(dict(row=rr-1,col=cc-1,text=row[1].replace('<br>','\n').replace(r'\|','|'),
                                      hidden=parts[1]=='True',colspan=int(parts[2]),rowspan=int(parts[3]),style=json.loads(row[3])))
                table=dict(rows=json.loads(tm[1]),cols=json.loads(tm[2]),cells=cells)
            objects.append({
                "id": om[1], "name": om[2], "text": actual[1] if actual else None,
                "bbox_pct": json.loads(coord[1]) if coord else None,
                "parent": coord[2] if coord else None, "z": coord[3] if coord else None,
                "geometry": js_after(ob, "- 도형 기하·채움·윤곽선·효과:"),
                "bodyPr": js_after(ob, "- 텍스트 상자 bodyPr"),
                "listStyle": js_after(ob, "- 상자 기본 문단 스타일:"),
                "asset": {"name": asset[1], "path": asset[2], "sha256": asset[3]} if asset else None,
                "crop": js_after(ob, "crop(원본 대비 비율):"),
                "table":table,
                "source_detail": ob.strip(),
            })
        if not mm:
            texts = {tm[1]: {"style": tm[2], "text": tm[3]} for tm in re.finditer(r"\*\*T#(\d+)\*\*([^\n]*)\n\n````text\n(.*?)\n````", block, re.S)}
            for line in block.split("#### 실제 문구 전체")[0].splitlines():
                if not re.match(r"^\| \d+ \|", line):
                    continue
                row = [v.strip() for v in line.split("|")[1:-1]]
                if len(row) != 5:
                    raise ValueError(f"{path.name}/{m[1]}: unsupported object row")
                ident, parent_z, kind, coords, style = row
                parent, z = parent_z.rsplit("/", 1)
                asset_id = re.search(r"\bA\d+\b", style)
                objects.append({"id": ident, "name": kind, "text": texts.get(ident, {}).get("text"),
                                "bbox_pct": [float(v) for v in coords.split(",")], "parent": parent, "z": z,
                                "geometry": None, "bodyPr": None, "listStyle": None,
                                "asset": asset_map.get(asset_id[0]) if asset_id else None,
                                "crop": None, "source_detail": style, "text_style_summary": texts.get(ident, {}).get("style")})
        role = re.search(r"\*\*시트의 역할: (.*?)\.\*\*", block)
        pages.append({"number": int(m[1]), "title": m[2], "role": role[1] if role else "",
                      "hidden": "상태: **숨김**" in block or bool(re.search(r"^- 숨김;", block, re.M)), "objects": objects,
                      "source_line": raw.count("\n", 0, m.start()) + 1,
                      "layout_notes": block.split("#### 레이아웃 읽기와 재현 순서")[-1].split("#### 전체 개체")[0].strip()})
    if [p["number"] for p in pages] != list(range(1, count + 1)):
        raise ValueError(f"{path}: slide count/order mismatch")
    refs = sorted(set(re.findall(r"_assets/[^<>\s`\])]+", raw)))
    return {"key": path.stem, "source": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(raw.encode()).hexdigest(),
            "name": raw.splitlines()[0].removeprefix("# ").split(" — ")[0], "slide_count": count,
            "source_pt": [float(dimensions[1]), float(dimensions[2])] if dimensions else None,
            "preamble": raw.split("## 3. 전체 시트 구성")[0], "pages": pages,
            "missing_assets": [r for r in refs if not (path.parent / r).is_file()]}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("file", type=Path)
    ap.add_argument("--out", type=Path, default=ROOT / "output/vertical-scenarios/sources")
    args = ap.parse_args()
    result = parse(args.file.resolve())
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / (result["key"] + ".json")).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"key": result["key"], "slides": result["slide_count"], "objects": sum(len(p["objects"]) for p in result["pages"]),
                      "missing_assets": len(result["missing_assets"]),
                      "flow": [(p["number"], p["title"]) for p in result["pages"]]}, ensure_ascii=False))
