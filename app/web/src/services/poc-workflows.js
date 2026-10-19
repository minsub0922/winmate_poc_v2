// Proposal-side PoC workflows: RFP → requirement form choices, Layout Agent (empty Storyboard) and Storyboard
// continuation (parts on the board). Jobs run on the server (repositories/jobs.js follows them); each result is applied
// to its proposal once — the job id is recorded in the proposal (additive field `agent`) together with what was applied.
// A failed job falls back to the original heuristics (ai.js) and says so; a cancelled job just stops.
import { update, getProposal, uid, segPlain } from '../repositories/proposals.js';
import { trackJob, registerJobHandler, getJobRecord, setOutcome } from '../repositories/jobs.js';
import { submitPocJob, planFor, requestErrorText, modeLabel } from './poc-client.js';
import { aiStoryboard, aiExtract, heuristicExtract } from './ai.js';
import { L, refInfo, storyParts } from './catalog.js';
import { PARTS } from '../domain/proposals/parts.js';
import { toast } from '../components/common.jsx';

const refLabel = (r) => { const x = refInfo(r); return x ? x.label : String(r || '').split(':').pop(); };
const segText = (s) => segPlain(s, refLabel);
const agentOf = (d) => { d.agent = d.agent && typeof d.agent === 'object' ? d.agent : {}; d.agent.jobs = { ...(d.agent.jobs || {}) }; return d.agent; };
function markJob(pid, jobId, patch) {
  update(pid, (d) => { const a = agentOf(d); a.jobs[jobId] = { ...(a.jobs[jobId] || {}), ...patch }; }, { touch: false });
}
const modeText = (rec) => { const m = modeLabel(rec && rec.llm, rec && rec.meta && rec.meta.offline); return m ? m.label : '규칙'; };

// ---------------------------------------------------------------- requirements (RFP)
/** Same test the attachment reader uses: is there anything worth putting into the form? */
export const usefulForm = (d) => !!d && (!!(d.project || d.customer || d.target || (d.summary || '').trim()) || (d.keymen || []).some((k) => k && (k.reqs || []).some(Boolean)));
/** Text of the attachments for the backend — full extracted text when this session still has it, else the stored excerpt. */
export function attachmentsText(files, full = {}) {
  return (files || []).filter((f) => (full[f.id] || f.text || '').trim() || (f.memo || '').trim())
    .map((f) => `# ${f.name}\n${f.memo || ''}\n${full[f.id] || f.text || ''}`).join('\n\n');
}
function formToChoice(f) {
  return {
    project: String(f.project || ''), customer: String(f.customer || ''), target: String(f.target || ''),
    keymen: (f.keymen || []).map((k) => ({ name: String(k.name || '담당자'), weight: Number(k.weight || 0), reqs: (k.reqs || []).map(String).filter((x) => x.trim()) })),
    summary: String(f.free || ''), note: String(f.note || ''),
    stats: f.stats ? { items: f.stats.items || 0, merged: f.stats.merged || 0, unassigned: f.stats.unassigned || 0 } : null,
  };
}
/** The original extraction (askJson 'rfp' → heuristicExtract), exactly as the attachment reader does it. */
export async function classicExtract(p) {
  const files = (p && p.req && p.req.files) || [];
  const text = attachmentsText(files);
  if (!text.trim()) return null;
  const r = await aiExtract(text);
  return r.ok && r.data ? r.data : heuristicExtract(files.map((f) => [f.memo, f.text].filter((x) => (x || '').trim()).join('\n')).filter(Boolean).join('\n\n'));
}
/** Submit an RFP job for this proposal. {ok, id} or {ok:false, message} (the caller then uses the original extraction). */
export async function startRfpJob(p, text, { offline = false } = {}) {
  const body = { kind: 'rfp', text: String(text).slice(0, 400000), condition: 'chunk_carry_gap', title: String(p.title || '').slice(0, 120) };
  if (offline) body.offline = true;
  try {
    const snap = await submitPocJob(body);
    trackJob(snap, { purpose: 'rfp', owner: { type: 'proposal', id: p.id }, title: 'RFP 요구사항 정리', meta: { offline } });
    update(p.id, (d) => { const a = agentOf(d); a.jobs[snap.id] = { purpose: 'rfp', at: Date.now() }; a.rfpPending = null; }, { touch: false });
    return { ok: true, id: snap.id };
  } catch (e) {
    return { ok: false, code: e && e.code, message: requestErrorText(e) };
  }
}
export function clearRfpPending(pid) {
  update(pid, (d) => { if (d.agent && d.agent.rfpPending) d.agent = { ...d.agent, rfpPending: null }; }, { touch: false });
}
function setRfpPending(pid, pending) {
  update(pid, (d) => { const a = agentOf(d); a.rfpPending = pending; if (pending.jobId) a.jobs[pending.jobId] = { ...(a.jobs[pending.jobId] || { purpose: 'rfp' }), status: 'done', final: true }; }, { touch: false });
}

registerJobHandler('rfp', {
  trim: (res) => ({
    choices: (res && Array.isArray(res.forms) ? res.forms : []).map(formToChoice),
    guards: res && res.guards ? { items: res.guards.items || 0, grounded_rate: res.guards.grounded_rate } : null,
  }),
  async onDone(rec) {
    const pid = rec.owner && rec.owner.id; const p = getProposal(pid);
    if (!p) return 'orphan';
    const choices = ((rec.result && rec.result.choices) || []).filter(usefulForm);
    if (choices.length) {
      setRfpPending(pid, { jobId: rec.id, source: 'poc', choices, llm: rec.llm || null, guards: (rec.result && rec.result.guards) || null, at: Date.now() });
      toast(choices.length > 1 ? `첨부 RFP에서 사업 ${choices.length}건을 정리했어요 · 고객 요구사항에서 고르세요` : '첨부 RFP를 정리했어요 · 고객 요구사항에서 확인하세요');
      return { outcome: 'delivered', note: modeText(rec) };
    }
    const d0 = await classicExtract(getProposal(pid));
    if (d0 && usefulForm(d0)) {
      setRfpPending(pid, { jobId: rec.id, source: 'classic', choices: [d0], reason: '서버 정리 결과에 요구사항이 없어 기본 규칙으로 읽었어요.', at: Date.now() });
      toast('서버 정리 결과가 비어 기본 규칙으로 읽었어요 · 고객 요구사항에서 확인하세요', 'warn');
      return { outcome: 'fallback', note: 'empty_result' };
    }
    markJob(pid, rec.id, { status: 'done', final: true });
    toast('첨부에서 요구사항을 찾지 못했어요', 'warn');
    return { outcome: 'empty' };
  },
  async onFail(rec) {
    const pid = rec.owner && rec.owner.id; const p = getProposal(pid);
    if (!p) return 'orphan';
    markJob(pid, rec.id, { status: rec.status, final: true });
    if (rec.status === 'cancelled') { toast('요구사항 정리를 멈췄어요'); return 'cancelled'; }
    const why = (rec.error && rec.error.message) || '서버 작업이 실패했어요.';
    const d0 = await classicExtract(getProposal(pid));
    if (d0 && usefulForm(d0)) {
      setRfpPending(pid, { jobId: rec.id, source: 'classic', choices: [d0], reason: why + ' 기본 규칙으로 읽었어요.', at: Date.now() });
      toast('서버 정리가 실패해 기본 규칙으로 읽었어요 · 고객 요구사항에서 확인하세요', 'warn');
      return { outcome: 'fallback', note: why };
    }
    toast('서버 정리가 실패했고 기본 규칙으로도 요구사항을 찾지 못했어요', 'warn');
    return { outcome: 'failed', note: why };
  },
});

// ---------------------------------------------------------------- Storyboard compose (Layout Agent · Storyboard continuation)
export const composeKind = (p) => (storyParts(p).length ? 'storyboard' : 'layout');
function proposalInput(p) {
  const f = p.req.form || {};
  return {
    id: String(p.id), title: p.title || f.project || '', customer: p.customer || f.customer || '', industry: p.ind || null,
    free_text: segText(p.req.free), project: f.project || '', target: f.target || '', note: f.note || '',
    keymen: (f.keymen || []).map((k) => ({ name: (k.name || '').trim() || '담당자', weight: Number(k.weight || 0), reqs: (k.reqs || []).map((r) => segText(r).trim()).filter(Boolean) }))
      .filter((k) => k.reqs.length || k.name !== '담당자'),
    files: (p.req.files || []).filter((x) => (x.text || '').trim() || (x.memo || '').trim()).map((x) => ({ name: x.name, text: (x.text || '').slice(0, 30000), memo: x.memo || '' })),
    products: (p.ctx.products || []).map(String), solutions: (p.ctx.solutions || []).map(String), cases: (p.ctx.cases || []).map(String),
  };
}
function storyboardPayload(p) {
  const f = p.req.form || {};
  return {
    id: p.id, title: p.title || '', customer: p.customer || '', ind: p.ind || null,
    req: { free: p.req.free || [], form: { project: f.project || '', customer: f.customer || '', target: f.target || '', note: f.note || '',
      keymen: (f.keymen || []).map((k) => ({ name: k.name || '', weight: Number(k.weight || 0), reqs: k.reqs || [] })) },
    files: (p.req.files || []).map((x) => ({ name: x.name, memo: x.memo || '', text: (x.text || '').slice(0, 4000) })) },
    ctx: { products: p.ctx.products || [], solutions: p.ctx.solutions || [], cases: (p.ctx.cases || []).map(String) },
    parts: (p.parts || []).map((s) => ({ id: s.id, type: s.type, name: s.name || '', items: s.items || [], form: s.form, text: s.text || '', deck: !!s.deck,
      layouts: (s.layouts || []).map((x) => ({ f: x.f, ov: { t: (x.ov && x.ov.t) || {} } })) })),
  };
}
/**
 * AI로 나머지 구성 through the backend. {mode:'job', id} when a job was started; {mode:'classic', plan, error?} when the
 * caller should run the original flow (dummy / no key / not ready — plan.note says why — or the submit failed).
 */
export async function startCompose(p) {
  const kind = composeKind(p);
  const plan = planFor(kind);
  if (!plan.job) return { mode: 'classic', plan };
  const body = kind === 'layout' ? { kind: 'layout', input: proposalInput(p), interactive: true } : { kind: 'storyboard', proposal: storyboardPayload(p), mode: 'continue' };
  if (plan.offline) body.offline = true;
  try {
    const snap = await submitPocJob(body);
    trackJob(snap, { purpose: 'compose', owner: { type: 'proposal', id: p.id }, title: kind === 'layout' ? 'Layout Agent · 제안서 구성' : 'Storyboard 이어서 구성',
      meta: { kind, baseIds: storyParts(p).map((s) => s.id), inputFingerprint: JSON.stringify(proposalInput(p)), offline: !!plan.offline } });
    update(p.id, (d) => { agentOf(d).jobs[snap.id] = { purpose: 'compose', kind, at: Date.now() }; }, { touch: false });
    return { mode: 'job', id: snap.id, plan };
  } catch (e) {
    return { mode: 'classic', plan, error: requestErrorText(e) };
  }
}
function trimParts(parts, withLayouts) {
  return (Array.isArray(parts) ? parts : []).map((s) => ({
    type: s.type || null, name: String(s.name || ''), items: (s.items || []).map(String).slice(0, 8),
    layouts: withLayouts ? (s.layouts || []).filter((x) => x && x.f).map((x) => ({ f: x.f, status: x.status, ov: { t: (x.ov && x.ov.t) || {}, img: (x.ov && x.ov.img) || {} } })) : [],
  }));
}
function toAppParts(parts, jobId, source) {
  return (parts || []).map((s) => {
    const type = s.type && PARTS[s.type] ? s.type : 'free';
    const items = (s.items || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
    const layouts = (s.layouts || []).filter((x) => x && L[x.f]).map((x) => ({ uid: uid('l'), f: x.f, status: x.status === 'done' ? 'done' : 'partial', ov: { t: { ...((x.ov && x.ov.t) || {}) }, img: { ...((x.ov && x.ov.img) || {}) } } }));
    return { id: uid('s'), type, name: String(s.name || PARTS[type].label).slice(0, 40), items, form: 'list', text: '', done: items.length > 0, layouts, agent: { jobId, source } };
  });
}
/** Put a finished Layout Agent result on the board (once — the proposal remembers the applied job id). */
function applyLayout(rec) {
  const pid = rec.owner.id;
  const parts = toAppParts((rec.result && rec.result.parts) || [], rec.id, 'layout');
  if (!parts.length) return null;
  let n = 0, m = 0;
  update(pid, (d) => {
    const a = agentOf(d);
    if (a.jobs[rec.id] && a.jobs[rec.id].applied) return;
    d.parts.push(...parts); d.stage = 'story';
    n = parts.length; m = parts.reduce((s, x) => s + x.layouts.length, 0);
    a.jobs[rec.id] = { ...(a.jobs[rec.id] || { purpose: 'compose', kind: 'layout' }), status: 'done', applied: true, appliedAt: Date.now(), final: true, parts: n, layouts: m };
  });
  if (n) toast(`Layout Agent가 파트 ${n}개 · 장표 ${m}장을 넣었어요 · ${modeText(rec)}`);
  return { outcome: 'applied', note: `${n} parts · ${m} layouts` };
}
function applyStory(rec) {
  const pid = rec.owner.id; const p = getProposal(pid);
  const seen = new Set(p.parts.map((s) => (s.name || '').trim()).filter(Boolean)); // never repeat a part already on the board
  const parts = toAppParts((rec.result && rec.result.parts) || [], rec.id, 'storyboard').filter((x) => !seen.has(x.name.trim()));
  let n = 0;
  update(pid, (d) => {
    const a = agentOf(d);
    if (a.jobs[rec.id] && a.jobs[rec.id].applied) return;
    if (parts.length) { d.parts.push(...parts); d.stage = 'story'; }
    n = parts.length;
    a.jobs[rec.id] = { ...(a.jobs[rec.id] || { purpose: 'compose', kind: 'storyboard' }), status: 'done', applied: true, appliedAt: Date.now(), final: true, parts: n };
  });
  if (n) toast(`Storyboard에 파트 ${n}개를 이어 넣었어요 · ${modeText(rec)}`);
  else toast('더 이어 갈 파트를 찾지 못했어요', 'warn');
  return { outcome: n ? 'applied' : 'empty' };
}
/** The original AI로 나머지 구성 (askJson 'storyboard' → fallbackStoryboard), run without the board UI. Returns parts added. */
export async function classicCompose(pid) {
  const p = getProposal(pid); if (!p) return 0;
  let n = 0;
  await aiStoryboard(p, {
    onPart: (x) => {
      const part = { id: uid('s'), type: x.type, name: x.name, items: x.items, form: 'list', text: '', done: x.items.length > 0, layouts: [] };
      update(pid, (d) => { d.parts.push(part); d.stage = 'story'; }); n++;
    },
  });
  return n;
}
/** A Layout Agent result held back because the Storyboard changed while it ran — append it now, or drop it. */
export function applyComposePending(jobId) {
  const rec = getJobRecord(jobId);
  if (!rec || rec.outcome !== 'pending' || !getProposal(rec.owner.id)) return;
  const out = applyLayout(rec) || { outcome: 'empty' };
  if (out.outcome === 'empty') toast('넣을 파트가 없었어요', 'warn');
  setOutcome(jobId, out.outcome, out.note || '');
}
export function discardComposePending(jobId) {
  const rec = getJobRecord(jobId); if (!rec) return;
  markJob(rec.owner.id, jobId, { status: 'done', final: true, discarded: true });
  setOutcome(jobId, 'dismissed');
}

registerJobHandler('compose', {
  trim: (res) => {
    if (res && res.app_proposal) {
      const a = res.analysis || {}; const rv = res.review || {};
      return {
        kind: 'layout', parts: trimParts(res.app_proposal.parts, true), slides: (res.slides || []).length, warnings: (res.warnings || []).map(String).slice(0, 6),
        analysis: { level_label: a.level_label || '', industry_name: a.industry_name || '', strategy: a.strategy || '', summary: String(a.summary || '').slice(0, 400) },
        review: res.review ? { req_coverage: rv.req_coverage, must_uncovered: (rv.must_uncovered || []).length, issues: (rv.issues || []).slice(0, 5).map((i) => ({ sev: String(i.sev || ''), msg: String(i.msg || '').slice(0, 200) })) } : null,
      };
    }
    const sb = (res && res.storyboard) || {};
    return { kind: 'storyboard', parts: trimParts(res && res.app_parts, false), strategy: (sb.strategy && sb.strategy.key) || '', thesis: String(sb.thesis || '').slice(0, 200),
      issues: (sb.issues || []).length, warnings: ((res && res.warnings) || []).map(String).slice(0, 6) };
  },
  async onDone(rec) {
    const pid = rec.owner && rec.owner.id; const p = getProposal(pid);
    if (!p) return 'orphan';
    const done = p.agent && p.agent.jobs && p.agent.jobs[rec.id];
    if (done && (done.applied || done.discarded)) return 'applied';
    const t = rec.result || {};
    if (t.kind === 'layout') {
      const now = storyParts(p).map((s) => s.id).join(','); const base = ((rec.meta && rec.meta.baseIds) || []).join(',');
      if (now !== base || (rec.meta?.inputFingerprint && JSON.stringify(proposalInput(p)) !== rec.meta.inputFingerprint)) {
        markJob(pid, rec.id, { status: 'done', pendingSince: Date.now() });
        toast('Layout Agent 결과가 준비됐어요 · 작업 중에 Storyboard가 바뀌어 자동으로 넣지 않았어요', 'warn');
        return { outcome: 'pending' };
      }
      const out = applyLayout(rec);
      if (out) return out;
    } else if ((t.parts || []).length) {
      return applyStory(rec);
    }
    // nothing usable came back — the original flow, visibly
    markJob(pid, rec.id, { status: 'done', final: true });
    const n = await classicCompose(pid);
    toast(n ? `서버 결과에 넣을 파트가 없어 기본 흐름으로 파트 ${n}개를 이어 넣었어요` : '서버 결과에 넣을 파트가 없었어요', 'warn');
    return { outcome: n ? 'fallback' : 'empty', note: 'empty_result' };
  },
  async onFail(rec) {
    const pid = rec.owner && rec.owner.id;
    if (!getProposal(pid)) return 'orphan';
    markJob(pid, rec.id, { status: rec.status, final: true });
    if (rec.status === 'cancelled') { toast('구성 작업을 멈췄어요'); return 'cancelled'; }
    const why = (rec.error && rec.error.message) || '서버 작업이 실패했어요.';
    const n = await classicCompose(pid);
    toast(n ? `서버 작업이 실패해 기본 흐름으로 파트 ${n}개를 이어 넣었어요` : '서버 작업이 실패했고 기본 흐름으로도 이어 갈 파트를 찾지 못했어요', 'warn');
    return { outcome: n ? 'fallback' : 'failed', note: why };
  },
});
