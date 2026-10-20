import { chromium } from '/home/claude/wm/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const L = JSON.parse(fs.readFileSync('/home/claude/media/case_list.json', 'utf8'));
const vids = L.filter((x) => /window\.open\('https?:\/\/(www\.youtube|players\.brightcove)/.test(x.href || '')).map((x) => ({ id: x.id, url: x.href.match(/window\.open\('([^']+)'/)[1] }));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const out = {};
for (const v of vids) {
  if (/youtube/.test(v.url)) { const yid = new URL(v.url).searchParams.get('v'); out[v.id] = { url: v.url, posters: [`https://img.youtube.com/vi/${yid}/maxresdefault.jpg`, `https://img.youtube.com/vi/${yid}/hqdefault.jpg`] }; continue; }
  const pg = await b.newPage();
  try {
    await pg.goto(v.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pg.waitForTimeout(6000);
    const p = await pg.evaluate(() => { const vd = document.querySelector('video'); const ps = document.querySelector('.vjs-poster'); const bg = ps && getComputedStyle(ps).backgroundImage; const pi = ps && ps.querySelector('img'); return [vd && vd.poster, bg && (bg.match(/url\("?([^")]+)/) || [])[1], pi && pi.src].filter(Boolean); });
    out[v.id] = { url: v.url, posters: p };
  } catch (e) { out[v.id] = { url: v.url, err: String(e).slice(0, 100) }; }
  await pg.close();
}
fs.writeFileSync('/home/claude/media/posters.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
