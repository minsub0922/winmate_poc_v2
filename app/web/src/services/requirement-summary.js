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

const waiting = new Map(), timers = new Map();
let historyBackfill;
const writable = p => p && !getBootstrap().user?.guest && p._share?.canEdit !== false;

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

export async function ensureRequirementSummary(id, { force = false } = {}) {
  clearTimeout(timers.get(id)); timers.delete(id);
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
      const missing_sources = (p.req.files || []).filter(file => !cachedAttachmentSource(file).trim() && (file.size || file.readError)).map(file => file.name);
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

/** Consumers wait for this exact input version; an old summary is never silently substituted. */
export async function withRequirementSummary(p, { signal, debounce = false } = {}) {
  if (!p?.id || !getProposal(p.id) || !requirementSources(p).length || !writable(p)) return p;
  // Older servers can still process the original requirements; never invent a substitute summary.
  if (!pocCapabilities()?.functions?.requirements) return p;
  const key = requirementSourceKey(p);
  await hydrateAttachmentSources(p);
  if (debounce && timers.has(p.id)) await new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, 1200);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(Object.assign(new Error('요약 대기를 취소했습니다.'), { code: 'cancelled' })); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  if (!getProposal(p.id) || requirementSourceKey(getProposal(p.id)) !== key) throw Object.assign(new Error('요구사항이 바뀌었습니다. 새 요약을 확인한 뒤 다시 실행해 주세요.'), { code: 'context_changed' });
  await ensureRequirementSummary(p.id);
  const current = getProposal(p.id);
  if (savedRequirementSummary(current) && !currentRequirementSummary(current)
    && !(current.requirementSummary.status === 'pending' && current.requirementSummary.sourceKey === key)) {
    throw Object.assign(new Error('요구사항이 변경됐어요. ‘다시 요약’에서 확인 후 새 요약을 만들어 주세요.'), { code: 'summary_confirmation_required' });
  }
  return new Promise((resolve, reject) => {
    let unsubscribe, timer;
    const finish = (error, value) => { unsubscribe?.(); clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
    const abort = () => finish(Object.assign(new Error('요약 대기를 취소했습니다.'), { code: 'cancelled' }));
    const check = () => {
      const current = getProposal(p.id);
      if (!current || requirementSourceKey(current) !== key) return finish(Object.assign(new Error('요구사항이 바뀌었습니다. 새 요약을 확인한 뒤 다시 실행해 주세요.'), { code: 'context_changed' }));
      if (currentRequirementSummary(current)) return finish(null, current);
      if (current.requirementSummary?.status === 'error') return finish(Object.assign(new Error(current.requirementSummary.error), { code: 'summary_failed' }));
    };
    unsubscribe = onProposalChange(d => { if (d.id === p.id) check(); });
    timer = setTimeout(() => finish(Object.assign(new Error('요구사항 요약이 계속 진행 중입니다. 완료 후 다시 실행해 주세요.'), { code: 'summary_pending' })), 90000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else check();
  });
}

export function startRequirementSummarySync() {
  const off = onProposalChange((p, before) => {
    if (!before || !writable(p) || requirementSourceKey(p) === requirementSourceKey(before)) return;
    clearTimeout(timers.get(p.id));
    if (savedRequirementSummary(p)) { timers.delete(p.id); return; }
    if (requirementSources(p).length) timers.set(p.id, setTimeout(() => { timers.delete(p.id); void ensureRequirementSummary(p.id); }, 1200));
  });
  return () => { off(); for (const timer of timers.values()) clearTimeout(timer); timers.clear(); };
}

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
