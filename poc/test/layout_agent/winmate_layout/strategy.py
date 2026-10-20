"""맥락 ③ — 사용자 답(전략 · 결말 · 충돌 대응 · 분량)을 받아 storyboard 를 세운다.

구성 원칙
  1) 열기: 표지 + (RFP 면 사업 이해 / 아니면 제안 요약)
  2) 요구 이해: 키맨이 여럿이면 RM-A, 평가 구조가 있으면 RM-C, 요구가 10개 이상이면 RM-B
  3) 전략 서사: 고른 전략의 대표 Best Scenario 흐름(열기 · 결정 단계 제외)을 고객 맥락으로 맞춰 끼움
  4) 기준별 대응: 분해된 기준(must 가 있거나 요구 2개 이상) 마다 답하는 파트를 추가
  5) 결정 요청: 결말(ending)에 맞춘 마무리
"""
from __future__ import annotations

import re

from .decompose import DIM_ANSWER, ENDING_BY_REQ, best_ref
from .kb import KB
from .scenarios import adapt_best, product_space, std_products_layout

STAGE_ORDER = ["open", "context", "problem", "value", "space", "build", "proof", "plan", "close"]
ENDING_CLOSE = {"pilot": "L_C13", "design": "L_C13", "scope": "L_C13", "contract": "L_C13", "shortlist": "L_C07", "workshop": "L_C13", "codev": "L_C13", "budget": "L_C13"}


GAP_SKIP = {"값을 입력", "자리표시로 두기", ""}
ALL_STRATEGIES = {"value", "pain", "space", "roi", "rfp", "compete", "land"}  # 후보 3개 밖이라도 사용자가 고르면 따른다

# 충돌 대응 선택지(옵션 순서) → 덱에 넣을 장표. (파트 유형, 이름, 단계, 대표 레이아웃)
CONFLICT_PLAYS: dict[str, list[list[tuple[str, str, str, str]]]] = {
    "C1": [[("spec", "규격 100% 충족 증명", "build", "L_SC_B"), ("bom", "원가 최소 구성", "build", "L_BM_A")],
           [("cost", "총소유비용 관점", "plan", "L_CO_B")],
           [("spec", "대안 사양 · 충족 범위", "build", "L_SC_E")]],
    "C2": [[("execution", "무중단 · 야간 시공 일정", "plan", "L_IP_C")],
           [("execution", "구역별 순차 시공 계획", "plan", "L_SV_A")],
           [("execution", "임시 장비 운영 → 교체 계획", "plan", "L_IP_B")]],
    "C3": [[("execution", "내부망 설치형 관리 구조", "build", "L_SE_A")],
           [("spec", "원격 기능 비활성 · 인증 현황", "build", "L_SE_B")],
           [("execution", "망연계 · 연동 구조", "build", "L_IG_B")]],
    "C4": [[("execution", "물량 확보 · 지역별 동시 설치", "plan", "L_SV_B")],
           [("execution", "단계 납품 계획", "plan", "L_PL_A")],
           [("execution", "BMT · 샘플 → 본 물량 계획", "plan", "L_PL_B")]],
    "C5": [[], [], [("value", "이해관계자별 가치", "value", "L_VP_D")]],
}


def option_index(answer: str, options: list[str]) -> int | None:
    """답이 몇 번째 선택지인지 — 번호 · 원문 · 앞부분 일치. 자유 입력이면 None."""
    a = (answer or "").strip()
    if a.isdigit() and 1 <= int(a) <= len(options):
        return int(a) - 1
    for k, o in enumerate(options):
        if a == o or (len(a) >= 4 and (o.startswith(a) or a.startswith(o.split(":")[0].split("(")[0].strip()))):
            return k
    return None


def parse_answers(answers: dict, decomp: dict, analysis: dict) -> dict:
    qs = {q["id"]: q for q in decomp["questions"]}
    conf_by_id = {c["id"]: c for c in decomp["conflicts"]}

    def ans(qid: str) -> str:
        v = answers.get(qid)
        if v is None or v == "":
            return qs[qid]["default"] if qid in qs else ""
        return str(v)

    conflicts = {}
    for k in qs:
        if not k.startswith("conflict_"):
            continue
        cid = k[len("conflict_"):]
        a = ans(k)
        c = conf_by_id.get(cid, {})
        idx = option_index(a, c.get("options", qs[k]["options"]))
        conflicts[cid] = {"answer": a, "option": idx, "kind": c.get("kind", ""), "reqs": c.get("reqs", []), "custom": idx is None}
    keyman = ans("keyman") if "keyman" in qs else None
    c5 = conflicts.get("C5")
    if c5 and c5["option"] in (0, 1) and not answers.get("keyman"):
        keyman = c5["answer"].rsplit(" 우선", 1)[0].strip() or keyman  # '키맨 관심사 분산' 에서 한쪽을 고르면 그 키맨을 앞에
    gaps = {}
    for k in qs:
        if k.startswith("gap_"):
            v = str(answers.get(k, "") or "").strip()
            gaps[k[len("gap_"):]] = v if v not in GAP_SKIP else ""
    notes = []
    for k, q in qs.items():  # LLM 이 만든 질문(llm_*) — 사용자가 답했으면 기록하고 요구로 반영
        if k.startswith("llm_") and str(answers.get(k, "") or "").strip():
            notes.append({"id": k, "question": q["question"], "answer": str(answers[k]).strip(), "default": q.get("default", "")})

    strat = ans("strategy").split(":")[0].strip()
    if strat not in {o["strategy"] for o in decomp["strategy_options"]} and strat not in ALL_STRATEGIES and decomp["strategy_options"]:
        # 라벨로 답했을 수도 있음
        for o in decomp["strategy_options"]:
            if o["label"] in ans("strategy"):
                strat = o["strategy"]
        if strat not in {o["strategy"] for o in decomp["strategy_options"]}:
            strat = decomp["strategy_options"][0]["strategy"]
    ending = ans("ending").split(":")[0].strip() or ENDING_BY_REQ.get(analysis["req_type"] or "new", "scope")
    length = ans("length").split(":")[0].strip()
    try:
        budget = int(length)
    except ValueError:
        budget = 15
    return {
        "strategy": strat, "ending": ending, "budget": budget, "keyman": keyman,
        "conflicts": conflicts, "gaps": gaps, "notes": notes, "raw": answers,
    }


def interview_statements(choice: dict, decomp: dict) -> list[tuple[str, str]]:
    """사용자가 인터뷰에서 새로 알려 준 사실 → (요구 문장, 출처). 빈 정보(gap) 값 · LLM 질문 답 · 자유 입력 충돌 대응."""
    out = []
    labels = {g["field"]: g["label"] for g in decomp["gaps"]}
    for field, v in (choice.get("gaps") or {}).items():
        if v:
            out.append((f"{labels.get(field, field)}: {v}", f"interview:gap_{field}"))
    for n in choice.get("notes") or []:
        if n["answer"] != n["default"]:
            out.append((f"{clip_q(n['question'])} → {n['answer']}", f"interview:{n['id']}"))
    for cid, c in (choice.get("conflicts") or {}).items():
        if c.get("custom") and c.get("answer"):
            out.append((f"{c['kind']} 대응: {c['answer']}", f"interview:conflict_{cid}"))
    return out


def clip_q(q: str, n: int = 40) -> str:
    q = re.sub(r"\s*\([^)]*\)\s*$", "", q).rstrip("? ")
    return q if len(q) <= n else q[: n - 1] + "…"


PART_ORDER = ["cover", "overview", "requirements", "market", "customer", "user", "competition", "insight", "challenge", "value", "dss", "products",
              "scenario", "birdseye", "solution", "bom", "spec", "effect", "case", "why", "execution", "cost", "closing", "appendix"]
ESSENTIAL = {
    "roi": [("effect", "투자 회수 · 절감 효과", "proof", "L_EF_B"), ("cost", "구매 방식 · 총소유비용", "plan", "L_CO_A")],
    "land": [("execution", "파일럿 → 확산 단계", "plan", "L_PL_A"), ("effect", "검증된 효과", "proof", "L_EF_A")],
    "rfp": [("spec", "요구 규격 대응", "build", "L_SC_B")],
    "compete": [("why", "Why Samsung · 비교 우위", "proof", "L_CM_B")],
    "pain": [("challenge", "고객 과제", "problem", "L_CH_A"), ("effect", "개선 효과", "proof", "L_EF_A")],
    "value": [("effect", "기대 효과", "proof", "L_EF_C")],
    "space": [("scenario", "공간 시나리오", "space", None), ("dss", "공간 맵", "space", "L_SP00")],
}
HIGH_STAKES = {"경쟁·차별화", "비용·구매", "평가·선정·자격", "보안·인증·규제"}
NARRATIVE_STAGES = {"context", "problem", "value", "space"}  # 전략 서사로 빌려 오는 단계 — 구성 · 근거 · 실행은 기준별 대응 파트가 맡는다


def neutralize(kb: KB, p: dict, ctx: dict, ref_ind: str | None) -> dict:
    """다른 업종 시나리오에서 빌린 파트 — 그 업종 고유 표현(단계 이름 · 역할 문장)을 걷어낸다."""
    if ref_ind and ref_ind == ctx["industry"]:
        return p
    stage = kb.STAGES.get(p["stage"], {}).get("label", "")
    p = dict(p)
    p["name"] = f"{stage} · {kb.part_label(p['type'])}" if stage else kb.part_label(p["type"])
    p["items"] = list(kb.PARTS.get(p["type"], {}).get("items", []))[:3]
    return p


def build_complex_storyboard(kb: KB, analysis: dict, decomp: dict, choice: dict, ctx: dict) -> list[dict]:
    reqs = analysis["requirements"]
    ev = decomp["eval"]
    parts: list[dict] = []

    def add(t: str, name: str, items: list[str], stage: str, seeds: list[tuple[str, str]], core: bool, source: str = "strategy", req_ids=None, pin=False) -> None:
        parts.append({"type": t, "name": name, "items": items, "stage": stage, "goal": "", "seed_layouts": [{"f": f, "role": r} for f, r in seeds if f in kb.L],
                      "core": core, "source": source, "req_ids": list(req_ids or []), "pin": pin})

    add("cover", "표지", [f"{ctx['customer']} · {ctx['project']}"], "open", [("L_C03" if ev else "L_C01", "표지")], True, pin=True)
    facts = [r["text"] for r in reqs if r["category"] == "범위·수량"][:2]
    if ev:
        add("overview", "사업 이해", facts + ["사업 배경 · 목적 · 범위 · 일정"], "open", [("L_OV_A", "RFP 사업 이해 — 배경 · 목적 · 범위 · 일정")], True, pin=True)
    else:
        add("overview", "제안 요약", facts + ["과제 · 제안 · 효과 · 왜 삼성"], "open", [("L_ES_A", "결정권자용 한 장 요약")], True, pin=True)
    km = [k for k in analysis["keymen"] if k.get("reqs")]
    if len(km) >= 2:
        add("requirements", "키맨별 요구 이해", [f"{k['name']} ({int(k.get('weight', 0))}%)" for k in km[:4]], "context", [("L_RM_A", "키맨별 요구와 대응 방향")], True, pin=True)
    if ev:
        items = [f"{n} {pt}점" for n, pt in ev.get("items", [])][:5] or ev["signals"][:4]
        add("requirements", "평가 항목 대응", items, "context", [("L_RM_C", "평가 항목 · 배점별 대응")], True, pin=True)
    if len(reqs) >= 10:
        add("requirements", "요구사항 대응표", [f"요구사항 {len(reqs)}개 전수 대응"], "context", [("L_RM_B", "요구 전수 대응표")], True)

    # 전략 서사 — 고른 전략의 대표 시나리오에서 맥락 · 문제 · 가치 · 장면 단계만 빌린다
    ref = next((o["best_ref"] for o in decomp["strategy_options"] if o["strategy"] == choice["strategy"]), None) \
        or best_ref(kb, choice["strategy"], ctx["industry"], analysis["req_type"] or "new")
    narrative = []
    if ref:
        ref_ind = kb.BS[ref]["ind"]
        for p in adapt_best(kb, ref, ctx):
            if p["stage"] not in NARRATIVE_STAGES or p["type"] in ("overview", "requirements", "cover", "closing"):
                continue
            p = neutralize(kb, p, ctx, ref_ind)
            p["source"] = f"strategy:{choice['strategy']}<-{ref}"
            p["core"] = p["type"] in ("value", "challenge", "scenario")
            narrative.append(p)
    # 기준별 대응 파트 — 요구가 하나라도 있는 기준은 모두 후보로 두고, 장수 예산은 우선순위로 자른다
    resp = []
    for g in decomp["groups"]:
        if g["dimension"] == "평가·선정·자격" and ev:
            continue  # RM-C 로 이미 답함
        ans = DIM_ANSWER.get(g["dimension"])
        if not ans:
            continue
        cats = [r["category"] for r in reqs if r["id"] in g["req_ids"]]
        if g["dimension"] == "운영·유지보수" and ctx["solutions"] and cats.count("운영·관리") > cats.count("교육·지원"):
            ans = {"part": "solution", "layouts": [], "stage": "value"}  # 운영 방식 요구 → 솔루션 장표가 답한다
        elif g["dimension"] == "운영·유지보수" and any("교육" in r["text"] for r in reqs if r["id"] in g["req_ids"]):
            ans = dict(ans, layouts=["L_TO_A", "L_MT_B"])
        elif g["dimension"] == "일정·실행·확산":
            txt = " ".join(r["text"] for r in reqs if r["id"] in g["req_ids"]) + " " + " ".join(r["text"] for r in reqs if r["category"] == "확산·단계")
            if re.search(r"개발|에디션|양산|출시|인증 일정", txt):
                ans = dict(ans, layouts=["L_CU_B", "L_PL_A"])  # 맞춤 개발 · 인증 · 양산 일정
            elif re.search(r"파일럿|시범|확산|단계", txt):
                ans = dict(ans, layouts=["L_PL_A", "L_PL_B"])
            elif re.search(r"무중단|야간|영업 중|방학 중|폐점", txt):
                ans = dict(ans, layouts=["L_IP_C", "L_SV_A"])
        resp.append({"type": ans["part"], "name": f"{g['dimension']} 대응", "items": [], "stage": ans["stage"], "goal": f"{g['dimension']} 요구 {g['n']}개(필수 {g['must']})",
                     "seed_layouts": [{"f": ans["layouts"][0], "role": f"{g['dimension']} 요구 대응"}] if ans["layouts"] else [],
                     "core": g["must"] > 0 or g["n"] >= 2 or g["dimension"] in HIGH_STAKES, "source": f"dimension:{g['dimension']}", "req_ids": g["req_ids"]})
    # 충돌 대응 — 고른 선택지마다 다른 장표로 답한다(자유 입력이면 기본 선택지의 장표에 그 답을 싣는다)
    for cid, c in choice["conflicts"].items():
        plays = CONFLICT_PLAYS.get(cid)
        if not plays:
            continue
        k = c["option"] if c["option"] is not None else next((q["options"].index(q["default"]) for q in decomp["questions"]
                                                              if q["id"] == f"conflict_{cid}" and q["default"] in q["options"]), 0)
        for t, name, stage, seed in plays[min(k, len(plays) - 1)]:
            # 대응 방향(답)은 direction 으로 — 장표 내용(items)에는 실행 계획처럼 읽히는 답만 싣는다
            items = [f"{x['name']} 관점" for x in analysis["keymen"] if x.get("reqs")][:4] if cid == "C5" else [c["answer"]]
            same = next((p for p in resp if any(sl.get("f") == seed for sl in p["seed_layouts"])), None)
            if same:  # 기준별 대응 파트가 이미 그 장표로 답하면 거기에 대응 방향을 싣는다
                same["items"] = items + same["items"]
                same["source"] += f" + conflict:{cid}"
                same["direction"] = c["answer"]
                same["req_ids"] = list(dict.fromkeys(same["req_ids"] + c["reqs"]))
                same["core"] = True
                continue
            resp.append({"type": t, "name": name, "items": items, "stage": stage, "goal": c["kind"], "direction": c["answer"],
                         "seed_layouts": [{"f": seed, "role": f"{c['kind']} — {name}"}],
                         "core": cid != "C1" or k != 1, "source": f"conflict:{cid}", "req_ids": list(c["reqs"])})
    resp_types = {p["type"] for p in resp}
    narrative = [p for p in narrative if p["type"] not in resp_types or p["type"] in ("value", "scenario")]
    used = {sl["f"] for p in parts for sl in p["seed_layouts"]}
    for p in narrative + resp:
        p["seed_layouts"] = [sl if sl.get("f") not in used else dict(sl, f=None) for sl in p["seed_layouts"]]
        used |= {sl["f"] for sl in p["seed_layouts"] if sl.get("f")}
        parts.append(p)
    if not any(p["type"] == "value" for p in parts):
        add("value", "핵심 가치", [], "value", [], True, source="rule:value-required")
    # 전략마다 빠지면 안 되는 장표
    have = {p["type"] for p in parts}
    for t, name, stage, seed in ESSENTIAL.get(choice["strategy"], []):
        if t not in have:
            add(t, name, [], stage, [(seed, name)] if seed else [], True, source=f"rule:essential-{choice['strategy']}")
            have.add(t)
    if ctx["products"] and "products" not in have:
        add("products", "공간별 제품", [f"{product_space(kb, p, ctx)} · {kb.P[p]['model']}" for p in ctx["products"][:4]], "build",
            [(std_products_layout(kb, ctx), "공간별 제품 · 설치 방식")], True, source="rule:products-required")
    if (choice["strategy"] in ("compete", "rfp") or "경쟁·차별화" in {g["dimension"] for g in decomp["groups"]}) and not any(p["type"] == "why" and "L_CM_B" in [s.get("f") for s in p["seed_layouts"]] for p in parts):
        add("why", "Why Samsung · 요구 기준 비교", ["요구 기준별 충족도", "실적 · 지원 체계"], "proof", [("L_CM_B", "요구사항별 충족도 비교")], True)
    if not any(p["type"] == "case" for p in parts):
        add("case", "유관 사례", [kb.C[c]["cust"] for c in ctx["cases"][:3] if c in kb.C], "proof", [("L_CS02" if len(ctx["cases"]) == 2 else "L_CS03", "유관 사례")], False)
    close = ENDING_CLOSE.get(choice["ending"], "L_C13")
    add("closing", f"결정 요청 · {kb.ENDINGS.get(choice['ending'], '')}", [kb.ENDINGS.get(choice["ending"], "다음 단계")], "close", [(close, "결정 요청 · 다음 단계")], True, pin=True)

    # 단계 → 파트 유형 정석 순서 (여러 출처를 섞었으므로 흐름을 다시 세운다)
    so = {s: i for i, s in enumerate(STAGE_ORDER)}
    po = {t: i for i, t in enumerate(PART_ORDER)}
    return [p for _, p in sorted(enumerate(parts), key=lambda x: (so.get(x[1]["stage"], 4), po.get(x[1]["type"], 12), x[0]))]
