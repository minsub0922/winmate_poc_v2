import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { mentionSearch } from '../services/search.js';
import { refInfo, TYPE_LABEL, IND, S, P, C, CANVAS } from '../services/catalog.js';
import { linkTags, configureLinkTags } from '../services/links.js';
import { PARTS, REQ_LABEL } from '../domain/proposals/parts.js';
import { Slide } from '../domain/slides/Slide.jsx';
import { Thumb } from './Thumbs.jsx';
import {NotificationHost} from './feedback-popup.jsx';
import {notify} from '../services/notifications.js';
import { TagChip, tagMeta, mentionThumbHtml, mentionShort, mentionTitle } from './tagcard.jsx';

// ---------- icons ----------
const PATHS = {
  // part-type icons
  'p-check': 'M10 6h10 M10 12h10 M10 18h10 M3.5 6l1.5 1.5L7.5 5 M3.5 12l1.5 1.5L7.5 11 M3.5 18l1.5 1.5L7.5 17',
  'p-market': 'M4 20v-5 M9 20v-8 M14 20v-6 M19 20v-9 M3 20h18 M4 10l5-4 4 3 7-6 M16 3h4v4',
  'p-scale': 'M12 4v16 M8 20h8 M5 7h14 M5 7l-3 6h6z M19 7l-3 6h6z',
  'p-bulb': 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  'p-boxes': 'M3 13h8v8H3z M13 13h8v8h-8z M8 3h8v8H8z',
  'p-trophy': 'M8 4h8v6a4 4 0 0 1-8 0z M8 6H5v1a3 3 0 0 0 3 3 M16 6h3v1a3 3 0 0 1-3 3 M12 14v4 M8 21h8 M9.5 18h5',
  'p-ruler': 'M4 17L17 4l3 3L7 20z M8.5 12.5l1.5 1.5 M11 10l1.5 1.5 M13.5 7.5l1.5 1.5',
  'p-cover': 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3 M9 7h6 M9 10h4',
  'p-clip': 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', check: 'M5 12l5 5L20 7', chev: 'M9 6l6 6-6 6', chevL: 'M15 6l-6 6 6 6', chevD: 'M6 9l6 6 6-6', chevU: 'M6 15l6-6 6 6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.5-4.5', home: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5', menu: 'M4 7h16M4 12h16M4 17h16',
  doc: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6', clip: 'M9 4h6v3H9z M7 5.5H5V21h14V5.5h-2 M8.5 12h7 M8.5 16h5', chart: 'M4 20V10 M10 20V4 M16 20v-8 M22 20H2',
  building: 'M5 21V4h10v17 M15 9h4v12 M8 8h4 M8 12h4 M8 16h4 M3 21h18', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21c.8-4 3.6-6 7-6s6.2 2 7 6 M16 4a4 4 0 0 1 0 7 M18 15c2 .6 3.4 2.6 4 6',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 11.5v1', funnel: 'M3 5h18l-7 8v6l-4 2v-8z', alert: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  gem: 'M6 4h12l3 5-9 11L3 9z M3 9h18 M9.5 9L12 20l2.5-11', trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6', map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  monitor: 'M3 4h18v12H3z M8 20h8 M12 16v4', list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.5 M4 12h.5 M4 18h.5', route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5', layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5', sliders: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M16 4v4 M10 10v4 M18 16v4',
  calendar: 'M4 5h16v16H4z M4 10h16 M9 3v4 M15 3v4', coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9.5c0-1.4 1.3-2 3-2s3 .7 3 2-1.5 1.8-3 2.2-3 .9-3 2.3 1.3 2 3 2 3-.6 3-2 M12 6v1.5 M12 16.5V18',
  cover: 'M4 4h16v16H4z M4 15l5-5 4 4 2-2 5 5', flag: 'M5 21V4 M5 4h11l-2 4 2 4H5', book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5',
  sparkle: 'M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  upload: 'M12 15V4 M7 9l5-5 5 5 M4 15v5h16v-5', file: 'M7 3h7l5 5v13H7z M14 3v5h5', grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13', edit: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  panel: 'M3 4h18v16H3z M14 4v16', panelOff: 'M3 4h18v16H3z M14 4v16 M17 10l-2 2 2 2', download: 'M12 4v11 M7 10l5 5 5-5 M4 20h16', image: 'M3 5h18v14H3z M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 19',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5A9 9 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0z M8 11.5h.01 M12.5 11.5h.01 M17 11.5h.01',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9.1 9a3 3 0 0 1 5.8 1c0 2-2.9 2.2-2.9 4 M12 17v.01',
  notice: 'M12 5v9.5 M12 19v.2',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8v.5', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ext: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6', dots: 'M5 12h.01 M12 12h.01 M19 12h.01', arrowR: 'M5 12h14 M13 6l6 6-6 6', arrowL: 'M19 12H5 M11 6l-6 6 6 6', minus: 'M5 12h14',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5', swap: 'M7 7h13l-3-3 M17 17H4l3 3', product: 'M3 4h18v12H3z M8 20h8 M12 16v4', solution: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5', case: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z',
  clipCheck: 'M9 4h6v3H9z M7 5.5H5V21h14V5.5h-2 M8.5 14l2.5 2.5 4.5-5', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  history: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2',
  pin: 'm16 3 5 5-4 1-4 4 1 3-2 2-6-6 2-2 3 1 4-4z M8 16l-5 5',
  form: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5',
  // My 템플릿 · 레이아웃 편집기
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c1-4 4-6 8-6s7 2 8 6', undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3', redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1', front: 'M9 9h11v11H9z M4 15V4h11', back: 'M4 4h11v11H4z M9 20h11V9', type: 'M5 7V4h14v3 M12 4v16 M9 20h6',
  palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1-.9-1.4-.9-2.3 0-.9.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-4.9-4-8.8-9-8.8z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7z M7 12h7a4 4 0 0 1 0 8H7z', italic: 'M10 4h8 M6 20h8 M14 4l-4 16', alignL: 'M4 6h16 M4 10h10 M4 14h16 M4 18h10', alignC: 'M4 6h16 M7 10h10 M4 14h16 M7 18h10', alignR: 'M4 6h16 M10 10h10 M4 14h16 M10 18h10',
  parent: 'M4 4h16v16H4z M8 8h8v8H8z', move: 'M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3', text: 'M5 6h14 M5 12h14 M5 18h9', refresh: 'M20 11a8 8 0 0 0-14.9-3.5 M4 5v3h3 M4 13a8 8 0 0 0 14.9 3.5 M20 19v-3h-3', wand: 'M15 4V2 M15 10V8 M11 6h2 M17 6h2 M3 21l12-12 M13 7l4 4',
};
export function Icon({ name, size = 16, stroke = 2, className = '', title }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} aria-label={title}>
      <path d={PATHS[name] || PATHS.dots} />
    </svg>
  );
}

// ---------- toasts ----------
export function toast(msg, kind = '', options) { return notify(msg,kind,options); }
export function Toasts() {
  return <><DeleteConfirmations/><NotificationHost/></>;
}

const deleteRequests=[];
const deleteSubscribers=new Set();
const notifyDelete=()=>{for(const subscriber of deleteSubscribers)subscriber();};
export function confirmDelete(options={}) {
  return new Promise(resolve=>{deleteRequests.push({title:'삭제할까요?',message:'선택한 내용을 삭제합니다.',...options,resolve});notifyDelete();});
}
function DeleteConfirmations(){
  const [,refresh]=useState(0);
  useEffect(()=>{const update=()=>refresh(n=>n+1);deleteSubscribers.add(update);update();return()=>deleteSubscribers.delete(update);},[]);
  const request=deleteRequests[0];
  if(!request)return null;
  const finish=accepted=>{if(deleteRequests[0]!==request)return;deleteRequests.shift();request.resolve(accepted);notifyDelete();};
  return <Modal title={request.title} size="narrow delete-confirmation" onClose={()=>finish(false)} onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const buttons=[...event.currentTarget.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }}
    footer={<><button type="button" className="btn" data-autofocus onClick={()=>finish(false)}>취소</button><button type="button" className="btn btn-danger" onClick={()=>finish(true)}>{request.confirmLabel||'삭제'}</button></>}>
    <p>{request.message}</p>{request.items?.length>0&&<ul className="delete-confirmation-items">{request.items.map((item,i)=><li key={i}>{item}</li>)}</ul>}
  </Modal>;
}
export function DeleteButton({onClick,confirmation,disabled,children,...props}){
  const [waiting,setWaiting]=useState(false);
  return <button type="button" {...props} disabled={disabled||waiting} onClick={async event=>{
    const trigger=event.currentTarget;event.preventDefault();event.stopPropagation();setWaiting(true);
    try{if(await confirmDelete(confirmation))await onClick?.(event);}catch(error){toast(error.message||'삭제하지 못했어요.');}finally{setWaiting(false);requestAnimationFrame(()=>{if(trigger.isConnected)trigger.focus({preventScroll:true});});}
  }}>{children}</button>;
}

// ---------- modal ----------
const MODAL_STACK = [];
export function Modal({ title, sub, onClose, children, footer, size = '', labelledBy, bodyClass = 'mbody', bodyStyle, role = 'dialog', describedBy, onKeyDown, headerActions }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const prev = document.activeElement;
    const me = {};
    MODAL_STACK.push(me);
    const onKey = (e) => {
      if (e.key !== 'Escape' || MODAL_STACK[MODAL_STACK.length - 1] !== me) return;
      if (e.target && e.target.isContentEditable) return; // let inline editors finish first
      e.stopPropagation(); closeRef.current && closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const el = ref.current?.querySelector('[data-autofocus]') || ref.current;
    el?.focus({ preventScroll: true });
    return () => { MODAL_STACK.splice(MODAL_STACK.indexOf(me), 1); document.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus({ preventScroll: true }); };
  }, []);
  return createPortal(
    <div className="mback" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current && closeRef.current(); }}>
      <div ref={ref} tabIndex={-1} className={'modal ' + size} role={role} aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} aria-describedby={describedBy} onKeyDown={onKeyDown}>
        {title != null && (
          <div className="mhead">
            <div style={{ minWidth: 0 }}><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
            {headerActions ? <div className="mhead-actions">{headerActions}<button className="btn btn-ghost btn-icon x" onClick={onClose} aria-label="닫기"><Icon name="x" /></button></div>
              : <button className="btn btn-ghost btn-icon x" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>}
          </div>
        )}
        <div className={bodyClass} style={bodyStyle}>{children}</div>
        {footer && <div className="mfoot">{footer}</div>}
      </div>
    </div>, document.body);
}

// ---------- chips ----------
/** 태그 칩 — 썸네일 + 이름 + 요약 한 줄 (tagcard.jsx TagChip) */
export function RefChip({ r, onRemove, onClick, peek }) {
  return <TagChip r={r} onRemove={onRemove} onClick={onClick} peek={peek} />;
}

// ---------- mention menu ----------
export function MentionMenu({ query, anchor, onPick, onClose, exclude = [], types = null, activeRef, includeAll = true, initialType, skills = [] }) {
  const menu = useRef(null);
  const [tab, setTab] = useState(initialType || (types && types.length === 1 ? types[0] : includeAll ? 'all' : 'product'));
  const [active, setActive] = useState(0);
  const groups = mentionSearch(query, { types: tab === 'all' ? types : [tab], exclude, limit: tab === 'all' ? 5 : 12 });
  const q = String(query || '').trim().toLowerCase();
  groups.skill = tab === 'skill' ? skills.filter(s => !q || [s.name, s.description, ...(s.keywords || [])].join(' ').toLowerCase().includes(q)).map(s => ({ ref:'skill:' + s.id, type:'skill', label:s.name, sub:s.description, icon:s.icon })) : [];
  const flat = [...groups.product, ...groups.solution, ...groups.case, ...groups.skill];
  useEffect(() => { setActive(0); }, [query, tab]);
  useEffect(() => { menu.current?.querySelector('.mopt[aria-selected="true"]')?.scrollIntoView({ block:'nearest' }); }, [active, tab]);
  useEffect(() => {
    if (!activeRef) return;
    activeRef.current = {
      key: (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); return true; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); return true; }
        if (e.key === 'Enter' || e.key === 'Tab') { if (flat[active]) { e.preventDefault(); onPick(flat[active].ref); return true; } }
        if (e.key === 'Escape') { e.preventDefault(); onClose(); return true; }
        return false;
      },
    };
  });
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  // 입력칸을 가리지 않게: 아래 · 위 중 들어갈 자리를 고르고, 높이를 그 자리만큼으로 줄인다. 위로 열 때는 입력칸 윗변에 붙인다.
  // 검색 입력칸(anchor.width)이면 폭도 입력칸에 맞춘다.
  useLayoutEffect(() => {
    if (!anchor) return;
    const vw = window.innerWidth, vh = window.innerHeight, M = 12, GAP = 6, MAXH = 420;
    const w = Math.min(anchor.width ? Math.min(Math.max(anchor.width, 320), 640) : 420, vw - M * 2);
    const left = Math.min(Math.max(M, anchor.left), vw - w - M);
    const below = vh - anchor.bottom - GAP - M, above = anchor.top - GAP - M;
    if (below >= Math.min(MAXH, 280) || below >= above) setPos({ left, width: w, top: anchor.bottom + GAP, bottom: 'auto', maxHeight: Math.max(120, Math.min(MAXH, below)) });
    else setPos({ left, width: w, top: 'auto', bottom: vh - anchor.top + GAP, maxHeight: Math.min(MAXH, above) });
  }, [anchor && anchor.left, anchor && anchor.top, anchor && anchor.bottom, anchor && anchor.width]);
  let idx = -1;
  const sec = (k, label) => groups[k].length ? (
    <div key={k}>
      {tab === 'all' && <div className="mmenu-g">{label}</div>}
      {groups[k].map((o) => { idx++; const i = idx; const tm = tagMeta(o.ref); const f2 = tm && (tm.type === 'solution' ? ['설명', tm.sub] : tm.facts.find(([fk]) => fk !== '사양')); return (
        <button key={o.ref} className={'mopt ' + o.type} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); onPick(o.ref); }} onMouseEnter={() => setActive(i)}>
          <span className="mo-th">{k === 'skill' ? <Icon name={o.icon || 'sparkle'} size={22} /> : <Thumb r={o.ref} />}</span>
          <span style={{ minWidth: 0 }}>
            <div className="l">{o.label}</div>
            <div className={'s' + (o.type === 'product' ? ' num' : '')}>{tm ? (o.type === 'case' ? tm.line : [tm.kind, tm.line].filter((x, j, a) => x && a.indexOf(x) === j).join(' · ')) : o.sub}</div>
            {f2 && <div className="s2">{f2[0]} · {f2[1]}</div>}
          </span>
          <span className="d">{o.type === 'case' ? (o.date || '').slice(0, 7) : ''}</span>
        </button>); })}
    </div>) : null;
  return createPortal(
    <div ref={menu} className="mmenu" style={pos} onMouseDown={(e) => e.preventDefault()} role="listbox" aria-label={skills.length ? '제품 · 솔루션 · 유관사례 · 스킬 찾기' : '제품 · 솔루션 · 유관사례 찾기'}>
      <div className="mmenu-tabs">
        {[...(includeAll ? [['all', '전체']] : []), ['product', '제품'], ['solution', '솔루션'], ['case', '유관사례'], ...(skills.length ? [['skill','스킬']] : [])].filter(([k]) => k === 'all' || k === 'skill' || !types || types.includes(k)).map(([k, l]) => (
          <button key={k} className={k === 'skill' ? 'mmenu-skill-tab' : undefined} aria-label={l} aria-pressed={tab === k} onMouseDown={(e) => { e.preventDefault(); setTab(k); }}>{k==='skill'&&<Icon name="sparkle" size={14}/>}<span>{l}</span>{k==='skill'&&<small aria-hidden="true">AI</small>}</button>
        ))}
        <span className="mmenu-q">{query ? '“' + query + '”' : '이름 · 모델 · 키워드'} <span className="kbd">↑↓</span> <span className="kbd">Enter</span></span>
      </div>
      <div className="mmenu-list">
        {flat.length ? [sec('product', '제품'), sec('solution', '솔루션'), sec('case', '유관사례'), sec('skill','스킬')] : <div className="mmenu-empty">“{query}”와 맞는 항목이 없어요</div>}
      </div>
    </div>, document.body);
}

// ---------- mention editor (contentEditable with chips) ----------
function chipEl(ref) {
  const info = refInfo(ref); const sp = document.createElement('span');
  sp.className = 'mention has-th'; sp.contentEditable = 'false'; sp.dataset.ref = ref; sp.dataset.type = info ? info.type : 'x';
  if (info) sp.title = mentionTitle(ref);
  sp.innerHTML = info ? mentionThumbHtml(ref) : '';
  sp.appendChild(document.createTextNode('@' + (info ? mentionShort(ref) || info.short || info.label : ref)));
  return sp;
}
// 링크 태그(src/linktag.js)가 앱 제품 · 썸네일을 쓰도록 열어 둠
configureLinkTags({ tag: () => ({ info: refInfo, thumb: mentionThumbHtml, short: mentionShort, title: mentionTitle }), data: () => ({ P, S, C }) });
function renderSegs(el, segs) {
  el.innerHTML = '';
  for (const s of segs || []) {
    if (s.ref) el.appendChild(chipEl(s.ref));
    else if (s.link && linkTags) el.appendChild(linkTags.chip(s.t, s.link)); // { t: url, link: { title, site, img, ref } }
    else el.appendChild(document.createTextNode(s.t));
  }
}
function readSegs(el) {
  const out = [];
  const push = (t) => { if (!t) return; const l = out[out.length - 1]; if (l && l.t != null && !l.link) l.t += t; else out.push({ t }); };
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) push(c.data);
      else if (c.nodeType === 1 && c.dataset && c.dataset.link && linkTags) out.push({ t: c.dataset.link, link: linkTags.meta(c) });
      else if (c.nodeType === 1 && c.dataset && c.dataset.ref) out.push({ ref: c.dataset.ref });
      else if (c.nodeType === 1 && c.tagName === 'BR') push('\n');
      else if (c.nodeType === 1) { if (c.tagName === 'DIV' && out.length) push('\n'); walk(c); }
    }
  };
  walk(el);
  return out;
}
export function MentionEditor({ value, onChange, onMention, placeholder, single = false, label, id, exclude, peek, onEnter, describedBy, mentionOptions }) {
  const el = useRef(null);
  const last = useRef('');
  const [m, setM] = useState(null); // {q, anchor}
  const menuKeys = useRef(null);
  useFollowScroll(!!m, () => detect());
  useLayoutEffect(() => {
    const k = JSON.stringify(value || []);
    if (k !== last.current && el.current) { renderSegs(el.current, value); last.current = k; }
  }, [value]);
  const emit = () => { const s = readSegs(el.current); const k = JSON.stringify(s); if (k !== last.current) { last.current = k; onChange(s); } };
  const detect = () => {
    const sel = window.getSelection(); if (!sel.rangeCount) return setM(null);
    const r = sel.getRangeAt(0); const n = r.startContainer;
    if (n.nodeType !== 3 || !el.current.contains(n)) return setM(null);
    const before = n.data.slice(0, r.startOffset);
    const mm = before.match(/(^|[\s(])@([^\s@]{0,20}(?: [^\s@]{0,14})?)$/);
    if (!mm) return setM(null);
    const rr = document.createRange(); rr.setStart(n, r.startOffset - mm[2].length - 1); rr.setEnd(n, r.startOffset);
    const rect = rr.getBoundingClientRect();
    setM({ q: mm[2], anchor: { left: rect.left, top: rect.top, bottom: rect.bottom }, node: n, start: r.startOffset - mm[2].length - 1, end: r.startOffset });
  };
  const pick = (ref) => {
    if (!m) return;
    const { node, start, end } = m;
    const after = node.splitText(start); after.data = after.data.slice(end - start);
    const skill = ref.startsWith('skill:') && mentionOptions?.onSkillPick;
    const chip = skill ? null : chipEl(ref); const sp = document.createTextNode(' ');
    if (chip) node.parentNode.insertBefore(chip, after); node.parentNode.insertBefore(sp, after);
    const sel = window.getSelection(); const r = document.createRange(); r.setStart(sp, 1); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    setM(null); emit(); if (skill) mentionOptions.onSkillPick(ref.slice(6), readSegs(el.current)); else onMention && onMention(ref);
  };
  const onKeyDown = (e) => {
    if (m && menuKeys.current && menuKeys.current.key(e)) return;
    if (e.key === 'Enter' && onEnter && !e.shiftKey) { // chat input: Enter sends (Shift+Enter = new line); let the IME finish composing first
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault(); onEnter(); return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!single) document.execCommand('insertText', false, '\n');
    }
  };
  const onPaste = (e) => { e.preventDefault(); const t = e.clipboardData.getData('text/plain'); if (linkTags && linkTags.paste(t, el.current, single, emit, onMention)) return; document.execCommand('insertText', false, single ? t.replace(/\n+/g, ' ') : t); };
  return (
    <div className="mention-editor">
      <div ref={el} id={id} className={'me-area' + (single ? ' single' : '')} contentEditable suppressContentEditableWarning role="textbox" aria-multiline={!single} aria-label={label || placeholder} aria-describedby={describedBy}
        data-ph={placeholder} onInput={() => { emit(); detect(); }} onKeyDown={onKeyDown} onKeyUp={(e) => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) detect(); }}
        onClick={detect} onBlur={() => setTimeout(() => setM(null), 120)} onPaste={onPaste}
        onMouseOver={peek ? (e) => { const c = e.target.closest && e.target.closest('.mention[data-ref]'); if (c && el.current.contains(c) && !m) peek.show(c.dataset.ref, c); } : undefined}
        onMouseOut={peek ? (e) => { const c = e.target.closest && e.target.closest('.mention[data-ref]'); if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) peek.hide(e); } : undefined} />
      {m && <MentionMenu {...mentionOptions} query={m.q} anchor={m.anchor} onPick={pick} onClose={() => setM(null)} activeRef={menuKeys} exclude={exclude} />}
    </div>
  );
}

/** 메뉴가 열려 있는 동안 페이지 · 팝업이 스크롤되거나 창 크기가 바뀌면 다시 재서 입력칸을 따라가게 한다 (메뉴 안 스크롤은 무시). */
function useFollowScroll(on, fn) {
  const f = useRef(fn); f.current = fn;
  useEffect(() => {
    if (!on) return undefined;
    let raf = 0;
    const h = (e) => { if (e && e.target instanceof Element && e.target.closest('.mmenu')) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => f.current()); };
    window.addEventListener('scroll', h, true); window.addEventListener('resize', h);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h); };
  }, [on]);
}

// ---------- add-ref search input ----------
export function AddRefInput({ onAdd, types = null, exclude = [], placeholder = '@ 제품 · 솔루션 · 유관사례 찾아 추가', id }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inp = useRef(null);
  const keys = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const measure = () => { const r = inp.current.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return false; } setAnchor({ left: r.left, top: r.top, bottom: r.bottom, width: r.width }); return true; };
  const show = () => { if (measure()) setOpen(true); };
  useFollowScroll(open, measure);
  return (
    <div className="addref">
      <span className="lens"><Icon name="search" size={15} /></span>
      <label className="sr" htmlFor={id}>{placeholder}</label>
      <input ref={inp} id={id} className="input" value={q} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); show(); }} onFocus={show} onBlur={() => setTimeout(() => setOpen(false), 140)}
        onKeyDown={(e) => { if (open && keys.current && keys.current.key(e)) return; }} />
      {open && <MentionMenu query={q.replace(/^@/, '')} anchor={anchor} types={types} exclude={exclude} activeRef={keys} onClose={() => setOpen(false)} onPick={(ref) => { onAdd(ref); setQ(''); setOpen(false); }} />}
    </div>
  );
}

// ---------- layout metadata ----------
export function partHue(type) { return 'h-' + ((PARTS[type] && PARTS[type].hue) || 'slate'); }
export function LayoutMeta({ l, compact = false, peek }) {
  if (!l) return null;
  const pt = PARTS[l.p];
  return (
    <dl className="meta-grid">
      <dt>파트 유형</dt><dd><span className={'tag pt ' + partHue(l.p)}>{pt ? pt.label : l.p}</span>{l.p2 && PARTS[l.p2] ? <span className="tag" style={{ marginLeft: "var(--space-4px)" }}>{PARTS[l.p2].label}</span> : null}</dd>
      <dt>언제 쓰나</dt><dd>{l.when || l.g}</dd>
      {!compact && <><dt>묶음</dt><dd>{l.g}</dd></>}
      <dt>업종 · 솔루션</dt><dd>{l.ind && IND[l.ind] ? IND[l.ind].name : '범용'}{l.sol && S[l.sol] ? ' · ' + S[l.sol].name + ' 전용' : ''}</dd>
      <dt>필요한 정보</dt><dd><div className="tagrow">{(l.req || []).map((r) => <span key={r} className="tag rq">{REQ_LABEL[r] || r}</span>)}</div></dd>
      {!compact && l.prods && l.prods.length ? <><dt>예시 제품</dt><dd><div className="tagchips">{l.prods.filter((id) => P[id]).map((id) => <TagChip key={id} r={'product:' + id} label={P[id].model} peek={peek} />)}</div></dd></> : null}
      {!compact && (() => { const cv = CANVAS[l.cv] || CANVAS[l.c]; return <><dt>원본</dt><dd>{cv && cv.url ? <a href={cv.url} target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>{cv.name}</a> : (cv ? cv.name : l.c)}</dd></>; })()}
    </dl>
  );
}

// ---------- hover card ----------
export function useHoverCard() {
  const [hc, setHc] = useState(null);
  const t = useRef(null);
  const show = useCallback((l, el) => { clearTimeout(t.current); t.current = setTimeout(() => { const r = el.getBoundingClientRect(); setHc({ l, r }); }, 260); }, []);
  const hide = useCallback(() => { clearTimeout(t.current); setHc(null); }, []);
  const node = hc ? <HoverCard l={hc.l} r={hc.r} /> : null;
  return { show, hide, node };
}
function HoverCard({ l, r }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(0);
  const W = Math.min(720, window.innerWidth - 24);
  useLayoutEffect(() => { setHeight(ref.current?.offsetHeight || 0); }, [l.f, W]);
  let left = r.right + 12; if (left + W > window.innerWidth - 12) left = r.left - W - 12; if (left < 12) left = 12;
  const top = Math.max(12, Math.min(r.top - 20, window.innerHeight - height - 12));
  return createPortal(
    <div ref={ref} className="hovercard" style={{ left, top, width: W }} role="tooltip">
      <div style={{ display: 'flex', gap: "var(--space-8px)", alignItems: 'baseline' }}><b style={{ fontSize: "var(--text-15px)" }}>{l.name}</b></div>
      <Slide f={l.f} width={W - 26} />
      {l.hl && <div style={{ fontSize: "var(--text-12-5px)", color: 'var(--ink-2)' }}>예시 제목 · {l.hl}</div>}
      <LayoutMeta l={l} compact />
    </div>, document.body);
}

export function fmtWhen(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return '방금'; if (d < 3600) return Math.floor(d / 60) + '분 전'; if (d < 86400) return Math.floor(d / 3600) + '시간 전';
  if (d < 86400 * 7) return Math.floor(d / 86400) + '일 전';
  const t = new Date(ts); return (t.getMonth() + 1) + '/' + t.getDate();
}
export { TYPE_LABEL };
