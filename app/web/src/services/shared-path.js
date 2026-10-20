const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const PATH = /^\/s\/([A-Za-z0-9_-]{32,64})\/?$/;

export const historyPath = id => '/storyboard/' + encodeURIComponent(id);
export function historyId(pathname = window.location.pathname) {
  const match = /^\/storyboard\/([^/]+)\/?$/.exec(pathname);
  try { return match ? decodeURIComponent(match[1]) : null; } catch { return null; }
}
export const routePath = route => route.name === 'proposal' && route.id ? historyPath(route.id)
  : route.name === 'spatial' ? '/spatial' + (route.id ? '/' + encodeURIComponent(route.id) : '')
  : route.name === 'shared' && route.token ? '/s/' + route.token : '/';

export function spatialId(pathname = window.location.pathname) {
  const match = /^\/spatial(?:\/([^/]+))?\/?$/.exec(pathname);
  try { return match ? { name: 'spatial', ...(match[1] ? { id: decodeURIComponent(match[1]) } : {}) } : null; } catch { return null; }
}

/** A history keeps its local ID; its shared original has a stable ID and endpoint. */
export function sharedIdentity(value) {
  const meta = typeof value === 'string' ? { token: value } : value?._share || value;
  if (!meta) return null;
  const token = [meta.token, PATH.exec(meta.endPath || '')?.[1], meta.endPath && meta.id].find(x => typeof x === 'string' && TOKEN.test(x));
  return token ? { id: token, token, endPath: '/s/' + token } : null;
}

export const sharedToken = () => PATH.exec(window.location.pathname)?.[1] || null;
export const storyboardUrl = value => {
  const share = sharedIdentity(value);
  return share ? new URL(share.endPath, window.location.origin).href : '';
};
