"""Login, session, CSRF and credential-tool tests. Every test uses its own temporary auth directory and an
injected clock; nothing touches app/data/runtime/auth or os.environ."""
from __future__ import annotations

import base64
import contextlib
import hashlib
import hmac
import importlib.util
import io
import json
import re
import stat
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, Response
from fastapi.testclient import TestClient

from app.api import auth as A

ROOT = Path(__file__).resolve().parents[2]
PASSWORD = 'correct horse battery 9'
ITERATIONS = 2_000          # production default is 600,000; tests only need the same code path


class Clock:
    def __init__(self) -> None:
        self.t = 1_800_000_000.0

    def __call__(self) -> float:
        return self.t


def build_app(auth: A.Auth) -> FastAPI:
    app = FastAPI()

    @app.get('/api/health')
    def health():
        return {'ok': True}

    @app.get('/api/private')
    @app.get('/api/products')
    def products():
        return {'total': 1068}

    @app.post('/api/jobs')
    def jobs():
        return {'ok': True}

    @app.get('/')
    def index():
        return HTMLResponse('<html>app</html>')

    @app.get('/reference/index.html')
    def reference():
        return HTMLResponse('<html>reference</html>')

    @app.get('/img/a.png')
    def image():
        return Response(b'png', media_type='image/png')

    @app.get('/fonts/a.woff2')
    def font():
        return Response(b'font', media_type='font/woff2')

    A.integrate_app(app, auth)
    return app


def b64url_json(body: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))


def b64url(d: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(d, separators=(',', ':')).encode()).decode().rstrip('=')


def session_cookie(response) -> tuple[str | None, str]:
    for line in response.headers.get_list('set-cookie'):
        name, _, rest = line.partition('=')
        if name.strip() == A.COOKIE_NAME:
            value, _, attrs = rest.partition(';')
            return value.strip().strip('"'), attrs.lower()
    return None, ''


class AuthCase(unittest.TestCase):
    enabled = True

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name) / 'auth'
        self.clock = Clock()
        self.auth = A.Auth(A.AuthConfig(enabled=self.enabled, auth_dir=self.dir, iterations=ITERATIONS), clock=self.clock)
        self.client = TestClient(build_app(self.auth))

    def tearDown(self) -> None:
        self.client.close()
        self._tmp.cleanup()

    def configure(self, password: str = PASSWORD) -> None:
        self.auth.set_credentials('admin', password)

    def login(self, username: str = 'admin', password: str = PASSWORD, **headers):
        response = self.client.post('/api/auth/login', json={'username': username, 'password': password}, headers=headers)
        self.client.cookies.clear()          # every later request passes the cookie explicitly
        return response

    def token(self) -> str:
        response = self.login()
        self.assertEqual(response.status_code, 200, response.text)
        value, _ = session_cookie(response)
        self.assertTrue(value)
        return value

    def get(self, path: str, token: str | None = None, **headers):
        if token is not None:
            headers['Cookie'] = f'{A.COOKIE_NAME}={token}'
        return self.client.get(path, headers=headers, follow_redirects=False)


class SessionTests(AuthCase):
    def test_status_is_public_and_minimal(self):
        self.assertEqual(self.get('/api/auth/status').json(), {'enabled': True, 'configured': False, 'authenticated': False})
        self.configure()
        self.assertEqual(self.get('/api/auth/status').json(), {'enabled': True, 'configured': True, 'authenticated': False})
        status = self.get('/api/auth/status', self.token())
        self.assertEqual(status.json(), {'enabled': True, 'configured': True, 'authenticated': True})
        self.assertEqual(status.headers['cache-control'], 'no-store')

    def test_unconfigured_server_fails_closed(self):
        response = self.get('/api/private')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['code'], 'auth_not_configured')
        page = self.get('/', accept='text/html')
        self.assertEqual(page.status_code, 200)
        self.assertEqual(self.login().status_code, 503)
        self.assertFalse(self.dir.joinpath('credentials.json').exists())

    def test_guest_browsing_does_not_open_private_reads_or_writes(self):
        self.configure()
        for path in ('/', '/api/products', '/img/a.png'):
            self.assertEqual(self.get(path).status_code, 200, path)
        for path in ('/api/private', '/api/jobs', '/api/spatial/history'):
            self.assertEqual(self.get(path).status_code, 401, path)
        for method in ('post', 'put', 'patch', 'delete'):
            for path in ('/api/jobs', '/api/storyboards', '/api/spatial/history'):
                self.assertEqual(getattr(self.client, method)(path, json={}).status_code if method != 'delete'
                                 else self.client.delete(path).status_code, 401, (method, path))

    def test_credential_files_store_only_a_salted_hash(self):
        self.configure()
        cred = self.dir / 'credentials.json'
        raw = cred.read_text()
        self.assertNotIn(PASSWORD, raw)
        record = json.loads(raw)
        self.assertEqual(set(record), {'version', 'username', 'algo', 'iterations', 'salt', 'hash', 'generation', 'created_at'})
        self.assertEqual(record['algo'], 'pbkdf2_sha256')
        expected = hashlib.pbkdf2_hmac('sha256', PASSWORD.encode(), base64.b64decode(record['salt']), record['iterations'])
        self.assertEqual(base64.b64decode(record['hash']), expected)
        self.assertEqual(stat.S_IMODE(cred.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE((self.dir / 'session.secret').stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.dir.stat().st_mode), 0o700)
        self.assertNotIn(record['hash'], repr(self.auth.credentials()))
        # a second account write uses a fresh salt
        self.configure()
        self.assertNotEqual(json.loads(cred.read_text())['salt'], record['salt'])

    def test_loose_permissions_are_tightened(self):
        self.configure()
        cred = self.dir / 'credentials.json'
        cred.chmod(0o644)
        self.auth._creds = (None, None)
        self.assertTrue(self.auth.configured())
        self.assertEqual(stat.S_IMODE(cred.stat().st_mode), 0o600)

    def test_valid_login_sets_hardened_cookie(self):
        self.configure()
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'ok': True, 'expires_in': 12 * 3600})
        value, attrs = session_cookie(response)
        self.assertTrue(value)
        for flag in ('httponly', 'samesite=strict', 'max-age=43200', 'path=/'):
            self.assertIn(flag, attrs)
        self.assertNotIn('secure', attrs)        # plain-http loopback; https requests get Secure
        self.assertEqual(self.get('/api/private', value).json(), {'total': 1068})
        self.assertEqual(self.get('/', value, accept='text/html').status_code, 200)

    def test_invalid_logins(self):
        self.configure()
        for username, password in (('admin', 'wrong password!!'), ('root', PASSWORD), ('ADMIN', PASSWORD)):
            response = self.login(username, password)
            self.assertEqual(response.status_code, 401, username)
            self.assertEqual(response.json()['code'], 'invalid_credentials')
            self.assertEqual(session_cookie(response), (None, ''))
        cases = [
            ({'json': {'username': 'admin'}}, 400),
            ({'json': {'username': 'admin', 'password': 123}}, 400),
            ({'json': ['admin', PASSWORD]}, 400),
            ({'content': b'not json', 'headers': {'content-type': 'application/json'}}, 400),
            ({'data': {'username': 'admin', 'password': PASSWORD}}, 415),
            ({'content': b'{"username":"admin","password":"' + b'x' * 9000 + b'"}', 'headers': {'content-type': 'application/json'}}, 413),
        ]
        for kwargs, status in cases:
            with self.subTest(status=status, kwargs=str(kwargs)[:60]):
                self.assertEqual(self.client.post('/api/auth/login', **kwargs).status_code, status)

    def test_protected_and_public_routes_without_session(self):
        self.configure()
        api = self.get('/api/private')
        self.assertEqual(api.status_code, 401)
        self.assertEqual(api.json()['code'], 'auth_required')
        self.assertEqual(self.client.post('/api/jobs', json={}).status_code, 401)
        for path in ('/reference/index.html',):
            page = self.get(path, accept='text/html')
            self.assertEqual(page.status_code, 303, path)
            self.assertTrue(page.headers['location'].startswith('/login.html?next='))
        self.assertEqual(self.get('/reference/index.html?x=1', accept='text/html').headers['location'],
                         '/login.html?next=%2Freference%2Findex.html%3Fx%3D1')
        self.assertEqual(self.get('/img/a.png', accept='image/*').status_code, 200)
        self.assertEqual(self.get('/fonts/a.woff2').status_code, 200)
        self.assertEqual(self.get('/api/health').status_code, 200)
        page = self.get('/login.html')
        self.assertEqual(page.status_code, 200)
        self.assertIn('id="password"', page.text)
        csp = page.headers['content-security-policy']
        script = re.search(r'<script>(.*?)</script>', page.text, re.S).group(1)
        digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
        self.assertIn(f"'sha256-{digest}'", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertNotIn('unsafe-inline', csp)
        self.assertEqual(re.findall(r'\b(?:src|href|action)\s*=\s*[\"\']([^\"\']+)', page.text), ['/tokens.css'])  # only the shared local tokens, no CDN
        self.assertNotIn('@import', page.text)

    def test_tampered_tokens_are_rejected(self):
        self.configure()
        token = self.token()
        body, sig = token.split('.')
        payload = b64url_json(body)
        longer = dict(payload, exp=payload['exp'] + 3600)
        other_user = dict(payload, u='root')
        forged = [
            body + '.' + ('0' if sig[0] != '0' else '1') + sig[1:],                       # signature bit flip
            b64url(longer) + '.' + sig,                                                  # extended expiry, old signature
            b64url(other_user) + '.' + sig,
            body + '.' + hmac.new(b'0' * 64, body.encode(), hashlib.sha256).hexdigest(),  # signed with another key
            b64url(longer) + '.' + self.auth._sign(b64url(longer)),                     # validly signed but > 12 h lifetime
            'garbage', '', token + '.x', body, '.' + sig,
        ]
        for value in forged:
            with self.subTest(value=value[:24]):
                self.assertEqual(self.get('/api/private', value).status_code, 401)
                self.assertIsNone(self.auth.read_token(value))
        self.assertIsNone(self.auth.read_token('é.' + sig))
        self.assertEqual(self.get('/api/private', token).status_code, 200)
        self.auth.rotate_secret()
        self.assertEqual(self.get('/api/private', token).status_code, 401)

    def test_password_change_ends_existing_sessions(self):
        self.configure()
        token = self.token()
        self.configure('a different password 42')
        self.assertEqual(self.get('/api/private', token).status_code, 401)
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login(password='a different password 42').status_code, 200)

    def test_session_expires_after_12_hours(self):
        self.configure()
        token = self.token()
        self.clock.t += 12 * 3600 - 1
        self.assertEqual(self.get('/api/private', token).status_code, 200)
        self.clock.t += 2
        self.assertEqual(self.get('/api/private', token).status_code, 401)
        self.assertEqual(self.get('/api/auth/status', token).json()['authenticated'], False)

    def test_logout_revokes_the_session(self):
        self.configure()
        token = self.token()
        response = self.client.post('/api/auth/logout', headers={'Cookie': f'{A.COOKIE_NAME}={token}', 'Origin': 'http://testserver'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'ok': True})
        value, attrs = session_cookie(response)
        self.assertFalse(value)
        self.assertIn('max-age=0', attrs)
        self.assertEqual(self.get('/api/private', token).status_code, 401)
        self.assertFalse(self.get('/api/auth/status', token).json()['authenticated'])
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 200)       # idempotent without a session
        self.assertEqual(self.get('/api/private', self.token()).status_code, 200)    # a new login still works

    def test_failed_logins_are_rate_limited(self):
        self.configure()
        for _ in range(5):
            self.assertEqual(self.login(password='wrong password!!').status_code, 401)
        blocked = self.login(password='wrong password!!')
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json()['code'], 'too_many_attempts')
        self.assertTrue(0 < int(blocked.headers['retry-after']) <= 600)
        self.assertEqual(self.login().status_code, 429)                               # even the right password waits
        self.clock.t += 601
        self.assertEqual(self.login().status_code, 200)
        for _ in range(4):
            self.login(password='wrong password!!')
        self.assertEqual(self.login().status_code, 200)                               # success clears the address

    def test_global_failure_limit_across_addresses(self):
        clock = Clock()
        limiter = A.LoginRateLimiter(limit=5, window=600, global_limit=8, clock=clock)
        for key in ('127.0.0.1', '::1', '10.0.0.2', '10.0.0.3'):
            limiter.failure(key)
            limiter.failure(key)
            self.assertEqual(limiter.retry_after(key), 0 if key != '10.0.0.3' else 600)
        self.assertEqual(limiter.retry_after('fresh'), 600)
        clock.t += 600
        self.assertEqual(limiter.retry_after('fresh'), 0)

    def test_no_secret_material_in_responses(self):
        self.configure()
        record = json.loads((self.dir / 'credentials.json').read_text())
        secret = (self.dir / 'session.secret').read_text().strip()
        token = self.token()
        responses = [
            self.get('/api/auth/status'), self.get('/api/auth/status', token), self.login(password='wrong password!!'),
            self.login(), self.get('/api/private'), self.get('/', accept='text/html'), self.get('/login.html'),
            self.client.post('/api/auth/logout', headers={'Cookie': f'{A.COOKIE_NAME}={token}'}),
            self.client.post('/api/auth/login', json={'username': 'admin', 'password': PASSWORD}, headers={'Origin': 'http://evil.example'}),
        ]
        self.client.cookies.clear()
        for response in responses:
            visible = response.text + json.dumps({k: v for k, v in response.headers.items() if k != 'set-cookie'})
            for needle in (PASSWORD, record['hash'], record['salt'], record['generation'], secret, token):
                self.assertNotIn(needle, visible, response.request.url.path)


    def test_reconfigure_switches_in_place_and_back(self):
        self.configure()
        self.assertEqual(self.get('/api/private').status_code, 401)
        previous = self.auth.reconfigure(A.AuthConfig(enabled=False, auth_dir=self.dir))
        self.assertEqual(self.get('/api/private').status_code, 200)
        self.assertEqual(self.login().status_code, 409)
        self.auth.reconfigure(previous)
        self.assertEqual(self.get('/api/private').status_code, 401)
        self.assertEqual(self.login().status_code, 200)


class CsrfTests(AuthCase):
    def test_cross_origin_unsafe_requests_are_rejected(self):
        self.configure()
        evil = self.login(**{'Origin': 'http://evil.example'})
        self.assertEqual(evil.status_code, 403)
        self.assertEqual(evil.json()['code'], 'csrf_rejected')
        self.assertEqual(session_cookie(evil), (None, ''))
        self.assertEqual(self.login(**{'Origin': 'null'}).status_code, 403)
        self.assertEqual(self.login(**{'Sec-Fetch-Site': 'cross-site'}).status_code, 403)
        self.assertEqual(self.login(**{'Referer': 'http://evil.example/form'}).status_code, 403)
        self.assertEqual(self.login(**{'Origin': 'http://testserver'}).status_code, 200)
        token = self.token()
        cookie = {'Cookie': f'{A.COOKIE_NAME}={token}'}
        self.assertEqual(self.client.post('/api/jobs', json={}, headers={**cookie, 'Origin': 'http://evil.example'}).status_code, 403)
        self.assertEqual(self.client.post('/api/jobs', json={}, headers={**cookie, 'Origin': 'http://testserver'}).status_code, 200)
        self.assertEqual(self.client.post('/api/jobs', json={}, headers={**cookie, 'Sec-Fetch-Site': 'same-origin'}).status_code, 200)
        self.assertEqual(self.client.post('/api/jobs', json={}, headers=cookie).status_code, 200)      # non-browser client
        self.assertEqual(self.get('/api/private', token, Origin='http://evil.example').status_code, 200)  # safe method

    def test_loopback_aliases_on_the_same_port(self):
        self.configure()
        with TestClient(self.client.app, base_url='http://127.0.0.1:8788') as client:
            def post(origin):
                return client.post('/api/auth/login', json={'username': 'admin', 'password': PASSWORD}, headers={'Origin': origin}).status_code
            self.assertEqual(post('http://localhost:8788'), 200)
            self.assertEqual(post('http://127.0.0.1:8788'), 200)
            self.assertEqual(post('http://localhost:5173'), 403)
            self.assertEqual(post('http://127.0.0.1.evil.example:8788'), 403)

    def test_origin_rules(self):
        cases = [
            ('http://127.0.0.1:8788', '127.0.0.1:8788', True),
            ('http://localhost:8788', '127.0.0.1:8788', True),
            ('http://[::1]:8788', 'localhost:8788', True),
            ('http://example.test', 'example.test', True),
            ('http://example.test:80', 'example.test', True),
            ('https://example.test', 'example.test', False),          # scheme differs from the request
            ('http://evil.test:8788', '127.0.0.1:8788', False),
            ('http://localhost.evil.test:8788', 'localhost:8788', False),
            ('http://user@127.0.0.1:8788', '127.0.0.1:8788', False),
            ('http://127.0.0.1', '127.0.0.1:8788', False),
            ('http://127.0.0.1:99999', '127.0.0.1:8788', False),
            ('file://', '127.0.0.1:8788', False),
            ('null', '127.0.0.1:8788', False),
            ('', '127.0.0.1:8788', False),
        ]
        for origin, host, expected in cases:
            with self.subTest(origin=origin, host=host):
                self.assertIs(A.origin_allowed(origin, host, 'http'), expected)


class DisabledTests(AuthCase):
    enabled = False

    def test_explicit_off_skips_login_but_keeps_origin_checks(self):
        self.assertEqual(self.get('/api/private').status_code, 200)
        self.assertEqual(self.get('/', accept='text/html').status_code, 200)
        self.assertEqual(self.get('/api/auth/status').json(), {'enabled': False, 'configured': False, 'authenticated': True})
        self.assertEqual(self.login().status_code, 409)
        self.assertEqual(self.client.post('/api/jobs', json={}, headers={'Origin': 'http://evil.example'}).status_code, 403)
        self.assertFalse(self.dir.exists())


class ConfigTests(unittest.TestCase):
    def test_only_explicit_off_disables(self):
        self.assertTrue(A.config_from_env({}).enabled)
        for value in ('off', 'OFF', ' off '):
            self.assertFalse(A.config_from_env({'WINMATE_AUTH': value}).enabled, value)
        for value in ('on', 'false', '0', 'of', 'disabled', ''):
            self.assertTrue(A.config_from_env({'WINMATE_AUTH': value}).enabled, value)

    def test_auth_dir(self):
        self.assertEqual(A.config_from_env({}).auth_dir, ROOT / 'app/data/runtime/auth')
        self.assertEqual(A.config_from_env({'WINMATE_AUTH_DIR': 'var/auth'}).auth_dir, ROOT / 'var/auth')
        self.assertEqual(A.config_from_env({'WINMATE_AUTH_DIR': '/srv/winmate/auth'}).auth_dir, Path('/srv/winmate/auth'))

    def test_password_policy(self):
        with self.assertRaises(ValueError):
            A.validate_password('short')
        with self.assertRaises(ValueError):
            A.validate_password(' padded password ')
        with self.assertRaises(ValueError):
            A.validate_username('admin; rm')
        A.validate_password(PASSWORD)


def load_script(name: str):
    path = ROOT / 'app' / 'scripts' / f'{name}.py'
    saved = list(sys.path)
    try:
        spec = importlib.util.spec_from_file_location(f'_winmate_test_{name}', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path[:] = saved


class ManageAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cli = load_script('manage_auth')

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name) / 'auth'

    def tearDown(self):
        self._tmp.cleanup()

    def run_cli(self, *argv, environ=None, tty=None, stdin=''):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stderr(err):
            code = self.cli.main([*argv, '--auth-dir', str(self.dir), '--iterations', str(ITERATIONS)], environ=environ or {},
                                 stdin=io.StringIO(stdin), stdout=out, tty=tty or (lambda: None))
        return code, out.getvalue(), err.getvalue()

    def auth(self):
        return A.Auth(A.AuthConfig(auth_dir=self.dir))

    def test_ensure_generates_once_and_prints_only_to_the_terminal(self):
        terminal = io.StringIO()
        code, out, err = self.run_cli('--ensure', tty=lambda: terminal)
        self.assertEqual(code, 0, err)
        password = re.search(r'비밀번호 : (\S+)', terminal.getvalue()).group(1)
        self.assertGreaterEqual(len(password), 20)
        self.assertNotIn(password, out + err)
        self.assertNotIn(password, (self.dir / 'credentials.json').read_text())
        self.assertTrue(self.auth().verify_password('admin', password))
        generation = json.loads((self.dir / 'credentials.json').read_text())['generation']
        again = io.StringIO()
        self.assertEqual(self.run_cli('--ensure', tty=lambda: again)[0], 0)
        self.assertEqual(again.getvalue(), '')
        self.assertEqual(json.loads((self.dir / 'credentials.json').read_text())['generation'], generation)

    def test_ensure_without_terminal_refuses_instead_of_leaking(self):
        code, out, err = self.run_cli('--ensure')
        self.assertEqual(code, 2)
        self.assertIn('--set', err)
        self.assertFalse((self.dir / 'credentials.json').exists())

    def test_ensure_and_set_from_environment_variable_and_file(self):
        code, out, err = self.run_cli('--ensure', '--password-env', 'NEW_PW', environ={'NEW_PW': PASSWORD})
        self.assertEqual(code, 0, err)
        self.assertNotIn(PASSWORD, out + err)
        self.assertTrue(self.auth().verify_password('admin', PASSWORD))
        secret_file = Path(self._tmp.name) / 'pw.txt'
        secret_file.write_text('another long password\n')
        secret_file.chmod(0o600)
        code, out, err = self.run_cli('--set', '--username', 'ops', '--password-file', str(secret_file))
        self.assertEqual(code, 0, err)
        self.assertTrue(self.auth().verify_password('ops', 'another long password'))
        self.assertFalse(self.auth().verify_password('admin', PASSWORD))
        code, out, err = self.run_cli('--set', '--password-stdin', stdin='third long password\n')
        self.assertEqual(code, 0, err)
        self.assertTrue(self.auth().verify_password('ops', 'third long password'))

    def test_rejections_and_status(self):
        self.assertEqual(self.run_cli('--set', '--password-env', 'PW', environ={'PW': 'short'})[0], 2)
        self.assertEqual(self.run_cli('--set')[0], 2)                         # no terminal to prompt on
        self.assertEqual(self.run_cli('--status')[0], 1)
        self.run_cli('--set', '--password-env', 'PW', environ={'PW': PASSWORD})
        code, out, _ = self.run_cli('--status')
        self.assertEqual(code, 0)
        record = json.loads((self.dir / 'credentials.json').read_text())
        for needle in (record['hash'], record['salt'], PASSWORD):
            self.assertNotIn(needle, out)
        self.assertEqual(self.run_cli('--remove')[0], 2)
        self.assertEqual(self.run_cli('--remove', '--yes')[0], 0)
        self.assertFalse((self.dir / 'credentials.json').exists())

    def test_disabled_ensure_writes_nothing(self):
        code, out, _ = self.run_cli('--ensure', environ={'WINMATE_AUTH': 'off'})
        self.assertEqual(code, 0)
        self.assertFalse(self.dir.exists())


@unittest.skipUnless((ROOT / 'reference/live/export-manifest.json').is_file(), 'frozen reference not present')
class PreflightTests(unittest.TestCase):
    def test_fast_preflight_on_this_checkout(self):
        preflight = load_script('preflight')
        results = {i['name']: i for i in preflight.run(deep=False, require_auth=False).items if i['level'] != 'warn'}
        for name in ('frozen reference', 'PoC sources', 'canonical KB', 'original SQLite', 'app data'):
            self.assertEqual(results[name]['level'], 'ok', results[name])


if __name__ == '__main__':
    unittest.main()
