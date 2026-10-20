import React,{useEffect,useId,useRef,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {notify,dismissNotification,notificationSnapshot,subscribeNotifications} from '../services/notifications.js';
import '../styles/feedback.css';

/** Operation feedback lives in the fixed popup layer, never in a page's layout. */
export function FeedbackPopup({message,kind='error',title,actionLabel,onAction,onDismiss,content,source}){
  const localId=useId(),id=source||'feedback-'+localId,action=useRef(onAction),dismiss=useRef(onDismiss),hidden=useRef(null);action.current=onAction;dismiss.current=onDismiss;
  useEffect(()=>{
    if(!message&&!content||hidden.current&&hidden.current!==kind)hidden.current=null;
    if((message||content)&&!(kind==='progress'&&hidden.current==='progress'))notify(message,kind,{id,title,actionLabel,onAction:()=>action.current?.(),onDismiss:()=>{hidden.current=kind;dismiss.current?.();},content,duration:kind==='progress'||content?0:kind==='error'?0:4500});
    else dismissNotification(id);
    return()=>dismissNotification(id);
  },[id,message,kind,title,actionLabel,content]);
  return null;
}
export function NotificationHost(){
  const notices=useSyncExternalStore(subscribeNotifications,notificationSnapshot,notificationSnapshot);
  return createPortal(<aside className="feedback-popups" aria-label="작업 알림">{notices.map(notice=><section className={'feedback-popup '+notice.kind+(notice.content?' custom':'')} key={notice.id} role={notice.kind==='error'||notice.kind==='warn'?'alert':'status'} aria-label={notice.title||'작업 알림'}>
    <button type="button" className="feedback-close" aria-label="알림 닫기" onClick={()=>{dismissNotification(notice.id);notice.onDismiss?.();}}>×</button>
    {notice.content?<div className="feedback-content">{notice.content}</div>:<><div className="feedback-heading">{notice.kind==='progress'?<span className="feedback-spinner"/>:<span aria-hidden="true">{notice.kind==='error'||notice.kind==='warn'?'!':'✓'}</span>}<strong>{notice.title||(notice.kind==='error'?'요청을 처리하지 못했어요':notice.kind==='progress'?'처리 중':'알림')}</strong></div><div className="feedback-message">{notice.message}</div></>}
    {notice.onAction&&notice.actionLabel&&<div className="feedback-actions"><button type="button" className="btn btn-sm" onClick={()=>{dismissNotification(notice.id);notice.onAction();}}>{notice.actionLabel}</button></div>}
  </section>)}</aside>,document.body);
}
