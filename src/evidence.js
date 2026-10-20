// 레이아웃 요소(의미 단위) · 근거 자료 풀 · 참고 추천
import { layoutHtml, P, S, C, IND, IMAGE_DB, PRODUCTS, CASES } from './data.js';
import { segPlain } from './store.js';
import { refInfo } from './data.js';
import { toks, reqText, inferIndustry } from './search.js';
import { PARTS, partText, effectiveType } from './parts.js';
import { webSourcesFor, WEB_KIND, hostOf } from './websources.js';

export const FIXED_RE = /^(CONFIDENTIAL · \d+|고객사 로고|LOGO)$/;
const NUM_RE = /^[\s[(]*[~+-]?[\d.,]+\s*[%배일분원억만천개대곳명실층년주hHkKmM°℃]*[\])]*\s*$|^\[[^\]]{1,10}\][%배일분원억만개대곳명]*$/;

/* ---------------- semantic units ---------------- */
const isBox = (el) => {
  const st = el.getAttribute('style') || '';
  return /background(-color)?:\s*(?!transparent|none)[#a-z]/i.test(st) || /border(-[a-z]+)?:\s*\d/.test(st);
};
const cnt = (el) => el.querySelectorAll('[data-tb],[data-img]').length + (el.matches('[data-tb],[data-img]') ? 1 : 0);
const fsOf = (el) => parseFloat(((el.getAttribute('style') || '').match(/font-size:\s*([\d.]+)px/) || [])[1] || '0');

/**
 * Group text blocks into meaning units (a card, a KPI tile, a table row …) and mark containers with data-unit.
 * The same HTML always yields the same keys: 't3-4-5' for text units, 'i2' for image slots.
 */
export function markUnits(root) {
  if (!root) return [];
  const owner = new Map();
  for (const el of root.querySelectorAll('[data-tb],[data-img]')) {
    if (el.hasAttribute('data-img')) { owner.set(el, el); continue; }
    let a = null;
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      if (p.hasAttribute('data-img')) { a = null; break; }
      if (isBox(p) && cnt(p) >= 2) { if (cnt(p) <= 24) a = p; break; }
    }
    if (!a) {
      a = el;
      while (a.parentElement && a.parentElement !== root && !(isBox(a.parentElement) && cnt(a.parentElement) > 24) && cnt(a.parentElement) <= 5) a = a.parentElement;
    }
    owner.set(el, a);
  }
  const groups = new Map();
  for (const [el, a] of owner) { if (!groups.has(a)) groups.set(a, []); groups.get(a).push(el); }
  const units = [];
  for (const [box, els] of groups) {
    const tbEls = els.filter((e) => e.hasAttribute('data-tb'));
    const tbs = tbEls.map((e) => Number(e.getAttribute('data-tb')));
    const isImg = !tbs.length;
    const key = isImg ? 'i' + els[0].getAttribute('data-img') : 't' + tbs.join('-');
    const texts = tbEls.map((e) => e.textContent.replace(/\s+/g, ' ').trim());
    const ft = tbs.filter((_, k) => texts[k] && !FIXED_RE.test(texts[k]));
    const imgs = isImg ? [Number(els[0].getAttribute('data-img'))] : Array.from(box.querySelectorAll('[data-img]')).map((e) => Number(e.getAttribute('data-img')));
    const fixed = !isImg && !ft.length;
    if (!fixed) box.setAttribute('data-unit', key); else box.removeAttribute('data-unit');
    units.push({ key, tbs, ft, imgs, isImg, fixed, kind: unitKind(tbEls, texts, isImg, els[0]) });
  }
  return units;
}

function unitKind(tbEls, texts, isImg, el) {
  if (isImg) return { name: '이미지', icon: 'image', hint: el.getAttribute('data-hint') || el.getAttribute('alt') || '' };
  const sizes = tbEls.map(fsOf);
  const first = texts.find((t) => t && !NUM_RE.test(t) && !FIXED_RE.test(t)) || texts[0] || '';
  if (tbEls.length === 1) {
    const t = texts[0] || '';
    if (/^출처/.test(t)) return { name: '출처', icon: 'link', hint: t };
    if (sizes[0] >= 26) return { name: '제목', icon: 'text', hint: t };
    if (NUM_RE.test(t)) return { name: '수치', icon: 'chart', hint: t };
    if (sizes[0] && sizes[0] <= 13.5 && /[A-Z]{3,}|^\d{2} · /.test(t)) return { name: '머리말', icon: 'text', hint: t };
    return { name: '문구', icon: 'text', hint: t };
  }
  const hasNum = texts.some((t, k) => NUM_RE.test(t) && sizes[k] >= 18);
  if (hasNum) return { name: '수치 카드', icon: 'chart', hint: first };
  if (/시사점|핵심|요약|결론/.test(texts[0] || '')) return { name: '시사점', icon: 'star', hint: texts[1] || first };
  return { name: tbEls.length >= 4 ? '카드' : '항목', icon: 'list', hint: first };
}

const UNIT_CACHE = new Map();
export function readUnits(f) {
  if (UNIT_CACHE.has(f)) return UNIT_CACHE.get(f);
  const html = layoutHtml(f);
  if (!html) return [];
  const host = document.createElement('div');
  host.innerHTML = html;
  const units = markUnits(host.firstElementChild).filter((u) => !u.fixed);
  UNIT_CACHE.set(f, units);
  return units;
}
export const unitByKey = (f, key) => readUnits(f).find((u) => u.key === key) || null;

/** 'empty' (example text) · 'ai' · 'rule' · 'user' */
export function unitState(x, u) {
  const t = (x.ov && x.ov.t) || {}; const im = (x.ov && x.ov.img) || {};
  const touched = u.isImg ? !!im[u.imgs[0]] : u.ft.some((i) => t[i] != null);
  const ev = x.ev && x.ev[u.key];
  if (!touched) return ev && ev.kept ? 'kept' : 'empty';
  if (ev && ev.by === 'ai' && ev.edited) return 'aiedit';
  return (ev && ev.by) || 'user';
}
export const STATE_LABEL = { empty: '예시 그대로', kept: '예시 유지 · AI 확인', ai: 'AI 작성', aiedit: 'AI 작성 · 직접 고침', rule: '자동 채움', user: '직접 입력' };
export function unfilledUnits(x) { return readUnits(x.f).filter((u) => unitState(x, u) === 'empty'); }

/* ---------------- source pool ---------------- */
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const sentences = (s) => String(s || '').split(/\n+|(?<=[.!?。])\s+/).map((x) => x.trim()).filter((x) => x.length > 3);
const label = (ref) => (refInfo(ref) || {}).short || '';
const plain = (segs) => segPlain(segs, label).replace(/@(?=[A-Za-z0-9가-힣])/g, '');
const CAT_TAG = [[/사이니지|키오스크|칠판|이페이퍼|LED|비디오월/, '사이니지'], [/에어컨|공조|히트펌프|칠러|환기/, '시스템에어컨'], [/호텔 TV|모니터|오디오/, 'TV/음향시스템'], [/갤럭시|스마트폰|워치|태그|탭/, '모바일'], [/리빙|세탁|에어드레서/, '리빙가전'], [/주방/, '주방가전'], [/PC|노트북/, '프린팅/IT']];
const caseTag = (p) => (CAT_TAG.find(([re]) => re.test(p.cat + ' ' + p.name)) || [])[1];

/** Cases that back up a product: same category tag, same industry first, linked ones first. */
export function casesForProduct(pid, pr, limit = 2) {
  const p = P[pid]; if (!p) return [];
  const tag = caseTag(p);
  const linked = new Set((pr && pr.ctx.cases) || []);
  const ind = pr && pr.ind;
  return CASES.filter((c) => (c.proof || []).length && (c.prod.includes(tag) || (c.offer || []).join(' ').includes(p.model)))
    .map((c) => ({ c, s: (linked.has(String(c.id)) ? 4 : 0) + (c.ind === ind ? 2 : 0) + ((c.offer || []).join(' ').includes(p.model) ? 3 : 0) + (c.url ? 0.5 : 0) }))
    .sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.c);
}
export function imagesForProduct(pid) {
  const p = P[pid]; if (!p) return [];
  const m = p.model.toUpperCase().replace(/-S$/, '');
  const own = IMAGE_DB.filter((im) => String(im.model || '').toUpperCase().replace(/-S$/, '') === m);
  if (own.length) return own;
  // 제품 DB 사진(samsung.com/business 상품 이미지 · e-카탈로그에서 자른 제품 사진 묶음) — 슬라이드 · PPTX 는 묶음 주소를 그대로 받는다(slide.jsx data-fill)
  const GK = { scene: ['life', '설치 장면'], diagram: ['ui', '대표 화면'] };
  return (p.gal || (p.th ? [p.th] : [])).map((a, k) => {
    const [group, groupName] = GK[(p.galKind && p.galKind[k]) || ''] || ['cut', '제품 컷'];
    const src = (p.galSrc && p.galSrc[k]) || 'samsung.com 제품 이미지';
    return { pid: a, src: a, group, groupName, model: p.model, desc: ((p.galAlt && p.galAlt[k]) || p.name) + ' · ' + src };
  });
}
/** Key messages derived from the catalog only (no invented claims). */
export function productKeyMsgs(pid, pr) {
  const p = P[pid]; if (!p) return null;
  const sols = Object.values(S).filter((s) => (s.with || []).includes(pid));
  return {
    p,
    msgs: [
      { k: '핵심 사양', t: p.spec },
      p.spaces && p.spaces.length ? { k: '어울리는 공간', t: p.spaces.slice(0, 5).join(' · ') } : null,
      sols.length ? { k: '연계 솔루션', t: sols.slice(0, 3).map((s) => s.name).join(' · ') } : null,
    ].filter(Boolean),
    sols, cases: casesForProduct(pid, pr), imgs: imagesForProduct(pid),
  };
}

/**
 * Everything this sheet can cite, numbered S1..Sn for the AI prompt.
 * Each: { sid, k, title, sub, body, url?, ftype?, ref? }
 */
export function buildPool(pr, part) {
  const out = [];
  const add = (o) => { o.sid = 'S' + (out.length + 1); o.sub = o.sub || clip(o.body, 120); out.push(o); };
  const f = pr.req.form || {};
  if (part && partText(part).trim()) add({ k: 'part', title: '파트 내용 · ' + (part.name || '이름 없는 파트'), body: partText(part).replace(/\n+/g, ' / ') });
  if (f.customer || pr.customer) add({ k: 'req', title: '고객 요구사항 · 고객 · 사업', body: [f.customer || pr.customer, f.project, f.target && '결정권자 ' + f.target].filter(Boolean).join(' · ') });
  for (const k of f.keymen || []) {
    for (const r of k.reqs || []) { const t = plain(r).trim(); if (t) add({ k: 'req', title: (k.name || '키맨') + ' 요구', body: t }); }
  }
  const free = plain(pr.req.free);
  sentences(free).slice(0, 10).forEach((s) => add({ k: 'req', title: '고객 요구사항 · 자유형식', body: s }));
  if (f.note && f.note.trim()) add({ k: 'req', title: '제작자 메모', body: f.note.trim() });
  for (const fl of pr.req.files || []) add({ k: 'file', title: fl.name, ftype: String(fl.type || fl.name.split('.').pop() || '').toLowerCase(), ref: fl.id, body: [fl.memo, fl.text].filter(Boolean).join(' — ').slice(0, 900) || '(내용 미추출)' });
  for (const id of pr.ctx.products || []) { const p = P[id]; if (p) add({ k: 'product', title: p.name, ref: id, body: `${p.model} · ${p.cat} · ${p.spec} · 공간: ${(p.spaces || []).join(', ')}` }); }
  for (const id of pr.ctx.solutions || []) { const s = S[id]; if (s) add({ k: 'solution', title: s.name, ref: id, body: `${s.cat} — ${s.desc}` }); }
  for (const id of pr.ctx.cases || []) {
    const c = C[id]; if (!c) continue;
    add({ k: 'case', title: c.cust, ref: String(c.id), url: c.url, body: `${c.sub || c.title}. 성과: ${(c.proof || []).join('; ')}${c.quote ? ' · "' + c.quote + '"' : ''}`, sub: clip((c.proof || [])[0] || c.sub || c.title, 120) });
  }
  return out;
}

export function toEvidence(src, by = 'user') {
  const e = { k: src.k, title: src.title, sub: src.sub || clip(src.body, 120), by };
  if (src.url) e.url = src.url;
  if (src.ftype) e.ftype = src.ftype;
  if (src.ref) e.ref = src.ref;
  if (src.kind) e.kind = src.kind;
  return e;
}
export const evKey = (e) => e.k + ':' + (e.ref || e.url || e.title) + ':' + (e.k === 'req' || e.k === 'part' ? e.sub : '');

/** Sources whose names literally appear in the text (model, customer, case, solution) + strong token overlap. */
export function attribute(text, pool, max = 3) {
  const t = String(text || '');
  const low = t.toLowerCase();
  const hits = [];
  for (const s of pool) {
    if (s.k === 'product' && P[s.ref] && (low.includes(P[s.ref].model.toLowerCase().replace(/-s$/, '')) || t.includes(P[s.ref].name))) hits.push(s);
    else if (s.k === 'solution' && S[s.ref] && low.includes(S[s.ref].name.toLowerCase())) hits.push(s);
    else if (s.k === 'case' && C[s.ref] && C[s.ref].cust.length >= 2 && t.includes(C[s.ref].cust)) hits.push(s);
  }
  const tt = new Set(toks(t));
  if (tt.size >= 3) {
    const scored = pool.filter((s) => !hits.includes(s) && s.k !== 'product').map((s) => {
      const bt = new Set(toks(s.body)); let n = 0; for (const x of tt) if (bt.has(x)) n++;
      return { s, r: n / tt.size, n };
    }).filter((x) => x.n >= 3 && x.r >= 0.35).sort((a, b) => b.r - a.r);
    for (const x of scored.slice(0, 2)) hits.push(x.s);
  }
  return hits.slice(0, max);
}

/** Pool sources ranked for one unit's text. */
export function suggestForUnit(text, pool, kindName, limit = 5) {
  const tt = toks(text); const set = new Set(tt);
  const isNum = /수치/.test(kindName);
  return pool.map((s) => {
    const bt = new Set(toks(s.title + ' ' + s.body)); let n = 0; for (const x of set) if (bt.has(x)) n++;
    let sc = set.size ? n / Math.sqrt(set.size) : 0;
    if (isNum && s.k === 'case' && /\d/.test(s.body)) sc += 0.8;
    if (isNum && s.k === 'file') sc += 0.6;
    if (s.k === 'part') sc += 0.3;
    return { s, sc };
  }).filter((x) => x.sc > 0.35).sort((a, b) => b.sc - a.sc).slice(0, limit).map((x) => x.s);
}

/* ---------------- sheet recommendations (nothing selected) ---------------- */
const WEB_FIRST = ['market', 'competition', 'insight', 'customer', 'user', 'effect', 'cost'];
const PROD_FIRST = ['products', 'spec', 'bom', 'dss', 'scenario', 'birdseye', 'value', 'overview'];
const CASE_FIRST = ['case', 'why'];

export function sheetRecs(pr, part, l) {
  const t = l.p || effectiveType(part);
  const ind = pr.ind || inferIndustry(reqText(pr));
  const order = WEB_FIRST.includes(t) ? ['web', 'files', 'cases', 'products']
    : PROD_FIRST.includes(t) ? ['products', 'files', 'cases', 'web']
    : CASE_FIRST.includes(t) ? ['cases', 'products', 'files', 'web']
    : t === 'solution' ? ['solutions', 'products', 'cases', 'files']
    : ['files', 'products', 'cases', 'web'];
  // products: linked ones; layouts with fixed product count get that many first
  const prodIds = (pr.ctx.products || []).filter((id) => P[id]);
  const products = prodIds.slice(0, Math.max(3, l.pc || 0)).map((id) => productKeyMsgs(id, pr)).filter(Boolean);
  const web = webSourcesFor(ind, t, WEB_FIRST.includes(t) ? 7 : 4);
  const linkedCases = (pr.ctx.cases || []).map((id) => C[id]).filter(Boolean);
  const more = CASES.filter((c) => c.ind === ind && !linkedCases.includes(c) && (c.proof || []).length).slice(0, Math.max(0, 4 - linkedCases.length));
  const cases = [...linkedCases.map((c) => ({ c, linked: true })), ...more.map((c) => ({ c, linked: false }))].slice(0, 5);
  const files = pr.req.files || [];
  const f = pr.req.form || {};
  const reqs = (f.keymen || []).flatMap((k) => (k.reqs || []).map((r) => ({ who: k.name || '키맨', t: plain(r).trim() }))).filter((x) => x.t).slice(0, 6);
  const solutions = (pr.ctx.solutions || []).map((id) => S[id]).filter(Boolean);
  if (!solutions.length && order[0] === 'solutions') order.shift();
  return { t, ind, indName: ind && IND[ind] ? IND[ind].name : '', order, products, web, cases, files, reqs, solutions, needs: l.req || [], phs: l.phs || [] };
}

export { WEB_KIND, hostOf, PARTS };

/* ---------------- products inside a unit (shown as evidence, swappable) ---------------- */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normModel = (m) => String(m || '').toUpperCase().replace(/-S$/, '').replace(/\s+/g, ' ').trim();
const nameStem = (p) => p.name.replace(new RegExp('\\s*' + esc(p.model) + '\\s*', 'i'), ' ').replace(/\s+/g, ' ').trim();
const KEYS = PRODUCTS.map((p) => {
  // 제품 DB 항목은 모델코드로만(이름은 '세탁기 9kg' 같은 일반어가 많음)
  const keys = (p.cur ? [...new Set([p.name, p.model, p.model.replace(/-S$/, '')])] : [...new Set([p.model, ...(p.models || [])])]).filter((k) => k && k.length >= (p.cur ? 3 : 5)).sort((a, b) => b.length - a.length);
  if (!keys.length) return { p, keys, re: /(?!)/ };
  return { p, keys, re: new RegExp('(^|[^A-Za-z0-9])(' + keys.map(esc).join('|') + ')(?![A-Za-z0-9])', 'i') };
});
/** Catalog products mentioned in a text, in order of first appearance. */
export function productsInText(text) {
  const t = String(text || '');
  return KEYS.map(({ p, re }) => { const m = re.exec(t); return m ? { id: p.id, at: m.index } : null; }).filter(Boolean).sort((a, b) => a.at - b.at).map((x) => x.id);
}
const productOfImage = (src, pid) => {
  const im = IMAGE_DB.find((z) => (src && z.src === src) || (pid && z.pid === pid));
  if (!im || !im.model) return null;
  const p = PRODUCTS.find((q) => normModel(q.model) === normModel(im.model));
  return p ? p.id : null;
};
/**
 * Products a unit shows: models / names in its text + product photos in its image slots.
 * texts: [{ i, s }] current text of the unit's blocks · imgs: [{ i, src, pid }] current image (or the layout's own pid)
 */
export function unitProducts(texts, imgs) {
  const ids = productsInText(texts.map((b) => b.s).join(' \n '));
  for (const im of imgs) { const id = productOfImage(im.src, im.pid); if (id && !ids.includes(id)) ids.push(id); }
  return ids;
}

/** Text replacements that turn product `from` into `to` inside one block. Returns the new text or null. */
function swapInText(s, from, to) {
  const a = P[from]; const b = P[to];
  if (!a || !b || !s) return null;
  const trim = s.trim();
  const stemA = nameStem(a); const stemB = nameStem(b) || b.cat;
  // a label that is just the old product's kind ("스마트 사이니지", "LCD 사이니지")
  if (trim === stemA && stemA) return s.replace(stemA, stemB);
  if (trim === a.cat) return s.replace(a.cat, b.cat);
  // a spec line: shares 2+ spec items with the old product
  const parts = a.spec.split(' · ').map((x) => x.toLowerCase().replace(/[\s"”]/g, ''));
  const low = s.toLowerCase().replace(/[\s"”]/g, '');
  if (parts.filter((x) => x.length >= 2 && low.includes(x)).length >= 2 && !KEYS.find((k) => k.p.id === from).re.test(s)) {
    const room = Math.max(14, Math.round(trim.length * 1.4));
    let out = '';
    for (const x of b.spec.split(' · ')) { const n = out ? out + ' · ' + x : x; if (n.length > room) break; out = n; }
    return out || b.spec;
  }
  // "Smart Signage QM55C" → "<new kind> <new model>"
  const k = KEYS.find((z) => z.p.id === from);
  const latin = new RegExp('^[A-Za-z][A-Za-z .&-]*\\s(' + k.keys.map(esc).join('|') + ')$', 'i');
  if (latin.test(trim) && stemA !== stemB) return s.replace(trim, (stemB ? stemB + ' ' : '') + b.model); // different kind of product → its own name; same kind keeps the English title
  // names first, then models
  let out = s;
  const fullA = new RegExp(esc(a.name), 'gi');
  out = out.replace(fullA, b.name);
  out = out.replace(new RegExp('(^|[^A-Za-z0-9])(' + [a.model, a.model.replace(/-S$/, '')].filter((x, i, arr) => x.length >= 3 && arr.indexOf(x) === i).map(esc).join('|') + ')(?![A-Za-z0-9])', 'gi'), (m, pre) => pre + b.model);
  return out !== s ? out : null;
}

/**
 * What changes when a unit's product is swapped.
 * blocks: [{ i, s, raw }] (raw = stored override, string or {html}) · imgs: [{ i, src, pid, kind }]
 * → { t: { i: newValue }, img: [{ i, im }], missingImg }
 */
export function planProductSwap(blocks, imgs, from, to) {
  const t = {};
  for (const b of blocks) {
    if (b.raw && typeof b.raw === 'object' && b.raw.html != null) {
      const html = swapInText(b.raw.html, from, to);
      if (html != null && html !== b.raw.html) t[b.i] = { html };
      continue;
    }
    const n = swapInText(b.s, from, to);
    if (n != null && n !== b.s) t[b.i] = n;
  }
  const pics = imagesForProduct(to);
  const img = []; let missingImg = false;
  for (const im of imgs) {
    if (productOfImage(im.src, im.pid) !== from) continue;
    const cur = IMAGE_DB.find((z) => z.src === im.src || z.pid === im.pid);
    const pick = pics.find((z) => cur && z.group === cur.group) || pics.find((z) => z.group === 'cut') || pics[0];
    if (pick) img.push({ i: im.i, im: pick }); else missingImg = true;
  }
  return { t, img, missingImg };
}
export const productEv = (id, by = 'user') => { const p = P[id]; return p ? { k: 'product', ref: id, title: p.name, sub: p.model + ' · ' + p.cat + ' · ' + p.spec, by } : null; };
