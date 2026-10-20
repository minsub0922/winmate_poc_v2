import {FeedbackPopup} from './feedback-popup.jsx';
import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Icon} from './common.jsx';
import {loadSpatialRenderer} from '../services/spatial-renderer.js';
import {layoutCameraAngles,reprojectSpatialLayout} from '../domain/spatial/layout.js';
import {focusScene,planAnchors,validateScene} from '../domain/spatial/scene.js';
import {planSvg,svgData} from '../domain/spatial/plan-svg.js';

export const SpatialLayoutCamera=forwardRef(function SpatialLayoutCamera({layout,scene,library,onChange,disabled=false,previewCanvas,onPreviewChange},ref){
  const host=useRef(null),engine=useRef(null),latest=useRef({layout,onChange}),source=useRef(null),pending=useRef(null),frameId=useRef(null),timer=useRef(null),baseline=useRef(null),applied=useRef(''),preparing=useRef(null);
  latest.current={layout,onChange};
  if(!source.current){const roomIds=layout.targets.filter(t=>t.kind==='room').map(t=>t.id.slice(5)),base=layout.sourceScene||(roomIds.length===1&&scene.rooms.length>1?focusScene(scene,roomIds[0]):scene),{presentation,...frozen}=base;source.current=structuredClone(frozen);}
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[angles,setAngles]=useState(()=>layoutCameraAngles(layout.camera||source.current.camera));
  const desired=useRef(angles),ratio=useRef(layout.imageBox.h/layout.imageBox.w);
  const initialCamera=useRef(null);
  const pointerActive=useRef(false);
  const publish=(next,options)=>{next={...next,initialCamera:next.initialCamera||structuredClone(initialCamera.current)};latest.current={...latest.current,layout:next};applied.current=JSON.stringify(next.camera);latest.current.onChange(next,options);return next;};
  const capture=(view=latest.current.layout.view,quality='final')=>{
    const current=latest.current.layout;
    if(view==='2d')return reprojectSpatialLayout(current,source.current,library,{image:svgData(planSvg(source.current,library,{labels:false,productPins:false,dimensions:false,transparentBackground:true})),anchors:{width:1280,height:820,...planAnchors(source.current)},camera:engine.current?.cameraState()||current.camera},'2d');
    if(!engine.current)return current;
    if(pending.current){engine.current.setCameraAngles(pending.current);pending.current=null;}
    const live=quality==='preview'&&!!previewCanvas?.current,w=live?800:1280,snapshot=engine.current.snapshot({w,h:Math.round(w*ratio.current),transparentBackground:true,encode:!live,pixelRatio:live?1:Math.min(window.devicePixelRatio||1,2),onRender:live?rendered=>{const canvas=previewCanvas.current;canvas.width=rendered.width;canvas.height=rendered.height;canvas.getContext('2d').drawImage(rendered,0,0);}:undefined});
    if(live){snapshot.image=current.image;onPreviewChange?.(true);}
    return reprojectSpatialLayout(current,source.current,library,snapshot,'3d');
  };
  const commit=()=>{
    if(frameId.current)cancelAnimationFrame(frameId.current);frameId.current=null;clearTimeout(timer.current);
    if(!baseline.current)return latest.current.layout;
    const before=baseline.current;baseline.current=null;const next=publish(capture('3d'),{before});onPreviewChange?.(false);return next;
  };
  useImperativeHandle(ref,()=>({prepareSave:async({waitForReady=true}={})=>{if(waitForReady)await preparing.current?.catch(()=>{});return commit();}}));
  useEffect(()=>{
    let active=true;
    preparing.current=(async()=>{
      const errors=validateScene(source.current,library).errors;if(errors.length)throw new Error(errors[0]);
      const {createSpatialRenderer}=await loadSpatialRenderer();if(!active)return;
      const renderer=createSpatialRenderer(host.current,{transparentBackground:true,pixelRatio:1});engine.current=renderer;
      renderer.setScene({...source.current,camera:latest.current.layout.camera||source.current.camera},library);renderer.setEditable(false);await renderer.ready();if(!active)return;
      if(!initialCamera.current)initialCamera.current=structuredClone(latest.current.layout.initialCamera?.position?latest.current.layout.initialCamera:renderer.cameraState());
      setReady(true);applied.current=JSON.stringify(renderer.cameraState());setAngles(layoutCameraAngles(renderer.cameraState()));desired.current=layoutCameraAngles(renderer.cameraState());
      publish(capture(latest.current.layout.view),{history:false});
    })().catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;clearTimeout(timer.current);if(frameId.current)cancelAnimationFrame(frameId.current);engine.current?.dispose();engine.current=null;};
  },[library]);
  useEffect(()=>{
    if(!ready||baseline.current||applied.current===JSON.stringify(layout.camera))return;
    if(layout.camera?.position)engine.current?.setCameraState(layout.camera);
    applied.current=JSON.stringify(layout.camera);const next=layoutCameraAngles(layout.camera||source.current.camera);setAngles(next);desired.current=next;
  },[layout.camera,ready]);
  const change=(key,value)=>{
    if(disabled||!ready||Number(value)===desired.current[key])return;
    if(!baseline.current)baseline.current=latest.current.layout;
    const next={...desired.current,[key]:Number(value)};desired.current=next;setAngles(next);pending.current=next;clearTimeout(timer.current);
    if(!frameId.current)frameId.current=requestAnimationFrame(()=>{frameId.current=null;publish(capture('3d','preview'),{history:false});});
    if(!pointerActive.current)timer.current=setTimeout(commit,180);
  };
  const finishGesture=()=>{pointerActive.current=false;commit();};
  const switchView=view=>{commit();if(view==='3d'&&!ready)return;publish(capture(view),{});};
  const resetCamera=()=>{
    if(disabled||!ready||latest.current.layout.view!=='3d'||!initialCamera.current)return;
    commit();const before=latest.current.layout,original=initialCamera.current,current=engine.current.cameraState();
    if(['zoom','fit'].every(key=>Math.abs(current[key]-original[key])<1e-7)&&['position','target'].every(key=>current[key].every((n,i)=>Math.abs(n-original[key][i])<1e-7)))return;
    pending.current=null;engine.current.setCameraState(original);const next=layoutCameraAngles(original);desired.current=next;setAngles(next);publish(capture('3d'),{before});
  };
  return <section className="sp-layout-camera" aria-label="조감도 각도 조정" data-ready={ready}>
    <div className="sp-layout-camera-heading"><strong>조감도 각도</strong><div className="sp-layout-camera-actions"><div className="sp-segment">{['2d','3d'].map(view=><button type="button" key={view} disabled={disabled||view==='3d'&&!ready} aria-pressed={layout.view===view} onClick={()=>switchView(view)}>{view.toUpperCase()}</button>)}</div><button type="button" className="btn btn-ghost btn-sm" title="추출할 때의 각도와 확대 배율로 복원" disabled={disabled||!ready||layout.view!=='3d'} onClick={resetCamera}><Icon name="refresh" size={13}/>원래 각도로</button></div></div>
    {[['azimuth','회전 각도',0,360,1,'°'],['elevation','위에서 보는 각도',10,80,1,'°'],['zoom','확대',.4,2.2,.05,'×']].map(([key,label,min,max,step,unit])=><label key={key}><span>{label}<output>{key==='zoom'?angles[key].toFixed(2):Math.round(angles[key])}{unit}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} disabled={disabled||!ready||layout.view!=='3d'} value={angles[key]} onInput={e=>change(key,e.target.value)} onChange={e=>change(key,e.target.value)} onPointerDown={e=>{pointerActive.current=true;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={finishGesture} onPointerCancel={finishGesture} onLostPointerCapture={finishGesture} onKeyUp={finishGesture} onBlur={finishGesture}/></label>)}
    <FeedbackPopup message={error}/><FeedbackPopup message={!error&&!ready?"각도 조정을 준비하는 중…":""} kind="progress"/>
    <div className="sp-layout-camera-host" ref={host} aria-hidden="true" style={{width:1280,height:Math.round(1280*ratio.current)}}/>
  </section>;
});
