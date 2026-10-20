import React from 'react';
import {Slide} from '../domain/slides/Slide.jsx';
import {contextPending,hasSavedLayoutContent} from '../domain/slides/context-policy.js';
import {retryLayoutContext} from '../services/layout-context.js';
import {Icon} from './common.jsx';
import {FeedbackPopup} from './feedback-popup.jsx';

export function ContextSlide({p,x,width=320,...props}){
  const pending=contextPending(x),error=x.adaptation?.phase==='error';
  const feedback=error?x.adaptation.error:pending?'요구사항·선택한 제품을 기준으로 레이아웃을 채우는 중…':'';
  return <><FeedbackPopup message={feedback} kind={error?'error':'progress'} actionLabel={error?'다시 시도':undefined} onAction={()=>retryLayoutContext(p.id,x.uid)}/>
    {(!pending&&!error)||hasSavedLayoutContent(x)?<Slide f={x.f} ov={x.ov} width={width} {...props}/>:<div className={'context-slide'+(pending?' shimmer':' context-error')} style={{width,aspectRatio:'16 / 9'}} aria-busy={pending} aria-label={pending?'레이아웃 준비 중':'레이아웃 미리보기'}><Icon name={pending?'sparkle':'image'} size={24}/></div>}
  </>;
}
