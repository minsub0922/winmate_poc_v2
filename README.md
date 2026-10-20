# Winmate v2

현재 웹앱은 `app/`의 React·FastAPI 앱이며, `http://127.0.0.1:8788`에서 실행한다.

```sh
./start.sh
# 또는 make up
```

설치, Gemini 설정, 인증, 데이터 갱신과 검증 방법은 [app/README.md](app/README.md)를 따른다.

```sh
make prepare       # 앱 DB snapshot과 Agent KB 준비
make test          # API·인증·실패 정책·저장 계약 검사
make test-browser  # 격리된 브라우저에서 현재 앱 검사
```

`npm start`, `npm run build`, `npm test`도 현재 앱의 실행·빌드·검증 명령으로 연결된다. 앱의 npm 의존성은 `app/web/package.json`에 있으며, 루트 package.json의 의존성은 보존한 자료 제작·평가 도구용이다.

## 코드와 자료의 위치

| 경로 | 용도 |
|---|---|
| `app/api/`, `app/web/src/`, `app/scripts/` | 현재 앱의 서버·화면·운영 코드 |
| `app/data/` | 앱 입력과 로컬 실행 데이터. `static`은 `reference/live`를 가리킴 |
| `poc/` | 현재 앱이 불러오는 AI 모듈, 평가 도구·데이터·실험 기록 |
| `proddb/` | 제품 SQLite, 수집 원본·스크립트, 카탈로그, 이미지와 출처 |
| `data/`, `img/` | 수집·제작 도구에서 사용하는 원천 데이터와 이미지 |
| `build/` | 자료 수집·이미지 가공·레이아웃 제작 및 과거 비교 검증 도구 |
| `src/` | 자료 추출·평가 도구의 공용 모듈·데이터와 출처 대장. 구버전 화면·실행 진입점은 제거함 |
| `reference/` | 고정 게시본·조사 사본·구버전 배포본에만 있던 이미지 |
| `ppt_layouts/`, `output/`, `.codex-build/`, `.wm_tmp/`, `_to_delete/` | 장표·참고 자료·제작 및 전송 이력. 수집 원본과 혼재하므로 보존함 |
| `docs/`, `.agents/` | 조사·검증 기록과 작업 지침 |

루트 `dist/`와 `build/build.mjs`는 제거했다. 현재 웹 빌드는 `app/web/dist/`이며 `app/start.sh`가 생성한다. 과거 아티팩트의 설명서는 [보관 문서](docs/reference/legacy-artifact-readme.md), 정리 범위와 검증 결과는 [정리 기록](docs/migration/07-code-cleanup.md)에 있다.
