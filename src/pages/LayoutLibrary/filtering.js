// 필터 · 개수 · 섹션 나누기 — 화면 상태(f)와 레이아웃 목록만으로 계산하는 순수 함수들.
import { IND, S, DECK, DECKS } from '../../lib/catalog.js';
import { PARTS } from '../../lib/parts.js';
import { GROUP_OF, PART_GROUPS, PART_ORDER, IDX, gName } from './constants.js';

/**
 * 레이아웃 l 이 필터 f 를 통과하는가.
 * skip 에 필터 이름('tab' | 'part' | 'ind' | 'sol' | 'img' | 'req')을 주면 그 필터는 빼고 본다
 * — 각 필터 옵션 옆 개수는 "그 필터만 바꿨을 때" 몇 장인지라서.
 */
export function pass(l, f, skip) {
  if (skip !== 'tab' && f.tab !== 'all') { if (f.by === 'part' ? GROUP_OF[l.p] !== f.tab : l.c !== f.tab) return false; }
  if (skip !== 'part' && f.by === 'part' && f.part && l.p !== f.part) return false;
  if (skip !== 'ind' && f.ind) {
    if (f.ind === '_gen') { if (l.ind) return false; } else if (f.ind === '_ind') { if (!l.ind) return false; } else if (l.ind !== f.ind) return false;
  }
  if (skip !== 'sol' && f.sol) {
    if (f.sol === '_none') { if (l.sol) return false; } else if (l.sol !== f.sol && !(l.sols || []).includes(f.sol)) return false;
  }
  if (skip !== 'img' && f.img) {
    if (f.img === '0' && l.nI !== 0) return false;
    if (f.img === '1' && !(l.nI >= 1 && l.nI <= 3)) return false;
    if (f.img === '4' && l.nI < 4) return false;
  }
  if (skip !== 'req' && f.req && !(l.req || []).includes(f.req)) return false;
  return true;
}

export const countBy = (list, key) => { const m = {}; for (const l of list) { const k = key(l); if (k != null) m[k] = (m[k] || 0) + 1; } return m; };

/** 탭 · 하위 칩 · 필터 옵션 옆에 붙는 개수 */
export function facetCounts(base, f) {
  const tabPool = base.filter((l) => pass(l, f, 'tab'));
  const tabCounts = countBy(tabPool, (l) => (f.by === 'part' ? GROUP_OF[l.p] : l.c));
  const partCounts = countBy(base.filter((l) => pass(l, f, 'part')), (l) => l.p);
  const indCounts = countBy(base.filter((l) => pass(l, f, 'ind')), (l) => l.ind || '_gen');
  const solCounts = {};
  for (const l of base.filter((x) => pass(x, f, 'sol'))) {
    new Set([l.sol, ...(l.sols || [])].filter(Boolean)).forEach((id) => { solCounts[id] = (solCounts[id] || 0) + 1; });
    if (!l.sol) solCounts._none = (solCounts._none || 0) + 1;
  }
  const imgPool = base.filter((l) => pass(l, f, 'img'));
  const imgCounts = { '': imgPool.length, 0: imgPool.filter((l) => l.nI === 0).length, 1: imgPool.filter((l) => l.nI >= 1 && l.nI <= 3).length, 4: imgPool.filter((l) => l.nI >= 4).length };
  const reqCounts = {};
  for (const l of base.filter((x) => pass(x, f, 'req'))) for (const r of l.req || []) reqCounts[r] = (reqCounts[r] || 0) + 1;
  const nInd = Object.entries(indCounts).filter(([k]) => k !== '_gen').reduce((a, [, v]) => a + v, 0);
  return { tabCounts, tabTotal: tabPool.length, partCounts, indCounts, solCounts, imgCounts, reqCounts, nInd };
}

/**
 * 보이는 목록을 섹션으로 나눈다.
 *   검색 중      → 섹션 하나('_hits', 관련도순)
 *   파트 유형별  → 파트 유형마다 한 섹션 (PART_ORDER 순서)
 *   원본 장표별  → 장표 + 묶음마다 한 섹션 (DECKS 순서, 그 안은 카탈로그 순서)
 */
export function buildSections(list, f, q) {
  if (q) return [{ key: '_hits', items: list }];
  if (f.by === 'part') {
    const m = {}; for (const l of list) (m[l.p] = m[l.p] || []).push(l);
    return PART_ORDER.filter((p) => m[p]).map((p) => ({ key: p, part: p, items: m[p] }));
  }
  const m = new Map();
  for (const l of [...list].sort((a, b) => IDX[a.f] - IDX[b.f])) { const k = l.c + '|' + gName(l); if (!m.has(k)) m.set(k, []); m.get(k).push(l); }
  const order = DECKS.map((d) => d.k);
  return [...m.entries()].map(([k, items]) => ({ key: k, deck: items[0].c, title: gName(items[0]), sub: String(items[0].g || '').split(' — ').slice(1).join(' — '), items }))
    .sort((a, b) => order.indexOf(a.deck) - order.indexOf(b.deck) || IDX[a.items[0].f] - IDX[b.items[0].f]);
}

/** 지금 보고 있는 범위를 한 줄로 — 요약 줄 · 내보내기 파일 이름에 쓴다. */
export function scopeName(f, q) {
  const groupLabel = f.tab === 'all' ? '' : f.by === 'part' ? (PART_GROUPS.find((g) => g.k === f.tab) || {}).label : (DECK[f.tab] || {}).label;
  return [
    q && '“' + q + '”',
    groupLabel,
    f.part && PARTS[f.part] && PARTS[f.part].label,
    f.ind && (f.ind === '_gen' ? '범용' : f.ind === '_ind' ? '업종 맞춤' : IND[f.ind] && IND[f.ind].name),
    f.sol && (f.sol === '_none' ? '솔루션 범용' : S[f.sol] && S[f.sol].name),
  ].filter(Boolean).join(' · ');
}

/** 적용된 필터 개수(초기화 버튼 표시용) */
export const activeFilterCount = (f) => ['ind', 'sol', 'img', 'req'].filter((k) => f[k]).length + (f.part ? 1 : 0) + (f.tab !== 'all' ? 1 : 0);
