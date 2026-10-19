"""Server-owned background jobs.

* Each job runs on a server thread (bounded by a worker semaphore), so it survives browser tab
  navigation; clients follow it by polling (``since=N``) or SSE.
* Events carry a monotonically increasing ``seq`` per job. The event buffer is bounded; a client that
  falls behind is told the first retained ``seq`` (``truncated``).
* Only terminal jobs (done / error / cancelled) are evicted. Jobs left waiting for an answer longer
  than ``waiting_ttl`` are cancelled (reason ``expired``) so memory stays bounded.
* Cancellation is cooperative: adapters call :meth:`Job.check_cancel` between steps.
* ``resume`` is serialized by the job lock: only a job in ``waiting`` with no running thread may
  resume; every other call raises :class:`Conflict` (HTTP 409).
* Restart durability is not provided (in-memory).
"""
from __future__ import annotations

import logging
import threading
import time
import traceback
import uuid
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable, Deque, Dict, List, Optional

from .provider import redact

log = logging.getLogger('winmate.poc.jobs')
TERMINAL = ('done', 'error', 'cancelled')
KINDS = ('rfp', 'layout', 'storyboard', 'review')


class JobCancelled(Exception):
    """Raised inside a job thread when cancellation was requested. Not a subclass of any PoC error."""


class Conflict(Exception):
    pass


class NotFound(Exception):
    pass


class BadRequest(Exception):
    def __init__(self, message: str, code: str = 'bad_request') -> None:
        super().__init__(message)
        self.code = code


class Unavailable(Exception):
    def __init__(self, message: str, code: str = 'unavailable') -> None:
        super().__init__(message)
        self.code = code


@dataclass
class Waiting:
    """Returned by a job function that paused for user input."""
    payload: dict
    partial: Optional[dict] = None


class Job:
    def __init__(self, kind: str, title: str, params: dict, max_events: int) -> None:
        self.id = uuid.uuid4().hex[:16]
        self.kind, self.title, self.params = kind, title, params
        self.status = 'queued'
        self.created = time.time()
        self.started = 0.0
        self.finished = 0.0
        self.updated = self.created
        self.result: Any = None
        self.partial: Any = None
        self.waiting: Optional[dict] = None
        self.error: Optional[dict] = None
        self.modes: Optional[dict] = None
        self.ctx: Dict[str, Any] = {}           # adapter-private state (graph, kb view, ...) — never serialized
        self.cancel_event = threading.Event()
        self.lock = threading.RLock()
        self.busy = False
        self._cond = threading.Condition(threading.Lock())
        self._events: Deque[dict] = deque(maxlen=max_events)
        self._seq = 0

    # ------------------------------------------------------------ events
    def emit(self, type_: str, **data: Any) -> dict:
        with self._cond:
            self._seq += 1
            ev = {'seq': self._seq, 'type': type_, 't': round(time.time() - (self.started or self.created), 2), **data}
            self._events.append(ev)
            self.updated = time.time()
            self._cond.notify_all()
            return ev

    def log(self, message: str, level: str = 'info') -> None:
        self.emit('text', message=redact(message)[:2000], level=level)

    def _state(self) -> None:
        self.emit('state', status=self.status, waiting=self.waiting if self.status == 'waiting' else None,
                  error=self.error if self.status == 'error' else None)

    def events_since(self, since: int) -> tuple[List[dict], int, int]:
        with self._cond:
            items = [e for e in self._events if e['seq'] > since]
            first = self._events[0]['seq'] if self._events else self._seq + 1
            return items, self._seq, first

    def wait(self, since: int, timeout: float) -> bool:
        with self._cond:
            if self._seq > since:
                return True
            self._cond.wait(timeout)
            return self._seq > since

    @property
    def last_seq(self) -> int:
        return self._seq

    # ------------------------------------------------------------ control
    def cancelled(self) -> bool:
        return self.cancel_event.is_set()

    def check_cancel(self) -> None:
        if self.cancel_event.is_set():
            raise JobCancelled()

    @property
    def terminal(self) -> bool:
        return self.status in TERMINAL

    def snapshot(self, since: int = 0, include_result: bool = True) -> dict:
        events, last, first = self.events_since(since)
        with self.lock:
            out = {
                'id': self.id, 'kind': self.kind, 'title': self.title, 'status': self.status, 'params': self.params,
                'created': self.created, 'started': self.started or None, 'finished': self.finished or None,
                'elapsed': round((self.finished or time.time()) - (self.started or self.created), 1),
                'events': events, 'next_seq': last, 'first_seq': first, 'truncated': since + 1 < first,
                'waiting': self.waiting if self.status == 'waiting' else None,
                'error': self.error, 'llm': self.modes,
            }
            if include_result:
                out['result'] = self.result if self.status == 'done' else None
                out['partial'] = self.partial if self.status == 'waiting' else None
            return out

    def brief(self) -> dict:
        return {'id': self.id, 'kind': self.kind, 'title': self.title, 'status': self.status, 'created': self.created,
                'elapsed': round((self.finished or time.time()) - (self.started or self.created), 1)}


JobFn = Callable[[Job], Any]


class JobManager:
    def __init__(self, workers: int = 2, max_jobs: int = 100, max_events: int = 2000, waiting_ttl: float = 24 * 3600) -> None:
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()
        self._sem = threading.Semaphore(max(1, workers))
        self.max_jobs, self.max_events, self.waiting_ttl = max_jobs, max_events, waiting_ttl

    # ------------------------------------------------------------ registry
    def get(self, job_id: str) -> Job:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            raise NotFound(job_id)
        return job

    def recent(self, n: int = 30) -> List[dict]:
        with self._lock:
            jobs = sorted(self._jobs.values(), key=lambda j: -j.created)[:n]
        return [j.brief() for j in jobs]

    def _housekeep(self) -> None:
        now = time.time()
        with self._lock:
            jobs = list(self._jobs.values())
        for job in jobs:
            with job.lock:
                if job.status == 'waiting' and not job.busy and now - job.updated > self.waiting_ttl:
                    job.status, job.finished = 'cancelled', now
                    job.error = {'code': 'expired', 'message': '답을 기다리는 시간이 지나 작업을 닫았습니다.'}
                    job.ctx.clear()
                    job._state()
        with self._lock:
            extra = len(self._jobs) - self.max_jobs
            if extra > 0:
                for job in sorted(self._jobs.values(), key=lambda j: j.created):
                    if extra <= 0:
                        break
                    if job.terminal:
                        self._jobs.pop(job.id, None)
                        extra -= 1

    # ------------------------------------------------------------ lifecycle
    def submit(self, kind: str, title: str, params: dict, fn: JobFn) -> Job:
        job = Job(kind, title, params, self.max_events)
        self._housekeep()
        with self._lock:
            self._jobs[job.id] = job
        job._state()
        with job.lock:
            job.busy = True
        self._start(job, fn)
        return job

    def resume(self, job_id: str, fn: JobFn, before: Optional[Callable[[Job], None]] = None) -> Job:
        """Atomically move a waiting job back to running. ``before`` runs under the lock (validation)."""
        job = self.get(job_id)
        with job.lock:
            if job.status != 'waiting' or job.busy:
                raise Conflict(f'작업 상태가 {job.status} 라서 답을 받을 수 없습니다.')
            if before is not None:
                before(job)
            job.busy = True
            job.status = 'running'
            job.waiting = None
            job.partial = None
            job._state()
        self._start(job, fn, resumed=True)
        return job

    def cancel(self, job_id: str) -> Job:
        job = self.get(job_id)
        job.cancel_event.set()
        with job.lock:
            if job.status in ('queued', 'waiting') and not job.busy:
                job.status, job.finished = 'cancelled', time.time()
                job.error = {'code': 'cancelled', 'message': '사용자가 취소했습니다.'}
                job.waiting = None
                job.ctx.clear()
                job._state()
            elif not job.terminal:
                job.log('취소 요청을 받았습니다 — 지금 단계가 끝나면 멈춥니다.', 'warn')
        return job

    def _start(self, job: Job, fn: JobFn, resumed: bool = False) -> None:
        threading.Thread(target=self._run, args=(job, fn, resumed), name=f'winmate-job-{job.id}', daemon=True).start()

    def _run(self, job: Job, fn: JobFn, resumed: bool) -> None:
        with self._sem:
            with job.lock:
                if job.cancel_event.is_set() and not job.terminal:
                    job.status, job.finished, job.busy = 'cancelled', time.time(), False
                    job.error = {'code': 'cancelled', 'message': '시작 전에 취소했습니다.'}
                    job._state()
                    return
                job.status = 'running'
                job.started = job.started or time.time()
                if not resumed:
                    job._state()
            try:
                out = fn(job)
                with job.lock:
                    if isinstance(out, Waiting):
                        job.status, job.waiting, job.partial = 'waiting', out.payload, out.partial
                        job.modes = (out.partial or {}).get('llm', job.modes)
                    else:
                        job.status, job.result, job.finished = 'done', out, time.time()
                        job.modes = out.get('llm') if isinstance(out, dict) else None
                        job.ctx.clear()
                    job.busy = False
                    job._state()
                    if job.status == 'done':
                        job.emit('result', result=job.result)
            except JobCancelled:
                with job.lock:
                    job.status, job.finished, job.busy = 'cancelled', time.time(), False
                    job.error = {'code': 'cancelled', 'message': '사용자가 취소했습니다.'}
                    job.ctx.clear()
                    job._state()
            except Exception as exc:  # noqa: BLE001 — reported to the client in a secret-safe form
                log.warning('job %s (%s) failed: %s', job.id, job.kind, redact(''.join(traceback.format_exception_only(type(exc), exc))).strip())
                code = getattr(exc, 'code', None) or type(exc).__name__
                with job.lock:
                    job.status, job.finished, job.busy = 'error', time.time(), False
                    job.error = {'code': str(code), 'message': redact(f'{type(exc).__name__}: {exc}')[:600]}
                    job.ctx.clear()
                    job._state()
