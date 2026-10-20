"""표준 제안서 시나리오(맥락 ① — 요구사항 거의 없음) 생성 → data/standard_scenarios.json

원칙: 전략보다 **업종만** 구분한다. 고객이 고른(또는 업종 기본으로 추천된) 제품 · 솔루션을 축으로
  표지 → (업종 이해) → 제품 · 솔루션별 가치 VP → 솔루션 → 공간별 제품 → 유관 사례 → Why Samsung → 마무리
로 묶는다. 장표는 rule 로 정의되어 고른 제품 수 · 솔루션 · 사례 수에 따라 실제 레이아웃이 정해진다.

JSON 을 직접 고쳐도 되고, 이 스크립트를 고쳐 다시 만들어도 된다.
사용: python scripts/build_standard_scenarios.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from winmate_layout.kb import DATA, get_kb  # noqa: E402

RULES = {
    # 제품 카테고리 → 표준 가치 태그 (업종 top 요구사항 이름과 같은 말을 쓴다)
    "value_map": [
        {"match": "LED|비디오월", "values": ["브랜드 · 공간 임팩트", "고객 경험", "원격 통합 관리"]},
        {"match": "사이니지|이페이퍼", "values": ["고객 경험", "원격 통합 관리", "브랜드 · 공간 임팩트"]},
        {"match": "키오스크", "values": ["업무 효율", "고객 경험", "비용 · 투자 효과"]},
        {"match": "전자칠판|모니터|PC|노트북", "values": ["협업 · 회의", "업무 효율", "교육 · 학습 환경"]},
        {"match": "호텔 TV", "values": ["고객 경험", "원격 통합 관리", "디자인 조화"]},
        {"match": "에어컨|공조|히트펌프|환기", "values": ["쾌적 · 공기질", "에너지 절감", "원격 통합 관리"]},
        {"match": "갤럭시|워치|태그", "values": ["업무 효율", "보안 · 기기 통제", "현장 내구성"]},
        {"match": "빌트인|주방", "values": ["분양 · 자산 가치", "디자인 조화", "고객 경험"]},
        {"match": "리빙가전|세탁", "values": ["고객 경험", "쾌적 · 공기질", "업무 효율"]},
        {"match": "오디오|시네마", "values": ["브랜드 · 공간 임팩트", "고객 경험", "현장 내구성"]},
        {"match": "CMS", "values": ["원격 통합 관리", "콘텐츠 운영", "업무 효율"]},
        {"match": "IoT|에너지|빌딩|제어|공조", "values": ["에너지 절감", "데이터 · 모니터링", "원격 통합 관리"]},
        {"match": "보안|기기 관리|Knox", "values": ["보안 · 기기 통제", "업무 효율", "시스템 연동"]},
        {"match": "바코드|스캔", "values": ["업무 효율", "시스템 연동", "현장 내구성"]},
        {"match": "", "values": ["고객 경험", "업무 효율", "비용 · 투자 효과"]},
    ],
    "products_layout": {"0": "L_SP00", "1": "L_P1B", "2": "L_P2B", "3": "L_P3B", "4": "L_P4B", "5": "L_P5B", "6+": "L_P_T"},
    "value_layout": {"1": "L_VP_G", "2": "L_VP_F2", "3": "L_VP_F", "4": "L_VP_F4"},
    "case_layout": {"0": "L_CL_C", "1": "L_CS01", "2": "L_CS02", "3": "L_CS03", "4+": "L_CL_D"},
    "cover": {"default": "L_C01", "hero": "L_C09"},
    "solution_prefix": {"magicinfo": "MGI", "vxt": "VXT", "stpro": "STP", "biot": "BIT", "lynk": "LYN", "knoxsuite": "KNX",
                        "knoxcapture": "KCP", "dex": "DEX", "coldchain": "CCH", "hvac": "HVC", "sac": "SAC"},
    "solution_generic": "L_VP_J",
    "max_solutions": 2,
    "led_products": ["thewall", "thewall_aio", "led_outdoor", "led_indoor", "onyx", "vm55b"],
    "mobile_products": ["tabs11", "tabactive5", "xcover7", "galaxyA", "watch", "smarttag", "book"],
}

BASE_SECTIONS = [
    {"key": "open", "part": "cover", "name": "표지", "rule": "cover", "core": True, "goal": "고객사 · 제안 범위를 한 장으로"},
    {"key": "industry", "part": "market", "name": "업종 이해", "rule": "industry_mi", "core": False, "goal": "업종 트렌드로 공감대 — 요구가 없을수록 업종 언어로 연다"},
    {"key": "value", "part": "value", "name": "제품 · 솔루션별 핵심 가치", "rule": "value", "core": True, "goal": "선택한 제품 · 솔루션마다 하나의 가치 기둥"},
    {"key": "value_qna", "part": "value", "name": "현장 질문에 답하는 가치", "rule": "value_qna", "core": False, "goal": "업종 현장의 대표 질문 → 제품 · 솔루션 → 가치"},
    {"key": "solution", "part": "solution", "name": "솔루션 소개", "rule": "solution", "core": True, "goal": "선택한 솔루션의 역할 · 연결 제품"},
    {"key": "space_map", "part": "dss", "name": "공간 맵", "rule": "space_map", "core": False, "goal": "어느 공간에 무엇이 놓이는지 먼저"},
    {"key": "products", "part": "products", "name": "공간별 제품", "rule": "products", "core": True, "goal": "공간마다 놓일 제품 · 설치 방식"},
    {"key": "case", "part": "case", "name": "유관 사례", "rule": "cases", "core": True, "goal": "같은 업종 · 같은 제품의 도입 성과"},
    {"key": "why", "part": "why", "name": "Why Samsung", "rule": "why", "core": True, "goal": "삼성이어야 하는 이유 — 강점 셋"},
    {"key": "support", "part": "why", "name": "도입 후 지원 체계", "rule": "support", "core": False, "goal": "설치 · 운영 · AS 를 누가 어떻게"},
    {"key": "close", "part": "closing", "name": "마무리 · 다음 단계", "rule": "closing", "core": True, "goal": "다음 단계 · 담당자"},
]

# 업종별 차이 — 전략이 아니라 업종의 장표 언어만 바꾼다
VARIANTS = {
    "FB": {"value_qna": "L_VP_U", "support": "L_SV_B", "note": "카운터 · 메뉴보드 · DT 등 매장 동선 중심"},
    "RT": {"value_qna": "L_VP_UC_RT", "support": "L_SV_B", "note": "쇼윈도 · VMD · 계산대 등 매장 경험 중심"},
    "SV": {"support": "L_SV_B", "note": "무인 운영 · 다점포 원격 관리 중심"},
    "HT": {"value_qna": "L_VP_U_HT", "support": "L_SV_C", "note": "객실 · 로비 · 연회장 투숙 경험 중심"},
    "TP": {"products_led": "L_P_L", "support": "L_SV_C", "note": "몰입형 체험 · 대형 LED 중심"},
    "VN": {"products_led": "L_P_L", "support": "L_SV_C", "note": "관람 경험 · LED 빅보드 중심"},
    "AD": {"products_led": "L_P_L", "support": "L_SV_B", "note": "매체 가치 · 옥외 내구성 중심"},
    "OF": {"support": "L_SV_C", "note": "로비 · 업무층 · 회의실 경험과 통합 관제"},
    "RS": {"extra_after_value": {"key": "sales_point", "part": "value", "name": "분양 포인트", "layout": "L_RV_A", "core": True, "goal": "단지 차별화 포인트"},
           "products_multi": "L_P_R", "support": "L_SV_C", "note": "세대 · 모델하우스 · 분양 가치 중심"},
    "ID": {"products_multi": "L_P_R", "support": "L_SV_C", "note": "빌트인 · 쇼룸 · 시공 파트너 중심"},
    "ED": {"support": "L_SV_C", "note": "강의실 · 도서관 · 기숙사 학습 환경 중심"},
    "PB": {"support": "L_SV_B", "note": "현장 내구성 · 안전 · 관제 중심"},
    "MD": {"value_qna": "L_VP_U_MD", "support": "L_SV_B", "note": "병동 · 환자 경험 · 감염 관리 중심"},
    "MF": {"products_mobile": "L_P_Q", "support": "L_SV_B", "note": "현장 단말 · 내구성 · 보안 중심"},
    "FN": {"support": "L_SV_B", "note": "창구 · 상담 · 보안 통제 중심"},
    "OE": {"extra_after_value": {"key": "edition", "part": "execution", "name": "전용 에디션 사양", "layout": "L_CU_A", "core": True, "goal": "파트너 맞춤 사양"},
           "products_mobile": "L_P_Q", "support": "L_SV_C", "note": "파트너 전용 단말 · 맞춤 개발 중심"},
}


def build() -> dict:
    kb = get_kb()
    scenarios = [{
        "id": "STD-BASE", "ind": None, "title": "표준 제안서 · 업종 공통",
        "short": "업종을 모를 때 — 선택 제품 · 솔루션의 가치 → 공간별 제품 → 사례 → Why Samsung",
        "sections": BASE_SECTIONS, "variant": {}, "note": "업종 공통 레이아웃만 사용",
    }]
    for ind in kb.IND:
        v = VARIANTS.get(ind, {})
        secs = []
        for s in BASE_SECTIONS:
            secs.append(dict(s))
            if s["key"] == "value" and "extra_after_value" in v:
                e = v["extra_after_value"]
                secs.append({"key": e["key"], "part": e["part"], "name": e["name"], "rule": "fixed", "layouts": [e["layout"]], "core": e["core"], "goal": e["goal"]})
        name = kb.IND[ind]["name"]
        scenarios.append({
            "id": f"STD-{ind}", "ind": ind, "title": f"표준 제안서 · {name}",
            "short": f"{name} — {v.get('note', '')}. 업종 top 요구: {', '.join(kb.IND[ind]['top'][:3])}",
            "sections": secs, "variant": {k: val for k, val in v.items() if k not in ('extra_after_value', 'note')}, "note": v.get("note", ""),
            "top_values": kb.IND[ind]["top"],
        })
    # 검증: 모든 고정 레이아웃이 catalog 에 있어야 함
    for s in scenarios:
        for sec in s["sections"]:
            for f in sec.get("layouts", []):
                assert f in kb.L, (s["id"], f)
        for k, f in s["variant"].items():
            assert f in kb.L, (s["id"], k, f)
    for k in ("products_layout", "value_layout", "case_layout"):
        for f in RULES[k].values():
            assert f in kb.L, (k, f)
    return {"version": 1, "principle": "요구사항이 거의 없을 때(업종 · 선택 제품만 있음) — 전략보다 업종만 구분해, 선택 제품 · 솔루션별 가치 VP → 공간별 제품 → 유관 사례 → Why Samsung 으로 묶은 표준 제안서", "rules": RULES, "scenarios": scenarios}


if __name__ == "__main__":
    d = build()
    (DATA / "standard_scenarios.json").write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    print("standard scenarios:", len(d["scenarios"]))
