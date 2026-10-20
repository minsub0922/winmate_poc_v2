// Layout template library: sidebar entry, grouped browse (sections indented under 구분 / 원본 장표 groups, all shown — no 더보기),
// hover detail, search, filters, detail, PPTX download, mobile, dark.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8767);
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const errs = [];
const mk = async (opts) => {
  const ctx = await browser.newContext({ acceptDownloads: true, deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  return { ctx, page };
};
const shot = async (page, n, full = false) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(shots, 'lib-' + n + '.png'), fullPage: full }); console.log('shot', n); };

{
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:8767/');
  await page.waitForSelector('.sb-tpl', { state: 'attached', timeout: 60000 });
  await page.click('.sb-tpl');
  await page.waitForSelector('.tl-card');
  await page.waitForTimeout(1200);
  await shot(page, '01-default');
  console.log('sections', await page.locator('.tl-sec').count(), 'cards', await page.locator('.tl-card').count(), 'sum', await page.locator('.tl-sum b').innerText());
  const g = await page.evaluate(() => {
    const grp = document.querySelector('.tl-grp'); const h = grp.querySelector('.tl-grp-h').getBoundingClientRect(); const sec = grp.querySelector('.tl-sec').getBoundingClientRect();
    return { groups: document.querySelectorAll('.tl-grp').length, indent: Math.round(sec.left - h.left), guide: getComputedStyle(grp.querySelector('.tl-grp-in')).borderLeftWidth,
      cards: document.querySelectorAll('.tl-card').length, sum: +document.querySelector('.tl-sum b').textContent, more: document.querySelectorAll('.tl-more').length,
      marks: (document.querySelector('.tl-sections').innerText.match(/사진 버전 있음|사진 중심/g) || []).length };
  });
  console.log('groups', g.groups, 'indent', g.indent, 'guide', g.guide, 'all shown', g.cards === g.sum && g.more === 0, 'photo marks', g.marks);
  if (g.cards !== g.sum || g.more) errs.push('FAIL not all layouts shown ' + g.cards + ' / ' + g.sum);
  if (g.indent < 20) errs.push('FAIL sections not indented under group ' + g.indent);
  if (g.marks) errs.push('FAIL photo marks on cards ' + g.marks);
  const c2 = page.locator('.tl-card').nth(1); await c2.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await c2.hover(); await page.waitForTimeout(800);
  console.log('hover detail', await page.locator('.pk-peek').count(), await page.locator('.pk-peek .pp-name').innerText().catch(() => ''));
  if (!(await page.locator('.pk-peek').count())) errs.push('FAIL no hover detail on template card');
  await shot(page, '01b-hover');
  await page.mouse.move(1300, 120); await page.waitForTimeout(300);
  // filter popup: 구분 → 파트 유형
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.click('.tlf-grp:has-text("공간 · 제품")'); await page.click('.tlf-go'); await page.waitForSelector('.modal.tlf', { state: 'detached' });
  await page.waitForTimeout(600);
  await shot(page, '02-tab-space');
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.click('.tlf-chip:has-text("공간 시나리오")'); await page.click('.tlf-go'); await page.waitForSelector('.modal.tlf', { state: 'detached' });
  await page.waitForTimeout(600);
  console.log('scenario', await page.locator('.tl-sum b').innerText());
  // industry filter
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.click('.tlf-chip:has-text("호텔 · 리조트")'); await page.click('.tlf-go'); await page.waitForSelector('.modal.tlf', { state: 'detached' });
  await page.waitForTimeout(600);
  await shot(page, '03-scenario-hotel');
  console.log('scenario+HT', await page.locator('.tl-sum b').innerText());
  // reset, then search
  await page.click('.tl-on .btn:has-text("모두 지우기")');
  await page.fill('#tl-q', '경쟁사와 비교하는 표');
  await page.waitForTimeout(800);
  await shot(page, '04-search');
  console.log('search', await page.locator('.tl-sum b').innerText(), await page.locator('.tl-card .tl-name').first().innerText());
  await page.fill('#tl-q', 'MS-A');
  await page.waitForTimeout(500);
  console.log('code search first', await page.locator('.tl-card .tl-name').first().innerText());
  await page.fill('#tl-q', '');
  // 원본 장표 filter (was the 원본 장표별 view)
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.click('.tlf-chip:has-text("01 MI")'); await page.click('.tlf-go'); await page.waitForSelector('.modal.tlf', { state: 'detached' });
  await page.waitForTimeout(800);
  await shot(page, '05-deck-mi');
  console.log('deck MI', await page.locator('.tl-sum b').innerText(), 'sections', await page.locator('.tl-sec').count());
  // solution filter + image filter
  await page.click('.tl-on .btn:has-text("모두 지우기")');
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.click('.tlf-chip:has-text("MagicINFO") >> nth=0'); await page.click('.tlf-chip:has-text("이미지 4칸 이상")'); await page.click('.tlf-go'); await page.waitForSelector('.modal.tlf', { state: 'detached' });
  await page.waitForTimeout(600);
  console.log('magicinfo+img4', await page.locator('.tl-sum b').innerText());
  await shot(page, '06-filters');
  // detail
  await page.locator('.tl-card').first().click();
  await page.waitForSelector('.tl-detail');
  await page.waitForTimeout(800);
  await shot(page, '07-detail');
  const t1 = await page.locator('.mhead h2').innerText();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const t2 = await page.locator('.mhead h2').innerText();
  console.log('nav', t1, '→', t2, await page.locator('.mfoot .note').innerText());
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.click('.mfoot .btn-primary');
  const d = await dl; const p = path.join(shots, 'lib-single.pptx'); await d.saveAs(p); console.log('download', d.suggestedFilename(), fs.statSync(p).size);
  await page.keyboard.press('Escape');
  // bulk export
  await page.click('.tl-sum .btn');
  await page.waitForSelector('#tl-ex-name');
  await shot(page, '08-export');
  const dl2 = page.waitForEvent('download', { timeout: 60000 });
  await page.click('.mfoot .btn-primary');
  const d2 = await dl2; const p2 = path.join(shots, 'lib-list.pptx'); await d2.saveAs(p2); console.log('bulk', d2.suggestedFilename(), fs.statSync(p2).size);
  // reload keeps route + filters
  await page.reload();
  await page.waitForSelector('.tl-card', { timeout: 30000 });
  console.log('after reload', await page.locator('.tl-sum').innerText());
  await page.click('.tl-on .btn:has-text("모두 지우기")');
  await ctx.close();
}
{
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await page.goto('http://localhost:8767/');
  await page.waitForSelector('.sb-tpl', { state: 'attached', timeout: 60000 });
  await page.click('.sb-tpl');
  await page.waitForSelector('.tl-card'); await page.mouse.move(900, 600); await page.waitForTimeout(400); // the sidebar rail opens under the pointer
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.click('.tlf-grp:has-text("분석 · 이해")'); await page.click('.tlf-go'); await page.waitForSelector('.modal.tlf', { state: 'detached' });
  await page.waitForTimeout(1200);
  await shot(page, '09-dark');
  await ctx.close();
}
{
  const { ctx, page } = await mk({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8767/');
  await page.waitForSelector('.mob-top', { timeout: 30000 });
  await page.click('.mob-top .btn');
  await page.waitForTimeout(400);
  await shot(page, '10-m-sidebar');
  await page.click('.sb-tpl');
  await page.waitForSelector('.tl-card');
  await page.waitForTimeout(1200);
  await shot(page, '11-m-lib');
  const ow = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.querySelector('.tl').scrollWidth, document.querySelector('.tl').clientWidth]);
  console.log('mobile overflow', ow);
  await page.locator('.tl-card').first().click();
  await page.waitForSelector('.tl-detail');
  await page.waitForTimeout(800);
  await shot(page, '12-m-detail');
  await ctx.close();
}
console.log('errors', errs.length ? errs : 'none');
await browser.close(); srv.close();
