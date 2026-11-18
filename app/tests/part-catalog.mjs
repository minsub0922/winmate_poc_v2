// Storyboard 가 쓰는 관리자 「전체 파트」 정의(domain/templates/part_catalog.js) — 관리자 목록과 같은가 · DSS 로 파트를 뺀 구성(변형)이 덱으로 조립되는가.
// 실행: node --test app/tests/part-catalog.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { build } = require('esbuild');
const root = fileURLToPath(new URL('../../', import.meta.url));
const entry = `export * from './app/web/src/domain/templates/toc_templates.js';
export * from './app/web/src/domain/templates/part_catalog.js';
export { PART_CATALOG } from './admin/web/src/part-flows.js';
export { partArc } from './admin/web/src/part-arc.js';`;
const built = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
await M.loadTocContent();
const ALL_DSS = new Set(['products', 'solutions', 'subscriptions', 'services']);
const subsets = (xs) => Array.from({ length: 1 << xs.length }, (_, m) => xs.filter((_, i) => m & (1 << i)));

const BR = ['svc-sac', 'svc-mobile', 'svc-sub'];
const svcSheets = (s) => { const g = s.flow.find((x) => / 서비스$/.test(x.name)); return g ? g.slides.map((x) => x.f).filter((f) => !/^L_VS_DIV/.test(f)) : null; };

test('파트 이름은 관리자 목록 이름과 같다 — 제품 제안 · 서비스 제안(2026-11-17)', () => {
  assert.deepEqual(M.PART_LABEL, M.PART_CATALOG.names);
  assert.equal(M.partLabel('space'), '제품 제안'); assert.equal(M.partLabel('svc'), '서비스 제안'); assert.equal(M.partLabel('why'), 'Why Samsung');
});

test('파트 10개 · 관리자 목록 순서(기 → 승 → 전 → 결) — 구독 상품 제안은 서비스 제안의 갈래로', () => {
  const key = (k) => (M.PART_CATALOG.keys && M.PART_CATALOG.keys[k]) || k;
  const order = [...M.CATALOG_PARTS].sort((a, b) => M.partArc(key(a)).order - M.partArc(key(b)).order);
  assert.equal(M.CATALOG_PARTS.length, 10);
  assert.ok(!M.CATALOG_PARTS.includes('subx') && M.PART_CATALOG.hidden.includes('subx'));
  assert.deepEqual(M.CATALOG_PARTS, order);
  for (const k of M.CATALOG_PARTS) { assert.ok(M.TOCS[k], k); assert.ok(M.partArc(key(k)).own, '관리자 목록에 색이 정해진 파트: ' + k); assert.ok(!M.PART_CATALOG.hidden.includes(k), '관리자 목록에서 뺀 파트: ' + k); }
});

test('DSS 파트는 제품 제안 · 솔루션 제안 · (예전 구성의) 구독 상품 제안 — 서비스 제안은 갈래로', () => {
  assert.deepEqual(M.DSS_PARTS, { space: 'products', sol: 'solutions', subx: 'subscriptions' });
  assert.deepEqual(M.SERVICE_BRANCHES.map((b) => b.id), ['sac', 'mobile', 'sub']);
  assert.deepEqual(M.SVC_BRANCHES, ['sac', 'mobile', 'sub'], '덱 조립과 같은 순서');
});

test('기본 · 상세 제안 — DSS 에 따라 DSS 파트 · 서비스 갈래만 빠지고, 나머지 · 순서는 관리자 구성 그대로', () => {
  for (const tid of ['basic', 'detail']) {
    const T = M.TPL[tid];
    for (const lack of subsets([...ALL_DSS, ...BR])) {
      const L = new Set(lack);
      const v = M.dssVariant(T, L);
      const svcOn = T.tocs.includes('svc') ? ['sac', 'mobile', 'sub'].filter((b) => !L.has('svc-' + b)) : null;
      const drop = T.tocs.filter((k) => (M.DSS_PARTS[k] && L.has(M.DSS_PARTS[k])) || (k === 'svc' && svcOn && !svcOn.length));
      const want = T.tocs.filter((k) => !drop.includes(k));
      assert.deepEqual(v.tocs, want.length >= 4 ? want : T.tocs, tid + ' ' + lack.join());
      assert.equal(v.tocs.at(-1), 'pspec', '제품 스펙은 맨 끝');
      if (v !== T) { assert.equal(v.name, T.name); assert.equal(v.deck, T.deck); assert.equal(Object.getPrototypeOf(v), T, '이름은 관리자 구성을 그대로 따른다'); }
      if (v.tocs.includes('svc')) assert.deepEqual(v.dss ? v.dss.svc || ['sac', 'mobile', 'sub'] : ['sac', 'mobile', 'sub'], svcOn, tid + ' 갈래 ' + lack.join());
    }
  }
  assert.equal(M.dssVariant(M.TPL.detail, new Set(BR)), M.TPL.detail, '상세 제안에는 서비스 제안이 없다');
});

test('변형 id 는 다시 열어도 같은 구성으로 찾는다 · 예전 변형(구독 상품 제안을 뺀) id 는 지금 구성으로', () => {
  assert.deepEqual(M.parseVariant('basic~sol.svc'), { base: 'basic', drop: ['sol', 'svc'] });
  assert.equal(M.parseVariant('basic'), null);
  assert.equal(M.variantId('basic', ['svc-sub', 'svc', 'sol', 'svc-sac']), 'basic~sol.svc.svc-sac.svc-sub', '뺀 파트는 목록 순서로, 갈래는 그 뒤 갈래 순서로');
  delete M.TPL['basic~sol.svc'];
  assert.deepEqual(M.tplOf('basic~sol.svc').tocs, ['overview', 'needs', 'space', 'case', 'pspec']);
  assert.equal(M.tplOf('basic~subx'), M.TPL.basic, '구독 상품 제안이 서비스 제안으로 들어가기 전의 변형 — 지금 기본 제안');
  assert.deepEqual(M.tplOf('basic~svc-sac.svc-mobile.svc-sub').tocs, M.TPL.basic.tocs.filter((k) => k !== 'svc'), '갈래가 모두 빠지면 파트도');
  assert.equal(M.tplOf('nope~sol'), null);
  assert.equal(M.registerVariant('build~space.sol'), null, '파트가 4개보다 적어지는 변형은 만들지 않는다');
  assert.equal(M.dssVariant(M.TPL.build, ALL_DSS), M.TPL.build, '그때는 그 구성 그대로');
});

test('서비스 제안 갈래 덱 — 고른 갈래의 장만(케어 SAC · 비즈니스 · 구독 흐름), 솔루션 파트에는 서비스 장이 없다', () => {
  const SUB8 = ['L_SUB_PAIN', 'L_SUB_VALUE3', 'L_SUB_COMPARE', 'L_SUB_PKG', 'L_SUB_CARE4', 'L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3'];
  const norm = (fs) => fs.map((f) => f.replace(/^L_SUB_PKG\d$/, 'L_SUB_PKG'));
  assert.deepEqual(norm(svcSheets(M.ensureTocScenario('basic', 'fb_qsr'))), ['L_TOC_SVC_SAC', 'L_TOC_SVC_MOBILE', ...SUB8], '관리자 구성 그대로 — 갈래 셋');
  assert.deepEqual(norm(svcSheets(M.ensureTocScenario(M.variantId('basic', ['svc-mobile', 'svc-sub']), 'fb_qsr'))), ['L_TOC_SVC_SAC'], '케어 + 공조');
  assert.deepEqual(norm(svcSheets(M.ensureTocScenario(M.variantId('basic', ['svc-sac', 'svc-sub']), 'fb_qsr'))), ['L_TOC_SVC_MOBILE'], '케어 + 갤럭시 모바일');
  const sub = M.ensureTocScenario(M.variantId('basic', ['svc-sac', 'svc-mobile']), 'fb_qsr');
  assert.deepEqual(norm(svcSheets(sub)), SUB8, '구독만 — 구독 상품 제안의 흐름');
  assert.ok(M.tplOf('basic~svc'), '예전 변형 id(서비스를 뺀) — 찾으면 TPL 에 올라간다');
  const s = M.ensureTocScenario('basic~svc', 'fb_qsr');
  assert.ok(s, '덱 조립');
  const body = s.flow.filter((g) => !g.deck);
  assert.equal(body.length, 6);
  const sol = body[3];
  assert.match(sol.name, /솔루션/);
  assert.ok(sol.slides.length > 1 && sol.slides.every((x) => !/^L_VS_SOL_SVC/.test(x.f)), '솔루션 파트에 서비스 장: ' + sol.slides.map((x) => x.f).join());
  assert.ok(!s.flow.some((g) => g.slides.some((x) => /^L_SUB_|^L_TOC_SVC_/.test(x.f))), '구독 · 서비스 장이 남아 있음');
  assert.equal(s.flow[0].slides.map((x) => x.f).find((f) => /^L_TOC_INDEX/.test(f)), 'L_TOC_INDEX6', '목차 장은 파트 수(6)');
});
