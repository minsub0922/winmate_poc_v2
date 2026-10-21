#!/usr/bin/env node
// Rebuild the complete spatial library from local catalog data. Byte-stable output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES, FURNITURE, GEOMETRY_VERSION } from '../web/src/domain/spatial/geometry.js';
import { PEOPLE_SCENES,PEOPLE_CATEGORIES } from '../web/src/domain/spatial/people-scenes.js';
import {PEOPLE_LAYOUT_VERSION} from '../web/src/domain/spatial/people-placement-geometry.js';
import { prepareSpatialAppearance } from './spatial_appearance.mjs';
import { spatialRecipeTransform,spatialPartGeometry,spatialPartPosition } from '../web/src/domain/spatial/part-geometry.js';
import { createScene, roomKind, inferProducts, fingerprint, sceneHash } from '../web/src/domain/spatial/scene.js';
import {TEMPLATE_COMPOSITION_VERSION,TEMPLATE_ROOM,templateDimensions,sixRoomOverview,evenRoomSubset} from '../web/src/domain/spatial/template-composition.js';
import {equipSpace,SPACE_EQUIPMENT_VERSION} from '../web/src/domain/spatial/space-equipment.js';
import { buildSpatialTemplateCatalog } from '../web/src/domain/spatial/template-catalog.js';
import { PHOTO_META } from '../web/src/domain/templates/photo_layouts.js';
import { STD_META } from '../web/src/domain/templates/std_layouts.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),dir=path.join(root,'app/data/spatial');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'app/data/catalog.json'),'utf8'));
const products=read('product-objects.json'),sources=read('industry-sources.json');
const appearance=await prepareSpatialAppearance(products.assets,root);
const assets=[...products.assets.map(a=>({...a,frontAxis:[0,0,1]})),...FURNITURE,...PEOPLE_SCENES];
const transforms=new Map();
for(const asset of assets){
  const key=asset.recipe||asset.kind,parts=RECIPES[key]||asset.parts;
  if(!parts?.length)throw new Error('Missing geometry recipe '+key+' for '+asset.id);
  if(!transforms.has(key))transforms.set(key,spatialRecipeTransform(parts));
  asset.geometryTransform=transforms.get(key);
  if(asset.compositionSpace==='metres')asset.size=asset.geometryTransform.scale.map(n=>1/n);
  if(!asset.productId&&(['sofa','bed','hospitalbed','chair','taskchair'].includes(asset.kind)||asset.supportSurface==='tray')){
    const tops=[];
    for(const part of parts){const geometry=spatialPartGeometry(part,asset.size,asset.geometryTransform);geometry.computeBoundingBox();const pos=spatialPartPosition(part,asset),bounds=geometry.boundingBox;
      if(bounds.min.x+pos[0]<=asset.size[0]*.25&&bounds.max.x+pos[0]>=-asset.size[0]*.25&&bounds.min.z+pos[2]<=0&&bounds.max.z+pos[2]>=0)tops.push(bounds.max.y+pos[1]);geometry.dispose();}
    if(tops.length)asset.supportSurfaceHeight=Math.max(...tops);
  }
  const thumbnailKey=[GEOMETRY_VERSION,key,asset.size,asset.appearance,asset.geometryTransform,parts];
  if(asset.previewCamera)thumbnailKey.push(asset.previewCamera);
  asset.thumbnail='/assets/spatial-objects/object-'+fingerprint(thumbnailKey)+'.webp';
}
const templates=[];
const styleFor=code=>['MD'].includes(code)?'clinical':['MF','AD','PB'].includes(code)?'industrial':['HT','FN','RT','VN'].includes(code)?'premium':code==='OF'?'modern':'warm';
const industries=catalog.industries.map(i=>({code:i.code,name:i.name}));
for(const ind of industries){
  const source=sources.find(s=>s.code===ind.code);
  if(!source)throw new Error('Missing source '+ind.code);
  const rooms=source.rooms.map(r=>equipSpace({...r,kind:roomKind(r.name),productIds:inferProducts(r.productsText,products.assets)},ind.code));
  // Keep every original space traceable within the six-room overview.
  const definitions=[{key:ind.code.toLowerCase()+'-full',name:ind.name+' · 전체 맵',scope:'full',rooms:sixRoomOverview(rooms,ind.code)},
    ...rooms.map(r=>({key:r.key,name:r.name,scope:'single',rooms:[r]}))];
  for(const def of definitions)for(const variant of ['compact','standard','spacious']){
    templates.push({id:`${def.key}-${variant}`,name:def.name,industry:ind.code,scope:def.scope,variant,rooms:def.rooms,
      ...templateDimensions(def.rooms.length),compositionVersion:TEMPLATE_COMPOSITION_VERSION,roomReference:TEMPLATE_ROOM,style:styleFor(ind.code),source:{layoutId:source.source,type:'reference-reconstruction',note:'원본 장표의 공간·제품 구성 기반 · 사진의 실측 좌표는 제공되지 않음'}});
  }
}
const officeRooms=[
  {key:'cowork-lobby',name:'입구 / 로비',kind:'reception',productIds:['thewall','qm55c','kiosk'],purpose:'방문 안내 · 체크인'},
  {key:'cowork-work',name:'업무 공간',kind:'office',productIds:['smartmonitor','book','ac360'],purpose:'개인 업무 · 집중'},
  {key:'cowork-meet',name:'미팅룸',kind:'meeting',productIds:['flip','wf1way','tabs11'],purpose:'협업 · 화상 회의'},
  {key:'cowork-cafe',name:'라운지 / 카페',kind:'lounge',productIds:['purifier','airdresser','qm55c'],purpose:'휴식 · 입주사 교류'},
  {key:'cowork-project',name:'프로젝트 룸',kind:'meeting',capacity:4,productIds:['flip','book','wf1way'],purpose:'프로젝트 협업 · 팀 작업'},
  {key:'cowork-admin',name:'관리자 공간',kind:'office',productIds:['smartmonitor','tabs11','dvms2'],purpose:'기기·지점 운영 관리'},
].map(r=>equipSpace(r,'OF'));
for(const variant of ['compact','standard','spacious'])for(const rooms of [officeRooms,...officeRooms.map(r=>[r])])templates.push({
  id:`cowork-${rooms.length>1?'full':rooms[0].key}-${variant}`,name:rooms.length>1?'공유오피스 · 공간별 맞춤 제안':rooms[0].name,industry:'OF',scope:rooms.length>1?'full':'single',variant,rooms,
  ...templateDimensions(rooms.length),compositionVersion:TEMPLATE_COMPOSITION_VERSION,roomReference:TEMPLATE_ROOM,style:'modern',source:{layoutId:'L_SOL_03',scenarioId:'bs22',type:'reference-reconstruction',note:'공유오피스 Lite 공간 지도와 공간별 제품 장표 기반 · 개념 재구성'},
});

// Every existing spatial/product layout has a traceable scene, never an anonymous image.
const metas=[...catalog.layouts,...PHOTO_META,...STD_META];
const cases=[];
const inferIndustry=meta=>{
  if(meta.ind)return meta.ind;
  const text=[meta.sample,meta.name,meta.hl].join(' ');
  const rules=[['ED',/대학교|중학교|캠퍼스/],['MD',/요양|병원/],['MF',/물류|콜드체인/],['FN',/은행|보험/],['HT',/호텔|리조트|비즈니스/],['VN',/시네마|컨벤션|영화관/],['AD',/미디어/],['PB',/구청|지자체/],['RS',/건설|리빙/],['ID',/키친/],['TP',/테마파크/],['RT',/리테일|백화점|패션|마트|복합몰|라이프/],['OF',/빌딩|사옥/]];
  return rules.find(([,re])=>re.test(text))?.[0]||'FB';
};
for(const meta of metas.filter(m=>['scenario','products','dss','specs'].includes(m.p)&&!/^L_SPATIAL_/.test(m.f))){
  const industry=inferIndustry(meta);
  const pool=templates.filter(t=>t.industry===industry&&t.variant==='standard'&&t.scope==='single'&&!t.id.startsWith('case-'));
  if(!pool.length)continue;
  const text=[meta.name,meta.hl,...(meta.ih||[])].join(' ');
  const score=t=>t.rooms[0].name.split(/[ ·/]+/).filter(w=>w.length>1&&text.includes(w)).reduce((n,w)=>n+w.length,0);
  const chosen=[...pool].sort((a,b)=>score(b)-score(a))[0];
  const count=[['두 공간',2],['세 공간',3],['네 공간',4],['여섯 공간',6],['공간 3개',3]].find(([text])=>meta.name.includes(text))?.[1];
  const full=!!count||/공간 맵|공간 지도|전체 구성|전 층|일곱 공간|여섯 공간|층별|여러 공간|한 세대|세대 패키지/.test(meta.name);
  const base=full?templates.find(t=>t.industry===industry&&t.variant==='standard'&&t.scope==='full'):chosen;
  const exact=/^L_SOL_/.test(meta.f)?officeRooms.find(r=>text.includes(r.name)||r.name.split(' / ').some(w=>w.length>2&&text.includes(w))):null;
  const rooms=exact?[structuredClone(exact)]:evenRoomSubset(base.rooms,count||base.rooms.length);
  const template={...base,id:'case-'+meta.f,name:meta.name,scope:rooms.length>1?'full':'single',variant:'standard',rooms,
    ...templateDimensions(rooms.length),source:{layoutId:meta.f,type:'reference-reconstruction',industryInferred:!meta.ind,note:'기존 공간·제품 장표의 명칭·제품 ID 기반 재구성 · 원본 사진과 동일한 실측 배치는 아님'}};
  templates.push(template);cases.push({id:template.id,layoutId:meta.f,name:meta.name,industry,scope:template.scope,productIds:rooms.flatMap(r=>r.productIds),sourceProductIds:meta.prods||[],omittedSourceProducts:(meta.prods||[]).filter(id=>!rooms.some(r=>r.productIds.includes(id))).map(productId=>({productId,reason:'공간 용도별 필수 기기 구성으로 재선정 · 원본 장표의 제품 참조는 보존'})),roomKeys:rooms.map(r=>r.key)});
}
const library={version:1,templateDefaults:{scope:'full',roomCount:6,compositionVersion:TEMPLATE_COMPOSITION_VERSION},geometryVersion:GEOMETRY_VERSION,peopleLayoutVersion:PEOPLE_LAYOUT_VERSION,equipmentPolicyVersion:SPACE_EQUIPMENT_VERSION,license:'CC0-1.0',referenceImageLicense:'Manufacturer product imagery; original rights retained',renderer:'Three.js (MIT) · SVG',industries,recipes:RECIPES,assets,templates,cases};
const scenes={},errors=[];
for(const template of templates){
  try{scenes[template.id]=createScene({templateId:template.id},library);}
  catch(error){errors.push({id:template.id,error:error.message});}
}
if(errors.length){console.error(JSON.stringify(errors.slice(0,25),null,2));throw new Error(`${errors.length} spatial scenes failed validation`);}
library.templateCatalog=buildSpatialTemplateCatalog(library,scenes);
library.counts={industries:industries.length,products:products.assets.length,furniture:FURNITURE.filter(a=>a.catalogVisible!==false).length,furnitureCategories:[...new Set(FURNITURE.filter(a=>a.catalogVisible!==false).map(a=>a.category))],templates:templates.length,cases:cases.length,
  distinctTemplates:library.templateCatalog.length,
  people:PEOPLE_SCENES.length,peopleCategories:PEOPLE_CATEGORIES,
  single:templates.filter(t=>t.scope==='single').length,full:templates.filter(t=>t.scope==='full').length,
  measured:products.assets.filter(a=>a.dimensionSource==='catalog-spec').length,logical:products.assets.filter(a=>!a.physical).length};
library.sourceHash=fingerprint([products.catalogSha256,sources,metas.map(m=>[m.f,m.prods,m.name]),RECIPES,assets,templates,library.templateCatalog,
  fs.readFileSync(path.join(root,'app/web/src/domain/spatial/scene.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/space-dressing.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/slide-binding.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/space-equipment.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/natural-layout.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/furniture-catalog.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/detail-objects.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/detail-placement.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/template-composition.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/people-layout.js'),'utf8'),fs.readFileSync(path.join(root,'app/web/src/domain/spatial/people-placement-geometry.js'),'utf8')]);
for(const scene of Object.values(scenes)){scene.assetRevision=library.sourceHash;scene.contentHash=sceneHash(scene);}
fs.writeFileSync(path.join(dir,'library.json'),JSON.stringify(library)+'\n');
const versionDirectory=path.join(dir,'versions');fs.mkdirSync(versionDirectory,{recursive:true});
const versionPath=path.join(versionDirectory,library.sourceHash+'.json');
const frozen=JSON.stringify(library)+'\n';
if(fs.existsSync(versionPath)&&fs.readFileSync(versionPath,'utf8')!==frozen)throw new Error('Immutable spatial asset revision collision');
if(!fs.existsSync(versionPath))fs.writeFileSync(versionPath,frozen);
fs.writeFileSync(path.join(dir,'scenes.json'),JSON.stringify(scenes)+'\n');
const exampleIds=['cowork-full-standard','fb-full-standard','ht-hero-standard','rt-full-standard','ed-hero-standard','md-full-standard','fn-hero-standard','rs-full-standard','mf-full-standard','cowork-cowork-meet-standard'];
const examples=exampleIds.map((templateId,i)=>({id:`spatial-example-${i+1}`,title:['공유오피스 · 공간별 맞춤 제안','카페 · 고객 동선과 제품 배치','호텔 객실 · 프리미엄 스테이','리테일 · 브랜드 플래그십','캠퍼스 · 스마트 강의실','의료 · 요양 케어 환경','금융 · 디지털 창구','주거 · 세대 전체 가전 구성','제조 · 물류 운영 맵','공유오피스 · 협업 미팅룸'][i],view:i%2?'2d':'3d',scene:{...scenes[templateId],title:['공유오피스 · 공간별 맞춤 제안','카페 · 고객 동선과 제품 배치','호텔 객실 · 프리미엄 스테이','리테일 · 브랜드 플래그십','캠퍼스 · 스마트 강의실','의료 · 요양 케어 환경','금융 · 디지털 창구','주거 · 세대 전체 가전 구성','제조 · 물류 운영 맵','공유오피스 · 협업 미팅룸'][i]}}));
for(const e of examples){if(!e.scene.rooms)throw new Error('Missing example '+e.id);e.scene.contentHash=sceneHash(e.scene);}
fs.writeFileSync(path.join(dir,'examples.json'),JSON.stringify(examples)+'\n');
const published=path.join(root,'app/web/public/assets/spatial-current.json');
fs.mkdirSync(path.dirname(published),{recursive:true});
fs.writeFileSync(published+'.'+process.pid+'.tmp',JSON.stringify({sourceHash:library.sourceHash})+'\n');fs.renameSync(published+'.'+process.pid+'.tmp',published);
console.log(JSON.stringify({...library.counts,...appearance,sceneBytes:fs.statSync(path.join(dir,'scenes.json')).size,sourceHash:library.sourceHash}));
