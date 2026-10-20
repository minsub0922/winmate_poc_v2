export const usedLayoutIds = p => new Set((p?.parts || []).flatMap(s => (s.layouts || []).map(x => x.f).filter(Boolean)));

/** Automatic insertion checks the current board, including edits made while a job ran. */
export function repeatedAutoLayouts(parts, proposal) {
  const used = usedLayoutIds(proposal), duplicates = new Set();
  for (const part of parts) for (const layout of part.layouts || []) {
    if (used.has(layout.f)) duplicates.add(layout.f);
    used.add(layout.f);
  }
  return [...duplicates];
}
