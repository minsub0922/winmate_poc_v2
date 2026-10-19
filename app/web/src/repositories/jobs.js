// Background PoC jobs as seen by this browser: which server job belongs to which proposal / review, its log, its
// questions and its result. Jobs run on the server; this store only follows them (polling GET /api/jobs/{id}?since=N),
// survives route changes and reloads (localStorage) and hands each finished result to its purpose handler exactly once.
import { useSyncExternalStore } from 'react';
import { browserStorage } from './browser.js';
import { fetchPocJob, cancelPocJob, answerPocJob } from '../services/poc-client.js';

const KEY = 'winmate.v2.jobs';
const KEEP = 40;          // records kept in this browser
const MAX_EVENTS = 250;   // log lines kept per job
const TERMINAL = new Set(['done', 'error', 'cancelled', 'lost']);
export const isTerminal = (s) => TERMINAL.has(s);
const HANDLERS = new Map(); // purpose → { trim(result, rec), onDone(rec, result), onFail(rec) }
const RESULTS = new Map();  // job id → full result (memory only; the persisted copy is trimmed by the handler)
const POLLED = new Map();   // job id → last poll time
const needsPoll = (r) => !TERMINAL.has(r.status) || (r.status === 'done' && !r.outcome && r.result == null && !RESULTS.has(r.id));
const INFLIGHT = new Set();

function load() {
  try {
    const v = JSON.parse(browserStorage.getItem(KEY) || '[]');
    if (!Array.isArray(v)) return [];
    // a handler that was running when the page closed is run again — handlers are idempotent (they mark what they applied)
    return v.filter((r) => r && r.id).map((r) => (r.outcome === 'handling' ? { ...r, outcome: null } : r));
  } catch (e) { return []; }
}
let state = { jobs: load() };
const subs = new Set();
let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const list = state.jobs.slice(0, KEEP).map((r) => (r.outcome && !['pending', 'handling'].includes(r.outcome) ? { ...r, result: null } : r));
    for (let k = 0; k < 4; k++) {
      try { browserStorage.setItem(KEY, JSON.stringify(list)); return; } catch (e) {
        // quota: drop logs of finished jobs first, then the oldest finished jobs
        for (const r of list) if (TERMINAL.has(r.status)) r.events = (r.events || []).slice(-20);
        if (k >= 1) list.splice(Math.max(1, list.length - 5));
      }
    }
  }, 300);
}
function emit() { for (const f of subs) f(); }
function commit(list) {
  // keep active jobs and unresolved results; evict the oldest settled ones beyond KEEP
  if (list.length > KEEP) {
    const important = (r) => !TERMINAL.has(r.status) || !r.outcome || r.outcome === 'pending';
    let budget = KEEP - list.filter(important).length; // newest settled records first (the list is newest-first)
    list = list.filter((r) => important(r) || budget-- > 0);
  }
  state = { jobs: list }; persist(); emit();
}

/** React: the whole jobs state (stable object until something changes) — filter with useMemo in the component. */
export function useJobsState() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
}
export function getJobRecord(id) { return state.jobs.find((r) => r.id === id) || null; }
export function jobsOf(ownerType, ownerId, purpose = null) {
  return state.jobs.filter((r) => r.owner && r.owner.type === ownerType && r.owner.id === ownerId && (!purpose || r.purpose === purpose));
}
export function patchJob(id, fn) {
  const i = state.jobs.findIndex((r) => r.id === id); if (i < 0) return null;
  const d = { ...state.jobs[i], events: (state.jobs[i].events || []).slice() }; fn(d);
  const list = state.jobs.slice(); list[i] = d; commit(list);
  return d;
}

// ---------------------------------------------------------------- tracking
function blank(id, { purpose, owner, title, meta, kind }) {
  return { id, kind: kind || purpose, purpose, owner, title: title || '', status: 'queued', createdAt: Date.now(), updatedAt: Date.now(), finishedAt: null,
    since: 0, events: [], waiting: null, partial: null, error: null, llm: null, result: null, outcome: null, outcomeNote: '', meta: meta || {}, net: null, hidden: false };
}
/** Start following a job just created by POST /api/jobs (its 202 snapshot). */
export function trackJob(snap, opts) {
  const rec = blank(snap.id, { ...opts, kind: snap.kind, title: opts.title || snap.title });
  commit([rec, ...state.jobs.filter((r) => r.id !== rec.id)]);
  applySnapshot(rec.id, snap);
  schedule(900);
  return getJobRecord(rec.id);
}
/** Follow a job known only by id (e.g. recorded in a proposal / review but missing from this browser's job list). */
export function adoptJob(id, opts) {
  if (!id || getJobRecord(id)) return getJobRecord(id);
  const rec = blank(id, opts); rec.status = 'running';
  commit([rec, ...state.jobs]);
  schedule(300);
  return rec;
}
export function hideJob(id) { patchJob(id, (d) => { d.hidden = true; }); }
export function setOutcome(id, outcome, note = '') { patchJob(id, (d) => { d.outcome = outcome; d.outcomeNote = note; if (outcome !== 'pending') d.result = null; }); }

const STATE_MSG = { queued: '대기열에 들어갔어요', running: '실행 중이에요', waiting: '답을 기다려요', done: '끝났어요', cancelled: '취소됐어요' };
function trimPartial(p) {
  const a = (p && p.analysis) || {};
  return { level_label: a.level_label || '', level_reason: a.level_reason || '', industry_name: a.industry_name || '', summary: String(a.summary || '').slice(0, 400), llm: (p && p.llm) || null };
}
function applySnapshot(id, snap) {
  if (!snap || typeof snap !== 'object') return;
  patchJob(id, (d) => {
    const have = new Set(d.events.map((e) => e.seq));
    for (const e of snap.events || []) {
      if (!e || have.has(e.seq) || (e.type !== 'text' && e.type !== 'state')) continue;
      const message = e.type === 'text' ? String(e.message || '') : e.status === 'error' ? '실패 — ' + String((e.error && e.error.message) || '') : STATE_MSG[e.status] || String(e.status || '');
      d.events.push({ seq: e.seq, t: e.t, type: e.type, message, level: e.level || (e.status === 'error' ? 'error' : 'info'), status: e.status || null });
    }
    d.events = d.events.slice(-MAX_EVENTS);
    if (typeof snap.next_seq === 'number') d.since = Math.max(d.since || 0, snap.next_seq);
    if (snap.status) d.status = snap.status;
    if (snap.kind) d.kind = snap.kind;
    if (snap.title && !d.title) d.title = snap.title;
    d.waiting = snap.status === 'waiting' ? snap.waiting || null : null;
    d.partial = snap.status === 'waiting' && snap.partial ? trimPartial(snap.partial) : snap.status === 'waiting' ? d.partial : null;
    d.error = snap.error || null;
    if (snap.llm) d.llm = snap.llm;
    if (snap.status === 'done' && snap.result != null && !d.outcome && d.result == null) {
      RESULTS.set(id, snap.result);
      const h = HANDLERS.get(d.purpose);
      d.result = h && h.trim ? h.trim(snap.result, d) : null;
      if (snap.result && snap.result.llm) d.llm = snap.result.llm;
    }
    if (TERMINAL.has(d.status) && !d.finishedAt) d.finishedAt = Date.now();
    d.net = null; d.updatedAt = Date.now();
  });
}

// ---------------------------------------------------------------- user actions
export async function cancelJob(id) {
  const snap = await cancelPocJob(id);
  applySnapshot(id, snap);
  schedule(300);
}
export async function answerJob(id, answers, useDefaults = false) {
  const snap = await answerPocJob(id, answers, useDefaults);
  patchJob(id, (d) => { d.status = 'running'; d.waiting = null; });
  applySnapshot(id, snap);
  POLLED.delete(id);
  schedule(300);
}

// ---------------------------------------------------------------- results
export function registerJobHandler(purpose, handler) {
  HANDLERS.set(purpose, handler);
  // results that arrived (or survived a reload) before the handler existed
  for (const r of state.jobs) if (r.purpose === purpose && r.status === 'done' && r.result == null && RESULTS.has(r.id) && handler.trim) patchJob(r.id, (d) => { d.result = handler.trim(RESULTS.get(r.id), d); });
  setTimeout(handleAll, 0);
  if (state.jobs.some(needsPoll)) schedule(500);
}
function handleAll() { for (const r of state.jobs) handle(r); }
async function handle(r) {
  if (r.outcome) return;
  const h = HANDLERS.get(r.purpose);
  if (!h) return;
  const done = r.status === 'done' && (RESULTS.has(r.id) || r.result != null);
  const failed = r.status === 'error' || r.status === 'cancelled' || r.status === 'lost';
  if (!done && !failed) return;
  patchJob(r.id, (d) => { d.outcome = 'handling'; });
  let out = null;
  try {
    out = done ? await h.onDone(getJobRecord(r.id), RESULTS.get(r.id) || null) : await h.onFail(getJobRecord(r.id));
  } catch (e) {
    console.error(e);
    out = { outcome: 'failed', note: String((e && e.message) || e).slice(0, 200) };
  }
  const o = typeof out === 'string' ? { outcome: out } : out || { outcome: 'handled' };
  setOutcome(r.id, o.outcome || 'handled', o.note || '');
  if (o.outcome !== 'pending') RESULTS.delete(r.id);
}

// ---------------------------------------------------------------- polling (runs while any followed job is active)
let timer = null;
function schedule(ms = 1200) { if (timer) return; timer = setTimeout(tick, ms); }
function gapOf(r) {
  if (r.net && r.net.fail) return Math.min(30000, 1500 * 2 ** Math.min(5, r.net.fail));
  return r.status === 'waiting' ? 5000 : 1300;
}
async function tick() {
  timer = null;
  const now = Date.now();
  const active = state.jobs.filter(needsPoll);
  await Promise.all(active.map(async (r) => {
    if (INFLIGHT.has(r.id) || now - (POLLED.get(r.id) || 0) < gapOf(r)) return;
    INFLIGHT.add(r.id); POLLED.set(r.id, now);
    try {
      applySnapshot(r.id, await fetchPocJob(r.id, r.since || 0));
    } catch (e) {
      if (e && e.code === 'not_found') {
        patchJob(r.id, (d) => { d.status = 'lost'; d.finishedAt = Date.now(); d.error = { code: 'lost', message: '서버에서 이 작업을 찾지 못했어요. 서버가 다시 시작됐을 수 있어요.' }; d.events.push({ seq: (d.since || 0) + 0.5, t: null, type: 'state', status: 'lost', level: 'error', message: '서버에서 작업을 찾지 못했어요' }); });
      } else {
        patchJob(r.id, (d) => { d.net = { fail: ((d.net && d.net.fail) || 0) + 1, at: Date.now() }; });
      }
    } finally { INFLIGHT.delete(r.id); }
  }));
  handleAll();
  if (state.jobs.some(needsPoll)) schedule(500);
}
if (state.jobs.some(needsPoll)) schedule(1500);
