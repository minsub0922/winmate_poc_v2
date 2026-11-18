"""데이터 소스 최신성 점검 — 실제 DB 기록을 그 자료를 받아 온 실제 원본과 대조한다.

판정은 대조 결과로만 한다. 홈 화면 메뉴나 허브 페이지의 글을 AI 가 읽고 추정하지 않는다.
  같음 → fresh(최신 확인) · 다른 항목 있음 → refresh(갱신 권장) · 확인하지 못한 원본 있음 → uncertain(확인 필요)

소스마다 실제 출처와 대조 기준이 다르다.
  samsung   samsung.com/sec/business 제품        원천 소스 점검 채널 site      ↔ proddb/raw
  catalogs  e-카탈로그 목록 · 권                 채널 ecat                    ↔ proddb/ecat
  media     솔루션 · 분류 · 근거 페이지          채널 solutions               ↔ 솔루션 레지스트리 · 버티컬 근거 · 제품군 분류의 주소
            도입사례 목록                        사례 목록(번호 · 제목 · 주소) ↔ app/data/catalog.json 의 사례
  url 소스  등록한 주소                          본문 글                      ↔ 관리 DB 에 반영한 원문
채널 점검은 「소스 점검 · 업데이트」의 일일 점검(proddb/build/dss/watch.py)과 같은 실행 · 같은 기록이다 — 두 화면이 다른 답을 내지 않는다.

리소스 링크: 원본 주소는 바뀔 수 있다(e-카탈로그는 호가 바뀌면 권 주소가 바뀐다). 관리자가 넣은 링크는 점검에 합류한다.
  e-카탈로그 소스의 권 링크(Dir=…) · 목록 링크 → 채널 ecat 이 목록과 함께 대조한다(DB 에 없는 권이면 갱신 권장).
  그 밖의 링크 → 처음 점검한 본문을 기준으로 잡고, 이후 달라지면 알린다. 관리자가 확인하면 기준을 새로 잡는다.
"""
from __future__ import annotations
from datetime import datetime, timezone
import difflib
import hashlib
import html
import json
from pathlib import Path
import re
import time
import uuid
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from . import engine
from .config import ROOT, SOURCE_SEEDS
from .engine import Cancelled, EngineError, checked_url, html_text
from .inventory import read
from .store import dump, now
from .source_reviews import CHANNELS as CHANNEL, SourceReviews

SEED_URL = {seed[0]: seed[3] for seed in SOURCE_SEEDS}
PARALLEL = set(CHANNEL)
SITE = 'https://www.samsung.com/sec/business/'
CASE_HOME = 'https://www.samsung.com/sec/business/insights/case-study/'
CASE_LIST = 'https://www.samsung.com/sec/business/xhr/insights/getInsightsListView/'
BROWSER = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9'}
SHOWN, MAX_LINKS, TEXT_KEPT = 60, 40, 60_000
DEFINITIONS = {
    'samsung': [{'id': 'channel:site', 'label': 'samsung.com/sec/business 제품', 'url': 'https://www.samsung.com/sec/business/',
                 'compare': 'proddb/raw 의 제품 원문(목록 · 옵션 · 사양 · 특장점)', 'method': '실제 수집기로 분류 목록 전체 · 옵션 상품 · 사양 · 상품 페이지 특장점을 다시 받아 대조', 'minutes': 10}],
    'catalogs': [{'id': 'channel:ecat', 'label': 'e-카탈로그 목록 · 권', 'url': SEED_URL['catalogs'],
                  'compare': 'proddb/ecat 의 권 목록과 쪽 원문', 'method': '목록의 권 · 권마다 쪽 수 · 뷰어 제목 · 쪽 이미지 파일의 수정 시각을 대조', 'minutes': 1}],
    'media': [{'id': 'channel:solutions', 'label': '솔루션 · 분류 · 근거 페이지', 'url': 'https://www.samsung.com/sec/business/',
               'compare': '솔루션 레지스트리 · 버티컬 솔루션 근거 · 제품군 분류에 적힌 주소', 'method': '주소마다 상태 · 최종 주소 · 제목 · 본문 해시를 대조', 'minutes': 7},
              {'id': 'cases', 'label': '도입사례 목록', 'url': CASE_HOME,
               'compare': 'app/data/catalog.json 의 도입사례', 'method': '사례 목록 전체의 번호 · 제목 · 주소를 대조', 'minutes': 1}],
}
PAGE = {'id': 'page', 'label': '등록한 원본 주소', 'compare': '관리 DB 에 반영한 원문', 'method': '메뉴 · 푸터를 뺀 본문 글을 대조', 'minutes': 1}
LINKS = {'id': 'links', 'label': '추가한 리소스 링크', 'compare': '처음 점검한 본문(관리자가 확인하면 새로 잡는다)', 'method': '주소마다 최종 주소 · 제목 · 본문 글을 대조', 'minutes': 1}


def fetch(url, **options):
    """공개 HTTPS 만 받는 관리자 수집기. 시험에서는 이 함수만 바꾼다."""
    return engine.fetch(url, **options)


def clean(text):
    return re.sub(r'\s+', ' ', text or '').strip()


def same_url(a, b):
    return (a or '').rstrip('/') == (b or '').rstrip('/')


def latest(times):
    """가장 늦은 시각 — 기록마다 시간대 표기가 달라(점검 도구는 KST, 관리자는 UTC) 글자가 아니라 시각으로 비교한다."""
    def moment(value):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return None
    known = [(moment(value), value) for value in times if value and moment(value)]
    return max(known)[1] if known else None


def ecat_link(url):
    """e-카탈로그 링크의 종류 — 권(Dir=번호) 또는 목록 페이지."""
    parts = urlsplit(url)
    number = (parse_qs(parts.query).get('Dir') or parse_qs(parts.query).get('dir') or [''])[0]
    at = url.lower().find('ecatalog')
    if number.isdigit() and at > 0:
        return {'kind': 'volume', 'dir': number, 'base': re.sub(r'access/$', '', url[:at])}
    return {'kind': 'listing'}


# ───────────────────────── 페이지 본문 ─────────────────────────

def main_of(page):
    """본문 영역 — samsung.com/sec 는 '최근 본 제품' 레이어 뒤 ~ 푸터 '회사소개' 앞, 그 밖은 header · nav · footer 를 뺀 나머지.
    메뉴 · 푸터의 홍보 문구는 받을 때마다 달라질 수 있어 본문만 본다(proddb/build/dss/pagetext.py 와 같은 규칙)."""
    start = page.find('최근 본 제품은 30일간 보관됩니다')
    end = page.find('회사소개', start) if start >= 0 else -1
    if start >= 0 and end > start:
        return page[start:end]
    return re.sub(r'<(header|footer|nav)\b.*?</\1>', ' ', page, flags=re.S | re.I)


def page_state(response):
    """받은 원본 한 개 → 최종 주소 · 제목 · 본문 줄 · 본문 해시."""
    body, kind = response['body'], response.get('type') or ''
    if 'html' in kind or b'<html' in body[:4000].lower() or b'<!doctype html' in body[:200].lower():
        raw = body.decode('utf-8', 'replace')
        found = re.search(r'<title[^>]*>(.*?)</title>', raw, re.S | re.I)
        title, text = clean(html.unescape(found.group(1))) if found else '', html_text(main_of(raw))
    else:
        name = Path(urlsplit(response.get('url') or '').path).name or 'file'
        blocks, image = engine.extract(body, name, kind)
        title, text = name, hashlib.sha256(body).hexdigest() if image else '\n'.join(block['text'] for block in blocks)
    lines = [line for line in (clean(line) for line in text.splitlines()) if line]
    return {'final': response.get('url'), 'title': title, 'hash': hashlib.sha256('\n'.join(lines).encode()).hexdigest(), 'text': '\n'.join(lines)[:TEXT_KEPT]}


def text_diff(before, after, limit=6):
    """바뀐 줄 몇 개 — 화면에 근거로 보여 준다."""
    removed, added = [], []
    for line in difflib.unified_diff((before or '').splitlines(), (after or '').splitlines(), lineterm='', n=0):
        if line.startswith(('---', '+++', '@@')):
            continue
        (removed if line.startswith('-') else added).append(line[1:].strip()[:200])
    return {'removed': removed[:limit], 'added': added[:limit], 'removed_total': len(removed), 'added_total': len(added)}


def compare_page(base, current, again=None):
    """기준(base) ↔ 지금(current). again() 은 한 번 더 받은 상태 — 받을 때마다 본문이 달라지는 페이지는 글로 판정하지 않는다."""
    why, detail = [], {}
    if base.get('final') and current.get('final') and not same_url(base['final'], current['final']):
        why.append(f"주소 이동 → {current['final']}")
    if base.get('title') and current.get('title') and base['title'] != current['title']:
        why.append(f"제목 {base['title']} → {current['title']}")
    if base.get('hash') != current.get('hash') and not base.get('volatile'):
        second = again() if again else None
        if second is not None and second.get('hash') != current.get('hash'):
            detail['volatile'] = True
        else:
            why.append('본문이 바뀜')
            detail['diff'] = text_diff(base.get('text'), current.get('text'))
    return why, detail


# ───────────────────────── 도입사례 목록 ─────────────────────────

def case_rows(markup):
    """사례 목록 응답 → (사례 [번호 · 제목 · 주소 · 등록일], 전체 건수). 응답 안의 JS 템플릿(<li data-lett-no="' + …">)은 번호가 숫자가 아니어서 빠진다."""
    rows = []
    for found in re.finditer(r'<li data-lett-no="(\d+)"[^>]*>(.*?)</li>', markup, re.S):
        inner = found.group(2)
        link = re.search(r'<a\s+href="(/[^"]+)"', inner)
        title = re.search(r'<h3>(.*?)</h3>', inner, re.S)
        day = re.search(r'<span>\s*(\d{4}-\d{2}-\d{2})\s*</span>', inner)
        rows.append({'id': found.group(1), 'title': clean(html_text(title.group(1))) if title else '',
                     'url': urljoin(CASE_HOME, link.group(1)) if link else '', 'date': day.group(1) if day else ''})
    total = re.search(r'id="totalCount"\s+value="(\d+)"', markup)
    return rows, int(total.group(1)) if total else None


def check_cases(root, cancel, step=lambda text: None):
    """삼성 비즈니스 도입사례 목록 전체 ↔ app/data/catalog.json 의 사례."""
    started, live, total, errors = time.monotonic(), {}, None, []
    try:
        for page in range(1, 120):
            body = urlencode({'bbsId': 'insights', 'bbsGbNo': '1', 'bbsGbEnNm': 'case-study', 'filterStr': '', 'openYn': 'Y', 'page': page}).encode()
            response = fetch(CASE_LIST, data=body, cancel=cancel, headers={**BROWSER, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                                                         'X-Requested-With': 'XMLHttpRequest', 'Referer': CASE_HOME})
            rows, count = case_rows(response['body'].decode('utf-8', 'replace'))
            total = count if count is not None else total
            fresh = [row for row in rows if row['id'] not in live]
            live.update({row['id']: row for row in fresh})
            step(f'도입사례 목록 {len(live)}' + (f'/{total}' if total else ''))
            if not fresh or (total is not None and len(live) >= total):
                break
    except EngineError as exc:
        errors.append({'title': '도입사례 목록', 'url': CASE_HOME, 'error': str(exc)[:200]})
    base = {'checked_at': now(), 'seconds': round(time.monotonic() - started),
            'coverage': '삼성 비즈니스 도입사례 목록 전체의 번호 · 제목 · 주소 · 등록일. 사례 본문 글과 사진이 바뀌었는지는 보지 않는다.'}
    if not live:
        return {**base, 'status': 'failed', 'summary': '도입사례 목록을 읽지 못했습니다.', 'changes': [], 'counts': {},
                'errors': errors or [{'title': '도입사례 목록', 'url': CASE_HOME, 'error': '목록에서 사례를 읽지 못함(마크업 변경 가능)'}]}
    complete = not errors and (total is None or len(live) == total)
    if not complete and not errors:
        errors.append({'title': '도입사례 목록', 'url': CASE_HOME, 'error': f'전체 {total}건 중 {len(live)}건만 읽음'})
    known = {str(case['id']): case for case in read(root / 'app/data/catalog.json').get('cases', []) if case.get('id') is not None and case.get('sourceListed') is not False}
    changes, same = [], 0
    for cid, row in live.items():
        old = known.get(cid)
        item = {'id': cid, 'title': row['title'], 'url': row['url'] or CASE_HOME, 'date': row['date']}
        if not old:
            changes.append({**item, 'status': 'new', 'why': ['목록에 새로 올라온 사례' + (f" (등록 {row['date']})" if row['date'] else '')]})
            continue
        why = []
        if clean(old.get('title')) != row['title']:
            why.append(f"제목 {clean(old.get('title'))} → {row['title']}")
        if old.get('url') and row['url'] and not same_url(old['url'], row['url']):
            why.append(f"주소 이동 → {row['url']}")
        if old.get('date') and row['date'] and old['date'] != row['date']:
            why.append(f"등록일 {old['date']} → {row['date']}")
        if why:
            changes.append({**item, 'status': 'changed', 'why': why})
        else:
            same += 1
    if complete:  # 목록을 끝까지 읽었을 때만 '빠짐'을 말한다
        for cid, old in known.items():
            if cid not in live:
                changes.append({'id': cid, 'title': clean(old.get('title')), 'url': old.get('url') or CASE_HOME, 'status': 'gone', 'why': ['목록에서 빠짐']})
    by = {key: sum(change['status'] == key for change in changes) for key in ('new', 'changed', 'gone')}
    newest = max((row['date'] for row in live.values() if row['date']), default='')
    summary = (f'사례 {len(known)}건 중 {same}건 같음' + ''.join(f' · {label} {by[key]}' for key, label in (('new', '새 사례'), ('changed', '바뀜'), ('gone', '빠짐')) if by[key])
               + (f' · 확인 못 함 {len(errors)}' if errors else '') + (f' · 원본의 가장 최근 등록 {newest}' if newest else ''))
    return {**base, 'status': 'partial' if errors else 'changed' if changes else 'same', 'summary': summary, 'changes': changes, 'errors': errors,
            'counts': {'listed': len(live), 'db': len(known), 'same': same, **{key: value for key, value in by.items() if value}}}


# ───────────────────────── 판정 ─────────────────────────

def shown_change(change):
    value = {'status': change.get('status') or 'changed', 'why': [str(reason)[:300] for reason in change.get('why') or []][:6],
             'title': str(change.get('title') or change.get('name') or change.get('cat') or change.get('id') or change.get('url') or '')[:200],
             'url': change.get('url'), 'id': change.get('dir') or change.get('gid') or change.get('id')}
    if change.get('diff'):
        value['diff'] = change['diff']
    return value


def shown_error(error):
    text = error.get('error') or error.get('note') or (f"HTTP {error['http']}" if error.get('http') else '') or error.get('tail') or '확인하지 못함'
    return {'title': str(error.get('title') or error.get('name') or error.get('id') or error.get('gid') or error.get('p') or error.get('url') or '')[:200],
            'url': error.get('url'), 'error': str(text)[:300]}


def part(definition, result):
    """원본 한 곳의 대조 결과를 화면 · 판정용 모양으로."""
    if not result:
        return {**definition, 'status': 'unchecked', 'summary': '아직 점검하지 않았습니다.', 'changes': [], 'errors': [], 'total_changes': 0, 'total_errors': 0}
    changes, errors = result.get('changes') or [], result.get('errors') or []
    return {**definition, 'status': result.get('status') or 'failed', 'summary': result.get('summary') or '', 'coverage': result.get('coverage'),
            'counts': {key: value for key, value in (result.get('counts') or {}).items() if isinstance(value, (int, float)) and not isinstance(value, bool)},
            'changes': [shown_change(change) for change in changes[:SHOWN]], 'total_changes': len(changes),
            'errors': [shown_error(error) for error in errors[:20]], 'total_errors': len(errors),
            'notes': [{'title': str(note.get('title') or note.get('url') or '')[:200], 'url': note.get('url'), 'note': str(note.get('note') or '')[:300]} for note in (result.get('notes') or [])[:10]],
            'checked_at': result.get('checked_at') or result.get('check_at'), 'seconds': result.get('seconds'), 'check_id': result.get('check_id')}


def verdict(parts):
    changed = sum(item['total_changes'] for item in parts)
    unknown = [item for item in parts if item['status'] in ('failed', 'partial', 'unchecked')]
    status = 'refresh' if changed else 'uncertain' if unknown else 'fresh'
    if status == 'fresh':
        summary = f'원본 {len(parts)}곳이 DB 와 같습니다.' if len(parts) > 1 else '원본이 DB 와 같습니다.'
    elif status == 'refresh':
        summary = f'원본과 다른 항목이 {changed}개 있습니다 — 갱신이 필요합니다.' + (f' 끝까지 확인하지 못한 원본도 {len(unknown)}곳 있습니다.' if unknown else '')
    else:
        summary = f'원본 {len(parts)}곳 중 {len(unknown)}곳을 끝까지 확인하지 못해 최신 여부를 확정하지 못했습니다.'
    return {'basis': 'origin', 'status': status, 'summary': summary, 'reason': ' / '.join(f"{item['label']}: {item['summary']}" for item in parts),
            'counts': {'origins': len(parts), 'changes': changed, 'unverified': len(unknown), 'errors': sum(item['total_errors'] for item in parts)},
            'checked_at': latest(item.get('checked_at') for item in parts), 'origins': parts}


class Origins:
    def __init__(self, service, root=ROOT):
        self.service, self.store, self.root = service, service.store, Path(root)
        self.reviews = SourceReviews(self.store, self.root)
        with self.store.db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS source_links(
                id TEXT PRIMARY KEY, source_id TEXT NOT NULL, url TEXT NOT NULL, label TEXT DEFAULT '', created_at TEXT, actor TEXT,
                baseline TEXT DEFAULT '{}', result TEXT DEFAULT '{}', checked_at TEXT)''')

    # ── 리소스 링크 ──
    def links(self, sid):
        rows = self.store.rows('SELECT * FROM source_links WHERE source_id=? ORDER BY created_at', (sid,))
        for row in rows:
            row['baseline'], row['result'] = json.loads(row['baseline'] or '{}'), json.loads(row['result'] or '{}')
            row['kind'] = ecat_link(row['url'])['kind'] if sid == 'catalogs' else 'page'
        return rows

    def external(self, sid):
        source = self.store.source(sid)
        if not source:
            raise HTTPException(404, '소스를 찾지 못했습니다.')
        if source['kind'] in ('local', 'custom'):
            raise EngineError('외부 원본이 없는 내부 라이브러리입니다. 「에셋 다시 스캔」으로 색인을 맞춰 주세요.')
        return source

    def add_link(self, sid, url, label='', actor='admin'):
        self.external(sid)
        url, _, _ = checked_url(url)
        existing = self.links(sid)
        if any(same_url(link['url'], url) for link in existing):
            raise EngineError('이미 넣은 링크입니다.')
        if len(existing) >= MAX_LINKS:
            raise EngineError(f'링크는 소스마다 {MAX_LINKS}개까지 넣을 수 있습니다.')
        lid = uuid.uuid4().hex[:12]
        with self.store.db() as db:
            db.execute('INSERT INTO source_links(id,source_id,url,label,created_at,actor) VALUES (?,?,?,?,?,?)', (lid, sid, url, clean(label)[:120], now(), actor))
        self.store.event('source.link.add', sid, {'url': url}, actor)
        return lid

    def remove_link(self, sid, lid, actor='admin'):
        link = self.store.one('SELECT url FROM source_links WHERE id=? AND source_id=?', (lid, sid))
        if not link:
            raise HTTPException(404, '링크를 찾지 못했습니다.')
        with self.store.db() as db:
            db.execute('DELETE FROM source_links WHERE id=?', (lid,))
            db.execute("UPDATE source_changes SET current=0 WHERE source=? AND origin='links' AND ref=? AND current=1",(sid,lid))
        self.store.event('source.link.remove', sid, {'url': link['url']}, actor)
        self.apply(sid)

    def accept_link(self, sid, lid, actor='admin'):
        """바뀐 내용을 확인했다 — 지금 본문을 새 기준으로 삼는다."""
        link = next((item for item in self.links(sid) if item['id'] == lid), None)
        if not link:
            raise HTTPException(404, '링크를 찾지 못했습니다.')
        current = link['result'].get('current')
        if link['result'].get('status') != 'changed' or not current:
            raise EngineError('바뀐 내용이 있는 링크만 기준을 새로 잡을 수 있습니다.')
        result = {'status': 'same', 'title': current.get('title'), 'final': current.get('final'), 'checked_at': link['result'].get('checked_at'), 'note': '관리자가 확인해 기준을 새로 잡음'}
        with self.store.db() as db:
            db.execute('UPDATE source_links SET baseline=?,result=? WHERE id=?', (dump({**current, 'at': now(), 'by': actor}), dump(result), lid))
        self.store.event('source.link.accept', sid, {'url': link['url']}, actor)
        self.apply(sid)

    def set_url(self, sid, url, actor='admin'):
        source = self.external(sid)
        if sid != 'catalogs' and source['kind'] != 'url':
            raise EngineError('이 소스의 원본 주소는 수집기에 고정되어 있습니다. 바뀐 주소는 리소스 링크로 넣어 주세요.')
        if url.strip():
            url, _, _ = checked_url(url)
        elif sid in SEED_URL:
            url = SEED_URL[sid]  # 비우면 기본 주소로 되돌린다
        else:
            raise EngineError('원본 주소를 입력해 주세요.')
        if self.store.one('SELECT id FROM sources WHERE url=? AND id!=?', (url, sid)):
            raise EngineError('다른 소스가 이미 쓰는 주소입니다.')
        with self.store.db() as db:
            db.execute('UPDATE sources SET url=? WHERE id=?', (url, sid))
        self.store.event('source.url', sid, {'url': url, 'before': source['url']}, actor)
        return url

    def watch_links(self):
        """채널 점검(watch.py --links)에 넘길 e-카탈로그 링크 — 바꾼 목록 주소 · 추가 목록 · 권 링크."""
        source = self.store.source('catalogs')
        value = {}
        if source and source['url'] and not same_url(source['url'], SEED_URL['catalogs']):
            value['listing'] = source['url']
        for link in self.links('catalogs'):
            info = ecat_link(link['url'])
            if info['kind'] == 'volume':
                value.setdefault('volumes', []).append({'dir': info['dir'], 'base': info['base'], 'url': link['url'], 'label': link['label']})
            else:
                value.setdefault('listings', []).append(link['url'])
        return {'ecat': value} if value else {}

    # ── 대조 ──
    def definitions(self, source):
        if source['id'] in DEFINITIONS:
            rows = [dict(row) for row in DEFINITIONS[source['id']]]
            if source['id'] == 'catalogs':
                rows[0]['url'] = source['url'] or SEED_URL['catalogs']
            return rows
        return [{**PAGE, 'url': source['url']}]

    def check_page(self, source, cancel):
        """등록한 주소 ↔ 관리 DB 에 반영한 원문(마지막 「DB 최신화」가 보존한 원본 파일)."""
        started = time.monotonic()
        base = {'checked_at': now(), 'coverage': '등록한 주소 한 페이지의 본문 글(메뉴 · 푸터 제외). 연결된 PDF · 영상 · 하위 페이지는 보지 않는다.'}
        item = {'title': source['name'], 'url': source['url']}
        try:
            current = page_state(fetch(source['url'], cancel=cancel))
        except EngineError as exc:
            return {**base, 'status': 'failed', 'summary': '원본 주소를 열지 못했습니다.', 'changes': [], 'errors': [{**item, 'error': str(exc)[:200]}]}
        item['title'] = current['title'] or source['name']
        asset = self.store.one("SELECT path,url,updated_at FROM assets WHERE source_id=? AND kind='document' ORDER BY updated_at DESC LIMIT 1", (source['id'],))
        done = lambda result: {**base, 'seconds': round(time.monotonic() - started), 'errors': [], 'changes': [], **result}
        if not asset:
            return done({'status': 'changed', 'summary': '아직 관리 DB 에 반영하지 않은 원본입니다.', 'changes': [{**item, 'status': 'new', 'why': ['관리 DB 에 이 원본의 자료가 없음 — 「DB 최신화」로 반영']}]})
        file = (self.store.home / (asset['path'] or '')).resolve()
        if not asset['path'] or not file.is_relative_to(self.store.home.resolve()) or not file.is_file():
            return done({'status': 'partial', 'summary': 'DB 에 반영한 원문 파일을 찾지 못해 대조하지 못했습니다.', 'errors': [{**item, 'error': '반영 때 보존한 원본 파일이 없음 — 「DB 최신화」를 다시 실행하면 기준이 생깁니다'}]})
        try:
            stored = page_state({'body': file.read_bytes(), 'url': asset['url'] or source['url'], 'type': ''})
        except EngineError as exc:
            return done({'status': 'partial', 'summary': 'DB 에 반영한 원문을 읽지 못했습니다.', 'errors': [{**item, 'error': str(exc)[:200]}]})
        stored['title'] = stored['title'] if stored['title'] != file.name else current['title']
        why, detail = compare_page(stored, current, lambda: page_state(fetch(source['url'], cancel=cancel)))
        if why:
            return done({'status': 'changed', 'summary': '원본이 DB 에 반영한 내용과 다릅니다: ' + ' · '.join(why), 'changes': [{**item, 'status': 'changed', 'why': why, **detail}]})
        return done({'status': 'same', 'summary': 'DB 에 반영한 원문과 같습니다.' + (' (받을 때마다 본문이 달라지는 페이지 — 제목 · 주소로 판정)' if detail.get('volatile') else '')})

    def check_links(self, sid, cancel, step=lambda text: None):
        """페이지로 점검하는 링크 — 처음 본문을 기준으로 잡고 이후 달라졌는지 본다."""
        for index, link in enumerate(self.links(sid)):
            if link['kind'] != 'page':
                continue
            if cancel():
                raise Cancelled()
            step(f'리소스 링크 {index + 1} 확인')
            base, at = link['baseline'], now()
            try:
                current = page_state(fetch(link['url'], cancel=cancel))
            except EngineError as exc:
                result = {'status': 'failed', 'error': str(exc)[:200], 'checked_at': at}
            else:
                if not base:
                    base = {**current, 'at': at}
                    result = {'status': 'baseline', 'title': current['title'], 'final': current['final'], 'checked_at': at}
                else:
                    why, detail = compare_page(base, current, lambda: page_state(fetch(link['url'], cancel=cancel)))
                    if detail.get('volatile'):
                        base = {**base, 'volatile': True}
                    result = {'status': 'changed' if why else 'same', 'title': current['title'], 'final': current['final'], 'checked_at': at, **({'why': why, 'current': current, **detail} if why else detail)}
            with self.store.db() as db:
                db.execute('UPDATE source_links SET baseline=?,result=?,checked_at=? WHERE id=?', (dump(base), dump(result), at, link['id']))

    def link_part(self, sid):
        """페이지 링크들의 결과를 원본 한 곳으로 묶는다(e-카탈로그 링크는 채널 결과에 들어 있다)."""
        links = [link for link in self.links(sid) if link['kind'] == 'page']
        if not links:
            return None
        checked = [link for link in links if link['result']]
        if not checked:
            return part(LINKS, None)
        changes = [{'title': link['label'] or link['result'].get('title') or link['url'], 'url': link['url'], 'status': 'changed', 'why': link['result'].get('why'), 'diff': link['result'].get('diff')}
                   for link in checked if link['result']['status'] == 'changed']
        errors = [{'title': link['label'] or link['url'], 'url': link['url'], 'error': link['result'].get('error')} for link in checked if link['result']['status'] == 'failed']
        errors += [{'title': link['label'] or link['url'], 'url': link['url'], 'error': '아직 점검하지 않은 링크'} for link in links if not link['result']]
        fresh = sum(link['result']['status'] == 'baseline' for link in checked)
        same = sum(link['result']['status'] == 'same' for link in checked)
        summary = (f'링크 {len(links)}개 중 {same + fresh}개 같음' + (f'(기준을 새로 잡음 {fresh})' if fresh else '') + (f' · 바뀜 {len(changes)}' if changes else '') + (f' · 확인 못 함 {len(errors)}' if errors else ''))
        return part(LINKS, {'status': 'partial' if errors else 'changed' if changes else 'same', 'summary': summary, 'changes': changes, 'errors': errors,
                            'counts': {'links': len(links), 'same': same + fresh, 'changed': len(changes)}, 'checked_at': latest(link['checked_at'] for link in checked),
                            'coverage': '넣은 주소마다 최종 주소 · 제목 · 본문 글(메뉴 · 푸터 제외). 처음 점검 때의 본문이 기준이며, 바뀐 내용을 확인하면 기준을 새로 잡는다.'})

    def stored(self, sid, key):
        return self.store.setting(f'origin:{sid}:{key}')

    def parts(self, source):
        sid, parts = source['id'], []
        channels = self.service.dss.latest() if sid in CHANNEL else {}
        for definition in self.definitions(source):
            key = definition['id']
            result = channels.get(key.split(':', 1)[1]) if key.startswith('channel:') else self.stored(sid, key)
            parts.append(part(definition, result))
        links = self.link_part(sid)
        return parts + ([links] if links else [])

    def report(self, sid):
        """지금까지의 대조 결과로 만든 판정. 점검한 적이 없으면 None."""
        source = self.store.source(sid)
        if not source or source['kind'] in ('local', 'custom'):
            return None
        parts = self.parts(source)
        return verdict(parts) if any(item['status'] != 'unchecked' for item in parts) else None

    def apply(self, sid):
        """판정을 소스에 기록한다 — 카드 · 상세 · 「확인이 필요한 소스」가 이 값을 본다."""
        report = self.report(sid)
        if not report:
            return None
        if sid in CHANNEL:
            result = self.service.dss.latest().get(CHANNEL[sid])
            stage = self.root / result['path'] if result and result.get('path') else None
            self.reviews.record(sid, CHANNEL[sid], result, stage)
            if sid == 'media':
                self.reviews.record(sid, 'cases', self.stored(sid, 'cases'))
            links = [l for l in self.links(sid) if l['kind'] == 'page' and l['result']]
            if links:
                changes = [dict(l['result'], id=l['id'], url=l['url'], title=l['label'] or l['result'].get('title')) for l in links if l['result'].get('status') == 'changed']
                self.reviews.record(sid, 'links', {'changes': changes, 'checked_at': latest(l['checked_at'] for l in links),
                                    'status': 'partial' if any(l['result'].get('status') == 'failed' for l in links) else 'changed' if changes else 'same'})
        with self.store.db() as db:
            db.execute('UPDATE sources SET checked_at=?,status=?,decision=?,error=NULL WHERE id=?', (report['checked_at'] or now(), report['status'], dump(report), sid))
        return report

    def companions(self, sid, cancel, step=lambda text: None):
        """채널 밖의 원본 — 도입사례 목록과 페이지 링크."""
        if sid == 'media':
            self.store.set_setting('origin:media:cases', check_cases(self.root, cancel, step))
        self.check_links(sid, cancel, step)

    def after_channels(self, channels, cancel=lambda: False, step=lambda text: None):
        """채널 점검(일일 점검 포함)이 끝난 뒤 — 그 채널을 쓰는 소스의 나머지 원본을 확인하고 판정을 맞춘다."""
        for sid, channel in CHANNEL.items():
            source = self.store.source(sid)
            if channel not in channels or not source or not source['enabled']:
                continue
            for work in (lambda: self.companions(sid, cancel, step), lambda: self.apply(sid)):
                try:
                    work()
                except Cancelled:
                    raise
                except Exception as exc:  # noqa: BLE001 — 딸린 점검이 죽어도 채널 점검은 끝내고, 채널 결과는 소스에 반영한다
                    self.store.event('source.check.error', sid, {'error': self.service.safe_error(exc)}, 'scheduler')

    def run_channels(self, sources, jid, progress, cancel):
        """여러 소스를 함께 점검할 때 — 채널들을 한 번에 실행한다. 돌려주는 값: {'done': 확인한 채널, 'error': 실패 이유}."""
        channels = [CHANNEL[source['id']] for source in sources if source['id'] in CHANNEL]
        if not channels:
            return {'done': [], 'error': None}
        try:
            self.service.dss.run_check(jid, {'channels': channels, 'trigger': 'source'}, progress, cancel)
            return {'done': channels, 'error': None}
        except Cancelled:
            raise
        except Exception as exc:  # noqa: BLE001 — 채널 실행이 죽으면 그 채널을 쓰는 소스마다 같은 이유로 실패를 남긴다
            return {'done': [], 'error': self.service.safe_error(exc)}

    def check(self, source, jid, progress, cancel, ran=None):
        """소스 하나의 최신성 점검. ran: 전체 점검에서 이미 실행한 채널(run_channels 의 결과)."""
        sid = self.external(source['id'])['id']
        if sid in CHANNEL:
            # 채널 점검은 일일 점검과 같은 실행이다 — 끝나면 after_channels 가 사례 · 링크까지 확인하고 판정을 기록한다
            if ran is None:
                self.service.dss.run_check(jid, {'channels': [CHANNEL[sid]], 'trigger': 'source'}, progress, cancel)
            elif CHANNEL[sid] not in ran['done']:
                raise EngineError(ran['error'] or '원본 점검을 실행하지 못했습니다.')
        else:
            progress('등록한 원본 주소 확인', 20)
            self.store.set_setting(f'origin:{sid}:page', self.check_page(source, cancel))
            self.check_links(sid, cancel, lambda text: progress(text, 70))
        if cancel():
            raise Cancelled()
        report = self.apply(sid)
        if not report:
            raise EngineError('점검 결과를 기록하지 못했습니다.')
        return report

    def detail(self, sid):
        """마지막 채널 점검의 전체 내역 — 줄이지 않는다. 제품은 신규 · 판매 종료 후보 · 이동 · 바뀐 제품 전부, e-카탈로그는 권마다 파일이 같은지."""
        source = self.external(sid)
        report = self.report(sid)
        base = {'source': {'id': sid, 'name': source['name'], 'status': source['status'], 'error': source['error']},
                'decision': {key: value for key, value in (report or {}).items() if key != 'origins'} or None, 'detail': None}
        result = self.service.dss.latest().get(CHANNEL.get(sid) or '')
        if not result:
            return base
        common = {'checked_at': result.get('checked_at'), 'seconds': result.get('seconds'), 'status': result.get('status'), 'summary': result.get('summary'),
                  'coverage': result.get('coverage'), 'check_id': result.get('check_id'), 'errors': [shown_error(error) for error in result.get('errors') or []]}
        counts, changes = result.get('counts') or {}, result.get('changes') or []
        if sid == 'samsung':
            link = lambda value: value if not value or value.startswith('https://') else SITE + value.lstrip('/')
            row = lambda c: {'gid': c.get('gid'), 'name': c.get('name') or c.get('gid'), 'models': c.get('models') or [], 'category': (c.get('cat') or '').split('/')[0],
                             'url': link(c.get('url')), 'app': c.get('app') or [], 'why': c.get('why') or [], 'detail': c.get('detail') or []}
            pick = lambda status: [row(c) for c in changes if c.get('status') == status]
            cards = counts.get('cards') or [None, None]
            base['detail'] = {**common, 'kind': 'site', 'collected_at': result.get('collectedAt'), 'known_errors': result.get('knownErrors') or 0,
                              'counts': {'db': cards[0], 'origin': cards[1], 'same': counts.get('unchanged'), 'categories': counts.get('categories'), 'specs': counts.get('specs')},
                              'fields': counts.get('changedFields') or {}, 'new': pick('new'), 'removed': pick('removed'), 'moved': pick('moved'), 'changed': pick('changed'),
                              'categories': [{'name': c.get('cat'), 'url': c.get('url')} for c in changes if c.get('status') == 'new-category']}
        elif sid == 'catalogs':
            different = [{'dir': c.get('dir'), 'title': c.get('title'), 'url': c.get('url'), 'status': c.get('status'), 'why': c.get('why') or [], 'pages': c.get('pages'),
                          'file_modified': c.get('fileModified'), 'fetched_at': c.get('fetchedAt'), 'modified_pages': c.get('modifiedPages') or []} for c in changes]
            base['detail'] = {**common, 'kind': 'ecat', 'issue': result.get('issue'), 'excluded': result.get('excluded') or [],
                              'counts': {'db': counts.get('db'), 'listed': counts.get('listed'), 'same': counts.get('same'), 'changed': counts.get('changed'), 'new': counts.get('new'),
                                         'gone': counts.get('gone'), 'files': counts.get('pageFiles')},
                              'different': different, 'books': result.get('books') or []}
        return base

    def sync(self):
        """서버를 켤 때 — 이미 있는 대조 결과를 소스에 맞추고, 예전 방식(메뉴를 AI 가 추정)의 판정은 미점검으로 되돌린다."""
        for source in self.store.rows("SELECT * FROM sources WHERE kind NOT IN ('local','custom')"):
            if self.apply(source['id']):
                continue
            if source['status'] in ('fresh', 'refresh', 'uncertain') and json.loads(source['decision'] or '{}').get('basis') != 'origin':
                with self.store.db() as db:
                    db.execute("UPDATE sources SET status='unchecked',decision='{}' WHERE id=?", (source['id'],))

    def view(self, sid):
        """소스 상세의 「원본 · 링크」 — 무엇을 무엇과 대조하는지, 넣은 링크와 링크별 결과."""
        source = self.external(sid)
        volumes = {}
        if sid == 'catalogs':
            latest = self.service.dss.latest().get('ecat') or {}
            volumes = {item.get('url'): item for item in (latest.get('links') or {}).get('volumes', [])}
            volumes.update({item.get('url'): item for item in (latest.get('links') or {}).get('listings', [])})
        links = []
        for link in self.links(sid):
            result = link['result'] if link['kind'] == 'page' else volumes.get(link['url'])
            links.append({'id': link['id'], 'url': link['url'], 'label': link['label'], 'kind': link['kind'], 'created_at': link['created_at'],
                          'checked_at': link['checked_at'] if link['kind'] == 'page' else (self.service.dss.latest().get('ecat') or {}).get('checked_at') if result else None,
                          'result': {key: value for key, value in (result or {}).items() if key not in ('current',)} or None})
        return {'origins': self.definitions(source), 'links': links, 'url': source['url'], 'default_url': SEED_URL.get(sid),
                'url_editable': sid == 'catalogs' or source['kind'] == 'url', 'channel': CHANNEL.get(sid), 'max_links': MAX_LINKS,
                'link_rule': ('권 링크(…ecatalog5.php?Dir=번호)는 그 권을, 그 밖의 주소는 목록 페이지로 읽어 e-카탈로그 점검에 합류합니다. DB 에 없는 권이면 갱신 권장으로 표시됩니다.' if sid == 'catalogs'
                              else '넣은 주소는 처음 점검한 본문을 기준으로 잡고, 이후 주소 이동 · 제목 · 본문이 달라지면 갱신 권장으로 표시됩니다.')}


class LinkInput(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    label: str = Field(default='', max_length=120)


class UrlInput(BaseModel):
    url: str = Field(default='', max_length=2000)


class ReviewChoices(BaseModel):
    choices: dict[str, str] = Field(min_length=1, max_length=5000)


def origin_router(get, actor):
    """get(): 현재 서비스의 Origins, actor(): 현재 요청의 관리자 아이디."""
    router = APIRouter(prefix='/api/sources')

    def review_source(sid):
        if sid not in CHANNEL:
            raise HTTPException(404, '최신성 점검 대상 소스가 아닙니다.')
        return get()

    @router.get('/{sid}/changes')
    def changes(sid: str, history: bool = False, offset: int = Query(0, ge=0), limit: int = Query(60, ge=1, le=200)):
        origin = review_source(sid)
        decision = json.loads(origin.store.source(sid)['decision'])
        return {**origin.reviews.listing(sid, history, offset, limit), 'history': history, 'offset': offset, 'limit': limit,
                'checks': [{k:p.get(k) for k in ('id','label','status','summary','checked_at')} for p in decision.get('origins', [])],
                'schedule':origin.service.dss.schedule()}

    @router.get('/{sid}/changes/job')
    def change_job(sid: str):
        origin = review_source(sid)
        job = origin.store.one("""SELECT id FROM jobs WHERE status IN ('queued','running') AND
            ((source_id=? AND kind IN ('check','dss-review')) OR (kind='check' AND source_id IS NULL) OR (kind='dss-check' AND EXISTS
            (SELECT 1 FROM json_each(json_extract(result,'$.input.channels')) WHERE value=?))) ORDER BY created_at DESC LIMIT 1""",
            (sid, CHANNEL[sid]))
        return origin.store.job(job['id']) if job else {}

    @router.post('/{sid}/changes')
    def decide_changes(sid: str, body: ReviewChoices):
        origin = review_source(sid)
        if not origin.store.source(sid)['enabled']:
            raise HTTPException(409, '사용 중지한 소스입니다.')
        choices = body.choices
        if all(v == 'ignore' for v in choices.values()):
            with origin.store.db(immediate=True) as db:
                origin.reviews.complete(db, choices, sid, actor(), uuid.uuid4().hex)
            origin.store.event('source.changes.ignore', sid, {'ids': list(choices)}, actor())
            return {'ignored': len(choices)}
        with origin.store.db() as db:
            origin.reviews.selected(db, sid, choices)
        try:
            job = origin.service.submit('dss-review', sid, {'choices': choices}, actor=actor())
        except EngineError as exc:
            raise HTTPException(409, str(exc)) from None
        return {'job': job}

    @router.get('/{sid}/origin')
    def view(sid: str):
        return get().view(sid)

    @router.get('/{sid}/report')
    def report(sid: str):
        return get().detail(sid)

    @router.put('/{sid}/url')
    def set_url(sid: str, body: UrlInput):
        origins = get()
        origins.set_url(sid, body.url, actor())
        return origins.view(sid)

    @router.post('/{sid}/links')
    def add_link(sid: str, body: LinkInput):
        origins = get()
        origins.add_link(sid, body.url, body.label, actor())
        return origins.view(sid)

    @router.delete('/{sid}/links/{lid}')
    def remove_link(sid: str, lid: str):
        origins = get()
        origins.remove_link(sid, lid, actor())
        return origins.view(sid)

    @router.post('/{sid}/links/{lid}/accept')
    def accept_link(sid: str, lid: str):
        origins = get()
        origins.accept_link(sid, lid, actor())
        return origins.view(sid)

    return router
