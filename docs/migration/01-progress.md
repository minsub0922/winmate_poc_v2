# 1단계 진행 기록

상태: **1단계 완료**. 최종 결과는 [01-reproduction.md](01-reproduction.md)를 참조한다. 아래는 작업 도중의 경과 기록이다. 2026-10-19 사용자의 ‘시작해’를 받아 진행했다. 아래는 미해결 질문에 대해 사전에 알리고 적용한 기본안이다.

- 0단계 `reference/live`와 초기 `reference/source-build`를 고정 기준으로 사용한다.
- DB 교체는 라이브에 실제 존재하는 탐색기 모달을 옮긴다. 가로 카드 패치와 조사 말미의 imglib 추가 기능은 섞지 않는다.
- 원본 기준 파일은 그대로 두고 앱의 media 메타데이터를 정상 인덱스로 교정한다.
- 저장소 이름·형식은 그대로 유지하고 별도 migration 페이지·구 origin exporter로 데이터 이전 경로를 제공한다. 실제 개인 데이터는 추출하지 않았다.

현재 구현:

- `app/web` Vite + React, 7개 라우트와 기존 컴포넌트, 478개 스타일 primitive를 포함한 공통 토큰.
- `app/api` FastAPI, 원본 DB를 읽기 전용 snapshot한 SQLite 및 1,068개 UI projection. `/api/bootstrap` 제품 객체가 고정 JSON과 같은 값을 반환함을 확인.
- sample/downloads/clipboard와 저장소·HTTP 전송의 어댑터, 더미 AI 실패 시 기존 규칙 대체. JSON/SSE 수신 경계를 구분.
- 0단계 번들 전용 사이드바 및 검토 점수 기준 팝업을 소스에 직접 흡수. 빌드 patch script 없음.
- 폰트 130개와 라이선스를 로컬 제공. 게시 이미지·PDF 라이브러리는 불변 reference의 bytes를 사용.
- 렌더/근거/PPTX export/import/geom/chart/presets 7개 핵심 모듈의 함수 본문은 import·fetch 경계 외 원본과 동일함을 체크섬 비교로 확인.
- 브라우저 저장소 JSON/Blob 백업과 복원, 별도 local migration UI 및 구 artifact downloads 어댑터.

검증 진행:

- 1500px light/dark의 성공한 화면 비교는 최대 차이 약 0.0042%이며 대부분 픽셀 차이 0. 원본의 일부 media URL 콘솔 오류는 분리 기록한다.
- 900/390px 추가 매트릭스가 실행 중이다. 테스트의 중복 grid locator를 수정한 picker 화면은 별도로 다시 촬영한다.
- 새 제안서 → @/링크/제작자 의견 태그 → 더미 Storyboard → 레이아웃 추가·채우기 → 제품 교체 → 편집 가능한 PPTX 다운로드 → 실제 파일 검토 → My 복원·본문 편집·저장·reload → Blob 포함 백업 → 다른 origin 복원까지 모두 통과했다. 브라우저 console error는 0이다.
- 기존 browser 스크립트 35개를 고정 기준과 앱에서 나란히 실행하는 작업을 시작했다. 구 버전·후기 버전 assertions가 기준에서도 실패하는 경우 로그로 구분한다. 실행기 자체의 포트 처리 오류는 해결 후 다시 실행했다.

상세 중간 결과: `app/tests/output/visual/*.json`, `e2e/report.json`, `legacy-complete.json`. `app/tests/output/`는 로컬 재현 결과이며 Git에 포함하지 않는다. 최종 요약·주요 증거는 단계 완료 보고서로 별도 보관한다.

테스트 브라우저: 설치 Chrome의 일부 context 종료가 지연되어 matching Playwright Chromium 141.0.7390.37 / build 1194로 전환했다. API는 127.0.0.1:8788에서 실행 중이다. 기존 테스트의 포트·mock 전송을 새 API 경계에 연결했으며 원본 assertions를 바꾸지 않았다.
