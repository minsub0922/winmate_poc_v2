import { browserStorage, openDatabase } from './browser.js';
// Review history (localStorage) + parsed documents (IndexedDB) + the evaluation runner.
import { useSyncExternalStore } from 'react';
import { uid } from './proposals.js';
import { parseFiles, fileKind } from '../domain/review/parse.js';
import { buildProfile, selectCriteria, ruleSignals, aggregate } from '../domain/review/analyze.js';
import { aiEvaluate, aiSummary, GROUPS } from '../domain/review/ai.js';
import { CR, CAT, CATS, verdictOf } from '../domain/review/criteria.js';
import { DEMO_REVIEWS, DEMO_DOCS } from '../domain/review/seeds.js';

const KEY = 'winmate.v2.reviews';
const MAX = 20;
// Example reviews are added once per seed version — deleting them sticks.
const SEED_KEY = 'winmate.v2.reviews.seedv';
const SEEDV = 1;
function load() {
  let list = [];
  try { const v = JSON.parse(browserStorage.getItem(KEY) || '[]'); if (Array.isArray(v)) list = v.map((r) => (r.status === 'running' ? { ...r, status: 'interrupted' } : r)); } catch (e) {}
  let sv = 0; try { sv = Number(browserStorage.getItem(SEED_KEY) || 0); } catch (e) {}
  if (sv < SEEDV) {
    const have = new Set(list.map((r) => r.id));
    list = [...list, ...DEMO_REVIEWS.filter((r) => !have.has(r.id))].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    try { browserStorage.setItem(SEED_KEY, String(SEEDV)); browserStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }
  return list;
}
let state = { reviews: load() };
const subs = new Set();
let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    let list = state.reviews.slice(0, MAX);
    for (let k = 0; k < 6; k++) {
      try { browserStorage.setItem(KEY, JSON.stringify(list)); return; } catch (e) {
        // quota: thin out the oldest records first
        if (list.length > 3) list = list.slice(0, list.length - 2);
        else list = list.map((r) => ({ ...r, rules: undefined }));
      }
    }
  }, 300);
}
function emit() { for (const f of subs) f(); }
export function useReviews(sel) {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(state));
}
export function getReview(id) { return state.reviews.find((r) => r.id === id); }
function put(r) { state = { reviews: [r, ...state.reviews.filter((x) => x.id !== r.id)].slice(0, MAX + 5) }; persist(); emit(); }
export function patch(id, fn) {
  const i = state.reviews.findIndex((r) => r.id === id); if (i < 0) return;
  const d = { ...state.reviews[i] }; fn(d);
  const list = state.reviews.slice(); list[i] = d; state = { reviews: list }; persist(); emit();
}
export function deleteReview(id) { state = { reviews: state.reviews.filter((r) => r.id !== id) }; persist(); emit(); delDoc(id); }

// ---------- IndexedDB: parsed doc (units, boxes, thumbnails, page images) ----------
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = openDatabase('winmate-v2-review', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('docs');
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
const DOCS = new Map();
async function saveDoc(id, doc) {
  DOCS.set(id, doc);
  try { const db = await idb(); if (db) db.transaction('docs', 'readwrite').objectStore('docs').put(doc, id); } catch (e) {}
}
export async function loadDoc(id) {
  if (DOCS.has(id)) return DOCS.get(id);
  if (DEMO_DOCS[id]) { DOCS.set(id, DEMO_DOCS[id]); return DEMO_DOCS[id]; }
  try {
    const db = await idb(); if (!db) return null;
    const v = await new Promise((res) => { const rq = db.transaction('docs', 'readonly').objectStore('docs').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); });
    if (v) DOCS.set(id, v);
    return v;
  } catch (e) { return null; }
}
async function delDoc(id) { DOCS.delete(id); try { const db = await idb(); if (db) db.transaction('docs', 'readwrite').objectStore('docs').delete(id); } catch (e) {} }

// ---------- runner ----------
const RUNNING = new Map();
export function isRunning(id) { return RUNNING.has(id); }
export function stopReview(id) { const c = RUNNING.get(id); if (c) c.abort(); }

export function startReview(files, settings = {}) {
  const list = Array.from(files);
  const id = uid('r');
  put({ id, createdAt: Date.now(), files: list.map((f) => ({ name: f.name, size: f.size, kind: fileKind(f.name) })), title: list[0] ? list[0].name.replace(/\.[^.]+$/, '') : '제안서', status: 'running', stage: 'parse', step: '파일을 여는 중', groups: {}, settings });
  run(id, { files: list }, settings);
  return id;
}
export async function rerunReview(fromId, settings = {}) {
  const src = getReview(fromId); if (!src) return null;
  const doc = await loadDoc(fromId);
  if (!doc) return { err: '이 평가의 원본 내용을 이 브라우저에서 찾지 못했어요. 파일을 다시 올려 주세요.' };
  const id = uid('r');
  put({ id, createdAt: Date.now(), files: src.files, title: src.title, status: 'running', stage: 'profile', step: '', groups: {}, settings, from: fromId });
  run(id, { doc }, settings);
  return { id };
}
export function retryReview(id) {
  const r = getReview(id); if (!r) return;
  loadDoc(id).then((doc) => {
    if (!doc) { patch(id, (d) => { d.status = 'error'; d.error = '원본 내용이 없어요. 파일을 다시 올려 주세요.'; }); return; }
    patch(id, (d) => { d.status = 'running'; d.stage = 'profile'; d.groups = {}; d.error = null; });
    run(id, { doc, keep: true }, r.settings || {});
  });
}

function slimProfile(x) {
  return {
    kind: x.kind, slides: x.slides, units: x.units, unitLabel: x.unitLabel, visual: x.visual, customer: x.customer, ind: x.ind, indName: x.indName,
    products: x.prodHits.map((h) => ({ model: h.model, name: h.name, count: h.count })), unknownModels: x.unknownModels.slice(0, 12), older: x.older,
    solutions: x.solutions, competitors: x.competitors, figures: x.figures, fontCount: x.fontCount, fonts: x.fonts.slice(0, 8), parts: x.parts,
    linkedReq: x.linkedReq, geomCount: x.geom.length,
  };
}
function unitIndex(doc) {
  return doc.units.map((u) => ({ n: u.n, title: u.title, part: u.part || null, words: u.words, hidden: !!u.hidden, pics: u.nPic, thumb: !!u.thumb, minFont: u.minFont }));
}
function ruleReason(r) { return r && r.notes.length ? r.notes.join(' · ') : '자동 점검에서 눈에 띄는 문제를 찾지 못했어요.'; }
function ruleSummary(agg, results, x) {
  const best = CATS.filter((c) => agg.cats[c.id] != null).sort((a, b) => agg.cats[b.id] - agg.cats[a.id]);
  const pr = agg.priorities.slice(0, 3).map((id) => CR[id].name);
  return {
    verdict: `${verdictOf(agg.overall)} — 종합 ${agg.overall}점`,
    summary: `${best[0] ? best[0].name + '(' + agg.cats[best[0].id] + '점)' : ''}이 가장 탄탄하고, ${best.length > 1 ? best[best.length - 1].name + '(' + agg.cats[best[best.length - 1].id] + '점)' : ''}이 가장 약해요.${pr.length ? ' 먼저 ' + pr.join(' · ') + '부터 보완하세요.' : ''} 자동 점검 규칙으로 채점한 결과라 문장 · 화면의 세부 판단은 AI 평가로 다시 확인하는 게 좋아요.`,
    strengths: Object.entries(results).filter(([, v]) => v.score >= 88).slice(0, 3).map(([k]) => CR[k].name + ' 양호'),
    ai: false,
  };
}

async function run(id, src, settings) {
  const ctl = new AbortController();
  RUNNING.set(id, ctl);
  const t0 = Date.now();
  try {
    let doc = src.doc;
    if (!doc) {
      doc = await parseFiles(src.files, (t) => patch(id, (d) => { d.step = t; }));
      await saveDoc(id, doc);
    } else if (!src.keep) {
      await saveDoc(id, doc);
    }
    patch(id, (d) => { d.stage = 'profile'; d.step = '업종 · 고객사 · 제품 · 장 구성을 파악하는 중'; d.units = unitIndex(doc); d.unitLabel = doc.unitLabel; d.kind = doc.kind; d.pairWarn = doc.pairWarn || null; d.truncatedPages = doc.truncatedPages || 0; });
    const x = buildProfile(doc, settings);
    const sel = selectCriteria(x, settings.override);
    const rules = ruleSignals(doc, x);
    // geometry flags were written onto boxes by buildProfile — keep them for the wireframes
    await saveDoc(id, doc);
    patch(id, (d) => { d.stage = 'ai'; d.step = ''; d.profile = slimProfile(x); d.sel = sel; d.units = unitIndex(doc); d.geom = x.geom.map((g) => ({ u: g.u, kind: g.kind, note: g.note })); });
    const ev = await aiEvaluate(doc, x, sel, rules, { signal: ctl.signal, onGroup: (g, st) => patch(id, (d) => { d.groups = { ...d.groups, [g]: st }; }) });
    const results = {};
    const sel2 = sel.map((s) => ({ ...s }));
    for (const s of sel2) {
      if (!s.applied) continue;
      const a = ev.results[s.id]; const r = rules[s.id];
      if (a && a.na) { s.applied = false; s.why = 'AI 판단: ' + (a.reason || '이 제안서에 맞지 않는 기준'); s.aiNa = true; continue; }
      results[s.id] = a ? { ...a, rule: r } : { score: r ? r.score : 60, reason: ruleReason(r), fix: '', evidence: [], src: 'rule', rule: r };
    }
    const agg = aggregate(sel2, results);
    patch(id, (d) => { d.stage = 'summary'; d.step = '총평을 쓰는 중'; });
    let sum = null;
    if (ev.ai && !ctl.signal.aborted) sum = await aiSummary(doc, x, sel2, results, agg, { signal: ctl.signal });
    patch(id, (d) => {
      d.status = 'done'; d.stage = 'done'; d.step = ''; d.sel = sel2; d.results = results; d.agg = agg; d.summary = sum || ruleSummary(agg, results, x);
      d.ai = ev.ai; d.aiErrors = ev.errors; d.aborted = ctl.signal.aborted; d.ms = Date.now() - t0; d.finishedAt = Date.now();
    });
  } catch (e) {
    console.error(e);
    patch(id, (d) => { d.status = 'error'; d.error = String((e && e.message) || e); });
  } finally {
    RUNNING.delete(id);
  }
}
export { GROUPS, CAT };
