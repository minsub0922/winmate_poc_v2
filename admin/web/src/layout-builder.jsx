// 「레이아웃 구성 관리」 → 추천 구성 → 구성 추가하기 (사용자 지시 2026-11-16)
//   구성 만들기 팝업: 파트를 누르면 흐름에 바로 들어가고(다시 누르면 빠진다) · 흐름은 큰 파트 버블(이름은 아래)을 끌어서 순서를 바꾼다 ·
//     빼기는 흐름의 버블에 마우스를 대면 오른쪽 위에 · 번호는 없다 · Spec 도 골라 넣는다(넣으면 맨 끝) · 만든 파트가 전체 파트 위(2026-11-16 2차 지시).
//   새 파트 만들기 팝업(구성 만들기보다 작다): 이름 · 색(팔레트 54색) · 아이콘(에셋 75종) · 레이아웃 구성(간지 다음에 고른 레이아웃을 끌어서 순서대로).
//     레이아웃은 '추가' 버튼의 작은 팝업에서 전체 레이아웃 템플릿을 검색 · 필터로 찾아 더한다(앱 템플릿 라이브러리의 시트 목록 — 샘플 시나리오는 없다).
//     누를 때마다 바로 더해지고 팝업은 열려 있다 · 레이아웃에 마우스를 대면 큰 미리보기와 상세가 옆에 뜬다.
//     파트를 만들면 바로 파트 목록에 올라가고 지금 만드는 구성의 흐름에 자동으로 더해진다.
//   만든 값은 화면의 초안(운영 값)에 들어가고, 목록의 '저장'을 누르면 앱에 반영된다(app/api/layout_presets.py parts · templates → custom_compositions.js).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, number } from './api';
import { Icon } from './icons';
import { Button, IconButton, Modal } from './components';
import { LayoutFrame, PartIcon, Overlay } from './layouts.jsx';
import { PART_CATALOG } from './part-flows.js';
import { partArc } from './part-arc.js';
import { PART_PALETTE, PART_ICON_GROUPS, PART_ICONS, SHADE_NAMES, lookStyle, DEFAULT_PART_COLOR, DEFAULT_PART_ICON } from '../../../app/web/src/domain/templates/part_looks.js';
import { partColor } from '../../../app/web/src/domain/templates/part_colors.js';
import { compositionProblems, maxParts, MIN_PARTS, SPEC_KEY, PART_NAME_MAX, MAX_PART_SHEETS } from '../../../app/web/src/domain/templates/custom_compositions.js';
import './layout-builder.css';

/* ---------- 레이아웃 목록(앱 템플릿 라이브러리의 시트와 같은 목록 · 은퇴한 장 제외) ---------- */
let libPromise = null;
window.addEventListener('admin:layout-library', () => { libPromise = null; });
export function loadLibrary() {
  if (!libPromise) {
    libPromise = api('/layout-presets/library').then(d => ({ ...d, byF: new Map(d.layouts.map(x => [x.f, x])) }));
    libPromise.catch(() => { libPromise = null; });
  }
  return libPromise;
}
// 목차 유형 묶음 — 앱 템플릿 라이브러리(app/web/src/components/layout-library.jsx PART_GROUPS)와 같은 묶음
const PART_GROUPS = [
  { k: 'analysis', label: '분석 · 이해', hue: 'blue', parts: ['overview', 'requirements', 'market', 'customer', 'user', 'competition', 'insight'] },
  { k: 'value', label: '과제 · 가치', hue: 'violet', parts: ['challenge', 'value', 'effect'] },
  { k: 'space', label: '공간 · 제품', hue: 'teal', parts: ['dss', 'products', 'bom', 'scenario', 'birdseye', 'spec'] },
  { k: 'proof', label: '솔루션 · 근거', hue: 'amber', parts: ['solution', 'case', 'why'] },
  { k: 'exec', label: '실행 · 비용 · 구독', hue: 'green', parts: ['execution', 'cost', 'subscription'] },
  { k: 'frame', label: '표지 · 마무리', hue: 'slate', parts: ['cover', 'closing', 'appendix'] },
];
const GROUP_OF = Object.fromEntries(PART_GROUPS.flatMap(g => g.parts.map(p => [p, g.k])));
// 원본 장표 — 앱 tplkit.jsx DECKS 의 이름
const DECKS = { MI: '01 MI', VP: '02 Value Props', SS: '03 공간 시나리오', SP: '04 공간별 제품', EX: '05 보강', CM: '공통 · 솔루션', PH: '06 사진 중심', ST: '표준 제안서', TC: '목차 템플릿', SU: 'B2B 삼성 AI 구독' };
const IMG_OPTS = [['', '이미지 전체'], ['ph', '사진 중심'], ['0', '텍스트만'], ['1', '이미지 1–3칸'], ['4', '이미지 4칸 이상']];
const NO_FILTER = { grp: '', part: '', ind: '', sol: '', prod: '', img: '', deck: '' };
const indsOf = l => l.inds || (l.ind ? [l.ind] : []);
const photoFirst = l => l.c === 'PH' || (l.pf || 0) >= 0.3;
function pass(l, f, skip) {
  if (skip !== 'part') { if (f.part && l.p !== f.part) return false; if (!f.part && f.grp && GROUP_OF[l.p] !== f.grp) return false; }
  if (skip !== 'deck' && f.deck && l.c !== f.deck) return false;
  if (skip !== 'prod' && f.prod && !(l.prods || []).includes(f.prod)) return false;
  if (skip !== 'ind' && f.ind) { const inds = indsOf(l); if (f.ind === '_gen' ? inds.length : f.ind === '_ind' ? !inds.length : !inds.includes(f.ind)) return false; }
  if (skip !== 'sol' && f.sol) { if (f.sol === '_none' ? !!l.sol : l.sol !== f.sol && !(l.sols || []).includes(f.sol)) return false; }
  if (skip !== 'img' && f.img) {
    const n = l.nI || 0;
    if ((f.img === '0' && n !== 0) || (f.img === '1' && !(n >= 1 && n <= 3)) || (f.img === '4' && n < 4) || (f.img === 'ph' && !photoFirst(l))) return false;
  }
  return true;
}
const squash = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const countBy = (list, key) => { const m = {}; for (const x of list) { const k = key(x); if (k != null) m[k] = (m[k] || 0) + 1; } return m; };

/* ---------- 파트 표시 ---------- */
const listKey = k => (PART_CATALOG.keys && PART_CATALOG.keys[k]) || k;
/** 코드 구성이 쓰는 파트(전체 파트 목록) — 기승전결 순서 */
export function codeParts(K) {
  const used = new Set(K.toc.TOC_TEMPLATES.filter(t => !t.custom).flatMap(t => t.tocs));
  return Object.keys(K.toc.TOCS).filter(k => used.has(k) && !K.toc.TOCS[k].custom && !PART_CATALOG.hidden.includes(k))
    .sort((a, b) => partArc(listKey(a)).order - partArc(listKey(b)).order);
}
/** 파트 하나의 이름 · 겉모습 — 직접 만든 파트는 고른 색 · 아이콘, 코드 파트는 파트 색(part_colors.js) · 유형 아이콘(추천 구성 목록의 버블과 같다) */
export function partInfo(K, parts, key) {
  const d = parts[key];
  if (d) return { key, name: d.name, custom: true, look: { color: d.color, icon: d.icon }, icon: d.icon, hue: null, n: (d.sheets || []).length };
  const toc = K.toc.TOCS[key];
  if (!toc) return { key, name: key, custom: false, icon: 'edit', hue: 'slate', missing: true };
  const P = K.PARTS[toc.type] || K.PARTS.free;
  return { key, name: PART_CATALOG.names[key] || K.toc.tocName(key, null), custom: false, icon: P.icon, hue: P.hue || 'slate', color: partColor(key), goal: toc.goal };
}
function Bubble({ info, mark = null }) {
  return <span className={'lb-node' + (info.hue ? ' h-' + info.hue : '')} style={lookStyle(info.look || (info.color ? { color: info.color } : null))}><PartIcon name={info.icon}/>{mark}</span>;
}
/** 고른 레이아웃으로 정하는 파트 유형 — 가장 많이 쓰인 유형(같으면 앞 장의 유형) */
function inferType(sheets, lib, fallback) {
  if (!lib) return fallback || 'free';
  const n = {}; let best = null;
  for (const x of sheets) { const p = (lib.byF.get(x.f) || {}).p; if (!p) continue; n[p] = (n[p] || 0) + 1; if (!best || n[p] > n[best]) best = p; }
  return best || fallback || 'free';
}
const uidOf = () => Math.random().toString(36).slice(2, 9);

/* ---------- 구성 추가하기 버튼(추천 구성 헤더 오른쪽 끝) ---------- */
export function AddCompositionButton({ onClick, disabled }) {
  return <Button variant="primary" icon="plus" className="lb-add-btn" onClick={onClick} disabled={disabled}>구성 추가하기</Button>;
}

/* ---------- 구성 만들기 팝업 ---------- */
// parts: 초안의 직접 만든 파트 { key: def } — 새 파트를 만들면 곧바로 여기 들어온다(onSavePart)
// usedBy(key): 이 구성 말고 그 파트를 쓰는 구성 이름들 · initial: 고칠 구성 { id, name, desc, tocs } (없으면 새 구성)
export function CompositionBuilder({ K, parts, initial = null, takenNames = [], usedBy = () => [], onSavePart, onDeletePart, onDone, close }) {
  const [name, setName] = useState(initial ? initial.name : '');
  const [desc, setDesc] = useState(initial ? initial.desc || '' : '');
  const [tocs, setTocs] = useState(initial ? [...initial.tocs] : []);
  const [creator, setCreator] = useState(null); // { key: null(새 파트) | 'cp_…'(고치기) }
  const [drag, setDrag] = useState(null); // { from: i } | { key }
  const [over, setOver] = useState(null); // 끌어 놓을 자리(그 앞에 놓인다)
  const flowRef = useRef(null);
  const code = useMemo(() => codeParts(K), [K]);
  const custom = Object.keys(parts);
  const known = k => !!parts[k] || (!!K.toc.TOCS[k] && !K.toc.TOCS[k].custom);
  // 지운 파트가 흐름에 남지 않게
  useEffect(() => { if (tocs.some(k => !known(k))) setTocs(t => t.filter(known)); }, [parts]); // eslint-disable-line react-hooks/exhaustive-deps
  const cap = maxParts(tocs);
  const problems = compositionProblems(tocs, known);
  const nameTaken = !!name.trim() && takenNames.includes(name.trim());
  const ready = !problems.length && !!name.trim() && !nameTaken;
  const canAdd = key => tocs.length + 1 <= maxParts([...tocs, key]);

  // Spec 은 골라 넣는다 — 넣으면 늘 맨 끝(다른 파트는 그 앞까지)
  const endOf = t => (t.includes(SPEC_KEY) ? t.indexOf(SPEC_KEY) : t.length);
  const insert = (key, at) => setTocs(t => {
    if (t.includes(key) || t.length + 1 > maxParts([...t, key])) return t;
    if (key === SPEC_KEY) return [...t, key];
    const out = [...t]; out.splice(Math.min(at == null ? endOf(t) : at, endOf(t)), 0, key); return out;
  });
  const remove = key => setTocs(t => t.filter(k => k !== key));
  const move = (from, to) => setTocs(t => {
    if (t[from] === SPEC_KEY || to == null) return t;
    const out = [...t]; const [x] = out.splice(from, 1);
    out.splice(Math.max(0, Math.min(to > from ? to - 1 : to, endOf(out))), 0, x); return out;
  });
  const toggle = key => (tocs.includes(key) ? remove(key) : insert(key));
  // 끌어 놓을 자리 — 버블 가운데보다 왼쪽(또는 윗줄)이면 그 버블 앞 · Spec 이 있으면 그 앞까지
  const slotAt = e => {
    const items = flowRef.current ? [...flowRef.current.querySelectorAll('[data-flow-i]')] : [];
    for (const el of items) {
      const r = el.getBoundingClientRect(); const i = +el.dataset.flowI;
      if (e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2)) return Math.min(i, endOf(tocs));
    }
    return endOf(tocs);
  };
  const onFlowOver = e => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = drag.key ? 'copy' : 'move'; const at = slotAt(e); if (at !== over) setOver(at); };
  const onFlowDrop = e => { if (!drag) return; e.preventDefault(); const at = slotAt(e); if (drag.key) insert(drag.key, at); else move(drag.from, at); setDrag(null); setOver(null); };
  const endDrag = () => { setDrag(null); setOver(null); };
  const keyMove = (e, i) => {
    if (e.target !== e.currentTarget) return; // 빼기 버튼의 Enter · Space 는 그 버튼이
    if (tocs[i] === SPEC_KEY) { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(SPEC_KEY); } return; }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); move(i, i - 1); requestAnimationFrame(() => focusChip(i - 1)); }
    if (e.key === 'ArrowRight' && i < endOf(tocs) - 1) { e.preventDefault(); move(i, i + 2); requestAnimationFrame(() => focusChip(i + 1)); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(tocs[i]); }
  };
  const focusChip = i => { const el = flowRef.current && flowRef.current.querySelector(`[data-flow-i="${i}"]`); el && el.focus(); };
  const savePart = (key, def) => {
    const id = onSavePart(key, def); // 새 파트면 새 id
    if (!key) insert(id); // 만든 파트는 지금 흐름에 자동으로 더한다
    setCreator(null);
  };
  const tile = key => {
    const info = partInfo(K, parts, key); const on = tocs.includes(key);
    const full = !on && !canAdd(key);
    const others = info.custom ? usedBy(key) : [];
    return <li key={key} className={'lb-tile' + (on ? ' on' : '') + (info.custom ? ' custom' : '')} data-part={key}>
      <button type="button" className="lb-tile-hit" aria-pressed={on} disabled={full} draggable={!on && !full}
        title={full ? `파트는 ${cap}개까지` : info.goal || info.name}
        onClick={() => toggle(key)} onDragStart={e => { e.dataTransfer.setData('text/plain', key); e.dataTransfer.effectAllowed = 'copy'; setDrag({ key }); }} onDragEnd={endDrag}>
        <Bubble info={info}/>
        <span className="lb-tile-name">{info.name}</span>
        {on ? <span className="lb-tile-on"><Icon name="check" size={12}/></span> : <Icon name="plus" size={13} className="lb-tile-state"/>}
      </button>
      {info.custom && <span className="lb-tile-act">
        <button type="button" aria-label={info.name + ' 파트 고치기'} title="고치기" onClick={() => setCreator({ key })}><Icon name="settings" size={13}/></button>
        <button type="button" aria-label={info.name + ' 파트 지우기'} title={others.length ? '쓰는 구성: ' + others.join(', ') : '지우기'} disabled={others.length > 0} onClick={() => { setTocs(t => t.filter(k => k !== key)); onDeletePart(key); }}><Icon name="close" size={13}/></button>
      </span>}
    </li>;
  };
  const finish = () => ready && onDone({ name: name.trim(), desc: desc.trim(), tocs });
  return <Modal wide close={close} title={initial ? '구성 고치기' : '새 구성 만들기'}
    footer={<>
      <span className="lb-rules" role="status">
        <em className={'lb-rule' + (tocs.length < MIN_PARTS || tocs.length > cap ? ' bad' : ' ok')}>파트 <b>{tocs.length}</b> / {MIN_PARTS}–{cap}</em>
        {problems.filter(p => !['min', 'max'].includes(p.code)).map(p => <em key={p.code} className="lb-rule bad">{p.label}</em>)}
        {nameTaken && <em className="lb-rule bad">같은 이름의 구성</em>}
      </span>
      <div className="button-row"><Button onClick={close}>취소</Button><Button variant="primary" icon="check" disabled={!ready} onClick={finish}>{initial ? '고친 구성 적용' : '구성 추가'}</Button></div>
    </>}>
    <div className="lb lb-builder">
      <div className="lb-fields">
        <label className="lb-field grow"><span>이름</span><input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="예) 매장 운영형 제안서" aria-label="구성 이름" autoFocus/></label>
        <label className="lb-field"><span>설명</span><input value={desc} maxLength={300} onChange={e => setDesc(e.target.value)} placeholder="추천 카드 · 추천 모델이 읽는 설명" aria-label="구성 설명"/></label>
      </div>
      <section className="lb-sec lb-flow-sec">
        <h4>구성 흐름</h4>
        <ol ref={flowRef} className={'lb-flow' + (drag ? ' dragging' : '')} aria-label="구성 흐름" onDragOver={onFlowOver} onDrop={onFlowDrop} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}>
          {tocs.map((key, i) => {
            const info = partInfo(K, parts, key); const spec = key === SPEC_KEY; // Spec 은 넣으면 맨 끝 — 끌어 옮기지 않는다
            const noop = drag && drag.from != null && (drag.from === over || drag.from === over - 1);
            const before = drag && over === i && !noop; const after = drag && over === tocs.length && i === tocs.length - 1 && !noop;
            return <li key={key} data-flow-i={i} data-toc={key} tabIndex={0} draggable={!spec}
              className={'lb-fi' + (spec ? ' end' : '') + (before ? ' drop-before' : '') + (after ? ' drop-after' : '') + (drag && drag.from === i ? ' moving' : '')}
              aria-label={info.name} title={info.goal || info.name} onKeyDown={e => keyMove(e, i)}
              onDragStart={e => { if (spec) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', key); e.dataTransfer.effectAllowed = 'move'; setDrag({ from: i }); }} onDragEnd={endDrag}>
              <span className="lb-fi-b"><Bubble info={info}/>
                <button type="button" className="lb-fi-x" aria-label={info.name + ' 빼기'} title="빼기" onClick={() => remove(key)} draggable={false}><Icon name="close" size={11}/></button></span>
              <span className="lb-fi-name">{info.name}</span>
            </li>;
          })}
          {!tocs.length && <li className="lb-fi ghost" aria-hidden="true"><span className="lb-fi-b"><span className="lb-node add"><Icon name="plus" size={22}/></span></span><span className="lb-fi-name">파트 담기</span></li>}
        </ol>
      </section>
      <section className="lb-sec">
        <div className="lb-sec-h"><h4>만든 파트 <span className="count-label">{custom.length}</span></h4></div>
        <ul className="lb-tiles" data-sec="custom">{custom.map(tile)}
          <li className="lb-tile new"><button type="button" className="lb-tile-hit" onClick={() => setCreator({ key: null })}><span className="lb-node add"><Icon name="plus" size={16}/></span><span className="lb-tile-name">새 파트</span></button></li>
        </ul>
      </section>
      <section className="lb-sec">
        <div className="lb-sec-h"><h4>전체 파트 <span className="count-label">{code.length}</span></h4></div>
        <ul className="lb-tiles" data-sec="code">{code.map(tile)}</ul>
      </section>
    </div>
    {creator && <PartCreator K={K} initial={creator.key ? { key: creator.key, ...parts[creator.key] } : null}
      takenNames={[...code.map(k => partInfo(K, parts, k).name), ...custom.filter(k => k !== creator.key).map(k => parts[k].name)]}
      onSave={def => savePart(creator.key, def)} close={() => setCreator(null)}/>}
  </Modal>;
}

/* ---------- 새 파트 만들기 팝업 (구성 만들기 위에 뜨는 작은 팝업) ---------- */
function PartCreator({ K, initial, takenNames, onSave, close }) {
  const [name, setName] = useState(initial ? initial.name : '');
  const [color, setColor] = useState(initial ? initial.color : DEFAULT_PART_COLOR);
  const [icon, setIcon] = useState(initial ? initial.icon : DEFAULT_PART_ICON);
  const [sheets, setSheets] = useState(() => (initial ? initial.sheets.map(x => ({ ...x, uid: uidOf() })) : []));
  const [iq, setIq] = useState('');
  const [picker, setPicker] = useState(null); // 레이아웃 추가 팝업을 연 버튼
  const [lib, setLib] = useState(null);
  const [drag, setDrag] = useState(null); const [over, setOver] = useState(null);
  const listRef = useRef(null);
  useEffect(() => { let alive = true; const load = () => loadLibrary().then(d => alive && setLib(d), () => {}); load(); window.addEventListener('admin:layout-library', load); return () => { alive = false; window.removeEventListener('admin:layout-library', load); }; }, []);
  // Esc — 레이아웃 추가 팝업이 열려 있으면 그것만 닫는다(Overlay 는 처음 받은 close 를 쓰므로 ref 로 넘긴다)
  const escRef = useRef(close); escRef.current = picker ? () => setPicker(null) : close;
  const trimmed = name.trim();
  const taken = !!trimmed && takenNames.includes(trimmed);
  const ready = !!trimmed && !taken && sheets.length > 0;
  const iconHit = squash(iq);
  const look = { color, icon };
  // 고를 때마다 바로 더한다 — 레이아웃 추가 팝업은 열어 둔다(2026-11-16 2차 지시)
  const add = row => setSheets(s => (s.length >= MAX_PART_SHEETS ? s : [...s, { f: row.f, label: row.name || row.f, uid: uidOf() }]));
  const used = useMemo(() => countBy(sheets, x => x.f), [sheets]);
  const slotAt = e => {
    const cards = listRef.current ? [...listRef.current.querySelectorAll('[data-sheet-i]')] : [];
    for (const el of cards) { const r = el.getBoundingClientRect(); if (e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2)) return +el.dataset.sheetI; }
    return sheets.length;
  };
  const drop = e => {
    if (drag == null) return; e.preventDefault();
    const to = slotAt(e);
    setSheets(s => { const out = [...s]; const [x] = out.splice(drag, 1); out.splice(to > drag ? to - 1 : to, 0, x); return out; });
    setDrag(null); setOver(null);
  };
  const keyMove = (e, i) => {
    const swap = j => { e.preventDefault(); setSheets(s => { const out = [...s]; [out[i], out[j]] = [out[j], out[i]]; return out; }); requestAnimationFrame(() => { const el = listRef.current && listRef.current.querySelector(`[data-sheet-i="${j}"]`); el && el.focus(); }); };
    if (e.key === 'ArrowLeft' && i > 0) swap(i - 1);
    if (e.key === 'ArrowRight' && i < sheets.length - 1) swap(i + 1);
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); setSheets(s => s.filter((_, j) => j !== i)); }
  };
  const save = () => ready && onSave({ name: trimmed, color, icon, type: inferType(sheets, lib, initial && initial.type), sheets: sheets.map(({ f, label }) => ({ f, label })) });
  return <Overlay label={initial ? '파트 고치기' : '새 파트 만들기'} close={() => escRef.current()} className="lb lb-creator-overlay">
    <header className="lb-creator-h">
      <Bubble info={{ look, icon, hue: null }}/>
      <div><h3>{initial ? '파트 고치기' : '새 파트 만들기'}</h3><p>{trimmed || '이름 없는 파트'} · 간지 + 레이아웃 {sheets.length}장</p></div>
      <IconButton icon="close" label="파트 만들기 닫기" onClick={close}/>
    </header>
    <div className="lb-creator">
      <label className="lb-field"><span>파트 이름</span><input value={name} maxLength={PART_NAME_MAX} onChange={e => setName(e.target.value)} placeholder="예) 매장 운영" aria-label="파트 이름" autoFocus/>
        {taken && <small className="lb-bad">같은 이름의 파트가 있습니다</small>}</label>
      <section className="lb-sec">
        <h4>색상 <small>{(PART_PALETTE.find(f => f.shades.includes(color)) || {}).name} · {SHADE_NAMES[(PART_PALETTE.find(f => f.shades.includes(color)) || { shades: [] }).shades.indexOf(color)] || ''}</small></h4>
        <div className="lb-palette" role="radiogroup" aria-label="파트 색상">
          {PART_PALETTE.map(f => <div key={f.id} className="lb-swatches" title={f.name}>
            {f.shades.map((hex, i) => <button key={hex} type="button" role="radio" aria-checked={color === hex} aria-label={`${f.name} · ${SHADE_NAMES[i]}`} title={`${f.name} · ${SHADE_NAMES[i]}`}
              className={'lb-swatch' + (color === hex ? ' on' : '')} style={{ background: hex }} onClick={() => setColor(hex)}>{color === hex && <Icon name="check" size={13}/>}</button>)}
          </div>)}
        </div>
      </section>
      <section className="lb-sec">
        <div className="lb-sec-h"><h4>아이콘 <small>{PART_ICONS[icon] ? PART_ICONS[icon].label : ''}</small></h4>
          <label className="search-field lb-icon-search"><Icon name="search" size={14}/><input value={iq} onChange={e => setIq(e.target.value)} placeholder="아이콘 찾기" aria-label="아이콘 찾기"/></label></div>
        <div className="lb-icons" role="radiogroup" aria-label="파트 아이콘" style={lookStyle(look)}>
          {PART_ICON_GROUPS.map(g => {
            const list = g.icons.filter(([, label]) => !iconHit || squash(label + g.name).includes(iconHit));
            if (!list.length) return null;
            return <div key={g.id} className="lb-icon-group"><h5>{g.name}</h5><div>{list.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={icon === id} aria-label={label} title={label}
              className={'lb-icon' + (icon === id ? ' on' : '')} onClick={() => setIcon(id)}><PartIcon name={id} size={18}/></button>)}</div></div>;
          })}
        </div>
      </section>
      <section className="lb-sec">
        <div className="lb-sec-h"><h4>레이아웃 구성 <span className="count-label">{sheets.length}</span></h4><small className="lb-quiet">{sheets.length}/{MAX_PART_SHEETS}</small></div>
        <ol ref={listRef} className="lb-sheets" aria-label="파트 레이아웃 순서" onDragOver={e => { if (drag == null) return; e.preventDefault(); const at = slotAt(e); if (at !== over) setOver(at); }} onDrop={drop}>
          <li className="lb-sheet locked" aria-label="1번 간지 (고정)"><span className="lb-sheet-no">01</span><LayoutFrame f="L_VS_DIV_R3" title="간지"/><span className="lb-sheet-t"><b>간지</b><span className="lb-chip-lock"><PartIcon name="pi-lock" size={11}/></span></span></li>
          {sheets.map((x, i) => {
            const m = lib ? lib.byF.get(x.f) || {} : {};
            return <li key={x.uid} data-sheet-i={i} data-f={x.f} tabIndex={0} draggable className={'lb-sheet' + (over === i && drag != null && drag !== i && drag !== i - 1 ? ' drop-before' : '') + (drag === i ? ' moving' : '')}
              aria-label={`${i + 2}번 ${x.label || x.f}`} onKeyDown={e => keyMove(e, i)}
              onDragStart={e => { e.dataTransfer.setData('text/plain', x.f); e.dataTransfer.effectAllowed = 'move'; setDrag(i); }} onDragEnd={() => { setDrag(null); setOver(null); }}>
              <span className="lb-sheet-no">{String(i + 2).padStart(2, '0')}</span>
              <LayoutFrame f={x.f} title={x.label || x.f}/>
              <span className="lb-sheet-t"><b>{x.label || x.f}</b><small>{m.code || x.f}</small></span>
              <button type="button" className="lb-chip-x" aria-label={(x.label || x.f) + ' 빼기'} draggable={false} onClick={() => setSheets(s => s.filter(y => y.uid !== x.uid))}><Icon name="close" size={12}/></button>
            </li>;
          })}
          <li className={'lb-sheet add' + (over === sheets.length && drag != null && drag !== sheets.length - 1 ? ' drop-before' : '')}>
            <button type="button" aria-haspopup="dialog" aria-expanded={!!picker} disabled={sheets.length >= MAX_PART_SHEETS && !picker} onClick={e => setPicker(picker ? null : e.currentTarget)}><Icon name="plus" size={18}/><span>레이아웃 추가</span></button>
          </li>
        </ol>
      </section>
    </div>
    <footer className="lb-creator-f">
      <span className="lb-rules">{!sheets.length && <em className="lb-rule bad">레이아웃 1장 이상</em>}</span>
      <div className="button-row"><Button onClick={close}>취소</Button><Button variant="primary" icon="check" disabled={!ready} onClick={save}>{initial ? '고친 파트 적용' : '파트 만들기'}</Button></div>
    </footer>
    {picker && <LayoutPicker K={K} anchor={picker} lib={lib} used={used} count={sheets.length} onPick={add} close={() => setPicker(null)}/>}
  </Overlay>;
}

/* ---------- 레이아웃 상세(마우스를 대면) — 큰 미리보기 + 쓰는 상황 · 유형 · 업종 · 솔루션 · 제품. 카드 옆에 뜨고 카드를 가리지 않는다 ---------- */
const msgOf = l => { const m = /“([^”]+)”/.exec(l.g || ''); return m ? m[1] : ''; };
function LayoutHover({ K, lib, l, at }) {
  const box = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const W = el.offsetWidth; const H = el.offsetHeight; const gap = 12; const vw = window.innerWidth; const vh = window.innerHeight;
    let left = at.right + gap;
    if (left + W > vw - 8) left = at.left - gap - W;
    if (left < 8) left = Math.max(8, Math.min(vw - W - 8, at.left + at.width / 2 - W / 2));
    setPos({ left, top: Math.max(8, Math.min(vh - H - 8, at.top + at.height / 2 - H / 2)) });
  }, [at, l.f]);
  const P = K.PARTS[l.p]; const inds = indsOf(l);
  const nameOf = (list, key, id) => ((list || []).find(x => x[key] === id) || {}).name || id;
  const ind = c => nameOf(lib.industries, 'code', c);
  const sols = [...new Set([l.sol, ...(l.sols || [])].filter(Boolean))].map(id => nameOf(lib.solutions, 'id', id));
  const prods = (l.prods || []).map(id => nameOf(lib.products, 'id', id));
  const msg = msgOf(l);
  return createPortal(<div ref={box} className="lb lb-hover" role="tooltip" data-f={l.f} style={pos || { left: -9999, top: 0, visibility: 'hidden' }}>
    <div className="lb-hover-tags">
      {P && <span className={'lb-tag h-' + (P.hue || 'slate')}>{P.label}</span>}
      <span className="lb-tag">{inds.length > 1 ? `업종 후보 ${inds.length} · ${inds.slice(0, 3).map(ind).join(' · ')}${inds.length > 3 ? ' …' : ''}` : inds.length ? ind(inds[0]) + ' 맞춤' : '범용 · 모든 업종'}</span>
      {l.sol && <span className="lb-tag">{nameOf(lib.solutions, 'id', l.sol)} 전용</span>}
      {DECKS[l.c] && <span className="lb-tag">{DECKS[l.c]}</span>}
    </div>
    <b className="lb-hover-name">{l.name || l.f}</b>
    <small className="lb-hover-code">{l.code || l.f}</small>
    {l.when && <p className="lb-hover-when"><Icon name="info" size={12}/><span>언제 쓰나 · {l.when}</span></p>}
    <LayoutFrame f={l.f} title={l.name || l.f} thumb={false}/>
    <dl>
      {msg && <><dt>핵심 메시지</dt><dd>“{msg}”</dd></>}
      {l.hl && l.hl !== l.when && <><dt>예시 제목</dt><dd>{l.hl}</dd></>}
      {sols.length > 0 && <><dt>관련 솔루션</dt><dd>{sols.join(' · ')}</dd></>}
      {prods.length > 0 && <><dt>예시 제품</dt><dd>{prods.join(' · ')}</dd></>}
      <dt>이미지 칸</dt><dd>{l.nI ? `${l.nI}칸${photoFirst(l) ? ' · 사진 중심' : ''}` : '없음 · 텍스트만'}</dd>
    </dl>
  </div>, document.body);
}

/* ---------- 레이아웃 추가 — '추가' 버튼의 작은 팝업: 전체 레이아웃 템플릿을 검색 · 필터로 찾아 누를 때마다 더한다(열어 둔다) ---------- */
const PAGE = 36;
function LayoutPicker({ K, anchor, lib, used, count, onPick, close }) {
  const box = useRef(null); const scroller = useRef(null); const more = useRef(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [rect, setRect] = useState(() => anchor.getBoundingClientRect());
  const [hv, setHv] = useState(null); // 마우스를 댄 카드 { l, at }
  const hvT = useRef(0);
  const peek = (l, el) => { clearTimeout(hvT.current); hvT.current = setTimeout(() => setHv({ l, at: el.getBoundingClientRect() }), 300); };
  const unpeek = () => { clearTimeout(hvT.current); setHv(null); };
  useEffect(() => () => clearTimeout(hvT.current), []);
  const full = count >= MAX_PART_SHEETS;
  const put = patch => { setF(x => ({ ...x, ...patch })); setLimit(PAGE); };
  // 바깥을 누르면 닫는다 · 창 크기가 바뀌면 자리를 다시 잡는다
  useEffect(() => {
    const down = e => { if (box.current && !box.current.contains(e.target) && !anchor.contains(e.target)) close(); };
    const resize = () => setRect(anchor.getBoundingClientRect());
    document.addEventListener('mousedown', down, true); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('mousedown', down, true); window.removeEventListener('resize', resize); };
  }, []);
  const words = q.trim().split(/\s+/).map(squash).filter(Boolean);
  const label = l => (K.PARTS[l.p] ? K.PARTS[l.p].label : '');
  const hay = useMemo(() => new Map((lib ? lib.layouts : []).map(l => [l.f, squash([l.name, l.code, l.f, l.when, l.g, l.hl, label(l), DECKS[l.c] || ''].join(' '))])), [lib]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => (lib ? lib.layouts.filter(l => words.every(w => hay.get(l.f).includes(w))) : []), [lib, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = base.filter(l => pass(l, f));
  const partPool = base.filter(l => pass(l, f, 'part'));
  const grpN = countBy(partPool, l => GROUP_OF[l.p]); const partN = countBy(partPool, l => l.p);
  const pool = key => base.filter(l => pass(l, f, key));
  const indN = useMemo(() => { const m = {}; for (const l of pool('ind')) { const inds = indsOf(l); if (!inds.length) m._gen = (m._gen || 0) + 1; for (const i of inds) m[i] = (m[i] || 0) + 1; } return m; }, [base, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const solN = useMemo(() => { const m = {}; for (const l of pool('sol')) for (const s of new Set([l.sol, ...(l.sols || [])].filter(Boolean))) m[s] = (m[s] || 0) + 1; return m; }, [base, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const prodN = useMemo(() => countBy(pool('prod').flatMap(l => l.prods || []), x => x), [base, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const deckN = useMemo(() => countBy(pool('deck'), l => l.c), [base, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = Object.values(f).some(Boolean);
  // 더 보기 — 목록 끝이 보이면 다음 묶음
  useEffect(() => {
    const el = more.current; if (!el) return undefined;
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) setLimit(n => n + PAGE); }, { root: scroller.current, rootMargin: '200px' });
    io.observe(el); return () => io.disconnect();
  }, [list.length > limit]); // eslint-disable-line react-hooks/exhaustive-deps
  const vw = window.innerWidth, vh = window.innerHeight;
  const width = Math.min(720, vw - 24);
  // 버튼 아래 · 위 중 넓은 쪽 — 둘 다 좁으면(버튼이 화면 아래쪽) 열어 둔 채 여러 장을 고를 수 있게 화면 가운데에 길게
  const below = vh - rect.bottom - 12, above = rect.top - 12; const tall = Math.min(680, vh - 24);
  const vert = Math.max(below, above) < 420 ? { top: Math.max(12, (vh - tall) / 2), maxHeight: tall }
    : below >= above ? { top: rect.bottom + 6, maxHeight: Math.min(680, below) } : { bottom: vh - rect.top + 6, maxHeight: Math.min(680, above) };
  const style = { width, left: Math.max(12, Math.min(vw - width - 12, rect.left + rect.width / 2 - width / 2)), ...vert };
  const grp = f.grp && PART_GROUPS.find(g => g.k === f.grp);
  const sel = (key, value, opts, aria) => <label className={'lb-select' + (f[key] ? ' on' : '')}><select value={f[key]} aria-label={aria} onChange={e => put({ [key]: e.target.value })}>{opts}</select></label>;
  const n = x => (x ? ` (${x})` : ' (0)');
  return createPortal(<div ref={box} className="lb lb-picker" style={style} role="dialog" aria-label="레이아웃 추가" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
    <div className="lb-picker-h">
      <label className="search-field"><Icon name="search" size={15}/><input autoFocus value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE); }} placeholder="레이아웃 이름 · 코드 · 쓰는 상황 · 장면으로 찾기" aria-label="레이아웃 찾기"/>
        {q && <button type="button" className="lb-clear" aria-label="검색어 지우기" onClick={() => setQ('')}><Icon name="close" size={12}/></button>}</label>
      <span className="lb-picker-n"><b>{lib ? number(list.length) : '–'}</b>장</span>
      <span className={'lb-rule' + (full ? ' bad' : ' ok')} title="이 파트에 넣은 레이아웃">추가 <b>{count}</b> / {MAX_PART_SHEETS}</span>
      <IconButton icon="close" label="레이아웃 추가 닫기" onClick={close}/>
    </div>
    <div className="lb-picker-f">
      <div className="lb-chips" role="group" aria-label="목차 유형">
        <button type="button" className={'lb-fchip' + (!f.grp ? ' on' : '')} aria-pressed={!f.grp} onClick={() => put({ grp: '', part: '' })}>전체<i>{partPool.length}</i></button>
        {PART_GROUPS.map(g => <button key={g.k} type="button" className={'lb-fchip h-' + g.hue + (f.grp === g.k ? ' on' : '')} aria-pressed={f.grp === g.k} onClick={() => put({ grp: f.grp === g.k ? '' : g.k, part: '' })}>{g.label}<i>{grpN[g.k] || 0}</i></button>)}
      </div>
      {grp && <div className="lb-chips sub" role="group" aria-label={grp.label + ' 세부 유형'}>
        {grp.parts.filter(p => K.PARTS[p]).map(p => <button key={p} type="button" className={'lb-fchip h-' + grp.hue + (f.part === p ? ' on' : '')} aria-pressed={f.part === p} disabled={!partN[p] && f.part !== p} onClick={() => put({ part: f.part === p ? '' : p })}>{K.PARTS[p].label}<i>{partN[p] || 0}</i></button>)}
      </div>}
      <div className="lb-selects">
        {sel('ind', f.ind, [<option key="" value="">업종 전체</option>, <option key="_gen" value="_gen">범용{n(indN._gen)}</option>, <option key="_ind" value="_ind">업종 맞춤 전체</option>,
          ...(lib ? lib.industries : []).map(i => <option key={i.code} value={i.code} disabled={!indN[i.code] && f.ind !== i.code}>{i.name}{n(indN[i.code])}</option>)], '업종')}
        {sel('sol', f.sol, [<option key="" value="">솔루션 전체</option>, <option key="_none" value="_none">솔루션 전용 제외</option>,
          ...(lib ? lib.solutions : []).map(s => <option key={s.id} value={s.id} disabled={!solN[s.id] && f.sol !== s.id}>{s.name}{n(solN[s.id])}</option>)], '솔루션')}
        {sel('prod', f.prod, [<option key="" value="">제품 전체</option>, ...(lib ? lib.products : []).map(p => <option key={p.id} value={p.id} disabled={!prodN[p.id] && f.prod !== p.id}>{p.name}{n(prodN[p.id])}</option>)], '제품')}
        {sel('img', f.img, IMG_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>), '이미지 칸')}
        {sel('deck', f.deck, [<option key="" value="">원본 장표 전체</option>, ...Object.entries(DECKS).map(([k, t]) => <option key={k} value={k} disabled={!deckN[k] && f.deck !== k}>{t}{n(deckN[k])}</option>)], '원본 장표')}
        {active && <button type="button" className="text-button lb-reset" onClick={() => put(NO_FILTER)}><Icon name="refresh" size={12}/>필터 지우기</button>}
      </div>
    </div>
    <div ref={scroller} className="lb-picker-list" onScroll={unpeek}>
      {!lib ? <p className="lb-none">레이아웃 목록을 불러오는 중…</p> : !list.length ? <p className="lb-none">찾는 레이아웃이 없습니다.</p>
        : <ul className="lb-grid">{list.slice(0, limit).map(l => {
          const P = K.PARTS[l.p]; const c = used[l.f] || 0;
          return <li key={l.f}><button type="button" className={'lb-card' + (c ? ' used' : '')} data-f={l.f} disabled={full} aria-label={(l.name || l.f) + ' 추가' + (c ? ` · ${c}장 넣음` : '')}
            onClick={() => onPick(l)} onMouseEnter={e => peek(l, e.currentTarget)} onMouseLeave={unpeek} onFocus={e => peek(l, e.currentTarget)} onBlur={unpeek}>
            <LayoutFrame f={l.f} title={l.name || l.f}/>
            <span className="lb-card-t"><b>{l.name || l.f}</b><small>{l.code || l.f}{P ? ' · ' + P.label : ''}</small></span>
            {c > 0 && <em className="lb-card-used"><Icon name="check" size={10}/>추가됨{c > 1 ? ' ×' + c : ''}</em>}
          </button></li>;
        })}</ul>}
      {lib && list.length > limit && <div ref={more} className="lb-more" aria-hidden="true"/>}
    </div>
    {hv && lib && <LayoutHover K={K} lib={lib} l={hv.l} at={hv.at}/>}
  </div>, document.body);
}
