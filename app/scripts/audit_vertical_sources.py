#!/usr/bin/env python3
"""Read vertical specifications, one file at a time, without registering incomplete decks.

--source-root must contain the assets/ directory referenced by the Markdown files.
The output is preparation evidence, not a scenario/fill or a verified layout match.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
FILES = (
    "business_hotel_lite.md", "postpartum_case_lite.md", "small_hosing_lite.md",
    "small_public_layout.md", "smart_church_layout.md", "smart_finance_layout.md",
    "smart_retail_layout_prompt.md", "smart_university_layout.md",
)
# These identify nearby existing layouts, not approved replacements. Slot count,
# coordinates, decoration, crop and original assets still require comparison.
SO_CANDIDATES = {
    "SO-L01": ["L_SOL_01"], "SO-L02": ["L_SOL_02"],
    "SO-L03": ["L_SOL_03"], "SO-L04": ["L_SOL_04", "L_SOL_09"],
    "SO-L08": ["L_SOL_08"], "SO-L11": ["L_SOL_12"],
    "SO-L13": ["L_SOL_14"], "SO-L14": ["L_SOL_15"],
}


def cells(line: str) -> list[str]:
    return [v.strip().replace(r"\|", "|") for v in re.split(r"(?<!\\)\|", line.strip())[1:-1]]


def tables(text: str) -> list[dict]:
    result = []
    lines = text.splitlines()
    i = 0
    while i + 1 < len(lines):
        if lines[i].startswith("|") and re.fullmatch(r"[\s|:\-]+", lines[i + 1]):
            header = cells(lines[i])
            rows = []
            i += 2
            while i < len(lines) and lines[i].startswith("|"):
                row = cells(lines[i])
                if len(row) != len(header):
                    raise ValueError(f"table width mismatch: {lines[i][:120]}")
                rows.append(dict(zip(header, row)))
                i += 1
            result.append({"columns": header, "rows": rows})
        else:
            i += 1
    return result


def bbox(value: str) -> list[float] | None:
    if re.fullmatch(r"\s*-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?){3}\s*", value):
        return [float(v) for v in value.split(",")]
    return None


def asset_refs(text: str) -> list[str]:
    return sorted(set(re.findall(r"assets/[A-Za-z0-9_./-]+\.(?:json|jpeg|jpg|png|pdf|svg)", text)))


def resolved(ref: str, roots: list[Path]) -> str | None:
    for root in roots:
        path = root / ref
        if path.is_file():
            return str(path.resolve())
    return None


def parse_deck(path: Path, roots: list[Path]) -> dict:
    text = path.read_text()
    declared = re.search(r"\*\*(\d+)페이지 전체\*\*", text)
    if not declared:
        raise ValueError(f"{path.name}: missing declared page count")
    sections = list(re.finditer(r"^### (P\d+)\. (.+)$", text, re.M))
    summary_table = next(t for t in tables(text[:sections[0].start()]) if t["columns"][0] == "페이지")
    summary = {r["페이지"]: r for r in summary_table["rows"]}
    count = int(declared[1])
    expected = [f"P{i:02d}" for i in range(1, count + 1)]
    if [m[1] for m in sections] != expected or list(summary) != expected:
        raise ValueError(f"{path.name}: summary/detail page order disagrees with {count}")
    pages = []
    for i, match in enumerate(sections):
        section = text[match.start():sections[i + 1].start() if i + 1 < len(sections) else len(text)]
        section = re.split(r"^## 5\.", section, maxsplit=1, flags=re.M)[0]
        page_id = match[1]
        instructions = section.split("#### 사진·제품·설명 콘텐츠")[0].strip()
        page_tables = tables(section)
        text_rows, images, panels = [], [], []
        content = {}
        for table in page_tables:
            for row in table["rows"]:
                ident = row.get("ID", "")
                if re.fullmatch(r"P\d+-T\d+-L\d+", ident):
                    target = text_rows
                elif re.fullmatch(r"P\d+-I\d+", ident):
                    target = images
                elif "경로 ID" in row:
                    target = panels
                elif "항목" in row:
                    content[row["항목"]] = row["이 페이지에 반드시 들어갈 콘텐츠"]
                    continue
                else:
                    raise ValueError(f"{path.name}/{page_id}: unknown table row {row}")
                # Preserve source spelling, styles and raw coordinates. Converted
                # coordinates are separate; they do not establish visibility/z-order.
                converted = {}
                for key, value in row.items():
                    rect = bbox(value)
                    if rect is not None:
                        converted[key] = [round(n * 4 / 3, 4) for n in rect]
                target.append({**row, "bbox_1280": converted})
        for rows in (text_rows, images, panels):
            ids = [r.get("ID", r.get("경로 ID")) for r in rows]
            if len(ids) != len(set(ids)):
                raise ValueError(f"{path.name}/{page_id}: duplicate source slots")
        # Do not drop image-only pages; their text exists inside the missing assets.
        image_only = not text_rows
        refs = asset_refs(section)
        missing = [ref for ref in refs if not resolved(ref, roots)]
        common = sorted(set(re.findall(r"SO-[A-Z]\d+", instructions)))
        candidates = sorted({f for key in common for f in SO_CANDIDATES.get(key, [])})
        pages.append({
            "page": page_id, "title": match[2], "source_line": text.count("\n", 0, match.start()) + 1,
            "summary": summary[page_id], "instructions": instructions,
            "content": content, "native_text": text_rows, "image_instances": images,
            "major_panels": panels, "image_only_text": image_only,
            "common_refs": common, "existing_layout_candidates": candidates,
            "verified_layout": None, "missing_assets": missing,
            "geometry_requires_page_bindings": any(not r["bbox_1280"] for r in [*text_rows, *images]),
            "status": "missing_source_assets" if missing else "requires_original_comparison",
        })
    refs = asset_refs(text)
    return {
        "schema": 1, "kind": "source_audit_only", "runtime_registered": False,
        "source": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(text.encode()).hexdigest(),
        "title": text.splitlines()[0].removeprefix("# "), "page_count": count,
        "design_canvas": [960, 540], "app_canvas": [1280, 720],
        "assets": [{"ref": ref, "resolved": resolved(ref, roots)} for ref in refs],
        "pages": pages,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, help="directory containing assets/")
    parser.add_argument("--out", type=Path, default=ROOT / "output/vertical_examples")
    parser.add_argument("--require-assets", action="store_true", help="fail if any referenced asset is missing")
    args = parser.parse_args()
    source = ROOT / "poc/vertical_examples"
    roots = [source] + ([args.source_root.resolve()] if args.source_root else [])
    args.out.mkdir(parents=True, exist_ok=True)
    common_path = source / "shared_office_lite.md"
    common = common_path.read_text()
    # The linked common filename is an alias for the file actually supplied.
    defined = set(re.findall(r"\bSO-[A-Z]\d+\b", common))
    report = ["# 버티컬 표준 제안서 원본 점검", "",
              "현재 결과는 명세 추출 및 재사용 후보 조사입니다. 앱 시나리오 등록·화면 검증은 완료되지 않았습니다.", "",
              "`shared_office_lite.md`를 공통 명세로 읽고 아래 파일을 순서대로 검사했습니다. 공통 파일은 기존 공유오피스 15장의 상세 바인딩을 포함하지 않습니다.", "",
              "| 명세 | 장 수 | 원문 텍스트 행 | 이미지 인스턴스 | 누락 자산 파일 |",
              "| --- | ---: | ---: | ---: | ---: |"]
    decks = []
    for name in FILES:
        deck = parse_deck(source / name, roots)
        unresolved_common = sorted({ref for p in deck["pages"] for ref in p["common_refs"] if ref not in defined})
        if unresolved_common:
            raise ValueError(f"{name}: undefined common refs: {unresolved_common}")
        dest = args.out / (Path(name).stem + ".json")
        dest.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n")
        ntext = sum(len(p["native_text"]) for p in deck["pages"])
        nimage = sum(len(p["image_instances"]) for p in deck["pages"])
        missing = sum(not a["resolved"] for a in deck["assets"])
        report.append(f"| {name} | {deck['page_count']} | {ntext} | {nimage} | {missing} |")
        decks.append(deck)
        print(f"{name}: {deck['page_count']} pages, {ntext} text rows, {nimage} image instances, {missing} missing assets")
    report.extend(["", "## 재사용 판정", "",
                   "SO 공통 참조는 기존 템플릿 후보를 찾는 근거로만 사용합니다. 제목·열 수가 같아도 슬롯 좌표, 사진 수·비율, 카드·연결선·QR·로고가 다르면 신규 레이아웃이 필요합니다.", "",
                   "기존 `L_SOL_01`은 배경 사진을 y=63.95px부터 시작하고 별도 제목을 올립니다. 새 SO-L01은 전체 사진 위 흰 띠와 내장 제목을 보존하므로 그대로 재사용할 수 없습니다.", "",
                   "기존 `L_SOL_15`에는 하단 문구가 있으며 로고 bbox가 (380,320.5,520,80.5)입니다. SO-L14는 별도 문구 없이 원본 로고 bbox를 요구하므로 수정 없이 재사용할 수 없습니다.", "",
                   "원본 assets, page_bindings.json과 페이지별 data JSON을 먼저 확보해야 비가시 인스턴스, 그림의 문자, transform·clip·그리기 순서를 복원할 수 있습니다. 각 JSON의 verified_layout=null은 아직 검증된 재사용이 없다는 뜻입니다.", "",
                   "## 장별 대응 준비", "",
                   "아래 후보는 확정 f가 아닙니다. `신규/대조 필요`도 곧바로 새 템플릿을 만들라는 의미가 아니며, 활성 라이브러리의 실제 형태를 먼저 비교합니다.", ""])
    groups = Counter()
    for deck in decks:
        report.extend([f"### {Path(deck['source']).name}", "",
                       "| 페이지 | 내용 | 기존 f 후보 | 이미지 내부 문자만 존재 |", "| --- | --- | --- | --- |"])
        for p in deck["pages"]:
            fs = ", ".join(p["existing_layout_candidates"]) or "신규/대조 필요"
            report.append(f"| {p['page']} | {p['title']} | {fs} | {'예' if p['image_only_text'] else ''} |")
            groups[p["status"]] += 1
        report.append("")
    missing = sum(not a["resolved"] for d in decks for a in d["assets"])
    summary = {"kind": "source_audit_only", "runtime_registered": False, "documents": len(decks),
               "pages": sum(d["page_count"] for d in decks), "missing_assets": missing,
               "page_status": dict(groups), "common_source_sha256": hashlib.sha256(common.encode()).hexdigest()}
    (args.out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    (args.out / "audit.md").write_text("\n".join(report) + "\n")
    print(json.dumps(summary, ensure_ascii=False))
    return 1 if args.require_assets and missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
