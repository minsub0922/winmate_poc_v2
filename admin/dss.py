"""원천 소스 점검 · 업데이트 · 삭제 확인 — 관리자에서 실제 DSS DB(proddb · app/data)를 최신으로 유지한다.

1. 점검: `proddb/build/dss/watch.py` 를 매일 정한 시각(기본 09:00 KST)에 실행해 채널별 변경 여부를 기록한다. DB 는 바꾸지 않는다.
2. 업데이트: 연결한 코드 에이전트에 채널별 고정 프롬프트를 실행시킨다(`.agents/skills/winmate-update-dss-db`).
   판매 종료로 확정한 항목은 에이전트가 표시까지만 한다.
3. 삭제: 삭제 후보(판매 종료 표시된 항목)와 연관 자료를 화면에 보여 주고, 관리자가 고른 것만 `proddb/build/dss/deletions.py apply` 로 지운다.
   삭제와 함께 샘플 시나리오 · 조감도 오브젝트 · 레이아웃 · 에이전트 KB 까지 반영된다.

DSS 작업(점검 · 업데이트 · 삭제)은 전용 대기열에서 하나씩만 실행한다 — 같은 파일을 동시에 고치지 않게.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import threading
import time

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .agent import AgentError, Agents, PROVIDERS
from .config import ROOT
from .engine import Cancelled, EngineError
from .store import dump, now

KST = timezone(timedelta(hours=9))
TOOLS = ROOT / 'proddb/build/dss'
CHANNELS = {
    'site': {'name': 'samsung.com/business 제품', 'scope': 'samsung.com/sec/business 제품 목록 · 옵션 · 사양 · 상품 페이지 특장점 (제품 행 · 큐레이션 제품)'},
    'solutions': {'name': '솔루션 · 분류 페이지', 'scope': '솔루션 · 서비스 페이지와 제품군 분류 주소 (앱 솔루션 · 버티컬 솔루션 · 제품군 분류)'},
    'ecat': {'name': 'e-카탈로그', 'scope': 'e-카탈로그 samsung.aiibook.net/b2b 의 권 전부 (정기 호 교체 · 새 권 · 개정 권 · 빠진 권)'},
    'subs': {'name': 'B2B 삼성 AI 구독', 'scope': '구독 메인 · 혜택 이벤트 · 뉴스룸 기사 (구독 레지스트리 · 구독 장 · 구독 샘플)'},
}
GIT_RULES = {
    'none': '커밋 · 푸시는 하지 않는다. skill 의 「커밋하고 main 에 푸시」 단계는 건너뛴다 — 관리자가 결과를 확인한 뒤 따로 한다.',
    'commit': '검증을 통과하면 이번 run 이 바꾼 파일만 골라 커밋한다(다른 변경은 건드리지 않는다). 푸시는 하지 않는다.',
    'push': '검증을 통과하면 skill 의 순서대로 이번 run 이 바꾼 파일만 커밋하고 main 에 푸시한다.',
}
def rel(path):
    try:
        return str(Path(path).relative_to(ROOT))
    except ValueError:
        return str(path)


SCHEDULE_DEFAULT = {'enabled': True, 'time': '09:00', 'channels': list(CHANNELS)}
KEEP_STAGED = 3  # 점검 때 받은 원문(staging)은 최근 몇 번만 남긴다 — 결과 요약은 DB 에 계속 남는다


def git_mode():
    mode = os.environ.get('WINMATE_AGENT_GIT', 'none')
    return mode if mode in GIT_RULES else 'none'


def update_prompt(channel, watch=None):
    """채널별 고정 프롬프트. 바뀌는 부분은 채널 이름 · 범위와, 오늘 점검이 남긴 결과 파일 위치뿐이다."""
    c = CHANNELS[channel]
    lines = [
        f'Winmate 저장소의 DSS DB 를 원천 소스 채널 「{c["name"]}」 기준으로 업데이트한다. 묻지 말고 끝까지 진행한다.',
        '',
        '1. `.agents/skills/winmate-update-dss-db/SKILL.md` 와 그 문서가 시작 전에 읽으라고 한 문서를 읽고 그 절차를 따른다.',
        f'2. 범위는 이 채널로 한정한다: {c["scope"]}. 다루지 않은 레지스트리 · 소스는 skill 0단계대로 표식과 판매 종료 판정에서 뺀다.',
        '3. 관리자 일일 점검 결과가 있으면 먼저 읽는다: ' + (f'`{watch["path"]}/watch.json` (점검 {watch["at"]}). 이 채널의 바뀐 항목 목록이 들어 있고, '
            '같은 폴더에 점검 때 받은 원문이 있으면 받은 지 24시간 안일 때만 다시 받지 않고 쓴다.' if watch else '없음 — 처음부터 수집한다.'),
        '4. 판매 종료(deprecated)로 확정한 항목은 skill 7단계의 표시까지만 한다. 행이나 레지스트리 항목을 지우지 않는다. '
        '삭제는 관리자가 화면에서 대상을 확인한 뒤 `proddb/build/dss/deletions.py` 로 실행한다.',
        '5. 반영한 뒤 `python3 proddb/build/dss/cascade.py` 로 연관 자료(샘플 시나리오 · 조감도 3D 오브젝트 · 에이전트 KB · runtime projection)를 다시 만들고, '
        '`python3 proddb/build/dss/refcheck.py` 가 통과할 때까지 고친다. 바뀐 제품의 이름 · 모델 · 사양을 적은 샘플 시나리오 · 레이아웃 글은 새 원문대로 고친다.',
        '6. ' + GIT_RULES[git_mode()],
        '7. 끝나면 마지막 줄에 결과를 한 줄로 낸다(다른 글 없이): '
        '`@@result {"run_id": "…", "changed": 0, "new": 0, "deprecated": ["원장 키"], "unresolved": 0, "report": "proddb/reviews/<RUN_ID>/REPORT.md"}`',
    ]
    return '\n'.join(lines)


def cascade_prompt(keys):
    """삭제 후보의 이름 · 모델이 샘플 시나리오 · 레이아웃 글에 남아 자동으로 지울 수 없을 때, 그 글을 대체 제품 기준으로 고치는 고정 프롬프트."""
    return '\n'.join([
        'Winmate 저장소에서 삭제 예정인 판매 종료 항목이 샘플 시나리오 · 레이아웃 글에 남아 있다. 그 글을 대체 제품 기준으로 고친다. 묻지 말고 끝까지 진행한다.',
        '',
        '대상(원장 키): ' + ', '.join(keys),
        '1. `python3 proddb/build/dss/deletions.py list` 로 대상마다 `refs` 의 `"action": "manual"` 위치와 대체 제품을 확인한다.',
        '2. `.agents/skills/winmate-update-dss-db/SKILL.md` 8단계(연관 자료 갱신) 규칙으로 그 위치의 글 · 사진 · 연결 제품을 대체 제품의 원문 사실로 바꾼다. '
        '생성 파일은 손으로 고치지 않고 생성기 입력을 고친 뒤 다시 만든다. 원문에 없는 수치 · 기능은 쓰지 않는다.',
        '3. `python3 proddb/build/dss/deletions.py list` 에서 대상의 `blocked` 가 비고, `python3 proddb/build/dss/refcheck.py` 가 통과할 때까지 반복한다. 바꾼 장은 렌더해 넘침 · 잘림이 없는지 본다.',
        '4. 삭제 자체는 하지 않는다(관리자가 실행한다). ' + GIT_RULES[git_mode()],
        '5. 끝나면 마지막 줄에 결과를 한 줄로 낸다: `@@result {"fixed": ["원장 키"], "remaining": ["원장 키"]}`',
    ])


class Dss:
    def __init__(self, service):
        self.service, self.store = service, service.store
        self.agents = Agents(self.store.home)
        self.home = self.store.home / 'dss'
        self.home.mkdir(parents=True, exist_ok=True)
        self.staging = ROOT / 'output/dss/watch'  # 점검 때 받은 원문 — 같은 날 업데이트가 다시 쓴다(git 제외)
        self.stamps = threading.Lock()
        with self.store.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS dss_checks(
                  id TEXT PRIMARY KEY, at TEXT, trigger TEXT, job_id TEXT, status TEXT, changed INTEGER,
                  channels TEXT, result TEXT, path TEXT);
                CREATE TABLE IF NOT EXISTS dss_runs(
                  id TEXT PRIMARY KEY, at TEXT, kind TEXT, channel TEXT, provider TEXT, actor TEXT, job_id TEXT,
                  status TEXT, finished_at TEXT, input TEXT, result TEXT);
            ''')
        # 이 저장소에서 처음 켜는 날, 이미 점검 시각이 지났으면 그날은 건너뛴다 — 시험용 · 새 서버가 켜지자마자 전체 수집을 시작하지 않게.
        # (이미 일정을 돌리던 서버가 그 시각에 꺼져 있었던 경우에만 켜진 뒤 따라잡는다.)
        if self.store.setting('dss_schedule_since') is None:
            current = self.clock()
            self.store.set_setting('dss_schedule_since', current.isoformat())
            if self.store.setting('dss_last_scheduled') is None and current >= self.planned():
                self.store.set_setting('dss_last_scheduled', current.date().isoformat())
        if not self.store.setting('source_review_schedule_v1'):
            previous = self.schedule()
            channels = [c for c in CHANNELS if c in ('site', 'ecat', 'solutions') or c in previous['channels']]
            self.store.set_setting('dss_schedule', {'enabled': True, 'time': '09:00', 'channels': channels})
            self.store.set_setting('source_review_schedule_v1', True)

    # ── 상태 ──
    @staticmethod
    def clock():
        return datetime.now(KST)

    def schedule(self):
        return {**SCHEDULE_DEFAULT, **(self.store.setting('dss_schedule') or {})}

    def planned(self):
        hour, minute = map(int, self.schedule()['time'].split(':'))
        return self.clock().replace(hour=hour, minute=minute, second=0, microsecond=0)

    def next_run(self):
        if not self.schedule()['enabled']:
            return None
        at, current = self.planned(), self.clock()
        done = self.store.setting('dss_last_scheduled') == current.date().isoformat()
        return (at if current < at else at + timedelta(days=1) if done else current).isoformat()

    def due(self):
        """오늘 정한 시각이 지났고 오늘 자동 점검을 아직 시작하지 않았으면 True — 일정을 돌리던 서버가 그 시각에 꺼져 있었으면 켜진 뒤 바로 돈다."""
        current = self.clock()
        return self.schedule()['enabled'] and current >= self.planned() and self.store.setting('dss_last_scheduled') != current.date().isoformat()

    def tick(self):
        if self.due():
            # 다른 소스 작업이 진행 중이면 submit 이 EngineError 를 낸다 — 그때는 표시를 남기지 않아 다음 주기에 다시 시도한다
            self.service.submit('dss-check', None, {'trigger': 'schedule', 'channels': self.schedule()['channels']}, actor='scheduler')
            self.store.set_setting('dss_last_scheduled', self.clock().date().isoformat())

    def latest(self):
        """채널마다 가장 최근 점검 결과(채널을 골라 점검한 회차도 있으므로 채널별로 찾는다)."""
        found = {}
        checks = self.store.rows("""WITH latest AS (
            SELECT c.id, ch.value AS channel, ROW_NUMBER() OVER (PARTITION BY ch.value ORDER BY c.at DESC,c.rowid DESC) AS n
            FROM dss_checks c,json_each(c.channels) ch)
            SELECT l.channel,c.id,c.at,c.trigger,c.path,json_extract(c.result,'$.channels.'||l.channel) AS result
            FROM latest l JOIN dss_checks c ON c.id=l.id WHERE l.n=1""")
        for row in checks:
            if row['result']:
                found[row['channel']] = {**json.loads(row['result']), 'check_id':row['id'], 'check_at':row['at'], 'trigger':row['trigger'], 'path':row['path']}
        return found

    def attention(self):
        """확인이 필요한 채널 수 — 최근 점검에서 바뀜 · 일부만 확인 · 실패."""
        return sum(1 for v in self.latest().values() if v.get('status') != 'same')

    def ledger(self):
        try:
            data = json.loads((ROOT / 'proddb/dss/ledger.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return None
        items = list(data['items'].values())
        full = [r for r in data['runs'] if not r.get('scope')]
        by = {}
        for item in items:
            by[item['status']] = by.get(item['status'], 0) + 1
        kinds = {}
        for item in items:
            if item.get('status') != 'deleted' and not item.get('deleted_at'):
                kinds[item.get('kind') or 'device'] = kinds.get(item.get('kind') or 'device', 0) + 1
        return {'runs': [{'run_id': r['run_id'], 'run_at': r['run_at'], 'scope': r.get('scope'), 'counts': {k: v for k, v in r.get('counts', {}).items() if k != 'by_kind'}} for r in data['runs'][-5:]],
                'last_full_run': full[-1]['run_id'] if full else None, 'last_full_run_at': full[-1]['run_at'] if full else None, 'items': len(items), 'by_status': by,
                'pending_deletions': sum(1 for i in items if i['status'] == 'deprecated' and not i.get('deleted_at')), 'deleted': sum(1 for i in items if i.get('deleted_at')),
                'by_kind': kinds, 'kinds': self.kind_meta()}

    # ── DSS 종류(수집한 뒤 LLM 이 판정 — proddb/build/dss/classify.py · proddb/dss/kinds.json) ──
    def kind_doc(self):
        try:
            return json.loads((ROOT / 'proddb/dss/kinds.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return None

    def kind_meta(self):
        doc = self.kind_doc()
        if not doc:
            return None
        items = doc.get('items') or {}
        return {'model': doc.get('model'), 'at': doc.get('updated_at'), 'run': doc.get('run'), 'items': len(items),
                'review': sum(1 for x in items.values() if x.get('review') or x.get('by') == 'rule'),
                'llm': sum(1 for x in items.values() if x.get('by') == 'llm'), 'manual': sum(1 for x in items.values() if x.get('by') == 'manual'),
                'moved': sum(1 for x in items.values() if x.get('rule') and x.get('kind') != x.get('rule'))}

    def kind_items(self, kind):
        """원장의 그 종류 항목(지운 것 빼고) + 판정 기록(확신 · 근거 · 판정한 것 · 지난 규칙 · 다시 볼 것 · 같은 앱 솔루션)"""
        try:
            data = json.loads((ROOT / 'proddb/dss/ledger.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return []
        decisions = (self.kind_doc() or {}).get('items') or {}
        out = []
        for key, item in data['items'].items():
            if (item.get('kind') or 'device') != kind or item.get('status') == 'deleted' or item.get('deleted_at'):
                continue
            d = decisions.get(item.get('id')) if item.get('registry') in ('products_db.products', 'catalog.products') else None
            out.append({'key': key, 'id': item.get('id'), 'name': item.get('name'), 'registry': item.get('registry'), 'status': item.get('status'),
                        'family': (item.get('family') or {}).get('sc') or (item.get('family') or {}).get('cat'),
                        **({'by': d.get('by'), 'conf': d.get('conf'), 'why': d.get('why'), 'rule': d.get('rule'), 'review': bool(d.get('review') or d.get('by') == 'rule'),
                            **({'same': d['same']} if d.get('same') else {})} if d else {'by': 'registry'})})
        out.sort(key=lambda x: (not x.get('review'), x.get('rule') == kind if x.get('rule') else True, x.get('registry') or '', x.get('name') or ''))
        return out

    def overview(self):
        latest = self.latest()
        settings = self.store.setting('dss_agent') or {}
        active = self.store.rows("SELECT id,kind,status,stage,progress,created_at FROM jobs WHERE kind LIKE 'dss-%' AND status IN ('queued','running') ORDER BY created_at")
        return {'channels': [{'id': cid, **meta, 'latest': latest.get(cid)} for cid, meta in CHANNELS.items()],
                'schedule': {**self.schedule(), 'next': self.next_run(), 'last': self.store.setting('dss_last_scheduled')},
                'ledger': self.ledger(), 'agent': {'provider': settings.get('provider'), 'model': settings.get('model'), 'git': git_mode()}, 'active': active,
                'checks': [{**r, 'channels': json.loads(r['channels'])} for r in self.store.rows('SELECT id,at,trigger,job_id,status,changed,channels FROM dss_checks ORDER BY at DESC LIMIT 14')],
                'runs': [{**r, 'result': json.loads(r['result'] or '{}'), 'input': json.loads(r['input'] or '{}')} for r in self.store.rows('SELECT * FROM dss_runs ORDER BY at DESC LIMIT 12')]}

    # ── 자식 프로세스 ──
    def spawn(self, command, log, cancel, on_line, timeout=7200):
        with open(log, 'a', encoding='utf-8') as stream:
            process = subprocess.Popen(command, cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                       env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUNBUFFERED': '1'}, start_new_session=True)
            started, stop = time.monotonic(), {'why': None}

            def watchdog():
                while process.poll() is None:
                    if cancel() or time.monotonic() - started > timeout:
                        stop['why'] = 'cancel' if cancel() else 'timeout'
                        try:
                            os.killpg(process.pid, signal.SIGTERM)
                            time.sleep(5)
                            if process.poll() is None:
                                os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        return
                    time.sleep(0.5)
            threading.Thread(target=watchdog, daemon=True).start()
            for line in process.stdout:
                stream.write(line)
                stream.flush()
                found = re.match(r'@@progress (\d+) (.*)', line)
                if found:
                    on_line(int(found.group(1)), found.group(2).strip())
            code = process.wait()
        if stop['why'] == 'cancel':
            raise Cancelled()
        if stop['why'] == 'timeout':
            raise EngineError(f'{timeout // 60}분 안에 끝나지 않아 중단했습니다.')
        return code

    # ── 점검 ──
    def run_check(self, jid, extra, progress, cancel):
        channels = [c for c in (extra.get('channels') or list(CHANNELS)) if c in CHANNELS] or list(CHANNELS)
        with self.stamps:  # 소스별 점검이 동시에 시작해도 폴더 · 기록 ID 가 겹치지 않게
            base = stamp = self.clock().strftime('%Y%m%d-%H%M%S')
            n = 1
            while (self.staging / stamp).exists() or self.store.one('SELECT id FROM dss_checks WHERE id=?', (stamp,)):
                n += 1
                stamp = f'{base}-{n}'
            out = self.staging / stamp
            out.mkdir(parents=True)
        # 빠른 채널부터, 15분쯤 걸리는 사이트 수집은 마지막에
        order = [c for c in ('ecat', 'solutions', 'subs', 'site') if c in channels]
        progress('원천 소스 점검 시작', 2)
        command = [sys.executable, '-B', str(TOOLS / 'watch.py'), '--out', str(out), '--channels', ','.join(order), '--die-with-parent']
        links = self.service.origins.watch_links()  # 데이터 소스에 관리자가 넣은 리소스 링크(바뀐 e-카탈로그 주소 등)도 함께 대조한다
        if links:
            (out / 'links.json').write_text(dump(links), encoding='utf-8')
            command += ['--links', str(out / 'links.json')]
        code = self.spawn(command, out / 'watch.log', cancel, lambda pct, text: progress(text, max(2, min(98, pct))), timeout=5400)
        try:
            result = json.loads((out / 'watch.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            raise EngineError('점검 결과를 읽지 못했습니다. 작업 폴더의 watch.log 를 확인해 주세요: ' + rel(out)) from None
        check_id = stamp
        with self.store.db() as db:
            db.execute('INSERT OR REPLACE INTO dss_checks VALUES (?,?,?,?,?,?,?,?,?)', (check_id, now(), extra.get('trigger', 'manual'), jid, result.get('status', 'failed'),
                       int(bool(result.get('changed'))), dump(order), dump(result), rel(out)))
        self.prune()
        # 데이터 소스 화면의 최신성 판정도 같은 결과로 맞춘다(도입사례 목록 · 넣은 링크까지 확인)
        self.service.origins.after_channels(list(result.get('channels') or {}), cancel, lambda text: progress(text, 99))
        summary = {c: {'status': v['status'], 'summary': v['summary']} for c, v in result['channels'].items()}
        if code not in (0, 2):
            raise EngineError('점검 도구가 비정상 종료했습니다(코드 %s).' % code)
        return {'check_id': check_id, 'status': result.get('status'), 'changed': bool(result.get('changed')), 'channels': summary, 'path': rel(out)}

    def prune(self):
        rows = self.store.rows('SELECT id,path FROM dss_checks ORDER BY at DESC')
        for row in rows[KEEP_STAGED:]:
            path = (ROOT / row['path']).resolve() if row['path'] else None
            if path and path.is_dir() and path.is_relative_to(self.staging.resolve()):
                shutil.rmtree(path, ignore_errors=True)

    # ── 업데이트(코드 에이전트) ──
    def provider(self):
        settings = self.store.setting('dss_agent') or {}
        connected = [a['id'] for a in self.agents.overview() if a['connected']]
        chosen = settings.get('provider') if settings.get('provider') in connected else (connected[0] if connected else None)
        if not chosen:
            raise EngineError('연결된 코드 에이전트가 없습니다. 먼저 에이전트 계정을 연결해 주세요.')
        return chosen, settings.get('model') or None

    def staged_watch(self, channel):
        for row in self.store.rows('SELECT at,path,result FROM dss_checks ORDER BY at DESC LIMIT 10'):
            if channel in (json.loads(row['result']).get('channels') or {}) and row['path'] and (ROOT / row['path'] / 'watch.json').is_file():
                return {'path': row['path'], 'at': row['at']}
        return None

    def run_agent(self, jid, extra, progress, cancel, actor):
        kind, channel = extra.get('run', 'update'), extra.get('channel')
        provider, model = self.provider()
        if kind == 'update':
            if channel not in CHANNELS:
                raise EngineError('업데이트할 채널을 골라 주세요.')
            prompt = update_prompt(channel, self.staged_watch(channel))
        else:
            keys = self.valid_keys(extra.get('ids') or [])
            prompt = cascade_prompt(keys)
        run_id = self.clock().strftime('%Y%m%d-%H%M%S') + '-' + (channel or kind)
        directory = self.home / 'runs' / run_id
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'prompt.txt').write_text(prompt, encoding='utf-8')
        with self.store.db() as db:
            db.execute('INSERT INTO dss_runs(id,at,kind,channel,provider,actor,job_id,status,input) VALUES (?,?,?,?,?,?,?,?,?)',
                       (run_id, now(), kind, channel, provider, actor, jid, 'running', dump({'model': model, 'git': git_mode(), 'ids': extra.get('ids')})))
        progress(f'{PROVIDERS[provider]["name"]} 실행 중', 5)
        state = {'n': 0}

        def on_event(line):
            state['n'] += 1
            if line.startswith(('[에이전트]', '[도구]')):
                progress(re.sub(r'\s+', ' ', line)[:110], min(95, 5 + state['n'] // 8))
        status, result = 'failed', {}
        try:
            code, final, usage = self.agents.run(provider, prompt, directory, cancel, on_event, model, git_mode())
            if cancel():
                status = 'cancelled'
                raise Cancelled()
            found = re.findall(r'@@result\s*(\{.*\})', final.get('text') or '')
            parsed = None
            if found:
                try:
                    parsed = json.loads(found[-1])
                except ValueError:
                    parsed = None
            result = {'exit': code, 'usage': usage, 'summary': parsed, 'error': final.get('error'), 'answer': (final.get('text') or '')[-3000:]}
            if code or final.get('error'):
                raise EngineError('에이전트 실행이 실패했습니다: ' + (final.get('error') or f'종료 코드 {code}') + ' — 실행 기록에서 로그를 확인해 주세요.')
            if parsed is None:
                raise EngineError('에이전트가 결과 줄(@@result)을 남기지 않고 끝났습니다. 실행 기록의 로그로 어디까지 진행했는지 확인해 주세요.')
            status = 'succeeded'
            return {'run_id': run_id, 'provider': provider, 'channel': channel, **result}
        finally:
            with self.store.db() as db:
                db.execute('UPDATE dss_runs SET status=?,finished_at=?,result=? WHERE id=?', (status, now(), dump(result), run_id))

    # ── 삭제 후보 · 삭제 ──
    def candidates(self):
        tool = TOOLS / 'deletions.py'
        if not tool.is_file():
            raise EngineError('삭제 도구(proddb/build/dss/deletions.py)를 찾지 못했습니다.')
        done = subprocess.run([sys.executable, '-B', str(tool), 'list'], cwd=str(ROOT), capture_output=True, text=True, timeout=300)
        if done.returncode:
            raise EngineError('삭제 후보를 읽지 못했습니다: ' + (done.stderr or done.stdout)[-300:])
        try:
            return json.loads(done.stdout)
        except ValueError:
            raise EngineError('삭제 후보 목록 형식이 올바르지 않습니다.') from None

    def valid_keys(self, ids):
        known = {c['key']: c for c in self.candidates()['candidates']}
        missing = [i for i in ids if i not in known]
        if not ids or missing:
            raise EngineError('삭제 후보가 아닌 항목이 들어 있습니다: ' + ', '.join(missing[:5]) if missing else '삭제할 항목을 골라 주세요.')
        return list(dict.fromkeys(ids))

    def run_delete(self, jid, extra, progress, cancel, actor):
        keys = self.valid_keys(extra.get('ids') or [])
        run_id = self.clock().strftime('%Y%m%d-%H%M%S') + '-delete'
        directory = self.home / 'runs' / run_id
        directory.mkdir(parents=True, exist_ok=True)
        report = directory / 'report.json'
        with self.store.db() as db:
            db.execute('INSERT INTO dss_runs(id,at,kind,channel,provider,actor,job_id,status,input) VALUES (?,?,?,?,?,?,?,?,?)',
                       (run_id, now(), 'delete', None, None, actor, jid, 'running', dump({'ids': keys})))
        status, result = 'failed', {}
        try:
            progress(f'삭제 대상 {len(keys)}개 확인', 3)
            code = self.spawn([sys.executable, '-B', str(TOOLS / 'deletions.py'), 'apply', '--ids', ','.join(keys), '--by', actor, '--report', str(report)],
                              directory / 'agent.log', cancel, lambda pct, text: progress(text, max(3, min(98, pct))), timeout=5400)
            try:
                result = json.loads(report.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                result = {}
            if code == 3:
                raise EngineError('연관 자료에 남은 글 때문에 지금은 삭제할 수 없습니다. 삭제 후보 화면에서 「연관 글 정리」를 먼저 실행해 주세요.')
            if code:
                raise EngineError('삭제를 끝내지 못해 모든 파일을 실행 전 상태로 되돌렸습니다. 실행 기록에서 로그를 확인해 주세요.')
            status = 'succeeded'
            self.store.event('dss.delete', run_id, {'ids': keys}, actor)
            return {'run_id': run_id, 'deleted': keys, 'report': result}
        finally:
            with self.store.db() as db:
                db.execute('UPDATE dss_runs SET status=?,finished_at=?,result=? WHERE id=?', (status, now(), dump(result), run_id))

    def run(self, jid, kind, extra, progress, cancel, actor):
        if kind == 'dss-check':
            return self.run_check(jid, extra, progress, cancel)
        if kind == 'dss-update':
            return self.run_agent(jid, extra, progress, cancel, actor)
        if kind == 'dss-delete':
            return self.run_delete(jid, extra, progress, cancel, actor)
        raise EngineError('지원하지 않는 작업입니다.')

    def run_log(self, run_id, offset=0):
        if not re.fullmatch(r'[\w.-]+', run_id):
            raise HTTPException(400, '실행 기록 ID 가 올바르지 않습니다.')
        path = self.home / 'runs' / run_id / 'agent.log'
        if not path.is_file():
            return {'text': '', 'offset': 0, 'size': 0}
        from app.api.poc.provider import redact
        size = path.stat().st_size
        with path.open('rb') as stream:
            stream.seek(min(offset, size) if offset else max(0, size - 24000))
            start = stream.tell()
            data = stream.read(64000)
        return {'text': redact(data.decode('utf-8', 'replace')), 'offset': start + len(data), 'size': size}


class CheckInput(BaseModel):
    channels: list[str] | None = Field(default=None, max_length=8)


class ScheduleInput(BaseModel):
    enabled: bool | None = None
    time: str | None = Field(default=None, pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    channels: list[str] | None = Field(default=None, max_length=8)


class AgentInput(BaseModel):
    provider: str | None = Field(default=None, max_length=20)
    model: str | None = Field(default=None, max_length=80)


class ProviderInput(BaseModel):
    provider: str = Field(max_length=20)


class CodeInput(BaseModel):
    code: str = Field(min_length=1, max_length=600)


class UpdateInput(BaseModel):
    channel: str = Field(max_length=20)


class DeleteInput(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=200)
    confirm: bool = False
    expected: int | None = None


def dss_router(get, actor):
    """get(): 현재 서비스의 Dss, actor(): 현재 요청의 관리자 아이디."""
    router = APIRouter(prefix='/api/dss')

    def guard(call):
        try:
            return call()
        except AgentError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.get('')
    def overview():
        dss = get()
        return dss.overview()

    @router.get('/kinds')
    def kind_summary():
        dss = get()
        led = dss.ledger() or {}
        return {'by_kind': led.get('by_kind') or {}, 'meta': led.get('kinds')}

    @router.get('/kinds/{kind}')
    def kinds(kind: str):
        if kind not in ('device', 'solution', 'service', 'subscription'):
            raise HTTPException(404, '없는 종류입니다.')
        return {'kind': kind, 'items': get().kind_items(kind)}

    @router.post('/check')
    def check(body: CheckInput):
        dss = get()
        channels = [c for c in (body.channels or list(CHANNELS)) if c in CHANNELS]
        if not channels:
            raise HTTPException(422, '점검할 채널을 골라 주세요.')
        return dss.service.submit('dss-check', None, {'trigger': 'manual', 'channels': channels}, actor=actor())

    @router.get('/checks/{check_id}')
    def check_detail(check_id: str):
        dss = get()
        row = dss.store.one('SELECT * FROM dss_checks WHERE id=?', (check_id,))
        if not row:
            raise HTTPException(404, '점검 기록을 찾지 못했습니다.')
        row['result'] = json.loads(row['result'])
        row['channels'] = json.loads(row['channels'])
        return row

    @router.patch('/schedule')
    def schedule(body: ScheduleInput):
        dss = get()
        value = dss.schedule()
        if body.enabled is not None:
            value['enabled'] = body.enabled
        if body.time is not None:
            value['time'] = body.time  # 오늘 이미 자동 점검을 했으면 새 시각은 내일부터 적용된다
        if body.channels is not None:
            channels = [c for c in body.channels if c in CHANNELS]
            if not channels:
                raise HTTPException(422, '자동 점검할 채널을 하나 이상 골라 주세요.')
            value['channels'] = channels
        dss.store.set_setting('dss_schedule', value)
        dss.store.event('dss.schedule', 'dss', value, actor())
        return {**value, 'next': dss.next_run()}

    @router.get('/agent')
    def agent():
        dss = get()
        settings = dss.store.setting('dss_agent') or {}
        return {'providers': dss.agents.overview(), 'selected': settings.get('provider'), 'model': settings.get('model'), 'git': git_mode()}

    @router.patch('/agent')
    def agent_settings(body: AgentInput):
        dss = get()
        value = dss.store.setting('dss_agent') or {}
        if body.provider is not None:
            if body.provider not in PROVIDERS:
                raise HTTPException(422, '지원하지 않는 에이전트입니다.')
            value['provider'] = body.provider
        if body.model is not None:
            if body.model and not re.fullmatch(r'[\w.:\-\[\]]{1,80}', body.model):
                raise HTTPException(422, '모델 이름이 올바르지 않습니다.')
            value['model'] = body.model
        dss.store.set_setting('dss_agent', value)
        return value

    @router.post('/agent/login')
    def login(body: ProviderInput):
        dss = get()
        result = guard(lambda: dss.agents.login_start(body.provider))
        dss.store.event('dss.agent.login', body.provider, {}, actor())
        return result

    @router.get('/agent/login/{session}')
    def login_state(session: str):
        dss = get()
        return guard(lambda: dss.agents.login_get(session).public())

    @router.post('/agent/login/{session}')
    def login_code(session: str, body: CodeInput):
        dss = get()
        def submit():
            item = dss.agents.login_get(session)
            item.submit(body.code)
            return item.public()
        return guard(submit)

    @router.delete('/agent/login/{session}')
    def login_cancel(session: str):
        dss = get()
        def cancel():
            item = dss.agents.login_get(session)
            item.stop('cancelled')
            return item.public()
        return guard(cancel)

    @router.post('/agent/logout')
    def logout(body: ProviderInput):
        dss = get()
        result = guard(lambda: dss.agents.logout(body.provider))
        dss.store.event('dss.agent.logout', body.provider, {}, actor())
        return result

    @router.get('/prompts')
    def prompts():
        dss = get()
        return {'git': git_mode(), 'channels': [{'id': cid, 'name': meta['name'], 'prompt': update_prompt(cid, dss.staged_watch(cid))} for cid, meta in CHANNELS.items()],
                'cascade': cascade_prompt(['<삭제 후보의 원장 키>'])}

    @router.post('/update')
    def update(body: UpdateInput):
        dss = get()
        if body.channel not in CHANNELS:
            raise HTTPException(422, '업데이트할 채널을 골라 주세요.')
        dss.provider()
        return dss.service.submit('dss-update', None, {'run': 'update', 'channel': body.channel}, actor=actor())

    @router.get('/runs/{run_id}/log')
    def run_log(run_id: str, offset: int = Query(0, ge=0)):
        dss = get()
        return dss.run_log(run_id, offset)

    @router.get('/runs/{run_id}')
    def run_detail(run_id: str):
        dss = get()
        row = dss.store.one('SELECT * FROM dss_runs WHERE id=?', (run_id,))
        if not row:
            raise HTTPException(404, '실행 기록을 찾지 못했습니다.')
        row['result'], row['input'] = json.loads(row['result'] or '{}'), json.loads(row['input'] or '{}')
        prompt = dss.home / 'runs' / run_id / 'prompt.txt'
        row['prompt'] = prompt.read_text(encoding='utf-8') if prompt.is_file() else None
        return row

    @router.get('/deletions')
    def deletions():
        dss = get()
        return dss.candidates()

    @router.post('/deletions')
    def delete(body: DeleteInput):
        dss = get()
        if not body.confirm or body.expected != len(set(body.ids)):
            raise HTTPException(422, '삭제할 항목을 확인한 뒤 다시 실행해 주세요.')
        keys = dss.valid_keys(body.ids)
        chosen = [c for c in dss.candidates()['candidates'] if c['key'] in keys]
        blocked = [c['key'] for c in chosen if c.get('blocked')]
        if blocked:
            raise HTTPException(409, '연관 자료를 먼저 정리해야 하는 항목이 있습니다: ' + ', '.join(blocked[:5]))
        # 다른 후보의 대체 제품으로 지목된 항목은 그 후보와 함께 지워야 대체 연결이 끊기지 않는다
        missing = sorted({k for c in chosen for k in c.get('depends_on') or [] if k not in keys})
        if missing:
            raise HTTPException(409, '함께 삭제해야 하는 항목이 빠졌습니다: ' + ', '.join(missing[:5]))
        return dss.service.submit('dss-delete', None, {'ids': keys}, actor=actor())

    @router.post('/deletions/prepare')
    def prepare(body: DeleteInput):
        dss = get()
        keys = dss.valid_keys(body.ids)
        dss.provider()
        return dss.service.submit('dss-update', None, {'run': 'cascade', 'ids': keys}, actor=actor())

    return router
