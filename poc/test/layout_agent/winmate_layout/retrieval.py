"""레이아웃 RAG — BM25(한글 바이그램) + Dense(TF-IDF char n-gram 또는 Gemini 임베딩) 하이브리드.

검색만 한다. '이 파트에 맞는가'는 layout_design.py 의 메타데이터 적합도 점수가 판단하고,
Gemini 가 있으면 상위 후보 카드(메타데이터)를 읽고 최종 선택한다.
"""
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter

import numpy as np

from . import config
from .kb import KB
from .text import toks

SYN = [
    (["경쟁", "경쟁사"], ["공급사", "비교", "why", "포지셔닝", "점유율"]),
    (["시장"], ["mi", "트렌드", "성장", "규모"]),
    (["수량", "물량"], ["구성", "대수", "구성표"]),
    (["비용", "가격", "견적", "예산"], ["tco", "구매", "투자", "총소유비용"]),
    (["일정", "로드맵", "스케줄"], ["단계", "파일럿", "실행", "설치", "주차"]),
    (["roi", "회수"], ["효과", "투자", "절감"]),
    (["kpi", "지표"], ["효과", "전후", "수치"]),
    (["조감도", "시안", "렌더"], ["전경", "배치", "도면", "존"]),
    (["사례", "레퍼런스"], ["도입", "성과", "고객"]),
    (["스펙", "사양", "규격"], ["비교표", "치수", "인증"]),
    (["요약", "개요"], ["한 장", "경영진", "핵심"]),
    (["공간"], ["존", "층", "동선", "맵"]),
    (["동선", "하루"], ["시나리오", "시간대", "장면"]),
    (["보안"], ["보안 요건", "대응표", "개인정보", "통제"]),
    (["요구", "rfp", "평가"], ["대응표", "배점", "요구사항"]),
    (["교체", "리뉴얼", "노후"], ["교체 매핑", "전 → 후", "무중단"]),
    (["파일럿", "확산"], ["단계", "성공 기준", "물량"]),
    (["문제", "과제", "페인", "불편"], ["원인", "영향", "불편"]),
    (["가치", "밸류"], ["value", "기둥", "키 메시지"]),
]


def expand(q: str) -> str:
    ql = q.lower()
    extra = [w for keys, add in SYN if any(k in ql for k in keys) for w in add]
    return " ".join(extra)


def card_doc(c: dict) -> str:
    roles = " ".join(u["role"] for u in c["usage"][:6])
    return " ".join([
        c["name"], c["name"], c["name"], c["when"], c["when"], c["purpose"], c["part_label"], c["part_label"],
        c["headline"], c["headline"], c["code"], c["ind_name"], c["ind_name"], c["sol_name"], c["sol_name"],
        " ".join(c["sample_products"]), roles, roles, " ".join(c["visual"]), c["embed_text"][-260:],
    ])


class BM25:
    def __init__(self, docs: list[str], k1: float = 1.2, b: float = 0.75) -> None:
        self.tfs = []
        self.lens = []
        df: Counter = Counter()
        for d in docs:
            t = toks(d)
            tf = Counter(t)
            self.tfs.append(tf)
            self.lens.append(len(t))
            df.update(tf.keys())
        self.N = len(docs)
        self.avg = sum(self.lens) / max(1, self.N)
        self.idf = {k: math.log(1 + (self.N - v + 0.5) / (v + 0.5)) for k, v in df.items()}
        self.k1, self.b = k1, b

    def scores(self, q: dict[str, float]) -> np.ndarray:
        out = np.zeros(self.N)
        for i, tf in enumerate(self.tfs):
            s = 0.0
            for t, w in q.items():
                f = tf.get(t)
                if not f:
                    continue
                s += w * self.idf.get(t, 0) * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * self.lens[i] / self.avg))
            out[i] = s
        return out


class LayoutIndex:
    def __init__(self, kb: KB, dense: str | None = None) -> None:
        self.kb = kb
        self.cards = list(kb.cards.values())
        self.fs = [c["f"] for c in self.cards]
        self.pos = {f: i for i, f in enumerate(self.fs)}
        self.bm25 = BM25([card_doc(c) for c in self.cards])
        self.dense_mode = dense or config.DENSE_MODE
        self._build_dense()

    def _build_dense(self) -> None:
        texts = [c["embed_text"] for c in self.cards]
        if self.dense_mode == "gemini" and config.GEMINI_API_KEY:
            try:
                self.emb = self._gemini_embed(texts)
                self._embed_q = self._gemini_query
                return
            except Exception as e:  # noqa: BLE001
                print(f"[retrieval] Gemini 임베딩 실패 → TF-IDF 로 대체: {e}")
        from sklearn.feature_extraction.text import TfidfVectorizer

        self.vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), min_df=1, sublinear_tf=True)
        m = self.vec.fit_transform(texts)
        self.emb = m
        self._embed_q = lambda q: self.vec.transform([q])
        self.dense_mode = "tfidf"

    def _gemini_embed(self, texts: list[str]) -> np.ndarray:
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        h = hashlib.sha1(json.dumps(texts, ensure_ascii=False).encode()).hexdigest()[:12]
        path = config.CACHE_DIR / f"emb_{config.GEMINI_EMBED_MODEL}_{h}.npy"
        self._gem = GoogleGenerativeAIEmbeddings(model=config.GEMINI_EMBED_MODEL, api_key=config.GEMINI_API_KEY)
        if path.exists():
            return np.load(path)
        vecs = []
        for i in range(0, len(texts), 64):
            vecs.extend(self._gem.embed_documents(texts[i : i + 64]))
        arr = np.asarray(vecs, dtype=np.float32)
        arr /= np.linalg.norm(arr, axis=1, keepdims=True) + 1e-9
        np.save(path, arr)
        return arr

    def _gemini_query(self, q: str) -> np.ndarray:
        v = np.asarray(self._gem.embed_query(q), dtype=np.float32)
        return v / (np.linalg.norm(v) + 1e-9)

    def search(self, query: str, k: int = 40) -> list[tuple[str, float, dict]]:
        """(f, fused score 0~1, {bm25, dense}) — 상위 k."""
        qmap: dict[str, float] = {}
        for t in toks(query):
            qmap[t] = qmap.get(t, 0) + 1.0
        for t in toks(expand(query)):
            qmap[t] = qmap.get(t, 0) + 0.45
        b = self.bm25.scores(qmap)
        if self.dense_mode == "tfidf":
            qv = self._embed_q(query + " " + expand(query))
            d = (self.emb @ qv.T).toarray().ravel()
        else:
            d = np.asarray(self.emb @ self._embed_q(query)).ravel()
        bn = b / (b.max() or 1)
        dn = (d - d.min()) / ((d.max() - d.min()) or 1)
        fused = 0.55 * bn + 0.45 * dn
        idx = np.argsort(-fused)[:k]
        return [(self.fs[i], float(fused[i]), {"bm25": round(float(bn[i]), 3), "dense": round(float(dn[i]), 3)}) for i in idx]

    def score_all(self, query: str) -> dict[str, tuple[float, dict]]:
        res = self.search(query, k=len(self.fs))
        return {f: (s, d) for f, s, d in res}
