# 추가 축소와 모든 공간의 사람 배치 · 2026-10-21

표준 공간은 8.98 × 7.7m에서 8.53 × 7.32m로 가로·세로 약 5% 더 줄였다. 제품·가구의 물리 치수와 사람의 신체 비율은 유지하며, 줄어든 실내에 맞게 좌석·제품·사람 위치와 카메라를 다시 계산한다. Compact·standard·spacious는 실내만 배율을 적용하고 1.8m 복도와 벽 사이 간격은 유지한다. 같은 공간은 전체 맵과 개별 맵에서 같은 실측 크기를 사용한다.

모둠 교실의 마지막 좌석은 문 앞 여유 공간을 남기도록 이동한다. 스튜디오 입력 재생성과 자연 배치 복구도 축소된 업무실에 맞는 열 수와 중앙 정렬을 사용한다. 2D·3D·썸네일·PNG·GLB·편집 가능한 PPT는 같은 장면과 사람 부품을 사용한다.

최신 템플릿은 예외 없이 각 공간에 용도별 사람을 배치한다. 기계실은 공조·설비 기사, 외벽·미디어폴은 전기·미디어 기사, 세탁실은 세탁 직원, 겉옷 케어는 의류 보관 직원, 저온 보관은 누빔 작업복의 보관 담당자를 사용한다. 셀프 체크인은 이용객, 현관은 입주민, 등하교 공간은 학생, 공원은 정원 관리사를 사용한다. 합쳐진 기계실·세탁실, 병실·간호스테이션, 주방·냉장 보관에는 추가 기능에 맞는 직종도 배치한다.

사람·가구·도구 복합 오브젝트 20종을 추가해 총 164종, 직종은 42종이다. 신규 직종은 안전모·보호 안경·반사띠·공구 벨트, 앞치마·작업 모자·리넨, 옷걸이·외투, 누빔 재킷·장갑 등으로 구분한다. 템플릿 자동 배치는 기존 가구에 사람을 연결하므로 같은 책상이나 의자를 추가하지 않는다. 사람이 설 수 없으면 작은 인형으로 축소하거나 조용히 생략하지 않고 배치 오류로 검출한다.

공간 구성 버전은 3, 사람 배치 정책은 2다. 저장된 사람 참조 형식은 버전 1을 유지한다. 이전 라이브러리는 당시의 크기·사람 배치·형상을 보존한다. 사람과 일반 가구는 제조사 CAD가 아닌 설계 자산이다.

검토 자료:

- [16개 업종과 변경 전후 3D 검토](../app/tests/output/spatial-all-rooms/index.html)
- [전체 공간의 사람·크기·직종 검증](../app/tests/output/spatial-all-rooms/coverage.json)
- [추가 직종 실제 오브젝트 렌더](../app/tests/output/spatial-all-rooms/new-roles.png)
- [최종 검증 결과](../app/tests/output/spatial-all-rooms/validation.json)
- [적용 스킬](/Users/minseop/.codex/skills/winmate-improve-spatial-fidelity/SKILL.md)

주요 검증 명령:

```sh
node app/tests/spatial-all-rooms.mjs
node app/tests/spatial-people-layout.mjs
node app/tests/spatial-people.mjs
node app/tests/spatial-naturalness.mjs
node app/scripts/review_spatial_all_rooms.mjs
app/.venv/bin/python -B -m unittest app.tests.test_spatial app.tests.test_spatial_edit
SPATIAL_DENSITY_OUTPUT=app/tests/output/spatial-all-rooms/ui SPATIAL_DENSITY_API_PORT=8842 SPATIAL_DENSITY_WEB_PORT=5342 SPATIAL_DENSITY_EXPORT_ROOM=fb-5 node app/tests/spatial-density-ui.mjs
npm --prefix app/web run build
```

최종 버전 `3d1fa809`: 683개 템플릿에 포함된 1,158개 공간 모두에 총 3,696명의 사람이 배치되며 빈 공간은 0개다. JS 13개 스위트, Python 21개 테스트, 격리 브라우저 7개 검사가 통과했다. 저장·재열기·모바일·이전 버전 유지와 PNG·GLB를 확인했으며, 새 의류 보관 직원이 실제 GLB 메시와 편집 가능한 PPT 도형으로 내보내진다. 실제 3D 검토 36장, 추가 직종 썸네일과 관리자 예시 10개를 갱신했다. 웹 빌드가 통과했고 실행 중인 앱의 공개 버전 마커도 같은 버전이다.
