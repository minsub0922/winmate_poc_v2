"""Model answers of resumable browser work, kept on the server by step key.

A sheet fill (장 채우기, ``app/web/src/services/layout-context.js``) asks the model several times from the browser. Each
call names its step (``step_key`` = proposal · sheet · fill request · step number · prompt hash). The server records
the answer here, so the same step asked again — after a reload, or when the user comes back after leaving the app while
the call was still running — gets the recorded answer, or joins the call still running, instead of asking the model
again. The call itself never depends on the browser: it runs on a server thread and is recorded even when the browser
has gone. Failures are not recorded (the next try asks again).

Keys are scoped to the signed-in account. Without a path (tests) answers stay in memory; the app sets a SQLite file
next to the account data at startup (:meth:`StepStore.use_path`).
"""
from __future__ import annotations

import json
import logging
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

log = logging.getLogger('winmate.poc.steps')
KEY = re.compile(r'^[A-Za-z0-9_.:@-]{1,300}$')
WAIT_SECONDS = 900  # a step still running elsewhere is joined for at most this long, then asked again


class _Slot:
    def __init__(self) -> None:
        self.done = threading.Event()
        self.value: Optional[dict] = None
        self.error: Optional[BaseException] = None


class StepStore:
    def __init__(self, keep_hours: float = 48) -> None:
        self.keep = keep_hours * 3600
        self.path: Optional[Path] = None
        self._memory: Dict[str, tuple[float, dict]] = {}
        self._running: Dict[str, _Slot] = {}
        self._lock = threading.Lock()
        self._db_lock = threading.Lock()

    def use_path(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS llm_steps (key TEXT PRIMARY KEY, at REAL NOT NULL, data TEXT NOT NULL)')
            db.execute('DELETE FROM llm_steps WHERE at < ?', (time.time() - self.keep,))

    @staticmethod
    def valid(key: Any) -> bool:
        return isinstance(key, str) and bool(KEY.match(key))

    def _db(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.execute('PRAGMA journal_mode=WAL')
        return db

    def _get(self, key: str) -> Optional[dict]:
        if self.path is None:
            hit = self._memory.get(key)
            return hit[1] if hit and time.time() - hit[0] < self.keep else None
        try:
            with self._db_lock, self._db() as db:
                row = db.execute('SELECT data FROM llm_steps WHERE key=? AND at>=?', (key, time.time() - self.keep)).fetchone()
            return json.loads(row[0]) if row else None
        except Exception as exc:  # noqa: BLE001 — a store failure only costs a model call
            log.warning('step store read failed: %s', type(exc).__name__)
            return None

    def _put(self, key: str, value: dict) -> None:
        if self.path is None:
            self._memory[key] = (time.time(), value)
            return
        try:
            with self._db_lock, self._db() as db:
                db.execute('INSERT OR REPLACE INTO llm_steps (key, at, data) VALUES (?,?,?)', (key, time.time(), json.dumps(value, ensure_ascii=False)))
        except Exception as exc:  # noqa: BLE001
            log.warning('step store write failed: %s', type(exc).__name__)

    def run(self, owner: str, step_key: str, call: Callable[[], dict]) -> dict:
        """The recorded answer of this step, the answer of the same step running now, or ``call()`` (recorded)."""
        key = (owner or '-') + '\n' + step_key
        hit = self._get(key)
        if hit is not None:
            return hit
        with self._lock:
            slot = self._running.get(key)
            leader = slot is None
            if leader:
                slot = self._running[key] = _Slot()
        if not leader:
            finished = slot.done.wait(WAIT_SECONDS)
            if finished and slot.error is not None:
                raise slot.error
            if finished and slot.value is not None:
                return slot.value
            return call()
        try:
            value = call()
            if isinstance(value, dict):
                self._put(key, value)
            slot.value = value
            return value
        except BaseException as exc:
            slot.error = exc
            raise
        finally:
            slot.done.set()
            with self._lock:
                if self._running.get(key) is slot:
                    del self._running[key]
