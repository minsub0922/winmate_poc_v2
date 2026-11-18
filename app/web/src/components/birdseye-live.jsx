// 조감도 시트의 조감도 칸을 3D로 살린다 — 시트 팝업 전용.
//   읽기 전용: 돌려 보기만 (아무것도 저장하지 않는다)
//   편집: 돌리기 · 오브젝트 선택 · 끌어 옮기기 · 번호 핀을 끌어 빈 칸에 놓으면 공간을 그 자리로 옮기고(배치가 바뀐다), 다른 공간 위에 놓으면 두 공간의 자리를 바꾼다.
//         조작이 멎으면 onCommit 으로 시트 사본(ov.spatial)을 저장하게 한다.
//         가운데 형태에서는 설명 버블을 끌어 옮긴다(onBubbles — 3D가 없는 조감도 시트에서도 된다).
// Slide 는 값이 바뀔 때마다 innerHTML 을 다시 쓰므로 캔버스는 시트 DOM 밖, 시트 위에 얹는다.
// 번호 핀 · 꺽쇠 화살표는 돌리는 동안 여기서 그리고(시트의 정적인 핀 · 선은 가린다), 버블 자리는 조작이 멎을 때 시트가 다시 잡는다.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { birdseyeSheetInfo, birdseyeRows, birdseyeFrame, centerGeometry, centerLink, clampBubble, fitFrame, legendRoomIds, CENTER_STAGE, SIDE_BOX } from '../domain/spatial/birdseye-sheet.js';
import { moveObject } from '../domain/spatial/scene.js';
import { roomDropSlots, sceneRoomCells } from '../domain/spatial/room-arrangement.js';
import { loadSpatialLibrary, computeSpatial, captureSpatial } from '../services/spatial.js';
import { loadSpatialRenderer } from '../services/spatial-renderer.js';
import { birdseyeSceneKey, loadBirdseyeScene } from '../services/birdseye-sheet.js';
import '../styles/birdseye-live.css';

const IDLE_MS = 600;
const liveBox = (info, mode) => (mode === 'center' ? fitFrame({ width: SIDE_BOX[info.kind].w, height: SIDE_BOX[info.kind].h }, CENTER_STAGE, 872) : SIDE_BOX[info.kind]);

/** 지금 화면 좌표(anchors) → 시트의 공간 행 순서 좌표 */
const rowRoomIds = (info, rows, scene, order) => (info.kind === 'vstd' ? legendRoomIds(scene, info.n, order) : rows.map((r) => r.roomId));
function frameFromAnchors(info, rows, scene, anchors, order) {
  if (!anchors?.rooms) return null;
  const ids = rowRoomIds(info, rows, scene, order);
  return { width: anchors.width, height: anchors.height, points: ids.map((id) => anchors.rooms[id] || { x: 0, y: 0, visible: false }) };
}

/**
 * @param children (ov) => 시트 — 3D가 떠 있는 동안에는 지금 보는 각도의 좌표(ov.spatialFrame)를 얹어 준다
 * @param onCommit ({ scene, library, snapshot, roomIds }) — 편집에서만. 저장할 스냅샷(image · anchors · camera). roomIds: 표준 범례 시트의 번호 순서
 * @param onBubbles (자리 | null) — 편집에서만. 가운데 형태에서 끌어 옮긴 버블 자리(ov.spatialBubbles), null 이면 처음 자리로
 * @param liveRef  { ready, commit() } — 부모가 지금 화면을 바로 저장시키고 싶을 때
 */
export function BirdseyeStage({ f, ov, width, editable = false, historyId = null, onCommit, onBubbles, liveRef, children }) {
  const info = useMemo(() => birdseyeSheetInfo(f), [f]);
  const mode = ov?.spatialMode === 'center' ? 'center' : 'side';
  const sourceKey = info ? birdseyeSceneKey(ov, historyId) : null;
  const host = useRef(null), stage = useRef(null), engine = useRef(null), timer = useRef(null), raf = useRef(0), latest = useRef({});
  const [source, setSource] = useState(null); // { scene, library, camera, roomIds }
  const [library, setLibrary] = useState(null); // 공간 자리를 바꾸면 전체 라이브러리로 바뀐다 (다시 배치하는 데 필요)
  const [roomDrag, setRoomDrag] = useState(null); // { i, x, y, over } — 번호 핀을 끄는 중
  const [bubbleDrag, setBubbleDrag] = useState(null); // { index, x, y } — 버블을 끄는 중
  const [note, setNote] = useState('');
  const [scene, setScene] = useState(null);
  const [ready, setReady] = useState(false);
  const [anchors, setAnchors] = useState(null);
  const [frame, setFrame] = useState(null); // 조작이 멎었을 때의 좌표 — 시트의 버블 자리가 이걸 따른다
  const [selected, setSelected] = useState(null);
  const rows = useMemo(() => (info ? birdseyeRows(info, ov) : []), [info, ov?.spatial]);
  // 표준 범례 시트의 번호 순서 — 처음 불러온 순서를 끝까지 쓴다 (공간 자리를 바꿔도 번호 · 글은 공간을 따라간다)
  const order = useMemo(() => (source ? source.roomIds || source.scene.rooms.map((r) => r.id) : null), [source]);
  latest.current = { ...latest.current, info, rows, scene, source, library, order, editable, onCommit, onBubbles, mode, ov, width };

  // 장면 불러오기 — 시트가 바뀔 때 한 번 (저장으로 ov.spatial 이 바뀌어도 지금 보고 있는 장면을 그대로 쓴다)
  const loadKey = sourceKey ? (sourceKey === 'own' ? 'own' : sourceKey) : '';
  useEffect(() => {
    setSource(null); setLibrary(null); setScene(null); setReady(false); setAnchors(null); setFrame(null); setSelected(null); setRoomDrag(null); setNote('');
    if (!loadKey) return undefined;
    let active = true;
    loadBirdseyeScene(ov, historyId).then((s) => { if (active && s) { setSource(s); setLibrary(s.library); setScene(s.scene); } }).catch((e) => console.warn('조감도 3D를 열지 못했어요', e));
    return () => { active = false; };
  }, [f, loadKey]);

  const dirty = useRef(false), captureVersion = useRef(0);
  const settle = async () => {
    const renderer = engine.current;
    if (!renderer || !latest.current.scene) return;
    await renderer.ready().catch(() => {}); // 자리를 바꾼 뒤 제품 사진이 다 붙은 다음에 찍는다
    const now = latest.current;
    if (engine.current !== renderer || !now.scene) return;
    setFrame(frameFromAnchors(now.info, now.rows, now.scene, renderer.anchors(), now.order));
    if (now.editable && now.onCommit && dirty.current) {
      const version = captureVersion.current, camera = renderer.cameraState(), cameraKey = JSON.stringify(camera);
      const isCurrent = () => engine.current === renderer && latest.current.scene === now.scene && captureVersion.current === version && JSON.stringify(renderer.cameraState()) === cameraKey;
      const box = SIDE_BOX[now.info.kind], w = 1640, h = Math.round(w * box.h / box.w);
      try {
        const snapshot = await captureSpatial(now.scene, now.library, { w, h, camera, pixelRatio: 1, transparentBackground: true });
        if (!isCurrent()) return;
        await now.onCommit({ scene: now.scene, library: now.library, snapshot, roomIds: now.info.kind === 'vstd' ? now.order : undefined, isCurrent });
        if (isCurrent()) dirty.current = false;
      } catch (e) { if (isCurrent()) { console.warn(e); setNote('조감도를 저장하지 못했어요. 다시 조작하면 재시도합니다.'); } }
    }
  };
  const touch = (changed) => { if (changed) { dirty.current = true; captureVersion.current++; } clearTimeout(timer.current); timer.current = setTimeout(settle, IDLE_MS); };

  // 렌더러 — 장면이 준비되면 한 번 만든다
  useEffect(() => {
    if (!source || !host.current) return undefined;
    let active = true, renderer = null;
    loadSpatialRenderer().then(async ({ createSpatialRenderer }) => {
      if (!active) return;
      renderer = createSpatialRenderer(host.current, {
        transparentBackground: true,
        onSelect: (id) => { if (latest.current.editable) setSelected(id); },
        onMove: (id, patch) => {
          const now = latest.current; if (!now.editable) return;
          try { setScene(moveObject(now.scene, id, patch, now.library)); touch(true); } catch (e) { console.warn(e); }
        },
        onChange: () => {
          if (!active || !renderer) return;
          cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => { if (active) setAnchors(renderer.anchors()); });
          if (started.current) touch(true);
        },
        onError: (e) => console.warn('조감도 3D', e),
      });
      engine.current = renderer;
      renderer.setScene(source.scene, source.library);
      if (source.camera) renderer.setCameraState(source.camera);
      renderer.setEditable(!!latest.current.editable);
      await renderer.ready();
      if (!active) return;
      setAnchors(renderer.anchors());
      setFrame(frameFromAnchors(latest.current.info, latest.current.rows, source.scene, renderer.anchors(), latest.current.order));
      setReady(true); started.current = true;
    }).catch((e) => console.warn('조감도 3D를 열지 못했어요', e));
    return () => { active = false; started.current = false; clearTimeout(timer.current); cancelAnimationFrame(raf.current); renderer?.dispose(); engine.current = null; };
  }, [source]);
  const started = useRef(false), footprint = useRef('');
  useEffect(() => { engine.current?.setEditable(!!editable); }, [editable]);
  // 옮긴 장면 · 선택 반영 (카메라는 그대로)
  useEffect(() => {
    const renderer = engine.current; if (!renderer || !scene || !ready) return;
    // 배치가 바뀌어 전체 크기가 달라졌으면 시점을 다시 맞춘다 (옮긴 공간이 화면 밖으로 나가지 않게)
    const extent = scene.width + 'x' + scene.depth, reset = !!footprint.current && footprint.current !== extent; footprint.current = extent;
    renderer.setScene(scene, library, { reset, selectedId: selected });
    setAnchors(renderer.anchors());
  }, [scene, selected]);
  // 형태를 바꾸면 캔버스 크기가 달라진다 — 다음 프레임에 좌표를 다시 잡는다
  useLayoutEffect(() => {
    if (!ready) return undefined;
    const id = requestAnimationFrame(() => { const renderer = engine.current; if (!renderer) return; setAnchors(renderer.anchors()); setFrame(frameFromAnchors(latest.current.info, latest.current.rows, latest.current.scene, renderer.anchors(), latest.current.order)); });
    return () => cancelAnimationFrame(id);
  }, [mode, width, ready]);
  useEffect(() => {
    if (!selected) return undefined;
    const key = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); e.preventDefault(); setSelected(null); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [selected]);
  useEffect(() => {
    if (!liveRef) return undefined;
    liveRef.current = { ready, commit: () => { const now = latest.current; if (!ready || !engine.current || !now.onCommit) return false; clearTimeout(timer.current); dirty.current = true; captureVersion.current++; void settle(); return true; } };
    return () => { liveRef.current = null; };
  }, [ready, liveRef]);

  // 시트 좌표(1280 기준)
  const toSheet = (e) => { const r = stage.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * 1280 / r.width, y: (e.clientY - r.top) * 1280 / r.width }; };
  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(''), 2600); return () => clearTimeout(id); }, [note]);

  // 공간 옮기기 — 번호 핀을 끌어 빈 칸(점선 자리)이나 다른 공간 위에 놓는다 (조감도 스튜디오의 「공간 이름표 끌어 놓기」와 같은 동작)
  const place = async (roomId, cell, swapping) => {
    try {
      const now = latest.current, renderer = engine.current;
      const full = await loadSpatialLibrary(now.scene.assetRevision);
      const result = await computeSpatial({kind:'room',action:'move',state:{scene:now.scene,form:{title:now.scene.title||''}},roomId,cell},full);
      if (engine.current !== renderer || latest.current.scene !== now.scene) return;
      setLibrary(full); setSelected(null); setScene(result.scene); touch(true);
      setNote(swapping ? '두 공간의 자리를 바꿨어요' : '공간을 옮겼어요');
    } catch (e) { console.warn(e); setNote('공간을 그 자리로 옮길 수 없어요'); }
  };
  // 끌어 놓을 수 있는 빈 칸 (시트 좌표)
  const dropSlots = () => {
    const now = latest.current, renderer = engine.current; if (!renderer?.projectGround || !now.scene || !now.liveBox) return [];
    const slots = roomDropSlots(now.scene), size = renderer.anchors(), points = renderer.projectGround(slots), box = now.liveBox;
    return slots.map((s, i) => ({ row: s.row, col: s.col, x: box.x + points[i].x / size.width * box.w, y: box.y + points[i].y / size.height * box.h }));
  };
  const pinDown = (i) => (e) => {
    if (e.button !== 0 || !latest.current.editable) return;
    e.stopPropagation(); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    setRoomDrag({ i, ...toSheet(e), over: null, slot: null, slots: dropSlots(), id: e.pointerId });
  };
  const pinMove = (e) => {
    const now = latest.current.pins; if (!roomDrag || e.pointerId !== roomDrag.id || !now) return;
    const p = toSheet(e); let over = null, best = 90;
    now.forEach((t, j) => { if (!t.visible) return; const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < best) { best = d; over = j; } });
    let slot = null; for (const s of roomDrag.slots) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < best) { best = d; slot = s; } }
    setRoomDrag({ ...roomDrag, ...p, over: slot || over === roomDrag.i ? null : over, slot });
  };
  const pinUp = (e) => {
    if (!roomDrag || e.pointerId !== roomDrag.id) return;
    const { i, over, slot } = roomDrag, now = latest.current; setRoomDrag(null);
    if ((over == null && !slot) || e.type === 'pointercancel') return;
    const ids = rowRoomIds(now.info, now.rows, now.scene, now.order);
    if (!ids[i]) return;
    if (slot) place(ids[i], { row: slot.row, col: slot.col }, false);
    else if (ids[over]) place(ids[i], sceneRoomCells(now.scene)[now.scene.rooms.findIndex((r) => r.id === ids[over])], true);
  };

  // 버블 끌어 옮기기 — 5px 넘게 끌 때만 가로챈다 (그냥 누르면 평소처럼 글을 고른다)
  const canPlace = !!info && editable && mode === 'center' && !!onBubbles;
  useEffect(() => {
    const el = stage.current; if (!el || !canPlace) return undefined;
    let grab = null;
    const down = (e) => {
      if (e.button !== 0 || e.target.closest?.('[contenteditable="true"],input,textarea,button,.birdseye-live-pin')) return;
      const p = toSheet(e), i = (latest.current.bubbles || []).findIndex((b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
      if (i >= 0) grab = { i, id: e.pointerId, start: p, origin: latest.current.bubbles[i], moved: false };
    };
    const at = (e) => { const p = toSheet(e); return clampBubble({ x: grab.origin.x + p.x - grab.start.x, y: grab.origin.y + p.y - grab.start.y }); };
    const move = (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      const p = toSheet(e);
      if (!grab.moved) { if (Math.hypot(p.x - grab.start.x, p.y - grab.start.y) * latest.current.width / 1280 <= 5) return; grab.moved = true; window.getSelection()?.removeAllRanges(); }
      e.preventDefault(); e.stopPropagation();
      setBubbleDrag({ index: grab.i, ...at(e) });
    };
    const up = (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      const g = grab, spot = g.moved && e.type !== 'pointercancel' ? at(e) : null; grab = null; setBubbleDrag(null);
      if (!g.moved) return;
      // 끌기 끝의 click 이 글 칸 선택으로 번지지 않게
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); }; window.addEventListener('click', swallow, true); setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      if (spot) latest.current.onBubbles({ ...(latest.current.ov?.spatialBubbles || {}), [g.i]: { x: Math.round(spot.x), y: Math.round(spot.y) } });
    };
    el.addEventListener('pointerdown', down, true); window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    return () => { el.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); };
  }, [canPlace]);

  const sheetOv = ready && frame ? { ...(ov || {}), spatialFrame: frame } : ov;
  if (!info) return children(ov);
  const k = width / 1280, box = liveBox(info, mode);
  latest.current.liveBox = box;
  // 가운데 형태의 버블 자리 (시트가 그린 것과 같은 계산) — 끌기 · 3D 캔버스 오려 내기에 쓴다
  const stable = mode === 'center' ? birdseyeFrame(info, sheetOv) : null;
  const bubbles = stable && rows.length ? centerGeometry(stable, rows.length, ov?.spatialBubbles).bubbles : [];
  latest.current.bubbles = bubbles;
  // 버블이 조감도와 겹치는 자리는 3D 캔버스를 오려 내 버블이 위에 보이고 눌리게 한다 (PPT · 썸네일과 같은 겹침 순서)
  const holes = bubbles.filter((b) => b && b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y)
    .map((b) => `M${(b.x - box.x) * k} ${(b.y - box.y) * k}h${b.w * k}v${b.h * k}h${-b.w * k}Z`).join('');
  const clip = holes ? `path(evenodd, "M0 0H${box.w * k}V${box.h * k}H0Z${holes}")` : undefined;
  // 살아 있는 핀 · 화살표: 버블 자리는 시트가 마지막으로 잡은 좌표(frame)를, 선 끝은 지금 좌표를 따른다
  let marks = null;
  if (ready && anchors && scene) {
    const live = frameFromAnchors(info, rows, scene, anchors, order);
    const at = (p) => ({ x: box.x + p.x / live.width * box.w, y: box.y + p.y / live.height * box.h, visible: p.visible !== false });
    const targets = live.points.map(at);
    // 공간·제품 연결 시트의 좌우 형태: 공간에서 오른쪽 카드로 가는 직선 (slide-binding.js spatialConnectors 와 같은 자리)
    const straight = mode === 'side' && info.kind === 'spatial' ? targets.map((t, i) => t.visible && { i, x1: t.x, y1: t.y, x2: 930, y2: 181 + i * 79 }).filter(Boolean) : [];
    marks = { targets, straight, links: bubbles.map((b, i) => centerLink(b, targets[i])).filter(Boolean) };
  }
  latest.current.pins = marks?.targets || null;
  const movable = editable && !!marks; // 번호 핀을 끌어 공간 자리를 바꿀 수 있다
  const placedAny = canPlace && ov?.spatialBubbles && Object.keys(ov.spatialBubbles).length > 0;
  const hint = !editable ? '끌어서 돌려 보기' : '빈 곳을 끌면 회전 · 오브젝트를 끌면 이동 · 번호를 끌어 놓으면 공간 옮기기' + (canPlace ? ' · 말풍선도 끌어 옮기기' : '');
  const object = selected && scene?.objects.find((o) => o.id === selected), asset = object && library?.assets.find((a) => a.id === object.assetId);
  const point = object && anchors?.objects?.[selected];
  return (
    <div ref={stage} className={'birdseye-stage' + (ready ? ' birdseye-live-on' : '') + (editable ? ' birdseye-editable' : '') + (canPlace ? ' birdseye-placeable' : '') + (bubbleDrag || roomDrag ? ' birdseye-dragging' : '')} data-birdseye-live={ready ? 'ready' : loadKey ? 'loading' : 'off'} style={{ position: 'relative', width, height: Math.round(width * 9 / 16) }}>
      {children(sheetOv)}
      {loadKey && <div className="birdseye-live-host" ref={host} style={{ left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k, visibility: ready ? 'visible' : 'hidden', clipPath: clip }}
        onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />}
      {marks && <svg className="birdseye-live-marks" viewBox="0 0 1280 720" width={width} height={Math.round(width * 9 / 16)} aria-hidden="true">
        {marks.links.map((l) => { const [a, b, c, d] = l.path, dir = l.side === 'left' ? 1 : -1; return <g key={l.index}>
          <polyline points={[{ x: a.x + dir * 9, y: a.y }, b, c, d].map((p) => p.x + ',' + p.y).join(' ')} />
          <path d={dir > 0 ? `M${a.x + 1} ${a.y} l9 -6 v12 Z` : `M${a.x - 1} ${a.y} l-9 -6 v12 Z`} />
        </g>; })}
        {marks.straight.map((l) => <line key={'s' + l.i} className="birdseye-live-straight" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
        {marks.targets.map((t, i) => t.visible && <g key={i} className={'birdseye-live-pin' + (movable ? ' movable' : '') + (roomDrag?.i === i ? ' dragging' : '') + (roomDrag?.over === i ? ' over' : '')} data-birdseye-pin={rows[i]?.number} transform={`translate(${t.x} ${t.y})`}
          onPointerDown={movable ? pinDown(i) : undefined} onPointerMove={movable ? pinMove : undefined} onPointerUp={movable ? pinUp : undefined} onPointerCancel={movable ? pinUp : undefined} onClick={(e) => e.stopPropagation()}>
          {movable && <circle className="birdseye-live-grab" r="17" />}<circle r="11" /><text y="4">{rows[i]?.number}</text>{movable && <title>끌어서 빈 자리에 놓으면 공간을 옮기고, 다른 공간 위에 놓으면 자리를 바꿉니다</title>}</g>)}
        {roomDrag && roomDrag.slots.map((s) => <g key={s.row + ':' + s.col} className={'birdseye-live-slot' + (roomDrag.slot === s ? ' over' : '')} data-birdseye-slot={s.row + ':' + s.col} transform={`translate(${s.x} ${s.y})`}><rect x="-22" y="-12" width="44" height="24" rx="6" /><text y="4">여기로</text></g>)}
        {roomDrag && marks.targets[roomDrag.i] && <g className="birdseye-live-roomdrag">
          <line x1={marks.targets[roomDrag.i].x} y1={marks.targets[roomDrag.i].y} x2={roomDrag.x} y2={roomDrag.y} />
          <g transform={`translate(${roomDrag.x} ${roomDrag.y})`}><circle r="13" /><text y="4">{rows[roomDrag.i]?.number}</text></g>
        </g>}
      </svg>}
      {bubbleDrag && <div className="birdseye-live-ghost" style={{ left: bubbleDrag.x * k, top: bubbleDrag.y * k, width: bubbles[bubbleDrag.index].w * k, height: bubbles[bubbleDrag.index].h * k }}><b>{rows[bubbleDrag.index]?.number}</b></div>}
      {placedAny && <button type="button" className="birdseye-live-reset" style={{ right: (1280 - box.x - box.w) * k + 10, top: (box.y + box.h) * k - 34 }} onClick={(e) => { e.stopPropagation(); onBubbles(null); }}>말풍선 자리 되돌리기</button>}
      {note && <span className="birdseye-live-chip birdseye-live-note" role="status" style={{ left: box.x * k + box.w * k / 2, top: box.y * k + 10 }}>{note}</span>}
      {loadKey && !ready && <span className="birdseye-live-chip" style={{ left: box.x * k + 10, top: box.y * k + 10 }}>3D 준비 중…</span>}
      {ready && !asset && <span className="birdseye-live-chip" style={{ left: box.x * k + 10, top: (box.y + box.h) * k - 34 }}>{hint}</span>}
      {asset && point && point.visible !== false && <span className="birdseye-live-chip birdseye-live-selected" style={{ left: box.x * k + point.x / anchors.width * box.w * k + 12, top: box.y * k + point.y / anchors.height * box.h * k - 30 }}>{asset.name || asset.model || '오브젝트'}</span>}
    </div>
  );
}
