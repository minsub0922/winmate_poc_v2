"""시장조사 근거 DB — 동적 검색으로 얻은 것을 쌓아 다음 조사에서 다시 쓴다(SQLite 파일 하나).

고객사는 예측할 수 없으므로 업종별 자료를 미리 만들어 두지 않는다. 조사는 언제나 그 고객의 요구사항에서 뽑은 검색어로 새로 하고,
그 과정에서 얻은 것을 세 층으로 쌓는다:

- ``searches``  (출처, 검색어) → 결과 목록. 같은 검색어를 ``search_ttl`` 안에 다시 찾으면 사이트를 부르지 않는다.
- ``docs``      주소 → 정제한 본문. 같은 문서를 ``doc_ttl`` 안에 다시 받지 않고, 쌓인 본문은 그 자체가 검색 대상이 된다(``docs_search`` — 바깥 접속이 안 될 때도 쓸 수 있다).
- ``extracted`` (문서, 주제 키워드) → 그 문서에서 그 주제의 사실을 이미 뽑아 봤다는 표시. 같은 문서를 같은 주제로 다시 읽어 모델을 부르지 않는다
                (그때 통과한 근거는 ``evidence`` 에 있고, 통과한 것이 없었다면 다시 읽어도 없다).
- ``evidence``  원문 대조 · 이름 확인까지 통과한 근거(수치 · 추이 · 구성비 · 흐름) 한 건씩 — 인용 · 출처 · 조사일 · 검증 규칙 판(``v``)과 함께.
                다른 고객의 조사라도 **같은 업종**이고 주제 키워드가 맞으면 다시 쓴다. 업종이 다르면 쓰지 않는다(지표 이름만으로는 누구의 값인지 다 드러나지 않는다).
                규칙 판이 다르면 쓰지 않는다(규칙이 바뀌면 다시 검증해야 하므로).

여기에 들어가는 것은 공개 검색어 · 공개 문서 · 그 문서에서 확인한 사실뿐이다 — 고객사 이름 · 요구사항 원문은 저장하지 않는다
(검색어는 market_research.public_query 가 고객 고유 이름을 지운 뒤의 것이고, 근거에는 업종 코드와 주제 키워드만 붙는다).

모든 함수는 실패해도 예외를 던지지 않는다 — DB는 재사용을 위한 것이고, 못 쓰면 그냥 새로 검색한다.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import threading
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

SCHEMA = """
CREATE TABLE IF NOT EXISTS searches(engine TEXT NOT NULL, query TEXT NOT NULL, ts REAL NOT NULL, n INTEGER NOT NULL, results TEXT NOT NULL, PRIMARY KEY(engine, query));
CREATE TABLE IF NOT EXISTS docs(url TEXT PRIMARY KEY, host TEXT, tier INTEGER, title TEXT, published TEXT, kind TEXT, engine TEXT, text TEXT NOT NULL, flat TEXT NOT NULL, sha TEXT, ts REAL NOT NULL);
CREATE INDEX IF NOT EXISTS docs_ts ON docs(ts);
CREATE TABLE IF NOT EXISTS evidence(sig TEXT PRIMARY KEY, kind TEXT NOT NULL, ind TEXT, name TEXT, terms TEXT NOT NULL, year INTEGER, scope TEXT, tier INTEGER, url TEXT,
                                    data TEXT NOT NULL, v INTEGER NOT NULL, first REAL NOT NULL, seen REAL NOT NULL, uses INTEGER NOT NULL DEFAULT 0, used REAL);
CREATE INDEX IF NOT EXISTS evidence_seen ON evidence(v, seen);
CREATE TABLE IF NOT EXISTS extracted(url TEXT NOT NULL, topic TEXT NOT NULL, v INTEGER NOT NULL, ts REAL NOT NULL, PRIMARY KEY(url, topic));
CREATE TABLE IF NOT EXISTS engines(engine TEXT PRIMARY KEY, ok INTEGER NOT NULL DEFAULT 0, empty INTEGER NOT NULL DEFAULT 0, fail INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0,
                                   error TEXT, ts REAL);
"""
DOC_CHARS = 120_000   # 문서 하나에서 저장하는 본문 길이(인용 대조 · 다시 찾기에 쓰는 만큼)
MAX_DOCS = 6000       # 이보다 많아지면 오래된 문서부터 지운다
_LOCK = threading.Lock()
_READY: Dict[str, bool] = {}


def flat(text: Any) -> str:
    """찾기용 글 — NFKC · 소문자 · 공백 없음."""
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', str(text or ''))).lower()


class Store:
    def __init__(self, path: Path):
        self.path = Path(path)

    # -------------------------------------------------------------------------------------------- plumbing
    def _open(self) -> Optional[sqlite3.Connection]:
        try:
            key = str(self.path)
            with _LOCK:
                if not _READY.get(key) or not self.path.exists():
                    self.path.parent.mkdir(parents=True, exist_ok=True)
                    con = sqlite3.connect(key, timeout=10)
                    con.execute('PRAGMA journal_mode=WAL')
                    con.executescript(SCHEMA)
                    con.commit()
                    con.close()
                    _READY[key] = True
            con = sqlite3.connect(key, timeout=10)
            con.row_factory = sqlite3.Row
            return con
        except (sqlite3.Error, OSError):
            return None

    def _run(self, fn, default=None):
        con = self._open()
        if con is None:
            return default
        try:
            with con:
                return fn(con)
        except (sqlite3.Error, OSError, ValueError, TypeError):
            return default
        finally:
            con.close()

    # -------------------------------------------------------------------------------------------- searches
    def search_get(self, engine: str, query: str, ttl: float) -> Optional[List[dict]]:
        if ttl <= 0:
            return None

        def q(con):
            row = con.execute('SELECT ts, results FROM searches WHERE engine=? AND query=?', (engine, query)).fetchone()
            if not row or time.time() - row['ts'] > ttl:
                return None
            res = json.loads(row['results'])
            return res if isinstance(res, list) else None
        return self._run(q)

    def search_put(self, engine: str, query: str, results: Sequence[dict]) -> None:
        keep = [{k: r.get(k) for k in ('url', 'title', 'snippet', 'published', 'engine', 'host', 'tier')} for r in results if isinstance(r, dict)]
        self._run(lambda con: con.execute('INSERT OR REPLACE INTO searches(engine, query, ts, n, results) VALUES(?,?,?,?,?)',
                                          (engine, query, time.time(), len(keep), json.dumps(keep, ensure_ascii=False))))

    def engine_mark(self, engine: str, status: str, error: str = '') -> None:
        """출처 상태 — status: ok(결과 있음) · empty(0건) · fail(오류). 0건 · 오류가 이어지면 ``streak`` 이 올라간다(화면이 바뀐 출처를 알아보는 표시)."""
        col = status if status in ('ok', 'empty', 'fail') else 'fail'

        def q(con):
            con.execute('INSERT OR IGNORE INTO engines(engine) VALUES(?)', (engine,))
            streak = con.execute('SELECT streak FROM engines WHERE engine=?', (engine,)).fetchone()[0]
            con.execute(f'UPDATE engines SET {col}={col}+1, streak=?, error=?, ts=? WHERE engine=?',
                        (0 if col == 'ok' else streak + 1, error[:200] if col == 'fail' else None, time.time(), engine))
        self._run(q)

    # -------------------------------------------------------------------------------------------- docs
    def doc_get(self, url: str, ttl: float) -> Optional[dict]:
        if ttl <= 0:
            return None

        def q(con):
            row = con.execute('SELECT url, host, tier, title, published, kind, engine, text, ts FROM docs WHERE url=?', (url,)).fetchone()
            return dict(row) if row and time.time() - row['ts'] <= ttl else None
        return self._run(q)

    def doc_put(self, doc: dict) -> None:
        text = str(doc.get('text') or '')[:DOC_CHARS]
        if len(text) < 200 or not re.match(r'^https?://', str(doc.get('url') or '')):
            return

        def q(con):
            con.execute('INSERT OR REPLACE INTO docs(url, host, tier, title, published, kind, engine, text, flat, sha, ts) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                        (doc['url'], doc.get('host') or '', int(doc.get('tier') or 3), str(doc.get('title') or '')[:200], str(doc.get('published') or '')[:20],
                         str(doc.get('kind') or 'html'), str(doc.get('engine') or '')[:20], text, flat(str(doc.get('title') or '') + ' ' + text),
                         hashlib.sha256(text.encode('utf-8')).hexdigest()[:32], time.time()))
            n = con.execute('SELECT COUNT(*) FROM docs').fetchone()[0]
            if n > MAX_DOCS:
                con.execute('DELETE FROM docs WHERE url IN (SELECT url FROM docs ORDER BY ts LIMIT ?)', (n - MAX_DOCS + 200,))
        self._run(q)

    def docs_search(self, words: Sequence[str], *, limit: int = 6, max_age: float = 365 * 86400, need: int = 2) -> List[dict]:
        """쌓인 문서 본문에서 찾기 — 키워드 가운데 ``need`` 개 이상이 든 문서를, 많이 든 순 · 최근 순으로. → 검색 결과와 같은 꼴(+text)."""
        ws = [flat(w) for w in words if len(flat(w)) >= 2][:5]
        if not ws:
            return []
        need = min(need, len(ws))

        def q(con):
            score = ' + '.join('(instr(flat, ?) > 0)' for _ in ws)
            rows = con.execute(f'SELECT url, host, tier, title, published, kind, text, ts, ({score}) AS hits FROM docs WHERE ts >= ? AND ({score}) >= ? ORDER BY hits DESC, ts DESC LIMIT ?',
                               (*ws, time.time() - max_age, *ws, need, limit)).fetchall()
            return [{**dict(r), 'engine': 'db', 'snippet': ''} for r in rows]
        return self._run(q, []) or []

    # -------------------------------------------------------------------------------------------- extracted
    @staticmethod
    def topic_key(keywords: Sequence[str]) -> str:
        return '|'.join(sorted({flat(k) for k in keywords if flat(k)}))

    def extracted_mark(self, pairs: Sequence[tuple], version: int) -> None:
        """(문서 주소, 주제 키) 여러 건 — 이 규칙 판으로 사실 추출을 마쳤다."""
        now = time.time()
        rows = [(u, k, int(version), now) for u, k in set(pairs) if u and k]
        if rows:
            self._run(lambda con: con.executemany('INSERT OR REPLACE INTO extracted(url, topic, v, ts) VALUES(?,?,?,?)', rows))

    def extracted_urls(self, topic: str, version: int, max_age: float) -> set:
        if not topic or max_age <= 0:
            return set()
        return self._run(lambda con: {r[0] for r in con.execute('SELECT url FROM extracted WHERE topic=? AND v=? AND ts>=?', (topic, int(version), time.time() - max_age))}, set()) or set()

    # -------------------------------------------------------------------------------------------- evidence
    @staticmethod
    def signature(kind: str, item: dict, url: str) -> str:
        core = [kind, url, flat(item.get('metric') or item.get('subject') or item.get('keyword')), flat(item.get('value') or item.get('period') or ''), flat(item.get('quote'))[:160]]
        return hashlib.sha256('|'.join(core).encode('utf-8')).hexdigest()[:32]

    def evidence_put(self, kind: str, item: dict, source: dict, *, ind: str, version: int, terms: Sequence[str] = ()) -> None:
        """검증을 통과한 근거 한 건 — item 은 그대로(인용 · 값 · 시점 · 범위), source 는 {title, url, host, published, tier, head}."""
        url = str(source.get('url') or '')
        if not re.match(r'^https?://', url) or not item.get('quote'):
            return
        name = str(item.get('metric') or item.get('subject') or item.get('keyword') or '')
        years = [int(y) for y in re.findall(r'(?<!\d)(?:19|20)\d{2}(?!\d)', ' '.join([str(item.get('period') or '')] + [str(p.get('period') or '') for p in item.get('points') or []]))]
        data = {'item': {k: v for k, v in item.items() if k not in ('id', 'src', 'topic', 'stored')},
                'source': {k: source.get(k) for k in ('title', 'url', 'host', 'published', 'tier', 'head')}}
        text = flat(' '.join([name, str(item.get('statement') or ''), str(item.get('quote') or ''), str(source.get('title') or ''), *[str(t) for t in terms],
                              *[str(i.get('label') or '') for i in item.get('items') or []]]))
        sig = self.signature(kind, item, url)
        now = time.time()

        def q(con):
            row = con.execute('SELECT first, uses, used FROM evidence WHERE sig=?', (sig,)).fetchone()
            con.execute('INSERT OR REPLACE INTO evidence(sig, kind, ind, name, terms, year, scope, tier, url, data, v, first, seen, uses, used) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        (sig, kind, ind or '', name[:120], text, max(years) if years else None, str(item.get('scope') or ''), int(source.get('tier') or 3), url,
                         json.dumps(data, ensure_ascii=False), int(version), row['first'] if row else now, now, row['uses'] if row else 0, row['used'] if row else None))
        self._run(q)

    def evidence_find(self, words: Sequence[str], *, ind: str, version: int, max_age: float, limit: int = 40) -> List[dict]:
        """주제 키워드에 맞는 저장 근거 — **같은 업종 코드**로 조사해 쌓은 것 가운데, 키워드 둘 이상(키워드가 하나면 그 하나)이 근거의 이름 · 인용 · 문서 제목에
        들어 있는 것. → [{kind, item, source, seen, sig}] (많이 맞는 순 · 최근 확인 순)
        업종이 다른 조사의 근거는 키워드가 맞아도 쓰지 않는다 — 2026-11-16 실제 실행에서 외식업체의 '매장 내 · 포장 · 배달' 매출 구성비가 '매장' · '매출' 키워드로 유통(백화점)
        제안서에 다시 쓰였다. 지표 이름에는 누구의 값인지가 늘 들어 있지 않으므로(문서의 문맥에 있다), 그 문맥이 같은 조사에서만 다시 쓴다. 업종 코드가 없으면 다시 쓰지 않는다."""
        ws = [flat(w) for w in words if len(flat(w)) >= 2][:5]
        if not ws or not ind:
            return []
        need = min(2, len(ws))

        def q(con):
            score = ' + '.join('(instr(terms, ?) > 0)' for _ in ws)
            rows = con.execute(f'SELECT sig, kind, ind, data, seen, ({score}) AS hits FROM evidence WHERE v=? AND seen>=? AND ({score}) >= ? AND ind=? '
                               f'ORDER BY hits DESC, seen DESC LIMIT ?', (*ws, int(version), time.time() - max_age, *ws, need, ind, limit)).fetchall()
            out = []
            for r in rows:
                d = json.loads(r['data'])
                if isinstance(d, dict) and isinstance(d.get('item'), dict) and isinstance(d.get('source'), dict):
                    out.append({'kind': r['kind'], 'item': d['item'], 'source': d['source'], 'seen': r['seen'], 'sig': r['sig'], 'hits': r['hits']})
            return out
        return self._run(q, []) or []

    def evidence_used(self, sigs: Sequence[str]) -> None:
        if sigs:
            now = time.time()
            self._run(lambda con: con.executemany('UPDATE evidence SET uses=uses+1, used=? WHERE sig=?', [(now, s) for s in set(sigs)]))

    # -------------------------------------------------------------------------------------------- status
    def stats(self) -> dict:
        def q(con):
            one = lambda sql: con.execute(sql).fetchone()[0]  # noqa: E731
            return {'path': str(self.path), 'searches': one('SELECT COUNT(*) FROM searches'), 'docs': one('SELECT COUNT(*) FROM docs'), 'evidence': one('SELECT COUNT(*) FROM evidence'),
                    'reused': one('SELECT COALESCE(SUM(uses), 0) FROM evidence'),
                    'engines': [dict(r) for r in con.execute('SELECT engine, ok, empty, fail, streak, error, ts FROM engines ORDER BY engine').fetchall()]}
        return self._run(q, {'path': str(self.path), 'error': 'unavailable'}) or {}
