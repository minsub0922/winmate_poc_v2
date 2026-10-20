"""요구 대응형 표 장표 전용 채우기 — 맥락 ③(복잡)의 핵심 장표.

반복 그룹 감지만으로는 행 구조를 못 맞추는 표를 '행 앵커'(ID · 번호 칸)로 잘라 요구 · 평가 항목 · 키맨을 넣는다.
  RM-A 키맨별 요구 이해   — 상단 가중치 막대 · 키맨 카드(이름 · 관심사 · 가중치 · 원문 3) · 공통 요구 · 부딪치는 요구
  RM-B 요구사항 대응표     — 행: ID · 구분 · 요구 · 필수 · 대응 방안 · 위치
  RM-C 평가 항목 · 배점 대응 — 행: 평가 항목 · 배점 · 관점 · 근거 · 위치 · 자체 점검 (+ 왼쪽 배점 막대)
  SC-B 요구사항 대응표(스펙) — 행: R# · 요구 · 기준 · 제안 제품 · 사양 · 충족 · 근거
  SE-A 보안 요건 대응표     — 행: # · 요건 · 출처 · 대응 기능 · 방식 · 근거 · 상태
확인할 수 없는 값(대응 방안 · 충족 여부 · 사양 수치)은 자리표시로 둔다 — 지어내지 않는다.
"""
from __future__ import annotations

import re

from .guards import is_status

from .text import clip, numbers


def _rows(texts: list[dict], anchor: str, row_len: int | None = None) -> list[list[dict]]:
    idx = [k for k, t in enumerate(texts) if re.fullmatch(anchor, t["s"])]
    rows = []
    for a, b in zip(idx, idx[1:] + [None]):
        seg = texts[a:b] if b is not None else texts[a:]
        rows.append(seg)
    if rows and row_len:
        rows[-1] = rows[-1][:row_len]
    return rows


def _strip_tag(s: str) -> str:
    return re.sub(r"^\[[^\]]+\]\s*", "", s).strip()


FILLER = [r"이어야\s*(?:한다|함|합니다)", r"(?:하여|해)야\s*(?:한다|함|합니다)", r"(?:되어|돼)야\s*(?:한다|함)", r"하여야", r"이어야", r"해야", r"합니다", r"한다", r"할 것",
          r"^(?:인터페이스|모니터|제품|PC|노트북)\s*(?:는|은)?\s+", r"\b별도\s*", r"\s사용(?=\s)", r"\s모델(?=\s)", r"\s참여(?=\s)", r"\s제품(?=\s)", r"\s기능(?=\s)", r"\s필수$", r"\s및(?=\s)"]


def compact(s: str, mx: int) -> str:
    """표 칸에 맞게 요구 문장을 줄인다 — 앞에서 자르기 전에 서술어 · 군더더기 낱말부터 뺀다('별도 AC 전원 어댑터 사용 모델 참여 불가' → 'AC 전원 어댑터 불가')."""
    s = _strip_tag(s)
    for rx in FILLER:
        if len(s) <= mx:
            break
        s = re.sub(r"\s+", " ", re.sub(rx, " ", s)).strip()
    return clip(s, mx)


def _criterion(text: str) -> str | None:
    m = re.search(r"[\d.,]+\s*[A-Za-z㎡/%°\"]*\s*(이상|이하|이내|초과|미만)", text)
    if m:
        return m.group(0)
    ns = [n.text for n in numbers(text) if n.unit]
    return ns[0] if ns else None


CAT_SHORT = {"규격·성능": "규격", "보안": "보안", "인증": "인증", "범위·수량": "범위", "일정": "일정", "예산·비용": "비용", "평가·선정": "선정",
             "자격·제출": "자격", "운영·관리": "운영", "교육·지원": "지원", "시스템 연동": "연동", "사용자 경험": "경험", "성과·KPI": "성과",
             "가치·브랜드": "가치", "공간·설치": "공간", "경쟁": "경쟁", "확산·단계": "확산", "기타": "기타"}


RMB_ORDER = ["규격·성능", "보안", "인증", "시스템 연동", "운영·관리", "교육·지원", "범위·수량", "공간·설치", "일정", "확산·단계",
             "예산·비용", "성과·KPI", "사용자 경험", "가치·브랜드", "경쟁", "평가·선정", "자격·제출", "기타"]
PAGE_CAP = {"RM-B": 5, "SC-B": 4, "SE-A": 2}


def _rid(r: dict) -> tuple:
    m = re.match(r"([A-Z]+)(\d+)", r["id"])
    return (m.group(1), int(m.group(2))) if m else (r["id"], 0)


def shown_reqs(analysis: dict) -> list[dict]:
    """장표에 원문 그대로 싣는 요구 — 제출 절차(체크리스트 몫) · 담당자 메모는 뺀다."""
    return [r for r in analysis["requirements"] if not r.get("procedural") and not r.get("internal")]


def table_rows_for(code: str, analysis: dict) -> list[dict]:
    reqs = shown_reqs(analysis)
    if code == "RM-B":
        order = {c: i for i, c in enumerate(RMB_ORDER)}
        return sorted([r for r in reqs if r["category"] != "평가·선정"], key=lambda r: (order.get(r["category"], 99), _rid(r)))
    if code == "SC-B":
        spec = [r for r in reqs if r["category"] in ("규격·성능", "인증", "보안")]
        return sorted(spec, key=lambda r: (-r["score"], _rid(r))) or sorted(reqs, key=lambda r: -r["score"])
    if code == "SE-A":
        sec = [r for r in reqs if r["category"] == "보안"]  # 인증(KC · 전파)은 보안 요건이 아니다 — 보안 요구가 없으면 보안 대응표도 없다
        return sorted(sec, key=lambda r: (-r["score"], _rid(r)))
    return reqs


def row_capacity(code: str, card: dict) -> int:
    texts = [t for t in card["slots"]["texts"] if t["role"] not in ("fixed", "footer")]
    if code == "RM-B":
        return len(_rows(texts, r"[A-Z]{2,4}-\d{2,3}", 6))
    if code == "SC-B":
        return len(_rows(texts, r"R\d+", 7))
    if code == "SE-A":
        return len(_rows([t for t in texts if t["i"] >= 12], r"\d{1,2}", 7))
    return 0


def paginate(kb, slides: list[dict], analysis: dict) -> list[dict]:
    """요구 · 규격 · 보안 대응표가 한 장에 다 안 들어가면 같은 장표를 이어 붙인다(pg = 1, 2 …) — 쪽마다 다음 행부터."""
    out = []
    for s in slides:
        out.append(s)
        cap = PAGE_CAP.get(s["code"])
        if not cap or s.get("pg"):
            continue
        rows = row_capacity(s["code"], kb.cards[s["f"]])
        n = len(table_rows_for(s["code"], analysis))
        if rows <= 0 or n <= rows:
            continue
        pages = min(cap, -(-n // rows))
        for pg in range(1, pages):
            out.append({**s, "pg": pg, "alternates": [], "why": list(s.get("why") or []) + [f"대응표 {pg + 1}쪽 — {pg * rows + 1}번째 행부터"]})
    for k, s in enumerate(out, 1):
        s["no"] = k
    return out


def _fill_eval_tiles(card: dict, ev: dict, put) -> bool:
    """평가 배점 사진 타일(PH-RQ-B) — 샘플 평가 항목 · 점수('사업 이해도 10 · 수행 실적 10')를 고객 평가표로 바꾸고, 없는 항목은 비운다."""
    texts = [t for t in card["slots"]["texts"] if t["role"] not in ("fixed", "footer", "eyebrow", "headline")]
    byi = {t["i"]: t for t in texts}
    items_all = ev.get("items") or []
    price = [it for it in items_all if re.search(r"가격", it[0])]
    tech = [it for it in items_all if not re.search(r"가격", it[0])]
    blank = lambda t: put(t["i"], "", "blank")  # noqa: E731
    known = bool(items_all)
    grouped = [[byi[i] for i in g["slots"] if i in byi] for g in card["slots"]["groups"]]
    gset = {t["i"] for g in grouped for t in g}
    first_g = min(gset) if gset else 10 ** 6
    tsum, psum = sum(int(p) for _, p in tech), sum(int(p) for _, p in price)
    for t in texts:
        if t["role"] == "subhead":
            put(t["i"], clip(" · ".join(f"{n} {p}점" for n, p in items_all) or "[평가 배점]", max(t["max"], 40)), "req" if known else "placeholder")
        elif re.fullmatch(r"기술\s*\d+\s*점", t["s"]):
            put(t["i"], f"기술 {tsum}점", "req") if tech else (blank(t) if price else put(t["i"], "기술 [00]점", "placeholder"))
        elif re.fullmatch(r"가격\s*\d+\s*점", t["s"]):
            put(t["i"], f"가격 {psum}점", "req") if price else put(t["i"], "가격 [00]점", "placeholder")
    # 위쪽 배점 막대 — (항목 이름, 점수) 쌍, 샘플 '가격' 막대는 가격 항목 자리
    head = [t for t in texts if t["i"] < first_g and t["i"] not in gset]
    pairs = [(a, b) for a, b in zip(head, head[1:]) if re.fullmatch(r"\d+", b["s"]) and not re.fullmatch(r"\d+|점", a["s"]) and b["i"] == a["i"] + 1]
    tq, pq = list(tech), list(price)
    for a, b in pairs:
        src = (pq.pop(0) if pq else None) if a["s"].strip() == "가격" else (tq.pop(0) if tq else None)
        if src:
            put(a["i"], clip(src[0], a["max"] + 4), "req")
            put(b["i"], src[1], "req")
        elif known:
            blank(a), blank(b)
        else:
            put(a["i"], "[평가 항목]", "placeholder"), put(b["i"], "[0]", "placeholder")
    # 아래 상세 — 그룹(항목 · 점수 / 평가위원이 보는 것 / 관점 / 근거 / 위치 / 점검)
    gq = list(tech)
    for g in grouped:
        it = gq.pop(0) if gq else None
        for k, t in enumerate(g):
            if it is None:
                blank(t) if known else (put(t["i"], "[평가 항목] · [0]점", "placeholder") if k == 0 else None)
            elif k == 0:
                put(t["i"], clip(f"{it[0]} · {it[1]}점", t["max"] + 6), "req")
            elif t["s"] == "평가위원이 보는 것":
                continue
            elif is_status(t["s"]):
                put(t["i"], "[점검]", "placeholder")
            elif t["s"].startswith("우리의 근거"):
                put(t["i"], "[우리의 근거] · p.[00]", "placeholder")
            else:
                put(t["i"], "[평가 관점]" if k <= 2 else "[우리의 근거]", "placeholder")
    # 오른쪽 작은 타일(점수 · 점 · 이름 · 점검 · 캡션 · 근거) — 남은 기술 항목, 샘플 '가격' 타일은 가격
    rest = [t for t in texts if t["i"] > max(gset or {0}) and t["role"] != "subhead"]
    tiles, cur = [], None
    for t in rest:
        if t["role"] == "kpi":
            cur = [t]
            tiles.append(cur)
        elif cur is not None:
            cur.append(t)
    pq = list(price)  # 가격 타일은 위쪽 막대와 따로 센다
    for tile in tiles:
        name = next((t for t in tile[1:] if t["s"] not in ("점",) and not is_status(t["s"])), None)
        is_price = bool(name and name["s"].strip() == "가격")
        it = (pq.pop(0) if pq else None) if is_price else (gq.pop(0) if gq else None)
        for t in tile:
            if it is None:
                blank(t) if known else None
            elif t["role"] == "kpi":
                put(t["i"], it[1], "req")
            elif t is name:
                put(t["i"], clip(it[0], t["max"] + 4), "req")
            elif t["s"] == "점":
                continue
            elif is_status(t["s"]):
                put(t["i"], "[점검]", "placeholder")
            elif t["role"] == "caption":
                put(t["i"], "평가위원 · [평가 관점]", "placeholder")
            else:
                put(t["i"], "[우리의 근거] · p.[00]" if not is_price else "[가격 제출 방식]", "placeholder")
    return True


def fill_table(code: str, card: dict, part: dict, analysis: dict, ctx: dict, kb, put, decomposition: dict | None = None, page: int = 0) -> bool:
    texts = [t for t in card["slots"]["texts"] if t["role"] not in ("fixed", "footer")]
    reqs = sorted(shown_reqs(analysis), key=lambda r: -r["score"])
    ph = lambda t, s: put(t["i"], clip(s, max(t["max"], len(s))), "placeholder")  # noqa: E731
    if code == "RM-B":
        rows = _rows(texts, r"[A-Z]{2,4}-\d{2,3}", 6)
        allr = table_rows_for("RM-B", analysis)
        off = page * len(rows)
        reqs = allr[off:]
        for row, r in zip(rows, reqs):
            cells = [t for t in row if t["s"] not in ("NEW", "수정")]
            vals = [r["id"], CAT_SHORT.get(r["category"], "기타"), _strip_tag(r["text"]), "필수" if r["priority"] == "must" else "권장", "[대응 방안]"]
            for t, v in zip(cells, vals):
                put(t["i"], compact(v, t["max"] + 6) if t is cells[2] else clip(v, t["max"]), "req" if v != "[대응 방안]" else "placeholder")
            for t in row:
                if t["s"] in ("NEW", "수정"):
                    put(t["i"], "—", "placeholder")
        for row in rows[len(reqs):]:
            for t in row:
                put(t["i"], "", "blank")  # 남는 행은 비운다(샘플 요구 · 키맨이 남지 않게)
        for t in texts:
            m = re.fullmatch(r"(\d+)\s*[–\-~]\s*(\d+)\s*/\s*(\d+)(.*)", t["s"])
            pages = max(1, min(PAGE_CAP["RM-B"], -(-len(allr) // max(1, len(rows)))))
            if m:
                last = off + min(len(rows), len(reqs))
                tail = ""
                if last < len(allr):
                    tail = " · 다음 쪽에 이어집니다" if page + 1 < pages else f" · 나머지 {len(allr) - last}개는 [별첨 대응표]"
                put(t["i"], f"{off + 1}–{last} / {len(allr)}" + tail, "req")
            elif re.fullmatch(r"\d+\s*/\s*\d+", t["s"].strip()):
                put(t["i"], f"{page + 1} / {pages}", "req")
            if re.fullmatch(r"(충족|부분|대안)\s*\[0+\]", t["s"]):
                ph(t, t["s"])
        return True
    if code == "SC-B":
        rows = _rows(texts, r"R\d+", 7)
        allr = table_rows_for("SC-B", analysis)
        off = page * len(rows)
        spec = allr[off:]
        prods = [kb.P[p] for p in ctx["products"]]
        for k, (row, r) in enumerate(zip(rows, spec)):
            p = next((kb.P[x] for x in r.get("products") or [] if x in kb.P), None) or (prods[k % len(prods)] if prods else None)
            vals = [f"R{off + k + 1}", compact(r["text"], 22), _criterion(r["text"]) or "[기준]", p["model"] if p else "[제품]", "[제품 사양]", "[충족]", "[근거 p.]"]
            for t, v in zip(row, vals):
                put(t["i"], clip(v, t["max"] + 6), "req" if not v.startswith("[") else "placeholder")
        for row in rows[len(spec):]:
            for t in row:
                put(t["i"], "", "blank")
        for t in texts:
            if re.fullmatch(r"\d+ / \d+", t["s"]):
                put(t["i"], f"[0] / {len(allr)}", "req")
            elif "충족 · 기준 초과" in t["s"]:
                ph(t, "[충족 현황]")
        return True
    if code == "SE-A":
        rows = _rows([t for t in texts if t["i"] >= 12], r"\d{1,2}", 7)
        off = page * len(rows)
        sec = table_rows_for("SE-A", analysis)[off:]
        for k, (row, r) in enumerate(zip(rows, sec)):
            vals = [str(off + k + 1), _strip_tag(r["text"]), (r.get("keyman") or "RFP").split("·")[0].strip(), "[대응 기능]", "[방식]", "p.[00]", "[상태]"]
            for t, v in zip(row, vals):
                put(t["i"], clip(v, t["max"] + 6), "req" if not v.startswith("[") and v != "p.[00]" else "placeholder")
        for row in rows[len(sec):]:
            for t in row:
                put(t["i"], "", "blank")
        for t in texts[:6]:
            if re.fullmatch(r"(충족|확인 필요)\s*\d+", t["s"]):
                ph(t, t["s"].split()[0] + " [0]")
        return True
    if code == "PH-RQ-B":
        return _fill_eval_tiles(card, (decomposition or {}).get("eval") or {}, put)
    if code == "RM-C":
        ev = (decomposition or {}).get("eval") or {}
        items_all = ev.get("items") or []
        price_items = [it for it in items_all if re.search(r"가격", it[0])]
        items = [it for it in items_all if not re.search(r"가격", it[0])]  # 가격은 아래 가격 줄에만(표에 두 번 나오지 않게)
        groups = card["slots"]["groups"]
        byi = {t["i"]: t for t in texts}
        for g, it in zip(groups, items):
            s = [byi[i] for i in g["slots"] if i in byi]
            vals = [it[0], it[1], "[평가 관점]", "[우리의 근거]", "p.[00]", "[점검]"]
            for t, v in zip(s, vals):
                put(t["i"], clip(v, t["max"] + 4), "req" if v in it else "placeholder")
        only_price = bool(price_items) and not items  # 가격 100점 입찰 — 기술 평가 항목을 만들지 않는다
        for g in groups[len(items):]:
            s = [byi[i] for i in g["slots"] if i in byi]
            if only_price or items:
                for t in s:
                    put(t["i"], "", "blank")
            else:
                for t, v in zip(s, ["[평가 항목]", "[0]", "[평가 관점]", "[우리의 근거]"]):
                    ph(t, v)
        # 왼쪽 배점 막대(기술 항목 → 가격) · 기술/가격 합계 · 가격 줄 · 부제
        seq = items + price_items
        bars = [t for t in texts if 14 <= t["i"] <= 27 and re.fullmatch(r"\d+", t["s"])]
        for k, t in enumerate(bars):
            if k < len(seq):
                put(t["i"], seq[k][1], "req")
            elif items_all:
                put(t["i"], "", "blank")
                if t["i"] + 1 in byi and byi[t["i"] + 1]["s"] == "점":
                    put(t["i"] + 1, "", "blank")
            else:
                put(t["i"], "[0]", "placeholder")
        tech = sum(int(p) for n, p in items)
        price = sum(int(p) for n, p in price_items)
        for t in texts:
            if t["s"] in ("80",) and 28 <= t["i"] <= 31:
                put(t["i"], str(tech) if items else "—" if only_price else "[0]", "req" if items_all else "placeholder")
            if t["s"] in ("20",) and 28 <= t["i"] <= 31:
                put(t["i"], str(price) if price_items else "[0]", "req" if price_items else "placeholder")
            if t["role"] == "subhead":
                put(t["i"], clip(" · ".join(f"{n} {p}점" for n, p in items_all) or "[평가 배점]", max(t["max"], 40)), "req")
            if t["i"] > 67 and t["s"] == "20":
                put(t["i"], str(price) if price_items else "[0]", "req" if price_items else "placeholder")  # 아래 가격 줄
            if re.fullmatch(r"배점 비중 \d+", t["s"]) and items_all:
                put(t["i"], f"배점 비중 {tech + price}", "req")
            if t["s"] == "별도 가격 제안서":
                put(t["i"], "[가격 제출 방식]", "placeholder")
            if t["s"].startswith("보완 계획") and len(items) > len(groups):
                put(t["i"], "+ " + " · ".join(f"{n} {p}점" for n, p in items[len(groups):]), "req")
        return True
    if code == "BM-A" and len(card["slots"]["texts"]) >= 95:
        return _fill_bom(card, analysis, ctx, kb, put)
    if code == "SM-B" and len(card["slots"]["texts"]) >= 68:
        return _fill_space_matrix(card, ctx, kb, put)
    if code == "VP-D" and len(card["slots"]["texts"]) >= 25:
        return _fill_stakeholders(card, analysis, ctx, kb, put)
    if code == "RM-A":
        kms = [k for k in analysis["keymen"] if k.get("reqs")][:3]
        if not kms:
            return False
        by_km = {k["name"]: sorted([r for r in analysis["requirements"] if r.get("keyman") == k["name"]], key=lambda r: -r["score"]) for k in kms}
        byi = {t["i"]: t for t in texts}

        def put_i(i: int, v: str, src: str = "req") -> None:
            if i in byi:
                put(i, clip(v, max(byi[i]["max"], len(v) if len(v) <= byi[i]["max"] + 8 else byi[i]["max"])), src)
        for k in range(3):  # 상단 가중치 막대
            if k < len(kms):
                put_i(3 + 2 * k, "", "blank")  # 키맨 영향력 비중은 내부 판단 — 고객 화면에 쓰지 않는다
                put_i(4 + 2 * k, kms[k]["name"])
            else:
                put_i(3 + 2 * k, "", "blank")
                put_i(4 + 2 * k, "[키맨]", "placeholder")
        for k, base in enumerate((9, 19, 29)):
            if k < len(kms):
                km = kms[k]
                rs = by_km[km["name"]]
                cats = list(dict.fromkeys(CAT_SHORT.get(r["category"], "기타") for r in rs))[:3]
                put_i(base, km["name"][:1])
                put_i(base + 1, km["name"])
                put_i(base + 2, "관심사 · " + " · ".join(cats) if cats else "[관심사]")
                put_i(base + 4, "", "blank")
                for j in range(3):
                    put_i(base + 7 + j, clip(_strip_tag(rs[j]['text']), 26) if j < len(rs) else "[원문]", "req" if j < len(rs) else "placeholder")
            else:
                for off, v in ((0, "-"), (1, "[키맨]"), (2, "[관심사]"), (4, ""), (7, "[원문]"), (8, "[원문]"), (9, "[원문]")):
                    put_i(base + off, v, "placeholder" if v else "blank")
        # 공통 요구 — 두 명 이상의 키맨이 같은 기준을 말한 것
        dims: dict[str, set] = {}
        for r in analysis["requirements"]:
            if r.get("keyman"):
                dims.setdefault(r["dimension"], set()).add(r["keyman"])
        common = [d for d, ks in dims.items() if len(ks) >= 2][:2]
        put_i(40, str(len(common)) if common else "[0]", "req" if common else "placeholder")
        for slot, d in zip((42, 46), common + ["[공통 요구]"] * 2):
            put_i(slot, d, "req" if not d.startswith("[") else "placeholder")
        for start, d in zip((43, 47), common + [None, None]):
            names = [k["name"][:1] for k in kms if d and k["name"] in dims.get(d, set())]
            for j in range(3):
                put_i(start + j, names[j] if j < len(names) else " ", "req")
        conf = (decomposition or {}).get("conflicts") or []
        c = next((x for x in conf if " vs " in x["kind"]), None)
        put_i(51, "1" if c else "[0]", "req" if c else "placeholder")
        if c:
            a, b = c["kind"].split(" vs ")
            put_i(54, a)
            put_i(55, b)
            put_i(56, clip(c["note"].split(" — ")[-1], 26))
        else:
            for i, v in ((54, "[요구 A]"), (55, "[요구 B]"), (56, "[조정 방안]")):
                put_i(i, v, "placeholder")
        put_i(52, kms[0]["name"].split("·")[0].strip() if kms else "[키맨]")
        put_i(53, kms[-1]["name"].split("·")[0].strip() if len(kms) > 1 else "[키맨]")
        put_i(57, "[장표]", "placeholder")
        return True
    return False


BLANK = " "  # 쓰지 않는 행 · 열은 비운다(샘플 제품 · 수량을 남기지 않는다)


def known_quantity(analysis: dict, ctx: dict) -> str | None:
    """제품이 하나이고 원문에 'N대' 수량이 하나뿐이면 그 수량 — 아니면 모른다(자리표시)."""
    if len(ctx["products"]) != 1:
        return None
    qs = {n.value for r in analysis["requirements"] if r["category"] in ("범위·수량", "규격·성능", "예산·비용") and not r.get("procedural")
          for n in numbers(r["text"]) if n.unit == "대" and n.value.isdigit() and int(n.value) >= 2}
    return qs.pop() if len(qs) == 1 else None


def _fill_bom(card: dict, analysis: dict, ctx: dict, kb, put) -> bool:
    """BM-A 전체 구성표 — 하드웨어 5행 · 소프트웨어 2행 · 서비스 2행 · 소계 · 총계 (행 위치는 레이아웃 고정)."""
    byi = {t["i"]: t for t in card["slots"]["texts"]}

    def p(i: int, v: str, src: str = "product") -> None:
        if i in byi:
            put(i, clip(v, max(byi[i]["max"], 8)) if v != BLANK else v, src)
    prods = [kb.P[x] for x in ctx["products"]][:5]
    sols = [kb.S[x] for x in ctx["solutions"]][:2]
    qty = known_quantity(analysis, ctx)
    for i, v in ((5, "단위 수량"), (6, "적용 수"), (2, "구분"), (3, "품목"), (4, "모델 · 사양"), (7, "총 수량"), (8, "비고")):
        p(i, v, "context")
    p(10, f"{len(prods)}종", "context")
    for k, base in enumerate((11, 18, 25, 32, 39)):
        if k < len(prods):
            P = prods[k]
            p(base, P["cat"]), p(base + 1, P["model"]), p(base + 2, P["spec"])
            p(base + 3, "1" if qty else "[0]", "fact" if qty else "placeholder")
            p(base + 4, f"×{qty}" if qty else "×[000]", "fact" if qty else "placeholder")
            p(base + 5, f"={qty}대" if qty else "=[000]대", "fact" if qty else "placeholder")
            p(base + 6, join_fit([s for s in P["spaces"] if s in ctx["spaces"]], byi[base + 6]["max"] + 4) or (ctx["spaces"] or ["[설치 공간]"])[0], "space")
        else:
            for j in range(7):
                p(base + j, BLANK, "context")
    p(47, f"{len(prods)}종", "context")
    p(48, f"{qty}대" if qty else "[0,000]대", "fact" if qty else "placeholder")
    p(49, "원문 수량 기준" if qty else "수량 확정 전", "context")
    p(51, f"{len(sols)}종" if sols else "—", "context")
    for k, base in enumerate((52, 59)):
        if k < len(sols):
            S = sols[k]
            p(base, S["cat"], "catalog"), p(base + 1, S["name"], "catalog"), p(base + 2, clip(S["desc"], 18), "catalog")
            for j, v in ((3, "[0]"), (4, "×[000]"), (5, "=[000]개")):
                p(base + j, v, "placeholder")
            p(base + 6, "[산정 기준]", "placeholder")
        else:
            for j in range(7):
                p(base + j, BLANK, "context")
    p(67, f"{len(sols)}종" if sols else "—", "context")
    p(68, "[0,000]개" if sols else "—", "placeholder" if sols else "context")
    # 서비스 행은 업종 공통 문구 — 단, 대상 수는 모르면 자리표시
    for i, v in ((71, "설치"), (72, "운반 · 거치 · 배선 · 초기 설정"), (77, "유지보수 [0]년"), (78, "장애 접수 · 방문 A/S")):
        p(i, v, "context")
    for i in (73, 79):
        p(i, "1", "context")
    for i in (74, 80):
        p(i, f"×{qty}" if qty else "×[000]", "fact" if qty else "placeholder")
    for i in (75, 81):
        p(i, f"={qty}식" if qty else "=[000]식", "fact" if qty else "placeholder")
    p(76, "[설치 방식]", "placeholder"), p(82, "장애 대응 [0]시간 내", "context")
    p(85, "[000]식", "placeholder")
    p(88, qty or "[0,000]", "fact" if qty else "placeholder")
    p(92, "[0,000]" if sols else "—", "placeholder" if sols else "context")
    p(94, "단가 · 금액은 견적서에서 제시", "context")
    return True


def join_fit(xs: list[str], mx: int, sep: str = " · ") -> str:
    """칸 너비 안에 들어가는 만큼만 잇는다(단어를 자르지 않는다)."""
    out = ""
    for x in xs:
        nxt = x if not out else out + sep + x
        if len(nxt) > mx and out:
            break
        out = nxt
    return out


def short_product(P: dict, mx: int) -> str:
    """좁은 칸용 제품 이름 — 모델명이 들어가면 모델명, 아니면 브랜드 · 괄호를 뗀 한글 이름."""
    if len(P["model"]) <= mx:
        return P["model"]
    n = re.sub(r"\([^)]*\)|비스포크\s*(AI)?|삼성|갤럭시|스마트", "", P["name"]).strip()
    return n if n and len(n) <= mx + 2 else P["model"]


def _fill_space_matrix(card: dict, ctx: dict, kb, put) -> bool:
    """SM-B 공간 × 제품 수량표 — 열: 제품 5 · 행: 공간 5. 그 공간에 쓰는 제품 칸만 [0](대수 확인), 나머지는 —."""
    byi = {t["i"]: t for t in card["slots"]["texts"]}

    def p(i: int, v: str, src: str) -> None:
        if i in byi:
            put(i, clip(v, max(byi[i]["max"], 8)) if v != BLANK else v, src)
    prods = [kb.P[x] for x in ctx["products"]][:5]
    spaces = list(ctx["spaces"][:5])
    for P in prods:  # 공간 목록이 모자라면 제품의 대표 공간으로 채운다
        if len(spaces) >= 5:
            break
        sp = next((s for s in P["spaces"] if s not in spaces), None)
        if sp and not ctx["spaces"]:
            spaces.append(sp)
    p(2, "칸의 숫자는 설치 대수 — 대수는 현장 확인 후 확정", "context")
    p(3, "공간 ↓ · 제품 →", "context")
    for k, (ti, ci) in enumerate(((4, 5), (6, 7), (8, 9), (10, 11), (12, 13))):
        if k < len(prods):
            p(ti, short_product(prods[k], byi[ti]["max"]), "product"), p(ci, prods[k]["cat"], "product")
        else:
            p(ti, BLANK, "context"), p(ci, BLANK, "context")
    p(14, "공간별 합계", "context")
    used_cols = set()
    for r, base in enumerate((15, 23, 31, 39, 47)):
        cells = [base + 2 + j for j in range(5)]
        tot = base + 7
        if r < len(spaces):
            sp = spaces[r]
            hit = [k for k, P in enumerate(prods) if sp in P["spaces"]]
            p(base, sp, "space")
            p(base + 1, join_fit([short_product(prods[k], 8) for k in hit], byi[base + 1]["max"]) or BLANK, "space")
            for k, i in enumerate(cells):
                if k < len(prods) and k in hit:
                    p(i, "[0]", "placeholder")
                    used_cols.add(k)
                else:
                    p(i, "—", "context")
            p(tot, "[0]" if hit else "—", "placeholder" if hit else "context")
        else:
            for i in [base, base + 1] + cells + [tot]:
                p(i, BLANK, "context")
    p(55, "합계", "context")
    for k, i in enumerate(range(56, 61)):
        p(i, "[0]" if k in used_cols else ("—" if k < len(prods) else BLANK), "placeholder" if k in used_cols else "context")
    p(61, "[0]" if used_cols else "—", "placeholder" if used_cols else "context")
    p(64, "× [00]", "placeholder"), p(65, "곳 =", "context"), p(66, "[0,000]", "placeholder"), p(67, "대", "context")
    return True


def _fill_stakeholders(card: dict, analysis: dict, ctx: dict, kb, put) -> bool:
    """VP-D 이해관계자별 가치 — 열: 키맨(이름 · 관심사 = 그 키맨의 대표 요구), 얻는 가치 · 지표는 근거가 없으면 자리표시."""
    byi = {t["i"]: t for t in card["slots"]["texts"]}

    def p(i: int, v: str, src: str) -> None:
        if i in byi:
            put(i, clip(v, max(byi[i]["max"], 8)), src)
    kms = [k for k in analysis["keymen"] if k.get("reqs")][:3]
    if not kms:
        return False
    models = [kb.P[x]["model"] for x in ctx["products"]][:3]
    qty = known_quantity(analysis, ctx)
    p(2, "같은 도입", "context")
    p(3, join_fit(models + ([f"{qty}대"] if qty else []), byi[3]["max"]) or (ctx["project"] or "[제안 범위]"), "product" if models else "context")
    for k, base in enumerate((4, 11, 18)):
        if k < len(kms):
            km = kms[k]
            rs = sorted([r for r in analysis["requirements"] if r.get("keyman") == km["name"] and not r.get("procedural")], key=lambda r: -r["score"])
            p(base, km["name"], "keyman")
            p(base + 2, clip(_strip_tag(rs[0]["text"]), byi[base + 2]["max"] + 6) if rs else "[관심사]", "req" if rs else "placeholder")
        else:
            p(base, "[이해관계자]", "placeholder")
            p(base + 2, "[관심사]", "placeholder")
        p(base + 1, "관심사", "context"), p(base + 3, "얻는 가치", "context")
        p(base + 4, "[얻는 가치]", "placeholder")
        p(base + 5, "[지표]", "placeholder")
        p(base + 6, "[00]%", "placeholder")
    return True
