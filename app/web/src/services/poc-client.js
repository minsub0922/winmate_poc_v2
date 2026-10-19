// PoC backend client — capabilities, routing decision and the /api/jobs contract (app/api/poc/routes.py).
// The browser never sees a credential: capabilities only say whether the server has one (provider.available).
import { requestJson, postJson } from '../api/client.js';
import { getBootstrap } from '../api/bootstrap.js';

let live = null; // capabilities fetched after boot (refreshPocCapabilities) win over the bootstrap snapshot

/** Capabilities from /api/bootstrap (or a later refresh). null when the server predates the PoC router. */
export function pocCapabilities() {
  if (live) return live;
  try { const b = getBootstrap(); return (b && b.capabilities) || null; } catch (e) { return null; }
}
export async function refreshPocCapabilities() {
  try { live = await requestJson('/api/poc/capabilities'); } catch (e) { /* keep the bootstrap snapshot */ }
  return pocCapabilities();
}

const REASON = {
  no_capabilities: '서버 AI 기능 정보를 받지 못했어요. 서버 연결을 확인한 뒤 다시 시도해 주세요.',
  dummy: '서버 AI 기능이 꺼져 있어요. 서버 설정을 확인한 뒤 다시 시도해 주세요.',
  no_api_key: '서버에 AI 키가 설정되지 않아 AI 기능을 쓸 수 없어요.',
  provider_disabled: '서버 AI 연결이 꺼져 있어 AI 기능을 쓸 수 없어요.',
  unavailable: '서버 AI 기능이 아직 준비되지 않았어요. 잠시 뒤 다시 시도해 주세요.',
  import_error: '서버 AI 기능을 불러오지 못했어요. 서버 상태를 확인해 주세요.',
  kb_missing: '서버 지식 베이스가 준비되지 않아 AI 기능을 쓸 수 없어요.',
};
export const reasonText = (code) => REASON[code] || '서버 AI 기능을 쓸 수 없어요. 다시 시도해 주세요.';

/**
 * Whether one feature can run on the server right now — there is no local substitute.
 *   { job: true }                      → submit a backend job (real provider ready)
 *   { job: false, reason, note }       → not available: the caller shows `note` with 다시 시도 and changes nothing
 */
export function planFor(feature) {
  const caps = pocCapabilities();
  const fn = caps && caps.functions ? caps.functions[feature] : null;
  if (!fn) return { job: false, reason: 'no_capabilities', note: reasonText('no_capabilities') };
  if (fn.mode && fn.mode !== 'real') return { job: false, reason: 'dummy', note: reasonText('dummy') };
  if (!fn.ready || fn.effective === 'unavailable') {
    const kb = caps.knowledge && caps.knowledge.available === false ? 'kb_missing' : null;
    const code = fn.import_error ? 'import_error' : kb || 'unavailable';
    return { job: false, reason: code, note: reasonText(code) };
  }
  if (!(caps.provider && caps.provider.available)) {
    const code = fn.provider_reason || (caps.provider && caps.provider.reason) || 'no_api_key';
    return { job: false, reason: code, note: reasonText(code) };
  }
  return { job: true, reason: '' };
}
/** planFor, re-reading the capabilities from the server when the snapshot says "not available" (the server may have warmed up since). */
export async function planForFresh(feature) {
  const plan = planFor(feature);
  if (plan.job) return plan;
  await refreshPocCapabilities();
  return planFor(feature);
}

/** Human labels for a job's llm block (requested / effective come from the server, never guessed here). */
export function modeLabel(llm) {
  if (!llm) return null;
  if (llm.effective === 'llm') return { k: 'llm', label: 'AI' };
  if (llm.effective === 'mixed') return { k: 'mixed', label: 'AI 일부 단계 실패' };
  if (llm.effective === 'rules') return { k: 'rules', label: 'AI 호출 실패' };
  return { k: 'rules', label: String(llm.effective || '') };
}
/** A finished job whose result came without any successful model call — never applied as an AI result. */
export const modelFailed = (llm) => !!llm && llm.effective === 'rules';
export const MODEL_FAILED_TEXT = '서버가 AI 응답을 받지 못했어요. 결과를 넣지 않았어요 · 다시 시도해 주세요.';

// ---------------------------------------------------------------- /api/jobs
function err(message, code) { const e = new Error(message); e.code = code; return e; }
export async function submitPocJob(body) {
  const res = await postJson('/api/jobs', body);
  if (res && (res.mode === 'dummy' || res.error)) throw err(res.message || reasonText(res.error || 'dummy'), res.error || 'dummy');
  if (!res || !res.id) throw err('서버가 작업을 만들지 못했어요.', 'bad_response');
  return res;
}
export const fetchPocJob = (id, since = 0) => requestJson(`/api/jobs/${encodeURIComponent(id)}?since=${Math.max(0, since | 0)}`);
export const answerPocJob = (id, answers, useDefaults = false) => postJson(`/api/jobs/${encodeURIComponent(id)}/answer`, { answers: answers || {}, use_defaults: !!useDefaults });
export const cancelPocJob = (id) => postJson(`/api/jobs/${encodeURIComponent(id)}/cancel`, {});

/** Readable Korean message for a failed request (no server internals beyond the redacted detail). */
export function requestErrorText(e) {
  if (!e) return '요청이 실패했어요.';
  if (e.code === 'not_found') return '서버에서 작업을 찾지 못했어요.';
  if (e.code === 'conflict') return '작업 상태가 바뀌어 지금은 처리할 수 없어요.';
  if (e.code === 'dummy') return e.message || reasonText('dummy');
  if (e instanceof TypeError || !e.code) return '서버에 연결하지 못했어요.';
  return e.message || '요청이 실패했어요.';
}

export const retryPocJob = id => postJson(`/api/jobs/${encodeURIComponent(id)}/retry`, {});
