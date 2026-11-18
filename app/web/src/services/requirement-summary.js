import { getProposal, getProposals, update, onProposalChange } from '../repositories/proposals.js';
import { registerJobHandler, trackJob, getJobRecord, adoptJob, isTerminal, cancelJob } from '../repositories/jobs.js';
import { planForFresh, submitPocJob, requestErrorText, pocCapabilities } from './poc-client.js';
import { getBootstrap } from '../api/bootstrap.js';
import { requirementSources, requirementSourceKey, currentRequirementSummary, savedRequirementSummary, requirementContext, requirementContextText } from '../domain/proposals/requirement-summary.js';
import { hydrateAttachmentSources, cachedAttachmentSource } from './attachment-sources.js';
import { refInfo } from './catalog.js';

export const visibleRequirementSources = p => requirementSources(p, cachedAttachmentSource, ref => {
  const info = refInfo(ref);
  return info ? '@' + info.label + (info.short && info.short !== info.label ? ' (' + info.short + ')' : '') : '@' + ref;
});
export const taskRequirementContext = (p, purpose) => requirementContext(p, purpose, visibleRequirementSources(p));
export const taskRequirementContextText = (p, purpose) => requirementContextText(p, purpose, visibleRequirementSources(p));

const waiting = new Map();
let historyBackfill;
const writable = p => p && !getBootstrap().user?.guest && p._share?.canEdit !== false;

/** A summary job for the requirements as they are now is running (queued · started · waiting for its result). */
export const requirementSummaryBusy = p => p?.requirementSummary?.status === 'pending' && p.requirementSummary.sourceKey === requirementSourceKey(p);
/** A finished summary exists — also when the requirements changed after it (re-summarising is optional) — and none is being made. */
export const requirementSummaryDone = p => !!savedRequirementSummary(p) && !requirementSummaryBusy(p);
/** 다시 요약 has something to do: the requirements changed since the summary, or the last attempt failed. */
export function requirementSummaryStale(p) {
  const result = savedRequirementSummary(p), key = requirementSourceKey(p);
  return !!requirementSources(p).length && !requirementSummaryBusy(p) && (!result || result.source_key !== key || (p.requirementSummary?.status === 'error' && p.requirementSummary.sourceKey === key));
}

registerJobHandler('requirements-summary', {
  trim: result => result,
  onDone(record) {
    const p = getProposal(record.owner.id), result = record.result;
    if (!p || record.meta?.sourceKey !== requirementSourceKey(p)) return 'superseded';
    if (!result?.summary || result.source_key !== record.meta.sourceKey || result.llm?.effective !== 'llm') {
      update(p.id, d => { d.requirementSummary = { ...d.requirementSummary, sourceKey: record.meta.sourceKey, status: 'error', error: '검증된 AI 요약 결과를 받지 못했습니다. 다시 시도해 주세요.' }; }, { touch: false });
      return 'failed';
    }
    update(p.id, d => { d.requirementSummary = { sourceKey: record.meta.sourceKey, status: 'ready', jobId: record.id, result }; }, { touch: false });
    return 'applied';
  },
  onFail(record) {
    const p = getProposal(record.owner.id);
    if (!p || record.meta?.sourceKey !== requirementSourceKey(p)) return 'superseded';
    update(p.id, d => { d.requirementSummary = { ...d.requirementSummary, status: 'error', error: record.error?.message || '요약 작업이 중단됐어요. 다시 시도해 주세요.' }; }, { touch: false });
    return 'failed';
  },
});

/** Restore progress tracking only; opening a board must never submit a new job. */
export function resumeRequirementSummaryJob(p) {
  const summary = p?.requirementSummary;
  if (!writable(p) || summary?.status !== 'pending' || !summary.jobId || summary.sourceKey !== requirementSourceKey(p)) return;
  if (!getJobRecord(summary.jobId)) adoptJob(summary.jobId, { purpose: 'requirements-summary', owner: { type: 'proposal', id: p.id }, meta: { sourceKey: summary.sourceKey } });
}

/**
 * Summarise the saved requirements — never called while typing. Without `force` it only starts the first summary
 * (저장 in the requirements popup): a finished summary of older input stays until the person presses 다시 요약 (force).
 */
export async function ensureRequirementSummary(id, { force = false } = {}) {
  let p = getProposal(id);
  if (!writable(p) || !requirementSources(p).length) return null;
  const key = requirementSourceKey(p), token = id + ':' + key;
  if (!force && currentRequirementSummary(p)) { void hydrateAttachmentSources(p); return p.requirementSummary; }
  if (!force && p.requirementSummary?.sourceKey === key) {
    const summary = p.requirementSummary;
    if (summary.status === 'error') return summary;
    if (summary.jobId && summary.status === 'pending') {
      resumeRequirementSummaryJob(p);
      return summary;
    }
  }
  // A completed summary is regenerated only after the user confirms the change.
  if (!force && savedRequirementSummary(p)) return p.requirementSummary;
  if (waiting.has(token)) return waiting.get(token);
  const request = (async () => {
    const previous = p.requirementSummary;
    update(id, d => { d.requirementSummary = { ...(previous?.result ? { result: previous.result } : {}), sourceKey: key, status: 'pending' }; }, { touch: false });
    if (previous?.jobId && previous.sourceKey !== key && !isTerminal(getJobRecord(previous.jobId)?.status)) void cancelJob(previous.jobId).catch(() => {});
    try {
      await hydrateAttachmentSources(p);
      const plan = await planForFresh('requirements');
      if (!plan.job) throw new Error(plan.note);
      p = getProposal(id);
      if (!p || requirementSourceKey(p) !== key) return null;
      const sources = visibleRequirementSources(p);
      // read into the free-form text (inlined) = already among the sources; only files nobody could read are missing
      const missing_sources = (p.req.files || []).filter(file => !file.inlined && !cachedAttachmentSource(file).trim() && (file.size || file.readError)).map(file => file.name);
      const snap = await submitPocJob({ kind: 'requirements', source_key: key, sources, missing_sources });
      trackJob(snap, { purpose: 'requirements-summary', owner: { type: 'proposal', id }, title: '고객 요구사항 · 제안 전략 요약', meta: { sourceKey: key } });
      if (requirementSourceKey(getProposal(id)) === key) update(id, d => {
        // A very fast job may already have been delivered by the handler.
        if (d.requirementSummary?.status !== 'ready') d.requirementSummary = { ...d.requirementSummary, sourceKey: key, status: 'pending', jobId: snap.id };
      }, { touch: false });
      return getProposal(id)?.requirementSummary;
    } catch (error) {
      const current = getProposal(id);
      if (current && requirementSourceKey(current) === key) update(id, d => { d.requirementSummary = { ...d.requirementSummary, sourceKey: key, status: 'error', error: error.code ? requestErrorText(error) : error.message }; }, { touch: false });
      return getProposal(id)?.requirementSummary;
    }
  })().finally(() => waiting.delete(token));
  waiting.set(token, request);
  return request;
}

/**
 * Consumers get the proposal once its summary is settled: the summary of the current input when one exists, is being
 * made, or can be made (first summary); otherwise the last finished one. Re-summarising after an edit is the person's
 * choice (다시 요약), so a summary of older input never blocks a task — requirementContext marks it stale and the originals win.
 */
export async function withRequirementSummary(p, { signal } = {}) {
  if (!p?.id || !getProposal(p.id) || !requirementSources(p).length || !writable(p)) return p;
  // Older servers can still process the original requirements; never invent a substitute summary.
  if (!pocCapabilities()?.functions?.requirements) return p;
  const key = requirementSourceKey(p);
  await hydrateAttachmentSources(p);
  if (!getProposal(p.id) || requirementSourceKey(getProposal(p.id)) !== key) throw Object.assign(new Error('요구사항이 바뀌었습니다. 다시 실행해 주세요.'), { code: 'context_changed' });
  await ensureRequirementSummary(p.id);
  return new Promise((resolve, reject) => {
    let unsubscribe, timer;
    const finish = (error, value) => { unsubscribe?.(); clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
    const abort = () => finish(Object.assign(new Error('요약 대기를 취소했습니다.'), { code: 'cancelled' }));
    const check = () => {
      const current = getProposal(p.id);
      if (!current || requirementSourceKey(current) !== key) return finish(Object.assign(new Error('요구사항이 바뀌었습니다. 다시 실행해 주세요.'), { code: 'context_changed' }));
      if (currentRequirementSummary(current)) return finish(null, current);
      if (requirementSummaryBusy(current)) return undefined;
      if (savedRequirementSummary(current)) return finish(null, current);
      if (current.requirementSummary?.status === 'error') return finish(Object.assign(new Error(current.requirementSummary.error), { code: 'summary_failed' }));
      return undefined;
    };
    unsubscribe = onProposalChange(d => { if (d.id === p.id) check(); });
    timer = setTimeout(() => {
      const current = getProposal(p.id);
      if (current && savedRequirementSummary(current)) finish(null, current);
      else finish(Object.assign(new Error('요구사항 요약이 계속 진행 중입니다. 완료 후 다시 실행해 주세요.'), { code: 'summary_pending' }));
    }, 90000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else check();
  });
}

/** Kept for App.jsx: requirements are no longer summarised when they change — only on 저장 (first summary) or 다시 요약. */
export function startRequirementSummarySync() { return () => {}; }

/** Fill saved histories without opening each board or changing its original content. */
export function backfillRequirementSummaries({ concurrency = 2, forceErrors = true } = {}) {
  if (historyBackfill) return historyBackfill;
  if (!pocCapabilities()?.functions?.requirements?.ready || getBootstrap().user?.guest) return Promise.resolve({ total: 0, results: [], unavailable: true });
  const queue = getProposals().filter(p => writable(p) && requirementSources(p).length).map(p => p.id);
  const total = queue.length, results = [];
  historyBackfill = Promise.all(Array.from({ length: Math.min(Math.max(1, Math.min(concurrency, 2)), total) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const p = getProposal(id);
      if (!writable(p)) { results.push({ id, status: 'skipped' }); continue; }
      if (currentRequirementSummary(p)) { results.push({ id, status: 'reused' }); continue; }
      try {
        const previous = p.requirementSummary, record = previous?.jobId && getJobRecord(previous.jobId);
        if (savedRequirementSummary(p) && previous.sourceKey !== requirementSourceKey(p)
          || forceErrors && (previous?.status === 'error' || previous?.status === 'pending' && record && isTerminal(record.status))) await ensureRequirementSummary(id, { force: true });
        await withRequirementSummary(getProposal(id) || p);
        const current = getProposal(id);
        results.push({ id, status: current && currentRequirementSummary(current) ? 'generated' : 'skipped' });
      } catch (error) {
        results.push({ id, status: 'error', error: error.message });
      }
    }
  })).then(() => ({ total, results })).finally(() => { historyBackfill = null; });
  return historyBackfill;
}
