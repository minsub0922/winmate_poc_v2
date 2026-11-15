// 공간 추가 · 삭제 · 이름 바꾸기 — 기존 공간의 배치를 그대로 두고 장면을 다시 짠다 (domain/spatial/room-ops.js)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,validateScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene,emptyStudioForm,newStudioRoom,validateStudioForm} from '../web/src/domain/spatial/studio-form.js';
import {nudgeObject} from '../web/src/domain/spatial/object-ops.js';
import {addRoom,removeRoom,updateRoom} from '../web/src/domain/spatial/room-ops.js';

const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const template=createScene({templateId:'cowork-full-standard'},library);
// 사람이 손으로 옮긴 배치가 있는 장면 — 공간을 더해도 그 자리가 남아야 한다
let scene=template,edited=null;
for(const o of template.objects.filter(o=>!o.supportId)){try{scene=nudgeObject(template,o.id,[.3,0],library).scene;edited=o.id;break;}catch{}}
assert(edited);
const form=studioFormFromScene(scene),original=structuredClone(scene),options={documentId:'room-ops-test'};
const ok=s=>assert.deepEqual(validateScene(s,library).errors,[]);
const relative=(s,roomId)=>{const room=s.rooms.find(r=>r.id===roomId);return s.objects.filter(o=>o.roomId===roomId).map(o=>[o.id,o.assetId,Math.round((o.x-room.x)*1000),Math.round((o.z-room.z)*1000),o.rotation,o.elevation,o.supportId||'',JSON.stringify(o.people||null)].join('|')).sort();};

const added=addRoom({scene,form},{kind:'meeting'},library,options);
assert.equal(added.scene.rooms.length,scene.rooms.length+1);assert.equal(added.form.rooms.length,scene.rooms.length+1);
for(const room of scene.rooms){
  const next=added.scene.rooms.find(r=>r.id===room.id);assert(next,room.name);
  assert.equal(next.width,room.width);assert.equal(next.depth,room.depth);assert.equal(next.name,room.name);
  assert.deepEqual(relative(added.scene,room.id),relative(scene,room.id),room.name+' keeps its layout');
}
assert.deepEqual(added.relaid,[]);
const fresh=added.scene.rooms.find(r=>r.id===added.roomId);
assert.equal(fresh.kind,'meeting');assert.equal(fresh.name,'회의실');assert(added.scene.objects.some(o=>o.roomId===fresh.id),'the new room is furnished');
assert.equal(new Set(added.scene.objects.map(o=>o.id)).size,added.scene.objects.length);ok(added.scene);
assert.deepEqual(validateStudioForm(added.form,library,{complete:true}),[]);
assert.equal(added.scene.title,scene.title);assert.equal(added.scene.industry,scene.industry);assert.equal(added.scene.style,scene.style);
assert.deepEqual(scene,original);
console.log('PASS adding a room keeps every existing room, its size and its hand-edited layout');

const second=addRoom({scene:added.scene,form:added.form},{kind:'meeting'},library,options);
assert.equal(second.scene.rooms.find(r=>r.id===second.roomId).name,'회의실 2');
const named=addRoom({scene,form},{kind:'lounge',name:'  임원 라운지  '},library,options);
assert.equal(named.scene.rooms.find(r=>r.id===named.roomId).name,'임원 라운지');
assert.throws(()=>addRoom({scene,form},{kind:'dungeon'},library,options),/용도/);
assert.throws(()=>addRoom({scene,form},{kind:'meeting',name:'가'.repeat(101)},library,options));
console.log('PASS new rooms take the type name, a numbered name when it exists, or the given name; unknown types are rejected');

const industry=library.industries[0].code;
const blank=addRoom({scene:null,form:{...emptyStudioForm(),industry}},{kind:'meeting',name:'대회의실'},library,options);
assert.equal(blank.scene.rooms.length,1);assert.equal(blank.scene.rooms[0].name,'대회의실');assert.equal(blank.scene.industry,industry);assert.equal(blank.form.rooms.length,1);ok(blank.scene);
assert.throws(()=>addRoom({scene:null,form:emptyStudioForm()},{kind:'meeting'},library,options),/업종/);
const full={...emptyStudioForm(),industry,rooms:Array.from({length:30},(_,i)=>({...newStudioRoom('공간 '+(i+1)),kind:'office'}))};
assert.throws(()=>addRoom({scene:null,form:full},{kind:'meeting'},library,options),/30/);
console.log('PASS the first room builds the scene from a blank studio; no industry or a 31st room is rejected');

const victim=scene.rooms[1],removed=removeRoom({scene,form},victim.id,library,options);
assert.equal(removed.scene.rooms.length,scene.rooms.length-1);assert(!removed.scene.rooms.some(r=>r.id===victim.id));
assert(!removed.scene.objects.some(o=>o.roomId===victim.id));assert(!removed.form.rooms.some(r=>r.id===victim.id));
for(const room of scene.rooms.filter(r=>r.id!==victim.id))assert.deepEqual(relative(removed.scene,room.id),relative(scene,room.id),room.name+' keeps its layout');
ok(removed.scene);assert.deepEqual(scene,original);
assert.throws(()=>removeRoom({scene,form},'nowhere',library,options),/공간/);
const last=removeRoom({scene:blank.scene,form:blank.form},blank.roomId,library,options);
assert.equal(last.scene,null);assert.deepEqual(last.form.rooms,[]);assert.equal(last.form.industry,industry);
console.log('PASS removing a room drops only that room and its objects; removing the last room empties the studio');

const renamed=updateRoom({scene,form},victim.id,{name:'대회의실',purpose:'임원 보고'});
assert.equal(renamed.scene.rooms.find(r=>r.id===victim.id).name,'대회의실');assert.equal(renamed.scene.rooms.find(r=>r.id===victim.id).customPurpose,'임원 보고');
assert.equal(renamed.form.rooms.find(r=>r.id===victim.id).name,'대회의실');assert.equal(renamed.form.rooms.find(r=>r.id===victim.id).customPurpose,'임원 보고');
assert.equal(renamed.scene.objects.length,scene.objects.length);ok(renamed.scene);assert.deepEqual(scene,original);
assert.throws(()=>updateRoom({scene,form},victim.id,{name:'  '}));assert.throws(()=>updateRoom({scene,form},victim.id,{}));assert.throws(()=>updateRoom({scene,form},victim.id,{name:'가'.repeat(101)}));
console.log('PASS renaming a room changes the scene and the hidden form together');

// 다시 만들 수 없는 기존 공간이 있어도(그 공간의 자동 배치가 지금 면적에 안 들어가는 템플릿) 공간을 더하고 뺄 수 있다 — 기존 공간은 다시 만들지 않고 그대로 옮긴다
for(const id of ['v-ed_k12-full-compact','v-ed_k_s5-compact']){
  assert(library.templates.some(t=>t.id===id),id);
  const base=createScene({templateId:id},library),input=studioFormFromScene(base);
  const more=addRoom({scene:base,form:input},{kind:'meeting'},library,options);
  assert.equal(more.scene.rooms.length,base.rooms.length+1);for(const room of base.rooms)assert.deepEqual(relative(more.scene,room.id),relative(base,room.id),id+' · '+room.name);ok(more.scene);
  if(base.rooms.length>1){const less=removeRoom({scene:base,form:input},base.rooms[0].id,library,options);assert.equal(less.scene.rooms.length,base.rooms.length-1);ok(less.scene);}
}
console.log('PASS rooms can be added and removed even when an existing room could not be laid out again from scratch');
