// 조감도 스튜디오 시작 — 시작 팝업(components/birdseye-start.jsx)에서 고른 갈래를 실행하고 열 경로를 돌려준다.
//   공간: 빈 스튜디오(업종) · 내 Storyboard(요구사항 · DSS → 공간 구성 → 조감도) · 업종 템플릿
//   건물: 직접 구성(빈 건물) · 내 Storyboard(공간 하나 = 한 층) · 건물 템플릿
import { createSpatialDraft, saveSpatialHistory, getSpatialHistory } from './spatial.js';
import { emptyStudioForm, studioDocumentFromTemplate, createSceneFromForm } from '../domain/spatial/studio-form.js';
import { getProposal, getProposals } from '../repositories/proposals.js';
import { loadSpaceData, inferVertical, inferCandidates, inferMapping, savePlan, startBirdseye, birdseyeOf, birdseyeForm, spaceErrorText } from './space-plan.js';
import { planGroups } from '../domain/proposals/space-plan.js';
import { reqText } from './search.js';
import { createBuilding, pickBuildingPreset, bakeSpaceFloor } from './building-bridge.js';

/** 그 업종 템플릿이 가장 많이 쓰는 스타일 */
export function industryStyle(library, industry) {
  const count = {};
  for (const template of library.templates) if (template.industry === industry && template.style) count[template.style] = (count[template.style] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || 'modern';
}

// 요구사항 한 줄 — 자유 입력 원문에서(없으면 제목 · 고객을 뺀 요구사항 문맥에서)
function requirementLine(p) {
  const free = ((p.req && p.req.free) || []).map((part) => (part && part.t) || '').join(' ').replace(/\s+/g, ' ').trim();
  if (free) return free.slice(0, 90);
  const rest = reqText(p).replace(String(p.title || ''), '').replace(String(p.customer || ''), '').replace(/\s+/g, ' ').trim();
  return rest.slice(0, 90);
}
const planned = (p) => !!(p.spacePlan && planGroups(p.spacePlan, p.ctx.products));
/** 시작 팝업의 제안서 목록 — 내가 편집할 수 있는 제안서, 최근 수정순 */
export function storyboardChoices() {
  return getProposals().filter((p) => !p._share || p._share.canEdit).map((p) => {
    const birdseye = birdseyeOf(p);
    return {
      id: p.id, title: (p.customer || '').trim() || (p.title || '').trim() || '이름 없는 제안서', subtitle: p.customer && p.title && p.title !== p.customer ? p.title : '',
      requirement: requirementLine(p),
      products: (p.ctx?.products || []).length, solutions: (p.ctx?.solutions || []).length, cases: (p.ctx?.cases || []).length,
      planned: planned(p), spaces: planned(p) ? p.spacePlan.spaces.length : 0,
      birdseye: !!(birdseye && birdseye.status === 'done' && !birdseye.stale && !birdseye.foreign && birdseye.historyId),
      updatedAt: p.updated || p.updatedAt || p.at || 0,
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 제안서에 공간 구성이 없으면 요구사항 · 연결된 DSS로 그 자리에서 만든다(업종 → 공간 후보 중 첫 후보 → 제품 배치). */
export async function ensureSpacePlan(pid, { signal, onProgress = () => {} } = {}) {
  const p = getProposal(pid);
  if (!p) throw new Error('제안서를 찾지 못했어요.');
  if (planned(p)) return;
  if (!(p.ctx?.products || []).length && !(p.ctx?.solutions || []).length) throw new Error('이 제안서에는 연결된 제품 · 솔루션이 없어요. Storyboard에서 제품 · 솔루션을 먼저 연결해 주세요.');
  const index = await loadSpaceData();
  onProgress('요구사항으로 업종을 추론하는 중');
  const vertical = await inferVertical(p, index, { signal });
  if (!vertical.ok) throw new Error(spaceErrorText(vertical) || '업종을 추론하지 못했어요.');
  const chosen = index.byId.get(vertical.vertical);
  if (!chosen) throw new Error('업종을 추론하지 못했어요.');
  onProgress('공간 구성을 만드는 중');
  const candidates = await inferCandidates(getProposal(pid), index, chosen.id, { signal });
  if (!candidates.ok || !candidates.candidates.length) throw new Error(spaceErrorText(candidates) || '공간 구성을 만들지 못했어요.');
  const candidate = candidates.candidates[0];
  onProgress('공간마다 제품을 배치하는 중');
  const mapping = await inferMapping(getProposal(pid), index, chosen.id, candidate, { signal });
  if (!mapping.ok) throw new Error(spaceErrorText(mapping) || '제품을 공간에 배치하지 못했어요.');
  if (!savePlan(pid, { vertical: chosen, candidate, spaces: mapping.spaces })) throw new Error('이 제안서에 공간 구성을 저장할 권한이 없어요.');
}

/** 제안서의 조감도 히스토리 id — 그 구성으로 만든 최신 조감도가 있으면 그것, 없으면 Storyboard와 같은 방법으로 만든다. */
export async function storyboardBirdseye(pid, options = {}) {
  const { onProgress = () => {} } = options;
  await ensureSpacePlan(pid, options);
  const existing = birdseyeOf(getProposal(pid));
  if (existing && existing.status === 'done' && !existing.stale && !existing.foreign && existing.historyId) {
    try { await getSpatialHistory(existing.historyId); return existing.historyId; } catch { /* 지워진 조감도 — 다시 만든다 */ }
  }
  onProgress('공간 구성으로 조감도를 만드는 중');
  await startBirdseye(pid);
  const made = getProposal(pid)?.spacePlan?.birdseye;
  if (!made || made.status !== 'done' || !made.historyId) throw new Error((made && made.error) || '조감도를 만들지 못했어요.');
  return made.historyId;
}

/** 제안서의 공간 구성 → 공간 하나짜리 장면들(아래층부터, 최대 6개) — 건물의 층이 된다. */
export async function storyboardFloors(pid, library, options = {}) {
  await ensureSpacePlan(pid, options);
  const p = getProposal(pid), { form } = birdseyeForm(p, library);
  return form.rooms.slice(0, 6).map((room, index) => {
    const single = { ...form, title: room.name, rooms: [room] };
    return { name: room.name, scene: createSceneFromForm(single, library, { documentId: 'bld-' + pid + '-' + index }) };
  });
}

/**
 * choice: { type:'spatial', source:'blank', industry } · { type:'spatial', source:'template', template, view } · { type:'spatial', source:'storyboard', proposalId }
 *         { type:'building', source:'blank' } · { type:'building', source:'template' } · { type:'building', source:'storyboard', proposalId }
 * @returns 열 경로({ name, id }) — 건물 템플릿 고르기를 닫으면 null
 */
export async function startBirdseyeStudio(choice, { library, signal, onProgress = () => {} } = {}) {
  if (choice.type === 'spatial') {
    if (choice.source === 'blank') {
      if (!library.industries.some((i) => i.code === choice.industry)) throw new Error('업종을 골라 주세요.');
      onProgress('스튜디오를 여는 중');
      const record = await createSpatialDraft({ ...emptyStudioForm(), industry: choice.industry, style: industryStyle(library, choice.industry) }, '3d');
      return { name: 'spatial', id: record.id };
    }
    if (choice.source === 'template') {
      onProgress('템플릿 조감도를 여는 중');
      const { form, scene } = studioDocumentFromTemplate(choice.template, library);
      const record = await saveSpatialHistory(scene, choice.view || '3d', null, { form });
      return { name: 'spatial', id: record.id };
    }
    if (choice.source === 'storyboard') return { name: 'spatial', id: await storyboardBirdseye(choice.proposalId, { signal, onProgress }) };
  }
  if (choice.type === 'building') {
    if (choice.source === 'blank') { onProgress('건물 스튜디오를 여는 중'); return { name: 'building', id: await createBuilding({ blank: true }) }; }
    if (choice.source === 'template') { const id = await pickBuildingPreset(); return id ? { name: 'building', id } : null; }
    if (choice.source === 'storyboard') {
      const floors = await storyboardFloors(choice.proposalId, library, { signal, onProgress });
      onProgress('공간을 층으로 쌓는 중');
      const p = getProposal(choice.proposalId), packs = [];
      for (const [index, floor] of floors.entries()) packs.push({ name: floor.name, pack: await bakeSpaceFloor(floor.scene, library, { id: 'my:sb-' + choice.proposalId + '-' + index + '-' + Date.now().toString(36), name: floor.name }) });
      const title = ((p.customer || p.title || '제안').trim() + ' · 건물').slice(0, 80);
      return { name: 'building', id: await createBuilding({ title, floors: packs, vertical: p.spacePlan?.vertical?.id }) };
    }
  }
  throw new Error('시작 방법을 골라 주세요.');
}
