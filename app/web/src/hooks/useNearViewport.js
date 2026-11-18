import { useEffect, useState } from 'react';

// One observer for the thumbnail collection, including cards in nested scrollers.
// Keep the card/controls mounted; only expensive, read-only preview content sleeps.
const listeners = new Map();
let observer;
function observe(element, notify) {
  observer ||= new IntersectionObserver(entries => {
    for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
  }, { rootMargin: '480px' });
  listeners.set(element, notify); observer.observe(element);
  return () => {
    observer.unobserve(element); listeners.delete(element);
    if (!listeners.size) { observer.disconnect(); observer = null; }
  };
}

export function useNearViewport(ref, enabled = true, once = false) {
  const [near, setNear] = useState(!enabled);
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    if (once && near) return;
    const element = ref.current;
    if (element) return observe(element, setNear);
  }, [ref, enabled, once, once && near]);
  return !enabled || near;
}
