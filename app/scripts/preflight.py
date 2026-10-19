"""Read-only startup preflight for the Winmate app.

  python app/scripts/preflight.py            # fast: existence + sizes from manifests (no full checksums)
  python app/scripts/preflight.py --deep     # also SHA-256 of the 511 frozen files, KB inputs/outputs, SQLite quick_check
  python app/scripts/preflight.py --json

Checks the original SQLite database, the 511 frozen published files (reference/live/export-manifest.json),
app data inputs, the original PoC modules the adapters import, the canonical agent KB snapshot, the web
build and the login state. Nothing is written, chmod-ed or imported from poc/. Exit 0 = no failures
(warnings allowed), 1 = at least one failure; every failure carries the command that fixes it.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sqlite3
import stat
import sys
from pathlib import Path, PurePosixPath
from typing import Iterable, List, Optional

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

try:
    from app.api.poc.settings import load_settings as load_gemini_settings
    from app.api import auth as A  # noqa: E402  (no side effects at import)
except ImportError as _exc:  # fastapi is imported by app.api.auth
    print(f'FAIL  python packages — {_exc}\n      → app/.venv/bin/python -m pip install -r app/api/requirements.txt\n\npreflight: FAILED')
    raise SystemExit(1)

SOURCE_DB = ROOT / 'proddb' / 'winmate_products.sqlite'
REFERENCE = ROOT / 'reference' / 'live'
REFERENCE_MANIFEST = REFERENCE / 'export-manifest.json'
FROZEN_COUNT = 511
DATA = ROOT / 'app' / 'data'
KB_DIR = A.RUNTIME_DIR / 'kb'
KB_REQUIRED = ('manifest.json', 'catalog.json', 'layout_html.json.gz', 'parts.json', 'best_scenarios.json', 'images.json',
               'retired.json', 'hidden_layouts.json')
POC = ROOT / 'poc' / 'test'
# Every module app/api/poc/imports.py loads, plus the data files the adapters read from poc/ when absent from the KB.
POC_REQUIRED = (
    'rfp_pipeline.py',
    *(f'layout_agent/winmate_layout/{m}.py' for m in ('__init__', 'config', 'kb', 'llm', 'schemas', 'slots', 'metadata', 'retrieval',
                                                     'layout_design', 'graph', 'render')),
    *(f'storyboard_agent/sbagent/{m}.py' for m in ('__init__', 'kb', 'llm', 'agent')),
    *(f'proposal_score/{m}.py' for m in ('__init__', 'llm', 'proposal', 'criteria', 'taxonomy', 'pipeline')),
    'proposal_score/criteria/criteria.json', 'proposal_score/criteria/rubrics.json', 'proposal_score/taxonomy/taxonomy.json',
    'layout_agent/data/standard_scenarios.json',
)
FIX_POC = '원본 PoC 를 복원하세요(git checkout -- poc/ 또는 원본 zip 재전개). poc/ 는 읽기 전용 입력입니다.'
FIX_KB = 'node app/scripts/export_agent_data.mjs 를 실행해 정본 KB 를 다시 만드세요.'
FIX_REF = 'reference/live 를 커밋된 상태로 되돌리세요(git checkout -- reference/live). 고정 게시본은 수정하면 안 됩니다.'


class Results:
    def __init__(self) -> None:
        self.items: List[dict] = []

    def add(self, level: str, name: str, detail: str = '', fix: str = '') -> None:
        self.items.append({'level': level, 'name': name, 'detail': detail, 'fix': fix})

    ok = lambda self, name, detail='': self.add('ok', name, detail)  # noqa: E731
    warn = lambda self, name, detail, fix='': self.add('warn', name, detail, fix)  # noqa: E731
    fail = lambda self, name, detail, fix='': self.add('fail', name, detail, fix)  # noqa: E731

    @property
    def failed(self) -> bool:
        return any(i['level'] == 'fail' for i in self.items)


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def _sample(names: Iterable[str], n: int = 5) -> str:
    names = list(names)
    return ', '.join(names[:n]) + (f' 외 {len(names) - n}개' if len(names) > n else '')


def _safe_member(rel: str) -> bool:
    p = PurePosixPath(rel)
    return bool(rel) and not p.is_absolute() and '..' not in p.parts and '\\' not in rel


# ---------------------------------------------------------------- checks
def check_python(r: Results) -> None:
    if sys.version_info < (3, 11):
        r.fail('python', f'{sys.version.split()[0]} — 3.11 이상 필요(hashlib.file_digest)', 'app/start.sh 로 Python 3.12 가상환경을 만드세요.')
    else:
        r.ok('python', sys.version.split()[0])
    missing = [m for m in ('fastapi', 'uvicorn', 'langgraph', 'langchain_core', 'langchain_google_genai', 'numpy', 'sklearn') if importlib.util.find_spec(m) is None]
    if missing:
        r.fail('python packages', '없음: ' + ', '.join(missing), 'app/.venv/bin/python -m pip install -r app/api/requirements.txt')
    else:
        r.ok('python packages', 'FastAPI · LangGraph · Gemini · NumPy · scikit-learn')


def check_source_db(r: Results, deep: bool) -> None:
    if not SOURCE_DB.is_file():
        r.fail('original SQLite', f'{_rel(SOURCE_DB)} 이 없습니다', '원본 DB 를 proddb/ 에 복원하세요(읽기 전용 입력, 앱이 수정하지 않음).')
        return
    try:
        db = sqlite3.connect(f'file:{SOURCE_DB}?mode=ro&immutable=1', uri=True)
        try:
            cols = {row[1] for row in db.execute('PRAGMA table_info(product_family)')}
            if not {'id', 'goods_id'} <= cols:
                r.fail('original SQLite', 'product_family 테이블(id, goods_id)이 없습니다', '올바른 winmate_products.sqlite 원본으로 교체하세요.')
                return
            rows = db.execute('SELECT count(*) FROM product_family').fetchone()[0]
            detail = f'{_rel(SOURCE_DB)} · product_family {rows}행 · {SOURCE_DB.stat().st_size:,} bytes'
            if deep:
                check = db.execute('PRAGMA quick_check').fetchone()[0]
                if check != 'ok':
                    r.fail('original SQLite', f'quick_check: {check}', '손상된 DB 입니다. 원본 DB 를 다시 복원하세요.')
                    return
                detail += ' · quick_check ok'
        finally:
            db.close()
    except sqlite3.Error as exc:
        r.fail('original SQLite', f'열 수 없습니다: {type(exc).__name__}: {exc}', '원본 DB 파일이 SQLite 형식인지 확인하고 다시 복원하세요.')
        return
    if rows <= 0:
        r.fail('original SQLite', 'product_family 가 비어 있습니다', '올바른 원본 DB 로 교체하세요.')
        return
    r.ok('original SQLite', detail)
    runtime = A.RUNTIME_DIR / 'winmate_products.sqlite'
    if deep and runtime.is_file():
        try:
            db = sqlite3.connect(f'file:{runtime}?mode=ro', uri=True)
            try:
                row = db.execute("SELECT payload FROM wm_ui_meta WHERE key='source_sha256'").fetchone()
            finally:
                db.close()
            if row and json.loads(row[0]) != _sha256(SOURCE_DB):
                r.warn('runtime SQLite', '원본 DB 가 런타임 스냅샷 이후 바뀌었습니다', 'python app/scripts/prepare_data.py --force')
            elif row:
                r.ok('runtime SQLite', '원본 해시 일치')
        except (sqlite3.Error, ValueError) as exc:
            r.warn('runtime SQLite', f'확인 실패: {type(exc).__name__}', 'python app/scripts/prepare_data.py --force')


def check_reference(r: Results, deep: bool) -> None:
    try:
        manifest = json.loads(REFERENCE_MANIFEST.read_text(encoding='utf-8'))
        entries = manifest['entries']
    except FileNotFoundError:
        r.fail('frozen reference', f'{_rel(REFERENCE_MANIFEST)} 이 없습니다', FIX_REF)
        return
    except (OSError, ValueError, KeyError, TypeError) as exc:
        r.fail('frozen reference', f'manifest 를 읽지 못했습니다: {type(exc).__name__}', FIX_REF)
        return
    if len(entries) != FROZEN_COUNT:
        r.fail('frozen reference', f'manifest 항목 {len(entries)}개 ≠ {FROZEN_COUNT}', FIX_REF)
        return
    missing, size_bad, hash_bad, unsafe = [], [], [], []
    total = 0
    for e in entries:
        rel = str(e.get('path', ''))
        if not _safe_member(rel):
            unsafe.append(rel or '?')
            continue
        path = REFERENCE / rel
        try:
            size = path.stat().st_size if path.is_file() else None
        except OSError:
            size = None
        if size is None:
            missing.append(rel)
            continue
        total += size
        if size != e.get('bytes'):
            size_bad.append(rel)
        elif deep and e.get('sha256') and _sha256(path) != e['sha256']:
            hash_bad.append(rel)
    if unsafe:
        r.fail('frozen reference', '안전하지 않은 manifest 경로: ' + _sample(unsafe), FIX_REF)
    if missing:
        r.fail('frozen reference', f'파일 {len(missing)}개 없음: ' + _sample(missing), FIX_REF)
    if size_bad:
        r.fail('frozen reference', f'크기가 다른 파일 {len(size_bad)}개: ' + _sample(size_bad), FIX_REF)
    if hash_bad:
        r.fail('frozen reference', f'SHA-256 이 다른 파일 {len(hash_bad)}개: ' + _sample(hash_bad), FIX_REF)
    if not (unsafe or missing or size_bad or hash_bad):
        r.ok('frozen reference', f'{FROZEN_COUNT}개 · {total / 1e6:,.1f} MB · ' + ('SHA-256 일치' if deep else '크기 일치(해시는 --deep)'))


def check_app_data(r: Results) -> None:
    files = [DATA / 'catalog.json', DATA / 'products_db.json', DATA / 'layouts.b64', DATA / 'static' / 'index.html']
    dirs = [DATA / 'static' / 'img', DATA / 'static' / 'lib', ROOT / 'app' / 'web' / 'public' / 'fonts']
    missing = [_rel(p) for p in files if not p.is_file()] + [_rel(p) + '/' for p in dirs if not p.is_dir()]
    if missing:
        r.fail('app data', '없음: ' + _sample(missing), '커밋된 app/data · app/web/public 을 복원하세요(git checkout -- app/data app/web/public).')
    else:
        r.ok('app data', f'{len(files)}개 파일 · {len(dirs)}개 디렉터리')


def check_poc(r: Results) -> None:
    missing = [rel for rel in POC_REQUIRED if not (POC / rel).is_file()]
    if missing:
        r.fail('PoC sources', f'{len(missing)}개 없음: ' + _sample(f'poc/test/{m}' for m in missing), FIX_POC)
    else:
        r.ok('PoC sources', f'{len(POC_REQUIRED)}개 파일 (import 하지 않고 존재만 확인)')


def check_kb(r: Results, deep: bool) -> None:
    missing = [n for n in KB_REQUIRED if not (KB_DIR / n).is_file()]
    if missing:
        r.fail('canonical KB', f'{_rel(KB_DIR)} 에 없음: ' + _sample(missing), FIX_KB)
        return
    try:
        manifest = json.loads((KB_DIR / 'manifest.json').read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        r.fail('canonical KB', f'manifest.json 을 읽지 못했습니다: {type(exc).__name__}', FIX_KB)
        return
    bad_out = []
    for rel, rec in (manifest.get('outputs') or {}).items():
        path = KB_DIR / rel
        if not _safe_member(rel) or not path.is_file() or path.stat().st_size != rec.get('size') \
                or (deep and rec.get('sha256') and _sha256(path) != rec['sha256']):
            bad_out.append(rel)
    if bad_out:
        r.fail('canonical KB', '스냅샷 파일이 manifest 와 다름: ' + _sample(bad_out), FIX_KB)
        return
    counts, expected = manifest.get('counts') or {}, manifest.get('expected') or {}
    off = [f'{k} {counts.get(k)}≠{v}' for k, v in expected.items() if counts.get(k) != v]
    if off:
        r.fail('canonical KB', '개수가 기대값과 다름: ' + ', '.join(off), FIX_KB)
        return
    stale = []
    for rel, rec in (manifest.get('inputs') or {}).items():
        path = ROOT / rel
        try:
            if not _safe_member(rel) or not path.is_file() or path.stat().st_size != rec.get('size') \
                    or (deep and rec.get('sha256') and _sha256(path) != rec['sha256']):
                stale.append(rel)
        except OSError:
            stale.append(rel)
    if stale:
        r.warn('canonical KB', 'KB 스냅샷 이후 바뀐 원천 파일: ' + _sample(stale), FIX_KB)
    r.ok('canonical KB', f"{manifest.get('generated_at', '?')} · " + ', '.join(f'{k} {v}' for k, v in expected.items())
         + ('' if deep else ' · 크기 기준(해시는 --deep)'))


def check_web(r: Results, auth_enabled: bool) -> None:
    dist = ROOT / 'app' / 'web' / 'dist'
    absent = [n for n in ('index.html', 'migration.html') if not (dist / n).is_file()]
    if absent:
        r.warn('web build', 'app/web/dist 에 없음: ' + ', '.join(absent), 'npm --prefix app/web run build (app/start.sh 가 실행합니다)')
    else:
        r.ok('web build', 'app/web/dist/index.html')
    if not A.LOGIN_PAGE.is_file():
        (r.fail if auth_enabled else r.warn)('login page', f'{_rel(A.LOGIN_PAGE)} 이 없습니다', 'git checkout -- app/web/public/login.html')
    else:
        r.ok('login page', _rel(A.LOGIN_PAGE))


def _loose(path: Path) -> bool:
    try:
        return bool(stat.S_IMODE(path.stat().st_mode) & 0o077)
    except OSError:
        return False


def check_auth(r: Results, require: bool) -> bool:
    config = A.config_from_env()
    if not config.enabled:
        r.warn('login', 'WINMATE_AUTH=off — 로그인 없이 누구나 접속합니다(테스트 전용)', 'WINMATE_AUTH 를 지우거나 on 으로 두세요.')
        return False
    cred = config.credentials_path
    if not cred.is_file():
        (r.fail if require else r.warn)('login', f'계정 없음 ({_rel(config.auth_dir)})',
                                        'python app/scripts/manage_auth.py --ensure (터미널에 1회 표시) 또는 --set')
        return True
    try:
        creds = A.Auth._parse_credentials(cred)
    except A.AuthError as exc:
        r.fail('login', str(exc), 'python app/scripts/manage_auth.py --set')
        return True
    loose = [_rel(p) for p in (config.auth_dir, cred, config.secret_path) if p.exists() and _loose(p)]
    if loose:
        r.warn('login', '권한이 넓은 자격 증명 파일: ' + ', '.join(loose), f'chmod 700 {_rel(config.auth_dir)} && chmod 600 {_rel(config.auth_dir)}/*')
    r.ok('login', f'계정 {creds.username} · pbkdf2_sha256 × {creds.iterations}')
    return True


def run(deep: bool, require_auth: bool) -> Results:
    r = Results()
    check_python(r)
    model = load_gemini_settings()
    if model.has_key:
        r.ok('Gemini', model.model + ' · key source: ' + model.key_source + ' · strict real-only')
    else:
        r.fail('Gemini', 'GEMINI_API_KEY가 없어 실제 AI 기능을 시작할 수 없습니다.', 'app/.env 또는 poc/.env에 서버 전용 Gemini 키를 설정하세요.')
    check_source_db(r, deep)
    check_reference(r, deep)
    check_app_data(r)
    check_poc(r)
    check_kb(r, deep)
    enabled = check_auth(r, require_auth)
    check_web(r, enabled)
    return r


def main(argv: Optional[list] = None) -> int:
    p = argparse.ArgumentParser(description='Winmate read-only preflight')
    p.add_argument('--deep', action='store_true', help='SHA-256 of every frozen file / KB file and SQLite quick_check (slow, ~200 MB)')
    p.add_argument('--require-auth', action='store_true', help='fail (not warn) when login is enabled but no account exists')
    p.add_argument('--json', action='store_true')
    args = p.parse_args(argv)
    r = run(args.deep, args.require_auth)
    if args.json:
        print(json.dumps({'ok': not r.failed, 'checks': r.items}, ensure_ascii=False, indent=1))
    else:
        for i in r.items:
            print(f"{i['level'].upper():4}  {i['name']}" + (f" — {i['detail']}" if i['detail'] else ''))
            if i['fix'] and i['level'] != 'ok':
                print(f'      → {i["fix"]}')
        print('\npreflight: ' + ('FAILED' if r.failed else 'OK'))
    return 1 if r.failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
