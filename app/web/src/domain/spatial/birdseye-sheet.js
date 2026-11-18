// 조감도 시트 — 같은 내용을 두 형태로 그린다.
//   side   : 왼쪽 조감도 + 오른쪽 공간 설명 (레이아웃이 그린 그대로)
//   center : 가운데 큰 조감도 + 공간마다 꺽쇠 화살표로 이어진 설명 버블 (ov.spatialMode === 'center')
//            사용자가 끌어 옮긴 버블 자리는 ov.spatialBubbles = { [행 번호(0부터)]: { x, y } } (시트 좌표, 버블 왼쪽 위)
// 대상: L_SPATIAL_2D/3D(공간·제품 연결) · L_VS_BIRD_S3~S6 / B7~B10(표준 제안서 조감도 · 범례).
// 글 칸 번호는 그대로 두고 자리만 옮기므로 편집 · 근거 · PPT 내보내기가 두 형태에서 똑같이 동작한다.
// 좌표는 모두 1280 × 720 시트 기준. 3D로 돌려 보는 덧씌움(components/birdseye-live.jsx)도 이 기하를 그대로 쓴다.
import PINS from '../templates/vertical_std_bird.json' with { type: 'json' };
import { planAnchors } from './scene.js';
import { spatialSlideRows } from './slide-binding.js';

export const SIDE_BOX = { spatial: { x: 64, y: 160, w: 820, h: 490 }, vstd: { x: 64, y: 152, w: 816, h: 496 } };
export const CENTER_STAGE = { x: 64, y: 146, w: 1152, h: 520 };
const IMAGE_MAX_W = 872, BUBBLE = { w: 184, h: 96, gap: 10 };
const INK = '#1428a0';

/** 조감도 시트인지: { kind: 'spatial' | 'vstd', n: 범례 공간 수(vstd) } */
export function birdseyeSheetInfo(f) {
  if (/^L_SPATIAL_(2D|3D)$/.test(f || '')) return { kind: 'spatial' };
  const m = /^L_VS_BIRD_[SB](\d+)$/.exec(f || '');
  return m ? { kind: 'vstd', n: Number(m[1]) } : null;
}

const standardId = (ov) => /^\/assets\/vertical-std\/([a-z0-9_]+)\.webp(?:$|\?)/.exec(ov?.img?.[0]?.src || '')?.[1] || null;
/** 표준 제안서 조감도의 장면 파일 (3D로 돌려 볼 수 있는 공간 조감도만) */
export function standardSceneUrl(ov) {
  const id = standardId(ov);
  return id && PINS[id]?.live ? `/assets/vertical-std/${id}.scene.json` : null;
}

/** 공간 행 — 번호와 그 공간의 이름 · 설명 글 칸 */
export function birdseyeRows(info, ov) {
  if (!info) return [];
  if (info.kind === 'vstd') return Array.from({ length: info.n }, (_, i) => ({ number: i + 1, nameTb: 4 + 2 * i, descTb: 5 + 2 * i }));
  const binding = ov?.spatial;
  if (binding?.version !== 1) return [];
  return spatialSlideRows(binding).slice(0, 6).map(({ room }, i) => ({ number: binding.scene.rooms.indexOf(room) + 1, nameTb: 3 + 2 * i, descTb: 4 + 2 * i, roomId: room.id }));
}

/**
 * 조감도 그림 위 공간 좌표: { width, height, points: [행 순서대로 {x, y, visible}], pinned }
 * pinned: 그림에 번호 핀이 이미 박혀 있다(표준 제안서 이미지). 좌표를 알 수 없으면 null.
 */
export function birdseyeFrame(info, ov) {
  if (!info) return null;
  // 팝업에서 3D로 돌려 보는 동안의 좌표 (저장하지 않는 값 — components/birdseye-live.jsx)
  if (ov?.spatialFrame) return frameOf(ov.spatialFrame.width, ov.spatialFrame.height, ov.spatialFrame.points, false);
  const binding = ov?.spatial?.version === 1 ? ov.spatial : null;
  if (binding) {
    const anchors = binding.view === '3d' ? binding.anchors : { width: 1280, height: 820, ...planAnchors(binding.scene) };
    if (!anchors?.rooms || !(anchors.width > 0) || !(anchors.height > 0)) return null;
    const ids = info.kind === 'vstd' ? legendRoomIds(binding.scene, info.n, binding.roomIds) : birdseyeRows(info, ov).map((r) => r.roomId);
    // 범례 줄이 장면의 방보다 많으면(예전 장 · 공간 수와 다른 범례) 남는 줄은 보이지 않는 점 — 가운데 형태의 버블 수와 점 수가 늘 같게
    const count = info.kind === 'vstd' ? Math.max(info.n, ids.length) : ids.length;
    return frameOf(anchors.width, anchors.height, Array.from({ length: count }, (_, i) => anchors.rooms[ids[i]]), false);
  }
  if (info.kind !== 'vstd') return null;
  const pins = PINS[standardId(ov)];
  if (!pins) return null;
  return frameOf(pins.w, pins.h, Array.from({ length: info.n }, (_, i) => pins.points.find((p) => p.n === i + 1)), true);
}
/**
 * 표준 범례 시트에서 범례 번호 순서대로의 공간 id.
 * 공간 자리를 바꾸면 scene.rooms 의 순서도 바뀌므로, 저장해 둔 순서(roomIds)가 있으면 그것을 따른다 — 번호와 글은 공간을 따라간다.
 */
export function legendRoomIds(scene, n, roomIds) {
  const known = new Set(scene.rooms.map((r) => r.id));
  const kept = Array.isArray(roomIds) && roomIds.length >= n && roomIds.every((id) => known.has(id)) && new Set(roomIds).size === roomIds.length;
  return (kept ? roomIds : scene.rooms.map((r) => r.id)).slice(0, n);
}
const frameOf = (width, height, points, pinned) => ({ width, height, pinned,
  points: points.map((p) => (p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y, visible: p.visible !== false } : { x: 0, y: 0, visible: false })) });

/** 그림(frame)을 상자 안에 contain 으로 넣었을 때의 실제 그림 상자 */
export function fitFrame(frame, box, maxW = box.w) {
  const k = Math.min(Math.min(box.w, maxW) / frame.width, box.h / frame.height), w = frame.width * k, h = frame.height * k;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, k };
}
export const mapFramePoint = (image, p) => ({ x: image.x + p.x * image.k, y: image.y + p.y * image.k });

/**
 * 가운데 형태의 기하.
 * image: 그림 상자 · bubbles: 행 순서대로 설명 버블 · links: 공간 → 버블 꺽쇠 경로(보이는 공간만, path 는 버블 쪽에서 공간 쪽으로 네 점).
 */
export function centerGeometry(frame, count = frame.points.length, placed = null) {
  const image = fitFrame(frame, CENTER_STAGE, IMAGE_MAX_W);
  const targets = frame.points.slice(0, count).map((p) => ({ ...mapFramePoint(image, p), visible: p.visible }));
  // 왼쪽에 있는 공간은 왼쪽 버블로 — 보이지 않는 공간은 남는 자리에
  const order = targets.map((_, i) => i).sort((a, b) => (targets[b].visible - targets[a].visible) || (targets[a].x - targets[b].x) || (a - b));
  const seen = order.filter((i) => targets[i].visible), hidden = order.filter((i) => !targets[i].visible);
  const leftCount = Math.ceil(count / 2), left = seen.slice(0, Math.min(seen.length, Math.ceil(seen.length / 2))), right = seen.slice(left.length);
  for (const i of hidden) (left.length < leftCount ? left : right).push(i);
  while (left.length > leftCount) right.unshift(left.pop());
  while (right.length > count - leftCount) left.push(right.shift());
  const bubbles = new Array(count);
  for (const [side, ids] of [['left', left], ['right', right]]) {
    ids.sort((a, b) => (targets[b].visible - targets[a].visible) || (targets[a].y - targets[b].y) || (a - b));
    const total = ids.length * BUBBLE.h + (ids.length - 1) * BUBBLE.gap, top = CENTER_STAGE.y + (CENTER_STAGE.h - total) / 2;
    const x = side === 'left' ? CENTER_STAGE.x : CENTER_STAGE.x + CENTER_STAGE.w - BUBBLE.w;
    ids.forEach((i, j) => {
      bubbles[i] = { index: i, side, order: j, of: ids.length, x, y: top + j * (BUBBLE.h + BUBBLE.gap), w: BUBBLE.w, h: BUBBLE.h };
    });
  }
  // 사용자가 끌어 옮긴 버블: 그 자리에 두고, 공간이 있는 쪽 변에서 선이 나온다
  for (let i = 0; i < count; i++) {
    const p = placed?.[i]; if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const at = clampBubble(p), aim = targets[i].visible ? targets[i].x : image.x + image.w / 2;
    bubbles[i] = { index: i, side: at.x + BUBBLE.w / 2 <= aim ? 'left' : 'right', order: 0, of: 1, x: at.x, y: at.y, w: BUBBLE.w, h: BUBBLE.h, placed: true };
  }
  const links = bubbles.map((b, i) => centerLink(b, targets[i])).filter(Boolean);
  return { image, bubbles, links, targets };
}
/** 버블 자리를 무대 안으로 */
export const clampBubble = (p) => ({ x: Math.max(CENTER_STAGE.x, Math.min(CENTER_STAGE.x + CENTER_STAGE.w - BUBBLE.w, p.x)), y: Math.max(CENTER_STAGE.y, Math.min(CENTER_STAGE.y + CENTER_STAGE.h - BUBBLE.h, p.y)) });

/** 버블 하나와 그 공간을 잇는 꺽쇠 경로 (버블 쪽 → 공간 쪽 네 점). 보이지 않는 공간이면 null. */
export function centerLink(bubble, target) {
  if (!bubble || !target || target.visible === false) return null;
  const dir = bubble.side === 'left' ? 1 : -1, edge = bubble.side === 'left' ? bubble.x + bubble.w : bubble.x;
  // 공간이 버블 높이 안에 있으면 곧게, 아니면 버블 변에서 가장 가까운 높이에서 나와 한 번 꺾는다
  const cy = Math.max(bubble.y + 16, Math.min(bubble.y + bubble.h - 16, target.y));
  // 위로 꺾이는 선은 아래 버블일수록, 아래로 꺾이는 선은 위 버블일수록 바깥에서 꺾어 서로 엇갈리지 않게
  const rank = target.y < cy ? bubble.order : bubble.of - 1 - bubble.order;
  let mid = edge + dir * (16 + 10 * rank);
  if ((target.x - mid) * dir < 0) mid = (target.x - edge) * dir > 8 ? target.x : edge + dir * 8;
  return { index: bubble.index, side: bubble.side, path: [{ x: edge, y: cy }, { x: mid, y: cy }, { x: mid, y: target.y }, { x: target.x, y: target.y }], target: { x: target.x, y: target.y } };
}

/** 좌우 형태에서 그림 위 공간 좌표 (핀 자리) */
export function sidePoints(info, frame) {
  const image = fitFrame(frame, SIDE_BOX[info.kind]);
  return { image, targets: frame.points.map((p) => ({ ...mapFramePoint(image, p), visible: p.visible })) };
}

// ── 시트 DOM 에 적용 ─────────────────────────────────────────────────────
const px = (el, key) => parseFloat(el.style[key]) || 0;
const overlay = (root, type, css, before = null) => {
  const el = root.ownerDocument.createElement('div');
  el.setAttribute('data-birdseye-overlay', type); el.style.cssText = 'position:absolute;pointer-events:none;' + css;
  root.insertBefore(el, before); return el;
};
const numberPin = (root, t, number) => {
  const pin = overlay(root, 'pin', `left:${t.x - 11}px;top:${t.y - 11}px;width:22px;height:22px;border-radius:50%;background:${INK};color:#ffffff;text-align:center;line-height:22px;font-size:11px;font-weight:700;font-family:Manrope,'Noto Sans KR',sans-serif;box-shadow:0 0 0 2px #ffffff`);
  pin.textContent = String(number); return pin;
};
function domInfo(root) {
  if (root.hasAttribute('data-spatial-template')) return { kind: 'spatial' };
  const slot = root.querySelector('[data-img="0"][data-kind="plan"]');
  if (!slot || !/조감도/.test(slot.getAttribute('data-hint') || '')) return null;
  const n = Array.from(root.children).filter((el) => el.getAttribute('data-layout-shape') === 'circle' && px(el, 'left') >= 900).length;
  return n >= 3 && n <= 10 && root.querySelector(`[data-tb="${5 + 2 * (n - 1)}"]`) ? { kind: 'vstd', n } : null;
}

/** applyOverrides 가 부른다 — 조감도 시트가 아니면 아무것도 하지 않는다. */
export function applyBirdseyeSheet(root, ov) {
  if (!root?.querySelector) return;
  const info = domInfo(root); if (!info) return;
  const frame = birdseyeFrame(info, ov), rows = birdseyeRows(info, ov);
  root.querySelectorAll('[data-birdseye-overlay]').forEach((el) => el.remove());
  root.setAttribute('data-birdseye-sheet', info.kind);
  root.setAttribute('data-birdseye-mode', 'side');
  if (!frame || !rows.length) return;
  const slot = root.querySelector(info.kind === 'spatial' ? '[data-spatial-slot]' : '[data-img="0"]');
  if (!slot) return;
  if (ov?.spatialMode !== 'center') {
    // 표준 범례 시트에 사용자가 돌린 조감도(핀 없는 스냅샷)가 들어 있으면 번호 핀을 다시 얹는다
    if (info.kind === 'vstd' && !frame.pinned) sidePoints(info, frame).targets.forEach((t, i) => { if (t.visible) numberPin(root, t, rows[i].number); });
    return;
  }
  root.setAttribute('data-birdseye-mode', 'center');
  const geo = centerGeometry(frame, rows.length, ov.spatialBubbles);
  // 오른쪽 범례 영역: 이름 · 설명 칸만 남기고 숨긴다
  const keep = new Set(rows.flatMap((r) => [String(r.nameTb), String(r.descTb)]));
  const side = SIDE_BOX[info.kind];
  for (const el of Array.from(root.children)) {
    if (el === slot || el.hasAttribute('data-birdseye-overlay')) continue;
    const left = px(el, 'left'), top = px(el, 'top');
    if (el.hasAttribute('data-spatial-overlay') || (left >= side.x + side.w && top >= side.y - 12 && top < side.y + side.h && !keep.has(el.getAttribute('data-tb')))) el.style.display = 'none';
  }
  overlay(root, 'stage', `left:${CENTER_STAGE.x}px;top:${CENTER_STAGE.y}px;width:${CENTER_STAGE.w}px;height:${CENTER_STAGE.h}px;border-radius:16px;background:#f3f5f3`, slot);
  Object.assign(slot.style, { left: geo.image.x + 'px', top: geo.image.y + 'px', width: geo.image.w + 'px', height: geo.image.h + 'px', background: 'transparent', borderRadius: '0px' });
  const after = slot.nextSibling;
  rows.forEach((row, i) => {
    const b = geo.bubbles[i];
    overlay(root, 'card', `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;box-sizing:border-box;border-radius:12px;background:#ffffff;border:1px solid #d5dae2`, after);
    const badge = overlay(root, 'badge', `left:${b.x + 12}px;top:${b.y + 12}px;width:22px;height:22px;border-radius:50%;background:${INK};color:#ffffff;text-align:center;line-height:22px;font-size:11px;font-weight:800;font-family:Manrope,'Noto Sans KR',sans-serif`, after);
    badge.textContent = String(row.number);
    const name = root.querySelector(`[data-tb="${row.nameTb}"]`), desc = root.querySelector(`[data-tb="${row.descTb}"]`);
    if (name) Object.assign(name.style, { display: 'block', left: b.x + 42 + 'px', top: b.y + 12 + 'px', width: b.w - 54 + 'px', fontSize: '14px', lineHeight: '22px', minHeight: '0px', maxHeight: '22px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
    if (desc) Object.assign(desc.style, { display: 'block', left: b.x + 12 + 'px', top: b.y + 42 + 'px', width: b.w - 24 + 'px', fontSize: '12px', lineHeight: '1.4', minHeight: '0px', maxHeight: '51px', whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'clip' });
  });
  for (const link of geo.links) drawLink(root, link, frame.pinned ? null : rows[link.index].number);
}

/** 꺽쇠 연결선: 공간(점 · 번호 핀) → 꺾은 선 → 버블 쪽 화살촉 */
function drawLink(root, link, number) {
  const [a, b, c, d] = link.path, w = 2, h = w / 2;
  const seg = (p, q) => overlay(root, 'link', p.y === q.y
    ? `left:${Math.min(p.x, q.x) - h}px;top:${p.y - h}px;width:${Math.abs(q.x - p.x) + w}px;height:${w}px;background:${INK}`
    : `left:${p.x - h}px;top:${Math.min(p.y, q.y) - h}px;width:${w}px;height:${Math.abs(q.y - p.y) + w}px;background:${INK}`);
  const dir = link.side === 'left' ? 1 : -1, tip = { x: a.x + dir * 1, y: a.y }, base = { x: a.x + dir * 9, y: a.y };
  seg(base, b); if (b.y !== c.y) seg(b, c); if (c.x !== d.x) seg(c, d);
  const head = overlay(root, 'link', `left:${Math.min(tip.x, base.x)}px;top:${a.y - 6}px;width:9px;height:12px`);
  head.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 12" width="9" height="12" style="display:block"><path d="${dir > 0 ? 'M0 6 L9 0 L9 12 Z' : 'M9 6 L0 0 L0 12 Z'}" fill="${INK}"/></svg>`;
  if (number != null) numberPin(root, d, number);
  else overlay(root, 'pin', `left:${d.x - 4}px;top:${d.y - 4}px;width:8px;height:8px;border-radius:50%;background:${INK};box-shadow:0 0 0 2px #ffffff`);
}
