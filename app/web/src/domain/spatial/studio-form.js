import { addAsset,createScene,roomKind,fingerprint,sceneHash } from './scene.js';
import { STYLES } from './geometry.js';
import {roomGridColumns,TEMPLATE_ROOM} from './template-composition.js';
import {populateScenePeople} from './people-layout.js';

export const SPACE_TYPES=[['reception','로비 · 접수'],['office','업무 공간'],['meeting','회의실'],['lounge','라운지 · 휴게'],['dining','식당 · 카페'],['kitchen','주방'],['classroom','강의실'],['study','학습 · 열람'],['bedroom','객실 · 침실'],['medical','의료 · 케어'],['retail','매장 · 쇼룸'],['warehouse','생산 · 물류'],['utility','설비 · 관리'],['theatre','공연 · 강당'],['fitness','운동 · 재활'],['outdoor','야외 공간']];
export const emptyStudioForm=()=>({version:1,title:'',industry:'',style:'modern',templateId:null,rooms:[]});
export function newStudioRoom(name=''){
  return {id:'room-'+crypto.randomUUID().replaceAll('-','').slice(0,12),name,kind:name?roomKind(name):'office',width:'',depth:'',capacity:'',products:[]};
}
export const studioFormKey=form=>fingerprint(form);
export function roomDimensions(room){
  const capacity=room.capacity===''||room.capacity==null?0:Number(room.capacity);
  let width=room.kind==='office'||room.kind==='study'?TEMPLATE_ROOM.width:7.2,depth=room.kind==='office'||room.kind==='study'?TEMPLATE_ROOM.depth:6.3;
  if(capacity&&['office','study','classroom'].includes(room.kind)){
    const cols=Math.max(1,Math.ceil(Math.sqrt(capacity*2.25/1.85))),rows=Math.ceil(capacity/cols);
    width=Math.max(width,cols*1.85+1.55);depth=Math.max(depth,rows*2.25+1.15);
  }
  if(room.width!==''&&room.width!=null)width=Number(room.width);
  if(room.depth!==''&&room.depth!=null)depth=Number(room.depth);
  return {width,depth};
}
export function validateStudioForm(form,library,{complete=false}={}){
  const errors=[];
  if(!form||form.version!==1)return ['지원하지 않는 공간 입력 형식입니다.'];
  if(typeof form.title!=='string'||form.title.length>150)errors.push('조감도 이름은 150자 이내로 입력해 주세요.');
  if(complete&&!form.industry)errors.push('업종을 선택해 주세요.');
  if(form.industry&&!library.industries.some(i=>i.code===form.industry))errors.push('등록된 업종을 선택해 주세요.');
  if(!STYLES[form.style])errors.push('공간 스타일을 선택해 주세요.');
  if(!Array.isArray(form.rooms)||form.rooms.length>30)return [...errors,'공간은 최대 30개까지 입력할 수 있어요.'];
  if(complete&&!form.rooms.length)errors.push('공간을 한 개 이상 추가해 주세요.');
  const ids=new Set(),assets=Object.fromEntries(library.assets.filter(a=>a.productId).map(a=>[a.productId,a]));
  const furniture=Object.fromEntries(library.assets.filter(a=>!a.productId).map(a=>[a.id,a]));
  for(const [index,r] of form.rooms.entries()){
    if(!r||typeof r.id!=='string'||ids.has(r.id)){errors.push('공간 ID가 올바르지 않습니다.');continue;}ids.add(r.id);
    if(typeof r.name!=='string'||r.name.length>100||complete&&!r.name.trim())errors.push(`공간 ${index+1}의 이름을 입력해 주세요.`);
    if(!SPACE_TYPES.some(([k])=>k===r.kind))errors.push(`공간 ${index+1}의 용도를 선택해 주세요.`);
    if(r.customPurpose!=null&&(typeof r.customPurpose!=='string'||r.customPurpose.length>100||complete&&!r.customPurpose.trim()))errors.push(`공간 ${index+1}의 용도를 1~100자로 입력해 주세요.`);
    const size=roomDimensions(r);if(![size.width,size.depth].every(n=>Number.isFinite(n)&&n>=(complete?4:0)&&n<=150))errors.push(`${r.name||'공간 '+(index+1)}의 가로·세로는 4~150m로 입력해 주세요.`);
    if(r.capacity!==''&&r.capacity!=null&&(!Number.isFinite(Number(r.capacity))||Number(r.capacity)<0||Number(r.capacity)>60||complete&&(!Number.isInteger(Number(r.capacity))||Number(r.capacity)<1||r.kind==='meeting'&&(Number(r.capacity)<2||Number(r.capacity)>14))))errors.push(`${r.name||'공간 '+(index+1)}의 좌석 수를 확인해 주세요.`);
    if(!Array.isArray(r.products)||r.products.length>80){errors.push('공간별 제품은 최대 80종까지 입력할 수 있어요.');continue;}
    const products=new Set();for(const p of r.products){
      if(!p||typeof p.productId!=='string'){errors.push('제품 입력 형식이 올바르지 않습니다.');continue;}
      if(!assets[p.productId]?.physical||products.has(p.productId))errors.push(`${r.name||'공간 '+(index+1)}의 제품을 확인해 주세요.`);products.add(p.productId);
      if(!complete&&(p.quantity===''||p.quantity==null))continue;
      if(typeof p.quantity==='boolean'||!Number.isFinite(Number(p.quantity))||Number(p.quantity)<(complete?1:0)||Number(p.quantity)>30||complete&&!Number.isInteger(Number(p.quantity)))errors.push('제품 수량은 1~30개로 입력해 주세요.');
    }
    if(r.furniture!==undefined){
      if(!Array.isArray(r.furniture)||r.furniture.length>80){errors.push('공간별 가구는 최대 80종까지 입력해 주세요.');continue;}
      const seen=new Set();for(const item of r.furniture){
        if(!item||!furniture[item.assetId]?.physical||seen.has(item.assetId)){errors.push('공간의 가구를 확인해 주세요.');continue;}seen.add(item.assetId);
        if(!complete&&(item.quantity===''||item.quantity==null))continue;
        if(typeof item.quantity==='boolean'||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<1||Number(item.quantity)>30)errors.push('가구 수량은 1~30개로 입력해 주세요.');
      }
    }
  }
  return [...new Set(errors)];
}
export function packStudioRooms(rooms){
  const cols=roomGridColumns(rooms.length),rows=Math.ceil(rooms.length/cols),sizes=rooms.map(roomDimensions);
  const widths=Array.from({length:cols},(_,c)=>Math.max(...sizes.filter((_,i)=>i%cols===c).map(s=>s.width)));
  const depths=Array.from({length:rows},(_,r)=>Math.max(...sizes.slice(r*cols,(r+1)*cols).map(s=>s.depth)));
  const sum=values=>values.reduce((a,b)=>a+b,0);
  return {width:sum(widths)+(cols-1)*.22,depth:sum(depths)+(rows-1)*1.8,
    rectangles:sizes.map((s,i)=>({...s,x:sum(widths.slice(0,i%cols))+(i%cols)*.22,z:sum(depths.slice(0,Math.floor(i/cols)))+Math.floor(i/cols)*1.8}))};
}
export function createSceneFromForm(form,library,{documentId='draft'}={}){
  const errors=validateStudioForm(form,library,{complete:true});if(errors.length)throw new Error(errors[0]);
  const packed=packStudioRooms(form.rooms);if(packed.width>150||packed.depth>150)throw new Error('전체 공간이 150m를 넘습니다. 공간 크기나 수를 줄여 주세요.');
  const template={id:'studio-'+documentId,name:form.title.trim()||library.industries.find(i=>i.code===form.industry).name+' 공간 제안',
    industry:form.industry,scope:form.rooms.length>1?'full':'single',variant:'standard',custom:true,style:form.style,width:packed.width,depth:packed.depth,
    rooms:form.rooms.map((r,i)=>({key:r.id,name:r.name.trim(),kind:r.kind,purpose:r.customPurpose?.trim()||'',geometry:packed.rectangles[i],productIds:r.products.map(p=>p.productId),...(r.equipmentPolicyVersion?{spaceProfile:r.spaceProfile,equipmentPolicyVersion:r.equipmentPolicyVersion,...(r.includedSpaces?{includedSpaces:structuredClone(r.includedSpaces)}:{})}:{})})),
    source:{type:'studio-input',documentId,templateId:form.templateId||null}};
  let scene=createScene({templateId:template.id,style:form.style,variant:'standard',populatePeople:false,
    roomSettings:form.rooms.filter(r=>r.capacity!==''&&r.capacity!=null).map(r=>({roomId:r.id,capacity:Number(r.capacity)})),
    placements:form.rooms.flatMap(r=>r.products.map(p=>({roomId:r.id,productId:p.productId,quantity:Number(p.quantity),placementMode:'auto'}))),
    provenance:{kind:'structured-input'}}, {...library,templates:[...library.templates,template]});
  for(const input of form.rooms)if(input.customPurpose!=null){const room=scene.rooms.find(r=>r.id===input.id);room.customPurpose=input.customPurpose.trim();}
  const furniture=form.rooms.flatMap(room=>(room.furniture||[]).map(item=>({...item,roomId:room.id}))),byId=Object.fromEntries(library.assets.map(a=>[a.id,a]));
  furniture.sort((a,b)=>Number(byId[a.assetId].placement?.mode==='surface')-Number(byId[b.assetId].placement?.mode==='surface'));
  for(const item of furniture)for(let i=0;i<Number(item.quantity);i++){
    const before=new Set(scene.objects.map(o=>o.id));scene=addAsset(scene,item.assetId,item.roomId,library);
    const object=scene.objects.find(o=>!before.has(o.id)&&o.assetId===item.assetId);if(object)object.studioFurniture=true;
  }
  populateScenePeople(scene,library);scene.formKey=studioFormKey(form);scene.contentHash=sceneHash(scene);return scene;
}
export function studioFormFromScene(scene){
  return {version:1,title:scene.title,industry:scene.industry,style:scene.style,templateId:scene.source?.type==='reference-reconstruction'?scene.templateId:null,
    rooms:scene.rooms.map(r=>{
      const quantities=new Map();for(const object of scene.objects.filter(o=>o.roomId===r.id&&o.assetId.startsWith('product:')))quantities.set(object.assetId.slice(8),(quantities.get(object.assetId.slice(8))||0)+1);
      const furniture=new Map();for(const object of scene.objects.filter(o=>o.roomId===r.id&&o.studioFurniture))furniture.set(object.assetId,(furniture.get(object.assetId)||0)+1);
      return {id:r.id,name:r.name,kind:r.kind,kindEdited:true,...(r.equipmentPolicyVersion?{spaceProfile:r.spaceProfile,equipmentPolicyVersion:r.equipmentPolicyVersion,...(r.includedSpaces?{includedSpaces:structuredClone(r.includedSpaces)}:{})}:{}),...(r.customPurpose!=null?{customPurpose:r.customPurpose}:{}),width:r.width,depth:r.depth,capacity:r.capacity||'',products:[...quantities].map(([productId,quantity])=>({productId,quantity})),...(furniture.size?{furniture:[...furniture].map(([assetId,quantity])=>({assetId,quantity}))}:{})};
    })};
}
export function studioDocumentFromTemplate(template,library){
  const scene=createScene({templateId:template.id},library),form=studioFormFromScene(scene);
  form.templateId=template.id;scene.formKey=studioFormKey(form);scene.contentHash=sceneHash(scene);
  return {scene,form};
}
export function studioFormFromTemplate(template,library){
  return studioDocumentFromTemplate(template,library).form;
}
