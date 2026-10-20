// 히스토리 샘플(seeds_cases) 확인: 사이드바 · 홈 · 레이아웃 전부 입력 케이스(상세 팝업 '빈 요소가 없어요' · 예시 문구 없음) ·
// 기승전결 개편(파트마다 레이아웃 2~3장) · 작성 중 케이스 · 요구사항 단계 · 기존 저장분 마이그레이션(한 번만 추가 · v3 예시는 손대지 않은 것만 새 버전) · 다크 · 모바일
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa/cases');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8791);
const URL0 = 'http://localhost:8791/';
const DATA = JSON.parse(fs.readFileSync(path.resolve(here, '../src/seeds_cases.json'), 'utf8'));
const SAMPLE = /A 커피|커피 프랜차이즈|T 은행|C 빌딩|B 비즈니스|D 리테일|S 지자체|\[[^\]]{0,12}\]/;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.vp || { width: 1440, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errs.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() === 404) page.errs.push('404: ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(URL0);
  await page.waitForSelector('.home, .sb-list', { timeout: 30000 });
  await page.waitForTimeout(900);
  return { ctx, page };
}
const shot = (page, n) => page.screenshot({ path: path.join(shots, n + '.png') });

// 1) fresh browser: all seeds present, sorted by last update
{
  const { ctx, page } = await fresh();
  const n = await page.locator('.sb-item').count();
  ok(n === 24, 'sidebar lists 24 proposals (7 existing + 17 new): ' + n);
  const titles = await page.locator('.sb-item .t').allTextContents();
  ok(DATA.every((p) => titles.includes(p.title)), 'every new case title is in the sidebar');
  await shot(page, '01-home');

  // 2) every fully filled case: every layout opens, '빈 요소가 없어요', no sample text left on the slide
  // 2-0) every Storyboard part of every case holds 2~3 layouts (no one-layout part), the deck part holds the 표지
  for (const p of DATA.filter((x) => x.stage === 'story')) {
    const bad = p.parts.filter((s) => !s.deck && !(s.layouts.length >= 2 && s.layouts.length <= 3));
    ok(!bad.length, `${p.id}: every part has 2~3 layouts` + (bad.length ? ' — ' + bad.map((s) => s.name + ':' + s.layouts.length).join(', ') : ''));
  }
  const full = DATA.filter((p) => p.parts.some((s) => s.layouts.length) && p.parts.every((s) => s.layouts.every((x) => x.status === 'done')));
  ok(full.length === 8, 'fully filled cases: ' + full.length);
  for (const p of full) {
    await page.locator('.sb-item', { hasText: p.title }).first().evaluate((e) => e.click());
    await page.waitForSelector('.canvas', { timeout: 15000 });
    await page.waitForTimeout(700);
    await shot(page, '02-story-' + p.id);
    const cards = page.locator('.lcard');
    const nCards = await cards.count();
    // the case's ‘표지’ part (and any 표지 sheet) is not on the Storyboard — it lives only in the PPT 레이아웃 panel
    const onBoard = (s) => !(s.type === 'cover' || /표지/.test(s.name || ''));
    const nLay = p.parts.filter(onBoard).reduce((a, s) => a + s.layouts.filter((x) => !/^L_C0[12389]$/.test(x.f)).length, 0);
    ok(nCards === nLay, `${p.id}: ${nCards} layout cards on the canvas (expected ${nLay}, 표지 only in the PPT 레이아웃 panel)`);
    ok(!(await page.$$eval('.col .node-name', (es) => es.some((e) => /표지/.test(e.textContent)))), `${p.id}: no 표지 bubble`);
    const badges = await page.locator('.lcard .stbadge.done').count();
    ok(badges === nLay, `${p.id}: all ${nLay} cards show 입력 완료`);
    for (let i = 0; i < nCards; i++) {
      await cards.nth(i).click();
      await page.waitForSelector('.modal', { timeout: 10000 });
      await page.waitForTimeout(500);
      const btn = await page.locator('.modal button:has-text("빈 요소")').first().textContent().catch(() => '');
      const txt = await page.evaluate(() => Array.from(document.querySelectorAll('.modal [data-tb]')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter((t) => !/^(고객사 로고|CONFIDENTIAL · \d+|LOGO)$/.test(t)));
      const bad = txt.filter((t) => SAMPLE.test(t));
      ok(/없어요/.test(btn || '') && !bad.length, `${p.id} #${i + 1}: ${btn || '(no button)'}${bad.length ? ' · sample left: ' + bad.slice(0, 3).join(' | ') : ''}`);
      if (i === 0 || i === nCards - 1) await shot(page, `03-detail-${p.id}-${i + 1}`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
      if (await page.locator('.modal').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
    }
    // viewer
    await page.click('.lay-toggle'); await page.waitForTimeout(900);
    await shot(page, '04-viewer-' + p.id);
    await page.click('.lay-toggle'); await page.waitForTimeout(300);
  }

  // 3) evidence on a numeric unit: select first KPI unit in F7 effect slide and expect sources
  {
    const p = DATA.find((x) => x.id === 'p_case_f7');
    await page.locator('.sb-item', { hasText: p.title }).first().evaluate((e) => e.click());
    await page.waitForSelector('.canvas');
    await page.locator('.lcard').nth(3).click();
    await page.waitForSelector('.modal');
    await page.waitForTimeout(500);
    const unit = page.locator('.modal [data-unit^="t"]').nth(3); // a text unit (image units read 직접 고름)
    await unit.click({ force: true });
    await page.waitForTimeout(400);
    const panel = await page.locator('.modal').innerText();
    ok(/직접 입력/.test(panel), 'selected unit shows state 직접 입력');
    await shot(page, '05-evidence-f7');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  }

  // 4) partial + early-stage cases open without errors
  for (const id of ['p_case_p1', 'p_case_p4', 'p_case_s1', 'p_case_r2', 'p_case_r3']) {
    const p = DATA.find((x) => x.id === id);
    await page.locator('.sb-item', { hasText: p.title }).first().evaluate((e) => e.click());
    await page.waitForTimeout(900);
    await shot(page, '06-' + id);
    const isStory = p.stage === 'story';
    // one screen: Storyboard — before the requirements are taken on, only the 고객 요구사항 bubble with its popup open
    const n = async (sel) => page.locator(sel).count();
    ok((await n('.canvas')) > 0 && (isStory ? (await n('.match-node')) > 0 && (await n('.rq-pop')) === 0 : (await n('.match-node')) === 0 && (await n('.rq-pop')) === 1), `${id}: opens at ${p.stage}`);
  }
  ok(!page.errs.length, 'no page errors: ' + page.errs.slice(0, 5).join(' / '));
  await ctx.close();
}

// 5) migration: an existing saved history (seed version 2) gets the 17 cases once; a deleted case is not re-added later
{
  const existing = [{ id: 'p_user_1', title: '내 제안서', customer: '', ind: null, createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000, stage: 'req', reqTab: 'free', req: { free: [], form: { project: '', customer: '', target: '', keymen: [], note: '' }, files: [] }, ctx: { products: [], solutions: [], cases: [] }, parts: [], exportedAt: null }];
  const init = `if (!sessionStorage.getItem('seeded')) { localStorage.setItem('winmate.v2.proposals', ${JSON.stringify(JSON.stringify(existing))}); localStorage.setItem('winmate.v2.seedv', '2'); sessionStorage.setItem('seeded', '1'); }`;
  const { ctx, page } = await fresh({ init });
  const n = await page.locator('.sb-item').count();
  ok(n === 18, 'old history (1 item, seed v2) + 17 new cases = ' + n);
  const v = await page.evaluate(() => localStorage.getItem('winmate.v2.seedv'));
  ok(v === '4', 'seed version saved as 4');
  // delete one case then reload: must not come back
  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('winmate.v2.proposals')); localStorage.setItem('winmate.v2.proposals', JSON.stringify(l.filter((p) => p.id !== 'p_case_f1'))); });
  await page.reload(); await page.waitForSelector('.sb-list'); await page.waitForTimeout(600);
  const n2 = await page.locator('.sb-item').count();
  ok(n2 === 17, 'deleted case stays deleted after reload: ' + n2);
  await ctx.close();
}

// 5b) seed v3 → v4: a saved example still as it was (same fingerprint) becomes the new version; one the user changed stays
{
  const OLD = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures/seed_v3_sample.json'), 'utf8'));
  const f1 = OLD.find((p) => p.id === 'p_case_f1'), p3 = OLD.find((p) => p.id === 'p_case_p3'), a = OLD.find((p) => p.id === 'p_seed_acoffee');
  const p3mod = JSON.parse(JSON.stringify(p3)); p3mod.parts[1].name = '내가 고친 파트 이름';
  const init = `if (!sessionStorage.getItem('seeded')) { localStorage.setItem('winmate.v2.proposals', ${JSON.stringify(JSON.stringify([f1, p3mod, a]))}); localStorage.setItem('winmate.v2.seedv', '3'); sessionStorage.setItem('seeded', '1'); }`;
  const { ctx, page } = await fresh({ init });
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.proposals')));
  const g = (id) => st.find((p) => p.id === id);
  const nF1 = DATA.find((p) => p.id === 'p_case_f1').parts.filter((s) => !s.deck).length;
  ok(st.length === 3, 'v3 → v4 keeps the same 3 items: ' + st.length);
  ok(g('p_case_f1') && g('p_case_f1').parts.filter((s) => !s.deck).length === nF1 && g('p_case_f1').parts.filter((s) => !s.deck).every((s) => s.layouts.length >= 2), 'untouched v3 F1 became the v4 example (' + nF1 + ' parts, 2+ layouts each)');
  ok(g('p_case_p3') && g('p_case_p3').parts.some((s) => s.name === '내가 고친 파트 이름'), 'user-changed P3 stays as the user left it');
  ok(g('p_seed_acoffee') && g('p_seed_acoffee').parts.filter((s) => !s.deck).every((s) => s.layouts.length >= 2), 'untouched A 커피 became the v4 example');
  ok((await page.evaluate(() => localStorage.getItem('winmate.v2.seedv'))) === '4', 'seed version saved as 4 after the v3 upgrade');
  ok(!page.errs.length, 'no page errors (v3 upgrade): ' + page.errs.slice(0, 3).join(' / '));
  await ctx.close();
}

// 6) dark + mobile
{
  const { ctx, page } = await fresh({ dark: true });
  await page.locator('.sb-item', { hasText: 'R 건설' }).first().evaluate((e) => e.click());
  await page.waitForSelector('.canvas'); await page.waitForTimeout(800);
  await shot(page, '07-dark-story');
  await ctx.close();
}
{
  const { ctx, page } = await fresh({ vp: { width: 390, height: 844 } });
  await shot(page, '08-mobile-home');
  await ctx.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
