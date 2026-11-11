// 공간 조감도 데이터 — 로컬 Winmate의 공간 조감도 라이브러리를 같은 조립 엔진(winmate-spatial-1)으로 배치한 결과를 구워 넣은 것.
// 샘플 버티컬 시나리오 층 206개(업종 16개 × 12가지 공간 조합 + 코워킹 4 + 복합 · 근린생활 10) + 버티컬 층 94개(버티컬 44개의 공간 조합, lay 'vt').
// 굽는 법: node app/scripts/build_building_bake.mjs (라이브러리 · app/data/spatial/vertical-layouts.json → bake.b64 · presets-verticals.js)
// 페이지에는 gzip + base64로 들어 있다(<script id="wm-bld-data" data-enc="gzip-base64">) — ready()가 풀어 둔 뒤 data()로 쓴다.
// tpl.rooms : [id, 이름, 종류, x, z, 가로, 세로, 실외, 목적]
// tpl.objs  : [자산 번호, x, z, 높이, 회전(도), 공간 번호, 천장 설치]
// tpl.ppl   : [x, 바닥 y, z, 키, 폭, 상의, 하의, 피부, 머리, 앉음]
// tpl.lay   : 공간 조합 — full 전체 · x6 확장 6 · five 5 · f4 핵심 4 · b4 지원 4 · m4 혼합 4 · p4 확장 4 · bar 일자형 3 · mx 복합층 · vt 버티컬 층 · std 표준 건물 조감도 층(bake-standard.js)
// tpl.vt · vl : 버티컬 id · 이름(버티컬 층만), tpl.sign : 외벽 간판 글자(있으면)

import { STANDARD_BAKE } from './bake-standard.js';

let D = null, P = null;

async function unzip(txt) {
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 내장 데이터를 풀 수 없어요. 최신 Chrome · Edge · Safari · Firefox에서 열어 주세요.');
  const bin = Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
async function load() {
  const el = document.getElementById('wm-bld-data');
  if (!el) throw new Error('공간 조감도 데이터를 찾지 못했어요.');
  const txt = el.textContent.trim();
  return el.getAttribute('data-enc') !== 'gzip-base64' ? JSON.parse(txt) : unzip(txt);
}
// 표준 건물 조감도 층(bake-standard.js) — 기본 데이터 뒤에 붙인다. 같은 자산은 기본 표의 것을 쓰고 새 자산만 이어 번호를 매기며,
// 레시피도 없는 것만 더한다. 이미 들어 있는 층(같은 id)은 건너뛰어 HTML 추출 파일처럼 이미 합친 데이터에도 안전하다
function withStandard(raw, std) {
  const at = new Map(raw.assets.map((a, i) => [a.id, i]));
  const map = std.assets.map((a) => {
    if (!at.has(a.id)) { at.set(a.id, raw.assets.length); raw.assets.push(a); }
    return at.get(a.id);
  });
  for (const [k, r] of Object.entries(std.recipes)) if (!raw.recipes[k]) raw.recipes[k] = r;
  const have = new Set(raw.tpl.map((t) => t.id));
  for (const t of std.tpl) if (!have.has(t.id)) raw.tpl.push({ ...t, objs: t.objs.map((o) => [map[o[0]], ...o.slice(1)]) });
  return raw;
}

function prep(raw) {
  const ind = Object.fromEntries(raw.ind.map((i) => [i.code, i.name]));
  const tpl = raw.tpl.map((t) => {
    const products = new Map();
    let productCount = 0;
    for (const o of t.objs) {
      const a = raw.assets[o[0]];
      if (!a || !a.pid) continue;
      productCount++;
      products.set(a.n, (products.get(a.n) || 0) + 1);
    }
    const roomProducts = t.rooms.map(() => new Map());
    for (const o of t.objs) {
      const a = raw.assets[o[0]];
      if (!a || !a.pid || o[5] < 0) continue;
      const m = roomProducts[o[5]];
      m.set(a.n, (m.get(a.n) || 0) + 1);
    }
    const area = t.w * t.d;
    return {
      ...t,
      indName: ind[t.ind] || t.ind,
      // 버티컬 층(vt)은 버티컬 이름을 붙여 고르기 창에서 구분한다
      name: t.vt ? `${t.vl} · ${t.name}` : t.name,
      // 층 이름표 — 업종 이름(복합층 · 버티컬 층은 층 이름)
      short: t.vt ? t.name : t.ind === 'MX' ? t.name : ind[t.ind] || t.name,
      area,
      sizeText: `${Math.round(t.w)}×${Math.round(t.d)}m`,
      sizeClass: area < 200 ? 'S' : area < 420 ? 'M' : 'L',
      roomsText: t.rooms.map((r) => r[1]).join(' · '),
      productCount,
      products: [...products.entries()].sort((a, b) => b[1] - a[1]),
      roomProducts: roomProducts.map((m) => [...m.entries()].sort((a, b) => b[1] - a[1])),
    };
  });
  const byInd = new Map();
  for (const t of tpl) {
    if (!byInd.has(t.ind)) byInd.set(t.ind, []);
    byInd.get(t.ind).push(t);
  }
  return {
    raw,
    v: raw.v,
    styles: raw.styles,
    assets: raw.assets,
    recipes: raw.recipes,
    industries: raw.ind.filter((i) => byInd.has(i.code)),
    indName: ind,
    tpl,
    byInd,
    tplById: Object.fromEntries(tpl.map((t) => [t.id, t])),
  };
}

// 한 번만 풀어 둔다
export function ready() {
  if (D) return Promise.resolve(D);
  return (P ||= Promise.all([load(), unzip(STANDARD_BAKE)]).then(([raw, std]) => (D = prep(withStandard(raw, std)))).catch((e) => { P = null; throw e; }));
}
export function data() {
  if (!D) throw new Error('공간 조감도 데이터를 아직 읽지 않았어요.');
  return D;
}
export const tplOf = (id) => (D && D.tplById[id]) || null;
export const tplsOf = (ind) => (D && D.byInd.get(ind)) || [];
