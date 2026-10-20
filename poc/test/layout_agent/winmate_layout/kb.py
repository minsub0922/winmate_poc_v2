"""Knowledge base — catalog · parts · scenarios · layout cards 를 한 번만 읽어 둔다."""
from __future__ import annotations

import gzip
import json
import re
from functools import cached_property, lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SRC = DATA / "source"

# 요구사항 필드 ↔ 사람이 읽는 이름 (parts.js REQ_LABEL 확장)
REQ_FIELDS = {
    "customer": "고객사", "project": "프로젝트", "industry": "업종", "spaces": "공간", "products": "제품 목록",
    "solutions": "솔루션", "cases": "유관 사례", "kpis": "핵심 수치 · KPI", "competitors": "경쟁사", "timeline": "일정 · 단계",
    "users": "사용자 유형", "challenges": "고객 과제", "values": "핵심 가치", "costs": "비용 항목", "contacts": "연락처",
    "sources": "출처", "images": "이미지", "quantities": "수량", "keymen": "키맨",
}


# 공통 레이아웃의 샘플 고객 → 그 장에 박힌 사진의 업종(사진 중심 레이아웃은 샘플 고객 업종의 현장 사진을 담고 있다)
SAMPLE_IND = {"A 커피": "FB", "N 체인": "FB", "D 다이닝": "FB", "A 호텔": "HT", "B 호텔": "HT", "N 호텔": "HT", "K 호텔": "HT", "B 비즈니스": "HT",
              "E 대학교": "ED", "H 학원": "ED", "C 빌딩": "OF", "C 오피스": "OF", "F 사옥": "OF", "G 임대형": "OF", "T 은행": "FN", "F 보험": "FN",
              "V 보험": "FN", "S 지자체": "PB", "D 리테일": "RT", "H 백화점": "RT", "T 리빙": "RT", "W 요양병원": "MD", "B 병원": "MD", "C 종합병원": "MD",
              "L 제조": "MF", "L 물류센터": "MF", "R 건설": "RS", "S 라이프": "RS", "U 통신사": "OE", "I 키친": "ID", "P 스터디카페": "SV",
              "J 스크린골프": "SV", "V 경기장": "VN", "B 볼파크": "VN", "P 테마파크": "TP", "Z 파크": "TP", "Y 테마파크": "TP", "J 미디어": "AD", "Q 미디어": "AD"}
# fill.<이름> 사진 묶음의 접두어 → 업종 (모르는 접두어는 그 장의 업종 · 샘플 고객을 따른다)
FILL_IND = {"ht": "HT", "hotel": "HT", "cafe": "FB", "bakery": "FB", "burger": "FB", "hosp": "MD", "ward": "MD", "bank": "FN", "banker": "FN", "acad": "ED",
            "school": "ED", "class": "ED", "campus": "ED", "airport": "PB", "station": "PB", "fashion": "RT", "mall": "RT", "coin": "SV", "factory": "MF",
            "warehouse": "MF", "stadium": "VN", "apt": "RS"}
UI_KINDS = {"ui", "cms", "energy", "kv", "phone", "content"}
BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"


def kind_group(kind: str) -> str:
    return "cut" if kind == "cut" else "ui" if kind in UI_KINDS else "scene"


class KB:
    def __init__(self) -> None:
        self.catalog = json.loads((SRC / "catalog.json").read_text(encoding="utf-8"))
        parts = json.loads((SRC / "parts.json").read_text(encoding="utf-8"))
        self.PARTS: dict = parts["PARTS"]
        self.NEXT: dict = parts["NEXT"]
        self.RELATED: dict = parts["RELATED"]
        sc = json.loads((SRC / "best_scenarios.json").read_text(encoding="utf-8"))
        self.REQ_TYPES: dict = sc["REQ_TYPES"]
        self.STRATEGIES: dict = sc["STRATEGIES"]
        self.ENDINGS: dict = sc["ENDINGS"]
        self.STAGES: dict = sc["STAGES"]
        self.best_scenarios: list[dict] = sc["SCENARIOS"]
        self.images = json.loads((SRC / "images.json").read_text(encoding="utf-8"))

        c = self.catalog
        self.layouts: list[dict] = c["layouts"]
        self.L = {l["f"]: l for l in self.layouts}
        self.industries = c["industries"]
        self.IND = {i["code"]: i for i in self.industries}
        self.products = c["products"]
        self.P = {p["id"]: p for p in self.products}
        self.solutions = c["solutions"]
        self.S = {s["id"]: s for s in self.solutions}
        self.cases = c["cases"]
        self.C = {str(x["id"]): x for x in self.cases}
        self.IND_KW: dict = c["indKw"]
        self.BS = {s["id"]: s for s in self.best_scenarios}

    # ---- lazy pieces ----
    @cached_property
    def html(self) -> dict[str, str]:
        with gzip.open(SRC / "layout_html.json.gz", "rt", encoding="utf-8") as fh:
            return json.load(fh)

    @cached_property
    def cards(self) -> dict[str, dict]:
        p = DATA / "layout_cards.jsonl"
        if not p.exists():
            raise FileNotFoundError("data/layout_cards.jsonl 이 없습니다 — python scripts/build_metadata.py 를 먼저 실행하세요")
        out = {}
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip():
                d = json.loads(line)
                out[d["f"]] = d
        return out

    @cached_property
    def standard_scenarios(self) -> dict[str, dict]:
        p = DATA / "standard_scenarios.json"
        if not p.exists():
            return {}
        d = json.loads(p.read_text(encoding="utf-8"))
        return {s["id"]: s for s in d["scenarios"]}

    @cached_property
    def std_rules(self) -> dict:
        p = DATA / "standard_scenarios.json"
        return json.loads(p.read_text(encoding="utf-8")).get("rules", {}) if p.exists() else {}

    @cached_property
    def std_pref(self) -> dict[str, set]:
        """업종 표준 시나리오가 그 업종에 지정한 장표(VP-U 업종판 · P-R 유닛 패키지 · RV-A 분양 포인트 …)."""
        out: dict[str, set] = {}
        for s in self.standard_scenarios.values():
            if not s.get("ind"):
                continue
            fs = set(s.get("variant", {}).values())
            for sec in s["sections"]:
                fs |= set(sec.get("layouts", []))
            out[s["ind"]] = {self.L[f].get("retired") or f for f in fs if isinstance(f, str) and f in self.L}  # 대체된 장 → 사진 버전
        return out

    # ---- photos ----
    def _ind_from_text(self, text: str) -> str | None:
        best, bs = None, 0
        for code, ws in self.IND_KW.items():
            n = sum(1 for w in ws if len(w) >= 2 and w in (text or ""))
            if n > bs:
                best, bs = code, n
        return best

    def photo_info(self, pid: str, alt: str = "", card: dict | None = None) -> dict:
        """사진 한 장의 성격 — kind(cut · ui · scene) · 업종 · 제품 모델 · 업종 무관 여부."""
        pid = pid or ""
        img = self.images["pids"].get(pid, {})
        pre, _, rest = pid.partition(".")
        head = rest.split("-")[0].split("_")[0].split(".")[0].lower()
        model = img.get("model") or ""
        if pre in ("cut",) or img.get("src") == "cut" or (pre in {p["id"] for p in self.products} and "front" in rest + "persp"):
            return {"group": "cut", "ind": None, "model": model or pre.upper(), "neutral": False}
        if pre == "ui" or img.get("src") == "ui":
            return {"group": "ui", "ind": None, "model": model, "neutral": False}
        if pre in ("ph", "r4") and head.upper() in self.IND:
            ind = head.upper()
        elif pre == "ph" and head in ("gen", "svc", "p"):
            return {"group": "scene", "ind": None, "model": model, "neutral": True}
        elif pre == "ais":
            ind = "HT"
        elif pre == "case" and rest.startswith("mcd"):
            ind = "FB"
        elif pre == "cover":
            ind = rest.upper()
        elif pre == "fill" and head in FILL_IND:
            ind = FILL_IND[head]
        else:
            ind = self._ind_from_text(img.get("desc", "") + " " + alt) or (card or {}).get("ind") or SAMPLE_IND.get((card or {}).get("sample") or "")
        return {"group": "scene", "ind": ind, "model": model, "neutral": False}

    @cached_property
    def photo_pool(self) -> dict[tuple, list[dict]]:
        """(업종, kind 그룹) → 쓸 수 있는 사진 — 지금 라이브러리 장들에 박힌 사진 + 이미지 DB. 다른 업종 사진을 갈아 끼울 때 쓴다."""
        pool: dict[tuple, list[dict]] = {}
        seen = set()
        for f, c in self.cards.items():
            if c.get("retired"):
                continue
            for im in c["slots"]["images"]:
                b = im.get("baked")
                if not b or b["ref"] in seen:
                    continue
                info = self.photo_info(b["pid"], b["alt"], c)
                if info["group"] != "scene" or not info["ind"]:
                    continue
                seen.add(b["ref"])
                pool.setdefault((info["ind"], im["kind"] or "space"), []).append({"ref": b["ref"], "packed": b["packed"], "pid": b["pid"], "alt": b["alt"]})
        for pid, v in self.images["pids"].items():
            if not v.get("file") or v["file"] in seen or v.get("src") not in ("case", "life"):
                continue
            info = self.photo_info(pid, v.get("desc", ""))
            if info["ind"]:
                seen.add(v["file"])
                pool.setdefault((info["ind"], v.get("kind") or "space"), []).append({"ref": v["file"], "packed": False, "pid": pid, "alt": v.get("desc", "")})
        return pool

    @cached_property
    def label_freq(self) -> dict[str, int]:
        """같은 글자가 몇 개 장에 나오는가 — 여러 장에 공통인 글자('합계' · '관심사' · '우리 답')는 구조 라벨, 한두 장에만 있으면 샘플 내용."""
        from collections import Counter
        c: Counter = Counter()
        for card in self.cards.values():
            if card.get("retired"):
                continue
            for t in {re.sub(r"\s+", "", x["s"]) for x in card["slots"]["texts"]}:
                c[t] += 1
        return dict(c)

    @cached_property
    def cut_by_model(self) -> dict[str, dict]:
        out = {}
        for pid, v in self.images["pids"].items():
            if v.get("src") == "cut" and v.get("file") and v.get("model"):
                out.setdefault(v["model"].upper(), {"ref": v["file"], "packed": False, "pid": pid, "alt": v.get("desc", "")})
        return out

    # ---- helpers ----
    def part_label(self, t: str | None) -> str:
        return self.PARTS.get(t or "", {}).get("label", t or "")

    def ind_name(self, code: str | None) -> str:
        return self.IND[code]["name"] if code and code in self.IND else ""

    def industry_layout(self, prefix: str, ind: str, suffix: str) -> str | None:
        """L_MI_FB_A 처럼 업종 코드가 들어간 레이아웃을 다른 업종으로 바꿔 찾는다."""
        f = f"{prefix}_{ind}_{suffix}"
        return f if f in self.L else None

    def product_label(self, pid: str) -> str:
        p = self.P.get(pid)
        return f"{p['name']} ({p['model']})" if p else pid


@lru_cache(maxsize=1)
def get_kb() -> KB:
    return KB()
