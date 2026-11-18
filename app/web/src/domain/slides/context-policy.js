import {isSpatialLayoutSelection} from '../spatial/storyboard-layout.js';
import { isFixedSheet, isFixedPart, partToc } from '../templates/fixed_content.js';
import { layoutLibraryEntry } from '../templates/layout_library.js';
// Serializable lifecycle shared by every path that inserts or changes a proposal layout.
const digest = value => {
  const text = JSON.stringify(value); let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
export const proposalContextKey = p => digest([p.title, p.customer, p.ind, p.req, p.ctx,
  p.spacePlan?.spaces?.map(s => [s.id, s.name, s.kind, s.products]), p.spacePlan?.scope]);
export const layoutContextKey = (p, part, rootKey = proposalContextKey(p)) => digest([rootKey, part.type, part.name, part.items, part.text]);
/** Compare with the context behind the saved contents, including a queued/failed refresh. */
export function layoutContextChanged(p, part, x) {
  const appliedKey = x?.adaptation?.appliedKey || x?.adaptation?.key;
  return !!appliedKey && appliedKey !== layoutContextKey(p, part);
}
// Whether two copies of a sheet hold the same content must not depend on the order their keys are stored in: a shared
// Storyboard comes back from the server patched key by key (a key it already has keeps its place, a new one goes last), so
// the same content returns in another key order. Read as an edit, that queued the sheet for another AI review, whose
// result differed in key order again — an endless loop. Arrays keep their order; it is part of the content.
// (The context keys above are stored in each sheet's adaptation, so their form is left as it is.)
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const contentDigest = value => digest(canonical(value));
export const layoutContentKey = x => contentDigest([x.f, x.ov, x.ev]);
export const LAYOUT_CONTEXT_VERSION = 3;
// Image overrides and their evidence are direct edits, not a request to rewrite
// the sheet. Keep the full content key above for in-flight result protection.
// 조감도 시트의 배치 형태(spatialMode: 좌우 ↔ 가운데) · 버블 자리(spatialBubbles)는 같은 내용을 다르게 놓을 뿐이다 — 다시 쓸 이유가 아니다.
const layoutNonImageKey = x => contentDigest([x.f, { t: {}, ...x.ov, img: undefined, spatialMode: undefined, spatialBubbles: undefined },
  Object.fromEntries(Object.entries(x.ev || {}).filter(([key]) => !/^i\d+$/.test(key)))]);
export const contextPending = x => ['queued', 'running'].includes(x?.adaptation?.phase);
// 사람이 PPT 레이아웃 추가로 직접 넣은 장은 바로 채우지 않는다: 먼저 이 장에 들어갈 제품 · 솔루션 · 개략 내용을 추론하고(briefing),
// 사람이 그 내용을 확인 · 수정하기를 기다린 뒤(brief) 그 방향(x.brief)으로 채운다 — services/layout-brief.js · components/layout-brief.jsx
export const briefRunning = x => x?.adaptation?.phase === 'briefing';
export const briefWaiting = x => x?.adaptation?.phase === 'brief';
export function queueBrief(x, key) {
  x.adaptation = { version: LAYOUT_CONTEXT_VERSION, origin: 'manual', phase: 'briefing', key, request: Math.random().toString(36).slice(2), queuedAt: Date.now() };
}
export const hasSavedLayoutContent = x => !!(Object.keys(x?.ov?.t || {}).length || Object.keys(x?.ov?.img || {}).length || Object.keys(x?.ev || {}).length || /^L_MY_/.test(x?.f || '') || x?.status === 'done' || x?.adaptation?.previousStatus === 'done');
/**
 * 내용이 고정인 장 — 관리자 「전체 파트」의 완전 고정 · 업종별 고정 파트(제안 개요 · Why Samsung · 서비스)의 장과 자물쇠 장(마무리 · 구독 비교 · 케어 ·
 * 구독 조건 · 결제 — domain/templates/fixed_content.json), 그리고 내용이 들어 있는 도입사례 장(어느 사례를 넣을지만 고르고 내용은 그 사례의 장 그대로).
 * 요구사항 · 연결 항목이 바뀌어도, 새로 넣어도, 다시 시도해도 AI가 다시 쓰지 않는다(레이아웃 자동 구성도 같은 규칙 — composer auto.py fixed_part · case).
 * 고정은 'AI가 채우지 않는다'는 뜻 — 사람은 편집기에서 고칠 수 있고, 고친 내용도 그대로 둔다(사용자 지시 2026-11-17). part: 그 장이 놓인 목차(있으면 파트 고정도 본다)
 */
export const isFixedContentLayout = (x, part = null) => {
  const rule = layoutLibraryEntry(x?.f).fill;
  if (rule === 'fixed') return true;
  if (rule === 'slots') return false;
  return isFixedSheet(x?.f) || (!!x?.f && isFixedPart(partToc(part))) || (x?.f === 'L_VS_CASE' && Object.keys(x.ov?.t || {}).length > 0);
};
/** 고정 장을 '채우기 대기' 대신 그대로 둔다 — 사람이 고친 내용도 그대로 */
export function retainFixedLayout(x, key) {
  x.adaptation = { version: LAYOUT_CONTEXT_VERSION, origin: 'fixed', phase: 'retained', key };
  x.status = 'done';
}
export function queueLayout(x, key, origin = 'context') {
  if (isFixedContentLayout(x)) { retainFixedLayout(x, key); return; }
  const previousStatus = x.adaptation?.previousStatus || x.status;
  const appliedKey = x.adaptation?.appliedKey || x.adaptation?.key;
  x.adaptation = { ...(appliedKey ? { appliedKey } : {}), version: LAYOUT_CONTEXT_VERSION, origin, previousStatus, phase: 'queued', key, request: Math.random().toString(36).slice(2), queuedAt: Date.now() };
  x.status = 'partial';
}
/** Reading history is not a request to regenerate it. Migrate the old eager sweep
 * without changing saved text, images or evidence, or claiming an AI review. */
export function retainHistoryLayouts(p) {
  let changed = false;
  for (const part of p.parts || []) for (const x of part.layouts || []) {
    const old = x.adaptation;
    if (old?.version === LAYOUT_CONTEXT_VERSION) continue;
    // Version 2 automatically regenerated saved sheets after image edits and
    // initial sharing hydration. Those failed/pending jobs are obsolete; retain
    // their contents for review without treating them as a successful AI fill.
    const obsolete = old?.version === 2 && ['error', 'queued', 'running'].includes(old.phase)
      && hasSavedLayoutContent(x);
    if (old?.version === 2 && !obsolete || old && ['ready', 'review'].includes(old.phase)) {
      x.adaptation = { ...old, version: LAYOUT_CONTEXT_VERSION };
    } else {
      x.adaptation = { version: LAYOUT_CONTEXT_VERSION, origin: 'history', phase: 'retained', key: layoutContextKey(p, part),
        ...(old ? { needsReview: true } : {}), ...(old?.error ? { previousError: old.error } : {}) };
      if (old?.previousStatus) x.status = old.previousStatus;
    }
    changed = true;
  }
  return changed;
}
export function markLayoutChanges(draft, original, { untouched = new Set() } = {}) {
  const oldRoot = original ? proposalContextKey(original) : '', root = proposalContextKey(draft);
  const before = new Map((original?.parts || []).flatMap(s => { if(untouched.has(s.id))return [];const key = layoutContextKey(original, s, oldRoot); return (s.layouts || []).map(x => [x.uid, { x, key }]); }));
  for (const part of draft.parts || []) if(!untouched.has(part.id)) for (const x of part.layouts || []) {
    // Explicitly selected aerial layouts keep their authored text and geometry.
    if (x.ov?.spatial||isSpatialLayoutSelection(x)) {
      x.adaptation = { version: LAYOUT_CONTEXT_VERSION, origin: 'spatial', phase: 'retained', key: layoutContextKey(draft, part, root) };
      x.status = x.quality?.status === 'review' ? 'partial' : 'done';
      if (x.quality?.status === 'review') Object.assign(x.adaptation, { phase: 'review', missing: x.quality.issues || [], needsReview: true });
      continue;
    }
    const old = before.get(x.uid), key = layoutContextKey(draft, part, root);
    // 내용 고정 장(제안 개요 · Why Samsung · 서비스 · 구독 자물쇠 장 · 도입사례) — 맥락이 바뀌어도 다시 채우지 않는다(사람이 고친 내용도 그대로)
    if (isFixedContentLayout(x, part)) {
      if (x.adaptation?.origin !== 'fixed' || x.adaptation.key !== key || x.status !== 'done') retainFixedLayout(x, key);
      continue;
    }
    // 직접 넣은 장의 방향을 추론 중이거나 사람의 확인을 기다리는 장 — 확인하기 전에는 채우지 않는다(맥락이 바뀌어도 그대로 기다린다)
    if (briefRunning(x) || briefWaiting(x)) continue;
    // 레이아웃 자동 구성(서버가 덱 전체 계획에 따라 목차별로 쓴 장)은 이미 이 제안서에 맞춰 채워져 들어온다 — 장마다 따로 다시 쓰지 않는다
    // (다시 쓰면 목차 사이에 나눠 둔 내용 · 제품 · 사진이 겹친다). 나중에 요구사항 · 연결 항목이 바뀌면 다른 장과 똑같이 다시 맞춘다.
    if (!old && x.adaptation?.origin === 'compose' && x.adaptation.phase === 'ready') {
      x.adaptation = { version: LAYOUT_CONTEXT_VERSION, origin: 'compose', phase: 'ready', key, appliedKey: key, checkedAt: x.adaptation.checkedAt || Date.now() };
      continue;
    }
    // 자동 구성이 시장 근거로 채웠지만 사람이 원문에서 확인할 것이 남은 장(기준 연도가 인용에 없음 · 업계 사이트 출처): 다시 쓰지 않고 '확인 필요'로 둔다
    if (!old && x.adaptation?.origin === 'compose' && x.adaptation.phase === 'review' && x.adaptation.missing?.length) {
      x.adaptation = { version: LAYOUT_CONTEXT_VERSION, origin: 'compose', phase: 'review', key, appliedKey: key, missing: x.adaptation.missing, checkedAt: x.adaptation.checkedAt || Date.now() };
      x.status = 'partial';
      continue;
    }
    const edited = old && ['ready', 'retained', 'review', 'error'].includes(old.x.adaptation?.phase) && x.adaptation?.phase === old.x.adaptation.phase && layoutNonImageKey(old.x) !== layoutNonImageKey(x);
    // 업종 트렌드 장은 채우는 과정에서 근거의 형태에 맞는 종류의 장으로 바뀔 수 있다(layout-context.js run · swappedFrom) — 그 바뀜은 다시 채울 이유가 아니다
    const swapped = !!old && old.x.f !== x.f && x.adaptation?.swappedFrom === old.x.f && ['ready', 'review'].includes(x.adaptation.phase);
    if (!old || (old.x.f !== x.f && !swapped) || old.key !== key || edited) queueLayout(x, key, !old ? 'added' : 'context');
    if (x.adaptation && (!['ready', 'retained'].includes(x.adaptation.phase) || x.adaptation.missing?.length)) x.status = 'partial';
  }
}
/**
 * 이 장이 아직 이 제안서 값이 아닌 견본을 보이는가 — 시트 상세 · 미리보기의 '샘플 자료' 띠(components/sample-ribbon.jsx).
 * 견본 = 레이아웃 원본의 예시 글 · 사진, 또는 다른 고객의 값(샘플 시나리오 활용 · 찜 · 구성 견본으로 넣은 장)을 그대로 둔 장.
 *  · 이 제안서에 맞춰 한 번이라도 채웠으면(done · ready · review · appliedKey) 견본이 아니다 — 다시 맞추는 중이어도 보이는 것은 이 제안서 값이다.
 *  · 내용이 고정인 장(Why Samsung · 마무리 · 사례)과 조감도 · 내 템플릿 장은 그 내용이 곧 이 제안서 값이다.
 *  · 채우는 중 · 실패라 장 대신 자리표시가 보이면(저장된 내용 없음 — context-slide.jsx) 띠도 없다.
 *  · 예전 장(retained)은 저장된 내용이 없을 때만.
 */
export function sheetShowsSample(x) {
  if (!x?.f || x.status === 'done') return false;
  if (isFixedContentLayout(x) || x.ov?.spatial || isSpatialLayoutSelection(x) || /^L_MY_/.test(x.f)) return false;
  const a = x.adaptation || {};
  if (a.appliedKey || ['ready', 'review'].includes(a.phase)) return false;
  const saved = hasSavedLayoutContent(x);
  if ((contextPending(x) || briefRunning(x) || a.phase === 'error') && !saved) return false;
  if (a.phase === 'retained') return !saved;
  return true;
}
