// 「전체 파트」 팝업 — 고객/공간 시나리오의 시트(공간별 시나리오: 공간 3 · 2곳 · 활용 맵: 공간 2–10곳) 미리보기 자료 (사용자 지시 2026-11-17 · 2차).
//   시트는 레이아웃 라이브러리에 있는 장(L_TOC_SCN_*, build/toc/layouts.py)이라 서버 미리보기를 그대로 쓴다. RoutedSheets(space-route.jsx)의 load 로 넘긴다.
import { previewOf } from './layouts.jsx';
import { scnSetId, scnMapId, SCN } from '../../../app/web/src/domain/templates/scenario_plan.js';

const SHEETS = [
  ...[3, 2].map(m => ({ f: scnSetId(m), per: m, name: `공간별 시나리오 · 공간 ${m}곳` })),
  ...Array.from({ length: SCN.mapMax - SCN.mapMin + 1 }, (_, i) => SCN.mapMin + i).map(n => ({ f: scnMapId(n), per: n, name: `활용 맵 · 공간 ${n}곳` })),
];
let promise = null;
/** f → { f, code, name, when, per, html } — 서버가 못 주면 html '' (미리보기 없음) */
export function loadScenarioSheets() {
  if (!promise) {
    promise = Promise.all(SHEETS.map(x => previewOf(x.f).then(html => html, () => '').then(html => [x.f, { ...x, code: x.f.replace(/^L_/, '').replace(/_/g, '-'), when: '', html }])))
      .then(Object.fromEntries);
    promise.catch(() => { promise = null; });
  }
  return promise;
}
