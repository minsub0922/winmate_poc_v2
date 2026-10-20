import { browserStorage } from '../repositories/browser.js';
import {FeedbackPopup} from '../components/feedback-popup.jsx';
import { requireLogin } from '../api/session.js';
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import { confirmDelete, Icon,Modal,toast } from '../components/common.jsx';
import { SpatialView } from '../components/spatial-view.jsx';
import { SpatialPrompt } from '../components/spatial-prompt.jsx';
import { SpatialObjectDetails } from '../components/spatial-object-details.jsx';
import { SpatialObjectDrawer } from '../components/spatial-object-drawer.jsx';
import {upgradeSpatialAssets} from '../domain/spatial/asset-upgrade.js';
import { addStudioSelection } from '../domain/spatial/studio-selection.js';
import { applySpatialEdit,mergeSpatialEditForm } from '../domain/spatial/edit.js';
import { SpatialStudioForm } from '../components/spatial-studio-form.jsx';
import { SpatialMapCard,SpatialHistoryCard,SpatialTemplateGallery,SpatialHistoryPagination } from '../components/spatial-library.jsx';
import {SpatialSavedLayoutCard,SpatialSavedLayoutsDialog} from '../components/spatial-saved-layouts.jsx';
import {useMy} from '../repositories/templates.js';
import { getBootstrap } from '../api/bootstrap.js';
import { useWorkContext } from '../services/customer-voice-context.js';
import { spatialAssetLabel } from '../domain/spatial/catalog.js';
import { emptyStudioForm,studioFormFromScene,studioDocumentFromTemplate,createSceneFromForm,studioFormKey,validateStudioForm } from '../domain/spatial/studio-form.js';
import { createScene,validateScene,moveObject,sceneHash,focusScene,repairNaturalLayout,NATURAL_LAYOUT_VERSION } from '../domain/spatial/scene.js';
import { planSvg,svgData } from '../domain/spatial/plan-svg.js';
import { spatialTemplateCatalog } from '../domain/spatial/template-catalog.js';
import { planAnchors } from '../domain/spatial/scene.js';
import { createSpatialLayout,validSpatialLayout } from '../domain/spatial/layout.js';
import {spatialLayoutSignature} from '../domain/spatial/my-layout.js';
import {findSpatialMyLayout,readSpatialMyLayout,saveSpatialMyLayout} from '../services/spatial-my-layout.js';
import { SpatialLayoutEditor } from '../components/spatial-layout-editor.jsx';
import { SPATIAL_HISTORY_PAGE_SIZE,loadSpatialLibrary,loadSpatialHistory,getSpatialHistory,createSpatialDraft,saveSpatialForm,saveSpatialHistory,deleteSpatialHistory,editSpatial } from '../services/spatial.js';
import '../styles/spatial.css';

const VARIANTS={compact:'소형',standard:'표준',spacious:'확장'};
const inputKey=(form,view)=>JSON.stringify([form,view]);
const labels=true;

function StudioLaunchIcon(){
  return <svg className="sp-studio-launch-icon" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M5 38 31 23 59 39 33 54Z" fill="var(--surface)"/>
      <path d="M5 38V20L31 5V23Z" fill="var(--accent-soft)"/>
      <path d="M31 5 59 21V39L31 23Z" fill="var(--surface)"/>
      <path d="M5 20 31 35 59 21M31 35V45" opacity=".4"/>
      <path d="M13 24V17L23 11V18Z" fill="var(--surface)"/>
      <path d="M39 17 50 23V29L39 23Z" fill="var(--accent-soft)"/>
      <path d="M18 36 29 30 42 37 31 43Z" fill="var(--accent-soft)"/>
      <path d="M18 36V41M31 43V48M42 37V42"/>
      <path d="M46 42 51 39 56 42 51 45Z" fill="var(--accent-soft)"/>
      <path d="M51 39V33M48 35 51 37 54 33"/>
    </g>
  </svg>;
}

export function SpatialPage({id,go}){
  const assetLibraries=useRef(new Map());
  const personalTemplates=useMy();
  const savedLayouts=useMemo(()=>personalTemplates.filter(meta=>meta.my?.kind==='spatial'&&meta.my.spatialLayout),[personalTemplates]);
  const account=getBootstrap().user?.username||'local-dev',backupPrefix='winmate.v2.spatial-document.'+account+'.';
  const [baseLibrary,setBaseLibrary]=useState(null),[library,setLibrary]=useState(null),[history,setHistory]=useState([]),[record,setRecord]=useState(null),[form,setForm]=useState(emptyStudioForm),[scene,setScene]=useState(null);
  const [historyLoading,setHistoryLoading]=useState(true),[historyError,setHistoryError]=useState(''),[historyPage,setHistoryPage]=useState(1),[historyTotal,setHistoryTotal]=useState(null);
  const historyRequest=useRef(0),historyController=useRef(null),historyPageRef=useRef(1),historyTargetRef=useRef(1);
  const [loading,setLoading]=useState(!!id),[busy,setBusy]=useState(''),[autosaving,setAutosaving]=useState(false),[error,setError]=useState(''),[sceneDirty,setSceneDirty]=useState(false),[generatedKey,setGeneratedKey]=useState(null);
  const [view,setView]=useState('3d'),[focus,setFocus]=useState(''),[selected,setSelected]=useState(null),[generation,setGeneration]=useState(0),[undo,setUndo]=useState([]),[redo,setRedo]=useState([]),[notice,setNotice]=useState('');
  const [layoutMode,setLayoutMode]=useState(false),[layoutDraft,setLayoutDraft]=useState(null),[layoutSavedSignature,setLayoutSavedSignature]=useState(null),[layoutError,setLayoutError]=useState(''),[discardLayout,setDiscardLayout]=useState(false),[layoutUndo,setLayoutUndo]=useState([]),[layoutRedo,setLayoutRedo]=useState([]);
  const [layoutLibrary,setLayoutLibrary]=useState(null);
  const layoutDraftRef=useRef(null),layoutTemplateId=useRef(null),layoutHistoryId=useRef(null);
  const [highlighted,setHighlighted]=useState([]);
  const [pendingTemplate,setPendingTemplate]=useState(null);
  useEffect(()=>{if(layoutMode&&!layoutDraft)setLayoutMode(false);},[layoutMode,layoutDraft]);
  const [panel,setPanel]=useState(null),[mapIndustry,setMapIndustry]=useState('all'),[mapScope,setMapScope]=useState('full'),[mapVariant,setMapVariant]=useState('all'),[mapFilter,setMapFilter]=useState('');
  const [addingRoom,setAddingRoom]=useState(''),[deleting,setDeleting]=useState(null);
  const mapViewKey='winmate.v2.spatial-map-view.'+account;
  const [mapDefaultView,setMapDefaultView]=useState(()=>{try{return browserStorage.getItem(mapViewKey)==='3d'?'3d':'2d';}catch{return '2d';}});
  useEffect(()=>{try{browserStorage.setItem(mapViewKey,mapDefaultView);}catch{}},[mapViewKey,mapDefaultView]);
  const root=useRef(null),viewer=useRef(null),layoutEditor=useRef(null),layoutBackdrop=useRef(null),recordRef=useRef(null),queue=useRef(Promise.resolve()),saveTimer=useRef(null),savedInput=useRef(''),activeId=useRef(id),mounted=useRef(true),planner=useRef(null),promptInput=useRef(null),latestScene=useRef(null);
  activeId.current=id;latestScene.current=scene;
  useWorkContext('spatial',()=>({id,status:busy||record?.status||'browsing',state:{record,form,scene,view,focus,selected,highlighted,sceneDirty,autosaving,generatedKey,layoutMode,layoutDraft,layoutTemplateId:layoutTemplateId.current,layoutHistoryId:layoutHistoryId.current,panel,error,layoutError,historyPage,historyTotal,camera:viewer.current?.cameraState?.()}}));
  const refreshHistory=async(page=historyPageRef.current,{scroll=false}={})=>{
    historyTargetRef.current=page;
    const request=++historyRequest.current,controller=new AbortController();historyController.current?.abort();historyController.current=controller;
    setHistoryLoading(true);setHistoryError('');
    try{
      const data=await loadSpatialHistory({page,pageSize:SPATIAL_HISTORY_PAGE_SIZE,signal:controller.signal});
      if(mounted.current&&request===historyRequest.current&&!controller.signal.aborted){
        setHistory(data.items);setHistoryTotal(data.total);setHistoryPage(data.page);historyPageRef.current=data.page;historyTargetRef.current=data.page;
        if(scroll)root.current?.querySelector('.sp-history')?.scrollIntoView({block:'start'});
      }
    }catch(e){if(mounted.current&&request===historyRequest.current&&!controller.signal.aborted)setHistoryError(e.message);}
    finally{if(mounted.current&&request===historyRequest.current)setHistoryLoading(false);}
  };
  useLayoutEffect(()=>{
    if(!id){void refreshHistory();return()=>{++historyRequest.current;historyController.current?.abort();};}
  },[id]);
  useEffect(()=>{
    mounted.current=true;
    loadSpatialLibrary().then(lib=>{if(mounted.current){setBaseLibrary(lib);setLibrary(lib);}}).catch(e=>{if(mounted.current)setError(e.message);});
    return()=>{mounted.current=false;clearTimeout(saveTimer.current);planner.current?.abort();};
  },[]);

  const install=(document,lib,local=null)=>{
    let next=local?.scene??document.scene,inputs=local?.form||document.form||(next?studioFormFromScene(next):emptyStudioForm()),mode=local?.view||document.view||'3d',changed=false,message='';
    const original=next;
    const baseline=next?{...studioFormFromScene(next),...(document.form?.templateId?{templateId:document.form.templateId}:{})}:null;
    if(next?.presentation?.layout&&!validSpatialLayout(next.presentation.layout))throw new Error('저장된 레이아웃 데이터가 올바르지 않습니다.');
    setLayoutMode(false);
    if(next&&(next.layoutPolicy?.version||0)<NATURAL_LAYOUT_VERSION){try{const fixed=repairNaturalLayout(next,lib);next=fixed.scene;changed=!!fixed.report.corrected;if(changed)message=`기존 장면의 가구 ${fixed.report.corrected}개 방향·간격을 정리했어요. 실행 취소로 이전 배치를 볼 수 있어요.`;}catch{message='기존 장면의 가구 방향·간격을 확인해 주세요.';}}
    recordRef.current=document;setRecord(document);setLibrary(lib);setForm(inputs);setScene(next||null);setView(mode);setFocus(next?.presentation?.focusRoomId||'');setSelected(null);setUndo(changed?[original]:[]);setRedo([]);setNotice(message);setSceneDirty(changed||!!local?.sceneDirty);setGeneratedKey(next?.formKey||document.generatedFormKey||(baseline?studioFormKey(baseline):null));setGeneration(n=>n+1);setPanel(null);
    savedInput.current=inputKey(document.form||(document.scene?studioFormFromScene(document.scene):emptyStudioForm()),document.view||'3d');
  };
  useEffect(()=>{
    if(!baseLibrary)return;clearTimeout(saveTimer.current);planner.current?.abort();let active=true;
    if(!id){recordRef.current=null;setRecord(null);setScene(null);setLayoutMode(false);setForm(emptyStudioForm());setLibrary(baseLibrary);setLoading(false);setPanel(null);setError('');return;}
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
  const pendingInputs=!!scene&&generatedKey!==studioFormKey(form);
  const activeObject=scene?.objects.find(o=>o.id===selected);
  const placementRoomId=form.rooms.some(r=>r.id===addingRoom)?addingRoom:form.rooms.some(r=>r.id===focus)?focus:form.rooms[0]?.id||'';
  const canSelectObjects=!!id&&record?.id===id&&!loading&&!layoutMode;
  const filteredMaps=useMemo(()=>spatialTemplateCatalog(baseLibrary,{industry:mapIndustry,scope:mapScope,variant:mapVariant,query:mapFilter}),[baseLibrary,mapIndustry,mapScope,mapVariant,mapFilter]);
  const emptyHistoryTemplates=useMemo(()=>baseLibrary?baseLibrary.industries.map(industry=>baseLibrary.templates.find(template=>template.industry===industry.code&&template.scope==='full'&&template.variant==='standard'&&!template.id.startsWith('case-'))).filter(Boolean):[],[baseLibrary]);
  const templateThumbnail=useMemo(()=>{
    const template=baseLibrary?.templates.find(t=>t.id==='cowork-full-standard')||baseLibrary?.templates[0];
    return template?svgData(planSvg(createScene({templateId:template.id},baseLibrary),baseLibrary,{width:720,height:480,productPins:false,labels:false,dimensions:false})):null;
  },[baseLibrary]);

  const beginStudio=async(inputs=emptyStudioForm(),mode='3d',initialScene=null)=>{
    if (!requireLogin()) return false;
    if(busy)return;setBusy('스튜디오를 여는 중');setError('');
    try{const document=initialScene?await saveSpatialHistory(initialScene,mode,null,{form:inputs}):await createSpatialDraft(inputs,mode);recordRef.current=document;setRecord(document);setScene(document.scene||null);setSceneDirty(false);setGeneratedKey(document.scene?.formKey||document.generatedFormKey||null);setForm(inputs);setView(mode);setFocus('');setSelected(null);setUndo([]);setRedo([]);setPanel(null);go({name:'spatial',id:document.id});return true;}
    catch(e){setError(e.message);return false;}finally{setBusy('');}
  };
  const requestTemplate=(template,mode)=>{setError('');setPendingTemplate({template,mode});};
  const useTemplate=async(template,mode)=>{
    if(busy)return;
    try{const {form:inputs,scene:next}=studioDocumentFromTemplate(template,baseLibrary);
      if(!id){if(await beginStudio(inputs,mode,next))setPendingTemplate(null);return;}
      clearTimeout(saveTimer.current);setBusy('템플릿 조감도를 여는 중');
      const result=await enqueue(r=>saveSpatialHistory(next,mode,r,{form:inputs}));if(!result)return;
      install(result,baseLibrary);setPendingTemplate(null);setNotice('구성된 템플릿 조감도를 열었어요. 공간·제품을 바로 확인하고 수정할 수 있어요.');void refreshHistory();root.current?.scrollTo({top:0});
    }catch(e){setError(e.message);}finally{setBusy('');}
  };
  const persistScene=async(next,inputs=form)=>{
    const result=await enqueue(r=>saveSpatialHistory(next,view,r,{form:inputs}));
    if(result){savedInput.current=inputKey(inputs,view);setSceneDirty(false);void refreshHistory();}return result;
  };
  const generate=async()=>{
    if(busy||!recordRef.current)return;clearTimeout(saveTimer.current);setBusy('조감도를 만드는 중');setError('');
    try{await queue.current;const next=createSceneFromForm(form,baseLibrary,{documentId:id});setLibrary(baseLibrary);setScene(next);setGeneratedKey(studioFormKey(form));setSceneDirty(true);setFocus('');setSelected(null);setUndo([]);setRedo([]);setNotice('입력한 공간·제품으로 조감도를 만들었어요.');setGeneration(n=>n+1);await persistScene(next);}
    catch(e){setError(e.message);}finally{setBusy('');}
  };
  const savedScene=()=>{if(!scene)return null;const camera=!focus&&!layoutMode?viewer.current?.cameraState():null,title=form.title.trim()||scene.title;const next={...scene,...(camera?{camera}:{}),presentation:{...scene.presentation,focusRoomId:focus,...(scene.presentation?.layout?{layout:{...scene.presentation.layout,title}}:{})},title};next.contentHash=sceneHash(next);return next;};
  const finishCloseLayout=()=>{setLayoutMode(false);setLayoutDraft(null);layoutDraftRef.current=null;layoutTemplateId.current=null;layoutHistoryId.current=null;setLayoutLibrary(null);setLayoutSavedSignature(null);setLayoutError('');setDiscardLayout(false);setLayoutUndo([]);setLayoutRedo([]);};
  const closeLayout=async()=>{
    if(busy)return;
    try{const layout=await layoutEditor.current?.prepareSave({waitForReady:false})||layoutDraftRef.current;if(!layoutSavedSignature||spatialLayoutSignature(layout)!==layoutSavedSignature){setDiscardLayout(true);return;}finishCloseLayout();}
    catch(e){setLayoutError(e.message);}
  };
  const saveLayout=async()=>{
    if(busy||!layoutDraftRef.current||!requireLogin())return;setBusy('저장하는 중');setLayoutError('');
    try{const layout=await layoutEditor.current?.prepareSave()||layoutDraftRef.current,saved=await saveSpatialMyLayout(layout,{historyId:layoutHistoryId.current,templateId:layoutTemplateId.current});layoutTemplateId.current=saved.f;layoutDraftRef.current=layout;setLayoutDraft(layout);setLayoutSavedSignature(spatialLayoutSignature(layout));toast('Layout 히스토리에 저장됐어요.');}
    catch(e){setLayoutError(e.message||'저장하지 못했어요.');}finally{setBusy('');}
  };
  const backToList=async()=>{clearTimeout(saveTimer.current);try{await queue.current;if(sceneDirty&&scene)await persistScene(savedScene());else await persistForm();go({name:'spatial'});}catch(e){setError(e.message);}};
  if(library)assetLibraries.current.set(library.sourceHash,library);
  if(baseLibrary)assetLibraries.current.set(baseLibrary.sourceHash,baseLibrary);
  const commitScene=next=>{
    const restoredLibrary=assetLibraries.current.get(next.assetRevision);if(restoredLibrary)setLibrary(restoredLibrary);
    if(scene){const inputs=mergeSpatialEditForm(form,scene,next,library);if(inputs!==form){setForm(inputs);if(generatedKey===studioFormKey(form)){const key=studioFormKey(inputs);next={...next,formKey:key};next.contentHash=sceneHash(next);setGeneratedKey(key);}}}
    setScene(next);setSceneDirty(true);setError('');
  };
  const mutate=next=>{setUndo(a=>[...a.slice(-24),scene]);setRedo([]);commitScene(next);};
  const updateAssets=()=>{try{mutate(upgradeSpatialAssets(scene,baseLibrary,library));setSelected(null);toast('실측 크기와 제품 이미지를 업데이트했어요.');}catch(e){setError(e.message);}};
  const updateLayout=(layout,options={})=>{
    const current=layoutDraftRef.current;
    if(options.history!==false&&current){setLayoutUndo(values=>[...values.slice(-24),options.before||current]);setLayoutRedo([]);}
    layoutDraftRef.current=layout;setLayoutDraft(layout);setLayoutError('');
  };
  const extractLayout=async()=>{
    if(busy)return;layoutBackdrop.current=current;setBusy('레이아웃을 여는 중');setError('');setLayoutError('');
    try{
      const saved=findSpatialMyLayout(id);let layout=saved?await readSpatialMyLayout(saved):scene.presentation?.layout;
      if(!layout){const host=root.current.querySelector('.sp-view'),ratio=host?host.clientHeight/host.clientWidth:720/1280,snapshot=view==='3d'?await viewer.current?.snapshot({w:1280,h:Math.round(1280*ratio),type:'image/png',transparentBackground:true}):{image:svgData(planSvg(current,library,{productPins:false,labels:false,dimensions:false,transparentBackground:true})),anchors:{width:1280,height:820,...planAnchors(current)}};layout=createSpatialLayout({...current,title:form.title.trim()||current.title},library,snapshot||{},view);}
      layoutTemplateId.current=saved?.f||null;layoutHistoryId.current=id;setLayoutLibrary(library);layoutDraftRef.current=layout;setLayoutDraft(layout);setLayoutSavedSignature(saved?spatialLayoutSignature(layout):null);setLayoutUndo([]);setLayoutRedo([]);setDiscardLayout(false);setLayoutMode(true);setSelected(null);setPanel(null);
    }catch(e){setError(e.message);}finally{setBusy('');}
  };
  const openSavedLayout=async meta=>{
    if(busy||!requireLogin())return;setBusy('레이아웃을 여는 중');setError('');setLayoutError('');
    try{
      let layout=await readSpatialMyLayout(meta);
      if(!layout)throw new Error('저장한 레이아웃 데이터를 확인해 주세요.');
      if(!layout.sourceScene){
        const document=meta.my.spatialHistoryId?await getSpatialHistory(meta.my.spatialHistoryId):null;
        if(!document?.scene)throw new Error('레이아웃의 원본 장면을 찾지 못했어요.');
        const roomTargets=layout.targets.filter(target=>target.kind==='room'),source=roomTargets.length===1&&document.scene.rooms.length>1?focusScene(document.scene,roomTargets[0].id.slice(5)):document.scene;
        layout={...layout,sourceScene:source};
      }
      const revision=layout.sourceScene.assetRevision,resolved=revision&&revision!==baseLibrary.sourceHash?await loadSpatialLibrary(revision):baseLibrary;
      layoutHistoryId.current=meta.my.spatialHistoryId;layoutTemplateId.current=meta.f;setLayoutLibrary(resolved);layoutDraftRef.current=layout;setLayoutDraft(layout);setLayoutSavedSignature(spatialLayoutSignature(layout));setLayoutUndo([]);setLayoutRedo([]);setDiscardLayout(false);setLayoutMode(true);
    }catch(error){setError(error.message);}finally{setBusy('');}
  };
  const onMove=(oid,patch)=>{try{mutate(moveObject(scene,oid,patch,library));}catch(e){setError(e.message);}};
  const onViewMove=(oid,patch)=>{const r=focus&&scene.rooms.find(r=>r.id===focus);onMove(oid,r?{...patch,x:patch.x+r.x,z:patch.z+r.z}:patch);};
  const remove=oid=>{try{mutate(applySpatialEdit(scene,{operations:[{type:'remove',objectId:oid}]},library));setSelected(null);}catch(e){setError(e.message);}};
  const edit=async(prompt,mentions)=>{
    if(busy||!scene)return false;
    const base=scene,controller=new AbortController();planner.current=controller;setBusy('AI가 오브젝트를 편집하는 중');setError('');setNotice('');
    try{
      let feedback;
      for(let attempt=0;attempt<2;attempt++){
        const result=await editSpatial({prompt,mentions,scene:base,roomId:focus||undefined,feedback},controller.signal);
        if(controller.signal.aborted)return false;
        if(latestScene.current!==base)throw new Error('편집 중 장면이 변경되었습니다. 현재 배치에서 다시 요청해 주세요.');
        if(!result.plan.operations.length){setNotice(result.plan.explanation);return false;}
        try{const next=applySpatialEdit(base,result.plan,library),removed=result.plan.operations.filter(op=>op.type==='remove');if(removed.length){const accepted=await confirmDelete({title:'오브젝트를 삭제할까요?',message:'프롬프트의 변경 사항에 오브젝트 삭제가 포함되어 있습니다.',items:removed.map(op=>{const o=base.objects.find(o=>o.id===op.objectId);return spatialAssetLabel(assets[o.assetId]);})});if(!accepted||controller.signal.aborted)return false;if(latestScene.current!==base)throw new Error('장면이 변경되었습니다. 다시 요청해 주세요.');}mutate(next);setSelected(value=>next.objects.some(o=>o.id===value)?value:null);setNotice(result.plan.explanation);return true;}
        catch(error){if(attempt)throw error;feedback=error.message;setBusy('AI가 배치 간섭을 조정하는 중');}
      }
    }catch(e){if(!controller.signal.aborted)setError(e.message);return false;}
    finally{if(mounted.current){setBusy('');planner.current=null;}}
  };
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
      if(changed){setUndo(values=>[...values.slice(-24),scene]);setRedo([]);}
      setLibrary(baseLibrary);setForm(result.form);setScene(next);setSceneDirty(false);if(changed&&synced)setGeneratedKey(key);savedInput.current=inputKey(result.form,view);setError('');void refreshHistory();toast(`선택한 ${assetIds.length}개를 공간에 추가했어요`);
    }finally{setBusy('');}
  };
  const historyActions=<><button className="btn btn-ghost btn-icon" aria-label="실행 취소" disabled={!!busy||!undo.length} onClick={()=>{setRedo(a=>[...a,scene]);commitScene(undo.at(-1));setUndo(a=>a.slice(0,-1));}}><Icon name="undo" size={16}/></button><button className="btn btn-ghost btn-icon" aria-label="다시 실행" disabled={!!busy||!redo.length} onClick={()=>{setUndo(a=>[...a,scene]);commitScene(redo.at(-1));setRedo(a=>a.slice(0,-1));}}><Icon name="redo" size={16}/></button></>;
  const layoutActions=<><button type="button" className="btn btn-ghost btn-icon" aria-label="실행 취소" disabled={!!busy||!layoutUndo.length} onClick={()=>{const previous=layoutUndo.at(-1),current=layoutDraftRef.current;setLayoutRedo(values=>[...values,current]);setLayoutUndo(values=>values.slice(0,-1));layoutDraftRef.current=previous;setLayoutDraft(previous);}}><Icon name="undo" size={16}/></button><button type="button" className="btn btn-ghost btn-icon" aria-label="다시 실행" disabled={!!busy||!layoutRedo.length} onClick={()=>{const next=layoutRedo.at(-1),current=layoutDraftRef.current;setLayoutUndo(values=>[...values,current]);setLayoutRedo(values=>values.slice(0,-1));layoutDraftRef.current=next;setLayoutDraft(next);}}><Icon name="redo" size={16}/></button></>;
  const layoutDirty=!!layoutDraft&&(!layoutSavedSignature||spatialLayoutSignature(layoutDraft)!==layoutSavedSignature);


  return <div className={'sp-page'+(id?' sp-studio-page':'')} ref={root}><div className="sp-page-in">
    <div className="sp-topbar"><header className={'tl-head sp-header'+(id?' sp-studio-header':'')}>
      {id?<div className="sp-header-heading"><button type="button" className="sp-back-button" title="조감도 목록으로 돌아가기" onClick={backToList} disabled={!!busy}><Icon name="arrowL" size={20}/><span>뒤로 가기</span></button><span className="sp-beta">BETA</span></div>:<div className="tl-title"><span className="eyebrow">WINMATE · 공간 제안</span><h1>공간 조감도<span className="sp-beta">BETA</span></h1><p>새 조감도를 만들거나 저장한 공간을 이어서 편집하세요.</p></div>}
      <div className="sp-header-actions"><button type="button" className="btn btn-primary sp-object-trigger" disabled={!library||!!busy||layoutMode} aria-haspopup="dialog" onClick={()=>setPanel('objects')}><Icon name="product" size={19}/><span>제품 · 가구 오브젝트</span></button></div>
    </header></div>
    {panel==='objects'&&baseLibrary&&<SpatialObjectDrawer library={baseLibrary} canSelect={canSelectObjects} rooms={form.rooms} roomId={placementRoomId} onRoomChange={setAddingRoom} onAdd={addSelectedAssets} busy={!!busy} onClose={()=>setPanel(null)}/>}
    <FeedbackPopup message={error}/><FeedbackPopup message={notice} kind="info"/>
    {!baseLibrary&&!error&&<div className="boot" role="status" aria-live="polite"><span className="spin"/>공간 오브젝트를 준비하는 중…</div>}
    <FeedbackPopup message={busy} kind="progress" actionLabel={planner.current?"작업 취소":undefined} onAction={()=>planner.current?.abort()}/>
    {baseLibrary&&!id&&<div className="sp-home-launches"><button className="sp-studio-launch" disabled={!!busy} onClick={()=>beginStudio()}><span className="sp-launch-icon"><StudioLaunchIcon/></span><span className="sp-launch-copy"><strong>조감도 스튜디오</strong><small>빈 공간에서 업종·공간·제품을 입력해 새로운 조감도를 만드세요.</small></span></button><button type="button" className="sp-template-launch" aria-label="업종별 템플릿 활용하기" aria-haspopup="dialog" onClick={()=>setPanel('maps')}><span className="sp-template-launch-thumb" aria-hidden="true"><img src={templateThumbnail} alt=""/></span><span className="sp-template-launch-copy"><strong className="sp-template-launch-label">업종별 템플릿 활용하기</strong><small className="sp-template-launch-description">업종에 맞는 공간 구성으로 시작하세요.</small></span></button></div>}
    {baseLibrary&&id&&(loading?<div className="boot"><span className="spin"/>조감도를 불러오는 중…</div>:record?.id===id&&<div className="sp-studio sp-input-studio" data-spatial-id={id}>
      <SpatialStudioForm form={form} library={baseLibrary} onChange={setForm} onGenerate={generate} onTemplates={()=>setPanel('maps')} onHighlight={(assetId,roomId)=>setHighlighted(scene?.objects.filter(o=>o.assetId===assetId&&o.roomId===roomId).map(o=>o.id)||[])} disabled={!!busy||layoutMode}/>
      <section className="sp-workspace" aria-label="조감도 편집"><div className="sp-canvas-toolbar"><div className="sp-view-switch">{['2d','3d'].map(mode=><button key={mode} aria-pressed={view===mode} disabled={layoutMode} onClick={()=>setView(mode)}>{mode.toUpperCase()} {mode==='2d'?'평면도':'조감도'}</button>)}</div><div className="sp-canvas-actions">{historyActions}</div></div>
        <div className="sp-canvas-title"><div className="sp-canvas-spec"><input aria-label="조감도 이름" value={form.title} maxLength={150} placeholder="조감도 이름 (선택)" onChange={e=>setForm({...form,title:e.target.value})}/><span>{current?`${current.rooms.length}개 공간 · ${current.objects.filter(o=>assets[o.assetId]?.productId).length}개 제품 · ${(current.width*current.depth).toFixed(0)}㎡`:'아직 생성한 조감도가 없어요'}</span></div><div className="sp-layout-mode-actions"><button className="btn btn-primary sp-layout-extract" disabled={!!busy||!scene} onClick={extractLayout}><Icon name="panel" size={18}/>레이아웃 추출</button></div></div>
        {scene?<>
          {library.sourceHash!==baseLibrary.sourceHash&&<div className="sp-assets-update"><span>이전에 저장된 제품 형상을 사용하고 있어요.</span><button type="button" className="btn btn-sm" disabled={!!busy||layoutMode} onClick={updateAssets}>제품 형상 업데이트</button></div>}
          <FeedbackPopup message={pendingInputs?"입력 내용이 변경되었어요. 조감도 만들기를 눌러 배치에 반영하세요.":""} kind="info"/>
          <SpatialView key={generation+'-'+visibleFocus} ref={viewer} scene={layoutMode?(layoutBackdrop.current||current):current} library={library} view={view} selected={selected} highlighted={highlighted} onSelect={setSelected} onMove={onViewMove} labels={labels} disabled={!!busy||layoutMode} selectionContent={activeObject&&<SpatialObjectDetails object={activeObject} scene={scene} library={library} onRemove={remove} onMention={oid=>promptInput.current?.mention(oid)} onClose={()=>setSelected(null)} disabled={!!busy}/>}/>
          <div className="sp-room-strip"><button aria-pressed={!focus} onClick={()=>{setFocus('');setSelected(null);}}>전체 맵</button>{scene.rooms.map((r,index)=><button key={r.id} aria-pressed={focus===r.id} onClick={()=>{setFocus(r.id);setSelected(null);}}><b>{String(index+1).padStart(2,'0')}</b>{r.name}</button>)}</div>
        </>:<div className="sp-blank-canvas" role="status" aria-label="빈 조감도"><Icon name="plus" size={24}/><h2>아직 배치된 공간이 없어요</h2><p>업종과 공간별 제품을 입력하고<br/><strong>조감도 만들기</strong>를 눌러 주세요.</p></div>}
        {scene&&<SpatialPrompt ref={promptInput} scene={scene} library={library} roomId={focus} busy={busy} onMention={()=>setSelected(null)} onHighlight={setHighlighted} onSubmit={edit}/>}
      </section>
    </div>)}
    {baseLibrary&&!id&&panel==='layouts'&&<SpatialSavedLayoutsDialog items={savedLayouts} library={baseLibrary} onEdit={openSavedLayout} disabled={!!busy} onClose={()=>setPanel(null)}/>}
    {layoutMode&&layoutDraft&&<Modal title="레이아웃 추출" sub="각도를 조절하고 공간·제품에 설명을 연결하세요." size="sp-layout-modal" bodyStyle={{padding:0,gap:0}} onClose={closeLayout} headerActions={layoutActions} footer={<><span className="sp"/><button type="button" className="btn btn-sm" disabled={!!busy} onClick={closeLayout}>닫기</button><button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={saveLayout}>{busy?'저장하는 중…':'저장하기'}</button></>}>
      {layoutError&&<div className="sp-error" role="alert">{layoutError}</div>}
      <SpatialLayoutEditor ref={layoutEditor} layout={layoutDraft} scene={layoutDraft.sourceScene||scene} library={layoutLibrary||library} onChange={updateLayout} disabled={!!busy}/>
    </Modal>}
    {discardLayout&&<Modal title="저장하지 않고 닫을까요?" size="narrow" onClose={()=>setDiscardLayout(false)} footer={<><button type="button" className="btn" data-autofocus onClick={()=>setDiscardLayout(false)}>계속 편집</button><button type="button" className="btn btn-danger" onClick={finishCloseLayout}>저장하지 않고 닫기</button></>}><p>저장하지 않은 변경 내용이 있습니다. 닫으면 변경 내용이 사라집니다.</p></Modal>}
    {baseLibrary&&!id&&<>
      {!historyLoading&&!historyError&&history.length===0&&<section className="sp-library sp-home-maps" aria-label="업종 템플릿"><div className="sp-library-intro"><div><h2>업종 템플릿</h2><p>업종별 조감도를 활용해 첫 공간을 만들어 보세요.</p></div><button type="button" className="btn btn-sm" aria-haspopup="dialog" onClick={()=>setPanel('maps')}>전체 보기<Icon name="arrowR" size={14}/></button></div><div className="sp-map-grid">{emptyHistoryTemplates.map(template=><SpatialMapCard key={template.id} template={template} library={baseLibrary} onOpen={requestTemplate} openLabel="활용하기"/>)}</div></section>}
      <section className="sp-library sp-saved-layouts" aria-label="Layout 히스토리"><div className="sp-library-intro"><div><h2>Layout 히스토리 <span className="sp-history-count">{savedLayouts.length}</span></h2><p>추출한 레이아웃을 열어 각도와 설명을 다시 수정하세요.</p></div><button type="button" className="btn btn-sm" aria-haspopup="dialog" disabled={!savedLayouts.length||!!busy} onClick={()=>setPanel('layouts')}>전체 보기<Icon name="arrowR" size={14}/></button></div>{savedLayouts.length?<div className="sp-map-grid">{savedLayouts.slice(0,4).map(item=><SpatialSavedLayoutCard key={item.f} item={item} library={baseLibrary} onEdit={openSavedLayout} disabled={!!busy}/>)}</div>:<div className="sp-empty"><h3>아직 저장한 조감도 레이아웃이 없어요</h3><p>조감도에서 레이아웃 추출 후 저장하기를 눌러 보세요.</p></div>}</section>
      <section className="sp-library sp-history" aria-label="조감도 히스토리" aria-busy={historyLoading}>
        <div className="sp-library-intro"><div><h2>조감도 히스토리 {historyTotal!==null&&<span className="sp-history-count">{historyTotal}</span>}</h2><p>저장한 조감도와 작성 중인 입력을 이어서 편집하세요.</p></div></div>
        <FeedbackPopup message={historyError} title="히스토리를 불러오지 못했어요" actionLabel="다시 불러오기" onAction={()=>refreshHistory(historyTargetRef.current)}/>
        {history.length>0?<>
          <div className="sp-map-grid" data-history-page={historyPage}>{history.map(item=><SpatialHistoryCard key={item.id} item={item} library={baseLibrary} onOpen={()=>go({name:'spatial',id:item.id})} onDelete={()=>setDeleting(item)}/>)}</div>
          <SpatialHistoryPagination page={historyPage} total={historyTotal||0} pageSize={SPATIAL_HISTORY_PAGE_SIZE} loading={historyLoading} onChange={page=>{if(page!==historyPage&&!historyLoading)void refreshHistory(page,{scroll:true});}}/>
        </>:historyLoading?<div className="sp-empty" role="status"><span className="spin"/><p>조감도 히스토리를 불러오는 중…</p></div>:!historyError&&<div className="sp-empty"><Icon name="history" size={30}/><h3>저장한 조감도가 없어요</h3><p>조감도 스튜디오에서 첫 공간을 만들어 보세요.</p></div>}
      </section>
    </>}
    {panel==='maps'&&<Modal title="업종 템플릿" sub="템플릿에 준비된 조감도와 공간·제품 구성을 바로 열어 수정하세요." size="wide sp-maps-modal" onClose={()=>setPanel(null)}><div className="sp-map-default-view"><span>기본 썸네일</span><div role="group" aria-label="기본 썸네일">{['2d','3d'].map(mode=><button key={mode} aria-pressed={mapDefaultView===mode} onClick={()=>setMapDefaultView(mode)}>{mode.toUpperCase()}</button>)}</div></div><div className="sp-filterbar"><select aria-label="템플릿 업종" value={mapIndustry} onChange={e=>setMapIndustry(e.target.value)}><option value="all">전체 업종</option>{baseLibrary.industries.map(i=><option key={i.code} value={i.code}>{i.name}</option>)}</select><select aria-label="템플릿 범위" value={mapScope} onChange={e=>setMapScope(e.target.value)}><option value="all">전체·개별 모두</option><option value="full">전체 맵</option><option value="single">개별 공간</option></select><select aria-label="공간 크기" value={mapVariant} onChange={e=>setMapVariant(e.target.value)}><option value="all">모든 크기</option>{Object.entries(VARIANTS).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select><input aria-label="업종 템플릿 검색" value={mapFilter} onChange={e=>setMapFilter(e.target.value)} placeholder="공간 이름 · 장표 ID 검색"/><span>{filteredMaps.length}개</span></div><SpatialTemplateGallery key={JSON.stringify([mapIndustry,mapScope,mapVariant,mapFilter])} templates={filteredMaps} library={baseLibrary} onOpen={requestTemplate} defaultView={mapDefaultView}/></Modal>}
    {pendingTemplate&&<Modal title="스튜디오로 이동할까요?" size="narrow" onClose={()=>{if(!busy)setPendingTemplate(null);}} footer={<><button className="btn" disabled={!!busy} onClick={()=>setPendingTemplate(null)}>취소</button><button className="btn btn-primary" disabled={!!busy} onClick={()=>useTemplate(pendingTemplate.template,pendingTemplate.mode)}>{busy?'스튜디오를 여는 중…':'스튜디오로 이동'}</button></>}>
      <p><strong>{pendingTemplate.template.name}</strong></p>
      <p>{id?'현재 작업을 이 템플릿의 조감도·공간·제품 구성으로 바꾸고 스튜디오로 돌아갑니다.':'이 템플릿의 조감도와 공간·제품 구성이 담긴 새 스튜디오로 이동합니다.'} 준비된 조감도를 바로 확인하고 수정할 수 있어요.</p>
      
    </Modal>}
    {deleting&&<Modal title="조감도를 삭제할까요?" size="narrow" onClose={()=>setDeleting(null)} footer={<><button className="btn" onClick={()=>setDeleting(null)}>취소</button><button className="btn btn-danger" onClick={async()=>{try{await deleteSpatialHistory(deleting.id);setDeleting(null);await refreshHistory();}catch(e){setError(e.message);}}}>삭제</button></>}><p>{deleting.title}</p></Modal>}
  </div></div>;
}
