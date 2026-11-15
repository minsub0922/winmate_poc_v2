import {FeedbackPopup} from './feedback-popup.jsx';
import React,{forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {Icon} from './common.jsx';
import {spatialAssetLabel} from '../domain/spatial/catalog.js';
import {mentionObjectIds} from '../domain/spatial/prompt-mentions.js';
import {mentionOptions,filterMentionOptions} from '../domain/spatial/mention-options.js';
import {SpatialObjectThumb} from './spatial-library.jsx';
import {SpatialMentionEditor} from './spatial-mention-editor.jsx';
import {useSpatialObjectPeek} from './spatial-object-preview.jsx';
import '../styles/birdseye.css';

const TAGS={room:'공간',space:'새 공간',object:'배치됨',asset:'추가'};

// 시뮬레이터 아래 명령 입력창 — @로 공간 · 제품 · 오브젝트를 태그해 명령한다. 장면이 없어도(빈 스튜디오) 쓸 수 있다.
export const SpatialPrompt=forwardRef(function SpatialPrompt({scene,library,roomId,busy,onSubmit,onMention,onHighlight,message},ref){
  const [value,setValue]=useState({text:'',mentions:[]}),[query,setQuery]=useState(null),[active,setActive]=useState(0);
  const input=useRef(null),list=useRef(null),preview=useSpatialObjectPeek();
  const options=useMemo(()=>mentionOptions(scene,library),[scene,library]);
  const open=!busy&&query!==null;
  const matches=useMemo(()=>open?filterMentionOptions(options,query,{roomId,limit:40}):[],[open,options,query,roomId]);
  useEffect(()=>setActive(0),[query,open]);
  useEffect(()=>{list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});},[active]);
  useEffect(()=>{input.current?.clear();},[scene?.templateId]);
  useEffect(()=>()=>onHighlight?.([]),[onHighlight]);
  const leave=event=>{preview.hide(event);onHighlight?.([]);};
  const hover=(option,anchor,immediate=false)=>{
    if(!option)return;onHighlight?.(mentionObjectIds(option,scene,option.kind==='asset'?roomId:undefined));
    if(!option.asset)return;
    if(immediate)requestAnimationFrame(()=>{if(anchor.isConnected&&anchor.contains(document.activeElement))preview.show(option.asset,anchor,true);});else preview.show(option.asset,anchor);
  };
  const insert=option=>{leave();input.current?.insert(option);};
  useImperativeHandle(ref,()=>({
    mention:objectId=>{const option=options.find(o=>o.kind==='object'&&o.id===objectId);if(option)insert(option);},
    mentionRoom:id=>{const option=options.find(o=>o.kind==='room'&&o.id===id);if(option)insert(option);},
    focus:()=>input.current?.focus(),
  }),[options]);
  const submit=async event=>{event.preventDefault();const current=input.current.value();if(busy||current.text.trim().length<3)return;leave();
    if(await onSubmit(current.text,current.mentions))input.current.clear();
  };
  return <form className="sp-prompt" onSubmit={submit} aria-label="프롬프트로 조감도 편집">
    {open&&<div className="sp-mention-menu"><div className="sp-mention-heading">@ 태그 <span>공간 · 제품 · 오브젝트</span></div>
      <div id="sp-mention-options" role="listbox" aria-label="@ 공간 · 제품 · 오브젝트 검색" ref={list}>{matches.map((option,index)=><React.Fragment key={option.kind+option.id}>
        {(index===0||matches[index-1].group!==option.group)&&<div className="sp-mention-group" role="presentation">{option.group}</div>}
        <button type="button" id={'sp-mention-'+index} role="option" data-mention-kind={option.kind} aria-selected={active===index} onPointerDown={e=>e.preventDefault()} onMouseEnter={e=>hover(option,e.currentTarget)} onMouseLeave={leave} onClick={()=>insert(option)}>
          {option.asset?<SpatialObjectThumb asset={option.asset}/>:<span className="sp-mention-room-icon" aria-hidden="true">{option.kind==='room'?'▦':'+'}</span>}
          <span><strong>{option.asset?spatialAssetLabel(option.asset):option.label}</strong><small>{option.hint}</small></span><em>{TAGS[option.kind]}</em></button>
      </React.Fragment>)}</div>
      {!matches.length&&<p className="sp-empty-results">일치하는 공간 · 제품 · 오브젝트가 없어요. 이름이나 모델명으로 찾아보세요.</p>}</div>}
    <div className="sp-prompt-heading"><span><Icon name="wand" size={15}/>명령으로 조작하기</span><small>@ 로 공간 · 제품 · 오브젝트를 골라 명령하세요</small></div>
    <div className="sp-prompt-input"><SpatialMentionEditor ref={input} disabled={!!busy} options={options} onChange={setValue} onQuery={setQuery} onInsert={onMention} onHover={hover} onLeave={leave} onOpen={(option,anchor)=>{if(option){onHighlight?.(mentionObjectIds(option,scene,option.kind==='asset'?roomId:undefined));if(option.asset)preview.open(option.asset,anchor);}}} expanded={open} activeId={open&&matches.length?'sp-mention-'+active:undefined}
      onKeyDown={event=>{if(event.nativeEvent.isComposing||event.keyCode===229)return;if(open&&event.key==='Escape'){event.preventDefault();setQuery(null);leave();return;}if(open&&matches.length&&['ArrowDown','ArrowUp','Enter','Tab'].includes(event.key)){event.preventDefault();if(event.key==='ArrowDown'||event.key==='ArrowUp')setActive(i=>(i+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length);else insert(matches[active]||matches[0]);return;}if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submit(event);}}}/>
      <button type="submit" className="btn btn-primary" disabled={!!busy||value.text.trim().length<3}><Icon name="arrowR" size={17}/><span>적용</span></button></div>
    <div className="sp-prompt-footer"><span role="status">이동 · 복제 · 회전 · 삭제 · 추가 · 공간 추가</span><small>Enter 적용 · Shift+Enter 줄바꿈</small></div>
    <FeedbackPopup message={message} kind="info"/>{preview.node}
  </form>;
});
