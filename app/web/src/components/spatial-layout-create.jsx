// 조감도 → PPT 레이아웃 만들기 (Storyboard의 조감도 장에서). 조감도 히스토리의 조감도 하나를 골라 그 자리에서 레이아웃 편집기를 열고,
// 저장하면 내 레이아웃(L_MY_… · kind spatial)으로 저장해 그 장에 적용한다. 예전에는 공간 스튜디오의 「레이아웃 추출」이 하던 일이다.
// 그 조감도의 지금 장면으로 만든 레이아웃이 이미 있으면 그것을 이어서 고친다.
import React,{useEffect,useRef,useState} from 'react';
import {Icon,Modal} from './common.jsx';
import {SpatialLayoutEditor} from './spatial-layout-editor.jsx';
import {getSpatialHistory,loadSpatialLibrary,captureSpatial} from '../services/spatial.js';
import {readSpatialMyLayout,saveSpatialMyLayout} from '../services/spatial-my-layout.js';
import {myList} from '../repositories/templates.js';
import {createSpatialLayout,createRoomLabel} from '../domain/spatial/layout.js';
import {spatialLayoutSignature} from '../domain/spatial/my-layout.js';
import {planSvg,svgData} from '../domain/spatial/plan-svg.js';
import {planAnchors} from '../domain/spatial/scene.js';
import '../styles/spatial.css';

export function SpatialLayoutCreate({historyId,view='3d',onSaved,onClose}){
  const [draft,setDraft]=useState(null),[library,setLibrary]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState('조감도를 준비하는 중'),[discard,setDiscard]=useState(false);
  const [undo,setUndo]=useState([]),[redo,setRedo]=useState([]);
  const draftRef=useRef(null),editor=useRef(null),templateId=useRef(null),savedSignature=useRef(null);
  const put=layout=>{draftRef.current=layout;setDraft(layout);};
  useEffect(()=>{
    let active=true;
    (async()=>{
      const record=await getSpatialHistory(historyId);
      if(!record?.scene)throw new Error('이 조감도에는 아직 배치된 공간이 없어요. 조감도 스튜디오에서 공간을 먼저 만들어 주세요.');
      const base=await loadSpatialLibrary(),revision=record.scene.assetRevision,lib=revision&&revision!==base.sourceHash?await loadSpatialLibrary(revision):base;
      // 이 조감도의 지금 장면으로 만든 레이아웃이 있으면 이어서 고친다. 조감도를 고친 뒤라면 고친 장면으로 새로 만든다.
      const existing=myList().find(meta=>meta.my?.kind==='spatial'&&meta.my.spatialHistoryId===historyId&&meta.my.spatialLayout?.sourceScene?.contentHash===record.scene.contentHash)||null;
      let layout=existing?await readSpatialMyLayout(existing):null;
      if(layout){templateId.current=existing.f;savedSignature.current=spatialLayoutSignature(layout);if(!layout.sourceScene)layout={...layout,sourceScene:record.scene};}
      else{
        const scene=record.scene;
        const snapshot=view==='3d'?await captureSpatial(scene,lib):{image:svgData(planSvg(scene,lib,{labels:false,productPins:false,dimensions:false,transparentBackground:true})),anchors:{width:1280,height:820,...planAnchors(scene)}};
        layout=createSpatialLayout(scene,lib,snapshot,view);
        layout.nodes=layout.targets.filter(target=>target.kind==='room').map(target=>createRoomLabel(layout,target));
      }
      if(active){setLibrary(lib);put(layout);setBusy('');}
    })().catch(e=>{if(active){setError(e.message||'조감도를 준비하지 못했어요.');setBusy('');}});
    return()=>{active=false;};
  },[historyId,view]);
  const change=(layout,options={})=>{
    const current=draftRef.current;
    if(options.history!==false&&current){setUndo(values=>[...values.slice(-24),options.before||current]);setRedo([]);}
    put(layout);setError('');
  };
  const save=async()=>{
    if(busy||!draftRef.current)return;setBusy('저장하는 중');setError('');
    try{
      const layout=await editor.current?.prepareSave()||draftRef.current;
      const saved=await saveSpatialMyLayout(layout,{historyId,templateId:templateId.current});
      await onSaved(saved);
    }catch(e){setError(e.message||'저장하지 못했어요.');setBusy('');}
  };
  const close=async()=>{
    if(busy==='저장하는 중')return;
    if(!draftRef.current){onClose();return;}
    try{const layout=await editor.current?.prepareSave({waitForReady:false})||draftRef.current;if(undo.length||savedSignature.current&&spatialLayoutSignature(layout)!==savedSignature.current){setDiscard(true);return;}}catch{/* 닫는다 */}
    onClose();
  };
  const actions=<><button type="button" className="btn btn-ghost btn-icon" aria-label="실행 취소" disabled={!!busy||!undo.length} onClick={()=>{const previous=undo.at(-1),current=draftRef.current;setRedo(values=>[...values,current]);setUndo(values=>values.slice(0,-1));put(previous);}}><Icon name="undo" size={16}/></button>
    <button type="button" className="btn btn-ghost btn-icon" aria-label="다시 실행" disabled={!!busy||!redo.length} onClick={()=>{const next=redo.at(-1),current=draftRef.current;setUndo(values=>[...values,current]);setRedo(values=>values.slice(0,-1));put(next);}}><Icon name="redo" size={16}/></button></>;
  return <>
    <Modal title="조감도 레이아웃 만들기" size="sp-layout-modal" bodyStyle={{padding:0,gap:0}} onClose={close} headerActions={actions}
      footer={<><span className="note" role="status">{busy||'설명과 연결선을 다듬은 뒤 저장하면 이 장에 적용돼요.'}</span><span className="sp"/><button type="button" className="btn btn-sm" disabled={busy==='저장하는 중'} onClick={close}>닫기</button><button type="button" className="btn btn-primary btn-sm" disabled={!!busy||!draft} onClick={save}>저장하고 사용하기</button></>}>
      {error&&<div className="sp-error" role="alert">{error}</div>}
      {draft&&library?<SpatialLayoutEditor ref={editor} layout={draft} scene={draft.sourceScene} library={library} onChange={change} disabled={!!busy}/>
        :!error&&<div className="boot" role="status"><span className="spin"/>조감도를 준비하는 중…</div>}
    </Modal>
    {discard&&<Modal title="저장하지 않고 닫을까요?" size="narrow" onClose={()=>setDiscard(false)} footer={<><button type="button" className="btn" data-autofocus onClick={()=>setDiscard(false)}>계속 편집</button><button type="button" className="btn btn-danger" onClick={onClose}>저장하지 않고 닫기</button></>}><p>저장하지 않은 변경 내용이 있습니다. 닫으면 변경 내용이 사라집니다.</p></Modal>}
  </>;
}
