// 파트 색 — app/web/src/domain/templates/part_colors.js
//   node --test app/tests/part-colors.mjs
// 규칙(사용자 지시 2026-11-16): 추천 구성 버블은 파트마다 최대한 다른 색 · 흐름 앞에서 뒤로 색이 차례로 흐른다 · 관리자 화면도 같은 색.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + 'app/web/package.json');
const { build } = require('esbuild');
const entry = `export * as toc from './app/web/src/domain/templates/toc_templates.js';
export * as colors from './app/web/src/domain/templates/part_colors.js';
export * as arc from './admin/web/src/part-arc.js';`;
const built = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const C = M.colors.PART_COLORS;

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const lab = (h) => {
  const [r, g, b] = rgb(h).map(lin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [x, y, z] = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883].map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
/** CIEDE2000 — 사람 눈에 보이는 색 차이 */
function de(x1, x2) {
  const [L1, a1, b1] = lab(x1); const [L2, a2, b2] = lab(x2); const rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2; const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1; const a2p = (1 + G) * a2; const C1 = Math.hypot(a1p, b1); const C2 = Math.hypot(a2p, b2);
  const hp = (a, b) => { const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h; };
  const h1 = hp(a1p, b1); const h2 = hp(a2p, b2);
  let dh = h2 - h1; if (Math.abs(dh) > 180) dh -= Math.sign(dh) * 360;
  const dL = L2 - L1; const dC = C2 - C1; const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2; const Cp = (C1 + C2) / 2; let hb = (h1 + h2) / 2; if (Math.abs(h1 - h2) > 180) hb += 180;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2); const SC = 1 + 0.045 * Cp; const SH = 1 + 0.015 * Cp * T;
  const RT = -Math.sin(2 * 30 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad) * 2 * Math.sqrt(Cp ** 7 / (Cp ** 7 + 25 ** 7));
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

test('파트마다 제 색 — 서로 다르고 흰 아이콘이 보이는 짙기', () => {
  const keys = Object.keys(C);
  assert.equal(new Set(Object.values(C)).size, keys.length, '색이 겹치지 않는다');
  for (const k of keys) {
    assert.match(C[k], /^#[0-9a-f]{6}$/, k);
    assert.ok(M.toc.TOCS[k], k + ' 는 목차(TOCS)에 있어야 함');
    assert.ok(1.05 / (lum(C[k]) + 0.05) >= 3, k + ' 흰 아이콘 명암비 3 이상');
  }
});

test('구성마다 이웃한 버블은 눈에 띄게 다르다(CIEDE2000 15 이상)', () => {
  const pairs = new Map();
  for (const t of M.toc.TOC_TEMPLATES) {
    const ks = t.tocs.filter((k) => C[k]);
    ks.slice(1).forEach((k, i) => pairs.set(ks[i] + '>' + k, de(C[ks[i]], C[k])));
  }
  assert.ok(pairs.size > 5);
  const weak = [...pairs].filter(([, d]) => d < 15).map(([p, d]) => p + ' ' + d.toFixed(1));
  assert.deepEqual(weak, [], '이웃한 파트 색 차이가 작다');
});

test('흐름 앞에서 뒤로 색이 흐른다 — 기본 제안 · 상세 제안 순서대로 색상각이 한쪽으로 돈다(마지막 Why Samsung 은 삼성 남색)', () => {
  const hue = (h) => { const [L, a, b] = lab(h); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
  for (const id of ['basic', 'detail']) {
    const t = M.toc.TPL[id];
    // 회색 제안 개요 · 결론 Why Samsung · 맨 끝 제품 스펙(Storyboard 추천 구성에서는 그리지 않는다)을 뺀 가운데 흐름
    const mid = t.tocs.filter((k) => !['overview', 'why', 'pspec'].includes(k)).map((k) => hue(C[k]));
    const unwrap = mid.map((h, i) => (i && h > mid[0] + 30 ? h - 360 : h));
    assert.deepEqual(unwrap, [...unwrap].sort((a, b) => b - a), id + ' 색상각: ' + mid.map((h) => h.toFixed(0)).join(' '));
  }
  assert.equal(C.why, '#1428a0');
});

test('관리자 「전체 파트」 기승전결 색도 같은 색', () => {
  for (const [k, key] of [['overview', 'overview'], ['ua', 'ua'], ['needs', 'needs'], ['space', 'space'], ['sol', 'sol'], ['subx', 'subscription'], ['svc', 'svc'], ['case', 'case'], ['why', 'why'], ['pspec', 'pspec']]) {
    assert.equal(M.arc.partArc(key).color, C[k], key);
  }
});
