#!/usr/bin/env node
// Render 공간 조감도 for standard vertical decks from studio forms (same engine as the editor),
// then pin each space with its legend number.
// usage: node app/scripts/vertical_standard/bird_render.mjs [vid...]   (forms: output/vertical-standard/bird_forms.json ← bird_forms.py)
//        FORMS=… OUT=… to override; SKIP_DONE=1 keeps images already rendered
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = ROOT + '/app/web', WORK = ROOT + '/output/vertical-standard', ASSETS = WEB + '/public/assets/vertical-std';
const {createServer} = await import(WEB + '/node_modules/vite/dist/node/index.js');
const {chromium} = await import(WEB + '/node_modules/playwright/index.mjs');
const sharp = createRequire(WEB + '/package.json')('sharp');
const only = process.argv.slice(2), formsPath = process.env.FORMS || WORK + '/bird_forms.json', outDir = process.env.OUT || ASSETS;
const forms = JSON.parse(fs.readFileSync(formsPath));
const library = JSON.parse(fs.readFileSync(ROOT + '/app/data/spatial/library.json'));
fs.mkdirSync(outDir, {recursive: true});
const W = 1632, H = 992, port = 5197;

function pinSvg(points) {
  const pins = points.map(({n, x, y}) => {
    const r = 21, top = y - 50;
    return `<g filter="url(#s)"><path d="M ${x} ${y} C ${x - 6} ${y - 14}, ${x - r} ${top + r + 8}, ${x - r} ${top + r} A ${r} ${r} 0 1 1 ${x + r} ${top + r} C ${x + r} ${top + r + 8}, ${x + 6} ${y - 14}, ${x} ${y} Z" fill="#1428a0" stroke="#ffffff" stroke-width="3"/>` +
      `<text x="${x}" y="${top + r + 8}" text-anchor="middle" font-family="DejaVu Sans" font-weight="700" font-size="23" fill="#ffffff">${n}</text></g>` +
      `<ellipse cx="${x}" cy="${y + 1}" rx="7" ry="3" fill="rgba(20,40,160,.35)"/>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0b1440" flood-opacity=".35"/></filter></defs>${pins}</svg>`);
}

const server = await createServer({root: WEB, configFile: WEB + '/vite.config.js', logLevel: 'error', server: {host: '127.0.0.1', port, strictPort: true, hmr: false}});
let browser;
const report = {};
try {
  await server.listen();
  browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: W, height: H}});
  await page.goto('http://127.0.0.1:' + port + '/favicon.ico');
  await page.evaluate(lib => { window.__lib = lib; }, library);
  for (const [vid, form] of Object.entries(forms)) {
    if (only.length && !only.includes(vid)) continue;
    if (!only.length && fs.existsSync(path.join(outDir, vid + '.webp')) && process.env.SKIP_DONE) continue;
    const t0 = Date.now();
    try {
    const res = await page.evaluate(async ({form, W, H}) => {
      const {createScene, sceneHash} = await import('/src/domain/spatial/scene.js');
      const {populateScenePeople} = await import('/src/domain/spatial/people-layout.js');
      const {createSpatialRenderer} = await import('/src/domain/spatial/render-three.js');
      const library = window.__lib;
      // rows of rooms filling one rectangle: no empty cell in front of the camera
      const n = form.rooms.length, rows = n <= 3 ? [n] : n === 4 ? [2, 2] : [3, n - 3];
      const cell = 7.6, gapX = .22, gapZ = 1.8, rd = n <= 3 ? 7.2 : 6.8;
      const TW = n === 4 ? 18.62 : Math.max(...rows) * cell + (Math.max(...rows) - 1) * gapX;
      const geo = []; let z = 0;
      for (const k of rows) { const w = (TW - (k - 1) * gapX) / k; for (let c = 0; c < k; c++) geo.push({x: c * (w + gapX), z, width: w, depth: rd}); z += rd + gapZ; }
      const TD = z - gapZ;
      const template = {id: 'studio-vstd', name: form.title, industry: form.industry, scope: 'full', variant: 'standard', custom: true, style: form.style, width: TW, depth: TD,
        rooms: form.rooms.map((r, i) => ({key: r.id, name: r.name, kind: r.kind, purpose: '', geometry: geo[i], productIds: r.products.map(p => p.productId)})),
        source: {type: 'studio-input', documentId: 'vstd', templateId: null}};
      // a product that does not fit its room is dropped (the error names the room and the product), then retried
      const names = Object.fromEntries(library.assets.filter(a => a.productId).map(a => [a.productId, a.name]));
      const rooms = form.rooms.map(r => ({...r, products: [...r.products]})), dropped = [];
      let scene;
      for (let attempt = 0; attempt < 12 && !scene; attempt++) {
        try {
          template.rooms.forEach((t, i) => { t.productIds = rooms[i].products.map(p => p.productId); });
          scene = createScene({templateId: template.id, style: form.style, variant: 'standard', populatePeople: false, roomSettings: [],
            placements: rooms.flatMap(r => r.products.map(p => ({roomId: r.id, productId: p.productId, quantity: p.quantity, placementMode: 'auto'}))),
            provenance: {kind: 'structured-input'}}, {...library, templates: [...library.templates, template]});
        } catch (e) {
          const msg = String(e.message || e), room = rooms.find(r => msg.startsWith(r.name + ':'));
          const p = room && [...room.products].reverse().find(p => names[p.productId] && msg.includes(names[p.productId]));
          if (!room) throw e;
            if (!p) { const q = room.products[room.products.length - 1]; if (!q) throw e; room.products.pop(); dropped.push(room.name + ' - ' + q.productId); continue; }
          if (p.quantity > 1) p.quantity = 1; else room.products.splice(room.products.indexOf(p), 1);
          dropped.push(room.name + ' - ' + names[p.productId]);
        }
      }
      if (!scene) throw new Error('placement failed');
      populateScenePeople(scene, library); scene.contentHash = sceneHash(scene);
      const host = document.createElement('div'); host.style.cssText = `width:${W}px;height:${H}px`; document.body.appendChild(host);
      const renderer = createSpatialRenderer(host, {pixelRatio: 1, transparentBackground: true});
      try {
        renderer.setScene(scene, library); await renderer.ready();
        const shot = renderer.snapshot({w: W, h: H, pixelRatio: 1, transparentBackground: true});
        const counts = {};
        for (const o of scene.objects) if (o.assetId.startsWith('product:')) counts[o.roomId] = (counts[o.roomId] || 0) + 1;
        return {dropped, image: shot.image, rooms: scene.rooms.map(r => ({id: r.id, name: r.name, kind: r.kind, anchor: shot.anchors.rooms[r.id], products: counts[r.id] || 0})), size: [scene.width, scene.depth]};
      } finally { renderer.dispose(); host.remove(); }
    }, {form, W, H});
    // trim the transparent margin, fit the plan into the slot with a small pad, then pin each space
    const raw = Buffer.from(res.image.split(',')[1], 'base64');
    const {data: trimmed, info} = await sharp(raw).trim({threshold: 1}).toBuffer({resolveWithObject: true});
    const pad = 36, sc = Math.min((W - 2 * pad) / info.width, (H - 2 * pad - 30) / info.height);
    const tw = Math.round(info.width * sc), th = Math.round(info.height * sc), left = Math.round((W - tw) / 2), top = Math.round((H - th) / 2 + 15);
    const ox = -info.trimOffsetLeft, oy = -info.trimOffsetTop;
    const points = res.rooms.map((r, i) => ({n: i + 1, x: Math.round(left + (r.anchor.x - ox) * sc), y: Math.round(top + (r.anchor.y - oy) * sc)}));
    const plan = await sharp(trimmed).resize(tw, th).toBuffer();
    await sharp({create: {width: W, height: H, channels: 4, background: '#f3f5f3'}})
      .composite([{input: plan, top, left}, {input: pinSvg(points), top: 0, left: 0}]).flatten({background: '#f3f5f3'}).webp({quality: 84}).toFile(path.join(outDir, vid + '.webp'));
    report[vid] = {dropped: res.dropped, rooms: res.rooms.map(r => ({name: r.name, kind: r.kind, products: r.products, x: points[res.rooms.indexOf(r)].x, y: points[res.rooms.indexOf(r)].y})), size: res.size, ms: Date.now() - t0};
    console.log(vid, res.rooms.map(r => `${r.name}:${r.products}`).join(' | '), `${Date.now() - t0}ms`, res.dropped.length ? 'dropped: ' + res.dropped.join(', ') : '');
    } catch (e) { console.log(vid, 'FAILED', String(e.message || e).slice(0, 300)); }
  }
} finally {
  fs.writeFileSync(path.join(WORK, 'bird-report.json'), JSON.stringify(report, null, 1));
  await browser?.close(); await server.close();
}
