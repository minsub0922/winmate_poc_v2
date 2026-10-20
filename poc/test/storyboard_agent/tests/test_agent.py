"""오프라인 회귀 테스트 — python3 -m unittest -v tests.test_agent  (네트워크 · LLM 없이)"""
from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sbagent import baselines  # noqa: E402
from sbagent.agent import design, to_app_parts  # noqa: E402
from sbagent.brief import build_brief, mask_strategy_labels  # noqa: E402
from sbagent.kb import kb  # noqa: E402
from sbagent.llm import Backend  # noqa: E402
from sbagent.planner import build_prompt  # noqa: E402
from sbagent.references import retrieve  # noqa: E402
from sbagent.situation import judge  # noqa: E402

K = kb()
SEEDS = {p["id"]: p for p in json.loads((ROOT / "data" / "seeds.json").read_text(encoding="utf-8"))}


def proposal(sid: str, keep: int = 0) -> dict:
    p = copy.deepcopy(SEEDS[sid])
    story = [x for x in p["parts"] if not x.get("deck")]
    p["parts"] = story[:keep]
    return p


class FakeBackend(Backend):
    """정해 둔 JSON 을 돌려주는 가짜 LLM — 단계별 응답 목록."""
    online = True

    def __init__(self, answers: dict):
        super().__init__()
        self.answers = answers
        self.prompts = []

    def complete(self, stage, system, user, **kw):
        self.prompts.append((stage, system, user))
        a = self.answers.get(stage)
        if a is None:
            from sbagent.llm import BackendError
            raise BackendError("no answer")
        return copy.deepcopy(a)


class TestData(unittest.TestCase):
    def test_kb_loaded(self):
        self.assertEqual(len(K.scenarios), 21)
        self.assertNotIn("cover", [p["type"] for s in K.scenarios for p in s["parts"]])
        self.assertTrue(all(p["type"] in K.PARTS for s in K.scenarios for p in s["parts"]))

    def test_strategy_label_masked(self):
        self.assertEqual(mask_strategy_labels("가치 선도형: 메시지는 표준화"), "메시지는 표준화")
        b = build_brief(proposal("p_case_p3"), K)
        self.assertNotIn("가치 선도형", b.note)


class TestOffline(unittest.TestCase):
    def test_cold_storyboard_is_valid(self):
        for sid in ["p_case_f7", "p_case_p1", "p_case_s1", "p_rfp_shb_monitor", "p_case_r3"]:
            out = design(proposal(sid))
            types = [p["type"] for p in out["parts"]]
            self.assertNotIn("cover", types, sid)
            self.assertIn(types[-1], ("closing", "appendix"), sid)
            lo, hi = out["trace"]["situation"]["budget"]
            self.assertLessEqual(len(types), hi, sid)
            self.assertFalse([i for i in out["issues"] if i["code"] in ("stray", "number", "leak", "keep")], sid)

    def test_continue_keeps_previous_parts(self):
        pr = proposal("p_case_f6", keep=4)
        out = design(pr)
        kept = [p for p in out["parts"] if p["origin"] == "kept"]
        self.assertEqual([p["name"] for p in kept], [p["name"] for p in pr["parts"]])
        new_types = {p["type"] for p in out["parts"] if p["origin"] == "new"}
        self.assertNotIn("market", new_types)  # 이미 있는 맥락 파트를 다시 만들지 않음
        self.assertTrue(to_app_parts(out))

    def test_references_are_diverse_and_avoid_list(self):
        b = build_brief(proposal("p_case_f2"), K)
        refs = retrieve(b, judge(b, K), K)
        self.assertEqual(len(refs), 3)
        self.assertGreaterEqual(len({r.scenario["strategy"] for r in refs}), 2)
        for r in refs:
            for a in r.avoid:
                self.assertNotIn(a, b.source_text)

    def test_app_rules_matches_app_behaviour(self):
        out = baselines.app_rules(proposal("p_case_f2"), K)
        self.assertEqual(len(out["parts"]), 10)  # 기본 템플릿 11개 → 앱 emit 이 10개에서 자름


class TestLLMPath(unittest.TestCase):
    def test_guards_fix_bad_draft(self):
        pr = proposal("p_case_f2", keep=2)
        prev = pr["parts"]
        bad = {"strategy": "pain", "thesis": "병동을 비우지 않고 바꾼다", "ending": "pilot", "parts": [
            {"keep": "P2"}, {"keep": "P1"},  # 순서 바뀜
            {"type": "cover", "name": "표지", "items": ["표지"]},
            {"type": "value", "name": "이해관계자별 가치", "items": ["객실 투숙객 만족", "에너지 37% 절감", "MagicINFO 로 원격 관리"], "answers": ["R1"]},
            {"type": "execution", "name": "무중단 공사", "items": ["반 층씩 공사"], "answers": []},
        ]}
        fb = FakeBackend({"design": bad})
        out = design(pr, fb, {"repair": False})
        names = [p["name"] for p in out["parts"]]
        self.assertEqual(names[:2], [prev[0]["name"], prev[1]["name"]])  # 원래 순서로
        self.assertNotIn("cover", [p["type"] for p in out["parts"]])
        txt = json.dumps(out["parts"], ensure_ascii=False)
        self.assertNotIn("37%", txt)  # 입력에 없는 수치
        self.assertNotIn("MagicINFO", txt)  # 선택하지 않은 솔루션
        self.assertEqual(out["parts"][-1]["type"], "closing")
        codes = {i["code"] for i in out["issues_first"]}
        self.assertTrue({"keep", "type", "number", "stray", "flow"} <= codes, codes)

    def test_strategy_outside_candidates_is_replaced(self):
        pr = proposal("p_case_p3")
        draft = {"strategy": "compete", "thesis": "", "parts": [{"type": "closing", "name": "다음 단계", "items": ["a", "b"]}]}
        out = design(pr, FakeBackend({"design": draft}), {"repair": False})
        b = build_brief(pr, K)
        cands = [k for k, _ in judge(b, K).strategies]
        self.assertIn(out["strategy"]["key"], cands + [out["trace"]["situation"]["strategies"][0][0]])

    def test_prompt_has_cards_not_raw_roles(self):
        pr = proposal("p_case_f2")
        b = build_brief(pr, K)
        sit = judge(b, K)
        refs = retrieve(b, sit, K)
        _, user = build_prompt(b, sit, refs, K)
        self.assertIn("쓰지 말 것", user)
        role = refs[0].scenario["parts"][0]["items"][0]
        self.assertNotIn(role, user)  # 장표 역할 원문은 주지 않는다


class TestGrounding(unittest.TestCase):
    """근거 대조 · 다른 업종 표현 판정의 오탐(live-v1 에서 찾은 것)."""

    SRC = ("연간 에너지 비용 1억 9,000만 원 · 빈 병상 약 37개 · 1차 68곳 · 비수기(11.16~12.18) · 2027.3 완료 · "
           "1차 2026.11~12 · 10/19–10/23 실사 · 최저임금 10,320원 · 46곳 · 15% 목표 · 75인치")

    def test_same_value_other_format_is_supported(self):
        from sbagent.text import number_set, unsupported_numbers
        src = number_set(self.SRC)
        for t in ["1.9억 원", "1억 9천만 원", "19,000만 원", "68개 지점", "비수기(11/16~12/18)", "2027년 3월까지", "10월 19일 실사", "11월 중 발주",
                  "46개 매장", "10,320원", "2026년 11월", "75인치"]:
            self.assertEqual(unsupported_numbers(t, src), [], t)

    def test_new_or_other_unit_is_flagged(self):
        from sbagent.text import number_set, unsupported_numbers
        src = number_set(self.SRC)
        self.assertEqual(unsupported_numbers("에너지 37% 절감", src), ["37%"])  # 37개 ≠ 37%
        self.assertEqual(unsupported_numbers("2,129만 원 절감", src), ["2,129만 원"])
        self.assertEqual(unsupported_numbers("75명", src), ["75명"])  # 75인치 ≠ 75명
        self.assertEqual(unsupported_numbers("2천만 원", src), ["2천만 원"])
        self.assertEqual(unsupported_numbers("5월 오픈", src), ["5월"])  # 원문에 5월이 들어간 날짜 · 연월이 없음

    def test_fix_masks_only_the_claim(self):
        from sbagent.text import number_set, unsupported_claims
        src = number_set(self.SRC)
        y = "1.9억 원 중 37% 절감"
        for c in sorted(unsupported_claims(y, src), key=lambda c: -c[-1][0]):
            a, e, _ = c[-1]
            y = y[:a] + "[확인 필요]" + y[e:]
        self.assertEqual(y, "1.9억 원 중 [확인 필요] 절감")

    def test_previous_storyboard_is_evidence(self):
        from sbagent.text import unsupported_numbers
        b = build_brief(proposal("p_case_f2", keep=2), K)
        self.assertEqual(unsupported_numbers("요양병원 1,342개소 · 65세 이상 21.21%", b.source_numbers), [])
        b0 = build_brief(proposal("p_case_f2", keep=0), K)
        self.assertTrue(unsupported_numbers("요양병원 1,342개소 · 65세 이상 21.21%", b0.source_numbers))

    def test_foreign_terms_false_positives(self):
        from sbagent.references import foreign_terms
        own = "K 리조트 객실 TV 교체 · 스마트 사이니지"
        for t in ["A/S 체계 구축", "K 리조트의 객실", "스마트 사이니지 확대", "TV 시청 경험"]:
            self.assertEqual(foreign_terms(t, own, K, own_ind="HT"), [], t)
        self.assertIn("J 금융", foreign_terms("J 금융의 창구", own, K, own_ind="HT"))
        self.assertIn("마트", foreign_terms("대형 마트 계산대", own, K, own_ind="HT"))


if __name__ == "__main__":
    unittest.main()
