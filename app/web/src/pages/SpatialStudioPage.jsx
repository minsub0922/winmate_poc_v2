import { browserStorage } from '../repositories/browser.js';
import {FeedbackPopup} from '../components/feedback-popup.jsx';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import { confirmDelete, Icon,Modal,toast } from '../components/common.jsx';
import { SpatialView } from '../components/spatial-view.jsx';
import { SpatialPrompt } from '../components/spatial-prompt.jsx';
import { BirdseyeHome } from '../components/birdseye-home.jsx';
import { SpatialObjectDetails } from '../components/spatial-object-details.jsx';
import { SpatialObjectDrawer } from '../components/spatial-object-drawer.jsx';
import {upgradeSpatialAssets} from '../domain/spatial/asset-upgrade.js';
import { applySpatialEdit,mergeSpatialEditForm } from '../domain/spatial/edit.js';
import { directionBasis,copyObject,rotateObject,nudgeObject } from '../domain/spatial/object-ops.js';
import { getBootstrap } from '../api/bootstrap.js';
import { useWorkContext } from '../services/customer-voice-context.js';
import { spatialAssetLabel } from '../domain/spatial/catalog.js';
import { emptyStudioForm,studioFormFromScene,studioFormKey,validateStudioForm } from '../domain/spatial/studio-form.js';
import { validateScene,moveObject,sceneHash,focusScene,NATURAL_LAYOUT_VERSION } from '../domain/spatial/scene.js';
import { validSpatialLayout } from '../domain/spatial/layout.js';
import { STYLES } from '../domain/spatial/geometry.js';
import { SPACE_TYPES } from '../domain/spatial/studio-form.js';
import { roomStyle } from '../domain/spatial/room-ops.js';
import { loadSpatialLibrary,getSpatialHistory,saveSpatialForm,saveSpatialHistory,commandSpatial,computeSpatial } from '../services/spatial.js';
import '../styles/spatial.css';
import '../styles/birdseye-studio.css';

const inputKey=(form,view)=>JSON.stringify([form,view]);
const labels=true;
// 오른쪽 오브젝트 목록의 열 수(1~3) — 이 브라우저에만 저장한다(계정 동기화 대상 아님).
const PANEL_COLUMNS_KEY='winmate.v2.spatial-studio.object-columns';
const readPanelColumns=()=>{try{const n=Number(window.localStorage.getItem(PANEL_COLUMNS_KEY));return n>=1&&n<=3?Math.round(n):2;}catch{return 2;}};
const savePanelColumns=n=>{try{window.localStorage.setItem(PANEL_COLUMNS_KEY,String(n));}catch{/* 저장소를 못 쓰면 이번 화면에서만 유지 */}};
// 열 하나 폭 · 열 간격 · 좌우 여백(px) — birdseye-studio.css의 .sp-objects-panel 폭 계산과 같아야 한다.
const PANEL_COLUMN=150,PANEL_GAP=8,PANEL_PAD=26;


// popup: { onClose } — 팝업으로 열렸을 때(Storyboard 매칭 카드의 3D 조감도 · components/spatial-studio-popup.jsx): '뒤로 가기' 대신 '닫기' — 저장 대기 중인 변경을 저장하고 닫는다
export function SpatialPage({id,go,popup=null,managed=null}){
  const assetLibraries=useRef(new Map());
  const account=getBootstrap().user?.username||'local-dev',backupPrefix='winmate.v2.spatial-document.'+account+'.';
  const [baseLibrary,setBaseLibrary]=useState(null),[library,setLibrary]=useState(null),[record,setRecord]=useState(null),[form,setForm]=useState(emptyStudioForm),[scene,setScene]=useState(null);
  const [loading,setLoading]=useState(!!id),[busy,setBusy]=useState(''),[autosaving,setAutosaving]=useState(false),[error,setError]=useState(''),[sceneDirty,setSceneDirty]=useState(false),[generatedKey,setGeneratedKey]=useState(null);
  const [view,setView]=useState('3d'),[focus,setFocus]=useState(''),[selected,setSelected]=useState(null),[generation,setGeneration]=useState(0),[undo,setUndo]=useState([]),[redo,setRedo]=useState([]),[notice,setNotice]=useState('');
  const [highlighted,setHighlighted]=useState([]);
  const [confirmSave,setConfirmSave]=useState(false);
  const [panel,setPanel]=useState(null);
  const [addingRoom,setAddingRoom]=useState('');
  const [pointerMode,setPointerMode]=useState('rotate'),[roomMenu,setRoomMenu]=useState(null),[styleChange,setStyleChange]=useState(null),[addMenu,setAddMenu]=useState(false),[panelColumns,setPanelColumns]=useState(readPanelColumns);
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

  const install=async(document,lib,local=null,active=()=>true)=>{
    let next=local?.scene??document.scene,inputs=local?.form||document.form||(next?studioFormFromScene(next):emptyStudioForm()),mode=local?.view||document.view||'3d',changed=false,message='',built=false;
    // 왼쪽 입력 카드가 없다 — 장면이 있으면 장면이 기준이고(폼은 장면에서 다시 뽑는다), 장면 없이 입력만 있던 예전 초안은 그 입력으로 장면을 한 번 만든다.
    if(next)inputs={...studioFormFromScene(next),title:typeof inputs.title==='string'?inputs.title:next.title,templateId:inputs.templateId||null};
    else if(inputs.rooms?.length){
      // 불완전한 예전 입력만 비운다. 서버 연결 실패 때문에 정상 초안을 지우지 않는다.
      if(validateStudioForm(inputs,lib,{complete:true}).length){inputs={...inputs,rooms:[]};message='예전에 입력해 둔 공간 정보로는 조감도를 만들 수 없어 빈 스튜디오로 열었어요. 입력창에서 공간을 새로 추가해 주세요.';}
      else{next=(await computeSpatial({kind:'form',form:inputs,documentId:document.id},lib)).scene;built=true;message='예전에 입력해 둔 공간으로 조감도를 만들었어요.';}
    }
    const original=next;
    const baseline=next?{...studioFormFromScene(next),...(document.form?.templateId?{templateId:document.form.templateId}:{})}:null;
    if(next?.presentation?.layout&&!validSpatialLayout(next.presentation.layout))throw new Error('저장된 레이아웃 데이터가 올바르지 않습니다.');
    if(next&&(next.layoutPolicy?.version||0)<NATURAL_LAYOUT_VERSION){try{const fixed=await computeSpatial({kind:'repair',scene:next},lib);next=fixed.scene;changed=!!fixed.report.corrected;if(changed)message=`기존 장면의 가구 ${fixed.report.corrected}개 방향·간격을 정리했어요. 실행 취소로 이전 배치를 볼 수 있어요.`;}catch{message='기존 장면의 가구 방향·간격을 확인해 주세요.';}}
    if(!active())return;
    recordRef.current=document;setRecord(document);setLibrary(lib);setForm(inputs);setScene(next||null);setView(mode);setFocus('');setSelected(null);setUndo(changed?[{scene:original,form:inputs}]:[]);setRedo([]);setNotice(message);setSceneDirty(changed||built||!!local?.sceneDirty);setGeneratedKey(next?.formKey||document.generatedFormKey||(baseline?studioFormKey(baseline):null));setGeneration(n=>n+1);setPanel(null);
    // 장면에서 다시 뽑은 폼은 저장된 폼과 모양이 조금 다를 수 있다 — 그것만으로는 다시 저장하지 않는다(열기만 해도 히스토리 순서가 바뀌지 않게).
    savedInput.current=inputKey(next&&!built&&!local?inputs:(document.form||(document.scene?studioFormFromScene(document.scene):emptyStudioForm())),document.view||'3d');
    edited.current=false;
  };
  useEffect(()=>{
    if(!baseLibrary)return;clearTimeout(saveTimer.current);planner.current?.abort();let active=true;
    if(!id){recordRef.current=null;setRecord(null);setScene(null);setForm(emptyStudioForm());setLibrary(baseLibrary);setLoading(false);setPanel(null);setError('');return;}
    setLoading(true);setError('');
    (managed?managed.load(id):getSpatialHistory(id)).then(async document=>{
      let backup;if(!managed)try{const value=JSON.parse(browserStorage.getItem(backupPrefix+id)||'null');if(value?.pending&&value.baseRevision===document.revision)backup=value;}catch{}
      const desired=backup?.scene||document.scene,revision=desired?.assetRevision;
      const lib=revision&&revision!==baseLibrary.sourceHash?await loadSpatialLibrary(revision):baseLibrary;
      if(backup?.scene&&validateScene(backup.scene,lib).errors.length||backup?.form&&validateStudioForm(backup.form,lib).length)backup=null;
      if(active){await install(document,lib,backup,()=>active);if(active)root.current?.scrollTo({top:0});}
    }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;clearTimeout(saveTimer.current);};
  },[id,baseLibrary,managed]);

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
    if(managed||!id||loading||!record||record.id!==id)return;
    clearTimeout(saveTimer.current);if(inputKey(form,view)===savedInput.current)return;
    saveTimer.current=setTimeout(()=>{void persistForm(form,view).catch(e=>{if(activeId.current===id)setError(e.message);});},700);
    return()=>clearTimeout(saveTimer.current);
  },[form,view,id,loading]);
  useEffect(()=>{
    if(managed||!id||loading||record?.id!==id)return;
    try{browserStorage.setItem(backupPrefix+id,JSON.stringify({baseRevision:record.revision,form,scene,view,sceneDirty,pending:sceneDirty||inputKey(form,view)!==savedInput.current}));}catch{/* Server persistence remains available. */}
  },[id,loading,record,form,scene,view,sceneDirty]);

  const visibleFocus=focus&&highlighted.some(id=>scene?.objects.some(o=>o.id===id&&o.roomId!==focus))?'':focus;
  const current=useMemo(()=>scene&&visibleFocus?focusScene(scene,visibleFocus):scene,[scene,visibleFocus]);
  const assets=useMemo(()=>Object.fromEntries((library?.assets||[]).map(a=>[a.id,a])),[library]);
  const activeObject=scene?.objects.find(o=>o.id===selected);
  const placementRoomId=form.rooms.some(r=>r.id===addingRoom)?addingRoom:form.rooms.some(r=>r.id===focus)?focus:form.rooms[0]?.id||'';
  const canSelectObjects=!!id&&record?.id===id&&!loading;
  const selectInView=value=>{setRoomMenu(null);setSelected(value);};

  const persistScene=async(next,inputs=form)=>{
    const result=await enqueue(r=>saveSpatialHistory(next,view,r,{form:inputs}));
    if(result){savedInput.current=inputKey(inputs,view);setSceneDirty(false);void refreshHistory();}return result;
  };
  const savedScene=()=>{if(!scene)return null;const camera=!focus?viewer.current?.cameraState():null,title=form.title.trim()||scene.title;const next={...scene,...(camera?{camera}:{}),presentation:{...scene.presentation,focusRoomId:focus,...(scene.presentation?.layout?{layout:{...scene.presentation.layout,title}}:{})},title};next.contentHash=sceneHash(next);return next;};
  const templateDirty=!!managed&&record?.id===id&&(sceneDirty||form.title.trim()!==record.scene.title);
  useEffect(()=>{managed?.dirty(id,templateDirty);},[managed,id,templateDirty]);
  const publishTemplate=async()=>{
    setConfirmSave(false);setBusy('조감도를 저장하는 중');setError('');
    try{
      const next={...savedScene(),templateId:id};next.contentHash=sceneHash(next);
      const result=await managed.save(id,next,record.revision);
      recordRef.current=result;setRecord(result);setScene(result.scene);setForm({...form,title:result.scene.title});
      setSceneDirty(false);setNotice('조감도를 저장했어요.');
    }catch(e){setError(e.message);}finally{setBusy('');}
  };
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
        try{applied=await computeSpatial({kind:'command',state:{scene:working,form},plan:result.plan,basis:viewBasis(),documentId:id},lib,{signal:controller.signal});}
        catch(error){if(attempt||!working)throw error;feedback=error.message;setBusy('배치가 겹치지 않게 다시 해석하는 중');continue;}
        if(controller.signal.aborted||activeId.current!==id)return false;
        if(latestScene.current!==base)throw new Error('명령을 적용하는 동안 장면이 바뀌었어요. 다시 요청해 주세요.');
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
    if(managed||!id||loading||!sceneDirty||!scene||busy||record?.id!==id||!edited.current)return;
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
      const result=await computeSpatial({kind:'selection',state:{form,scene:targetScene},assetIds,roomId,supportId:selected},baseLibrary);
      if(!mounted.current||activeId.current!==id||latestScene.current!==scene)throw new Error('장면이 바뀌었어요. 다시 추가해 주세요.');
      const changed=!!result.scene,synced=scene&&generatedKey===studioFormKey(form),key=studioFormKey(result.form);
      let next=result.scene;
      if(next){const camera=!focus?viewer.current?.cameraState():null;next={...next,...(camera?{camera}:{}),...(changed&&synced?{formKey:key}:{})};next.contentHash=sceneHash(next);}
      if(managed){adopt(next,result.form,baseLibrary);return;}
      const saved=await enqueue(r=>next?saveSpatialHistory(next,view,r,{form:result.form}):saveSpatialForm(result.form,view,r,{sceneFormKey:generatedKey}));
      if(!saved)throw new Error('현재 스튜디오를 다시 열어 주세요.');
      if(changed){setUndo(values=>[...values.slice(-24),{scene,form}]);setRedo([]);}
      setLibrary(baseLibrary);setForm(result.form);setScene(next);setSceneDirty(false);if(changed&&synced)setGeneratedKey(key);savedInput.current=inputKey(result.form,view);setError('');void refreshHistory();toast(`선택한 ${assetIds.length}개를 공간에 추가했어요`);
    }finally{setBusy('');}
  };
  // 공간 조작(이름표 메뉴 · 끌어 옮기기 · 공간 추가) — 명령과 같이 예전 자산 버전 장면은 지금 카탈로그로 올린 뒤 바꾸고, 실행 취소 한 단계로 남긴다.
  const editRooms=async(operation,message)=>{
    if(busy||!recordRef.current)return;
    setBusy('공간 배치를 정리하는 중');
    try{
      const upgraded=!!scene&&library.sourceHash!==baseLibrary.sourceHash,working=upgraded?upgradeSpatialAssets(scene,baseLibrary,library):scene,lib=upgraded?baseLibrary:library;
      const result=await computeSpatial({kind:'room',state:{scene:working,form},...operation,documentId:id},lib);
      if(!mounted.current||activeId.current!==id)return;
      if(latestScene.current!==scene)throw new Error('공간을 정리하는 동안 장면이 바뀌었어요. 다시 요청해 주세요.');
      adopt(result.scene,result.form,lib);setRoomMenu(null);
      const relaid=(result.relaid||[]).map(roomId=>result.scene?.rooms.find(r=>r.id===roomId)?.name).filter(Boolean);
      setNotice([message(result),relaid.length?`${relaid.join(' · ')} 공간은 배치를 다시 정리했어요.`:''].filter(Boolean).join(' '));
    }catch(e){setError(e.message);}finally{if(mounted.current)setBusy('');}
  };
  const roomName=roomId=>scene?.rooms.find(r=>r.id===roomId)?.name||'공간';
  const openRoomMenu=roomId=>{if(busy)return;setSelected(null);setAddMenu(false);setRoomMenu(menu=>menu?.roomId===roomId?null:{roomId,step:'root'});};
  const dropRoom=(roomId,targetId)=>editRooms({action:'swap',roomId,targetId},()=>`${roomName(roomId)} · ${roomName(targetId)} 공간의 자리를 바꿨어요.`);
  // 공간 이름표를 빈 칸에 놓으면 그 자리로 옮긴다 — 배치(몇 줄 · 몇 칸) 자체가 바뀐다
  const placeRoom=(roomId,cell)=>editRooms({action:'move',roomId,cell},()=>`${roomName(roomId)} 공간을 옮겼어요.`);
  const confirmRoomStyle=async()=>{
    const {roomId,style}=styleChange;setStyleChange(null);
    editRooms({action:'style',roomId,style},()=>`${roomName(roomId)} 공간 스타일을 ${STYLES[style].name}(으)로 바꿨어요.`);
  };
  const deleteRoom=async roomId=>{
    const room=scene?.rooms.find(r=>r.id===roomId);if(!room||busy)return;setRoomMenu(null);
    if(scene.rooms.length<2){setNotice('마지막 공간은 지울 수 없어요. 조감도를 없애려면 목록에서 삭제해 주세요.');return;}
    const count=scene.objects.filter(o=>o.roomId===roomId).length;
    if(!await confirmDelete({title:'공간을 삭제할까요?',message:`${room.name} 공간과 그 안의 오브젝트 ${count}개를 삭제합니다. 실행 취소로 되돌릴 수 있어요.`,confirmLabel:'공간 삭제'}))return;
    editRooms({action:'remove',roomId},()=>`${room.name} 공간을 삭제했어요.`);
  };
  const addRoomOfKind=kind=>{setAddMenu(false);editRooms({action:'add',room:{kind}},result=>`${result.scene.rooms.find(r=>r.id===result.roomId)?.name||'새'} 공간을 추가했어요.`);};
  // 이름표 메뉴 · 공간 추가 메뉴는 바깥을 누르거나 Esc로 닫는다.
  useEffect(()=>{
    if(!roomMenu&&!addMenu)return;
    const outside=event=>{if(!(event.target instanceof Element)||!event.target.closest('.sp-room-menu,[data-room-label],.be-add-room'))setRoomMenu(null),setAddMenu(false);};
    const escape=event=>{if(event.key==='Escape'&&!document.querySelector('.delete-confirmation,.be-style-confirm')){setRoomMenu(null);setAddMenu(false);}};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);};
  },[roomMenu,addMenu]);
  useEffect(()=>{if(roomMenu&&!scene?.rooms.some(r=>r.id===roomMenu.roomId))setRoomMenu(null);},[scene,roomMenu]);
  // 시뮬레이션과 오브젝트 목록 사이 손잡이 — 끌면 목록이 1~3열 단위로 줄고 는다.
  const studioRef=useRef(null);
  const columnsFor=width=>Math.max(1,Math.min(3,Math.round((width-PANEL_PAD+PANEL_GAP)/(PANEL_COLUMN+PANEL_GAP))));
  const setColumns=n=>{setPanelColumns(n);savePanelColumns(n);};
  const resizeStart=event=>{
    if(event.button!==0)return;event.preventDefault();const handle=event.currentTarget;handle.setPointerCapture(event.pointerId);
    const move=e=>{const right=studioRef.current.getBoundingClientRect().right;setPanelColumns(columnsFor(right-e.clientX));};
    const end=e=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);setPanelColumns(n=>{savePanelColumns(n);return n;});};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  };
  const resizeKey=event=>{const delta={ArrowLeft:1,ArrowRight:-1}[event.key];if(!delta)return;event.preventDefault();setColumns(Math.max(1,Math.min(3,panelColumns+delta)));};
  const historyActions=<><button type="button" className="be-icon-tab" aria-label="실행 취소" title="실행 취소" disabled={!!busy||!undo.length} onClick={()=>{setRedo(a=>[...a,{scene,form}]);restore(undo.at(-1));setUndo(a=>a.slice(0,-1));}}><Icon name="undo" size={15}/></button><button type="button" className="be-icon-tab" aria-label="다시 실행" title="다시 실행" disabled={!!busy||!redo.length} onClick={()=>{setUndo(a=>[...a,{scene,form}]);restore(redo.at(-1));setRedo(a=>a.slice(0,-1));}}><Icon name="redo" size={15}/></button></>;
  const menuRoom=roomMenu&&scene?.rooms.find(r=>r.id===roomMenu.roomId);
  const roomMenuContent=menuRoom&&(roomMenu.step==='style'
    ?<><div className="sp-room-menu-heading"><button type="button" className="be-icon-tab" aria-label="뒤로" onClick={()=>setRoomMenu({...roomMenu,step:'root'})}><Icon name="arrowL" size={14}/></button><strong>{menuRoom.name} 스타일</strong></div>
      {Object.entries(STYLES).map(([key,style])=>{const current=roomStyle(scene,menuRoom)===key;return <button key={key} type="button" role="menuitemradio" aria-checked={current} disabled={!!busy||current} onClick={()=>setStyleChange({roomId:menuRoom.id,style:key})}><span className="be-style-swatch" aria-hidden="true" style={{background:`linear-gradient(135deg,${style.floor} 0 50%,${style.wood} 50% 75%,${style.fabric} 75%)`}}/>{style.name}{current&&<Icon name="check" size={13}/>}</button>;})}</>
    :<><div className="sp-room-menu-heading"><strong>{menuRoom.name}</strong><small>{STYLES[roomStyle(scene,menuRoom)].name}</small></div>
      <button type="button" role="menuitem" disabled={!!busy} onClick={()=>setRoomMenu({...roomMenu,step:'style'})}><Icon name="palette" size={15}/>공간 스타일 변경</button>
      <button type="button" role="menuitem" className="is-danger" disabled={!!busy} onClick={()=>deleteRoom(menuRoom.id)}><Icon name="trash" size={15}/>공간 삭제</button></>);
  const canAddRoom=!!form.industry&&!busy&&canSelectObjects;


  // 목록(id 없음)은 통합 조감도 목록이다 — 공간 · 건물 히스토리와 시작 팝업(components/birdseye-home.jsx).
  if(!id)return <BirdseyeHome go={go}/>;
  return <div className="sp-page sp-studio-page be-studio-page" ref={root}><div className="sp-page-in">
    <div className="sp-topbar"><header className="tl-head sp-header sp-studio-header">
      <div className="sp-header-heading">{!managed&&<><button type="button" className="sp-back-button" title={popup?"저장하고 조감도 스튜디오 닫기":"조감도 목록으로 돌아가기"} onClick={backToList} disabled={!!busy}><Icon name={popup?"x":"arrowL"} size={20}/><span>{popup?"닫기":"뒤로 가기"}</span></button><span className="sp-beta">BETA</span></>}
        {record?.id===id&&<input className="be-studio-title" aria-label="조감도 이름" value={form.title} maxLength={150} placeholder={scene?.title||'조감도 이름 (선택)'} onChange={e=>setForm({...form,title:e.target.value})}/>}</div>
      {managed&&<button className="btn btn-primary btn-sm" disabled={!!busy||!templateDirty} onClick={()=>setConfirmSave(true)}>변경 사항 저장</button>}
    </header></div>
    <FeedbackPopup message={error}/><FeedbackPopup message={notice} kind="info"/>
    {!baseLibrary&&!error&&<div className="boot" role="status" aria-live="polite"><span className="spin"/>공간 오브젝트를 준비하는 중…</div>}
    <FeedbackPopup message={busy} kind="progress" actionLabel={planner.current?"작업 취소":undefined} onAction={()=>planner.current?.abort()}/>
    {baseLibrary&&id&&(loading?<div className="boot"><span className="spin"/>조감도를 불러오는 중…</div>:record?.id===id&&<div className="sp-studio sp-sim-studio be-studio" data-spatial-id={id} ref={studioRef}>
      <section className="sp-workspace" aria-label="조감도 편집">
        <div className="be-canvas">
          {scene?<SpatialView key={generation+'-'+visibleFocus} ref={viewer} scene={current} library={library} view={view} selected={selected} highlighted={highlighted} onSelect={selectInView} onMove={onViewMove} labels={labels} disabled={!!busy} pointerMode={pointerMode}
              onCameraEdit={managed?()=>setSceneDirty(true):undefined} onRoomClick={openRoomMenu} onRoomDrop={dropRoom} onRoomPlace={placeRoom} activeRoom={roomMenu?.roomId||null} roomMenu={roomMenuContent}
              selectionContent={activeObject&&<SpatialObjectDetails object={activeObject} scene={scene} library={library} onRemove={remove} onRotate={rotate} onDuplicate={duplicate} onMention={oid=>promptInput.current?.mention(oid)} onClose={()=>setSelected(null)} disabled={!!busy}/>}/>
            :<div className="sp-blank-canvas" role="status" aria-label="빈 조감도"><Icon name="plus" size={24}/><h2>아직 배치된 공간이 없어요</h2>
              {form.industry?<p>오른쪽 위 <strong>공간 추가</strong>를 누르거나, 아래 입력창에 <strong>@회의실 추가해</strong>처럼 입력해 첫 공간을 만들어 보세요.</p>
                :<label className="sp-blank-industry">먼저 업종을 골라 주세요<select aria-label="업종" value="" disabled={!!busy} onChange={e=>setForm({...form,industry:e.target.value})}><option value="" disabled>업종 선택</option>{baseLibrary.industries.map(i=><option key={i.code} value={i.code}>{i.name}</option>)}</select></label>}
            </div>}
          <div className="be-canvas-tools be-canvas-left">
            <div className="be-tabs" role="tablist" aria-label="보기">{['2d','3d'].map(mode=><button key={mode} type="button" role="tab" aria-selected={view===mode} onClick={()=>setView(mode)}>{mode.toUpperCase()}</button>)}</div>
            <div className="be-tabs be-history">{historyActions}</div>
          </div>
          <div className="be-canvas-tools be-canvas-right">
            {scene&&view==='3d'&&<div className="be-tabs" role="tablist" aria-label="마우스 끌기 동작">{[['rotate','회전'],['pan','이동']].map(([mode,label])=><button key={mode} type="button" role="tab" aria-selected={pointerMode===mode} title={mode==='rotate'?'빈 곳을 끌면 시점을 돌려요':'빈 곳을 끌면 화면을 옮겨요'} onClick={()=>setPointerMode(mode)}>{label}</button>)}</div>}
            <div className="be-add-room"><button type="button" className="btn btn-primary btn-sm" aria-haspopup="menu" aria-expanded={addMenu} disabled={!canAddRoom} title={form.industry?undefined:'업종을 먼저 골라 주세요'} onClick={()=>{setRoomMenu(null);setAddMenu(open=>!open);}}><Icon name="plus" size={14}/><span>공간 추가</span></button>
              {addMenu&&<div className="be-add-room-menu" role="menu" aria-label="추가할 공간 용도">{SPACE_TYPES.map(([kind,label])=><button key={kind} type="button" role="menuitem" onClick={()=>addRoomOfKind(kind)}>{label}</button>)}</div>}</div>
          </div>
          {scene&&library.sourceHash!==baseLibrary.sourceHash&&<div className="sp-assets-update be-assets-update"><span>이전에 저장된 제품 형상을 사용하고 있어요.</span><button type="button" className="btn btn-sm" disabled={!!busy} onClick={updateAssets}>제품 형상 업데이트</button></div>}
        </div>
        <SpatialPrompt ref={promptInput} scene={scene} library={scene?library:baseLibrary} roomId={focus} busy={busy||(!scene&&!form.industry?'업종을 먼저 골라 주세요':'')} onMention={()=>setSelected(null)} onHighlight={setHighlighted} onSubmit={command}/>
      </section>
      <div className="be-panel-resizer" role="separator" aria-orientation="vertical" aria-label="오브젝트 목록 폭 (1~3열)" aria-valuemin={1} aria-valuemax={3} aria-valuenow={panelColumns} tabIndex={0} title="끌어서 목록 폭 조절" onPointerDown={resizeStart} onKeyDown={resizeKey}><span/></div>
      <SpatialObjectDrawer inline library={baseLibrary} canSelect={canSelectObjects} rooms={form.rooms} roomId={placementRoomId} onRoomChange={setAddingRoom} onAdd={addSelectedAssets} busy={!!busy} onClose={()=>{}} style={{'--be-cols':panelColumns}}/>
    </div>)}
    {confirmSave&&<Modal title="조감도 변경 사항을 저장할까요?" size="narrow" onClose={()=>setConfirmSave(false)} footer={<><button type="button" className="btn" data-autofocus onClick={()=>setConfirmSave(false)}>취소</button><button type="button" className="btn btn-primary" onClick={publishTemplate}>저장</button></>}>
      <p>저장하면 이 템플릿의 3D 썸네일과 새로 시작하는 조감도에 반영됩니다.</p>
    </Modal>}
    {styleChange&&<Modal title="공간 스타일을 바꿀까요?" size="narrow be-style-confirm" onClose={()=>setStyleChange(null)} footer={<><button type="button" className="btn" data-autofocus onClick={()=>setStyleChange(null)}>취소</button><button type="button" className="btn btn-primary" onClick={confirmRoomStyle}>변경</button></>}>
      <p>{roomName(styleChange.roomId)} 공간의 바닥 · 벽 · 가구 마감을 <strong>{STYLES[styleChange.style].name}</strong>(으)로 바꿉니다. 배치는 그대로예요.</p>
    </Modal>}
  </div></div>;
}
