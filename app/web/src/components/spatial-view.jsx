import {FeedbackPopup} from './feedback-popup.jsx';
import React,{forwardRef,useEffect,useLayoutEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import { planSvg } from '../domain/spatial/plan-svg.js';
import { planAnchors } from '../domain/spatial/scene.js';
import { spatialMoveGroup } from '../domain/spatial/edit.js';
import { roomDropSlots } from '../domain/spatial/room-arrangement.js';
import { loadSpatialRenderer } from '../services/spatial-renderer.js';
import { captureSpatial } from '../services/spatial.js';

// 공간 이름표(3D · 2D 모두 HTML) — 누르면 onRoomClick(roomId), 다른 공간 위로 끌어 놓으면 onRoomDrop(roomId, targetId), 빈 칸(끄는 동안 보이는 점선 자리)에 놓으면 onRoomPlace(roomId, {row, col}). roomMenu는 activeRoom 이름표 바로 아래에 뜬다.
// pointerMode: 3D에서 빈 곳을 끌 때 회전(rotate) · 이동(pan).
export const SpatialView=forwardRef(function SpatialView({scene,library,view='3d',selected,highlighted=[],onSelect,onMove,onCameraEdit,labels=true,selectionContent,disabled=false,pointerMode='rotate',onRoomClick,onRoomDrop,onRoomPlace,activeRoom=null,roomMenu=null},ref){
  const host=useRef(null),engine=useRef(null),drag=useRef(null),sceneKey=useRef(null),callbacks=useRef({});
  callbacks.current={onSelect,onMove,onCameraEdit,disabled,highlighted,pointerMode};
  const source=useRef({scene,library});source.current={scene,library};
  const [error,setError]=useState(''),[anchors,setAnchors]=useState(null),[ready,setReady]=useState(false),[dragging,setDragging]=useState(false),[size,setSize]=useState({width:1,height:1});
  const [moduleUnavailable,setModuleUnavailable]=useState(false);
  useImperativeHandle(ref,()=>({snapshot:async options=>{const renderer=engine.current;if(!renderer)return null;const {scene,library}=source.current;const camera=renderer.cameraState();const snapshot=await captureSpatial(scene,library,{...options,camera});if(renderer!==engine.current||source.current.scene!==scene)throw new Error('보기가 변경되었습니다. 다시 내보내 주세요.');return snapshot;},cameraState:()=>engine.current?.cameraState(),exportGlb:()=>engine.current?.exportGlb(),anchors:()=>engine.current?.anchors()}),[]);
  useLayoutEffect(()=>{
    const element=host.current,resize=()=>{const {width,height}=element.getBoundingClientRect();setSize(old=>old.width===width&&old.height===height?old:{width,height});};
    resize();const observer=new ResizeObserver(resize);observer.observe(element.parentElement);window.addEventListener('resize',resize);
    return()=>{observer.disconnect();window.removeEventListener('resize',resize);};
  },[]);
  // 전체 크기가 달라지면(공간을 다른 줄로 옮겼을 때 등) 시점을 다시 맞춘다
  const key=scene.templateId+'-'+scene.scope+'-'+scene.rooms.map(r=>r.id).join(',')+'-'+scene.width+'x'+scene.depth;
  useEffect(()=>{
    setError('');setModuleUnavailable(false);
    if(view!=='3d'){setReady(true);return;}
    let active=true;setReady(false);
    loadSpatialRenderer().then(({createSpatialRenderer})=>{
      if(!active)return;
      engine.current=createSpatialRenderer(host.current,{onSelect:id=>callbacks.current.onSelect?.(id),onMove:(id,patch)=>callbacks.current.onMove?.(id,patch),onDrag:setDragging,onCameraEdit:onCameraEdit?()=>callbacks.current.onCameraEdit?.():undefined,onChange:()=>{if(active)setAnchors(engine.current?.anchors());},onError:e=>setError(e.message)});
      engine.current.setScene(scene,library,{selectedId:selected});engine.current.setEditable(!callbacks.current.disabled);engine.current.setPointerMode?.(callbacks.current.pointerMode);sceneKey.current=key;setAnchors(engine.current.anchors());
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
  useEffect(()=>engine.current?.setPointerMode?.(pointerMode),[pointerMode]);
  useEffect(()=>engine.current?.setHighlighted(highlighted),[highlighted]);
  useEffect(()=>{if(!selected)return;const escape=e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!document.querySelector('.delete-confirmation')){onSelect?.(null);}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[selected,onSelect]);
  const svg=useMemo(()=>view==='2d'?planSvg(scene,library,{selected,highlighted,labels:false}):'',[scene,library,selected,highlighted,labels,view]);
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
  // 공간 이름표 위치(뷰 픽셀) — 3D는 렌더러가 투영한 공간 중심(이름표 가운데), 2D는 공간 왼쪽 위 모서리(이름표 왼쪽 위 — 가구를 가리지 않게).
  const roomPoints=view==='3d'?anchors&&Object.fromEntries(scene.rooms.flatMap(r=>{const p=anchors.rooms?.[r.id];return p?[[r.id,{x:p.x/(anchors.width||1)*size.width,y:p.y/(anchors.height||1)*size.height}]]:[];})):Object.fromEntries(scene.rooms.map(r=>[r.id,{x:ox+(projection.origin[0]+r.x*projection.scale)*scale+8,y:oy+(projection.origin[1]+r.z*projection.scale)*scale+8}]));
  const anchor=point&&view==='3d'?{x:point.x/(anchors.width||1)*size.width,y:point.y/(anchors.height||1)*size.height}:point;
  // 공간을 끌어 놓을 수 있는 빈 칸(뷰 픽셀) — 끄는 동안에만 계산한다
  const roomSlots=()=>{
    if(!onRoomPlace)return [];
    const slots=roomDropSlots(scene);
    if(view!=='3d')return slots.map(s=>({row:s.row,col:s.col,x:ox+(projection.origin[0]+s.x*projection.scale)*scale,y:oy+(projection.origin[1]+s.z*projection.scale)*scale}));
    const projected=engine.current?.projectGround?.(slots);if(!projected||!anchors)return [];
    return slots.map((s,i)=>({row:s.row,col:s.col,x:projected[i].x/(anchors.width||1)*size.width,y:projected[i].y/(anchors.height||1)*size.height}));
  };
  return <div className={'sp-view sp-view-'+view+(dragging?' is-dragging':'')} data-ready={ready} data-view={view} data-highlighted-object-ids={highlighted.join(' ')}>
    <div className="sp-render-host" ref={host} onPointerDown={down} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}>
      {view==='2d'&&<div className="sp-plan-image" dangerouslySetInnerHTML={{__html:svg}}/>}
    </div>
    {labels&&roomPoints&&<RoomLabels corner={view==='2d'} scene={scene} points={roomPoints} disabled={disabled} activeRoom={activeRoom} menu={roomMenu} onClick={onRoomClick} onDrop={onRoomDrop} onPlace={onRoomPlace} slots={roomSlots} size={size}/>}
    {selectionContent&&anchor&&!dragging&&point?.visible!==false&&<SelectionPopover key={selected} anchor={anchor} size={size}>{selectionContent}</SelectionPopover>}
    <FeedbackPopup message={view==='3d'&&!ready&&!error?"3D 오브젝트를 배치하는 중…":""} kind="progress"/>
    <FeedbackPopup message={view==='3d'?error:""} actionLabel={moduleUnavailable?"최신 화면으로 새로고침":undefined} onAction={()=>window.location.reload()}/>
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

// 공간 이름표 — 누르면 메뉴, 5px 넘게 끌면 끌어 옮기기. 놓일 자리는 가장 가까운 다른 공간 이름표(자리 바꾸기) 또는 빈 칸(그 자리로 옮기기 — 배치가 바뀐다).
function RoomLabels({scene,points,corner=false,disabled,activeRoom,menu,onClick,onDrop,onPlace,slots,size}){
  const [drag,setDrag]=useState(null),[anchor,setAnchor]=useState(null),start=useRef(null),layer=useRef(null);
  // 메뉴는 실제 이름표 아래 가운데에 — 이름표 크기 · 모서리 배치와 상관없이 그려진 자리를 잰다.
  useLayoutEffect(()=>{
    const button=activeRoom&&layer.current?.querySelector(`[data-room-label="${CSS.escape(activeRoom)}"]`);
    if(!button){setAnchor(null);return;}
    const r=button.getBoundingClientRect(),l=layer.current.getBoundingClientRect(),next={x:r.left-l.left+r.width/2,y:r.top-l.top+r.height/2};
    setAnchor(old=>old&&Math.abs(old.x-next.x)<.5&&Math.abs(old.y-next.y)<.5?old:next);
  });
  const local=event=>{const r=layer.current.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};};
  const nearest=(id,p)=>{let best=null,distance=Infinity;for(const r of scene.rooms){if(r.id===id||!points[r.id])continue;const d=Math.hypot(points[r.id].x-p.x,points[r.id].y-p.y);if(d<distance){distance=d;best=r.id;}}return best;};
  const down=(event,id)=>{if(disabled||event.button!==0)return;event.stopPropagation();start.current={id,x:event.clientX,y:event.clientY,pointerId:event.pointerId,moved:false};event.currentTarget.setPointerCapture(event.pointerId);};
  const move=event=>{
    const s=start.current;if(!s||s.pointerId!==event.pointerId)return;
    if(!s.moved&&Math.hypot(event.clientX-s.x,event.clientY-s.y)<=5)return;
    s.moved=true;if(!s.slots)s.slots=scene.rooms.length>1&&onPlace?slots?.()||[]:[];
    const p=local(event),room=scene.rooms.length>1?nearest(s.id,p):null,distance=room?Math.hypot(points[room].x-p.x,points[room].y-p.y):Infinity;
    const slot=s.slots.reduce((best,item)=>{const d=Math.hypot(item.x-p.x,item.y-p.y);return d<distance&&(!best||d<best.d)?{...item,d}:best;},null);
    setDrag({id:s.id,...p,target:slot?null:room,slot,slots:s.slots});
  };
  const up=(event,cancel=false)=>{
    const s=start.current;if(!s||s.pointerId!==event.pointerId)return;start.current=null;
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(!s.moved){if(!cancel)onClick?.(s.id);return;}
    const target=drag?.target,slot=drag?.slot;setDrag(null);if(cancel)return;
    if(slot)onPlace?.(s.id,{row:slot.row,col:slot.col});else if(target)onDrop?.(s.id,target);
  };
  const index=Object.fromEntries(scene.rooms.map((r,i)=>[r.id,i]));
  const label=r=><><b>{String(index[r.id]+1).padStart(2,'0')}</b>{r.name}</>;
  const active=activeRoom&&points[activeRoom]&&!drag?anchor:null;
  return <><div className={'sp-room-labels'+(drag?' is-room-dragging':'')} ref={layer}>
    {scene.rooms.map(r=>{const p=points[r.id];return p&&<button key={r.id} type="button" data-room-label={r.id} aria-haspopup="menu" aria-expanded={activeRoom===r.id} title={onPlace?"눌러서 공간 메뉴 · 끌어서 빈 자리로 옮기거나 다른 공간과 자리 바꾸기":"눌러서 공간 메뉴 · 끌어서 다른 공간과 자리 바꾸기"}
      className={(corner?'is-corner ':'')+(drag?.id===r.id?'is-dragged ':'')+(drag?.target===r.id?'is-drop-target ':'')+(activeRoom===r.id?'is-active':'')} style={{left:p.x,top:p.y}}
      onPointerDown={e=>down(e,r.id)} onPointerMove={move} onPointerUp={e=>up(e)} onPointerCancel={e=>up(e,true)} onClick={e=>{if(e.detail===0&&!disabled)onClick?.(r.id);}}>{label(r)}</button>;})}
    {drag?.slots.map(slot=><span key={slot.row+':'+slot.col} className={'sp-room-slot'+(drag.slot&&drag.slot.row===slot.row&&drag.slot.col===slot.col?' is-drop-target':'')} data-room-slot={slot.row+':'+slot.col} aria-hidden="true" style={{left:slot.x,top:slot.y}}>여기로</span>)}
    {drag&&<div className="sp-room-drag-ghost" aria-hidden="true" style={{left:drag.x,top:drag.y}}>{label(scene.rooms.find(r=>r.id===drag.id))}</div>}
  </div>
  {active&&menu&&<div className="sp-room-menu-layer"><RoomMenu point={active} size={size}>{menu}</RoomMenu></div>}</>;
}
function RoomMenu({point,size,children}){
  const box=useRef(null),[measured,setMeasured]=useState({width:240,height:120});
  useLayoutEffect(()=>{const element=box.current,measure=()=>setMeasured(old=>old.width===element.offsetWidth&&old.height===element.offsetHeight?old:{width:element.offsetWidth,height:element.offsetHeight});measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
  // 이름표 바로 아래 — 아래 자리가 모자라면 이름표 위로 띄운다.
  const left=Math.max(10+measured.width/2,Math.min(size.width-10-measured.width/2,point.x)),below=point.y+18,top=below+measured.height<=size.height-8?below:Math.max(8,point.y-18-measured.height);
  return <div ref={box} className="sp-room-menu" role="menu" style={{left,top}} onPointerDown={e=>e.stopPropagation()}>{children}</div>;
}
