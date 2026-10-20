"""한국어 텍스트 유틸 — 토큰화(라틴 단어 + 한글 바이그램), 문장 분리, 수치 추출.

winmatev2/src/search.js 의 toks() 와 같은 방식이라 앱의 RAG 와 점수 감각이 맞는다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_TOK_RE = re.compile(r"[a-z0-9][a-z0-9.+#'\"]*|[가-힣]+")
JOSA_RE = re.compile(r"(은|는|이|가|을|를|의|에|도|로|와|과|에서|으로|까지|부터|이다|이며|하고)$")
STOP = {
    "있는", "있다", "하는", "하고", "한다", "된다", "되는", "위한", "대한", "통해", "그리고", "하지만", "먼저", "보여",
    "싶다", "지금", "올해", "뒤에", "같은", "모든", "우리", "이번", "없이", "많이", "가장", "다시", "이다", "에서",
    "으로", "것을", "수가", "때문", "합니다", "있습니다", "원합니다", "필요", "검토", "고객", "제안", "요청",
}


def toks(s: str | None) -> list[str]:
    """latin words + Hangul bigrams (search.js 와 동일)."""
    s = str(s or "").lower()
    out: list[str] = []
    for m in _TOK_RE.finditer(s):
        w = re.sub(r"['\".]+$", "", m.group(0))
        if re.search(r"[가-힣]", w):
            if len(w) == 1:
                out.append(w)
            else:
                out.extend(w[i : i + 2] for i in range(len(w) - 1))
        elif len(w) > 1 or re.search(r"\d", w):
            out.append(w)
    return out


def words(s: str | None, min_len: int = 2) -> list[str]:
    """조사를 떼어 낸 의미 단어 (키워드 일치 · 근거 표시용)."""
    out = []
    for w in re.split(r"[\s,·.!?'\"“”‘’()\[\]/:;~→\-]+", str(s or "")):
        w = JOSA_RE.sub("", w.strip())
        if len(w) >= min_len and w not in STOP:
            out.append(w)
    return out


def split_lines(text: str | None) -> list[str]:
    """줄 · 글머리표 · 문장 단위로 쪼갠다."""
    raw = re.split(r"\n+", str(text or ""))
    out: list[str] = []
    for line in raw:
        line = re.sub(r"^\s*(?:[-•·*▪◦]|\d+[.)])\s*", "", line).strip()
        if not line:
            continue
        parts = re.split(r"(?<=[.!?。])\s+(?=[^\d])", line)
        out.extend(p.strip() for p in parts if p.strip())
    return out


UNITS = r"%|퍼센트|배|분|초|일|시간|억\s*원|억|만\s*원|만|천|원|곳|개소|개|실|대|층|명|PPM|ppm|인치|\"|년|주|개월|nit|kW|㎾|℃|°C|면|평|㎡|m2|세대|점|매장|지점|석|병상|가구"
NUM_RE = re.compile(rf"(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s*({UNITS})?")


@dataclass
class NumMention:
    value: str
    unit: str
    span: tuple[int, int]
    text: str  # 원문 그대로 (예: '320개')


def numbers(text: str | None) -> list[NumMention]:
    s = str(text or "")
    s = re.sub(r"\[[^\[\]]{0,24}\]", lambda m: " " * len(m.group(0)), s)  # [00] 같은 자리표시 안의 숫자는 수치가 아니다
    out = []
    for m in NUM_RE.finditer(s):
        v, u = m.group(1), (m.group(2) or "")
        # 연도 · 날짜 숫자도 근거로 남긴다(일정 확인용)
        out.append(NumMention(v.replace(",", ""), u.replace(" ", ""), m.span(), m.group(0).strip()))
    return out


def number_values(text: str | None) -> set[str]:
    """비교용 숫자 집합(쉼표 제거)."""
    return {n.value for n in numbers(text)}


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def clip(s: str, n: int) -> str:
    """n 자 이내로 자른다 — 단어 경계 우선, 숫자 · 영문 토큰은 중간에서 자르지 않는다, 말줄임 없이."""
    s = norm(s)
    if len(s) <= n:
        return s
    cut = s[:n]
    if cut.count("[") > cut.count("]"):  # 자리표시 [..] 안에서 자르지 않는다
        cut = cut[: cut.rfind("[")].rstrip() or s[: s.find("]") + 1]
        return cut
    sp = max(cut.rfind(" "), cut.rfind("·"))
    if sp >= n * 0.6:
        cut = cut[:sp]
    elif re.match(r"[0-9A-Za-z.,%]", s[n:n + 1] or " ") and re.search(r"[0-9A-Za-z.,]$", cut):
        m = re.search(r"[0-9A-Za-z.,%]+$", cut)
        if m and m.start() > 0:
            cut = cut[: m.start()]
    return cut.rstrip(" ·,—-(")


def shorten(s: str, n: int) -> str | None:
    """라벨용 — 'A — B' 나 'A · B' 의 앞부분으로 줄여 n 자에 맞춘다. 맞출 수 없으면 None."""
    s = norm(s)
    if len(s) <= n:
        return s
    for sep in (" — ", " - ", ": "):
        head = s.split(sep)[0].strip()
        if 2 <= len(head) <= n:
            return head
    c = clip(s, n)
    # 단어 경계에서 잘린 경우만 인정(‘설치 · 시운’ 처럼 낱말 중간에서 잘리면 버린다)
    nxt = s[len(c):len(c) + 1]
    # 문장의 앞 몇 낱말만 남는 조각('이 결과로', '작년 1개 병동')은 라벨로 쓰지 않는다 — 원문의 45% 이상을 담을 때만
    if len(c) >= n * 0.6 and len(c) >= len(s) * 0.45 and (nxt in ("", " ", "·", ",") or s[len(c):].lstrip().startswith(("·", ","))):
        return c
    head = s.split(" · ")[0].strip()
    if 6 <= len(head) <= n:
        return head
    return None


def has_placeholder(s: str) -> bool:
    return bool(re.search(r"\[[^\[\]]{1,24}\]", s or ""))


JOSA = [("가", "이"), ("는", "은"), ("를", "을"), ("와", "과"), ("로", "으로"), ("야", "이야")]


def has_batchim(word: str) -> bool:
    ch = (word or " ").strip()[-1:]
    if "가" <= ch <= "힣":
        return (ord(ch) - 0xAC00) % 28 != 0
    return (ch.isdigit() and ch in "0136789") or (ch.isalpha() and ch.upper() in "LMN")


def josa_fix(name: str, josa: str) -> str:
    """'A 커피가' → 고객명에 맞춰 '가/이' 등 조사를 고른다."""
    for a, b in JOSA:
        if josa in (a, b):
            return b if has_batchim(name) else a
    return josa
