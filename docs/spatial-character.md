# 공간 축소와 용도별 가구·소품 보강 · 2026-10-21

표준 공간을 8.53 × 7.32m에서 8 × 6.8m로 줄였다. 가로 약 6.2%, 세로 약 7.1%, 면적 약 12.9% 축소다. 기존 제품·가구·사람의 물리 크기는 유지하고, 배치와 카메라 구도를 다시 맞춘다. 기본 6개 공간과 모든 공간의 사람 배치는 유지한다.

17종의 비전동 가구·소품을 라이브러리에 추가하고 업종 템플릿에 직접 배치한다.

- 겉옷 케어·드레스룸: 열린 수납부에 외투·접은 옷이 보이는 장롱, 옷 세 벌이 걸린 행거, 세탁물 바구니.
- 주방: 도마·칼·채소, 식재료 바구니, 삼성 인덕션 위의 국물·채소·두부가 든 냄비. 냄비는 인덕션과 아일랜드의 이동·회전을 따라간다.
- 헬스장: 바벨·원판이 달린 파워 랙, 아령이 놓인 2단 덤벨 랙, 바벨 벤치프레스, 운동 매트와 수건.
- 재활치료실: 보행 평행봉과 가벼운 아령 정리대로 구분한다.
- 도서관·매장·물류: 책이 꽂힌 서가, 상품이 진열된 선반, 식재료 보관 선반, 상자 팔레트를 사용한다. 교실·업무 공간에는 책·문구도 배치한다.

옷·음식·운동 기구는 이름이나 2D 아이콘만 추가한 것이 아니라 실제 파트 형상이다. 삼성 제품을 대체하는 전자기기를 추가하지 않으며, 새 가구·소품은 제조사 CAD가 아닌 설계 자산이다. 기존 자산 ID·치수·형상과 저장된 라이브러리 버전은 보존한다.

축소된 compact 공간에서 접수대 뒤 의자 통로를 확보했다. 교실에는 업종과 관계없이 학생용 의자를 써서 책상·좌석 수와 간격이 유지된다. 서가의 책과 조리대의 음식도 사람·출입문·의자 뒤 동선을 막지 않도록 검사한다.

새 공간 구성은 버전 4를 쓴다. 새 PPT 바인딩은 `nativePlanVersion: 2`로 SVG와 같은 실제 파트 투영을 사용한다. 미터 단위 레시피에 자산 크기를 한 번 더 곱하던 문제, 회전 원통 파트 누락, 열린 랙을 덮던 사각 채움과 종이 색상도 수정했다. 저장된 이전 바인딩은 기존 투영을 유지한다.

검토 자료:

- [업종별 실제 3D와 변경 전후 비교](../app/tests/output/spatial-character/index.html)
- [신규 가구·소품 실제 썸네일](../app/tests/output/spatial-character/new-objects.png)
- [전체 템플릿의 가구·소품 검증](../app/tests/output/spatial-character/coverage.json)
- [최종 검증 결과](../app/tests/output/spatial-character/validation.json)
- [적용 스킬](/Users/minseop/.codex/skills/winmate-improve-spatial-fidelity/SKILL.md)

주요 검증:

```sh
node app/tests/spatial-character.mjs
SPATIAL_ALL_ROOMS_OUTPUT=spatial-character/occupancy node app/tests/spatial-all-rooms.mjs
node app/scripts/review_spatial_character.mjs
app/.venv/bin/python -B -m unittest app.tests.test_spatial app.tests.test_spatial_edit
SPATIAL_DENSITY_OUTPUT=app/tests/output/spatial-character/ui SPATIAL_DENSITY_API_PORT=8843 SPATIAL_DENSITY_WEB_PORT=5343 SPATIAL_DENSITY_EXPORT_ROOM=fb-3 node app/tests/spatial-density-ui.mjs
npm --prefix app/web run build
```

최종 버전 `733e40b9`: 683개 템플릿, 1,158개 공간의 필수 가구·소품·충돌·동선을 검사했다. 모든 공간에 사람을 유지하며 빈 공간은 0개다. JS 14개 스위트, Python 21개 테스트, 격리 브라우저 7개 검사가 통과했다. 실제 3D 검토 36장과 새 소품 썸네일·예시 10개를 생성했다. GLB의 주방 12개 오브젝트 좌표와 조리 냄비의 실제 메시 외곽이 장면의 미터 치수와 일치한다. PPT 장롱 바닥과 회전 바벨 파트의 실측 투영도 검사했다. 웹 빌드가 통과했고 실행 중인 앱의 공개 버전 마커도 동일하다.
