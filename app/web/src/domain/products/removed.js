// 지운 제품(products_db.json removed — 판매 종료 확인 뒤 관리자가 삭제를 확정)을 저장된 제안서에서 정리한다.
// 연결된 제품(ctx.products)의 지운 id 는 대체 제품으로 바꾸고(대체가 없으면 뺀다), 무엇을 바꿨는지 proposal.removedProducts 에 남긴다 —
// 장의 글 · 사진에 남은 지운 제품은 고치지 않고 내보낼 때 확인받는다(deprecation.js deprecatedInDeck).
import { P, REMOVED } from '../../services/catalog.js';

/** 지운 제품 id → 지금 있는 대체 제품 id(대체가 또 지워졌으면 그 다음 대체), 없으면 null */
export function replacementId(id) {
  let r = REMOVED[id] && REMOVED[id].replacedBy;
  for (let i = 0; r && i < 8 && !P[r] && REMOVED[r]; i++) r = REMOVED[r].replacedBy;
  return r && P[r] && !P[r].deprecated ? r : null;
}

/** 제안서의 연결된 제품에서 지운 제품을 대체 제품으로 바꾼다. 바꾼 것이 있으면 true. */
export function migrateRemovedProducts(proposal) {
  const ids = proposal && proposal.ctx && proposal.ctx.products;
  if (!Array.isArray(ids) || !ids.some((id) => REMOVED[id] && !P[id])) return false;
  const out = [], swapped = [];
  for (const id of ids) {
    if (!REMOVED[id] || P[id]) { if (!out.includes(id)) out.push(id); continue; }
    const to = replacementId(id);
    swapped.push({ id, name: REMOVED[id].name, replacedBy: to, at: Date.now() });
    if (to && !out.includes(to)) out.push(to);
  }
  proposal.ctx.products = out;
  proposal.removedProducts = [...(proposal.removedProducts || []).filter((x) => !swapped.some((s) => s.id === x.id)), ...swapped];
  return true;
}
