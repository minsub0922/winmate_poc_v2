import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,validateScene,inspectNaturalLayout} from '../web/src/domain/spatial/scene.js';
import {createSceneFromForm,studioDocumentFromTemplate} from '../web/src/domain/spatial/studio-form.js';
import {WORK_MONITOR,STUDENT_TABLET} from '../web/src/domain/spatial/space-equipment.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),scenes=JSON.parse(fs.readFileSync(new URL('../data/spatial/scenes.json',import.meta.url)));
const assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),coverage=[];
for(const template of library.templates){
 const scene=createScene({templateId:template.id},library);
 assert.deepEqual(scene,scenes[template.id],template.id+' deterministic generation');
 assert.deepEqual(validateScene(scene,library).errors,[],template.id);
 assert.deepEqual(inspectNaturalLayout(scene,library).issues,[],template.id+' approach and facing');
 for(const room of scene.rooms){
  const objects=scene.objects.filter(o=>o.roomId===room.id),desks=objects.filter(o=>assets[o.assetId].kind==='desk'),products=objects.filter(o=>assets[o.assetId].productId);
  if(['office','operations','administration','bank','nursing','computerlab','laboratory'].includes(room.spaceProfile)){
   const monitors=products.filter(o=>o.assetId==='product:'+WORK_MONITOR);
   assert.equal(monitors.length,desks.length,template.id+' one monitor per workstation');
   assert.deepEqual(new Set(monitors.map(o=>o.supportId)),new Set(desks.map(o=>o.id)),template.id+' distinct desk supports');
  }
  if(['classroom','digitalclass','homestudy'].includes(room.spaceProfile)){
   const tablets=products.filter(o=>o.assetId==='product:'+STUDENT_TABLET);
   assert.equal(tablets.length,desks.length,template.id+' one learning tablet per pupil');
   assert.equal(new Set(tablets.map(o=>o.supportId)).size,desks.length);
   assert(products.some(o=>o.assetId==='product:purifier'));
   if(room.kind==='classroom')assert.equal(products.filter(o=>assets[o.assetId].kind==='display').length,1,'one shared teaching screen');
  }
  if(room.spaceProfile==='operations')assert(products.some(o=>o.assetId==='product:qm65c'),'operations shared dashboard');
  if(room.kind!=='utility')assert(!products.some(o=>['outdoorac','chiller'].includes(assets[o.assetId].kind)),'plant equipment belongs in a facility zone');
  for(const o of products)assert(o.placementReason,template.id+' product has a purpose');
 }
}
for(const industry of library.industries){
 const template=library.templates.find(t=>t.id===industry.code.toLowerCase()+'-full-standard'),scene=scenes[template.id];assert.equal(scene.rooms.length,6);
 assert(scene.rooms.every(r=>r.width===8.98&&r.depth===7.7));
 coverage.push({industry:industry.code,rooms:scene.rooms.map(r=>({name:r.name,profile:r.spaceProfile,size:[r.width,r.depth],products:scene.objects.filter(o=>o.roomId===r.id&&assets[o.assetId].productId).map(o=>({id:o.assetId,name:assets[o.assetId].name,reason:o.placementReason,support:o.supportId}))}))});
 const document=studioDocumentFromTemplate(template,library),regenerated=createSceneFromForm(document.form,library);
 assert.deepEqual(validateScene(regenerated,library).errors,[],industry.code+' structured form round trip');
 assert.deepEqual(inspectNaturalLayout(regenerated,library).issues,[],industry.code+' regenerated circulation');
 for(const room of scene.rooms)assert.deepEqual(regenerated.objects.filter(o=>o.roomId===room.id&&assets[o.assetId].productId).map(o=>o.assetId).sort(),scene.objects.filter(o=>o.roomId===room.id&&assets[o.assetId].productId).map(o=>o.assetId).sort(),industry.code+' product quantities survive regeneration');
}
const frozen=JSON.parse(fs.readFileSync(new URL('../data/spatial/versions/cd6d88bb.json',import.meta.url)));
assert(frozen.templates.find(t=>t.id==='fb-full-standard').roomReference.width===9.45,'previous revision remains immutable');
for(const a of frozen.assets)assert.deepEqual(assets[a.id].size,a.size,a.id+' physical object size retained');
const out=new URL('./output/spatial-purpose/',import.meta.url);fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(new URL('coverage.json',out),JSON.stringify({ok:true,sourceHash:library.sourceHash,templates:library.templates.length,standardSize:[8.98,7.7],coverage},null,2));
console.log(`PASS ${library.templates.length} purpose-based templates, workstation screens, school tablets, natural placement, frozen dimensions and 16 industry form round trips`);
