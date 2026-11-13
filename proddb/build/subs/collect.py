"""구독(subscription) 원천 소스 수집 — samsung.com/sec/business 「B2B 삼성 AI 구독」 페이지 · 기획전 · 뉴스룸 보도자료 · 패키지 모델 검색.

DSS DB 업데이트 skill(.agents/skills/winmate-update-dss-db)이 run 마다 다시 받는다. 지난 원문과 비교할 수 있게 모든 것을 그대로 남긴다.
  python3 proddb/build/subs/collect.py <out dir> [--sources proddb/subs/sources.json] [--facts proddb/subs/facts.json]

결과(out dir):
  pages.json      소스마다 상태 · 최종 URL · 제목 · og 이미지 · 본문(메뉴 · 푸터 제외) · 본문 해시 · 본문 이미지(alt · src)
  images/<sha8>.<ext> + images.json   본문 이미지 원본(이미지에만 있는 사실 — 패키지 · 혜택 — 을 다시 확인하는 근거, 해시로 바뀜 판정)
  models.json     facts.json 패키지 모델코드의 samsung.com 검색 API 결과(이름 · 분류 · 주소 · 이미지)
  discover.json   비즈니스 홈 메뉴 · 푸터에서 찾은 구독 관련 링크(새 소스 후보)
  inventory.json  소스별 complete | partial | failed | moved | new
네트워크가 막히면 실패로 남기고 멈춘다 — 캐시나 지난 원문으로 채우지 않는다.
"""
import hashlib, html as H, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
SEARCH = 'https://sribsrch.ecom.samsung.com/estoresearch-api/v1/scom/sec/search'
HOME = 'https://www.samsung.com/sec/business/'


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def iri(url):
    """한글 경로(뉴스룸 기사 주소 등)를 퍼센트 인코딩 — 이미 인코딩된 %XX 와 쿼리의 $ 는 그대로"""
    p = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((p.scheme, p.netloc, urllib.parse.quote(p.path, safe='/%'), urllib.parse.quote(p.query, safe='=&%$'), p.fragment))


def get(url, data=None, headers=None, tries=3):
    last = None
    url = iri(url)
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, r.geturl(), r.read()
        except urllib.error.HTTPError as e:
            return e.code, url, e.read() if hasattr(e, 'read') else b''
        except Exception as e:  # 네트워크 · 시간 초과 — 짧게 다시
            last = e; time.sleep(1.5 * (k + 1))
    raise RuntimeError(f'{url}: {last}')


sha = lambda b: hashlib.sha256(b if isinstance(b, bytes) else b.encode()).hexdigest()


def clean_text(fragment):
    s = re.sub(r'<script.*?</script>|<style.*?</style>|<!--.*?-->', ' ', fragment, flags=re.S)
    s = re.sub(r'<img[^>]*alt="([^"]*)"[^>]*>', lambda m: f'\n[IMG:{m.group(1)}]\n' if m.group(1).strip() else ' ', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'</(p|div|h\d|li|tr|dt|dd|section|figcaption|button|a)>', '\n', s)
    s = H.unescape(re.sub(r'<[^>]+>', ' ', s))
    out = []
    for line in s.split('\n'):
        line = re.sub(r'[ \t\xa0]+', ' ', line).strip()
        if line and (not out or out[-1] != line): out.append(line)
    return out


def body_of(page, kind):
    """메뉴(GNB) · 푸터 · 팝업 문구를 뺀 본문. 사이트: '최근 본 제품' 레이어 뒤 ~ '회사소개' 앞. 뉴스룸: 날짜 줄 뒤 ~ 이용 안내 앞."""
    if kind == 'site':
        a = page.find('최근 본 제품은 30일간 보관됩니다'); b = page.find('회사소개', a if a > 0 else 0)
        if a < 0 or b < 0: return page, False
        return page[a:b], True
    if kind == 'news':
        a = page.find('인쇄하기'); b = page.find('삼성전자 뉴스룸의 직접 제작한 기사와 이미지는', a if a > 0 else 0)
        if a < 0 or b < 0: return page, False
        return page[a:b], True
    return page, True


def images_of(fragment, base):
    out, seen = [], set()
    for m in re.finditer(r'<(img|source)\b[^>]*>', fragment):
        tag = m.group(0)
        alt = (re.findall(r'\balt="([^"]*)"', tag) or [''])[0]
        for src in re.findall(r'\b(?:data-src|src|srcset|data-srcset)="([^"]+)"', tag):
            src = src.split(' ')[0]
            if not src or 'img_baseimg_null' in src or src.startswith('data:') or "'+" in src or '/static/_images/' in src: continue
            url = urllib.parse.urljoin(base, src if not src.startswith('//') else 'https:' + src)
            if url in seen: continue
            seen.add(url); out.append({'alt': H.unescape(alt).strip(), 'src': url, 'tag': m.group(1)})
    return out


def main():
    out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else os.path.join(ROOT, 'proddb/raw/subs')
    sources = json.load(open(arg('--sources', os.path.join(ROOT, 'proddb/subs/sources.json'))))
    facts = json.load(open(arg('--facts', os.path.join(ROOT, 'proddb/subs/facts.json')))) if os.path.exists(arg('--facts', os.path.join(ROOT, 'proddb/subs/facts.json'))) else {}
    os.makedirs(os.path.join(out, 'images'), exist_ok=True)
    now = time.strftime('%Y-%m-%dT%H:%M:%S%z'); now = now[:-2] + ':' + now[-2:]
    pages, images, inv = [], {}, []
    known = {s['url'].rstrip('/') for s in sources['sources']}
    for s in sources['sources']:
        rec = {'id': s['id'], 'kind': s['kind'], 'url': s['url'], 'fetchedAt': now}
        try:
            st, final, raw = get(s['url'])
        except Exception as e:
            rec.update(status=0, error=str(e)); pages.append(rec); inv.append({'id': s['id'], 'url': s['url'], 'status': 'failed', 'note': str(e)}); continue
        page = raw.decode('utf-8', 'replace')
        frag, ok = body_of(page, s['kind'])
        title = H.unescape((re.findall(r'<title>(.*?)</title>', page, re.S) or [''])[0]).strip()
        og = (re.findall(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', page) or [''])[0]
        lines = clean_text(frag)
        imgs = images_of(frag, final)
        rec.update(status=st, finalUrl=final, title=title, ogImage=og, bodyOk=ok, text=lines, textHash='sha256:' + sha('\n'.join(lines)), images=imgs)
        # 본문 이미지 원본 — 이미지에만 있는 사실(패키지 · 혜택 · 비교표)의 근거. 해시가 바뀌면 사람이 다시 읽는다.
        for im in imgs if s['kind'] == 'site' else []:
            if im['src'] in images: continue
            try:
                ist, _, b = get(im['src'])
            except Exception as e:
                images[im['src']] = {'status': 0, 'error': str(e)}; continue
            if ist != 200: images[im['src']] = {'status': ist}; continue
            ext = 'png' if b[:4] == b'\x89PNG' else 'jpg'
            h = sha(b); fn = f'{h[:12]}.{ext}'
            open(os.path.join(out, 'images', fn), 'wb').write(b)
            images[im['src']] = {'status': 200, 'sha256': h, 'file': 'images/' + fn, 'bytes': len(b), 'alt': im['alt'], 'page': s['id']}
        same = lambda a, b: urllib.parse.unquote(a).rstrip('/') == urllib.parse.unquote(b).rstrip('/')
        status = 'complete' if st == 200 and ok and lines else 'partial' if st == 200 else 'failed'
        if status == 'complete' and not same(final, s['url']): status = 'moved'
        missing = [k for k, v in images.items() if v.get('page') == s['id'] and v.get('status') != 200]
        if status == 'complete' and missing: status = 'partial'
        inv.append({'id': s['id'], 'url': s['url'], 'status': status, 'http': st, 'final': final, 'textHash': rec['textHash'], 'images': len(imgs),
                    'note': ('본문 이미지 ' + str(len(missing)) + '장 받지 못함') if missing else ''})
        pages.append(rec)
    # 새 소스 후보 — 비즈니스 홈 메뉴 · 푸터의 구독 링크
    disc = []
    try:
        st, final, raw = get(HOME)
        page = raw.decode('utf-8', 'replace')
        for m in re.finditer(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', page, re.S):
            href, txt = m.group(1), re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', m.group(2)))).strip()
            if href in ('', '#') or href.startswith(('javascript', '#')): continue
            if not re.search(r'구독|subs|rental|렌탈', href + ' ' + txt, re.I) or 'newsletter' in href: continue
            url = urllib.parse.urljoin(HOME, href)
            if not url.startswith('http') or url.rstrip('/') == HOME.rstrip('/'): continue
            d = {'url': url, 'text': txt[:80], 'known': url.rstrip('/') in known}
            if d not in disc: disc.append(d)
        for d in disc:
            if not d['known']: inv.append({'id': 'new:' + d['url'], 'url': d['url'], 'status': 'new', 'note': '메뉴에 새로 보이는 구독 링크 — 소스에 넣을지 검토: ' + d['text']})
    except Exception as e:
        inv.append({'id': 'home', 'url': HOME, 'status': 'failed', 'note': str(e)})
    # 패키지 모델 — 검색 API(공식)로 이름 · 분류 · 주소 · 이미지를 다시 확인
    models = {}
    codes = sorted({it['model'] for p in facts.get('packages', []) for it in p.get('items', []) if it.get('model')})
    for code in codes:
        body = urllib.parse.urlencode({'clientCode': 'b2c', 'storeID': '1', 'countryCode': 'sec', 'startIndex': '0', 'requestCount': '15', 'clientName': 'scom',
                                       'projection': '["*"]', 'keyword': code, 'siteCd': 'sec', 'version': 'v2', 'firstSearchYN': 'true'}).encode()
        try:
            st, _, raw = get(SEARCH, data=body, headers={'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://www.samsung.com', 'Referer': 'https://www.samsung.com/sec/'})
            d = json.loads(raw.decode('utf-8', 'replace'))
            rs = ((d.get('data') or d).get('searchResults') or [])
            hit = next((r for r in rs if r.get('id') == code), None)
            models[code] = {'status': st, 'found': bool(hit), 'name': hit and hit.get('name'), 'category': hit and hit.get('category'), 'sub_category': hit and hit.get('sub_category'),
                            'sub_genre': hit and (hit.get('sub_genre') or '').strip(), 'url': hit and urllib.parse.urljoin('https://www.samsung.com', hit.get('consumerUrl') or ''),
                            'image': hit and ((hit.get('images') or {}).get('largeImage') or {}).get('url'), 'grouped': hit and hit.get('groupedProducts')}
        except Exception as e:
            models[code] = {'status': 0, 'found': False, 'error': str(e)}
        inv.append({'id': 'model:' + code, 'url': SEARCH, 'status': 'complete' if models[code].get('found') else 'failed', 'note': models[code].get('name') or models[code].get('error') or '검색 결과에 같은 모델 없음'})
    dump = lambda name, v: json.dump(v, open(os.path.join(out, name), 'w'), ensure_ascii=False, indent=1)
    dump('pages.json', pages); dump('images.json', images); dump('models.json', models); dump('discover.json', disc)
    dump('inventory.json', {'fetchedAt': now, 'sources': inv})
    from collections import Counter
    print(json.dumps({'pages': len(pages), 'images': len(images), 'models': len(models), 'inventory': dict(Counter(x['status'] for x in inv))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
