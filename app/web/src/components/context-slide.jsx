import React from 'react';
import {Slide} from '../domain/slides/Slide.jsx';
import {contextPending,hasSavedLayoutContent,briefRunning} from '../domain/slides/context-policy.js';
import {retryLayoutContext} from '../services/layout-context.js';
import {Icon} from './common.jsx';
import {FeedbackPopup} from './feedback-popup.jsx';

export function ContextSlide({p,x,width=320,...props}){
  // briefing: 직접 넣은 장 — 채우기 전에 이 장에 넣을 제품 · 솔루션 · 개략 내용을 추론하는 중 (services/layout-brief.js)
  const briefing=briefRunning(x),pending=contextPending(x)||briefing,error=x.adaptation?.phase==='error';
  const feedback=error?x.adaptation.error:briefing?'넣을 내용을 추론하는 중…':pending?'요구사항·선택한 제품을 기준으로 레이아웃을 채우는 중…':'';
  // 장마다 알리지만 상단 상태 자리에서는 한 줄로 묶어 센다(같은 장이 보드 · 레이아웃 패널에 함께 있어도 한 장)
  const group=error?'sheet-fill':briefing?'sheet-brief':'sheet-fill';
  const groupLabel=error?'레이아웃 {n}장을 채우지 못했어요':briefing?'{n}장에 넣을 내용 추론 중':'레이아웃 {n}장 채우는 중';
  return <><FeedbackPopup message={feedback} kind={error?'error':'progress'} group={group} unit={x.uid} groupLabel={groupLabel} actionLabel={error?'다시 시도':undefined} onAction={()=>retryLayoutContext(p.id,x.uid)}/>
    {/* 채우는 중(추론 중 포함)에는 저장된 내용이 있어도 shimmer 만 — 별표 아이콘 · 글 없이(사용자 지시 2026-11-17) */}
    {pending?<div className="context-slide shimmer" style={{width,aspectRatio:'16 / 9'}} aria-busy="true" aria-label="레이아웃 채우는 중"/>
      :!error||hasSavedLayoutContent(x)?<Slide f={x.f} ov={x.ov} width={width} {...props}/>
      :<div className="context-slide context-error" style={{width,aspectRatio:'16 / 9'}} aria-label="레이아웃 미리보기"><Icon name="image" size={24}/></div>}
  </>;
}
