// Best Scenario page (sidebar): a list (one scenario per row) indented under 요구사항 groups — big title + summary, a '상세 보기' button,
// three big sheets (no numbers, no captions; a sheet click opens its detail popup), no scenario counts,
// the deck's first sheets (s.preview, up to 4) · search (flat list) · filter popup (test-bsfilter.mjs has the details) · filter marks · row → read-only Storyboard (test-sbview.mjs),
// slide peek, 전체 PPT 보기, PPTX, 활용하기 → my proposal, template page no longer shows scenarios, mobile, dark.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa');
fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200); fs.createReadStream(f).pipe(r);
}).listen(8769);
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
const shot = async (page, n) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(shots, 'bs-' + n + '.png') }); console.log('shot', n); };
const toPage = async (page) => { await page.goto('http://localhost:8769/'); await page.waitForSelector('.sb-bs', { timeout: 30000 }); await page.click('.sb-bs'); await page.waitForSelector('.bsl'); await page.mouse.move(900, 600); await page.waitForTimeout(1200); };

{
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:8769/'); await page.waitForSelector('.sb-tpl', { timeout: 30000 });
  await page.click('.sb-tpl'); await page.waitForSelector('.tl-card'); await page.waitForTimeout(500);
  console.log('scenarios on template page', await page.locator('.bs, .bsf, .bsi, .bsl').count());
  await page.click('.sb-bs'); await page.waitForSelector('.bsl'); await page.mouse.move(900, 600); await page.waitForTimeout(1500);
  await shot(page, '01-page');
  const lay = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.bsp-list:not(.flat) .bsl')];
    const lefts = new Set(rows.map((r) => Math.round(r.getBoundingClientRect().left)));
    const g = document.querySelector('.bsp-group'); const gh = g.querySelector('.bsp-gh').getBoundingClientRect(); const row = g.querySelector('.bsl').getBoundingClientRect();
    const t = g.querySelector('.bsl-t'); const d = g.querySelector('.bsl-d');
    return { rows: rows.length, perLine: Math.max(...Object.values(rows.reduce((m, r) => { const y = Math.round(r.getBoundingClientRect().top); m[y] = (m[y] || 0) + 1; return m; }, {}))),
      sameLeft: lefts.size, indent: Math.round(row.left - gh.left), titlePx: getComputedStyle(t).fontSize, titleAboveDetail: t.getBoundingClientRect().bottom <= d.getBoundingClientRect().top + 1,
      sheets: rows.map((r) => r.querySelectorAll('.bsl-sheet').length), sheetW: Math.round(rows[0].querySelector('.bsl-sheet').getBoundingClientRect().width),
      numbers: rows.reduce((n, r) => n + r.querySelectorAll('.bsl-sheet .pg, .bsl-role, .bsl-dd').length, 0), rowIsButton: rows.some((r) => r.tagName === 'BUTTON') };
  });
  console.log('groups', await page.locator('.bsp-group').count(), 'rows', lay.rows, 'per line', lay.perLine, 'row x positions', lay.sameLeft, 'indent', lay.indent, 'title', lay.titlePx, 'title above details', lay.titleAboveDetail, 'sidebar current', await page.locator('.sb-bs[aria-current="page"]').count());
  console.log('sheets per row', [...new Set(lay.sheets)].join(' | '), 'sheet width', lay.sheetW, 'numbers · captions · details on rows', lay.numbers, 'whole row clickable', lay.rowIsButton);
  console.log('header count', await page.locator('.tl-head h1 .num').count(), 'group counts', await page.locator('.bsp-gh .num').count(), 'n scenarios text', await page.evaluate(() => /\d+개 시나리오/.test(document.querySelector('.bsp').innerText)), 'intro', await page.locator('.tl-head p').innerText());
  console.log('상세 보기 buttons', await page.locator('.bsl-more').count(), 'height', await page.locator('.bsl-more').first().evaluate((e) => Math.round(e.getBoundingClientRect().height)));
  console.log('sidebar icon is not the sparkle', await page.evaluate(() => !document.querySelector('.sb-bs svg path').getAttribute('d').startsWith('M12 2.5l1.9')), 'bg-photo marks', await page.evaluate(() => (document.querySelector('.bsp-groups').innerText.match(/배경 사진/g) || []).length));
  const sh = page.locator('.bsl').first().locator('.bsl-sheet').nth(2); await sh.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await sh.hover(); await page.waitForTimeout(800);
  console.log('sheet hover detail', await page.locator('.pk-peek').count(), await page.locator('.pk-peek .pp-rank').allInnerTexts(), (await page.locator('.pk-peek .pp-meta dd').first().innerText().catch(() => '')).slice(0, 30));
  await shot(page, '01c-sheet-hover');
  await page.mouse.move(1300, 120); await page.waitForTimeout(300);
  // a sheet click → that sheet's detail popup (filled values · role in this scenario)
  await page.locator('.bsl').first().locator('.bsl-sheet').nth(1).click(); await page.waitForSelector('.modal .tl-detail'); await page.waitForTimeout(600);
  console.log('sheet click → detail', await page.locator('.modal .mhead h2').innerText(), '|', await page.locator('.modal .tl-role p').innerText(), '|', await page.locator('.modal .mfoot .note').innerText());
  await shot(page, '01d-sheet-detail');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('modals after close', await page.locator('.modal').count());
  // search → one flat list by relevance, requirement shown on each row
  await page.fill('#bs-q', '메뉴보드'); await page.waitForTimeout(600);
  console.log('search rows', await page.locator('.bsp-list.flat .bsl').count(), 'req labels', await page.locator('.bsl-req').count(), 'snips', await page.locator('.bsl-snip').count());
  await shot(page, '02-search');
  await page.fill('#bs-q', ''); await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.click('.tlf-chip:has-text("투자 회수형")'); await page.click('.tlf-go'); await page.waitForTimeout(500);
  console.log('strategy filter rows', await page.locator('.bsl').count(), 'chips', (await page.locator('.tl-onchip').allInnerTexts()).join(' / ').replace(/\n/g, ' '));
  await shot(page, '02b-filter');
  await page.click('.tl-on .btn:has-text("모두 지우기")'); await page.waitForTimeout(400);
  await page.click('.bsl:has-text("F&B 프랜차이즈") .bsl-more');
  await page.waitForSelector('.modal.sbv .canvas-wrap.ro .col'); await page.waitForTimeout(1200);
  await shot(page, '03-storyboard');
  console.log('storyboard (read-only) parts', await page.locator('.modal.sbv .col').count(), 'layouts', await page.locator('.modal.sbv .lcard').count(), 'edit affordances', await page.locator('.modal.sbv .conn-plus, .modal.sbv .col-actions, .modal.sbv .end-node').count(), '(test-sbview.mjs has the details)');
  await page.locator('.modal.sbv .lcard').nth(5).scrollIntoViewIfNeeded(); await page.waitForTimeout(700);
  await page.locator('.modal.sbv .lcard').nth(5).click(); await page.waitForSelector('.tl-role'); await page.waitForTimeout(500);
  console.log('peek', await page.locator('.tl-role p').innerText());
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('자세히 보기 button gone', (await page.locator('.mfoot button:has-text("자세히 보기")').count()) === 0);
  await page.click('.mfoot button:has-text("전체 PPT 보기")'); await page.waitForSelector('.modal .tl-detail'); await page.waitForTimeout(800);
  console.log('전체 PPT 보기 → deck view', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal')].pop(); const t = m.innerText.match(/\d+\s*\/\s*\d+/); return t ? t[0] : '?'; }));
  await shot(page, '05-deck');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.click('.mfoot button:has-text("PPTX로 받기")');
  const d = await dl; const p = path.join(shots, 'bs01.pptx'); await d.saveAs(p); console.log('pptx', fs.statSync(p).size);
  await page.click('.mfoot button:has-text("활용하기")'); await page.waitForSelector('.modal.narrow');
  await page.click('.modal.narrow .mfoot .btn-primary');
  await page.waitForSelector('.story .canvas-wrap:not(.ro)', { timeout: 20000 }); await page.waitForTimeout(1000);
  console.log('started proposal, modals left', await page.locator('.modal').count());
  await page.waitForTimeout(1500); await shot(page, '05b-proposal');
  const filled = await page.evaluate(() => Array.from(document.querySelectorAll('.slide-inner')).slice(0, 6).map((e) => /\[0+\]|\[고객사\]/.test(e.textContent) ? 'placeholder' : 'ok'));
  console.log('proposal slides filled', filled.join(','), 'done badges', await page.locator('.stbadge.done').count());
  await page.reload(); await page.waitForSelector('.sb-item', { timeout: 30000 });
  await page.click('.sb-bs'); await page.waitForSelector('.bsl'); await page.reload(); await page.waitForSelector('.sb-item', { timeout: 30000 }); await page.waitForTimeout(800);
  console.log('route kept after reload', await page.locator('.bsp').count());
  await ctx.close();
}
{
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await toPage(page); await shot(page, '06-dark');
  await ctx.close();
}
{
  const { ctx, page } = await mk({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8769/'); await page.waitForSelector('.mob-top', { timeout: 30000 });
  await page.click('.mob-top .btn'); await page.waitForTimeout(300);
  await page.click('.sb-bs'); await page.waitForSelector('.bsl'); await page.waitForTimeout(900);
  await shot(page, '07-m-page');
  await page.locator('.bsl-sheets').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
  await shot(page, '07b-m-sheets');
  console.log('mobile sheets', await page.evaluate(() => { const w = document.querySelector('.bsl-sheets'); return [w.querySelectorAll('.bsl-sheet').length, Math.round(w.querySelector('.bsl-sheet').getBoundingClientRect().width), w.scrollWidth > w.clientWidth ? 'swipe' : 'fits']; }));
  console.log('mobile overflow', await page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('.bsp').scrollWidth, document.querySelector('.bsp').clientWidth]));
  await page.locator('.bsl-more').first().click(); await page.waitForSelector('.modal.sbv .col'); await page.waitForTimeout(900);
  await shot(page, '08-m-storyboard');
  console.log('modal overflow', await page.evaluate(() => { const m = document.querySelector('.modal'); return [m.scrollWidth, m.clientWidth]; }));
  await ctx.close();
}
console.log('errors', errs.length ? errs : 'none');
await browser.close(); srv.close();
