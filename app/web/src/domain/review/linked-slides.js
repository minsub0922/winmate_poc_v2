import { deckOrder, L } from '../../services/catalog.js';

// Only explicit links: a similar customer/title is not evidence that decks are the same.
export function reviewProposalId(review) {
  return review.settings?.previewProposalId || review.settings?.linkedId || review.proposalId || null;
}

export function proposalReviewUnits(proposal) {
  const normalized = { ...proposal, parts: (proposal.parts || []).map(p => ({ ...p, layouts: p.layouts || [] })) };
  return deckOrder(normalized).map(({ x, s }, i) => ({
    n: i + 1, title: L[x.f]?.name || s.name || '제목 없음', part: s.type,
    hidden: !!x.hidden, layout: { f: x.f, ov: x.ov, uid: x.uid, pageNo: i + 1 },
  }));
}
