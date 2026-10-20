"""① 요구 원장 — 앱 제안서(proposal) → 원자 요구 R1…Rn · 선택 결과 · 근거 텍스트."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .kb import KB, STRATEGY_LABELS
from .text import clip, number_set, sentences

# 요구 분류 → 그 요구에 답하기 좋은 파트 유형 (layout_agent/analysis.py CAT_RULES · CAT2PARTS 를 줄여 씀)
CAT_RULES: list[tuple[str, str]] = [
    ("평가·선정", r"평가|배점|BMT|협상|낙찰|입찰|점수|제안 발표|선정"),
    ("보안", r"보안|망분리|내부망|개인정보|Knox|분실|유출|원격 잠금|업무 외 사용"),
    ("인증·규격", r"인증|KC|규격|사양|해상도|인치|nit|밝기|휘도|IP\d\d|방수|방진|내구|소음|응답속도|패널|포트|전원"),
    ("예산·비용", r"예산|비용|최저가|TCO|총소유비용|렌탈|구독|요금|전기료|전기요금|투자|회수|ROI|원가|단가|견적|수익|매출|가격"),
    ("확산·단계", r"파일럿|확산|시범|전 지점|전사|롤아웃|2차|1차|단계|순차|넓히|확대"),
    ("일정", r"일정|기간|개월|오픈|준공|착공|마감|\d+\s*월|분기|연내|납기|시즌 전|무중단|영업 유지|중단 없|방학|야간|개강|개장"),
    ("경쟁", r"경쟁|타사|공급사|재계약|비교"),
    ("교육·지원", r"교육|A/?S|유지보수|출동|SLA|지원|무상|수리|복구|장애 대응"),
    ("시스템 연동", r"연동|WMS|PMS|POS|ERP|BMS|LMS|학사|예약 앱|API"),
    ("사용자 경험", r"경험|손님|고객|투숙객|환자|학생|보호자|방문객|관람객|대기|편의|안내|만족|불편|불만|이용자|입주|민원|집객|체감"),
    ("가치·브랜드", r"가치|브랜드|차별화|최초|알리|정체성|이미지|프리미엄|선호|비전|메시지|분양 포인트"),
    ("공간·설치", r"공간|설치|시공|공사|배선|동선|로비|객실|병동|병실|강의실|회의실|창구|라인|세대|모델하우스|쇼윈도|쇼룸|매장|벽|외벽"),
    ("성과·KPI", r"절감|단축|향상|증가|감소|%|생산성|효율|줄이|줄여|성과|지표|증빙|실측|정량|에너지"),
    ("운영·관리", r"운영|원격|모니터링|장애|콘텐츠|배포|관제|점검|일괄|자동|반영|변경|표기|불일치|CMS|통합 관리|한 번에|표준화|통일"),
    ("범위·수량", r"\d[\d,]*\s*(대|개|매장|지점|실|곳|면|세대|명|층)|수량|범위|전국|전 매장|옵션|패키지"),
]
CAT2PARTS = {
    "평가·선정": ["requirements", "overview"], "보안": ["execution", "spec", "solution"], "인증·규격": ["spec", "products"],
    "예산·비용": ["cost", "effect"], "확산·단계": ["execution", "bom"], "일정": ["execution", "closing"], "경쟁": ["competition", "why"],
    "교육·지원": ["why", "execution"], "시스템 연동": ["solution", "execution"], "사용자 경험": ["scenario", "user", "value"],
    "가치·브랜드": ["value", "why"], "공간·설치": ["scenario", "products", "dss"], "성과·KPI": ["effect", "value"],
    "운영·관리": ["solution", "value"], "범위·수량": ["bom", "products"], "기타": ["value"],
}
MUST_RE = re.compile(r"필수|불가|반드시|해야|하여야|돼야|되어야|이상\b|이하\b|이내|인증|자격|금지|준수|충족")
REQ_CUE = re.compile(r"요구|필요|필수|희망|원|해야|개선|줄이|줄여|늘리|구축|도입|싶|바람|요청|불가|연동|지원|확보|제공|이상|이하|이내|반영|대응|관리|절감|교체|바꾸|바꿔|설치|운영|알리|높이|낮추|단축|유지|증빙|통합|자동|불만|불편|고민|어렵|부담|문제|검토|평가|입찰|목표|좋겠|넓히|확대|걱정")
STRATEGY_LABEL_RE = re.compile("(?:" + "|".join(map(re.escape, STRATEGY_LABELS.values())) + r")\s*[:：—-]?\s*")


def categorize(t: str) -> str:
    best, n = "기타", 0
    for cat, rx in CAT_RULES:
        k = len(re.findall(rx, t))
        if k > n:
            best, n = cat, k
    return best


@dataclass
class Req:
    id: str
    text: str
    keyman: str = ""
    weight: float = 0.0
    src: str = "keyman"  # keyman | free | note
    cat: str = "기타"
    prefer: list = field(default_factory=list)
    must: bool = False

    def short(self, n: int = 60) -> str:
        return clip(self.text, n)


@dataclass
class Brief:
    title: str
    customer: str
    ind: str | None
    project: str
    target: str
    reqs: list
    note: str
    free: str
    files: list
    products: list
    solutions: list
    cases: list
    prev_parts: list
    source_text: str = ""
    source_numbers: set = field(default_factory=set)

    @property
    def keyman_reqs(self) -> list:
        return [r for r in self.reqs if r.src == "keyman"] or [r for r in self.reqs if r.src == "free"]

    def selection_names(self, kbx: KB) -> list[str]:
        out = [kbx.P[p]["model"] for p in self.products if p in kbx.P] + [kbx.S[s]["name"] for s in self.solutions if s in kbx.S]
        return out


def _seg_text(segs, kbx: KB) -> str:
    if isinstance(segs, str):
        return segs
    out = []
    for s in segs or []:
        if s.get("t") is not None:
            out.append(s["t"])
        elif s.get("ref"):
            t, _, i = s["ref"].partition(":")
            if t == "product" and i in kbx.P:
                out.append(kbx.P[i]["model"])
            elif t == "solution" and i in kbx.S:
                out.append(kbx.S[i]["name"])
            elif t == "case" and i in kbx.cases:
                out.append(kbx.cases[i]["cust"])
    return "".join(out)


def mask_strategy_labels(s: str) -> str:
    """제작자 의견의 '가치 선도형:' 같은 전략 이름만 지운다(평가에서 정답 누설 방지)."""
    return STRATEGY_LABEL_RE.sub("", s or "")


def build_brief(pr: dict, kbx: KB, *, mask_labels: bool = True, use_note: bool = True) -> Brief:
    req = pr.get("req") or {}
    form = req.get("form") or {}
    reqs: list[Req] = []
    n = 0
    for k in form.get("keymen") or []:
        for r in k.get("reqs") or []:
            t = _seg_text(r, kbx).strip()
            if not t:
                continue
            n += 1
            reqs.append(Req(f"R{n}", t, k.get("name", ""), float(k.get("weight") or 0) / 100.0, "keyman"))
    free = _seg_text(req.get("free"), kbx)
    for s in sentences(free):
        if len(s) >= 8 and REQ_CUE.search(s) and not any(s in r.text or r.text in s for r in reqs):
            n += 1
            reqs.append(Req(f"R{n}", s, "", 0.0, "free"))
    note = form.get("note") or ""
    if mask_labels:
        note = mask_strategy_labels(note)
    if not use_note:
        note = ""
    for r in reqs:
        r.cat = categorize(r.text)
        r.prefer = CAT2PARTS.get(r.cat, ["value"])
        r.must = bool(MUST_RE.search(r.text)) or r.weight >= 0.3
    files = [{"name": f.get("name", ""), "memo": f.get("memo", ""), "text": (f.get("text") or "")[:4000]} for f in req.get("files") or []]
    ctx = pr.get("ctx") or {}
    prev = [p for p in (pr.get("parts") or []) if not p.get("deck") and p.get("type") != "cover"]
    b = Brief(
        title=pr.get("title", ""), customer=pr.get("customer") or form.get("customer", ""), ind=pr.get("ind"),
        project=form.get("project", ""), target=form.get("target", ""), reqs=reqs, note=note, free=free, files=files,
        products=[p for p in ctx.get("products", []) if p in kbx.P], solutions=[s for s in ctx.get("solutions", []) if s in kbx.S],
        cases=[str(c) for c in ctx.get("cases", []) if str(c) in kbx.cases], prev_parts=prev,
    )
    # 근거 = 고객 입력 + 선택 + 이전 storyboard(사용자가 쓴 파트 · 장표 값 · 출처). 이전 파트는 프롬프트의 '이전 storyboard' 칸으로 따로 간다.
    b.source_text = "\n".join(x for x in [brief_text(b, kbx, with_selection=True), prev_text(prev)] if x)
    b.source_numbers = number_set(b.source_text)
    return b


def _strings(x) -> list[str]:
    if isinstance(x, str):
        return [re.sub(r"<[^>]+>", "", x)]
    if isinstance(x, dict):
        return [y for v in x.values() for y in _strings(v)]
    if isinstance(x, list):
        return [y for v in x for y in _strings(v)]
    return []


def prev_text(prev: list[dict]) -> str:
    """이전 storyboard 의 글 — 파트 이름 · 항목 · 채운 장표 값(ov) · 근거 출처(ev)."""
    out = []
    for p in prev or []:
        out += [p.get("name") or ""] + [str(x) for x in p.get("items") or []]
        for l in p.get("layouts") or []:
            out += _strings(l.get("ov") or {}) + _strings(l.get("ev") or {})
    return "\n".join(x for x in out if x and x.strip())


def brief_text(b: Brief, kbx: KB, with_selection: bool = False) -> str:
    bits = [b.title, b.customer, b.project, b.target, b.free, b.note]
    bits += [f"{r.keyman} {r.text}" for r in b.reqs]
    for f in b.files:
        bits += [f["name"], f["memo"], f["text"]]
    if with_selection:
        for p in b.products:
            x = kbx.P[p]
            bits.append(f"{x['name']} {x['model']} {x['cat']} {x.get('spec', '')} {' '.join(x.get('spaces', []))}")
        for s in b.solutions:
            x = kbx.S[s]
            bits.append(f"{x['name']} {x['cat']} {x.get('desc', '')}")
        for c in b.cases:
            x = kbx.cases[c]
            bits.append(f"{x['cust']} {x.get('title', '')} {x.get('sub', '')} {' '.join(x.get('proof') or [])}")
    return "\n".join(x for x in bits if x)


def selection_summary(b: Brief, kbx: KB) -> str:
    out = []
    for p in b.products:
        x = kbx.P[p]
        out.append(f"- 제품 {x['model']} · {x['name']} · {x['cat']} · {x.get('spec', '')}")
    for s in b.solutions:
        x = kbx.S[s]
        out.append(f"- 솔루션 {x['name']} · {x['cat']} · {clip(x.get('desc', ''), 80)}")
    for c in b.cases:
        x = kbx.cases[c]
        proof = " / ".join((x.get("proof") or [])[:2])
        out.append(f"- 사례 {x['cust']} · {clip(x.get('sub') or x.get('title', ''), 50)}{' · 성과: ' + clip(proof, 90) if proof else ''}")
    return "\n".join(out) or "(선택 없음)"
