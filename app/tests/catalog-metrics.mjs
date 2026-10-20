import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { build } = require('esbuild');
const built = await build({ stdin: { contents: `export * from './services/catalog-metrics.js';export {setTransport} from './api/client.js';`, resolveDir: fileURLToPath(new URL('../web/src/', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm' });
const url = 'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64');
let sequence = 0;
const fresh = () => import(url + '#' + sequence++);
const sample = (products = 5, next = '2026-10-20T15:00:00Z') => ({ counts: { layouts: 3, industry_layouts: 1, products, solutions: 2, cases: 4 }, updated_at: '2026-10-20T00:00:00Z', next_refresh_at: next });

test('cached counts refresh at Korea midnight, with concurrent requests merged', async t => {
  const service = await fresh(); let now = Date.parse('2026-10-20T14:59:59Z'), calls = 0;
  t.mock.method(Date, 'now', () => now);
  service.setTransport(async () => Response.json(sample(++calls + 4, calls === 1 ? '2026-10-20T15:00:00Z' : '2026-10-21T15:00:00Z')));
  const first = await Promise.all([service.loadCatalogMetrics(), service.loadCatalogMetrics()]);
  assert.equal(calls, 1); assert.equal(first[0].counts.products, 5);
  await service.loadCatalogMetrics(); assert.equal(calls, 1);
  now = Date.parse('2026-10-20T15:00:00Z');
  const second = await service.loadCatalogMetrics();
  assert.equal(calls, 2); assert.equal(second.counts.products, 6);
});

test('network failures retain the last successful counts and allow another attempt', async t => {
  const service = await fresh(); let now = Date.parse('2026-10-20T14:59:59Z');
  t.mock.method(Date, 'now', () => now);
  service.setTransport(async () => Response.json(sample()));
  await service.loadCatalogMetrics(); now += 1000;
  service.setTransport(async () => { throw new TypeError('offline'); });
  await assert.rejects(service.loadCatalogMetrics(), /offline/);
  assert.equal(service.getCatalogMetricsSnapshot().counts.products, 5);
  service.setTransport(async () => Response.json(sample(9, '2026-10-21T15:00:00Z')));
  assert.equal((await service.loadCatalogMetrics()).counts.products, 9);
});

test('malformed responses cannot replace displayed counts', async t => {
  const service = await fresh(); let now = Date.parse('2026-10-20T14:59:59Z');
  t.mock.method(Date, 'now', () => now);
  service.setTransport(async () => Response.json(sample())); await service.loadCatalogMetrics(); now += 1000;
  for (const invalid of [{}, sample(-1), { ...sample(), next_refresh_at: 'bad' }, { ...sample(), counts: { ...sample().counts, layouts: 0 } }]) {
    service.setTransport(async () => Response.json(invalid));
    await assert.rejects(service.loadCatalogMetrics(), /자산 건수 형식/);
    assert.equal(service.getCatalogMetricsSnapshot().counts.products, 5);
  }
});
