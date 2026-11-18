import React,{useEffect,useId,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {notify,dismissNotification,notificationSnapshot,subscribeNotifications,registerSlot,activeSlot,rootSlot} from '../services/notifications.js';
import '../styles/feedback.css';
import '../styles/status-slot.css';

/**
 * Operation feedback lives in the fixed popup layer, never in a page's layout — or, on a screen that opened a status slot
 * (Storyboard: 상단 바 가운데), in that slot.
 * group/unit/groupLabel: 같은 일을 여러 곳이 알릴 때(장마다 '채우는 중') 자리에서 한 줄로 묶는다 — groupLabel 의 {n} 은 unit 수.
 * detail: 자리 한 줄에 제목 옆으로 붙는 짧은 상태(서버 작업의 지금 단계). slotAction: 자리에서 누를 단추 { label, run } — 없으면
 * actionLabel/onAction. panel: true 면 누를 때 자리의 펼침 목록을 연다. attention: 답을 기다리는 일(진행보다 앞에 보인다).
 */
export function FeedbackPopup({message,kind='error',title,actionLabel,onAction,onDismiss,content,source,group,unit,groupLabel,detail,slotAction,attention}){
  const localId=useId(),id=source||'feedback-'+localId,action=useRef(onAction),dismiss=useRef(onDismiss),hidden=useRef(null);action.current=onAction;dismiss.current=onDismiss;
  const slotRun=useRef(slotAction&&slotAction.run);slotRun.current=slotAction&&slotAction.run;
  const slotLabel=slotAction&&slotAction.label,slotPanel=!!(slotAction&&slotAction.panel);
  // New JSX/callback identities during typing do not make a dismissed error new.
  // A changed message/status does; a hidden progress notice stays hidden until done.
  const feedbackKey=[id,message,kind,title,actionLabel,group,unit,groupLabel,detail,attention,slotLabel,slotPanel];
  useEffect(()=>{
    if(!message&&!content||hidden.current&&(hidden.current.kind!==kind||hidden.current.key[0]!==id||kind!=='progress'&&hidden.current.key.some((value,i)=>value!==feedbackKey[i])))hidden.current=null;
    if((message||content)&&!hidden.current)notify(message,kind,{id,title,actionLabel,onAction:()=>action.current?.(),onDismiss:()=>{hidden.current={kind,key:feedbackKey};dismiss.current?.();},content,group,unit,groupLabel,detail,attention:!!attention,
      slotAction:slotLabel?{label:slotLabel,panel:slotPanel,run:()=>slotRun.current?.()}:null,duration:kind==='progress'||content?0:kind==='error'?0:4500});
    else dismissNotification(id);
    return()=>dismissNotification(id);
  },[id,message,kind,title,actionLabel,content,group,unit,groupLabel,detail,attention,slotLabel,slotPanel]);
  return null;
}
export function NotificationHost(){
  const notices=useSyncExternalStore(subscribeNotifications,notificationSnapshot,notificationSnapshot);
  const slot=useSyncExternalStore(subscribeNotifications,activeSlot,activeSlot);
  if(slot)return null; // 이 화면은 알림을 제 자리(상단 바 가운데)에 보여 준다
  return createPortal(<aside className="feedback-popups" aria-label="작업 알림">{notices.map(notice=><section className={'feedback-popup '+notice.kind+(notice.content?' custom':'')} key={notice.id} role={notice.kind==='error'||notice.kind==='warn'?'alert':'status'} aria-label={notice.title||'작업 알림'}>
    <button type="button" className="feedback-close" aria-label="알림 닫기" onClick={()=>{dismissNotification(notice.id);notice.onDismiss?.();}}>×</button>
    {notice.content?<div className="feedback-content">{notice.content}</div>:<><div className="feedback-heading">{notice.kind==='progress'?<span className="feedback-spinner"/>:<span aria-hidden="true">{notice.kind==='error'||notice.kind==='warn'?'!':'✓'}</span>}<strong>{notice.title||(notice.kind==='error'?'요청을 처리하지 못했어요':notice.kind==='progress'?'처리 중':'알림')}</strong></div><div className="feedback-message">{notice.message}</div></>}
    {notice.onAction&&notice.actionLabel&&<div className="feedback-actions"><button type="button" className="btn btn-sm" onClick={()=>{dismissNotification(notice.id);notice.onAction();}}>{notice.actionLabel}</button></div>}
  </section>)}</aside>,document.body);
}

// ---------- 상단 바 가운데 작업 상태 자리 ----------
// 한 줄(테두리 없음): 가장 급한 일 하나 — 아이콘 · 제목 · 지금 단계 · 단추 하나 · 나머지 개수. 줄을 누르면 모든 일을 펼친다
// (긴 글은 펼친 목록에서 줄바꿈으로 다 보인다). 순서: 실패 · 경고 → 답을 기다리는 일 → 방금 알림 → 진행 중 → 끝난 작업 카드.
const isBad=n=>n.kind==='error'||n.kind==='warn';
const rank=n=>isBad(n)?0:n.attention?1:n.kind==='progress'?(n.content?3:3.5):n.content?4:2; // 진행 중에서는 서버 작업(멈추기 · 단계)이 장 채우기보다 앞
const SHORT={progress:'진행 중',error:'확인 필요',warn:'확인 필요',info:'알림','':'알림'};
function entriesOf(notices){
  const out=[],byKey=new Map();
  for(const n of notices){
    // 실패는 이유마다 따로(같은 이유로 실패한 장끼리만 묶는다) — 다른 이유가 하나에 가려지지 않게
    const key=n.group?'g:'+n.group+':'+n.kind+(isBad(n)?':'+String(n.message||''):''):n.id;
    let e=byKey.get(key);
    if(!e){e={key,list:[]};byKey.set(key,e);out.push(e);}
    e.list.push(n);
  }
  return out.map(e=>{
    const n=e.list.reduce((a,b)=>(b.at||0)>=(a.at||0)?b:a);
    const count=new Set(e.list.map(x=>x.unit??x.id)).size;
    const head=n.group?String(n.groupLabel||n.message||'').replace('{n}',count):n.content?String(n.message||''):String(n.title||n.message||'');
    const sub=n.group?(isBad(n)?String(n.message||''):''):n.content?String(n.detail||''):n.title?String(n.message||''):'';
    const runAll=fn=>()=>e.list.forEach(x=>fn(x));
    const act=n.slotAction?{label:n.slotAction.label,panel:n.slotAction.panel,run:n.group?runAll(x=>x.slotAction?.run?.()):n.slotAction.run}
      :n.onAction&&n.actionLabel?{label:n.actionLabel,run:runAll(x=>{if(x.kind!=='progress')dismissNotification(x.id);x.onAction?.();})}:null;
    const close=n.kind==='progress'?null:runAll(x=>{dismissNotification(x.id);x.onDismiss?.();});
    return {key:e.key,n,kind:n.kind||'info',attention:!!n.attention,head,sub,act,close,content:n.group?null:n.content||null,rank:rank(n),at:n.at||0};
  }).sort((a,b)=>a.rank-b.rank||b.at-a.at);
}
const Spin=()=><span className="ts-spin" aria-hidden="true"/>;
function Mark({e}){
  if(e.kind==='progress'&&!e.attention)return <Spin/>;
  const bad=e.kind==='error'||e.kind==='warn';
  return <span className={'ts-mark '+(bad?'bad':e.attention?'ask':'ok')} aria-hidden="true">{bad||e.attention?'!':<svg width="10" height="10" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>;
}
const Close=({onClick,label='알림 닫기'})=><button type="button" className="ts-x" aria-label={label} onClick={onClick}><svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/></svg></button>;

/** Opens the status slot. root: the screen's own slot (상단 바 가운데). Without root: a modal header taking over while it covers it. */
export function StatusSlot({root=false,className=''}){
  const ref=useRef(null),bar=useRef(null),token=useRef(null);
  useLayoutEffect(()=>{const t={root,el:ref.current};token.current=t;return registerSlot(t);},[root]);
  const notices=useSyncExternalStore(subscribeNotifications,notificationSnapshot,notificationSnapshot);
  const active=useSyncExternalStore(subscribeNotifications,activeSlot,activeSlot);
  const mine=!!token.current&&active===token.current;
  const list=mine?entriesOf(notices):[];
  const [open,setOpen]=useState(false);
  useEffect(()=>{if(!list.length||!mine)setOpen(false);},[list.length,mine]);
  const top=list[0];
  return <div ref={ref} className={'top-status'+(root?' root':'')+(className?' '+className:'')}>
    {top&&<div ref={bar} className={'ts-bar k-'+top.kind+(top.attention?' ask':'')} role={top.rank===0?'alert':'status'} aria-live="polite">
      <Mark e={top}/>
      <button type="button" className="ts-text" aria-expanded={open} aria-haspopup="dialog" title={[top.head,top.sub].filter(Boolean).join(' · ')} onClick={()=>setOpen(v=>!v)}>
        <span className="ts-full"><b className="ts-head">{top.head}</b>{top.sub&&<span className="ts-sub">{top.sub}</span>}</span>
        <span className="ts-short">{top.attention?'답 필요':SHORT[top.kind]||'알림'}</span>
        {list.length>1&&<span className="ts-more num">+{list.length-1}</span>}
        <svg className="ts-chev" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {top.act&&<button type="button" className="ts-act" onClick={()=>top.act.panel?setOpen(true):top.act.run()}>{top.act.label}</button>}
      {top.close&&<Close onClick={top.close}/>}
    </div>}
    {open&&top&&<StatusPanel list={list} anchor={bar} onClose={()=>setOpen(false)}/>}
  </div>;
}
function StatusPanel({list,anchor,onClose}){
  const ref=useRef(null),[pos,setPos]=useState(null);
  useLayoutEffect(()=>{
    const place=()=>{const a=anchor.current;if(!a)return;const r=a.getBoundingClientRect(),w=Math.min(420,innerWidth-24);
      const left=Math.max(12,Math.min(innerWidth-12-w,r.left+r.width/2-w/2));setPos({left,top:r.bottom+8,width:w,maxHeight:Math.max(160,innerHeight-r.bottom-20)});};
    place();addEventListener('resize',place);return()=>removeEventListener('resize',place);
  },[anchor]);
  useEffect(()=>{
    const down=e=>{if(ref.current&&!ref.current.contains(e.target)&&!(anchor.current&&anchor.current.contains(e.target)))onClose();};
    const key=e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};
    document.addEventListener('mousedown',down,true);document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('mousedown',down,true);document.removeEventListener('keydown',key,true);};
  },[onClose,anchor]);
  return createPortal(<div ref={ref} className="ts-panel" role="dialog" aria-label="작업 상태" style={pos||{visibility:'hidden'}}>
    {list.map(e=>e.content?<div key={e.key} className="ts-row ts-card">{e.content}</div>:<div key={e.key} className={'ts-row k-'+e.kind}>
      <Mark e={e}/>
      <div className="ts-row-t"><b>{e.head}</b>{e.sub&&<p>{e.sub}</p>}</div>
      <div className="ts-row-a">
        {e.act&&!e.act.panel&&<button type="button" className="ts-act" onClick={e.act.run}>{e.act.label}</button>}
        {e.close&&<Close onClick={e.close}/>}
      </div>
    </div>)}
  </div>,document.body);
}

/** A modal that covers the screen's status slot opens its own in its header — true while it covers it. */
export function useCoversStatusSlot(ref){
  const root=useSyncExternalStore(subscribeNotifications,rootSlot,rootSlot);
  const [on,setOn]=useState(false);
  useLayoutEffect(()=>{
    const m=ref.current,el=root&&root.el;
    if(!m||!el){setOn(false);return undefined;}
    // offset* 은 열릴 때 움직이는 효과(transform)와 관계없는 실제 자리 — .mback(fixed) 기준이라 곧 화면 좌표다
    const check=()=>{const r=el.getBoundingClientRect(),top=m.offsetTop,left=m.offsetLeft;setOn(top<r.bottom&&top+m.offsetHeight>r.top&&left<r.right&&left+m.offsetWidth>r.left);};
    check();const ro=new ResizeObserver(check);ro.observe(m);addEventListener('resize',check);
    return()=>{ro.disconnect();removeEventListener('resize',check);};
  },[root,ref]);
  return on;
}
