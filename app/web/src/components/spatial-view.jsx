import {FeedbackPopup} from './feedback-popup.jsx';
import React,{forwardRef,useEffect,useLayoutEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import { planSvg } from '../domain/spatial/plan-svg.js';
import { planAnchors } from '../domain/spatial/scene.js';
import { spatialMoveGroup } from '../domain/spatial/edit.js';
import { loadSpatialRenderer } from '../services/spatial-renderer.js';

export const SpatialView=forwardRef(function SpatialView({scene,library,view='3d',selected,highlighted=[],onSelect,onMove,labels=true,selectionContent,disabled=false},ref){
  const host=useRef(null),engine=useRef(null),drag=useRef(null),sceneKey=useRef(null),callbacks=useRef({});
  callbacks.current={onSelect,onMove,disabled,highlighted};
  const [error,setError]=useState(''),[anchors,setAnchors]=useState(null),[ready,setReady]=useState(false),[dragging,setDragging]=useState(false),[size,setSize]=useState({width:1,height:1});
  const [moduleUnavailable,setModuleUnavailable]=useState(false);
  useImperativeHandle(ref,()=>({snapshot:async options=>{const renderer=engine.current;if(!renderer)return null;await renderer.ready();if(renderer!==engine.current)throw new Error('보기가 변경되었습니다. 다시 내보내 주세요.');return renderer.snapshot(options);},cameraState:()=>engine.current?.cameraState(),exportGlb:()=>engine.current?.exportGlb(),anchors:()=>engine.current?.anchors()}),[]);
  useLayoutEffect(()=>{
    const element=host.current,resize=()=>{const {width,height}=element.getBoundingClientRect();setSize(old=>old.width===width&&old.height===height?old:{width,height});};
    resize();const observer=new ResizeObserver(resize);observer.observe(element.parentElement);window.addEventListener('resize',resize);
    return()=>{observer.disconnect();window.removeEventListener('resize',resize);};
  },[]);
  const key=scene.templateId+'-'+scene.scope+'-'+scene.rooms.map(r=>r.id).join(',');
  useEffect(()=>{
    setError('');setModuleUnavailable(false);
    if(view!=='3d'){setReady(true);return;}
    let active=true;setReady(false);
    loadSpatialRenderer().then(({createSpatialRenderer})=>{
      if(!active)return;
      engine.current=createSpatialRenderer(host.current,{onSelect:id=>callbacks.current.onSelect?.(id),onMove:(id,patch)=>callbacks.current.onMove?.(id,patch),onDrag:setDragging,onChange:()=>{if(active)setAnchors(engine.current?.anchors());},onError:e=>setError(e.message)});
      engine.current.setScene(scene,library,{selectedId:selected});engine.current.setEditable(!callbacks.current.disabled);sceneKey.current=key;setAnchors(engine.current.anchors());
      engine.current.setHighlighted(callbacks.current.highlighted);
      return engine.current.ready().then(()=>{if(active)setReady(true);});
    }).catch(e=>{if(active){setError(e.message);setModuleUnavailable(e.code==='spatial_module_unavailable');}});
    return ()=>{active=false;engine.current?.dispose();engine.current=null;};
  },[view,library]);
  useEffect(()=>{
    let active=true;
    if(engine.current){const renderer=engine.current;setReady(false);renderer.setScene(scene,library,{reset:sceneKey.current!==key,selectedId:selected});sceneKey.current=key;setAnchors(renderer.anchors());renderer.ready().then(()=>{if(active&&renderer===engine.current)setReady(true);}).catch(e=>{if(active)setError(e.message);});}
    return()=>{active=false;};
  },[scene,selected]);
  useEffect(()=>engine.current?.setEditable(!disabled),[disabled]);
  useEffect(()=>engine.current?.setHighlighted(highlighted),[highlighted]);
  useEffect(()=>{if(!selected)return;const escape=e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!document.querySelector('.delete-confirmation')){onSelect?.(null);}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[selected,onSelect]);
  const svg=useMemo(()=>view==='2d'?planSvg(scene,library,{selected,highlighted,labels}):'',[scene,library,selected,highlighted,labels,view]);
  const projection=planAnchors(scene),scale=Math.min(size.width/1280,size.height/820),ox=(size.width-1280*scale)/2,oy=(size.height-820*scale)/2;
  const coords=event=>{const r=host.current.getBoundingClientRect(),k=Math.min(r.width/1280,r.height/820),offsetX=(r.width-1280*k)/2,offsetY=(r.height-820*k)/2;return {x:((event.clientX-r.left-offsetX)/k-projection.origin[0])/projection.scale,z:((event.clientY-r.top-offsetY)/k-projection.origin[1])/projection.scale};};
  const down=event=>{
    if(view!=='2d'||disabled||event.button!==0)return;
    const id=event.target.closest('[data-object-id]')?.getAttribute('data-object-id')||event.target.closest('[data-product-pin]')?.getAttribute('data-product-pin');
    if(id){drag.current={id,start:coords(event),client:{x:event.clientX,y:event.clientY},object:scene.objects.find(o=>o.id===id),ids:spatialMoveGroup(scene,id),pointerId:event.pointerId};host.current.setPointerCapture(event.pointerId);}
    else onSelect?.(null);
  };
  const preview=(d,dx=0,dz=0)=>{
    for(const node of host.current.querySelectorAll('[data-object-id],[data-product-pin]')){
      const id=node.getAttribute('data-object-id')||node.getAttribute('data-product-pin');if(!d.ids.has(id))continue;
      if(!node.hasAttribute('data-drag-transform'))node.setAttribute('data-drag-transform',node.getAttribute('transform')||'');
      node.setAttribute('transform',`translate(${dx*projection.scale} ${dz*projection.scale}) `+node.getAttribute('data-drag-transform'));
    }
  };
  const move=event=>{
    const d=drag.current;if(!d||d.pointerId!==event.pointerId||Math.hypot(event.clientX-d.client.x,event.clientY-d.client.y)<=5)return;
    const p=coords(event);d.moved=true;d.dx=Math.round((p.x-d.start.x)*20)/20;d.dz=Math.round((p.z-d.start.z)*20)/20;setDragging(true);preview(d,d.dx,d.dz);
  };
  const finish=(event,cancel=false)=>{
    const d=drag.current;if(!d||d.pointerId!==event.pointerId)return;drag.current=null;setDragging(false);preview(d);
    if(host.current.hasPointerCapture(event.pointerId))host.current.releasePointerCapture(event.pointerId);
    if(cancel){if(d.moved)onSelect?.(null);return;}
    if(d.dx||d.dz)onMove?.(d.id,{x:Math.round((d.object.x+d.dx)*20)/20,z:Math.round((d.object.z+d.dz)*20)/20});
    onSelect?.(d.moved?null:d.id);
  };
  const object=scene.objects.find(o=>o.id===selected),point=view==='3d'?anchors?.objects?.[selected]:object?{x:ox+(projection.origin[0]+object.x*projection.scale)*scale,y:oy+(projection.origin[1]+object.z*projection.scale)*scale}:null;
  const anchor=point&&view==='3d'?{x:point.x/(anchors.width||1)*size.width,y:point.y/(anchors.height||1)*size.height}:point;
  return <div className={'sp-view sp-view-'+view+(dragging?' is-dragging':'')} data-ready={ready} data-view={view} data-highlighted-object-ids={highlighted.join(' ')}>
    <div className="sp-render-host" ref={host} onPointerDown={down} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}>
      {view==='2d'&&<div className="sp-plan-image" dangerouslySetInnerHTML={{__html:svg}}/>}
    </div>
    {view==='3d'&&labels&&anchors&&<div className="sp-room-labels">{scene.rooms.map((r,i)=>{const p=anchors.rooms[r.id];return p&&<button key={r.id} type="button" style={{left:(p.x/anchors.width*100)+'%',top:(p.y/anchors.height*100)+'%'}} onClick={()=>!disabled&&onSelect?.('room:'+r.id)}><b>{String(i+1).padStart(2,'0')}</b>{r.name}</button>;})}</div>}
    {selectionContent&&anchor&&!dragging&&point?.visible!==false&&<SelectionPopover key={selected} anchor={anchor} size={size}>{selectionContent}</SelectionPopover>}
    <FeedbackPopup message={view==='3d'&&!ready&&!error?"3D 오브젝트를 배치하는 중…":""} kind="progress"/>
    <FeedbackPopup message={view==='3d'?error:""} actionLabel={moduleUnavailable?"최신 화면으로 새로고침":undefined} onAction={()=>window.location.reload()}/>
    <div className="sp-view-help">{view==='3d'?'오브젝트 드래그 이동 · 빈 공간 드래그 회전 · 휠 확대':'오브젝트 클릭 · 드래그로 위치 이동 · 5cm 스냅'}</div>
  </div>;
});

function SelectionPopover({anchor,size,children}){
  const popup=useRef(null),[height,setHeight]=useState(320),[area,setArea]=useState(size);
  useLayoutEffect(()=>{
    const parent=popup.current.parentElement;
    const measure=()=>{setHeight(popup.current.offsetHeight);setArea({width:parent.clientWidth,height:parent.clientHeight});};
    measure();const observer=new ResizeObserver(measure);observer.observe(parent);observer.observe(popup.current);return()=>observer.disconnect();
  },[]);
  const width=Math.min(360,area.width-20),right=anchor.x+18,left=right+width<=area.width-10?right:Math.max(10,anchor.x-width-18),top=Math.max(10,Math.min(area.height-height-10,anchor.y+12));
  return <div ref={popup} className={'sp-object-popover dpk lim'+(width<560?' narrow':'')} role="dialog" aria-label="선택한 오브젝트 상세" aria-modal="false" style={{left,top,width,maxHeight:Math.min(480,area.height-20)}} onPointerDown={e=>e.stopPropagation()}>{children}</div>;
}
