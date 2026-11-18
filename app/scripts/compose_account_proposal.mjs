// 계정 제안서를 목차 템플릿으로 조립 — 앱의 목차 템플릿 조립기(toc_templates.js ensureTocScenario)를 그대로 돌려
// 템플릿의 목차 · 장을 만들고, 고객 내용(과제 · 여정 · 핵심 기술 · 현황 지표)과 추가 장(extras)을 해당 목차 아래에 넣는다.
//   node app/scripts/compose_account_proposal.mjs app/data/account_proposals/<name>.json   → stdout JSON { scenario, fills, story, customer }
// rebuild_account_scenarios.py가 불러 account_scenarios.json에 넣는다. 구독 샘플(build/subs/compose.mjs)과 같은 방식.
// 추가 장을 넣은 뒤에는 간지의 '이 장에서 다루는 것'(항목 · 쪽) · 쪽 번호 · 눈썹의 장 번호를 다시 맞춘다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = path.join(ROOT, 'app/web/src/domain/templates');
const read = (p) => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8'));
const spec = read(process.argv[2]);
const toc = await import(path.join(T, 'toc_templates.js'));
const { SC } = await import(path.join(T, 'scenarios.js'));
const { FILLS, FILL_CUSTOMER } = await import(path.join(T, 'scenario_fills.js'));
const { STORY } = await import(path.join(T, 'scenario_story.js'));
const { TOC_SLOTS, TOC_HTML } = await import(path.join(T, 'toc_layouts.js'));
const { VSTD_HTML } = await import(path.join(T, 'vertical_std_layouts.js'));
const HTMLS = { ...VSTD_HTML, ...TOC_HTML };
const content = read('app/web/src/domain/templates/toc_content.json');
toc.useTocContent(content);
const PHOTOS = Object.fromEntries(read('app/web/src/domain/templates/account_photo_assets.json').map((p) => [p.id, p]));
const EVIDENCE = read('app/data/account_case_sources.json');
const BRIEF = read('app/data/account_case_briefs.json')[spec.key];
const errors = [];

const pad = (n) => String(n).padStart(2, '0');
/** "photo:<id>" → the account's official photograph · anything else is an address */
const picture = (ref, name) => {
  if (!String(ref).startsWith('photo:')) return { src: ref, fit: 'cover', keep: true, ...(name ? { name } : {}) };
  const p = PHOTOS[String(ref).slice(6)]; if (!p) { errors.push('없는 사진 ' + ref); return { src: '', fit: 'cover', keep: true }; }
  return { src: p.src, name: p.desc + ' · ' + p.owner, fit: 'cover', keep: true, source: p.page || '', kind: 's' };
};
const src = (ref) => picture(ref).src;
// what a library photograph shows — 도입사례 갤러리(media.json) · 업종 참고사진(images.json)
const MEDIA = read('app/data/media.json'); const CASES = Object.fromEntries(read('app/data/catalog.json').cases.map((c) => [String(c.id), c]));
const DESC = new Map();
for (const [cid, item] of Object.entries(MEDIA.case)) for (const r of item.g || []) DESC.set(MEDIA.P[Math.floor(r[0] / 10000)] + '#' + (r[0] % 10000), r[2] + ' · ' + ((CASES[cid] || {}).cust || '삼성전자 등록 자료'));
for (const im of Object.values(read('app/data/images.json').pids)) if (im.file && im.desc) DESC.set(im.file, im.desc + ' · 삼성전자 공식 참고사진');
/** a photograph with its description as the name (alt text · image audit) */
const shot = (ref) => { const p = picture(ref); return p.name || !DESC.has(p.src) ? p : { ...p, name: DESC.get(p.src) }; };

/* ---------- 1. the template, with this account's content in the vertical's place ---------- */
const TPL = toc.TPL[spec.template]; const base = content.v[spec.vertical];
if (!TPL || !base) throw new Error(`템플릿 · 업종 없음: ${spec.template} / ${spec.vertical}`);
const vid = 'acct_' + spec.key; const stdId = 'bs_std_' + spec.vertical; const myStd = 'bs_std_' + vid; const stdCustomer = FILL_CUSTOMER[stdId];
const V = structuredClone(base);
V.pains = spec.pains.map(([t, l, ph]) => [t, l, src(ph)]);
V.tech = base.tech.filter((x) => spec.tech.includes(x.s));
V.jr = spec.journeys.map((j) => ({ ...structuredClone(base.jr[j.from]), ...(j.t ? { t: j.t } : {}), ...(j.scenes ? { scenes: j.scenes } : {}) }));
V.cover = src(spec.uaPhoto); // 당사의 이해 간지 · 현황 지표의 사진
if (V.tech.length !== spec.tech.length) errors.push('핵심 기술 id가 업종 콘텐츠에 없음: ' + spec.tech.join(', '));
content.v[vid] = V;
SC[myStd] = { ...structuredClone(SC[stdId]), id: myStd }; FILLS[myStd] = structuredClone(FILLS[stdId]); FILL_CUSTOMER[myStd] = spec.customer; STORY[myStd] = structuredClone(STORY[stdId] || {});
const ua0 = TPL.ua; TPL.ua = spec.ua || ua0;
const s0 = toc.ensureTocScenario(spec.template, vid);
TPL.ua = ua0;
if (!s0) throw new Error('조립 실패');
const fills0 = FILLS[s0.id]; const story0 = STORY[s0.id];
const total = TPL.tocs.length;
const deckLabel = `${toc.stdDeck(vid).ai} ${TPL.deck}서`; const foot = `${spec.customer} · ${deckLabel}`;

/* ---------- 2. stages: [cover, index] + one per 목차 = [divider, sheets …] ---------- */
let k = 0;
const groups = s0.flow.map((g) => ({ g, items: g.slides.map((x) => ({ o: structuredClone(fills0[k++]), role: x.role })) }));
const [open, ...parts] = groups;
const isDiv = (f) => /^L_VS_DIV_R\d$/.test(f);
// row labels of the template's own sheets — read back from the divider the assembler made ('이 장에서 다루는 것')
let page = open.items.length + 1;
for (const [i, st] of parts.entries()) {
  st.key = TPL.tocs[i]; st.no = i + 1; st.name = toc.tocName(st.key, toc.stdDeck(vid).short); st.std = !!(toc.TOCS[st.key].std);
  const div = st.items[0]; st.oldPage = page;
  if (!isDiv(div.o.f)) throw new Error(`${st.g.name}: 첫 장이 간지가 아님 (${div.o.f})`);
  const n = +div.o.f.slice(-1); const rows = [];
  for (let r = 0; r < n; r++) { const [a, b] = String(div.o.t[7 + 3 * r]).split('–').map(Number); rows.push({ label: div.o.t[6 + 3 * r], from: a, to: b || a }); }
  st.items.slice(1).forEach((x, j) => { const pg = page + 1 + j; const row = rows.find((r) => pg >= r.from && pg <= r.to); x.row = row ? row.label : x.role; });
  st.rows0 = rows; page += st.items.length;
}

/* ---------- 3. this account's values on the template's sheets ---------- */
const named = (o, name, v) => { const i = (TOC_SLOTS[o.f] || { t: {} }).t[name]; if (i == null) errors.push(`${o.f}: 칸 '${name}' 없음`); else o.t[i] = v; };
for (const st of parts) for (const x of st.items) {
  if (x.o.f === 'L_TOC_UAPROF' && spec.prof) {
    named(x.o, 'title', spec.prof.title);
    spec.prof.items.forEach(([lb, vl, un, ic], i) => {
      named(x.o, 'lb' + i, lb); named(x.o, 'vl' + i, vl); named(x.o, 'un' + i, un);
      if (ic) x.o.img[TOC_SLOTS[x.o.f].img['ic' + i]] = { src: `/assets/toc/icons/ui-${ic}.png`, fit: 'contain', keep: true };
    });
    if (spec.prof.photo) x.o.img[TOC_SLOTS[x.o.f].img.ph] = picture(spec.prof.photo);
  }
}
// 표지 — 템플릿이 만든 표지(업종 표준 제안서 표지)에 제목 · 한 줄 · 고객의 공식 사진
const cover = open.items[0].o;
if (cover.f !== 'L_C01') errors.push('표지 레이아웃이 L_C01이 아님: ' + cover.f);
cover.t = { 1: 'SAMSUNG', 2: 'BUSINESS PROPOSAL', 3: spec.cover.title, 4: spec.cover.sub, 5: spec.customer, 6: spec.cover.date || cover.t[6], 7: 'CONFIDENTIAL' }; // 고객 제안서의 표지 칸 순서(rebuild_vertical_best.py와 같음)
cover.img = { ...cover.img, 0: picture(spec.cover.photo) };

/* ---------- 4. the added sheets, under their 목차 ---------- */
for (const e of spec.extras || []) {
  const st = parts.find((x) => x.key === e.part);
  if (!st) { errors.push('추가 장의 목차가 이 템플릿에 없음: ' + e.part); continue; }
  const o = { f: e.f, t: { ...e.t }, img: structuredClone(e.img || {}) };
  o.t[0] = `${pad(st.no)} · ${st.name}${e.eb ? ' · ' + e.eb : ''}`;
  const at = e.after === 'end' ? st.items.length : st.items.findIndex((x) => x.o.f === e.after) + 1;
  if (at <= 0) { errors.push(`${e.f}: '${e.after}' 다음 자리를 찾을 수 없음`); continue; }
  st.items.splice(at, 0, { o, role: e.role, row: e.row || e.role, extra: true });
}
// 서로 다른 사진 — 템플릿은 업종 공간 사진 다섯 장을 목차 장 · 간지 · 트렌드 · 포지셔닝 · 여정에 돌려 쓴다. 여기서는 자리마다 다른 사진을 준다.
const PH = spec.photos || {};
for (const st of parts) {
  if (PH.dividers && PH.dividers[st.key]) st.items[0].o.img = { ...st.items[0].o.img, 0: { ...shot(PH.dividers[st.key]), name: st.name + ' 간지 사진' } };
  const seen = {};
  for (const x of st.items) {
    const list = PH[x.o.f]; const S = TOC_SLOTS[x.o.f];
    if (list && S && !seen[x.o.f]) { seen[x.o.f] = true; list.forEach((ref, i) => { if (S.img['ph' + i] != null) x.o.img[S.img['ph' + i]] = shot(ref); else errors.push(`${x.o.f}: 사진 칸 ph${i} 없음`); }); }
    for (const [i, im] of Object.entries(x.o.img || {})) if (im && im.src && !im.name && DESC.has(im.src)) x.o.img[i] = { ...im, name: DESC.get(im.src) };
  }
}
const index = open.items[1] && open.items[1].o;
if (index && PH.index) PH.index.forEach((ref, i) => { index.img[TOC_SLOTS[index.f].img['img' + i]] = shot(ref); });
// 마무리 장(있으면)의 사진 — 고객의 공식 사진
if (spec.closingPhoto) { const end = parts.at(-1).items.find((x) => x.o.f === 'L_VS_END'); if (end) end.o.img = { ...end.o.img, 0: picture(spec.closingPhoto) }; }

/* ---------- 5. pages · dividers · footers again ---------- */
page = open.items.length + 1;
for (const st of parts) {
  const div = st.items[0]; const divPage = page;
  if (st.std) { // a standard 목차 keeps its divider — only the pages move
    const n = +div.o.f.slice(-1); const off = divPage - st.oldPage;
    for (let r = 0; r < n; r++) { const key = 7 + 3 * r; if (/^\d+(–\d+)?$/.test(String(div.o.t[key]))) div.o.t[key] = String(div.o.t[key]).split('–').map((p) => String(+p + off)).join('–'); }
  } else {
    const rows = [];
    st.items.slice(1).forEach((x, j) => { const pg = divPage + 1 + j; const last = rows.at(-1); if (last && last.label === x.row) last.to = pg; else rows.push({ label: x.row, from: pg, to: pg }); });
    while (rows.length > 6) { const b = rows.pop(); rows.at(-1).to = b.to; }
    const n = rows.length; const t = { 0: div.o.t[0], 1: `${pad(st.no)} / ${pad(total)}`, 2: div.o.t[2], 3: div.o.t[3], 4: div.o.t[4] };
    rows.forEach((r, i) => { t[5 + 3 * i] = pad(i + 1); t[6 + 3 * i] = r.label; t[7 + 3 * i] = r.from === r.to ? String(r.from) : `${r.from}–${r.to}`; });
    t[5 + 3 * n] = 'CONFIDENTIAL · ' + divPage;
    div.o = { f: 'L_VS_DIV_R' + n, t, img: div.o.img }; div.role = '간지 · ' + pad(st.no) + ' ' + st.name;
  }
  page += st.items.length;
}
let pg = 0;
for (const st of [open, ...parts]) for (const x of st.items) {
  pg += 1;
  // 고객사 로고 자리 → 고객 이름 · 업종 표준 장의 문구 바꾸기
  for (const [i, v] of Object.entries(x.o.t)) {
    if (typeof v !== 'string') continue;
    let w = v === '고객사 로고' && spec.logoText ? spec.logoText : v;
    for (const [a, b] of spec.replace || []) w = w.split(a).join(b);
    x.o.t[i] = w;
  }
  for (const im of Object.values(x.o.img || {})) if (im && im.name) for (const [a, b] of spec.replace || []) im.name = im.name.split(a).join(b);
  for (const [i, v] of Object.entries(x.o.t)) if (typeof v === 'string' && /^CONFIDENTIAL · \d+$/.test(v)) x.o.t[i] = 'CONFIDENTIAL · ' + pg;
  if (TOC_SLOTS[x.o.f]) { const S = TOC_SLOTS[x.o.f].t; if (S.foot != null) x.o.t[S.foot] = foot; }
}

/* ---------- 6. every slot of every sheet has a value (the layout's own text · picture where the template leaves it) ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const plain = (h) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, x) => ENT[x]);
function complete(o, where) {
  const html = HTMLS[o.f]; if (!html) return o;
  const t = {}, img = {};
  for (const m of html.matchAll(/<(\w+)\b([^>]*\bdata-tb="(\d+)"[^>]*)>([\s\S]*?)<\/\1>/g)) if (!/data-img=/.test(m[2])) t[m[3]] = plain(m[4]);
  for (const m of html.matchAll(/<div\b([^>]*\bdata-img="(\d+)"[^>]*)>\s*<img\b([^>]*)>/g)) {
    const a = m[3], fill = /\bdata-fill="([^"]+)"/.exec(a)?.[1], s = /\bsrc="([^"]+)"/.exec(a)?.[1], kind = /\bdata-kind="([^"]+)"/.exec(m[1])?.[1];
    img[m[2]] = { src: fill || (s && !s.startsWith('data:') ? s : ''), fit: kind === 'cut' || kind === 'icon' ? 'contain' : 'cover', keep: true };
  }
  const out = { ...o, t: { ...o.t }, img: { ...o.img } };
  for (const [i, v] of Object.entries(t)) { const x = o.t?.[i]; if (x == null || !String(typeof x === 'object' ? x.html : x).trim()) out.t[i] = v; }
  for (const [i, v] of Object.entries(img)) { const x = o.img?.[i]; if (!x || !x.src) out.img[i] = v; if (!out.img[i].src) errors.push(`${where} ${o.f}: 사진 칸 ${i} 비어 있음`); }
  // the layout's own '고객사 로고' box (a slot the template leaves alone) carries the customer's name too
  if (spec.logoText) for (const [i, v] of Object.entries(out.t)) if (v === '고객사 로고') out.t[i] = spec.logoText;
  return out;
}

/* ---------- 7. scenario · story ---------- */
// 표준 제안서 샘플처럼 표지 묶음에는 표지 한 장만 — 목차 장은 첫 목차 묶음 앞으로('목차 · 01 …')
const flow = [{ key: 'open', name: '표지', goal: '제안 전체를 먼저 보여 준다', slides: [{ f: cover.f, role: '표지 · ' + spec.title }] }];
const fills = [complete(cover, 'p1')]; const storyParts = {};
parts.forEach((st, i) => {
  const items = i === 0 ? [...open.items.slice(1).map((x) => ({ ...x, role: `${total}개 장(章) 목차 · 사진 카드` })), ...st.items] : st.items;
  const name = (i === 0 ? '목차 · ' : '') + st.g.name;
  flow.push({ key: st.g.key, name, goal: (i === 0 ? `${total}개 장의 흐름 · ` : '') + st.g.goal, slides: items.map((x) => ({ f: x.o.f, role: x.role })) });
  items.forEach((x) => fills.push(complete(x.o, 'p' + (fills.length + 1))));
  storyParts[name] = { type: (story0.parts[st.g.name] || {}).type || toc.TOCS[st.key].type, items: items.filter((x) => !isDiv(x.o.f)).map((x) => x.role).slice(0, 8) };
});
const m = spec.meta;
const who = [m.audience.lead, ...m.audience.others].slice(0, 3);
const weights = who.length === 3 ? [40, 35, 25] : who.length === 2 ? [60, 40] : [100];
const story = { keymen: who.map((name, i) => [name, weights[i], [m.criteria[i % m.criteria.length]]]), note: m.situation, parts: storyParts };
const scenario = {
  id: spec.id, req: m.req, ind: SC[stdId].ind, strategy: m.strategy, ending: m.ending, minutes: Math.max(20, Math.round((fills.length * 1.5) / 5) * 5),
  title: spec.title, short: m.short, situation: m.situation, signals: m.signals, audience: m.audience, criteria: m.criteria, thesis: m.thesis,
  logic: m.logic, diff: m.diff, tone: m.tone, messages: m.messages, flow, ask: m.ask, next: m.next, prep: m.prep,
  products: spec.products, solutions: spec.solutions, cases: spec.cases, kpis: m.kpis, objections: m.objections, fit: m.fit, avoid: m.avoid,
  sourceSpec: 'account_' + spec.key, sourceMode: 'toc-template', template: spec.template, templateVertical: spec.vertical,
  authoringRevision: 'toc-' + spec.template + '-account-v1', coverRevision: 'single-photo-cover-v1',
  research: { verifiedAt: EVIDENCE.verifiedAt, sources: BRIEF.sources, facts: EVIDENCE.accounts[spec.key].facts, unverified: EVIDENCE.accounts[spec.key].unverified, documents: EVIDENCE.sources.filter((x) => BRIEF.sources.includes(x.id)) },
};

/* ---------- 8. checks ---------- */
const text = JSON.stringify(fills);
if (/\[0+\]|\[N\]|\[확인 필요\]/.test(text)) errors.push('자리표시가 남아 있음: ' + [...new Set(text.match(/\[0+\][^"]{0,12}|\[N\]|\[확인 필요\]/g))].slice(0, 6).join(' / '));
if (stdCustomer && text.includes(stdCustomer)) errors.push(`업종 표준 제안서의 예시 고객명이 남아 있음: ${stdCustomer}`);
if (fills.length !== flow.reduce((n, g) => n + g.slides.length, 0)) errors.push('장 수와 채움 수가 다름');
fills.forEach((o, i) => { if (o.f !== flow.flatMap((g) => g.slides)[i].f) errors.push(`p${i + 1}: 장과 채움의 레이아웃이 다름`); });
for (const e of errors) console.error('! ' + e);
if (errors.length && !process.env.COMPOSE_SOFT) process.exit(1);
process.stdout.write(JSON.stringify({ scenario, fills, story, customer: spec.customer }));
