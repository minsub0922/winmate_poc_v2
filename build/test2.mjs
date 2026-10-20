import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { console.log('404', q.url); r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8767);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: process.argv[2] === 'dark' ? 'dark' : 'light' });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const pre = process.argv[2] === 'dark' ? 'd-' : 'b-';
const shot = async (n) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(shots, pre + n + '.png') }); console.log('shot', n); };

await page.goto('http://localhost:8767/');
await page.waitForSelector('.home', { timeout: 20000 });
await page.waitForTimeout(600);
if (process.argv[2] === 'dark') {
  await shot('01-home');
  await page.click('.sb-item:has-text("A 커피")');
  await page.waitForSelector('.canvas'); await page.waitForTimeout(1200);
  await shot('02-story');
  await page.click('.lcard >> nth=0'); await page.waitForSelector('.detail'); await page.waitForTimeout(800);
  await shot('03-detail');
  await page.keyboard.press('Escape');
  await page.click('.top-right button:has-text("레이아웃")'); await page.waitForTimeout(1000);
  await shot('04-viewer');
  await page.click('.start-node .node-name'); await page.waitForSelector('.rq-pop'); await page.waitForTimeout(400);
  await shot('05-req');
  console.log('ERRORS', errs); await browser.close(); srv.close(); process.exit(0);
}

// new proposal (whole start card is the button) → 입력 폼 tab
await page.click('.home-actions .start');
await page.waitForSelector('.tab:has-text("입력 폼")');
await page.click('.tab:has-text("입력 폼")');
await page.waitForSelector('.form-grid');
const inputs = page.locator('.form-grid input');
await inputs.nth(0).fill('본사 사옥 스마트 오피스 전환');
await inputs.nth(1).fill('C 제약');
await inputs.nth(2).fill('경영지원본부장');
await shot('01-form');
await page.locator('.req-files').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await shot('02-files');
await page.click('.rq-f .btn-primary');
await page.waitForSelector('.modal');
await page.waitForTimeout(300);
await shot('03-suff');
// add a product via recommendations inside the modal
const plus = page.locator('.modal .btn-icon[aria-label*="추가"]').first();
if (await plus.count()) await plus.click();
await page.waitForTimeout(300);
await page.click('.mfoot .btn-primary');
await page.waitForSelector('.canvas');
await page.waitForTimeout(600);
await shot('04-empty-story');
await page.click('.cand-card .cand >> nth=0');
await page.waitForSelector('.modal');
await page.click('.mfoot .btn-primary:has-text("작성 완료")');
await page.waitForTimeout(500);
await shot('05-first-part');
// next part candidates popover
await page.click('.end-plus');
await page.waitForTimeout(400);
await shot('06-next-cands');
await page.waitForSelector('.modal');
await page.fill('#pe-name', '도입 사례');
await page.click('.mhead h2'); await page.waitForTimeout(150); await page.click('.pe-all-btn'); await page.waitForSelector('.pe-all'); await page.click('.pe-all button:has-text("유관 사례")');
if (await page.$('#pe-text')) { const v = await page.inputValue('#pe-text'); if (!v.trim()) await page.fill('#pe-text', '비슷한 매장의 도입 성과\n메뉴보드 교체 사례'); }
await page.click('.mfoot .btn-primary:has-text("작성 완료")');
await page.waitForTimeout(400);
// search for photo case layout
await page.locator('.col').nth(1).locator('.col-actions .btn-primary').click();
await page.waitForSelector('#pk-q');
await page.fill('#pk-q', '사례 사진 카드');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
await shot('07-search-photo');
await page.click('.pcard >> nth=0');
await page.waitForTimeout(300);
await page.click('.mfoot .btn:has-text("완료")');
await page.waitForTimeout(400);
await page.locator('.col').nth(1).locator('.lcard').first().click();
await page.waitForSelector('.detail');
await page.waitForTimeout(400);
await shot('08-detail-imgslots');
await page.click('.detail-left [data-img] >> nth=0');
await page.waitForSelector('.imgrid');
await shot('09-image-picker');
await page.click('.imgopt >> nth=2');
await page.waitForTimeout(400);
// upload a file into slot 2
await page.click('.detail-left [data-img] >> nth=1');
await page.waitForSelector('.imgrid');
await page.setInputFiles('.modal input[type=file]', path.resolve(here, '../img/life-window.jpg'));
await page.waitForTimeout(800);
// nested escape check: open picker then escape once → detail stays
await page.click('.detail-left [data-img] >> nth=2');
await page.waitForSelector('.imgrid');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const stillDetail = await page.locator('.detail').count();
console.log('detail still open after nested Esc:', stillDetail);
await shot('10-detail-filled');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await shot('11-story-after');
console.log('ERRORS', errs);
await browser.close(); srv.close();
