"""Winmate login account — create, change, inspect. Only a salted PBKDF2 hash is stored.

  python app/scripts/manage_auth.py --ensure            # first run: create an account if none exists
                                                        #   (random password shown once on the terminal)
  python app/scripts/manage_auth.py --set               # choose/change the password (asks twice, hidden input)
  python app/scripts/manage_auth.py --set --password-file /path/0600-file
  WINMATE_NEW_PASSWORD=... python app/scripts/manage_auth.py --set --password-env WINMATE_NEW_PASSWORD
  python app/scripts/manage_auth.py --status            # exit 1 when login is enabled but no account exists
  python app/scripts/manage_auth.py --rotate-secret     # sign everyone out
  python app/scripts/manage_auth.py --remove --yes      # delete the account (the app then refuses all pages)

Files go to WINMATE_AUTH_DIR (default app/data/runtime/auth) or --auth-dir. Passwords are never written to
disk, logs or stdout; a generated password is written only to the controlling terminal (/dev/tty).
Run with the app interpreter (app/.venv/bin/python) — app.api.auth imports fastapi.
"""
from __future__ import annotations

import argparse
import dataclasses
import getpass
import os
import stat
import sys
from pathlib import Path
from typing import Callable, Mapping, Optional, TextIO

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

try:
    from app.api import auth as A  # noqa: E402
except ImportError as _exc:  # fastapi is imported by app.api.auth
    raise SystemExit(f'오류: {_exc} — app/.venv/bin/python -m pip install -r app/api/requirements.txt 후 app/.venv/bin/python 으로 실행하세요.')


class UsageError(Exception):
    pass


def _open_tty() -> Optional[TextIO]:
    try:
        return open('/dev/tty', 'w', encoding='utf-8')
    except OSError:
        return None


def _password_from_sources(args: argparse.Namespace, environ: Mapping[str, str], stdin: TextIO) -> Optional[str]:
    if args.password_env:
        value = environ.get(args.password_env)
        if not value:
            raise UsageError(f'환경 변수 {args.password_env} 가 비어 있습니다.')
        return value
    if args.password_file:
        path = Path(args.password_file).expanduser()
        try:
            mode = stat.S_IMODE(path.stat().st_mode)
            first = path.read_text(encoding='utf-8').splitlines()
        except (OSError, UnicodeDecodeError) as exc:
            raise UsageError(f'비밀번호 파일을 읽지 못했습니다: {path} ({type(exc).__name__})') from None
        if mode & 0o077:
            print(f'경고: {path} 는 다른 사용자도 읽을 수 있습니다(chmod 600 권장). 사용 후 지우세요.', file=sys.stderr)
        if not first or not first[0]:
            raise UsageError(f'비밀번호 파일이 비어 있습니다: {path}')
        return first[0]
    if args.password_stdin:
        line = stdin.readline().rstrip('\r\n')
        if not line:
            raise UsageError('표준 입력에서 비밀번호를 받지 못했습니다.')
        return line
    return None


def _prompt_password(stdin: TextIO) -> str:
    if not stdin.isatty():
        raise UsageError('터미널이 아니라 비밀번호를 물어볼 수 없습니다. --password-file / --password-env / --password-stdin 을 쓰세요.')
    first = getpass.getpass(f'새 비밀번호 ({A.MIN_PASSWORD}자 이상): ')
    if first != getpass.getpass('한 번 더: '):
        raise UsageError('두 비밀번호가 다릅니다.')
    return first


def _mode(path: Path) -> str:
    try:
        return oct(stat.S_IMODE(path.stat().st_mode))
    except OSError:
        return '-'


def main(argv: Optional[list] = None, environ: Optional[Mapping[str, str]] = None, stdin: Optional[TextIO] = None,
         stdout: Optional[TextIO] = None, tty: Optional[Callable[[], Optional[TextIO]]] = None) -> int:
    environ = os.environ if environ is None else environ
    stdin = stdin or sys.stdin
    out = stdout or sys.stdout
    tty = tty or _open_tty
    parser = argparse.ArgumentParser(description='Winmate 로그인 계정 관리 (비밀번호는 해시로만 저장)')
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--ensure', action='store_true', help='계정이 없으면 만든다(비밀번호 출처가 없으면 무작위 생성 후 터미널에 한 번 표시)')
    action.add_argument('--set', action='store_true', help='비밀번호를 정하거나 바꾼다(기존 세션은 모두 끝남)')
    action.add_argument('--status', action='store_true', help='상태 표시(해시 · 비밀값은 표시하지 않음)')
    action.add_argument('--rotate-secret', action='store_true', help='세션 서명 키를 바꿔 모두 로그아웃시킨다')
    action.add_argument('--remove', action='store_true', help='계정을 지운다(--yes 필요)')
    parser.add_argument('--username', help='아이디 (기본: 기존 아이디 또는 admin)')
    src = parser.add_mutually_exclusive_group()
    src.add_argument('--password-env', metavar='NAME', help='이 이름의 환경 변수에서 비밀번호를 읽는다')
    src.add_argument('--password-file', metavar='PATH', help='파일 첫 줄에서 비밀번호를 읽는다(0600 권장)')
    src.add_argument('--password-stdin', action='store_true', help='표준 입력 첫 줄에서 비밀번호를 읽는다')
    parser.add_argument('--auth-dir', help='자격 증명 디렉터리 (기본: WINMATE_AUTH_DIR 또는 app/data/runtime/auth)')
    parser.add_argument('--yes', action='store_true', help='--remove 확인')
    parser.add_argument('--iterations', type=int, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    config = A.config_from_env(environ)
    if args.auth_dir:
        auth_dir = Path(args.auth_dir).expanduser()
        config = dataclasses.replace(config, auth_dir=auth_dir if auth_dir.is_absolute() else Path.cwd() / auth_dir)
    auth = A.Auth(config)
    say = lambda *parts: print(*parts, file=out)  # noqa: E731

    try:
        if args.status:
            creds = auth.credentials()
            say(f'login: {"enabled" if config.enabled else "DISABLED (WINMATE_AUTH=off)"}')
            say(f'directory: {config.auth_dir} ({_mode(config.auth_dir)})')
            if creds:
                say(f'account: {creds.username} · pbkdf2_sha256 × {creds.iterations} · created {creds.created_at} · file {_mode(config.credentials_path)}')
            elif auth.last_error:
                say(f'account: INVALID — {auth.last_error}')
            else:
                say('account: none — run manage_auth.py --set (or --ensure)')
            say(f'session secret: {"present" if config.secret_path.is_file() else "absent (created on first use)"} ({_mode(config.secret_path)})')
            return 1 if config.enabled and creds is None else 0

        if args.rotate_secret:
            auth.rotate_secret()
            say('세션 서명 키를 바꿨습니다 — 모든 브라우저가 다시 로그인해야 합니다.')
            return 0

        if args.remove:
            if not args.yes:
                raise UsageError('--remove 는 --yes 와 함께 실행하세요.')
            say('계정을 지웠습니다.' if auth.remove_credentials() else '지울 계정이 없습니다.')
            return 0

        if args.ensure:
            if not config.enabled:
                say('로그인이 꺼져 있습니다(WINMATE_AUTH=off) — 계정을 만들지 않습니다.')
                return 0
            if auth.configured():
                auth.secret()
                say(f'로그인 계정이 이미 있습니다 ({config.credentials_path}).')
                return 0
            if config.credentials_path.exists():
                raise UsageError(f'{config.credentials_path} 를 읽을 수 없습니다: {auth.last_error} — --set 으로 다시 만드세요.')
            username = args.username or 'admin'
            password = _password_from_sources(args, environ, stdin)
            if password is not None:
                auth.set_credentials(username, password, args.iterations)
                say(f'로그인 계정을 만들었습니다: {username}')
                return 0
            terminal = tty()
            if terminal is None:
                raise UsageError('계정이 없고 비밀번호를 보여줄 터미널도 없습니다. '
                                 'python app/scripts/manage_auth.py --set --password-file <0600 파일> 로 먼저 만드세요.')
            password = A.generate_password()
            auth.set_credentials(username, password, args.iterations)
            try:
                terminal.write('\n' + '=' * 60 + '\n'
                               '  Winmate 첫 로그인 계정을 만들었습니다 (지금 한 번만 표시)\n'
                               f'  아이디   : {username}\n'
                               f'  비밀번호 : {password}\n'
                               '  서버에는 해시만 저장됩니다. 바꾸려면:\n'
                               '  python app/scripts/manage_auth.py --set\n'
                               + '=' * 60 + '\n\n')
                terminal.flush()
            finally:
                if tty is _open_tty:
                    terminal.close()
            del password
            say(f'로그인 계정을 만들었습니다: {username} (비밀번호는 터미널에만 표시했습니다)')
            return 0

        # --set
        current = auth.credentials()
        username = args.username or (current.username if current else 'admin')
        password = _password_from_sources(args, environ, stdin)
        if password is None:
            password = _prompt_password(stdin)
        auth.set_credentials(username, password, args.iterations)
        say(f'비밀번호를 저장했습니다: {username} — 기존 세션은 모두 끝났습니다.')
        return 0
    except (UsageError, ValueError, A.AuthError) as exc:
        print(f'오류: {exc}', file=sys.stderr)
        return 2
    except OSError as exc:
        print(f'오류: 자격 증명 파일을 쓰지 못했습니다 ({type(exc).__name__}: {exc.strerror or exc})', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
