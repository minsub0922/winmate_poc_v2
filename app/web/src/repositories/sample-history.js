// Requested example proposals are editable copies of curated Best Scenarios, never AI response fallbacks.
const KEY = 'winmate.v2.proposals';
const MARKER = 'winmate.v2.seedv';

export function mergeSampleHistory(existing, user, storage, scenarioOf, at = Date.now()) {
  const policy = user?.sample_history;
  if (user?.username !== 'admin' || !user.auth_enabled || !policy?.version || !Array.isArray(policy.scenarios)) return existing;
  const version = `admin-samples-${policy.version}`;
  try { if (storage.getItem(MARKER) === version) return existing; } catch { return existing; }
  const ids = new Set(existing.map(p => p.id));
  const added = [];
  for (const sid of new Set(policy.scenarios)) {
    const id = `admin-sample-${sid}`;
    if (ids.has(id)) continue;
    const source = scenarioOf(sid);
    if (!source) continue;
    const copy = structuredClone(source);
    Object.assign(copy, { id, title: `[샘플] ${source.title}`, createdAt: at, updatedAt: at, exportedAt: null,
      sample: { source: 'best-scenario', scenario: sid, version: policy.version } });
    added.push(copy); ids.add(id);
  }
  const merged = added.length ? [...existing, ...added] : existing;
  try {
    // Persist proposals first. A failed write must not mark the seed complete.
    storage.setItem(KEY, JSON.stringify(merged));
    storage.setItem(MARKER, version);
  } catch { /* Available for this visit when browser persistence is disabled/full. */ }
  return merged;
}
