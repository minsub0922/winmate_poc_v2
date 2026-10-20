// 솔루션 · 유관사례 실제 이미지(data/media.json · img/media/*.json): 카드 썸네일이 일러스트 대신 사진, hover 상세 갤러리에 매칭 이미지 전부,
// 탐색기 사례 목록 썸네일, 레이아웃 상세 '참고 자료'의 이미지 줄 → 빈 이미지 칸에 넣기 → PPTX에는 JPEG/PNG로.
// 서버 두 가지로 돌린다: RANGE=1(기본) 바이트 범위 응답(206) — 한 장씩 받는지(받은 바이트 수), RANGE=0 Range 무시(200) — 묶음 통째로 받아도 되는지.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const MEDIA = JSON.parse(fs.readFileSync(path.resolve(here, '../data/media.json'), 'utf8'));
const RANGE = process.env.RANGE !== '0';
const THEME = process.env.THEME || 'light';
const PORT = 9071 + Math.floor(Math.random() * 100);
const TYPES = { html: 'text/html; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', json: 'application/json', js: 'text/javascript' };
let sent = 0; const hits = [];
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(root, u.replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const size = fs.statSync(f).size; const type = TYPES[f.split('.').pop()] || 'application/octet-stream';
  const m = RANGE && /bytes=(\d+)-(\d+)/.exec(q.headers.range || '');
  if (u.startsWith('/img/media/')) hits.push((m ? 'R ' : 'F ') + u);
  if (m) {
    const a = +m[1], b = Math.min(+m[2], size - 1);
    r.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': b - a + 1, 'accept-ranges': 'bytes' });
    if (u.startsWith('/img/media/')) sent += b - a + 1;
    return fs.createReadStream(f, { start: a, end: b }).pipe(r);
  }
  r.writeHead(200, { 'content-type': type, 'content-length': size });
  if (u.startsWith('/img/media/')) sent += size;
  fs.createReadStream(f).pipe(r);
}).listen(PORT);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
const tag = (RANGE ? 'r' : 'f') + (THEME === 'dark' ? '-dark' : '');
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, 'media-' + tag + '-' + n + '.png') }));

// ---- data ----
const nCase = Object.keys(MEDIA.case).length, nSol = Object.keys(MEDIA.sol).length;
ok(nCase >= 215 && nSol === 17, `media for ${nCase} cases · ${nSol} solutions`);
const all = [...Object.values(MEDIA.case), ...Object.values(MEDIA.sol)];
ok(all.every((it) => it.th != null && it.g.length && it.g.every((g) => Number.isInteger(g[0]) && g[2])), 'every item: thumbnail + described images');
for (const [pi, l] of Object.entries(MEDIA.L)) {
  const u = MEDIA.P[pi]; const t = fs.readFileSync(path.join(root, u), 'latin1');
  let s = l[0], good = true; for (let k = 1; k < l.length; k++) { if (!t.startsWith('data:image/avif;base64,', s) || t[s + l[k]] !== '"') good = false; s += l[k] + 3; }
  ok(good && t.length < 16_700_000, `${u}: ${l.length - 1} ranges line up · ${(t.length / 1e6).toFixed(2)} MB`);
}
ok(fs.statSync(path.join(root, 'index.html')).size < 16_600_000, 'index.html under 16 MiB with room: ' + fs.statSync(path.join(root, 'index.html')).size);

async function run(name, opts, fn) {
  const ctx = await browser.newContext({ ...opts, colorScheme: THEME === 'dark' ? 'dark' : 'light' }); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  await page.goto('http://localhost:' + PORT + '/'); await page.waitForSelector('.home'); await fn(page); await ctx.close();
}
const loaded = (page, sel) => page.$$eval(sel, (els) => els.map((e) => { const im = e.querySelector('img'); return { photo: e.classList.contains('photo'), ok: !!(im && im.complete && im.naturalWidth > 0) }; }));

await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(600);
  await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop .cc-card'); await page.mouse.move(5, 5);
  for (const k of ['solution', 'case']) {
    const sel = '.mt-pop .cc-sec.' + k + ' .thumb';
    if (!(await page.$(sel))) { errs.push('FAIL no ' + k + ' tiles'); continue; }
    await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(2500);
    const st = await loaded(page, sel);
    ok(st.length && st.every((s) => s.photo && s.ok), `${k} tiles all real photos: ${st.filter((s) => s.photo && s.ok).length}/${st.length}`);
    await shot(page, 'tiles-' + k);
    await page.hover(sel); await page.waitForSelector('.dpk', { timeout: 4000 }).catch(() => null);
    if (!(await page.$('.dpk'))) { errs.push('FAIL ' + k + ' hover detail'); continue; }
    await page.waitForFunction(() => { const i = document.querySelector('.dpk-main img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 30000 }).catch(() => null);
    const badge = await page.$eval('.dpk-badge b', (e) => e.textContent).catch(() => '');
    const n = Number((badge.split('/')[1] || '0'));
    const main = await page.$eval('.dpk-main img', (e) => e.complete && e.naturalWidth > 0).catch(() => false);
    ok(main && n >= 2, `${k} detail gallery: real image (${badge})`);
    const cap = await page.$eval('.dpk-cap', (e) => e.textContent).catch(() => '');
    ok(/(도입사례|솔루션|e-카탈로그|비즈니스|삼성)/.test(cap), `${k} caption names the source: ${cap.slice(0, 90)}`);
    // a matched (AVIF) image somewhere in the strip, with its source in the caption
    const ai = await page.$$eval('.dpk-strip .dpk-th', (e) => e.length);
    for (let j = 0; j < ai; j++) { await page.hover('.dpk-strip .dpk-th >> nth=' + j); const c2 = await page.$eval('.dpk-cap', (e) => e.textContent); if (/AVIF/.test(c2)) { ok(/(도입사례|솔루션|e-카탈로그|비즈니스)/.test(c2), `${k} matched image caption: ${c2.slice(0, 90)}`); break; } }
    await page.waitForTimeout(1500);
    const strip = await page.$$eval('.dpk-strip img', (e) => e.map((i) => i.complete && i.naturalWidth > 0));
    ok(strip.filter(Boolean).length >= Math.min(strip.length, 4), `${k} gallery strip loaded ${strip.filter(Boolean).length}/${strip.length}`);
    await shot(page, 'peek-' + k);
    await page.mouse.move(5, 5); await page.waitForTimeout(400);
  }
  // explorer: 유관사례 list rows have photos
  const add = await page.$('.mt-pop .cc-sec.case .cc-addcard');
  if (add) {
    await add.click(); await page.waitForTimeout(2500);
    const th = await loaded(page, '.mt-pop .thumb.case');
    ok(th.filter((s) => s.ok).length >= 6, `explorer case rows with photos: ${th.filter((s) => s.ok).length}/${th.length}`);
    await shot(page, 'explorer-cases');
  } else console.log('  (no add tile selector — explorer check skipped)');
});

// layout detail → reference panel → linked solution strip → insert into an empty image slot
await run('detail', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(600);
  const cards = await page.$$('.canvas .lay-card, .canvas .lcard, .canvas [data-uid]');
  if (!cards.length) { console.log('  (no layout cards found — detail check skipped)'); return; }
  await cards[0].click(); await page.waitForTimeout(1200);
  const strips = await page.$$('.cs-imgs .km-img');
  console.log('  media strip buttons:', strips.length);
  if (strips.length) {
    await page.waitForTimeout(2000);
    const okImgs = await page.$$eval('.cs-imgs .km-img img', (e) => e.filter((i) => i.complete && i.naturalWidth > 0).length);
    ok(okImgs >= 1, 'reference panel media strip images load: ' + okImgs);
    await shot(page, 'detail-strip');
    // put a matched picture into an empty image slot (walk the deck until a layout has one), then export PPTX
    let put = false;
    for (let step = 0; step < 8 && !put; step++) {
      const btn = await page.$('.cs-imgs .km-img');
      if (btn) { await btn.click(); await page.waitForTimeout(600); put = /이미지를 넣었어요/.test(await page.evaluate(() => document.body.innerText)); }
      if (!put) { const nx = await page.$('.mfoot button[aria-label*="다음"], .sv-nav .next, button:has-text("›")'); if (!nx) break; await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1200); }
    }
    ok(put, 'a matched picture went into an empty image slot');
    if (put) {
      await page.waitForTimeout(1500);
      const src = await page.$$eval('.sv-sheet img, .detail img', (e) => e.map((i) => i.currentSrc || i.src).filter((u) => u.startsWith('blob:')).length).catch(() => 0);
      console.log('  blob images on the sheet:', src);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      const vb = await page.$('.top-right button:has-text("레이아웃")');
      if (vb) {
        await vb.click(); await page.waitForSelector('.viewer'); await page.waitForTimeout(1500);
        await page.click('.viewer .btn-primary:has-text("PPTX 내보내기")'); await page.waitForSelector('.modal');
        const dl = page.waitForEvent('download', { timeout: 180000 });
        await page.click('.mfoot .btn-primary:has-text("PPTX")');
        const d = await dl; const fp = path.join(shots, 'media-export.pptx'); await d.saveAs(fp);
        const { execSync } = await import('node:child_process');
        const list = execSync('unzip -l ' + JSON.stringify(fp)).toString();
        const media = list.split('\n').filter((l) => /ppt\/media\//.test(l));
        ok(media.length > 0 && !media.some((l) => /\.(avif|webp)\s*$/i.test(l)), `PPTX pictures: ${media.length}, none AVIF/WebP`);
      } else console.log('  (viewer button not found — PPTX check skipped)');
    }
  }
});
console.log('media bytes sent:', (sent / 1e6).toFixed(2), 'MB ·', hits.filter((h) => h.startsWith('R')).length, 'range ·', hits.filter((h) => h.startsWith('F')).length, 'full');
ok(RANGE ? sent < 8e6 : true, 'range mode keeps downloads small');
console.log(errs.length ? errs.join('\n') : 'ALL OK');
srv.close(); await browser.close();
process.exit(errs.length ? 1 : 0);
