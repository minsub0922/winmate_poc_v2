import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../common.jsx';
import { GUIDE_BY_ID } from '../../domain/guides/catalog.js';
import { GUIDE_QUESTIONS } from '../../domain/guides/questions.js';
import { openGuidePage } from '../../services/guide-navigation.js';
import { askGuide } from '../../services/guide-agent.js';
import { requireLogin } from '../../api/session.js';
import '../../styles/guide-chat.css';
const WELCOME='가이드 에이전트예요. 무엇을 알려드릴까요?';

function ChatSession({ current, onClose }) {
  const [messages,setMessages]=useState([{id:'welcome',role:'assistant',content:WELCOME,status:'welcome'}]);
  const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  const alive=useRef(true),request=useRef(null),serial=useRef(0),turn=useRef(0),input=useRef(null),feed=useRef(null);
  const guide=GUIDE_BY_ID[current.guide_id];
  const conversation=messages.filter(message=>message.id!=='welcome');
  const hasPartial=conversation.some(message=>message.role==='assistant'&&message.status==='streaming'&&message.content);
  useEffect(()=>{
    input.current?.focus({preventScroll:true});
    return()=>{alive.current=false;serial.current++;request.current?.abort();request.current=null;};
  },[]);
  useLayoutEffect(()=>{if(feed.current)feed.current.scrollTop=feed.current.scrollHeight;},[messages,busy,error]);
  const send=async(question,retryId)=>{
    const text=question.trim();if(!text||request.current||text.length>2000)return;
    if(!requireLogin())return;
    const controller=new AbortController(),ticket=++serial.current,id=retryId||'turn-'+(++turn.current);
    request.current=controller;setBusy(true);setError(null);setDraft('');
    input.current?.focus({preventScroll:true});
    const history=messages.filter(m=>m.status==='complete').map(({role,content})=>({role,content}));
    setMessages(list=>{
      const user={id,role:'user',content:text,status:'pending'},assistant={id:id+'-reply',role:'assistant',content:'',status:'streaming'};
      return retryId?list.map(message=>message.id===id?user:message.id===assistant.id?assistant:message):[...list,user,assistant];
    });
    try {
      const reply=await askGuide(text,history,current,controller.signal,partial=>{
        if(!alive.current||controller.signal.aborted||serial.current!==ticket)return;
        setMessages(list=>list.map(message=>message.id===id+'-reply'?{...message,content:partial,status:'streaming'}:message));
      });
      if(!alive.current||controller.signal.aborted||serial.current!==ticket)return;
      setMessages(list=>list.map(message=>message.id===id?{...message,status:'complete'}:message.id===id+'-reply'?{...message,content:reply.answer,status:'complete',target:reply.target}:message));
      if(reply.target)openGuidePage(reply.target.guide_id,reply.target.page);
    } catch(cause) {
      if(!alive.current||controller.signal.aborted||serial.current!==ticket)return;
      setMessages(list=>list.map(message=>message.id===id||message.id===id+'-reply'?{...message,status:'failed'}:message));
      setError({id,question:text,message:cause.message||'답변을 불러오지 못했어요. 다시 시도해 주세요.'});
    } finally {
      if(alive.current&&serial.current===ticket){request.current=null;setBusy(false);}
    }
  };
  return <section id="guide-chat-popup" className="guide-chat-popup" data-has-conversation={conversation.length>0} role="dialog" aria-modal="false" aria-label="가이드 에이전트와 대화" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
  }}>
    <header><span className="guide-chat-mark"><Icon name="sparkle" size={18}/></span><div><h2>가이드 에이전트</h2><span>{guide.title}</span></div><button type="button" className="btn btn-ghost btn-icon" aria-label="챗봇 닫기" onClick={onClose}><Icon name="x" size={17}/></button></header>
    <div className="guide-chat-intro">
      <div className="guide-chat-message assistant" data-chat-message="welcome"><p>{WELCOME}</p></div>
      <div className="guide-chat-questions" aria-label={guide.title+' 추천 질문'}>{GUIDE_QUESTIONS[guide.id].map(question=><button type="button" key={question} disabled={busy} onClick={()=>send(question)}>{question}</button>)}</div>
    </div>
    <div className="guide-chat-feed" ref={feed} hidden={!conversation.length&&!error} role="log" aria-label="가이드 대화" aria-live="polite" aria-relevant="additions text">
      {conversation.filter(message=>message.content).map(message=><div key={message.id} className={'guide-chat-message '+message.role} data-chat-message={message.id} data-chat-status={message.status}><p>{message.content}</p>{message.target&&<small className="guide-chat-target">{message.target.guide_title} · {message.target.page}/{GUIDE_BY_ID[message.target.guide_id].steps.length}</small>}</div>)}
      {busy&&!hasPartial&&<div className="guide-chat-working" role="status"><span className="guide-chat-dot"/><span>가이드를 확인하고 있어요…</span></div>}
      {error&&<div className="guide-chat-error" role="alert"><p>{error.message}</p><button type="button" onClick={()=>send(error.question,error.id)}>다시 시도</button></div>}
    </div>
    <form onSubmit={e=>{e.preventDefault();void send(draft);}}><textarea ref={input} value={draft} maxLength={2000} rows={1} placeholder="가이드에 대해 질문해 주세요" aria-label="가이드 질문" onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{
      if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();void send(draft);}
    }}/><button type="submit" disabled={busy||!draft.trim()} aria-label="가이드 질문 보내기"><Icon name="arrowR" size={18}/></button></form>
  </section>;
}
export function GuideChat({ guideId, page }) {
  const [open,setOpen]=useState(false),toggle=useRef(null);
  const current={guide_id:guideId,page};
  const close=()=>{setOpen(false);requestAnimationFrame(()=>toggle.current?.focus({preventScroll:true}));};
  return <div className="guide-chat-widget" data-guide-chat="" data-telemetry-private="">
    {open&&<ChatSession current={current} onClose={close}/>}
    <button id="guide-chat-toggle" ref={toggle} type="button" className={'guide-chat-toggle'+(open?' active':'')} aria-label={open?'가이드 챗봇 닫기':'가이드 챗봇 열기'} aria-expanded={open} aria-controls={open?'guide-chat-popup':undefined} onClick={()=>open?close():setOpen(true)}><Icon name={open?'x':'chat'} size={23}/></button>
  </div>;
}
