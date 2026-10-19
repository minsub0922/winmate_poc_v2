#!/usr/bin/env python3
"""Verify the stage-0 frozen reference without writing original application files."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[3]
LIVE = ROOT / "reference/live"
EVIDENCE = ROOT / "docs/migration/evidence"


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main(allow_app: bool = False) -> None:
    manifest = json.loads((LIVE / "export-manifest.json").read_text())
    entries = manifest["entries"]
    assert len(entries) == 511, "unexpected frozen export file count"
    for row in entries:
        path = LIVE / row["path"]
        assert path.resolve().is_relative_to(LIVE.resolve()), row["path"]
        assert path.stat().st_size == row["bytes"], row["path"]
        assert digest(path) == row["sha256"], row["path"]
    if (LIVE / "published.zip").exists():
        assert digest(LIVE / "published.zip") == manifest["zip_sha256"]

    summary = json.loads((EVIDENCE / "comparison-summary.json").read_text())
    html = (LIVE / "index.html").read_text()
    js = re.findall(r"<script>([\s\S]*?)</script>", html)[-1]
    css = re.findall(r"<style[^>]*>([\s\S]*?)</style>", html)[-1]
    assert hashlib.sha256(js.encode()).hexdigest() == summary["javascript"]["live"]["sha256"]
    assert hashlib.sha256(css.encode()).hexdigest() == summary["css"]["live"]["sha256"]
    assert manifest["runtime_script_sha256_observed"] == summary["javascript"]["live"]["sha256"]
    assert summary["javascript"]["live"] == summary["javascript"]["dist"]
    assert summary["css"]["live"] == summary["css"]["dist"]

    changes = json.loads((EVIDENCE / "semantic-change-hunks.json").read_text())
    assert len(changes) == 6 and all(row.get("classification") for row in changes)
    assert len(json.loads((EVIDENCE / "media-data-differences.json").read_text())) == 257
    images = json.loads((EVIDENCE / "image-comparison.json").read_text())
    assert len(images) == 408 and all(row["pixels_identical"] for row in images)
    assert all(json.loads((EVIDENCE / "storage-name-presence.json").read_text()).values())
    if not allow_app:
        assert not (ROOT / "app").exists(), "stage 1 started; use --allow-app to recheck the frozen reference"
    print("PASS: 511 published files, ZIP, bundle fingerprints, 6 classified JS changes,")
    print("      257 media differences, 408 pixel-identical images and storage names.")


if __name__ == "__main__":
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--allow-app',action='store_true')
    main(parser.parse_args().allow_app)
