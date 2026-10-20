import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GUIDE_BY_ID } from '../../domain/guides/catalog.js';
import { Icon } from '../common.jsx';
import GuidePreview from './GuidePreview.jsx';
import { GuideChat } from './GuideChat.jsx';
import { moveGuidePage, openGuidePage } from '../../services/guide-navigation.js';
import { sessionSnapshot } from '../../api/session.js';

export default function GuideDialog({ id, index = 0, onClose }) {
  const guide=GUIDE_BY_ID[id],dialog=useRef(null),reading=useRef(null),rail=useRef(null),body=useRef(null);
  const step=guide.steps[index],last=index===guide.steps.length-1;
  const setIndex=value=>openGuidePage(id,value+1);
  const next=()=>moveGuidePage(1),prev=()=>moveGuidePage(-1);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useLayoutEffect(()=>{
    const app=document.querySelector('.app'),oldInert=app?.inert,overflow=document.body.style.overflow;
    if(app)app.inert=true;document.body.style.overflow='hidden';if(!document.activeElement?.closest('[data-guide-chat]'))dialog.current?.focus({preventScroll:true});
    return()=>{if(app)app.inert=oldInert;document.body.style.overflow=overflow;};
  },[]);
  useEffect(()=>{
    const key=e=>{
      if(sessionSnapshot().modal)return;
      const inChat=!!e.target.closest?.('[data-guide-chat]');
      if(e.key==='Escape'&&!inChat){e.preventDefault();e.stopPropagation();closeRef.current();return;}
      if(e.altKey||e.ctrlKey||e.metaKey)return;
      if(!inChat&&!e.target.matches?.('input,textarea,select,[contenteditable="true"]')&&['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){
        e.preventDefault();e.stopPropagation();
        if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')prev();if(e.key==='Home')setIndex(0);if(e.key==='End')setIndex(guide.steps.length-1);
      }
      if(e.key==='Tab'){
        const roots=[dialog.current];
        const buttons=roots.flatMap(root=>[...(root.matches('button')?[root]:[]),...root.querySelectorAll('button:not(:disabled),textarea:not(:disabled),input:not(:disabled)')]).filter(el=>!el.closest('[inert]')&&el.getClientRects().length);
        const first=buttons[0],lastButton=buttons.at(-1);
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();lastButton.focus();}
        else if(!e.shiftKey&&document.activeElement===lastButton){e.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
  },[guide,index]);
  useLayoutEffect(()=>{reading.current?.scrollTo({top:0});body.current?.scrollTo({top:0});rail.current?.querySelector('[aria-current="step"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[guide.id,index]);
  return createPortal(<div className="guide-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section id="winmate-guide-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="guide-dialog-title" className="guide-dialog" data-guide-step={index+1}>
      <header className="guide-dialog-head"><span className="guide-topic-icon"><Icon name={guide.icon} size={22}/></span><div><h1 id="guide-dialog-title">{guide.title}</h1></div><button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="가이드 닫기"><Icon name="x" size={19}/></button></header>

      <nav className="guide-step-rail" ref={rail} aria-label="가이드 단계 이동">{guide.steps.map((s,i)=><button key={i} type="button" aria-current={i===index?'step':undefined} onClick={()=>setIndex(i)}><span>{String(i+1).padStart(2,'0')}</span>{s.title}</button>)}</nav>
      <div className="guide-dialog-body" ref={body}>
        <div className="guide-visual-column"><div className="guide-preview-transition" key={index}><GuidePreview guide={guide} step={step}/></div></div>
        <article className="guide-reading" ref={reading} key={index}><div className="guide-reading-title"><h2>{step.title}</h2><p>{step.summary}</p></div><ol className="guide-actions">{step.actions.map((action,i)=><li key={i}><span>{i+1}</span><p>{action}</p></li>)}</ol>
          {step.ai&&<section className="guide-ai-explanation"><h3><Icon name="sparkle" size={17}/>이 단계의 AI</h3><p>{step.ai}</p></section>}
          {step.tip&&<aside className="guide-tip"><h3><Icon name="info" size={16}/>확인할 점</h3><p>{step.tip}</p></aside>}
          {step.result&&<aside className="guide-result"><Icon name="check" size={16}/><p>{step.result}</p></aside>}
        </article>
      </div>
      <footer className="guide-dialog-foot"><div className="guide-page-controls"><button className="btn" disabled={index===0} onClick={prev} aria-label="이전 가이드 단계"><Icon name="chevL" size={16}/>이전</button><span className="guide-page-number" aria-live="polite">{index+1}<i>/ {guide.steps.length}</i></span><button className="btn btn-primary" onClick={last?onClose:next} aria-label={last?'가이드 완료':'다음 가이드 단계'}>{last?'완료':'다음'}<Icon name={last?'check':'chev'} size={16}/></button></div></footer>
      <GuideChat guideId={id} page={index+1} />
    </section>
  </div>,document.body);
}
