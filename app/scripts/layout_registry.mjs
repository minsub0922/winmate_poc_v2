// Layout slots exactly as the app sees them — for scripts that author deck content.
//   node app/scripts/layout_registry.mjs  → JSON { [f]: { drawn: {tb: default text}, source: [tb…], images: {img: hint}, retired, variantOf } }
// "drawn" are the text slots the renderer keeps after layout_repairs.js (footers, footnotes and small captions are removed
// when a sheet is drawn); "source" are all slots of the original sheet — a fill may hold values only for those.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (p) => path.join(root, 'app/web/src', p);
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
globalThis.window ??= { location: { pathname: '/', search: '', hash: '' }, addEventListener() {} };
globalThis.location ??= globalThis.window.location;
const { configureBootstrap } = await import(src('api/bootstrap.js'));
configureBootstrap({ catalog: read('app/data/catalog.json'), images: read('app/data/images.json'), products: read('app/data/products_db.json'), subscriptions: read('app/data/subscriptions.json') });
const cat = await import(src('services/catalog.js'));
const { COVERS } = await import(src('domain/templates/covers.js'));
const { PHOTO_HTML } = await import(src('domain/templates/photo_layouts.js'));
const { STD_HTML } = await import(src('domain/templates/std_layouts.js'));
const { VSTD_HTML } = await import(src('domain/templates/vertical_std_layouts.js'));
const { SPATIAL_HTML } = await import(src('domain/templates/spatial-layouts.js'));
const { repairLayoutHtml, repairLayoutUnmarked } = await import(src('domain/templates/layout_repairs.js'));
const { markSlotModes } = await import(src('domain/templates/layout_slot_modes.js'));
const { fillHoles } = await import(src('domain/templates/layout_variants.js'));
const pieces = read('app/web/src/domain/templates/layout_variant_pieces.json').pieces;
const html = Object.assign(JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(root, 'app/data/layouts.b64'), 'utf8'), 'base64'))), COVERS, PHOTO_HTML, STD_HTML, VSTD_HTML, SPATIAL_HTML);
const drawnHtml = (f) => {
  const c = cat.CANON_OF[f];
  return c && c !== f && pieces[f] && html[c] ? markSlotModes(f, fillHoles(repairLayoutUnmarked(c, html[c]), pieces[f])) : repairLayoutHtml(f, html[f]);
};
const out = {};
for (const l of cat.ALL_LAYOUTS) {
  if (!html[l.f]) continue;
  out[l.f] = { name: l.name, part: l.p, drawn: drawnHtml(l.f), source: html[l.f], retired: l.retired || null, variantOf: l.variantOf || null };
}
process.stdout.write(JSON.stringify(out));
