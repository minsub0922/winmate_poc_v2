// 「전체 파트」 팝업의 업종별 고정 Overview 시트 — admin/web/src/overview-sheets.json · overview-industry.jsx · part-flows.js(PART_CATALOG.industry)
//   node admin/tests/overview-sheets.mjs
// 규칙(2026-11-16 사용자): Overview 는 업종마다 쓰는 제품 · 솔루션이 크게 다르다 → 업종마다 레이아웃(서로 다르되 비슷하게)과 내용이 다른 고정 시트.
//   업종은 너무 잘게 나누지 않는다(중소형 병의원 · 대형 병원 = 같은 병원, 학교와 오피스는 다름). 내용은 수정되지 않는다.
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
export { default as DATA } from './admin/web/src/overview-sheets.json';
export * from './admin/web/src/part-flows.js';
export * as ind from './admin/web/src/overview-industry.jsx';
export { localPreview } from './admin/web/src/local-previews.js';`;
const built = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', nodePaths: [root + 'app/web/node_modules'],
  loader: { '.json': 'json', '.css': 'empty' }, logLevel: 'error', define: { 'process.env.NODE_ENV': '"production"' } });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
await M.toc.loadTocContent();
const verts = M.toc.tocVerticals();
const sheets = M.DATA.sheets;
const S = Object.fromEntries(sheets.map(s => [s.id, s]));
const count = (text, re) => (text.match(re) || []).length;

test('업종 묶음 — 앱의 업종 묶음 전부, 세부 업종은 꼭 한 묶음에', () => {
  const groups = [...new Set(verts.map(v => v.g))];
  assert.deepEqual(sheets.map(s => s.id), groups);
  for (const s of sheets) {
    assert.deepEqual(s.verticals, verts.filter(v => v.g === s.id).map(v => v.id), s.id);
    assert.equal(s.name, verts.find(v => v.g === s.id).gn, s.id);
  }
  assert.equal(sheets.reduce((n, s) => n + s.verticals.length, 0), verts.length);
});

test('너무 잘게 나누지 않는다 — 대형 병원 · 중소 병원 · 의원은 같은 의료, 학교와 오피스는 다른 업종', () => {
  assert.deepEqual(S.MD.verticals, ['md_tertiary', 'md_hospital', 'md_clinic', 'md_ltc']);
  assert.equal(S.MD.name, '의료');
  assert.ok(S.ED.verticals.includes('ed_k12') && S.ED.verticals.includes('ed_univ'));
  assert.ok(S.OF.verticals.every(v => v.startsWith('of_')));
  assert.ok(sheets.length < verts.length / 2, `업종 ${sheets.length}곳 · 세부 업종 ${verts.length}곳`);
  const names = s => JSON.stringify([s.devices.map(d => d.name), s.solutions.map(d => d.name)]);
  assert.notEqual(names(S.ED), names(S.OF));
  assert.ok(S.ED.solutions.some(x => x.name === '갤럭시 클래스룸') && !S.OF.solutions.some(x => x.name === '갤럭시 클래스룸'));
  assert.ok(S.MD.solutions.some(x => x.name === '병원 안내 · 업무 솔루션'));
});

test('업종마다 내용이 다르다 — 디바이스 3–8 · 솔루션 2–8 · 서비스 3, 과반 규칙', () => {
  const seen = new Set();
  for (const s of sheets) {
    assert.ok(s.devices.length >= 3 && s.devices.length <= 8, s.id);
    assert.ok(s.solutions.length >= 2 && s.solutions.length <= 8, s.id);
    assert.equal(s.services.length, 3, s.id);
    assert.deepEqual(s.shape, { devices: s.devices.length, solutions: s.solutions.length, services: 3, deviceColumns: s.devices.length > 5 ? 2 : 1, solutionColumns: s.solutions.length > 5 ? 2 : 1 }, s.id);
    assert.equal(new Set(s.devices.map(d => d.name)).size, s.devices.length, s.id);
    assert.equal(new Set(s.solutions.map(d => d.name)).size, s.solutions.length, s.id);
    // 과반이 쓰는 것이 모자라 순위로 채운 것(금융)만 과반이 아닐 수 있다 — 그래도 적어도 한 세부 업종은 쓴다
    for (const x of [...s.devices, ...s.solutions]) assert.ok(x.spaces >= 1 && x.verticals >= 1 && x.verticals <= s.verticals.length, s.id + ' ' + x.name);
    assert.ok(!s.solutions.some(x => /^svc_/.test(x.key)), s.id + ' 서비스는 SERVICE 줄에');
    seen.add(JSON.stringify([s.devices.map(d => d.name), s.solutions.map(d => d.name)]));
  }
  assert.equal(seen.size, sheets.length, '업종마다 디바이스 · 솔루션 구성이 다르다');
});

test('업종마다 레이아웃이 다르되 같은 계열 — 칸 수가 내용 수와 같고, 틀(DEVICE · 도식 · SOLUTION · SERVICE)은 같다', () => {
  const shapes = new Set(sheets.map(s => `${s.shape.devices}/${s.shape.solutions}`));
  assert.ok(shapes.size >= 8, [...shapes].join(' '));
  assert.equal(new Set(sheets.map(s => s.layout)).size, sheets.length);
  for (const s of sheets) {
    assert.equal(s.layout, 'L_VS_DSS_' + s.id); assert.equal(s.code, 'VS-DSS-' + s.id);
    assert.match(s.html, /^<div data-proposal-typography="2" style="width: 1280px; height: 720px;/);
    assert.equal(count(s.html, /data-img="\d+"/g), s.devices.length, s.id + ' 제품 컷 수');
    for (const w of ['>01 · OVERVIEW<', '>DEVICE<', '>SOLUTION<', '>SERVICE<', '>Device<', '>Solution<', '>Service<', 'AI 비즈니스', `>${s.place}에 필요한 AI, Device · Solution · Service로 한 번에<`]) assert.ok(s.html.includes(w), s.id + ' ' + w);
    for (const x of [...s.devices, ...s.solutions]) assert.ok(s.html.includes('>' + x.name + '<'), s.id + ' ' + x.name);
    for (const x of s.services) assert.ok(s.html.includes('>' + x + '<'), s.id + ' ' + x);
    // 내용이 정해진 시트 — 빈 예시 글(디바이스 · 솔루션 · 서비스 · 부제)이나 채울 표식이 남지 않는다
    assert.doesNotMatch(s.html, />(디바이스|솔루션|서비스|부제|제목)<|\[0+\]|확인 필요/, s.id);
    assert.doesNotMatch(s.html, /<script|\son[a-z]+=|href=/i, s.id);
  }
});

test('솔루션 이름 앞에는 그 솔루션의 아이콘 — 구분 점은 쓰지 않는다', () => {
  const iconOf = new Map(); // 솔루션 → 아이콘: 어느 업종에서든 같은 아이콘, 솔루션끼리는 서로 다른 아이콘
  for (const s of sheets) {
    for (const x of s.solutions) {
      assert.match(x.icon, /^[a-z]+$/, s.id + ' ' + x.name);
      if (iconOf.has(x.key)) assert.equal(iconOf.get(x.key), x.icon, x.name); else iconOf.set(x.key, x.icon);
    }
    // 아이콘 칸(옅은 파랑 네모 + 선 그림)이 솔루션 수만큼 — 이름 바로 앞
    const chips = s.html.match(/border-radius: (?:8|10)px; background: #eaeefb; display: flex; align-items: center; justify-content: center; pointer-events: none;"><svg width="(?:18|22|26)"/g) || [];
    assert.equal(chips.length, s.solutions.length, s.id + ' 아이콘 수');
    for (const x of s.solutions) assert.match(s.html, new RegExp('<svg width="(?:18|22|26)"[^>]*><path d="[^"]+"></path></svg></div><div style="[^"]*" data-tb="\\d+" data-type-role="(?:body|dense)">' + x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<'), s.id + ' ' + x.name);
    // 구분 점(8px 파란 원)은 이음선 끝의 둘뿐 — 솔루션 줄에는 없다
    assert.equal(count(s.html, /width: 8px; height: 8px; box-sizing: border-box; border-radius: 50%; background: #1428a0;/g), 2, s.id + ' 구분 점');
  }
  assert.equal(new Set(iconOf.values()).size, iconOf.size, '솔루션마다 다른 아이콘');
  assert.ok(iconOf.size >= 18, `쓰인 솔루션 ${iconOf.size}종`);
  assert.equal(iconOf.get('s_knox'), 'shield'); assert.equal(iconOf.get('s_hospital'), 'cross'); assert.equal(iconOf.get('s_meeting'), 'calendar');
});

test('가운데 도식 — 삼성 AI 비즈니스를 Device · Solution · Service 가 둘러싸고 저마다 자기 영역으로 이어진다', () => {
  for (const s of sheets) {
    for (const w of ['>SAMSUNG<', '>AI 비즈니스<', '>Device<', '>Solution<', '>Service<', 'radial-gradient(circle,', 'linear-gradient(150deg,', 'stroke-dasharray="0.1 8"']) assert.ok(s.html.includes(w), s.id + ' ' + w);
    assert.doesNotMatch(s.html, /삼성\nAI 비즈니스/, s.id);
    // 이음선 셋(왼쪽 · 오른쪽 가로, 아래 세로) — 두께 2px
    assert.equal(count(s.html, /height: 2px; box-sizing: border-box; background: #c5cde6;/g), 2, s.id);
    assert.equal(count(s.html, /width: 2px; height: \d+px; box-sizing: border-box; background: #c5cde6;/g), 1, s.id);
    assert.equal(count(s.html, /<svg/g), s.solutions.length + 5, s.id + ' 그림 수(솔루션 아이콘 + 궤도 + AI 표식 + 마디 셋)');
  }
});

test('그림 — 제품 컷은 파일에 담긴다(표식 → 그림), 원래 주소도 남긴다', () => {
  const used = new Set(sheets.flatMap(s => s.html.match(/@img\d+@/g) || []));
  assert.deepEqual([...used].sort(), Object.keys(M.DATA.images).sort());
  assert.deepEqual(Object.keys(M.DATA.sources).sort(), Object.keys(M.DATA.images).sort());
  for (const v of Object.values(M.DATA.images)) assert.match(v, /^data:image\/webp;base64,[A-Za-z0-9+/=]{200,}$/);
  for (const s of sheets) for (const d of s.devices) assert.ok(Object.values(M.DATA.sources).includes(d.image), s.id + ' ' + d.image);
});

test('미리보기 — 번들에 실린 시트를 서버에 묻지 않고 준다(스크립트 · 바깥 주소 없는 문서)', async () => {
  assert.equal(M.localPreview('L_VS_DSS_MD', true), null); // 시트를 받기 전
  const book = await M.ind.loadOverviewSheets();
  assert.equal(book.sheets.length, sheets.length);
  assert.ok(book.sheets.every(s => s.html === undefined), '시트 목록에는 HTML 을 싣지 않는다');
  const html = M.localPreview('L_VS_DSS_MD', true);
  assert.match(html, /^<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:;/);
  assert.ok(html.includes('병원에 필요한 AI'));
  assert.doesNotMatch(html, /@img\d+@/);
  assert.equal(count(html, /src="data:image\/webp;base64,/g), S.MD.devices.length);
  assert.equal(M.localPreview('L_VS_DSS', true), null); // 서버에 있는 레이아웃은 서버가 준다
  assert.equal(M.localPreview('L_VS_DSS_XX', true), null);
});

test('파트 목록 — Overview 는 업종별 고정(industry): 그 장에 고른 업종의 시트를 얹고 내용 고정으로 표시한다', async () => {
  const flows = M.partFlows(M.toc, { FILLS: M.FILLS, FILL_CUSTOMER: M.FILL_CUSTOMER, SWAPS: M.SWAPS });
  const C = M.curateParts(flows);
  const ov = C.parts.find(p => p.key === 'overview');
  assert.equal(ov.kind, 'industry');
  assert.deepEqual(ov.industry, { fam: 'L_VS_DSS' });
  assert.deepEqual(ov.slots.map(x => [x.fam, !!x.industry]), [['L_VS_DIV', false], ['L_VS_DSS', true]]);
  assert.deepEqual(C.parts.filter(p => p.kind === 'industry').map(p => p.key), ['overview']);
  assert.ok(M.KIND.industry.label === '업종별 고정' && M.KIND_ORDER.includes('industry') && M.ORDERED.has('industry'));
  assert.equal(flows.find(p => p.key === 'overview').kind, 'flow'); // 잰 값(실제 덱)은 그대로 — 목록 정의만 얹는다
  const book = await M.ind.loadOverviewSheets();
  const q = M.ind.withIndustrySheet(ov, book.byId.ED);
  assert.deepEqual(q.slots.map(x => [x.f, !!x.sheet, !!x.fixed]), [[ov.slots[0].f, false, false], ['L_VS_DSS_ED', true, true]]);
  assert.equal(q.slots[1].sheet.name, '교육'); assert.equal(q.slots[1].fixedBy, 'industry');
  assert.deepEqual(q.slots[1].fs, ['L_VS_DSS_ED']);
  assert.equal(M.ind.withIndustrySheet(C.parts.find(p => p.key === 'why'), book.byId.ED).slots.some(x => x.sheet), false);
  const meta = M.ind.sheetMeta(book.byId.ED);
  assert.equal(meta.code, 'VS-DSS-ED'); assert.match(meta.name, /교육 고정 시트 \(디바이스 8 · 솔루션 8 · 서비스 3\)/); assert.match(meta.when, /채우거나 고치지 않고/);
});
