"""시장조사의 동적 검색 — 공개 출처의 **자체 검색**을 서버가 직접 부른다(검색 API · 키 없음).

일반 검색엔진(구글 · 네이버 · 다음 · 빙)의 결과 페이지는 robots.txt 가 자동 수집을 막으므로 쓰지 않는다. 대신 자동 수집을 허용하고
검색 결과를 서버에서 바로 읽을 수 있는 출처(정부 보도자료 모음 · 경제지 · 전문지)의 사이트 검색을 여러 곳 함께 부른다(연합 검색).

지키는 것
- **robots.txt**: 검색 주소 · 기사 주소 모두 받기 전에 그 사이트의 robots.txt 를 읽어 허용된 주소만 받는다(리다이렉트로 옮겨 간 주소도 다시 확인).
  robots.txt 를 읽지 못하면(서버 오류 · 시간 초과) 그 사이트는 이번에는 쓰지 않는다. 파일이 없으면(404) 제한이 없는 것으로 본다.
- **간격**: 같은 사이트에는 한 번에 하나씩, ``GAP`` 초 간격으로만 요청한다.
- **보내는 것**: 고객사 이름을 지운 공개 검색어(market_research.public_query)와 그 주소에 대한 GET 뿐이다.
- 차단 · 봇 확인 페이지가 나오면 그 출처는 결과 없음으로 넘긴다(우회하지 않는다).

출처마다 결과 목록의 생김새가 달라도 한 가지 방식으로 읽는다: 그 출처의 기사 주소 꼴(``link``)인 링크를 모으고, 제목 · 요약에 검색어가
실제로 들어 있는 것만 남긴다 — '많이 본 뉴스' · 속보 목록처럼 검색 결과가 아닌 링크가 이렇게 걸러진다. 출처의 화면이 바뀌어 결과가 0건이 되면
``market_store`` 의 출처 상태에 남아 눈에 띈다.
"""
from __future__ import annotations

import html as htmllib
import re
import ssl
import threading
import time
import urllib.error
import urllib.request
import urllib.robotparser
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Sequence, Tuple
from urllib.parse import quote, urljoin, urlsplit

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
GAP = 0.45            # 같은 사이트에 보내는 요청 사이의 최소 간격(초)
ROBOTS_TTL = 6 * 3600
ROBOTS_RETRY = 600    # robots.txt 를 읽지 못한 사이트를 다시 확인하기까지
_SSL = ssl.create_default_context()
_LOCK = threading.Lock()
_NEXT: Dict[str, float] = {}                 # host → 다음 요청을 보낼 수 있는 시각
_ROBOTS: Dict[str, Tuple[float, object]] = {}  # origin → (읽은 시각, RobotFileParser | True(제한 없음) | False(쓰지 않음))
BLOCKED = re.compile(r'captcha|unusual traffic|자동입력\s*방지|비정상적인 (접근|트래픽)|접근이 (차단|거부)|access denied|are you a robot', re.I)


class Disallowed(Exception):
    """robots.txt 가 허용하지 않는 주소 — 받지 않는다."""


# ================================================================================================ polite fetching
def _wait(host: str) -> None:
    with _LOCK:
        now = time.time()
        at = max(now, _NEXT.get(host, 0.0))
        _NEXT[host] = at + GAP
    if at > now:
        time.sleep(at - now)


def _origin(url: str) -> str:
    p = urlsplit(url)
    return f'{p.scheme}://{p.netloc}'


def _raw_get(url: str, timeout: int, limit: int, redirect: Optional[Callable[[str], None]] = None):
    """(final url, content-type, body) — 간격을 지키고, 리다이렉트마다 ``redirect(new_url)`` 을 부른다(막으려면 예외)."""
    class Redirects(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            if not re.match(r'^https?://', newurl or ''):
                raise urllib.error.HTTPError(newurl, code, 'redirect to a non-http address', headers, fp)
            if redirect:
                redirect(newurl)
            _wait(urlsplit(newurl).netloc)
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    opener = urllib.request.build_opener(Redirects, urllib.request.HTTPSHandler(context=_SSL))
    _wait(urlsplit(url).netloc)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5', 'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5'})
    with opener.open(req, timeout=timeout) as r:
        return r.geturl(), (r.headers.get('content-type') or '').lower(), r.read(limit)


def robots_allows(url: str) -> bool:
    """이 주소를 자동으로 받아도 되는가(robots.txt 의 ``*`` 규칙). 판단할 수 없으면 False."""
    return robots_state(url) == 'allow'


def robots_state(url: str) -> str:
    """'allow' | 'deny'(robots.txt 가 금지) | 'unknown'(robots.txt 를 읽지 못함 — 이번에는 쓰지 않는다)."""
    if not re.match(r'^https?://', url or ''):
        return 'deny'
    origin = _origin(url)
    with _LOCK:
        hit = _ROBOTS.get(origin)
    if hit is None or time.time() - hit[0] > (ROBOTS_TTL if hit[1] is not False else ROBOTS_RETRY):
        rule: object
        try:
            final, ctype, body = _raw_get(origin + '/robots.txt', 10, 500_000)
            text = body.decode('utf-8', 'ignore')
            if _origin(final) != origin or 'html' in ctype or re.match(r'\s*<(!doctype|html)', text[:200], re.I):
                rule = True  # robots.txt 가 없어 첫 화면 등으로 넘어간 사이트 — 제한 없음
            else:
                rp = urllib.robotparser.RobotFileParser()
                rp.parse(text.splitlines())
                rule = rp
        except urllib.error.HTTPError as exc:
            rule = True if 400 <= exc.code < 500 else False
        except Exception:  # noqa: BLE001 — 읽지 못한 사이트는 쓰지 않는다
            rule = False
        hit = (time.time(), rule)
        with _LOCK:
            _ROBOTS[origin] = hit
    rule = hit[1]
    if rule is True:
        return 'allow'
    if rule is False:
        return 'unknown'
    try:
        return 'allow' if rule.can_fetch('*', url) else 'deny'  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        return 'unknown'


def http_get(url: str, *, timeout: int = 20, limit: int = 10_000_000, check_first: bool = True) -> Tuple[str, str, bytes]:
    """robots.txt 를 지켜 받는다 → (실제 주소, content-type, 본문). 허용되지 않으면 ``Disallowed``.
    ``check_first=False`` 는 검색 모델이 준 출처 링크(리다이렉트 주소)처럼 첫 주소가 안내용일 때 — 옮겨 간 실제 주소는 그대로 확인한다."""
    def check(u: str) -> None:
        state = robots_state(u)
        if state != 'allow':  # 주소 전체가 아니라 사이트만 적는다(검색어가 붙은 주소를 오류 기록에 남기지 않는다)
            raise Disallowed(('robots.txt 가 금지한 주소 — ' if state == 'deny' else 'robots.txt 를 읽지 못함 — ') + (urlsplit(u).hostname or ''))
    if check_first:
        check(url)

    def hop(new: str) -> None:
        check(new)
    return _raw_get(url, timeout, limit, hop)


def decode(body: bytes, ctype: str) -> str:
    cs = re.search(r'charset=([\w-]+)', ctype or '') or re.search(rb'charset=["\']?([\w-]+)', body[:4000], re.I)
    enc = cs.group(1) if cs else 'utf-8'
    enc = enc.decode('ascii', 'ignore') if isinstance(enc, bytes) else enc
    try:
        return body.decode(enc, 'ignore')
    except LookupError:
        return body.decode('utf-8', 'ignore')


# ================================================================================================ engines
@dataclass(frozen=True)
class Engine:
    key: str
    name: str
    search: str   # 검색 주소 — {q} 자리에 검색어, {from} · {to} 자리에 검색 기간(YYYY-MM-DD, 최근 3년)
    link: str     # 이 출처의 기사 주소 꼴(절대 주소에 대한 정규식)
    tier: int     # 1 정부 · 통계 · 2 언론
    keep: str = ''  # 주소에서 남길 쿼리 이름(정규식) — 나머지 쿼리는 지운다(검색어가 붙은 주소를 저장하지 않게)
    inds: Tuple[str, ...] = ()  # 이 업종 코드의 조사에서만 쓰는 전문지(비어 있으면 모든 조사에)


ENGINES: Dict[str, Engine] = {e.key: e for e in (
    # 정책브리핑 — 전 부처의 보도자료 · 정책뉴스(통계 발표 · 실태조사 결과가 가장 먼저 실리는 곳)
    Engine('korea', '정책브리핑', 'https://www.korea.kr/totalSearch.do?pWise=main&pWiseMain=S2&query={q}&topSearchKeyword={q}&sort=rank&sdate={from}&edate={to}',
           r'^https://www\.korea\.kr/(?:news|briefing|multi)/\w+View\.do\?newsId=\d+$', 1, r'newsId'),
    # KDI 경제정책정보 — 부처 · 공공기관 · 연구원의 정책 자료 모음
    Engine('kdi', 'KDI 경제정책정보', 'https://eiec.kdi.re.kr/policy/materialList.do?topic=&pp=20&datecount=&recommend=&pg=1&search_txt={q}',
           r'^https://eiec\.kdi\.re\.kr/policy/materialView\.do\?num=\d+$', 1, r'num'),
    Engine('mk', '매일경제', 'https://www.mk.co.kr/search?word={q}', r'^https://www\.mk\.co\.kr/news/[a-z-]+/\d+$', 2),
    Engine('edaily', '이데일리', 'https://www.edaily.co.kr/search/index?keyword={q}', r'^https://www\.edaily\.co\.kr/News/Read\?newsId=\d+&mediaCodeNo=\d+$', 2, r'newsId|mediaCodeNo'),
    Engine('herald', '헤럴드경제', 'https://biz.heraldcorp.com/search?q={q}', r'^https://biz\.heraldcorp\.com/article/\d+$', 2),
    Engine('hani', '한겨레', 'https://search.hani.co.kr/search?searchword={q}', r'^https://www\.hani\.co\.kr/arti/[a-z_/]+/\d+\.html$', 2),
    Engine('zdnet', '지디넷코리아', 'https://search.zdnet.co.kr/?kwd={q}', r'^https://zdnet\.co\.kr/view/\?no=\d+$', 2, r'no'),
    # 출처를 더할 때: robots.txt 가 검색 주소 · 기사 주소를 허용하는지, 결과가 서버에서 바로 오는지(스크립트로 그리지 않는지), 검색어를 바꾸면 결과가 바뀌는지를 먼저 확인한다.
    # 업종 전문지는 ``inds`` 에 업종 코드를 적어 그 업종의 조사에서만 쓴다.
)}
# kdi 는 응답이 느려(5초 안팎) 기본에서 뺀다 — WINMATE_RESEARCH_ENGINES 로 켠다
DEFAULT_ENGINES = ('korea', 'mk', 'edaily', 'herald', 'hani', 'zdnet')


def engines_for_industry(keys: Sequence[str], ind: str) -> List[str]:
    """켜 둔 출처 가운데 이 업종의 조사에 쓸 것 — 전문지는 그 업종일 때만."""
    return [k for k in keys if k in ENGINES and (not ENGINES[k].inds or ind in ENGINES[k].inds)]

A_TAG = re.compile(r'(?is)<a\b([^>]*)>(.*?)</a>')
HEAD_TAG = re.compile(r'(?is)<(h[1-6]|strong|dt|b)\b[^>]*>(.*?)</\1>')
TITLE_CLASS = re.compile(r'''(?is)<(\w+)\b[^>]*\bclass\s*=\s*["'][^"']*(?:tit|ttl|subject|headline)[^"']*["'][^>]*>(.*?)</\1>''')
NOISE = re.compile(r'''(?is)<!--.*?-->|<(script|style)\b[^>]*>.*?</\1>|<(\w+)\b[^>]*\bclass\s*=\s*["'][^"']*(?:blind|sr-only|screen-reader|visually-hidden)[^"']*["'][^>]*>.*?</\2>''')
DATE = re.compile(r'(?<!\d)(20\d{2})\s?[.\-/년]\s?(\d{1,2})\s?[.\-/월]\s?(\d{1,2})(?!\d)')


def _text(fragment: str) -> str:
    t = NOISE.sub(' ', fragment)
    return re.sub(r'\s+', ' ', htmllib.unescape(re.sub(r'(?s)<[^>]+>', ' ', t))).strip()


def _flat(t: str) -> str:
    return re.sub(r'\s+', '', t or '').lower()


DATE_CLASS = re.compile(r'''(?is)<(\w+)\b[^>]*\bclass\s*=\s*["'][^"']*(?:date|time|byline)[^"']*["'][^>]*>(.*?)</\1>''')


def _date(text: str, *, last: bool = False) -> str:
    """글에서 날짜 하나(YYYY-MM-DD) — 오늘보다 뒤의 날짜(본문에 적힌 시행일 · 목표 연도)는 발행일이 아니므로 건너뛴다."""
    today = time.strftime('%Y-%m-%d')
    found = []
    for m_ in DATE.finditer(text or ''):
        y, mo, d = int(m_.group(1)), int(m_.group(2)), int(m_.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31 and f'{y:04d}-{mo:02d}-{d:02d}' <= today:
            found.append(f'{y:04d}-{mo:02d}-{d:02d}')
            if not last:
                break
    return found[-1] if found else ''


def _clean_url(eng: Engine, href: str, base: str) -> str:
    """기사 주소로 고친다(절대 주소 · 필요한 쿼리만) — 이 출처의 기사 주소 꼴이 아니면 ''."""
    url = urljoin(base, htmllib.unescape(href or '').strip())
    p = urlsplit(url)
    if p.scheme not in ('http', 'https'):
        return ''
    if eng.keep and p.query:
        pairs = [kv for kv in p.query.split('&') if re.fullmatch(eng.keep, kv.split('=')[0])]
        url = f'{p.scheme}://{p.netloc}{p.path}' + ('?' + '&'.join(pairs) if pairs else '')
    elif not eng.keep:
        url = f'{p.scheme}://{p.netloc}{p.path}'
    return url if re.match(eng.link, url) else ''


def query_words(query: str) -> List[str]:
    return [w for w in re.split(r'[\s·/(),]+', query or '') if len(w) >= 2]


def parse_results(eng: Engine, body: str, query: str, *, limit: int = 12) -> List[dict]:
    """검색 결과 화면 → [{url, title, snippet, published}]. 제목 · 요약에 검색어가 하나도 없는 링크(검색 결과가 아닌 목록)는 뺀다."""
    base = eng.search.split('?')[0]
    words = [_flat(w) for w in query_words(query)]
    words += [w[:-1] for w in words if len(w) >= 4]  # 끝 글자가 달라지는 꼴('외식업체' ↔ '외식업')
    found: Dict[str, dict] = {}
    order: List[str] = []
    link_starts = []
    for m_ in A_TAG.finditer(body):
        href = re.search(r'''(?is)\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')''', m_.group(1))
        url = _clean_url(eng, (href.group(1) or href.group(2)) if href else '', base) if href else ''
        if url:
            link_starts.append((m_.start(), m_.end(), url, m_.group(1), m_.group(2)))
    for i, (a, b, url, attrs, inner) in enumerate(link_starts):
        rec = found.get(url)
        if rec is None:
            rec = found[url] = {'url': url, 'title': '', 'snippet': '', 'published': ''}
            order.append(url)
        inner = NOISE.sub(' ', inner)
        head = TITLE_CLASS.search(inner) or HEAD_TAG.search(inner)
        whole = _text(inner)
        title_attr = re.search(r'''(?is)\btitle\s*=\s*"([^"]{8,200})"''', attrs)
        if head and 6 <= len(_text(head.group(2))) <= 200:
            title = _text(head.group(2))
            rest = whole.replace(title, ' ', 1).strip()
        elif 6 <= len(whole) <= 110 and not whole.startswith(('...', '…')):
            title, rest = whole, ''
        else:
            title, rest = (_text(title_attr.group(1)) if title_attr else ''), whole
        if title and not rec['title']:
            rec['title'] = title[:200]
        if len(rest) > len(rec['snippet']):
            rec['snippet'] = rest[:1200]
        # 날짜: 링크 안의 날짜 칸 → 링크 바로 뒤(다음 기사 링크 앞까지)의 글 → 링크 안 글의 마지막 날짜(요약 문장 속 날짜보다 끝의 날짜 칸이 발행일이다)
        nxt = link_starts[i + 1][0] if i + 1 < len(link_starts) else len(body)
        marked = DATE_CLASS.search(inner)
        when = (_date(_text(marked.group(2))) if marked else '') or _date(_text(body[b:min(nxt, b + 2500)])) or _date(whole, last=True)
        if when and (not rec['published'] or marked):
            rec['published'] = when
    out = []
    for url in order:
        rec = found[url]
        if len(rec['title']) < 6:
            continue
        hay = _flat(rec['title'] + ' ' + rec['snippet'])
        if words and not any(w in hay for w in words):
            continue
        if not rec['published']:  # 주소에 날짜가 든 출처(지디넷 no=YYYYMMDD…)
            m_ = re.search(r'[=/](20\d{2})(\d{2})(\d{2})\d{4,}', url)
            rec['published'] = f'{m_.group(1)}-{m_.group(2)}-{m_.group(3)}' if m_ and 1 <= int(m_.group(2)) <= 12 else ''
        rec['snippet'] = rec['snippet'][:400]
        out.append(rec)
        if len(out) >= limit:
            break
    return out


def search(engine: str, query: str, *, timeout: int = 12) -> List[dict]:
    """한 출처의 자체 검색 → [{url, title, snippet, published, engine, host, tier}]. 오류는 예외로(부르는 쪽이 출처 상태에 남긴다)."""
    eng = ENGINES[engine]
    q = re.sub(r'\s+', ' ', query or '').strip()[:60]
    if len(q) < 2:
        return []
    now = time.localtime()
    url = eng.search.replace('{q}', quote(q)).replace('{from}', f'{now.tm_year - 3}-01-01').replace('{to}', time.strftime('%Y-%m-%d', now))
    final, ctype, body = http_get(url, timeout=timeout, limit=4_000_000)
    text = decode(body, ctype)
    out = parse_results(eng, text, q)
    if not out and BLOCKED.search(text[:20000]):
        raise RuntimeError('blocked')  # 봇 확인 · 차단 화면 — 우회하지 않고 이 출처를 건너뛴다
    host = (urlsplit(eng.search).hostname or '').removeprefix('www.')
    return [{**r, 'engine': engine, 'host': (urlsplit(r['url']).hostname or host).removeprefix('www.'), 'tier': eng.tier} for r in out]


def search_many(jobs: Sequence[Tuple[str, str]], *, cancel: Optional[Callable[[], None]] = None, cached: Optional[Callable[[str, str], Optional[List[dict]]]] = None,
                done: Optional[Callable[[str, str, Optional[List[dict]], str], None]] = None, budget: float = 30.0) -> Dict[Tuple[str, str], List[dict]]:
    """(출처, 검색어) 여러 건 — 출처마다 한 줄로(간격을 지키며), 출처끼리는 함께. 실패한 건은 빈 결과.
    ``cached(engine, query)`` 가 결과를 주면 사이트를 부르지 않는다. ``done(engine, query, results|None, error)`` 로 결과를 알린다.
    한 출처에 쓰는 시간은 ``budget`` 초까지 — 느린 출처가 조사 전체를 붙잡지 않게, 넘으면 그 출처의 남은 검색어는 건너뛴다(앞에 넣은 검색어부터 한다)."""
    from concurrent.futures import ThreadPoolExecutor
    by_engine: Dict[str, List[str]] = {}
    for engine, query in jobs:
        if engine in ENGINES and query not in by_engine.setdefault(engine, []):
            by_engine[engine].append(query)
    out: Dict[Tuple[str, str], List[dict]] = {}

    def lane(engine: str) -> None:
        fails, t0 = 0, time.time()
        for query in by_engine[engine]:
            if cancel:
                cancel()
            hit = cached(engine, query) if cached else None
            if hit is not None:
                out[(engine, query)] = hit
                continue
            if fails >= 2 or time.time() - t0 > budget:  # 연달아 실패했거나 시간을 다 썼다 — 남은 검색어로 더 두드리지 않는다
                out[(engine, query)] = []
                continue
            try:
                res = search(engine, query)
                out[(engine, query)] = res
                fails = 0
                if done:
                    done(engine, query, res, '')
            except Exception as exc:  # noqa: BLE001
                if type(exc).__name__ in ('JobCancelled', 'Cancelled') or getattr(exc, 'code', '') == 'cancelled':
                    raise
                fails += 1
                out[(engine, query)] = []
                if done:
                    done(engine, query, None, f'{type(exc).__name__}: {str(exc)[:120]}')
    if by_engine:
        with ThreadPoolExecutor(max_workers=len(by_engine)) as ex:
            for f in [ex.submit(lane, e) for e in by_engine]:
                f.result()
    return out
