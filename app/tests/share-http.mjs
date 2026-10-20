import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShareHttp } from '../web/src/services/share-http.js';

const snapshot = { token: 'synthetic-share-id-'.padEnd(43, 'x'), document: { title: 'Transport fixture' } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const html = status => new Response('<html>Gateway response</html>', { status, headers: { 'Content-Type': 'text/html' } });
const options = { wait: async () => {} };

test('valid shared JSON remains unchanged', async () => assert.deepEqual(await createShareHttp(async () => json(snapshot))('/api/storyboards/id'), snapshot));
test('204 polling has no JSON body', async () => assert.equal(await createShareHttp(async () => new Response(null, { status: 204 }))('/api/storyboards/id'), null));
test('plain API error includes its HTTP status', async () => assert.rejects(createShareHttp(async () => json({ detail: '형식 오류' }, 422))('/api/storyboards'), /형식 오류.*HTTP 422/));
test('conflict keeps the latest original for resolution', async () => { const api = createShareHttp(async () => json({ detail: { message: 'Conflict', latest: snapshot } }, 409)); await assert.rejects(api('/api/storyboards/id'), error => error.status === 409 && error.latest.token === snapshot.token); });
test('validation arrays show the field without echoing input values', async () => { const api = createShareHttp(async () => json({ detail: [{ loc: ['body', 'document'], msg: 'Field required', input: 'private-content' }] }, 422)); await assert.rejects(api('/api/storyboards'), error => /document.*Field required.*HTTP 422/.test(error.message) && !error.message.includes('private-content')); });
test('HTML 403 is classified without displaying its markup', async () => { await assert.rejects(createShareHttp(async () => html(403))('/api/storyboards'), error => /거부.*HTTP 403/.test(error.message) && !error.message.includes('<html>')); });
test('temporary HTML 502 retries and accepts a later document', async () => { let count = 0; const api = createShareHttp(async () => ++count === 1 ? html(502) : json(snapshot), options); assert.deepEqual(await api('/api/storyboards/id'), snapshot); assert.equal(count, 2); });
test('503 retries are bounded and retain the actual status', async () => { let count = 0; const api = createShareHttp(async () => { count++; return html(503); }, options); await assert.rejects(api('/api/storyboards/id'), error => error.status === 503 && error.message.includes('HTTP 503')); assert.equal(count, 3); });
test('HTTP 200 HTML is a protocol error, not a successful share', async () => assert.rejects(createShareHttp(async () => html(200))('/api/storyboards/id'), error => error.code === 'share_invalid_response' && error.message.includes('HTTP 200')));
test('a JSON page without a shared document is not accepted', async () => assert.rejects(createShareHttp(async () => json({ ok: true }))('/api/storyboards/id'), error => error.code === 'share_invalid_response'));
test('unanswered requests abort and stop after bounded retries', async () => { let count = 0; const api = createShareHttp(async (_, { signal }) => { count++; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(Error('abort'), { name: 'AbortError' })), { once: true })); }, { ...options, timeout: 10 }); await assert.rejects(api('/api/storyboards/id'), error => error.code === 'share_timeout'); assert.equal(count, 3); });
test('retrying registration retains the same source and body', async () => { const sent = []; const api = createShareHttp(async (_, request) => { sent.push({ method: request.method, body: request.body }); return sent.length === 1 ? html(502) : json(snapshot); }, options); await api('/api/storyboards', { source: 'fixed-id', document: snapshot.document }); assert.deepEqual(sent[0], sent[1]); });
test('a transient network failure can recover', async () => { let count = 0; const api = createShareHttp(async () => { if (++count === 1) throw new TypeError('fetch failed'); return json(snapshot); }, options); assert.deepEqual(await api('/api/storyboards/id'), snapshot); assert.equal(count, 2); });
test('500 is reported once without an unsafe blind retry loop', async () => { let count = 0; const api = createShareHttp(async () => { count++; return html(500); }, options); await assert.rejects(api('/api/storyboards/id'), /HTTP 500/); assert.equal(count, 1); });
