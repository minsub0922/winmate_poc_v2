// My 템플릿 (PPT 레이아웃 템플릿 › My): My 버튼이 필터 오른쪽 · 비어 있으면 업로드가 먼저(큰 영역) · PPTX 가져오기(복원 진행 → 장 고르기 · 이름 · 파트 유형,
// 숨긴 장은 처음에 빠짐) → 파일별 묶음 목록 · 새로고침 뒤에도 남음(IndexedDB) · 상세(이름 · 파트 바꾸기, 출처, 쓰는 곳) · 편집기(글 고치기 · 끌어 옮기기 ·
// 크기 · 글자 크기 · 색 바꾸기 · 글 상자 · 이미지 칸 + 라이브러리 사진 · 되돌리기, 덮어쓰기 · 새로 저장) · 기존 레이아웃 '고쳐서 My에 저장' →
// '고쳐 만든 레이아웃' 묶음 · 제안서 'PPT 레이아웃 추가'의 My 템플릿 섹션에서 골라 넣기 · PPTX 받기(원본 글꼴 유지) · 지우기 · 모바일 · 다크
import { chromium } from 'playwright';
import JSZip from 'jszip';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const FIX = path.resolve(here, 'fixtures/my_sample.pptx');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const URL0 = 'http://localhost:' + srv.address().port + '/';
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
const shot = (page, n) => page.waitForTimeout(350).then(() => page.screenshot({ path: path.join(shots, 'my-' + n + '.png') }));
const watch = (page, name) => { page.on('pageerror', (e) => errs.push(name + ' pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|Failed to load resource/.test(m.text())) errs.push(name + ': ' + m.text()); }); };
const toLib = async (page, mobile) => {
  await page.waitForSelector('.sb-tpl', { state: 'attached', timeout: 60000 });
  if (mobile) { await page.click('.mob-top .btn'); await page.waitForTimeout(300); }
  await page.click('.sb-tpl'); await page.waitForSelector('.tl-card, .my-drop'); if (!mobile) await page.mouse.move(900, 700); await page.waitForTimeout(500);
};
const count = async (page) => +(await page.locator('.tl-sum b').first().innerText());

// ---------- desktop ----------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage(); watch(page, 'desk');
await page.goto(URL0); await toLib(page);
const all = await count(page);
{ const fb = await (await page.$('.tl-fbtn')).boundingBox(), mb = await (await page.$('.tl-mybtn')).boundingBox();
  ok(mb.x > fb.x + fb.width && Math.abs((mb.y + mb.height / 2) - (fb.y + fb.height / 2)) < 2 && mb.x - (fb.x + fb.width) < 16, 'My button sits right next to 필터'); }
ok((await page.locator('.tl-mybtn').innerText()).trim() === 'My', 'My button without a count when empty');
await page.click('.tl-mybtn'); await page.waitForSelector('.my-drop');
ok(await page.$eval('.tl-mybtn', (e) => e.getAttribute('aria-pressed')) === 'true', 'My on');
ok(!!(await page.$('.my-drop.big')) && (await count(page)) === 0 && !(await page.$('.tl-card')), 'empty My: the upload comes first, big, no cards');
ok(/고쳐서 My에 저장/.test(await page.locator('.my-or').innerText()), 'how to start from an existing layout is shown');
await shot(page, '01-empty');
// ---- import ----
await page.setInputFiles('input[data-my-file]', FIX);
await page.waitForSelector('.my-prog, .my-imp-card', { timeout: 30000 });
await page.waitForSelector('.my-imp-card', { timeout: 120000 }); await page.waitForTimeout(1200);
const cards = await page.$$('.my-imp-card');
ok(cards.length === 5, 'review shows every page: ' + cards.length);
const on = await page.$$eval('.my-imp-card', (es) => es.map((e) => e.classList.contains('on')));
ok(on.slice(0, 4).every(Boolean) && on[4] === false, 'hidden page starts unchecked');
const names = await page.$$eval('.my-imp-card .input:not(select)', (es) => es.map((e) => e.value));
ok(names[0] === '스마트 매장 디지털 전환 제안' && names[1] === '매장 운영을 바꾸는 세 가지 방법' && names[2] === '도입 전후 비교', 'names from the slide titles: ' + names.slice(0, 4).join(' | '));
ok(/글 \d+ · 이미지 1/.test(await page.locator('.my-imp-card >> nth=1').innerText()), 'slots counted (page 2 has a photo slot)');
await shot(page, '02-review');
await page.fill('.my-imp-card >> nth=3 >> input.input', '실행 계획 · 단계 도입');
await page.selectOption('.my-imp-card >> nth=3 >> select', 'execution');
await page.click('.my-imp-card >> nth=0 >> .my-imp-th'); // leave page 1 out
ok((await page.locator('.mfoot .btn-primary').innerText()).includes('3장'), 'save button counts the chosen pages');
await page.click('.mfoot .btn-primary'); await page.waitForSelector('.modal', { state: 'detached' }); await page.waitForTimeout(600);
ok((await count(page)) === 3 && (await page.locator('.tl-mybtn .tl-fn').innerText()) === '3', 'saved 3 · My badge 3');
ok((await page.locator('.my-grp .tl-grp-h h2').first().innerText()) === 'my_sample.pptx', 'grouped under the file name');
ok(!(await page.$('.my-drop.big')) && !!(await page.$('.my-drop')), 'upload stays first, compact once there are templates');
const t2 = await page.$$eval('.my-grp .tl-card .tl-name', (es) => es.map((e) => e.textContent));
ok(t2.join('|') === '매장 운영을 바꾸는 세 가지 방법|도입 전후 비교|실행 계획 · 단계 도입', 'page order + edited name: ' + t2.join(' | '));
// the converted slide is drawn: shapes, picture, table, chart
const drawn = await page.evaluate(() => { const c = document.querySelectorAll('.my-grp .tl-card .slide-inner'); return Array.from(c).map((e) => ({ svg: e.querySelectorAll('svg').length, img: e.querySelectorAll('img').length, tb: e.querySelectorAll('[data-tb]').length, table: e.querySelectorAll('table').length })); });
ok(drawn[0] && drawn[0].img >= 1 && drawn[0].svg >= 2 && drawn[1].table === 1 && drawn[1].svg >= 1, 'shapes · photo · table · chart drawn: ' + JSON.stringify(drawn));
await page.mouse.move(5, 5); await shot(page, '03-list');
// ---- persists ----
await page.reload(); await toLib(page);
ok(await page.$eval('.tl-mybtn', (e) => e.getAttribute('aria-pressed')) === 'true' && (await count(page)) === 3, 'after reload: still My, 3 templates (IndexedDB)');
const imgOk = await page.evaluate(async () => { const im = document.querySelector('.my-grp .tl-card img'); if (!im) return false; if (!im.complete) await new Promise((r) => { im.onload = im.onerror = r; }); return im.naturalWidth > 10 && /^blob:/.test(im.src); });
ok(imgOk, 'stored photo comes back as a blob picture');
// search inside My
await page.fill('#tl-q', '장애 확인'); await page.waitForTimeout(300);
ok((await count(page)) === 1 && !/관련도순/.test(await page.locator('.tl-sum').innerText()), 'search finds the template by its text (장애 확인 → 비교표)');
await page.fill('#tl-q', ''); await page.waitForTimeout(200);
// ---- detail ----
await page.click('.my-grp .tl-card >> nth=1'); await page.waitForSelector('.my-detail');
ok(/my_sample\.pptx 3쪽/.test(await page.locator('.my-detail').innerText()), 'detail shows the source (file · page)');
await page.fill('#my-d-name', '전후 비교표 (표 + 차트)'); await page.press('#my-d-name', 'Enter'); await page.waitForTimeout(300);
await page.selectOption('#my-d-part', 'effect'); await page.waitForTimeout(300);
await shot(page, '04-detail');
await page.keyboard.press('Escape'); await page.waitForSelector('.my-detail', { state: 'detached' });
ok((await page.locator('.my-grp .tl-card >> nth=1 >> .tl-name').innerText()) === '전후 비교표 (표 + 차트)' && /기대 효과/.test(await page.locator('.my-grp .tl-card >> nth=1').innerText()), 'rename + part type show on the card');
// ---- editor on a My template ----
await page.click('.my-grp .tl-card >> nth=0'); await page.waitForSelector('.my-detail');
await page.click('.mfoot .btn:has-text("고치기")'); await page.waitForSelector('.ed-box'); await page.waitForTimeout(500);
const box = await (await page.$('.ed-box')).boundingBox();
ok(box.width > 700, 'editor stage is large: ' + Math.round(box.width) + 'px');
// select the title text, press again → typing
const title = page.locator('.ed-host [data-tb]').first();
await title.click(); await page.waitForTimeout(150);
ok(!!(await page.$('.ed-sel')) && /글/.test(await page.locator('.ed-selname').innerText()), 'click selects the text');
await title.click(); await page.waitForTimeout(150);
ok(await title.evaluate((e) => e.isContentEditable), 'click again → typing');
await page.keyboard.press('Control+A'); await page.keyboard.type('세 가지로 바뀌는 매장 운영');
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
ok((await title.innerText()) === '세 가지로 바뀌는 매장 운영' && !(await title.evaluate((e) => e.isContentEditable)), 'typed text kept, Escape ends typing (editor stays open)');
ok(!!(await page.$('.ed-box')), 'Escape did not close the editor');
// font size +
await title.click(); await page.waitForTimeout(100);
const fs0 = +(await page.inputValue('.ed-num input'));
await page.click('.ed-num .btn >> nth=1'); await page.waitForTimeout(100);
ok(+(await page.inputValue('.ed-num input')) === fs0 + 2, 'font size + : ' + fs0 + ' → ' + (fs0 + 2));
// drag a shape (the first rounded box)
const shapeSel = '.ed-host [data-sp]:has([data-tb]:text("본사 통합 운영"))';
const before = await page.$eval(shapeSel, (e) => [e.offsetLeft, e.offsetTop]);
const sb = await (await page.$(shapeSel)).boundingBox();
await page.mouse.move(sb.x + 8, sb.y + 8); await page.mouse.down(); await page.mouse.move(sb.x + 60, sb.y + 48, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(150);
const after = await page.$eval(shapeSel, (e) => [e.offsetLeft, e.offsetTop]);
ok(after[0] > before[0] + 40 && after[1] > before[1] + 25, 'drag moves the shape with its text: ' + before + ' → ' + after);
// resize from the right handle
const w0 = await page.$eval(shapeSel, (e) => e.offsetWidth);
const h = await (await page.$('.ed-h.e')).boundingBox();
await page.mouse.move(h.x + 5, h.y + 5); await page.mouse.down(); await page.mouse.move(h.x + 45, h.y + 5, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(150);
const w1 = await page.$eval(shapeSel, (e) => e.offsetWidth);
const fillW = await page.$eval(shapeSel, (e) => e.firstElementChild.getBoundingClientRect().width / e.getBoundingClientRect().width);
ok(w1 > w0 + 40 && fillW > 0.97, 'resize: ' + w0 + ' → ' + w1 + 'px, the fill follows');
// shape fill colour
await page.click('.ed-sec:has(h4:text("채우기")) .ed-sw >> nth=0'); await page.waitForTimeout(100);
// undo / redo
const wBefore = await page.$eval(shapeSel, (e) => e.offsetWidth);
await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
ok((await page.$eval(shapeSel, (e) => e.offsetWidth)) === w0, 'undo twice → width back (' + w0 + ')');
await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(150);
ok((await page.$eval(shapeSel, (e) => e.offsetWidth)) === wBefore, 'redo → resized again');
// recolour the whole slide: the deck's blue → teal
await page.mouse.click(box.x + box.width - 6, box.y + box.height - 6); await page.waitForTimeout(100); // empty spot → nothing selected
await page.click('.ed-panel'); await page.keyboard.press('Escape').catch(() => {});
const blue = await page.$$eval('.ed-sec:has(h4:text("색 바꾸기")) .ed-colors .ed-sw', (es) => es.map((e) => e.title));
ok(blue.includes('#1428a0'), 'slide palette lists its colours: ' + blue.slice(0, 6).join(' '));
await page.click('.ed-sec:has(h4:text("색 바꾸기")) .ed-colors .ed-sw[title="#1428a0"]');
await page.click('.ed-recol .ed-sw[title="#0b6e64"]'); await page.waitForTimeout(150);
const still = await page.evaluate(() => document.querySelector('.ed-host').innerHTML.toLowerCase().includes('#1428a0') || /rgb\(20, 40, 160\)/.test(document.querySelector('.ed-host').innerHTML));
ok(!still, 'every #1428a0 replaced');
// add a text box + an image slot with a library picture
await page.click('.ed-bar .btn:has-text("글 상자")'); await page.waitForTimeout(200);
await page.keyboard.press('Control+A'); await page.keyboard.type('새 메모'); await page.keyboard.press('Escape');
ok((await page.$$eval('.ed-host [data-tb]', (es) => es.map((e) => e.textContent))).includes('새 메모'), 'text box added');
await page.click('.ed-bar .btn:has-text("이미지 칸")'); await page.waitForSelector('.modal.wide');
await page.click('.modal.wide .imgopt >> nth=0');
await page.waitForSelector('.modal.wide', { state: 'detached' }); await page.waitForTimeout(400);
const slotImg = await page.evaluate(() => { const s = [...document.querySelectorAll('.ed-host [data-img]')].pop(); const im = s && s.querySelector('img'); return im ? im.getAttribute('src') : ''; });
ok(!!slotImg, 'image slot filled from the library: ' + slotImg.slice(0, 40));
await shot(page, '05-editor');
// save as a new template (copy) and overwrite
await page.click('.modal:has(.myed) .mfoot .btn:has-text("새 템플릿으로 저장")'); await page.waitForSelector('.ed-box', { state: 'detached' }); await page.waitForTimeout(500);
ok((await count(page)) === 4, 'saved as new → 4');
ok((await page.locator('.my-grp').first().locator('h2').innerText()) === '고쳐 만든 레이아웃', 'copy goes to 고쳐 만든 레이아웃 (newest group first)');
const saved = await page.evaluate(() => { const c = document.querySelector('.my-fresh .slide-inner'); return c ? c.innerHTML : ''; });
ok(saved.includes('세 가지로 바뀌는 매장 운영') && saved.includes('새 메모') && !saved.includes('contenteditable'), 'saved drawing has the edits, no editor state');
// ---- library layout → 고쳐서 My에 저장 ----
await page.click('.tl-mybtn'); await page.waitForSelector('.tl-grp'); await page.waitForTimeout(300);
ok((await count(page)) === all, 'My off → the whole library again (' + all + ')');
await page.click('.tl-card >> nth=0'); await page.waitForSelector('.tl-detail');
ok(!!(await page.$('.mfoot .tl-edit')), 'library detail has 고쳐서 My에 저장');
const libName = (await page.locator('.mhead .tl-dt').innerText()).trim();
await page.click('.mfoot .tl-edit'); await page.waitForSelector('.ed-box'); await page.waitForTimeout(400);
const t0 = page.locator('.ed-host [data-tb]').first(); await t0.click(); await t0.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('우리 회사 버전'); await page.keyboard.press('Escape');
await page.click('.modal:has(.myed) .mfoot .btn-primary'); await page.waitForSelector('.ed-box', { state: 'detached' });
await page.waitForTimeout(300);
ok(await page.$eval('.tl-mybtn', (e) => e.getAttribute('aria-pressed')) === 'true' && (await count(page)) === 5, 'saving switches to My (5)');
ok((await page.locator('.my-fresh .tl-name').innerText()) === libName + ' · 내 버전' && /을 고쳐 만듦/.test(await page.locator('.my-fresh .tl-when').innerText()), 'new card: “' + libName + ' · 내 버전”, made from the library layout');
await page.mouse.move(5, 5); await shot(page, '06-after-edit');
// ---- PPTX of a My template keeps the deck font ----
await page.click('.my-grp:has(h2:text("my_sample.pptx")) .tl-card >> nth=0'); await page.waitForSelector('.my-detail');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('.mfoot .btn-primary')]);
const buf = fs.readFileSync(await dl.path()); const zip = await JSZip.loadAsync(buf);
const sx = await zip.file('ppt/slides/slide1.xml').async('string');
ok(sx.includes('매장 운영을 바꾸는 세 가지 방법') && /typeface="Noto Sans KR"/.test(sx) && /<p:pic>/.test(sx), 'PPTX: text · deck font · picture');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
// ---- use in a proposal ----
await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
await page.click('.col .btn-primary:has-text("PPT 레이아웃 추가") >> nth=0'); await page.waitForSelector('.pk-rec .pcard'); await page.waitForTimeout(600);
ok((await page.$$('.pk-my .pcard')).length === 5, 'picker: My 템플릿 section with 5 cards');
const order = await page.$$eval('.mbody > section', (es) => es.map((e) => e.className.split(' ')[0]));
ok(order.join(',').startsWith('pk-rec,pk-my,pk-all'), 'picker order: 추천 → My → 전체');
const n0 = +(await page.$eval('.mfoot .note b', (e) => e.textContent));
const addName = (await page.locator('.pk-my .pcard >> nth=0 >> .pc-name .nm').innerText()).trim();
await page.click('.pk-my .pcard >> nth=0'); await page.waitForTimeout(200);
ok(+(await page.$eval('.mfoot .note b', (e) => e.textContent)) === n0 + 1, 'My template added to the part');
await page.fill('#pk-q', '전후 비교표'); await page.waitForTimeout(700);
ok((await page.$$('.pk-my .pcard')).length === 1, 'search keeps the matching My template');
await shot(page, '07-picker');
await page.click('.modal:has(#pk-q) .mfoot .btn:last-child'); await page.waitForSelector('#pk-q', { state: 'detached' }); await page.waitForTimeout(600);
const lc = page.locator('.lcard', { has: page.locator('.nm', { hasText: addName }) }).first();
await lc.scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
const inDeck = await lc.evaluate((e) => { const si = e.querySelector('.slide-inner'); return !!si && si.querySelectorAll('[data-tb]').length > 0 && /우리 회사 버전|매장|비교|실행/.test(si.textContent); });
ok(inDeck, 'the proposal’s part shows the My template “' + addName + '”');
// ---- delete: used in a proposal → warned ----
await page.click('.sb-tpl'); await page.mouse.move(900, 700); await page.waitForSelector('.my-grp');
const used = await page.evaluate(() => document.querySelectorAll('.tl-card').length);
await page.click('.my-grp:has(h2:text("고쳐 만든 레이아웃")) .tl-card >> nth=0'); await page.waitForSelector('.my-detail');
await page.click('.mfoot .btn:has-text("지우기")');
ok(/한 번 더|그래도 지우기/.test(await page.locator('.mfoot .btn-danger').innerText()), 'delete asks once more');
await page.click('.mfoot .btn-danger'); await page.waitForTimeout(400);
ok((await page.locator('.tl-mybtn .tl-fn').innerText()) === String(used - 1), 'deleted (' + (used - 1) + ' left)');
await page.keyboard.press('Escape').catch(() => {});
await ctx.close();

// ---------- mobile + dark ----------
for (const [nm, opts] of [['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }]]) {
  const c2 = await browser.newContext(opts); const p2 = await c2.newPage(); watch(p2, nm);
  await p2.goto(URL0); await toLib(p2, nm === 'mobile');
  await p2.click('.tl-mybtn'); await p2.waitForSelector('.my-drop');
  await p2.setInputFiles('input[data-my-file]', FIX); await p2.waitForSelector('.my-imp-card', { timeout: 120000 }); await p2.waitForTimeout(800);
  await p2.screenshot({ path: path.join(shots, 'my-' + nm + '-review.png') });
  if (nm === 'mobile') ok(await p2.evaluate(() => document.querySelector('.modal').scrollWidth <= document.querySelector('.modal').clientWidth + 1), 'mobile review: no sideways scroll');
  await p2.click('.mfoot .btn-primary'); await p2.waitForSelector('.modal', { state: 'detached' }); await p2.waitForTimeout(500);
  if (nm === 'mobile') ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#tl-scroll').scrollWidth <= document.querySelector('#tl-scroll').clientWidth + 1), 'mobile list: no sideways scroll');
  await p2.screenshot({ path: path.join(shots, 'my-' + nm + '-list.png') });
  await p2.click('.my-grp .tl-card >> nth=1'); await p2.waitForSelector('.my-detail'); await p2.click('.mfoot .btn:has-text("고치기")'); await p2.waitForSelector('.ed-box'); await p2.waitForTimeout(400);
  await p2.screenshot({ path: path.join(shots, 'my-' + nm + '-editor.png') });
  if (nm === 'mobile') ok(await p2.evaluate(() => { const m = document.querySelector('.modal'); return m.scrollWidth <= m.clientWidth + 1; }), 'mobile editor: no sideways scroll');
  await c2.close();
}
console.log(errs.length ? '\n' + errs.join('\n') : '\nall ok');
await browser.close(); srv.close();
process.exit(errs.length ? 1 : 0);
