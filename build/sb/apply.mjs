// Best Scenario → Storyboard 재구성 적용 — node /home/claude/tools/run.mjs build/sb/apply.mjs [--dry]
// 입력: build/sb/plan.mjs(파트 계획) · src/scenarios.js · src/scenario_fills.js · src/scenario_bg.json · build/sb/heads.json(장 머리말 칸)
// 출력: src/scenarios.js(flow) · src/scenario_fills.js(FILLS) · src/scenario_bg.json(map) · src/scenario_story.js(STORY) · img/fill/r10-sb.json(새 사진 묶음)
import fs from 'node:fs';
import path from 'node:path';
import { PLAN } from './plan.mjs';
import { SCENARIOS, slidesOfScenario } from '../../src/scenarios.js';
import { L, isCoverSheet } from '../../src/data.js';

const ROOT = '/home/claude/bs';
const DRY = process.argv.includes('--dry');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILLS_SRC = rd('src/scenario_fills.js');
const FM = /export const FILLS = (\{.*\});\n/.exec(FILLS_SRC);
const FILLS = JSON.parse(FM[1]);
const CUST = JSON.parse(/export const FILL_CUSTOMER = (\{.*?\});/.exec(FILLS_SRC)[1]);
const HEADS = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/sb/heads0.json'), 'utf8'));
const BG = JSON.parse(rd('src/scenario_bg.json'));
const C13PH = JSON.parse(rd('build/sb/c13photos.json')); // C13 장에 그려졌던 사진(레이아웃 기본 사진 포함)
const clone = (x) => JSON.parse(JSON.stringify(x));
const SC = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

// ---------- new photos → one pack (img/fill/r10-sb.json) ----------
const NEWDIR = path.join(ROOT, 'build/bs/newimg');
const newImgs = fs.existsSync(NEWDIR) ? fs.readdirSync(NEWDIR).filter((f) => /^sb-.*\.jpg$/.test(f)).sort() : [];
const PACK = 'img/fill/r10-sb.json';
const packAddr = Object.fromEntries(newImgs.map((f, i) => ['img/bsn/' + f, PACK + '#' + i]));
const packMeta = newImgs.map((f, i) => ({ addr: PACK + '#' + i, ...JSON.parse(fs.readFileSync(path.join(NEWDIR, f.replace(/\.jpg$/, '.json')), 'utf8')) }));

// ---------- templates from bs21 (표준 제안서) ----------
const T21 = Object.fromEntries(FILLS.bs21.map((x) => [x.f, x]));
const KIND = { TOC: 'L_C10', ES: 'L_PH_ES_A', WHY4P: 'L_AIS_32', WHYPROC: 'L_PH_AIS_35', WHYBRAND: 'L_AIS_36', CLOSE: 'L_AIS_37' };
const EB = (n, s) => String(n).padStart(2, '0') + ' · ' + s;

// per-scenario overrides for new slides
const OVR = {
  bs02: {
    ES: {
      t: { 0: '01 · 제안 요약', 1: '준공 날부터 움직이는 AI Ready 오피스', 2: '한 장으로 보는 이번 제안 — 과제 → 제안 → 효과 → 왜 삼성',
        5: '이번 분기', 6: '설계 도면 확정 시점', 7: '준공 후 넣으면 배관 · 배선 재공사', 8: '에너지 20% 절감 실측 증빙 요구',
        11: 'The Wall · Flip Pro · DVM S2', 12: 'b.IoT · SmartThings Pro 관제', 13: '여섯 공간 · 건물 311대',
        16: '−20%', 17: '건물 에너지 사용량(실측 목표)', 18: '연 331톤', 19: '탄소 감축', 20: '28개월', 21: '설계 반영 → 관제 개시',
        24: '공조 · 화면 · 관제 한 공급사', 25: '빌딩 관제 b.IoT 도입 사례', 26: '설계부터 준공 후 운영까지',
        28: '느끼기 전에 건물이 먼저 움직입니다', 29: '다음 단계 · 설계 반영 범위 워크숍' },
      img: { 0: { src: 'img/fill/office.json#19', name: '대형 사이니지가 설치된 회의실', keep: true, pos: '60% 45%' } },
    },
  },
  bs06: { WHYPROC: { img: { 1: { src: 'img/fill/office.json#7', name: '설치 — 천장 실내기를 점검하는 엔지니어', keep: true, pos: '50% 40%' } } } },
  bs15: { CLOSE: { img: { 0: { src: 'img/bsn/sb-bs15-staff-aisle.jpg', name: '슈퍼마켓 진열 통로에서 휴대폰으로 매장 업무를 보는 직원 (Colruyt · 벨기에)', keep: true, fit: 'cover', pos: '50% 40%' } } } },
  bs16: { CLOSE: { img: { 0: { src: 'img/bsn/sb-bs16-bakery-cafe.jpg', name: '베이커리 카페 매장 좌석과 천장 360 카세트 (노아스 로스팅 용인)', keep: true, fit: 'cover', pos: '50% 50%' } } } },
  bs20: { CLOSE: { img: { 0: { src: 'img/bsn/sb-bs20-landmark-led.jpg', name: '도심 백화점 외벽을 감싼 초대형 곡면 LED 미디어 파사드 (신세계백화점 본점)', keep: true, fit: 'cover', pos: '50% 30%' } } } },
};

function photoOf(fill) { // first real photo of a slide fill (not product cut / UI capture)
  for (const v of Object.values((fill && fill.img) || {})) {
    const s = v && v.src; if (!s) continue;
    if (/\.png$/.test(s) || /\/ui-|ui\.json|cut\.json|p-[a-z0-9-]+\.png/.test(s)) continue;
    return v;
  }
  return null;
}

function newFill(kind, sid, ctx) {
  const P = PLAN[sid]; const cust = CUST[sid]; const name = P.name;
  const o = (OVR[sid] && OVR[sid][kind]) || {};
  let x;
  if (kind === 'WHY4P') { x = clone(T21.L_AIS_32); x.t[0] = EB(ctx.ch, 'WHY SAMSUNG'); x.t[15] = cust; x.t[16] = name + ' · 사진: 삼성전자 뉴스룸'; }
  else if (kind === 'WHYPROC') { x = clone(T21.L_PH_AIS_35); x.t[0] = EB(ctx.ch, 'WHY SAMSUNG'); x.t[35] = cust; x.t[36] = name + ' · 사진: samsung.com'; }
  else if (kind === 'WHYBRAND') { x = clone(T21.L_AIS_36); x.t[0] = EB(ctx.ch, 'WHY SAMSUNG'); x.t[48] = cust; x.t[49] = name; }
  else if (kind === 'CLOSE') {
    x = clone(T21.L_AIS_37); x.t = { 0: cust, 1: 'SAMSUNG', 2: name, 3: '삼성전자 한국총괄 B2B 영업팀' };
    const ph = ctx.closePhoto;
    if (ph) x.img = { 0: { src: ph.src, name: ph.name || '마무리 사진', keep: true, fit: 'cover', ...(ph.pos ? { pos: ph.pos } : {}) } };
  } else if (kind === 'ES') { x = { t: {}, img: {}, f: 'L_PH_ES_A' }; x.t[30] = cust; x.t[31] = name + ' · 사진: samsung.com 도입사례'; }
  else if (kind === 'TOC') x = { t: {}, img: {}, f: 'L_C10' }; // filled after the deck is laid out
  else throw new Error('kind ' + kind);
  if (o.t) Object.assign(x.t, o.t);
  if (o.img) x.img = { ...x.img, ...o.img };
  x.f = KIND[kind];
  return x;
}

// TOC: 6 cards = the parts after 표지, in order
function fillToc(sid, deck, parts, tocFill, P) {
  const cust = CUST[sid];
  const vis = parts.filter((g) => !g.coverOnly);
  if (vis.length !== 6) throw new Error(sid + ' TOC needs 6 parts, has ' + vis.length);
  const T = { 0: 'CONTENTS', 1: '목차', 2: P.name.replace(' · ', ' ') + ' · 6개 장', 33: cust, 34: P.name + ' · 썸네일 사진: 각 장 출처 표기' };
  const img = {}; const usedThumb = new Set();
  vis.forEach((g, i) => {
    const b = 3 + i * 5; // number · title · pages · desc · sub
    const pages = g.idx.map((k) => k + 1); const a = pages[0], z = pages[pages.length - 1];
    T[b] = String(i + 1).padStart(2, '0'); T[b + 1] = g.name; T[b + 2] = a === z ? 'p.' + a : 'p.' + a + '–' + z;
    T[b + 3] = (P.toc && P.toc[i] && P.toc[i][0]) || g.goal; T[b + 4] = (P.toc && P.toc[i] && P.toc[i][1]) || g.items.slice(0, 3).join(' · ');
    // thumbnail — first photo of the chapter (skip the TOC itself), not used by another card
    let ph = null;
    const pick = P.toc && P.toc[i] && P.toc[i][2]; // [지금 덱의 k, 사진 칸] — 장의 대표 사진을 직접 고른 경우
    if (pick) { const e = deck.find((d) => d.oldK === pick[0]); ph = e && e.fill.img && e.fill.img[pick[1]]; if (!ph) throw new Error(sid + ' toc pick ' + pick); }
    if (!ph) for (const k of g.idx) { const f = deck[k].fill; if (f.f === 'L_C10') continue; const v = photoOf(f); if (v && !usedThumb.has(v.src)) { ph = v; break; } }
    if (ph) { usedThumb.add(ph.src); img[i] = { src: ph.src, name: ph.name || g.name, keep: true, ...(ph.pos ? { pos: ph.pos } : {}) }; }
  });
  tocFill.t = T; tocFill.img = img;
  // the 5th card carries a fixed caption badge ‘도입사례 · 맥도날드 코리아’ in the layout — name the photo instead
  const n5 = (img[4] && img[4].name) || vis[4].name;
  const short = n5.replace(/\s*\(.*$/, '').split(/ — /)[0].slice(0, 18);
  tocFill.r = [['도입사례 · 맥도날드 코리아', short]];
}

const log = [];
const newFills = clone(FILLS);
const flows = {};
const story = {};
const bgOut = clone(BG);
for (const [sid, P] of Object.entries(PLAN)) {
  const s = SC[sid]; if (!s) { log.push('skip (no scenario) ' + sid); continue; }
  const old = slidesOfScenario(s);
  const oldF = FILLS[sid];
  const heads = HEADS[sid] || [];
  // coverage
  const seen = new Set();
  for (const g of P.parts) for (const x of g.slides) if (typeof x === 'number') { if (seen.has(x)) throw new Error(sid + ' dup ' + x); seen.add(x); }
  const dropped = old.map((_, k) => k).filter((k) => !seen.has(k));
  for (const k of dropped) if (old[k].f !== 'L_PH_C13') throw new Error(sid + ' would drop ' + k + ' ' + old[k].f);
  const c13 = dropped.length ? oldF[dropped[0]] : null;
  // lay out the deck
  const deck = []; const parts = [];
  let ch = 0;
  for (const g of P.parts) {
    const coverOnly = g.slides.every((x) => typeof x === 'number' && isCoverSheet(old[x].f));
    if (!coverOnly) ch++;
    const idx = [];
    for (const x of g.slides) {
      let e;
      if (typeof x === 'number') {
        if (oldF[x].f !== old[x].f) throw new Error(sid + ' fill mismatch ' + x);
        e = { f: old[x].f, role: old[x].role, fill: clone(oldF[x]), oldK: x };
        // renumber the eyebrow 'NN · …' to this part's chapter number
        const h = heads[x];
        if (P.renumber && !coverOnly && h && h.eb && /^\d{2} · /.test(h.eb)) {
          const want = h.eb.replace(/^\d{2}/, String(ch).padStart(2, '0'));
          if (want !== h.eb) { e.fill.t = e.fill.t || {}; e.fill.t[h.ebI] = want; log.push(`${sid} k${x} ${h.eb} → ${want}`); }
        }
      } else {
        const [kind, role] = x;
        const closePhoto = kind === 'CLOSE' ? (photoOf(c13) || (C13PH[sid] ? { src: C13PH[sid].src, name: role.split(' — ').pop() } : null)) : null;
        e = { f: KIND[kind], role, fill: newFill(kind, sid, { ch, closePhoto }), oldK: null, kind };
      }
      idx.push(deck.length); deck.push(e);
    }
    parts.push({ ...g, coverOnly, idx, ch: coverOnly ? 0 : ch });
  }
  for (const e of deck) if (!L[e.f]) throw new Error(sid + ' no layout ' + e.f);
  // TOC
  for (const e of deck) if (e.kind === 'TOC' || (e.f === 'L_C10' && sid === 'bs02')) fillToc(sid, deck, parts, e.fill, P);
  // every visible part ≥ 2 layouts (cover sheets do not count)
  for (const g of parts) { if (g.coverOnly) continue; const n = g.idx.filter((k) => !isCoverSheet(deck[k].f)).length; if (n < 2) throw new Error(`${sid} part ${g.name} has ${n}`); }
  // new photo addresses → pack
  for (const e of deck) for (const v of Object.values(e.fill.img || {})) if (v && packAddr[v.src]) v.src = packAddr[v.src];
  newFills[sid] = deck.map((e) => { const { f, ...rest } = e.fill; return { ...rest, f: e.f }; });
  flows[sid] = parts.map((g) => ({ key: g.key, name: g.name, goal: g.goal, slides: g.idx.map((k) => [deck[k].f, deck[k].role]) }));
  story[sid] = {
    keymen: P.keymen, note: P.note || '',
    parts: Object.fromEntries(parts.filter((g) => !g.coverOnly).map((g) => [g.name, { type: g.type, items: g.items }])),
  };
  // background theme: keep each old slide's photo, new slides take the freed / spare ones
  if (BG[sid]) {
    const b = BG[sid]; const total = b.n + b.spare;
    const oldMap = b.map || Array.from({ length: b.n }, (_, k) => k);
    const used = new Set(deck.filter((e) => e.oldK != null).map((e) => oldMap[e.oldK]));
    const free = Array.from({ length: total }, (_, i) => i).filter((i) => !used.has(i));
    const map = deck.map((e) => (e.oldK != null ? oldMap[e.oldK] : free.shift()));
    if (map.some((v) => v == null)) throw new Error(sid + ' not enough bg photos');
    bgOut[sid] = { ...b, n: deck.length, spare: total - deck.length, map };
  }
  log.push(`${sid}: ${old.length} → ${deck.length} slides · ${parts.filter((g) => !g.coverOnly).length} parts`);
}

// ---------- write ----------
const q = (v) => JSON.stringify(v);
function flowCode(fl) {
  return '    flow: [\n' + fl.map((g) => `      st(${q(g.key)}, ${q(g.name)}, ${q(g.goal)}, [${g.slides.map(([f, r]) => `[${q(f)}, ${q(r)}]`).join(', ')}]),`).join('\n') + '\n    ],';
}
let scSrc = rd('src/scenarios.js');
for (const [sid, fl] of Object.entries(flows)) {
  const at = scSrc.indexOf(`id: '${sid}'`); if (at < 0) throw new Error('no ' + sid);
  const a = scSrc.indexOf('    flow: [\n', at); const b = scSrc.indexOf('\n    ],\n', a);
  if (a < 0 || b < 0) throw new Error('flow block ' + sid);
  scSrc = scSrc.slice(0, a) + flowCode(fl) + scSrc.slice(b + '\n    ],'.length);
}
const fillsSrc = FILLS_SRC.replace(FM[0], 'export const FILLS = ' + JSON.stringify(newFills) + ';\n');
const storySrc = `// Best Scenario · Storyboard — 시나리오마다 고객 요구사항(키맨별 요구) · 파트(= Storyboard 버블)의 유형과 내용.
// 파트 이름은 scenarios.js flow 의 단계 이름과 같다(단계 하나 = 버블 하나, 버블마다 레이아웃 2장 이상).
// 표지만 든 단계는 숨은 표지 파트(버블 없음). 여기에 없는 시나리오는 scenario_storyboard.js 가 flow 에서 만들어 쓴다.
// 생성: build/sb/apply.mjs (계획: build/sb/plan.mjs)
export const STORY = ${JSON.stringify(story, null, 1)};
`;
if (!DRY) {
  fs.writeFileSync(path.join(ROOT, 'src/scenarios.js'), scSrc);
  fs.writeFileSync(path.join(ROOT, 'src/scenario_fills.js'), fillsSrc);
  fs.writeFileSync(path.join(ROOT, 'src/scenario_bg.json'), JSON.stringify(bgOut, null, 1).replace(/"map": \[\n([\s\d,]+?)\n  \]/g, (m, a) => '"map": [' + a.split('\n').map((x) => x.trim().replace(/,$/, '')).filter(Boolean).join(', ') + ']') + '\n');
  fs.writeFileSync(path.join(ROOT, 'src/scenario_story.js'), storySrc);
  if (newImgs.length) {
    const images = newImgs.map((f) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(NEWDIR, f)).toString('base64'));
    fs.writeFileSync(path.join(ROOT, PACK), JSON.stringify({ images }));
    fs.writeFileSync(path.join(ROOT, 'build/sb/pack_meta.json'), JSON.stringify(packMeta, null, 1));
  }
}
console.log(log.join('\n'));
