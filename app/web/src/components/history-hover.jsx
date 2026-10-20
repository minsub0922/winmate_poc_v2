import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './common.jsx';
import { HistoryRequirementsPreview } from './history-requirements-preview.jsx';
import { HistoryContextPreview } from './history-context-preview.jsx';

/** Hover is read-only: selection and import remain owned by the history list. */
export function useHistoryHover(kind) {
  const [entry,setEntry]=useState(null), showTimer=useRef(), hideTimer=useRef(), anchor=useRef(), card=useRef(), ignoreFocus=useRef(false);
  const id=useId();
  const clear=useCallback(()=>{clearTimeout(showTimer.current);clearTimeout(hideTimer.current);},[]);
  const hide=useCallback((restore=false)=>{
    clear();const returnFocus=restore && card.current?.contains(document.activeElement);setEntry(null);
    if(returnFocus && anchor.current?.isConnected){ignoreFocus.current=true;anchor.current.focus({preventScroll:true});queueMicrotask(()=>{ignoreFocus.current=false;});}
  },[clear]);
  const show=(source,element)=>{
    clear();anchor.current=element;
    showTimer.current=setTimeout(()=>{if(element.isConnected)setEntry({source,rect:element.getBoundingClientRect()});},200);
  };
  const leave=()=>{clear();hideTimer.current=setTimeout(()=>setEntry(null),180);};
  const keep=()=>clearTimeout(hideTimer.current);
  useEffect(()=>()=>clear(),[clear]);
  useEffect(()=>{
    if(!entry)return;
    const key=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide(true);}};
    const resize=()=>hide();
    window.addEventListener('keydown',key,true);window.addEventListener('resize',resize);
    return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('resize',resize);};
  },[!!entry,hide]);
  const bind=source=>({
    onMouseEnter:event=>{if(window.matchMedia('(hover: hover)').matches)show(source,event.currentTarget);},
    onMouseLeave:leave,
    onFocus:event=>{if(!ignoreFocus.current && event.target===event.currentTarget && event.currentTarget.matches(':focus-visible'))show(source,event.currentTarget);},
    onBlur:event=>{if(card.current?.contains(event.relatedTarget))keep();else leave();},
    'aria-describedby':entry?.source.id===source.id?id:undefined,
  });
  let node=null;
  if(entry){
    const width=Math.min(560,window.innerWidth-24),height=Math.min(680,window.innerHeight-24);
    let left=entry.rect.right+12;
    if(left+width>window.innerWidth-12)left=Math.max(12,entry.rect.left-width-12);
    const top=Math.max(12,Math.min(entry.rect.top,window.innerHeight-height-12));
    node=createPortal(<aside ref={card} id={id} role="dialog" aria-modal="false" aria-label={entry.source.title+' 상세 미리보기'} className="history-hover-card" style={{left,top,width,maxHeight:height}}
      onMouseEnter={keep} onMouseLeave={leave} onFocusCapture={keep} onKeyDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
      <header><div><span>상세 미리보기</span><h3>{entry.source.title}</h3><p>{entry.source.customer || '고객사 미정'} · 마우스를 올려 확인 중</p></div><button type="button" className="btn btn-ghost btn-icon" aria-label="히스토리 미리보기 닫기" onClick={()=>hide(true)}><Icon name="x" size={16}/></button></header>
      <div className="history-hover-body">{kind==='req'?<HistoryRequirementsPreview source={entry.source}/>:<HistoryContextPreview source={entry.source}/>}</div>
      <footer>불러오려면 목록에서 히스토리를 클릭해 선택하세요.</footer>
    </aside>,document.body);
  }
  return {bind,hide,node};
}
