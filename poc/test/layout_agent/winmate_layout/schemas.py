"""입력 · LLM 구조화 출력 스키마.

그래프 state 는 직렬화(체크포인트 · interrupt)를 위해 plain dict 로 다루고,
입력 검증과 LLM structured output 에만 pydantic 을 쓴다.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ContextLevel = Literal["minimal", "ambiguous", "complex"]
LEVEL_ROUTE = {"minimal": "standard", "ambiguous": "best", "complex": "decompose"}
LEVEL_LABEL = {
    "minimal": "① 요구사항 거의 없음 → 표준 제안서 시나리오",
    "ambiguous": "② 요구사항 모호 → Best Practice 시나리오",
    "complex": "③ 요구사항 복잡 → 분해 · 기준별 정리 · 사용자 인터랙션",
}

CATEGORIES = ["규격·성능", "보안", "인증", "범위·수량", "일정", "예산·비용", "평가·선정", "자격·제출", "운영·관리", "교육·지원", "시스템 연동",
              "사용자 경험", "성과·KPI", "가치·브랜드", "공간·설치", "경쟁", "확산·단계", "기타"]
DIMENSIONS = {
    "기능·성능 규격": ["규격·성능"],
    "보안·인증·규제": ["보안", "인증"],
    "범위·수량·공간": ["범위·수량", "공간·설치"],
    "일정·실행·확산": ["일정", "확산·단계"],
    "비용·구매": ["예산·비용"],
    "운영·유지보수": ["운영·관리", "교육·지원"],
    "시스템 연동": ["시스템 연동"],
    "사용자 경험·성과": ["사용자 경험", "성과·KPI"],
    "가치·브랜드": ["가치·브랜드"],
    "평가·선정·자격": ["평가·선정", "자격·제출"],
    "경쟁·차별화": ["경쟁"],
    "기타": ["기타"],
}
CAT2DIM = {c: d for d, cs in DIMENSIONS.items() for c in cs}


# ---------------- 입력 ----------------
class Keyman(BaseModel):
    name: str
    weight: float = 0
    reqs: list[str] = Field(default_factory=list)


class Attachment(BaseModel):
    name: str
    text: str = ""
    memo: str = ""


class ProposalInput(BaseModel):
    """앱 제안서 모델(req.free · req.form · req.files · ctx)을 평평하게 옮긴 입력."""

    id: str = "p_test"
    title: str = ""
    customer: str = ""
    industry: str | None = None  # 업종 코드(FB · OF …) — 비어 있으면 추론
    free_text: str = ""
    project: str = ""
    target: str = ""  # 최종 제안 대상(결정권자)
    keymen: list[Keyman] = Field(default_factory=list)
    note: str = ""  # 제작자 의견
    files: list[Attachment] = Field(default_factory=list)
    products: list[str] = Field(default_factory=list)  # catalog product id
    solutions: list[str] = Field(default_factory=list)
    cases: list[str] = Field(default_factory=list)
    minutes: int | None = None
    max_slides: int | None = None


# ---------------- LLM 구조화 출력 ----------------
class LLMReq(BaseModel):
    text: str = Field(description="요구사항 한 줄 (원문 표현 유지, 60자 이내)")
    category: str = Field(description="분류: " + " / ".join(CATEGORIES))
    priority: Literal["must", "should", "could"] = "should"
    keyman: str | None = Field(default=None, description="이 요구를 말한 키맨(직책). 없으면 null")
    parts: list[str] = Field(default_factory=list, description="이 요구에 답할 storyboard 파트 type 키 1~3개")


class LLMReqLabel(BaseModel):
    id: str = Field(description="규칙 추출 요구 id (R01 …)")
    category: str = Field(description="분류: " + " / ".join(CATEGORIES))
    priority: Literal["must", "should", "could"] = "should"
    parts: list[str] = Field(default_factory=list, description="이 요구에 답할 storyboard 파트 type 키 1~3개")


class LLMAnalysis(BaseModel):
    industry: str | None = Field(default=None, description="업종 코드")
    req_type: Literal["new", "renew", "compete", "ops", "scale", "brief"] | None = None
    strategy: Literal["value", "pain", "space", "roi", "rfp", "compete", "land"] | None = None
    context_level: ContextLevel
    level_reason: str = Field(description="맥락 수준 판단 근거 한두 문장")
    labels: list[LLMReqLabel] = Field(default_factory=list, description="규칙이 뽑은 요구마다 분류 · 우선순위 · 답할 파트를 다시 매김")
    missing: list[LLMReq] = Field(default_factory=list, description="규칙이 놓친 요구만(원문 표현, keyman 은 주어진 키맨 이름 그대로 또는 null)")
    goals: list[str] = Field(default_factory=list, description="모호한 목표 표현(측정 기준 없음)")
    summary: str = Field(default="", description="고객 요구 한 문단 요약(지어내지 말 것)")


class LLMReason(BaseModel):
    id: str
    reason: str = Field(description="이 고객에 맞는 이유(40자 이내)")


class LLMScenarioPick(BaseModel):
    order: list[str] = Field(description="시나리오 id, 적합한 순서")
    reasons: list[LLMReason] = Field(default_factory=list)


class LLMPart(BaseModel):
    i: int = Field(description="입력 파트 번호 그대로")
    type: str
    name: str
    items: list[str]
    req_ids: list[str] = Field(default_factory=list)


class LLMStoryItems(BaseModel):
    parts: list[LLMPart]


class LLMLayoutPick(BaseModel):
    primary: str = Field(description="가장 맞는 레이아웃 f (후보 중 하나)")
    alternates: list[str] = Field(default_factory=list, description="대안 f 최대 2개")
    reason: str = Field(description="선정 이유 60자 이내")


class LLMSlidePick(BaseModel):
    key: str = Field(description="슬라이드 키 그대로 (예: S03#0)")
    primary: str = Field(description="가장 맞는 레이아웃 f (그 슬라이드 후보 중 하나)")
    alternates: list[str] = Field(default_factory=list, description="대안 f 최대 2개")
    reason: str = Field(default="", description="선정 이유 40자 이내")


class LLMLayoutPicks(BaseModel):
    picks: list[LLMSlidePick] = Field(default_factory=list, description="슬라이드마다 하나")


class LLMSlot(BaseModel):
    i: int
    s: str


class LLMFill(BaseModel):
    blocks: list[LLMSlot]


class LLMQuestion(BaseModel):
    id: str
    question: str
    options: list[str] = Field(default_factory=list)
    default: str = ""
    affects: list[str] = Field(default_factory=list)


class LLMDecomposition(BaseModel):
    conflicts: list[str] = Field(default_factory=list, description="서로 부딪히는 요구 · 위험(근거 요구 id 포함)")
    gaps: list[str] = Field(default_factory=list, description="제안서를 만들기 전에 확인해야 할 빠진 정보")
    strategy_ranking: list[str] = Field(default_factory=list, description="전략 키 적합 순서")
    questions: list[LLMQuestion] = Field(default_factory=list)
