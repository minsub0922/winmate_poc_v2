import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {confirmDelete,Icon} from './common.jsx';
import {FeedbackPopup} from './feedback-popup.jsx';
import {describeSpatialTarget} from '../services/spatial.js';
import {SpatialLayoutCamera} from './spatial-layout-camera.jsx';
import {createDescriptionNodes,createRoomLabel,roomLabelMetrics,moveLayoutNode,layoutConnector,layoutTextLines} from '../domain/spatial/layout.js';

export const SpatialLayoutEditor=forwardRef(function SpatialLayoutEditor({layout,scene,library,onChange,disabled=false},ref){
  const svg=useRef(null),canvas=useRef(null),camera=useRef(null),drag=useRef(null),latest=useRef(layout),request=useRef(null),livePreview=useRef(null);
  latest.current=layout;
  const [selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[targetKind,setTargetKind]=useState('room'),[placingNames,setPlacingNames]=useState(false),[context,setContext]=useState(null),[activeTarget,setActiveTarget]=useState(null),[generating,setGenerating]=useState(false),[error,setError]=useState(''),[previewing,setPreviewing]=useState(false);
  useEffect(()=>()=>request.current?.abort(),[]);
  const display=draft||layout,node=display.nodes.find(n=>n.id===selected),callout=node?.type==='callout'&&!placingNames,target=display.targets.find(t=>t.id===activeTarget&&t.kind===targetKind);
  useImperativeHandle(ref,()=>({prepareSave:options=>camera.current?.prepareSave(options)||Promise.resolve(latest.current)}));
  const update=patch=>{const current=latest.current;onChange({...current,nodes:current.nodes.map(n=>n.id===selected?moveLayoutNode(n,patch):n)});};
  const addCallout=async()=>{
    if(!target||generating||disabled)return;
    const controller=new AbortController();request.current=controller;setGenerating(true);setError('');
    try{
      const result=await describeSpatialTarget(latest.current.sourceScene||scene,target.id,controller.signal);
      if(controller.signal.aborted)return;
      const current=latest.current,linked=current.targets.find(t=>t.id===target.id);
      if(!linked)throw new Error('선택 대상이 변경되었습니다. 다시 선택해 주세요.');
      const nodes=createDescriptionNodes(current,linked,result.text);
      onChange({...current,nodes:[...current.nodes,...nodes]});setSelected(nodes[0].id);setPlacingNames(false);setContext(null);
    }catch(e){if(!controller.signal.aborted)setError(e.message||'AI 설명을 만들지 못했습니다.');}
    finally{if(!controller.signal.aborted){setGenerating(false);request.current=null;}}
  };
  const toggle=async id=>{
    if(!node||node.type!=='callout'||disabled)return;
    if(node.targets.includes(id)&&!await confirmDelete({title:'연결을 해제할까요?',message:(layout.targets.find(t=>t.id===id)?.label||'선택 대상')+'과 설명 영역의 연결을 해제합니다.',confirmLabel:'연결 해제'}))return;
    const current=latest.current,active=current.nodes.find(n=>n.id===selected);if(!active)return;
    onChange({...current,nodes:current.nodes.map(n=>n.id===active.id?{...n,targets:n.targets.includes(id)?n.targets.filter(t=>t!==id):[...n.targets,id]}:n)});
  };
  const targetClick=(target,link=false)=>{
    if(disabled)return;
    setActiveTarget(target.id);setContext(null);
    if(callout&&link){void toggle(target.id);return;}
    if(!(target.kind==='room'&&placingNames)){setSelected(null);return;}
    const current=latest.current;if(current.nodes.length>=100)return;
    const existing=current.nodes.find(n=>n.type==='room-label'&&n.targets[0]===target.id);
    if(target.kind==='room'&&placingNames&&existing){setSelected(existing.id);return;}
    const next=createRoomLabel(current,target);
    onChange({...current,nodes:[...current.nodes,next]});setSelected(next.id);setContext(null);
  };
  const remove=async id=>{
    const current=latest.current,item=current.nodes.find(n=>n.id===id);if(!item||disabled)return;setContext(null);
    if(!await confirmDelete({title:'설명 영역을 삭제할까요?',message:item.text||'선택한 영역을 삭제합니다.'}))return;
    onChange({...latest.current,nodes:latest.current.nodes.filter(n=>n.id!==id)});setSelected(null);
  };
  const point=event=>{const p=svg.current.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.current.getScreenCTM().inverse());};
  const start=(event,n,resize=false)=>{
    if(disabled||event.button!==0)return;event.stopPropagation();event.preventDefault();setContext(null);
    if(n.type==='room-label'&&callout&&!resize){void toggle(n.targets[0]);return;}
    setSelected(n.id);drag.current={id:n.id,node:n,start:point(event),pointer:event.pointerId,resize};svg.current.setPointerCapture(event.pointerId);
  };
  const move=event=>{const d=drag.current;if(!d||d.pointer!==event.pointerId)return;const p=point(event),dx=p.x-d.start.x,dy=p.y-d.start.y,next=moveLayoutNode(d.node,d.resize?{w:d.node.w+dx,h:d.node.h+dy}:{x:d.node.x+dx,y:d.node.y+dy});d.next={...latest.current,nodes:latest.current.nodes.map(n=>n.id===d.id?next:n)};setDraft(d.next);};
  const finish=(event,cancel=false)=>{const d=drag.current;if(!d||d.pointer!==event.pointerId)return;drag.current=null;setDraft(null);if(svg.current.hasPointerCapture(event.pointerId))svg.current.releasePointerCapture(event.pointerId);if(!cancel&&d.next)onChange(d.next);};
  const menu=(event,n)=>{if(disabled)return;event.preventDefault();event.stopPropagation();const r=canvas.current.getBoundingClientRect();setSelected(n.id);setContext({id:n.id,x:Math.max(0,Math.min(r.width-120,event.clientX-r.left)),y:Math.max(0,Math.min(r.height-44,event.clientY-r.top))});};
  const exportSvg=async()=>{
    await camera.current?.prepareSave();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const copy=svg.current.cloneNode(true);copy.querySelectorAll('[data-editor-only]').forEach(el=>el.remove());copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width','1280');copy.setAttribute('height','720');
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download=(latest.current.title||'조감도').replace(/[<>:"/\\|?*]/g,'_')+'-layout.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  };
  const named=new Set(display.nodes.filter(n=>n.type==='room-label').map(n=>n.targets[0]));
  return <section className="sp-layout-editor" aria-label="조감도 레이아웃 편집">
    <div className="sp-layout-tools"><span>공간·제품을 선택하고 AI 설명을 추가하세요</span><button type="button" className="btn btn-sm" disabled={disabled} onClick={exportSvg}>레이아웃 SVG 다운로드</button></div>
    <div className="sp-layout-body"><div className="sp-layout-canvas" ref={canvas}>
      <div className="sp-layout-canvas-header">
        <button type="button" className="btn btn-primary btn-sm sp-layout-add-callout" disabled={disabled||generating||!target||layout.nodes.length>=100} title={target?target.label+' 설명 추가':'공간이나 제품을 먼저 선택하세요'} aria-busy={generating} onClick={addCallout}><Icon name="sparkle" size={15}/><span>{target?target.label+' 설명 추가':'공간·제품을 선택하세요'}</span><small>AI</small></button>
        <div className="sp-layout-target-controls"><div className="sp-layout-target-switch" role="group" aria-label="연결 대상 종류">{[['room','공간'],['product','제품']].map(([value,label])=><button type="button" key={value} aria-pressed={targetKind===value} onClick={()=>{setTargetKind(value);setActiveTarget(null);if(value!=='room')setPlacingNames(false);setContext(null);}}>{label}</button>)}</div>
          {targetKind==='room'&&<div className="sp-layout-room-mode" role="group" aria-label="공간 표시 방식"><button type="button" aria-pressed={!placingNames} disabled={disabled} onClick={()=>setPlacingNames(false)}>원형 포인팅</button><button type="button" aria-pressed={placingNames} disabled={disabled} onClick={()=>setPlacingNames(true)}>공간 이름 배치</button></div>}
        </div>
      </div>
      <svg ref={svg} viewBox="0 0 1280 720" role="group" aria-label="조감도와 설명 영역" onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)} onPointerDown={()=>{setSelected(null);setContext(null);}}>
        <rect width="1280" height="720" fill="#ffffff"/>
        <text x="64" y="66" fill="#1428a0" fontFamily="Noto Sans KR, sans-serif" fontSize="14" fontWeight="700">공간별 맞춤 제안</text>
        <text x="64" y="104" fill="#121417" fontFamily="Noto Sans KR, sans-serif" fontSize="28" fontWeight="700">{layout.title.length>48?layout.title.slice(0,47)+'…':layout.title}</text>
        <image style={{visibility:previewing?'hidden':'visible'}} href={layout.image} x={layout.imageBox.x} y={layout.imageBox.y} width={layout.imageBox.w} height={layout.imageBox.h}/>
        <foreignObject data-editor-only="live-preview" x={layout.imageBox.x} y={layout.imageBox.y} width={layout.imageBox.w} height={layout.imageBox.h} style={{pointerEvents:'none',visibility:previewing?'visible':'hidden'}}><canvas ref={livePreview} style={{width:'100%',height:'100%',display:'block'}}/></foreignObject>
        {display.nodes.filter(n=>n.type==='callout').flatMap(n=>n.targets.map(id=>{const t=display.targets.find(t=>t.id===id);if(!t)return null;const points=layoutConnector(n,t).map(p=>p.x+','+p.y).join(' ');return <g key={n.id+id} data-layout-connector={n.id+':'+id}><polyline points={points} fill="none" stroke="#1428a0" strokeWidth="2" strokeLinejoin="round"/><circle cx={t.x} cy={t.y} r="3" fill="#1428a0" stroke="white" strokeWidth="1.5"/>{selected===n.id&&<polyline data-editor-only="connector-hit" className="sp-layout-connector-hit" points={points} fill="none" stroke="transparent" strokeWidth="12" onPointerDown={e=>{e.stopPropagation();void toggle(id);}}/>}</g>;}))}
        {!disabled&&<g data-editor-only="targets">{display.targets.filter(t=>t.kind===targetKind&&(!placingNames||t.kind!=='room'||!named.has(t.id))).map(t=>{const active=t.id===activeTarget||!!callout&&node.targets.includes(t.id),size=roomLabelMetrics(t.label);return <g key={t.id} role="button" tabIndex="0" aria-label={t.label+(t.kind==='room'&&placingNames?' 공간명 추가':' 선택')} aria-pressed={active} data-layout-target={t.id} onPointerDown={e=>{e.stopPropagation();targetClick(t,e.shiftKey);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();targetClick(t,e.shiftKey);}}}>
          {t.kind==='room'&&placingNames?<><rect x={t.x-size.w/2} y={t.y-size.h/2} width={size.w} height={size.h} rx="8" fill="#ffffff" stroke="#1428a0" strokeWidth="1.2"/><svg x={t.x-size.w/2} y={t.y-size.h/2} width={size.w} height={size.h} overflow="hidden"><text x={size.w/2} y={(size.h-(layoutTextLines({type:'room-label',text:t.label,...size}).length-1)*size.fontSize*1.5+size.fontSize*.7)/2} textAnchor="middle" fontSize={size.fontSize} fontFamily="Noto Sans KR, sans-serif" fill="#1428a0">{layoutTextLines({type:'room-label',text:t.label,...size}).map((line,i)=><tspan key={i} x={size.w/2} dy={i?size.fontSize*1.5:0}>{line}</tspan>)}</text></svg></>:<><circle cx={t.x} cy={t.y} r="11" fill="transparent"/><circle data-layout-point="true" cx={t.x} cy={t.y} r={active?5:4} fill={active?'#1428a0':'#ffffff'} stroke="#1428a0" strokeWidth="1.5"/></>}
          <title>{t.label}</title>
        </g>;})}</g>}
        {display.nodes.map(n=><g key={n.id} role="button" tabIndex={disabled?-1:0} aria-label={(n.type==='callout'?'설명 상자: ':n.type==='room-label'?'공간명: ':'텍스트: ')+n.text} aria-pressed={selected===n.id} data-layout-node={n.id} data-layout-node-type={n.type} onPointerDown={e=>start(e,n)} onContextMenu={e=>menu(e,n)} onKeyDown={e=>{if(disabled)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();if(n.type==='room-label'&&callout)void toggle(n.targets[0]);else setSelected(n.id);}if(selected===n.id&&['Delete','Backspace'].includes(e.key)){e.preventDefault();void remove(n.id);}if(selected===n.id&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();update({x:n.x+(e.key==='ArrowRight'?5:e.key==='ArrowLeft'?-5:0),y:n.y+(e.key==='ArrowDown'?5:e.key==='ArrowUp'?-5:0)});}}}>
          {n.type!=='text'&&<rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.type==='room-label'?8:18} fill={n.style==='outline'?'#ffffff':'#006eff'} stroke={n.type==='room-label'?'#1428a0':'#006eff'} strokeWidth={n.type==='room-label'?1.2:2}/>}
          {n.type==='text'&&<rect x={n.x} y={n.y} width={n.w} height={n.h} fill="transparent"/>}
          <svg x={n.x} y={n.y} width={n.w} height={n.h} overflow="hidden"><text x={n.type==='room-label'?n.w/2:16} y={n.type==='room-label'?(n.h-(layoutTextLines(n).length-1)*n.fontSize*1.5+n.fontSize*.7)/2:16+n.fontSize} textAnchor={n.type==='room-label'?'middle':'start'} fill={n.type==='callout'&&n.style!=='outline'?'#ffffff':n.type==='room-label'?'#1428a0':'#182346'} fontFamily="Noto Sans KR, sans-serif" fontSize={n.fontSize}>{layoutTextLines(n).map((line,i)=><tspan key={i} x={n.type==='room-label'?n.w/2:16} dy={i?n.fontSize*1.5:0}>{line||' '}</tspan>)}</text></svg>
          {selected===n.id&&<g data-editor-only="selection"><rect x={n.x-(n.type==='room-label'?0:3)} y={n.y-(n.type==='room-label'?0:3)} width={n.w+(n.type==='room-label'?0:6)} height={n.h+(n.type==='room-label'?0:6)} rx="7" fill="transparent" stroke="#5c8be4" strokeWidth="2" strokeDasharray="5 4"/></g>}
        </g>)}

        {node&&!disabled&&<rect data-editor-only="resize" aria-label="설명 영역 크기 조절" x={node.x+node.w-(node.type==='room-label'?5:8)} y={node.y+node.h-(node.type==='room-label'?5:8)} width={node.type==='room-label'?10:16} height={node.type==='room-label'?10:16} fill="#1428a0" stroke="white" strokeWidth="2" className="sp-layout-resize" onPointerDown={e=>start(e,node,true)}/>}
      </svg>
      <p className="sp-layout-help">{placingNames?'공간 이름을 눌러 배치하세요. 원형 포인팅 버튼으로 돌아갈 수 있어요.':'대상 선택 후 AI 설명 추가 · Shift+클릭으로 선택한 설명에 연결 · 드래그로 이동'}</p>
      {context&&<div className="sp-layout-context" role="menu" style={{left:context.x,top:context.y}} onPointerDown={e=>e.stopPropagation()}><button type="button" role="menuitem" onClick={()=>remove(context.id)}>삭제</button></div>}
    </div><aside className="sp-layout-inspector" aria-label="설명 영역 속성">
      <SpatialLayoutCamera ref={camera} layout={layout} scene={scene} library={library} onChange={onChange} disabled={disabled} previewCanvas={livePreview} onPreviewChange={setPreviewing}/>
      {node?<><strong>{node.type==='callout'?'둥근 설명 상자':node.type==='room-label'?'공간명 오브젝트':'텍스트 영역'}</strong><label>내용<textarea aria-label="설명 내용" value={node.text} maxLength={3000} disabled={disabled} onChange={e=>update({text:e.target.value})}/></label><label>글자 크기<select aria-label="설명 글자 크기" value={node.fontSize} disabled={disabled} onChange={e=>update({fontSize:Number(e.target.value)})}>{[12,13,14,16,18,20,24,28,32,36].map(size=><option key={size}>{size}</option>)}</select></label>
        {node.type==='callout'&&<label>상자 스타일<select aria-label="설명 상자 스타일" value={node.style||'blue'} disabled={disabled} onChange={e=>update({style:e.target.value})}><option value="blue">파란 배경 · 흰색 글자</option><option value="outline">흰 배경 · 파란 테두리</option></select></label>}
        {layoutTextLines(node).length*node.fontSize*1.5+(node.type==='room-label'?0:24)>node.h&&<p className="sp-layout-overflow" role="status">내용이 영역을 넘습니다. 상자를 늘리거나 글자를 줄여 주세요.</p>}
      </>:<div className="sp-layout-empty"><p>맵에서 공간·제품을 선택하면 AI가 설명을 작성하고 자동으로 배치·연결합니다.</p></div>}
    </aside></div>
    <FeedbackPopup message={error} onDismiss={()=>setError('')}/><FeedbackPopup message={generating?'AI가 설명을 작성하고 있어요…':''} kind="progress"/>
  </section>;
});
