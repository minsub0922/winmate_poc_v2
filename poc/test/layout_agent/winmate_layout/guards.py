"""고객 화면에 나가면 안 되는 것을 막는 검사 — 1018 평가에서 리뷰어가 짚은 문제를 규칙으로.

1. 근거 없는 주장   : '완료 · Y · 강 · 100% 충족 · 완벽 대응 · 경쟁사 90' 처럼 확인되지 않은 충족 · 점수 · 비교
2. 숫자 오용        : 원문 어딘가에 있는 숫자를 다른 뜻으로('10/15' → '10~15실', 해상도 '3840' → '도입 수량') — 단위까지 맞아야 받는다
3. 내부 메모 노출   : 제작자 의견 · 자유 입력(담당자 메모 · 전달 메일) 문장을 그대로 싣지 않는다
4. 사례 · 인용 날조 : 고객사를 도입 사례처럼, 고객 담당자 이름으로 인용, 연락처 칸에 고객 측 담당자
"""
from __future__ import annotations

import re

from .text import numbers, split_lines, words

# ---------------------------------------------------------------- 1. 주장
STATUS_WORDS = {"완료", "충족", "미충족", "부분 충족", "부분충족", "Y", "N", "O", "X", "○", "●", "◎", "△", "✓", "✔", "강", "보통", "보완", "상", "중", "하",
                "적합", "부적합", "만족", "우수", "충족(완료)", "완료(충족)", "가능"}
CLAIM_RE = re.compile(
    r"완벽|100\s*%\s*(?:충족|대응|준수|만족|달성)|모든\s*(?:요구|항목|규격|요건)[가-힣 ]{0,6}(?:충족|대응|준수)|전\s*항목[^.\n]{0,12}(?:충족|준수|완료)"
    r"|최초|유일|업계\s*(?:최고|1위|최초)|국내\s*(?:1위|최초|최고)|압도적|독보적|경쟁사\s*대비\s*[\d\[]|타사\s*대비\s*[\d\[]|보장합니다|확실히\s*충족"
    # 데이터 없이 내린 결론 · 비교 판정 · 단정 과장(샘플 문구에 남아 있던 것: '3년차에 역전', '업계보다 높음', '소음 없이')
    r"|\d+\s*년\s*차에\s*역전|역전합니다|업계\s*(?:보다|와|대비)\s*(?:높|좋|낮|비슷|우수)|\d+\s*%\s*경쟁\s*안\s*대비|소음\s*없이|없는\s*청정|걱정\s*없"
    # 하지 않은 조사 · 받지 않은 자료를 근거로 쓴 말('현장 조사 · 실측 포함', '시설 민원 기록 기반')
    r"|(?:현장\s*(?:조사|인터뷰|면담|실사)|실측|민원\s*기록)[^\n]{0,10}?(?:기반|포함|결과|완료)")
NUM_PH_RE = re.compile(r"\[[0-9.,]+\]")
PAGE_RE = re.compile(r"(?<![A-Za-z])(p\.\s?)(\d{1,3})(?:\s?[~\-–]\s?\d{1,3})?")


def is_status(s: str) -> bool:
    return (s or "").strip() in STATUS_WORDS


def claims(s: str, source_text: str = "") -> list[str]:
    """근거 없는 주장 표현 — 고객 원문에 같은 말이 있으면(요구 문장 인용) 제외."""
    out = []
    for m in CLAIM_RE.finditer(s or ""):
        if m.group(0) not in (source_text or ""):
            out.append(m.group(0))
    return out


def scrub_pages(s: str) -> str:
    """지어낸 쪽 번호('RFP p.3', '제품 사양서 p.02') → p.[00]"""
    return PAGE_RE.sub(lambda m: m.group(1) + "[00]", s or "")


# ---------------------------------------------------------------- 2. 숫자 + 단위
UNIT_NORM = {"퍼센트": "%", "억원": "억", "만원": "만", "개소": "곳", "ppm": "PPM", "㎾": "kW", "°C": "℃", "m2": "㎡", "\"": "인치"}


def _u(u: str) -> str:
    u = (u or "").replace(" ", "")
    return UNIT_NORM.get(u, u)


def unit_facts(*texts: str) -> dict[tuple[str, str], set[str]]:
    """(값, 단위) → 그 숫자 앞뒤에 나온 낱말들(무엇의 수치인지) — '발표 15분'의 15분을 '장애 대응 15분'에 쓰지 못하게."""
    out: dict[tuple[str, str], set[str]] = {}
    for t in texts:
        t = t or ""
        for n in numbers(t):
            a, b = n.span
            ctx = t[max(0, a - 14):a] + " " + t[b:b + 8]
            out.setdefault((n.value, _u(n.unit)), set()).update(w for w in words(ctx) if len(w) >= 2 and not re.search(r"\d", w))
    return out


def bad_unit_numbers(s: str, facts: dict, extra_ok: set[str] | None = None) -> list[str]:
    """단위가 붙은 숫자는 (값, 단위)가 원문 · 카탈로그에 있어야 하고, 문장 속 숫자면 원문에서 그 숫자 곁에 있던 낱말도 함께 있어야 한다.
    단위 없는 숫자는 기존 검사(값 집합)에 맡긴다."""
    bad = []
    nums = numbers(s)
    rest = re.sub(r"[\d.,~\-–%\s]+", "", s)
    for n in nums:
        u = _u(n.unit)
        if not u:
            continue
        if extra_ok and n.text in extra_ok:
            continue
        key = (n.value, u)
        if key not in facts:
            bad.append(n.text)
            continue
        alone = len(rest.replace(n.unit or "", "")) <= 2  # 숫자만 있는 칸(라벨은 옆 칸) — 값 · 단위만 맞으면 받는다
        if alone or not facts[key]:
            continue
        if not any(w in s for w in facts[key]):
            bad.append(n.text)
    return bad


# ---------------------------------------------------------------- 3. 내부 메모
INFORMAL_RE = re.compile(r"ㅋ|ㅎㅎ|ㅠ|먹힐|하는게|하는 게|라고 함|달라고|해달라|같음|인듯|할듯|일듯|듯\.?$|드림$|전달드립|팀장님|부장님|이사장님|원장님|과장님|떨어짐|승부|확보해둠|예정임")
GRAM = 14


def _n(s: str) -> str:
    return re.sub(r"[\s\W_]+", "", s or "").lower()


def _grams(s: str, n: int = GRAM) -> set[str]:
    s = _n(s)
    return {s[i:i + n] for i in range(0, max(0, len(s) - n + 1))}


def internal_grams(note: str, free: str, customer_text: str) -> set[str]:
    """제작자 의견 · 자유 입력 문장의 14자 조각 — 고객 자료(키맨 요구 · 첨부 원문)에도 그대로 있는 조각은 뺀다."""
    g = set()
    for line in split_lines(note) + split_lines(free):
        g |= _grams(line)
    return g - _grams(customer_text)


def leaks(s: str, grams: set[str]) -> bool:
    if not s:
        return False
    if INFORMAL_RE.search(s):
        return True
    return bool(grams) and bool(_grams(s) & grams)


# ---------------------------------------------------------------- 4. 사례 · 인용 · 연락처
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PHONE_RE = re.compile(r"(?<!\d)(?:0\d{1,2}|1\d{3})[-. )]\s?\d{3,4}[-. ]\d{4}(?!\d)")
TITLE_RE = re.compile(r"([가-힣]{2,4})\s*(?:·|,|\s)?\s*(?:팀장|과장|차장|대리|부장|주임|매니저|책임|선임|수석|실장|본부장|이사|상무|전무|대표|주무관|장학관|원장)")
QUOTE_ATTR_RE = re.compile(r"[—–―]\s*\S")


def contact_names(text: str) -> set[str]:
    """원문의 연락처 줄(전화 · 이메일 · 담당)에 나온 사람 이름."""
    out = set()
    for line in (text or "").splitlines():
        if EMAIL_RE.search(line) or PHONE_RE.search(line) or re.search(r"드림$|보낸사람", line.strip()):
            for m in TITLE_RE.finditer(line):
                out.add(m.group(1))
            for m in re.finditer(r"([가-힣]{2,4})\s*<", line):
                out.add(m.group(1))
    return {n for n in out if n not in {"담당", "업무", "도입", "기술", "구매", "총무", "삼성", "고객"} and not re.search(r"(부|팀|과|실|처|청|국|단|파트|센터)$", n)}


def has_contact(s: str, names: set[str] | None = None) -> bool:
    if EMAIL_RE.search(s or "") or PHONE_RE.search(s or ""):
        return True
    return bool(names) and any(n in s for n in names)


# ---------------------------------------------------------------- 5. 고르지 않은 제품 종류
CATEGORY_WORDS = {
    "signage": (["LCD 사이니지", "LED 사이니지", "옥외 사이니지", "비디오월", "시네마 LED", "컬러 이페이퍼"], r"사이니지|메뉴보드|메뉴판|비디오월|전광판|미디어월|미디어 파사드|이페이퍼|MagicINFO|VXT"),
    "hvac": (["시스템에어컨", "공조", "공조 · 환기", "히트펌프"], r"에어컨|냉난방|냉방|난방|카세트|공조|환기 시스템|히트펌프|칠러|무풍|실외기|실내기|\bDMS\b|SAC 제어|덥고|더워|무더위"),
    "kiosk": (["키오스크"], r"키오스크"),
    "board": (["전자칠판"], r"전자칠판"),
    "hoteltv": (["호텔 TV"], r"호텔\s*TV|객실\s*TV"),
    "monitor": (["모니터"], r"모니터"),
    "pc": (["PC · 노트북"], r"노트북|갤럭시\s*북"),
    "mobile": (["갤럭시 탭", "갤럭시 스마트폰", "갤럭시 워치 · 태그"], r"태블릿|갤럭시\s*탭|스마트폰|워치|스마트태그|전자서식|S펜|병상 전용 앱|Knox"),
    "living": (["빌트인 주방가전", "리빙가전", "상업용 세탁 · 건조"], r"냉장고|인덕션|식기세척기|세탁기|건조기|공기청정기|에어드레서|쇼케이스|신선도"),
    "audio": (["하만 프로 오디오"], r"스피커|프로 오디오"),
    "printer": (["프린터 · 복합기"], r"복합기|프린터|프린트\s?(센터|카페)"),
}


def foreign_categories(s: str, chosen_cats: set[str]) -> list[str]:
    """글 속 제품 종류 중 고른 제품의 종류가 아닌 것('은행 모니터 덱의 비디오월 · 시스템에어컨')."""
    out = []
    for key, (cats, rx) in CATEGORY_WORDS.items():
        if chosen_cats & set(cats):
            continue
        m = re.search(rx, s or "")
        if m:
            out.append(m.group(0))
    return out


REPORTED_RE = re.compile(r"\s*(?:이)?(?:라|다)고\s*(?:합니다|해요|하네요|하십니다|하심|함|들었습니다)\.?$|(?:이)?(?:라|다)고요\.?$")


def display_text(s: str) -> str:
    """요구 원문을 장표에 실을 때 — 앞 [태그]와 전해 들은 말투('~라고 합니다')를 뗀다."""
    s = re.sub(r"^\[[^\]]+\]\s*", "", s or "").strip()
    return REPORTED_RE.sub("", s).rstrip(" ,.") or s


# ---------------- 사진 출처 — 동종 기관(경쟁사) 사진 ----------------
CREDIT_RE = re.compile(r"\(([^()]*)\)\s*$")
NEUTRAL_CREDIT_RE = re.compile(r"samsung\.com|생성|그림|글자|일반 형태|삼성전자|제품 컷")
# 간판 · 브랜드 색이 그대로 보이는 업종 — 같은 계열 기관 사진은 고객 덱에 쓰지 않는다(신한은행 덱의 KB국민은행 객장 사진)
PEER_FAMILIES = {
    "금융": r"은행|증권|보험|생명|화재|손해|카드|캐피탈|금융|저축",
    "유통": r"백화점|면세점|아울렛|마트|몰\b|쇼핑",
    "호텔": r"호텔|리조트",
    "통신": r"SKT|\bKT\b|LG\s?U\+|텔레콤",
}


def _family(name: str) -> str | None:
    for fam, rx in PEER_FAMILIES.items():
        if re.search(rx, name or ""):
            return fam
    return None


def photo_credit(alt: str) -> str:
    m = CREDIT_RE.search(alt or "")
    if not m:
        return ""
    c = m.group(1)
    base = re.match(r"(.+?)\s*사진을", c)  # 'KEB하나은행 사진을 흑백으로 생성' — 원본 사진의 출처
    if base:
        return base.group(1).strip()
    return "" if NEUTRAL_CREDIT_RE.search(c) else c.strip()


def peer_photo(alt: str, customer: str) -> bool:
    """사진 출처가 고객과 같은 계열의 다른 기관이면 True — 경쟁사 간판 · 브랜드가 보일 수 있다."""
    org = photo_credit(alt)
    if not org or not customer:
        return False
    core = re.sub(r"\(주\)|㈜|주식회사|\s", "", customer)
    if core and (core[:4] in org.replace(" ", "") or org.replace(" ", "")[:4] in core):
        return False  # 고객 자신의 현장
    fc, fo = _family(customer), _family(org)
    return bool(fc and fc == fo)


# ---------------- 사진 캡션 · 장표 문구의 '실제' 표기 ----------------
# 바꿔 넣은 사진은 고객 현장이 아니다 — '실제 현장 · 현재 매장 모습 · 도입 후 모습 · 생성 시안 · 연출 예시' 는 '참고 이미지' 로
REALITY_RE = re.compile(r"(?:사진은\s*)?실제\s*(?:서비스\s*|점검\s*)?(?:현장|매장|사진|구축 사진)(?:\s*사진)?|현재\s*(?:매장|현장)(?:\s*모습)?|지금\s*·\s*현장 사진|도입\s*후\s*모습(?:\s*·\s*(?:생성 시안|참고 연출))?|생성\s*시안|[가-힣A-Za-z ]{0,12}연출\s*예시")


def soften_reality(s: str) -> str:
    return REALITY_RE.sub("참고 이미지", s or "")


# ---------------- 다른 업종 표지어 ----------------
# 업종을 분명히 드러내는 말만(‘매장 · 현장 · 업무’ 같은 공통어는 뺀다) — 남은 샘플 · LLM 문장에서 다른 업종 흔적을 찾는다
IND_MARKERS = {
    "FB": ["카페", "커피", "버거", "메뉴판", "메뉴보드", "신메뉴", "가맹점", "픽업대", "드라이브스루", "원두", "음료", "베이커리", "주문 결제"],
    "RT": ["백화점", "면세점", "VMD", "쇼윈도"],
    "SV": ["편의점", "스터디카페", "PC방", "스크린골프"],
    "HT": ["호텔", "리조트", "객실", "투숙", "체크인", "웰컴 메시지", "연회"],
    "TP": ["테마파크", "박물관"],
    "VN": ["경기장", "공연장", "영화관", "스타디움", "볼파크"],
    "OF": ["입주사", "임차인"],
    "RS": ["분양", "아파트", "모델하우스"],
    "ED": ["강의실", "캠퍼스", "기숙사", "학원", "교실", "수업", "교수"],
    "PB": ["지자체", "정류장", "시청"],
    "MD": ["병원", "요양", "병동", "병실", "환자", "진료", "병상", "의료진", "재활"],
    "MF": ["공장", "생산 라인", "물류센터"],
    "FN": ["은행", "증권", "보험", "창구", "금융"],
}


def foreign_markers(s: str, ind: str | None, source_text: str = "") -> list[str]:
    """고객 업종이 아닌 업종의 표지어 — 고객 원문에 나온 말은 제외('호텔 객실 TV' RFP 의 '객실')."""
    if not ind or not s:
        return []
    own = set(IND_MARKERS.get(ind, []))
    out = []
    for k, ws in IND_MARKERS.items():
        if k == ind:
            continue
        for w in ws:
            if w in own or w in (source_text or ""):
                continue
            if w in s:
                out.append(w)
    return out


def drop_foreign_pieces(s: str, ind: str | None, source_text: str = "") -> str | None:
    """' · ' 로 이은 나열에서 다른 업종 조각만 뺀다('교실 · 병실' → '병실'). 다 빠지면 None."""
    parts = [p for p in re.split(r"\s*·\s*", s or "") if p]
    keep = [p for p in parts if not foreign_markers(p, ind, source_text)]
    if len(parts) < 2 or not keep:
        return None
    return " · ".join(keep)


# 사례 장표의 샘플 기관 이름('KB국민은행 InsighT', '현대백화점 판교점') — 카탈로그 사례가 아니면 이 고객 덱의 사례로 쓰지 않는다
ORG_RE = re.compile(r"[가-힣A-Za-z0-9&]{1,14}(?:은행|증권|보험|생명|화재|카드|병원|의료원|대학교|초등학교|중학교|고등학교|교육청|호텔|백화점|면세점|구장|공사|공단|그룹|코리아)"
                    r"(?:\s?[가-힣A-Za-z]{1,8}점|\s?InsighT)?")
