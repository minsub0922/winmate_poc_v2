"""코드 에이전트 연결 — Claude Code · Codex CLI 를 관리자 전용 계정으로 OAuth 연결하고, 고정 프롬프트를 실행한다.

- 연결 정보는 서버 계정의 개인 로그인과 섞이지 않게 `admin/runtime/agent/<provider>/` 를 CLI 의 홈으로 쓴다
  (Claude Code: CLAUDE_CONFIG_DIR, Codex: CODEX_HOME). 토큰은 CLI 가 그 안(또는 OS 키체인)에 보관하고, 관리자 DB · 로그 · 브라우저에는 남기지 않는다.
- OAuth 는 CLI 의 공식 로그인 명령을 가상 터미널에서 실행해 진행한다. 화면에는 인증 주소만 보여 주고,
  Claude Code 는 브라우저가 보여 준 코드를 받아 넘기고, Codex 는 기기 코드를 보여 준다.
- 실행은 저장소 루트에서 비대화형으로 한다. 프롬프트는 호출하는 쪽이 정한 고정 글이며 표준 입력으로 넘긴다.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import pty
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid

from .config import ROOT

PROVIDERS = {
    'claude': {'name': 'Claude Code', 'bin': 'WINMATE_AGENT_CLAUDE_BIN', 'default': 'claude', 'home': 'CLAUDE_CONFIG_DIR', 'account': 'Claude 구독 계정'},
    'codex': {'name': 'Codex', 'bin': 'WINMATE_AGENT_CODEX_BIN', 'default': 'codex', 'home': 'CODEX_HOME', 'account': 'ChatGPT 계정'},
}
ANSI = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[=>()][0-9A-Za-z]?|\r')
# 에이전트가 관리자 서버의 다른 인증 수단(API 키 · 개인 토큰)을 쓰지 않게 뺀다 — 이 연결은 OAuth 로만 한다
STRIP_ENV = ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN',
             'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_CODE_SESSION_ID')
LOGIN_TTL = 15 * 60


class AgentError(ValueError):
    pass


def clean(text):
    return ANSI.sub('', text)


class Agents:
    def __init__(self, runtime: Path):
        self.root = runtime / 'agent'
        self.logins = {}
        self.lock = threading.Lock()

    # ── 설치 · 연결 상태 ──
    def binary(self, provider):
        spec = PROVIDERS[provider]
        return shutil.which(os.environ.get(spec['bin']) or spec['default'])

    def home(self, provider):
        path = self.root / provider
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(0o700)
        return path

    def env(self, provider):
        env = {k: v for k, v in os.environ.items() if k not in STRIP_ENV}
        env.update({PROVIDERS[provider]['home']: str(self.home(provider)), 'BROWSER': '/usr/bin/true', 'NO_COLOR': '1', 'TERM': 'xterm', 'PYTHONDONTWRITEBYTECODE': '1'})
        return env

    def call(self, provider, args, timeout=25):
        binary = self.binary(provider)
        if not binary:
            raise AgentError(PROVIDERS[provider]['name'] + ' CLI 가 이 서버에 설치되어 있지 않습니다.')
        try:
            return subprocess.run([binary, *args], capture_output=True, text=True, timeout=timeout, env=self.env(provider), cwd=str(ROOT), stdin=subprocess.DEVNULL)
        except subprocess.TimeoutExpired:
            raise AgentError(PROVIDERS[provider]['name'] + ' CLI 가 응답하지 않습니다.') from None

    def status(self, provider):
        spec = PROVIDERS[provider]
        result = {'id': provider, 'name': spec['name'], 'account_kind': spec['account'], 'installed': bool(self.binary(provider)), 'connected': False, 'account': None, 'version': None}
        if not result['installed']:
            return result
        try:
            version = self.call(provider, ['--version'], 15)
            result['version'] = clean(version.stdout).strip().splitlines()[0][:60] if version.stdout.strip() else None
            if provider == 'claude':
                data = json.loads(self.call(provider, ['auth', 'status', '--json']).stdout or '{}')
                result['connected'] = bool(data.get('loggedIn'))
                result['account'] = data.get('email') or data.get('orgName') or (data.get('authMethod') if data.get('loggedIn') else None)
                result['method'] = data.get('authMethod')
            else:
                out = self.call(provider, ['login', 'status'])
                text = clean(out.stdout + out.stderr).strip()
                result['connected'] = out.returncode == 0 and 'not logged in' not in text.lower()
                result['account'] = text.splitlines()[0][:80] if result['connected'] and text else None
        except (AgentError, ValueError) as exc:
            result['error'] = str(exc)[:200]
        login = self.logins.get(provider)
        if login and login.state in ('starting', 'waiting', 'verifying'):
            result['login'] = login.public()
        return result

    def overview(self):
        return [self.status(p) for p in PROVIDERS]

    # ── OAuth 연결 ──
    def login_start(self, provider):
        if provider not in PROVIDERS:
            raise AgentError('지원하지 않는 에이전트입니다.')
        binary = self.binary(provider)
        if not binary:
            raise AgentError(PROVIDERS[provider]['name'] + ' CLI 가 이 서버에 설치되어 있지 않습니다.')
        with self.lock:
            old = self.logins.get(provider)
            if old:
                old.stop('cancelled')
            args = ['auth', 'login', '--claudeai'] if provider == 'claude' else ['login', '--device-auth']
            login = Login(provider, [binary, *args], self.env(provider), lambda: self.status_connected(provider))
            self.logins[provider] = login
        login.wait_ready()
        return login.public()

    def status_connected(self, provider):
        try:
            return self.status(provider)['connected']
        except Exception:  # noqa: BLE001
            return False

    def login_get(self, session):
        for login in self.logins.values():
            if login.id == session:
                return login
        raise AgentError('연결 세션을 찾지 못했습니다. 다시 시작해 주세요.')

    def logout(self, provider):
        if provider not in PROVIDERS:
            raise AgentError('지원하지 않는 에이전트입니다.')
        login = self.logins.pop(provider, None)
        if login:
            login.stop('cancelled')
        self.call(provider, ['auth', 'logout'] if provider == 'claude' else ['logout'], 40)
        return self.status(provider)

    def close(self):
        """서버가 내려갈 때 진행 중인 로그인 명령을 끝낸다."""
        for login in list(self.logins.values()):
            login.stop('cancelled')

    # ── 고정 프롬프트 실행 ──
    def command(self, provider, model=None, git='none'):
        binary = self.binary(provider)
        if not binary:
            raise AgentError(PROVIDERS[provider]['name'] + ' CLI 가 이 서버에 설치되어 있지 않습니다.')
        if provider == 'claude':
            deny = ['Bash(git push:*)', 'Bash(git reset --hard:*)', 'Bash(git clean:*)', 'Bash(git stash:*)']
            if git == 'none':
                deny.append('Bash(git commit:*)')
            elif git == 'push':
                deny.remove('Bash(git push:*)')
            command = [binary, '-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
                       '--allowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'Agent',
                       '--disallowedTools', *deny]
            return command + (['--model', model] if model else [])
        sandbox = os.environ.get('WINMATE_AGENT_CODEX_SANDBOX', 'workspace-write')  # 수집 · 렌더가 샌드박스에 막히는 서버에서는 danger-full-access
        command = [binary, 'exec', '--json', '--skip-git-repo-check', '--sandbox', sandbox, '-c', 'sandbox_workspace_write.network_access=true', '-C', str(ROOT)]
        return command + (['-m', model] if model else []) + ['-']

    def run(self, provider, prompt, directory: Path, cancel, on_event=None, model=None, git='none', timeout=None):
        """프롬프트를 실행하고 (끝난 코드, 마지막 답, 사용량) 을 돌려준다. 원본 이벤트는 agent.jsonl, 읽기용 글은 agent.log 에 남긴다."""
        directory.mkdir(parents=True, exist_ok=True)
        timeout = timeout or int(os.environ.get('WINMATE_AGENT_TIMEOUT_MIN', '240')) * 60
        command = self.command(provider, model, git)
        final, usage = {'text': '', 'error': None}, {}
        with (directory / 'agent.jsonl').open('a', encoding='utf-8') as raw, (directory / 'agent.log').open('a', encoding='utf-8') as log:
            def note(line):
                log.write(time.strftime('%H:%M:%S ') + line.rstrip() + '\n')
                log.flush()
                if on_event:
                    on_event(line)
            note(f'[시작] {PROVIDERS[provider]["name"]} · 저장소 {ROOT.name}')
            process = subprocess.Popen(command, cwd=str(ROOT), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                       env=self.env(provider), start_new_session=True)
            started = time.monotonic()

            def watchdog():
                while process.poll() is None:
                    if cancel() or time.monotonic() - started > timeout:
                        try:
                            os.killpg(process.pid, signal.SIGTERM)
                            time.sleep(5)
                            if process.poll() is None:
                                os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        return
                    time.sleep(1)
            threading.Thread(target=watchdog, daemon=True).start()
            try:
                process.stdin.write(prompt)
                process.stdin.close()
            except BrokenPipeError:
                pass
            for line in process.stdout:
                raw.write(line)
                raw.flush()
                for text in describe(line, final, usage):
                    note(text)
            code = process.wait()
            if cancel():
                note('[취소] 관리자가 실행을 취소했습니다.')
            elif time.monotonic() - started > timeout:
                final['error'] = f'{timeout // 60}분 안에 끝나지 않아 중단했습니다.'
                note('[중단] ' + final['error'])
            note(f'[끝] 코드 {code}')
        return code, final, usage


def describe(line, final, usage):
    """CLI 의 JSON 이벤트 한 줄 → 사람이 읽는 로그 줄(Claude Code stream-json · Codex --json 둘 다)."""
    line = line.strip()
    if not line:
        return []
    try:
        event = json.loads(line)
    except ValueError:
        return [clean(line)[:600]]
    if not isinstance(event, dict):
        return []
    kind, out = event.get('type'), []
    short = lambda v, n=260: re.sub(r'\s+', ' ', str(v))[:n]
    if kind == 'system' and event.get('subtype') == 'init':
        out.append(f"[준비] 모델 {event.get('model')}")
    elif kind == 'assistant':
        for part in (event.get('message') or {}).get('content') or []:
            if part.get('type') == 'text' and part.get('text', '').strip():
                final['text'] = part['text']
                out.append('[에이전트] ' + part['text'].strip()[:1500])
            elif part.get('type') == 'tool_use':
                value = part.get('input') or {}
                out.append(f"[도구] {part.get('name')}: " + short(value.get('command') or value.get('file_path') or value.get('pattern') or value.get('url') or value.get('description') or value))
    elif kind == 'result':
        if event.get('result'):
            final['text'] = event['result']
        if event.get('is_error'):
            final['error'] = short(event.get('result') or event.get('subtype'), 500)
        usage.update({k: event.get(k) for k in ('num_turns', 'duration_ms', 'total_cost_usd') if event.get(k) is not None})
        out.append(f"[결과] {'오류' if event.get('is_error') else '완료'} · {event.get('num_turns')}턴")
    elif kind in ('item.started', 'item.completed'):
        item = event.get('item') or {}
        if item.get('type') == 'agent_message' and kind == 'item.completed' and item.get('text'):
            final['text'] = item['text']
            out.append('[에이전트] ' + item['text'].strip()[:1500])
        elif item.get('type') == 'command_execution' and kind == 'item.started':
            out.append('[도구] 명령: ' + short(item.get('command')))
        elif item.get('type') in ('file_change', 'patch') and kind == 'item.completed':
            out.append('[도구] 파일 수정: ' + short([c.get('path') for c in item.get('changes', [])] or item))
    elif kind == 'turn.completed':
        usage.update(event.get('usage') or {})
    elif kind in ('error', 'turn.failed'):
        final['error'] = short(event.get('message') or (event.get('error') or {}).get('message') or event, 500)
        out.append('[오류] ' + final['error'])
    return out


class Login:
    """CLI 로그인 명령 하나를 가상 터미널에서 돌린다. 인증 주소(와 기기 코드)를 읽어 화면에 넘기고, 받은 코드를 CLI 에 넣는다."""

    def __init__(self, provider, command, env, connected):
        self.id, self.provider, self.connected = uuid.uuid4().hex, provider, connected
        self.state, self.url, self.code, self.error, self.output = 'starting', None, None, None, ''
        self.started = time.monotonic()
        self.master, slave = pty.openpty()
        self.process = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, env=env, cwd=str(ROOT), start_new_session=True, close_fds=True)
        os.close(slave)
        threading.Thread(target=self.read, daemon=True).start()
        # CLI 가 입력을 기다리며 아무것도 내지 않아도 제한 시간이 지나면 끝낸다
        self.timer = threading.Timer(LOGIN_TTL, self.stop, ('expired',))
        self.timer.daemon = True
        self.timer.start()

    def read(self):
        while True:
            try:
                data = os.read(self.master, 65536)
            except OSError:
                data = b''
            if not data:
                break
            self.output = (self.output + clean(data.decode('utf-8', 'replace')))[-20000:]
            self.parse()
        code = self.process.wait()
        self.timer.cancel()
        try:
            os.close(self.master)
        except OSError:
            pass
        if self.state in ('cancelled', 'expired'):
            return
        if self.connected():
            self.state = 'connected'
        else:
            self.state, self.error = 'failed', self.tail() or f'로그인 명령이 코드 {code} 로 끝났습니다.'

    def parse(self):
        text = self.output
        if self.provider == 'claude':
            # 터미널 폭에서 줄이 접혀도 주소가 끊기지 않게 줄바꿈을 지우고 읽는다
            found = re.search(r'visit:\s*(https://[^\s]+(?:\n[^\s]+)*?)(?=\s*\n?\s*Paste code|\s*$)', text)
            if found:
                self.url = re.sub(r'\s+', '', found.group(1))
        else:
            found = re.search(r'(https://auth\.openai\.com/\S+)', text)
            code = re.search(r'one-time code[^\n]*\n\s*([A-Z0-9]{4}-[A-Z0-9]{4,6})', text)
            if found:
                self.url = found.group(1)
            if code:
                self.code = code.group(1)
        if self.url and self.state == 'starting' and (self.provider == 'claude' or self.code):
            self.state = 'waiting'

    def wait_ready(self, seconds=20):
        deadline = time.monotonic() + seconds
        while self.state == 'starting' and time.monotonic() < deadline:
            time.sleep(0.2)
        if self.state == 'starting':
            self.stop('failed')
            self.error = '인증 주소를 받지 못했습니다. ' + self.tail()
            raise AgentError(self.error)

    def submit(self, code):
        code = (code or '').strip()
        if self.provider != 'claude':
            raise AgentError('이 에이전트는 화면의 기기 코드를 인증 페이지에 입력합니다.')
        if self.state != 'waiting':
            raise AgentError('코드를 받을 수 있는 상태가 아닙니다. 연결을 다시 시작해 주세요.')
        if not re.fullmatch(r'[A-Za-z0-9_\-#.~=+/]{8,600}', code):
            raise AgentError('인증 페이지가 보여 준 코드를 그대로 붙여 넣어 주세요.')
        self.state = 'verifying'
        os.write(self.master, code.encode() + b'\r')

    def stop(self, state):
        if self.state in ('connected', 'failed', 'cancelled', 'expired'):
            return
        self.state = state
        try:
            os.killpg(self.process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    def tail(self):
        lines = [l.strip() for l in self.output.splitlines() if l.strip() and 'https://' not in l and 'Paste code' not in l]
        return ' '.join(lines[-3:])[:300]

    def public(self):
        return {'session': self.id, 'provider': self.provider, 'state': self.state, 'url': self.url, 'code': self.code, 'needs_code': self.provider == 'claude',
                'error': self.error, 'expires_in': max(0, int(LOGIN_TTL - (time.monotonic() - self.started)))}
