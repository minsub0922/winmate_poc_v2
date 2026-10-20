import { useSyncExternalStore } from 'react';
import { splitFree } from './parts.js';
import { rfpSeeds } from './seeds_rfp.js';
import { caseSeeds } from './seeds_cases.js';
import SEED_PARTS from './seeds_parts.json';
import PREV_FP from './seeds_prev_fp.json';
import { normalizeCovers } from './data.js';
import { bgUrl } from './bgpack.js';
import { legacySrc } from './legacy_img.js';

const KEY = 'winmate.v2.proposals';
const UKEY = 'winmate.v2.ui';
const SEEDV_KEY = 'winmate.v2.seedv'; // 이미 저장된 히스토리에 새 샘플을 한 번만 넣기 위한 표시
const SEEDV = 4; // 2: 금융권 RFP 샘플 4건 · 3: 업종 · 전략별 히스토리 17건(seeds_cases) · 4: 히스토리 예시 기승전결 개편(파트마다 레이아웃 2~3장, 사진 중심) — 손대지 않은 예시만 새 버전으로
export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 9);
const now = () => Date.now();

// segments helpers: [{t:'text'} | {ref:'product:qm55c'}]
export const seg = (...xs) => xs.map((x) => (typeof x === 'string' ? (x.startsWith('@') ? { ref: x.slice(1) } : { t: x }) : x));
export const segRefs = (segs) => (segs || []).filter((s) => s.ref).map((s) => s.ref);
export const segPlain = (segs, label) => (Array.isArray(segs) ? segs.map((s) => (s.t != null ? s.t : '@' + (label ? label(s.ref) : s.ref))).join('') : String(segs || ''));

function emptyProposal() {
  return {
    id: uid('p'), title: '새 제안서', customer: '', ind: null, createdAt: now(), updatedAt: now(), stage: 'req', reqTab: 'free',
    req: { free: [], form: { project: '', customer: '', target: '', keymen: [{ id: uid('k'), name: '', weight: 100, reqs: [[]] }], note: '' }, files: [] },
    ctx: { products: [], solutions: [], cases: [] }, parts: [], exportedAt: null,
  };
}

const FREE_E = '설계 단계에서 AI 인프라를 넣을 수 있는 시점은 올해뿐이다. 준공 뒤에 넣으면 배관 · 배선 공사를 다시 해야 한다.\n대표이사는 \'국내 최초 AI Ready 오피스\'라는 메시지를 원하고, 임차인 유치 경쟁에서는 운영 품질이 차별점이 된다.\n에너지 20% 절감은 숫자보다 실측으로 증빙하는 방식을 먼저 보여 주고 싶다.';
// A 커피 · E 오피스 예시의 Storyboard (seeds_parts.json — 히스토리 예시 개편 때 케이스와 같은 도구로 만듦). 근거 시각은 마지막 수정 시각.
function seedParts(id, at) {
  const parts = structuredClone(SEED_PARTS[id] || []);
  for (const s of parts) for (const x of s.layouts || []) for (const e of Object.values(x.ev || {})) if (e.at == null) e.at = at;
  return parts;
}
/** 예시 지문 — 레이아웃 · 상태 · 채운 값 · 파트 이름이 원래 그대로인지(사용자가 손대지 않았는지) 본다. 새 버전으로 바꿀 때만 쓴다. */
export function seedFingerprint(p) {
  const rows = [];
  for (const s of p.parts || []) {
    for (const x of s.layouts || []) {
      const ov = x.ov || {};
      const t = Object.keys(ov.t || {}).sort().map((k) => k + '=' + JSON.stringify(ov.t[k]));
      const im = Object.keys(ov.img || {}).sort().map((k) => k + '=' + ((ov.img[k] || {}).src || ''));
      rows.push([s.deck ? 'deck' : s.type, x.f, x.status, t.join('|'), im.join('|')].join('¦'));
    }
    if (!s.deck) rows.push('part:' + s.type + ':' + s.name);
  }
  const str = rows.join('\n');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + str.length;
}
export function seedProposals() {
  const t = now();
  const lay = (f, status = 'empty', ov = {}) => ({ uid: uid('l'), f, status, ov: { t: ov.t || {}, img: ov.img || {} } });
  const A = {
    ...emptyProposal(), id: 'p_seed_acoffee', title: 'A 커피 · 전국 매장 디지털 메뉴보드 전환', customer: 'A 커피 프랜차이즈', ind: 'FB',
    createdAt: t - 86400e3 * 3, updatedAt: t - 3600e3 * 2, stage: 'story', reqTab: 'form',
    req: {
      free: seg('전국 320개 매장의 인쇄 메뉴판을 디지털 메뉴보드로 바꾸려 합니다. 카운터 메뉴보드는 ', '@product:qm55c', ' 3면, 주문은 ', '@product:kiosk', ' 로 분산하고, 본사에서 ', '@solution:magicinfo', ' 로 전 매장 메뉴 · 가격을 한 번에 바꾸는 구조를 원합니다. DT 매장은 ', '@case:1490', ' 처럼 옥외 메뉴보드가 필요합니다. 매장 냉난방 전력도 줄이고 싶다는 요청이 있었습니다.'),
      form: {
        project: '전국 매장 디지털 메뉴보드 전환', customer: 'A 커피 프랜차이즈', target: '운영본부장',
        keymen: [
          { id: uid('k'), name: '운영본부장', weight: 50, reqs: [seg('신메뉴 · 가격 변경을 전 매장에 당일 반영'), seg('매장별 가격 표기 불일치 해소'), seg('메뉴판 교체에 드는 매장 인력 줄이기')] },
          { id: uid('k'), name: '마케팅팀장', weight: 30, reqs: [seg('시간대별 메뉴 · 프로모션 자동 전환'), seg('DT · 가두 매장 외부 집객')] },
          { id: uid('k'), name: '시설팀장', weight: 20, reqs: [seg('매장 냉난방 · 조명 전력 절감'), seg('화면 장애를 본사에서 원격 확인')] },
        ],
        note: '320개 매장 중 DT · 가두 매장은 약 40곳. 파일럿 10곳부터 시작하는 단계 도입을 제안하고 싶음.',
      },
      files: [{ id: uid('f'), name: 'A커피_매장현황_2026Q3.xlsx', size: 48211, type: 'xlsx', text: '', memo: '매장 유형별 수량 (소형 140 · 표준 150 · 플래그십 30)' }],
    },
    ctx: { products: ['qm55c', 'kiosk', 'oh55a', 'ac360'], solutions: ['magicinfo', 'stpro'], cases: ['1490', '159', '78'] },
    parts: seedParts('p_seed_acoffee', t - 3600e3 * 2),
  };
  const E = {
    ...emptyProposal(), id: 'p_seed_eoffice', title: '용산 업무시설 재개발 AI Ready 오피스', customer: 'E 자산운용', ind: 'OF',
    createdAt: t - 86400e3 * 6, updatedAt: t - 86400e3 * 1, stage: 'story', reqTab: 'form',
    req: {
      free: seg('대표이사 요청: 사용자를 인식하고 반응하는 AI Ready 오피스. 에너지 사용량 20% 절감을 실측으로 증빙해야 함. 로비는 ', '@product:thewall', ', 회의실은 ', '@product:flip', ' 검토. 빌딩 관제는 ', '@solution:biot', ' 와 ', '@solution:stpro', ' 조합.'),
      form: {
        project: '용산 업무시설 재개발 AI Ready 오피스', customer: 'E 자산운용', target: '대표이사',
        keymen: [
          { id: uid('k'), name: '대표이사', weight: 50, reqs: [seg('사용자를 인식하고 반응하는 AI Ready 오피스'), seg('국내 최초 AI Ready 오피스로 알리기'), seg('에너지 사용량 20% 절감 · 실측 증빙')] },
          { id: uid('k'), name: '공간컨텐츠실장', weight: 30, reqs: [seg('오피스를 업무환경 플랫폼으로'), seg('예측 · 반응형 공간'), seg('건물 가치 · 임대 선호도 제고')] },
          { id: uid('k'), name: '개발사업팀장', weight: 20, reqs: [seg('AI 인프라를 설계 단계에 반영'), seg('시공 · 운영 유지보수 부담 최소화')] },
        ],
        note: '',
      },
      files: [],
    },
    ctx: { products: ['thewall', 'flip', 'qm55c', 'dvms2'], solutions: ['biot', 'stpro', 'magicinfo'], cases: ['3310', '2365'] },
    parts: seedParts('p_seed_eoffice', t - 86400e3 * 1),
  };
  const B = {
    ...emptyProposal(), id: 'p_seed_bhotel', title: 'B 호텔 · 객실 · 공용부 리뉴얼', customer: 'B 비즈니스 호텔', ind: 'HT',
    createdAt: t - 3600e3 * 5, updatedAt: t - 3600e3 * 5, stage: 'req', reqTab: 'files',
    req: {
      free: seg('객실 300실 TV · 냉방 교체와 로비 · 연회장 사이니지 신설. 투숙객 체크인 대기를 줄이고 싶다고 함.'),
      form: { project: '객실 · 공용부 리뉴얼', customer: 'B 비즈니스 호텔', target: '총지배인', keymen: [{ id: uid('k'), name: '총지배인', weight: 100, reqs: [seg('체크인 대기 시간 줄이기'), seg('객실 리뉴얼 공사 중에도 영업 유지')] }], note: '' },
      files: [{ id: uid('f'), name: 'RFP_B호텔_객실리뉴얼.pdf', size: 1834221, type: 'pdf', text: '', memo: '객실 300실 · 연회장 3 · 로비 1 · 피트니스 1' }],
    },
    ctx: { products: ['hoteltv'], solutions: [], cases: [] },
    parts: [],
  };
  const all = [...rfpSeeds(t, { uid }), ...caseSeeds(t), A, E, B].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const p of all) normalizeCovers(p, true); // 표지 → the hidden deck part (no Storyboard bubble)
  return all;
}

// ---------- persistence ----------
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v) && v.length) return migrateCovers(withNewSeeds(v)); } } catch (e) {}
  try { localStorage.setItem(SEEDV_KEY, String(SEEDV)); } catch (e) {}
  return seedProposals();
}
// 예전에 저장된 히스토리에도 새 샘플(2: RFP 4건 · 3: 히스토리 17건)을 버전마다 한 번만 넣는다. 지운 뒤에는 다시 넣지 않음.
// 4: 개편한 히스토리 예시 — 저장된 예시가 이전 버전 그대로(지문이 같음)일 때만 새 버전으로 바꾸고, 사용자가 고친 예시는 그대로 둔다.
function withNewSeeds(list) {
  let ver = 0;
  try { ver = Number(localStorage.getItem(SEEDV_KEY) || 0); } catch (e) {}
  if (ver >= SEEDV) return list;
  const t = now();
  const fresh = new Map(seedProposals().map((p) => [p.id, p]));
  const cur = list.map((p) => (PREV_FP[p.id] && fresh.has(p.id) && seedFingerprint(p) === PREV_FP[p.id] ? fresh.get(p.id) : p));
  const have = new Set(cur.map((p) => p.id));
  const add = [...(ver < 2 ? rfpSeeds(t, { uid }) : []), ...(ver < 3 ? caseSeeds(t) : [])].filter((p) => !have.has(p.id));
  const out = [...add, ...cur].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  try { localStorage.setItem(KEY, JSON.stringify(out)); localStorage.setItem(SEEDV_KEY, String(SEEDV)); } catch (e) {}
  return out;
}
// saved history: every 표지 (and any ‘표지’ part) moves into the hidden deck part — no 표지 bubble on any Storyboard, the 표지
// stays as the first page of the PPT 레이아웃 panel (data.js normalizeCovers). Saved back once when something moved.
function migrateCovers(list) {
  let n = 0;
  for (const p of list) if (normalizeCovers(p, true)) n++;
  if (n) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  return list;
}
let state = { proposals: load() };
const subs = new Set();
let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state.proposals)); } catch (e) {} }, 250);
}
function emit() { for (const f of subs) f(); }
export function useStore(sel) {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(state));
}
export function getProposal(id) { return state.proposals.find((p) => p.id === id); }
export function createProposal() {
  const p = emptyProposal();
  state = { proposals: [p, ...state.proposals] }; persist(); emit();
  return p.id;
}
export function deleteProposal(id) { state = { proposals: state.proposals.filter((p) => p.id !== id) }; persist(); emit(); }
export function resetDemo() { state = { proposals: seedProposals() }; persist(); emit(); }
/** Best 제안서 열기 — 원본은 그대로 두고 복사본을 내 제안서로 만든다 */
export function cloneProposal(src) {
  const t = structuredClone(src);
  t.id = uid('p'); t.createdAt = t.updatedAt = now();
  normalizeCovers(t, true);
  state = { proposals: [t, ...state.proposals] }; persist(); emit();
  return t.id;
}
/** 배경 테마(p.bg, Best Scenario에서 시작한 제안서) — 모든 장에 배경이 있고, 장마다 다른 사진.
 *  배경이 없는 장(새로 넣은 장 · 배경이 지워진 장)에는 테마 사진 중 아직 안 쓴 것을, 다 쓰면 가장 덜 쓴 것을 깐다. */
function syncBg(d) {
  const pool = d && d.bg ? (d.bg.pool || (d.bg.src ? [d.bg.src] : [])) : [];
  if (!pool.length) return;
  const all = (d.parts || []).flatMap((s) => s.layouts || []);
  const used = new Map(pool.map((x) => [x, 0]));
  for (const x of all) { const src = x.ov && x.ov.bg && x.ov.bg.src; if (src && used.has(src)) used.set(src, used.get(src) + 1); }
  for (const x of all) {
    x.ov = x.ov || { t: {}, img: {} };
    if (x.ov.bg && x.ov.bg.src) continue;
    let pick = pool[0];
    for (const src of pool) if (used.get(src) < used.get(pick)) pick = src;
    used.set(pick, used.get(pick) + 1);
    x.ov.bg = { src: pick, theme: d.bg.theme || '' };
  }
}
/** update(id, draft => {...}) — copy-on-write */
export function update(id, fn, { touch = true } = {}) {
  const i = state.proposals.findIndex((p) => p.id === id);
  if (i < 0) return;
  const draft = structuredClone(state.proposals[i]);
  fn(draft);
  normalizeCovers(draft); // a 표지 added anywhere goes to the deck part — never a Storyboard bubble
  syncBg(draft);
  if (touch) draft.updatedAt = now();
  const list = state.proposals.slice(); list[i] = draft;
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  state = { proposals: list }; persist(); emit();
}

/** Storyboard stage — 'req': 고객 요구사항 버블만 · 'match': 요구사항 저장 → 제품 · 솔루션 매칭 버블 · 'story': 매칭 저장 → 파트 */
export function stageOf(p) { return p.parts.length || p.stage === 'story' ? 'story' : p.stage === 'match' ? 'match' : 'req'; }
export function proposalStep(p) {
  if (p.exportedAt) return { n: 4, label: '내보내기 완료' };
  const nl = p.parts.reduce((a, s) => a + s.layouts.length, 0);
  if (nl) return { n: 3, label: '레이아웃 채우기' };
  if (p.parts.length) return { n: 2, label: 'Storyboard 구성' };
  return { n: 1, label: '고객 요구사항' };
}

// small UI prefs
export function loadUi() { try { return JSON.parse(localStorage.getItem(UKEY) || '{}'); } catch (e) { return {}; } }
export function saveUi(v) { try { localStorage.setItem(UKEY, JSON.stringify(v)); } catch (e) {} }

// ---------- uploaded images (IndexedDB, best-effort) ----------
const IMG_CACHE = new Map();
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open('winmate-v2', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('img');
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
export async function putImage(dataUrl) {
  const id = uid('u');
  IMG_CACHE.set(id, dataUrl);
  try { const db = await idb(); if (db) db.transaction('img', 'readwrite').objectStore('img').put(dataUrl, id); } catch (e) {}
  return 'u:' + id;
}
export async function loadImages() {
  try {
    const db = await idb(); if (!db) return;
    await new Promise((res) => {
      const tx = db.transaction('img', 'readonly'); const st = tx.objectStore('img');
      const rq = st.openCursor();
      rq.onsuccess = () => { const c = rq.result; if (c) { IMG_CACHE.set(c.key, c.value); c.continue(); } else res(); };
      rq.onerror = () => res();
    });
  } catch (e) {}
}
export function resolveImg(src) {
  if (!src) return '';
  src = legacySrc(src); // an old img/bs path now packed (legacy_img.js)
  if (src.startsWith('u:')) return IMG_CACHE.get(src.slice(2)) || '';
  if (/\.json#\d+$/.test(src)) return bgUrl(src) || ''; // a packed picture (img/fill/*.json#k) — its blob url once the pack is in
  return src;
}
