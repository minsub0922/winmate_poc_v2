# 공간 용도별 템플릿 개선 · 2026-10-21

표준 공간을 9.45 × 8.1m에서 8.98 × 7.7m로 약 5% 더 줄였다. 기본 전체 맵은 6개 공간을 유지하며 compact·standard·spacious와 개별 공간에도 같은 축소 비율을 적용한다. 제품·가구·사람 자산의 기존 실측/설계 치수는 확대하지 않는다.

업종의 원본 공간 키에 명시적인 용도 프로필을 연결했다. 본사·운영실·관제실에는 서랍·가림판·케이블 홀을 갖춘 업무 데스크, 사무용 의자, 각 책상별 ViewFinity S7 S70H 27형 모니터와 QM65C 공용 화면을 배치한다. 일반 업무 공간에는 공용 대형 화면을 추가하지 않는다. 제품 ID는 기존 삼성 DB의 `sg_g000184177`, `qm65c`를 사용한다.

학교에는 학생용 책상, 자리별 Galaxy Tab S10 FE Wi-Fi(`sg_g000183689`), 공기청정기, 수업용 전자칠판 하나를 배치한다. 강의실과 미래교실은 각각 앞을 보는 수업과 마주보는 모둠 배치로 구분한다. 전산실은 자리별 모니터를 쓰고, 도서관은 칸막이 열람석·서가를 쓴다. 진료실은 의사·환자가 마주보는 상담 책상과 별도 진찰 침상, 생산·검사 공간은 작업 벤치를 사용한다.

수량은 실제로 들어간 책상·테이블에서 계산하고 각 제품을 해당 가구에 직접 연결한다. 책상 이동·회전, 스튜디오 입력으로 재생성, 저장·재열기에서도 제품 수량과 용도가 유지된다. 공간과 관계없는 실외기·칠러, 중복된 공용 화면을 제품 수를 늘리기 위해 추가하지 않는다. 원본 장표의 제품 참조는 보존하고, 새 용도별 구성에서 제외된 참조는 `cases.omittedSourceProducts`에 사유를 기록한다.

`compositionVersion: 2`, `equipmentPolicyVersion: 1`로 새 템플릿에 적용한다. 기존 저장 장면과 불변 라이브러리 버전은 유지한다. 새 가구 3종은 제조사 제품이 아닌 설계 자산이다. 이번 작업은 기존 삼성 DB에서 제품을 선택한 것으로, 제조사 CAD 또는 새 실측 검증을 의미하지 않는다.

검토 자료:

- [16개 업종 및 변경 전후 실제 3D 렌더](../app/tests/output/spatial-purpose/index.html)
- [공간별 제품·수량·배치 사유](../app/tests/output/spatial-purpose/coverage.json)
- [시작 지문](../app/tests/output/spatial-purpose/start.json), [렌더 검토 지문](../app/tests/output/spatial-purpose/audit.json)
- [최종 검증 결과](../app/tests/output/spatial-purpose/validation.json), [브라우저 검증](../app/tests/output/spatial-purpose/ui/ui-report.json)
- [적용 스킬](/Users/minseop/.codex/skills/winmate-improve-spatial-fidelity/SKILL.md)

검증 명령:

```sh
node app/tests/spatial-purpose.mjs
node app/tests/spatial-scenes.mjs
node app/tests/spatial-density.mjs
node app/tests/spatial-naturalness.mjs
node app/tests/spatial-studio-form.mjs
node app/tests/spatial-template-catalog.mjs
node app/tests/spatial-edit.mjs
node app/tests/spatial-selection.mjs
node app/tests/spatial-people-layout.mjs
node app/tests/spatial-furniture.mjs
node app/tests/spatial-details.mjs
app/.venv/bin/python -B -m unittest app.tests.test_spatial app.tests.test_spatial_edit
SPATIAL_DENSITY_OUTPUT=app/tests/output/spatial-purpose/ui SPATIAL_DENSITY_API_PORT=8841 SPATIAL_DENSITY_WEB_PORT=5341 node app/tests/spatial-density-ui.mjs
node app/scripts/review_spatial_purpose.mjs
npm --prefix app/web run build
```

최종 버전 `89960d42`: 683개 템플릿의 결정적 생성·배치·동선 검사, 16개 업종 입력 재생성, JS 11개 스위트, Python 21개 테스트가 통과했다. 격리 브라우저의 7개 검사에서 템플릿 이동·저장·재열기, 지연 로딩, 모바일, 과거 저장본 유지와 PNG·GLB 내보내기를 확인했다. GLB의 본사 운영 공간 28개 오브젝트 좌표와 자리별 모니터 8개도 장면 JSON과 일치한다. 실제 3D 검토 36장과 예시 미리보기 10개를 생성했고 웹 빌드가 통과했다. 실행 중인 앱의 공개 버전 마커도 같은 버전을 제공한다.
