// 공간 조감도 데이터 — 로컬 Winmate(localhost:8788)의 공간 조감도 라이브러리(733e40b9)를 같은 조립 엔진(winmate-spatial-1)으로
// 배치한 결과를 구워 넣은 것: 업종 16개 × 12가지 공간 조합 + 코워킹 4 + 복합 · 근린생활 10 = 206개 (굽는 법: 프로젝트 claude/building-birdseye.md 「데이터」)
// 페이지에는 gzip + base64로 들어 있다(<script id="wm-bld-data" data-enc="gzip-base64">) — ready()가 풀어 둔 뒤 data()로 쓴다.
// tpl.rooms : [id, 이름, 종류, x, z, 가로, 세로, 실외, 목적]
// tpl.objs  : [자산 번호, x, z, 높이, 회전(도), 공간 번호, 천장 설치]
// tpl.ppl   : [x, 바닥 y, z, 키, 폭, 상의, 하의, 피부, 머리, 앉음]
// tpl.lay   : 공간 조합 — full 전체 · x6 확장 6 · five 5 · f4 핵심 4 · b4 지원 4 · m4 혼합 4 · p4 확장 4 · bar 일자형 3 · mx 복합층

let D = null, P = null;

async function load() {
  const el = document.getElementById('wm-bld-data');
  if (!el) throw new Error('공간 조감도 데이터를 찾지 못했어요.');
  const txt = el.textContent.trim();
  if (el.getAttribute('data-enc') !== 'gzip-base64') return JSON.parse(txt);
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 내장 데이터를 풀 수 없어요. 최신 Chrome · Edge · Safari · Firefox에서 열어 주세요.');
  const bin = Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
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
      // 층 이름표 — 업종 이름(복합층은 층 이름)
      short: t.ind === 'MX' ? t.name : ind[t.ind] || t.name,
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
  return (P ||= load().then((raw) => (D = prep(raw))).catch((e) => { P = null; throw e; }));
}
export function data() {
  if (!D) throw new Error('공간 조감도 데이터를 아직 읽지 않았어요.');
  return D;
}
export const tplOf = (id) => (D && D.tplById[id]) || null;
export const tplsOf = (ind) => (D && D.byInd.get(ind)) || [];
