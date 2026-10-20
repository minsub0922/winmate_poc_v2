"""지식 베이스 — 파트 유형 · Best Scenario · 카탈로그(제품 · 솔루션 · 사례 · 업종).

원천은 data/*.json (scripts/export_source.mjs 로 winmatev2 앱 src 에서 만든 스냅샷).
"""
from __future__ import annotations

import json
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

# 파트 유형 → 설득 단계 (Best Scenario STAGES 와 같은 키)
STAGE_OF = {
    "overview": "context", "requirements": "context", "market": "context", "customer": "context", "user": "context",
    "insight": "context", "competition": "proof", "challenge": "problem", "value": "value", "effect": "proof",
    "dss": "space", "scenario": "space", "birdseye": "space", "products": "build", "bom": "build", "solution": "build",
    "spec": "build", "case": "proof", "why": "proof", "execution": "plan", "cost": "plan", "closing": "close",
    "appendix": "close", "free": "value", "cover": "open",
}
STAGE_ORDER = ["open", "context", "problem", "value", "space", "build", "proof", "plan", "close"]
STAGE_LABEL = {"open": "열기", "context": "맥락", "problem": "문제", "value": "가치", "space": "장면", "build": "구성",
               "proof": "근거", "plan": "실행", "close": "결정"}
# 템플릿 페이지의 6묶음 (구분 1)
PART_GROUP = {}
for g, ps in {
    "analysis": ["overview", "requirements", "market", "customer", "user", "competition", "insight"],
    "value": ["challenge", "value", "effect"],
    "space": ["dss", "products", "bom", "scenario", "birdseye", "spec"],
    "proof": ["solution", "case", "why"],
    "exec": ["execution", "cost"],
    "frame": ["cover", "closing", "appendix"],
}.items():
    for p in ps:
        PART_GROUP[p] = g
PART_GROUP["free"] = "value"

STRATEGY_LABELS = {"value": "가치 선도형", "pain": "문제 해결형", "space": "공간 경험형", "roi": "투자 회수형",
                   "rfp": "요구 대응형", "compete": "경쟁 우위형", "land": "단계 확산형"}

# 공간 · 업종 일상어 (layout_agent/analysis.py 에서 가져옴) — '다른 업종 표현' 판정에 쓴다
SPACE_WORDS = ["카운터", "메뉴보드", "드라이브스루", "DT", "매장 외부", "매장", "로비", "라운지", "객실", "연회장", "회의실", "강의실", "도서관", "기숙사",
               "병동", "병실", "재활", "간호사실", "창구", "상담실", "영업점", "지점", "본점", "대강당", "생산 라인", "물류 창고", "창고", "출하장", "현장",
               "쇼윈도", "쇼룸", "체험존", "계산대", "식품관", "입구", "대기 공간", "주방", "세대", "모델하우스", "커뮤니티", "주차장", "정류장", "역사",
               "상황실", "관제실", "업무층", "사무실", "공용공간", "피트니스", "체크인", "프런트", "외벽", "광장", "강당", "교실", "복도", "엘리베이터 홀",
               "타석", "무인 매장", "셀프 계산대", "탈의실", "VMD", "플래그십", "콘서트홀", "객석"]
EXTRA_IND_KW = {
    "FB": ["버거", "치킨", "피자", "베이커리", "식당", "주방", "음료", "가맹점"], "RT": ["백화점", "아울렛", "마트", "패션", "편집숍", "매장 리뉴얼"],
    "SV": ["스터디카페", "코인세탁", "무인 매장", "셀프 빨래방", "PC방", "독서실"], "HT": ["호텔", "리조트", "콘도", "숙박", "투숙객"],
    "TP": ["과학관", "전시관", "아쿠아리움", "놀이공원", "미술관", "관광지", "체험관"], "VN": ["야구장", "축구장", "구장", "아레나", "관람객", "콘서트", "멀티플렉스", "극장"],
    "AD": ["광고 매체", "옥외 광고", "미디어 파사드", "전광판", "광고 수익"], "OF": ["오피스", "사옥", "업무시설", "임대 빌딩", "공유오피스"],
    "RS": ["아파트", "단지", "분양", "입주민", "모델하우스"], "ID": ["주방 가구", "가구 브랜드", "인테리어", "빌트인 파트너"],
    "ED": ["대학교", "초등학교", "중학교", "고등학교", "학원", "강의실", "캠퍼스"], "PB": ["구청", "시청", "군청", "주민센터", "민원실", "정류장", "역사", "공사"],
    "MD": ["병원", "요양원", "의원", "병동", "간호", "환자"], "MF": ["공장", "물류센터", "창고", "생산 라인", "택배"],
    "FN": ["은행", "증권", "보험사", "카드사", "영업점", "창구"], "OE": ["통신사", "키즈폰", "전용 단말", "에디션", "통신 3사"],
}


# 어느 업종에서나 쓰는 말 — '다른 업종 표현' 으로 보지 않는다
GENERIC = {"매장", "현장", "브랜드", "미디어", "체험", "인테리어", "공간", "고객", "운영", "콘텐츠", "사이니지", "디지털", "입구", "사무실",
           "지점", "본점", "광장", "복도", "커뮤니티", "주차장", "로비", "회의실", "리테일", "VMD", "창고", "공사", "주방", "업무시설", "생산 라인",
           "프랜차이즈", "인테리어", "플래그십", "빌트인 파트너", "역사", "단지", "시청"}


def _load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


class KB:
    def __init__(self) -> None:
        parts = _load("parts.json")
        self.PARTS: dict = parts["PARTS"]
        self.NEXT: dict = parts["NEXT"]
        self.RELATED: dict = parts["RELATED"]
        self.REQ_LABEL: dict = parts["REQ_LABEL"]
        sc = _load("scenarios.json")
        self.REQ_TYPES, self.STRATEGIES, self.ENDINGS, self.STAGES = sc["REQ_TYPES"], sc["STRATEGIES"], sc["ENDINGS"], sc["STAGES"]
        cat = _load("catalog_min.json")
        self.products = cat["products"]
        self.solutions = cat["solutions"]
        self.industries = {i["code"]: i for i in cat["industries"]}
        self.ind_kw = cat.get("indKw", {})
        self.layouts = {l["f"]: l for l in cat["layouts"]}
        self.cases = {str(c["id"]): c for c in cat["cases"]}
        self.P = {p["id"]: p for p in self.products}
        self.S = {s["id"]: s for s in self.solutions}
        self.scenarios = [self._scenario(s) for s in sc["SCENARIOS"]]
        self.SC = {s["id"]: s for s in self.scenarios}
        # 선택 밖 제품 · 솔루션 이름 판정용 — 모델 코드 · 솔루션 이름(정확한 것만)
        self.product_names = {p["id"]: sorted({p["model"], *re.findall(r"[A-Z]{1,4}\d{2}[A-Z0-9-]*", p["name"])}, key=lambda x: (-len(x), x)) for p in self.products}
        self.solution_names = {s["id"]: [s["name"]] for s in self.solutions}
        # '다른 업종 표현' 판정용 어휘 — 공간 일상어 + 업종 일상어 + 카탈로그 업종 키워드 중 3글자 이상(2글자는 업무 · 공공 같은 일반어가 많음)
        lex = set(w for w in SPACE_WORDS if len(w) >= 2)
        for ws in EXTRA_IND_KW.values():
            lex.update(w for w in ws if len(w) >= 2)
        for ws in self.ind_kw.values():
            lex.update(w for w in ws if len(w) >= 3)
        lex -= GENERIC
        self.domain_lexicon = sorted(lex, key=lambda x: (-len(x), x))  # 집합 순서에 기대지 않게(PYTHONHASHSEED 와 무관하게 같은 프롬프트)

    # ------------------------------------------------------------ scenario → storyboard 모양
    def part_type_of_stage(self, stage: dict) -> str:
        """앱 scenarios.jsx partTypeOf 와 같은 규칙: 단계 안 장표의 파트 유형 다수결(동점이면 첫 장표)."""
        c: Counter = Counter()
        for x in stage["slides"]:
            l = self.layouts.get(x["f"])
            if l:
                c[l["p"]] += 1
        first = self.layouts.get(stage["slides"][0]["f"]) if stage["slides"] else None
        best, n = (first["p"] if first else "free"), 0
        for k, v in c.items():
            if v > n:
                best, n = k, v
        return best if best in self.PARTS else "free"

    def _scenario(self, s: dict) -> dict:
        s = dict(s)
        parts = []
        for g in s["flow"]:
            t = self.part_type_of_stage(g)
            if g["key"] == "open" or t == "cover":
                continue  # 표지 · 목차는 storyboard 파트가 아님
            parts.append({"type": t, "name": g["name"], "stage": g["key"], "goal": g.get("goal", ""),
                          "items": [x["role"] for x in g["slides"]]})
        s["parts"] = parts
        return s

    def scenario_text(self, s: dict) -> str:
        bits = [s.get("title", ""), s.get("short", ""), s.get("situation", ""), " ".join(s.get("signals", [])),
                " ".join(s.get("criteria", [])), s.get("thesis", "")]
        bits += [p["name"] + " " + p["goal"] for p in s["parts"]]
        return "\n".join(bits)

    def scenario_units(self, s: dict) -> list[str]:
        """레퍼런스 복제 판정용 문장 단위 — 단계 이름 · 목적 · 장표 역할 · 메시지 · 논리."""
        units = []
        for p in s["parts"]:
            units += [p["name"], p["goal"], *p["items"]]
        units += list(s.get("messages", [])) + list(s.get("logic", [])) + [s.get("thesis", "")]
        return [u for u in units if u and len(u) >= 4]


@lru_cache(maxsize=1)
def kb() -> KB:
    return KB()
