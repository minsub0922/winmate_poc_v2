# Ubuntu 재현 기준

재현 브랜치: `codex/ubuntu-reproduction-20261021`.

`BOOTSTRAP.md`의 Git 확보·Ubuntu 준비·반입·실행·검증 절차를 따른다. 원격 `main`은 현재 사용자 앱과 공통 이력이 없는 별도 라이브러리 코드이므로 재현 브랜치를 명시한다. 실제로 checkout한 커밋을 인수 기록에 남긴다.

`environment-20261021/`에는 Mac에서 확인한 Node/npm/Python 버전과 설치된 Python 배포판의 버전 목록을 보관한다. 이 목록은 Ubuntu 준비 머신의 버전 제약 입력이며 Ubuntu용 wheel이나 실행 파일이 아니다. OS·CPU·glibc가 같은 Ubuntu에서 Node/Python 런타임·OS 패키지·npm 캐시·wheel·Chromium을 준비한다.

사용자 앱 소스·테스트·제품 SQLite·검토된 상세·장표 입력·공간 버전·이미지·폰트·PoC 모듈과 원천 자료를 함께 버전 관리한다. `admin/`, 키·인증 파일, 개인 runtime·브라우저 데이터, 의존성 설치물과 생성된 배포본은 제외한다. 수집기의 대형 검토 캐시와 로컬 전송 이력도 앱 재현 입력에 포함하지 않는다.

사내 LLM·검색 설정은 사용자가 별도로 제공하는 폴더를 사용한다. `BOOTSTRAP.md` 앞의 작업 프롬프트 입력란은 비워 둔다.
