"""Local single-user login for the Winmate app.

The approach follows ``poc/test/testbench`` (PBKDF2-SHA256 password hash, HMAC-SHA256 signed session
cookie, 12 hours, constant-time comparisons, per-address failure guard), re-implemented here so the
PoC module (which writes ``auth.json`` / ``.secret`` inside ``poc/``) is never imported.

Runtime state lives in ``WINMATE_AUTH_DIR`` (default ``app/data/runtime/auth``, the same runtime root as
``app/api/poc/imports.RUNTIME_DIR``):

  credentials.json   username, PBKDF2 salt/hash/iterations, session generation — never the password (0600)
  session.secret     random HMAC key for session cookies (0600); deleting/rotating it logs everyone out

Flags
  WINMATE_AUTH       on (default) | off — only the explicit value ``off`` disables login (tests only).
                     Any other value, including typos, keeps login enabled.
  WINMATE_AUTH_DIR   credential directory (relative paths are resolved from the repository root)

HTTP contract (see ``app/api/DEPLOY_NOTES.md``)
  POST /api/auth/login   {"username": str, "password": str} (application/json) → 200 {"ok": true, "expires_in": 43200}
                         + HttpOnly SameSite=Strict cookie; 400/401/413/415/429/503 → {"ok": false, "code", "detail"}
  POST /api/auth/logout  → 200 {"ok": true}, cookie cleared, session id revoked in this process
  GET  /api/auth/status  → {"enabled", "configured", "authenticated"} (public)
  GET  /login.html       → standalone login page (public)

``integrate_app(app)`` adds these routes and an ASGI middleware that (1) rejects cross-origin unsafe requests
on every path and (2) requires a valid session everywhere except the public paths below.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import stat
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Deque, Dict, Mapping, Optional, Tuple
from urllib.parse import quote, urlsplit
from fastapi import Request

ROOT = Path(__file__).resolve().parents[2]
RUNTIME_DIR = ROOT / 'app' / 'data' / 'runtime'          # same as app/api/poc/imports.RUNTIME_DIR
DEFAULT_AUTH_DIR = RUNTIME_DIR / 'auth'
LOGIN_PAGE = ROOT / 'app' / 'web' / 'public' / 'login.html'
LOGIN_PAGE_BUILT = ROOT / 'app' / 'web' / 'dist' / 'login.html'

ALGO = 'pbkdf2_sha256'
DEFAULT_ITERATIONS = 600_000
MIN_ITERATIONS = 1_000                 # load-time sanity floor; new credentials use DEFAULT_ITERATIONS
SESSION_SECONDS = 12 * 3600
COOKIE_NAME = 'winmate_session'
MAX_USERNAME = 128
MAX_PASSWORD = 1024
MIN_PASSWORD = 12
MAX_LOGIN_BODY = 8192
SAFE_METHODS = frozenset({'GET', 'HEAD', 'OPTIONS'})
LOOPBACK = frozenset({'127.0.0.1', 'localhost', '::1'})
PUBLIC_PATHS = frozenset({'/login.html', '/api/auth/login', '/api/auth/logout', '/api/auth/status', '/api/health', '/favicon.ico', '/tokens.css'})
PUBLIC_PREFIXES = ('/fonts/',)

log = logging.getLogger('winmate.auth')


class AuthError(RuntimeError):
    """Credential state could not be read or written (message never contains secrets)."""


# ---------------------------------------------------------------- configuration
@dataclass(frozen=True)
class AuthConfig:
    enabled: bool = True
    auth_dir: Path = DEFAULT_AUTH_DIR
    session_seconds: int = SESSION_SECONDS
    cookie_name: str = COOKIE_NAME
    iterations: int = DEFAULT_ITERATIONS
    max_failures: int = 5              # per client address inside failure_window
    failure_window: int = 600
    global_failures: int = 30          # all addresses together (127.0.0.1 / ::1 / LAN alternate) inside failure_window
    public_paths: frozenset = PUBLIC_PATHS
    public_prefixes: Tuple[str, ...] = PUBLIC_PREFIXES

    @property
    def credentials_path(self) -> Path:
        return self.auth_dir / 'credentials.json'

    @property
    def secret_path(self) -> Path:
        return self.auth_dir / 'session.secret'


def config_from_env(environ: Optional[Mapping[str, str]] = None) -> AuthConfig:
    environ = os.environ if environ is None else environ
    enabled = str(environ.get('WINMATE_AUTH', 'on')).strip().lower() != 'off'
    raw = str(environ.get('WINMATE_AUTH_DIR', '')).strip()
    auth_dir = DEFAULT_AUTH_DIR
    if raw:
        auth_dir = Path(raw).expanduser()
        if not auth_dir.is_absolute():
            auth_dir = ROOT / auth_dir
    return AuthConfig(enabled=enabled, auth_dir=auth_dir)


# ---------------------------------------------------------------- private files
def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode('ascii')


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        if stat.S_IMODE(path.stat().st_mode) & 0o077:
            os.chmod(path, 0o700)
    except OSError:
        pass


def _tighten(path: Path) -> None:
    """Credential files must be owner-only; fix looser modes left by copies or umask."""
    try:
        if stat.S_IMODE(path.stat().st_mode) & 0o077:
            os.chmod(path, 0o600)
            log.warning('auth: tightened permissions of %s to 0600', path.name)
    except OSError:
        pass


def _write_tmp(path: Path, data: bytes) -> Path:
    _ensure_dir(path.parent)
    tmp = path.with_name(f'.{path.name}.{secrets.token_hex(6)}.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'wb') as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return tmp


def write_private(path: Path, data: bytes) -> None:
    """Atomically replace ``path`` with an owner-only (0600) file."""
    tmp = _write_tmp(path, data)
    os.replace(tmp, path)
    _tighten(path)


def create_private(path: Path, data: bytes) -> bool:
    """Create ``path`` (0600) only if it does not exist yet. Returns False when another writer won."""
    tmp = _write_tmp(path, data)
    try:
        os.link(tmp, path)
        return True
    except FileExistsError:
        return False
    finally:
        tmp.unlink(missing_ok=True)


def _signature(path: Path) -> Optional[Tuple[int, int, int]]:
    try:
        st = path.stat()
    except OSError:
        return None
    return (st.st_ino, st.st_size, st.st_mtime_ns)


# ---------------------------------------------------------------- credentials
@dataclass(frozen=True)
class Credentials:
    username: str
    iterations: int
    generation: str
    created_at: str
    _salt: bytes = field(repr=False)
    _hash: bytes = field(repr=False)

    def __repr__(self) -> str:  # never include salt/hash
        return f'Credentials(username={self.username!r}, iterations={self.iterations}, created_at={self.created_at!r})'


def hash_password(password: str, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations)


def validate_password(password: str) -> None:
    if not isinstance(password, str) or len(password) < MIN_PASSWORD:
        raise ValueError(f'비밀번호는 {MIN_PASSWORD}자 이상이어야 합니다.')
    if len(password) > MAX_PASSWORD:
        raise ValueError(f'비밀번호는 {MAX_PASSWORD}자 이하여야 합니다.')
    if password != password.strip():
        raise ValueError('비밀번호 앞뒤에 공백을 넣을 수 없습니다.')


def validate_username(username: str) -> None:
    if not isinstance(username, str) or not re.fullmatch(r'[A-Za-z0-9._@-]{1,%d}' % MAX_USERNAME, username):
        raise ValueError('아이디는 영문 · 숫자 · . _ @ - 로 1~128자여야 합니다.')


def generate_password() -> str:
    return secrets.token_urlsafe(18)       # 24 characters, ~144 bits


# ---------------------------------------------------------------- failure guard
class LoginRateLimiter:
    """Blocks an address after ``limit`` failures inside ``window`` seconds, and everyone after ``global_limit``.

    All local browsers share 127.0.0.1, so the per-address limit is effectively a global brute-force brake on
    loopback; the global limit also covers attackers alternating 127.0.0.1 / ::1 / other interfaces.
    """

    def __init__(self, limit: int = 5, window: int = 600, global_limit: int = 30, clock: Callable[[], float] = time.time) -> None:
        self.limit, self.window, self.global_limit, self.clock = limit, window, global_limit, clock
        self._fails: Dict[str, Deque[float]] = defaultdict(deque)
        self._all: Deque[float] = deque()
        self._lock = threading.Lock()

    def _prune(self, q: Deque[float], now: float) -> None:
        while q and now - q[0] >= self.window:
            q.popleft()

    def retry_after(self, key: str) -> int:
        """Seconds until ``key`` may try again (0 = allowed)."""
        with self._lock:
            now = self.clock()
            waits = []
            q = self._fails.get(key)
            if q is not None:
                self._prune(q, now)
                if not q:
                    self._fails.pop(key, None)
                elif len(q) >= self.limit:
                    waits.append(self.window - (now - q[-self.limit]))
            self._prune(self._all, now)
            if len(self._all) >= self.global_limit:
                waits.append(self.window - (now - self._all[-self.global_limit]))
            return max(1, int(max(waits) + 0.999)) if waits else 0

    def failure(self, key: str) -> None:
        with self._lock:
            now = self.clock()
            self._fails[key].append(now)
            self._all.append(now)

    def success(self, key: str) -> None:
        with self._lock:
            self._fails.pop(key, None)


# ---------------------------------------------------------------- origin check
def _default_port(scheme: str) -> int:
    return 443 if scheme == 'https' else 80


def origin_allowed(origin: str, host: str, scheme: str = 'http') -> bool:
    """True when ``origin`` is this server: same scheme/host/port as the Host header, or both loopback on the same port."""
    if not origin or not host or origin.strip().lower() == 'null':
        return False
    try:
        o = urlsplit(origin.strip())
        h = urlsplit(f'//{host.strip()}')
        o_port = o.port or _default_port(o.scheme)
        h_port = h.port or _default_port(scheme)
    except ValueError:
        return False
    if o.scheme not in ('http', 'https') or not o.hostname or not h.hostname or o.username or o.password:
        return False
    if o.scheme == scheme and o.hostname == h.hostname and o_port == h_port:
        return True
    return o.hostname in LOOPBACK and h.hostname in LOOPBACK and o_port == h_port


def csrf_ok(method: str, headers: Mapping[str, str], scheme: str) -> bool:
    """Unsafe methods from browsers must come from this origin. Non-browser clients (no Origin/Sec-Fetch-Site) pass."""
    if method.upper() in SAFE_METHODS:
        return True
    host = headers.get('host', '')
    origin = headers.get('origin')
    if origin is not None:
        return origin_allowed(origin, host, scheme)
    site = (headers.get('sec-fetch-site') or '').strip().lower()
    if site in ('cross-site', 'same-site'):
        return False
    referer = headers.get('referer')
    if referer:
        try:
            r = urlsplit(referer)
        except ValueError:
            return False
        return origin_allowed(f'{r.scheme}://{r.netloc}', host, scheme)
    return True


# ---------------------------------------------------------------- auth state
def _unb64url(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


class Auth:
    def __init__(self, config: Optional[AuthConfig] = None, clock: Callable[[], float] = time.time) -> None:
        self.config = config or config_from_env()
        self.clock = clock
        self.limiter = LoginRateLimiter(self.config.max_failures, self.config.failure_window, self.config.global_failures, clock)
        self._lock = threading.RLock()
        self._creds: Tuple[Optional[Tuple[int, int, int]], Optional[Credentials]] = (None, None)
        self._secret: Tuple[Optional[Tuple[int, int, int]], bytes] = (None, b'')
        self._revoked: Dict[str, float] = {}
        self.last_error = ''

    def reconfigure(self, config: AuthConfig) -> AuthConfig:
        """Swap the configuration in place (e.g. tests on the real app); returns the previous one.

        Routes and middleware read ``auth.config`` per request, so this takes effect immediately. Caches, the
        failure guard and in-process revocations are reset."""
        with self._lock:
            previous, self.config = self.config, config
            self.limiter = LoginRateLimiter(config.max_failures, config.failure_window, config.global_failures, self.clock)
            self._creds, self._secret, self._revoked = (None, None), (None, b''), {}
            self.last_error = ''
        return previous

    # credentials -------------------------------------------------
    def credentials(self) -> Optional[Credentials]:
        path = self.config.credentials_path
        sig = _signature(path)
        with self._lock:
            if sig is not None and sig == self._creds[0]:
                return self._creds[1]
            creds = None
            if sig is not None:
                try:
                    creds = self._parse_credentials(path)
                    self.last_error = ''
                    _tighten(path)
                except AuthError as exc:
                    self.last_error = str(exc)
                    log.error('auth: %s', exc)
            else:
                self.last_error = ''
            self._creds = (sig, creds)
            return creds

    @staticmethod
    def _parse_credentials(path: Path) -> Credentials:
        try:
            d = json.loads(path.read_text(encoding='utf-8'))
            if d.get('algo') != ALGO:
                raise AuthError(f'{path.name}: 지원하지 않는 해시 방식입니다.')
            iterations = int(d['iterations'])
            salt, digest = base64.b64decode(d['salt'], validate=True), base64.b64decode(d['hash'], validate=True)
            username, generation = str(d['username']), str(d['generation'])
        except AuthError:
            raise
        except (OSError, ValueError, KeyError, TypeError, binascii.Error) as exc:
            raise AuthError(f'{path.name} 를 읽지 못했습니다 ({type(exc).__name__}). manage_auth.py --set 으로 다시 만드세요.') from None
        if iterations < MIN_ITERATIONS or len(salt) < 16 or len(digest) != 32 or not generation:
            raise AuthError(f'{path.name} 형식이 올바르지 않습니다. manage_auth.py --set 으로 다시 만드세요.')
        return Credentials(username, iterations, generation, str(d.get('created_at', '')), salt, digest)

    def configured(self) -> bool:
        return self.credentials() is not None

    def set_credentials(self, username: str, password: str, iterations: Optional[int] = None) -> None:
        """Store a salted PBKDF2 hash (never the password). A new generation invalidates existing sessions."""
        validate_username(username)
        validate_password(password)
        iterations = int(iterations or self.config.iterations)
        if iterations < MIN_ITERATIONS:
            raise ValueError(f'iterations must be >= {MIN_ITERATIONS}')
        salt = os.urandom(16)
        record = {'version': 1, 'username': username, 'algo': ALGO, 'iterations': iterations, 'salt': _b64(salt),
                  'hash': _b64(hash_password(password, salt, iterations)), 'generation': secrets.token_hex(8),
                  'created_at': datetime.now(timezone.utc).isoformat(timespec='seconds')}
        with self._lock:
            write_private(self.config.credentials_path, (json.dumps(record, indent=1) + '\n').encode('utf-8'))
            self._creds = (None, None)
        self.secret()

    def remove_credentials(self) -> bool:
        with self._lock:
            self._creds = (None, None)
            try:
                self.config.credentials_path.unlink()
                return True
            except FileNotFoundError:
                return False

    def verify_password(self, username: str, password: str) -> bool:
        creds = self.credentials()
        if creds is None or not isinstance(username, str) or not isinstance(password, str):
            return False
        digest = hash_password(password, creds._salt, creds.iterations)        # always computed (timing)
        ok_user = hmac.compare_digest(username.encode('utf-8'), creds.username.encode('utf-8'))
        ok_pass = hmac.compare_digest(digest, creds._hash)
        return ok_user & ok_pass

    # session secret ----------------------------------------------
    def secret(self) -> bytes:
        path = self.config.secret_path
        with self._lock:
            sig = _signature(path)
            if sig is not None and sig == self._secret[0]:
                return self._secret[1]
            value = b''
            if sig is not None:
                try:
                    value = path.read_text(encoding='ascii').strip().encode('ascii')
                except (OSError, UnicodeDecodeError):
                    value = b''
            if len(value) < 64:
                if sig is not None:
                    log.error('auth: session secret unreadable or too short — replacing it (existing sessions end)')
                    write_private(path, secrets.token_hex(32).encode('ascii'))
                else:
                    create_private(path, secrets.token_hex(32).encode('ascii'))
                value = path.read_text(encoding='ascii').strip().encode('ascii')
            _tighten(path)
            self._secret = (_signature(path), value)
            return value

    def rotate_secret(self) -> None:
        with self._lock:
            write_private(self.config.secret_path, secrets.token_hex(32).encode('ascii'))
            self._secret = (None, b'')

    # tokens ------------------------------------------------------
    def _sign(self, body: str) -> str:
        return hmac.new(self.secret(), body.encode('ascii'), hashlib.sha256).hexdigest()

    def issue_token(self) -> Tuple[str, int]:
        creds = self.credentials()
        if creds is None:
            raise AuthError('credentials are not configured')
        now = int(self.clock())
        exp = now + self.config.session_seconds
        payload = {'u': creds.username, 'sid': secrets.token_urlsafe(12), 'iat': now, 'exp': exp, 'gen': creds.generation}
        body = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode('utf-8')).decode('ascii').rstrip('=')
        return f'{body}.{self._sign(body)}', exp

    def read_token(self, token: Optional[str]) -> Optional[Dict[str, Any]]:
        """Payload of a valid, unexpired, unrevoked session for the current credentials, else None."""
        if not token or len(token) > 1024 or token.count('.') != 1:
            return None
        creds = self.credentials()
        if creds is None:                    # also avoids creating a session secret before any account exists
            return None
        body, sig = token.split('.', 1)
        try:
            expected = self._sign(body)
        except UnicodeEncodeError:
            return None
        if not hmac.compare_digest(sig.encode('utf-8'), expected.encode('ascii')):
            return None
        try:
            d = json.loads(_unb64url(body))
            exp, iat = int(d['exp']), int(d['iat'])
            user, sid, gen = str(d['u']), str(d['sid']), str(d['gen'])
        except (ValueError, KeyError, TypeError, binascii.Error):
            return None
        now = self.clock()
        if exp <= now or iat > now + 60 or exp - iat > self.config.session_seconds:
            return None
        if not (hmac.compare_digest(gen.encode('utf-8'), creds.generation.encode('utf-8')) and user == creds.username):
            return None
        with self._lock:
            if sid in self._revoked:
                return None
        return d

    def revoke(self, payload: Mapping[str, Any]) -> None:
        with self._lock:
            now = self.clock()
            for sid, exp in list(self._revoked.items()):
                if exp <= now:
                    del self._revoked[sid]
            self._revoked[str(payload['sid'])] = float(payload['exp'])

    # status ------------------------------------------------------
    def status(self, token: Optional[str]) -> Dict[str, bool]:
        if not self.config.enabled:
            return {'enabled': False, 'configured': self.configured(), 'authenticated': True}
        configured = self.configured()
        return {'enabled': True, 'configured': configured, 'authenticated': bool(configured and self.read_token(token))}


# ---------------------------------------------------------------- HTTP
def _client_key(scope: Mapping[str, Any]) -> str:
    client = scope.get('client')
    return str(client[0]) if client else 'unknown'


def _is_public(config: AuthConfig, path: str) -> bool:
    return path in config.public_paths or any(path.startswith(p) for p in config.public_prefixes)


def _wants_page(method: str, path: str, accept: str) -> bool:
    if method not in ('GET', 'HEAD') or path.startswith('/api/'):
        return False
    return path == '/' or path.endswith('/') or path.endswith('.html') or 'text/html' in accept


def _no_store(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


def _error(status: int, code: str, detail: str, headers: Optional[Dict[str, str]] = None):
    from starlette.responses import JSONResponse
    return _no_store(JSONResponse({'ok': False, 'code': code, 'detail': detail}, status_code=status, headers=headers))


class AuthMiddleware:
    """Pure ASGI middleware (streams such as SSE pass through untouched)."""

    def __init__(self, app, auth: Auth) -> None:
        self.app = app
        self.auth = auth

    async def __call__(self, scope, receive, send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        from starlette.requests import HTTPConnection
        from starlette.responses import RedirectResponse
        conn = HTTPConnection(scope)
        method = scope['method'].upper()
        path = scope['path']
        if not csrf_ok(method, conn.headers, scope.get('scheme', 'http')):
            await _error(403, 'csrf_rejected', '다른 사이트에서 보낸 요청이라 거부했습니다.')(scope, receive, send)
            return
        config = self.auth.config
        if not config.enabled or _is_public(config, path):
            await self.app(scope, receive, send)
            return
        if self.auth.configured() and self.auth.read_token(conn.cookies.get(config.cookie_name)):
            await self.app(scope, receive, send)
            return
        if _wants_page(method, path, conn.headers.get('accept', '')):
            target = path + (f"?{scope['query_string'].decode('latin-1')}" if scope.get('query_string') else '')
            response = _no_store(RedirectResponse('/login.html?next=' + quote(target, safe=''), status_code=303))
        elif not self.auth.configured():
            response = _error(503, 'auth_not_configured', '로그인 계정이 아직 없습니다. 서버에서 python app/scripts/manage_auth.py --set 을 실행하세요.')
        else:
            response = _error(401, 'auth_required', '로그인이 필요합니다. /login.html 에서 다시 로그인하세요.')
        await response(scope, receive, send)


def _inline_hashes(html: str, tag: str) -> str:
    out = []
    for m in re.finditer(rf'<{tag}(?![^>]*\bsrc=)[^>]*>(.*?)</{tag}>', html, re.S | re.I):
        out.append("'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode('utf-8')).digest()).decode('ascii') + "'")
    return ' '.join(out) or "'none'"


def build_router(auth: Auth):
    from fastapi import APIRouter
    from fastapi.responses import HTMLResponse, JSONResponse
    from starlette.concurrency import run_in_threadpool

    router = APIRouter()

    def cookie_args(request: Request) -> Dict[str, Any]:
        return {'path': '/', 'httponly': True, 'samesite': 'strict', 'secure': request.url.scheme == 'https'}

    @router.get('/login.html', include_in_schema=False)
    def login_page():
        page = LOGIN_PAGE if LOGIN_PAGE.is_file() else LOGIN_PAGE_BUILT
        try:
            html = page.read_text(encoding='utf-8')
        except OSError:
            return _error(500, 'login_page_missing', 'app/web/public/login.html 이 없습니다.')
        csp = (f"default-src 'none'; script-src {_inline_hashes(html, 'script')}; style-src 'self' {_inline_hashes(html, 'style')}; "
               "connect-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
        return HTMLResponse(html, headers={'Content-Security-Policy': csp, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY',
                                           'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'})

    @router.get('/api/auth/status')
    def status(request: Request):
        return _no_store(JSONResponse(auth.status(request.cookies.get(auth.config.cookie_name))))

    @router.post('/api/auth/login')
    async def login(request: Request):
        config = auth.config
        if not config.enabled:
            return _error(409, 'auth_disabled', '로그인이 꺼져 있습니다(WINMATE_AUTH=off).')
        if request.headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json':
            return _error(415, 'unsupported_media_type', 'Content-Type: application/json 으로 보내세요.')
        try:
            if int(request.headers.get('content-length') or 0) > MAX_LOGIN_BODY:
                return _error(413, 'body_too_large', '요청이 너무 큽니다.')
        except ValueError:
            return _error(400, 'bad_request', 'Content-Length 가 올바르지 않습니다.')
        raw = bytearray()
        async for chunk in request.stream():
            raw += chunk
            if len(raw) > MAX_LOGIN_BODY:
                return _error(413, 'body_too_large', '요청이 너무 큽니다.')
        try:
            data = json.loads(bytes(raw).decode('utf-8'))
        except (UnicodeDecodeError, ValueError):
            return _error(400, 'bad_request', 'JSON 본문이 올바르지 않습니다.')
        username = data.get('username') if isinstance(data, dict) else None
        password = data.get('password') if isinstance(data, dict) else None
        if not isinstance(username, str) or not isinstance(password, str) or not username or not password \
                or len(username) > MAX_USERNAME or len(password) > MAX_PASSWORD:
            return _error(400, 'bad_request', 'username 과 password 를 문자열로 보내세요.')
        if not auth.configured():
            return _error(503, 'auth_not_configured', '로그인 계정이 아직 없습니다. 서버에서 python app/scripts/manage_auth.py --set 을 실행하세요.')
        key = _client_key(request.scope)
        wait = auth.limiter.retry_after(key)
        if wait:
            return _error(429, 'too_many_attempts', f'로그인 실패가 많아 {wait}초 동안 막았습니다.', {'Retry-After': str(wait)})
        if not await run_in_threadpool(auth.verify_password, username, password):
            auth.limiter.failure(key)
            return _error(401, 'invalid_credentials', '아이디 또는 비밀번호가 맞지 않습니다.')
        auth.limiter.success(key)
        token, _ = auth.issue_token()
        response = _no_store(JSONResponse({'ok': True, 'expires_in': config.session_seconds}))
        response.set_cookie(config.cookie_name, token, max_age=config.session_seconds, **cookie_args(request))
        return response

    @router.post('/api/auth/logout')
    def logout(request: Request):
        config = auth.config
        payload = auth.read_token(request.cookies.get(config.cookie_name)) if config.enabled else None
        if payload:
            auth.revoke(payload)
        response = _no_store(JSONResponse({'ok': True}))
        response.delete_cookie(config.cookie_name, **cookie_args(request))
        return response

    return router


def integrate_app(app, auth: Optional[Auth] = None) -> Auth:
    """Add /api/auth/* + /login.html routes and the session/CSRF middleware. Call once, before startup."""
    auth = auth or Auth(config_from_env())
    app.state.auth = auth
    app.include_router(build_router(auth))
    app.add_middleware(AuthMiddleware, auth=auth)
    if auth.config.enabled and not auth.configured():
        log.warning('auth: no credentials in %s — run python app/scripts/manage_auth.py --ensure (or --set)', auth.config.auth_dir)
    return auth
