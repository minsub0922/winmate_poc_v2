// 고객/공간 시나리오 — 공간마다 쓰는 솔루션 · 서비스를 정한다 (사용자 지시 2026-11-17: "솔루션 및 서비스는 여러 공간에서 활용이 되어야하므로
//   여러 케이스 고려해서 만들어야함. 또는 이를 동적으로 결정된 조합을 ui 에 적용할 수 있어야함").
//   공간 구성(p.spacePlan — 공간마다 놓인 제품)과 고른 DSS 로 정하고, 레이아웃 자동 구성에 공간 구성과 함께 보낸다(space_plan.spaces[].uses).
//   서버(composer auto.py)는 이 조합으로 공간마다 한 장 · 활용 맵을 채운다(장 고르기 규칙은 domain/templates/scenario_plan.js 와 같음).
//   솔루션: 그 공간의 업종 자료(vertical_space_product.json 공간의 배치 가능 분류)가 그 솔루션 분류를 담거나, 솔루션과 함께 쓰는 제품(with)이 그 공간에 놓였으면.
//   서비스: 케어 · 유지관리 → 공조 · 갤럭시 모바일이 놓인 공간(삼성케어플러스 SAC · 비즈니스), 콘텐츠 제작 → 디스플레이가 놓인 공간.
//   구독: 제품이 놓인 공간(구독은 놓인 제품 단위). 어느 공간에도 맞지 않으면 제품이 놓인 모든 공간 — 고른 것은 어디엔가 보인다.
import { P, S, SUB } from './catalog.js';
import { dssOf } from './dss.js';
import { solutionCats } from '../domain/proposals/space-plan.js';

const CARE_ON = /시스템에어컨|공조|히트펌프|갤럭시 (스마트폰|탭)/;
const DISPLAY = /사이니지|LED|비디오월|키오스크|전자칠판|이페이퍼|TV|모니터/;
const text = (q) => (P[q] ? `${P[q].cat || ''} ${P[q].name || ''}` : '');

/**
 * 공간 id → 그 공간에서 쓰는 솔루션 · 서비스 [{ id, name, kind: '솔루션' | '서비스' }].
 * index: vertical_space_product.json 색인(services/space-plan.js loadSpaceData) — 없으면 함께 쓰는 제품으로만 정한다.
 */
export function spaceUses(p, index = null) {
  const spaces = (p && p.spacePlan && p.spacePlan.spaces) || [];
  const d = dssOf(p);
  const linked = new Set(d.products);
  const prodsOf = (s) => (s.products || []).filter((id) => linked.has(id));
  const catsOf = (s) => new Set(((index && index.spaces && index.spaces.get(s.id)) || {}).products || []);
  const out = new Map(spaces.map((s) => [s.id, []]));
  const placed = spaces.filter((s) => prodsOf(s).length);
  const fallback = (placed.length ? placed : spaces).map((s) => s.id);
  const add = (ids, u) => { for (const id of ids.length ? ids : fallback) out.get(id).push(u); };
  for (const id of d.solutions) {
    const sc = solutionCats(S[id]); const w = new Set(S[id].with || []);
    add(spaces.filter((s) => { const c = catsOf(s); return sc.some((x) => c.has(x)) || prodsOf(s).some((q) => w.has(q)); }).map((s) => s.id), { id, name: S[id].name, kind: '솔루션' });
  }
  for (const id of d.services) {
    const re = /콘텐츠/.test(S[id].name) ? DISPLAY : CARE_ON;
    add(spaces.filter((s) => prodsOf(s).some((q) => re.test(text(q)))).map((s) => s.id), { id, name: S[id].name, kind: '서비스' });
  }
  for (const id of d.subscriptions) add(fallback, { id, name: SUB[id].short || SUB[id].name, kind: '서비스' });
  return out;
}
