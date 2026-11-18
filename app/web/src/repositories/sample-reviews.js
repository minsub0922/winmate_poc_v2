// Paired native proposal / real AI review examples. Never a fallback for live jobs.
let legacy, bundle, previousV5, archives, VERSION, loading;
const isAdmin = user => user?.username === 'admin' && user.auth_enabled === true;
// Only the admin examples need these large archives. Finish loading before either
// repository initializes, so both stores migrate from the same complete archive.
export async function loadSampleReviews(user) {
  if (!isAdmin(user)) return;
  if (!loading) loading = import('./sample-review-data.js').then(data => {
    ({ legacy, bundle, previousV5, archives } = data);
    VERSION = `admin-linked-review-examples-${bundle.version}${bundle.layoutRevision ? '-layouts' + bundle.layoutRevision : ''}`;
  }).catch(error => { loading = null; throw error; });
  await loading;
}
function requireExamples() { if (!bundle) throw new Error('검토 예시 데이터를 먼저 준비해야 합니다.'); }

const KEY = 'winmate.v2.reviews';
const PROPOSALS = 'winmate.v2.proposals';
const MARKER = 'winmate.v2.reviews.seedv';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
// The layout store upgrades this internal policy version on load. It is not a user edit.
const sourceComparable = (p, normalize) => {
  // Compare both sides under the same automatic cover migration. This runs on
  // copies: saved edits, archived evidence and the original source stay intact.
  if (normalize) { p = structuredClone(p); normalize(p); }
  // The repository adds this derived owner URL on load. It is not authored content.
  const { endPath, ...source } = p;
  if (endPath != null && endPath !== '/storyboard/' + encodeURIComponent(p.id)) source.endPath = endPath;
  const original = archives.find(e => paired(p, e));
  const current = original && bundle.examples.find(e => e.scenario === original.scenario);
  const old = new Map((original?.proposal.parts || []).flatMap(part => part.layouts.map(x => [x.uid, x])));
  const replacements = new Map((current?.proposal.parts.slice(-4) || []).map(part => [part.name, part.layouts[0]]));
  return { ...source, parts: (p.parts || []).map(part => ({ ...part, layouts: (part.layouts || []).map(layout => {
    const { adaptation, ...record } = layout;
    const before = old.get(layout.uid), replacement = replacements.get(part.name);
    return before?.f === 'L_AIS_32' && replacement && layout.f === replacement.f && same(layout.ov, replacement.ov)
      ? { ...record, f: before.f, ov: before.ov } : record;
  }) })) };
};
function untouchedLegacy(r) {
  const source = legacy.reviews.find(x => x.id === r.id);
  if (!source || !r.demo || (r.sample && r.sample.source !== 'example-review')) return false;
  const { sample, ...record } = r;
  return same(record, source);
}
function paired(proposal, example) {
  return proposal?.id === example.proposal.id && proposal.sample?.source === 'linked-review-proposal' && proposal.sample.scenario === example.scenario;
}
function untouchedPrevious(review, proposals, normalize) {
  const example = archives.find(e => e.review.id === review.id);
  if (!example || !same(review, example.review)) return false;
  const source = proposals.find(p => p.id === example.proposal.id);
  return !source || same(sourceComparable(source, normalize), sourceComparable(example.proposal, normalize));
}

// Earlier rubric migrations kept their proposal copies. Repair their untouched
// appendix sheets as well, so opening an older history entry has the same fix.
function repairArchivedLayouts(proposals) {
  if (!bundle.layoutRevision) return proposals;
  let changed = false;
  const result = proposals.map(proposal => {
    const source = archives.find(e => e.proposal.id === proposal.id && (!proposal.sample || paired(proposal, e)));
    const current = source && bundle.examples.find(e => e.scenario === source.scenario);
    if (!current) return proposal;
    const replacements = new Map(current.proposal.parts.slice(-4).map(p => [p.name, p.layouts[0]]));
    const originals = new Map(source.proposal.parts.flatMap(p => p.layouts.map(x => [x.uid, x])));
    let modified = false;
    const parts = proposal.parts.map(part => {
      const replacement = replacements.get(part.name);
      if (!replacement) return part;
      const layouts = part.layouts.map(layout => {
        const before = originals.get(layout.uid);
        if (!before || layout.f !== 'L_AIS_32' || !same(layout.ov, before.ov)) return layout;
        modified = true;
        const repaired = { ...layout, f: replacement.f, ov: structuredClone(replacement.ov), status: 'done' };
        delete repaired.adaptation;
        return repaired;
      });
      return layouts.some((x, i) => x !== part.layouts[i]) ? { ...part, layouts } : part;
    });
    if (!modified) return proposal;
    changed = true;
    return { ...proposal, parts };
  });
  return changed ? result : proposals;
}

// Proposals initialize before reviews; the shared marker is committed only after both stores exist.
export function mergeReviewExampleProposals(existing, user, storage, normalize) {
  if (!isAdmin(user)) return existing;
  requireExamples();
  try {
    if (storage.getItem(MARKER) === VERSION) {
      const repaired = repairArchivedLayouts(existing);
      if (repaired !== existing) storage.setItem(PROPOSALS, JSON.stringify(repaired));
      return repaired;
    }
  } catch { return existing; }
  const ids = new Set(existing.map(p => p.id));
  const added = bundle.examples.filter(e => !ids.has(e.proposal.id)).map(e => structuredClone(e.proposal));
  let reviews;
  try { reviews = JSON.parse(storage.getItem(KEY) || '[]'); } catch { return existing; }
  const replaced = bundle.layoutRevision ? existing.filter(p => {
    const source = previousV5.examples.find(e => e.proposal.id === p.id);
    if (!source || !same(sourceComparable(p, normalize), sourceComparable(source.proposal, normalize))) return true;
    const review = reviews.find(r => r.id === source.review.id);
    return review && !same(review, source.review);
  }) : existing;
  const merged = repairArchivedLayouts(added.length || replaced.length !== existing.length ? [...replaced, ...added] : existing);
  try { storage.setItem(PROPOSALS, JSON.stringify(merged)); } catch { /* Keep pairs usable in memory; do not commit the marker. */ }
  return merged;
}

export function mergeSampleReviews(existing, user, storage, proposals = [], normalize) {
  if (!isAdmin(user)) return existing;
  requireExamples();
  try { if (storage.getItem(MARKER) === VERSION) return existing; } catch { return existing; }
  const ready = bundle.examples.filter(e => proposals.some(p => paired(p, e)));
  if (!ready.length) return existing; // Never add a review whose native source is missing.
  const ids = new Set(existing.map(r => r.id));
  const added = ready.filter(e => !ids.has(e.review.id)).map(e => structuredClone(e.review));
  const kept = ready.length === bundle.examples.length ? existing.filter(r => !untouchedLegacy(r) && !untouchedPrevious(r, proposals, normalize)) : existing;
  const merged = added.length || kept.length !== existing.length ? [...added, ...kept] : existing;
  try {
    storage.setItem(KEY, JSON.stringify(merged));
    const saved = JSON.parse(storage.getItem(PROPOSALS) || '[]');
    // A quota failure writing proposals must not strand reviews behind a completed marker.
    if (ready.length === bundle.examples.length && Array.isArray(saved) && bundle.examples.every(e => saved.some(p => paired(p, e)))) storage.setItem(MARKER, VERSION);
  } catch { /* Preserve old and user-edited records; retry an incomplete migration next load. */ }
  return merged;
}

export function sampleReviewDoc(review, user) {
  if (!isAdmin(user) || !review?.demo) return null;
  requireExamples();
  if (review.sample?.source === 'linked-review-example') {
    const example = [...bundle.examples, ...archives].find(e => e.review.id === review.id && e.proposal.id === review.sample.proposalId);
    return example ? structuredClone(example.doc) : null;
  }
  if (review.sample?.source !== 'example-review') return null;
  const doc = legacy.docs[review.id];
  return doc ? structuredClone(doc) : null;
}
