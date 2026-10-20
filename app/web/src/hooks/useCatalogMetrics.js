import { useEffect, useState } from 'react';
import { getCatalogMetricsSnapshot, loadCatalogMetrics } from '../services/catalog-metrics.js';

export function useCatalogMetrics(initialCounts) {
  const [counts, setCounts] = useState(() => getCatalogMetricsSnapshot()?.counts || initialCounts);
  useEffect(() => {
    let active = true, running = false, timer;
    async function refresh() {
      if (!active || running) return;
      running = true;
      clearTimeout(timer);
      let delay = 60 * 60 * 1000;
      try {
        const result = await loadCatalogMetrics();
        if (active) setCounts(result.counts);
        delay = Math.max(1000, Date.parse(result.next_refresh_at) - Date.now());
      } catch {
        // Keep the last displayed counts on a temporary connection/collection failure.
      } finally {
        running = false;
        if (active) timer = setTimeout(refresh, delay);
      }
    }
    const resume = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, []);
  return counts;
}
