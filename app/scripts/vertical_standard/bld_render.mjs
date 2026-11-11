#!/usr/bin/env node
// Render the 표준 건물 조감도 images (spread floors) with the building module's own Stage,
// pin every space with its vertical space number and label each floor.
// usage: node app/scripts/vertical_standard/bld_render.mjs [vid...]   (OUT=… to write elsewhere)
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = ROOT + '/app/web', WORK = ROOT + '/output/vertical-standard', ASSETS = WEB + '/public/assets/vertical-std';
const {createServer} = await import(WEB + '/node_modules/vite/dist/node/index.js');
const {chromium} = await import(WEB + '/node_modules/playwright/index.mjs');
const sharp = createRequire(WEB + '/package.json')('sharp');
const only = process.argv.slice(2), outDir = process.env.OUT || ASSETS;
fs.mkdirSync(outDir, {recursive: true});
const b64 = fs.readFileSync(WEB + '/src/building/bake.b64', 'utf8');
const W = 1632, H = 992, port = 5199, SPREAD = Number(process.env.SPREAD || 1), ELEV = Number(process.env.ELEV || 24), AZ = Number(process.env.AZ || 28), GAP = Number(process.env.GAP || 0);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function overlay(pins, labels) {
  const pinSvg = pins.map(({n, x, y}) => {
    const r = 19, top = y - 46, two = String(n).length > 1;
    return `<g filter="url(#s)"><path d="M ${x} ${y} C ${x - 6} ${y - 13}, ${x - r} ${top + r + 8}, ${x - r} ${top + r} A ${r} ${r} 0 1 1 ${x + r} ${top + r} C ${x + r} ${top + r + 8}, ${x + 6} ${y - 13}, ${x} ${y} Z" fill="#1428a0" stroke="#ffffff" stroke-width="3"/>` +
      `<text x="${x}" y="${top + r + 7.5}" text-anchor="middle" font-family="DejaVu Sans" font-weight="700" font-size="${two ? 18 : 21}" fill="#ffffff">${n}</text></g>`;
  }).join('');
  const labSvg = labels.map(({x, y, text}) => {
    const w = 18 + text.length * 15.5;
    return `<g filter="url(#s)"><rect x="${x - w}" y="${y - 19}" width="${w}" height="38" rx="10" fill="#ffffff" stroke="#d5dae2"/>` +
      `<text x="${x - w + 14}" y="${y + 7}" font-family="Noto Sans CJK KR, Noto Sans KR, DejaVu Sans" font-weight="700" font-size="20" fill="#121417">${esc(text)}</text></g>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0b1440" flood-opacity=".3"/></filter></defs>${labSvg}${pinSvg}</svg>`);
}

const server = await createServer({root: WEB, configFile: WEB + '/vite.config.js', logLevel: 'error', server: {host: '127.0.0.1', port, strictPort: true, hmr: false}});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: W, height: H}});
  await page.goto('http://127.0.0.1:' + port + '/favicon.ico');
  await page.evaluate(b64 => {
    const el = document.createElement('script'); el.id = 'wm-bld-data'; el.type = 'text/plain'; el.setAttribute('data-enc', 'gzip-base64'); el.textContent = b64; document.head.appendChild(el);
  }, b64);
  const presets = await page.evaluate(async () => {
    const {STD_PRESETS} = await import('/src/building/presets-standard.js');
    const {ready, tplOf} = await import('/src/building/data.js');
    await ready();
    window.__tpl = tplOf;
    return STD_PRESETS;
  });
  for (const p of presets) {
    if (only.length && !only.includes(p.vid)) continue;
    const t0 = Date.now();
    const res = await page.evaluate(async ({p, W, H, SPREAD, ELEV, GAP, AZ}) => {
      const {Stage} = await import('/src/building/render.js');
      const host = document.createElement('div'); host.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;font-family:'Noto Sans KR',sans-serif`; document.body.appendChild(host);
      const S = new Stage(host, {});
      try {
        S.w = W; S.h = H; S.renderer.setSize(W, H, false);
        S.spread = SPREAD; S.focus = null; S.roofAlpha = 1;
        // floors far enough apart that no floor hides the one below (slide image, not the interactive view)
        const need = Math.max(...p.floors.map(f => { const t = window.__tpl(f.tpl); return t.w * Math.sin(AZ * Math.PI / 180) + t.d * Math.cos(AZ * Math.PI / 180); })) * Math.tan(ELEV * Math.PI / 180) * 0.9 + 1;
        const gap = GAP || need;
        S.pitch = () => gap;
        S.setFloors(p.floors.map(f => ({tpl: f.tpl, fv: f.fv, name: f.name})), {title: p.title, facades: false});
        if (S.ground) S.ground.visible = false;
        S.aim({azimuth: AZ, elevation: ELEV, i: null, pad: 1.0}, false);
        const blob = await S.snapshot({w: W, h: H, type: 'image/png'});
        const image = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        S.w = W; S.h = H; S.applyFrustum();
        const P = S.pitch();
        const rooms = [], floors = [];
        S.floors.forEach((f, i) => {
          for (const r of f.tpl.rooms) {
            const n = Number(String(r[0]).split('-s').pop());
            rooms.push({n, name: r[1], floor: i, ...S.project(f.ox + r[3] + r[5] / 2, i * P + 0.1, f.oz + r[4] + r[6] / 2)});
          }
          const pts = [[-0.35, -0.35], [f.tpl.w + 0.35, -0.35], [-0.35, f.tpl.d + 0.35], [f.tpl.w + 0.35, f.tpl.d + 0.35]].map(([x, z]) => S.project(f.ox + x, i * P, f.oz + z));
          const left = pts.reduce((a, b) => (b.x < a.x ? b : a));
          floors.push({i, x: left.x, y: left.y});
        });
        return {image, rooms, floors};
      } finally { S.dispose(); host.remove(); }
    }, {p, W, H, SPREAD, ELEV, GAP, AZ});
    // trim → fit (leave room on the left for the floor labels) → pins + labels
    const raw = Buffer.from(res.image.split(',')[1], 'base64');
    const {data: trimmed, info} = await sharp(raw).trim({threshold: 1}).toBuffer({resolveWithObject: true});
    // labels hang off the left corner of each floor: keep them inside the frame and centre labels + building together
    const labW = Math.max(...p.floors.map((f, i) => 18 + (`${i + 1}F ${f.name}`).length * 15.5)) + 14;
    const pad = 30, sc = Math.min((W - labW - 2 * pad) / info.width, (H - 2 * pad - 40) / info.height);
    const tw = Math.round(info.width * sc), th = Math.round(info.height * sc), top = Math.round((H - th) / 2 + 20);
    const minLeft = Math.min(...res.floors.map(f => (f.x + info.trimOffsetLeft) * sc));
    const left = Math.round(Math.max(pad + labW - minLeft, (W - tw) / 2 + Math.max(0, labW - minLeft) / 2));
    const X = x => Math.round(left + (x + info.trimOffsetLeft) * sc), Y = y => Math.round(top + (y + info.trimOffsetTop) * sc);
    const pins = res.rooms.map(r => ({n: r.n, x: X(r.x), y: Y(r.y)}));
    const labels = res.floors.map(f => ({x: X(f.x) - 14, y: Y(f.y), text: `${f.i + 1}F ${p.floors[f.i].name}`}));
    const plan = await sharp(trimmed).resize(tw, th).toBuffer();
    await sharp({create: {width: W, height: H, channels: 4, background: '#f3f5f3'}})
      .composite([{input: plan, top, left}, {input: overlay(pins, labels), top: 0, left: 0}]).flatten({background: '#f3f5f3'}).webp({quality: 84})
      .toFile(path.join(outDir, p.vid + '.webp'));
    console.log(p.vid, res.rooms.map(r => `${r.floor + 1}F#${r.n}`).join(' '), `${Date.now() - t0}ms`);
  }
} finally { await browser?.close(); await server.close(); }
