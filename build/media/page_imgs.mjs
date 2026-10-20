// Load pages in headless Chromium, scroll through them, and list every content image (img + CSS backgrounds),
// excluding the site header / footer / navigation. Usage: node page_imgs.mjs in.json out.json  (in = [{key,url}])
import { chromium } from '/home/claude/wm/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [inp, outp] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(inp, 'utf8'));
const out = fs.existsSync(outp) ? JSON.parse(fs.readFileSync(outp, 'utf8')) : {};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' });
async function one({ key, url }) {
  const pg = await ctx.newPage();
  try {
    await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pg.waitForTimeout(2500);
    for (let i = 0; i < 40; i++) { const done = await pg.evaluate(() => { window.scrollBy(0, 700); return window.scrollY + innerHeight >= document.body.scrollHeight - 5; }); await pg.waitForTimeout(250); if (done) break; }
    await pg.waitForTimeout(1500);
    const res = await pg.evaluate(() => {
      const skip = (el) => !!el.closest('header, footer, nav, #header, #footer, .gnb, [class*="gnb"], [id*="gnb"], .footer, .header, [class*="footer"], [class*="cookie"], [class*="layer-pop"], .pg-location, [class*="breadcrumb"], [class*="recent"]');
      const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return u; } };
      const items = [];
      const ctxOf = (el) => { let e = el.parentElement; for (let i = 0; e && i < 8; i++, e = e.parentElement) { const t = (e.innerText || '').replace(/\s+/g, ' ').trim(); if (t.length >= 12) return t.slice(0, 220); } return ''; };
      let order = 0;
      for (const im of document.querySelectorAll('img')) {
        if (skip(im)) continue;
        const r = im.getBoundingClientRect();
        const src = im.currentSrc || im.src || im.getAttribute('data-src') || '';
        if (!src || src.startsWith('data:')) continue;
        items.push({ u: abs(src), alt: im.alt || '', w: im.naturalWidth, h: im.naturalHeight, bw: Math.round(r.width), bh: Math.round(r.height), y: Math.round(r.top + scrollY), k: 'img', o: order++, c: ctxOf(im) });
      }
      for (const el of document.querySelectorAll('body *')) {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none' || !bg.includes('url(') || skip(el)) continue;
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/); if (!m || m[1].startsWith('data:')) continue;
        const r = el.getBoundingClientRect();
        items.push({ u: abs(m[1]), alt: el.getAttribute('aria-label') || '', bw: Math.round(r.width), bh: Math.round(r.height), y: Math.round(r.top + scrollY), k: 'bg', o: order++, c: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 220) || ctxOf(el) });
      }
      const og = document.querySelector('meta[property="og:image"]');
      return { title: document.title, og: og && abs(og.content), items, text: (document.querySelector('main, #content, .content, body') || document.body).innerText.slice(0, 3000) };
    });
    out[key] = { url, final: pg.url(), ...res };
    console.log(key, res.items.length, res.title.slice(0, 60));
  } catch (e) { out[key] = { url, err: String(e).slice(0, 200) }; console.log(key, 'ERR', String(e).slice(0, 120)); }
  await pg.close();
}
const q = list.filter((x) => !out[x.key]);
const N = 4;
await Promise.all(Array.from({ length: N }, async (_, w) => { for (let i = w; i < q.length; i += N) await one(q[i]); }));
fs.writeFileSync(outp, JSON.stringify(out, null, 1));
await b.close();
