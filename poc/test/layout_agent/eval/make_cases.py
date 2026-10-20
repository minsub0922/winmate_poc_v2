"""TC 생성 — 10개 case(업종 × 전략) × 3개 요구사항 복잡도(minimal · ambiguous · complex) = 30 TC.

case 축: 업종 10종이 모두 다르고, 7개 전략(가치 · 문제 · 공간 · 투자회수 · 요구대응 · 경쟁우위 · 단계확산)을 모두 덮는다.
복잡도 축:
  L1 minimal   — 업종(과 고른 제품) 정도만. → 표준 제안서 시나리오(STD-업종)가 골라져야 함
  L2 ambiguous — 목표는 있으나 흐림.     → 업종 · 요구 타입이 맞는 Best Practice 시나리오
  L3 complex   — 키맨 · 수치 · 제약 · 평가 구조. → 분해(기준 · 충돌 · 질문) 후 전략 수립

gold 라벨은 사람이 정한 기대값이다(평가 스크립트 eval/metrics.py 가 사용).
사용: python eval/make_cases.py  → eval/cases/*.json
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
RFP = json.loads((HERE.parent.parent.parent / "src" / "rfp_samples.json").read_text(encoding="utf-8"))

CASES: list[dict] = []


def case(cid: str, ind: str, strategy: str, req_type: str, title: str, levels: dict) -> None:
    for lv, body in levels.items():
        inp = dict(body["input"])
        inp.setdefault("id", f"{cid}_{lv}")
        CASES.append({"id": f"{cid}_{lv}", "case": cid, "industry": ind, "strategy": strategy, "req_type": req_type, "title": title,
                      "level": {"L1": "minimal", "L2": "ambiguous", "L3": "complex"}[lv], "input": inp, "gold": body["gold"]})


# ───────────────────────────── C01 FB · 가치 선도 · 신규
case("C01", "FB", "value", "new", "카페 프랜차이즈 디지털 메뉴보드", {
    "L1": {"input": {"title": "C 커피 제안", "customer": "C 커피 프랜차이즈", "industry": "FB", "free_text": "커피 프랜차이즈 고객. 스마트 사이니지랑 키오스크 제안",
                     "products": ["qm55c", "kiosk"]},
           "gold": {"level": "minimal", "industry": "FB", "scenario_any": ["STD-FB"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"value": ["L_VP_F2", "L_VP_U"], "products": ["L_P2B", "L_P2A"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "C 커피 매장 디지털 전환", "customer": "C 커피",
                     "free_text": "C 커피가 매장 디지털 전환을 고민하고 있습니다. 매장 경험을 좀 더 세련되게 바꾸고 싶고, 본사 입장에서는 메뉴 운영이 편해졌으면 한다고 합니다. 아직 구체적인 범위는 정해지지 않았어요."},
           "gold": {"level": "ambiguous", "industry": "FB", "scenario_any": ["bs01", "bs16"], "scenario_top3": ["bs01"], "must_parts": ["value", "scenario", "case"],
                    "key_reqs": [{"kw": ["운영"], "parts_any": ["value", "solution", "effect", "execution"], "priority": "should"},
                                 {"kw": ["경험"], "parts_any": ["value", "scenario", "user"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "C 커피 · 전국 매장 디지털 메뉴보드 전환", "customer": "C 커피 프랜차이즈", "project": "전국 매장 디지털 메뉴보드 전환", "target": "운영본부장",
                     "free_text": "전국 320개 매장의 인쇄 메뉴판을 디지털 메뉴보드로 바꾸려 합니다. 본사에서 메뉴 · 가격을 한 번에 바꾸는 구조를 원합니다. 가맹점주 초기 부담을 줄이기 위해 렌탈도 검토 중이고, 내년 3월 봄 신메뉴 시즌 전에 1차 매장 오픈이 목표입니다.",
                     "keymen": [
                         {"name": "운영본부장", "weight": 50, "reqs": ["신메뉴 · 가격 변경을 전 매장에 당일 반영", "매장별 가격 표기 불일치 해소", "메뉴판 교체에 드는 매장 인력 줄이기"]},
                         {"name": "마케팅팀장", "weight": 30, "reqs": ["시간대별 메뉴 · 프로모션 자동 전환", "DT · 가두 매장 외부 집객"]},
                         {"name": "시설팀장", "weight": 20, "reqs": ["매장 냉난방 · 조명 전력 절감", "화면 장애를 본사에서 원격 확인"]}],
                     "note": "320개 매장 중 DT · 가두 매장은 약 40곳. 파일럿 10곳부터 시작하는 단계 도입을 제안하고 싶음.",
                     "products": ["qm55c", "kiosk", "oh55a", "ac360"], "solutions": ["magicinfo", "stpro"]},
           "gold": {"level": "complex", "industry": "FB", "strategy_any": ["value", "pain", "roi", "land", "space"], "must_parts": ["requirements", "value", "execution"],
                    "dims_any": ["운영·유지보수", "비용·구매", "일정·실행·확산"], "conflicts_any": [], "min_questions": 4,
                    "key_reqs": [{"kw": ["당일", "반영"], "parts_any": ["value", "solution", "effect", "execution", "requirements"], "priority": "should"},
                                 {"kw": ["가격", "불일치"], "parts_any": ["value", "effect", "challenge", "requirements", "execution"], "priority": "should"},
                                 {"kw": ["전력", "절감"], "parts_any": ["effect", "value", "solution", "execution"], "priority": "should"},
                                 {"kw": ["렌탈"], "parts_any": ["cost", "effect"], "priority": "could"}],
                    "facts": ["320", "10"], "layouts_any": {"requirements": ["L_RM_A"]}}},
})

# ───────────────────────────── C02 OF · 공간 경험 · 신규
case("C02", "OF", "space", "new", "신축 AI Ready 오피스", {
    "L1": {"input": {"title": "F 자산운용 오피스", "customer": "F 자산운용", "industry": "OF", "free_text": "오피스 빌딩 신축 건. The Wall, 전자칠판, 시스템에어컨 DVM",
                     "products": ["thewall", "flip", "dvms2"]},
           "gold": {"level": "minimal", "industry": "OF", "scenario_any": ["STD-OF"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"value": ["L_VP_F"], "products": ["L_P3B"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "F 자산운용 신축 오피스", "customer": "F 자산운용",
                     "free_text": "신축 업무시설이라 입주사들이 좋아할 만한 스마트한 오피스를 만들고 싶다고 합니다. 에너지도 아끼고 싶고요. 설계 단계라 구체적인 건 아직 미정입니다."},
           "gold": {"level": "ambiguous", "industry": "OF", "scenario_any": ["bs02"], "scenario_top3": ["bs02"], "must_parts": ["value", "scenario"],
                    "key_reqs": [{"kw": ["에너지"], "parts_any": ["effect", "value", "solution", "scenario"], "priority": "should"},
                                 {"kw": ["입주사"], "parts_any": ["value", "user", "scenario", "customer"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "용산 업무시설 재개발 AI Ready 오피스", "customer": "F 자산운용", "project": "용산 업무시설 재개발 AI Ready 오피스", "target": "대표이사",
                     "free_text": "지상 22층 업무시설 재개발. 설계 도면이 이번 분기에 확정되어 그 전에 AI 인프라 반영 범위를 정해야 합니다. 설계사 · PM사와 함께 검토하며, 기존 BMS 와 연동돼야 합니다.",
                     "keymen": [
                         {"name": "대표이사", "weight": 50, "reqs": ["사용자를 인식하고 반응하는 AI Ready 오피스", "국내 최초 AI Ready 오피스로 알리기", "에너지 사용량 20% 절감을 실측으로 증빙"]},
                         {"name": "공간컨텐츠실장", "weight": 30, "reqs": ["로비에서 건물 정체성을 보여 주는 미디어", "회의실 예약부터 뒷정리까지 자동화", "건물 가치 · 임대 선호도 제고"]},
                         {"name": "개발사업팀장", "weight": 20, "reqs": ["AI 인프라를 설계 단계에 반영", "시공 · 운영 유지보수 부담 최소화", "기존 BMS 와 시스템 연동"]}],
                     "products": ["thewall", "flip", "qm55c", "dvms2"], "solutions": ["biot", "stpro"]},
           "gold": {"level": "complex", "industry": "OF", "strategy_any": ["space", "value", "roi"], "must_parts": ["requirements", "value", "scenario"],
                    "dims_any": ["사용자 경험·성과", "일정·실행·확산", "운영·유지보수"], "conflicts_any": [], "min_questions": 4,
                    "key_reqs": [{"kw": ["20%"], "parts_any": ["effect", "value", "requirements"], "priority": "must"},
                                 {"kw": ["설계"], "parts_any": ["execution", "overview", "requirements"], "priority": "should"},
                                 {"kw": ["BMS"], "parts_any": ["execution", "solution", "requirements"], "priority": "should"},
                                 {"kw": ["회의실"], "parts_any": ["scenario", "value", "dss", "products"], "priority": "should"}],
                    "facts": ["20", "22"], "layouts_any": {"requirements": ["L_RM_A"]}}},
})

# ───────────────────────────── C03 HT · 문제 해결 · 교체
case("C03", "HT", "pain", "renew", "비즈니스 호텔 객실 리뉴얼", {
    "L1": {"input": {"title": "G 호텔 제안", "customer": "G 호텔", "industry": "HT", "free_text": "호텔 객실 TV 제안", "products": ["hoteltv"]},
           "gold": {"level": "minimal", "industry": "HT", "scenario_any": ["STD-HT"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"products": ["L_P1B"], "value": ["L_VP_U_HT", "L_VP_G"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "G 호텔 객실 리뉴얼", "customer": "G 호텔",
                     "free_text": "객실 리뉴얼을 앞두고 TV와 에어컨 교체를 검토 중입니다. 투숙객 불만이 좀 있다고 하네요. 공사 일정이나 범위는 아직 정해지지 않았습니다."},
           "gold": {"level": "ambiguous", "industry": "HT", "scenario_any": ["bs07"], "scenario_top3": ["bs07"], "must_parts": ["challenge", "products"],
                    "key_reqs": [{"kw": ["불만"], "parts_any": ["challenge", "customer", "user", "value"], "priority": "should"},
                                 {"kw": ["교체"], "parts_any": ["products", "execution", "bom", "challenge"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "G 호텔 · 객실 · 공용부 리뉴얼", "customer": "G 비즈니스 호텔", "project": "객실 · 공용부 리뉴얼", "target": "총지배인",
                     "free_text": "객실 300실 TV · 냉방 교체와 로비 · 연회장 사이니지 신설. 리뉴얼 공사 중에도 영업은 멈출 수 없어 층별 야간 공사로 진행해야 합니다. 3개 공급사 견적을 비교할 예정입니다.",
                     "keymen": [
                         {"name": "총지배인", "weight": 50, "reqs": ["체크인 대기 시간 줄이기", "리뉴얼 공사 중에도 영업 유지", "투숙객 리뷰 평점 개선"]},
                         {"name": "객실팀장", "weight": 30, "reqs": ["객실 TV에서 호텔 안내 · 미러링 제공", "냉방 소음 민원 해소", "객실 컨디션 원격 확인"]},
                         {"name": "시설팀장", "weight": 20, "reqs": ["객실 공조 에너지 절감", "장비 장애 시 4시간 내 출동"]}],
                     "files": [{"name": "RFP_G호텔_객실리뉴얼.pdf", "text": "", "memo": "객실 300실 · 연회장 3 · 로비 1 · 피트니스 1"}],
                     "products": ["hoteltv", "wf1way", "qm55c"], "solutions": ["lynk"]},
           "gold": {"level": "complex", "industry": "HT", "strategy_any": ["pain", "space", "compete", "value"], "must_parts": ["requirements", "products", "execution"],
                    "dims_any": ["사용자 경험·성과", "일정·실행·확산", "운영·유지보수"], "conflicts_any": ["시공 vs 영업 유지"], "min_questions": 4,
                    "key_reqs": [{"kw": ["체크인"], "parts_any": ["scenario", "value", "effect", "user", "requirements"], "priority": "should"},
                                 {"kw": ["영업", "유지"], "parts_any": ["execution", "requirements"], "priority": "should"},
                                 {"kw": ["소음"], "parts_any": ["value", "products", "challenge", "effect", "requirements"], "priority": "should"},
                                 {"kw": ["4시간"], "parts_any": ["execution", "why", "requirements"], "priority": "should"}],
                    "facts": ["300"], "layouts_any": {"execution": ["L_IP_C"], "requirements": ["L_RM_A"]}}},
})

# ───────────────────────────── C04 FN · 요구 대응 · 경쟁 입찰 (실제 RFP)
mon = RFP[2]
case("C04", "FN", "rfp", "compete", "은행 업무용 모니터 입찰", {
    "L1": {"input": {"title": "H 은행 제안", "customer": "H 은행", "industry": "FN", "free_text": "은행 지점 모니터 교체 건", "products": ["smartmonitor"]},
           "gold": {"level": "minimal", "industry": "FN", "scenario_any": ["STD-FN"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"products": ["L_P1B"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "H 은행 영업점 디지털 창구", "customer": "H 은행",
                     "free_text": "은행 영업점 창구를 좀 더 디지털하게 바꾸고 싶다는 요청이 있었습니다. 고객 대기 경험도 개선하고 싶다고 하는데, 어디서부터 시작할지는 정하지 못했다고 합니다."},
           "gold": {"level": "ambiguous", "industry": "FN", "scenario_any": ["bs17", "bs16", "bs19"], "scenario_top3": ["bs17"], "must_parts": ["value"],
                    "key_reqs": [{"kw": ["대기"], "parts_any": ["scenario", "value", "user", "challenge", "effect"], "priority": "should"},
                                 {"kw": ["창구"], "parts_any": ["scenario", "value", "dss", "products", "customer"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "신한은행 · 업무용 모니터 27\" 980대 도입", "customer": "신한은행", "project": "업무용 모니터(27인치) 도입 추진 (980대)", "target": "총무부 · Tech운영부", "industry": "FN",
                     "free_text": "신한은행 총무부 입찰공고(2026.06.04) — 업무용 27인치 모니터 980대를 설치비 포함 총액으로 구매합니다. 사업기간은 계약체결일로부터 6개월 내외입니다. 선정은 가격평가 100점의 경쟁 최저가격 입찰입니다.",
                     "keymen": [
                         {"name": "Tech운영부 · 업무담당", "weight": 30, "reqs": [
                             "[규격] 27\" UHD 4K(3840×2160) · 패널 IPS 또는 VA 택1 · LED 백라이트 · 컬러 Black",
                             "[규격] Pivot · Elevation · Swivel · Tilt 조절 가능",
                             "[규격] 밝기 300cd/㎡ 이상 · 응답속도 8ms 이하 · 시야각 178°/178° 이상 · sRGB 90% 이상",
                             "[규격] 인터페이스 HDMI · DP · USB-C PD 지원(3Port 이상)",
                             "[규격] 시력보호 기능(플리커프리 · 블루라이트 차단) — 시력보호기능 인증공문 제출",
                             "[전원] 별도 AC 전원 어댑터 사용 모델 참여 불가",
                             "[인증] KC 인증 · 전파인증 필수",
                             "[운영] 무상기간 내 장애 발생 시 점검 · 수리 필수 · 자산스티커 부착 필수"]},
                         {"name": "총무부 · 도입담당", "weight": 70, "reqs": [
                             "[범위] 업무용 모니터(27인치) 980대 · 설치비 포함 · 사업기간 계약체결일로부터 6개월 내외",
                             "[선정] 제한경쟁입찰(총액입찰) · 가격평가 100점 · 경쟁 최저가격 입찰",
                             "[자격] 최근 5년 이내 금융권 모니터 납품 실적이 있는 제조사 또는 제조사 지정 총판",
                             "[일정] 참가의향서 6/12(금) 13:00까지 email 접수",
                             "[계약] 입찰보증금 입찰금액의 5%(보증보험증권)"]}],
                     "note": "가격평가 100점의 최저가 입찰 — 규격을 모두 맞춘 다음에는 가격이 전부. 별도 AC 어댑터 금지, USB-C PD, 4방향 조절, 시력보호 인증공문에서 걸러지기 쉬움.",
                     "files": [{"name": mon["name"], "text": mon["text"], "memo": "27\" UHD 모니터 980대 · 가격평가 100점 최저가"}],
                     "products": ["smartmonitor"], "solutions": [], "cases": ["98", "88"]},
           "gold": {"level": "complex", "industry": "FN", "strategy_any": ["rfp", "compete", "roi"], "must_parts": ["requirements", "spec"],
                    "dims_any": ["기능·성능 규격", "보안·인증·규제", "평가·선정·자격"], "conflicts_any": ["가격 vs 규격"], "min_questions": 4, "eval_expected": True,
                    "key_reqs": [{"kw": ["어댑터"], "parts_any": ["spec", "products", "requirements"], "priority": "must"},
                                 {"kw": ["USB-C"], "parts_any": ["spec", "products", "requirements"], "priority": "should"},
                                 {"kw": ["KC"], "parts_any": ["spec", "why", "execution", "requirements"], "priority": "must"},
                                 {"kw": ["최저가"], "parts_any": ["requirements", "overview", "cost"], "priority": "must"}],
                    "facts": ["980"], "layouts_any": {"requirements": ["L_RM_C", "L_RM_B"], "spec": ["L_SC_B", "L_SE_B", "L_SPEC1"]}}},
})

# ───────────────────────────── C05 ED · 공간 경험 · 신규 (평가표 있음)
case("C05", "ED", "space", "new", "대학 스마트 캠퍼스", {
    "L1": {"input": {"title": "J 대학교 제안", "customer": "J 대학교", "industry": "ED", "free_text": "대학교 강의실. 전자칠판 WA75D, 이페이퍼", "products": ["flip", "epaper"]},
           "gold": {"level": "minimal", "industry": "ED", "scenario_any": ["STD-ED"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"products": ["L_P2B"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "J 대학교 스마트 캠퍼스", "customer": "J 대학교",
                     "free_text": "캠퍼스를 스마트하게 바꾸는 사업을 준비 중이라, 학생들이 체감할 수 있는 학습 경험 개선 방안을 알고 싶어 합니다."},
           "gold": {"level": "ambiguous", "industry": "ED", "scenario_any": ["bs03"], "scenario_top3": ["bs03"], "must_parts": ["value", "scenario"],
                    "key_reqs": [{"kw": ["학습"], "parts_any": ["value", "scenario", "user"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "J 대학교 스마트 캠퍼스 구축", "customer": "J 대학교", "project": "스마트 강의실 · 도서관 · 기숙사 구축", "target": "기획처장",
                     "free_text": "대학혁신지원사업 예산으로 스마트 캠퍼스를 구축합니다. 강의실 120실을 스마트 강의실로 바꾸고, 중앙도서관 좌석 · 안내 사이니지, 기숙사 냉난방 제어를 포함합니다. 예산은 12월 말까지 집행해야 합니다. 평가는 기술 60점 · 가격 40점이며 제안 발표가 있습니다.",
                     "keymen": [
                         {"name": "기획처장", "weight": 40, "reqs": ["학생이 체감하는 학습 환경 개선", "혁신지원사업 성과지표에 맞는 정량 효과", "12월 말까지 예산 집행 완료"]},
                         {"name": "교수학습센터장", "weight": 35, "reqs": ["강의실 120실 판서 · 녹화 · 원격 수업 지원", "교수자 사용 교육", "기존 LMS 와 연동"]},
                         {"name": "시설팀장", "weight": 25, "reqs": ["기숙사 냉난방 원격 제어 · 에너지 절감", "방학 중 시공", "유지보수 창구 일원화"]}],
                     "products": ["flip", "epaper", "qm85c", "wf1way"], "solutions": ["sac"]},
           "gold": {"level": "complex", "industry": "ED", "strategy_any": ["rfp", "space", "compete"], "must_parts": ["requirements", "execution"],
                    "dims_any": ["평가·선정·자격", "일정·실행·확산", "사용자 경험·성과"], "conflicts_any": [], "min_questions": 4, "eval_expected": True,
                    "key_reqs": [{"kw": ["120실"], "parts_any": ["bom", "products", "scenario", "requirements", "execution"], "priority": "should"},
                                 {"kw": ["LMS"], "parts_any": ["execution", "solution", "requirements"], "priority": "should"},
                                 {"kw": ["12월"], "parts_any": ["execution", "closing", "requirements"], "priority": "must"},
                                 {"kw": ["교육"], "parts_any": ["execution"], "priority": "should"}],
                    "facts": ["120", "60", "40"], "layouts_any": {"requirements": ["L_RM_C"]}}},
})

# ───────────────────────────── C06 MF · 문제 해결 · 운영 효율
case("C06", "MF", "pain", "ops", "물류센터 현장 모바일", {
    "L1": {"input": {"title": "K 로지스 제안", "customer": "K 로지스", "industry": "MF", "free_text": "물류센터 현장 단말. 갤럭시 XCover7, 탭 액티브5", "products": ["xcover7", "tabactive5"]},
           "gold": {"level": "minimal", "industry": "MF", "scenario_any": ["STD-MF"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"products": ["L_P_Q", "L_P2B"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "K 로지스 현장 디지털화", "customer": "K 로지스",
                     "free_text": "물류센터 현장 업무가 비효율적이라 디지털화하고 싶다고 합니다. 기기 관리도 골칫거리라고 하네요."},
           "gold": {"level": "ambiguous", "industry": "MF", "scenario_any": ["bs14"], "scenario_top3": ["bs14"], "must_parts": ["challenge", "solution"],
                    "key_reqs": [{"kw": ["기기 관리"], "parts_any": ["solution", "value", "challenge", "execution"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "K 로지스 · 물류센터 현장 단말 전환", "customer": "K 로지스", "project": "물류센터 전용 스캐너 → 갤럭시 전환", "target": "물류혁신팀장",
                     "free_text": "3개 센터의 전용 스캐너 800대를 갤럭시 단말로 바꾸려 합니다. 바코드 스캔 속도가 기존 이상이어야 하고, WMS 와 연동돼야 합니다. 먼저 1개 센터 4주 파일럿 후 확산합니다.",
                     "keymen": [
                         {"name": "물류혁신팀장", "weight": 45, "reqs": ["바코드 스캔 속도 기존 전용 스캐너 이상", "WMS 연동 · 기존 앱 그대로 사용", "1개 센터 4주 파일럿 후 확산"]},
                         {"name": "IT보안팀장", "weight": 35, "reqs": ["분실 단말 원격 잠금 · 초기화", "업무 앱 외 사용 차단", "단말 일괄 설정 · 업데이트 통제"]},
                         {"name": "센터장", "weight": 20, "reqs": ["1.5m 낙하에도 견디는 내구성", "교대조 12시간 배터리", "장갑 낀 손으로 터치"]}],
                     "products": ["xcover7", "tabactive5"], "solutions": ["knoxcapture", "knoxsuite"]},
           "gold": {"level": "complex", "industry": "MF", "strategy_any": ["pain", "land", "roi", "value"], "must_parts": ["requirements", "spec", "execution"],
                    "dims_any": ["보안·인증·규제", "기능·성능 규격", "일정·실행·확산"], "conflicts_any": [], "min_questions": 4,
                    "key_reqs": [{"kw": ["WMS"], "parts_any": ["execution", "solution", "requirements"], "priority": "should"},
                                 {"kw": ["원격 잠금"], "parts_any": ["execution", "spec", "solution", "requirements"], "priority": "should"},
                                 {"kw": ["1.5m"], "parts_any": ["spec", "products", "requirements"], "priority": "should"},
                                 {"kw": ["파일럿"], "parts_any": ["execution", "bom", "closing"], "priority": "should"}],
                    "facts": ["800", "4"], "layouts_any": {"spec": ["L_SD_E", "L_SC_B"]}}},
})

# ───────────────────────────── C07 RT · 경쟁 우위 · 공급사 전환
case("C07", "RT", "compete", "compete", "백화점 사이니지 공급사 전환", {
    "L1": {"input": {"title": "L 백화점 제안", "customer": "L 백화점", "industry": "RT", "free_text": "백화점 플래그십 매장 사이니지", "products": ["qm55c", "window", "led_indoor"]},
           "gold": {"level": "minimal", "industry": "RT", "scenario_any": ["STD-RT"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"products": ["L_P3B"], "value": ["L_VP_F", "L_VP_UC_RT"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "L 백화점 사이니지 재계약", "customer": "L 백화점",
                     "free_text": "백화점에서 지금 타사 사이니지를 쓰고 있는데, 재계약 시점이라 다른 공급사도 검토 중이라고 합니다."},
           "gold": {"level": "ambiguous", "industry": "RT", "scenario_any": ["bs10", "bs06", "bs16"], "scenario_top3": ["bs10"], "must_parts": ["why"],
                    "key_reqs": [{"kw": ["타사"], "parts_any": ["why", "competition", "products"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "L 백화점 · 사이니지 공급사 전환", "customer": "L 백화점", "project": "전 점포 디지털 사이니지 교체", "target": "영업전략본부장",
                     "free_text": "현재 타사 사이니지 450면을 쓰고 있고 재계약 대신 공급사 전환을 검토합니다. 평가 항목은 화질 · 밝기 30점, CMS 20점, 유지보수 20점, 가격(3년 TCO) 30점이며 평가위원회 PT 가 있습니다. 영업 중에는 교체할 수 없어 폐점 후 야간에만 시공 가능합니다.",
                     "keymen": [
                         {"name": "영업전략본부장", "weight": 40, "reqs": ["점포 브랜드 경험 강화", "3년 총소유비용 비교"]},
                         {"name": "VMD팀장", "weight": 30, "reqs": ["기존 콘텐츠를 그대로 옮겨 쓰기", "쇼윈도 밝기 · 화질 개선", "시즌 콘텐츠 일괄 교체"]},
                         {"name": "시설팀장", "weight": 30, "reqs": ["폐점 후 야간 교체 시공", "장애 시 익일 복구", "본사 CMS 로 전 점포 통합 관리"]}],
                     "products": ["qm55c", "window", "led_indoor"], "solutions": ["magicinfo"]},
           "gold": {"level": "complex", "industry": "RT", "strategy_any": ["compete", "rfp"], "must_parts": ["requirements", "why"],
                    "dims_any": ["경쟁·차별화", "비용·구매", "평가·선정·자격"], "conflicts_any": ["시공 vs 영업 유지"], "min_questions": 4, "eval_expected": True,
                    "key_reqs": [{"kw": ["TCO"], "parts_any": ["cost", "effect", "requirements"], "priority": "should"},
                                 {"kw": ["콘텐츠"], "parts_any": ["solution", "execution", "requirements"], "priority": "should"},
                                 {"kw": ["야간"], "parts_any": ["execution", "requirements"], "priority": "should"},
                                 {"kw": ["CMS"], "parts_any": ["solution", "execution", "requirements"], "priority": "should"}],
                    "facts": ["450", "30"], "layouts_any": {"requirements": ["L_RM_C"], "why": ["L_CM_B", "L_CM_E", "L_ST_E", "L_WS01"]}}},
})

# ───────────────────────────── C08 RS · 가치 선도 · 신규 분양
case("C08", "RS", "value", "new", "아파트 분양 빌트인 · 스마트홈", {
    "L1": {"input": {"title": "M 건설 제안", "customer": "M 건설", "industry": "RS", "free_text": "아파트 분양 건. 빌트인 인덕션, 식기세척기, 냉장고", "products": ["bi_induction", "bi_dish", "bi_fridge"]},
           "gold": {"level": "minimal", "industry": "RS", "scenario_any": ["STD-RS"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"value": ["L_RV_A", "L_VP_F"], "products": ["L_P_R", "L_P3B"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "M 건설 분양 차별화", "customer": "M 건설",
                     "free_text": "분양을 앞둔 아파트 단지에서 차별화 포인트로 가전과 스마트홈을 검토하고 있습니다. 어떤 구성이 좋을지 제안해 달라고 합니다."},
           "gold": {"level": "ambiguous", "industry": "RS", "scenario_any": ["bs04"], "scenario_top3": ["bs04"], "must_parts": ["value", "products"],
                    "key_reqs": [{"kw": ["차별화"], "parts_any": ["value", "market", "why"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "M 건설 · 1,200세대 단지 가전 · 스마트홈 사양", "customer": "M 건설", "project": "OO 1,200세대 단지 빌트인 · 스마트홈", "target": "분양마케팅팀장",
                     "free_text": "1,200세대 단지(59 · 74 · 84 · 101㎡ 4개 타입) 분양을 앞두고 빌트인 가전과 스마트홈 사양을 정합니다. 모델하우스는 내년 4월 오픈 예정입니다. 기본 사양과 유상 옵션을 나눠야 하고, 세대당 공사비 단가 한도가 있습니다.",
                     "keymen": [
                         {"name": "분양마케팅팀장", "weight": 40, "reqs": ["모델하우스에서 보여 줄 차별화 포인트", "타입별 옵션 패키지 구성"]},
                         {"name": "설계팀장", "weight": 35, "reqs": ["빌트인 매립 치수 확정", "월패드 · 스마트홈 연동", "시스템에어컨 · 환기 사양"]},
                         {"name": "구매팀장", "weight": 25, "reqs": ["세대당 공사비 단가 한도 준수", "입주 후 AS 체계"]}],
                     "products": ["bi_induction", "bi_dish", "bi_fridge", "ehs", "erv"], "solutions": ["smartthings"]},
           "gold": {"level": "complex", "industry": "RS", "strategy_any": ["value", "space", "roi"], "must_parts": ["requirements", "products", "cost"],
                    "dims_any": ["비용·구매", "기능·성능 규격", "범위·수량·공간"], "conflicts_any": [], "min_questions": 4,
                    "key_reqs": [{"kw": ["옵션"], "parts_any": ["value", "products", "bom", "requirements"], "priority": "should"},
                                 {"kw": ["매립"], "parts_any": ["spec", "products", "requirements"], "priority": "should"},
                                 {"kw": ["월패드"], "parts_any": ["execution", "solution", "requirements"], "priority": "should"},
                                 {"kw": ["단가"], "parts_any": ["cost", "requirements"], "priority": "must"}],
                    "facts": ["1,200", "4"], "layouts_any": {"products": ["L_RV_B", "L_P_R", "L_SD_F"]}}},
})

# ───────────────────────────── C09 SV · 투자 회수 · 운영 효율
case("C09", "SV", "roi", "ops", "무인 스터디카페 에너지 절감", {
    "L1": {"input": {"title": "N 스터디 제안", "customer": "N 스터디카페", "industry": "SV", "free_text": "무인 스터디카페 체인. 키오스크랑 시스템에어컨", "products": ["kiosk", "wf4way"]},
           "gold": {"level": "minimal", "industry": "SV", "scenario_any": ["STD-SV"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"products": ["L_P2B"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "N 스터디카페 전기료", "customer": "N 스터디카페",
                     "free_text": "무인 매장을 여러 곳 운영하는데 전기료가 많이 나와서 고민이라고 합니다. 매장에 사람이 없어서 관리도 어렵다고 하네요."},
           "gold": {"level": "ambiguous", "industry": "SV", "scenario_any": ["bs13"], "scenario_top3": ["bs13"], "must_parts": ["effect"],
                    "key_reqs": [{"kw": ["전기료"], "parts_any": ["effect", "challenge", "value", "cost"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "N 스터디카페 · 전 지점 에너지 자동화", "customer": "N 스터디카페", "project": "120개 지점 냉난방 · 키오스크 통합 운영", "target": "대표",
                     "free_text": "120개 무인 지점의 냉난방을 이용자 입퇴실에 맞춰 자동으로 돌리고 싶습니다. 지점당 월 전기료가 평균 85만 원입니다. 투자 회수는 18개월 이내여야 하고, 초기 비용 부담 때문에 렌탈을 선호합니다. 5개 지점 파일럿 후 결정합니다.",
                     "keymen": [
                         {"name": "대표", "weight": 60, "reqs": ["투자 회수 18개월 이내", "렌탈 · 구독 방식", "5개 지점 파일럿으로 효과 검증"]},
                         {"name": "운영팀장", "weight": 40, "reqs": ["입퇴실 연동 냉난방 자동 제어", "키오스크 무인 결제 연동", "장애를 본사에서 원격 확인"]}],
                     "products": ["kiosk", "wf4way"], "solutions": ["stpro"]},
           "gold": {"level": "complex", "industry": "SV", "strategy_any": ["roi", "land", "pain"], "must_parts": ["effect", "cost", "execution"],
                    "dims_any": ["비용·구매", "일정·실행·확산", "운영·유지보수"], "conflicts_any": [], "min_questions": 4,
                    "key_reqs": [{"kw": ["18개월"], "parts_any": ["effect", "cost", "requirements"], "priority": "must"},
                                 {"kw": ["렌탈"], "parts_any": ["cost"], "priority": "should"},
                                 {"kw": ["파일럿"], "parts_any": ["execution", "closing"], "priority": "should"},
                                 {"kw": ["입퇴실"], "parts_any": ["solution", "scenario", "value"], "priority": "should"}],
                    "facts": ["120", "85", "18", "5"], "layouts_any": {"cost": ["L_CO_A", "L_CO_B"], "effect": ["L_EF_B", "L_EF_A", "L_EF_G"]}}},
})

# ───────────────────────────── C10 MD · 단계 확산 · 확산
case("C10", "MD", "land", "scale", "요양병원 병동 확산", {
    "L1": {"input": {"title": "P 요양병원 제안", "customer": "P 요양병원", "industry": "MD", "free_text": "요양병원 병실 TV, 공기청정기", "products": ["hoteltv43", "purifier"]},
           "gold": {"level": "minimal", "industry": "MD", "scenario_any": ["STD-MD"], "must_parts": ["value", "products", "case", "why"],
                    "layouts_any": {"value": ["L_VP_F2", "L_VP_U_MD"]}, "key_reqs": [], "facts": []}},
    "L2": {"input": {"title": "P 요양병원 병동 확대", "customer": "P 요양병원",
                     "free_text": "작년에 한 병동에서 파일럿을 했는데 반응이 좋아서 다른 병동으로도 넓힐지 고민이라고 합니다."},
           "gold": {"level": "ambiguous", "industry": "MD", "scenario_any": ["bs08", "bs17"], "scenario_top3": ["bs08"], "must_parts": ["execution"],
                    "key_reqs": [{"kw": ["파일럿"], "parts_any": ["execution", "effect", "case"], "priority": "should"}], "facts": []}},
    "L3": {"input": {"title": "P 요양병원 · 전 병동 확산", "customer": "P 요양병원", "project": "스마트 병동 전 병동 확산", "target": "이사장",
                     "free_text": "작년 1개 병동 파일럿에서 호출 응답 시간이 30% 줄었습니다. 이 결과로 남은 7개 병동에 단계 확산을 하려 하며, 2차 예산은 이사회 승인이 필요합니다. 감염 관리 때문에 공기질 관리가 중요하고, 환자 정보는 병원 내부망 밖으로 나가면 안 됩니다.",
                     "keymen": [
                         {"name": "이사장", "weight": 45, "reqs": ["파일럿 성과를 근거로 이사회 예산 승인", "병동별 단계 확산 일정"]},
                         {"name": "간호부장", "weight": 35, "reqs": ["간호사 호출 응답 부담 줄이기", "야간 낙상 위험 알림", "보호자 안내 화면"]},
                         {"name": "행정원장", "weight": 20, "reqs": ["환자 정보 내부망 보관", "병실 공기질 관리"]}],
                     "products": ["hoteltv43", "purifier", "qm43c", "smarttag"], "solutions": ["lynk"]},
           "gold": {"level": "complex", "industry": "MD", "strategy_any": ["land", "roi", "pain"], "must_parts": ["requirements", "execution", "effect"],
                    "dims_any": ["일정·실행·확산", "보안·인증·규제", "사용자 경험·성과"], "conflicts_any": [], "min_questions": 4,
                    "key_reqs": [{"kw": ["30%"], "parts_any": ["effect", "case", "requirements"], "priority": "should"},
                                 {"kw": ["이사회"], "parts_any": ["closing", "overview", "execution", "cost", "requirements"], "priority": "should"},
                                 {"kw": ["내부망"], "parts_any": ["execution", "spec", "requirements"], "priority": "must"},
                                 {"kw": ["단계"], "parts_any": ["execution", "bom"], "priority": "should"}],
                    "facts": ["30", "7"], "layouts_any": {"execution": ["L_PL_A", "L_SV_A", "L_PL_B"]}}},
})


# ═════════════════════════════ HOLDOUT — 개선 반복에 쓰지 않은 업종(TP · PB · VN · AD · OE) 6건
# 규칙 · 가중치를 고치는 동안에는 열어 보지 않고, 마지막에 일반화 확인용으로만 돌린다.
HOLDOUT: list[dict] = []


def hold(hid: str, ind: str, level: str, title: str, inp: dict, gold: dict) -> None:
    inp = dict(inp)
    inp.setdefault("id", hid)
    HOLDOUT.append({"id": hid, "case": hid, "industry": ind, "strategy": gold.get("strategy_any", [None])[0] if gold.get("strategy_any") else None,
                    "req_type": None, "title": title, "level": level, "input": inp, "gold": dict(gold, level=level, industry=ind)})


hold("H01", "TP", "minimal", "테마파크 신규 구역", {"title": "Q 파크 제안", "customer": "Q 테마파크", "industry": "TP", "free_text": "테마파크 신규 구역. LED 사이니지, 하만 오디오",
     "products": ["led_indoor", "harman"]}, {"scenario_any": ["STD-TP"], "must_parts": ["value", "products", "case", "why"], "layouts_any": {"products": ["L_P_L", "L_P2B"]}, "key_reqs": [], "facts": []})
hold("H02", "PB", "minimal", "정류장 안내 사이니지", {"title": "R 시청 제안", "customer": "R 시청", "industry": "PB", "free_text": "지자체 버스 정류장 안내 사이니지", "products": ["oh55a"]},
     {"scenario_any": ["STD-PB"], "must_parts": ["value", "products", "case", "why"], "layouts_any": {"products": ["L_P1B"]}, "key_reqs": [], "facts": []})
hold("H03", "VN", "ambiguous", "야구장 전광판", {"title": "S 구단 제안", "customer": "S 구단",
     "free_text": "야구장 전광판이 오래돼서 관람객 경험을 확 바꿀 방법을 찾고 있다고 합니다. 다른 구장들처럼 화려하게 하고 싶다고요."},
     {"scenario_any": ["bs12", "bs09", "bs06"], "scenario_top3": ["bs12"], "must_parts": ["value"],
      "key_reqs": [{"kw": ["관람객"], "parts_any": ["value", "scenario", "user", "challenge"], "priority": "should"}], "facts": []})
hold("H04", "AD", "ambiguous", "옥외 미디어 사업", {"title": "T 미디어 제안", "customer": "T 미디어",
     "free_text": "옥외 광고 매체 사업을 새로 해 보려는데 수익성이 나올지 고민이라고 합니다. 랜드마크가 될 만한 자리를 보고 있대요."},
     {"scenario_any": ["bs20"], "scenario_top3": ["bs20"], "must_parts": ["value", "effect"],
      "key_reqs": [{"kw": ["수익"], "parts_any": ["effect", "cost", "value", "market"], "priority": "should"}], "facts": []})
hold("H05", "OE", "complex", "통신사 키즈폰 에디션", {"title": "U 텔레콤 키즈폰 에디션", "customer": "U 텔레콤", "project": "키즈폰 전용 에디션 공동 개발", "target": "단말기획본부장",
     "free_text": "초등학생용 키즈폰 전용 에디션을 공동 개발하려 합니다. 내년 3월 신학기 출시가 목표이고, 1차 물량은 5만 대입니다. 전파 인증과 KC 인증 일정까지 포함한 개발 일정이 필요합니다.",
     "keymen": [{"name": "단말기획본부장", "weight": 45, "reqs": ["아이 맞춤 홈 화면 · 앱 제한", "보호자 앱과 위치 · 사용 시간 연동", "내년 3월 신학기 출시"]},
                {"name": "보안팀장", "weight": 30, "reqs": ["분실 시 원격 잠금 · 위치 확인", "유해 사이트 차단 정책 일괄 적용"]},
                {"name": "구매팀장", "weight": 25, "reqs": ["대당 공급 단가 한도", "1차 5만 대 · 추가 물량 단계 공급"]}],
     "products": ["galaxyA", "watch"], "solutions": ["knoxsuite"]},
     {"strategy_any": ["land", "value", "roi"], "must_parts": ["requirements", "execution"], "dims_any": ["일정·실행·확산", "보안·인증·규제", "비용·구매"],
      "conflicts_any": [], "min_questions": 4,
      "key_reqs": [{"kw": ["3월"], "parts_any": ["execution", "closing", "requirements"], "priority": "must"},
                   {"kw": ["원격 잠금"], "parts_any": ["execution", "spec", "solution", "requirements"], "priority": "should"},
                   {"kw": ["단가"], "parts_any": ["cost", "requirements"], "priority": "must"}],
      "facts": ["5"], "layouts_any": {"execution": ["L_CU_B", "L_CU_A", "L_PL_A"]}})
hold("H06", "PB", "complex", "지자체 통합 안내 · 관제 입찰", {"title": "V 시 통합 안내 · 관제 고도화", "customer": "V 시청", "project": "버스 정보 안내 · 통합 관제 고도화 사업", "target": "교통정책과장",
     "free_text": "V 시 버스 정보 안내 · 통합 관제 고도화 사업 제안요청입니다. 정류장 120곳 안내 사이니지(BIT) 교체와 상황실 비디오월 구축이 범위입니다. 평가는 기술 80점 · 가격 20점이며 제안 발표 평가가 있습니다.",
     "keymen": [{"name": "교통정책과장", "weight": 40, "reqs": ["정류장 도착 정보 실시간 안내", "다국어 4개 안내", "긴급 재난 문자 즉시 표출"]},
                {"name": "정보통신팀장", "weight": 35, "reqs": ["상황실 화면 통합 표출", "내부망 분리 운영", "관리자 접근 기록"]},
                {"name": "시설관리팀장", "weight": 25, "reqs": ["옥외 IP 등급 · 24시간 운영", "장애 2시간 내 복구"]}],
     "products": ["oh55a", "vm55b"], "solutions": ["magicinfo"]},
     {"strategy_any": ["rfp", "compete"], "must_parts": ["requirements", "spec"], "dims_any": ["평가·선정·자격", "보안·인증·규제", "운영·유지보수"],
      "conflicts_any": [], "min_questions": 4, "eval_expected": True,
      "key_reqs": [{"kw": ["다국어"], "parts_any": ["scenario", "value", "user", "requirements", "solution"], "priority": "should"},
                   {"kw": ["내부망"], "parts_any": ["execution", "spec", "requirements"], "priority": "should"},
                   {"kw": ["2시간"], "parts_any": ["execution", "why", "requirements"], "priority": "should"}],
      "facts": ["120", "80"], "layouts_any": {"requirements": ["L_RM_C", "L_RM_B"]}})


# ═════════════════════════════ HOLDOUT-2 — holdout(1) 결과를 보고 규칙을 고치기 '전에' 써 둔 두 번째 블라인드 세트
HOLDOUT2: list[dict] = []


def hold2(hid: str, ind: str, level: str, title: str, inp: dict, gold: dict) -> None:
    inp = dict(inp)
    inp.setdefault("id", hid)
    HOLDOUT2.append({"id": hid, "case": hid, "industry": ind, "strategy": None, "req_type": None, "title": title, "level": level, "input": inp,
                     "gold": dict(gold, level=level, industry=ind)})


hold2("K01", "ID", "minimal", "주방 가구 파트너 쇼룸", {"title": "W 키친 제안", "customer": "W 키친", "industry": "ID", "free_text": "주방 가구 브랜드. 빌트인 냉장고, 인덕션",
      "products": ["bi_fridge", "bi_induction"]}, {"scenario_any": ["STD-ID"], "must_parts": ["value", "products", "case", "why"], "key_reqs": [], "facts": []})
hold2("K02", "VN", "minimal", "영화관 LED", {"title": "X 시네마 제안", "customer": "X 시네마", "industry": "VN", "free_text": "멀티플렉스 영화관. Onyx 시네마 LED",
      "products": ["onyx"]}, {"scenario_any": ["STD-VN"], "must_parts": ["value", "products", "case", "why"], "key_reqs": [], "facts": []})
hold2("K03", "TP", "ambiguous", "전시관 체험 구역", {"title": "Y 과학관", "customer": "Y 과학관",
      "free_text": "과학관 상설 전시를 새로 꾸미려는데 아이들이 직접 만지고 체험하는 몰입형 공간이었으면 좋겠다고 합니다. 관람 동선도 다시 짜고 싶대요."},
      {"scenario_any": ["bs05"], "scenario_top3": ["bs05"], "must_parts": ["value", "scenario"],
       "key_reqs": [{"kw": ["체험"], "parts_any": ["value", "scenario", "user", "dss", "birdseye"], "priority": "should"}], "facts": []})
hold2("K04", "PB", "ambiguous", "구청 민원실 안내", {"title": "Z 구청 민원실", "customer": "Z 구청",
      "free_text": "구청 민원실 대기 안내가 불편하다는 민원이 많아서 개선 방안을 찾고 있습니다. 어르신 방문객이 많다고 하네요."},
      {"scenario_any": ["bs09", "bs11", "bs16"], "must_parts": ["value"],
       "key_reqs": [{"kw": ["민원"], "parts_any": ["challenge", "user", "value", "scenario"], "priority": "should"}], "facts": []})
hold2("K05", "AD", "complex", "옥외 미디어 입찰", {"title": "AA 공사 옥외 미디어 입찰", "customer": "AA 교통공사", "project": "역사 옥외 미디어 운영사 선정", "target": "광고사업처장",
      "free_text": "역사 12곳의 대형 LED 미디어 운영사를 선정하는 입찰입니다. 평가는 사업 계획 40점, 기술 30점, 가격 30점이며 운영 기간은 5년입니다. 연간 최소 보장 광고 수익을 제시해야 하고, 야간 소음과 빛 공해 민원 기준을 지켜야 합니다.",
      "keymen": [{"name": "광고사업처장", "weight": 50, "reqs": ["연간 최소 보장 수익 제시", "5년 운영 계획", "콘텐츠 송출 관리 체계"]},
                 {"name": "시설안전팀장", "weight": 50, "reqs": ["구조 안전 검토", "야간 휘도 자동 조절", "장애 시 2시간 내 복구"]}],
      "products": ["led_outdoor"], "solutions": ["magicinfo"]},
      {"strategy_any": ["rfp", "roi", "compete"], "must_parts": ["requirements", "cost"], "dims_any": ["평가·선정·자격", "비용·구매", "운영·유지보수"], "conflicts_any": [], "min_questions": 4,
       "eval_expected": True, "key_reqs": [{"kw": ["최소 보장"], "parts_any": ["cost", "effect", "requirements"], "priority": "should"},
                                          {"kw": ["휘도"], "parts_any": ["spec", "products", "requirements", "solution"], "priority": "should"}],
       "facts": ["12", "40"], "layouts_any": {"requirements": ["L_RM_C"]}})
hold2("K06", "FB", "complex", "버거 체인 주방 · 주문 리뉴얼", {"title": "BB 버거 매장 리뉴얼", "customer": "BB 버거", "project": "직영 150개 매장 주문 · 주방 디스플레이 교체", "target": "운영본부장",
      "free_text": "직영 150개 매장의 주문 키오스크와 메뉴보드를 교체합니다. 영업 중단 없이 매장당 하룻밤 안에 교체해야 하고, 기존 POS 와 연동되어야 합니다. 3개 매장 시범 운영 후 6개월 안에 전 매장 확산이 목표입니다.",
      "keymen": [{"name": "운영본부장", "weight": 40, "reqs": ["피크 시간 주문 대기 30% 단축", "전 매장 메뉴 동시 변경"]},
                 {"name": "IT팀장", "weight": 35, "reqs": ["기존 POS 연동", "키오스크 원격 장애 감지"]},
                 {"name": "구매팀장", "weight": 25, "reqs": ["5년 총소유비용 비교", "렌탈 옵션"]}],
      "products": ["kiosk", "qm55c"], "solutions": ["magicinfo"]},
      {"strategy_any": ["pain", "land", "roi", "value"], "must_parts": ["requirements", "execution", "cost"], "dims_any": ["일정·실행·확산", "비용·구매", "시스템 연동"],
       "conflicts_any": ["시공 vs 영업 유지"], "min_questions": 4,
       "key_reqs": [{"kw": ["POS"], "parts_any": ["execution", "solution", "requirements"], "priority": "should"},
                    {"kw": ["30%"], "parts_any": ["effect", "value", "requirements"], "priority": "should"},
                    {"kw": ["렌탈"], "parts_any": ["cost"], "priority": "should"}],
       "facts": ["150", "30"], "layouts_any": {"execution": ["L_IP_C", "L_PL_A", "L_IG_A"]}})


def main() -> None:
    for name, items in (("cases", CASES), ("holdout", HOLDOUT), ("holdout2", HOLDOUT2)):
        out = HERE / name
        out.mkdir(exist_ok=True)
        for old in out.glob("*.json"):
            old.unlink()
        for c in items:
            (out / f"{c['id']}.json").write_text(json.dumps(c, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(items)} TC → {out}")


if __name__ == "__main__":
    main()
