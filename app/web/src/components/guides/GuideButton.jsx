import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../common.jsx';
import { GUIDES } from '../../domain/guides/catalog.js';
import '../../styles/guides.css';
import { setGuideSurface, useGuideSurface } from '../../services/guide-navigation.js';
import { sessionSnapshot } from '../../api/session.js';
const loadDialog=()=>import('./GuideDialog.jsx');
const GuideDialog=lazy(loadDialog);

function GuideStatus({ failed = false, onClose }) {
  const ref=useRef(null);
  useLayoutEffect(()=>{
    const app=document.querySelector('.app'),inert=app?.inert,overflow=document.body.style.overflow;
    if(app)app.inert=true;document.body.style.overflow='hidden';if(!document.activeElement?.closest('[data-guide-chat]'))ref.current?.focus({preventScroll:true});
    const key=e=>{if(e.target.closest?.('[data-guide-chat]')||sessionSnapshot().modal)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}if(e.key==='Tab'){e.preventDefault();ref.current?.querySelector('button')?.focus();}};
    document.addEventListener('keydown',key,true);
    return()=>{if(app)app.inert=inert;document.body.style.overflow=overflow;document.removeEventListener('keydown',key,true);};
  },[]);
  return createPortal(<div className="guide-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} tabIndex={-1} className="guide-loading" role="dialog" aria-modal="true" aria-label={failed?'가이드 연결 오류':'가이드 준비'}><h2>{failed?'가이드를 열지 못했어요':'가이드 화면을 불러오는 중…'}</h2><p>{failed?'연결을 확인하고 새로고침한 뒤 다시 열어 주세요.':'잠시 후 상세 단계가 표시됩니다.'}</p><button className="btn" onClick={onClose}>닫기</button></section></div>,document.body);
}
class GuideBoundary extends React.Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<GuideStatus failed onClose={this.props.onClose}/>:this.props.children;}
}

function GuideMenu({ anchor, route, onSelect, onClose }) {
  const ref=useRef(null),[position,setPosition]=useState({left:12,top:12});
  useLayoutEffect(()=>{
    const place=()=>{
      if(!anchor.current||!ref.current)return;
      const side=anchor.current.closest('.sidebar').getBoundingClientRect(),button=anchor.current.getBoundingClientRect(),menu=ref.current.getBoundingClientRect();
      setPosition({left:Math.max(12,Math.min(side.right+12,window.innerWidth-menu.width-12)),top:Math.max(12,Math.min(button.bottom-menu.height,window.innerHeight-menu.height-12))});
    };
    place();const ro=new ResizeObserver(place);ro.observe(anchor.current.closest('.sidebar'));ro.observe(ref.current);
    window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    ref.current.querySelector('button[data-topic]')?.focus({preventScroll:true});
    return()=>{ro.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[]);
  useEffect(()=>{
    const outside=e=>{if(!ref.current?.contains(e.target)&&!anchor.current?.contains(e.target))onClose(false);};
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose(true);}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||!ref.current?.contains(document.activeElement))return;
      const buttons=[...ref.current.querySelectorAll('button[data-topic]')],current=buttons.indexOf(document.activeElement);
      const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(current+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
      e.preventDefault();buttons[next]?.focus();
    };
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);};
  },[onClose]);
  return createPortal(<section ref={ref} id="winmate-guide-menu" className="guide-menu" role="dialog" aria-label="기능별 가이드 선택" style={position}>
    <header><div><span>WINMATE GUIDE</span><h2>어떤 기능이 궁금하세요?</h2></div><button className="btn btn-ghost btn-icon" aria-label="가이드 목록 닫기" onClick={()=>onClose(true)}><Icon name="x" size={17}/></button></header>
    <nav aria-label="기능별 가이드">{GUIDES.map(guide=><button type="button" key={guide.id} data-topic={guide.id} onClick={()=>onSelect(guide.id)}><span className="guide-topic-icon"><Icon name={guide.icon} size={19}/></span><span><b>{guide.title}{guide.route===route.name&&<em>현재 화면</em>}</b><small>{guide.description}</small></span><span className="guide-topic-count">{guide.steps.length}<small>단계</small></span><Icon name="chev" size={15}/></button>)}</nav>
  </section>,document.body);
}
export function GuideButton({ route, onOpen }) {
  // A single state makes the side menu and central dialog mutually exclusive.
  const surface=useGuideSurface(),setSurface=setGuideSurface,anchor=useRef(null);
  useEffect(()=>{if(surface?.kind==='guide')onOpen?.();},[surface?.kind]);
  const close=restore=>{setSurface(null);if(restore)requestAnimationFrame(()=>{const target=anchor.current?.getBoundingClientRect().right<=0?document.querySelector('.mob-top button[aria-label="메뉴 열기"]'):anchor.current;target?.focus({preventScroll:true});});};
  const select=id=>{setSurface({kind:'guide',id,index:0});};
  return <>
    <button ref={anchor} type="button" className={'sb-guide'+(surface?' active':'')} aria-label="사용 가이드" aria-haspopup="dialog" aria-expanded={!!surface} aria-controls={surface?.kind==='menu'?'winmate-guide-menu':surface?'winmate-guide-dialog':undefined} onClick={()=>{if(surface)close(false);else{void loadDialog();setSurface({kind:'menu'});}}}>
      <Icon name="help" size={18}/><span className="sb-tx">사용 가이드</span><Icon className="sb-tx guide-button-chevron" name="chev" size={14}/>
    </button>
    {surface?.kind==='menu'&&<GuideMenu anchor={anchor} route={route} onSelect={select} onClose={close}/>}
    {surface?.kind==='guide'&&<GuideBoundary onClose={()=>close(true)}><Suspense fallback={<GuideStatus onClose={()=>close(true)}/>}><GuideDialog id={surface.id} index={surface.index} onClose={()=>close(true)}/></Suspense></GuideBoundary>}
  </>;
}
