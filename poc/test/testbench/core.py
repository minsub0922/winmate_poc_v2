"""공통 — 경로, 로그인(PBKDF2 + 서명 쿠키), 백그라운드 작업(job) 관리."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import traceback
import uuid
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent          # poc/test/testbench
TEST_DIR = HERE.parent                          # poc/test
POC_DIR = TEST_DIR.parent                       # poc
LAYOUT_DIR = TEST_DIR / "layout_agent"

# ---------------------------------------------------------------- 로그인
AUTH_FILE = HERE / "auth.json"
SECRET_FILE = HERE / ".secret"
SESSION_COOKIE = "tb_session"
SESSION_HOURS = 12


def _secret() -> bytes:
    if not SECRET_FILE.exists():
        SECRET_FILE.write_text(secrets.token_hex(32), encoding="utf-8")
        try:
            os.chmod(SECRET_FILE, 0o600)
        except OSError:
            pass
    return SECRET_FILE.read_text(encoding="utf-8").strip().encode()


def check_password(username: str, password: str) -> bool:
    a = json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    salt = base64.b64decode(a["salt"])
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(a["iterations"]))
    ok_user = hmac.compare_digest(username.encode(), a["username"].encode())
    return ok_user and hmac.compare_digest(h, base64.b64decode(a["hash"]))


def make_token(username: str) -> str:
    body = base64.urlsafe_b64encode(json.dumps({"u": username, "exp": int(time.time()) + SESSION_HOURS * 3600}).encode()).decode()
    sig = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def read_token(tok: str | None) -> str | None:
    if not tok or "." not in tok:
        return None
    body, sig = tok.rsplit(".", 1)
    if not hmac.compare_digest(sig, hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()):
        return None
    try:
        d = json.loads(base64.urlsafe_b64decode(body.encode()))
    except ValueError:
        return None
    return d["u"] if d.get("exp", 0) > time.time() else None


class LoginGuard:
    """같은 주소에서 10분 안에 5번 틀리면 10분 동안 막는다."""

    def __init__(self, limit: int = 5, window: int = 600) -> None:
        self.limit, self.window = limit, window
        self.fails: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def blocked(self, ip: str) -> int:
        with self.lock:
            q = self.fails[ip]
            now = time.time()
            while q and now - q[0] > self.window:
                q.popleft()
            return int(self.window - (now - q[0])) if len(q) >= self.limit else 0

    def fail(self, ip: str) -> None:
        with self.lock:
            self.fails[ip].append(time.time())

    def ok(self, ip: str) -> None:
        with self.lock:
            self.fails.pop(ip, None)


# ---------------------------------------------------------------- 작업(job)
class Job:
    def __init__(self, kind: str, title: str, params: dict) -> None:
        self.id = uuid.uuid4().hex[:10]
        self.kind, self.title, self.params = kind, title, params
        self.status = "queued"  # queued · running · waiting(사용자 입력 대기) · done · error
        self.logs: list[dict] = []
        self.result: Any = None
        self.waiting: Any = None  # status=waiting 일 때 사용자에게 보여 줄 질문
        self.error = ""
        self.created = time.time()
        self.started = 0.0
        self.finished = 0.0
        self.ctx: dict = {}  # 어댑터가 쓰는 내부 상태(그래프 · 설정 등) — 밖으로 내보내지 않음
        self.lock = threading.Lock()

    def log(self, msg: str, level: str = "info") -> None:
        with self.lock:
            self.logs.append({"t": round(time.time() - (self.started or self.created), 1), "msg": str(msg), "level": level})

    def view(self, since: int = 0) -> dict:
        with self.lock:
            return {"id": self.id, "kind": self.kind, "title": self.title, "status": self.status, "params": self.params,
                    "logs": self.logs[since:], "n_logs": len(self.logs), "result": self.result if self.status in ("done", "waiting") else None,
                    "waiting": self.waiting if self.status == "waiting" else None, "error": self.error,
                    "created": self.created, "elapsed": round((self.finished or time.time()) - (self.started or self.created), 1)}

    def brief(self) -> dict:
        return {"id": self.id, "kind": self.kind, "title": self.title, "status": self.status, "created": self.created,
                "elapsed": round((self.finished or time.time()) - (self.started or self.created), 1)}


class Jobs:
    def __init__(self, workers: int = 2, keep: int = 60) -> None:
        self.items: dict[str, Job] = {}
        self.sem = threading.Semaphore(workers)
        self.keep = keep
        self.lock = threading.Lock()

    def submit(self, kind: str, title: str, params: dict, fn: Callable[[Job], Any]) -> Job:
        job = Job(kind, title, params)
        with self.lock:
            self.items[job.id] = job
            if len(self.items) > self.keep:  # 오래된 끝난 작업부터 정리
                for jid in sorted(self.items, key=lambda k: self.items[k].created)[: len(self.items) - self.keep]:
                    if self.items[jid].status in ("done", "error"):
                        self.items.pop(jid, None)
        self.run(job, fn)
        return job

    def run(self, job: Job, fn: Callable[[Job], Any]) -> None:
        def target() -> None:
            with self.sem:
                job.status, job.started = "running", job.started or time.time()
                try:
                    out = fn(job)
                    if job.status == "running":
                        job.result, job.status = out, "done"
                except Exception as e:  # noqa: BLE001 — 오류는 화면에 그대로 보여 준다
                    job.error = f"{type(e).__name__}: {e}"
                    job.log(traceback.format_exc(limit=6), "error")
                    job.status = "error"
                finally:
                    if job.status in ("done", "error"):
                        job.finished = time.time()
        threading.Thread(target=target, daemon=True).start()

    def get(self, jid: str) -> Job | None:
        return self.items.get(jid)

    def recent(self, n: int = 30) -> list[dict]:
        return [j.brief() for j in sorted(self.items.values(), key=lambda j: -j.created)[:n]]


JOBS = Jobs()


def read_env_keys() -> dict[str, bool]:
    """poc/.env 에 어떤 키가 있는지(값은 읽어도 밖으로 내보내지 않는다)."""
    keys: dict[str, bool] = {}
    for p in (POC_DIR / ".env.example", POC_DIR / ".env"):
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    k = k.strip()
                    if p.name == ".env":
                        keys[k] = bool(v.strip().strip("'\""))
                    else:
                        keys.setdefault(k, False)
    for k in list(keys):
        if os.environ.get(k):
            keys[k] = True
    return keys
