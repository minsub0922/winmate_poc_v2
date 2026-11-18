// 샘플 버티컬 시나리오 · 이미지 반복 점검 — 시나리오마다 실제로 그려지는 모든 장의 사진 · 배경 · 이미지 어셋을 모아
// (레이아웃이 원래 갖고 있는 사진 + 채운 값 ov.img + 장 배경 ov.bg), 같은 그림이 한 시나리오 안에서 두 번 이상 쓰였는지 본다.
// 주소가 달라도 같은 그림이면 같은 것으로 본다(디코딩한 픽셀 지문 · 줄인 크기의 비슷함 비교).
//   node app/scripts/audit_scenario_images.mjs [out.json] [--only id,id]     (Vite in-process, /api stubbed — 서버 · 모델 불필요)
//   CHROME=<chrome 실행 파일> 로 시스템 Chrome을 쓸 수 있다. 바꿀 수 있는데 남은 반복이 있으면 exit 1.
// 반복을 고치는 것은 dedupe_scenario_images.mjs (scenario_image_swaps.json을 다시 만든다) — 이 파일의 collect · fingerprint · repeatsOf를 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'app/web/package.json'));
const sharp = require('sharp');
const { createServer } = await import(path.join(root, 'app/web/node_modules/vite/dist/node/index.js'));
const { chromium } = await import(path.join(root, 'app/web/node_modules/playwright/index.mjs'));
const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const out = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only') || 'app/tests/output/scenario-images/report.json';
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));

/* ---------- 1. every slide's pictures, from the DOM the app draws ---------- */
export async function collect(onlyIds) {
  const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'image-audit', auth_enabled: false } };
  const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route((u) => !['localhost', '127.0.0.1'].includes(u.hostname), (r) => r.abort());
    await context.route((u) => u.pathname.startsWith('/api/'), (r) => (new URL(r.request().url()).pathname === '/api/bootstrap' ? r.fulfill({ json: boot }) : r.fulfill({ status: 503, json: { code: 'audit_no_api' } })));
    await context.route('**/img/**', (r) => r.abort()); // addresses only — the pixels are read from disk below
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port); await page.locator('.home').waitFor();
    return await page.evaluate(async (ids) => {
      const { SCENARIOS, slidesOfScenario } = await import('/src/domain/templates/scenarios.js');
      const { ovOf } = await import('/src/domain/templates/scenario_storyboard.js');
      const { layoutHtml, L } = await import('/src/services/catalog.js');
      const { applyOverrides } = await import('/src/domain/slides/Slide.jsx');
      const { legacySrc } = await import('/src/domain/templates/legacy_img.js');
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:720px;overflow:hidden'; document.body.appendChild(host);
      const data = {}; // inline data: pictures by key
      const keyOf = async (src) => {
        if (!src) return '';
        if (!src.startsWith('data:')) return src;
        const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(src)))).map((b) => b.toString(16).padStart(2, '0')).join('');
        data['data:' + h] = src; return 'data:' + h;
      };
      const shown = (el) => { for (let p = el; p && p !== host; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) === 0) return false; } return true; };
      const decks = [];
      for (const s of SCENARIOS) {
        if (ids && !ids.includes(s.id)) continue;
        const slides = slidesOfScenario(s); const deck = { id: s.id, title: s.title, req: s.req, ind: s.ind || null, slides: [] };
        for (let k = 0; k < slides.length; k++) {
          const f = slides[k].f; const ov = ovOf(s.id, k, f);
          host.innerHTML = layoutHtml(f); const el = host.firstElementChild;
          const before = el ? new Map(Array.from(el.querySelectorAll('img')).map((im) => [im, im.getAttribute('data-fill') || im.getAttribute('src') || ''])) : new Map();
          if (el) applyOverrides(el, ov, k + 1);
          const base = el ? el.getBoundingClientRect() : null; const items = [];
          const box = (n) => { const r = n.getBoundingClientRect(); return { x: Math.round(r.left - base.left), y: Math.round(r.top - base.top), w: Math.round(r.width), h: Math.round(r.height) }; };
          const ovSrc = new Map(Object.entries(ov.img || {}).map(([slot, v]) => [legacySrc(v.src || ''), slot]));
          if (el) {
            for (const im of el.querySelectorAll('img')) {
              const fill = im.getAttribute('data-fill'); const raw = fill || im.getAttribute('src') || '';
              if (!raw || (raw.startsWith('blob:') && !fill)) { if (raw) items.push({ kind: 'img', key: 'unknown:' + raw.slice(0, 40), ...box(im) }); continue; }
              if (/^data:image\/gif;base64,R0lGODlhAQAB/.test(raw)) continue; // 1px blank
              const slotEl = im.closest('[data-img]'); const key = await keyOf(raw);
              // which override put this picture here: the slot it sits in, else (cover text boxes · labelled boxes) the override with this address
              const at = slotEl ? slotEl.getAttribute('data-img') : null;
              const mine = at != null && ov.img && ov.img[at] && legacySrc(ov.img[at].src || '') === raw;
              items.push({ kind: 'img', key, slot: at, ovSlot: mine ? at : ovSrc.has(raw) ? ovSrc.get(raw) : null, own: before.get(im) === raw,
                name: im.getAttribute('alt') || (slotEl && slotEl.getAttribute('data-hint')) || '', fit: im.style.objectFit || getComputedStyle(im).objectFit, shown: shown(im), ...box(im) });
            }
            for (const n of [el, ...el.querySelectorAll('*')]) {
              if (n === el && (el.hasAttribute('data-bg') || el.hasAttribute('data-bg-wait'))) continue;
              const st = n.getAttribute('style') || ''; if (!st.includes('url(')) continue;
              for (const m of st.matchAll(/url\((['"]?)(.*?)\1\)/g)) { const u = m[2].replace(/&quot;/g, ''); if (u) items.push({ kind: 'css', key: await keyOf(u), shown: shown(n), ...box(n) }); }
            }
            for (const n of el.querySelectorAll('image')) { const u = n.getAttribute('href') || n.getAttribute('xlink:href'); if (u) items.push({ kind: 'svg', key: await keyOf(u), shown: shown(n), ...box(n) }); }
            if ((el.hasAttribute('data-bg') || el.hasAttribute('data-bg-wait')) && ov.bg && ov.bg.src) items.push({ kind: 'bg', key: ov.bg.src, shown: true, x: 0, y: 0, w: 1280, h: 720 });
          }
          const texts = el ? Array.from(el.querySelectorAll('[data-tb]')).map((n) => ({ s: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70), ...box(n) })).filter((t) => t.s && t.w > 0) : [];
          const ovImg = Object.fromEntries(Object.entries(ov.img || {}).map(([slot, v]) => [slot, { src: v.src, name: v.name, fit: v.fit, kind: v.kind, products: v.products, pid: v.pid }]));
          deck.slides.push({ k, f, name: (L[f] && L[f].name) || f, stage: slides[k].stage && slides[k].stage.name, role: slides[k].role, missing: !el, ov: ovImg, texts, items });
        }
        decks.push(deck);
      }
      host.remove();
      return { decks, data };
    }, onlyIds ? [...onlyIds] : null);
  } finally { await browser?.close(); await server.close(); }
}

/* ---------- 2. the pixels behind an address ---------- */
const packs = new Map();
const pack = (file) => { if (!packs.has(file)) packs.set(file, JSON.parse(fs.readFileSync(file, 'utf8'))); return packs.get(file); };
const fileOf = (rel) => {
  rel = decodeURIComponent(rel.replace(/^\//, '').split('?')[0]);
  return [path.join(root, 'app/data/static', rel), path.join(root, 'app/web/public', rel), path.join(root, rel), path.join(root, 'reference/live', rel)].find((f) => fs.existsSync(f));
};
export function bytesOf(key, data = {}) {
  if (key.startsWith('data:')) { const d = data[key]; if (!d) return null; const i = d.indexOf(','); return /;base64/.test(d.slice(0, i)) ? Buffer.from(d.slice(i + 1), 'base64') : Buffer.from(decodeURIComponent(d.slice(i + 1))); }
  if (/^https?:/.test(key) || key.startsWith('unknown:')) return null;
  const m = /^(.*\.json)#(\d+)$/.exec(key);
  if (m) { const f = fileOf(m[1]); if (!f) return null; const d = pack(f).images[Number(m[2])]; return d ? Buffer.from(d.slice(d.indexOf(',') + 1), 'base64') : null; }
  const f = fileOf(key); return f ? fs.readFileSync(f) : null;
}
/** exact = the decoded picture at 32×32 · near = 16×16 grey values for "the same photo, another size / crop" */
export async function fingerprint(bytes) {
  const img = sharp(bytes, { limitInputPixels: false }).flatten({ background: '#fff' });
  const meta = await sharp(bytes, { limitInputPixels: false }).metadata();
  const small = await img.clone().resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const grey = await img.clone().resize(16, 16, { fit: 'fill' }).greyscale().raw().toBuffer();
  const light = Array.from({ length: small.length / 3 }, (_, i) => Math.min(small[i * 3], small[i * 3 + 1], small[i * 3 + 2]));
  return { exact: createHash('sha1').update(small).digest('hex').slice(0, 16), grey: Array.from(grey), width: meta.width, height: meta.height, ink: light.filter((v) => v < 242).length / light.length };
}
/** mean absolute difference of the 16×16 greys (0–255) */
export const greyGap = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };

/** white corners = a cut-out on a white ground (product cuts, screens) rather than a photograph */
export const isCut = (p) => [0, 15, 240, 255].every((i) => p.grey[i] >= 238);
/** the same picture — identical pixels, or the same shot at another size / crop / encoding.
 *  tight: product cuts and screens (drawn whole, object-fit contain) — two different models can look alike, so only a near-identical image counts. */
export const samePicture = (a, b, tight = false) => a.exact === b.exact || greyGap(a.grey, b.grey) < (tight || isCut(a) || isCut(b) ? 1.2 : 5);
/** a picture counts when it is drawn and big enough to be seen as a picture (icons · logos are left out) */
export const counted = (it) => it.shown !== false && it.w * it.h >= 3600;

/** fingerprints of every address, cached by address (pictures behind an address do not change) */
export async function printsOf(keys, data, cacheFile) {
  let cache = {};
  if (cacheFile) { try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; } }
  const prints = {}; const unread = []; let fresh = 0;
  for (const key of keys) {
    if (cache[key] && !key.startsWith('data:')) { prints[key] = cache[key]; continue; }
    try { const b = bytesOf(key, data); if (!b) { unread.push(key); continue; } prints[key] = cache[key] = await fingerprint(b); fresh++; } catch (e) { unread.push(key + ' — ' + e.message.slice(0, 80)); }
  }
  if (cacheFile && fresh) { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache)); }
  return { prints, unread };
}

// 같은 그림 묶음(app/data/picture_ids.json — 자동 구성과 같은 기준, 잘라 낸 사진도 같은 사진) — 주소 → 묶음 이름
export const SAME = new Map();
try { for (const g of JSON.parse(fs.readFileSync(path.join(root, 'app/data/picture_ids.json'), 'utf8')).groups || []) for (const a of g) SAME.set(a, g[0]); } catch { /* no table: pixel comparison only */ }

/** one deck's pictures drawn more than once: [[use, use, …], …] — use = { page, f, key, kind, slot, ovSlot, own, name, fit, x, y, w, h, area } */
export function repeatsOf(deck, prints) {
  const uses = [];
  for (const s of deck.slides) for (const it of s.items) if (counted(it) && prints[it.key]) uses.push({ ...it, page: s.k + 1, f: s.f, area: it.w * it.h });
  const keys = [...new Set(uses.map((u) => u.key))]; const parent = Object.fromEntries(keys.map((k) => [k, k]));
  const tight = new Set(uses.filter((u) => u.fit === 'contain').map((u) => u.key));
  const find = (k) => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (find(keys[i]) !== find(keys[j]) && (samePicture(prints[keys[i]], prints[keys[j]], tight.has(keys[i]) || tight.has(keys[j])) || (SAME.has(keys[i]) && SAME.get(keys[i]) === SAME.get(keys[j])))) parent[find(keys[i])] = find(keys[j]);
  const groups = new Map();
  for (const u of uses) { const g = find(u.key); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(u); }
  return [...groups.values()].filter((g) => g.length > 1);
}

export const CACHE = path.join(root, 'app/tests/output/scenario-images/prints-cache.json');
export const SWAPS = path.join(root, 'app/web/src/domain/templates/scenario_image_swaps.json');

if (import.meta.url === 'file://' + process.argv[1]) {
  const { decks, data } = await collect(only);
  const { prints, unread } = await printsOf(new Set(decks.flatMap((d) => d.slides.flatMap((s) => s.items.map((i) => i.key)))), data, CACHE);
  const kept = JSON.parse(fs.readFileSync(SWAPS, 'utf8')).kept || {};
  const rows = decks.map((d) => ({ id: d.id, title: d.title, slides: d.slides.length, repeats: repeatsOf(d, prints).map((g) => g.map(({ page, f, key, slot, ovSlot, name, w, h }) => ({ page, f, key, slot: ovSlot ?? slot, name, w, h }))) }));
  const open = rows.flatMap((r) => r.repeats.filter((g) => !(kept[r.id] || []).some((k) => g.some((u) => u.key === k.key))).map((g) => r.id + ' — ' + g.map((u) => 'p' + u.page).join(' · ') + ' ' + g[0].key));
  const target = path.resolve(root, out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ decks: rows, unread }, null, 1));
  console.log(JSON.stringify({ decks: decks.length, slides: decks.reduce((n, d) => n + d.slides.length, 0), repeated: rows.reduce((n, r) => n + r.repeats.length, 0), keptOnPurpose: rows.reduce((n, r) => n + r.repeats.length, 0) - open.length, open: open.length, unread: unread.length, out }));
  for (const line of open.slice(0, 40)) console.log('REPEAT', line);
  if (open.length) process.exitCode = 1;
}
