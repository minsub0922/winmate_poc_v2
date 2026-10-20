// Real authentication middleware and Gemini through Vite on a non-default socket port.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'winmate-proxy-403-'));
const output = path.join(root, 'app/tests/output/ai-403'); await fs.mkdir(output, { recursive: true });
process.env.WINMATE_API_PORT = '8799'; process.env.WINMATE_WEB_PORT = '5173';
const api = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', 'app/tests/fixtures/layout-reflow-server.py'], { cwd: root, env: { ...process.env, WINMATE_AUTH_DIR: path.join(temp, 'auth'), WINMATE_STORYBOARD_DIR: path.join(temp, 'shares'), WINMATE_LLM_CACHE: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; api.stdout.on('data', b => { logs += b; }); api.stderr.on('data', b => { logs += b; });
let vite; const checks = []; let model;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch('http://127.0.0.1:8799/api/auth/status')).ok) break; } catch {} if (api.exitCode != null) throw Error(logs.slice(-1000)); await new Promise(r => setTimeout(r, 300)); }
  vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), cacheDir: path.join(output, 'vite-cache'), logLevel: 'error', server: { host: '127.0.0.1', port: 5199, strictPort: true, hmr: false } });
  await vite.listen(); const port = vite.httpServer.address().port, base = `http://127.0.0.1:${port}`; assert.notEqual(port, 5173);
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'layout-reflow-test', password: 'layout-reflow-test-synthetic-password' }) });
  assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0];
  checks.push('Actual socket port differs from configured 5173; same-origin login passes');
  const legacy = await fetch('http://127.0.0.1:8799/api/llm', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(legacy.status, 403); assert.equal((await legacy.json()).code, 'csrf_rejected');
  checks.push('Original unnormalized proxy Origin reproduces HTTP 403 against the API');
  const result = await fetch(base + '/api/llm', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'layout', kind: 'json', stream: false, prompt: 'Connection regression test. Return JSON {"connected":true}.', schema: { type: 'OBJECT', properties: { connected: { type: 'BOOLEAN' } }, required: ['connected'] } }) });
  const value = await result.json(); assert.equal(result.status, 200, JSON.stringify(value)); assert.equal(value.mode, 'real'); assert.equal(value.data.connected, true); model = value.model;
  checks.push('Actual Gemini layout request returns HTTP 200 through overridden development port');
  for (const origin of [`http://localhost:${port}`, `http://127.0.0.1:${port}`]) {
    const response = await fetch(base + '/api/llm', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(response.status, 422);
  }
  checks.push('localhost and 127.0.0.1 aliases pass CSRF on the actual port');
  for (const origin of ['https://evil.example', 'http://localhost:5173', 'null']) {
    const response = await fetch(base + '/api/llm', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(response.status, 403); assert.equal((await response.json()).code, 'csrf_rejected');
  }
  checks.push('Foreign, null, and mismatched-port origins remain HTTP 403; CSRF protection retained');
  console.log(JSON.stringify({ checks, model }, null, 2));
} finally {
  await fs.writeFile(path.join(output, 'proxy-verification.json'), JSON.stringify({ checks, model }, null, 2));
  await vite?.close(); api.kill('SIGTERM'); if (api.exitCode == null) await new Promise(r => api.once('exit', r)); await fs.rm(temp, { recursive: true, force: true });
}
