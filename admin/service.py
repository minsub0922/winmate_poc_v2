from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import sqlite3
import threading
import uuid
from contextvars import copy_context

from .config import ROOT
from .engine import Cancelled, EngineError, analyze, extract, fetch, probe
from .inventory import diagnostics, index_repository, read
from .refresh import catalog_refresh, custom_refresh, rollback, samsung_refresh, save_release
from .store import Store, digest, dump, now


class Service:
    def __init__(self, home):
        self.store = Store(home)
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='winmate-admin')
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.thread = None

    def start(self):
        with self.store.db() as db:
            db.execute("UPDATE jobs SET status='interrupted',finished_at=?,error='서버가 재시작되었습니다. 다시 실행해 주세요.' WHERE status IN ('queued','running')", (now(),))
        if not self.store.setting('indexed_at'):
            index_repository(self.store)
        self.thread = threading.Thread(target=self.schedule_loop, daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        with self.store.db() as db:
            db.execute("UPDATE jobs SET cancelled=1 WHERE status IN ('queued','running')")
        self.pool.shutdown(wait=True, cancel_futures=True)
        if self.thread:
            self.thread.join(timeout=2)

    def schedule_loop(self):
        while not self.stop.wait(30):
            try:
                if not self.store.setting('automatic_checks', False):
                    continue
                for source in self.store.rows("SELECT * FROM sources WHERE enabled=1 AND kind NOT IN ('local','custom')"):
                    checked = source.get('checked_at')
                    due = not checked or datetime.fromisoformat(checked) + timedelta(days=source['interval_days']) <= datetime.now(timezone.utc)
                    if due:
                        try:
                            self.submit('check', source['id'], actor='scheduler')
                        except EngineError:
                            pass
            except Exception as exc:
                try:
                    self.store.event('scheduler.error', detail={'error': self.safe_error(exc)}, actor='scheduler')
                except sqlite3.Error:
                    pass

    def submit(self, kind, source_id=None, extra=None, actor='admin'):
        if kind not in ('check', 'refresh', 'reindex', 'diagnose', 'analyze', 'backup', 'rollback'):
            raise EngineError('지원하지 않는 작업입니다.')
        if source_id and not self.store.source(source_id):
            raise EngineError('소스를 찾지 못했습니다.')
        if source_id and not self.store.source(source_id)['enabled']:
            raise EngineError('사용 중지한 소스입니다. 소스 설정에서 다시 켜 주세요.')
        with self.lock:
            if kind == 'analyze':
                existing = self.store.one("SELECT id FROM jobs WHERE kind='analyze' AND json_extract(result,'$.input.asset_id')=? AND status IN ('queued','running')", ((extra or {}).get('asset_id'),))
                if existing:
                    return self.store.job(existing['id'])
            running = self.store.one("SELECT id FROM jobs WHERE kind=? AND COALESCE(source_id,'')=? AND status IN ('queued','running')", (kind, source_id or ''))
            if running and kind not in ('analyze', 'rollback'):
                return self.store.job(running['id'])
            if self.store.one("SELECT count(*) n FROM jobs WHERE status IN ('queued','running')")['n'] >= 12:
                raise EngineError('대기 작업이 많습니다. 완료 후 다시 실행해 주세요.')
            jid = self.store.new_job(kind, source_id, extra)
            self.store.event('job.' + kind, jid, {'source_id': source_id}, actor)
            from app.api import telemetry
            context=copy_context()
            def work():
                with telemetry.scope(username=actor,feature='admin.'+kind,job_id=jid,parent_id=telemetry.current().get('span_id'),span_id='admin-job-'+jid):
                    return self.run(jid,kind,source_id,extra or {},actor)
            self.pool.submit(context.run, work)
            return self.store.job(jid)

    def run(self, jid, kind, sid, extra, actor):
        store = self.store
        cancel = lambda: self.stop.is_set() or store.cancelled(jid)
        progress = lambda stage, n: store.progress(jid, stage, n)
        completed_sources = []
        try:
            if cancel():
                raise Cancelled()
            progress('작업 준비', 1)
            if kind == 'reindex':
                result = index_repository(store, progress=progress)
            elif kind == 'diagnose':
                progress('DB 무결성 · 자산 참조 · Agent KB 확인', 30)
                result = diagnostics(store)
                store.set_setting('diagnostics', result)
            elif kind == 'backup':
                directory = store.home / 'backups'
                directory.mkdir(exist_ok=True)
                database = extra.get('database', 'admin')
                paths = {'admin': store.path, 'source': ROOT / 'proddb/winmate_products.sqlite', 'runtime': ROOT / 'app/data/runtime/winmate_products.sqlite', 'operations': store.home / 'operations.sqlite'}
                if database not in paths or not paths[database].is_file():
                    raise EngineError('백업할 DB를 찾지 못했습니다.')
                filename = database + '-' + now().replace(':', '-').replace('+', '-') + '.sqlite'
                target = directory / filename
                target.touch(mode=0o600,exist_ok=False)
                with sqlite3.connect(f'file:{paths[database]}?mode=ro', uri=True) as source, sqlite3.connect(target) as dest:
                    source.backup(dest)
                    if dest.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                        raise EngineError('백업 검증에 실패했습니다.')
                target.chmod(0o600)
                result = {'filename': filename, 'bytes': target.stat().st_size, 'download': '/admin/api/backups/' + filename,
                          'scope': database + ' SQLite의 일관된 사본. 연결된 원본 파일은 별도 에셋 내보내기에서 제공.'}
            elif kind == 'rollback':
                progress('현재 변경과 복구본 대조', 20)
                result = rollback(store, extra['release_id'])
            elif kind == 'analyze':
                result = self.analyze_asset(extra['asset_id'], progress, cancel)
            else:
                sources = [store.source(sid)] if sid else store.rows("SELECT * FROM sources WHERE enabled=1 AND kind NOT IN ('local','custom')")
                results, errors = [], []
                for source in sources:
                    if cancel():
                        raise Cancelled()
                    try:
                        result = self.check(source, progress, cancel) if kind == 'check' else self.refresh(source, progress, cancel, jid)
                        results.append({'source_id': source['id'], **result})
                        completed_sources = list(results)
                    except Cancelled:
                        raise
                    except Exception as exc:
                        error = self.safe_error(exc)
                        with store.db() as db:
                            db.execute("UPDATE sources SET status='error',error=?,checked_at=? WHERE id=?", (error, now(), source['id']))
                        errors.append({'source_id': source['id'], 'error': error})
                result = {'sources': results, 'errors': errors}
                if errors:
                    store.finish(jid, result, 'partial' if results else 'failed', '일부 원본을 확인하지 못했습니다.' if results else errors[0]['error'])
                    store.event('job.completed', jid, {'status': 'partial' if results else 'failed'}, actor)
                    return
            store.finish(jid, result)
            store.event('job.completed', jid, {'status': 'succeeded'}, actor)
        except Cancelled:
            message = f'작업을 취소했습니다. 이미 완료한 {len(completed_sources)}개 소스의 결과는 유지됩니다.' if completed_sources else '작업을 취소했습니다. 반영 전 자료는 작업 폴더에 보존됩니다.'
            store.finish(jid, {'sources': completed_sources}, 'cancelled', message)
        except Exception as exc:
            error = self.safe_error(exc)
            store.finish(jid, {}, 'failed', error)
            if kind == 'analyze':
                with store.db() as db:
                    db.execute("UPDATE assets SET status='analysis_failed' WHERE id=?", (extra.get('asset_id'),))
            store.event('job.failed', jid, {'error': error}, actor)

    @staticmethod
    def safe_error(exc):
        from app.api.poc.provider import redact
        return redact(str(exc))[:700] or type(exc).__name__

    def check(self, source, progress, cancel):
        evidence, decision = probe(source, self.store, progress, cancel)
        if cancel():
            raise Cancelled()
        sid = source['id']
        with self.store.db() as db:
            db.execute('UPDATE sources SET checked_at=?,status=?,decision=?,error=NULL WHERE id=?', (now(), decision['status'], dump(decision), sid))
        return {'decision': decision, 'evidence': evidence}

    def refresh(self, source, progress, cancel, jid):
        if source['kind'] == 'local':
            return {'indexed': index_repository(self.store, progress=progress), 'scope': 'repository-index'}
        directory = self.store.home / 'releases' / (jid + '-' + source['id'])
        directory.mkdir(parents=True, exist_ok=False)
        progress('원본 보존 · 별도 작업 공간 준비', 5)
        if source['id'] == 'samsung':
            assets, summary, decision, missing = samsung_refresh(self.store, directory, progress, cancel)
        elif source['id'] == 'catalogs':
            assets, summary, decision, missing = catalog_refresh(self.store, source, directory, progress, cancel)
        else:
            assets, summary, decision, missing = custom_refresh(self.store, source, directory, progress, cancel)
        progress('변경 사항 검증 · 복구본 저장', 90)
        if cancel():
            raise Cancelled()
        release = save_release(self.store, source['id'], assets, summary, decision, missing, directory)
        progress('관리 DB 반영 완료', 98)
        return {'release': release}

    def add_upload(self, body, filename, mime, title=None):
        key = digest(body)
        aid = 'upload:' + key
        old = self.store.one('SELECT id FROM assets WHERE id=?', (aid,))
        if old:
            return aid, True
        directory = self.store.home / 'uploads'
        directory.mkdir(exist_ok=True)
        safe = Path(filename).name
        suffix = Path(safe).suffix.lower()
        if suffix not in ('.pdf', '.pptx', '.docx', '.txt', '.md', '.csv', '.json', '.html', '.png', '.jpg', '.jpeg', '.webp'):
            raise EngineError('PDF, PPTX, DOCX, 텍스트, JSON, CSV 또는 이미지를 추가해 주세요.')
        _, image_type = extract(body, safe, mime)  # Validate before persisting the file.
        path = directory / (key + suffix)
        path.write_bytes(body)
        self.store.upsert_assets([{'id': aid, 'external_id': key, 'source_id': 'uploads', 'kind': 'image' if image_type else 'document',
            'title': title or safe, 'payload': {'filename': safe, 'mime': mime, 'bytes': len(body), 'file_ref': str(path.relative_to(self.store.home)), 'scope': 'admin-managed'},
            'path': str(path.relative_to(self.store.home)), 'content': '', 'status': 'pending', 'imported_at': now()}])
        return aid, False

    def add_url_asset(self, url, title=None):
        from .engine import checked_url
        url, _, _ = checked_url(url)
        aid = 'url:' + digest(url)
        if self.store.one('SELECT id FROM assets WHERE id=?', (aid,)):
            return aid, True
        self.store.upsert_assets([{'id': aid, 'source_id': 'uploads', 'kind': 'document', 'title': title or urlsplit_name(url), 'url': url,
            'payload': {'scope': 'admin-managed'}, 'content': '', 'status': 'pending', 'imported_at': now()}])
        return aid, False

    def analyze_asset(self, aid, progress, cancel):
        asset = self.store.one("SELECT * FROM assets WHERE id=? AND source_id='uploads'", (aid,))
        if not asset:
            raise EngineError('분석할 추가 자료를 찾지 못했습니다.')
        payload = json.loads(asset['payload'])
        progress('원문 추출', 15)
        if payload.get('file_ref'):
            path = (self.store.home / payload['file_ref']).resolve()
            if not path.is_relative_to((self.store.home / 'uploads').resolve()):
                raise EngineError('자료 경로가 올바르지 않습니다.')
            body, mime, name = path.read_bytes(), payload.get('mime', ''), payload.get('filename', path.name)
        else:
            response = fetch(asset['url'], cancel=cancel)
            body, mime = response['body'], response['type']
            name = urlsplit_name(asset['url'])
            path = self.store.home / 'uploads' / (digest(body) + '.source')
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(body)
            payload.update({'file_ref': str(path.relative_to(self.store.home)), 'filename': name, 'mime': mime, 'bytes': len(body)})
        blocks, image_type = extract(body, name, mime)
        progress('AI가 사실 · 모델 · 인용 근거 추출', 50)
        analysis = analyze(blocks, cancel, (body, image_type) if image_type else None)
        if cancel():
            raise Cancelled()
        payload.update({'analysis': analysis, 'blocks': blocks})
        records = [{**asset, 'title': analysis['title'], 'payload': payload, 'content': '\n'.join(b['text'] for b in blocks) + '\n' + dump(analysis), 'status': 'indexed'}]
        records.extend(extracted_assets(asset, analysis))
        self.store.upsert_assets(records, analyzed_parent=aid)
        return {'asset_id': aid, 'title': analysis['title'], 'entities': len(analysis['entities']), 'engine': analysis['engine'], 'scope': 'admin-managed'}


def urlsplit_name(url):
    from urllib.parse import urlsplit
    return Path(urlsplit(url).path).name or 'page.html'


def extracted_assets(parent, analysis):
    result = {}
    for entity in analysis['entities']:
        key = digest({'parent': parent['id'], 'kind': entity['kind'], 'name': entity['name'], 'model': entity.get('model')})[:28]
        payload = {**entity, 'parent_asset_id': parent['id'], 'scope': 'supplemental', 'engine': analysis['engine']}
        result[key] = {'id': 'extracted:' + key, 'external_id': entity.get('model') or key, 'source_id': parent['source_id'],
                       'kind': entity['kind'], 'title': entity['name'], 'url': parent.get('url'),
                       'content': dump(entity), 'payload': payload, 'imported_at': parent.get('imported_at')}
    return list(result.values())
