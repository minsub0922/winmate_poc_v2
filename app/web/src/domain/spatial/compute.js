// The server worker and editor use the same scene algorithms and frozen asset revision.
import { createSceneFromForm, studioDocumentFromTemplate } from './studio-form.js';
import { applySpatialCommand } from './command-apply.js';
import { repairNaturalLayout } from './scene.js';
import { addRoom, removeRoom, swapRooms, moveRoom, setRoomStyle } from './room-ops.js';
import { addStudioSelection } from './studio-selection.js';
import { bakeSceneFloor } from '../building/floor-bake.js';

export function buildStartScene(form, library, documentId) {
  try { return { scene: createSceneFromForm(form, library, { documentId }), form, dropped: [] }; } catch (error) {
    if (!form.rooms.some(room => room.products.length)) throw error;
    let rooms = form.rooms.map(room => ({ ...room, products: [] }));
    let scene = createSceneFromForm({ ...form, rooms }, library, { documentId });
    const dropped = [];
    for (const [index, room] of form.rooms.entries()) for (const product of room.products) {
      const next = rooms.map((r, i) => i === index ? { ...r, products: [...r.products, product] } : r);
      try { scene = createSceneFromForm({ ...form, rooms: next }, library, { documentId }); rooms = next; }
      catch { dropped.push(product.productId); }
    }
    return { scene, form: { ...form, rooms }, dropped };
  }
}

export function computeSpatial(input, library) {
  const { kind, form, documentId = 'draft' } = input;
  if (kind === 'form') return { scene: createSceneFromForm(form, library, { documentId }), form };
  if (kind === 'start') return buildStartScene(form, library, documentId);
  if (kind === 'template') {
    const template = library.templates.find(t => t.id === input.templateId);
    if (!template) throw new Error('공간 템플릿을 찾지 못했습니다.');
    return studioDocumentFromTemplate(template, library);
  }
  if (kind === 'command') return applySpatialCommand(input.state, input.plan, library, { basis: input.basis, documentId });
  if (kind === 'repair') return repairNaturalLayout(input.scene, library);
  if (kind === 'selection') return addStudioSelection(input.state.form, input.state.scene, library, input.assetIds, input.roomId, { supportId: input.supportId });
  if (kind === 'floor') return { pack: bakeSceneFloor(input.scene, library, input.meta) };
  if (kind === 'room') {
    const {state,roomId,action} = input, options = { documentId };
    if (action === 'add') return addRoom(state,input.room,library,options);
    if (action === 'remove') return removeRoom(state,roomId,library,options);
    if (action === 'swap') return swapRooms(state,roomId,input.targetId,library,options);
    if (action === 'move') return moveRoom(state,roomId,input.cell,library,options);
    if (action === 'style') return setRoomStyle(state,roomId,input.style);
  }
  throw new Error('지원하지 않는 공간 작업입니다.');
}
