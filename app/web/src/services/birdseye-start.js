// 조감도 스튜디오 시작 — 시작 팝업(components/birdseye-start.jsx)의 입력을 실행하고 열 경로를 돌려준다.
//   입력(필수): 업종 + 공간 목록. 「제안서 불러오기」로 제안서의 업종 · 공간 구성을 가져올 수 있다.
//   공간 탭: 고른 공간이 놓인 공간 조감도 스튜디오 · 건물 탭: 공간 하나를 한 층으로 쌓은 건물 스튜디오.
//   제품 오브젝트는 제안서에서 시작했을 때만 넣는다 — 제안서에서 고른 제품을 알맞은 공간에(domain/birdseye/start.js assignProducts).
//   그 밖에는 공간에 가구 · 사람만 있고 제품은 하나도 없다.
//   템플릿에서 시작(보조): 업종 템플릿(공간) · 건물 템플릿(건물)은 예전 그대로다.
import { saveSpatialHistory, computeSpatial, loadSpatialTemplate } from './spatial.js';
import { emptyStudioForm, studioFormFromScene, studioFormKey } from '../domain/spatial/studio-form.js';
import { sceneHash } from '../domain/spatial/scene.js';
import { getProposal, getProposals } from '../repositories/proposals.js';
import { catsOf } from './space-plan.js';
import { planGroups, SPACE_KINDS } from '../domain/proposals/space-plan.js';
import { P } from './catalog.js';
import { reqText } from './search.js';
import { createBuilding, pickBuildingPreset, bakeSpaceFloor } from './building-bridge.js';
import { recommendedSpaces, startRooms, assignProducts, namedKinds, spaceKey, MAX_START_SPACES } from '../domain/birdseye/start.js';

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
// 조감도 라이브러리에 없는 업종은 가까운 업종으로 (services/space-plan.js 와 같은 짝)
const NEAR = { SF: 'SV', RG: 'PB', MB: 'VN', MI: 'PB' };
function proposalIndustry(p, library) {
  const ok = (code) => !!code && library.industries.some((i) => i.code === code);
  const group = p.spacePlan?.vertical?.group;
  return [group, NEAR[group], p.ind, NEAR[p.ind]].find(ok) || '';
}
const planSpaces = (p) => planGroups(p.spacePlan, p.ctx?.products || [])?.groups || [];
const physicalProducts = (library) => new Set(library.assets.filter((a) => a.productId && a.physical).map((a) => a.productId));

/**
 * 「제안서 불러오기」 목록 — 내가 편집할 수 있는 제안서, 최근 수정순.
 * industry · spaces 는 폼에 채울 값(공간 구성이 없으면 spaces 는 비어 있다) · placeable 은 3D로 놓을 수 있는 제품 수.
 */
export function storyboardChoices(library) {
  const physical = physicalProducts(library);
  return getProposals().filter((p) => !p._share || p._share.canEdit).map((p) => {
    const industry = proposalIndustry(p, library), products = p.ctx?.products || [];
    return {
      id: p.id, title: (p.customer || '').trim() || (p.title || '').trim() || '이름 없는 제안서', subtitle: p.customer && p.title && p.title !== p.customer ? p.title : '',
      requirement: requirementLine(p),
      industry, industryName: library.industries.find((i) => i.code === industry)?.name || '',
      spaces: planSpaces(p).map((s) => String(s.name).trim()).filter(Boolean).slice(0, MAX_START_SPACES),
      products: products.length, placeable: products.filter((id) => physical.has(id)).length,
      updatedAt: p.updated || p.updatedAt || p.at || 0,
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 업종 + 공간 이름(+ 제안서) → 스튜디오 입력. 제안서가 있으면 그 제안서에서 고른 제품을 공간에 나눈다. */
export function startForm({ industry, spaces, proposalId }, library) {
  if (!library.industries.some((i) => i.code === industry)) throw new Error('업종을 골라 주세요.');
  const names = (spaces || []).map((name) => String(name).trim()).filter(Boolean);
  if (!names.length) throw new Error('공간을 한 개 이상 넣어 주세요.');
  if (names.length > MAX_START_SPACES) throw new Error(`공간은 ${MAX_START_SPACES}개까지 넣을 수 있어요.`);
  const proposal = proposalId ? getProposal(proposalId) : null;
  if (proposalId && !proposal) throw new Error('제안서를 찾지 못했어요.');
  const plan = proposal ? planSpaces(proposal) : [];
  const planned = (name) => plan.find((s) => spaceKey(s.name) === spaceKey(name));
  const kinds = Object.fromEntries(names.map((name) => [name, planned(name)?.kind]).filter(([, kind]) => SPACE_KINDS.includes(kind)));
  const entries = startRooms(names, recommendedSpaces(library, industry), { kinds, industry });
  let rooms = entries.map((entry) => entry.room), unplaced = [], wanted = 0;
  if (proposal) {
    // 선택된 제품이 있는지부터 — 3D 형상이 있는 제품만 공간에 놓을 수 있다
    const physical = physicalProducts(library), ids = (proposal.ctx?.products || []).filter((id) => physical.has(id));
    wanted = ids.length;
    if (ids.length) {
      const categories = new Map((library.verticals || []).flatMap((v) => (v.spaces || []).map((s) => [s.id, s.categories || []])));
      const assigned = assignProducts(entries.map(({ room, spec }) => {
        const space = planned(room.name);
        return { id: room.id, kind: room.kind, spec, planned: space?.products, categories: categories.get(spec?.room.spaceId) || categories.get(space?.id) || [] };
      }), ids, { catsOf, kindsOf: (id) => namedKinds(P[id]?.spaces) });
      rooms = rooms.map((room) => ({ ...room, products: assigned.byRoom.get(room.id) }));
      unplaced = assigned.unplaced;
    }
  }
  const title = proposal ? ((proposal.customer || proposal.title || '제안').trim() + ' · 공간 조감도').slice(0, 150) : '';
  return { form: { ...emptyStudioForm(), title, industry, style: industryStyle(library, industry), rooms }, proposal, wanted, unplaced };
}

export { buildStartScene } from '../domain/spatial/compute.js';

// 시작한 뒤 알려 줄 한 줄 — 제안서에서 시작했을 때만
function productNote(proposal, wanted, missing) {
  if (!proposal) return '';
  if (!wanted) return '제안서에 3D로 놓을 수 있는 제품이 없어 제품 없이 열었어요.';
  const placed = wanted - missing;
  if (!placed) return `제안서 제품 ${missing}종은 맞는 공간이 없어 넣지 않았어요.`;
  return `제안서 제품 ${placed}종을 공간에 넣었어요` + (missing ? ` · ${missing}종은 맞는 공간이 없어 넣지 않았어요` : '');
}
const placedIds = (rooms) => new Set(rooms.flatMap((room) => room.products.map((p) => p.productId)));

/**
 * choice: { type:'spatial'|'building', industry, spaces:[공간 이름], proposalId? }   입력 폼
 *         { type:'spatial', source:'template', template, view } · { type:'building', source:'template' }   템플릿에서 시작
 * @returns { route:{ name, id }, note } — 건물 템플릿 고르기를 닫았거나 중단하면 null
 */
export async function startBirdseyeStudio(choice, { library, signal, onProgress = () => {} } = {}) {
  if (choice.source === 'template') {
    if (choice.type === 'building') { const id = await pickBuildingPreset(); return id ? { route: { name: 'building', id }, note: '' } : null; }
    onProgress('템플릿 조감도를 여는 중');
    const scene = {...await loadSpatialTemplate(choice.template, library)};
    signal?.throwIfAborted();
    const form = {...studioFormFromScene(scene), templateId:choice.template.id};
    scene.formKey = studioFormKey(form);
    scene.contentHash = sceneHash(scene);
    const record = await saveSpatialHistory(scene, choice.view || '3d', null, { form });
    return { route: { name: 'spatial', id: record.id }, note: '' };
  }
  const { form, proposal, wanted } = startForm(choice, library);
  const stamp = Date.now().toString(36);
  if (choice.type === 'building') {
    const packs = [], placed = new Set();
    for (const [index, room] of form.rooms.entries()) {
      if (signal?.aborted) return null;
      onProgress(`공간을 층으로 쌓는 중 (${index + 1}/${form.rooms.length})`);
      const built = await computeSpatial({kind:'start',form:{ ...form, title: room.name, rooms: [room] },documentId:'bld-' + stamp + '-' + index},library,{signal});
      for (const id of placedIds(built.form.rooms)) placed.add(id);
      packs.push({ name: room.name, pack: await bakeSpaceFloor(built.scene, library, { id: 'my:st-' + stamp + '-' + index, name: room.name }) });
    }
    if (signal?.aborted) return null;
    onProgress('건물 스튜디오를 여는 중');
    const industryName = library.industries.find((i) => i.code === form.industry).name;
    const title = (proposal ? (proposal.customer || proposal.title || '제안').trim() + ' · 건물' : industryName + ' 건물').slice(0, 80);
    const id = await createBuilding({ title, floors: packs, vertical: proposal?.spacePlan?.vertical?.id });
    return { route: { name: 'building', id }, note: productNote(proposal, wanted, wanted - placed.size) };
  }
  if (choice.type !== 'spatial') throw new Error('공간과 건물 중 하나를 골라 주세요.');
  onProgress('공간을 배치하는 중');
  const built = await computeSpatial({kind:'start',form,documentId:'start-' + stamp},library,{signal});
  if (signal?.aborted) return null;
  onProgress('스튜디오를 여는 중');
  const record = await saveSpatialHistory(built.scene, '3d', null, { form: built.form });
  return { route: { name: 'spatial', id: record.id }, note: productNote(proposal, wanted, wanted - placedIds(built.form.rooms).size) };
}
