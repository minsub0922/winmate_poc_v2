// 같은 그림 표 — 주소가 달라도 같은 사진(같은 장면을 다른 묶음 · 크기 · 인코딩으로 넣은 것)을 한 묶음으로 적는다.
// 레이아웃 자동 구성(poc/test/scenario_composer composer.pictures)과 장별 AI 채우기(app/web services/layout-context.js)가
// "이 제안서에 이미 쓴 사진"을 주소가 아니라 이 묶음으로 판단한다 — 같은 사진이 한 제안서에 두 번 들어가지 않게.
//   node app/scripts/build_picture_ids.mjs            # app/data/picture_ids.json (바뀐 그림만 다시 읽는다)
//   node app/scripts/build_picture_ids.mjs --check    # 표가 지금 그림들과 맞는지만 본다 (다르면 exit 1)
// 제품 컷 묶음(img/prod)은 넣지 않는다 — 제품 사진은 같은 제품이면 여러 장에 다시 쓸 수 있다.
// 같은 그림의 기준은 app/scripts/audit_scenario_images.mjs 의 samePicture와 같다(32×32 픽셀 일치 · 16×16 회색 평균 차이).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'app/web/package.json'));
const sharp = require('sharp');
const OUT = path.join(root, 'app/data/picture_ids.json');
const CACHE = path.join(root, 'app/data/runtime/picture-prints.json');
const check = process.argv.includes('--check');
const VERSION = 1;

/* ---------- 1. every picture address that can stand on a sheet (product cut packs excluded) ---------- */
const fileOf = (rel) => {
  rel = decodeURIComponent(String(rel).replace(/^\//, '').split('?')[0].split('#')[0]);
  return [path.join(root, 'app/data/static', rel), path.join(root, 'app/web/public', rel), path.join(root, rel)].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const addresses = new Set();
// addresses as the composer library keys them: 'img/…' without the leading slash, '/assets/…' with it
const add = (a) => {
  if (typeof a !== 'string' || !a || a.startsWith('data:') || /^https?:/.test(a)) return;
  addresses.add(a.startsWith('/img/') ? a.slice(1) : a.startsWith('assets/') ? '/' + a : a);
};
const packFiles = new Map(); // pack address → file
const packOf = (rel) => { if (!packFiles.has(rel)) packFiles.set(rel, fileOf(rel) || null); return packFiles.get(rel); };
const addPack = (rel, keep = () => true) => {
  const f = packOf(rel); if (!f) return;
  const imgs = readJson(f).images || [];
  imgs.forEach((x, i) => { if (keep(i)) add(`${rel}#${i}`); });
};
// case · solution media (사례 · 솔루션 사진) — kind 'c'(제품 컷)는 뺀다
const media = readJson(path.join(root, 'app/data/media.json'));
for (const group of ['case', 'sol']) for (const item of Object.values(media[group] || {})) for (const e of item.g || []) {
  if (e[1] === 'c') continue;
  add(`${media.P[Math.floor(e[0] / 10000)]}#${e[0] % 10000}`);
}
// fill · background packs (샘플 시나리오 · 템플릿이 쓰는 사진 묶음)
for (const dir of ['img/fill', 'img/bg']) {
  const abs = [path.join(root, 'app/data/static', dir), path.join(root, dir)].find((d) => fs.existsSync(d));
  if (!abs) continue;
  for (const name of fs.readdirSync(abs).filter((n) => n.endsWith('.json')).sort()) addPack(`${dir}/${name}`);
}
// single files: venue photos · deck photos (not the p-*.png product cuts) · covers · root photos
for (const dir of ['img/ph', 'img/bs', 'img/cover', 'img']) {
  const abs = [path.join(root, 'app/data/static', dir), path.join(root, dir)].find((d) => fs.existsSync(d));
  if (!abs) continue;
  for (const name of fs.readdirSync(abs).sort()) {
    if (!/\.(jpe?g|png|webp|avif)$/i.test(name) || (dir === 'img/bs' && /^p-/.test(name))) continue;
    if (dir === 'img' && /-(front|persp|side|back)\.png$/i.test(name)) continue; // product cuts at the root
    add(`${dir}/${name}`);
  }
}
// the app image DB (official lifestyle · case · solution screens; cut = product)
for (const v of Object.values(readJson(path.join(root, 'app/data/images.json')).pids || {})) if (v.kind !== 'cut' && v.src !== 'cut' && v.kind !== 'detail') add(v.file);
// proposal · account photo assets
for (const fn of ['proposal_photo_assets.json', 'account_photo_assets.json']) {
  const f = path.join(root, 'app/web/src/domain/templates', fn);
  if (fs.existsSync(f)) for (const v of readJson(f)) add(v.src);
}
// product image library: installs · screens · diagrams (cuts · details are product pictures)
{
  const f = fileOf('img/lib/index.json');
  if (f) for (const v of readJson(f).images || []) if (v.k !== 'cut' && v.k !== 'detail') add(v.a);
}

/* ---------- 2. the pixels behind an address, fingerprinted (cached by content) ---------- */
const packs = new Map();
const bytesOf = (a) => {
  const m = /^(.*\.json)#(\d+)$/.exec(a);
  if (m) {
    const f = packOf(m[1]); if (!f) return null;
    if (!packs.has(f)) packs.set(f, readJson(f).images || []);
    let d = packs.get(f)[Number(m[2])];
    if (d && typeof d === 'object') d = d.src || d.data || '';
    if (typeof d !== 'string' || !d.startsWith('data:')) return null;
    const i = d.indexOf(',');
    return /;base64/.test(d.slice(0, i)) ? Buffer.from(d.slice(i + 1), 'base64') : Buffer.from(decodeURIComponent(d.slice(i + 1)));
  }
  const f = fileOf(a); return f ? fs.readFileSync(f) : null;
};
/** exact = the decoded picture at 32×32 · grey = 16×16 grey values of the whole picture · centre = the same of its middle 80%
 *  (the same photo cropped a little differently — 616×390 in one pack, 624×395 in another — differs at the edges, not in the middle) */
async function fingerprint(bytes) {
  const meta = await sharp(bytes, { limitInputPixels: false }).metadata();
  const img = sharp(bytes, { limitInputPixels: false }).flatten({ background: '#fff' });
  const small = await img.clone().resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const grey = await img.clone().resize(16, 16, { fit: 'fill' }).greyscale().raw().toBuffer();
  const w = meta.width, h = meta.height, cw = Math.max(1, Math.round(w * 0.8)), ch = Math.max(1, Math.round(h * 0.8));
  const centre = await sharp(bytes, { limitInputPixels: false }).flatten({ background: '#fff' })
    .extract({ left: Math.floor((w - cw) / 2), top: Math.floor((h - ch) / 2), width: cw, height: ch }).resize(16, 16, { fit: 'fill' }).greyscale().raw().toBuffer();
  return { exact: createHash('sha1').update(small).digest('hex').slice(0, 16), grey: Array.from(grey), centre: Array.from(centre) };
}
let cache = {};
try { cache = readJson(CACHE); } catch { cache = {}; }
const prints = new Map(); const unread = []; let fresh = 0;
for (const a of [...addresses].sort()) {
  let bytes;
  try { bytes = bytesOf(a); } catch { bytes = null; }
  if (!bytes) { unread.push(a); continue; }
  const sha = createHash('sha1').update(bytes).digest('hex');
  if (!cache[sha] || !cache[sha].centre) {
    try { cache[sha] = await fingerprint(bytes); fresh++; } catch (e) { unread.push(`${a} — ${String(e.message || e).slice(0, 60)}`); continue; }
  }
  prints.set(a, cache[sha]);
}
packs.clear();
if (fresh) { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache)); }

/* ---------- 3. group the same pictures ----------
 * Measured on every pack (2026-11-16, contact sheets of all pairs below a centre gap of 12): photographs stay the same picture up to a
 * centre gap of ~11 (re-crops, re-encodes, the greyed-out 'before' copy), while light or flat pictures — product cuts on white, UI
 * screens, grey panel renders — are different pictures from a gap of ~4 on. So photographs are compared loosely, light / flat pictures
 * only as near-identical. Two different photos merged by mistake only means the deck shows one of them; a repeat that is missed is
 * what this table exists to stop. */
const PHOTO_CENTRE = 10, PHOTO_FULL = 5, FLAT = 1.5;
const mean = (g) => g.reduce((s, v) => s + v, 0) / g.length;
const gap = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };
const spread = (g) => { const m = mean(g); return Math.sqrt(g.reduce((s, v) => s + (v - m) ** 2, 0) / g.length); };
// a cut-out or a screen: light corners, or hardly any contrast at all
const flat = (p) => mean([0, 15, 240, 255].map((i) => p.grey[i])) >= 225 || spread(p.grey) < 18;
const same = (a, b) => {
  if (a.exact === b.exact) return true;
  if (flat(a) || flat(b)) return gap(a.grey, b.grey) < FLAT && gap(a.centre, b.centre) < FLAT;
  return gap(a.centre, b.centre) < PHOTO_CENTRE || gap(a.grey, b.grey) < PHOTO_FULL;
};
const list = [...prints].map(([a, p]) => ({ a, p, m: mean(p.grey), c: mean(p.centre) })).sort((x, y) => (x.a < y.a ? -1 : 1));
const parent = list.map((_, i) => i);
const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
const byExact = new Map();
list.forEach((x, i) => { if (byExact.has(x.p.exact)) union(i, byExact.get(x.p.exact)); else byExact.set(x.p.exact, i); });
// a gap is at least the difference of the two means — only pictures close in mean need comparing (by the whole · by the middle)
for (const [key, limit] of [['m', PHOTO_FULL], ['c', PHOTO_CENTRE]]) {
  const order = list.map((_, i) => i).sort((i, j) => list[i][key] - list[j][key]);
  for (let s = 0; s < order.length; s++) {
    for (let t = s + 1; t < order.length && list[order[t]][key] - list[order[s]][key] < limit; t++) {
      const i = order[s], j = order[t];
      if (find(i) !== find(j) && same(list[i].p, list[j].p)) union(i, j);
    }
  }
}
const groups = new Map();
list.forEach((x, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(x.a); });
const out = [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort()).sort((x, y) => (x[0] < y[0] ? -1 : 1));
const doc = {
  about: '같은 그림 묶음 — 주소가 달라도 같은 사진이면 한 묶음(첫 주소가 그 사진의 이름). app/scripts/build_picture_ids.mjs가 만든다(직접 고치지 않음). '
    + '레이아웃 자동 구성과 장별 AI 채우기가 한 제안서 안에서 같은 사진을 두 번 쓰지 않는 데 쓴다. 제품 컷 묶음(img/prod)은 넣지 않는다.',
  version: VERSION, pictures: prints.size, groups: out,
};
const text = JSON.stringify(doc, null, 0).replace(/\],\[/g, '],\n[') + '\n';
const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (check) {
  if (before !== text) { console.error(`picture_ids.json is stale — run node app/scripts/build_picture_ids.mjs (${out.length} groups now)`); process.exit(1); }
  console.log(`picture_ids.json ok · ${prints.size} pictures · ${out.length} groups`);
} else {
  if (before !== text) fs.writeFileSync(OUT, text);
  console.log(`picture_ids.json ${before === text ? 'unchanged' : 'written'} · ${prints.size} pictures (${fresh} newly read) · ${out.length} groups of the same picture · ${unread.length} unreadable`);
  if (unread.length) console.log('  unreadable: ' + unread.slice(0, 8).join(' · ') + (unread.length > 8 ? ' …' : ''));
}
