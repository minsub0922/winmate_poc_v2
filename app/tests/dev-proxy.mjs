import assert from 'node:assert/strict';
import test from 'node:test';
import { localProxyOrigin } from '../web/dev-proxy.js';
const api = 'http://127.0.0.1:8788';
const request = (origin, host = '127.0.0.1:5219', localPort = 5219, extra = {}) => ({ headers: { origin, host, ...extra }, socket: { localPort } });
test('actual listening port works without WINMATE_WEB_PORT matching a CLI override', () => {
  assert.equal(localProxyOrigin(request('http://127.0.0.1:5219'), api), api);
  assert.equal(localProxyOrigin(request('http://localhost:5219'), api), api);
  assert.equal(localProxyOrigin(request('http://[::1]:5219', '[::1]:5219'), api), api);
  assert.equal(localProxyOrigin({ headers: { origin: 'https://localhost', host: 'localhost' }, socket: { encrypted: true, localPort: 443 } }, api), api);
});
test('unrelated origins/ports and spoofed forwarding headers stay rejected', () => {
  for (const r of [request('http://evil.example:5219'), request('http://127.0.0.1:5173'), request('http://127.0.0.1:5219', 'evil.example:5219'), request('https://localhost:5219'), request('null'), request(undefined), request('http://user@localhost:5219'), request('http://localhost:5219', 'localhost:5219', 5173), request('http://evil.example:5219', 'localhost:5219', 5219, { 'x-forwarded-host': 'localhost:5219', 'x-forwarded-proto': 'http' })]) {
    assert.equal(localProxyOrigin(r, api), null);
  }
});
test('same-origin Referer is normalized when Origin is absent', () => {
  for(const ref of ['http://127.0.0.1:5219/spatial','http://localhost:5219/spatial?view=3d']){
    assert.equal(localProxyOrigin(request(undefined,'127.0.0.1:5219',5219,{referer:ref,'sec-fetch-site':'same-origin'}),api),api);
  }
});
test('Referer fallback never rescues an invalid Origin or a cross-site request', () => {
  for(const extra of [
    {referer:'http://evil.example:5219/spatial'},
    {referer:'http://localhost:5173/spatial'},
    {referer:'http://localhost:5219/spatial','sec-fetch-site':'cross-site'},
    {referer:'http://localhost:5219/spatial','sec-fetch-site':'same-site'},
  ])assert.equal(localProxyOrigin(request(undefined,'localhost:5219',5219,extra),api),null);
  assert.equal(localProxyOrigin(request('null','localhost:5219',5219,{referer:'http://localhost:5219/spatial'}),api),null);
});
