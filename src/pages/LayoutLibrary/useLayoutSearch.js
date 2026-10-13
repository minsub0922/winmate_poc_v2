import { useMemo } from 'react';
import { LAYOUTS } from '../../lib/catalog.js';
import { searchLayouts } from '../../lib/search.js';

/**
 * 검색어 → 결과 목록.
 *   q 가 비면 hits = null (전체 446장을 구분별로 보여 준다).
 *   결과는 1위 점수의 30% 이상만 남기고, 코드 · id · 이름이 정확히 같은 레이아웃은 맨 앞에 둔다.
 * @returns {{ base: object[], hitOf: Record<string, {why: string[], snip: string}> }}
 */
export function useLayoutSearch(q) {
  const hits = useMemo(() => {
    if (!q) return null;
    const all = searchLayouts(q, {}, { limit: LAYOUTS.length });
    const top = all.length ? all[0].score : 0;
    const res = all.filter((r) => r.score >= top * 0.3);
    const lq = q.toLowerCase();
    const exact = LAYOUTS.filter((l) => l.code.toLowerCase() === lq || l.f.toLowerCase() === lq || l.name.toLowerCase() === lq);
    const m = new Map();
    for (const l of exact) m.set(l.f, { l, why: ['코드 · 이름 일치'], snip: '' });
    for (const r of res) if (!m.has(r.l.f)) m.set(r.l.f, r);
    return [...m.values()];
  }, [q]);
  const base = useMemo(() => (hits ? hits.map((r) => r.l) : LAYOUTS), [hits]);
  const hitOf = useMemo(() => (hits ? Object.fromEntries(hits.map((r) => [r.l.f, r])) : {}), [hits]);
  return { base, hitOf };
}
