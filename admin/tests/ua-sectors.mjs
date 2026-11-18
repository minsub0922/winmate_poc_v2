// 「전체 파트」 팝업의 당사의 이해 — 업종 묶음마다 다른 이해 항목 · 새 장: admin/web/src/ua-catalog.json · ua-sectors.js · ua-industry.jsx · part-flows.js(PART_CATALOG.sector)
//   node admin/tests/ua-sectors.mjs
// 규칙(2026-11-16 사용자): 당사의 이해는 파트는 하나지만 업종에 따라 크게 다르다 → 이 파트만 이름 오른쪽에 업종 드롭다운.
//   업종은 크게 묶는다(중소형 병의원 · 대형 병의원은 같게, 학교와 오피스는 다르게). 업종마다 요구하는 이해 항목이 다르므로 묶음마다 따로 만든다.
//   기존 레이아웃은 쓰지 않고 장을 모두 새로 만든다. (지금은 목록만 — 실제 덱 · 앱 레이아웃 목록은 그대로)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + 'app/web/package.json');
const { build } = require('esbuild');
const entry = `export * as toc from './app/web/src/domain/templates/toc_templates.js';
export { TOC_META } from './app/web/src/domain/templates/toc_layouts.js';
export { FILLS, FILL_CUSTOMER } from './app/web/src/domain/templates/scenario_fills.js';
export { default as SWAPS } from './app/web/src/domain/templates/scenario_image_swaps.json';
export { default as DATA } from './admin/web/src/ua-catalog.json';
export * from './admin/web/src/part-flows.js';
export * as ua from './admin/web/src/ua-sectors.js';
export * as screen from './admin/web/src/ua-industry.jsx';
export { localPreview } from './admin/web/src/local-previews.js';`;
const built = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', nodePaths: [root + 'app/web/node_modules'],
  loader: { '.json': 'json', '.css': 'empty' }, logLevel: 'error', define: { 'process.env.NODE_ENV': '"production"' } });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
await M.toc.loadTocContent();
const verts = M.toc.tocVerticals();
const D = M.DATA; const C = Object.fromEntries(D.clusters.map(c => [c.id, c]));
const book = M.ua.sectorBook(D);
const flows = M.partFlows(M.toc, { FILLS: M.FILLS, FILL_CUSTOMER: M.FILL_CUSTOMER, SWAPS: M.SWAPS });
const curated = M.curateParts(flows);
const UA = curated.parts.find(p => p.key === 'ua');
const names = Object.fromEntries(verts.map(v => [v.id, v.nm]));
const textOf = html => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// 장의 갈래 — know: 고객 이해 항목(묶음마다 4), compete: 경쟁 우위(묶음마다 3: 경쟁 구도 · 통합 솔루션 → 핵심 스펙 → 같은 업종 사례)
const know = c => c.sheets.filter(x => x.group !== 'compete');
const compete = c => c.sheets.filter(x => x.group === 'compete');
/** 칸 이름으로 그 칸의 글을 읽는다 */
const slot = (L, name) => { const i = L.slots.t[name]; assert.ok(i != null, name + ' 칸이 없다'); const m = new RegExp(`data-tb="${i}">([^<]*)<`).exec(L.html); return m ? m[1].replace(/&amp;/g, '&') : null; };

test('업종 묶음 — 세부 업종 44곳이 꼭 한 묶음에, 묶음은 크게(앱의 업종 묶음 20곳보다 적게)', () => {
  const all = D.clusters.flatMap(c => c.verticals);
  assert.deepEqual([...all].sort(), verts.map(v => v.id).sort());
  assert.equal(new Set(all).size, all.length, '한 업종이 두 묶음에 들지 않는다');
  assert.ok(D.clusters.length < new Set(verts.map(v => v.g)).size, '앱의 업종 묶음보다 크게 묶는다');
  assert.equal(D.clusters.length, 12);
  assert.equal(new Set(D.clusters.map(c => c.name)).size, D.clusters.length);
  // 앱의 업종 묶음(g)은 쪼개지 않는다 — 한 묶음의 세부 업종은 모두 같은 큰 묶음에
  for (const g of new Set(verts.map(v => v.g))) {
    const inG = verts.filter(v => v.g === g).map(v => v.id);
    assert.equal(new Set(inG.map(id => D.clusters.find(c => c.verticals.includes(id)).id)).size, 1, g);
  }
});

test('크게 묶는다 — 대형 · 중소 병원 · 의원 · 요양은 같은 병의원, 학교와 오피스는 다른 묶음', () => {
  assert.deepEqual(C.MD.verticals, ['md_tertiary', 'md_hospital', 'md_clinic', 'md_ltc']);
  assert.equal(C.MD.name, '병의원');
  const of = id => D.clusters.find(c => c.verticals.includes(id)).id;
  assert.equal(of('ed_k12'), 'ED'); assert.equal(of('ed_univ'), 'ED'); assert.equal(of('of_hq'), 'OF'); assert.equal(of('of_sme'), 'OF');
  assert.notEqual(of('ed_k12'), of('of_hq'));
  // 비슷한 시설은 한 묶음 — 전시 · 공연 · 경기장 · 피트니스, 리테일 · 생활 서비스 · 통신 매장, 공공 · 교통 · 국방
  assert.equal(new Set(['tp_museum', 'vn_stadium', 'vn_cinema', 'sf_fitness'].map(of)).size, 1);
  assert.equal(new Set(['rt_hyper', 'sv_laundry', 'oe_telco'].map(of)).size, 1);
  assert.equal(new Set(['pb_agency', 'pb_transport', 'mi_military'].map(of)).size, 1);
});

test('묶음마다 이해 항목이 다르다 — 항목 이름 · 장이 묶음끼리 겹치지 않는다', () => {
  const sets = D.clusters.map(c => know(c).map(s => s.label));
  for (const c of D.clusters) {
    assert.ok(know(c).length >= 3 && know(c).length <= 6, c.id);
    assert.equal(new Set(c.sheets.map(s => s.label)).size, c.sheets.length, c.id + ' 항목 이름이 겹친다');
    assert.ok(c.goal && c.cust, c.id);
  }
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    const same = sets[i].filter(x => sets[j].includes(x));
    assert.ok(same.length <= 1, `${D.clusters[i].id} ↔ ${D.clusters[j].id} 항목이 거의 같다: ${same.join(' · ')}`);
  }
  // 업종에 맞는 항목 — 병의원: 환자 여정 · 구역, 학교: 학사 일정 · 예산 · 조달, 오피스: 층별 구성 · 회의
  assert.deepEqual(know(C.MD).map(s => s.label), ['병상 · 진료 규모', '환자 여정 · 대기', '구역 구성', '인증 · 감염 · 시스템']);
  assert.deepEqual(know(C.ED).map(s => s.label), ['학생 · 학급 규모', '학사 일정', '교실 · 기자재', '예산 · 조달']);
  assert.deepEqual(know(C.OF).map(s => s.label), ['인원 · 근무 방식', '층별 구성', '회의 · 협업', 'IT · 보안 · ESG']);
});

test('장은 모두 새로 — 기존 레이아웃을 쓰지 않고, 묶음마다 제 장(L_TOC_UA_<묶음>_<항목>)', () => {
  const registry = new Set(M.TOC_META.map(m => m.f));
  const used = D.clusters.flatMap(c => c.sheets.map(s => s.f));
  assert.equal(used.length, 84); // 묶음 12 × (이해 항목 4 + 경쟁 우위 3)
  assert.equal(new Set(used).size, used.length, '한 장을 두 묶음이 같이 쓰지 않는다');
  assert.deepEqual([...used].sort(), Object.keys(D.layouts).sort());
  for (const c of D.clusters) for (const s of c.sheets) {
    assert.match(s.f, new RegExp(`^L_TOC_UA_${c.id}_[A-Z]+$`), s.f);
    assert.ok(!registry.has(s.f), s.f + ' — 앱 레이아웃 목록에 이미 있는 장');
    assert.doesNotMatch(s.f, /^L_TOC_(UAPROF|UAPAIN|TRLINE|TRSHARE|TRSTAT|TRKEY|CPSCORE|CPWIN|CPPOS|CPMATRIX|CPMAP)$/);
  }
  // 이해 항목 장은 모양도 서로 다르다 — 같은 HTML 뼈대(글을 뺀 것)를 두 장이 쓰지 않는다 (경쟁 우위 장은 틀이 같고 업종마다 축 · 근거가 다르다 — 아래 따로 본다)
  const bones = D.clusters.flatMap(c => know(c).map(x => x.f)).map(f => D.layouts[f].html.replace(/>[^<]+</g, '><').replace(/data-fill="[^"]*"/g, ''));
  assert.equal(bones.length, 48);
  assert.equal(new Set(bones).size, bones.length);
});

test('장의 내용 — 눈썹 · 제목 · 꼬리말, 숫자는 00(자리표시 [00] · [확인 필요] 없음), 칸 이름', () => {
  for (const c of D.clusters) for (const s of c.sheets) {
    const L = D.layouts[s.f]; const text = textOf(L.html);
    assert.match(text, /01 · 시장 분석 \(MI\) · /, s.f); // 목록에서 쓰는 파트 이름(앱의 목차 이름은 '당사의 이해')
    assert.ok(text.includes(`${c.cust} · `), s.f + ' 꼬리말에 묶음의 예시 고객');
    assert.match(text, /CONFIDENTIAL · \d/, s.f);
    assert.doesNotMatch(text, /\[00\]|\[0\]|\[확인 필요\]|\[평가\]/, s.f + ' 자리표시가 남았다');
    assert.equal(s.zero, /(?<!\d)00(?!\d)/.test(text), s.f + ' zero 표시');
    for (const k of ['eb', 'title', 'foot', 'conf']) assert.ok(k in L.slots.t, s.f + ' 칸 이름 ' + k);
    assert.equal(L.code, s.f.slice(2).replace(/_/g, '-'));
    assert.ok(L.when && L.name.startsWith(c.name + ' · '), s.f);
    assert.match(L.html, /^<div data-proposal-typography="2" style="width: 1280px; height: 720px;/, s.f); // 글자 역할을 구운 장
    for (const size of L.html.match(/font-size: [\d.]+px/g) || []) assert.ok([12, 14, 16, 18, 20, 24, 32, 40, 48, 56].includes(parseFloat(size.slice(11))), s.f + ' ' + size);
  }
  assert.ok(D.clusters.flatMap(c => c.sheets).filter(s => s.zero).length >= 40, '숫자를 직접 넣는 장이 대부분');
});

test('목록 정의 — 당사의 이해는 업종마다 다름(sector), 장에 차례 번호', () => {
  assert.deepEqual(M.PART_CATALOG.sector, { ua: {} });
  assert.equal(UA.kind, 'sector');
  assert.ok(UA.sector);
  assert.ok(M.KIND.sector.label && M.KIND_ORDER.includes('sector') && M.ORDERED.has('sector'));
  assert.equal(flows.find(p => p.key === 'ua').kind, 'template', '잰 값은 그대로(실제 덱은 구성마다 고른 기존 장)');
  assert.deepEqual(curated.parts.filter(p => p.sector).map(p => p.key), ['ua'], '이 파트만');
});

test('묶음을 고르면 — 간지(항목 수만큼 줄) + 항목마다 새 장, 이 순서로', () => {
  assert.equal(M.ua.withSector(UA, null, '').pending, true);
  assert.deepEqual(M.ua.withSector(UA, null, '').slots, []);
  const first = M.ua.withSector(UA, book, '', names);
  assert.equal(first.cluster.id, D.clusters[0].id, '고르기 전에는 첫 묶음');
  for (const c of D.clusters) {
    const p = M.ua.withSector(UA, book, c.id, names);
    assert.deepEqual(p.slots.map(x => x.f), ['L_VS_DIV_R6', ...c.sheets.map(s => s.f)], c.id); // 간지는 여섯 줄까지(항목 7 → R6)
    assert.equal(M.ua.dividerOf(c.sheets.length), 'L_VS_DIV_R6');
    assert.deepEqual(p.slots.slice(1).map(x => x.group), ['know', 'know', 'know', 'know', 'compete', 'compete', 'compete'], c.id);
    assert.ok(p.slots.filter(x => x.group === 'compete').every(x => /경쟁사 칸은 조사한 내용/.test(x.content)));
    assert.deepEqual(p.slots.map(x => x.step), p.slots.map((x, i) => i + 1));
    assert.equal(p.slots[0].fam, 'L_VS_DIV');
    assert.deepEqual(p.slots.slice(1).map(x => x.role), c.sheets.map(s => s.label));
    assert.deepEqual(p.slots.slice(1).map(x => x.zero), c.sheets.map(s => s.zero));
    assert.ok(p.slots.every(x => x.n.min === 1 && x.n.max === 1 && !x.fixed));
    assert.ok(p.slots.slice(1).every(x => x.sector === c.id && x.meta && x.meta.code && x.content));
    assert.deepEqual(p.sheets, { min: c.sheets.length + 1, max: c.sheets.length + 1 });
    assert.equal(p.goal, c.goal); assert.equal(p.kind, 'sector'); assert.deepEqual(p.tpls, UA.tpls);
    assert.deepEqual(p.cluster.verticals, c.verticals.map(id => ({ id, nm: names[id] })));
  }
  assert.equal(M.ua.withSector(flows.find(p => p.key === 'why'), book, 'MD').sector, undefined, '다른 파트는 그대로');
});

/* ---------- 경쟁 우위 (사용자 지시 2026-11-16: "각 업종마다 경쟁사 관련 내용도 추가해. 경쟁사 대비 좋은 것을 보여주는게 매우 중요해.
   이는 통합 솔루션, 제품의 핵심 스펙기반 key message, 여러 사례 등이 근거가 돼서 경쟁력을 표현해. 업종에 맞게 설계하고 제작해") ---------- */
const CONTENT = M.toc.tocContent();
const vOf = id => CONTENT.v[id];
/** 묶음의 업종들에 실제로 있는 제품 · 솔루션 이름 / 경쟁 유형 / 표준 제안서의 공식 도입사례 이름 */
const productsOf = c => new Set(c.verticals.flatMap(id => [...vOf(id).bom.cols.map(x => x[0]), ...vOf(id).spec.map(x => x.nm)]));
const solutionsOf = c => new Set(c.verticals.flatMap(id => [...vOf(id).tech.map(x => x.nm), ...vOf(id).pp.vps.filter(x => x.k === 's').map(x => x.nm)]));
const rivalsOf = c => new Set(c.verticals.flatMap(id => [CONTENT.g[vOf(id).g].cs.a, CONTENT.g[vOf(id).g].cs.b]));
const casesOf = c => new Set(c.verticals.flatMap(id => M.toc.stdDeck(id).st.case.items.filter(x => x.f === 'L_VS_CASE').map(x => x.o.t[1])));

test('경쟁 우위 — 묶음마다 이해 항목 뒤에 3장: 경쟁 구도 · 통합 솔루션 → 핵심 스펙 → 같은 업종 사례', () => {
  for (const c of D.clusters) {
    assert.deepEqual(c.sheets.map(x => x.group), ['know', 'know', 'know', 'know', 'compete', 'compete', 'compete'], c.id);
    assert.deepEqual(compete(c).map(x => x.f), ['RIVAL', 'EDGE', 'PROOF'].map(k => `L_TOC_UA_${c.id}_${k}`), c.id);
    assert.deepEqual(compete(c).map(x => x.label), ['경쟁 구도 · 통합 솔루션', '핵심 스펙', '같은 업종 사례'], c.id);
    assert.deepEqual(compete(c).map(x => x.zero), [false, true, true], c.id + ' — 경쟁사 숫자(스펙 값 · 사례 수)는 00, 작성자가 조사해 넣는다');
  }
  // 업종에 맞게 — 장의 글(제목 · 영역 · 제품 · 스펙 · 사례)이 묶음마다 다르다
  for (const k of ['RIVAL', 'EDGE', 'PROOF']) {
    const texts = D.clusters.map(c => textOf(D.layouts[`L_TOC_UA_${c.id}_${k}`].html).replace(/CONFIDENTIAL.*$/, ''));
    assert.equal(new Set(texts).size, 12, k);
    const titles = D.clusters.map(c => slot(D.layouts[`L_TOC_UA_${c.id}_${k}`], 'title'));
    assert.equal(new Set(titles).size, 12, k + ' 제목');
  }
});

test('근거 ① 통합 솔루션 — 업종의 영역마다 실제 제품, 하나로 묶는 실제 솔루션, 삼성은 전 영역 · 경쟁 유형은 일부', () => {
  const axes = [];
  for (const c of D.clusters) {
    const L = D.layouts[`L_TOC_UA_${c.id}_RIVAL`]; const products = productsOf(c); const solutions = solutionsOf(c);
    const areas = [0, 1, 2, 3, 4].map(i => slot(L, 'a' + i)); axes.push(areas.join('|'));
    assert.equal(new Set(areas).size, 5, c.id + ' 영역 5');
    for (let i = 0; i < 5; i++) { const nm = slot(L, 'p' + i); assert.ok(products.has(nm) || solutions.has(nm), `${c.id} — '${nm}' 은 이 업종 자료에 없는 제품 · 솔루션`); }
    const chips = ['so0', 'so1', 'so2'].filter(k => k in L.slots.t).map(k => slot(L, k));
    assert.ok(chips.length >= 2, c.id + ' 묶는 솔루션 2개 이상');
    for (const nm of chips) assert.ok(solutions.has(nm), `${c.id} — '${nm}' 은 이 업종 자료에 없는 솔루션`);
    assert.ok(Object.keys(L.slots.img).length >= 4, c.id + ' 제품 컷');
    assert.equal(slot(L, 'sc'), '5 / 5');
    for (const r of [0, 1]) {
      assert.ok(rivalsOf(c).has(slot(L, 'c' + r)), c.id + ' 경쟁 유형 이름(익명 — 유형만)');
      const n = +slot(L, `c${r}c`).split(' / ')[0];
      assert.ok(n >= 1 && n <= 3, `${c.id} 경쟁 유형 ${r} — ${n} / 5 (삼성 5 / 5 보다 적다)`);
      for (let i = 0; i < 5; i++) assert.doesNotMatch(slot(L, `c${r}_${i}`), /\d/, c.id + ' 경쟁사 칸에 숫자를 지어 적지 않는다');
    }
    assert.notEqual(slot(L, 'c0'), slot(L, 'c1'));
  }
  assert.equal(new Set(axes).size, 12, '영역 축은 업종마다 다르다');
});

test('근거 ② 핵심 스펙 key message — 대표 제품의 실제 스펙 값 셋 + 메시지, 경쟁 제품 값은 00', () => {
  const heroes = new Set();
  for (const c of D.clusters) {
    const L = D.layouts[`L_TOC_UA_${c.id}_EDGE`];
    const pp = c.verticals.map(id => vOf(id).pp).find(p => p.nm === slot(L, 'pn'));
    assert.ok(pp, `${c.id} — 대표 제품 '${slot(L, 'pn')}' 이 이 묶음 업종의 대표 제품이 아니다`);
    assert.equal(slot(L, 'pm'), pp.model || '');
    heroes.add(pp.nm);
    const values = pp.specs.map(x => x[1]);
    for (const i of [0, 1, 2]) {
      const v = slot(L, 'v' + i);
      assert.ok(values.some(x => x === v || x.includes(v)), `${c.id} — 스펙 값 '${v}' 이 제품 자료에 없다`);
      assert.ok(slot(L, 'm' + i).length >= 8, c.id + ' 메시지');
      assert.equal(slot(L, 'r' + i), '00', c.id + ' 경쟁 제품 값은 지어 적지 않는다');
    }
    assert.equal(new Set([0, 1, 2].map(i => slot(L, 'v' + i))).size, 3);
    assert.ok('pc' in L.slots.img, c.id + ' 제품 컷');
  }
  assert.ok(heroes.size >= 11, '대표 제품이 업종마다 다르다: ' + [...heroes].join(' · '));
});

test('근거 ③ 여러 사례 — 같은 업종의 공식 도입사례 셋(사진 · 도입한 것 · 포인트) + 다른 사례 이름, 경쟁사 사례 수는 00', () => {
  for (const c of D.clusters) {
    const L = D.layouts[`L_TOC_UA_${c.id}_PROOF`]; const cases = casesOf(c);
    const names = [0, 1, 2].map(i => slot(L, 'n' + i));
    assert.equal(new Set(names).size, 3, c.id);
    for (const n of names) assert.ok(cases.has(n), `${c.id} — '${n}' 은 이 묶음 업종의 표준 제안서에 실린 사례가 아니다`);
    for (const i of [0, 1, 2]) { assert.ok(slot(L, 'i' + i), c.id + ' 도입한 것'); assert.ok(slot(L, 'p' + i), c.id + ' 도입 포인트'); assert.match(slot(L, 'w' + i), /^\d{4}\. \d{2} · samsung\.com 도입사례$/); }
    const more = ['mo0', 'mo1', 'mo2'].filter(k => k in L.slots.t).map(k => slot(L, k));
    assert.ok(more.length >= 1, c.id + ' 다른 사례');
    for (const n of more) { assert.ok(cases.has(n), `${c.id} — '${n}'`); assert.ok(!names.includes(n)); }
    assert.equal(slot(L, 'rv'), '00');
    assert.equal(Object.keys(L.slots.img).length, 3);
    // 한 묶음 안에서 같은 사진을 두 번 쓰지 않는다(이해 항목 장의 사진과도)
    const photos = c.sheets.flatMap(x => [...D.layouts[x.f].html.matchAll(/data-fill="([^"]+)"[^>]*style="[^"]*object-fit: cover/g)].map(m => m[1]));
    assert.equal(new Set(photos).size, photos.length, c.id + ' 사진이 겹친다: ' + photos.join(' '));
  }
});

test('미리보기 — 화면 번들에서 바로(서버에 묻지 않는다), 사진은 파일에 담긴 그림, 숫자 00 은 손대지 않게 표시', async () => {
  assert.equal(M.localPreview('L_TOC_UA_MD_SCALE'), null, '자료를 받기 전에는 없다');
  await M.screen.loadSectorBook();
  for (const f of Object.keys(D.layouts)) {
    const html = M.localPreview(f, true);
    assert.ok(html && html.startsWith('<!doctype html>'), f);
    assert.match(html, /Content-Security-Policy" content="default-src 'none'; img-src data:;/);
    assert.match(html, /<body data-lpx-numbers="00">/);
    for (const src of html.match(/<img src="[^"]{0,40}/g) || []) assert.match(src, /^<img src="data:image\/(avif|jpeg|png|webp)/, f);
    assert.doesNotMatch(html, /R0lGODlhAQABA/, f + ' 빈 그림이 남았다');
    assert.doesNotMatch(html, /<script|\bon[a-z]+=|https?:\/\//i, f);
  }
  assert.equal(M.localPreview('L_VS_DIV_R4'), null, '간지는 서버 미리보기');
  assert.equal(book.has('L_TOC_UAPROF'), false);
  assert.ok(Object.keys(D.photos).length >= 60); // 이해 항목 사진 5 + 제품 컷 + 사례 사진
  assert.deepEqual(book.meta('L_TOC_UA_MD_ZONE'), { code: 'TOC-UA-MD-ZONE', name: '병원 구역 9칸(공용·진료·보호 구역)', when: D.layouts.L_TOC_UA_MD_ZONE.when });
});

test('파일은 생성 결과 그대로 — build/toc/gen_ua_catalog.py', t => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ua-catalog-')), 'ua-catalog.json');
  const run = spawnSync('python3', ['-B', path.join(root, 'build/toc/gen_ua_catalog.py')], { env: { ...process.env, WINMATE_UA_CATALOG_OUT: out }, encoding: 'utf8' });
  if (run.error) return t.skip('python3 이 없다');
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(path.join(root, 'admin/web/src/ua-catalog.json'), 'utf8'), 'ua-catalog.json 을 손으로 고쳤거나 다시 만들지 않았다');
});
