"""Small text-similarity helpers (stdlib only): Korean char-bigram + word tokens, BM25 over a fixed corpus."""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Dict, Iterable, List, Sequence

_WORD = re.compile(r'[A-Za-z0-9]+|[가-힣]+')
STOP = {'삼성', '삼성전자', '공식', '참고', '사진', '이미지', '제품', '장면', '모습', 'samsung', 'com', '및', '등', '위', '와', '과', '의', '을', '를',
        '이', '가', '은', '는', '에', '로', '으로', '한', '하는', '있는', '수', '것', '컷', '정면', '측면', '사례', '도입사례', '참고사진'}


def tokens(text: str) -> List[str]:
    """word tokens (lower) + Korean char bigrams of each Hangul word — robust to particles and compounds."""
    out: List[str] = []
    for w in _WORD.findall(str(text or '').lower()):
        if w in STOP:
            continue
        if re.fullmatch(r'[가-힣]+', w):
            if len(w) == 1:
                continue
            out.append(w)
            if len(w) > 2:
                out.extend(w[i:i + 2] for i in range(len(w) - 1))
        elif len(w) >= 2 and not w.isdigit():
            out.append(w)
    return out


class BM25:
    def __init__(self, docs: Sequence[Iterable[str]], k1: float = 1.2, b: float = 0.6) -> None:
        self.docs = [Counter(d) for d in docs]
        self.len = [sum(d.values()) for d in self.docs]
        self.avg = (sum(self.len) / len(self.len)) if self.len else 1.0
        df: Counter = Counter()
        for d in self.docs:
            df.update(d.keys())
        n = len(self.docs)
        self.idf: Dict[str, float] = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}
        self.k1, self.b = k1, b

    def score(self, query: Iterable[str], i: int) -> float:
        d, L = self.docs[i], self.len[i]
        s = 0.0
        for t in set(query):
            f = d.get(t)
            if not f:
                continue
            s += self.idf.get(t, 0.0) * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * L / self.avg))
        return s

    def scores(self, query: Iterable[str], idx: Iterable[int] = None) -> Dict[int, float]:
        q = list(query)
        rng = range(len(self.docs)) if idx is None else idx
        return {i: self.score(q, i) for i in rng}


def overlap(a: str, b: str) -> float:
    """symmetric token overlap (Dice) — cheap similarity for short labels."""
    ta, tb = set(tokens(a)), set(tokens(b))
    if not ta or not tb:
        return 0.0
    return 2 * len(ta & tb) / (len(ta) + len(tb))
