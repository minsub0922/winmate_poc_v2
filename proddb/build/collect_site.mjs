// Fresh port of winmate-kb v1 collect/01,02,05,06,07 — same-origin fetches inside headless Chromium on samsung.com/sec/business.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = new URL('../raw', import.meta.url).pathname; // proddb/raw
const log = (...a) => { const s = new Date().toISOString().slice(11, 19) + ' ' + a.join(' '); console.log(s); fs.appendFileSync(OUT + '/collect.log', s + '\n'); };
const site = fs.readFileSync(OUT + '/site_lists.txt', 'utf8').split('\n').filter(Boolean).map((l) => l.replace('/sec/business/', '').replace(/\/$/, ''));
const EXTRA = [['chromebooks/all-chromebooks', '10002700', 'Chromebook'], ['display-solution/all-display-solution', '100002762', '사이니지 솔루션'], ['harman/all-harman', '10001500', '하만 프로 오디오'], ['mobile-solution/all-mobile-solution', '100002767', '모바일 솔루션'], ['printing-solution/all-printing-solution', '100002689', '프린팅 솔루션'], ['sac-solution/all-sac-solution', '100002745', '시스템에어컨 솔루션'], ['tv-vd-solution/all-tv-vd-solution', '100002764', 'TV/음향 솔루션'], ['xr/all-xr', '100002875', '갤럭시 XR']];
const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--no-sandbox'], ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const pg = await b.newPage();
await pg.goto('https://www.samsung.com/sec/business/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await pg.evaluate(() => {
  window.LIST = (no, f = '', rows = 400) => `/sec/business/cxhr/pf/goodsList?searchFilter=${encodeURIComponent(f)}&dispClsfNo=${no}&sortType=10&page=1&rows=${rows}&ehcacheYn=Y&soldOutExceptYn=N&pfFasterUseYn=N&secApp=false&secIos=false&aiscCtgYn=N&tcPlantCode=`;
  window.KEEP = ['goodsId', 'goodsNm', 'mdlCode', 'mdlNm', 'grpPath', 'goodsDetailUrl', 'dispClsfNo', 'dlgtDispClsfEnNm', 'compDispClsfEnNm', 'compDispClsfNo', 'uspDescList', 'goodsOptStr', 'saleStatCd', 'sysRegDtm', 'goodsTpCd', 'intgrSpecYn', 'flagStr', 'goodsFlagName', 'itdcMsg1', 'bspkGoodsYn', 'salePrice'];
  window.catPage = async (p) => {
    const h = await fetch('/sec/business/' + p + '/').then((r) => (r.ok ? r.text() : ''));
    const m = h.match(/dispClsfNo["'\s:=]+["']?(\d{6,})/);
    const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const d = new DOMParser().parseFromString(h, 'text/html');
    const meta = {};
    for (const i of d.querySelectorAll('input[data-search-filter]')) meta[i.getAttribute('data-search-filter')] = { group: i.getAttribute('data-filter-nm'), label: (i.getAttribute('data-filter-item-nm') || '').trim(), min: i.getAttribute('data-min-val') || null, max: i.getAttribute('data-max-val') || null };
    const tabs = [...d.querySelectorAll('a[onclick*="/?"]')].map((a) => { const mm = (a.getAttribute('onclick') || '').match(/\/sec\/business\/([^'"?]+)\/\?([^'"]+)/); return mm ? [mm[1], mm[2], a.textContent.trim()] : null; }).filter(Boolean);
    return { no: m && m[1], title: t.split('|')[0].trim(), meta, tabs };
  };
  window.list = async (c) => {
    const j = await fetch(LIST(c.no)).then((r) => r.json());
    const products = [], variants = [];
    for (const p of j.products || []) {
      const o = { catPath: c.p, catNo: c.no, catTitle: c.title };
      for (const k of KEEP) o[k] = p[k];
      o.images = []; for (let i = 1; i <= 8; i++) if (p['imgPath' + i]) o.images.push({ src: p['imgPath' + i], alt: p['imgContent' + i] || null });
      products.push(o);
      for (const line of (p.goodsOptStr || '').split('\n')) { const f = line.split('|'); if (f.length > 9 && f[9]) variants.push({ goodsId: f[9], mdlCode: f[8], parentGoodsId: p.goodsId, optName: f[4], optValue: f[5], optValue2: f[6], soldOut: f[7] }); }
    }
    return { count: j.count, filters: j.filters || [], products, variants };
  };
  window.filterMembers = async (no, f) => { const k = await fetch(LIST(no, f)).then((r) => r.json()); return (k.products || []).map((x) => x.goodsId); };
  window.spec = async (gid, tp) => {
    const html = await fetch('/sec/business/xhr/goods/getGoodsSpecList', { method: 'POST', body: new URLSearchParams({ goodsId: gid, goodsTpCd: tp }), headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.text());
    const d = new DOMParser().parseFromString(html, 'text/html'); const rows = [];
    for (const dl of d.querySelectorAll('dl')) { let g = null; for (const ch of dl.children) { if (ch.tagName === 'DT') g = ch.textContent.trim(); else if (ch.tagName === 'DD') { for (const li of ch.querySelectorAll('li')) { const t = li.querySelector('.spec-title'); const v = li.querySelector('.spec-desc'); if (t) rows.push([g, t.textContent.replace(/\s+/g, ' ').trim(), v ? v.textContent.replace(/ /g, ' ').replace(/\s+/g, ' ').trim() : null]); } } } }
    return rows;
  };
  window.__parsePdp = (html) => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('br').forEach((b) => b.replaceWith(' '));
    const val = (id) => { const e = d.getElementById(id); return e ? (e.value || e.textContent || '').trim() : null; };
    const meta = (n) => { const e = d.querySelector(`meta[name="${n}"],meta[property="${n}"]`); return e ? e.content : null; };
    const T = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
    const imgOf = (root) => { const by = new Map(); const order = [];
      for (const i of root.querySelectorAll('img, source')) {
        let s = i.getAttribute('data-src') || i.getAttribute('data-srcset') || i.getAttribute('srcset') || i.getAttribute('src') || '';
        s = s.split(',')[0].trim().split(' ')[0];
        if (!s || s.startsWith('data:') || /img_baseimg_null|blank\.gif|spacer/.test(s)) continue;
        const pic = i.closest('picture'); const imgEl = i.tagName === 'SOURCE' && pic ? pic.querySelector('img') : i;
        const alt = ((imgEl && imgEl.getAttribute('alt')) || '').trim();
        const media = i.getAttribute('media') || '';
        const mo = /_MO_|_MO\$|\$[A-Z_]*MO[A-Z_]*\$/.test(s) || /max-width/.test(media) || !!i.closest('.mo-ver, .mo-only');
        const key = alt ? (pic ? 'p:' + alt + '|' + [...root.querySelectorAll('picture')].indexOf(pic) : 'a:' + alt) : s;
        if (!by.has(key)) { by.set(key, { src: null, mo_src: null, alt }); order.push(key); }
        const o = by.get(key); if (mo) { o.mo_src = o.mo_src || s; } else { o.src = o.src || s; }
      }
      return order.map((k) => { const o = by.get(k); return { src: o.src || o.mo_src, mo_src: o.src ? o.mo_src : null, alt: o.alt }; }); };
    const vids = (root) => [...root.querySelectorAll('video source, video')].map((v) => v.getAttribute('data-src') || v.getAttribute('src')).filter(Boolean);
    let comps = [...d.querySelectorAll('.itm-component .wrap-component')]; if (!comps.length) comps = [...d.querySelectorAll('.itm-component > *')];
    const feats = [];
    for (const c0 of comps) {
      const c = c0.cloneNode(true);
      c.querySelectorAll('script,style,noscript,.mo-ver,.slider-controls,.blind').forEach((e) => e.remove());
      const type = [...c0.classList].find((x) => x !== 'wrap-component' && !/^(new-component|AATagging|pt-|pb-|w1440|img-|txt)/.test(x)) || null;
      const titles = [...c.querySelectorAll('.title, h2:not(.sub), h3:not(.sub)')].map(T).filter((x) => x && x.length > 1);
      const subs = [...c.querySelectorAll('.sub')].map(T).filter(Boolean);
      const descs = [...c.querySelectorAll('.desc')].map(T).filter(Boolean);
      const discs = [...c.querySelectorAll('.disc, .disclaimer')].map(T).filter(Boolean);
      const imgs = imgOf(c0);
      const text = T(c).slice(0, 2000);
      if (!text && !imgs.length) continue;
      const items = [];
      for (const s0 of c0.querySelectorAll('.visual, .swiper-slide, .slick-slide, .slide-item')) {
        const s = s0.cloneNode(true); s.querySelectorAll('script,style,.mo-ver,.blind').forEach((e) => e.remove());
        const h = T(s.querySelector('.title, h2, h3, h4, strong')); const ds = [...s.querySelectorAll('.desc')].map(T).filter(Boolean).join(' ');
        const im = imgOf(s0); if (h || ds || im.length) items.push({ h, desc: ds.slice(0, 400), imgs: im.slice(0, 3) });
      }
      feats.push({ type, h: titles[0] || subs[0] || null, h_all: [...new Set(titles)].slice(0, 8), sub: subs[0] || null, desc: [...new Set(descs)].join(' ').slice(0, 1500), disc: [...new Set(discs)].join(' ').slice(0, 800), text, imgs, videos: vids(c0).slice(0, 4), items: items.slice(0, 12) });
    }
    return { title: T(d.querySelector('title')), desc: meta('description'), ogImage: meta('og:image'), ctg1: val('1depthCtgNm'), ctg2: val('2depthCtgNm'), feats, parser: 'pdp_v2' };
  };
  window.pdp = async (url) => { const r = await fetch('/sec/business/' + url); return { status: r.status, final: r.url, data: r.ok ? __parsePdp(await r.text()) : null }; };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = { cats: [], products: {}, cardOrder: [], variants: {}, filters: {}, fetchedAt: new Date().toISOString() };
const FM = { meta: {}, tabs: {}, members: {} };
const errors = [];
// 1 · categories (01 + 06)
const paths = [...site, ...EXTRA.map((e) => e[0]).filter((p) => !site.includes(p))];
for (const p of paths) {
  try {
    const r = await pg.evaluate((p) => catPage(p), p);
    const ex = EXTRA.find((e) => e[0] === p);
    const no = r.no || (ex && ex[1]);
    if (!no) { errors.push({ stage: 'cat', p, e: 'no dispClsfNo' }); log('cat skip', p); continue; }
    const c = { p, no, title: r.title || (ex && ex[2]) || p, extra: !site.includes(p) };
    W.cats.push(c); FM.meta[no] = r.meta; FM.tabs[no] = r.tabs;
  } catch (e) { errors.push({ stage: 'cat', p, e: String(e) }); }
  await sleep(150);
}
log('cats', W.cats.length);
// 2 · lists + filter membership (02 lists phase + 05)
for (const c of W.cats) {
  try {
    const j = await pg.evaluate((c) => list(c), c);
    c.allFilters = j.filters; c.filters = j.filters; c.listCount = j.count; c.count = j.count;
    FM.members[c.no] = j.products.map((x) => x.goodsId);
    for (const o of j.products) { if (W.products[o.goodsId]) { (W.products[o.goodsId].alsoIn = W.products[o.goodsId].alsoIn || []).push(c.p); continue; } W.products[o.goodsId] = o; W.cardOrder.push(o.goodsId); }
    for (const v of j.variants) if (!W.variants[v.goodsId]) W.variants[v.goodsId] = v;
    W.filters[c.no] = {};
    for (const f of j.filters) { try { W.filters[c.no][f] = await pg.evaluate(([no, f]) => filterMembers(no, f), [c.no, f]); } catch (e) { errors.push({ stage: 'filter', c: c.no, f, e: String(e) }); } await sleep(120); }
    log('list', c.p, j.count, 'filters', j.filters.length);
  } catch (e) { errors.push({ stage: 'list', c: c.no, e: String(e) }); log('list ERR', c.p, String(e).slice(0, 120)); }
  await sleep(150);
}
W.finishedListsAt = new Date().toISOString();
fs.writeFileSync(OUT + '/wkb_products.json', JSON.stringify(W));
fs.writeFileSync(OUT + '/wkb_filter_meta.json', JSON.stringify(FM));
log('cards', W.cardOrder.length, 'variants', Object.keys(W.variants).length);
// 3 · specs (cards + variants), 3 at a time
const S = {};
const ids = [...new Set([...Object.keys(W.products), ...Object.keys(W.variants)])];
const tpOf = (gid) => (W.products[gid] && W.products[gid].goodsTpCd) || (W.products[(W.variants[gid] || {}).parentGoodsId] || {}).goodsTpCd || '10';
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = items[i++]; await fn(k); await sleep(180); } })); }
let done = 0;
await pool(ids, 3, async (gid) => { try { S[gid] = await pg.evaluate(([g, t]) => spec(g, t), [gid, tpOf(gid)]); } catch (e) { errors.push({ stage: 'spec', gid, e: String(e) }); } if (++done % 100 === 0) log('specs', done, '/', ids.length); });
fs.writeFileSync(OUT + '/wkb_specs.json', JSON.stringify(S));
log('specs done', Object.keys(S).length);
// 4 · PDP features v2
const F = {};
done = 0;
await pool(W.cardOrder.filter((g) => W.products[g].goodsDetailUrl), 3, async (gid) => {
  try { const r = await pg.evaluate((u) => pdp(u), W.products[gid].goodsDetailUrl); if (r.data) F[gid] = r.data; else errors.push({ stage: 'feature', gid, status: r.status, final: r.final }); } catch (e) { errors.push({ stage: 'feature', gid, e: String(e) }); }
  if (++done % 50 === 0) log('pdp', done);
});
fs.writeFileSync(OUT + '/wkb_features.json', JSON.stringify(F));
W.finishedAt = new Date().toISOString();
fs.writeFileSync(OUT + '/wkb_products.json', JSON.stringify(W));
fs.writeFileSync(OUT + '/errors.json', JSON.stringify(errors, null, 1));
log('DONE features', Object.keys(F).length, 'errors', errors.length);
await b.close();
