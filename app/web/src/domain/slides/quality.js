// The digest binds validation receipts to the exact final applied text. A saved
// 'ready' flag must not certify a later edit or a different product's card.
export function qualityTextKey(t = {}) {
  const text = JSON.stringify(Object.keys(t).sort().map((k) => [k, t[k]]));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return String(h >>> 0);
}

export function qualityIssues(x) {
  if (!x?.quality) return [];
  const q = x.quality;
  const issues = [...(q.issues || [])];
  if (q.status !== 'ready' && !issues.length) issues.push('최종 내용 검토가 필요해요.');
  if (q.textKey && q.textKey !== qualityTextKey(x.ov?.t || {})) issues.push('검수 후 문구가 바뀌었어요. 최종 내용 검토가 필요해요.');
  return issues;
}
