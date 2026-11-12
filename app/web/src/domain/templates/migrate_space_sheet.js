// 공간별 제안 장(L_VS_SPACE)은 2026-11-12부터 왼쪽에 공간 사진 칸(사진 1)이 있다. 그 전에 저장한 제안서 · 찜한 장에는
// 사진 1 값이 없어 빈 칸으로 보이므로, 같은 공간(글 1 = 공간 이름)의 표준 제안서 채움에서 공간 사진만 가져와 넣는다.
// 같은 시나리오의 같은 공간을 먼저 찾고, 없으면 이름이 같은 첫 공간. 사람이 넣은 사진(사진 1이 이미 있음)과 글은 그대로 둔다.
import { FILLS } from './scenario_fills.js';

const plain = (v) => String(v?.html ?? v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
let BY = null;
function index() {
  if (BY) return BY;
  BY = new Map();
  for (const [id, list] of Object.entries(FILLS)) for (const x of list || []) {
    const name = x?.f === 'L_VS_SPACE' && x.img?.['1']?.src ? plain(x.t?.['1']) : '';
    if (!name) continue;
    BY.set(id + '\u0000' + name, x.img['1']);
    if (!BY.has(name)) BY.set(name, x.img['1']);
  }
  return BY;
}

/** one page or favourite ({f, ov}) — true when its space photo was added */
export function fillSpacePhoto(item, scenario = '') {
  if (item?.f !== 'L_VS_SPACE' || !item.ov || item.ov.img?.['1']?.src) return false;
  const name = plain(item.ov.t?.['1']);
  const photo = name && (index().get(scenario + '\u0000' + name) || index().get(name));
  if (!photo) return false;
  item.ov.img = { ...(item.ov.img || {}), 1: structuredClone(photo) };
  return true;
}

/** every page of a saved proposal — true when something was added */
export function fillSpacePhotos(proposal) {
  let n = 0;
  for (const part of proposal?.parts || []) for (const item of part.layouts || []) if (fillSpacePhoto(item, proposal.scenario || '')) n++;
  return n > 0;
}
