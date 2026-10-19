import { browserStorage, openDatabase } from './browser.js';
// Review history (localStorage) + parsed documents (IndexedDB) + the evaluation runner.
// The evaluation is the server review (proposal_score, Gemini): the browser parses the file, reads the profile, picks the
// criteria that apply (criteria.js `when`) and measures the layout geometry — all deterministic — then submits one server
// job. The job routes and scores criteria 1 · 2 · 3; the report maps them onto the existing 0~100 scale (1→0 · 2→50 · 3→100)
// for the criteria the server actually scored. No local model call and no rule score: a failed job leaves the review in
// `error` with its parsed document kept for 다시 시도.
import { useSyncExternalStore } from 'react';
import { uid } from './proposals.js';
import { parseFiles, fileKind } from '../domain/review/parse.js';
import { buildProfile, selectCriteria, aggregate } from '../domain/review/analyze.js';
import { CR, CAT, CATS, CRITERIA, verdictOf } from '../domain/review/criteria.js';
import { planForFresh, submitPocJob, cancelPocJob, requestErrorText, modelFailed, MODEL_FAILED_TEXT } from '../services/poc-client.js';
import { trackJob, registerJobHandler, cancelJob, getJobRecord } from './jobs.js';

const KEY = 'winmate.v2.reviews';
const MAX = 20;
/** 1 · 2 · 3 rubric score → the report's 0~100 scale. */
export const RUBRIC_TO_100 = { 1: 0, 2: 50, 3: 100 };
// A server criterion score counts as AI only when the server says the model scored it.
const RULE_MODES = new Set(['rules', 'rules-fallback']);

function onLoad(r) {
  if (!r || r.status !== 'running') return pocOnLoad(r);
  // a server job keeps running across reloads (repositories/jobs.js follows it); anything else was cut off in the browser
  if (r.poc && r.poc.jobId && r.poc.status === 'running') return r;
  return pocOnLoad({ ...r, status: 'interrupted' });
}
function load() {
  try { const v = JSON.parse(browserStorage.getItem(KEY) || '[]'); if (Array.isArray(v)) return v.filter((r) => r && r.id).map(onLoad); } catch (e) {}
  return [];
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
export function deleteReview(id) {
  const r = getReview(id);
  if (r && r.poc && r.poc.jobId && r.poc.status === 'running') cancelPocJob(r.poc.jobId).catch(() => {}); // nobody will read it any more
  state = { reviews: state.reviews.filter((x) => x.id !== id) }; persist(); emit(); delDoc(id);
}

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
  try {
    const db = await idb(); if (!db) return null;
    const v = await new Promise((res) => { const rq = db.transaction('docs', 'readonly').objectStore('docs').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); });
    if (v) DOCS.set(id, v);
    return v;
  } catch (e) { return null; }
}
async function delDoc(id) { DOCS.delete(id); try { const db = await idb(); if (db) db.transaction('docs', 'readwrite').objectStore('docs').delete(id); } catch (e) {} }

// ---------- runner ----------
const RUNNING = new Map(); // local phase only (parse · profile · submit)
export function isRunning(id) {
  if (RUNNING.has(id)) return true;
  const r = getReview(id);
  return !!(r && r.status === 'running' && r.poc && r.poc.status === 'running');
}
/** 멈추기: stops the local phase and asks the server to cancel its job (the review then offers 다시 시도). */
export function stopReview(id) {
  const c = RUNNING.get(id); if (c) c.abort();
  const r = getReview(id);
  if (r && r.poc && r.poc.jobId && r.poc.status === 'running') cancelJob(r.poc.jobId).catch(() => cancelPocJob(r.poc.jobId).catch(() => {}));
}

export function startReview(files, settings = {}) {
  const list = Array.from(files);
  const id = uid('r');
  put({ id, createdAt: Date.now(), files: list.map((f) => ({ name: f.name, size: f.size, kind: fileKind(f.name) })), title: list[0] ? list[0].name.replace(/\.[^.]+$/, '') : '제안서', status: 'running', stage: 'parse', step: '파일을 여는 중', settings });
  run(id, { files: list }, settings);
  return id;
}
export async function rerunReview(fromId, settings = {}) {
  const src = getReview(fromId); if (!src) return null;
  const doc = await loadDoc(fromId);
  if (!doc) return { err: '이 평가의 원본 내용을 이 브라우저에서 찾지 못했어요. 파일을 다시 올려 주세요.' };
  const id = uid('r');
  put({ id, createdAt: Date.now(), files: src.files, title: src.title, status: 'running', stage: 'profile', step: '', settings, from: fromId });
  run(id, { doc }, settings);
  return { id };
}
/** 다시 시도 / 이어서 평가 — the parsed document kept in IndexedDB goes to a new server job; nothing else is reset. */
export function retryReview(id) {
  const r = getReview(id); if (!r) return;
  if (r.poc && r.poc.status === 'running' && r.poc.jobId) return; // the server job is still going
  loadDoc(id).then((doc) => {
    if (!doc) { patch(id, (d) => { d.status = 'error'; d.error = '원본 내용이 이 브라우저에 없어요. 파일을 다시 올려 주세요.'; d.noDoc = true; }); return; }
    patch(id, (d) => { d.status = 'running'; d.stage = 'profile'; d.error = null; });
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

async function run(id, src, settings) {
  const ctl = new AbortController();
  RUNNING.set(id, ctl);
  try {
    let doc = src.doc;
    if (!doc) {
      doc = await parseFiles(src.files, (t) => patch(id, (d) => { d.step = t; }));
      await saveDoc(id, doc);
    } else if (!src.keep) {
      await saveDoc(id, doc);
    }
    if (ctl.signal.aborted) throw Object.assign(new Error('평가를 멈췄어요.'), { code: 'cancelled' });
    patch(id, (d) => { d.stage = 'profile'; d.step = '업종 · 고객사 · 제품 · 장 구성을 파악하는 중'; d.units = unitIndex(doc); d.unitLabel = doc.unitLabel; d.kind = doc.kind; d.pairWarn = doc.pairWarn || null; d.truncatedPages = doc.truncatedPages || 0; });
    const x = buildProfile(doc, settings);
    const sel = selectCriteria(x, settings.override);
    // geometry flags were written onto boxes by buildProfile — keep them for the wireframes
    await saveDoc(id, doc);
    patch(id, (d) => {
      d.stage = 'ai'; d.step = '서버 AI가 기준을 고르고 채점하는 중'; d.profile = slimProfile(x); d.sel = sel; d.units = unitIndex(doc);
      d.geom = x.geom.map((g) => ({ u: g.u, kind: g.kind, note: g.note }));
      d.results = null; d.agg = null; d.summary = null; d.poc = null; d.error = null; d.t0 = Date.now();
    });
    if (ctl.signal.aborted) throw Object.assign(new Error('평가를 멈췄어요.'), { code: 'cancelled' });
    await startPoc(id, doc, x, settings);
  } catch (e) {
    if (!(e && e.code === 'cancelled')) console.error(e);
    patch(id, (d) => { d.status = 'error'; d.error = String((e && e.message) || e); d.cancelled = !!(e && e.code === 'cancelled'); });
  } finally {
    RUNNING.delete(id);
  }
}
// ---------- server review (proposal_score) — r.poc ----------
// r.poc = { status: starting | running | done | failed | cancelled, jobId, sheetMap (PoC sheet n → unit n),
//           llm (server llm block), result (trimmed evaluation), error }
function pocOnLoad(r) {
  if (r && r.poc && r.poc.status === 'starting') {
    return { ...r, status: r.status === 'running' || r.status === 'interrupted' ? 'interrupted' : r.status, poc: { ...r.poc, status: 'failed', error: '페이지를 새로 열면서 서버 평가 요청이 끊겼어요.' } };
  }
  return r;
}
/** The parsed document as the backend review adapter reads it (parse.js units; no thumbnails / page images). */
export function pocDoc(doc, visible) {
  return {
    kind: doc.kind, slides: !!doc.slides, slideWpt: doc.slideWpt || null, meta: { title: (doc.meta && doc.meta.title) || '' },
    units: visible.map((u) => ({
      n: u.n, title: u.title || '', text: String(u.text || ''), hidden: false, footer: u.footer || '', nPic: u.nPic || 0,
      minFont: typeof u.minFont === 'number' ? u.minFont : null, lineSizes: Array.isArray(u.lineSizes) ? u.lineSizes.slice(0, 400) : undefined,
      boxes: (u.boxes || []).slice(0, 160).map((b) => ({ kind: b.kind, text: b.text || '', x: b.x, y: b.y, w: b.w, h: b.h, max: b.max, min: b.min, name: b.name || '' })),
    })),
  };
}
async function startPoc(id, doc, x, settings) {
  const r0 = getReview(id); if (!r0) return;
  const plan = await planForFresh('review');
  if (!plan.job) {
    patch(id, (d) => { d.status = 'error'; d.error = plan.note; d.poc = { status: 'failed', error: plan.note, reason: plan.reason }; });
    return;
  }
  const visible = doc.units.filter((u) => !u.hidden).slice(0, 120);
  const body = {
    kind: 'review', doc: pocDoc(doc, visible),
    context: { title: r0.title || '', customer: settings.customer || x.customer || '', ind: settings.ind || x.ind || undefined, ind_name: x.indName || undefined,
      signals: (settings.reqList || []).map(String).filter((t) => t.trim()).slice(0, 100) },
  };
  patch(id, (d) => { d.poc = { status: 'starting', at: Date.now(), sheetMap: visible.map((u) => u.n), truncated: doc.units.filter((u) => !u.hidden).length > visible.length }; });
  try {
    const snap = await submitPocJob(body);
    trackJob(snap, { purpose: 'review', owner: { type: 'review', id }, title: '제안서 검토 (서버 AI)', meta: {} });
    patch(id, (d) => { d.poc = { ...(d.poc || {}), jobId: snap.id, status: 'running' }; });
  } catch (e) {
    const msg = requestErrorText(e);
    patch(id, (d) => { d.status = 'error'; d.error = msg; d.poc = { ...(d.poc || {}), status: 'failed', error: msg }; });
  }
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));
export function trimPoc(res) {
  const ev = (res && res.evaluation) || {};
  const route = ev.route || {};
  const scores = (ev.scores || []).map((s) => ({
    id: String(s.id || ''), score: [1, 2, 3].includes(Number(s.score)) ? Number(s.score) : null, anchor: String(s.anchor || '').slice(0, 500), improve: String(s.improve || '').slice(0, 300),
    confidence: String(s.confidence || ''), mode: String(s.mode || ''), grounded: typeof s.grounded === 'number' ? s.grounded : null, error: String(s.error || '').slice(0, 160),
    evidence: (Array.isArray(s.evidence) ? s.evidence : []).slice(0, 4).map((e) => ({ sheet: Number(e && e.sheet) || 0, quote: String((e && e.quote) || '').slice(0, 80) })),
  })).filter((s) => s.id);
  const ids = new Set(scores.map((s) => s.id));
  return {
    aggregate: pick(ev.aggregate || {}, ['total', 'band', 'verdict', 'rubric_mean', 'categories', 'n_all', 'n_applicable', 'n_selected', 'n_scored', 'weight_coverage', 'dist', 'low']),
    scores, route: { mode: String(route.mode || ''), error: String(route.error || '').slice(0, 200), selected: (route.selected || []).map(String) },
    rule_pass: (ev.rule_pass || []).map(String), risk: (ev.risk || []).map(String), grounded_mean: typeof ev.grounded_mean === 'number' ? ev.grounded_mean : null,
    auto: Object.fromEntries(Object.entries(ev.auto_checks || {}).filter(([k]) => ids.has(k)).map(([k, v]) => [k, (Array.isArray(v) ? v : []).slice(0, 3).map((t) => String(t).slice(0, 220))])),
    conversion: res && res.conversion ? pick(res.conversion, ['source', 'kind', 'sheets', 'skipped_hidden', 'geometry', 'font_sizes', 'overflow_measured', 'unreliable_criteria', 'note']) : null,
  };
}

/**
 * Server result → the existing report: criteria the server scored with the model become applied criteria with a 0~100
 * score (1→0 · 2→50 · 3→100) and their anchor / improve / evidence; criteria the original selection applied but the server
 * did not route are listed as excluded with that reason. Returns null when no criterion was scored by the model.
 */
export function reportFromServer(trimmed, sel, sheetMap = [], nUnits = 0) {
  const res = trimmed || {};
  const unitOf = (sheet) => { const u = sheetMap[(Number(sheet) || 0) - 1]; return u && u >= 1 && (!nUnits || u <= nUnits) ? u : null; };
  const routed = new Set(((res.route && res.route.selected) || []).map(String));
  const scored = new Map();
  for (const s of res.scores || []) if (CR[s.id] && s.score != null && !RULE_MODES.has(s.mode)) scored.set(s.id, s);
  if (!scored.size) return null;
  const base = Array.isArray(sel) && sel.length ? sel : CRITERIA.map((c) => ({ id: c.id, applied: false, why: '' }));
  const have = new Set(base.map((s) => s.id));
  const sel2 = base.map((s) => {
    if (scored.has(s.id)) return { ...s, applied: true, routed: true, why: s.applied ? s.why : '서버 AI가 이 제안서에 맞는 기준으로 골랐어요' };
    const ruleOnly = (res.scores || []).some((x) => x.id === s.id && RULE_MODES.has(x.mode));
    if (s.applied) return { ...s, applied: false, routed: false, why: ruleOnly ? '서버 AI가 채점하지 못한 기준이에요 · 다시 평가해 보세요' : routed.has(s.id) ? '서버 AI가 고른 기준이지만 점수를 받지 못했어요' : '서버 AI가 이번 평가에서 고르지 않은 기준이에요 (자동 선택: ' + s.why + ')' };
    return { ...s, routed: false };
  });
  for (const id of scored.keys()) if (!have.has(id)) sel2.push({ id, applied: true, routed: true, why: '서버 AI가 이 제안서에 맞는 기준으로 골랐어요' });
  const results = {};
  for (const [id, s] of scored) {
    results[id] = {
      score: RUBRIC_TO_100[s.score], rubric: s.score, reason: s.anchor || '', fix: s.score < 3 ? s.improve || '' : '',
      evidence: (s.evidence || []).map((e) => ({ unit: unitOf(e.sheet), quote: e.quote })).filter((e) => e.unit && e.quote),
      src: 'server', mode: s.mode || 'llm', confidence: s.confidence || '', grounded: s.grounded, notes: (res.auto || {})[id] || [],
    };
  }
  const agg = aggregate(sel2, results);
  return { sel: sel2, results, agg };
}
/** One-paragraph report header made from the server's scores (counts and names only — no new judgement). */
export function serverSummary(trimmed, sel, results, agg) {
  const ag = (trimmed && trimmed.aggregate) || {};
  const best = CATS.filter((c) => agg.cats[c.id] != null).sort((a, b) => agg.cats[b.id] - agg.cats[a.id]);
  const pr = agg.priorities.slice(0, 3).map((id) => CR[id].name);
  const n = Object.keys(results).length;
  const parts = [`서버 AI가 이 제안서에 맞는 기준 ${n}개를 골라 1 · 2 · 3점으로 채점했어요(0 · 50 · 100점으로 환산).`];
  if (best.length > 1) parts.push(`${best[0].name}(${agg.cats[best[0].id]}점)이 가장 높고, ${best[best.length - 1].name}(${agg.cats[best[best.length - 1].id]}점)이 가장 낮아요.`);
  if (pr.length) parts.push(`먼저 ${pr.join(' · ')}부터 보완하세요.`);
  return {
    verdict: String(ag.verdict || '') || `${verdictOf(agg.overall)} — 종합 ${agg.overall}점`,
    summary: parts.join(' '),
    strengths: Object.entries(results).filter(([, v]) => v.rubric === 3).slice(0, 3).map(([k]) => CR[k].name + ' 양호'),
    ai: true, src: 'server',
  };
}
function failReview(id, rec, message, extra = {}) {
  patch(id, (d) => {
    d.status = 'error'; d.stage = 'ai'; d.error = message; d.cancelled = !!extra.cancelled;
    d.poc = { ...(d.poc || {}), jobId: rec.id, status: extra.cancelled ? 'cancelled' : 'failed', llm: rec.llm || null, error: message };
  });
}
registerJobHandler('review', {
  trim: trimPoc,
  onDone(rec) {
    const id = rec.owner && rec.owner.id;
    const r = getReview(id);
    if (!r) return 'orphan';
    if (modelFailed(rec.llm)) { failReview(id, rec, MODEL_FAILED_TEXT); return { outcome: 'failed', note: MODEL_FAILED_TEXT }; }
    const sheetMap = (r.poc && r.poc.sheetMap) || [];
    const out = reportFromServer(rec.result, r.sel, sheetMap, (r.units || []).length);
    if (!out) {
      const msg = '서버 AI가 채점한 기준이 없어요. 다시 시도해 주세요.';
      failReview(id, rec, msg);
      return { outcome: 'failed', note: msg };
    }
    const summary = serverSummary(rec.result, out.sel, out.results, out.agg);
    patch(id, (d) => {
      d.status = 'done'; d.stage = 'done'; d.step = ''; d.sel = out.sel; d.results = out.results; d.agg = out.agg; d.summary = summary;
      d.ai = true; d.scoring = 'server'; d.aiErrors = {}; d.error = null; d.cancelled = false;
      d.ms = d.t0 ? Date.now() - d.t0 : null; d.finishedAt = Date.now();
      d.poc = { ...(d.poc || {}), jobId: rec.id, status: 'done', llm: rec.llm || null, result: rec.result, finishedAt: Date.now(), error: null };
    });
    return 'applied';
  },
  onFail(rec) {
    const id = rec.owner && rec.owner.id;
    if (!getReview(id)) return 'orphan';
    const cancelled = rec.status === 'cancelled';
    failReview(id, rec, cancelled ? '평가를 멈췄어요. 다시 시도하면 처음부터 채점해요.' : (rec.error && rec.error.message) || '서버 평가가 실패했어요.', { cancelled });
    return cancelled ? 'cancelled' : 'failed';
  },
});
/** The job record of a review's server evaluation (null when this browser no longer follows it). */
export const reviewJob = (r) => (r && r.poc && r.poc.jobId ? getJobRecord(r.poc.jobId) : null);
export { CAT };
