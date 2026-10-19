// Proposal-side PoC workflows: RFP → requirement form choices, Layout Agent (empty Storyboard) and Storyboard
// continuation (parts on the board). Jobs run on the server (repositories/jobs.js follows them); each result is applied
// to its proposal once — the job id is recorded in the proposal (additive field `agent`) together with what was applied.
// There is no local substitute: a job that fails (or finishes without any successful model call) changes nothing in the
// proposal, says why, and the same button / 다시 시도 submits a new job.
import { update, getProposal, uid, segPlain } from '../repositories/proposals.js';
import { trackJob, registerJobHandler, getJobRecord, setOutcome, hideJob } from '../repositories/jobs.js';
import { retryPocJob, submitPocJob, planForFresh, requestErrorText, modeLabel, modelFailed, MODEL_FAILED_TEXT } from './poc-client.js';
import { L, refInfo, storyParts } from './catalog.js';
import { PARTS } from '../domain/proposals/parts.js';
import { toast } from '../components/common.jsx';

const refLabel = (r) => { const x = refInfo(r); return x ? x.label : String(r || '').split(':').pop(); };
const segText = (s) => segPlain(s, refLabel);
const agentOf = (d) => { d.agent = d.agent && typeof d.agent === 'object' ? d.agent : {}; d.agent.jobs = { ...(d.agent.jobs || {}) }; return d.agent; };
function markJob(pid, jobId, patch) {
  update(pid, (d) => { const a = agentOf(d); a.jobs[jobId] = { ...(a.jobs[jobId] || {}), ...patch }; }, { touch: false });
}
const modeText = (rec) => { const m = modeLabel(rec && rec.llm); return m ? m.label : 'AI'; };

// ---------------------------------------------------------------- requirements (RFP)
/** Same test the attachment reader uses: is there anything worth putting into the form? */
export const usefulForm = (d) => !!d && (!!(d.project || d.customer || d.target || (d.summary || '').trim()) || (d.keymen || []).some((k) => k && (k.reqs || []).some(Boolean)));
/** Text of the attachments for the backend — full extracted text when this session still has it, else the stored excerpt. */
export function attachmentsText(files, full = {}) {
  return (files || []).filter((f) => (full[f.id] || f.text || '').trim() || (f.memo || '').trim())
    .map((f) => `# ${f.name}\n${f.memo || ''}\n${full[f.id] || f.text || ''}`).join('\n\n');
}
export function formToChoice(f) {
  return {
    project: String(f.project || ''), customer: String(f.customer || ''), target: String(f.target || ''),
    keymen: (f.keymen || []).map((k) => ({ name: String(k.name || '담당자'), weight: Number(k.weight || 0), reqs: (k.reqs || []).map(String).filter((x) => x.trim()) })),
    summary: String(f.free || ''), note: String(f.note || ''),
    stats: f.stats ? { items: f.stats.items || 0, merged: f.stats.merged || 0, unassigned: f.stats.unassigned || 0 } : null,
  };
}
/** Submit an RFP job for this proposal (the whole text). {ok, id} or {ok:false, message} — nothing else runs on failure. */
export async function startRfpJob(p, text) {
  const plan = await planForFresh('rfp');
  if (!plan.job) return { ok: false, code: plan.reason, message: plan.note };
  if(String(text).length>400000)return {ok:false,message:'RFP 원문은 400,000자 이하만 지원합니다. 문서를 나눠 첨부하세요.'};
  const body = { kind: 'rfp', text: String(text), condition: 'chunk_carry_gap', title: String(p.title || '').slice(0, 120) };
  try {
    const snap = await submitPocJob(body);
    trackJob(snap, { purpose: 'rfp', owner: { type: 'proposal', id: p.id }, title: 'RFP 요구사항 정리', meta: {} });
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
    if (modelFailed(rec.llm)) {
      markJob(pid, rec.id, { status: 'error', final: true });
      toast('첨부 정리 — ' + MODEL_FAILED_TEXT, 'warn');
      return { outcome: 'failed', note: MODEL_FAILED_TEXT };
    }
    const choices = ((rec.result && rec.result.choices) || []).filter(usefulForm);
    if (choices.length) {
      setRfpPending(pid, { jobId: rec.id, source: 'poc', choices, llm: rec.llm || null, guards: (rec.result && rec.result.guards) || null, at: Date.now() });
      toast(choices.length > 1 ? `첨부 RFP에서 사업 ${choices.length}건을 정리했어요 · 고객 요구사항에서 고르세요` : '첨부 RFP를 정리했어요 · 고객 요구사항에서 확인하세요');
      return { outcome: 'delivered', note: modeText(rec) };
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
    toast('첨부 정리가 실패했어요 · ' + why + ' 다시 시도할 수 있어요', 'warn');
    return { outcome: 'failed', note: why };
  },
});

// ---------------------------------------------------------------- Storyboard compose (Layout Agent · Storyboard continuation)
export const composeKind = (p) => (storyParts(p).length ? 'storyboard' : 'layout');
export function proposalInput(p) {
  const f = p.req.form || {};
  return {
    id: String(p.id), title: p.title || f.project || '', customer: p.customer || f.customer || '', industry: p.ind || null,
    free_text: segText(p.req.free), project: f.project || '', target: f.target || '', note: f.note || '',
    keymen: (f.keymen || []).map((k) => ({ name: (k.name || '').trim() || '담당자', weight: Number(k.weight || 0), reqs: (k.reqs || []).map((r) => segText(r).trim()).filter(Boolean) }))
      .filter((k) => k.reqs.length || k.name !== '담당자'),
    files: (p.req.files || []).filter((x) => (x.text || '').trim() || (x.memo || '').trim()).map((x) => ({ name: x.name, text: x.text || '', memo: x.memo || '' })),
    products: (p.ctx.products || []).map(String), solutions: (p.ctx.solutions || []).map(String), cases: (p.ctx.cases || []).map(String),
  };
}
export function storyboardPayload(p) {
  const f = p.req.form || {};
  return {
    id: p.id, title: p.title || '', customer: p.customer || '', ind: p.ind || null,
    req: { free: p.req.free || [], form: { project: f.project || '', customer: f.customer || '', target: f.target || '', note: f.note || '',
      keymen: (f.keymen || []).map((k) => ({ name: k.name || '', weight: Number(k.weight || 0), reqs: k.reqs || [] })) },
    files: (p.req.files || []).map((x) => ({ name: x.name, memo: x.memo || '', text: x.text || '' })) },
    ctx: { products: p.ctx.products || [], solutions: p.ctx.solutions || [], cases: (p.ctx.cases || []).map(String) },
    parts: (p.parts || []).map((s) => ({ id: s.id, type: s.type, name: s.name || '', items: s.items || [], form: s.form, text: s.text || '', deck: !!s.deck,
      layouts: (s.layouts || []).map((x) => ({ f: x.f, ov: { t: (x.ov && x.ov.t) || {} } })) })),
  };
}
/**
 * AI로 나머지 구성 through the backend. {mode:'job', id} when a job was started; {mode:'error', error} when the server
 * cannot run it right now (not ready · no key · submit failed) — the board is left as it is.
 */
export async function startCompose(p) {
  const kind = composeKind(p);
  const plan = await planForFresh(kind);
  if (!plan.job) return { mode: 'error', plan, error: plan.note };
  const body = kind === 'layout' ? { kind: 'layout', input: proposalInput(p), interactive: true } : { kind: 'storyboard', proposal: storyboardPayload(p), mode: 'continue' };
  try {
    const snap = await submitPocJob(body);
    trackJob(snap, { purpose: 'compose', owner: { type: 'proposal', id: p.id }, title: kind === 'layout' ? 'Layout Agent · 제안서 구성' : 'Storyboard 이어서 구성',
      meta: { kind, baseIds: storyParts(p).map((s) => s.id), inputFingerprint: JSON.stringify(proposalInput(p)) } });
    update(p.id, (d) => { agentOf(d).jobs[snap.id] = { purpose: 'compose', kind, at: Date.now() }; }, { touch: false });
    return { mode: 'job', id: snap.id, plan };
  } catch (e) {
    return { mode: 'error', plan, error: requestErrorText(e) };
  }
}
/**
 * 다시 시도 for a failed job card: submits a new job of the same purpose for the same proposal (nothing on the board or
 * in the form is touched). Returns {ok, message}.
 */
export async function retryProposalJob(rec) {
  const p = rec && rec.owner ? getProposal(rec.owner.id) : null;
  if (!p) return { ok: false, message: '제안서를 찾지 못했어요.' };
  if (rec.purpose === 'rfp') {
    try {
      const snap=await retryPocJob(rec.id);
      trackJob(snap,{purpose:'rfp',owner:rec.owner,title:rec.title,meta:rec.meta});
      update(p.id,d=>{agentOf(d).jobs[snap.id]={purpose:'rfp',at:Date.now()};},{touch:false});
      hideJob(rec.id);
      return {ok:true,id:snap.id};
    } catch(error) { if(!['not_found','conflict'].includes(error.code))return {ok:false,message:requestErrorText(error)}; }
    if((p.req.files||[]).some(f=>(f.extractedChars||0)>(f.text||'').length||f.extractedChars==null&&(f.text||'').length>=20000))return {ok:false,message:'서버의 원문이 만료되었습니다. 긴 파일을 다시 첨부하세요. 일부 본문만으로 다시 실행하지 않습니다.'};
    const text = attachmentsText(p.req.files);
    if (!text.trim()) return { ok: false, message: '다시 읽을 첨부 내용이 없어요.' };
    return startRfpJob(p, text);
  }
  const r = await startCompose(p);
  if(r.mode==='job')hideJob(rec.id);
  return r.mode === 'job' ? { ok: true, id: r.id } : { ok: false, message: r.error || '서버 작업을 시작하지 못했어요.' };
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
    if (modelFailed(rec.llm)) {
      markJob(pid, rec.id, { status: 'error', final: true });
      toast('구성 — ' + MODEL_FAILED_TEXT, 'warn');
      return { outcome: 'failed', note: MODEL_FAILED_TEXT };
    }
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
    markJob(pid, rec.id, { status: 'done', final: true });
    toast('서버 결과에 넣을 파트가 없었어요 · 요구사항을 보강한 뒤 다시 시도해 보세요', 'warn');
    return { outcome: 'empty', note: 'empty_result' };
  },
  async onFail(rec) {
    const pid = rec.owner && rec.owner.id;
    if (!getProposal(pid)) return 'orphan';
    markJob(pid, rec.id, { status: rec.status, final: true });
    if (rec.status === 'cancelled') { toast('구성 작업을 멈췄어요'); return 'cancelled'; }
    const why = (rec.error && rec.error.message) || '서버 작업이 실패했어요.';
    toast('구성 작업이 실패했어요 · ' + why + ' 다시 시도할 수 있어요', 'warn');
    return { outcome: 'failed', note: why };
  },
});
