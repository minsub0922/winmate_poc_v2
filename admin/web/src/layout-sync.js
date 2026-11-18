// Keep other admin tabs' sheet names/previews current as well as the sheet manager.
export function startLayoutSync() {
  let revision = null, pending = false, stopped = false;
  const sync = async () => {
    if (stopped || pending || document.hidden) return;
    pending = true;
    try {
      const r = await fetch('/api/layout-library', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      if (!stopped && revision !== null && revision !== data.rev) window.dispatchEvent(new CustomEvent('admin:layout-library', { detail: data.rev }));
      revision = data.rev;
    } catch { /* retry after reconnect */ } finally { pending = false; }
  };
  const timer = setInterval(sync, 3000);
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('winmate-layout-library') : null;
  if (channel) channel.onmessage = sync;
  window.addEventListener('focus', sync); document.addEventListener('visibilitychange', sync); sync();
  return () => { stopped = true; clearInterval(timer); channel?.close(); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
}
