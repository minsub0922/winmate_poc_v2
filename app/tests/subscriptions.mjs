// 구독(subscription) — DSS 의 네 번째 종류(B2B 삼성 AI 구독). 레지스트리 · 원장 · SQLite · 구독 장(L_SUB_*) · 파트 · 목차 · 샘플 시나리오가 서로 맞는지.
//   node app/tests/subscriptions.mjs
// 만드는 순서: proddb/build/subs/collect.py → assets.py → build.py → proddb/build/subs/ledger_run.py · subs_db.py → build/subs/gen_module.py
//             → build/toc/build_content.py → build/subs/compose.mjs samples (.agents/skills/winmate-update-dss-db 6-S)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const require = createRequire(path.join(ROOT, 'app/web/package.json'));
const { build } = require('esbuild');
const entry = `export * from './domain/templates/toc_templates.js';
export { SCENARIOS, REQ_TYPES, REQ_ORDER } from './domain/templates/scenarios.js';
export { FILLS } from './domain/templates/scenario_fills.js';
export { STORY } from './domain/templates/scenario_story.js';
export { SUBS_META, SUBS_HTML, SUBS_SLOTS } from './domain/templates/subs_layouts.js';
export { PARTS, NEXT, classifyPart } from './domain/proposals/parts.js';`;
const built = await build({ stdin: { contents: entry, resolveDir: path.join(ROOT, 'app/web/src') }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
await M.loadTocContent();

const REG = J('app/data/subscriptions.json');
const LEDGER = J('proddb/dss/ledger.json');
const SAMPLES = J('app/web/src/domain/templates/subscription_scenarios.json');
const ITEMS = Object.fromEntries(REG.items.map((x) => [x.id, x]));
const TYPES = ['program', 'care', 'care-option', 'package', 'promotion', 'payment'];
const ROLE = { fineprint: 10, utility: 12, label: 14, dense: 16, body: 18, heading: 20, subheading: 24, title: 32, metric: 40, cover: 48, display: 56 };

test('레지스트리 — 원문 사실(official)과 추론 협의안(inferred)이 나뉘고, 원문 근거가 complete 소스를 가리킨다', () => {
  assert.equal(new Set(REG.items.map((x) => x.id)).size, REG.items.length, 'id 중복 없음');
  const src = Object.fromEntries(REG.sources.map((s) => [s.id, s]));
  for (const s of REG.sources) assert.ok(['complete', 'partial', 'failed', 'moved', 'new'].includes(s.status), s.id);
  for (const x of REG.items) {
    assert.ok(TYPES.includes(x.type), x.id + ' type');
    assert.ok(['official', 'inferred'].includes(x.basis), x.id + ' basis');
    assert.ok((x.keyMessages || []).length >= 1 && x.keyMessages.every((m) => m.text && m.text.trim()), x.id + ' key message');
    if (x.basis === 'official') {
      assert.ok(x.evidence.length >= 1, x.id + ' 근거');
      for (const e of x.evidence) assert.ok(src[e.source], x.id + ' → 소스 ' + e.source);
      if (x.status === 'active') {
        assert.equal(x.checkedRun, REG.run, x.id + ' 확인 run');
        assert.ok(x.evidence.every((e) => src[e.source].status === 'complete'), x.id + ' active 는 complete 소스에서만');
      }
    } else {
      assert.equal(x.status, 'inferred', x.id + ' 추론안은 status inferred');
      assert.ok(!x.checkedAt && x.inferredAt, x.id + ' 추론안은 확인 시점 대신 inferredAt');
      assert.ok(x.keyMessages.every((m) => m.basis === 'inferred'), x.id + ' 추론안의 메시지는 inferred');
    }
  }
  assert.deepEqual(REG.issues, [], '원문 대조 실패 없음');
});

test('결제 · 납부 — 공식은 월 구독료 하나, 나머지는 B2B 협의안(확인할 것 포함)', () => {
  const pays = REG.items.filter((x) => x.type === 'payment');
  const official = pays.filter((x) => x.basis === 'official');
  assert.deepEqual(official.map((x) => x.id), ['sub_pay_monthly']);
  const inferred = pays.filter((x) => x.basis === 'inferred');
  assert.ok(inferred.length >= 3, '추론안 3개 이상');
  for (const x of pays) {
    assert.ok(x.name && x.summary && x.fit && (x.points || []).length >= 2, x.id + ' 이름 · 요약 · 맞는 고객 · 포인트');
    assert.ok(Array.isArray(x.confirm) && x.confirm.length >= 1 && x.confirm.every((c) => c.trim()), x.id + ' 계약 전 확인할 것');
  }
});

test('혜택 — 기간이 지나면 expired, 아니면 기간 안', () => {
  const day = REG.generated.slice(0, 10);
  for (const x of REG.items.filter((y) => y.type === 'promotion')) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(x.validTo) && /^\d{4}-\d{2}-\d{2}$/.test(x.validFrom), x.id + ' 기간');
    if (x.validTo < day) assert.equal(x.status, 'expired', x.id);
    else assert.notEqual(x.status, 'expired', x.id);
  }
});

test('패키지 · 품목 분류 — 공식 모델 또는 같은 분류의 B2B 제품 DB 행으로 이어진다', () => {
  const pdb = J('app/data/products_db.json'), cat = J('app/data/catalog.json');
  const ids = new Set([...pdb.products.map((p) => p.id), ...cat.products.map((p) => p.id)]);
  for (const x of REG.items.filter((y) => y.type === 'package')) {
    assert.ok(x.items.length >= 3, x.id + ' 품목');
    for (const it of x.items) {
      assert.ok(['exact', 'series', 'category'].includes(it.match), x.id + ' ' + it.label + ' 대응 방식');
      assert.ok(ids.has(it.product), x.id + ' ' + it.label + ' → ' + it.product);
    }
    assert.ok(fs.existsSync(path.join(ROOT, 'app/web/public', x.photo)), x.id + ' 사진 ' + x.photo);
  }
  for (const c of REG.categories) if (c.status === 'official') assert.ok(c.count > 0 && c.products.every((p) => ids.has(p)), c.id);
});

test('업종 44 — 모두 구독 구성(공식 패키지 · 비슷한 패키지 · 업종 공간 기준)이 있다', () => {
  assert.equal(Object.keys(REG.verticals).length, 44);
  for (const [vid, v] of Object.entries(REG.verticals)) {
    assert.ok(['direct', 'similar', 'derived', 'fallback'].includes(v.match), vid);
    if (v.match === 'derived') assert.ok(v.cats.length >= 3, vid + ' 공간 기준 분류 3개 이상');
    else assert.ok(ITEMS[v.pkg] && ITEMS[v.pkg].type === 'package', vid + ' → ' + v.pkg);
  }
});

test('원장 — 레지스트리 항목마다 subscription:<id>(kind subscription), 구독 run 기록, 식기세척기는 제품', () => {
  for (const x of REG.items) {
    const it = LEDGER.items['subscription:' + x.id];
    assert.ok(it, x.id + ' 원장 항목');
    assert.equal(it.kind, 'subscription');
    assert.equal(it.status === 'inferred', x.basis === 'inferred', x.id + ' 추론안 표시');
    if (x.basis === 'official' && x.status === 'active') assert.ok(['new', 'active', 'changed'].includes(it.status) && it.checked_run === REG.run, x.id + ' 확인 표식');
  }
  const run = LEDGER.runs.find((r) => r.run_id === REG.run);
  assert.ok(run && run.scope.includes('subscriptions'), '구독 run 기록');
  assert.equal(run.sources.failed + run.sources.partial, 0);
  const dish = Object.values(LEDGER.items).filter((x) => /식기세척기/.test(x.name) && x.kind !== 'subscription');
  assert.ok(dish.length >= 10 && dish.every((x) => x.kind === 'device'), '식기세척기 = 제품(device)');
});

test('SQLite — subscription 표가 레지스트리와 같다', () => {
  const py = `import json, sqlite3, sys
d = sqlite3.connect(sys.argv[1]); q = lambda s: d.execute(s).fetchall()
print(json.dumps({'items': q("select id, type, basis, status from subscription order by id"), 'pkgItems': q("select count(*) from subscription_item")[0][0],
  'messages': q("select count(*) from subscription_message")[0][0], 'verticals': q("select count(*) from subscription_vertical")[0][0],
  'dss': q("select count(*) from dss_item where kind = 'subscription'")[0][0], 'meta': dict(q("select key, value from meta where key like 'subscription.%' or key = 'count.subscription'"))}))`;
  const r = JSON.parse(execFileSync('python3', ['-c', py, path.join(ROOT, 'proddb/winmate_products.sqlite')], { encoding: 'utf8' }));
  assert.deepEqual(r.items, REG.items.map((x) => [x.id, x.type, x.basis, x.status]).sort((a, b) => a[0].localeCompare(b[0])));
  assert.equal(r.pkgItems, REG.items.filter((x) => x.type === 'package').reduce((n, x) => n + x.items.length, 0));
  assert.equal(r.messages, REG.items.reduce((n, x) => n + x.keyMessages.length, 0));
  assert.equal(r.verticals, 44); assert.equal(r.dss, REG.items.length);
  assert.equal(r.meta['subscription.run'], REG.run); assert.equal(r.meta['count.subscription'], String(REG.items.length));
});

test('구독 장 21 — 장표 구분 SU · 파트 subscription, 글 칸마다 글자 역할 크기', () => {
  assert.equal(M.SUBS_META.length, 21);
  for (const m of M.SUBS_META) {
    assert.equal(m.c, 'SU'); assert.equal(m.p, 'subscription'); assert.ok(m.subs.length >= 1, m.f + ' 구독 항목');
    for (const s of m.subs) assert.ok(ITEMS[s], m.f + ' → ' + s);
    const html = M.SUBS_HTML[m.f];
    assert.ok(html.startsWith('<div data-proposal-typography="2"'), m.f + ' 역할을 구운 장');
    const tags = [...html.matchAll(/<[a-z]+\b[^>]*\bdata-tb="(\d+)"[^>]*>/g)].map((x) => x[0]);
    assert.equal(tags.length, m.nT, m.f + ' 글 칸 수');
    for (const t of tags) {
      const role = /data-type-role="(\w+)"/.exec(t)?.[1], size = Number(/font-size:\s*([\d.]+)px/.exec(t)?.[1]);
      assert.ok(role && ROLE[role] === size, `${m.f} ${t.slice(0, 80)} — 역할 ${role} · ${size}px`);
    }
    const slots = M.SUBS_SLOTS[m.f];
    assert.ok(Object.values(slots.t).every((i) => i < m.nT) && Object.values(slots.img).every((i) => i < m.nI), m.f + ' 칸 이름');
  }
  const promo = M.SUBS_META.find((m) => m.f === 'L_SUB_PROMO');
  assert.ok(promo.until && promo.retired === undefined, '혜택 장은 기간 안에서만 활성');
});

test('파트 — 구독 도입(subscription) 타입과 이름 규칙', () => {
  assert.ok(M.PARTS.subscription && M.PARTS.subscription.label === '구독 도입');
  for (const name of ['B2B 삼성 AI 구독', '구독 조건 · 결제', '구독 케어 · B2B 블루패스', '렌탈 · 분할 납부 검토']) assert.equal(M.classifyPart(name), 'subscription', name);
  assert.ok(M.NEXT.cost.includes('subscription') && M.NEXT.subscription.length >= 2, '비용 → 구독 → 실행');
});

test('목차 템플릿 — 구독 제안서 · 구독 전환 제안서가 업종 44 모두 구독 장으로 조립된다', () => {
  for (const [tid, core] of [['subs', ['L_SUB_PAIN', 'L_SUB_VALUE3', 'L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3', 'L_SUB_FLOW']], ['subsl', ['L_SUB_ONE', 'L_SUB_TERMS', 'L_SUB_PAY3']]]) {
    for (const vid of Object.keys(REG.verticals)) {
      const s = M.ensureTocScenario(tid, vid); assert.ok(s, tid + '/' + vid);
      const fs_ = new Set(M.FILLS[s.id].map((o) => o.f));
      for (const f of core) assert.ok(fs_.has(f), `${tid}/${vid} ${f}`);
      assert.ok([...fs_].some((f) => /^L_SUB_PKG[34]$/.test(f)), `${tid}/${vid} 패키지 장`);
    }
  }
});

test('샘플 시나리오 — 요구 유형 구독 도입 9(구독 제안서 4 · 전환 1 · 표준 + 구독 솔루션 4), 채움이 장 수와 같고 칸이 다 찼다', () => {
  assert.ok(M.REQ_TYPES.subs && M.REQ_ORDER.includes('subs'));
  const mine = M.SCENARIOS.filter((s) => s.req === 'subs');
  assert.deepEqual(mine.map((s) => s.id).sort(), SAMPLES.scenarios.map((s) => s.id).sort());
  assert.equal(mine.length, 9);
  assert.deepEqual(mine.filter((s) => /^bs_sub_std_/.test(s.id)).map((s) => s.flow.find((g) => /구독 솔루션 제안$/.test(g.name)) && s.flow.map((g) => g.name.replace(/^(목차 · )?\d{2} /, '')).indexOf('구독 솔루션 제안')), [5, 5, 5, 5], '표준 + 구독 솔루션: 도입사례 앞');
  for (const s of mine) {
    const flat = s.flow.flatMap((g) => g.slides), fills = M.FILLS[s.id];
    assert.equal(fills.length, flat.length, s.id);
    assert.equal(s.flow[0].slides.length, 1, s.id + ' 표지 묶음은 표지 한 장');
    for (let k = 0; k < fills.length; k++) {
      const o = fills[k]; assert.equal(o.f, flat[k].f, s.id + ' ' + k);
      if (!/^L_SUB_/.test(o.f)) continue;
      const nT = M.SUBS_META.find((m) => m.f === o.f).nT;
      assert.equal(Object.keys(o.t).length, nT, `${s.id} ${k} ${o.f} 글 칸 수`);
      assert.ok(Object.values(o.t).every((v) => String(v).trim()), `${s.id} ${k} ${o.f} 빈 글 칸`);
      assert.ok(Object.values(o.img).every((im) => im && im.src), `${s.id} ${k} ${o.f} 빈 사진 칸`);
    }
    assert.ok(s.subs.every((id) => ITEMS[id]), s.id + ' 구독 항목');
    assert.equal(M.STORY[s.id].keymen.reduce((n, x) => n + x[1], 0), 100, s.id + ' 키맨 비중');
  }
});

// ---------------- 요구사항에 따라 다른 구성에 '구독 솔루션 제안'만 더하기 ----------------
const ADDON = REG.addon;
const BEFORE = ADDON.place.before; const AFTER = ADDON.place.after;

test('구독 요구 판정 규칙 — 레지스트리 addon = 목차 내용(toc_content subs.addon), 신호 · 반대 신호', async () => {
  const toc = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/web/src/domain/templates/toc_content.json'), 'utf8'));
  assert.deepEqual(toc.subs.addon, ADDON);
  assert.equal(ADDON.toc, 'subsol'); assert.equal(ADDON.part.type, 'subscription');
  const A = await import(path.join(ROOT, 'app/web/src/domain/proposals/addons.js'));
  const yes = ['렌탈로 도입하고 싶어요', '월 사용료 방식 희망', '초기 비용과 관리 인력이 부담', '운용리스 검토', '구독형 가전'];
  const no = ['리스크 관리', '객실 OTT 구독 제공', '구독자 이벤트', '초기 비용 걱정', '구독은 원하지 않음. 일시불 구매만', '프리스탠딩 식기세척기'];
  for (const t of yes) assert.ok(A.subscriptionNeed(t, ADDON).need, t);
  for (const t of no) assert.ok(!A.subscriptionNeed(t, ADDON).need, t);
  assert.deepEqual(M.addonsForRequirement('렌탈 희망'), ['sub']); assert.deepEqual(M.addonsForRequirement('신규 객실 TV'), []);
  // Storyboard 목차 자리 — 마지막 비용 뒤, 없으면 첫 실행 · 사례 · Why 앞(표지 앞에는 안 넣음), 없으면 끝
  const at = (types) => A.addonIndex(types.map((t, i) => ({ type: t, deck: i === 0 && t === 'cover' })), ADDON);
  assert.equal(at(['cover', 'value', 'cost', 'execution', 'why']), 3);
  assert.equal(at(['cover', 'value', 'products', 'case', 'why']), 3);
  assert.equal(at(['value', 'products']), 2);
  const part = A.addonPart(ADDON, A.subscriptionNeed('렌탈 · 초기 비용 부담', ADDON));
  assert.equal(part.name, '구독 솔루션 제안'); assert.ok(part.items[0].startsWith('요구사항: ') && part.items[0].includes('렌탈'));
});

test('어느 템플릿이든 구독 요구가 있으면 구독 솔루션 제안만 더한다 — 자리 · 장 · 번호', () => {
  const tpls = M.TOC_TEMPLATES.filter((t) => !t.addons && t.kind !== 'subs');
  let n = 0;
  for (const t of tpls) {
    for (const vid of Object.keys(REG.verticals)) {
      const s = M.ensureTocScenario(t.id, vid, { addons: ['sub'] }); n++;
      const named = M.TOC_TEMPLATES.find((x) => x.base === t.id && (x.addons || []).join() === 'sub');
      if (named) assert.equal(s.id, `toc_${named.id}__${vid}`, `${t.id} + 구독 = ${named.id}`); else assert.equal(s.id, `toc_${t.id}+sub__${vid}`);
      const names = s.flow.slice(1).map((g) => g.name.slice(3));
      const k = names.indexOf('구독 솔루션 제안'); assert.ok(k >= 0, s.id);
      assert.equal(names.length, t.tocs.length + 1, s.id + ' 목차 하나만 더함');
      const types = t.tocs.map((x) => M.TOCS[x].type); const want = (() => { const a = types.lastIndexOf(AFTER[0]); if (a >= 0) return a + 1; const b = types.findIndex((x) => BEFORE.includes(x)); return b >= 0 ? b : types.length; })();
      assert.equal(k, want, `${s.id} 자리 ${k} ≠ ${want}`);
      const g = s.flow[k + 1];
      assert.match(g.slides[0].f, /^L_VS_DIV_R\d$/);
      assert.deepEqual(g.slides.slice(1).map((x) => x.f.replace(/\d$/, '')), ['L_SUB_VALUE', 'L_SUB_PKG', 'L_SUB_PAY', ...(REG.items.some((x) => x.type === 'promotion' && x.status === 'active') ? ['L_SUB_PROMO'] : [])], s.id);
      assert.equal(M.STORY[s.id].parts[g.name].type, 'subscription');
      const fills = M.FILLS[s.id];
      fills.forEach((o, i) => { for (const v of Object.values(o.t || {})) { const m = /^CONFIDENTIAL · (\d+)$/.exec(v); if (m) assert.equal(+m[1], i + 1, `${s.id} #${i + 1} 쪽 번호`); } });
      const start = s.flow.slice(0, k + 1).reduce((a, x) => a + x.slides.length, 0);
      for (let j = 1; j < g.slides.length; j++) assert.ok(String(fills[start + j].t[0]).startsWith(String(k + 1).padStart(2, '0') + ' · 구독 솔루션 제안'), `${s.id} 눈썹 ${fills[start + j].t[0]}`);
    }
  }
  assert.equal(n, tpls.length * 44);
  // 이미 구독 목차가 있는 구성은 그대로 · 요구가 없으면 템플릿 그대로
  assert.equal(M.ensureTocScenario('subs', 'ht_large', { addons: ['sub'] }).id, 'toc_subs__ht_large');
  assert.equal(M.ensureTocScenarioFor('std', 'ht_large', '객실 TV 교체').id, 'bs_std_ht_large');
  assert.equal(M.ensureTocScenarioFor('std', 'ht_large', '렌탈로 도입하고 싶다').id, 'toc_stdsub__ht_large');
  assert.equal(M.ensureTocScenarioFor('build', 'of_sme', '초기 비용 부담 · 정기 점검 포함').id, 'toc_build+sub__of_sme');
});
