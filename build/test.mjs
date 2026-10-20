import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../dist');
const shots = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'qa');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8765);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const shot = async (n) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(shots, n + '.png') }); console.log('shot', n); };
const step = process.argv[2] || 'all';

await page.goto('http://localhost:8765/');
await page.waitForSelector('.home', { timeout: 20000 });
await page.waitForTimeout(800);
await shot('01-home');

// new proposal → free text + mention
await page.click('.sb-new');
await page.waitForSelector('.me-area');
await page.click('.me-area');
await page.keyboard.type('강남 플래그십 매장 메뉴보드 교체. ');
await page.keyboard.type('@QM');
await page.waitForSelector('.mmenu');
await shot('02-mention');
await page.keyboard.press('Enter');
await page.keyboard.type(' 3면과 키오스크 필요');
await page.waitForTimeout(300);
await shot('03-req-free');
await page.click('.rq-f .btn-primary');
await page.waitForSelector('.modal');
await shot('04-sufficiency');
await page.keyboard.press('Escape');

// seed proposal A
await page.click('.sb-item:has-text("A 커피")');
await page.waitForSelector('.canvas');
await page.waitForTimeout(1200);
await shot('05-storyboard');

// part editor on scenario part (draft)
await page.click('.node-name:has-text("공간 시나리오")');
await page.waitForSelector('.modal');
await shot('06-part-editor');
await page.click('.mfoot .btn-primary');
await page.waitForTimeout(400);
// picker
const addBtn = page.locator('.col:has(.node-name:has-text("공간 시나리오")) .col-actions .btn-primary');
await addBtn.click();
await page.waitForSelector('.pk-grid');
await page.waitForTimeout(1200);
await shot('07-picker-rec');
await page.hover('.pcard >> nth=1');
await page.waitForSelector('.pk-peek');
await page.waitForTimeout(500);
await shot('08-picker-hover');
await page.click('.pcard >> nth=0'); // click selects (picker stays open)
await page.fill('#pk-q', '매장 하루 동선 시간대');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
await shot('09-picker-search');
await page.click('.pcard:not(.sel) >> nth=0');
await page.waitForTimeout(300);
await page.click('.mfoot .btn:has-text("완료")');
await page.waitForTimeout(400);

// detail
await page.click('.col:has(.node-name:has-text("공간 시나리오")) .lcard >> nth=0');
await page.waitForSelector('.detail');
await page.waitForTimeout(800);
await shot('10-detail-refs');
// AI fill — nothing selected = every empty unit
await page.click('.fillcard .btn-primary');
await page.waitForSelector('.fillflow .diff, .fillflow .pk-empty', { timeout: 20000 });
await shot('13-detail-ai-review');
const apply = page.locator('.fillflow .btn-primary');
if (await apply.isEnabled()) await apply.click();
await page.waitForTimeout(500);
await shot('14-detail-applied');
// image click → alternatives popover right next to it
const slot = page.locator('.detail-left [data-img]').first();
if (await slot.count()) { await slot.click(); await page.waitForSelector('.imgpop'); await shot('15-image-pop'); await page.click('.imgpop .ip-opt >> nth=0'); await page.waitForTimeout(400); }
// inline edit on slide
const tb = page.locator('.detail-left [data-tb]').nth(2);
await tb.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('인라인으로 고친 문장'); await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await shot('15b-detail-unit');
await page.click('.done-toggle');
await shot('16-detail-done');
await page.click('.mfoot .btn-primary:has-text("닫기")');

// viewer
await page.click('.top-right button:has-text("레이아웃")');
await page.waitForSelector('.viewer');
await page.waitForTimeout(1200);
await shot('17-viewer');

// ctx modal + AI storyboard
await page.click('[data-ctx="products"]');
await page.waitForSelector('.modal');
await shot('18-ctx-products');
await page.keyboard.press('Escape');
await page.click('.end-ai'); // AI로 나머지 구성 — no popup: shimmer bubbles, then the new parts as bubbles (build/test-aisb.mjs)
await page.waitForSelector('.col.ghost', { state: 'detached', timeout: 60000 });
await shot('19-ai-storyboard');

// export
await page.click('.viewer .btn-primary:has-text("PPTX 내보내기")');
await page.waitForSelector('.modal');
await shot('20-export');
const dl = page.waitForEvent('download', { timeout: 120000 });
await page.click('.mfoot .btn-primary:has-text("PPTX")');
const d = await dl;
const fp = path.join(shots, 'export.pptx');
await d.saveAs(fp);
console.log('pptx bytes', fs.statSync(fp).size);
await page.waitForTimeout(500);
await shot('21-after-export');

// home again & mobile
await page.click('.sb-home');
await page.waitForTimeout(800);
await shot('22-home-after');
await page.setViewportSize({ width: 400, height: 860 });
await page.waitForTimeout(500);
await shot('23-mobile-home');
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
console.log('mobile scrollWidth', sw);

console.log('ERRORS:\n' + errs.slice(0, 40).join('\n'));
await browser.close(); srv.close();
