// 표준 제안서 2025 버티컬(bs23 AI 스토어 · bs24 AI 오피스 · bs25 AI 아파트) — Best Scenario 표준 제안서 그룹 줄 · 상세 보기(읽기 전용 Storyboard: 파트 · 카드 수 · 파트마다 2장 이상) · 사진 묶음(v25) · PPTX · 활용하기 · 쪽 번호
// node build/test-std-v25.mjs [nopptx]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const NOPPTX = process.argv.includes('nopptx');
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200); fs.createReadStream(f).pipe(r);
}).listen(8772);
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const errs = [];
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const open = async () => {
  await page.goto('http://localhost:8772/'); await page.waitForSelector('.sb-bs', { timeout: 30000 }); await page.click('.sb-bs'); await page.waitForSelector('.bsl');
  await page.mouse.move(1430, 890); await page.waitForTimeout(2000);
};
await open();
const grp = await page.evaluate(() => { const g = document.querySelector('.bsp-group'); return [g.getAttribute('aria-label'), [...g.querySelectorAll('.bsl .bsl-t')].map((e) => e.innerText)]; });
console.log('std group', JSON.stringify(grp));
const DECKS = [['bs23', 'AI 스토어', 38, 'v25'], ['bs24', 'AI 오피스', 38, 'v25'], ['bs25', 'AI 아파트', 37, 'v25']];
let bad = 0;
for (const [id, word, want, pack] of DECKS) {
  if (id !== 'bs23') await open();
  const k = grp[1].findIndex((t) => t.includes(word));
  if (k < 0) { console.log(id, 'row NOT FOUND'); bad++; continue; }
  const row = page.locator('.bsp-group').first().locator('.bsl').nth(k);
  await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(2500);
  const imgs = await row.evaluate((r) => [...r.querySelectorAll('img[data-fill]')].map((i) => [i.getAttribute('data-fill'), i.src.startsWith('blob:') && i.naturalWidth > 0]));
  console.log(id, 'row images', imgs.length, imgs.every((x) => x[1]), imgs.filter((x) => x[0].includes(pack)).length, 'from', pack);
  await row.screenshot({ path: path.join(shots, `${id}-01-row.png`) });
  await row.locator('.bsl-more').click(); await page.waitForSelector('.modal.sbv .canvas-wrap.ro .col'); await page.waitForTimeout(4000);
  const n = await page.evaluate(() => document.querySelectorAll('.modal.sbv .lcard').length);
  const parts = await page.evaluate(() => [...document.querySelectorAll('.modal.sbv .col')].map((c) => c.querySelector('.node-name') ? c.querySelector('.node-name').innerText + ':' + c.querySelectorAll('.lcard').length : '?'));
  console.log(id, 'storyboard parts', JSON.stringify(parts), '· layout cards', n, '(+ 표지 1)', n + 1 === want ? 'OK' : 'WANT ' + want); if (n + 1 !== want) bad++;
  if (parts.some((x) => !/:(\d+)$/.test(x) || +x.split(':').pop() < 2)) { console.log(id, 'part with < 2 layouts'); bad++; }
  await page.screenshot({ path: path.join(shots, `${id}-02-storyboard.png`) });
  await page.evaluate(async () => { const c = document.querySelector('.modal.sbv .canvas'); for (let x = 0; x < c.scrollWidth; x += 600) { c.scrollLeft = x; await new Promise((r) => setTimeout(r, 350)); } });
  await page.waitForTimeout(2500);
  const chk = await page.evaluate(() => [...document.querySelectorAll('.modal.sbv .lcard')].map((s, k) => {
    const im = [...s.querySelectorAll('img[data-fill]')]; const miss = im.filter((i) => !(i.naturalWidth > 0)).map((i) => i.getAttribute('data-fill'));
    return [k + 1, im.length, miss];
  }).filter((x) => x[2].length));
  console.log(id, 'cards with missing pictures', JSON.stringify(chk).slice(0, 400)); if (chk.length) bad++;
  if (!NOPPTX) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('.modal.sbv button:has-text("PPTX로 받기")')]);
    const p = path.join(shots, `${id}.pptx`); await dl.saveAs(p); console.log(id, 'pptx', fs.statSync(p).size);
  }
  await page.click('.modal.sbv .mfoot button:has-text("활용하기")'); await page.waitForSelector('.bsu');
  await page.click('.modal:has(.bsu) button.btn-primary:has-text("활용하기")');
  await page.waitForSelector('.canvas', { timeout: 20000 }); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shots, `${id}-03-proposal.png`) });
  const pg = await page.evaluate(() => [...document.querySelectorAll('[data-pgno]')].map((e) => e.textContent).slice(0, 12));
  console.log(id, 'page numbers in proposal', JSON.stringify(pg));
}
console.log('errors', errs.length ? errs.slice(0, 5) : 'none');
console.log(bad ? `FAIL ${bad}` : 'PASS');
await browser.close(); srv.close();
