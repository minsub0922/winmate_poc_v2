"""레이아웃 446개 → RAG 용 Layout Card.

원천 메타데이터(catalog.json: p · p2 · ind · sol · pc · req · when · g …)에
아래를 더해 LLM 이 '이 장표를 언제 · 왜 · 무엇으로 채우는지' 판단할 수 있게 만든다.

- slots       : 텍스트 칸(역할 · 글자 수 상한) · 이미지 칸(종류 · 힌트) — HTML 에서 직접 파싱
- groups      : 반복 카드/행 구조(몇 개 항목을 담는 장표인지 = capacity)
- visual      : 시각 유형(kpi · table · comparison · map · flow · photo · diagram · matrix …)
- strategy_fit: 7개 전략(value · pain · space · roi · rfp · compete · land) 적합도
- req_type_fit: 6개 요구 타입(new · renew · compete · ops · scale · brief) 적합도
- level_fit   : 3개 요구사항 맥락(standard · best · complex) 에서 쓰임새
- usage       : Best Scenario / 표준 시나리오에서 이 장표가 맡은 역할(role) 문장
- data_needs  : 채우는 데 필요한 정보(필수 · 선택) — 정보가 없으면 자리표시로 남는다
- embed_text  : 벡터 검색용 자연어 설명
"""
from __future__ import annotations

import re
from collections import defaultdict

from .kb import KB, REQ_FIELDS
from .slots import parse_layout

# ---------- 시각 유형 ----------
VISUAL_RULES: list[tuple[str, str]] = [
    ("kpi", r"수치|KPI|지표|숫자로|핵심 수치|전 → 후|성과 수치|효과 범위|누적 효과"),
    ("table", r"표\b|비교표|대응표|구성표|수량표|리스트|매트릭스|체크리스트|사양 비교|요구사항 대응"),
    ("comparison", r"비교|VS|vs|→ 후|전 →|열위|우위|레이더|포지셔닝|교체 매핑|구성 3안|단종"),
    ("map", r"맵|평면|단면|배치|조감|존별|존 맵|층별|커버리지|입면|시야 거리|캠퍼스 배치"),
    ("flow", r"동선|하루|흐름|여정|단계|로드맵|일정|캘린더|파일럿|시나리오|체크인|타임라인|→"),
    ("photo", r"사진|실사|이미지|컷|풀블리드|히어로|포토|갤러리|콜라주|무드|시안"),
    ("diagram", r"구성도|연동|데이터 흐름|아키텍처|추진 체계|R&R|통신 버스"),
    ("matrix", r"매트릭스|×|2×2|4분면|사분면"),
    ("cards", r"기둥|강점|가치 \d|과제 \d|사례 모음|\d건|카드|라인업"),
    ("message", r"한 문장|메시지|한 장|요약|표지|간지|마무리|타이포"),
    ("qna", r"질문|Q&A|예상 질문|반론"),
]

# 코드 접두어 → 전략 적합 (규칙) — Best Scenario 사용 이력으로 보강된다
STRATEGY_RULES: dict[str, list[str]] = {
    "value": ["P1-A", "P2-A", "P3-A", "P4-A", "P5-A", "P1-D", "P2-D", "P3-D", "P4-D", "P5-D", "P1-A", "VP-J", "VP-P", "TR-", "MI-*-A", "VP-B", "VP-C", "VP-F", "VP-G", "VP-N", "VP-O", "VP-D", "VP-V", "VP-M", "VP-I", "VP-T", "VP-H", "ES-A", "EF-C", "EF-D", "ST-A", "ST-D"],
    "pain": ["MI-*-B", "MI-*-C", "US-", "VP-Q", "CH-", "VP-A", "VP-E", "VP-L", "VP-S", "VP-U", "IM-A", "EF-A", "P-N", "CB-", "CD-A", "CD-B"],
    "space": ["MI-*-C", "US-", "SS-", "SM-", "VP-K", "VP-R", "BV-", "ZP-", "IS-", "GN-", "MB-", "UX-", "VM-", "VC-", "P1-B", "P2-B", "P3-B", "P4-B", "P5-B", "P-P", "P-S", "C08", "C11", "C12", "-S"],
    "roi": ["MI-*-A", "TR-", "EF-B", "EF-F", "EF-G", "EF-H", "EF-I", "CO-A", "CO-B", "ES-B", "P-O", "P-M", "MS-", "EF-E", "PL-B"],
    "rfp": ["P1-C", "P2-C", "P3-C", "P4-C", "P5-C", "RM-", "SC-B", "SE-A", "SE-B", "SE-C", "OV-A", "OV-B", "OV-C", "SC-D", "SD-", "IG-", "OG-A", "QA-A", "CM-B", "SC-A", "IP-"],
    "compete": ["CD-C", "CL-", "VP-Q", "P2-C", "CM-", "CP-", "ST-E", "ST-B", "ST-C", "CL-C", "SV-B", "EF-A"],
    "land": ["PL-", "BM-D", "BM-E", "TO-", "CU-", "SV-A", "MT-", "CL-C", "EF-F", "OG-A"],
}
REQTYPE_RULES: dict[str, list[str]] = {
    "new": ["OV-A", "SM-", "BV-", "ZP-", "IS-", "GN-", "P-", "P1", "P2", "P3", "P4", "P5", "BM-A", "BM-C", "IP-A", "IP-B", "OG-A", "SS-", "VP-K", "VP-R", "C08", "C02"],
    "renew": ["P-N", "IP-C", "VP-L", "VP-S", "CD-B", "SC-F", "EF-A", "CH-B", "MB-"],
    "compete": ["CD-C", "CL-", "VP-Q", "P2-C", "CM-", "CP-", "RM-C", "RM-B", "ST-E", "SC-B", "SE-B", "QA-A", "ST-B", "ST-C"],
    "ops": ["-I", "-D", "-S", "EF-E", "MT-", "TO-", "IG-", "CO-B", "VP-J", "VP-P", "EF-G", "SV-B"],
    "scale": ["PL-", "BM-D", "BM-E", "TO-B", "CU-", "CL-C", "EF-F", "SV-A", "OG-A"],
    "brief": ["ES-A", "ES-B", "IM-B", "IM-A", "C03", "C13", "VP-C", "CL-C", "VP-G", "MS-", "CL-B"],
}
# 요구사항 맥락(3분기)별 쓰임
STANDARD_CODES = ["C01", "C02", "C03", "C08", "C09", "C04", "C07", "C13", "VP-F", "VP-U", "VP-O", "VP-B", "VP-J", "VP-P", "VP-G", "VP-T",
                  "P1-", "P2-", "P3-", "P4-", "P5-", "P-T", "P-S", "SM-A", "SM-E", "CD-A", "CD-C", "CD-D", "CL-A", "CL-B", "CL-D", "ST-A", "ST-D", "SV-B", "SV-C", "-I"]
COMPLEX_CODES = ["RM-", "SC-B", "SE-", "OV-", "CH-D", "CM-B", "IG-", "QA-A", "OG-A", "IP-", "SC-D", "SC-A", "SD-", "CO-", "PL-B", "MT-", "TO-", "EF-H"]
EXEC_CODES = ["ES-", "IM-B", "VP-C", "EF-B", "C13", "C03", "C12", "OV-B", "EF-H", "CO-A"]
WORK_CODES = ["SC-", "SD-", "IG-", "IP-", "SE-", "RM-B", "BM-", "MT-", "TO-", "P-M", "P-E", "P-F", "P-H", "OG-A"]


def _code_hit(code: str, f: str, pats: list[str]) -> bool:
    c = code.upper()
    for p in pats:
        if "*" in p:
            if re.match("^" + re.escape(p).replace(r"\*", "[A-Z]{2}") + "$", c):
                return True
            continue
        if p.startswith("-"):
            if c.endswith(p) or re.search(rf"{re.escape(p)}(-[A-Z]{{2}})?$", c):
                return True
        elif c.startswith(p) or c == p:
            return True
    return False


def detect_groups(texts: list[dict]) -> list[dict]:
    """반복 구조(카드 · 행 · 열) 찾기 — (role, 글자 크기) 시퀀스의 주기 반복."""
    body = [b for b in texts if b["role"] not in ("fixed", "footer", "eyebrow", "headline", "subhead")]
    # 역할 분류는 글자 수에 따라 흔들리므로 (글자 크기, 굵기)만으로 반복을 본다
    sig = [(round(b["fs"] * 2) / 2, b["fw"] >= 600 or b["role"] in ("kpi", "title_lg")) for b in body]
    n = len(sig)
    best = None
    for p in range(2, 13):
        for start in range(0, n - 2 * p + 1):
            pat = sig[start : start + p]
            k = 1
            while start + (k + 1) * p <= n and sig[start + k * p : start + (k + 1) * p] == pat:
                k += 1
            if k >= 2:
                cov = p * k
                key = (cov, k, -p)
                if not best or key > best[0]:
                    best = (key, start, p, k)
    if not best:
        return []
    _, start, p, k = best
    groups = []
    for g in range(k):
        slots = body[start + g * p : start + (g + 1) * p]
        groups.append({"slots": [s["i"] for s in slots]})
    return groups


def visual_tags(l: dict, n_img: int, groups: list[dict]) -> list[str]:
    hay = " ".join([l["name"], l["when"], l["g"], l["code"]])
    tags = [t for t, rx in VISUAL_RULES if re.search(rx, hay)]
    if n_img >= 3:
        tags.append("image_heavy")
    elif n_img:
        tags.append("image")
    if l["p"] in ("cover", "closing"):
        tags.append("message")
    if len(groups) >= 2 and "cards" not in tags and "table" not in tags:
        tags.append("cards")
    return sorted(set(tags))


def scenario_usage(kb: KB) -> dict[str, list[dict]]:
    use: dict[str, list[dict]] = defaultdict(list)
    for s in kb.best_scenarios:
        for st in s["flow"]:
            for sl in st["slides"]:
                use[sl["f"]].append({"src": s["id"], "req": s["req"], "strategy": s["strategy"], "ind": s["ind"], "stage": st["key"], "role": sl["role"]})
    return use


IMG_IN_SLOT = re.compile(r'<(\w+)[^>]*data-img="(\d+)"[^>]*>(.*?)</\1>', re.S)


def baked_images(html: str) -> dict[int, dict]:
    """사진 칸(data-img)에 레이아웃이 원래 넣어 둔 사진 — 파일 경로(img/ph/…) 또는 묶음 주소(img/fill/…json#k), pid, 설명."""
    out: dict[int, dict] = {}
    for m in re.finditer(r'<[^>]*data-img="(\d+)"[^>]*>', html or ""):
        i = int(m.group(1))
        cont = m.group(0)
        seg = (html or "")[m.end():m.end() + 900]
        im = re.search(r"<img[^>]*>", seg.split("data-img=")[0])
        if not im:
            continue
        tag = im.group(0)
        fill = re.search(r'data-fill="([^"]+)"', tag)
        src = re.search(r'src="([^"]+)"', tag)
        pid = re.search(r'data-pid="([^"]+)"', tag) or re.search(r'data-pid="([^"]+)"', cont)
        alt = re.search(r'alt="([^"]*)"', tag)
        ref = fill.group(1) if fill else (src.group(1) if src and not src.group(1).startswith("data:") else "")
        if ref:
            out[i] = {"ref": ref, "packed": bool(fill), "pid": pid.group(1) if pid else "", "alt": alt.group(1) if alt else ""}
    return out


def photo_fraction(images: list[dict]) -> float:
    area = sum((im.get("w") or 0) * (im.get("h") or 0) for im in images)
    return round(min(1.0, area / (1280 * 720)), 2)


def static_texts(html: str) -> list[str]:
    """data-tb 밖에 있는 글자(편집 불가 샘플 문구) — 고객 맞춤 채우기로 바꿀 수 없으므로 메타데이터로 알린다."""
    body = re.sub(r"<(\w+)[^>]*data-tb=[^>]*>.*?</\1>", " ", html, flags=re.S)
    body = re.sub(r"<svg.*?</svg>", " ", body, flags=re.S)
    body = re.sub(r"<[^>]+>", "\n", body)
    out = []
    for line in body.split("\n"):
        t = re.sub(r"\s+", " ", line).strip()
        if len(t) >= 4 and re.search(r"[가-힣]", t):
            out.append(t)
    return out


def _static_ind(kb: KB, stx: list[str]) -> str | None:
    """편집 불가 문구가 특정 업종 말을 쓰는가(쓰면 다른 업종 고객에게는 감점)."""
    txt = " ".join(stx)
    best, bs = None, 0
    for code, ws in kb.IND_KW.items():
        n = sum(1 for w in ws if len(w) >= 2 and w in txt and w not in ("매장", "브랜드", "로비", "현장", "업무", "셀프", "체험"))
        if n > bs:
            best, bs = code, n
    return best if bs >= 1 else None


def build_cards(kb: KB) -> list[dict]:
    usage = scenario_usage(kb)
    cards = []
    for l in kb.layouts:
        f, code = l["f"], l["code"]
        parsed = parse_layout(kb.html.get(f, ""))
        baked = baked_images(kb.html.get(f, ""))
        texts, images = parsed["texts"], parsed["images"]
        groups = detect_groups(texts)
        u = usage.get(f, [])
        strat = {k for k, pats in STRATEGY_RULES.items() if _code_hit(code, f, pats)}
        strat |= {x["strategy"] for x in u}
        rtype = {k for k, pats in REQTYPE_RULES.items() if _code_hit(code, f, pats)}
        rtype |= {x["req"] for x in u}
        level = set()
        if _code_hit(code, f, STANDARD_CODES) or (l["ind"] and code.startswith("MI-") and code.endswith("-A")):
            level.add("standard")
        if u:
            level.add("best")
        if _code_hit(code, f, COMPLEX_CODES):
            level.add("complex")
        if not level:
            level.add("best")
        audience = "exec" if _code_hit(code, f, EXEC_CODES) else "working" if _code_hit(code, f, WORK_CODES) else "mixed"
        n_kpi = sum(1 for t in texts if t["role"] == "kpi" or (t["ph_in"] and re.search(r"\[\d", t["s"])))
        req = list(dict.fromkeys(l["req"]))
        critical = [r for r in req if r in ("products", "solutions", "competitors", "cases", "timeline", "costs", "quantities", "keymen", "users")]
        cap = len(groups) if groups else (l["pc"] or 0)
        visual = visual_tags(l, len(images), groups)
        roles = [x["role"] for x in u][:6]
        part_label = kb.part_label(l["p"])
        part2_label = kb.part_label(l["p2"]) if l["p2"] else ""
        ind_name = kb.ind_name(l["ind"])
        sol_name = kb.S[l["sol"]]["name"] if l["sol"] and l["sol"] in kb.S else ""
        prods = [kb.P[p]["model"] for p in l["prods"] if p in kb.P]
        sols = [kb.S[s]["name"] for s in l["sols"] if s in kb.S]
        data_needs = {
            "required": [r for r in req if r != "images"],
            "labels": [REQ_FIELDS.get(r, r) for r in req],
            "critical": critical,
            "placeholders": l["phs"],
            "n_placeholder": l["ph"],
        }
        embed = (
            f"[{part_label}{' / ' + part2_label if part2_label else ''}] {l['name']} — {l['when']}. "
            f"용도: {l['g']}. "
            + (f"업종 전용: {ind_name}. " if ind_name else "업종 공통. ")
            + (f"솔루션 전용: {sol_name}. " if sol_name else "")
            + (f"제품 {l['pc']}개 구성. " if l["pc"] else "")
            + (f"항목 {cap}개를 담는 구조. " if cap else "")
            + f"시각 유형: {', '.join(visual) or '텍스트'}. "
            + f"필요 정보: {', '.join(data_needs['labels']) or '없음'}. "
            + f"적합 전략: {', '.join(kb.STRATEGIES[s]['label'] for s in sorted(strat) if s in kb.STRATEGIES)}. "
            + f"적합 요구 타입: {', '.join(kb.REQ_TYPES[s]['label'] for s in sorted(rtype) if s in kb.REQ_TYPES)}. "
            + (f"쓰임 예: {' / '.join(roles)}. " if roles else "")
            + f"헤드라인 예: {l['hl']}. 본문 예: {l['txt'][:260]}"
        )
        cards.append({
            "f": f, "code": code, "canvas": l["c"], "name": l["name"], "when": l["when"], "purpose": l["g"],
            "part": l["p"], "part2": l["p2"], "part_label": part_label, "ind": l["ind"], "ind_name": ind_name,
            "sol": l["sol"], "sol_name": sol_name, "pc": l["pc"], "sample": l["sample"], "headline": l["hl"],
            "eyebrow": l["eb"], "footer": l["foot"],
            "capacity": cap, "n_text": len(texts), "n_image": len(images), "n_kpi": n_kpi,
            "visual": visual, "audience": audience,
            "strategy_fit": sorted(strat), "req_type_fit": sorted(rtype), "level_fit": sorted(level),
            "usage": u, "data_needs": data_needs, "sample_products": prods, "sample_solutions": sols,
            "slots": {
                "texts": [{"i": t["i"], "role": t["role"], "s": t["s"], "max": t["max"], "fs": t["fs"], "fw": t["fw"], "ph": t["ph_in"]} for t in texts],
                "images": [{"i": im["i"], "kind": im["kind"], "slot": im["slot"], "hint": im["hint"], "pid": im["pid"] or baked.get(im["i"], {}).get("pid", ""),
                            "w": im["w"], "h": im["h"], "baked": baked.get(im["i"])} for im in images],
                "groups": groups,
            },
            "embed_text": embed, "static_text": (stx := static_texts(kb.html.get(f, "")))[:12], "static_ind": _static_ind(kb, stx),
            "retired": l.get("retired"), "pf": l.get("pf") if l.get("pf") is not None else photo_fraction(images), "pv": l.get("pv") or [],
        })
    return cards
