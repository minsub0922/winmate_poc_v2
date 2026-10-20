# 수집·제작·비교 검증 도구

현재 웹앱의 빌드는 루트에서 `npm --prefix app/web run build`로 실행한다. 구버전 단일 HTML 번들러 `build.mjs`와 임시 사본은 제거했다.

이 폴더는 일괄 삭제하지 않는다. `media/`의 수집·이미지 처리, `photo/`·`sol/`·`v25/`의 장표 제작 근거, `bs/`·`hist/`·`sb/`의 시나리오·출처·검수 이력, `fixtures/`의 실제 테스트 입력, `my/`의 도형 명세·변환 검증과 나머지 제작 도구를 보존했다.

일부 과거 일회성 패치·화면 검사 도구는 구버전 `dist/`, 제거한 UI 또는 원래 제작 환경의 절대 경로를 전제로 한다. 과거 재현이 필요하면 `reference/source-build/` 또는 `reference/source-build-latest/`를 별도 작업 폴더로 복사하고 필요한 보존 도구를 그 사본에 복사해 실행한다. 현재 앱에 적용할 변경은 `app/` 경로와 현재 검증 계약에 맞춰 이식한다. 수집·데이터 갱신 절차는 각 하위 README와 `proddb/README.md`를 확인한다.
