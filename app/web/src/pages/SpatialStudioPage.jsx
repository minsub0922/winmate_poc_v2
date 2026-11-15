import { browserStorage } from '../repositories/browser.js';
import {FeedbackPopup} from '../components/feedback-popup.jsx';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import { confirmDelete, Icon,toast } from '../components/common.jsx';
import { SpatialView } from '../components/spatial-view.jsx';
import { SpatialPrompt } from '../components/spatial-prompt.jsx';
import { BirdseyeHome } from '../components/birdseye-home.jsx';
import { SpatialObjectDetails } from '../components/spatial-object-details.jsx';
import { SpatialObjectDrawer } from '../components/spatial-object-drawer.jsx';
import {upgradeSpatialAssets} from '../domain/spatial/asset-upgrade.js';
import { addStudioSelection } from '../domain/spatial/studio-selection.js';
import { applySpatialEdit,mergeSpatialEditForm } from '../domain/spatial/edit.js';
import { applySpatialCommand } from '../domain/spatial/command-apply.js';
import { directionBasis,copyObject,rotateObject,nudgeObject } from '../domain/spatial/object-ops.js';
import { getBootstrap } from '../api/bootstrap.js';
import { useWorkContext } from '../services/customer-voice-context.js';
import { spatialAssetLabel } from '../domain/spatial/catalog.js';
import { emptyStudioForm,studioFormFromScene,createSceneFromForm,studioFormKey,validateStudioForm } from '../domain/spatial/studio-form.js';
import { validateScene,moveObject,sceneHash,focusScene,repairNaturalLayout,NATURAL_LAYOUT_VERSION } from '../domain/spatial/scene.js';
import { validSpatialLayout } from '../domain/spatial/layout.js';
import { loadSpatialLibrary,getSpatialHistory,saveSpatialForm,saveSpatialHistory,commandSpatial } from '../services/spatial.js';
import '../styles/spatial.css';

const inputKey=(form,view)=>JSON.stringify([form,view]);
const labels=true;


// popup: { onClose } — 팝업으로 열렸을 때(Storyboard 매칭 카드의 3D 조감도 · components/spatial-studio-popup.jsx): '뒤로 가기' 대신 '닫기' — 저장 대기 중인 변경을 저장하고 닫는다
export function SpatialPage({id,go,popup=null}){
  const assetLibraries=useRef(new Map());
  const account=getBootstrap().user?.username||'local-dev',backupPrefix='winmate.v2.spatial-document.'+account+'.';
  const [baseLibrary,setBaseLibrary]=useState(null),[library,setLibrary]=useState(null),[record,setRecord]=useState(null),[form,setForm]=useState(emptyStudioForm),[scene,setScene]=useState(null);
  const [loading,setLoading]=useState(!!id),[busy,setBusy]=useState(''),[autosaving,setAutosaving]=useState(false),[error,setError]=useState(''),[sceneDirty,setSceneDirty]=useState(false),[generatedKey,setGeneratedKey]=useState(null);
  const [view,setView]=useState('3d'),[focus,setFocus]=useState(''),[selected,setSelected]=useState(null),[generation,setGeneration]=useState(0),[undo,setUndo]=useState([]),[redo,setRedo]=useState([]),[notice,setNotice]=useState('');
  const [highlighted,setHighlighted]=useState([]);
  const [panel,setPanel]=useState(null);
  const [addingRoom,setAddingRoom]=useState('');
  const edited=useRef(false); // 이 화면에서 장면을 바꿨는가 — 바꾼 뒤에만 자동 저장한다
  const root=useRef(null),viewer=useRef(null),recordRef=useRef(null),queue=useRef(Promise.resolve()),saveTimer=useRef(null),savedInput=useRef(''),activeId=useRef(id),mounted=useRef(true),planner=useRef(null),promptInput=useRef(null),latestScene=useRef(null);
  activeId.current=id;latestScene.current=scene;
  useWorkContext('spatial',()=>({id,status:busy||record?.status||'browsing',state:{record,form,scene,view,focus,selected,highlighted,sceneDirty,autosaving,generatedKey,panel,error,camera:viewer.current?.cameraState?.()}}));
  const refreshHistory=()=>{}; // 히스토리 목록은 통합 조감도 목록(components/birdseye-home.jsx)이 읽는다
  useEffect(()=>{
    mounted.current=true;
    loadSpatialLibrary().then(lib=>{if(mounted.current){setBaseLibrary(lib);setLibrary(lib);}}).catch(e=>{if(mounted.current)setError(e.message);});
    return()=>{mounted.current=false;clearTimeout(saveTimer.current);planner.current?.abort();};
  },[]);

  const install=(document,lib,local=null)=>{
    let next=local?.scene??document.scene,inputs=local?.form||document.form||(next?studioFormFromScene(next):emptyStudioForm()),mode=local?.view||document.view||'3d',changed=false,message='',built=false;
    // 왼쪽 입력 카드가 없다 — 장면이 있으면 장면이 기준이고(폼은 장면에서 다시 뽑는다), 장면 없이 입력만 있던 예전 초안은 그 입력으로 장면을 한 번 만든다.
    if(next)inputs={...studioFormFromScene(next),title:typeof inputs.title==='string'?inputs.title:next.title,templateId:inputs.templateId||null};
    else if(inputs.rooms?.length){
      try{if(validateStudioForm(inputs,lib,{complete:true}).length)throw new Error('incomplete');next=createSceneFromForm(inputs,lib,{documentId:document.id});built=true;message='예전에 입력해 둔 공간으로 조감도를 만들었어요.';}
      // 만들 수 없는 예전 입력은 버리고 빈 스튜디오로 연다 — 보이지 않는 예전 입력이 첫 공간 추가를 막지 않게.
      catch{inputs={...inputs,rooms:[]};message='예전에 입력해 둔 공간 정보로는 조감도를 만들 수 없어 빈 스튜디오로 열었어요. 입력창에서 공간을 새로 추가해 주세요.';}
    }
    const original=next;
    const baseline=next?{...studioFormFromScene(next),...(document.form?.templateId?{templateId:document.form.templateId}:{})}:null;
    if(next?.presentation?.layout&&!validSpatialLayout(next.presentation.layout))throw new Error('저장된 레이아웃 데이터가 올바르지 않습니다.');
    if(next&&(next.layoutPolicy?.version||0)<NATURAL_LAYOUT_VERSION){try{const fixed=repairNaturalLayout(next,lib);next=fixed.scene;changed=!!fixed.report.corrected;if(changed)message=`기존 장면의 가구 ${fixed.report.corrected}개 방향·간격을 정리했어요. 실행 취소로 이전 배치를 볼 수 있어요.`;}catch{message='기존 장면의 가구 방향·간격을 확인해 주세요.';}}
    recordRef.current=document;setRecord(document);setLibrary(lib);setForm(inputs);setScene(next||null);setView(mode);setFocus(next?.presentation?.focusRoomId||'');setSelected(null);setUndo(changed?[{scene:original,form:inputs}]:[]);setRedo([]);setNotice(message);setSceneDirty(changed||built||!!local?.sceneDirty);setGeneratedKey(next?.formKey||document.generatedFormKey||(baseline?studioFormKey(baseline):null));setGeneration(n=>n+1);setPanel(null);
    // 장면에서 다시 뽑은 폼은 저장된 폼과 모양이 조금 다를 수 있다 — 그것만으로는 다시 저장하지 않는다(열기만 해도 히스토리 순서가 바뀌지 않게).
    savedInput.current=inputKey(next&&!built&&!local?inputs:(document.form||(document.scene?studioFormFromScene(document.scene):emptyStudioForm())),document.view||'3d');
    edited.current=false;
  };
  useEffect(()=>{
    if(!baseLibrary)return;clearTimeout(saveTimer.current);planner.current?.abort();let active=true;
    if(!id){recordRef.current=null;setRecord(null);setScene(null);setForm(emptyStudioForm());setLibrary(baseLibrary);setLoading(false);setPanel(null);setError('');return;}
    setLoading(true);setError('');
    getSpatialHistory(id).then(async document=>{
      let backup;try{const value=JSON.parse(browserStorage.getItem(backupPrefix+id)||'null');if(value?.pending&&value.baseRevision===document.revision)backup=value;}catch{}
      const desired=backup?.scene||document.scene,revision=desired?.assetRevision;
      const lib=revision&&revision!==baseLibrary.sourceHash?await loadSpatialLibrary(revision):baseLibrary;
      if(backup?.scene&&validateScene(backup.scene,lib).errors.length||backup?.form&&validateStudioForm(backup.form,lib).length)backup=null;
      if(active){install(document,lib,backup);root.current?.scrollTo({top:0});}
    }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;clearTimeout(saveTimer.current);};
  },[id,baseLibrary]);

  const enqueue=(operation,target=id)=>{
    const task=queue.current.catch(()=>{}).then(async()=>{
      const latest=recordRef.current;if(!latest||latest.id!==target)return null;
      const result=await operation(latest);
      if(mounted.current&&activeId.current===target){recordRef.current=result;setRecord(result);}return result;
    });queue.current=task.catch(()=>{});return task;
  };
  const persistForm=async(inputs=form,mode=view)=>{
    if(!recordRef.current||inputKey(inputs,mode)===savedInput.current)return;
    const key=inputKey(inputs,mode);setAutosaving(true);
    try{const result=await enqueue(r=>saveSpatialForm(inputs,mode,r,{sceneFormKey:generatedKey}));if(result)savedInput.current=key;}
    finally{if(mounted.current)setAutosaving(false);}
  };
  useEffect(()=>{
    if(!id||loading||!record||record.id!==id)return;
    clearTimeout(saveTimer.current);if(inputKey(form,view)===savedInput.current)return;
    saveTimer.current=setTimeout(()=>{void persistForm(form,view).catch(e=>{if(activeId.current===id)setError(e.message);});},700);
    return()=>clearTimeout(saveTimer.current);
  },[form,view,id,loading]);
  useEffect(()=>{
    if(!id||loading||record?.id!==id)return;
    try{browserStorage.setItem(backupPrefix+id,JSON.stringify({baseRevision:record.revision,form,scene,view,sceneDirty,pending:sceneDirty||inputKey(form,view)!==savedInput.current}));}catch{/* Server persistence remains available. */}
  },[id,loading,record,form,scene,view,sceneDirty]);

  const visibleFocus=focus&&highlighted.some(id=>scene?.objects.some(o=>o.id===id&&o.roomId!==focus))?'':focus;
  const current=useMemo(()=>scene&&visibleFocus?focusScene(scene,visibleFocus):scene,[scene,visibleFocus]);
  const assets=useMemo(()=>Object.fromEntries((library?.assets||[]).map(a=>[a.id,a])),[library]);
  const activeObject=scene?.objects.find(o=>o.id===selected);
  const placementRoomId=form.rooms.some(r=>r.id===addingRoom)?addingRoom:form.rooms.some(r=>r.id===focus)?focus:form.rooms[0]?.id||'';
  const canSelectObjects=!!id&&record?.id===id&&!loading;
  // 3D 공간 이름표를 누르면 그 공간을 명령 입력창에 태그한다.
  const selectInView=value=>{if(typeof value==='string'&&value.startsWith('room:')){promptInput.current?.mentionRoom(value.slice(5));return;}setSelected(value);};

  const persistScene=async(next,inputs=form)=>{
    const result=await enqueue(r=>saveSpatialHistory(next,view,r,{form:inputs}));
    if(result){savedInput.current=inputKey(inputs,view);setSceneDirty(false);void refreshHistory();}return result;
  };
  const savedScene=()=>{if(!scene)return null;const camera=!focus?viewer.current?.cameraState():null,title=form.title.trim()||scene.title;const next={...scene,...(camera?{camera}:{}),presentation:{...scene.presentation,focusRoomId:focus,...(scene.presentation?.layout?{layout:{...scene.presentation.layout,title}}:{})},title};next.contentHash=sceneHash(next);return next;};
  const backToList=async()=>{clearTimeout(saveTimer.current);try{await queue.current;if(sceneDirty&&scene)await persistScene(savedScene());else await persistForm();if(popup)popup.onClose();else go({name:'spatial'});}catch(e){setError(e.message);}};
  if(library)assetLibraries.current.set(library.sourceHash,library);
  if(baseLibrary)assetLibraries.current.set(baseLibrary.sourceHash,baseLibrary);
  const commitScene=next=>{
    const restoredLibrary=assetLibraries.current.get(next.assetRevision);if(restoredLibrary)setLibrary(restoredLibrary);
    if(scene){const inputs=mergeSpatialEditForm(form,scene,next,library);if(inputs!==form){setForm(inputs);if(generatedKey===studioFormKey(form)){const key=studioFormKey(inputs);next={...next,formKey:key};next.contentHash=sceneHash(next);setGeneratedKey(key);}}}
    setScene(next);setSceneDirty(true);setError('');
  };
  // 실행 취소 한 단계 = {scene, form}. 연속된 화살표 이동(merge)은 한 단계로 묶는다.
  const lastNudge=useRef({id:null,at:0});
  const remember=(merge=null)=>{
    edited.current=true;
    const stamp=Date.now(),joined=!!merge&&lastNudge.current.id===merge&&stamp-lastNudge.current.at<1200;
    lastNudge.current=merge?{id:merge,at:stamp}:{id:null,at:0};
    if(!joined)setUndo(a=>[...a.slice(-24),{scene,form}]);setRedo([]);
  };
  const mutate=(next,{merge=null}={})=>{remember(merge);commitScene(next);};
  // 명령 결과(장면 + 폼)를 한 번에 반영한다.
  const adopt=(next,inputs,lib=library)=>{
    remember();if(lib!==library)setLibrary(lib);
    if(next){next={...next,formKey:studioFormKey(inputs)};next.contentHash=sceneHash(next);}
    setForm(inputs);setScene(next);setSceneDirty(true);setError('');setGeneratedKey(next?studioFormKey(inputs):null);
    setSelected(value=>next?.objects.some(o=>o.id===value)?value:null);setFocus(value=>next?.rooms.some(r=>r.id===value)?value:'');
  };
  const restore=snapshot=>{
    const restoredLibrary=snapshot.scene&&assetLibraries.current.get(snapshot.scene.assetRevision);if(restoredLibrary)setLibrary(restoredLibrary);
    lastNudge.current={id:null,at:0};edited.current=true;
    setForm(snapshot.form);setScene(snapshot.scene);setSceneDirty(true);setError('');setGeneratedKey(snapshot.scene?studioFormKey(snapshot.form):null);
    setSelected(value=>snapshot.scene?.objects.some(o=>o.id===value)?value:null);setFocus(value=>snapshot.scene?.rooms.some(r=>r.id===value)?value:'');
  };
  const updateAssets=()=>{try{mutate(upgradeSpatialAssets(scene,baseLibrary,library));setSelected(null);toast('실측 크기와 제품 이미지를 업데이트했어요.');}catch(e){setError(e.message);}};
  const onMove=(oid,patch)=>{try{mutate(moveObject(scene,oid,patch,library));}catch(e){setError(e.message);}};
  const onViewMove=(oid,patch)=>{const r=focus&&scene.rooms.find(r=>r.id===focus);onMove(oid,r?{...patch,x:patch.x+r.x,z:patch.z+r.z}:patch);};
  const remove=oid=>{try{mutate(applySpatialEdit(scene,{operations:[{type:'remove',objectId:oid}]},library));setSelected(null);}catch(e){setError(e.message);}};
  // 직접 조작 — 선택한 오브젝트 회전 · 복제 · 한 걸음 이동(말풍선 버튼 · 단축키)
  const rotate=(oid,angle)=>{try{mutate(rotateObject(scene,oid,{angle},library));}catch(e){setError(e.message);}};
  const duplicate=oid=>{try{const result=copyObject(scene,oid,null,library);mutate(result.scene);setSelected(result.objectId);}catch(e){setError(e.message);}};
  const nudge=(oid,delta)=>{try{mutate(nudgeObject(scene,oid,delta,library).scene,{merge:oid});}catch{setNotice('그 방향으로는 더 옮길 자리가 없어요.');}};
  const viewBasis=()=>directionBasis(view,view==='3d'?viewer.current?.cameraState?.():null);
  // 명령 — 문장 + @ 태그를 서버가 조작 목록으로 바꾸고(app/api/spatial_command.py), 장면 · 폼 사본에 모두 적용된 뒤에만 한 번에 반영한다.
  const command=async(prompt,mentions)=>{
    if(busy||!recordRef.current)return false;
    const base=scene,controller=new AbortController();planner.current=controller;setBusy('명령을 해석하는 중');setError('');setNotice('');
    try{
      // 예전 자산 버전으로 저장된 장면은 지금 카탈로그로 올린 뒤 명령한다(새 카탈로그 자산을 넣을 수 있게).
      const upgraded=!!base&&library.sourceHash!==baseLibrary.sourceHash,working=upgraded?upgradeSpatialAssets(base,baseLibrary,library):base,lib=upgraded?baseLibrary:library;
      const names=Object.fromEntries(lib.assets.map(a=>[a.id,a]));
      let feedback;
      for(let attempt=0;attempt<2;attempt++){
        const result=await commandSpatial({prompt,mentions,scene:working,industry:form.industry||undefined,roomId:working&&focus?focus:undefined,view,feedback},controller.signal);
        if(controller.signal.aborted)return false;
        if(latestScene.current!==base)throw new Error('명령을 해석하는 동안 장면이 바뀌었어요. 지금 배치에서 다시 요청해 주세요.');
        const operations=result.plan.operations;
        if(!operations.length){setNotice(result.plan.explanation);return false;}
        let applied;
        try{applied=applySpatialCommand({scene:working,form},result.plan,lib,{basis:viewBasis(),documentId:id});}
        catch(error){if(attempt||!working)throw error;feedback=error.message;setBusy('배치가 겹치지 않게 다시 해석하는 중');continue;}
        if(working&&!applied.scene)throw new Error('마지막 공간은 지울 수 없어요. 조감도를 없애려면 목록에서 삭제해 주세요.');
        const gone=[...applied.removedRooms.map(roomId=>working.rooms.find(r=>r.id===roomId)?.name+' (공간과 그 안의 오브젝트)'),...applied.removed.map(oid=>{const o=working.objects.find(o=>o.id===oid);return o?spatialAssetLabel(names[o.assetId]):'오브젝트';})];
        if(gone.length){
          const accepted=await confirmDelete({title:'삭제할까요?',message:'명령에 삭제가 들어 있어요.',items:gone});
          if(!accepted||controller.signal.aborted)return false;
          if(latestScene.current!==base)throw new Error('장면이 바뀌었어요. 다시 요청해 주세요.');
        }
        adopt(applied.scene,applied.form,lib);setNotice(applied.lines.join(' '));return true;
      }
    }catch(e){if(!controller.signal.aborted)setError(e.message);return false;}
    finally{if(mounted.current){setBusy('');planner.current=null;}}
  };
  // 명령 · 직접 조작 뒤 잠시 후 장면을 저장한다 — 나갈 때까지 기다리면 탭을 닫거나 다른 화면으로 가면 사라지고,
  // 그동안 건물 고르기 · Storyboard가 예전 장면을 읽는다. 열기만 한 기록은 저장하지 않는다(edited).
  useEffect(()=>{
    if(!id||loading||!sceneDirty||!scene||busy||record?.id!==id||!edited.current)return;
    const timer=setTimeout(()=>{void persistScene(savedScene()).catch(e=>{if(activeId.current===id)setError(e.message);});},1500);
    return()=>clearTimeout(timer);
  },[scene,sceneDirty,id,loading,busy]);
  // 단축키 — 오브젝트를 고른 상태에서만: R 90° 회전 · Ctrl/⌘+D 복제 · Delete 삭제 · 화살표 5cm(Shift 50cm) 이동(화면 기준).
  // 글자를 입력하는 중이거나 다른 창이 위에 떠 있으면 동작하지 않고, 처리한 키는 뒤에 깔린 화면으로 넘기지 않는다.
  const shortcut=useRef(null),lastArrow=useRef(0);
  shortcut.current=event=>{
    if(!canSelectObjects||busy||!selected||!scene?.objects.some(o=>o.id===selected))return;
    if(event.defaultPrevented||event.isComposing||event.keyCode===229)return;
    const target=event.target instanceof Element?event.target:null;
    if(target&&(target.isContentEditable||target.closest('input,textarea,select,.sp-prompt,.sp-mention-menu,.delete-confirmation')))return;
    const top=[...document.querySelectorAll('.mback')].at(-1);if(top&&!top.contains(root.current))return;
    const basis=viewBasis(),step=event.shiftKey?.5:.05,plain=!event.metaKey&&!event.ctrlKey&&!event.altKey;
    const arrows={ArrowRight:[basis.right[0],basis.right[1]],ArrowLeft:[-basis.right[0],-basis.right[1]],ArrowDown:[basis.forward[0],basis.forward[1]],ArrowUp:[-basis.forward[0],-basis.forward[1]]};
    if(arrows[event.key]&&plain){
      const now=Date.now();
      if(!event.repeat||now-lastArrow.current>=90){lastArrow.current=now;nudge(selected,[arrows[event.key][0]*step||0,arrows[event.key][1]*step||0]);}
    }
    else if(event.code==='KeyR'&&plain)rotate(selected,90);
    else if(event.code==='KeyD'&&(event.metaKey||event.ctrlKey)&&!event.altKey)duplicate(selected);
    else if((event.key==='Delete'||event.key==='Backspace')&&plain)remove(selected);
    else return;
    event.preventDefault();event.stopPropagation();
  };
  useEffect(()=>{const key=event=>shortcut.current?.(event);document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);},[]);
  const addSelectedAssets=async(assetIds,roomId)=>{
    if(!canSelectObjects||busy)throw new Error('현재 스튜디오에서만 오브젝트를 추가할 수 있어요.');
    clearTimeout(saveTimer.current);setBusy('선택한 오브젝트를 추가하는 중');
    try{
      const targetScene=scene&&library.sourceHash!==baseLibrary.sourceHash?upgradeSpatialAssets(scene,baseLibrary,library):scene;
      const result=addStudioSelection(form,targetScene,baseLibrary,assetIds,roomId,{supportId:selected}),changed=result.scene!==scene,synced=scene&&generatedKey===studioFormKey(form),key=studioFormKey(result.form);
      let next=result.scene;
      if(next){const camera=!focus?viewer.current?.cameraState():null;next={...next,...(camera?{camera}:{}),...(changed&&synced?{formKey:key}:{})};next.contentHash=sceneHash(next);}
      const saved=await enqueue(r=>next?saveSpatialHistory(next,view,r,{form:result.form}):saveSpatialForm(result.form,view,r,{sceneFormKey:generatedKey}));
      if(!saved)throw new Error('현재 스튜디오를 다시 열어 주세요.');
      if(changed){setUndo(values=>[...values.slice(-24),{scene,form}]);setRedo([]);}
      setLibrary(baseLibrary);setForm(result.form);setScene(next);setSceneDirty(false);if(changed&&synced)setGeneratedKey(key);savedInput.current=inputKey(result.form,view);setError('');void refreshHistory();toast(`선택한 ${assetIds.length}개를 공간에 추가했어요`);
    }finally{setBusy('');}
  };
  const historyActions=<><button className="btn btn-ghost btn-icon" aria-label="실행 취소" disabled={!!busy||!undo.length} onClick={()=>{setRedo(a=>[...a,{scene,form}]);restore(undo.at(-1));setUndo(a=>a.slice(0,-1));}}><Icon name="undo" size={16}/></button><button className="btn btn-ghost btn-icon" aria-label="다시 실행" disabled={!!busy||!redo.length} onClick={()=>{setUndo(a=>[...a,{scene,form}]);restore(redo.at(-1));setRedo(a=>a.slice(0,-1));}}><Icon name="redo" size={16}/></button></>;


  // 목록(id 없음)은 통합 조감도 목록이다 — 공간 · 건물 히스토리와 시작 팝업(components/birdseye-home.jsx).
  if(!id)return <BirdseyeHome go={go}/>;
  return <div className={'sp-page'+(id?' sp-studio-page':'')} ref={root}><div className="sp-page-in">
    <div className="sp-topbar"><header className={'tl-head sp-header'+(id?' sp-studio-header':'')}>
      {id?<div className="sp-header-heading"><button type="button" className="sp-back-button" title={popup?"저장하고 조감도 스튜디오 닫기":"조감도 목록으로 돌아가기"} onClick={backToList} disabled={!!busy}><Icon name={popup?"x":"arrowL"} size={20}/><span>{popup?"닫기":"뒤로 가기"}</span></button><span className="sp-beta">BETA</span></div>:<div className="tl-title"><span className="eyebrow">WINMATE · 공간 제안</span><h1>공간 조감도<span className="sp-beta">BETA</span></h1><p>새 조감도를 만들거나 저장한 공간을 이어서 편집하세요.</p></div>}
      <div className="sp-header-actions"><button type="button" className="btn btn-primary sp-object-trigger" disabled={!library||!!busy} aria-haspopup="dialog" onClick={()=>setPanel('objects')}><Icon name="product" size={19}/><span>제품 · 가구 오브젝트</span></button></div>
    </header></div>
    {panel==='objects'&&baseLibrary&&<SpatialObjectDrawer library={baseLibrary} canSelect={canSelectObjects} rooms={form.rooms} roomId={placementRoomId} onRoomChange={setAddingRoom} onAdd={addSelectedAssets} busy={!!busy} onClose={()=>setPanel(null)}/>}
    <FeedbackPopup message={error}/><FeedbackPopup message={notice} kind="info"/>
    {!baseLibrary&&!error&&<div className="boot" role="status" aria-live="polite"><span className="spin"/>공간 오브젝트를 준비하는 중…</div>}
    <FeedbackPopup message={busy} kind="progress" actionLabel={planner.current?"작업 취소":undefined} onAction={()=>planner.current?.abort()}/>
    {baseLibrary&&id&&(loading?<div className="boot"><span className="spin"/>조감도를 불러오는 중…</div>:record?.id===id&&<div className="sp-studio sp-sim-studio" data-spatial-id={id}>
      <section className="sp-workspace" aria-label="조감도 편집"><div className="sp-canvas-toolbar"><div className="sp-view-switch">{['2d','3d'].map(mode=><button key={mode} aria-pressed={view===mode} onClick={()=>setView(mode)}>{mode.toUpperCase()} {mode==='2d'?'평면도':'조감도'}</button>)}</div><div className="sp-canvas-actions">{historyActions}</div></div>
        <div className="sp-canvas-title"><div className="sp-canvas-spec"><input aria-label="조감도 이름" value={form.title} maxLength={150} placeholder="조감도 이름 (선택)" onChange={e=>setForm({...form,title:e.target.value})}/><span>{current?`${current.rooms.length}개 공간 · ${current.objects.filter(o=>assets[o.assetId]?.productId).length}개 제품 · ${(current.width*current.depth).toFixed(0)}㎡`:'아직 생성한 조감도가 없어요'}</span></div></div>
        {scene?<>
          {library.sourceHash!==baseLibrary.sourceHash&&<div className="sp-assets-update"><span>이전에 저장된 제품 형상을 사용하고 있어요.</span><button type="button" className="btn btn-sm" disabled={!!busy} onClick={updateAssets}>제품 형상 업데이트</button></div>}
          <SpatialView key={generation+'-'+visibleFocus} ref={viewer} scene={current} library={library} view={view} selected={selected} highlighted={highlighted} onSelect={selectInView} onMove={onViewMove} labels={labels} disabled={!!busy} selectionContent={activeObject&&<SpatialObjectDetails object={activeObject} scene={scene} library={library} onRemove={remove} onRotate={rotate} onDuplicate={duplicate} onMention={oid=>promptInput.current?.mention(oid)} onClose={()=>setSelected(null)} disabled={!!busy}/>}/>
          <div className="sp-room-strip"><button aria-pressed={!focus} onClick={()=>{setFocus('');setSelected(null);}}>전체 맵</button>{scene.rooms.map((r,index)=><button key={r.id} aria-pressed={focus===r.id} onClick={()=>{setFocus(r.id);setSelected(null);}}><b>{String(index+1).padStart(2,'0')}</b>{r.name}</button>)}</div>
        </>:<div className="sp-blank-canvas" role="status" aria-label="빈 조감도"><Icon name="plus" size={24}/><h2>아직 배치된 공간이 없어요</h2>
          {form.industry?<p>아래 입력창에 <strong>@회의실 추가해</strong>처럼 입력해 첫 공간을 만들어 보세요.</p>
            :<label className="sp-blank-industry">먼저 업종을 골라 주세요<select aria-label="업종" value="" disabled={!!busy} onChange={e=>setForm({...form,industry:e.target.value})}><option value="" disabled>업종 선택</option>{baseLibrary.industries.map(i=><option key={i.code} value={i.code}>{i.name}</option>)}</select></label>}
        </div>}
        <SpatialPrompt ref={promptInput} scene={scene} library={scene?library:baseLibrary} roomId={focus} busy={busy||(!scene&&!form.industry?'업종을 먼저 골라 주세요':'')} onMention={()=>setSelected(null)} onHighlight={setHighlighted} onSubmit={command}/>
      </section>
    </div>)}
  </div></div>;
}
