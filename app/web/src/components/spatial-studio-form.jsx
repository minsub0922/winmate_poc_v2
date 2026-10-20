import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Icon,DeleteButton,confirmDelete} from './common.jsx';
import {SpatialObjectThumb} from './spatial-library.jsx';
import {SPACE_TYPES,newStudioRoom} from '../domain/spatial/studio-form.js';
import {roomKind} from '../domain/spatial/scene.js';
import {STYLES} from '../domain/spatial/geometry.js';
import {spatialAssetLabel,spatialAssetMatches} from '../domain/spatial/catalog.js';
import {addMentionedProduct} from '../domain/spatial/product-mentions.js';
import {SpatialProductInput} from './spatial-product-input.jsx';
import {useSpatialProductPeek} from './spatial-product-preview.jsx';

export function SpatialStudioForm({form,library,onChange,onGenerate,onTemplates,onHighlight,disabled=false}){
  const [picker,setPicker]=useState(null),[query,setQuery]=useState(''),[limit,setLimit]=useState(24);
  const latest=useRef(form),trigger=useRef(null);latest.current=form;
  const preview=useSpatialProductPeek();
  const assets=useMemo(()=>Object.fromEntries(library.assets.map(a=>[a.id,a])),[library]);
  const room=form.rooms.find(r=>r.id===picker);
  const choices=useMemo(()=>library.assets.filter(a=>a.productId&&a.physical&&spatialAssetMatches(a,query)),[library,query]);
  const setRoom=(id,patch)=>{const current=latest.current;onChange({...current,rooms:current.rooms.map(r=>r.id===id?{...r,...patch}:r)});};
  const removeRoom=id=>{const current=latest.current;onChange({...current,rooms:current.rooms.filter(r=>r.id!==id)});if(picker===id)setPicker(null);};
  const removeProduct=(roomId,productId)=>{const current=latest.current.rooms.find(r=>r.id===roomId);if(current)setRoom(roomId,{products:current.products.filter(p=>p.productId!==productId)});};
  const toggleProduct=async asset=>{
    if(disabled||!room)return;
    const roomId=room.id,selected=room.products.some(p=>p.productId===asset.productId);
    if(selected){if(await confirmDelete({title:'배치 제품을 삭제할까요?',message:`${room.name||'이 공간'}에서 ${spatialAssetLabel(asset)}을 삭제합니다.`}))removeProduct(roomId,asset.productId);return;}
    const current=latest.current.rooms.find(r=>r.id===roomId);
    if(current&&!current.products.some(p=>p.productId===asset.productId))setRoom(roomId,{products:[...current.products,{productId:asset.productId,quantity:1}]});
  };
  const closePicker=()=>{setPicker(null);trigger.current?.focus({preventScroll:true});};
  const openPicker=(event,id)=>{trigger.current=event.currentTarget;setPicker(value=>value===id?null:id);setQuery('');setLimit(24);};
  const canGenerate=!!form.industry&&form.rooms.length>0&&form.rooms.every(r=>r.name.trim()&&(r.customPurpose==null||r.customPurpose.trim()));
  useEffect(()=>{if(disabled)setPicker(null);},[disabled]);
  return <>
    <aside className="sp-config sp-input-form"><fieldset disabled={disabled}>
      <div className="sp-section-title"><span>01</span><h2>업종</h2><button type="button" className="sp-template-trigger" onClick={onTemplates}>업종 템플릿</button></div>
      <label>업종 선택<select aria-label="업종" value={form.industry} onChange={e=>onChange({...form,industry:e.target.value})}><option value="">업종을 선택하세요</option>{library.industries.map(i=><option key={i.code} value={i.code}>{i.name}</option>)}</select></label>
      {form.templateId&&<div className="sp-used-template"><Icon name="building" size={13}/><span>업종 템플릿 적용 중</span><DeleteButton aria-label="템플릿 연결 해제" confirmation={{title:'템플릿 연결을 해제할까요?',message:'입력한 공간과 제품은 유지하고 템플릿 연결을 해제합니다.',confirmLabel:'연결 해제'}} onClick={()=>onChange({...latest.current,templateId:null})}>×</DeleteButton></div>}
      <div className="sp-config-divider"/>
      <div className="sp-section-title"><span>02</span><h2>공간 리스트</h2><button type="button" className="btn btn-ghost btn-sm" disabled={form.rooms.length>=30} onClick={()=>onChange({...form,rooms:[...form.rooms,newStudioRoom()]})}><Icon name="plus" size={13}/>공간 추가</button></div>
      <p className="sp-config-hint">공간별 용도를 정하고 배치할 제품을 선택하세요.</p>
      <div className="sp-space-list" aria-label="공간 리스트">
        {!form.rooms.length&&<div className="sp-space-empty"><Icon name="building" size={23}/><strong>아직 입력한 공간이 없어요</strong><span>로비, 회의실, 라운지 등 필요한 공간을 추가해 보세요.</span><button type="button" className="btn btn-sm" onClick={()=>onChange({...form,rooms:[newStudioRoom()]})}>첫 공간 추가</button></div>}
        {form.rooms.map((r,index)=><section className={'sp-space-card'+(picker===r.id?' is-selecting':'')} data-room-id={r.id} key={r.id} aria-label={'공간 '+(index+1)}>
          <div className="sp-space-card-head"><b>{String(index+1).padStart(2,'0')}</b><input aria-label={'공간 '+(index+1)+' 이름'} value={r.name} maxLength={100} placeholder="공간 이름을 입력하세요" onChange={e=>setRoom(r.id,{name:e.target.value,...(!r.kindEdited?{kind:roomKind(e.target.value)}:{})})}/><DeleteButton className="btn btn-ghost btn-icon" aria-label={'공간 '+(index+1)+' 삭제'} confirmation={{title:'공간을 삭제할까요?',message:`${r.name||'공간 '+(index+1)}과 이 공간의 배치 제품 ${r.products.length}종을 입력에서 삭제합니다.`}} onClick={()=>removeRoom(r.id)}><Icon name="trash" size={14}/></DeleteButton></div>
          <div className="sp-room-purpose"><label className="sp-room-kind">공간 용도<select aria-label={'공간 '+(index+1)+' 용도'} value={r.customPurpose!=null?'custom':r.kind} onChange={e=>setRoom(r.id,e.target.value==='custom'?{customPurpose:'',kindEdited:true}:{kind:e.target.value,kindEdited:true,customPurpose:undefined})}>{SPACE_TYPES.map(([key,label])=><option key={key} value={key}>{label}</option>)}<option value="custom">직접 입력…</option></select></label>
            {r.customPurpose!=null&&<input className="sp-custom-purpose" aria-label={'공간 '+(index+1)+' 용도 직접 입력'} value={r.customPurpose} maxLength={100} placeholder="예: 촬영 준비실 · 반려동물 케어" onChange={e=>setRoom(r.id,{customPurpose:e.target.value,kind:roomKind(e.target.value),kindEdited:true})}/>}</div>
          <div className="sp-space-products"><div className="sp-space-product-heading"><span>배치 제품 <b>{r.products.length}</b></span><button type="button" aria-expanded={picker===r.id} aria-controls={picker===r.id?'sp-room-product-picker':undefined} onClick={e=>openPicker(e,r.id)}>제품 선택<Icon name="plus" size={13}/></button></div>
            <SpatialProductInput library={library} products={r.products} disabled={disabled} label={(r.name||'공간 '+(index+1))+' 제품 @ 추가'} onAdd={asset=>{const current=latest.current.rooms.find(item=>item.id===r.id);if(current)setRoom(r.id,{products:addMentionedProduct(current.products,asset)});}} preview={preview}/>
            {!r.products.length&&<p>@로 검색하거나 제품 선택을 눌러 추가해 주세요.</p>}
            {r.products.map(p=>{const a=assets['product:'+p.productId];return <div className="sp-space-product" key={p.productId}><button type="button" className="sp-selected-product" aria-label={(a?spatialAssetLabel(a):p.productId)+" 상세 보기"} {...preview.props(a)} onMouseEnter={event=>{preview.show(a,event.currentTarget);onHighlight?.(a?.id,r.id);}} onMouseLeave={event=>{preview.hide(event);onHighlight?.();}} onFocus={event=>{if(event.target===event.currentTarget){preview.show(a,event.currentTarget,true);onHighlight?.(a?.id,r.id);}}} onBlur={event=>{preview.hide(event);onHighlight?.();}}>{a&&<SpatialObjectThumb asset={a}/>}<span>{a?.name||p.productId}<small>{a?.model}</small></span></button><input aria-label={(r.name||'공간 '+(index+1))+' '+(a?.model||p.productId)+' 수량'} type="number" min="1" max="30" value={p.quantity} onChange={e=>{setRoom(r.id,{products:r.products.map(x=>x.productId===p.productId?{...x,quantity:e.target.value===''?'':Number(e.target.value)}:x)});}}/><DeleteButton aria-label={(a?.name||p.productId)+' 제외'} confirmation={{title:'배치 제품을 삭제할까요?',message:`${r.name||'이 공간'}에서 ${a?spatialAssetLabel(a):p.productId}을 삭제합니다.`}} onClick={()=>{preview.hide();removeProduct(r.id,p.productId);}}><Icon name="x" size={13}/></DeleteButton></div>;})}
          </div>
          {!!r.furniture?.length&&<div className="sp-space-furniture"><div className="sp-space-product-heading"><span>추가 오브젝트 <b>{r.furniture.length}</b></span></div>{r.furniture.map(item=>{const asset=assets[item.assetId];return <div className="sp-space-product" key={item.assetId}>{asset&&<SpatialObjectThumb asset={asset}/>}<span>{asset?.name||item.assetId}</span><input type="number" min="1" max="30" aria-label={(r.name||'공간 '+(index+1))+' '+(asset?.name||item.assetId)+' 수량'} value={item.quantity} onChange={e=>setRoom(r.id,{furniture:r.furniture.map(value=>value.assetId===item.assetId?{...value,quantity:e.target.value===''?'':Number(e.target.value)}:value)})}/><DeleteButton aria-label={(asset?.name||item.assetId)+' 오브젝트 제외'} confirmation={{title:'오브젝트를 입력에서 삭제할까요?',message:asset?.name||item.assetId}} onClick={()=>setRoom(r.id,{furniture:r.furniture.filter(value=>value.assetId!==item.assetId)})}><Icon name="x" size={13}/></DeleteButton></div>;})}</div>}
        </section>)}
      </div>
      <div className="sp-config-divider"/>
      <details className="sp-style-settings"><summary>공간 스타일</summary><div className="sp-style-list">{Object.entries(STYLES).map(([key,s])=><button type="button" key={key} aria-pressed={form.style===key} onClick={()=>onChange({...form,style:key})}><i style={{background:s.wood,borderColor:s.fabric}}/>{s.name}</button>)}</div></details>
      <button type="button" className="btn btn-primary sp-generate-form" disabled={disabled||!canGenerate} onClick={onGenerate}><Icon name="spark" size={15}/>조감도 만들기</button>
      <p className="sp-engine-note">입력한 공간과 제품을 기준으로 가구·동선을 자동 배치해요.</p>
    </fieldset></aside>
    {room&&!disabled&&<RoomProductPicker room={room} trigger={trigger.current} onClose={closePicker}>
      <div className="sp-filterbar"><input aria-label="공간 제품 검색" autoFocus value={query} onChange={e=>{setQuery(e.target.value);setLimit(24);}} placeholder="제품명 · 모델명으로 검색하세요"/><span>{choices.length}개</span></div>
      <div className="sp-room-product-options">{choices.slice(0,limit).map(a=>{const selected=room.products.some(p=>p.productId===a.productId);return <button type="button" key={a.id} className={selected?'selected':''} aria-pressed={selected} aria-label={spatialAssetLabel(a)+' 선택'} {...preview.props(a)} onClick={()=>{preview.hide();toggleProduct(a);}}><SpatialObjectThumb asset={a}/><span><strong>{a.name}</strong><small>{a.model}</small></span><span className="sp-product-check">{selected?<Icon name="check" size={16}/>:<Icon name="plus" size={16}/>}</span></button>;})}</div>
      {!choices.length&&<p className="sp-empty-results">검색어에 맞는 제품이 없어요.</p>}{choices.length>limit&&<button type="button" className="btn sp-load-more" onClick={()=>setLimit(n=>n+24)}>제품 더 보기</button>}
    </RoomProductPicker>}
    {preview.node}
  </>;
}

function RoomProductPicker({room,trigger,onClose,children}){
  const popup=useRef(null),[position,setPosition]=useState({left:0,top:0,width:600,maxHeight:540});
  const close=useRef(onClose);close.current=onClose;
  useLayoutEffect(()=>{
    const anchor=trigger?.closest('.sp-space-card')||trigger;
    if(!anchor)return;
    const place=()=>{const rect=anchor.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight,right=vw-rect.right-24,side=right>=300,width=Math.min(640,side?right:vw-24),maxHeight=Math.min(620,vh-32),top=Math.max(16,Math.min(rect.top,vh-maxHeight-16));setPosition({left:side?rect.right+12:Math.max(12,Math.min(rect.left,vw-width-12)),top,width,maxHeight});};
    const scroll=e=>{if(!popup.current?.contains(e.target))place();};
    place();const observer=new ResizeObserver(place);observer.observe(anchor);window.addEventListener('resize',place);window.addEventListener('scroll',scroll,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',scroll,true);};
  },[trigger]);
  useEffect(()=>{
    const outside=e=>{if(!popup.current?.contains(e.target)&&!(trigger?.closest('.sp-space-card')||trigger)?.contains(e.target)&&!e.target.closest('.dpk,.mback'))close.current();};
    const escape=e=>{if(e.key==='Escape'&&!document.querySelector('.mback')){e.preventDefault();e.stopPropagation();close.current();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[trigger]);
  return createPortal(<section id="sp-room-product-picker" ref={popup} className="sp-room-product-picker" role="dialog" aria-modal="false" aria-label={(room.name||'새 공간')+' · 제품 선택'} style={position}>
    <header><div><small>공간별 배치 제품</small><strong>{room.name||'새 공간'}</strong></div><button type="button" className="btn btn-ghost btn-icon" aria-label="제품 선택 닫기" onClick={onClose}><Icon name="x" size={16}/></button></header>
    <div className="sp-room-product-picker-scroll">{children}</div><footer><span><b>{room.products.length}</b>종 선택 · 선택 즉시 입력에 추가됩니다.</span><button type="button" className="btn btn-primary btn-sm" onClick={onClose}>선택 완료</button></footer>
  </section>,document.body);
}
