// 원문 매칭 — 고객 요구사항을 저장하면 요약과 나란히, 원문에 글로 적힌 제품 · 솔루션 · 공간을 찾아 매칭에 바로 넣는다.
//   1) 추출   원문(자유형식 · 첨부 · 제작자 의견)에서 언급을 뽑는다 — 긴 원문은 조각으로 나눠 묻는다(모델).
//   2) 연결   모델명이 그대로면 바로, 아니면 키워드 검색으로 찾은 비슷한 후보 중에서 고른다(모델). 비슷한 것이 없으면 연결하지 않는다.
//   3) 적용   제품 · 솔루션 → p.ctx, 공간과 공간-제품 관계 → p.spacePlan(공간 구성을 한 것과 같은 모양). 규칙은 domain/proposals/match-extract.js.
// 진행 중인 동안 매칭 카드는 shimmer + '매칭 추론 중'만 보인다(match-area.jsx). 이 탭에서 돌고, 요구사항이 그사이 바뀌면 결과를 버린다.
// 보드를 여는 것만으로는 시작하지 않는다 — 요구사항 저장(requirements.jsx) 또는 '다시 시도'에서만.
import { useSyncExternalStore } from 'react';
import { askJson, aiErrorText } from './ai.js';
import { getProposal, update, segRefs } from '../repositories/proposals.js';
import { ACTIVE_PRODUCTS, SOLUTIONS, IND, refInfo } from './catalog.js';
import { getBootstrap } from '../api/bootstrap.js';
import { requirementSources, requirementSourceKey } from '../domain/proposals/requirement-summary.js';
import { hydrateAttachmentSources, cachedAttachmentSource } from './attachment-sources.js';
import { loadSpaceData } from './space-plan.js';
import { spacePool, groupLabel } from '../domain/proposals/space-plan.js';
import { roomKind } from '../domain/spatial/scene.js';
import { notify } from './notifications.js';
import {
  extractText, chunkText, checkMentions, cleanMentions, mentionCount, catalogIndex, planResolve, askCount, findModelCodes, withCodes,
  checkPicks, cleanPicks, resolveResult, planVertical, applyExtract, addedText, MENTION_SCHEMA, mentionPrompt, PICK_SCHEMA, pickPrompt, EXTRACT_VERSION,
} from '../domain/proposals/match-extract.js';

const TIMEOUT = 120000;       // 이보다 오래 걸리면 멈추고 '다시 시도'를 보여 준다
const STALE_AFTER = 150000;   // 저장된 'pending'이 이만큼 지났는데 이 탭에서 돌고 있지 않으면 중단된 것으로 본다
const PARALLEL = 2;           // 조각을 동시에 묻는 수
const writable = (p) => !!p && !getBootstrap().user?.guest && p._share?.canEdit !== false;

// ---------- 진행 상태 (이 탭) ----------
const running = new Map(); // 제안서 id → { key, ctrl, promise }
const subs = new Set();
const emit = () => { for (const f of subs) f(); };
export const subscribeExtract = (fn) => { subs.add(fn); return () => subs.delete(fn); };
/** 이 제안서의 원문 매칭이 지금 돌고 있는가 */
export const extractBusy = (pid) => running.has(pid);
export const useExtractBusy = (pid) => useSyncExternalStore(subscribeExtract, () => extractBusy(pid));
/**
 * 매칭 카드 아래에 보일 안내 — 실패했거나 중단된 원문 매칭(지금 요구사항 기준)과 그 이유. 없으면 null.
 * 카드가 이 글 옆에 '다시 시도'를 둔다. → { text }
 */
export function extractNotice(p) {
  const st = p && p.matchExtract;
  if (!st || running.has(p.id) || st.sourceKey !== requirementSourceKey(p)) return null;
  if (st.status === 'error') return { text: '원문에서 제품 · 솔루션 · 공간을 찾지 못했어요' + (st.error ? ' · ' + st.error : '') };
  if (st.status === 'pending' && Date.now() - (st.at || 0) > STALE_AFTER) return { text: '원문에서 제품 · 솔루션 · 공간을 찾다가 중단됐어요.' };
  return null;
}

// ---------- 자료 ----------
let indexCache = null;
const catalog = () => (indexCache ||= catalogIndex({ products: ACTIVE_PRODUCTS, solutions: SOLUTIONS }));
const tagLabel = (ref) => { const info = refInfo(ref); return info ? info.label : ''; };
/** 원문의 @태그: 이름(띄어쓰기 없이 · 소문자) → ref */
function taggedMap(p) {
  const out = new Map(), r = p.req || {}, f = r.form || {};
  const refs = [...segRefs(r.free), ...segRefs(f.noteSegs), ...(f.keymen || []).flatMap((k) => (k.reqs || []).flatMap((x) => (Array.isArray(x) ? segRefs(x) : [])))];
  for (const ref of refs) { const label = tagLabel(ref); if (label) out.set(label.toLowerCase().replace(/\s+/g, ''), ref); }
  return out;
}

// ---------- 1. 추출 ----------
async function askMentions(head, body, taxonomy, codes, signal) {
  const { chunks, cut } = chunkText(body);
  const ids = taxonomy.verticals.map((v) => v.id);
  const verticals = taxonomy.verticals.map((v) => [v.id, v.name, groupLabel(taxonomy, v.group), v.size_segment || '-'].join(' | ')).join('\n');
  const answers = new Array(chunks.length).fill(null); let failed = null, next = 0;
  const worker = async () => {
    while (next < chunks.length && !signal.aborted) {
      const i = next++;
      const here = codes.filter((c) => chunks[i].includes(c.code)).map((c) => c.code);
      const r = await askJson(mentionPrompt({ head, chunk: chunks[i], part: i + 1, parts: chunks.length, verticals, codes: here }), {
        feature: 'storyboard', tier: 'quick', stream: false, signal, responseSchema: MENTION_SCHEMA, validate: (d) => checkMentions(d, ids),
      });
      if (r.ok) answers[i] = r.data; else failed = failed || r;
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, worker));
  const got = answers.filter(Boolean);
  if (!got.length && failed) return { ok: false, err: failed.err, detail: failed.detail };
  return { ok: true, mentions: cleanMentions(got, body, { verticalIds: ids }), partial: cut || got.length < chunks.length };
}

// ---------- 실행 ----------
const fail = (err) => Object.assign(new Error(aiErrorText(err)), { code: err });
async function run(pid, key, signal) {
  let p = getProposal(pid);
  await hydrateAttachmentSources(p);
  p = getProposal(pid);
  if (!p || requirementSourceKey(p) !== key) return null;
  const { head, body } = extractText(requirementSources(p, cachedAttachmentSource, (ref) => '@' + (tagLabel(ref) || ref)));
  const taxonomy = await loadSpaceData();
  const index = catalog();
  const apply = (result, verticalId, complete) => {
    const v = verticalId ? taxonomy.byId.get(verticalId) : null;
    let added = null;
    const ok = update(pid, (d) => {
      if (requirementSourceKey(d) !== key) return;
      added = applyExtract(d, result, { vertical: v ? { id: v.id, name: v.name, group: v.group } : null, kindOf: roomKind, complete });
    }, { touch: false });
    return ok ? added : null;
  };
  const EMPTY = { products: [], solutions: [], spaces: [], missed: { products: [], solutions: [] }, near: [] };
  if (!body.trim()) return { added: apply(EMPTY, null, true) };
  // 모델 코드는 코드로 찾는다 — 모델이 실패해도 이 제품들은 연결된다
  const codes = findModelCodes(body, index);
  const industry = p.indName || (p.ind && IND[p.ind] ? IND[p.ind].name : '');
  const first = await askMentions([head, industry ? '앱에서 정한 업종: ' + industry : ''].filter(Boolean).join('\n'), body, taxonomy, codes, signal);
  if (signal.aborted) return null;
  p = getProposal(pid);
  if (!p || requirementSourceKey(p) !== key) return null;
  const blank = () => ({ vertical: null, products: [], solutions: [], spaces: [] });
  const mentions = withCodes(first.ok ? first.mentions : blank(), codes, body);
  // 공간은 사람이 저장한 구성의 업종 안에서, 없으면 추출이 고른 업종 안에서 찾는다
  const verticalId = [planVertical(p), mentions.vertical].find((id) => id && taxonomy.byId.has(id)) || null;
  const pool = verticalId ? spacePool(taxonomy, verticalId) : [];
  if (!first.ok) { // 모델이 답하지 못했다 — 코드로 찾은 것만 넣고 실패로 남긴다('다시 시도')
    const { done, covered } = planResolve(mentions, index, pool, taggedMap(p));
    const added = mentionCount(mentions) ? apply(resolveResult(mentions, done, null, pool, covered), verticalId, false) : null;
    throw Object.assign(fail(first.err), { added });
  }
  if (!mentionCount(mentions)) return { added: apply(EMPTY, null, !first.partial), partial: first.partial };
  const { done, ask, covered } = planResolve(mentions, index, pool, taggedMap(p));
  let picks = null, pickErr = null;
  if (askCount(ask)) {
    const r = await askJson(pickPrompt({ ask, index, pool, text: body }), { feature: 'storyboard', tier: 'quick', stream: false, signal, responseSchema: PICK_SCHEMA, validate: checkPicks });
    if (signal.aborted) return null;
    if (r.ok) picks = cleanPicks(r.data, ask, index, pool); else pickErr = r;
  }
  const result = resolveResult(mentions, done, picks, pool, covered);
  const added = apply(result, verticalId, !pickErr && !first.partial);
  if (!added) return null;
  // 바로 연결되는 것은 넣었지만 비슷한 항목 고르기가 실패했다 — 실패로 남겨 '다시 시도'할 수 있게 한다
  if (pickErr) throw Object.assign(fail(pickErr.err), { added });
  return { added, partial: first.partial, missed: result.missed, near: result.near };
}

/**
 * 지금 저장된 요구사항으로 원문 매칭을 시작한다. 같은 요구사항으로 이미 끝냈으면 하지 않는다(force: 다시 시도).
 * 요구사항이 바뀌어 다시 부르면 앞선 실행은 멈추고 결과를 버린다.
 */
export function ensureMatchExtract(pid, { force = false } = {}) {
  const p = getProposal(pid);
  if (!writable(p) || !requirementSources(p).some((s) => s.id !== 'customer' && s.id !== 'industry')) return Promise.resolve(null);
  const key = requirementSourceKey(p);
  const cur = running.get(pid);
  if (cur && cur.key === key) return cur.promise;
  if (cur) cur.ctrl.abort();
  const st = p.matchExtract;
  if (!force && st && st.sourceKey === key && st.status === 'done' && st.v === EXTRACT_VERSION) return Promise.resolve(st);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), TIMEOUT);
  const mine = () => running.get(pid) && running.get(pid).ctrl === ctrl;
  const mark = (patch) => update(pid, (d) => { if (requirementSourceKey(d) === key) d.matchExtract = { ...(d.matchExtract || {}), sourceKey: key, at: Date.now(), error: undefined, ...patch }; }, { touch: false });
  const entry = { key, ctrl, promise: null };
  running.set(pid, entry); emit(); // 저장된 'pending'보다 먼저 — 그러지 않으면 잠깐 '중단'으로 읽힌다
  if (!mark({ status: 'pending' })) { clearTimeout(timer); running.delete(pid); emit(); return Promise.resolve(null); }
  entry.promise = run(pid, key, ctrl.signal).then((r) => {
    if (!mine()) return null;
    if (!r) { // 멈췄다: 시간 초과면 알리고, 요구사항이 바뀐 것이면 조용히 끝낸다
      if (ctrl.signal.reason === 'timeout') { mark({ status: 'error', error: '원문 매칭이 오래 걸려 멈췄어요.' }); notify('원문 매칭이 오래 걸려 멈췄어요 · 매칭 카드에서 다시 시도할 수 있어요', 'warn'); }
      return null;
    }
    mark({ status: 'done', v: EXTRACT_VERSION });
    const text = r.added ? addedText(r.added) : '';
    if (text) notify(text + (r.partial ? ' · 원문이 길어 일부만 읽었어요' : ''), '', { title: '원문 매칭' });
    return getProposal(pid)?.matchExtract || null;
  }, (e) => {
    if (!mine()) return null;
    const timeout = ctrl.signal.reason === 'timeout';
    const message = timeout ? '원문 매칭이 오래 걸려 멈췄어요.' : (e && e.message) || aiErrorText(e && e.code);
    mark({ status: 'error', error: message });
    const text = e && e.added ? addedText(e.added) : '';
    notify((text ? text + ' · 나머지는 확인하지 못했어요' : '원문에서 제품 · 솔루션 · 공간을 찾지 못했어요') + ' · 매칭 카드에서 다시 시도할 수 있어요', 'warn', { title: '원문 매칭' });
    return null;
  }).finally(() => { clearTimeout(timer); if (mine()) { running.delete(pid); emit(); } });
  return entry.promise;
}
