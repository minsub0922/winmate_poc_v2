#!/usr/bin/env node
// Bake the building bird's-eye floors (app/web/src/building/bake.b64) from the spatial library.
// One floor = one spatial scene placed by the same composer (createScene). Best-scenario floors
// keep their published compositions; every taxonomy vertical adds the floors of its building
// (app/data/spatial/vertical-layouts.json → building.floors), so all of its spaces appear.
// Output: {v:3, src, styles, ind, recipes, assets, tpl} → gzip → base64 (format: building/data.js).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {STYLES} from '../web/src/domain/spatial/geometry.js';
import {peopleRenderGroups,partsBounds} from '../web/src/domain/spatial/people-placement-geometry.js';
import {templateDimensions} from '../web/src/domain/spatial/template-composition.js';
import {verticalTitle} from '../web/src/domain/spatial/template-catalog.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),flag=name=>args.includes(name),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const libraryPath=option('--library')||path.join(root,'app/data/spatial/library.json');
const bakePath=path.join(root,'app/web/src/building/bake.b64');
const library=JSON.parse(fs.readFileSync(libraryPath,'utf8'));
const layouts=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/vertical-layouts.json'),'utf8'));
const decode=text=>JSON.parse(zlib.gunzipSync(Buffer.from(text.trim(),'base64')).toString('utf8'));
// The published bake lists the best-scenario compositions (industry floors, coworking and mixed MX floors).
const previous=decode(fs.readFileSync(option('--compositions')||bakePath,'utf8'));
const assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),templates=new Map(library.templates.map(t=>[t.id,t]));
const r3=n=>Math.round(n*1000)/1000;
const SIZE={compact:'compact',standard:'standard',spacious:'spacious'};

function singleSpec(key,variant){
  const id=templates.has(`${key}-${variant}`)?`${key}-${variant}`:`cowork-${key}-${variant}`;
  const template=templates.get(id);if(!template)throw new Error('Missing single-space template for '+key);
  return structuredClone(template.rooms[0]);
}
// Rebuild one published best-scenario floor from its stored room list and layout kind.
function scenarioScene(entry){
  const family=entry.id.startsWith('cowork-')?'cowork':entry.ind.toLowerCase(),base=templates.get(`${family}-full-${entry.v}`);
  const keys=entry.rooms.map(r=>r[0]);
  if(entry.lay==='full')return createScene({templateId:base.id},library);
  if(['five','f4','b4','m4','bar'].includes(entry.lay))return createScene({templateId:base.id,roomKeys:keys},library);
  // Seventh-space and mixed floors: the full template with its rooms replaced by single-space rooms.
  const familyOf=key=>key.startsWith('cowork-')?'cowork':key.split('-')[0];
  const overview=key=>templates.get(`${familyOf(key)}-full-${entry.v}`)?.rooms.find(r=>r.key===key);
  const rooms=keys.map(key=>structuredClone(overview(key))||singleSpec(key,entry.v));
  const host=entry.lay==='mx'?templates.get(`${familyOf(keys[0])}-full-${entry.v}`):base;
  // A mixed (MX) floor is composed in the industry of its first room; its facade stays MX.
  const custom={...structuredClone(host),id:'bake-'+entry.id,industry:host.industry,style:entry.style,rooms,...templateDimensions(rooms.length)};
  return createScene({templateId:custom.id},{...library,templates:[...library.templates,custom]});
}
// A vertical building floor: the vertical's single-space rooms (repeats get their own keys).
function verticalScene(vertical,floor,variant){
  const seen=new Map(),rooms=floor.rooms.map(spaceId=>{
    const room=structuredClone(templates.get(`v-${spaceId}-${variant}`).rooms[0]),n=(seen.get(spaceId)||0)+1;seen.set(spaceId,n);
    if(n>1)room.key=`${spaceId}-${n}`;return room;
  });
  const host=templates.get(`v-${vertical.id}-${vertical.zones[0].key}-${variant}`);
  const custom={...structuredClone(host),id:`bake-${vertical.id}-${floor.key}`,name:`${layoutOf(vertical.id).label} · ${floor.name}`,scope:'full',rooms,...templateDimensions(rooms.length)};
  return createScene({templateId:custom.id},{...library,templates:[...library.templates,custom]});
}
const layoutOf=id=>layouts.verticals.find(v=>v.id===id);

const assetIndex=new Map(),bakedAssets=[],recipes={};
function assetRef(id){
  if(assetIndex.has(id))return assetIndex.get(id);
  const a=assets[id];if(!a)throw new Error('Unknown asset '+id);
  const key=a.recipe||a.kind,entry={id:a.id,n:a.name,s:a.size};
  if(library.recipes[key]){entry.r=key;recipes[key]=library.recipes[key];}else entry.p=a.parts;
  if(a.productId)entry.pid=a.productId;
  if(a.productId&&a.appearance?.bodyColor)entry.bc=a.appearance.bodyColor;
  entry.gt=a.geometryTransform;entry.c=a.category;
  assetIndex.set(id,bakedAssets.length);bakedAssets.push(entry);return assetIndex.get(id);
}
function person(group,owner){
  const b=partsBounds(group.body,owner),body=group.body.filter(p=>p.component==='person');
  return [r3((b.min[0]+b.max[0])/2),r3(b.min[1]),r3((b.min[2]+b.max[2])/2),r3(b.max[1]-b.min[1]),r3(Math.max(b.max[0]-b.min[0],b.max[2]-b.min[2])),
    body[0].material,body[1].material,body[2].material,body[4].material,group.person.mode==='seat'?1:0];
}
function bakeScene(scene,meta){
  const roomIndex=new Map(scene.rooms.map((r,i)=>[r.id,i]));
  const rooms=scene.rooms.map(r=>[r.id,r.name,r.kind,r.x,r.z,r.width,r.depth,r.outdoor?1:0,r.purpose||'']);
  const objs=[],ppl=[];
  for(const o of scene.objects){
    objs.push([assetRef(o.assetId),r3(o.x),r3(o.z),r3(o.elevation||0),r3(o.rotation||0),roomIndex.get(o.roomId)??-1,o.mount==='ceiling'?1:0]);
    for(const group of peopleRenderGroups(o,scene,assets))ppl.push(person(group,o));
  }
  return {...meta,style:scene.style,w:scene.width,d:scene.depth,rooms,objs,ppl};
}

const floors=[],mismatches=[];
for(const entry of previous.tpl.filter(t=>t.lay!=='vt')){
  const {objs,ppl,rooms,w,d,...meta}=entry;
  const baked=bakeScene(scenarioScene(entry),meta);
  if(flag('--check')){
    const before=JSON.stringify(entry.objs.map(o=>[previous.assets[o[0]].id,...o.slice(1)])),after=JSON.stringify(baked.objs.map(o=>[bakedAssets[o[0]].id,...o.slice(1)]));
    const diff=[before!==after&&'objs',JSON.stringify(entry.ppl)!==JSON.stringify(baked.ppl)&&'ppl',JSON.stringify(entry.rooms)!==JSON.stringify(baked.rooms)&&'rooms',(entry.w!==baked.w||entry.d!==baked.d)&&'size'].filter(Boolean);
    if(diff.length)mismatches.push(entry.id+':'+diff.join('+'));
    if(diff.length&&flag('--verbose')&&mismatches.length===1){const a=JSON.parse(before),b=JSON.parse(after);const i=a.findIndex((x,k)=>JSON.stringify(x)!==JSON.stringify(b[k]));console.log(entry.id,'obj',i,JSON.stringify(a[i]),JSON.stringify(b[i]));const j=entry.ppl.findIndex((x,k)=>JSON.stringify(x)!==JSON.stringify(baked.ppl[k]));console.log('ppl',j,JSON.stringify(entry.ppl[j]),JSON.stringify(baked.ppl[j]));}
  }
  floors.push(baked);
}
const verticalFloors=[];
if(!flag('--scenario-only'))for(const vertical of library.verticals||[]){
  const layout=layoutOf(vertical.id),variant=SIZE[layout.size]||'standard';
  for(const floor of layout.building.floors){
    const scene=verticalScene(vertical,floor,variant);
    verticalFloors.push(bakeScene(scene,{id:`vt-${vertical.id}-${floor.key}`,ind:vertical.group,name:floor.name,lay:'vt',v:variant,vt:vertical.id,vl:layout.label,...(layout.sign?{sign:layout.sign}:{})}));
  }
}
if(flag('--check')){console.log(JSON.stringify({checked:previous.tpl.length,mismatches}));if(mismatches.length&&!flag('--write'))process.exit(1);}

const groups=Object.entries(layouts.groups).map(([code,g])=>({code,name:g.name}));
const ind=[...library.industries.filter(i=>!groups.some(g=>g.code===i.code)),...groups,{code:'MX',name:'복합 · 근린생활'}];
const styles=Object.fromEntries(Object.entries(STYLES).map(([k,s])=>[k,{name:s.name,floor:s.floor,wood:s.wood,fabric:s.fabric,cushion:s.cushion,wall:s.wall,accent:s.accent}]));
const data={v:3,src:`winmate-spatial-1 · library ${library.sourceHash} · geometry v${library.geometryVersion}`,styles,ind,recipes,assets:bakedAssets,tpl:[...floors,...verticalFloors]};
const json=JSON.stringify(data),packed=zlib.gzipSync(Buffer.from(json),{level:9}).toString('base64');
// Building templates per vertical: its floors stacked from the ground up with the vertical's facade.
const presets=(library.verticals||[]).map(vertical=>{
  const layout=layoutOf(vertical.id),fv=layout.building.fv;
  return {id:'vt-'+vertical.id,ind:vertical.group,fv,title:verticalTitle({label:layout.label,sizeSegment:vertical.sizeSegment}),vertical:vertical.id,floors:layout.building.stack.map(key=>({tpl:`vt-${vertical.id}-${key}`,fv}))};
});
const presetSource=['// 생성 파일 — app/scripts/build_building_bake.mjs가 app/data/spatial/vertical-layouts.json으로 만든다. 직접 고치지 않는다.',
  '// 버티컬 건물 템플릿: 업종 → 버티컬(규모) → 공간. 층 = bake의 vt-* 층(그 버티컬 공간 조합), 아래층부터. 모든 공간이 한 번 이상 들어간다.',
  'export const VERTICAL_PRESETS = [',...presets.map(p=>'  '+JSON.stringify(p)+','),'];',''].join('\n');
if(flag('--write')||!flag('--check')){
  fs.writeFileSync(bakePath+'.'+process.pid+'.tmp',packed+'\n');fs.renameSync(bakePath+'.'+process.pid+'.tmp',bakePath);
  fs.writeFileSync(path.join(root,'app/web/src/building/presets-verticals.js'),presetSource);
}
console.log(JSON.stringify({presets:presets.length,floors:data.tpl.length,scenario:floors.length,vertical:verticalFloors.length,assets:bakedAssets.length,recipes:Object.keys(recipes).length,jsonBytes:json.length,base64Bytes:packed.length,src:data.src}));
