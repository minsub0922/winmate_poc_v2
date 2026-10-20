import { requestJson } from '../api/client.js';

const KEYS = ['layouts', 'industry_layouts', 'products', 'solutions', 'cases'];
let snapshot;
let pending;

export function getCatalogMetricsSnapshot() { return snapshot; }

export async function loadCatalogMetrics() {
  if (snapshot && Date.parse(snapshot.next_refresh_at) > Date.now()) return snapshot;
  if (!pending) {
    pending = requestJson('/api/catalog/metrics', { cache: 'no-store' }).then((value) => {
      if (!value?.counts || KEYS.some(key => !Number.isSafeInteger(value.counts[key]) || value.counts[key] < 0) || value.counts.industry_layouts > value.counts.layouts || !Number.isFinite(Date.parse(value.next_refresh_at))) {
        throw new Error('자산 건수 형식이 올바르지 않습니다.');
      }
      snapshot = value;
      return snapshot;
    }).finally(() => { pending = undefined; });
  }
  return pending;
}
