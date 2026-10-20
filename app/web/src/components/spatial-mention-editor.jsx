import React,{forwardRef,useImperativeHandle,useRef} from 'react';
import {spatialAssetLabel,spatialObjectThumbnail} from '../domain/spatial/catalog.js';
import {readSpatialPrompt} from '../domain/spatial/prompt-mentions.js';

export const SpatialMentionEditor=forwardRef(function SpatialMentionEditor({disabled,options,onChange,onQuery,onInsert,onKeyDown,onHover,onLeave,onOpen,expanded,activeId},ref){
  const root=useRef(null),savedRange=useRef(null),queryRange=useRef(null),lastValid=useRef(''),composing=useRef(false);
  const chipOf=target=>target?.closest?.('.sp-mention-chip');
  const optionOf=chip=>options.find(o=>o.kind===chip?.dataset.mentionKind&&o.id===chip?.dataset.mentionId);
  const remember=()=>{const selection=window.getSelection();if(selection.rangeCount&&root.current.contains(selection.anchorNode)&&root.current.contains(selection.focusNode))savedRange.current=selection.getRangeAt(0).cloneRange();};
  const endRange=()=>{const range=document.createRange();range.selectNodeContents(root.current);range.collapse(false);return range;};
  const place=range=>{const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);savedRange.current=range.cloneRange();};
  const emit=()=>{const value=readSpatialPrompt(root.current);if(value.text.length>6000){root.current.innerHTML=lastValid.current;place(endRange());return false;}lastValid.current=root.current.innerHTML;onChange(value);remember();return true;};
  const closeQuery=()=>{queryRange.current=null;onQuery(null);};
  const detect=()=>{
    remember();if(composing.current)return;const range=savedRange.current,node=range?.startContainer;
    if(!range?.collapsed||node?.nodeType!==3||!root.current.contains(node)||chipOf(node.parentElement)){closeQuery();return;}
    const before=node.data.slice(0,range.startOffset),at=before.lastIndexOf('@'),query=before.slice(at+1);
    if(at<0||/[\[\]\n@]/.test(query)||query.length>100){closeQuery();return;}
    const token=range.cloneRange();token.setStart(node,at);queryRange.current=token;onQuery(query);
  };
  const insert=option=>{
    if(disabled||!option?.asset)return;
    const range=queryRange.current||savedRange.current;
    const target=range&&root.current.contains(range.commonAncestorContainer)?range.cloneRange():endRange();
    const value=readSpatialPrompt(root.current),tokenLength=option.label.length+4;
    if(value.text.length-target.toString().length+tokenLength>6000)return;
    const chip=document.createElement('span');chip.className='sp-mention-chip';chip.contentEditable='false';chip.tabIndex=0;chip.setAttribute('role','group');chip.setAttribute('aria-label',option.label+' 상세 보기');
    Object.assign(chip.dataset,{mentionKind:option.kind,mentionId:option.id,mentionLabel:option.label,assetId:option.asset.id});
    if(option.asset.productId)chip.dataset.spatialProductPreview=option.asset.productId;
    const image=document.createElement('img');image.src=spatialObjectThumbnail(option.asset);image.alt=spatialAssetLabel(option.asset)+' 오브젝트';image.draggable=false;
    const name=document.createElement('span');name.className='sp-mention-chip-name';name.textContent=spatialAssetLabel(option.asset);
    const location=document.createElement('small');location.textContent=option.kind==='object'?option.label.slice(spatialAssetLabel(option.asset).length+3):'새로 추가';name.appendChild(location);
    const remove=document.createElement('button');remove.type='button';remove.className='sp-mention-chip-remove';remove.setAttribute('aria-label',option.label+' 태그 삭제');remove.textContent='×';
    chip.append(image,name,remove);const space=document.createTextNode('\u00a0'),fragment=document.createDocumentFragment();fragment.append(chip,space);
    target.deleteContents();target.insertNode(fragment);const next=document.createRange();next.setStart(space,1);next.collapse(true);root.current.focus({preventScroll:true});place(next);closeQuery();emit();onInsert?.(option);
  };
  const clear=()=>{root.current.replaceChildren();savedRange.current=null;lastValid.current='';closeQuery();onLeave();onChange({text:'',mentions:[]});};
  useImperativeHandle(ref,()=>({insert,clear,value:()=>readSpatialPrompt(root.current),focus:()=>root.current.focus({preventScroll:true})}));
  const removeChip=chip=>{if(disabled)return;const range=document.createRange();range.setStartAfter(chip);range.collapse(true);chip.remove();root.current.focus({preventScroll:true});place(range);onLeave();emit();closeQuery();};
  const keyDown=event=>{
    if(composing.current||event.nativeEvent.isComposing||event.keyCode===229)return;
    const chip=chipOf(event.target);
    if(event.target.closest('.sp-mention-chip-remove')&&['Enter',' '].includes(event.key)){event.stopPropagation();return;}
    if(chip){if(['Backspace','Delete'].includes(event.key)){event.preventDefault();removeChip(chip);return;}if((event.key==='Enter'||event.key===' ')&&!event.target.closest('button')){event.preventDefault();onOpen(optionOf(chip),chip);return;}}
    onKeyDown(event);
  };
  return <div ref={root} className="sp-mention-editor" contentEditable={!disabled} suppressContentEditableWarning role="combobox" aria-label="조감도 편집 프롬프트" aria-multiline="true" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded?'sp-mention-options':undefined} aria-activedescendant={activeId} aria-disabled={!!disabled} data-placeholder="@로 오브젝트를 선택하고 어떻게 바꿀지 입력하세요."
    onInput={()=>{if(emit())detect();}} onKeyDown={keyDown} onKeyUp={event=>{if(!['Enter','Tab','Escape','ArrowDown','ArrowUp'].includes(event.key))detect();}} onMouseUp={remember}
    onCompositionStart={()=>{composing.current=true;closeQuery();}} onCompositionEnd={()=>{composing.current=false;emit();detect();}}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)&&!event.relatedTarget?.closest('.sp-mention-menu'))closeQuery();}}
    onPaste={event=>{event.preventDefault();if(disabled)return;remember();const range=savedRange.current||endRange(),text=event.clipboardData.getData('text/plain').slice(0,6000);range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);place(range);if(emit())detect();}}
    onMouseOver={event=>{const chip=chipOf(event.target);if(chip&&!chip.contains(event.relatedTarget))onHover(optionOf(chip),chip);}}
    onMouseOut={event=>{const chip=chipOf(event.target);if(chip&&!chip.contains(event.relatedTarget))onLeave(event);}}
    onFocusCapture={event=>{const chip=chipOf(event.target);if(chip)onHover(optionOf(chip),chip,true);}}
    onBlurCapture={event=>{const chip=chipOf(event.target);if(chip&&!chip.contains(event.relatedTarget))onLeave(event);}}
    onClick={event=>{const chip=chipOf(event.target);if(!chip){detect();return;}if(event.target.closest('.sp-mention-chip-remove')){event.preventDefault();removeChip(chip);}else{event.preventDefault();onOpen(optionOf(chip),chip);}}}
  />;
});
