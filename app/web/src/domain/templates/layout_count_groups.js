// Shared display grouping for admin, library, search and picker. Physical layouts
// keep their own ids, slot numbers and AI fill policies (unlike content variants).
import DATA from './layout_count_groups.json' with { type: 'json' };
export const COUNT_GROUPS = DATA.groups;
const BY_F = new Map(COUNT_GROUPS.flatMap(g => g.members.map(([f]) => [f, g])));
export const countGroupOf = f => BY_F.get(f) || null;
export const countVariantLabel = l => BY_F.get(l.f)?.members.find(([f]) => f === l.f)?.[1] || l.name;
export const ungroupCountLayouts = items => (items || []).flatMap(l => l.countVariants || [l]);

export function groupCountLayouts(items, { preferFirst = false, bucket = () => '' } = {}) {
  const entries = [], groups = new Map();
  for (const l of ungroupCountLayouts(items)) {
    const g = !l.my && !l.searchId && BY_F.get(l.f);
    if (!g) { entries.push({ members: [l] }); continue; }
    const key = g.id + ':' + bucket(l);
    if (!groups.has(key)) { const entry = { group: g, members: [] }; groups.set(key, entry); entries.push(entry); }
    const entry = groups.get(key);
    if (!entry.members.some(x => x.f === l.f)) entry.members.push(l);
  }
  return entries.map(({ group, members }) => {
    if (!group || members.length < 2) return members[0];
    const representative = preferFirst ? members[0] : members.find(l => l.f === group.preferred) || members[0];
    const order = new Map(group.members.map(([f], i) => [f, i]));
    return { ...representative, name: group.name, countGroup: group, countVariants: members.sort((a, b) => order.get(a.f) - order.get(b.f)),
      ...(members.some(l => Object.hasOwn(l, 'edited')) ? { edited: members.some(l => l.edited) } : {}) };
  });
}

export const filterCountLayouts = (items, predicate) => groupCountLayouts(ungroupCountLayouts(items).filter(predicate));

export function groupCountResults(rows, itemKey = 'item') {
  const layouts = groupCountLayouts(rows.map(row => row[itemKey]), { preferFirst: true });
  const byF = new Map(rows.map(row => [row[itemKey].f, row]));
  return layouts.map(l => ({ ...byF.get(l.f), [itemKey]: l }));
}
