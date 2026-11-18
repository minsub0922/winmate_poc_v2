// Store types / separate sites are alternative concept views, not neighbouring
// rooms on one floor. Explicit scope takes precedence over the legacy name hint.
export function separateSites(plan) {
  if (plan?.scope) return plan.scope === 'sites';
  const spaces = plan?.spaces || [];
  return spaces.length > 1 && spaces.every(s => /매장|점포|지점|(?:서울|부산|대구|인천).*점$/.test(s.name || ''));
}

export function siteRoomId(id, index) {
  return 'room-' + (index + 1) + '-' + String(id).replace(/[^\w-]/g, '').slice(0, 40);
}
