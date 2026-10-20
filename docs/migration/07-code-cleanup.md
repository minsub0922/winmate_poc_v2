# 구버전 코드 정리 — 2026-10-20

사용자 요청에 따라 `http://127.0.0.1:8788`에서 실행하는 앱을 기준으로 불필요한 구버전 코드를 삭제하고 수집·참고 자료를 보존했다.

## 실행 경로 확인

정리 시작 시 포트 8788의 프로세스는 PID 15934, 작업 폴더는 이 저장소였고 실행 명령은 다음과 같았다.

```sh
app/.venv/bin/python -B -m uvicorn app.api.main:app --host 127.0.0.1 --port 8788 --no-access-log
```

서버는 `app/web/dist/`의 웹 빌드, `app/data/`의 입력과 runtime, `poc/test/`의 공용 AI 모듈을 사용한다. `app/data/static`은 `../../reference/live` 심볼릭 링크다. 따라서 `poc/`나 `reference/live/`를 과거 버전으로 간주해 삭제하면 현재 앱이 깨진다.

## 삭제한 항목

- 루트 `src/main.jsx`, `src/ui/` 전체, 구버전 화면에서만 사용한 저장·AI 모듈과 스타일. 자료 추출·평가용으로 남긴 모듈에서 삭제 파일을 import하지 않는지 전후 확인했다.
- 루트 `build/build.mjs`와 임시 사본 2개, `src/data.js`의 임시 사본. 현재 앱의 Vite 빌드는 `app/web/`에서 수행한다.
- 루트 구버전 `dist/`. 이미지·라이브러리는 원천/참고 사본과 경로·SHA-256을 비교했으며 바이트가 다른 이미지 168개는 `reference/legacy-dist-assets/`에 보존했다.
- `app/tests/legacy-work/`의 생성된 비교 작업 폴더. `legacy-runner.mjs --prepare`로 재생성할 수 있으며 테스트 스크립트·fixtures·실제 검사 결과는 보존했다.

삭제 목록은 1,093개 파일·링크, 497,934,253 bytes다. 고유 이미지 23,620,106 bytes를 보존했으므로 파일 바이트 기준 약 474 MB를 줄였다. 문서·목록의 추가 용량과 파일시스템 할당 단위는 이 계산에 포함하지 않는다.

기존 루트 README 두 판은 `docs/reference/legacy-artifact-readme*.md`로 보관했다. 새 루트 README와 npm 실행 명령은 현재 앱을 안내한다. 루트 npm 의존성은 기존 자료 제작·평가 도구에서 사용하므로 보존했다.

## 보존한 항목

`proddb/`의 DB·수집 스크립트·원본·카탈로그, `poc/`의 AI 모듈·평가 도구·데이터·결과, `data/`·`img/`의 원천, `reference/`의 고정 게시본·조사 사본, `build/`의 자료 수집·이미지 가공·레이아웃 제작·검증 도구, `src/`의 자료 추출/평가용 공용 모듈·JSON·출처 대장을 보존했다.

`ppt_layouts/`, `output/`, `.codex-build/`, `.wm_tmp/`, `_to_delete/`, 원본 ZIP과 `.agents/`도 보존했다. 임시·삭제 대기처럼 보이는 이름만으로 판단하지 않았다. 특히 전송 폴더에는 수집 DB·이미지·자료 제작 이력이 혼재한다.

정리 전 16,623개 보존 파일의 해시를 기록했다. 수집·원천·참고 자료와 남긴 공용 모듈에서 누락·변경은 없었고, 고유 이미지 168개도 복사 전후 해시가 일치했다. 작업 도중 별도 작업에 의해 현재 앱의 소스와 `app/web/dist/`가 변경되어, 이들은 동시 변경으로 기록하고 되돌리지 않았다. 이번 정리 스크립트는 현재 앱 소스·배포 빌드·계정·DB에 쓰지 않았다.

## 검증

- `make test`: pytest 125건·subtest 54건, 전송 12건, 샘플 히스토리 14건, 제품 12건·작업 14건 모두 통과.
- 현재 Vite 빌드와 migration exporter 빌드 통과. 실행 중 배포본을 덮어쓰지 않도록 결과를 `/tmp/winmate-cleanup-20261020/web-dist/`에 생성했다.
- `app/scripts/preflight.py --deep --require-auth`: 통과. DB quick_check·원본 DB 해시·필수 PoC·인증·고정 파일 검사 정상. 동시 작업에서 바뀐 `app/web/src/api/bootstrap.js`에 대해 Agent KB의 입력 지문 갱신 경고 1건이 발생했다. 이는 삭제 파일 참조 오류가 아니며, 정리 범위 밖의 KB는 재생성하지 않았다.
- `docs/migration/tools/verify-reference.py --allow-app`: 고정 파일 511개, ZIP·번들 지문·분류된 변경 6개·media 차이 257개·이미지 비교 408개 검증 통과.
- 남긴 JS 모듈에서 삭제 파일로 향하는 상대 import 없음.
- 포트 8788의 기존 프로세스 유지, health·로그인·인증 상태 경로 정상 응답.

브라우저 검사는 별도 로컬 API와 격리된 저장소에서 수행했다. 모델 호출은 차단했다. 첫 시도는 동시 기능 작업에서 CSS import가 추가되고 파일이 아직 생성되지 않은 시점과 겹쳐 중단했다. 해당 파일이 생긴 뒤 다시 검사했으며, 최종 결과는 catalog 10/10, PPTX 내보내기·복원 10/10, 잘못된 PPTX 입력 10/10, 저장소·백업 복원 13/13로 총 43/43 통과했다. 검사에 사용한 별도 API는 종료했다.

## 복구와 증거

전체 삭제 경로·파일별 SHA-256·심볼릭 링크 대상·고유 이미지의 전후 경로·보존 검증 결과는 `evidence/cleanup-20261020.json`에 있다.

삭제 전 복구 사본은 저장소 밖 `/tmp/winmate-cleanup-20261020/removed-files.tar.gz`에 만들었다. 영구 보관소가 아닌 임시 경로다. 복원이 필요하면 먼저 별도 폴더에 풀어 필요한 파일만 선택한다. 문서 변경 전 사본도 포함하므로 현재 저장소에 통째로 덮어쓰지 않는다.
