// 관리자 읽기 전용 열람 — 관리자 화면 「사용자 관리 → 활동 내역」의 '웹앱에서 보기'가 연 탭에서만 켜진다.
// (server: app/api/inspect.py · admin/activity.py)
//
// The token arrives once in the address fragment (#inspect=…&open=kind:id), is kept only in this tab's sessionStorage
// and goes with every API request of this tab as X-Winmate-Inspect (<img> addresses: ?inspect=, see withInspect). The
// server answers as the inspected user and refuses writes; this module also stops writes before they leave the tab,
// and main.jsx keeps the inspected account out of this browser's own storage. Other tabs are untouched.
// Imported first by main.jsx so the fetch hook is in place before anything else runs.
const KEY = 'winmate.inspect';
const READ_ONLY_POST = /^\/api\/account-data\/[a-z-]{1,40}\/fetch$|^\/api\/account-data\/blobs\/missing$|^\/api\/spatial\/(?:snapshot|compute|building-snapshot)$/;
export const READ_ONLY_MESSAGE = '관리자 열람은 읽기 전용이라 저장하지 않습니다.';
const ROUTES = { proposal: 'proposal', review: 'review', simulation: 'sim', spatial: 'spatial', building: 'building' };
let session = null;
const listeners = new Set();

function read() {
  try { const value = JSON.parse(window.sessionStorage.getItem(KEY) || 'null'); return value && typeof value.token === 'string' ? value : null; } catch { return null; }
}
function save(value) {
  try { if (value) window.sessionStorage.setItem(KEY, JSON.stringify(value)); else window.sessionStorage.removeItem(KEY); } catch { /* private window: this visit only */ }
}
const blocked = () => new Response(JSON.stringify({ ok: false, code: 'inspect_read_only', detail: READ_ONLY_MESSAGE }), { status: 403, headers: { 'Content-Type': 'application/json' } });

function start() {
  if (typeof window === 'undefined' || !window.location) return;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.get('inspect')) {
    save({ token: hash.get('inspect'), open: hash.get('open') || '', tab: Math.random().toString(36).slice(2, 10) });
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }
  session = read();
  if (!session) return;
  // Storage namespace of this tab (repositories/browser.js · building/store.js); removed when the tab closes.
  window.__winmateInspect = 'winmate.inspect.' + String(session.tab || 'tab').replace(/[^a-z0-9]/gi, '') + ':';
  const original = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    let url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.origin); } catch { return original(input, init); }
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return original(input, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !(method === 'POST' && READ_ONLY_POST.test(url.pathname))) return Promise.resolve(blocked());
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-Winmate-Inspect', session.token);
    return original(input, { ...init, headers, cache: 'no-store' }).then(response => {
      if (response.status === 403) response.clone().json().then(body => { if (body?.code === 'inspect_expired') expire(); }).catch(() => {});
      return response;
    });
  };
}
function expire() {
  if (!session || session.expired) return;
  session = { ...session, expired: true };
  for (const fn of listeners) fn(session);
}
start();

export const inspecting = () => !!session;
export const inspectNamespace = () => (session ? window.__winmateInspect : '');
export const inspectSession = () => session;
export const onInspectChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
/** <img> and other addresses the browser loads without fetch() carry the token in the query instead. */
export const withInspect = url => session && url ? url + (url.includes('?') ? '&' : '?') + 'inspect=' + encodeURIComponent(session.token) : url;
/** The screen the admin asked for ('proposal:<id>', 'simulation:<id>', … or 'home'). */
export function inspectRoute() {
  if (!session?.open) return null;
  const [kind, ...rest] = session.open.split(':');
  const id = rest.join(':');
  if (kind === 'home') return { name: 'home' };
  return ROUTES[kind] && id ? { name: ROUTES[kind], id } : null;
}
export function endInspect() {
  save(null);
  window.close();
  // A tab the browser will not let a script close (it has its own history now) goes to the app's start instead.
  setTimeout(() => window.location.replace('/'), 200);
}
