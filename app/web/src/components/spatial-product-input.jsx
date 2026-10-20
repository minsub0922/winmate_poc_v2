import React,{useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './common.jsx';
import { SpatialObjectThumb } from './spatial-library.jsx';
import { spatialAssetLabel } from '../domain/spatial/catalog.js';
import { productMentionQuery,mentionedProductChoices } from '../domain/spatial/product-mentions.js';

export function SpatialProductInput({library,products,onAdd,label,disabled,preview}){
  const [value,setValue]=useState(''),[focused,setFocused]=useState(false),[dismissed,setDismissed]=useState(false),[active,setActive]=useState(0),[message,setMessage]=useState(''),[position,setPosition]=useState(null);
  const input=useRef(null),root=useRef(null),menu=useRef(null),list=useRef(null),id='sp-product-mentions-'+useId().replace(/[^a-z0-9_-]/gi,'');
  const query=productMentionQuery(value),open=focused&&!disabled&&!dismissed&&query!==null;
  const choices=useMemo(()=>mentionedProductChoices(library.assets,query),[library,query]);
  useEffect(()=>setActive(0),[query]);
  useEffect(()=>{if(!open)return;list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});},[open,active]);
  useLayoutEffect(()=>{
    if(!open){setPosition(null);return;}
    const place=()=>{const rect=input.current.getBoundingClientRect(),w=Math.min(420,innerWidth-24),below=innerHeight-rect.bottom-18,above=rect.top-18,desired=Math.min(350,46+Math.max(1,choices.length)*60),placeBelow=below>=Math.min(220,desired)||below>=above,height=Math.max(0,Math.min(desired,placeBelow?below:above));
      setPosition({left:Math.max(12,Math.min(rect.left,innerWidth-w-12)),width:w,top:placeBelow?rect.bottom+6:Math.max(12,rect.top-height-6),maxHeight:height});};
    const scroll=event=>{if(menu.current?.contains(event.target)||event.target.closest?.('.dpk,.mback'))return;setDismissed(true);preview.hide();};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',scroll,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',scroll,true);};
  },[open,preview.hide,choices.length]);
  useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!root.current?.contains(event.target)&&!menu.current?.contains(event.target)&&!event.target.closest('.dpk,.mback')){setDismissed(true);preview.hide();}};
    const escape=event=>{if(event.key==='Escape'){setDismissed(true);preview.hide();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};
  },[open,preview.hide]);
  const choose=asset=>{
    if(disabled)return;const already=products.some(p=>p.productId===asset.productId);onAdd(asset);setMessage(already?'이미 선택한 제품이에요.':asset.name+'을 추가했어요.');setValue('');setDismissed(true);preview.hide();requestAnimationFrame(()=>input.current?.focus());
  };
  const point=(index,immediate=false)=>{const option=list.current?.querySelector('[data-option-index="'+index+'"]');if(option&&choices[index])preview.show(choices[index],option,immediate);};
  return <div className="sp-product-mention-input" ref={root}>
    <div className="sp-product-mention-field"><button type="button" aria-label="@로 제품 추가" disabled={disabled} onClick={()=>{setValue('@');setDismissed(false);setFocused(true);input.current?.focus();}}>@</button><input ref={input} type="text" role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={open?id:undefined} aria-activedescendant={open&&choices.length?id+'-'+active:undefined} value={value} disabled={disabled} placeholder="@제품명 또는 모델명으로 추가"
      onFocus={()=>{setFocused(true);setDismissed(false);}} onChange={e=>{preview.hide();setValue(e.target.value);setDismissed(false);setMessage('');}}
      onBlur={e=>{if(!e.relatedTarget?.closest('.sp-product-mention-menu,.dpk,.mback')){setFocused(false);setDismissed(true);}}}
      onKeyDown={e=>{if(e.nativeEvent.isComposing||e.keyCode===229)return;if(open&&e.key==='Escape'){e.preventDefault();setDismissed(true);preview.hide();return;}
        if(open&&choices.length&&['ArrowDown','ArrowUp','Enter','Tab'].includes(e.key)){e.preventDefault();if(e.key==='ArrowDown'||e.key==='ArrowUp'){const next=(active+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;setActive(next);requestAnimationFrame(()=>point(next,true));}else choose(choices[active]||choices[0]);}
      }}/></div>
    <span className="sp-product-mention-feedback" role="status" aria-live="polite">{message}</span>
    {open&&position&&createPortal(<div ref={menu} className="sp-product-mention-menu" style={position}><div className="sp-product-mention-title">제품 추가 <span>↑↓ 선택 · Enter 추가 · Esc 닫기</span></div><div ref={list} id={id} role="listbox" aria-label="공간 제품 @ 검색">{choices.map((asset,index)=>{
      const chosen=products.some(p=>p.productId===asset.productId);return <button type="button" key={asset.id} id={id+'-'+index} data-option-index={index} role="option" aria-label={spatialAssetLabel(asset)} aria-selected={active===index} onPointerDown={e=>e.preventDefault()} onMouseEnter={e=>{setActive(index);preview.show(asset,e.currentTarget);}} onMouseLeave={preview.hide} onClick={()=>choose(asset)}><SpatialObjectThumb asset={asset}/><span><strong>{asset.name}</strong><small>{asset.model}</small></span><em>{chosen?'선택됨':<Icon name="plus" size={14}/>}</em></button>;
    })}</div>{!choices.length&&<p className="sp-empty-results">일치하는 제품이 없어요. 제품명·모델명으로 검색해 주세요.</p>}</div>,document.body)}
  </div>;
}
