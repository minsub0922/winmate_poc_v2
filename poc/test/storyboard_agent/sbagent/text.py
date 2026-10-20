"""텍스트 유틸 — 정규화 · 2글자 단위 유사도 · 수치 추출 (표준 라이브러리만)."""
from __future__ import annotations

import math
import re
from collections import Counter

_PUNCT = re.compile(r"[\s·•\-–—_/\\|,.:;!?'\"“”‘’()\[\]{}<>~※*#`→←↔▶▷=+&%^]+")


def norm(s: str) -> str:
    """대조용: 소문자 · 공백 · 문장부호 제거."""
    return _PUNCT.sub("", str(s or "").lower())


def bigrams(s: str) -> set[str]:
    t = norm(s)
    if len(t) < 2:
        return {t} if t else set()
    return {t[i:i + 2] for i in range(len(t) - 1)}


def dice(a: str, b: str) -> float:
    ga, gb = bigrams(a), bigrams(b)
    if not ga or not gb:
        return 0.0
    return 2 * len(ga & gb) / (len(ga) + len(gb))


def containment(part: str, whole: str) -> float:
    """part 의 2글자 단위 중 whole 에 있는 비율."""
    ga, gb = bigrams(part), bigrams(whole)
    if not ga:
        return 0.0
    return len(ga & gb) / len(ga)


def toks(s: str) -> list[str]:
    """검색용 토큰 — 영문/숫자 단어 + 한글 2글자 단위 (앱 search.js 와 같은 방식)."""
    s = str(s or "").lower()
    out: list[str] = []
    for m in re.finditer(r"[a-z0-9][a-z0-9.+#]*|[가-힣]+", s):
        w = m.group(0).rstrip(".")
        if re.search(r"[가-힣]", w):
            if len(w) == 1:
                out.append(w)
            else:
                out.extend(w[i:i + 2] for i in range(len(w) - 1))
        elif len(w) > 1 or w.isdigit():
            out.append(w)
    return out


class TfIdf:
    """작은 문서 묶음용 TF-IDF 코사인."""

    def __init__(self, docs: list[str]):
        self.docs = [Counter(toks(d)) for d in docs]
        n = len(self.docs)
        df: Counter = Counter()
        for d in self.docs:
            df.update(d.keys())
        self.idf = {k: math.log(1 + n / (1 + v)) for k, v in df.items()}
        self.vecs = [self._vec(d) for d in self.docs]

    def _vec(self, c: Counter) -> dict[str, float]:
        v = {k: (1 + math.log(f)) * self.idf.get(k, math.log(1 + len(self.docs))) for k, f in c.items()}
        n = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {k: x / n for k, x in v.items()}

    def sims(self, query: str) -> list[float]:
        q = self._vec(Counter(toks(query)))
        return [sum(q.get(k, 0.0) * x for k, x in v.items()) for v in self.vecs]


# ---------------------------------------------------------------- 수치 (근거 대조)
# 수치를 '주장' 단위로 읽는다: 금액(억 · 만 원) · 날짜(11/16 · 11월 16일) · 연월(2027.3 · 2027년 3월 · 26.11~) · 연도 · 단위 붙은 수.
# 같은 값을 다른 표기로 쓴 것(1억 9,000만 원 = 1.9억 원, 46곳 = 46개)은 같은 주장으로 본다.
MONEY_RE = re.compile(r"(?<![\d.,])(\d[\d,]*(?:\.\d+)?)\s*억\s*(?:(\d[\d,]*)\s*(천)?\s*만)?\s*원?|(?<![\d.,])(\d[\d,]*(?:\.\d+)?)\s*(천)?\s*만\s*원|(?<![\d.,])(\d[\d,]*(?:\.\d+)?)\s*원")
MONTH_RE = re.compile(r"(?<![\d.])(\d{1,2})\s*월(?!\s*\d{1,2}\s*일)")
YM_RE = re.compile(r"(?<!\d)(20\d\d)\s*(?:년\s*|[.\-/]\s*)(\d{1,2})(?!\d)\s*월?")
SHORT_YM_RE = re.compile(r"(?<![\d.])([23]\d)\.(\d{1,2})(?=\s*[~–\-)]|\s*$)")
DATE_RE = re.compile(r"(?<![\d.])(\d{1,2})\s*/\s*(\d{1,2})(?![\d/])|(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일|(?<![\d.])(\d{1,2})\.(\d{1,2})(?=\s*[~–\-(]|\s*\(|일)|(?<=[~–\-])\s*(\d{1,2})\.(\d{1,2})(?!\d)")
YEAR_RE = re.compile(r"(?<!\d)((?:19|20)\d\d)(?!\d)\s*년?")
NUM_RE = re.compile(r"(?<![A-Za-z0-9_.,])(\d[\d,]*(?:\.\d+)?)\s*(인치|kwh|nit|ms|hz|℃|°c|%|퍼센트|개월|개소|시간|세대|대|개|곳|실|명|건|초|분|일|주|년|층|면|석|배|호|점|회|장|인|평|㎡|kg|gb|w|m)?", re.I)
UNIT_CLASS = {"%": "pct", "퍼센트": "pct", "개": "cnt", "곳": "cnt", "대": "cnt", "실": "cnt", "면": "cnt", "명": "cnt", "세대": "cnt", "개소": "cnt",
              "석": "cnt", "층": "cnt", "호": "cnt", "장": "cnt", "인": "cnt", "회": "cnt", "건": "cnt"}


def _f(raw: str) -> float | None:
    try:
        return float(raw.replace(",", ""))
    except (ValueError, AttributeError):
        return None


def _n(raw: str) -> str:
    raw = raw.replace(",", "").rstrip(".")
    return raw.rstrip("0").rstrip(".") if "." in raw else raw


def claims(s: str) -> list[tuple]:
    """수치 주장 목록 — ('money', 만원) · ('won', 원) · ('date', 월, 일) · ('ym', 연, 월) · ('month', 월) · ('year', 연) · ('num', 수, 단위분류|'') + (시작, 끝, 원문)."""
    s = str(s or "")
    out: list[tuple] = []
    taken = [False] * len(s)

    def take(m, c):
        if any(taken[m.start():m.end()]):
            return
        for i in range(m.start(), m.end()):
            taken[i] = True
        out.append(c + ((m.start(), m.end(), m.group(0).strip()),))

    for m in MONEY_RE.finditer(s):
        if m.group(1) is not None:
            v = (_f(m.group(1)) or 0) * 10000 + ((_f(m.group(2)) or 0) * (1000 if m.group(3) else 1) if m.group(2) else 0)
            take(m, ("money", round(v, 2)))
        elif m.group(4) is not None:
            take(m, ("money", round((_f(m.group(4)) or 0) * (1000 if m.group(5) else 1), 2)))
        elif m.group(6) is not None:
            take(m, ("won", round(_f(m.group(6)) or 0, 2)))
    for m in YM_RE.finditer(s):
        if 1 <= int(m.group(2)) <= 12:
            take(m, ("ym", int(m.group(1)), int(m.group(2))))
    for m in SHORT_YM_RE.finditer(s):
        if 1 <= int(m.group(2)) <= 12:
            take(m, ("ym", 2000 + int(m.group(1)), int(m.group(2))))
    for m in DATE_RE.finditer(s):
        g = [x for x in m.groups() if x is not None]
        mo, d = int(g[0]), int(g[1])
        if 1 <= mo <= 12 and 1 <= d <= 31:
            take(m, ("date", mo, d))
    for m in MONTH_RE.finditer(s):
        if 1 <= int(m.group(1)) <= 12:
            take(m, ("month", int(m.group(1))))
    for m in YEAR_RE.finditer(s):
        take(m, ("year", int(m.group(1))))
    for m in NUM_RE.finditer(s):
        raw = m.group(1).replace(",", "").rstrip(".")
        v = _f(raw)
        if v is None or ("." not in raw and v < 10):
            continue
        unit = (m.group(2) or "").lower()
        take(m, ("num", _n(raw), UNIT_CLASS.get(unit, unit)))
    return out


def number_set(s: str) -> set:
    """근거 수치 집합(주장의 값 부분만)."""
    return {c[:-1] for c in claims(s)}


def supported(c: tuple, src: set) -> bool:
    k = c[0]
    if k == "money":
        return any(x[0] == "money" and abs(x[1] - c[1]) <= max(0.5, 0.005 * c[1]) for x in src)
    if k == "won":
        return c in src or any(x[0] == "money" and abs(x[1] * 10000 - c[1]) < 1 for x in src)
    if k == "year":
        return c in src or any(x[0] == "ym" and x[1] == c[1] for x in src)
    if k in ("date", "ym"):
        return c in src
    if k == "month":
        return c in src or any((x[0] == "date" and x[1] == c[1]) or (x[0] == "ym" and x[2] == c[1]) for x in src)
    n, cls = c[1], c[2]
    if (k, n, cls) in src or (k, n, "") in src:
        return True
    if cls == "":
        return any(x[0] == "num" and x[1] == n for x in src) or any(x[0] in ("date", "ym") and str(x[2]) == n for x in src)
    return False


def unsupported_claims(text: str, src: set) -> list[tuple]:
    return [c for c in claims(text) if not supported(c[:-1], src)]


def unsupported_numbers(text: str, src: set) -> list[str]:
    return sorted({c[-1][2] for c in unsupported_claims(text, src)})


def clip(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def sentences(s: str) -> list[str]:
    out = []
    for line in str(s or "").split("\n"):
        for x in re.split(r"(?<=[.!?。])\s+|(?<=다\.)\s*", line):
            x = x.strip(" -•·\t")
            if x:
                out.append(x)
    return out
