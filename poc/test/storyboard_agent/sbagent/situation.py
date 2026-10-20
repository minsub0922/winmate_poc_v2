"""② 상황 판정 — 요구 유형 · 맥락 수준 · 전략 후보 · 결말 · 분량 예산 (규칙)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .brief import Brief
from .kb import KB

# layout_agent/analysis.py 의 단서를 바탕으로, 샘플을 보지 않고 쓴 일반 단서
REQTYPE_CUES = {
    "new": r"신규|신축|오픈|개관|구축|처음|첫 도입|설계 단계|분양|새로|조성|개원|착공|준공|개장",
    "renew": r"교체|리뉴얼|노후|바꾸|바꿔|기존 장비|업그레이드|개보수|재단장|리모델링|\d+년차",
    "compete": r"입찰|경쟁|타사|공급사|RFP|제안요청|평가|배점|BMT|재계약|조달|낙찰|비교 평가",
    "ops": r"운영|효율|에너지|원격|자동화|인력|절감|현장 업무|업무 방식|관제|모니터링|전기료|전기요금|기기 관리|표준화",
    "scale": r"파일럿 (결과|성과|이후|후)|파일럿에서|파일럿을 했|확산|전 지점|전사|공동 개발|단계 확대|2차|추가 도입|전국 확대|에디션|넓히|확대",
    "brief": r"첫 미팅|첫 연락|경영진 보고|소개 자리|짧게|\d+분 (발표|미팅)|투자 심의|브리프|임원 보고|검토 단계",
}
STRATEGY_CUES = {
    "value": r"가치|브랜드|차별화|이미지|비전|메시지|프리미엄|상징|최초|알리|정체성|표준화|통일|같은 경험",
    "pain": r"문제|불편|불만|장애|고장|민원|오류|부담|어려|낭비|지연|누락|분실|불일치|비효율|골칫|소음|걱정",
    "space": r"공간|경험|동선|로비|체험|분위기|인테리어|장면|몰입|라운지|쇼룸|강의실|객실|하루|대기열",
    "roi": r"비용|절감|투자|회수|ROI|TCO|전기료|전기요금|전력|예산|수익|매출|사업성|렌탈|구독|광고비|구좌",
    "rfp": r"RFP|평가|배점|입찰|규격|제안요청서|BMT|조달|\[규격\]|\[선정\]|대응표",
    "compete": r"경쟁|타사|비교|공급사 전환|우위|공급사|재계약",
    "land": r"파일럿|확산|단계 도입|단계 확산|시범|전사|롤아웃|순차|전 지점|넓히|확대",
}
# 요구 유형 → 전략 사전값 (Best Scenario 21개의 요구 유형별 전략 분포와 같은 방향)
REQTYPE_PRIOR = {
    "new": {"value": 1.0, "space": 1.0}, "renew": {"pain": 1.0, "space": 0.5}, "compete": {"rfp": 1.0, "compete": 1.0},
    "ops": {"roi": 1.0, "pain": 1.0, "value": 0.3}, "scale": {"land": 1.5}, "brief": {"value": 1.0, "roi": 0.6}, "std": {"value": 1.0},
}
BUDGET = {"minimal": (5, 7), "ambiguous": (5, 8), "complex": (6, 9)}


@dataclass
class Situation:
    reqtype: str
    reqtype_scores: dict
    level: str
    strategies: list  # [(key, score)] 상위 3
    strategy: str
    confidence: float
    ending: str
    budget: tuple
    signals: dict = field(default_factory=dict)


def _hits(rx: str, text: str) -> int:
    return len(re.findall(rx, text, re.I))


def _distinct(rx: str, text: str) -> int:
    return len({m.lower() for m in re.findall(rx, text or "", re.I)})


def judge(b: Brief, kbx: KB, forced_strategy: str | None = None, ref_votes: dict | None = None) -> Situation:
    req_txt = "\n".join(r.text for r in b.reqs)
    file_txt = "\n".join(f["name"] + " " + f["memo"] + " " + f["text"][:1500] for f in b.files)
    all_txt = "\n".join([b.title, b.project, b.free, req_txt, b.note, file_txt])
    rt = {k: _hits(rx, all_txt) for k, rx in REQTYPE_CUES.items()}
    if rt["compete"] and re.search(r"입찰|평가|배점|RFP|제안요청", all_txt):
        rt["compete"] += 2
    if rt["scale"] and re.search(r"파일럿|시범", all_txt) and re.search(r"결과|측정|실측|했", all_txt):
        rt["scale"] += 2
    reqtype = max(rt, key=lambda k: (rt[k], -list(REQTYPE_CUES).index(k))) if any(rt.values()) else "brief"

    n_req = len(b.keyman_reqs)
    n_km = len({r.keyman for r in b.reqs if r.keyman})
    has_eval = bool(re.search(r"평가|배점|입찰|RFP|제안요청|BMT", all_txt))
    long_files = any(len(f["text"]) > 800 for f in b.files)
    if n_req <= 2 and n_km <= 1 and not long_files and len(all_txt) < 400:
        level = "minimal"
    elif has_eval or long_files or n_req >= 8 or (n_km >= 2 and n_req >= 5):
        level = "complex"
    else:
        level = "ambiguous"

    # 같은 말이 여러 번 나와도(예: 호텔 문서의 '객실') 한 요구에서 최대 2점 — 반복이 판정을 좌우하지 않게 서로 다른 단서 수로 센다
    sc = {k: 0.0 for k in STRATEGY_CUES}
    for k, rx in STRATEGY_CUES.items():
        for r in b.reqs:
            sc[k] += min(2, _distinct(rx, r.text)) * (1.0 + r.weight)
        sc[k] += 0.5 * min(3, _distinct(rx, b.note)) + 0.5 * min(3, _distinct(rx, b.free)) + 0.3 * min(3, _distinct(rx, file_txt))
    for k, v in REQTYPE_PRIOR.get(reqtype, {}).items():
        sc[k] += 2.0 * v
    if has_eval and re.search(r"기술\s*\d+|배점|평가 항목|가격평가", all_txt):
        sc["rfp"] += 2.0
    for k, v in (ref_votes or {}).items():
        sc[k] = sc.get(k, 0.0) + v
    ranked = sorted(sc.items(), key=lambda kv: -kv[1])
    top = ranked[:3]
    strategy = forced_strategy or top[0][0]
    conf = 0.0 if not top[0][1] else round((top[0][1] - top[1][1]) / top[0][1], 2)

    ending = _ending(strategy, reqtype, all_txt)
    lo, hi = BUDGET[level]
    if reqtype == "brief":
        lo, hi = 4, 6
    return Situation(reqtype, rt, level, top, strategy, conf, ending, (lo, hi),
                     {"has_eval": has_eval, "n_req": n_req, "n_keymen": n_km})


def _ending(strategy: str, reqtype: str, txt: str) -> str:
    if strategy == "rfp" or (reqtype == "compete" and re.search(r"입찰|평가", txt)):
        return "shortlist"
    if re.search(r"공동 개발|에디션", txt):
        return "codev"
    if re.search(r"설계 (단계|반영)|사양 확정|사업계획승인", txt):
        return "design"
    if strategy == "compete":
        return "contract"
    if strategy == "land" or reqtype == "scale":
        return "contract" if re.search(r"발주|1차", txt) else "budget"
    if re.search(r"첫 미팅|첫 연락|실측|실사|워크숍", txt):
        return "workshop"
    if strategy in ("roi", "pain"):
        return "pilot"
    return "scope"


def reference_votes(refs: list) -> dict:
    """비슷한 Best Scenario(전략을 보지 않고 찾은 상위 3개)의 전략을 사전값으로 — 1위 2.0 · 2위 1.2 · 3위 0.6, 점수 비율로 줄임."""
    votes: dict = {}
    if not refs:
        return votes
    top = max(r.score for r in refs) or 1.0
    for w, r in zip((2.0, 1.2, 0.6), refs):
        st = r.scenario["strategy"]
        votes[st] = votes.get(st, 0.0) + w * max(0.0, r.score) / top
    return votes
