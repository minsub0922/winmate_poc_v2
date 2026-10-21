import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {embedSpatial,addNativePlan} from '../web/src/domain/spatial/slide-binding.js';
import {createScene,validateScene,inspectNaturalLayout,focusScene} from '../web/src/domain/spatial/scene.js';
import {studioDocumentFromTemplate,createSceneFromForm} from '../web/src/domain/spatial/studio-form.js';
import {peopleInScene,peopleObjectError,peopleRenderGroups,partsBounds} from '../web/src/domain/spatial/people-placement-geometry.js';
import {TEMPLATE_ROOM} from '../web/src/domain/spatial/template-composition.js';
import {planSvg} from '../web/src/domain/spatial/plan-svg.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),scenes=JSON.parse(fs.readFileSync(new URL('../data/spatial/scenes.json',import.meta.url))),assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
const before=JSON.parse(fs.readFileSync(new URL('../data/spatial/versions/89960d42.json',import.meta.url)));
const close=(a,b)=>Math.abs(a-b)<.00011;
let rooms=0,occupants=0;const coverage=[];
for(const template of library.templates){
 const scene=createScene({templateId:template.id},library),people=peopleInScene(scene,assets),scale={compact:.85,standard:1,spacious:1.25}[template.variant];
 assert.deepEqual(scene,scenes[template.id],template.id+' deterministic');
 assert.deepEqual(validateScene(scene,library).errors,[],template.id+' geometry');
 assert.deepEqual(inspectNaturalLayout(scene,library).issues,[],template.id+' facing and chair clearance');
 assert.equal(scene.peopleLayout.occupiedRooms,scene.rooms.length);
 for(const room of scene.rooms){
  rooms++;const placed=people.filter(p=>p.roomId===room.id);assert(placed.length,template.id+' '+room.name+' occupancy');occupants+=placed.length;
  assert(close(room.width,TEMPLATE_ROOM.width*scale)&&close(room.depth,TEMPLATE_ROOM.depth*scale),template.id+' same scale in overview and single room');
  for(const object of scene.objects.filter(o=>o.roomId===room.id&&o.people?.length)){
   assert.equal(peopleObjectError(object,room,scene.objects,assets),null);
   for(const group of peopleRenderGroups(object,scene,assets)){
    const b=partsBounds(group.body,object),height=b.max[1]-b.min[1];
    if(group.person.mode==='stand')assert(height>1.6&&height<2.05,'standing people retain adult scale');
   }
  }
 }
 assert.equal((planSvg(scene,library,{width:640,height:410}).match(/data-person-role=/g)||[]).length,people.length,'2D includes actual actors');
}
for(const industry of library.industries){
 const template=library.templates.find(t=>t.id===industry.code.toLowerCase()+'-full-standard'),scene=scenes[template.id];assert.equal(scene.rooms.length,6);
 const document=studioDocumentFromTemplate(template,library),rebuilt=createSceneFromForm(document.form,library);assert.deepEqual(validateScene(rebuilt,library).errors,[]);assert.deepEqual(inspectNaturalLayout(rebuilt,library).issues,[]);
 assert(rebuilt.rooms.every(r=>rebuilt.objects.some(o=>o.roomId===r.id&&o.people?.length)),'regeneration keeps every room occupied');
 coverage.push({industry:industry.code,rooms:scene.rooms.map(r=>({id:r.id,name:r.name,size:[r.width,r.depth],people:peopleInScene(scene,assets).filter(p=>p.roomId===r.id).map(p=>({role:p.role,roleId:p.roleId,source:p.sourceAssetId,scale:p.scale}))}))});
 for(const room of scene.rooms)assert.deepEqual(validateScene(focusScene(scene,room.id),library).errors,[],'room focus keeps the same physical transforms');
}
for(const a of before.assets){assert.deepEqual(assets[a.id].size,a.size,a.id+' original physical size');if(a.assetGroup==='people')assert.deepEqual(assets[a.id].parts,a.parts,a.id+' frozen actor recipe');}
const oldScenes=JSON.parse(fs.readFileSync(new URL('./fixtures/spatial/composition-v2-scenes.json',import.meta.url)));
for(const id of ['ed-full-compact','ht-full-standard','ad-full-standard'])assert.deepEqual(createScene({templateId:id},before),oldScenes[id],id+' old population and scale policy unchanged');
for(const role of ['technician','electrician','laundry','coatkeeper','coldstore'])assert(library.assets.some(a=>a.actors?.some(p=>p.roleId===role)));
assert(library.counts.people>=164);
const out=new URL('./output/'+(process.env.SPATIAL_ALL_ROOMS_OUTPUT||'spatial-all-rooms')+'/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const require=createRequire(new URL('../web/package.json',import.meta.url)),Pptx=require('pptxgenjs'),Zip=require('jszip'),pptx=new Pptx();pptx.layout='LAYOUT_WIDE';
const garment=focusScene(scenes['fb-full-standard'],'fb-5'),binding=embedSpatial(garment,library);addNativePlan(pptx.addSlide(),binding,{x:64,y:160,w:820,h:490},pptx.ShapeType);
const ppt=await pptx.write({outputType:'nodebuffer'}),zip=await Zip.loadAsync(ppt),xml=await zip.file('ppt/slides/slide1.xml').async('string');assert(xml.includes('occupant-0-coatkeeper'),'new profession exports actual native PPT geometry');fs.writeFileSync(new URL('garment-native.pptx',out),ppt);
fs.writeFileSync(new URL('coverage.json',out),JSON.stringify({ok:true,sourceHash:library.sourceHash,templates:library.templates.length,rooms,occupants,emptyRooms:0,standardSize:[TEMPLATE_ROOM.width,TEMPLATE_ROOM.depth],newPeopleAssets:library.counts.people-before.counts.people,coverage},null,2));
console.log(`PASS ${library.templates.length} templates / ${rooms} occupied rooms / ${occupants} people; exact variant scales, 2D, regeneration, legacy policies and immutable actor sizes`);
