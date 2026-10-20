import { getBootstrap } from '../api/bootstrap.js';
const { catalog: CATALOG, images: IMAGES, products: PDB } = getBootstrap();
import { RETIRED_R4 } from '../domain/templates/retired.js';
import { COVERS } from '../domain/templates/covers.js';
import { PHOTO_META, PHOTO_HTML } from '../domain/templates/photo_layouts.js';
import { STD_META, STD_HTML } from '../domain/templates/std_layouts.js';
import { SPATIAL_META, SPATIAL_HTML } from '../domain/templates/spatial-layouts.js';
import { VERTICAL_META, VERTICAL_HTML } from '../domain/templates/vertical_layouts.js';
import { DESCRIPTION_META, DESCRIPTION_DECK_META, loadDescriptionHtml } from '../domain/templates/description_standards.js';

// 사진 중심 버전이 내용을 빠짐없이 담아, 라이브러리에서 뺀 텍스트 레이아웃 (텍스트 f → 대체한 사진 중심 f).
// 고르기 · 검색 · 추천 · 개수에서는 빠지고, 이미 만든 제안서 · Best Scenario · 히스토리 예시에 들어 있는 장은 그대로 그립니다.
// 검색 · 추천 점수는 계속 매겨, 이 장과 잘 맞는 내용이면 대체한 사진 버전이 그 점수를 물려받습니다 (search.js).
export const RETIRED = {
  ...RETIRED_R4,
  L_CB_B: 'L_PH_CB_B', L_CB_D: 'L_PH_CB_D', L_CB_F: 'L_PH_CB_F', L_MI05: 'L_PH_US_A',
  L_VP03: 'L_PH_VP_B', L_EF_A: 'L_PH_EF_A',
  L_SD_G: 'L_PH_SD_G', L_QA_A: 'L_PH_QA_A', L_AIS_08: 'L_PH_AIS_08', L_AIS_25: 'L_PH_AIS_25', L_AIS_35: 'L_PH_AIS_35', // 9차 — Best Scenario 사진 중심 전환 때 새로 만든 사진 버전 (build/bs/newlayouts.mjs)
  L_P3A: 'L_PH_P3_A', L_P5A: 'L_PH_P5_A', L_P2C: 'L_PH_P2_C', L_P_O: 'L_PH_P_O', L_P_P: 'L_PH_P_P', L_P_N: 'L_PH_P_N',
};
export const ALL_LAYOUTS = [...CATALOG.layouts, ...PHOTO_META, ...STD_META, ...SPATIAL_META, ...VERTICAL_META, ...DESCRIPTION_META];
for (const l of ALL_LAYOUTS) if (RETIRED[l.f]) l.retired = RETIRED[l.f];
export const LAYOUTS = ALL_LAYOUTS.filter((l) => !l.retired);
export const L = Object.fromEntries(ALL_LAYOUTS.map((l) => [l.f, l]));
for (const meta of DESCRIPTION_DECK_META) L[meta.f] = meta;
// 업종별 기본 표지(covers.js L_IND_*)도 장으로 그릴 수 있게 — 목록 · 검색에는 넣지 않고 L에만 (예전 히스토리에 들어 있을 수 있음)
for (const f of Object.keys(COVERS)) if (!L[f]) L[f] = { f, code: f.slice(2), name: '표지 · 업종 기본', when: '업종 사진 위에 제안서 제목 · 고객사 · 날짜', g: '', p: 'cover', p2: null, ind: f.slice(6) && f.slice(6) !== '_' ? f.slice(6) : null, sol: null, c: 'CM', req: [], ik: [], ih: [], phs: [], prods: [], sols: [] };

/** 표지 sheets (표지 A–E · 업종 기본 표지 — not 목차 · 간지). They open the deck and live only in the PPT 레이아웃 panel. */
export const isCoverSheet = (f) => { const l = L[f]; return !!l && l.p === 'cover' && /^표지/.test(l.name || ''); };
/** The deck's page order — 표지 sheets first, then every other sheet in part order: [{ x: layout, s: part }].
 *  The PPT 레이아웃 panel, page numbers, the detail's 이전 / 다음 and PPTX export all follow it. */
export function deckOrder(p) {
  const cov = [], rest = [];
  for (const s of p.parts) for (const x of s.layouts) if (L[x.f]) (isCoverSheet(x.f) ? cov : rest).push({ x, s });
  return cov.concat(rest);
}
/** A part that holds only 표지 sheets is not a Storyboard bubble (safety net — normalizeCovers moves them to the deck part). */
export const isCoverOnlyPart = (s) => !!s && (s.layouts || []).length > 0 && s.layouts.every((x) => isCoverSheet(x.f));
/** the parts drawn as Storyboard bubbles — never the deck part (s.deck) that holds the 표지 */
export const storyParts = (p) => p.parts.filter((s) => !s.deck && !isCoverOnlyPart(s));
/** 표지 lives only in the PPT 레이아웃 panel — in data, every 표지 sheet sits in one hidden part { deck: true, name: '표지' }
 *  kept first in p.parts (so the detail editor · viewer · PPTX keep working on it as on any part), and no other part holds one.
 *  Runs after every change (store.js update) and, with migrate, on load for saved history: then a part that is itself a 표지
 *  part (type 'cover', or a name with 표지 — e.g. a history case's ‘표지’) goes as a whole, its 목차 · 간지 into the deck part too.
 *  A part left empty because its only sheets were 표지 is removed; the deck part is removed when it holds nothing. */
export function normalizeCovers(d, migrate = false) {
  if (!d || !Array.isArray(d.parts) || !d.parts.length) return false;
  const decks = d.parts.filter((s) => s.deck);
  let changed = decks.length > 1 || (decks.length === 1 && (d.parts[0] !== decks[0] || !(decks[0].layouts || []).length));
  const sheets = decks.flatMap((s) => s.layouts || []);
  const rest = [];
  for (const s of d.parts) {
    if (s.deck) continue;
    const lay = s.layouts || [];
    if (migrate && (s.type === 'cover' || /표지/.test(s.name || ''))) { sheets.push(...lay); changed = true; continue; }
    const cov = lay.filter((x) => isCoverSheet(x.f));
    if (cov.length) {
      sheets.push(...cov); s.layouts = lay.filter((x) => !isCoverSheet(x.f)); changed = true;
      if (!s.layouts.length) continue; // it held only 표지
    }
    rest.push(s);
  }
  if (!changed) return false;
  if (sheets.length) {
    const deck = decks[0] || { id: 'deck' + Math.random().toString(36).slice(2, 9), type: 'cover', name: '표지', items: ['표지'], form: 'list', text: '', layouts: [] };
    Object.assign(deck, { deck: true, done: true, name: '표지' });
    deck.layouts = [...sheets.filter((x) => isCoverSheet(x.f)), ...sheets.filter((x) => !isCoverSheet(x.f))];
    d.parts = [deck, ...rest];
  } else d.parts = rest;
  return true;
}
// 표지 · 목차 · 간지는 원본 장표에 이미 사진 버전이 있어, 텍스트 버전과 같은 맥락으로 잇습니다 (사진 f → 텍스트 f)
const CATALOG_TWINS = { L_C02: ['L_C03'], L_C08: ['L_C03'], L_C10: ['L_C04'], L_C11: ['L_C05'], L_C06: ['L_C05'] };
for (const l of CATALOG.layouts) if (CATALOG_TWINS[l.f] && !l.pv) l.pv = CATALOG_TWINS[l.f];
// 같은 맥락: 텍스트 레이아웃 f → 사진 중심 버전들, 사진 중심 f → 텍스트 버전들
export const PHOTO_OF = {};
for (const m of LAYOUTS) for (const f of m.pv || []) (PHOTO_OF[f] = PHOTO_OF[f] || []).push(m.f);
for (const f of Object.keys(RETIRED)) { const a = PHOTO_OF[f] || []; PHOTO_OF[f] = [RETIRED[f], ...a.filter((x) => x !== RETIRED[f])]; } // 대체한 사진 버전을 맨 앞에
export function twinsOf(l) {
  if (!l) return { photo: [], text: [] };
  return { photo: (PHOTO_OF[l.f] || []).map((f) => L[f]).filter(Boolean), text: (l.pv || []).map((f) => L[f]).filter((x) => x && !x.retired) };
}
export const isPhotoFirst = (l) => !!l && (l.c === 'PH' || (l.pf || 0) >= 0.3);
export const INDUSTRIES = CATALOG.industries;
export const IND = Object.fromEntries(INDUSTRIES.map((i) => [i.code, i]));
// 제품 = 큐레이션 40개(catalog.json — 레이아웃 · 시나리오 · 예시가 쓰는 id) + 제품 DB(products_db.json — samsung.com/business 전 제품 카드 · e-카탈로그 전용 제품).
// 큐레이션 항목 중 사이트 카드와 모델코드가 같은 것은 그 카드의 옵션 · 상세 · 사진을 함께 쓰고(카드는 목록에 따로 넣지 않음),
// 모든 제품에 탐색기 분류(fam 제품군 · sc 사이트 분류)가 붙는다. cur = 큐레이션 항목.
for (const p of CATALOG.products) Object.assign(p, PDB.curated[p.id] || {}, { cur: true });
export const PRODUCTS = [...CATALOG.products, ...PDB.products];
export const PRODUCT_DB = { generated: PDB.generated, source: PDB.source, counts: PDB.counts, famOrder: PDB.famOrder, catOrder: PDB.catOrder };
export const SOLUTIONS = CATALOG.solutions;
export const CASES = CATALOG.cases;
export const IND_KW = CATALOG.indKw;
export const P = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const S = Object.fromEntries(SOLUTIONS.map((s) => [s.id, s]));
export const C = Object.fromEntries(CASES.map((c) => [String(c.id), c]));

export const CANVAS = {
  MI: { name: 'PPT · 01 MI (업종별)', url: 'https://claude.ai/artifact/XnbECsMCvmCsHTsJtfeQUV' },
  VP: { name: 'PPT · 02 Value Props', url: 'https://claude.ai/artifact/V6bPV1WJhKFyJeHEYjmnhv' },
  SS: { name: 'PPT · 03 공간별 가치 제공 시나리오', url: 'https://claude.ai/artifact/7DyZ4i11yq9sjnBP2ztEtr' },
  SP: { name: 'PPT · 04 공간별 제품 소개', url: 'https://claude.ai/artifact/9mD73MY9hcPFPAavohfA7B' },
  CM: { name: 'PPT · 공통 · 솔루션 전용 · 이미지 중심', url: 'https://claude.ai/artifact/GFCVoigDttt2414bvFWDvv' },
  EX: { name: 'PPT · 05 보강 레이아웃', url: 'https://claude.ai/artifact/MbhEa2JB7ELDFLbRceHHQ4' },
  PH: { name: 'PPT · 06 사진 중심 (Winmate에서 추가)', url: '' },
  ST: { name: 'PPT · 표준 제안서 · 호텔 AI 스테이', url: 'https://claude.ai/artifact/KGqEnieEMcvGwVsoArQ1sy' },
  ST_SOL: { name: 'PPT · 표준 제안서 · 공유오피스 Lite (명세 복원 · Winmate에서 추가)', url: '' }, // l.cv — 같은 ST 묶음 안에서 원본만 다른 양식
  ST_DESC: { name: 'PPT · 업종별 표준 제안서 · Markdown 설명 기반 재구성', url: '' },
  MY: { name: 'My 템플릿 (이 브라우저에 저장)', url: '' },
};

// Image DB (catalog images published with the app)
const KINDNAME = { cut: '제품 컷', case: '설치 사례', life: '공식 연출', ui: '솔루션 화면', gen: '생성 이미지' };
export const IMAGE_DB = Object.entries(IMAGES.pids).map(([pid, v]) => ({
  pid, src: v.file, group: v.src, groupName: KINDNAME[v.src] || v.src, model: v.model, desc: v.desc, w: v.w, h: v.h,
}));

export function refInfo(ref) {
  const [type, id] = String(ref).split(':');
  if (type === 'product') { const p = P[id]; return p && { type, id, label: p.name, sub: p.model + ' · ' + p.cat, short: p.model }; }
  if (type === 'solution') { const s = S[id]; return s && { type, id, label: s.name, sub: s.cat, short: s.name }; }
  if (type === 'case') { const c = C[id]; return c && { type, id, label: c.cust, sub: (c.sub || c.title).slice(0, 48), short: c.cust }; }
  return null;
}
export const TYPE_LABEL = { product: '제품', solution: '솔루션', case: '유관사례' };

// ---- layout HTML bodies (gzip+base64 inline) ----
let HTML = null;
export async function loadLayoutHtml() {
  if (HTML) return HTML;
  const el = document.getElementById('wm-layouts');
  const b64 = el ? el.textContent.trim() : '';
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  let text;
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bin]).stream().pipeThrough(ds);
    text = await new Response(stream).text();
  } else {
    throw new Error('이 브라우저는 압축 해제를 지원하지 않아요');
  }
  HTML = Object.assign(JSON.parse(text), COVERS, PHOTO_HTML, STD_HTML, SPATIAL_HTML, VERTICAL_HTML, await loadDescriptionHtml());
  return HTML;
}
// My 템플릿 (my/store.js) — the person's own layouts, kept in this browser: they join L (so a proposal, the detail popup,
// PPTX export … draw them like any layout) but not ALL_LAYOUTS / LAYOUTS (the library lists them under My only).
const EXTRA_HTML = {};
export function registerLayout(meta, html) { L[meta.f] = meta; EXTRA_HTML[meta.f] = html; }
export function unregisterLayout(f) { if (EXTRA_HTML[f] != null) { delete EXTRA_HTML[f]; delete L[f]; } }
export function layoutHtml(f) { return (HTML && HTML[f]) || EXTRA_HTML[f] || ''; }
