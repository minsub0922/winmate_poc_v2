import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerRanges, loadBg } from '../web/src/services/packs.js';
import { setTransport } from '../web/src/api/client.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'img/lib/ranges.json')));
const packs = new Map(Object.keys(manifest.packs).map(name => [name, fs.readFileSync(path.join(root, name))]));

test('range index points to the actual first, middle and last image bytes in every large pack', () => {
  for (const [name, ranges] of Object.entries(manifest.packs)) {
    const bytes = packs.get(name), images = JSON.parse(bytes).images;
    assert.equal(ranges.length, images.length);
    for (const i of [0, Math.floor(images.length / 2), images.length - 1]) {
      const [start, end] = ranges[i]; assert.equal(bytes.subarray(start, end).toString(), images[i]);
    }
  }
});

test('one image fetch transfers its byte range, reuses the cached blob and never fetches the full pack', async () => {
  const requests = []; registerRanges(manifest.packs);
  setTransport(async (url, options) => {
    if (String(url).startsWith('data:')) return fetch(url);
    const bytes = packs.get(url); assert(bytes);
    const match = /^bytes=(\d+)-(\d+)$/.exec(options?.headers?.Range || ''); assert(match, 'full pack requested');
    const body = bytes.subarray(Number(match[1]), Number(match[2]) + 1);
    requests.push({ url, bytes: body.length }); return new Response(body, { status: 206 });
  });
  try {
    const urls = await Promise.all(Object.keys(manifest.packs).map(name => loadBg(name + '#0')));
    assert(urls.every(url => url.startsWith('blob:')));
    const first = Object.keys(manifest.packs)[0]; assert.equal(await loadBg(first + '#0'), urls[0]);
    assert.equal(requests.length, packs.size);
    for (const request of requests) assert(request.bytes < packs.get(request.url).length / 10);
  } finally { setTransport((...args) => fetch(...args)); }
});
