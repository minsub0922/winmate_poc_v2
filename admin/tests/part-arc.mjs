// 「전체 파트」 팝업의 기승전결 색 — admin/web/src/part-arc.js
//   node admin/tests/part-arc.mjs
// 규칙(2026-11-16 사용자): 전체 파트의 파트들에 기승전결이 느껴지게 서로 다른 색을 준다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + 'app/web/package.json');
const { build } = require('esbuild');
const entry = `export * as toc from './app/web/src/domain/templates/toc_templates.js';
export { FILLS, FILL_CUSTOMER } from './app/web/src/domain/templates/scenario_fills.js';
export { default as SWAPS } from './app/web/src/domain/templates/scenario_image_swaps.json';
export * from './admin/web/src/part-flows.js';
export * as arc from './admin/web/src/part-arc.js';`;
const built = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
await M.toc.loadTocContent();
const C = M.curateParts(M.partFlows(M.toc, { FILLS: M.FILLS, FILL_CUSTOMER: M.FILL_CUSTOMER, SWAPS: M.SWAPS }));
const parts = C.parts.map(p => ({ key: p.key, ...M.arc.partArc(p.key) })).sort((a, b) => a.order - b.order);
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hue = hex => { const [r, g, b] = rgb(hex).map(v => v / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0; const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const sat = hex => { const [r, g, b] = rgb(hex).map(v => v / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b); return max ? (max - min) / max : 0; };
const lum = hex => { const [r, g, b] = rgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const of = id => parts.filter(p => p.stage.id === id);

test('목록의 파트는 모두 제 자리(기 · 승 · 전 · 결)와 제 색이 있다 — 색은 서로 다르다', () => {
  assert.ok(parts.every(p => p.own), parts.filter(p => !p.own).map(p => p.key).join(' ') + ' — PART_ARC 에 색을 정한다');
  assert.equal(new Set(parts.map(p => p.color)).size, parts.length);
  assert.deepEqual(M.arc.ARC_STAGES.map(s => s.mark), ['기', '승', '전', '결']);
  for (const p of parts) {
    assert.match(p.color, /^#[0-9a-f]{6}$/, p.key);
    assert.ok(1.05 / (lum(p.color) + 0.05) >= 3, p.key + ' 흰 아이콘이 보이는 짙기'); // 버블의 흰 아이콘 · 띠
    assert.match(p.soft, /^#[0-9a-f]{6}$/); assert.ok(lum(p.soft) > 0.8, p.key + ' 옅은 바탕');
  }
  // 서로 헷갈리지 않게 — 어느 두 색이든 RGB 거리가 넉넉하다
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const [a, b] = [rgb(parts[i].color), rgb(parts[j].color)];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= 40, parts[i].key + ' · ' + parts[j].key);
  }
});

test('자리 — 기: Overview · 고객사의 이해 / 승: 제안 전개 / 전: 구독 · 사례 / 결: Why Samsung', () => {
  assert.deepEqual(of('gi').map(p => p.key), ['overview', 'ua']);
  assert.deepEqual(of('seung').map(p => p.key), ['needs', 'space', 'value', 'sol', 'pspec']);
  assert.deepEqual(of('jeon').map(p => p.key), ['svc', 'case']); // 2026-11-17: 구독 상품 제안은 서비스 제안의 갈래로(목록에서 빠짐) // 서비스(2026-11-16)는 구독 다음 // 유관사례(pcase)는 쓰는 구성이 없어 목록에서 빠졌다 — 제품 제안서 = 표준 제안서에서 Overview · 업종 솔루션 · 도입사례만 뺀 것(2026-11-16)
  assert.deepEqual(of('gyeol').map(p => p.key), ['why']);
  // 이야기 순서 = 기 → 승 → 전 → 결 (자리가 뒤로 돌아가지 않는다)
  const order = parts.map(p => M.arc.ARC_STAGES.findIndex(s => s.id === p.stage.id));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(parts[parts.length - 1].key, 'why');
});

test('색이 자리를 따라 흐른다 — 기는 차분하게, 승은 파랑에서 초록으로, 전은 따뜻하게, 결은 짙은 삼성 남색', () => {
  for (const p of of('gi')) assert.ok(sat(p.color) < 0.5 && hue(p.color) > 195 && hue(p.color) < 265, p.key + ' 차분한 찬 색(회색 · 옅은 보라)');
  const up = of('seung').map(p => hue(p.color));
  assert.deepEqual(up, [...up].sort((a, b) => b - a), '승 — 파랑(큰 색상각)에서 초록 · 연두로 차례로');
  assert.ok(up[0] < 215 && up[up.length - 1] > 55, up.join(' '));
  for (const p of of('seung')) assert.ok(sat(p.color) > 0.6, p.key + ' 색이 오른다');
  const turn = of('jeon').map(p => hue(p.color));
  assert.ok(turn.every(h => h < 45), '전 — 따뜻한 색(호박 · 주황 · 다홍): ' + turn.join(' '));
  assert.deepEqual(turn, [...turn].sort((a, b) => b - a), '전 — 호박에서 다홍으로 달아오른다');
  const end = of('gyeol')[0];
  assert.equal(end.color, '#1428a0'); // 삼성 남색
  assert.ok(parts.every(p => p === end || lum(p.color) > lum(end.color)), '결이 가장 짙다');
});

test('목록에서 뺀 목차도 자리는 있다(색은 그 자리의 기본 색) — 모르는 목차는 전개(승)', () => {
  assert.equal(M.arc.partArc('summary').stage.mark, '기');
  assert.equal(M.arc.partArc('cost').stage.mark, '전');
  assert.equal(M.arc.partArc('tech').stage.mark, '승');
  assert.equal(M.arc.partArc('없는목차').stage.mark, '승');
  assert.equal(M.arc.partArc('cost').own, false);
  assert.ok(M.arc.partArc('cost').order > M.arc.partArc('why').order);
  assert.equal(M.arc.tint('#000000', 0.5), '#808080');
});
