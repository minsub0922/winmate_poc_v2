// 파트 편집 팝업: 열자마자 이름 칸에 포커스 · 선택 · 추천 목록이 생기지 않음 (새 파트는 바로 입력 가능 유지)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const PORT = 9071 + Math.floor(Math.random() * 100);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
// fixture: the A 커피 example as it was before the history rework (its 핵심 수치 4 · 제품 3 sheets are what this test drives) — planted once per tab
const A_FIX = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures/seed_v3_sample.json'), 'utf8')).find((p) => p.id === 'p_seed_acoffee');
const PLANT = `if (!sessionStorage.getItem('fx')) { localStorage.setItem('winmate.v2.proposals', ${JSON.stringify(JSON.stringify([A_FIX]))}); localStorage.setItem('winmate.v2.seedv', '4'); sessionStorage.setItem('fx', '1'); }`;
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); await page.addInitScript(PLANT);
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:' + PORT + '/'); await page.waitForSelector('.home');
await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
const state = () => page.evaluate(() => { const a = document.activeElement, n = document.getElementById('pe-name'); return { active: a ? (a.id || a.className) : '', sel: n ? n.selectionEnd - n.selectionStart : -1, sugs: !!document.querySelector('.pe-sugs'), title: (document.querySelector('.mhead h2') || {}).textContent }; });
for (const sel of ['.col .node >> nth=0', '.col .node-name >> nth=1']) {
  await page.click(sel); await page.waitForSelector('#pe-name'); await page.waitForTimeout(400);
  const s = await state(); console.log(sel, JSON.stringify(s));
  ok(s.title === '파트 편집' && s.active !== 'pe-name' && s.sel === 0 && !s.sugs, '파트 편집: 이름 칸 포커스 · 선택 · 추천 목록 없음');
  await page.screenshot({ path: path.join(shots, 'pf-edit.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(250); ok(!(await page.$('#pe-name')), 'Esc still closes the popup');
}
// click into the name still works as before
await page.click('.col .node >> nth=0'); await page.waitForSelector('#pe-name'); await page.click('#pe-name'); await page.waitForTimeout(150);
ok((await state()).active === 'pe-name' && !!(await page.$('.pe-sugs')), 'clicking the name focuses it and opens suggestions');
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
// new part keeps typing right away
await page.click('.end-plus'); await page.waitForSelector('#pe-name'); await page.waitForTimeout(400);
const n = await state(); console.log('new', JSON.stringify(n)); ok(n.title === '새 파트' && n.active === 'pe-name', '새 파트: 이름 칸 바로 입력 (그대로)');
console.log(errs.length ? errs : 'all ok'); await browser.close(); srv.close();
