import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createScene,moveObject,validateScene,focusScene} from '../web/src/domain/spatial/scene.js';
import {studioDocumentFromTemplate,createSceneFromForm} from '../web/src/domain/spatial/studio-form.js';
import {applySpatialEdit} from '../web/src/domain/spatial/edit.js';
import {populateScenePeople} from '../web/src/domain/spatial/people-layout.js';
import {peopleInScene,peopleSource,peopleObjectError,peopleRenderGroups,partsBounds} from '../web/src/domain/spatial/people-placement-geometry.js';
import {planSvg} from '../web/src/domain/spatial/plan-svg.js';
import {embedSpatial,addNativePlan} from '../web/src/domain/spatial/slide-binding.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),scenes=JSON.parse(fs.readFileSync(new URL('../data/spatial/scenes.json',import.meta.url))),assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
let total=0,occupied=0,empty=0;
const coverage=[];
for(const template of library.templates){
 const scene=scenes[template.id],generated=createScene({templateId:template.id},library),people=peopleInScene(scene,assets);
 assert.deepEqual(generated,scene,template.id+' deterministic population');
 const unpopulated=createScene({templateId:template.id,populatePeople:false},library),base=structuredClone(scene);for(const o of base.objects)delete o.people;
 assert.deepEqual(base.objects,unpopulated.objects,template.id+' original furniture, products, positions and quantities unchanged');
 assert.deepEqual(validateScene(scene,library).errors,[],template.id);
 const again=structuredClone(scene);populateScenePeople(again,library);assert.deepEqual(again,scene,template.id+' idempotent');
 for(const room of scene.rooms){
  const roomPeople=people.filter(p=>p.roomId===room.id);if(roomPeople.length)occupied++;else empty++;
  if(library.peopleLayoutVersion>=2)assert(roomPeople.length>0,template.id+' '+room.name+' must contain a suitable occupant');
  else if(room.kind==='utility'||/冷蔵|냉장|냉동|보관|실외기|열원|기계실|천장|겉옷|랜드마크 외벽|건물 외벽|거리 미디어폴/.test(room.name))assert.equal(roomPeople.length,0,room.name+' legacy occupancy');
  for(const object of scene.objects.filter(o=>o.roomId===room.id&&o.people?.length))assert.equal(peopleObjectError(object,room,scene.objects,assets),null,template.id+' people clearance');
 }
 for(const p of people){assert(peopleSource(p,assets));assert(p.scale>=.7&&p.scale<=1.12);if(p.mode==='seat')assert.equal(peopleSource(p,assets).actor.pose,'sit');}
 assert.equal((planSvg(scene,library,{width:640,height:410}).match(/data-person-role=/g)||[]).length,people.length,template.id+' SVG includes each real occupant');
 total+=people.length;coverage.push({id:template.id,industry:template.industry,people:people.length});
}
assert(occupied>empty,'populate most suitable rooms');assert.equal(empty,0,'latest templates populate every room');
for(const i of library.industries)assert(coverage.some(t=>t.industry===i.code&&t.people>0),i.name+' coverage');
const education=scenes['ed-full-standard'],medical=scenes['md-full-standard'];
for(const room of education.rooms.filter(r=>r.kind==='classroom')){const p=peopleInScene(education,assets).filter(p=>p.roomId===room.id);assert(p.some(p=>p.roleId==='teacher'));assert(p.filter(p=>p.roleId==='student').length>=2);}
for(const room of medical.rooms.filter(r=>/병실|진료실/.test(r.name))){const p=peopleInScene(medical,assets).filter(p=>p.roomId===room.id);assert(p.some(p=>p.roleId==='doctor'));assert(p.some(p=>p.roleId==='patient'));}
assert(peopleInScene(scenes['fb-full-standard'],assets).some(p=>p.meal),'actual dishes with eating gestures');
const office=createScene({templateId:'cowork-cowork-work-standard',roomSettings:[{roomId:'cowork-work',capacity:1}]},library),chair=office.objects.find(o=>o.people?.length),desk=office.objects.find(o=>o.id===chair.facing?.targetId);
assert(chair&&desk);const moved=moveObject(office,desk.id,{x:5.25,z:4.5},library),rotated=moveObject(moved,desk.id,{rotation:90},library);
assert.deepEqual(rotated.objects.find(o=>o.id===chair.id).people,chair.people,'desk movement and rotation carry the same occupant recipe');assert.deepEqual(validateScene(rotated,library).errors,[]);
const removed=applySpatialEdit(rotated,{operations:[{type:'remove',objectId:desk.id}]},library);assert(!removed.objects.find(o=>o.id===chair.id).people,'deleted work target removes its attached role rather than leaving invalid references');
const template=library.templates.find(t=>t.id==='ed-full-standard'),document=studioDocumentFromTemplate(template,library),regenerated=createSceneFromForm(document.form,library);
assert(peopleInScene(regenerated,assets).some(p=>p.roleId==='teacher'));assert(peopleInScene(regenerated,assets).some(p=>p.roleId==='student'));
const old={...library};delete old.peopleLayoutVersion;assert.equal(peopleInScene(createScene({templateId:'ed-full-standard'},old),assets).length,0,'archived libraries retain their original unoccupied layout');
const invalid=structuredClone(office);invalid.objects.find(o=>o.id===chair.id).people[0].offset[0]=100;assert(validateScene(invalid,library).errors.length,'out-of-room occupants rejected');
const out=new URL('./output/'+(process.env.SPATIAL_PEOPLE_LAYOUT_OUTPUT||'spatial-people-layout')+'/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const require=createRequire(new URL('../web/package.json',import.meta.url)),Pptx=require('pptxgenjs'),Zip=require('jszip'),pptx=new Pptx();pptx.layout='LAYOUT_WIDE';
const classroom=focusScene(education,education.rooms.find(r=>r.kind==='classroom').id),binding=embedSpatial(classroom,library);
assert.equal((planSvg(binding.scene,binding.library).match(/data-person-role=/g)||[]).length,peopleInScene(classroom,assets).length,'portable binding retains frozen actor recipes');
const slide=pptx.addSlide();addNativePlan(slide,binding,{x:64,y:160,w:820,h:490},pptx.ShapeType);const ppt=await pptx.write({outputType:'nodebuffer'});fs.writeFileSync(new URL('people-template-2d.pptx',out),ppt);
const zip=await Zip.loadAsync(ppt),xml=await zip.file('ppt/slides/slide1.xml').async('string');assert(xml.includes('occupant-0-teacher'));assert(xml.includes('occupant-0-student'));assert((xml.match(/<a:custGeom>/g)||[]).length>100,'actual editable person polygons exported');
fs.writeFileSync(new URL('layout-unit-report.json',out),JSON.stringify({ok:true,sourceHash:library.sourceHash,templates:coverage.length,populatedTemplates:coverage.filter(t=>t.people).length,people:total,occupiedRooms:occupied,emptyRooms:empty,nativePptPersonShapes:(xml.match(/<a:custGeom>/g)||[]).length,checkedAt:new Date().toISOString()},null,2));
console.log(`PASS ${coverage.length} templates / ${total} people in ${occupied} rooms; ${empty} empty rooms, all industries, furniture/products preserved, body/door clearances, actual SVG, linked edits, regeneration and frozen revisions`);
