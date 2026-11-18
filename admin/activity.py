"""사용자별 활동 — 제안서 · 제안서 검토 · 제안 시뮬레이션 · 조감도(공간 · 건물) · LLM · 접속을 한 사람 기준으로 모은다.

Read-only over the stores the admin process already hosts: the app's account store (``account_data.sqlite``: proposals,
reviews, simulations, buildings), the 공간 조감도 store (``spatial.sqlite``) and the operations DB (spans: LLM usage,
logins, screen visits, failures). Seeded examples/samples are not a person's work and stay out of counts unless asked.

``open`` mints a read-only inspection link (app/api/inspect.py): the record opens in the real webapp in a new tab, as
that user, and nothing in that tab can be saved.
"""
from __future__ import annotations

from datetime import datetime, timedelta
import re
import sqlite3
import time
from typing import Any, Callable, Dict, Iterable, List, Optional
from urllib.parse import quote, urlencode

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from .operations import KST, Operations

KINDS = ('proposal', 'review', 'simulation', 'spatial', 'building')
COLLECTION = {'proposal': 'proposals', 'review': 'reviews', 'simulation': 'simulations', 'building': 'buildings'}
# The webapp screen name each record opens on, and the telemetry page prefix of that screen (services/telemetry.js).
PAGE = {'proposal': 'proposal', 'review': 'review', 'simulation': 'sim', 'spatial': 'spatial', 'building': 'building'}
RID = re.compile(r'[A-Za-z0-9_.:@-]{1,200}')
# Something actually broke: a server failure, a screen error, a failed job or an AI call that failed after its retries.
# Rejected requests (4xx: not found, conflict, validation) and per-attempt LLM retries are not counted as breakage.
BROKEN = ("status='error' AND (kind IN ('client.error','job','llm.logical','application.error') "
          "OR (kind='http' AND http_status>=500))")
SYSTEM = ('system', 'anonymous', 'scheduler', 'guest')
SORTS = ('recent', 'login', 'tokens', 'input', 'output', 'work', 'name', 'created')
SEGMENTS = ('', 'recent', 'dormant', 'never', 'inactive', 'admin')
_FLAG = "coalesce(json_type(data,'$.{0}'),'null') NOT IN ('null','false')"
# Seeded examples/samples per collection — the same rule for one person's view and for the user list.
SAMPLE = {'proposal': _FLAG.format('sample'), 'review': '(' + _FLAG.format('sample') + ' OR ' + _FLAG.format('demo') + ')',
          'simulation': '0', 'building': _FLAG.format('example')}
_SQL = {
    'proposal': f"""SELECT id,revision,size,json_extract(data,'$.title') title,json_extract(data,'$.customer') customer,
        coalesce(json_extract(data,'$.indName'),json_extract(data,'$.ind')) industry,json_extract(data,'$.stage') stage,
        json_extract(data,'$.createdAt') created,json_extract(data,'$.updatedAt') updated,client_updated_at,
        json_array_length(data,'$.parts') parts,
        (SELECT coalesce(sum(json_array_length(p.value,'$.layouts')),0) FROM json_each(data,'$.parts') p) sheets,
        json_extract(data,'$._share.token') share,json_extract(data,'$.exportedAt') exported,{SAMPLE['proposal']} sample
        FROM account_records WHERE owner=? AND collection='proposals' AND deleted=0""",
    'review': f"""SELECT id,revision,size,json_extract(data,'$.title') title,json_extract(data,'$.status') status,
        json_extract(data,'$.kind') review_kind,json_array_length(data,'$.files') files,
        json_extract(data,'$.createdAt') created,coalesce(json_extract(data,'$.updatedAt'),json_extract(data,'$.finishedAt')) updated,
        client_updated_at,{SAMPLE['review']} sample FROM account_records WHERE owner=? AND collection='reviews' AND deleted=0""",
    'simulation': """SELECT id,revision,size,json_extract(data,'$.status') status,json_extract(data,'$.level') level,
        json_extract(data,'$.setup.customer') customer,json_extract(data,'$.setup.ind') industry,
        json_extract(data,'$.profile.name') persona,json_extract(data,'$.profile.role') role,json_array_length(data,'$.msgs') turns,
        json_type(data,'$.debrief') debrief,json_extract(data,'$.createdAt') created,json_extract(data,'$.updatedAt') updated,
        client_updated_at,0 sample FROM account_records WHERE owner=? AND collection='simulations' AND deleted=0""",
    'building': f"""SELECT id,revision,size,json_extract(data,'$.title') title,json_array_length(data,'$.floors') floors,
        json_extract(data,'$.createdAt') created,json_extract(data,'$.updatedAt') updated,client_updated_at,
        {SAMPLE['building']} sample FROM account_records WHERE owner=? AND collection='buildings' AND deleted=0""",
}
STAGES = {'req': '요구사항', 'match': '매칭', 'story': '스토리보드'}
SIM_STATUS = {'active': '진행 중', 'running': '진행 중', 'done': '완료', 'finished': '완료', 'interrupted': '중단'}
REVIEW_STATUS = {'done': '완료', 'running': '진행 중', 'error': '실패', 'failed': '실패', 'cancelled': '취소'}


def seconds(value) -> Optional[float]:
    """Browser timestamps are milliseconds, server ones seconds."""
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0:
        return value / 1000 if value > 100_000_000_000 else float(value)
    return None


def _connect(path) -> Optional[sqlite3.Connection]:
    if not path:
        return None
    try:
        db = sqlite3.connect(f'file:{path}?mode=ro', uri=True, timeout=10)
    except sqlite3.Error:
        return None
    db.row_factory = sqlite3.Row
    return db


class Activity:
    def __init__(self, operations: Operations, state: Callable[[], Any] = lambda: None):
        self.ops, self.state = operations, state

    # ------------------------------------------------------------ stores
    def _path(self, attribute, field):
        store = getattr(self.state(), attribute, None)
        return getattr(store, field, None) if store is not None else None

    def _rows(self, which: str, sql: str, args: Iterable = ()) -> List[dict]:
        db = _connect(self._path('account_data', 'path') if which == 'account' else self._path('spatial_store', 'filename'))
        if db is None:
            return []
        try:
            return [dict(r) for r in db.execute(sql, tuple(args))]
        except sqlite3.Error:
            return []  # store not created yet (fresh install) — nothing recorded
        finally:
            db.close()

    def records(self, username: str) -> List[dict]:
        """Every live work record of one person, newest activity first."""
        out = []
        for kind, sql in _SQL.items():
            for row in self._rows('account', sql, (username,)):
                out.append(self._record(kind, row))
        for row in self._rows('spatial', 'SELECT id,title,example,status,revision,created_at,updated_at FROM scenes WHERE owner=? AND deleted=0', (username,)):
            out.append(self._record('spatial', row))
        out.sort(key=lambda r: r['at'] or 0, reverse=True)
        return out

    @staticmethod
    def _record(kind: str, row: dict) -> dict:
        created = seconds(row.get('created') if kind != 'spatial' else row.get('created_at'))
        updated = seconds(row.get('updated') if kind != 'spatial' else row.get('updated_at')) or seconds(row.get('client_updated_at'))
        record = {'kind': kind, 'id': row['id'], 'created_at': created, 'updated_at': updated or created,
                  'at': max(v for v in (created, updated, 0) if v is not None), 'revision': row.get('revision'),
                  'size': row.get('size'), 'sample': bool(row.get('sample') if kind != 'spatial' else row.get('example'))}
        if kind == 'proposal':
            record.update(title=row['title'] or '제목 없는 제안서', customer=row['customer'], industry=row['industry'],
                          status=STAGES.get(row['stage'], row['stage'] or '요구사항'), parts=row['parts'] or 0, sheets=row['sheets'] or 0,
                          shared=bool(row['share']), exported=bool(row['exported']))
        elif kind == 'review':
            record.update(title=row['title'] or '제안서 검토', status=REVIEW_STATUS.get(row['status'], row['status']), files=row['files'] or 0)
        elif kind == 'simulation':
            who = ' · '.join(v for v in (row['persona'], row['role']) if v)
            record.update(title=' · '.join(v for v in (row['customer'], who) if v) or '제안 시뮬레이션', customer=row['customer'],
                          industry=row['industry'], status='완료' if row['debrief'] == 'object' else SIM_STATUS.get(row['status'], row['status']),
                          turns=row['turns'] or 0, level=row['level'])
        elif kind == 'building':
            record.update(title=row['title'] or '건물 조감도', floors=row['floors'] or 0, status=None)
        else:
            record.update(title=row['title'] or '공간 조감도', status='작성 중' if row['status'] == 'draft' else None)
        return record

    # ------------------------------------------------------------ period
    def window(self, start=None, end=None, everything=False, username='', records=None):
        if not everything:
            return Operations.period(start, end)
        earliest = [self.ops.one('SELECT min(started) n FROM spans WHERE username=?', (username,))['n'],
                    (self.ops.one('SELECT created_at n FROM users WHERE username=?', (username,)) or {}).get('n')]
        earliest += [r['created_at'] for r in (self.records(username) if records is None else records) if r['created_at']]
        first = min([v for v in earliest if v] or [time.time()])
        first = datetime.fromtimestamp(first, KST).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        return first, time.time() + 1

    @staticmethod
    def within(record, first, last):
        return any(v is not None and first <= v < last for v in (record['created_at'], record['updated_at']))

    # ------------------------------------------------------------ one person
    def summary(self, username: str, start=None, end=None, everything=False, samples=False) -> dict:
        everyone = self.records(username)
        first, last = self.window(start, end, everything, username, everyone)
        records = [r for r in everyone if samples or not r['sample']]
        counts = {}
        for kind in KINDS:
            mine = [r for r in records if r['kind'] == kind]
            counts[kind] = {'created': sum(1 for r in mine if r['created_at'] and first <= r['created_at'] < last),
                            'active': sum(1 for r in mine if self.within(r, first, last)), 'total': len(mine)}
        deleted = self._rows('account', "SELECT collection,count(*) n FROM account_records WHERE owner=? AND deleted=1 AND updated_at>=? AND updated_at<? GROUP BY collection",
                             (username, first, last))
        for row in deleted:
            for kind, collection in COLLECTION.items():
                if collection == row['collection']:
                    counts[kind]['deleted'] = row['n']
        span = "username=? AND started>=? AND started<?"
        llm = self.ops.one(f"""SELECT count(*) calls,coalesce(sum(total_tokens),0) total_tokens,coalesce(sum(input_tokens),0) input_tokens,
            coalesce(sum(output_tokens),0) output_tokens,coalesce(sum(thought_tokens),0) thought_tokens,coalesce(sum(cached_tokens),0) cached_tokens,
            sum(CASE WHEN usage_known=0 OR total_tokens IS NULL THEN 1 ELSE 0 END) unknown,sum(CASE WHEN status='error' THEN 1 ELSE 0 END) errors
            FROM spans WHERE {span} AND kind='llm.usage'""", (username, first, last))
        access = self.ops.one(f"""SELECT sum(CASE WHEN kind='auth.login' AND status='ok' THEN 1 ELSE 0 END) logins,
            sum(CASE WHEN kind='screen.enter' THEN 1 ELSE 0 END) visits,sum(CASE WHEN kind='action' THEN 1 ELSE 0 END) actions,
            sum(CASE WHEN {BROKEN} THEN 1 ELSE 0 END) errors,
            sum(CASE WHEN kind='client.error' THEN 1 ELSE 0 END) client_errors,
            sum(CASE WHEN kind='http' AND status='error' AND http_status>=400 AND http_status<500 THEN 1 ELSE 0 END) rejected,
            sum(CASE WHEN kind='job' THEN 1 ELSE 0 END) jobs,sum(CASE WHEN kind='job' AND status='error' THEN 1 ELSE 0 END) failed_jobs,
            count(DISTINCT session_id) sessions,max(started) last_seen FROM spans WHERE {span}""", (username, first, last))
        access['failed_logins'] = self.ops.one("""SELECT count(*) n FROM spans WHERE kind='auth.login' AND status='error' AND started>=? AND started<?
            AND (username=? OR json_extract(metadata,'$.attempted_username')=?)""", (first, last, username, username))['n']
        access['last_seen_ever'] = self.ops.one('SELECT max(started) n FROM spans WHERE username=?', (username,))['n']
        features = self.ops.rows(f"""SELECT feature,count(*) calls,coalesce(sum(total_tokens),0) total_tokens,coalesce(sum(input_tokens),0) input_tokens,coalesce(sum(output_tokens),0) output_tokens FROM spans
            WHERE {span} AND kind='llm.usage' GROUP BY feature ORDER BY total_tokens DESC LIMIT 8""", (username, first, last))
        models = self.ops.rows(f"""SELECT model,count(*) calls,coalesce(sum(total_tokens),0) total_tokens,coalesce(sum(input_tokens),0) input_tokens,coalesce(sum(output_tokens),0) output_tokens FROM spans
            WHERE {span} AND kind='llm.usage' AND model IS NOT NULL AND model!='' GROUP BY model ORDER BY total_tokens DESC LIMIT 5""", (username, first, last))
        return {'username': username, 'first': first, 'last': last, 'all': everything, 'timezone': 'Asia/Seoul',
                'counts': {k: {k2: v2 or 0 for k2, v2 in v.items()} for k, v in counts.items()},
                'llm': {k: v or 0 for k, v in llm.items()}, 'access': {k: (v or 0) if k not in ('last_seen', 'last_seen_ever') else v for k, v in access.items()},
                'features': features, 'models': models, 'series': self.series(username, records, first, last),
                'samples': sum(1 for r in everyone if r['sample'])}

    def series(self, username, records, first, last):
        weekly = (last - first) > 92 * 86400
        start = datetime.fromtimestamp(first, KST).replace(hour=0, minute=0, second=0, microsecond=0)
        if weekly:
            start -= timedelta(days=start.weekday())
        step = timedelta(days=7 if weekly else 1)

        def key(value):
            moment = datetime.fromtimestamp(value, KST).replace(hour=0, minute=0, second=0, microsecond=0)
            if weekly:
                moment -= timedelta(days=moment.weekday())
            return moment.strftime('%Y-%m-%d')
        buckets, cursor = {}, start
        while cursor.timestamp() < last:
            buckets[cursor.strftime('%Y-%m-%d')] = {'bucket': cursor.strftime('%Y-%m-%d'), 'proposal': 0, 'review': 0, 'simulation': 0,
                                                    'birdseye': 0, 'total_tokens': 0, 'input_tokens': 0, 'output_tokens': 0, 'llm_calls': 0, 'logins': 0}
            cursor += step
        for record in records:
            if record['created_at'] and first <= record['created_at'] < last and key(record['created_at']) in buckets:
                buckets[key(record['created_at'])]['birdseye' if record['kind'] in ('spatial', 'building') else record['kind']] += 1
        for row in self.ops.rows("""SELECT started,kind,status,total_tokens,input_tokens,output_tokens FROM spans WHERE username=? AND started>=? AND started<?
                                    AND (kind='llm.usage' OR (kind='auth.login' AND status='ok'))""", (username, first, last)):
            bucket = buckets.get(key(row['started']))
            if bucket is None:
                continue
            if row['kind'] == 'llm.usage':
                bucket['total_tokens'] += row['total_tokens'] or 0
                bucket['input_tokens'] += row['input_tokens'] or 0
                bucket['output_tokens'] += row['output_tokens'] or 0
                bucket['llm_calls'] += 1
            else:
                bucket['logins'] += 1
        return {'bucket': 'week' if weekly else 'day', 'rows': list(buckets.values())}

    def items(self, username: str, start=None, end=None, everything=False, kind='', q='', samples=False, offset=0, limit=20) -> dict:
        everyone = self.records(username)
        first, last = self.window(start, end, everything, username, everyone)
        kinds = ('spatial', 'building') if kind == 'birdseye' else (kind,) if kind else KINDS
        needle = q.strip().lower()
        rows = [r for r in everyone if r['kind'] in kinds and (samples or not r['sample']) and self.within(r, first, last)
                and (not needle or any(needle in str(r.get(f) or '').lower() for f in ('title', 'customer', 'industry', 'id')))]
        usage = {row['page']: row for row in self.ops.rows("""SELECT page,count(*) calls,coalesce(sum(total_tokens),0) total_tokens,
            coalesce(sum(input_tokens),0) input_tokens,coalesce(sum(output_tokens),0) output_tokens FROM spans
            WHERE username=? AND kind='llm.usage' AND started>=? AND started<? AND page LIKE '%:_%' GROUP BY page""", (username, first, last))}
        page = rows[offset:offset + limit]
        for row in page:
            used = usage.get(PAGE[row['kind']] + ':' + row['id']) or {}
            row['llm_calls'], row['total_tokens'] = used.get('calls', 0), used.get('total_tokens', 0)
            row['input_tokens'], row['output_tokens'] = used.get('input_tokens', 0), used.get('output_tokens', 0)
        return {'items': page, 'total': len(rows), 'first': first, 'last': last}

    # ------------------------------------------------------------ everyone, by day (사용자 관리 머리 그래프)
    TREND = ('proposal', 'login', 'active', 'review', 'simulation', 'birdseye', 'input_tokens', 'output_tokens')

    def trend(self, start=None, end=None, include_admin=False) -> dict:
        """All users' activity per KST day: work created (samples · examples out), logins, active people, LLM 입력 · 출력.
        Administrator accounts are left out unless asked for — the same rule as 사용 추적."""
        first, last = Operations.period(start, end, days=30)
        admins = set() if include_admin else {r['username'] for r in self.ops.rows(Operations.ADMINS)}
        day = lambda value: datetime.fromtimestamp(value, KST).strftime('%Y-%m-%d')
        buckets, cursor = {}, datetime.fromtimestamp(first, KST).replace(hour=0, minute=0, second=0, microsecond=0)
        while cursor.timestamp() < last:
            buckets[cursor.strftime('%Y-%m-%d')] = {'bucket': cursor.strftime('%Y-%m-%d'), **{k: 0 for k in self.TREND}}
            cursor += timedelta(days=1)

        def count(owner, created, key):
            at = seconds(created)
            if owner not in admins and at is not None and first <= at < last and day(at) in buckets:
                buckets[day(at)][key] += 1
        for kind, collection in (('proposal', 'proposals'), ('review', 'reviews'), ('simulation', 'simulations'), ('building', 'buildings')):
            for row in self._rows('account', f"""SELECT owner,json_extract(data,'$.createdAt') created FROM account_records
                                                 WHERE collection=? AND deleted=0 AND NOT {SAMPLE[kind]}""", (collection,)):
                count(row['owner'], row['created'], 'birdseye' if kind == 'building' else kind)
        for row in self._rows('spatial', 'SELECT owner,created_at created FROM scenes WHERE deleted=0 AND example=0'):
            count(row['owner'], row['created'], 'birdseye')
        hidden = list(admins)
        skip = (' AND username NOT IN (' + ','.join('?' for _ in hidden) + ')') if hidden else ''
        people = list(SYSTEM)
        for row in self.ops.rows(f"""SELECT strftime('%Y-%m-%d',started,'unixepoch','+9 hours') bucket,
                SUM(CASE WHEN kind='auth.login' AND status='ok' THEN 1 ELSE 0 END) login,
                COUNT(DISTINCT CASE WHEN username NOT IN ({','.join('?' for _ in people)}) THEN username END) active,
                coalesce(SUM(CASE WHEN kind='llm.usage' THEN input_tokens END),0) input_tokens,
                coalesce(SUM(CASE WHEN kind='llm.usage' THEN output_tokens END),0) output_tokens
                FROM spans WHERE started>=? AND started<?{skip} GROUP BY bucket""", (*people, first, last, *hidden)):
            if row['bucket'] in buckets:
                buckets[row['bucket']].update({k: row[k] or 0 for k in ('login', 'active', 'input_tokens', 'output_tokens')})
        rows = list(buckets.values())
        return {'rows': rows, 'totals': {k: sum(r[k] for r in rows) for k in self.TREND if k != 'active'},
                'first': first, 'last': last, 'include_admin': bool(include_admin), 'timezone': 'Asia/Seoul'}

    # ------------------------------------------------------------ everyone (사용자 관리 목록)
    def directory(self, q='', active=None, role='', segment='', sort='recent', offset=0, limit=20) -> dict:
        from .users import PUBLIC
        conditions, args = [], []
        if q:
            conditions.append('(instr(lower(username),lower(?))>0 OR instr(lower(display_name),lower(?))>0)'); args += [q, q]
        if active is not None:
            conditions.append('active=?'); args.append(int(active))
        if role in ('admin', 'member'):
            conditions.append('role=?'); args.append(role)
        where = ' WHERE ' + ' AND '.join(conditions) if conditions else ''
        users = self.ops.rows('SELECT ' + PUBLIC + ' FROM users' + where + ' ORDER BY created_at,username', args)
        everyone = self.ops.rows('SELECT username,role,active,last_login FROM users')
        now = time.time()
        month, week = now - 30 * 86400, now - 7 * 86400
        spans = {r['username']: r for r in self.ops.rows(f"""SELECT username,max(started) last_seen,
            sum(CASE WHEN kind='llm.usage' AND started>=? THEN coalesce(total_tokens,0) ELSE 0 END) tokens_30d,
            sum(CASE WHEN kind='llm.usage' AND started>=? THEN coalesce(input_tokens,0) ELSE 0 END) input_30d,
            sum(CASE WHEN kind='llm.usage' AND started>=? THEN coalesce(output_tokens,0) ELSE 0 END) output_30d,
            sum(CASE WHEN kind='llm.usage' AND started>=? THEN 1 ELSE 0 END) llm_calls_30d,
            sum(CASE WHEN kind='auth.login' AND status='ok' AND started>=? THEN 1 ELSE 0 END) logins_30d,
            sum(CASE WHEN {BROKEN} AND started>=? THEN 1 ELSE 0 END) errors_7d
            FROM spans GROUP BY username""", (month, month, month, month, month, week))}
        work: Dict[str, Dict[str, int]] = {}
        for kind, collection in COLLECTION.items():
            for row in self._rows('account', f"SELECT owner,count(*) n FROM account_records WHERE collection=? AND deleted=0 AND NOT {SAMPLE[kind]} GROUP BY owner",
                                  (collection,)):
                work.setdefault(row['owner'], {})[kind] = row['n']
        for row in self._rows('spatial', 'SELECT owner,count(*) n FROM scenes WHERE deleted=0 AND example=0 GROUP BY owner'):
            work.setdefault(row['owner'], {})['spatial'] = row['n']

        def enrich(user):
            s = spans.get(user['username']) or {}
            w = work.get(user['username']) or {}
            user.update(last_seen=s.get('last_seen'), tokens_30d=s.get('tokens_30d') or 0, llm_calls_30d=s.get('llm_calls_30d') or 0,
                        input_30d=s.get('input_30d') or 0, output_30d=s.get('output_30d') or 0,
                        logins_30d=s.get('logins_30d') or 0, errors_7d=s.get('errors_7d') or 0,
                        proposals=w.get('proposal', 0), reviews=w.get('review', 0), simulations=w.get('simulation', 0),
                        birdseye=w.get('spatial', 0) + w.get('building', 0))
            user['work'] = user['proposals'] + user['reviews'] + user['simulations'] + user['birdseye']
            return user

        def segment_of(user):
            last_seen = (spans.get(user['username']) or {}).get('last_seen')
            return {'recent': bool(last_seen and last_seen >= week),
                    'dormant': bool(user['active'] and (not last_seen or last_seen < month)),
                    'never': not user['last_login'], 'inactive': not user['active'], 'admin': user['role'] == 'admin'}
        stats = {'total': len(everyone), 'active': sum(1 for u in everyone if u['active'])}
        for name in SEGMENTS[1:]:
            stats[name] = sum(1 for u in everyone if segment_of(u)[name])
        users = [enrich(u) for u in users if not segment or segment_of(u)[segment]]
        order = {'recent': lambda u: -(u['last_seen'] or 0), 'login': lambda u: -(u['last_login'] or 0), 'tokens': lambda u: -u['tokens_30d'],
                 'input': lambda u: -u['input_30d'], 'output': lambda u: -u['output_30d'],
                 'work': lambda u: -u['work'], 'name': lambda u: (u['display_name'] or u['username']).lower(), 'created': lambda u: u['created_at'] or 0}
        users.sort(key=order.get(sort, order['recent']))
        return {'items': users[offset:offset + limit], 'total': len(users), 'stats': stats}


def webapp_path(kind: str, identifier: str) -> str:
    if kind == 'proposal':
        return '/storyboard/' + quote(identifier, safe='')
    if kind == 'spatial':
        return '/spatial/' + quote(identifier, safe='')
    return '/'


def activity_router(activity: Activity, auth) -> APIRouter:
    router = APIRouter(prefix='/api/users')

    def known(username):
        if not activity.ops.one('SELECT 1 n FROM users WHERE username=?', (username,)):
            raise HTTPException(404, '사용자를 찾지 못했습니다.')

    @router.get('/{username}/activity')
    def summary(username: str, start: str | None = None, end: str | None = None, all: bool = False, samples: bool = False):
        known(username)
        try:
            return activity.summary(username, start, end, all, samples)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.get('/{username}/activity/items')
    def items(username: str, start: str | None = None, end: str | None = None, all: bool = False, kind: str = '',
              q: str = Query('', max_length=150), samples: bool = False, offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
        known(username)
        if kind and kind not in (*KINDS, 'birdseye'):
            raise HTTPException(422, '활동 종류가 올바르지 않습니다.')
        try:
            return activity.items(username, start, end, all, kind, q, samples, offset, limit)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.get('/{username}/open')
    def open_in_webapp(username: str, request: Request, kind: str = 'home', id: str = ''):
        """New tab → the webapp, as this user, read-only (app/api/inspect.py)."""
        from app.api import inspect, telemetry
        known(username)
        if kind not in (*KINDS, 'home') or (kind != 'home' and not RID.fullmatch(id)):
            raise HTTPException(422, '열 기록이 올바르지 않습니다.')
        admin = auth.read_token(request.cookies.get(auth.config.cookie_name))
        if not admin:
            raise HTTPException(401, '관리자 로그인이 필요합니다.')
        token, expires = inspect.issue(auth, admin, username)
        telemetry.emit('admin.user', username=admin['u'], feature='admin.users', action='inspect',
                       metadata={'target': username, 'kind': kind, 'id': id, 'expires_at': expires})
        fragment = urlencode({'inspect': token, 'open': kind + (':' + id if id else '')})
        return RedirectResponse(webapp_path(kind, id) + '#' + fragment, 303,
                                headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'})

    return router
