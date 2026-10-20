# Winmate v2 Ubuntu 사내망 Bootstrap

이 문서는 현재 Mac의 Winmate 사용자 앱을 **Ubuntu 사내망**에 재현하기 위한 반입·설치·설정·검증 절차다. 코드·데이터·정적 자산·저장 계약은 동일하게 유지한다. 사내 LLM·두 인증 키·검색 연동은 사용자가 별도로 제공하는 폴더의 지침을 적용한다. 별도 관리 앱인 `admin/`과 그 데이터·실행 경로는 제외하고, 사용자 앱에 이미 포함된 로그인은 유지한다.

작성 기준일: **2026-10-21 KST**. 실제 반입본의 코드와 사용자 제공 연동 자료를 최종 기준으로 삼는다. Ubuntu 버전과 CPU는 대상 서버에서 확인하며, 사내 LLM·검색의 모델명·주소·인증 규격은 이 문서에서 지정하지 않는다.

## Ubuntu에서 실행할 작업 프롬프트

아래 프롬프트를 Ubuntu의 작업 에이전트에 전달한다. **사내 LLM·검색 관련 두 입력란은 의도적으로 비워 두었다.** 제공할 폴더의 실제 경로와 필요한 추가 내용을 사용자가 채운다. 나머지 설치 절차는 이 문서를 따른다.

```text
현재 저장소의 BOOTSTRAP.md를 읽고, Mac의 Winmate 사용자 앱을 이 Ubuntu 사내망에서 재현하라.

사내 LLM·검색 연동 자료 폴더 경로:


사내 LLM·검색 관련 추가 내용:


작업 요구사항:
1. /etc/os-release, CPU 아키텍처, glibc와 준비된 Node/Python/Chromium 버전을 확인한다.
2. 문서의 반입 manifest와 파일·이미지·폰트·심볼릭 링크를 검증한다.
3. Ubuntu용 OS 패키지·npm 캐시·Python wheel로 의존성을 설치한다.
   Mac의 가상환경·node_modules·브라우저 바이너리는 재사용하지 않는다.
4. 위 폴더의 설명·예제·설정·실행 지침을 읽고 사내 LLM·두 키·검색 연결을 적용한다.
   모델·주소·변수명·헤더·키 선택·검색 방식을 추정해 채우지 않는다.
   해당 폴더가 사용하는 설정·인증서·추가 의존성도 함께 반영하고 비밀값을 출력하지 않는다.
5. 연결 변경은 공통 LLM·검색 경계에 적용하고, 기존 화면·업무 흐름·입출력·저장 계약을 유지한다.
6. 데이터·공간 라이브러리·Agent KB·웹을 준비하고 app.api.main:app만 실행한다.
   admin/ 관리 앱은 설치·연결·실행하지 않는다. 사용자 앱의 기본 로그인은 유지한다.
7. 기본 계약·브라우저·실제 사내 모델과 검색·첨부 읽기·PPTX·공간·저장 기능을 검증한다.
8. 기존 자료 이전이 포함되면 브라우저 백업과 서버 저장 데이터를 각각 복원한다.
9. 실제 변경 파일, 실행 명령, 검증 결과, 미완료 항목과 재시작·복구 방법을 보고한다.

자료 폴더 경로나 필수 내용이 비어 있으면 사내 연동을 임의로 구현하지 않는다.
그 입력에 의존하지 않는 Ubuntu 환경 확인·파일 검증·패키지·데이터 준비는 계속 진행한다.
실제 LLM 연결이 필요한 서버 기동과 기능 인수는 제공 자료를 적용한 뒤 완료한다.
```

## 1. 완료 기준과 진행 순서

다음 순서로 진행한다.

1. Mac에서 반입할 작업 트리를 확정하고 소스·데이터와 버전 기록을 묶는다(3~4절).
2. 대상과 같은 Ubuntu 버전·CPU에 맞는 OS 패키지·Node/Python·npm 캐시·Python wheel·검증용 Chromium을 준비한다(5절).
3. 사내망에서 압축을 풀고 파일 해시·심볼릭 링크를 검증한다(6절).
4. 사용자가 프롬프트의 빈칸에 입력한 자료 폴더를 읽고 사내 LLM·두 키·검색 연결을 적용한다(7절).
5. 대상 환경에서 의존성을 새로 설치하고 데이터와 웹을 준비한다(8~9절).
6. 사용자 앱만 실행하고 기능·저장·외부 통신을 검증한다(10~13절).
7. 기존 작업 내용까지 필요하면 브라우저와 서버 데이터를 각각 이전한다(14절).

여기서 재현 완료는 아래 조건을 모두 만족하는 상태다.

- 반입 manifest의 소스·입력 데이터·이미지·폰트가 원본과 일치한다.
- 웹/API가 같은 origin에서 동작하고, 사용자 앱의 기본 로그인과 데이터 저장이 동작한다.
- LLM 작업이 실제 사내 모델을 사용하며 두 키가 의도한 방식으로 적용된다.
- 요구사항 분석, Storyboard, 레이아웃 채움, 검색, 검토, 시뮬레이션, 가이드 에이전트, 공간 조감도가 검증된다.
- PDF/PPTX/DOCX 읽기, 이미지 표시, 편집 가능한 PPTX 내보내기와 My 템플릿 복원이 검증된다.
- 외부 검색·링크 미리보기 등 외부 의존 기능까지 사용할 경우, 사내 대체 경로나 허용된 접속 경로가 검증된다.

모델이 달라지면 생성 문장·점수·선택 결과까지 바이트 단위로 같을 수는 없다. 동일성의 기준은 **앱·입력 자산·사용자 흐름·입출력 스키마·오류 처리·저장/내보내기 계약**이다. 화면의 픽셀 비교에는 브라우저 버전·설치 폰트·화면 크기·배율·WebGL 환경도 맞춘다.

## 2. Mac 원본 환경과 Ubuntu 대상 확인

```text
브라우저
  └─ 동일 origin의 FastAPI :8788
       ├─ app/web/dist                 React/Vite 배포본
       ├─ /api/*                       사용자 기능·인증·AI 작업
       ├─ /img/*, /lib/*, /fonts/*      로컬 이미지·문서 라이브러리·폰트
       ├─ app/data/runtime             DB projection·KB·서버 저장 데이터
       ├─ poc/test                     실제 import하는 공용 AI 모듈
       └─ 공통 LLM provider → 사내 LLM gateway
```

| 항목 | Mac에서 확인한 기준 |
|---|---|
| OS / CPU | macOS 26.5.2 / arm64 |
| Node.js / npm | `v22.22.3` / `10.9.8` |
| Python | `3.12.13` |
| uv | `0.11.3` — 준비 머신에서 Python 런타임을 확보할 때 사용. Ubuntu 운영에는 필수 아님 |
| 현재 앱의 JS 의존성 | `app/web/package.json`, `app/web/package-lock.json`(lockfile v3) |
| Python 실행 의존성 | `app/api/requirements.txt` |
| Python 검증 의존성 | `app/tests/requirements.txt` — 실행 의존성 포함 |
| 웹 | React `18.3.1`, Vite `6.4.1`, Three.js `0.186.1` |
| 브라우저 검증 | Playwright `1.56.1`의 Chromium |
| 기본 주소 | `http://127.0.0.1:8788` |
| DB / 파일 저장 | 로컬 SQLite·파일 + 브라우저 localStorage/IndexedDB |

사용자 앱의 기본 구성에는 별도의 DB 서버나 GPU 서버가 필요하지 않다. Redis는 LLM 큐를 Redis로 선택할 때만 필요하며 이 문서의 기본값은 단일 호스트 SQLite 큐다.

**실행 대상은 Ubuntu이며, 대상 명령은 Bash 기준이다.** Mac에서 소스를 묶는 4절과 Ubuntu에서 수행하는 5절 이후를 구분한다. Ubuntu 버전과 CPU는 아직 지정되지 않았으므로 22.04/24.04 등의 버전이나 amd64/arm64를 임의로 고정하지 않는다. 실제 사내 서버에서 먼저 다음 정보를 기록한다.

```bash
bash --version
cat /etc/os-release
dpkg --print-architecture
uname -m
getconf GNU_LIBC_VERSION
df -h . /tmp
```

인터넷 연결 가능한 준비 머신/VM은 **이 Ubuntu의 VERSION_ID·dpkg 아키텍처·glibc 환경과 맞춘다.** Mac이 Apple Silicon이어도 사내 서버가 amd64라면 amd64 Ubuntu VM/서버에서 패키지를 준비한다. 컨테이너를 쓰는 경우에도 OS 패키지와 Chromium 실행을 실제 대상에서 확인한다.

**Mac의 `app/.venv`, `node_modules`, Chromium 실행 파일을 Ubuntu에 복사하지 않는다.** Python wheel, esbuild, sharp 및 브라우저 바이너리는 Ubuntu의 CPU·glibc에 맞아야 한다. 대상의 실제 자원 요구량은 데이터 크기·동시 AI 작업·브라우저 공간 렌더링으로 측정하고, 미측정 CPU/RAM 최소치를 임의로 정하지 않는다. 앱·반입본·설치 캐시·작업용 파일을 동시에 저장할 여유 공간도 확인한다.

## 3. 반드시 함께 옮길 파일

재현 기준 브랜치는 **`main`**이다. 현재 사용자 앱 구성을 그대로 유지해 재현 브랜치의 코드·데이터·정적 자산을 `main`에 통합했다. 재현에 필요한 사용자 앱·공용 PoC·제품 원본 DB·검증 자료도 함께 포함한다. `app/`만 복사하지 않는다. Git 반입은 실제 checkout한 커밋을, 별도 파일 운반은 작업 트리 manifest를 재현 기준으로 기록한다.

수집 과정의 대형 PDF·중간 HTML·전후 DB 사본 등 하위 `.gitignore`가 제외하는 검토 캐시는 Git 반입에 포함하지 않는다. 앱이 읽는 원본 SQLite, 검토된 제품 상세, 정본 장표 입력, 이미지·폰트와 해당 출처·검토 대장은 포함한다. 캐시는 앱 실행·재빌드 입력과 구분한다.

| 경로 | 필요한 이유 |
|---|---|
| `start.sh`, `Makefile`, `package.json`, `README.md`, `BOOTSTRAP.md` | 진입점·작업 명령·설명 |
| `app/api/`, `app/scripts/`, `app/tests/` | 서버·LLM 경계·데이터 준비·검증 |
| `app/web/` 전체(의존성·배포 결과 제외) | 실제 사용자 앱 소스, `public` 정적 파일, npm lock |
| `app/data/` 전체(`runtime` 제외) | catalog, products DB JSON, layouts, images, media, 검토된 제품 상세, 배경, 공간 데이터 |
| `poc/` | 현재 앱이 `poc/test`의 RFP·layout·storyboard·review 코드를 실제 import |
| `proddb/` | `winmate_products.sqlite` 원본 및 제품·이미지 자료 |
| `reference/live/` | 고정 게시본 511개 파일과 `export-manifest.json`, `/img`·`/lib` 원천 |
| `reference/legacy-dist-assets/` | 보존한 이미지·자료와 출처 |
| `img/` | 특히 `/img/lib`의 `index.json`, 이미지 pack과 ranges |
| `src/`, `data/`, `build/` | 자료 가공·평가·추출 도구와 원천 데이터 |
| `docs/`, `.agents/` | 운영·검증 기록과 프로젝트 작업 지침 |

특히 다음 항목을 누락하지 않는다.

- `app/data/product-details/`: 검토된 최신 제품 상세가 고정 게시본보다 우선한다.
- `app/data/description-standard-html.json.gz` 및 `app/web/public/assets/description-standards/`: 표준제안서 장표·그래픽.
- `app/data/spatial/versions/`와 `app/web/public/assets/spatial-*`: 기존 공간 저장본이 참조하는 오브젝트 버전·미리보기·재질 자료. 최신 `library.json`만 옮기지 않는다.
- `app/web/public/assets/`의 가이드 GIF와 기타 자산, `app/web/public/fonts/` 전체.
- `poc/test/layout_agent/data/standard_scenarios.json`, `poc/test/proposal_score/criteria/`, `taxonomy/`.

현재 심볼릭 링크는 아래와 같다. **디렉터리 이름만 같고 내용이 없는 상태로 옮기면 안 된다.**

```text
app/data/static -> ../../reference/live
```

새 환경에서는 링크의 상대 경로와 대상 파일을 모두 유지한다. 링크를 지원하지 않는 운반 수단을 사용했다면, 실제 디렉터리로 풀어 둔 것이 아닌지 확인한 뒤 아래처럼 복구한다.

```bash
# 프로젝트 루트. static이 이미 실제 디렉터리라면 먼저 내용과 백업을 확인한다.
test -L app/data/static || test ! -e app/data/static
test -e app/data/static || ln -s ../../reference/live app/data/static
test -f app/data/static/index.html
```

일반 반입본에서 제외하는 항목은 `admin/`, `.git/`, `.env` 실값, 인증 파일, `node_modules/`, `.venv/`, Python 캐시, `app/web/dist/`, `app/data/runtime/`, 테스트 출력과 중복 배포 ZIP이다. `app/.env.example`은 포함한다. 기존 사용자 데이터는 14절에서 별도로 이전한다.

## 4. Mac에서 재현 기준을 고정하고 소스 반입본 만들기

### 4.0 Git으로 소스를 확보하는 경우

GitHub 접속이 가능한 준비 머신에서 다음처럼 브랜치를 지정한다. 사내망에서 직접 접속할 수 없으면 이 사본으로 5절의 Ubuntu용 패키지를 준비하고 파일로 반입한다.

```bash
git clone --single-branch --branch main \
  https://github.com/minsub0922/winmate_poc_v2.git winmate
cd winmate
git rev-parse HEAD
git status --short

export WINMATE_BUNDLE_DIR="$HOME/winmate-transfer"
mkdir -p "$WINMATE_BUNDLE_DIR/metadata"
cp docs/reproduction/environment-20261021/*.txt "$WINMATE_BUNDLE_DIR/metadata/"
git rev-parse HEAD > "$WINMATE_BUNDLE_DIR/metadata/git-head.txt"
git status --short > "$WINMATE_BUNDLE_DIR/metadata/git-status.txt"
```

`docs/reproduction/environment-20261021/`는 Mac에서 확인한 Node/npm/Python과 Python 전이 의존성 버전 기록이다. 실행 파일·가상환경·키는 포함하지 않는다. Git 경로에서는 4.1절의 Mac 기록 생성을 생략할 수 있다. Ubuntu 준비 머신에서 5.1~5.3절을 수행한 후 생성된 `app/.venv/bin/python`으로 4.2절의 소스 아카이브를 만들고, 5.4절의 운반 해시를 확정한다. 이후 사내 Ubuntu에서 6절부터 진행한다.

### 4.1 반입 시점 확정

Mac의 공통 모듈 변경과 로컬 검증이 끝난 상태에서 앱·수집기·데이터 생성 작업과 병행 소스 수정을 멈추고 묶는다. 사내 LLM·검색의 실제 연결은 Ubuntu에서 사용자 제공 폴더를 적용하는 7절에서 진행한다. 아래 명령은 **프로젝트 루트**에서 실행한다. 이후 절차의 상대 경로도 특별한 설명이 없으면 루트 기준이다.

```bash
export WINMATE_BUNDLE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/winmate-transfer.XXXXXX")"
mkdir -p "$WINMATE_BUNDLE_DIR/metadata"
git rev-parse HEAD > "$WINMATE_BUNDLE_DIR/metadata/git-head.txt"
git status --short > "$WINMATE_BUNDLE_DIR/metadata/git-status.txt"
node --version > "$WINMATE_BUNDLE_DIR/metadata/node-version.txt"
npm --version > "$WINMATE_BUNDLE_DIR/metadata/npm-version.txt"
app/.venv/bin/python --version > "$WINMATE_BUNDLE_DIR/metadata/python-version.txt"
app/.venv/bin/python -B - <<'PY' > "$WINMATE_BUNDLE_DIR/metadata/python-source.freeze.txt"
from importlib.metadata import distributions
rows = {(d.metadata['Name'], d.version) for d in distributions() if d.metadata['Name']}
for name, version in sorted(rows, key=lambda row: row[0].lower()):
    print(f'{name}=={version}')
PY
```

`python-source.freeze.txt` 기록이 필요한 이유는 `requirements.txt`가 직접 의존성 버전만 고정하고, 모든 전이 의존성의 해시까지 잠그는 파일은 아니기 때문이다. 대상 플랫폼에서 같은 버전 제약으로 설치한 후 대상용 freeze와 wheel을 별도로 만든다(5절).

### 4.2 실제 작업 트리를 아카이브하고 manifest 작성

아래 스크립트는 미추적 소스·자료도 포함한다. `git archive`를 사용하지 않는다. 출력 경로는 저장소 밖이며, 기존 프로젝트 파일을 수정하지 않는다.

```bash
app/.venv/bin/python -B - <<'PY'
import hashlib
import json
import os
import stat
import tarfile
from pathlib import Path

root = Path.cwd().resolve()
out = Path(os.environ['WINMATE_BUNDLE_DIR']).resolve()
assert not out.is_relative_to(root), '반입본은 저장소 밖에 만드세요.'
selected = [
    'start.sh', 'Makefile', 'package.json', 'README.md', 'BOOTSTRAP.md',
    'app', 'poc', 'proddb', 'reference/live', 'reference/legacy-dist-assets',
    'img', 'src', 'data', 'build', 'docs', '.agents',
]
optional = {'.agents'}
skip_dirs = {'node_modules', '.venv', '__pycache__', '.pytest_cache', '.git'}
skip_paths = {
    'app/data/runtime', 'app/web/dist', 'app/tests/output', 'app/tests/legacy-work',
    'reference/live/published.zip',
}
records = []

def excluded(path):
    rel = path.relative_to(root).as_posix()
    name = path.name
    return (
        rel in skip_paths or name in skip_dirs or name == '.DS_Store'
        or name == '.env' or (name.startswith('.env.') and name != '.env.example')
        or name in {'.secret', 'session.secret', 'credentials.json', 'auth.json'}
        or path.suffix.lower() in {'.pem', '.key'}
    )

def add(tree, path):
    if excluded(path):
        return
    rel = path.relative_to(root).as_posix()
    mode = stat.S_IMODE(path.lstat().st_mode)
    if path.is_symlink():
        resolved = path.resolve(strict=True)
        assert resolved.is_relative_to(root), f'저장소 밖의 링크: {rel}'
        records.append({'path': rel, 'type': 'symlink', 'target': os.readlink(path)})
    elif path.is_file():
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        records.append({'path': rel, 'type': 'file', 'bytes': path.stat().st_size,
                        'sha256': digest, 'mode': mode})
    elif not path.is_dir():
        raise RuntimeError(f'지원하지 않는 파일: {rel}')
    tree.add(path, arcname=rel, recursive=False)
    if path.is_dir() and not path.is_symlink():
        for child in sorted(path.iterdir()):
            add(tree, child)

with tarfile.open(out / 'winmate-source.tar.gz', 'w:gz', dereference=False) as tree:
    for rel in selected:
        path = root / rel
        if not path.exists() and not path.is_symlink():
            if rel in optional:
                continue
            raise FileNotFoundError(rel)
        add(tree, path)
(out / 'source-manifest.json').write_text(
    json.dumps({'files': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'소스·링크 {len(records)}개: {out}')
PY
```

이 목록은 실행·재빌드·검증용 반입본이다. `output/`, `.codex-build/`, `.wm_tmp/`, `_to_delete/`, `ppt_layouts/`, 과거 ZIP 등 별도의 제작 이력까지 보관하려면 따로 묶는다. 이미 앱에 반영된 표준 장표·그래픽·공간 자산은 위 반입본에 포함된다.

## 5. Ubuntu용 런타임·OS 패키지·의존성 준비

### 5.1 공통 전제

대상과 **같은 Ubuntu VERSION_ID·CPU 아키텍처·glibc 환경**의 인터넷 연결 가능한 준비 머신/VM을 사용한다. 아래 명령은 이 Ubuntu 준비 머신에서 실행한다. 사내 Ubuntu에서 수집한 2절의 정보와 대조하고 `metadata/ubuntu-target.txt`에 실제 기준을 기록한다.

소스 반입본을 준비 머신의 새 디렉터리에 풀고, `WINMATE_BUNDLE_DIR`는 Mac에서 복사해 온 운반 디렉터리의 **절대 경로**로 다시 설정한다. 여기에 `deps/`를 추가한다. 준비 머신과 실제 서버의 Ubuntu 버전이 다르면 같은 환경을 먼저 마련한다.

### 5.1.1 Ubuntu 기본 OS 패키지

인터넷 연결 가능한 준비 머신 또는 사내 APT 저장소를 사용할 수 있는 Ubuntu에서 실행한다. 사내망에 저장소가 없으면 이 명령을 그대로 온라인 실행하려 하지 말고 아래 오프라인 반입 조건을 적용한다.

```bash
sudo apt-get update
sudo apt-get install --no-install-recommends \
  ca-certificates curl make tar gzip xz-utils binutils fontconfig fonts-noto-cjk

mkdir -p "$WINMATE_BUNDLE_DIR/metadata"
cat /etc/os-release > "$WINMATE_BUNDLE_DIR/metadata/ubuntu-target.txt"
dpkg --print-architecture >> "$WINMATE_BUNDLE_DIR/metadata/ubuntu-target.txt"
getconf GNU_LIBC_VERSION >> "$WINMATE_BUNDLE_DIR/metadata/ubuntu-target.txt"
```

`fonts-noto-cjk`는 Ubuntu 시스템 폰트가 필요한 비교·내보내기 검수용이다. 앱이 제공하는 웹폰트는 `app/web/public/fonts/`를 그대로 사용한다. Node/Python은 Ubuntu의 기본 `nodejs`, `python3` 패키지 버전으로 대체하지 않고, 원본에 맞는 별도 런타임을 아래처럼 준비한다. `/usr/bin/python3`나 시스템 Python을 교체하지 않는다.

### 5.1.2 Node.js 런타임 반입

준비 머신에서 원본 Node 버전에 맞는 Linux 배포본을 받고 공개 checksum과 대조한다. `amd64`와 `arm64` 이외의 대상이면 임의의 바이너리를 고르지 않고 해당 플랫폼 지원부터 확인한다.

```bash
export WINMATE_NODE_VERSION="$(tr -d 'v\r\n' < "$WINMATE_BUNDLE_DIR/metadata/node-version.txt")"
case "$(dpkg --print-architecture)" in
  amd64) WINMATE_NODE_ARCH=x64 ;;
  arm64) WINMATE_NODE_ARCH=arm64 ;;
  *) printf '지원 여부를 확인할 Ubuntu 아키텍처입니다.\n' >&2; exit 1 ;;
esac
export WINMATE_NODE_ARCH
mkdir -p "$WINMATE_BUNDLE_DIR/deps/node-download" "$WINMATE_BUNDLE_DIR/deps/node"
export WINMATE_NODE_ARCHIVE="node-v${WINMATE_NODE_VERSION}-linux-${WINMATE_NODE_ARCH}.tar.xz"
curl --fail --location \
  "https://nodejs.org/dist/v${WINMATE_NODE_VERSION}/${WINMATE_NODE_ARCHIVE}" \
  --output "$WINMATE_BUNDLE_DIR/deps/node-download/$WINMATE_NODE_ARCHIVE"
curl --fail --location \
  "https://nodejs.org/dist/v${WINMATE_NODE_VERSION}/SHASUMS256.txt" \
  --output "$WINMATE_BUNDLE_DIR/deps/node-download/SHASUMS256.txt"
(
  cd "$WINMATE_BUNDLE_DIR/deps/node-download"
  sha256sum --check --ignore-missing SHASUMS256.txt
) || exit 1
tar -xJf "$WINMATE_BUNDLE_DIR/deps/node-download/$WINMATE_NODE_ARCHIVE" \
  -C "$WINMATE_BUNDLE_DIR/deps/node" --strip-components=1
export PATH="$WINMATE_BUNDLE_DIR/deps/node/bin:$PATH"
node --version
npm --version
```

Node/npm 버전을 Mac의 `metadata/*-version.txt`와 대조한다. npm 버전까지 다르면 준비 머신에서 원본 버전으로 맞춘 뒤 패키지 캐시와 반입본을 다시 검증한다. 운반본에는 추출한 `deps/node/`가 포함되므로 사내 Ubuntu에서 다운로드가 필요하지 않다.

### 5.1.3 Python 런타임 반입

준비 머신에 승인된 uv를 설치하고 원본의 Python `3.12.13`을 별도 경로에 받는다. 이 방식은 사내 Ubuntu에 uv나 Python 다운로드 접근을 요구하지 않는다. 이미 승인된 동일 버전 Ubuntu용 Python 런타임이 있다면 그것을 사용할 수 있으며, 이 경우도 실행 파일 경로와 버전을 기록한다.

```bash
export UV_PYTHON_INSTALL_DIR="$WINMATE_BUNDLE_DIR/deps/python"
uv python install --install-dir "$UV_PYTHON_INSTALL_DIR" --no-bin 3.12.13
export WINMATE_PYTHON_BIN="$(uv python find --managed-python --no-python-downloads 3.12.13)"
"$WINMATE_PYTHON_BIN" -B - <<'PY'
import os
from pathlib import Path
bundle = Path(os.environ['WINMATE_BUNDLE_DIR']).resolve()
runtime = Path(os.environ['WINMATE_PYTHON_BIN']).resolve()
relative = runtime.relative_to(bundle / 'deps/python')
(bundle / 'metadata/python-runtime-relative.txt').write_text(str(relative) + '\n', encoding='utf-8')
PY
export PATH="$(dirname "$WINMATE_PYTHON_BIN"):$PATH"
python3.12 --version
python3.12 -c 'import ssl, sqlite3, venv, bz2, lzma; print("Python modules: OK")'
```

Mac에서 옮기는 것은 Python 패키지 버전 기록이며, Python 실행 파일과 wheel은 위 Ubuntu 준비 머신에서 새로 확보한다. `app/.venv`는 실제 사내 설치 경로에서 다시 만든다. Node/Python 런타임은 다른 위치로 운반한 새 사본에서 동작하는지 8절로 확인한다.

### 5.2 사내 npm/PyPI 저장소를 사용할 수 있는 경우

사내 승인된 registry/index와 CA를 설정하고 다음을 실행할 수 있다.

```bash
npm --prefix app/web ci --include=dev --no-audit --no-fund
python3.12 -m venv app/.venv
app/.venv/bin/python -m pip install \
  -r app/tests/requirements.txt \
  -c "$WINMATE_BUNDLE_DIR/metadata/python-source.freeze.txt"
app/.venv/bin/python -m pip check
```

`npm ci`는 `app/web/package-lock.json`을 사용한다. 루트 `package.json`의 자료 제작 도구를 설치하는 것으로 대체하지 않는다. 빌드에 Vite/esbuild/sharp가 필요하므로 devDependencies도 설치한다.

현재 npm lock의 `resolved`에는 공개 npm registry 주소가 기록되어 있다. `--registry` 설정만으로 모든 고정 URL이 사내 주소로 바뀐다고 가정하지 않는다. 해당 URL을 처리하는 사내 프록시·미러를 확인하거나, 아래 오프라인 캐시 방식을 사용한다. 버전을 풀거나 lock을 임의 재생성해 설치 문제를 우회하지 않는다.

### 5.3 완전 오프라인용 패키지 준비

**인터넷 연결 가능한 동일 Ubuntu 준비 머신**의 소스 루트에서 실행한다. 먼저 5.1절의 런타임 PATH를 적용한다. 사용자 제공 연동 폴더에 추가 의존성이 있으면 그것까지 포함한 최종 목록으로 아래 절차를 실행한다.

```bash
mkdir -p "$WINMATE_BUNDLE_DIR/deps/npm-cache"
mkdir -p "$WINMATE_BUNDLE_DIR/deps/wheels"
mkdir -p "$WINMATE_BUNDLE_DIR/deps/playwright"

# 새 소스 사본에서 실행. 준비 머신의 OS/CPU에 맞는 선택 의존성도 내려받는다.
npm --prefix app/web ci --include=dev \
  --cache "$WINMATE_BUNDLE_DIR/deps/npm-cache" --no-audit --no-fund

# app/.venv가 없는 새 사본을 사용한다.
python3.12 -m venv app/.venv
app/.venv/bin/python -m pip install \
  -r app/tests/requirements.txt \
  -c "$WINMATE_BUNDLE_DIR/metadata/python-source.freeze.txt"
app/.venv/bin/python -m pip check
app/.venv/bin/python -m pip freeze \
  > "$WINMATE_BUNDLE_DIR/deps/python-target.freeze.txt"
app/.venv/bin/python -m pip download --only-binary=:all: \
  -r "$WINMATE_BUNDLE_DIR/deps/python-target.freeze.txt" \
  -d "$WINMATE_BUNDLE_DIR/deps/wheels"

PLAYWRIGHT_BROWSERS_PATH="$WINMATE_BUNDLE_DIR/deps/playwright" \
  node app/web/node_modules/playwright/cli.js install chromium
```

wheel이 없는 의존성이 있으면 여기서 멈추고 대상 호환 환경에서 wheel을 만들어 고정한다. 사내망에서 즉석 컴파일·외부 다운로드가 발생하는 반입본을 완성본으로 보지 않는다. Mac과 대상 OS에서 같은 버전 조합이 성립하지 않으면, 대체 버전을 조용히 설치하지 말고 변경 목록을 기록하고 해당 조합으로 재검증한다.

Chromium 다운로드와 Ubuntu 공유 라이브러리 설치는 별개다. 고정된 Playwright 버전이 실제 Ubuntu에서 요구하는 패키지를 출력하고, 준비 머신에는 설치한다.

```bash
node app/web/node_modules/playwright/cli.js install-deps --dry-run chromium \
  > "$WINMATE_BUNDLE_DIR/metadata/playwright-ubuntu-deps.txt"
node app/web/node_modules/playwright/cli.js install-deps chromium
dpkg-query -W -f='${binary:Package}\t${Version}\t${Architecture}\n' \
  > "$WINMATE_BUNDLE_DIR/metadata/ubuntu-packages.tsv"
```

패키지 이름은 Ubuntu 버전별로 다를 수 있으므로 다른 버전의 라이브러리 목록을 고정해서 복사하지 않는다. Playwright가 해당 OS를 지원하지 않는다는 경고를 내면 호환 이미지로 자동 fallback한 것을 검증 완료로 보지 않는다. 대상에서 Chromium 실행과 공간 렌더링을 확인한다.

**사내 APT 저장소가 없는 경우**, Ubuntu 기본 패키지·위 Chromium 패키지·제공 폴더가 요구하는 OS 패키지의 **전이 의존성까지** 대상 Ubuntu 버전·CPU용 `.deb`와 설치 가능한 오프라인 APT 저장소로 반입한다. 대상의 APT 상태를 기준으로 필요한 패키지를 산출하고, 시스템 담당자의 오프라인 패키지 절차 또는 apt-offline 같은 도구로 확보한다. 준비 머신에 이미 설치되어 있다는 이유로 다운로드에서 빠진 패키지가 없는지 확인한다. 직접 패키지 몇 개만 `apt download`하거나 `.deb`에 `dpkg -i`를 실행한 뒤 의존성 오류를 남기는 것으로 끝내지 않는다.

Node/Python 런타임, Ubuntu OS 패키지, npm 캐시, Python wheel, Chromium은 각각 독립된 반입 항목이다. 실제 대상에 필요한 OS 패키지 설치 경로와 완료 결과를 인수 기록에 남긴다.

반입 전에는 네트워크가 차단된 **또 다른 새 사본**에서 8절 설치와 9절 준비가 완료되는지 확인한다. 이미 설치된 `node_modules`나 가상환경이 있는 준비 머신에서 빌드가 성공한 것만으로 오프라인 설치를 확인하지 않는다. Playwright도 다운로드 없이 실제 실행되는지 확인한다.

### 5.4 운반 파일 해시 확정

소스·메타데이터·대상 패키지 준비가 끝나면 운반 디렉터리의 모든 파일 해시를 만든다. 이 파일을 만든 후 내용을 바꾸면 다시 생성한다.

```bash
python3.12 - <<'PY'
import hashlib
import os
from pathlib import Path
root = Path(os.environ['WINMATE_BUNDLE_DIR']).resolve()
target = root / 'SHA256SUMS'
with target.open('w', encoding='utf-8') as out:
    for path in sorted(root.rglob('*')):
        if path.is_file() and path != target:
            with path.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            out.write(f'{digest}  {path.relative_to(root).as_posix()}\n')
PY
```

`deps/node/`, `deps/python/`, `deps/playwright/`의 파일 권한·심볼릭 링크도 보존해서 옮긴다. 폴더 자체를 tar로 운반하면 된다. 두 LLM 키, 로그인 인증 파일, 개인 브라우저 백업은 이 일반 반입본에 넣지 않는다. 사용자 제공 LLM·검색 폴더의 반입·설정 지침은 별도로 적용한다.

## 6. 사내망에서 반입본 검증·전개

운반 디렉터리를 Ubuntu의 **실행·쓰기 가능한 로컬 파일시스템**에 둔다. 아래 예는 현재 사용자 소유 디렉터리다. `/srv`나 `/opt`에 배치한다면 운영 계정의 권한을 먼저 준비한다. USB·공유 폴더가 `noexec`로 mount되어 있으면 그 위치에서 런타임을 실행하지 않는다.

```bash
export WINMATE_BUNDLE_DIR="$HOME/winmate-transfer"
export WINMATE_PROJECT_DIR="$HOME/apps/winmate"

# Ubuntu: 운반 디렉터리의 모든 파일 확인.
cd "$WINMATE_BUNDLE_DIR"
sha256sum -c SHA256SUMS || exit 1

# OS 패키지는 사내 APT 저장소 또는 준비한 오프라인 저장소로 설치한다.
# 그 뒤 반입한 Ubuntu용 Node/Python을 선택한다.
export WINMATE_PYTHON_BIN="$WINMATE_BUNDLE_DIR/deps/python/$(cat "$WINMATE_BUNDLE_DIR/metadata/python-runtime-relative.txt")"
test -x "$WINMATE_PYTHON_BIN"
export PATH="$WINMATE_BUNDLE_DIR/deps/node/bin:$(dirname "$WINMATE_PYTHON_BIN"):$PATH"
export UV_PYTHON_DOWNLOADS=never
node --version
npm --version
python3.12 --version

# 기존 운영본과 겹치지 않는 비어 있는 새 디렉터리에 전개한다.
mkdir -p "$WINMATE_PROJECT_DIR"
test -z "$(ls -A "$WINMATE_PROJECT_DIR")"
tar -xzf "$WINMATE_BUNDLE_DIR/winmate-source.tar.gz" -C "$WINMATE_PROJECT_DIR"
cd "$WINMATE_PROJECT_DIR"
```

압축을 푼 뒤 소스와 자산을 manifest와 대조한다. 이 검사는 빌드·공간 라이브러리 생성 **전**에 한다. 생성 작업은 일부 준비 파일을 다시 쓸 수 있다.

```bash
python3.12 - <<'PY'
import hashlib
import json
import os
from pathlib import Path
root = Path.cwd()
manifest = Path(os.environ['WINMATE_BUNDLE_DIR']) / 'source-manifest.json'
errors = []
for item in json.loads(manifest.read_text(encoding='utf-8'))['files']:
    path = root / item['path']
    if item['type'] == 'symlink':
        ok = path.is_symlink() and os.readlink(path) == item['target'] and path.exists()
    else:
        ok = path.is_file() and not path.is_symlink() and path.stat().st_size == item['bytes']
        if ok:
            with path.open('rb') as stream:
                ok = hashlib.file_digest(stream, 'sha256').hexdigest() == item['sha256']
    if not ok:
        errors.append(item['path'])
assert not errors, '누락·변경 파일: ' + ', '.join(errors[:20])
assert not (root / 'admin').exists(), '사용자 앱 전개 디렉터리에는 admin/을 포함하지 않습니다.'
print('source-manifest: OK')
PY
```

실행 권한이 운반 과정에서 사라졌다면 `chmod +x start.sh app/start.sh`로 복구한다. 경로의 대소문자 차이는 Ubuntu에서 별도 파일이므로 Mac에서 통과한 경로도 대상에서 검증한다.

`deps/python/`은 생성할 가상환경이 참조하는 기본 런타임이다. 위 예의 `WINMATE_BUNDLE_DIR`는 임시 USB 경로가 아니라 **운영 중 유지할 고정 경로**로 정한다. 설치 후 Node/Python 런타임 디렉터리를 이동·삭제하지 않는다. 위치를 바꿀 경우 새 경로에서 가상환경을 다시 만들고 8~12절을 검증한다. 새 터미널에서도 6절의 런타임 PATH를 적용한 뒤 빌드·검증을 실행한다.

## 7. 사용자 제공 폴더의 사내 LLM·검색 연결 적용

사내 LLM·검색 관련 설정과 구현 지침은 문서 앞의 **작업 프롬프트에 사용자가 입력하는 폴더**에서 가져온다. 이 절에는 모델명·API 주소·키 변수·인증 헤더·검색 규격의 예시값을 두지 않는다. 해당 정보는 사용자가 폴더에 포함해 제공한다.

### 7.1 자료 적용 순서

1. 프롬프트의 폴더 경로가 실제로 존재하는지 확인하고, README·설정 설명·실행 예제·인증/인증서·추가 의존성을 읽는다.
2. 제공 자료의 방식으로 사내 LLM·두 인증 키·검색을 연결한다. 키의 용도와 선택 방식도 자료를 그대로 따른다.
3. 연결 변경은 현재 공통 경계인 `app/api/llm/`, `app/api/poc/settings.py`와 검색 서비스 경계에 반영한다. 기존 `app/api/poc/provider.py` 호환 진입점과 화면의 호출 계약을 유지한다.
4. 자료가 추가 Python/npm/OS 패키지를 요구하면 Ubuntu 준비 머신에서 설치·검증한 뒤 5절의 wheel·캐시·OS 패키지와 hash를 다시 만든다. 기존 반입본의 의존성만으로 충분하다고 가정하지 않는다.
5. 자료가 별도 인증서·설정 파일·환경 로더를 요구하면 실제 Ubuntu 경로를 적용하고, 수동 실행과 서비스 실행에 똑같이 반영한다.
6. 자료의 연결 확인 절차와 11~12절의 사용자 기능 인수를 모두 수행한다.

자료 폴더는 일반 소스와 별도로 전달할 수 있다. 4절의 일반 아카이브는 키·인증서 등의 파일을 제외하므로, 제공 폴더가 그 스크립트에 포함됐다는 이유만으로 필요한 파일이 모두 반입되었다고 보지 않는다. 폴더가 지정되기 전에도 OS 확인·파일 검증·기본 의존성 설치·데이터 준비는 진행할 수 있다.

### 7.2 기존 앱과 연결할 때 유지할 사항

현재 앱의 설정 로딩과 실행 진입점을 먼저 읽고 제공 자료를 적용한다. 이 문서의 기본 명령은 `app/.env`를 LLM 설정 입력으로 사용하는 구조를 기준으로 한다. 자료에서 별도 실행 환경이나 로더를 지정하면 그 지침을 반영하고 최종 실행 명령을 기록한다. 모델별 설정이나 두 키의 전달 방식을 화면별 코드에 흩어 두지 않는다.

비밀값은 서버에서만 사용하고 공개 설정·프런트·브라우저 저장소·URL·로그·인수 기록에 출력하지 않는다. 텍스트/구조화 응답·스트리밍·비전·검색 근거·취소/재시도는 실제 앱의 입출력 계약으로 검증한다. 사용자 제공 자료에 없는 연결값을 예제나 이전 Gemini 설정에서 가져와 채우지 않는다.

## 8. Ubuntu 사내망 의존성 설치

Ubuntu 기본 OS 패키지와 Chromium 라이브러리 설치를 마치고, 6절에서 반입한 런타임 PATH를 적용한 상태로 **프로젝트 루트**에서 실행한다. 사내 registry/index를 쓰는 경우는 5.2절을 적용하고, 완전 오프라인이면 다음을 사용한다. 사내 LLM·검색 추가 의존성은 제공 폴더 지침을 먼저 적용한다.

```bash
node --version
npm --version
python3.12 --version

python3.12 -m venv app/.venv
app/.venv/bin/python -m pip install --no-index \
  --find-links "$WINMATE_BUNDLE_DIR/deps/wheels" \
  -r "$WINMATE_BUNDLE_DIR/deps/python-target.freeze.txt"
app/.venv/bin/python -m pip check

npm --prefix app/web ci --offline --include=dev \
  --cache "$WINMATE_BUNDLE_DIR/deps/npm-cache" --no-audit --no-fund

export PLAYWRIGHT_BROWSERS_PATH="$WINMATE_BUNDLE_DIR/deps/playwright"
node --input-type=module - <<'JS'
import {chromium} from './app/web/node_modules/playwright/index.mjs';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
await page.setContent('<title>Winmate bootstrap</title>');
if (await page.title() !== 'Winmate bootstrap') throw new Error('Chromium 실행 실패');
await browser.close();
console.log('Chromium: OK');
JS
```

`pip`가 없는 uv 가상환경을 이미 사용 중이라면 `uv pip install --python app/.venv/bin/python --no-index --find-links ... -r ...` 형태로 같은 wheel 묶음을 설치할 수 있다. 표준 `venv` 생성 경로와 uv 경로 중 하나를 일관되게 사용한다.

`npm ci --offline` 실패 시 캐시 누락 또는 대상 플랫폼용 선택 패키지 누락을 준비 머신에서 보완한다. `--ignore-scripts`나 `--omit=dev`로 빌드 의존성을 생략해 통과시키지 않는다.

## 9. 데이터·공간 자산·웹 준비

설치와 LLM 설정이 끝난 뒤 아래 순서로 준비한다. 공간 생성으로 추가되는 public 자산이 배포본에 포함되도록 공간 준비를 웹 빌드보다 먼저 수행한다.

```bash
export PYTHONDONTWRITEBYTECODE=1
export WINMATE_ENV_FILES=app/.env
export WINMATE_API_PORT=8788
export WINMATE_AUTH=on

# 원본 SQLite는 읽기 전용 입력. 앱 전용 projection을 생성한다.
app/.venv/bin/python -B app/scripts/prepare_data.py

# 제품 치수·오브젝트와 공간 library/scenes/examples 준비.
app/.venv/bin/python -B app/scripts/build_spatial_products.py
node app/scripts/build_spatial_library.mjs

# 레이아웃·상품·시나리오·검토 기준의 정본 Agent KB 생성.
node app/scripts/export_agent_data.mjs

# guide_context, 이미지 ranges, Vite 배포본, migration-export.js 생성.
npm --prefix app/web run build

app/.venv/bin/python -B app/scripts/preflight.py --deep

# 사용자 앱의 기본 로그인 초기화. 별도 admin/ 앱을 준비하는 명령이 아니다.
app/.venv/bin/python -B app/scripts/manage_auth.py --ensure
app/.venv/bin/python -B app/scripts/preflight.py --deep --require-auth
```

첫 로그인 초기화는 기본 계정 `admin`과 무작위 비밀번호를 만들고 터미널에 한 번 표시한다. 이것은 사용자 앱에 포함된 기존 단일 계정 이름이며, 제외한 `admin/` 관리 앱과는 별개다. 기존 인증을 14절에서 복원했다면 `--ensure`는 기존 계정을 바꾸지 않는다. 비대화식 초기화가 필요하면 `manage_auth.py --ensure --password-env <실제_환경변수명>`을 사용하고 실행 후 해당 셸 변수를 해제한다.

`prepare_data.py`는 `proddb/winmate_products.sqlite`를 앱 runtime으로 복제하고 `app/data/product-details/`의 검토된 상세를 반영한다. 원본 제품 DB 또는 PoC의 `sync_source.py`를 실행해 복원을 대체하지 않는다.

현재 기준 정본 KB의 기대 수치는 다음과 같다. 데이터·모듈화를 마무리한 반입본에서 수치가 달라졌다면 그 반입본의 manifest와 검증된 변경 기록으로 갱신한다. 단순히 오류를 넘기려고 `--allow-count-drift`를 사용하지 않는다.

| 항목 | 기준 |
|---|---:|
| 제품 | 1,068 |
| 큐레이션 제품 | 40 |
| 레이아웃 전체 / 활성 | 856 / 615 |
| Best Scenario | 82 |
| 업종 / 솔루션 / 사례 | 16 / 17 / 218 |
| 고정 게시본 파일 | 511 |

`preflight --deep`는 고정 게시본·KB 입력/출력의 해시와 SQLite를 검사한다. 웹 빌드 파일 일부의 존재만 확인하는 검사이므로 전체 이미지·폰트·브라우저·LLM 기능 검증까지 대신하지 않는다. 경고도 원인을 확인하고, 실패가 있으면 기동 전 해결한다.

## 10. 실행과 재시작

### 10.1 사내망 표준 실행

준비가 끝난 사용자 앱을 직접 실행한다. 이 경로는 설치·빌드를 다시 수행하지 않고, `admin/.enabled` 여부와 무관하게 사용자 앱만 선택한다.

```bash
export PYTHONDONTWRITEBYTECODE=1
export WINMATE_ENV_FILES=app/.env
export WINMATE_API_PORT=8788
export WINMATE_AUTH=on

exec app/.venv/bin/python -B -m uvicorn app.api.main:app \
  --host 127.0.0.1 --port "$WINMATE_API_PORT" --workers 1 --no-access-log
```

브라우저에서 `http://127.0.0.1:8788`을 연다. 현재 서버는 시작 시 캐시를 사용하지 않는 **실제 LLM 연결 확인**을 수행한다. 키·모델·인증서·네트워크·응답 형식이 잘못되면 시작에 실패한다. health 응답이 돌아온 것과 비전·두 번째 키·웹 검색을 검증한 것은 별개다.

개발용 `./start.sh` 또는 `make up`은 매번 Python 의존성 설치와 웹·데이터 준비를 수행한다. 또한 저장소에 `admin/.enabled` 등이 있으면 별도 앱을 고르는 경로가 있다. 이 문서의 오프라인 운영은 위 **명시적 사용자 ASGI 진입점**을 사용한다.

종료는 실행 터미널에서 Ctrl+C, 재시작은 같은 디렉터리·환경 변수로 다시 실행한다. 다중 worker/여러 서버로의 확장은 작업 상태·세션·파일 저장 계약까지 별도 설계해야 한다. 큐만 Redis로 바꾼 것으로 사용자 앱 전체의 다중 서버 구성이 완성되지는 않는다.

### 10.2 다른 사내 PC에서 접속할 경우

로컬 사용만이면 위 loopback 설정을 유지한다. 공용 사내 주소가 필요하면 사내 HTTPS reverse proxy를 같은 origin으로 연결한다. 소스의 `<base href="/">`와 `/api`, `/assets`, `/img` 절대 경로 때문에 **도메인 루트 `/` 제공**을 기준으로 한다. `/winmate/` 하위 배포는 별도 경로 수정 없이는 지원한다고 가정하지 않는다.

프록시는 Host와 원래 HTTPS scheme을 전달하고, 신뢰하는 프록시의 전달 헤더만 backend가 사용하도록 한다. SSE 응답 buffering을 끄고, 읽기 timeout은 설정된 큐 대기·모델 실행·여러 단계 작업의 실제 시간을 수용하도록 정한다. 첨부·공유 자산의 실제 최대 크기에 맞춰 요청 본문 한도도 검증한다. API/Web origin을 나누거나 CORS로 우회하지 않는다.

설치 대상의 DNS·인증서·프록시 주소는 실제 운영값을 적용한다. 프로세스 관리자에는 위 실행 명령, 절대 작업 경로, runtime 쓰기 권한, 실제 환경 변수, 기동 실패 로그를 그대로 반영한다. Cloudflare/외부 터널은 사내망 재현 절차에 포함하지 않는다.

LLM·검색 인증서·네트워크·프록시 설정은 사용자 제공 폴더의 지침을 따른다. Python 요청·npm 설치·브라우저 검증 각각에서 설정이 적용되는지 실제 Ubuntu에서 확인한다.

### 10.3 Ubuntu에서 systemd 사용자 서비스로 실행

터미널 실행과 11~12절 검증을 먼저 마친 뒤 상시 실행이 필요할 때 적용한다. 아래는 현재 Ubuntu 사용자의 서비스이며 `admin/`을 사용하지 않는다. 6절의 `WINMATE_PROJECT_DIR`, `WINMATE_BUNDLE_DIR`, `WINMATE_PYTHON_BIN`이 설정되어 있어야 한다. 먼저 터미널에서 실행 중인 앱을 종료해 8788 포트 충돌을 피한다.

```bash
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/winmate.service" <<EOF
[Unit]
Description=Winmate user application

[Service]
Type=simple
WorkingDirectory="$WINMATE_PROJECT_DIR"
Environment=PYTHONDONTWRITEBYTECODE=1
Environment=WINMATE_ENV_FILES=app/.env
Environment=WINMATE_API_PORT=8788
Environment=WINMATE_AUTH=on
Environment="PATH=$WINMATE_BUNDLE_DIR/deps/node/bin:$(dirname "$WINMATE_PYTHON_BIN"):/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=-$WINMATE_PROJECT_DIR/.runtime.env
ExecStart="$WINMATE_PROJECT_DIR/app/.venv/bin/python" -B -m uvicorn app.api.main:app --host 127.0.0.1 --port 8788 --workers 1 --no-access-log
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
EOF
systemd-analyze --user verify "$HOME/.config/systemd/user/winmate.service"
systemctl --user daemon-reload
systemctl --user enable --now winmate.service
systemctl --user status winmate.service --no-pager
journalctl --user -u winmate.service -n 100 --no-pager
```

`app/.env`는 앱의 설정 파서가 읽고, 선택적인 `.runtime.env`는 systemd가 읽는다. 제공 폴더에서 프로세스 환경 변수 등을 지정하면 systemd 형식으로 `.runtime.env` 또는 unit에 반영한다. `.runtime.env`는 자동 생성하지 않으며 실제 내용은 사용자 제공 지침을 따른다. 비밀값이 들어 있는 설정 파일은 소유 사용자만 읽도록 제한한다.

```bash
# 상태·재시작·종료·로그
systemctl --user status winmate.service --no-pager
systemctl --user restart winmate.service
systemctl --user stop winmate.service
journalctl --user -u winmate.service -f
```

재부팅·로그아웃 후에도 사용자의 서비스를 유지해야 한다면 운영 정책에 맞춰 `sudo loginctl enable-linger "$(id -un)"`를 설정한다. systemd 실행 후에도 11절의 health·로그인·실제 LLM 검증을 다시 수행해 터미널에만 있던 환경 변수가 빠지지 않았는지 확인한다. 앱·런타임 경로를 변경한 경우 unit을 갱신하고 `daemon-reload` 후 재시작한다.

## 11. 모델 이름에 의존하지 않는 기동 확인

루트에서 다음을 실행한다. 실제 사내 LLM 요청 1회가 발생한다. 비밀번호는 숨김 입력하며 키나 쿠키를 출력하지 않는다. 모델명에 `gemini` 접두사가 있는지를 성공 기준으로 쓰지 않는다.

```bash
app/.venv/bin/python -B - <<'PY'
import getpass
import http.cookiejar
import json
import os
import time
import urllib.request

base = os.environ.get('WINMATE_CHECK_URL', 'http://127.0.0.1:' + os.environ.get('WINMATE_API_PORT', '8788')).rstrip('/')
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

def call(path, payload=None):
    body = None if payload is None else json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(base + path, data=body,
        headers={'Content-Type': 'application/json', 'Origin': base})
    with client.open(request, timeout=720) as response:
        return json.load(response)

health = call('/api/health')
assert health['ok'] and health['products'] == 1068, 'health/product count'
status = call('/api/auth/status')
assert status['enabled'] and status['configured'], '기본 로그인 설정 확인'
username = os.environ.get('WINMATE_CHECK_USER', 'admin')
password = getpass.getpass('사용자 앱 로그인 비밀번호: ')
assert call('/api/auth/login', {'username': username, 'password': password})['ok']
del password
try:
    caps = call('/api/poc/capabilities')
    assert caps['initialized'] and caps['provider']['available'], 'provider initialization'
    assert (caps.get('connection') or {}).get('verified'), '실제 기동 연결 확인'
    bad = [name for name, item in caps['functions'].items() if not item['ready']]
    assert not bad, '준비되지 않은 기능: ' + ', '.join(bad)
    deadline = time.monotonic() + 60
    while caps['warm'] not in ('ready', 'error') and time.monotonic() < deadline:
        time.sleep(.2)
        caps = call('/api/poc/capabilities')
    assert caps['warm'] == 'ready', 'KB warm-up 실패 또는 대기 한도 초과'
    products = call('/api/products')
    assert products['total'] == len(products['items']) == 1068
    result = call('/api/llm', {
        'kind': 'json', 'feature': 'llm',
        'prompt': 'Return exactly one JSON object with status equal to verified.',
        'response_schema': {'type': 'OBJECT', 'properties': {
            'status': {'type': 'STRING', 'enum': ['verified']}}, 'required': ['status']},
    })
    assert result['mode'] == 'real' and result['data']['status'] == 'verified'
    print('OK: 로그인·제품·공통 기능 준비·실제 LLM JSON 응답')
    print('provider:', caps['provider']['name'], '/ model:', result['model'])
finally:
    call('/api/auth/logout', {})
PY
```

현재 일부 기존 smoke/live 도구는 과거 로그인 정책 또는 Gemini 모델명/설정에 대한 가정을 포함할 수 있다. 예를 들어 `app/scripts/smoke.py`의 미로그인 API 거절 검사와 모델명 검사를 그대로 사내 provider의 인수 기준으로 사용하지 않는다. 모듈화 후 provider와 현재 공개 둘러보기 계약에 맞게 갱신했는지 확인한다. `make smoke`의 성공만으로 전체 재현을 판정하지 않는다.

## 12. 자동 검증과 기능 인수

### 12.1 기본 검증

대상 플랫폼에서 테스트 의존성까지 설치한 상태로 실행한다.

```bash
app/.venv/bin/python -B app/scripts/preflight.py --deep --require-auth
make test

# 인증된 사용자 앱에 연결. 비밀번호를 명령행 기록에 직접 적지 않는다.
export PLAYWRIGHT_BROWSERS_PATH="$WINMATE_BUNDLE_DIR/deps/playwright"
export WINMATE_TEST_URL=http://127.0.0.1:8788
read -r -s -p '사용자 앱 테스트 비밀번호: ' WINMATE_TEST_PASSWORD
printf '\n'
export WINMATE_TEST_PASSWORD
make test-browser
unset WINMATE_TEST_PASSWORD
```

위 `read` 예시는 Ubuntu Bash 기준이다. 브라우저 테스트는 기본적으로 별도 Vite 포트를 사용하므로 5173/5199 등 테스트가 사용하는 로컬 포트 충돌도 확인한다.

`make test`/결정적 브라우저 테스트는 계약·저장·UI 검증이며, 실제 사내 모델의 성공 품질·비전·검색 지원을 대신 검증하지 않는다. 현재 `make test`에는 공통 provider의 `test_llm_service.py`, 큐의 `test_llm_queue.py`도 포함된다. 사용자 제공 폴더의 LLM·두 키·검색 검증도 함께 실행하고 결과를 인수 기록에 남긴다. 사내 LLM 연결 후에는 11절과 다음 기능 인수를 실제 모델로 수행한다.

`make test-live`는 기존 구성상 여러 격리 서버와 실제 모델 호출 다수를 발생시키는 전체 suite다. 사내 provider 설정 전달·테스트 서버 인증·쿼터·모델명 가정이 갱신된 것을 먼저 확인하고 실행한다. 개별 기능을 통과시키려고 mock 응답을 사내 운영 경로에 추가하지 않는다.

### 12.2 기능 인수표

Mac과 사내망에 같은 합성 요구사항·PDF/PPTX·장표를 사용하고, 사용자 데이터가 없는 별도 브라우저 프로필에서 비교한다.

| 범위 | 반드시 확인할 동작 |
|---|---|
| 첫 접속·인증 | 홈과 공개 라이브러리 열람, 작업 시 로그인, 로그인·로그아웃, 재접속 |
| 제품·솔루션·사례 | 목록·필터·상세·사양·이미지·페이지네이션, 동일 자산 수 |
| 제안서 | 요구사항·첨부 읽기, 근거 있는 요약, Storyboard 생성/수정·질문 재개·새로고침 |
| 레이아웃 | 검색/재정렬, 맥락 채움, 텍스트·이미지 수정, 개수 변경·배경, 미리보기 |
| 표준제안서 | 일반 시나리오와 설명 기반 표준 장표·주석·그래픽 모두 표시 |
| 검토 | TXT/DOCX/PPTX/PDF 읽기, 텍스트 검토, 선택 PDF 페이지의 실제 비전 검토·기준별 점수 |
| 시뮬레이션 | 페르소나 대화 SSE·취소·평가, 자료 조사 스킬의 실제 검색·출처 |
| 가이드 | 모든 가이드/GIF, 가이드 에이전트 답변 SSE·이동·닫기/취소 |
| 공간 조감도 | 첫 로딩, 템플릿·제품·가구·재질·사람, 2D/3D, AI 생성·수정·저장·재열기 |
| 저장·공유 | 히스토리·찜·My 템플릿, 파일/이미지 재열기, 공유 읽기·권한 있는 편집·URL 직접 접속 |
| PPTX | 1280×720 장표 편집 → PPTX 다운로드 → Office에서 텍스트/도형 편집 → My 템플릿 가져오기 |
| 실패 | 키별 인증 오류, 비전 미지원, 잘못된 JSON, 429/5xx, 큐 대기, timeout, 취소 후 입력 보존 |
| 오프라인 | 브라우저의 외부 통신을 차단한 상태에서 로컬 자산·파서·저장/내보내기 정상 동작 |

브라우저 PDF 렌더링은 `/lib/pdf.min.js`, `/lib/pdf.worker.min.js`와 한글 CMap 자료를 우선 사용한다. 폐쇄망에서는 CDN fallback에 기대지 않는다. PPTX 생성·DOCX/PPTX 파싱은 클라이언트 라이브러리를 사용하므로 이 경로의 기본 실행에 LibreOffice를 추가 설치할 필요는 없다. 실제 Office 렌더링까지 비교하는 검수에서는 동일 Office 버전·한글 폰트도 맞춘다.

결과에는 반입 manifest, 대상 환경, 비밀값을 제외한 provider/model, 두 키의 검증 범위, 통과·실패 항목, 화면/PPTX, 테스트 로그를 남긴다. `caps.functions[*].ready=true`는 웹 검색 같은 provider별 capability를 모두 실제 호출했다는 뜻은 아니다.

## 13. Ubuntu 폐쇄망에서 확인할 자산·외부 연결

사내 LLM·검색·관련 외부 연결의 대체 방식은 사용자 제공 폴더의 지침을 적용한다. 이 문서에는 그 설정값을 중복 기입하지 않는다. 아래는 앱 재현 시 함께 확인할 로컬 자산과 설치 경로다.

| 범위 | 확인 사항 |
|---|---|
| 사내 LLM·검색·관련 연결 | 프롬프트에 입력한 자료 폴더의 설정·예제·검증 절차 적용 |
| PDF | 로컬 `/lib`의 JS·worker·한글 CMap 반입. CDN fallback 없이 확인 |
| 제품/솔루션 자료 | 수집된 이미지 pack은 로컬 표시. 원문·e-카탈로그·동영상 링크는 제공 지침의 접근 방식으로 검증 |
| Ubuntu 설치 | OS 패키지와 glibc, 반입 Node/Python, npm 캐시·wheel·Chromium을 각각 확인 |
| 폰트·이미지 | public/fonts, reference/live/img, img/lib, public/assets 전체를 새 브라우저 프로필에서 확인 |
| 브라우저·backend 통신 | 제공 자료가 지정한 연결 외에 의도하지 않은 다운로드나 외부 요청이 남는지 확인 |

브라우저 캐시가 자산 누락을 숨기지 않도록 새 프로필에서 확인하고, 설치가 끝난 뒤 자동 패키지·브라우저 다운로드가 발생하지 않는지 점검한다. 사내 연결의 구현과 검증은 제공 폴더를 기준으로 진행하며, 원래 사용자 기능을 임의로 끄는 방식으로 완료 처리하지 않는다.

## 14. 기존 사용자 데이터까지 이전하기

### 14.1 새 설치와 현재 작업 내용 복제는 별도 작업

일반 소스 반입본은 빈 runtime에서 시작한다. Mac의 제안서·검토·시뮬레이션·찜·My 템플릿·공유본까지 필요하면 **브라우저 저장 데이터와 서버 저장 데이터 둘 다** 이전한다. `.venv`나 Git 이력에는 이 데이터가 없다.

### 14.2 브라우저 데이터

1. Mac의 실제 사용 주소·브라우저 프로필에서 `/migration.html`을 연다. `localhost`와 `127.0.0.1`, 포트/도메인이 다르면 저장소도 다르다.
2. **백업 JSON 내보내기**를 실행한다. localStorage와 IndexedDB의 이미지·원문 문서까지 포함한다. 키·계정 인증 정보는 포함하지 않는다.
3. 사내망 앱의 실제 운영 origin에서 같은 페이지의 **백업 가져오기**로 복원하고 앱을 새로 연다.
4. 제안서·이미지·첨부·템플릿·검토·시뮬레이션·찜을 각각 확인한다.

현재 백업은 같은 ID를 백업 내용으로 갱신하고 다른 항목을 병합하므로 깨끗한 프로필에서 복원하면 비교가 쉽다. 완료되지 않은 메모리상의 AI 작업 자체를 재개하는 백업은 아니다. 계정별 브라우저 namespace를 사용하는 별도 계정 통합은 이 문서의 관리 앱 제외 범위 밖이며, 이전 전후 실제 사용자 저장 범위를 확인한다.

### 14.3 서버 데이터

사용자 앱 기본 저장 경로는 다음과 같다. `WINMATE_*`로 경로를 바꾼 운영본은 실제 경로를 별도 기록하고 그 위치를 백업한다.

| 경로 | 내용 |
|---|---|
| `app/data/runtime/auth/` | 사용자 앱 기본 로그인 hash·서명 키. 기존 로그인을 유지할 때만 별도 비밀 반입 |
| `app/data/runtime/storyboards/` | 공유/히스토리 원본 DB 및 관련 자산 |
| `app/data/runtime/my_templates.sqlite` | 서버의 사용자 템플릿 등 기본 저장 DB |
| `app/data/runtime/spatial.sqlite` | 사용자 공간 저장 기록 |
| `app/data/runtime/catalog_metrics.sqlite` | 날짜별 자산 집계. 새로 생성 가능 |
| `app/data/runtime/winmate_products.sqlite`, `kb/` | 원본에서 재생성할 projection·KB |
| `llm-queue.sqlite`, `llm-cache/`, 기타 cache | 이전 대상에서 제외. 새 환경에서 다시 생성 |

서버 쓰기와 실행 중인 AI 작업을 멈춘 뒤 **앱을 종료한 상태에서** 필요한 서버 데이터와 SQLite의 `-wal`/`-shm` 동반 파일을 일관된 시점으로 백업한다. 사용자 저장 파일을 새 운영 디렉터리에 복원하고 기존 계정의 소유자 이름·공유 token·권한을 유지한다. `WINMATE_AUTH_DIR`, `WINMATE_STORYBOARD_DIR`, `WINMATE_TEMPLATE_DB`, `WINMATE_SPATIAL_DB`를 쓴다면 같은 논리 경로를 새 위치로 지정한다.

새로운 배포에 기본 로그인을 새로 만들 경우 기존 `auth/`는 복사하지 않는다. 기존 로그인을 유지하면 인증 파일과 서명 키를 일반 소스 묶음과 분리해 옮긴다. 공간 기록의 이전에는 그 기록이 참조하는 `app/data/spatial/versions/`와 public 자산도 필요하다. 브라우저 JSON만으로 서버 공유본·서버 공간 DB·서버 템플릿을 복원했다고 보지 않는다.

이전 후 `preflight --deep --require-auth`와 기능 인수표를 다시 실행한다. 기존 공유 링크의 도메인은 바뀌지만 token 경로를 유지할 수 있는지 확인하고 새 운영 주소에서 접근한다. 기존 Mac 주소에만 남은 링크를 그대로 사용자에게 전달하지 않는다.

## 15. 문제 해결과 재배포

| 증상 | 확인·해결 |
|---|---|
| `npm ci --offline` 캐시 오류 | 정확한 lock과 대상 OS/CPU로 준비한 캐시인지 확인. 연결 가능한 준비 머신에서 다시 채움 |
| esbuild/sharp 실행 오류 | Mac의 node_modules를 복사했는지, Ubuntu VERSION_ID·CPU·glibc와 native 패키지가 맞는지 확인 |
| Python 설치/동적 라이브러리 오류 | Ubuntu용 Python 런타임·3.12 wheel·전이 의존성과 `deps/python` 고정 경로 확인. `pip check` 실행 |
| `/img`, `/lib` 누락 | `app/data/static` 링크와 `reference/live` 복원. `img/lib`는 별도 mount이므로 함께 확인 |
| 표준 장표·공간 이미지 누락 | `public/assets` 전체·과거 spatial versions 포함 여부 확인. 공간 준비 후 웹 재빌드 |
| `no_api_key`, 기동 연결 실패 | 사용자 제공 폴더의 설정·인증·인증서·네트워크 지침과 실제 실행 환경 대조 |
| `unsupported_capability` | 사용자 제공 폴더의 연결 지침·지원 기능·검증 예제를 실제 호출 경로와 대조 |
| 로그인/AI POST가 403 | 실제 Host·Origin·HTTPS scheme·프록시 전달 헤더 확인. 프런트와 API는 같은 origin |
| SSE가 마지막에 한꺼번에 표시 | 프록시 buffering·idle/read timeout과 gateway 스트리밍 확인 |
| Chromium 실행/WebGL 실패 | Ubuntu OS 공유 라이브러리·브라우저 실행 권한·noexec mount·그래픽 설정 확인 |
| 서비스에서만 실패 | `journalctl --user -u winmate.service`와 WorkingDirectory·runtime PATH·환경 파일·파일 권한 확인 |
| Mac 작업 내역이 안 보임 | 원래 origin의 브라우저 백업과 서버 저장본을 각각 복원했는지 확인 |
| AI 작업이 재시작 후 사라짐 | 현재 작업 관리에는 메모리 상태가 포함됨. 완료 결과 저장과 실행 중 작업 재개를 구분 |
| 개발 화면만 열림 | 사용자 배포 주소는 8788. Vite 5173/5199는 개발·테스트용 |

업데이트는 새 소스 디렉터리에서 manifest·설치·준비·검증을 마친 뒤 앱을 종료하고 사용자 서버 데이터를 백업한 상태로 전환한다. `app/web/dist`를 실행 중 덮어쓰며 오래 열린 탭의 lazy chunk를 삭제하지 않는다. 새 배포 후 기존 브라우저 탭은 새로고침한다.

롤백 시 코드뿐 아니라 호환되는 데이터·공간 버전·public 자산과 필요 시 사용자 저장 백업을 함께 되돌린다. DB/브라우저 저장 형식이 변경된 배포는 이전 코드가 새 저장본을 읽을 수 있는지 먼저 확인한다. 이전에 성공한 반입본·manifest·대상 의존성 묶음·인수 기록을 보관한다.

## 16. 반입 인수 기록 양식

```text
반입 기준 일시 / 작업 트리 manifest:
Git HEAD / 미커밋 변경 포함 여부:
Ubuntu VERSION_ID / CPU / glibc / Node / npm / Python / Chromium:
소스·데이터 해시 검증 결과:
의존성 설치 경로: Ubuntu OS 패키지 / Node·Python 런타임 / npm 캐시 / wheel / Chromium
실제 제공 origin / backend 작업 디렉터리:
사용자 제공 사내 LLM·검색 자료 폴더 / 적용 지침·검증 결과: (비밀값 금지)
preflight / 계약 테스트 / 브라우저 테스트 / 실제 기능 인수 결과:
브라우저·서버 사용자 데이터 이전 범위와 복원 확인:
미지원 기능 또는 의도된 환경 차이:
롤백할 반입본·사용자 저장 백업 위치:
```

사용자 제공 폴더의 연결 지침을 적용하고 Ubuntu 설치·기능 인수표를 통과한 상태가 사내망 재현 완료본이다.

## 17. 이 문서의 작성 검증 범위

- 현재 Mac에서 `preflight.py --deep --require-auth`를 실행해 소스 DB·고정 게시본·KB·로그인·웹 준비 검사가 모두 통과했다.
- 문서의 Bash/Python/JavaScript 명령 문법과 반입 경로를 확인했다. Ubuntu 절차는 대상 버전·CPU를 확인해 적용하는 구조로 정리했다.
- 임시 파일로 문서의 아카이브·해시 스크립트를 실행해 관리자 앱·키/인증 파일·runtime 제외, 심볼릭 링크 복원, 변조 검출을 확인했다.
- 실제 Ubuntu 사내망 설치와 사내 연동 호출은 사용자 제공 폴더를 적용한 뒤 11~13절에 따라 검증해야 한다. 현재 Mac에서 Ubuntu 실행까지 검증한 것은 아니다.
