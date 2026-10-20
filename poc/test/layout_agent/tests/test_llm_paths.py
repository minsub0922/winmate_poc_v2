"""LLM(Gemini) 경로 스모크 테스트 — 네트워크 없이, 구조화 출력을 흉내 내는 가짜 모델로 LLM 결과 병합 코드를 끝까지 돌린다.

실제 Gemini 품질은 `python eval/run_eval.py --llm gemini` 로 확인한다(이 테스트는 '깨지지 않는가'와 '검증 규칙이 LLM 출력에도 걸리는가'만 본다).
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from langchain_core.runnables import RunnableLambda  # noqa: E402

from winmate_layout import schemas as S  # noqa: E402
from winmate_layout.graph import build_graph, current_fills  # noqa: E402
from winmate_layout.kb import get_kb  # noqa: E402
from winmate_layout.llm import LLM  # noqa: E402
from winmate_layout.retrieval import LayoutIndex  # noqa: E402


def _data_blocks(text: str) -> list[str]:
    return re.findall(r"<<<DATA\n(.*?)\nDATA>>>", text, re.S)


class FakeGemini:
    """with_structured_output(schema) 만 흉내 — 프롬프트의 DATA 블록을 읽어 그럴듯한 구조화 답을 만든다."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def with_structured_output(self, schema):
        def run(messages):
            user = messages[-1][1]
            self.calls.append(schema.__name__)
            data = _data_blocks(user)
            if schema is S.LLMAnalysis:
                ids = re.findall(r"^(R\d\d) ", data[0], re.M) if data else []
                return S.LLMAnalysis(context_level="complex", level_reason="가짜 판정",
                                     labels=[S.LLMReqLabel(id=i, category="운영·관리", priority="must", parts=["solution"]) for i in ids[:3]] + [S.LLMReqLabel(id="R99", category="x")],
                                     missing=[S.LLMReq(text="놓친 요구(가짜)", category="운영·관리", priority="should", keyman="총무부", parts=["solution"]),
                                              S.LLMReq(text="근거 없는 수치 999% 절감", category="성과·KPI", priority="should", parts=["effect"])],  # 원문에 없는 숫자 → 버려져야 함
                                     summary="가짜 요약")
            if schema is S.LLMScenarioPick:
                ids = re.findall(r"bs\d\d", data[-1]) if data else []
                return S.LLMScenarioPick(order=ids[::-1], reasons=[S.LLMReason(id=i, reason="가짜 이유") for i in ids])
            if schema is S.LLMStoryItems:
                parts = ast.literal_eval(data[-1])
                return S.LLMStoryItems(parts=[S.LLMPart(i=p["i"], type=p["type"], name=p["name"] + "·", items=["고객 맞춤 문장", "수치 777개 포함"]) for p in parts][::-1])
            if schema is S.LLMLayoutPick:
                fs = re.findall(r"'f': '(L_[A-Z0-9_]+)'", data[-1])
                return S.LLMLayoutPick(primary=fs[1] if len(fs) > 1 else fs[0], alternates=fs[:1], reason="가짜 선택")
            if schema is S.LLMLayoutPicks:
                rows = json.loads(data[-1])
                return S.LLMLayoutPicks(picks=[S.LLMSlidePick(key=r["key"], primary=r["candidates"][min(1, len(r["candidates"]) - 1)]["f"], reason="가짜 선택") for r in rows])
            if schema is S.LLMFill:
                slots = ast.literal_eval(data[-1])
                return S.LLMFill(blocks=[S.LLMSlot(i=s["i"], s="LLM 문장 12345") if k == 0 else S.LLMSlot(i=s["i"], s="LLM 문장") for k, s in enumerate(slots[:4])])
            if schema is S.LLMDecomposition:
                return S.LLMDecomposition(conflicts=["R01 과 R02 가 부딪힘"], gaps=["예산 범위"], strategy_ranking=["rfp", "compete"],
                                          questions=[S.LLMQuestion(id="extra", question="추가 질문?", options=["a", "b"], default="a")])
            raise AssertionError(schema)
        return RunnableLambda(run)


def test_llm_merge_paths_do_not_break_rules():
    kb = get_kb()
    llm = LLM("offline")
    fake = FakeGemini()
    llm.mode, llm._chat = "gemini", fake  # online 경로 강제
    g = build_graph(kb, llm, LayoutIndex(kb))
    tc = json.loads((ROOT / "eval" / "cases" / "C04_L3.json").read_text(encoding="utf-8"))
    st = g.invoke({"input": tc["input"], "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "fake"}})
    assert {"LLMAnalysis", "LLMDecomposition", "LLMStoryItems", "LLMLayoutPicks", "LLMFill"} <= set(fake.calls)
    a = st["analysis"]
    assert a["llm"] is True
    assert st["analysis"]["context_level"] == "complex"  # 평가 구조가 있으면 규칙 판정이 우선
    assert all("999" not in r["text"] for r in a["requirements"])  # 원문에 없는 수치 요구는 버림
    added = [r for r in a["requirements"] if r.get("llm_added")]
    assert added and added[0]["keyman"] == "총무부 · 도입담당" and added[0]["weight"] > 0  # 키맨 이름 부분 일치 → 가중치 유지
    assert any(r.get("llm_label") for r in a["requirements"])
    assert all("777" not in x for p in st["parts"] for x in p["items"])  # 원문에 없는 수치 items 는 버림
    fills = current_fills(st)
    assert fills and any(f["llm"] for f in fills)
    assert all("12345" not in v for f in fills for v in f["texts"].values())  # 근거 없는 숫자는 LLM 칸이어도 거부
    assert st["slides"] and not st["review"]["industry_violations"]


def test_llm_best_pick_respects_candidates():
    from winmate_layout.analysis import Analyzer
    from winmate_layout.scenarios import match_best, resolve_context
    from winmate_layout.schemas import ProposalInput

    kb = get_kb()
    llm = LLM("offline")
    llm.mode, llm._chat = "gemini", FakeGemini()
    tc = json.loads((ROOT / "eval" / "cases" / "C03_L2.json").read_text(encoding="utf-8"))
    inp = ProposalInput.model_validate(tc["input"])
    an = Analyzer(kb)  # 규칙 분석만
    a = an.run(inp)
    full = an.full_text(inp)
    ctx = resolve_context(kb, inp, a, full)
    rule = match_best(kb, a, ctx, full, None)
    m = match_best(kb, a, ctx, full, llm)
    assert m["llm"] and m["chosen"] in {c["id"] for c in rule["candidates"]} | {r for r in kb.BS}
    assert m["chosen"] != rule["chosen"] or len(m["candidates"]) >= 1


def test_llm_layout_pick_is_used():
    kb = get_kb()
    llm = LLM("offline")
    fake = FakeGemini()
    llm.mode, llm._chat = "gemini", fake
    g = build_graph(kb, llm, LayoutIndex(kb))
    tc = json.loads((ROOT / "eval" / "cases" / "C01_L1.json").read_text(encoding="utf-8"))
    st = g.invoke({"input": tc["input"], "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "pick"}})
    # 가짜 모델은 항상 두 번째 후보를 고른다 → 대부분의 슬라이드에 반영돼야 한다(중복 회피로 일부는 다를 수 있음)
    llm_first = sum(1 for s in st["slides"] if s["why"] and s["why"][0].startswith("LLM"))
    assert llm_first >= len(st["slides"]) * 0.6


def test_llm_rerank_keeps_rule_top_and_user_choice_wins():
    """LLM 이 전략 후보에서 rfp 를 빼도(평가표가 있는 입찰) rfp 는 후보에 남고, 사용자가 후보 밖 전략을 골라도 따른다."""
    from langgraph.types import Command

    kb = get_kb()
    llm = LLM("offline")
    fake = FakeGemini()
    orig = fake.with_structured_output

    def wso(schema):
        if schema is S.LLMDecomposition:
            return RunnableLambda(lambda m: S.LLMDecomposition(conflicts=[], gaps=[], strategy_ranking=["value", "compete", "land"], questions=[]))
        return orig(schema)
    fake.with_structured_output = wso
    llm.mode, llm._chat = "gemini", fake
    g = build_graph(kb, llm, LayoutIndex(kb))
    tc = json.loads((ROOT / "eval" / "cases" / "C04_L3.json").read_text(encoding="utf-8"))
    cfg = {"configurable": {"thread_id": "rerank"}}
    g.invoke({"input": tc["input"], "options": {}}, config=cfg)
    q = g.get_state(cfg).tasks[0].interrupts[0].value
    assert "rfp" in [o["strategy"] for o in q["strategy_options"]]
    g.invoke(Command(resume={"strategy": "pain"}), config=cfg)  # 후보 3개 밖
    st = g.get_state(cfg).values
    assert st["choice"]["strategy"] == "pain"
    assert any("strategy:pain" in str(p.get("source", "")) for p in st["parts"]) or any(p["type"] == "challenge" for p in st["parts"])
