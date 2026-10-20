// 원본 레이아웃의 빈 이미지 칸 채우기(build/fill): 묶음 사진(img/fill/*.json) 로드 · 사진 자리 글 상자 · 고정 상자 · 제품 사각형 ·
// 단일 레이아웃 PPTX 에 사진이 들어가는지 · Best Scenario 의 't<n>' · 's:<글자>' 사진이 채운 사진 대신 그대로 들어가는지
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8773);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
const packs = new Set(); const miss = new Set();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('response', (r) => { if (/\/img\/fill\//.test(r.url())) packs.add(r.url().split('/').pop()); if (r.status() === 404 && /\/img\/(ph|fill|bs\/p-|cover)/.test(r.url())) miss.add(r.url()); });
const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(shots, 'fill-' + n + '.png') }); };
const media = (p) => Number(execSync(`python3 -c "import zipfile,sys;print(sum(1 for n in zipfile.ZipFile(sys.argv[1]).namelist() if n.startswith('ppt/media/')))" ${p}`).toString().trim());

await page.goto('http://localhost:8773/');
await page.waitForSelector('.sb-tpl', { timeout: 30000 });
await page.locator('.sb-tpl').first().evaluate((e) => e.click());
await page.waitForSelector('.tl-card');
const open = async (q) => {
  await page.fill('#tl-q', q); await page.waitForTimeout(700);
  await page.locator('.tl-card').first().click(); await page.waitForSelector('.tl-detail'); await page.waitForTimeout(1800);
};
const state = () => page.evaluate(() => {
  const d = document.querySelector('.tl-detail');
  const fill = [...d.querySelectorAll('img[data-fill]')];
  return { fill: fill.length, loaded: fill.filter((i) => i.src.startsWith('blob:') && i.complete && i.naturalWidth > 4).length,
    imgs: d.querySelectorAll('img').length, labels: d.querySelectorAll('[data-label]').length, slots: d.querySelectorAll('[data-img]').length,
    ph: d.querySelectorAll('[data-ph]').length, srcs: [...d.querySelectorAll('img')].map((i) => i.getAttribute('src')).filter((s) => s && !s.startsWith('data:') && !s.startsWith('blob:')) };
});
{ // catalog layout with packed photos, a wordmark and product cuts — all drawn, no grey placeholder left
  await open('BIT-D');
  const s = await state();
  ok(s.fill >= 4 && s.loaded === s.fill, `BIT-D 묶음 사진 ${s.loaded}/${s.fill} 로드 (blob)`);
  ok(s.ph === 0, 'BIT-D 회색 자리표시 없음');
  await shot('01-bit-d');
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.click('.mfoot .btn-primary');
  const d = await dl; const p = path.join(shots, 'fill-bit-d.pptx'); await d.saveAs(p);
  const n = media(p);
  ok(n >= 4, `BIT-D PPTX 에 그림 ${n}개 (${fs.statSync(p).size} bytes)`);
  await page.keyboard.press('Escape');
}
{ // a text block drawn as a picture area → photo + its own image slot (SS-MD-D was replaced by its photo version — VC-2·2 keeps two such blocks)
  await open('VC-2·2');
  const s = await state();
  ok(s.fill >= 1 && s.loaded === s.fill, `VC-2·2 사진 자리 글 상자 사진 ${s.loaded}/${s.fill}`);
  const tb = await page.evaluate(() => [...document.querySelectorAll('.tl-detail [data-tb][data-img]')].map((e) => e.getAttribute('data-label')));
  ok(tb.length === 2 && tb.every((l) => l && l.length > 1), 'VC-2·2 글 상자 2개에 data-img · data-label (' + tb.join(' / ') + ')');
  await page.keyboard.press('Escape');
}
{ // fixed boxes with only a label → photo under the badges, label kept as data-label
  await open('CL-A');
  const s = await state();
  ok(s.labels === 2 && s.imgs >= 2, `CL-A(CS02) 고정 상자 2개 사진 (labels ${s.labels} · imgs ${s.imgs} · ${s.srcs.join(', ')} · ${await page.locator('.tl-detail .code, .tl-detail h2').first().innerText().catch(() => '')})`);
  ok(!(await page.locator('.tl-detail').innerText()).includes('현장 이미지'), 'CS-02 자리표시 글자 안 보임');
  await page.keyboard.press('Escape');
}
{ // products drawn as dark rectangles → product cuts
  await open('P5-B');
  const s = await state();
  const cuts = s.srcs.filter((x) => /img\/bs\/p-/.test(x));
  ok(cuts.length === 5, 'P5-B 제품 사각형 5개 → 제품 컷 (' + cuts.map((x) => x.split('/').pop()).join(' ') + ')');
  await shot('02-p5b');
  await page.keyboard.press('Escape');
}
{ // illustrations for the two plant items samsung.com has no photo of
  await open('HVC-I');
  const s = await state();
  ok(s.loaded === s.fill && s.fill >= 6, `HVC-I 사진 ${s.loaded}/${s.fill}`);
  const alts = await page.evaluate(() => [...document.querySelectorAll('.tl-detail img')].map((i) => i.alt).join(' | '));
  ok(/터보 냉동기/.test(alts) && /냉각탑/.test(alts), 'HVC-I 터보 냉동기 · 냉각탑 그림');
  await page.keyboard.press('Escape');
}
await page.fill('#tl-q', '');
{ // Best Scenario fills keep their own pictures over the sample photos
  await page.locator('.sb-bs').first().evaluate((e) => e.click());
  await page.waitForSelector('.bsl');
  const chk = async (row, want, not) => {
    await page.locator(`.bsl:has-text("${row}") .bsl-more`).first().click();
    await page.waitForSelector('.modal.sbv .lcard'); await page.waitForTimeout(800);
    const r = await page.evaluate(async ({ want, not }) => {
      const grid = document.querySelector('.modal.sbv .canvas'); // 상세 보기 = read-only Storyboard — every layout card
      for (const s of grid.querySelectorAll('.lcard')) { s.scrollIntoView(); await new Promise((z) => setTimeout(z, 60)); }
      await new Promise((z) => setTimeout(z, 600));
      const has = (w) => !!grid.querySelector(`img[src*="${w}"]`);
      return { want: want.map(has), not: not.map((n) => !!grid.querySelector(`img[data-pid="${n}"]`)) };
    }, { want, not });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    return r;
  };
  const a = await chk('요양병원', ['bs08-8-t6', 'bs08-8-t29'], ['fill.hosp_recep']);
  ok(a.want.every(Boolean) && !a.not.some(Boolean), "W 요양병원: 't6' · 't29' 사진이 채운 사진 대신 들어감");
  const b = await chk('대학 캠퍼스', ['bs03-11-s0', 'bs03-11-s1'], []);
  ok(b.want.every(Boolean), "대학 캠퍼스(E 대학교): 's:B 베이커리 체인 현장 이미지' 사진이 고정 상자에 들어감");
}
console.log('packs fetched', [...packs].join(' '));
ok(miss.size === 0, 'missing images: ' + [...miss].slice(0, 5).join(' '));
await browser.close(); srv.close();
if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
console.log('test-fill: all ok');
