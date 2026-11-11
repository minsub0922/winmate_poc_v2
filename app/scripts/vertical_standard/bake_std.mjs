#!/usr/bin/env node
// Bake floors for the 표준 건물 조감도 into the building module's tpl format, with the same
// spatial assembly engine the existing 206 floors were baked from (library 733e40b9).
// usage: node app/scripts/vertical_standard/bake_std.mjs          → output/vertical-standard/std_floors.json (from bld_floors.json ← bld_forms.py)
//        node app/scripts/vertical_standard/bake_std.mjs verify   → re-bake of-full-standard and compare with the module's bake.b64
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = ROOT + '/app/web', WORK = ROOT + '/output/vertical-standard', ASSETS = WEB + '/public/assets/vertical-std';
const {createServer} = await import(WEB + '/node_modules/vite/dist/node/index.js');
const {chromium} = await import(WEB + '/node_modules/playwright/index.mjs');
const library = JSON.parse(fs.readFileSync(ROOT + '/app/data/spatial/library.json'));
const mode = process.argv[2] === 'verify' ? 'verify' : (process.argv[2] || WORK + '/bld_floors.json'), outPath = process.argv[3] || WORK + '/std_floors.json';
const port = 5198;
const server = await createServer({root: WEB, configFile: WEB + '/vite.config.js', logLevel: 'error', server: {host: '127.0.0.1', port, strictPort: true, hmr: false}});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader']});
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + port + '/favicon.ico');
  await page.evaluate(lib => { window.__lib = lib; }, library);
  await page.evaluate(async () => {
    const {createScene, sceneHash} = await import('/src/domain/spatial/scene.js');
    const {populateScenePeople} = await import('/src/domain/spatial/people-layout.js');
    const {peopleRenderGroups, partsBounds} = await import('/src/domain/spatial/people-placement-geometry.js');
    const lib = window.__lib, assets = Object.fromEntries(lib.assets.map(a => [a.id, a]));
    const R = n => Math.round(n * 1000) / 1000;
    // library asset → bake asset (same reduction as the original bake)
    window.__bakeAsset = a => {
      const key = a.recipe || a.kind, out = {id: a.id, n: a.name, s: a.size};
      if (key && lib.recipes[key]) out.r = key; else out.p = a.parts || [];
      if (a.productId) out.pid = a.productId;
      if (a.productId && a.appearance?.bodyColor) out.bc = a.appearance.bodyColor;
      if (a.geometryTransform) out.gt = a.geometryTransform;
      if (a.category) out.c = a.category;
      return out;
    };
    window.__toTpl = (scene) => {
      const roomIdx = Object.fromEntries(scene.rooms.map((r, i) => [r.id, i]));
      const rooms = scene.rooms.map(r => [r.id, r.name, r.kind, R(r.x), R(r.z), R(r.width), R(r.depth), r.outdoor ? 1 : 0, r.purpose || '']);
      const objs = [], ppl = [], used = new Set();
      for (const o of scene.objects) {
        const a = assets[o.assetId]; if (!a) continue;
        used.add(o.assetId);
        objs.push([o.assetId, R(o.x), R(o.z), R(o.elevation || 0), R(o.rotation || 0), roomIdx[o.roomId] ?? -1, o.mount === 'ceiling' ? 1 : 0]);
        for (const occ of peopleRenderGroups(o, scene, assets)) {
          const b = partsBounds(occ.body, o), ap = occ.actor.appearance || {};
          ppl.push([R((b.min[0] + b.max[0]) / 2), R(b.min[1]), R((b.min[2] + b.max[2]) / 2), R(b.max[1] - b.min[1]), R(Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2])),
            ap.shirt || '#617387', ap.pants || '#354650', ap.skin || '#c08b69', ap.hair || '#3a302b', occ.actor.pose === 'sit' ? 1 : 0]);
        }
      }
      return {rooms, objs, ppl, used: [...used]};
    };
    window.__scene = (config, template) => {
      const L = template ? {...lib, templates: [...lib.templates, template]} : lib;
      const scene = createScene(config, L);
      populateScenePeople(scene, lib); scene.contentHash = sceneHash(scene);
      return scene;
    };
  });
  if (mode === 'verify') {
    const res = await page.evaluate(() => {
      const scene = window.__scene({templateId: 'of-full-standard', variant: 'standard'});
      return {w: scene.width, d: scene.depth, style: scene.style, ...window.__toTpl(scene)};
    });
    const bake = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(WEB + '/src/building/bake.b64', 'utf8').trim(), 'base64')).toString('utf8'));
    const t = bake.tpl.find(x => x.id === 'of-full-standard');
    console.log('size', res.w, res.d, 'vs', t.w, t.d, 'style', res.style, t.style);
    console.log('rooms', JSON.stringify(res.rooms[0]), JSON.stringify(t.rooms[0]));
    console.log('objs', res.objs.length, t.objs.length, 'ppl', res.ppl.length, t.ppl.length);
    for (let i = 0; i < 6; i++) console.log(' o', JSON.stringify(res.objs[i]), JSON.stringify([bake.assets[t.objs[i][0]].id, ...t.objs[i].slice(1)]));
    for (let i = 0; i < 4; i++) console.log(' p', JSON.stringify(res.ppl[i]), JSON.stringify(t.ppl[i]));
  } else {
    const spec = JSON.parse(fs.readFileSync(mode));
    for (const fl of spec.floors) fl.comp = Number(process.env.COMP || 4);
    const out = {floors: [], assets: {}};
    for (const fl of spec.floors) {
      const res = await page.evaluate(fl => {
        const template = {id: 'std-' + fl.id, name: fl.name, industry: fl.ind, scope: 'full', variant: 'standard', custom: true, style: fl.style, width: fl.w, depth: fl.d, ...(fl.comp ? {compositionVersion: fl.comp} : {}),
          rooms: fl.rooms.map(r => ({key: r.id, name: r.name, kind: r.kind, purpose: r.purpose || '', geometry: r.geo, productIds: r.products.map(p => p.productId)})),
          source: {type: 'studio-input', documentId: 'vstd', templateId: null}};
        const names = Object.fromEntries(window.__lib.assets.filter(a => a.productId).map(a => [a.productId, a.name]));
        const rooms = fl.rooms.map(r => ({...r, products: r.products.map(p => ({...p}))})), dropped = [];
        let scene;
        for (let attempt = 0; attempt < 12 && !scene; attempt++) {
          try {
            template.rooms.forEach((t, i) => { t.productIds = rooms[i].products.map(p => p.productId); });
            scene = window.__scene({templateId: template.id, style: fl.style, variant: 'standard', populatePeople: false, roomSettings: [],
              placements: rooms.flatMap(r => r.products.map(p => ({roomId: r.id, productId: p.productId, quantity: p.quantity, placementMode: 'auto'}))),
              provenance: {kind: 'structured-input'}}, template);
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
        const tpl = window.__toTpl(scene);
        const lib = window.__lib, A = Object.fromEntries(lib.assets.map(a => [a.id, a]));
        const counts = {};
        for (const o of scene.objects) if (o.assetId.startsWith('product:')) counts[o.roomId] = (counts[o.roomId] || 0) + 1;
        return {dropped, w: scene.width, d: scene.depth, ...tpl, assets: Object.fromEntries(tpl.used.map(id => [id, window.__bakeAsset(A[id])])), counts};
      }, fl);
      out.floors.push({id: fl.id, vid: fl.vid, level: fl.level, name: fl.name, ind: fl.ind, style: fl.style, w: res.w, d: res.d, rooms: res.rooms, objs: res.objs, ppl: res.ppl, spaces: fl.rooms.map(r => r.space)});
      Object.assign(out.assets, res.assets);
      console.log(fl.id, fl.rooms.map(r => `${r.name}:${res.counts[r.id] || 0}`).join(' | '), `objs ${res.objs.length} ppl ${res.ppl.length}`, res.dropped.length ? 'dropped: ' + res.dropped.join(', ') : '');
    }
    fs.writeFileSync(outPath, JSON.stringify(out));
  }
} finally { await browser?.close(); await server.close(); }
