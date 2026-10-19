// PoC backend client — capabilities, routing decision and the /api/jobs contract (app/api/poc/routes.py).
// The browser never sees a credential: capabilities only say whether the server has one (provider.available).
import { requestJson, postJson } from '../api/client.js';
import { getBootstrap } from '../api/bootstrap.js';
import { browserStorage } from '../repositories/browser.js';

const TEST_KEY = 'winmate.v2.poc.test';
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

/** Test option: `?poc=offline` or localStorage winmate.v2.poc.test = {"offline":true} → jobs run the real PoC rules with offline:true. */
export function pocTestOptions() {
  try { if (new URLSearchParams(window.location.search).get('poc') === 'offline') return { offline: true }; } catch (e) { /* no location */ }
  try { const v = JSON.parse(browserStorage.getItem(TEST_KEY) || 'null'); if (v && v.offline === true) return { offline: true }; } catch (e) { /* bad json */ }
  return { offline: false };
}
export function setPocTestOptions(v) {
  try { if (v && v.offline) browserStorage.setItem(TEST_KEY, JSON.stringify({ offline: true })); else browserStorage.removeItem(TEST_KEY); } catch (e) { /* storage off */ }
}

const REASON = {
  no_api_key: '서버에 AI 키가 설정되지 않아 기본 규칙으로 처리했어요.',
  provider_disabled: '서버 AI 연결이 꺼져 있어 기본 규칙으로 처리했어요.',
  unavailable: '서버 기능을 쓸 수 없는 상태라 기본 규칙으로 처리했어요.',
  import_error: '서버 기능을 불러오지 못해 기본 규칙으로 처리했어요.',
  kb_missing: '서버 지식 베이스가 준비되지 않아 기본 규칙으로 처리했어요.',
};
export const reasonText = (code) => REASON[code] || '서버 기능을 쓰지 않고 기본 규칙으로 처리했어요.';

/**
 * Where one feature should run right now.
 *   { job: true, offline }               → submit a backend job
 *   { job: false, quiet: true }          → dummy / old server: the original UI, unchanged and silent
 *   { job: false, reason, note }         → configured real but no key / not ready: original heuristics, shown with the reason
 */
export function planFor(feature) {
  const t = pocTestOptions();
  const caps = pocCapabilities();
  const fn = caps && caps.functions ? caps.functions[feature] : null;
  if (t.offline && (!fn || fn.offline_override !== false)) return { job: true, offline: true, reason: 'offline_test', note: '테스트 옵션: 서버 PoC 규칙(오프라인)으로 실행해요' };
  if (!fn) return { job: false, quiet: true, reason: 'no_capabilities' };
  if (fn.mode !== 'real') return { job: false, quiet: true, reason: 'dummy' };
  if (!fn.ready || fn.effective === 'unavailable') {
    const kb = caps.knowledge && caps.knowledge.available === false ? 'kb_missing' : null;
    const code = fn.import_error ? 'import_error' : kb || 'unavailable';
    return { job: false, reason: code, note: reasonText(code) };
  }
  if (!(caps.provider && caps.provider.available)) {
    const code = fn.provider_reason || (caps.provider && caps.provider.reason) || 'no_api_key';
    return { job: false, reason: code, note: reasonText(code) };
  }
  return { job: true, offline: false, reason: '' };
}

/** Human labels for a job's llm block (requested / effective come from the server, never guessed here). */
export function modeLabel(llm, offline = false) {
  if (!llm) return offline ? { k: 'rules', label: '오프라인 규칙' } : null;
  if (llm.effective === 'llm') return { k: 'llm', label: 'AI' };
  if (llm.effective === 'mixed') return { k: 'mixed', label: 'AI + 규칙 대체' };
  if (llm.effective === 'rules') return { k: 'rules', label: llm.requested === 'offline' ? '오프라인 규칙' : '규칙' };
  return { k: 'rules', label: String(llm.effective || '규칙') };
}

// ---------------------------------------------------------------- /api/jobs
function err(message, code) { const e = new Error(message); e.code = code; return e; }
export async function submitPocJob(body) {
  const res = await postJson('/api/jobs', body);
  if (res && res.mode === 'dummy') throw err(res.message || '서버 기능이 더미 모드예요.', 'dummy');
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
  if (e.code === 'dummy') return e.message || '서버 기능이 더미 모드예요.';
  if (e instanceof TypeError || !e.code) return '서버에 연결하지 못했어요.';
  return e.message || '요청이 실패했어요.';
}

// Explicit offline tests use PoC rules; a failed real run returns to the artifact's original fallback.
export const needsClassicFallback = llm => llm?.requested === 'real' && llm.effective === 'rules';
