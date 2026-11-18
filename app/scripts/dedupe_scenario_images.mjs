// 샘플 버티컬 시나리오 · 같은 그림 반복 없애기 — 한 시나리오 안에서 같은 사진 · 제품 컷 · 솔루션 화면이 두 번 이상 나오면
// 가장 크게 쓰인 자리 하나만 남기고, 나머지 자리는 같은 대상의 다른 공식 그림으로 바꾼다.
//   제품 컷      → 그 제품의 다른 공식 컷 (정면 · 45도 · 옆면 …)
//   솔루션 화면  → 그 솔루션의 다른 화면 · 구성도
//   사진         → 같은 도입사례의 다른 사진, 없으면 같은 업종의 공식 사진 중 설명이 가장 가까운 것
// 바꿀 그림이 없으면 그대로 두고 scenario_image_swaps.json의 kept에 이유를 적는다.
//   node app/scripts/dedupe_scenario_images.mjs            # 다시 만들고 다시 그려 확인
//   node app/scripts/audit_scenario_images.mjs             # 점검만
// 시나리오 데이터(rebuild_*.py · build.py)를 다시 만든 뒤에는 이 스크립트를 다시 돌린다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, printsOf, repeatsOf, samePicture, isCut, counted, CACHE, SWAPS } from './audit_scenario_images.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ABOUT = '같은 그림이 한 시나리오 안에서 두 번 나오지 않게 바꾼 이미지 — app/scripts/dedupe_scenario_images.mjs가 만든다(직접 고치지 않음). swaps: 시나리오 → 장(0부터) → 이미지 칸 → { f 레이아웃, from 원래 주소(레이아웃 자체 사진이면 null), to 바꾼 값 } · kept: 바꿀 그림이 없어 남긴 반복.';

/* ---------- the picture library ---------- */
const lib = JSON.parse(execFileSync(path.join(root, 'app/.venv/bin/python'), [path.join(root, 'app/scripts/scenario_image_assets.py')], { cwd: path.join(root, 'app/scripts'), maxBuffer: 1 << 28 }).toString());
const caseOf = new Map(); // address → { cid, cust, ind, kind, desc, w, h }
for (const [cid, c] of Object.entries(lib.cases)) for (const im of c.images) if (!caseOf.has(im.src)) caseOf.set(im.src, { ...im, cid, cust: c.cust, ind: c.ind });
const solOf = new Map();
for (const [sid, s] of Object.entries(lib.solutions)) for (const im of s.images) if (!solOf.has(im.src)) solOf.set(im.src, { ...im, sid, owner: s.name });
const prodOf = new Map(); // address → [product ids]
for (const [pid, p] of Object.entries(lib.products)) for (const im of p.images) { if (!prodOf.has(im.src)) prodOf.set(im.src, []); prodOf.get(im.src).push(pid); }
const photoOf = new Map(lib.photos.map((p) => [p.src, p]));
// 표준 제안서의 제품 표(vertical_standard/prod.py): 표시 이름 · 대표 이미지 → 제품 id
const NAMED = [...fs.readFileSync(path.join(root, 'app/scripts/vertical_standard/prod.py'), 'utf8').matchAll(/'\w+': \('([^']+)', '([^']+)', (None|'[^']+'),/g)]
  .map((m) => ({ pid: m[1], name: m[2], image: m[3] === 'None' ? null : m[3].slice(1, -1) })).filter((x) => lib.products[x.pid]);

/* ---------- words ---------- */
const bare = (s) => String(s || '').split(' · ')[0].replace(/\([^)]*\)/g, ' ');
const grams = (s) => { const t = bare(s).replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase(); const g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
// how alike two descriptions are (0–1): shared two-letter pieces, rare ones (택배 · 병실 …) weighing more than common ones (있는 · 앞에 …)
const DF = new Map(); let DOCS = 0;
for (const d of [...Object.values(lib.cases).flatMap((c) => c.images.map((im) => im.desc)), ...lib.photos.map((p) => p.desc)]) { DOCS++; for (const g of grams(d)) DF.set(g, (DF.get(g) || 0) + 1); }
const weight = (g) => Math.log(1 + DOCS / (1 + (DF.get(g) || 0)));
const sim = (a, b) => { const x = grams(a), y = grams(b); if (!x.size || !y.size) return 0; let n = 0, all = 0; for (const g of x) { all += weight(g); if (y.has(g)) n += 2 * weight(g); } for (const g of y) all += weight(g); return n / all; };

/* ---------- 1. the decks as drawn, without earlier swaps ---------- */
fs.writeFileSync(SWAPS, JSON.stringify({ about: ABOUT, swaps: {}, kept: {} }) + '\n');
const { decks, data } = await collect(null);
const deckKeys = new Set(decks.flatMap((d) => d.slides.flatMap((s) => s.items.map((i) => i.key))));
// descriptions of pictures the library does not index (img/fill · img/bs …): the names the decks give them
const seenName = new Map(); const seenInd = new Map();
for (const d of decks) for (const s of d.slides) for (const it of s.items) if (it.name && !it.key.startsWith('data:')) {
  if (!seenName.has(it.key)) seenName.set(it.key, it.name);
  if (d.ind) { if (!seenInd.has(it.key)) seenInd.set(it.key, new Set()); seenInd.get(it.key).add(d.ind); }
}
// products a deck shows — their other cuts are candidates
const productIdOf = (use, entry) => {
  const named = entry && (entry.products && entry.products[0] || entry.pid);
  if (named && lib.products[named]) return named;
  const byImage = NAMED.find((x) => x.image && x.image === use.key);
  if (byImage) return byImage.pid;
  const own = prodOf.get(use.key) || [];
  if (own.length === 1) return own[0];
  const label = bare(use.name);
  const byName = NAMED.filter((x) => label && (label.includes(x.name) || x.name.includes(label))).sort((a, b) => b.name.length - a.name.length)[0];
  if (byName) return byName.pid;
  if (own.length) return own.slice().sort((a, b) => sim(lib.products[b].name, label) - sim(lib.products[a].name, label))[0];
  const alike = NAMED.map((x) => [sim(x.name, label), x]).sort((a, b) => b[0] - a[0])[0];
  return alike && alike[0] >= 0.6 ? alike[1].pid : null;
};
const wanted = new Set(deckKeys);
for (const im of caseOf.values()) if ((['s', 'e', 'p'].includes(im.kind) && im.w >= 350 && im.h >= 190) || (im.kind === 'c' && im.w >= 250 && im.h >= 180) || (['u', 'd'].includes(im.kind) && im.w >= 300)) wanted.add(im.src);
for (const im of solOf.values()) if (im.w >= 300) wanted.add(im.src);
for (const p of lib.photos) wanted.add(p.src);
for (const d of decks) for (const s of d.slides) for (const it of s.items) { const pid = productIdOf(it, it.ovSlot != null ? s.ov[it.ovSlot] : null); if (pid) for (const im of lib.products[pid].images) wanted.add(im.src); }
const { prints, unread } = await printsOf(wanted, data, CACHE);

/* ---------- 2. choose ---------- */
const kindOf = (use, entry) => {
  if (entry && (entry.kind === 'product' || entry.products)) return 'product';
  const sol = solOf.get(use.key);
  if (sol && (['u', 'd', 'k'].includes(sol.kind) || use.fit === 'contain')) return 'screen'; // a solution's screen · diagram · key visual, or any of its pictures drawn whole as its emblem
  if (prodOf.has(use.key) || NAMED.some((x) => x.image === use.key)) return 'product';
  if (entry && ['u', 'd'].includes(entry.kind) || (caseOf.get(use.key) && ['u', 'd'].includes(caseOf.get(use.key).kind))) return 'screen';
  // drawn whole (object-fit: contain) and not a library photograph: a product cut or a screen — never swapped for a scene photograph
  if (use.fit === 'contain' && !photoOf.has(use.key) && !(caseOf.get(use.key) && ['s', 'e', 'p'].includes(caseOf.get(use.key).kind))) return productIdOf(use, entry) ? 'product' : 'cut';
  return 'photo';
};
const BAD_CUT = /후면|뒷면|배면|단자|포트|리모컨|구성품|패키지|치수|도면|박스|라벨|로고|아이콘/;
const cutRank = (alt) => (/정면|전면/.test(alt) ? 0 : /45도|30도|15도|사선|정측면/.test(alt) ? 1 : /옆면|측면/.test(alt) ? 2 : /첫번째/.test(alt) ? 3 : 4);
const near = (slide, use) => {
  const gap = (t) => Math.max(0, Math.max(t.x - (use.x + use.w), use.x - (t.x + t.w)), Math.max(t.y - (use.y + use.h), use.y - (t.y + t.h)));
  return slide.texts.filter((t) => t.s.length > 3 && !/^(\d\d|CONFIDENTIAL)/.test(t.s)).map((t) => [gap(t), t.s]).filter((x) => x[0] < 150).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]).join(' ');
};
/** a 도입사례 page about the customer a photograph belongs to (a table of contents that only names the customer is not one) */
const atHome = (slide, c) => !!(c && c.cust && /사례|CASE/i.test([slide.stage, slide.role, slide.name, slide.f].join(' ')) && slide.texts.some((t) => t.s.includes(c.cust)));
const crop = (use, p) => { const a = use.w / use.h, b = p.width / p.height; return Math.min(a / b, b / a); }; // share of the picture a cover-fit slot shows

const swaps = {}, kept = {}, summary = [];
for (const d of decks) {
  const groups = repeatsOf(d, prints);
  if (!groups.length) { summary.push({ id: d.id, groups: 0, swapped: 0, left: 0 }); continue; }
  const slideOf = Object.fromEntries(d.slides.map((s) => [s.k + 1, s]));
  const used = d.slides.flatMap((s) => s.items.filter((it) => prints[it.key] && it.shown !== false).map((it) => prints[it.key])); // every picture of the deck, small ones too
  const free = (src, tight = false) => prints[src] && !used.some((p) => samePicture(p, prints[src], tight));
  const inds = new Set(d.ind ? [d.ind] : []);
  if (!inds.size) for (const s of d.slides) for (const it of s.items) for (const i of (caseOf.get(it.key) || {}).ind || []) inds.add(i);
  let swapped = 0, left = 0;
  // the biggest use keeps the picture; what cannot be changed (layout art outside an image slot) keeps it first
  const canSwap = (u) => u.kind === 'img' && (u.ovSlot != null || (u.own && u.slot != null));
  for (const g of groups.sort((a, b) => Math.max(...b.map((u) => u.area)) - Math.max(...a.map((u) => u.area)))) {
    // who keeps the picture: what cannot change, then the cover, then the 도입사례 page of the customer the photograph belongs to, then the biggest use
    const home = (u) => (atHome(slideOf[u.page], caseOf.get(u.key)) ? 0 : 1);
    g.sort((a, b) => (canSwap(a) - canSwap(b)) || ((a.page === 1 ? 0 : 1) - (b.page === 1 ? 0 : 1)) || (home(a) - home(b)) || (b.area - a.area) || (a.page - b.page));
    for (const use of g.slice(1)) {
      const slide = slideOf[use.page]; const entry = use.ovSlot != null ? slide.ov[use.ovSlot] : null;
      const keep = (why) => { left++; (kept[d.id] = kept[d.id] || []).push({ page: use.page, key: use.key, why }); };
      if (!canSwap(use)) { keep('레이아웃에 고정된 그림'); continue; }
      const kind = kindOf(use, entry); const label = use.name || seenName.get(use.key) || ''; let pick = null;
      if (kind === 'product') {
        const pid = productIdOf(use, entry);
        // the product's own official cuts — any angle but the back; not a much smaller file than the one it replaces
        const floor = Math.min(200, 0.6 * (prints[use.key] ? prints[use.key].width : 200));
        // an edge-on view of a slim product is only a thin bar — not a picture of it
        const shape = (q) => q.width / q.height; const was = prints[use.key] ? shape(prints[use.key]) : 1.5;
        const whole = (q) => (shape(q) >= 0.4 && shape(q) <= 3.6) || Math.abs(Math.log(shape(q) / was)) < 0.35;
        const cuts = pid ? lib.products[pid].images.filter((im) => !BAD_CUT.test(im.alt) && free(im.src, true) && prints[im.src].width >= floor && prints[im.src].height >= 40 && whole(prints[im.src]))
          .sort((a, b) => cutRank(a.alt) - cutRank(b.alt)) : [];
        if (cuts.length) pick = { src: cuts[0].src, name: lib.products[pid].name + (cuts[0].alt ? ' · ' + bare(cuts[0].alt.replace(/<br\/?>/g, ' ')).trim() : '') };
        else { keep(pid ? '이 제품의 다른 공식 컷이 없음' : '제품을 알 수 없는 컷'); continue; }
      } else if (kind === 'screen') {
        const now = solOf.get(use.key); const sid = now ? now.sid : Object.keys(lib.solutions).find((id) => label.includes(lib.solutions[id].name));
        const own = caseOf.get(use.key); // a screen shown in a 도입사례 gallery → that case's other screens
        const kinds = now && !['u', 'd', 'k'].includes(now.kind) ? ['u', 'd', 'k', 's', 'p'] : ['u', 'd'];
        const pool = sid ? lib.solutions[sid].images.filter((im) => kinds.includes(im.kind) && im.w >= 300 && free(im.src, true))
          : own ? lib.cases[own.cid].images.filter((im) => ['u', 'd'].includes(im.kind) && im.w >= 300 && free(im.src, true)) : [];
        const best = pool.map((im) => [(now && im.kind === now.kind ? 2 : 0) + 6 * sim(im.desc, label) + 3 * sim(im.desc, near(slide, use)) + crop(use, prints[im.src]), im]).sort((a, b) => b[0] - a[0])[0];
        if (best) pick = { src: best[1].src, name: best[1].desc + ' · ' + (sid ? lib.solutions[sid].name : own.cust) };
        else { keep(sid || own ? '이 솔루션 · 사례의 다른 화면이 없음' : '솔루션을 알 수 없는 화면'); continue; }
      } else if (kind === 'photo') {
        const now = caseOf.get(use.key) || solOf.get(use.key); const context = near(slide, use); const pool = [];
        // another customer's building front or signboard would put a different brand on the page — only the same case may give those
        const BRAND = /외관|간판|현판|로고|사옥|전경|정문|파사드/;
        // a photograph fills its frame: wordmarks, cut-outs and screens on a white ground (little ink) do not stand in for one
        const add = (src, desc, owner, bonus) => { if (free(src) && prints[src].width >= 300 && prints[src].ink >= 0.8 && !/워드마크|로고|아이콘|엠블럼/.test(desc) && (bonus || !BRAND.test(desc))) pool.push({ src, desc, owner, bonus }); };
        // a 도입사례 page shows that customer's own site: only the same case's photographs may stand in there
        const bound = !!(now && now.cid) && atHome(slide, now);
        // the same case first — its scene photographs, and its close-ups where the slot is small enough for them
        if (now && now.cid) for (const im of lib.cases[now.cid].images) if ((['s', 'e', 'p'].includes(im.kind) && im.w >= 350 && im.h >= 190) || (im.kind === 'c' && im.w >= Math.max(250, 0.6 * use.w) && im.h >= 180)) add(im.src, im.desc, now.cust, bound ? 6 : 2);
        if (now && now.sid) for (const im of lib.solutions[now.sid].images) if (['s', 'p'].includes(im.kind) && im.w >= 350) add(im.src, im.desc, now.owner, 2);
        if (!bound) {
          const place = new Set([...inds, ...((now && now.ind) || []), ...(seenInd.get(use.key) || [])]);
          for (const [cid, c] of Object.entries(lib.cases)) if (c.ind.some((i) => place.has(i)) && !(now && now.cid === cid)) for (const im of c.images) if (['s', 'e', 'p'].includes(im.kind) && im.w >= 350 && im.h >= 190) add(im.src, im.desc, c.cust, 0);
          for (const p of lib.photos) if (place.has(p.ind)) add(p.src, p.desc, p.owner, 0);
          // photographs the decks already carry in topic packs (img/fill …), by the names the decks give them — graphics and key visuals are not photographs.
          // A picture of Samsung itself (headquarters · service engineers · care centre) may be answered by another one, whatever the industry.
          const samsung = /삼성전자|SAMSUNG 조형물|디지털시티/.test(label);
          for (const [src, name] of seenName) {
            if (caseOf.has(src) || solOf.has(src) || prodOf.has(src) || photoOf.has(src) || !/^img\/(fill|bs|ph)\//.test(src) || src.startsWith('img/fill/cut.json') || !prints[src] || isCut(prints[src])) continue;
            if (/워드마크|로고|아이콘|엠블럼|플랫폼|화면|대시보드|구성도|목업|다이어그램|Samsung (VXT|DeX|Knox)/.test(name)) continue;
            if (samsung && /엔지니어|상담 센터|삼성케어|사옥|삼성 강남|메가스토어 삼성|서비스 —/.test(name)) add(src, name, '', 4);
            else if ([...(seenInd.get(src) || [])].some((i) => place.has(i))) add(src, name, '', 0);
          }
        }
        const scored = pool.map((c) => { const p = prints[c.src]; const fit = crop(use, p); return [c.bonus + 12 * sim(c.desc, label) + 5 * sim(c.desc, context) + 3 * fit - (p.width < use.w * 0.5 ? 3 : 0) - (fit < 0.4 ? 4 : 0), c]; }).sort((a, b) => b[0] - a[0]);
        if (scored.length && scored[0][0] >= 1.2) pick = { src: scored[0][1].src, name: scored[0][1].desc + (scored[0][1].owner ? ' · ' + scored[0][1].owner : '') };
        else { keep(bound ? '이 도입사례의 다른 사진이 없음' : '같은 사례 · 업종에 어울리는 다른 사진이 없음'); continue; }
      } else { keep('대체할 공식 컷을 찾을 수 없는 그림'); continue; }
      used.push(prints[pick.src]); swapped++;
      const slot = use.ovSlot != null ? use.ovSlot : use.slot;
      ((swaps[d.id] = swaps[d.id] || {})[use.page - 1] = swaps[d.id][use.page - 1] || {})[slot] = { f: use.f, from: entry ? entry.src : null, to: { src: pick.src, name: pick.name, ...(entry ? {} : { fit: use.fit === 'contain' ? 'contain' : 'cover' }) } };
    }
  }
  summary.push({ id: d.id, groups: groups.length, swapped, left });
}
fs.writeFileSync(SWAPS, JSON.stringify({ about: ABOUT, swaps, kept }, null, 1) + '\n');

/* ---------- 3. draw again and check ---------- */
const after = await collect(null);
const again = await printsOf(new Set(after.decks.flatMap((d) => d.slides.flatMap((s) => s.items.map((i) => i.key)))), after.data, CACHE);
const open = [];
for (const d of after.decks) for (const g of repeatsOf(d, again.prints)) if (!(kept[d.id] || []).some((k) => g.some((u) => u.key === k.key))) open.push(d.id + ' — ' + g.map((u) => 'p' + u.page).join(' · ') + ' ' + g[0].key);
const total = (k) => summary.reduce((n, x) => n + x[k], 0);
fs.mkdirSync(path.join(root, 'app/tests/output/scenario-images'), { recursive: true });
fs.writeFileSync(path.join(root, 'app/tests/output/scenario-images/dedupe.json'), JSON.stringify({ summary, open, unread }, null, 1));
console.log(JSON.stringify({ decks: decks.length, decksWithRepeats: summary.filter((x) => x.groups).length, repeatedPictures: total('groups'), swapped: total('swapped'), keptOnPurpose: total('left'), stillOpen: open.length, unread: unread.length }));
for (const line of open.slice(0, 30)) console.log('REPEAT', line);
if (open.length) process.exitCode = 1;
