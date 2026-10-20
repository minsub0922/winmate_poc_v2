// AI로 나머지 구성 — no popup: shimmer bubbles trail the board, each streamed part becomes a bubble right away,
// only parts after the existing ones are made, 멈추기 keeps what's already written, rule-based fallback without AI.
// Run: node build/build.mjs && node build/test-aisb.mjs   (CHROME=<path> to override the browser, VW=390 for mobile)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8771);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const vw = +(process.env.VW || 1440);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

// streamed AI answer: 40 characters every 130 ms through onText({ text }), like sample.json does
const ANSWER = { parts: [
  { type: 'case', name: 'M 버거 DT 도입 효과', items: ['드라이브스루 메뉴 교체 시간 단축', '야간 시인성 개선'] },
  { type: 'cover', name: '표지', items: ['표지는 Storyboard 파트가 아님'] },
  { type: 'market', name: 'F&B 매장은 메뉴판부터 화면으로', items: ['이미 있는 파트 이름 — 다시 넣지 않음'] }, // A 커피의 첫 파트(2026-10-19 개편)
  { type: 'why', name: '왜 삼성인가', items: ['전국 A/S 네트워크', 'MagicINFO 원격 관리'] },
  { type: 'execution', name: '단계별 전환 일정', items: ['직영점 파일럿', '가맹점 순차 확산'] },
  { type: 'cost', name: 'TCO · 예산', items: ['종이 메뉴판 인쇄비 대비 절감'] },
] };
const mockAi = (answer) => {
  window.__prompts = [];
  window.claude = { use: async (cap) => (cap !== 'sample' ? null : {
    limits: async () => null,
    json: async (prompt, o = {}) => {
      window.__prompts.push(prompt);
      const text = JSON.stringify(answer, null, 1);
      for (let i = 40; ; i += 40) {
        await new Promise((r) => setTimeout(r, 130));
        if (o.signal && o.signal.aborted) { const e = new Error('cancelled'); e.code = 'cancelled'; throw e; }
        if (o.onText) o.onText({ text: text.slice(0, i) });
        if (i >= text.length) break;
      }
      return answer;
    },
  }) };
};

async function openProposal(page, id, edit) {
  await page.goto('http://localhost:8771/'); await page.waitForSelector('.home', { timeout: 60000 });
  await page.evaluate((id) => localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'proposal', id } })), id);
  await page.reload(); await page.waitForSelector('.canvas'); await page.waitForTimeout(800);
  if (edit === 'empty') {
    // proposals are only written once something changes — touch the title, then empty the board in storage
    await page.locator('#pr-title').press('End'); await page.keyboard.type(' '); await page.keyboard.press('Backspace'); await page.waitForTimeout(500);
    await page.evaluate((id) => { const l = JSON.parse(localStorage.getItem('winmate.v2.proposals')); const p = l.find((x) => x.id === id); p.parts = p.parts.filter((s) => s.deck); p.stage = 'story'; localStorage.setItem('winmate.v2.proposals', JSON.stringify(l)); }, id);
    await page.reload(); await page.waitForSelector('.canvas'); await page.waitForTimeout(800);
  }
}
const bubbles = (page) => page.$$eval('.board > .col:not(.ghost) > .node-name', (els) => els.map((e) => e.textContent.trim()));
const stored = (page, id) => page.evaluate((id) => { const p = JSON.parse(localStorage.getItem('winmate.v2.proposals')).find((x) => x.id === id); return p.parts.filter((s) => !s.deck).map((s) => ({ name: s.name, type: s.type, items: s.items, done: s.done })); }, id);

// ---------- 1) streamed: shimmer trail, bubbles added one by one, only the continuation ----------
{
  const ctx = await browser.newContext({ viewport: { width: vw, height: 900 } });
  await ctx.addInitScript(mockAi, ANSWER);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await openProposal(page, 'p_seed_acoffee');
  const before = await bubbles(page);
  console.log('before', before.join(' | '));
  await page.click('.end-ai');
  await page.waitForSelector('.col.ghost');
  ok(await page.locator('.col.ghost').count() === 3, '3 shimmer bubbles while the AI writes');
  ok(await page.locator('.modal, .aisb').count() === 0, 'no popup');
  ok(await page.locator('.end-node').count() === 0, 'the 다음 파트 bubble steps aside while the AI writes');
  await page.waitForFunction((n) => document.querySelectorAll('.board > .col:not(.ghost)').length > n, before.length, { timeout: 20000 });
  await page.waitForTimeout(450);
  const mid = await bubbles(page);
  ok(mid.length === before.length + 1 && mid[before.length] === 'M 버거 DT 도입 효과' && await page.locator('.col.ghost').count() === 3, 'first part lands as a bubble right away, shimmer moves behind it: ' + mid.slice(-2).join(' | '));
  await page.screenshot({ path: path.join(shots, 'aisb-' + (vw < 600 ? 'm-' : '') + '01-streaming.png') });
  await page.waitForSelector('.col.ghost', { state: 'detached', timeout: 20000 });
  await page.waitForTimeout(500);
  const after = await bubbles(page);
  const added = after.slice(before.length);
  ok(after.slice(0, before.length).join() === before.join(), 'existing bubbles untouched, new ones only after them');
  const want = ['M 버거 DT 도입 효과', '왜 삼성인가', '단계별 전환 일정', 'TCO · 예산'].slice(0, Math.max(3, 10 - before.length)); // ai.js moreRange: the board grows to about 10 parts
  ok(added.join(' | ') === want.join(' | '), 'added in answer order, no 표지, no repeat of an existing part: ' + added.join(' | '));
  ok(await page.locator('.end-node').count() === 1, '다음 파트 bubble is back');
  const prompt = await page.evaluate(() => window.__prompts[0] || '');
  ok(prompt.includes('지금까지 만든 파트') && before.every((n) => prompt.includes(n)) && prompt.includes('그 뒤에 이어질 파트만'), 'prompt carries the existing parts and asks only for what follows');
  const st = (await stored(page, 'p_seed_acoffee')).slice(before.length);
  ok(st.every((s) => s.done && s.items.length), 'new parts are saved as 작성 완료 with their items (layout recommendations unlocked)');
  ok(await page.locator(`.toast:has-text("AI가 파트 ${want.length}개를 이어 넣었어요")`).count() === 1, 'toast says how many were added');
  await page.$eval('.canvas', (c) => c.scrollLeft = c.scrollWidth); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, 'aisb-' + (vw < 600 ? 'm-' : '') + '02-done.png') });
  ok(!errs.length, 'no page errors ' + errs.join(' / '));
  await ctx.close();
}

// ---------- 2) 멈추기: keeps what's already written, nothing more arrives ----------
{
  const ctx = await browser.newContext({ viewport: { width: vw, height: 900 } });
  await ctx.addInitScript(mockAi, ANSWER);
  const page = await ctx.newPage();
  await openProposal(page, 'p_seed_acoffee');
  const before = await bubbles(page);
  await page.click('.end-ai');
  await page.waitForFunction((n) => document.querySelectorAll('.board > .col:not(.ghost)').length > n, before.length, { timeout: 20000 });
  await page.click('.ghost-note button');
  await page.waitForSelector('.col.ghost', { state: 'detached' });
  const n1 = (await bubbles(page)).length;
  ok(await page.locator('.toast:has-text("멈췄어요")').count() === 1, 'toast on stop');
  await page.waitForTimeout(2500);
  const n2 = (await bubbles(page)).length;
  ok(n1 === before.length + 1 && n2 === n1, '멈추기 keeps the written part and stops there (' + before.length + ' → ' + n1 + ' → ' + n2 + ')');
  await ctx.close();
}

// ---------- 2b) leaving the proposal mid-run stops it; another proposal shows no shimmer ----------
{
  const ctx = await browser.newContext({ viewport: { width: vw, height: 900 } });
  await ctx.addInitScript(mockAi, ANSWER);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await openProposal(page, 'p_seed_acoffee');
  const before = await bubbles(page);
  await page.click('.end-ai');
  await page.waitForFunction((n) => document.querySelectorAll('.board > .col:not(.ghost)').length > n, before.length, { timeout: 20000 });
  await page.locator('.sb-item:has-text("J 교육지원청")').first().evaluate((e) => e.click());
  await page.waitForTimeout(1200);
  const t2 = await page.inputValue('#pr-title'); ok(t2.includes('J 교육') && await page.locator('.col.ghost').count() === 0, 'another proposal opened mid-run shows no shimmer (' + t2 + ', end-node ' + await page.locator('.end-node').count() + ')');
  await page.waitForTimeout(2500);
  const kept = (await stored(page, 'p_seed_acoffee')).length;
  ok(kept >= before.length + 1 && kept < before.length + 4, 'the left proposal keeps the parts written before leaving (' + before.length + ' → ' + kept + ')');
  ok(!errs.length, 'no page errors ' + errs.join(' / '));
  await ctx.close();
}

// ---------- 3) no AI: rule-based flow, from an empty board ----------
{
  const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await openProposal(page, 'p_seed_acoffee', 'empty');
  ok((await bubbles(page)).length === 0, 'empty board (first-part bubble)');
  await page.click('.end-ai');
  await page.waitForSelector('.col.ghost', { state: 'detached', timeout: 20000 }); await page.waitForTimeout(400);
  const b = await bubbles(page);
  ok(b.length >= 6, 'fallback builds the whole flow from the start: ' + b.join(' | '));
  ok(await page.locator('.toast:has-text("기본 흐름")').count() === 1, 'toast says it used the basic flow');
  // run it again: only the continuation, nothing repeated
  await page.click('.end-ai');
  await page.waitForSelector('.col.ghost', { state: 'detached', timeout: 20000 }); await page.waitForTimeout(400);
  const b2 = await bubbles(page);
  ok(b2.slice(0, b.length).join() === b.join() && new Set(b2).size === b2.length, 'second run only appends, no duplicates: +' + b2.slice(b.length).join(' | '));
  await ctx.close();
}

// ---------- 4) shimmer look (dark + light), held mid-stream ----------
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, colorScheme: scheme });
  await ctx.addInitScript(mockAi, { parts: [] });
  await ctx.addInitScript(() => { const u = window.claude.use; window.claude.use = async (c) => { const s = await u(c); return s && { ...s, json: () => new Promise(() => {}) }; }; });
  const page = await ctx.newPage();
  await openProposal(page, 'p_seed_acoffee');
  await page.click('.end-ai'); await page.waitForSelector('.col.ghost'); await page.waitForTimeout(300);
  // smooth scroll settles (scrollLeft unchanged for 250 ms), then read where the first shimmer bubble is
  const g = await page.$eval('.col.ghost', async (e) => {
    const c0 = document.querySelector('.canvas');
    for (let last = -1, t = 0; t < 40; t++) { await new Promise((r) => setTimeout(r, 250)); if (c0.scrollLeft === last) break; last = c0.scrollLeft; } const r = e.getBoundingClientRect(); const c = document.querySelector('.canvas').getBoundingClientRect(); return { l: r.left, r: r.right, cl: c.left, cr: c.right }; });
  ok(g.l >= g.cl && g.r <= g.cr, scheme + ': canvas brings the shimmer trail into view ' + JSON.stringify(g));
  await page.screenshot({ path: path.join(shots, 'aisb-' + (vw < 600 ? 'm-' : '') + '03-shimmer-' + scheme + '.png') });
  await ctx.close();
}
await browser.close(); srv.close();
