import { requestJson } from '../api/client.js';
import { configureLayoutLibrary } from '../domain/templates/layout_library.js';
export function startLayoutLibrarySync(onChange) {
  let pending = false, stopped = false;
  const sync = async () => {
    if (pending || stopped || document.hidden) return;
    pending = true;
    try {
      const snapshot = await requestJson('/api/layout-library');
      if (!stopped && configureLayoutLibrary(snapshot)) {
        window.dispatchEvent(new CustomEvent('winmate:layout-library', { detail: snapshot.rev }));
        onChange?.(snapshot.rev);
      }
    } catch { /* retain the last confirmed revision while disconnected */ }
    finally { pending = false; }
  };
  const timer = setInterval(sync, 3000);
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', sync);
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('winmate-layout-library') : null;
  if (channel) channel.onmessage = sync;
  return () => { stopped = true; clearInterval(timer); channel?.close(); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
}
