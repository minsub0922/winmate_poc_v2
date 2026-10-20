# 자료 추출·평가용 공용 모듈

현재 앱 코드는 `app/web/src/`에 있다. 이 폴더의 구버전 화면(`ui/`), 실행 진입점(`main.jsx`), 화면 전용 저장·AI 모듈과 사용하지 않는 스타일은 제거했다.

남은 코드는 다음 도구가 사용하므로 보존했다.

- `poc/test/storyboard_agent/scripts/export_source.mjs`: 카탈로그·파트·시나리오·히스토리 평가 데이터 추출.
- `poc/test/proposal_score/tools/export_entry.jsx`, `criteria.py`: 실제 장표 렌더와 평가 기준 추출.
- `poc/test/sim_eval/scripts/engine_entry.mjs`: 과거 엔진의 재현·비교 평가.
- `poc/test/layout_agent/scripts/sync_source.py`: 과거 원천 데이터 snapshot 생성.
- `build/bs/`, `build/sb/`, `build/my/`, `build/thumbsheet.jsx`: 자료·레이아웃 제작과 비교 검증.
- `build/sheet-thumbs.mjs`: 썸네일 제작에 쓰는 `styles.css`, `cards.css`.

JSON, 출처 대장(`*_sources.md`, `seeds_cases.sources.md`)과 생성된 시나리오·레이아웃 데이터도 보존한다. 이 폴더를 현재 앱의 수정 대상으로 사용하지 않는다. 현재 Agent KB 갱신은 루트에서 `node app/scripts/export_agent_data.mjs`로 수행한다.
