import {FeedbackPopup} from './feedback-popup.jsx';
import React,{forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {Icon} from './common.jsx';
import {spatialAssetLabel,spatialAssetMatches} from '../domain/spatial/catalog.js';
import {mentionObjectIds} from '../domain/spatial/prompt-mentions.js';
import {SpatialObjectThumb} from './spatial-library.jsx';
import {SpatialMentionEditor} from './spatial-mention-editor.jsx';
import {useSpatialObjectPeek} from './spatial-object-preview.jsx';

export const SpatialPrompt=forwardRef(function SpatialPrompt({scene,library,roomId,busy,onSubmit,onMention,onHighlight,message},ref){
  const [value,setValue]=useState({text:'',mentions:[]}),[query,setQuery]=useState(null),[active,setActive]=useState(0);
  const input=useRef(null),list=useRef(null),preview=useSpatialObjectPeek();
  const assets=useMemo(()=>Object.fromEntries(library.assets.map(a=>[a.id,a])),[library]);
  const options=useMemo(()=>[
    ...scene.objects.map((o,i)=>({kind:'object',id:o.id,asset:assets[o.assetId],roomId:o.roomId,label:`${spatialAssetLabel(assets[o.assetId])} · ${scene.rooms.find(r=>r.id===o.roomId)?.name} #${i+1}`})),
    ...library.assets.filter(a=>a.physical&&a.catalogVisible!==false).map(a=>({kind:'asset',id:a.id,asset:a,label:spatialAssetLabel(a)+' · 새로 추가'})),
  ],[scene,library,assets]);
  const open=!busy&&query!==null;
  const matches=useMemo(()=>open?options.filter(o=>spatialAssetMatches(o.asset,query)||o.label.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>(a.kind==='object'?(a.roomId===roomId?0:1):2)-(b.kind==='object'?(b.roomId===roomId?0:1):2)).slice(0,40):[],[open,options,query,roomId]);
  useEffect(()=>setActive(0),[query,open]);
  useEffect(()=>{list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});},[active]);
  useEffect(()=>{input.current?.clear();},[scene.templateId]);
  useEffect(()=>()=>onHighlight?.([]),[onHighlight]);
  const leave=event=>{preview.hide(event);onHighlight?.([]);};
  const hover=(option,anchor,immediate=false)=>{if(!option)return;onHighlight?.(mentionObjectIds(option,scene,option.kind==='asset'?roomId:undefined));if(immediate)requestAnimationFrame(()=>{if(anchor.isConnected&&anchor.contains(document.activeElement))preview.show(option.asset,anchor,true);});else preview.show(option.asset,anchor);};
  const insert=option=>{leave();input.current?.insert(option);};
  useImperativeHandle(ref,()=>({mention:objectId=>{const option=options.find(o=>o.kind==='object'&&o.id===objectId);if(option)insert(option);}}),[options]);
  const submit=async event=>{event.preventDefault();const current=input.current.value();if(busy||current.text.trim().length<3)return;leave();
    if(await onSubmit(current.text,current.mentions))input.current.clear();
  };
  return <form className="sp-prompt" onSubmit={submit} aria-label="프롬프트로 조감도 편집">
    {open&&<div className="sp-mention-menu"><div className="sp-mention-heading">오브젝트 선택 <span>배치된 오브젝트 · 카탈로그에서 새로 추가</span></div>
      <div id="sp-mention-options" role="listbox" aria-label="@ 오브젝트 검색" ref={list}>{matches.map((option,index)=><button type="button" id={'sp-mention-'+index} role="option" aria-selected={active===index} key={option.kind+option.id} onPointerDown={e=>e.preventDefault()} onMouseEnter={e=>hover(option,e.currentTarget)} onMouseLeave={leave} onClick={()=>insert(option)}><SpatialObjectThumb asset={option.asset}/><span><strong>{spatialAssetLabel(option.asset)}</strong><small>{option.kind==='object'?option.label.slice(spatialAssetLabel(option.asset).length+3):'카탈로그 · 새 오브젝트 추가'}</small></span><em>{option.kind==='object'?'배치됨':'추가'}</em></button>)}</div>
      {!matches.length&&<p className="sp-empty-results">일치하는 제품·가구가 없어요. 제품명이나 모델명으로 검색해 주세요.</p>}</div>}
    <div className="sp-prompt-heading"><span><Icon name="spark" size={15}/>프롬프트로 공간 편집</span><small>@ 버블에 마우스를 올려 상세와 위치 확인</small></div>
    <div className="sp-prompt-input"><SpatialMentionEditor ref={input} disabled={!!busy} options={options} onChange={setValue} onQuery={setQuery} onInsert={onMention} onHover={hover} onLeave={leave} onOpen={(option,anchor)=>{if(option){onHighlight?.(mentionObjectIds(option,scene,option.kind==='asset'?roomId:undefined));preview.open(option.asset,anchor);}}} expanded={open} activeId={open&&matches.length?'sp-mention-'+active:undefined}
      onKeyDown={event=>{if(event.nativeEvent.isComposing||event.keyCode===229)return;if(open&&event.key==='Escape'){event.preventDefault();setQuery(null);leave();return;}if(open&&matches.length&&['ArrowDown','ArrowUp','Enter','Tab'].includes(event.key)){event.preventDefault();if(event.key==='ArrowDown'||event.key==='ArrowUp')setActive(i=>(i+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length);else insert(matches[active]||matches[0]);return;}if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submit(event);}}}/>
      <button type="submit" className="btn btn-primary" disabled={!!busy||value.text.trim().length<3}><Icon name="arrowR" size={17}/><span>적용</span></button></div>
    <div className="sp-prompt-footer"><span role="status">이동 · 회전 · 삭제 · 제품 추가 · 스타일 변경</span><small>Enter 적용 · Shift+Enter 줄바꿈</small></div>
    <FeedbackPopup message={message} kind="info"/>{preview.node}
  </form>;
});
