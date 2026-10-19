"""Smoke test for a running Winmate server (standard library only).

  WINMATE_SMOKE_PASSWORD=... python app/scripts/smoke.py              # http://127.0.0.1:$WINMATE_API_PORT (8788)
  python app/scripts/smoke.py --base http://127.0.0.1:8788 --prompt   # ask for the password (hidden input)
  printf '%s\n' "$PW" | python app/scripts/smoke.py --password-stdin

Checks: public health/status/login page, unauthenticated API 401 + page redirect, cross-origin POST 403,
login (cookie flags), capabilities, 1,068 products, a product detail, the app root, logout revocation.
With WINMATE_AUTH=off on the server the login checks are skipped. The password and session cookie are kept
in process memory only and never printed. Exit status 0 = all passed, 1 = a check failed, 2 = usage error.

Environment: WINMATE_SMOKE_URL, WINMATE_SMOKE_USER (default admin), WINMATE_SMOKE_PASSWORD
(name changeable with --password-env), WINMATE_API_PORT.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote, urlsplit

COOKIE = 'winmate_session'
EXPECTED_PRODUCTS = 1068


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # surface 3xx to the caller
        return None


class Client:
    def __init__(self, base: str, timeout: float) -> None:
        self.base = base.rstrip('/')
        parts = urlsplit(self.base)
        self.origin = f'{parts.scheme}://{parts.netloc}'
        self.timeout = timeout
        self.cookie: Optional[str] = None
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect)

    def request(self, method: str, path: str, body: Optional[dict] = None, headers: Optional[Dict[str, str]] = None,
                cookie: bool = True) -> Tuple[int, object, bytes]:
        h = {'Accept': 'application/json', **(headers or {})}
        data = None
        if body is not None:
            data = json.dumps(body).encode('utf-8')
            h['Content-Type'] = 'application/json'
        if cookie and self.cookie:
            h['Cookie'] = f'{COOKIE}={self.cookie}'
        req = urllib.request.Request(self.base + path, data=data, headers=h, method=method)
        try:
            with self.opener.open(req, timeout=self.timeout) as res:
                return res.status, res.headers, res.read()
        except urllib.error.HTTPError as exc:
            with exc:
                return exc.code, exc.headers, exc.read()

    def json(self, method: str, path: str, **kwargs) -> Tuple[int, object, object]:
        status, headers, raw = self.request(method, path, **kwargs)
        try:
            return status, headers, json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, ValueError):
            return status, headers, None


class Report:
    def __init__(self) -> None:
        self.failed: List[str] = []

    def check(self, name: str, ok: bool, detail: str = '') -> bool:
        print(f'{"PASS" if ok else "FAIL"}  {name}' + ('' if ok or not detail else f' — {detail}'))
        if not ok:
            self.failed.append(name)
        return ok

    def skip(self, name: str, why: str) -> None:
        print(f'SKIP  {name} — {why}')


def _session_cookie(headers) -> Tuple[Optional[str], str]:
    for line in headers.get_all('Set-Cookie') or []:
        name, _, rest = line.partition('=')
        if name.strip() == COOKIE:
            value, _, attrs = rest.partition(';')
            return value.strip().strip('"'), attrs.lower()
    return None, ''


def _password(args: argparse.Namespace) -> Optional[str]:
    if args.password_stdin:
        return sys.stdin.readline().rstrip('\r\n') or None
    if args.prompt:
        return getpass.getpass('Winmate 비밀번호: ') or None
    return os.environ.get(args.password_env) or None


def run(args: argparse.Namespace) -> int:
    c = Client(args.base, args.timeout)
    r = Report()
    try:
        status, _, health = c.json('GET', '/api/health')
    except (urllib.error.URLError, OSError) as exc:
        print(f'FAIL  server reachable — {c.base}: {type(exc).__name__}: {getattr(exc, "reason", exc)}')
        return 1
    r.check('health (public)', status == 200 and isinstance(health, dict) and health.get('ok') is True, f'HTTP {status}')
    if isinstance(health, dict) and 'products' in health:
        r.check('health product count', health['products'] == EXPECTED_PRODUCTS, f'{health["products"]} ≠ {EXPECTED_PRODUCTS}')

    status, _, st = c.json('GET', '/api/auth/status')
    if not r.check('auth status (public)', status == 200 and isinstance(st, dict) and set(st) == {'enabled', 'configured', 'authenticated'}, f'HTTP {status}'):
        return 1
    enabled = bool(st['enabled'])
    if enabled:
        if not r.check('auth configured', bool(st['configured']), 'python app/scripts/manage_auth.py --set 을 먼저 실행하세요'):
            return 1
        status, _, body = c.json('GET', '/api/products')
        r.check('unauthenticated API → 401', status == 401 and isinstance(body, dict) and body.get('code') == 'auth_required', f'HTTP {status}')
        status, headers, _ = c.request('GET', '/', headers={'Accept': 'text/html'})
        location = headers.get('Location', '') if headers else ''
        r.check('unauthenticated page → /login.html', status in (302, 303, 307) and location.startswith('/login.html'), f'HTTP {status} {location}')
        status, _, raw = c.request('GET', '/login.html', headers={'Accept': 'text/html'})
        r.check('login page (public)', status == 200 and b'id="password"' in raw, f'HTTP {status}')
        status, _, _ = c.json('POST', '/api/auth/login', body={'username': 'x', 'password': 'x'}, headers={'Origin': 'http://evil.invalid'})
        r.check('cross-origin login POST → 403', status == 403, f'HTTP {status}')

        password = _password(args)
        if not password:
            r.check('login', False, f'비밀번호가 없습니다 — {args.password_env} 환경 변수, --password-stdin 또는 --prompt 를 쓰세요')
            return 1
        status, headers, body = c.json('POST', '/api/auth/login', body={'username': args.username, 'password': password},
                                       headers={'Origin': c.origin})
        password = None  # noqa: F841 — drop the reference as soon as it is used
        cookie, attrs = _session_cookie(headers) if headers else (None, '')
        if not r.check('login', status == 200 and isinstance(body, dict) and body.get('ok') is True and bool(cookie), f'HTTP {status}'):
            return 1
        r.check('session cookie flags', 'httponly' in attrs and 'samesite=strict' in attrs and 'max-age=43200' in attrs, 'HttpOnly/SameSite=Strict/Max-Age 누락')
        leaked = [k for k in ('hash', 'salt', 'secret', 'password', 'token') if k in (body or {})]
        r.check('login response has no secrets', not leaked, ', '.join(leaked))
        c.cookie = cookie
        status, _, st = c.json('GET', '/api/auth/status')
        r.check('auth status authenticated', status == 200 and isinstance(st, dict) and st.get('authenticated') is True, f'HTTP {status}')
    else:
        r.skip('login checks', '서버에서 로그인이 꺼져 있습니다(WINMATE_AUTH=off)')

    status, _, caps = c.json('GET', '/api/poc/capabilities')
    r.check('PoC capabilities', status == 200 and isinstance(caps, dict), f'HTTP {status}')
    status, _, products = c.json('GET', '/api/products')
    items = products.get('items') if isinstance(products, dict) else None
    r.check(f'products = {EXPECTED_PRODUCTS}', status == 200 and isinstance(items, list) and len(items) == EXPECTED_PRODUCTS
            and products.get('total') == EXPECTED_PRODUCTS, f'HTTP {status} items={len(items) if isinstance(items, list) else "-"}')
    if isinstance(items, list) and items:
        first = str(items[0].get('id', ''))
        status, _, one = c.json('GET', '/api/products/' + quote(first, safe=''))
        r.check('product detail', status == 200 and isinstance(one, dict) and one.get('id') == first, f'HTTP {status}')
    status, headers, raw = c.request('GET', '/', headers={'Accept': 'text/html'})
    r.check('app root', status == 200 and b'<html' in raw[:4096].lower(), f'HTTP {status}')
    status, _, _ = c.request('HEAD', '/reference/', headers={'Accept': 'text/html'})
    r.check('frozen reference', status == 200, f'HTTP {status}')

    if enabled:
        status, headers, _ = c.json('POST', '/api/auth/logout', body={}, headers={'Origin': c.origin})
        cleared, attrs = _session_cookie(headers) if headers else (None, '')
        r.check('logout', status == 200 and 'max-age=0' in attrs, f'HTTP {status}')
        status, _, _ = c.json('GET', '/api/products')            # old cookie still attached on purpose
        r.check('revoked session → 401', status == 401, f'HTTP {status}')
        c.cookie = None

    print(f'\n{"OK" if not r.failed else "FAILED"} — {len(r.failed)} failed' + (': ' + ', '.join(r.failed) if r.failed else ''))
    return 1 if r.failed else 0


def main(argv: Optional[list] = None) -> int:
    default = os.environ.get('WINMATE_SMOKE_URL') or f'http://127.0.0.1:{os.environ.get("WINMATE_API_PORT", "8788")}'
    p = argparse.ArgumentParser(description='Winmate smoke test (stdlib only; credentials are never printed)')
    p.add_argument('--base', default=default, help=f'server URL (default {default})')
    p.add_argument('--username', default=os.environ.get('WINMATE_SMOKE_USER', 'admin'))
    p.add_argument('--password-env', default='WINMATE_SMOKE_PASSWORD', metavar='NAME', help='environment variable holding the password')
    src = p.add_mutually_exclusive_group()
    src.add_argument('--password-stdin', action='store_true', help='read the password from the first line of stdin')
    src.add_argument('--prompt', action='store_true', help='ask for the password (hidden input)')
    p.add_argument('--timeout', type=float, default=60.0)
    args = p.parse_args(argv)
    if urlsplit(args.base).scheme not in ('http', 'https'):
        print('오류: --base 는 http(s):// 주소여야 합니다.', file=sys.stderr)
        return 2
    return run(args)


if __name__ == '__main__':
    raise SystemExit(main())
