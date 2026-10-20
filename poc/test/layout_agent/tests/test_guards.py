"""고객 화면 검사(guards) — 1018 평가에서 나온 문제가 다시 나오지 않는가.

가짜 LLM 이 일부러 나쁜 문장(충족 주장 · 단위 틀린 숫자 · 담당자 메모 · 연락처 · 고객사 인용)을 돌려줘도 최종 화면에 남지 않아야 한다.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from langchain_core.runnables import RunnableLambda  # noqa: E402
from test_llm_paths import FakeGemini  # noqa: E402

from winmate_layout import guards as G  # noqa: E402
from winmate_layout import schemas as S  # noqa: E402
from winmate_layout.analysis import requested_items, split_bundle  # noqa: E402
from winmate_layout.decompose import eval_structure  # noqa: E402
from winmate_layout.graph import build_graph, current_fills  # noqa: E402
from winmate_layout.kb import get_kb  # noqa: E402
from winmate_layout.llm import LLM  # noqa: E402
from winmate_layout.retrieval import LayoutIndex  # noqa: E402
from winmate_layout.schemas import ProposalInput  # noqa: E402

BAD = ["완료", "요구사항 100% 완벽 대응", "경쟁사 대비 90점 우위", "병실 10~15실 운영", "장애 대응 15분 이내",
       "가격보다 설치·연수 체계로 승부", "— 가람시교육청 장학관", "b2b.partner@samsung.com", "02-1234-5678", "Y"]


class AdversarialGemini(FakeGemini):
    """LLMFill 만 나쁜 문장을 돌려준다(다른 스키마는 FakeGemini 그대로)."""

    def with_structured_output(self, schema):
        if schema is not S.LLMFill:
            return super().with_structured_output(schema)

        def run(messages):
            self.calls.append(schema.__name__)
            data = re.findall(r"<<<DATA\n(.*?)\nDATA>>>", messages[-1][1], re.S)
            slots = ast.literal_eval(data[-1])
            free = [s for s in slots if not s.get("locked")]
            return S.LLMFill(blocks=[S.LLMSlot(i=s["i"], s=BAD[k % len(BAD)]) for k, s in enumerate(free)])
        return RunnableLambda(run)


def test_unit_guards():
    assert G.claims("요구사항 100% 충족") and G.claims("업계 최초 적용") and not G.claims("요구사항과 대응 방향")
    assert G.claims("100% 충족", source_text="규격 100% 충족 필수") == []  # 고객 원문 인용은 주장 아님
    facts = G.unit_facts("밝기 300cd 이상 · 980대 · 6개월")
    assert G.bad_unit_numbers("980대 납품", facts) == [] and G.bad_unit_numbers("10~15실", facts)
    grams = G.internal_grams("경쟁사 보급형 저가 공세 예상되니 가격보다 설치·연수·AS 체계로 승부", "", "")
    assert G.leaks("경쟁사 보급형 저가 공세 예상되니 가격보다 설치", grams) and not G.leaks("설치 · 연수 지원 체계", grams)
    assert G.leaks("이 방향이면 먹힐 듯", set())  # 메모 말투
    assert G.contact_names("문의: 총무파트 윤원빈 과장(02-6900-2340)") == {"윤원빈"}
    assert G.scrub_pages("근거 RFP p.3 · 사양서 p.02") == "근거 RFP p.[00] · 사양서 p.[00]"


def test_bundle_split_and_items():
    line = "[규격] 모니터 해상도는 27인치 UHD 4K (3840 x 2160)이어야 함 · 모니터는 Pivot, Elevation, Swivel, Tilt 조절이 가능해야 함 · 제품 컬러는 Black이어야 함"
    parts = split_bundle(line)
    assert len(parts) == 3 and all(p.startswith("[규격] ") for p in parts)
    assert split_bundle("QM55C · OM55B") == ["QM55C · OM55B"]  # 짧은 나열은 그대로
    ev = eval_structure("| 평가부문 | 평가항목 | 배점 |\n|---|---|---|\n| 사업 이해 | 목적 | 10 |\n| 제품 성능 | 화질 | 20 |\n| 합계 | | 30 |\n협상에 의한 계약")
    assert ev["items"] == [("사업 이해", "10"), ("제품 성능", "20")]
    kb = get_kb()
    inp = ProposalInput(customer="신한은행", project="흑백프린터 도입 추진 (152대)")
    it = requested_items(inp, kb)
    assert it and it[0]["label"] == "프린터" and not it[0]["in_catalog"]


def _blind(cid: str) -> dict:
    return json.loads((ROOT / "eval" / "blind1018" / f"{cid}.json").read_text(encoding="utf-8"))["input"]


def test_bad_llm_text_never_reaches_slides():
    kb = get_kb()
    llm = LLM("offline")
    llm.mode, llm._chat = "gemini", AdversarialGemini()
    g = build_graph(kb, llm, LayoutIndex(kb))
    inp = _blind("B06")
    st = g.invoke({"input": inp, "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "adv"}})
    fills = current_fills(st)
    src = json.dumps(inp, ensure_ascii=False)
    shown = [(f["code"], k, v) for f in fills for k, v in f["texts"].items() if f["sources"].get(k) != "context"]
    for bad in BAD:
        if bad in src:
            continue
        hits = [x for x in shown if x[2].strip() == bad or (len(bad) > 2 and bad in x[2])]
        assert not hits, (bad, hits[:3])
    # 담당자 메모 문장은 어떤 칸에도 그대로 나오지 않는다
    grams = set(st["analysis"]["internal_grams"])
    assert grams and not [x for x in shown if G.leaks(x[2], grams)]


def test_missing_item_flagged_without_fake_products():
    kb = get_kb()
    g = build_graph(kb, LLM("offline"), LayoutIndex(kb))
    form = json.loads((ROOT / "eval" / "rfp_forms" / "TC1.json").read_text(encoding="utf-8"))
    inp = {"customer": form["customer"], "project": form["project"], "free_text": form["free"], "note": form["note"],
           "keymen": [{"name": k["name"], "weight": k["weight"], "reqs": k["reqs"]} for k in form["keymen"]]}
    st = g.invoke({"input": inp, "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "tc1"}})
    assert st["ctx"]["products"] == [] and st["ctx"]["missing_items"] == ["프린터"]
    assert any("카탈로그에 없는" in i["msg"] for i in st["review"]["issues"])
    codes = [s["code"] for s in st["slides"]]
    assert codes.count("RM-B") >= 2  # 요구가 많으면 대응표가 이어진다


def test_peer_photos_and_contact_lines():
    assert G.peer_photo("영업점 객장 (KB국민은행)", "신한은행")  # 경쟁 은행 간판
    assert G.peer_photo("은행 영업점 (KEB하나은행 사진을 흑백으로 생성)", "신한은행")  # 원본 출처로 판단
    assert not G.peer_photo("대강당 LED 사이니지 (신한은행)", "신한은행")  # 고객 자신
    assert not G.peer_photo("갤럭시 탭 DeX 화면 (samsung.com)", "신한은행")
    assert not G.peer_photo("재활치료실 (성심요양병원)", "늘봄요양병원")  # 간판 업종이 아니면 그대로


def test_rfp_tables_counts_and_photos():
    kb = get_kb()
    g = build_graph(kb, LLM("offline"), LayoutIndex(kb))
    form = json.loads((ROOT / "eval" / "rfp_forms" / "TC3.json").read_text(encoding="utf-8"))
    inp = {"customer": form["customer"], "project": form["project"], "free_text": form["free"], "note": form["note"], "products": ["smartmonitor"],
           "keymen": [{"name": k["name"], "weight": k["weight"], "reqs": k["reqs"]} for k in form["keymen"]]}
    st = g.invoke({"input": inp, "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "tc3"}})
    reqs = st["analysis"]["requirements"]
    assert not [r for r in reqs if "연락처는" in r["text"] and not r.get("procedural")]  # 담당자 연락처 줄은 요구 대응표에 안 나온다
    fills = current_fills(st)
    rmb = [f for f in fills if f["code"] == "RM-B"]
    assert len(rmb) >= 2
    for f in rmb:
        tx = " | ".join(f["texts"].values())
        assert "[00]개" not in tx and "[00]–" not in tx and "[00]" not in re.findall(r"\S+ / \d+", tx)[0]
        assert not re.search(r"[A-Z]{3}-\[0+\]", tx)  # 남는 행에 샘플 ID 가 남지 않는다
    last = rmb[-1]["texts"]
    assert any(re.fullmatch(r"\d+–(\d+) / \1", v) for v in last.values())  # 마지막 쪽 = 끝 번호 / 전체
    for f in fills:
        for v in (f.get("images") or {}).values():
            assert not (v.get("label") and G.peer_photo(v["label"], inp["customer"])), v["label"]


def test_review2_guards():
    # 2차 독립 검수(10/18)에서 나온 문구 — 데이터 없이 내린 결론 · '실제 현장' 표기 · 다른 업종 흔적
    assert G.claims("3년차에 역전") and G.claims("업계보다 높음") and G.claims("현장 조사 · 실측 포함") and not G.claims("경쟁 안 대비")
    assert G.soften_reality("사진은 실제 서비스 현장") == "참고 이미지" and G.soften_reality("현재 매장 모습") == "참고 이미지"
    assert G.foreign_markers("은행 시스템과 연동 필요", "ED") == ["은행"] and G.drop_foreign_pieces("교실 · 병실", "MD") == "병실"
    assert G.foreign_categories("DMS 통합 관리", {"LCD 사이니지"}) and G.foreign_categories("+ 전자서식 앱", {"공조 · 환기"})


def test_eval_tables_and_keyman_weights():
    kb = get_kb()
    g = build_graph(kb, LLM("offline"), LayoutIndex(kb))
    st = g.invoke({"input": _blind("B06"), "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "b06"}})
    fills = current_fills(st)
    rmc = next(f for f in fills if f["code"] == "RM-C")
    vals = list(rmc["texts"].values())
    assert "80" in vals and "20" in vals and "배점 비중 100" in vals  # 기술 80 · 가격 20 — 표와 합계가 맞는다
    weights = {f"{int(k['weight'])}%" for k in st["analysis"]["keymen"] if k.get("weight")}
    shown = " | ".join(v for f in fills for v in f["texts"].values())
    assert not [w for w in weights if w in shown]  # 키맨 영향력 비중은 화면에 없다
    assert "“" not in shown  # 키맨 요구를 따옴표 인용으로 꾸미지 않는다
    tc3 = json.loads((ROOT / "eval" / "rfp_forms" / "TC3.json").read_text(encoding="utf-8"))
    st3 = g.invoke({"input": {"customer": tc3["customer"], "project": tc3["project"], "free_text": tc3["free"], "note": tc3["note"], "products": ["smartmonitor"],
                              "keymen": [{"name": k["name"], "weight": k["weight"], "reqs": k["reqs"]} for k in tc3["keymen"]]},
                    "options": {"auto_answer": True}}, config={"configurable": {"thread_id": "tc3b"}})
    f3 = current_fills(st3)
    assert not [f for f in f3 if f["code"] == "SE-A"]  # 보안 요구가 없으면 보안 대응표도 없다
    rq = [f for f in f3 if f["code"] in ("RM-C", "PH-RQ-B")]
    assert rq and not [v for f in rq for v in f["texts"].values() if re.search(r"사업 이해도|수행 실적|시스템 구성", v)]  # 가격 100점 입찰에 기술 항목을 만들지 않는다
    r01 = next(r for r in st3["analysis"]["requirements"] if r["text"].startswith("모니터 해상도는 27인치"))
    assert r01["priority"] == "must"  # '…이어야 함' 은 필수
