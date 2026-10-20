# Ubuntu 재현 기준

재현 기준 브랜치: `main`.

`BOOTSTRAP.md`의 Git 확보·Ubuntu 준비·반입·실행·검증 절차를 따른다. 현재 사용자 앱 버전을 유지하면서 재현 브랜치의 코드·자료를 `main`에 통합했다. 실제로 checkout한 커밋을 인수 기록에 남긴다. `codex/ubuntu-reproduction-20261021`은 초기 재현 스냅샷의 이력으로 남아 있다.

`environment-20261021/`에는 Mac에서 확인한 Node/npm/Python 버전과 설치된 Python 배포판의 버전 목록을 보관한다. 이 목록은 Ubuntu 준비 머신의 버전 제약 입력이며 Ubuntu용 wheel이나 실행 파일이 아니다. Ubuntu에 Node/Python과 프로젝트 의존성을 새로 설치한다.

사용자 앱 소스·테스트·제품 SQLite·검토된 상세·장표 입력·공간 버전·이미지·폰트·PoC 모듈과 원천 자료를 함께 버전 관리한다. `admin/`, 키·인증 파일, 개인 runtime·브라우저 데이터, 의존성 설치물과 생성된 배포본은 제외한다. 수집기의 대형 검토 캐시와 로컬 전송 이력도 앱 재현 입력에 포함하지 않는다.

`BOOTSTRAP.md` 앞의 작업 프롬프트에는 LLM API 호출 자료의 절대경로 한 곳만 입력한다. 자료를 보고 `InternalAdapter`를 실제 호출 규격에 맞춘다. 기본값은 `WINMATE_LLM_PROVIDER=internal`이며 `gemini`로 바꾸면 Gemini를 사용한다.
