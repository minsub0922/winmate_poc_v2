"""회귀 테스트 — 오프라인(결정론) 백엔드로 돌아간다.  실행: pytest -q"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from winmate_layout.analysis import Analyzer  # noqa: E402
from winmate_layout.graph import build_graph, current_fills  # noqa: E402
from winmate_layout.kb import get_kb  # noqa: E402
from winmate_layout.llm import LLM  # noqa: E402
from winmate_layout.retrieval import LayoutIndex  # noqa: E402
from winmate_layout.scenarios import resolve_standard  # noqa: E402
from winmate_layout.schemas import ProposalInput  # noqa: E402
from winmate_layout.slots import parse_layout  # noqa: E402
from winmate_layout.text import number_values  # noqa: E402

CASES = sorted((ROOT / "eval" / "cases").glob("*.json"))


@pytest.fixture(scope="module")
def kb():
    return get_kb()


@pytest.fixture(scope="module")
def index(kb):
    return LayoutIndex(kb)


@pytest.fixture(scope="module")
def graph(kb, index):
    return build_graph(kb, LLM("offline"), index)


def load(name):
    return json.loads((ROOT / "eval" / "cases" / f"{name}.json").read_text(encoding="utf-8"))


def test_cards_cover_all_layouts(kb):
    assert len(kb.cards) == len(kb.layouts) >= 820  # catalog 446 + 사진 중심 334 + 표준 40
    assert sum(1 for c in kb.cards.values() if not c.get("retired")) >= 570  # 앱에서 대체된 텍스트 장은 고르지 않는다
    c = kb.cards["L_VP_F"]
    assert c["part"] == "value" and c["capacity"] == 3 and c["slots"]["texts"]
    assert {"strategy_fit", "req_type_fit", "level_fit", "visual", "data_needs", "embed_text", "static_text"} <= set(c)


def test_slot_roles(kb):
    d = parse_layout(kb.html["L_MI01"])
    roles = {t["i"]: t["role"] for t in d["texts"]}
    assert roles[0] == "eyebrow" and roles[1] == "headline" and roles[3] == "kpi"


@pytest.mark.parametrize("path", CASES, ids=[p.stem for p in CASES])
def test_context_level(kb, path):
    tc = json.loads(path.read_text(encoding="utf-8"))
    a = Analyzer(kb).run(ProposalInput.model_validate(tc["input"]))
    assert a["context_level"] == tc["gold"]["level"], a["level_reason"]
    assert a["industry"] == tc["gold"]["industry"]


def test_retrieval_finds_eval_table(kb, index):
    top = [f for f, _, _ in index.search("평가 항목 배점 대응 RFP", k=5)]
    assert "L_RM_C" in top


def test_standard_scenarios_resolve(kb):
    ctx = {"industry": None, "industry_name": "", "customer": "고객", "project": "", "products": ["qm55c", "kiosk"], "solutions": ["magicinfo"],
           "cases": [str(kb.cases[0]["id"])], "spaces": ["카운터"]}
    for sid, s in kb.standard_scenarios.items():
        ctx["industry"] = s["ind"]
        parts = resolve_standard(kb, sid, ctx)
        types = {p["type"] for p in parts}
        assert {"value", "products", "case", "why"} <= types, sid
        for p in parts:
            for sl in p["seed_layouts"]:
                assert sl["f"] in kb.L
                assert not kb.L[sl["f"]]["ind"] or kb.L[sl["f"]]["ind"] == s["ind"], (sid, sl["f"])


@pytest.mark.parametrize("name,route", [("C01_L1", "standard"), ("C03_L2", "best"), ("C04_L3", "decompose")])
def test_graph_routes_and_deck_hygiene(kb, graph, name, route):
    tc = load(name)
    st = graph.invoke({"input": tc["input"], "options": {"auto_answer": True}}, config={"configurable": {"thread_id": name}})
    assert st["route"] == route
    assert st["slides"], "슬라이드가 없음"
    rv = st["review"]
    assert not rv["industry_violations"] and not rv["solution_violations"] and not rv["duplicates"]
    fills = current_fills(st)
    assert all(not f["checks"]["sample_leak"] for f in fills)


def test_no_unsupported_numbers(kb, graph):
    """채운 글자에 원문 · 카탈로그 · 원래 장표에 없는 숫자가 없어야 한다(수치 지어내기 금지)."""
    tc = load("C09_L3")
    st = graph.invoke({"input": tc["input"], "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "nums"}})
    for f in current_fills(st):
        assert not f["checks"]["unsupported_numbers"], f["f"]


def test_interrupt_and_resume(graph):
    tc = load("C07_L3")
    cfg = {"configurable": {"thread_id": "hitl"}}
    graph.invoke({"input": tc["input"], "options": {}}, config=cfg)
    snap = graph.get_state(cfg)
    assert snap.next and snap.tasks[0].interrupts
    payload = snap.tasks[0].interrupts[0].value
    ids = {q["id"] for q in payload["questions"]}
    assert {"strategy", "ending", "length"} <= ids
    from langgraph.types import Command

    graph.invoke(Command(resume={"strategy": "compete", "length": "15"}), config=cfg)
    st = graph.get_state(cfg).values
    assert st["choice"]["strategy"] == "compete" and st["slides"]


def test_requirements_reach_slides(kb, graph):
    tc = load("C02_L3")
    st = graph.invoke({"input": tc["input"], "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "trace"}})
    assert st["review"]["req_coverage"] >= 0.9
    assert not st["review"]["must_uncovered"]


def test_scrub_sample_numbers():
    from winmate_layout.fill import Filler

    out = Filler.scrub_numbers("한 번 올리면 320개 매장이 같은 화면으로 · 24/7", {"24", "7"})
    assert "320" not in out and "[000]개" in out and "24/7" in out
    assert number_values("[00]%") == set()


def test_strategy_agent_scripted(kb, index):
    pytest.importorskip("deepagents")
    from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
    from langchain_core.messages import AIMessage

    from winmate_layout.strategy_agent import StrategySession

    class Scripted(GenericFakeChatModel):
        def bind_tools(self, tools, **kw):
            return self

    msgs = iter([
        AIMessage(content="", tool_calls=[{"name": "get_decomposition", "args": {}, "id": "1"}]),
        AIMessage(content="", tool_calls=[{"name": "set_answers", "args": {"answers_json": "{\"strategy\": \"rfp\"}"}, "id": "2"}]),
        AIMessage(content="", tool_calls=[{"name": "finalize", "args": {}, "id": "3"}]),
        AIMessage(content="확정했습니다."),
    ])
    g = build_graph(kb, LLM("offline"), index)
    cfg = {"configurable": {"thread_id": "agent"}}
    g.invoke({"input": load("C04_L3")["input"], "options": {}}, config=cfg)
    sess = StrategySession(g, cfg, kb, index, Scripted(messages=msgs))
    sess.chat("시작")
    assert sess.finalized and sess.answers["strategy"] == "rfp"
    st = sess.resume()
    assert st["choice"]["strategy"] == "rfp" and st["slides"]


def _interrupted(graph, name, tid):
    from langgraph.types import Command  # noqa: F401
    cfg = {"configurable": {"thread_id": tid}}
    graph.invoke({"input": load(name)["input"], "options": {}}, config=cfg)
    snap = graph.get_state(cfg)
    return cfg, snap.tasks[0].interrupts[0].value


def test_interview_answers_change_the_deck(graph):
    """인터뷰 답이 실제로 반영되어야 한다 — 빈 정보 값은 요구(I01…)로, 충돌 선택지는 다른 장표로."""
    from langgraph.types import Command

    # 1) 빈 정보(예산)에 값을 답하면 요구 · 수치 근거가 된다
    cfg, q = _interrupted(graph, "C02_L3", "iv-gap")
    assert "gap_budget" in {x["id"] for x in q["questions"]}
    graph.invoke(Command(resume={"gap_budget": "예산 3억 원, 5년 렌탈 선호"}), config=cfg)
    st = graph.get_state(cfg).values
    iv = [r for r in st["analysis"]["requirements"] if r.get("interview")]
    assert iv and "3억" in iv[0]["text"] and iv[0]["category"] == "예산·비용"
    assert any(iv[0]["id"] in p["req_ids"] for p in st["parts"])
    assert "3억" in st["full_text"]  # 값 입력 단계에서 근거 있는 수치로 쓰인다
    # 2) 충돌 선택지마다 다른 장표 — 가격 vs 규격(C1)
    seeds = {}
    for k in (0, 1):
        cfg, q = _interrupted(graph, "C04_L3", f"iv-c1-{k}")
        graph.invoke(Command(resume={"conflict_C1": q["conflicts"][0]["options"][k]}), config=cfg)
        st = graph.get_state(cfg).values
        seeds[k] = {sl.get("f") for p in st["parts"] for sl in p["seed_layouts"]}
        assert any(p.get("direction") == q["conflicts"][0]["options"][k] for p in st["parts"])
    assert "L_BM_A" in seeds[0] and "L_CO_B" in seeds[1]
    # 3) 보안 vs 원격(C3) — '망연계'를 고르면 연동 구조 장표
    cfg, q = _interrupted(graph, "C06_L3", "iv-c3")
    c3 = next(c for c in q["conflicts"] if c["id"] == "C3")
    graph.invoke(Command(resume={"conflict_C3": c3["options"][2]}), config=cfg)
    st = graph.get_state(cfg).values
    assert "L_IG_B" in {sl.get("f") for p in st["parts"] for sl in p["seed_layouts"]}


def test_procedural_and_contact_lines(kb, graph):
    st = graph.invoke({"input": load("C04_L3")["input"], "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "proc"}})
    reqs = st["analysis"]["requirements"]
    assert not any(re.search(r"☎|\d{2,4}-\d{3,4}-\d{4}|담당자\s*:", r["text"]) for r in reqs), "연락처 줄은 요구가 아니다"
    proc = [r for r in reqs if r["procedural"]]
    assert proc and all(r["priority"] == "could" for r in proc)
    for kw in ("청렴", "추첨", "입찰보증금", "부정당", "무효"):
        assert all(r["procedural"] for r in reqs if kw in r["text"]), kw
    parts = st["parts"]
    for r in proc:
        hold = [p for p in parts if r["id"] in p["req_ids"]]
        assert all(p["type"] == "requirements" and any(sl.get("f") == "L_RM_B" for sl in p["seed_layouts"]) for p in hold), (r["id"], [p["name"] for p in hold])
    assert any("27인치" in i["msg"] and "S32DM80" in i["msg"] for i in st["review"]["issues"]), "27인치 RFP 에 32인치 제품 — 규격 불일치를 알려야 한다"


def test_bom_and_space_matrix_have_no_sample_rows(kb, graph):
    st = graph.invoke({"input": load("C04_L3")["input"], "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "bom"}})
    bom = next(f for f in current_fills(st) if f["code"] in ("BM-A", "PH-BM-A"))  # 앱이 BM-A 를 사진 버전(PH-BM-A)으로 대체
    card = kb.cards[bom["f"]]
    final = {str(t["i"]): t["s"] for t in card["slots"]["texts"]}
    final.update(bom["texts"])
    vals = " ".join(final.values())
    assert "S32DM80" in vals and "980" in vals
    assert not re.search(r"QM\d\dC|OH55C|KM24C|MagicINFO|×320|시스템에어컨|키오스크", vals)
    st = graph.invoke({"input": load("C08_L1")["input"], "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "smb"}})
    assert "객실" not in st["ctx"]["spaces"]  # 주거 고객에게 호텔 공간을 붙이지 않는다
    smb = [f for f in current_fills(st) if f["code"] == "SM-B"]
    for f in smb:
        v = " ".join(f["texts"].values())
        assert not re.search(r"QM\d\dC|OH55C|KM24C|매장 외부|픽업대", v)
