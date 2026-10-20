# 사용자님의 목소리

사이드바 프로필 바로 위의 버튼은 오른쪽 입력 팝업을 연다. 기본 Enter는 줄바꿈이며 Send 또는 Ctrl/Command+Enter로 전송한다. 공백 의견은 전송할 수 없고, 최대 5,000자다. 바깥 클릭과 Escape로 닫아도 입력은 유지된다. 편집 모달이 열린 동안에도 같은 위치의 버튼과 팝업을 사용할 수 있으며 의견 창의 Escape는 작업 모달을 닫지 않는다. 작은 화면에서는 팝업을 화면 안으로 조정한다.

전송할 때 로그인 세션으로 작성자를 결정한다. 클라이언트가 보낸 owner/role은 사용하지 않는다. 전송이 실패하면 텍스트를 유지하며, 내용이 바뀌지 않은 재시도는 같은 전송 ID와 동일한 패킷으로 중복 접수를 방지한다.

작업 상태는 의견 창을 연 시점과 첫 Send 시점의 두 스냅샷이다. 전송 없이 창만 열면 서버에 저장하지 않는다.

- 현재 route, 작업 ID, 진행 단계, 관련 서버 작업 ID·status·purpose·진행률, 요청 trace 정보.
- 브라우저와 내부 스크롤 영역별 top/left, 영역 크기와 전체 콘텐츠 크기, 화면 크기·배율.
- 열린 팝업, 선택된 컨트롤·요소, 입력 위치, 저장 전 입력값, 검색·탭 등 화면 설정.
- 현재 제안서·검토·시뮬레이션 state. 제안서의 선택 장·버블·공유 편집 상태.
- 레이아웃 편집의 f·dirty·선택 요소·수정 중 HTML·undo/redo와 Agent 입력·승인 대기 액션·실행 단계.
- 공간 편집의 문서·입력 폼·scene·선택 오브젝트·카메라·2D/3D·저장 및 레이아웃 추출 상태.

비밀번호 입력칸, 쿠키, 인증 헤더, API 키와 공유 토큰은 수집 대상에서 제외하거나 가린다. query string, 브라우저의 다른 탭과 히스토리, 파일 원문 바이트, 화면 스크린샷은 수집하지 않는다. 큰 문서·이미지 데이터는 크기를 제한하고 `capture_limits`에 생략 여부와 경로를 남긴다. 작업 ID·스크롤·작업 상태 요약을 우선한다. 스냅샷은 사용자가 전송한 진단 정보이며 서버가 해당 화면 상태를 검증했다는 의미는 아니다.

서버는 My 템플릿과 같은 계정 DB의 `customer_voice` 테이블에 의견과 상태 JSON을 한 행으로 저장한다. 관리자 결합 서버의 기본 경로는 `admin/runtime/operations.sqlite`다. 기존 `WINMATE_ADMIN_DATA`/`WINMATE_TEMPLATE_DB` 설정을 따른다.

- `POST /api/customer-voice`: 로그인 사용자 의견 저장.
- `GET /api/admin/customer-voice`: 관리자 검색·필터·페이지 목록·새 의견 건수.
- `GET /api/admin/customer-voice/{id}`: 관리자만 의견과 전체 작업 상태 조회.
- `PATCH /api/admin/customer-voice/{id}`: 관리자 처리 상태 변경(`new`, `reviewing`, `closed`).

관리자 페이지의 **사용자님의 목소리**(`/admin/voice`)에서 확인한다. 새 의견 건수와 목록은 3초마다, 화면에 돌아오면 즉시 갱신한다. 상세 팝업은 의견, 사용자, 작업 ID/종류/단계, 스크롤 표, 입력값·선택, 작업 state, 창을 열었을 때의 상태, 전체 JSON을 제공한다. 의견은 HTML로 실행하지 않고 원문 텍스트로 표시한다.

검증은 임시 계정·DB의 실제 앱과 관리자 UI를 사용한다. 실사용 관리자 받은함에 테스트 의견을 넣지 않는다.

```sh
app/.venv/bin/python -B -m pytest app/tests/test_customer_voice.py app/tests/test_auth.py -q
npm --prefix app/web run build
node admin/build.mjs
node app/tests/customer-voice-ui.mjs
```
