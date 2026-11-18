"""관리자 읽기 전용 열람 — 관리자가 한 사용자의 기록을 웹앱 화면 그대로, 그 탭에서만 읽기 전용으로 본다.

admin `GET /admin/api/users/{username}/open` (admin/activity.py) issues a short-lived token bound to the issuing admin's
own session (``sid``) and redirects a new tab to the webapp with ``#inspect=<token>``. That tab keeps the token in
sessionStorage and sends it as ``X-Winmate-Inspect`` (``?inspect=`` for <img> addresses); other tabs carry
nothing and are unaffected.

For a request that carries a valid token, ``InspectMiddleware`` makes every ``Auth.read_token()`` answer as the target
user for that request only (a context variable — every owner lookup in the app goes through ``read_token``), and it
refuses anything that could change data: only GET/HEAD and a few compute-only POSTs pass. The token is useless without
the admin's own session cookie, it ends with that session (logout, password change, deactivation, expiry) and after
``TTL`` at most. Responses are ``no-store`` so nothing the tab reads is cached for the admin's own tabs.
"""
from __future__ import annotations

import base64
import binascii
import contextvars
import hashlib
import hmac
import json
import re
import time
from typing import Any, Dict, Optional, Tuple
from urllib.parse import parse_qs

HEADER = 'x-winmate-inspect'
QUERY = 'inspect'
TTL = 2 * 3600
# POSTs that only read or compute: account record fetches by ID and server renders of a scene/building already shown.
READ_ONLY_POSTS = re.compile(r'/api/account-data/[a-z-]{1,40}/fetch|/api/account-data/blobs/missing'
                             r'|/api/spatial/(?:snapshot|compute|building-snapshot)')
_current: contextvars.ContextVar[Optional[Dict[str, Any]]] = contextvars.ContextVar('winmate_inspect', default=None)


def current() -> Optional[Dict[str, Any]]:
    """The inspected identity for this request, or None outside an inspection."""
    return _current.get()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('ascii').rstrip('=')


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


def _sign(auth, body: str) -> str:
    # Domain-separated from session tokens: an inspect token can never pass as a session and vice versa.
    return hmac.new(auth.secret(), b'winmate-inspect.' + body.encode('ascii'), hashlib.sha256).hexdigest()


def issue(auth, admin: Dict[str, Any], target: str, ttl: int = TTL) -> Tuple[str, int]:
    now = int(time.time())
    exp = min(now + ttl, int(admin.get('exp') or now + ttl))
    body = _b64(json.dumps({'u': target, 'by': admin['u'], 'sid': admin['sid'], 'iat': now, 'exp': exp}, separators=(',', ':')).encode())
    return body + '.' + _sign(auth, body), exp


def verify(auth, token: Optional[str], admin: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Payload when the token is genuine, unexpired and was issued by this very admin session."""
    if not token or len(token) > 1024 or token.count('.') != 1 or not admin:
        return None
    if admin.get('role', 'admin' if admin.get('u') == 'admin' else 'member') != 'admin':
        return None
    body, sig = token.split('.', 1)
    try:
        if not hmac.compare_digest(sig.encode('utf-8'), _sign(auth, body).encode('ascii')):
            return None
        payload = json.loads(_unb64(body))
        target, by, sid, exp = str(payload['u']), str(payload['by']), str(payload['sid']), int(payload['exp'])
    except (ValueError, KeyError, TypeError, UnicodeError, binascii.Error):
        return None
    if exp <= time.time() or by != admin.get('u') or sid != admin.get('sid'):
        return None
    accounts = getattr(auth, 'accounts', None)
    if accounts is None or not accounts.exists(target):
        return None
    return {'u': target, 'by': by, 'sid': sid, 'exp': exp}


def _token(scope) -> Optional[str]:
    for key, value in scope.get('headers') or []:
        if key == HEADER.encode():
            return value.decode('latin-1')
    # Any method: an address built in an inspection tab must never turn into the admin's own write (it is refused below).
    if scope.get('query_string'):
        values = parse_qs(scope['query_string'].decode('latin-1')).get(QUERY)
        if values:
            return values[0]
    return None


def _cookie(scope, name: str) -> Optional[str]:
    from starlette.requests import HTTPConnection
    return HTTPConnection(scope).cookies.get(name)


def allowed(method: str, path: str) -> bool:
    return method in ('GET', 'HEAD', 'OPTIONS') or (method == 'POST' and bool(READ_ONLY_POSTS.fullmatch(path)))


class InspectMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        token = _token(scope)
        if token is None:
            return await self.app(scope, receive, send)
        from starlette.responses import JSONResponse
        auth = scope['app'].state.auth
        payload = verify(auth, token, auth.read_token(_cookie(scope, auth.config.cookie_name)))
        if payload is None:
            response = JSONResponse({'code': 'inspect_expired', 'detail': '관리자 열람이 끝났습니다. 관리자 화면에서 다시 열어 주세요.'}, 403,
                                    headers={'Cache-Control': 'no-store'})
            return await response(scope, receive, send)
        if not allowed(scope['method'], scope['path']):
            response = JSONResponse({'code': 'inspect_read_only', 'detail': '관리자 열람은 읽기 전용이라 저장하지 않습니다.'}, 403,
                                    headers={'Cache-Control': 'no-store'})
            return await response(scope, receive, send)
        identity = {'u': payload['u'], 'sid': 'inspect:' + payload['sid'], 'iat': int(time.time()), 'exp': payload['exp'], 'gen': '',
                    'role': auth.accounts.role(payload['u']), 'inspect': {'by': payload['by'], 'exp': payload['exp']}}

        async def private(message):
            if message['type'] == 'http.response.start':
                headers = [(k, v) for k, v in message.get('headers', []) if k.lower() not in (b'cache-control', b'etag')]
                message['headers'] = headers + [(b'cache-control', b'no-store'), (b'x-winmate-inspect-user', payload['u'].encode())]
            await send(message)

        reset = _current.set(identity)
        try:
            await self.app(scope, receive, private)
        finally:
            _current.reset(reset)
