const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const portOf = url => Number(url.port || (url.protocol === 'https:' ? 443 : 80));

/** Match the actual listening socket, including a Vite CLI/programmatic port override.
 * Never translate arbitrary origins or forwarded headers into a trusted API origin.
 */
export function localProxyOrigin(request, api) {
  try {
    const protocol = request.socket.encrypted ? 'https:' : 'http:';
    const suppliedOrigin = request.headers.origin;
    // Browser writes may carry Referer without Origin. Validate that fallback
    // against the same listening socket before translating it for the API.
    if (suppliedOrigin === undefined && ['cross-site', 'same-site'].includes((request.headers['sec-fetch-site'] || '').toLowerCase())) return null;
    const origin = new URL(suppliedOrigin === undefined ? request.headers.referer : suppliedOrigin), host = new URL(`${protocol}//${request.headers.host}`);
    if (!LOOPBACK.has(origin.hostname) || !LOOPBACK.has(host.hostname) || origin.protocol !== protocol || origin.username || origin.password) return null;
    const listeningPort = Number(request.socket.localPort);
    if (!listeningPort || portOf(origin) !== listeningPort || portOf(host) !== listeningPort) return null;
    return api;
  } catch { return null; }
}
