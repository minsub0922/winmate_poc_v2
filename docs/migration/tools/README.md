# 0단계 조사 도구

앱 구현이 아닌 고정 기준 검증·조사 도구다. 원본 `src`, `dist`, `poc`, `proddb`를 쓰지 않는다.

## 기준 파일 검증

프로젝트 루트에서 Python 3.11 이상(조사에서는 3.12/3.13)으로:

```sh
python3 docs/migration/tools/verify-reference.py
```

511개 파일의 크기·SHA-256, 보관 ZIP 해시, 실행 중 확인했던 스크립트 지문, 차이 목록·이미지 검증 결과를 확인한다. 런타임을 새로 열어 확인하는 명령은 아니며 새로운 버전의 원격 자산을 자동으로 덮어쓰지 않는다.

## 보관한 로컬 사본

- `reference/source-build/`: 조사 초기에 고정한 소스·데이터·이미지·빌드 스크립트, npm 의존성, `dist/`.
- `reference/source-build-latest/`: 말미의 동시 변경을 포함하는 별도 사본. 의존성은 초기 사본의 node_modules를 사용한다.
- 둘 다 Git 제외. 최초 빌드의 lock과 패키지 버전은 `../evidence/source-build-package-lock.json`, `node-dependencies.json`에 있다.
- 기존 원본 위치에서 `node build/build.mjs`를 실행하지 않는다. 이 명령은 원본 dist/img를 삭제·교체한다.

새 조사 사본이 필요하면 src/data/img와 `build/build.mjs`, package.json을 새 디렉터리로 **복사**하고 고정 lock으로 의존성을 준비한 후, 복사한 build 스크립트만 실행한다. 기존 사본을 최신 파일로 덮어쓰면 이번 조사 증거가 사라진다.

## 번들 차이 재생성

초기 두 번들의 앱 `<script>`·`<style>`와 `wm-layouts`를 추출했다. esbuild 0.24.2의 `transform({minify:false,charset:'utf8'})`로 생성한 `../evidence/source.pretty.js`, `live.pretty.js`는 로컬 중간 산출물이다. 원시 JS·pretty JS·전체 diff의 중복 커밋을 피했다.

이 중간 파일이 있는 조사 작업 공간에서는:

```sh
node docs/migration/tools/normalize-bundle.mjs
node docs/migration/tools/extract-data.mjs
```

- `normalize-bundle.mjs`: **이번 고정 번들에서 관찰한** esbuild E/T 식별자 차이를 Acorn AST로 정규화한다. 속성 이름은 보존한다. 일반적인 JS 의미 동등성 증명 도구가 아니며 새 버전에 그대로 적용하면 안 된다.
- `extract-data.mjs`: 이번 번들의 `vn` object literal을 data-only AST 순회로 JSON 복원한다. eval/VM/원격 API를 호출하지 않는다. 새 번들은 식별자가 달라질 수 있다.
- 정규화 전 diff 472곳, 이후 6곳을 분류한 결과가 `semantic-change-hunks.json`이다. media는 두 JSON 객체를 재귀 비교해 `media-data-differences.json`에 257개 값으로 보관했다.
- CSS는 소스의 CSS 연결 순서 그대로 라이브 CSS와 비교했고 `source-vs-live-css.diff`에 보관했다.
- 후기 원본 변경은 초기→후기 `src` 전체 diff와 제품 JSON 필드 차이로 보관했다. 초기 비교 결과를 후기 빌드 결과인 것처럼 덮어쓰지 않았다.

## 테스트 환경

격리된 `reference/source-build/.venv/`의 Python은 3.12.13이다. 설치 목록은 `python-dependencies.txt`에 보관했다. 환경은 uv로 준비했으며 pip 모듈이 내장된 환경이라는 가정은 하지 않는다.

PoC 테스트는 `PYTHONDONTWRITEBYTECODE=1`, RFP/score의 실호출 플래그 0, Layout의 `WINMATE_LLM=offline`, `WINMATE_DENSE=tfidf`, `LANGSMITH_TRACING=false`, `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`, pytest `-p no:cacheprovider`로 실행했다. 로그에는 실제 사용한 원본 파일 경로와 테스트 이름이 있다. 키를 stdout에 쓰거나 유료 모델을 호출하지 않았다.

현재 PoC 파일의 해시는 원본 체크섬에 기록되어 있다. 테스트 중 변경된 원본 PoC 파일은 없었다. Python 3.9에서의 초기 RFP 실패 로그도 버리지 않고 환경 차이 근거로 남겼다.
